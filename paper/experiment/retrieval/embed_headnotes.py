"""Embed the headnote of every Supreme Court judgment with bge-m3 (Ollama, GPU) and store unit vectors (float16).

Runs alongside the corpus download: it embeds each judgment as soon as its text file exists and exits when every judgment is
done or the download has finished without producing the rest. Resumable (existing shards are skipped).
    OLLAMA on 127.0.0.1:11435 must have bge-m3.
Writes retrieval/emb/shard_XXXXX.npz (ids, emb) and retrieval/headnotes.jsonl (id, headnote).
"""
import json, sys, time
from pathlib import Path

import numpy as np
import psycopg2
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import DSN
from retrieval.common import TEXT, read_text, headnote

OUT = Path(__file__).resolve().parent / "emb"
HOST = "http://127.0.0.1:11435"
BATCH, SHARD = 16, 1024


def embed(texts):
    for attempt in range(5):
        try:
            r = requests.post(f"{HOST}/api/embed", json={"model": "bge-m3", "input": texts, "keep_alive": "30m"}, timeout=600)
            r.raise_for_status()
            e = np.asarray(r.json()["embeddings"], dtype=np.float32)
            return e / np.linalg.norm(e, axis=1, keepdims=True)
        except Exception as ex:
            print("embed retry:", type(ex).__name__, flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("embedding failed")


def main():
    OUT.mkdir(exist_ok=True)
    cur = psycopg2.connect(DSN).cursor()
    cur.execute("select id from case_laws where source='aws-sc' order by id")
    ids = [r[0] for r in cur.fetchall()]
    done = set()
    for f in OUT.glob("shard_*.npz"):
        done.update(np.load(f)["ids"].tolist())
    heads_path = Path(__file__).resolve().parent / "headnotes.jsonl"
    seen_heads = set()
    if heads_path.exists():
        seen_heads = {json.loads(l)["id"] for l in heads_path.read_text(encoding="utf-8").splitlines()}
    print(f"{len(ids)} judgments, {len(done)} already embedded", flush=True)
    shard_n = len(list(OUT.glob("shard_*.npz")))
    buf_ids, buf_emb, t0, total = [], [], time.time(), 0
    hf = heads_path.open("a", encoding="utf-8")

    def flush():
        nonlocal buf_ids, buf_emb, shard_n
        if buf_ids:
            np.savez(OUT / f"shard_{shard_n:05d}.npz", ids=np.asarray(buf_ids), emb=np.concatenate(buf_emb).astype(np.float16))
            shard_n += 1
            buf_ids, buf_emb = [], []

    while True:
        todo = [i for i in ids if i not in done]
        if not todo:
            break
        ready = [i for i in todo if (TEXT / f"{i}.txt.gz").exists()]
        if not ready:
            mf = Path(__file__).resolve().parents[1] / "corpus" / "manifest.jsonl"
            # distinct judgments the download has attempted (a restarted download logs finished ones again as 'cached')
            finished = len({json.loads(l)["id"] for l in mf.open()}) if mf.exists() else 0
            if finished >= len(ids):                       # the download has gone through every judgment
                print(f"{len(todo)} judgments have no text; stopping", flush=True)
                break
            time.sleep(30)
            continue
        for k in range(0, len(ready), BATCH):
            chunk = ready[k:k + BATCH]
            heads = [headnote(read_text(i)) for i in chunk]
            for i, h in zip(chunk, heads):
                if i not in seen_heads:
                    hf.write(json.dumps({"id": i, "headnote": h}, ensure_ascii=False) + "\n")
                    seen_heads.add(i)
            buf_emb.append(embed([h if h else "empty" for h in heads]))
            buf_ids += chunk
            done.update(chunk)
            total += len(chunk)
            if len(buf_ids) >= SHARD:
                flush(); hf.flush()
                print(f"{len(done)}/{len(ids)}  {total / (time.time() - t0):.1f}/s", flush=True)
    flush(); hf.close()
    print("embedding finished:", len(done), flush=True)


if __name__ == "__main__":
    main()
