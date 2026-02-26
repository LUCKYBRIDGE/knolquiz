import {
  createJumpmapRuntimeCore,
  computeJumpmapCameraRect,
} from '../shared/jumpmap-runtime-core.js';
import {
  computeJumpmapPlayerSpawnFromMap,
  getJumpmapPlayerMetricsFromRuntimeMap,
  getJumpmapPlayerSpriteRenderFromRuntimeMap
} from '../shared/jumpmap-runtime-init.js';
import { buildJumpmapRuntimeInitialState } from '../shared/jumpmap-runtime-state.js';
import {
  fitJumpmapWorldToCanvas,
  jumpmapRectsIntersect,
} from '../shared/jumpmap-runtime-preview.js';
import {
  getJumpmapRuntimePhysicsDeps,
  getJumpmapRuntimePhysicsDebugStats
} from '../shared/jumpmap-runtime-physics-adapter.js';

const imageCache = new Map();
const DYNAMIC_PREVIEW_REDRAW_INTERVAL_MS = 120;

const buildWorldFitProjector = ({ canvas, worldRect }) => {
  const fit = fitJumpmapWorldToCanvas(canvas, worldRect);
  return {
    worldToCanvasX: fit.worldToCanvasX,
    worldToCanvasY: fit.worldToCanvasY,
    scale: fit.scale,
    mode: 'world-fit'
  };
};

const buildCameraFitProjector = ({ canvas, cameraRect }) => {
  const safeCamera = cameraRect || { x: 0, y: 0, width: 960, height: 540 };
  const viewW = Math.max(1, Number(safeCamera.width) || 960);
  const viewH = Math.max(1, Number(safeCamera.height) || 540);
  const cw = Math.max(1, Number(canvas?.width) || 960);
  const ch = Math.max(1, Number(canvas?.height) || 540);
  const scale = Math.max(0.0001, Math.min(cw / viewW, ch / viewH));
  const offsetX = (cw - viewW * scale) * 0.5;
  const offsetY = (ch - viewH * scale) * 0.5;
  return {
    worldToCanvasX: (x) => (Number(x) - Number(safeCamera.x || 0)) * scale + offsetX,
    worldToCanvasY: (y) => (Number(y) - Number(safeCamera.y || 0)) * scale + offsetY,
    scale,
    mode: 'camera-fit'
  };
};

const loadImage = (src) => {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
};

const updateNativePreviewMetaText = ({
  metaEl,
  worldRect,
  renderedObjects = 0,
  visibleObjectsInCamera = null,
  playerSpawn = null,
  cameraRect = null,
  bridgeDebugStats = null
}) => {
  if (!metaEl || !worldRect) return;
  const playerText = playerSpawn?.basePoint
    ? ` · 시작점 (${Math.round(playerSpawn.basePoint.x)}, ${Math.round(playerSpawn.basePoint.y)})`
    : '';
  const cameraText = cameraRect
    ? ` · 카메라 ${Math.round(cameraRect.width)}x${Math.round(cameraRect.height)} @ (${Math.round(cameraRect.x)}, ${Math.round(cameraRect.y)})`
    : '';
  const visibleText = cameraRect && Number.isFinite(Number(visibleObjectsInCamera))
    ? ` · 카메라내 ${Math.max(0, Math.round(Number(visibleObjectsInCamera)))}/${Math.max(0, Math.round(Number(renderedObjects) || 0))}`
    : '';
  const bridgeText = bridgeDebugStats && !bridgeDebugStats.error
    ? ` · 브리지비교 H:${Number(bridgeDebugStats.horizontal?.mismatches) || 0}/${Number(bridgeDebugStats.horizontal?.compareCalls) || 0} V:${Number(bridgeDebugStats.vertical?.mismatches) || 0}/${Number(bridgeDebugStats.vertical?.compareCalls) || 0}`
    : '';
  const bridgeApplyText = bridgeDebugStats && !bridgeDebugStats.error
    ? ` · 브리지적용 H:${Number(bridgeDebugStats.horizontal?.applyAccepted) || 0}/${Number(bridgeDebugStats.horizontal?.applyRequests) || 0}(${Number(bridgeDebugStats.horizontal?.applyBlocked) || 0}) V:${Number(bridgeDebugStats.vertical?.applyAccepted) || 0}/${Number(bridgeDebugStats.vertical?.applyRequests) || 0}(${Number(bridgeDebugStats.vertical?.applyBlocked) || 0})`
    : '';
  metaEl.textContent = `${Math.round(worldRect.w)}x${Math.round(worldRect.h)} 영역 · ${Math.round(renderedObjects) || 0}개 오브젝트 렌더${visibleText}${playerText}${cameraText}${bridgeText}${bridgeApplyText}`;
};

const attachNativePreviewPhysicsLoop = ({
  runtimeMap,
  runtimeMapSummary,
  setup = null,
  playMode = false,
  previewCanvas,
  previewOverlay,
  previewCameraFrameEl = null,
  previewPlayerEl,
  previewPlayerHitboxEl,
  previewPlayerSpriteEl,
  controls = null,
  stageMetaEl = null,
  appendStatusLog = () => {}
}) => {
  const deps = getJumpmapRuntimePhysicsDeps();
  if (!deps) return { ok: false, reason: 'physics-utils-missing' };
  if (!previewCanvas || !previewOverlay || !previewPlayerEl || !previewPlayerHitboxEl) {
    return { ok: false, reason: 'preview-overlay-missing' };
  }
  const { physics, geometry } = deps;
  const runtimeInit = buildJumpmapRuntimeInitialState({
    runtimeMap,
    runtimeMapSummary,
    setup: setup || { players: 1, jumpmapStartPointId: '' },
    canvasWidth: previewCanvas.width || 960,
    canvasHeight: previewCanvas.height || 540,
    baseHref: window.location.href
  });
  if (!runtimeInit?.playerSpawn || !runtimeInit?.worldRect) {
    return { ok: false, reason: 'runtime-init-missing' };
  }
  const metrics = getJumpmapPlayerMetricsFromRuntimeMap(runtimeMap);
  const mapRect = runtimeInit.mapRect || {
    width: Math.max(1, Number(runtimeMapSummary?.width) || 2400),
    height: Math.max(1, Number(runtimeMapSummary?.height) || 12000)
  };
  const playerState = physics.createPlayerState();
  playerState.x = Number(runtimeInit.playerSpawn.hitboxRect.x) || 0;
  playerState.y = Number(runtimeInit.playerSpawn.hitboxRect.y) || 0;
  const obstacles = physics.collectObstacleBounds({
    objects: Array.isArray(runtimeMap?.objects) ? runtimeMap.objects : [],
    localPointToWorld: geometry.localPointToWorld
  });
  const spriteMeta = previewPlayerSpriteEl
    ? {
        w: previewPlayerSpriteEl.naturalWidth || 80,
        h: previewPlayerSpriteEl.naturalHeight || 120
      }
    : { w: 80, h: 120 };
  const spriteRender = getJumpmapPlayerSpriteRenderFromRuntimeMap(runtimeMap, spriteMeta);
  const worldRect = runtimeInit.worldRect || { x: 0, y: 0, w: mapRect.width, h: mapRect.height };
  const previewViewRect = runtimeInit.previewViewRect || { width: 900, height: 540 };
  const previewObjects = Array.isArray(runtimeInit.objects) ? runtimeInit.objects : [];
  const yBias = Number(runtimeMap?.camera?.yBias);
  const cssRect = () => {
    const r = previewOverlay.getBoundingClientRect();
    return {
      width: Math.max(1, r.width || previewCanvas.clientWidth || previewCanvas.width || 1),
      height: Math.max(1, r.height || previewCanvas.clientHeight || previewCanvas.height || 1)
    };
  };
  const computeDynamicCamera = () => computeJumpmapCameraRect({
    playerRect: { x: playerState.x, y: playerState.y, w: metrics.width, h: metrics.height },
    mapRect,
    viewRect: previewViewRect,
    yBias
  });
  const countVisibleObjects = (cameraRect) => {
    if (!cameraRect) return { visible: previewObjects.length, dimmed: 0 };
    let visible = 0;
    let dimmed = 0;
    for (const obj of previewObjects) {
      if (!obj?.worldRect) continue;
      if (jumpmapRectsIntersect(obj.worldRect, cameraRect)) visible += 1;
      else dimmed += 1;
    }
    return { visible, dimmed };
  };
  const updateCameraFrameOverlay = (cameraRect) => {
    if (playMode) {
      if (previewCameraFrameEl) previewCameraFrameEl.classList.remove('show');
      return;
    }
    if (!previewCameraFrameEl) return;
    if (!cameraRect) {
      previewCameraFrameEl.classList.remove('show');
      return;
    }
    const css = cssRect();
    const sx = css.width / Math.max(1, previewCanvas.width || 960);
    const sy = css.height / Math.max(1, previewCanvas.height || 540);
    const x = fit.worldToCanvasX(cameraRect.x) * sx;
    const y = fit.worldToCanvasY(cameraRect.y) * sy;
    const w = cameraRect.width * fit.scale * sx;
    const h = cameraRect.height * fit.scale * sy;
    previewCameraFrameEl.classList.add('show');
    previewCameraFrameEl.style.transform = `translate(${x}px, ${y}px)`;
    previewCameraFrameEl.style.width = `${Math.max(2, w)}px`;
    previewCameraFrameEl.style.height = `${Math.max(2, h)}px`;
  };
  const keyState = { left: false, right: false };
  const touchState = { left: false, right: false };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      keyState.left = true;
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      keyState.right = true;
      return;
    }
    if (event.code === 'Space' || event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      event.preventDefault();
      if (!event.repeat) playerState.input.jumpQueued = true;
      playerState.input.jumpHeld = true;
    }
  };
  const onKeyUp = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      keyState.left = false;
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      keyState.right = false;
      return;
    }
    if (event.code === 'Space' || event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      event.preventDefault();
      playerState.input.jumpHeld = false;
    }
  };
  const onWindowBlur = () => {
    keyState.left = false;
    keyState.right = false;
    touchState.left = false;
    touchState.right = false;
    playerState.input.jumpHeld = false;
    playerState.input.jumpQueued = false;
  };
  const setPointerActive = (button, active) => {
    if (!button) return;
    button.classList.toggle('is-active', !!active);
  };
  const bindHoldButton = (button, onPress, onRelease) => {
    if (!button) return () => {};
    const down = (event) => {
      event.preventDefault();
      if (button.setPointerCapture && event.pointerId != null) {
        try {
          button.setPointerCapture(event.pointerId);
        } catch (_error) {
          // no-op
        }
      }
      onPress();
    };
    const up = (event) => {
      event.preventDefault();
      onRelease();
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
    button.addEventListener('lostpointercapture', up);
    return () => {
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', up);
      button.removeEventListener('pointerleave', up);
      button.removeEventListener('lostpointercapture', up);
    };
  };
  const controlUnbinders = [];
  if (controls?.leftBtn) {
    controlUnbinders.push(bindHoldButton(
      controls.leftBtn,
      () => {
        touchState.left = true;
        setPointerActive(controls.leftBtn, true);
      },
      () => {
        touchState.left = false;
        setPointerActive(controls.leftBtn, false);
      }
    ));
  }
  if (controls?.rightBtn) {
    controlUnbinders.push(bindHoldButton(
      controls.rightBtn,
      () => {
        touchState.right = true;
        setPointerActive(controls.rightBtn, true);
      },
      () => {
        touchState.right = false;
        setPointerActive(controls.rightBtn, false);
      }
    ));
  }
  if (controls?.jumpBtn) {
    controlUnbinders.push(bindHoldButton(
      controls.jumpBtn,
      () => {
        playerState.input.jumpQueued = true;
        playerState.input.jumpHeld = true;
        setPointerActive(controls.jumpBtn, true);
      },
      () => {
        playerState.input.jumpHeld = false;
        setPointerActive(controls.jumpBtn, false);
      }
    ));
  }

  let rafId = 0;
  let lastTs = 0;
  let lastDynamicCamera = computeDynamicCamera();
  let lastVisibility = countVisibleObjects(lastDynamicCamera);
  let redrawInFlight = false;
  let pendingRedrawCamera = null;
  let lastRedrawMs = 0;
  let lastBridgeDebugSignature = '';
  const scheduleSceneRedraw = (cameraRect, ts) => {
    const targetCamera = cameraRect || computeDynamicCamera();
    const nowMs = Number.isFinite(Number(ts)) ? Number(ts) : performance.now();
    if (redrawInFlight) {
      pendingRedrawCamera = targetCamera;
      return;
    }
    if ((nowMs - lastRedrawMs) < DYNAMIC_PREVIEW_REDRAW_INTERVAL_MS) return;
    redrawInFlight = true;
    lastRedrawMs = nowMs;
    drawNativePreview({
      runtimeMap,
      runtimeMapSummary,
      setup: setup || { players: 1, jumpmapStartPointId: '' },
      canvas: previewCanvas,
      metaEl: null,
      renderStaticPlayer: false,
      appendStatusLog,
      baseHref: window.location.href,
      overridePreviewCamera: targetCamera,
      skipMetaUpdate: true,
      suppressLogs: true,
      cullOutsideCamera: true,
      cameraCullMarginWorld: Math.max(64, (Number(previewViewRect.width) || 900) * 0.12),
      drawCanvasCameraOverlay: false,
      projectionMode: playMode ? 'camera-fit' : 'world-fit'
    }).catch(() => {
      // Keep the minimal preview loop resilient; errors are surfaced via shell logs elsewhere.
    }).finally(() => {
      redrawInFlight = false;
      if (pendingRedrawCamera) {
        const queued = pendingRedrawCamera;
        pendingRedrawCamera = null;
        scheduleSceneRedraw(queued, performance.now());
      }
    });
  };
  const updateDynamicPreviewState = (ts, forceRedraw = false) => {
    const bridgeDebugStats = getJumpmapRuntimePhysicsDebugStats();
    lastDynamicCamera = computeDynamicCamera();
    lastVisibility = countVisibleObjects(lastDynamicCamera);
    updateCameraFrameOverlay(lastDynamicCamera);
    updateNativePreviewMetaText({
      metaEl: stageMetaEl,
      worldRect,
      renderedObjects: previewObjects.length,
      visibleObjectsInCamera: lastVisibility.visible,
      playerSpawn: runtimeInit.playerSpawn,
      cameraRect: lastDynamicCamera,
      bridgeDebugStats
    });
    const bridgeSignature = bridgeDebugStats?.error
      ? `err:${bridgeDebugStats.error}`
      : `HC${(Number(bridgeDebugStats?.horizontal?.compareCalls) || 0) > 0 ? 1 : 0}/HM${Number(bridgeDebugStats?.horizontal?.mismatches) || 0}/HE${Number(bridgeDebugStats?.horizontal?.errors) || 0}/HB${Number(bridgeDebugStats?.horizontal?.applyBlocked) || 0}|VC${(Number(bridgeDebugStats?.vertical?.compareCalls) || 0) > 0 ? 1 : 0}/VM${Number(bridgeDebugStats?.vertical?.mismatches) || 0}/VE${Number(bridgeDebugStats?.vertical?.errors) || 0}/VB${Number(bridgeDebugStats?.vertical?.applyBlocked) || 0}`;
    if (bridgeSignature !== lastBridgeDebugSignature) {
      lastBridgeDebugSignature = bridgeSignature;
      if (bridgeDebugStats?.error) {
        appendStatusLog('브리지', `비교 통계 조회 오류: ${bridgeDebugStats.error}`);
      } else if (
        (Number(bridgeDebugStats?.horizontal?.compareCalls) || 0) > 0 ||
        (Number(bridgeDebugStats?.vertical?.compareCalls) || 0) > 0
      ) {
        const recent = Array.isArray(bridgeDebugStats?.recentEvents) && bridgeDebugStats.recentEvents.length
          ? bridgeDebugStats.recentEvents[bridgeDebugStats.recentEvents.length - 1]
          : null;
        const recentText = recent ? ` · 최근 ${recent.axis}/${recent.type}` : '';
        appendStatusLog(
          '브리지',
          `비교 H mismatch ${Number(bridgeDebugStats.horizontal?.mismatches) || 0}/${Number(bridgeDebugStats.horizontal?.compareCalls) || 0}, V mismatch ${Number(bridgeDebugStats.vertical?.mismatches) || 0}/${Number(bridgeDebugStats.vertical?.compareCalls) || 0} · 적용 H ${Number(bridgeDebugStats.horizontal?.applyAccepted) || 0}/${Number(bridgeDebugStats.horizontal?.applyRequests) || 0}(${Number(bridgeDebugStats.horizontal?.applyBlocked) || 0}) V ${Number(bridgeDebugStats.vertical?.applyAccepted) || 0}/${Number(bridgeDebugStats.vertical?.applyRequests) || 0}(${Number(bridgeDebugStats.vertical?.applyBlocked) || 0})${recentText}`
        );
      }
    }
    if (forceRedraw) {
      scheduleSceneRedraw(lastDynamicCamera, ts);
      return;
    }
    const moving = Math.abs(Number(playerState.vx) || 0) > 0.001
      || Math.abs(Number(playerState.vy) || 0) > 0.001
      || playerState.input.left
      || playerState.input.right;
    if (moving) scheduleSceneRedraw(lastDynamicCamera, ts);
  };
  const renderOverlay = () => {
    const fit = playMode
      ? buildCameraFitProjector({ canvas: previewCanvas, cameraRect: lastDynamicCamera })
      : buildWorldFitProjector({ canvas: previewCanvas, worldRect: runtimeInit.worldRect });
    const css = cssRect();
    const sx = css.width / Math.max(1, previewCanvas.width || 960);
    const sy = css.height / Math.max(1, previewCanvas.height || 540);
    const hx = fit.worldToCanvasX(playerState.x) * sx;
    const hy = fit.worldToCanvasY(playerState.y) * sy;
    const hw = metrics.width * fit.scale * sx;
    const hh = metrics.height * fit.scale * sy;
    previewPlayerEl.classList.remove('hidden');
    previewPlayerEl.style.transform = `translate(${hx}px, ${hy}px)`;
    previewPlayerEl.style.width = `${hw}px`;
    previewPlayerEl.style.height = `${hh}px`;
    previewPlayerHitboxEl.style.width = '100%';
    previewPlayerHitboxEl.style.height = '100%';

    if (previewPlayerSpriteEl) {
      const sw = spriteRender.spriteW * fit.scale * sx;
      const sh = spriteRender.spriteH * fit.scale * sy;
      const sox = spriteRender.offsetX * fit.scale * sx;
      const soy = spriteRender.offsetY * fit.scale * sy;
      previewPlayerSpriteEl.style.left = `${sox}px`;
      previewPlayerSpriteEl.style.top = `${soy}px`;
      previewPlayerSpriteEl.style.width = `${sw}px`;
      previewPlayerSpriteEl.style.height = `${sh}px`;
      previewPlayerSpriteEl.style.transform = `scaleX(${playerState.facing === -1 ? -1 : 1})`;
      previewPlayerSpriteEl.style.opacity = '0.9';
    }
  };

  const loop = (ts) => {
    const dt = Math.min(0.05, Math.max(0.001, (ts - (lastTs || ts)) / 1000));
    lastTs = ts;
    const wantLeft = (keyState.left || touchState.left) && !(keyState.right || touchState.right);
    const wantRight = (keyState.right || touchState.right) && !(keyState.left || touchState.left);
    playerState.input.left = wantLeft;
    playerState.input.right = wantRight;
    physics.stepPlayerState({
      playerState,
      dt,
      moveSpeed: Math.max(0, Number(runtimeMap?.physics?.moveSpeed) || 220),
      physics: runtimeMap?.physics || {},
      metrics,
      playerHitboxPolygon: runtimeMap?.playerHitboxPolygon || null,
      map: { width: mapRect.width, height: mapRect.height },
      objects: Array.isArray(runtimeMap?.objects) ? runtimeMap.objects : [],
      obstacles,
      worldPointToLocal: geometry.worldPointToLocal,
      localPointToWorld: geometry.localPointToWorld
    });
    renderOverlay();
    updateDynamicPreviewState(ts, false);
    rafId = window.requestAnimationFrame(loop);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  renderOverlay();
  updateDynamicPreviewState(performance.now(), true);
  rafId = window.requestAnimationFrame(loop);
  appendStatusLog(
    'native',
    playMode
      ? '독립 런타임 플레이 루프 연결 완료 (좌/우/점프, 카메라 기준 렌더)'
      : '최소 물리 루프 연결 완료 (좌/우/점프, 1인 프리뷰) / 동적 카메라·가시성 프리뷰 동기화 활성화'
  );

  return {
    ok: true,
    stop: () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      controlUnbinders.forEach((unbind) => {
        try {
          unbind();
        } catch (_error) {
          // no-op
        }
      });
    }
  };
};

const drawNativePreview = async ({
  runtimeMap,
  runtimeMapSummary,
  setup = null,
  canvas,
  metaEl,
  renderStaticPlayer = true,
  appendStatusLog = () => {},
  baseHref = window.location.href,
  overridePreviewCamera = null,
  skipMetaUpdate = false,
  suppressLogs = false,
  cullOutsideCamera = false,
  cameraCullMarginWorld = 0,
  drawCanvasCameraOverlay = true,
  projectionMode = 'world-fit'
}) => {
  if (!canvas || !runtimeMap || typeof runtimeMap !== 'object') return { ok: false, reason: 'invalid-args' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'canvas-context' };

  const runtimeInitialState = buildJumpmapRuntimeInitialState({
    runtimeMap,
    runtimeMapSummary,
    setup,
    canvasWidth: canvas.width || 960,
    canvasHeight: canvas.height || 540,
    baseHref
  });
  if (!runtimeInitialState) return { ok: false, reason: 'initial-state' };

  const worldRect = runtimeInitialState.worldRect;
  const bg = runtimeInitialState.background || { color: '#ffffff', imageOpacity: 1, imageSrc: '' };
  const bgImageSrc = bg.imageSrc || '';
  const bgImage = await loadImage(bgImageSrc);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (bgImage) {
    // Preview uses a simple cover draw with bottom alignment to hint the "far background" behavior.
    const scale = Math.max(canvas.width / bgImage.naturalWidth, canvas.height / bgImage.naturalHeight);
    const dw = bgImage.naturalWidth * scale;
    const dh = bgImage.naturalHeight * scale;
    const dx = (canvas.width - dw) * 0.5;
    const dy = canvas.height - dh;
    ctx.save();
    ctx.globalAlpha = bg.imageOpacity;
    ctx.drawImage(bgImage, dx, dy, dw, dh);
    ctx.restore();
  }

  const playerPreviewImage = await loadImage(new URL('../quiz_sejong/sejong_rightside.png', baseHref).toString());
  const playerSpawn = runtimeInitialState.playerSpawn;
  const previewCamera = overridePreviewCamera || runtimeInitialState.previewCamera;
  const useCameraProjection = projectionMode === 'camera-fit' && !!previewCamera;
  const fit = useCameraProjection
    ? buildCameraFitProjector({ canvas, cameraRect: previewCamera })
    : buildWorldFitProjector({ canvas, worldRect });

  const objects = Array.isArray(runtimeInitialState.objects) ? runtimeInitialState.objects : [];
  const cullCameraRect = (previewCamera && cullOutsideCamera)
    ? {
        x: previewCamera.x - Math.max(0, Number(cameraCullMarginWorld) || 0),
        y: previewCamera.y - Math.max(0, Number(cameraCullMarginWorld) || 0),
        w: previewCamera.width + Math.max(0, Number(cameraCullMarginWorld) || 0) * 2,
        h: previewCamera.height + Math.max(0, Number(cameraCullMarginWorld) || 0) * 2
      }
    : null;
  let renderedObjects = 0;
  let visibleObjectsInCamera = 0;
  let dimmedObjectsOutsideCamera = 0;
  for (const obj of objects) {
    const crop = obj && typeof obj.crop === 'object' ? obj.crop : null;
    const cropX = Number(crop?.x) || 0;
    const cropY = Number(crop?.y) || 0;
    const cropW = Number(crop?.w) || 0;
    const cropH = Number(crop?.h) || 0;
    const hasCrop = cropW > 0 && cropH > 0;
    const image = await loadImage(obj.spriteSrc);
    if (!image) continue;
    const sourceW = hasCrop ? cropW : Math.max(0, image.naturalWidth || image.width || 0);
    const sourceH = hasCrop ? cropH : Math.max(0, image.naturalHeight || image.height || 0);
    if (sourceW <= 0 || sourceH <= 0) continue;
    const worldX = Number(obj.x) || 0;
    const worldY = Number(obj.y) || 0;
    const absScale = Math.max(0.01, Math.abs(Number(obj.scale) || 1));
    const drawW = hasCrop
      ? (Number(obj.drawW) || (sourceW * absScale))
      : (sourceW * absScale);
    const drawH = hasCrop
      ? (Number(obj.drawH) || (sourceH * absScale))
      : (sourceH * absScale);
    const rotationDeg = Number(obj.rotationDeg) || 0;
    const flipH = !!obj.flipH;
    const flipV = !!obj.flipV;

    const px = fit.worldToCanvasX(worldX);
    const py = fit.worldToCanvasY(worldY);
    const pw = drawW * fit.scale;
    const ph = drawH * fit.scale;
    const cx = px + pw * 0.5;
    const cy = py + ph * 0.5;
    const objectWorldRect = hasCrop
      ? (obj.worldRect || { x: worldX, y: worldY, w: drawW, h: drawH })
      : { x: worldX, y: worldY, w: drawW, h: drawH };
    const inStartCamera = previewCamera ? jumpmapRectsIntersect(objectWorldRect, previewCamera) : true;
    if (inStartCamera) visibleObjectsInCamera += 1;
    else dimmedObjectsOutsideCamera += 1;
    if (cullCameraRect && !jumpmapRectsIntersect(objectWorldRect, cullCameraRect)) {
      continue;
    }

    ctx.save();
    if (previewCamera && !inStartCamera && !cullOutsideCamera) ctx.globalAlpha = 0.22;
    ctx.translate(cx, cy);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(
      image,
      hasCrop ? cropX : 0,
      hasCrop ? cropY : 0,
      sourceW,
      sourceH,
      -pw * 0.5,
      -ph * 0.5,
      pw,
      ph
    );
    ctx.restore();
    renderedObjects += 1;
  }

  if (playerSpawn && playerSpawn.hitboxRect) {
    const hb = playerSpawn.hitboxRect;
    const bx = fit.worldToCanvasX(playerSpawn.basePoint.x);
    const by = fit.worldToCanvasY(playerSpawn.basePoint.y);

    // Start point marker (foot anchor)
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.lineTo(bx + 8, by);
    ctx.moveTo(bx, by - 8);
    ctx.lineTo(bx, by + 8);
    ctx.stroke();
    ctx.restore();

    // Player hitbox preview
    const hx = fit.worldToCanvasX(hb.x);
    const hy = fit.worldToCanvasY(hb.y);
    const hw = hb.w * fit.scale;
    const hh = hb.h * fit.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
    ctx.lineWidth = 2;
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeRect(hx, hy, hw, hh);
    ctx.restore();

    if (renderStaticPlayer && playerPreviewImage) {
      const spriteMeta = {
        w: playerPreviewImage.naturalWidth || 80,
        h: playerPreviewImage.naturalHeight || 120
      };
      const render = getJumpmapPlayerSpriteRenderFromRuntimeMap(runtimeMap, spriteMeta);
      const sxWorld = hb.x + render.offsetX;
      const syWorld = hb.y + render.offsetY;
      const sx = fit.worldToCanvasX(sxWorld);
      const sy = fit.worldToCanvasY(syWorld);
      const sw = render.spriteW * fit.scale;
      const sh = render.spriteH * fit.scale;
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.drawImage(
        playerPreviewImage,
        render.crop.x,
        render.crop.y,
        render.crop.w,
        render.crop.h,
        sx,
        sy,
        sw,
        sh
      );
      ctx.restore();
    }
  }

  if (previewCamera && drawCanvasCameraOverlay) {
    const cx = fit.worldToCanvasX(previewCamera.x);
    const cy = fit.worldToCanvasY(previewCamera.y);
    const cw = previewCamera.width * fit.scale;
    const ch = previewCamera.height * fit.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.06)';
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.setLineDash([]);
    const label = '시작 카메라(참조)';
    ctx.font = '700 12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const tw = ctx.measureText(label).width;
    const tagW = tw + 14;
    const tagH = 22;
    const tagX = Math.max(4, Math.min((canvas.width || 960) - tagW - 4, cx + 4));
    const tagY = Math.max(4, cy - tagH - 4);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.92)';
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, tagX + 7, tagY + 15);
    ctx.restore();
  }

  if (!useCameraProjection) {
    // Draw a lightweight world bounds frame for debugging/consistency checks.
    ctx.save();
    ctx.strokeStyle = 'rgba(27, 45, 77, 0.28)';
    ctx.lineWidth = 2;
    const frameX = fit.worldToCanvasX(worldRect.x);
    const frameY = fit.worldToCanvasY(worldRect.y);
    const frameW = worldRect.w * fit.scale;
    const frameH = worldRect.h * fit.scale;
    ctx.strokeRect(frameX + 1, frameY + 1, Math.max(0, frameW - 2), Math.max(0, frameH - 2));
    ctx.restore();
  }

  if (!skipMetaUpdate) {
  updateNativePreviewMetaText({
    metaEl,
    worldRect,
    renderedObjects,
    visibleObjectsInCamera,
    playerSpawn,
    cameraRect: previewCamera,
    bridgeDebugStats: getJumpmapRuntimePhysicsDebugStats()
  });
  }
  if (!suppressLogs) {
    appendStatusLog('native', `프리뷰 캔버스 렌더 완료 (${renderedObjects}개 오브젝트)`);
  }
  return {
    ok: true,
    renderedObjects,
    visibleObjectsInCamera,
    dimmedObjectsOutsideCamera,
    viewRect: worldRect,
    previewCamera
  };
};

export const bootstrapNativeJumpmapRuntime = async (deps = {}) => {
  const {
    setup = null,
    playMode = false,
    runtimeMap = null,
    runtimeMapSummary = null,
    appendStatusLog = () => {},
    setStatus = () => {},
    stagePanel = null,
    previewCanvas = null,
    stageMetaEl = null,
    previewOverlay = null,
    previewCameraFrameEl = null,
    previewPlayerEl = null,
    previewPlayerHitboxEl = null,
    previewPlayerSpriteEl = null,
    controls = null,
    baseHref = window.location.href
  } = deps;

  const core = createJumpmapRuntimeCore({
    state: {
      setup,
      runtimeMapSummary
    },
    assets: {
      runtimeMap
    }
  });

  appendStatusLog('native', '독립 점프맵 런타임 플레이스홀더 초기화를 시작합니다.');

  if (!runtimeMap || typeof runtimeMap !== 'object') {
    setStatus('독립 점프맵 런타임 준비 실패 (운영 맵 없음)');
    appendStatusLog('native', '운영 맵이 없어 독립 런타임 플레이스홀더를 준비할 수 없습니다.');
    return {
      ok: false,
      mode: 'native',
      reason: 'runtime-map-missing',
      core
    };
  }

  const objectCount = Number(runtimeMapSummary?.objectCount) || 0;
  const mapWidth = Number(runtimeMapSummary?.width) || 0;
  const mapHeight = Number(runtimeMapSummary?.height) || 0;
  const playerSpawn = computeJumpmapPlayerSpawnFromMap(runtimeMap, setup, runtimeMapSummary);
  appendStatusLog(
    'native',
    `운영 맵 기본 정보 확인 완료 (${mapWidth}x${mapHeight}, 오브젝트 ${objectCount}개)`
  );
  appendStatusLog(
    'native',
    `플레이어 스폰 계산 완료 (${Math.round(playerSpawn.hitboxRect.x)}, ${Math.round(playerSpawn.hitboxRect.y)}) / 기준점 ${playerSpawn.basePoint.source}`
  );

  if (stagePanel) stagePanel.classList.add('show');
  if (stageMetaEl) stageMetaEl.textContent = '프리뷰 렌더 준비 중...';
  const physicsDepsReady = Boolean(getJumpmapRuntimePhysicsDeps());
  if (previewPlayerSpriteEl) {
    previewPlayerSpriteEl.src = new URL('../quiz_sejong/sejong_rightside.png', baseHref).toString();
  }
  const previewResult = await drawNativePreview({
    runtimeMap,
    runtimeMapSummary,
    setup,
    canvas: previewCanvas,
    metaEl: stageMetaEl,
    renderStaticPlayer: !physicsDepsReady,
    appendStatusLog,
    baseHref,
    projectionMode: playMode ? 'camera-fit' : 'world-fit'
  });

  if (!previewResult?.ok) {
    appendStatusLog('native', `프리뷰 렌더를 건너뜁니다 (${previewResult?.reason || 'unknown'})`);
  } else if (previewResult.previewCamera) {
    const camera = previewResult.previewCamera;
    appendStatusLog(
      'native',
      `시작 카메라 참조 프레임 계산 완료 (${Math.round(camera.width)}x${Math.round(camera.height)} @ ${Math.round(camera.x)},${Math.round(camera.y)})`
    );
    appendStatusLog(
      'native',
      `카메라 기준 오브젝트 가시성 확인 (${previewResult.visibleObjectsInCamera ?? 0}개 가시 / ${previewResult.dimmedObjectsOutsideCamera ?? 0}개 외부)`
    );
  }

  setStatus('독립 점프맵 런타임 플레이스홀더 준비 완료');
  let physicsLoopResult = null;
  if (physicsDepsReady) {
    physicsLoopResult = attachNativePreviewPhysicsLoop({
      runtimeMap,
      runtimeMapSummary,
      setup,
      playMode,
      previewCanvas,
      previewOverlay,
      previewCameraFrameEl,
      previewPlayerEl,
      previewPlayerHitboxEl,
      previewPlayerSpriteEl,
      controls,
      stageMetaEl,
      appendStatusLog
    });
  } else {
    appendStatusLog('native', '물리 유틸이 준비되지 않아 정적 프리뷰 모드로 유지합니다.');
  }
  appendStatusLog(
    'native',
    physicsLoopResult?.ok
      ? (playMode
        ? '독립 런타임 플레이 루프를 연결했습니다. (퀴즈/멀티/HUD는 다음 단계에서 순차 연결)'
        : '현재는 최소 물리 루프(1인 프리뷰)만 연결되었습니다. 전체 렌더/카메라/퀴즈 루프는 아직 미연결입니다.')
      : '아직 실제 렌더/물리 루프는 연결되지 않았습니다. 현재는 배경/오브젝트 프리뷰만 표시합니다.'
  );

  return {
    ok: true,
    mode: 'native',
    ready: playMode ? 'play-loop' : 'placeholder',
    core,
    playerSpawn,
    preview: previewResult,
    capabilities: {
      runtimeMapLoaded: true,
      rendererAttached: Boolean(previewResult?.ok),
      physicsLoopAttached: Boolean(physicsLoopResult?.ok)
    }
  };
};
