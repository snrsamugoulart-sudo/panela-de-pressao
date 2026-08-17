// src/minigameRunner.js
// Camada fina que liga o motor puro de minigames (src/minigames.js) ao
// Socket.IO: dispara os timers, coleta as ações dos jogadores e depois
// devolve o controle para quem chamou (via callback `onDone`).

const { MINIGAME_META, pickRandomMinigameType, resolveMinigame } = require('./minigames');
const { getScoreboard } = require('./game');
const { applyScoreDelta } = require('./cardEffects');
const { getRoom } = require('./rooms');

const MINIGAME_RESULT_DISPLAY_MS = 4000;

function connectedPlayerIds(room) {
  return [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
}

// Inicia um minigame na sala. `onDone` é chamado quando o minigame termina
// E a partida ainda não acabou (se alguém venceu com os pontos do
// minigame, `onGameOver` é chamado no lugar e `onDone` nunca roda).
function runMinigame(io, room, { onDone, onGameOver, checkGameOver }) {
  const type = pickRandomMinigameType();
  const meta = MINIGAME_META[type];

  room.status = 'minigame';
  room.minigameState = {
    type,
    actions: new Map(),
    appearedAt: null,
    correctIndex: null, // usado em 'alvo-certo': só ações com esse índice contam
    holderId: null, // usado em 'batata-quente'
    holderInterval: null,
  };

  const startPayload = { type, label: meta.label, description: meta.description, windowMs: meta.windowMs };
  if (type === 'alvo-certo') startPayload.targetCount = meta.targetCount;

  io.to(room.code).emit('minigame_start', startPayload);
  room.lastSnapshot = { type: 'minigame_start', payload: startPayload };

  function finishAndContinue() {
    // A sala pode ter sido resetada/apagada enquanto o timer corria.
    const current = getRoom(room.code);
    if (!current || current.status !== 'minigame' || !current.minigameState) return;

    if (current.minigameState.holderInterval) clearInterval(current.minigameState.holderInterval);

    const result = resolveMinigame(type, current.minigameState.actions, connectedPlayerIds(current), {
      appearedAt: current.minigameState.appearedAt,
      holderId: current.minigameState.holderId,
    });

    result.scoreChanges.forEach(({ playerId, delta }) => {
      const player = current.players.get(playerId);
      if (player) applyScoreDelta(player, delta);
    });

    current.status = 'reveal';
    current.minigameState = null;

    const resultPayload = {
      type,
      winners: result.winners,
      scoreChanges: result.scoreChanges,
      narrative: result.narrative,
      scores: getScoreboard(current),
    };
    io.to(current.code).emit('minigame_result', resultPayload);
    current.lastSnapshot = { type: 'minigame_result', payload: resultPayload };

    const winner = checkGameOver(current);
    if (winner) {
      onGameOver(current, winner);
      return;
    }

    setTimeout(() => onDone(current), MINIGAME_RESULT_DISPLAY_MS);
  }

  if (type === 'coroa' || type === 'alvo-certo') {
    const [minDelay, maxDelay] = meta.introDelayRangeMs;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    setTimeout(() => {
      const current = getRoom(room.code);
      if (!current || current.status !== 'minigame' || !current.minigameState) return;
      current.minigameState.appearedAt = Date.now();

      if (type === 'coroa') {
        const x = 10 + Math.random() * 80;
        const y = 20 + Math.random() * 60;
        io.to(current.code).emit('minigame_event', { event: 'crown_appear', x, y });
      } else {
        // 'alvo-certo': gera N posições, escolhe uma como a correta (só o
        // servidor sabe qual é — ações que não batem com ela são ignoradas).
        const count = meta.targetCount || 4;
        const correctIndex = Math.floor(Math.random() * count);
        current.minigameState.correctIndex = correctIndex;
        const positions = Array.from({ length: count }, () => ({
          x: 12 + Math.random() * 76,
          y: 18 + Math.random() * 64,
        }));
        io.to(current.code).emit('minigame_event', { event: 'targets_appear', positions });
      }

      setTimeout(finishAndContinue, meta.windowMs);
    }, delay);
  } else if (type === 'batata-quente') {
    const ids = connectedPlayerIds(room);
    if (ids.length === 0) {
      setTimeout(finishAndContinue, meta.windowMs);
    } else {
      let holderIdx = Math.floor(Math.random() * ids.length);
      room.minigameState.holderId = ids[holderIdx];
      io.to(room.code).emit('minigame_event', { event: 'potato_pass', holderId: room.minigameState.holderId });

      room.minigameState.holderInterval = setInterval(() => {
        const current = getRoom(room.code);
        if (!current || current.status !== 'minigame' || !current.minigameState) return;
        const currentIds = connectedPlayerIds(current);
        if (currentIds.length === 0) return;
        holderIdx = (holderIdx + 1) % currentIds.length;
        current.minigameState.holderId = currentIds[holderIdx];
        io.to(current.code).emit('minigame_event', { event: 'potato_pass', holderId: current.minigameState.holderId });
      }, meta.passIntervalMs);

      setTimeout(finishAndContinue, meta.windowMs);
    }
  } else {
    setTimeout(finishAndContinue, meta.windowMs);
  }
}

function registerMinigameAction(room, playerId, targetIndex) {
  if (!room.minigameState || !room.players.has(playerId)) return;

  // 'alvo-certo': só registra a ação se bater com o índice correto (segredo do servidor).
  if (room.minigameState.correctIndex !== null && targetIndex !== undefined) {
    if (targetIndex !== room.minigameState.correctIndex) return;
  }

  const list = room.minigameState.actions.get(playerId) || [];
  list.push(Date.now());
  room.minigameState.actions.set(playerId, list);
}

module.exports = { runMinigame, registerMinigameAction, MINIGAME_RESULT_DISPLAY_MS };
