# Owlabout — ideas and next steps

The one place to pick things up from. Last updated 10 November 2026.
`roadmap.md` is the original plan and partly out of date; this file is current.

---

## Where things stand

**Live at [getowlabout.com](https://getowlabout.com)** (Cloudflare Worker + D1, about £0/month):

| Area | What's there |
|---|---|
| Cities | 8 cities, 100 neighbourhoods: London 45, Paris 10, Madrid 8, Barcelona 8, Berlin 8, Rome 7, Lisbon 7, Amsterdam 7 |
| Languages | English, French, Spanish, Italian, Portuguese (Brazil). Japanese waits for Tokyo/Kyoto |
| Plans | Ready-made or custom; edit stops (add, remove, reorder, change); Times editor (12pm–3am, nudge stops by 15 min); fallbacks when a kind of place runs out; weather-aware (rain swaps outdoor stops); works offline |
| Groups | **Ask the group first** (vote, plan built from the overlap) · group plans at `/p/…` (join by name) · after the night: 👍 / 👎 / Closed + tags |
| Growth | WhatsApp previews per plan, 153 neighbourhood/city pages for search (local languages too) |
| Data | OpenStreetMap venues, free "well-known place" boost, group votes feed rankings |
| Numbers | `getowlabout.com/stats` (curator password, in `.curator-token`) |

**Still to do yourself:**
- [ ] Phone test on iPhone + Android (send to group → WhatsApp → join on a second phone; try a group vote)
- [ ] Send to the first 5–10 friend groups, then read `/stats` together after a week
- [ ] Claim social handles: @owlabout (or @getowlabout) on Instagram, TikTok, X
- [ ] Cloudflare → Notifications: Workers errors + health check on getowlabout.com → hello@getowlabout.com
- [ ] A native speaker checks each language (FR, ES, IT, PT) for 10 minutes before promoting there

---

## What "working" looks like (read `/stats`)

| Signal | Promising | Rethink |
|---|---|---|
| Plans sent to a group | 1 in 5 or more | almost none |
| People who come back another week | a steady share, unprompted | one-offs only |
| Group plans with 2+ people joined | groups forming | organiser alone |
| Ratings after the night | people tap 👍/👎 | nobody rates |

Everything below assumes these look at least decent. If they don't, fix the core before adding features.

---

## Next release: retention and things competitors can't copy

Agreed 10 Nov 2026, in this order. #1 (group vote) is already live.

| # | Idea | What it is | Steps |
|---|---|---|---|
| 2 | **Crews** | Recurring groups ("the Thursday lot") with their past nights, who rated what, and "plan again" | 1. Turn a group plan into a named crew · 2. Crew page: past nights, favourite places · 3. "Plan again with this crew" starts a vote for everyone |
| 3 | **Notifications** | "Your plan starts in an hour", "How was last night?" (drives ratings), "Sam started a vote" | 1. Web push (VAPID keys as a Worker secret) · 2. Ask permission after joining a group, not on first visit · 3. Scheduled sends via a Cloudflare cron. Note: on iPhone it only works once the site is added to the home screen |
| 4 | **Neighbourhood passport** | Stamps for each neighbourhood or city you actually went out in (confirmed by your group's rating). "14 of 45 London neighbourhoods" | 1. Count rated nights per browser · 2. Passport page · 3. Shareable card. Rewards **exploring**, never frequency: no streaks, no drinking leaderboards |
| 5 | **Weekend drop** | Every Thursday: "3 plans for this weekend in your city", built from the best-rated places | 1. Weekly page per city · 2. Doubles as Instagram/TikTok content · 3. Later: email/push opt-in |
| 6 | **Year in nights** | December recap: neighbourhoods explored, top places, your crew's favourite | 1. Needs a year of history (so after accounts or long-lived browser ids) · 2. Shareable image, i.e. free marketing |

Not doing: a home-screen **widget** (needs a native app, which a website can't provide).

---

## Bookings and revenue

Idea 10 Nov 2026: reservation buttons on the site, take a percentage, and approach restaurants with proof that people find them through Owlabout.

**Rule from day one: venues pay for bookings, never for ranking.** Any paid placement is labelled "Sponsored". The plans' honesty is the moat, and the About page promises no venue pays to be there.

| Step | What | Money | Effort |
|---|---|---|---|
| 1 | **Book / Website button** on each card (from the venue's OpenStreetMap website or booking link) + **booking clicks per venue** in `/stats` | none yet, builds proof ("38 groups planned nights at your place, 12 clicked to book") | small |
| 2 | **Booking-platform affiliate schemes**: TheFork (Spain, Italy, France, Portugal), OpenTable, DesignMyNight… usually a small fee per seated booking. Check each programme's current terms | per booking | medium |
| 3 | **Direct venue deals** using step 1's numbers: monthly fee, fee per booked group, group-table offers ("table for 8, Friday") | biggest | sales work |
| 4 | Own booking with deposits | later, only at scale | large |

---

## Other ways to make money

Idea 10 Nov 2026: don't depend on selling to a publisher; build revenue. The test for every idea: does it make plans worse? If yes, it's a bad deal however much it pays.

**Early (hundreds to a few thousand users):**

| # | Idea | How it makes money | Steps |
|---|---|---|---|
| 1 | **Owlabout Nights**: hosted crawls | Tickets (£10–20) for a guided night in one neighbourhood ("Thursday in Malasaña, 4 stops, first drink included"); partner venues give a discount or a cut | 1. Pick one neighbourhood you know + 3–4 friendly venues · 2. Ticket page (a ticketing platform to start) · 3. Run it, film it for TikTok · 4. Repeat weekly, then other cities. Needs: event insurance, a host, clear age policy |
| 2 | **Event ticket affiliates** | Ticketed stops in plans (gigs, comedy, club nights) via Dice, Skiddle, Fever, Eventbrite… usually a % or fee per ticket; check each programme's terms | 1. Apply to programmes · 2. Pull "what's on tonight" near the area · 3. Offer an event as a plan stop |
| 3 | **Booking affiliates** | See "Bookings and revenue" above | — |
| 4 | **Hotel and hostel widget** | Monthly fee (say £20–50) for a branded "Tonight near you" page or lobby QR code | 1. Branded plan page per property · 2. Pilot with 2–3 hostels you can walk into · 3. Price it once they use it |
| 5 | **Team nights, birthdays, hen and stag parties** | Fee or venue commission per big-group event (10–30 people) | 1. "Planning for 10+?" form · 2. Do the first ones by hand · 3. Productise what repeats |

**Middle (a few thousand to tens of thousands):**

| # | Idea | How | Watch out |
|---|---|---|---|
| 6 | **Venue subscriptions** ("Owlabout for venues") | £20–50/month: your stats (in plans, kept vs swapped, ratings, tags), post a group offer | Never affects ranking |
| 7 | **Group offers** | "Groups of 6+: first round 20% off", shown when a group plan locks; venue pays per redeemed group | Needs a simple redeem code |
| 8 | **Sponsored plans and partners** | Tourism boards, festivals, events sponsor a labelled ready-made night or the weekend drop | Alcohol brands: strict ad rules (no appeal to under-18s, no linking drinking to social success); start with tourism/events |

**Later (large scale):**

| # | Idea | How | Note |
|---|---|---|---|
| 9 | **Owlabout+** | Small subscription: unlimited crews, tag filters, recaps | People rarely pay for planning; only once crews/history exist |
| 10 | **Night-time economy insights** | Anonymised totals for councils, business districts, the London Night Czar's office | Totals only, never individuals |
| 11 | **Gift a night out** | Vouchers for a pre-booked night with partner venues | Margin product |
| 12 | **Ads** | Native, labelled "Sponsored" cards only | No banner ads: tiny money, cheapens the brand |

**Avoid:** paid ranking · banner ads before scale · handling group money (kitties, deposits) yourself (payments regulation; use a provider if ever needed).

**Suggested order:** now 1 + 2 → next 3 + 4 → later 6, 7, 8 → much later 5 at scale, 9–11. The publisher sale stays as an exit; revenue makes that conversation stronger.

## Accounts (later, "Plan C")

No accounts yet, deliberately: sign-up kills the group loop, and accounts mean storing emails and naming the operator (you or a company) on the privacy page.
Everything already uses a random browser id, so when accounts arrive, signing in **claims** that id and keeps past groups and votes.

**Build accounts when:** groups and ratings are being used but returns are low (people need history and a reason to come back), or ratings need one-person-one-vote trust at scale, or bookings/payments start.

What it would be: sign in by email link (no passwords) · "My nights" across devices · claim this browser's history · notification settings.

---

## More cities and neighbourhoods

**Wish list:** Manchester, Liverpool, Milan, Zurich, New York, Chicago, Mexico City, São Paulo, Rio, Melbourne, Sydney, Miami; then Tokyo, Kyoto, Los Angeles, San Diego (check data quality and walkability first); plus more neighbourhoods in every existing city.

**Push back / hold:** Brasília (built for cars) and Dubai (alcohol mostly in hotels, little walking between venues). Los Angeles and San Diego only in walkable pockets.

**How to scale (agreed, not built):** today's download is one request per neighbourhood and the free server is slow (~1–2 hours for 60 areas).
1. One request per **city** instead, split into neighbourhoods locally
2. **Auto-detect neighbourhoods** from venue density, named after the nearest OpenStreetMap place (review the list per city)
3. Prefer English venue names where they exist (Tokyo/Kyoto)
4. Then: add the city to `cities.json`, run `npm run check-areas -- --prune`, `npm run pages`, deploy

**City picker at scale** (idea 10 Nov 2026): Nick suggested countries with a dropdown of their cities. Agreed for later, with this design.
Switch when there are about 12–15 cities (the row stops fitting on a laptop), i.e. with the first expansion wave:
1. Replace the city bar with one "📍 Madrid ▾" button at the top
2. It opens a panel: search box ("lis" → Lisbon), Near me (nearest city by location), Recent cities
3. Below: cities grouped by country (Spain: Madrid · Barcelona; UK: London · Manchester · Liverpool…), the visitor's own country first (from language or location)
4. Needs a `country` field per city in `cities.json` (already there) and country names in each language

Adding a language: copy the `en` block in `public/i18n.js`, translate, add to `LANGS`, have a native speaker read it. Japanese arrives with Tokyo/Kyoto.

---

## Parked for much later: group-to-group social

Idea 10 Nov 2026: connect groups based on what they want to do (groups of friends meeting other groups, dating, couples), growing Owlabout into an all-in-one social app.

Why parked: safety (strangers, night, alcohol), UK Online Safety Act duties for apps where users meet users (risk assessments, moderation, age checks), it needs thousands of active users per city on the same night, it scares off publisher buyers, and past attempts (Grouper, Tinder Social) shut down.

Safer path toward it:
1. **Open plans**: a group marks its plan "friends of friends welcome" (still invite-only). Small; could build any time
2. **Hosted nights**: a venue or organiser posts "Thursday crawl in Soho, 8 spots" and people join (Meetup/Eventbrite for nights out; venues pay)
3. **Group matching**: only with accounts, verification, a safety process and real density in a city

Revisit when one city has thousands of monthly active users and accounts exist.

---

## Paused

- **Claude research for curation**: one Soho run used about $4 of credit for modest gains. The script stays (`npm run research`) for when a publisher backs the product. Soho's 23 researched picks are live.

## Company and sale readiness (when there's traction)

- [ ] Open a company before taking money or signing a publisher; put its name on the privacy page
- [ ] Trademark: OWLABOUT was clear on the UK register (exact and "OWL ABOUT"); register it once there's a company
- [ ] Data licence check: OpenStreetMap's ODbL has share-alike rules for databases built from it. Fine for the app; matters when selling data or the company
- [ ] Move the code from `prototypes/03-group-swipe` to a proper `src/` with automated tests (a buyer's engineer will ask)
- [ ] Pitch one-pager for publishers (Time Out, The Nudge) once `/stats` has numbers
- [ ] Privacy and terms in other languages (needs a human translator, not machine translation)

Ways it becomes valuable: sell to a publisher on proven usage · license the engine to publishers · consumer app with booking commission. All depend on the "working" signals above.
