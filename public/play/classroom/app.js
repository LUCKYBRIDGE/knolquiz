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
  seasonPresetSelect: document.getElementById('season-preset-select'),
  seasonActiveInput: document.getElementById('season-active-input'),
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
  leaderboard: [],
  selectedSeasonId: ''
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
    setSeasonPresetSelectValue('');
    if (els.seasonActiveInput) els.seasonActiveInput.value = 'true';
    return;
  }
  if (els.seasonIdInput) els.seasonIdInput.value = String(season.seasonId || '').trim();
  if (els.seasonNameInput) els.seasonNameInput.value = String(season.name || '').trim();
  setSeasonPresetSelectValue(season.quizPresetId || '');
  if (els.seasonActiveInput) els.seasonActiveInput.value = season.active === false ? 'false' : 'true';
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
        meta.textContent = `ID: ${season.seasonId} · 프리셋: ${season.quizPresetId || '-'} · 시작: ${season.startDate || '-'}`;
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
  if (!state.leaderboard.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '명예의 전당 데이터가 없습니다.';
    els.leaderboardList.appendChild(empty);
    return;
  }
  state.leaderboard.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'item';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${row.rank}위 · ${row.studentName}(${row.studentNo}번)`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `최고 ${row.bestScore}점 · 평균 ${row.averageScore}점 · 시도 ${row.attemptCount}회`;
    item.append(name, meta);
    els.leaderboardList.appendChild(item);
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
  const quizPresetId = normalizeSeasonPresetId(els.seasonPresetSelect?.value || '');
  const active = String(els.seasonActiveInput?.value || 'true') !== 'false';
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
      quizPresetId
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
    state.leaderboard = [];
    renderLeaderboard();
    setStatus('명예의 전당 시즌을 선택하세요.', 'error');
    return;
  }
  setStatus('명예의 전당을 불러오는 중...');
  try {
    state.leaderboard = await listClassroomSeasonLeaderboard(seasonId, 50);
    renderLeaderboard();
    setStatus(`명예의 전당 갱신 완료 · 시즌 ${seasonId} · ${state.leaderboard.length}명`);
  } catch (error) {
    console.error('[ClassroomPage] load leaderboard failed', error);
    setStatus('명예의 전당을 불러오지 못했습니다.', 'error');
  }
};

const addManualScore = async () => {
  const seasonId = String(els.seasonSelect?.value || state.selectedSeasonId || '').trim();
  const studentNo = normalizeStudentNo(els.manualStudentNo?.value);
  const score = Math.round(Number(els.manualScore?.value) || 0);
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
    await recordClassroomSeasonScore({
      seasonId,
      studentNo,
      score,
      payload: { source: 'manual-classroom-page' }
    });
    await loadLeaderboard();
    setStatus(`수동 점수 기록 완료 · 시즌 ${seasonId} · ${studentNo}번`);
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
