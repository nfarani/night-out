// Snapshot OpenStreetMap venues for each area into public/data/areas/<id>.json.
// Run occasionally (npm run data), not per user: the public Overpass server is
// a shared resource. One query per area, sequential, with a pause between.
//
// Usage: node scripts/fetch-osm.mjs            (all areas)
//        node scripts/fetch-osm.mjs dalston    (one area, always refetched)
//        node scripts/fetch-osm.mjs --missing  (only areas with no file yet)
//        node scripts/fetch-osm.mjs --city paris   (one city's areas)

import { readFile, writeFile, access } from 'node:fs/promises';

const ENDPOINTS = [                                // public mirrors, tried in turn when one is busy
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'Owlabout/0.2 (https://getowlabout.com; night-out planner; occasional area snapshot)';
const RADIUS_M = 1200;
const root = new URL('../public/data/', import.meta.url);

const areas = JSON.parse(await readFile(new URL('areas.json', root), 'utf8'));
const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const cityOnly = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;
const only = args.find(a => !a.startsWith('--') && a !== cityOnly) || null;
const exists = f => access(f).then(() => true, () => false);

// One request per city: the same filters around every neighbourhood centre, joined into one
// query, then split back into neighbourhoods here. 8 requests instead of 100.
function query(points) {
  const sets = points.flatMap(({ lat, lng }) => {
    const around = `(around:${RADIUS_M},${lat},${lng})`;
    return [
      `nwr${around}[amenity~"^(pub|bar|restaurant|fast_food|food_court|nightclub|music_venue|karaoke_box|theatre|arts_centre|events_venue)$"][name];`,
      `nwr${around}[leisure~"^(bowling_alley|amusement_arcade)$"][name];`,
      `nwr${around}[sport~"billiards|darts|shuffleboard"][name];`,
      `nwr${around}[shop=mall][name~"${FOOD_HALL.source}",i];`,
      `nwr${around}[amenity=marketplace][name~"${FOOD_HALL.source}",i];`,
    ];
  });
  return `[out:json][timeout:300][maxsize:1073741824];\n(\n  ${sets.join('\n  ')}\n);\nout center tags;`;
}
function distM(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const DRINKS = ['bar', 'pub', 'restaurant'];
// Food halls and street-food markets (Boxpark, Mercado de San Miguel, Time Out Market…) are often
// tagged as a mall or marketplace; only names like these count, so shopping centres and flea markets stay out.
const FOOD_HALL = /food ?(hall|market|court)|street ?food|boxpark|market ?hall|time out market|mercado|mercato|markthal|markthalle|march[eé] couvert/;
const late = h => /24\/7/.test(h) || /-\s*(0[0-5]|2[4-9])(:\d\d)?\b/.test(h);

// Which of the 12 vibes a venue can stand in for. Chains (brand tag) are dropped
// except for 2am food, where a chain is often the only thing open.
function classify(t) {
  const a = t.amenity || '', name = t.name || '', chain = !!(t.brand || t['brand:wikidata']);
  const sport = t.sport || '', hours = t.opening_hours || '';
  const v = [];
  // Names are matched in English, French, Spanish, Catalan, Italian, Portuguese, Dutch and German.
  // No "bottle": too many pubs are called "the Something and Bottle".
  const wineName = /\bwine|\bvin(o|s|i|ho|hos)?\b|enoteca|vinoteca|\bcave\b|\bbodega|weinbar|\bwijn|garrafeira|vermut|vermouth/i.test(name);
  if (a === 'pub' && !chain) v.push('pub');
  if (['bar', 'restaurant', 'pub'].includes(a) && !chain && wineName) v.push('wine');
  if ((a === 'fast_food' && !chain) || a === 'food_court' || ((t.shop === 'mall' || a === 'marketplace') && FOOD_HALL.test(name.toLowerCase()))) v.push('cheap');
  if (a === 'restaurant' && !chain) v.push('dinner');
  if (DRINKS.includes(a) && !chain &&
      (/roof|terrace|garden|\bsky|terrasse|terraza|terrat|terrazza|terra[çc]o|dachterrasse|dakterras|biergarten|giardino|jard[ií]n|jardim/i.test(name) || t.rooftop === 'yes' || t.beer_garden === 'yes' ||
       (t.outdoor_seating === 'yes' && a !== 'restaurant'))) v.push('rooftop');
  if (a === 'bar' && !chain && !wineName) v.push('cocktail');
  // A bar, pub or club with live music, or a music venue. Arts centres, theatres and cinemas that sometimes
  // host gigs don't count: as a night's live-music stop they get swapped away (Rich Mix in Shoreditch).
  if (a === 'music_venue' || (t.live_music === 'yes' && ['bar', 'pub', 'nightclub', 'restaurant'].includes(a)) ||
      (a === 'nightclub' && /jazz|live/i.test(name))) v.push('live');
  if (/billiards|darts|shuffleboard|10pin/.test(sport) || t.leisure === 'bowling_alley' ||
      (['bar', 'pub'].includes(a) && /\bpool\b|darts|shuffle|bowl|ping ?pong|games|billar|biliardo|billard|bolera|kicker|futbol[ií]n/i.test(name))) v.push('games');
  if ((a === 'theatre' && /comedy/i.test(t['theatre:genre'] || '')) || /comedy|\blaugh|com[ée]die|stand.?up|cabaret|kabarett/i.test(name)) v.push('comedy');
  if (a === 'karaoke_box' || t.karaoke === 'yes' || /karaoke/i.test(name)) v.push('karaoke');
  if (a === 'nightclub' && !chain) v.push('dance');
  if (['fast_food', 'restaurant'].includes(a) && late(hours)) v.push('latefood');
  return v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One OSM element → one venue, or null if it isn't a night-out place or is marked as gone.
function toVenue(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  const vibes = classify(t);
  if (!vibes.length || lat == null) return null;
  // Marked as gone: closed in the name, hours of "closed"/"off", an end date that has passed,
  // or flagged disused. (Most closures aren't marked at all; user reports catch those.)
  const today = new Date().toISOString().slice(0, 10);
  // A closed marker only counts when tagged onto the name, "Name (closed)" or "Name – Fechada", so places
  // simply called La Ferme ("farm") or Cerrado stay.
  if (/[([\-–—]\s*(permanently closed|closed|cerrad[oa]|fermée?|chius[oa]|fechad[oa]|geschlossen|gesloten)\b/i.test(t.name) ||
      /^\s*(closed|off)\s*$|^\s*mo-su\s+off\s*$/i.test(t.opening_hours || '') ||
      (t.end_date && t.end_date <= today) || t.disused === 'yes' || t.abandoned === 'yes') return null;
  return {
    id: el.type[0] + el.id,                       // n123 / w456 / r789
    name: t.name,
    lat: +lat.toFixed(6), lng: +lng.toFixed(6),
    vibes,
    street: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined,
    postcode: t['addr:postcode'] || undefined,
    hours: t.opening_hours || undefined,
    website: t.website || t['contact:website'] || undefined,
    phone: (t.phone || t['contact:phone'] || '').split(';')[0].trim() || undefined,   // for booking later
    booking: ['yes', 'required', 'recommended'].includes(t.reservation) ? t.reservation : undefined,
    // Free quality signal: the place has its own Wikipedia/Wikidata entry, or is a listed
    // historic building. Chains are excluded, so this means "notable", not "big".
    known: (!(t.brand || t['brand:wikidata']) && !!(t.wikidata || t.wikipedia || t.heritage || t.historic)) || undefined,
  };
}

const todo = areas.filter(a => (!only || a.id === only) && (!cityOnly || (a.city || 'london') === cityOnly));
const byCity = {};
for (const a of todo) {
  if (missingOnly && await exists(new URL(`areas/${a.id}.json`, root))) continue;
  (byCity[a.city || 'london'] = byCity[a.city || 'london'] || []).push(a);
}
// Batches of up to 6 neighbourhoods: small enough that a busy server answers, few enough requests to be polite.
const BATCH = 6, batches = [];
for (const [city, list] of Object.entries(byCity)) for (let i = 0; i < list.length; i += BATCH) batches.push([city, list.slice(i, i + BATCH)]);

for (const [city, cityAreas] of batches) {
  process.stdout.write(`${city}: ${cityAreas.map(a => a.name).join(', ')}… `);
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      res = await fetch(ENDPOINTS[attempt % ENDPOINTS.length], {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query(cityAreas)),
      });
    } catch (e) {
      res = { ok: false, status: 'network error' };
    }
    if (![429, 502, 503, 504, 'network error'].includes(res.status)) break;
    process.stdout.write(`(${res.status}) `);
    await sleep(attempt % ENDPOINTS.length === ENDPOINTS.length - 1 ? 30000 : 3000);
  }
  if (!res.ok) { console.log(`failed: HTTP ${res.status}, kept the old files`); continue; }
  const data = await res.json();
  if (data.remark && /error|timed out/i.test(data.remark)) { console.log(`failed: ${data.remark.slice(0, 120)}, kept the old files`); continue; }
  const all = [];
  for (const el of data.elements) {
    const v = toVenue(el);
    if (v) all.push(v);
  }
  console.log(`${all.length} venues`);
  for (const area of cityAreas) {
    const venues = all.filter(v => distM(area, v) <= RADIUS_M);
    const counts = {};
    venues.forEach(v => v.vibes.forEach(x => counts[x] = (counts[x] || 0) + 1));
    await writeFile(new URL(`areas/${area.id}.json`, root), JSON.stringify({
      area: area.id,
      fetched: new Date().toISOString(),
      source: 'OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
      venues,
    }));
    console.log(`  ${area.name}: ${venues.length} venues`, JSON.stringify(counts));
  }
  await sleep(5000);
}
