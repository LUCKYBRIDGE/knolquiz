import { loadAudioSettings, subscribeAudioSettings, getEffectiveBgmGain } from './audio-settings.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const NOOP_BGM = Object.freeze({
  start: () => {},
  stop: () => {},
  destroy: () => {},
  isRunning: () => false
});

const DEFAULT_LEAD_PATTERN = Object.freeze([440, 0, 587, 0, 659, 0, 587, 0, 523, 0, 659, 0, 698, 0, 659, 0]);
const DEFAULT_BASS_PATTERN = Object.freeze([110, 110, 147, 147, 98, 98, 147, 147]);

export const createProceduralBgm = (options = {}) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextCtor !== 'function') return NOOP_BGM;

  const leadPattern = Array.isArray(options.leadPattern) && options.leadPattern.length
    ? options.leadPattern
    : DEFAULT_LEAD_PATTERN;
  const bassPattern = Array.isArray(options.bassPattern) && options.bassPattern.length
    ? options.bassPattern
    : DEFAULT_BASS_PATTERN;
  const stepMs = clamp(Number(options.stepMs) || 210, 120, 420);
  const stepSec = stepMs / 1000;
  const baseGain = clamp(Number(options.masterGain) || 0.08, 0.005, 0.28);

  let audioCtx = null;
  let masterNode = null;
  let running = false;
  let tickTimer = null;
  let stepIndex = 0;
  let nextNoteAt = 0;
  let settings = loadAudioSettings();
  let effectiveGain = baseGain * getEffectiveBgmGain(settings);

  const ensureAudio = () => {
    if (!audioCtx) audioCtx = new AudioContextCtor();
    if (!masterNode) {
      masterNode = audioCtx.createGain();
      masterNode.gain.value = effectiveGain;
      masterNode.connect(audioCtx.destination);
    }
    return { audioCtx, masterNode };
  };

  const applyGain = () => {
    effectiveGain = baseGain * getEffectiveBgmGain(settings);
    if (!masterNode || !audioCtx) return;
    masterNode.gain.setTargetAtTime(effectiveGain, audioCtx.currentTime, 0.015);
  };

  const unlockAudio = () => {
    if (!running) return;
    const { audioCtx: ctx } = ensureAudio();
    if (ctx.state !== 'suspended') return;
    ctx.resume().then(() => {
      nextNoteAt = 0;
    }).catch(() => {});
  };

  const unsubscribeAudioSettings = subscribeAudioSettings((next) => {
    settings = next;
    applyGain();
  }, { immediate: false });

  document.addEventListener('pointerdown', unlockAudio, { passive: true, capture: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });

  const scheduleTone = ({ when, duration, frequency, waveform, gain }) => {
    if (!audioCtx || !masterNode) return;
    if (!frequency || frequency <= 0) return;

    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(clamp(frequency, 60, 2400), when);

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(clamp(gain, 0.003, 0.25), when + Math.min(0.03, duration * 0.35));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.02);

    osc.connect(amp);
    amp.connect(masterNode);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  };

  const scheduleWindow = () => {
    if (!running) return;
    const { audioCtx: ctx } = ensureAudio();
    if (ctx.state === 'suspended') return;

    if (nextNoteAt <= 0) {
      nextNoteAt = ctx.currentTime + 0.04;
    }

    while (nextNoteAt < ctx.currentTime + 0.3) {
      const lead = Number(leadPattern[stepIndex % leadPattern.length]) || 0;
      const bass = Number(bassPattern[stepIndex % bassPattern.length]) || 0;
      const leadDuration = stepSec * 0.74;
      const bassDuration = stepSec * 0.9;

      if (lead > 0 && effectiveGain > 0) {
        scheduleTone({
          when: nextNoteAt,
          duration: leadDuration,
          frequency: lead,
          waveform: 'square',
          gain: 0.06
        });
      }

      if (bass > 0 && effectiveGain > 0) {
        scheduleTone({
          when: nextNoteAt,
          duration: bassDuration,
          frequency: bass,
          waveform: 'triangle',
          gain: 0.05
        });
      }

      stepIndex += 1;
      nextNoteAt += stepSec;
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    ensureAudio();
    applyGain();
    scheduleWindow();
    tickTimer = window.setInterval(scheduleWindow, 90);
  };

  const stop = () => {
    running = false;
    if (tickTimer != null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    nextNoteAt = 0;
    stepIndex = 0;
  };

  const destroy = () => {
    stop();
    unsubscribeAudioSettings();
    document.removeEventListener('pointerdown', unlockAudio, { capture: true });
    document.removeEventListener('keydown', unlockAudio, { capture: true });
  };

  return {
    start,
    stop,
    destroy,
    isRunning: () => running
  };
};
