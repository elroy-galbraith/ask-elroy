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
-- existing remote table — before deploying the worker code that expects this
-- column, since its INSERT would otherwise fail on every row (silently;
-- logRow() swallows DB errors):
--   wrangler d1 execute ask-elroy-log --command "ALTER TABLE questions ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0"

-- Reconciled fit panels, keyed on exact input (issue #30). A byte-identical job
-- description must return the identical panel and must not bill for the rubric and
-- two scoring calls again.
--
-- key = sha256("v1" \0 normalize(jd_text) \0 model \0 corpus_sha \0 sha256(passage block)),
-- so a model change, a corpus edit, or a different passage set all miss rather than
-- serve a scorecard whose citations no longer match. See fitCacheKey() in worker.js.
--
-- Nothing here is load-bearing: readFitCache()/writeFitCache() swallow their errors,
-- so a missing table only means every submission scores live. Safe to create before
-- or after the deploy, unlike the questions.is_synthetic migration above.
CREATE TABLE IF NOT EXISTS fit_cache (
  key        TEXT PRIMARY KEY,
  ts         TEXT NOT NULL,
  model      TEXT NOT NULL,
  corpus_sha TEXT NOT NULL,
  panel      TEXT NOT NULL
);

-- Entries are never served after a model or corpus change — the key stops matching —
-- but they do linger. Drop the orphans when the corpus moves:
--   wrangler d1 execute ask-elroy-log --command "DELETE FROM fit_cache WHERE corpus_sha != '<current VECTORS.corpusSha256>'"
