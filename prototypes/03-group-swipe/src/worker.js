// API for Night Out. Everything else is static files in public/.
//
//   GET  /api/signals?area=soho        public: picks + avoids (yours and research's), and usage stats, for ranking
//   POST /api/event                     public: { area, shown:[ids], swapped:[ids], kept:[ids] } usage counts
//   GET  /api/curation?area=soho        curator: every row incl. research suggestions
//   POST /api/curation                  curator: { area, id, verdict: pick|avoid|dismissed|none, note }
//   POST /api/curation/suggestions      curator: { area, items:[{ id, kind: pick|avoid, note, sources }] }
//   POST /api/curation/auto             curator: same body; replaces the area's research picks/avoids, goes live
//
// Curator routes need "Authorization: Bearer <CURATOR_TOKEN>" (a Worker secret).

const VENUE_ID = /^[nwr]\d{1,12}$/;
const MAX_IDS = 8;

let areaIds = null;
async function knownArea(env, url, id){
  if (!areaIds) {
    const res = await env.ASSETS.fetch(new URL('/data/areas.json', url));
    areaIds = new Set((await res.json()).map(a => a.id));
  }
  return areaIds.has(id);
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error:'Forbidden' }, 403);

    try {
      const route = request.method + ' ' + url.pathname;
      if (route === 'GET /api/signals') return await signals(url, env);
      if (route === 'POST /api/event') return await event(request, url, env);
      if (url.pathname.startsWith('/api/curation')) {
        if (!(await authed(request, env))) return json({ error:'Wrong curator password' }, 401);
        if (route === 'GET /api/curation') return await listCuration(url, env);
        if (route === 'POST /api/curation') return await setVerdict(request, url, env);
        if (route === 'POST /api/curation/suggestions') return await addSuggestions(request, url, env);
        if (route === 'POST /api/curation/auto') return await setAuto(request, url, env);
      }
    } catch (e) {
      return json({ error:'Server error', detail:String(e && e.message || e) }, 500);
    }
    return json({ error:'Not found' }, 404);
  },
};

async function signals(url, env){
  const area = url.searchParams.get('area') || '';
  if (!(await knownArea(env, url, area))) return json({ error:'Unknown area' }, 400);
  const [cur, st] = await env.DB.batch([
    env.DB.prepare("SELECT venue_id, verdict, note, origin FROM curation WHERE area = ?1 AND verdict IN ('pick', 'avoid')").bind(area),
    env.DB.prepare('SELECT venue_id, shown, swapped, kept FROM stats WHERE area = ?1').bind(area),
  ]);
  // guides: picks that came from research, not from you, so the card can say so.
  const out = { picks:{}, guides:[], avoid:[], stats:{} };
  for (const r of cur.results) {
    if (r.verdict === 'pick') {
      out.picks[r.venue_id] = r.note || '';
      if (r.origin === 'research') out.guides.push(r.venue_id);
    } else out.avoid.push(r.venue_id);
  }
  for (const r of st.results) out.stats[r.venue_id] = [r.shown, r.swapped, r.kept];
  return json(out, 200, 'public, max-age=60');
}

async function event(request, url, env){
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key:request.headers.get('CF-Connecting-IP') || 'local' });
    if (!success) return json({ error:'Too many requests' }, 429);
  }
  const body = await request.json().catch(() => null);
  if (!body || !(await knownArea(env, url, body.area))) return json({ error:'Bad request' }, 400);
  const ids = list => (Array.isArray(list) ? list : []).filter(id => VENUE_ID.test(id)).slice(0, MAX_IDS);
  const up = (id, col) => env.DB.prepare(
    `INSERT INTO stats (area, venue_id, ${col}) VALUES (?1, ?2, 1)
     ON CONFLICT (area, venue_id) DO UPDATE SET ${col} = ${col} + 1`).bind(body.area, id);
  const stmts = [...ids(body.shown).map(id => up(id, 'shown')), ...ids(body.swapped).map(id => up(id, 'swapped')),
    ...ids(body.kept).map(id => up(id, 'kept'))];
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok:true });
}

async function listCuration(url, env){
  const area = url.searchParams.get('area') || '';
  if (!(await knownArea(env, url, area))) return json({ error:'Unknown area' }, 400);
  const [cur, st] = await env.DB.batch([
    env.DB.prepare('SELECT venue_id, verdict, note, sources, origin, updated_at FROM curation WHERE area = ?1').bind(area),
    env.DB.prepare('SELECT venue_id, shown, swapped, kept FROM stats WHERE area = ?1').bind(area),
  ]);
  return json({
    curation: cur.results.map(r => ({ ...r, sources: r.sources ? JSON.parse(r.sources) : [] })),
    stats: Object.fromEntries(st.results.map(r => [r.venue_id, [r.shown, r.swapped, r.kept]])),
  });
}

async function setVerdict(request, url, env){
  const b = await request.json().catch(() => null);
  if (!b || !VENUE_ID.test(b.id || '') || !(await knownArea(env, url, b.area))) return json({ error:'Bad request' }, 400);
  if (b.verdict === 'none') {
    await env.DB.prepare('DELETE FROM curation WHERE area = ?1 AND venue_id = ?2').bind(b.area, b.id).run();
    return json({ ok:true });
  }
  if (!['pick', 'avoid', 'dismissed'].includes(b.verdict)) return json({ error:'Bad verdict' }, 400);
  await env.DB.prepare(
    `INSERT INTO curation (area, venue_id, verdict, note, sources, origin, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 'editor', ?5)
     ON CONFLICT (area, venue_id) DO UPDATE SET verdict = ?3, note = ?4, origin = 'editor', updated_at = ?5`)
    .bind(b.area, b.id, b.verdict, clean(b.note), Date.now()).run();
  return json({ ok:true });
}

// Research suggestions never overwrite a decision you've already made (or dismissed).
async function addSuggestions(request, url, env){
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.items) || !(await knownArea(env, url, b.area))) return json({ error:'Bad request' }, 400);
  const stmts = b.items.filter(i => VENUE_ID.test(i.id || '') && ['pick', 'avoid'].includes(i.kind)).slice(0, 60).map(i => {
    const sources = (Array.isArray(i.sources) ? i.sources : []).filter(s => /^https?:\/\//.test(s)).slice(0, 5);
    return env.DB.prepare(
      `INSERT INTO curation (area, venue_id, verdict, note, sources, origin, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'research', ?6)
       ON CONFLICT (area, venue_id) DO NOTHING`)
      .bind(b.area, i.id, 'suggest-' + i.kind, clean(i.note), JSON.stringify(sources), Date.now());
  });
  const results = stmts.length ? await env.DB.batch(stmts) : [];
  return json({ ok:true, added:results.reduce((n, r) => n + (r.meta && r.meta.changes || 0), 0) });
}

// Automated research goes live directly. Each run replaces the area's previous research
// picks/avoids (so closures and stale picks drop out), but never touches a row you decided
// or dismissed in /curate: those are origin 'editor' and win the conflict.
async function setAuto(request, url, env){
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.items) || !(await knownArea(env, url, b.area))) return json({ error:'Bad request' }, 400);
  const now = Date.now();
  const inserts = b.items.filter(i => VENUE_ID.test(i.id || '') && ['pick', 'avoid'].includes(i.kind)).slice(0, 60).map(i => {
    const sources = (Array.isArray(i.sources) ? i.sources : []).filter(s => /^https?:\/\//.test(s)).slice(0, 5);
    return env.DB.prepare(
      `INSERT INTO curation (area, venue_id, verdict, note, sources, origin, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'research', ?6)
       ON CONFLICT (area, venue_id) DO NOTHING`)
      .bind(b.area, i.id, i.kind, clean(i.note), JSON.stringify(sources), now);
  });
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM curation WHERE area = ?1 AND origin = 'research'").bind(b.area),
    ...inserts,
  ]);
  return json({ ok:true, live:results.slice(1).reduce((n, r) => n + (r.meta && r.meta.changes || 0), 0) });
}

async function authed(request, env){
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.CURATOR_TOKEN || !given) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(env.CURATOR_TOKEN);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

function clean(s){ return typeof s === 'string' ? s.trim().slice(0, 280) || null : null; }

function json(obj, status = 200, cache = 'no-store'){
  return new Response(JSON.stringify(obj), { status, headers:{ 'Content-Type':'application/json', 'Cache-Control':cache } });
}
