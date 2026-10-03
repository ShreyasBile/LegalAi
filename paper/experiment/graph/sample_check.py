"""Draw a seeded random sample of edges resolved by name + year only (the tier no citation number confirms) and write a sheet
with the citation context and the judgment it was resolved to, for a manual check. Also samples SCC/AIR citations left
unresolved, to see why."""
import json, random, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from graph.citextract import clean
from retrieval.common import read_text

G = Path(__file__).resolve().parent
N_EDGES, N_UNRES = 60, 40


def context(text, raw, width=220):
    t = clean(text)
    k = t.find(raw)
    return t[max(0, k - width):k + len(raw)] if k >= 0 else "(citation string not found after cleaning)"


def main():
    ix = SCIndex()
    U = [json.loads(l) for l in (G / "units.jsonl").read_text(encoding="utf-8").splitlines()]
    rng = random.Random("graph-check-2026")
    pilot = {it["id"] for it in json.loads((ROOT / "pilot" / "sample.json").read_text(encoding="utf-8"))}   # used in development
    name_edges = [u for u in U if u["tier"] == "name" and u["src"] not in pilot]
    unres = [u for u in U if u["tier"] == "unresolved" and u["kind"] in ("scc", "air") and u.get("name") and u["src"] not in pilot]
    sheet = []
    for tag, pool, n in (("NAME_EDGE", name_edges, N_EDGES), ("UNRESOLVED", unres, N_UNRES)):
        for u in rng.sample(pool, n):
            text = read_text(u["src"])
            item = {"tag": tag, "src": u["src"], "src_title": ix.by_id[u["src"]].title, "src_date": ix.by_id[u["src"]].decision_date,
                    "raw": u["raw"], "year": u["year"], "name": u["name"], "context": context(text, u["raw"]) if text else ""}
            if u["dst"] is not None:
                r = ix.by_id[u["dst"]]
                item.update(dst=u["dst"], dst_title=r.title, dst_date=r.decision_date, dst_scr=r.scr)
            else:
                item.update(reason=u.get("reason"), cands=u.get("cands"))
            sheet.append(item)
    (G / "check_sample.json").write_text(json.dumps(sheet, indent=1, ensure_ascii=False), encoding="utf-8")
    with (G / "check_sheet.txt").open("w", encoding="utf-8") as f:
        for k, it in enumerate(sheet, 1):
            f.write(f"#{k} [{it['tag']}] citing {it['src']} ({it['src_date']}) {it['src_title'][:70]}\n")
            f.write(f"   context: ...{it['context']}\n   extracted name: {it['name']} | citation {it['raw']} ({it['year']})\n")
            if "dst" in it:
                f.write(f"   resolved to: {it['dst']} {it['dst_title'][:80]} ({it['dst_date']}, {it['dst_scr']})\n\n")
            else:
                f.write(f"   unresolved: {it['reason']} (candidates {it['cands']})\n\n")
    print(f"wrote {len(sheet)} items: {N_EDGES} name-only edges from {len(name_edges)}, {N_UNRES} unresolved SCC/AIR from {len(unres)}")


if __name__ == "__main__":
    main()
