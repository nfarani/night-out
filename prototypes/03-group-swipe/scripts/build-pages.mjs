// Static pages people can find in search: one per neighbourhood (/london/soho), one per
// city (/london), and an index of everything (/neighbourhoods). Built from the same venue
// snapshots the planner uses, so run it after `npm run data`, then deploy.
//
//   npm run pages
//
// Each neighbourhood page says what's there (counts by type), lists well-known places
// (own Wikipedia/Wikidata entry or a listed building, from OpenStreetMap), links the
// ready-made nights straight into the planner, and points to nearby neighbourhoods.

import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';

const SITE = 'https://getowlabout.com';
const RADIUS_M = 1100;                       // same walking radius as the planner
const pub = new URL('../public/', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, pub), 'utf8'));
const exists = p => access(new URL(p, pub)).then(() => true, () => false);

const areas = await read('data/areas.json');
const cities = await read('data/cities.json');
const html = await readFile(new URL('index.html', pub), 'utf8');

// The ready-made nights live in index.html; read them from there so the two never drift.
const presetSrc = html.match(/const PRESETS = (\[[\s\S]*?\n  \]);/);
if (!presetSrc) throw new Error('Could not find PRESETS in index.html');
const PRESETS = Function('"use strict"; return ' + presetSrc[1])();

const TYPES = [
  ['pub', 'Pubs', 'pubs'], ['cocktail', 'Cocktail bars', 'cocktail bars'], ['wine', 'Wine bars', 'wine bars'],
  ['rooftop', 'Drinks outside', 'places to drink outside'], ['dinner', 'Dinner', 'places for dinner'],
  ['cheap', 'Cheap eats', 'cheap eats'], ['live', 'Live music', 'live music venues'], ['comedy', 'Comedy', 'comedy venues'],
  ['games', 'Bar games', 'bars with games'], ['karaoke', 'Karaoke', 'karaoke spots'], ['dance', 'Clubs', 'clubs'],
  ['latefood', 'Late-night food', 'late-night food spots'],
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[’'()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function distM(a, b){
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const cityOf = a => cities.find(c => c.id === (a.city || 'london'));
const areaUrl = a => '/' + cityOf(a).id + '/' + slug(a.name);
const listJoin = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const presetLink = (a, p) => '/#' + new URLSearchParams({ a:a.id, t:p.types.join(','), n:p.n, s:p.start, e:p.end, x:p.name }).toString();

const STYLE = `
  :root{ --bg:#161513; --card:#1e1d1a; --text:#efe9de; --text-2:#aaa398; --muted:#7d776d; --line:#2c2a26; --route:#f5c84b; --red:#ff4d3d; --display:"Barlow Condensed",sans-serif; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text); font:400 16px/26px Inter,system-ui,sans-serif; }
  a{ color:var(--route); }
  .top{ display:flex; align-items:center; justify-content:space-between; height:64px; padding:0 16px; border-bottom:1px solid var(--line); }
  .logo{ display:flex; align-items:center; gap:8px; font:600 22px/1 var(--display); color:var(--text); text-decoration:none; }
  .logo img{ width:28px; height:28px; }
  main{ max-width:48rem; margin:0 auto; padding:32px 16px 64px; }
  .crumbs{ font-size:14px; color:var(--text-2); margin:0 0 16px; }
  .crumbs a{ color:var(--text-2); }
  h1{ font:600 48px/1 var(--display); margin:0 0 16px; }
  h2{ font:600 28px/1.1 var(--display); margin:40px 0 12px; }
  h3{ font:600 20px/1.2 var(--display); margin:20px 0 6px; }
  p, li{ color:var(--text-2); }
  .cta{ display:inline-block; margin:8px 0 0; padding:14px 22px; border-radius:999px; background:var(--route); color:#1a1508; font-weight:600; text-decoration:none; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; padding:0; list-style:none; }
  .grid li{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .grid li a{ font:600 20px/1.2 var(--display); text-decoration:none; color:var(--text); }
  .grid li span{ display:block; font-size:14px; color:var(--text-2); margin-top:4px; }
  ul.places{ padding-left:20px; margin:0; }
  .counts{ display:flex; flex-wrap:wrap; gap:8px; padding:0; list-style:none; }
  .counts li{ border:1px solid var(--line); border-radius:999px; padding:4px 12px; font-size:14px; }
  footer{ max-width:48rem; margin:0 auto; padding:0 16px 48px; font-size:13px; color:var(--muted); }
  footer a{ color:var(--text-2); }`;

function page({ path, title, desc, body, crumbs }){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#161513">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:site_name" content="Owlabout">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${STYLE}
</style>
</head>
<body>
<header class="top"><a class="logo" href="/"><img src="/icon.svg" alt="">Owlabout</a><a href="/neighbourhoods">All neighbourhoods</a></header>
<main>
${crumbs ? '<p class="crumbs">' + crumbs + '</p>' : ''}
${body}
</main>
<footer>Venue data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL. Places change: check before you go. · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>
</body>
</html>
`;
}

async function write(path, text){
  const file = new URL('.' + path + '.html', pub);
  await mkdir(new URL('.', file), { recursive:true });
  await writeFile(file, text);
}

// Start clean so renamed or pruned areas don't leave stale pages behind.
for (const c of cities) await rm(new URL(c.id + '/', pub), { recursive:true, force:true });

const urls = ['/', '/neighbourhoods'];
const built = [];
for (const a of areas) {
  if (!await exists(`data/areas/${a.id}.json`)) continue;
  const venues = (await read(`data/areas/${a.id}.json`)).venues.filter(v => distM(a, v) <= RADIUS_M);
  const city = cityOf(a);
  const counts = TYPES.map(([id, label, plural]) => [id, label, plural, venues.filter(v => v.vibes.includes(id)).length]).filter(t => t[3] > 0);
  const top = counts.filter(t => t[3] >= 3).sort((x, y) => y[3] - x[3]).slice(0, 4);
  const near = areas.filter(b => b.id !== a.id && (b.city || 'london') === city.id).map(b => [distM(a, b), b]).sort((x, y) => x[0] - y[0]).slice(0, 6);

  const known = TYPES.map(([id, label]) => [label, venues.filter(v => v.known && v.vibes.includes(id) && v.name)
    .sort((x, y) => x.name.localeCompare(y.name)).slice(0, 6)]).filter(t => t[1].length);
  const seen = new Set();
  const knownHtml = known.map(([label, vs]) => {
    const fresh = vs.filter(v => !seen.has(v.id)); fresh.forEach(v => seen.add(v.id));
    return fresh.length ? '<h3>' + esc(label) + '</h3><ul class="places">' + fresh.map(v => '<li>' + esc(v.name) +
      (v.street ? ', ' + esc(v.street) : '') + '</li>').join('') + '</ul>' : '';
  }).join('');

  const path = areaUrl(a);
  const where = a.name + ', ' + city.name;
  const lede = `Within a short walk of the middle of ${a.name} there are ` +
    listJoin(top.map(t => t[3].toLocaleString('en-GB') + ' ' + t[2])) + '. Owlabout turns that into a plan: a few stops in walking order, timed for the evening, with one link to send the group.';
  const body = `<h1>A night out in ${esc(a.name)}</h1>
<p>${esc(lede)}</p>
<a class="cta" href="/#a=${encodeURIComponent(a.id)}">Plan a night in ${esc(a.name)}</a>

<h2>What’s here</h2>
<ul class="counts">${counts.map(t => '<li>' + esc(t[1]) + ' · ' + t[3].toLocaleString('en-GB') + '</li>').join('')}</ul>

<h2>Ready-made nights in ${esc(a.name)}</h2>
<ul class="grid">${PRESETS.map(p => '<li><a href="' + esc(presetLink(a, p)) + '">' + esc(p.name) + '</a><span>' + esc(p.desc) + '</span></li>').join('')}</ul>

${knownHtml ? `<h2>Well-known places in ${esc(a.name)}</h2>
<p>Places here with their own Wikipedia entry or a listed building. Plans favour them a little, alongside newer spots.</p>
${knownHtml}` : ''}

${near.length ? `<h2>Near ${esc(a.name)}</h2>
<ul class="grid">${near.map(([d, b]) => '<li><a href="' + areaUrl(b) + '">' + esc(b.name) + '</a><span>' + (d / 1000).toFixed(1) + ' km away</span></li>').join('')}</ul>` : ''}`;
  await write(path, page({
    path, body,
    title: `Night out in ${where}: bars, dinner and a walkable plan · Owlabout`,
    desc: `Plan a night out in ${where}. ${top.map(t => t[3] + ' ' + t[2]).join(', ')}, turned into a timed, walkable plan to send to your group.`,
    crumbs: `<a href="/neighbourhoods">All neighbourhoods</a> › <a href="/${city.id}">${esc(city.name)}</a> › ${esc(a.name)}`,
  }));
  urls.push(path);
  built.push(a);
}

// City pages: every built neighbourhood in that city.
for (const c of cities) {
  const list = built.filter(a => (a.city || 'london') === c.id);
  if (!list.length) continue;
  const body = `<h1>A night out in ${esc(c.name)}</h1>
<p>${list.length} neighbourhoods. Pick one to see what’s there, or go straight to a plan.</p>
<a class="cta" href="/#a=${encodeURIComponent(c.default)}">Plan a night in ${esc(c.name)}</a>
<h2>Neighbourhoods</h2>
<ul class="grid">${list.slice().sort((x, y) => x.name.localeCompare(y.name)).map(a => '<li><a href="' + areaUrl(a) + '">' + esc(a.name) + '</a>' + (a.region ? '<span>' + esc(a.region) + '</span>' : '') + '</li>').join('')}</ul>`;
  await write('/' + c.id, page({ path:'/' + c.id, body,
    title:`Night out in ${c.name}: ${list.length} neighbourhoods, planned for you · Owlabout`,
    desc:`Plan a night out in ${c.name}. ${list.length} neighbourhoods, each turned into a timed, walkable plan to send to your group.`,
    crumbs:`<a href="/neighbourhoods">All neighbourhoods</a> › ${esc(c.name)}` }));
  urls.push('/' + c.id);
}

// Index of everything.
const index = cities.map(c => [c, built.filter(a => (a.city || 'london') === c.id)]).filter(([, l]) => l.length);
await write('/neighbourhoods', page({ path:'/neighbourhoods',
  title:'Every neighbourhood on Owlabout',
  desc:`Night-out plans for ${built.length} neighbourhoods in ${index.length} cities.`,
  body:`<h1>Every neighbourhood</h1><p>${built.length} neighbourhoods in ${index.length} cities.</p>` +
    index.map(([c, l]) => `<h2><a href="/${c.id}">${esc(c.name)}</a></h2><p>` +
      l.slice().sort((x, y) => x.name.localeCompare(y.name)).map(a => '<a href="' + areaUrl(a) + '">' + esc(a.name) + '</a>').join(' · ') + '</p>').join('') }));

urls.push('/privacy', '/terms');
await writeFile(new URL('sitemap.xml', pub), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + SITE + u + '</loc></url>').join('\n') + '\n</urlset>\n');
console.log(`${built.length} neighbourhood pages, ${index.length} city pages, sitemap with ${urls.length} URLs`);
