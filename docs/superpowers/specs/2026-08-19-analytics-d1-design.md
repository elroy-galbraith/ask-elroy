# Analytics: log questions and visitor context to Cloudflare D1

**Issue:** #5  
**Date:** 2026-08-19  
**Status:** approved, ready for implementation

## Goal

Log every question (answered, refused, or errored) to a Cloudflare D1 database so the corpus can be kept useful by inspecting what recruiters ask — especially refused questions that reveal gaps.

## Schema

File: `worker/schema.sql`

```sql
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
```

`visitor_name` and `visitor_co` are in the schema now but will always be `null` until issue #6 (visitor identity prompt) is implemented.

## Infrastructure

- `wrangler.toml`: add `[[d1_databases]]` binding with `binding = "DB"`, `database_name = "ask-elroy-log"`, and a placeholder `database_id` to fill in after running `wrangler d1 create ask-elroy-log`.
- Manual one-time steps (not automated):
  ```bash
  wrangler d1 create ask-elroy-log   # prints database_id — paste into wrangler.toml
  wrangler d1 execute ask-elroy-log --file worker/schema.sql  # create the table
  wrangler secret put ADMIN_TOKEN    # random secret for the /admin route
  wrangler deploy
  ```

## Worker changes (`worker/worker.js`)

URL-based routing replaces the single-route handler:

### `POST /` — generation (existing, extended)
- Accept `session_id`, `visitor_name`, `visitor_co` from request body (all optional).
- Add `ctx` as third parameter to `fetch()` handler.
- After streaming the response back, call `ctx.waitUntil(logRow(...))` to INSERT an `answered` row into D1. Fire-and-forget — no latency impact on the stream.
- `country` sourced from `cf-ipcountry` header; `ua` from `user-agent` header.

### `POST /log` — client-side outcome logging (new)
- No auth required.
- Accepts `{ question, outcome, session_id }`. Validates `outcome` is `"refused"` or `"error"`.
- INSERTs a row; returns `{ ok: true }`.

### `GET /admin` — recent rows dump (new)
- Requires `Authorization: Bearer <ADMIN_TOKEN>` header.
- Returns last 100 rows as JSON (`SELECT ... ORDER BY ts DESC LIMIT 100`).
- Returns 401 if token missing or wrong.

### CORS
- Updated to allow `GET`, `POST`, `OPTIONS` and the `authorization` header.

## Client changes

### `src/engine.js`
- Add `sessionId: crypto.randomUUID()` to the `state` object at declaration time.
- `generate()` adds `session_id: state.sessionId` (and `visitor_name: null`, `visitor_co: null`) to every POST body.

### `src/ui.js`
- After the `r.conf < gate()` refusal branch: fire-and-forget POST to `CONFIG.generatorUrl + "/log"` with `{ question, outcome: "refused", session_id: state.sessionId }`.
- After the `catch(err)` generation-error block: same POST with `outcome: "error"`.
- Neither call is awaited — logging never blocks or breaks the UI.

## Key query

```sql
SELECT question, COUNT(*) as n
FROM questions
WHERE outcome = 'refused'
GROUP BY question
ORDER BY n DESC
LIMIT 20;
```

Run via:
```bash
wrangler d1 execute ask-elroy-log --command "SELECT question, COUNT(*) as n FROM questions WHERE outcome = 'refused' GROUP BY question ORDER BY n DESC LIMIT 20"
```

Or hit `GET /admin` for a raw JSON dump of the last 100 rows.

## Files touched

| File | Change |
|---|---|
| `worker/schema.sql` | new — D1 table definition |
| `worker/wrangler.toml` | add `[[d1_databases]]` binding |
| `worker/worker.js` | routing, D1 insert, `/log` route, `/admin` route |
| `src/engine.js` | `sessionId` in state, pass to `generate()` body |
| `src/ui.js` | fire-and-forget POST to `/log` on refusal and error |
| `index.html` | rebuilt from `./build.sh` — not edited directly |

## Out of scope

- `visitor_name` / `visitor_co` client-side population (issue #6)
- Pagination on `/admin`
- Any analytics dashboard beyond raw JSON / wrangler CLI
