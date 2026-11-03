const SITE_ID = "knolquiz";
const SITE_LABEL = "놀퀴즈";
const PRODUCTION_HOSTS = Object.freeze(["knolquiz.com","www.knolquiz.com"]);
const COUNTER_NAMESPACE = 'knol-series-2026';
const COUNTER_ACTION = 'visit';
const API_BASE = 'https://counterapi.com/api';

const params = new URL(import.meta.url).searchParams;
const shouldDisplay = params.get('display') !== '0';

function koreaDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function counterUrl(key, readOnly) {
  const url = new URL(`${API_BASE}/${encodeURIComponent(COUNTER_NAMESPACE)}/${encodeURIComponent(COUNTER_ACTION)}/${encodeURIComponent(key)}`);
  if (readOnly) url.searchParams.set('readOnly', 'true');
  return url.toString();
}

async function readOrIncrement(key, markerKey, isProduction) {
  const alreadyCounted = storageGet(markerKey) === '1';
  const shouldIncrement = isProduction && !alreadyCounted;
  const response = await fetch(counterUrl(key, !shouldIncrement), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error(`counter request failed: ${response.status}`);
  const data = await response.json();
  const value = Number(data?.value);
  if (!Number.isFinite(value)) throw new Error('counter response is invalid');
  if (shouldIncrement) storageSet(markerKey, '1');
  return Math.max(0, Math.trunc(value));
}

function mountWidget() {
  if (!shouldDisplay) return null;
  const existing = document.querySelector('[data-knol-visitor-counter]');
  if (existing) return existing;

  const style = document.createElement('style');
  style.textContent = `
    .knol-visitor-counter {
      position: fixed;
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 70;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 34px;
      padding: 7px 10px;
      border: 1px solid rgba(71, 85, 105, .18);
      border-radius: 999px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 6px 18px rgba(15, 23, 42, .10);
      color: #475569;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
      letter-spacing: -.01em;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .knol-visitor-counter strong { color: #0f172a; font-weight: 800; font-variant-numeric: tabular-nums; }
    .knol-visitor-counter .knol-visitor-label { color: #64748b; }
    .knol-visitor-counter .knol-visitor-dot { color: #94a3b8; }
    @media (max-width: 640px) {
      .knol-visitor-counter {
        right: 8px;
        bottom: 8px;
        min-height: 32px;
        padding: 6px 9px;
        gap: 6px;
        font-size: 11px;
      }
      .knol-visitor-counter .knol-visitor-label { display: none; }
    }
    @media print { .knol-visitor-counter { display: none !important; } }
  `;
  document.head.append(style);

  const widget = document.createElement('div');
  widget.className = 'knol-visitor-counter';
  widget.dataset.knolVisitorCounter = SITE_ID;
  widget.setAttribute('role', 'status');
  widget.setAttribute('aria-live', 'polite');
  widget.setAttribute('aria-label', `${SITE_LABEL} 방문자 수`);
  widget.innerHTML = '<span class="knol-visitor-label">방문자</span><span>오늘 <strong data-visitor-today>–</strong></span><span class="knol-visitor-dot" aria-hidden="true">·</span><span>누적 <strong data-visitor-total>–</strong></span>';
  document.body.append(widget);
  return widget;
}

async function run() {
  const widget = mountWidget();
  const date = koreaDateKey();
  const isProduction = PRODUCTION_HOSTS.includes(window.location.hostname);
  const todayKey = `${SITE_ID}-${date}`;
  const totalKey = `${SITE_ID}-total`;
  const todayMarker = `knol-visitor:v2:${SITE_ID}:today:${date}`;
  const totalMarker = `knol-visitor:v2:${SITE_ID}:total:${date}`;

  const [todayResult, totalResult] = await Promise.allSettled([
    readOrIncrement(todayKey, todayMarker, isProduction),
    readOrIncrement(totalKey, totalMarker, isProduction)
  ]);

  if (widget) {
    if (todayResult.status === 'fulfilled') {
      widget.querySelector('[data-visitor-today]').textContent = todayResult.value.toLocaleString('ko-KR');
    }
    if (totalResult.status === 'fulfilled') {
      widget.querySelector('[data-visitor-total]').textContent = totalResult.value.toLocaleString('ko-KR');
    }
    widget.title = '같은 브라우저에서는 하루 한 번만 방문으로 집계합니다. 누적 수는 날짜별 방문을 계속 더한 값입니다.';
    if (todayResult.status === 'rejected' && totalResult.status === 'rejected') {
      widget.remove();
    }
  }

  if (todayResult.status === 'rejected' || totalResult.status === 'rejected') {
    console.warn('[visitor-counter] 일부 방문자 수를 불러오지 못했습니다.', {
      today: todayResult.status === 'rejected' ? todayResult.reason : null,
      total: totalResult.status === 'rejected' ? totalResult.reason : null
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}
