export const getJumpmapSpriteSource = (spriteName, baseHref = window.location.href) => {
  if (typeof spriteName !== 'string' || !spriteName.trim()) return '';
  const trimmed = spriteName.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('../') || trimmed.startsWith('./') || trimmed.startsWith('/')) {
    return new URL(trimmed, baseHref).toString();
  }
  return new URL(`../quiz_plate/${trimmed}`, baseHref).toString();
};

export const getJumpmapBackgroundSource = (imagePath, baseHref = window.location.href) => {
  if (typeof imagePath !== 'string' || !imagePath.trim()) return '';
  const trimmed = imagePath.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) return trimmed;
  return new URL(trimmed, baseHref).toString();
};

export const getJumpmapObjectDisplayBounds = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  const crop = obj.crop && typeof obj.crop === 'object' ? obj.crop : null;
  const baseW = Number(crop?.w) || 0;
  const baseH = Number(crop?.h) || 0;
  if (baseW <= 0 || baseH <= 0) return null;
  const scale = Number(obj.scale) || 1;
  const w = Math.max(1, baseW * scale);
  const h = Math.max(1, baseH * scale);
  const x = Number(obj.x) || 0;
  const y = Number(obj.y) || 0;
  return { x, y, w, h };
};

export const jumpmapRectsIntersect = (a, b) => {
  if (!a || !b) return false;
  const ax = Number(a.x);
  const ay = Number(a.y);
  const aw = Number(a.w ?? a.width);
  const ah = Number(a.h ?? a.height);
  const bx = Number(b.x);
  const by = Number(b.y);
  const bw = Number(b.w ?? b.width);
  const bh = Number(b.h ?? b.height);
  if (![ax, ay, aw, ah, bx, by, bw, bh].every(Number.isFinite)) return false;
  return (
    ax < bx + bw &&
    ax + aw > bx &&
    ay < by + bh &&
    ay + ah > by
  );
};

export const computeJumpmapPreviewWorldRect = (runtimeMap, runtimeMapSummary) => {
  const objects = Array.isArray(runtimeMap?.objects) ? runtimeMap.objects : [];
  const bounds = [];
  objects.forEach((obj) => {
    const b = getJumpmapObjectDisplayBounds(obj);
    if (b) bounds.push(b);
  });
  if (!bounds.length) {
    const mapW = Math.max(1, Number(runtimeMapSummary?.width) || 2400);
    const mapH = Math.max(1, Number(runtimeMapSummary?.height) || 12000);
    return { x: 0, y: 0, w: mapW, h: mapH };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  bounds.forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  const padX = 120;
  const padY = 160;
  return {
    x: minX - padX,
    y: minY - padY,
    w: Math.max(1, (maxX - minX) + padX * 2),
    h: Math.max(1, (maxY - minY) + padY * 2)
  };
};

export const fitJumpmapWorldToCanvas = (canvas, worldRect) => {
  const cw = canvas?.width || 960;
  const ch = canvas?.height || 540;
  const sx = cw / Math.max(1, worldRect?.w || 1);
  const sy = ch / Math.max(1, worldRect?.h || 1);
  const scale = Math.min(sx, sy);
  const offsetX = (cw - (worldRect?.w || 1) * scale) * 0.5;
  const offsetY = (ch - (worldRect?.h || 1) * scale) * 0.5;
  return {
    scale,
    worldToCanvasX: (x) => offsetX + (x - (worldRect?.x || 0)) * scale,
    worldToCanvasY: (y) => offsetY + (y - (worldRect?.y || 0)) * scale
  };
};

export const normalizeJumpmapPreviewBackground = (runtimeMap) => {
  const bg = runtimeMap?.background && typeof runtimeMap.background === 'object' ? runtimeMap.background : {};
  const imageOpacity = Number.isFinite(Number(bg.imageOpacity))
    ? Math.max(0, Math.min(1, Number(bg.imageOpacity)))
    : 1;
  const color = (typeof bg.color === 'string' && bg.color.trim()) ? bg.color.trim() : '#ffffff';
  return {
    color,
    image: typeof bg.image === 'string' ? bg.image : '',
    imageOpacity
  };
};
