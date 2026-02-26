// Shared jumpmap runtime core placeholder.
// This is a minimal boundary to separate runtime logic from host UI.
export const createJumpmapRuntimeCore = (deps) => {
  const {
    physicsUtils = window.JumpmapTestPhysicsUtils || null,
    hooks = {},
    geometry = {},
    state = {},
    assets = {}
  } = deps || {};

  return {
    physicsUtils,
    hooks,
    geometry,
    state,
    assets
  };
};

export const summarizeJumpmapRuntimeMap = (map) => {
  if (!map || typeof map !== 'object') return null;
  const objects = Array.isArray(map.objects) ? map.objects : [];
  let rectHitboxes = 0;
  let polygonHitboxes = 0;
  objects.forEach((obj) => {
    const list = Array.isArray(obj?.hitboxes) ? obj.hitboxes : [];
    list.forEach((hb) => {
      if (hb && hb.type === 'polygon' && Array.isArray(hb.points) && hb.points.length >= 3) {
        polygonHitboxes += 1;
      } else {
        rectHitboxes += 1;
      }
    });
  });
  const mapSize = map.mapSize && typeof map.mapSize === 'object' ? map.mapSize : {};
  const bg = map.background && typeof map.background === 'object' ? map.background : {};
  const hasBackgroundImage = typeof bg.image === 'string' && bg.image.trim().length > 0;
  const playerPolyPoints = Array.isArray(map.playerHitboxPolygon?.points)
    ? map.playerHitboxPolygon.points.length
    : 0;
  return {
    version: map.version ?? null,
    schema: typeof map.schema === 'string' ? map.schema : '',
    width: Number(mapSize.width) || Number(mapSize.w) || 0,
    height: Number(mapSize.height) || Number(mapSize.h) || 0,
    objectCount: objects.length,
    rectHitboxes,
    polygonHitboxes,
    startPointCount: Array.isArray(map.startPoints) ? map.startPoints.length : 0,
    savePointCount: Array.isArray(map.savePoints) ? map.savePoints.length : 0,
    hasBackgroundImage,
    backgroundTexture: typeof bg.texture === 'string' ? bg.texture : '',
    playerHitboxPolygonPointCount: playerPolyPoints
  };
};

export const estimateJumpmapViewRectForPreview = ({
  playerCount = 1,
  canvasWidth = 960,
  canvasHeight = 540
} = {}) => {
  const count = Math.max(1, Math.min(6, Math.floor(Number(playerCount) || 1)));
  const viewWidthPx = Math.max(1, Number(canvasWidth) / count);
  const viewHeightPx = Math.max(1, Number(canvasHeight) || 1);
  const rawScale = viewWidthPx / 900;
  const viewScale = Math.max(0.28, Math.min(1, rawScale));
  return {
    width: viewWidthPx / viewScale,
    height: viewHeightPx / viewScale,
    pixelWidth: viewWidthPx,
    pixelHeight: viewHeightPx,
    viewScale
  };
};

export const computeJumpmapCameraRect = ({
  playerRect = null,
  mapRect = null,
  viewRect = null,
  yBias = 0.46
} = {}) => {
  const mapWidth = Math.max(1, Number(mapRect?.width) || 1);
  const mapHeight = Math.max(1, Number(mapRect?.height) || 1);
  const viewWidth = Math.max(1, Number(viewRect?.width) || 1);
  const viewHeight = Math.max(1, Number(viewRect?.height) || 1);
  const playerX = Number(playerRect?.x) || 0;
  const playerY = Number(playerRect?.y) || 0;
  const safeYBias = Number.isFinite(Number(yBias)) ? Number(yBias) : 0.46;

  const targetX = playerX - viewWidth / 2;
  const targetY = playerY - viewHeight * (1 - safeYBias);
  const x = Math.max(0, Math.min(mapWidth - viewWidth, targetX));
  const y = Math.max(0, Math.min(mapHeight - viewHeight, targetY));
  return { x, y, width: viewWidth, height: viewHeight, yBias: safeYBias };
};
