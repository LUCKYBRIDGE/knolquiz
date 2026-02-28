const DB_NAME = 'math-net-master-local-records';
const DB_VERSION = 2;

const STORE_SESSIONS = 'sessions';
const STORE_PLAYERS = 'players';
const STORE_WRONGS = 'wrongAnswers';
const STORE_CLASSROOM_STUDENTS = 'classroomStudents';
const STORE_CLASSROOM_ATTENDANCE = 'classroomAttendance';
const STORE_CLASSROOM_SEASONS = 'classroomSeasons';
const STORE_CLASSROOM_SEASON_RESULTS = 'classroomSeasonResults';

let openDbPromise = null;

const safeIdSuffix = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb request failed'));
  });

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('indexeddb transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('indexeddb transaction failed'));
  });

const ensureIndexedDb = () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('indexeddb_unavailable');
  }
  return indexedDB;
};

const openDb = () => {
  if (openDbPromise) return openDbPromise;
  openDbPromise = new Promise((resolve, reject) => {
    let idb;
    try {
      idb = ensureIndexedDb();
    } catch (error) {
      reject(error);
      return;
    }
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessions.createIndex('byCreatedAt', 'createdAt');
        sessions.createIndex('byMode', 'mode');
      }
      if (!db.objectStoreNames.contains(STORE_PLAYERS)) {
        const players = db.createObjectStore(STORE_PLAYERS, { keyPath: 'id' });
        players.createIndex('byUpdatedAt', 'updatedAt');
        players.createIndex('byName', 'name');
      }
      if (!db.objectStoreNames.contains(STORE_WRONGS)) {
        const wrongs = db.createObjectStore(STORE_WRONGS, { keyPath: 'id' });
        wrongs.createIndex('byCreatedAt', 'createdAt');
        wrongs.createIndex('byPlayerId', 'playerId');
        wrongs.createIndex('byQuestionId', 'questionId');
      }
      if (!db.objectStoreNames.contains(STORE_CLASSROOM_STUDENTS)) {
        const students = db.createObjectStore(STORE_CLASSROOM_STUDENTS, { keyPath: 'id' });
        students.createIndex('byStudentNo', 'studentNo', { unique: true });
        students.createIndex('byUpdatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_CLASSROOM_ATTENDANCE)) {
        const attendance = db.createObjectStore(STORE_CLASSROOM_ATTENDANCE, { keyPath: 'id' });
        attendance.createIndex('byDate', 'date', { unique: true });
        attendance.createIndex('byUpdatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_CLASSROOM_SEASONS)) {
        const seasons = db.createObjectStore(STORE_CLASSROOM_SEASONS, { keyPath: 'id' });
        seasons.createIndex('byUpdatedAt', 'updatedAt');
        seasons.createIndex('byActive', 'active');
      }
      if (!db.objectStoreNames.contains(STORE_CLASSROOM_SEASON_RESULTS)) {
        const seasonResults = db.createObjectStore(STORE_CLASSROOM_SEASON_RESULTS, { keyPath: 'id' });
        seasonResults.createIndex('bySeasonId', 'seasonId');
        seasonResults.createIndex('byStudentNo', 'studentNo');
        seasonResults.createIndex('byUpdatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb open failed'));
  });
  return openDbPromise;
};

const normalizeName = (name, fallback) => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || fallback;
};

const playerIdFromName = (name) => `player:${name}`;

const playerIdFromNameAndTag = (name, tag) => {
  const safeName = name || 'unknown';
  const safeTag = typeof tag === 'string' ? tag.trim() : '';
  return safeTag ? `player:${safeName}:${safeTag}` : `player:${safeName}`;
};

const normalizeStudentNo = (raw) => {
  const num = Math.round(Number(raw));
  if (!Number.isFinite(num) || num < 1 || num > 50) return null;
  return num;
};

const toStudentId = (studentNo) => `student:${String(studentNo).padStart(2, '0')}`;

const normalizeIsoDate = (input) => {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const normalizeSeasonCategoryId = (raw) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'overall';
  return value;
};

const normalizeSeasonScorePolicies = (raw) => {
  const source = (raw && typeof raw === 'object') ? raw : {};
  return {
    basicQuizTotalScore: source.basicQuizTotalScore !== false,
    basicQuizCorrectCount: source.basicQuizCorrectCount === true,
    jumpmapBestHeight: source.jumpmapBestHeight !== false,
    jumpmapQuizCorrect: source.jumpmapQuizCorrect === true,
    battleshipKills: source.battleshipKills !== false,
    battleshipSurvivedSec: source.battleshipSurvivedSec === true,
    battleshipQuizSolved: source.battleshipQuizSolved === true
  };
};

const getSeasonEnabledCategories = (scorePolicies) => {
  const policies = normalizeSeasonScorePolicies(scorePolicies);
  const categories = [];
  if (policies.basicQuizTotalScore) categories.push('basicQuizTotalScore');
  if (policies.basicQuizCorrectCount) categories.push('basicQuizCorrectCount');
  if (policies.jumpmapBestHeight) categories.push('jumpmapBestHeight');
  if (policies.jumpmapQuizCorrect) categories.push('jumpmapQuizCorrect');
  if (policies.battleshipKills) categories.push('battleshipKills');
  if (policies.battleshipSurvivedSec) categories.push('battleshipSurvivedSec');
  if (policies.battleshipQuizSolved) categories.push('battleshipQuizSolved');
  return categories;
};

const buildPlayerSummaryPatch = (existing, log, createdAt) => {
  const prev = existing?.stats || {};
  const summary = log?.summary || {};
  const totalAnswered = Number(summary.totalCount) || 0;
  const correct = Number(summary.correctCount) || 0;
  const score = Number(summary.totalScore) || 0;
  const quizRuns = (Number(prev.quizRuns) || 0) + 1;
  const totalQuestions = (Number(prev.totalQuestions) || 0) + totalAnswered;
  const correctAnswers = (Number(prev.correctAnswers) || 0) + correct;
  const totalScore = (Number(prev.totalScore) || 0) + score;
  const bestScore = Math.max(Number(prev.bestScore) || 0, score);
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 1000) / 10 : 0;
  return {
    ...(existing || {}),
    updatedAt: createdAt,
    stats: {
      quizRuns,
      totalQuestions,
      correctAnswers,
      totalScore,
      bestScore,
      accuracy,
      lastPlayedAt: createdAt
    }
  };
};

const buildJumpmapPlayerSummaryPatch = (existing, player, createdAt) => {
  const prev = existing?.jumpmapStats || {};
  const currentHeightPx = Math.max(0, Number(player?.currentHeightPx) || 0);
  const bestHeightPx = Math.max(0, Number(player?.bestHeightPx) || 0);
  const quizAttempts = Math.max(0, Number(player?.quizAttempts) || 0);
  const quizCorrect = Math.max(0, Number(player?.quizCorrect) || 0);
  const quizWrong = Math.max(0, Number(player?.quizWrong) || 0);
  const jumps = Math.max(0, Number(player?.jumps) || 0);
  const doubleJumps = Math.max(0, Number(player?.doubleJumps) || 0);
  return {
    ...(existing || {}),
    updatedAt: createdAt,
    jumpmapStats: {
      runs: (Number(prev.runs) || 0) + 1,
      bestHeightPx: Math.max(Number(prev.bestHeightPx) || 0, bestHeightPx),
      lastHeightPx: currentHeightPx,
      totalQuizAttempts: (Number(prev.totalQuizAttempts) || 0) + quizAttempts,
      totalQuizCorrect: (Number(prev.totalQuizCorrect) || 0) + quizCorrect,
      totalQuizWrong: (Number(prev.totalQuizWrong) || 0) + quizWrong,
      totalJumps: (Number(prev.totalJumps) || 0) + jumps,
      totalDoubleJumps: (Number(prev.totalDoubleJumps) || 0) + doubleJumps,
      lastPlayedAt: createdAt
    }
  };
};

const buildBattleshipPlayerSummaryPatch = (existing, player, createdAt) => {
  const prev = existing?.battleshipStats || {};
  const kills = Math.max(0, Number(player?.kills) || 0);
  const quizSolved = Math.max(0, Number(player?.quizSolved) || 0);
  const bestScore = Math.max(Number(prev.bestScore) || 0, kills);
  return {
    ...(existing || {}),
    updatedAt: createdAt,
    battleshipStats: {
      runs: (Number(prev.runs) || 0) + 1,
      totalKills: (Number(prev.totalKills) || 0) + kills,
      bestScore,
      totalQuizSolved: (Number(prev.totalQuizSolved) || 0) + quizSolved,
      lastScore: kills,
      lastPlayedAt: createdAt
    }
  };
};

const putSessionRecord = async (db, sessionRecord) => {
  const tx = db.transaction([STORE_SESSIONS], 'readwrite');
  tx.objectStore(STORE_SESSIONS).put(sessionRecord);
  await txDone(tx);
};

const upsertPlayerRecord = async (db, playerRecordId, playerName, playerTag, log, createdAt) => {
  const tx = db.transaction([STORE_PLAYERS], 'readwrite');
  const store = tx.objectStore(STORE_PLAYERS);
  const existing = await requestToPromise(store.get(playerRecordId));
  const next = buildPlayerSummaryPatch(existing, log, createdAt);
  next.id = playerRecordId;
  next.name = playerName;
  if (playerTag) next.tag = playerTag;
  if (!next.createdAt) next.createdAt = createdAt;
  store.put(next);
  await txDone(tx);
};

const upsertJumpmapPlayerRecord = async (db, playerRecordId, playerName, playerTag, playerRecord, createdAt) => {
  const tx = db.transaction([STORE_PLAYERS], 'readwrite');
  const store = tx.objectStore(STORE_PLAYERS);
  const existing = await requestToPromise(store.get(playerRecordId));
  const next = buildJumpmapPlayerSummaryPatch(existing, playerRecord, createdAt);
  next.id = playerRecordId;
  next.name = playerName;
  if (playerTag) next.tag = playerTag;
  if (!next.createdAt) next.createdAt = createdAt;
  store.put(next);
  await txDone(tx);
};

const upsertBattleshipPlayerRecord = async (db, playerRecordId, playerName, playerTag, playerRecord, createdAt) => {
  const tx = db.transaction([STORE_PLAYERS], 'readwrite');
  const store = tx.objectStore(STORE_PLAYERS);
  const existing = await requestToPromise(store.get(playerRecordId));
  const next = buildBattleshipPlayerSummaryPatch(existing, playerRecord, createdAt);
  next.id = playerRecordId;
  next.name = playerName;
  if (playerTag) next.tag = playerTag;
  if (!next.createdAt) next.createdAt = createdAt;
  store.put(next);
  await txDone(tx);
};

const getAllFromStore = async (db, storeName) => {
  const tx = db.transaction([storeName], 'readonly');
  const store = tx.objectStore(storeName);
  const all = await requestToPromise(store.getAll());
  await txDone(tx);
  return Array.isArray(all) ? all : [];
};

const getRecordFromStore = async (db, storeName, id) => {
  const tx = db.transaction([storeName], 'readonly');
  const store = tx.objectStore(storeName);
  const row = await requestToPromise(store.get(id));
  await txDone(tx);
  return row || null;
};

const getTodayLocalIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeIsoDateKey = (raw) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const isSeasonInDateRange = (season, todayIsoDate) => {
  const startDate = normalizeIsoDateKey(season?.startDate);
  const endDate = normalizeIsoDateKey(season?.endDate);
  if (startDate && endDate && endDate < startDate) return false;
  if (startDate && todayIsoDate < startDate) return false;
  if (endDate && todayIsoDate > endDate) return false;
  return true;
};

const findAutoSeasonForSession = async (db, launcherQuizPresetId = '') => {
  const todayIsoDate = getTodayLocalIsoDate();
  const all = await getAllFromStore(db, STORE_CLASSROOM_SEASONS);
  const active = all
    .filter((item) => item?.active !== false && isSeasonInDateRange(item, todayIsoDate))
    .sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
  if (!active.length) return null;

  const normalizedPresetId = typeof launcherQuizPresetId === 'string'
    ? launcherQuizPresetId.trim()
    : '';
  if (!normalizedPresetId) {
    const noPresetSeason = active.find((season) => {
      const preset = typeof season?.quizPresetId === 'string' ? season.quizPresetId.trim() : '';
      return !preset;
    });
    return noPresetSeason || null;
  }

  const exactPresetSeason = active.find((season) => {
    const preset = typeof season?.quizPresetId === 'string' ? season.quizPresetId.trim() : '';
    return preset === normalizedPresetId;
  });
  if (exactPresetSeason) return exactPresetSeason;

  const noPresetSeason = active.find((season) => {
    const preset = typeof season?.quizPresetId === 'string' ? season.quizPresetId.trim() : '';
    return !preset;
  });
  return noPresetSeason || null;
};

const upsertSeasonScoreWithDb = async (db, {
  seasonId,
  studentNo,
  category = 'overall',
  score = 0,
  payload = {},
  playedAt = ''
}) => {
  const normalizedSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const normalizedStudentNo = normalizeStudentNo(studentNo);
  const normalizedCategory = normalizeSeasonCategoryId(category);
  if (!normalizedSeasonId) throw new Error('invalid_season_id');
  if (!normalizedStudentNo) throw new Error('invalid_student_no');
  const seasonKey = `season:${normalizedSeasonId}`;
  const season = await getRecordFromStore(db, STORE_CLASSROOM_SEASONS, seasonKey);
  if (!season) throw new Error('season_not_found');
  const id = normalizedCategory === 'overall'
    ? `seasonResult:${normalizedSeasonId}:${String(normalizedStudentNo).padStart(2, '0')}`
    : `seasonResult:${normalizedSeasonId}:${normalizedCategory}:${String(normalizedStudentNo).padStart(2, '0')}`;
  const nowIso = new Date().toISOString();
  const numericScore = Number(score) || 0;
  const tx = db.transaction([STORE_CLASSROOM_SEASON_RESULTS], 'readwrite');
  const store = tx.objectStore(STORE_CLASSROOM_SEASON_RESULTS);
  const existing = await requestToPromise(store.get(id));
  const attemptCount = (Number(existing?.attemptCount) || 0) + 1;
  const totalScore = (Number(existing?.totalScore) || 0) + numericScore;
  const bestScore = Math.max(Number(existing?.bestScore) || 0, numericScore);
  const averageScore = attemptCount > 0
    ? Math.round((totalScore / attemptCount) * 100) / 100
    : 0;
  const next = {
    ...(existing || {}),
    id,
    seasonId: normalizedSeasonId,
    category: normalizedCategory,
    studentNo: normalizedStudentNo,
    attemptCount,
    totalScore,
    bestScore,
    averageScore,
    lastScore: numericScore,
    lastPlayedAt: playedAt ? new Date(playedAt).toISOString() : nowIso,
    lastPayload: (payload && typeof payload === 'object') ? { ...payload } : {},
    updatedAt: nowIso
  };
  if (!next.createdAt) next.createdAt = nowIso;
  store.put(next);
  await txDone(tx);
  return next;
};

const recordSeasonScoresFromQuizSession = async (db, {
  season,
  sessionId,
  launcherQuizPresetId,
  createdAt,
  players
}) => {
  let recordedCount = 0;
  const normalizedSeasonId = typeof season?.seasonId === 'string' ? season.seasonId.trim() : '';
  if (!normalizedSeasonId) return { seasonId: '', recordedCount };
  const policies = normalizeSeasonScorePolicies(season?.scorePolicies);
  const categories = getSeasonEnabledCategories(policies)
    .filter((category) => category.startsWith('basicQuiz'));
  if (!categories.length) categories.push('basicQuizTotalScore');
  const normalizedPlayers = Array.isArray(players) ? players : [];
  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const playerLog = normalizedPlayers[i];
    const studentNo = normalizeStudentNo(playerLog?.settings?.studentId);
    if (!studentNo) continue;
    const totalScore = Number(playerLog?.summary?.totalScore) || 0;
    const correctCount = Number(playerLog?.summary?.correctCount) || 0;
    const totalCount = Number(playerLog?.summary?.totalCount) || 0;
    const playerName = normalizeName(playerLog?.groupName, `${studentNo}번`);
    for (let c = 0; c < categories.length; c += 1) {
      const category = categories[c];
      const score = category === 'basicQuizCorrectCount'
        ? correctCount
        : totalScore;
      await upsertSeasonScoreWithDb(db, {
        seasonId: normalizedSeasonId,
        studentNo,
        category,
        score,
        playedAt: createdAt,
        payload: {
          mode: 'basic-quiz',
          category,
          sessionId,
          launcherQuizPresetId: launcherQuizPresetId || null,
          playerName,
          correctCount,
          totalCount
        }
      });
      recordedCount += 1;
    }
  }
  return { seasonId: normalizedSeasonId, recordedCount, categories };
};

const recordSeasonScoresFromJumpmapSession = async (db, {
  season,
  sessionId,
  launcherQuizPresetId,
  createdAt,
  players
}) => {
  let recordedCount = 0;
  const normalizedSeasonId = typeof season?.seasonId === 'string' ? season.seasonId.trim() : '';
  if (!normalizedSeasonId) return { seasonId: '', recordedCount };
  const policies = normalizeSeasonScorePolicies(season?.scorePolicies);
  const categories = getSeasonEnabledCategories(policies)
    .filter((category) => category.startsWith('jumpmap'));
  if (!categories.length) categories.push('jumpmapBestHeight');
  const normalizedPlayers = Array.isArray(players) ? players : [];
  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const player = normalizedPlayers[i];
    const studentNo = normalizeStudentNo(player?.tag);
    if (!studentNo) continue;
    const bestHeightPx = Math.max(0, Number(player?.bestHeightPx) || 0);
    const quizCorrect = Math.max(0, Number(player?.quizCorrect) || 0);
    const quizAttempts = Math.max(0, Number(player?.quizAttempts) || 0);
    const playerName = normalizeName(player?.name, `${studentNo}번`);
    for (let c = 0; c < categories.length; c += 1) {
      const category = categories[c];
      const score = category === 'jumpmapQuizCorrect'
        ? quizCorrect
        : bestHeightPx;
      await upsertSeasonScoreWithDb(db, {
        seasonId: normalizedSeasonId,
        studentNo,
        category,
        score,
        playedAt: createdAt,
        payload: {
          mode: 'jumpmap',
          category,
          sessionId,
          launcherQuizPresetId: launcherQuizPresetId || null,
          playerName,
          bestHeightPx,
          quizAttempts,
          quizCorrect
        }
      });
      recordedCount += 1;
    }
  }
  return { seasonId: normalizedSeasonId, recordedCount, categories };
};

const recordSeasonScoresFromBattleshipSession = async (db, {
  season,
  sessionId,
  launcherQuizPresetId,
  createdAt,
  players,
  settings
}) => {
  let recordedCount = 0;
  const normalizedSeasonId = typeof season?.seasonId === 'string' ? season.seasonId.trim() : '';
  if (!normalizedSeasonId) return { seasonId: '', recordedCount };
  const policies = normalizeSeasonScorePolicies(season?.scorePolicies);
  const categories = getSeasonEnabledCategories(policies)
    .filter((category) => category.startsWith('battleship'));
  if (!categories.length) categories.push('battleshipKills');
  const normalizedPlayers = Array.isArray(players) ? players : [];
  const survivedSec = Math.max(0, Number(settings?.survivedSec) || 0);
  const maxWaveLevel = Math.max(0, Number(settings?.maxWaveLevel) || 0);
  const endReason = typeof settings?.endReason === 'string' ? settings.endReason : '';

  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const player = normalizedPlayers[i];
    const studentNo = normalizeStudentNo(player?.tag);
    if (!studentNo) continue;
    const kills = Math.max(0, Number(player?.summary?.kills) || 0);
    const quizSolved = Math.max(0, Number(player?.summary?.quizSolved) || 0);
    const shipHp = Math.max(0, Number(player?.summary?.shipHp) || 0);
    const playerName = normalizeName(player?.name, `${studentNo}번`);

    for (let c = 0; c < categories.length; c += 1) {
      const category = categories[c];
      const score = category === 'battleshipSurvivedSec'
        ? survivedSec
        : (category === 'battleshipQuizSolved' ? quizSolved : kills);
      await upsertSeasonScoreWithDb(db, {
        seasonId: normalizedSeasonId,
        studentNo,
        category,
        score,
        playedAt: createdAt,
        payload: {
          mode: 'battleship-defense',
          source: 'battleship-play',
          category,
          sessionId,
          launcherQuizPresetId: launcherQuizPresetId || null,
          playerName,
          kills,
          quizSolved,
          survivedSec,
          maxWaveLevel,
          shipHp,
          endReason
        }
      });
      recordedCount += 1;
    }
  }
  return { seasonId: normalizedSeasonId, recordedCount, categories };
};

const insertWrongAnswers = async (db, sessionId, players, createdAt) => {
  const wrongEntries = [];
  (players || []).forEach((log, playerIndex) => {
    const fallbackName = `사용자${playerIndex + 1}`;
    const playerName = normalizeName(log?.groupName, fallbackName);
    const playerTag = typeof log?.settings?.studentId === 'string' ? log.settings.studentId.trim() : '';
    const playerId = playerIdFromNameAndTag(playerName, playerTag);
    (log?.answers || []).forEach((answer, answerIndex) => {
      if (answer?.correct) return;
      wrongEntries.push({
        id: `wrong:${safeIdSuffix()}:${playerIndex}-${answerIndex}`,
        createdAt,
        sessionId,
        mode: 'basic-quiz',
        playerId,
        playerName,
        playerTag,
        questionId: String(answer?.questionId || ''),
        type: String(answer?.type || ''),
        prompt: String(answer?.prompt || ''),
        question: String(answer?.question || ''),
        selectedChoice: answer?.choice ?? null,
        correctChoice: answer?.answer ?? null,
        choices: Array.isArray(answer?.choices) ? [...answer.choices] : []
      });
    });
  });
  if (!wrongEntries.length) return 0;
  const tx = db.transaction([STORE_WRONGS], 'readwrite');
  const store = tx.objectStore(STORE_WRONGS);
  wrongEntries.forEach((entry) => store.put(entry));
  await txDone(tx);
  return wrongEntries.length;
};

export const saveQuizSessionRecord = async ({ settings, players, source = 'quiz-app' }) => {
  const db = await openDb();
  const createdAt = new Date().toISOString();
  const sessionId = `quiz-session:${safeIdSuffix()}`;
  const normalizedPlayers = Array.isArray(players) ? players : [];
  const questionTypes = settings?.questionTypes || {};
  const questionTypeSummary = Object.entries(questionTypes)
    .filter(([, cfg]) => cfg && cfg.enabled)
    .map(([key, cfg]) => ({
      key,
      count: Number(cfg?.count) || 0
    }));
  const questionIdSet = new Set();
  const questionTypeSet = new Set();
  normalizedPlayers.forEach((log) => {
    (log?.answers || []).forEach((answer) => {
      if (answer?.questionId != null) questionIdSet.add(String(answer.questionId));
      if (answer?.type) questionTypeSet.add(String(answer.type));
    });
  });

  const sessionRecord = {
    id: sessionId,
    mode: 'basic-quiz',
    source,
    createdAt,
    playerCount: normalizedPlayers.length,
    launcherQuizPresetId: settings?.launcherQuizPresetId || null,
    settingsSummary: {
      playerCount: Number(settings?.playerCount) || normalizedPlayers.length || 1,
      quizEndMode: String(settings?.quizEndMode || ''),
      quizTimeLimitSec: Number(settings?.quizTimeLimitSec) || 0,
      timeLimitSec: Number(settings?.timeLimitSec) || 0,
      wrongDelaySec: Number(settings?.wrongDelaySec) || 0,
      rankingEnabled: Boolean(settings?.rankingEnabled),
      questionTypeSummary
    },
    questionSummary: {
      questionIds: Array.from(questionIdSet),
      questionTypes: Array.from(questionTypeSet)
    },
    players: normalizedPlayers.map((log, index) => {
      const name = normalizeName(log?.groupName, `사용자${index + 1}`);
      const playerTag = typeof log?.settings?.studentId === 'string' ? log.settings.studentId.trim() : '';
      return {
        id: playerIdFromNameAndTag(name, playerTag),
        name,
        tag: playerTag,
        summary: {
          totalScore: Number(log?.summary?.totalScore) || 0,
          correctCount: Number(log?.summary?.correctCount) || 0,
          totalCount: Number(log?.summary?.totalCount) || 0,
          accuracy: Number(log?.summary?.accuracy) || 0
        }
      };
    })
  };

  await putSessionRecord(db, sessionRecord);

  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const log = normalizedPlayers[i];
    const playerName = normalizeName(log?.groupName, `사용자${i + 1}`);
    const playerTag = typeof log?.settings?.studentId === 'string' ? log.settings.studentId.trim() : '';
    const playerId = playerIdFromNameAndTag(playerName, playerTag);
    await upsertPlayerRecord(db, playerId, playerName, playerTag, log, createdAt);
  }

  const wrongCount = await insertWrongAnswers(db, sessionId, normalizedPlayers, createdAt);
  let seasonSummary = { seasonId: '', recordedCount: 0 };
  try {
    const activeSeason = await findAutoSeasonForSession(db, settings?.launcherQuizPresetId);
    if (activeSeason?.seasonId) {
      seasonSummary = await recordSeasonScoresFromQuizSession(db, {
        season: activeSeason,
        sessionId,
        launcherQuizPresetId: settings?.launcherQuizPresetId || '',
        createdAt,
        players: normalizedPlayers
      });
    }
  } catch (error) {
    console.warn('[LocalRecords] failed to record classroom season score (quiz)', error);
  }

  return {
    sessionId,
    createdAt,
    playerCount: normalizedPlayers.length,
    wrongCount,
    seasonId: seasonSummary.seasonId || null,
    seasonScoreCount: Number(seasonSummary.recordedCount) || 0
  };
};

export const listRecentQuizSessions = async (limit = 20) => {
  const db = await openDb();
  const tx = db.transaction([STORE_SESSIONS], 'readonly');
  const store = tx.objectStore(STORE_SESSIONS);
  const all = await requestToPromise(store.getAll());
  await txDone(tx);
  return all
    .filter((item) => item?.mode === 'basic-quiz')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
};

export const saveJumpmapSessionRecord = async ({ settings = {}, players = [], source = 'jumpmap-test-runtime', map = null }) => {
  const db = await openDb();
  const createdAt = new Date().toISOString();
  const sessionId = `jumpmap-session:${safeIdSuffix()}`;
  const normalizedPlayers = Array.isArray(players) ? players : [];
  const normalizedMap = (map && typeof map === 'object') ? map : {};

  const sessionRecord = {
    id: sessionId,
    mode: 'jumpmap',
    source,
    createdAt,
    playerCount: normalizedPlayers.length,
    launcherQuizPresetId: settings?.launcherQuizPresetId || null,
    settingsSummary: {
      playerCount: Number(settings?.playerCount) || normalizedPlayers.length || 1,
      moveSpeed: Number(settings?.moveSpeed) || 0,
      jumpHeight: Number(settings?.jumpHeight) || 0,
      jumpSpeed: Number(settings?.jumpSpeed) || 0,
      fallSpeed: Number(settings?.fallSpeed) || 0
    },
    mapSummary: {
      width: Number(normalizedMap.width) || 0,
      height: Number(normalizedMap.height) || 0,
      objectCount: Number(normalizedMap.objectCount) || 0,
      savePointCount: Number(normalizedMap.savePointCount) || 0,
      backgroundImage: normalizedMap.backgroundImage || null
    },
    players: normalizedPlayers.map((player, index) => {
      const name = normalizeName(player?.name, `사용자${index + 1}`);
      const tag = typeof player?.tag === 'string' ? player.tag.trim() : '';
      return {
        id: playerIdFromNameAndTag(name, tag),
        name,
        tag,
        summary: {
          currentHeightPx: Math.max(0, Number(player?.currentHeightPx) || 0),
          bestHeightPx: Math.max(0, Number(player?.bestHeightPx) || 0),
          gauge: Math.max(0, Number(player?.gauge) || 0),
          quizAttempts: Math.max(0, Number(player?.quizAttempts) || 0),
          quizCorrect: Math.max(0, Number(player?.quizCorrect) || 0),
          quizWrong: Math.max(0, Number(player?.quizWrong) || 0),
          jumps: Math.max(0, Number(player?.jumps) || 0),
          doubleJumps: Math.max(0, Number(player?.doubleJumps) || 0)
        }
      };
    })
  };

  await putSessionRecord(db, sessionRecord);

  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const player = normalizedPlayers[i];
    const playerName = normalizeName(player?.name, `사용자${i + 1}`);
    const playerTag = typeof player?.tag === 'string' ? player.tag.trim() : '';
    const playerId = playerIdFromNameAndTag(playerName, playerTag);
    await upsertJumpmapPlayerRecord(db, playerId, playerName, playerTag, player, createdAt);
  }

  let seasonSummary = { seasonId: '', recordedCount: 0 };
  try {
    const activeSeason = await findAutoSeasonForSession(db, settings?.launcherQuizPresetId);
    if (activeSeason?.seasonId) {
      seasonSummary = await recordSeasonScoresFromJumpmapSession(db, {
        season: activeSeason,
        sessionId,
        launcherQuizPresetId: settings?.launcherQuizPresetId || '',
        createdAt,
        players: normalizedPlayers
      });
    }
  } catch (error) {
    console.warn('[LocalRecords] failed to record classroom season score (jumpmap)', error);
  }

  return {
    sessionId,
    createdAt,
    playerCount: normalizedPlayers.length,
    seasonId: seasonSummary.seasonId || null,
    seasonScoreCount: Number(seasonSummary.recordedCount) || 0
  };
};

export const listRecentJumpmapSessions = async (limit = 20) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_SESSIONS);
  return all
    .filter((item) => item?.mode === 'jumpmap')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
};

export const saveBattleshipSessionRecord = async ({ settings = {}, players = [], source = 'battleship-play' }) => {
  const db = await openDb();
  const createdAt = new Date().toISOString();
  const sessionId = `battleship-session:${safeIdSuffix()}`;
  const normalizedPlayers = Array.isArray(players) ? players : [];

  const sessionRecord = {
    id: sessionId,
    mode: 'battleship-defense',
    source,
    createdAt,
    playerCount: normalizedPlayers.length,
    launcherQuizPresetId: settings?.launcherQuizPresetId || null,
    settingsSummary: {
      playerCount: Number(settings?.playerCount) || normalizedPlayers.length || 1,
      shipMaxHp: Math.max(0, Number(settings?.shipMaxHp) || 0),
      survivedSec: Math.max(0, Number(settings?.survivedSec) || 0),
      maxWaveLevel: Math.max(0, Number(settings?.maxWaveLevel) || 0),
      battleshipEndMode: typeof settings?.battleshipEndMode === 'string' ? settings.battleshipEndMode : '',
      battleshipTimeLimitSec: Math.max(0, Number(settings?.battleshipTimeLimitSec) || 0),
      battleshipKillLimit: Math.max(0, Number(settings?.battleshipKillLimit) || 0),
      endReason: typeof settings?.endReason === 'string' ? settings.endReason : ''
    },
    players: normalizedPlayers.map((player, index) => {
      const name = normalizeName(player?.name, `사용자${index + 1}`);
      const tag = typeof player?.tag === 'string' ? player.tag.trim() : '';
      return {
        id: playerIdFromNameAndTag(name, tag),
        name,
        tag,
        summary: {
          kills: Math.max(0, Number(player?.kills) || 0),
          quizSolved: Math.max(0, Number(player?.quizSolved) || 0),
          shipHp: Math.max(0, Number(player?.shipHp) || 0),
          expSpent: Math.max(0, Number(player?.expSpent) || 0),
          goldSpent: Math.max(0, Number(player?.goldSpent) || 0)
        }
      };
    })
  };

  await putSessionRecord(db, sessionRecord);

  for (let i = 0; i < normalizedPlayers.length; i += 1) {
    const player = normalizedPlayers[i];
    const playerName = normalizeName(player?.name, `사용자${i + 1}`);
    const playerTag = typeof player?.tag === 'string' ? player.tag.trim() : '';
    const playerId = playerIdFromNameAndTag(playerName, playerTag);
    await upsertBattleshipPlayerRecord(db, playerId, playerName, playerTag, player, createdAt);
  }

  let seasonSummary = { seasonId: '', recordedCount: 0 };
  try {
    const activeSeason = await findAutoSeasonForSession(db, settings?.launcherQuizPresetId);
    if (activeSeason?.seasonId) {
      seasonSummary = await recordSeasonScoresFromBattleshipSession(db, {
        season: activeSeason,
        sessionId,
        launcherQuizPresetId: settings?.launcherQuizPresetId || '',
        createdAt,
        players: normalizedPlayers,
        settings
      });
    }
  } catch (error) {
    console.warn('[LocalRecords] failed to record classroom season score (battleship)', error);
  }

  return {
    sessionId,
    createdAt,
    playerCount: normalizedPlayers.length,
    seasonId: seasonSummary.seasonId || null,
    seasonScoreCount: Number(seasonSummary.recordedCount) || 0
  };
};

export const listRecentBattleshipSessions = async (limit = 20) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_SESSIONS);
  return all
    .filter((item) => item?.mode === 'battleship-defense')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
};

export const listPlayerRecords = async (limit = 50) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_PLAYERS);
  return all
    .sort((a, b) => {
      const byUpdated = String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
      if (byUpdated !== 0) return byUpdated;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    })
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
};

export const listWrongAnswers = async (limit = 100) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_WRONGS);
  return all
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
    .slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)));
};

export const upsertClassroomStudent = async ({
  studentNo,
  name = '',
  active = true,
  meta = {}
}) => {
  const normalizedStudentNo = normalizeStudentNo(studentNo);
  if (!normalizedStudentNo) {
    throw new Error('invalid_student_no');
  }
  const db = await openDb();
  const id = toStudentId(normalizedStudentNo);
  const nowIso = new Date().toISOString();
  const tx = db.transaction([STORE_CLASSROOM_STUDENTS], 'readwrite');
  const store = tx.objectStore(STORE_CLASSROOM_STUDENTS);
  const existing = await requestToPromise(store.get(id));
  const next = {
    ...(existing || {}),
    id,
    studentNo: normalizedStudentNo,
    name: normalizeName(name, `${normalizedStudentNo}번`),
    active: active !== false,
    meta: (meta && typeof meta === 'object') ? { ...meta } : {},
    updatedAt: nowIso
  };
  if (!next.createdAt) next.createdAt = nowIso;
  store.put(next);
  await txDone(tx);
  return next;
};

export const listClassroomStudents = async ({ includeInactive = true } = {}) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_CLASSROOM_STUDENTS);
  return all
    .filter((item) => includeInactive || item?.active !== false)
    .sort((a, b) => {
      const byNo = (Number(a?.studentNo) || 0) - (Number(b?.studentNo) || 0);
      if (byNo !== 0) return byNo;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
};

export const upsertClassroomAttendanceDay = async ({
  date,
  studentNos = [],
  note = ''
}) => {
  const normalizedDate = normalizeIsoDate(date);
  const normalizedStudentNos = Array.from(
    new Set((Array.isArray(studentNos) ? studentNos : [])
      .map((value) => normalizeStudentNo(value))
      .filter(Boolean))
  ).sort((a, b) => a - b);
  const db = await openDb();
  const id = `attendance:${normalizedDate}`;
  const nowIso = new Date().toISOString();
  const tx = db.transaction([STORE_CLASSROOM_ATTENDANCE], 'readwrite');
  const store = tx.objectStore(STORE_CLASSROOM_ATTENDANCE);
  const existing = await requestToPromise(store.get(id));
  const next = {
    ...(existing || {}),
    id,
    date: normalizedDate,
    studentNos: normalizedStudentNos,
    count: normalizedStudentNos.length,
    note: typeof note === 'string' ? note.trim() : '',
    updatedAt: nowIso
  };
  if (!next.createdAt) next.createdAt = nowIso;
  store.put(next);
  await txDone(tx);
  return next;
};

export const listClassroomAttendanceDays = async (limit = 60) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_CLASSROOM_ATTENDANCE);
  return all
    .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
    .slice(0, Math.max(1, Math.min(366, Number(limit) || 60)));
};

export const summarizeClassroomAttendance = async () => {
  const [students, attendanceDays] = await Promise.all([
    listClassroomStudents({ includeInactive: true }),
    listClassroomAttendanceDays(366)
  ]);
  const attendanceCountByStudentId = new Map();
  attendanceDays.forEach((day) => {
    (day?.studentNos || []).forEach((studentNo) => {
      const normalizedStudentNo = normalizeStudentNo(studentNo);
      if (!normalizedStudentNo) return;
      const id = toStudentId(normalizedStudentNo);
      attendanceCountByStudentId.set(id, (attendanceCountByStudentId.get(id) || 0) + 1);
    });
  });
  return {
    attendanceDayCount: attendanceDays.length,
    students: students.map((student) => ({
      ...student,
      attendanceDayCount: attendanceCountByStudentId.get(student.id) || 0
    }))
  };
};

export const upsertClassroomSeason = async ({
  seasonId,
  name = '',
  active = true,
  quizPresetId = '',
  scorePolicies = null,
  startDate = '',
  endDate = '',
  note = ''
}) => {
  const normalizedSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  if (!normalizedSeasonId) {
    throw new Error('invalid_season_id');
  }
  const db = await openDb();
  const id = `season:${normalizedSeasonId}`;
  const nowIso = new Date().toISOString();
  const tx = db.transaction([STORE_CLASSROOM_SEASONS], 'readwrite');
  const store = tx.objectStore(STORE_CLASSROOM_SEASONS);
  const existing = await requestToPromise(store.get(id));
  const next = {
    ...(existing || {}),
    id,
    seasonId: normalizedSeasonId,
    name: normalizeName(name, normalizedSeasonId),
    active: active !== false,
    quizPresetId: typeof quizPresetId === 'string' ? quizPresetId.trim() : '',
    scorePolicies: normalizeSeasonScorePolicies(scorePolicies || existing?.scorePolicies),
    startDate: normalizeIsoDate(startDate || undefined),
    endDate: endDate ? normalizeIsoDate(endDate) : '',
    note: typeof note === 'string' ? note.trim() : '',
    updatedAt: nowIso
  };
  if (!next.createdAt) next.createdAt = nowIso;
  store.put(next);
  await txDone(tx);
  return next;
};

export const listClassroomSeasons = async ({ includeInactive = true } = {}) => {
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_CLASSROOM_SEASONS);
  return all
    .filter((item) => includeInactive || item?.active !== false)
    .sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
};

export const recordClassroomSeasonScore = async ({
  seasonId,
  studentNo,
  category = 'overall',
  score = 0,
  payload = {},
  playedAt = ''
}) => {
  const db = await openDb();
  return upsertSeasonScoreWithDb(db, {
    seasonId,
    studentNo,
    category,
    score,
    payload,
    playedAt
  });
};

export const listClassroomSeasonLeaderboard = async (seasonId, limit = 50, category = 'overall') => {
  const normalizedSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';
  const normalizedCategory = normalizeSeasonCategoryId(category);
  if (!normalizedSeasonId) return [];
  const db = await openDb();
  const all = await getAllFromStore(db, STORE_CLASSROOM_SEASON_RESULTS);
  const students = await listClassroomStudents({ includeInactive: true });
  const nameByStudentNo = new Map(
    students.map((student) => [Number(student.studentNo) || 0, student.name || ''])
  );
  return all
    .filter((item) => {
      if (String(item?.seasonId || '') !== normalizedSeasonId) return false;
      const itemCategory = normalizeSeasonCategoryId(item?.category);
      return itemCategory === normalizedCategory;
    })
    .sort((a, b) => {
      const byBest = (Number(b?.bestScore) || 0) - (Number(a?.bestScore) || 0);
      if (byBest !== 0) return byBest;
      const byAverage = (Number(b?.averageScore) || 0) - (Number(a?.averageScore) || 0);
      if (byAverage !== 0) return byAverage;
      const byAttempts = (Number(b?.attemptCount) || 0) - (Number(a?.attemptCount) || 0);
      if (byAttempts !== 0) return byAttempts;
      return (Number(a?.studentNo) || 0) - (Number(b?.studentNo) || 0);
    })
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
    .map((entry, index) => ({
      rank: index + 1,
      seasonId: normalizedSeasonId,
      category: normalizedCategory,
      studentNo: Number(entry.studentNo) || 0,
      studentName: nameByStudentNo.get(Number(entry.studentNo) || 0) || `${entry.studentNo || '?'}번`,
      bestScore: Number(entry.bestScore) || 0,
      averageScore: Number(entry.averageScore) || 0,
      attemptCount: Number(entry.attemptCount) || 0,
      totalScore: Number(entry.totalScore) || 0,
      lastScore: Number(entry.lastScore) || 0,
      lastPlayedAt: entry.lastPlayedAt || '',
      lastMode: typeof entry?.lastPayload?.mode === 'string' ? entry.lastPayload.mode : '',
      lastSource: typeof entry?.lastPayload?.source === 'string' ? entry.lastPayload.source : ''
    }));
};
