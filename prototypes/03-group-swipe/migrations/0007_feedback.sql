-- Messages from the in-app feedback form. contact is optional (an email, if they want a reply).
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  area       TEXT,
  screen     TEXT,                -- home, plan, group, vote, about
  lang       TEXT,
  device     TEXT,                -- random browser id, to group messages from the same person
  message    TEXT NOT NULL,
  contact    TEXT
);
