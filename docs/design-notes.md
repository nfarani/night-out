# Design notes

## Reference

The visual direction came from a travel-app reference Nick shared: full-bleed
photography, warm personal greeting as the headline, rounded pill search bar,
chip filters, floating dark pill navigation, photo cards with gradient
overlays and metadata sitting on the image.

The screenshot is at `docs/reference-ui.png`.

## Principles

**Editorial, not utility.** This should feel like a good city magazine, not a
dashboard. If it could be any SaaS product with the colours swapped, it is
wrong.

**Mobile-first, genuinely.** Used standing on a pavement, one-handed, at night,
slightly drunk. 380px viewport is the primary target. Tap targets generous.
Nothing that needs precision.

**Zero-input to value.** The current prototypes ask for a postcode and a radius
before showing anything. That is backwards. The reader should land on
fully-formed plans — "Peckham crawl," "Cheap date in Soho," "Sunday recovery in
Hackney" — and tap one. Configuration is refinement, never a gate. This single
inversion is probably worth more to retention than any feature built so far.

## Type and colour

- Display face: a serif with character (Fraunces has been used) for venue
  names, collection titles, headlines
- UI face: a clean sans (Inter) for everything else
- One strong accent, used sparingly — amber in the pub build, a warm red in
  the collections build
- Warm paper background rather than cold grey or pure white
- Generous radii (14–24px), soft shadows, no hard edges

## Patterns that worked

- Photo card with gradient scrim and name/meta on the image
- Numbered rail down the left of an itinerary with connecting line and walk
  times between stops
- Chips for quick adds, with +/− steppers when quantity matters
- Floating dark pill nav rather than a full-width bar

## Patterns to avoid

- Default Tailwind look
- Generic stock-photo mood shots standing in for real venue photography. The
  prototypes use hashed-by-name fallbacks; fine for a demo, not for production.
  Real venue photos come from the Places photo endpoint.
- Long forms before any payoff
