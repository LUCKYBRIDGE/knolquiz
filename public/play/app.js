const STORAGE_KEY = 'jumpmap.launcher.setup.v1';

const GAME_LABELS = {
  jumpmap: '점프맵',
  'basic-quiz': '기본 모드(퀴즈)',
  'battleship-defense': '거북선 디펜스'
};

const QUIZ_PRESET_LABELS = {
  'jumpmap-net-30': '전개도 학습 30문제',
  'jumpmap-net-12': '전개도 학습 12문제',
  'cube-only-24': '정육면체 중심 24문제',
  'cuboid-only-24': '직육면체 중심 24문제',
  'cube-only-100': '정육면체 100문제',
  'cuboid-only-100': '직육면체 100문제',
  'jumpmap-net-100': '종합 100문제',
  'pvam-area-2digit': '몇십몇×몇십몇(영역모델)',
  'pvam-area-2digit-100': '몇십몇×몇십몇 100문제(영역모델)',
  'gugudan-2to9-csv': '구구단 2단~9단 (CSV)',
  'csv-upload': '업로드 CSV 문제'
};

const CHARACTER_LABELS = {
  sejong: '세종',
  leesunsin: '이순신'
};

const readLauncherSetup = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('[PlayRouter] failed to read launcher setup', error);
    return null;
  }
};

const normalizeLauncherEndMode = (setup, gameMode) => {
  const raw = String(setup?.endMode || '').trim().toLowerCase();
  let mode = (raw === 'count' || raw === 'time' || raw === 'time-attack' || raw === 'reach-top') ? raw : '';
  if (!mode) {
    const legacyJumpmap = String(setup?.jumpmapEndMode || '').trim().toLowerCase();
    if (legacyJumpmap === 'reach-top') {
      mode = 'reach-top';
    } else {
      const legacyQuiz = String(setup?.quizEndMode || '').trim().toLowerCase();
      mode = legacyQuiz === 'time' ? 'time' : 'count';
    }
  }
  if (gameMode !== 'jumpmap' && mode === 'reach-top') return 'count';
  return mode || 'count';
};

const normalizeBattleshipEndMode = (rawMode) => {
  const value = String(rawMode || '').trim().toLowerCase();
  if (value === 'ship-hp' || value === 'time' || value === 'kills') return value;
  return 'ship-hp';
};

const normalizeSetup = (setup) => {
  if (!setup || typeof setup !== 'object') return null;
  const players = Math.max(1, Math.min(6, Math.round(Number(setup.players) || 1)));
  const gameMode = typeof setup.gameMode === 'string' ? setup.gameMode : 'jumpmap';
  const quizPresetId = typeof setup.quizPresetId === 'string' ? setup.quizPresetId : 'jumpmap-net-30';
  const characterId = typeof setup.characterId === 'string' && setup.characterId.trim()
    ? setup.characterId.trim()
    : 'sejong';
  const jumpmapStartPointId = typeof setup.jumpmapStartPointId === 'string'
    ? setup.jumpmapStartPointId
    : '';
  const endMode = normalizeLauncherEndMode(setup, gameMode);
  const jumpmapEndMode = endMode === 'reach-top' ? 'reach-top' : 'none';
  const quizEndMode = (endMode === 'time' || endMode === 'time-attack') ? 'time' : 'count';
  const quizCountLimit = Math.max(20, Math.min(500, Math.round(Number(setup.quizCountLimit) || 20)));
  const quizTimeLimitSec = Math.max(10, Math.min(3600, Math.round(Number(setup.quizTimeLimitSec) || 300)));
  const battleshipEndMode = normalizeBattleshipEndMode(setup.battleshipEndMode);
  const battleshipTimeLimitSec = Math.max(10, Math.min(7200, Math.round(Number(setup.battleshipTimeLimitSec) || 180)));
  const battleshipKillLimit = Math.max(1, Math.min(9999, Math.round(Number(setup.battleshipKillLimit) || 120)));
  const playerNames = Array.isArray(setup.playerNames) ? setup.playerNames.slice(0, 6) : [];
  const playerTags = Array.isArray(setup.playerTags) ? setup.playerTags.slice(0, 6) : [];
  const playerCharacterIds = Array.isArray(setup.playerCharacterIds) ? setup.playerCharacterIds.slice(0, 6) : [];
  while (playerNames.length < players) playerNames.push(`사용자${playerNames.length + 1}`);
  while (playerTags.length < players) playerTags.push('');
  while (playerCharacterIds.length < players) playerCharacterIds.push(characterId);
  const normalizedNames = playerNames.slice(0, players).map((name, index) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    return trimmed || `사용자${index + 1}`;
  });
  const normalizedTags = playerTags.slice(0, players).map((tag) => {
    if (typeof tag !== 'string') return '';
    return tag.trim();
  });
  return {
    ...setup,
    players,
    gameMode,
    quizPresetId,
    characterId,
    jumpmapStartPointId,
    endMode,
    jumpmapEndMode,
    quizEndMode,
    quizCountLimit,
    quizTimeLimitSec,
    battleshipEndMode,
    battleshipTimeLimitSec,
    battleshipKillLimit,
    playerNames: normalizedNames,
    playerTags: normalizedTags,
    playerCharacterIds: playerCharacterIds.slice(0, players).map((id) => {
      if (typeof id !== 'string' || !id.trim()) return characterId;
      return id.trim();
    })
  };
};

const getStartTargetUrl = (setup) => {
  if (!setup) return null;
  if (setup.gameMode === 'jumpmap') {
    const url = new URL('../jumpmap-play/', window.location.href);
    url.searchParams.set('launchMode', 'play');
    url.searchParams.set('fromLauncher', '1');
    return url;
  }
  if (setup.gameMode === 'basic-quiz') {
    const url = new URL('../quiz/', window.location.href);
    url.searchParams.set('launchMode', 'play');
    url.searchParams.set('fromLauncher', '1');
    return url;
  }
  if (setup.gameMode === 'battleship-defense') {
    const url = new URL(
      setup.players > 1 ? '../battleship-play/split/' : '../battleship-play/',
      window.location.href
    );
    url.searchParams.set('launchMode', 'play');
    url.searchParams.set('fromLauncher', '1');
    return url;
  }
  return null;
};

const renderSummary = (box, setup) => {
  if (!box) return;
  box.innerHTML = '';
  const quizLabel = setup.quizPresetId === 'csv-upload'
    ? `업로드 CSV 문제${setup.customCsvFileName ? ` (${setup.customCsvFileName})` : ''}`
    : (QUIZ_PRESET_LABELS[setup.quizPresetId] || setup.quizPresetId);
  const rows = [
    ['플레이 인원', `${setup.players}명`],
    ['게임', GAME_LABELS[setup.gameMode] || setup.gameMode],
    ['퀴즈', quizLabel],
    [
      '종료 기준',
      setup.gameMode === 'battleship-defense'
        ? (setup.battleshipEndMode === 'time'
          ? `시간 도달 시 종료 (${setup.battleshipTimeLimitSec}초)`
          : (setup.battleshipEndMode === 'kills'
            ? `목표 격파 수 도달 시 종료 (${setup.battleshipKillLimit}킬)`
            : '거북선 체력 0 시 종료'))
        : (setup.endMode === 'reach-top'
          ? '꼭대기 도달 시 종료'
          : (setup.endMode === 'time'
            ? `시간 종료 (${setup.quizTimeLimitSec}초)`
            : (setup.endMode === 'time-attack'
              ? `타임어택 (${setup.quizTimeLimitSec}초 내 최대 풀이)`
              : `몇 문제 풀면 종료 (${setup.quizCountLimit}문제)`)))
    ],
    [
      '문제 소스',
      setup.customCsvEnabled && typeof setup.customCsvText === 'string' && setup.customCsvText.trim()
        ? `CSV 업로드 (${setup.customCsvFileName || '이름 없음'})`
        : '기본 프리셋'
    ],
    [
      '캐릭터',
      setup.gameMode === 'jumpmap'
        ? setup.playerCharacterIds
          .map((id, idx) => {
            const tag = setup.playerTags?.[idx];
            const label = CHARACTER_LABELS[id] || id;
            return tag ? `${idx + 1}P ${label}(${tag}번)` : `${idx + 1}P ${label}`;
          })
          .join(', ')
        : '사용 안 함'
    ],
    ['스타트 후보', setup.gameMode === 'jumpmap' ? (setup.jumpmapStartPointId || '시작지점') : '해당 없음'],
    [
      '플레이어 이름',
      setup.playerNames
        .map((name, idx) => {
          const tag = setup.playerTags?.[idx];
          return tag ? `${name}(${tag})` : name;
        })
        .join(', ')
    ]
  ];
  rows.forEach(([key, value]) => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = key;
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = value;
    row.append(k, v);
    box.appendChild(row);
  });
};

const setStatus = (text) => {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
};

const showError = (message) => {
  const errorBox = document.getElementById('error-box');
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.add('show');
};

const clearError = () => {
  const errorBox = document.getElementById('error-box');
  if (!errorBox) return;
  errorBox.textContent = '';
  errorBox.classList.remove('show');
};

const startRouting = () => {
  clearError();
  const setup = normalizeSetup(readLauncherSetup());
  const summaryBox = document.getElementById('summary-box');
  if (!setup) {
    setStatus('메인화면 설정을 찾지 못했습니다');
    if (summaryBox) summaryBox.innerHTML = '';
    showError('메인화면에서 인원/퀴즈/게임을 먼저 선택한 뒤 시작해 주세요.');
    return;
  }

  renderSummary(summaryBox, setup);
  const targetUrl = getStartTargetUrl(setup);
  if (!targetUrl) {
    setStatus('알 수 없는 게임 모드입니다');
    showError(`지원하지 않는 게임 모드: ${setup.gameMode}`);
    return;
  }

  setStatus('게임 화면으로 이동하는 중...');
  window.setTimeout(() => {
    window.location.replace(targetUrl.toString());
  }, 200);
};

document.getElementById('retry-btn')?.addEventListener('click', () => {
  startRouting();
});

startRouting();
