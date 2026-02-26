export const JUMPMAP_LAUNCHER_SETUP_STORAGE_KEY = 'jumpmap.launcher.setup.v1';
export const JUMPMAP_RUNTIME_BOOTSTRAP_SESSION_KEY = 'jumpmap.runtime.bootstrap.v1';

const normalizeRuntimeMapName = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const segments = trimmed.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = segments.length ? segments[segments.length - 1] : '';
  if (!base) return '';
  const withExt = base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
  if (!/^[A-Za-z0-9._-]+\.json$/.test(withExt)) return '';
  return withExt;
};

const safeResolveUrl = (raw, baseHref) => {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    return new URL(raw.trim(), baseHref).toString();
  } catch (_error) {
    return '';
  }
};

export const readJumpmapLauncherSetup = () => {
  try {
    const raw = window.localStorage.getItem(JUMPMAP_LAUNCHER_SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('[JumpmapRuntimeLauncher] failed to read launcher setup', error);
    return null;
  }
};

export const normalizeJumpmapLauncherSetup = (setup) => {
  if (!setup || typeof setup !== 'object') return null;
  const players = Math.max(1, Math.min(6, Math.round(Number(setup.players) || 1)));
  const names = Array.isArray(setup.playerNames) ? setup.playerNames.slice(0, 6) : [];
  const tags = Array.isArray(setup.playerTags) ? setup.playerTags.slice(0, 6) : [];
  while (names.length < players) names.push(`사용자${names.length + 1}`);
  while (tags.length < players) tags.push('');
  return {
    ...setup,
    players,
    quizPresetId:
      typeof setup.quizPresetId === 'string' && setup.quizPresetId.trim()
        ? setup.quizPresetId.trim()
        : 'jumpmap-net-30',
    characterId:
      typeof setup.characterId === 'string' && setup.characterId.trim()
        ? setup.characterId.trim()
        : 'sejong',
    jumpmapStartPointId: typeof setup.jumpmapStartPointId === 'string' ? setup.jumpmapStartPointId : '',
    playerNames: names.slice(0, players).map((name, index) => {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `사용자${index + 1}`;
    }),
    playerTags: tags.slice(0, players).map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
  };
};

export const getJumpmapRuntimeMapCandidates = (baseHref = window.location.href) => {
  const base = new URL(baseHref, window.location.href);
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (url, label = 'runtime-map') => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, label });
  };

  const explicitUrl =
    safeResolveUrl(base.searchParams.get('runtimeMapUrl') || '', base) ||
    safeResolveUrl(base.searchParams.get('mapUrl') || '', base);
  if (explicitUrl) pushCandidate(explicitUrl, 'query:url');

  const explicitName = normalizeRuntimeMapName(
    base.searchParams.get('runtimeMapName') ||
    base.searchParams.get('mapName') ||
    ''
  );
  if (explicitName) {
    pushCandidate(new URL(`../shared/maps/${explicitName}`, base).toString(), 'query:name');
  }

  pushCandidate(new URL('../shared/maps/jumpmap-01.json', base).toString(), 'default:shared');
  pushCandidate(new URL('/__jumpmap/runtime-map.json', base.origin).toString(), 'fallback:legacy-runtime-map');
  return candidates;
};

export const loadJumpmapRuntimeMap = async (baseHref = window.location.href) => {
  const candidates = getJumpmapRuntimeMapCandidates(baseHref);
  let lastError = null;
  for (const candidate of candidates) {
    const url = candidate?.url || '';
    if (!url) continue;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json || typeof json !== 'object') throw new Error('invalid map json');
      return { map: json, url, source: candidate?.label || 'runtime-map' };
    } catch (error) {
      lastError = error;
      console.warn('[JumpmapRuntimeLauncher] runtime map load failed', url, error);
    }
  }
  return { map: null, url: null, source: null, error: lastError };
};

export const cacheJumpmapRuntimeBootstrap = (payload) => {
  try {
    if (!payload || typeof payload !== 'object') return false;
    const now = Date.now();
    const record = {
      version: 1,
      cachedAt: now,
      ...payload
    };
    window.sessionStorage.setItem(JUMPMAP_RUNTIME_BOOTSTRAP_SESSION_KEY, JSON.stringify(record));
    return true;
  } catch (error) {
    console.warn('[JumpmapRuntimeLauncher] failed to cache runtime bootstrap', error);
    return false;
  }
};

const applyLegacyJumpmapPlayDefaults = (url) => {
  if (!(url instanceof URL)) return url;
  url.searchParams.set('launchMode', 'play');
  url.searchParams.set('fromLauncher', '1');
  url.searchParams.set('autoStartTest', '1');
  url.searchParams.set('autoRestartTest', '1');
  return url;
};

export const buildJumpmapRuntimeLegacyPlayUrl = (baseHref = window.location.href) => {
  const current = new URL(baseHref, window.location.href);
  const url = new URL('../jumpmap-runtime/legacy/', current);
  current.searchParams.forEach((value, key) => {
    if (!key) return;
    url.searchParams.set(key, value);
  });
  return applyLegacyJumpmapPlayDefaults(url);
};

// Backward-compatible alias while runtime shell callers are migrated.
export const buildLegacyJumpmapEditorPlayUrl = (baseHref = window.location.href) => {
  const url = new URL('../jumpmap-editor/', baseHref);
  return applyLegacyJumpmapPlayDefaults(url);
};
