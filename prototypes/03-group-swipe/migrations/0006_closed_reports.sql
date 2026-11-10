-- "Closed for good?" reports from any visitor, one per browser per venue. A venue is hidden
-- for everyone once two different browsers report it (and fewer groups said they'd go back).
CREATE TABLE IF NOT EXISTS reports (
  area       TEXT NOT NULL,
  venue_id   TEXT NOT NULL,
  device     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (area, venue_id, device)
);
