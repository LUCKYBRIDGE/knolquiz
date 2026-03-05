const STORAGE_KEY = 'jumpmap.launcher.setup.v1';

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

const applyGridLayout = (players) => {
  const grid = document.getElementById('split-grid');
  if (!grid) return;
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, players)}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = '1fr';
};

const buildIframeSrc = (index) => {
  const params = new URLSearchParams(window.location.search);
  const src = new URL('../', window.location.href);
  src.searchParams.set('launchMode', params.get('launchMode') || 'play');
  src.searchParams.set('fromLauncher', params.get('fromLauncher') || '1');
  src.searchParams.set('single', '1');
  src.searchParams.set('split', '1');
  src.searchParams.set('playerIndex', String(index));
  return src.toString();
};

const renderSplitFrames = (setup) => {
  const grid = document.getElementById('split-grid');
  if (!grid) return;
  grid.innerHTML = '';
  applyGridLayout(setup.players);

  setup.participants.forEach((_participant, index) => {
    const pane = document.createElement('section');
    pane.className = 'pane';

    const iframe = document.createElement('iframe');
    iframe.loading = 'eager';
    iframe.src = buildIframeSrc(index);
    pane.appendChild(iframe);
    grid.appendChild(pane);
  });
};

const start = () => {
  const setup = normalizeSetup(readSetup());
  if (setup.players <= 1) {
    const target = new URL('../', window.location.href);
    target.searchParams.set('launchMode', 'play');
    target.searchParams.set('fromLauncher', '1');
    window.location.replace(target.toString());
    return;
  }
  renderSplitFrames(setup);
  window.addEventListener('resize', () => applyGridLayout(setup.players), { passive: true });
};

start();
