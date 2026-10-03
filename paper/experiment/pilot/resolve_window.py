"""Pilot: a resolver that tolerates OCR noise -- it matches judgments against the words in the text window before a citation
instead of a parsed 'X v. Y' name.

For each citation (year y): candidates are judgments decided (or reported) within one year of y whose rare title words occur
in the window (exact, or a spelling variant of 5+ letters); score = share of the judgment's title weight (IDF) found in the
window. A judgment is chosen if the score >= MIN_RECALL and a distinctive word matched; if two different judgments are within
TIE of the best score the mention is 'ambiguous' and gives no edge.

Developed on the 70 reference judgments only; accuracy is reported on the 432 random judgments (run with --test).
"""
import json, re, sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from citebench.index import SCIndex, tokens, FUZZY
from citebench.verifier import near_year
from citations import find_cites

PILOT = Path(__file__).resolve().parent
MIN_RECALL = 0.7
TIE = 0.05
RARE_DF = 300          # window words this rare generate candidates
ANCHOR_DF = 100        # a matched word this rare anchors the match
EXTRA_STOP = {"miss", "late", "minor", "etc", "thr", "through"}     # honorifics / fillers that citations leave out


def window_tokens(text, start, prev_end):
    seg = text[max(prev_end, start - 220):start]
    return set(tokens(seg))


def resolve(ix, y, win):
    cand = {}
    look = set()
    for t in win:
        if len(ix.postings.get(t, ())) <= RARE_DF:
            look.add(t)
        elif t not in ix.idf and len(t) >= 5:
            look.update(ix.similar_words(t))
    for t in look:
        for r in ix.postings.get(t, ()):
            if near_year(r, y):
                cand[r.id] = r
    scored = []
    wl = [w for w in win if len(w) >= 5]
    for r in cand.values():
        rt = r.toks - EXTRA_STOP
        tot = ix.w(rt)
        if not tot:
            continue
        got, anchored = 0.0, False
        for t in rt:
            ok = t in win
            if not ok and len(t) >= 5:
                ok = any(SequenceMatcher(None, t, w).ratio() >= FUZZY for w in wl)
            if not ok and len(t) >= 3:
                ok = any(len(w) >= len(t) + 3 and t in w for w in wl)       # 'ujjam bai' written 'ujjambai'
            if ok:
                got += ix.idf.get(t, ix.idf_unknown)
                anchored = anchored or len(ix.postings.get(t, ())) <= ANCHOR_DF
        if anchored and got / tot >= MIN_RECALL:
            scored.append((got / tot, r))
    if not scored:
        return None, "none", 0
    scored.sort(key=lambda x: (-x[0], x[1].id))
    best = scored[0]
    rivals = {r.toks for s, r in scored if s >= best[0] - TIE}
    if len(rivals) > 1:
        return None, "ambiguous", len(rivals)
    return best[1], "ok", 1


def main(test):
    ix = SCIndex()
    from citebench.verifier import rows_for_citation
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    docs = [it for it in sample if (it["stratum"] != "reference") == test]
    units = {}          # (doc, cite key) -> outcomes of every occurrence
    for it in docs:
        text = re.sub(r"\s+", " ", (PILOT / "text" / f"{it['id']}.txt").read_text(encoding="utf-8"))
        text = re.sub(r"(\w)- (\w)", r"\1\2", text)
        cites = [c for c in find_cites(text) if c["kind"] != "air_other"]
        prev_end = 0
        for i, c in enumerate(cites):
            before = window_tokens(text, c["start"], prev_end)
            nxt = cites[i + 1]["start"] if i + 1 < len(cites) else len(text)
            after = set(tokens(text[c["end"]:min(nxt, c["end"] + 170)]))
            prev_end = c["end"]
            key = (it["id"], c["kind"], c["norm"] or re.sub(r"\W", "", c["raw"].lower()))
            u = units.setdefault(key, {"doc": it["id"], "kind": c["kind"], "raw": c["raw"], "year": c["year"], "rows": set(), "amb": False,
                                       "gt": [r.id for r in rows_for_citation(ix, c["norm"])[1]] if c["kind"] in ("scr", "insc") else None})
            for win in (before, after):                      # the name usually precedes the citation; in lists it may follow it
                if not win:
                    continue
                row, status, n = resolve(ix, c["year"], win)
                if status == "ok":
                    u["rows"].add(row.id)
                    break
                u["amb"] = u["amb"] or status == "ambiguous"
    res = []
    for u in units.values():
        if len({ix.by_id[i].toks for i in u["rows"]}) == 1:
            status, row = "ok", sorted(u["rows"])[0]
        elif u["rows"]:
            status, row = "conflict", None
        else:
            status, row = ("ambiguous" if u["amb"] else "none"), None
        res.append({"doc": u["doc"], "kind": u["kind"], "raw": u["raw"], "year": u["year"], "status": status, "row": row, "gt": u["gt"]})
    out = PILOT / ("window_test.jsonl" if test else "window_dev.jsonl")
    out.write_text("\n".join(json.dumps(r) for r in res), encoding="utf-8")

    print(f"{'TEST (random judgments)' if test else 'DEV (reference judgments)'}: {len(docs)} judgments, {len(res)} distinct (judgment, citation) pairs")
    N = [r for r in res if r["kind"] in ("scr", "insc") and r["gt"]]
    st = Counter()
    for r in N:
        gtr = [ix.by_id[i] for i in r["gt"]]
        if r["status"] != "ok":
            st[r["status"]] += 1
        elif r["row"] in r["gt"] or any(ix.by_id[r["row"]].toks == g.toks for g in gtr):
            st["agree"] += 1
        else:
            st["wrong"] += 1
    n = len(N)
    print(f"  S.C.R./neutral pairs whose number is in the index: {n}")
    print("  window resolver vs the number:", {k: f"{v} ({100 * v / n:.1f}%)" for k, v in st.items()})
    print(f"  precision when it resolves: {100 * st['agree'] / max(1, st['agree'] + st['wrong']):.1f}%;  recall: {100 * st['agree'] / n:.1f}%")
    S = [r for r in res if r["kind"] in ("scc", "air")]
    ss = Counter(r["status"] for r in S)
    print(f"  SCC/AIR pairs: {len(S)}: " + ", ".join(f"{k} {v} ({100 * v / len(S):.0f}%)" for k, v in ss.items()))
    return res


if __name__ == "__main__":
    main("--test" in sys.argv)
