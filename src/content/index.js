// src/content/index.js
// Ponto único de acesso aos pacotes de cartas. Sabe sortear uma carta
// respeitando: pacote do modo, frequência de cartas especiais configurada
// pelo host, perguntas personalizadas da sala ("Perguntas da Galera") e
// evitando repetir cartas já usadas na partida (reiniciando quando o
// conteúdo se esgota).

const packPadrao = require('./packPadrao');
const packSemFiltro = require('./packSemFiltro');

const PACKS = {
  padrao: packPadrao,
  'sem-filtro': packSemFiltro,
};

// Pesos relativos de sorteio por raridade, por nível de frequência
// escolhido no lobby. Não significa "% exata" — é só o peso relativo
// entre si. 'off' zera tudo que não for comum.
const WEIGHTS_BY_FREQUENCY = {
  off: { comum: 100, especial: 0, caos: 0, lendaria: 0 },
  poucas: { comum: 80, especial: 14, caos: 4, lendaria: 2 },
  normal: { comum: 65, especial: 22, caos: 9, lendaria: 4 },
  muitas: { comum: 40, especial: 32, caos: 18, lendaria: 10 },
};

function getPack(packName) {
  return PACKS[packName] || PACKS.padrao;
}

function weightedPickRarity(availableRarities, weights) {
  const total = availableRarities.reduce((sum, r) => sum + (weights[r] || 0), 0);
  if (total <= 0) return availableRarities[0];

  let roll = Math.random() * total;
  for (const rarity of availableRarities) {
    roll -= weights[rarity] || 0;
    if (roll <= 0) return rarity;
  }
  return availableRarities[availableRarities.length - 1];
}

// Sorteia uma carta ainda não usada nesta partida.
// - `frequency` é um dos valores de SPECIAL_FREQUENCIES ('off'|'poucas'|'normal'|'muitas').
// - `customQuestions` (opcional) é a lista de perguntas da própria sala
//   ("Perguntas da Galera"): sempre entram no pool de raridade 'comum',
//   independente da frequência escolhida (frequência só controla a chance
//   de sair carta especial/caos/lendária, não afeta perguntas comuns).
// - Se todas as cartas de uma raridade já saíram, tenta cair para 'comum';
//   se até isso esgotar, reinicia o conjunto de usadas (o jogo nunca trava).
function getRandomCard(packName, usedIds, frequency, customQuestions = []) {
  const pack = getPack(packName);
  const weights = WEIGHTS_BY_FREQUENCY[frequency] || WEIGHTS_BY_FREQUENCY.normal;
  const allowedRarities = ['comum', 'especial', 'caos', 'lendaria'].filter((r) => (weights[r] || 0) > 0);

  const customAsCards = customQuestions.map((q) => ({
    id: q.id, rarity: 'comum', text: q.text, source: 'custom', authorName: q.authorName,
  }));

  const poolFor = (rarity) => {
    const fromPack = pack.filter((c) => c.rarity === rarity && !usedIds.has(c.id));
    if (rarity !== 'comum') return fromPack;
    const fromCustom = customAsCards.filter((c) => !usedIds.has(c.id));
    return [...fromPack, ...fromCustom];
  };

  const rarityCandidates = allowedRarities.filter((r) => poolFor(r).length > 0);
  const rarity = rarityCandidates.length > 0 ? weightedPickRarity(rarityCandidates, weights) : null;

  let pool = rarity ? poolFor(rarity) : [];

  if (pool.length === 0) {
    pool = poolFor('comum');
  }
  if (pool.length === 0) {
    // Esgotou o pacote inteiro nesta partida: reinicia o controle de usadas.
    usedIds.clear();
    pool = pack.filter((c) => allowedRarities.includes(c.rarity));
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function getCardById(packName, id) {
  return getPack(packName).find((c) => c.id === id);
}

// Usado nos testes automatizados para forçar o sorteio de uma raridade
// específica sem depender de sorte no RNG.
function getRandomCardOfRarity(packName, rarity, usedIds = new Set()) {
  const pack = getPack(packName);
  const fresh = pack.filter((c) => c.rarity === rarity && !usedIds.has(c.id));
  const pool = fresh.length > 0 ? fresh : pack.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  getPack, getRandomCard, getCardById, getRandomCardOfRarity, PACKS, WEIGHTS_BY_FREQUENCY,
};
