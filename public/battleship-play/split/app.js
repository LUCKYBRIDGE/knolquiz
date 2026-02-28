const STORAGE_KEY = 'jumpmap.launcher.setup.v1';

const els = {
  title: document.getElementById('title-text'),
  subtitle: document.getElementById('subtitle-text'),
  status: document.getElementById('status-box'),
  grid: document.getElementById('split-grid')
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const readSetup = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const normalizeSetup = (source) => {
  const setup = source && typeof source === 'object' ? source : {};
  const players = clamp(Math.round(Number(setup.players) || 1), 1, 6);
  const names = Array.isArray(setup.playerNames) ? setup.playerNames.slice(0, 6) : [];
  const tags = Array.isArray(setup.playerTags) ? setup.playerTags.slice(0, 6) : [];
  while (names.length < players) names.push(`사용자${names.length + 1}`);
  while (tags.length < players) tags.push('');
  const participants = names.slice(0, players).map((name, index) => ({
    name: String(name || '').trim() || `사용자${index + 1}`,
    tag: String(tags[index] || '').trim()
  }));
  return { players, participants };
};

const getGridColumns = (players) => {
  if (players <= 1) return 1;
  if (players <= 2) return 2;
  if (players <= 4) return 2;
  return 3;
};

const applyGridLayout = (setup) => {
  if (!els.grid) return;
  const players = setup.players;
  const columns = getGridColumns(players);
  const rows = Math.max(1, Math.ceil(players / columns));
  const topbarHeight = document.querySelector('.topbar')?.offsetHeight || 0;
  const statusHeight = els.status?.offsetHeight || 0;
  const viewportHeight = Math.max(540, window.innerHeight || 0);
  const verticalPadding = 44;
  const gapY = 10;
  const available = Math.max(320, viewportHeight - topbarHeight - statusHeight - verticalPadding);
  const paneHeight = Math.max(240, Math.floor((available - (rows - 1) * gapY) / rows));

  els.grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  els.grid.style.gridAutoRows = `${paneHeight}px`;
};

const setStatus = (text) => {
  if (els.status) els.status.textContent = text;
};

const renderSplitFrames = (setup) => {
  if (!els.grid) return;
  els.grid.innerHTML = '';
  applyGridLayout(setup);

  setup.participants.forEach((participant, index) => {
    const pane = document.createElement('section');
    pane.className = 'pane';

    const head = document.createElement('div');
    head.className = 'pane-head';
    const player = document.createElement('span');
    player.className = 'player';
    player.textContent = participant.tag
      ? `${index + 1}P · ${participant.name}(${participant.tag})`
      : `${index + 1}P · ${participant.name}`;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = '독립 전투';
    head.append(player, hint);

    const frameWrap = document.createElement('div');
    const iframe = document.createElement('iframe');
    const src = new URL('../', window.location.href);
    src.searchParams.set('single', '1');
    src.searchParams.set('split', '1');
    src.searchParams.set('playerIndex', String(index));
    iframe.src = src.toString();
    iframe.loading = 'eager';
    frameWrap.appendChild(iframe);

    pane.append(head, frameWrap);
    els.grid.appendChild(pane);
  });
};

const start = () => {
  const setup = normalizeSetup(readSetup());
  if (setup.players <= 1) {
    setStatus('1인 모드는 분할 화면을 사용하지 않습니다. 거북선 화면으로 이동합니다.');
    const target = new URL('../', window.location.href);
    window.setTimeout(() => {
      window.location.replace(target.toString());
    }, 120);
    return;
  }

  if (els.title) {
    els.title.textContent = `거북선 디펜스 · ${setup.players}인 분할 화면`;
  }
  if (els.subtitle) {
    els.subtitle.textContent = '각 화면은 독립 전투입니다. 각자 퀴즈를 풀어 자신의 거북선을 강화하세요.';
  }
  renderSplitFrames(setup);
  setStatus(`${setup.players}인 분할 화면 구성 완료 · 각 화면에서 개별 플레이가 진행됩니다.`);
  window.addEventListener('resize', () => applyGridLayout(setup), { passive: true });
};

start();
