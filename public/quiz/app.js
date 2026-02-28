import { createQuizEngine } from './core/engine.js';
import { buildWeightedQuestionBank } from './core/bank.js';
import { validateQuestionBank } from './core/validate.js';
import { generatePlaceValueAreaModelBank } from './core/generators/place-value-area-model.js';
import { parseCsvQuestionBank } from './core/importers/csv-question-bank.js';
import {
  isPlaceValueAreaModelQuestion,
  renderPlaceValueAreaModelQuestion
} from './renderers/place-value-area-model.js';
import { saveQuizSessionRecord } from '../shared/local-game-records.js';

const $ = (selector) => document.querySelector(selector);
const launchParams = new URLSearchParams(window.location.search);
const csvToolMode = String(launchParams.get('mode') || '').trim().toLowerCase() === 'csv';

const settingsCard = $('#settings-card');
const quizGrid = $('#quiz-grid');
const quizTemplate = $('#quiz-card-template');
const summaryCard = $('#summary-card');
const logOutputEl = $('#log-output');
const loadStatusEl = $('#load-status');
const zoomModal = $('#zoom-modal');
const zoomBackdrop = $('#zoom-backdrop');
const zoomClose = $('#zoom-close');
const zoomImg = $('#zoom-img');
const presetListEl = $('#preset-list');
const presetModal = $('#preset-modal');
const presetBackdrop = $('#preset-backdrop');
const presetCancel = $('#preset-cancel');
const presetConfirm = $('#preset-confirm');
const presetText = $('#preset-text');
const presetSummary = $('#preset-summary');
const quizAppTitleEl = document.getElementById('quiz-app-title');
const appModeBannerEl = $('#app-mode-banner');
const basicListEl = $('#basic-list');
const basicFiveBtn = $('#basic-5min');
const basicTwelveBtn = $('#basic-12q');
const basicPvamBtn = $('#basic-pvam');
const advancedToggle = $('#advanced-toggle');
const advancedSettings = $('#advanced-settings');
const typeToggle = $('#type-toggle');
const typeGrid = $('#type-grid');
const modeButtons = [...document.querySelectorAll('[data-mode-select]')];
const modeHelp = $('#mode-help');
const nameManageToggle = $('#name-manage-toggle');
const nameModal = $('#name-modal');
const nameModalBackdrop = $('#name-modal-backdrop');
const nameModalClose = $('#name-modal-close');
const presetNameInput = $('#preset-name');
const presetSaveBtn = $('#preset-save');
const basicModal = $('#basic-modal');
const basicBackdrop = $('#basic-backdrop');
const basicCancel = $('#basic-cancel');
const basicStart = $('#basic-start');
const basicTitle = $('#basic-title');
const basicDesc = $('#basic-desc');
const basicPlayers = $('#basic-players');
const basicTime = $('#basic-time');
const basicCount = $('#basic-count');
const basicQuestionTime = $('#basic-question-time');
const basicCombo = $('#basic-combo');
const basicComboBonus = $('#basic-combo-bonus');
const basicTimeBonus = $('#basic-time-bonus');
const basicTimeBonusPer = $('#basic-time-bonus-per');
const basicTimeBonusCap = $('#basic-time-bonus-cap');
const basicRanking = $('#basic-ranking');
const basicGame = $('#basic-game');
const faceModal = $('#face-modal');
const faceBackdrop = $('#face-backdrop');
const faceNormalBtn = $('#face-normal');
const faceConfirmBtn = $('#face-confirm');
const retryListEl = $('#retry-list');
const retryNoteEl = $('#retry-note');
const savedWrongListEl = $('#wrong-list');
const groupNamesInput = $('#setting-group-names');
const saveGroupNamesBtn = $('#save-group-names');
const groupNameListEl = $('#group-name-list');
const studentNameInput = $('#student-name-input');
const saveStudentNameBtn = $('#save-student-name');
const studentNameListEl = $('#student-name-list');
const customPanelEl = $('#custom-panel');
const customListEl = $('#custom-list');
const customRandomBtn = $('#custom-random');
const customRandomCount = $('#custom-random-count');
const customClearBtn = $('#custom-clear');
const customCsvFileInput = $('#custom-csv-file');
const customCsvClearBtn = $('#custom-csv-clear');
const customCsvStatusEl = $('#custom-csv-status');
const customCsvTemplateBtn = $('#custom-csv-template');
const customPackExportBtn = $('#custom-pack-export');
const confirmTypeCountsBtn = $('#confirm-type-counts');
const confirmStatusEl = $('#count-confirm-status');

const startBtn = $('#start-btn');
const resetBtn = $('#reset-btn');
const restartBtn = $('#restart-btn');
const copyLogBtn = $('#copy-log-btn');
const downloadLogBtn = $('#download-log-btn');
const downloadReportCsvBtn = $('#download-report-csv-btn');
const resultDownloadNoteEl = $('#result-download-note');
const resultRecordsLink = $('#result-records-link');
const resultClassroomLink = $('#result-classroom-link');
const LAUNCHER_SETUP_STORAGE_KEY = 'jumpmap.launcher.setup.v1';

const settingsInputs = {
  players: $('#setting-players'),
  endMode: $('#setting-end-mode'),
  quizTime: $('#setting-quiz-time'),
  student: $('#setting-student'),
  mode: $('#setting-mode'),
  repeat: $('#setting-repeat'),
  shuffle: $('#setting-shuffle'),
  time: $('#setting-time'),
  ranking: $('#setting-ranking'),
  score: $('#setting-score'),
  penalty: $('#setting-penalty'),
  combo: $('#setting-combo'),
  comboBonus: $('#setting-combo-bonus'),
  timeBonus: $('#setting-time-bonus'),
  timeBonusPer: $('#setting-time-bonus-per'),
  timeBonusCap: $('#setting-time-bonus-cap'),
  customEnabled: $('#setting-custom-enabled'),
  customCsvEnabled: $('#setting-custom-csv-enabled'),
  customIds: $('#setting-custom-ids')
};

const typeInputs = {
  cube_facecolor: {
    enabled: $('#type-cube-facecolor-enabled'),
    count: $('#type-cube-facecolor-count')
  },
  cube_edgecolor: {
    enabled: $('#type-cube-edgecolor-enabled'),
    count: $('#type-cube-edgecolor-count')
  },
  cube_validity: {
    enabled: $('#type-cube-validity-enabled'),
    count: $('#type-cube-validity-count')
  },
  cuboid_facecolor: {
    enabled: $('#type-cuboid-facecolor-enabled'),
    count: $('#type-cuboid-facecolor-count')
  },
  cuboid_edgecolor: {
    enabled: $('#type-cuboid-edgecolor-enabled'),
    count: $('#type-cuboid-edgecolor-count')
  },
  cuboid_validity: {
    enabled: $('#type-cuboid-validity-enabled'),
    count: $('#type-cuboid-validity-count')
  }
};

let questionBank = null;
let defaultSettings = null;
let players = [];
let sessionSettings = null;
let resizeHandlerBound = false;
let pendingPreset = null;
let pendingStartSettings = null;
let countsConfirmed = false;
let pendingBasicMode = null;
let typeOpen = false;
let uploadedCsvQuestionBank = null;
const CUSTOM_PRESET_KEY = 'quiz_custom_presets_v1';
let customPresets = [];
const QUIZ_STORAGE_DB_NAME = 'knolquiz-quiz-storage';
const QUIZ_STORAGE_DB_VERSION = 1;
const QUIZ_STORAGE_STORE = 'kv';
const QUIZ_STORE_KEY_CUSTOM_PRESETS = 'customPresets';
const QUIZ_STORE_KEY_WRONGS = 'savedWrongs';
const QUIZ_STORE_KEY_STUDENT_NAMES = 'studentNames';
const QUIZ_STORE_KEY_GROUP_NAMES = 'groupNames';
let quizStorageDbPromise = null;
let cachedCustomPresets = [];

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

const buildPlayPageHrefWithFilters = (basePath, filters = {}) => {
  const studentNo = normalizeStudentNo(filters?.studentNo);
  const periodDays = normalizePeriodDays(filters?.periodDays);
  const params = new URLSearchParams();
  if (studentNo) params.set('studentNo', String(studentNo));
  if (periodDays) params.set('periodDays', String(periodDays));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ''}`;
};

const readResultFilterContextFromQuery = () => ({
  studentNo: normalizeStudentNo(launchParams.get('studentNo')),
  periodDays: normalizePeriodDays(launchParams.get('periodDays'))
});

const resultFilterContext = readResultFilterContextFromQuery();

const syncResultNavigationLinks = (filters = resultFilterContext) => {
  if (resultRecordsLink) {
    resultRecordsLink.href = buildPlayPageHrefWithFilters('../play/records/', filters);
  }
  if (resultClassroomLink) {
    resultClassroomLink.href = buildPlayPageHrefWithFilters('../play/classroom/', filters);
  }
};

const resolveSingleStudentNoFromLogs = (logs = []) => {
  const unique = new Set();
  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const studentNo = normalizeStudentNo(log?.settings?.studentId);
    if (studentNo) unique.add(studentNo);
  });
  if (unique.size !== 1) return null;
  const [onlyOne] = unique;
  return onlyOne || null;
};

syncResultNavigationLinks(resultFilterContext);
let latestQuizResultPayload = null;
let cachedSavedWrongs = [];
let cachedStudentNames = [];
let cachedGroupNames = [];

const escapeReportCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsvTextFile = (fileName, text) => {
  const withBom = `\ufeff${String(text || '')}`;
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const setResultDownloadNote = (message, tone = '') => {
  if (!resultDownloadNoteEl) return;
  resultDownloadNoteEl.textContent = message || '';
  resultDownloadNoteEl.classList.remove('is-success', 'is-warn');
  if (tone === 'success') resultDownloadNoteEl.classList.add('is-success');
  if (tone === 'warn') resultDownloadNoteEl.classList.add('is-warn');
};

const buildQuizResultReportCsv = (payload) => {
  const rows = [[
    '리포트유형',
    '생성시각',
    '플레이어순번',
    '학생번호',
    '모둠명',
    '총점',
    '정답수',
    '총문항',
    '정답률',
    '문항ID',
    '문항유형',
    '문항내용',
    '선택값',
    '정답값',
    '정오',
    '응답시간ms',
    '점수증감'
  ]];
  const logs = Array.isArray(payload?.players) ? payload.players : [];
  const createdAt = new Date().toISOString();
  logs.forEach((log, index) => {
    const studentNo = normalizeStudentNo(log?.settings?.studentId);
    const groupName = String(log?.groupName || '').trim();
    const summary = log?.summary || {};
    rows.push([
      '퀴즈요약',
      createdAt,
      index + 1,
      studentNo || '',
      groupName || '',
      Number(summary.totalScore) || 0,
      Number(summary.correctCount) || 0,
      Number(summary.totalCount) || 0,
      Number(summary.accuracy) || 0,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);
    const answers = Array.isArray(log?.answers) ? log.answers : [];
    answers.forEach((answer) => {
      rows.push([
        '퀴즈문항',
        createdAt,
        index + 1,
        studentNo || '',
        groupName || '',
        Number(summary.totalScore) || 0,
        Number(summary.correctCount) || 0,
        Number(summary.totalCount) || 0,
        Number(summary.accuracy) || 0,
        answer?.questionId || '',
        answer?.type || '',
        answer?.prompt || answer?.question || '',
        answer?.choice ?? '',
        answer?.answer ?? '',
        answer?.correct ? '정답' : '오답',
        Number(answer?.timeMs) || 0,
        Number(answer?.scoreDelta) || 0
      ]);
    });
  });
  return rows.map((row) => row.map((cell) => escapeReportCsvCell(cell)).join(',')).join('\n');
};

const downloadQuizResultReportCsv = () => {
  let payload = latestQuizResultPayload;
  if (!payload && logOutputEl?.value) {
    try {
      payload = JSON.parse(logOutputEl.value);
    } catch (_error) {
      payload = null;
    }
  }
  if (!payload || !Array.isArray(payload?.players) || !payload.players.length) {
    setResultDownloadNote('저장할 결과 데이터가 없습니다. 먼저 퀴즈를 완료해 주세요.', 'warn');
    return false;
  }
  const csvText = buildQuizResultReportCsv(payload);
  const fileName = `quiz-result-report-${Date.now()}.csv`;
  downloadCsvTextFile(fileName, csvText);
  setResultDownloadNote(
    `CSV 저장 요청 완료 (${fileName}) · Android에서 바로 열기 앱이 안 뜨면 파일 앱(내 파일) > Download 폴더를 확인해 주세요.`,
    'success'
  );
  return true;
};
const syncRepeatSetting = () => {
  if (!settingsInputs.mode || !settingsInputs.repeat) return;
  if (settingsInputs.mode.value === 'sequential') {
    settingsInputs.repeat.value = 'false';
    settingsInputs.repeat.disabled = true;
  } else {
    settingsInputs.repeat.disabled = false;
  }
};

const banks = {};
const basePools = {};
const validityShapePools = {
  cube: { valid: new Set(), invalid: new Set() },
  cuboid: { valid: new Set(), invalid: new Set() }
};
const CACHE_BUST = Date.now();
const WRONG_STORAGE_KEY = 'mathNetMasterWrongSets';
const GROUP_NAMES_KEY = 'mathNetMasterGroupNames';
const STUDENT_NAMES_KEY = 'mathNetMasterStudentNames';

const supportsQuizIndexedDb = () => typeof indexedDB !== 'undefined';

const clonePersisted = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const parseLegacyArray = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`failed to parse legacy storage: ${key}`, error);
    return [];
  }
};

const idbRequestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb request failed'));
  });

const idbTxDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('indexeddb transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('indexeddb transaction failed'));
  });

const openQuizStorageDb = () => {
  if (quizStorageDbPromise) return quizStorageDbPromise;
  quizStorageDbPromise = new Promise((resolve, reject) => {
    if (!supportsQuizIndexedDb()) {
      reject(new Error('indexeddb_unavailable'));
      return;
    }
    const request = indexedDB.open(QUIZ_STORAGE_DB_NAME, QUIZ_STORAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUIZ_STORAGE_STORE)) {
        db.createObjectStore(QUIZ_STORAGE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb open failed'));
  });
  return quizStorageDbPromise;
};

const readQuizStoreValue = async (key) => {
  const db = await openQuizStorageDb();
  const tx = db.transaction([QUIZ_STORAGE_STORE], 'readonly');
  const store = tx.objectStore(QUIZ_STORAGE_STORE);
  const row = await idbRequestToPromise(store.get(key));
  await idbTxDone(tx);
  const value = row?.value;
  return Array.isArray(value) ? value : [];
};

const writeQuizStoreValue = async (key, value) => {
  const normalized = Array.isArray(value) ? value : [];
  const db = await openQuizStorageDb();
  const tx = db.transaction([QUIZ_STORAGE_STORE], 'readwrite');
  const store = tx.objectStore(QUIZ_STORAGE_STORE);
  store.put({
    key,
    value: normalized,
    updatedAt: new Date().toISOString()
  });
  await idbTxDone(tx);
};

const persistQuizStoreValue = (key, value, legacyKey) => {
  const normalized = Array.isArray(value) ? value : [];
  if (!supportsQuizIndexedDb()) {
    try {
      localStorage.setItem(legacyKey, JSON.stringify(normalized));
    } catch (error) {
      console.warn(`failed to persist legacy storage: ${legacyKey}`, error);
    }
    return;
  }
  writeQuizStoreValue(key, normalized)
    .then(() => {
      try {
        localStorage.removeItem(legacyKey);
      } catch (_error) {
        // ignore localStorage remove failure
      }
    })
    .catch((error) => {
      console.warn(`failed to persist indexeddb store: ${key}`, error);
      try {
        localStorage.setItem(legacyKey, JSON.stringify(normalized));
      } catch (_legacyError) {
        // ignore fallback failure
      }
    });
};

const bootstrapQuizPersistentStorage = async () => {
  cachedCustomPresets = parseLegacyArray(CUSTOM_PRESET_KEY);
  cachedSavedWrongs = parseLegacyArray(WRONG_STORAGE_KEY);
  cachedStudentNames = parseLegacyArray(STUDENT_NAMES_KEY);
  cachedGroupNames = parseLegacyArray(GROUP_NAMES_KEY);
  if (!supportsQuizIndexedDb()) return;
  try {
    const [
      dbCustomPresets,
      dbSavedWrongs,
      dbStudentNames,
      dbGroupNames
    ] = await Promise.all([
      readQuizStoreValue(QUIZ_STORE_KEY_CUSTOM_PRESETS),
      readQuizStoreValue(QUIZ_STORE_KEY_WRONGS),
      readQuizStoreValue(QUIZ_STORE_KEY_STUDENT_NAMES),
      readQuizStoreValue(QUIZ_STORE_KEY_GROUP_NAMES)
    ]);

    const maybeMigrate = async (dbValue, legacyValue, storeKey, legacyKey) => {
      if (dbValue.length) return dbValue;
      if (!legacyValue.length) return [];
      await writeQuizStoreValue(storeKey, legacyValue);
      try {
        localStorage.removeItem(legacyKey);
      } catch (_error) {
        // ignore remove error
      }
      return legacyValue;
    };

    cachedCustomPresets = await maybeMigrate(
      dbCustomPresets,
      cachedCustomPresets,
      QUIZ_STORE_KEY_CUSTOM_PRESETS,
      CUSTOM_PRESET_KEY
    );
    cachedSavedWrongs = await maybeMigrate(
      dbSavedWrongs,
      cachedSavedWrongs,
      QUIZ_STORE_KEY_WRONGS,
      WRONG_STORAGE_KEY
    );
    cachedStudentNames = await maybeMigrate(
      dbStudentNames,
      cachedStudentNames,
      QUIZ_STORE_KEY_STUDENT_NAMES,
      STUDENT_NAMES_KEY
    );
    cachedGroupNames = await maybeMigrate(
      dbGroupNames,
      cachedGroupNames,
      QUIZ_STORE_KEY_GROUP_NAMES,
      GROUP_NAMES_KEY
    );
  } catch (error) {
    console.warn('failed to bootstrap quiz indexeddb storage', error);
  }
};

const loadJson = async (path) => {
  const res = await fetch(`${path}?v=${CACHE_BUST}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

const getBaseId = (type, assetPath) => {
  if (type === 'facecolor') {
    return assetPath.replace('facecolor/', '').split('-facecolor-')[0];
  }
  if (type === 'edgecolor') {
    return assetPath.replace('edgecolor/', '').split('-edgecolor')[0];
  }
  return assetPath;
};

const getShapeKind = (assetPath) => {
  if (!assetPath) return 'unknown';
  if (assetPath.includes('cuboid-') || assetPath.includes('cuboid-bad')) return 'cuboid';
  if (assetPath.includes('cube-') || assetPath.includes('cube-bad')) return 'cube';
  return 'unknown';
};

const getQuestionShape = (question) => {
  if (!question) return 'unknown';
  if (Array.isArray(question.tags)) {
    if (question.tags.includes('cube')) return 'cube';
    if (question.tags.includes('cuboid')) return 'cuboid';
  }
  const candidates = [
    question.question,
    question.answer,
    ...(question.choices || [])
  ].filter(Boolean);
  for (const path of candidates) {
    const shape = getShapeKind(path);
    if (shape !== 'unknown') return shape;
  }
  return 'unknown';
};

const typeLabelMap = {
  cube_facecolor: '정육면체-평행한 면',
  cube_edgecolor: '정육면체-맞물리는 모서리',
  cube_validity: '정육면체-정상/비정상',
  cuboid_facecolor: '직육면체-평행한 면',
  cuboid_edgecolor: '직육면체-맞물리는 모서리',
  cuboid_validity: '직육면체-정상/비정상'
};

const shuffleArray = (items) => {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const buildBasePools = (bank, type) => {
  const pool = new Map();
  bank.questions.forEach((question) => {
    if (question.type !== type) return;
    const baseId = getBaseId(type, question.question);
    if (!pool.has(baseId)) pool.set(baseId, new Set());
    pool.get(baseId).add(question.question);
    pool.get(baseId).add(question.answer);
  });
  return pool;
};

const buildValidityShapePools = (bank) => {
  const pools = {
    cube: { valid: new Set(), invalid: new Set() },
    cuboid: { valid: new Set(), invalid: new Set() }
  };
  bank.questions.forEach((question) => {
    const items = [question.question, question.answer, ...(question.choices || [])].filter(Boolean);
    items.forEach((item) => {
      const kind = getShapeKind(item);
      const validity = item.includes('invalid/') ? 'invalid' : 'valid';
      if (kind === 'cube' || kind === 'cuboid') {
        pools[kind][validity].add(item);
      }
    });
  });
  return pools;
};

const fixChoices = (question) => {
  if (question.lockedChoices) return question;
  if (['facecolor', 'edgecolor'].includes(question.type)) {
    const pool = basePools[question.type];
    if (!pool) return question;
    const baseId = getBaseId(question.type, question.question);
    const poolSet = pool.get(baseId);
    if (!poolSet) return question;
    const all = [...poolSet].filter((item) => item !== question.question && item !== question.answer);
    const needed = Math.max(0, question.choices.length - 1);
    const shuffled = all.sort(() => Math.random() - 0.5);
    const distractors = shuffled.slice(0, needed);
    const choices = [question.answer, ...distractors].sort(() => Math.random() - 0.5);
    return { ...question, choices };
  }

  if (question.type === 'validity') {
    const shapeKind = getShapeKind(question.question) || getShapeKind(question.answer);
    const desired = question.choices?.length || 4;
    const answerPath = question.answer;
    const answerInvalid = question.mode === 'invalid' || (answerPath || '').includes('invalid/');
    const desiredType = answerInvalid ? 'invalid' : 'valid';
    const oppositeType = answerInvalid ? 'valid' : 'invalid';
    const pool = shapeKind === 'cube' || shapeKind === 'cuboid'
      ? validityShapePools[shapeKind]
      : null;
    const opposite = pool ? [...pool[oppositeType]] : [];
    const same = pool ? [...pool[desiredType]] : [];
    const choices = [];

    if (answerPath) choices.push(answerPath);
    const extras = opposite.filter((item) => item !== answerPath);
    while (choices.length < desired && extras.length > 0) {
      const pickIndex = Math.floor(Math.random() * extras.length);
      choices.push(extras.splice(pickIndex, 1)[0]);
    }
    if (choices.length < desired) {
      const fallback = same.filter((item) => !choices.includes(item));
      while (choices.length < desired && fallback.length > 0) {
        const pickIndex = Math.floor(Math.random() * fallback.length);
        choices.push(fallback.splice(pickIndex, 1)[0]);
      }
    }
    return { ...question, choices: shuffleArray(choices) };
  }

  const shapeKind = getShapeKind(question.question);
  if (shapeKind === 'unknown') return question;
  const filtered = (question.choices || []).filter((item) => getShapeKind(item) === shapeKind);
  if (!filtered.length) return question;
  const merged = question.answer && !filtered.includes(question.answer)
    ? [...filtered, question.answer]
    : filtered;
  return { ...question, choices: merged };
};

const applyDefaultSettings = (settings) => {
  if (settingsInputs.players) {
    const playerCount = settings.playerCount || 1;
    settingsInputs.players.value = playerCount === 2
      ? (settings.twoPlayerLayout || '1x2')
      : String(playerCount);
  }
  if (settingsInputs.endMode) settingsInputs.endMode.value = settings.quizEndMode || 'count';
  if (settingsInputs.quizTime) settingsInputs.quizTime.value = settings.quizTimeLimitSec ?? 0;
  if (settingsInputs.student) settingsInputs.student.value = settings.studentId || '01';
  if (groupNamesInput) {
    const names = settings.groupNames || [];
    groupNamesInput.value = names.join(', ');
  }
  if (settingsInputs.customEnabled) {
    settingsInputs.customEnabled.value = settings.customQuestionMode ? 'true' : 'false';
  }
  if (settingsInputs.customCsvEnabled) {
    settingsInputs.customCsvEnabled.value = settings.customCsvMode ? 'true' : 'false';
  }
  if (settingsInputs.customIds) {
    settingsInputs.customIds.value = (settings.customQuestionIds || []).join(', ');
  }
  if (settingsInputs.ranking) {
    settingsInputs.ranking.value = settings.rankingEnabled ? 'true' : 'false';
  }
  settingsInputs.mode.value = settings.selectionMode;
  settingsInputs.repeat.value = settings.avoidRepeat ? 'true' : 'false';
  settingsInputs.shuffle.value = settings.shuffleChoices ? 'true' : 'false';
  settingsInputs.time.value = settings.timeLimitSec;
  settingsInputs.score.value = settings.score.base;
  settingsInputs.penalty.value = settings.wrongDelaySec ?? settings.score.penalty ?? 0;
  settingsInputs.combo.value = settings.score.comboEnabled ? 'true' : 'false';
  settingsInputs.comboBonus.value = settings.score.comboBonus;
  settingsInputs.timeBonus.value = settings.score.timeBonusEnabled ? 'true' : 'false';
  settingsInputs.timeBonusPer.value = settings.score.timeBonusPerSec;
  if (settingsInputs.timeBonusCap) {
    settingsInputs.timeBonusCap.value = settings.score.timeBonusMaxRatio ?? 0;
  }

  const defaults = settings.questionTypes || {
    cube_facecolor: { enabled: true, count: 5 },
    cube_edgecolor: { enabled: true, count: 5 },
    cube_validity: { enabled: true, count: 5 },
    cuboid_facecolor: { enabled: true, count: 5 },
    cuboid_edgecolor: { enabled: true, count: 5 },
    cuboid_validity: { enabled: true, count: 5 }
  };

  Object.entries(typeInputs).forEach(([key, fields]) => {
    const config = defaults[key] || { enabled: false, count: 0 };
    fields.enabled.value = config.enabled ? 'true' : 'false';
    fields.count.value = config.count ?? 0;
  });
  countsConfirmed = false;
  updateCountConfirmStatus();
  updateCustomPanelVisibility();
};

const presets = [
  {
    id: 'pvam-mixed-demo',
    label: '영역모델 곱셈 데모',
    description: '과정+결과 혼합 10문제',
    settings: {
      quizEndMode: 'count',
      quizTimeLimitSec: 0,
      timeLimitSec: 0,
      rankingEnabled: false,
      shuffleChoices: false,
      selectionMode: 'sequential',
      avoidRepeat: true
    },
    pvamDemo: {
      count: 10,
      seed: 1,
      min: 11,
      max: 99,
      taskKinds: ['mixed_process', 'partial_sums', 'partial_cells', 'final_product']
    }
  },
  {
    id: 'parallel-focus',
    label: '평행한 면 집중',
    description: '10문제',
    settings: {
      questionTypes: {
        cube_facecolor: { enabled: true, count: 5 },
        cube_edgecolor: { enabled: false, count: 0 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: true, count: 5 },
        cuboid_edgecolor: { enabled: false, count: 0 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  },
  {
    id: 'edge-focus',
    label: '맞물리는 모서리 집중',
    description: '10문제',
    settings: {
      questionTypes: {
        cube_facecolor: { enabled: false, count: 0 },
        cube_edgecolor: { enabled: true, count: 5 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: false, count: 0 },
        cuboid_edgecolor: { enabled: true, count: 5 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  },
  {
    id: 'validity-focus',
    label: '정상/비정상 집중',
    description: '10문제',
    settings: {
      questionTypes: {
        cube_facecolor: { enabled: false, count: 0 },
        cube_edgecolor: { enabled: false, count: 0 },
        cube_validity: { enabled: true, count: 5 },
        cuboid_facecolor: { enabled: false, count: 0 },
        cuboid_edgecolor: { enabled: false, count: 0 },
        cuboid_validity: { enabled: true, count: 5 }
      }
    }
  },
  {
    id: 'mixed',
    label: '혼합 7:3',
    description: '평행 7 / 모서리 3',
    settings: {
      questionTypes: {
        cube_facecolor: { enabled: true, count: 4 },
        cube_edgecolor: { enabled: true, count: 2 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: true, count: 3 },
        cuboid_edgecolor: { enabled: true, count: 1 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  },
  {
    id: 'time-30',
    label: '타임 제한 30초',
    description: '평행한 면 20문항',
    settings: {
      quizEndMode: 'time',
      quizTimeLimitSec: 30,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 10 },
        cube_edgecolor: { enabled: false, count: 0 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: true, count: 10 },
        cuboid_edgecolor: { enabled: false, count: 0 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  },
  {
    id: 'time-60',
    label: '타임 제한 60초',
    description: '평행 21 / 모서리 9',
    settings: {
      quizEndMode: 'time',
      quizTimeLimitSec: 60,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 11 },
        cube_edgecolor: { enabled: true, count: 5 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: true, count: 10 },
        cuboid_edgecolor: { enabled: true, count: 4 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  },
  {
    id: 'ranked-multi',
    label: '순위 모드 10문제',
    description: '혼합 출제',
    settings: {
      rankingEnabled: true,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 4 },
        cube_edgecolor: { enabled: true, count: 2 },
        cube_validity: { enabled: false, count: 0 },
        cuboid_facecolor: { enabled: true, count: 3 },
        cuboid_edgecolor: { enabled: true, count: 1 },
        cuboid_validity: { enabled: false, count: 0 }
      }
    }
  }
];

const loadCustomPresets = () => {
  return clonePersisted(cachedCustomPresets);
};

const saveCustomPresets = () => {
  cachedCustomPresets = Array.isArray(customPresets) ? clonePersisted(customPresets) : [];
  persistQuizStoreValue(QUIZ_STORE_KEY_CUSTOM_PRESETS, cachedCustomPresets, CUSTOM_PRESET_KEY);
};

const basicModes = {
  '5min': {
    label: '기본 모드(5분): 전개도 학습',
    settings: {
      quizEndMode: 'time',
      quizTimeLimitSec: 300,
      timeLimitSec: 30,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 5 },
        cube_edgecolor: { enabled: true, count: 5 },
        cube_validity: { enabled: true, count: 5 },
        cuboid_facecolor: { enabled: true, count: 5 },
        cuboid_edgecolor: { enabled: true, count: 5 },
        cuboid_validity: { enabled: true, count: 5 }
      },
      score: {
        base: 10,
        comboEnabled: false,
        comboBonus: 0,
        timeBonusEnabled: true,
        timeBonusPerSec: 0.1,
        timeBonusMaxRatio: 30
      },
      wrongDelaySec: 3,
      selectionMode: 'random',
      avoidRepeat: true,
      shuffleChoices: true,
      rankingEnabled: false
    }
  },
  '12q': {
    label: '기본 모드(12문제): 전개도 학습',
    settings: {
      quizEndMode: 'count',
      quizTimeLimitSec: 0,
      timeLimitSec: 0,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 2 },
        cube_edgecolor: { enabled: true, count: 2 },
        cube_validity: { enabled: true, count: 2 },
        cuboid_facecolor: { enabled: true, count: 2 },
        cuboid_edgecolor: { enabled: true, count: 2 },
        cuboid_validity: { enabled: true, count: 2 }
      },
      score: {
        base: 10,
        comboEnabled: false,
        comboBonus: 0,
        timeBonusEnabled: false,
        timeBonusPerSec: 0,
        timeBonusMaxRatio: 0
      },
      wrongDelaySec: 3,
      selectionMode: 'random',
      avoidRepeat: true,
      shuffleChoices: true,
      rankingEnabled: false
    }
  },
  pvam: {
    label: '영역모델 곱셈 데모',
    settings: {
      quizEndMode: 'count',
      quizTimeLimitSec: 0,
      timeLimitSec: 0,
      questionTypes: {
        cube_facecolor: { enabled: true, count: 2 },
        cube_edgecolor: { enabled: true, count: 2 },
        cube_validity: { enabled: true, count: 2 },
        cuboid_facecolor: { enabled: true, count: 2 },
        cuboid_edgecolor: { enabled: true, count: 2 },
        cuboid_validity: { enabled: true, count: 2 }
      },
      score: {
        base: 10,
        comboEnabled: false,
        comboBonus: 0,
        timeBonusEnabled: false,
        timeBonusPerSec: 0,
        timeBonusMaxRatio: 0
      },
      wrongDelaySec: 1,
      selectionMode: 'sequential',
      avoidRepeat: true,
      shuffleChoices: false,
      rankingEnabled: false
    },
    pvamDemo: {
      count: 10,
      seed: 1,
      min: 11,
      max: 99,
      taskKinds: ['decompose_factors', 'partial_cells', 'partial_sums', 'mixed_process', 'final_product']
    }
  }
};

const mergeSettings = (base, override = {}) => {
  const merged = { ...base, ...override };
  merged.score = { ...base.score, ...(override.score || {}) };
  const baseTypes = base.questionTypes || {};
  const overrideTypes = override.questionTypes || {};
  const mergedTypes = { ...baseTypes };
  Object.entries(overrideTypes).forEach(([key, value]) => {
    mergedTypes[key] = { ...(baseTypes[key] || {}), ...value };
  });
  merged.questionTypes = mergedTypes;
  return merged;
};

const parseQueryBool = (value) => {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const buildPvamDemoQuestionBank = (settings) => {
  const params = new URLSearchParams(window.location.search);
  if (!parseQueryBool(params.get('pvamDemo'))) return null;

  const countFallback = Math.max(1, Math.min(20, Number(settings?.questionCount) || 10));
  const count = Math.max(1, Math.min(50, Number(params.get('pvamCount')) || countFallback));
  const seedValue = params.get('pvamSeed');
  const seed = seedValue != null && seedValue !== '' ? Number.parseInt(seedValue, 10) : 1;
  const min = Math.max(10, Math.min(99, Number(params.get('pvamMin')) || 11));
  const max = Math.max(min, Math.min(99, Number(params.get('pvamMax')) || 99));
  const supportedTaskKinds = new Set(['decompose_factors', 'decompose', 'final_product', 'partial_cells', 'partial_sums', 'partial_sum', 'mixed_process']);
  const taskKindsRaw = String(params.get('pvamTaskKinds') || 'decompose_factors,partial_cells,partial_sums,mixed_process,final_product')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const taskKinds = taskKindsRaw
    .filter((kind) => supportedTaskKinds.has(kind))
    .map((kind) => (kind === 'partial_sum'
      ? 'partial_sums'
      : (kind === 'decompose' ? 'decompose_factors' : kind)));
  const finalTaskKinds = taskKinds.length ? taskKinds : ['decompose_factors', 'partial_cells', 'partial_sums', 'mixed_process', 'final_product'];

  const bank = generatePlaceValueAreaModelBank({
    count,
    seed: Number.isInteger(seed) ? seed : 1,
    min,
    max,
    taskKinds: finalTaskKinds
  });
  const validation = validateQuestionBank(bank);
  if (!validation.valid) {
    console.warn('pvam demo bank invalid', validation.errors);
    return null;
  }
  return bank;
};

const buildPvamPresetQuestionBank = (preset, settings) => {
  const config = preset?.pvamDemo;
  if (!config) return null;

  const countFallback = Math.max(1, Math.min(20, Number(settings?.questionCount) || 10));
  const count = Math.max(1, Math.min(50, Number(config.count) || countFallback));
  const seed = Number.isInteger(config.seed) ? config.seed : 1;
  const min = Math.max(10, Math.min(99, Number(config.min) || 11));
  const max = Math.max(min, Math.min(99, Number(config.max) || 99));
  const supportedTaskKinds = new Set(['decompose_factors', 'decompose', 'final_product', 'partial_cells', 'partial_sums', 'partial_sum', 'mixed_process']);
  const taskKinds = Array.isArray(config.taskKinds)
    ? config.taskKinds
        .filter((kind) => supportedTaskKinds.has(kind))
        .map((kind) => (kind === 'partial_sum'
          ? 'partial_sums'
          : (kind === 'decompose' ? 'decompose_factors' : kind)))
    : [];

  const bank = generatePlaceValueAreaModelBank({
    count,
    seed,
    min,
    max,
    taskKinds: taskKinds.length ? taskKinds : ['decompose_factors', 'partial_cells', 'partial_sums', 'mixed_process', 'final_product']
  });
  const validation = validateQuestionBank(bank);
  if (!validation.valid) {
    console.warn('pvam preset bank invalid', validation.errors);
    return null;
  }
  return bank;
};

const loadLauncherSetup = () => {
  try {
    const raw = localStorage.getItem(LAUNCHER_SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('failed to load launcher setup', err);
    return null;
  }
};

const buildCsvBankFromLauncherSetup = (launcher) => {
  const enabled = launcher?.customCsvEnabled === true;
  const text = typeof launcher?.customCsvText === 'string' ? launcher.customCsvText : '';
  if (!enabled || !text.trim()) {
    return { bank: null, message: '' };
  }
  const parsed = parseUploadedQuestionBankText(text, {
    fileName: typeof launcher?.customCsvFileName === 'string' ? launcher.customCsvFileName : ''
  });
  if (!parsed.bank) {
    return { bank: null, message: `런처 업로드 문제 무시: ${parsed.error || '파싱 실패'}` };
  }
  const formatLabel = parsed.format === 'json' ? '문제팩(JSON)' : 'CSV';
  return {
    bank: parsed.bank,
    message: `런처 ${formatLabel} 문제 ${parsed.bank.questions.length}개를 사용합니다.`
  };
};

const hydrateCsvBankFromLauncherStorage = () => {
  const launcher = loadLauncherSetup();
  if (!launcher) return;
  const launcherCsv = presetId === 'csv-upload'
    ? buildCsvBankFromLauncherSetup(launcher)
    : { bank: null, message: '' };
  if (!launcherCsv.bank) return;
  uploadedCsvQuestionBank = launcherCsv.bank;
  if (settingsInputs.customEnabled) settingsInputs.customEnabled.value = 'true';
  if (settingsInputs.customCsvEnabled) settingsInputs.customCsvEnabled.value = 'true';
  setCustomCsvStatus(launcherCsv.message || `런처 업로드 문제 ${launcherCsv.bank.questions.length}개 로드 완료`, 'success');
};

const buildLauncherBasicQuizSettings = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('launchMode') !== 'play' || params.get('fromLauncher') !== '1') return null;
  if (!defaultSettings) return null;

  const launcher = loadLauncherSetup();
  if (!launcher || launcher.gameMode !== 'basic-quiz') return null;

  const presetId = String(launcher.quizPresetId || '').trim();
  const launcherQuizEndMode = launcher.quizEndMode === 'time' ? 'time' : 'count';
  const launcherQuizCountLimitRaw = Math.round(Number(launcher.quizCountLimit) || 0);
  const launcherQuizTimeLimitSec = Math.max(10, Math.min(3600, Math.round(Number(launcher.quizTimeLimitSec) || 180)));
  const playerCount = Math.max(1, Math.min(6, Math.round(Number(launcher.players) || 1)));
  const playerNames = Array.isArray(launcher.playerNames)
    ? launcher.playerNames
        .slice(0, playerCount)
        .map((name, idx) => (typeof name === 'string' && name.trim()) ? name.trim() : `사용자${idx + 1}`)
    : Array.from({ length: playerCount }, (_, idx) => `사용자${idx + 1}`);
  const playerTags = Array.isArray(launcher.playerTags)
    ? launcher.playerTags
        .slice(0, playerCount)
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    : Array.from({ length: playerCount }, () => '');

  const baseMode = basicModes['12q']?.settings || {};
  const settings = mergeSettings(defaultSettings, baseMode);
  settings.playerCount = playerCount;
  settings.twoPlayerLayout = '1x2';
  settings.groupNames = playerNames;
  settings.studentIds = playerTags;
  settings.studentId = '01';
  settings.rankingEnabled = false;
  settings.customQuestionMode = false;
  settings.customQuestionIds = [];
  settings.quizEndMode = launcherQuizEndMode;
  settings.quizTimeLimitSec = launcherQuizEndMode === 'time' ? launcherQuizTimeLimitSec : 0;
  settings.timeLimitSec = 30;
  settings.selectionMode = 'random';
  settings.avoidRepeat = true;
  settings.shuffleChoices = true;
  settings.wrongDelaySec = 3;
  settings.score = {
    ...settings.score,
    comboEnabled: false,
    comboBonus: 0,
    timeBonusEnabled: false,
    timeBonusPerSec: 0,
    timeBonusMaxRatio: 0
  };

  const setAllTypeCounts = (countEach) => {
    Object.keys(settings.questionTypes || {}).forEach((key) => {
      settings.questionTypes[key] = { ...(settings.questionTypes[key] || {}), enabled: true, count: countEach };
    });
  };
  const setShapeOnlyCounts = (prefix, countEach) => {
    Object.keys(settings.questionTypes || {}).forEach((key) => {
      const enabled = key.startsWith(prefix);
      settings.questionTypes[key] = { ...(settings.questionTypes[key] || {}), enabled, count: enabled ? countEach : 0 };
    });
  };

  switch (presetId) {
    case 'jumpmap-net-30':
      setAllTypeCounts(5);
      break;
    case 'jumpmap-net-12':
      setAllTypeCounts(2);
      break;
    case 'cube-only-24':
      setShapeOnlyCounts('cube_', 8);
      break;
    case 'cuboid-only-24':
      setShapeOnlyCounts('cuboid_', 8);
      break;
    default:
      setAllTypeCounts(2);
      break;
  }

  settings.questionCount = Object.values(settings.questionTypes || {})
    .reduce((sum, cfg) => sum + ((cfg && cfg.enabled) ? (cfg.count || 0) : 0), 0);
  const baseQuestionCount = Math.max(1, settings.questionCount);
  const launcherQuizCountLimit = launcherQuizCountLimitRaw > 0
    ? Math.max(1, Math.min(baseQuestionCount, launcherQuizCountLimitRaw))
    : baseQuestionCount;
  if (launcherQuizEndMode !== 'time') {
    settings.questionCount = launcherQuizCountLimit;
  }
  settings.loopQuestions = settings.quizEndMode === 'time';
  const launcherCsv = buildCsvBankFromLauncherSetup(launcher);
  return {
    settings,
    launcherCsv,
    launcherQuizCountLimit
  };
};

const maybeAutoStartQuizFromLauncher = () => {
  const launcherConfig = buildLauncherBasicQuizSettings();
  if (!launcherConfig) return false;
  const { settings, launcherCsv, launcherQuizCountLimit } = launcherConfig;
  if (launcherCsv?.bank) {
    uploadedCsvQuestionBank = launcherCsv.bank;
    settings.customQuestionMode = true;
    settings.customCsvMode = true;
    settings.customQuestionIds = [];
    const availableCount = launcherCsv.bank.questions.length;
    settings.questionCount = settings.quizEndMode === 'time'
      ? availableCount
      : Math.max(1, Math.min(availableCount, launcherQuizCountLimit || availableCount));
    setLoadStatus(launcherCsv.message || '런처 업로드 문제를 불러왔습니다.', 'success');
  } else if (launcherCsv?.message) {
    uploadedCsvQuestionBank = null;
    setLoadStatus(launcherCsv.message, 'fail');
  } else {
    setLoadStatus('런처 설정으로 기본 퀴즈를 시작합니다.', 'success');
  }
  startQuizWithSettings(settings, false);
  return true;
};

const loadSavedWrongs = () => {
  if (!savedWrongListEl) return [];
  return clonePersisted(cachedSavedWrongs);
};

const loadStudentNames = () => {
  return clonePersisted(cachedStudentNames);
};

const saveStudentNames = (list) => {
  cachedStudentNames = Array.isArray(list) ? clonePersisted(list) : [];
  persistQuizStoreValue(QUIZ_STORE_KEY_STUDENT_NAMES, cachedStudentNames, STUDENT_NAMES_KEY);
};

const parseGroupNames = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
};

const parseCustomIds = (value) => {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const setCustomCsvStatus = (message, type) => {
  if (!customCsvStatusEl) return;
  customCsvStatusEl.textContent = message || '';
  customCsvStatusEl.classList.remove('success', 'fail', 'warn');
  if (type) customCsvStatusEl.classList.add(type);
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

const cloneQuestionBank = (bank) => JSON.parse(JSON.stringify(bank));

const parseUploadedQuestionBankText = (text, { fileName = '' } = {}) => {
  const sourceText = String(text || '');
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return { bank: null, format: '', error: '업로드 파일이 비어 있습니다.' };
  }

  const normalizedName = String(fileName || '').trim().toLowerCase();
  const forceJson = normalizedName.endsWith('.json');
  const forceCsv = normalizedName.endsWith('.csv');
  const tryJsonFirst = forceJson || (!forceCsv && /^[\[{]/.test(trimmed));

  const tryParseJson = () => {
    try {
      const payload = JSON.parse(trimmed);
      const bankCandidate = resolveQuestionBankFromJsonPayload(payload);
      if (!bankCandidate?.questions?.length) {
        return { bank: null, format: 'json', error: 'JSON 문제팩에서 questions 목록을 찾지 못했습니다.' };
      }
      const validation = validateQuestionBank(bankCandidate);
      if (!validation.valid) {
        return { bank: null, format: 'json', error: `문제 형식 오류: ${validation.errors[0]}` };
      }
      return { bank: cloneQuestionBank(bankCandidate), format: 'json', warnings: [] };
    } catch (error) {
      return { bank: null, format: 'json', error: `JSON 파싱 실패: ${error?.message || 'invalid json'}` };
    }
  };

  const tryParseCsv = () => {
    const parsed = parseCsvQuestionBank(sourceText);
    if (!parsed.valid || !parsed.bank) {
      const firstError = parsed.errors?.[0] || 'CSV 파싱 실패';
      return { bank: null, format: 'csv', error: firstError };
    }
    const validation = validateQuestionBank(parsed.bank);
    if (!validation.valid) {
      return { bank: null, format: 'csv', error: `문제 형식 오류: ${validation.errors[0]}` };
    }
    return {
      bank: parsed.bank,
      format: 'csv',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
  };

  if (tryJsonFirst) {
    const jsonResult = tryParseJson();
    if (jsonResult.bank || forceJson) return jsonResult;
    if (!forceCsv) {
      const csvResult = tryParseCsv();
      if (csvResult.bank) return csvResult;
      return { bank: null, format: '', error: `${jsonResult.error} / ${csvResult.error}` };
    }
    return jsonResult;
  }

  const csvResult = tryParseCsv();
  if (csvResult.bank || forceCsv) return csvResult;
  const jsonResult = tryParseJson();
  if (jsonResult.bank) return jsonResult;
  return { bank: null, format: '', error: `${csvResult.error} / ${jsonResult.error}` };
};

const clearCsvQuestionBank = ({ silent = false } = {}) => {
  uploadedCsvQuestionBank = null;
  if (settingsInputs.customCsvEnabled) {
    settingsInputs.customCsvEnabled.value = 'false';
  }
  if (customCsvFileInput) {
    customCsvFileInput.value = '';
  }
  if (!silent) {
    setCustomCsvStatus('업로드된 문제 파일을 해제했습니다.', 'warn');
  }
  applyQuestionModeUI();
};

const isTextChoiceQuestion = (question) => (
  question?.renderKind === 'text_choice'
  || question?.type === 'csv_choice'
);

const isTextShortAnswerQuestion = (question) => (
  question?.renderKind === 'text_short_answer'
  || question?.type === 'csv_subjective'
);

const buildCsvTemplate = () => [
  ['문제 내용', '선택지1', '선택지2', '선택지3(선택)', '선택지4(선택)', '정답번호', '문제시간(초)', '정답인정단어', '단어포함시정답처리여부'],
  ['37 x 24의 값을 고르세요.', '888', '740', '148', '628', '1', '20', '', ''],
  ['(30+7) x (20+4) 에서 30x4는?', '120', '140', '600', '28', '1', '15', '', ''],
  ['세종대왕의 이름을 쓰세요.', '', '', '', '', '', '0', '세종,세종대왕', 'Y']
].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');

const loadCsvQuestionBankFromFile = async (file) => {
  if (!file) {
    setCustomCsvStatus('CSV 또는 JSON 문제 파일을 선택해 주세요.', 'fail');
    return;
  }
  const name = String(file.name || '').toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.json')) {
    setCustomCsvStatus('CSV(.csv) 또는 JSON(.json) 파일만 업로드할 수 있습니다.', 'fail');
    return;
  }
  const text = await file.text();
  const parsed = parseUploadedQuestionBankText(text, { fileName: file.name || '' });
  if (!parsed.bank) {
    setCustomCsvStatus(parsed.error || '문제 파일 파싱 실패', 'fail');
    return;
  }

  uploadedCsvQuestionBank = parsed.bank;
  if (settingsInputs.customCsvEnabled) settingsInputs.customCsvEnabled.value = 'true';
  if (settingsInputs.customEnabled) settingsInputs.customEnabled.value = 'true';
  applyQuestionModeUI();

  const warning = parsed.warnings?.[0] ? ` · 참고: ${parsed.warnings[0]}` : '';
  const formatLabel = parsed.format === 'json' ? 'JSON 문제팩' : 'CSV 문제';
  setCustomCsvStatus(
    `${formatLabel} ${uploadedCsvQuestionBank.questions.length}개 로드 완료${warning}`,
    'success'
  );
  setLoadStatus(`업로드 문제 ${uploadedCsvQuestionBank.questions.length}개를 사용할 준비가 되었습니다.`, 'success');
};

const buildQuestionBankForPackExport = () => {
  const settings = readSettings();
  if (settings.customCsvMode && uploadedCsvQuestionBank?.questions?.length) {
    return {
      bank: cloneQuestionBank(uploadedCsvQuestionBank),
      source: 'upload'
    };
  }
  if (settings.customQuestionMode && settings.customQuestionIds?.length) {
    const customBank = buildCustomQuestionBank(settings.customQuestionIds);
    if (!customBank?.questions?.length) {
      return { bank: null, error: '선택한 문제 ID를 찾지 못했습니다.' };
    }
    return {
      bank: cloneQuestionBank(customBank),
      source: 'custom-ids'
    };
  }
  const generated = buildWeightedQuestionBank(banks, settings);
  if (!generated?.questions?.length) {
    return { bank: null, error: '현재 설정으로 문제를 구성하지 못했습니다.' };
  }
  return {
    bank: cloneQuestionBank(generated),
    source: 'weighted'
  };
};

const exportQuestionPackJson = () => {
  const built = buildQuestionBankForPackExport();
  if (!built.bank) {
    const message = built.error || '문제팩 생성 실패';
    setCustomCsvStatus(message, 'fail');
    setLoadStatus(message, 'fail');
    return;
  }
  const payload = {
    kind: 'knolquiz-question-pack',
    version: 1,
    title: 'math-net 문제팩',
    createdAt: new Date().toISOString(),
    source: {
      app: window.location.host.includes('math-net-master-quiz')
        ? 'math-net-master-quiz/quiz'
        : 'knolquiz/quiz',
      mode: built.source
    },
    bank: built.bank
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `knolquiz-question-pack-${stamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  setCustomCsvStatus(`문제팩(JSON) ${payload.bank.questions.length}문항 저장 완료`, 'success');
  setLoadStatus('문제팩(JSON) 저장 완료. 런처에서 업로드해 사용할 수 있습니다.', 'success');
};

const getTotalTypeCount = () => {
  let total = 0;
  let enabledFound = false;
  Object.values(typeInputs).forEach((fields) => {
    const enabled = fields.enabled?.value === 'true';
    const count = Math.max(0, Number(fields.count?.value) || 0);
    if (enabled) {
      enabledFound = true;
      total += count;
    }
  });
  if (!enabledFound || total <= 0) return 10;
  return total;
};

const updateCountConfirmStatus = () => {
  if (!confirmStatusEl) return;
  if (settingsInputs.customEnabled?.value === 'true') {
    confirmStatusEl.textContent = '커스텀 모드에서는 사용하지 않음';
    confirmStatusEl.classList.remove('ready');
    return;
  }
  if (countsConfirmed) {
    confirmStatusEl.textContent = '출제 수 확인됨';
    confirmStatusEl.classList.add('ready');
  } else {
    confirmStatusEl.textContent = '출제 수 확인 필요';
    confirmStatusEl.classList.remove('ready');
  }
};


const updateCustomIdsField = (ids) => {
  if (!settingsInputs.customIds) return;
  settingsInputs.customIds.value = ids.join(', ');
};

const syncCustomCheckboxes = () => {
  if (!customListEl) return;
  if (!settingsInputs.customIds) {
    updateCustomGroupCounts();
    return;
  }
  const selected = new Set(parseCustomIds(settingsInputs.customIds?.value || ''));
  const inputs = [...customListEl.querySelectorAll('input[type="checkbox"]')];
  inputs.forEach((input) => {
    input.checked = selected.has(input.value);
  });
  updateCustomGroupCounts();
};

const updateCustomGroupCounts = () => {
  if (!customListEl) return;
  const groups = [...customListEl.querySelectorAll('.custom-group')];
  groups.forEach((group) => {
    const countEl = group.querySelector('[data-group-count]');
    const checks = group.querySelectorAll('input[type="checkbox"]:checked');
    if (countEl) {
      countEl.textContent = `선택 ${checks.length}개`;
    }
  });
};

const collectCustomSelectedIds = () => {
  if (!customListEl) return [];
  return [...customListEl.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value);
};

const updateCustomSelection = () => {
  const ids = collectCustomSelectedIds();
  updateCustomIdsField(ids);
  updateCustomGroupCounts();
};

const renderCustomQuestionList = () => {
  if (!customListEl) return;
  customListEl.innerHTML = '';
  const typeOrder = [
    { key: 'cube_facecolor', label: '정육면체 · 평행한 면', shape: 'cube', type: 'facecolor' },
    { key: 'cube_edgecolor', label: '정육면체 · 맞물리는 모서리', shape: 'cube', type: 'edgecolor' },
    { key: 'cube_validity', label: '정육면체 · 정상/비정상', shape: 'cube', type: 'validity' },
    { key: 'cuboid_facecolor', label: '직육면체 · 평행한 면', shape: 'cuboid', type: 'facecolor' },
    { key: 'cuboid_edgecolor', label: '직육면체 · 맞물리는 모서리', shape: 'cuboid', type: 'edgecolor' },
    { key: 'cuboid_validity', label: '직육면체 · 정상/비정상', shape: 'cuboid', type: 'validity' }
  ];
  typeOrder.forEach(({ key, label, shape, type }) => {
    const enabled = typeInputs[key]?.enabled?.value === 'true';
    if (!enabled) return;
    const bank = banks[type];
    if (!bank?.questions?.length) return;
    const filteredQuestions = bank.questions.filter((question) => getQuestionShape(question) === shape);
    if (!filteredQuestions.length) return;
    const group = document.createElement('div');
    group.className = 'custom-group';
    const header = document.createElement('div');
    header.className = 'custom-group-header';
    const title = document.createElement('span');
    title.textContent = `${label} (${filteredQuestions.length})`;
    const count = document.createElement('span');
    count.dataset.groupCount = 'true';
    count.textContent = '선택 0개';
    header.appendChild(title);
    header.appendChild(count);
    group.appendChild(header);

    const list = document.createElement('div');
    list.className = 'custom-group-list';
    filteredQuestions.forEach((question) => {
      const item = document.createElement('label');
      item.className = 'custom-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = question.id;
      checkbox.addEventListener('change', updateCustomSelection);

      const textWrap = document.createElement('span');
      textWrap.className = 'custom-text';
      const titleText = document.createElement('span');
      titleText.className = 'custom-title';
      titleText.textContent = question.id;
      const subText = document.createElement('span');
      subText.className = 'custom-sub';
      if (question.type === 'validity') {
        subText.textContent = question.mode === 'invalid'
          ? '잘못된 전개도 선택'
          : '올바른 전개도 선택';
      } else {
        subText.textContent = question.prompt || '';
      }
      textWrap.appendChild(titleText);
      textWrap.appendChild(subText);

      item.appendChild(checkbox);
      if (question.type !== 'validity') {
        const img = document.createElement('img');
        img.src = `./nets/${question.question}`;
        img.alt = question.id;
        item.appendChild(img);
      }
      item.appendChild(textWrap);
      list.appendChild(item);
    });
    group.appendChild(list);
    customListEl.appendChild(group);
  });
  syncCustomCheckboxes();
};

const updateCustomPanelVisibility = () => {
  if (!customPanelEl || !settingsInputs.customEnabled) return;
  const enabled = settingsInputs.customEnabled.value === 'true';
  const csvMode = settingsInputs.customCsvEnabled?.value === 'true'
    && uploadedCsvQuestionBank?.questions?.length > 0;
  customPanelEl.classList.toggle('hidden', !enabled);
  if (enabled) {
    if (!csvMode) renderCustomQuestionList();
  }
  customPanelEl.classList.toggle('csv-loaded', Boolean(csvMode));
  if (csvMode && customCsvStatusEl && !customCsvStatusEl.textContent.trim()) {
    setCustomCsvStatus(`업로드 문제 ${uploadedCsvQuestionBank.questions.length}개가 적용됩니다.`, 'success');
  }
};

const applyQuestionModeUI = () => {
  const isCustom = settingsInputs.customEnabled?.value === 'true';
  const csvMode = settingsInputs.customCsvEnabled?.value === 'true'
    && uploadedCsvQuestionBank?.questions?.length > 0;
  if (modeButtons.length) {
    modeButtons.forEach((btn) => {
      const mode = btn.dataset.modeSelect;
      btn.classList.toggle('is-active', isCustom ? mode === 'custom' : mode === 'set');
    });
  }
  if (modeHelp) {
    if (csvToolMode) {
      modeHelp.textContent = csvMode
        ? `현재: 업로드 문제 사용 중 (${uploadedCsvQuestionBank.questions.length}문항)`
        : '현재: 업로드 파일 대기 중';
    } else if (!isCustom) {
      modeHelp.textContent = '현재: 전개도 문제 세트 사용 중 (교사 커스텀 문제는 반영되지 않음)';
    } else if (csvMode) {
      modeHelp.textContent = `현재: 업로드 문제 사용 중 (${uploadedCsvQuestionBank.questions.length}문항)`;
    } else {
      modeHelp.textContent = '현재: 교사 커스텀 문제 사용 중 (전개도 문제 세트는 반영되지 않음)';
    }
  }
  if (typeToggle) {
    typeToggle.disabled = isCustom;
  }
  if (confirmTypeCountsBtn) {
    confirmTypeCountsBtn.disabled = isCustom;
  }
  if (typeGrid) {
    const shouldShow = !isCustom && typeOpen;
    typeGrid.classList.toggle('hidden', !shouldShow);
  }
  updateCountConfirmStatus();
  updateCustomPanelVisibility();
};

const applyCsvToolModeUI = () => {
  if (!csvToolMode) return;
  document.body.classList.add('csv-tool-mode');
  if (quizAppTitleEl) {
    quizAppTitleEl.textContent = '업로드 문제 생성 퀴즈';
  }
  if (appModeBannerEl) {
    appModeBannerEl.textContent = '업로드 문제(CSV/JSON) 전용 모드입니다. 기존 문제은행 선택 기능은 숨김 처리됩니다.';
    appModeBannerEl.classList.remove('hidden');
  }
  if (advancedSettings) {
    advancedSettings.classList.remove('hidden');
  }
  if (advancedToggle) {
    advancedToggle.classList.add('hidden');
  }
  if (settingsInputs.customEnabled) {
    settingsInputs.customEnabled.value = 'true';
  }
  if (uploadedCsvQuestionBank?.questions?.length && settingsInputs.customCsvEnabled) {
    settingsInputs.customCsvEnabled.value = 'true';
  }
  applyQuestionModeUI();
  if (!uploadedCsvQuestionBank?.questions?.length) {
    setLoadStatus('업로드 문제 생성 모드입니다. 문제양식(CSV/JSON) 업로드 후 시작하세요.', null);
  }
};

const invalidateConfirmedCounts = () => {
  if (!countsConfirmed) return;
  countsConfirmed = false;
  updateCountConfirmStatus();
  updateCustomPanelVisibility();
};

const confirmTypeCounts = () => {
  countsConfirmed = true;
  updateCountConfirmStatus();
  if (customRandomCount) {
    customRandomCount.value = getTotalTypeCount();
  }
  updateCustomPanelVisibility();
};

const handleRandomCustomSelection = () => {
  if (!customListEl) return;
  const inputs = [...customListEl.querySelectorAll('input[type="checkbox"]')];
  if (!inputs.length) return;
  const countValue = Number(customRandomCount?.value) || getTotalTypeCount();
  const target = Math.min(inputs.length, Math.max(1, countValue));
  const pool = shuffleArray(inputs);
  inputs.forEach((input) => {
    input.checked = false;
  });
  pool.slice(0, target).forEach((input) => {
    input.checked = true;
  });
  updateCustomSelection();
};

const clearCustomSelection = () => {
  if (!customListEl) return;
  const inputs = [...customListEl.querySelectorAll('input[type="checkbox"]')];
  inputs.forEach((input) => {
    input.checked = false;
  });
  updateCustomSelection();
};

const loadGroupNames = () => {
  if (!groupNameListEl) return [];
  return clonePersisted(cachedGroupNames);
};

const saveGroupNames = (list) => {
  cachedGroupNames = Array.isArray(list) ? clonePersisted(list) : [];
  persistQuizStoreValue(QUIZ_STORE_KEY_GROUP_NAMES, cachedGroupNames, GROUP_NAMES_KEY);
};

const formatGroupLabel = (names) => {
  if (!names?.length) return '모둠명';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개`;
};

const buildCustomQuestionBank = (ids) => {
  if (!ids?.length) return null;
  const all = Object.values(banks).flatMap((bank) => bank.questions || []);
  const byId = new Map(all.map((question) => [question.id, question]));
  const selected = [];
  const seen = new Set();
  ids.forEach((id) => {
    const question = byId.get(id);
    if (!question || seen.has(id)) return;
    selected.push(question);
    seen.add(id);
  });
  return { questions: selected };
};

const renderGroupNames = () => {
  if (!groupNameListEl) return;
  const saved = loadGroupNames();
  groupNameListEl.innerHTML = '';
  if (!saved.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-note';
    empty.textContent = '저장된 모둠명 없음';
    groupNameListEl.appendChild(empty);
    return;
  }
  saved.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'name-chip';
    const label = document.createElement('span');
    label.textContent = formatGroupLabel(item.names);
    label.addEventListener('click', () => {
      if (groupNamesInput) {
        groupNamesInput.value = item.names.join(', ');
      }
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.addEventListener('click', () => {
      const next = loadGroupNames().filter((entry) => entry.id !== item.id);
      saveGroupNames(next);
      renderGroupNames();
    });
    chip.appendChild(label);
    chip.appendChild(del);
    groupNameListEl.appendChild(chip);
  });
};

const renderStudentNames = () => {
  if (!studentNameListEl) return;
  const saved = loadStudentNames();
  studentNameListEl.innerHTML = '';
  if (!saved.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-note';
    empty.textContent = '저장된 학생명 없음';
    studentNameListEl.appendChild(empty);
    return;
  }
  saved.forEach((name) => {
    const chip = document.createElement('div');
    chip.className = 'name-chip';
    const label = document.createElement('span');
    label.textContent = name;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.addEventListener('click', () => {
      const next = loadStudentNames().filter((entry) => entry !== name);
      saveStudentNames(next);
      renderStudentNames();
    });
    chip.appendChild(label);
    chip.appendChild(del);
    studentNameListEl.appendChild(chip);
  });
};

const handleSaveGroupNames = () => {
  if (!groupNamesInput) return;
  const names = parseGroupNames(groupNamesInput.value);
  if (!names.length) return;
  const saved = loadGroupNames();
  const item = {
    id: `group-${Date.now()}`,
    names
  };
  saved.unshift(item);
  saveGroupNames(saved.slice(0, 20));
  renderGroupNames();
  renderStudentNames();
};

const handleSaveStudentName = () => {
  if (!studentNameInput) return;
  const name = studentNameInput.value.trim();
  if (!name) return;
  const saved = loadStudentNames();
  if (saved.includes(name)) {
    studentNameInput.value = '';
    return;
  }
  saved.unshift(name);
  saveStudentNames(saved.slice(0, 50));
  studentNameInput.value = '';
  renderStudentNames();
};

const saveSavedWrongs = (list) => {
  cachedSavedWrongs = Array.isArray(list) ? clonePersisted(list) : [];
  persistQuizStoreValue(QUIZ_STORE_KEY_WRONGS, cachedSavedWrongs, WRONG_STORAGE_KEY);
};

const formatTimestamp = (date) => {
  const pad = (num) => `${num}`.padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + pad(date.getHours()) + pad(date.getMinutes());
};

const buildWrongQuestions = (log) => log.answers
  .filter((answer) => !answer.correct)
  .map((answer) => ({
    id: answer.questionId,
    type: answer.type,
    prompt: answer.prompt,
    question: answer.question,
    answer: answer.answer,
    choices: answer.choices,
    lockedChoices: true
  }));

const renderSavedWrongs = () => {
  if (!savedWrongListEl) return;
  const saved = loadSavedWrongs();
  savedWrongListEl.innerHTML = '';
  if (!saved.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-note';
    empty.textContent = '저장된 오답 없음';
    savedWrongListEl.appendChild(empty);
    return;
  }
  saved.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.textContent = `${item.label} (${item.count}문항)`;
    btn.addEventListener('click', () => {
      const settings = {
        ...defaultSettings,
        ...item.settings,
        playerCount: 1,
        twoPlayerLayout: '1x2',
        quizEndMode: 'count',
        quizTimeLimitSec: 0,
        questionCount: item.count,
        shuffleChoices: true
      };
      startQuizWithSettings(settings, false, { questions: item.questions });
    });
    savedWrongListEl.appendChild(btn);
  });
};

const renderTypePreviews = () => {
  const mapping = [
    { key: 'cube_facecolor', type: 'facecolor', shape: 'cube', bank: banks.facecolor },
    { key: 'cube_edgecolor', type: 'edgecolor', shape: 'cube', bank: banks.edgecolor },
    { key: 'cube_validity', type: 'validity', shape: 'cube', bank: banks.validity },
    { key: 'cuboid_facecolor', type: 'facecolor', shape: 'cuboid', bank: banks.facecolor },
    { key: 'cuboid_edgecolor', type: 'edgecolor', shape: 'cuboid', bank: banks.edgecolor },
    { key: 'cuboid_validity', type: 'validity', shape: 'cuboid', bank: banks.validity }
  ];

  mapping.forEach(({ key, type, shape, bank }) => {
    const container = document.querySelector(`[data-preview="${key}"]`);
    if (!container || !bank?.questions?.length) return;
    const candidates = bank.questions.filter((q) => getQuestionShape(q) === shape);
    const question = candidates[0];
    if (!question) return;
    const sample = fixChoices({
      ...question,
      choices: question.choices ? question.choices.slice() : []
    });
    const questionImg = container.querySelector('[data-preview-question]');
    const choiceImgs = [...container.querySelectorAll('[data-preview-choice]')];
    if (type === 'validity') {
      container.classList.add('no-question');
      if (questionImg) {
        questionImg.removeAttribute('src');
      }
    } else if (questionImg) {
      container.classList.remove('no-question');
      questionImg.src = `./nets/${sample.question}`;
    }
    choiceImgs.forEach((img, idx) => {
      const choice = sample.choices?.[idx];
      if (!choice) {
        img.classList.add('hidden');
        return;
      }
      img.classList.remove('hidden');
      img.src = `./nets/${choice}`;
    });
  });
};

const bindPreviewToggles = () => {
  const buttons = [...document.querySelectorAll('[data-preview-toggle]')];
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.type-card');
      if (!card) return;
      const isOpen = card.classList.toggle('preview-open');
      btn.textContent = isOpen ? '미리보기 닫기' : '미리보기';
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
};

const openPresetModal = (preset) => {
  if (!presetModal) return;
  pendingPreset = preset;
  if (presetText) {
    const desc = preset.description ? ` (${preset.description})` : '';
    presetText.textContent = `${preset.label}${desc}로 시작할까요?`;
  }
  if (presetSummary && defaultSettings) {
    const merged = mergeSettings(defaultSettings, preset.settings || {});
    if (preset?.pvamDemo) {
      const config = preset.pvamDemo;
      const taskKinds = Array.isArray(config.taskKinds) && config.taskKinds.length
        ? config.taskKinds.join(', ')
        : 'final_product, partial_cells';
      const lines = [
        '모드: 자릿값 기반 직사각형 영역모델 곱셈(구조화 입력)',
        `문항 수: ${config.count ?? 10}`,
        `범위: ${config.min ?? 11} ~ ${config.max ?? 99} (2자리 x 2자리)`,
        `문항 종류: ${taskKinds}`,
        `선택지 퀴즈와 별도 데모 bank로 시작`
      ];
      presetSummary.innerHTML = `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
      presetModal.classList.remove('hidden');
      return;
    }
    const typeCounts = Object.entries(merged.questionTypes || {})
      .filter(([, cfg]) => cfg.enabled && (cfg.count ?? 0) > 0)
      .map(([key, cfg]) => {
        const label = typeLabelMap[key] || key;
        return { label, count: cfg.count ?? 0 };
      });
    const typeText = typeCounts.length
      ? typeCounts.map((item) => `${item.label} ${item.count}`).join(', ')
      : '없음';
    const totalCount = typeCounts.reduce((sum, item) => sum + item.count, 0);
    const customSummary = merged.customCsvMode
      ? `업로드 문제 사용: ${uploadedCsvQuestionBank?.questions?.length || 0}개`
      : (merged.customQuestionMode
        ? `문제 직접 선택 및 출제: ${merged.customQuestionIds?.length || 0}개`
        : '문제 직접 선택 및 출제: 사용 안 함');
    const lines = [
      `플레이어: ${merged.playerCount ?? 1}`,
      `종료 기준: ${merged.quizEndMode === 'time' ? `시간 ${merged.quizTimeLimitSec || 0}초` : `문제 ${totalCount}문제`}`,
      `출제 방식: ${merged.selectionMode === 'sequential' ? '순차' : '랜덤'}`,
      `중복 방지: ${merged.selectionMode === 'sequential' ? '순차(해당 없음)' : (merged.avoidRepeat ? '켜짐' : '꺼짐')}`,
      `선택지 섞기: ${merged.shuffleChoices ? '켜짐' : '꺼짐'}`,
      `정답 점수: ${merged.score?.base ?? 0}점`,
      `오답 패널티: ${merged.wrongDelaySec ?? 0}초`,
      `빠른 풀이 보너스: ${merged.score?.timeBonusEnabled ? '켜짐' : '꺼짐'}`,
      `초당 보너스: ${merged.score?.timeBonusPerSec ?? 0}점`,
      `빠른 풀이 보너스 최대 비율: ${merged.score?.timeBonusMaxRatio ?? 0}%`,
      `문제 유형: ${typeText}`,
      customSummary
    ];
    presetSummary.innerHTML = `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
  }
  presetModal.classList.remove('hidden');
};

const closePresetModal = () => {
  if (!presetModal) return;
  pendingPreset = null;
  if (presetSummary) presetSummary.innerHTML = '';
  presetModal.classList.add('hidden');
};

const applyPresetAndStart = () => {
  if (!pendingPreset || !defaultSettings) return;
  const merged = mergeSettings(defaultSettings, pendingPreset.settings || {});
  applyDefaultSettings(merged);
  syncRepeatSetting();
  updateCustomPanelVisibility();
  const pvamPresetBank = buildPvamPresetQuestionBank(pendingPreset, merged);
  closePresetModal();
  if (pvamPresetBank) {
    startQuizWithSettings(merged, false, pvamPresetBank);
    return;
  }
  startQuiz();
};

const openFaceModal = (settings) => {
  if (!faceModal) return;
  pendingStartSettings = settings;
  faceModal.classList.remove('hidden');
};

const closeFaceModal = () => {
  if (!faceModal) return;
  pendingStartSettings = null;
  faceModal.classList.add('hidden');
};

const openNameModal = () => {
  if (!nameModal) return;
  renderStudentNames();
  renderGroupNames();
  nameModal.classList.remove('hidden');
};

const closeNameModal = () => {
  if (!nameModal) return;
  nameModal.classList.add('hidden');
};

const scaleQuestionTypes = (baseTypes, targetTotal) => {
  const entries = Object.entries(baseTypes || {}).filter(([, cfg]) => cfg.enabled);
  const baseTotal = entries.reduce((sum, [, cfg]) => sum + (cfg.count || 0), 0);
  if (!entries.length || baseTotal <= 0 || targetTotal <= 0) return baseTypes;
  const scaled = {};
  let allocated = 0;
  const remainders = entries.map(([key, cfg]) => {
    const raw = (cfg.count || 0) * (targetTotal / baseTotal);
    const floored = Math.floor(raw);
    allocated += floored;
    scaled[key] = { ...cfg, count: floored };
    return { key, remainder: raw - floored };
  });
  let remaining = targetTotal - allocated;
  remainders.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i += 1) {
    const pick = remainders[i % remainders.length];
    scaled[pick.key].count += 1;
  }
  Object.entries(baseTypes || {}).forEach(([key, cfg]) => {
    if (!scaled[key]) scaled[key] = { ...cfg };
  });
  return scaled;
};

const openBasicModal = (modeKey) => {
  if (!basicModal) return;
  const mode = basicModes[modeKey];
  if (!mode) return;
  pendingBasicMode = modeKey;
  if (basicTitle) basicTitle.textContent = mode.label;
  if (basicDesc) {
    basicDesc.textContent = mode.pvamDemo
      ? '인원과 문제 수를 조정해 자릿값 영역모델 곱셈 퀴즈를 시작합니다.'
      : '인원, 시간/문제 수, 보너스를 조정할 수 있어요.';
  }
  if (basicPlayers) basicPlayers.value = '1';
  if (basicRanking) basicRanking.value = mode.settings.rankingEnabled ? 'true' : 'false';
  if (basicGame) basicGame.value = 'quiz';
  const isTimeMode = mode.settings.quizEndMode === 'time';
  const baseTime = mode.settings.quizTimeLimitSec ?? 0;
  const baseCount = Object.values(mode.settings.questionTypes || {})
    .reduce((sum, cfg) => sum + (cfg.enabled ? (cfg.count || 0) : 0), 0);
  if (basicTime) basicTime.value = baseTime > 0 ? `${baseTime}` : '';
  if (basicCount) basicCount.value = baseCount > 0 ? `${baseCount}` : '';
  document.querySelectorAll('[data-basic-field="time"]').forEach((el) => {
    el.classList.toggle('hidden', !isTimeMode);
  });
  document.querySelectorAll('[data-basic-field="count"]').forEach((el) => {
    el.classList.toggle('hidden', isTimeMode);
  });
  if (basicQuestionTime) basicQuestionTime.value = `${mode.settings.timeLimitSec ?? 0}`;
  if (basicCombo) basicCombo.value = mode.settings.score?.comboEnabled ? 'true' : 'false';
  if (basicComboBonus) basicComboBonus.value = `${mode.settings.score?.comboBonus ?? 0}`;
  if (basicTimeBonus) basicTimeBonus.value = mode.settings.score?.timeBonusEnabled ? 'true' : 'false';
  if (basicTimeBonusPer) basicTimeBonusPer.value = `${mode.settings.score?.timeBonusPerSec ?? 0}`;
  if (basicTimeBonusCap) basicTimeBonusCap.value = `${mode.settings.score?.timeBonusMaxRatio ?? 0}`;
  basicModal.classList.remove('hidden');
};

const closeBasicModal = () => {
  if (!basicModal) return;
  pendingBasicMode = null;
  basicModal.classList.add('hidden');
};

const applyBasicMode = () => {
  if (!pendingBasicMode || !defaultSettings) return;
  const mode = basicModes[pendingBasicMode];
  if (!mode) return;
  if (basicDesc) {
    basicDesc.textContent = mode.pvamDemo
      ? '인원과 문제 수를 조정해 자릿값 영역모델 곱셈 퀴즈를 시작합니다.'
      : '인원, 시간/문제 수, 보너스를 조정할 수 있어요.';
  }
  const isTimeMode = mode.settings.quizEndMode === 'time';
  const timeValue = Math.max(0, Number(basicTime?.value) || 0);
  const countValue = Math.max(0, Number(basicCount?.value) || 0);
  if (isTimeMode && !timeValue) {
    if (basicDesc) basicDesc.textContent = '게임 종료 시간을 입력해 주세요.';
    return;
  }
  if (!isTimeMode && !countValue) {
    if (basicDesc) basicDesc.textContent = '총 문제 수를 입력해 주세요.';
    return;
  }
  const playerValue = basicPlayers?.value || '1';
  const isTwoLayout = playerValue === '1x2' || playerValue === '2x1';
  const playerCount = isTwoLayout ? 2 : Math.min(6, Math.max(1, Number(playerValue) || 1));
  const twoPlayerLayout = playerValue === '2x1' ? '2x1' : '1x2';

  const merged = mergeSettings(defaultSettings, mode.settings || {});
  if (!isTimeMode && countValue > 0) {
    merged.questionTypes = scaleQuestionTypes(merged.questionTypes || {}, countValue);
    merged.questionCount = countValue;
  } else if (isTimeMode && countValue > 0) {
    merged.questionTypes = scaleQuestionTypes(merged.questionTypes || {}, countValue);
  }
  merged.playerCount = playerCount;
  merged.twoPlayerLayout = twoPlayerLayout;
  merged.rankingEnabled = basicRanking?.value === 'true';
  if (isTimeMode) merged.quizTimeLimitSec = timeValue;
  merged.customQuestionMode = false;
  merged.customQuestionIds = [];
  if (basicQuestionTime) merged.timeLimitSec = Math.max(0, Number(basicQuestionTime.value) || 0);
  if (basicCombo) merged.score.comboEnabled = basicCombo.value === 'true';
  if (basicComboBonus) merged.score.comboBonus = Math.max(0, Number(basicComboBonus.value) || 0);
  if (basicTimeBonus) merged.score.timeBonusEnabled = basicTimeBonus.value === 'true';
  if (basicTimeBonusPer) merged.score.timeBonusPerSec = Math.max(0, Number(basicTimeBonusPer.value) || 0);
  if (basicTimeBonusCap) merged.score.timeBonusMaxRatio = Math.max(0, Number(basicTimeBonusCap.value) || 0);

  let pvamDemoBank = null;
  if (mode.pvamDemo) {
    const pvamMode = {
      ...mode,
      pvamDemo: {
        ...mode.pvamDemo,
        count: (!isTimeMode && countValue > 0) ? countValue : (mode.pvamDemo.count ?? 10)
      }
    };
    pvamDemoBank = buildPvamPresetQuestionBank(pvamMode, merged);
    if (!pvamDemoBank) {
      if (basicDesc) basicDesc.textContent = '영역모델 데모 문제 생성에 실패했습니다.';
      return;
    }
  }

  closeBasicModal();
  if (playerCount === 2 && twoPlayerLayout === '1x2') {
    openFaceModal(merged);
    return;
  }
  startQuizWithSettings(merged, false, pvamDemoBank || undefined);
};

const startWithFaceSetting = (faceToFace) => {
  if (!pendingStartSettings) return;
  const settings = pendingStartSettings;
  closeFaceModal();
  startQuizWithSettings(settings, faceToFace);
};

const renderPresets = () => {
  if (!presetListEl) return;
  presetListEl.innerHTML = '';
  [...presets, ...customPresets].forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.appendChild(document.createTextNode(preset.label));
    if (preset.description) {
      const span = document.createElement('span');
      span.textContent = preset.description;
      btn.appendChild(span);
    }
    btn.addEventListener('click', () => openPresetModal(preset));
    presetListEl.appendChild(btn);
  });
};

const handleSavePreset = () => {
  if (!presetNameInput) return;
  const name = presetNameInput.value.trim();
  if (!name) {
    setLoadStatus('저장 이름을 입력해 주세요.', 'fail');
    presetNameInput.focus();
    return;
  }
  const settings = readSettings();
  const preset = {
    id: `custom-${Date.now()}`,
    label: name,
    description: '저장됨',
    settings
  };
  const existingIndex = customPresets.findIndex((item) => item.label === name);
  if (existingIndex >= 0) {
    customPresets.splice(existingIndex, 1, preset);
  } else {
    customPresets.unshift(preset);
  }
  saveCustomPresets();
  renderPresets();
  presetNameInput.value = '';
  setLoadStatus('프리셋이 저장되었습니다.', 'success');
};

const readSettings = () => {
  const studentIdRaw = (settingsInputs.student?.value || '').trim();
  const studentId = (/^\d{1,2}$/.test(studentIdRaw) ? studentIdRaw : '01').padStart(2, '0');
  const playerValue = settingsInputs.players?.value || '1';
  const isTwoLayout = playerValue === '1x2' || playerValue === '2x1';
  const playerCount = isTwoLayout
    ? 2
    : Math.min(6, Math.max(1, Number(playerValue) || 1));
  const twoPlayerLayout = playerValue === '2x1' ? '2x1' : '1x2';
  const quizEndMode = settingsInputs.endMode?.value === 'time' ? 'time' : 'count';
  const quizTimeLimitSec = Math.max(0, Number(settingsInputs.quizTime?.value) || 0);
  const groupNames = parseGroupNames(groupNamesInput?.value || '');
  const rankingEnabled = settingsInputs.ranking?.value === 'true';
  const customQuestionMode = settingsInputs.customEnabled?.value === 'true';
  const customCsvMode = customQuestionMode
    && settingsInputs.customCsvEnabled?.value === 'true'
    && uploadedCsvQuestionBank?.questions?.length > 0;
  const customQuestionIds = settingsInputs.customIds
    ? parseCustomIds(settingsInputs.customIds.value || '')
    : collectCustomSelectedIds();

  const questionTypes = {};
  let totalCount = 0;
  let enabledFound = false;
  Object.entries(typeInputs).forEach(([key, fields]) => {
    const enabled = fields.enabled.value === 'true';
    const count = Math.max(0, Number(fields.count.value) || 0);
    questionTypes[key] = {
      enabled,
      count
    };
    if (enabled) {
      enabledFound = true;
      totalCount += count;
    }
  });
  if (!enabledFound || totalCount <= 0) {
    Object.keys(questionTypes).forEach((key) => {
      questionTypes[key] = { enabled: false, count: 0 };
    });
    questionTypes.cube_facecolor = { enabled: true, count: 5 };
    questionTypes.cuboid_facecolor = { enabled: true, count: 5 };
    totalCount = 10;
  }

  const selectionMode = settingsInputs.mode.value;
  const avoidRepeat = selectionMode === 'sequential'
    ? false
    : settingsInputs.repeat.value === 'true';

  return {
    studentId,
    playerCount,
    twoPlayerLayout,
    quizEndMode,
    quizTimeLimitSec,
    groupNames,
    rankingEnabled,
    customQuestionMode,
    customCsvMode,
    customQuestionIds,
    questionTypes,
    timeLimitSec: Number(settingsInputs.time.value) || 0,
    wrongDelaySec: Math.max(0, Number(settingsInputs.penalty.value) || 0),
    score: {
      base: Number(settingsInputs.score.value) || 0,
      penalty: 0,
      comboEnabled: settingsInputs.combo.value === 'true',
      comboBonus: Number(settingsInputs.comboBonus.value) || 0,
      timeBonusEnabled: settingsInputs.timeBonus.value === 'true',
      timeBonusPerSec: Number(settingsInputs.timeBonusPer.value) || 0,
      timeBonusMaxRatio: Number(settingsInputs.timeBonusCap?.value) || 0
    },
    questionCount: totalCount,
    loopQuestions: quizEndMode === 'time',
    selectionMode,
    avoidRepeat,
    shuffleChoices: settingsInputs.shuffle.value === 'true'
  };
};

const setLoadStatus = (message, type) => {
  if (!loadStatusEl) return;
  loadStatusEl.textContent = message;
  loadStatusEl.classList.remove('success', 'fail');
  if (type) loadStatusEl.classList.add(type);
};

const openZoom = (src) => {
  if (!zoomModal || !zoomImg || !src) return;
  zoomImg.src = src;
  zoomModal.classList.remove('hidden');
};

const closeZoom = () => {
  if (!zoomModal) return;
  zoomModal.classList.add('hidden');
};

const renderTextShortAnswerQuestion = ({ choicesEl, question, onSubmit }) => {
  if (!choicesEl || !isTextShortAnswerQuestion(question)) return;
  const root = document.createElement('div');
  root.className = 'short-answer-widget';

  const description = document.createElement('div');
  description.className = 'short-answer-desc';
  description.textContent = '답을 직접 입력하고 제출하세요.';
  root.appendChild(description);

  const inputRow = document.createElement('div');
  inputRow.className = 'short-answer-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = 'short-answer-input';
  input.placeholder = '정답 입력';
  input.setAttribute('aria-label', '주관식 정답 입력');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'primary short-answer-submit';
  submitBtn.textContent = '제출';

  const submit = () => {
    if (typeof onSubmit !== 'function') return;
    onSubmit(input.value || '');
  };

  submitBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  });

  inputRow.append(input, submitBtn);
  root.appendChild(inputRow);
  choicesEl.innerHTML = '';
  choicesEl.classList.add('structured-choices');
  choicesEl.style.removeProperty('height');
  choicesEl.appendChild(root);
  requestAnimationFrame(() => input.focus());
};

const updateChoiceLayout = (card) => {
  if (!card) return;
  const choicesEl = card.querySelector('[data-role="choices"]');
  const questionImg = card.querySelector('[data-role="question-img"]');
  if (!choicesEl || !questionImg) return;
  if (choicesEl.classList.contains('structured-choices')) return;
  const count = choicesEl.children.length;
  if (!count) return;

  const questionFrame = card.querySelector('.question-frame');
  const headerEl = card.querySelector('.quiz-header');
  const promptElLocal = card.querySelector('.prompt');
  const feedbackElLocal = card.querySelector('[data-role="feedback"]');
  const summaryElLocal = card.querySelector('[data-role="summary"]');
  const hasQuestionFrame = questionFrame && questionFrame.offsetParent !== null;
  const gap = (() => {
    const styles = getComputedStyle(card);
    return parseFloat(styles.rowGap || styles.gap) || 0;
  })();

  const cardPadding = (() => {
    const styles = getComputedStyle(card);
    const pt = parseFloat(styles.paddingTop) || 0;
    const pb = parseFloat(styles.paddingBottom) || 0;
    return pt + pb;
  })();

  const measureItem = (el) => {
    if (!el || el.offsetParent === null) return 0;
    const styles = getComputedStyle(el);
    const mt = parseFloat(styles.marginTop) || 0;
    const mb = parseFloat(styles.marginBottom) || 0;
    return el.offsetHeight + mt + mb;
  };
  const fixedItems = [headerEl, promptElLocal, feedbackElLocal, summaryElLocal]
    .filter((el) => el && el.offsetParent !== null);
  const fixedHeight = fixedItems.reduce((sum, el) => sum + measureItem(el), 0) + cardPadding;

  const visibleItems = [headerEl, promptElLocal, hasQuestionFrame ? questionFrame : null, choicesEl, feedbackElLocal, summaryElLocal]
    .filter((el) => el && el.offsetParent !== null);
  const gapCount = Math.max(0, visibleItems.length - 1);

  const availableHeight = Math.max(200, card.clientHeight - fixedHeight - gap * gapCount);

  const choiceImgs = [...choicesEl.querySelectorAll('img')];
  const ratios = choiceImgs
    .map((img) => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      return w && h ? w / h : null;
    })
    .filter((r) => r);
  const choiceRatio = ratios.length
    ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length
    : 1;

  const width = card.clientWidth - (parseFloat(getComputedStyle(card).paddingLeft) || 0) - (parseFloat(getComputedStyle(card).paddingRight) || 0);
  const choicesWidth = choicesEl.clientWidth || width;
  const candidates = [1, 2, 4].filter((cols) => cols <= count);
  let bestCols = candidates[0] || 1;
  let bestScore = -1;
  let bestQHeight = 0;
  let bestCHeight = availableHeight;

  if (!hasQuestionFrame) {
    candidates.forEach((cols) => {
      const rows = Math.ceil(count / cols);
      const cellW = (choicesWidth - gap * (cols - 1)) / cols;
      const cellH = (availableHeight - gap * (rows - 1)) / rows;
      const choiceScale = Math.min(cellW / choiceRatio, cellH);
      if (choiceScale > bestScore) {
        bestScore = choiceScale;
        bestCols = cols;
      }
    });
    choicesEl.style.height = `${availableHeight}px`;
    choicesEl.style.setProperty('--choice-cols', bestCols);
    return;
  }

  const questionNaturalW = questionImg.naturalWidth || 1;
  const questionNaturalH = questionImg.naturalHeight || 1;
  const questionRatio = questionNaturalH ? (questionNaturalW / questionNaturalH) : 1;
  const questionWidth = questionFrame?.clientWidth || width;

  candidates.forEach((cols) => {
    const rows = Math.ceil(count / cols);
    [0.22, 0.26, 0.3, 0.34, 0.38].forEach((share) => {
      const qHeight = Math.max(90, availableHeight * share);
      const cHeight = Math.max(140, availableHeight - qHeight - gap);
      const cellW = (choicesWidth - gap * (cols - 1)) / cols;
      const cellH = (cHeight - gap * (rows - 1)) / rows;
      const choiceScale = Math.min(cellW / choiceRatio, cellH);
      const questionScale = Math.min(questionWidth / questionRatio, qHeight);
      const score = choiceScale * 0.85 + questionScale * 0.15;
      if (score > bestScore) {
        bestScore = score;
        bestCols = cols;
        bestQHeight = qHeight;
        bestCHeight = cHeight;
      }
    });
  });

  if (questionFrame) questionFrame.style.height = `${bestQHeight}px`;
  choicesEl.style.height = `${bestCHeight}px`;
  choicesEl.style.setProperty('--choice-cols', bestCols);
};

const createPlayerSession = ({ index, studentId, groupName, settings, questionBank, onFinish }) => {
  const card = quizTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.playerIndex = `${index}`;
  card.classList.add(`player-tone-${(index % 6) + 1}`);
  const progressEl = card.querySelector('[data-role="progress"]');
  const scoreEl = card.querySelector('[data-role="score"]');
  const accuracyEl = card.querySelector('[data-role="accuracy"]');
  const comboEl = card.querySelector('[data-role="combo"]');
  const promptEl = card.querySelector('[data-role="prompt"]');
  const questionImg = card.querySelector('[data-role="question-img"]');
  const questionFrame = card.querySelector('.question-frame');
  const choicesEl = card.querySelector('[data-role="choices"]');
  const feedbackEl = card.querySelector('[data-role="feedback"]');
  const timerEl = card.querySelector('[data-role="timer"]');
  const zoomBtn = card.querySelector('[data-role="zoom-btn"]');
  const summaryEl = card.querySelector('[data-role="summary"]');
  const playerLabel = card.querySelector('[data-role="player-label"]');

  if (playerLabel) {
    playerLabel.textContent = groupName || `학생 ${studentId}`;
  }

  const engine = createQuizEngine({
    questionBank,
    settings
  });

  let currentQuestion = null;
  let timerId = null;
  let totalTimerId = null;
  let questionTimeoutId = null;
  let locked = false;
  let finished = false;
  const answerLog = [];

  const setFeedback = (message, type) => {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove('success', 'fail');
    if (type) feedbackEl.classList.add(type);
  };

  const clearTimer = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const clearQuestionTimeout = () => {
    if (questionTimeoutId) {
      clearTimeout(questionTimeoutId);
      questionTimeoutId = null;
    }
  };

  const clearTotalTimer = () => {
    if (totalTimerId) {
      clearInterval(totalTimerId);
      totalTimerId = null;
    }
  };

  const startTimer = (limitSec) => {
    clearTimer();
    if (!timerEl) return;
    if (!limitSec) {
      timerEl.textContent = '-';
      return;
    }
    let remaining = limitSec;
    timerEl.textContent = `${remaining}s`;
    timerId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimer();
        timerEl.textContent = '0s';
        handleAnswer(null, true);
        return;
      }
      timerEl.textContent = `${remaining}s`;
    }, 1000);
  };

  const updateHeader = () => {
    const state = engine.getState();
    const total = state.settings.questionCount;
    if (progressEl) {
      progressEl.textContent = settings.quizEndMode === 'time'
        ? `${state.answeredCount}`
        : `${state.answeredCount}/${total}`;
    }
    if (scoreEl) scoreEl.textContent = `${state.totalScore}`;
    if (comboEl) comboEl.textContent = `${state.combo}`;
    const accuracy = state.answeredCount
      ? Math.round((state.correctCount / state.answeredCount) * 100)
      : 0;
    if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;
  };

  const resolveQuestionTimeLimitSec = (question) => {
    const questionRaw = question?.timeLimitSec;
    if (questionRaw == null || questionRaw === '') {
      return Math.max(0, Number(engine.getState().settings.timeLimitSec) || 0);
    }
    const parsed = Number(questionRaw);
    if (!Number.isFinite(parsed)) {
      return Math.max(0, Number(engine.getState().settings.timeLimitSec) || 0);
    }
    return Math.max(0, parsed);
  };

  const renderQuestion = (question) => {
    const structuredQuestion = isPlaceValueAreaModelQuestion(question);
    const shortAnswerQuestion = isTextShortAnswerQuestion(question);
    currentQuestion = structuredQuestion ? { ...question } : fixChoices(question);
    const textChoiceQuestion = isTextChoiceQuestion(currentQuestion);
    card.classList.toggle(
      'no-question',
      currentQuestion.type === 'validity' || structuredQuestion || textChoiceQuestion || shortAnswerQuestion
    );
    if (promptEl) {
      if (currentQuestion.type === 'validity') {
        promptEl.textContent = currentQuestion.mode === 'invalid'
          ? '잘못된 형태의 전개도를 고르세요'
          : '올바른 형태의 전개도를 고르세요';
      } else if (shortAnswerQuestion) {
        promptEl.textContent = currentQuestion.prompt || currentQuestion.question || '문항';
      } else if (textChoiceQuestion) {
        promptEl.textContent = currentQuestion.prompt || currentQuestion.question || '문항';
      } else {
        promptEl.textContent = currentQuestion.prompt;
      }
    }
    if (questionImg && questionFrame) {
      if (currentQuestion.type === 'validity' || structuredQuestion || textChoiceQuestion || shortAnswerQuestion) {
        questionFrame.style.display = 'none';
        questionImg.removeAttribute('src');
      } else {
        questionFrame.style.display = '';
        questionImg.src = `./nets/${currentQuestion.question}`;
        questionImg.onload = () => requestAnimationFrame(() => updateChoiceLayout(card));
      }
    }
    if (choicesEl) {
      choicesEl.innerHTML = '';
      if (!structuredQuestion) choicesEl.classList.remove('structured-choices');
      choicesEl.style.removeProperty('height');
    }
    setFeedback('', null);
    locked = false;

    if (structuredQuestion) {
      renderPlaceValueAreaModelQuestion({
        choicesEl,
        question: currentQuestion,
        onSubmit: (answerInput) => handleAnswer(answerInput, false)
      });
    } else if (shortAnswerQuestion) {
      renderTextShortAnswerQuestion({
        choicesEl,
        question: currentQuestion,
        onSubmit: (answerInput) => handleAnswer(answerInput, false)
      });
    } else {
      currentQuestion.choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        const choiceIndex = (idx % 4) + 1;
        btn.className = `choice-btn choice-color-${choiceIndex}`;
        btn.dataset.choice = choice;
        const badge = document.createElement('span');
        badge.className = 'choice-badge';
        badge.textContent = `${idx + 1}`;
        btn.appendChild(badge);
        if (textChoiceQuestion) {
          btn.classList.add('choice-btn-text');
          const label = document.createElement('span');
          label.className = 'choice-text';
          label.textContent = choice;
          btn.appendChild(label);
        } else {
          const img = document.createElement('img');
          img.src = `./nets/${choice}`;
          img.alt = 'choice';
          img.onload = () => requestAnimationFrame(() => updateChoiceLayout(card));
          btn.appendChild(img);
        }
        btn.addEventListener('click', () => handleAnswer(choice, false));
        choicesEl?.appendChild(btn);
      });

      requestAnimationFrame(() => updateChoiceLayout(card));
    }
    const questionTimeLimitSec = resolveQuestionTimeLimitSec(currentQuestion);
    if (settings.quizEndMode !== 'time') {
      startTimer(questionTimeLimitSec);
    } else {
      clearQuestionTimeout();
      if (questionTimeLimitSec > 0) {
        questionTimeoutId = setTimeout(() => {
          handleAnswer(null, true);
        }, questionTimeLimitSec * 1000);
      }
    }
  };

  const startTotalTimer = () => {
    clearTotalTimer();
    if (!timerEl) return;
    const limitSec = settings.quizTimeLimitSec || 0;
    if (!limitSec) {
      timerEl.textContent = '-';
      return;
    }
    let remaining = limitSec;
    timerEl.textContent = `${remaining}s`;
    totalTimerId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTotalTimer();
        timerEl.textContent = '0s';
        setFeedback('시간 종료!', 'fail');
        finish();
        return;
      }
      timerEl.textContent = `${remaining}s`;
    }, 1000);
  };

  const finish = () => {
    finished = true;
    clearTimer();
    clearQuestionTimeout();
    clearTotalTimer();
    card.classList.add('player-complete');
    const state = engine.getState();
    const total = settings.quizEndMode === 'time'
      ? state.answeredCount
      : state.settings.questionCount;
    const accuracy = state.answeredCount
      ? Math.round((state.correctCount / state.answeredCount) * 100)
      : 0;
    if (summaryEl) {
      summaryEl.textContent = `완료! ${state.totalScore}점 · 정답 ${state.correctCount}/${total} (${accuracy}%)`;
      summaryEl.classList.remove('hidden');
    }
    if (typeof onFinish === 'function') onFinish();
  };

  const handleAnswer = (choice, isTimeout) => {
    if (locked || !currentQuestion) return;
    locked = true;
    clearTimer();
    clearQuestionTimeout();
    const answerChoice = choice ?? '';
    const result = engine.submitAnswer(answerChoice);
    if (!result) return;

    answerLog.push({
      studentId,
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      answer: currentQuestion.answer,
      prompt: currentQuestion.prompt,
      choices: currentQuestion.choices,
      choice: choice ?? null,
      correct: result.correct,
      timeMs: result.timeMs,
      scoreDelta: result.scoreDelta,
      totalScore: result.totalScore,
      combo: result.combo,
      type: currentQuestion.type
    });

    const buttons = [...(choicesEl?.querySelectorAll('.choice-btn') || [])];
    buttons.forEach((btn) => {
      const value = btn.dataset.choice;
      if (value === currentQuestion.answer) btn.classList.add('correct');
      if (value === choice && value !== currentQuestion.answer) btn.classList.add('wrong');
    });
    if (result.answerKind === 'structured') {
      const wrongFields = new Set(result.wrongFields || []);
      const structuredInputs = [...(choicesEl?.querySelectorAll('[data-structured-input]') || [])];
      structuredInputs.forEach((inputEl) => {
        inputEl.classList.remove('is-correct', 'is-wrong');
        if (result.correct) {
          inputEl.classList.add('is-correct');
          return;
        }
        const fieldId = inputEl.dataset.structuredInput || '';
        if (wrongFields.has(fieldId)) {
          inputEl.classList.add('is-wrong');
        } else {
          inputEl.classList.add('is-correct');
        }
      });
    }

    if (result.correct) {
      setFeedback('정답입니다!', 'success');
    } else {
      setFeedback(isTimeout ? '시간 초과! 오답입니다.' : '오답입니다.', 'fail');
    }

    updateHeader();

    const wrongDelayMs = Math.max(0, settings.wrongDelaySec ?? 3) * 1000;
    const delay = result.correct ? 800 : wrongDelayMs;
    setTimeout(() => {
      const next = engine.nextQuestion();
      if (next) {
        renderQuestion(next);
      } else {
        finish();
      }
    }, delay);
  };

  const start = () => {
    updateHeader();
    const first = engine.nextQuestion();
    if (first) renderQuestion(first);
    else finish();
    if (settings.quizEndMode === 'time') {
      startTotalTimer();
    }
  };

  if (zoomBtn) {
    zoomBtn.addEventListener('click', () => openZoom(questionImg?.src));
  }

  return {
    card,
    start,
    destroy: () => {
      clearTimer();
      clearTotalTimer();
    },
    updateLayout: () => updateChoiceLayout(card),
    isFinished: () => finished,
    getLog: () => {
      const state = engine.getState();
      const total = state.settings.questionCount;
      const accuracy = state.answeredCount
        ? Math.round((state.correctCount / state.answeredCount) * 100)
        : 0;
      return {
        settings: settings,
        groupName: groupName || null,
        summary: {
          totalScore: state.totalScore,
          correctCount: state.correctCount,
          totalCount: state.answeredCount,
          accuracy
        },
        answers: answerLog
      };
    }
  };
};

const getGridLayout = (count, twoPlayerLayout, isMobile) => {
  if (count <= 1) {
    return { cols: 1, rows: 1 };
  }
  if (count === 2) {
    const forcedLayout = isMobile ? '1x2' : twoPlayerLayout;
    return forcedLayout === '2x1'
      ? { cols: 2, rows: 1 }
      : { cols: 1, rows: 2 };
  }
  return { cols: count, rows: 1 };
};

const updateGridLayout = (count, twoPlayerLayout, isMobile) => {
  if (!quizGrid) return;
  const layout = getGridLayout(count, twoPlayerLayout, isMobile);
  quizGrid.style.setProperty('--player-cols', `${layout.cols}`);
  quizGrid.style.setProperty('--player-rows', `${layout.rows}`);
  const header = document.querySelector('header');
  const main = document.querySelector('main');
  if (header && main) {
    const styles = getComputedStyle(main);
    const padTop = parseFloat(styles.paddingTop) || 0;
    const padBottom = parseFloat(styles.paddingBottom) || 0;
    const available = window.innerHeight - header.offsetHeight - padTop - padBottom;
    if (available > 0) {
      quizGrid.style.height = `${available}px`;
    }
  }
};

const scheduleLayoutAll = () => {
  if (!players.length || !sessionSettings) return;
  const isMobile = window.innerWidth < 720;
  updateGridLayout(players.length, sessionSettings.twoPlayerLayout, isMobile);
  players.forEach((player) => player.updateLayout());
};

const renderRetryActions = (logs) => {
  if (!retryListEl) return;
  retryListEl.innerHTML = '';
  if (retryNoteEl) retryNoteEl.textContent = '';
  if (!logs.length) return;

  logs.forEach((log) => {
    const wrongQuestions = buildWrongQuestions(log);
    const row = document.createElement('div');
    row.className = 'retry-item';

    const label = document.createElement('div');
    label.className = 'retry-label';
    label.textContent = `학생 ${log.settings.studentId} · 오답 ${wrongQuestions.length}개`;

    const actions = document.createElement('div');
    actions.className = 'retry-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'secondary';
    retryBtn.textContent = '오답 다시풀기';
    retryBtn.disabled = wrongQuestions.length === 0;
    retryBtn.addEventListener('click', () => {
      if (!wrongQuestions.length) return;
      const settings = {
        ...log.settings,
        playerCount: 1,
        twoPlayerLayout: '1x2',
        quizEndMode: 'count',
        quizTimeLimitSec: 0,
        questionCount: wrongQuestions.length,
        shuffleChoices: true
      };
      startQuizWithSettings(settings, false, { questions: wrongQuestions });
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'secondary';
    saveBtn.textContent = '오답 저장';
    saveBtn.disabled = wrongQuestions.length === 0;
    saveBtn.addEventListener('click', () => {
      if (!wrongQuestions.length) return;
      const saved = loadSavedWrongs();
      const createdAt = new Date();
      const labelText = `오답-학생${log.settings.studentId}-${formatTimestamp(createdAt)}`;
      const item = {
        id: `wrong-${createdAt.getTime()}-${log.settings.studentId}`,
        label: labelText,
        studentId: log.settings.studentId,
        createdAt: createdAt.toISOString(),
        count: wrongQuestions.length,
        settings: {
          selectionMode: log.settings.selectionMode,
          shuffleChoices: true,
          timeLimitSec: log.settings.timeLimitSec,
          score: log.settings.score,
          wrongDelaySec: log.settings.wrongDelaySec ?? 0,
          avoidRepeat: true
        },
        questions: wrongQuestions
      };
      saved.unshift(item);
      saveSavedWrongs(saved);
      renderSavedWrongs();
      if (retryNoteEl) {
        retryNoteEl.textContent = `${labelText} 저장 완료`;
      }
    });

    actions.appendChild(retryBtn);
    actions.appendChild(saveBtn);
    row.appendChild(label);
    row.appendChild(actions);
    retryListEl.appendChild(row);
  });
};

const renderRanking = (logs, rankingEnabled) => {
  const section = $('#rank-section');
  const listEl = $('#rank-list');
  if (!section || !listEl) return;
  if (!rankingEnabled) {
    section.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  listEl.innerHTML = '';

  const ranked = logs.slice().sort((a, b) => {
    if (b.summary.totalScore !== a.summary.totalScore) {
      return b.summary.totalScore - a.summary.totalScore;
    }
    return b.summary.correctCount - a.summary.correctCount;
  });

  ranked.forEach((log, idx) => {
    const label = log.groupName || `학생 ${log.settings.studentId}`;
    const row = document.createElement('div');
    row.className = `rank-item rank-${idx + 1}`;
    const left = document.createElement('div');
    left.className = 'rank-label';
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.textContent = `${idx + 1}`;
    const name = document.createElement('span');
    name.textContent = label;
    left.appendChild(badge);
    left.appendChild(name);

    const score = document.createElement('span');
    score.textContent = `${log.summary.totalScore}점 · ${log.summary.correctCount}/${log.summary.totalCount}`;
    row.appendChild(left);
    row.appendChild(score);
    listEl.appendChild(row);
  });
};

const finishAllPlayers = () => {
  summaryCard.classList.remove('hidden');
  quizGrid?.classList.add('hidden');
  const logs = players.map((player) => player.getLog());
  const inferredStudentNo = resolveSingleStudentNoFromLogs(logs);
  syncResultNavigationLinks({
    studentNo: resultFilterContext.studentNo || inferredStudentNo,
    periodDays: resultFilterContext.periodDays
  });
  const summaryText = logs
    .map((log) => {
      const label = log.groupName || `학생 ${log.settings.studentId}`;
      return `${label} ${log.summary.totalScore}점 (${log.summary.correctCount}/${log.summary.totalCount})`;
    })
    .join(' · ');
  const summaryEl = $('#summary-text');
  if (summaryEl) summaryEl.textContent = summaryText || '완료';

  const payload = {
    settings: sessionSettings,
    players: logs
  };
  latestQuizResultPayload = payload;

  if (logOutputEl) {
    logOutputEl.value = JSON.stringify(payload, null, 2);
  }

  saveQuizSessionRecord({
    settings: sessionSettings,
    players: logs,
    source: 'quiz-app'
  })
    .then((result) => {
      console.info('[QuizApp] local record saved', result);
    })
    .catch((error) => {
      console.warn('[QuizApp] local record save failed', error);
    });

  renderRetryActions(logs);
  renderRanking(logs, sessionSettings?.rankingEnabled);
};

if (zoomBackdrop) {
  zoomBackdrop.addEventListener('click', closeZoom);
}
if (zoomClose) {
  zoomClose.addEventListener('click', closeZoom);
}
if (presetBackdrop) {
  presetBackdrop.addEventListener('click', closePresetModal);
}
if (presetCancel) {
  presetCancel.addEventListener('click', closePresetModal);
}
if (presetConfirm) {
  presetConfirm.addEventListener('click', applyPresetAndStart);
}
if (faceBackdrop) {
  faceBackdrop.addEventListener('click', closeFaceModal);
}
if (faceNormalBtn) {
  faceNormalBtn.addEventListener('click', () => startWithFaceSetting(false));
}
if (faceConfirmBtn) {
  faceConfirmBtn.addEventListener('click', () => startWithFaceSetting(true));
}
if (basicBackdrop) {
  basicBackdrop.addEventListener('click', closeBasicModal);
}
if (basicCancel) {
  basicCancel.addEventListener('click', closeBasicModal);
}
if (basicStart) {
  basicStart.addEventListener('click', applyBasicMode);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeZoom();
    closePresetModal();
    closeFaceModal();
    closeBasicModal();
    closeNameModal();
  }
});

const startQuizWithSettings = (settings, faceToFace, customBank) => {
  sessionSettings = { ...settings, faceToFace };
  if (logOutputEl) logOutputEl.value = '';
  const csvCustomBank = settings.customCsvMode && uploadedCsvQuestionBank?.questions?.length
    ? uploadedCsvQuestionBank
    : null;
  const pvamDemoBank = (!customBank && !settings.customQuestionMode)
    ? buildPvamDemoQuestionBank(settings)
    : null;
  const customBankFromIds = settings.customQuestionMode && settings.customQuestionIds?.length
    ? buildCustomQuestionBank(settings.customQuestionIds)
    : null;
  if (csvCustomBank) {
    questionBank = csvCustomBank;
    setLoadStatus(`업로드 문제로 시작합니다. (${questionBank.questions.length}문항)`, 'success');
  } else if (settings.customQuestionMode && settings.customQuestionIds?.length && customBankFromIds?.questions?.length) {
    questionBank = customBankFromIds;
    setLoadStatus('커스텀 문제로 시작합니다.', 'success');
  } else if (settings.customQuestionMode && settings.customQuestionIds?.length) {
    questionBank = buildWeightedQuestionBank(banks, settings);
    setLoadStatus('커스텀 문제를 찾지 못했습니다. 일반 출제로 시작합니다.', 'fail');
  } else {
    questionBank = customBank || pvamDemoBank || buildWeightedQuestionBank(banks, settings);
    if (pvamDemoBank) {
      setLoadStatus(`영역모델 데모 문제로 시작합니다. (${questionBank.questions.length}문항)`, 'success');
    }
  }
  const availableQuestionCount = questionBank.questions.length;
  if (availableQuestionCount <= 0) {
    settings.questionCount = 0;
    settings.loopQuestions = false;
  } else if (settings.quizEndMode === 'time') {
    settings.questionCount = availableQuestionCount;
    settings.loopQuestions = true;
  } else {
    const requestedCount = Math.round(Number(settings.questionCount) || availableQuestionCount);
    settings.questionCount = Math.max(1, Math.min(availableQuestionCount, requestedCount));
    settings.loopQuestions = false;
  }

  const isMobile = window.innerWidth < 720;
  const requestedPlayers = settings.playerCount || 1;
  const playerCount = isMobile ? Math.min(requestedPlayers, 2) : requestedPlayers;
  const layout = playerCount === 2
    ? (isMobile ? '1x2' : settings.twoPlayerLayout)
    : null;
  const enableFaceToFace = Boolean(faceToFace && layout === '1x2' && playerCount === 2);
  if (isMobile && requestedPlayers > 2) {
    setLoadStatus('모바일에서는 2인까지 지원합니다. 2인으로 시작합니다.', 'fail');
  } else {
    setLoadStatus('', null);
  }

  settingsCard.classList.add('hidden');
  summaryCard.classList.add('hidden');
  quizGrid?.classList.remove('hidden');
  quizGrid.innerHTML = '';
  quizGrid?.classList.toggle('face-to-face', enableFaceToFace);
  quizGrid?.classList.toggle('multi', playerCount > 1);
  players.forEach((player) => player.destroy());
  players = [];

  updateGridLayout(playerCount, settings.twoPlayerLayout, isMobile);

  const baseStudent = parseInt(settings.studentId, 10) || 1;
  const studentIds = Array.isArray(settings.studentIds) ? settings.studentIds : [];
  const groupNames = settings.groupNames || [];
  let finishedCount = 0;

  const handlePlayerFinish = () => {
    finishedCount += 1;
    if (finishedCount >= playerCount) finishAllPlayers();
  };

  for (let i = 0; i < playerCount; i += 1) {
    const tagRaw = typeof studentIds[i] === 'string' ? studentIds[i].trim() : '';
    const studentId = tagRaw
      ? (/^\d+$/.test(tagRaw) ? tagRaw.padStart(2, '0') : tagRaw)
      : `${Math.min(99, baseStudent + i)}`.padStart(2, '0');
    const groupName = playerCount > 1
      ? (groupNames[i] || `모둠 ${i + 1}`)
      : (groupNames[0] || null);
    const playerSettings = { ...settings, studentId };
    const player = createPlayerSession({
      index: i,
      studentId,
      groupName,
      settings: playerSettings,
      questionBank,
      onFinish: handlePlayerFinish
    });
    quizGrid.appendChild(player.card);
    players.push(player);
  }

  if (enableFaceToFace && players[0]) {
    players[0].card.classList.add('face-flip');
  }

  players.forEach((player) => player.start());

  scheduleLayoutAll();
  if (!resizeHandlerBound) {
    window.addEventListener('resize', () => requestAnimationFrame(scheduleLayoutAll));
    resizeHandlerBound = true;
  }
};

const startQuiz = () => {
  if (csvToolMode && !(uploadedCsvQuestionBank?.questions?.length > 0)) {
    setLoadStatus('문제 파일(CSV/JSON)을 먼저 업로드해 주세요.', 'fail');
    return;
  }
  const settings = readSettings();
  if (settings.playerCount === 2 && settings.twoPlayerLayout === '1x2') {
    openFaceModal(settings);
    return;
  }
  startQuizWithSettings(settings, false);
};

const resetSettings = () => {
  if (defaultSettings) applyDefaultSettings(defaultSettings);
};

const restartQuiz = () => {
  settingsCard.classList.remove('hidden');
  quizGrid?.classList.add('hidden');
  summaryCard.classList.add('hidden');
  players.forEach((player) => player.destroy());
  players = [];
  if (quizGrid) quizGrid.innerHTML = '';
  quizGrid?.classList.remove('face-to-face');
  quizGrid?.classList.remove('multi');
  if (retryListEl) retryListEl.innerHTML = '';
  if (retryNoteEl) retryNoteEl.textContent = '';
};

const init = async () => {
  try {
    banks.facecolor = await loadJson('./data/facecolor-questions.json');
    banks.edgecolor = await loadJson('./data/edgecolor-questions.json');
    banks.validity = await loadJson('./data/validity-questions.json');
  } catch (err) {
    console.error(err);
    setLoadStatus('문제 데이터를 불러오지 못했습니다. 새로고침 해주세요.', 'fail');
    startBtn.disabled = true;
    return;
  }

  const validations = Object.entries(banks).flatMap(([key, bank]) => {
    const result = validateQuestionBank(bank);
    if (!result.valid) {
      console.warn(`${key} bank invalid`, result.errors);
    }
    return result.errors.map(err => `${key}: ${err}`);
  });

  if (validations.length) {
    setLoadStatus(`문제 데이터 오류 ${validations.length}건 발견`, 'fail');
    startBtn.disabled = true;
  } else {
    setLoadStatus('문제 데이터 로드 완료', 'success');
  }

  basePools.facecolor = buildBasePools(banks.facecolor, 'facecolor');
  basePools.edgecolor = buildBasePools(banks.edgecolor, 'edgecolor');
  const validityPools = buildValidityShapePools(banks.validity);
  validityShapePools.cube = validityPools.cube;
  validityShapePools.cuboid = validityPools.cuboid;
  defaultSettings = await loadJson('./data/quiz-settings.default.json');
  applyDefaultSettings(defaultSettings);
  await bootstrapQuizPersistentStorage();
  hydrateCsvBankFromLauncherStorage();
  applyCsvToolModeUI();
  customPresets = loadCustomPresets();
  renderPresets();
  renderSavedWrongs();
  renderGroupNames();
  renderTypePreviews();
  bindPreviewToggles();
  syncRepeatSetting();
  settingsInputs.mode?.addEventListener('change', syncRepeatSetting);
  settingsInputs.customEnabled?.addEventListener('change', updateCustomPanelVisibility);
  settingsInputs.customCsvEnabled?.addEventListener('change', applyQuestionModeUI);
  settingsInputs.customIds?.addEventListener('input', syncCustomCheckboxes);
  Object.values(typeInputs).forEach((fields) => {
    fields.enabled?.addEventListener('change', () => {
      invalidateConfirmedCounts();
      renderCustomQuestionList();
    });
    fields.count?.addEventListener('input', invalidateConfirmedCounts);
  });
  confirmTypeCountsBtn?.addEventListener('click', confirmTypeCounts);
  customRandomBtn?.addEventListener('click', handleRandomCustomSelection);
  customClearBtn?.addEventListener('click', clearCustomSelection);
  customCsvFileInput?.addEventListener('change', async () => {
    const [file] = customCsvFileInput.files || [];
    try {
      await loadCsvQuestionBankFromFile(file);
    } catch (error) {
      console.error(error);
      setCustomCsvStatus('업로드 파일을 읽는 중 오류가 발생했습니다.', 'fail');
    }
  });
  customCsvClearBtn?.addEventListener('click', () => clearCsvQuestionBank());
  customCsvTemplateBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    const content = buildCsvTemplate();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'knolquiz-question-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  });
  customPackExportBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    exportQuestionPackJson();
  });
  updateCustomPanelVisibility();

  basicFiveBtn?.addEventListener('click', () => openBasicModal('5min'));
  basicTwelveBtn?.addEventListener('click', () => openBasicModal('12q'));
  basicPvamBtn?.addEventListener('click', () => openBasicModal('pvam'));
  if (advancedToggle && advancedSettings) {
    const setAdvancedOpen = (open) => {
      advancedSettings.classList.toggle('hidden', !open);
      advancedToggle.textContent = open ? '퀴즈 설계 닫기' : '퀴즈 설계하기';
      advancedToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    let advancedOpen = csvToolMode;
    setAdvancedOpen(advancedOpen);
    if (!csvToolMode) {
      advancedToggle.addEventListener('click', () => {
        advancedOpen = !advancedOpen;
        setAdvancedOpen(advancedOpen);
      });
    } else {
      advancedToggle.classList.add('hidden');
    }
  }
  if (typeToggle && typeGrid) {
    const setTypeOpen = (open) => {
      typeGrid.classList.toggle('hidden', !open);
      typeToggle.textContent = open ? '전개도 문제 세트 접기' : '전개도 문제 세트 펼치기';
      typeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    typeOpen = false;
    setTypeOpen(typeOpen);
    typeToggle.addEventListener('click', () => {
      typeOpen = !typeOpen;
      setTypeOpen(typeOpen);
      applyQuestionModeUI();
    });
  }
  if (modeButtons.length && settingsInputs.customEnabled) {
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.modeSelect;
        settingsInputs.customEnabled.value = mode === 'custom' ? 'true' : 'false';
        applyQuestionModeUI();
      });
    });
    applyQuestionModeUI();
  }
  if (nameManageToggle) {
    nameManageToggle.addEventListener('click', openNameModal);
  }
  if (nameModalBackdrop) {
    nameModalBackdrop.addEventListener('click', closeNameModal);
  }
  if (nameModalClose) {
    nameModalClose.addEventListener('click', closeNameModal);
  }
  presetSaveBtn?.addEventListener('click', handleSavePreset);

  startBtn.addEventListener('click', startQuiz);
  resetBtn.addEventListener('click', resetSettings);
  restartBtn.addEventListener('click', restartQuiz);
  saveGroupNamesBtn?.addEventListener('click', handleSaveGroupNames);
  saveStudentNameBtn?.addEventListener('click', handleSaveStudentName);

  copyLogBtn?.addEventListener('click', async () => {
    if (!logOutputEl?.value) return;
    try {
      await navigator.clipboard.writeText(logOutputEl.value);
      copyLogBtn.textContent = '복사됨!';
      setTimeout(() => (copyLogBtn.textContent = 'JSON 복사'), 1500);
    } catch (err) {
      console.warn('copy failed', err);
    }
  });

  downloadLogBtn?.addEventListener('click', () => {
    if (!logOutputEl?.value) return;
    const blob = new Blob([logOutputEl.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  downloadReportCsvBtn?.addEventListener('click', () => {
    downloadQuizResultReportCsv();
  });

  maybeAutoStartQuizFromLauncher();
};

init();
