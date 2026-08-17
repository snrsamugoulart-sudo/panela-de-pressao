// src/socketHandlers.js
// Camada de transporte: traduz eventos do Socket.IO em chamadas para as
// regras de jogo (game.js / cardEffects.js / minigameRunner.js) e para o
// gerenciamento de salas (rooms.js), depois transmite o novo estado.

const {
  createRoom, getRoom, findPlayerByReconnectToken, updateRoomConfig, clearRoomTimers, scheduleCleanupIfEmpty,
} = require('./rooms');
const { createPlayer } = require('./players');
const {
  ROUND_RESULT_DURATION_MS, PENDING_EFFECT_TIMEOUT_MS,
  startGame, startNewRound, registerVote, allRequiredPlayersVoted, getRequiredVoters,
  getCurrentLeaderIds, closeRound, resolvePendingEffect, buildDefaultChoiceFor,
  getScoreboard, checkGameOver, getPanelaProgress, shouldTriggerMinigame,
} = require('./game');
const { runMinigame, registerMinigameAction } = require('./minigameRunner');
const { addCustomQuestion, removeCustomQuestion } = require('./customQuestions');

const MAX_PLAYERS_PER_ROOM = 12;
const MIN_PLAYERS_TO_START = 2;
const REACTION_COOLDOWN_MS = 1200;
const REACTION_EMOJIS = ['😂', '💀', '😭', '🤨', '👀', '😡', '🤡', '🔥'];
const SNAPSHOT_HISTORY_LIMIT = 3;

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    score: p.score,
    immune: p.immuneNegativeUntilRound === room.roundNumber,
    avatarColor: p.avatarColor,
    avatarEmoji: p.avatarEmoji,
  }));
}

function publicCustomQuestions(room) {
  return room.customQuestions.map((q) => ({ id: q.id, text: q.text, authorName: q.authorName, authorId: q.authorId }));
}

function emitRoomUpdate(io, room) {
  io.to(room.code).emit('room_update', {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    config: room.config,
    players: publicPlayers(room),
    customQuestions: publicCustomQuestions(room),
    voiceParticipants: [...room.voiceParticipants],
  });
}

function emitVoteProgress(io, room, targetSocket) {
  const required = getRequiredVoters(room);
  const votedRequired = required.filter((id) => room.currentRoundVotes.has(id));
  const payload = {
    votedCount: votedRequired.length,
    totalPlayers: required.length,
    votedIds: [...room.currentRoundVotes.keys()],
  };
  (targetSocket || io.to(room.code)).emit('vote_progress', payload);
}

function getSocketForPlayer(io, player) {
  if (!player) return null;
  return io.sockets.sockets.get(player.socketId) || null;
}

// Guarda os últimos eventos "de tela" transmitidos pra sala, pra poder
// reenviá-los só pra quem reconectar no meio da partida (ver rejoin_room).
function pushSnapshot(room, type, payload) {
  if (!room.snapshotHistory) room.snapshotHistory = [];
  room.snapshotHistory.push({ type, payload });
  if (room.snapshotHistory.length > SNAPSHOT_HISTORY_LIMIT) room.snapshotHistory.shift();
}

function broadcastToRoom(io, room, type, payload) {
  io.to(room.code).emit(type, payload);
  pushSnapshot(room, type, payload);
}

function broadcastNewRound(io, room) {
  const card = room.currentCard;
  const leaderIds = getCurrentLeaderIds(room);
  const voteRestriction = card.effect && card.effect.type === 'leader_only_vote'
    ? { type: 'leader_only', leaderIds }
    : { type: 'none', leaderIds: [] };

  const voteDeadline = room.config.voteTimeLimitSec > 0
    ? Date.now() + room.config.voteTimeLimitSec * 1000
    : null;

  broadcastToRoom(io, room, 'new_round', {
    roundNumber: room.roundNumber,
    card,
    players: publicPlayers(room),
    scores: getScoreboard(room),
    voteRestriction,
    voteDeadline,
    voteTimeLimitSec: room.config.voteTimeLimitSec,
    panelaProgress: getPanelaProgress(room),
  });
  emitVoteProgress(io, room);
}

function scheduleVoteTimeoutIfNeeded(io, room) {
  if (room.voteTimeoutHandle) {
    clearTimeout(room.voteTimeoutHandle);
    room.voteTimeoutHandle = null;
  }
  if (!room.config.voteTimeLimitSec) return;

  const cardId = room.currentCard.id;
  const roundNumber = room.roundNumber;

  room.voteTimeoutHandle = setTimeout(() => {
    const current = getRoom(room.code);
    if (!current || current.status !== 'playing') return;
    if (current.roundNumber !== roundNumber || current.currentCard?.id !== cardId) return;
    closeRoundFlow(io, current);
  }, room.config.voteTimeLimitSec * 1000);
}

// Fecha a votação (chamado tanto quando todo mundo já votou quanto quando
// o tempo esgota) e decide se a rodada precisa de uma escolha interativa
// do vencedor ou se já pode ser finalizada.
function closeRoundFlow(io, room) {
  if (room.voteTimeoutHandle) {
    clearTimeout(room.voteTimeoutHandle);
    room.voteTimeoutHandle = null;
  }
  if (room.status !== 'playing') return; // proteção contra fechamento duplicado

  const result = closeRound(room);

  if (result.interactive) {
    broadcastToRoom(io, room, 'round_result', result);
    startPendingEffectFlow(io, room);
    return;
  }

  broadcastToRoom(io, room, 'round_result', result);
  finishRoundAndProceed(io, room);
}

function startPendingEffectFlow(io, room) {
  const pending = room.pendingEffect;
  const card = room.currentCard;
  const winner = room.players.get(pending.winnerId);

  const payload = { type: pending.type, cardText: card.text, timeLimitMs: PENDING_EFFECT_TIMEOUT_MS };
  if (pending.type === 'winner_choice') {
    payload.options = card.effect.options;
  } else if (pending.type === 'winner_curse') {
    payload.eligibleTargets = [...room.players.values()]
      .filter((p) => p.id !== winner.id && p.connected)
      .map((p) => ({ id: p.id, name: p.name }));
  }

  room.lastEffectPrompt = { winnerId: winner.id, payload };

  const winnerSocket = getSocketForPlayer(io, winner);
  if (winnerSocket) winnerSocket.emit('effect_choice_prompt', payload);

  broadcastToRoom(io, room, 'effect_choice_waiting', {
    winnerId: winner.id,
    winnerName: winner.name,
    type: pending.type,
    cardText: card.text,
  });

  room.pendingEffectTimeout = setTimeout(() => {
    const current = getRoom(room.code);
    if (!current || current.status !== 'awaiting_effect') return;
    const auto = buildDefaultChoiceFor(current);
    finalizeEffect(io, current, auto, true);
  }, PENDING_EFFECT_TIMEOUT_MS);
}

function finalizeEffect(io, room, choiceData, wasAutomatic) {
  if (room.pendingEffectTimeout) {
    clearTimeout(room.pendingEffectTimeout);
    room.pendingEffectTimeout = null;
  }

  const resolved = resolvePendingEffect(room, choiceData);
  if (!resolved.ok) return resolved;

  room.lastEffectPrompt = null;

  broadcastToRoom(io, room, 'effect_resolved', {
    outcome: resolved.outcome,
    scores: resolved.scores,
    automatic: wasAutomatic,
    panelaProgress: getPanelaProgress(room),
  });

  finishRoundAndProceed(io, room);
  return resolved;
}

// Depois que a pontuação da rodada já está definitiva: checa vitória; se
// ninguém venceu ainda, agenda a continuação (minigame ou próxima carta).
function finishRoundAndProceed(io, room) {
  const winner = checkGameOver(room);
  if (winner) {
    broadcastToRoom(io, room, 'game_over', { winner, finalScores: getScoreboard(room) });
    return;
  }

  setTimeout(() => {
    const current = getRoom(room.code);
    if (!current || current.status === 'finished') return;
    proceedAfterRound(io, current);
  }, ROUND_RESULT_DURATION_MS);
}

function proceedAfterRound(io, room) {
  if (shouldTriggerMinigame(room)) {
    runMinigame(io, room, {
      checkGameOver,
      onGameOver: (current, winner) => {
        broadcastToRoom(io, current, 'game_over', { winner, finalScores: getScoreboard(current) });
      },
      onDone: (current) => startNextQuestionRound(io, current),
    });
  } else {
    startNextQuestionRound(io, room);
  }
}

function startNextQuestionRound(io, room) {
  startNewRound(room);
  broadcastNewRound(io, room);
  scheduleVoteTimeoutIfNeeded(io, room);
}

// Reenvia pra um socket que acabou de (re)conectar o suficiente pra ele
// "pular" direto pra tela certa, em vez de cair na tela inicial.
function sendCatchUpState(io, socket, room) {
  if (room.status === 'lobby') return; // room_update já é o bastante

  const history = room.snapshotHistory || [];
  history.forEach(({ type, payload }) => socket.emit(type, payload));

  if (room.status === 'playing') {
    emitVoteProgress(io, room, socket);
  }

  if (room.status === 'awaiting_effect' && room.lastEffectPrompt?.winnerId === socket.data.playerId) {
    socket.emit('effect_choice_prompt', room.lastEffectPrompt.payload);
  }
}

function registerSocketHandlers(io, socket) {
  socket.on('create_room', ({ playerName, config, avatar } = {}, callback) => {
    try {
      const room = createRoom(socket.id, playerName, config, avatar);
      const hostPlayer = room.players.get(room.hostId);

      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = hostPlayer.id;

      callback?.({
        ok: true, roomCode: room.code, playerId: hostPlayer.id, reconnectToken: hostPlayer.reconnectToken,
      });
      emitRoomUpdate(io, room);
    } catch (err) {
      callback?.({ ok: false, error: 'Não foi possível criar a sala. Tente novamente.' });
    }
  });

  socket.on('join_room', ({ roomCode, playerName, avatar } = {}, callback) => {
    const room = getRoom(roomCode);

    if (!room) return callback?.({ ok: false, error: 'Sala não encontrada. Confira o código.' });
    if (room.status !== 'lobby') {
      return callback?.({ ok: false, error: 'Essa partida já começou. Peça um novo código ao anfitrião.' });
    }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      return callback?.({ ok: false, error: 'Essa sala já está cheia.' });
    }

    const player = createPlayer(socket.id, playerName, avatar);
    room.players.set(player.id, player);

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;

    callback?.({ ok: true, roomCode: room.code, playerId: player.id, reconnectToken: player.reconnectToken });
    emitRoomUpdate(io, room);
  });

  // Tentativa de retomar uma sessão existente (refresh de página, queda de
  // conexão) usando o token guardado no localStorage do navegador.
  socket.on('rejoin_room', ({ roomCode, reconnectToken } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback?.({ ok: false, error: 'Sala não encontrada.' });

    const player = findPlayerByReconnectToken(room, reconnectToken);
    if (!player) return callback?.({ ok: false, error: 'Sessão não encontrada nesta sala.' });

    player.socketId = socket.id;
    player.connected = true;

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;

    callback?.({
      ok: true, roomCode: room.code, playerId: player.id, reconnectToken: player.reconnectToken, status: room.status,
    });
    emitRoomUpdate(io, room);
    sendCatchUpState(io, socket, room);
  });

  socket.on('update_config', ({ roomCode, config } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return;
    if (room.status !== 'lobby') return; // só pode configurar antes de iniciar

    updateRoomConfig(room, config || {});
    emitRoomUpdate(io, room);
  });

  socket.on('submit_custom_question', ({ roomCode, text } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback?.({ ok: false, error: 'Sala não encontrada.' });
    if (room.status !== 'lobby') return callback?.({ ok: false, error: 'Só dá pra sugerir perguntas antes de começar.' });

    const playerId = socket.data.playerId;
    const player = room.players.get(playerId);
    if (!player) return callback?.({ ok: false, error: 'Jogador não encontrado.' });

    const result = addCustomQuestion(room, playerId, player.name, text);
    if (!result.ok) return callback?.(result);

    callback?.({ ok: true, question: result.question });
    emitRoomUpdate(io, room);
  });

  socket.on('remove_custom_question', ({ roomCode, questionId } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback?.({ ok: false, error: 'Sala não encontrada.' });
    if (room.status !== 'lobby') return callback?.({ ok: false, error: 'Só dá pra remover perguntas antes de começar.' });

    const isHost = socket.data.playerId === room.hostId;
    const result = removeCustomQuestion(room, questionId, socket.data.playerId, isHost);
    if (!result.ok) return callback?.(result);

    callback?.({ ok: true });
    emitRoomUpdate(io, room);
  });

  socket.on('send_reaction', ({ roomCode, emoji } = {}) => {
    const room = getRoom(roomCode);
    if (!room || !REACTION_EMOJIS.includes(emoji)) return;

    const playerId = socket.data.playerId;
    if (!room.players.has(playerId)) return;

    const last = room.reactionCooldowns.get(playerId);
    if (last && Date.now() - last < REACTION_COOLDOWN_MS) return;
    room.reactionCooldowns.set(playerId, Date.now());

    io.to(room.code).emit('reaction', { playerId, emoji });
  });

  // ---- Chat de voz (WebRTC): o servidor NUNCA vê o áudio, só retransmite
  // as mensagens de sinalização entre os navegadores dos jogadores. ----

  socket.on('voice_join', ({ roomCode } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback?.({ ok: false, error: 'Sala não encontrada.' });

    const playerId = socket.data.playerId;
    if (!room.players.has(playerId)) return callback?.({ ok: false, error: 'Jogador não encontrado.' });

    const existingParticipants = [...room.voiceParticipants].filter((id) => id !== playerId);
    room.voiceParticipants.add(playerId);

    callback?.({ ok: true, participantIds: existingParticipants });
    io.to(room.code).emit('voice_participants_update', { participantIds: [...room.voiceParticipants] });

    // Avisa quem já estava no chat de voz que tem gente nova, pra cada um
    // deles iniciar uma conexão (oferta) com o recém-chegado.
    existingParticipants.forEach((pid) => {
      const s = getSocketForPlayer(io, room.players.get(pid));
      if (s) s.emit('voice_peer_joined', { peerId: playerId });
    });
  });

  socket.on('voice_leave', ({ roomCode } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;
    leaveVoiceChat(io, room, socket.data.playerId);
  });

  socket.on('voice_signal', ({ roomCode, targetPlayerId, data } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const fromPlayerId = socket.data.playerId;
    if (!room.players.has(fromPlayerId) || !room.players.has(targetPlayerId)) return;

    const targetSocket = getSocketForPlayer(io, room.players.get(targetPlayerId));
    if (targetSocket) targetSocket.emit('voice_signal', { fromPlayerId, data });
  });

  socket.on('voice_mute_state', ({ roomCode, muted } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const playerId = socket.data.playerId;
    if (!room.players.has(playerId)) return;

    io.to(room.code).emit('voice_mute_state', { playerId, muted: !!muted });
  });

  socket.on('start_game', ({ roomCode } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return;

    if (room.players.size < MIN_PLAYERS_TO_START) {
      socket.emit('error_message', {
        message: `É preciso pelo menos ${MIN_PLAYERS_TO_START} jogadores para começar.`,
      });
      return;
    }

    room.snapshotHistory = [];
    startGame(room);
    broadcastNewRound(io, room);
    scheduleVoteTimeoutIfNeeded(io, room);
  });

  socket.on('submit_vote', ({ roomCode, votedForId } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const result = registerVote(room, socket.data.playerId, votedForId);
    if (!result.ok) return socket.emit('error_message', { message: result.error });

    emitVoteProgress(io, room);
    if (allRequiredPlayersVoted(room)) {
      closeRoundFlow(io, room);
    }
  });

  socket.on('submit_card_choice', (data = {}) => {
    const room = getRoom(data.roomCode);
    if (!room) return;
    if (room.status !== 'awaiting_effect' || !room.pendingEffect) return;
    if (socket.data.playerId !== room.pendingEffect.winnerId) {
      socket.emit('error_message', { message: 'Só quem venceu a rodada pode fazer essa escolha.' });
      return;
    }

    const resolved = finalizeEffect(io, room, data, false);
    if (!resolved.ok) {
      socket.emit('error_message', { message: resolved.error });
    }
  });

  socket.on('minigame_action', (data = {}) => {
    const room = getRoom(data.roomCode);
    if (!room || room.status !== 'minigame') return;
    registerMinigameAction(room, socket.data.playerId, data.targetIndex);
  });

  socket.on('play_again', ({ roomCode } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return;

    clearRoomTimers(room);
    room.status = 'lobby';
    room.roundNumber = 0;
    room.usedCardIds.clear();
    room.currentCard = null;
    room.currentRoundVotes = new Map();
    room.pendingEffect = null;
    room.minigameState = null;
    room.snapshotHistory = [];
    room.lastEffectPrompt = null;
    room.players.forEach((p) => {
      p.score = 0;
      p.immuneNegativeUntilRound = null;
    });

    emitRoomUpdate(io, room);
  });

  socket.on('leave_room', () => handleDisconnect(io, socket));
  socket.on('disconnect', () => handleDisconnect(io, socket));
}

function leaveVoiceChat(io, room, playerId) {
  if (!room.voiceParticipants.has(playerId)) return;
  room.voiceParticipants.delete(playerId);

  io.to(room.code).emit('voice_participants_update', { participantIds: [...room.voiceParticipants] });

  // Avisa quem ainda está no chat de voz pra encerrar a conexão com quem saiu.
  room.voiceParticipants.forEach((pid) => {
    const s = getSocketForPlayer(io, room.players.get(pid));
    if (s) s.emit('voice_peer_left', { peerId: playerId });
  });
}

function handleDisconnect(io, socket) {
  const { roomCode, playerId } = socket.data || {};
  if (!roomCode) return;

  const room = getRoom(roomCode);
  if (!room) return;

  leaveVoiceChat(io, room, playerId);

  const player = room.players.get(playerId);
  if (player) player.connected = false;

  // No lobby não faz sentido manter "fantasmas": remove de fato. Uma vez
  // que a partida já começou, o registro fica guardado (só marcado como
  // offline) pra permitir reconexão via rejoin_room.
  if (room.status === 'lobby' && player) {
    room.players.delete(playerId);
  }

  // Migração de anfitrião: sempre que o host sai, outro conectado assume —
  // em qualquer fase da partida, não só no lobby.
  if (playerId === room.hostId) {
    const nextHost = [...room.players.values()].find((p) => p.connected);
    if (nextHost) room.hostId = nextHost.id;
  }

  emitRoomUpdate(io, room);

  if (room.status === 'playing') {
    emitVoteProgress(io, room);
    if (allRequiredPlayersVoted(room)) {
      closeRoundFlow(io, room);
    }
  }

  scheduleCleanupIfEmpty(room);
}

module.exports = { registerSocketHandlers, REACTION_EMOJIS };
