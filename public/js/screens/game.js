// public/js/screens/game.js
// Tela 3: HUD (rodada, panela esquentando, Pressão, placar, timer), a
// carta da rodada com sua raridade, a grade de jogadores votáveis
// (respeitando restrições de voto) e a barra de reações rápidas.

import { escapeHtml } from '../ui.js';
import { sfx } from '../audio.js';

const RARITY_LABELS = { comum: 'Comum', especial: 'Especial', caos: 'Caos', lendaria: 'Lendária' };
const REACTION_EMOJIS = ['😂', '💀', '😭', '🤨', '👀', '😡', '🤡', '🔥'];
const PRESSURE_FIRE = ['', '🔥', '🔥🔥', '🔥🔥🔥'];

export function initGameScreen(socket, state) {
  const bar = document.getElementById('reaction-bar');
  bar.innerHTML = '';
  REACTION_EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      socket.emit('send_reaction', { roomCode: state.roomCode, emoji });
    });
    bar.appendChild(btn);
  });

  socket.on('reaction', (data) => spawnFloatingReaction(data, state));
  // Os cliques de voto são ligados dinamicamente em renderPlayersGrid,
  // pois a lista de jogadores e as restrições mudam a cada rodada.
}

function spawnFloatingReaction({ playerId, emoji }, state) {
  const container = document.getElementById('floating-reactions');
  const el = document.createElement('span');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  const player = state.players.find((p) => p.id === playerId);
  const index = state.players.indexOf(player);
  el.style.left = `${10 + (index >= 0 ? (index * 12) % 80 : Math.random() * 80)}%`;
  el.style.bottom = '0px';
  container.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

export function renderNewRound(data, state) {
  state.currentCard = data.card;

  document.getElementById('hud-round-number').textContent = data.roundNumber;
  renderPanela(data.panelaProgress);
  renderPressure(data.pressure);
  renderHudScoreboard(data.scores);
  renderVoteTimer(data.voteDeadline, state);

  const badge = document.getElementById('game-rarity-badge');
  badge.textContent = RARITY_LABELS[data.card.rarity] || data.card.rarity;
  badge.className = 'card-rarity-badge rarity-' + data.card.rarity;

  document.getElementById('game-question-text').textContent = data.card.text;
  document.getElementById('game-voted-hint').classList.add('hidden');
  document.getElementById('game-dispensed-hint').classList.add('hidden');

  const restrictionNote = document.getElementById('game-restriction-note');
  restrictionNote.classList.toggle('hidden', data.voteRestriction?.type !== 'leader_only');

  renderPlayersGrid(data.players, state, data.voteRestriction);

  if (data.card.rarity === 'lendaria') sfx.legendary();
  else if (data.card.rarity === 'caos' || data.card.rarity === 'especial') sfx.special();
}

function renderPanela(progress) {
  const pct = Math.max(0, Math.min(100, progress || 0));
  document.getElementById('hud-panela-fill').style.width = pct + '%';
  document.getElementById('hud-panela-pct').textContent = pct + '%';
}

function renderPressure(pressure) {
  const chip = document.getElementById('hud-pressure');
  if (!pressure || !pressure.enabled || pressure.level <= 0) {
    chip.classList.add('hidden');
    return;
  }
  chip.classList.remove('hidden');
  chip.textContent = `${PRESSURE_FIRE[pressure.level]} ${pressure.label}`;
}

function renderHudScoreboard(scores) {
  const el = document.getElementById('hud-scoreboard');
  const topScore = scores[0]?.score || 0;
  el.innerHTML = scores
    .map((s) => {
      const isLeader = s.score === topScore && topScore > 0;
      const classes = ['hud-score-chip'];
      if (isLeader) classes.push('is-leader');
      if (!s.connected) classes.push('is-offline');
      return `<span class="${classes.join(' ')}">${isLeader ? '👑 ' : ''}${escapeHtml(s.name)}: ${s.score}</span>`;
    })
    .join('');
}

function renderVoteTimer(voteDeadline, state) {
  const chip = document.getElementById('hud-timer');
  const secondsEl = document.getElementById('hud-timer-seconds');
  clearInterval(state.voteDeadlineTimer);

  if (!voteDeadline) {
    chip.classList.add('hidden');
    return;
  }

  chip.classList.remove('hidden');
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((voteDeadline - Date.now()) / 1000));
    secondsEl.textContent = remaining;
    if (remaining <= 0) clearInterval(state.voteDeadlineTimer);
  };
  tick();
  state.voteDeadlineTimer = setInterval(tick, 250);
}

function renderPlayersGrid(players, state, voteRestriction) {
  const grid = document.getElementById('game-players-grid');
  grid.innerHTML = '';

  const restricted = voteRestriction && voteRestriction.type === 'leader_only';
  const leaderIds = voteRestriction?.leaderIds || [];

  const eligibleTargets = players.filter((p) => {
    if (p.id === state.playerId) return false;
    if (restricted) return leaderIds.includes(p.id);
    return true;
  });

  if (restricted && eligibleTargets.length === 0) {
    document.getElementById('game-dispensed-hint').classList.remove('hidden');
  }

  players.forEach((p) => {
    const isMe = p.id === state.playerId;
    const isEligible = !isMe && (!restricted || leaderIds.includes(p.id));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vote-card' + (isMe ? ' vote-card-disabled' : '') + (!isEligible && !isMe ? ' vote-ineligible' : '');
    btn.disabled = isMe || !p.connected || !isEligible;
    btn.dataset.playerId = p.id;

    const crown = restricted && leaderIds.includes(p.id) ? '<span class="vote-crown">👑</span> ' : '';
    btn.innerHTML = `
      <span class="vote-avatar player-avatar-tile" style="background:${p.avatarColor || '#9b5cff'}">${p.avatarEmoji || '😎'}</span>
      <span class="vote-name">${crown}${escapeHtml(p.name)}${isMe ? ' (você)' : ''}</span>
    `;

    if (isEligible && p.connected) {
      btn.addEventListener('click', () => {
        sfx.vote();
        state.socket.emit('submit_vote', { roomCode: state.roomCode, votedForId: p.id });
        grid.querySelectorAll('.vote-card').forEach((b) => (b.disabled = true));
        btn.classList.add('vote-card-selected');
        document.getElementById('game-voted-hint').classList.remove('hidden');
      });
    }

    grid.appendChild(btn);
  });
}

export function renderVoteProgress(data) {
  document.getElementById('game-vote-progress').textContent =
    `${data.votedCount}/${data.totalPlayers} votaram`;
}
