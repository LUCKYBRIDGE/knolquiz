import {
  listClassroomStudents,
  summarizeClassroomAttendance,
  listClassroomSeasons,
  listClassroomSeasonLeaderboard,
  listRecentQuizSessions,
  listRecentJumpmapSessions,
  listRecentBattleshipSessions,
  listWrongAnswers
} from '../../shared/local-game-records.js';

const els = {
  status: document.getElementById('status-box'),
  refresh: document.getElementById('refresh-btn'),
  exportStudentCsv: document.getElementById('export-student-csv-btn'),
  classroomPageLink: document.getElementById('classroom-page-link'),
  recordsPageLink: document.getElementById('records-page-link'),
  studentSelect: document.getElementById('student-select'),
  periodSelect: document.getElementById('period-select'),
  periodNote: document.getElementById('period-note'),
  summary: document.getElementById('summary-grid'),
  quizList: document.getElementById('quiz-list'),
  jumpmapList: document.getElementById('jumpmap-list'),
  battleshipList: document.getElementById('battleship-list'),
  seasonList: document.getElementById('season-list'),
  wrongList: document.getElementById('wrong-list')
};

const state = {
  selectedStudentNo: null,
  selectedPeriodDays: null,
  studentsByNo: new Map(),
  attendanceByNo: new Map(),
  playerStatsByNo: new Map(),
  quizRows: [],
  jumpmapRows: [],
  battleshipRows: [],
  wrongRows: [],
  seasonRows: []
};

const CATEGORY_LABELS = {
  basicQuizTotalScore: '기본퀴즈 총점',
  basicQuizCorrectCount: '기본퀴즈 정답 수',
  jumpmapBestHeight: '점프맵 최고 높이(px)',
  jumpmapQuizCorrect: '점프맵 퀴즈 정답 수',
  battleshipKills: '거북선 격파 수',
  battleshipSurvivedSec: '거북선 생존 시간(초)',
  battleshipQuizSolved: '거북선 퀴즈 정답 수'
};

const normalizeStudentNo = (raw) => {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1 || value > 50) return null;
  return value;
};

const getStudentLabel = (studentNo) => `${studentNo}번`;

const PERIOD_LABELS = {
  all: '전체',
  30: '최근 30일',
  7: '최근 7일'
};

const setStatus = (message, type = 'normal') => {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.classList.toggle('error', type === 'error');
};

const formatTime = (iso) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { hour12: false });
};

const pxToMeterText = (px) => `${(Math.max(0, Number(px) || 0) / 200).toFixed(2)}m`;

const clearNode = (node) => {
  if (node) node.innerHTML = '';
};

const appendEmpty = (node, text) => {
  if (!node) return;
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  node.appendChild(empty);
};

const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadTextFile = (fileName, text, mimeType) => {
  const normalizedText = String(text || '');
  const withBom = mimeType.includes('text/csv') ? `\ufeff${normalizedText}` : normalizedText;
  const blob = new Blob([withBom], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizePeriodDays = (raw) => {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value || value === 'all') return null;
  const parsed = Math.round(Number(value));
  if (parsed === 7 || parsed === 30) return parsed;
  return null;
};

const getSelectedPeriodLabel = () => {
  if (!state.selectedPeriodDays) return PERIOD_LABELS.all;
  return PERIOD_LABELS[state.selectedPeriodDays] || `${state.selectedPeriodDays}일`;
};

const readFiltersFromQuery = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      studentNo: normalizeStudentNo(params.get('studentNo')),
      periodDays: normalizePeriodDays(params.get('periodDays'))
    };
  } catch (_error) {
    return {
      studentNo: null,
      periodDays: null
    };
  }
};

const writeFiltersToQuery = (studentNo, periodDays) => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (studentNo) params.set('studentNo', String(studentNo));
    else params.delete('studentNo');
    if (periodDays) params.set('periodDays', String(periodDays));
    else params.delete('periodDays');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  } catch (_error) {
    // no-op
  }
};

const buildPageHrefWithFilters = (basePath, studentNo, periodDays) => {
  const params = new URLSearchParams();
  if (studentNo) params.set('studentNo', String(studentNo));
  if (periodDays) params.set('periodDays', String(periodDays));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ''}`;
};

const syncTopNavigationLinks = () => {
  if (els.recordsPageLink) {
    els.recordsPageLink.href = buildPageHrefWithFilters('../records/', state.selectedStudentNo, state.selectedPeriodDays);
  }
  if (els.classroomPageLink) {
    els.classroomPageLink.href = buildPageHrefWithFilters('../classroom/', state.selectedStudentNo, state.selectedPeriodDays);
  }
};

const matchesStudentNoByTag = (tag, studentNo) => normalizeStudentNo(tag) === studentNo;

const isWithinSelectedPeriod = (iso, periodDays) => {
  if (!periodDays) return true;
  const targetDate = new Date(iso || '');
  if (Number.isNaN(targetDate.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  if (diffMs < 0) return true;
  return diffMs <= (periodDays * 24 * 60 * 60 * 1000);
};

const getSeasonLifecycleStatus = (season) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const startDate = typeof season?.startDate === 'string' ? season.startDate.trim() : '';
  const endDate = typeof season?.endDate === 'string' ? season.endDate.trim() : '';
  if (season?.active === false) return '비활성';
  if (startDate && endDate && endDate < startDate) return '기간오류';
  if (startDate && today < startDate) return '예정';
  if (endDate && today > endDate) return '종료';
  return '진행중';
};

const normalizeScorePolicies = (raw) => {
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

const getEnabledCategories = (scorePolicies) => {
  const policies = normalizeScorePolicies(scorePolicies);
  const categories = [];
  if (policies.basicQuizTotalScore) categories.push('basicQuizTotalScore');
  if (policies.basicQuizCorrectCount) categories.push('basicQuizCorrectCount');
  if (policies.jumpmapBestHeight) categories.push('jumpmapBestHeight');
  if (policies.jumpmapQuizCorrect) categories.push('jumpmapQuizCorrect');
  if (policies.battleshipKills) categories.push('battleshipKills');
  if (policies.battleshipSurvivedSec) categories.push('battleshipSurvivedSec');
  if (policies.battleshipQuizSolved) categories.push('battleshipQuizSolved');
  return categories.length ? categories : ['basicQuizTotalScore'];
};

const buildStudentSelect = () => {
  if (!els.studentSelect) return;
  const previous = state.selectedStudentNo;
  els.studentSelect.innerHTML = '';
  for (let no = 1; no <= 50; no += 1) {
    const student = state.studentsByNo.get(no);
    const option = document.createElement('option');
    option.value = String(no);
    option.textContent = student?.name
      ? `${getStudentLabel(no)} · ${student.name}`
      : `${getStudentLabel(no)} · 이름없음`;
    els.studentSelect.appendChild(option);
  }
  const firstNo = previous || 1;
  state.selectedStudentNo = normalizeStudentNo(firstNo) || 1;
  els.studentSelect.value = String(state.selectedStudentNo);
};

const buildPeriodSelect = () => {
  if (!els.periodSelect) return;
  const normalized = normalizePeriodDays(els.periodSelect.value);
  state.selectedPeriodDays = normalized;
  els.periodSelect.value = normalized ? String(normalized) : 'all';
  if (els.periodNote) {
    els.periodNote.textContent = `${getSelectedPeriodLabel()} 기준으로 퀴즈/점프맵/거북선/오답/시즌 기록을 필터링합니다.`;
  }
};

const renderSummary = () => {
  clearNode(els.summary);
  const no = state.selectedStudentNo;
  const student = state.studentsByNo.get(no);
  const attendanceDays = Number(state.attendanceByNo.get(no)) || 0;
  const playerStats = state.playerStatsByNo.get(no) || {};
  const quizStats = playerStats.stats || {};
  const jumpmapStats = playerStats.jumpmapStats || {};
  const battleshipStats = playerStats.battleshipStats || {};

  const rows = [
    ['학생번호', getStudentLabel(no)],
    ['이름', student?.name || `${getStudentLabel(no)} 이름없음`],
    ['조회 기간', getSelectedPeriodLabel()],
    ['활성 상태', student?.active === false ? '비활성' : '활성'],
    ['출석일', `${attendanceDays}일`],
    ['퀴즈 누적', `${Number(quizStats.quizRuns) || 0}판 · 정답률 ${Number(quizStats.accuracy) || 0}%`],
    ['퀴즈 누적점수', `${Number(quizStats.totalScore) || 0}점`],
    ['점프맵 누적', `${Number(jumpmapStats.runs) || 0}판`],
    ['점프맵 최고높이', pxToMeterText(jumpmapStats.bestHeightPx)],
    ['거북선 누적', `${Number(battleshipStats.runs) || 0}판 · 격파 ${Number(battleshipStats.totalKills) || 0}`],
    ['거북선 최장생존', `${Number(battleshipStats.bestSurvivedSec) || 0}초`]
  ];

  rows.forEach(([keyText, valueText]) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const key = document.createElement('div');
    key.className = 'k';
    key.textContent = keyText;
    const value = document.createElement('div');
    value.className = 'v';
    value.textContent = valueText;
    cell.append(key, value);
    els.summary.appendChild(cell);
  });
};

const renderQuizRows = () => {
  clearNode(els.quizList);
  if (!state.quizRows.length) {
    appendEmpty(els.quizList, '해당 학생의 기본 퀴즈 기록이 없습니다.');
    return;
  }
  state.quizRows.slice(0, 20).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('div');
    title.className = 'title-line';
    title.textContent = `${formatTime(row.createdAt)} · ${row.score}점 (${row.correct}/${row.total})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `프리셋 ${row.presetId || '-'} · 유형 ${row.typeText || '-'} · 제한시간 ${row.timeLimitSec}초`;
    item.append(title, meta);
    els.quizList.appendChild(item);
  });
};

const renderJumpmapRows = () => {
  clearNode(els.jumpmapList);
  if (!state.jumpmapRows.length) {
    appendEmpty(els.jumpmapList, '해당 학생의 점프맵 기록이 없습니다.');
    return;
  }
  state.jumpmapRows.slice(0, 20).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('div');
    title.className = 'title-line';
    title.textContent = `${formatTime(row.createdAt)} · 최고 ${pxToMeterText(row.bestHeightPx)} · 퀴즈 ${row.quizCorrect}/${row.quizAttempts}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `종료 ${row.endReason || '-'} · 점프 ${row.jumps}/${row.doubleJumps}(더블)`;
    item.append(title, meta);
    els.jumpmapList.appendChild(item);
  });
};

const renderBattleshipRows = () => {
  clearNode(els.battleshipList);
  if (!state.battleshipRows.length) {
    appendEmpty(els.battleshipList, '해당 학생의 거북선 디펜스 기록이 없습니다.');
    return;
  }
  state.battleshipRows.slice(0, 20).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('div');
    title.className = 'title-line';
    title.textContent = `${formatTime(row.createdAt)} · 격파 ${row.kills} · 생존 ${row.survivedSec}초`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      `웨이브 ${row.maxWaveLevel} · 퀴즈 ${row.quizSolved}정답 · 함선HP ${row.shipHp} · 종료 ${row.endReason || '-'}`;
    item.append(title, meta);
    els.battleshipList.appendChild(item);
  });
};

const renderWrongRows = () => {
  clearNode(els.wrongList);
  if (!state.wrongRows.length) {
    appendEmpty(els.wrongList, '해당 학생의 오답 기록이 없습니다.');
    return;
  }
  state.wrongRows.slice(0, 120).forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('div');
    title.className = 'title-line';
    title.textContent = `${formatTime(row.createdAt)} · ${row.type || 'unknown'} · 문제ID ${row.questionId || '-'}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${row.prompt || row.question || '(문제 텍스트 없음)'} · 선택 ${row.selectedChoice ?? '-'} / 정답 ${row.correctChoice ?? '-'}`;
    item.append(title, meta);
    els.wrongList.appendChild(item);
  });
};

const renderSeasonRows = () => {
  clearNode(els.seasonList);
  if (!state.seasonRows.length) {
    appendEmpty(els.seasonList, '해당 학생의 시즌 점수 기록이 없습니다.');
    return;
  }
  state.seasonRows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const title = document.createElement('div');
    title.className = 'title-line';
    title.textContent = `${row.seasonName} (${row.lifecycle}) · ${row.categoryLabel} · ${row.rank}위`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      `최고 ${row.bestScore} · 평균 ${row.averageScore} · 시도 ${row.attemptCount} · 최근 ${row.lastScore} (${formatTime(row.lastPlayedAt)})`;
    item.append(title, meta);
    els.seasonList.appendChild(item);
  });
};

const buildStudentCsv = () => {
  const studentNo = state.selectedStudentNo;
  const student = state.studentsByNo.get(studentNo);
  const playerStats = state.playerStatsByNo.get(studentNo) || {};
  const quizStats = playerStats.stats || {};
  const jumpmapStats = playerStats.jumpmapStats || {};
  const battleshipStats = playerStats.battleshipStats || {};
  const studentName = student?.name || getStudentLabel(studentNo);
  const periodText = getSelectedPeriodLabel();
  const criteria = `학생:${studentName}(${studentNo}번) / 기간:${periodText}`;
  const rows = [[
    '조회기준',
    '구분',
    '시각',
    '학생번호',
    '이름',
    '값1',
    '값2',
    '값3',
    '값4',
    '값5'
  ]];

  rows.push([
    criteria,
    '요약',
    '',
    studentNo,
    studentName,
    `출석:${Number(state.attendanceByNo.get(studentNo)) || 0}일`,
    `퀴즈누적:${Number(quizStats?.quizRuns) || 0}판`,
    `퀴즈정답률:${Number(quizStats?.accuracy) || 0}%`,
    `점프맵:${Number(jumpmapStats?.runs) || 0}판 / 최고:${pxToMeterText(jumpmapStats?.bestHeightPx)}`,
    `거북선:${Number(battleshipStats?.runs) || 0}판 / 격파:${Number(battleshipStats?.totalKills) || 0}`
  ]);

  state.quizRows.forEach((row) => {
    rows.push([
      criteria,
      '기본 퀴즈',
      row.createdAt || '',
      studentNo,
      studentName,
      `점수:${row.score}`,
      `정답:${row.correct}/${row.total}`,
      `프리셋:${row.presetId || '-'}`,
      `유형:${row.typeText || '-'}`,
      `제한:${row.timeLimitSec}초`
    ]);
  });

  state.jumpmapRows.forEach((row) => {
    rows.push([
      criteria,
      '점프맵',
      row.createdAt || '',
      studentNo,
      studentName,
      `최고높이:${pxToMeterText(row.bestHeightPx)}`,
      `퀴즈:${row.quizCorrect}/${row.quizAttempts}`,
      `점프:${row.jumps}`,
      `더블:${row.doubleJumps}`,
      `종료:${row.endReason || '-'}`
    ]);
  });

  state.battleshipRows.forEach((row) => {
    rows.push([
      criteria,
      '거북선 디펜스',
      row.createdAt || '',
      studentNo,
      studentName,
      `격파:${row.kills}`,
      `생존:${row.survivedSec}초`,
      `웨이브:${row.maxWaveLevel}`,
      `퀴즈:${row.quizSolved}`,
      `종료:${row.endReason || '-'}`
    ]);
  });

  state.wrongRows.forEach((row) => {
    rows.push([
      criteria,
      '오답',
      row.createdAt || '',
      studentNo,
      studentName,
      `유형:${row.type || '-'}`,
      `문제ID:${row.questionId || '-'}`,
      `선택:${row.selectedChoice ?? '-'}`,
      `정답:${row.correctChoice ?? '-'}`,
      row.prompt || row.question || ''
    ]);
  });

  state.seasonRows.forEach((row) => {
    rows.push([
      criteria,
      '시즌 랭킹',
      row.lastPlayedAt || '',
      studentNo,
      studentName,
      `시즌:${row.seasonName}`,
      `상태:${row.lifecycle}`,
      `부문:${row.categoryLabel}`,
      `순위:${row.rank}위`,
      `최고:${row.bestScore} / 평균:${row.averageScore} / 시도:${row.attemptCount}`
    ]);
  });

  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
};

const exportStudentCsv = () => {
  if (!state.selectedStudentNo) {
    setStatus('학생을 먼저 선택하세요.', 'error');
    return;
  }
  const csvText = buildStudentCsv();
  const periodToken = state.selectedPeriodDays ? `${state.selectedPeriodDays}d` : 'all';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const fileName = `student-records-${state.selectedStudentNo}-${periodToken}-${stamp}.csv`;
  downloadTextFile(fileName, csvText, 'text/csv;charset=utf-8;');
  const student = state.studentsByNo.get(state.selectedStudentNo);
  const studentName = student?.name || getStudentLabel(state.selectedStudentNo);
  setStatus(
    `CSV 저장 완료 · ${studentName}(${state.selectedStudentNo}번) · 기간 ${getSelectedPeriodLabel()} · 퀴즈 ${state.quizRows.length}건 · 점프맵 ${state.jumpmapRows.length}건 · 거북선 ${state.battleshipRows.length}건 · 오답 ${state.wrongRows.length}건`
  );
};

const rebuildFilteredRows = async () => {
  const studentNo = state.selectedStudentNo;
  const periodDays = state.selectedPeriodDays;
  writeFiltersToQuery(studentNo, periodDays);
  syncTopNavigationLinks();

  state.quizRows = [];
  state.jumpmapRows = [];
  state.battleshipRows = [];
  state.wrongRows = [];
  state.seasonRows = [];

  const filteredQuizSessions = state._quizSessions
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays))
    .filter((session) => (Array.isArray(session?.players) ? session.players : [])
      .some((player) => matchesStudentNoByTag(player?.tag, studentNo)));
  filteredQuizSessions.forEach((session) => {
    const matched = (Array.isArray(session?.players) ? session.players : [])
      .find((player) => matchesStudentNoByTag(player?.tag, studentNo));
    const questionTypes = Array.isArray(session?.settingsSummary?.questionTypeSummary)
      ? session.settingsSummary.questionTypeSummary
      : [];
    const typeText = questionTypes.length
      ? questionTypes.map((cfg) => `${cfg.key}(${cfg.count})`).join(', ')
      : '';
    state.quizRows.push({
      createdAt: session.createdAt,
      score: Number(matched?.summary?.totalScore) || 0,
      correct: Number(matched?.summary?.correctCount) || 0,
      total: Number(matched?.summary?.totalCount) || 0,
      presetId: session?.launcherQuizPresetId || '',
      timeLimitSec: Number(session?.settingsSummary?.timeLimitSec) || 0,
      typeText
    });
  });

  const filteredJumpmapSessions = state._jumpmapSessions
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays))
    .filter((session) => (Array.isArray(session?.players) ? session.players : [])
      .some((player) => matchesStudentNoByTag(player?.tag, studentNo)));
  filteredJumpmapSessions.forEach((session) => {
    const matched = (Array.isArray(session?.players) ? session.players : [])
      .find((player) => matchesStudentNoByTag(player?.tag, studentNo));
    state.jumpmapRows.push({
      createdAt: session.createdAt,
      bestHeightPx: Number(matched?.summary?.bestHeightPx) || 0,
      quizCorrect: Number(matched?.summary?.quizCorrect) || 0,
      quizAttempts: Number(matched?.summary?.quizAttempts) || 0,
      jumps: Number(matched?.summary?.jumps) || 0,
      doubleJumps: Number(matched?.summary?.doubleJumps) || 0,
      endReason: session?.mapSummary?.endReason || ''
    });
  });

  const filteredBattleshipSessions = state._battleshipSessions
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays))
    .filter((session) => (Array.isArray(session?.players) ? session.players : [])
      .some((player) => matchesStudentNoByTag(player?.tag, studentNo)));
  filteredBattleshipSessions.forEach((session) => {
    const matched = (Array.isArray(session?.players) ? session.players : [])
      .find((player) => matchesStudentNoByTag(player?.tag, studentNo));
    state.battleshipRows.push({
      createdAt: session.createdAt,
      kills: Number(matched?.summary?.kills) || 0,
      quizSolved: Number(matched?.summary?.quizSolved) || 0,
      shipHp: Number(matched?.summary?.shipHp) || 0,
      survivedSec: Math.max(
        0,
        Number(session?.settingsSummary?.survivedSec)
        || Number(session?.settingsSummary?.timeElapsedSec)
        || 0
      ),
      maxWaveLevel: Number(session?.settingsSummary?.maxWaveLevel) || 0,
      endReason:
        session?.settingsSummary?.endReason
        || session?.settingsSummary?.battleshipEndMode
        || ''
    });
  });

  state.wrongRows = state._wrongs
    .filter((wrong) => isWithinSelectedPeriod(wrong?.createdAt, periodDays))
    .filter((wrong) => matchesStudentNoByTag(wrong?.playerTag, studentNo));

  const seasonRows = [];
  const seasonList = Array.isArray(state._seasons) ? state._seasons : [];
  for (let i = 0; i < seasonList.length; i += 1) {
    const season = seasonList[i];
    const categories = getEnabledCategories(season?.scorePolicies);
    for (let c = 0; c < categories.length; c += 1) {
      const category = categories[c];
      const leaderboard = await listClassroomSeasonLeaderboard(String(season?.seasonId || ''), 50, category);
      const found = leaderboard.find((row) => Number(row?.studentNo) === studentNo);
      if (!found) continue;
      if (!isWithinSelectedPeriod(found?.lastPlayedAt, periodDays)) continue;
      seasonRows.push({
        seasonName: String(season?.name || season?.seasonId || '-'),
        lifecycle: getSeasonLifecycleStatus(season),
        categoryLabel: CATEGORY_LABELS[category] || category,
        rank: Number(found.rank) || 0,
        bestScore: Number(found.bestScore) || 0,
        averageScore: Number(found.averageScore) || 0,
        attemptCount: Number(found.attemptCount) || 0,
        lastScore: Number(found.lastScore) || 0,
        lastPlayedAt: found.lastPlayedAt || ''
      });
    }
  }
  state.seasonRows = seasonRows.sort((a, b) => a.rank - b.rank);

  renderSummary();
  renderQuizRows();
  renderJumpmapRows();
  renderBattleshipRows();
  renderWrongRows();
  renderSeasonRows();

  const student = state.studentsByNo.get(studentNo);
  const studentName = student?.name || getStudentLabel(studentNo);
  setStatus(
    `${studentName}(${studentNo}번) · 기간 ${getSelectedPeriodLabel()} · 퀴즈 ${state.quizRows.length}건 · 점프맵 ${state.jumpmapRows.length}건 · 거북선 ${state.battleshipRows.length}건 · 오답 ${state.wrongRows.length}건 · 시즌 ${state.seasonRows.length}개`
  );
};

const loadAll = async () => {
  setStatus('학생 기록을 불러오는 중...');
  try {
    const [students, attendanceSummary, seasons, quizSessions, jumpmapSessions, battleshipSessions, wrongs] = await Promise.all([
      listClassroomStudents({ includeInactive: true }),
      summarizeClassroomAttendance(),
      listClassroomSeasons({ includeInactive: true }),
      listRecentQuizSessions(120),
      listRecentJumpmapSessions(120),
      listRecentBattleshipSessions(120),
      listWrongAnswers(500)
    ]);

    state.studentsByNo.clear();
    (Array.isArray(students) ? students : []).forEach((student) => {
      const no = normalizeStudentNo(student?.studentNo);
      if (!no) return;
      state.studentsByNo.set(no, student);
    });

    state.attendanceByNo.clear();
    (Array.isArray(attendanceSummary?.students) ? attendanceSummary.students : []).forEach((student) => {
      const no = normalizeStudentNo(student?.studentNo);
      if (!no) return;
      state.attendanceByNo.set(no, Number(student?.attendanceDayCount) || 0);
    });

    state.playerStatsByNo.clear();
    (Array.isArray(students) ? students : []).forEach((student) => {
      const no = normalizeStudentNo(student?.studentNo);
      if (!no) return;
      state.playerStatsByNo.set(no, {});
    });

    const playerRecordMap = new Map();
    (Array.isArray(quizSessions) ? quizSessions : []).forEach((session) => {
      (Array.isArray(session?.players) ? session.players : []).forEach((player) => {
        const no = normalizeStudentNo(player?.tag);
        if (!no) return;
        const prev = playerRecordMap.get(no) || {};
        const next = {
          ...prev,
          stats: {
            quizRuns: (Number(prev?.stats?.quizRuns) || 0) + 1,
            totalQuestions: (Number(prev?.stats?.totalQuestions) || 0) + (Number(player?.summary?.totalCount) || 0),
            correctAnswers: (Number(prev?.stats?.correctAnswers) || 0) + (Number(player?.summary?.correctCount) || 0),
            totalScore: (Number(prev?.stats?.totalScore) || 0) + (Number(player?.summary?.totalScore) || 0)
          }
        };
        next.stats.accuracy = next.stats.totalQuestions > 0
          ? Math.round((next.stats.correctAnswers / next.stats.totalQuestions) * 1000) / 10
          : 0;
        playerRecordMap.set(no, next);
      });
    });
    (Array.isArray(jumpmapSessions) ? jumpmapSessions : []).forEach((session) => {
      (Array.isArray(session?.players) ? session.players : []).forEach((player) => {
        const no = normalizeStudentNo(player?.tag);
        if (!no) return;
        const prev = playerRecordMap.get(no) || {};
        const prevJumpmap = prev.jumpmapStats || {};
        const next = {
          ...prev,
          jumpmapStats: {
            runs: (Number(prevJumpmap.runs) || 0) + 1,
            bestHeightPx: Math.max(Number(prevJumpmap.bestHeightPx) || 0, Number(player?.summary?.bestHeightPx) || 0)
          }
        };
        playerRecordMap.set(no, next);
      });
    });
    (Array.isArray(battleshipSessions) ? battleshipSessions : []).forEach((session) => {
      const sessionSurvivedSec = Math.max(
        0,
        Number(session?.settingsSummary?.survivedSec)
        || Number(session?.settingsSummary?.timeElapsedSec)
        || 0
      );
      const sessionWave = Number(session?.settingsSummary?.maxWaveLevel) || 0;
      (Array.isArray(session?.players) ? session.players : []).forEach((player) => {
        const no = normalizeStudentNo(player?.tag);
        if (!no) return;
        const prev = playerRecordMap.get(no) || {};
        const prevBattleship = prev.battleshipStats || {};
        const kills = Number(player?.summary?.kills) || 0;
        const quizSolved = Number(player?.summary?.quizSolved) || 0;
        const next = {
          ...prev,
          battleshipStats: {
            runs: (Number(prevBattleship.runs) || 0) + 1,
            totalKills: (Number(prevBattleship.totalKills) || 0) + kills,
            totalQuizSolved: (Number(prevBattleship.totalQuizSolved) || 0) + quizSolved,
            bestKills: Math.max(Number(prevBattleship.bestKills) || 0, kills),
            bestSurvivedSec: Math.max(Number(prevBattleship.bestSurvivedSec) || 0, sessionSurvivedSec),
            bestWaveLevel: Math.max(Number(prevBattleship.bestWaveLevel) || 0, sessionWave)
          }
        };
        playerRecordMap.set(no, next);
      });
    });
    playerRecordMap.forEach((value, key) => {
      state.playerStatsByNo.set(key, value);
    });

    state._seasons = Array.isArray(seasons) ? seasons : [];
    state._quizSessions = Array.isArray(quizSessions) ? quizSessions : [];
    state._jumpmapSessions = Array.isArray(jumpmapSessions) ? jumpmapSessions : [];
    state._battleshipSessions = Array.isArray(battleshipSessions) ? battleshipSessions : [];
    state._wrongs = Array.isArray(wrongs) ? wrongs : [];

    const queryFilters = readFiltersFromQuery();
    const fallbackNo = normalizeStudentNo(els.studentSelect?.value) || 1;
    state.selectedStudentNo = queryFilters.studentNo || fallbackNo;
    state.selectedPeriodDays = queryFilters.periodDays;
    buildStudentSelect();
    if (els.periodSelect) {
      els.periodSelect.value = state.selectedPeriodDays ? String(state.selectedPeriodDays) : 'all';
    }
    buildPeriodSelect();
    await rebuildFilteredRows();
  } catch (error) {
    console.error('[StudentRecordsPage] load failed', error);
    setStatus('학생 기록을 불러오지 못했습니다. IndexedDB 사용 가능 여부를 확인하세요.', 'error');
    appendEmpty(els.summary, '데이터를 불러오지 못했습니다.');
  }
};

els.refresh?.addEventListener('click', () => {
  loadAll();
});
els.exportStudentCsv?.addEventListener('click', () => {
  exportStudentCsv();
});

els.studentSelect?.addEventListener('change', async () => {
  state.selectedStudentNo = normalizeStudentNo(els.studentSelect.value) || 1;
  await rebuildFilteredRows();
});

els.periodSelect?.addEventListener('change', async () => {
  state.selectedPeriodDays = normalizePeriodDays(els.periodSelect.value);
  buildPeriodSelect();
  await rebuildFilteredRows();
});

loadAll();
