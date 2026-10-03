"""
Point the "mobile" High-Court rows at the PDF that actually exists in the bucket.

repair_mobile_rows.py could only *guess* a PDF path for rows from *-mobile.parquet files
(bare filename, bench taken from the metadata key, year from the metadata partition). A
check against the bucket showed the guess is right only ~2/3 of the time: some PDFs live
under a different year folder, and many `orders_*.pdf` files were never published at all.

This lists the real `orders_*` keys in the bucket, then for every mobile row (source_id
"<bench>/<stem>") sets pdf_ref to the real key, or 'unknown' when the archive has no such
file — so the UI only offers links that work. Idempotent.

    python resolve_mobile_pdfs.py
"""
import re, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import psycopg2
import load_metadata as L

COURTS = ["27_1", "9_13", "23_23", "2_5"]          # court code with '~' -> '_' (the S3 spelling)
YEARS = range(2005, 2028)
BASE = f"https://{L.HC_BUCKET}.s3.ap-south-1.amazonaws.com/"


def list_xml(prefix, delimiter=None, token=None):
    u = f"{BASE}?list-type=2&max-keys=1000&prefix={urllib.parse.quote(prefix)}"
    if delimiter: u += f"&delimiter={delimiter}"
    if token: u += f"&continuation-token={urllib.parse.quote(token)}"
    for attempt in range(4):
        try:
            return urllib.request.urlopen(u, timeout=60).read().decode()
        except Exception:
            time.sleep(1 + attempt)
    raise RuntimeError(f"listing failed: {prefix}")


def benches(court, year):
    x = list_xml(f"data/pdf/year={year}/court={court}/", delimiter="/")
    return re.findall(r"<Prefix>data/pdf/year=\d+/court=[^/]+/bench=([^/]+)/</Prefix>", x)


def orders_keys(court, year, bench):
    out, token = [], None
    while True:
        x = list_xml(f"data/pdf/year={year}/court={court}/bench={bench}/orders_", token=token)
        out += re.findall(r"<Key>([^<]+\.pdf)</Key>", x)
        m = re.search(r"<NextContinuationToken>([^<]+)", x)
        if not m: return out
        token = m.group(1)


def main():
    t0 = time.time()
    tasks = []
    with ThreadPoolExecutor(12) as ex:
        futs = {(c, y): ex.submit(benches, c, y) for c in COURTS for y in YEARS}
        for (c, y), f in futs.items():
            tasks += [(c, y, b) for b in f.result()]
    print(f"{len(tasks)} (court, year, bench) folders to list  [{time.time()-t0:.0f}s]", flush=True)

    found = {}                                        # (court_code, "<bench>/<stem>") -> real key
    with ThreadPoolExecutor(12) as ex:
        for (c, y, b), keys in zip(tasks, ex.map(lambda t: orders_keys(*t), tasks)):
            code = c.replace("_", "~")
            for k in keys:
                stem = k.rsplit("/", 1)[-1][:-4]
                found.setdefault((code, f"{b}/{stem}"), k)
    print(f"{len(found)} real orders_* PDFs in the bucket  [{time.time()-t0:.0f}s]", flush=True)

    conn = psycopg2.connect(L.DSN); cur = conn.cursor()
    cur.execute("create temp table pdf_map (court_code text, source_id text, ref text) on commit drop")
    from io import StringIO
    buf = StringIO()
    for (code, sid), ref in found.items():
        buf.write(f"{code}\t{sid}\t{ref}\n")
    buf.seek(0)
    cur.copy_expert("copy pdf_map from stdin", buf)
    cur.execute("create index on pdf_map (court_code, source_id)")
    cur.execute("analyze pdf_map")

    cur.execute("""
        update case_laws cl set pdf_ref = coalesce(m.ref, 'unknown')
          from case_laws x left join pdf_map m on m.court_code = x.court_code and m.source_id = x.source_id
         where x.id = cl.id and x.source = 'aws-hc' and position('/' in x.source_id) > 0
           and x.court_code = any(%s)
           and x.pdf_ref is distinct from coalesce(m.ref, 'unknown')""",
        ([c.replace("_", "~") for c in COURTS],))
    print(f"rows re-pointed: {cur.rowcount}  [{time.time()-t0:.0f}s]", flush=True)
    conn.commit()

    cur.execute("""select court_code, count(*) filter (where pdf_ref <> 'unknown'), count(*)
                     from case_laws where source='aws-hc' and position('/' in source_id) > 0 group by 1 order by 3 desc""")
    for code, ok, n in cur.fetchall():
        print(f"  {code}: {ok}/{n} mobile rows now have a real PDF ({100*ok/n:.0f}%)", flush=True)
    conn.commit(); conn.autocommit = True
    cur.execute("vacuum analyze case_laws")
    print("RESOLVE DONE", flush=True)


if __name__ == "__main__":
    main()
