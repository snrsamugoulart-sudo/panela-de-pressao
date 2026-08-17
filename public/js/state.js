// public/js/state.js
// Estado simples e compartilhado entre os módulos de tela do front-end.
// Não há framework aqui de propósito: para um protótipo, um objeto
// simples + funções de renderização já deixam o fluxo fácil de seguir.

export const state = {
  socket: null,
  playerId: null,
  playerName: '',
  roomCode: null,
  hostId: null,
  players: [],
  config: null,
  currentCard: null,
  voteDeadlineTimer: null,
  resultCountdownTimer: null,
  avatarColor: null,
  avatarEmoji: null,
  reconnectToken: null,
};

const RECONNECT_PREFIX = 'panela-de-pressao:reconnect:';

export function saveReconnectInfo(roomCode, playerId, reconnectToken) {
  try {
    localStorage.setItem(RECONNECT_PREFIX + roomCode, JSON.stringify({ playerId, reconnectToken }));
  } catch {
    // localStorage indisponível (modo privado, etc.) — sem problema, só não reconecta sozinho.
  }
}

export function loadReconnectInfo(roomCode) {
  try {
    const raw = localStorage.getItem(RECONNECT_PREFIX + roomCode);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
