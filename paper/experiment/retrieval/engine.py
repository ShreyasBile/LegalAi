"""Retrieval over the Supreme Court judgments: BM25 and dense (bge-m3) search over title + headnote, and a citation prior.

Scores of the candidates (union of the top-N of each retriever) are z-normalised per query and combined:
    score = w_bm25 * z(bm25) + w_dense * z(cosine) + w_prior * z(log(1 + citations received))
The prior is the number of judgments that cite the candidate; for evaluation on a judgment decided on date T it counts only
citations from judgments decided before T ('as of T'), so nothing from the future leaks into it.
"""
import bisect, json, re, sys
from datetime import date
from pathlib import Path

import numpy as np
import psycopg2
import requests
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import DSN

RET = Path(__file__).resolve().parent
OLLAMA = "http://127.0.0.1:11435"
K1, B = 1.2, 0.75
POOL = 300


def ordinal(iso):
    y, m, d = map(int, iso.split("-"))
    return date(y, m, d).toordinal()


class Engine:
    def __init__(self, edges_path=None):
        cur = psycopg2.connect(DSN).cursor()
        cur.execute("select id, title, decision_date::text, citation, neutral_citation from case_laws where source='aws-sc' order by id")
        rows = cur.fetchall()
        self.meta = {r[0]: {"title": r[1], "date": r[2], "scr": r[3], "neutral": r[4], "ord": ordinal(r[2])} for r in rows if r[2]}
        heads = {}
        for l in (RET / "headnotes.jsonl").read_text(encoding="utf-8").splitlines():
            o = json.loads(l)
            heads[o["id"]] = o["headnote"]
        embs = {}
        for f in sorted((RET / "emb").glob("shard_*.npz")):
            z = np.load(f)
            for i, e in zip(z["ids"].tolist(), z["emb"]):
                embs[i] = e
        self.ids = sorted(i for i in self.meta if i in heads and i in embs)
        self.pos = {i: k for k, i in enumerate(self.ids)}
        self.head = {i: heads[i] for i in self.ids}
        self.E = np.stack([embs[i] for i in self.ids]).astype(np.float32)
        self.dates = np.asarray([self.meta[i]["ord"] for i in self.ids])
        docs = [f"{self.meta[i]['title']} {self.head[i]}" for i in self.ids]
        self.vec = CountVectorizer(lowercase=True, stop_words="english", token_pattern=r"(?u)\b[a-z][a-z]{2,}\b",
                                   ngram_range=(1, 2), min_df=3, dtype=np.float32)
        X = self.vec.fit_transform(docs).tocsr()
        n = X.shape[0]
        df = np.bincount(X.indices, minlength=X.shape[1])
        idf = np.log(1 + (n - df + 0.5) / (df + 0.5)).astype(np.float32)
        dl = np.asarray(X.sum(axis=1)).ravel()
        denom = X.copy()
        rows_idx = np.repeat(np.arange(n), np.diff(X.indptr))
        denom.data = X.data + K1 * (1 - B + B * dl[rows_idx] / dl.mean())
        W = X.copy()
        W.data = X.data * (K1 + 1) / denom.data * idf[X.indices]
        self.W = W.tocsr()
        self.prior_total = np.zeros(n, dtype=np.float32)
        self.cited_by = {}
        if edges_path is not None:
            self.load_edges(edges_path)
        self._qcache = {}

    # ---- citation prior -------------------------------------------------------------------------------------
    def load_edges(self, path):
        cited = {}
        for l in Path(path).read_text(encoding="utf-8").splitlines():
            e = json.loads(l)
            if e["dst"] is not None and e["src"] in self.meta and e["dst"] in self.pos:
                cited.setdefault(e["dst"], set()).add(e["src"])
        self.cited_by = {d: sorted(self.meta[s]["ord"] for s in srcs) for d, srcs in cited.items()}
        for d, v in self.cited_by.items():
            self.prior_total[self.pos[d]] = len(v)

    def indeg(self, doc_id, asof=None):
        v = self.cited_by.get(doc_id, [])
        return len(v) if asof is None else bisect.bisect_left(v, asof)

    # ---- retrievers -----------------------------------------------------------------------------------------
    def embed_query(self, text):
        if text not in self._qcache:
            r = requests.post(f"{OLLAMA}/api/embed", json={"model": "bge-m3", "input": [text], "keep_alive": "30m"}, timeout=300)
            r.raise_for_status()
            e = np.asarray(r.json()["embeddings"][0], dtype=np.float32)
            self._qcache[text] = e / np.linalg.norm(e)
        return self._qcache[text]

    def bm25(self, text):
        q = self.vec.transform([text])
        q.data[:] = 1.0
        return np.asarray((self.W @ q.T).todense()).ravel()

    def dense(self, text):
        return self.E @ self.embed_query(text)

    def features(self, text, asof=None, exclude=None):
        """candidates for a query (union of the top POOL of BM25 and dense) with z-normalised BM25, dense and prior scores"""
        allowed = np.ones(len(self.ids), dtype=bool) if asof is None else self.dates < asof
        if exclude is not None and exclude in self.pos:
            allowed[self.pos[exclude]] = False
        s_b, s_d = self.bm25(text), self.dense(text)
        cand = set()
        for s in (s_b, s_d):
            m = np.where(allowed, s, -1e9)
            cand.update(np.argpartition(-m, min(POOL, len(m) - 1))[:POOL].tolist())
        cand = np.asarray(sorted(c for c in cand if allowed[c]))
        z = lambda v: (v - v.mean()) / (v.std() + 1e-9)
        pr = np.log1p(np.asarray([self.indeg(self.ids[c], asof) for c in cand], dtype=np.float32))
        return {"ids": [self.ids[c] for c in cand], "b": z(s_b[cand]), "d": z(s_d[cand]), "p": z(pr)}

    @staticmethod
    def rank(f, w=(1.0, 1.0, 0.0), k=10):
        score = w[0] * f["b"] + w[1] * f["d"] + w[2] * f["p"]
        order = np.argsort(-score, kind="stable")[:k]
        return [f["ids"][o] for o in order]

    def popular(self, k=10, asof=None, exclude=None):
        """the k most-cited judgments decided before `asof` (popularity baseline)"""
        allowed = np.ones(len(self.ids), dtype=bool) if asof is None else self.dates < asof
        if exclude is not None and exclude in self.pos:
            allowed[self.pos[exclude]] = False
        if asof is None:
            pr = self.prior_total
        else:
            pr = np.asarray([self.indeg(i, asof) for i in self.ids], dtype=np.float32)
        m = np.where(allowed, pr, -1.0)
        return [self.ids[j] for j in np.argsort(-m, kind="stable")[:k]]

    def search(self, text, k=10, w=(1.0, 1.0, 0.0), asof=None, exclude=None):
        return self.rank(self.features(text, asof, exclude), w, k)
