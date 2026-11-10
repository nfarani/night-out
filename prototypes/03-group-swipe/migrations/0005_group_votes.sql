-- Group votes before a plan exists: the organiser proposes a day and up to three
-- neighbourhoods, friends say what they're up for, and the plan is built from the overlap.
-- When the organiser makes the plan, plan_id points at it and voters become its members.

CREATE TABLE IF NOT EXISTS polls (
  id          TEXT PRIMARY KEY,          -- short link code, /v/<id>
  city        TEXT NOT NULL,
  areas       TEXT NOT NULL,             -- JSON ["soho", "covent"], 1 to 3
  date        TEXT NOT NULL,             -- YYYY-MM-DD, city time zone
  start_min   INTEGER NOT NULL,
  lang        TEXT,
  plan_id     TEXT,                      -- set once the plan is made
  created_by  TEXT NOT NULL,             -- device id
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    TEXT NOT NULL,
  device     TEXT NOT NULL,
  name       TEXT NOT NULL,
  areas      TEXT NOT NULL,              -- JSON, which of the poll's areas they'd go to
  types      TEXT NOT NULL,              -- JSON, kinds of place they're up for
  end_min    INTEGER NOT NULL,           -- how late they'll stay
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, device)
);
