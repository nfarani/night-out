-- Curation: your verdicts per venue (OSM id) per area, plus research suggestions waiting for review.
CREATE TABLE IF NOT EXISTS curation (
  area       TEXT NOT NULL,
  venue_id   TEXT NOT NULL,
  verdict    TEXT NOT NULL CHECK (verdict IN ('pick', 'avoid', 'suggest-pick', 'suggest-avoid', 'dismissed')),
  note       TEXT,
  sources    TEXT,            -- JSON array of URLs (research suggestions only)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (area, venue_id)
);

-- Usage: how often a venue was put in a plan, and how often people swapped it away.
CREATE TABLE IF NOT EXISTS stats (
  area     TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  shown    INTEGER NOT NULL DEFAULT 0,
  swapped  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (area, venue_id)
);
