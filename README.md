# Night Out

A going-out planner for London. Picks a routed, shareable itinerary rather
than returning a list of venues.

## Getting started with Claude Code

```bash
cd night-out-app
claude
```

Claude reads `CLAUDE.md` automatically and picks up the project context,
strategic constraints and the five specialist subagents.

**Try opening with:**

```
Read the brief and the roadmap. I want to decide between the two
hypotheses — walk me through it.
```

or, to get straight into building:

```
Use backend-architect to design the Places API proxy. I want to get this
on a real URL.
```

## Subagents

| Agent | Use for |
|---|---|
| `product-strategist` | Direction, positioning, monetisation, "is this worth building" |
| `frontend-builder` | Screens, components, interaction, layout |
| `backend-architect` | API design, the key proxy, data model, persistence, deploy |
| `places-data` | Data sources, licensing, caching rules, building packs |
| `pitch-writer` | Publisher pitches, decks, landing copy, demo scripts |

Invoke by name (`use product-strategist to...`) or let Claude route
automatically based on the task.

## Layout

```
CLAUDE.md              orchestrator context — read first
README.md              this file
.claude/agents/        five specialist subagents
docs/
  product-brief.md     the thinking, the two hypotheses, open questions
  roadmap.md           phased plan, ordered by what unblocks what
  design-notes.md      visual direction and UI patterns
  reference-ui.png     the travel-app reference the look came from
prototypes/
  README.md            what each prototype does and where it falls short
  01-pub-roulette.html consumer randomizer
  02-curated-collections.html  publisher/B2B engine
data/
  example-pack.json    pack schema template
```

## Before anything ships publicly

Both prototypes put a Google Maps API key in the browser. That is fine for
solo local testing and unshippable publicly — anyone can pull it from the
network tab. A server-side proxy is Phase 1 of the roadmap and the hard gate
before any public URL exists.
