const ORIGINS = {
  quiz: new Set(['https://knolquiz.com', 'https://www.knolquiz.com']),
  print: new Set(['https://print.knolquiz.com']),
  art: new Set(['https://art.knolquiz.com'])
};
const isAllowedOrigin = origin => Object.values(ORIGINS).some(origins => origins.has(origin));
const headersFor = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
  'Cache-Control': 'no-store'
});
const json = (value, status, origin) => new Response(JSON.stringify(value), {
  status,
  headers: { ...headersFor(origin), 'Content-Type': 'application/json; charset=utf-8' }
});
function koreanDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
async function digest(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/visit') return new Response('Not found', { status: 404 });
    const origin = request.headers.get('Origin');
    if (!isAllowedOrigin(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin) });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
    if (!env.DB || !env.VISITOR_SALT) return json({ error: 'Service not configured' }, 503, origin);
    if (Number(request.headers.get('content-length') || 0) > 1024) return json({ error: 'Too large' }, 413, origin);
    try {
      const body = await request.json();
      if (!body || !Object.hasOwn(ORIGINS, body.site) || !ORIGINS[body.site].has(origin) ||
          typeof body.visitorId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.visitorId)) {
        return json({ error: 'Invalid request' }, 400, origin);
      }
      const site = body.site;
      const date = koreanDate();
      const visitor = await digest(`${env.VISITOR_SALT}:${site}:${body.visitorId}`);
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO visitors (site, visitor_hash) VALUES (?, ?)').bind(site, visitor),
        env.DB.prepare('INSERT OR IGNORE INTO daily_visits (site, visit_date, visitor_hash) VALUES (?, ?, ?)').bind(site, date, visitor)
      ]);
      const [daily, lifetime] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS count FROM daily_visits WHERE site = ? AND visit_date = ?').bind(site, date),
        env.DB.prepare('SELECT COUNT(*) AS count FROM visitors WHERE site = ?').bind(site)
      ]);
      return json({ site, date, today: daily.results[0].count, total: lifetime.results[0].count }, 200, origin);
    } catch (error) {
      console.error('Visitor counter error', error);
      return json({ error: 'Counter temporarily unavailable' }, 503, origin);
    }
  }
};
