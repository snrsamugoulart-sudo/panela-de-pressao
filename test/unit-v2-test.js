// Testes unitários diretos do motor de jogo da V2 (sem rede).
const assert = require('assert');
const { createRoom } = require('../src/rooms');
const { createPlayer } = require('../src/players');
const { getCardById } = require('../src/content');
const {
  startGame, registerVote, closeRound, resolvePendingEffect,
  buildDefaultChoiceFor, getScoreboard, checkGameOver, getPanelaProgress,
} = require('../src/game');

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

function forceCard(room, cardId) {
  room.currentCard = getCardById(room.config.pack, cardId);
}

// ---- 1. Carta Especial (sem efeito mecânico) se comporta como padrão ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico' });
  const [a, b, c] = ids;
  startGame(room);
  forceCard(room, 'p-e-01'); // especial, sem efeito

  assert.strictEqual(registerVote(room, a, b).ok, true);
  assert.strictEqual(registerVote(room, b, a).ok, true);
  assert.strictEqual(registerVote(room, c, a).ok, true);

  const result = closeRound(room);
  assert.strictEqual(result.interactive, false);
  assert.deepStrictEqual(result.winners, [a]);
  assert.strictEqual(room.players.get(a).score, 1);
  console.log('✅ Carta Especial sem efeito pontua como padrão.');
}

// ---- 2. Carta Caos "Derrubem o Rei" (leader_only_vote) ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C', 'D'], { mode: 'caotico' });
  const [a, b, c, d] = ids;
  startGame(room);

  // Faz A ser o líder manualmente antes da rodada de teste.
  room.players.get(a).score = 3;

  forceCard(room, 'p-x-01'); // Derrubem o Rei

  // B, C, D só podem votar em A (o líder).
  assert.strictEqual(registerVote(room, b, c).ok, false, 'Não deveria poder votar fora do líder');
  assert.strictEqual(registerVote(room, b, a).ok, true);
  assert.strictEqual(registerVote(room, c, a).ok, true);
  assert.strictEqual(registerVote(room, d, a).ok, true);

  // A (o próprio líder) não tem ninguém elegível para votar (só existe 1 líder e não pode votar nele mesmo).
  const { getEligibleTargetsForVoter } = require('../src/game');
  assert.deepStrictEqual(getEligibleTargetsForVoter(room, a), []);

  const result = closeRound(room);
  assert.strictEqual(result.interactive, false);
  assert.deepStrictEqual(result.winners, [a]);
  assert.strictEqual(room.players.get(a).score, 4); // 3 + 1 padrão
  console.log('✅ Derrubem o Rei restringe voto ao líder e libera quem não tem alvo elegível.');
}

// ---- 3. Carta Caos "Ganância" (winner_choice) — fluxo interativo completo ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico' });
  const [a, b, c] = ids;
  startGame(room);
  forceCard(room, 'p-x-02'); // Ganância

  registerVote(room, b, a);
  registerVote(room, c, a);
  // A não vota (só pra ver se o fechamento funciona mesmo com abstenção do próprio candidato a vencedor)
  registerVote(room, a, b);

  const result = closeRound(room);
  assert.strictEqual(result.interactive, true);
  assert.strictEqual(result.pendingEffect.type, 'winner_choice');
  assert.strictEqual(result.pendingEffect.winnerId, a);
  assert.strictEqual(room.status, 'awaiting_effect');
  assert.strictEqual(room.players.get(a).score, 0, 'Pontuação não deve mudar antes da escolha');

  const resolved = resolvePendingEffect(room, { choiceKey: 'imunidade' });
  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(room.players.get(a).score, 1);
  assert.strictEqual(room.players.get(a).immuneNegativeUntilRound, room.roundNumber + 1);
  assert.strictEqual(room.status, 'reveal');
  console.log('✅ Ganância: fluxo interativo completo (pontuação some até a escolha, imunidade aplicada).');
}

// ---- 4. Imunidade protege de efeito negativo da Roleta ----
{
  const { room, ids } = makeRoom(['A', 'B'], { mode: 'caotico' });
  const [a, b] = ids;
  startGame(room);
  room.players.get(a).immuneNegativeUntilRound = room.roundNumber; // imune JÁ nesta rodada
  forceCard(room, 'p-l-02'); // Roleta

  registerVote(room, b, a);

  // Força o resultado do random_bonus a ser sempre -1 pra validar o clamp de imunidade.
  const originalRandom = Math.random;
  Math.random = () => 0.99; // último valor do array [3,2,1,-1] => -1
  const result = closeRound(room);
  Math.random = originalRandom;

  assert.strictEqual(result.scoreChanges[0].delta, 0, 'Jogador imune não deveria perder ponto');
  console.log('✅ Imunidade neutraliza bônus negativo da Roleta.');
}

// ---- 5. Vingança (winner_curse) — validação de alvo inválido e aplicação ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico' });
  const [a, b, c] = ids;
  startGame(room);
  forceCard(room, 'p-l-03'); // Vingança

  registerVote(room, b, a);
  registerVote(room, c, a);
  const result = closeRound(room);
  assert.strictEqual(result.interactive, true);
  assert.strictEqual(result.pendingEffect.winnerId, a);

  const invalid = resolvePendingEffect(room, { targetPlayerId: a, sign: 1 }); // alvo = ele mesmo
  assert.strictEqual(invalid.ok, false);
  assert.strictEqual(room.status, 'awaiting_effect', 'Deve continuar aguardando se a escolha for inválida');

  const valid = resolvePendingEffect(room, { targetPlayerId: b, sign: -1 });
  assert.strictEqual(valid.ok, true);
  assert.strictEqual(room.players.get(b).score, 0, 'Score não pode ficar negativo (clamp em 0)');
  console.log('✅ Vingança valida alvo e aplica efeito (com clamp de score em 0).');
}

// ---- 6. Escolha padrão automática (timeout) tem um formato utilizável ----
{
  const { room, ids } = makeRoom(['A', 'B', 'C'], { mode: 'caotico' });
  const [a, b] = ids;
  startGame(room);
  forceCard(room, 'p-x-02'); // Ganância
  registerVote(room, b, a);
  registerVote(room, ids[2], a);
  closeRound(room);

  const auto = buildDefaultChoiceFor(room);
  assert.ok(auto.choiceKey, 'Deveria ter uma escolha padrão de Ganância');
  const resolved = resolvePendingEffect(room, auto);
  assert.strictEqual(resolved.ok, true);
  console.log('✅ Escolha padrão automática (timeout) resolve corretamente.');
}

// ---- 7. Panela de Pressão (double_points_no_tie): empate não pontua, vitória única vale 2 ----
{
  const { room, ids } = makeRoom(['A', 'B'], { mode: 'caotico' });
  const [a, b] = ids;
  startGame(room);
  forceCard(room, 'p-l-01');
  registerVote(room, a, b);
  registerVote(room, b, a);
  const tieResult = closeRound(room);
  assert.strictEqual(tieResult.scoreChanges.length, 0);
  assert.strictEqual(room.players.get(a).score, 0);
  assert.strictEqual(room.players.get(b).score, 0);

  // rodada 2, sem empate
  room.status = 'playing';
  room.currentRoundVotes = new Map();
  room.roundNumber += 1;
  registerVote(room, a, b);
  const winResult = closeRound(room);
  assert.strictEqual(winResult.scoreChanges[0].delta, 2);
  console.log('✅ Panela de Pressão: empate zera pontos, vitória única vale 2.');
}

// ---- 8. Vitória e progresso da panela ----
{
  const { room, ids } = makeRoom(['A', 'B'], { mode: 'basico', winScore: 3 });
  const [a] = ids;
  startGame(room);
  room.players.get(a).score = 2;
  assert.strictEqual(checkGameOver(room), null);
  assert.strictEqual(getPanelaProgress(room), 67);

  room.players.get(a).score = 3;
  const winner = checkGameOver(room);
  assert.strictEqual(winner.id, a);
  assert.strictEqual(room.status, 'finished');
  assert.strictEqual(getPanelaProgress(room), 100);
  console.log('✅ Vitória e indicador de panela funcionando.');
}

console.log('\n🎉 TODOS OS TESTES UNITÁRIOS DA V2 PASSARAM.');
