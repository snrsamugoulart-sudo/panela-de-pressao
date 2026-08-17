// Testes unitários das funcionalidades novas da V3 (sem rede).
const assert = require('assert');
const { createRoom } = require('../src/rooms');
const { createPlayer } = require('../src/players');
const { getCardById } = require('../src/content');
const { startGame, registerVote, closeRound, shouldTriggerMinigame, startNewRound } = require('../src/game');
const { computePressureLevel } = require('../src/pressure');
const { addCustomQuestion } = require('../src/customQuestions');

function makeRoom(names, configInput) {
  const room = createRoom('host-socket', names[0], configInput);
  const ids = [room.hostId];
  for (let i = 1; i < names.length; i++) {
    const p = createPlayer(`socket-${i}`, names[i]);
    room.players.set(p.id, p);
    ids.push(p.id);
  }
  return { room, ids };
}

// ---- 1. Bônus de Pressão: desafiante ganha bônus ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico', pressureLevel: 'normal', winScore: 10 });
  const [a, b, c] = ids;
  startGame(room);

  room.players.get(a).score = 6;
  room.currentCard = getCardById('padrao', 'p-c-01'); // comum, sem efeito

  registerVote(room, a, b);
  registerVote(room, c, b);

  const result = closeRound(room);
  const bChange = result.scoreChanges.find((s) => s.playerId === b);
  assert.ok(bChange.delta > 1, `B deveria ganhar bônus de pressão além do +1 padrão, ganhou ${bChange.delta}`);
  assert.strictEqual(bChange.pressureBonus > 0, true);
  console.log(`✅ Desafiante (B) ganhou +${bChange.delta} (bônus de pressão de ${bChange.pressureBonus} incluso).`);
}

// ---- 2. Pressão desligada: sem bônus ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico', pressureLevel: 'off', winScore: 10 });
  const [a, b, c] = ids;
  startGame(room);
  room.players.get(a).score = 8;
  room.currentCard = getCardById('padrao', 'p-c-01');

  registerVote(room, a, b);
  registerVote(room, c, b);

  const result = closeRound(room);
  const bChange = result.scoreChanges.find((s) => s.playerId === b);
  assert.strictEqual(bChange.delta, 1, 'Sem pressão habilitada, não deveria ter bônus');
  console.log('✅ Pressão desligada não concede bônus, mesmo com diferença grande de pontos.');
}

// ---- 3. Cálculo de nível de pressão ----
{
  assert.strictEqual(computePressureLevel([{ score: 5 }, { score: 5 }], 5), 0);
  assert.strictEqual(computePressureLevel([{ score: 5 }, { score: 0 }], 5), 3);
  console.log('✅ Cálculo de nível de pressão consistente.');
}

// ---- 4. Perguntas da galera aparecem no sorteio real de rodada ----
{
  const { room } = makeRoom(['A', 'B'], { mode: 'basico', specialCardsFrequency: 'off', winScore: 5 });
  addCustomQuestion(room, 'x', 'Fulano', 'Pergunta customizada de teste pra essa sala específica aqui');
  startGame(room);

  let sawCustom = false;
  for (let i = 0; i < 200; i++) {
    const card = startNewRound(room);
    if (card.source === 'custom') sawCustom = true;
  }
  assert.strictEqual(sawCustom, true, 'Pergunta da galera deveria aparecer no sorteio em algum momento');
  console.log('✅ Pergunta da galera entra no baralho de sorteio da sala.');
}

// ---- 5. Intervalo de minigame 'random' dispara ocasionalmente ----
{
  const { room } = makeRoom(['A', 'B'], { mode: 'caotico', winScore: 999 });
  room.config.minigameInterval = 'random';

  let anyTrue = false;
  let anyFalse = false;
  for (let i = 2; i < 60; i++) {
    room.roundNumber = i;
    if (shouldTriggerMinigame(room)) anyTrue = true; else anyFalse = true;
  }
  assert.strictEqual(anyTrue, true, "'random' deveria disparar minigame em pelo menos uma rodada");
  assert.strictEqual(anyFalse, true, "'random' não deveria disparar em TODAS as rodadas");
  console.log('✅ Intervalo de minigame "Aleatório" dispara ocasionalmente (nem sempre, nem nunca).');
}

console.log('\n🎉 TODOS OS TESTES UNITÁRIOS DA V3 PASSARAM.');
