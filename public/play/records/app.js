import {
  listRecentQuizSessions,
  listRecentJumpmapSessions,
  listPlayerRecords,
  listWrongAnswers
} from '../../shared/local-game-records.js';

const els = {
  status: document.getElementById('status-box'),
  refresh: document.getElementById('refresh-btn'),
  studentFilter: document.getElementById('student-filter'),
  clearStudentFilter: document.getElementById('clear-student-filter'),
  filterHint: document.getElementById('filter-hint'),
  summary: document.getElementById('summary-grid'),
  players: document.getElementById('players-list'),
  jumpmapSessions: document.getElementById('jumpmap-sessions'),
  quizSessions: document.getElementById('quiz-sessions'),
  wrongs: document.getElementById('wrongs-list')
};

const state = {
  raw: {
    players: [],
    jumpmapSessions: [],
    quizSessions: [],
    wrongs: []
  },
  selectedStudentNo: null
};

const normalizeStudentNo = (raw) => {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1 || value > 50) return null;
  return value;
};

const getStudentLabel = (studentNo) => `${studentNo}번`;

const readStudentFilterFromQuery = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeStudentNo(params.get('studentNo'));
  } catch (_error) {
    return null;
  }
};

const writeStudentFilterToQuery = (studentNo) => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (studentNo) {
      params.set('studentNo', String(studentNo));
    } else {
      params.delete('studentNo');
    }
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  } catch (_error) {
    // no-op
  }
};

const matchesStudentNo = (rawTag, targetStudentNo) => {
  if (!targetStudentNo) return true;
  return normalizeStudentNo(rawTag) === targetStudentNo;
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

const createItem = () => {
  const item = document.createElement('div');
  item.className = 'item';
  return item;
};

const populateStudentFilter = (players) => {
  if (!els.studentFilter) return;
  const knownStudentNos = new Set(
    (Array.isArray(players) ? players : [])
      .map((player) => normalizeStudentNo(player?.tag))
      .filter(Boolean)
  );
  const selected = state.selectedStudentNo;
  els.studentFilter.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = '전체 학생';
  els.studentFilter.appendChild(allOption);
  for (let no = 1; no <= 50; no += 1) {
    const option = document.createElement('option');
    option.value = String(no);
    option.textContent = knownStudentNos.has(no) ? getStudentLabel(no) : `${getStudentLabel(no)} (기록없음)`;
    els.studentFilter.appendChild(option);
  }
  els.studentFilter.value = selected ? String(selected) : '';
};

const applyStudentFilter = ({ players, jumpmapSessions, quizSessions, wrongs }, studentNo) => {
  if (!studentNo) {
    return {
      players,
      jumpmapSessions,
      quizSessions,
      wrongs
    };
  }
  return {
    players: (Array.isArray(players) ? players : [])
      .filter((player) => matchesStudentNo(player?.tag, studentNo)),
    jumpmapSessions: (Array.isArray(jumpmapSessions) ? jumpmapSessions : [])
      .filter((session) => (Array.isArray(session?.players) ? session.players : [])
        .some((player) => matchesStudentNo(player?.tag, studentNo))),
    quizSessions: (Array.isArray(quizSessions) ? quizSessions : [])
      .filter((session) => (Array.isArray(session?.players) ? session.players : [])
        .some((player) => matchesStudentNo(player?.tag, studentNo))),
    wrongs: (Array.isArray(wrongs) ? wrongs : [])
      .filter((wrong) => matchesStudentNo(wrong?.playerTag, studentNo))
  };
};

const updateFilterHint = () => {
  if (!els.filterHint) return;
  if (!state.selectedStudentNo) {
    els.filterHint.textContent = '전체 학생 기록을 표시 중입니다.';
    return;
  }
  els.filterHint.textContent = `${getStudentLabel(state.selectedStudentNo)} 기록만 표시 중입니다.`;
};

const renderSummary = ({ players, jumpmapSessions, quizSessions, wrongs }) => {
  clearNode(els.summary);
  const totalQuizRuns = quizSessions.length;
  const totalJumpmapRuns = jumpmapSessions.length;
  const totalPlayers = players.length;
  const totalWrongs = wrongs.length;
  const bestJumpmapHeightPx = players.reduce((max, player) => {
    const value = Number(player?.jumpmapStats?.bestHeightPx) || 0;
    return Math.max(max, value);
  }, 0);
  const totalQuizQuestions = players.reduce((sum, player) => sum + (Number(player?.stats?.totalQuestions) || 0), 0);
  const totalQuizCorrect = players.reduce((sum, player) => sum + (Number(player?.stats?.correctAnswers) || 0), 0);
  const overallAccuracy = totalQuizQuestions > 0 ? Math.round((totalQuizCorrect / totalQuizQuestions) * 1000) / 10 : 0;

  const rows = [
    ['플레이어 수', `${totalPlayers}명`],
    ['최근 점프맵 기록', `${totalJumpmapRuns}건`],
    ['최근 퀴즈 기록', `${totalQuizRuns}건`],
    ['오답문항(표시 범위)', `${totalWrongs}건`],
    ['최고 높이(누적 기록 기준)', pxToMeterText(bestJumpmapHeightPx)],
    ['누적 퀴즈 정답률', `${overallAccuracy.toFixed(1)}%`]
  ];

  rows.forEach(([k, v]) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const key = document.createElement('div');
    key.className = 'k';
    key.textContent = k;
    const val = document.createElement('div');
    val.className = 'v';
    val.textContent = v;
    cell.append(key, val);
    els.summary.appendChild(cell);
  });
};

const renderPlayers = (players) => {
  clearNode(els.players);
  if (!players.length) {
    appendEmpty(els.players, '저장된 플레이어 기록이 없습니다.');
    return;
  }
  players.forEach((player) => {
    const item = createItem();
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('div');
    name.className = 'name';
    const tag = player?.tag ? String(player.tag).trim() : '';
    name.textContent = tag ? `${player?.name || player?.id || '이름 없음'}(${tag})` : (player?.name || player?.id || '이름 없음');
    const updated = document.createElement('div');
    updated.className = 'meta';
    updated.textContent = formatTime(player?.updatedAt);
    row.append(name, updated);

    const quizStats = player?.stats || {};
    const jumpmapStats = player?.jumpmapStats || {};
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = [
      `퀴즈: ${Number(quizStats.quizRuns) || 0}판 · 정답률 ${Number(quizStats.accuracy) || 0}% · 누적점수 ${Number(quizStats.totalScore) || 0}`,
      `점프맵: ${Number(jumpmapStats.runs) || 0}판 · 최고높이 ${pxToMeterText(jumpmapStats.bestHeightPx)} · 점프 ${Number(jumpmapStats.totalJumps) || 0}/${Number(jumpmapStats.totalDoubleJumps) || 0}(더블)`
    ].join('<br>');

    item.append(row, meta);
    els.players.appendChild(item);
  });
};

const renderJumpmapSessions = (sessions) => {
  clearNode(els.jumpmapSessions);
  if (!sessions.length) {
    appendEmpty(els.jumpmapSessions, '점프맵 기록이 없습니다.');
    return;
  }
  sessions.forEach((session) => {
    const item = createItem();
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `점프맵 · ${session.playerCount || 1}인`;
    const time = document.createElement('div');
    time.className = 'meta';
    time.textContent = formatTime(session.createdAt);
    row.append(name, time);

    const players = Array.isArray(session.players) ? session.players : [];
    const bestPlayer = players.reduce((best, player) => {
      const height = Number(player?.summary?.bestHeightPx) || 0;
      if (!best || height > (Number(best?.summary?.bestHeightPx) || 0)) return player;
      return best;
    }, null);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const durationMs = Number(session?.mapSummary?.durationMs || session?.settingsSummary?.durationMs || 0);
    const mapSize = `${Number(session?.mapSummary?.width) || 0}x${Number(session?.mapSummary?.height) || 0}`;
    meta.innerHTML = [
      `맵: ${mapSize} · 오브젝트 ${Number(session?.mapSummary?.objectCount) || 0}개 · 세이브포인트 ${Number(session?.mapSummary?.savePointCount) || 0}개`,
      `최고 플레이어: ${bestPlayer?.name || '-'} (${pxToMeterText(bestPlayer?.summary?.bestHeightPx)})`,
      `종료 사유: ${session?.mapSummary?.endReason || '-'}${durationMs ? ` · 플레이 ${Math.round(durationMs / 1000)}초` : ''}`
    ].join('<br>');

    item.append(row, meta);
    els.jumpmapSessions.appendChild(item);
  });
};

const renderQuizSessions = (sessions) => {
  clearNode(els.quizSessions);
  if (!sessions.length) {
    appendEmpty(els.quizSessions, '기본 퀴즈 기록이 없습니다.');
    return;
  }
  sessions.forEach((session) => {
    const item = createItem();
    const row = document.createElement('div');
    row.className = 'row';
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = `기본 퀴즈 · ${session.playerCount || 1}인`;
    const time = document.createElement('div');
    time.className = 'meta';
    time.textContent = formatTime(session.createdAt);
    row.append(title, time);

    const topPlayer = (Array.isArray(session.players) ? [...session.players] : [])
      .sort((a, b) => (Number(b?.summary?.totalScore) || 0) - (Number(a?.summary?.totalScore) || 0))[0];
    const questionTypes = Array.isArray(session?.settingsSummary?.questionTypeSummary)
      ? session.settingsSummary.questionTypeSummary
      : [];
    const typeText = questionTypes.length
      ? questionTypes.map((cfg) => `${cfg.key}(${cfg.count})`).join(', ')
      : '-';
    const questionIds = Array.isArray(session?.questionSummary?.questionIds)
      ? session.questionSummary.questionIds
      : [];
    const questionIdPreview = questionIds.slice(0, 12).join(', ');
    const questionIdSuffix = questionIds.length > 12 ? ' …' : '';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = [
      `프리셋: ${session?.launcherQuizPresetId || '-'} · 제한시간 ${Number(session?.settingsSummary?.timeLimitSec) || 0}초`,
      `최고 점수: ${topPlayer?.tag ? `${topPlayer?.name || '-'}(${topPlayer?.tag})` : (topPlayer?.name || '-')}` +
        ` (${Number(topPlayer?.summary?.totalScore) || 0}점)`,
      `출제 유형: ${typeText}`,
      `문항 ID(일부): ${questionIdPreview}${questionIdSuffix}`
    ].join('<br>');

    item.append(row, meta);
    els.quizSessions.appendChild(item);
  });
};

const renderWrongs = (wrongs) => {
  clearNode(els.wrongs);
  if (!wrongs.length) {
    appendEmpty(els.wrongs, '오답문항 기록이 없습니다.');
    return;
  }
  wrongs.forEach((wrong) => {
    const item = createItem();
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('div');
    name.className = 'name';
    const tag = wrong?.playerTag ? String(wrong.playerTag).trim() : '';
    const baseName = wrong?.playerName || wrong?.playerId || '플레이어';
    name.textContent = tag ? `${baseName}(${tag})` : baseName;
    const time = document.createElement('div');
    time.className = 'meta';
    time.textContent = formatTime(wrong?.createdAt);
    row.append(name, time);

    const typePill = document.createElement('div');
    typePill.className = 'pill';
    typePill.textContent = wrong?.type || 'unknown';

    const question = document.createElement('div');
    question.className = 'wrong-question';
    question.textContent = wrong?.prompt || wrong?.question || '(문제 텍스트 없음)';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `선택: <b>${wrong?.selectedChoice ?? '-'}</b> · 정답: <b>${wrong?.correctChoice ?? '-'}</b> · 문제ID: ${wrong?.questionId || '-'}`;

    item.append(row, typePill, question, meta);
    els.wrongs.appendChild(item);
  });
};

const renderFilteredView = () => {
  const filtered = applyStudentFilter(state.raw, state.selectedStudentNo);
  renderSummary(filtered);
  renderPlayers(filtered.players);
  renderJumpmapSessions(filtered.jumpmapSessions);
  renderQuizSessions(filtered.quizSessions);
  renderWrongs(filtered.wrongs);
  updateFilterHint();
  const studentText = state.selectedStudentNo
    ? ` · 학생필터 ${getStudentLabel(state.selectedStudentNo)}`
    : '';
  els.status.textContent =
    `불러오기 완료 · 점프맵 ${filtered.jumpmapSessions.length}건 · 퀴즈 ${filtered.quizSessions.length}건 · 플레이어 ${filtered.players.length}명 · 오답 ${filtered.wrongs.length}건${studentText}`;
};

const loadAndRender = async () => {
  try {
    els.status.textContent = '로컬 기록을 불러오는 중...';
    const [jumpmapSessions, quizSessions, players, wrongs] = await Promise.all([
      listRecentJumpmapSessions(20),
      listRecentQuizSessions(20),
      listPlayerRecords(60),
      listWrongAnswers(120)
    ]);

    state.raw = {
      players: Array.isArray(players) ? players : [],
      jumpmapSessions: Array.isArray(jumpmapSessions) ? jumpmapSessions : [],
      quizSessions: Array.isArray(quizSessions) ? quizSessions : [],
      wrongs: Array.isArray(wrongs) ? wrongs : []
    };
    populateStudentFilter(state.raw.players);
    renderFilteredView();
  } catch (error) {
    console.error('[RecordsPage] load failed', error);
    els.status.textContent = '로컬 기록을 불러오지 못했습니다';
    appendEmpty(els.summary, 'IndexedDB를 사용할 수 없거나 로컬 기록이 없습니다.');
  }
};

els.refresh?.addEventListener('click', () => {
  loadAndRender();
});

els.studentFilter?.addEventListener('change', () => {
  state.selectedStudentNo = normalizeStudentNo(els.studentFilter.value || '');
  writeStudentFilterToQuery(state.selectedStudentNo);
  renderFilteredView();
});

els.clearStudentFilter?.addEventListener('click', () => {
  state.selectedStudentNo = null;
  if (els.studentFilter) els.studentFilter.value = '';
  writeStudentFilterToQuery(null);
  renderFilteredView();
});

document.getElementById('print-btn')?.addEventListener('click', () => {
  window.print();
});

state.selectedStudentNo = readStudentFilterFromQuery();
loadAndRender();
