// public/js/screens/minigame.js
// Tela de minigame: interrupções curtas e caóticas entre rodadas de
// perguntas. Os 6 minigames reaproveitam 3 áreas de interação (corrida
// por clique, contagem de cliques, e "não faça nada") — ver src/minigames.js
// pra entender por que isso é intencional, não preguiça.

import { sfx } from '../audio.js';

let mashCount = 0;
let hasActedThisMinigame = false;
let currentStateRef = null;

function resetArena() {
  document.getElementById('minigame-crown-target').classList.add('hidden');
  document.getElementById('minigame-mash-wrap').classList.add('hidden');
  document.getElementById('minigame-noclick-button').classList.add('hidden');
  document.getElementById('minigame-targets-container').classList.add('hidden');
  document.getElementById('minigame-potato-indicator').classList.add('hidden');
  document.getElementById('minigame-result-panel').classList.add('hidden');
  document.getElementById('minigame-targets-container').innerHTML = '';
  mashCount = 0;
  hasActedThisMinigame = false;
  document.getElementById('minigame-mash-counter').textContent = '0';
}

export function initMinigameScreen(socket, state) {
  currentStateRef = state;
  const crownTarget = document.getElementById('minigame-crown-target');
  const mashButton = document.getElementById('minigame-mash-button');
  const noClickButton = document.getElementById('minigame-noclick-button');

  crownTarget.addEventListener('click', () => {
    if (hasActedThisMinigame) return;
    hasActedThisMinigame = true;
    state.socket.emit('minigame_action', { roomCode: state.roomCode });
    crownTarget.classList.add('hidden');
  });

  mashButton.addEventListener('click', () => {
    mashCount += 1;
    document.getElementById('minigame-mash-counter').textContent = mashCount;
    state.socket.emit('minigame_action', { roomCode: state.roomCode });
  });

  noClickButton.addEventListener('click', () => {
    if (hasActedThisMinigame) return;
    hasActedThisMinigame = true;
    state.socket.emit('minigame_action', { roomCode: state.roomCode });
    noClickButton.textContent = 'VOCÊ CLICOU! 😬';
    noClickButton.disabled = true;
  });
}

export function renderMinigameStart(data, state) {
  resetArena();
  sfx.minigame();
  document.getElementById('minigame-title').textContent = data.label;
  document.getElementById('minigame-desc').textContent = data.description;

  if (data.type === 'dedo-nervoso' || data.type === 'tiro-ao-alvo') {
    document.getElementById('minigame-mash-wrap').classList.remove('hidden');
  } else if (data.type === 'nao-clique') {
    const btn = document.getElementById('minigame-noclick-button');
    btn.textContent = 'NÃO CLIQUE';
    btn.disabled = false;
    btn.classList.remove('hidden');
  } else if (data.type === 'batata-quente') {
    document.getElementById('minigame-potato-indicator').classList.remove('hidden');
  }
  // 'coroa' e 'alvo-certo' só aparecem quando o evento minigame_event chegar.
}

export function handleMinigameEvent(data, state) {
  if (data.event === 'crown_appear') {
    const target = document.getElementById('minigame-crown-target');
    target.style.left = data.x + '%';
    target.style.top = data.y + '%';
    target.classList.remove('hidden');
  }

  if (data.event === 'targets_appear') {
    const container = document.getElementById('minigame-targets-container');
    container.classList.remove('hidden');
    container.innerHTML = '';
    data.positions.forEach((pos, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'minigame-target-btn';
      btn.style.left = pos.x + '%';
      btn.style.top = pos.y + '%';
      btn.textContent = '❓';
      btn.addEventListener('click', () => {
        (state || currentStateRef).socket.emit('minigame_action', {
          roomCode: (state || currentStateRef).roomCode,
          targetIndex: index,
        });
        btn.classList.add('clicked-wrong'); // some visualmente; se era o certo, o resultado ainda conta
      });
      container.appendChild(btn);
    });
  }

  if (data.event === 'potato_pass') {
    const nameEl = document.getElementById('minigame-potato-holder-name');
    const players = (state || currentStateRef)?.players || [];
    const holder = players.find((p) => p.id === data.holderId);
    nameEl.textContent = holder ? holder.name : '???';
  }
}

export function renderMinigameResult(data) {
  const panel = document.getElementById('minigame-result-panel');
  const text = document.getElementById('minigame-result-text');
  panel.classList.remove('hidden');

  if (data.winners.length === 0 && !data.scoreChanges?.length) {
    text.textContent = data.narrative || 'Ninguém pontuou dessa vez.';
  } else if (data.winners.length === 0 && data.scoreChanges?.length) {
    text.textContent = `${data.narrative} (-1 ponto)`;
  } else {
    text.textContent = `${data.narrative} (+1 pra quem venceu)`;
  }
}
