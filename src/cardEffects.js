// src/cardEffects.js
// Toda a lógica de "o que uma carta faz" mora aqui, indexada por
// `effect.type`. O restante do jogo (game.js) nunca verifica o nome da
// carta — ele só pergunta a este módulo "essa carta restringe o voto?",
// "essa carta precisa de uma escolha do vencedor?", "como pontuar isso?".
//
// Para adicionar uma nova carta com efeito, normalmente basta:
//   1. Adicionar o objeto da carta em um pacote de conteúdo.
//   2. Se o `effect.type` for novo, implementar um handler aqui.

const INTERACTIVE_TYPES = new Set(['winner_choice', 'winner_curse']);

function isInteractiveEffect(effect) {
  return !!effect && INTERACTIVE_TYPES.has(effect.type);
}

function isImmune(player, currentRoundNumber) {
  return !!player && player.immuneNegativeUntilRound === currentRoundNumber;
}

function clampScore(value) {
  return Math.max(0, value);
}

function applyScoreDelta(player, delta) {
  if (!player) return 0;
  const before = player.score;
  player.score = clampScore(player.score + delta);
  return player.score - before; // delta real aplicado (pode ser menor por causa do clamp)
}

// Retorna os ids elegíveis para receber voto de `voterId` nesta rodada,
// já excluindo o próprio votante. `null` do efeito = sem restrição extra.
function getEligibleTargets(effect, connectedIds, voterId, leaderIds) {
  const others = connectedIds.filter((id) => id !== voterId);
  if (effect && effect.type === 'leader_only_vote') {
    return others.filter((id) => leaderIds.includes(id));
  }
  return others;
}

// Aplica a pontuação padrão/efeitos NÃO interativos (chamada só quando
// isInteractiveEffect(effect) é falso, ou quando o efeito interativo caiu
// em empate e foi rebaixado para pontuação padrão).
//
// `preRoundLeaderIds` e `pressureLevel` são usados só no caso 'none' /
// 'leader_only_vote': quando a Pressão está ativa e quem venceu a rodada
// NÃO era um dos líderes antes dela, ganha um pequeno bônus extra igual
// ao nível de pressão (0-3). O líder nunca é punido por isso — só os
// desafiantes ganham um empurrão.
function applyRoundScoring(room, card, winnerIds, preRoundLeaderIds = [], pressureLevel = 0) {
  const effect = card.effect || { type: 'none' };
  const scoreChanges = [];

  if (effect.type === 'double_points_no_tie') {
    if (winnerIds.length === 1) {
      const player = room.players.get(winnerIds[0]);
      const delta = applyScoreDelta(player, 2);
      scoreChanges.push({ playerId: winnerIds[0], delta, reason: 'panela_de_pressao' });
    }
    // empate: ninguém pontua (regra explícita da carta)
  } else if (effect.type === 'random_bonus') {
    const pool = effect.values || [3, 2, 1, -1];
    winnerIds.forEach((id) => {
      const player = room.players.get(id);
      let raw = pool[Math.floor(Math.random() * pool.length)];
      if (raw < 0 && isImmune(player, room.roundNumber)) raw = 0;
      const delta = applyScoreDelta(player, raw);
      scoreChanges.push({ playerId: id, delta, reason: 'roleta' });
    });
  } else {
    // 'none' e 'leader_only_vote': pontuação padrão (+1 por vencedor, empate reparte)
    // + bônus de "desafiar o líder" quando a Pressão está ativa.
    winnerIds.forEach((id) => {
      const player = room.players.get(id);
      const isChallenger = pressureLevel > 0 && !preRoundLeaderIds.includes(id);
      const base = 1;
      const bonus = isChallenger ? pressureLevel : 0;
      const delta = applyScoreDelta(player, base + bonus);
      scoreChanges.push({
        playerId: id,
        delta,
        reason: 'padrao',
        pressureBonus: isChallenger ? bonus : 0,
      });
    });
  }

  return scoreChanges;
}

// Resolve a escolha do vencedor numa carta 'winner_choice' (ex: Ganância).
function resolveWinnerChoice(room, winnerId, choiceKey) {
  const card = room.currentCard;
  const options = (card.effect && card.effect.options) || [];
  const option = options.find((o) => o.key === choiceKey) || options[0];
  if (!option) return { ok: false, error: 'Opção inválida.' };

  const player = room.players.get(winnerId);
  const delta = applyScoreDelta(player, option.delta);
  if (option.immunity) {
    player.immuneNegativeUntilRound = room.roundNumber + 1;
  }

  return {
    ok: true,
    playerId: winnerId,
    delta,
    immunity: !!option.immunity,
    optionKey: option.key,
    optionLabel: option.label,
  };
}

// Resolve a escolha do vencedor numa carta 'winner_curse' (ex: Vingança).
function resolveWinnerCurse(room, winnerId, targetPlayerId, sign) {
  if (!targetPlayerId || targetPlayerId === winnerId || !room.players.has(targetPlayerId)) {
    return { ok: false, error: 'Escolha outro jogador válido para receber o efeito.' };
  }

  const target = room.players.get(targetPlayerId);
  let raw = sign < 0 ? -1 : 1;
  if (raw < 0 && isImmune(target, room.roundNumber)) raw = 0;
  const delta = applyScoreDelta(target, raw);

  return { ok: true, playerId: targetPlayerId, delta, chosenBy: winnerId };
}

// Escolha padrão usada quando o vencedor não responde a tempo.
function buildDefaultChoice(room) {
  const card = room.currentCard;
  const pending = room.pendingEffect;
  if (!pending) return null;

  if (pending.type === 'winner_choice') {
    const options = (card.effect && card.effect.options) || [];
    return { choiceKey: options[0]?.key };
  }

  if (pending.type === 'winner_curse') {
    const candidates = [...room.players.values()].filter(
      (p) => p.connected && p.id !== pending.winnerId
    );
    if (candidates.length === 0) return { targetPlayerId: null, sign: 1 };
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const sign = Math.random() < 0.5 ? 1 : -1;
    return { targetPlayerId: target.id, sign };
  }

  return null;
}

module.exports = {
  isInteractiveEffect,
  isImmune,
  applyScoreDelta,
  getEligibleTargets,
  applyRoundScoring,
  resolveWinnerChoice,
  resolveWinnerCurse,
  buildDefaultChoice,
};
