"""
Case-law metadata loader (phase 1: metadata + keyword search).

Reads the public AWS metadata parquet files (NO PDFs) for the Supreme Court and
selected High Courts, parses the fields we verified against the real data, and
upserts them into the `case_laws` table. Safe to re-run: rows key on
(source, source_id) and ON CONFLICT DO UPDATE.

Usage:
    python load_metadata.py sc                 # Supreme Court, all years
    python load_metadata.py hc 11~24 "High Court of Sikkim"   # one High Court
"""
import os, sys, io, re, urllib.request, urllib.parse, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import pyarrow.parquet as pq
import pyarrow.fs as pfs
import psycopg2
from psycopg2.extras import execute_values

# read parquet directly from S3 with HTTP range requests so column projection
# fetches ONLY the columns we use — the huge raw_html column is never downloaded
# (this is what makes the largest courts, e.g. Allahabad's 190 MB / 467k-row
# files, load in seconds instead of hanging).
_S3 = pfs.S3FileSystem(anonymous=True, region="ap-south-1")

# No password in the source: set PGPASSWORD (or ~/.pgpass), or override the whole DSN with CASELAW_DSN.
DSN = os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")
SC_BUCKET = "indian-supreme-court-judgments"
HC_BUCKET = "indian-high-court-judgments"

# ── S3 helpers (public buckets, read-only) ──────────────────────────────────
def s3_list(bucket, prefix):
    keys, token = [], ""
    while True:
        u = (f"https://{bucket}.s3.ap-south-1.amazonaws.com/?list-type=2"
             f"&prefix={urllib.parse.quote(prefix)}&max-keys=1000"
             + (f"&continuation-token={urllib.parse.quote(token)}" if token else ""))
        xml = urllib.request.urlopen(u, timeout=60).read().decode()
        keys += re.findall(r"<Key>([^<]+\.parquet)</Key>", xml)
        m = re.search(r"<NextContinuationToken>([^<]+)", xml)
        if not m:
            break
        token = m.group(1)
    return keys

def s3_get(bucket, key):
    u = f"https://{bucket}.s3.ap-south-1.amazonaws.com/" + urllib.parse.quote(key)
    return urllib.request.urlopen(u, timeout=120).read()

# only the columns we actually use — projecting at read time means the giant
# raw_html column is never decoded (it's ~70% of the largest courts' files).
HC_READ = ["court_code","title","judge","pdf_link","cnr","date_of_registration",
           "decision_date","disposal_nature","court","description"]

def read_parquet(bucket, key, columns=None):
    with _S3.open_input_file(f"{bucket}/{key}") as f:
        pf = pq.ParquetFile(f)
        if columns:
            have = set(pf.schema_arrow.names)
            columns = [c for c in columns if c in have]
        return pf.read(columns=columns)

def cols(table):
    """Return {name: python list} for the columns we use. Skips the huge
    raw_html column — materializing it via to_pylist() blows up memory on the
    largest courts (Allahabad/Bombay have 100-190 MB files)."""
    SKIP = {"raw_html", "pdf_exists", "nc_display"}
    return {n: table.column(n).to_pylist() for n in table.schema.names if n not in SKIP}

# ── field parsing ───────────────────────────────────────────────────────────
def clean(s, cap=None):
    if s is None:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    if not s:
        return None
    return s[:cap].rsplit(" ", 1)[0] + "…" if (cap and len(s) > cap) else s

def to_date(v):
    if v is None:
        return None
    if isinstance(v, (dt.datetime, dt.date)):
        return v.date() if isinstance(v, dt.datetime) else v
    m = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", str(v).strip())
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return dt.date(y, mo, d)
        except ValueError:
            return None
    return None

VS = re.compile(r"\s+[Vv][Ss]?\.?\s+")

def split_parties(text):
    if not text:
        return None, None
    parts = VS.split(text, maxsplit=1)
    if len(parts) == 2:
        return clean(parts[0]), clean(parts[1])
    return None, None

# ── build rows ──────────────────────────────────────────────────────────────
INSERT_COLS = ["source","source_id","court_code","year","decision_date","registration_date",
    "cnr","order_number","case_number","citation","neutral_citation","title","petitioner",
    "respondent","judges","author_judge","disposal_nature","case_type","languages","snippet",
    "pdf_ref","scraped_at"]

def build_sc(table):
    c = cols(table)
    n = table.num_rows
    none = [None] * n                      # created ONCE (not per-access — that was O(n^2))
    g = lambda k: c.get(k, none)
    rows = []
    for i in range(n):
        cnr = clean(g("cnr")[i])
        if not cnr:
            continue
        dd = to_date(g("decision_date")[i])
        year = int(g("year")[i]) if g("year")[i] else (dd.year if dd else None)
        path = clean(g("path")[i])
        langs = [x.strip() for x in str(g("available_languages")[i] or "").split(",") if x.strip()] or None
        rows.append(("aws-sc", cnr, "SC", year, dd, None,
            cnr, None, None, clean(g("citation")[i]), clean(g("case_id")[i]),
            clean(g("title")[i]), clean(g("petitioner")[i]), clean(g("respondent")[i]),
            clean(g("judge")[i]), clean(g("author_judge")[i]), clean(g("disposal_nature")[i]),
            None, langs, None,
            f"data/pdf/year={year}/english/{path}_EN.pdf" if path and year else "unknown",
            clean(g("scraped_at")[i])))
    return rows

def build_hc(table, court_code):
    c = cols(table)
    n = table.num_rows
    none = [None] * n                      # created ONCE (not per-access — that was O(n^2))
    g = lambda k: c.get(k, none)
    court_u = court_code.replace("~", "_")
    rows = []
    for i in range(n):
        pdf_link = clean(g("pdf_link")[i]) or ""
        fname = pdf_link.rsplit("/", 1)[-1]
        stem = fname[:-4] if fname.lower().endswith(".pdf") else fname
        if not stem:
            continue
        seg = pdf_link.split("/")
        bench = seg[2] if len(seg) >= 4 else None          # court/cnrorders/<bench>/orders/<file>
        order = None
        mo = re.search(r"_(\d+)_\d{4}-\d{2}-\d{2}$", stem)  # {cnr}_{order}_{date}
        if mo:
            order = mo.group(1)
        title = clean(g("title")[i])
        case_number = case_type = petitioner = respondent = None
        if title and " of " in title:
            left, right = title.split(" of ", 1)
            case_number = clean(left)
            case_type = clean(left.split("/")[0]) if "/" in left else clean(left)
            petitioner, respondent = split_parties(right)
        dd = to_date(g("decision_date")[i])
        year = dd.year if dd else None
        pdf_ref = (f"data/pdf/year={year}/court={court_u}/bench={bench}/{fname}"
                   if year and bench and fname else "unknown")
        rows.append(("aws-hc", stem, court_code, year, dd, to_date(g("date_of_registration")[i]),
            clean(g("cnr")[i]), order, case_number, None, None,
            title, petitioner, respondent, clean(g("judge")[i]), None,
            clean(g("disposal_nature")[i]), case_type, None, clean(g("description")[i], 150),
            pdf_ref, None))
    return rows

# ── DB ──────────────────────────────────────────────────────────────────────
UPSERT = f"""
insert into case_laws ({",".join(INSERT_COLS)}) values %s
on conflict (source, source_id) do update set
  {", ".join(f"{col}=excluded.{col}" for col in INSERT_COLS if col not in ("source","source_id"))}
"""

def load(source, court_code=None, court_name=None):
    conn = psycopg2.connect(DSN); conn.autocommit = False
    cur = conn.cursor()
    if source == "sc":
        cur.execute("insert into courts(code,name,kind) values('SC','Supreme Court of India','supreme') on conflict do nothing")
        prefix, bucket, scope = "metadata/parquet/", SC_BUCKET, "aws-sc all years"
    else:
        cur.execute("insert into courts(code,name,kind) values(%s,%s,'high') on conflict do nothing", (court_code, court_name))
        prefix, bucket, scope = f"metadata/parquet/year=", HC_BUCKET, f"aws-hc court={court_code}"
    conn.commit()

    cur.execute("insert into ingest_runs(source,scope) values(%s,%s) returning id",
                (f"aws-{'sc' if source=='sc' else 'hc'}", scope))
    run_id = cur.fetchone()[0]; conn.commit()

    keys = s3_list(bucket, "metadata/parquet/")
    if source == "hc":
        keys = [k for k in keys if f"court={court_code.replace('~','_')}/" in k]
    print(f"[{scope}] {len(keys)} metadata files")

    def fetch(k):
        t = read_parquet(bucket, k)
        return build_sc(t) if source == "sc" else build_hc(t, court_code)

    total = 0
    before = row_count(cur)
    with ThreadPoolExecutor(8) as ex:
        for batch_rows in ex.map(fetch, keys):
            for j in range(0, len(batch_rows), 5000):
                execute_values(cur, UPSERT, batch_rows[j:j+5000], page_size=5000)
            total += len(batch_rows)
        conn.commit()
    after = row_count(cur)
    cur.execute("update ingest_runs set rows_added=%s, finished_at=now(), status='done' where id=%s",
                (after - before, run_id))
    conn.commit()
    print(f"[{scope}] parsed {total} rows | table grew by {after-before}")
    conn.close()

def row_count(cur):
    cur.execute("select count(*) from case_laws"); return cur.fetchone()[0]

HEAVY_INDEXES = {
    "cl_search":     "create index cl_search on case_laws using gin (search)",
    "cl_title_trgm": "create index cl_title_trgm on case_laws using gin (title gin_trgm_ops)",
}

def dedup_batch(rows):
    """Collapse duplicate (source, source_id) within one batch — Postgres forbids
    ON CONFLICT touching a row twice in a single command. Keep the last."""
    seen = {}
    for r in rows:
        seen[(r[0], r[1])] = r
    return list(seen.values())

def load_all_hc(workers=4):
    """Load every High Court. Bulk pattern: drop the heavy GIN indexes, insert all
    rows (dedup'd per batch), then rebuild the indexes once at the end — far faster
    than maintaining GIN on every insert. Skips courts already loaded, so re-runs
    resume cleanly."""
    import time
    conn = psycopg2.connect(DSN); conn.autocommit = False
    cur = conn.cursor()

    # which courts are already loaded (committed) — skip them on re-run
    cur.execute("select court_code from case_laws where source='aws-hc' group by 1")
    done_courts = {r[0] for r in cur.fetchall()}

    # drop heavy indexes for the bulk phase
    for name in HEAVY_INDEXES:
        cur.execute(f"drop index if exists {name}")
    conn.commit()
    print(f"dropped heavy indexes for bulk load; {len(done_courts)} HC courts already present (will skip)", flush=True)

    keys = s3_list(HC_BUCKET, "metadata/parquet/")
    groups = {}
    for k in keys:
        m = re.search(r"court=([^/]+)/", k)
        if m:
            groups.setdefault(m.group(1), []).append(k)
    print(f"discovered {len(groups)} High Courts across {len(keys)} metadata files", flush=True)
    grand0 = row_count(cur)

    for i, (court_path, court_keys) in enumerate(sorted(groups.items()), 1):
        t0 = time.time()
        first = cols(read_parquet(HC_BUCKET, court_keys[0], HC_READ))
        code = clean(first.get("court_code", [None])[0]) or court_path.replace("_", "~")
        name = clean(first.get("court", [None])[0]) or f"High Court {court_path}"
        if code in done_courts:
            print(f"[{i:2}/{len(groups)}] {name} ({code}): already loaded, skipped", flush=True)
            continue
        cur.execute("insert into courts(code,name,kind) values(%s,%s,'high') on conflict do nothing", (code, name))
        cur.execute("insert into ingest_runs(source,scope) values('aws-hc',%s) returning id", (f"court={code}",))
        run_id = cur.fetchone()[0]; conn.commit()
        before = row_count(cur); processed = 0
        # sequential, main-thread: pyarrow S3FileSystem is not happy with several
        # concurrent range-reads; projected reads are ~5s each so this is fine.
        for fi, kk in enumerate(court_keys, 1):
            batch = dedup_batch(build_hc(read_parquet(HC_BUCKET, kk, HC_READ), code))
            processed += len(batch)
            for j in range(0, len(batch), 5000):
                execute_values(cur, UPSERT, batch[j:j+5000], page_size=5000)
            if fi % 10 == 0 or fi == len(court_keys):
                print(f"      {name}: {fi}/{len(court_keys)} files, ~{processed} rows", flush=True)
        conn.commit()
        after = row_count(cur)
        cur.execute("update ingest_runs set rows_added=%s, finished_at=now(), status='done' where id=%s",
                    (after - before, run_id))
        conn.commit()
        print(f"[{i:2}/{len(groups)}] {name} ({code}): {len(court_keys)} files, +{after-before} rows "
              f"in {time.time()-t0:.0f}s | table total {after}", flush=True)

    # rebuild the heavy indexes once, on the full table
    print("rebuilding heavy indexes on the full table ...", flush=True)
    ti = time.time()
    for name, ddl in HEAVY_INDEXES.items():
        cur.execute(f"drop index if exists {name}"); cur.execute(ddl); conn.commit()
        print(f"  built {name} ({time.time()-ti:.0f}s elapsed)", flush=True)
    conn.autocommit = True                       # VACUUM cannot run in a transaction
    cur.execute("vacuum analyze case_laws")
    print(f"ALL HIGH COURTS DONE. added {row_count(cur)-grand0} rows; table total {row_count(cur)}", flush=True)
    conn.close()

if __name__ == "__main__":
    if sys.argv[1] == "sc":
        load("sc")
    elif sys.argv[1] == "hc":
        load("hc", sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "all-hc":
        load_all_hc()
    else:
        print("usage: load_metadata.py sc | hc <court_code> <court_name> | all-hc")
