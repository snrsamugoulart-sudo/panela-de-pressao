// public/js/screens/lobby.js
// Tela 2: sala de espera + painel de configuração da partida + Perguntas
// da Galera. Só o anfitrião pode alterar a config; os demais veem o
// estado atual em tempo real.

import { showToast, escapeHtml } from '../ui.js';
import { sfx } from '../audio.js';

function parseConfigValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw; // cobre 'random', 'off', 'poucas', etc.
}

export function initLobbyScreen(socket, state) {
  document.getElementById('btn-start-game').addEventListener('click', () => {
    sfx.click();
    socket.emit('start_game', { roomCode: state.roomCode });
  });

  document.getElementById('btn-copy-link').addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}?sala=${state.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link do convite copiado!');
    } catch {
      showToast(url);
    }
  });

  // Delegação de clique: qualquer botão dentro de um grupo [data-config-key]
  // dispara update_config, mas só se eu for o anfitrião (checado nos dois
  // lados — aqui pra UX, no servidor pra valer).
  document.getElementById('lobby-config').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    if (state.playerId !== state.hostId) return;

    sfx.click();
    const group = button.closest('[data-config-key]');
    const key = group.dataset.configKey;
    const value = parseConfigValue(button.dataset.value);

    socket.emit('update_config', { roomCode: state.roomCode, config: { [key]: value } });
  });

  const questionInput = document.getElementById('input-custom-question');
  document.getElementById('btn-submit-custom-question').addEventListener('click', () => {
    const text = questionInput.value.trim();
    if (!text) return;
    socket.emit('submit_custom_question', { roomCode: state.roomCode, text }, (res) => {
      if (!res?.ok) return showToast(res?.error || 'Não foi possível enviar a pergunta.', true);
      questionInput.value = '';
      sfx.click();
    });
  });
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-submit-custom-question').click();
  });

  document.getElementById('custom-questions-list').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-remove-id]');
    if (!btn) return;
    socket.emit('remove_custom_question', { roomCode: state.roomCode, questionId: btn.dataset.removeId }, (res) => {
      if (!res?.ok) showToast(res?.error || 'Não foi possível remover.', true);
    });
  });
}

function renderConfigPanel(config, isHost) {
  const panel = document.getElementById('lobby-config');
  panel.querySelectorAll('[data-config-key]').forEach((group) => {
    const key = group.dataset.configKey;
    const currentValue = config[key];

    group.querySelectorAll('button[data-value]').forEach((button) => {
      const btnValue = parseConfigValue(button.dataset.value);
      button.classList.toggle('active', btnValue === currentValue);
      button.disabled = !isHost;
    });
  });
}

function renderCustomQuestionsPanel(room, state) {
  const panel = document.getElementById('custom-questions-panel');
  const enabled = !!room.config.customQuestionsEnabled;
  panel.classList.toggle('hidden', !enabled);
  if (!enabled) return;

  const list = room.customQuestions || [];
  document.getElementById('custom-questions-count').textContent = `(${list.length})`;

  const isHost = state.playerId === room.hostId;
  const listEl = document.getElementById('custom-questions-list');
  listEl.innerHTML = list
    .map((q) => {
      const canRemove = isHost || q.authorId === state.playerId;
      return `
        <li class="custom-question-item">
          <span class="cq-text">${escapeHtml(q.text)}</span>
          <span class="cq-author">— ${escapeHtml(q.authorName)}</span>
          ${canRemove ? `<button class="cq-remove" data-remove-id="${q.id}" type="button">✕</button>` : ''}
        </li>
      `;
    })
    .join('');
}

export function renderLobby(room, state) {
  document.getElementById('lobby-room-code').textContent = room.code;
  document.getElementById('lobby-count').textContent = `(${room.players.length})`;

  const list = document.getElementById('lobby-players');
  list.innerHTML = room.players
    .map((p) => `
      <li class="player-item ${p.connected ? '' : 'player-offline'}">
        <span class="player-avatar-tile" style="background:${p.avatarColor || '#9b5cff'}">${p.avatarEmoji || '😎'}</span>
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${p.id === room.hostId ? '<span class="host-badge">Anfitrião</span>' : ''}
        ${p.connected ? '' : '<span class="offline-badge">offline</span>'}
      </li>
    `)
    .join('');

  const isHost = state.playerId === room.hostId;
  renderConfigPanel(room.config, isHost);
  renderCustomQuestionsPanel(room, state);

  const startBtn = document.getElementById('btn-start-game');
  const hint = document.getElementById('lobby-hint');

  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = room.players.length < 2;
    hint.textContent = room.players.length < 2
      ? 'É preciso pelo menos 2 jogadores para começar.'
      : 'Tudo pronto! Ajuste a configuração acima e inicie quando quiser.';
  } else {
    startBtn.classList.add('hidden');
    hint.textContent = 'Aguardando o anfitrião iniciar a partida...';
  }
}
