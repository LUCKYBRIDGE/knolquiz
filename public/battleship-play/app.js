import { buildWeightedQuestionBank } from '../quiz/core/bank.js';
import { cloneWithShuffledChoices } from '../quiz/core/selection.js';
import { parseCsvQuestionBank } from '../quiz/core/importers/csv-question-bank.js';
import { gradePlaceValueAreaModelQuestion } from '../quiz/core/graders/place-value-area-model.js';
import {
  isPlaceValueAreaModelQuestion,
  renderPlaceValueAreaModelQuestion
} from '../quiz/renderers/place-value-area-model.js';
import { saveBattleshipSessionRecord } from '../shared/local-game-records.js';
import { createProceduralSfx } from '../shared/procedural-sfx.js';

const STORAGE_KEY = 'jumpmap.launcher.setup.v1';
const SHIP_IMAGE_SRC = '../quiz_battleship/battleship-ship.png';
const SHIP_SPRITE_CROP = Object.freeze({ x: 354, y: 43, width: 316, height: 482 });
const SHIP_RENDER_LONG_EDGE = 72;
const ELITE_UNLOCK_TIME_SEC = 180;
const ENEMY_TIER_UNLOCK_STEP_SEC = 18;
const ELITE_TIER_UNLOCK_STEP_SEC = 24;
const SPAWN_START_COOLDOWN_MS = 1700;
const SPAWN_MIN_COOLDOWN_MS = 460;
const SPAWN_DECAY_PER_SEC = 5.6;
const HP_GROWTH_STEP_SEC = 24;
const HP_GROWTH_PER_STEP = 0.12;
const SPEED_GROWTH_STEP_SEC = 34;
const SPEED_GROWTH_PER_STEP = 0.09;
const TOUCH_GROWTH_STEP_SEC = 40;
const TOUCH_GROWTH_PER_STEP = 0.09;
const SIZE_GROWTH_STEP_SEC = 75;
const ELITE_CHANCE_BASE = 0.08;
const ELITE_CHANCE_MAX = 0.55;
const ELITE_CHANCE_GROWTH_WINDOW_SEC = 280;
const EARLY_ONE_SHOT_WINDOW_SEC = 55;
const EARLY_EASE_WINDOW_SEC = 120;
const EARLY_SOFTCAP_T1 = 9;
const EARLY_SOFTCAP_T2 = 14;
const EARLY_SOFTCAP_T3 = 21;
const FLOW_CYCLE_SEC = 54;
const FLOW_LULL_START_SEC = 10;
const FLOW_LULL_END_SEC = 20;
const FLOW_SURGE_START_SEC = 32;
const FLOW_SURGE_END_SEC = 40;
const FLOW_AFTERSHOCK_END_SEC = 46;
const SHIP_BASE_ATTACK_POWER = 14;
const SHIP_BASE_ATTACK_COOLDOWN_MS = 620;
const SHIP_ATTACK_SPEED_LEVEL_STEP = 0.1;
const EARLY_ATTACK_SLOW_WINDOW_SEC = 70;
const EARLY_ATTACK_SLOW_MAX_RATIO = 1.22;
const ENEMY_DEFINITIONS = Object.freeze([
  { tier: 1, code: '01', name: '도깨비불', file: 'battleship-01ddokaebibul.png', baseHp: 24, baseSpeed: 58, baseTouchDamage: 8, baseSize: 56 },
  { tier: 2, code: '02', name: '물귀신', file: 'battleship-02mulguisin.png', baseHp: 32, baseSpeed: 62, baseTouchDamage: 9, baseSize: 58 },
  { tier: 3, code: '03', name: '창귀', file: 'battleship-03chang-gwi.png', baseHp: 40, baseSpeed: 65, baseTouchDamage: 10, baseSize: 60 },
  { tier: 4, code: '04', name: '어둑시니', file: 'battleship-04eoduksini.png', baseHp: 52, baseSpeed: 68, baseTouchDamage: 11, baseSize: 62 },
  { tier: 5, code: '05', name: '영노', file: 'battleship-05yeongno.png', baseHp: 64, baseSpeed: 71, baseTouchDamage: 13, baseSize: 64 },
  { tier: 6, code: '06', name: '묘두사', file: 'battleship-06myodusa.png', baseHp: 78, baseSpeed: 74, baseTouchDamage: 14, baseSize: 66 },
  { tier: 7, code: '07', name: '그슨대', file: 'battleship-07geuseundae.png', baseHp: 92, baseSpeed: 78, baseTouchDamage: 16, baseSize: 68 },
  { tier: 8, code: '08', name: '불가사리', file: 'battleship-08bulgasari.png', baseHp: 108, baseSpeed: 82, baseTouchDamage: 18, baseSize: 70 },
  { tier: 9, code: '09', name: '두억시니', file: 'battleship-09dueoksini.png', baseHp: 126, baseSpeed: 86, baseTouchDamage: 20, baseSize: 72 },
  { tier: 10, code: '10', name: '이무기', file: 'battleship-10imugi.png', baseHp: 146, baseSpeed: 90, baseTouchDamage: 23, baseSize: 74 }
]);

const PRESET_TYPE_COUNTS = Object.freeze({
  'jumpmap-net-30': { all: 5 },
  'jumpmap-net-12': { all: 2 },
  'cube-only-24': { cube: 8 },
  'cuboid-only-24': { cuboid: 8 }
});
const LAUNCHER_STATIC_NET_PRESET_FILES = Object.freeze({
  'cube-only-100': '../quiz/data/net-cube-100.json',
  'cuboid-only-100': '../quiz/data/net-cuboid-100.json',
  'jumpmap-net-100': '../quiz/data/net-mixed-100.json',
  'gugudan-2to9-csv': '../quiz/data/gugudan-2to9.csv'
});
const MIN_LOADING_MS = 5000;
const LOADING_ROTATE_MS = 1400;
const LOADING_GAME_TIPS = Object.freeze([
  '가장 가까운 적을 자동 공격합니다. EXP로 공격속도/공격력/총알 개수를 올리세요.',
  '퀴즈를 열어 정답을 맞히면 EXP와 골드를 얻습니다. 필요할 때 체력도 회복하세요.',
  '시간이 지날수록 적 단계와 전장 압박이 올라갑니다. 업그레이드 타이밍을 잘 잡아보세요.'
]);
const LOADING_HISTORY_FACTS = Object.freeze([
  {
    text: '거북선은 판옥선을 바탕으로 상부를 덮어 근접전에 대비한 조선 수군 전선으로 기록됩니다.',
    source: '출처: 「난중일기」, 「선조실록」 관련 기사'
  },
  {
    text: '임진왜란 초기 사천해전 등에서 거북선이 투입되었다는 기록이 전합니다.',
    source: '출처: 「난중일기」, 「선조실록」'
  },
  {
    text: '이순신은 해전 전 조류·지형·병력 상태를 상세히 기록하며 전술에 반영했습니다.',
    source: '출처: 「난중일기」'
  }
]);

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const battleshipSfx = createProceduralSfx({ masterGain: 0.11 });

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
  battleFlowBadge: document.getElementById('battle-flow-badge'),
  upgradeRank: document.getElementById('upgrade-rank'),
  upgradeExpFill: document.getElementById('upgrade-exp-fill'),
  upgradeExpText: document.getElementById('upgrade-exp-text'),
  enemyTierText: document.getElementById('enemy-tier-text'),
  enemyTierTrack: document.getElementById('enemy-tier-track'),
  enemyTierDots: [...document.querySelectorAll('#enemy-tier-track .enemy-tier-dot')],
  buyHealBtn: document.getElementById('buy-heal-btn'),
  openQuizBtn: document.getElementById('open-quiz-btn'),
  upgradeSpeedBtn: document.getElementById('upgrade-speed-btn'),
  upgradePowerBtn: document.getElementById('upgrade-power-btn'),
  upgradeBulletBtn: document.getElementById('upgrade-bullet-btn'),
  sideMainMenuBtn: document.getElementById('side-main-menu-btn'),
  currentEnemyInfo: document.getElementById('current-enemy-info'),
  quizLayer: document.getElementById('quiz-layer'),
  quizCard: document.getElementById('quiz-card'),
  quizCloseBtn: document.getElementById('quiz-close-btn'),
  quizPrompt: document.getElementById('quiz-prompt'),
  quizQuestionWrap: document.getElementById('quiz-question-wrap'),
  quizQuestionAsset: document.getElementById('quiz-question-asset'),
  quizShortAnswerWrap: document.getElementById('quiz-short-answer-wrap'),
  quizShortAnswerInput: document.getElementById('quiz-short-answer-input'),
  quizShortAnswerSubmit: document.getElementById('quiz-short-answer-submit'),
  quizChoices: document.getElementById('quiz-choices'),
  quizResult: document.getElementById('quiz-result'),
  quizActions: document.getElementById('quiz-actions'),
  quizNextBtn: document.getElementById('quiz-next-btn'),
  quizReturnBtn: document.getElementById('quiz-return-btn'),
  loadingLayer: document.getElementById('loading-layer'),
  loadingCountdown: document.getElementById('loading-countdown'),
  loadingGameTip: document.getElementById('loading-game-tip'),
  loadingHistoryTip: document.getElementById('loading-history-tip'),
  loadingHistorySource: document.getElementById('loading-history-source'),
  gameoverLayer: document.getElementById('gameover-layer'),
  gameoverScore: document.getElementById('gameover-score'),
  gameoverTime: document.getElementById('gameover-time'),
  gameoverReason: document.getElementById('gameover-reason'),
  gameoverMainMenuBtn: document.getElementById('gameover-main-menu-btn'),
  restartBtn: document.getElementById('restart-btn'),
  mainMenuLeaveModal: document.getElementById('main-menu-leave-modal'),
  mainMenuLeaveBackdrop: document.getElementById('main-menu-leave-backdrop'),
  mainMenuLeaveMessage: document.getElementById('main-menu-leave-message'),
  mainMenuLeaveConsent: document.getElementById('main-menu-leave-consent'),
  mainMenuLeaveConsentList: document.getElementById('main-menu-leave-consent-list'),
  mainMenuLeaveCancel: document.getElementById('main-menu-leave-cancel'),
  mainMenuLeaveConfirm: document.getElementById('main-menu-leave-confirm')
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const waitMs = (ms) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
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
  const requestedPlayers = Math.max(1, Math.min(6, Math.round(Number(source.players) || 1)));
  const names = Array.isArray(source.playerNames) ? source.playerNames.slice(0, 6) : [];
  const tags = Array.isArray(source.playerTags) ? source.playerTags.slice(0, 6) : [];
  while (names.length < requestedPlayers) names.push(`사용자${names.length + 1}`);
  while (tags.length < requestedPlayers) tags.push('');
  const participants = names.slice(0, requestedPlayers).map((name, index) => {
    const normalizedName = String(name || '').trim() || `사용자${index + 1}`;
    const normalizedTag = String(tags[index] || '').trim();
    return {
      name: normalizedName,
      tag: normalizedTag
    };
  });
  const rawBattleshipEndMode = String(source.battleshipEndMode || '').trim().toLowerCase();
  const battleshipEndMode = (rawBattleshipEndMode === 'ship-hp' || rawBattleshipEndMode === 'time' || rawBattleshipEndMode === 'kills')
    ? rawBattleshipEndMode
    : 'ship-hp';
  return {
    players: requestedPlayers,
    participants,
    launcherQuizPresetId: typeof source.quizPresetId === 'string' ? source.quizPresetId : 'jumpmap-net-100',
    customCsvEnabled: source.customCsvEnabled === true,
    customCsvText: typeof source.customCsvText === 'string' ? source.customCsvText : '',
    customCsvFileName: typeof source.customCsvFileName === 'string' ? source.customCsvFileName : '',
    battleshipEndMode,
    battleshipTimeLimitSec: Math.max(10, Math.min(7200, Math.round(Number(source.battleshipTimeLimitSec) || 180))),
    battleshipKillLimit: Math.max(1, Math.min(9999, Math.round(Number(source.battleshipKillLimit) || 120)))
  };
})();

const query = new URLSearchParams(window.location.search);
const singleMode = query.get('single') === '1';
const splitMode = query.get('split') === '1';
const requestedPlayerIndex = Math.round(Number(query.get('playerIndex')));
const activePlayerIndex = clamp(
  Number.isFinite(requestedPlayerIndex) ? requestedPlayerIndex : 0,
  0,
  Math.max(0, setup.players - 1)
);
const activeParticipant = setup.participants[activePlayerIndex] || { name: '사용자1', tag: '' };
const activeParticipantLabel = activeParticipant.tag
  ? `${activePlayerIndex + 1}P ${activeParticipant.name}(${activeParticipant.tag})`
  : `${activePlayerIndex + 1}P ${activeParticipant.name}`;
const shouldRedirectToSplitHost = setup.players > 1 && !singleMode;

const resolveLayoutMode = () => {
  if (splitMode) return 'bottom';
  const width = Math.max(1, Number(window.innerWidth) || 1);
  const height = Math.max(1, Number(window.innerHeight) || 1);
  const aspect = width / height;
  if (width <= 980) return 'bottom';
  if (setup.players >= 4) return 'bottom';
  if (setup.players >= 2 && aspect <= 1.75) return 'bottom';
  if (aspect <= 1.45) return 'bottom';
  return 'side';
};

const applyLayoutMode = () => {
  const useBottom = resolveLayoutMode() === 'bottom';
  document.body.classList.toggle('layout-bottom', useBottom);
};

const isTextChoiceQuestion = (question) => (
  question?.renderKind === 'text_choice'
  || question?.type === 'csv_choice'
);

const isTextShortAnswerQuestion = (question) => (
  question?.renderKind === 'text_short_answer'
  || question?.type === 'csv_subjective'
);

const collectAcceptedAnswers = (question) => {
  if (!Array.isArray(question?.acceptedAnswers)) return [];
  return question.acceptedAnswers
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
};

const isBattleUsableQuestion = (question) => {
  if (!question) return false;
  if (isPlaceValueAreaModelQuestion(question)) return true;
  if (isTextShortAnswerQuestion(question)) {
    const acceptedAnswers = collectAcceptedAnswers(question);
    return acceptedAnswers.length > 0 || String(question.answer ?? '').trim().length > 0;
  }
  return (
    Array.isArray(question.choices)
    && question.choices.length >= 2
    && String(question.answer ?? '').trim().length > 0
  );
};

const state = {
  running: false,
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
  endReason: '',
  enemyImages: new Map(),
  enemyImageReady: new Map(),
  eliteAnnouncedTier: 0,
  quiz: {
    loading: false,
    loaded: false,
    error: '',
    sourceQuestions: [],
    pendingQuestions: [],
    cycleCount: 0,
    currentQuestion: null,
    answerLocked: false
  },
  enemies: [],
  projectiles: [],
  statusText: '전투 시작'
};
const eliteTintSpriteCache = new Map();

const getEliteTintedSprite = (image, tone = 'normal') => {
  if (!image || !image.naturalWidth || !image.naturalHeight) return image;
  const cacheKey = `${image.currentSrc || image.src || `tier-${image.naturalWidth}x${image.naturalHeight}`}:${tone}`;
  const cached = eliteTintSpriteCache.get(cacheKey);
  if (cached) return cached;
  const offscreen = document.createElement('canvas');
  offscreen.width = image.naturalWidth;
  offscreen.height = image.naturalHeight;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return image;
  offCtx.drawImage(image, 0, 0);
  offCtx.globalCompositeOperation = 'source-atop';
  if (tone === 'max') {
    offCtx.fillStyle = 'rgba(255, 24, 24, 0.74)';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.fillStyle = 'rgba(85, 0, 0, 0.34)';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
  } else {
    offCtx.fillStyle = 'rgba(255, 30, 30, 0.6)';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
  }
  offCtx.globalCompositeOperation = 'source-over';
  eliteTintSpriteCache.set(cacheKey, offscreen);
  return offscreen;
};

const resolveParticipantConsentLabels = () => {
  const participants = Array.isArray(setup.participants) ? setup.participants : [];
  const labels = participants.map((participant, index) => {
    const name = String(participant?.name || '').trim() || `사용자${index + 1}`;
    const tag = String(participant?.tag || '').trim();
    return tag ? `${name}(${tag})` : name;
  });
  return labels.length ? labels : ['플레이어 1'];
};

const isBattleInProgress = () => !state.gameover;
let pausedForMainMenuLeave = false;

const closeMainMenuLeaveModal = () => {
  if (!els.mainMenuLeaveModal) return;
  els.mainMenuLeaveModal.classList.add('hidden');
  if (pausedForMainMenuLeave && !state.gameover) {
    pausedForMainMenuLeave = false;
    state.running = true;
    state.lastFrameMs = performance.now();
  }
};

const syncMainMenuLeaveConfirmState = () => {
  if (!els.mainMenuLeaveConfirm || !els.mainMenuLeaveConsent || els.mainMenuLeaveConsent.classList.contains('hidden')) return;
  const checks = [...els.mainMenuLeaveConsentList.querySelectorAll('input[type="checkbox"]')];
  const allChecked = checks.length > 0 && checks.every((inputEl) => inputEl.checked);
  els.mainMenuLeaveConfirm.disabled = !allChecked;
};

const renderMainMenuLeaveConsent = (labels = []) => {
  if (!els.mainMenuLeaveConsent || !els.mainMenuLeaveConsentList || !els.mainMenuLeaveConfirm) return;
  els.mainMenuLeaveConsentList.innerHTML = '';
  if (!Array.isArray(labels) || labels.length <= 1) {
    els.mainMenuLeaveConsent.classList.add('hidden');
    els.mainMenuLeaveConfirm.disabled = false;
    return;
  }
  els.mainMenuLeaveConsent.classList.remove('hidden');
  labels.forEach((label) => {
    const row = document.createElement('label');
    row.className = 'leave-consent-item';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.addEventListener('change', syncMainMenuLeaveConfirmState);
    const text = document.createElement('span');
    text.textContent = `${label} 동의`;
    row.append(check, text);
    els.mainMenuLeaveConsentList.appendChild(row);
  });
  syncMainMenuLeaveConfirmState();
};

const openMainMenuLeaveModal = () => {
  const inProgress = isBattleInProgress();
  const message = inProgress
    ? '진행 중에 메인메뉴로 돌아가면 이번 전투 결과는 저장되지 않습니다.'
    : '메인메뉴로 이동합니다. 저장된 결과는 그대로 유지됩니다.';
  if (!els.mainMenuLeaveModal || !els.mainMenuLeaveMessage) {
    if (window.confirm(message)) {
      window.location.href = '../';
    }
    return;
  }
  els.mainMenuLeaveMessage.textContent = message;
  renderMainMenuLeaveConsent(inProgress ? resolveParticipantConsentLabels() : []);
  if (inProgress && state.running) {
    pausedForMainMenuLeave = true;
    state.running = false;
  }
  els.mainMenuLeaveModal.classList.remove('hidden');
};

const leaveToMainMenu = () => {
  pausedForMainMenuLeave = false;
  closeMainMenuLeaveModal();
  window.location.href = '../';
};

const shipImage = new Image();
shipImage.src = SHIP_IMAGE_SRC;

const getAttackCooldownMs = () => {
  const speedMultiplier = 1 + state.ship.attackSpeedLevel * SHIP_ATTACK_SPEED_LEVEL_STEP;
  const earlyProgress = clamp(state.waves.elapsedSec / EARLY_ATTACK_SLOW_WINDOW_SEC, 0, 1);
  const earlySlowRatio = EARLY_ATTACK_SLOW_MAX_RATIO - ((EARLY_ATTACK_SLOW_MAX_RATIO - 1) * earlyProgress);
  return (SHIP_BASE_ATTACK_COOLDOWN_MS * earlySlowRatio) / speedMultiplier;
};

const getHealCost = () => 24 + Math.floor(state.ship.goldSpent / 45) * 4;
const getSpeedUpgradeCost = () => Math.round(10 * Math.pow(1.32, state.ship.attackSpeedLevel));
const getPowerUpgradeCost = () => Math.round(12 * Math.pow(1.36, state.ship.attackPowerLevel));
const getBulletUpgradeCost = () => Math.round(18 * Math.pow(1.42, state.ship.projectileLevel));

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

const getEndCriteriaLabel = () => {
  if (setup.battleshipEndMode === 'time') {
    return `시간 도달 (${setup.battleshipTimeLimitSec}초)`;
  }
  if (setup.battleshipEndMode === 'kills') {
    return `목표 격파 (${setup.battleshipKillLimit}킬)`;
  }
  return '거북선 체력 0';
};

const resolveBattleshipGoalReason = () => {
  if (setup.battleshipEndMode === 'time' && state.waves.elapsedSec >= setup.battleshipTimeLimitSec) {
    return `시간 도달 (${setup.battleshipTimeLimitSec}초)`;
  }
  if (setup.battleshipEndMode === 'kills' && state.score.kills >= setup.battleshipKillLimit) {
    return `목표 격파 수 도달 (${setup.battleshipKillLimit}킬)`;
  }
  return '';
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

const isImageAssetPath = (rawPath) => {
  const value = String(rawPath || '').trim();
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  return /\.(svg|png|jpe?g|gif|webp|bmp|avif)$/i.test(value);
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

const isLauncherPvamPreset = (presetId) => (
  presetId === 'pvam-area-2digit' || presetId === 'pvam-area-2digit-100'
);

const resolveLauncherStaticNetPresetPath = (presetId) => (
  LAUNCHER_STATIC_NET_PRESET_FILES[String(presetId || '').trim()] || ''
);

const isLauncherStaticNetPreset = (presetId) => Boolean(resolveLauncherStaticNetPresetPath(presetId));

const getLauncherPvamQuestionCount = (presetId) => (
  presetId === 'pvam-area-2digit-100' ? 100 : 12
);

const normalizePvamQuestionForBattleship = (question, index = 0) => {
  if (!question || typeof question !== 'object') return null;
  const id = String(question?.id || `pvam-battle-${index + 1}`);
  return {
    ...question,
    id
  };
};

const loadPvamPresetQuestions = async (presetId) => {
  const count = getLauncherPvamQuestionCount(presetId);
  const payload = await fetch('../quiz/data/pvam-area-2digit-100.json', { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error(`영역모델 문제 파일 로드 실패 (${res.status})`);
    return res.json();
  });
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
  return rawQuestions
    .slice(0, Math.max(1, count))
    .map((question, index) => normalizePvamQuestionForBattleship(question, index))
    .filter(Boolean);
};

const loadLauncherStaticNetQuestions = async (presetId) => {
  const filePath = resolveLauncherStaticNetPresetPath(presetId);
  if (!filePath) return [];
  const isCsv = /\.csv(?:[?#].*)?$/i.test(filePath);
  if (isCsv) {
    const sourceText = await fetch(filePath, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`CSV 문제 파일 로드 실패 (${res.status})`);
      return res.text();
    });
    const parsed = parseCsvQuestionBank(sourceText);
    if (!parsed.valid || !parsed.bank?.questions?.length) {
      throw new Error(parsed.errors?.[0] || 'CSV 문제 파싱 실패');
    }
    return parsed.bank.questions.filter(isBattleUsableQuestion);
  }
  const payload = await fetch(filePath, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error(`전개도 문제 파일 로드 실패 (${res.status})`);
    return res.json();
  });
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
  return rawQuestions.filter(isBattleUsableQuestion);
};

const loadBaseBanks = async () => {
  const [facecolor, edgecolor, validity] = await Promise.all([
    fetch('../quiz/data/facecolor-questions.json', { cache: 'no-store' }).then((res) => res.json()),
    fetch('../quiz/data/edgecolor-questions.json', { cache: 'no-store' }).then((res) => res.json()),
    fetch('../quiz/data/validity-questions.json', { cache: 'no-store' }).then((res) => res.json())
  ]);
  return { facecolor, edgecolor, validity };
};

const refillQuizPendingQuestions = () => {
  if (!Array.isArray(state.quiz.sourceQuestions) || !state.quiz.sourceQuestions.length) return false;
  state.quiz.pendingQuestions = shuffleArray(state.quiz.sourceQuestions.slice());
  state.quiz.cycleCount += 1;
  return state.quiz.pendingQuestions.length > 0;
};

const loadQuizBank = async () => {
  if (state.quiz.loading) return;
  if (state.quiz.loaded && Array.isArray(state.quiz.sourceQuestions) && state.quiz.sourceQuestions.length) return;
  state.quiz.loading = true;
  state.quiz.error = '';
  try {
    let usableQuestions = [];
    if (setup.launcherQuizPresetId === 'csv-upload' && setup.customCsvEnabled && setup.customCsvText.trim()) {
      const parsed = parseCsvQuestionBank(setup.customCsvText);
      if (!parsed.valid || !parsed.bank?.questions?.length) {
        throw new Error(parsed.errors?.[0] || 'CSV 문제를 불러오지 못했습니다.');
      }
      usableQuestions = parsed.bank.questions.filter(isBattleUsableQuestion);
      if (!usableQuestions.length) {
        throw new Error('전투 퀴즈로 사용할 문항(객관식 또는 주관식)을 찾지 못했습니다.');
      }
    } else if (isLauncherStaticNetPreset(setup.launcherQuizPresetId)) {
      usableQuestions = await loadLauncherStaticNetQuestions(setup.launcherQuizPresetId);
      if (!usableQuestions.length) {
        throw new Error('전개도 100문제를 전투 퀴즈로 불러오지 못했습니다.');
      }
    } else if (isLauncherPvamPreset(setup.launcherQuizPresetId)) {
      usableQuestions = (await loadPvamPresetQuestions(setup.launcherQuizPresetId))
        .filter(isBattleUsableQuestion);
      if (!usableQuestions.length) {
        throw new Error('영역모델 문제를 전투 퀴즈로 불러오지 못했습니다.');
      }
    } else {
      const banks = await loadBaseBanks();
      const settings = createPresetSettings(setup.launcherQuizPresetId);
      const built = buildWeightedQuestionBank(banks, settings);
      if (!built?.questions?.length) {
        throw new Error('퀴즈 문제풀이용 문제를 구성하지 못했습니다.');
      }
      usableQuestions = built.questions.filter(isBattleUsableQuestion);
      if (!usableQuestions.length) {
        throw new Error('전투 퀴즈로 사용할 문항이 없습니다.');
      }
    }

    state.quiz.sourceQuestions = usableQuestions.slice();
    state.quiz.pendingQuestions = [];
    state.quiz.cycleCount = 0;
    if (!refillQuizPendingQuestions()) {
      throw new Error('퀴즈 문제 큐를 구성하지 못했습니다.');
    }
    state.quiz.loaded = true;
  } catch (error) {
    state.quiz.error = error instanceof Error ? error.message : '퀴즈 데이터를 불러오지 못했습니다.';
  } finally {
    state.quiz.loading = false;
  }
};

const preloadShipImage = () => new Promise((resolve) => {
  if (shipImage.complete) {
    resolve(shipImage.naturalWidth > 0 && shipImage.naturalHeight > 0);
    return;
  }
  const handleLoad = () => resolve(shipImage.naturalWidth > 0 && shipImage.naturalHeight > 0);
  const handleError = () => resolve(false);
  shipImage.addEventListener('load', handleLoad, { once: true });
  shipImage.addEventListener('error', handleError, { once: true });
});

const preloadEnemyImages = async () => {
  const tasks = ENEMY_DEFINITIONS.map((def) => new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const settle = (ready) => {
      if (settled) return;
      settled = true;
      state.enemyImageReady.set(def.tier, ready);
      resolve();
    };
    state.enemyImageReady.set(def.tier, false);
    image.addEventListener('load', () => {
      settle(image.naturalWidth > 0 && image.naturalHeight > 0);
    }, { once: true });
    image.addEventListener('error', () => {
      settle(false);
    }, { once: true });
    image.src = `../quiz_battleship/${def.file}`;
    state.enemyImages.set(def.tier, image);
    if (image.complete) {
      settle(image.naturalWidth > 0 && image.naturalHeight > 0);
    }
  }));
  await Promise.all(tasks);
};

const beginLoadingPresentation = (startAtMs) => {
  if (!els.loadingLayer) return () => {};
  let gameTipIndex = 0;
  let historyIndex = Math.floor(Math.random() * LOADING_HISTORY_FACTS.length);
  const renderLoadingText = () => {
    const elapsedMs = performance.now() - startAtMs;
    const remainSec = Math.max(0, Math.ceil((MIN_LOADING_MS - elapsedMs) / 1000));
    if (els.loadingCountdown) {
      els.loadingCountdown.textContent = remainSec > 0
        ? `전투 시작까지 ${remainSec}초`
        : '전투 준비를 마무리하는 중...';
    }
    if (els.loadingGameTip) {
      els.loadingGameTip.textContent = LOADING_GAME_TIPS[gameTipIndex % LOADING_GAME_TIPS.length];
    }
    const fact = LOADING_HISTORY_FACTS[historyIndex % LOADING_HISTORY_FACTS.length];
    if (els.loadingHistoryTip) els.loadingHistoryTip.textContent = fact.text;
    if (els.loadingHistorySource) els.loadingHistorySource.textContent = fact.source;
  };
  renderLoadingText();
  els.loadingLayer.classList.add('show');
  const timer = window.setInterval(() => {
    gameTipIndex += 1;
    historyIndex += 1;
    renderLoadingText();
  }, LOADING_ROTATE_MS);
  return () => {
    window.clearInterval(timer);
    els.loadingLayer.classList.remove('show');
  };
};

const getUnlockedEnemyTier = (elapsedSec) => {
  const tier = 2 + Math.floor(Math.max(0, elapsedSec) / ENEMY_TIER_UNLOCK_STEP_SEC);
  return clamp(tier, 2, 10);
};

const pickEnemyDefinition = (maxTier, { preferHigh = false } = {}) => {
  const defs = ENEMY_DEFINITIONS.filter((def) => def.tier <= maxTier && state.enemyImageReady.get(def.tier));
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
  if (elapsedSec < 45) return false;
  const tierBonus = Math.max(0, def.tier - 1) * 0.008;
  const elapsedBonus = clamp((elapsedSec - 45) / 360, 0, 1) * 0.18;
  const flowBonus = Number(flow?.hardenedBonus) || 0;
  const chance = clamp(0.045 + tierBonus + elapsedBonus + flowBonus, 0.01, 0.42);
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
  const eliteStrengthStep = def.tier - 1;

  let hp = elite
    ? Math.round(Math.max(
      normalHp * (1.9 + eliteStrengthStep * 0.12),
      normalTier10Hp * (1.08 + eliteStrengthStep * 0.1)
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
  const radius = Math.max(14, Math.round(renderSize * (elite ? 0.31 : 0.27)));
  const spawnPoint = getEnemySpawnPoint(radius);

  if (!elite) {
    const earlyProgress = clamp(elapsedSec / EARLY_EASE_WINDOW_SEC, 0, 1);
    const oneShotTargetHp = Math.max(1, Math.round(state.ship.attackPower * (0.7 + def.tier * 0.06)));
    hp = Math.max(1, Math.round(hp * earlyProgress + oneShotTargetHp * (1 - earlyProgress)));
    speed *= (0.7 + 0.3 * earlyProgress);
    touchDamage = Math.max(1, Math.round(touchDamage * (0.65 + 0.35 * earlyProgress)));

    if (
      elapsedSec <= EARLY_ONE_SHOT_WINDOW_SEC
      && def.tier === 1
      && state.ship.attackPower <= SHIP_BASE_ATTACK_POWER
    ) {
      // Early game: only tier-1 can be one-shot by the base ship.
      hp = Math.min(hp, Math.max(1, SHIP_BASE_ATTACK_POWER - 1));
    }
    if (def.tier > 1 && state.ship.attackPower <= SHIP_BASE_ATTACK_POWER) {
      // Prevent non-tier1 enemies from being one-shot by the base ship.
      hp = Math.max(hp, SHIP_BASE_ATTACK_POWER + 2);
    }
  }

  if (hardened && !elite) {
    hp = Math.round(hp * (1.55 + (def.tier - 1) * 0.03));
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
    renderSize,
    hasBeenVisible: false
  };
};

const spawnEnemy = (flow) => {
  const elapsedSec = state.waves.elapsedSec;
  const softCap = elapsedSec < 60
    ? EARLY_SOFTCAP_T1
    : (elapsedSec < 140 ? EARLY_SOFTCAP_T2 : (elapsedSec < 240 ? EARLY_SOFTCAP_T3 : Number.POSITIVE_INFINITY));
  const adjustedSoftCap = Math.max(5, softCap + (Number(flow?.capBonus) || 0));
  if (state.enemies.length >= adjustedSoftCap) return;

  const burstChance = clamp(0.16 + (elapsedSec / 960), 0.16, 0.44);
  const spawnCount = Math.random() < burstChance ? 2 : 1;
  for (let spawnIndex = 0; spawnIndex < spawnCount; spawnIndex += 1) {
    if (state.enemies.length >= adjustedSoftCap) break;
    const unlockedTier = getUnlockedEnemyTier(elapsedSec);
    const eliteTier = getEliteUnlockedTier(elapsedSec);
    const elite = shouldSpawnEliteEnemy(elapsedSec, eliteTier);
    const maxTier = elite ? eliteTier : unlockedTier;
    const def = pickEnemyDefinition(maxTier, { preferHigh: elite });
    if (!def || !state.enemyImageReady.get(def.tier)) continue;
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

const getCurrentEnemyInfoText = () => {
  if (!Array.isArray(state.enemies) || !state.enemies.length) return '없음';
  const byTier = state.enemies
    .slice()
    .sort((a, b) => (Number(a?.tier) || 0) - (Number(b?.tier) || 0));
  const labels = [];
  const seen = new Set();
  for (let i = 0; i < byTier.length; i += 1) {
    const enemy = byTier[i];
    const baseName = typeof enemy?.name === 'string' && enemy.name.trim()
      ? enemy.name.trim()
      : `적 ${String(enemy?.tier || '').padStart(2, '0')}`;
    const label = enemy?.elite ? `붉은 특수효과 ${baseName}` : baseName;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  if (!labels.length) return '없음';
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')} 외 ${labels.length - 3}종`;
};

const getProjectileAngleOffsets = (count) => {
  const total = Math.max(1, Number(count) || 1);
  if (total <= 1) return [0];

  const offsets = [0];
  const maxOffset = total === 2 ? 0.065 : 0.13;
  const sidePairs = Math.ceil((total - 1) / 2);
  const step = maxOffset / Math.max(1, sidePairs);

  for (let level = 1; offsets.length < total; level += 1) {
    const offset = step * level;
    if (offsets.length < total) offsets.push(offset);
    if (offsets.length < total) offsets.push(-offset);
  }
  return offsets;
};

const shootAt = (target) => {
  if (!target) return;
  const count = Math.max(1, state.ship.projectileCount);
  const baseAngle = Math.atan2(target.y - state.ship.y, target.x - state.ship.x);
  const offsets = getProjectileAngleOffsets(count);
  for (let i = 0; i < offsets.length; i += 1) {
    const angle = baseAngle + offsets[i];
    state.projectiles.push({
      x: state.ship.x + Math.cos(angle) * 34,
      y: state.ship.y + Math.sin(angle) * 34,
      vx: Math.cos(angle) * 430,
      vy: Math.sin(angle) * 430,
      radius: 6.5,
      damage: state.ship.attackPower
    });
  }
};

const addKillReward = (enemy) => {
  const tier = Math.max(1, Number(enemy?.tier) || 1);
  const eliteBonus = enemy?.elite ? 2 : 0;
  const gainedExp = Math.max(1, 1 + Math.floor((tier - 1) / 2) + (enemy?.elite ? 2 : 0));
  battleshipSfx.playKill();
  state.score.kills += 1;
  state.score.gold += 2 + tier + eliteBonus;
  state.score.exp += gainedExp;
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

const clearQuizVisualFx = () => {
  els.quizCard?.classList.remove('quiz-fx-success', 'quiz-fx-fail');
  els.quizResult?.classList.remove('quiz-fx-success', 'quiz-fx-fail');
};

const setQuizFeedback = (text = '', tone = '') => {
  if (!els.quizResult) return;
  els.quizResult.textContent = text;
  els.quizResult.className = 'test-quiz-feedback';
  if (tone) {
    els.quizResult.classList.add(tone);
  }
};

const setQuizActionButtonsVisible = (visible) => {
  els.quizActions?.classList.toggle('hidden', !visible);
};

const gradeShortAnswerForBattleship = (question, rawInput) => {
  const userAnswer = String(rawInput ?? '').trim();
  const acceptedAnswers = collectAcceptedAnswers(question);
  const fallbackAnswer = String(question?.answer ?? '').trim();
  if (!acceptedAnswers.length && fallbackAnswer) {
    acceptedAnswers.push(fallbackAnswer);
  }
  if (!acceptedAnswers.length) {
    return {
      correct: false,
      userAnswer,
      canonicalAnswer: ''
    };
  }
  const containsMatch = Boolean(question?.acceptedMatchContains);
  const normalizedUser = userAnswer.toLowerCase();
  const correct = containsMatch
    ? acceptedAnswers.some((word) => normalizedUser.includes(word.toLowerCase()))
    : acceptedAnswers.some((word) => normalizedUser === word.toLowerCase());
  return {
    correct,
    userAnswer,
    canonicalAnswer: acceptedAnswers[0] || fallbackAnswer
  };
};

const submitQuizAnswer = (rawAnswer) => {
  const question = state.quiz.currentQuestion;
  if (!question || state.quiz.answerLocked) return;
  state.quiz.answerLocked = true;
  const structuredPvamQuestion = isPlaceValueAreaModelQuestion(question);
  const shortAnswerQuestion = isTextShortAnswerQuestion(question);
  let correct = false;

  if (structuredPvamQuestion) {
    const graded = gradePlaceValueAreaModelQuestion(
      question,
      rawAnswer && typeof rawAnswer === 'object' ? rawAnswer : {}
    );
    correct = !!graded.correct;
    const wrongFieldSet = new Set(
      Array.isArray(graded?.wrongFields)
        ? graded.wrongFields.map((field) => String(field))
        : []
    );
    els.quizChoices
      .querySelectorAll('[data-structured-input]')
      .forEach((node) => {
        if (!(node instanceof HTMLInputElement)) return;
        node.disabled = true;
        const inputId = String(node.dataset.structuredInput || '');
        node.classList.toggle('is-correct', !wrongFieldSet.has(inputId));
        node.classList.toggle('is-wrong', wrongFieldSet.has(inputId));
      });
  } else if (shortAnswerQuestion) {
    const graded = gradeShortAnswerForBattleship(question, rawAnswer);
    correct = graded.correct;
    if (els.quizShortAnswerInput) {
      els.quizShortAnswerInput.disabled = true;
    }
    if (els.quizShortAnswerSubmit) {
      els.quizShortAnswerSubmit.disabled = true;
    }
  } else {
    const submittedChoice = String(rawAnswer ?? '').trim();
    correct = submittedChoice === String(question.answer ?? '').trim();
    const choiceButtons = els.quizChoices.querySelectorAll('button.test-quiz-choice');
    choiceButtons.forEach((choiceBtn) => {
      choiceBtn.disabled = true;
      const value = String(choiceBtn.dataset.choice || '').trim();
      choiceBtn.classList.toggle('is-correct', value === String(question.answer ?? '').trim());
      choiceBtn.classList.toggle('is-wrong', value === submittedChoice && !correct);
    });
  }

  applyQuizRewards(question, correct);
  if (correct) {
    battleshipSfx.playCorrect();
  } else {
    battleshipSfx.playWrong();
  }
  setQuizFeedback(correct ? '정답! 보상을 반영했습니다.' : '오답입니다.', correct ? 'is-success' : 'is-fail');
  const fxClass = correct ? 'quiz-fx-success' : 'quiz-fx-fail';
  els.quizCard?.classList.add(fxClass);
  els.quizResult?.classList.add(fxClass);
  window.setTimeout(() => {
    clearQuizVisualFx();
  }, 760);
  setQuizActionButtonsVisible(true);
};

const closeQuizLayer = ({ keepStatus = false } = {}) => {
  state.paused = false;
  state.quiz.currentQuestion = null;
  state.quiz.answerLocked = false;
  els.quizLayer.classList.add('hidden');
  clearQuizVisualFx();
  setQuizFeedback('', '');
  els.quizCard?.classList.remove('question-hidden');
  els.quizChoices.innerHTML = '';
  els.quizChoices.classList.remove('hidden');
  els.quizChoices.classList.remove('structured-choices');
  els.quizChoices.style.removeProperty('height');
  els.quizQuestionWrap?.classList.add('hidden');
  els.quizQuestionAsset.removeAttribute('src');
  els.quizShortAnswerWrap?.classList.add('hidden');
  if (els.quizShortAnswerInput) {
    els.quizShortAnswerInput.value = '';
    els.quizShortAnswerInput.disabled = false;
    els.quizShortAnswerInput.onkeydown = null;
  }
  if (els.quizShortAnswerSubmit) {
    els.quizShortAnswerSubmit.disabled = false;
    els.quizShortAnswerSubmit.onclick = null;
  }
  setQuizActionButtonsVisible(false);
  if (!keepStatus) {
    setStatus('퀴즈를 종료했습니다.');
  }
};

const resolveNextQuizQuestion = () => {
  let next = state.quiz.pendingQuestions.pop();
  if (!next) {
    if (!refillQuizPendingQuestions()) return null;
    next = state.quiz.pendingQuestions.pop();
  }
  if (!next) return null;
  return Array.isArray(next?.choices)
    ? cloneWithShuffledChoices(next)
    : { ...next, choices: [] };
};

const renderQuizQuestion = (question) => {
  els.quizChoices.innerHTML = '';
  els.quizChoices.classList.remove('structured-choices');
  els.quizChoices.style.removeProperty('height');
  clearQuizVisualFx();
  setQuizFeedback('', '');
  state.quiz.answerLocked = false;
  setQuizActionButtonsVisible(false);
  els.quizChoices.classList.remove('hidden');
  els.quizShortAnswerWrap?.classList.add('hidden');
  if (els.quizShortAnswerInput) {
    els.quizShortAnswerInput.value = '';
    els.quizShortAnswerInput.disabled = false;
    els.quizShortAnswerInput.onkeydown = null;
  }
  if (els.quizShortAnswerSubmit) {
    els.quizShortAnswerSubmit.disabled = false;
    els.quizShortAnswerSubmit.onclick = null;
  }
  const prompt = String(question?.prompt || '알맞은 답을 고르세요.').trim();
  els.quizPrompt.textContent = prompt || '알맞은 답을 고르세요.';

  const questionAsset = resolveQuizAssetPath(question?.question);
  const choices = Array.isArray(question?.choices) ? question.choices.slice() : [];
  const textChoiceQuestion = isTextChoiceQuestion(question);
  const shortAnswerQuestion = isTextShortAnswerQuestion(question);
  const structuredPvamQuestion = isPlaceValueAreaModelQuestion(question);
  const showQuestionAsset = !textChoiceQuestion
    && !shortAnswerQuestion
    && !structuredPvamQuestion
    && isImageAssetPath(questionAsset);
  els.quizCard?.classList.toggle('question-hidden', !showQuestionAsset);
  els.quizQuestionWrap?.classList.toggle('hidden', !showQuestionAsset);
  if (showQuestionAsset) {
    els.quizQuestionAsset.src = questionAsset;
  } else {
    els.quizQuestionAsset.removeAttribute('src');
  }

  if (structuredPvamQuestion) {
    els.quizChoices.classList.remove('hidden');
    els.quizShortAnswerWrap?.classList.add('hidden');
    renderPlaceValueAreaModelQuestion({
      choicesEl: els.quizChoices,
      question,
      onSubmit: (payload) => {
        submitQuizAnswer(payload);
      }
    });
    return;
  }

  if (shortAnswerQuestion) {
    els.quizChoices.classList.add('hidden');
    els.quizShortAnswerWrap?.classList.remove('hidden');
    if (els.quizShortAnswerSubmit) {
      els.quizShortAnswerSubmit.onclick = () => {
        submitQuizAnswer(els.quizShortAnswerInput?.value || '');
      };
    }
    if (els.quizShortAnswerInput) {
      els.quizShortAnswerInput.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submitQuizAnswer(els.quizShortAnswerInput?.value || '');
      };
      window.requestAnimationFrame(() => {
        try {
          els.quizShortAnswerInput.focus({ preventScroll: true });
        } catch (_error) {
          els.quizShortAnswerInput.focus();
        }
      });
    }
    return;
  }

  if (choices.length === 0) {
    setQuizFeedback('선택지를 불러오지 못했습니다.', 'is-warn');
    setQuizActionButtonsVisible(true);
    return;
  }

  choices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `test-quiz-choice choice-tone-${(index % 4) + 1}`;
    btn.dataset.choice = String(choice);

    const badge = document.createElement('span');
    badge.className = 'test-quiz-choice-badge';
    badge.textContent = String(index + 1);
    btn.appendChild(badge);

    if (textChoiceQuestion) {
      const label = document.createElement('span');
      label.className = 'test-quiz-choice-text';
      label.textContent = String(choice || '').trim();
      btn.appendChild(label);
    } else {
      const asset = resolveQuizAssetPath(choice);
      if (isImageAssetPath(asset)) {
        const img = document.createElement('img');
        img.src = asset;
        img.alt = `선택지 ${index + 1}`;
        btn.appendChild(img);
      } else {
        const label = document.createElement('span');
        label.className = 'test-quiz-choice-text';
        label.textContent = String(choice || '').trim();
        btn.appendChild(label);
      }
    }

    btn.addEventListener('click', () => {
      submitQuizAnswer(choice);
    });
    els.quizChoices.appendChild(btn);
  });
};

const showNextQuizQuestion = () => {
  const nextQuestion = resolveNextQuizQuestion();
  if (!nextQuestion) {
    closeQuizLayer({ keepStatus: true });
    setStatus('퀴즈 문제를 모두 확인했습니다.');
    return;
  }
  state.quiz.currentQuestion = nextQuestion;
  renderQuizQuestion(nextQuestion);
};

const openQuizLayer = async () => {
  if (state.gameover) return;
  if (!els.quizLayer.classList.contains('hidden')) return;
  setStatus('퀴즈를 준비하는 중...');
  await loadQuizBank();
  if (state.quiz.error) {
    setStatus(state.quiz.error);
    return;
  }
  state.paused = true;
  els.quizLayer.classList.remove('hidden');
  showNextQuizQuestion();
};

const updateGame = (dtSec, nowMs) => {
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

    const viewportMargin = enemy.radius + 6;
    if (
      enemy.x >= -viewportMargin
      && enemy.x <= canvas.width + viewportMargin
      && enemy.y >= -viewportMargin
      && enemy.y <= canvas.height + viewportMargin
    ) {
      enemy.hasBeenVisible = true;
    }
    if (!enemy.hasBeenVisible) continue;

    const touched = distance(enemy.x, enemy.y, state.ship.x, state.ship.y) <= enemy.radius + state.ship.radius;
    if (!touched) continue;

    const touchDamage = Math.max(1, Math.round(enemy.touchDamage * 3));
    state.ship.hp = Math.max(0, state.ship.hp - touchDamage);
    state.enemies.splice(i, 1);
    setStatus(`거북선 피격! HP -${touchDamage}`);
    if (state.ship.hp <= 0) {
      state.endReason = '거북선 체력 0';
      state.running = false;
      state.gameover = true;
    }
  }

  if (!state.gameover) {
    const goalReason = resolveBattleshipGoalReason();
    if (goalReason) {
      state.endReason = goalReason;
      state.running = false;
      state.gameover = true;
      setStatus(`게임 종료: ${goalReason}`);
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
  gradient.addColorStop(0, '#07102a');
  gradient.addColorStop(0.5, '#0c1e49');
  gradient.addColorStop(1, '#132f63');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(155, 192, 255, 0.14)';
  for (let i = 0; i < 12; i += 1) {
    const y = i * 52 + 14;
    ctx.fillRect(0, y, canvas.width, 1);
  }

  let shipW = 47;
  let shipH = 72;
  const shipSize = getDrawSizeByLongEdge(
    { naturalWidth: SHIP_SPRITE_CROP.width, naturalHeight: SHIP_SPRITE_CROP.height },
    SHIP_RENDER_LONG_EDGE
  );
  if (shipSize) {
    shipW = shipSize.width;
    shipH = shipSize.height;
  }
  const shipX = state.ship.x - shipW / 2;
  const shipY = state.ship.y - shipH / 2;

  if (shipImage.complete && shipImage.naturalWidth > 0) {
    ctx.drawImage(
      shipImage,
      SHIP_SPRITE_CROP.x,
      SHIP_SPRITE_CROP.y,
      SHIP_SPRITE_CROP.width,
      SHIP_SPRITE_CROP.height,
      shipX,
      shipY,
      shipW,
      shipH
    );
  } else {
    ctx.fillStyle = '#6b3f1f';
    ctx.fillRect(shipX, shipY + 24, shipW, 42);
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(shipX + 6, shipY + 14, shipW - 12, 16);
  }

  drawHpBar(shipX, shipY - 12, shipW, state.ship.hp, state.ship.maxHp, '#22c55e');
  const eliteUnlockedTier = getEliteUnlockedTier(state.waves.elapsedSec);
  const eliteMaxUnlocked = eliteUnlockedTier >= 10;
  const auraPulse = (Math.sin(performance.now() * 0.012) + 1) * 0.5;

  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    const image = enemy?.image;
    if (enemy.elite) {
      ctx.save();
      if (eliteMaxUnlocked) {
        ctx.shadowColor = `rgba(96, 0, 0, ${0.58 + auraPulse * 0.24})`;
        ctx.shadowBlur = 18 + auraPulse * 8;
        ctx.beginPath();
        ctx.fillStyle = `rgba(84, 0, 0, ${0.22 + auraPulse * 0.16})`;
        ctx.arc(enemy.x, enemy.y, enemy.radius * (1.18 + auraPulse * 0.14), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = `rgba(150, 15, 15, ${0.28 + auraPulse * 0.26})`;
        ctx.arc(enemy.x, enemy.y, enemy.radius * (1.42 + auraPulse * 0.18), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.shadowColor = 'rgba(255, 30, 30, 0.75)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 40, 40, 0.35)';
        ctx.arc(enemy.x, enemy.y, enemy.radius * 1.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (image && image.complete && image.naturalWidth > 0) {
      const enemySize = getDrawSizeByLongEdge(image, enemy.renderSize);
      const drawW = enemySize ? enemySize.width : enemy.renderSize;
      const drawH = enemySize ? enemySize.height : enemy.renderSize;
      const drawX = enemy.x - drawW / 2;
      const drawY = enemy.y - drawH / 2;
      const renderImage = enemy.elite
        ? getEliteTintedSprite(image, eliteMaxUnlocked ? 'max' : 'normal')
        : image;
      ctx.drawImage(renderImage, drawX, drawY, drawW, drawH);
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
    ctx.save();
    ctx.shadowColor = 'rgba(255, 229, 130, 0.92)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 203, 88, 0.95)';
    ctx.arc(bullet.x, bullet.y, bullet.radius + 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.fillStyle = '#fff7c2';
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(236, 245, 255, 0.92)';
  ctx.font = '700 16px Apple SD Gothic Neo, Malgun Gothic, sans-serif';
  ctx.fillText(`Wave Lv.${state.waves.level}`, 14, 26);
  const unlockedTier = getUnlockedEnemyTier(state.waves.elapsedSec);
  ctx.fillText(`적 ${state.enemies.length}명 · 출현 01~${String(unlockedTier).padStart(2, '0')}`, 14, 48);
  if (eliteUnlockedTier > 0) {
    const eliteLabel = eliteMaxUnlocked
      ? '붉은특수 MAX · 검붉은 오라 활성'
      : `붉은특수 01~${String(eliteUnlockedTier).padStart(2, '0')} 출현`;
    ctx.fillText(eliteLabel, 14, 70);
  }
};

const refreshHud = () => {
  els.shipHp.textContent = `${Math.max(0, Math.round(state.ship.hp))} / ${state.ship.maxHp}`;
  els.killScore.textContent = String(state.score.kills);
  els.goldValue.textContent = String(state.score.gold);
  els.expValue.textContent = String(state.score.exp);

  const speedMultiplier = 1 + state.ship.attackSpeedLevel * SHIP_ATTACK_SPEED_LEVEL_STEP;
  const shotsPerSec = 1000 / getAttackCooldownMs();
  const dps = state.ship.attackPower * state.ship.projectileCount * shotsPerSec;
  if (els.attackSpeedStat) {
    els.attackSpeedStat.textContent = `1m/s x${speedMultiplier.toFixed(1)}`;
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
    els.projectileCountStat.textContent = `${state.ship.projectileCount}발`;
  }
  if (els.projectileLevelStat) {
    els.projectileLevelStat.textContent = `Lv.${state.ship.projectileLevel}`;
  }
  if (els.dpsStat) {
    els.dpsStat.textContent = String(Math.round(dps));
  }

  if (els.currentEnemyInfo) {
    els.currentEnemyInfo.textContent = getCurrentEnemyInfoText();
  }

  const healCost = getHealCost();
  if (els.buyHealBtn) {
    els.buyHealBtn.textContent = `체력 회복 (${healCost}G)`;
    els.buyHealBtn.disabled = state.score.gold < healCost || state.ship.hp >= state.ship.maxHp || state.gameover;
  }

  const speedCost = getSpeedUpgradeCost();
  if (els.upgradeSpeedBtn) {
    els.upgradeSpeedBtn.textContent = `공격속도 업 (${speedCost}EXP)`;
    els.upgradeSpeedBtn.disabled = state.score.exp < speedCost || state.gameover;
  }

  const powerCost = getPowerUpgradeCost();
  if (els.upgradePowerBtn) {
    els.upgradePowerBtn.textContent = `공격력 업 (${powerCost}EXP)`;
    els.upgradePowerBtn.disabled = state.score.exp < powerCost || state.gameover;
  }

  const bulletCost = getBulletUpgradeCost();
  if (els.upgradeBulletBtn) {
    els.upgradeBulletBtn.textContent = `총알 개수 업 (${bulletCost}EXP)`;
    els.upgradeBulletBtn.disabled = state.score.exp < bulletCost || state.gameover;
  }

  const totalUpgradeLevel =
    state.ship.attackSpeedLevel + state.ship.attackPowerLevel + state.ship.projectileLevel;
  const combatRank = 1 + totalUpgradeLevel;
  const nextUpgradeCost = Math.max(1, Math.min(speedCost, powerCost, bulletCost));
  const nextUpgradeRemain = Math.max(0, nextUpgradeCost - state.score.exp);
  if (els.upgradeRank) {
    els.upgradeRank.textContent = String(combatRank);
  }
  if (els.upgradeExpFill) {
    const ratio = clamp(state.score.exp / nextUpgradeCost, 0, 1);
    els.upgradeExpFill.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }
  if (els.upgradeExpText) {
    els.upgradeExpText.textContent = nextUpgradeRemain > 0
      ? `다음 강화까지 EXP ${nextUpgradeRemain}`
      : '강화 가능! 버튼을 눌러 바로 성장하세요.';
  }

  const unlockedTier = getUnlockedEnemyTier(state.waves.elapsedSec);
  const eliteUnlockedTier = getEliteUnlockedTier(state.waves.elapsedSec);
  if (els.enemyTierText) {
    const eliteLabel = eliteUnlockedTier > 0
      ? ` · 붉은특수 01~${String(eliteUnlockedTier).padStart(2, '0')}`
      : '';
    els.enemyTierText.textContent = `일반 적 01~${String(unlockedTier).padStart(2, '0')}${eliteLabel}`;
  }
  if (Array.isArray(els.enemyTierDots) && els.enemyTierDots.length) {
    els.enemyTierDots.forEach((dot, index) => {
      const tier = index + 1;
      dot.classList.toggle('is-unlocked', tier <= unlockedTier);
      dot.classList.toggle('is-elite', eliteUnlockedTier > 0 && tier <= eliteUnlockedTier);
    });
  }
  if (els.battleFlowBadge) {
    const dangerLevel = getDangerLevel();
    const flowLabel = state.flow?.label || '보통';
    els.battleFlowBadge.textContent = `위협 Lv.${dangerLevel} · ${flowLabel}`;
  }

  if (state.quiz.loading) {
    els.openQuizBtn.textContent = '퀴즈 준비 중...';
  } else if (state.quiz.error) {
    els.openQuizBtn.textContent = '퀴즈 재시도';
  } else {
    els.openQuizBtn.textContent = '퀴즈 열기';
  }
  if (els.openQuizBtn) {
    els.openQuizBtn.disabled = state.quiz.loading || state.gameover;
  }
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
        maxWaveLevel: state.waves.level,
        battleshipEndMode: setup.battleshipEndMode,
        battleshipTimeLimitSec: setup.battleshipTimeLimitSec,
        battleshipKillLimit: setup.battleshipKillLimit,
        endReason: state.endReason || ''
      },
      players: [{
        name: activeParticipant.name,
        tag: activeParticipant.tag,
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
  els.gameoverScore.textContent = String(state.score.kills);
  const reasonLabel = state.endReason || '종료';
  const survivedSec = Math.max(0, Math.round(state.waves.elapsedSec));
  els.gameoverTime.textContent = `${survivedSec}초`;
  if (els.gameoverReason) {
    els.gameoverReason.textContent = `종료 기준: ${reasonLabel}`;
  }
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

els.sideMainMenuBtn?.addEventListener('click', () => {
  openMainMenuLeaveModal();
});

els.gameoverMainMenuBtn?.addEventListener('click', () => {
  openMainMenuLeaveModal();
});

els.quizCloseBtn?.addEventListener('click', () => {
  closeQuizLayer({ keepStatus: false });
});

els.quizNextBtn?.addEventListener('click', () => {
  if (state.gameover || els.quizLayer.classList.contains('hidden')) return;
  showNextQuizQuestion();
});

els.quizReturnBtn?.addEventListener('click', () => {
  closeQuizLayer({ keepStatus: false });
});

els.quizLayer.addEventListener('click', (event) => {
  if (event.target !== els.quizLayer) return;
  closeQuizLayer({ keepStatus: false });
});

els.mainMenuLeaveBackdrop?.addEventListener('click', closeMainMenuLeaveModal);
els.mainMenuLeaveCancel?.addEventListener('click', closeMainMenuLeaveModal);
els.mainMenuLeaveConfirm?.addEventListener('click', leaveToMainMenu);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMainMenuLeaveModal();
  }
});

els.restartBtn.addEventListener('click', restart);

const initializeGame = async () => {
  const loadingStartAt = performance.now();
  const stopLoadingPresentation = beginLoadingPresentation(loadingStartAt);
  const [shipReady] = await Promise.all([
    preloadShipImage(),
    preloadEnemyImages(),
    loadQuizBank()
  ]);
  const elapsedMs = performance.now() - loadingStartAt;
  if (elapsedMs < MIN_LOADING_MS) {
    await waitMs(MIN_LOADING_MS - elapsedMs);
  }
  stopLoadingPresentation();
  if (!shipReady) {
    setStatus('거북선 이미지를 불러오지 못해 기본 도형으로 표시합니다.');
  } else if (state.quiz.error) {
    setStatus(state.quiz.error);
  } else {
    const participantPrefix = setup.players > 1 ? `${activeParticipantLabel} · ` : '';
    setStatus(`${participantPrefix}적이 거북선에 닿기 전에 최대한 많이 격파하세요. 종료 기준: ${getEndCriteriaLabel()}`);
  }
  state.running = true;
  refreshHud();
  requestAnimationFrame((ts) => {
    state.startAtMs = ts;
    state.lastFrameMs = ts;
    requestAnimationFrame(frame);
  });
};

if (shouldRedirectToSplitHost) {
  const splitUrl = new URL('./split/', window.location.href);
  splitUrl.searchParams.set('fromLauncher', query.get('fromLauncher') || '1');
  window.location.replace(splitUrl.toString());
} else {
  if (splitMode) {
    document.body.classList.add('split-mode');
  }
  refreshHud();
  applyLayoutMode();
  window.addEventListener('resize', applyLayoutMode, { passive: true });
  initializeGame();
}
