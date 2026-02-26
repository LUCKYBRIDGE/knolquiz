const COMPAT_MESSAGE_SOURCE = 'jumpmap-runtime-legacy-compat';
const COMPAT_RUNTIME_OWNED_SOURCE_MODES = new Set(['runtimeowned', 'runtime-owned', 'runtime_owned', '1', 'true', 'on']);
const COMPAT_RUNTIME_OWNED_ASSET_BASE_MODES = new Set(['runtimeowned', 'runtime-owned', 'runtime_owned', '1', 'true', 'on']);
const COMPAT_EDITOR_SOURCE_MODES = new Set(['editor', '0', 'false', 'off', 'no']);
const COMPAT_EDITOR_ASSET_BASE_MODES = new Set(['editor', '0', 'false', 'off', 'no']);

const fallbackHref = () => {
  try {
    if (typeof window !== 'undefined' && window?.location?.href) return window.location.href;
  } catch (_error) {
    // no-op
  }
  return 'http://127.0.0.1/';
};

const setStatus = (text) => {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
};

const postParentEvent = (phase, extra = {}) => {
  try {
    window.parent?.postMessage({ source: COMPAT_MESSAGE_SOURCE, phase, ...extra }, '*');
  } catch (_error) {
    // no-op
  }
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

const showTarget = (targetUrl) => {
  const row = document.getElementById('target-row');
  if (!row) return;
  row.hidden = false;
  row.textContent = `source html: ${targetUrl}`;
};

const normalizeCompatSourceMode = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'runtime-owned';
  if (COMPAT_RUNTIME_OWNED_SOURCE_MODES.has(raw)) return 'runtime-owned';
  if (COMPAT_EDITOR_SOURCE_MODES.has(raw)) return 'editor';
  return 'editor';
};

const normalizeCompatAssetBaseMode = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'runtime-owned';
  if (COMPAT_RUNTIME_OWNED_ASSET_BASE_MODES.has(raw)) return 'runtime-owned';
  if (COMPAT_EDITOR_ASSET_BASE_MODES.has(raw)) return 'editor';
  return 'editor';
};

const buildCompatSourceUrls = (baseHref) => {
  const browserHref = fallbackHref();
  const pageUrl = new URL(baseHref || browserHref, browserHref);
  const editorBaseUrl = new URL('../../jumpmap-editor/', pageUrl);
  const editorIndexUrl = new URL('index.html', editorBaseUrl);
  const runtimeOwnedSourceBaseUrl = new URL('./runtime-owned/', pageUrl);
  const runtimeOwnedSourceIndexUrl = new URL('index.html', runtimeOwnedSourceBaseUrl);
  const sourceMode = normalizeCompatSourceMode(pageUrl.searchParams.get('legacyCompatSource'));
  const assetBaseMode = normalizeCompatAssetBaseMode(pageUrl.searchParams.get('legacyCompatAssetBase'));
  const sourceIndexUrl = sourceMode === 'runtime-owned' ? runtimeOwnedSourceIndexUrl : editorIndexUrl;
  const assetBaseUrl = assetBaseMode === 'runtime-owned' ? runtimeOwnedSourceBaseUrl : editorBaseUrl;
  return {
    pageUrl,
    editorBaseUrl,
    editorIndexUrl,
    runtimeOwnedSourceBaseUrl,
    runtimeOwnedSourceIndexUrl,
    sourceMode,
    sourceIndexUrl,
    assetBaseMode,
    assetBaseUrl
  };
};

const applyEditorFallbackAvailabilityProbe = (compatSource, probe) => {
  const requestedSourceMode = compatSource.sourceMode;
  const requestedAssetBaseMode = compatSource.assetBaseMode;
  const needsEditorPath = requestedSourceMode === 'editor' || requestedAssetBaseMode === 'editor';
  if (!needsEditorPath) {
    return { compatSource, changed: false, probe: probe || null };
  }
  if (probe?.ok) {
    return { compatSource, changed: false, probe: probe || null };
  }

  const sourceMode = requestedSourceMode === 'editor' ? 'runtime-owned' : requestedSourceMode;
  const assetBaseMode = requestedAssetBaseMode === 'editor' ? 'runtime-owned' : requestedAssetBaseMode;
  const next = {
    ...compatSource,
    requestedSourceMode,
    requestedAssetBaseMode,
    sourceMode,
    assetBaseMode,
    sourceIndexUrl: sourceMode === 'runtime-owned' ? compatSource.runtimeOwnedSourceIndexUrl : compatSource.editorIndexUrl,
    assetBaseUrl: assetBaseMode === 'runtime-owned' ? compatSource.runtimeOwnedSourceBaseUrl : compatSource.editorBaseUrl
  };
  return { compatSource: next, changed: true, probe: probe || null };
};

const resolveEditorFallbackAvailability = async (compatSource) => {
  const requestedSourceMode = compatSource.sourceMode;
  const requestedAssetBaseMode = compatSource.assetBaseMode;
  const needsEditorPath = requestedSourceMode === 'editor' || requestedAssetBaseMode === 'editor';
  if (!needsEditorPath) {
    return { compatSource, changed: false, probe: null };
  }

  const probe = await fetchStatus(compatSource.editorIndexUrl.toString());
  return applyEditorFallbackAvailabilityProbe(compatSource, probe);
};

const injectCompatHead = (htmlText, assetBaseUrl) => {
  const marker = '<!-- jumpmap-runtime legacy compat target -->';
  const baseTag = `<base href="${assetBaseUrl.toString()}">`;
  const runtimeBaseScript = `<script>(function(){const SRC=${JSON.stringify(COMPAT_MESSAGE_SOURCE)};const post=(phase,extra)=>{try{window.parent&&window.parent.postMessage(Object.assign({source:SRC,phase},extra||{}),'*');}catch(_e){}};window.__JUMPMAP_EDITOR_RUNTIME_BASE_HREF__=${JSON.stringify(assetBaseUrl.toString())};window.__JUMPMAP_RUNTIME_LEGACY_COMPAT_TARGET__=true;post('compat-head-injected');document.addEventListener('DOMContentLoaded',()=>post('compat-dom-content-loaded'));window.addEventListener('load',()=>post('compat-window-load'));window.addEventListener('error',(e)=>post('compat-window-error',{message:(e&&e.message)||'window error'}));window.addEventListener('unhandledrejection',(e)=>post('compat-unhandledrejection',{message:String((e&&e.reason&&e.reason.message)|| (e&&e.reason) || 'unhandled rejection')}));})();</script>`;

  if (/<head\b[^>]*>/i.test(htmlText)) {
    return htmlText.replace(/<head\b[^>]*>/i, (match) => `${match}\n    ${marker}\n    ${baseTag}\n    ${runtimeBaseScript}`);
  }

  return `<!doctype html><html><head>${marker}${baseTag}${runtimeBaseScript}</head><body>${htmlText}</body></html>`;
};

const start = async () => {
  postParentEvent('start');
  let compatSource;
  let compatSourceFallbackProbe = null;
  let usedEditorFallbackAutoRecovery = false;
  try {
    compatSource = buildCompatSourceUrls(window.location.href);
    const resolved = await resolveEditorFallbackAvailability(compatSource);
    compatSource = resolved.compatSource;
    compatSourceFallbackProbe = resolved.probe;
    if (resolved.changed) {
      usedEditorFallbackAutoRecovery = true;
      postParentEvent('editor-path-unavailable-fallback', {
        requestedSourceMode: compatSource.requestedSourceMode || 'editor',
        requestedAssetBaseMode: compatSource.requestedAssetBaseMode || 'editor',
        sourceMode: compatSource.sourceMode,
        assetBaseMode: compatSource.assetBaseMode,
        editorIndexUrl: compatSource.editorIndexUrl.toString(),
        probeStatus: compatSourceFallbackProbe?.status ?? 0,
        probeMessage: compatSourceFallbackProbe?.message || ''
      });
    }
    postParentEvent('urls-ready', {
      requestedSourceMode: compatSource.requestedSourceMode || compatSource.sourceMode,
      sourceMode: compatSource.sourceMode,
      sourceIndexUrl: compatSource.sourceIndexUrl.toString(),
      requestedAssetBaseMode: compatSource.requestedAssetBaseMode || compatSource.assetBaseMode,
      assetBaseMode: compatSource.assetBaseMode,
      assetBaseUrl: compatSource.assetBaseUrl.toString(),
      editorProbeStatus: compatSourceFallbackProbe?.status ?? null
    });
  } catch (error) {
    console.error('[JumpmapRuntimeLegacyCompat] failed to build editor url', error);
    postParentEvent('url-build-error', { message: errorMessageOf(error) });
    setStatus('에디터 경로 계산에 실패했습니다.');
    return;
  }

  showTarget(compatSource.sourceIndexUrl.toString());
  setStatus(
    usedEditorFallbackAutoRecovery
      ? 'editor fallback 경로가 없어 runtime-owned compat로 전환했습니다.'
      : compatSource.sourceMode === 'runtime-owned'
      ? (compatSource.assetBaseMode === 'runtime-owned'
          ? 'runtime-owned compat source HTML + asset-base를 준비하는 중...'
          : 'runtime-owned compat source HTML을 가져오는 중...')
      : '에디터 HTML을 가져오는 중...'
  );
  postParentEvent('fetch-start', {
    url: compatSource.sourceIndexUrl.toString(),
    sourceMode: compatSource.sourceMode,
    assetBaseMode: compatSource.assetBaseMode
  });

  let htmlText = '';
  try {
    const res = await fetch(compatSource.sourceIndexUrl.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    htmlText = await res.text();
    postParentEvent('fetch-ok', {
      status: res.status,
      bytes: htmlText.length,
      sourceMode: compatSource.sourceMode,
      assetBaseMode: compatSource.assetBaseMode
    });
  } catch (error) {
    console.error('[JumpmapRuntimeLegacyCompat] failed to fetch editor html', error);
    postParentEvent('fetch-error', { message: errorMessageOf(error) });
    setStatus('에디터 HTML 로드에 실패했습니다. (네트워크/경로 확인 필요)');
    return;
  }

  try {
    const compatHtml = injectCompatHead(htmlText, compatSource.assetBaseUrl);
    postParentEvent('inject-ready');
    setStatus('Compat Target 문서를 적용하는 중...');
    document.open();
    document.write(compatHtml);
    document.close();
  } catch (error) {
    console.error('[JumpmapRuntimeLegacyCompat] failed to apply compat html', error);
    postParentEvent('inject-apply-failed', { message: errorMessageOf(error) });
    setStatus('Compat Target 문서 적용에 실패했습니다.');
  }
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  start().catch((error) => {
    console.error('[JumpmapRuntimeLegacyCompat] unhandled start error', error);
    setStatus(`Compat Target 초기화 오류: ${errorMessageOf(error)}`);
  });
}

export {
  normalizeCompatSourceMode,
  normalizeCompatAssetBaseMode,
  buildCompatSourceUrls,
  applyEditorFallbackAvailabilityProbe,
  injectCompatHead
};
