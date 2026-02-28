import {
  listClassroomStudents,
  summarizeClassroomAttendance,
  listClassroomSeasons,
  listClassroomSeasonLeaderboard,
  listRecentQuizSessions,
  listRecentJumpmapSessions,
  listWrongAnswers
} from '../../shared/local-game-records.js';

const els = {
  status: document.getElementById('status-box'),
  refresh: document.getElementById('refresh-btn'),
  studentSelect: document.getElementById('student-select'),
  periodSelect: document.getElementById('period-select'),
  periodNote: document.getElementById('period-note'),
  summary: document.getElementById('summary-grid'),
  quizList: document.getElementById('quiz-list'),
  jumpmapList: document.getElementById('jumpmap-list'),
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
  wrongRows: [],
  seasonRows: []
};

const CATEGORY_LABELS = {
  basicQuizTotalScore: '기본퀴즈 총점',
  basicQuizCorrectCount: '기본퀴즈 정답 수',
  jumpmapBestHeight: '점프맵 최고 높이(px)',
  jumpmapQuizCorrect: '점프맵 퀴즈 정답 수'
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
    jumpmapQuizCorrect: source.jumpmapQuizCorrect === true
  };
};

const getEnabledCategories = (scorePolicies) => {
  const policies = normalizeScorePolicies(scorePolicies);
  const categories = [];
  if (policies.basicQuizTotalScore) categories.push('basicQuizTotalScore');
  if (policies.basicQuizCorrectCount) categories.push('basicQuizCorrectCount');
  if (policies.jumpmapBestHeight) categories.push('jumpmapBestHeight');
  if (policies.jumpmapQuizCorrect) categories.push('jumpmapQuizCorrect');
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
    els.periodNote.textContent = `${getSelectedPeriodLabel()} 기준으로 퀴즈/점프맵/오답/시즌 기록을 필터링합니다.`;
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

  const rows = [
    ['학생번호', getStudentLabel(no)],
    ['이름', student?.name || `${getStudentLabel(no)} 이름없음`],
    ['조회 기간', getSelectedPeriodLabel()],
    ['활성 상태', student?.active === false ? '비활성' : '활성'],
    ['출석일', `${attendanceDays}일`],
    ['퀴즈 누적', `${Number(quizStats.quizRuns) || 0}판 · 정답률 ${Number(quizStats.accuracy) || 0}%`],
    ['퀴즈 누적점수', `${Number(quizStats.totalScore) || 0}점`],
    ['점프맵 누적', `${Number(jumpmapStats.runs) || 0}판`],
    ['점프맵 최고높이', pxToMeterText(jumpmapStats.bestHeightPx)]
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

const rebuildFilteredRows = async () => {
  const studentNo = state.selectedStudentNo;
  const periodDays = state.selectedPeriodDays;
  writeFiltersToQuery(studentNo, periodDays);

  state.quizRows = [];
  state.jumpmapRows = [];
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
  renderWrongRows();
  renderSeasonRows();

  const student = state.studentsByNo.get(studentNo);
  const studentName = student?.name || getStudentLabel(studentNo);
  setStatus(
    `${studentName}(${studentNo}번) · 기간 ${getSelectedPeriodLabel()} · 퀴즈 ${state.quizRows.length}건 · 점프맵 ${state.jumpmapRows.length}건 · 오답 ${state.wrongRows.length}건 · 시즌 ${state.seasonRows.length}개`
  );
};

const loadAll = async () => {
  setStatus('학생 기록을 불러오는 중...');
  try {
    const [students, attendanceSummary, seasons, quizSessions, jumpmapSessions, wrongs] = await Promise.all([
      listClassroomStudents({ includeInactive: true }),
      summarizeClassroomAttendance(),
      listClassroomSeasons({ includeInactive: true }),
      listRecentQuizSessions(120),
      listRecentJumpmapSessions(120),
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
    playerRecordMap.forEach((value, key) => {
      state.playerStatsByNo.set(key, value);
    });

    state._seasons = Array.isArray(seasons) ? seasons : [];
    state._quizSessions = Array.isArray(quizSessions) ? quizSessions : [];
    state._jumpmapSessions = Array.isArray(jumpmapSessions) ? jumpmapSessions : [];
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
