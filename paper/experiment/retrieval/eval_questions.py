"""Retrieval on the 40 T4 legal questions, scored against the reference judgments (citebench/reference.py).

For each method: the share of questions whose top-k contains at least one reference judgment (k = 3, 5, 10), and the mean share
of a question's reference judgments found in the top 10. 'top-3 list' is also a complete answer without any language model:
listing the three best-ranked judgments. Fusion weights are the ones chosen on the citation-recommendation dev split
(results_recommend.json), not tuned on these questions. The citation prior uses the whole graph.
"""
import json, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from retrieval.engine import Engine
from citebench.reference import REFERENCE
from citebench.run_models import BENCH

RET = Path(__file__).resolve().parent


def boot_prop(hits, n=2000, seed=3):
    v = np.asarray(hits, dtype=float)
    rng = np.random.default_rng(seed)
    m = [v[rng.integers(0, len(v), len(v))].mean() for _ in range(n)]
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def main():
    rec = json.loads((RET / "results_recommend.json").read_text())
    eng = Engine(ROOT / "graph" / "edges.jsonl")
    methods = {"bm25": (1, 0, 0), "dense": (0, 1, 0), "hybrid": tuple(rec["hybrid"]["weights"]),
               "hybrid+prior": tuple(rec["hybrid+prior"]["weights"]), "dense+prior": tuple(rec["dense+prior"]["weights"])}
    out = {"weights": {k: list(v) for k, v in methods.items()}, "n": len(BENCH["T4"])}
    print(f"{'method':14s} " + " ".join(f"hit@{k:<2d}" for k in (3, 5, 10)) + "  recall@10   (questions with >=1 reference judgment in the top k, of 40)")
    for name, w in [("popularity", None)] + list(methods.items()):
        hit = {3: [], 5: [], 10: []}
        rec10 = []
        for it in BENCH["T4"]:
            ref = set(REFERENCE[it["topic_id"]])
            ranked = eng.popular(10) if w is None else eng.search(it["topic"], k=10, w=w)
            for k in hit:
                hit[k].append(bool(ref & set(ranked[:k])))
            rec10.append(len(ref & set(ranked)) / len(ref))
        ci = {k: boot_prop(v) for k, v in hit.items()}
        out[name] = {f"hit{k}": sum(v) for k, v in hit.items()} | {f"hit{k}_ci": ci[k] for k in hit} | {"recall10": float(np.mean(rec10))}
        print(f"{name:14s} " + " ".join(f"{sum(hit[k]):5d} " for k in (3, 5, 10)) + f"  {np.mean(rec10):.3f}")
    (RET / "results_questions.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
