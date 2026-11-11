// API for Owlabout. Everything else is static files in public/; /p/<id> serves the app page.
//
//   GET  /api/signals?area=soho        public: picks + avoids (yours and research's), and usage stats, for ranking
//   POST /api/event                     public: { area, step?, shown:[ids], swapped:[ids], kept:[ids] } usage counts
//   POST /api/feedback                  public: { message, contact?, area?, screen?, lang?, device? } in-app feedback
//   POST /api/report                    public: { area, venue, device } "closed for good" report, one per browser per venue
//   GET  /api/weather?area=soho         public: hourly forecast for the area (MET Norway, CC BY 4.0), cached
//   POST /api/polls                     public: ask the group first { areas[1-3], date, start, device, name?, lang } -> { id }
//   GET  /api/polls/<id>?device=…       public: the vote so far (everyone's picks, yours marked)
//   POST /api/polls/<id>/vote           public: { device, name, areas, types, end, venues?[≤3], style?: classic|gems }
//   POST /api/polls/<id>/plan           creator: { device, plan } link the plan made from it; voters join that plan
//   GET  /api/stats?days=30             curator: funnel counts per city and area
//   POST /api/plans                     public: lock a plan for a group { area, date, start, end, stops, title?, device, name? } -> { id }
//   GET  /api/plans/<id>?device=…       public: the plan, who joined, vote tallies, your own votes
//   POST /api/plans/<id>/join           public: { device, name }
//   POST /api/plans/<id>/rate           public: { device, venue, vote: 1 | -1 | -2 (closed) | 0 (clear), tags? } members only, from the day of the night
//   GET  /api/curation?area=soho        curator: every row incl. research suggestions
//   POST /api/curation                  curator: { area, id, verdict: pick|avoid|dismissed|none, note }
//   POST /api/curation/suggestions      curator: { area, items:[{ id, kind: pick|avoid, note, sources }] }
//   POST /api/curation/auto             curator: same body; replaces the area's research picks/avoids, goes live
//
// Curator routes need "Authorization: Bearer <CURATOR_TOKEN>" (a Worker secret).

import '../public/i18n.js';                     // sets globalThis.I18N, shared with the app

const VENUE_ID = /^[nwr]\d{1,12}$/;
const MAX_IDS = 8;

const STEPS = new Set(['visit', 'new', 'return', 'plan', 'open_shared', 'swap', 'reshuffle', 'edit', 'share', 'route', 'lock', 'join', 'rate',
  'poll_create', 'poll_open', 'poll_vote', 'poll_plan', 'report', 'sent', 'maps', 'preview', 'group_tap',
  // where a visit came from (in_), and whether that visit went on to make a plan (plan_)
  ...['reddit', 'tiktok', 'instagram', 'facebook', 'x', 'linkedin', 'whatsapp', 'google', 'search', 'site', 'direct', 'other'].flatMap(s => ['in_' + s, 'plan_' + s])]);
const TYPE_IDS = new Set(['pub', 'wine', 'rooftop', 'cheap', 'dinner', 'cocktail', 'games', 'live', 'comedy', 'karaoke', 'dance', 'latefood']);
const DEVICE = /^[a-z0-9]{16,40}$/;
const PLAN_ID = /^[a-z2-9]{6,10}$/;
const MAX_MEMBERS = 40;
const TAGS = new Set(['vibe', 'value', 'groups', 'date', 'busy', 'pricey']);
// Group votes count toward rankings only from plans at least this many people joined.
const MIN_MEMBERS_FOR_RANKING = 2;

let areaCity = null, areaById = null;      // area id -> city id / area
async function loadAreas(env, url){
  if (!areaCity) {
    const list = await (await env.ASSETS.fetch(new URL('/data/areas.json', url))).json();
    areaCity = new Map(list.map(a => [a.id, a.city || 'london']));
    areaById = new Map(list.map(a => [a.id, a]));
  }
  return areaCity;
}
async function knownArea(env, url, id){ return (await loadAreas(env, url)).has(id); }

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    // A group plan link is the app page; the page reads the id from the path. The page's
    // title and link-preview tags are rewritten for this plan, so WhatsApp shows its stops.
    const gp = url.pathname.match(/^\/p\/([a-z2-9]{6,10})\/?$/);
    if (gp) return await planPage(gp[1], request, url, env);
    const vp = url.pathname.match(/^\/v\/([a-z2-9]{6,10})\/?$/);
    if (vp) return await votePage(vp[1], request, url, env);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error:'Forbidden' }, 403);

    try {
      const route = request.method + ' ' + url.pathname;
      if (route === 'GET /api/signals') return await signals(url, env);
      if (route === 'GET /api/weather') return await weather(url, env, ctx);
      if (route === 'POST /api/feedback') {
        if (env.WRITES) {
          const { success } = await env.WRITES.limit({ key:request.headers.get('CF-Connecting-IP') || 'local' });
          if (!success) return json({ error:'Too many requests' }, 429);
        }
        const b = await request.json().catch(() => null);
        const message = b && typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
        if (!message) return json({ error:'Bad request' }, 400);
        const str = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) || null : null;
        await env.DB.prepare('INSERT INTO feedback (created_at, area, screen, lang, device, message, contact) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
          .bind(Date.now(), str(b.area, 40), str(b.screen, 20), str(b.lang, 5), DEVICE.test(b.device || '') ? b.device : null, message, str(b.contact, 200)).run();
        return json({ ok:true });
      }
      if (route === 'POST /api/report') {
        if (env.WRITES) {
          const { success } = await env.WRITES.limit({ key:request.headers.get('CF-Connecting-IP') || 'local' });
          if (!success) return json({ error:'Too many requests' }, 429);
        }
        const b = await request.json().catch(() => null);
        if (!b || !DEVICE.test(b.device || '') || !VENUE_ID.test(b.venue || '') || !(await knownArea(env, url, b.area))) return json({ error:'Bad request' }, 400);
        await env.DB.prepare('INSERT INTO reports (area, venue_id, device, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING')
          .bind(b.area, b.venue, b.device, Date.now()).run();
        return json({ ok:true });
      }
      if (route === 'POST /api/event') return await event(request, url, env);
      const pm = url.pathname.match(/^\/api\/plans(?:\/([a-z2-9]{6,10})(?:\/(join|rate))?)?$/);
      if (pm) {
        if (request.method === 'POST' && env.WRITES) {
          const { success } = await env.WRITES.limit({ key:request.headers.get('CF-Connecting-IP') || 'local' });
          if (!success) return json({ error:'Too many requests' }, 429);
        }
        if (route === 'POST /api/plans') return await createPlan(request, url, env);
        if (pm[1] && !pm[2] && request.method === 'GET') return await getPlan(pm[1], url, env);
        if (pm[2] === 'join' && request.method === 'POST') return await joinPlan(pm[1], request, env);
        if (pm[2] === 'rate' && request.method === 'POST') return await ratePlan(pm[1], request, env);
      }
      const vm = url.pathname.match(/^\/api\/polls(?:\/([a-z2-9]{6,10})(?:\/(vote|plan))?)?$/);
      if (vm) {
        if (request.method === 'POST' && env.WRITES) {
          const { success } = await env.WRITES.limit({ key:request.headers.get('CF-Connecting-IP') || 'local' });
          if (!success) return json({ error:'Too many requests' }, 429);
        }
        if (route === 'POST /api/polls') return await createPoll(request, url, env);
        if (vm[1] && !vm[2] && request.method === 'GET') return await getPoll(vm[1], url, env);
        if (vm[2] === 'vote' && request.method === 'POST') return await votePoll(vm[1], request, env);
        if (vm[2] === 'plan' && request.method === 'POST') return await planFromPoll(vm[1], request, env);
      }
      if (route === 'GET /api/stats') {
        if (!(await authed(request, env))) return json({ error:'Wrong curator password' }, 401);
        return await stats(url, env);
      }
      if (url.pathname.startsWith('/api/curation')) {
        if (!(await authed(request, env))) return json({ error:'Wrong curator password' }, 401);
        if (route === 'GET /api/curation') return await listCuration(url, env);
        if (route === 'POST /api/curation') return await setVerdict(request, url, env);
        if (route === 'POST /api/curation/suggestions') return await addSuggestions(request, url, env);
        if (route === 'POST /api/curation/auto') return await setAuto(request, url, env);
      }
    } catch (e) {
      console.error('API error', request.method, url.pathname, e && e.stack || e);   // shows in Workers Logs
      return json({ error:'Server error' }, 500);
    }
    return json({ error:'Not found' }, 404);
  },
};

async function signals(url, env){
  const area = url.searchParams.get('area') || '';
  if (!(await knownArea(env, url, area))) return json({ error:'Unknown area' }, 400);
  const [cur, st, rt, tg, rp] = await env.DB.batch([
    env.DB.prepare("SELECT venue_id, verdict, note, origin FROM curation WHERE area = ?1 AND verdict IN ('pick', 'avoid')").bind(area),
    env.DB.prepare('SELECT venue_id, shown, swapped, kept FROM stats WHERE area = ?1').bind(area),
    env.DB.prepare(
      `SELECT venue_id, SUM(vote = 1) AS up, SUM(vote = -1) AS down,
         COUNT(DISTINCT CASE WHEN vote = -2 THEN plan_id END) AS closed FROM ratings   -- closed: groups, not people
       WHERE area = ?1 AND plan_id IN (SELECT plan_id FROM members GROUP BY plan_id HAVING COUNT(*) >= ?2)
       GROUP BY venue_id`).bind(area, MIN_MEMBERS_FOR_RANKING),
    env.DB.prepare(
      `SELECT venue_id, tags FROM ratings WHERE area = ?1 AND tags IS NOT NULL
       AND plan_id IN (SELECT plan_id FROM members GROUP BY plan_id HAVING COUNT(*) >= ?2)`).bind(area, MIN_MEMBERS_FOR_RANKING),
    env.DB.prepare('SELECT venue_id, COUNT(*) AS n FROM reports WHERE area = ?1 GROUP BY venue_id').bind(area),
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
  out.ratings = {};                        // venue -> [would go again, wouldn't, was closed]
  for (const r of rt.results) out.ratings[r.venue_id] = [r.up, r.down, r.closed];
  out.reports = {};                        // venue -> how many different browsers said "closed for good"
  for (const r of rp.results) out.reports[r.venue_id] = r.n;
  out.tags = {};                           // venue -> { tag: how many people said it }
  for (const r of tg.results) for (const t of JSON.parse(r.tags)) {
    const v = out.tags[r.venue_id] = out.tags[r.venue_id] || {};
    v[t] = (v[t] || 0) + 1;
  }
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
  if (STEPS.has(body.step)) {
    const city = (await loadAreas(env, url)).get(body.area);
    stmts.push(env.DB.prepare(
      `INSERT INTO funnel (day, city, area, step, n) VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT (day, city, area, step) DO UPDATE SET n = n + 1`)
      .bind(new Date().toISOString().slice(0, 10), city, body.area, body.step));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok:true });
}

// ---------- weather ----------
// MET Norway's forecast, one request per area at most until their Expires time, shared by
// everyone through Cloudflare's cache. Their terms: identify ourselves, respect Expires,
// coordinates to 4 decimals, credit them (CC BY 4.0). Returns [[UTC hour, °C, rain mm/h], …].
const MET_UA = 'Owlabout/0.3 https://getowlabout.com hello@getowlabout.com';
async function weather(url, env, ctx){
  const id = url.searchParams.get('area') || '';
  await loadAreas(env, url);
  const area = areaById.get(id);
  if (!area) return json({ error:'Unknown area' }, 400);
  const lat = area.lat.toFixed(4), lng = area.lng.toFixed(4);
  const key = new Request('https://weather.cache/' + lat + ',' + lng);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + lat + '&lon=' + lng,
    { headers:{ 'User-Agent':MET_UA } });
  if (!res.ok) return json({ error:'Weather unavailable' }, 502);
  const data = await res.json();
  const hours = [];
  for (const t of data.properties.timeseries) {
    const d = t.data, temp = d.instant.details.air_temperature;
    if (d.next_1_hours) hours.push([t.time, temp, d.next_1_hours.details.precipitation_amount]);
    else if (d.next_6_hours) hours.push([t.time, temp, +(d.next_6_hours.details.precipitation_amount / 6).toFixed(2), 6]);
  }
  const ttl = Math.max(600, Math.min(3 * 3600, Math.round((Date.parse(res.headers.get('Expires')) - Date.now()) / 1000) || 1800));
  const out = new Response(JSON.stringify({ hours, source:'MET Norway', licence:'CC BY 4.0' }),
    { headers:{ 'Content-Type':'application/json', 'Cache-Control':'public, max-age=' + ttl } });
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

// ---------- link preview for a group plan ----------
function tr(lang, key, vars){
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  return s;
}
const clock = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

async function planPage(id, request, url, env){
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let title, desc;
  try {
    const [p, m] = await env.DB.batch([
      env.DB.prepare('SELECT area, date, start_min, end_min, stops, title, lang FROM plans WHERE id = ?1').bind(id),
      env.DB.prepare('SELECT name FROM members WHERE plan_id = ?1 ORDER BY joined_at LIMIT 6').bind(id),
    ]);
    const plan = p.results[0];
    if (!plan) return page;
    const lang = plan.lang || 'en';
    const areas = await (await env.ASSETS.fetch(new URL('/data/areas.json', url))).json();
    const area = areas.find(a => a.id === plan.area);
    const venues = await (await env.ASSETS.fetch(new URL('/data/areas/' + plan.area + '.json', url))).json().then(d => d.venues).catch(() => []);
    const stops = JSON.parse(plan.stops), step = (plan.end_min - plan.start_min) / stops.length;
    const lines = stops.map((x, k) => {
      const v = x.venue && venues.find(y => y.id === x.venue);
      return clock(Number.isInteger(x.at) ? x.at : Math.round(plan.start_min + k * step)) + ' ' + (v ? v.name : tr(lang, 'type.' + x.type).toLowerCase());
    });
    const day = tr(lang, 'day.' + (new Date(plan.date + 'T12:00:00Z').getUTCDay() + 6) % 7);
    const names = m.results.map(r => r.name);
    const who = names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' ' + tr(lang, 'group.and') + ' ' + names[names.length - 1];
    const presets = ['The pub crawl', 'Date night', 'Big night out', 'Cheap and cheerful', 'Live and loud', 'Make it weird'];
    const titleName = plan.title === 'Surprise me' ? tr(lang, 'home.surprise') : presets.includes(plan.title) ? tr(lang, 'preset.' + presets.indexOf(plan.title) + '.name') : plan.title;
    title = tr(lang, 'preview.title', { day, area:area ? area.name : plan.area }) + (titleName ? ' · ' + titleName : '');
    desc = lines.join(' → ') + (names.length ? '. ' + tr(lang, names.length === 1 ? 'group.isIn' : 'group.areIn', { names:who }) : '') + '. ' + tr(lang, 'preview.tap');
  } catch (e) {
    return page;                                   // never break the page over a preview
  }
  const set = content => ({ element(el){ el.setAttribute('content', content); } });
  return new HTMLRewriter()
    .on('title', { element(el){ el.setInnerContent(title + ' · Owlabout'); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(url.origin + '/p/' + id))
    .on('link[rel="canonical"]', { element(el){ el.setAttribute('href', url.origin + '/p/' + id); } })
    .transform(page);
}

async function votePage(id, request, url, env){
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let title, desc;
  try {
    const [p, v] = await env.DB.batch([
      env.DB.prepare('SELECT areas, date, start_min, lang FROM polls WHERE id = ?1').bind(id),
      env.DB.prepare('SELECT name FROM poll_votes WHERE poll_id = ?1 ORDER BY updated_at LIMIT 6').bind(id),
    ]);
    const poll = p.results[0];
    if (!poll) return page;
    const lang = poll.lang || 'en';
    await loadAreas(env, url);
    const names = JSON.parse(poll.areas).map(a => (areaById.get(a) || { name:a }).name);
    const day = tr(lang, 'day.' + (new Date(poll.date + 'T12:00:00Z').getUTCDay() + 6) % 7);
    const voters = v.results.map(r => r.name);
    title = tr(lang, 'vote.shareText', { day });
    desc = tr(lang, 'vote.in', { areas:names.join(' ' + tr(lang, 'vote.or') + ' ') }) + ' · ' + clock(poll.start_min) +
      (voters.length ? '. ' + tr(lang, voters.length === 1 ? 'vote.count.one' : 'vote.count', { n:voters.length }) + ': ' + voters.join(', ') : '') + '.';
  } catch (e) {
    return page;
  }
  const set = content => ({ element(el){ el.setAttribute('content', content); } });
  return new HTMLRewriter()
    .on('title', { element(el){ el.setInnerContent(title + ' · Owlabout'); } })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(url.origin + '/v/' + id))
    .on('link[rel="canonical"]', { element(el){ el.setAttribute('href', url.origin + '/v/' + id); } })
    .transform(page);
}

// ---------- group plans ----------
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function newId(){
  const b = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(b, x => ID_CHARS[x % ID_CHARS.length]).join('');
}
function cleanName(s){ return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 30) : ''; }

async function createPlan(request, url, env){
  const b = await request.json().catch(() => null);
  const ok = b && await knownArea(env, url, b.area) && /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && DEVICE.test(b.device || '') &&
    Number.isInteger(b.start) && Number.isInteger(b.end) && b.start >= 0 && b.end > b.start && b.end <= 36 * 60 &&
    Array.isArray(b.stops) && b.stops.length >= 1 && b.stops.length <= 8 &&
    b.stops.every(x => x && TYPE_IDS.has(x.type) && (x.venue === null || VENUE_ID.test(x.venue || '')) &&
      (x.at === undefined || Number.isInteger(x.at) && x.at >= 0 && x.at < b.end));
  if (!ok) return json({ error:'Bad request' }, 400);
  const city = (await loadAreas(env, url)).get(b.area);
  // at: a stop's own start time, when the organiser moved stops by hand (all or none).
  const timed = b.stops.every(x => Number.isInteger(x.at));
  const stops = JSON.stringify(b.stops.map(x => ({ type:x.type, venue:x.venue, ...(timed ? { at:x.at } : {}) })));
  const title = typeof b.title === 'string' ? b.title.slice(0, 40) : null;
  const lang = I18N[b.lang] ? b.lang : 'en';
  const name = cleanName(b.name);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const res = await env.DB.prepare(
      `INSERT INTO plans (id, area, city, date, start_min, end_min, stops, title, lang, created_by, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ON CONFLICT (id) DO NOTHING`)
      .bind(id, b.area, city, b.date, b.start, b.end, stops, title, lang, b.device, Date.now()).run();
    if (!res.meta.changes) continue;
    if (name) await env.DB.prepare('INSERT INTO members (plan_id, device, name, joined_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(id, b.device, name, Date.now()).run();
    return json({ id });
  }
  return json({ error:'Try again' }, 503);
}

async function getPlan(id, url, env){
  const device = url.searchParams.get('device') || '';
  const [p, m, t, mine] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM plans WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT device, name FROM members WHERE plan_id = ?1 ORDER BY joined_at').bind(id),
    env.DB.prepare('SELECT venue_id, SUM(vote = 1) AS up, SUM(vote = -1) AS down, SUM(vote = -2) AS closed FROM ratings WHERE plan_id = ?1 GROUP BY venue_id').bind(id),
    env.DB.prepare('SELECT venue_id, vote, tags FROM ratings WHERE plan_id = ?1 AND device = ?2').bind(id, device),
  ]);
  const plan = p.results[0];
  if (!plan) return json({ error:'Plan not found' }, 404);
  return json({
    id, area:plan.area, city:plan.city, date:plan.date, start:plan.start_min, end:plan.end_min,
    stops:JSON.parse(plan.stops), title:plan.title, mine:plan.created_by === device,
    members:m.results.map(r => ({ name:r.name, me:r.device === device })),
    host:(m.results.find(r => r.device === plan.created_by) || {}).name || null,    // the organiser's name, if they gave one
    tallies:Object.fromEntries(t.results.map(r => [r.venue_id, [r.up, r.down, r.closed]])),
    votes:Object.fromEntries(mine.results.map(r => [r.venue_id, r.vote])),
    tags:Object.fromEntries(mine.results.filter(r => r.tags).map(r => [r.venue_id, JSON.parse(r.tags)])),
  });
}

async function joinPlan(id, request, env){
  const b = await request.json().catch(() => null);
  const name = b && cleanName(b.name);
  if (!b || !DEVICE.test(b.device || '') || !name) return json({ error:'Bad request' }, 400);
  const [p, n] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM plans WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE plan_id = ?1 AND device != ?2').bind(id, b.device),
  ]);
  if (!p.results[0]) return json({ error:'Plan not found' }, 404);
  if (n.results[0].n >= MAX_MEMBERS) return json({ error:'This group is full' }, 409);
  await env.DB.prepare(
    `INSERT INTO members (plan_id, device, name, joined_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (plan_id, device) DO UPDATE SET name = ?3`).bind(id, b.device, name, Date.now()).run();
  return json({ ok:true });
}

async function ratePlan(id, request, env){
  const b = await request.json().catch(() => null);
  if (!b || !DEVICE.test(b.device || '') || !VENUE_ID.test(b.venue || '') || ![1, -1, -2, 0].includes(b.vote)) return json({ error:'Bad request' }, 400);
  const [p, m] = await env.DB.batch([
    env.DB.prepare('SELECT area, date, stops FROM plans WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT 1 FROM members WHERE plan_id = ?1 AND device = ?2').bind(id, b.device),
  ]);
  const plan = p.results[0];
  if (!plan) return json({ error:'Plan not found' }, 404);
  if (!m.results[0]) return json({ error:'Join the group first' }, 403);
  if (!JSON.parse(plan.stops).some(x => x.venue === b.venue)) return json({ error:'Not a stop on this plan' }, 400);
  // Votes open on the day of the night (a day's slack either side of UTC for time zones).
  if (Date.now() < Date.parse(plan.date + 'T00:00:00Z') - 86400000) return json({ error:'You can rate once the night has happened' }, 403);
  if (b.vote === 0) await env.DB.prepare('DELETE FROM ratings WHERE plan_id = ?1 AND venue_id = ?2 AND device = ?3').bind(id, b.venue, b.device).run();
  else {
    const tags = b.vote !== -2 && Array.isArray(b.tags) ? [...new Set(b.tags.filter(t => TAGS.has(t)))] : [];
    await env.DB.prepare(
      `INSERT INTO ratings (plan_id, area, venue_id, device, vote, tags, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (plan_id, venue_id, device) DO UPDATE SET vote = ?5, tags = ?6, updated_at = ?7`)
      .bind(id, plan.area, b.venue, b.device, b.vote, tags.length ? JSON.stringify(tags) : null, Date.now()).run();
  }
  return json({ ok:true });
}

// ---------- group votes ----------
async function createPoll(request, url, env){
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.areas) || b.areas.length < 1 || b.areas.length > 3 || !DEVICE.test(b.device || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !Number.isInteger(b.start) || b.start < 0 || b.start > 1440) return json({ error:'Bad request' }, 400);
  const map = await loadAreas(env, url);
  const areas = [...new Set(b.areas)];
  if (!areas.every(a => map.has(a)) || new Set(areas.map(a => map.get(a))).size !== 1) return json({ error:'Areas must be in one city' }, 400);
  const lang = I18N[b.lang] ? b.lang : 'en';
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const res = await env.DB.prepare(
      `INSERT INTO polls (id, city, areas, date, start_min, lang, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (id) DO NOTHING`).bind(id, map.get(areas[0]), JSON.stringify(areas), b.date, b.start, lang, b.device, Date.now()).run();
    if (res.meta.changes) return json({ id });
  }
  return json({ error:'Try again' }, 503);
}

async function getPoll(id, url, env){
  const device = url.searchParams.get('device') || '';
  const [p, v] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM polls WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT device, name, areas, types, end_min, venues, style FROM poll_votes WHERE poll_id = ?1 ORDER BY updated_at').bind(id),
  ]);
  const poll = p.results[0];
  if (!poll) return json({ error:'Vote not found' }, 404);
  return json({
    id, city:poll.city, areas:JSON.parse(poll.areas), date:poll.date, start:poll.start_min, lang:poll.lang, plan:poll.plan_id,
    mine:poll.created_by === device,
    votes:v.results.map(r => ({ name:r.name, me:r.device === device, areas:JSON.parse(r.areas), types:JSON.parse(r.types), end:r.end_min,
      venues:r.venues ? JSON.parse(r.venues) : [], style:r.style || null })),
  });
}

async function votePoll(id, request, env){
  const b = await request.json().catch(() => null);
  const name = b && cleanName(b.name);
  if (!b || !DEVICE.test(b.device || '') || !name || !Array.isArray(b.areas) || !Array.isArray(b.types) ||
      !Number.isInteger(b.end) || b.end < 0 || b.end > 36 * 60) return json({ error:'Bad request' }, 400);
  const [p, n] = await env.DB.batch([
    env.DB.prepare('SELECT areas, plan_id FROM polls WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ?1 AND device != ?2').bind(id, b.device),
  ]);
  const poll = p.results[0];
  if (!poll) return json({ error:'Vote not found' }, 404);
  if (poll.plan_id) return json({ error:'The plan’s already made', plan:poll.plan_id }, 409);
  if (n.results[0].n >= MAX_MEMBERS) return json({ error:'This group is full' }, 409);
  const allowed = JSON.parse(poll.areas);
  const areas = [...new Set(b.areas.filter(a => allowed.includes(a)))];
  const types = [...new Set(b.types.filter(t => TYPE_IDS.has(t)))].slice(0, 12);
  if (!types.length) return json({ error:'Pick at least one thing' }, 400);
  const venues = [...new Set((Array.isArray(b.venues) ? b.venues : []).filter(v => VENUE_ID.test(v)))].slice(0, 3);
  const style = ['classic', 'gems'].includes(b.style) ? b.style : null;
  await env.DB.prepare(
    `INSERT INTO poll_votes (poll_id, device, name, areas, types, end_min, venues, style, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT (poll_id, device) DO UPDATE SET name = ?3, areas = ?4, types = ?5, end_min = ?6, venues = ?7, style = ?8, updated_at = ?9`)
    .bind(id, b.device, name, JSON.stringify(areas.length ? areas : allowed), JSON.stringify(types), b.end,
      venues.length ? JSON.stringify(venues) : null, style, Date.now()).run();
  return json({ ok:true });
}

// The organiser made the plan in the app (same engine as any plan) and locked it as a group
// plan; link it here, and everyone who voted joins it under the name they voted with.
async function planFromPoll(id, request, env){
  const b = await request.json().catch(() => null);
  if (!b || !DEVICE.test(b.device || '') || !PLAN_ID.test(b.plan || '')) return json({ error:'Bad request' }, 400);
  const [p, pl] = await env.DB.batch([
    env.DB.prepare('SELECT created_by, plan_id FROM polls WHERE id = ?1').bind(id),
    env.DB.prepare('SELECT id FROM plans WHERE id = ?1').bind(b.plan),
  ]);
  const poll = p.results[0];
  if (!poll) return json({ error:'Vote not found' }, 404);
  if (poll.created_by !== b.device) return json({ error:'Only the person who started the vote can make the plan' }, 403);
  if (!pl.results[0]) return json({ error:'Plan not found' }, 404);
  await env.DB.batch([
    env.DB.prepare('UPDATE polls SET plan_id = ?2 WHERE id = ?1').bind(id, b.plan),
    env.DB.prepare(
      `INSERT INTO members (plan_id, device, name, joined_at)
       SELECT ?2, device, name, updated_at FROM poll_votes WHERE poll_id = ?1
       ON CONFLICT (plan_id, device) DO NOTHING`).bind(id, b.plan),
  ]);
  return json({ ok:true });
}

async function stats(url, env){
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days'), 10) || 30, 1), 365);
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const [byArea, byDay, fb] = await env.DB.batch([
    env.DB.prepare('SELECT city, area, step, SUM(n) AS n FROM funnel WHERE day >= ?1 GROUP BY city, area, step').bind(since),
    env.DB.prepare('SELECT day, step, SUM(n) AS n FROM funnel WHERE day >= ?1 GROUP BY day, step ORDER BY day').bind(since),
    env.DB.prepare('SELECT created_at, area, screen, lang, substr(device, 1, 6) AS who, message, contact FROM feedback ORDER BY created_at DESC LIMIT 200'),
  ]);
  return json({ since, days, byArea:byArea.results, byDay:byDay.results, feedback:fb.results });
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
