// src/roomConfig.js
// Define os modos de jogo e os valores de configuração válidos para uma
// sala. Mantém tudo centralizado para não espalhar "if (mode === ...)"
// pelo resto do código.

const MODES = ['basico', 'caotico', 'sem-filtro'];
const WIN_SCORES = [3, 5, 7, 10];
const MINIGAME_INTERVALS = [0, 3, 5, 7, 10, 'random']; // 'random' = chance a cada rodada
const VOTE_TIME_LIMITS = [0, 10, 15, 20, 30, 60]; // 0 = sem limite
const SPECIAL_FREQUENCIES = ['off', 'poucas', 'normal', 'muitas'];
const PRESSURE_LEVELS = ['off', 'normal', 'alta'];

// Cada modo define de qual pacote de cartas ele puxa e quais são os
// valores padrão de configuração ao selecioná-lo. O host ainda pode
// ajustar cada campo individualmente depois de escolher o modo.
const MODE_DEFAULTS = {
  basico: {
    pack: 'padrao',
    specialCardsFrequency: 'off',
    minigameInterval: 0,
    voteTimeLimitSec: 0,
    winScore: 5,
    pressureLevel: 'off',
    customQuestionsEnabled: false,
  },
  caotico: {
    pack: 'padrao',
    specialCardsFrequency: 'normal',
    minigameInterval: 5,
    voteTimeLimitSec: 30,
    winScore: 5,
    pressureLevel: 'normal',
    customQuestionsEnabled: false,
  },
  'sem-filtro': {
    pack: 'sem-filtro',
    specialCardsFrequency: 'normal',
    minigameInterval: 5,
    voteTimeLimitSec: 30,
    winScore: 5,
    pressureLevel: 'normal',
    customQuestionsEnabled: false,
  },
};

function isValid(list, value) {
  return list.includes(value);
}

// Monta uma configuração de sala válida a partir de uma entrada parcial
// (o que veio do cliente), preenchendo qualquer campo ausente ou inválido
// com o padrão do modo selecionado (ou o valor anterior, se o modo não mudou).
function buildRoomConfig(input = {}, previousConfig = null) {
  const mode = MODES.includes(input.mode) ? input.mode : (previousConfig?.mode || 'caotico');
  const defaults = MODE_DEFAULTS[mode];
  const base = previousConfig && previousConfig.mode === mode ? previousConfig : defaults;

  const winScore = isValid(WIN_SCORES, input.winScore) ? input.winScore : base.winScore;
  const specialCardsFrequency = isValid(SPECIAL_FREQUENCIES, input.specialCardsFrequency)
    ? input.specialCardsFrequency
    : base.specialCardsFrequency;
  const minigameInterval = isValid(MINIGAME_INTERVALS, input.minigameInterval)
    ? input.minigameInterval
    : base.minigameInterval;
  const voteTimeLimitSec = isValid(VOTE_TIME_LIMITS, input.voteTimeLimitSec)
    ? input.voteTimeLimitSec
    : base.voteTimeLimitSec;
  const pressureLevel = isValid(PRESSURE_LEVELS, input.pressureLevel) ? input.pressureLevel : base.pressureLevel;
  const customQuestionsEnabled = typeof input.customQuestionsEnabled === 'boolean'
    ? input.customQuestionsEnabled
    : base.customQuestionsEnabled;

  return {
    mode,
    pack: defaults.pack, // o pacote de cartas é sempre determinado pelo modo
    winScore,
    specialCardsFrequency,
    minigameInterval,
    voteTimeLimitSec,
    pressureLevel,
    customQuestionsEnabled,
  };
}

module.exports = {
  MODES,
  WIN_SCORES,
  MINIGAME_INTERVALS,
  VOTE_TIME_LIMITS,
  SPECIAL_FREQUENCIES,
  PRESSURE_LEVELS,
  MODE_DEFAULTS,
  buildRoomConfig,
};
