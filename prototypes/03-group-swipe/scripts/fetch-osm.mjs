// Snapshot OpenStreetMap venues for each area into public/data/areas/<id>.json.
// Run occasionally (npm run data), not per user: the public Overpass server is
// a shared resource. One query per area, sequential, with a pause between.
//
// Usage: node scripts/fetch-osm.mjs            (all areas)
//        node scripts/fetch-osm.mjs dalston    (one area, always refetched)
//        node scripts/fetch-osm.mjs --missing  (only areas with no file yet)

import { readFile, writeFile, access } from 'node:fs/promises';

const ENDPOINTS = [                                // public mirrors, tried in turn when one is busy
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'NightOut-prototype/0.1 (London night-out planner; occasional area snapshot)';
const RADIUS_M = 1200;
const root = new URL('../public/data/', import.meta.url);

const areas = JSON.parse(await readFile(new URL('areas.json', root), 'utf8'));
const missingOnly = process.argv[2] === '--missing';
const only = missingOnly ? null : process.argv[2];
const exists = f => access(f).then(() => true, () => false);

function query(lat, lng) {
  const around = `(around:${RADIUS_M},${lat},${lng})`;
  return `[out:json][timeout:90];
(
  nwr${around}[amenity~"^(pub|bar|restaurant|fast_food|food_court|nightclub|music_venue|karaoke_box|theatre|arts_centre|events_venue)$"][name];
  nwr${around}[leisure~"^(bowling_alley|amusement_arcade)$"][name];
  nwr${around}[sport~"billiards|darts|shuffleboard"][name];
);
out center tags;`;
}

const DRINKS = ['bar', 'pub', 'restaurant'];
const late = h => /24\/7/.test(h) || /-\s*(0[0-5]|2[4-9])(:\d\d)?\b/.test(h);

// Which of the 12 vibes a venue can stand in for. Chains (brand tag) are dropped
// except for 2am food, where a chain is often the only thing open.
function classify(t) {
  const a = t.amenity || '', name = t.name || '', chain = !!(t.brand || t['brand:wikidata']);
  const sport = t.sport || '', hours = t.opening_hours || '';
  const v = [];
  const wineName = /\bwine|\bvin(o|s)?\b|enoteca|\bcave\b|bottle/i.test(name);
  if (a === 'pub' && !chain) v.push('pub');
  if (['bar', 'restaurant', 'pub'].includes(a) && !chain && wineName) v.push('wine');
  if ((a === 'fast_food' && !chain) || a === 'food_court') v.push('cheap');
  if (a === 'restaurant' && !chain) v.push('dinner');
  if (DRINKS.includes(a) && !chain &&
      (/roof|terrace|garden|\bsky/i.test(name) || t.rooftop === 'yes' || t.beer_garden === 'yes' ||
       (t.outdoor_seating === 'yes' && a !== 'restaurant'))) v.push('rooftop');
  if (a === 'bar' && !chain && !wineName) v.push('cocktail');
  if (a === 'music_venue' || t.live_music === 'yes' || (a === 'nightclub' && /jazz|live/i.test(name))) v.push('live');
  if (/billiards|darts|shuffleboard|10pin/.test(sport) || t.leisure === 'bowling_alley' ||
      (['bar', 'pub'].includes(a) && /\bpool\b|darts|shuffle|bowl|ping ?pong|games/i.test(name))) v.push('games');
  if ((a === 'theatre' && /comedy/i.test(t['theatre:genre'] || '')) || /comedy|\blaugh/i.test(name)) v.push('comedy');
  if (a === 'karaoke_box' || t.karaoke === 'yes' || /karaoke/i.test(name)) v.push('karaoke');
  if (a === 'nightclub' && !chain) v.push('dance');
  if (['fast_food', 'restaurant'].includes(a) && late(hours)) v.push('latefood');
  return v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const area of areas) {
  if (only && area.id !== only) continue;
  if (missingOnly && await exists(new URL(`areas/${area.id}.json`, root))) continue;
  process.stdout.write(`${area.name}… `);
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch(ENDPOINTS[attempt % ENDPOINTS.length], {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query(area.lat, area.lng)),
      });
    } catch (e) {
      res = { ok: false, status: 'network error' };
    }
    if (![429, 502, 503, 504, 'network error'].includes(res.status)) break;
    process.stdout.write(`(${res.status}) `);
    await sleep(attempt % ENDPOINTS.length === ENDPOINTS.length - 1 ? 30000 : 2000);
  }
  if (!res.ok) { console.log(`failed: HTTP ${res.status}`); continue; }
  const data = await res.json();

  const venues = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    const vibes = classify(t);
    if (!vibes.length || lat == null) continue;
    venues.push({
      id: el.type[0] + el.id,                       // n123 / w456 / r789
      name: t.name,
      lat: +lat.toFixed(6), lng: +lng.toFixed(6),
      vibes,
      street: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined,
      postcode: t['addr:postcode'] || undefined,
      hours: t.opening_hours || undefined,
      website: t.website || t['contact:website'] || undefined,
    });
  }
  const counts = {};
  venues.forEach(v => v.vibes.forEach(x => counts[x] = (counts[x] || 0) + 1));
  await writeFile(new URL(`areas/${area.id}.json`, root), JSON.stringify({
    area: area.id,
    fetched: new Date().toISOString(),
    source: 'OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
    venues,
  }));
  console.log(`${venues.length} venues`, JSON.stringify(counts));
  await sleep(3000);
}
