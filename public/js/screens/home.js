// public/js/screens/home.js
// Tela 1: nome do jogador, avatar, criar sala ou entrar com um código.
// Também tenta reconectar sozinho a uma sessão anterior (ver tryAutoRejoin
// em main.js) antes mesmo de mostrar essa tela.

import { showToast } from '../ui.js';
import { saveReconnectInfo } from '../state.js';

const AVATAR_COLORS = ['#ff3d81', '#9b5cff', '#ffd23f', '#35d488', '#3fd6ff', '#ff8a2b'];
const AVATAR_EMOJIS = ['😎', '🤡', '👻', '🐸', '🦄', '🐙', '🤖', '👽', '🐵', '🦊', '🐼', '🧟'];

function renderAvatarPickers(state) {
  const colorRow = document.getElementById('avatar-color-picker');
  const emojiRow = document.getElementById('avatar-emoji-picker');

  state.avatarColor = state.avatarColor || AVATAR_COLORS[0];
  state.avatarEmoji = state.avatarEmoji || AVATAR_EMOJIS[0];

  colorRow.innerHTML = '';
  AVATAR_COLORS.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-swatch' + (color === state.avatarColor ? ' active' : '');
    btn.style.background = color;
    btn.addEventListener('click', () => {
      state.avatarColor = color;
      renderAvatarPickers(state);
    });
    colorRow.appendChild(btn);
  });

  emojiRow.innerHTML = '';
  AVATAR_EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-emoji-btn' + (emoji === state.avatarEmoji ? ' active' : '');
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      state.avatarEmoji = emoji;
      renderAvatarPickers(state);
    });
    emojiRow.appendChild(btn);
  });
}

export function initHomeScreen(socket, state) {
  const nameInput = document.getElementById('input-name');
  const codeInput = document.getElementById('input-code');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');

  renderAvatarPickers(state);

  // Se a pessoa entrou por um link de convite (?sala=XXXX), pré-preenche o código.
  const params = new URLSearchParams(window.location.search);
  const roomFromLink = params.get('sala');
  if (roomFromLink) {
    codeInput.value = roomFromLink.toUpperCase();
  }

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const avatar = () => ({ color: state.avatarColor, emoji: state.avatarEmoji });

  btnCreate.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return showToast('Digite seu nome primeiro.', true);

    btnCreate.disabled = true;
    socket.emit('create_room', { playerName: name, config: {}, avatar: avatar() }, (res) => {
      btnCreate.disabled = false;
      if (!res?.ok) return showToast(res?.error || 'Erro ao criar sala.', true);

      state.playerId = res.playerId;
      state.playerName = name;
      state.roomCode = res.roomCode;
      state.reconnectToken = res.reconnectToken;
      saveReconnectInfo(res.roomCode, res.playerId, res.reconnectToken);
      history.replaceState(null, '', `?sala=${res.roomCode}`);
    });
  });

  btnJoin.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();

    if (!name) return showToast('Digite seu nome primeiro.', true);
    if (code.length !== 4) return showToast('O código da sala tem 4 caracteres.', true);

    btnJoin.disabled = true;
    socket.emit('join_room', { playerName: name, roomCode: code, avatar: avatar() }, (res) => {
      btnJoin.disabled = false;
      if (!res?.ok) return showToast(res?.error || 'Erro ao entrar na sala.', true);

      state.playerId = res.playerId;
      state.playerName = name;
      state.roomCode = res.roomCode;
      state.reconnectToken = res.reconnectToken;
      saveReconnectInfo(res.roomCode, res.playerId, res.reconnectToken);
      history.replaceState(null, '', `?sala=${res.roomCode}`);
    });
  });
}
