// Venue counts per area, so an area with no snapshot (or too little in it to build a night)
// never shows up in the app.
//
//   npm run check-areas            report only
//   npm run check-areas -- --prune remove areas with no file or under MIN venues from areas.json

import { readFile, writeFile, access } from 'node:fs/promises';

const MIN = 60;
const root = new URL('../public/data/', import.meta.url);
const areas = JSON.parse(await readFile(new URL('areas.json', root), 'utf8'));
const prune = process.argv.includes('--prune');

const keep = [], drop = [];
for (const a of areas) {
  const f = new URL(`areas/${a.id}.json`, root);
  let n = null;
  if (await access(f).then(() => true, () => false)) n = JSON.parse(await readFile(f, 'utf8')).venues.length;
  (n !== null && n >= MIN ? keep : drop).push(a);
  console.log(`${(a.city || 'london').padEnd(10)} ${a.id.padEnd(22)} ${n === null ? 'NO FILE' : n}`);
}
console.log(`\n${keep.length} areas OK, ${drop.length} missing or under ${MIN} venues` + (drop.length ? ': ' + drop.map(a => a.id).join(', ') : ''));
if (prune && drop.length) {
  await writeFile(new URL('areas.json', root), JSON.stringify(keep, null, 2) + '\n');
  console.log('Removed them from areas.json');
}
