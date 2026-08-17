// src/game.js
// Regras da partida: iniciar/avançar rodadas, sortear cartas, registrar
// votos (respeitando restrições de efeito), apurar resultado, aplicar
// pontuação/efeitos (incluindo o bônus de Pressão) e checar vitória.
//
// Este módulo não conhece Socket.IO nem HTTP — ele só manipula o objeto
// `room`. A orquestração de rede (timers, emissões) fica em
// socketHandlers.js / minigameRunner.js.

const { getRandomCard } = require('./content');
const {
  isInteractiveEffect,
  getEligibleTargets,
  applyRoundScoring,
  resolveWinnerChoice,
  resolveWinnerCurse,
  buildDefaultChoice,
} = require('./cardEffects');
const { computePressureLevel, getPressureInfo } = require('./pressure');

const ROUND_RESULT_DURATION_MS = 6000; // tempo mostrando o resultado antes de avançar
const PENDING_EFFECT_TIMEOUT_MS = 20000; // tempo máximo pro vencedor decidir uma carta interativa
const RANDOM_MINIGAME_CHANCE = 0.22; // usado quando minigameInterval === 'random'

function startGame(room) {
  room.status = 'playing';
  room.roundNumber = 0;
  room.usedCardIds.clear();
  room.players.forEach((p) => {
    p.score = 0;
    p.immuneNegativeUntilRound = null;
  });
  return startNewRound(room);
}

function startNewRound(room) {
  room.roundNumber += 1;
  room.currentRoundVotes = new Map();
  room.status = 'playing';
  room.pendingEffect = null;

  const card = getRandomCard(
    room.config.pack,
    room.usedCardIds,
    room.config.specialCardsFrequency,
    room.customQuestions
  );
  room.usedCardIds.add(card.id);
  room.currentCard = card;

  return card;
}

function connectedPlayerIds(room) {
  return [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
}

function getCurrentLeaderIds(room) {
  const scoreboard = getScoreboard(room);
  if (scoreboard.length === 0) return [];
  const max = scoreboard[0].score;
  return scoreboard.filter((s) => s.score === max).map((s) => s.id);
}

// Alvos válidos de voto para um jogador específico nesta rodada.
function getEligibleTargetsForVoter(room, voterId) {
  const effect = room.currentCard?.effect || null;
  return getEligibleTargets(effect, connectedPlayerIds(room), voterId, getCurrentLeaderIds(room));
}

// Jogadores que PRECISAM votar para a rodada fechar: conectados e que
// tenham ao menos um alvo elegível (ex: numa carta "só vale votar no
// líder", quem não tem ninguém elegível para votar fica dispensado).
function getRequiredVoters(room) {
  return connectedPlayerIds(room).filter((id) => getEligibleTargetsForVoter(room, id).length > 0);
}

function registerVote(room, voterId, votedForId) {
  if (room.status !== 'playing') {
    return { ok: false, error: 'A votação desta rodada já foi encerrada.' };
  }
  if (!voterId || !room.players.has(voterId)) {
    return { ok: false, error: 'Jogador não encontrado na sala.' };
  }
  if (!votedForId || !room.players.has(votedForId)) {
    return { ok: false, error: 'Escolha inválida.' };
  }
  if (voterId === votedForId) {
    return { ok: false, error: 'Você não pode votar em si mesmo.' };
  }
  if (room.currentRoundVotes.has(voterId)) {
    return { ok: false, error: 'Você já votou nesta rodada.' };
  }

  const eligible = getEligibleTargetsForVoter(room, voterId);
  if (!eligible.includes(votedForId)) {
    return { ok: false, error: 'Nesta rodada só é permitido votar no líder da partida.' };
  }

  room.currentRoundVotes.set(voterId, votedForId);
  return { ok: true };
}

function allRequiredPlayersVoted(room) {
  const required = getRequiredVoters(room);
  return required.length > 0 && required.every((id) => room.currentRoundVotes.has(id));
}

// Fecha a votação da rodada: apura os votos e, dependendo da carta,
// aplica a pontuação na hora OU marca a rodada como aguardando a escolha
// interativa do vencedor.
function closeRound(room) {
  const card = room.currentCard;

  // Precisa ser capturado ANTES de aplicar a pontuação desta rodada: é o
  // "quem era líder antes desse resultado" usado pelo bônus de Pressão.
  const preRoundLeaderIds = getCurrentLeaderIds(room);
  const pressureEnabled = room.config.pressureLevel !== 'off';
  const pressureLevel = pressureEnabled ? computePressureLevel(getScoreboard(room), room.config.winScore) : 0;

  const voteCounts = new Map();
  room.players.forEach((p) => voteCounts.set(p.id, 0));
  room.currentRoundVotes.forEach((votedForId) => {
    voteCounts.set(votedForId, (voteCounts.get(votedForId) || 0) + 1);
  });

  let maxVotes = 0;
  voteCounts.forEach((count) => { if (count > maxVotes) maxVotes = count; });

  const winnerIds = [];
  if (maxVotes > 0) {
    voteCounts.forEach((count, playerId) => {
      if (count === maxVotes) winnerIds.push(playerId);
    });
  }

  const votesDetail = [...room.players.values()]
    .map((p) => ({ playerId: p.id, name: p.name, voteCount: voteCounts.get(p.id) || 0 }))
    .sort((a, b) => b.voteCount - a.voteCount);

  const votesCast = [...room.currentRoundVotes.entries()].map(([voterId, votedForId]) => ({
    voterId,
    voterName: room.players.get(voterId)?.name,
    votedForId,
    votedForName: room.players.get(votedForId)?.name,
  }));

  const base = {
    roundNumber: room.roundNumber,
    card,
    votesDetail,
    votesCast,
    winners: winnerIds,
    maxVotes,
  };

  const effect = card.effect || { type: 'none' };
  const interactive = isInteractiveEffect(effect) && winnerIds.length === 1;

  if (interactive) {
    room.status = 'awaiting_effect';
    room.pendingEffect = { type: effect.type, winnerId: winnerIds[0], startedAt: Date.now() };
    return {
      ...base,
      interactive: true,
      pendingEffect: {
        type: effect.type,
        winnerId: winnerIds[0],
        options: effect.options || null,
      },
      scores: getScoreboard(room),
      pressure: getPressureInfo(getScoreboard(room), room.config.winScore, pressureEnabled),
    };
  }

  const scoreChanges = applyRoundScoring(room, card, winnerIds, preRoundLeaderIds, pressureLevel);
  room.status = 'reveal';
  return {
    ...base,
    interactive: false,
    scoreChanges,
    scores: getScoreboard(room),
    pressure: getPressureInfo(getScoreboard(room), room.config.winScore, pressureEnabled),
  };
}

// Resolve a escolha interativa do vencedor (Ganância / Vingança), seja
// porque ele respondeu, seja porque o tempo esgotou e um padrão foi usado.
function resolvePendingEffect(room, choiceData) {
  const pending = room.pendingEffect;
  if (!pending) return { ok: false, error: 'Não há nenhuma escolha pendente nesta rodada.' };

  let outcome;
  if (pending.type === 'winner_choice') {
    outcome = resolveWinnerChoice(room, pending.winnerId, choiceData.choiceKey);
  } else if (pending.type === 'winner_curse') {
    outcome = resolveWinnerCurse(room, pending.winnerId, choiceData.targetPlayerId, choiceData.sign);
  } else {
    outcome = { ok: false, error: 'Tipo de efeito desconhecido.' };
  }

  if (!outcome.ok) return outcome;

  room.pendingEffect = null;
  room.status = 'reveal';
  const pressureEnabled = room.config.pressureLevel !== 'off';
  return {
    ok: true,
    outcome,
    scores: getScoreboard(room),
    pressure: getPressureInfo(getScoreboard(room), room.config.winScore, pressureEnabled),
  };
}

function buildDefaultChoiceFor(room) {
  return buildDefaultChoice(room);
}

function getScoreboard(room) {
  return [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }))
    .sort((a, b) => b.score - a.score);
}

function checkGameOver(room) {
  const scoreboard = getScoreboard(room);
  const topPlayer = scoreboard[0];
  if (topPlayer && topPlayer.score >= room.config.winScore) {
    room.status = 'finished';
    return topPlayer;
  }
  return null;
}

// "Panela esquentando": indicador puramente visual de progresso da
// partida, baseado em quão perto o líder está da pontuação de vitória.
function getPanelaProgress(room) {
  const scoreboard = getScoreboard(room);
  const topScore = scoreboard[0]?.score || 0;
  return Math.min(100, Math.round((topScore / room.config.winScore) * 100));
}

function shouldTriggerMinigame(room) {
  const interval = room.config.minigameInterval;
  if (!interval || room.roundNumber <= 0) return false;
  if (interval === 'random') return room.roundNumber >= 2 && Math.random() < RANDOM_MINIGAME_CHANCE;
  return room.roundNumber % interval === 0;
}

module.exports = {
  ROUND_RESULT_DURATION_MS,
  PENDING_EFFECT_TIMEOUT_MS,
  startGame,
  startNewRound,
  registerVote,
  allRequiredPlayersVoted,
  getRequiredVoters,
  getEligibleTargetsForVoter,
  getCurrentLeaderIds,
  closeRound,
  resolvePendingEffect,
  buildDefaultChoiceFor,
  getScoreboard,
  checkGameOver,
  getPanelaProgress,
  shouldTriggerMinigame,
};
