"""Corpus facts for the paper, computed from the live database and the saved link checks -> data/corpus_stats.json.
Every number in the paper's corpus section comes from this file (via make_tex.py); none is typed by hand."""
import json, sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "data"
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex, DSN


def q(cur, sql):
    cur.execute(sql)
    return cur.fetchall()


def main():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    s = {}
    (s["total"], s["sc"], s["hc"], s["no_link"], s["courts"], s["year_min"], s["year_max"]) = q(cur, """
        select count(*), count(*) filter (where source='aws-sc'), count(*) filter (where source='aws-hc'),
               count(*) filter (where pdf_ref='unknown'), count(distinct court_code),
               min(extract(year from decision_date))::int, max(extract(year from decision_date))::int from case_laws""")[0]
    per = q(cur, """
        select court_code,
               count(*) filter (where position('/' in source_id) > 0),
               count(*) filter (where position('/' in source_id) > 0 and pdf_ref <> 'unknown'),
               count(*) filter (where position('/' in source_id) = 0 and pdf_ref = 'unknown'),
               count(*)
          from case_laws where source='aws-hc' group by 1
        having count(*) filter (where position('/' in source_id) > 0) > 0""")
    s["mobile_by_court"] = {c: {"mobile": m, "linked": l, "nonmobile_unlinked": u, "court_rows": n} for c, m, l, u, n in per}
    s["mobile_total"] = sum(v["mobile"] for v in s["mobile_by_court"].values())
    s["mobile_linked"] = sum(v["linked"] for v in s["mobile_by_court"].values())
    s["mobile_recent"] = q(cur, """select count(*) from case_laws where source='aws-hc' and position('/' in source_id) > 0
                                     and extract(year from decision_date) between 2024 and 2026""")[0][0]
    (s["collide_stems"], s["collide_rows"], s["collide_gt2"], s["collide_same"], s["collide_diff_both"], s["collide_cnr_diff"]) = q(cur, """
        select count(*), sum(n_rows), count(*) filter (where n_b > 2), count(*) filter (where n_t = 1 and n_d = 1),
               count(*) filter (where n_t > 1 and n_d > 1), count(*) filter (where n_c > 1)
          from (select court_code, split_part(source_id,'/',2) stem, count(*) n_rows, count(distinct split_part(source_id,'/',1)) n_b,
                       count(distinct title) n_t, count(distinct decision_date) n_d, count(distinct cnr) n_c
                  from case_laws where source='aws-hc' and position('/' in source_id) > 0 group by 1, 2
                having count(distinct split_part(source_id,'/',1)) > 1) t""")[0]
    (s["sc_with_scr"], s["sc_with_neutral"], s["sc_supp"], s["sc_year_ne"]) = q(cur, """
        select count(*) filter (where citation is not null), count(*) filter (where neutral_citation is not null),
               count(*) filter (where citation ~ '^\\[\\d{4}\\] SUPP\\.'),
               count(*) filter (where year <> extract(year from decision_date)) from case_laws where source='aws-sc'""")[0]
    conn.close()

    ix = SCIndex()
    dup = [k for k, v in ix.by_neutral.items() if len(v) > 1]
    s["sc_neutral_dup_groups"] = len(dup)
    s["sc_neutral_dup_rows"] = sum(len(ix.by_neutral[k]) for k in dup)
    complete = sorted(y for y in ix.insc_max if ix.insc_complete(y))
    s["insc_complete_years"] = complete
    s["insc_incomplete_years"] = sorted(y for y in ix.insc_max if not ix.insc_complete(y))
    s["insc_coverage_2014_2026"] = {y: round(ix.insc_count[y] / ix.insc_max[y], 3) for y in range(2014, 2027) if y in ix.insc_max}

    hc = json.loads((DATA / "head_check_result.json").read_text())
    s["head_recovered"] = {k: v for k, v in hc["tally"].items() if k.startswith("resolved")}
    s["head_unresolved"] = {k: v for k, v in hc["tally"].items() if k.startswith("unresolved")}
    s["collision_pairs"] = hc["pairRes"]
    nm = json.loads((DATA / "link_check_hc_nonmobile_result.json").read_text())
    s["nonmobile_checked"] = len(nm)
    s["nonmobile_ok"] = sum(1 for r in nm if r["status"] == 200)
    s["nonmobile_courts"] = len({r["court"] for r in nm})
    scl = json.loads((DATA / "link_check_sc_result.json").read_text())
    s["sc_links_checked"] = len(scl)
    s["sc_links_ok"] = sum(1 for r in scl if r["status"] == 200)

    (DATA / "corpus_stats.json").write_text(json.dumps(s, indent=1, default=int), encoding="utf-8")
    print(json.dumps({k: v for k, v in s.items() if k not in ("insc_complete_years",)}, indent=1, default=int))


if __name__ == "__main__":
    main()
