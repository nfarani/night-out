-- Product funnel: how many times each step happened, per day, city and area. Counts only,
-- nothing about who did it. Steps: visit, new (first visit from this browser), return
-- (came back on a later day), plan, open_shared (opened a plan someone sent), swap,
-- reshuffle, edit, share, route.
CREATE TABLE IF NOT EXISTS funnel (
  day   TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  city  TEXT NOT NULL,
  area  TEXT NOT NULL,
  step  TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, city, area, step)
);
