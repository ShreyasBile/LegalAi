"""Time the verifier on every case cited in T4 by the four main models (in-memory index, one process) -> data/verifier_timing.json"""
import json, statistics, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from citebench.verifier import verify

t0 = time.perf_counter()
ix = SCIndex()
load_s = time.perf_counter() - t0
cases = []
for m in ["llama3.1_8b", "qwen3_8b", "gemma3_4b", "qwen2.5vl_7b"]:
    for l in (ROOT / "results" / f"scored_{m}.jsonl").read_text(encoding="utf-8").splitlines():
        r = json.loads(l)
        if r["task"] == "T4":
            cases += [(c["case_name"], c["year"], c["citation"]) for c in r["cases"]]
ms = []
for n, y, c in cases:
    t = time.perf_counter()
    verify(ix, n, y, c)
    ms.append(1000 * (time.perf_counter() - t))
out = {"cases": len(cases), "index_load_s": round(load_s, 2), "median_ms": round(statistics.median(ms), 1),
       "p95_ms": round(sorted(ms)[int(0.95 * len(ms)) - 1], 1), "max_ms": round(max(ms), 1)}
(ROOT / "data" / "verifier_timing.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
print(out)
