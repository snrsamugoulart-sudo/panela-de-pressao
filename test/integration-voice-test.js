// Testa a camada de SINALIZAÇÃO do chat de voz (a única parte que dá pra
// validar de forma automatizada neste ambiente — o áudio em si depende de
// microfone/navegador real e não roda num sandbox headless). Confirma que
// o servidor: (1) nunca inspeciona o conteúdo do sinal, só retransmite;
// (2) avisa os participantes certos na hora certa; (3) limpa direito
// quando alguém sai ou cai.

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

async function main() {
  const sJoao = await connect('Joao');
  const sPedro = await connect('Pedro');
  const sLucas = await connect('Lucas');

  const createRes = await emitAck(sJoao, 'create_room', { playerName: 'Joao', config: {} });
  const roomCode = createRes.roomCode;
  const joaoId = createRes.playerId;
  const pedroRes = await emitAck(sPedro, 'join_room', { roomCode, playerName: 'Pedro' });
  const pedroId = pedroRes.playerId;
  const lucasRes = await emitAck(sLucas, 'join_room', { roomCode, playerName: 'Lucas' });
  const lucasId = lucasRes.playerId;
  await wait(150);

  // ---- Joao entra sozinho no chat de voz: ninguém mais pra avisar ----
  const joaoJoin = await emitAck(sJoao, 'voice_join', { roomCode });
  assert.strictEqual(joaoJoin.ok, true);
  assert.deepStrictEqual(joaoJoin.participantIds, [], 'Joao é o primeiro, não deveria ter ninguém já conectado');
  assert.deepStrictEqual(getRoom(roomCode).voiceParticipants, new Set([joaoId]));
  pass('Primeiro jogador entra no chat de voz sem ninguém pra notificar');

  // ---- Pedro entra: deve saber que Joao já está lá, e Joao deve ser avisado ----
  const joaoNotified = once(sJoao, 'voice_peer_joined');
  const pedroJoin = await emitAck(sPedro, 'voice_join', { roomCode });
  assert.strictEqual(pedroJoin.ok, true);
  assert.deepStrictEqual(pedroJoin.participantIds, [joaoId]);
  const joaoEvent = await joaoNotified;
  assert.strictEqual(joaoEvent.peerId, pedroId);
  pass('Segundo jogador recebe a lista de quem já está e o primeiro é avisado da chegada dele');

  // ---- Lucas entra: Joao E Pedro devem ser avisados ----
  const bothNotified = Promise.all([once(sJoao, 'voice_peer_joined'), once(sPedro, 'voice_peer_joined')]);
  const lucasJoin = await emitAck(sLucas, 'voice_join', { roomCode });
  assert.strictEqual(lucasJoin.participantIds.sort().join(), [joaoId, pedroId].sort().join());
  const [joaoSawLucas, pedroSawLucas] = await bothNotified;
  assert.strictEqual(joaoSawLucas.peerId, lucasId);
  assert.strictEqual(pedroSawLucas.peerId, lucasId);
  pass('Terceiro jogador é anunciado para TODOS os que já estavam no chat de voz');

  // ---- Sinalização (oferta/resposta/ICE) é retransmitida só pro alvo certo ----
  const lucasReceivesSignal = once(sLucas, 'voice_signal');
  let joaoReceivedWrongly = false;
  const guard = once(sJoao, 'voice_signal').then(() => { joaoReceivedWrongly = true; });

  sPedro.emit('voice_signal', {
    roomCode, targetPlayerId: lucasId, data: { type: 'offer', sdp: 'fake-sdp-conteudo-opaco' },
  });

  const signalReceived = await Promise.race([lucasReceivesSignal, wait(2000).then(() => null)]);
  assert.ok(signalReceived, 'Lucas deveria ter recebido o sinal');
  assert.strictEqual(signalReceived.fromPlayerId, pedroId);
  assert.strictEqual(signalReceived.data.sdp, 'fake-sdp-conteudo-opaco', 'servidor não deve alterar o conteúdo do sinal');
  await Promise.race([guard, wait(300)]);
  assert.strictEqual(joaoReceivedWrongly, false, 'sinal deveria ser PRIVADO — Joao não deveria recebê-lo');
  pass('Sinalização (oferta/resposta/ICE) é retransmitida intacta e só pro destinatário certo');

  // ---- Pedro sai do chat de voz: os que ficaram devem ser avisados ----
  const leaveNotified = Promise.all([once(sJoao, 'voice_peer_left'), once(sLucas, 'voice_peer_left')]);
  sPedro.emit('voice_leave', { roomCode });
  const [joaoSawLeave, lucasSawLeave] = await leaveNotified;
  assert.strictEqual(joaoSawLeave.peerId, pedroId);
  assert.strictEqual(lucasSawLeave.peerId, pedroId);
  assert.strictEqual(getRoom(roomCode).voiceParticipants.has(pedroId), false);
  pass('Sair do chat de voz avisa os demais pra encerrarem a conexão com quem saiu');

  // ---- Lucas cai (desconecta de vez): mesma limpeza deve acontecer automaticamente ----
  const joaoSeesDrop = once(sJoao, 'voice_peer_left');
  sLucas.close();
  const dropEvent = await joaoSeesDrop;
  assert.strictEqual(dropEvent.peerId, lucasId);
  assert.strictEqual(getRoom(roomCode).voiceParticipants.has(lucasId), false);
  pass('Queda de conexão limpa o chat de voz automaticamente (sem precisar de voice_leave explícito)');

  // ---- Estado de mute é só um aviso cosmético, propagado pra sala toda ----
  const muteNotified = once(sPedro, 'voice_mute_state');
  sJoao.emit('voice_mute_state', { roomCode, muted: true });
  const muteEvent = await muteNotified;
  assert.strictEqual(muteEvent.playerId, joaoId);
  assert.strictEqual(muteEvent.muted, true);
  pass('Estado de mudo é propagado pra sala (indicador visual de "silenciado")');

  console.log(`\n🏁 TOTAL: ${passCount} verificações passaram.`);
  console.log('🎉 SINALIZAÇÃO DO CHAT DE VOZ VALIDADA DE PONTA A PONTA.');
  console.log('\n⚠️  Nota honesta: isto testa a SINALIZAÇÃO (quem fala com quem, quando).');
  console.log('   O áudio em si (captura de microfone, codec, transmissão P2P) só pode');
  console.log('   ser validado em navegadores reais — não roda num sandbox headless.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ TESTE FALHOU:', err);
  process.exit(1);
});
