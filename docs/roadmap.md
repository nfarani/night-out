# Roadmap

Ordered by what unblocks what, not by what is most fun.

## Phase 0 — Decide (no code)

Nothing below matters until the direction is picked.

- [ ] Choose lead hypothesis: consumer group tool (A) or publisher engine (B)
- [ ] Build 3 real curated packs for areas Nick knows cold, by hand
- [ ] Put the prototype in front of ~10 real people on a real night out
- [ ] Answer: does reshuffle feel good, or just clever?

Use the `product-strategist` agent here. Resist starting Phase 1 early —
every previous shape of this project was abandoned after a strategic
objection, and building first just makes the objection more expensive.

## Phase 1 — Make it shippable (the hard gate)

The current prototypes cannot be put on a public URL. This phase fixes that.

- [ ] Serverless proxy holding the Google key server-side
      (`/api/geocode`, `/api/search`, `/api/venue/:placeId`)
- [ ] Rate limiting + origin checks on the proxy
- [ ] Pick and scaffold the real stack in `src/` (default proposal:
      Next.js + TS + Tailwind on Vercel)
- [ ] Port the stronger prototype into it
- [ ] Deploy to a real domain
- [ ] Verify current Google Maps Platform caching terms, architect to match

Owner agents: `backend-architect`, then `frontend-builder`.

## Phase 2 — Make it real content

- [ ] Pack data model (`{ placeId, category, note }` + pack metadata)
- [ ] Pack authoring that a non-developer can use
- [ ] Batch resolver: venue names → place_ids, stored once
- [ ] 5–10 genuinely good London packs

Owner agents: `places-data`, `backend-architect`.

## Phase 3 — The group loop

Only after Phase 1 and 2 are real and used.

- [ ] Share-by-URL hardening (works today, zero infrastructure)
- [ ] Decide whether live group voting is worth a managed backend
- [ ] If yes: Supabase/Firebase, rooms, realtime plan state
- [ ] Preference aggregation — the stronger version of the group mechanic

Do not build realtime speculatively.

## Phase 4 — Depends on hypothesis

**If A (consumer):**
- [ ] Booking integration — the plan isn't real until it's booked
- [ ] Commission model
- [ ] Retention instrumentation

**If B (publisher):**
- [ ] Embeddable widget (drops into an article page, not a separate domain)
- [ ] Editor-facing pack CMS
- [ ] Analytics dashboard: plans generated, swap rate, shares, routes opened
- [ ] Licensing pilot with one outlet, one borough

Owner agent for the outside-facing parts: `pitch-writer`.

## Explicitly not doing yet

- Native mobile app. Web first — faster to validate, no app store review, no
  install friction when sharing a link. Revisit only when push notifications
  or offline genuinely matter.
- Realtime group voting before the share loop is proven.
- Any pitch to a publisher before there is a live URL and real usage.
