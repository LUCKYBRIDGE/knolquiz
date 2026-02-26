const getLegacyPhysicsUtils = () => window.JumpmapTestPhysicsUtils || null;
const hasLegacyFn = (legacy, fnName) => !!legacy && typeof legacy[fnName] === 'function';
const EPS = 1e-6;
const OBSTACLE_CELL_SIZE = 96;
const DEFAULT_GROUND_SAMPLE_SPACING = 6;
const DEFAULT_WALKABLE_SLOPE_MAX_ANGLE = 75;
const DEFAULT_SLOPE_FALL_START_ANGLE = 75;
const HORIZONTAL_CONTACT_SKIN = 0.75;
const HORIZONTAL_COLLISION_TRIM = 2;
const MIN_GROUND_SUPPORT_SAMPLES = 2;
const MIN_GROUND_SUPPORT_SPAN_RATIO = 0.22;
const GROUND_SUPPORT_Y_TOLERANCE = 1.5;
const COYOTE_TIME_SEC = 0.12;
const RESOLVE_BRIDGE_DEBUG_LOG_HISTORY_LIMIT = 8;

const createResolveBridgeDebugBucket = () => ({
  compareCalls: 0,
  mismatches: 0,
  errors: 0,
  applyRequests: 0,
  applyAccepted: 0,
  applyBlocked: 0,
  lastMismatch: null,
  lastError: null
});

const resolveBridgeDebugStats = {
  horizontal: createResolveBridgeDebugBucket(),
  vertical: createResolveBridgeDebugBucket(),
  recentEvents: []
};

const callLegacy = (fnName, args) => {
  const legacy = getLegacyPhysicsUtils();
  const fn = legacy && typeof legacy[fnName] === 'function' ? legacy[fnName] : null;
  if (!fn) {
    throw new Error(`[JumpmapRuntimePhysics] missing legacy function: ${fnName}`);
  }
  return fn(...args);
};

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, base));
};

const pushResolveBridgeDebugEvent = (event) => {
  resolveBridgeDebugStats.recentEvents.push({
    ts: Date.now(),
    ...event
  });
  if (resolveBridgeDebugStats.recentEvents.length > RESOLVE_BRIDGE_DEBUG_LOG_HISTORY_LIMIT) {
    resolveBridgeDebugStats.recentEvents.splice(
      0,
      resolveBridgeDebugStats.recentEvents.length - RESOLVE_BRIDGE_DEBUG_LOG_HISTORY_LIMIT
    );
  }
};

const recordResolveBridgeCompareStat = ({ axis, match, error, detail } = {}) => {
  const key = axis === 'vertical' ? 'vertical' : 'horizontal';
  const bucket = resolveBridgeDebugStats[key];
  bucket.compareCalls += 1;
  if (error) {
    bucket.errors += 1;
    bucket.lastError = {
      message: String(error?.message || error || 'unknown-error'),
      detail: detail || null,
      ts: Date.now()
    };
    pushResolveBridgeDebugEvent({ axis: key, type: 'compare-error', message: bucket.lastError.message });
    return;
  }
  if (match === false) {
    bucket.mismatches += 1;
    bucket.lastMismatch = {
      detail: detail || null,
      ts: Date.now()
    };
    pushResolveBridgeDebugEvent({ axis: key, type: 'compare-mismatch' });
  }
};

const recordResolveBridgeApplyGateStat = ({ axis, accepted, reason } = {}) => {
  const key = axis === 'vertical' ? 'vertical' : 'horizontal';
  const bucket = resolveBridgeDebugStats[key];
  bucket.applyRequests += 1;
  if (accepted) {
    bucket.applyAccepted += 1;
    pushResolveBridgeDebugEvent({
      axis: key,
      type: reason ? `apply-accepted-${reason}` : 'apply-accepted'
    });
    return;
  }
  bucket.applyBlocked += 1;
  pushResolveBridgeDebugEvent({
    axis: key,
    type: reason ? `apply-blocked-${reason}` : 'apply-blocked'
  });
};

export const getJumpmapResolveBridgeDebugStats = () => ({
  horizontal: {
    ...resolveBridgeDebugStats.horizontal,
    lastMismatch: resolveBridgeDebugStats.horizontal.lastMismatch
      ? { ...resolveBridgeDebugStats.horizontal.lastMismatch }
      : null,
    lastError: resolveBridgeDebugStats.horizontal.lastError
      ? { ...resolveBridgeDebugStats.horizontal.lastError }
      : null
  },
  vertical: {
    ...resolveBridgeDebugStats.vertical,
    lastMismatch: resolveBridgeDebugStats.vertical.lastMismatch
      ? { ...resolveBridgeDebugStats.vertical.lastMismatch }
      : null,
    lastError: resolveBridgeDebugStats.vertical.lastError
      ? { ...resolveBridgeDebugStats.vertical.lastError }
      : null
  },
  recentEvents: resolveBridgeDebugStats.recentEvents.map((entry) => ({ ...entry }))
});

export const resetJumpmapResolveBridgeDebugStats = () => {
  resolveBridgeDebugStats.horizontal = createResolveBridgeDebugBucket();
  resolveBridgeDebugStats.vertical = createResolveBridgeDebugBucket();
  resolveBridgeDebugStats.recentEvents = [];
  return true;
};

// Shared runtime physics bridge (stage 1)
// - Provides a stable import surface for jumpmap-runtime.
// - Starts replacing legacy functions one by one while preserving the same API.
// - Future steps can replace individual functions with native/shared implementations.
// Copied state shape from legacy test-physics-utils createPlayerState().
// Keep this 1:1 so mixed shared/legacy execution remains compatible during the split.
export const jumpmapCreatePlayerState = () => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  facing: 1,
  onGround: false,
  jumpsUsed: 0,
  jumpedFromGround: false,
  jumping: false,
  jumpTargetY: 0,
  coyoteTimer: 0,
  walkTimer: 0,
  input: { left: false, right: false, jumpQueued: false, jumpHeld: false, jumpLock: false }
});

export const normalizeJumpmapGroundSampleSpacing = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_GROUND_SAMPLE_SPACING;
  return Math.max(2, Math.min(32, Math.round(n)));
};

export const normalizeJumpmapWalkableSlopeMaxAngle = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WALKABLE_SLOPE_MAX_ANGLE;
  return Math.max(0, Math.min(90, n));
};

export const normalizeJumpmapSlopeFallStartAngle = (value, walkableSlopeMaxAngle) => {
  const n = Number(value);
  const base = Number.isFinite(n)
    ? clampNumber(n, 0, 90, DEFAULT_SLOPE_FALL_START_ANGLE)
    : DEFAULT_SLOPE_FALL_START_ANGLE;
  return Math.max(Number(walkableSlopeMaxAngle) || 0, base);
};

export const resolveJumpmapStepInputState = (playerState) => {
  const left = !!playerState?.input?.left;
  const right = !!playerState?.input?.right;
  const inputDir = (right ? 1 : 0) - (left ? 1 : 0);
  const hasInput = Math.abs(inputDir) > EPS;
  let facing = Number(playerState?.facing);
  if (inputDir < -0.001) facing = -1;
  else if (inputDir > 0.001) facing = 1;
  else if (!Number.isFinite(facing) || facing === 0) facing = 1;
  return { inputDir, hasInput, facing };
};

// Phase stepPlayerState-1:
// Shared extraction of deterministic pre-step config values used near the top of legacy stepPlayerState().
export const buildJumpmapStepBaseConfig = ({ physics, metrics } = {}) => {
  const walkableSlopeMaxAngle = normalizeJumpmapWalkableSlopeMaxAngle(physics?.walkableSlopeMaxAngle);
  const slopeFallStartAngle = normalizeJumpmapSlopeFallStartAngle(
    physics?.slopeFallStartAngle,
    walkableSlopeMaxAngle
  );
  const supportMaxGroundAngle = slopeFallStartAngle;
  const groundSampleSpacing = normalizeJumpmapGroundSampleSpacing(physics?.groundSampleSpacing);
  const metricHeight = Math.max(1, Number(metrics?.height) || 1);
  const autoStepHeight = Math.max(5, Math.min(26, Math.round(metricHeight * 0.16)));
  const baseGroundMaxUp = Math.max(4, autoStepHeight + 2);
  const baseGroundMaxDown = Math.max(10, autoStepHeight + 8);
  return {
    walkableSlopeMaxAngle,
    slopeFallStartAngle,
    supportMaxGroundAngle,
    groundSampleSpacing,
    autoStepHeight,
    baseGroundMaxUp,
    baseGroundMaxDown
  };
};

// Phase stepPlayerState-2:
// Shared extraction of the deterministic preflight block near the top of legacy stepPlayerState().
// This intentionally avoids mutating playerState and still delegates the actual simulation to legacy.
export const buildJumpmapStepPreflightContext = ({
  playerState,
  physics,
  moveSpeed,
  metrics,
  objects,
  obstacles,
  localPointToWorld
} = {}) => {
  const stepBaseConfig = buildJumpmapStepBaseConfig({ physics, metrics });
  const inputState = resolveJumpmapStepInputState(playerState);
  const jumpSpeed = Number(physics?.jumpSpeed) || 0;
  const jumpHeight = Number(physics?.jumpHeight) || 0;
  const fallSpeed = Number(physics?.fallSpeed) || 0;

  let obstacleContext = null;
  let obstacleContextSource = 'none';
  let obstaclePreflightError = null;
  try {
    const hasProvidedObstacles =
      obstacles && (Array.isArray(obstacles) || Array.isArray(obstacles?.list));
    if (hasProvidedObstacles) {
      obstacleContext = obstacles;
      obstacleContextSource = 'provided';
    } else if (Array.isArray(objects) && typeof localPointToWorld === 'function') {
      obstacleContext = jumpmapCollectObstacleBounds({ objects, localPointToWorld });
      obstacleContextSource = 'computed';
    }
  } catch (error) {
    obstaclePreflightError = error;
    obstacleContext = null;
    obstacleContextSource = 'error';
  }

  const safeMoveSpeed = Math.max(0, Number(moveSpeed) || 0);
  const targetVx = inputState.hasInput
    ? inputState.inputDir * safeMoveSpeed
    : Number(playerState?.vx) || 0;

  return {
    obstacleContext,
    obstacleContextSource,
    obstaclePreflightError,
    jumpSpeed,
    jumpHeight,
    fallSpeed,
    stepBaseConfig,
    inputState,
    previewFacing: inputState.facing,
    previewTargetVx: targetVx
  };
};

// Phase stepPlayerState-3a:
// Shared application of the deterministic input->vx/facing mutation at the top of legacy stepPlayerState().
// This is idempotent because legacy applies the same values again immediately afterward.
export const applyJumpmapStepInputPreflight = ({
  playerState,
  moveSpeed,
  inputState
} = {}) => {
  if (!playerState || typeof playerState !== 'object' || !inputState) return;
  const safeMoveSpeed = Math.max(0, Number(moveSpeed) || 0);
  if (inputState.hasInput) {
    playerState.vx = inputState.inputDir * safeMoveSpeed;
  }
  playerState.facing = inputState.facing;
};

// Phase stepPlayerState-3b:
// Shared extraction of the initial ground-probe gating/options (before actual collision queries).
export const buildJumpmapGroundProbePreflight = ({
  playerState,
  inputState,
  stepBaseConfig
} = {}) => {
  const safeState = playerState && typeof playerState === 'object' ? playerState : {};
  const cfg = stepBaseConfig && typeof stepBaseConfig === 'object' ? stepBaseConfig : {};
  const shouldProbeGroundAtStart = !safeState.jumping && (Number(safeState.vy) || 0) >= -EPS;
  const inputDir = Number(inputState?.inputDir) || 0;
  const supportProbeDirection = inputDir || (Number(safeState.vx) || 0);
  const baseGroundMaxUp = Math.max(0, Number(cfg.baseGroundMaxUp) || 0);
  const baseGroundMaxDown = Math.max(0, Number(cfg.baseGroundMaxDown) || 0);
  const autoStepHeight = Math.max(0, Number(cfg.autoStepHeight) || 0);
  const groundSampleSpacing = normalizeJumpmapGroundSampleSpacing(cfg.groundSampleSpacing);
  const supportMaxGroundAngle = normalizeJumpmapSlopeFallStartAngle(
    cfg.supportMaxGroundAngle,
    normalizeJumpmapWalkableSlopeMaxAngle(cfg.walkableSlopeMaxAngle)
  );

  const primaryProbe = {
    maxUp: baseGroundMaxUp,
    maxDown: baseGroundMaxDown,
    direction: supportProbeDirection,
    sampleSpacing: groundSampleSpacing,
    maxGroundAngle: supportMaxGroundAngle
  };
  const fallbackProbe = {
    maxUp: Math.max(baseGroundMaxUp + 6, autoStepHeight * 2),
    maxDown: Math.max(baseGroundMaxDown + 6, autoStepHeight * 2 + 8),
    direction: supportProbeDirection,
    sampleSpacing: groundSampleSpacing,
    maxGroundAngle: supportMaxGroundAngle
  };

  return {
    shouldProbeGroundAtStart,
    supportProbeDirection,
    primaryProbe,
    fallbackProbe
  };
};

// Phase stepPlayerState-3c:
// Shared execution of the initial groundedBeforeStep support probe.
export const probeJumpmapInitialGroundSupport = ({
  playerState,
  metrics,
  playerHitboxPolygon,
  obstacleContext,
  groundProbePreflight
} = {}) => {
  const result = {
    supportY: null,
    groundedBeforeStep: false,
    source: 'skipped',
    error: null
  };
  if (!playerState || !metrics || !groundProbePreflight?.shouldProbeGroundAtStart) return result;
  if (!(obstacleContext && (Array.isArray(obstacleContext) || Array.isArray(obstacleContext?.list)))) {
    result.source = 'no-obstacles';
    return result;
  }

  const callProbe = (probeOptions) => detectGroundSupportShared(
    playerState,
    metrics,
    obstacleContext,
    {
      ...probeOptions,
      playerHitboxPolygon
    }
  );

  try {
    const primarySupportY = callProbe(groundProbePreflight.primaryProbe || {});
    if (primarySupportY != null) {
      result.supportY = primarySupportY;
      result.groundedBeforeStep = true;
      result.source = 'primary';
      return result;
    }
    const fallbackSupportY = callProbe(groundProbePreflight.fallbackProbe || {});
    if (fallbackSupportY != null) {
      result.supportY = fallbackSupportY;
      result.groundedBeforeStep = true;
      result.source = 'fallback';
      return result;
    }
    result.source = 'none';
    return result;
  } catch (error) {
    result.source = 'error';
    result.error = error;
    return result;
  }
};

// Phase stepPlayerState-3d:
// Apply only the groundedBeforeStep=true mutation branch from legacy.
// The non-grounded branch (coyote timer decay) stays in legacy for now to avoid double-decrement.
export const applyJumpmapInitialGroundSupportState = ({
  playerState,
  metrics,
  groundSupportProbeResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return;
  const result = groundSupportProbeResult && typeof groundSupportProbeResult === 'object'
    ? groundSupportProbeResult
    : null;
  if (!result?.groundedBeforeStep) return;
  const metricHeight = Math.max(1, Number(metrics?.height) || 1);
  playerState.onGround = true;
  playerState.vy = 0;
  if (Number.isFinite(result.supportY)) {
    playerState.y = Number(result.supportY) - metricHeight;
  }
  playerState.jumpsUsed = 0;
  playerState.jumpedFromGround = false;
  playerState.jumping = false;
  playerState.coyoteTimer = COYOTE_TIME_SEC;
};

// Phase stepPlayerState-3e:
// Shared slope/flat-zone evaluation preflight and forced-fall decision (no state mutation yet).
export const evaluateJumpmapSlopePreflight = ({
  playerState,
  metrics,
  physics,
  map,
  playerHitboxPolygon,
  obstacleContext,
  stepBaseConfig,
  groundSupportProbeResult
} = {}) => {
  const result = {
    canEvaluateSlope: false,
    inFlatZone: false,
    flatZones: [],
    slope: null,
    slopeAngleDeg: 0,
    forcedSlopeFall: false,
    source: 'skipped',
    error: null
  };
  if (!playerState || !metrics || !stepBaseConfig) return result;
  if (!(obstacleContext && (Array.isArray(obstacleContext) || Array.isArray(obstacleContext?.list)))) {
    result.source = 'no-obstacles';
    return result;
  }

  const groundedBeforeStep = !!groundSupportProbeResult?.groundedBeforeStep;
  const canEvaluateSlope = !!playerState.onGround || groundedBeforeStep;
  result.canEvaluateSlope = canEvaluateSlope;
  if (!canEvaluateSlope) {
    result.source = 'no-ground-context';
    return result;
  }

  try {
    const flatZones = normalizeFlatZonesForPhysicsShared(
      physics?.flatZones,
      map
    ) || [];
    result.flatZones = flatZones;
    const inFlatZone = !!isPlayerFootInFlatZoneShared(
      playerState,
      metrics,
      flatZones
    );
    result.inFlatZone = inFlatZone;
    if (inFlatZone) {
      result.source = 'flat-zone';
      return result;
    }

    const slope = estimateGroundSlopeShared({
      x: playerState.x,
      y: playerState.y,
      width: metrics.width,
      height: metrics.height,
      obstacles: obstacleContext,
      sampleSpacing: stepBaseConfig.groundSampleSpacing,
      playerHitboxPolygon,
      maxGroundAngle: stepBaseConfig.supportMaxGroundAngle
    });
    result.slope = Number.isFinite(Number(slope)) ? Number(slope) : null;
    if (result.slope != null) {
      result.slopeAngleDeg = Math.atan(Math.abs(result.slope)) * (180 / Math.PI);
    }
    result.forcedSlopeFall = (
      result.slope != null &&
      result.slopeAngleDeg > (Number(stepBaseConfig.slopeFallStartAngle) || 0) + EPS
    );
    result.source = 'evaluated';
    return result;
  } catch (error) {
    result.source = 'error';
    result.error = error;
    return result;
  }
};

// Phase stepPlayerState-3f:
// Apply the legacy forced-slope-fall state mutation (decision is computed by slope preflight).
// Legacy will recompute and apply the same values again, so this is safe and idempotent.
export const applyJumpmapForcedSlopeFallState = ({
  playerState,
  slopePreflightResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return;
  const slopeResult = slopePreflightResult && typeof slopePreflightResult === 'object'
    ? slopePreflightResult
    : null;
  if (!slopeResult?.forcedSlopeFall) return;
  playerState.onGround = false;
  playerState.jumping = false;
  playerState.coyoteTimer = 0;
};

// Phase stepPlayerState-3g:
// Apply the legacy vx control block that uses slope/flat-zone results (before jump handling).
// Legacy re-applies the same logic, so this is safe and idempotent.
export const applyJumpmapSlopeInputMotionControl = ({
  playerState,
  moveSpeed,
  stepBaseConfig,
  inputState,
  groundSupportProbeResult,
  slopePreflightResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return;
  const safeMoveSpeed = Math.max(0, Number(moveSpeed) || 0);
  const hasInput = !!inputState?.hasInput;
  const inputDir = Number(inputState?.inputDir) || 0;
  const slopeResult = slopePreflightResult && typeof slopePreflightResult === 'object'
    ? slopePreflightResult
    : null;
  const groundedBeforeStep = !!groundSupportProbeResult?.groundedBeforeStep && !slopeResult?.forcedSlopeFall;
  const canUseGroundControl = !!playerState.onGround || groundedBeforeStep;
  const inFlatZone = !!slopeResult?.inFlatZone;
  const slope = Number.isFinite(Number(slopeResult?.slope)) ? Number(slopeResult.slope) : null;
  const slopeAngleDeg = Number.isFinite(Number(slopeResult?.slopeAngleDeg))
    ? Number(slopeResult.slopeAngleDeg)
    : 0;
  const walkableSlopeMaxAngle = normalizeJumpmapWalkableSlopeMaxAngle(stepBaseConfig?.walkableSlopeMaxAngle);

  if (canUseGroundControl && hasInput) {
    if (!inFlatZone && slope != null && slopeAngleDeg > walkableSlopeMaxAngle + EPS) {
      playerState.vx = 0;
    } else {
      playerState.vx = inputDir * safeMoveSpeed;
    }
  }

  if (!hasInput) {
    playerState.vx = 0;
  }

  if (hasInput) {
    const desiredSign = inputDir > 0 ? 1 : -1;
    if (playerState.vx * desiredSign <= EPS) {
      const minControlSpeed = safeMoveSpeed * 0.08;
      playerState.vx = desiredSign * minControlSpeed;
    }
  }
};

// Phase stepPlayerState-3h:
// Shared jump-start preflight (decision only). This intentionally does not consume jumpQueued yet,
// because legacy remains authoritative and still reads/clears it internally.
export const evaluateJumpmapJumpStartPreflight = ({
  playerState,
  jumpPressedOverride,
  metrics,
  playerHitboxPolygon,
  obstacleContext,
  stepBaseConfig,
  inputState,
  groundSupportProbeResult,
  slopePreflightResult
} = {}) => {
  const result = {
    jumpPressed: false,
    effectiveGroundedBeforeStep: false,
    jumpSupportY: null,
    jumpSupportProbeAttempted: false,
    jumpSupportProbeSource: 'skipped',
    coyoteJumpAllowed: false,
    wouldGroundOrCoyoteJump: false,
    wouldDoubleJump: false,
    source: 'skipped',
    error: null
  };
  if (!playerState || typeof playerState !== 'object') return result;

  const jumpPressed = typeof jumpPressedOverride === 'boolean'
    ? jumpPressedOverride
    : !!playerState?.input?.jumpQueued;
  result.jumpPressed = jumpPressed;
  const effectiveGroundedBeforeStep =
    !!groundSupportProbeResult?.groundedBeforeStep && !slopePreflightResult?.forcedSlopeFall;
  result.effectiveGroundedBeforeStep = effectiveGroundedBeforeStep;

  if (!jumpPressed) {
    result.source = 'no-jump-input';
    return result;
  }

  const inputDir = Number(inputState?.inputDir) || 0;
  const cfg = stepBaseConfig && typeof stepBaseConfig === 'object' ? stepBaseConfig : {};
  const autoStepHeight = Math.max(0, Number(cfg.autoStepHeight) || 0);
  const baseGroundMaxUp = Math.max(0, Number(cfg.baseGroundMaxUp) || 0);
  const baseGroundMaxDown = Math.max(0, Number(cfg.baseGroundMaxDown) || 0);
  const groundSampleSpacing = normalizeJumpmapGroundSampleSpacing(cfg.groundSampleSpacing);
  const supportMaxGroundAngle = normalizeJumpmapSlopeFallStartAngle(
    cfg.supportMaxGroundAngle,
    normalizeJumpmapWalkableSlopeMaxAngle(cfg.walkableSlopeMaxAngle)
  );

  const shouldProbeJumpSupport = (
    !effectiveGroundedBeforeStep &&
    !playerState.jumping &&
    !playerState.jumpedFromGround &&
    (Number(playerState.jumpsUsed) || 0) === 0 &&
    (Number(playerState.vy) || 0) >= -EPS
  );
  if (shouldProbeJumpSupport) {
    result.jumpSupportProbeAttempted = true;
    try {
      const jumpSupportY = detectGroundSupportShared(
        playerState,
        metrics,
        obstacleContext,
        {
          maxUp: Math.max(baseGroundMaxUp + 8, autoStepHeight * 2),
          maxDown: Math.max(baseGroundMaxDown + 8, autoStepHeight * 2 + 12),
          direction: inputDir || playerState.facing,
          sampleSpacing: groundSampleSpacing,
          playerHitboxPolygon,
          maxGroundAngle: supportMaxGroundAngle
        }
      );
      if (jumpSupportY != null) {
        result.jumpSupportY = jumpSupportY;
        result.jumpSupportProbeSource = 'supported';
      } else {
        result.jumpSupportProbeSource = 'none';
      }
    } catch (error) {
      result.jumpSupportProbeSource = 'error';
      result.error = error;
    }
  }

  const groundedBeforeJumpDecision = effectiveGroundedBeforeStep || result.jumpSupportY != null;
  const coyoteJumpAllowed = (Number(playerState.coyoteTimer) || 0) > EPS;
  result.coyoteJumpAllowed = coyoteJumpAllowed;
  result.wouldGroundOrCoyoteJump = !!(playerState.onGround || groundedBeforeJumpDecision || coyoteJumpAllowed);
  result.wouldDoubleJump = !!(
    !result.wouldGroundOrCoyoteJump &&
    playerState.jumpedFromGround &&
    Number(playerState.jumpsUsed) === 1
  );
  result.source = 'evaluated';
  return result;
};

// Phase stepPlayerState-3i:
// Shadow consume jumpQueued for shared preflight/mirror work, then restore before legacy step runs.
// This lets shared read a single-frame jump intent without stealing the input from legacy yet.
export const consumeJumpmapStepJumpQueueShadow = ({ playerState } = {}) => {
  const hasInputObj = !!(playerState && typeof playerState === 'object' && playerState.input && typeof playerState.input === 'object');
  const jumpPressed = hasInputObj ? !!playerState.input.jumpQueued : false;
  if (hasInputObj) playerState.input.jumpQueued = false;
  return {
    hasInputObj,
    jumpPressed,
    originalJumpQueued: jumpPressed
  };
};

export const restoreJumpmapStepJumpQueueShadow = ({
  playerState,
  shadow,
  overrideJumpQueued
} = {}) => {
  if (!(playerState && typeof playerState === 'object' && playerState.input && typeof playerState.input === 'object')) return;
  if (!shadow || !shadow.hasInputObj) return;
  if (typeof overrideJumpQueued === 'boolean') {
    playerState.input.jumpQueued = overrideJumpQueued;
    return;
  }
  playerState.input.jumpQueued = !!shadow.originalJumpQueued;
};

// Phase stepPlayerState-3j:
// Apply only the pre-jump support grounding mutation from legacy (before actual jump state mutation).
export const applyJumpmapJumpSupportGroundingState = ({
  playerState,
  metrics,
  jumpPreflightResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return;
  const result = jumpPreflightResult && typeof jumpPreflightResult === 'object' ? jumpPreflightResult : null;
  if (!(result?.jumpPressed && Number.isFinite(result?.jumpSupportY))) return;
  const metricHeight = Math.max(1, Number(metrics?.height) || 1);
  playerState.onGround = true;
  playerState.y = Number(result.jumpSupportY) - metricHeight;
  playerState.vy = 0;
};

// Phase stepPlayerState-3k:
// Apply the jump state mutation itself (ground/coyote or double jump) using shared preflight results.
// This mirrors the legacy block and is safe to pre-apply because legacy can be prevented from re-consuming
// jumpQueued for the same frame via the shadow restore override.
export const applyJumpmapJumpStateMutation = ({
  playerState,
  physics,
  jumpPreflightResult
} = {}) => {
  const result = {
    applied: false,
    kind: 'none'
  };
  if (!playerState || typeof playerState !== 'object') return result;
  const preflight = jumpPreflightResult && typeof jumpPreflightResult === 'object' ? jumpPreflightResult : null;
  if (!preflight?.jumpPressed) return result;

  const jumpSpeed = Number(physics?.jumpSpeed) || 0;
  const jumpHeight = Number(physics?.jumpHeight) || 0;

  if (preflight.wouldGroundOrCoyoteJump) {
    playerState.vy = -jumpSpeed;
    playerState.jumpTargetY = (Number(playerState.y) || 0) - jumpHeight;
    playerState.jumpsUsed = 1;
    playerState.jumpedFromGround = true;
    playerState.jumping = true;
    playerState.coyoteTimer = 0;
    result.applied = true;
    result.kind = 'ground-or-coyote';
    return result;
  }

  if (preflight.wouldDoubleJump) {
    playerState.vy = -jumpSpeed;
    playerState.jumpTargetY = (Number(playerState.y) || 0) - jumpHeight;
    playerState.jumpsUsed = 2;
    playerState.jumping = true;
    result.applied = true;
    result.kind = 'double-jump';
    return result;
  }

  return result;
};

// Phase stepPlayerState-3l:
// Apply the legacy vy mode block after jump-state decisions.
// Legacy re-applies the same branch, so this is safe and keeps migration incremental.
export const applyJumpmapVerticalVelocityMode = ({
  playerState,
  physics
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return;
  const jumpSpeed = Number(physics?.jumpSpeed) || 0;
  const fallSpeed = Number(physics?.fallSpeed) || 0;
  if (playerState.jumping) {
    playerState.vy = -jumpSpeed;
  } else if (!playerState.onGround) {
    playerState.vy = fallSpeed;
  } else {
    playerState.vy = 0;
  }
};

// Phase stepPlayerState-3x:
// Safe subset of post-vertical collision state mutations. These are idempotent when re-applied
// with the same vertical resolution result, so they can be layered on top of legacy execution
// while we keep collision resolution itself in the legacy implementation.
export const applyJumpmapVerticalCollisionPostState = ({
  playerState,
  verticalResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return { applied: false, landed: false, hitCeiling: false };
  const v = verticalResult && typeof verticalResult === 'object' ? verticalResult : null;
  const hitCeiling = !!v?.hitCeiling;
  const landed = !!v?.landed;

  if (hitCeiling) {
    playerState.jumping = false;
    playerState.vy = 0;
  }
  if (landed) {
    playerState.jumpsUsed = 0;
    playerState.jumpedFromGround = false;
    playerState.jumping = false;
    playerState.vy = 0;
    playerState.coyoteTimer = COYOTE_TIME_SEC;
    playerState.onGround = true;
  }

  return { applied: hitCeiling || landed, landed, hitCeiling };
};

// Phase stepPlayerState-4a:
// Safe subset of horizontal post-state mutations. We intentionally avoid re-applying stepped y/onGround
// here because that value is pre-vertical-resolution. The blocked -> vx=0 branch is safe and idempotent.
export const applyJumpmapHorizontalCollisionPostState = ({
  playerState,
  horizontalResult
} = {}) => {
  if (!playerState || typeof playerState !== 'object') return { applied: false, blocked: false };
  const h = horizontalResult && typeof horizontalResult === 'object' ? horizontalResult : null;
  const blocked = !!h?.blocked;
  if (blocked) {
    playerState.vx = 0;
  }
  return { applied: blocked, blocked };
};

// Phase stepPlayerState-3y:
// Safe re-application of the final legacy ground re-check snap (post vertical resolution).
// We only apply the positive snap branch; when no support is found, legacy state is kept as-is.
export const applyJumpmapFinalGroundSupportSnapPostState = ({
  playerState,
  metrics,
  obstacleContext,
  playerHitboxPolygon,
  stepBaseConfig,
  slopePreflightResult,
  verticalResult
} = {}) => {
  const state = playerState && typeof playerState === 'object' ? playerState : null;
  const v = verticalResult && typeof verticalResult === 'object' ? verticalResult : null;
  const cfg = stepBaseConfig && typeof stepBaseConfig === 'object' ? stepBaseConfig : {};
  if (!state || !metrics || !obstacleContext) return { applied: false, reason: 'missing-input' };
  if (v?.landed) return { applied: false, reason: 'already-landed' };
  if (slopePreflightResult?.forcedSlopeFall) return { applied: false, reason: 'forced-slope-fall' };
  if (state.jumping) return { applied: false, reason: 'jumping' };
  if ((Number(state.vy) || 0) < -EPS) return { applied: false, reason: 'rising' };

  const autoStepHeight = Math.max(0, Number(cfg.autoStepHeight) || 0);
  const groundSampleSpacing = normalizeJumpmapGroundSampleSpacing(cfg.groundSampleSpacing);
  const supportMaxGroundAngle = normalizeJumpmapSlopeFallStartAngle(
    cfg.supportMaxGroundAngle,
    normalizeJumpmapWalkableSlopeMaxAngle(cfg.walkableSlopeMaxAngle)
  );

  const supportedY = detectGroundSupportShared(
    state,
    metrics,
    obstacleContext,
    {
      maxUp: autoStepHeight,
      maxDown: autoStepHeight + 6,
      direction: state.vx,
      sampleSpacing: groundSampleSpacing,
      playerHitboxPolygon,
      maxGroundAngle: supportMaxGroundAngle
    }
  );
  if (supportedY == null) return { applied: false, reason: 'no-support' };

  const metricHeight = Math.max(1, Number(metrics.height) || 1);
  state.y = Number(supportedY) - metricHeight;
  state.onGround = true;
  state.jumpsUsed = 0;
  state.jumpedFromGround = false;
  state.jumping = false;
  state.vy = 0;
  state.coyoteTimer = COYOTE_TIME_SEC;
  return { applied: true, reason: 'snapped' };
};

// Phase stepPlayerState-3m:
// Shared extraction of the resolveHorizontal preflight inputs (before actual collision resolution).
// This mirrors legacy's mutable groundedBeforeStep flow across slope-fall and jump-support branches.
export const buildJumpmapHorizontalResolutionPreflight = ({
  playerState,
  dt,
  playerHitboxPolygon,
  obstacleContext,
  stepBaseConfig,
  groundSupportProbeResult,
  slopePreflightResult,
  jumpPreflightResult
} = {}) => {
  const safeState = playerState && typeof playerState === 'object' ? playerState : null;
  const cfg = stepBaseConfig && typeof stepBaseConfig === 'object' ? stepBaseConfig : {};
  const result = {
    groundedBeforeStepAfterPreflight: false,
    nextX: Number(safeState?.x) || 0,
    canUseGroundAssist: false,
    horizontalOptions: {
      allowStepUp: false,
      stepHeight: Math.max(0, Number(cfg.autoStepHeight) || 0),
      sampleSpacing: normalizeJumpmapGroundSampleSpacing(cfg.groundSampleSpacing),
      playerHitboxPolygon,
      maxGroundAngle: normalizeJumpmapSlopeFallStartAngle(
        cfg.supportMaxGroundAngle,
        normalizeJumpmapWalkableSlopeMaxAngle(cfg.walkableSlopeMaxAngle)
      )
    }
  };
  if (!safeState) return result;

  let groundedBeforeStep = !!groundSupportProbeResult?.groundedBeforeStep;
  if (slopePreflightResult?.forcedSlopeFall) groundedBeforeStep = false;
  if (jumpPreflightResult?.jumpPressed && Number.isFinite(jumpPreflightResult?.jumpSupportY)) {
    groundedBeforeStep = true;
  }
  result.groundedBeforeStepAfterPreflight = groundedBeforeStep;

  const safeDt = Math.max(0, Number(dt) || 0);
  result.nextX = (Number(safeState.x) || 0) + (Number(safeState.vx) || 0) * safeDt;
  result.canUseGroundAssist = !!(
    !safeState.jumping &&
    (Number(safeState.vy) || 0) >= -EPS &&
    (
      safeState.onGround ||
      groundedBeforeStep ||
      (Number(safeState.coyoteTimer) || 0) > EPS
    )
  );
  result.horizontalOptions.allowStepUp = result.canUseGroundAssist;
  return result;
};

const buildObstacleSpatialIndex = (list, cellSize = OBSTACLE_CELL_SIZE) => {
  const buckets = new Map();
  const safeCell = Math.max(24, Math.round(Number(cellSize) || OBSTACLE_CELL_SIZE));
  list.forEach((box, index) => {
    const minCx = Math.floor(box.x1 / safeCell);
    const maxCx = Math.floor((box.x2 - EPS) / safeCell);
    const minCy = Math.floor(box.y1 / safeCell);
    const maxCy = Math.floor((box.y2 - EPS) / safeCell);
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        const key = `${cx}:${cy}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
      }
    }
  });
  return { cellSize: safeCell, buckets };
};

const getObstacleList = (obstacles) => (
  Array.isArray(obstacles)
    ? obstacles
    : (Array.isArray(obstacles?.list) ? obstacles.list : [])
);

const getObstacleCandidates = (obstacles, x1, y1, x2, y2) => {
  const list = getObstacleList(obstacles);
  const index = obstacles?.index;
  if (!index?.buckets || !index.cellSize || !list.length) return list;
  const safeX1 = Math.min(x1, x2);
  const safeX2 = Math.max(x1, x2);
  const safeY1 = Math.min(y1, y2);
  const safeY2 = Math.max(y1, y2);
  const minCx = Math.floor(safeX1 / index.cellSize);
  const maxCx = Math.floor((safeX2 - EPS) / index.cellSize);
  const minCy = Math.floor(safeY1 / index.cellSize);
  const maxCy = Math.floor((safeY2 - EPS) / index.cellSize);
  const hitIndices = new Set();
  for (let cx = minCx; cx <= maxCx; cx += 1) {
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      const key = `${cx}:${cy}`;
      const bucket = index.buckets.get(key);
      if (!bucket) continue;
      bucket.forEach((idx) => hitIndices.add(idx));
    }
  }
  if (!hitIndices.size) return [];
  const candidates = [];
  hitIndices.forEach((idx) => {
    const box = list[idx];
    if (box) candidates.push(box);
  });
  return candidates;
};

const hasHorizontalOverlap = (x, w, box) => (x + w) > (box.x1 + EPS) && x < (box.x2 - EPS);
const hasVerticalOverlap = (y, h, box) => (y + h) > (box.y1 + EPS) && y < (box.y2 - EPS);
const hasAabbOverlap = (x, y, w, h, box) =>
  hasHorizontalOverlap(x, w, box) && hasVerticalOverlap(y, h, box);

const rectToPolygon = (x, y, w, h) => ([
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h }
]);

const normalizePlayerHitboxPolygon = (polygon) => {
  const source = Array.isArray(polygon?.points)
    ? polygon.points
    : (Array.isArray(polygon) ? polygon : null);
  if (!Array.isArray(source) || source.length < 3) return null;
  const points = source
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      x: Math.max(0, Math.min(1, point.x)),
      y: Math.max(0, Math.min(1, point.y))
    }));
  if (points.length < 3) return null;
  return { points };
};

const buildPlayerPolygonAt = (x, y, width, height, playerHitboxPolygon = null) => {
  const normalized = normalizePlayerHitboxPolygon(playerHitboxPolygon);
  if (!normalized) return rectToPolygon(x, y, width, height);
  return normalized.points.map((point) => ({
    x: x + point.x * width,
    y: y + point.y * height
  }));
};

const getPolygonBounds = (points) => {
  if (!Array.isArray(points) || points.length < 3) return null;
  const xs = points.map((point) => Number(point?.x));
  const ys = points.map((point) => Number(point?.y));
  if (xs.some((value) => !Number.isFinite(value)) || ys.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return { x1, y1, x2, y2, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
};

const cross2D = (a, b, c) => (
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
);

const pointOnSegment = (point, a, b) => {
  const minX = Math.min(a.x, b.x) - EPS;
  const maxX = Math.max(a.x, b.x) + EPS;
  const minY = Math.min(a.y, b.y) - EPS;
  const maxY = Math.max(a.y, b.y) + EPS;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return false;
  return Math.abs(cross2D(a, b, point)) <= EPS;
};

const pointInPolygonStrict = (point, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (pointOnSegment(point, polygon[j], polygon[i])) return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    const intersects =
      ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPS) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
};

const segmentsProperlyIntersect = (a1, a2, b1, b2) => {
  const aMinX = Math.min(a1.x, a2.x) - EPS;
  const aMaxX = Math.max(a1.x, a2.x) + EPS;
  const aMinY = Math.min(a1.y, a2.y) - EPS;
  const aMaxY = Math.max(a1.y, a2.y) + EPS;
  const bMinX = Math.min(b1.x, b2.x) - EPS;
  const bMaxX = Math.max(b1.x, b2.x) + EPS;
  const bMinY = Math.min(b1.y, b2.y) - EPS;
  const bMaxY = Math.max(b1.y, b2.y) + EPS;
  if (aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY) return false;

  const d1 = cross2D(a1, a2, b1);
  const d2 = cross2D(a1, a2, b2);
  const d3 = cross2D(b1, b2, a1);
  const d4 = cross2D(b1, b2, a2);

  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS))
    && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
};

const polygonsIntersect = (aPoints, bPoints) => {
  if (!Array.isArray(aPoints) || !Array.isArray(bPoints)) return false;
  if (aPoints.length < 3 || bPoints.length < 3) return false;

  for (let i = 0; i < aPoints.length; i += 1) {
    const a1 = aPoints[i];
    const a2 = aPoints[(i + 1) % aPoints.length];
    for (let j = 0; j < bPoints.length; j += 1) {
      const b1 = bPoints[j];
      const b2 = bPoints[(j + 1) % bPoints.length];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
    }
  }

  for (let i = 0; i < aPoints.length; i += 1) {
    if (pointInPolygonStrict(aPoints[i], bPoints)) return true;
  }
  for (let i = 0; i < bPoints.length; i += 1) {
    if (pointInPolygonStrict(bPoints[i], aPoints)) return true;
  }
  return false;
};

const buildGroundSampleXs = (x, width, options = {}) => {
  const direction = Number(options.direction) || 0;
  const sampleSpacing = normalizeJumpmapGroundSampleSpacing(options.sampleSpacing);
  const left = x + 1;
  const right = x + width - 1;
  if (right <= left + EPS) return [x + width * 0.5];
  const sampleXs = [];
  for (let sx = left; sx <= right + EPS; sx += sampleSpacing) {
    sampleXs.push(Math.min(right, sx));
  }
  sampleXs.push(x + width * 0.5);
  if (direction > EPS) sampleXs.push(right);
  else if (direction < -EPS) sampleXs.push(left);
  sampleXs.sort((a, b) => a - b);
  const uniqueXs = [];
  sampleXs.forEach((sx) => {
    if (!uniqueXs.length || Math.abs(uniqueXs[uniqueXs.length - 1] - sx) > 0.25) {
      uniqueXs.push(sx);
    }
  });
  return uniqueXs;
};

const getPolygonTopHitAtX = (points, x, edgeSlip = null, options = {}) => {
  const maxAbsSlope = Number.isFinite(options?.maxAbsSlope)
    ? Math.max(0, Number(options.maxAbsSlope))
    : Number.POSITIVE_INFINITY;
  const endpointMarginPx = Number.isFinite(options?.endpointMarginPx)
    ? Math.max(0, Number(options.endpointMarginPx))
    : 0;
  const candidates = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX - EPS || x > maxX + EPS) continue;
    const dx = b.x - a.x;
    if (Math.abs(dx) <= EPS) continue;
    const t = (x - a.x) / dx;
    if (t < -EPS || t > 1 + EPS) continue;
    const endpointMarginT = endpointMarginPx > EPS
      ? Math.min(0.49, endpointMarginPx / Math.abs(dx))
      : 0;
    if (endpointMarginT > EPS && (t <= endpointMarginT || t >= 1 - endpointMarginT)) continue;
    const slope = (b.y - a.y) / dx;
    if (Number.isFinite(maxAbsSlope) && Math.abs(slope) > maxAbsSlope + EPS) continue;
    candidates.push({
      y: a.y + (b.y - a.y) * t,
      edgeIndex: i,
      slope,
      edgeSlipEnabled: Array.isArray(edgeSlip) ? edgeSlip[i] !== false : true
    });
  }
  if (!candidates.length) return null;
  let top = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (candidate.y < top.y - EPS) {
      top = candidate;
    } else if (Math.abs(candidate.y - top.y) <= EPS) {
      const topAbsSlope = Number.isFinite(top.slope) ? Math.abs(top.slope) : Number.POSITIVE_INFINITY;
      const candidateAbsSlope = Number.isFinite(candidate.slope) ? Math.abs(candidate.slope) : Number.POSITIVE_INFINITY;
      if (candidateAbsSlope < topAbsSlope) top = candidate;
    }
  }
  return top;
};

const collidesAt = (x, y, width, height, obstacles, playerHitboxPolygon = null) => {
  const playerPoly = buildPlayerPolygonAt(x, y, width, height, playerHitboxPolygon);
  const playerBounds = getPolygonBounds(playerPoly) || { x1: x, y1: y, x2: x + width, y2: y + height, w: width, h: height };
  const candidates = getObstacleCandidates(
    obstacles,
    playerBounds.x1,
    playerBounds.y1,
    playerBounds.x2,
    playerBounds.y2
  );
  for (const box of candidates) {
    if (!hasAabbOverlap(playerBounds.x1, playerBounds.y1, playerBounds.w, playerBounds.h, box)) continue;
    if (polygonsIntersect(playerPoly, box.points)) return true;
  }
  return false;
};

const findGroundSnapTopY = (x, y, width, height, obstacles, options = {}) => {
  const maxUp = Math.max(0, Number(options.maxUp) || 0);
  const maxDown = Math.max(0, Number(options.maxDown) || 0);
  const direction = Number(options.direction) || 0;
  const maxGroundAngle = Number(options.maxGroundAngle);
  const clampedGroundAngle = Number.isFinite(maxGroundAngle)
    ? Math.max(0, Math.min(89.9, maxGroundAngle))
    : 89.9;
  const maxAbsSlope = Math.tan((clampedGroundAngle * Math.PI) / 180);
  const endpointMarginPx = Number.isFinite(Number(options.endpointMarginPx))
    ? Math.max(0, Number(options.endpointMarginPx))
    : 0.75;
  const sampleXs = buildGroundSampleXs(x, width, {
    direction,
    sampleSpacing: options.sampleSpacing
  });
  let bestY = null;
  let bestScore = Infinity;
  let bestHit = null;
  const topCandidates = [];

  const queryTopYMin = y - maxUp + height - 4;
  const queryTopYMax = y + maxDown + height + 4;
  for (const sampleX of sampleXs) {
    const candidates = getObstacleCandidates(
      obstacles,
      sampleX - 2,
      queryTopYMin - 8,
      sampleX + 2,
      queryTopYMax + 8
    );
    for (const box of candidates) {
      if (sampleX < box.x1 - EPS || sampleX > box.x2 + EPS) continue;
      const topHit = getPolygonTopHitAtX(box.points, sampleX, box.edgeSlip, {
        maxAbsSlope,
        endpointMarginPx
      });
      if (!topHit) continue;
      const candidateY = topHit.y - height;
      const dy = candidateY - y;
      if (dy < -maxUp - EPS || dy > maxDown + EPS) continue;
      if (collidesAt(x, candidateY, width, height, obstacles, options.playerHitboxPolygon)) continue;
      const score = Math.abs(dy);
      topCandidates.push({
        sampleX,
        candidateY,
        score,
        hit: {
          ...topHit,
          surfaceKind: box.surfaceKind || 'default'
        }
      });
      if (score < bestScore || (score === bestScore && (bestY == null || candidateY < bestY))) {
        bestScore = score;
        bestY = candidateY;
        bestHit = {
          ...topHit,
          surfaceKind: box.surfaceKind || 'default'
        };
      }
    }
  }
  if (topCandidates.length) {
    const minSupportSamples = Math.max(
      1,
      Math.round(Number(options.minSupportSamples) || MIN_GROUND_SUPPORT_SAMPLES)
    );
    const minSupportSpanPx = Math.max(
      0,
      Number.isFinite(Number(options.minSupportSpanPx))
        ? Number(options.minSupportSpanPx)
        : Math.max(4, width * MIN_GROUND_SUPPORT_SPAN_RATIO)
    );
    const supportTolerance = Math.max(
      0.25,
      Number.isFinite(Number(options.supportYTolerance))
        ? Number(options.supportYTolerance)
        : GROUND_SUPPORT_Y_TOLERANCE
    );
    const sorted = topCandidates
      .slice()
      .sort((a, b) => (a.score - b.score) || (a.candidateY - b.candidateY));
    let supported = null;
    for (let i = 0; i < sorted.length; i += 1) {
      const candidate = sorted[i];
      const aligned = sorted.filter((entry) => Math.abs(entry.candidateY - candidate.candidateY) <= supportTolerance);
      const uniqueXs = Array.from(
        new Set(aligned.map((entry) => Math.round(entry.sampleX * 100) / 100))
      ).sort((a, b) => a - b);
      const spanPx = uniqueXs.length > 1 ? (uniqueXs[uniqueXs.length - 1] - uniqueXs[0]) : 0;
      const hasEnoughSupport = (
        uniqueXs.length >= minSupportSamples ||
        spanPx >= minSupportSpanPx
      );
      if (!hasEnoughSupport) continue;
      supported = candidate;
      break;
    }
    if (supported) {
      bestY = supported.candidateY;
      bestScore = supported.score;
      bestHit = supported.hit;
    } else {
      bestY = null;
      bestScore = Infinity;
      bestHit = null;
    }
  }
  if (options.includeHit) {
    return {
      y: bestY,
      hit: bestHit
    };
  }
  return bestY;
};

const normalizeFlatZonesForPhysicsShared = (zones, map) => {
  if (!Array.isArray(zones) || !zones.length) return [];
  const mapWidthRaw = Number(map?.width);
  const mapHeightRaw = Number(map?.height);
  const mapWidthAlt = Number(map?.w);
  const mapHeightAlt = Number(map?.h);
  const mapWidth = Number.isFinite(mapWidthRaw)
    ? Math.max(1, mapWidthRaw)
    : (Number.isFinite(mapWidthAlt) ? Math.max(1, mapWidthAlt) : Number.POSITIVE_INFINITY);
  const mapHeight = Number.isFinite(mapHeightRaw)
    ? Math.max(1, mapHeightRaw)
    : (Number.isFinite(mapHeightAlt) ? Math.max(1, mapHeightAlt) : Number.POSITIVE_INFINITY);
  const normalized = [];
  zones.slice(0, 128).forEach((zone) => {
    if (!zone || typeof zone !== 'object') return;
    const rawX = Number(zone.x);
    const rawY = Number(zone.y);
    const rawW = Number(zone.w);
    const rawH = Number(zone.h);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawW) || !Number.isFinite(rawH)) return;
    const x1 = Math.max(0, Math.min(mapWidth, Math.min(rawX, rawX + rawW)));
    const y1 = Math.max(0, Math.min(mapHeight, Math.min(rawY, rawY + rawH)));
    const x2 = Math.max(0, Math.min(mapWidth, Math.max(rawX, rawX + rawW)));
    const y2 = Math.max(0, Math.min(mapHeight, Math.max(rawY, rawY + rawH)));
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 2 || h < 2) return;
    normalized.push({
      x: Math.round(x1),
      y: Math.round(y1),
      w: Math.round(w),
      h: Math.round(h)
    });
  });
  return normalized;
};

const isPlayerFootInFlatZoneShared = (playerState, metrics, flatZones) => {
  if (!Array.isArray(flatZones) || !flatZones.length) return false;
  const footY = (Number(playerState?.y) || 0) + Math.max(1, Number(metrics?.height) || 1);
  const leftX = (Number(playerState?.x) || 0) + 1;
  const centerX = (Number(playerState?.x) || 0) + (Math.max(1, Number(metrics?.width) || 1) * 0.5);
  const rightX = (Number(playerState?.x) || 0) + Math.max(1, Number(metrics?.width) || 1) - 1;
  const samples = [leftX, centerX, rightX];
  return flatZones.some((zone) => {
    const x1 = zone.x;
    const y1 = zone.y;
    const x2 = zone.x + zone.w;
    const y2 = zone.y + zone.h;
    if (footY < y1 - EPS || footY > y2 + EPS) return false;
    return samples.some((sx) => sx >= x1 - EPS && sx <= x2 + EPS);
  });
};

const estimateGroundSlopeShared = ({
  x,
  y,
  width,
  height,
  obstacles,
  sampleSpacing,
  playerHitboxPolygon,
  maxGroundAngle
} = {}) => {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const probe = Math.max(6, Math.min(24, Math.round(safeWidth * 0.18)));
  const leftX = (Number(x) || 0) - probe;
  const rightX = (Number(x) || 0) + probe;
  const leftTop = findGroundSnapTopY(leftX, Number(y) || 0, safeWidth, safeHeight, obstacles, {
    maxUp: 32,
    maxDown: 32,
    direction: -1,
    sampleSpacing,
    playerHitboxPolygon,
    maxGroundAngle
  });
  const rightTop = findGroundSnapTopY(rightX, Number(y) || 0, safeWidth, safeHeight, obstacles, {
    maxUp: 32,
    maxDown: 32,
    direction: 1,
    sampleSpacing,
    playerHitboxPolygon,
    maxGroundAngle
  });
  if (leftTop == null || rightTop == null) return null;
  const dx = rightX - leftX;
  if (Math.abs(dx) <= EPS) return null;
  return (rightTop - leftTop) / dx;
};

const detectGroundSupportShared = (playerState, metrics, obstacles, options = {}) => {
  const width = Math.max(1, Number(metrics?.width) || 1);
  const height = Math.max(1, Number(metrics?.height) || 1);
  const direction = Number(options.direction) || 0;
  const attempts = [];
  const pushAttempt = (dir) => {
    if (!Number.isFinite(dir)) return;
    if (attempts.some((item) => Math.abs(item - dir) <= EPS)) return;
    attempts.push(dir);
  };
  pushAttempt(direction);
  pushAttempt(0);
  if (direction > EPS) pushAttempt(-1);
  else if (direction < -EPS) pushAttempt(1);

  let bestTopY = null;
  let bestScore = Infinity;
  for (const dir of attempts) {
    const topY = findGroundSnapTopY(
      Number(playerState?.x) || 0,
      Number(playerState?.y) || 0,
      width,
      height,
      obstacles,
      {
        ...options,
        direction: dir
      }
    );
    if (topY == null) continue;
    const score = Math.abs(topY - (Number(playerState?.y) || 0));
    if (score < bestScore) {
      bestScore = score;
      bestTopY = topY;
    }
  }
  if (bestTopY == null) {
    const strictTopY = findGroundSnapTopY(
      Number(playerState?.x) || 0,
      Number(playerState?.y) || 0,
      width,
      height,
      obstacles,
      {
        ...options,
        direction: 0,
        sampleSpacing: 2,
        maxUp: Math.max(4, Number(options.maxUp) || 0),
        maxDown: Math.max(12, Number(options.maxDown) || 0)
      }
    );
    if (strictTopY == null) return null;
    return strictTopY + height;
  }
  return bestTopY + height;
};

const resolveHorizontalShared = (playerState, nextX, metrics, obstacles, options = {}) => {
  const width = metrics.width;
  const height = metrics.height;
  const y = playerState.y;
  const currentX = playerState.x;
  const stepHeight = Math.max(0, Number(options.stepHeight) || 0);
  const sampleSpacing = normalizeJumpmapGroundSampleSpacing(options.sampleSpacing);
  const allowStepUp = !!options.allowStepUp && stepHeight > EPS;
  if (Math.abs(playerState.vx) < EPS) return { x: nextX, y, blocked: false, stepped: false };
  const bodyTrim = Math.max(0, Math.min(8, Number(HORIZONTAL_COLLISION_TRIM) || 0));
  const bodyH = Math.max(6, height - bodyTrim * 2);
  const collidesHorizontalAt = (testX, testY = y) => collidesAt(
    testX,
    (allowStepUp ? (testY - HORIZONTAL_CONTACT_SKIN) : testY) + bodyTrim,
    width,
    bodyH,
    obstacles,
    options.playerHitboxPolygon
  );
  const collidedAtTarget = collidesHorizontalAt(nextX, y);
  if (!collidedAtTarget) {
    return { x: nextX, y, blocked: false, stepped: false };
  }

  if (allowStepUp) {
    const directSlopeTop = findGroundSnapTopY(
      nextX,
      y,
      width,
      height,
      obstacles,
      {
        maxUp: stepHeight,
        maxDown: Math.max(2, stepHeight),
        direction: playerState.vx,
        sampleSpacing,
        maxGroundAngle: options.maxGroundAngle
      }
    );
    if (directSlopeTop != null) {
      return { x: nextX, y: directSlopeTop, blocked: false, stepped: true };
    }

    for (let lift = 1; lift <= stepHeight; lift += 1) {
      const steppedY = y - lift;
      if (collidesHorizontalAt(nextX, steppedY)) continue;
      const snapped = findGroundSnapTopY(
        nextX,
        steppedY,
        width,
        height,
        obstacles,
        {
          maxUp: 2,
          maxDown: 6,
          direction: playerState.vx,
          sampleSpacing,
          maxGroundAngle: options.maxGroundAngle
        }
      );
      return { x: nextX, y: snapped != null ? snapped : steppedY, blocked: false, stepped: true };
    }
  }

  let safeX = currentX;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const testX = currentX + (nextX - currentX) * mid;
    if (collidesHorizontalAt(testX, y)) {
      hi = mid;
    } else {
      safeX = testX;
      lo = mid;
    }
  }
  if (allowStepUp && Math.abs(nextX - currentX) > EPS) {
    const distance = nextX - currentX;
    const stepPx = Math.max(1, Math.min(8, Math.round(width * 0.08)));
    const samples = Math.max(1, Math.ceil(Math.abs(distance) / stepPx));
    let walkX = currentX;
    let walkY = y;
    let advanced = false;
    let fullyReached = false;
    const upLimit = Math.max(2, stepHeight);
    const downLimit = Math.max(6, stepHeight + 10);
    for (let i = 1; i <= samples; i += 1) {
      const ratio = i / samples;
      const testX = currentX + distance * ratio;
      const snappedY = findGroundSnapTopY(
        testX,
        walkY,
        width,
        height,
        obstacles,
        {
          maxUp: upLimit,
          maxDown: downLimit,
          direction: distance,
          sampleSpacing,
          maxGroundAngle: options.maxGroundAngle
        }
      );
      if (
        snappedY != null &&
        !collidesHorizontalAt(testX, snappedY)
      ) {
        walkX = testX;
        walkY = snappedY;
        advanced = true;
        fullyReached = i === samples;
        continue;
      }
      if (!collidesHorizontalAt(testX, walkY)) {
        walkX = testX;
        advanced = true;
        fullyReached = i === samples;
        continue;
      }
      break;
    }
    if (advanced) {
      return { x: walkX, y: walkY, blocked: !fullyReached, stepped: true };
    }
  }
  return { x: safeX, y, blocked: true, stepped: false };
};

const resolveVerticalShared = (playerState, nextY, metrics, obstacles, options = {}) => {
  const width = metrics.width;
  const height = metrics.height;
  const x = playerState.x;
  const currentY = playerState.y;
  if (Math.abs(playerState.vy) < EPS || Math.abs(nextY - currentY) < EPS) {
    return { y: nextY, landed: false, hitCeiling: false };
  }
  if (!collidesAt(x, nextY, width, height, obstacles, options.playerHitboxPolygon)) {
    return { y: nextY, landed: false, hitCeiling: false };
  }

  const descending = playerState.vy > EPS;
  let safeY = currentY;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const testY = currentY + (nextY - currentY) * mid;
    if (collidesAt(x, testY, width, height, obstacles, options.playerHitboxPolygon)) {
      hi = mid;
    } else {
      safeY = testY;
      lo = mid;
    }
  }

  return {
    y: safeY,
    landed: descending,
    hitCeiling: !descending
  };
};

const getSurfaceKindFromSprite = (sprite) => (
  typeof sprite === 'string' && /ice/i.test(sprite) ? 'ice' : 'default'
);

export const jumpmapCollectObstacleBounds = ({ objects, localPointToWorld } = {}) => {
  const list = Array.isArray(objects) ? objects : [];
  if (typeof localPointToWorld !== 'function') {
    throw new Error('[JumpmapRuntimePhysics] collectObstacleBounds requires localPointToWorld');
  }
  const bounds = [];
  list.forEach((obj) => {
    const surfaceKind = getSurfaceKindFromSprite(obj?.sprite);
    const cropX = obj?.crop ? Math.max(0, Number(obj.crop.x) || 0) : 0;
    const cropY = obj?.crop ? Math.max(0, Number(obj.crop.y) || 0) : 0;
    const hitboxes = Array.isArray(obj?.hitboxes) ? obj.hitboxes : [];
    hitboxes.forEach((hb) => {
      if (hb?.type === 'polygon' && Array.isArray(hb.points) && hb.points.length >= 3) {
        const hbx = (Number(hb.x) || 0) - cropX;
        const hby = (Number(hb.y) || 0) - cropY;
        const localPoints = hb.points
          .map((point) => ({
            x: hbx + (Number(point?.x) || 0),
            y: hby + (Number(point?.y) || 0)
          }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        if (localPoints.length >= 3) {
          const corners = localPoints.map((point) => localPointToWorld(point.x, point.y, obj));
          const xs = corners.map((p) => p.x);
          const ys = corners.map((p) => p.y);
          const rawEdgeSlip = Array.isArray(hb.edgeSlip) ? hb.edgeSlip : null;
          const edgeSlip = rawEdgeSlip
            ? corners.map((_, edgeIndex) => rawEdgeSlip[edgeIndex] !== false)
            : null;
          bounds.push({
            points: corners,
            surfaceKind,
            ...(edgeSlip ? { edgeSlip } : {}),
            x1: Math.min(...xs),
            y1: Math.min(...ys),
            x2: Math.max(...xs),
            y2: Math.max(...ys)
          });
        }
        return;
      }

      const hbx = (Number(hb?.x) || 0) - cropX;
      const hby = (Number(hb?.y) || 0) - cropY;
      const w = Math.max(1, Number(hb?.w) || 1);
      const h = Math.max(1, Number(hb?.h) || 1);
      let hitboxRotation = Math.round(Number(hb?.rotation) || 0);
      hitboxRotation %= 360;
      if (hitboxRotation < 0) hitboxRotation += 360;
      const cx = hbx + w / 2;
      const cy = hby + h / 2;
      const rad = (hitboxRotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotateLocalCorner = (x, y) => {
        if (!hitboxRotation) return { x, y };
        const dx = x - cx;
        const dy = y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos
        };
      };
      const corners = [
        rotateLocalCorner(hbx, hby),
        rotateLocalCorner(hbx + w, hby),
        rotateLocalCorner(hbx + w, hby + h),
        rotateLocalCorner(hbx, hby + h)
      ].map((corner) => localPointToWorld(corner.x, corner.y, obj));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      bounds.push({
        points: corners,
        surfaceKind,
        x1: Math.min(...xs),
        y1: Math.min(...ys),
        x2: Math.max(...xs),
        y2: Math.max(...ys)
      });
    });
  });
  return {
    list: bounds,
    index: buildObstacleSpatialIndex(bounds, OBSTACLE_CELL_SIZE)
  };
};

// Phase stepPlayerState-3n:
// Shared resolveHorizontal() implementation exposed through the bridge contract.
export const jumpmapResolveHorizontalBridge = ({
  playerState,
  nextX,
  metrics,
  obstacles,
  options
} = {}) => {
  const raw = resolveHorizontalShared(
    playerState,
    nextX,
    metrics,
    obstacles,
    options || {}
  ) || {};
  return {
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : (Number(nextX) || 0),
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : (Number(playerState?.y) || 0),
    blocked: !!raw.blocked,
    stepped: !!raw.stepped
  };
};

// Phase stepPlayerState-3o:
// Shared resolveVertical() implementation exposed through the bridge contract.
export const jumpmapResolveVerticalBridge = ({
  playerState,
  nextY,
  metrics,
  obstacles,
  options
} = {}) => {
  const raw = resolveVerticalShared(
    playerState,
    nextY,
    metrics,
    obstacles,
    options || {}
  ) || {};
  return {
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : (Number(nextY) || 0),
    landed: !!raw.landed,
    hitCeiling: !!raw.hitCeiling
  };
};

// Phase stepPlayerState-3z (bridge prep):
// Shared clampPlayerToMapBounds() implementation (ported from legacy) so final post-step clamping
// can be owned by the shared runtime bridge without requiring legacy physics for this part.
export const jumpmapClampPlayerToMapBoundsBridge = ({
  playerState,
  metrics,
  map
} = {}) => {
  if (!playerState || !metrics || !map || typeof map !== 'object') return playerState;
  const mapWidthRaw = Number(map.width);
  const mapHeightRaw = Number(map.height);
  const mapWidth = Number.isFinite(mapWidthRaw) ? mapWidthRaw : Number(map.w);
  const mapHeight = Number.isFinite(mapHeightRaw) ? mapHeightRaw : Number(map.h);
  if (!Number.isFinite(mapWidth) || !Number.isFinite(mapHeight)) return playerState;
  const metricWidth = Math.max(1, Number(metrics.width) || 1);
  const metricHeight = Math.max(1, Number(metrics.height) || 1);
  const maxX = Math.max(0, mapWidth - metricWidth);
  const maxY = Math.max(0, mapHeight - metricHeight);

  if ((Number(playerState.x) || 0) < 0) {
    playerState.x = 0;
    if ((Number(playerState.vx) || 0) < 0) playerState.vx = 0;
  } else if ((Number(playerState.x) || 0) > maxX) {
    playerState.x = maxX;
    if ((Number(playerState.vx) || 0) > 0) playerState.vx = 0;
  }

  if ((Number(playerState.y) || 0) < 0) {
    playerState.y = 0;
    if ((Number(playerState.vy) || 0) < 0) playerState.vy = 0;
    playerState.jumping = false;
  } else if ((Number(playerState.y) || 0) > maxY) {
    playerState.y = maxY;
    if ((Number(playerState.vy) || 0) > 0) playerState.vy = 0;
    playerState.onGround = true;
    playerState.jumpsUsed = 0;
    playerState.jumpedFromGround = false;
    playerState.jumping = false;
    playerState.coyoteTimer = COYOTE_TIME_SEC;
  }
  return playerState;
};

// Phase stepPlayerState-3p (smoke-check hook):
// Optional debug-only bridge smoke-check for resolveHorizontal().
// Disabled by default to avoid extra collision solve cost in runtime loops.
const isJumpmapResolveBridgeSmokeCheckEnabled = () => {
  try {
    return !!window.__JUMPMAP_RUNTIME_RESOLVE_BRIDGE_SMOKECHECK;
  } catch {
    return false;
  }
};

const isJumpmapResolveBridgeCompareCheckEnabled = () => {
  try {
    return !!window.__JUMPMAP_RUNTIME_RESOLVE_BRIDGE_COMPARECHECK;
  } catch {
    return false;
  }
};

const isJumpmapResolveHorizontalBridgeApplyEnabled = () => {
  try {
    return !!window.__JUMPMAP_RUNTIME_RESOLVE_HORIZONTAL_BRIDGE_APPLY;
  } catch {
    return false;
  }
};

const isJumpmapResolveVerticalBridgeApplyEnabled = () => {
  try {
    return !!window.__JUMPMAP_RUNTIME_RESOLVE_VERTICAL_BRIDGE_APPLY;
  } catch {
    return false;
  }
};

const isJumpmapSharedStepPlayerStateEnabled = () => {
  try {
    return !!window.__JUMPMAP_RUNTIME_USE_SHARED_STEP;
  } catch {
    return false;
  }
};

const canApplyJumpmapResolveBridgeWithCompareGate = ({
  axis,
  applyEnabled,
  compareEnabled,
  compareResult
} = {}) => {
  const axisKey = axis === 'resolveVertical' || axis === 'vertical' ? 'vertical' : 'horizontal';
  if (!applyEnabled) return false;
  if (!compareEnabled) {
    recordResolveBridgeApplyGateStat({ axis: axisKey, accepted: true, reason: 'no-compare' });
    return true;
  }
  if (!compareResult || compareResult.error) {
    recordResolveBridgeApplyGateStat({
      axis: axisKey,
      accepted: false,
      reason: !compareResult ? 'compare-missing' : 'compare-error'
    });
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[JumpmapRuntimePhysics] ${axis || 'resolve'} bridge apply gated off (compare unavailable/error)`, compareResult);
    }
    return false;
  }
  if (compareResult.match === false) {
    recordResolveBridgeApplyGateStat({ axis: axisKey, accepted: false, reason: 'compare-mismatch' });
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[JumpmapRuntimePhysics] ${axis || 'resolve'} bridge apply gated off (compare mismatch)`, compareResult);
    }
    return false;
  }
  recordResolveBridgeApplyGateStat({ axis: axisKey, accepted: true, reason: 'compare-match' });
  return true;
};

export const runJumpmapResolveHorizontalBridgeSmokeCheck = ({
  playerState,
  metrics,
  obstacleContext,
  horizontalPreflight
} = {}) => {
  if (!isJumpmapResolveBridgeSmokeCheckEnabled()) return null;
  if (!playerState || !metrics || !horizontalPreflight) return null;
  const obstacles = obstacleContext;
  if (!(obstacles && (Array.isArray(obstacles) || Array.isArray(obstacles?.list)))) return null;
  try {
    return jumpmapResolveHorizontalBridge({
      playerState,
      nextX: horizontalPreflight.nextX,
      metrics,
      obstacles,
      options: horizontalPreflight.horizontalOptions
    });
  } catch (error) {
    return { error };
  }
};

// Phase stepPlayerState-3r (smoke-compare hook):
// Optional debug-only comparison between shared resolveHorizontal bridge output and direct legacy output.
// Disabled by default because it adds extra collision solve calls.
export const runJumpmapResolveHorizontalBridgeCompareCheck = ({
  playerState,
  metrics,
  obstacleContext,
  horizontalPreflight
} = {}) => {
  if (!isJumpmapResolveBridgeCompareCheckEnabled()) return null;
  if (!playerState || !metrics || !horizontalPreflight) return null;
  if (!hasLegacyFn(getLegacyPhysicsUtils(), 'resolveHorizontal')) {
    return { skipped: true, reason: 'legacy-missing' };
  }
  const obstacles = obstacleContext;
  if (!(obstacles && (Array.isArray(obstacles) || Array.isArray(obstacles?.list)))) return null;

  const args = [
    playerState,
    horizontalPreflight.nextX,
    metrics,
    obstacles,
    horizontalPreflight.horizontalOptions || {}
  ];
  try {
    const bridgeResult = jumpmapResolveHorizontalBridge({
      playerState,
      nextX: horizontalPreflight.nextX,
      metrics,
      obstacles,
      options: horizontalPreflight.horizontalOptions
    });
    const legacyRaw = callLegacy('resolveHorizontal', args) || {};
    const legacyNormalized = {
      x: Number.isFinite(Number(legacyRaw.x)) ? Number(legacyRaw.x) : (Number(horizontalPreflight.nextX) || 0),
      y: Number.isFinite(Number(legacyRaw.y)) ? Number(legacyRaw.y) : (Number(playerState?.y) || 0),
      blocked: !!legacyRaw.blocked,
      stepped: !!legacyRaw.stepped
    };
    const sameX = Math.abs((Number(bridgeResult.x) || 0) - (Number(legacyNormalized.x) || 0)) <= 1e-4;
    const sameY = Math.abs((Number(bridgeResult.y) || 0) - (Number(legacyNormalized.y) || 0)) <= 1e-4;
    const sameBlocked = !!bridgeResult.blocked === !!legacyNormalized.blocked;
    const sameStepped = !!bridgeResult.stepped === !!legacyNormalized.stepped;
    const match = sameX && sameY && sameBlocked && sameStepped;
    if (!match && typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[JumpmapRuntimePhysics] resolveHorizontal bridge compare mismatch', {
        bridgeResult,
        legacyNormalized,
        input: {
          nextX: horizontalPreflight.nextX,
          options: horizontalPreflight.horizontalOptions
        }
      });
    }
    recordResolveBridgeCompareStat({
      axis: 'horizontal',
      match,
      detail: match ? null : {
        bridgeResult,
        legacyNormalized,
        input: {
          nextX: horizontalPreflight.nextX,
          options: horizontalPreflight.horizontalOptions
        }
      }
    });
    return { match, bridgeResult, legacyNormalized };
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[JumpmapRuntimePhysics] resolveHorizontal bridge compare error', error);
    }
    recordResolveBridgeCompareStat({ axis: 'horizontal', error });
    return { error };
  }
};

// Phase stepPlayerState-3q (smoke-check hook):
// Shared extraction of resolveVertical preflight inputs (pre-legacy state, debug-only use for now).
export const buildJumpmapVerticalResolutionPreflight = ({
  playerState,
  dt,
  playerHitboxPolygon
} = {}) => {
  const safeState = playerState && typeof playerState === 'object' ? playerState : null;
  const safeDt = Math.max(0, Number(dt) || 0);
  const currentY = Number(safeState?.y) || 0;
  let nextY = currentY + (Number(safeState?.vy) || 0) * safeDt;
  if (
    safeState?.jumping &&
    Number.isFinite(Number(safeState?.jumpTargetY)) &&
    nextY <= Number(safeState.jumpTargetY)
  ) {
    nextY = Number(safeState.jumpTargetY);
  }
  return {
    nextY,
    verticalOptions: {
      playerHitboxPolygon
    }
  };
};

export const runJumpmapResolveVerticalBridgeSmokeCheck = ({
  playerState,
  metrics,
  obstacleContext,
  verticalPreflight
} = {}) => {
  if (!isJumpmapResolveBridgeSmokeCheckEnabled()) return null;
  if (!playerState || !metrics || !verticalPreflight) return null;
  const obstacles = obstacleContext;
  if (!(obstacles && (Array.isArray(obstacles) || Array.isArray(obstacles?.list)))) return null;
  try {
    return jumpmapResolveVerticalBridge({
      playerState,
      nextY: verticalPreflight.nextY,
      metrics,
      obstacles,
      options: verticalPreflight.verticalOptions
    });
  } catch (error) {
    return { error };
  }
};

// Phase stepPlayerState-3s (smoke-compare hook):
// Optional debug-only comparison between shared resolveVertical bridge output and direct legacy output.
// Disabled by default because it adds extra collision solve calls.
export const runJumpmapResolveVerticalBridgeCompareCheck = ({
  playerState,
  metrics,
  obstacleContext,
  verticalPreflight
} = {}) => {
  if (!isJumpmapResolveBridgeCompareCheckEnabled()) return null;
  if (!playerState || !metrics || !verticalPreflight) return null;
  if (!hasLegacyFn(getLegacyPhysicsUtils(), 'resolveVertical')) {
    return { skipped: true, reason: 'legacy-missing' };
  }
  const obstacles = obstacleContext;
  if (!(obstacles && (Array.isArray(obstacles) || Array.isArray(obstacles?.list)))) return null;

  const args = [
    playerState,
    verticalPreflight.nextY,
    metrics,
    obstacles,
    verticalPreflight.verticalOptions || {}
  ];
  try {
    const bridgeResult = jumpmapResolveVerticalBridge({
      playerState,
      nextY: verticalPreflight.nextY,
      metrics,
      obstacles,
      options: verticalPreflight.verticalOptions
    });
    const legacyRaw = callLegacy('resolveVertical', args) || {};
    const legacyNormalized = {
      y: Number.isFinite(Number(legacyRaw.y)) ? Number(legacyRaw.y) : (Number(verticalPreflight.nextY) || 0),
      landed: !!legacyRaw.landed,
      hitCeiling: !!legacyRaw.hitCeiling
    };
    const sameY = Math.abs((Number(bridgeResult.y) || 0) - (Number(legacyNormalized.y) || 0)) <= 1e-4;
    const sameLanded = !!bridgeResult.landed === !!legacyNormalized.landed;
    const sameHitCeiling = !!bridgeResult.hitCeiling === !!legacyNormalized.hitCeiling;
    const match = sameY && sameLanded && sameHitCeiling;
    if (!match && typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[JumpmapRuntimePhysics] resolveVertical bridge compare mismatch', {
        bridgeResult,
        legacyNormalized,
        input: {
          nextY: verticalPreflight.nextY,
          options: verticalPreflight.verticalOptions
        }
      });
    }
    recordResolveBridgeCompareStat({
      axis: 'vertical',
      match,
      detail: match ? null : {
        bridgeResult,
        legacyNormalized,
        input: {
          nextY: verticalPreflight.nextY,
          options: verticalPreflight.verticalOptions
        }
      }
    });
    return { match, bridgeResult, legacyNormalized };
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[JumpmapRuntimePhysics] resolveVertical bridge compare error', error);
    }
    recordResolveBridgeCompareStat({ axis: 'vertical', error });
    return { error };
  }
};

const runJumpmapStepPlayerStateShared = (firstArg) => {
  if (!firstArg || typeof firstArg !== 'object') return null;
  const playerState = firstArg.playerState;
  const metrics = firstArg.metrics;
  if (!playerState || typeof playerState !== 'object' || !metrics) return null;

  const safeDt = Math.max(0, Number(firstArg.dt) || 0);
  const normalizedPlayerHitboxPolygon = normalizePlayerHitboxPolygon(firstArg.playerHitboxPolygon);
  const preflight = buildJumpmapStepPreflightContext({
    playerState,
    physics: firstArg.physics,
    moveSpeed: firstArg.moveSpeed,
    metrics,
    objects: firstArg.objects,
    obstacles: firstArg.obstacles,
    localPointToWorld: firstArg.localPointToWorld
  });

  applyJumpmapStepInputPreflight({
    playerState,
    moveSpeed: firstArg.moveSpeed,
    inputState: preflight.inputState
  });

  const groundProbePreflight = buildJumpmapGroundProbePreflight({
    playerState,
    inputState: preflight.inputState,
    stepBaseConfig: preflight.stepBaseConfig
  });
  const groundSupportProbeResult = probeJumpmapInitialGroundSupport({
    playerState,
    metrics,
    playerHitboxPolygon: normalizedPlayerHitboxPolygon,
    obstacleContext: preflight.obstacleContext,
    groundProbePreflight
  });
  applyJumpmapInitialGroundSupportState({
    playerState,
    metrics,
    groundSupportProbeResult
  });
  if (!groundSupportProbeResult?.groundedBeforeStep) {
    playerState.onGround = false;
    playerState.coyoteTimer = Math.max(0, (Number(playerState.coyoteTimer) || 0) - safeDt);
  }

  const slopePreflightResult = evaluateJumpmapSlopePreflight({
    playerState,
    metrics,
    physics: firstArg.physics,
    map: firstArg.map,
    playerHitboxPolygon: normalizedPlayerHitboxPolygon,
    obstacleContext: preflight.obstacleContext,
    stepBaseConfig: preflight.stepBaseConfig,
    groundSupportProbeResult
  });
  applyJumpmapForcedSlopeFallState({
    playerState,
    slopePreflightResult
  });
  applyJumpmapSlopeInputMotionControl({
    playerState,
    moveSpeed: firstArg.moveSpeed,
    stepBaseConfig: preflight.stepBaseConfig,
    inputState: preflight.inputState,
    groundSupportProbeResult,
    slopePreflightResult
  });

  const jumpQueueShadow = consumeJumpmapStepJumpQueueShadow({ playerState });
  const jumpPreflightResult = evaluateJumpmapJumpStartPreflight({
    playerState,
    jumpPressedOverride: jumpQueueShadow.jumpPressed,
    metrics,
    playerHitboxPolygon: normalizedPlayerHitboxPolygon,
    obstacleContext: preflight.obstacleContext,
    stepBaseConfig: preflight.stepBaseConfig,
    inputState: preflight.inputState,
    groundSupportProbeResult,
    slopePreflightResult
  });
  applyJumpmapJumpSupportGroundingState({
    playerState,
    metrics,
    jumpPreflightResult
  });
  const jumpStateMutationResult = applyJumpmapJumpStateMutation({
    playerState,
    physics: firstArg.physics,
    jumpPreflightResult
  });
  restoreJumpmapStepJumpQueueShadow({
    playerState,
    shadow: jumpQueueShadow,
    overrideJumpQueued: jumpStateMutationResult.applied ? false : undefined
  });

  applyJumpmapVerticalVelocityMode({
    playerState,
    physics: firstArg.physics
  });

  const horizontalPreflight = buildJumpmapHorizontalResolutionPreflight({
    playerState,
    dt: safeDt,
    playerHitboxPolygon: normalizedPlayerHitboxPolygon,
    obstacleContext: preflight.obstacleContext,
    stepBaseConfig: preflight.stepBaseConfig,
    groundSupportProbeResult,
    slopePreflightResult,
    jumpPreflightResult
  });
  runJumpmapResolveHorizontalBridgeSmokeCheck({
    playerState,
    metrics,
    obstacleContext: preflight.obstacleContext,
    horizontalPreflight
  });
  runJumpmapResolveHorizontalBridgeCompareCheck({
    playerState,
    metrics,
    obstacleContext: preflight.obstacleContext,
    horizontalPreflight
  });

  const resolveHorizontalImpl = typeof firstArg.resolveHorizontalFn === 'function'
    ? firstArg.resolveHorizontalFn
    : resolveHorizontalShared;
  const horizontalRaw = resolveHorizontalImpl(
    playerState,
    horizontalPreflight.nextX,
    metrics,
    preflight.obstacleContext,
    horizontalPreflight.horizontalOptions
  ) || {};
  const horizontalResult = {
    x: Number.isFinite(Number(horizontalRaw.x)) ? Number(horizontalRaw.x) : Number(horizontalPreflight.nextX) || 0,
    y: Number.isFinite(Number(horizontalRaw.y)) ? Number(horizontalRaw.y) : Number(playerState.y) || 0,
    blocked: !!horizontalRaw.blocked,
    stepped: !!horizontalRaw.stepped
  };
  playerState.x = horizontalResult.x;
  if (horizontalResult.stepped) {
    playerState.y = horizontalResult.y;
    playerState.onGround = true;
    playerState.vy = 0;
  } else if (!horizontalResult.blocked && horizontalPreflight.canUseGroundAssist) {
    const slopeFollowTop = findGroundSnapTopY(
      playerState.x,
      playerState.y,
      metrics.width,
      metrics.height,
      preflight.obstacleContext,
      {
        maxUp: preflight.stepBaseConfig.autoStepHeight,
        maxDown: preflight.stepBaseConfig.autoStepHeight,
        direction: playerState.vx,
        sampleSpacing: preflight.stepBaseConfig.groundSampleSpacing,
        playerHitboxPolygon: normalizedPlayerHitboxPolygon,
        maxGroundAngle: preflight.stepBaseConfig.supportMaxGroundAngle
      }
    );
    if (slopeFollowTop != null) {
      playerState.y = slopeFollowTop;
      playerState.onGround = true;
      playerState.vy = 0;
    }
  }
  if (horizontalResult.blocked) {
    playerState.vx = 0;
  }

  const verticalPreflight = buildJumpmapVerticalResolutionPreflight({
    playerState,
    dt: safeDt,
    playerHitboxPolygon: normalizedPlayerHitboxPolygon
  });
  runJumpmapResolveVerticalBridgeSmokeCheck({
    playerState,
    metrics,
    obstacleContext: preflight.obstacleContext,
    verticalPreflight
  });
  runJumpmapResolveVerticalBridgeCompareCheck({
    playerState,
    metrics,
    obstacleContext: preflight.obstacleContext,
    verticalPreflight
  });

  const resolveVerticalImpl = typeof firstArg.resolveVerticalFn === 'function'
    ? firstArg.resolveVerticalFn
    : resolveVerticalShared;
  const verticalRaw = resolveVerticalImpl(
    playerState,
    verticalPreflight.nextY,
    metrics,
    preflight.obstacleContext,
    verticalPreflight.verticalOptions
  ) || {};
  const verticalResult = {
    y: Number.isFinite(Number(verticalRaw.y)) ? Number(verticalRaw.y) : Number(verticalPreflight.nextY) || 0,
    landed: !!verticalRaw.landed,
    hitCeiling: !!verticalRaw.hitCeiling
  };
  playerState.y = verticalResult.y;
  if (verticalResult.hitCeiling) {
    playerState.jumping = false;
    playerState.vy = 0;
  }

  let grounded = !!verticalResult.landed;
  if (verticalResult.landed) {
    playerState.jumpsUsed = 0;
    playerState.jumpedFromGround = false;
    playerState.jumping = false;
    playerState.vy = 0;
    playerState.coyoteTimer = COYOTE_TIME_SEC;
  } else if (!slopePreflightResult?.forcedSlopeFall && !playerState.jumping && (Number(playerState.vy) || 0) >= -EPS) {
    const supportedY = detectGroundSupportShared(
      playerState,
      metrics,
      preflight.obstacleContext,
      {
        maxUp: preflight.stepBaseConfig.autoStepHeight,
        maxDown: preflight.stepBaseConfig.autoStepHeight + 6,
        direction: playerState.vx,
        sampleSpacing: preflight.stepBaseConfig.groundSampleSpacing,
        playerHitboxPolygon: normalizedPlayerHitboxPolygon,
        maxGroundAngle: preflight.stepBaseConfig.supportMaxGroundAngle
      }
    );
    if (supportedY != null) {
      playerState.y = Number(supportedY) - Math.max(1, Number(metrics.height) || 1);
      grounded = true;
      playerState.jumpsUsed = 0;
      playerState.jumpedFromGround = false;
      playerState.jumping = false;
      playerState.vy = 0;
      playerState.coyoteTimer = COYOTE_TIME_SEC;
    }
  }
  playerState.onGround = grounded;
  jumpmapClampPlayerToMapBoundsBridge({
    playerState,
    metrics,
    map: firstArg.map
  });
  return playerState;
};

export const jumpmapStepPlayerState = (...args) => {
  const firstArg = args[0] && typeof args[0] === 'object' ? args[0] : null;
  const legacyStepPlayerStatePresent = hasLegacyFn(getLegacyPhysicsUtils(), 'stepPlayerState');
  const useSharedStep = isJumpmapSharedStepPlayerStateEnabled() || !legacyStepPlayerStatePresent;
  if (useSharedStep) {
    try {
      const sharedResult = runJumpmapStepPlayerStateShared(firstArg);
      if (sharedResult !== null || !legacyStepPlayerStatePresent) return sharedResult;
    } catch (error) {
      if (!legacyStepPlayerStatePresent) throw error;
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[JumpmapRuntimePhysics] shared stepPlayerState failed, falling back to legacy step', error);
      }
    }
  }

  // Intentionally keeps legacy execution while shared step is behind feature flag.
  // Computing these values here keeps compare/apply diagnostics stable during the transition.
  let horizontalBridgeCompareResult = null;
  let verticalBridgeCompareResult = null;
  let sharedPostContext = null;
  if (firstArg) {
    const preflight = buildJumpmapStepPreflightContext({
      playerState: firstArg.playerState,
      physics: firstArg.physics,
      moveSpeed: firstArg.moveSpeed,
      metrics: firstArg.metrics,
      objects: firstArg.objects,
      obstacles: firstArg.obstacles,
      localPointToWorld: firstArg.localPointToWorld
    });
    applyJumpmapStepInputPreflight({
      playerState: firstArg.playerState,
      moveSpeed: firstArg.moveSpeed,
      inputState: preflight.inputState
    });
    const groundProbePreflight = buildJumpmapGroundProbePreflight({
      playerState: firstArg.playerState,
      inputState: preflight.inputState,
      stepBaseConfig: preflight.stepBaseConfig
    });
    const groundSupportProbeResult = probeJumpmapInitialGroundSupport({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      playerHitboxPolygon: firstArg.playerHitboxPolygon,
      obstacleContext: preflight.obstacleContext,
      groundProbePreflight
    });
    applyJumpmapInitialGroundSupportState({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      groundSupportProbeResult
    });
    const slopePreflightResult = evaluateJumpmapSlopePreflight({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      physics: firstArg.physics,
      map: firstArg.map,
      playerHitboxPolygon: firstArg.playerHitboxPolygon,
      obstacleContext: preflight.obstacleContext,
      stepBaseConfig: preflight.stepBaseConfig,
      groundSupportProbeResult
    });
    applyJumpmapForcedSlopeFallState({
      playerState: firstArg.playerState,
      slopePreflightResult
    });
    applyJumpmapSlopeInputMotionControl({
      playerState: firstArg.playerState,
      moveSpeed: firstArg.moveSpeed,
      stepBaseConfig: preflight.stepBaseConfig,
      inputState: preflight.inputState,
      groundSupportProbeResult,
      slopePreflightResult
    });
    const jumpQueueShadow = consumeJumpmapStepJumpQueueShadow({
      playerState: firstArg.playerState
    });
    const jumpPreflightResult = evaluateJumpmapJumpStartPreflight({
      playerState: firstArg.playerState,
      jumpPressedOverride: jumpQueueShadow.jumpPressed,
      metrics: firstArg.metrics,
      playerHitboxPolygon: firstArg.playerHitboxPolygon,
      obstacleContext: preflight.obstacleContext,
      stepBaseConfig: preflight.stepBaseConfig,
      inputState: preflight.inputState,
      groundSupportProbeResult,
      slopePreflightResult
    });
    applyJumpmapJumpSupportGroundingState({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      jumpPreflightResult
    });
    const jumpStateMutationResult = applyJumpmapJumpStateMutation({
      playerState: firstArg.playerState,
      physics: firstArg.physics,
      jumpPreflightResult
    });
    applyJumpmapVerticalVelocityMode({
      playerState: firstArg.playerState,
      physics: firstArg.physics
    });
    const horizontalPreflight = buildJumpmapHorizontalResolutionPreflight({
      playerState: firstArg.playerState,
      dt: firstArg.dt,
      playerHitboxPolygon: firstArg.playerHitboxPolygon,
      obstacleContext: preflight.obstacleContext,
      stepBaseConfig: preflight.stepBaseConfig,
      groundSupportProbeResult,
      slopePreflightResult,
      jumpPreflightResult
    });
    runJumpmapResolveHorizontalBridgeSmokeCheck({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      obstacleContext: preflight.obstacleContext,
      horizontalPreflight
    });
    horizontalBridgeCompareResult = runJumpmapResolveHorizontalBridgeCompareCheck({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      obstacleContext: preflight.obstacleContext,
      horizontalPreflight
    });
    const verticalPreflight = buildJumpmapVerticalResolutionPreflight({
      playerState: firstArg.playerState,
      dt: firstArg.dt,
      playerHitboxPolygon: firstArg.playerHitboxPolygon
    });
    runJumpmapResolveVerticalBridgeSmokeCheck({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      obstacleContext: preflight.obstacleContext,
      verticalPreflight
    });
    verticalBridgeCompareResult = runJumpmapResolveVerticalBridgeCompareCheck({
      playerState: firstArg.playerState,
      metrics: firstArg.metrics,
      obstacleContext: preflight.obstacleContext,
      verticalPreflight
    });
    restoreJumpmapStepJumpQueueShadow({
      playerState: firstArg.playerState,
      shadow: jumpQueueShadow,
      overrideJumpQueued: jumpStateMutationResult.applied ? false : undefined
    });
    sharedPostContext = {
      obstacleContext: preflight.obstacleContext,
      stepBaseConfig: preflight.stepBaseConfig,
      slopePreflightResult,
      metrics: firstArg.metrics,
      playerHitboxPolygon: firstArg.playerHitboxPolygon
    };
  }
  const compareEnabled = isJumpmapResolveBridgeCompareCheckEnabled();
  const applyHorizontalBridge = canApplyJumpmapResolveBridgeWithCompareGate({
    axis: 'resolveHorizontal',
    applyEnabled: !!firstArg && isJumpmapResolveHorizontalBridgeApplyEnabled(),
    compareEnabled,
    compareResult: horizontalBridgeCompareResult
  });
  const applyVerticalBridge = canApplyJumpmapResolveBridgeWithCompareGate({
    axis: 'resolveVertical',
    applyEnabled: !!firstArg && isJumpmapResolveVerticalBridgeApplyEnabled(),
    compareEnabled,
    compareResult: verticalBridgeCompareResult
  });
  if (applyHorizontalBridge || applyVerticalBridge) {
    let injectedHorizontalResult = null;
    let injectedVerticalResult = null;
    const injectedResolveHorizontalFn = (playerState, nextX, metrics, obstacles, options) => {
      const result = jumpmapResolveHorizontalBridge({
        playerState,
        nextX,
        metrics,
        obstacles,
        options
      });
      injectedHorizontalResult = result;
      return result;
    };
    const injectedResolveVerticalFn = (playerState, nextY, metrics, obstacles, options) => {
      const result = jumpmapResolveVerticalBridge({
        playerState,
        nextY,
        metrics,
        obstacles,
        options
      });
      injectedVerticalResult = result;
      return result;
    };
    const legacyArgs = args.slice();
    legacyArgs[0] = {
      ...firstArg,
      ...(applyHorizontalBridge ? { resolveHorizontalFn: injectedResolveHorizontalFn } : {}),
      ...(applyVerticalBridge ? { resolveVerticalFn: injectedResolveVerticalFn } : {})
    };
    const legacyResult = callLegacy('stepPlayerState', legacyArgs);
    if (applyHorizontalBridge && firstArg?.playerState && injectedHorizontalResult) {
      applyJumpmapHorizontalCollisionPostState({
        playerState: firstArg.playerState,
        horizontalResult: injectedHorizontalResult
      });
    }
    if (applyVerticalBridge && firstArg?.playerState && injectedVerticalResult) {
      applyJumpmapVerticalCollisionPostState({
        playerState: firstArg.playerState,
        verticalResult: injectedVerticalResult
      });
      if (sharedPostContext) {
        applyJumpmapFinalGroundSupportSnapPostState({
          playerState: firstArg.playerState,
          metrics: sharedPostContext.metrics,
          obstacleContext: sharedPostContext.obstacleContext,
          playerHitboxPolygon: sharedPostContext.playerHitboxPolygon,
          stepBaseConfig: sharedPostContext.stepBaseConfig,
          slopePreflightResult: sharedPostContext.slopePreflightResult,
          verticalResult: injectedVerticalResult
        });
      }
      if (sharedPostContext?.metrics && firstArg?.map) {
        jumpmapClampPlayerToMapBoundsBridge({
          playerState: firstArg.playerState,
          metrics: sharedPostContext.metrics,
          map: firstArg.map
        });
      }
    }
    return legacyResult;
  }
  return callLegacy('stepPlayerState', args);
};

export const JumpmapRuntimePhysics = {
  createPlayerState: jumpmapCreatePlayerState,
  collectObstacleBounds: jumpmapCollectObstacleBounds,
  resolveHorizontal: jumpmapResolveHorizontalBridge,
  resolveVertical: jumpmapResolveVerticalBridge,
  clampPlayerToMapBounds: jumpmapClampPlayerToMapBoundsBridge,
  stepPlayerState: jumpmapStepPlayerState
};

export const getJumpmapRuntimePhysicsBridgeStatus = () => {
  const legacy = getLegacyPhysicsUtils();
  const resolveHorizontal = hasLegacyFn(legacy, 'resolveHorizontal');
  const resolveVertical = hasLegacyFn(legacy, 'resolveVertical');
  const legacyStepPlayerState = hasLegacyFn(legacy, 'stepPlayerState');
  const sharedStepPlayerState = true;
  const stepPlayerStateUsesShared = isJumpmapSharedStepPlayerStateEnabled() || !legacyStepPlayerState;
  return {
    sharedBridgePresent: true,
    legacyPresent: !!legacy,
    createPlayerState: true,
    createPlayerStateSource: 'shared',
    collectObstacleBounds: true,
    collectObstacleBoundsSource: 'shared',
    resolveHorizontalBridge: true,
    resolveHorizontalBridgeSource: 'shared',
    resolveVerticalBridge: true,
    resolveVerticalBridgeSource: 'shared',
    legacyResolveHorizontalPresent: resolveHorizontal,
    legacyResolveVerticalPresent: resolveVertical,
    clampPlayerToMapBoundsBridge: true,
    clampPlayerToMapBoundsBridgeSource: 'shared',
    stepPlayerState: sharedStepPlayerState || legacyStepPlayerState,
    sharedStepPlayerStatePresent: sharedStepPlayerState,
    legacyStepPlayerStatePresent: legacyStepPlayerState,
    stepPlayerStateSource: stepPlayerStateUsesShared
      ? 'shared'
      : (legacyStepPlayerState ? 'legacy' : 'none'),
    stepPlayerStateMigrationStage: 'shared-preflight-config+input+obstacles+input-apply+initial-ground-probe+grounded-apply+slope-preflight+slope-fall-apply+vx-control+jump-preflight+jump-queue-shadow+jump-support-grounding+jump-state-apply+vy-mode-apply+horizontal-preflight+resolve-horizontal-bridge(shared)+resolve-vertical-bridge(shared)+clamp-bridge(shared)+resolve-horizontal-smokecheck-hook+resolve-horizontal-comparecheck-hook+resolve-vertical-smokecheck-hook+resolve-vertical-comparecheck-hook+resolve-horizontal-apply-hook+resolve-vertical-apply-hook+resolve-apply-compare-gate+horizontal-post-state-safe-apply+vertical-post-state-safe-apply+final-ground-snap-post-safe-apply+clamp-post-safe-apply+shared-step-runtime-path(flag)+legacy-fallback-on-error'
  };
};

export const isJumpmapRuntimePhysicsBridgeReady = () => {
  const status = getJumpmapRuntimePhysicsBridgeStatus();
  return !!(status.createPlayerState && status.collectObstacleBounds && status.stepPlayerState);
};
