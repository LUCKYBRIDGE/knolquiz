import { buildWeightedQuestionBank } from '../quiz/core/bank.js';
import { cloneWithShuffledChoices } from '../quiz/core/selection.js';
import { parseCsvQuestionBank } from '../quiz/core/importers/csv-question-bank.js';
import { saveBattleshipSessionRecord } from '../shared/local-game-records.js';

const STORAGE_KEY = 'jumpmap.launcher.setup.v1';
const SHIP_IMAGE_SRC = '../quiz_battleship/battleship-ship.png';
const ELITE_UNLOCK_TIME_SEC = 240;
const ENEMY_TIER_UNLOCK_STEP_SEC = 24;
const ELITE_TIER_UNLOCK_STEP_SEC = 30;
const SPAWN_START_COOLDOWN_MS = 2000;
const SPAWN_MIN_COOLDOWN_MS = 620;
const SPAWN_DECAY_PER_SEC = 3.1;
const HP_GROWTH_STEP_SEC = 30;
const HP_GROWTH_PER_STEP = 0.14;
const SPEED_GROWTH_STEP_SEC = 45;
const SPEED_GROWTH_PER_STEP = 0.06;
const TOUCH_GROWTH_STEP_SEC = 55;
const TOUCH_GROWTH_PER_STEP = 0.06;
const SIZE_GROWTH_STEP_SEC = 75;
const ELITE_CHANCE_BASE = 0.08;
const ELITE_CHANCE_MAX = 0.55;
const ELITE_CHANCE_GROWTH_WINDOW_SEC = 280;
const EARLY_ONE_SHOT_WINDOW_SEC = 55;
const EARLY_ONE_SHOT_MAX_TIER = 4;
const EARLY_EASE_WINDOW_SEC = 120;
const EARLY_SOFTCAP_T1 = 7;
const EARLY_SOFTCAP_T2 = 11;
const EARLY_SOFTCAP_T3 = 16;
const FLOW_CYCLE_SEC = 54;
const FLOW_LULL_START_SEC = 10;
const FLOW_LULL_END_SEC = 20;
const FLOW_SURGE_START_SEC = 32;
const FLOW_SURGE_END_SEC = 40;
const FLOW_AFTERSHOCK_END_SEC = 46;
const ENEMY_DEFINITIONS = Object.freeze([
  { tier: 1, code: '01', name: '도깨비불', file: 'battleship-01ddokaebibul.png', baseHp: 34, baseSpeed: 58, baseTouchDamage: 8, baseSize: 56 },
  { tier: 2, code: '02', name: '물귀신', file: 'battleship-02mulguisin.png', baseHp: 46, baseSpeed: 62, baseTouchDamage: 9, baseSize: 58 },
  { tier: 3, code: '03', name: '창귀', file: 'battleship-03chang-gwi.png', baseHp: 58, baseSpeed: 65, baseTouchDamage: 10, baseSize: 60 },
  { tier: 4, code: '04', name: '어둑시니', file: 'battleship-04eoduksini.png', baseHp: 72, baseSpeed: 68, baseTouchDamage: 11, baseSize: 62 },
  { tier: 5, code: '05', name: '영노', file: 'battleship-05yeongno.png', baseHp: 88, baseSpeed: 71, baseTouchDamage: 13, baseSize: 64 },
  { tier: 6, code: '06', name: '묘두사', file: 'battleship-06myodusa.png', baseHp: 106, baseSpeed: 74, baseTouchDamage: 14, baseSize: 66 },
  { tier: 7, code: '07', name: '그슨대', file: 'battleship-07geuseundae.png', baseHp: 126, baseSpeed: 78, baseTouchDamage: 16, baseSize: 68 },
  { tier: 8, code: '08', name: '불가사리', file: 'battleship-08bulgasari.png', baseHp: 148, baseSpeed: 82, baseTouchDamage: 18, baseSize: 70 },
  { tier: 9, code: '09', name: '두억시니', file: 'battleship-09dueoksini.png', baseHp: 174, baseSpeed: 86, baseTouchDamage: 20, baseSize: 72 },
  { tier: 10, code: '10', name: '이무기', file: 'battleship-10imugi.png', baseHp: 202, baseSpeed: 90, baseTouchDamage: 23, baseSize: 74 }
]);

const PRESET_TYPE_COUNTS = Object.freeze({
  'jumpmap-net-30': { all: 5 },
  'jumpmap-net-12': { all: 2 },
  'cube-only-24': { cube: 8 },
  'cuboid-only-24': { cuboid: 8 }
});

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const els = {
  shipHp: document.getElementById('ship-hp'),
  killScore: document.getElementById('kill-score'),
  goldValue: document.getElementById('gold-value'),
  expValue: document.getElementById('exp-value'),
  attackSpeedStat: document.getElementById('attack-speed-stat'),
  attackSpeedLevelStat: document.getElementById('attack-speed-level-stat'),
  attackPowerStat: document.getElementById('attack-power-stat'),
  attackPowerLevelStat: document.getElementById('attack-power-level-stat'),
  projectileCountStat: document.getElementById('projectile-count-stat'),
  projectileLevelStat: document.getElementById('projectile-level-stat'),
  dpsStat: document.getElementById('dps-stat'),
  status: document.getElementById('status-text'),
  buyHealBtn: document.getElementById('buy-heal-btn'),
  openQuizBtn: document.getElementById('open-quiz-btn'),
  upgradeSpeedBtn: document.getElementById('upgrade-speed-btn'),
  upgradePowerBtn: document.getElementById('upgrade-power-btn'),
  upgradeBulletBtn: document.getElementById('upgrade-bullet-btn'),
  dangerLevel: document.getElementById('danger-level'),
  aliveEnemyCount: document.getElementById('alive-enemy-count'),
  normalTierState: document.getElementById('normal-tier-state'),
  eliteTierState: document.getElementById('elite-tier-state'),
  nextNormalTierTime: document.getElementById('next-normal-tier-time'),
  nextEliteTierTime: document.getElementById('next-elite-tier-time'),
  spawnCooldown: document.getElementById('spawn-cooldown'),
  nextSpawnTime: document.getElementById('next-spawn-time'),
  flowState: document.getElementById('flow-state'),
  quizLayer: document.getElementById('quiz-layer'),
  quizCloseBtn: document.getElementById('quiz-close-btn'),
  quizPrompt: document.getElementById('quiz-prompt'),
  quizQuestionAsset: document.getElementById('quiz-question-asset'),
  quizChoices: document.getElementById('quiz-choices'),
  quizResult: document.getElementById('quiz-result'),
  gameoverLayer: document.getElementById('gameover-layer'),
  gameoverScore: document.getElementById('gameover-score'),
  gameoverTime: document.getElementById('gameover-time'),
  restartBtn: document.getElementById('restart-btn')
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const shuffleArray = (items) => {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const readSetup = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const setup = (() => {
  const source = readSetup() || {};
  const names = Array.isArray(source.playerNames) ? source.playerNames : ['사용자1'];
  const tags = Array.isArray(source.playerTags) ? source.playerTags : [''];
  return {
    playerName: String(names[0] || '사용자1').trim() || '사용자1',
    playerTag: String(tags[0] || '').trim(),
    launcherQuizPresetId: typeof source.quizPresetId === 'string' ? source.quizPresetId : 'jumpmap-net-30',
    customCsvEnabled: source.customCsvEnabled === true,
    customCsvText: typeof source.customCsvText === 'string' ? source.customCsvText : '',
    customCsvFileName: typeof source.customCsvFileName === 'string' ? source.customCsvFileName : ''
  };
})();

const isBattleUsableQuestion = (question) => (
  question
  && Array.isArray(question.choices)
  && question.choices.length >= 2
  && typeof question.answer !== 'undefined'
);

const state = {
  running: true,
  paused: false,
  gameover: false,
  startAtMs: performance.now(),
  lastFrameMs: performance.now(),
  spawnCooldownMs: SPAWN_START_COOLDOWN_MS,
  nextSpawnMs: 1100,
  nextShotMs: 0,
  ship: {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 38,
    maxHp: 300,
    hp: 300,
    attackPower: 14,
    attackSpeedLevel: 0,
    attackPowerLevel: 0,
    projectileLevel: 0,
    projectileCount: 1,
    expSpent: 0,
    goldSpent: 0
  },
  score: {
    kills: 0,
    gold: 0,
    exp: 0,
    quizSolved: 0
  },
  waves: {
    level: 1,
    elapsedSec: 0
  },
  flow: {
    label: '보통',
    spawnCooldownMul: 1,
    speedMul: 1,
    capBonus: 0,
    hardenedBonus: 0
  },
  activeSpawnCooldownMs: SPAWN_START_COOLDOWN_MS,
  enemyImages: new Map(),
  eliteAnnouncedTier: 0,
  quiz: {
    loading: false,
    loaded: false,
    error: '',
    questions: [],
    currentQuestion: null
  },
  enemies: [],
  projectiles: [],
  statusText: '전투 시작'
};

const shipImage = new Image();
shipImage.src = SHIP_IMAGE_SRC;

const getAttackCooldownMs = () => {
  const speedMultiplier = 1 + state.ship.attackSpeedLevel * 0.12;
  return 620 / speedMultiplier;
};

const getHealCost = () => 24 + Math.floor(state.ship.goldSpent / 45) * 4;
const getSpeedUpgradeCost = () => Math.round(22 * Math.pow(1.35, state.ship.attackSpeedLevel));
const getPowerUpgradeCost = () => Math.round(26 * Math.pow(1.4, state.ship.attackPowerLevel));
const getBulletUpgradeCost = () => Math.round(40 * Math.pow(1.55, state.ship.projectileLevel));

const setStatus = (text) => {
  state.statusText = text;
  if (els.status) els.status.textContent = text;
};

const distance = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
};

const getDrawSizeByLongEdge = (image, longEdge) => {
  if (!image || !image.naturalWidth || !image.naturalHeight) return null;
  const base = Math.max(image.naturalWidth, image.naturalHeight);
  if (!Number.isFinite(base) || base <= 0) return null;
  const scale = longEdge / base;
  return {
    width: image.naturalWidth * scale,
    height: image.naturalHeight * scale
  };
};

const formatSecText = (seconds) => `${Math.max(0, Number(seconds) || 0).toFixed(1)}초`;

const getSecondsToNextNormalTier = (elapsedSec) => {
  const tier = getUnlockedEnemyTier(elapsedSec);
  if (tier >= 10) return 0;
  const nextAt = (tier - 1) * ENEMY_TIER_UNLOCK_STEP_SEC;
  return Math.max(0, nextAt - elapsedSec);
};

const getSecondsToNextEliteTier = (elapsedSec) => {
  const eliteTier = getEliteUnlockedTier(elapsedSec);
  if (eliteTier >= 10) return 0;
  const nextAt = eliteTier <= 0
    ? ELITE_UNLOCK_TIME_SEC
    : ELITE_UNLOCK_TIME_SEC + eliteTier * ELITE_TIER_UNLOCK_STEP_SEC;
  return Math.max(0, nextAt - elapsedSec);
};

const getDangerLevel = () => {
  const elapsedLevel = 1 + Math.floor(state.waves.elapsedSec / 45);
  const tierBonus = Math.floor(getUnlockedEnemyTier(state.waves.elapsedSec) / 2);
  const eliteBonus = getEliteUnlockedTier(state.waves.elapsedSec) > 0 ? 2 : 0;
  return Math.max(1, elapsedLevel + tierBonus + eliteBonus);
};

const getFlowState = (elapsedSec) => {
  const cyclePos = ((elapsedSec % FLOW_CYCLE_SEC) + FLOW_CYCLE_SEC) % FLOW_CYCLE_SEC;
  const pulse = Math.sin(elapsedSec * 0.45) * 0.08;

  let flow = {
    label: '보통',
    spawnCooldownMul: 1,
    speedMul: 1,
    capBonus: 0,
    hardenedBonus: 0
  };

  if (cyclePos >= FLOW_LULL_START_SEC && cyclePos < FLOW_LULL_END_SEC) {
    flow = {
      label: '완급-완',
      spawnCooldownMul: 1.35,
      speedMul: 0.9,
      capBonus: -2,
      hardenedBonus: -0.03
    };
  } else if (cyclePos >= FLOW_SURGE_START_SEC && cyclePos < FLOW_SURGE_END_SEC) {
    flow = {
      label: '러시',
      spawnCooldownMul: 0.68,
      speedMul: 1.18,
      capBonus: 5,
      hardenedBonus: 0.12
    };
  } else if (cyclePos >= FLOW_SURGE_END_SEC && cyclePos < FLOW_AFTERSHOCK_END_SEC) {
    flow = {
      label: '압박',
      spawnCooldownMul: 0.84,
      speedMul: 1.08,
      capBonus: 2,
      hardenedBonus: 0.06
    };
  }

  return {
    ...flow,
    spawnCooldownMul: clamp(flow.spawnCooldownMul * (1 - pulse * 0.45), 0.55, 1.55),
    speedMul: clamp(flow.speedMul * (1 + pulse), 0.82, 1.3)
  };
};

const resolveQuizAssetPath = (rawPath) => {
  const value = String(rawPath || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('data:')) return value;
  if (value.startsWith('facecolor/') || value.startsWith('edgecolor/') || value.startsWith('invalid/')) {
    return `../quiz/nets/${value}`;
  }
  if (value.endsWith('.svg')) {
    return `../quiz/nets/${value}`;
  }
  return value;
};

const createPresetSettings = (presetId) => {
  const base = {
    questionTypes: {
      cube_facecolor: { enabled: true, count: 2 },
      cube_edgecolor: { enabled: true, count: 2 },
      cube_validity: { enabled: true, count: 2 },
      cuboid_facecolor: { enabled: true, count: 2 },
      cuboid_edgecolor: { enabled: true, count: 2 },
      cuboid_validity: { enabled: true, count: 2 }
    },
    selectionMode: 'random',
    avoidRepeat: true,
    shuffleChoices: true
  };
  const rule = PRESET_TYPE_COUNTS[presetId] || { all: 2 };

  if (rule.cube) {
    Object.keys(base.questionTypes).forEach((key) => {
      const enabled = key.startsWith('cube_');
      base.questionTypes[key] = {
        enabled,
        count: enabled ? rule.cube : 0
      };
    });
  } else if (rule.cuboid) {
    Object.keys(base.questionTypes).forEach((key) => {
      const enabled = key.startsWith('cuboid_');
      base.questionTypes[key] = {
        enabled,
        count: enabled ? rule.cuboid : 0
      };
    });
  } else {
    const count = Math.max(1, Number(rule.all) || 2);
    Object.keys(base.questionTypes).forEach((key) => {
      base.questionTypes[key] = { enabled: true, count };
    });
  }
  return base;
};

const loadBaseBanks = async () => {
  const [facecolor, edgecolor, validity] = await Promise.all([
    fetch('../quiz/data/facecolor-questions.json', { cache: 'no-store' }).then((res) => res.json()),
    fetch('../quiz/data/edgecolor-questions.json', { cache: 'no-store' }).then((res) => res.json()),
    fetch('../quiz/data/validity-questions.json', { cache: 'no-store' }).then((res) => res.json())
  ]);
  return { facecolor, edgecolor, validity };
};

const loadQuizBank = async () => {
  if (state.quiz.loading || state.quiz.loaded) return;
  state.quiz.loading = true;
  state.quiz.error = '';
  try {
    if (setup.launcherQuizPresetId === 'csv-upload' && setup.customCsvEnabled && setup.customCsvText.trim()) {
      const parsed = parseCsvQuestionBank(setup.customCsvText);
      if (!parsed.valid || !parsed.bank?.questions?.length) {
        throw new Error(parsed.errors?.[0] || 'CSV 문제를 불러오지 못했습니다.');
      }
      state.quiz.questions = shuffleArray(parsed.bank.questions.filter(isBattleUsableQuestion));
      if (!state.quiz.questions.length) {
        throw new Error('전투 퀴즈는 객관식 문항(선택지 2개 이상)만 사용할 수 있습니다.');
      }
      state.quiz.loaded = true;
      return;
    }

    const banks = await loadBaseBanks();
    const settings = createPresetSettings(setup.launcherQuizPresetId);
    const built = buildWeightedQuestionBank(banks, settings);
    if (!built?.questions?.length) {
      throw new Error('퀴즈 문제풀이용 문제를 구성하지 못했습니다.');
    }
    state.quiz.questions = shuffleArray(built.questions.filter(isBattleUsableQuestion));
    if (!state.quiz.questions.length) {
      throw new Error('전투 퀴즈로 사용할 객관식 문항이 없습니다.');
    }
    state.quiz.loaded = true;
  } catch (error) {
    state.quiz.error = error instanceof Error ? error.message : '퀴즈 데이터를 불러오지 못했습니다.';
  } finally {
    state.quiz.loading = false;
  }
};

const preloadEnemyImages = () => {
  ENEMY_DEFINITIONS.forEach((def) => {
    const image = new Image();
    image.src = `../quiz_battleship/${def.file}`;
    state.enemyImages.set(def.tier, image);
  });
};

const getUnlockedEnemyTier = (elapsedSec) => {
  const tier = 2 + Math.floor(Math.max(0, elapsedSec) / ENEMY_TIER_UNLOCK_STEP_SEC);
  return clamp(tier, 2, 10);
};

const pickEnemyDefinition = (maxTier, { preferHigh = false } = {}) => {
  const defs = ENEMY_DEFINITIONS.filter((def) => def.tier <= maxTier);
  if (!defs.length) return ENEMY_DEFINITIONS[0];
  const totalWeight = defs.reduce((sum, def) => {
    const weight = preferHigh
      ? (1 + (def.tier - 1) * 0.42)
      : (1 + (maxTier - def.tier) * 0.35);
    return sum + weight;
  }, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];
    const weight = preferHigh
      ? (1 + (def.tier - 1) * 0.42)
      : (1 + (maxTier - def.tier) * 0.35);
    r -= weight;
    if (r <= 0) return def;
  }
  return defs[defs.length - 1];
};

const getEliteUnlockedTier = (elapsedSec) => {
  if (elapsedSec < ELITE_UNLOCK_TIME_SEC) return 0;
  const tier = 1 + Math.floor((elapsedSec - ELITE_UNLOCK_TIME_SEC) / ELITE_TIER_UNLOCK_STEP_SEC);
  return clamp(tier, 1, 10);
};

const shouldSpawnEliteEnemy = (elapsedSec, eliteTier) => {
  if (eliteTier <= 0) return false;
  const chance = clamp(
    ELITE_CHANCE_BASE + ((elapsedSec - ELITE_UNLOCK_TIME_SEC) / ELITE_CHANCE_GROWTH_WINDOW_SEC) * 0.5,
    ELITE_CHANCE_BASE,
    ELITE_CHANCE_MAX
  );
  return Math.random() < chance;
};

const getEnemySpawnPoint = (radius) => {
  const offset = Math.max(48, Math.round(radius + 24));
  const side = Math.floor(Math.random() * 4);
  if (side === 0) {
    return {
      x: Math.random() * canvas.width,
      y: -offset
    };
  }
  if (side === 1) {
    return {
      x: canvas.width + offset,
      y: Math.random() * canvas.height
    };
  }
  if (side === 2) {
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + offset
    };
  }
  return {
    x: -offset,
    y: Math.random() * canvas.height
  };
};

const shouldSpawnHardenedEnemy = (elapsedSec, flow, def) => {
  if (elapsedSec < 65) return false;
  const tierBonus = Math.max(0, def.tier - 1) * 0.008;
  const elapsedBonus = clamp((elapsedSec - 65) / 420, 0, 1) * 0.14;
  const flowBonus = Number(flow?.hardenedBonus) || 0;
  const chance = clamp(0.03 + tierBonus + elapsedBonus + flowBonus, 0.01, 0.36);
  return Math.random() < chance;
};

const createEnemyFromDefinition = (def, elapsedSec, options = {}) => {
  const elite = options.elite === true;
  const hardened = options.hardened === true;
  const flowSpeedMul = Number(options.flowSpeedMul) > 0 ? Number(options.flowSpeedMul) : 1;
  const hpScale = 1 + Math.floor(elapsedSec / HP_GROWTH_STEP_SEC) * HP_GROWTH_PER_STEP;
  const speedScale = 1 + Math.floor(elapsedSec / SPEED_GROWTH_STEP_SEC) * SPEED_GROWTH_PER_STEP;
  const touchScale = 1 + Math.floor(elapsedSec / TOUCH_GROWTH_STEP_SEC) * TOUCH_GROWTH_PER_STEP;
  const normalHp = Math.round((def.baseHp + Math.random() * 8) * hpScale);
  const normalSpeed = (def.baseSpeed + Math.random() * 14) * speedScale;
  const normalTouchDamage = Math.round(def.baseTouchDamage * touchScale);
  const normalSize = def.baseSize + Math.floor(elapsedSec / SIZE_GROWTH_STEP_SEC);

  const def10 = ENEMY_DEFINITIONS[9];
  const normalTier10Hp = def10.baseHp * hpScale;
  const normalTier10Speed = def10.baseSpeed * speedScale;
  const normalTier10Touch = def10.baseTouchDamage * touchScale;
  const tierFactor = 1 + (def.tier - 1) * 0.18;
  const eliteStrengthStep = def.tier - 1;

  let hp = elite
    ? Math.round(Math.max(
      normalHp * (2.3 + eliteStrengthStep * 0.15),
      normalTier10Hp * (1.18 + eliteStrengthStep * 0.14)
    ))
    : normalHp;
  let speed = elite
    ? Math.max(
      normalSpeed * (1.14 + eliteStrengthStep * 0.03),
      normalTier10Speed * (1.02 + eliteStrengthStep * 0.03)
    )
    : normalSpeed;
  let touchDamage = elite
    ? Math.round(Math.max(
      normalTouchDamage * (1.45 + eliteStrengthStep * 0.1),
      normalTier10Touch * (1.08 + eliteStrengthStep * 0.11)
    ))
    : normalTouchDamage;
  const renderSize = elite
    ? Math.round((normalSize + 8) * (1.12 + eliteStrengthStep * 0.03))
    : normalSize;
  const radius = Math.max(14, Math.round(renderSize * (elite ? 0.33 : 0.3) * tierFactor * 0.82));
  const spawnPoint = getEnemySpawnPoint(radius);

  if (!elite) {
    const earlyProgress = clamp(elapsedSec / EARLY_EASE_WINDOW_SEC, 0, 1);
    const oneShotTargetHp = Math.max(1, Math.round(state.ship.attackPower * (0.7 + def.tier * 0.06)));
    hp = Math.max(1, Math.round(hp * earlyProgress + oneShotTargetHp * (1 - earlyProgress)));
    speed *= (0.7 + 0.3 * earlyProgress);
    touchDamage = Math.max(1, Math.round(touchDamage * (0.65 + 0.35 * earlyProgress)));

    if (elapsedSec <= EARLY_ONE_SHOT_WINDOW_SEC && def.tier <= EARLY_ONE_SHOT_MAX_TIER) {
      hp = Math.min(hp, Math.max(1, state.ship.attackPower - 1));
    }
  }

  if (hardened && !elite) {
    hp = Math.round(hp * (1.78 + (def.tier - 1) * 0.04));
    speed *= 0.92;
    touchDamage = Math.max(1, Math.round(touchDamage * (1.52 + (def.tier - 1) * 0.03)));
  }

  speed *= flowSpeedMul;

  return {
    id: `enemy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tier: def.tier,
    typeCode: def.code,
    typeName: def.name,
    elite,
    hardened,
    x: spawnPoint.x,
    y: spawnPoint.y,
    radius,
    speed,
    hp,
    maxHp: hp,
    touchDamage,
    image: state.enemyImages.get(def.tier) || null,
    renderSize
  };
};

const spawnEnemy = (flow) => {
  const elapsedSec = state.waves.elapsedSec;
  const softCap = elapsedSec < 60
    ? EARLY_SOFTCAP_T1
    : (elapsedSec < 140 ? EARLY_SOFTCAP_T2 : (elapsedSec < 240 ? EARLY_SOFTCAP_T3 : Number.POSITIVE_INFINITY));
  const adjustedSoftCap = Math.max(5, softCap + (Number(flow?.capBonus) || 0));
  if (state.enemies.length >= adjustedSoftCap) return;

  const unlockedTier = getUnlockedEnemyTier(elapsedSec);
  const eliteTier = getEliteUnlockedTier(elapsedSec);
  const elite = shouldSpawnEliteEnemy(elapsedSec, eliteTier);
  const maxTier = elite ? eliteTier : unlockedTier;
  const def = pickEnemyDefinition(maxTier, { preferHigh: elite });
  const hardened = !elite && shouldSpawnHardenedEnemy(elapsedSec, flow, def);
  const enemy = createEnemyFromDefinition(def, elapsedSec, {
    elite,
    hardened,
    flowSpeedMul: Number(flow?.speedMul) || 1
  });
  state.enemies.push(enemy);

  if (hardened && Math.random() < 0.12) {
    setStatus(`강화 ${def.name} 출현! 체력과 접촉 피해가 높습니다.`);
  }
};

const getNearestEnemy = () => {
  if (!state.enemies.length) return null;
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    const d = distance(state.ship.x, state.ship.y, enemy.x, enemy.y);
    if (d < nearestDist) {
      nearest = enemy;
      nearestDist = d;
    }
  }
  return nearest;
};

const shootAt = (target) => {
  if (!target) return;
  const count = Math.max(1, state.ship.projectileCount);
  const baseAngle = Math.atan2(target.y - state.ship.y, target.x - state.ship.x);
  const spread = count > 1 ? 0.26 : 0;
  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0 : (i / (count - 1));
    const angle = baseAngle + (ratio - 0.5) * spread;
    state.projectiles.push({
      x: state.ship.x + Math.cos(angle) * 34,
      y: state.ship.y + Math.sin(angle) * 34,
      vx: Math.cos(angle) * 430,
      vy: Math.sin(angle) * 430,
      radius: 5,
      damage: state.ship.attackPower
    });
  }
};

const addKillReward = (enemy) => {
  const tier = Math.max(1, Number(enemy?.tier) || 1);
  const eliteBonus = enemy?.elite ? 2 : 0;
  state.score.kills += 1;
  state.score.gold += 2 + tier + eliteBonus;
  if (enemy?.elite) {
    state.score.exp += 2 + Math.floor(tier / 2);
  }
  if (state.score.kills % 10 === 0) {
    state.score.exp += 4;
    setStatus(`연속 격파 보너스! EXP +4 (누적 ${state.score.kills}킬)`);
  }
};

const applyQuizRewards = (question, correct) => {
  if (!correct) {
    setStatus('오답! 보상을 받지 못했습니다.');
    return;
  }
  const difficulty = Math.max(1, Number(question?.difficulty) || 1);
  const gainedExp = 8 + difficulty * 3;
  const gainedGold = 5 + difficulty * 2;
  state.score.exp += gainedExp;
  state.score.gold += gainedGold;
  state.score.quizSolved += 1;
  setStatus(`정답! EXP +${gainedExp}, GOLD +${gainedGold}`);
};

const closeQuizLayer = () => {
  state.paused = false;
  state.quiz.currentQuestion = null;
  els.quizLayer.classList.remove('show');
  els.quizResult.textContent = '';
  els.quizResult.className = 'quiz-result';
};

const renderQuizQuestion = (question) => {
  els.quizChoices.innerHTML = '';
  els.quizResult.textContent = '';
  els.quizResult.className = 'quiz-result';
  const prompt = String(question?.prompt || '알맞은 답을 고르세요.').trim();
  els.quizPrompt.textContent = prompt || '알맞은 답을 고르세요.';

  const questionAsset = resolveQuizAssetPath(question?.question);
  if (questionAsset) {
    els.quizQuestionAsset.src = questionAsset;
    els.quizQuestionAsset.style.display = 'block';
  } else {
    els.quizQuestionAsset.removeAttribute('src');
    els.quizQuestionAsset.style.display = 'none';
  }

  const choices = Array.isArray(question?.choices) ? question.choices.slice() : [];
  const questionType = String(question?.type || '');
  const shouldUseTextChoice = questionType === 'csv_choice' || questionType === 'csv_subjective';

  choices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-choice';
    if (shouldUseTextChoice) {
      btn.textContent = `${index + 1}. ${String(choice || '').trim()}`;
    } else {
      const asset = resolveQuizAssetPath(choice);
      if (asset && asset.includes('.svg')) {
        const img = document.createElement('img');
        img.src = asset;
        img.alt = `선택지 ${index + 1}`;
        btn.appendChild(img);
      } else {
        btn.textContent = `${index + 1}. ${String(choice || '').trim()}`;
      }
    }
    btn.addEventListener('click', () => {
      if (!state.quiz.currentQuestion) return;
      const correct = String(choice) === String(state.quiz.currentQuestion.answer);
      applyQuizRewards(state.quiz.currentQuestion, correct);
      els.quizResult.textContent = correct ? '정답! 보상을 반영했습니다.' : '오답입니다.';
      els.quizResult.className = `quiz-result ${correct ? 'ok' : 'no'}`;
      state.quiz.currentQuestion = null;
      window.setTimeout(() => {
        closeQuizLayer();
      }, 500);
    });
    els.quizChoices.appendChild(btn);
  });
};

const openQuizLayer = async () => {
  if (state.gameover) return;
  setStatus('퀴즈를 준비하는 중...');
  await loadQuizBank();
  if (state.quiz.error) {
    setStatus(state.quiz.error);
    return;
  }
  if (!state.quiz.questions.length) {
    setStatus('퀴즈 문제풀이용 문제가 없습니다.');
    return;
  }
  state.paused = true;
  let next = state.quiz.questions.pop();
  if (!next) {
    await loadQuizBank();
    next = state.quiz.questions.pop();
  }
  if (!next) {
    state.paused = false;
    setStatus('퀴즈 문제를 다시 구성하지 못했습니다.');
    return;
  }
  state.quiz.currentQuestion = Array.isArray(next?.choices)
    ? cloneWithShuffledChoices(next)
    : { ...next, choices: [] };
  renderQuizQuestion(state.quiz.currentQuestion);
  els.quizLayer.classList.add('show');
};

const updateGame = (dtSec, nowMs) => {
  if (state.paused) return;
  state.waves.elapsedSec += dtSec;
  state.waves.level = 1 + Math.floor(state.waves.elapsedSec / 20);

  const eliteTier = getEliteUnlockedTier(state.waves.elapsedSec);
  if (eliteTier > state.eliteAnnouncedTier) {
    state.eliteAnnouncedTier = eliteTier;
    const code = String(eliteTier).padStart(2, '0');
    const enemyName = ENEMY_DEFINITIONS[eliteTier - 1]?.name || '특수 몬스터';
    setStatus(`붉은 특수효과 ${code} ${enemyName} 해금! 일반 10단계보다 강합니다.`);
  }

  state.spawnCooldownMs = Math.max(
    SPAWN_MIN_COOLDOWN_MS,
    SPAWN_START_COOLDOWN_MS - state.waves.elapsedSec * SPAWN_DECAY_PER_SEC
  );
  const flow = getFlowState(state.waves.elapsedSec);
  state.flow = flow;
  state.activeSpawnCooldownMs = clamp(
    state.spawnCooldownMs * flow.spawnCooldownMul,
    Math.max(280, SPAWN_MIN_COOLDOWN_MS * 0.55),
    SPAWN_START_COOLDOWN_MS * 1.75
  );
  state.nextSpawnMs -= dtSec * 1000;
  while (state.nextSpawnMs <= 0) {
    spawnEnemy(flow);
    state.nextSpawnMs += state.activeSpawnCooldownMs;
  }

  if (nowMs >= state.nextShotMs) {
    const nearestEnemy = getNearestEnemy();
    if (nearestEnemy) {
      shootAt(nearestEnemy);
      state.nextShotMs = nowMs + getAttackCooldownMs();
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const bullet = state.projectiles[i];
    bullet.x += bullet.vx * dtSec;
    bullet.y += bullet.vy * dtSec;
    if (bullet.x < -20 || bullet.x > canvas.width + 20 || bullet.y < -20 || bullet.y > canvas.height + 20) {
      state.projectiles.splice(i, 1);
      continue;
    }

    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (distance(bullet.x, bullet.y, enemy.x, enemy.y) > bullet.radius + enemy.radius) continue;
      enemy.hp -= bullet.damage;
      hit = true;
      if (enemy.hp <= 0) {
        state.enemies.splice(j, 1);
        addKillReward(enemy);
      }
      break;
    }
    if (hit) state.projectiles.splice(i, 1);
  }

  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const angle = Math.atan2(state.ship.y - enemy.y, state.ship.x - enemy.x);
    enemy.x += Math.cos(angle) * enemy.speed * dtSec;
    enemy.y += Math.sin(angle) * enemy.speed * dtSec;

    const touched = distance(enemy.x, enemy.y, state.ship.x, state.ship.y) <= enemy.radius + state.ship.radius;
    if (!touched) continue;

    state.ship.hp = Math.max(0, state.ship.hp - enemy.touchDamage);
    state.enemies.splice(i, 1);
    setStatus(`거북선 피격! HP -${enemy.touchDamage}`);
    if (state.ship.hp <= 0) {
      state.running = false;
      state.gameover = true;
    }
  }
};

const drawHpBar = (x, y, width, hp, maxHp, color = '#ef4444') => {
  const ratio = maxHp > 0 ? clamp(hp / maxHp, 0, 1) : 0;
  ctx.fillStyle = 'rgba(20, 23, 35, 0.22)';
  ctx.fillRect(x, y, width, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * ratio, 6);
};

const drawGame = () => {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#d9e7ff');
  gradient.addColorStop(1, '#9ec0ef');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(15, 30, 60, 0.16)';
  for (let i = 0; i < 12; i += 1) {
    const y = i * 52 + 14;
    ctx.fillRect(0, y, canvas.width, 1);
  }

  let shipW = 122;
  let shipH = 88;
  const shipSize = getDrawSizeByLongEdge(shipImage, 150);
  if (shipSize) {
    shipW = shipSize.width;
    shipH = shipSize.height;
  }
  const shipX = state.ship.x - shipW / 2;
  const shipY = state.ship.y - shipH / 2;

  if (shipImage.complete && shipImage.naturalWidth > 0) {
    ctx.drawImage(shipImage, shipX, shipY, shipW, shipH);
  } else {
    ctx.fillStyle = '#6b3f1f';
    ctx.fillRect(shipX, shipY + 24, shipW, 42);
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(shipX + 6, shipY + 14, shipW - 12, 16);
  }

  drawHpBar(shipX, shipY - 12, shipW, state.ship.hp, state.ship.maxHp, '#22c55e');

  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    const image = enemy?.image;
    if (enemy.elite) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 30, 30, 0.75)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 40, 40, 0.35)';
      ctx.arc(enemy.x, enemy.y, enemy.radius * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (image && image.complete && image.naturalWidth > 0) {
      const enemySize = getDrawSizeByLongEdge(image, enemy.renderSize);
      const drawW = enemySize ? enemySize.width : enemy.renderSize;
      const drawH = enemySize ? enemySize.height : enemy.renderSize;
      const drawX = enemy.x - drawW / 2;
      const drawY = enemy.y - drawH / 2;
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
      if (enemy.elite) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255, 30, 30, 0.22)';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.restore();
      }
      drawHpBar(enemy.x - 22, drawY - 10, 44, enemy.hp, enemy.maxHp, enemy.elite ? '#dc2626' : '#f97316');
    } else {
      ctx.beginPath();
      ctx.fillStyle = enemy.elite ? '#dc2626' : '#be123c';
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      drawHpBar(enemy.x - 20, enemy.y - enemy.radius - 10, 40, enemy.hp, enemy.maxHp, enemy.elite ? '#dc2626' : '#f97316');
    }
  }

  for (let i = 0; i < state.projectiles.length; i += 1) {
    const bullet = state.projectiles[i];
    ctx.beginPath();
    ctx.fillStyle = '#facc15';
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(10, 20, 40, 0.75)';
  ctx.font = '700 16px Apple SD Gothic Neo, Malgun Gothic, sans-serif';
  ctx.fillText(`Wave Lv.${state.waves.level}`, 14, 26);
  const unlockedTier = getUnlockedEnemyTier(state.waves.elapsedSec);
  ctx.fillText(`적 ${state.enemies.length}명 · 출현 01~${String(unlockedTier).padStart(2, '0')}`, 14, 48);
  const eliteTier = getEliteUnlockedTier(state.waves.elapsedSec);
  if (eliteTier > 0) {
    ctx.fillText(`붉은특수 01~${String(eliteTier).padStart(2, '0')} 출현`, 14, 70);
  }
  if (state.paused && !state.gameover) {
    ctx.fillStyle = 'rgba(8, 15, 35, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '900 28px Apple SD Gothic Neo, Malgun Gothic, sans-serif';
    ctx.fillText('퀴즈 진행 중', canvas.width / 2 - 72, canvas.height / 2);
  }
};

const refreshHud = () => {
  els.shipHp.textContent = `${Math.max(0, Math.round(state.ship.hp))} / ${state.ship.maxHp}`;
  els.killScore.textContent = String(state.score.kills);
  els.goldValue.textContent = String(state.score.gold);
  els.expValue.textContent = String(state.score.exp);

  const speedMultiplier = 1 + state.ship.attackSpeedLevel * 0.12;
  const shotsPerSec = 1000 / getAttackCooldownMs();
  const dps = state.ship.attackPower * state.ship.projectileCount * shotsPerSec;
  if (els.attackSpeedStat) {
    els.attackSpeedStat.textContent = `x${speedMultiplier.toFixed(2)} · ${shotsPerSec.toFixed(2)}/s`;
  }
  if (els.attackSpeedLevelStat) {
    els.attackSpeedLevelStat.textContent = `Lv.${state.ship.attackSpeedLevel}`;
  }
  if (els.attackPowerStat) {
    els.attackPowerStat.textContent = String(state.ship.attackPower);
  }
  if (els.attackPowerLevelStat) {
    els.attackPowerLevelStat.textContent = `Lv.${state.ship.attackPowerLevel}`;
  }
  if (els.projectileCountStat) {
    els.projectileCountStat.textContent = `x${state.ship.projectileCount}`;
  }
  if (els.projectileLevelStat) {
    els.projectileLevelStat.textContent = `Lv.${state.ship.projectileLevel}`;
  }
  if (els.dpsStat) {
    els.dpsStat.textContent = dps.toFixed(1);
  }

  const elapsedSec = state.waves.elapsedSec;
  const normalTier = getUnlockedEnemyTier(elapsedSec);
  const eliteTier = getEliteUnlockedTier(elapsedSec);
  const nextNormalSec = getSecondsToNextNormalTier(elapsedSec);
  const nextEliteSec = getSecondsToNextEliteTier(elapsedSec);
  const nextSpawnSec = Math.max(0, state.nextSpawnMs / 1000);

  if (els.dangerLevel) els.dangerLevel.textContent = `Lv.${getDangerLevel()}`;
  if (els.aliveEnemyCount) els.aliveEnemyCount.textContent = String(state.enemies.length);
  if (els.normalTierState) els.normalTierState.textContent = `01~${String(normalTier).padStart(2, '0')}`;
  if (els.eliteTierState) {
    els.eliteTierState.textContent = eliteTier > 0
      ? `01~${String(eliteTier).padStart(2, '0')}`
      : '대기';
  }
  if (els.nextNormalTierTime) {
    els.nextNormalTierTime.textContent = normalTier >= 10 ? '최대 단계' : formatSecText(nextNormalSec);
  }
  if (els.nextEliteTierTime) {
    els.nextEliteTierTime.textContent = eliteTier >= 10 ? '최대 단계' : formatSecText(nextEliteSec);
  }
  if (els.spawnCooldown) els.spawnCooldown.textContent = formatSecText(state.activeSpawnCooldownMs / 1000);
  if (els.nextSpawnTime) els.nextSpawnTime.textContent = formatSecText(nextSpawnSec);
  if (els.flowState) els.flowState.textContent = state.flow?.label || '보통';

  const healCost = getHealCost();
  els.buyHealBtn.textContent = `체력 회복 (${healCost}G)`;
  els.buyHealBtn.disabled = state.score.gold < healCost || state.ship.hp >= state.ship.maxHp || state.gameover;

  const speedCost = getSpeedUpgradeCost();
  els.upgradeSpeedBtn.textContent = `공격속도 업 (${speedCost}EXP)`;
  els.upgradeSpeedBtn.disabled = state.score.exp < speedCost || state.gameover;

  const powerCost = getPowerUpgradeCost();
  els.upgradePowerBtn.textContent = `공격력 업 (${powerCost}EXP)`;
  els.upgradePowerBtn.disabled = state.score.exp < powerCost || state.gameover;

  const bulletCost = getBulletUpgradeCost();
  els.upgradeBulletBtn.textContent = `총알 개수 업 (${bulletCost}EXP)`;
  els.upgradeBulletBtn.disabled = state.score.exp < bulletCost || state.gameover;

  if (state.quiz.loading) {
    els.openQuizBtn.textContent = '퀴즈 준비 중...';
  } else {
    els.openQuizBtn.textContent = '퀴즈 열기';
  }
  els.openQuizBtn.disabled = state.quiz.loading || state.gameover;
};

let sessionSaved = false;
const saveSessionRecord = async () => {
  if (sessionSaved) return;
  sessionSaved = true;
  try {
    await saveBattleshipSessionRecord({
      settings: {
        playerCount: 1,
        launcherQuizPresetId: setup.launcherQuizPresetId,
        shipMaxHp: state.ship.maxHp,
        survivedSec: Math.max(0, Math.round(state.waves.elapsedSec)),
        maxWaveLevel: state.waves.level
      },
      players: [{
        name: setup.playerName,
        tag: setup.playerTag,
        kills: state.score.kills,
        quizSolved: state.score.quizSolved,
        shipHp: Math.max(0, Math.round(state.ship.hp)),
        expSpent: state.ship.expSpent,
        goldSpent: state.ship.goldSpent
      }],
      source: 'battleship-play'
    });
  } catch (error) {
    console.warn('[Battleship] failed to save local record', error);
  }
};

const showGameover = async () => {
  await saveSessionRecord();
  els.gameoverScore.textContent = `점수(격파 수): ${state.score.kills}`;
  els.gameoverTime.textContent = `생존 시간: ${Math.max(0, Math.round(state.waves.elapsedSec))}초`;
  els.gameoverLayer.classList.add('show');
};

const frame = (nowMs) => {
  const dtMs = Math.min(50, nowMs - state.lastFrameMs);
  state.lastFrameMs = nowMs;
  const dtSec = dtMs / 1000;

  if (state.running) {
    updateGame(dtSec, nowMs);
  }
  drawGame();
  refreshHud();

  if (state.gameover) {
    state.running = false;
    showGameover();
    return;
  }
  requestAnimationFrame(frame);
};

const restart = () => {
  window.location.reload();
};

els.buyHealBtn.addEventListener('click', () => {
  const cost = getHealCost();
  if (state.score.gold < cost || state.ship.hp >= state.ship.maxHp || state.gameover) return;
  state.score.gold -= cost;
  state.ship.goldSpent += cost;
  state.ship.hp = clamp(state.ship.hp + 44, 0, state.ship.maxHp);
  setStatus(`체력 회복 +44 (남은 골드 ${state.score.gold})`);
});

els.upgradeSpeedBtn.addEventListener('click', () => {
  const cost = getSpeedUpgradeCost();
  if (state.score.exp < cost || state.gameover) return;
  state.score.exp -= cost;
  state.ship.expSpent += cost;
  state.ship.attackSpeedLevel += 1;
  setStatus(`공격속도 레벨 ${state.ship.attackSpeedLevel} 달성`);
});

els.upgradePowerBtn.addEventListener('click', () => {
  const cost = getPowerUpgradeCost();
  if (state.score.exp < cost || state.gameover) return;
  state.score.exp -= cost;
  state.ship.expSpent += cost;
  state.ship.attackPowerLevel += 1;
  state.ship.attackPower = Math.round(state.ship.attackPower * 1.16);
  setStatus(`공격력 상승! 현재 ${state.ship.attackPower}`);
});

els.upgradeBulletBtn.addEventListener('click', () => {
  const cost = getBulletUpgradeCost();
  if (state.score.exp < cost || state.gameover) return;
  state.score.exp -= cost;
  state.ship.expSpent += cost;
  state.ship.projectileLevel += 1;
  state.ship.projectileCount = Math.min(5, state.ship.projectileCount + 1);
  setStatus(`총알 개수 증가! 현재 ${state.ship.projectileCount}발`);
});

els.openQuizBtn.addEventListener('click', () => {
  openQuizLayer();
});

els.quizCloseBtn.addEventListener('click', () => {
  closeQuizLayer();
  setStatus('퀴즈를 종료하고 전투를 재개했습니다.');
});

els.quizLayer.addEventListener('click', (event) => {
  if (event.target !== els.quizLayer) return;
  closeQuizLayer();
  setStatus('퀴즈를 종료하고 전투를 재개했습니다.');
});

els.restartBtn.addEventListener('click', restart);

setStatus('적이 거북선에 닿기 전에 최대한 많이 격파하세요.');
refreshHud();
preloadEnemyImages();
loadQuizBank();
requestAnimationFrame((ts) => {
  state.startAtMs = ts;
  state.lastFrameMs = ts;
  requestAnimationFrame(frame);
});
