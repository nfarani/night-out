// Research one area with Claude + web search and send the results to /curate as
// suggestions. Nothing reaches a plan until you accept it there.
//
//   npm run research -- peckham              research, save research/peckham.json, upload suggestions
//   npm run research -- peckham --no-upload  research and save only
//   npm run research -- peckham --dry-run    no API call: shows what would be sent (free)
//   npm run research -- peckham --auto       skip /curate: items backed by 2+ independent sites go
//                                            live, replacing this area's previous research picks
//   npm run research:all -- --auto           every area, one after another
//
// Needs Anthropic credentials: ANTHROPIC_API_KEY, the .anthropic-key file, or an `ant auth login` profile.
// Uploading needs the curator password: CURATOR_TOKEN, or the .curator-token file.
// Roughly $0.60–1.20 per area: one Claude Opus 5.5 run with up to 20 web searches.
//
// Claude only chooses from venues already in our map data (by id), and only source
// URLs that appeared in its own web search results are kept.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SITE = process.env.SITE || 'https://getowlabout.com';
const RADIUS_M = 1100;
const TYPE_NAMES = { pub:'pub', wine:'wine bar', rooftop:'drinks outside', cheap:'cheap eats', dinner:'dinner', cocktail:'cocktail bar',
  games:'bar games', live:'live music', comedy:'comedy', karaoke:'karaoke', dance:'club', latefood:'late-night food' };

const args = process.argv.slice(2);
const areaId = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run'), noUpload = args.includes('--no-upload'), auto = args.includes('--auto');
const root = new URL('../', import.meta.url);

const areas = JSON.parse(await readFile(new URL('public/data/areas.json', root), 'utf8'));
const area = areas.find(a => a.id === areaId);
if (!area) {
  console.error('Usage: npm run research -- <area> [--dry-run] [--no-upload]\nAreas: ' + areas.map(a => a.id).join(', '));
  process.exit(1);
}

function distM(a, b){
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const venues = JSON.parse(await readFile(new URL(`public/data/areas/${area.id}.json`, root), 'utf8')).venues
  .filter(v => distM(area, v) <= RADIUS_M);
const byId = new Map(venues.map(v => [v.id, v]));
// Picks per type, so plans can rotate instead of repeating the same two or three places.
const PER_TYPE = 8;
const typesHere = Object.keys(TYPE_NAMES).filter(t => venues.some(v => v.vibes.includes(t)));
const lines = venues.map(v => [v.id, v.name, v.vibes.map(t => TYPE_NAMES[t]).join('/'), v.street || ''].join(' | ')).join('\n');

const system = `You research nightlife for a London night-out planner. Locals use it to plan an evening in one neighbourhood, so a bad recommendation costs them their night.

How to work:
- Search the web for what people who know the area say: local guides, city magazines, Reddit threads, food and drink writers, recent news about closures.
- Favour places recommended independently by several sources, and recent sources over old ones.
- Flag places to avoid only with real evidence: repeated complaints about service, hygiene, safety or rip-off pricing, tourist traps locals warn about, or recent closures.
- You may only choose venues from the list you are given, referred to by their id. If a well-loved place is missing from the list, put it in not_in_list instead.
- Write each "why" in your own words, one short sentence, no quotes from sources. It's a note for the editor, not marketing copy.
- If evidence is thin, return fewer entries. An empty list is better than a guess.`;

const prompt = `Area: ${area.name}, London.

These are the venues our map has within walking distance of the centre of ${area.name}, one per line as id | name | type | street:
<venues>
${lines}
</venues>

Research which of these are worth recommending for a night out and which to avoid. The planner builds many different nights from your picks, so depth per type matters: aim for up to ${PER_TYPE} picks for each of these types (${typesHere.map(t => TYPE_NAMES[t]).join(', ')}), fewer where good options are genuinely scarce. Search per type rather than only for general area guides. Add any avoids you find real evidence for, especially closures.

Reply with only a JSON object in this shape, nothing before or after it:
{"picks":[{"id":"n123","why":"...","sources":["https://..."]}],
 "avoid":[{"id":"w456","why":"...","sources":["https://..."]}],
 "not_in_list":[{"name":"...","why":"..."}]}
Every source must be a URL from your search results.`;

console.log(`${area.name}: ${venues.length} venues in range, prompt ~${Math.round((system.length + prompt.length) / 4).toLocaleString()} tokens`);
if (dryRun) {
  console.log('\n--- dry run: first lines of the venue list ---\n' + lines.split('\n').slice(0, 8).join('\n') + '\n...');
  process.exit(0);
}

// Key from the environment, or from the git-ignored .anthropic-key file next to package.json.
if (!process.env.ANTHROPIC_API_KEY) {
  try { process.env.ANTHROPIC_API_KEY = (await readFile(new URL('.anthropic-key', root), 'utf8')).trim(); } catch (e) {}
}
const client = new Anthropic();
const messages = [{ role:'user', content:prompt }];
const seenUrls = new Set();
let response;
try {
  // Server-side web search can pause a long turn; resend the conversation to let it finish.
  for (let turn = 0; turn < 4; turn++) {
    response = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',                         // if a safety classifier declines, retry on a fallback model
      output_config: { effort:'high' },
      system,
      tools: [{
        type: 'web_search_20260209', name: 'web_search', max_uses: 20,
        user_location: { type:'approximate', city:'London', country:'GB', timezone:'Europe/London' },
      }],
      messages,
    }).finalMessage();
    for (const block of response.content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === 'web_search_result' && r.url) seenUrls.add(r.url);
      }
    }
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role:'assistant', content:response.content });
  }
} catch (e) {
  if (e instanceof Anthropic.AuthenticationError) console.error('No valid Anthropic credentials. Set ANTHROPIC_API_KEY (or run `ant auth login`) and try again.');
  else if (e instanceof Anthropic.RateLimitError) console.error('Rate limited by the Anthropic API. Wait a minute and retry.');
  else if (e instanceof Anthropic.APIError) console.error(`Anthropic API error ${e.status}: ${e.message}`);
  else console.error(e.message || e);
  process.exit(1);
}

if (response.stop_reason === 'refusal') { console.error('The model declined this request.'); process.exit(1); }
if (response.stop_reason === 'max_tokens') { console.error('Response was cut off (max_tokens). Try again.'); process.exit(1); }

const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
let raw;
try { raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
catch (e) { console.error('Could not read JSON from the reply:\n' + text.slice(0, 800)); process.exit(1); }

// Keep only venues we have, and only URLs the search actually returned.
const tidy = (list, kind) => (Array.isArray(list) ? list : [])
  .filter(i => i && byId.has(i.id))
  .map(i => ({ id:i.id, name:byId.get(i.id).name, kind, note:String(i.why || '').trim().slice(0, 280),
    sources:(Array.isArray(i.sources) ? i.sources : []).filter(u => seenUrls.has(u)).slice(0, 5) }));
const items = [...tidy(raw.picks, 'pick'), ...tidy(raw.avoid, 'avoid')];
const dropped = (raw.picks || []).length + (raw.avoid || []).length - items.length;

await mkdir(new URL('research/', root), { recursive:true });
const outFile = new URL(`research/${area.id}.json`, root);
await writeFile(outFile, JSON.stringify({ area:area.id, researched:new Date().toISOString(), items, not_in_list:raw.not_in_list || [], searched:[...seenUrls] }, null, 2));

console.log(`\n${items.filter(i => i.kind === 'pick').length} picks, ${items.filter(i => i.kind === 'avoid').length} avoids` +
  (dropped ? `, ${dropped} dropped (not in our map data)` : '') + `, ${seenUrls.size} pages searched`);
for (const i of items) console.log(`  ${i.kind === 'pick' ? '+' : '-'} ${i.name}: ${i.note} (${i.sources.length} sources)`);
if ((raw.not_in_list || []).length) console.log('\nRecommended but missing from the map data:\n' + raw.not_in_list.map(n => '  ? ' + n.name + ': ' + n.why).join('\n'));
console.log('\nSaved ' + outFile.pathname);

// Auto mode publishes without a human look, so it needs corroboration: at least two
// different websites (www. ignored) behind every pick or avoid.
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; } };
const corroborated = items.filter(i => new Set(i.sources.map(host).filter(Boolean)).size >= 2);
if (auto) console.log(`\nAuto: ${corroborated.length} of ${items.length} have 2+ independent sources and will go live`);

if (noUpload || !(auto ? corroborated : items).length) process.exit(0);
let token = process.env.CURATOR_TOKEN;
if (!token) { try { token = (await readFile(new URL('.curator-token', root), 'utf8')).trim(); } catch (e) {} }
if (!token) { console.log('No CURATOR_TOKEN or .curator-token file, so nothing was uploaded.'); process.exit(0); }

const res = await fetch(SITE + (auto ? '/api/curation/auto' : '/api/curation/suggestions'), {
  method: 'POST',
  headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
  body: JSON.stringify({ area:area.id, items:auto ? corroborated : items }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) { console.error('Upload failed: ' + (out.error || res.status)); process.exit(1); }
console.log(auto ? `${out.live} now live on plans (your own /curate decisions were left alone)`
  : `Uploaded ${out.added} suggestions. Review them at ${SITE}/curate`);
