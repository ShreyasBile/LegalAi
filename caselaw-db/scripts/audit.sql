-- Data-audit queries behind the paper's Section 2 (run 2026-09-25 against the loaded database).
--   docker exec -i caselaw-pg psql -U postgres -d caselaw < scripts/audit.sql
-- "Mobile row" = an HC row loaded from a *-mobile.parquet file. Those carry a bare filename in pdf_link, so the
-- loader gives them source_id = '<bench>/<filename stem>' (slash present); every other row's source_id has no slash.
-- Each statement scans the 19 GB table: expect ~15 s apiece.

\echo === A. Corpus, per court (Table 1): rows, year range, rows without a PDF link
select x.court_code, c.name, count(*) as rows, min(x.year) as y_min, max(x.year) as y_max,
       count(*) filter (where x.pdf_ref = 'unknown') as no_link,
       round(100.0 * count(*) filter (where x.pdf_ref <> 'unknown') / count(*), 2) as pct_linked
from case_laws x join courts c on c.code = x.court_code group by 1, 2 order by 3 desc;

\echo === B. Corpus total and overall link availability
select count(*) as total, count(*) filter (where pdf_ref = 'unknown') as no_link,
       round(100.0 * count(*) filter (where pdf_ref <> 'unknown') / count(*), 3) as pct_linked from case_laws;

\echo === C. Mobile rows per court and how many now resolve to a real PDF (Table 2)
select x.court_code, c.name,
       count(*) filter (where position('/' in x.source_id) > 0)                                 as mobile_rows,
       count(*) filter (where position('/' in x.source_id) > 0 and x.pdf_ref <> 'unknown')      as mobile_with_pdf,
       count(*) filter (where position('/' in x.source_id) > 0 and x.pdf_ref = 'unknown')       as mobile_no_pdf,
       count(*) filter (where position('/' in x.source_id) = 0 and x.pdf_ref = 'unknown')       as nonmobile_no_pdf,
       count(*) as total_rows
from case_laws x left join courts c on c.code = x.court_code
where x.source = 'aws-hc' group by 1, 2
having count(*) filter (where position('/' in x.source_id) > 0) > 0 or count(*) filter (where x.pdf_ref = 'unknown') > 0
order by mobile_rows desc;

\echo === D. Mobile rows by decision year: how many have no PDF anywhere in the archive
select court_code, year, count(*) as mobile_rows, count(*) filter (where pdf_ref = 'unknown') as no_pdf
from case_laws where source = 'aws-hc' and position('/' in source_id) > 0 group by 1, 2 order by 1, 2;

\echo === E. Independent consistency check: year folder of the resolved key vs decision year (expect 0 differing)
select court_code, count(*) as resolved,
       count(*) filter (where substring(pdf_ref from 'year=(\d+)')::int <> year) as folder_year_differs
from case_laws where source = 'aws-hc' and position('/' in source_id) > 0 and pdf_ref <> 'unknown' group by 1 order by 2 desc;

\echo === F. Filename is not an identity: stems that occur in more than one bench of the same court
select count(*) as colliding_stems,
       sum(n_rows) as rows_involved,
       sum(n_rows) - count(*) as min_rows_lost_if_keyed_on_filename,
       count(*) filter (where n_benches > 2) as more_than_two_benches,
       count(*) filter (where n_titles = 1 and n_dates = 1) as same_title_and_date,
       count(*) filter (where n_titles > 1 and n_dates > 1) as different_title_and_date,
       count(*) filter (where (n_titles > 1) <> (n_dates > 1)) as only_one_differs,
       count(*) filter (where n_cnr > 1) as cnr_differs
from (select court_code, split_part(source_id, '/', 2) as stem,
             count(distinct title) as n_titles, count(distinct decision_date) as n_dates, count(distinct cnr) as n_cnr,
             count(distinct split_part(source_id, '/', 1)) as n_benches, count(*) as n_rows
      from case_laws where source = 'aws-hc' and position('/' in source_id) > 0
      group by 1, 2 having count(distinct split_part(source_id, '/', 1)) > 1) t;

\echo === G. Outcome (disposal_nature) vocabulary
select count(distinct disposal_nature) as raw_distinct, count(distinct lower(btrim(disposal_nature))) as case_insens_distinct,
       count(*) filter (where disposal_nature is null) as nulls, count(*) as rows from case_laws;

-- Sampling used for the HEAD checks (paper data/head_sample.txt, data/collision_pairs.txt); then run node head_check.mjs.
-- Recovered-link sample:   150 random rows per court (27~1, 9~13) with position('/' in source_id) > 0 and pdf_ref <> 'unknown'
-- Unresolved sample:       150 random rows per court (27~1, 9~13, 23~23) with pdf_ref = 'unknown'
-- Collision-pair sample:   60 stems (md5-ordered) present in exactly 2 benches with both PDFs published
