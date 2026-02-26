import { JumpmapRuntimeGeometry } from './jumpmap-runtime-geometry.js';
import {
  JumpmapRuntimePhysics,
  getJumpmapResolveBridgeDebugStats,
  getJumpmapRuntimePhysicsBridgeStatus,
  isJumpmapRuntimePhysicsBridgeReady,
  resetJumpmapResolveBridgeDebugStats
} from './jumpmap-runtime-physics.js';

const hasFn = (obj, key) => !!obj && typeof obj[key] === 'function';

const validateGeometryUtils = (geometry) => {
  if (!geometry) return false;
  return hasFn(geometry, 'worldPointToLocal') && hasFn(geometry, 'localPointToWorld');
};

const validatePhysicsUtils = (physics) => {
  if (!physics) return false;
  return (
    hasFn(physics, 'createPlayerState') &&
    hasFn(physics, 'collectObstacleBounds') &&
    hasFn(physics, 'stepPlayerState')
  );
};

// Thin adapter for the in-progress runtime split:
// - Today it reads legacy editor globals.
// - Later it can resolve shared/runtime-native implementations with the same shape.
export const getJumpmapRuntimePhysicsDeps = () => {
  const legacyPhysics = window.JumpmapTestPhysicsUtils || null;
  const physics = (isJumpmapRuntimePhysicsBridgeReady() && validatePhysicsUtils(JumpmapRuntimePhysics))
    ? JumpmapRuntimePhysics
    : legacyPhysics;
  const legacyGeometry = window.JumpmapGeometryUtils || null;
  const geometry = validateGeometryUtils(JumpmapRuntimeGeometry)
    ? JumpmapRuntimeGeometry
    : legacyGeometry;
  if (!validatePhysicsUtils(physics) || !validateGeometryUtils(geometry)) return null;
  return { physics, geometry };
};

export const getJumpmapRuntimePhysicsDepStatus = () => {
  const legacyPhysics = window.JumpmapTestPhysicsUtils || null;
  const sharedPhysics = JumpmapRuntimePhysics;
  const sharedPhysicsBridge = getJumpmapRuntimePhysicsBridgeStatus();
  const sharedPhysicsReady = isJumpmapRuntimePhysicsBridgeReady();
  const physics = validatePhysicsUtils(sharedPhysics)
    && sharedPhysicsReady
    ? sharedPhysics
    : legacyPhysics;
  const legacyGeometry = window.JumpmapGeometryUtils || null;
  const sharedGeometry = JumpmapRuntimeGeometry;
  const geometry = validateGeometryUtils(sharedGeometry)
    ? sharedGeometry
    : legacyGeometry;
  return {
    physicsPresent: !!physics,
    sharedPhysicsPresent: !!sharedPhysics,
    legacyPhysicsPresent: !!legacyPhysics,
    sharedPhysicsBridgeReady: sharedPhysicsReady,
    geometryPresent: !!geometry,
    sharedGeometryPresent: !!sharedGeometry,
    legacyGeometryPresent: !!legacyGeometry,
    physicsValid: validatePhysicsUtils(physics),
    sharedPhysicsValid: validatePhysicsUtils(sharedPhysics),
    legacyPhysicsValid: validatePhysicsUtils(legacyPhysics),
    sharedPhysicsBridge,
    geometryValid: validateGeometryUtils(geometry),
    sharedGeometryValid: validateGeometryUtils(sharedGeometry),
    legacyGeometryValid: validateGeometryUtils(legacyGeometry),
    physicsSource: (validatePhysicsUtils(sharedPhysics) && sharedPhysicsReady) ? 'shared' : (validatePhysicsUtils(legacyPhysics) ? 'legacy' : 'none'),
    geometrySource: validateGeometryUtils(sharedGeometry) ? 'shared' : (validateGeometryUtils(legacyGeometry) ? 'legacy' : 'none'),
    ready: validatePhysicsUtils(physics) && validateGeometryUtils(geometry)
  };
};

export const getJumpmapRuntimePhysicsDebugStats = () => {
  try {
    return getJumpmapResolveBridgeDebugStats();
  } catch (error) {
    return {
      error: String(error?.message || error || 'unknown-error'),
      horizontal: {
        compareCalls: 0, mismatches: 0, errors: 0,
        applyRequests: 0, applyAccepted: 0, applyBlocked: 0,
        lastMismatch: null, lastError: null
      },
      vertical: {
        compareCalls: 0, mismatches: 0, errors: 0,
        applyRequests: 0, applyAccepted: 0, applyBlocked: 0,
        lastMismatch: null, lastError: null
      },
      recentEvents: []
    };
  }
};

export const resetJumpmapRuntimePhysicsDebugStats = () => {
  try {
    return !!resetJumpmapResolveBridgeDebugStats();
  } catch (error) {
    console.warn('[JumpmapRuntimePhysicsAdapter] failed to reset debug stats', error);
    return false;
  }
};
