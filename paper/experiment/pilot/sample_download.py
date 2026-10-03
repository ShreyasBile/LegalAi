"""Pilot: sample Supreme Court judgments and download their PDFs from the public AWS bucket (CC-BY-4.0).

Sample = the 70 reference judgments of the T4 questions + 54 seeded random judgments from each of eight periods
(1950s ... 2020s), excluding the reference ones. Writes pilot/sample.json and pilot/pdf/<id>.pdf; resumable.
"""
import json, random, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

import psycopg2
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import DSN
from citebench.reference import REFERENCE

PILOT = Path(__file__).resolve().parent
PDF = PILOT / "pdf"
BUCKET = "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/"
PERIODS = [(1950, 1959), (1960, 1969), (1970, 1979), (1980, 1989), (1990, 1999), (2000, 2009), (2010, 2019), (2020, 2025)]
PER_PERIOD = 54


def main():
    PDF.mkdir(parents=True, exist_ok=True)
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    cur.execute("""select id, extract(year from decision_date)::int, title, citation, neutral_citation, pdf_ref
                     from case_laws where source='aws-sc' and decision_date is not null and pdf_ref is not null""")
    rows = {r[0]: r for r in cur.fetchall()}
    ref_ids = sorted({i for v in REFERENCE.values() for i in v})
    rng = random.Random("pilot-2026")
    chosen = [(i, "reference") for i in ref_ids]
    for lo, hi in PERIODS:
        pool = sorted(i for i, r in rows.items() if lo <= r[1] <= hi and i not in set(ref_ids))
        chosen += [(i, f"random {lo}s") for i in rng.sample(pool, PER_PERIOD)]
    sample = [{"id": i, "stratum": s, "year": rows[i][1], "title": rows[i][2], "scr": rows[i][3], "neutral": rows[i][4],
               "pdf_ref": rows[i][5]} for i, s in chosen]
    (PILOT / "sample.json").write_text(json.dumps(sample, indent=1, ensure_ascii=False), encoding="utf-8")
    print(len(sample), "judgments in the pilot sample")

    def fetch(it):
        out = PDF / f"{it['id']}.pdf"
        if out.exists() and out.stat().st_size > 0:
            return it["id"], "cached", out.stat().st_size
        url = BUCKET + "/".join(quote(p) for p in it["pdf_ref"].split("/"))
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=120)
                if r.status_code == 200 and r.content[:4] == b"%PDF":
                    out.write_bytes(r.content)
                    return it["id"], "ok", len(r.content)
                status = f"http {r.status_code}"
            except requests.RequestException as e:
                status = f"error {type(e).__name__}"
            time.sleep(1 + attempt)
        return it["id"], status, 0

    t0 = time.time()
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(fetch, sample))
    (PILOT / "download.json").write_text(json.dumps(res), encoding="utf-8")
    from collections import Counter
    print(Counter(r[1] for r in res), f"{sum(r[2] for r in res) / 1e6:.0f} MB in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
