"""Citation recommendation: given only the headnote of a judgment (citations and case names removed), retrieve the judgments it cites.

The judgments it cites come from the resolved graph edges (graph/edges.jsonl); no human labels are involved. For a test judgment
decided on date T only judgments decided before T are candidates, the test judgment itself is excluded, and the citation prior
counts only citations made before T.

Methods: popularity (most-cited so far), BM25, dense, BM25+dense, and each with the citation prior. Fusion weights are chosen on
a dev split of the judgments and every method is reported on a disjoint test split, with bootstrap 95% intervals.
    python retrieval/eval_recommend.py [n_dev] [n_test]
"""
import json, random, sys, time
from itertools import product
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from retrieval.engine import Engine
from retrieval.queries import citation_free_query
from retrieval.common import read_text
from citebench.index import tokens

RET = Path(__file__).resolve().parent
EDGES = ROOT / "graph" / "edges.jsonl"
MIN_TARGETS = 5
GRID = [w for w in product((0, 0.5, 1), (0, 0.5, 1), (0, 0.25, 0.5, 1)) if w[0] or w[1]]


def metrics(ranked, targets):
    """recall@10, recall@50, hit@10, reciprocal rank of the first target"""
    t = set(targets)
    r10 = len(t & set(ranked[:10])) / len(t)
    r50 = len(t & set(ranked[:50])) / len(t)
    first = next((k for k, i in enumerate(ranked[:100], 1) if i in t), None)
    return [r10, r50, float(r10 > 0), 1 / first if first else 0.0]


def boot(vals, n=2000, seed=1):
    v = np.asarray(vals)
    rng = np.random.default_rng(seed)
    m = [v[rng.integers(0, len(v), len(v))].mean(axis=0) for _ in range(n)]
    return v.mean(axis=0), np.percentile(m, 2.5, axis=0), np.percentile(m, 97.5, axis=0)


def main():
    n_dev = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    n_test = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    eng = Engine(EDGES)
    print(f"engine: {len(eng.ids)} judgments, {sum(len(v) for v in eng.cited_by.values())} edges", flush=True)
    targets = {}
    for l in EDGES.read_text(encoding="utf-8").splitlines():
        e = json.loads(l)
        if e["src"] in eng.meta and e["dst"] in eng.pos and eng.meta[e["dst"]]["ord"] < eng.meta[e["src"]]["ord"]:
            targets.setdefault(e["src"], set()).add(e["dst"])
    pool = sorted(s for s, t in targets.items() if len(t) >= MIN_TARGETS and s in eng.pos)
    rng = random.Random(2026)
    rng.shuffle(pool)
    dev, test = pool[:n_dev], pool[n_dev:n_dev + n_test]
    print(f"{len(pool)} judgments cite >= {MIN_TARGETS} earlier judgments; dev {len(dev)}, test {len(test)}", flush=True)

    def prepare(ids):
        out = []
        t0 = time.time()
        for k, s in enumerate(ids, 1):
            q = citation_free_query(read_text(s))
            f = eng.features(q, asof=eng.meta[s]["ord"], exclude=s)
            out.append((s, q, f))
            if k % 100 == 0:
                print(f"  prepared {k}/{len(ids)}  {time.time() - t0:.0f}s", flush=True)
        return out

    print("preparing dev queries", flush=True)
    dev_q = prepare(dev)
    # leakage diagnostic: a distinctive word of a cited judgment's title appearing in the query
    leak = []
    for s, q, _ in dev_q:
        qt = set(tokens(q))
        for d in targets[s]:
            dt = [t for t in tokens(eng.meta[d]["title"]) if len(t) >= 5]
            leak.append(any(t in qt for t in dt))
    print(f"leakage check (dev): {100 * np.mean(leak):.1f}% of cited judgments have a title word of 5+ letters in the query", flush=True)

    # tune fusion weights on dev
    best = {}
    for w in GRID:
        m = np.mean([metrics(eng.rank(f, w, 100), targets[s]) for s, _, f in dev_q], axis=0)
        best[w] = m
    sel = {"hybrid+prior": max((w for w in GRID if w[0] and w[1] and w[2]), key=lambda w: best[w][0]),
           "bm25+prior": max((w for w in GRID if w[0] and not w[1] and w[2]), key=lambda w: best[w][0]),
           "dense+prior": max((w for w in GRID if w[1] and not w[0] and w[2]), key=lambda w: best[w][0]),
           "hybrid": max((w for w in GRID if w[0] and w[1] and not w[2]), key=lambda w: best[w][0])}
    print("weights chosen on dev (recall@10):", {k: (v, round(best[v][0], 3)) for k, v in sel.items()}, flush=True)

    print("preparing test queries", flush=True)
    test_q = prepare(test)
    # stricter leakage check: a RARE word (in at most RARE_DF judgment titles) of a cited judgment's title in the query means
    # its name survived the scrubbing; such targets are also reported separately
    from citebench.index import SCIndex
    ix = SCIndex()
    RARE_DF = 50
    leaked = {}
    for s, q, _ in test_q:
        qt = set(tokens(q))
        leaked[s] = {d for d in targets[s] if d in ix.by_id and any(t in qt and len(ix.postings.get(t, ())) <= RARE_DF for t in ix.by_id[d].toks)}
    n_t = sum(len(targets[s]) for s, _, _ in test_q)
    n_l = sum(len(v) for v in leaked.values())
    print(f"strict leakage (test): {n_l}/{n_t} = {100 * n_l / n_t:.1f}% of cited judgments have a rare title word (df <= {RARE_DF}) in the query", flush=True)
    methods = {"popularity": None, "bm25": (1, 0, 0), "dense": (0, 1, 0), "hybrid": sel["hybrid"],
               "bm25+prior": sel["bm25+prior"], "dense+prior": sel["dense+prior"], "hybrid+prior": sel["hybrid+prior"]}
    results = {}
    per_query = {}
    print(f"\n{'method':14s} {'R@10':>6s} {'R@50':>6s} {'hit@10':>7s} {'MRR':>6s}   (95% CI for R@10)   R@10 on unleaked targets")
    for name, w in methods.items():
        vals, clean = [], []
        for s, _, f in test_q:
            ranked = eng.popular(100, asof=eng.meta[s]["ord"], exclude=s) if w is None else eng.rank(f, w, 100)
            vals.append(metrics(ranked, targets[s]))
            keep = targets[s] - leaked[s]
            if keep:
                clean.append(len(keep & set(ranked[:10])) / len(keep))
        m, lo, hi = boot(vals)
        per_query[name] = [v[0] for v in vals]
        results[name] = {"weights": w, "recall10": m[0], "recall50": m[1], "hit10": m[2], "mrr": m[3], "recall10_ci": [lo[0], hi[0]],
                         "recall50_ci": [lo[1], hi[1]], "hit10_ci": [lo[2], hi[2]], "recall10_unleaked": float(np.mean(clean))}
        print(f"{name:14s} {m[0]:6.3f} {m[1]:6.3f} {m[2]:7.3f} {m[3]:6.3f}   [{lo[0]:.3f}, {hi[0]:.3f}]   {np.mean(clean):.3f}", flush=True)
    # paired bootstrap: does the citation prior improve recall@10 on the same queries?
    rng = np.random.default_rng(7)
    for a, b in (("hybrid", "hybrid+prior"), ("bm25", "bm25+prior"), ("dense", "dense+prior"), ("bm25", "hybrid")):
        d = np.asarray(per_query[b]) - np.asarray(per_query[a])
        bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(5000)]
        lo, hi = np.percentile(bs, [2.5, 97.5])
        p = 2 * min(np.mean(np.asarray(bs) <= 0), np.mean(np.asarray(bs) >= 0))
        results[f"diff:{a}->{b}"] = {"mean": float(d.mean()), "ci": [float(lo), float(hi)], "p_boot": float(p),
                                    "better": int((d > 0).sum()), "worse": int((d < 0).sum())}
        print(f"paired {a} -> {b}: {d.mean():+.3f} [{lo:+.3f}, {hi:+.3f}], better on {(d > 0).sum()}, worse on {(d < 0).sum()} queries", flush=True)
    results["_meta"] = {"n_dev": len(dev), "n_test": len(test), "min_targets": MIN_TARGETS, "pool": len(pool),
                        "mean_targets": float(np.mean([len(targets[s]) for s in test])), "leakage_pct": float(100 * np.mean(leak)),
                        "leakage_strict_pct": float(100 * n_l / n_t), "leakage_rare_df": RARE_DF,
                        "grid_dev_recall10": {str(w): float(v[0]) for w, v in best.items()}}
    (RET / "results_recommend.json").write_text(json.dumps(results, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
