const STORAGE_KEY = 'jumpmap.launcher.setup.v1';
const CHARACTER_LABELS = {
  sejong: '세종',
  leesunsin: '이순신'
};

const normalizeRuntimeImpl = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'native') return 'native';
  if (normalized === 'shell') return 'shell';
  return 'legacy';
};

const readSetup = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('[JumpmapPlay] failed to read launcher setup', error);
    return null;
  }
};

const normalizeLauncherEndMode = (setup) => {
  const raw = String(setup?.endMode || '').trim().toLowerCase();
  if (raw === 'count' || raw === 'time' || raw === 'time-attack' || raw === 'reach-top') return raw;
  const legacyJumpmap = String(setup?.jumpmapEndMode || '').trim().toLowerCase();
  if (legacyJumpmap === 'reach-top') return 'reach-top';
  const legacyQuiz = String(setup?.quizEndMode || '').trim().toLowerCase();
  return legacyQuiz === 'time' ? 'time' : 'count';
};

const normalizeSetup = (setup) => {
  if (!setup || typeof setup !== 'object') return null;
  const players = Math.max(1, Math.min(6, Math.round(Number(setup.players) || 1)));
  const quizPresetId = typeof setup.quizPresetId === 'string' && setup.quizPresetId.trim()
    ? setup.quizPresetId.trim()
    : 'jumpmap-net-30';
  const characterId = typeof setup.characterId === 'string' && setup.characterId.trim()
    ? setup.characterId.trim()
    : 'sejong';
  const jumpmapStartPointId = typeof setup.jumpmapStartPointId === 'string'
    ? setup.jumpmapStartPointId
    : '';
  const endMode = normalizeLauncherEndMode(setup);
  const jumpmapEndMode = endMode === 'reach-top' ? 'reach-top' : 'none';
  const names = Array.isArray(setup.playerNames) ? setup.playerNames.slice(0, 6) : [];
  const tags = Array.isArray(setup.playerTags) ? setup.playerTags.slice(0, 6) : [];
  const playerCharacterIds = Array.isArray(setup.playerCharacterIds) ? setup.playerCharacterIds.slice(0, 6) : [];
  while (names.length < players) names.push(`사용자${names.length + 1}`);
  while (tags.length < players) tags.push('');
  while (playerCharacterIds.length < players) playerCharacterIds.push(characterId);
  return {
    ...setup,
    players,
    quizPresetId,
    characterId,
    jumpmapStartPointId,
    endMode,
    jumpmapEndMode,
    playerNames: names.slice(0, players).map((name, index) => {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `사용자${index + 1}`;
    }),
    playerTags: tags.slice(0, players).map((tag) => {
      if (typeof tag !== 'string') return '';
      return tag.trim();
    }),
    playerCharacterIds: playerCharacterIds.slice(0, players).map((id) => {
      if (typeof id !== 'string' || !id.trim()) return characterId;
      return id.trim();
    })
  };
};

const setStatus = (text) => {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
};

const showError = (text) => {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
};

const clearError = () => {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
};

const renderSummary = (setup) => {
  const box = document.getElementById('summary-box');
  if (!box) return;
  box.innerHTML = '';
  const rows = [
    ['플레이 인원', `${setup.players}명`],
    ['퀴즈 프리셋', setup.quizPresetId],
    [
      '캐릭터',
      setup.playerCharacterIds
        .map((id, idx) => {
          const tag = setup.playerTags?.[idx];
          const label = CHARACTER_LABELS[id] || id;
          return tag ? `${idx + 1}P ${label}(${tag}번)` : `${idx + 1}P ${label}`;
        })
        .join(', ')
    ],
    [
      '점프맵 종료 기준',
      setup.endMode === 'reach-top'
        ? '꼭대기 도달 시 종료'
        : (setup.endMode === 'time'
          ? `시간 종료 (${Math.max(10, Math.min(3600, Math.round(Number(setup.quizTimeLimitSec) || 300)))}초)`
          : (setup.endMode === 'time-attack'
            ? `타임어택 (${Math.max(10, Math.min(3600, Math.round(Number(setup.quizTimeLimitSec) || 300)))}초 내 최대 풀이)`
            : `몇 문제 풀면 종료 (${Math.max(20, Math.min(500, Math.round(Number(setup.quizCountLimit) || 20)))}문제)`))
    ],
    ['스타트 후보', setup.jumpmapStartPointId || '시작지점'],
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
    row.className = 'row';
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

const buildJumpmapRuntimeUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedRuntimeImpl = normalizeRuntimeImpl(params.get('runtimeImpl'));
  const passthroughKeys = [
    'runtimeDebug',
    'runtimeDebugUi',
    'runtimeShellDebug',
    'resolveBridgeValidate',
    'resolveBridgeSmoke',
    'resolveBridgeCompare',
    'resolveHorizontalApply',
    'resolveVerticalApply',
    'runtimeRedirectDelayMs',
    'nativeShellOnly',
    'nativeStay'
  ];
  const url = new URL('../jumpmap-runtime/', window.location.href);
  url.searchParams.set('launchMode', 'play');
  url.searchParams.set('fromLauncher', '1');
  url.searchParams.set('runtimeImpl', requestedRuntimeImpl);
  passthroughKeys.forEach((key) => {
    if (!params.has(key)) return;
    const value = String(params.get(key) || '');
    if (!value.trim()) return;
    url.searchParams.set(key, value);
  });
  if (requestedRuntimeImpl === 'native') {
    url.searchParams.set('nativePlay', '1');
    url.searchParams.set('nativeStay', '1');
  } else if (requestedRuntimeImpl === 'legacy') {
    // Normal user flow: skip runtime shell dwell and enter play immediately.
    url.searchParams.set('runtimeRedirectDelayMs', '0');
  }
  return url;
};

const start = () => {
  clearError();
  const setup = normalizeSetup(readSetup());
  if (!setup) {
    setStatus('메인화면 설정을 찾지 못했습니다');
    showError('메인화면에서 인원/퀴즈/게임을 선택한 뒤 다시 시작해 주세요.');
    return;
  }
  renderSummary(setup);
  setStatus('점프맵 화면으로 이동하는 중...');
  const targetUrl = buildJumpmapRuntimeUrl();
  window.setTimeout(() => {
    window.location.replace(targetUrl.toString());
  }, 180);
};

document.getElementById('retry-btn')?.addEventListener('click', () => {
  start();
});

start();
