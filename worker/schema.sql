CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  question     TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  country      TEXT,
  ua           TEXT,
  session_id   TEXT,
  visitor_name TEXT,
  visitor_co   TEXT
);
