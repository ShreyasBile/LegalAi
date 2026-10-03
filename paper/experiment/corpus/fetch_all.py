"""Download every Supreme Court judgment PDF from the public AWS bucket (CC-BY-4.0), extract its text layer and keep only the
text (gzip). The PDF itself is not kept. Resumable: a judgment whose text file exists is skipped.

    python corpus/fetch_all.py [workers]

Writes corpus/text/<id>.txt.gz (pages joined by form feed) and appends one line per judgment to corpus/manifest.jsonl:
{id, status, pdf_bytes, pages, chars}. A PDF that cannot be fetched or parsed is recorded with its status.
"""
import gzip, json, sys, time
from multiprocessing import Pool
from pathlib import Path
from urllib.parse import quote

import fitz
import psycopg2
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import DSN

CORPUS = Path(__file__).resolve().parent
TEXT = CORPUS / "text"
BUCKET = "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/"
_session = None


def work(item):
    global _session
    i, ref = item
    out = TEXT / f"{i}.txt.gz"
    if out.exists() and out.stat().st_size > 0:
        return {"id": i, "status": "cached"}
    if _session is None:
        _session = requests.Session()
        fitz.TOOLS.mupdf_display_errors(False)
    url = BUCKET + "/".join(quote(p) for p in ref.split("/"))
    status = "error"
    for attempt in range(4):
        try:
            r = _session.get(url, timeout=120)
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                doc = fitz.open(stream=r.content, filetype="pdf")
                pages = [p.get_text() for p in doc]
                text = "\n\f".join(pages)
                tmp = out.with_suffix(".tmp")
                with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
                    f.write(text)
                tmp.replace(out)
                return {"id": i, "status": "ok", "pdf_bytes": len(r.content), "pages": len(pages), "chars": len(text)}
            status = f"http {r.status_code}"
            if r.status_code in (403, 404):
                break
        except Exception as e:                                   # network hiccup or unreadable PDF: retry, then record
            status = f"error {type(e).__name__}"
        time.sleep(1 + 2 * attempt)
    return {"id": i, "status": status}


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    TEXT.mkdir(parents=True, exist_ok=True)
    cur = psycopg2.connect(DSN).cursor()
    cur.execute("select id, pdf_ref from case_laws where source='aws-sc' and pdf_ref is not null order by id")
    items = cur.fetchall()
    print(f"{len(items)} judgments; {sum(1 for i, _ in items if (TEXT / f'{i}.txt.gz').exists())} already done", flush=True)
    t0, n = time.time(), 0
    with (CORPUS / "manifest.jsonl").open("a", encoding="utf-8") as mf, Pool(workers) as pool:
        for res in pool.imap_unordered(work, items, chunksize=4):
            mf.write(json.dumps(res) + "\n")
            n += 1
            if n % 500 == 0:
                mf.flush()
                print(f"{n}/{len(items)}  {time.time() - t0:.0f}s", flush=True)
    print(f"done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
