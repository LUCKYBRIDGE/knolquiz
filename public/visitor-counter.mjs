const SITE_ID = 'knolquiz';
const SITE_LABEL = '놀퀴즈';
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

async function readOrIncrement(key, markerKey) {
  const alreadyCounted = storageGet(markerKey) === '1';
  const response = await fetch(counterUrl(key, alreadyCounted), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error(`counter request failed: ${response.status}`);
  const data = await response.json();
  const value = Number(data?.value);
  if (!Number.isFinite(value)) throw new Error('counter response is invalid');
  if (!alreadyCounted) storageSet(markerKey, '1');
  return value;
}

function mountWidget() {
  if (!shouldDisplay) return null;
  const style = document.createElement('style');
  style.textContent = `
    .knol-visitor-counter {
      position: fixed;
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 70;
      display: inline-flex;
      align-items: center;
      gap: 8px;
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
    .knol-visitor-counter strong { color: #0f172a; font-weight: 800; }
    .knol-visitor-counter .knol-visitor-dot { color: #94a3b8; }
    @media (max-width: 640px) {
      .knol-visitor-counter {
        right: 8px;
        bottom: 8px;
        min-height: 32px;
        padding: 6px 9px;
        font-size: 11px;
      }
    }
    @media print { .knol-visitor-counter { display: none !important; } }
  `;
  document.head.append(style);

  const widget = document.createElement('div');
  widget.className = 'knol-visitor-counter';
  widget.setAttribute('role', 'status');
  widget.setAttribute('aria-live', 'polite');
  widget.setAttribute('aria-label', `${SITE_LABEL} 방문자 수`);
  widget.innerHTML = '<span>오늘 <strong data-visitor-today>–</strong></span><span class="knol-visitor-dot" aria-hidden="true">·</span><span>누적 <strong data-visitor-total>–</strong></span>';
  document.body.append(widget);
  return widget;
}

async function run() {
  const widget = mountWidget();
  const date = koreaDateKey();
  const totalKey = `${SITE_ID}-total`;
  const todayKey = `${SITE_ID}-${date}`;
  const totalMarker = `knol-visitor:v1:${SITE_ID}:total:${date}`;
  const todayMarker = `knol-visitor:v1:${SITE_ID}:today:${date}`;

  try {
    const [today, total] = await Promise.all([
      readOrIncrement(todayKey, todayMarker),
      readOrIncrement(totalKey, totalMarker)
    ]);
    if (widget) {
      widget.querySelector('[data-visitor-today]').textContent = today.toLocaleString('ko-KR');
      widget.querySelector('[data-visitor-total]').textContent = total.toLocaleString('ko-KR');
      widget.title = '같은 브라우저에서는 하루 한 번만 방문으로 집계합니다.';
    }
  } catch (error) {
    console.warn('[visitor-counter] 방문자 수를 불러오지 못했습니다.', error);
    if (widget) widget.remove();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}
