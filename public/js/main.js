// public/js/main.js
// Ponto de entrada do front-end: abre a conexão Socket.IO, inicializa
// cada tela, tenta retomar uma sessão anterior (reconexão) e liga os
// eventos recebidos do servidor às funções de renderização de cada tela.

import { state, loadReconnectInfo, saveReconnectInfo } from './state.js';
import { showScreen, showToast } from './ui.js';
import { initHomeScreen } from './screens/home.js';
import { initLobbyScreen, renderLobby } from './screens/lobby.js';
import { initGameScreen, renderNewRound, renderVoteProgress } from './screens/game.js';
import {
  initResultScreen, renderRoundResult, showEffectChoicePrompt, showEffectWaiting, showEffectResolved,
} from './screens/result.js';
import { initMinigameScreen, renderMinigameStart, handleMinigameEvent, renderMinigameResult } from './screens/minigame.js';
import { initVictoryScreen, renderVictory } from './screens/victory.js';
import { isMuted, toggleMuted } from './audio.js';
import { initVoiceModule } from './voice.js';

const socket = io();
state.socket = socket;

initHomeScreen(socket, state);
initLobbyScreen(socket, state);
initGameScreen(socket, state);
initResultScreen(socket, state);
initMinigameScreen(socket, state);
initVictoryScreen(socket, state);
initVoiceModule(socket, state);

// --- Botão de mute -------------------------------------------------------

const muteBtn = document.getElementById('btn-mute');
function renderMuteButton() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}
muteBtn.addEventListener('click', () => {
  toggleMuted();
  renderMuteButton();
});
renderMuteButton();

// --- Reconexão automática -------------------------------------------------
// Se a URL tem ?sala=XXXX e existe um token salvo pra essa sala no
// localStorage, tenta retomar a sessão em vez de mostrar a tela inicial.

const params = new URLSearchParams(window.location.search);
const roomFromLink = params.get('sala');
if (roomFromLink) {
  const saved = loadReconnectInfo(roomFromLink.toUpperCase());
  if (saved?.reconnectToken) {
    socket.emit('rejoin_room', { roomCode: roomFromLink.toUpperCase(), reconnectToken: saved.reconnectToken }, (res) => {
      if (res?.ok) {
        state.playerId = res.playerId;
        state.roomCode = res.roomCode;
        state.reconnectToken = res.reconnectToken;
        saveReconnectInfo(res.roomCode, res.playerId, res.reconnectToken);
        showToast('Sessão retomada!');
      }
      // Se falhar, a pessoa simplesmente vê a tela inicial normalmente
      // (código já vem pré-preenchido pelo home.js).
    });
  }
}

// --- Eventos vindos do servidor ---------------------------------------

socket.on('room_update', (room) => {
  state.roomCode = room.code;
  state.hostId = room.hostId;
  state.players = room.players;
  state.config = room.config;

  document.getElementById('btn-voice-toggle').classList.remove('hidden');

  if (room.status === 'lobby') {
    renderLobby(room, state);
    showScreen('screen-lobby');
  }
});

socket.on('new_round', (data) => {
  state.players = data.players;
  renderNewRound(data, state);
  showScreen('screen-game');
});

socket.on('vote_progress', (data) => {
  renderVoteProgress(data, state);
});

socket.on('round_result', (data) => {
  renderRoundResult(data, state);
  showScreen('screen-result');
});

socket.on('effect_choice_prompt', (data) => {
  showEffectChoicePrompt(data, state);
});

socket.on('effect_choice_waiting', (data) => {
  showEffectWaiting(data, state);
});

socket.on('effect_resolved', (data) => {
  showEffectResolved(data, state);
});

socket.on('minigame_start', (data) => {
  renderMinigameStart(data, state);
  showScreen('screen-minigame');
});

socket.on('minigame_event', (data) => {
  handleMinigameEvent(data, state);
});

socket.on('minigame_result', (data) => {
  renderMinigameResult(data, state);
});

socket.on('game_over', (data) => {
  renderVictory(data, state);
  showScreen('screen-victory');
});

socket.on('error_message', (data) => {
  showToast(data.message, true);
});

socket.on('connect_error', () => {
  showToast('Não foi possível conectar ao servidor.', true);
});

socket.on('disconnect', () => {
  showToast('Conexão perdida. Tentando reconectar...', true);
});
