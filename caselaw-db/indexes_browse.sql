-- Browse/sort indexes added after measuring the first API queries on 19M rows.
-- Without them: "newest first" = full sort of the table (~10 s); neutral-citation lookup = full scan (~7 s).
create index if not exists cl_neutral      on case_laws (neutral_citation) where neutral_citation is not null;
create index if not exists cl_newest       on case_laws (decision_date desc nulls last, id desc);
create index if not exists cl_oldest       on case_laws (decision_date asc  nulls last, id asc);
create index if not exists cl_court_newest on case_laws (court_code, decision_date desc nulls last, id desc);
drop index if exists cl_decision;     -- superseded by cl_newest / cl_oldest
analyze case_laws;

-- year-filtered browsing: "Bombay, 2019-2021, newest first" must not wade through 2022-2026 first.
-- With a year filter the API orders by (year, date), which these two indexes serve directly
-- (scanned backwards they also serve "oldest first").
create index if not exists cl_court_year_date on case_laws (court_code, year desc, decision_date desc nulls last, id desc);
create index if not exists cl_year_date       on case_laws (year desc, decision_date desc nulls last, id desc);
drop index if exists cl_court_year;          -- superseded: it is a prefix of cl_court_year_date
analyze case_laws;
