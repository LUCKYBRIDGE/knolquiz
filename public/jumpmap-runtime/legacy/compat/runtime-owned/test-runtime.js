(function initJumpmapTestRuntime() {
  const create = (deps) => {
    const {
      state,
      els,
      assets,
      hooks,
      geometry,
      integration: integrationBridge = null
    } = deps;
    const integration = integrationBridge && typeof integrationBridge.emit === 'function'
      ? integrationBridge
      : { emit: () => {} };
    const { plateBase, sejongBase, SPRITES, characterSets } = assets;
    const DEFAULT_CHARACTER_ID = 'sejong';
    const CHARACTER_SETS = (() => {
      const baseMap = (characterSets && typeof characterSets === 'object') ? characterSets : {};
      const fallbackSprites = {
        idle: SPRITES.idle,
        walk: Array.isArray(SPRITES.walk) ? SPRITES.walk.slice(0) : [],
        jump: SPRITES.jump,
        fall: SPRITES.fall,
        hurt: SPRITES.hurt
      };
      const fallbackSet = {
        id: DEFAULT_CHARACTER_ID,
        base: sejongBase,
        sprites: fallbackSprites
      };
      const normalized = {};
      Object.entries(baseMap).forEach(([id, raw]) => {
        if (!id || !raw || typeof raw !== 'object') return;
        const base = typeof raw.base === 'string' && raw.base.trim() ? raw.base.trim() : sejongBase;
        const spritesRaw = raw.sprites && typeof raw.sprites === 'object' ? raw.sprites : {};
        const walk = Array.isArray(spritesRaw.walk)
          ? spritesRaw.walk.map((name) => String(name || '').trim()).filter(Boolean)
          : [];
        const sprites = {
          idle: String(spritesRaw.idle || fallbackSprites.idle || '').trim(),
          walk: walk.length ? walk : fallbackSprites.walk.slice(0),
          jump: String(spritesRaw.jump || fallbackSprites.jump || '').trim(),
          fall: String(spritesRaw.fall || fallbackSprites.fall || '').trim(),
          hurt: String(spritesRaw.hurt || fallbackSprites.hurt || '').trim()
        };
        if (!sprites.idle || !sprites.jump || !sprites.fall || !sprites.walk.length) return;
        normalized[id] = { id, base, sprites };
      });
      if (!normalized[DEFAULT_CHARACTER_ID]) normalized[DEFAULT_CHARACTER_ID] = fallbackSet;
      return normalized;
    })();
    const normalizeCharacterId = (raw, fallback = DEFAULT_CHARACTER_ID) => {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (id && CHARACTER_SETS[id]) return id;
      const fallbackId = typeof fallback === 'string' ? fallback.trim() : '';
      if (fallbackId && CHARACTER_SETS[fallbackId]) return fallbackId;
      return DEFAULT_CHARACTER_ID;
    };
    const getCharacterSetById = (characterId) => CHARACTER_SETS[normalizeCharacterId(characterId)] || CHARACTER_SETS[DEFAULT_CHARACTER_ID];
    const getPlayerCharacterId = (playerIndex) => {
      const index = Math.max(0, Math.round(Number(playerIndex) || 0));
      const rawList = Array.isArray(state?.test?.playerCharacterIds) ? state.test.playerCharacterIds : [];
      const fromPlayer = rawList[index];
      if (typeof fromPlayer === 'string' && fromPlayer.trim()) return normalizeCharacterId(fromPlayer, state?.test?.characterId);
      return normalizeCharacterId(state?.test?.characterId, DEFAULT_CHARACTER_ID);
    };
    const getPlayerCharacterSet = (playerIndex) => getCharacterSetById(getPlayerCharacterId(playerIndex));
    const TEXTURE_OBJECT_PREFIX = '__texture__:';
    const textureBase = './textures/';
    const DEFAULT_SOLID_TEXTURE_COLOR = '#c3b18b';
    const TEXTURE_OBJECT_TYPES = ['hanji', 'stone', 'ice', 'solid'];
    const LEGACY_TEXTURE_TYPE_ALIAS = {
      'paper-fiber': 'hanji',
      'paper-speckle': 'hanji',
      parchment: 'hanji',
      'hanji-warm': 'hanji',
      'hanji-cool': 'hanji',
      'linen-weave': 'hanji',
      'ink-wash': 'hanji',
      'stone-grain': 'stone',
      'stone-block': 'stone',
      'plate-stone2': 'stone',
      'ice-frost': 'ice',
      'ice-crack': 'ice',
      'plate-ice': 'ice'
    };
    const textureSourceMap = {
      hanji: `${textureBase}hanji.svg`,
      stone: `${plateBase}plate_stone2.png`,
      ice: `${plateBase}plate_ice.png`
    };
    const normalizeTextureType = (name) => {
      if (!name || typeof name !== 'string') return 'hanji';
      if (TEXTURE_OBJECT_TYPES.includes(name)) return name;
      return LEGACY_TEXTURE_TYPE_ALIAS[name] || 'hanji';
    };
    const normalizeHexColor = (value, fallback = DEFAULT_SOLID_TEXTURE_COLOR) => {
      if (typeof value !== 'string') return fallback;
      const trimmed = value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
      if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        const r = trimmed[1];
        const g = trimmed[2];
        const b = trimmed[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
      }
      return fallback;
    };
    const isTextureSprite = (sprite) =>
      typeof sprite === 'string' && sprite.startsWith(TEXTURE_OBJECT_PREFIX);
    const getTextureTypeFromSprite = (sprite) => {
      if (!isTextureSprite(sprite)) return null;
      const raw = sprite.slice(TEXTURE_OBJECT_PREFIX.length);
      return normalizeTextureType(raw || 'hanji');
    };
    const getTextureFillStyle = (type, textureColor = DEFAULT_SOLID_TEXTURE_COLOR) => {
      const normalizedType = normalizeTextureType(type);
      if (normalizedType === 'solid') {
        return {
          image: 'none',
          color: normalizeHexColor(textureColor),
          size: 'auto',
          repeat: 'no-repeat'
        };
      }
      return {
        image: `url(${textureSourceMap[normalizedType] || textureSourceMap.hanji})`,
        color: 'transparent',
        size: '128px 128px',
        repeat: 'repeat'
      };
    };
    const {
      getBackgroundLayers,
      applyPlayerSpriteToElement,
      getPlayerSpriteRender,
      getPlayerMetrics,
      getPlayerHitboxOffset,
      getPlayerHitboxPolygon,
      ensureStartPoint
    } = hooks;
    const { worldPointToLocal, localPointToWorld } = geometry;
    const {
      createPlayerState,
      getSpawnPosition: computeSpawnPosition,
      collectObstacleBounds,
      detectGroundSupport,
      stepPlayerState,
      computeCameraPosition
    } = window.JumpmapTestPhysicsUtils;

    let rafId = null;
    let obstacleCache = null;
    const backgroundLayerStyleCache = new WeakMap();
    const contextMenuSuppressedTargets = new WeakSet();
    const keyboardState = { left: false, right: false };
    let editorRuntimeAssetBaseHrefCache = '';
    const PLAYER_NAME_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];
    const BACKGROUND_PARALLAX_X = 0.03;
    const BACKGROUND_PARALLAX_Y = 0.08;
    const QUIZ_DELAY_POLL_MS = 100;
    const QUIZ_REQUEST_TIMEOUT_MS = 10000;
    const QUIZ_GAUGE_DISPLAY_CAP = 100;
    const QUIZ_GAUGE_START_AMOUNT = 100;
    const QUIZ_GAUGE_PX_PER_UNIT = 1.6;
    const TEST_START_GUIDE_MS = 0;
    const WALK_FRAME_INTERVAL_SEC = 0.12;
    const PLAY_FALLBACK_BG_COLOR = '#d9d3c4';
    const RUNTIME_MOVE_SPEED_SCALE = 0.9;
    const RUNTIME_AIRTIME_SCALE = 1.1;
    const RUNTIME_VERTICAL_SPEED_SCALE = 1 / RUNTIME_AIRTIME_SCALE;
    const BACKGROUND_POSITION_PRECISION_DIGITS = 0;
    const HEIGHT_PX_PER_METER = 200;
    const TOP_GOAL_CONTACT_EPSILON_PX = 2;
    const PLAY_READY_MESSAGE_SOURCE = 'jumpmap-runtime-play';
    const QUIZ_DEFAULT_SETTINGS = {
      timeLimitSec: 30,
      questionCount: 30,
      quizEndMode: 'time',
      quizTimeLimitSec: 0,
      loopQuestions: true,
      selectionMode: 'random',
      avoidRepeat: true,
      shuffleChoices: true,
      score: {
        base: 10,
        penalty: 0,
        comboEnabled: false,
        comboBonus: 0,
        timeBonusEnabled: false,
        timeBonusPerSec: 0,
        timeBonusMaxRatio: 0
      },
      questionTypes: {
        cube_facecolor: { enabled: true, count: 5 },
        cube_edgecolor: { enabled: true, count: 5 },
        cube_validity: { enabled: true, count: 5 },
        cuboid_facecolor: { enabled: true, count: 5 },
        cuboid_edgecolor: { enabled: true, count: 5 },
        cuboid_validity: { enabled: true, count: 5 }
      }
    };
    const LAUNCHER_SETUP_STORAGE_KEY = 'jumpmap.launcher.setup.v1';
    const VIRTUAL_CONTROLS_LAYOUT_KEY = 'jumpmap.test.controls.layout.v1';
    const PREVIOUS_DEFAULT_VIRTUAL_CONTROLS_LAYOUT = Object.freeze({
      dpad: { x: 0.012, y: 0.02, scale: 1.0 },
      jump: { x: 0.112, y: 0.02, scale: 1.0 },
      quiz: { x: 0.79, y: 0.02, scale: 1.0 }
    });
    const DEFAULT_VIRTUAL_CONTROLS_LAYOUT = Object.freeze({
      dpad: { x: 0.012, y: 0.02, scale: 1.0 },
      jump: { x: 0.84, y: 0.02, scale: 1.0 },
      quiz: { x: 0.78, y: 0.2, scale: 1.0 }
    });
    const LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT = Object.freeze({
      dpad: { x: 0.008, y: 0.02, scale: 1.0 },
      jump: { x: 0.06, y: 0.02, scale: 1.0 }
    });
    const quizRuntimeState = {
      resourcesPromise: null,
      resources: null,
      gatewayInstalled: false,
      sessions: new Map(),
      launcherCsvCache: {
        source: '',
        fileName: '',
        bank: null,
        message: '',
        loaded: false
      }
    };
    const recordRuntimeState = {
      modulePromise: null,
      sessionSeq: 0,
      activeSessionSeq: 0,
      sessionStartedAt: 0,
      savedSessionSeqs: new Set()
    };
    const jumpmapGoalState = {
      reached: false,
      winnerIndex: -1,
      mode: 'none',
      quizCountLimit: 20,
      quizTimeLimitSec: 300,
      topObstacleRef: null,
      topObstacle: null
    };
    const spriteWarmupState = {
      ready: false,
      promise: null
    };
    const sceneWarmupState = {
      ready: false,
      promise: null
    };
    const createRuntimeSfx = () => {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') {
        return {
          playQuizResult: () => {},
          playJump: () => {}
        };
      }
      let audioCtx = null;
      let masterNode = null;
      const ensureAudio = () => {
        if (!audioCtx) audioCtx = new AudioContextCtor();
        if (!masterNode) {
          masterNode = audioCtx.createGain();
          masterNode.gain.value = 0.11;
          masterNode.connect(audioCtx.destination);
        }
        return { audioCtx, masterNode };
      };
      const unlock = () => {
        const { audioCtx: ctx } = ensureAudio();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      };
      document.addEventListener('pointerdown', unlock, { passive: true, capture: true, once: true });
      document.addEventListener('keydown', unlock, { capture: true, once: true });

      const playPattern = (notes = []) => {
        const { audioCtx: ctx, masterNode: master } = ensureAudio();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const startAt = ctx.currentTime + 0.004;
        notes.forEach((note) => {
          const when = startAt + Math.max(0, Number(note?.t) || 0);
          const duration = Math.max(0.02, Number(note?.d) || 0.08);
          const frequency = Math.max(80, Number(note?.f) || 440);
          const gain = Math.max(0.01, Number(note?.g) || 0.09);
          const wave = typeof note?.w === 'string' ? note.w : 'triangle';
          const glide = Number(note?.glide) || 0;
          const osc = ctx.createOscillator();
          const amp = ctx.createGain();
          osc.type = wave;
          osc.frequency.setValueAtTime(frequency, when);
          if (glide) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(60, frequency + glide), when + duration);
          }
          amp.gain.setValueAtTime(0.0001, when);
          amp.gain.exponentialRampToValueAtTime(gain, when + 0.006);
          amp.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.07);
          osc.connect(amp);
          amp.connect(master);
          osc.start(when);
          osc.stop(when + duration + 0.09);
        });
      };

      return {
        playQuizResult: (correct) => {
          if (correct) {
            playPattern([
              { t: 0, f: 820, d: 0.06, w: 'triangle', g: 0.12, glide: 45 },
              { t: 0.06, f: 1200, d: 0.08, w: 'triangle', g: 0.13, glide: 65 }
            ]);
            return;
          }
          playPattern([
            { t: 0, f: 320, d: 0.08, w: 'square', g: 0.11, glide: -70 },
            { t: 0.08, f: 210, d: 0.12, w: 'sawtooth', g: 0.09, glide: -50 }
          ]);
        },
        playJump: (isDouble = false) => {
          if (isDouble) {
            playPattern([
              { t: 0, f: 560, d: 0.05, w: 'square', g: 0.1, glide: 120 },
              { t: 0.04, f: 860, d: 0.06, w: 'triangle', g: 0.08, glide: 80 }
            ]);
            return;
          }
          playPattern([
            { t: 0, f: 500, d: 0.045, w: 'square', g: 0.09, glide: 90 },
            { t: 0.035, f: 720, d: 0.055, w: 'triangle', g: 0.075, glide: 70 }
          ]);
        }
      };
    };
    const runtimeSfx = createRuntimeSfx();
    const getPlayerSpriteUrlsForWarmup = () => {
      const urls = new Set();
      Object.values(CHARACTER_SETS).forEach((set) => {
        if (!set || typeof set !== 'object') return;
        const base = typeof set.base === 'string' ? set.base : sejongBase;
        const sprites = set.sprites && typeof set.sprites === 'object' ? set.sprites : SPRITES;
        const keys = [
          sprites.idle,
          sprites.jump,
          sprites.fall,
          sprites.hurt,
          ...(Array.isArray(sprites.walk) ? sprites.walk : [])
        ].filter((key) => typeof key === 'string' && key.trim());
        keys.forEach((key) => urls.add(`${base}${key}`));
      });
      return [...urls];
    };
    const warmupPlayerSprites = () => {
      if (spriteWarmupState.promise) return spriteWarmupState.promise;
      const urls = getPlayerSpriteUrlsForWarmup();
      if (!urls.length || typeof Image !== 'function') {
        spriteWarmupState.ready = true;
        spriteWarmupState.promise = Promise.resolve();
        return spriteWarmupState.promise;
      }
      const loadOne = (src) => new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.onload = done;
        img.onerror = done;
        img.src = src;
        if (typeof img.decode === 'function') {
          img.decode().then(done).catch(done);
        }
      });
      spriteWarmupState.promise = Promise.all(urls.map((src) => loadOne(src)))
        .catch(() => {})
        .then(() => {
          spriteWarmupState.ready = true;
        });
      return spriteWarmupState.promise;
    };
    const parseCssBackgroundUrls = (cssValue) => {
      if (typeof cssValue !== 'string' || !cssValue.trim()) return [];
      const urls = [];
      const regex = /url\((['"]?)(.*?)\1\)/g;
      let match = regex.exec(cssValue);
      while (match) {
        const url = (match[2] || '').trim();
        if (url) urls.push(url);
        match = regex.exec(cssValue);
      }
      return urls;
    };
    const collectRuntimeSceneAssetUrls = (views = getViews()) => {
      const firstView = Array.isArray(views) && views.length ? views[0] : null;
      if (!firstView) return [];
      const urls = new Set();
      const pushUrl = (raw) => {
        if (typeof raw !== 'string') return;
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('data:')) return;
        try {
          urls.add(new URL(trimmed, document.baseURI).toString());
        } catch (_error) {
          urls.add(trimmed);
        }
      };
      if (firstView.world) {
        firstView.world.querySelectorAll('img[src]').forEach((img) => {
          pushUrl(img.getAttribute('src') || img.src || '');
        });
      }
      const bgCss = firstView.bgLayer?.style?.backgroundImage || '';
      parseCssBackgroundUrls(bgCss).forEach(pushUrl);
      return [...urls];
    };
    const warmupRuntimeSceneAssets = (views = getViews()) => {
      if (sceneWarmupState.promise) return sceneWarmupState.promise;
      const urls = collectRuntimeSceneAssetUrls(views);
      if (!urls.length || typeof Image !== 'function') {
        sceneWarmupState.ready = true;
        sceneWarmupState.promise = Promise.resolve();
        return sceneWarmupState.promise;
      }
      const loadOne = (src) => new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.onload = done;
        img.onerror = done;
        img.src = src;
        if (typeof img.decode === 'function') {
          img.decode().then(done).catch(done);
        }
      });
      sceneWarmupState.promise = Promise.all(urls.map((src) => loadOne(src)))
        .catch(() => {})
        .then(() => {
          sceneWarmupState.ready = true;
        });
      return sceneWarmupState.promise;
    };
    const isStartGuideBlocking = (playerView, now = Date.now()) => {
      const guideUntil = Number(playerView?.startGuideUntil) || 0;
      const inCountdown = guideUntil > 0 && now <= guideUntil;
      return inCountdown || !spriteWarmupState.ready;
    };
    warmupPlayerSprites();
    const postPlayReadyMessage = (phase, extra = {}) => {
      try {
        if (!window?.parent || window.parent === window) return;
        window.parent.postMessage(
          {
            source: PLAY_READY_MESSAGE_SOURCE,
            phase,
            ...extra
          },
          '*'
        );
      } catch (_error) {
        // no-op
      }
    };
    const postRuntimeReadyWhenPrepared = (extra = {}) => {
      const emit = () => {
        postPlayReadyMessage('runtime-ready', {
          players: state.test.players,
          at: Date.now(),
          ...extra
        });
      };
      if (spriteWarmupState.ready && sceneWarmupState.ready) {
        emit();
        return;
      }
      Promise.all([
        warmupPlayerSprites(),
        warmupRuntimeSceneAssets(getViews())
      ]).finally(emit);
    };
    const getEditorRuntimeAssetBaseHref = () => {
      if (editorRuntimeAssetBaseHrefCache) return editorRuntimeAssetBaseHrefCache;
      const explicitBase = typeof window.__JUMPMAP_EDITOR_RUNTIME_BASE_HREF__ === 'string'
        ? window.__JUMPMAP_EDITOR_RUNTIME_BASE_HREF__.trim()
        : '';
      if (explicitBase) {
        try {
          editorRuntimeAssetBaseHrefCache = new URL(explicitBase, document.baseURI).toString();
          return editorRuntimeAssetBaseHrefCache;
        } catch (_error) {
          // fall through to script src discovery
        }
      }
      const scripts = Array.from(document.scripts || []);
      for (let i = scripts.length - 1; i >= 0; i -= 1) {
        const src = typeof scripts[i]?.src === 'string' ? scripts[i].src : '';
        if (!src) continue;
        if (!/\/test-runtime\.js(?:[?#].*)?$/i.test(src)) continue;
        try {
          editorRuntimeAssetBaseHrefCache = new URL('./', src).toString();
          return editorRuntimeAssetBaseHrefCache;
        } catch (_error) {
          // continue
        }
      }
      try {
        editorRuntimeAssetBaseHrefCache = new URL('./', document.baseURI).toString();
      } catch (_error) {
        editorRuntimeAssetBaseHrefCache = document.baseURI || '';
      }
      return editorRuntimeAssetBaseHrefCache;
    };
    const resolveEditorRuntimeAssetUrl = (relativePath) => (
      new URL(relativePath, getEditorRuntimeAssetBaseHref()).href
    );
    const launcherSetupCache = {
      loaded: false,
      value: null
    };
    const cloneVirtualControlsLayout = (layout) => ({
      dpad: {
        x: Number(layout?.dpad?.x),
        y: Number(layout?.dpad?.y),
        scale: Number(layout?.dpad?.scale)
      },
      jump: {
        x: Number(layout?.jump?.x),
        y: Number(layout?.jump?.y),
        scale: Number(layout?.jump?.scale)
      },
      quiz: {
        x: Number(layout?.quiz?.x),
        y: Number(layout?.quiz?.y),
        scale: Number(layout?.quiz?.scale)
      }
    });
    const clampVirtualControlPos = (value, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(0.9, n));
    };
    const clampVirtualControlScale = (value, fallback = 1) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0.65, Math.min(2.6, n));
    };
    const ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX = Object.freeze({
      dpad: Object.freeze({ width: 132, height: 64 }),
      jump: Object.freeze({ width: 88, height: 88 }),
      quiz: Object.freeze({ width: 144, height: 70 })
    });
    const VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX = 8;
    const VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX = 12;
    const getVirtualControlViewportSize = () => {
      const width = Math.max(280, Number(window?.innerWidth) || 900);
      const height = Math.max(220, Number(window?.innerHeight) || 600);
      return { width, height };
    };
    const clampVirtualControlPosBySize = (value, fallback, boxSizePx, viewportSizePx) => {
      const normalized = clampVirtualControlPos(value, fallback);
      const size = Math.max(1, Number(boxSizePx) || 1);
      const viewport = Math.max(1, Number(viewportSizePx) || 1);
      const maxNormalized = Math.max(
        0,
        Math.min(0.9, (viewport - size - VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) / viewport)
      );
      return Math.max(0, Math.min(maxNormalized, normalized));
    };
    const buildVirtualControlRectPx = (conf, baseSize, viewport) => {
      const scale = clampVirtualControlScale(conf?.scale, 1);
      const width = Math.max(1, (Number(baseSize?.width) || 1) * scale);
      const height = Math.max(1, (Number(baseSize?.height) || 1) * scale);
      const left = clampVirtualControlPosBySize(conf?.x, 0, width, viewport.width) * viewport.width;
      const bottom = clampVirtualControlPosBySize(conf?.y, 0, height, viewport.height) * viewport.height;
      return {
        left,
        bottom,
        right: left + width,
        top: bottom + height,
        width,
        height
      };
    };
    const rectsOverlapWithGap = (a, b, minGapPx = VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX) => !(
      (a.right + minGapPx) <= b.left ||
      (b.right + minGapPx) <= a.left ||
      (a.top + minGapPx) <= b.bottom ||
      (b.top + minGapPx) <= a.bottom
    );
    const resolveVirtualControlsLayoutSeparation = (layout, options = {}) => {
      const viewport = {
        width: Math.max(280, Number(options.viewportWidth) || getVirtualControlViewportSize().width),
        height: Math.max(220, Number(options.viewportHeight) || getVirtualControlViewportSize().height)
      };
      const baseSizes = {
        dpad: {
          width: Math.max(1, Number(options.dpadSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.dpad.width),
          height: Math.max(1, Number(options.dpadSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.dpad.height)
        },
        jump: {
          width: Math.max(1, Number(options.jumpSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.jump.width),
          height: Math.max(1, Number(options.jumpSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.jump.height)
        },
        quiz: {
          width: Math.max(1, Number(options.quizSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.quiz.width),
          height: Math.max(1, Number(options.quizSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.quiz.height)
        }
      };
      const result = cloneVirtualControlsLayout(layout);
      result.dpad.scale = clampVirtualControlScale(result.dpad.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.scale);
      result.jump.scale = clampVirtualControlScale(result.jump.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.scale);
      result.quiz.scale = clampVirtualControlScale(result.quiz.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.scale);
      const clampConf = (key) => {
        const size = baseSizes[key];
        const conf = result[key];
        conf.x = clampVirtualControlPosBySize(conf.x, DEFAULT_VIRTUAL_CONTROLS_LAYOUT[key].x, size.width * conf.scale, viewport.width);
        conf.y = clampVirtualControlPosBySize(conf.y, DEFAULT_VIRTUAL_CONTROLS_LAYOUT[key].y, size.height * conf.scale, viewport.height);
      };
      clampConf('dpad');
      clampConf('jump');
      clampConf('quiz');
      const toRects = () => ({
        dpad: buildVirtualControlRectPx(result.dpad, baseSizes.dpad, viewport),
        jump: buildVirtualControlRectPx(result.jump, baseSizes.jump, viewport),
        quiz: buildVirtualControlRectPx(result.quiz, baseSizes.quiz, viewport)
      });
      let rects = toRects();
      const controlsOverlap = () => (
        rectsOverlapWithGap(rects.dpad, rects.jump) ||
        rectsOverlapWithGap(rects.dpad, rects.quiz) ||
        rectsOverlapWithGap(rects.jump, rects.quiz)
      );
      if (!controlsOverlap()) return result;

      const jumpRightCandidateLeft = rects.dpad.right + VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX;
      if ((jumpRightCandidateLeft + rects.jump.width + VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) <= viewport.width) {
        result.jump.x = clampVirtualControlPosBySize(
          jumpRightCandidateLeft / viewport.width,
          result.jump.x,
          rects.jump.width,
          viewport.width
        );
        rects = toRects();
      }
      if (!rectsOverlapWithGap(rects.dpad, rects.jump) && !controlsOverlap()) return result;

      const jumpAboveCandidateBottom = rects.dpad.top + VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX;
      if ((jumpAboveCandidateBottom + rects.jump.height + VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) <= viewport.height) {
        result.jump.y = clampVirtualControlPosBySize(
          jumpAboveCandidateBottom / viewport.height,
          result.jump.y,
          rects.jump.height,
          viewport.height
        );
        rects = toRects();
      }
      if (!rectsOverlapWithGap(rects.dpad, rects.jump) && !controlsOverlap()) return result;

      // Final fallback: force split placement near left/right edges while preserving vertical intent.
      result.dpad.x = clampVirtualControlPosBySize(
        VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX / viewport.width,
        DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.x,
        rects.dpad.width,
        viewport.width
      );
      result.jump.x = clampVirtualControlPosBySize(
        (viewport.width - rects.jump.width - VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) / viewport.width,
        DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.x,
        rects.jump.width,
        viewport.width
      );
      rects = toRects();
      if (!controlsOverlap()) return result;

      // Keep quiz control near the bottom-right by default and nudge upward only if needed.
      result.quiz.x = clampVirtualControlPosBySize(
        (viewport.width - rects.quiz.width - VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) / viewport.width,
        DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.x,
        rects.quiz.width,
        viewport.width
      );
      rects = toRects();
      if (!rectsOverlapWithGap(rects.quiz, rects.jump) && !rectsOverlapWithGap(rects.quiz, rects.dpad)) return result;

      const quizAboveControlsBottom = Math.max(rects.dpad.top, rects.jump.top) + VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX;
      if ((quizAboveControlsBottom + rects.quiz.height + VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) <= viewport.height) {
        result.quiz.y = clampVirtualControlPosBySize(
          quizAboveControlsBottom / viewport.height,
          result.quiz.y,
          rects.quiz.height,
          viewport.height
        );
        rects = toRects();
      }
      if (!rectsOverlapWithGap(rects.quiz, rects.jump) && !rectsOverlapWithGap(rects.quiz, rects.dpad)) return result;

      // Last resort: pin quiz higher on the right edge.
      result.quiz.x = clampVirtualControlPosBySize(
        (viewport.width - rects.quiz.width - VIRTUAL_CONTROL_LAYOUT_EDGE_PADDING_PX) / viewport.width,
        result.quiz.x,
        rects.quiz.width,
        viewport.width
      );
      result.quiz.y = clampVirtualControlPosBySize(
        0.18,
        DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.y,
        rects.quiz.height,
        viewport.height
      );
      return result;
    };
    const normalizeVirtualControlsLayoutBasic = (layout, options = {}) => {
      const viewportWidth = Math.max(280, Number(options.viewportWidth) || getVirtualControlViewportSize().width);
      const viewportHeight = Math.max(220, Number(options.viewportHeight) || getVirtualControlViewportSize().height);
      const dpadScale = clampVirtualControlScale(layout?.dpad?.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.scale);
      const jumpScale = clampVirtualControlScale(layout?.jump?.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.scale);
      const quizScale = clampVirtualControlScale(layout?.quiz?.scale, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.scale);
      const dpadWidth = Math.max(
        1,
        (Number(options.dpadSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.dpad.width) * dpadScale
      );
      const dpadHeight = Math.max(
        1,
        (Number(options.dpadSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.dpad.height) * dpadScale
      );
      const jumpWidth = Math.max(
        1,
        (Number(options.jumpSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.jump.width) * jumpScale
      );
      const jumpHeight = Math.max(
        1,
        (Number(options.jumpSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.jump.height) * jumpScale
      );
      const quizWidth = Math.max(
        1,
        (Number(options.quizSizePx?.width) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.quiz.width) * quizScale
      );
      const quizHeight = Math.max(
        1,
        (Number(options.quizSizePx?.height) || ESTIMATED_VIRTUAL_CONTROL_BOX_SIZE_PX.quiz.height) * quizScale
      );
      return {
        dpad: {
          x: clampVirtualControlPosBySize(layout?.dpad?.x, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.x, dpadWidth, viewportWidth),
          y: clampVirtualControlPosBySize(layout?.dpad?.y, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.y, dpadHeight, viewportHeight),
          scale: dpadScale
        },
        jump: {
          x: clampVirtualControlPosBySize(layout?.jump?.x, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.x, jumpWidth, viewportWidth),
          y: clampVirtualControlPosBySize(layout?.jump?.y, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.y, jumpHeight, viewportHeight),
          scale: jumpScale
        },
        quiz: {
          x: clampVirtualControlPosBySize(layout?.quiz?.x, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.x, quizWidth, viewportWidth),
          y: clampVirtualControlPosBySize(layout?.quiz?.y, DEFAULT_VIRTUAL_CONTROLS_LAYOUT.quiz.y, quizHeight, viewportHeight),
          scale: quizScale
        }
      };
    };
    const normalizeVirtualControlsLayout = (layout, options = {}) => resolveVirtualControlsLayoutSeparation(
      normalizeVirtualControlsLayoutBasic(layout, options),
      options
    );
    const isLayoutCloseToPreset = (layout, preset, tolerance = 0.0005) => {
      if (!layout || !preset) return false;
      const keys = ['dpad', 'jump', 'quiz'];
      return keys.every((key) => {
        const a = layout[key] || {};
        const b = preset[key] || {};
        return ['x', 'y', 'scale'].every((field) => (
          Math.abs((Number(a[field]) || 0) - (Number(b[field]) || 0)) <= tolerance
        ));
      });
    };
    const loadVirtualControlsLayout = () => {
      try {
        const raw = window.localStorage?.getItem(VIRTUAL_CONTROLS_LAYOUT_KEY);
        if (!raw) return normalizeVirtualControlsLayout(DEFAULT_VIRTUAL_CONTROLS_LAYOUT);
        const parsed = JSON.parse(raw);
        const normalized = normalizeVirtualControlsLayout(parsed);
        const isLegacyOverlapDefault =
          Math.abs((normalized?.dpad?.x ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.x) < 0.0005 &&
          Math.abs((normalized?.dpad?.y ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.y) < 0.0005 &&
          Math.abs((normalized?.dpad?.scale ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.dpad.scale) < 0.0005 &&
          Math.abs((normalized?.jump?.x ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.x) < 0.0005 &&
          Math.abs((normalized?.jump?.y ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.y) < 0.0005 &&
          Math.abs((normalized?.jump?.scale ?? -1) - LEGACY_OVERLAP_DEFAULT_VIRTUAL_CONTROLS_LAYOUT.jump.scale) < 0.0005;
        const isPreviousDefault = isLayoutCloseToPreset(normalized, PREVIOUS_DEFAULT_VIRTUAL_CONTROLS_LAYOUT);
        return isLegacyOverlapDefault
          ? normalizeVirtualControlsLayout(DEFAULT_VIRTUAL_CONTROLS_LAYOUT)
          : (isPreviousDefault ? normalizeVirtualControlsLayout(DEFAULT_VIRTUAL_CONTROLS_LAYOUT) : normalized);
      } catch (_error) {
        return normalizeVirtualControlsLayout(DEFAULT_VIRTUAL_CONTROLS_LAYOUT);
      }
    };
    const saveVirtualControlsLayout = () => {
      try {
        window.localStorage?.setItem(
          VIRTUAL_CONTROLS_LAYOUT_KEY,
          JSON.stringify(normalizeVirtualControlsLayout(controlsLayoutState.layout))
        );
      } catch (_error) {
        // ignore storage errors
      }
    };
    const controlsLayoutState = {
      editMode: false,
      layout: loadVirtualControlsLayout()
    };
    const safeParseJson = (raw) => {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('[JumpmapTestRuntime] failed to parse launcher setup', error);
        return null;
      }
    };
    const getLauncherSetup = () => {
      if (launcherSetupCache.loaded) return launcherSetupCache.value;
      launcherSetupCache.loaded = true;
      let parsed = null;
      try {
        parsed = safeParseJson(window.localStorage?.getItem(LAUNCHER_SETUP_STORAGE_KEY));
      } catch (error) {
        console.warn('[JumpmapTestRuntime] failed to read launcher setup', error);
      }
      launcherSetupCache.value = parsed && typeof parsed === 'object' ? parsed : null;
      return launcherSetupCache.value;
    };
    const isLauncherJumpmapPlayMode = () => {
      const params = new URLSearchParams(window.location.search);
      const launchMode = String(params.get('launchMode') || '').trim().toLowerCase();
      const fromLauncherRaw = String(params.get('fromLauncher') || '').trim().toLowerCase();
      const fromLauncher = ['1', 'true', 'yes', 'on'].includes(fromLauncherRaw);
      return launchMode === 'play' && fromLauncher;
    };
    const getJumpmapEndConfig = () => {
      const setup = getLauncherSetup();
      const quizCountLimit = Math.max(20, Math.min(500, Math.round(Number(setup?.quizCountLimit) || 20)));
      const quizTimeLimitSec = Math.max(10, Math.min(3600, Math.round(Number(setup?.quizTimeLimitSec) || 300)));
      if (!setup || typeof setup !== 'object') {
        return { mode: 'none', quizCountLimit, quizTimeLimitSec };
      }
      const direct = String(setup.endMode || '').trim().toLowerCase();
      if (direct === 'count' || direct === 'time' || direct === 'reach-top') {
        return { mode: direct, quizCountLimit, quizTimeLimitSec };
      }
      if (direct === 'time-attack') {
        return { mode: 'time', quizCountLimit, quizTimeLimitSec };
      }
      const legacyJumpmap = String(setup.jumpmapEndMode || '').trim().toLowerCase();
      if (legacyJumpmap === 'reach-top') {
        return { mode: 'reach-top', quizCountLimit, quizTimeLimitSec };
      }
      const legacyQuizMode = String(setup.quizEndMode || '').trim().toLowerCase();
      if (legacyQuizMode === 'time') {
        return { mode: 'time', quizCountLimit, quizTimeLimitSec };
      }
      if (legacyQuizMode === 'count') {
        return { mode: 'count', quizCountLimit, quizTimeLimitSec };
      }
      return { mode: 'none', quizCountLimit, quizTimeLimitSec };
    };
    const resolveTopGoalObstacle = (obstacleContext) => {
      const list = Array.isArray(obstacleContext?.list) ? obstacleContext.list : [];
      if (!list.length) return null;
      let minY = Number.POSITIVE_INFINITY;
      list.forEach((item) => {
        if (!item) return;
        const y1 = Number(item.y1);
        if (!Number.isFinite(y1)) return;
        if (y1 < minY) minY = y1;
      });
      if (!Number.isFinite(minY)) return null;
      const candidates = list.filter((item) => {
        if (!item) return false;
        const y1 = Number(item.y1);
        return Number.isFinite(y1) && Math.abs(y1 - minY) <= TOP_GOAL_CONTACT_EPSILON_PX;
      });
      if (!candidates.length) return null;
      let best = candidates[0];
      let bestArea = 0;
      candidates.forEach((item) => {
        const width = Math.max(0, (Number(item.x2) || 0) - (Number(item.x1) || 0));
        const height = Math.max(0, (Number(item.y2) || 0) - (Number(item.y1) || 0));
        const area = width * height;
        if (area > bestArea) {
          bestArea = area;
          best = item;
        }
      });
      return best;
    };
    const isPlayerTouchingTopGoal = (playerState, metrics, obstacle) => {
      if (!playerState || !metrics || !obstacle) return false;
      const px1 = Number(playerState.x) || 0;
      const py1 = Number(playerState.y) || 0;
      const px2 = px1 + Math.max(1, Number(metrics.width) || 1);
      const py2 = py1 + Math.max(1, Number(metrics.height) || 1);
      const ox1 = Number(obstacle.x1) || 0;
      const oy1 = Number(obstacle.y1) || 0;
      const ox2 = Number(obstacle.x2) || 0;
      const oy2 = Number(obstacle.y2) || 0;
      return (
        px1 <= ox2 + TOP_GOAL_CONTACT_EPSILON_PX &&
        px2 >= ox1 - TOP_GOAL_CONTACT_EPSILON_PX &&
        py1 <= oy2 + TOP_GOAL_CONTACT_EPSILON_PX &&
        py2 >= oy1 - TOP_GOAL_CONTACT_EPSILON_PX
      );
    };
    const ensureLocalRecordsModule = async () => {
      if (recordRuntimeState.modulePromise) return recordRuntimeState.modulePromise;
      recordRuntimeState.modulePromise = import(resolveEditorRuntimeAssetUrl('../shared/local-game-records.js'))
        .then((mod) => mod)
        .catch((error) => {
          recordRuntimeState.modulePromise = null;
          throw error;
        });
      return recordRuntimeState.modulePromise;
    };
    const beginRecordSession = () => {
      recordRuntimeState.sessionSeq += 1;
      recordRuntimeState.activeSessionSeq = recordRuntimeState.sessionSeq;
      recordRuntimeState.sessionStartedAt = Date.now();
    };
    const getBackgroundImageForRecord = () => {
      const direct = typeof state?.background?.image === 'string' ? state.background.image.trim() : '';
      if (direct) return direct;
      if (typeof getBackgroundLayers === 'function') {
        try {
          const layers = getBackgroundLayers({ applyOpacityOverlay: false });
          const imageLayer = Array.isArray(layers)
            ? layers.find((layer) => layer && typeof layer.image === 'string' && layer.image.trim())
            : null;
          return imageLayer?.image || '';
        } catch (error) {
          console.warn('[JumpmapTestRuntime] failed to inspect background layers for record', error);
        }
      }
      return '';
    };
    const buildJumpmapSettingsSummary = () => {
      const launcherSetup = getLauncherSetup();
      return {
        playerCount: Number(state?.test?.players) || 1,
        moveSpeed: Number(state?.physics?.moveSpeed) || 0,
        jumpHeight: Number(state?.physics?.jumpHeight) || 0,
        jumpSpeed: Number(state?.physics?.jumpSpeed) || 0,
        fallSpeed: Number(state?.physics?.fallSpeed) || 0,
        launcherQuizPresetId: typeof launcherSetup?.quizPresetId === 'string' ? launcherSetup.quizPresetId : null
      };
    };
    const collectJumpmapSessionRecord = (reason = 'unknown') => {
      const sessionSeq = Number(recordRuntimeState.activeSessionSeq) || 0;
      if (!sessionSeq) return null;
      const views = getViews();
      if (!Array.isArray(views) || !views.length) return null;
      const startedAt = Number(recordRuntimeState.sessionStartedAt) || 0;
      const durationMs = Math.max(0, Date.now() - startedAt);
      const metrics = getPlayerMetrics();
      const players = views.map((view, index) => {
        const ps = view?.state || {};
        const stats = view?.sessionStats || {};
        const currentHeightPx = getPlayerHeightValue(ps, metrics);
        const bestHeightPx = Math.max(Number(ps.maxHeight) || 0, currentHeightPx);
        return {
          name: getPlayerDisplayName(index),
          tag: getPlayerTag(index),
          currentHeightPx,
          bestHeightPx,
          gauge: Math.max(0, Number(getPlayerGauge(index)) || 0),
          quizAttempts: Math.max(0, Number(stats.quizAttempts) || 0),
          quizCorrect: Math.max(0, Number(stats.quizCorrect) || 0),
          quizWrong: Math.max(0, Number(stats.quizWrong) || 0),
          jumps: Math.max(0, Number(stats.jumps) || 0),
          doubleJumps: Math.max(0, Number(stats.doubleJumps) || 0)
        };
      });
      const hasActivity = players.some((player) =>
        player.bestHeightPx > 0 ||
        player.quizAttempts > 0 ||
        player.jumps > 0 ||
        player.doubleJumps > 0
      ) || durationMs >= 2000;
      if (!hasActivity) return null;
      return {
        sessionSeq,
        payload: {
          source: 'jumpmap-test-runtime',
          settings: buildJumpmapSettingsSummary(),
          map: {
            width: Number(state?.map?.width) || 0,
            height: Number(state?.map?.height) || 0,
            objectCount: Array.isArray(state?.objects) ? state.objects.length : 0,
            savePointCount: getSavePoints().length,
            backgroundImage: getBackgroundImageForRecord() || null,
            endReason: reason,
            durationMs
          },
          players
        }
      };
    };
    const saveCurrentJumpmapSessionRecord = (reason = 'unknown') => {
      const snapshot = collectJumpmapSessionRecord(reason);
      if (!snapshot) return;
      if (recordRuntimeState.savedSessionSeqs.has(snapshot.sessionSeq)) return;
      recordRuntimeState.savedSessionSeqs.add(snapshot.sessionSeq);
      ensureLocalRecordsModule()
        .then((mod) => mod?.saveJumpmapSessionRecord?.(snapshot.payload))
        .then((result) => {
          if (result) {
            console.log('[JumpmapTestRuntime] jumpmap session saved', {
              reason,
              sessionSeq: snapshot.sessionSeq,
              sessionId: result.sessionId,
              playerCount: result.playerCount
            });
          }
        })
        .catch((error) => {
          recordRuntimeState.savedSessionSeqs.delete(snapshot.sessionSeq);
          console.warn('[JumpmapTestRuntime] failed to save jumpmap session', error);
        });
    };
    const applyLauncherQuizPreset = (settings) => {
      const launcherSetup = getLauncherSetup();
      const presetId = String(launcherSetup?.quizPresetId || '').trim();
      if (!presetId) return settings;
      const next = {
        ...settings,
        score: { ...(settings.score || {}) },
        questionTypes: { ...(settings.questionTypes || {}) }
      };
      const setAllTypes = (enabled, count) => {
        Object.keys(next.questionTypes).forEach((key) => {
          next.questionTypes[key] = {
            ...(next.questionTypes[key] || {}),
            enabled,
            count
          };
        });
      };
      switch (presetId) {
        case 'jumpmap-net-30':
          next.questionCount = 30;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          setAllTypes(true, 5);
          break;
        case 'jumpmap-net-12':
          next.questionCount = 12;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          setAllTypes(true, 2);
          break;
        case 'cube-only-24':
          next.questionCount = 24;
          next.timeLimitSec = 30;
          Object.keys(next.questionTypes).forEach((key) => {
            const isCube = key.startsWith('cube_');
            next.questionTypes[key] = {
              ...(next.questionTypes[key] || {}),
              enabled: isCube,
              count: isCube ? 8 : 0
            };
          });
          break;
        case 'cuboid-only-24':
          next.questionCount = 24;
          next.timeLimitSec = 30;
          Object.keys(next.questionTypes).forEach((key) => {
            const isCuboid = key.startsWith('cuboid_');
            next.questionTypes[key] = {
              ...(next.questionTypes[key] || {}),
              enabled: isCuboid,
              count: isCuboid ? 8 : 0
            };
          });
          break;
        case 'cube-only-100':
          next.questionCount = 100;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          Object.keys(next.questionTypes).forEach((key) => {
            const isCube = key.startsWith('cube_');
            next.questionTypes[key] = {
              ...(next.questionTypes[key] || {}),
              enabled: isCube,
              count: isCube ? 8 : 0
            };
          });
          break;
        case 'cuboid-only-100':
          next.questionCount = 100;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          Object.keys(next.questionTypes).forEach((key) => {
            const isCuboid = key.startsWith('cuboid_');
            next.questionTypes[key] = {
              ...(next.questionTypes[key] || {}),
              enabled: isCuboid,
              count: isCuboid ? 8 : 0
            };
          });
          break;
        case 'jumpmap-net-100':
          next.questionCount = 100;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          setAllTypes(true, 5);
          break;
        case 'pvam-area-2digit':
          next.questionCount = 12;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          setAllTypes(false, 0);
          break;
        case 'pvam-area-2digit-100':
          next.questionCount = 100;
          next.timeLimitSec = 30;
          next.loopQuestions = true;
          setAllTypes(false, 0);
          break;
        default:
          break;
      }
      return next;
    };
    const isLauncherPvamPreset = (presetId) => (
      presetId === 'pvam-area-2digit' || presetId === 'pvam-area-2digit-100'
    );
    const getLauncherPvamQuestionCount = (presetId) => (
      presetId === 'pvam-area-2digit-100' ? 100 : 12
    );
    const LAUNCHER_STATIC_NET_PRESET_FILES = Object.freeze({
      'cube-only-100': '../../../../quiz/data/net-cube-100.json',
      'cuboid-only-100': '../../../../quiz/data/net-cuboid-100.json',
      'jumpmap-net-100': '../../../../quiz/data/net-mixed-100.json',
      'gugudan-2to9-csv': '../../../../quiz/data/gugudan-2to9.csv'
    });
    const resolveLauncherStaticNetPresetPath = (presetId) => (
      LAUNCHER_STATIC_NET_PRESET_FILES[String(presetId || '').trim()] || ''
    );
    const isCsvPresetFilePath = (filePath) => (
      /\.csv(?:[?#].*)?$/i.test(String(filePath || '').trim())
    );
    const getLauncherStaticPresetLabel = (presetId) => (
      String(presetId || '').trim() === 'gugudan-2to9-csv'
        ? '구구단 2단~9단'
        : '전개도 100문제'
    );
    const shouldUseLauncherCsvBank = (launcherSetup) => {
      if (!launcherSetup || typeof launcherSetup !== 'object') return false;
      const presetId = String(launcherSetup.quizPresetId || '').trim();
      if (presetId !== 'csv-upload') return false;
      if (launcherSetup.customCsvEnabled !== true) return false;
      const csvText = typeof launcherSetup.customCsvText === 'string' ? launcherSetup.customCsvText : '';
      return csvText.trim().length > 0;
    };
    const resolveQuestionBankFromJsonPayload = (payload) => {
      if (!payload) return null;
      if (Array.isArray(payload)) {
        return { version: 1, questions: payload };
      }
      if (typeof payload !== 'object') return null;
      if (Array.isArray(payload.questions)) return payload;
      if (payload.bank && typeof payload.bank === 'object' && Array.isArray(payload.bank.questions)) {
        return payload.bank;
      }
      if (payload.questionBank && typeof payload.questionBank === 'object' && Array.isArray(payload.questionBank.questions)) {
        return payload.questionBank;
      }
      return null;
    };
    const normalizePvamQuestionForRuntime = (question, index = 0) => {
      if (!question || typeof question !== 'object') return null;
      const id = String(question?.id || `pvam-runtime-${index + 1}`);
      return {
        ...question,
        id
      };
    };
    const resolveLauncherPvamQuestionBank = async (resources) => {
      const launcherSetup = getLauncherSetup();
      const presetId = String(launcherSetup?.quizPresetId || '').trim();
      if (!isLauncherPvamPreset(presetId)) {
        return { bank: null, message: '' };
      }
      const count = getLauncherPvamQuestionCount(presetId);
      let payload = null;
      try {
        payload = await loadJson(
          resolveEditorRuntimeAssetUrl('../../../../quiz/data/pvam-area-2digit-100.json')
        );
      } catch (error) {
        return {
          bank: null,
          message: `영역모델 문제 파일 로드 실패: ${error?.message || error}`
        };
      }
      const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
      const normalizedQuestions = rawQuestions
        .slice(0, Math.max(1, count))
        .map((question, index) => normalizePvamQuestionForRuntime(question, index))
        .filter(Boolean);
      if (!normalizedQuestions.length) {
        return { bank: null, message: '영역모델 문제를 불러오지 못했습니다.' };
      }
      const bank = { questions: normalizedQuestions };
      const validation = resources.validateQuestionBank
        ? resources.validateQuestionBank(bank)
        : { valid: true, errors: [] };
      if (!validation?.valid) {
        return {
          bank: null,
          message: `영역모델 문제 검증 실패: ${validation?.errors?.[0] || 'invalid bank'}`
        };
      }
      return {
        bank,
        message: `영역모델 문제 ${normalizedQuestions.length}개를 사용합니다.`
      };
    };
    const resolveLauncherStaticNetQuestionBank = async (resources) => {
      const launcherSetup = getLauncherSetup();
      const presetId = String(launcherSetup?.quizPresetId || '').trim();
      const filePath = resolveLauncherStaticNetPresetPath(presetId);
      if (!filePath) {
        return { bank: null, message: '' };
      }
      const label = getLauncherStaticPresetLabel(presetId);
      if (isCsvPresetFilePath(filePath)) {
        const csvUrl = resolveEditorRuntimeAssetUrl(filePath);
        let sourceText = '';
        try {
          const response = await fetch(csvUrl, { cache: 'no-store' });
          if (!response.ok) {
            return {
              bank: null,
              message: `${label} 파일 로드 실패: ${response.status}`
            };
          }
          sourceText = await response.text();
        } catch (error) {
          return {
            bank: null,
            message: `${label} 파일 로드 실패: ${error?.message || error}`
          };
        }
        const parsed = parseLauncherQuestionBankPayload(resources, sourceText, filePath);
        if (!parsed?.bank) {
          return {
            bank: null,
            message: `${label} 파싱 실패: ${parsed?.message || 'invalid csv'}`
          };
        }
        return {
          bank: parsed.bank,
          message: parsed.message || `${label} ${parsed.bank.questions.length}문항 적용`
        };
      }
      let payload = null;
      try {
        payload = await loadJson(resolveEditorRuntimeAssetUrl(filePath));
      } catch (error) {
        return {
          bank: null,
          message: `${label} 파일 로드 실패: ${error?.message || error}`
        };
      }
      const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
      if (!rawQuestions.length) {
        return { bank: null, message: `${label}에서 questions 목록을 찾지 못했습니다.` };
      }
      const bank = { questions: rawQuestions };
      const validation = resources.validateQuestionBank
        ? resources.validateQuestionBank(bank)
        : { valid: true, errors: [] };
      if (!validation?.valid) {
        return {
          bank: null,
          message: `${label} 검증 실패: ${validation?.errors?.[0] || 'invalid bank'}`
        };
      }
      return {
        bank,
        message: `${label} ${rawQuestions.length}문항 적용`
      };
    };
    const parseLauncherQuestionBankPayload = (resources, rawText, fileName) => {
      const sourceText = String(rawText || '');
      const trimmed = sourceText.trim();
      if (!trimmed) {
        return { bank: null, message: '업로드 파일이 비어 있습니다.' };
      }
      const normalizedName = String(fileName || '').trim().toLowerCase();
      const forceJson = normalizedName.endsWith('.json');
      const forceCsv = normalizedName.endsWith('.csv');
      const tryJsonFirst = forceJson || (!forceCsv && /^[\[{]/.test(trimmed));
      const validateBank = (bank, label) => {
        const validation = resources.validateQuestionBank
          ? resources.validateQuestionBank(bank)
          : { valid: true, errors: [] };
        if (!validation?.valid) {
          return { bank: null, message: `${label} 검증 실패: ${validation?.errors?.[0] || 'invalid bank'}` };
        }
        return { bank, message: `${label} ${bank.questions.length}문항 적용` };
      };
      const parseJson = () => {
        try {
          const payload = JSON.parse(trimmed);
          const bank = resolveQuestionBankFromJsonPayload(payload);
          if (!bank?.questions?.length) {
            return { bank: null, message: 'JSON 문제팩에서 questions 목록을 찾지 못했습니다.' };
          }
          return validateBank(bank, '문제팩(JSON)');
        } catch (error) {
          return { bank: null, message: `JSON 파싱 실패: ${error?.message || 'invalid json'}` };
        }
      };
      const parseCsv = () => {
        const parsed = resources.parseCsvQuestionBank
          ? resources.parseCsvQuestionBank(sourceText)
          : { valid: false, errors: ['csv parser unavailable'], bank: null };
        if (!parsed?.valid || !parsed?.bank) {
          return { bank: null, message: parsed?.errors?.[0] || 'CSV 파싱 실패' };
        }
        const validated = validateBank(parsed.bank, 'CSV');
        if (!validated.bank) return validated;
        const warning = parsed?.warnings?.[0] ? ` · ${parsed.warnings[0]}` : '';
        return { bank: validated.bank, message: `CSV ${parsed.bank.questions.length}문항 적용${warning}` };
      };
      if (tryJsonFirst) {
        const jsonResult = parseJson();
        if (jsonResult.bank || forceJson) return jsonResult;
        if (!forceCsv) {
          const csvResult = parseCsv();
          if (csvResult.bank) return csvResult;
          return { bank: null, message: `${jsonResult.message} / ${csvResult.message}` };
        }
        return jsonResult;
      }
      const csvResult = parseCsv();
      if (csvResult.bank || forceCsv) return csvResult;
      const jsonResult = parseJson();
      if (jsonResult.bank) return jsonResult;
      return { bank: null, message: `${csvResult.message} / ${jsonResult.message}` };
    };
    const resolveLauncherCsvQuestionBank = (resources) => {
      const launcherSetup = getLauncherSetup();
      if (!shouldUseLauncherCsvBank(launcherSetup)) {
        quizRuntimeState.launcherCsvCache = {
          source: '',
          fileName: '',
          bank: null,
          message: '',
          loaded: true
        };
        return { bank: null, message: '' };
      }
      const csvText = String(launcherSetup.customCsvText || '');
      const fileName = typeof launcherSetup.customCsvFileName === 'string' ? launcherSetup.customCsvFileName : '';
      const cache = quizRuntimeState.launcherCsvCache || {};
      if (cache.loaded && cache.source === csvText && cache.fileName === fileName) {
        return { bank: cache.bank || null, message: cache.message || '' };
      }
      const parsed = parseLauncherQuestionBankPayload(resources, csvText, fileName);
      if (!parsed?.bank) {
        const message = parsed?.message || '업로드 문제 파싱 실패';
        console.warn('[JumpmapTestRuntime] launcher upload parse failed', { message });
        quizRuntimeState.launcherCsvCache = {
          source: csvText,
          fileName,
          bank: null,
          message,
          loaded: true
        };
        return { bank: null, message };
      }
      const message = parsed.message || `업로드 문제 ${parsed.bank.questions.length}문항 적용`;
      quizRuntimeState.launcherCsvCache = {
        source: csvText,
        fileName,
        bank: parsed.bank,
        message,
        loaded: true
      };
      console.log('[JumpmapTestRuntime] launcher upload loaded', {
        count: parsed.bank.questions.length
      });
      return { bank: parsed.bank, message };
    };
    const getBridgePlayerId = (index) => `player-${index + 1}`;
    const getBridgeZoneId = (index) => `zone-${index + 1}`;
    const buildQuizAssetUrl = (assetPath) => resolveEditorRuntimeAssetUrl(`../quiz/nets/${assetPath}`);
    const buildQuizDataUrl = (path) => resolveEditorRuntimeAssetUrl(`../quiz/data/${path}`);

    const getPlayerDisplayName = (index) => {
      const names = Array.isArray(state?.test?.playerNames) ? state.test.playerNames : [];
      const raw = names[index];
      const baseName = (typeof raw === 'string' && raw.trim()) ? raw.trim() : `사용자${index + 1}`;
      const tags = Array.isArray(state?.test?.playerTags) ? state.test.playerTags : [];
      const tagRaw = tags[index];
      const tag = (typeof tagRaw === 'string' && tagRaw.trim()) ? tagRaw.trim() : '';
      return tag ? `${baseName}(${tag})` : baseName;
    };

    const getPlayerTag = (index) => {
      const tags = Array.isArray(state?.test?.playerTags) ? state.test.playerTags : [];
      const raw = tags[index];
      if (typeof raw !== 'string') return '';
      return raw.trim();
    };
    const normalizeStudentNo = (raw) => {
      const parsed = Math.round(Number(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) return null;
      return parsed;
    };
    const normalizePeriodDays = (raw) => {
      const value = String(raw ?? '').trim().toLowerCase();
      if (!value || value === 'all') return null;
      const parsed = Math.round(Number(value));
      if (parsed === 7 || parsed === 30) return parsed;
      return null;
    };
    const readResultFilterContextFromQuery = () => {
      const params = new URLSearchParams(window.location.search);
      return {
        studentNo: normalizeStudentNo(params.get('studentNo')),
        periodDays: normalizePeriodDays(params.get('periodDays'))
      };
    };
    const resultFilterContext = readResultFilterContextFromQuery();
    const buildResultNavigationHref = (basePath, preferredStudentNo = null) => {
      const params = new URLSearchParams();
      const studentNo = resultFilterContext.studentNo || normalizeStudentNo(preferredStudentNo);
      if (studentNo) params.set('studentNo', String(studentNo));
      if (resultFilterContext.periodDays) params.set('periodDays', String(resultFilterContext.periodDays));
      const query = params.toString();
      return resolveEditorRuntimeAssetUrl(`${basePath}${query ? `?${query}` : ''}`);
    };

    const getPlayerNameColor = (index) =>
      PLAYER_NAME_COLORS[Math.max(0, index) % PLAYER_NAME_COLORS.length];

    const getBackgroundImageOpacity = () => {
      const raw = Number(state?.background?.imageOpacity);
      if (!Number.isFinite(raw)) return 1;
      return Math.max(0, Math.min(1, raw));
    };

    const getTestBackgroundStyleKey = () => {
      const bg = state?.background || {};
      return [
        String(bg.color || PLAY_FALLBACK_BG_COLOR),
        String(bg.texture || ''),
        String(bg.image || ''),
        getBackgroundImageOpacity().toFixed(3)
      ].join('|');
    };

    const applyTestBackgroundLayer = (bgLayer, cam, viewRect) => {
      if (!bgLayer) return;
      let cache = backgroundLayerStyleCache.get(bgLayer);
      if (!cache) {
        cache = {
          styleKey: '',
          basePositions: ['center'],
          backgroundPosition: ''
        };
        backgroundLayerStyleCache.set(bgLayer, cache);
      }

      const styleKey = getTestBackgroundStyleKey();
      if (cache.styleKey !== styleKey) {
        const layers = getBackgroundLayers({ applyOpacityOverlay: false });
        bgLayer.style.backgroundColor = state.background.color || PLAY_FALLBACK_BG_COLOR;
        bgLayer.style.backgroundImage = layers.image;
        bgLayer.style.backgroundSize = layers.size;
        bgLayer.style.backgroundRepeat = layers.repeat;
        bgLayer.style.opacity = String(getBackgroundImageOpacity());

        const nextBasePositions = String(layers.position || 'center')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        cache.basePositions = nextBasePositions.length ? nextBasePositions : ['center'];
        cache.styleKey = styleKey;
        cache.backgroundPosition = '';
      }

      const basePositions = Array.isArray(cache.basePositions)
        ? [...cache.basePositions]
        : ['center'];

      if ((state.background.image || '').trim() && basePositions.length && cam && viewRect) {
        const maxCamX = Math.max(1, state.map.width - viewRect.width);
        const maxCamY = Math.max(1, state.map.height - viewRect.height);
        const progressX = Math.max(0, Math.min(1, cam.x / maxCamX));
        const progressY = Math.max(0, Math.min(1, cam.y / maxCamY));
        // Keep far-background feel horizontally, and reveal image bottom
        // only near map bottom so lower white area does not appear too early.
        const xPct = 50 + (progressX - 0.5) * 6;
        const yPct = Math.pow(progressY, 2.4) * 100;
        // Lower precision reduces full-layer repaint churn on mobile/tablet.
        basePositions[basePositions.length - 1] = `${xPct.toFixed(BACKGROUND_POSITION_PRECISION_DIGITS)}% ${yPct.toFixed(BACKGROUND_POSITION_PRECISION_DIGITS)}%`;
      } else if (basePositions.length) {
        basePositions[basePositions.length - 1] = '50% 100%';
      }

      const nextBackgroundPosition = basePositions.join(', ') || 'center';
      if (cache.backgroundPosition !== nextBackgroundPosition) {
        bgLayer.style.backgroundPosition = nextBackgroundPosition;
        cache.backgroundPosition = nextBackgroundPosition;
      }
    };

    const loadJson = async (url) => {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load quiz json: ${url}`);
      return res.json();
    };

    const getTunedRuntimePhysics = (physics = {}) => {
      const next = { ...(physics || {}) };
      const jumpSpeed = Math.max(0, Number(physics?.jumpSpeed) || 0);
      const fallSpeed = Math.max(0, Number(physics?.fallSpeed) || 0);
      if (jumpSpeed > 0) next.jumpSpeed = jumpSpeed * RUNTIME_VERTICAL_SPEED_SCALE;
      if (fallSpeed > 0) next.fallSpeed = fallSpeed * RUNTIME_VERTICAL_SPEED_SCALE;
      return next;
    };

    const mergeQuizSettings = (loaded = {}) => ({
      ...QUIZ_DEFAULT_SETTINGS,
      ...loaded,
      loopQuestions: true,
      quizEndMode: 'time',
      quizTimeLimitSec: 0,
      timeLimitSec: Math.max(1, Number(loaded?.timeLimitSec) || QUIZ_DEFAULT_SETTINGS.timeLimitSec),
      score: {
        ...QUIZ_DEFAULT_SETTINGS.score,
        ...(loaded?.score || {}),
        penalty: 0
      },
      questionTypes: {
        ...QUIZ_DEFAULT_SETTINGS.questionTypes,
        ...(loaded?.questionTypes || {})
      }
    });

    const ensureQuizResources = async () => {
      if (quizRuntimeState.resourcesPromise) return quizRuntimeState.resourcesPromise;
      quizRuntimeState.resourcesPromise = (async () => {
        console.log('[JumpmapTestRuntime] quiz resources: loading start');
        const [
          engineMod,
          bankMod,
          csvImporterMod,
          validateMod,
          pvamRendererMod,
          defaults,
          facecolor,
          edgecolor,
          validity
        ] = await Promise.all([
          import(resolveEditorRuntimeAssetUrl('../../../../quiz/core/engine.js')),
          import(resolveEditorRuntimeAssetUrl('../../../../quiz/core/bank.js')),
          import(resolveEditorRuntimeAssetUrl('../../../../quiz/core/importers/csv-question-bank.js')),
          import(resolveEditorRuntimeAssetUrl('../../../../quiz/core/validate.js')),
          import(resolveEditorRuntimeAssetUrl('../../../../quiz/renderers/place-value-area-model.js')),
          loadJson(buildQuizDataUrl('quiz-settings.default.json')),
          loadJson(buildQuizDataUrl('facecolor-questions.json')),
          loadJson(buildQuizDataUrl('edgecolor-questions.json')),
          loadJson(buildQuizDataUrl('validity-questions.json'))
        ]);
        console.log('[JumpmapTestRuntime] quiz resources: loading done');
        const resources = {
          createQuizEngine: engineMod.createQuizEngine,
          buildWeightedQuestionBank: bankMod.buildWeightedQuestionBank,
          parseCsvQuestionBank: csvImporterMod.parseCsvQuestionBank,
          validateQuestionBank: validateMod.validateQuestionBank,
          isPlaceValueAreaModelQuestion: pvamRendererMod.isPlaceValueAreaModelQuestion,
          renderPlaceValueAreaModelQuestion: pvamRendererMod.renderPlaceValueAreaModelQuestion,
          defaults: mergeQuizSettings(defaults),
          banks: { facecolor, edgecolor, validity }
        };
        quizRuntimeState.resources = resources;
        return resources;
      })().catch((error) => {
        quizRuntimeState.resourcesPromise = null;
        quizRuntimeState.resources = null;
        console.error('[JumpmapTestRuntime] quiz resources load failed', error);
        throw error;
      });
      return quizRuntimeState.resourcesPromise;
    };

    const createPlayerQuizSession = async (index) => {
      console.log('[JumpmapTestRuntime] quiz session:create start', { index });
      const resources = await ensureQuizResources();
      const settings = applyLauncherQuizPreset({
        ...resources.defaults,
        score: { ...(resources.defaults?.score || {}) },
        questionTypes: { ...(resources.defaults?.questionTypes || {}) }
      });
      const launcherCsv = resolveLauncherCsvQuestionBank(resources);
      const launcherStaticNet = await resolveLauncherStaticNetQuestionBank(resources);
      const launcherPvam = await resolveLauncherPvamQuestionBank(resources);
      const questionBank = launcherCsv.bank
        ? launcherCsv.bank
        : launcherStaticNet.bank
          ? launcherStaticNet.bank
        : launcherPvam.bank
          ? launcherPvam.bank
          : resources.buildWeightedQuestionBank(resources.banks, settings);
      if (launcherCsv.bank) {
        settings.questionCount = Math.max(1, launcherCsv.bank.questions.length);
        settings.selectionMode = 'random';
        settings.avoidRepeat = true;
        settings.shuffleChoices = true;
        settings.loopQuestions = true;
        settings.quizEndMode = 'time';
      } else if (launcherStaticNet.bank) {
        settings.questionCount = Math.max(1, launcherStaticNet.bank.questions.length);
        settings.selectionMode = 'random';
        settings.avoidRepeat = true;
        settings.shuffleChoices = true;
        settings.loopQuestions = true;
        settings.quizEndMode = 'time';
      } else if (launcherPvam.bank) {
        settings.questionCount = Math.max(1, launcherPvam.bank.questions.length);
        settings.selectionMode = 'random';
        settings.avoidRepeat = true;
        settings.shuffleChoices = false;
        settings.loopQuestions = true;
        settings.quizEndMode = 'time';
      }
      console.log('[JumpmapTestRuntime] quiz session:create done', {
        index,
        questionCount: Number(questionBank?.questions?.length || 0),
        source: launcherCsv.bank
          ? 'launcher-csv'
          : launcherStaticNet.bank
            ? 'launcher-static-net'
            : launcherPvam.bank
              ? 'launcher-pvam'
              : 'preset',
        launcherCsvMessage: launcherCsv.message || '',
        launcherStaticNetMessage: launcherStaticNet.message || '',
        launcherPvamMessage: launcherPvam.message || ''
      });
      return {
        index,
        engine: resources.createQuizEngine({ questionBank, settings }),
        currentQuestion: null
      };
    };

    const getOrCreatePlayerQuizSession = async (index) => {
      const key = getBridgePlayerId(index);
      if (!quizRuntimeState.sessions.has(key)) {
        quizRuntimeState.sessions.set(key, await createPlayerQuizSession(index));
      }
      return quizRuntimeState.sessions.get(key);
    };

    const ensureQuizGatewayInstalled = () => {
      if (quizRuntimeState.gatewayInstalled) return;
      if (!integration || typeof integration.setQuizGateway !== 'function') return;
      integration.setQuizGateway({
        requestQuiz: async (payload = {}) => {
          console.log('[JumpmapTestRuntime] gateway:requestQuiz:start', payload);
          const playerId = String(payload.playerId || '');
          const index = Number.isFinite(Number(payload.playerIndex))
            ? Math.max(0, Number(payload.playerIndex))
            : Math.max(0, (Number(String(playerId).replace(/^\D+/g, '')) || 1) - 1);
          const session = await getOrCreatePlayerQuizSession(index);
          let question = session.engine.nextQuestion();
          if (!question) {
            session.engine.reset();
            question = session.engine.nextQuestion();
          }
          if (!question) {
            console.log('[JumpmapTestRuntime] gateway:requestQuiz:no-question', { index, payload });
            return {
              accepted: false,
              reason: 'quiz_question_unavailable',
              playerId: payload.playerId,
              zoneId: payload.zoneId
            };
          }
          session.currentQuestion = question;
          console.log('[JumpmapTestRuntime] gateway:requestQuiz:resolved', {
            id: question.id,
            type: question.type,
            index
          });
          return {
            accepted: true,
            question,
            playerId: payload.playerId,
            zoneId: payload.zoneId,
            source: 'jumpmap-test-runtime-gateway',
            timestamp: Date.now()
          };
        }
      });
      quizRuntimeState.gatewayInstalled = true;
    };

    const stopTestLoop = () => {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };
    const rebuildActiveTestViews = (reason = 'test_rebuild') => {
      if (!state.test.active) return;
      saveCurrentJumpmapSessionRecord(reason);
      clearAllInputs();
      stopTestLoop();
      buildTestViews(state.test.players);
      startTestLoop();
    };

    const getSavePoints = () => (
      Array.isArray(state.savePoints)
        ? state.savePoints.filter((point) => point && typeof point === 'object')
        : []
    );

    const getSavePointById = (id) => {
      if (!id) return null;
      return getSavePoints().find((point) => point.id === id) || null;
    };

    const getSpawnPosition = (basePoint = null) => {
      ensureStartPoint();
      const metrics = getPlayerMetrics();
      const offset = getPlayerHitboxOffset();
      const point = (basePoint && Number.isFinite(basePoint.x) && Number.isFinite(basePoint.y))
        ? basePoint
        : state.startPoint;
      return computeSpawnPosition(state.map, point, metrics, offset);
    };

    const getPlayerHeightValue = (playerState, metrics) => {
      const footY = (Number(playerState?.y) || 0) + (Number(metrics?.height) || 0);
      const mapH = Math.max(0, Number(state?.map?.height) || 0);
      return Math.max(0, Math.round(mapH - footY));
    };

    const toHeightMetersText = (px) => {
      const meters = Math.max(0, Number(px) || 0) / HEIGHT_PX_PER_METER;
      return `${meters.toFixed(2)}m`;
    };

    const formatJumpmapEndReasonLabel = (rawReason = '') => {
      const reason = String(rawReason || '').trim();
      if (!reason) return '종료';
      if (reason === 'reach_top_finish') return '꼭대기 도달 종료';
      if (reason === 'count_limit_finish') return '문제 수 도달 종료';
      if (reason === 'time_limit_finish') return '시간 종료';
      if (reason === 'test_exit') return '수동 종료';
      if (reason === 'test_restart') return '재시작';
      if (reason === 'test_rebuild') return '재구성';
      return reason;
    };

    const buildTopReachRanking = (views) => {
      const metrics = getPlayerMetrics();
      return (Array.isArray(views) ? views : [])
        .map((playerView, index) => {
          const ps = playerView?.state || {};
          const stats = playerView?.sessionStats || {};
          const currentHeightPx = getPlayerHeightValue(ps, metrics);
          const bestHeightPx = Math.max(Number(ps.maxHeight) || 0, currentHeightPx);
          const studentNo = normalizeStudentNo(getPlayerTag(index));
          return {
            index,
            name: getPlayerDisplayName(index),
            studentNo,
            bestHeightPx,
            quizCorrect: Math.max(0, Number(stats.quizCorrect) || 0),
            quizAttempts: Math.max(0, Number(stats.quizAttempts) || 0)
          };
        })
        .sort((a, b) => {
          const byHeight = (Number(b.bestHeightPx) || 0) - (Number(a.bestHeightPx) || 0);
          if (byHeight !== 0) return byHeight;
          const byQuiz = (Number(b.quizCorrect) || 0) - (Number(a.quizCorrect) || 0);
          if (byQuiz !== 0) return byQuiz;
          return a.index - b.index;
        });
    };

    const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const downloadCsvFile = (fileName, text) => {
      const csvText = `\ufeff${String(text || '')}`;
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    };
    const buildJumpmapResultCsv = (snapshot, rankingRows = []) => {
      const payload = snapshot?.payload || {};
      const settings = payload?.settings || {};
      const map = payload?.map || {};
      const players = Array.isArray(payload?.players) ? payload.players : [];
      const rankingMap = new Map();
      (Array.isArray(rankingRows) ? rankingRows : []).forEach((row, idx) => {
        const studentNo = normalizeStudentNo(row?.studentNo);
        if (studentNo) {
          rankingMap.set(`no:${studentNo}`, idx + 1);
          return;
        }
        const name = String(row?.name || '').trim();
        if (name) rankingMap.set(`name:${name}`, idx + 1);
      });
      const rows = [[
        '리포트유형',
        '생성시각',
        '종료사유',
        '플레이시간초',
        '플레이어수',
        '학생번호',
        '이름',
        '순위',
        '최고높이px',
        '최고높이m',
        '현재높이px',
        '게이지',
        '퀴즈정답',
        '퀴즈시도',
        '퀴즈오답',
        '점프',
        '더블점프',
        '맵크기',
        '오브젝트수',
        '세이브포인트수',
        '퀴즈프리셋'
      ]];
      const createdAt = new Date().toISOString();
      const durationSec = Math.max(0, Math.round((Number(map?.durationMs) || 0) / 1000));
      const mapSize = `${Number(map?.width) || 0}x${Number(map?.height) || 0}`;
      const playerCount = Math.max(1, Number(settings?.playerCount) || players.length || 1);
      players.forEach((player) => {
        const studentNo = normalizeStudentNo(player?.tag);
        const playerName = String(player?.name || '').trim();
        const rank = studentNo
          ? rankingMap.get(`no:${studentNo}`)
          : rankingMap.get(`name:${playerName}`);
        rows.push([
          '점프맵결과',
          createdAt,
          map?.endReason || '',
          durationSec,
          playerCount,
          studentNo || '',
          playerName,
          rank || '',
          Number(player?.bestHeightPx) || 0,
          toHeightMetersText(player?.bestHeightPx),
          Number(player?.currentHeightPx) || 0,
          Number(player?.gauge) || 0,
          Number(player?.quizCorrect) || 0,
          Number(player?.quizAttempts) || 0,
          Number(player?.quizWrong) || 0,
          Number(player?.jumps) || 0,
          Number(player?.doubleJumps) || 0,
          mapSize,
          Number(map?.objectCount) || 0,
          Number(map?.savePointCount) || 0,
          settings?.launcherQuizPresetId || ''
        ]);
      });
      return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
    };

    const buildTopReachFinishGuide = ({
      winnerName = '',
      titleText = '점프맵 종료',
      iconText = '🏁',
      line1Text = '',
      line2Text = '',
      rankingRows = [],
      snapshot = null,
      onRestart = null,
      onClose = null
    }) => {
      const guide = document.createElement('div');
      guide.className = 'test-start-guide is-result';
      const title = document.createElement('div');
      title.className = 'test-start-guide-title';
      title.textContent = titleText;
      const icon = document.createElement('div');
      icon.className = 'test-start-guide-count';
      icon.textContent = iconText;
      const line1 = document.createElement('div');
      line1.className = 'test-start-guide-line';
      line1.classList.add('is-primary');
      line1.textContent = line1Text || (winnerName ? `${winnerName} 님이 꼭대기에 도달했습니다.` : '플레이가 종료되었습니다.');
      const line2 = document.createElement('div');
      line2.className = 'test-start-guide-line';
      line2.classList.add('is-secondary');
      line2.textContent = line2Text || '결과를 확인한 뒤 다시 시작하거나 기록/학급관리 화면으로 이동할 수 있습니다.';
      guide.append(title, icon, line1, line2);

      if (Array.isArray(rankingRows) && rankingRows.length) {
        const summary = document.createElement('div');
        summary.className = 'test-start-guide-summary';
        rankingRows.forEach((row, rankIndex) => {
          const item = document.createElement('div');
          item.className = 'test-start-guide-summary-row';
          const rank = document.createElement('span');
          rank.className = 'test-start-guide-rank';
          rank.textContent = `${rankIndex + 1}위`;
          const text = document.createElement('span');
          text.className = 'test-start-guide-rank-text';
          text.textContent = `${row.name} · 최고 ${toHeightMetersText(row.bestHeightPx)} · 퀴즈 ${row.quizCorrect}/${row.quizAttempts}`;
          item.append(rank, text);
          summary.appendChild(item);
        });
        guide.appendChild(summary);
      }

      const actions = document.createElement('div');
      actions.className = 'test-start-guide-actions';
      if (typeof onRestart === 'function') {
        const restartBtn = document.createElement('button');
        restartBtn.type = 'button';
        restartBtn.className = 'test-start-guide-action-btn is-primary';
        restartBtn.textContent = '즉시 재시작';
        restartBtn.addEventListener('click', () => {
          onRestart();
        });
        actions.appendChild(restartBtn);
      }
      if (typeof onClose === 'function') {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'test-start-guide-action-btn';
        closeBtn.textContent = '테스트 완전 종료';
        closeBtn.addEventListener('click', () => {
          onClose();
        });
        actions.appendChild(closeBtn);
      }
      const studentNos = new Set();
      (Array.isArray(rankingRows) ? rankingRows : []).forEach((row) => {
        const studentNo = normalizeStudentNo(row?.studentNo);
        if (studentNo) studentNos.add(studentNo);
      });
      const singleStudentNo = studentNos.size === 1 ? Array.from(studentNos)[0] : null;
      if (snapshot) {
        const csvBtn = document.createElement('button');
        csvBtn.type = 'button';
        csvBtn.className = 'test-start-guide-action-btn';
        csvBtn.textContent = '결과 CSV';
        csvBtn.addEventListener('click', () => {
          const csvText = buildJumpmapResultCsv(snapshot, rankingRows);
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const fileName = `jumpmap-result-${stamp}.csv`;
          downloadCsvFile(fileName, csvText);
        });
        actions.appendChild(csvBtn);
      }
      const recordsLink = document.createElement('a');
      recordsLink.className = 'test-start-guide-action-btn';
      recordsLink.href = buildResultNavigationHref('../../../../play/records/', singleStudentNo);
      recordsLink.textContent = '전체 기록 보기(로컬)';
      actions.appendChild(recordsLink);
      const classroomLink = document.createElement('a');
      classroomLink.className = 'test-start-guide-action-btn';
      classroomLink.href = buildResultNavigationHref('../../../../play/classroom/', singleStudentNo);
      classroomLink.textContent = '학급관리 / 명예의 전당';
      actions.appendChild(classroomLink);
      const launcherLink = document.createElement('a');
      launcherLink.className = 'test-start-guide-action-btn';
      launcherLink.classList.add('is-primary');
      launcherLink.href = resolveEditorRuntimeAssetUrl('../../../../');
      launcherLink.textContent = '메인화면으로';
      actions.appendChild(launcherLink);
      guide.appendChild(actions);

      return guide;
    };

    const buildSessionSummaryLineText = (snapshot, reason = '') => {
      const durationSec = Math.max(0, Math.round((Number(snapshot?.payload?.map?.durationMs) || 0) / 1000));
      const objectCount = Number(snapshot?.payload?.map?.objectCount) || 0;
      const playerCount = Math.max(1, Number(snapshot?.payload?.settings?.playerCount) || Number(state?.test?.players) || 1);
      const reasonLabel = formatJumpmapEndReasonLabel(reason);
      return `종료: ${reasonLabel} · 플레이 ${durationSec}초 · 오브젝트 ${objectCount}개 · 플레이어 ${playerCount}명`;
    };

    const resetPlayerStateAt = (playerState, basePoint = null) => {
      const spawn = getSpawnPosition(basePoint);
      const metrics = getPlayerMetrics();
      playerState.x = spawn.x;
      playerState.y = spawn.y;
      playerState.vx = 0;
      playerState.vy = 0;
      playerState.facing = 1;
      playerState.onGround = false;
      playerState.jumpsUsed = 0;
      playerState.jumpedFromGround = false;
      playerState.jumping = false;
      playerState.jumpTargetY = 0;
      playerState.coyoteTimer = 0;
      playerState.walkTimer = 0;
      playerState._spriteGroundLatchSec = 0;
      playerState._spriteMoveLatchSec = 0;
      playerState.input.left = false;
      playerState.input.right = false;
      playerState.input.jumpQueued = false;
      playerState.input.jumpHeld = false;
      playerState.input.jumpLock = false;
      playerState.maxHeight = getPlayerHeightValue(playerState, metrics);
      playerState.startHeightPx = playerState.maxHeight;
    };

    const getViews = () => els.testViews._views || [];
    const buildVirtualControlsLayoutOptions = (controls) => {
      const controlsRect = controls?.getBoundingClientRect?.();
      return {
        viewportWidth: Math.max(1, Number(controlsRect?.width) || controls?.clientWidth || 0),
        viewportHeight: Math.max(1, Number(controlsRect?.height) || controls?.clientHeight || 0),
        dpadSizePx: {
          width: controls?._dpadBox?.offsetWidth,
          height: controls?._dpadBox?.offsetHeight
        },
        jumpSizePx: {
          width: controls?._jumpBox?.offsetWidth,
          height: controls?._jumpBox?.offsetHeight
        },
        quizSizePx: {
          width: controls?._quizBox?.offsetWidth,
          height: controls?._quizBox?.offsetHeight
        }
      };
    };
    const applyVirtualControlsLayoutToView = (playerView) => {
      const controls = playerView?.controls;
      if (!controls) return;
      controls.classList.toggle('is-edit', !!controlsLayoutState.editMode);
      if (controls._editToggle) {
        controls._editToggle.textContent = controlsLayoutState.editMode ? '조작 편집 완료' : '조작 편집';
        controls._editToggle.classList.toggle('is-active', !!controlsLayoutState.editMode);
      }
      const layoutOptions = buildVirtualControlsLayoutOptions(controls);
      const effective = controlsLayoutState.editMode
        ? normalizeVirtualControlsLayoutBasic(controlsLayoutState.layout, layoutOptions)
        : normalizeVirtualControlsLayout(controlsLayoutState.layout, layoutOptions);
      const applyBox = (box, conf) => {
        if (!box) return;
        box.style.left = `${(Math.max(0, Math.min(0.9, conf.x)) * 100).toFixed(3)}%`;
        box.style.bottom = `${(Math.max(0, Math.min(0.9, conf.y)) * 100).toFixed(3)}%`;
        box.style.setProperty('--control-scale', String(clampVirtualControlScale(conf.scale, 1)));
      };
      applyBox(controls._dpadBox, effective.dpad);
      applyBox(controls._jumpBox, effective.jump);
      applyBox(controls._quizBox, effective.quiz);
    };
    const syncVirtualControlsLayoutViews = () => {
      getViews().forEach((view) => applyVirtualControlsLayoutToView(view));
    };
    const beginVirtualControlBoxEdit = (e, wrap, key, mode) => {
      if (!controlsLayoutState.editMode) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = wrap.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const getLayoutOptions = () => buildVirtualControlsLayoutOptions(wrap);
      const start = normalizeVirtualControlsLayoutBasic(controlsLayoutState.layout, getLayoutOptions())[key];
      const captureTarget = typeof e.currentTarget?.setPointerCapture === 'function' ? e.currentTarget : null;
      const pointerId = Number.isFinite(Number(e.pointerId)) ? Number(e.pointerId) : null;
      if (captureTarget && pointerId != null) {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch (_error) {
          // ignore capture failures
        }
      }
      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (mode === 'resize') {
          const delta = (dx - dy) / 220;
          controlsLayoutState.layout[key].scale = clampVirtualControlScale(start.scale + delta, start.scale);
        } else {
          const nextX = start.x + (dx / bounds.width);
          const nextY = start.y - (dy / bounds.height);
          controlsLayoutState.layout[key].x = clampVirtualControlPos(nextX, start.x);
          controlsLayoutState.layout[key].y = clampVirtualControlPos(nextY, start.y);
        }
        controlsLayoutState.layout = normalizeVirtualControlsLayoutBasic(controlsLayoutState.layout, getLayoutOptions());
        syncVirtualControlsLayoutViews();
      };
      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (captureTarget && pointerId != null && typeof captureTarget.releasePointerCapture === 'function') {
          try {
            captureTarget.releasePointerCapture(pointerId);
          } catch (_error) {
            // ignore capture failures
          }
        }
        controlsLayoutState.layout = normalizeVirtualControlsLayout(controlsLayoutState.layout, getLayoutOptions());
        saveVirtualControlsLayout();
        syncVirtualControlsLayoutViews();
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', finish, { passive: true });
      window.addEventListener('pointercancel', finish, { passive: true });
    };
    const clearAllInputs = () => {
      keyboardState.left = false;
      keyboardState.right = false;
      const views = getViews();
      views.forEach((view) => {
        if (view?.virtualInput) {
          view.virtualInput.left = false;
          view.virtualInput.right = false;
        }
        const input = view?.state?.input;
        if (!input) return;
        input.left = false;
        input.right = false;
        input.jumpQueued = false;
        input.jumpHeld = false;
        input.jumpLock = false;
      });
    };
    const getViewScale = (viewRect) => {
      const width = Math.max(1, Number(viewRect?.width) || 0);
      const raw = width / 900;
      return Math.max(0.28, Math.min(1, raw));
    };

    const TEST_OBJECT_CULL_MARGIN = 220;

    const buildWorldClone = () => {
      const world = document.createElement('div');
      world.className = 'test-world';
      world.style.width = `${state.map.width}px`;
      world.style.height = `${state.map.height}px`;
      // Test mode uses only the view background layers; editor grid/background must not bleed in.
      world.style.backgroundImage = 'none';
      const objectNodes = [];
      state.objects.forEach((obj) => {
        const el = document.createElement('div');
        el.className = 'map-object';
        el.style.left = `${obj.x}px`;
        el.style.top = `${obj.y}px`;
        const scaleX = obj.flipH ? -obj.scale : obj.scale;
        const scaleY = obj.flipV ? -obj.scale : obj.scale;
        // Match editor geometry order so visual sprite and collision/hitbox coordinates stay consistent.
        el.style.transform = `rotate(${obj.rotation}deg) scale(${scaleX}, ${scaleY})`;
        const source = isTextureSprite(obj.sprite) ? document.createElement('div') : document.createElement('img');
        const hitboxW = Array.isArray(obj.hitboxes) && obj.hitboxes.length
          ? Math.max(...obj.hitboxes.map((hb) => (Number(hb.x) || 0) + (Number(hb.w) || 0)))
          : 320;
        const hitboxH = Array.isArray(obj.hitboxes) && obj.hitboxes.length
          ? Math.max(...obj.hitboxes.map((hb) => (Number(hb.y) || 0) + (Number(hb.h) || 0)))
          : 120;
        const baseW = Math.max(1, hitboxW || 320);
        const baseH = Math.max(1, hitboxH || 120);
        if (isTextureSprite(obj.sprite)) {
          source.className = 'texture-object-fill';
          const fillStyle = getTextureFillStyle(getTextureTypeFromSprite(obj.sprite), obj.textureColor);
          source.style.backgroundImage = fillStyle.image;
          source.style.backgroundColor = fillStyle.color;
          source.style.backgroundSize = fillStyle.size;
          source.style.backgroundRepeat = fillStyle.repeat;
          source.style.width = `${baseW}px`;
          source.style.height = `${baseH}px`;
        } else {
          source.src = `${plateBase}${obj.sprite}`;
          source.draggable = false;
        }
        const crop = obj?.crop && typeof obj.crop === 'object' ? obj.crop : null;
        if (crop) {
          el.style.width = `${crop.w}px`;
          el.style.height = `${crop.h}px`;
          el.style.overflow = 'hidden';
          source.style.position = 'absolute';
          source.style.left = `-${crop.x}px`;
          source.style.top = `-${crop.y}px`;
        } else {
          el.style.overflow = 'visible';
          source.style.position = 'absolute';
          source.style.left = '0px';
          source.style.top = '0px';
        }
        el.appendChild(source);
        world.appendChild(el);
        const visualW = Math.max(1, crop?.w || baseW || 1);
        const visualH = Math.max(1, crop?.h || baseH || 1);
        const absScale = Math.max(0.01, Math.abs(Number(obj.scale) || 1));
        const radius = Math.hypot(visualW * absScale, visualH * absScale) / 2 + TEST_OBJECT_CULL_MARGIN;
        objectNodes.push({
          el,
          centerX: (Number(obj.x) || 0) + (visualW / 2),
          centerY: (Number(obj.y) || 0) + (visualH / 2),
          radius,
          visible: true
        });
      });
      world._objectNodes = objectNodes;
      return world;
    };

    const shouldAllowNativeContextMenu = (target) => {
      if (!(target instanceof Element)) return false;
      return !!target.closest(
        'input, textarea, select, [contenteditable=\"true\"], [data-allow-contextmenu=\"true\"]'
      );
    };

    const suppressContextMenu = (target) => {
      if (!target) return;
      if (contextMenuSuppressedTargets.has(target)) return;
      contextMenuSuppressedTargets.add(target);
      target.addEventListener('contextmenu', (e) => {
        if (shouldAllowNativeContextMenu(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      });
      target.addEventListener('auxclick', (e) => {
        if (e.button !== 2) return;
        if (shouldAllowNativeContextMenu(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      });
    };

    const createControls = (index, quizButton = null) => {
      const wrap = document.createElement('div');
      wrap.className = 'virtual-controls';
      const configPanel = document.createElement('div');
      configPanel.className = 'virtual-controls-config';
      const editToggle = document.createElement('button');
      editToggle.type = 'button';
      editToggle.className = 'virtual-controls-config-btn';
      editToggle.textContent = '조작 편집';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'virtual-controls-config-btn';
      resetBtn.textContent = '기본값';
      configPanel.appendChild(editToggle);
      configPanel.appendChild(resetBtn);

      const dpadBox = document.createElement('div');
      dpadBox.className = 'control-box control-box-dpad';
      const dpadLabel = document.createElement('div');
      dpadLabel.className = 'control-box-label';
      dpadLabel.textContent = '방향키';
      const dpad = document.createElement('div');
      dpad.className = 'dpad';
      const left = document.createElement('button');
      left.textContent = '◀';
      const right = document.createElement('button');
      right.textContent = '▶';
      dpad.appendChild(left);
      dpad.appendChild(right);
      const dpadResize = document.createElement('div');
      dpadResize.className = 'control-box-resize';
      dpadResize.title = '크기 조절';
      dpadBox.appendChild(dpadLabel);
      dpadBox.appendChild(dpad);
      dpadBox.appendChild(dpadResize);

      const jumpBox = document.createElement('div');
      jumpBox.className = 'control-box control-box-jump';
      const jumpLabel = document.createElement('div');
      jumpLabel.className = 'control-box-label';
      jumpLabel.textContent = '점프';
      const jumpWrap = document.createElement('div');
      jumpWrap.className = 'jump-btn';
      const jump = document.createElement('button');
      jump.textContent = '점프';
      jumpWrap.appendChild(jump);
      const jumpResize = document.createElement('div');
      jumpResize.className = 'control-box-resize';
      jumpResize.title = '크기 조절';
      jumpBox.appendChild(jumpLabel);
      jumpBox.appendChild(jumpWrap);
      jumpBox.appendChild(jumpResize);

      let quizBox = null;
      let quizResize = null;
      if (quizButton) {
        quizBox = document.createElement('div');
        quizBox.className = 'control-box control-box-quiz';
        const quizLabel = document.createElement('div');
        quizLabel.className = 'control-box-label';
        quizLabel.textContent = '퀴즈';
        quizResize = document.createElement('div');
        quizResize.className = 'control-box-resize';
        quizResize.title = '크기 조절';
        quizBox.appendChild(quizLabel);
        quizBox.appendChild(quizButton);
        quizBox.appendChild(quizResize);
      }

      const bind = (btn, key) => {
        const activePointers = new Set();
        const setPressedState = (pressed) => {
          const player = getViews()[index];
          if (!player) return;
          if (key === 'jump') {
            if (pressed) {
              if (isStartGuideBlocking(player)) return;
              if (player.state.input.jumpHeld || player.state.input.jumpLock) return;
              player.state.input.jumpQueued = true;
              player.state.input.jumpHeld = true;
              player.state.input.jumpLock = true;
              return;
            }
            player.state.input.jumpHeld = false;
            player.state.input.jumpLock = false;
            return;
          }
          if (!player.virtualInput) player.virtualInput = { left: false, right: false };
          player.virtualInput[key] = !!pressed;
        };
        const releasePointer = (e) => {
          if (e?.pointerId != null) activePointers.delete(e.pointerId);
          if (key === 'jump') {
            if (activePointers.size === 0) setPressedState(false);
            return;
          }
          setPressedState(activePointers.size > 0);
        };

        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (e.pointerId != null) activePointers.add(e.pointerId);
          if (e.pointerId != null && typeof btn.setPointerCapture === 'function') {
            try {
              btn.setPointerCapture(e.pointerId);
            } catch (_err) {
              // best effort only
            }
          }
          setPressedState(true);
        });
        btn.addEventListener('pointerup', releasePointer);
        btn.addEventListener('pointercancel', releasePointer);
        btn.addEventListener('lostpointercapture', releasePointer);
        btn.addEventListener('pointerleave', (e) => {
          // Touch + pointer capture can emit leave while still pressed.
          if (e.pointerType === 'touch') return;
          if (typeof e.buttons === 'number' && e.buttons !== 0) return;
          releasePointer(e);
        });
      };

      bind(left, 'left');
      bind(right, 'right');
      bind(jump, 'jump');
      suppressContextMenu(wrap);
      suppressContextMenu(dpadBox);
      suppressContextMenu(jumpBox);
      suppressContextMenu(dpad);
      suppressContextMenu(jumpWrap);
      suppressContextMenu(left);
      suppressContextMenu(right);
      suppressContextMenu(jump);
      if (quizBox) suppressContextMenu(quizBox);
      if (quizButton) suppressContextMenu(quizButton);

      const bindBoxEditor = (boxEl, key) => {
        boxEl.addEventListener('pointerdown', (e) => {
          if (!controlsLayoutState.editMode) return;
          if (e.target?.closest?.('.control-box-resize')) return;
          beginVirtualControlBoxEdit(e, wrap, key, 'move');
        });
      };
      bindBoxEditor(dpadBox, 'dpad');
      bindBoxEditor(jumpBox, 'jump');
      if (quizBox) bindBoxEditor(quizBox, 'quiz');
      dpadResize.addEventListener('pointerdown', (e) => beginVirtualControlBoxEdit(e, wrap, 'dpad', 'resize'));
      jumpResize.addEventListener('pointerdown', (e) => beginVirtualControlBoxEdit(e, wrap, 'jump', 'resize'));
      if (quizResize) quizResize.addEventListener('pointerdown', (e) => beginVirtualControlBoxEdit(e, wrap, 'quiz', 'resize'));

      editToggle.addEventListener('click', () => {
        controlsLayoutState.editMode = !controlsLayoutState.editMode;
        if (!controlsLayoutState.editMode) {
          controlsLayoutState.layout = normalizeVirtualControlsLayout(controlsLayoutState.layout);
          saveVirtualControlsLayout();
        }
        syncVirtualControlsLayoutViews();
      });
      resetBtn.addEventListener('click', () => {
        controlsLayoutState.layout = normalizeVirtualControlsLayout(DEFAULT_VIRTUAL_CONTROLS_LAYOUT);
        saveVirtualControlsLayout();
        syncVirtualControlsLayoutViews();
      });

      wrap.appendChild(configPanel);
      wrap.appendChild(dpadBox);
      wrap.appendChild(jumpBox);
      if (quizBox) wrap.appendChild(quizBox);
      wrap._configPanel = configPanel;
      wrap._editToggle = editToggle;
      wrap._resetBtn = resetBtn;
      wrap._dpadBox = dpadBox;
      wrap._jumpBox = jumpBox;
      wrap._quizBox = quizBox;
      return wrap;
    };

    const updateWorldObjectCulling = (world, cam, viewRect) => {
      if (!world || !Array.isArray(world._objectNodes) || !cam || !viewRect) return;
      const left = (Number(cam.x) || 0) - TEST_OBJECT_CULL_MARGIN;
      const top = (Number(cam.y) || 0) - TEST_OBJECT_CULL_MARGIN;
      const right = (Number(cam.x) || 0) + (Number(viewRect.width) || 0) + TEST_OBJECT_CULL_MARGIN;
      const bottom = (Number(cam.y) || 0) + (Number(viewRect.height) || 0) + TEST_OBJECT_CULL_MARGIN;
      world._objectNodes.forEach((node) => {
        const r = Number(node.radius) || TEST_OBJECT_CULL_MARGIN;
        const cx = Number(node.centerX) || 0;
        const cy = Number(node.centerY) || 0;
        const visible = !(cx + r < left || cx - r > right || cy + r < top || cy - r > bottom);
        if (node.visible === visible) return;
        node.el.style.display = visible ? '' : 'none';
        node.visible = visible;
      });
    };

    const createQuizUi = () => {
      const gaugeInfo = document.createElement('div');
      gaugeInfo.className = 'test-gauge-info';

      const gaugeLabel = document.createElement('div');
      gaugeLabel.className = 'test-gauge-label';
      gaugeLabel.textContent = '게이지';

      const gaugeBar = document.createElement('div');
      gaugeBar.className = 'test-gauge-bar';
      const gaugeFill = document.createElement('div');
      gaugeFill.className = 'test-gauge-fill';
      gaugeFill.style.width = '4px';
      gaugeFill.style.transform = 'scaleX(1)';
      gaugeBar.appendChild(gaugeFill);

      const gaugeValue = document.createElement('div');
      gaugeValue.className = 'test-gauge-value';
      gaugeValue.textContent = '100';

      gaugeInfo.appendChild(gaugeLabel);
      gaugeInfo.appendChild(gaugeBar);
      gaugeInfo.appendChild(gaugeValue);

      const quizButton = document.createElement('button');
      quizButton.type = 'button';
      quizButton.className = 'test-quiz-button';
      quizButton.textContent = '퀴즈 풀기';

      const panel = document.createElement('div');
      panel.className = 'test-quiz-panel hidden';

      const panelCard = document.createElement('div');
      panelCard.className = 'test-quiz-card';

      const panelHeader = document.createElement('div');
      panelHeader.className = 'test-quiz-header';
      const panelPrompt = document.createElement('div');
      panelPrompt.className = 'test-quiz-prompt';
      panelPrompt.textContent = '문제를 불러오는 중...';
      panelHeader.appendChild(panelPrompt);

      const panelBody = document.createElement('div');
      panelBody.className = 'test-quiz-body';

      const questionWrap = document.createElement('div');
      questionWrap.className = 'test-quiz-question-wrap hidden';
      const questionImg = document.createElement('img');
      questionImg.className = 'test-quiz-question-img';
      questionImg.alt = 'quiz question';
      questionWrap.appendChild(questionImg);

      const shortAnswerWrap = document.createElement('div');
      shortAnswerWrap.className = 'test-quiz-short-answer hidden';
      const shortAnswerInput = document.createElement('input');
      shortAnswerInput.type = 'text';
      shortAnswerInput.className = 'test-quiz-short-answer-input';
      shortAnswerInput.placeholder = '정답 입력';
      shortAnswerInput.setAttribute('autocomplete', 'off');
      shortAnswerInput.setAttribute('spellcheck', 'false');
      const shortAnswerSubmitBtn = document.createElement('button');
      shortAnswerSubmitBtn.type = 'button';
      shortAnswerSubmitBtn.className = 'test-quiz-short-answer-submit';
      shortAnswerSubmitBtn.textContent = '제출';
      shortAnswerWrap.appendChild(shortAnswerInput);
      shortAnswerWrap.appendChild(shortAnswerSubmitBtn);

      const choices = document.createElement('div');
      choices.className = 'test-quiz-choices';

      panelBody.appendChild(questionWrap);
      panelBody.appendChild(shortAnswerWrap);
      panelBody.appendChild(choices);

      const feedback = document.createElement('div');
      feedback.className = 'test-quiz-feedback';

      const actions = document.createElement('div');
      actions.className = 'test-quiz-actions hidden';
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'secondary';
      nextBtn.textContent = '다음 문제';
      const returnBtn = document.createElement('button');
      returnBtn.type = 'button';
      returnBtn.className = 'primary';
      returnBtn.textContent = '맵으로 복귀';
      actions.appendChild(nextBtn);
      actions.appendChild(returnBtn);

      panelCard.appendChild(panelHeader);
      panelCard.appendChild(panelBody);
      panelCard.appendChild(feedback);
      panelCard.appendChild(actions);
      panel.appendChild(panelCard);

      return {
        gaugeInfo,
        gaugeLabel,
        gaugeBar,
        gaugeFill,
        gaugeValue,
        quizButton,
        panel,
        panelCard,
        panelPrompt,
        questionWrap,
        questionImg,
        shortAnswerWrap,
        shortAnswerInput,
        shortAnswerSubmitBtn,
        choices,
        feedback,
        actions,
        nextBtn,
        returnBtn
      };
    };

    const getPlayerGauge = (index) => {
      const playerId = getBridgePlayerId(index);
      if (typeof integration.getPlayerGauge === 'function') {
        return Number(integration.getPlayerGauge(playerId)) || 0;
      }
      if (typeof integration.getGauge === 'function') {
        return Number(integration.getGauge(playerId)) || 0;
      }
      return 0;
    };

    const resetPlayerGauge = (index) => {
      const playerId = getBridgePlayerId(index);
      if (typeof integration.setPlayerGauge === 'function') {
        integration.setPlayerGauge(playerId, QUIZ_GAUGE_START_AMOUNT, {
          playerId,
          zoneId: getBridgeZoneId(index),
          source: 'jumpmap-test-runtime',
          timestamp: Date.now(),
          reason: 'test_reset'
        });
      }
    };

    const setQuizPanelVisible = (playerView, visible) => {
      if (!playerView?.quizUi?.panel) return;
      playerView.quizUi.panel.classList.toggle('hidden', !visible);
      playerView.view.classList.toggle('has-quiz-panel', !!visible);
    };

    const setQuizFeedback = (playerView, message, tone = '') => {
      if (!playerView?.quizUi?.feedback) return;
      const el = playerView.quizUi.feedback;
      const nextMessage = message || '';
      const nextTone = tone || '';
      if (el.dataset.feedbackMessage === nextMessage && el.dataset.feedbackTone === nextTone) {
        return;
      }
      el.textContent = nextMessage;
      el.classList.remove('is-success', 'is-fail', 'is-warn');
      if (nextTone) el.classList.add(nextTone);
      el.dataset.feedbackMessage = nextMessage;
      el.dataset.feedbackTone = nextTone;
    };

    const clearQuizResultFx = (playerView) => {
      if (!playerView) return;
      if (playerView.quizFxTimerId) {
        window.clearTimeout(playerView.quizFxTimerId);
        playerView.quizFxTimerId = 0;
      }
      const ui = playerView.quizUi;
      if (!ui) return;
      ui.panelCard?.classList.remove('quiz-fx-success', 'quiz-fx-fail');
      ui.feedback?.classList.remove('quiz-fx-success', 'quiz-fx-fail');
    };

    const playQuizResultFx = (playerView, correct) => {
      const ui = playerView?.quizUi;
      if (!ui) return;
      runtimeSfx.playQuizResult(!!correct);
      clearQuizResultFx(playerView);
      const fxClass = correct ? 'quiz-fx-success' : 'quiz-fx-fail';
      const targets = [ui.panelCard, ui.feedback].filter(Boolean);
      targets.forEach((el) => {
        el.classList.remove(fxClass);
        // Force reflow so repeated same-result feedback retriggers animation.
        void el.offsetWidth;
        el.classList.add(fxClass);
      });
      playerView.quizFxTimerId = window.setTimeout(() => {
        targets.forEach((el) => el.classList.remove(fxClass));
        playerView.quizFxTimerId = 0;
      }, 980);
    };

    const getQuizState = (playerView) => {
      if (!playerView.quizState) {
        playerView.quizState = {
          phase: 'idle',
          loading: false,
          question: null,
          result: null,
          reward: null,
          lockUntil: 0,
          questionRequestToken: 0
        };
      }
      return playerView.quizState;
    };

    const updateQuizActionButtons = (playerView, now = Date.now()) => {
      const quizState = getQuizState(playerView);
      const ui = playerView.quizUi;
      if (!ui) return;
      const renderCache = playerView.renderCache || (playerView.renderCache = {});
      const waiting = quizState.phase === 'result' && quizState.lockUntil > now;
      const nextBtnDisabled = quizState.phase !== 'result' || waiting;
      if (renderCache.quizNextBtnDisabled !== nextBtnDisabled) {
        ui.nextBtn.disabled = nextBtnDisabled;
        renderCache.quizNextBtnDisabled = nextBtnDisabled;
      }
      // Always allow returning to map when quiz popup is open, even if loading gets stuck.
      const returnBtnDisabled = quizState.phase === 'idle';
      if (renderCache.quizReturnBtnDisabled !== returnBtnDisabled) {
        ui.returnBtn.disabled = returnBtnDisabled;
        renderCache.quizReturnBtnDisabled = returnBtnDisabled;
      }
      if (quizState.phase === 'result' && quizState.result) {
        if (waiting) {
          const remain = Math.ceil((quizState.lockUntil - now) / 1000);
          setQuizFeedback(
            playerView,
            `${quizState.result.correct ? '정답' : '오답'} · ${remain}s 후 선택 가능`,
            quizState.result.correct ? 'is-success' : 'is-fail'
          );
        } else {
          const refill = Math.max(0, Number(quizState.reward?.refillAmount) || 0);
          const gaugeNow = getPlayerGauge(playerView.index);
          const baseText = quizState.result.correct ? '정답입니다!' : '오답입니다.';
          setQuizFeedback(
            playerView,
            `${baseText} 게이지 +${refill} · 현재 ${Math.round(gaugeNow)}`,
            quizState.result.correct ? 'is-success' : 'is-fail'
          );
        }
      }
    };

    const closeQuizPanel = (playerView, meta = {}) => {
      const quizState = getQuizState(playerView);
      const ui = playerView?.quizUi;
      quizState.phase = 'idle';
      quizState.loading = false;
      quizState.question = null;
      quizState.result = null;
      quizState.reward = null;
      quizState.lockUntil = 0;
      if (ui?.shortAnswerInput) {
        ui.shortAnswerInput.value = '';
        ui.shortAnswerInput.disabled = false;
        ui.shortAnswerInput.onkeydown = null;
      }
      if (ui?.shortAnswerSubmitBtn) {
        ui.shortAnswerSubmitBtn.disabled = false;
        ui.shortAnswerSubmitBtn.onclick = null;
      }
      if (ui?.shortAnswerWrap) {
        ui.shortAnswerWrap.classList.add('hidden');
      }
      if (ui?.choices) {
        ui.choices.classList.remove('hidden');
      }
      clearQuizResultFx(playerView);
      setQuizPanelVisible(playerView, false);
      if (typeof integration.emit === 'function') {
        integration.emit('quiz:close', {
          playerId: getBridgePlayerId(playerView.index),
          zoneId: getBridgeZoneId(playerView.index),
          next: 'PLAYING',
          source: 'jumpmap-test-runtime',
          timestamp: Date.now(),
          ...meta
        });
      }
    };

    const isTextChoiceQuestion = (question) => (
      question?.renderKind === 'text_choice'
      || question?.type === 'csv_choice'
    );

    const isTextShortAnswerQuestion = (question) => (
      question?.renderKind === 'text_short_answer'
      || question?.type === 'csv_subjective'
    );

    const gradeShortAnswerForJumpmap = (question, rawInput) => {
      const userAnswer = String(rawInput ?? '').trim();
      const acceptedAnswers = Array.isArray(question?.acceptedAnswers)
        ? question.acceptedAnswers
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
        : [];
      const containsMatch = Boolean(question?.acceptedMatchContains);
      if (!acceptedAnswers.length) {
        return { correct: false, userAnswer };
      }
      const normalizedUser = userAnswer.toLowerCase();
      const correct = containsMatch
        ? acceptedAnswers.some((word) => normalizedUser.includes(word.toLowerCase()))
        : acceptedAnswers.some((word) => normalizedUser === word.toLowerCase());
      return { correct, userAnswer };
    };

    const buildQuizSubmissionValue = (question, rawInput) => {
      if (!isTextShortAnswerQuestion(question)) {
        return {
          engineAnswer: rawInput,
          submittedChoice: rawInput
        };
      }
      const graded = gradeShortAnswerForJumpmap(question, rawInput);
      const acceptedFirst = Array.isArray(question?.acceptedAnswers) && question.acceptedAnswers.length
        ? String(question.acceptedAnswers[0] ?? '').trim()
        : '';
      const canonicalAnswer = String(question?.answer || acceptedFirst || '').trim();
      const engineAnswer = graded.correct
        ? (canonicalAnswer || graded.userAnswer)
        : `__jumpmap_short_answer_wrong__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        engineAnswer,
        submittedChoice: graded.userAnswer
      };
    };

    const renderQuizQuestion = (playerView) => {
      const quizState = getQuizState(playerView);
      const ui = playerView.quizUi;
      const question = quizState.question;
      if (!ui || !question) return;
      const textChoiceQuestion = isTextChoiceQuestion(question);
      const shortAnswerQuestion = isTextShortAnswerQuestion(question);
      const structuredPvamQuestion = Boolean(
        quizRuntimeState.resources?.isPlaceValueAreaModelQuestion
        && quizRuntimeState.resources.isPlaceValueAreaModelQuestion(question)
      );
      ui.panelPrompt.textContent = question.type === 'validity'
        ? (question.mode === 'invalid' ? '잘못된 형태의 전개도를 고르세요' : '올바른 형태의 전개도를 고르세요')
        : (question.prompt || '문제를 풀어주세요');

      const hasQuestionAsset = typeof question.question === 'string' && question.question.trim().length > 0;
      const showQuestionImage = question.type !== 'validity'
        && !textChoiceQuestion
        && !shortAnswerQuestion
        && !structuredPvamQuestion
        && hasQuestionAsset;
      ui.questionWrap.classList.toggle('hidden', !showQuestionImage);
      if (showQuestionImage) {
        ui.questionImg.src = buildQuizAssetUrl(question.question);
      } else {
        ui.questionImg.removeAttribute('src');
      }

      if (ui.shortAnswerWrap) {
        ui.shortAnswerWrap.classList.toggle('hidden', !shortAnswerQuestion);
      }
      if (ui.choices) {
        ui.choices.classList.toggle('hidden', !!shortAnswerQuestion);
      }
      ui.choices.innerHTML = '';
      if (structuredPvamQuestion && typeof quizRuntimeState.resources?.renderPlaceValueAreaModelQuestion === 'function') {
        if (ui.shortAnswerWrap) {
          ui.shortAnswerWrap.classList.add('hidden');
        }
        ui.choices.classList.remove('hidden');
        quizRuntimeState.resources.renderPlaceValueAreaModelQuestion({
          choicesEl: ui.choices,
          question,
          onSubmit: (payload) => {
            submitQuizAnswer(playerView, payload);
          }
        });
      } else if (shortAnswerQuestion) {
        if (ui.shortAnswerInput) {
          ui.shortAnswerInput.value = '';
          ui.shortAnswerInput.disabled = false;
        }
        if (ui.shortAnswerSubmitBtn) {
          ui.shortAnswerSubmitBtn.disabled = false;
          ui.shortAnswerSubmitBtn.onclick = () => {
            const value = String(ui.shortAnswerInput?.value || '').trim();
            submitQuizAnswer(playerView, value);
          };
        }
        if (ui.shortAnswerInput) {
          ui.shortAnswerInput.onkeydown = (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const value = String(ui.shortAnswerInput?.value || '').trim();
            submitQuizAnswer(playerView, value);
          };
          window.requestAnimationFrame(() => {
            try {
              ui.shortAnswerInput.focus({ preventScroll: true });
            } catch (_error) {
              ui.shortAnswerInput.focus();
            }
          });
        }
      } else {
        if (ui.shortAnswerInput) {
          ui.shortAnswerInput.value = '';
          ui.shortAnswerInput.onkeydown = null;
        }
        if (ui.shortAnswerSubmitBtn) {
          ui.shortAnswerSubmitBtn.onclick = null;
        }
        (question.choices || []).forEach((choice, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `test-quiz-choice choice-tone-${(idx % 4) + 1}`;
          btn.dataset.choice = choice;

          const badge = document.createElement('span');
          badge.className = 'test-quiz-choice-badge';
          badge.textContent = `${idx + 1}`;
          btn.appendChild(badge);

          if (textChoiceQuestion) {
            const label = document.createElement('span');
            label.className = 'test-quiz-choice-text';
            label.textContent = String(choice || '');
            btn.appendChild(label);
          } else {
            const img = document.createElement('img');
            img.alt = `choice-${idx + 1}`;
            img.src = buildQuizAssetUrl(choice);
            btn.appendChild(img);
          }

          btn.addEventListener('click', () => {
            submitQuizAnswer(playerView, choice);
          });
          ui.choices.appendChild(btn);
        });
      }

      ui.actions.classList.add('hidden');
      clearQuizResultFx(playerView);
      setQuizFeedback(playerView, '', '');
      updateQuizActionButtons(playerView);
    };

    const renderQuizResult = (playerView) => {
      const quizState = getQuizState(playerView);
      const ui = playerView.quizUi;
      if (!ui || !quizState.result) return;
      const { result, reward } = quizState;
      const answer = quizState.question?.answer;
      [...ui.choices.querySelectorAll('.test-quiz-choice')].forEach((btn) => {
        const value = btn.dataset.choice;
        btn.disabled = true;
        btn.classList.toggle('is-correct', value === answer);
        btn.classList.toggle('is-wrong', value === result.choice && value !== answer);
      });

      const refill = Math.max(0, Number(reward?.refillAmount) || 0);
      const gaugeNow = getPlayerGauge(playerView.index);
      const baseText = result.correct ? '정답입니다!' : '오답입니다.';
      setQuizFeedback(
        playerView,
        `${baseText} 게이지 +${refill} · 현재 ${Math.round(gaugeNow)}`,
        result.correct ? 'is-success' : 'is-fail'
      );
      playQuizResultFx(playerView, result.correct);
      ui.actions.classList.remove('hidden');
      updateQuizActionButtons(playerView);
    };

    const requestQuizQuestion = async (playerView) => {
      const quizState = getQuizState(playerView);
      const ui = playerView.quizUi;
      if (!ui) return;
      try {
        quizState.loading = true;
        quizState.phase = 'loading';
        quizState.question = null;
        quizState.result = null;
        quizState.reward = null;
        quizState.lockUntil = 0;
        const token = (quizState.questionRequestToken || 0) + 1;
        quizState.questionRequestToken = token;
        setQuizPanelVisible(playerView, true);
        ui.panelPrompt.textContent = '문제를 불러오는 중...';
        if (ui.questionWrap) ui.questionWrap.classList.add('hidden');
        if (ui.questionImg) ui.questionImg.removeAttribute('src');
        if (ui.shortAnswerWrap) ui.shortAnswerWrap.classList.add('hidden');
        if (ui.shortAnswerInput) {
          ui.shortAnswerInput.value = '';
          ui.shortAnswerInput.disabled = false;
          ui.shortAnswerInput.onkeydown = null;
        }
        if (ui.shortAnswerSubmitBtn) {
          ui.shortAnswerSubmitBtn.disabled = false;
          ui.shortAnswerSubmitBtn.onclick = null;
        }
        if (ui.choices) ui.choices.innerHTML = '';
        if (ui.choices) ui.choices.classList.remove('hidden');
        if (ui.actions) ui.actions.classList.add('hidden');
        clearQuizResultFx(playerView);
        setQuizFeedback(playerView, '', '');
        console.log('[JumpmapTestRuntime] requestQuizQuestion:start', {
          playerIndex: playerView.index,
          playerId: getBridgePlayerId(playerView.index),
          hasBridge: !!integration,
          hasRequestQuiz: typeof integration.requestQuiz === 'function'
        });

        const payload = {
          playerId: getBridgePlayerId(playerView.index),
          playerIndex: playerView.index,
          zoneId: getBridgeZoneId(playerView.index),
          reason: 'manual_quiz_button',
          source: 'jumpmap-test-runtime',
          timestamp: Date.now()
        };
        console.log('[JumpmapTestRuntime] requestQuizQuestion:beforeRequest', payload);
        const response = typeof integration.requestQuiz === 'function'
          ? await Promise.race([
            integration.requestQuiz(payload),
            new Promise((resolve) => {
              window.setTimeout(() => resolve({
                accepted: false,
                reason: 'quiz_request_timeout'
              }), QUIZ_REQUEST_TIMEOUT_MS);
            })
          ])
          : { accepted: false, reason: 'bridge_missing_requestQuiz' };
        console.log('[JumpmapTestRuntime] requestQuizQuestion:afterRequest', response);
        if (quizState.questionRequestToken !== token) return;
        if (!response?.accepted || !response.question) {
          quizState.phase = 'result';
          quizState.loading = false;
          ui.panelPrompt.textContent = '문제를 불러오지 못했습니다';
          ui.questionWrap.classList.add('hidden');
          ui.questionImg.removeAttribute('src');
          if (ui.shortAnswerWrap) ui.shortAnswerWrap.classList.add('hidden');
          ui.choices.innerHTML = '';
          ui.choices.classList.remove('hidden');
          ui.actions.classList.remove('hidden');
          ui.nextBtn.disabled = false;
          ui.returnBtn.disabled = false;
          setQuizFeedback(playerView, `문제 로드 실패: ${response?.reason || 'unknown'}`, 'is-warn');
          return;
        }
        quizState.phase = 'question';
        quizState.loading = false;
        quizState.question = response.question;
        try {
          renderQuizQuestion(playerView);
        } catch (renderError) {
          console.error('[JumpmapTestRuntime] quiz render failed', renderError, response.question);
          quizState.phase = 'result';
          quizState.loading = false;
          ui.panelPrompt.textContent = '문제 표시 중 오류가 발생했습니다';
          ui.questionWrap.classList.add('hidden');
          ui.questionImg.removeAttribute('src');
          if (ui.shortAnswerWrap) ui.shortAnswerWrap.classList.add('hidden');
          ui.choices.innerHTML = '';
          ui.choices.classList.remove('hidden');
          ui.actions.classList.remove('hidden');
          ui.nextBtn.disabled = false;
          ui.returnBtn.disabled = false;
          setQuizFeedback(playerView, `문제 표시 오류: ${renderError?.message || 'unknown_error'}`, 'is-fail');
        }
      } catch (error) {
        console.error('[JumpmapTestRuntime] quiz request failed', error);
        quizState.phase = 'result';
        quizState.loading = false;
        ui.panelPrompt.textContent = '문제를 불러오지 못했습니다';
        ui.questionWrap.classList.add('hidden');
        ui.questionImg.removeAttribute('src');
        if (ui.shortAnswerWrap) ui.shortAnswerWrap.classList.add('hidden');
        ui.choices.innerHTML = '';
        ui.choices.classList.remove('hidden');
        ui.actions.classList.remove('hidden');
        ui.nextBtn.disabled = false;
        ui.returnBtn.disabled = false;
        setQuizFeedback(playerView, `문제 로드 오류: ${error?.message || 'unknown_error'}`, 'is-fail');
      }
    };

    const submitQuizAnswer = async (playerView, choice) => {
      const quizState = getQuizState(playerView);
      if (quizState.phase !== 'question' || !quizState.question) return;
      const ui = playerView.quizUi;
      if (!ui) return;
      [...ui.choices.querySelectorAll('.test-quiz-choice')].forEach((btn) => {
        btn.disabled = true;
      });
      if (ui.shortAnswerInput) ui.shortAnswerInput.disabled = true;
      if (ui.shortAnswerSubmitBtn) ui.shortAnswerSubmitBtn.disabled = true;
      const question = quizState.question;
      const submission = buildQuizSubmissionValue(question, choice);
      const session = await getOrCreatePlayerQuizSession(playerView.index);
      const result = session.engine.submitAnswer(submission.engineAnswer);
      if (!result) {
        setQuizFeedback(playerView, '채점 실패', 'is-fail');
        return;
      }
      const quizResult = {
        ...result,
        choice: submission.submittedChoice,
        correct: !!result.correct
      };
      if (playerView?.sessionStats) {
        playerView.sessionStats.quizAttempts = (Number(playerView.sessionStats.quizAttempts) || 0) + 1;
        if (quizResult.correct) {
          playerView.sessionStats.quizCorrect = (Number(playerView.sessionStats.quizCorrect) || 0) + 1;
        } else {
          playerView.sessionStats.quizWrong = (Number(playerView.sessionStats.quizWrong) || 0) + 1;
        }
      }
      const reward = typeof integration.applyQuizOutcome === 'function'
        ? integration.applyQuizOutcome(
          { correct: quizResult.correct, questionId: quizResult.questionId },
          {
            playerId: getBridgePlayerId(playerView.index),
            zoneId: getBridgeZoneId(playerView.index),
            source: 'jumpmap-test-runtime',
            timestamp: Date.now()
          },
          {
            playerId: getBridgePlayerId(playerView.index),
            zoneId: getBridgeZoneId(playerView.index),
            source: 'jumpmap-test-runtime',
            timestamp: Date.now()
          }
        )
        : { refillAmount: 0, wrongDelayMs: 0 };

      quizState.phase = 'result';
      quizState.result = quizResult;
      quizState.reward = reward;
      quizState.lockUntil = Date.now() + Math.max(0, Number(reward?.wrongDelayMs) || 0);
      renderQuizResult(playerView);
    };

    const hasSpriteGroundContact = (playerState, metrics, obstacles, playerHitboxPolygon) => {
      if (playerState?.onGround) return true;
      if (typeof detectGroundSupport !== 'function') return false;
      try {
        const hasMoveInput = !!playerState?.input?.left || !!playerState?.input?.right;
        const inputDir = (playerState?.input?.right ? 1 : 0) - (playerState?.input?.left ? 1 : 0);
        const vx = Number(playerState?.vx) || 0;
        const probeDirection = inputDir || (vx > 6 ? 1 : (vx < -6 ? -1 : (Number(playerState?.facing) || 0)));
        // Visual sprite grounding should prioritize actual foot/top contact over input flags.
        // Probe with movement/facing direction first so landing while moving does not miss front-foot support.
        const supportFootY = detectGroundSupport(playerState, metrics, obstacles, {
          maxUp: 6,
          maxDown: 24,
          direction: probeDirection,
          minSupportSamples: 1,
          minSupportSpanPx: 0,
          supportYTolerance: 2.5,
          sampleSpacing: Number(state?.physics?.groundSampleSpacing) || undefined,
          playerHitboxPolygon
        });
        if (supportFootY == null) return false;
        const footY = (Number(playerState?.y) || 0) + (Number(metrics?.height) || 0);
        const gap = supportFootY - footY;
        const vy = Number(playerState?.vy) || 0;
        // If the feet are effectively touching a top surface, switch out of jump/fall quickly.
        if (gap >= -3 && gap <= 12) return true;
        if (hasMoveInput && vy >= -8 && gap >= -4 && gap <= 24) return true;
        // While strongly ascending, avoid false grounded visuals from nearby but not-contacting tops.
        if (vy < -24 && gap > 1.5) return false;
        return gap >= -6 && gap <= 16;
      } catch (_error) {
        return false;
      }
    };

    const getSpriteKeyForState = (playerState, dt, sprites, options = null) => {
      const spriteSet = sprites && typeof sprites === 'object' ? sprites : SPRITES;
      const walkSprites = Array.isArray(spriteSet.walk) && spriteSet.walk.length
        ? spriteSet.walk
        : (Array.isArray(SPRITES.walk) ? SPRITES.walk : []);
      const idleSprite = typeof spriteSet.idle === 'string' && spriteSet.idle.trim()
        ? spriteSet.idle
        : SPRITES.idle;
      const jumpSprite = typeof spriteSet.jump === 'string' && spriteSet.jump.trim()
        ? spriteSet.jump
        : SPRITES.jump;
      const fallSprite = typeof spriteSet.fall === 'string' && spriteSet.fall.trim()
        ? spriteSet.fall
        : SPRITES.fall;
      const groundedForSprite = typeof options?.groundedForSprite === 'boolean'
        ? options.groundedForSprite
        : !!playerState.onGround;
      const vy = Number(playerState?.vy) || 0;
      const safeDt = Math.max(0, Number(dt) || 0);
      const prevSpriteKey = typeof playerState?._spriteKey === 'string' ? playerState._spriteKey : '';
      const prevGroundLatch = Math.max(0, Number(playerState?._spriteGroundLatchSec) || 0);
      const nextGroundLatch = groundedForSprite
        ? 0.12
        : Math.max(0, prevGroundLatch - safeDt);
      playerState._spriteGroundLatchSec = nextGroundLatch;
      const hasMoveInput = !!playerState?.input?.left || !!playerState?.input?.right;
      const prevMoveLatch = Math.max(0, Number(playerState?._spriteMoveLatchSec) || 0);
      const nextMoveLatch = hasMoveInput ? 0.08 : Math.max(0, prevMoveLatch - safeDt);
      playerState._spriteMoveLatchSec = nextMoveLatch;
      const groundedVisual = groundedForSprite || (
        nextGroundLatch > 0 &&
        !playerState?.jumping &&
        vy > -24
      );
      const moveVisual = hasMoveInput || nextMoveLatch > 0;
      if (!groundedVisual && vy < 0) return jumpSprite;
      if (!groundedVisual && vy > 0) return fallSprite;
      // Keep walk animation cycling while a direction key is held on the ground,
      // even if horizontal velocity is temporarily near zero (e.g., wall contact).
      const shouldWalk = groundedVisual && (moveVisual || Math.abs(playerState.vx) > 1);
      if (shouldWalk) {
        const wasWalkSprite = walkSprites.includes(prevSpriteKey);
        if (!wasWalkSprite) {
          // On movement-start / landing contact, immediately show walk1.
          playerState.walkTimer = 0;
          return walkSprites[0] || idleSprite;
        }
        playerState.walkTimer += safeDt;
        const idx = walkSprites.length > 0
          ? Math.floor(playerState.walkTimer / WALK_FRAME_INTERVAL_SEC) % walkSprites.length
          : 0;
        return walkSprites[idx] || idleSprite;
      }
      playerState.walkTimer = 0;
      return idleSprite;
    };

    const buildTestViews = (count) => {
      quizRuntimeState.sessions.clear();
      sceneWarmupState.ready = false;
      sceneWarmupState.promise = null;
      jumpmapGoalState.reached = false;
      jumpmapGoalState.winnerIndex = -1;
      const endConfig = getJumpmapEndConfig();
      jumpmapGoalState.mode = endConfig.mode;
      jumpmapGoalState.quizCountLimit = endConfig.quizCountLimit;
      jumpmapGoalState.quizTimeLimitSec = endConfig.quizTimeLimitSec;
      jumpmapGoalState.topObstacleRef = null;
      jumpmapGoalState.topObstacle = null;
      els.testViews.innerHTML = '';
      els.testViews.style.gridTemplateColumns = `repeat(${count}, 1fr)`;
      els.testViews.dataset.playerCount = String(count);
      const views = [];
      for (let i = 0; i < count; i += 1) {
        const view = document.createElement('div');
        view.className = 'test-view';
        view.style.backgroundColor = state.background.color || PLAY_FALLBACK_BG_COLOR;
        suppressContextMenu(view);
        const bgLayer = document.createElement('div');
        bgLayer.className = 'test-background-layer';
        applyTestBackgroundLayer(bgLayer);
        view.appendChild(bgLayer);

        const camera = document.createElement('div');
        camera.className = 'test-camera';
        const world = buildWorldClone();
        camera.appendChild(world);
        view.appendChild(camera);

        const players = [];
        for (let j = 0; j < count; j += 1) {
          const player = document.createElement('div');
          player.className = `player ${j === i ? 'player-self' : 'player-peer'}`;
          const nameTag = document.createElement('div');
          nameTag.className = 'test-player-name';
          nameTag.textContent = getPlayerDisplayName(j);
          nameTag.style.setProperty('--player-name-color', getPlayerNameColor(j));
          player.appendChild(nameTag);
          const img = document.createElement('img');
          const characterSet = getPlayerCharacterSet(j);
          img.src = `${characterSet.base}${characterSet.sprites.idle}`;
          img.dataset.spriteKey = characterSet.sprites.idle;
          img.dataset.characterId = characterSet.id;
          player.appendChild(img);
          applyPlayerSpriteToElement(player, img);
          world.appendChild(player);
          const debugHitbox = document.createElement('div');
          debugHitbox.className = `test-player-hitbox-debug${j === i ? '' : ' peer'}`;
          debugHitbox.style.display = 'none';
          world.appendChild(debugHitbox);
          players.push({ player, img, nameTag, debugHitbox, index: j });
        }

        const quizUi = createQuizUi();
        const controls = createControls(i, quizUi.quizButton);
        view.appendChild(controls);
        const topHud = document.createElement('div');
        topHud.className = 'test-top-hud';
        const heightInfo = document.createElement('div');
        heightInfo.className = 'test-height-info';
        heightInfo.textContent = '높이 0.00m · 최고 0.00m';
        topHud.appendChild(quizUi.gaugeInfo);
        topHud.appendChild(heightInfo);
        view.appendChild(topHud);
        view.appendChild(quizUi.panel);
        const debugInfo = document.createElement('div');
        debugInfo.className = 'test-view-debug-info';
        debugInfo.style.display = 'none';
        view.appendChild(debugInfo);

        els.testViews.appendChild(view);
        const playerState = createPlayerState();
        resetPlayerStateAt(playerState);
        resetPlayerGauge(i);
        quizUi.quizButton.addEventListener('click', () => {
          requestQuizQuestion(views[i]);
        });
        quizUi.returnBtn.addEventListener('click', () => {
          closeQuizPanel(views[i], { reason: 'return_to_map' });
        });
        quizUi.nextBtn.addEventListener('click', () => {
          const qs = getQuizState(views[i]);
          if (qs.phase !== 'result' || Date.now() < (qs.lockUntil || 0)) return;
          requestQuizQuestion(views[i]);
        });
        views.push({
          index: i,
          view,
          camera,
          world,
          players,
          controls,
          topHud,
          heightInfo,
          quizUi,
          startGuide: null,
          debugInfo,
          bgLayer,
          state: playerState,
          virtualInput: { left: false, right: false },
          renderCache: {
            heightText: '',
            gaugeTransform: '',
            gaugeLow: null,
            quizButtonDisabled: null,
            startGuideHidden: null,
            startGuideCountText: '',
            cameraTransform: '',
            worldTransform: '',
            debugText: ''
          },
          camX: 0,
          camY: 0,
          viewScale: 1,
          startGuideUntil: TEST_START_GUIDE_MS > 0 ? (Date.now() + TEST_START_GUIDE_MS) : 0,
          sessionStats: {
            quizAttempts: 0,
            quizCorrect: 0,
            quizWrong: 0,
            jumps: 0,
            doubleJumps: 0
          }
        });
      }
      obstacleCache = collectObstacleBounds({ objects: state.objects, localPointToWorld });
      els.testViews._views = views;
      syncVirtualControlsLayoutViews();
      beginRecordSession();
    };

    const finishJumpmapByReason = ({
      views,
      reason,
      winnerIndex = -1,
      titleText = '점프맵 종료',
      iconText = '🏁',
      line1Text = '',
      restartReason = 'test_restart',
      emitEvent = 'test:finish',
      emitPayload = {}
    }) => {
      if (jumpmapGoalState.reached) return;
      jumpmapGoalState.reached = true;
      const resolvedWinnerIndex = Number.isInteger(winnerIndex) && winnerIndex >= 0 ? winnerIndex : -1;
      jumpmapGoalState.winnerIndex = resolvedWinnerIndex;
      const winnerName = resolvedWinnerIndex >= 0 ? getPlayerDisplayName(resolvedWinnerIndex) : '';
      const snapshot = collectJumpmapSessionRecord(reason);
      const rankingRows = buildTopReachRanking(views);
      clearAllInputs();
      views.forEach((playerView) => {
        closeQuizPanel(playerView, { reason });
        const guide = buildTopReachFinishGuide({
          winnerName,
          titleText,
          iconText,
          line1Text,
          line2Text: snapshot
            ? buildSessionSummaryLineText(snapshot, reason)
            : '결과를 확인한 뒤 다시 시작하거나 기록/학급관리 화면으로 이동할 수 있습니다.',
          rankingRows,
          snapshot,
          onRestart: () => {
            rebuildActiveTestViews(restartReason);
          },
          onClose: () => {
            exitTestMode(true);
          }
        });
        playerView.view.appendChild(guide);
      });
      saveCurrentJumpmapSessionRecord(reason);
      stopTestLoop();
      integration.emit(emitEvent, {
        reason,
        winnerIndex: resolvedWinnerIndex,
        winnerName,
        source: 'jumpmap-test-runtime',
        timestamp: Date.now(),
        ...emitPayload
      });
    };

    const finishByTopReach = (views, winnerIndex) => {
      const winnerName = getPlayerDisplayName(winnerIndex);
      finishJumpmapByReason({
        views,
        reason: 'reach_top_finish',
        winnerIndex,
        titleText: '점프맵 종료',
        iconText: '🏁',
        line1Text: winnerName ? `${winnerName} 님이 꼭대기에 도달했습니다.` : '',
        restartReason: 'reach_top_retry',
        emitEvent: 'test:reach_top_finish'
      });
    };

    const finishByCountLimit = (views, solvedCount, requiredCount) => {
      const solved = Math.max(0, Math.round(Number(solvedCount) || 0));
      const required = Math.max(1, Math.round(Number(requiredCount) || 1));
      finishJumpmapByReason({
        views,
        reason: 'count_limit_finish',
        titleText: '점프맵 종료',
        iconText: '✅',
        line1Text: `${required}문제를 달성했습니다. (최대 ${solved}문제)`,
        restartReason: 'count_limit_retry',
        emitEvent: 'test:count_limit_finish',
        emitPayload: { solvedCount: solved, requiredCount: required }
      });
    };

    const finishByTimeLimit = (views, elapsedSec, timeLimitSec) => {
      const elapsed = Math.max(0, Math.round(Number(elapsedSec) || 0));
      const limit = Math.max(10, Math.round(Number(timeLimitSec) || 10));
      finishJumpmapByReason({
        views,
        reason: 'time_limit_finish',
        titleText: '점프맵 종료',
        iconText: '⏱️',
        line1Text: `플레이 시간이 종료되었습니다. (${elapsed}/${limit}초)`,
        restartReason: 'time_limit_retry',
        emitEvent: 'test:time_limit_finish',
        emitPayload: { elapsedSec: elapsed, timeLimitSec: limit }
      });
    };

    const startTestLoop = () => {
      stopTestLoop();
      let lastRafTs = 0;

      const loop = (rafTs) => {
        const nowRafTs = Number.isFinite(Number(rafTs)) ? Number(rafTs) : performance.now();
        const rawDt = lastRafTs > 0 ? (nowRafTs - lastRafTs) / 1000 : (1 / 60);
        // Keep physics speed stable across 60/120/144Hz displays while still guarding huge tab-switch jumps.
        const dt = Math.min(0.05, Math.max(1 / 240, rawDt));
        lastRafTs = nowRafTs;
        const views = getViews();
        const frameNow = Date.now();
        const metrics = getPlayerMetrics();
        const playerHitboxPolygon = getPlayerHitboxPolygon ? getPlayerHitboxPolygon() : null;
        const baseMoveSpeed = Math.max(0, Number(state.physics?.moveSpeed) || 220);
        const moveSpeed = baseMoveSpeed * RUNTIME_MOVE_SPEED_SCALE;
        const tunedPhysics = getTunedRuntimePhysics(state.physics);
        const sprite = getPlayerSpriteRender();
        const offset = getPlayerHitboxOffset();
        if (!obstacleCache) {
          obstacleCache = collectObstacleBounds({ objects: state.objects, localPointToWorld });
        }
        const goalFinishEnabled = isLauncherJumpmapPlayMode() && !jumpmapGoalState.reached;
        const topFinishEnabled = (
          goalFinishEnabled &&
          jumpmapGoalState.mode === 'reach-top'
        );
        if (topFinishEnabled && jumpmapGoalState.topObstacleRef !== obstacleCache) {
          jumpmapGoalState.topObstacleRef = obstacleCache;
          jumpmapGoalState.topObstacle = resolveTopGoalObstacle(obstacleCache);
        }
        const topGoalObstacle = topFinishEnabled ? jumpmapGoalState.topObstacle : null;
        let reachedTopPlayerIndex = -1;
        views.forEach((playerView) => {
          const ps = playerView.state;
          const vi = playerView.virtualInput || { left: false, right: false };
          const useKeyboard = playerView === views[0];
          const quizState = getQuizState(playerView);
          const now = frameNow;
          const quizBlocking = quizState.phase !== 'idle';
          const startGuideBlocking = isStartGuideBlocking(playerView, now);
          const controlBlocking = quizBlocking || startGuideBlocking;
          const playerId = getBridgePlayerId(playerView.index);
          const zoneId = getBridgeZoneId(playerView.index);
          const gaugeNow = getPlayerGauge(playerView.index);
          const wasOnGround = !!ps.onGround;
          const prevX = ps.x;
          const prevJumpsUsed = ps.jumpsUsed || 0;
          const prevJumpedFromGround = !!ps.jumpedFromGround;

          const wantLeft = !!vi.left || (useKeyboard && keyboardState.left);
          const wantRight = !!vi.right || (useKeyboard && keyboardState.right);
          ps.input.left = controlBlocking ? false : wantLeft;
          ps.input.right = controlBlocking ? false : wantRight;
          const hadMoveInput = !!ps.input.left || !!ps.input.right;

          if (controlBlocking) {
            ps.input.jumpQueued = false;
            ps.input.jumpHeld = false;
            ps.input.jumpLock = false;
          } else if (ps.input.jumpQueued && gaugeNow <= 0) {
            const wantsGroundJump = wasOnGround;
            if (wantsGroundJump) {
              ps.input.jumpQueued = false;
              ps.input.jumpHeld = false;
              ps.input.jumpLock = false;
            }
          }

          if (!controlBlocking && gaugeNow <= 0 && wasOnGround) {
            ps.input.left = false;
            ps.input.right = false;
          }

          stepPlayerState({
            playerState: ps,
            dt,
            moveSpeed,
            physics: tunedPhysics,
            metrics,
            playerHitboxPolygon,
            map: state.map,
            objects: state.objects,
            obstacles: obstacleCache,
            worldPointToLocal,
            localPointToWorld
          });

          const movedOnGround =
            !controlBlocking &&
            hadMoveInput &&
            (Math.abs(ps.x - prevX) > 0.001) &&
            (ps.onGround || wasOnGround);
          if (movedOnGround && typeof integration.consumeAction === 'function') {
            integration.consumeAction(
              'move',
              { dtSec: dt, playerId, zoneId, onGround: !!ps.onGround },
              { playerId, zoneId, source: 'jumpmap-test-runtime', timestamp: now }
            );
          }

          const nextJumpsUsed = ps.jumpsUsed || 0;
          if (!controlBlocking && nextJumpsUsed > prevJumpsUsed) {
            const action = prevJumpsUsed === 0 ? 'jump' : 'doubleJump';
            runtimeSfx.playJump(action === 'doubleJump');
            if (typeof integration.consumeAction === 'function') {
              integration.consumeAction(
                action,
                { playerId, zoneId, onGroundBefore: wasOnGround },
                { playerId, zoneId, source: 'jumpmap-test-runtime', timestamp: now }
              );
            }
            if (playerView?.sessionStats) {
              if (action === 'doubleJump') {
                playerView.sessionStats.doubleJumps = (Number(playerView.sessionStats.doubleJumps) || 0) + 1;
              } else {
                playerView.sessionStats.jumps = (Number(playerView.sessionStats.jumps) || 0) + 1;
              }
            }
          }

          const currentHeight = getPlayerHeightValue(ps, metrics);
          const best = Math.max(Number(ps.maxHeight) || 0, currentHeight);
          ps.maxHeight = best;
          const groundedForSprite = hasSpriteGroundContact(ps, metrics, obstacleCache, playerHitboxPolygon);
          const playerCharacterSet = getPlayerCharacterSet(playerView.index);
          ps._spriteKey = getSpriteKeyForState(ps, dt, playerCharacterSet.sprites, { groundedForSprite });
          if (
            reachedTopPlayerIndex < 0 &&
            topGoalObstacle &&
            isPlayerTouchingTopGoal(ps, metrics, topGoalObstacle)
          ) {
            reachedTopPlayerIndex = playerView.index;
          }
        });

        if (reachedTopPlayerIndex >= 0) {
          finishByTopReach(views, reachedTopPlayerIndex);
          return;
        }

        if (goalFinishEnabled && jumpmapGoalState.mode === 'count') {
          const requiredCount = Math.max(20, Math.round(Number(jumpmapGoalState.quizCountLimit) || 20));
          const solvedCount = views.reduce((maxValue, playerView) => (
            Math.max(maxValue, Math.max(0, Math.round(Number(playerView?.sessionStats?.quizAttempts) || 0)))
          ), 0);
          if (solvedCount >= requiredCount) {
            finishByCountLimit(views, solvedCount, requiredCount);
            return;
          }
        }

        if (goalFinishEnabled && jumpmapGoalState.mode === 'time') {
          const timeLimitSec = Math.max(10, Math.round(Number(jumpmapGoalState.quizTimeLimitSec) || 300));
          const startedAt = Number(recordRuntimeState.sessionStartedAt) || 0;
          if (startedAt > 0) {
            const elapsedSec = Math.max(0, Math.ceil((frameNow - startedAt) / 1000));
            if (elapsedSec >= timeLimitSec) {
              finishByTimeLimit(views, elapsedSec, timeLimitSec);
              return;
            }
          }
        }

        views.forEach((playerView, viewIndex) => {
          const view = playerView.view;
          const camera = playerView.camera;
          const world = playerView.world;
          const heightInfo = playerView.heightInfo;
          const showDebug = !!state.test?.showDebugHitbox;
          const bgLayer = playerView.bgLayer;
          const now = frameNow;
          const renderCache = playerView.renderCache || (playerView.renderCache = {});

          playerView.players.forEach(({ player, img, nameTag, debugHitbox, index }) => {
            const ps = views[index]?.state;
            if (!ps) return;
            const nextLeft = `${ps.x + sprite.offsetX - offset.x}px`;
            const nextTop = `${ps.y + sprite.offsetY - offset.y}px`;
            if (player.style.left !== nextLeft) player.style.left = nextLeft;
            if (player.style.top !== nextTop) player.style.top = nextTop;
            if (nameTag) {
              const nextName = getPlayerDisplayName(index);
              if (nameTag.textContent !== nextName) nameTag.textContent = nextName;
              const nextColor = getPlayerNameColor(index);
              if (nameTag.dataset.color !== nextColor) {
                nameTag.style.setProperty('--player-name-color', nextColor);
                nameTag.dataset.color = nextColor;
              }
            }
            const facing = ps.facing === -1 ? -1 : 1;
            const nextFacingTransform = `scaleX(${facing})`;
            if (img.style.transform !== nextFacingTransform) {
              img.style.transform = nextFacingTransform;
            }
            const characterSet = getPlayerCharacterSet(index);
            const spriteKey = ps._spriteKey || characterSet.sprites.idle;
            if (img.dataset.characterId !== characterSet.id || img.dataset.spriteKey !== spriteKey) {
              img.src = `${characterSet.base}${spriteKey}`;
              img.dataset.spriteKey = spriteKey;
              img.dataset.characterId = characterSet.id;
            }
            if (showDebug && debugHitbox) {
              debugHitbox.style.display = 'block';
              debugHitbox.style.left = `${ps.x}px`;
              debugHitbox.style.top = `${ps.y}px`;
              debugHitbox.style.width = `${metrics.width}px`;
              debugHitbox.style.height = `${metrics.height}px`;
              debugHitbox.classList.toggle('peer', index !== viewIndex);
            } else if (debugHitbox) {
              debugHitbox.style.display = 'none';
            }
          });

          const current = views[viewIndex]?.state;
          if (!current) return;
          if (heightInfo) {
            const currentHeight = getPlayerHeightValue(current, metrics);
            const bestHeight = Math.max(Number(current.maxHeight) || 0, currentHeight);
            const startHeightPx = Math.max(0, Number(current.startHeightPx) || currentHeight);
            const currentRelativePx = Math.max(0, currentHeight - startHeightPx);
            const bestRelativePx = Math.max(0, bestHeight - startHeightPx);
            const nextHeightText = `높이 ${toHeightMetersText(currentRelativePx)} · 최고 ${toHeightMetersText(bestRelativePx)}`;
            if (renderCache.heightText !== nextHeightText) {
              heightInfo.textContent = nextHeightText;
              renderCache.heightText = nextHeightText;
            }
          }
          if (playerView.quizUi?.gaugeInfo) {
            const gaugeCurrent = Math.max(0, Number(getPlayerGauge(viewIndex)) || 0);
            const gaugePercentRaw = Math.max(0, (gaugeCurrent / QUIZ_GAUGE_DISPLAY_CAP) * 100);
            const gaugeBarScale = Math.max(0, (gaugeCurrent * QUIZ_GAUGE_PX_PER_UNIT) / 4);
            const gaugePercentVisible = Math.max(0, Math.min(100, gaugePercentRaw));
            if (playerView.quizUi.gaugeFill) {
              // Infinite-feel gauge bar: it grows rightward and gets clipped by the visible viewport area.
              const nextGaugeTransform = `scaleX(${gaugeBarScale})`;
              if (renderCache.gaugeTransform !== nextGaugeTransform) {
                playerView.quizUi.gaugeFill.style.transform = nextGaugeTransform;
                renderCache.gaugeTransform = nextGaugeTransform;
              }
              const isLowGauge = gaugePercentVisible <= 25;
              if (renderCache.gaugeLow !== isLowGauge) {
                playerView.quizUi.gaugeFill.classList.toggle('is-low', isLowGauge);
                renderCache.gaugeLow = isLowGauge;
              }
            }
          }
          if (playerView.quizUi?.quizButton) {
            const qs = getQuizState(playerView);
            const nextDisabled = qs.phase !== 'idle';
            if (renderCache.quizButtonDisabled !== nextDisabled) {
              playerView.quizUi.quizButton.disabled = nextDisabled;
              renderCache.quizButtonDisabled = nextDisabled;
            }
          }
          if (playerView.startGuide) {
            const hideGuide = !isStartGuideBlocking(playerView, now);
            if (renderCache.startGuideHidden !== hideGuide) {
              playerView.startGuide.classList.toggle('hidden', hideGuide);
              renderCache.startGuideHidden = hideGuide;
            }
            if (!hideGuide && playerView.startGuide._countdownEl) {
              const remainingMs = Math.max(0, Number(playerView.startGuideUntil || 0) - now);
              const countdownText = remainingMs > 0
                ? String(Math.max(1, Math.ceil(remainingMs / 1000)))
                : (spriteWarmupState.ready ? '1' : '준비');
              if (renderCache.startGuideCountText !== countdownText) {
                playerView.startGuide._countdownEl.textContent = countdownText;
                renderCache.startGuideCountText = countdownText;
              }
            }
          }
          const qState = getQuizState(playerView);
          if (qState.phase !== 'idle' || !playerView.quizUi?.panel?.classList.contains('hidden')) {
            updateQuizActionButtons(playerView, now);
          }
          const viewRect = {
            width: Math.max(1, view.clientWidth || view.offsetWidth || 1),
            height: Math.max(1, view.clientHeight || view.offsetHeight || 1)
          };
          const viewScale = getViewScale(viewRect);
          playerView.viewScale = viewScale;
          const scaledViewRect = {
            ...viewRect,
            width: viewRect.width / viewScale,
            height: viewRect.height / viewScale
          };
          const safeYBias = Number.isFinite(Number(state?.camera?.yBias))
            ? Number(state.camera.yBias)
            : 0.46;
          const rawCam = computeCameraPosition({
            playerState: current,
            viewRect: scaledViewRect,
            map: state.map,
            yBias: safeYBias
          });
          const cam = {
            x: Number.isFinite(Number(rawCam?.x)) ? Number(rawCam.x) : 0,
            y: Number.isFinite(Number(rawCam?.y)) ? Number(rawCam.y) : 0
          };
          if (bgLayer) {
            applyTestBackgroundLayer(bgLayer, cam, scaledViewRect);
          }
          updateWorldObjectCulling(world, cam, scaledViewRect);
          const nextCameraTransform = `scale(${viewScale})`;
          if (renderCache.cameraTransform !== nextCameraTransform) {
            camera.style.transform = nextCameraTransform;
            renderCache.cameraTransform = nextCameraTransform;
          }
          const nextWorldTransform = `translate(${-cam.x}px, ${-cam.y}px)`;
          if (renderCache.worldTransform !== nextWorldTransform) {
            world.style.transform = nextWorldTransform;
            renderCache.worldTransform = nextWorldTransform;
          }
          playerView.camX = cam.x;
          playerView.camY = cam.y;
          if (playerView.debugInfo) {
            if (showDebug) {
              playerView.debugInfo.style.display = 'block';
              const nextDebugText = `x:${Math.round(current.x)} y:${Math.round(current.y)} vy:${Math.round(current.vy)} ground:${current.onGround ? 'Y' : 'N'} jumps:${current.jumpsUsed}`;
              if (renderCache.debugText !== nextDebugText) {
                playerView.debugInfo.textContent = nextDebugText;
                renderCache.debugText = nextDebugText;
              }
            } else {
              playerView.debugInfo.style.display = 'none';
            }
          }
        });

        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    };

    const enterTestMode = () => {
      if (state.test.active) return;
      ensureQuizGatewayInstalled();
      clearAllInputs();
      state.test.active = true;
      els.testOverlay.classList.remove('hidden');
      suppressContextMenu(els.testOverlay);
      suppressContextMenu(els.testViews);
      buildTestViews(state.test.players);
      warmupRuntimeSceneAssets(getViews());
      startTestLoop();
      postRuntimeReadyWhenPrepared();
      integration.emit('test:enter', {
        players: state.test.players
      });
    };

    const restartTestMode = () => {
      if (!state.test.active) return;
      rebuildActiveTestViews('test_restart');
      integration.emit('test:restart', {
        players: state.test.players
      });
    };

    const hardExitTestMode = (reason = 'test_exit') => {
      saveCurrentJumpmapSessionRecord(reason);
      clearAllInputs();
      state.test.active = false;
      els.testOverlay.classList.add('hidden');
      stopTestLoop();
      quizRuntimeState.sessions.clear();
      jumpmapGoalState.reached = false;
      jumpmapGoalState.winnerIndex = -1;
      recordRuntimeState.activeSessionSeq = 0;
      els.testViews.innerHTML = '';
      delete els.testViews.dataset.playerCount;
      integration.emit('test:exit', { reason });
    };

    const showTestExitSummary = (reason = 'test_exit') => {
      const views = getViews();
      if (!state.test.active || !Array.isArray(views) || !views.length) return false;
      const snapshot = collectJumpmapSessionRecord(reason);
      if (!snapshot) return false;
      jumpmapGoalState.reached = true;
      jumpmapGoalState.winnerIndex = -1;
      clearAllInputs();
      stopTestLoop();
      const rankingRows = buildTopReachRanking(views);
      views.forEach((playerView) => {
        closeQuizPanel(playerView, { reason });
        playerView.view.querySelectorAll('.test-start-guide.is-result').forEach((el) => el.remove());
        const guide = buildTopReachFinishGuide({
          titleText: '점프맵 결과',
          iconText: '📊',
          line1Text: '테스트를 종료했습니다.',
          line2Text: buildSessionSummaryLineText(snapshot, reason),
          rankingRows,
          snapshot,
          onRestart: () => {
            rebuildActiveTestViews('test_exit_retry');
          },
          onClose: () => {
            hardExitTestMode('test_exit_close');
          }
        });
        playerView.view.appendChild(guide);
      });
      saveCurrentJumpmapSessionRecord(reason);
      integration.emit('test:exit_summary', {
        reason,
        players: state.test.players,
        at: Date.now()
      });
      return true;
    };

    const exitTestMode = (forceClose = false) => {
      if (!state.test.active) return;
      if (forceClose || jumpmapGoalState.reached) {
        hardExitTestMode('test_exit');
        return;
      }
      const shown = showTestExitSummary('test_exit');
      if (!shown) {
        hardExitTestMode('test_exit');
      }
    };

    const warpToSavePoint = (savePointId) => {
      if (!state.test.active) return false;
      const point = getSavePointById(savePointId);
      if (!point) return false;
      getViews().forEach((view) => resetPlayerStateAt(view.state, point));
      integration.emit('test:warp_to_savepoint', {
        savePointId,
        x: point.x,
        y: point.y
      });
      return true;
    };

    const onPlayerCountClick = (e) => {
      if (!e.target.dataset.count) return;
      const count = Number(e.target.dataset.count);
      if (!Number.isFinite(count)) return;
      state.test.players = Math.max(1, Math.min(6, Math.round(count)));
      Array.from(els.playerCount.querySelectorAll('button')).forEach((btn) => {
        btn.classList.toggle('is-active', Number(btn.dataset.count) === state.test.players);
      });
      if (state.test.active) rebuildActiveTestViews('test_player_count_change');
      integration.emit('test:player_count_changed', {
        players: state.test.players,
        active: !!state.test.active
      });
    };

    const setPlayerCount = (count) => {
      const normalized = Math.max(1, Math.min(6, Math.round(Number(count) || 1)));
      state.test.players = normalized;
      Array.from(els.playerCount.querySelectorAll('button')).forEach((btn) => {
        btn.classList.toggle('is-active', Number(btn.dataset.count) === normalized);
      });
      if (state.test.active) rebuildActiveTestViews('test_player_count_change');
      integration.emit('test:player_count_changed', {
        players: normalized,
        active: !!state.test.active
      });
    };

    const onKeyDown = (e) => {
      if (!state.test.active) return;
      const first = getViews()[0];
      if (!first) return;
      if (isStartGuideBlocking(first)) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        keyboardState.left = true;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        keyboardState.right = true;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        if (first.state.input.jumpHeld || first.state.input.jumpLock) return;
        first.state.input.jumpQueued = true;
        first.state.input.jumpHeld = true;
        first.state.input.jumpLock = true;
      }
    };

    const onKeyUp = (e) => {
      if (!state.test.active) return;
      const first = getViews()[0];
      if (!first) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        keyboardState.left = false;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        keyboardState.right = false;
      }
      if (e.key === ' ') {
        e.preventDefault();
        first.state.input.jumpHeld = false;
        first.state.input.jumpLock = false;
      }
    };

    const onWindowBlur = () => {
      clearAllInputs();
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearAllInputs();
    };

    const isSessionFinished = () => !!jumpmapGoalState.reached;

    const isTestActive = () => !!state.test.active;

    return {
      enterTestMode,
      restartTestMode,
      exitTestMode,
      isSessionFinished,
      isTestActive,
      warpToSavePoint,
      setPlayerCount,
      onPlayerCountClick,
      onKeyDown,
      onKeyUp,
      onWindowBlur,
      onVisibilityChange
    };
  };

  window.JumpmapTestRuntime = { create };
})();
