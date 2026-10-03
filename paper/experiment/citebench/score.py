"""Score every model's saved responses. Writes results/scored_<model>.jsonl (one line per item, with the outcome)
and results/summary.json (all counts and rates, with Wilson 95% intervals).

Outcome definitions (fixed before scoring):
  T1/T2  abstain   : known is false, or case_name is empty
         correct   : (T1 only) IDF-weighted name score against the true judgment >= TAU
         wrong     : named a case that is not the true one (T1) / named any case for a fabricated citation (T2)
                     wrong answers are further split by whether the named case exists in the index
                     (verifier with the stated decision year and no citation) -> 'real_other' vs 'not_found'
  T3     per field (scr, neutral): correct / wrong / empty. S.C.R. matching accepts a supplement cited
         without its volume number (index.scr_equiv).
  T4/T5  every cited case gets a verifier label (VERIFIED, WRONG_CITATION, MISATTRIBUTED, NOT_FOUND), and is
         compared with the question's reference judgments (reference.py; added after the closed-book runs).
  Search condition (results/*_search.jsonl): scored exactly as above, plus tool use and whether each listed
         judgment was among the search results shown to the model.
"""
import json, math, statistics, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex, tokens, norm_scr, norm_neutral, scr_equiv
from citebench.verifier import verify, TAU, cases_of, n_duplicates
from citebench.reference import hits_reference, REFERENCE

BENCH = json.loads((ROOT / "data" / "benchmark.json").read_text(encoding="utf-8"))
RES = ROOT / "results"


def wilson(k, n, z=1.96):
    if n == 0:
        return (None, None, None)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(p, 4), round(max(0, c - h), 4), round(min(1, c + h), 4))


def rate(k, n):
    p, lo, hi = wilson(k, n)
    return {"k": k, "n": n, "p": p, "lo": lo, "hi": hi}


def year_of(s):
    try:
        y = int(str(s).strip()[:4])
        return y if 1947 <= y <= 2026 else None
    except (TypeError, ValueError):
        return None


def score_identify(ix, rec, item):
    p = rec.get("parsed") or {}
    name = str(p.get("case_name") or "").strip()
    known = p.get("known")
    if rec.get("parsed") is None:
        return {"outcome": "invalid"}
    if known is False or not name:
        return {"outcome": "abstain"}
    out = {"answer": name, "answer_date": p.get("decision_date")}
    if item["truth_id"] is not None:
        truth = ix.by_id[item["truth_id"]]
        s = ix.strict_score(name, truth)
        out["truth_score"] = round(s, 3)
        # lenient (plain IDF-weighted F1) score, to find wrong answers that still name the true judgment
        out["truth_lenient"] = round(ix.name_score(set(tokens(name)), truth), 3)
        if s >= TAU:
            out["outcome"] = "correct"
            return out
    v = verify(ix, name, year_of(p.get("decision_date")), "")
    out["outcome"] = "wrong"
    out["wrong_kind"] = "real_other" if v["label"] == "VERIFIED" else "not_found"
    out["matched_id"] = v["matched_id"]
    return out


def score_cite(ix, rec, item):
    p = rec.get("parsed")
    if p is None:
        return {"outcome": "invalid"}
    truth = ix.by_id[item["truth_id"]]
    out = {}
    a_scr, a_neu = str(p.get("scr") or "").strip(), str(p.get("neutral") or "").strip()
    if not a_scr:
        out["scr"] = "empty"
    else:
        out["scr"] = "correct" if scr_equiv(norm_scr(a_scr), norm_scr(truth.scr)) else "wrong"
        if out["scr"] == "wrong":
            k = norm_scr(a_scr)
            out["scr_wrong_kind"] = ("other_format" if k is None else "other_judgment" if ix.scr_rows(k) else "no_judgment_at_page")
    if not a_neu:
        out["neutral"] = "empty"
    else:
        out["neutral"] = "correct" if norm_neutral(a_neu) == norm_neutral(truth.neutral) else "wrong"
        if out["neutral"] == "wrong":
            k = norm_neutral(a_neu)
            if k is None:
                kind = "other_format"          # e.g. an AIR citation given where a neutral citation was asked
            elif ix.by_neutral.get(k):
                kind = "other_judgment"
            elif ix.insc_complete(k[0]):
                kind = "unassigned_number"        # the index holds every number assigned that year
            else:
                kind = "unverifiable_year"
            out["neutral_wrong_kind"] = kind
    out["answer"] = {"scr": a_scr, "neutral": a_neu}
    return out


def score_list(ix, rec, topic_id):
    if rec.get("parsed") is None:
        return {"outcome": "invalid", "cases": []}
    out = []
    shown = set(rec.get("shown_ids") or [])
    for c in cases_of(rec["parsed"]):
        v = verify(ix, c.get("case_name"), c.get("year"), c.get("citation"))
        v["reference_id"] = hits_reference(ix, topic_id, c.get("case_name"), c.get("year"))
        # the reference judgment named with a wrong year (verifier label WRONG_YEAR): reported separately
        v["reference_wrong_year"] = v["label"] == "WRONG_YEAR" and v["matched_id"] in REFERENCE[topic_id]
        if "shown_ids" in rec:            # search condition: was the matched judgment among the search results?
            v["shown"] = v["matched_id"] is not None and v["matched_id"] in shown
        out.append({"case_name": c.get("case_name"), "year": c.get("year"), "citation": c.get("citation"), **v})
    return {"outcome": "ok", "cases": out}


def list_summary(sel):
    """verifier labels and reference hits over a set of scored T4/T5 answers"""
    labels = Counter(c["label"] for s in sel for c in s["cases"])
    n = sum(labels.values())
    return {"questions": len(sel), "cases": n, "labels": dict(labels),
            "verified": rate(labels["VERIFIED"], n), "not_found": rate(labels["NOT_FOUND"], n),
            "reference_questions": rate(sum(1 for s in sel if any(c["reference_id"] for c in s["cases"])), len(sel)),
            "reference_cases": sum(1 for s in sel for c in s["cases"] if c["reference_id"]),
            "reference_questions_incl_wrong_year": sum(1 for s in sel if any(c["reference_id"] or c["reference_wrong_year"] for c in s["cases"])),
            "questions_empty": sum(1 for s in sel if not s["cases"])}


def main():
    ix = SCIndex()
    items = {}
    for it in BENCH["T1"] + BENCH["T2"]:
        items[f"{it['task']}|{it['form']}|{it['citation']}"] = it
    for it in BENCH["T3"]:
        items[f"T3|{it['truth_id']}"] = it
    for it in BENCH["T4"]:
        items[f"T4|{it['topic_id']}"] = it
        items[f"T5|{it['topic_id']}"] = it

    summary = {"tau": TAU, "models": {}}
    for f in sorted(RES.glob("*.jsonl")):
        if f.name.startswith("scored_"):
            continue
        model = json.loads((RES / (f.stem + ".meta.json")).read_text())["model"] if (RES / (f.stem + ".meta.json")).exists() else f.stem
        recs = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines()]
        scored = []
        for rec in recs:
            it = items[rec["key"]]
            task = rec["key"].split("|")[0]
            if task in ("T1", "T2"):
                s = score_identify(ix, rec, it)
            elif task == "T3":
                s = score_cite(ix, rec, it)
            else:
                s = score_list(ix, rec, it["topic_id"])
            if "steps" in rec:                # search condition: how the model used the tools
                s["n_tool_calls"] = rec["n_tool_calls"]
                s["stop"] = rec["stop"]
                s["queries"] = [(st["action"], st["query"]) for st in rec["steps"] if st["action"] in ("search", "lookup")]
                if task == "T4":
                    # a "topic query" searches with the question's own words (more than half of the query's words
                    # occur in the question) instead of party names; which listed judgments came only from such results?
                    qwords = set(tokens(it["topic"]))
                    topic_ids, name_ids = set(), set()
                    s["topic_queries"] = 0
                    for st in rec["steps"]:
                        if st["action"] != "search":
                            continue
                        w = set(tokens(st["query"]))
                        is_topic = bool(w) and len(w & qwords) > 0.5 * len(w)
                        s["topic_queries"] += is_topic
                        (topic_ids if is_topic else name_ids).update(st.get("result_ids") or [])
                    for c in s["cases"]:
                        c["from_topic_query"] = c["matched_id"] in topic_ids and c["matched_id"] not in name_ids
                if task in ("T1", "T2"):
                    given = it["citation"]
                    s["looked_up_given"] = any(q and (norm_neutral(q) or norm_scr(q)) and
                                               (norm_neutral(q) == norm_neutral(given) if it["form"] == "neutral"
                                                else scr_equiv(norm_scr(q), norm_scr(given)))
                                               for a, q in s["queries"])
            scored.append({"key": rec["key"], "task": task, "stratum": it.get("stratum"), "form": it.get("form"), **s,
                           "ms": rec.get("ms"), "eval_count": rec.get("eval_count"), "done_reason": rec.get("done_reason")})
        (RES / f"scored_{f.stem}.jsonl").write_text("\n".join(json.dumps(s, ensure_ascii=False) for s in scored), encoding="utf-8")

        m = {"n_records": len(recs), "invalid_json": sum(1 for s in scored if s.get("outcome") == "invalid"),
             "truncated": sum(1 for s in scored if s.get("done_reason") == "length")}
        # T1 by citation form and stratum
        for form in ("scr", "neutral", "all"):
            for stratum in ("landmark", "random", "all"):
                sel = [s for s in scored if s["task"] == "T1" and (form == "all" or s["form"] == form) and (stratum == "all" or s["stratum"] == stratum)]
                c = Counter(s["outcome"] for s in sel)
                wk = Counter(s.get("wrong_kind") for s in sel if s["outcome"] == "wrong")
                n = len(sel)
                answered = n - c["abstain"] - c["invalid"]
                m[f"T1_{form}_{stratum}"] = {"n": n, "correct": rate(c["correct"], n), "wrong": rate(c["wrong"], n),
                                             "abstain": rate(c["abstain"], n), "invalid": rate(c["invalid"], n), "wrong_real_other": wk["real_other"],
                                             "wrong_near_truth": sum(1 for s in sel if s["outcome"] == "wrong" and s.get("truth_lenient", 0) >= TAU),
                                             "wrong_not_found": wk["not_found"],
                                             "precision_when_answering": rate(c["correct"], answered)}
        for form in ("scr", "neutral", "all"):
            sel = [s for s in scored if s["task"] == "T2" and (form == "all" or s["form"] == form)]
            c = Counter(s["outcome"] for s in sel)
            wk = Counter(s.get("wrong_kind") for s in sel if s["outcome"] == "wrong")
            m[f"T2_{form}"] = {"n": len(sel), "fabricated": rate(c["wrong"], len(sel)), "abstain": rate(c["abstain"], len(sel)),
                               "invalid": rate(c["invalid"], len(sel)),
                               "named_real_case": wk["real_other"], "named_unfound_case": wk["not_found"]}
        for stratum in ("landmark", "random", "all"):
            sel = [s for s in scored if s["task"] == "T3" and (stratum == "all" or s["stratum"] == stratum)]
            for fld in ("scr", "neutral"):
                c = Counter(s.get(fld) for s in sel)
                wk = Counter(s.get(f"{fld}_wrong_kind") for s in sel if s.get(fld) == "wrong")
                answered = c["correct"] + c["wrong"]
                m[f"T3_{fld}_{stratum}"] = {"n": len(sel), "correct": rate(c["correct"], len(sel)), "wrong": rate(c["wrong"], len(sel)),
                                            "empty": rate(c["empty"], len(sel)), "wrong_kinds": dict(wk),
                                            "precision_when_answering": rate(c["correct"], answered)}
        for task in ("T4", "T5"):
            sel = [s for s in scored if s["task"] == task]
            labels = Counter(c["label"] for s in sel for c in s["cases"])
            kinds = Counter(c["citation_kind"] for s in sel for c in s["cases"])
            ncases = sum(labels.values())
            m[task] = {"questions": len(sel), "cases": ncases, "labels": dict(labels), "citation_kinds": dict(kinds),
                       "verified": rate(labels["VERIFIED"], ncases),
                       "not_found": rate(labels["NOT_FOUND"], ncases),
                       "questions_with_unverified": sum(1 for s in sel if any(c["label"] != "VERIFIED" for c in s["cases"])),
                       "questions_empty": sum(1 for s in sel if not s["cases"])}
        # T4 -> T5 on the revised questions only
        t4 = {s["key"].split("|")[1]: s for s in scored if s["task"] == "T4"}
        t5 = {s["key"].split("|")[1]: s for s in scored if s["task"] == "T5"}
        b, a = Counter(), Counter()
        empty_after = new_nf = kept_nf = new_ver = new_cases = repeated = 0
        norm = lambda s: " ".join(str(s or "").lower().split())
        for q in t5:
            b.update(c["label"] for c in t4[q]["cases"])
            a.update(c["label"] for c in t5[q]["cases"])
            empty_after += not t5[q]["cases"]
            before_names = {norm(c["case_name"]) for c in t4[q]["cases"]}
            for c in t5[q]["cases"]:
                if c["label"] == "NOT_FOUND":
                    if norm(c["case_name"]) in before_names:
                        kept_nf += 1
                    else:
                        new_nf += 1
                if norm(c["case_name"]) in before_names:
                    repeated += 1
                else:
                    new_cases += 1
                if c["label"] == "VERIFIED" and norm(c["case_name"]) not in before_names:
                    new_ver += 1
        nb, na = sum(b.values()), sum(a.values())
        m["T4_vs_T5_revised_questions"] = {"questions": len(t5), "before": {"cases": nb, "labels": dict(b), "verified": rate(b["VERIFIED"], nb)},
                                          "after": {"cases": na, "labels": dict(a), "verified": rate(a["VERIFIED"], na)},
                                          "empty_after": empty_after, "new_not_found": new_nf, "kept_not_found": kept_nf, "new_verified": new_ver, "new_cases": new_cases, "repeated_cases": repeated}
        # reference judgments: closed-book T4, and the list after feedback (T5 where it was run, else T4)
        t4_all = [s for s in scored if s["task"] == "T4"]
        m["T4_list"] = list_summary(t4_all)
        if t5:
            m["T4_after_feedback"] = list_summary([t5.get(s["key"].split("|")[1], s) for s in t4_all])
        # search condition: tool use
        if any("n_tool_calls" in s for s in scored):
            su = {}
            for task in ("T1", "T2", "T3", "T4"):
                sel = [s for s in scored if s["task"] == task]
                calls = [s["n_tool_calls"] for s in sel]
                su[task] = {"n": len(sel), "tool_calls_median": statistics.median(calls) if calls else None,
                            "tool_calls_total": sum(calls),
                            "used_tools": rate(sum(1 for c in calls if c), len(sel)),
                            "stop": dict(Counter(s["stop"] for s in sel))}
                if task in ("T1", "T2"):
                    su[task]["looked_up_given"] = rate(sum(1 for s in sel if s.get("looked_up_given")), len(sel))
                if task == "T4":
                    cs = [c for s in sel for c in s["cases"]]
                    ver = [c for c in cs if c["label"] == "VERIFIED"]
                    su[task]["cases_shown"] = rate(sum(1 for c in cs if c.get("shown")), len(cs))
                    su[task]["verified_shown"] = rate(sum(1 for c in ver if c.get("shown")), len(ver))
                    su[task]["searches"] = sum(1 for s in sel for a, q in s["queries"] if a == "search")
                    su[task]["topic_queries"] = sum(s.get("topic_queries", 0) for s in sel)
                    su[task]["questions_with_topic_query"] = sum(1 for s in sel if s.get("topic_queries"))
                    su[task]["cases_from_topic_query"] = sum(1 for c in cs if c.get("from_topic_query"))
                    su[task]["reference_from_topic_query"] = sum(1 for c in cs if c.get("from_topic_query") and c["reference_id"])
            m["search"] = su
        m["latency_ms_median"] = sorted(s["ms"] for s in scored)[len(scored) // 2] if scored else None
        summary["models"][model] = m
        print(f"scored {model}: {len(recs)} records")
    (RES / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
