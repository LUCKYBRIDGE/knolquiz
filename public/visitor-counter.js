// Shared lightweight visitor counter for the three KNOL services.
// Counts browser-local anonymous IDs, not identifiable people.
const script = document.currentScript;
const SITE = script?.dataset.site;
const DISPLAY = script?.dataset.display !== 'false';
const ENDPOINT = 'https://stats.knolquiz.com/api/visit';
const LABELS = { quiz: '놀퀴즈', print: '놀프린트', art: '놀아트' };
const HOSTS = {
  quiz: new Set(['knolquiz.com', 'www.knolquiz.com']),
  print: new Set(['print.knolquiz.com']),
  art: new Set(['art.knolquiz.com'])
};

if (LABELS[SITE] && HOSTS[SITE]?.has(location.hostname)) {
  let node = null;
  let today = null;
  let total = null;

  if (DISPLAY) {
    const style = document.createElement('style');
    style.textContent = '.knol-visitor-counter{max-width:1100px;margin:12px auto 24px;padding:8px 12px;text-align:center;font:500 12px/1.65 system-ui,-apple-system,sans-serif;color:#536070}.knol-visitor-counter span{display:inline-block;margin:0 8px}.knol-visitor-counter strong{font-variant-numeric:tabular-nums;color:inherit}.knol-visitor-counter[hidden]{display:none}@media print{.knol-visitor-counter{display:none!important}}';
    document.head.append(style);
    node = document.createElement('footer');
    node.className = 'knol-visitor-counter';
    node.setAttribute('aria-label', LABELS[SITE] + ' 방문자 통계');
    node.hidden = true;
    today = document.createElement('strong');
    total = document.createElement('strong');
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.append('오늘의 방문자 ', today, '명');
    b.append('누적 방문자 ', total, '명');
    node.append(a, ' · ', b);
    const mount = () => document.body.append(node);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  const key = 'knol-visitor-id-v1';
  let id;
  try {
    id = localStorage.getItem(key);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  } catch {
    id = null;
  }

  if (id) {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: SITE, visitorId: id }),
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      referrerPolicy: 'no-referrer'
    }).then(async response => {
      if (!response.ok) throw new Error('counter unavailable');
      return response.json();
    }).then(data => {
      if (data?.site !== SITE || !Number.isSafeInteger(data.today) || !Number.isSafeInteger(data.total)) return;
      if (DISPLAY && node && today && total) {
        today.textContent = new Intl.NumberFormat('ko-KR').format(data.today);
        total.textContent = new Intl.NumberFormat('ko-KR').format(data.total);
        node.hidden = false;
      }
    }).catch(() => {
      // Visitor statistics must never block the site.
    });
  }
}
