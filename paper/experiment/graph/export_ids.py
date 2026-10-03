"""Export graph/node_ids.csv.gz: the stable identifiers of every Supreme Court judgment in the index.

edges.jsonl refers to judgments by `id`, the primary key of case_laws in the author's PostgreSQL database. That number means nothing
outside that database, so this table maps it to identifiers that anyone can use against the public archive: the archive's own
record id (`source_id`, equal to the CNR), the neutral citation, the S.C.R. citation, and the path of the PDF in the AWS Open Data
bucket (s3://indian-supreme-court-judgments/<pdf_ref>).

Run from paper/experiment:  PGPASSWORD=... python graph/export_ids.py
"""
import csv
import gzip
import io
import json
import os
import sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
DSN = os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")
COLS = ["id", "source_id", "cnr", "neutral_citation", "citation", "title", "decision_date", "pdf_ref"]

edge_ids = set()
for line in (ROOT / "graph" / "edges.jsonl").open(encoding="utf-8"):
    e = json.loads(line)
    edge_ids.add(e["src"])
    edge_ids.add(e["dst"])

with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
    cur.execute("select id, source_id, cnr, neutral_citation, citation, title, decision_date::text, pdf_ref "
                "from case_laws where court_code = 'SC' order by id")
    rows = cur.fetchall()

known = {r[0] for r in rows}
missing = edge_ids - known
if missing:
    sys.exit(f"{len(missing)} ids in edges.jsonl are not Supreme Court rows in the database, e.g. {sorted(missing)[:5]}")

out = ROOT / "graph" / "node_ids.csv.gz"
with out.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as gz:       # mtime=0: same bytes on every run
    text = io.TextIOWrapper(gz, encoding="utf-8", newline="")
    w = csv.writer(text, lineterminator="\n")
    w.writerow(COLS)
    w.writerows(rows)
    text.flush()
    text.detach()
print(f"wrote {out.name}: {len(rows):,} Supreme Court judgments, {len(edge_ids):,} of them appear in edges.jsonl")
