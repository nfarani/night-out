-- Saved group plans: a fixed itinerary behind a short link (/p/<id>), the people who
-- joined it, and their "would you go again?" vote per stop. No accounts: a person is a
-- random id their browser made (device) plus the first name they typed. If accounts come
-- later, an account claims its device ids and keeps everything.

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,          -- short link code
  area        TEXT NOT NULL,
  city        TEXT NOT NULL,
  date        TEXT NOT NULL,             -- YYYY-MM-DD of the night, in the city's time zone
  start_min   INTEGER NOT NULL,          -- minutes after midnight; past 1440 = after midnight
  end_min     INTEGER NOT NULL,
  stops       TEXT NOT NULL,             -- JSON [{ type, venue }] in order; venue is an OSM id or null
  title       TEXT,                      -- preset key (English name), if it started from one
  lang        TEXT,                      -- organiser's language, for the link preview
  created_by  TEXT NOT NULL,             -- device id
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  plan_id    TEXT NOT NULL,
  device     TEXT NOT NULL,
  name       TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (plan_id, device)
);

CREATE TABLE IF NOT EXISTS ratings (
  plan_id    TEXT NOT NULL,
  area       TEXT NOT NULL,
  venue_id   TEXT NOT NULL,
  device     TEXT NOT NULL,
  vote       INTEGER NOT NULL CHECK (vote IN (-2, -1, 1)),   -- 1 would go again, -1 wouldn't, -2 it was closed
  tags       TEXT,                                            -- JSON, e.g. ["vibe","value"]; only with 1 / -1
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plan_id, venue_id, device)
);
CREATE INDEX IF NOT EXISTS ratings_by_area ON ratings (area, venue_id);
