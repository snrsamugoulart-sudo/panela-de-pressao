// src/players.js
// Tudo relacionado à modelagem de um jogador individual.

const { randomUUID } = require('crypto');

const MAX_NAME_LENGTH = 18;

const AVATAR_COLORS = ['#ff3d81', '#9b5cff', '#ffd23f', '#35d488', '#3fd6ff', '#ff8a2b'];
const AVATAR_EMOJIS = ['😎', '🤡', '👻', '🐸', '🦄', '🐙', '🤖', '👽', '🐵', '🦊', '🐼', '🧟'];
const DEFAULT_AVATAR_EMOJI = '😎';
const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0];

function sanitizeName(rawName) {
  const clean = (rawName || '').toString().trim().slice(0, MAX_NAME_LENGTH);
  return clean.length > 0 ? clean : 'Jogador';
}

function sanitizeAvatarColor(rawColor) {
  return AVATAR_COLORS.includes(rawColor) ? rawColor : DEFAULT_AVATAR_COLOR;
}

function sanitizeAvatarEmoji(rawEmoji) {
  return AVATAR_EMOJIS.includes(rawEmoji) ? rawEmoji : DEFAULT_AVATAR_EMOJI;
}

function createPlayer(socketId, name, avatar = {}) {
  return {
    id: randomUUID(),
    socketId,
    name: sanitizeName(name),
    connected: true,
    score: 0,
    // Rodada até a qual este jogador está imune a efeitos negativos de
    // outras cartas (ex: Ganância dando imunidade). null = sem imunidade.
    immuneNegativeUntilRound: null,
    avatarColor: sanitizeAvatarColor(avatar.color),
    avatarEmoji: sanitizeAvatarEmoji(avatar.emoji),
    // Token secreto (nunca exposto a outros jogadores) usado só pra essa
    // pessoa conseguir retomar a própria sessão depois de um refresh/queda.
    reconnectToken: randomUUID(),
  };
}

module.exports = {
  createPlayer,
  sanitizeName,
  sanitizeAvatarColor,
  sanitizeAvatarEmoji,
  MAX_NAME_LENGTH,
  AVATAR_COLORS,
  AVATAR_EMOJIS,
};
