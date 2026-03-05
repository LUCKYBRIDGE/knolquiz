import { loadAudioSettings, subscribeAudioSettings, getEffectiveSfxGain } from './audio-settings.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const triggerCorrectHaptic = () => {
  try {
    if (document.hidden) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(12);
  } catch (_error) {
    // best effort only
  }
};

const buildNoopSfx = () => ({
  playCorrect: () => {
    triggerCorrectHaptic();
  },
  playWrong: () => {},
  playKill: () => {},
  playJump: () => {}
});

export const createProceduralSfx = (options = {}) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextCtor !== 'function') return buildNoopSfx();

  const baseMasterGain = clamp(Number(options.masterGain) || 0.1, 0.01, 0.6);
  let audioSettings = loadAudioSettings();
  let effectiveMasterGain = baseMasterGain * getEffectiveSfxGain(audioSettings);
  let ctx = null;
  let masterGainNode = null;

  const ensureNodes = () => {
    if (!ctx) ctx = new AudioContextCtor();
    if (!masterGainNode) {
      masterGainNode = ctx.createGain();
      masterGainNode.gain.value = effectiveMasterGain;
      masterGainNode.connect(ctx.destination);
    }
    return { ctx, masterGainNode };
  };

  subscribeAudioSettings((next) => {
    audioSettings = next;
    effectiveMasterGain = baseMasterGain * getEffectiveSfxGain(audioSettings);
    if (!masterGainNode || !ctx) return;
    masterGainNode.gain.setTargetAtTime(effectiveMasterGain, ctx.currentTime, 0.01);
  }, { immediate: false });

  const ensureUnlocked = () => {
    const { ctx: audioCtx } = ensureNodes();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };

  const unlockOnFirstGesture = () => {
    ensureUnlocked();
  };
  document.addEventListener('pointerdown', unlockOnFirstGesture, { passive: true, capture: true, once: true });
  document.addEventListener('keydown', unlockOnFirstGesture, { capture: true, once: true });

  const playPattern = (notes = []) => {
    if (effectiveMasterGain <= 0) return;
    const { ctx: audioCtx, masterGainNode: master } = ensureNodes();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const startAt = audioCtx.currentTime + 0.004;
    notes.forEach((note) => {
      const when = startAt + Math.max(0, Number(note?.t) || 0);
      const duration = clamp(Number(note?.d) || 0.08, 0.02, 0.5);
      const freq = clamp(Number(note?.f) || 440, 80, 3200);
      const gain = clamp(Number(note?.g) || 0.09, 0.01, 0.6);
      const wave = typeof note?.w === 'string' ? note.w : 'triangle';
      const attack = clamp(Number(note?.a) || 0.006, 0.001, 0.06);
      const release = clamp(Number(note?.r) || Math.min(0.08, duration * 0.8), 0.01, 0.25);
      const glide = Number(note?.glide) || 0;
      const detune = Number(note?.detune) || 0;

      const osc = audioCtx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, when);
      if (glide) {
        osc.frequency.exponentialRampToValueAtTime(clamp(freq + glide, 60, 3600), when + duration);
      }
      osc.detune.setValueAtTime(detune, when);

      const amp = audioCtx.createGain();
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(gain, when + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);

      osc.connect(amp);
      amp.connect(master);
      osc.start(when);
      osc.stop(when + duration + release + 0.01);
    });
  };

  const playCorrect = () => {
    triggerCorrectHaptic();
    playPattern([
      { t: 0, f: 820, d: 0.06, w: 'triangle', g: 0.12, glide: 40 },
      { t: 0.06, f: 1210, d: 0.08, w: 'triangle', g: 0.14, glide: 70 }
    ]);
  };

  const playWrong = () => {
    playPattern([
      { t: 0, f: 330, d: 0.08, w: 'square', g: 0.11, glide: -65 },
      { t: 0.08, f: 220, d: 0.12, w: 'sawtooth', g: 0.09, glide: -50 }
    ]);
  };

  const playKill = () => {
    const jitter = (Math.random() - 0.5) * 30;
    playPattern([
      { t: 0, f: 170 + jitter, d: 0.04, w: 'square', g: 0.09, glide: 70 },
      { t: 0.03, f: 260 + jitter, d: 0.05, w: 'square', g: 0.08, glide: 80 },
      { t: 0.07, f: 360 + jitter, d: 0.06, w: 'triangle', g: 0.08, glide: 40 }
    ]);
  };

  const playJump = (isDouble = false) => {
    if (isDouble) {
      playPattern([
        { t: 0, f: 560, d: 0.05, w: 'square', g: 0.1, glide: 120 },
        { t: 0.04, f: 860, d: 0.06, w: 'triangle', g: 0.08, glide: 80 }
      ]);
      return;
    }
    playPattern([
      { t: 0, f: 500, d: 0.045, w: 'square', g: 0.09, glide: 90 },
      { t: 0.035, f: 720, d: 0.055, w: 'triangle', g: 0.075, glide: 70 }
    ]);
  };

  return {
    playCorrect,
    playWrong,
    playKill,
    playJump
  };
};
