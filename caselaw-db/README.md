# caselaw-db

Metadata + keyword search over Indian court judgments — Supreme Court and all 25 High Courts
(~19.25M judgments and orders). **No judgment text and no PDFs are stored**: each row is a catalogue
record with a link to the original PDF in the public AWS Open Data buckets
(`indian-supreme-court-judgments`, `indian-high-court-judgments`, CC-BY-4.0).

```
AWS metadata parquet ──load_metadata.py──▶ Postgres 17 (Docker, data on D:) ◀──api/server.js──▶ LegalAI "Case law" page
```

## Run

| What | Command |
| --- | --- |
| Database | Docker container `caselaw-pg` (port **5433**, restarts with Docker Desktop). DSN `postgresql://postgres@localhost:5433/caselaw`; the password is **not** in the code: set the `PGPASSWORD` environment variable (or `CASELAW_DB` / `CASELAW_DSN` for a full DSN) |
| API (port **8090**) | `npm install` once, then `npm start` |
| Unit tests (no DB needed) | `npm test` |
| Live end-to-end checks | `npm start` in one terminal, `npm run smoke` in another |

## Files

- `schema.sql` — tables + text-search indexes. `indexes_browse.sql` — the browse/filter indexes (re-runnable).
- `load_metadata.py` — `sc`, `hc <code> <name>`, `all-hc`. Reads parquet straight from S3 with column projection
  (the huge `raw_html` column is never downloaded). Resumable.
- `repair_mobile_rows.py` — fixes rows from the `*-mobile.parquet` files (bare filename, no bench → no PDF link,
  and cross-bench id collisions). Idempotent.
- `resolve_mobile_pdfs.py` — run after the repair: lists the PDFs that really exist in the bucket and points each
  mobile row at its real file (or `unknown` if the archive never published it — e.g. most Madhya Pradesh 2024 orders).
- `api/lib.js` — pure logic (param clamping, SQL building, order grouping); `api/server.js` — HTTP + Postgres.

## API

- `GET /api/caselaw/search?q=&court=&yearFrom=&yearTo=&caseType=&outcome=&sort=relevance|newest|oldest&page=&pageSize=`
  Exact fast paths for CNR, neutral citation (`2021 INSC 306`) and reporter citation (`[2021] 6 S.C.R. 527`).
  Counts are capped at 10,000 (`totalCapped`); best-match ranks the newest 5,000 hits (`rankedAmong`);
  one-word typos fall back to trigram matching (`fuzzy`).
- `GET /api/caselaw/case?court=&cnr=` — every order in one High Court case.
- `GET /api/caselaw/facets` — court / case-type / outcome / year options (computed once, cached in table `facets`).
- `GET /health`.

## Known data caveats

- HC party names exist only inside the title (`CASE/NO/YEAR of A Vs B`); case type is parsed from it.
- One HC case = many rows (one per order); the API groups them into one card.
- The source's `pdf_exists` flag is unreliable, so links are built from the path and spot-checked with HEAD requests.
- A handful of rows carried impossible (future) decision dates in the source data; they were set to NULL.
- ~169K High Court rows (mostly Madhya Pradesh 2024 "mobile" orders, ~16% of Bombay's) have no PDF in the archive; the UI shows "PDF link unavailable" for them.
