"""Statistics of the citation graph, and accuracy checks that need no human labels:
  * name/number agreement: for edges resolved by a number, how often the case name written beside it reaches the same judgment
  * temporal consistency: a judgment can only cite judgments decided before it; an edge to a later judgment is certainly wrong,
    and a wrong edge points to a later judgment about as often as to an earlier one, so the violation rate bounds the error rate
Writes graph/stats.json.
"""
import json, sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

import numpy as np
from scipy import sparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from citebench.build_benchmark import LANDMARK_IDS

G = Path(__file__).resolve().parent


def main():
    ix = SCIndex()
    U = [json.loads(l) for l in (G / "units.jsonl").read_text(encoding="utf-8").splitlines()]
    srcs = {u["src"] for u in U}
    n_units = len(U)
    tiers = Counter(u["tier"] for u in U)
    print(f"{len(srcs)} judgments with extracted units; {n_units} distinct (judgment, citation) pairs")
    print("tiers:", dict(tiers), "\nunresolved reasons:", dict(Counter(u["reason"] for u in U if u["tier"] == "unresolved")))
    kinds = Counter(u["kind"] for u in U)
    res_kind = Counter(u["kind"] for u in U if u["tier"] in ("exact", "parallel", "name"))
    print("resolved share by kind:", {k: f"{res_kind[k]}/{kinds[k]} ({100 * res_kind[k] / kinds[k]:.0f}%)" for k in kinds})
    edges = {}
    for u in U:
        if u["dst"] is not None and u["tier"] in ("exact", "parallel", "name"):
            edges.setdefault((u["src"], u["dst"]), set()).add(u["tier"])
    print(f"distinct edges (citing -> cited judgment): {len(edges)}")

    # by era of the citing judgment
    era = defaultdict(Counter)
    for u in U:
        if u["tier"] == "self":                     # a judgment's own report citation is not a citation of another case
            continue
        y = ix.by_id[u["src"]].dyear
        era[y // 10 * 10][u["tier"]] += 1
    print(f"\n{'decade':8s} {'units':>7s} {'resolved%':>9s}  exact parallel name unresolved")
    by_era = {}
    for d in sorted(era):
        c = era[d]; n = sum(c.values()); r = c["exact"] + c["parallel"] + c["name"]
        by_era[d] = {"units": n, "resolved_pct": 100 * r / n, **{k: c[k] for k in ("exact", "parallel", "name", "unresolved")}}
        print(f"{d}s {n:9d} {100 * r / n:8.1f}%  {c['exact']:5d} {c['parallel']:5d} {c['name']:5d} {c['unresolved']:5d}")

    # accuracy without labels
    named = [u for u in U if u["tier"] in ("exact", "parallel") and u["agree"] is not None]
    agree = sum(1 for u in named if u["agree"])
    print(f"\nname/number agreement: {agree}/{len(named)} ({100 * agree / max(1, len(named)):.1f}%) of number-resolved pairs with a name;"
          f" conflicts dropped: {tiers['conflict']}")
    # precision of the name + year tier, measured where the number gives the answer independently
    both = [u for u in U if u.get("num") and u.get("by_name") is not None]
    name_ok = sum(1 for u in both if u["by_name"] in u["num"] or u["agree"])
    print(f"name + year resolution checked against the number: {name_ok}/{len(both)} correct ({100 * name_ok / max(1, len(both)):.1f}%)")
    name_prec = [name_ok, len(both)]
    viol = {"all": [0, 0]}
    for (s, d), ts in edges.items():
        later = ix.by_id[d].decision_date > ix.by_id[s].decision_date
        for t in list(ts) + ["all"]:
            viol.setdefault(t, [0, 0])
            viol[t][0] += later
            viol[t][1] += 1
    print("edges pointing to a LATER judgment (certainly wrong):")
    for t, (v, n) in viol.items():
        print(f"   {t:9s} {v}/{n} = {100 * v / n:.2f}%   (implied error rate about {200 * v / n:.1f}% if errors are random in time)")

    # degrees
    nodes = sorted(ix.by_id)
    pos = {i: k for k, i in enumerate(nodes)}
    indeg = Counter(d for _, d in edges)
    outdeg = Counter(s for s, _ in edges)
    print(f"\njudgments cited at least once: {len(indeg)} ({100 * len(indeg) / len(nodes):.1f}%); that cite at least one: {len(outdeg)}")
    print(f"median out-degree (judgments with >=1): {median(outdeg.values())}, max {max(outdeg.values())};  max in-degree {max(indeg.values())}")
    print("most cited:")
    for i, n in indeg.most_common(15):
        print(f"   {n:5d}  {ix.by_id[i].title[:66]} ({ix.by_id[i].decision_date[:4]})")
    A = sparse.csr_matrix((np.ones(len(edges)), ([pos[d] for _, d in edges], [pos[s] for s, _ in edges])), shape=(len(nodes), len(nodes)))
    out = np.asarray(A.sum(axis=0)).ravel()
    pr = np.full(len(nodes), 1 / len(nodes))
    for _ in range(60):
        pr = 0.15 / len(nodes) + 0.85 * (A @ (pr / np.maximum(out, 1))) + 0.85 * pr[out == 0].sum() / len(nodes)
    order = np.argsort(-pr)[:10]
    print("PageRank top 10:", [ix.by_id[nodes[k]].title[:30] for k in order])
    ranks = np.argsort(np.argsort(-np.asarray([indeg.get(i, 0) for i in nodes])))
    lm = sorted(100 * (1 - ranks[pos[i]] / len(nodes)) for i in LANDMARK_IDS)
    print(f"landmark judgments ({len(LANDMARK_IDS)}): median in-degree percentile {median(lm):.1f}; "
          f"cited at least once: {sum(1 for i in LANDMARK_IDS if indeg.get(i))}")
    (G / "stats.json").write_text(json.dumps({"judgments": len(srcs), "units": n_units, "tiers": dict(tiers), "edges": len(edges),
        "by_kind_resolved": {k: [res_kind[k], kinds[k]] for k in kinds}, "by_era": by_era, "agree": [agree, len(named)],
        "name_precision": name_prec,
        "violations": {k: v for k, v in viol.items()}, "cited_at_least_once": len(indeg), "max_indegree": max(indeg.values()),
        "median_outdeg": median(outdeg.values()), "landmark_median_percentile": median(lm),
        "landmark_cited": [sum(1 for i in LANDMARK_IDS if indeg.get(i)), len(LANDMARK_IDS)],
        "citing_judgments": len(outdeg),
        "top_cited": [[ix.by_id[i].title, ix.by_id[i].decision_date[:4], n] for i, n in indeg.most_common(15)]}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
