"""Estimate the size of the High Court PDFs: HEAD requests (no download) on a uniform random sample of records (random primary keys)."""
import os
import random
from concurrent.futures import ThreadPoolExecutor
from statistics import mean, median
from urllib.parse import quote

import psycopg2
import requests

# password comes from PGPASSWORD (or ~/.pgpass); CASELAW_DSN overrides the whole DSN
DSN = os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")
BUCKET = "https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/"
N = 300
rng = random.Random(2026)

cur = psycopg2.connect(DSN).cursor()
cur.execute("select min(id), max(id) from case_laws")
lo, hi = cur.fetchone()
print("id range", lo, hi, flush=True)
items, seen = [], set()
while len(items) < N:
    cur.execute("select id, court_code, pdf_ref from case_laws where id >= %s and source='aws-hc' and pdf_ref like 'data/pdf/%%' order by id limit 1",
                (rng.randint(lo, hi),))
    r = cur.fetchone()
    if r and r[0] not in seen:
        seen.add(r[0])
        items.append(r)
print(len(items), "records sampled", flush=True)


def head(it):
    _, court, ref = it
    url = BUCKET + "/".join(quote(p) for p in ref.split("/"))
    try:
        r = requests.head(url, timeout=30)
        return court, (int(r.headers.get("content-length", 0)) if r.status_code == 200 else None)
    except Exception:
        return court, None


with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(head, items))
sizes = [s for _, s in res if s]
print(f"{len(sizes)}/{len(res)} HEAD requests returned a size", flush=True)
cur.execute("select count(*) from case_laws where source='aws-hc' and pdf_ref is not null")
n_linked = cur.fetchone()[0]
m = mean(sizes)
sd = (sum((s - m) ** 2 for s in sizes) / (len(sizes) - 1)) ** 0.5
print(f"PDF size: mean {m/1e3:.0f} KB (95% CI +/- {1.96 * sd / len(sizes) ** 0.5 / 1e3:.0f}), median {median(sizes)/1e3:.0f} KB, "
      f"p10 {sorted(sizes)[len(sizes)//10]/1e3:.0f} KB, p90 {sorted(sizes)[9*len(sizes)//10]/1e3:.0f} KB, max {max(sizes)/1e6:.1f} MB")
print(f"High Court records with a link: {n_linked:,}; estimated total PDF size: {n_linked * m / 1e12:.2f} TB "
      f"(range {n_linked * (m - 1.96 * sd / len(sizes) ** 0.5) / 1e12:.2f}-{n_linked * (m + 1.96 * sd / len(sizes) ** 0.5) / 1e12:.2f} TB)")
