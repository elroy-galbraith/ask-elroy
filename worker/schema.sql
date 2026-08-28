CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  question     TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  country      TEXT,
  ua           TEXT,
  session_id   TEXT,
  visitor_name TEXT,
  visitor_co   TEXT,
  response     TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 0
);

-- Migration for the already-deployed database (a fresh install already has the
-- column from the CREATE TABLE above). Run this once, manually, against the
-- existing remote table:
--   wrangler d1 execute ask-elroy-log --command "ALTER TABLE questions ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0"
