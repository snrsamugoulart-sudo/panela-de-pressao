// public/js/voice.js
// Chat de voz em tempo real via WebRTC (malha: cada jogador conecta
// diretamente com todos os outros — funciona bem até ~12 pessoas, que é
// o limite atual de jogadores por sala). O servidor NUNCA vê o áudio —
// ele só retransmite mensagens de sinalização (ver 'voice_*' em
// src/socketHandlers.js).
//
// Limitação honesta: só usamos servidores STUN públicos (gratuitos) para
// atravessar NAT. Em redes muito restritivas (algumas redes corporativas,
// certos NATs simétricos), a conexão direta pode falhar — a solução
// definitiva seria um servidor TURN próprio, que exige infraestrutura
// paga/hospedada e não está incluído neste protótipo.

import { escapeHtml, showToast } from './ui.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const SPEAKING_THRESHOLD = 0.02;
const SPEAKING_CHECK_INTERVAL_MS = 150;

let socketRef = null;
let stateRef = null;

let localStream = null;
let pushToTalkEnabled = false;
let micHeldDown = false;
let inVoice = false;

const peerConnections = new Map(); // peerId -> RTCPeerConnection
const remoteAudioEls = new Map(); // peerId -> <audio>
const analysers = new Map(); // peerId | 'local' -> { analyser, dataArray }
let audioCtx = null;
let speakingCheckInterval = null;

function getPlayerName(peerId) {
  const player = (stateRef.players || []).find((p) => p.id === peerId);
  return player ? player.name : 'Jogador';
}

function ensureAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function attachAnalyser(key, stream) {
  try {
    const ctx = ensureAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analysers.set(key, { analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) });
  } catch {
    // Analyser é só cosmético (indicador de "falando"); se falhar, o áudio
    // continua funcionando normalmente, só sem o anel animado.
  }
}

function detachAnalyser(key) {
  analysers.delete(key);
  setSpeakingVisual(key, false);
}

function setSpeakingVisual(key, speaking) {
  const els = document.querySelectorAll(`[data-voice-avatar="${key}"]`);
  els.forEach((el) => el.classList.toggle('is-speaking', speaking));
}

function startSpeakingLoop() {
  if (speakingCheckInterval) return;
  speakingCheckInterval = setInterval(() => {
    analysers.forEach(({ analyser, dataArray }, key) => {
      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      setSpeakingVisual(key, rms > SPEAKING_THRESHOLD);
    });
  }, SPEAKING_CHECK_INTERVAL_MS);
}

function stopSpeakingLoop() {
  clearInterval(speakingCheckInterval);
  speakingCheckInterval = null;
}

function createPeerConnection(peerId) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(peerId, pc);

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketRef.emit('voice_signal', {
        roomCode: stateRef.roomCode,
        targetPlayerId: peerId,
        data: { type: 'ice-candidate', candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    let audioEl = remoteAudioEls.get(peerId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.dataset.peerId = peerId;
      document.body.appendChild(audioEl);
      remoteAudioEls.set(peerId, audioEl);
    }
    audioEl.srcObject = event.streams[0];
    attachAnalyser(peerId, event.streams[0]);
    startSpeakingLoop();
  };

  return pc;
}

function closePeerConnection(peerId) {
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.close();
    peerConnections.delete(peerId);
  }
  const audioEl = remoteAudioEls.get(peerId);
  if (audioEl) {
    audioEl.srcObject = null;
    audioEl.remove();
    remoteAudioEls.delete(peerId);
  }
  detachAnalyser(peerId);
  renderParticipantsList();
}

async function initiateOfferTo(peerId) {
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socketRef.emit('voice_signal', {
    roomCode: stateRef.roomCode,
    targetPlayerId: peerId,
    data: { type: 'offer', sdp: pc.localDescription },
  });
}

async function handleIncomingSignal({ fromPlayerId, data }) {
  if (data.type === 'offer') {
    const pc = createPeerConnection(fromPlayerId);
    await pc.setRemoteDescription(data.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.emit('voice_signal', {
      roomCode: stateRef.roomCode,
      targetPlayerId: fromPlayerId,
      data: { type: 'answer', sdp: pc.localDescription },
    });
  } else if (data.type === 'answer') {
    const pc = peerConnections.get(fromPlayerId);
    if (pc) await pc.setRemoteDescription(data.sdp);
  } else if (data.type === 'ice-candidate') {
    const pc = peerConnections.get(fromPlayerId);
    if (pc) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        // Candidato chegou fora de ordem/tarde — inofensivo, ignora.
      }
    }
  }
}

function setMicEnabled(enabled) {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((track) => { track.enabled = enabled; });
}

async function joinVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    showToast('Não consegui acessar o microfone. Verifique a permissão do navegador.', true);
    return;
  }

  attachAnalyser('local', localStream);
  startSpeakingLoop();
  setMicEnabled(!pushToTalkEnabled); // open mic começa ligado; push-to-talk começa mudo até segurar

  socketRef.emit('voice_join', { roomCode: stateRef.roomCode }, (res) => {
    if (!res?.ok) {
      showToast(res?.error || 'Não foi possível entrar no chat de voz.', true);
      return;
    }
    inVoice = true;
    updateJoinLeaveButtons();
    // Pra cada participante que já estava lá, garantimos que a peer
    // connection existe do nosso lado pra receber a oferta deles (o
    // servidor já avisou eles via 'voice_peer_joined').
    res.participantIds.forEach((peerId) => createPeerConnection(peerId));
    renderParticipantsList();
  });
}

function leaveVoice() {
  socketRef.emit('voice_leave', { roomCode: stateRef.roomCode });
  [...peerConnections.keys()].forEach(closePeerConnection);

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  detachAnalyser('local');
  if (analysers.size === 0) stopSpeakingLoop();

  inVoice = false;
  updateJoinLeaveButtons();
  renderParticipantsList();
}

function updateJoinLeaveButtons() {
  document.getElementById('btn-voice-join').classList.toggle('hidden', inVoice);
  document.getElementById('btn-voice-leave').classList.toggle('hidden', !inVoice);
  document.getElementById('btn-voice-mic').classList.toggle('hidden', !inVoice || !pushToTalkEnabled);
  document.getElementById('voice-ptt-checkbox').disabled = inVoice;
}

function renderParticipantsList() {
  const list = document.getElementById('voice-participants-list');
  const ids = [...new Set([...peerConnections.keys(), ...(inVoice ? [stateRef.playerId] : [])])];
  document.getElementById('voice-count').textContent = `${ids.length} conectado${ids.length === 1 ? '' : 's'}`;

  list.innerHTML = ids
    .map((id) => {
      const isMe = id === stateRef.playerId;
      return `
        <li class="voice-participant-row">
          <span class="voice-avatar-ring" data-voice-avatar="${isMe ? 'local' : id}">🎙️</span>
          <span class="voice-participant-name">${escapeHtml(getPlayerName(id))}${isMe ? ' (você)' : ''}</span>
          ${!isMe ? `
            <input type="range" min="0" max="100" value="100" class="voice-volume-slider" data-peer-id="${id}" />
            <button type="button" class="voice-mute-peer-btn" data-peer-id="${id}">🔊</button>
          ` : ''}
        </li>
      `;
    })
    .join('');
}

export function initVoiceModule(socket, state) {
  socketRef = socket;
  stateRef = state;

  const joinBtn = document.getElementById('btn-voice-join');
  const leaveBtn = document.getElementById('btn-voice-leave');
  const pttCheckbox = document.getElementById('voice-ptt-checkbox');
  const micBtn = document.getElementById('btn-voice-mic');
  const toggleBtn = document.getElementById('btn-voice-toggle');
  const panel = document.getElementById('voice-panel');

  toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));

  joinBtn.addEventListener('click', joinVoice);
  leaveBtn.addEventListener('click', leaveVoice);

  pttCheckbox.addEventListener('change', () => {
    pushToTalkEnabled = pttCheckbox.checked;
    updateJoinLeaveButtons();
  });

  const startTalk = (e) => { e.preventDefault(); micHeldDown = true; setMicEnabled(true); };
  const stopTalk = (e) => { if (e) e.preventDefault(); micHeldDown = false; setMicEnabled(false); };
  micBtn.addEventListener('mousedown', startTalk);
  micBtn.addEventListener('touchstart', startTalk);
  micBtn.addEventListener('mouseup', stopTalk);
  micBtn.addEventListener('mouseleave', () => { if (micHeldDown) stopTalk(); });
  micBtn.addEventListener('touchend', stopTalk);

  document.getElementById('voice-participants-list').addEventListener('input', (event) => {
    if (!event.target.classList.contains('voice-volume-slider')) return;
    const peerId = event.target.dataset.peerId;
    const audioEl = remoteAudioEls.get(peerId);
    if (audioEl) audioEl.volume = Number(event.target.value) / 100;
  });

  document.getElementById('voice-participants-list').addEventListener('click', (event) => {
    const btn = event.target.closest('.voice-mute-peer-btn');
    if (!btn) return;
    const peerId = btn.dataset.peerId;
    const audioEl = remoteAudioEls.get(peerId);
    if (!audioEl) return;
    audioEl.muted = !audioEl.muted;
    btn.textContent = audioEl.muted ? '🔇' : '🔊';
  });

  socket.on('voice_peer_joined', ({ peerId }) => {
    initiateOfferTo(peerId).catch(() => showToast('Erro ao conectar o áudio com um jogador.', true));
  });

  socket.on('voice_signal', (payload) => {
    handleIncomingSignal(payload).catch(() => {});
  });

  socket.on('voice_peer_left', ({ peerId }) => {
    closePeerConnection(peerId);
  });

  socket.on('voice_participants_update', () => {
    renderParticipantsList();
  });

  socket.on('voice_mute_state', ({ playerId, muted }) => {
    const key = playerId === stateRef.playerId ? 'local' : playerId;
    const el = document.querySelector(`[data-voice-avatar="${key}"]`);
    if (el) el.classList.toggle('is-muted', !!muted);
  });

  // Se o socket cair e reconectar (não confundir com rejoin_room da
  // partida), o chat de voz precisa ser reiniciado manualmente — como o
  // fluxo de mídia (microfone) não sobrevive a uma troca de conexão.
  socket.on('disconnect', () => {
    if (inVoice) leaveVoice();
  });
}

export function isInVoiceChat() {
  return inVoice;
}
