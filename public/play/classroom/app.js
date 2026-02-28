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
  refresh: document.getElementById('refresh-btn'),
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
  saveSeason: document.getElementById('save-season-btn'),
  seasonList: document.getElementById('season-list'),
  seasonSelect: document.getElementById('season-select'),
  loadLeaderboard: document.getElementById('load-leaderboard-btn'),
  manualStudentNo: document.getElementById('manual-student-no'),
  manualScore: document.getElementById('manual-score'),
  addManualScore: document.getElementById('add-manual-score-btn'),
  leaderboardList: document.getElementById('leaderboard-list')
};

const state = {
  draftStudents: [],
  seasons: [],
  leaderboardSections: [],
  selectedSeasonId: ''
};

const CATEGORY_LABELS = {
  basicQuizTotalScore: '기본퀴즈 총점',
  basicQuizCorrectCount: '기본퀴즈 정답 수',
  jumpmapBestHeight: '점프맵 최고 높이(px)',
  jumpmapQuizCorrect: '점프맵 퀴즈 정답 수',
  overall: '통합'
};

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

const normalizeScorePolicies = (raw) => {
  const source = (raw && typeof raw === 'object') ? raw : {};
  return {
    basicQuizTotalScore: source.basicQuizTotalScore !== false,
    basicQuizCorrectCount: source.basicQuizCorrectCount === true,
    jumpmapBestHeight: source.jumpmapBestHeight !== false,
    jumpmapQuizCorrect: source.jumpmapQuizCorrect === true
  };
};

const getEnabledSeasonCategories = (scorePolicies) => {
  const policies = normalizeScorePolicies(scorePolicies);
  const categories = [];
  if (policies.basicQuizTotalScore) categories.push('basicQuizTotalScore');
  if (policies.basicQuizCorrectCount) categories.push('basicQuizCorrectCount');
  if (policies.jumpmapBestHeight) categories.push('jumpmapBestHeight');
  if (policies.jumpmapQuizCorrect) categories.push('jumpmapQuizCorrect');
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
  jumpmapQuizCorrect: els.policyJumpmapQuizCorrect?.checked === true
});

const applyScorePoliciesToForm = (rawPolicies) => {
  const policies = normalizeScorePolicies(rawPolicies);
  if (els.policyQuizTotalScore) els.policyQuizTotalScore.checked = policies.basicQuizTotalScore;
  if (els.policyQuizCorrectCount) els.policyQuizCorrectCount.checked = policies.basicQuizCorrectCount;
  if (els.policyJumpmapBestHeight) els.policyJumpmapBestHeight.checked = policies.jumpmapBestHeight;
  if (els.policyJumpmapQuizCorrect) els.policyJumpmapQuizCorrect.checked = policies.jumpmapQuizCorrect;
};

const formatDateTime = (raw) => {
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { hour12: false });
};

const formatModeLabel = (rawMode, rawSource) => {
  if (rawMode === 'basic-quiz') return '기본퀴즈';
  if (rawMode === 'jumpmap') return '점프맵';
  if (rawSource === 'manual-classroom-page') return '수동기록';
  return rawMode || rawSource || '기타';
};

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

    row.append(no, nameInput, activeWrap, count);
    els.studentList.appendChild(row);
  });
};

const renderSeasons = () => {
  if (els.seasonList) {
    els.seasonList.innerHTML = '';
    if (!state.seasons.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '저장된 시즌이 없습니다.';
      els.seasonList.appendChild(empty);
    } else {
      state.seasons.forEach((season) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.style.cursor = 'pointer';
        item.title = '클릭해서 시즌 편집 폼으로 불러오기';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = `${season.name || season.seasonId}${season.active === false ? ' (비활성)' : ''}`;
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
    state.seasons.forEach((season) => {
      const option = document.createElement('option');
      option.value = season.seasonId || '';
      option.textContent = `${season.name || season.seasonId}${season.active === false ? ' (비활성)' : ''}`;
      els.seasonSelect.appendChild(option);
    });
    const activeSeason = state.seasons.find((season) => season.active !== false)?.seasonId || '';
    state.selectedSeasonId = state.seasons.some((season) => season.seasonId === previous)
      ? previous
      : activeSeason;
    els.seasonSelect.value = state.selectedSeasonId || '';
  }
};

const renderLeaderboard = () => {
  if (!els.leaderboardList) return;
  els.leaderboardList.innerHTML = '';
  if (!state.leaderboardSections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '명예의 전당 데이터가 없습니다.';
    els.leaderboardList.appendChild(empty);
    return;
  }
  state.leaderboardSections.forEach((section) => {
    const header = document.createElement('div');
    header.className = 'item';
    const headerName = document.createElement('div');
    headerName.className = 'name';
    headerName.textContent = `[부문] ${section.label}`;
    const headerMeta = document.createElement('div');
    headerMeta.className = 'meta';
    headerMeta.textContent = `${section.rows.length}명`;
    header.append(headerName, headerMeta);
    els.leaderboardList.appendChild(header);

    if (!section.rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = `${section.label} 데이터가 없습니다.`;
      els.leaderboardList.appendChild(empty);
      return;
    }

    section.rows.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'item';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${row.rank}위 · ${row.studentName}(${row.studentNo}번)`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `최고 ${row.bestScore}점 · 평균 ${row.averageScore}점 · 시도 ${row.attemptCount}회 · 최근 ${row.lastScore}점 (${formatModeLabel(row.lastMode, row.lastSource)}, ${formatDateTime(row.lastPlayedAt)})`;
      item.append(name, meta);
      els.leaderboardList.appendChild(item);
    });
  });
};

const reloadData = async () => {
  setStatus('학급 데이터를 불러오는 중...');
  try {
    const [attendanceSummary, seasons] = await Promise.all([
      summarizeClassroomAttendance(),
      listClassroomSeasons({ includeInactive: true })
    ]);
    state.draftStudents = buildDraftStudents(attendanceSummary.students || []);
    state.seasons = Array.isArray(seasons) ? seasons : [];
    state.leaderboardSections = [];
    renderStudents();
    renderSeasons();
    renderLeaderboard();
    setStatus(`불러오기 완료 · 학생 ${state.draftStudents.length}명 · 출석일 ${attendanceSummary.attendanceDayCount || 0}일 · 시즌 ${state.seasons.length}개`);
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

const loadLeaderboard = async () => {
  const seasonId = String(els.seasonSelect?.value || state.selectedSeasonId || '').trim();
  state.selectedSeasonId = seasonId;
  if (!seasonId) {
    state.leaderboardSections = [];
    renderLeaderboard();
    setStatus('명예의 전당 시즌을 선택하세요.', 'error');
    return;
  }
  const season = getSeasonById(seasonId);
  const categories = getEnabledSeasonCategories(season?.scorePolicies);
  setStatus('명예의 전당을 불러오는 중...');
  try {
    const sectionRows = await Promise.all(
      categories.map(async (category) => ({
        category,
        label: CATEGORY_LABELS[category] || category,
        rows: await listClassroomSeasonLeaderboard(seasonId, 50, category)
      }))
    );
    state.leaderboardSections = sectionRows;
    renderLeaderboard();
    const totalRows = sectionRows.reduce((sum, section) => sum + section.rows.length, 0);
    setStatus(`명예의 전당 갱신 완료 · 시즌 ${seasonId} · 부문 ${sectionRows.length}개 · 항목 ${totalRows}개`);
  } catch (error) {
    console.error('[ClassroomPage] load leaderboard failed', error);
    setStatus('명예의 전당을 불러오지 못했습니다.', 'error');
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

els.refresh?.addEventListener('click', () => {
  reloadData();
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
els.seasonSelect?.addEventListener('change', () => {
  state.selectedSeasonId = String(els.seasonSelect.value || '').trim();
});
els.loadLeaderboard?.addEventListener('click', () => {
  loadLeaderboard();
});
els.addManualScore?.addEventListener('click', () => {
  addManualScore();
});

reloadData();
fillSeasonForm(null);
