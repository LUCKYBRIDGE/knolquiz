import {
  computeJumpmapCameraRect,
  estimateJumpmapViewRectForPreview
} from './jumpmap-runtime-core.js';

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export const getJumpmapPlayerMetricsFromRuntimeMap = (runtimeMap) => {
  const hit = runtimeMap?.playerHitbox && typeof runtimeMap.playerHitbox === 'object'
    ? runtimeMap.playerHitbox
    : { width: 25, height: 192, footInset: 8 };
  const scale = Math.max(0.2, Number(runtimeMap?.playerScale) || 1);
  return {
    scale,
    width: Math.max(10, (Number(hit.width) || 25) * scale),
    height: Math.max(10, (Number(hit.height) || 192) * scale),
    footInset: Math.max(0, (Number(hit.footInset) || 8) * scale)
  };
};

export const getJumpmapPlayerHitboxOffsetFromRuntimeMap = (runtimeMap) => ({
  x: Number(runtimeMap?.playerHitboxOffset?.x) || 0,
  y: Number(runtimeMap?.playerHitboxOffset?.y) || 0
});

export const getJumpmapPlayerBasePointFromRuntimeMap = (runtimeMap, setup) => {
  const selectedId = typeof setup?.jumpmapStartPointId === 'string' ? setup.jumpmapStartPointId.trim() : '';
  const startPoints = Array.isArray(runtimeMap?.startPoints) ? runtimeMap.startPoints : [];
  const savePoints = Array.isArray(runtimeMap?.savePoints) ? runtimeMap.savePoints : [];
  if (selectedId) {
    const found = startPoints.find((p) => p && String(p.id || '') === selectedId)
      || savePoints.find((p) => p && String(p.id || '') === selectedId);
    if (found && Number.isFinite(Number(found.x)) && Number.isFinite(Number(found.y))) {
      return { x: Number(found.x), y: Number(found.y), source: 'selected' };
    }
  }
  const base = runtimeMap?.startPoint;
  if (base && Number.isFinite(Number(base.x)) && Number.isFinite(Number(base.y))) {
    return { x: Number(base.x), y: Number(base.y), source: 'startPoint' };
  }
  return { x: 120, y: 120, source: 'fallback' };
};

export const getJumpmapMapRectFromRuntimeMap = (runtimeMap, runtimeMapSummary) => ({
  width: Math.max(
    1,
    Number(runtimeMapSummary?.width)
    || Number(runtimeMap?.mapSize?.width)
    || Number(runtimeMap?.mapSize?.w)
    || 1
  ),
  height: Math.max(
    1,
    Number(runtimeMapSummary?.height)
    || Number(runtimeMap?.mapSize?.height)
    || Number(runtimeMap?.mapSize?.h)
    || 1
  )
});

export const computeJumpmapPlayerSpawnFromMap = (runtimeMap, setup, runtimeMapSummary) => {
  const metrics = getJumpmapPlayerMetricsFromRuntimeMap(runtimeMap);
  const offset = getJumpmapPlayerHitboxOffsetFromRuntimeMap(runtimeMap);
  const base = getJumpmapPlayerBasePointFromRuntimeMap(runtimeMap, setup);
  const mapRect = getJumpmapMapRectFromRuntimeMap(runtimeMap, runtimeMapSummary);
  const x = clampNumber(base.x - metrics.width / 2 + offset.x, 0, Math.max(0, mapRect.width - metrics.width), 0);
  const y = clampNumber(base.y - metrics.height + offset.y, 0, Math.max(0, mapRect.height - metrics.height), 0);
  return {
    basePoint: { x: base.x, y: base.y, source: base.source },
    hitboxRect: { x, y, w: metrics.width, h: metrics.height },
    metrics,
    offset
  };
};

export const getJumpmapPlayerCropForRuntimeMap = (runtimeMap, spriteMeta) => {
  const meta = spriteMeta || { w: 80, h: 120 };
  const crop = runtimeMap?.playerCrop;
  if (!crop || typeof crop !== 'object') return { x: 0, y: 0, w: meta.w, h: meta.h };
  return {
    x: clampNumber(crop.x, 0, Math.max(0, meta.w), 0),
    y: clampNumber(crop.y, 0, Math.max(0, meta.h), 0),
    w: clampNumber(crop.w, 1, Math.max(1, meta.w), meta.w),
    h: clampNumber(crop.h, 1, Math.max(1, meta.h), meta.h)
  };
};

export const getJumpmapPlayerSpriteRenderFromRuntimeMap = (runtimeMap, spriteMeta) => {
  const meta = spriteMeta || { w: 80, h: 120 };
  const crop = getJumpmapPlayerCropForRuntimeMap(runtimeMap, meta);
  const metrics = getJumpmapPlayerMetricsFromRuntimeMap(runtimeMap);
  const scale = metrics.scale;
  const spriteW = crop.w * scale;
  const spriteH = crop.h * scale;
  const offsetX = metrics.width / 2 - (meta.w * scale) / 2 + crop.x * scale;
  const offsetY = metrics.height - meta.h * scale + crop.y * scale;
  return { meta, crop, scale, spriteW, spriteH, offsetX, offsetY };
};

export const buildJumpmapPreviewInitState = ({
  runtimeMap,
  runtimeMapSummary,
  setup,
  canvasWidth = 960,
  canvasHeight = 540
} = {}) => {
  const mapRect = getJumpmapMapRectFromRuntimeMap(runtimeMap, runtimeMapSummary);
  const playerSpawn = computeJumpmapPlayerSpawnFromMap(runtimeMap, setup, runtimeMapSummary);
  const previewViewRect = estimateJumpmapViewRectForPreview({
    playerCount: Number(setup?.players) || 1,
    canvasWidth,
    canvasHeight
  });
  const previewCamera = computeJumpmapCameraRect({
    playerRect: playerSpawn?.hitboxRect || null,
    mapRect,
    viewRect: previewViewRect,
    yBias: Number(runtimeMap?.camera?.yBias)
  });
  return {
    mapRect,
    playerSpawn,
    previewViewRect,
    previewCamera
  };
};
