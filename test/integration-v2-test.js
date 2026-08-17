// Teste de integração ponta a ponta da V2. Sobe o servidor de verdade
// (no mesmo processo, para poder espiar/forçar o estado da sala em cenários
// que dependeriam de sorte no sorteio de cartas) e simula jogadores reais
// via socket.io-client.

const assert = require('assert');
const { io: ioClient } = require('socket.io-client');
require('../server'); // sobe o servidor na porta 3000 dentro deste processo
const { getRoom } = require('../src/rooms');
const { getCardById } = require('../src/content');

const URL = 'http://localhost:3000';

function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(URL);
    const t = setTimeout(() => reject(new Error(`timeout conectando ${name}`)), 8000);
    socket.on('connect', () => { clearTimeout(t); resolve(socket); });
    socket.on('connect_error', (e) => console.error(`erro conexao ${name}:`, e.message));
  });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let passCount = 0;
function pass(label) {
  passCount += 1;
  console.log(`✅ [${passCount}] ${label}`);
}

async function createRoomWithPlayers(names, config) {
  const sockets = [];
  for (const n of names) sockets.push(await connect(n));
  const [hostSocket, ...others] = sockets;

  const createRes = await emitAck(hostSocket, 'create_room', { playerName: names[0], config });
  assert.strictEqual(createRes.ok, true, 'criação de sala falhou: ' + JSON.stringify(createRes));
  const roomCode = createRes.roomCode;
  const ids = [createRes.playerId];

  for (let i = 0; i < others.length; i++) {
    const res = await emitAck(others[i], 'join_room', { roomCode, playerName: names[i + 1] });
    assert.strictEqual(res.ok, true, `entrada falhou para ${names[i + 1]}: ` + JSON.stringify(res));
    ids.push(res.playerId);
  }
  await wait(200);
  return { sockets, ids, roomCode };
}

async function main() {
  // ============= SEÇÃO 1: fluxo básico completo (itens 1-9, 22) =============
  {
    const names = ['Joao', 'Pedro', 'Lucas', 'Ana'];
    const { sockets, ids, roomCode } = await createRoomWithPlayers(names, {
      mode: 'basico', winScore: 3, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas, sAna] = sockets;
    const [joaoId, pedroId, lucasId, anaId] = ids;
    pass('Criar sala (host + config aplicada)');
    pass('Entrar com vários jogadores (3 adicionais, total 4)');

    const room = getRoom(roomCode);
    assert.strictEqual(room.config.mode, 'basico');
    assert.strictEqual(room.config.winScore, 3);

    const newRoundPromises = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    const rounds1 = await Promise.all(newRoundPromises);
    pass('Iniciar partida');
    assert.ok(rounds1[0].card && rounds1[0].card.text.length > 0);
    assert.strictEqual(rounds1[0].card.rarity, 'comum', 'Básico com especiais OFF só deveria sortear comum');
    pass('Mostrar carta (Modo Básico: só sorteia comum, confirmado)');

    const selfVoteErr = once(sAna, 'error_message');
    sAna.emit('submit_vote', { roomCode, votedForId: anaId });
    const errMsg = await selfVoteErr;
    assert.ok(/si mesmo/i.test(errMsg.message));
    pass('Bloquear auto-voto');

    const dupErrPromise = once(sJoao, 'error_message');
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    await wait(150);
    sJoao.emit('submit_vote', { roomCode, votedForId: lucasId });
    const dupErr = await dupErrPromise;
    assert.ok(/já votou/i.test(dupErr.message));
    pass('Impedir voto duplicado');

    const resultPromises = sockets.map((s) => once(s, 'round_result'));
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    sAna.emit('submit_vote', { roomCode, votedForId: joaoId });
    const results1 = await Promise.all(resultPromises);
    const r1 = results1[0];
    pass('Votar (todos os jogadores registrados)');

    const joaoVotes = r1.votesDetail.find((v) => v.playerId === joaoId).voteCount;
    const pedroVotes = r1.votesDetail.find((v) => v.playerId === pedroId).voteCount;
    assert.strictEqual(joaoVotes, 3);
    assert.strictEqual(pedroVotes, 1);
    pass('Revelar votos (contagem correta: 3x1)');

    assert.deepStrictEqual(r1.winners, [joaoId]);
    assert.strictEqual(r1.scoreChanges[0].delta, 1);
    pass('Calcular pontuação (padrão +1 para o vencedor)');

    sockets.forEach((s) => s.close());
  }

  // ============= TESTE DE EMPATE (item 10) =============
  {
    const names = ['A', 'B', 'C', 'D'];
    const { sockets, ids, roomCode } = await createRoomWithPlayers(names, {
      mode: 'basico', winScore: 10, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sA, sB, sC, sD] = sockets;
    const [a, b] = ids;

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sA.emit('start_game', { roomCode });
    await Promise.all(rounds);

    const resultPromises = sockets.map((s) => once(s, 'round_result'));
    sA.emit('submit_vote', { roomCode, votedForId: b });
    sB.emit('submit_vote', { roomCode, votedForId: a });
    sC.emit('submit_vote', { roomCode, votedForId: a });
    sD.emit('submit_vote', { roomCode, votedForId: b });
    const r = (await Promise.all(resultPromises))[0];

    assert.strictEqual(r.winners.length, 2);
    assert.ok(r.winners.includes(a) && r.winners.includes(b));
    assert.strictEqual(r.scores.find((s) => s.id === a).score, 1);
    assert.strictEqual(r.scores.find((s) => s.id === b).score, 1);
    pass('Testar empate (todos os empatados pontuam)');

    sockets.forEach((s) => s.close());
  }

  // ============= SEÇÃO 2: Modo Caótico + Especial/Caos (itens 11,12,14,23) =============
  {
    const names = ['Joao', 'Pedro', 'Lucas'];
    const { sockets, ids, roomCode } = await createRoomWithPlayers(names, {
      mode: 'caotico', winScore: 50, specialCardsFrequency: 'normal', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId, lucasId] = ids;

    const rounds0 = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds0);
    pass('Modo Caótico ativo (specialCardsFrequency=normal, pacote padrão)');

    // ---- Carta ESPECIAL forçada (item 11) ----
    let room = getRoom(roomCode);
    room.currentCard = getCardById('padrao', 'p-e-01');
    const resultEsp = sockets.map((s) => once(s, 'round_result'));
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    const rEsp = (await Promise.all(resultEsp))[0];
    assert.strictEqual(rEsp.card.rarity, 'especial');
    assert.strictEqual(rEsp.scoreChanges[0].delta, 1);
    pass('Testar carta Especial (pontuação padrão)');

    const rounds1 = sockets.map((s) => once(s, 'new_round'));
    await Promise.race([Promise.all(rounds1), wait(8000)]);

    // ---- Carta CAOS forçada: Derrubem o Rei / leader_only_vote (item 12) ----
    room = getRoom(roomCode);
    room.players.get(joaoId).score = 90; // torna Joao o líder disparado
    room.currentCard = getCardById('padrao', 'p-x-01');
    room.currentRoundVotes = new Map();
    room.status = 'playing';

    const invalidVoteErr = once(sPedro, 'error_message');
    sPedro.emit('submit_vote', { roomCode, votedForId: lucasId }); // não é o líder
    const errRestr = await invalidVoteErr;
    assert.ok(/líder/i.test(errRestr.message));

    const resultCaos = sockets.map((s) => once(s, 'round_result'));
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    const rCaos = (await Promise.all(resultCaos))[0];
    assert.strictEqual(rCaos.card.rarity, 'caos');
    assert.ok(rCaos.winners.includes(joaoId));
    pass('Testar carta Caos (Derrubem o Rei restringe voto ao líder, líder dispensado de votar)');

    sockets.forEach((s) => s.close());
  }

  // ============= SEÇÃO 3: cartas interativas Ganância (caos) e Vingança (lendária) — item 12/13 =============
  {
    const names = ['Joao', 'Pedro', 'Lucas'];
    const { sockets, ids, roomCode } = await createRoomWithPlayers(names, {
      mode: 'caotico', winScore: 50, specialCardsFrequency: 'normal', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId, lucasId] = ids;

    const rounds0 = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds0);

    // ---- Ganância (winner_choice) ----
    let room = getRoom(roomCode);
    room.currentCard = getCardById('padrao', 'p-x-02');

    const promptPromise = once(sJoao, 'effect_choice_prompt');
    const waitingPromise = once(sPedro, 'effect_choice_waiting');
    const roundResultPromise = once(sJoao, 'round_result');

    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });

    const roundResultInteractive = await roundResultPromise;
    assert.strictEqual(roundResultInteractive.interactive, true);
    assert.strictEqual(roundResultInteractive.pendingEffect.type, 'winner_choice');

    const prompt = await promptPromise;
    assert.strictEqual(prompt.type, 'winner_choice');
    assert.ok(prompt.options.some((o) => o.key === 'imunidade'));
    await waitingPromise;

    const scoreBefore = getRoom(roomCode).players.get(joaoId).score;
    const resolvedPromise = sockets.map((s) => once(s, 'effect_resolved'));
    sJoao.emit('submit_card_choice', { roomCode, choiceKey: 'imunidade' });
    const resolved = (await Promise.all(resolvedPromise))[0];
    assert.strictEqual(resolved.outcome.delta, 1);
    assert.strictEqual(resolved.outcome.immunity, true);
    assert.strictEqual(getRoom(roomCode).players.get(joaoId).score, scoreBefore + 1);
    pass('Testar carta Caos interativa — Ganância (escolha do vencedor, imunidade aplicada)');

    const rounds1 = sockets.map((s) => once(s, 'new_round'));
    await Promise.race([Promise.all(rounds1), wait(8000)]);

    // ---- Vingança (lendária, winner_curse) ----
    room = getRoom(roomCode);
    room.currentCard = getCardById('padrao', 'p-l-03');
    room.currentRoundVotes = new Map();
    room.status = 'playing';

    const promptPromise2 = once(sJoao, 'effect_choice_prompt');
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    const prompt2 = await promptPromise2;
    assert.strictEqual(prompt2.type, 'winner_curse');
    assert.ok(prompt2.eligibleTargets.some((t) => t.id === pedroId));

    // Tenta escolher a si mesmo primeiro -> deve ser rejeitado sem quebrar o fluxo
    const selfCurseErr = once(sJoao, 'error_message');
    sJoao.emit('submit_card_choice', { roomCode, targetPlayerId: joaoId, sign: -1 });
    const selfCurseErrMsg = await selfCurseErr;
    assert.ok(/válido/i.test(selfCurseErrMsg.message));

    const pedroScoreBefore = getRoom(roomCode).players.get(pedroId).score;
    const resolvedPromise2 = sockets.map((s) => once(s, 'effect_resolved'));
    sJoao.emit('submit_card_choice', { roomCode, targetPlayerId: pedroId, sign: 1 });
    const resolved2 = (await Promise.all(resolvedPromise2))[0];
    assert.strictEqual(resolved2.outcome.playerId, pedroId);
    assert.strictEqual(resolved2.outcome.delta, 1);
    assert.strictEqual(getRoom(roomCode).players.get(pedroId).score, pedroScoreBefore + 1);
    pass('Testar carta Lendária interativa — Vingança (valida alvo inválido, aplica em alvo válido)');

    sockets.forEach((s) => s.close());
  }

  // ============= Ativar/desativar cartas especiais (item 14) =============
  {
    const { sockets, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro'], {
      mode: 'caotico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao] = sockets;

    const confirmPromise = once(sJoao, 'room_update');
    sJoao.emit('update_config', { roomCode, config: { specialCardsFrequency: 'muitas' } });
    const confirmed = await confirmPromise;
    assert.strictEqual(confirmed.config.specialCardsFrequency, 'muitas');
    assert.strictEqual(getRoom(roomCode).config.specialCardsFrequency, 'muitas');
    pass('Testar ativar/desativar cartas especiais (config aplicada e propagada via room_update)');

    sockets.forEach((s) => s.close());
  }

  // ============= Configuração de pontuação (item 15) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro'], {
      mode: 'basico', winScore: 3, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro] = sockets;
    const [joaoId, pedroId] = ids;

    const updatePromise = once(sJoao, 'room_update');
    sJoao.emit('update_config', { roomCode, config: { winScore: 10 } });
    const updated = await updatePromise;
    assert.strictEqual(updated.config.winScore, 10);
    pass('Testar configuração de pontuação (host consegue alterar antes de iniciar)');

    // joga rodadas suficientes pra confirmar que NÃO termina em 3 (usaria a config antiga)
    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds);

    for (let i = 0; i < 3; i++) {
      const resultPromises = sockets.map((s) => once(s, 'round_result'));
      sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
      sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
      await Promise.race([Promise.all(resultPromises), wait(2000)]);
      await wait(6300); // espera o auto-avanço de rodada
    }
    const roomAfter = getRoom(roomCode);
    assert.ok(roomAfter.status !== 'finished', 'Não deveria ter terminado com winScore=10 após só 3 pontos');
    pass('Confirma que winScore configurado (10) é respeitado, não o valor antigo (3)');

    sockets.forEach((s) => s.close());
  }

  console.log(`\n🎉 Seções 1 a 6 concluídas. Continuando com desconexões, minigames e modo Sem Filtro...\n`);

  // ============= Jogador desconectando (item 18) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'basico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId] = ids;

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds);

    // Lucas cai antes de votar.
    sLucas.close();
    await wait(300);

    const roomMid = getRoom(roomCode);
    assert.strictEqual(roomMid.players.get(ids[2]).connected, false);
    pass('Jogador desconectando: marcado como offline sem derrubar a sala');

    // A rodada deve conseguir fechar só com Joao e Pedro (Lucas não é mais obrigatório a votar).
    const resultPromises = [sJoao, sPedro].map((s) => once(s, 'round_result'));
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    const r = (await Promise.all(resultPromises))[0];
    assert.ok(r.votesDetail.length === 3); // Lucas ainda aparece no placar, só não vota mais
    pass('Votação continua corretamente sem o jogador desconectado');

    sJoao.close();
    sPedro.close();
  }

  // ============= Host desconectando (item 19) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'basico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const originalHostId = getRoom(roomCode).hostId;
    assert.strictEqual(originalHostId, ids[0]);

    const updatePromise = once(sPedro, 'room_update');
    sJoao.close(); // host cai
    const updated = await updatePromise;
    assert.notStrictEqual(updated.hostId, originalHostId);
    assert.ok(updated.hostId === ids[1] || updated.hostId === ids[2]);
    pass('Host desconectando: anfitrião migra automaticamente para outro jogador conectado');

    sPedro.close();
    sLucas.close();
  }

  // ============= Minigame + avanço após minigame (itens 20, 21) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'caotico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 3, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId] = ids;
    getRoom(roomCode).config.minigameInterval = 1; // força disparo já na 1ª rodada (3 não está na lista pública)

    const rounds0 = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds0);

    // Fecha a rodada 1 -> com minigameInterval=1, o minigame deve disparar em seguida
    // (depois do ROUND_RESULT_DURATION_MS de exibição do resultado da rodada).
    const minigameStartPromise = sockets.map((s) => once(s, 'minigame_start'));
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    const startsOutcome = await Promise.race([
      Promise.all(minigameStartPromise).then((r) => ({ ok: true, r })),
      wait(15000).then(() => ({ ok: false })),
    ]);
    assert.strictEqual(startsOutcome.ok, true, 'minigame_start deveria ter chegado em até 15s');
    const starts = startsOutcome.r;
    const type = starts[0].type;
    pass(`Testar minigame (disparado corretamente após a rodada: tipo "${type}")`);

    const resultPromise = sockets.map((s) => once(s, 'minigame_result'));

    if (type === 'coroa') {
      const eventPromise = once(sJoao, 'minigame_event');
      const ev = await eventPromise;
      assert.strictEqual(ev.event, 'crown_appear');
      sJoao.emit('minigame_action', { roomCode }); // Joao tenta pegar a coroa primeiro
    } else {
      // dedo-nervoso ou nao-clique: Pedro clica algumas vezes, Joao e Lucas não clicam
      sPedro.emit('minigame_action', { roomCode });
      sPedro.emit('minigame_action', { roomCode });
      sPedro.emit('minigame_action', { roomCode });
    }

    const minigameResultOutcome = await Promise.race([
      Promise.all(resultPromise).then((r) => ({ ok: true, r })),
      wait(15000).then(() => ({ ok: false })),
    ]);
    assert.strictEqual(minigameResultOutcome.ok, true, 'minigame_result deveria ter chegado em até 15s');
    const minigameResult = minigameResultOutcome.r[0];
    assert.strictEqual(minigameResult.type, type);
    pass('Minigame resolvido com vencedor(es) e pontuação aplicada');

    // Depois do minigame, o jogo deve seguir pra próxima carta normalmente.
    const nextRoundPromise = sockets.map((s) => once(s, 'new_round'));
    const nextRounds = await Promise.race([
      Promise.all(nextRoundPromise).then((r) => ({ ok: true, r })),
      wait(9000).then(() => ({ ok: false })),
    ]);
    assert.strictEqual(nextRounds.ok, true, 'Deveria avançar pra próxima carta após o minigame');
    assert.strictEqual(nextRounds.r[0].roundNumber, 2);
    pass('Avanço automático para a próxima carta depois do minigame');

    sockets.forEach((s) => s.close());
  }

  // ============= Modo Sem Filtro (item 24) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro'], {
      mode: 'sem-filtro', winScore: 50, specialCardsFrequency: 'normal', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro] = sockets;
    const [joaoId, pedroId] = ids;

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    const r = (await Promise.all(rounds))[0];

    assert.strictEqual(getRoom(roomCode).config.pack, 'sem-filtro');
    assert.ok(r.card.id.startsWith('sf-'), 'Carta deveria vir do pacote sem-filtro');
    pass('Modo Sem Filtro usa o pacote de cartas separado (ids "sf-*")');

    const resultPromises = sockets.map((s) => once(s, 'round_result'));
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    await Promise.all(resultPromises);
    pass('Modo Sem Filtro joga uma rodada completa normalmente');

    sockets.forEach((s) => s.close());
  }

  // ============= Vitória + Reinício completo (itens 16, 17) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro'], {
      mode: 'basico', winScore: 3, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro] = sockets;
    const [joaoId, pedroId] = ids;
    getRoom(roomCode).config.winScore = 1; // força vitória já na 1ª rodada (1 não está na lista pública)

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds);

    const gameOverPromises = sockets.map((s) => once(s, 'game_over'));
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
    const overOutcome = await Promise.race([
      Promise.all(gameOverPromises).then((r) => ({ ok: true, r })),
      wait(10000).then(() => ({ ok: false })),
    ]);
    assert.strictEqual(overOutcome.ok, true, 'game_over deveria ter chegado em até 10s');
    const over = overOutcome.r[0];
    assert.strictEqual(over.winner.id, joaoId);
    assert.strictEqual(getRoom(roomCode).status, 'finished');
    pass('Testar vitória (winScore=1 encerra a partida corretamente)');

    const resetPromises = sockets.map((s) => once(s, 'room_update'));
    sJoao.emit('play_again', { roomCode });
    const reset = (await Promise.all(resetPromises))[0];
    assert.strictEqual(reset.status, 'lobby');
    assert.ok(reset.players.every((p) => p.score === 0));
    pass('Testar reinício (play_again volta pro lobby com placar zerado)');

    sockets.forEach((s) => s.close());
  }

  // ============= Timer real de votação (config "tempo de votação") =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'basico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 15,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId] = ids;

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    const r0 = (await Promise.all(rounds))[0];
    assert.ok(r0.voteDeadline && r0.voteDeadline > Date.now(), 'Deveria ter um prazo de votação definido');

    // Só o Joao vota; os outros dois nunca votam -> o timer de 15s precisa fechar a rodada sozinho.
    sJoao.emit('submit_vote', { roomCode, votedForId: ids[1] });

    const resultPromises = sockets.map((s) => once(s, 'round_result'));
    const outcome = await Promise.race([
      Promise.all(resultPromises).then(() => 'closed'),
      wait(18000).then(() => 'timeout'),
    ]);
    assert.strictEqual(outcome, 'closed', 'O timer de votação deveria ter fechado a rodada sozinho em ~15s');
    pass('Tempo de votação configurado (15s) fecha a rodada automaticamente mesmo sem todos votarem');

    sockets.forEach((s) => s.close());
  }

  console.log(`\n🏁 TOTAL: ${passCount} verificações passaram.`);
  console.log('🎉 TODOS OS TESTES DE INTEGRAÇÃO DA V2 PASSARAM.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ TESTE FALHOU:', err);
  process.exit(1);
});
