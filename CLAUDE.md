# Night Out — going-out planner for London

You are the orchestrator for this project. Read this file first in every session.

## What this is

A going-out planning app for London. The user picks what kind of outing they
want; the app produces a **routed, shareable itinerary** — not a search results
page.

Two working prototypes exist (see `prototypes/`). They represent two different
product bets. The strategic direction is **not yet settled** — this is still a
product discovery project as much as an engineering one.

## The core product question (unresolved — do not paper over it)

The honest problem: a "find pubs near me" tool is a worse Google Maps. Google
has better data, and the user already has it installed. Any version of this
product that ends at "here is a list of nearby venues" has no reason to exist.

The two live hypotheses:

**A. Consumer group-decision tool.** The wedge is that nobody has solved the
WhatsApp "where are we going" argument. Randomness/reshuffle is a hook; real
retention would come from *preference aggregation* (everyone taps what they'd
be up for, app finds the overlap) and from the group's data living in the app.
Monetisation realistically means becoming transactional — commission on
bookings — because discovery alone captures none of the value it creates.

**B. B2B itinerary engine licensed to publishers.** Outlets like Time Out or
The Nudge already produce the expensive part (curation, taste, "what's on this
weekend"). What they lack is a way for a reader to turn a listicle into a plan
they actually walk. This version is content-agnostic: feed it any curated list
of venues, get back a sequenced, routed, shareable itinerary, plus engagement
analytics the publisher can sell against.

Hypothesis B is the one with the clearer near-term buyer. Hypothesis A is the
one with the bigger ceiling. They share ~80% of the engine. Build shared
primitives; do not hard-code assumptions that only serve one.

## Strategic constraints — carry these into every decision

- **Curation is the moat, not the data.** Google Places is a commodity. Anyone
  can call it. An opinionated set of venues ("three places within eight minutes
  that work in the rain") is defensible; "top rated ramen" is not.
- **Store place IDs, hydrate on read.** Google's terms restrict caching of
  Places data — place_id can generally be stored long-term, most other fields
  cannot. Architect for fetch-on-render from day one. VERIFY current Google
  Maps Platform terms before building around this; they may have changed.
- **Never ship a publisher's copy.** For a demo shown in a meeting, reproducing
  a few venue names to illustrate the format is defensible. Publishing their
  editorial is not. Keep demo collections local and clearly marked.
- **No API keys in the browser.** The current prototypes ask the user to paste
  their own Google key into localStorage. That is fine for solo testing and
  unshippable publicly. A server-side proxy is the hard gate before any public
  URL exists.

## Current state

- Two single-file HTML prototypes, no build step, no backend, no tests.
- No hosting, no domain, no deployment.
- All venue data in `prototypes/collections.html` is fictional placeholder copy.
- `data/` is empty — real curated packs go there.

## How to work on this

1. Read `docs/product-brief.md` and `docs/roadmap.md` before proposing work.
2. For anything beyond a small change, delegate to the specialist subagents in
   `.claude/agents/`. Use several in parallel when the work is genuinely
   separable; do not spawn one for a two-line edit.
3. Prototypes in `prototypes/` are reference, not a codebase to extend. When
   the direction is settled, the real build starts fresh in `src/`.
4. Push back on the user's ideas when they are weak. This project has already
   changed shape three times because the honest objection was raised rather
   than worked around. That is the correct behaviour — keep doing it.

## User context

Nick. London. Marketing background, Le Wagon web dev certificate, comfortable
with GitHub, uses Claude Code as the engineering layer rather than writing code
solo. Prefers diagrams, flows and maps over long prose. Give him the visual or
the decision, not a wall of text.
