// src/pressure.js
// Sistema de Pressão: mede o quanto o líder está "isolado" dos demais.
// É puramente derivado do placar (sem estado próprio), então pode ser
// recalculado a qualquer momento a partir do scoreboard atual.
//
// Pressão NÃO tira pontos do líder automaticamente — ela só é um sinal
// (visual + numérico) que outras partes do jogo podem usar para dar
// pequenos bônus a quem desafia a liderança (ver cardEffects.js).

const LEVEL_LABELS = ['Sem pressão', 'Pressão 1', 'Pressão 2', 'Pressão 3'];

// Calcula o nível de pressão (0 a 3) a partir do placar e da pontuação
// necessária pra vencer. A distância do líder pro segundo colocado é
// comparada com frações do winScore, então o sistema se adapta a
// partidas curtas (3 pontos) ou longas (10 pontos) igualmente.
function computePressureLevel(scoreboard, winScore) {
  if (!scoreboard || scoreboard.length < 2) return 0;

  const [leader, second] = scoreboard;
  if (!leader || leader.score <= 0) return 0;

  const gap = leader.score - (second?.score || 0);
  if (gap <= 0) return 0;

  const w = Math.max(1, winScore);
  if (gap >= w * 0.6) return 3;
  if (gap >= w * 0.35) return 2;
  if (gap >= w * 0.15) return 1;
  return 0;
}

// Retorna as informações de pressão prontas pra ir num payload de socket.
function getPressureInfo(scoreboard, winScore, pressureEnabled) {
  if (!pressureEnabled) {
    return { enabled: false, level: 0, label: LEVEL_LABELS[0], leaderId: scoreboard[0]?.id || null };
  }
  const level = computePressureLevel(scoreboard, winScore);
  return {
    enabled: true,
    level,
    label: LEVEL_LABELS[level],
    leaderId: scoreboard[0]?.id || null,
  };
}

module.exports = { computePressureLevel, getPressureInfo, LEVEL_LABELS };
