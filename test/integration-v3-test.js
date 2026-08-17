// Teste de integração das funcionalidades NOVAS da V3 (as funcionalidades
// herdadas da V2 já são cobertas por test/integration-v2-test.js, que
// continua rodando e passando). Sobe o servidor de verdade no mesmo
// processo, pra poder espiar/forçar estado em cenários difíceis de
// alcançar só por sorte de RNG (ex: qual minigame caiu).

const assert = require('assert');
const { io: ioClient } = require('socket.io-client');
require('../server');
const { getRoom } = require('../src/rooms');

const URL = 'http://localhost:3000';

function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(URL);
    const t = setTimeout(() => reject(new Error(`timeout conectando ${name}`)), 8000);
    socket.on('connect', () => { clearTimeout(t); resolve(socket); });
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
  const tokens = [createRes.reconnectToken];

  for (let i = 0; i < others.length; i++) {
    const res = await emitAck(others[i], 'join_room', { roomCode, playerName: names[i + 1] });
    assert.strictEqual(res.ok, true, `entrada falhou para ${names[i + 1]}: ` + JSON.stringify(res));
    ids.push(res.playerId);
    tokens.push(res.reconnectToken);
  }
  await wait(200);
  return { sockets, ids, tokens, roomCode };
}

async function main() {
  // ============= RECONEXÃO (item novo da V3) =============
  {
    const { sockets, ids, tokens, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'basico', winScore: 50, specialCardsFrequency: 'off', minigameInterval: 0, voteTimeLimitSec: 0,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId] = ids;
    const pedroToken = tokens[1];

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds);

    // Pedro cai no meio da rodada.
    const updateAfterDrop = once(sJoao, 'room_update');
    sPedro.close();
    const afterDrop = await updateAfterDrop;
    assert.strictEqual(afterDrop.players.find((p) => p.id === pedroId).connected, false);
    pass('Jogador cai e fica marcado como offline (registro preservado, não removido, pois a partida já começou)');

    // Reconecta com um socket NOVO usando o token salvo.
    const sPedroNovo = await connect('Pedro (reconectado)');
    const catchUpPromise = once(sPedroNovo, 'new_round'); // deve receber o snapshot da rodada atual
    const rejoinRes = await emitAck(sPedroNovo, 'rejoin_room', { roomCode, reconnectToken: pedroToken });
    assert.strictEqual(rejoinRes.ok, true, 'rejoin deveria funcionar: ' + JSON.stringify(rejoinRes));
    assert.strictEqual(rejoinRes.playerId, pedroId, 'reconexão deveria devolver o MESMO playerId de antes');

    const caughtUp = await catchUpPromise;
    assert.ok(caughtUp.card && caughtUp.card.text, 'reconexão deveria trazer a carta da rodada em andamento');
    pass('rejoin_room recupera a mesma sessão (mesmo playerId) e reenvia a carta da rodada atual');

    assert.strictEqual(getRoom(roomCode).players.size, 3, 'reconectar não deveria criar um jogador duplicado');
    pass('Reconexão não duplica jogador na sala');

    // Com o Pedro "de volta", a rodada consegue fechar normalmente com os 3 votando.
    // (usa sPedroNovo no lugar do socket antigo, que já foi fechado)
    const resultPromises = [sJoao, sLucas, sPedroNovo].map((s) => once(s, 'round_result'));
    sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
    sPedroNovo.emit('submit_vote', { roomCode, votedForId: joaoId });
    sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });
    const results = await Promise.all(resultPromises);
    assert.ok(results[0].votesDetail.some((v) => v.voteCount > 0));
    pass('Depois de reconectado, o jogador consegue votar e a rodada fecha normalmente');

    sJoao.close(); sLucas.close(); sPedroNovo.close();
  }

  // ============= PERGUNTAS DA GALERA (item novo da V3) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'caotico', winScore: 50,
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [, pedroId] = ids;

    const enablePromise = once(sJoao, 'room_update');
    sJoao.emit('update_config', { roomCode, config: { customQuestionsEnabled: true } });
    const enabled = await enablePromise;
    assert.strictEqual(enabled.config.customQuestionsEnabled, true);
    pass('Host habilita "Perguntas da Galera" na configuração');

    const submitRes = await emitAck(sPedro, 'submit_custom_question', {
      roomCode, text: 'Quem provavelmente esqueceria de devolver o carregador emprestado?',
    });
    assert.strictEqual(submitRes.ok, true, 'envio deveria funcionar: ' + JSON.stringify(submitRes));
    pass('Jogador consegue submeter uma pergunta da galera válida');

    const tooShort = await emitAck(sPedro, 'submit_custom_question', { roomCode, text: 'oi' });
    assert.strictEqual(tooShort.ok, false);
    pass('Pergunta curta demais é rejeitada com validação clara');

    const questionId = submitRes.question.id;
    const wrongRemoval = await emitAck(sLucas, 'remove_custom_question', { roomCode, questionId });
    assert.strictEqual(wrongRemoval.ok, false, 'outro jogador (não autor, não host) não deveria poder remover');
    pass('Só o autor ou o anfitrião pode remover uma pergunta da galera');

    const hostRemovePromise = once(sJoao, 'room_update');
    const hostRemoval = await emitAck(sJoao, 'remove_custom_question', { roomCode, questionId });
    assert.strictEqual(hostRemoval.ok, true);
    const afterRemoval = await hostRemovePromise;
    assert.strictEqual(afterRemoval.customQuestions.length, 0);
    pass('Anfitrião consegue remover uma pergunta da galera de outro jogador');

    sockets.forEach((s) => s.close());
  }

  // ============= REAÇÕES RÁPIDAS (item novo da V3) =============
  {
    const { sockets, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro'], { mode: 'basico', winScore: 50 });
    const [sJoao, sPedro] = sockets;

    const rounds = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds);

    const reactionPromise = once(sPedro, 'reaction');
    sJoao.emit('send_reaction', { roomCode, emoji: '😂' });
    const received = await reactionPromise;
    assert.strictEqual(received.emoji, '😂');
    pass('Reação rápida chega em tempo real pros outros jogadores');

    // Segunda reação imediata (dentro do cooldown) não deve gerar novo evento.
    let secondArrived = false;
    const guard = once(sPedro, 'reaction').then(() => { secondArrived = true; });
    sJoao.emit('send_reaction', { roomCode, emoji: '🔥' });
    await Promise.race([guard, wait(400)]);
    assert.strictEqual(secondArrived, false, 'cooldown deveria bloquear reação tão rápida');
    pass('Cooldown anti-spam de reações funcionando');

    sockets.forEach((s) => s.close());
  }

  // ============= MINIGAMES (cobertura ampla via fluxo real de socket) =============
  {
    const { sockets, ids, roomCode } = await createRoomWithPlayers(['Joao', 'Pedro', 'Lucas'], {
      mode: 'caotico', winScore: 10, specialCardsFrequency: 'off', pressureLevel: 'off',
    });
    const [sJoao, sPedro, sLucas] = sockets;
    const [joaoId, pedroId, lucasId] = ids;

    const rounds0 = sockets.map((s) => once(s, 'new_round'));
    sJoao.emit('start_game', { roomCode });
    await Promise.all(rounds0);
    getRoom(roomCode).config.minigameInterval = 1; // dispara minigame toda rodada
    getRoom(roomCode).config.winScore = 999; // evita a partida acabar no meio do teste

    const seenTypes = new Set();
    const TRIALS = 8;

    for (let i = 0; i < TRIALS; i++) {
      const startPromise = sockets.map((s) => once(s, 'minigame_start'));
      const resultPromise = sockets.map((s) => once(s, 'minigame_result'));
      const gameOverGuard = once(sJoao, 'game_over').then(() => ({ unexpectedGameOver: true }));

      // Fecha a pergunta normal da rodada pra disparar o minigame em seguida.
      sJoao.emit('submit_vote', { roomCode, votedForId: pedroId });
      sPedro.emit('submit_vote', { roomCode, votedForId: joaoId });
      sLucas.emit('submit_vote', { roomCode, votedForId: joaoId });

      const starts = await Promise.race([
        Promise.all(startPromise).then((r) => ({ ok: true, r })),
        gameOverGuard,
        wait(12000).then(() => ({ ok: false })),
      ]);
      assert.ok(!starts.unexpectedGameOver, `partida terminou inesperadamente na tentativa ${i} (ajustar winScore do teste)`);
      assert.strictEqual(starts.ok, true, `minigame_start não chegou na tentativa ${i}`);
      const type = starts.r[0].type;
      seenTypes.add(type);

      // Responde de forma genérica, cobrindo os 6 tipos possíveis.
      if (type === 'coroa') {
        const ev = await once(sJoao, 'minigame_event');
        if (ev.event === 'crown_appear') sJoao.emit('minigame_action', { roomCode });
      } else if (type === 'alvo-certo') {
        const ev = await once(sJoao, 'minigame_event');
        if (ev.event === 'targets_appear') {
          // Descobre o índice correto espiando o estado do servidor (só pra teste).
          const correctIndex = getRoom(roomCode).minigameState?.correctIndex ?? 0;
          sJoao.emit('minigame_action', { roomCode, targetIndex: correctIndex });
        }
      } else if (type === 'dedo-nervoso' || type === 'tiro-ao-alvo') {
        for (let c = 0; c < 5; c++) sJoao.emit('minigame_action', { roomCode });
      } else if (type === 'nao-clique') {
        sPedro.emit('minigame_action', { roomCode }); // Pedro clica, Joao/Lucas resistem
      } else if (type === 'batata-quente') {
        await once(sJoao, 'minigame_event'); // só espera passar, ninguém age
      }

      const results = await Promise.race([
        Promise.all(resultPromise).then((r) => ({ ok: true, r })),
        wait(12000).then(() => ({ ok: false })),
      ]);
      assert.strictEqual(results.ok, true, `minigame_result não chegou na tentativa ${i} (tipo ${type})`);
      assert.strictEqual(results.r[0].type, type);

      // Avança pra próxima carta normal antes do próximo laço — e GARANTE
      // que ela realmente chegou antes de tentar votar nela de novo.
      const nextRounds = sockets.map((s) => once(s, 'new_round'));
      const nextOutcome = await Promise.race([
        Promise.all(nextRounds).then(() => true),
        wait(10000).then(() => false),
      ]);
      assert.strictEqual(nextOutcome, true, `próxima rodada não chegou depois do minigame (tentativa ${i})`);
      getRoom(roomCode).config.minigameInterval = 1;
    }

    pass(`Minigames disparam e resolvem corretamente via socket real (tipos observados: ${[...seenTypes].join(', ')})`);
    const newTypesSeen = ['alvo-certo', 'tiro-ao-alvo', 'batata-quente'].filter((t) => seenTypes.has(t));
    console.log(`   (dos 3 minigames novos da V3, apareceram nesta rodada de testes: ${newTypesSeen.join(', ') || 'nenhum — apenas azar do sorteio, já cobertos nos testes unitários'})`);

    sockets.forEach((s) => s.close());
  }

  console.log(`\n🏁 TOTAL: ${passCount} verificações passaram.`);
  console.log('🎉 TODOS OS TESTES DE INTEGRAÇÃO DA V3 PASSARAM.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ TESTE FALHOU:', err);
  process.exit(1);
});
