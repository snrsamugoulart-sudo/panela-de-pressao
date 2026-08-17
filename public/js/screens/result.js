// public/js/screens/result.js
// Tela 4: revelação dos votos, vencedor da rodada, placar — e, quando a
// carta é interativa (Ganância / Vingança), o painel de escolha do
// vencedor (ou de espera, para quem não é o vencedor).
//
// Também exporta renderScoreboardList, reaproveitada na tela de vitória.

import { escapeHtml } from '../ui.js';
import { sfx } from '../audio.js';

const RARITY_LABELS = { comum: 'Comum', especial: 'Especial', caos: 'Caos', lendaria: 'Lendária' };

let countdownInterval = null;

export function initResultScreen(socket, state) {
  state._effectSelection = { targetPlayerId: null, sign: null };
}

export function renderRoundResult(data, state) {
  const badge = document.getElementById('result-rarity-badge');
  badge.textContent = RARITY_LABELS[data.card.rarity] || data.card.rarity;
  badge.className = 'card-rarity-badge rarity-' + data.card.rarity;

  document.getElementById('result-question-text').textContent = data.card.text;

  const winnerNames = data.votesDetail
    .filter((v) => data.winners.includes(v.playerId))
    .map((v) => v.name);

  let winnerText;
  if (winnerNames.length === 0) {
    winnerText = 'Ninguém recebeu votos nessa rodada 😶';
  } else if (winnerNames.length === 1) {
    winnerText = `🏅 ${winnerNames[0]} venceu a rodada!`;
  } else {
    winnerText = `🏅 Empate entre ${winnerNames.join(' e ')}!`;
  }
  document.getElementById('result-winner-text').textContent = winnerText;
  sfx.reveal();

  const pressureNote = document.getElementById('result-pressure-note');
  const challengerChange = (data.scoreChanges || []).find((c) => c.pressureBonus > 0);
  if (pressureNote) {
    if (challengerChange) {
      const player = data.scores.find((s) => s.id === challengerChange.playerId);
      pressureNote.textContent = `🔥 Bônus de Pressão: ${player?.name || '?'} desafiou o líder e ganhou +${challengerChange.pressureBonus} extra!`;
      pressureNote.classList.remove('hidden');
    } else {
      pressureNote.classList.add('hidden');
    }
  }
  if ((data.scoreChanges || []).some((c) => c.delta > 0)) setTimeout(() => sfx.point(), 250);

  const list = document.getElementById('result-votes-list');
  const maxVotes = Math.max(1, ...data.votesDetail.map((v) => v.voteCount));
  list.innerHTML = data.votesDetail
    .map((v) => {
      const barWidth = Math.round((v.voteCount / maxVotes) * 100);
      const isWinner = data.winners.includes(v.playerId);
      return `
        <li class="result-row ${isWinner ? 'result-row-winner' : ''}">
          <span class="result-name">${escapeHtml(v.name)}</span>
          <div class="result-bar-track"><div class="result-bar-fill" style="width:${barWidth}%"></div></div>
          <span class="result-count">${v.voteCount}</span>
        </li>
      `;
    })
    .join('');

  renderScoreboardList(document.getElementById('result-scoreboard'), data.scores, state.playerId);

  const effectPanel = document.getElementById('effect-panel');
  const timerEl = document.getElementById('result-next-timer');

  if (data.interactive) {
    // Ainda não sabemos quem decide o quê até effect_choice_prompt/waiting
    // chegar (a rodada nem transmite isso a todos por igual). Deixamos um
    // estado neutro aqui; os handlers específicos completam o painel.
    effectPanel.classList.remove('hidden');
    document.getElementById('effect-narrative').textContent = 'Uma carta especial decidiu o rumo dessa rodada...';
    document.getElementById('effect-choice-buttons').classList.add('hidden');
    document.getElementById('effect-target-picker').classList.add('hidden');
    document.getElementById('effect-waiting-text').classList.add('hidden');
    timerEl.classList.add('hidden');
    clearInterval(countdownInterval);
  } else {
    effectPanel.classList.add('hidden');
    timerEl.classList.remove('hidden');
    startCountdown();
  }
}

export function showEffectChoicePrompt(payload, state) {
  const effectPanel = document.getElementById('effect-panel');
  const narrative = document.getElementById('effect-narrative');
  const choiceButtons = document.getElementById('effect-choice-buttons');
  const targetPicker = document.getElementById('effect-target-picker');
  const waitingText = document.getElementById('effect-waiting-text');

  effectPanel.classList.remove('hidden');
  waitingText.classList.add('hidden');
  narrative.textContent = 'Você venceu! Faça sua escolha:';

  if (payload.type === 'winner_choice') {
    choiceButtons.classList.remove('hidden');
    targetPicker.classList.add('hidden');
    choiceButtons.innerHTML = '';
    payload.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        state.socket.emit('submit_card_choice', { roomCode: state.roomCode, choiceKey: opt.key });
        choiceButtons.querySelectorAll('button').forEach((b) => (b.disabled = true));
      });
      choiceButtons.appendChild(btn);
    });
  } else if (payload.type === 'winner_curse') {
    choiceButtons.classList.add('hidden');
    targetPicker.classList.remove('hidden');
    state._effectSelection = { targetPlayerId: null, sign: null };

    const namesRow = document.createElement('div');
    namesRow.className = 'effect-target-row';
    payload.eligibleTargets.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'target-name-btn';
      btn.textContent = t.name;
      btn.addEventListener('click', () => {
        namesRow.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state._effectSelection.targetPlayerId = t.id;
      });
      namesRow.appendChild(btn);
    });

    const signRow = document.createElement('div');
    signRow.className = 'effect-sign-buttons';
    const posBtn = document.createElement('button');
    posBtn.type = 'button';
    posBtn.textContent = '+1';
    posBtn.addEventListener('click', () => {
      signRow.querySelectorAll('button').forEach((b) => b.classList.remove('selected', 'sign-pos', 'sign-neg'));
      posBtn.classList.add('selected', 'sign-pos');
      state._effectSelection.sign = 1;
    });
    const negBtn = document.createElement('button');
    negBtn.type = 'button';
    negBtn.textContent = '-1';
    negBtn.addEventListener('click', () => {
      signRow.querySelectorAll('button').forEach((b) => b.classList.remove('selected', 'sign-pos', 'sign-neg'));
      negBtn.classList.add('selected', 'sign-neg');
      state._effectSelection.sign = -1;
    });
    signRow.appendChild(posBtn);
    signRow.appendChild(negBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary effect-confirm-btn';
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.addEventListener('click', () => {
      const { targetPlayerId, sign } = state._effectSelection;
      if (!targetPlayerId || !sign) return;
      state.socket.emit('submit_card_choice', { roomCode: state.roomCode, targetPlayerId, sign });
      confirmBtn.disabled = true;
    });

    targetPicker.innerHTML = '';
    targetPicker.appendChild(namesRow);
    targetPicker.appendChild(signRow);
    targetPicker.appendChild(confirmBtn);
  }
}

export function showEffectWaiting(payload) {
  const effectPanel = document.getElementById('effect-panel');
  const narrative = document.getElementById('effect-narrative');
  const waitingText = document.getElementById('effect-waiting-text');

  effectPanel.classList.remove('hidden');
  document.getElementById('effect-choice-buttons').classList.add('hidden');
  document.getElementById('effect-target-picker').classList.add('hidden');
  narrative.textContent = 'Uma carta especial decidiu o rumo dessa rodada...';
  waitingText.textContent = `Aguardando ${payload.winnerName} decidir...`;
  waitingText.classList.remove('hidden');
}

export function showEffectResolved(payload, state) {
  const narrative = document.getElementById('effect-narrative');
  document.getElementById('effect-choice-buttons').classList.add('hidden');
  document.getElementById('effect-target-picker').classList.add('hidden');
  document.getElementById('effect-waiting-text').classList.add('hidden');

  const sign = payload.outcome.delta > 0 ? '+' : '';
  narrative.textContent = payload.automatic
    ? `Ninguém decidiu a tempo — resolvido automaticamente (${sign}${payload.outcome.delta} pts).`
    : `Decisão aplicada: ${sign}${payload.outcome.delta} pts.`;

  renderScoreboardList(document.getElementById('result-scoreboard'), payload.scores, state.playerId);

  document.getElementById('result-next-timer').classList.remove('hidden');
  startCountdown();
}

function startCountdown() {
  clearInterval(countdownInterval);
  let seconds = 6;
  const el = document.getElementById('result-timer-seconds');
  el.textContent = seconds;

  countdownInterval = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(countdownInterval);
      return;
    }
    el.textContent = seconds;
  }, 1000);
}

export function renderScoreboardList(el, scores, myId) {
  const topScore = scores[0]?.score || 0;
  el.innerHTML = scores
    .map((s, i) => `
      <li class="scoreboard-row ${s.id === myId ? 'scoreboard-row-me' : ''} ${s.score === topScore && topScore > 0 ? 'is-leader' : ''}">
        <span class="scoreboard-position">${i + 1}º</span>
        <span class="scoreboard-name">${s.score === topScore && topScore > 0 ? '👑 ' : ''}${escapeHtml(s.name)}</span>
        <span class="scoreboard-points">${s.score} pts</span>
      </li>
    `)
    .join('');
}
