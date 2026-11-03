// Shared lightweight visitor counter for the three KNOL services.
// This counts browser installations, not identifiable people.
const SITE = document.currentScript?.dataset.site;
const ENDPOINT = 'https://stats.knolquiz.com/api/visit';
const LABELS = { quiz: '놀퀴즈', print: '놀프린트', art: '놀아트' };
if (LABELS[SITE]) {
  const style = document.createElement('style');
  style.textContent = '.knol-visitor-counter{max-width:1100px;margin:12px auto 24px;padding:8px 12px;text-align:center;font:500 12px/1.65 system-ui,-apple-system,sans-serif;color:#536070}.knol-visitor-counter span{display:inline-block;margin:0 8px}.knol-visitor-counter strong{font-variant-numeric:tabular-nums;color:inherit}.knol-visitor-counter[hidden]{display:none}';
  document.head.append(style);
  const node = document.createElement('footer');
  node.className = 'knol-visitor-counter';
  node.setAttribute('aria-label', LABELS[SITE] + ' 방문자 통계');
  node.hidden = true;
  const today = document.createElement('strong');
  const total = document.createElement('strong');
  const a = document.createElement('span');
  const b = document.createElement('span');
  a.append('오늘의 방문자 ', today, '명');
  b.append('누적 방문자 ', total, '명');
  node.append(a, ' · ', b);
  const mount = () => document.body.append(node);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();

  const key = 'knol-visitor-id-v1';
  let id;
  try {
    id = localStorage.getItem(key);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  } catch {
    // Private browsing or disabled storage: do not fabricate persistent counts.
    id = null;
  }
  if (id) {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: SITE, visitorId: id }),
      cache: 'no-store',
      mode: 'cors'
    }).then(async response => {
      if (!response.ok) throw new Error('counter unavailable');
      return response.json();
    }).then(data => {
      if (!Number.isSafeInteger(data.today) || !Number.isSafeInteger(data.total)) return;
      today.textContent = new Intl.NumberFormat('ko-KR').format(data.today);
      total.textContent = new Intl.NumberFormat('ko-KR').format(data.total);
      node.hidden = false;
    }).catch(() => {
      // The site remains usable if analytics is not configured or offline.
    });
  }
}
