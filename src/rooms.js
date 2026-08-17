// src/rooms.js
// Gerenciamento das salas de jogo. Mantém o estado em memória do processo
// (adequado para um protótipo com uma única instância de servidor).

const { createPlayer } = require('./players');
const { buildRoomConfig } = require('./roomConfig');

// code -> room
const rooms = new Map();

// Sem caracteres ambíguos (0/O, 1/I) para facilitar digitar o código.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutos

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createRoom(hostSocketId, hostName, configInput, avatar) {
  const code = generateRoomCode();
  const hostPlayer = createPlayer(hostSocketId, hostName, avatar);
  const config = buildRoomConfig(configInput || {});

  const room = {
    code,
    hostId: hostPlayer.id,
    players: new Map([[hostPlayer.id, hostPlayer]]),
    status: 'lobby', // lobby | playing | awaiting_effect | reveal | minigame | finished
    config,
    usedCardIds: new Set(),
    currentCard: null,
    currentRoundVotes: new Map(), // voterId -> votedForId
    roundNumber: 0,
    pendingEffect: null, // { type, winnerId, startedAt }
    pendingEffectTimeout: null,
    voteTimeoutHandle: null,
    minigameState: null, // { type, actions: Map<playerId, timestamp[]>, crownAppearedAt, holderId, holderInterval }
    // Perguntas da Galera: enviadas pelos próprios jogadores da sala.
    customQuestions: [], // { id, text, authorName, authorId }
    customQuestionRateLimits: new Map(), // playerId -> timestamp do último envio
    // Reações rápidas (emoji flutuante): cooldown simples anti-spam.
    reactionCooldowns: new Map(), // playerId -> timestamp da última reação
    // Chat de voz (WebRTC): o servidor só sabe QUEM está no chat de voz.
    // O áudio em si nunca passa pelo servidor — ele só retransmite as
    // mensagens de sinalização (ofertas/respostas/candidatos ICE) entre
    // os navegadores dos jogadores (ver 'voice_signal' em socketHandlers.js).
    voiceParticipants: new Set(), // playerId de quem está conectado ao chat de voz
    // Guardado pra permitir que um jogador que reconecta receba de volta
    // exatamente a última coisa que a sala transmitiu (ver rejoin_room).
    lastSnapshot: null, // { type: 'new_round'|'round_result'|'minigame_start'|'game_over', payload }
    lastEffectPrompt: null, // { winnerId, payload } — reenviado só pro próprio vencedor
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  if (!code) return undefined;
  return rooms.get(code.toString().toUpperCase());
}

function findPlayerByReconnectToken(room, token) {
  if (!token) return null;
  return [...room.players.values()].find((p) => p.reconnectToken === token) || null;
}

function updateRoomConfig(room, configInput) {
  room.config = buildRoomConfig(configInput || {}, room.config);
  return room.config;
}

function clearRoomTimers(room) {
  if (room.voteTimeoutHandle) clearTimeout(room.voteTimeoutHandle);
  if (room.pendingEffectTimeout) clearTimeout(room.pendingEffectTimeout);
  if (room.minigameState?.holderInterval) clearInterval(room.minigameState.holderInterval);
  room.voteTimeoutHandle = null;
  room.pendingEffectTimeout = null;
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (room) clearRoomTimers(room);
  rooms.delete(code);
}

// Agenda a remoção de uma sala se, depois de um tempo, ninguém tiver voltado.
function scheduleCleanupIfEmpty(room) {
  const anyoneConnected = [...room.players.values()].some((p) => p.connected);
  if (anyoneConnected) return;

  setTimeout(() => {
    const current = rooms.get(room.code);
    if (!current) return;
    const stillEmpty = [...current.players.values()].every((p) => !p.connected);
    if (stillEmpty) deleteRoom(room.code);
  }, EMPTY_ROOM_TTL_MS);
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  findPlayerByReconnectToken,
  updateRoomConfig,
  deleteRoom,
  clearRoomTimers,
  scheduleCleanupIfEmpty,
};
