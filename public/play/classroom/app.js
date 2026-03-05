import {
  upsertClassroomStudent,
  listClassroomStudents,
  summarizeClassroomAttendance,
  upsertClassroomSeason,
  listClassroomSeasons,
  recordClassroomSeasonScore,
  listClassroomSeasonLeaderboard
} from '../../shared/local-game-records.js';

const els = {
  status: document.getElementById('status-box'),
  audienceTeacherLink: document.getElementById('audience-teacher-link'),
  audienceStudentLink: document.getElementById('audience-student-link'),
  roleTeacher: document.getElementById('role-teacher-btn'),
  roleStudent: document.getElementById('role-student-btn'),
  roleNote: document.getElementById('role-note'),
  refresh: document.getElementById('refresh-btn'),
  viewStudents: document.getElementById('view-students-btn'),
  viewHall: document.getElementById('view-hall-btn'),
  studentsPane: document.getElementById('students-pane'),
  hallPane: document.getElementById('hall-pane'),
  studentPageLink: document.getElementById('student-page-link'),
  recordsPageLink: document.getElementById('records-page-link'),
  kpiActiveStudents: document.getElementById('kpi-active-students'),
  kpiInactiveStudents: document.getElementById('kpi-inactive-students'),
  kpiAttendanceDays: document.getElementById('kpi-attendance-days'),
  initStudents: document.getElementById('init-students-btn'),
  saveStudents: document.getElementById('save-students-btn'),
  studentList: document.getElementById('student-list'),
  seasonIdInput: document.getElementById('season-id-input'),
  seasonNameInput: document.getElementById('season-name-input'),
  seasonStartDateInput: document.getElementById('season-start-date-input'),
  seasonEndDateInput: document.getElementById('season-end-date-input'),
  seasonPresetSelect: document.getElementById('season-preset-select'),
  seasonActiveInput: document.getElementById('season-active-input'),
  policyQuizTotalScore: document.getElementById('policy-quiz-total-score'),
  policyQuizCorrectCount: document.getElementById('policy-quiz-correct-count'),
  policyJumpmapBestHeight: document.getElementById('policy-jumpmap-best-height'),
  policyJumpmapQuizCorrect: document.getElementById('policy-jumpmap-quiz-correct'),
  policyBattleshipKills: document.getElementById('policy-battleship-kills'),
  policyBattleshipSurvivedSec: document.getElementById('policy-battleship-survived-sec'),
  policyBattleshipQuizSolved: document.getElementById('policy-battleship-quiz-solved'),
  saveSeason: document.getElementById('save-season-btn'),
  archiveEndedSeasons: document.getElementById('archive-ended-seasons-btn'),
  seasonList: document.getElementById('season-list'),
  seasonSelect: document.getElementById('season-select'),
  leaderboardPeriodSelect: document.getElementById('leaderboard-period-select'),
  leaderboardPeriodNote: document.getElementById('leaderboard-period-note'),
  loadLeaderboard: document.getElementById('load-leaderboard-btn'),
  exportLeaderboardCsv: document.getElementById('export-leaderboard-csv-btn'),
  manualStudentNo: document.getElementById('manual-student-no'),
  manualScore: document.getElementById('manual-score'),
  addManualScore: document.getElementById('add-manual-score-btn'),
  leaderboardList: document.getElementById('leaderboard-list')
};

const state = {
  draftStudents: [],
  attendanceDayCount: 0,
  activeStudentCount: 0,
  inactiveStudentCount: 0,
  seasons: [],
  rawLeaderboardSections: [],
  leaderboardSections: [],
  loadedLeaderboardSeasonId: '',
  selectedSeasonId: '',
  roleMode: 'teacher',
  activeView: 'students',
  navStudentNo: null,
  navPeriodDays: null,
  selectedLeaderboardPeriodDays: null
};

const CATEGORY_LABELS = {
  basicQuizTotalScore: '기본퀴즈 총점',
  basicQuizCorrectCount: '기본퀴즈 정답 수',
  jumpmapBestHeight: '점프맵 최고 높이(px)',
  jumpmapQuizCorrect: '점프맵 퀴즈 정답 수',
  battleshipKills: '거북선 격파 수',
  battleshipSurvivedSec: '거북선 생존 시간(초)',
  battleshipQuizSolved: '거북선 퀴즈 정답 수',
  overall: '통합'
};
const CATEGORY_UNITS = Object.freeze({
  basicQuizTotalScore: '점',
  basicQuizCorrectCount: '개',
  jumpmapBestHeight: 'px',
  jumpmapQuizCorrect: '개',
  battleshipKills: '킬',
  battleshipSurvivedSec: '초',
  battleshipQuizSolved: '개',
  overall: '점'
});
const HALL_SHOWCASE_PRIORITY = Object.freeze([
  'battleshipKills',
  'basicQuizTotalScore',
  'jumpmapBestHeight',
  'battleshipSurvivedSec',
  'basicQuizCorrectCount',
  'jumpmapQuizCorrect',
  'battleshipQuizSolved',
  'overall'
]);

const setStatus = (message, type = 'normal') => {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.classList.toggle('error', type === 'error');
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

const getPeriodLabel = (periodDays) => {
  if (!periodDays) return '전체';
  return `최근 ${periodDays}일`;
};

const normalizeRoleMode = (raw) => (String(raw || '').trim().toLowerCase() === 'student' ? 'student' : 'teacher');
const normalizeView = (raw) => (String(raw || '').trim().toLowerCase() === 'hall' ? 'hall' : 'students');

const isWithinSelectedPeriod = (iso, periodDays) => {
  if (!periodDays) return true;
  const targetDate = new Date(iso || '');
  if (Number.isNaN(targetDate.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  if (diffMs < 0) return true;
  return diffMs <= (periodDays * 24 * 60 * 60 * 1000);
};

const readFiltersFromQuery = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      role: normalizeRoleMode(params.get('role')),
      studentNo: normalizeStudentNo(params.get('studentNo')),
      periodDays: normalizePeriodDays(params.get('periodDays')),
      view: normalizeView(params.get('view'))
    };
  } catch (_error) {
    return {
      role: 'teacher',
      studentNo: null,
      periodDays: null,
      view: 'students'
    };
  }
};

const writeFiltersToQuery = (studentNo, periodDays, view = state.activeView, roleMode = state.roleMode) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const role = normalizeRoleMode(roleMode);
    if (role === 'student') params.set('role', 'student');
    else params.delete('role');
    if (studentNo) params.set('studentNo', String(studentNo));
    else params.delete('studentNo');
    if (periodDays) params.set('periodDays', String(periodDays));
    else params.delete('periodDays');
    if (normalizeView(view) === 'hall') params.set('view', 'hall');
    else params.delete('view');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  } catch (_error) {
    // no-op
  }
};

const normalizeSeasonPresetId = (raw) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value;
};

const getTodayLocalIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeIsoDateInput = (raw) => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const getSeasonLifecycleStatus = (season, todayIso = getTodayLocalIsoDate()) => {
  if (season?.active === false) {
    return { code: 'inactive', label: '비활성' };
  }
  const startDate = normalizeIsoDateInput(season?.startDate || '');
  const endDate = normalizeIsoDateInput(season?.endDate || '');
  if (startDate && endDate && endDate < startDate) {
    return { code: 'invalid', label: '기간오류' };
  }
  if (startDate && todayIso < startDate) {
    return { code: 'scheduled', label: '예정' };
  }
  if (endDate && todayIso > endDate) {
    return { code: 'ended', label: '종료' };
  }
  return { code: 'active', label: '진행중' };
};

const SEASON_LIFECYCLE_PRIORITY = Object.freeze({
  active: 0,
  scheduled: 1,
  ended: 2,
  inactive: 3,
  invalid: 4
});

const getSortedSeasonsForDisplay = (seasons) => {
  const list = Array.isArray(seasons) ? seasons.slice() : [];
  return list.sort((a, b) => {
    const aLifecycle = getSeasonLifecycleStatus(a);
    const bLifecycle = getSeasonLifecycleStatus(b);
    const aPriority = Number(SEASON_LIFECYCLE_PRIORITY[aLifecycle.code]);
    const bPriority = Number(SEASON_LIFECYCLE_PRIORITY[bLifecycle.code]);
    if (aPriority !== bPriority) return aPriority - bPriority;
    const byUpdatedAt = String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
    if (byUpdatedAt !== 0) return byUpdatedAt;
    return String(a?.seasonId || '').localeCompare(String(b?.seasonId || ''));
  });
};

const getLatestSeasonId = (seasons) => {
  const list = Array.isArray(seasons) ? seasons.slice() : [];
  if (!list.length) return '';
  const toTime = (season) => {
    const startDate = normalizeIsoDateInput(season?.startDate || '');
    const endDate = normalizeIsoDateInput(season?.endDate || '');
    const updatedAt = typeof season?.updatedAt === 'string' ? season.updatedAt : '';
    if (endDate) return new Date(`${endDate}T23:59:59`).getTime();
    if (startDate) return new Date(`${startDate}T00:00:00`).getTime();
    const parsedUpdatedAt = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
    if (Number.isFinite(parsedUpdatedAt)) return parsedUpdatedAt;
    return 0;
  };
  list.sort((a, b) => toTime(b) - toTime(a));
  return String(list[0]?.seasonId || '');
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

const getEnabledSeasonCategories = (scorePolicies) => {
  const policies = normalizeScorePolicies(scorePolicies);
  const categories = [];
  if (policies.basicQuizTotalScore) categories.push('basicQuizTotalScore');
  if (policies.basicQuizCorrectCount) categories.push('basicQuizCorrectCount');
  if (policies.jumpmapBestHeight) categories.push('jumpmapBestHeight');
  if (policies.jumpmapQuizCorrect) categories.push('jumpmapQuizCorrect');
  if (policies.battleshipKills) categories.push('battleshipKills');
  if (policies.battleshipSurvivedSec) categories.push('battleshipSurvivedSec');
  if (policies.battleshipQuizSolved) categories.push('battleshipQuizSolved');
  if (!categories.length) categories.push('basicQuizTotalScore');
  return categories;
};

const getSeasonById = (seasonId) => (
  state.seasons.find((season) => String(season?.seasonId || '') === String(seasonId || '')) || null
);

const readScorePoliciesFromForm = () => ({
  basicQuizTotalScore: els.policyQuizTotalScore?.checked !== false,
  basicQuizCorrectCount: els.policyQuizCorrectCount?.checked === true,
  jumpmapBestHeight: els.policyJumpmapBestHeight?.checked !== false,
  jumpmapQuizCorrect: els.policyJumpmapQuizCorrect?.checked === true,
  battleshipKills: els.policyBattleshipKills?.checked !== false,
  battleshipSurvivedSec: els.policyBattleshipSurvivedSec?.checked === true,
  battleshipQuizSolved: els.policyBattleshipQuizSolved?.checked === true
});

const applyScorePoliciesToForm = (rawPolicies) => {
  const policies = normalizeScorePolicies(rawPolicies);
  if (els.policyQuizTotalScore) els.policyQuizTotalScore.checked = policies.basicQuizTotalScore;
  if (els.policyQuizCorrectCount) els.policyQuizCorrectCount.checked = policies.basicQuizCorrectCount;
  if (els.policyJumpmapBestHeight) els.policyJumpmapBestHeight.checked = policies.jumpmapBestHeight;
  if (els.policyJumpmapQuizCorrect) els.policyJumpmapQuizCorrect.checked = policies.jumpmapQuizCorrect;
  if (els.policyBattleshipKills) els.policyBattleshipKills.checked = policies.battleshipKills;
  if (els.policyBattleshipSurvivedSec) els.policyBattleshipSurvivedSec.checked = policies.battleshipSurvivedSec;
  if (els.policyBattleshipQuizSolved) els.policyBattleshipQuizSolved.checked = policies.battleshipQuizSolved;
};

const formatDateTime = (raw) => {
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { hour12: false });
};

const formatModeLabel = (rawMode, rawSource) => {
  if (rawMode === 'basic-quiz') return '기본퀴즈';
  if (rawMode === 'jumpmap') return '점프맵';
  if (rawMode === 'battleship-defense') return '거북선 디펜스';
  if (rawSource === 'manual-classroom-page') return '수동기록';
  return rawMode || rawSource || '기타';
};

const buildStudentDetailHref = (studentNo) => {
  const params = new URLSearchParams();
  params.set('studentNo', String(studentNo));
  if (state.navPeriodDays) params.set('periodDays', String(state.navPeriodDays));
  const query = params.toString();
  return `../student/${query ? `?${query}` : ''}`;
};

const syncTopNavigationLinks = () => {
  if (els.studentPageLink) {
    const params = new URLSearchParams();
    if (state.navStudentNo) params.set('studentNo', String(state.navStudentNo));
    if (state.navPeriodDays) params.set('periodDays', String(state.navPeriodDays));
    const query = params.toString();
    els.studentPageLink.href = `../student/${query ? `?${query}` : ''}`;
  }
  if (els.recordsPageLink) {
    const params = new URLSearchParams();
    if (state.navStudentNo) params.set('studentNo', String(state.navStudentNo));
    if (state.navPeriodDays) params.set('periodDays', String(state.navPeriodDays));
    const query = params.toString();
    els.recordsPageLink.href = `../records/${query ? `?${query}` : ''}`;
  }
};

const renderClassroomKpis = () => {
  if (els.kpiActiveStudents) {
    els.kpiActiveStudents.textContent = `${state.activeStudentCount}명`;
  }
  if (els.kpiInactiveStudents) {
    els.kpiInactiveStudents.textContent = `${state.inactiveStudentCount}명`;
  }
  if (els.kpiAttendanceDays) {
    els.kpiAttendanceDays.textContent = `${state.attendanceDayCount}일`;
  }
};

const applyRoleModeUi = () => {
  const isStudentMode = state.roleMode === 'student';
  document.body.classList.toggle('role-student', isStudentMode);
  document.body.classList.toggle('role-teacher', !isStudentMode);

  if (els.roleTeacher) {
    const isActive = !isStudentMode;
    els.roleTeacher.classList.toggle('active', isActive);
    els.roleTeacher.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
  if (els.roleStudent) {
    const isActive = isStudentMode;
    els.roleStudent.classList.toggle('active', isActive);
    els.roleStudent.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
  if (els.roleNote) {
    els.roleNote.textContent = isStudentMode
      ? '학생 모드: 명예의 전당과 개인 기록 확인 중심으로 표시됩니다.'
      : '교사 모드: 학생/시즌 설정과 명예의 전당을 함께 관리합니다. (추후 교사 PW 인증 후 접속 예정)';
  }
  if (els.audienceTeacherLink) {
    els.audienceTeacherLink.classList.toggle('is-active', !isStudentMode);
  }
  if (els.audienceStudentLink) {
    els.audienceStudentLink.classList.toggle('is-active', isStudentMode);
  }
};

const setActiveView = (nextView, { persist = true } = {}) => {
  const requestedView = normalizeView(nextView);
  const view = (state.roleMode === 'student' && requestedView === 'students')
    ? 'hall'
    : requestedView;
  state.activeView = view;

  const panes = [els.studentsPane, els.hallPane];
  panes.forEach((pane) => {
    if (!pane) return;
    pane.classList.toggle('active', pane.dataset.view === view);
  });

  const tabs = [els.viewStudents, els.viewHall];
  tabs.forEach((tab) => {
    if (!tab) return;
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  if (persist) {
    writeFiltersToQuery(state.navStudentNo, state.navPeriodDays, view, state.roleMode);
  }
};

const setRoleMode = (nextRole, { persist = true } = {}) => {
  state.roleMode = normalizeRoleMode(nextRole);
  if (state.roleMode === 'student' && state.activeView === 'students') {
    state.activeView = 'hall';
  }
  applyRoleModeUi();
  setActiveView(state.activeView, { persist: false });
  if (persist) {
    writeFiltersToQuery(state.navStudentNo, state.navPeriodDays, state.activeView, state.roleMode);
  }
};

const filterLeaderboardSectionsByPeriod = (sections, periodDays) => (
  (Array.isArray(sections) ? sections : []).map((section) => ({
    ...section,
    rows: (Array.isArray(section?.rows) ? section.rows : [])
      .filter((row) => isWithinSelectedPeriod(row?.lastPlayedAt, periodDays))
  }))
);

const applyLeaderboardSections = (sections) => {
  state.rawLeaderboardSections = Array.isArray(sections) ? sections : [];
  state.leaderboardSections = filterLeaderboardSectionsByPeriod(
    state.rawLeaderboardSections,
    state.selectedLeaderboardPeriodDays
  );
};

const syncLeaderboardPeriodUi = () => {
  if (els.leaderboardPeriodSelect) {
    els.leaderboardPeriodSelect.value = state.selectedLeaderboardPeriodDays
      ? String(state.selectedLeaderboardPeriodDays)
      : 'all';
  }
  if (els.leaderboardPeriodNote) {
    els.leaderboardPeriodNote.textContent =
      `명예의 전당 / 상세링크 / CSV 모두 ${getPeriodLabel(state.selectedLeaderboardPeriodDays)} 기준을 사용합니다.`;
  }
};

const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const summarizeSeasonPolicies = (season) => {
  const categories = getEnabledSeasonCategories(season?.scorePolicies);
  return categories.map((category) => CATEGORY_LABELS[category] || category).join(', ');
};

const setSeasonPresetSelectValue = (value) => {
  if (!els.seasonPresetSelect) return;
  const normalized = normalizeSeasonPresetId(value);
  const hasOption = Array.from(els.seasonPresetSelect.options)
    .some((opt) => String(opt.value || '') === normalized);
  if (!hasOption && normalized) {
    const option = document.createElement('option');
    option.value = normalized;
    option.textContent = `${normalized} (사용자 지정)`;
    els.seasonPresetSelect.appendChild(option);
  }
  els.seasonPresetSelect.value = normalized;
};

const fillSeasonForm = (season = null) => {
  if (!season) {
    if (els.seasonIdInput) els.seasonIdInput.value = '';
    if (els.seasonNameInput) els.seasonNameInput.value = '';
    if (els.seasonStartDateInput) els.seasonStartDateInput.value = getTodayLocalIsoDate();
    if (els.seasonEndDateInput) els.seasonEndDateInput.value = '';
    setSeasonPresetSelectValue('');
    if (els.seasonActiveInput) els.seasonActiveInput.value = 'true';
    applyScorePoliciesToForm(null);
    return;
  }
  if (els.seasonIdInput) els.seasonIdInput.value = String(season.seasonId || '').trim();
  if (els.seasonNameInput) els.seasonNameInput.value = String(season.name || '').trim();
  if (els.seasonStartDateInput) els.seasonStartDateInput.value = normalizeIsoDateInput(season.startDate) || getTodayLocalIsoDate();
  if (els.seasonEndDateInput) els.seasonEndDateInput.value = normalizeIsoDateInput(season.endDate) || '';
  setSeasonPresetSelectValue(season.quizPresetId || '');
  if (els.seasonActiveInput) els.seasonActiveInput.value = season.active === false ? 'false' : 'true';
  applyScorePoliciesToForm(season.scorePolicies);
};

const buildDraftStudents = (loadedStudents = []) => {
  const byNo = new Map(
    loadedStudents
      .map((row) => ({ ...row, studentNo: normalizeStudentNo(row?.studentNo) }))
      .filter((row) => row.studentNo)
      .map((row) => [row.studentNo, row])
  );
  const next = [];
  for (let no = 1; no <= 50; no += 1) {
    const row = byNo.get(no);
    next.push({
      studentNo: no,
      name: row?.name || `${no}번`,
      active: row ? row.active !== false : true,
      attendanceDayCount: Math.max(0, Number(row?.attendanceDayCount) || 0),
      exists: Boolean(row)
    });
  }
  return next;
};

const renderStudents = () => {
  if (!els.studentList) return;
  els.studentList.innerHTML = '';
  if (!state.draftStudents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '학생 정보가 없습니다.';
    els.studentList.appendChild(empty);
    return;
  }
  state.draftStudents.forEach((student) => {
    const row = document.createElement('div');
    row.className = `student-row${student.exists ? '' : ' new'}`;
    row.dataset.studentNo = String(student.studentNo);

    const no = document.createElement('div');
    no.className = 'student-no';
    no.textContent = `${student.studentNo}번`;

    const nameInput = document.createElement('input');
    nameInput.className = 'student-name-input';
    nameInput.type = 'text';
    nameInput.maxLength = 30;
    nameInput.value = student.name;
    nameInput.placeholder = `${student.studentNo}번`;
    nameInput.addEventListener('input', () => {
      student.name = nameInput.value;
    });

    const activeWrap = document.createElement('label');
    activeWrap.className = 'student-check';
    const activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = student.active !== false;
    activeInput.addEventListener('change', () => {
      student.active = activeInput.checked;
    });
    const activeText = document.createElement('span');
    activeText.textContent = '활성';
    activeWrap.append(activeInput, activeText);

    const count = document.createElement('div');
    count.className = 'student-count';
    count.textContent = `출석 ${student.attendanceDayCount}일`;

    const recordLink = document.createElement('a');
    recordLink.className = 'btn student-link-btn';
    recordLink.href = buildStudentDetailHref(student.studentNo);
    recordLink.textContent = '기록';
    recordLink.title = `${student.studentNo}번 상세 기록 보기`;

    row.append(no, nameInput, activeWrap, count, recordLink);
    els.studentList.appendChild(row);
  });
};

const renderSeasons = () => {
  const displaySeasons = getSortedSeasonsForDisplay(state.seasons);
  if (els.seasonList) {
    els.seasonList.innerHTML = '';
    if (!displaySeasons.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '저장된 시즌이 없습니다.';
      els.seasonList.appendChild(empty);
    } else {
      displaySeasons.forEach((season) => {
        const lifecycle = getSeasonLifecycleStatus(season);
        const item = document.createElement('div');
        item.className = 'item';
        item.style.cursor = 'pointer';
        item.title = '클릭해서 시즌 편집 폼으로 불러오기';
        const name = document.createElement('div');
        name.className = 'name';
        const badge = document.createElement('span');
        badge.className = `season-badge ${lifecycle.code}`;
        badge.textContent = lifecycle.label;
        const title = document.createElement('span');
        title.textContent = season.name || season.seasonId;
        name.append(badge, title);
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `ID: ${season.seasonId} · 기간: ${season.startDate || '-'} ~ ${season.endDate || '무기한'} · 프리셋: ${season.quizPresetId || '-'} · 부문: ${summarizeSeasonPolicies(season)}`;
        item.append(name, meta);
        item.addEventListener('click', () => {
          fillSeasonForm(season);
          setStatus(`시즌 편집 로드: ${season.seasonId}`);
        });
        els.seasonList.appendChild(item);
      });
    }
  }

  if (els.seasonSelect) {
    const previous = state.selectedSeasonId;
    els.seasonSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '시즌 선택';
    els.seasonSelect.appendChild(defaultOption);
    displaySeasons.forEach((season) => {
      const lifecycle = getSeasonLifecycleStatus(season);
      const option = document.createElement('option');
      option.value = season.seasonId || '';
      option.textContent = `${season.name || season.seasonId} (${lifecycle.label})`;
      els.seasonSelect.appendChild(option);
    });
    const runningSeason = displaySeasons.find((season) => getSeasonLifecycleStatus(season).code === 'active')?.seasonId || '';
    const latestSeason = getLatestSeasonId(displaySeasons);
    const firstVisibleSeason = displaySeasons[0]?.seasonId || '';
    state.selectedSeasonId = displaySeasons.some((season) => season.seasonId === previous)
      ? previous
      : (latestSeason || runningSeason || firstVisibleSeason);
    els.seasonSelect.value = state.selectedSeasonId || '';
  }
};

const getHallRankBadgeText = (rank) => {
  if (rank === 1) return '1위';
  if (rank === 2) return '2위';
  if (rank === 3) return '3위';
  return `${rank}위`;
};

const getHallSectionUnit = (section) => CATEGORY_UNITS[section?.category] || '점';

const formatHallMetric = (value, unit = '점') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `0${unit}`;
  const normalized = Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
  return `${normalized}${unit}`;
};

const formatTime = (raw) => {
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const pickShowcaseSection = (sections) => {
  const list = Array.isArray(sections) ? sections.filter((section) => Array.isArray(section?.rows) && section.rows.length) : [];
  if (!list.length) return null;
  for (let i = 0; i < HALL_SHOWCASE_PRIORITY.length; i += 1) {
    const category = HALL_SHOWCASE_PRIORITY[i];
    const matched = list.find((section) => section.category === category);
    if (matched) return matched;
  }
  return list[0];
};

const buildHallTop3Card = (row, unit) => {
  const card = document.createElement('article');
  card.className = `hall-podium-card rank-${Math.min(Math.max(Number(row.rank) || 3, 1), 3)}`;

  const rank = document.createElement('div');
  rank.className = 'hall-podium-rank';
  rank.textContent = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : '🥉';

  const name = document.createElement('div');
  name.className = 'hall-podium-name';
  name.textContent = `${row.studentName} (${row.studentNo}번)`;
  name.title = `${row.studentName} (${row.studentNo}번)`;

  const score = document.createElement('div');
  score.className = 'hall-podium-score';
  score.textContent = `최고 ${formatHallMetric(row.bestScore, unit)}`;

  const detail = document.createElement('a');
  detail.className = 'detail-link';
  detail.href = buildStudentDetailHref(row.studentNo);
  detail.textContent = '상세기록';
  detail.title = `${row.studentNo}번 상세 기록 보기`;

  card.append(rank, name, score, detail);
  return card;
};

const buildHallSimpleRow = (row, unit) => {
  const item = document.createElement('article');
  item.className = 'hall-row-simple';

  const rank = document.createElement('div');
  rank.className = 'hall-row-rank';
  rank.textContent = getHallRankBadgeText(row.rank);

  const name = document.createElement('div');
  name.className = 'hall-row-name';
  name.textContent = `${row.studentName} (${row.studentNo}번)`;
  name.title = `${row.studentName} (${row.studentNo}번)`;

  const score = document.createElement('div');
  score.className = 'hall-row-score';
  score.textContent = formatHallMetric(row.bestScore, unit);

  const detail = document.createElement('a');
  detail.className = 'detail-link';
  detail.href = buildStudentDetailHref(row.studentNo);
  detail.textContent = '상세';
  detail.title = `${row.studentNo}번 상세 기록 보기`;

  const time = document.createElement('div');
  time.className = 'hall-row-time';
  time.textContent = `최근 ${formatTime(row.lastPlayedAt)}`;
  time.style.gridColumn = '1 / -1';

  item.append(rank, name, score, detail, time);
  return item;
};

const buildHallSectionBoard = (section, { title = '' } = {}) => {
  const sectionWrap = document.createElement('section');
  sectionWrap.className = 'hall-section';

  const header = document.createElement('div');
  header.className = 'hall-section-header';

  const headerTitle = document.createElement('div');
  headerTitle.className = 'hall-section-title';
  headerTitle.textContent = title || section.label;

  const headerCount = document.createElement('div');
  headerCount.className = 'hall-section-count';
  headerCount.textContent = `참가 ${section.rows.length}명`;
  header.append(headerTitle, headerCount);
  sectionWrap.appendChild(header);

  if (!section.rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = `${section.label} 데이터가 없습니다.`;
    sectionWrap.appendChild(empty);
    return sectionWrap;
  }

  const unit = getHallSectionUnit(section);
  const leader = section.rows[0];
  const hero = document.createElement('article');
  hero.className = 'hall-hero';

  const heroTitle = document.createElement('div');
  heroTitle.className = 'hall-hero-title';
  heroTitle.textContent = '이번 시즌 챔피언';

  const heroChampion = document.createElement('div');
  heroChampion.className = 'hall-hero-champion';
  heroChampion.textContent = `${leader.studentName} (${leader.studentNo}번)`;

  const heroScore = document.createElement('div');
  heroScore.className = 'hall-hero-score';
  heroScore.textContent = `최고 기록 ${formatHallMetric(leader.bestScore, unit)}`;

  const heroChallenge = document.createElement('div');
  heroChallenge.className = 'hall-hero-challenge';
  const challenger = section.rows[1];
  if (challenger) {
    const gap = Math.max(0, Number(leader.bestScore || 0) - Number(challenger.bestScore || 0));
    heroChallenge.textContent = `2위와 격차 ${formatHallMetric(gap, unit)}`;
  } else {
    heroChallenge.textContent = '다음 도전자 기록이 들어오면 격차를 보여줍니다.';
  }

  const heroGoal = document.createElement('div');
  heroGoal.className = 'hall-hero-goal';
  heroGoal.textContent = `조회 기준: ${getPeriodLabel(state.selectedLeaderboardPeriodDays)}`;

  const heroMeta = document.createElement('div');
  heroMeta.className = 'hall-hero-meta';
  const lastPlayed = document.createElement('span');
  lastPlayed.className = 'hall-hero-pill';
  lastPlayed.textContent = `최근 플레이 ${formatTime(leader.lastPlayedAt)}`;
  const unitMeta = document.createElement('span');
  unitMeta.className = 'hall-hero-pill';
  unitMeta.textContent = `기록 단위 ${unit}`;
  heroMeta.append(lastPlayed, unitMeta);

  hero.append(heroTitle, heroChampion, heroScore, heroChallenge, heroGoal, heroMeta);
  sectionWrap.appendChild(hero);

  const top3Wrap = document.createElement('div');
  top3Wrap.className = 'hall-podium';
  section.rows.slice(0, 3).forEach((row) => {
    top3Wrap.appendChild(buildHallTop3Card(row, unit));
  });
  sectionWrap.appendChild(top3Wrap);

  const list = document.createElement('div');
  list.className = 'hall-list';
  const topRows = section.rows.slice(3, 10);
  topRows.forEach((row) => {
    list.appendChild(buildHallSimpleRow(row, unit));
  });
  if (topRows.length) sectionWrap.appendChild(list);

  if (section.rows.length > 10) {
    const more = document.createElement('div');
    more.className = 'hall-more-note';
    more.textContent = `총 ${section.rows.length}명 중 상위 10명 표시`;
    sectionWrap.appendChild(more);
  }
  return sectionWrap;
};

const buildSecondarySectionPanel = (sections) => {
  const valid = sections.filter((section) => Array.isArray(section?.rows) && section.rows.length);
  if (!valid.length) return null;
  const wrapper = document.createElement('details');
  wrapper.className = 'hall-secondary';

  const summary = document.createElement('summary');
  summary.textContent = `다른 부문 ${valid.length}개 보기`;
  wrapper.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'hall-secondary-list';
  valid.forEach((section) => {
    const item = document.createElement('article');
    item.className = 'hall-secondary-item';
    const title = document.createElement('div');
    title.className = 'hall-secondary-title';
    title.textContent = section.label;
    const top = section.rows[0];
    const unit = getHallSectionUnit(section);
    const topMeta = document.createElement('div');
    topMeta.className = 'hall-secondary-top';
    topMeta.textContent = top
      ? `1위 ${top.studentName} (${top.studentNo}번) · ${formatHallMetric(top.bestScore, unit)}`
      : '아직 기록 없음';
    item.append(title, topMeta);
    list.appendChild(item);
  });
  wrapper.appendChild(list);
  return wrapper;
};

const renderLeaderboard = () => {
  if (!els.leaderboardList) return;
  els.leaderboardList.innerHTML = '';
  const showcaseSection = pickShowcaseSection(state.leaderboardSections);
  const currentSeason = getSeasonById(state.selectedSeasonId || state.loadedLeaderboardSeasonId);

  const seasonSummary = document.createElement('section');
  seasonSummary.className = 'hall-summary';
  const seasonTitle = document.createElement('div');
  seasonTitle.className = 'hall-summary-title';
  seasonTitle.textContent = currentSeason
    ? `${currentSeason.name || currentSeason.seasonId} 시즌`
    : '시즌을 선택하세요';
  const seasonMeta = document.createElement('div');
  seasonMeta.className = 'hall-summary-meta';
  if (currentSeason) {
    const lifecycle = getSeasonLifecycleStatus(currentSeason);
    seasonMeta.textContent = `상태 ${lifecycle.label} · 조회 ${getPeriodLabel(state.selectedLeaderboardPeriodDays)} · 기본 표시: 대표 부문`;
  } else {
    seasonMeta.textContent = '왼쪽 설정에서 시즌을 선택하면 랭킹이 표시됩니다.';
  }
  seasonSummary.append(seasonTitle, seasonMeta);
  els.leaderboardList.appendChild(seasonSummary);

  if (currentSeason) {
    const selectedSection = document.createElement('div');
    selectedSection.className = 'note';
    selectedSection.textContent = '대표 부문은 시즌 점수 정책 우선순위로 자동 선정됩니다.';
    els.leaderboardList.appendChild(selectedSection);
  }
  if (!showcaseSection) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = `명예의 전당 데이터가 없습니다. (${getPeriodLabel(state.selectedLeaderboardPeriodDays)} 기준)`;
    els.leaderboardList.appendChild(empty);
    return;
  }
  const showcaseWrap = document.createElement('section');
  showcaseWrap.className = 'leaderboard-showcase';
  const mainBoard = buildHallSectionBoard(showcaseSection, {
    title: `대표 부문 · ${showcaseSection.label}`
  });
  showcaseWrap.appendChild(mainBoard);
  els.leaderboardList.appendChild(showcaseWrap);

  const secondaryPanel = buildSecondarySectionPanel(
    state.leaderboardSections.filter((section) => section.category !== showcaseSection.category)
  );
  if (secondaryPanel) {
    els.leaderboardList.appendChild(secondaryPanel);
  }
};

const fetchLeaderboardSections = async (seasonId) => {
  const season = getSeasonById(seasonId);
  const categories = getEnabledSeasonCategories(season?.scorePolicies);
  return Promise.all(
    categories.map(async (category) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      rows: await listClassroomSeasonLeaderboard(seasonId, 50, category)
    }))
  );
};

const buildLeaderboardCsv = (seasonId, seasonName, seasonStatusLabel, sections) => {
  const rows = [[
    '시즌ID',
    '시즌명',
    '시즌상태',
    '부문코드',
    '부문명',
    '순위',
    '학생번호',
    '학생이름',
    '최고점',
    '평균점',
    '누적점수',
    '시도횟수',
    '최근점수',
    '최근모드',
    '최근소스',
    '최근기록시각'
  ]];
  sections.forEach((section) => {
    section.rows.forEach((row) => {
      rows.push([
        seasonId,
        seasonName,
        seasonStatusLabel,
        section.category,
        section.label,
        row.rank,
        row.studentNo,
        row.studentName,
        row.bestScore,
        row.averageScore,
        row.totalScore,
        row.attemptCount,
        row.lastScore,
        formatModeLabel(row.lastMode, row.lastSource),
        row.lastSource || '',
        row.lastPlayedAt || ''
      ]);
    });
  });
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
};

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

const exportLeaderboardCsv = async () => {
  const seasonId = String(els.seasonSelect?.value || state.selectedSeasonId || '').trim();
  state.selectedSeasonId = seasonId;
  if (!seasonId) {
    setStatus('CSV 내보내기 전에 시즌을 선택하세요.', 'error');
    return;
  }
  setStatus('리더보드 CSV를 생성하는 중...');
  try {
    const season = getSeasonById(seasonId);
    const seasonName = String(season?.name || seasonId);
    const seasonStatus = getSeasonLifecycleStatus(season);
    const rawSections = (state.loadedLeaderboardSeasonId === seasonId && state.rawLeaderboardSections.length)
      ? state.rawLeaderboardSections
      : await fetchLeaderboardSections(seasonId);
    state.loadedLeaderboardSeasonId = seasonId;
    applyLeaderboardSections(rawSections);
    renderLeaderboard();

    const csvText = buildLeaderboardCsv(
      seasonId,
      seasonName,
      seasonStatus.label,
      state.leaderboardSections
    );
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const periodToken = state.selectedLeaderboardPeriodDays ? `${state.selectedLeaderboardPeriodDays}d` : 'all';
    const fileName = `classroom-leaderboard-${seasonId}-${periodToken}-${stamp}.csv`;
    downloadTextFile(fileName, csvText, 'text/csv;charset=utf-8;');
    setStatus(
      `리더보드 CSV 저장 완료 · 시즌 ${seasonId} · 기간 ${getPeriodLabel(state.selectedLeaderboardPeriodDays)} · 부문 ${state.leaderboardSections.length}개`
    );
  } catch (error) {
    console.error('[ClassroomPage] export leaderboard csv failed', error);
    setStatus('리더보드 CSV 생성에 실패했습니다.', 'error');
  }
};

const reloadData = async () => {
  setStatus('학급 데이터를 불러오는 중...');
  try {
    const [attendanceSummary, seasons] = await Promise.all([
      summarizeClassroomAttendance(),
      listClassroomSeasons({ includeInactive: true })
    ]);
    state.draftStudents = buildDraftStudents(attendanceSummary.students || []);
    state.attendanceDayCount = Math.max(0, Number(attendanceSummary.attendanceDayCount) || 0);
    state.activeStudentCount = state.draftStudents.filter((row) => row.active !== false).length;
    state.inactiveStudentCount = Math.max(0, state.draftStudents.length - state.activeStudentCount);
    state.seasons = Array.isArray(seasons) ? seasons : [];
    const lifecycleCounts = {
      scheduled: 0,
      active: 0,
      ended: 0,
      inactive: 0,
      invalid: 0
    };
    state.seasons.forEach((season) => {
      const code = getSeasonLifecycleStatus(season).code;
      if (Object.prototype.hasOwnProperty.call(lifecycleCounts, code)) {
        lifecycleCounts[code] += 1;
      }
    });
    state.rawLeaderboardSections = [];
    state.leaderboardSections = [];
    state.loadedLeaderboardSeasonId = '';
    renderStudents();
    renderClassroomKpis();
    renderSeasons();
    syncLeaderboardPeriodUi();
    if (state.selectedSeasonId) {
      await loadLeaderboard({ silent: true });
    } else {
      renderLeaderboard();
    }
    setStatus(`불러오기 완료 · 학생 ${state.draftStudents.length}명 · 출석일 ${state.attendanceDayCount}일 · 시즌 ${state.seasons.length}개 (진행중 ${lifecycleCounts.active}, 예정 ${lifecycleCounts.scheduled}, 종료 ${lifecycleCounts.ended}, 비활성 ${lifecycleCounts.inactive})`);
  } catch (error) {
    console.error('[ClassroomPage] load failed', error);
    setStatus('학급 데이터를 불러오지 못했습니다. IndexedDB 사용 가능 여부를 확인하세요.', 'error');
  }
};

const saveStudents = async ({ initializeDefaults = false } = {}) => {
  const queue = state.draftStudents.length ? state.draftStudents : buildDraftStudents([]);
  setStatus(initializeDefaults ? '학생 1~50 기본 데이터를 생성 중...' : '학생 정보를 저장 중...');
  try {
    for (const student of queue) {
      const fallbackName = `${student.studentNo}번`;
      const name = initializeDefaults
        ? (student.exists ? (String(student.name || '').trim() || fallbackName) : fallbackName)
        : (String(student.name || '').trim() || fallbackName);
      await upsertClassroomStudent({
        studentNo: student.studentNo,
        name,
        active: student.active !== false
      });
    }
    await reloadData();
    setStatus(initializeDefaults ? '학생 1~50 기본 데이터를 생성했습니다.' : '학생 정보를 저장했습니다.');
  } catch (error) {
    console.error('[ClassroomPage] save students failed', error);
    setStatus('학생 정보를 저장하지 못했습니다.', 'error');
  }
};

const saveSeason = async () => {
  const seasonId = String(els.seasonIdInput?.value || '').trim();
  const name = String(els.seasonNameInput?.value || '').trim();
  const startDate = normalizeIsoDateInput(els.seasonStartDateInput?.value || '') || getTodayLocalIsoDate();
  const endDate = normalizeIsoDateInput(els.seasonEndDateInput?.value || '');
  const quizPresetId = normalizeSeasonPresetId(els.seasonPresetSelect?.value || '');
  const active = String(els.seasonActiveInput?.value || 'true') !== 'false';
  const scorePolicies = readScorePoliciesFromForm();
  if (!seasonId) {
    setStatus('시즌 ID를 입력하세요.', 'error');
    return;
  }
  if (startDate && endDate && endDate < startDate) {
    setStatus('시즌 종료일은 시작일보다 같거나 늦어야 합니다.', 'error');
    return;
  }
  setStatus('시즌 정보를 저장 중...');
  try {
    await upsertClassroomSeason({
      seasonId,
      name: name || seasonId,
      active,
      quizPresetId,
      scorePolicies,
      startDate,
      endDate
    });
    await reloadData();
    fillSeasonForm(null);
    setStatus('시즌 정보를 저장했습니다.');
  } catch (error) {
    console.error('[ClassroomPage] save season failed', error);
    setStatus('시즌 저장에 실패했습니다.', 'error');
  }
};

const archiveEndedSeasons = async () => {
  const targets = state.seasons.filter((season) =>
    season?.active !== false && getSeasonLifecycleStatus(season).code === 'ended'
  );
  if (!targets.length) {
    setStatus('비활성화할 종료 시즌이 없습니다.');
    return;
  }
  setStatus(`종료 시즌 ${targets.length}개를 비활성화하는 중...`);
  try {
    for (let i = 0; i < targets.length; i += 1) {
      const season = targets[i];
      await upsertClassroomSeason({
        seasonId: String(season.seasonId || '').trim(),
        name: String(season.name || season.seasonId || '').trim(),
        active: false,
        quizPresetId: normalizeSeasonPresetId(season.quizPresetId || ''),
        scorePolicies: normalizeScorePolicies(season.scorePolicies),
        startDate: normalizeIsoDateInput(season.startDate || '') || getTodayLocalIsoDate(),
        endDate: normalizeIsoDateInput(season.endDate || ''),
        note: typeof season?.note === 'string' ? season.note : ''
      });
    }
    await reloadData();
    setStatus(`종료 시즌 ${targets.length}개를 비활성화했습니다.`);
  } catch (error) {
    console.error('[ClassroomPage] archive ended seasons failed', error);
    setStatus('종료 시즌 비활성화에 실패했습니다.', 'error');
  }
};

const loadLeaderboard = async ({ silent = false } = {}) => {
  const seasonId = String(els.seasonSelect?.value || state.selectedSeasonId || '').trim();
  state.selectedSeasonId = seasonId;
  if (!seasonId) {
    state.rawLeaderboardSections = [];
    state.leaderboardSections = [];
    state.loadedLeaderboardSeasonId = '';
    renderLeaderboard();
    if (!silent) {
      setStatus('명예의 전당 시즌을 선택하세요.', 'error');
    }
    return;
  }
  if (!silent) {
    setStatus('명예의 전당을 불러오는 중...');
  }
  try {
    const sectionRows = await fetchLeaderboardSections(seasonId);
    state.loadedLeaderboardSeasonId = seasonId;
    applyLeaderboardSections(sectionRows);
    renderLeaderboard();
    const totalRows = state.leaderboardSections.reduce((sum, section) => sum + section.rows.length, 0);
    if (!silent) {
      setStatus(
        `명예의 전당 갱신 완료 · 시즌 ${seasonId} · 기간 ${getPeriodLabel(state.selectedLeaderboardPeriodDays)} · 부문 ${state.leaderboardSections.length}개 · 항목 ${totalRows}개`
      );
    }
  } catch (error) {
    console.error('[ClassroomPage] load leaderboard failed', error);
    if (!silent) {
      setStatus('명예의 전당을 불러오지 못했습니다.', 'error');
    }
  }
};

const addManualScore = async () => {
  const seasonId = String(els.seasonSelect?.value || state.selectedSeasonId || '').trim();
  const studentNo = normalizeStudentNo(els.manualStudentNo?.value);
  const score = Math.round(Number(els.manualScore?.value) || 0);
  const season = getSeasonById(seasonId);
  const categories = getEnabledSeasonCategories(season?.scorePolicies);
  if (!seasonId) {
    setStatus('먼저 시즌을 선택하세요.', 'error');
    return;
  }
  if (!studentNo) {
    setStatus('학번(1~50)을 확인하세요.', 'error');
    return;
  }
  setStatus('수동 점수를 기록 중...');
  try {
    for (let i = 0; i < categories.length; i += 1) {
      const category = categories[i];
      await recordClassroomSeasonScore({
        seasonId,
        studentNo,
        category,
        score,
        payload: { source: 'manual-classroom-page', category }
      });
    }
    await loadLeaderboard();
    setStatus(`수동 점수 기록 완료 · 시즌 ${seasonId} · ${studentNo}번 · 부문 ${categories.length}개`);
  } catch (error) {
    console.error('[ClassroomPage] add manual score failed', error);
    setStatus('수동 점수 기록에 실패했습니다.', 'error');
  }
};

const queryFilters = readFiltersFromQuery();
state.roleMode = queryFilters.role;
state.navStudentNo = queryFilters.studentNo;
state.navPeriodDays = queryFilters.periodDays;
state.selectedLeaderboardPeriodDays = queryFilters.periodDays;
state.activeView = queryFilters.view;
syncTopNavigationLinks();
syncLeaderboardPeriodUi();
setRoleMode(state.roleMode, { persist: false });

els.refresh?.addEventListener('click', () => {
  reloadData();
});
els.roleTeacher?.addEventListener('click', () => {
  setRoleMode('teacher');
});
els.roleStudent?.addEventListener('click', () => {
  setRoleMode('student');
});
els.viewStudents?.addEventListener('click', () => {
  setActiveView('students');
});
els.viewHall?.addEventListener('click', () => {
  setActiveView('hall');
});
els.initStudents?.addEventListener('click', () => {
  saveStudents({ initializeDefaults: true });
});
els.saveStudents?.addEventListener('click', () => {
  saveStudents({ initializeDefaults: false });
});
els.saveSeason?.addEventListener('click', () => {
  saveSeason();
});
els.archiveEndedSeasons?.addEventListener('click', () => {
  archiveEndedSeasons();
});
els.seasonSelect?.addEventListener('change', () => {
  state.selectedSeasonId = String(els.seasonSelect.value || '').trim();
  state.rawLeaderboardSections = [];
  state.leaderboardSections = [];
  state.loadedLeaderboardSeasonId = '';
  renderLeaderboard();
});
els.leaderboardPeriodSelect?.addEventListener('change', () => {
  state.selectedLeaderboardPeriodDays = normalizePeriodDays(els.leaderboardPeriodSelect?.value || '');
  state.navPeriodDays = state.selectedLeaderboardPeriodDays;
  writeFiltersToQuery(state.navStudentNo, state.navPeriodDays, state.activeView, state.roleMode);
  syncTopNavigationLinks();
  syncLeaderboardPeriodUi();
  state.leaderboardSections = filterLeaderboardSectionsByPeriod(
    state.rawLeaderboardSections,
    state.selectedLeaderboardPeriodDays
  );
  renderStudents();
  renderLeaderboard();
  if (state.selectedSeasonId && state.loadedLeaderboardSeasonId === state.selectedSeasonId) {
    const totalRows = state.leaderboardSections.reduce((sum, section) => sum + section.rows.length, 0);
    setStatus(
      `명예의 전당 필터 적용 · 시즌 ${state.selectedSeasonId} · 기간 ${getPeriodLabel(state.selectedLeaderboardPeriodDays)} · 항목 ${totalRows}개`
    );
  }
});
els.loadLeaderboard?.addEventListener('click', () => {
  loadLeaderboard();
});
els.exportLeaderboardCsv?.addEventListener('click', () => {
  exportLeaderboardCsv();
});
els.addManualScore?.addEventListener('click', () => {
  addManualScore();
});

reloadData();
fillSeasonForm(null);
