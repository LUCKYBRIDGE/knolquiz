import { loadAudioSettings, updateAudioSettings, subscribeAudioSettings } from './audio-settings.js';

const STYLE_ID = 'knolquiz-audio-widget-style';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toPercent = (value) => Math.round(clamp(Number(value) || 0, 0, 1) * 100);

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.knol-audio-widget {
  position: fixed;
  z-index: 180;
  width: min(320px, calc(100vw - 16px));
  pointer-events: none;
}
.knol-audio-widget[data-placement="bottom-right"] {
  right: max(8px, env(safe-area-inset-right, 0px) + 8px);
  bottom: max(8px, env(safe-area-inset-bottom, 0px) + 8px);
}
.knol-audio-widget[data-placement="top-right"] {
  right: max(8px, env(safe-area-inset-right, 0px) + 8px);
  top: max(8px, env(safe-area-inset-top, 0px) + 8px);
}
.knol-audio-widget[data-placement="bottom-left"] {
  left: max(8px, env(safe-area-inset-left, 0px) + 8px);
  bottom: max(8px, env(safe-area-inset-bottom, 0px) + 8px);
}
.knol-audio-widget[data-placement="top-left"] {
  left: max(8px, env(safe-area-inset-left, 0px) + 8px);
  top: max(8px, env(safe-area-inset-top, 0px) + 8px);
}
.knol-audio-toggle {
  pointer-events: auto;
  min-height: 40px;
  border-radius: 12px;
  border: 2px solid rgba(30, 41, 59, 0.55);
  background: linear-gradient(180deg, rgba(255, 251, 237, 0.96) 0%, rgba(246, 233, 198, 0.96) 100%);
  color: #1f2937;
  font-size: 13px;
  font-weight: 900;
  padding: 8px 12px;
  box-shadow: 0 8px 18px rgba(2, 6, 23, 0.28);
}
.knol-audio-panel {
  pointer-events: auto;
  margin-top: 6px;
  border-radius: 14px;
  border: 2px solid rgba(30, 41, 59, 0.32);
  background: rgba(255, 252, 242, 0.96);
  box-shadow: 0 14px 26px rgba(2, 6, 23, 0.3);
  padding: 10px;
  display: grid;
  gap: 8px;
}
.knol-audio-panel.hidden {
  display: none;
}
.knol-audio-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 6px;
}
.knol-audio-label {
  min-width: 40px;
  font-size: 12px;
  font-weight: 900;
  color: #334155;
}
.knol-audio-range {
  width: 100%;
}
.knol-audio-value {
  min-width: 36px;
  text-align: right;
  font-size: 12px;
  font-weight: 800;
  color: #1f2937;
}
.knol-audio-btn {
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(51, 65, 85, 0.35);
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
}
.knol-audio-master {
  display: flex;
  justify-content: flex-end;
}
.knol-audio-master .knol-audio-btn {
  min-width: 110px;
}
@media (max-width: 720px) {
  .knol-audio-widget {
    width: min(300px, calc(100vw - 12px));
  }
  .knol-audio-toggle {
    min-height: 36px;
    padding: 6px 10px;
    font-size: 12px;
  }
  .knol-audio-panel {
    margin-top: 5px;
    padding: 8px;
  }
  .knol-audio-row {
    grid-template-columns: 36px 1fr 32px auto;
    gap: 4px;
  }
  .knol-audio-btn {
    min-height: 28px;
    padding: 3px 7px;
  }
}
`;
  document.head.appendChild(style);
};

const mountAudioControls = (options = {}) => {
  if (typeof document === 'undefined') {
    return {
      destroy: () => {}
    };
  }

  ensureStyle();

  const placement = String(options.placement || 'bottom-right').trim() || 'bottom-right';
  const title = String(options.title || '사운드').trim() || '사운드';
  const defaultOpen = options.defaultOpen === true;
  const mountNode = options.mountNode instanceof Element ? options.mountNode : document.body;

  const root = document.createElement('section');
  root.className = 'knol-audio-widget';
  root.dataset.placement = placement;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'knol-audio-toggle';

  const panel = document.createElement('div');
  panel.className = `knol-audio-panel${defaultOpen ? '' : ' hidden'}`;

  const sfxRow = document.createElement('div');
  sfxRow.className = 'knol-audio-row';
  const sfxLabel = document.createElement('span');
  sfxLabel.className = 'knol-audio-label';
  sfxLabel.textContent = '효과';
  const sfxRange = document.createElement('input');
  sfxRange.className = 'knol-audio-range';
  sfxRange.type = 'range';
  sfxRange.min = '0';
  sfxRange.max = '100';
  sfxRange.step = '1';
  const sfxValue = document.createElement('span');
  sfxValue.className = 'knol-audio-value';
  const sfxMuteBtn = document.createElement('button');
  sfxMuteBtn.type = 'button';
  sfxMuteBtn.className = 'knol-audio-btn';

  const bgmRow = document.createElement('div');
  bgmRow.className = 'knol-audio-row';
  const bgmLabel = document.createElement('span');
  bgmLabel.className = 'knol-audio-label';
  bgmLabel.textContent = '배경';
  const bgmRange = document.createElement('input');
  bgmRange.className = 'knol-audio-range';
  bgmRange.type = 'range';
  bgmRange.min = '0';
  bgmRange.max = '100';
  bgmRange.step = '1';
  const bgmValue = document.createElement('span');
  bgmValue.className = 'knol-audio-value';
  const bgmMuteBtn = document.createElement('button');
  bgmMuteBtn.type = 'button';
  bgmMuteBtn.className = 'knol-audio-btn';

  const masterWrap = document.createElement('div');
  masterWrap.className = 'knol-audio-master';
  const masterMuteBtn = document.createElement('button');
  masterMuteBtn.type = 'button';
  masterMuteBtn.className = 'knol-audio-btn';

  sfxRow.appendChild(sfxLabel);
  sfxRow.appendChild(sfxRange);
  sfxRow.appendChild(sfxValue);
  sfxRow.appendChild(sfxMuteBtn);

  bgmRow.appendChild(bgmLabel);
  bgmRow.appendChild(bgmRange);
  bgmRow.appendChild(bgmValue);
  bgmRow.appendChild(bgmMuteBtn);

  masterWrap.appendChild(masterMuteBtn);

  panel.appendChild(sfxRow);
  panel.appendChild(bgmRow);
  panel.appendChild(masterWrap);

  root.appendChild(toggleBtn);
  root.appendChild(panel);
  mountNode.appendChild(root);

  const isPanelOpen = () => !panel.classList.contains('hidden');
  const setPanelOpen = (open) => {
    panel.classList.toggle('hidden', !open);
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  toggleBtn.addEventListener('click', () => {
    setPanelOpen(!isPanelOpen());
  });

  const render = (settings) => {
    const sfxVolumePct = toPercent(settings.sfxVolume);
    const bgmVolumePct = toPercent(settings.bgmVolume);

    sfxRange.value = String(sfxVolumePct);
    bgmRange.value = String(bgmVolumePct);
    sfxValue.textContent = `${sfxVolumePct}%`;
    bgmValue.textContent = `${bgmVolumePct}%`;

    sfxMuteBtn.textContent = settings.sfxMuted ? '해제' : '음소거';
    bgmMuteBtn.textContent = settings.bgmMuted ? '해제' : '음소거';
    masterMuteBtn.textContent = settings.masterMuted ? '전체 해제' : '전체 음소거';

    toggleBtn.textContent = `${title} · ${settings.masterMuted ? '전체 음소거' : '켜짐'}`;
  };

  sfxRange.addEventListener('input', () => {
    const next = clamp(Number(sfxRange.value) || 0, 0, 100) / 100;
    updateAudioSettings({ sfxVolume: next, sfxMuted: next <= 0 ? true : false });
  });

  bgmRange.addEventListener('input', () => {
    const next = clamp(Number(bgmRange.value) || 0, 0, 100) / 100;
    updateAudioSettings({ bgmVolume: next, bgmMuted: next <= 0 ? true : false });
  });

  sfxMuteBtn.addEventListener('click', () => {
    updateAudioSettings((current) => ({ sfxMuted: !current.sfxMuted }));
  });

  bgmMuteBtn.addEventListener('click', () => {
    updateAudioSettings((current) => ({ bgmMuted: !current.bgmMuted }));
  });

  masterMuteBtn.addEventListener('click', () => {
    updateAudioSettings((current) => ({ masterMuted: !current.masterMuted }));
  });

  const unsubscribe = subscribeAudioSettings(render, { immediate: true });
  setPanelOpen(defaultOpen);

  return {
    root,
    destroy: () => {
      unsubscribe();
      root.remove();
    }
  };
};

export { mountAudioControls };
