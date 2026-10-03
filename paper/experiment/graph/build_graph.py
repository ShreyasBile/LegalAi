"""Build the citation graph over every Supreme Court judgment with downloaded text.

    python graph/build_graph.py [workers]

Writes graph/units.jsonl (every distinct (judgment, citation) pair with its resolution tier), graph/edges.jsonl (the resolved
ones: src, dst, tier, kind) and graph/done_ids.txt (restart marker).
"""
import json, sys, time
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from graph.citextract import process_doc
from retrieval.common import read_text

G = Path(__file__).resolve().parent
_ix = _cache = None


def init():
    global _ix, _cache
    _ix, _cache = SCIndex(), {}


def work(i):
    t = read_text(i)
    if t is None:
        return i, None
    return i, process_doc(_ix, i, t, _cache)


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    ids = sorted(int(p.name.split(".")[0]) for p in (ROOT / "corpus" / "text").glob("*.txt.gz"))
    done_f = G / "done_ids.txt"
    done = set(map(int, done_f.read_text().split())) if done_f.exists() else set()
    todo = [i for i in ids if i not in done]
    print(f"{len(ids)} texts, {len(done)} already processed, {len(todo)} to do", flush=True)
    t0, n, nu = time.time(), 0, 0
    with (G / "units.jsonl").open("a", encoding="utf-8") as uf, (G / "edges.jsonl").open("a", encoding="utf-8") as ef, \
            done_f.open("a") as df, Pool(workers, initializer=init) as pool:
        for i, units in pool.imap_unordered(work, todo, chunksize=16):
            if units is None:
                continue
            for u in units:
                uf.write(json.dumps(u, ensure_ascii=False) + "\n")
                if u["dst"] is not None:
                    ef.write(json.dumps({"src": u["src"], "dst": u["dst"], "tier": u["tier"], "kind": u["kind"]}) + "\n")
            df.write(f"{i}\n")
            n += 1
            nu += len(units)
            if n % 1000 == 0:
                for f in (uf, ef, df):
                    f.flush()
                print(f"{n}/{len(todo)}  {nu} units  {time.time() - t0:.0f}s", flush=True)
    print(f"finished: {n} judgments, {nu} units, {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
