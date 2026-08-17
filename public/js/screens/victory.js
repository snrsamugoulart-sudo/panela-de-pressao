// public/js/screens/victory.js
// Tela 5: vencedor da partida, placar final e opção de jogar novamente.

import { renderScoreboardList } from './result.js';

export function initVictoryScreen(socket, state) {
  document.getElementById('btn-play-again').addEventListener('click', () => {
    socket.emit('play_again', { roomCode: state.roomCode });
  });
}

export function renderVictory(data, state) {
  document.getElementById('victory-winner-name').textContent = data.winner.name;
  document.title = `${data.winner.name} venceu! — Panela de Pressão`;

  renderScoreboardList(document.getElementById('victory-scoreboard'), data.finalScores, state.playerId);

  const isHost = state.playerId === state.hostId;
  document.getElementById('btn-play-again').classList.toggle('hidden', !isHost);
  document.getElementById('victory-wait-hint').classList.toggle('hidden', isHost);

  spawnConfetti();
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#ff3d81', '#9b5cff', '#ffd23f', '#35d488', '#3fd6ff'];

  for (let i = 0; i < 42; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(Math.random() * 1.2).toFixed(2)}s`;
    piece.style.animationDuration = `${(2 + Math.random() * 1.5).toFixed(2)}s`;
    container.appendChild(piece);
  }
}
