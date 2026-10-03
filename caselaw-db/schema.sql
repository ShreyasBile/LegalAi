-- Case-law metadata + keyword search (phase 1).
-- Plain PostgreSQL: full-text search (tsvector/GIN) + trigram fuzzy name match.
-- No pgvector yet — the chunk/embedding tables come in the topic-search phase.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() is only STABLE; wrap it as IMMUTABLE so it can be used in a
-- generated column / index (standard documented pattern).
create or replace function f_unaccent(text) returns text
  language sql immutable strict parallel safe
  as $$ select public.unaccent('public.unaccent', $1) $$;

-- ── court lookup: repeated names/types stored once ──────────────────────────
create table if not exists courts (
  code       text primary key,          -- 'SC' or High Court code e.g. '27~1'
  name       text not null,             -- 'Supreme Court of India', 'High Court of Sikkim'
  kind       text not null              -- 'supreme' | 'high'
);

-- ── the metadata row per judgment ───────────────────────────────────────────
create table if not exists case_laws (
  id                bigint generated always as identity primary key,

  -- identity (safe re-runs of the loader)
  source            text not null,            -- 'aws-sc' | 'aws-hc'
  source_id         text not null,            -- SC: cnr.  HC: {cnr}_{order}_{date}
  court_code        text not null references courts(code),

  -- when
  year              int  not null,
  decision_date     date,
  registration_date date,                     -- HC only

  -- identity/citation
  cnr               text,
  order_number      text,                     -- HC, parsed from filename
  case_number       text,                     -- parsed from HC title, best effort
  citation          text,                     -- reporter cite  [2021] 6 S.C.R. 527
  neutral_citation  text,                     -- 2021 INSC 306  (SC 'case_id')

  -- parties / bench
  title             text,
  petitioner        text,                     -- SC direct; HC null (inside title)
  respondent        text,
  judges            text,                     -- raw judge string
  author_judge      text,

  -- classification / preview
  disposal_nature   text,
  case_type         text,                     -- parsed: 'WP(C)', 'Crl.A.', 'MAC App.' ...
  languages         text[],
  snippet           text,                     -- HC opening-text preview, capped

  -- linking (never store the PDF itself)
  pdf_ref           text not null,            -- S3 key under the public AWS bucket

  -- provenance
  licence           text not null default 'CC-BY-4.0',
  scraped_at        timestamptz,
  ingested_at       timestamptz not null default now(),
  text_status       text not null default 'metadata_only',  -- future: extracted | ocr_needed | failed

  -- generated search document (weighted: title/parties highest)
  search tsvector generated always as (
    setweight(to_tsvector('simple', f_unaccent(coalesce(title,''))), 'A') ||
    setweight(to_tsvector('simple', f_unaccent(coalesce(petitioner,'') || ' ' || coalesce(respondent,''))), 'A') ||
    setweight(to_tsvector('simple', f_unaccent(coalesce(citation,'') || ' ' || coalesce(neutral_citation,'') || ' ' || coalesce(cnr,''))), 'B') ||
    setweight(to_tsvector('simple', f_unaccent(coalesce(judges,''))), 'C') ||
    setweight(to_tsvector('simple', f_unaccent(coalesce(snippet,''))), 'D')
  ) stored,

  unique (source, source_id)
);

-- ── indexes for the three ways lawyers search ───────────────────────────────
create index if not exists cl_search      on case_laws using gin (search);                 -- keyword (incl. party names, weight A)
create index if not exists cl_title_trgm  on case_laws using gin (title gin_trgm_ops);      -- fuzzy / typo-tolerant title
-- (party fuzzy-name index dropped to save ~15%: party *keyword* search still works via `search`)
create index if not exists cl_cnr          on case_laws (cnr);
create index if not exists cl_citation     on case_laws (citation);
create index if not exists cl_case_type    on case_laws (case_type);
-- browsing / filtering (each one exists because a measured query needed it — see indexes_browse.sql):
--   cl_newest, cl_oldest, cl_court_newest, cl_neutral, cl_court_year_date, cl_year_date
-- On a fresh database run indexes_browse.sql after the load; on a live one it is safe to re-run.

-- ── one row per loader run, for auditing "updated as new ones come" ─────────
create table if not exists ingest_runs (
  id          bigint generated always as identity primary key,
  source      text not null,
  scope       text,                    -- e.g. 'aws-sc year=2021' or 'aws-hc court=11~24'
  rows_added  int,
  rows_updated int,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
);
