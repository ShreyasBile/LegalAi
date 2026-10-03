"""
Repair for High-Court rows that came from the *-mobile parquet files.

Those files hold a bare filename in `pdf_link` (e.g. `orders_2023_200100000582024_8.pdf`,
no bench folder). The first load therefore stored them with pdf_ref='unknown' (no PDF
link) and — because source_id was just the filename — the same filename in two benches
collided and one row silently replaced the other.

This script re-reads those files, takes the bench + year from the S3 *key* (which is
authoritative for where the PDF lives), and re-inserts the rows with:
    source_id = "<bench>/<filename stem>"        (unique per bench)
    pdf_ref   = data/pdf/year=<Y>/court=<C>/bench=<B>/<filename>
Then removes the superseded 'unknown' rows. Idempotent — safe to re-run.

    python repair_mobile_rows.py            # every court that has 'unknown' rows
    python repair_mobile_rows.py 27~1       # one court
"""
import re, sys, time
import psycopg2
from psycopg2.extras import execute_values
import load_metadata as L

PDF_REF, SOURCE_ID, ORDER = 20, 1, 7        # positions in the INSERT_COLS tuple


def fix_rows(rows, court_u, bench, year):
    out = []
    for r in rows:
        if r[PDF_REF] != "unknown":
            continue                         # normal rows in this file were loaded correctly
        stem = r[SOURCE_ID]
        fname = stem + ".pdf"
        r = list(r)
        r[SOURCE_ID] = f"{bench}/{stem}"
        r[PDF_REF] = f"data/pdf/year={year}/court={court_u}/bench={bench}/{fname}"
        m = re.search(r"_(\d+)$", stem)
        r[ORDER] = m.group(1) if m else r[ORDER]
        out.append(tuple(r))
    return out


def repair_court(cur, conn, code):
    cu = code.replace("~", "_")
    t0 = time.time(); inserted = 0
    for year in range(2005, 2028):
        keys = L.s3_list(L.HC_BUCKET, f"metadata/parquet/year={year}/court={cu}/")
        for k in keys:
            bench = re.search(r"bench=([^/]+)/", k)
            if not bench:
                continue
            table = L.read_parquet(L.HC_BUCKET, k, L.HC_READ)
            rows = fix_rows(L.build_hc(table, code), cu, bench.group(1), year)
            rows = L.dedup_batch(rows)
            for j in range(0, len(rows), 5000):
                execute_values(cur, L.UPSERT, rows[j:j + 5000], page_size=5000)
            inserted += len(rows)
            conn.commit()
        print(f"  {code} year {year}: {inserted} rows so far ({time.time()-t0:.0f}s)", flush=True)
    return inserted


def main():
    conn = psycopg2.connect(L.DSN); conn.autocommit = False
    cur = conn.cursor()
    if len(sys.argv) > 1:
        courts = [sys.argv[1]]
    else:
        cur.execute("select court_code from case_laws where source='aws-hc' and pdf_ref='unknown' "
                    "group by 1 order by count(*) desc")
        courts = [r[0] for r in cur.fetchall()]
    print("courts to repair:", courts, flush=True)
    for code in courts:
        cur.execute("select count(*) from case_laws where source='aws-hc' and court_code=%s and pdf_ref='unknown'", (code,))
        before = cur.fetchone()[0]
        n = repair_court(cur, conn, code)
        # drop the superseded rows (old id had no bench prefix, no PDF link)
        cur.execute("delete from case_laws where source='aws-hc' and court_code=%s and pdf_ref='unknown' "
                    "and position('/' in source_id)=0", (code,))
        removed = cur.rowcount; conn.commit()
        cur.execute("select count(*) from case_laws where source='aws-hc' and court_code=%s and pdf_ref='unknown'", (code,))
        left = cur.fetchone()[0]
        print(f"[{code}] re-inserted {n}; removed {removed} old rows; 'unknown' before={before} after={left}", flush=True)
    conn.commit(); conn.autocommit = True
    cur.execute("vacuum analyze case_laws")
    print("REPAIR DONE", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
