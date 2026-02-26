const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getObjectTransform = (obj) => {
  const scale = toNumber(obj?.scale, 1);
  const rotation = toNumber(obj?.rotation, 0);
  return {
    x: toNumber(obj?.x, 0),
    y: toNumber(obj?.y, 0),
    scale,
    rotation,
    flipH: !!obj?.flipH,
    flipV: !!obj?.flipV
  };
};

export const jumpmapWorldToLocal = (dx, dy, obj) => {
  const t = getObjectTransform(obj);
  const scaleX = t.flipH ? -t.scale : t.scale;
  const scaleY = t.flipV ? -t.scale : t.scale;
  const angle = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return {
    x: rx / scaleX,
    y: ry / scaleY
  };
};

export const jumpmapWorldPointToLocal = (x, y, obj) => {
  const t = getObjectTransform(obj);
  return jumpmapWorldToLocal(x - t.x, y - t.y, t);
};

export const jumpmapLocalPointToWorld = (x, y, obj) => {
  const t = getObjectTransform(obj);
  const scaleX = t.flipH ? -t.scale : t.scale;
  const scaleY = t.flipV ? -t.scale : t.scale;
  const sx = x * scaleX;
  const sy = y * scaleY;
  const angle = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;
  return {
    x: t.x + rx,
    y: t.y + ry
  };
};

export const JumpmapRuntimeGeometry = {
  worldToLocal: jumpmapWorldToLocal,
  worldPointToLocal: jumpmapWorldPointToLocal,
  localPointToWorld: jumpmapLocalPointToWorld
};

