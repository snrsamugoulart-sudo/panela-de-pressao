// src/minigames.js
// Definição dos minigames e a lógica pura para resolver o vencedor de
// cada um a partir das ações recebidas. Não conhece Socket.IO — apenas
// recebe os dados já coletados e devolve quem pontuou.
//
// Os 6 minigames usam 3 "motores" de resolução reaproveitados com
// apresentações diferentes (isso é intencional: um motor de corrida por
// clique, um de contagem de cliques, e um de "não faça nada" — em vez de
// seis mecânicas totalmente distintas, o que exigiria simulação de
// física/movimento fora do escopo de um protótipo web confiável).

const MINIGAME_TYPES = ['coroa', 'alvo-certo', 'dedo-nervoso', 'tiro-ao-alvo', 'nao-clique', 'batata-quente'];

const MINIGAME_META = {
  'coroa': {
    label: 'Pegue a Coroa',
    description: 'Uma coroa vai aparecer em um lugar aleatório da tela. Seja o primeiro a tocar nela!',
    engine: 'race',
    introDelayRangeMs: [1500, 4000],
    windowMs: 4000,
  },
  'alvo-certo': {
    label: 'Alvo Certo',
    description: 'Vários alvos aparecem, só um é o certo. Ache-o antes de todo mundo!',
    engine: 'race',
    introDelayRangeMs: [0, 0],
    windowMs: 5000,
    targetCount: 4,
  },
  'dedo-nervoso': {
    label: 'Dedo Nervoso',
    description: 'Toque o mais rápido que conseguir no botão antes do tempo acabar!',
    engine: 'mash',
    introDelayRangeMs: [0, 0],
    windowMs: 5000,
  },
  'tiro-ao-alvo': {
    label: 'Tiro ao Alvo',
    description: 'Acerte o alvo o máximo de vezes que conseguir antes do tempo acabar!',
    engine: 'mash',
    introDelayRangeMs: [0, 0],
    windowMs: 5000,
  },
  'nao-clique': {
    label: 'Não Clique',
    description: 'NÃO toque no botão. Quem resistir concorre a um ponto bônus.',
    engine: 'restraint',
    introDelayRangeMs: [0, 0],
    windowMs: 6000,
  },
  'batata-quente': {
    label: 'Batata Quente',
    description: 'A batata passa de mão em mão sozinha. Quando o tempo acabar, quem estiver com ela perde 1 ponto!',
    engine: 'hot-potato',
    introDelayRangeMs: [0, 0],
    windowMs: 7000,
    passIntervalMs: 700,
  },
};

function pickRandomMinigameType() {
  return MINIGAME_TYPES[Math.floor(Math.random() * MINIGAME_TYPES.length)];
}

// actionsByPlayer: Map<playerId, number[]> (timestamps de ação válida)
// connectedPlayerIds: string[]
// extra: { appearedAt?, holderId? } — dados específicos de cada minigame
function resolveMinigame(type, actionsByPlayer, connectedPlayerIds, extra = {}) {
  const meta = MINIGAME_META[type];
  const engine = meta ? meta.engine : null;

  if (engine === 'race') {
    // Vence quem tiver a ação (clique) mais antiga, desde que tenha
    // acontecido depois do alvo aparecer (quando aplicável).
    let winnerId = null;
    let earliest = Infinity;
    actionsByPlayer.forEach((timestamps, playerId) => {
      const validClicks = timestamps.filter((t) => extra.appearedAt == null || t >= extra.appearedAt);
      if (validClicks.length === 0) return;
      const first = Math.min(...validClicks);
      if (first < earliest) {
        earliest = first;
        winnerId = playerId;
      }
    });
    const winners = winnerId ? [winnerId] : [];
    return {
      winners,
      scoreChanges: winners.map((id) => ({ playerId: id, delta: 1 })),
      narrative: winnerId ? 'Foi o mais rápido no gatilho!' : 'Ninguém acertou a tempo.',
    };
  }

  if (engine === 'mash') {
    let maxClicks = 0;
    const counts = new Map();
    actionsByPlayer.forEach((timestamps, playerId) => {
      counts.set(playerId, timestamps.length);
      if (timestamps.length > maxClicks) maxClicks = timestamps.length;
    });
    const winners = maxClicks > 0
      ? [...counts.entries()].filter(([, count]) => count === maxClicks).map(([id]) => id)
      : [];
    return {
      winners,
      scoreChanges: winners.map((id) => ({ playerId: id, delta: 1 })),
      narrative: winners.length > 0 ? `Cliques máximos: ${maxClicks}` : 'Ninguém clicou a tempo.',
    };
  }

  if (engine === 'restraint') {
    const clickedIds = new Set([...actionsByPlayer.keys()].filter((id) => actionsByPlayer.get(id).length > 0));
    const nonClicked = connectedPlayerIds.filter((id) => !clickedIds.has(id));
    if (nonClicked.length === 0) {
      return { winners: [], scoreChanges: [], narrative: 'Todo mundo clicou! Ninguém resistiu.' };
    }
    const winnerId = nonClicked[Math.floor(Math.random() * nonClicked.length)];
    return {
      winners: [winnerId],
      scoreChanges: [{ playerId: winnerId, delta: 1 }],
      narrative: 'Resistiu à tentação e foi sorteado entre quem não clicou!',
    };
  }

  if (engine === 'hot-potato') {
    const holderId = extra.holderId;
    if (!holderId || !connectedPlayerIds.includes(holderId)) {
      return { winners: [], scoreChanges: [], narrative: 'A batata sumiu no caos (ninguém foi penalizado).' };
    }
    return {
      winners: [],
      scoreChanges: [{ playerId: holderId, delta: -1 }],
      narrative: 'Ficou com a batata na mão quando o tempo acabou!',
      loserId: holderId,
    };
  }

  return { winners: [], scoreChanges: [], narrative: '' };
}

module.exports = { MINIGAME_TYPES, MINIGAME_META, pickRandomMinigameType, resolveMinigame };
