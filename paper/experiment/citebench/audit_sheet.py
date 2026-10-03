"""Held-out manual audit of the (frozen) verifier on T4 answers.

The development sheet (seed 11, data/audit_sample_dev.json) was used while building the verifier. This script draws a
NEW sample (seed 'heldout-2026') from the four main models' T4 cases, excluding every case shown on the development
sheet, stratified by label: per model up to 10 VERIFIED, 10 NOT_FOUND, 5 WRONG_YEAR and 5 MISATTRIBUTED/WRONG_CITATION.
For each case the sheet shows the verifier's decision and the best index candidates at ANY year under a lenient score
(name_score, no precision or initials conditions), so a human can judge whether a matching Supreme Court judgment exists.
The human labels are recorded in data/audit_labels.json.
"""
import json, random, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex, tokens

RES = ROOT / "results"
SEED = "heldout-2026"
PER = (("VERIFIED", 10), ("NOT_FOUND", 10), ("WRONG_YEAR", 5), ("MISATTRIBUTED", 5), ("WRONG_CITATION", 5))


def lenient(ix, name, k=4):
    a = set(tokens(name))
    if not a:
        return []
    rare = sorted(a, key=lambda t: -ix.idf.get(t, ix.idf_unknown))[:3]
    look = set(rare) | {v for t in rare for v in ix.similar_words(t)}
    cand = {r.id: r for t in look for r in ix.postings.get(t, [])}.values()
    return sorted(((ix.name_score(a, r), r) for r in cand), key=lambda x: (-x[0], x[1].id))[:k]


def main(models):
    ix = SCIndex()
    dev = json.loads((ROOT / "data" / "audit_sample_dev.json").read_text(encoding="utf-8"))
    seen = {(d["model"], d["q"], d["case_name"]) for d in dev}
    sheet = []
    for m in models:
        rng = random.Random(f"{SEED}-{m}")
        rows = [json.loads(l) for l in (RES / f"scored_{m}.jsonl").read_text(encoding="utf-8").splitlines()]
        cases = [dict(c, model=m, q=r["key"]) for r in rows if r["task"] == "T4" for c in r["cases"]]
        cases = [c for c in cases if (m, c["q"], c["case_name"]) not in seen]
        for lab, k in PER:
            pool = sorted([c for c in cases if c["label"] == lab], key=lambda c: (c["q"], c["case_name"]))
            sheet += rng.sample(pool, min(k, len(pool)))
    for i, c in enumerate(sheet):
        c["audit_id"] = i
        matched = ix.by_id.get(c["matched_id"]) if c["matched_id"] else None
        cit = [ix.by_id[x] for x in c["citation_ids"]][:2]
        print(f"\n#{i} [{c['model']}] {c['label']} s={c['name_score']} | {c['case_name']} | {c['year']} | {c['citation']}")
        if matched:
            print(f"   matched: {matched.decision_date} {matched.scr} | {matched.title[:100]}")
        for r in cit:
            print(f"   citation->: {r.decision_date} {r.scr} | {r.title[:100]}")
        for s, r in lenient(ix, c["case_name"]):
            print(f"   any-year {s:.2f}: {r.decision_date} {r.scr} | {r.title[:100]}")
    (ROOT / "data" / "audit_sample_heldout.json").write_text(json.dumps(sheet, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
