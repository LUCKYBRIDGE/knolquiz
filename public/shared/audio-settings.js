const STORAGE_KEY = 'knolquiz.audio.settings.v1';
const CHANGE_EVENT = 'knolquiz:audio-settings-change';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULT_SETTINGS = Object.freeze({
  sfxVolume: 0.9,
  bgmVolume: 0.55,
  sfxMuted: false,
  bgmMuted: false,
  masterMuted: false
});

const normalizeAudioSettings = (value = {}) => ({
  sfxVolume: clamp(Number(value?.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume) || 0, 0, 1),
  bgmVolume: clamp(Number(value?.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume) || 0, 0, 1),
  sfxMuted: value?.sfxMuted === true,
  bgmMuted: value?.bgmMuted === true,
  masterMuted: value?.masterMuted === true
});

const readRawSettings = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const writeRawSettings = (settings) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_error) {
    // best effort only
  }
};

export const loadAudioSettings = () => {
  const parsed = readRawSettings();
  const normalized = normalizeAudioSettings(parsed || DEFAULT_SETTINGS);
  if (!parsed) {
    writeRawSettings(normalized);
  }
  return normalized;
};

export const updateAudioSettings = (patch = {}) => {
  const current = loadAudioSettings();
  const nextPatch = typeof patch === 'function' ? patch(current) : patch;
  const next = normalizeAudioSettings({ ...current, ...(nextPatch || {}) });
  writeRawSettings(next);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
};

export const subscribeAudioSettings = (listener, { immediate = true } = {}) => {
  if (typeof listener !== 'function') return () => {};
  const handler = (event) => {
    listener(normalizeAudioSettings(event?.detail || loadAudioSettings()));
  };
  window.addEventListener(CHANGE_EVENT, handler);
  if (immediate) {
    listener(loadAudioSettings());
  }
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
  };
};

export const getEffectiveSfxGain = (settings = loadAudioSettings()) => {
  if (settings.masterMuted || settings.sfxMuted) return 0;
  return clamp(Number(settings.sfxVolume) || 0, 0, 1);
};

export const getEffectiveBgmGain = (settings = loadAudioSettings()) => {
  if (settings.masterMuted || settings.bgmMuted) return 0;
  return clamp(Number(settings.bgmVolume) || 0, 0, 1);
};

export { STORAGE_KEY as AUDIO_SETTINGS_STORAGE_KEY, CHANGE_EVENT as AUDIO_SETTINGS_CHANGE_EVENT };
