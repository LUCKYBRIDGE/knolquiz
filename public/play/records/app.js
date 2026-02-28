import {
  listRecentQuizSessions,
  listRecentJumpmapSessions,
  listRecentBattleshipSessions,
  listPlayerRecords,
  listWrongAnswers
} from '../../shared/local-game-records.js';

const els = {
  status: document.getElementById('status-box'),
  refresh: document.getElementById('refresh-btn'),
  exportCsv: document.getElementById('export-csv-btn'),
  studentPageLink: document.getElementById('student-page-link'),
  studentFilter: document.getElementById('student-filter'),
  periodFilter: document.getElementById('period-filter'),
  clearStudentFilter: document.getElementById('clear-student-filter'),
  filterHint: document.getElementById('filter-hint'),
  summary: document.getElementById('summary-grid'),
  players: document.getElementById('players-list'),
  jumpmapSessions: document.getElementById('jumpmap-sessions'),
  quizSessions: document.getElementById('quiz-sessions'),
  battleshipSessions: document.getElementById('battleship-sessions'),
  wrongs: document.getElementById('wrongs-list')
};

const state = {
  raw: {
    players: [],
    jumpmapSessions: [],
    quizSessions: [],
    battleshipSessions: [],
    wrongs: []
  },
  selectedStudentNo: null,
  selectedPeriodDays: null
};

const normalizeStudentNo = (raw) => {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1 || value > 50) return null;
  return value;
};

const getStudentLabel = (studentNo) => `${studentNo}번`;

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
    if (studentNo) {
      params.set('studentNo', String(studentNo));
    } else {
      params.delete('studentNo');
    }
    if (periodDays) {
      params.set('periodDays', String(periodDays));
    } else {
      params.delete('periodDays');
    }
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  } catch (_error) {
    // no-op
  }
};

const buildStudentDetailHref = (studentNo, periodDays) => {
  const params = new URLSearchParams();
  if (studentNo) params.set('studentNo', String(studentNo));
  if (periodDays) params.set('periodDays', String(periodDays));
  const query = params.toString();
  return `../student/${query ? `?${query}` : ''}`;
};

const syncTopNavigationLinks = () => {
  if (els.studentPageLink) {
    els.studentPageLink.href = buildStudentDetailHref(state.selectedStudentNo, state.selectedPeriodDays);
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

const buildRecordsCsv = ({ players, jumpmapSessions, quizSessions, battleshipSessions, wrongs }) => {
  const selectedStudent = state.selectedStudentNo ? getStudentLabel(state.selectedStudentNo) : '전체';
  const selectedPeriod = getPeriodLabel(state.selectedPeriodDays);
  const criteria = `학생:${selectedStudent} / 기간:${selectedPeriod}`;
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

  (Array.isArray(players) ? players : []).forEach((player) => {
    const studentNo = normalizeStudentNo(player?.tag);
    const quizStats = player?.stats || {};
    const jumpmapStats = player?.jumpmapStats || {};
    rows.push([
      criteria,
      '플레이어 누적',
      player?.updatedAt || '',
      studentNo || '',
      player?.name || player?.id || '',
      `퀴즈판:${Number(quizStats?.quizRuns) || 0}`,
      `정답률:${Number(quizStats?.accuracy) || 0}%`,
      `누적점수:${Number(quizStats?.totalScore) || 0}`,
      `점프맵판:${Number(jumpmapStats?.runs) || 0}`,
      `최고높이:${pxToMeterText(jumpmapStats?.bestHeightPx)}`
    ]);
  });

  (Array.isArray(jumpmapSessions) ? jumpmapSessions : []).forEach((session) => {
    const mapSummary = session?.mapSummary || {};
    const playersInSession = Array.isArray(session?.players) ? session.players : [];
    playersInSession.forEach((player) => {
      const studentNo = normalizeStudentNo(player?.tag);
      const summary = player?.summary || {};
      rows.push([
        criteria,
        '점프맵 세션',
        session?.createdAt || '',
        studentNo || '',
        player?.name || player?.id || '',
        `최고높이:${pxToMeterText(summary?.bestHeightPx)}`,
        `퀴즈:${Number(summary?.quizCorrect) || 0}/${Number(summary?.quizAttempts) || 0}`,
        `점프:${Number(summary?.jumps) || 0}`,
        `더블:${Number(summary?.doubleJumps) || 0}`,
        `종료:${mapSummary?.endReason || '-'}`
      ]);
    });
  });

  (Array.isArray(quizSessions) ? quizSessions : []).forEach((session) => {
    const playersInSession = Array.isArray(session?.players) ? session.players : [];
    playersInSession.forEach((player) => {
      const studentNo = normalizeStudentNo(player?.tag);
      const summary = player?.summary || {};
      rows.push([
        criteria,
        '기본 퀴즈 세션',
        session?.createdAt || '',
        studentNo || '',
        player?.name || player?.id || '',
        `총점:${Number(summary?.totalScore) || 0}`,
        `정답:${Number(summary?.correctCount) || 0}/${Number(summary?.totalCount) || 0}`,
        `프리셋:${session?.launcherQuizPresetId || '-'}`,
        `제한시간:${Number(session?.settingsSummary?.timeLimitSec) || 0}초`,
        `플레이어수:${Number(session?.playerCount) || 0}`
      ]);
    });
  });

  (Array.isArray(battleshipSessions) ? battleshipSessions : []).forEach((session) => {
    const playersInSession = Array.isArray(session?.players) ? session.players : [];
    playersInSession.forEach((player) => {
      const studentNo = normalizeStudentNo(player?.tag);
      const summary = player?.summary || {};
      rows.push([
        criteria,
        '거북선 디펜스 세션',
        session?.createdAt || '',
        studentNo || '',
        player?.name || player?.id || '',
        `격파:${Number(summary?.kills) || 0}`,
        `퀴즈정답:${Number(summary?.quizSolved) || 0}`,
        `생존:${Number(session?.settingsSummary?.survivedSec) || 0}초`,
        `웨이브:${Number(session?.settingsSummary?.maxWaveLevel) || 0}`,
        `선박HP:${Number(summary?.shipHp) || 0}`
      ]);
    });
  });

  (Array.isArray(wrongs) ? wrongs : []).forEach((wrong) => {
    const studentNo = normalizeStudentNo(wrong?.playerTag);
    rows.push([
      criteria,
      '오답',
      wrong?.createdAt || '',
      studentNo || '',
      wrong?.playerName || wrong?.playerId || '',
      `유형:${wrong?.type || '-'}`,
      `문제ID:${wrong?.questionId || '-'}`,
      `선택:${wrong?.selectedChoice ?? '-'}`,
      `정답:${wrong?.correctChoice ?? '-'}`,
      wrong?.prompt || wrong?.question || ''
    ]);
  });

  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
};

const exportFilteredRecordsCsv = () => {
  const filtered = applyFilters(state.raw, state.selectedStudentNo, state.selectedPeriodDays);
  const csvText = buildRecordsCsv(filtered);
  const periodToken = state.selectedPeriodDays ? `${state.selectedPeriodDays}d` : 'all';
  const studentToken = state.selectedStudentNo ? `${state.selectedStudentNo}` : 'all';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const fileName = `records-${studentToken}-${periodToken}-${stamp}.csv`;
  downloadTextFile(fileName, csvText, 'text/csv;charset=utf-8;');
  els.status.textContent =
    `CSV 저장 완료 · 학생 ${state.selectedStudentNo ? getStudentLabel(state.selectedStudentNo) : '전체'} · 기간 ${getPeriodLabel(state.selectedPeriodDays)}`;
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

const applyFilters = ({ players, jumpmapSessions, quizSessions, battleshipSessions, wrongs }, studentNo, periodDays) => {
  const normalizedJumpmapSessions = (Array.isArray(jumpmapSessions) ? jumpmapSessions : [])
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays));
  const normalizedQuizSessions = (Array.isArray(quizSessions) ? quizSessions : [])
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays));
  const normalizedBattleshipSessions = (Array.isArray(battleshipSessions) ? battleshipSessions : [])
    .filter((session) => isWithinSelectedPeriod(session?.createdAt, periodDays));
  const normalizedWrongs = (Array.isArray(wrongs) ? wrongs : [])
    .filter((wrong) => isWithinSelectedPeriod(wrong?.createdAt, periodDays));

  if (!studentNo) {
    return {
      players,
      jumpmapSessions: normalizedJumpmapSessions,
      quizSessions: normalizedQuizSessions,
      battleshipSessions: normalizedBattleshipSessions,
      wrongs: normalizedWrongs
    };
  }
  return {
    players: (Array.isArray(players) ? players : [])
      .filter((player) => matchesStudentNo(player?.tag, studentNo)),
    jumpmapSessions: normalizedJumpmapSessions
      .filter((session) => (Array.isArray(session?.players) ? session.players : [])
        .some((player) => matchesStudentNo(player?.tag, studentNo))),
    quizSessions: normalizedQuizSessions
      .filter((session) => (Array.isArray(session?.players) ? session.players : [])
        .some((player) => matchesStudentNo(player?.tag, studentNo))),
    battleshipSessions: normalizedBattleshipSessions
      .filter((session) => (Array.isArray(session?.players) ? session.players : [])
        .some((player) => matchesStudentNo(player?.tag, studentNo))),
    wrongs: normalizedWrongs
      .filter((wrong) => matchesStudentNo(wrong?.playerTag, studentNo))
  };
};

const updateFilterHint = () => {
  if (!els.filterHint) return;
  const periodText = getPeriodLabel(state.selectedPeriodDays);
  if (!state.selectedStudentNo && !state.selectedPeriodDays) {
    els.filterHint.textContent = '전체 학생 기록을 표시 중입니다.';
    return;
  }
  const studentText = state.selectedStudentNo
    ? `${getStudentLabel(state.selectedStudentNo)} 기록`
    : '전체 학생 기록';
  els.filterHint.textContent = `${studentText}을 ${periodText} 기준으로 표시 중입니다.`;
};

const renderSummary = ({ players, jumpmapSessions, quizSessions, battleshipSessions, wrongs }) => {
  clearNode(els.summary);
  const totalQuizRuns = quizSessions.length;
  const totalJumpmapRuns = jumpmapSessions.length;
  const totalBattleshipRuns = battleshipSessions.length;
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
    ['최근 거북선 기록', `${totalBattleshipRuns}건`],
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
    if (normalizeStudentNo(tag)) {
      const studentNo = normalizeStudentNo(tag);
      const link = document.createElement('a');
      link.className = 'detail-link';
      link.href = buildStudentDetailHref(studentNo, state.selectedPeriodDays);
      link.textContent = '상세';
      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.justifyItems = 'end';
      wrap.style.gap = '2px';
      wrap.append(updated, link);
      row.append(name, wrap);
    } else {
      row.append(name, updated);
    }

    const quizStats = player?.stats || {};
    const jumpmapStats = player?.jumpmapStats || {};
    const battleshipStats = player?.battleshipStats || {};
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = [
      `퀴즈: ${Number(quizStats.quizRuns) || 0}판 · 정답률 ${Number(quizStats.accuracy) || 0}% · 누적점수 ${Number(quizStats.totalScore) || 0}`,
      `점프맵: ${Number(jumpmapStats.runs) || 0}판 · 최고높이 ${pxToMeterText(jumpmapStats.bestHeightPx)} · 점프 ${Number(jumpmapStats.totalJumps) || 0}/${Number(jumpmapStats.totalDoubleJumps) || 0}(더블)`,
      `거북선: ${Number(battleshipStats.runs) || 0}판 · 최고 ${Number(battleshipStats.bestScore) || 0}킬 · 누적 ${Number(battleshipStats.totalKills) || 0}킬`
    ].join('<br>');

    item.append(row, meta);
    els.players.appendChild(item);
  });
};

const renderBattleshipSessions = (sessions) => {
  clearNode(els.battleshipSessions);
  if (!sessions.length) {
    appendEmpty(els.battleshipSessions, '거북선 디펜스 기록이 없습니다.');
    return;
  }
  sessions.forEach((session) => {
    const item = createItem();
    const row = document.createElement('div');
    row.className = 'row';
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = `거북선 디펜스 · ${session.playerCount || 1}인`;
    const time = document.createElement('div');
    time.className = 'meta';
    time.textContent = formatTime(session.createdAt);
    row.append(title, time);

    const players = Array.isArray(session.players) ? session.players : [];
    const topPlayer = players.reduce((best, player) => {
      const kills = Number(player?.summary?.kills) || 0;
      if (!best || kills > (Number(best?.summary?.kills) || 0)) return player;
      return best;
    }, null);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = [
      `최고 플레이어: ${topPlayer?.name || '-'} (${Number(topPlayer?.summary?.kills) || 0}킬)`,
      `생존 시간: ${Number(session?.settingsSummary?.survivedSec) || 0}초 · 최고 웨이브: Lv.${Number(session?.settingsSummary?.maxWaveLevel) || 0}`,
      `퀴즈 정답 반영: ${Number(topPlayer?.summary?.quizSolved) || 0}개`
    ].join('<br>');

    item.append(row, meta);
    els.battleshipSessions.appendChild(item);
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
  const filtered = applyFilters(state.raw, state.selectedStudentNo, state.selectedPeriodDays);
  renderSummary(filtered);
  renderPlayers(filtered.players);
  renderJumpmapSessions(filtered.jumpmapSessions);
  renderQuizSessions(filtered.quizSessions);
  renderBattleshipSessions(filtered.battleshipSessions);
  renderWrongs(filtered.wrongs);
  updateFilterHint();
  syncTopNavigationLinks();
  const studentText = state.selectedStudentNo
    ? ` · 학생필터 ${getStudentLabel(state.selectedStudentNo)}`
    : '';
  const periodText = state.selectedPeriodDays
    ? ` · 기간필터 ${getPeriodLabel(state.selectedPeriodDays)}`
    : '';
  els.status.textContent =
    `불러오기 완료 · 점프맵 ${filtered.jumpmapSessions.length}건 · 퀴즈 ${filtered.quizSessions.length}건 · 거북선 ${filtered.battleshipSessions.length}건 · 플레이어 ${filtered.players.length}명 · 오답 ${filtered.wrongs.length}건${studentText}${periodText}`;
};

const loadAndRender = async () => {
  try {
    els.status.textContent = '로컬 기록을 불러오는 중...';
    const [jumpmapSessions, quizSessions, battleshipSessions, players, wrongs] = await Promise.all([
      listRecentJumpmapSessions(20),
      listRecentQuizSessions(20),
      listRecentBattleshipSessions(20),
      listPlayerRecords(60),
      listWrongAnswers(120)
    ]);

    state.raw = {
      players: Array.isArray(players) ? players : [],
      jumpmapSessions: Array.isArray(jumpmapSessions) ? jumpmapSessions : [],
      quizSessions: Array.isArray(quizSessions) ? quizSessions : [],
      battleshipSessions: Array.isArray(battleshipSessions) ? battleshipSessions : [],
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
els.exportCsv?.addEventListener('click', () => {
  exportFilteredRecordsCsv();
});

els.studentFilter?.addEventListener('change', () => {
  state.selectedStudentNo = normalizeStudentNo(els.studentFilter.value || '');
  writeFiltersToQuery(state.selectedStudentNo, state.selectedPeriodDays);
  renderFilteredView();
});

els.periodFilter?.addEventListener('change', () => {
  state.selectedPeriodDays = normalizePeriodDays(els.periodFilter.value || '');
  if (els.periodFilter) {
    els.periodFilter.value = state.selectedPeriodDays ? String(state.selectedPeriodDays) : 'all';
  }
  writeFiltersToQuery(state.selectedStudentNo, state.selectedPeriodDays);
  renderFilteredView();
});

els.clearStudentFilter?.addEventListener('click', () => {
  state.selectedStudentNo = null;
  state.selectedPeriodDays = null;
  if (els.studentFilter) els.studentFilter.value = '';
  if (els.periodFilter) els.periodFilter.value = 'all';
  writeFiltersToQuery(null, null);
  renderFilteredView();
});

document.getElementById('print-btn')?.addEventListener('click', () => {
  window.print();
});

const queryFilters = readFiltersFromQuery();
state.selectedStudentNo = queryFilters.studentNo;
state.selectedPeriodDays = queryFilters.periodDays;
if (els.periodFilter) {
  els.periodFilter.value = state.selectedPeriodDays ? String(state.selectedPeriodDays) : 'all';
}
loadAndRender();
