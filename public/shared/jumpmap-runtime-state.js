import { buildJumpmapPreviewInitState } from './jumpmap-runtime-init.js';
import {
  computeJumpmapPreviewWorldRect,
  getJumpmapBackgroundSource,
  getJumpmapObjectDisplayBounds,
  getJumpmapSpriteSource,
  normalizeJumpmapPreviewBackground
} from './jumpmap-runtime-preview.js';

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const getPreviewBoundsFromHitboxes = (obj) => {
  const hitboxes = Array.isArray(obj?.hitboxes) ? obj.hitboxes : [];
  if (!hitboxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  hitboxes.forEach((hb) => {
    if (!hb || typeof hb !== 'object') return;
    const ox = Number(hb.x) || 0;
    const oy = Number(hb.y) || 0;
    if (hb.type === 'polygon' && Array.isArray(hb.points) && hb.points.length >= 3) {
      hb.points.forEach((pt) => {
        if (!pt || typeof pt !== 'object') return;
        const x = ox + (Number(pt.x) || 0);
        const y = oy + (Number(pt.y) || 0);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      return;
    }
    const w = Math.max(0, Number(hb.w) || 0);
    const h = Math.max(0, Number(hb.h) || 0);
    minX = Math.min(minX, ox);
    minY = Math.min(minY, oy);
    maxX = Math.max(maxX, ox + w);
    maxY = Math.max(maxY, oy + h);
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return null;
  return { x: minX, y: minY, w: width, h: height };
};

export const normalizeJumpmapRuntimeObjectForPreview = (obj, baseHref = window.location.href) => {
  if (!obj || typeof obj !== 'object') return null;
  const crop = obj.crop && typeof obj.crop === 'object' ? obj.crop : null;
  const rawCropW = Number(crop?.w) || 0;
  const rawCropH = Number(crop?.h) || 0;
  const hasCrop = rawCropW > 0 && rawCropH > 0;
  const cropW = hasCrop ? rawCropW : 0;
  const cropH = hasCrop ? rawCropH : 0;
  const cropX = hasCrop ? clampNumber(crop?.x, 0, Number.MAX_SAFE_INTEGER, 0) : 0;
  const cropY = hasCrop ? clampNumber(crop?.y, 0, Number.MAX_SAFE_INTEGER, 0) : 0;
  const x = Number(obj.x) || 0;
  const y = Number(obj.y) || 0;
  const scale = Number(obj.scale) || 1;
  const rotationDeg = Number(obj.rotation) || 0;
  const flipH = !!obj.flipH;
  const flipV = !!obj.flipV;
  const boundsFromHitboxes = getPreviewBoundsFromHitboxes(obj);
  const fallbackW = Math.max(1, Number(boundsFromHitboxes?.w) || 320);
  const fallbackH = Math.max(1, Number(boundsFromHitboxes?.h) || 120);
  const displayBounds = getJumpmapObjectDisplayBounds({
    x,
    y,
    scale,
    crop: hasCrop
      ? { x: cropX, y: cropY, w: cropW, h: cropH }
      : { x: 0, y: 0, w: fallbackW, h: fallbackH }
  });
  if (!displayBounds) return null;
  return {
    raw: obj,
    sprite: typeof obj.sprite === 'string' ? obj.sprite : '',
    spriteSrc: getJumpmapSpriteSource(obj.sprite, baseHref),
    crop: hasCrop ? { x: cropX, y: cropY, w: cropW, h: cropH } : null,
    hasCrop,
    x,
    y,
    scale,
    rotationDeg,
    flipH,
    flipV,
    drawW: displayBounds.w,
    drawH: displayBounds.h,
    worldRect: { x: displayBounds.x, y: displayBounds.y, w: displayBounds.w, h: displayBounds.h }
  };
};

export const buildJumpmapRuntimeInitialState = ({
  runtimeMap,
  runtimeMapSummary,
  setup = null,
  canvasWidth = 960,
  canvasHeight = 540,
  baseHref = window.location.href
} = {}) => {
  if (!runtimeMap || typeof runtimeMap !== 'object') return null;
  const previewInit = buildJumpmapPreviewInitState({
    runtimeMap,
    runtimeMapSummary,
    setup,
    canvasWidth,
    canvasHeight
  });
  const worldRect = computeJumpmapPreviewWorldRect(runtimeMap, runtimeMapSummary);
  const background = normalizeJumpmapPreviewBackground(runtimeMap);
  const normalizedObjects = (Array.isArray(runtimeMap.objects) ? runtimeMap.objects : [])
    .map((obj) => normalizeJumpmapRuntimeObjectForPreview(obj, baseHref))
    .filter(Boolean);
  return {
    mapRect: previewInit.mapRect,
    worldRect,
    background: {
      ...background,
      imageSrc: getJumpmapBackgroundSource(background.image, baseHref)
    },
    objects: normalizedObjects,
    playerSpawn: previewInit.playerSpawn,
    previewViewRect: previewInit.previewViewRect,
    previewCamera: previewInit.previewCamera
  };
};
