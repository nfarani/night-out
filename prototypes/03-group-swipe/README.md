# 03 · Night planner (OpenStreetMap venues)

- `/` — **planner**: area → what → how many stops → start/until → day → a timed, walkable
  plan where each stop is checked against opening hours (when OSM has them, ~27% of venues).
- `/swipe` — the earlier group-swipe experiment, kept for reference.

```
npm run data ──▶ Overpass (OSM) ──▶ public/data/areas/<area>.json   (once, occasionally)
                                              │
browser ◀── static files only ────────────────┘   no server code, no API keys, £0
   └─ group state + OSM ids live in the URL (#a=…&g=…&p=wine:n123,…)
```

## Run it

```
npm install
npm run dev          # http://localhost:8787
```

Opening `public/index.html` by double-click won't work: the browser blocks loading the data files from disk.

## Refresh or add areas

Edit `public/data/areas.json` (id, name, centre lat/lng), then:

```
npm run data              # all areas, ~1–2 min, one Overpass query each
npm run data -- peckham   # one area
```

How OSM tags map to the 12 vibes is `classify()` in `scripts/fetch-osm.mjs`. Chains
(anything with a `brand` tag) are dropped, except for 2am food.

## Put it on a URL

```
npx wrangler login
npm run deploy
```

## Rules we're following

- **Overpass usage policy:** the public server is shared. Apps should stay around 100
  queries a day, and commercial use should self-host. So users never hit Overpass:
  we snapshot each area ourselves and serve static files.
- **ODbL licence:** storing the data is fine. The page credits "© OpenStreetMap
  contributors" with a link. The venue files are a derived database, so if they're
  published they're ODbL too. **Before a B2B deal, check how curated notes layered on
  OSM ids sit under share-alike.** Keeping notes in a separate file keyed by OSM id is
  the likely-clean pattern.
- Venue name links and the walking route open Google Maps by name and coordinates.
  That's a link, not use of Google data.

## Known gaps vs Google

- No ratings, so no quality filter. Picks are random among venues that list hours or a website.
- No "open now". Hours are shown raw from OSM where they exist.
- Thin categories: comedy, karaoke and wine bars are sparse in OSM. The app falls back to
  the next-best vibe in that slot and says so. This gap is exactly where curated packs come in.

## Curation (picks, avoids, research)

```
npm run research -- peckham ──▶ Claude + web search ──▶ suggestions ──▶ /curate (you accept or dismiss)
                                                                          │
planner ◀── GET /api/signals: picks (+ your note on the card), avoids ◀──┘  Cloudflare D1, free tier
   └──▶ POST /api/event: which venues were shown and which got swapped away
```

- **/curate**: open on the live site, unlock with the curator password (in `.curator-token`,
  never committed). Pick a venue to favour it and add a note that shows on plans. Avoid
  removes it from plans. "Often swapped" lists venues people keep rejecting.
- **Research** (needs an Anthropic API key, roughly $0.20–0.50 per area):
  `ANTHROPIC_API_KEY=... npm run research -- peckham`. Claude only chooses from venues
  already in the map data, only keeps source links from its own search results, and
  never overwrites a decision you've made. `--dry-run` shows what would be sent, for free.
- **Swap stats**: a venue swapped away in a large share of the plans it appears in (5+)
  gets ranked down automatically.
- Database schema lives in `migrations/`. Apply a new one with `npm run db:migrate`.
- To change the curator password: `npx wrangler secret put CURATOR_TOKEN`, and update
  `.curator-token`.
