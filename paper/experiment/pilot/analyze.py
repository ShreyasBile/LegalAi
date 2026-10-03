"""Pilot analysis: how accurately can in-text citations be resolved to judgments in the index?

1. annotator-free accuracy of name + year resolution, measured on mentions that also carry an S.C.R./neutral number
2. what name + year alone achieves on SCC/AIR mentions (labels, ambiguity)
3. edge statistics and a sanity check of the most-cited judgments
"""
import json, sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from citebench.verifier import TAU

PILOT = Path(__file__).resolve().parent


def era(m):
    return "reference" if m["stratum"] == "reference" else m["stratum"].replace("random ", "")


def main():
    ix = SCIndex()
    M = [json.loads(l) for l in (PILOT / "mentions.jsonl").read_text(encoding="utf-8").splitlines()]
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    print(f"{len(M)} citations found in {len(sample)} judgments; with a recognisable 'X v. Y' name: {sum(1 for m in M if m['name'])}")
    print("by kind (all):", dict(Counter(m['kind'] for m in M)))
    R = [m for m in M if "by_name" in m]
    print("named and de-duplicated within a judgment:", len(R), dict(Counter(m['kind'] for m in R)))
    e = defaultdict(Counter)
    for m in R:
        e[era(m)][m["kind"]] += 1
    print(f"\n{'group':10s} {'scr':>5s} {'insc':>5s} {'scc':>5s} {'air':>5s} {'air_oth':>7s}")
    for g in sorted(e):
        print(f"{g:10s} {e[g]['scr']:5d} {e[g]['insc']:5d} {e[g]['scc']:5d} {e[g]['air']:5d} {e[g]['air_other']:7d}")

    # 1. annotator-free check: number resolves -> does name + year reach the same judgment?
    N = [m for m in R if m["kind"] in ("scr", "insc")]
    found = [m for m in N if m["by_number"]["ids"]]
    print(f"\n[1] S.C.R./neutral mentions with a name: {len(N)}; the number exists in the index for {len(found)} ({100 * len(found) / len(N):.1f}%)")
    agree = wrong = miss = 0
    detail = []
    for m in found:
        gt = [ix.by_id[i] for i in m["by_number"]["ids"]]
        name_ok = any(ix.strict_score(m["name"], r) >= TAU for r in gt)
        mid = m["by_name"]["matched_id"]
        if mid is not None and (mid in m["by_number"]["ids"] or name_ok):
            agree += 1
        elif mid is not None:
            wrong += 1
            detail.append(("WRONG", m, ix.by_id[mid].title, [r.title for r in gt]))
        else:
            miss += 1
            detail.append(("MISS", m, None, [r.title for r in gt]))
    print(f"    name + year reaches the same judgment as the number: {agree} ({100 * agree / len(found):.1f}%)")
    print(f"    reaches a different judgment: {wrong} ({100 * wrong / len(found):.1f}%);   finds nothing: {miss} ({100 * miss / len(found):.1f}%)")
    print(f"    precision when it finds something: {100 * agree / max(1, agree + wrong):.1f}%   recall: {100 * agree / len(found):.1f}%")
    print("    by era (agree/wrong/miss):")
    for g in sorted({era(m) for m in found}):
        sel = [m for m in found if era(m) == g]
        a = w = x = 0
        for m in sel:
            gt = [ix.by_id[i] for i in m["by_number"]["ids"]]
            ok = any(ix.strict_score(m["name"], r) >= TAU for r in gt)
            mid = m["by_name"]["matched_id"]
            if mid is not None and (mid in m["by_number"]["ids"] or ok):
                a += 1
            elif mid is not None:
                w += 1
            else:
                x += 1
        print(f"      {g:10s} n={len(sel):4d} agree {a:4d} wrong {w:3d} miss {x:4d}")
    (PILOT / "disagreements.json").write_text(json.dumps([{"kind": k, "name": m["name"], "raw": m["raw"], "year": m["year"], "matched": mt, "number_points_to": gt, "doc": m["doc"]} for k, m, mt, gt in detail], indent=1, ensure_ascii=False), encoding="utf-8")

    # number does not exist in the index: OCR error, wrong volume, or a report the index lacks
    nf = [m for m in N if not m["by_number"]["ids"]]
    print(f"    mentions whose number is not in the index: {len(nf)}; of those, name + year still finds a judgment for {sum(1 for m in nf if m['by_name']['matched_id'])}")

    # 2. SCC / AIR mentions: name + year only
    S = [m for m in R if m["kind"] in ("scc", "air")]
    lab = Counter(m["by_name"]["label"] for m in S)
    ver = [m for m in S if m["by_name"]["label"] == "VERIFIED"]
    amb = [m for m in ver if m["by_name"]["n_candidates"] > 1]
    print(f"\n[2] SCC/AIR mentions with a name: {len(S)}; labels by name + year: {dict(lab)}")
    print(f"    VERIFIED: {len(ver)} ({100 * len(ver) / len(S):.1f}%); of those {len(amb)} ({100 * len(amb) / max(1, len(ver)):.1f}%) match more than one distinct judgment")
    for g in sorted({era(m) for m in S}):
        sel = [m for m in S if era(m) == g]
        v = sum(1 for m in sel if m["by_name"]["label"] == "VERIFIED")
        print(f"      {g:10s} n={len(sel):4d} resolved {v:4d} ({100 * v / len(sel):.0f}%)")

    # 3. edges: one per (citing judgment, cited judgment)
    edges = set()
    for m in R:
        if m["kind"] in ("scr", "insc") and m["by_number"]["ids"]:
            for i in m["by_number"]["ids"][:1]:
                edges.add((m["doc"], i))
        elif m["by_name"]["label"] == "VERIFIED" and m["by_name"]["n_candidates"] == 1:
            edges.add((m["doc"], m["by_name"]["matched_id"]))
    per_doc = Counter(d for d, _ in edges)
    print(f"\n[3] resolved edges (citing -> cited judgment, unambiguous): {len(edges)}; median per judgment {median(per_doc.get(it['id'], 0) for it in sample):.0f}")
    indeg = Counter(c for _, c in edges)
    print("    most cited judgments within the pilot:")
    for i, n in indeg.most_common(8):
        print(f"      {n:3d}  {ix.by_id[i].title[:70]} ({ix.by_id[i].decision_date[:4]})")
    (PILOT / "edges.json").write_text(json.dumps(sorted(edges)), encoding="utf-8")


if __name__ == "__main__":
    main()
