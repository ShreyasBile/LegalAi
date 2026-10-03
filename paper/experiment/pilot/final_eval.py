"""Pilot: what share of the citations inside a judgment can be turned into a reliable edge (citing -> cited judgment)?

Pipeline (no tuned parameters):
  1. S.C.R. / neutral citation   -> exact lookup in the index (the number identifies the judgment)
  2. SCC / AIR citation written next to an S.C.R. / neutral citation ('(2012) 1 SCC 40 : [2011] 13 SCR 309', a parallel
     citation)                   -> the parallel number's judgment
  3. any other SCC / AIR citation with a case name -> name + year through the verifier; kept only if unambiguous
Conflicts (the number and the name reach different judgments) are dropped. Reported separately for the 70 reference judgments
(used to develop the extraction) and the 432 random judgments (not used for development).
"""
import json, re, sys
from collections import Counter
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from citebench.index import SCIndex
from citebench.verifier import rows_for_citation, TAU
from citations import find_cites

PILOT = Path(__file__).resolve().parent
GAP = re.compile(r"^\s{0,3}[:;=,]?\s{0,3}$")


def main():
    ix = SCIndex()
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    names = {}
    for l in (PILOT / "mentions.jsonl").read_text(encoding="utf-8").splitlines():
        m = json.loads(l)
        if m.get("by_name") and (m["doc"], m["kind"], m["raw"]) not in names:
            names[(m["doc"], m["kind"], m["raw"])] = m
    groups = {"reference": [it for it in sample if it["stratum"] == "reference"],
              "random": [it for it in sample if it["stratum"] != "reference"]}
    for gname, docs in groups.items():
        c = Counter()
        edges_per_doc = []
        for it in docs:
            text = re.sub(r"\s+", " ", (PILOT / "text" / f"{it['id']}.txt").read_text(encoding="utf-8"))
            text = re.sub(r"(\w)- (\w)", r"\1\2", text)
            cites = [x for x in find_cites(text) if x["kind"] != "air_other"]
            units = {}
            for i, x in enumerate(cites):
                key = x["norm"] or re.sub(r"\W", "", x["raw"].lower())
                u = units.setdefault((x["kind"], key), {"kind": x["kind"], "num": None, "name": None, "has_name": False})
                if x["kind"] in ("scr", "insc"):
                    rows = rows_for_citation(ix, x["norm"])[1]
                    u["num"] = u["num"] or ([r.id for r in rows] or None)
                    u["seen_num"] = True
                else:
                    for j in (i - 1, i + 1):                      # a parallel S.C.R./neutral citation right beside it
                        if 0 <= j < len(cites) and cites[j]["kind"] in ("scr", "insc") and abs(cites[j]["year"] - x["year"]) <= 2:
                            a, b = (cites[j], x) if j < i else (x, cites[j])
                            if GAP.match(text[a["end"]:b["start"]]):
                                rows = rows_for_citation(ix, cites[j]["norm"])[1]
                                if rows:
                                    u["num"] = u["num"] or [r.id for r in rows]
                                    u["parallel"] = True
                    mm = names.get((it["id"], x["kind"], x["raw"]))
                    if mm:
                        u["name"] = u["name"] or mm
            resolved = set()
            for (kind, key), u in units.items():
                c["pairs"] += 1
                c[f"pairs_{kind}"] += 1
                by_name = None
                if u["name"] and u["name"]["by_name"]["label"] == "VERIFIED" and u["name"]["by_name"]["n_candidates"] == 1:
                    by_name = u["name"]["by_name"]["matched_id"]
                if u["num"]:
                    if by_name is not None and by_name not in u["num"] and not any(ix.strict_score(u["name"]["name"], ix.by_id[i]) >= TAU for i in u["num"]):
                        c["conflict"] += 1
                        continue
                    c["edge_exact" + ("_parallel" if u.get("parallel") and kind in ("scc", "air") else "")] += 1
                    c[f"edge_{kind}"] += 1
                    resolved.add(u["num"][0])
                elif by_name is not None:
                    c["edge_name"] += 1
                    c[f"edge_{kind}"] += 1
                    resolved.add(by_name)
                elif kind in ("scr", "insc"):
                    c["scr_not_in_index"] += 1
                else:
                    c["unresolved_" + kind] += 1
            edges_per_doc.append(len(resolved))
        n = c["pairs"]
        edges = c["edge_exact"] + c["edge_exact_parallel"] + c["edge_name"]
        print(f"\n== {gname}: {len(docs)} judgments, {n} distinct (judgment, citation) pairs")
        print(f"   pairs by kind: " + ", ".join(f"{k} {c['pairs_' + k]}" for k in ('scr', 'insc', 'scc', 'air')))
        print(f"   -> edges: {edges} ({100 * edges / n:.1f}% of pairs):  exact number {c['edge_exact']}, SCC/AIR via parallel number {c['edge_exact_parallel']}, name+year only {c['edge_name']}")
        print(f"   dropped: conflicts {c['conflict']}; S.C.R./neutral number not in index {c['scr_not_in_index']}; SCC unresolved {c['unresolved_scc']}; AIR unresolved {c['unresolved_air']}")
        for k in ("scr", "scc", "air"):
            if c["pairs_" + k]:
                print(f"   resolved share of {k}: {100 * c['edge_' + k] / c['pairs_' + k]:.0f}% of {c['pairs_' + k]}")
        print(f"   distinct cited judgments per judgment: median {median(edges_per_doc):.0f}, mean {sum(edges_per_doc) / len(edges_per_doc):.1f}, max {max(edges_per_doc)}")


if __name__ == "__main__":
    main()
