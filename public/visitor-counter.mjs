const SITE = Object.freeze({
  "id": "knolquiz",
  "label": "놀퀴즈",
  "namespace": "knolquiz.com",
  "productionHosts": [
    "knolquiz.com",
    "www.knolquiz.com"
  ]
});

const API_BASE = 'https://counterapi.com/api';

function koreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function endpointFor(key, readOnly) {
  const query = new URLSearchParams({ unique: 'true' });
  if (readOnly) query.set('readOnly', 'true');
  return `${API_BASE}/${encodeURIComponent(SITE.namespace)}/visit/${encodeURIComponent(key)}?${query.toString()}`;
}

async function fetchCount(key, readOnly) {
  const response = await fetch(endpointFor(key, readOnly), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error(`visitor counter request failed: ${response.status}`);
  const data = await response.json();
  const value = Number(data?.value);
  if (!Number.isFinite(value)) throw new Error('visitor counter returned an invalid value');
  return Math.max(0, Math.trunc(value));
}

function mountCounter() {
  const existing = document.querySelector('[data-visitor-counter]');
  if (existing) return existing;

  const counter = document.createElement('div');
  counter.className = 'visitor-counter';
  counter.dataset.visitorCounter = SITE.id;
  counter.setAttribute('role', 'status');
  counter.setAttribute('aria-live', 'polite');
  counter.title = '같은 사용자의 반복 새로고침은 중복 집계를 줄여 표시합니다.';
  counter.innerHTML = `
    <span class="visitor-counter__label">방문자</span>
    <span>오늘 <strong data-visitor-today>–</strong></span>
    <span class="visitor-counter__dot" aria-hidden="true">·</span>
    <span>누적 <strong data-visitor-total>–</strong></span>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .visitor-counter {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.38rem;
      width: fit-content;
      margin-left: auto;
      padding: 0.38rem 0.58rem;
      border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, Canvas 88%, transparent);
      color: inherit;
      font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
      opacity: 0.76;
      white-space: nowrap;
    }
    .visitor-counter__label {
      font-weight: 800;
      opacity: 0.72;
    }
    .visitor-counter strong {
      font-variant-numeric: tabular-nums;
      font-weight: 900;
    }
    .visitor-counter__dot {
      opacity: 0.5;
    }
    .hero > .visitor-counter,
    .intro > .visitor-counter {
      margin: 0.7rem 0 0;
    }
    @media (max-width: 640px) {
      .visitor-counter {
        margin-left: 0;
        font-size: 11px;
      }
    }
  `;
  document.head.append(style);

  const host =
    document.querySelector('.site-footer') ||
    document.querySelector('footer') ||
    document.querySelector('.hero') ||
    document.querySelector('.intro') ||
    document.querySelector('.topbar') ||
    document.body;
  host.append(counter);
  return counter;
}

async function updateCounter() {
  const counter = mountCounter();
  const todayEl = counter.querySelector('[data-visitor-today]');
  const totalEl = counter.querySelector('[data-visitor-total]');
  const readOnly = !SITE.productionHosts.includes(window.location.hostname);
  const todayKey = `visitors-${koreaDateKey()}`;

  const [todayResult, totalResult] = await Promise.allSettled([
    fetchCount(todayKey, readOnly),
    fetchCount('visitors-total', readOnly)
  ]);

  const format = value => new Intl.NumberFormat('ko-KR').format(value);

  if (todayResult.status === 'fulfilled') {
    todayEl.textContent = format(todayResult.value);
  }
  if (totalResult.status === 'fulfilled') {
    totalEl.textContent = format(totalResult.value);
  }

  if (todayResult.status === 'rejected' || totalResult.status === 'rejected') {
    counter.title = '방문자 수를 일부 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    console.warn('[visitor-counter] 일부 집계 값을 불러오지 못했습니다.', {
      today: todayResult.status === 'rejected' ? todayResult.reason : null,
      total: totalResult.status === 'rejected' ? totalResult.reason : null
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateCounter, { once: true });
} else {
  updateCounter();
}
