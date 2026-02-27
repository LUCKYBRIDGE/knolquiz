const setText = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

const showRowText = (id, text) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
};

const setFrameReady = (ready) => {
  if (!document?.body) return;
  document.body.classList.toggle('frame-ready', !!ready);
};

const setPanelVisible = (visible) => {
  if (!document?.body) return;
  document.body.classList.toggle('panel-visible', !!visible);
};

const setLoadingVisible = (visible) => {
  if (!document?.body) return;
  document.body.classList.toggle('loading-hidden', !visible);
};

const setLoadingText = (text) => {
  const el = document.getElementById('loading-text');
  if (el && typeof text === 'string' && text.trim()) el.textContent = text;
};

const showTarget = (targetUrl) => {
  const row = document.getElementById('target-row');
  if (!row) return;
  row.hidden = false;
  row.textContent = `target: ${targetUrl}`;
};

const showFallback = (targetUrl) => {
  const row = document.getElementById('fallback-row');
  const link = document.getElementById('fallback-link');
  if (link) link.href = targetUrl;
  if (row) row.hidden = false;
};

const showCompatMode = (text) => {
  showRowText('compat-mode-row', text);
};

const isTruthyFlag = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const isFalsyFlag = (value) => ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
const COMPAT_MESSAGE_SOURCE = 'jumpmap-runtime-legacy-compat';
const PLAY_READY_MESSAGE_SOURCE = 'jumpmap-runtime-play';
const MAX_COMPAT_EVENTS = 8;
const LOADING_SPRITE_FRAME_MS = 120;
const LOADING_SPRITES = Object.freeze([
  './compat/quiz_sejong/sejong_walk1.png',
  './compat/quiz_sejong/sejong_walk2.png',
  './compat/quiz_sejong/sejong_walk3.png',
  './compat/quiz_sejong/sejong_walk4.png'
]);

const fallbackHref = () => {
  try {
    if (typeof window !== 'undefined' && window?.location?.href) return window.location.href;
  } catch (_error) {
    // no-op
  }
  return 'http://127.0.0.1/';
};

const errorMessageOf = (error) => {
  if (!error) return 'unknown error';
  if (error instanceof Error) return error.message;
  return String(error);
};

const fetchStatus = async (url) => {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, message: errorMessageOf(error) };
  }
};

const shouldEnableCompatDebug = (baseHref) => {
  const browserHref = fallbackHref();
  const current = new URL(baseHref || browserHref, browserHref);
  if (!current.searchParams.has('legacyCompatDebug')) return false;
  return isTruthyFlag(current.searchParams.get('legacyCompatDebug'));
};

const summarizeCompatEvent = (phase, extra = {}) => {
  if (!phase) return 'unknown';
  if (phase === 'urls-ready') {
    const requestedSource = extra.requestedSourceMode || extra.sourceMode || '-';
    const requestedAssetBase = extra.requestedAssetBaseMode || extra.assetBaseMode || '-';
    const source = extra.sourceMode || '-';
    const assetBase = extra.assetBaseMode || '-';
    const mismatch = requestedSource !== source || requestedAssetBase !== assetBase;
    return mismatch
      ? `urls ready: requested(source=${requestedSource}, assetBase=${requestedAssetBase}) -> effective(source=${source}, assetBase=${assetBase}) url=${extra.sourceIndexUrl || '-'}`
      : `urls ready: source=${source} assetBase=${assetBase} url=${extra.sourceIndexUrl || '-'}`;
  }
  if (phase === 'fetch-start') {
    return `fetch start: source=${extra.sourceMode || '-'} assetBase=${extra.assetBaseMode || '-'} url=${extra.url || '-'}`;
  }
  if (phase === 'fetch-ok') {
    return `fetch ok: source=${extra.sourceMode || '-'} assetBase=${extra.assetBaseMode || '-'} status=${extra.status ?? '-'} bytes=${extra.bytes ?? '-'}`;
  }
  if (phase === 'editor-path-unavailable-fallback') {
    return `editor fallback unavailable -> runtime-owned (status=${extra.probeStatus ?? '-'})`;
  }
  if (phase === 'fetch-error') return `fetch error: ${extra.message || '-'}`;
  if (phase === 'compat-head-injected') return `compat head injected`;
  if (phase === 'compat-dom-content-loaded') return 'compat DOMContentLoaded';
  if (phase === 'compat-window-load') return 'compat window load';
  if (phase === 'compat-window-error') return `compat window error: ${extra.message || '-'}`;
  if (phase === 'compat-unhandledrejection') return `compat unhandled rejection: ${extra.message || '-'}`;
  if (phase === 'inject-ready') return 'compat inject ready';
  if (phase === 'inject-apply-failed') return `compat inject failed: ${extra.message || '-'}`;
  return phase;
};

const appendCompatEvent = (text) => {
  const list = document.getElementById('compat-events');
  const row = document.getElementById('compat-events-row');
  if (!list || !row) return;
  if (row.hidden) return;
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} · ${text}`;
  list.prepend(item);
  while (list.children.length > MAX_COMPAT_EVENTS) {
    list.removeChild(list.lastElementChild);
  }
};

const startLoadingSpriteAnimation = () => {
  const spriteEl = document.getElementById('loading-sprite');
  if (!(spriteEl instanceof HTMLImageElement)) return () => {};
  let frameIndex = 0;
  spriteEl.src = LOADING_SPRITES[0];
  const timer = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % LOADING_SPRITES.length;
    spriteEl.src = LOADING_SPRITES[frameIndex];
  }, LOADING_SPRITE_FRAME_MS);
  return () => {
    window.clearInterval(timer);
  };
};

const resolveCompatTargetMode = (baseHref) => {
  const browserHref = fallbackHref();
  const current = new URL(baseHref || browserHref, browserHref);
  if (!current.searchParams.has('legacyCompatTarget')) return 'compat-default';
  const raw = current.searchParams.get('legacyCompatTarget');
  if (isFalsyFlag(raw)) return 'editor-fallback';
  if (isTruthyFlag(raw)) return 'compat-explicit';
  return 'compat-explicit';
};

const buildLegacyEditorTargetUrl = (baseHref) => {
  const browserHref = fallbackHref();
  const current = new URL(baseHref || browserHref, browserHref);
  const target = new URL('../../jumpmap-editor/', current);

  current.searchParams.forEach((value, key) => {
    if (!key) return;
    target.searchParams.set(key, value);
  });

  target.searchParams.set('launchMode', 'play');
  target.searchParams.set('fromLauncher', '1');
  target.searchParams.set('autoStartTest', '1');
  target.searchParams.set('autoRestartTest', '1');
  return target;
};

const buildLegacyCompatTargetUrl = (baseHref) => {
  const browserHref = fallbackHref();
  const current = new URL(baseHref || browserHref, browserHref);
  const target = new URL('./compat/', current);
  current.searchParams.forEach((value, key) => {
    if (!key) return;
    target.searchParams.set(key, value);
  });
  target.searchParams.set('launchMode', 'play');
  target.searchParams.set('fromLauncher', '1');
  target.searchParams.set('autoStartTest', '1');
  target.searchParams.set('autoRestartTest', '1');
  return target;
};

const applyLegacyDirectFallbackProbe = (requestedMode, probe) => {
  if (requestedMode !== 'editor-fallback') {
    return { targetMode: requestedMode, changed: false, probe: probe || null };
  }
  if (probe?.ok) {
    return { targetMode: 'editor-fallback', changed: false, probe: probe || null };
  }
  return { targetMode: 'compat-auto-fallback', changed: true, probe: probe || null };
};

const start = async () => {
  const stopLoadingSpriteAnimation = startLoadingSpriteAnimation();
  setLoadingVisible(true);
  setLoadingText('맵 데이터와 게임 데이터를 준비하고 있어요.');

  const frame = document.getElementById('legacy-frame');
  if (!(frame instanceof HTMLIFrameElement)) {
    setText('status-text', '레거시 플레이 프레임 요소를 찾지 못했습니다.');
    setLoadingText('로딩 프레임을 찾지 못했습니다.');
    setPanelVisible(true);
    return;
  }

  let target;
  let targetMode = 'compat-default';
  let compatDebug = false;
  let compatFallbackNotice = '';
  let panelVisible = false;
  let runtimeReady = false;

  const markRuntimeReady = (reason = '') => {
    if (runtimeReady) return;
    runtimeReady = true;
    setFrameReady(true);
    setLoadingText('로딩 완료');
    setLoadingVisible(false);
    stopLoadingSpriteAnimation();
    if (!compatDebug) setPanelVisible(false);
    if (reason) setText('status-text', reason);
  };

  try {
    targetMode = resolveCompatTargetMode(window.location.href);
    if (targetMode.startsWith('compat')) {
      target = buildLegacyCompatTargetUrl(window.location.href);
      compatDebug = shouldEnableCompatDebug(window.location.href);
      panelVisible = compatDebug;
    } else {
      const fallbackTarget = buildLegacyEditorTargetUrl(window.location.href);
      const probe = await fetchStatus(fallbackTarget.toString());
      const resolvedFallback = applyLegacyDirectFallbackProbe(targetMode, probe);
      if (resolvedFallback.targetMode === 'editor-fallback') {
        target = fallbackTarget;
        targetMode = 'editor-fallback';
      } else {
        target = buildLegacyCompatTargetUrl(window.location.href);
        targetMode = resolvedFallback.targetMode;
        compatDebug = shouldEnableCompatDebug(window.location.href);
        panelVisible = compatDebug;
        compatFallbackNotice = `direct fallback unavailable (status=${probe.status || 0}); using compat`;
      }
    }
  } catch (error) {
    console.error('[JumpmapRuntimeLegacyRoute] failed to build legacy target url', error);
    setText('status-text', '레거시 플레이 경로 생성에 실패했습니다.');
    setLoadingText('플레이 경로 준비에 실패했습니다.');
    setPanelVisible(true);
    return;
  }

  const targetHref = target.toString();
  setPanelVisible(panelVisible);
  showTarget(targetHref);
  showFallback(targetHref);
  setFrameReady(false);
  if (targetMode.startsWith('compat')) {
    const eventsRow = document.getElementById('compat-events-row');
    if (eventsRow) eventsRow.hidden = !compatDebug;
    showRowText(
      'compat-event-row',
      compatDebug
        ? 'compat telemetry: on (legacyCompatDebug=1, recent events visible; legacyCompatTarget=0 direct fallback is dev-only if /jumpmap-editor exists)'
        : 'compat telemetry: on (latest event only; add legacyCompatDebug=1 for detail; legacyCompatTarget=0 direct fallback is dev-only if /jumpmap-editor exists)'
    );
    if (compatFallbackNotice) {
      appendCompatEvent(`host: ${compatFallbackNotice}`);
      showCompatMode(`compat mode: direct fallback 요청이 비활성화되어 compat로 자동 전환됨 (${compatFallbackNotice})`);
    }
  }
  setText(
    'status-text',
    targetMode.startsWith('compat')
      ? '레거시 Compat Target 프레임을 로드하는 중...'
      : '레거시 플레이 프레임을 로드하는 중... (compat fallback)'
  );

  const onCompatMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== COMPAT_MESSAGE_SOURCE) return;

    const phase = typeof data.phase === 'string' ? data.phase : '';
    const summary = summarizeCompatEvent(phase, data);
    showRowText('compat-event-row', `compat event: ${summary}`);
    appendCompatEvent(summary);

    if (phase === 'fetch-start') {
      setLoadingText('맵 소스를 불러오는 중...');
      setText('status-text', '레거시 Compat Target: 에디터 HTML을 가져오는 중...');
    } else if (phase === 'urls-ready') {
      const requestedSource = data.requestedSourceMode || data.sourceMode;
      const requestedAssetBase = data.requestedAssetBaseMode || data.assetBaseMode;
      const effectiveSource = data.sourceMode || '-';
      const effectiveAssetBase = data.assetBaseMode || '-';
      const changed = requestedSource !== effectiveSource || requestedAssetBase !== effectiveAssetBase;
      showCompatMode(
        changed
          ? `compat mode: requested source=${requestedSource}, assetBase=${requestedAssetBase} -> effective source=${effectiveSource}, assetBase=${effectiveAssetBase}`
          : `compat mode: source=${effectiveSource}, assetBase=${effectiveAssetBase}`
      );
    } else if (phase === 'editor-path-unavailable-fallback') {
      setLoadingText('호환 런타임으로 전환했어요. 계속 준비 중...');
      setText('status-text', '레거시 Compat Target: editor fallback 경로가 없어 runtime-owned로 자동 복귀했습니다.');
    } else if (phase === 'fetch-ok') {
      setLoadingText('게임 화면을 구성하는 중...');
      setText('status-text', '레거시 Compat Target: 에디터 HTML fetch 완료, 적용 준비 중...');
    } else if (phase === 'compat-window-load') {
      setLoadingText('게임 엔진 초기화 중...');
      setText('status-text', '레거시 Compat Target 문서 로드 완료 (window load)');
    } else if (phase === 'fetch-error' || phase === 'inject-apply-failed' || phase === 'compat-window-error') {
      setPanelVisible(true);
      setFrameReady(false);
      setLoadingText('로딩에 실패했습니다. 새 탭 링크를 사용해 주세요.');
      setText('status-text', `레거시 Compat Target 오류: ${data.message || summary}`);
    }
  };

  const onPlayMessage = (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== PLAY_READY_MESSAGE_SOURCE) return;
    if (data.phase === 'runtime-ready') {
      markRuntimeReady('점프맵 플레이 준비 완료');
      try {
        frame.contentWindow?.focus();
      } catch (_error) {
        // no-op
      }
    }
  };

  window.addEventListener('message', onPlayMessage);
  if (targetMode.startsWith('compat')) {
    window.addEventListener('message', onCompatMessage);
    appendCompatEvent('host: waiting for compat telemetry...');
  }

  const onLoad = () => {
    setLoadingText('게임 데이터를 마무리하는 중...');
    setText(
      'status-text',
      targetMode.startsWith('compat')
        ? '레거시 Compat Target 프레임 로드 완료'
        : '레거시 플레이 프레임 로드 완료 (compat fallback)'
    );
  };

  const onError = () => {
    setPanelVisible(true);
    setFrameReady(false);
    setLoadingText('로딩에 실패했습니다. 새 탭 링크를 사용해 주세요.');
    setText(
      'status-text',
      targetMode.startsWith('compat')
        ? '레거시 Compat Target 프레임 로드에 실패했습니다. 새 탭 링크 또는 legacyCompatTarget=0 fallback을 사용해 주세요.'
        : '레거시 플레이 프레임 로드에 실패했습니다. 새 탭 링크를 사용해 주세요.'
    );
  };

  if (targetMode === 'compat-auto-fallback') {
    if (!compatDebug) setPanelVisible(false);
    setLoadingText('호환 런타임으로 전환했어요. 계속 준비 중...');
    setText('status-text', 'runtime split에서는 direct fallback을 사용할 수 없어 compat로 자동 전환했습니다.');
  }

  frame.addEventListener('load', onLoad, { once: true });
  frame.addEventListener('error', onError, { once: true });
  frame.src = targetHref;

  window.setTimeout(() => {
    if (runtimeReady) return;
    setLoadingText('데이터를 불러오는 중입니다...');
    if (compatDebug) setPanelVisible(true);
    if (targetMode.startsWith('compat')) {
      setText('status-text', '레거시 Compat Target 프레임 로딩 중... (지연 시 panel의 compat mode/event 확인)');
      return;
    }
    setText('status-text', '레거시 플레이 프레임 로딩 중... (지연 시 새 탭 링크 사용 가능)');
  }, 1500);

  window.setTimeout(() => {
    if (runtimeReady) return;
    setLoadingText('로딩이 지연되고 있습니다. 잠시 후에도 동일하면 새 탭 링크를 사용해 주세요.');
    if (!compatDebug) setPanelVisible(true);
  }, 12000);
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  start().catch((error) => {
    console.error('[JumpmapRuntimeLegacyRoute] unhandled start error', error);
    setText('status-text', `레거시 플레이 초기화 오류: ${errorMessageOf(error)}`);
    setLoadingText('초기화 오류가 발생했습니다.');
    setPanelVisible(true);
  });
}

export {
  resolveCompatTargetMode,
  buildLegacyEditorTargetUrl,
  buildLegacyCompatTargetUrl,
  applyLegacyDirectFallbackProbe
};
