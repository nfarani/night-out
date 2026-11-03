# Prototypes

Both are single-file HTML. No build step — open by double-clicking.

These are **reference, not a codebase to extend.** When the direction is
settled, the real build starts fresh in `src/` and borrows the good parts.

---

## 01-pub-roulette.html

The consumer randomizer. Where the project started and how far it got.

**Flow:** postcode or area → radius slider → add stop categories (free text or
preset chips, with quantity steppers so "perfume shop ×5" works) → roll → a
routed multi-stop itinerary.

**Features worth keeping:**
- Nearest-neighbour route ordering so the walk makes sense
- Per-stop reroll without disturbing the rest of the day
- Move stops up/down
- Multi-stop Google Maps walking route link (origin → waypoints → destination)
- Share link with the whole itinerary encoded in the URL fragment — no backend
- Cards link through to the venue's Google Maps page; website, price level and
  open/closed status shown

**Problems:**
- Requires the user to paste their own Google API key into Settings, stored in
  `localStorage`. Unshippable publicly.
- Asks for configuration before showing any value.
- Built entirely on Google Places data, which is the "you're a worse Google"
  problem in product form.

---

## 02-curated-collections.html

The publisher/B2B bet. Same engine, different input and different buyer.

**Three tabs:**
- **Reader** — lands on collection cards, zero input. Tap one, get a routed
  plan. Choose length (2/3/5 stops), swap any stop for an alternative *from
  within the curated set*, reshuffle, open a walking route, share to a group
  chat as text plus a restoring link.
- **Editor** — the publisher-side tool. Non-technical person types title,
  standfirst, credit line, adds venues with their own notes, hits Publish and
  it appears live in Reader. Exports JSON.
- **Stats** — plans generated, stops swapped, shares, routes opened. Swap rate
  is the interesting one: it tells an editorial team which picks readers reject.

**All venue data is fictional placeholder copy** ("Sample Roastery Co.",
"Placeholder Records") behind a visible demo banner. Before any pitch, replace
one collection with a real published piece — their venues, their words, their
credit line — kept local and unpublished. See the licensing rules in
`CLAUDE.md`.

**Problems:**
- No persistence; published collections vanish on refresh
- Coordinates hand-entered, no place_id resolution
- Stats are localStorage counters, not real analytics

---

## 03-group-swipe/  (night planner + swipe experiment, OpenStreetMap snapshots)

The planner (`/`) replaced the swipe flow as the main page; the swipe flow lives at `/swipe`.

Setup and guardrails: `03-group-swipe/README.md`.

The group-decision bet (Hypothesis A), built as a Phase 0 test instrument.
Tests the brief's open question: does preference aggregation feel good?

**Flow:** swipe 12 *kinds of night* (not venues) — right = in, left = not
tonight, up = must → enter first name → share link → each friend opens it,
swipes, and their votes append to the same URL → overlap grid → "Pick the
night" builds a start / main event / late plan, walkable stop to stop.

**Design choices:**
- Swipe on activity types, not venues. Fewer cards, faster to finish, and it
  separates *what the group wants* from *which venue* (curation stays ours).
- Whole group state lives in the URL fragment (`#g=Name~0121…_Name~…`).
  No backend, no accounts. The link *is* the room.
- Every stop says why it was picked ("Ana & Tom are in · a must for Sam").
  That line is the commitment device — the app takes the blame.

**What to watch when testing with real groups:**
- Does everyone actually finish swiping, or does it die after the first person?
- Does the group accept the pick, or reshuffle/argue anyway?
- Do people want to swipe venues after the vibes?

**Problems:**
- Last-writer-wins: two friends forwarding different links fork the group.
  Fine for a test; a real room needs a tiny backend (Phase 3).
- Venues are an uncurated OpenStreetMap snapshot (chains filtered out). No
  ratings or open-now. Curated packs per area should override it where they exist.
- Neighbourhood centres are hand-set approximations.
- No time/day awareness — suggests karaoke on a Monday at noon.
