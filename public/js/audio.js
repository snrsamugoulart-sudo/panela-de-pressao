// public/js/audio.js
// Efeitos sonoros curtos, sintetizados na hora via Web Audio API — não
// usa nenhum arquivo de áudio externo, então não há risco de direito
// autoral. É som simples (blips/tons), não música composta.

const STORAGE_KEY = 'panela-de-pressao:muted';

let audioCtx = null;
let muted = localStorage.getItem(STORAGE_KEY) === '1';

function getContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.08, delay = 0 }) {
  if (muted) return;
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const startAt = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

// Biblioteca de efeitos — cada um é só uma combinação simples de tons.
export const sfx = {
  click: () => tone({ freq: 520, duration: 0.06, type: 'square', gain: 0.05 }),
  vote: () => tone({ freq: 660, duration: 0.08, type: 'triangle', gain: 0.06 }),
  point: () => {
    tone({ freq: 523, duration: 0.1, type: 'triangle', gain: 0.08 });
    tone({ freq: 784, duration: 0.14, type: 'triangle', gain: 0.08, delay: 0.08 });
  },
  reveal: () => tone({ freq: 300, duration: 0.2, type: 'sawtooth', gain: 0.06 }),
  special: () => {
    tone({ freq: 440, duration: 0.1, type: 'square', gain: 0.06 });
    tone({ freq: 660, duration: 0.1, type: 'square', gain: 0.06, delay: 0.09 });
  },
  legendary: () => {
    [440, 554, 659, 880].forEach((freq, i) => tone({ freq, duration: 0.16, type: 'sawtooth', gain: 0.07, delay: i * 0.08 }));
  },
  pressureUp: () => tone({ freq: 200, duration: 0.22, type: 'sawtooth', gain: 0.07 }),
  minigame: () => {
    tone({ freq: 392, duration: 0.08, type: 'square', gain: 0.06 });
    tone({ freq: 523, duration: 0.08, type: 'square', gain: 0.06, delay: 0.07 });
    tone({ freq: 659, duration: 0.1, type: 'square', gain: 0.06, delay: 0.14 });
  },
  victory: () => {
    [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, duration: 0.2, type: 'triangle', gain: 0.08, delay: i * 0.11 }));
  },
  defeatBeep: () => tone({ freq: 180, duration: 0.25, type: 'sawtooth', gain: 0.06 }),
};
