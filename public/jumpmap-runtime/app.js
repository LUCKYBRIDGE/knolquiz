import {
  buildJumpmapRuntimeLegacyPlayUrl,
  cacheJumpmapRuntimeBootstrap,
  loadJumpmapRuntimeMap,
  normalizeJumpmapLauncherSetup,
  readJumpmapLauncherSetup
} from '../shared/jumpmap-runtime-launcher.js';
import { summarizeJumpmapRuntimeMap } from '../shared/jumpmap-runtime-core.js';
import {
  getJumpmapRuntimePhysicsDepStatus,
  resetJumpmapRuntimePhysicsDebugStats
} from '../shared/jumpmap-runtime-physics-adapter.js';
import { bootstrapNativeJumpmapRuntime } from './native-runtime.js';

const RUNTIME_IMPL_STORAGE_KEY = 'jumpmap.runtime.impl.v1';

const shellState = {
  targetUrl: null,
  redirectTimerId: null,
  legacyDepsLoadPromise: null
};

const setPlayModeClass = ({ nativePlayMode = false, cleanPlayMode = false } = {}) => {
  if (!document?.body) return;
  document.body.classList.toggle('play-mode', !!nativePlayMode);
  document.body.classList.toggle('runtime-play-clean', !!cleanPlayMode);
};

const hasLegacyRuntimeDepsLoaded = () => (
  typeof window !== 'undefined' &&
  !!window.JumpmapTestPhysicsUtils
);

const loadLegacyScript = (src) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[data-jumpmap-runtime-legacy-src="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') {
      resolve();
      return;
    }
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error(`failed to load legacy dependency: ${src}`)), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = false;
  script.dataset.jumpmapRuntimeLegacySrc = src;
  script.addEventListener('load', () => {
    script.dataset.loaded = 'true';
    resolve();
  }, { once: true });
  script.addEventListener('error', () => {
    reject(new Error(`failed to load legacy dependency: ${src}`));
  }, { once: true });
  document.body.appendChild(script);
});

const ensureLegacyRuntimeDepsLoaded = async () => {
  if (hasLegacyRuntimeDepsLoaded()) return { loaded: false, source: 'already-present' };
  if (!shellState.legacyDepsLoadPromise) {
    shellState.legacyDepsLoadPromise = (async () => {
      await loadLegacyScript('../shared/legacy/test-physics-utils.js');
      if (!hasLegacyRuntimeDepsLoaded()) {
        throw new Error('legacy runtime physics utility loaded but global was not initialized');
      }
      return { loaded: true, source: 'dynamic-loader' };
    })().catch((error) => {
      shellState.legacyDepsLoadPromise = null;
      throw error;
    });
  }
  return shellState.legacyDepsLoadPromise;
};

const setStatus = (text) => {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
};

const showError = (text) => {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
};

const clearError = () => {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
};

const renderRows = (elementId, rows) => {
  const root = document.getElementById(elementId);
  if (!root) return;
  root.innerHTML = '';
  (rows || []).forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'row';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = key;
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = value == null ? '-' : String(value);
    row.append(k, v);
    root.appendChild(row);
  });
};

const appendStatusLog = (tag, message) => {
  const root = document.getElementById('status-log');
  if (!root) return;
  const row = document.createElement('div');
  row.className = 'log-row';
  const tagEl = document.createElement('span');
  tagEl.className = 'tag';
  tagEl.textContent = tag;
  const msgEl = document.createElement('span');
  msgEl.className = 'msg';
  msgEl.textContent = message;
  row.append(tagEl, msgEl);
  root.appendChild(row);
};

const getLaunchNowButton = () => document.getElementById('launch-now-btn');
const getRuntimeImplSelect = () => document.getElementById('runtime-impl-select');
const getApplyRuntimeImplButton = () => document.getElementById('apply-runtime-impl-btn');
const getNativeStagePanel = () => document.getElementById('native-stage-panel');
const getNativePreviewCanvas = () => document.getElementById('native-preview-canvas');
const getNativeStageMeta = () => document.getElementById('native-stage-meta');
const getNativePreviewOverlay = () => document.getElementById('native-preview-overlay');
const getNativePreviewCameraFrame = () => document.getElementById('native-preview-camera-frame');
const getNativePreviewPlayer = () => document.getElementById('native-preview-player');
const getNativePreviewPlayerHitbox = () => document.getElementById('native-preview-player-hitbox');
const getNativePreviewPlayerSprite = () => document.getElementById('native-preview-player-sprite');
const getNativeLeftButton = () => document.getElementById('native-left-btn');
const getNativeRightButton = () => document.getElementById('native-right-btn');
const getNativeJumpButton = () => document.getElementById('native-jump-btn');

const setManualLaunchButtonState = ({ enabled = false, label = null } = {}) => {
  const button = getLaunchNowButton();
  if (!button) return;
  button.disabled = !enabled;
  if (typeof label === 'string' && label.trim()) button.textContent = label;
};

const setNativeStageVisibility = (visible) => {
  const panel = getNativeStagePanel();
  if (!panel) return;
  panel.classList.toggle('show', !!visible);
};

const setNativeStageMeta = (text) => {
  const el = getNativeStageMeta();
  if (!el) return;
  el.textContent = text;
};

const normalizeRuntimeImpl = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'native') return 'native';
  if (normalized === 'shell') return 'shell';
  return 'legacy';
};

const readStoredRuntimeImpl = () => {
  try {
    return normalizeRuntimeImpl(window.localStorage.getItem(RUNTIME_IMPL_STORAGE_KEY));
  } catch (error) {
    console.warn('[JumpmapRuntime] failed to read runtime impl preference', error);
    return 'legacy';
  }
};

const writeStoredRuntimeImpl = (value) => {
  try {
    window.localStorage.setItem(RUNTIME_IMPL_STORAGE_KEY, normalizeRuntimeImpl(value));
    return true;
  } catch (error) {
    console.warn('[JumpmapRuntime] failed to save runtime impl preference', error);
    return false;
  }
};

const getRuntimeShellOptions = () => {
  const params = new URLSearchParams(window.location.search);
  const queryImpl = params.get('runtimeImpl');
  const runtimeImpl = queryImpl ? normalizeRuntimeImpl(queryImpl) : readStoredRuntimeImpl();
  const holdFlag = ['1', 'true', 'yes', 'on'].includes(String(params.get('runtimeShellOnly') || params.get('hold') || '').toLowerCase());
  const delayMsRaw = Number(params.get('runtimeRedirectDelayMs'));
  const delayMs = Number.isFinite(delayMsRaw) && delayMsRaw >= 0 ? Math.round(delayMsRaw) : 240;
  return { hold: holdFlag || runtimeImpl === 'shell', delayMs, runtimeImpl };
};

const getRuntimeLaunchContext = () => {
  const params = new URLSearchParams(window.location.search);
  const launchMode = String(params.get('launchMode') || '').trim().toLowerCase();
  const fromLauncher = ['1', 'true', 'yes', 'on'].includes(String(params.get('fromLauncher') || '').toLowerCase());
  const nativeShellOnly = ['1', 'true', 'yes', 'on'].includes(String(params.get('nativeShellOnly') || '').toLowerCase());
  const nativePlay = ['1', 'true', 'yes', 'on'].includes(String(params.get('nativePlay') || '').toLowerCase());
  const nativeStay = ['1', 'true', 'yes', 'on'].includes(String(params.get('nativeStay') || '').toLowerCase());
  const nativeFallbackLegacy = ['1', 'true', 'yes', 'on'].includes(String(params.get('nativeFallbackLegacy') || '').toLowerCase());
  return {
    launchMode,
    fromLauncher,
    nativeShellOnly,
    nativePlay,
    nativeStay,
    nativeFallbackLegacy
  };
};

const parseDebugFlag = (params, key) => {
  const raw = String(params.get(key) || '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const parseDebugFlagTriState = (params, key) => {
  if (!params.has(key)) return null;
  const raw = String(params.get(key) || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return null;
};

const shouldPreloadLegacyRuntimeDepsForNativePreview = ({
  resolveBridgeDebugFlags = null,
  depStatus = null
} = {}) => {
  const params = new URLSearchParams(window.location.search);
  if (parseDebugFlag(params, 'nativeLegacyDeps')) return true;
  if (hasLegacyRuntimeDepsLoaded()) return false;

  const sharedPhysicsReady = !!(depStatus?.sharedPhysicsBridgeReady && depStatus?.sharedPhysicsValid);
  const sharedGeometryReady = !!depStatus?.sharedGeometryValid;
  if (!sharedPhysicsReady || !sharedGeometryReady) return true;

  return !!(
    resolveBridgeDebugFlags?.compare ||
    resolveBridgeDebugFlags?.horizontalApply ||
    resolveBridgeDebugFlags?.verticalApply
  );
};

const applyResolveBridgeDebugFlagsFromUrl = ({ runtimeImpl = 'legacy', launchContext = null } = {}) => {
  const params = new URLSearchParams(window.location.search);
  const validatePresetParam = parseDebugFlagTriState(params, 'resolveBridgeValidate');
  const hasResolveBridgeFlagParam = [
    'resolveBridgeValidate',
    'resolveBridgeSmoke',
    'resolveBridgeCompare',
    'resolveHorizontalApply',
    'resolveVerticalApply'
  ].some((key) => params.has(key));
  const launcherPlayMode = !!(
    launchContext &&
    launchContext.launchMode === 'play' &&
    launchContext.fromLauncher
  );
  const nativeDefaultValidatePreset =
    runtimeImpl === 'native' &&
    !launcherPlayMode &&
    validatePresetParam == null &&
    !hasResolveBridgeFlagParam;
  const validatePreset = validatePresetParam === true || nativeDefaultValidatePreset;
  const flags = {
    validatePreset,
    validatePresetSource: validatePreset
      ? (validatePresetParam === true ? 'url' : (nativeDefaultValidatePreset ? 'native-default' : 'preset'))
      : 'none',
    reset: parseDebugFlag(params, 'resolveBridgeReset'),
    smoke: parseDebugFlag(params, 'resolveBridgeSmoke'),
    compare: validatePreset || parseDebugFlag(params, 'resolveBridgeCompare'),
    horizontalApply: validatePreset || parseDebugFlag(params, 'resolveHorizontalApply'),
    verticalApply: validatePreset || parseDebugFlag(params, 'resolveVerticalApply')
  };
  window.__JUMPMAP_RUNTIME_RESOLVE_BRIDGE_SMOKECHECK = flags.smoke;
  window.__JUMPMAP_RUNTIME_RESOLVE_BRIDGE_COMPARECHECK = flags.compare;
  window.__JUMPMAP_RUNTIME_RESOLVE_HORIZONTAL_BRIDGE_APPLY = flags.horizontalApply;
  window.__JUMPMAP_RUNTIME_RESOLVE_VERTICAL_BRIDGE_APPLY = flags.verticalApply;
  return flags;
};

const shouldEnableRuntimeDebugUi = (params) => {
  const keys = ['runtimeDebug', 'runtimeDebugUi', 'runtimeShellDebug'];
  return keys.some((key) => parseDebugFlag(params, key));
};

const launchLegacyRuntime = () => {
  if (!shellState.targetUrl) return;
  window.location.replace(shellState.targetUrl);
};

const scheduleLegacyLaunch = (targetUrl, delayMs) => {
  shellState.targetUrl = targetUrl.toString();
  if (shellState.redirectTimerId) {
    window.clearTimeout(shellState.redirectTimerId);
  }
  shellState.redirectTimerId = window.setTimeout(() => {
    shellState.redirectTimerId = null;
    launchLegacyRuntime();
  }, delayMs);
};

const renderSetupSummary = (setup) => {
  if (!setup) {
    renderRows('setup-summary-rows', [['상태', '설정 없음']]);
    return;
  }
  const playerCharacterSummary = Array.isArray(setup.playerCharacterIds) && setup.playerCharacterIds.length
    ? setup.playerCharacterIds
      .map((id, idx) => {
        const tag = Array.isArray(setup.playerTags) ? setup.playerTags[idx] : '';
        return tag ? `${idx + 1}P:${id}(${tag}번)` : `${idx + 1}P:${id}`;
      })
      .join(', ')
    : (setup.characterId || '-');
  renderRows('setup-summary-rows', [
    ['인원', `${setup.players || 1}명`],
    ['퀴즈', setup.quizPresetId || '-'],
    ['캐릭터', playerCharacterSummary],
    ['점프맵 종료', setup.jumpmapEndMode === 'reach-top' ? '꼭대기 도달 시 종료' : '종료 조건 없음'],
    ['스타트', setup.jumpmapStartPointId || '시작지점'],
    ['플레이어', Array.isArray(setup.playerNames) ? setup.playerNames.join(', ') : '-']
  ]);
};

const renderMapSummary = (summary, runtimeMapResult) => {
  if (!summary) {
    renderRows('map-summary-rows', [
      ['상태', '대기 중'],
      ['소스', runtimeMapResult?.url || '-']
    ]);
    return;
  }
  renderRows('map-summary-rows', [
    ['상태', '로드 성공'],
    ['버전', summary.version ?? '-'],
    ['크기', `${summary.width || 0} x ${summary.height || 0}`],
    ['오브젝트', summary.objectCount ?? 0],
    ['히트박스', `${summary.rectHitboxes ?? 0}/${summary.polygonHitboxes ?? 0}`],
    ['배경', summary.hasBackgroundImage ? '이미지 사용' : '이미지 없음']
  ]);
};

const renderRuntimeImplSelection = (runtimeImpl) => {
  const select = getRuntimeImplSelect();
  if (select) select.value = normalizeRuntimeImpl(runtimeImpl);
};

const buildRuntimeShellUrlWithImpl = (runtimeImpl) => {
  const url = new URL(window.location.href);
  url.searchParams.set('runtimeImpl', normalizeRuntimeImpl(runtimeImpl));
  if (normalizeRuntimeImpl(runtimeImpl) !== 'shell') {
    url.searchParams.delete('runtimeShellOnly');
    url.searchParams.delete('hold');
  }
  return url;
};

const applyRuntimeImplSelection = () => {
  const select = getRuntimeImplSelect();
  if (!select) return;
  const nextImpl = normalizeRuntimeImpl(select.value);
  writeStoredRuntimeImpl(nextImpl);
  const nextUrl = buildRuntimeShellUrlWithImpl(nextImpl);
  window.location.replace(nextUrl.toString());
};

const start = async () => {
  clearError();
  setManualLaunchButtonState({ enabled: false, label: '레거시 플레이 시작' });
  setNativeStageVisibility(false);
  setNativeStageMeta('미초기화');
  const setup = normalizeJumpmapLauncherSetup(readJumpmapLauncherSetup());
  const shellOptions = getRuntimeShellOptions();
  const launchContext = getRuntimeLaunchContext();
  const runtimeParams = new URLSearchParams(window.location.search);
  const runtimeDebugUi = shouldEnableRuntimeDebugUi(runtimeParams);
  const launcherPlayMode =
    launchContext.launchMode === 'play' &&
    launchContext.fromLauncher;
  const nativePlayMode =
    shellOptions.runtimeImpl === 'native' &&
    launcherPlayMode &&
    launchContext.nativePlay &&
    !launchContext.nativeShellOnly;
  const cleanPlayMode =
    launcherPlayMode &&
    !runtimeDebugUi &&
    shellOptions.runtimeImpl === 'legacy';
  setPlayModeClass({ nativePlayMode, cleanPlayMode });
  const resolveBridgeDebugFlags = applyResolveBridgeDebugFlagsFromUrl({
    runtimeImpl: shellOptions.runtimeImpl,
    launchContext
  });
  if (resolveBridgeDebugFlags.reset) {
    resetJumpmapRuntimePhysicsDebugStats();
  }
  renderRuntimeImplSelection(shellOptions.runtimeImpl);
  renderSetupSummary(setup);
  renderMapSummary(null, null);
  if (!setup) {
    setStatus('메인화면 설정을 찾지 못했습니다');
    appendStatusLog('실패', '메인화면 설정이 없어 점프맵 런타임을 시작할 수 없습니다.');
    showError('메인화면에서 인원/퀴즈/게임을 선택한 뒤 다시 시작해 주세요.');
    return;
  }

  appendStatusLog('준비', `메인화면 설정 확인 완료 (${setup.players}명 / ${setup.quizPresetId})`);
  appendStatusLog('구현', `선택된 런타임 구현체: ${shellOptions.runtimeImpl}`);
  appendStatusLog(
    '브리지',
    `resolve 디버그 smoke=${resolveBridgeDebugFlags.smoke ? 'on' : 'off'}, compare=${resolveBridgeDebugFlags.compare ? 'on' : 'off'}, H-apply=${resolveBridgeDebugFlags.horizontalApply ? 'on' : 'off'}, V-apply=${resolveBridgeDebugFlags.verticalApply ? 'on' : 'off'}${resolveBridgeDebugFlags.validatePreset ? (resolveBridgeDebugFlags.validatePresetSource === 'native-default' ? ' (validate preset:native default)' : ' (validate preset)') : ''}`
  );
  if (resolveBridgeDebugFlags.reset) {
    appendStatusLog('브리지', 'resolve bridge 비교/적용 통계를 초기화했습니다.');
  }
  if (
    (resolveBridgeDebugFlags.horizontalApply || resolveBridgeDebugFlags.verticalApply) &&
    !resolveBridgeDebugFlags.compare
  ) {
    appendStatusLog('경고', 'resolve apply가 compare 없이 활성화되었습니다. 검증 단계에서는 compare를 함께 켜는 것을 권장합니다.');
  }
  setStatus('운영용 점프맵 데이터를 확인하는 중...');
  const runtimeMapResult = await loadJumpmapRuntimeMap(window.location.href);
  const runtimeMapSummary = summarizeJumpmapRuntimeMap(runtimeMapResult?.map);
  renderMapSummary(runtimeMapSummary, runtimeMapResult);
  if (!runtimeMapResult?.map) {
    console.warn('[JumpmapRuntime] runtime map preflight unavailable; continuing with legacy fallback');
    appendStatusLog('경고', '운영 맵 사전 로드 실패. fallback 흐름으로 계속 진행합니다.');
    renderRows('map-summary-rows', [
      ['상태', '로드 실패 (fallback)'],
      ['소스', runtimeMapResult?.url || '-']
    ]);
  } else {
    appendStatusLog(
      '확인',
      `운영 맵 로드 성공 (v${runtimeMapSummary?.version ?? '-'}, 오브젝트 ${runtimeMapSummary?.objectCount ?? 0}개)`
    );
  }

  cacheJumpmapRuntimeBootstrap({
    setup,
    runtimeImpl: shellOptions.runtimeImpl,
    runtimeMapUrl: runtimeMapResult?.url || '',
    runtimeMapLoaded: Boolean(runtimeMapResult?.map),
      runtimeMapSummary,
      runtimeMapVersion:
        runtimeMapResult?.map && typeof runtimeMapResult.map === 'object'
          ? runtimeMapResult.map.version ?? null
        : null,
      resolveBridgeDebugFlags
    });
  appendStatusLog('캐시', '런타임 준비 정보를 세션에 저장했습니다.');

  const targetUrl = buildJumpmapRuntimeLegacyPlayUrl(window.location.href);
  shellState.targetUrl = targetUrl.toString();
  setManualLaunchButtonState({
    enabled: true,
    label: shellOptions.runtimeImpl === 'legacy' ? '레거시 플레이 시작' : '레거시 플레이 비교 실행'
  });

  if (shellOptions.runtimeImpl === 'native') {
    const physicsDepStatusBefore = getJumpmapRuntimePhysicsDepStatus();
    appendStatusLog(
      '의존',
      `물리=${physicsDepStatusBefore.physicsSource}, 지오메트리=${physicsDepStatusBefore.geometrySource}, sharedBridge=${physicsDepStatusBefore.sharedPhysicsBridgeReady ? 'ready' : 'not-ready'}, legacyPhysics=${physicsDepStatusBefore.legacyPhysicsPresent ? 'yes' : 'no'}`
    );

    const shouldPreloadLegacyDeps = shouldPreloadLegacyRuntimeDepsForNativePreview({
      resolveBridgeDebugFlags,
      depStatus: physicsDepStatusBefore
    });
    if (shouldPreloadLegacyDeps) {
      try {
        const depLoadResult = await ensureLegacyRuntimeDepsLoaded();
        appendStatusLog(
          '의존',
          depLoadResult.loaded
            ? 'legacy 물리 유틸(test-physics-utils)을 shared/legacy 경로에서 동적 로드했습니다.'
            : 'legacy 물리 유틸(test-physics-utils)이 이미 준비되어 있습니다.'
        );
      } catch (error) {
        console.error('[JumpmapRuntime] failed to load legacy runtime dependencies for native preview', error);
        appendStatusLog('경고', `legacy 유틸 로드 실패(shared 경로로 계속 시도): ${error?.message || error}`);
      }
    } else {
      appendStatusLog('의존', 'shared 물리/지오메트리 경로로 네이티브 프리뷰를 시작합니다. (legacy 유틸 preload 생략)');
    }

    const physicsDepStatusAfter = getJumpmapRuntimePhysicsDepStatus();
    if (!physicsDepStatusAfter.ready) {
      appendStatusLog(
        '오류',
        `런타임 물리 의존 준비 실패 (physics=${physicsDepStatusAfter.physicsSource}, geometry=${physicsDepStatusAfter.geometrySource})`
      );
      setStatus('독립 런타임 프리뷰 준비 중 물리 의존 확인 실패');
      showError('독립 런타임 프리뷰에 필요한 물리/지오메트리 의존 준비에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    setNativeStageVisibility(true);
    setNativeStageMeta('독립 런타임 플레이스홀더 초기화 중...');
    const nativeResult = await bootstrapNativeJumpmapRuntime({
      setup,
      playMode: nativePlayMode,
      runtimeMap: runtimeMapResult?.map || null,
      runtimeMapSummary,
      appendStatusLog,
      setStatus
      ,
      stagePanel: getNativeStagePanel(),
      previewCanvas: getNativePreviewCanvas(),
      stageMetaEl: getNativeStageMeta(),
      previewOverlay: getNativePreviewOverlay(),
      previewCameraFrameEl: getNativePreviewCameraFrame(),
      previewPlayerEl: getNativePreviewPlayer(),
      previewPlayerHitboxEl: getNativePreviewPlayerHitbox(),
      previewPlayerSpriteEl: getNativePreviewPlayerSprite(),
      controls: {
        leftBtn: getNativeLeftButton(),
        rightBtn: getNativeRightButton(),
        jumpBtn: getNativeJumpButton()
      },
      baseHref: window.location.href
    });
    cacheJumpmapRuntimeBootstrap({
      setup,
      runtimeImpl: shellOptions.runtimeImpl,
      runtimeMapUrl: runtimeMapResult?.url || '',
      runtimeMapLoaded: Boolean(runtimeMapResult?.map),
      runtimeMapSummary,
      runtimeMapVersion:
        runtimeMapResult?.map && typeof runtimeMapResult.map === 'object'
          ? runtimeMapResult.map.version ?? null
          : null,
      resolveBridgeDebugFlags,
      nativeRuntimePlaceholder: {
        ok: Boolean(nativeResult?.ok),
        reason: nativeResult?.reason || '',
        ready: nativeResult?.ready || ''
      }
    });
    if (nativePlayMode) {
      if (launchContext.nativeStay || launchContext.nativeShellOnly || !launchContext.nativeFallbackLegacy) {
        setStatus('독립 점프맵 런타임 플레이 모드 실행 중');
        appendStatusLog(
          '실행',
          launchContext.nativeFallbackLegacy
            ? '독립 런타임 플레이 루프를 유지합니다. (nativeStay/nativeShellOnly)'
            : '독립 런타임 플레이 루프를 유지합니다. (기본: native 실플레이 유지)'
        );
      } else {
        setStatus('독립 런타임 사전 준비 완료, 플레이로 자동 연결 중');
        appendStatusLog('이동', '현재 단계에서는 사용자 플레이를 레거시 구현체로 자동 연결합니다.');
        scheduleLegacyLaunch(targetUrl, Math.max(80, shellOptions.delayMs));
      }
    } else {
      appendStatusLog('비교', '수동 시작 버튼으로 현재 레거시 플레이 구현체를 비교 실행할 수 있습니다.');
    }
    return;
  }

  if (shellOptions.runtimeImpl === 'shell') {
    setStatus('점프맵 런타임 셸 준비 완료 (실험 셸 모드)');
    appendStatusLog('대기', '실험 셸 모드입니다. 자동 이동 없이 준비 상태를 유지합니다.');
    appendStatusLog('비교', '필요하면 수동 시작 버튼으로 현재 레거시 플레이 구현체를 비교 실행할 수 있습니다.');
    return;
  }

  if (shellOptions.hold) {
    setStatus('점프맵 런타임 셸 준비 완료 (수동 시작 대기)');
    appendStatusLog('대기', 'runtimeShellOnly=1 모드입니다. 수동 시작 버튼으로 레거시 플레이를 실행하세요.');
    return;
  }

  setStatus('기존 점프맵 플레이 구현체로 연결하는 중...');
  appendStatusLog('이동', '현재 단계에서는 레거시 점프맵 플레이 구현체로 연결합니다.');
  scheduleLegacyLaunch(targetUrl, shellOptions.delayMs);
};

start().catch((error) => {
  console.error('[JumpmapRuntime] bootstrap failed', error);
  setStatus('점프맵 런타임 준비 중 오류가 발생했습니다');
  appendStatusLog('오류', `런타임 준비 실패: ${error?.message || error}`);
  showError('점프맵 런타임 준비에 실패했습니다. 메인화면으로 돌아가 다시 시도해 주세요.');
});

getLaunchNowButton()?.addEventListener('click', () => {
  if (!shellState.targetUrl) return;
  appendStatusLog('수동', '사용자가 수동 시작 버튼으로 레거시 플레이를 실행했습니다.');
  launchLegacyRuntime();
});

getApplyRuntimeImplButton()?.addEventListener('click', () => {
  applyRuntimeImplSelection();
});
