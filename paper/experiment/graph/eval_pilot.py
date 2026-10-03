"""Run the extractor on the pilot judgments (random 432 and reference 70) and summarise resolution tiers and agreement."""
import json, sys, time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from graph.citextract import process_doc

PILOT = ROOT / "pilot"


def main():
    ix = SCIndex()
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    cache = {}
    for gname, pick in (("random", lambda it: it["stratum"] != "reference"), ("reference", lambda it: it["stratum"] == "reference")):
        t0, recs = time.time(), []
        for it in sample:
            if pick(it):
                recs += process_doc(ix, it["id"], (PILOT / "text" / f"{it['id']}.txt").read_text(encoding="utf-8"), cache)
        c = Counter(r["tier"] for r in recs)
        n = len(recs)
        edges = c["exact"] + c["parallel"] + c["name"]
        print(f"\n== {gname}: {n} distinct (judgment, citation) pairs, {time.time() - t0:.0f}s")
        print("   tiers:", dict(c), f"-> edges {edges} ({100 * edges / n:.1f}%)")
        print("   unresolved reasons:", dict(Counter(r["reason"] for r in recs if r["tier"] == "unresolved")))
        named = [r for r in recs if r["tier"] in ("exact", "parallel") and r["agree"] is not None]
        print(f"   number-resolved units with a name: {len(named)}; name agrees with the number: {sum(1 for r in named if r['agree'])} ({100 * sum(1 for r in named if r['agree']) / max(1, len(named)):.1f}%)")
        for k in ("scr", "scc", "air"):
            sel = [r for r in recs if r["kind"] == k]
            if sel:
                print(f"   {k}: {sum(1 for r in sel if r['tier'] in ('exact', 'parallel', 'name'))}/{len(sel)} resolved")


if __name__ == "__main__":
    main()
