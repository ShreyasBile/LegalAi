"""Pilot: extract the text layer of each PDF (PyMuPDF) and measure its quality, by period.

Measures per judgment: pages, characters per page, share of pages with almost no text (no text layer -> would need OCR),
whether the parties named in the metadata appear on the first two pages, and a noise proxy: the share of word tokens
(4+ letters) that occur in at least 3 different judgments of the pilot (frequent words are almost never OCR garbage).
Writes pilot/text/<id>.txt and pilot/extract_stats.json.
"""
import json, re, sys, time
from collections import Counter, defaultdict
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import tokens

PILOT = Path(__file__).resolve().parent
TEXT = PILOT / "text"
WORD = re.compile(r"[A-Za-z]{4,}")


def main():
    TEXT.mkdir(exist_ok=True)
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    stats, t0 = {}, time.time()
    for it in sample:
        doc = fitz.open(PILOT / "pdf" / f"{it['id']}.pdf")
        pages = [p.get_text() for p in doc]
        (TEXT / f"{it['id']}.txt").write_text("\n\f".join(pages), encoding="utf-8")
        full = "\n".join(pages)
        first = " ".join(pages[:2]).lower()
        title_toks = set(tokens(it["title"]))
        found = sum(1 for t in title_toks if t in first)
        stats[it["id"]] = {"pages": len(pages), "chars": len(full), "empty_pages": sum(1 for p in pages if len(p.strip()) < 100),
                           "title_tokens": len(title_toks), "title_found_p12": found, "size": (PILOT / "pdf" / f"{it['id']}.pdf").stat().st_size}
    print(f"extracted {len(sample)} PDFs in {time.time() - t0:.0f}s")

    # noise proxy: token validity by document frequency across the pilot
    df = Counter()
    toks = {}
    for it in sample:
        ws = WORD.findall((TEXT / f"{it['id']}.txt").read_text(encoding="utf-8").lower())
        toks[it["id"]] = ws
        df.update(set(ws))
    for it in sample:
        ws = toks[it["id"]]
        stats[it["id"]]["valid_share"] = sum(1 for w in ws if df[w] >= 3) / len(ws) if ws else 0.0
        stats[it["id"]]["words"] = len(ws)
    (PILOT / "extract_stats.json").write_text(json.dumps(stats), encoding="utf-8")

    by = defaultdict(list)
    for it in sample:
        by["reference" if it["stratum"] == "reference" else f"{it['year'] // 10 * 10}s"].append(stats[it["id"]])
    print(f"{'group':10s} {'n':>3s} {'pages':>6s} {'chars/pg':>8s} {'empty%':>6s} {'title@p1-2':>10s} {'valid%':>7s} {'MB':>5s}")
    from statistics import median
    for g in sorted(by):
        v = by[g]
        tot_pages = sum(s["pages"] for s in v)
        tt = sum(s["title_tokens"] for s in v)
        print(f"{g:10s} {len(v):3d} {median(s['pages'] for s in v):6.0f} {sum(s['chars'] for s in v) / tot_pages:8.0f} "
              f"{100 * sum(s['empty_pages'] for s in v) / tot_pages:6.1f} {100 * sum(s['title_found_p12'] for s in v) / tt:9.1f}% "
              f"{100 * median(s['valid_share'] for s in v):6.1f}% {sum(s['size'] for s in v) / 1e6 / len(v):5.2f}")
    allv = list(stats.values())
    print("judgments with no text layer at all (<100 chars/page on average):", sum(1 for s in allv if s["chars"] / max(1, s["pages"]) < 100))
    print("total pages", sum(s["pages"] for s in allv), "total chars", sum(s["chars"] for s in allv), "total words", sum(s["words"] for s in allv))


if __name__ == "__main__":
    main()
