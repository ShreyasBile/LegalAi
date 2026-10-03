"""Generate the paper's numbers (numbers.tex) and tables (tab_*.tex) from the saved results.
Nothing numeric in the paper is typed by hand: every figure below is read from data/corpus_stats.json,
results/summary.json, results/*.meta.json, data/audit_labels.json and the latency benchmark JSON."""
import json, math, sys
from statistics import median
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPER = ROOT.parent / "ieee"
DATA = ROOT.parent / "data"
RES = ROOT / "results"
sys.path.insert(0, str(ROOT))
from citebench.index import tokens
from citebench.reference import REFERENCE

MODEL_ORDER = ["llama3.1:8b", "qwen3:8b", "qwen3:8b+think", "gemma3:4b", "qwen2.5vl:7b"]
DISPLAY = {"llama3.1:8b": "Llama 3.1 8B", "qwen3:8b": "Qwen3 8B", "qwen3:8b+think": "Qwen3 8B think",
           "gemma3:4b": "Gemma 3 4B", "qwen2.5vl:7b": "Qwen2.5-VL 7B"}
CITE = {"llama3.1:8b": "llama3", "qwen3:8b": "qwen3", "qwen3:8b+think": "qwen3", "gemma3:4b": "gemma3", "qwen2.5vl:7b": "qwen25vl"}

num = lambda n: f"{n:,}".replace(",", "{,}")                         # 19{,}319{,}963 (LaTeX-safe thousands)
def tex_escape(s):
    return "".join({"&": "\\&", "%": "\\%", "$": "\\$", "#": "\\#", "_": "\\_", "{": "\\{", "}": "\\}"}.get(c, c) for c in str(s))


def small(v, d):
    """format a percentage value; a non-zero value that would round to zero prints as '<0.1' (for d=1)"""
    return f"$<${10 ** -d:.{d}f}" if 0 < v < 0.5 * 10 ** -d else f"{v:.{d}f}"


def pct(k, n, d=1):
    return small(100 * k / n, d) + "\\%" if n else "--"


def rate_str(r, d=1):
    return small(100 * r["p"], d) if r["n"] else "--"


def main():
    M = {}
    cs = json.loads((DATA / "corpus_stats.json").read_text())
    mb = cs["mobile_by_court"]
    M.update({
        "CorpusTotal": num(cs["total"]), "CorpusSC": num(cs["sc"]), "CorpusHC": num(cs["hc"]), "CorpusCourts": str(cs["courts"]),
        "CorpusYearMin": str(cs["year_min"]), "CorpusYearMax": str(cs["year_max"]),
        "NoLink": num(cs["no_link"]), "LinkedPct": pct(cs["total"] - cs["no_link"], cs["total"]),
        "MobileTotal": num(cs["mobile_total"]), "MobilePct": pct(cs["mobile_total"], cs["total"]),
        "MobileRecentPct": pct(cs["mobile_recent"], cs["mobile_total"]),
        "MobileLinked": num(cs["mobile_linked"]), "MobileLinkedPct": pct(cs["mobile_linked"], cs["mobile_total"]),
        "MobileUnrecov": num(cs["mobile_total"] - cs["mobile_linked"]),
        "MPMobile": num(mb["23~23"]["mobile"]), "MPLinked": num(mb["23~23"]["linked"]),
        "CollideStems": num(cs["collide_stems"]), "CollideRows": num(cs["collide_rows"]),
        "CollideLost": num(cs["collide_rows"] - cs["collide_stems"]),
        "CollideDiffBothPct": pct(cs["collide_diff_both"], cs["collide_stems"]),
        "RecoveredChecked": num(sum(sum(v.values()) for v in cs["head_recovered"].values())),
        "UnresolvedChecked": num(sum(sum(v.values()) for v in cs["head_unresolved"].values())),
        "NonmobileChecked": num(cs["nonmobile_checked"]), "NonmobileCourts": str(cs["nonmobile_courts"]),
        "SCLinksChecked": num(cs["sc_links_checked"]),
        "PairsChecked": num(sum(cs["collision_pairs"].values())), "PairsDiffer": num(cs["collision_pairs"]["different_bytes"]),
        "SCwithNeutral": num(cs["sc_with_neutral"]), "SCSupp": num(cs["sc_supp"]), "SCSuppPct": pct(cs["sc_supp"], cs["sc"]),
        "SCYearNe": num(cs["sc_year_ne"]), "SCYearNePct": pct(cs["sc_year_ne"], cs["sc"]),
        "SCDupGroups": num(cs["sc_neutral_dup_groups"]), "SCDupRows": num(cs["sc_neutral_dup_rows"]),
        "INSCCompleteCount": str(len(cs["insc_complete_years"])),
    })
    inc = [y for y in cs["insc_incomplete_years"] if y <= 2013]
    M["INSCIncompleteList"] = ", ".join(map(str, inc[:-1])) + f" and {inc[-1]}"
    cov = cs["insc_coverage_2014_2026"]
    M["INSCCovMin"] = f"{100 * min(cov.values()):.0f}\\%"
    M["INSCCovMax"] = f"{100 * max(cov.values()):.0f}\\%"
    # sanity checks on the claims the text makes about these numbers
    assert cs["nonmobile_ok"] == cs["nonmobile_checked"] and cs["sc_links_ok"] == cs["sc_links_checked"]
    assert all(v == {"200": 150} for v in cs["head_recovered"].values())
    assert all(list(v.keys()) == ["absent (all 3 year folders 404)"] for v in cs["head_unresolved"].values())
    assert cs["collision_pairs"]["same_bytes"] == 0 and cs["collide_cnr_diff"] == cs["collide_stems"]
    assert all(v["nonmobile_unlinked"] == 0 for v in mb.values())
    assert min(inc) > 1950 and max(y for y in cs["insc_complete_years"]) == 2013

    # Table: mobile records
    names = {"27~1": "Bombay", "9~13": "Allahabad", "23~23": "Madhya Pradesh", "2~5": "Himachal Pradesh"}
    rows = []
    for code in sorted(mb, key=lambda c: -mb[c]["mobile"]):
        v = mb[code]
        rows.append(f"{names[code]} & {num(v['court_rows'])} & {num(v['mobile'])} & {num(v['linked'])} ({pct(v['linked'], v['mobile'])}) \\\\")
    tab = ["\\begin{tabular}{lrrr}", "\\toprule", "High Court & Records & Mobile & Linked after repair \\\\", "\\midrule", *rows,
           "\\midrule", f"All four & {num(sum(v['court_rows'] for v in mb.values()))} & {num(cs['mobile_total'])} & {num(cs['mobile_linked'])} ({pct(cs['mobile_linked'], cs['mobile_total'])}) \\\\",
           "\\bottomrule", "\\end{tabular}"]
    (PAPER / "tab_mobile.tex").write_text("\n".join(tab) + "\n", encoding="utf-8")

    bench = json.loads((ROOT / "data" / "benchmark.json").read_text(encoding="utf-8"))
    M.update({"NumJudgments": str(len(bench["judgments"])), "NumLandmark": str(sum(1 for j in bench["judgments"] if j["stratum"] == "landmark")),
              "NumRandom": str(sum(1 for j in bench["judgments"] if j["stratum"] == "random")),
              "NumTOne": str(len(bench["T1"])), "NumTTwo": str(len(bench["T2"])), "NumTThree": str(len(bench["T3"])), "NumTopics": str(len(bench["T4"])),
              "NumItems": str(len(bench["T1"]) + len(bench["T2"]) + len(bench["T3"]) + len(bench["T4"]))})

    S = json.loads((RES / "summary.json").read_text())["models"]
    models = [m for m in MODEL_ORDER if m in S]
    main_models = [m for m in models if not m.endswith("+think")]
    M["NumModels"] = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}[len(main_models)]

    # model table
    rows = []
    for m in models:
        meta_f = RES / (m.replace(":", "_").replace("+", "_") + ".meta.json")
        meta = json.loads(meta_f.read_text()) if meta_f.exists() else {"details": {}}
        d = meta.get("details") or {}
        rows.append(f"{DISPLAY[m]} \\cite{{{CITE[m]}}} & \\texttt{{{m.split('+')[0]}}} & {d.get('parameter_size', '?')} & \\texttt{{{(meta.get('digest') or '')[:8]}}} \\\\")
    (PAPER / "tab_models.tex").write_text("\n".join(["\\begin{tabular}{llrl}", "\\toprule", "Model & Ollama tag & Params & Digest \\\\", "\\midrule", *rows, "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # results tables T1/T2
    rows = []
    for m in models:
        s = S[m]
        t1 = s["T1_all_all"]; t2 = s["T2_all"]
        rows.append(f"{DISPLAY[m]} & {rate_str(t1['correct'])} & {rate_str(t1['wrong'])} & {rate_str(t1['abstain'])} & {rate_str(t1['invalid'])} & "
                    f"{rate_str(t2['fabricated'])} & {rate_str(t2['abstain'])} & {rate_str(t2['invalid'])} \\\\")
    (PAPER / "tab_t1t2.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrrrr}", "\\toprule",
        "& \\multicolumn{4}{c}{T1: real citation (\\%)} & \\multicolumn{3}{c}{T2: fabricated (\\%)} \\\\",
        "\\cmidrule(lr){2-5}\\cmidrule(lr){6-8}", "Model & Corr. & Wrong & Decl. & Inv. & Named & Decl. & Inv. \\\\", "\\midrule", *rows,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # T3 table
    rows = []
    for m in models:
        s = S[m]
        a, b = s["T3_scr_all"], s["T3_neutral_all"]
        rows.append(f"{DISPLAY[m]} & {rate_str(a['correct'])} & {rate_str(a['wrong'])} & {rate_str(a['empty'])} & {rate_str(b['correct'])} & {rate_str(b['wrong'])} & {rate_str(b['empty'])} \\\\")
    (PAPER / "tab_t3.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrrr}", "\\toprule",
        "& \\multicolumn{3}{c}{S.C.R. citation (\\%)} & \\multicolumn{3}{c}{Neutral citation (\\%)} \\\\",
        "\\cmidrule(lr){2-4}\\cmidrule(lr){5-7}", "Model & Corr. & Wrong & Empty & Corr. & Wrong & Empty \\\\", "\\midrule", *rows,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # T4 table: every cited case, by verifier label
    LABS = ["VERIFIED", "WRONG_YEAR", "WRONG_CITATION", "MISATTRIBUTED", "NOT_FOUND"]
    rows = []
    for m in models:
        t4 = S[m]["T4"]; lab = t4["labels"]; n = t4["cases"]
        if not n:
            continue
        v = t4["verified"]
        ci = f"{100 * v['lo']:.0f}--{100 * v['hi']:.0f}"
        rows.append(f"{DISPLAY[m]} & {n} & {small(100 * lab.get('VERIFIED', 0) / n, 1)} & {ci} & "
                    + " & ".join(small(100 * lab.get(l, 0) / n, 1) for l in LABS[1:]) + " \\\\")
    (PAPER / "tab_t4.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrrrr}", "\\toprule",
        "& & \\multicolumn{6}{c}{Share of cited cases (\\%)} \\\\", "\\cmidrule(lr){3-8}",
        "Model & Cases & Ver. & 95\\% CI & W.Yr. & W.Cit. & Misatt. & N.F. \\\\", "\\midrule", *rows,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # T5 table: the questions that received feedback, before and after revision
    rows = []
    for m in models:
        rv = S[m]["T4_vs_T5_revised_questions"]
        if not rv["questions"]:
            continue
        b, a = rv["before"], rv["after"]
        nf_b, nf_a = b["labels"].get("NOT_FOUND", 0), a["labels"].get("NOT_FOUND", 0)
        rows.append(f"{DISPLAY[m]} & {rv['questions']} & {b['cases']} & {a['cases']} & {rate_str(b['verified'])} & {rate_str(a['verified'])} & {nf_b} & {nf_a} \\\\")
    (PAPER / "tab_t5.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrrrr}", "\\toprule",
        "& & \\multicolumn{2}{c}{Cases} & \\multicolumn{2}{c}{Verified (\\%)} & \\multicolumn{2}{c}{Not found} \\\\",
        "\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}\\cmidrule(lr){7-8}",
        "Model & Q & Before & After & Before & After & Before & After \\\\", "\\midrule", *rows,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    result_macros(M, S, main_models, models)
    search_tables(M, S, main_models)
    graph_retrieval_macros(M, S, main_models)
    (PAPER / "numbers.tex").write_text("".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in sorted(M.items())), encoding="utf-8")
    print(f"wrote {len(M)} macros and 8 tables for models: {models}")
    return M, S


def search_tables(M, S, main_models):
    """search condition: citation tasks (tab_search_cit) and T4 under three conditions (tab_search_t4), plus macros"""
    key = {"llama3.1:8b": "Llama", "qwen3:8b": "Qwen", "gemma3:4b": "Gemma", "qwen2.5vl:7b": "QwenVL"}
    have = [m for m in main_models if f"{m}+search" in S]
    if not have:
        return
    rows_c, rows_4 = [], []
    tot = {"closed": 0, "feedback": 0, "search": 0, "closed_ver": 0, "feedback_ver": 0, "search_ver": 0}
    for m in have:
        s, c, k = S[f"{m}+search"], S[m], key[m]
        t1, t2, su = s["T1_all_all"], s["T2_all"], s["search"]
        rows_c.append(f"{DISPLAY[m]} & {rate_str(t1['correct'])} & {rate_str(t1['wrong'])} & {rate_str(t1['abstain'])} & "
                      f"{rate_str(t2['fabricated'])} & {rate_str(t2['abstain'])} & "
                      f"{rate_str(s['T3_scr_all']['correct'])} & {rate_str(s['T3_neutral_all']['correct'])} \\\\")
        M[f"SearchTOneCorrect{k}"] = str(t1["correct"]["k"])
        M[f"SearchTOneCorrectPct{k}"] = rate_str(t1["correct"]) + "\\%"
        M[f"SearchTOneWrong{k}"] = str(t1["wrong"]["k"])
        M[f"SearchTOneDecl{k}"] = str(t1["abstain"]["k"])
        M[f"SearchTOneLooked{k}"] = str(su["T1"]["looked_up_given"]["k"])
        M[f"SearchTOneLookedPct{k}"] = rate_str(su["T1"]["looked_up_given"]) + "\\%"
        M[f"SearchTTwoNamed{k}"] = str(t2["fabricated"]["k"])
        M[f"SearchTTwoNamedPct{k}"] = rate_str(t2["fabricated"]) + "\\%"
        M[f"SearchTTwoDecl{k}"] = str(t2["abstain"]["k"])
        M[f"SearchTTwoLooked{k}"] = str(su["T2"]["looked_up_given"]["k"])
        M[f"SearchTTwoNamedReal{k}"] = str(t2["named_real_case"])
        for f_, F in (("scr", "Scr"), ("neutral", "Neutral")):
            M[f"SearchTThree{F}Correct{k}"] = str(s[f"T3_{f_}_all"]["correct"]["k"])
            M[f"SearchTThree{F}CorrectPct{k}"] = rate_str(s[f"T3_{f_}_all"]["correct"]) + "\\%"
        conds = [("closed book", c["T4_list"]), ("after feedback", c["T4_after_feedback"]), ("with search", s["T4_list"])]
        rows_4.append(f"\\multicolumn{{5}}{{l}}{{\\textit{{{DISPLAY[m]}}}}} \\\\")
        for name, t in conds:
            lab = t["labels"]
            rows_4.append(f"\\quad {name} & {t['cases']} & {lab.get('VERIFIED', 0)} & {lab.get('NOT_FOUND', 0)} & {t['reference_questions']['k']} \\\\")
        for tag, t in zip(("closed", "feedback", "search"), (c["T4_list"], c["T4_after_feedback"], s["T4_list"])):
            M[f"Ref{tag.capitalize()}{k}"] = str(t["reference_questions"]["k"])
            M[f"Ver{tag.capitalize()}{k}"] = str(t["labels"].get("VERIFIED", 0))
            M[f"NF{tag.capitalize()}{k}"] = str(t["labels"].get("NOT_FOUND", 0))
            M[f"Cases{tag.capitalize()}{k}"] = str(t["cases"])
            M[f"RefWY{tag.capitalize()}{k}"] = str(t["reference_questions_incl_wrong_year"])
            tot[tag] += t["reference_questions"]["k"]
            tot[tag + "_ver"] += t["labels"].get("VERIFIED", 0)
        t4s = s["T4_list"]
        M[f"SearchTFourMis{k}"] = str(t4s["labels"].get("MISATTRIBUTED", 0))
        M[f"SearchTFourEmpty{k}"] = str(t4s["questions_empty"])
        M[f"SearchTFourInvalidAction{k}"] = str(su["T4"]["stop"].get("invalid_action", 0))
        M[f"SearchTOneNear{k}"] = str(t1["wrong_near_truth"])
        M[f"SearchSearches{k}"] = str(su["T4"]["searches"])
        M[f"SearchTopicQ{k}"] = str(su["T4"]["topic_queries"])
        M[f"SearchTopicQuestions{k}"] = str(su["T4"]["questions_with_topic_query"])
        M[f"SearchTopicCases{k}"] = str(su["T4"]["cases_from_topic_query"])
        tot["topic_ref"] = tot.get("topic_ref", 0) + su["T4"]["reference_from_topic_query"]
        tot["topic_cases"] = tot.get("topic_cases", 0) + su["T4"]["cases_from_topic_query"]
        # paired comparison of reference hits, closed book vs search, question by question
        ref_q = lambda f: {r["key"] for r in map(json.loads, (RES / f).read_text(encoding="utf-8").splitlines())
                           if r["task"] == "T4" and any(c["reference_id"] for c in r["cases"])}
        stem = m.replace(":", "_")
        a, b = ref_q(f"scored_{stem}.jsonl"), ref_q(f"scored_{stem}_search.jsonl")
        M[f"RefLost{k}"], M[f"RefGained{k}"] = str(len(a - b)), str(len(b - a))
        tot["lost"] = tot.get("lost", 0) + len(a - b)
        tot["gained"] = tot.get("gained", 0) + len(b - a)
        M[f"SearchTFourVerPct{k}"] = rate_str(t4s["verified"]) + "\\%"
        M[f"SearchTFourShownPct{k}"] = rate_str(su["T4"]["cases_shown"]) + "\\%"
        M[f"SearchTFourVerShownPct{k}"] = rate_str(su["T4"]["verified_shown"]) + "\\%"
        for task, T in (("T1", "TOne"), ("T2", "TTwo"), ("T3", "TThree"), ("T4", "TFour")):
            M[f"SearchCalls{T}{k}"] = f"{su[task]['tool_calls_median']:g}"
            M[f"SearchUsed{T}{k}"] = rate_str(su[task]["used_tools"]) + "\\%"
    M["RefClosedAll"], M["RefFeedbackAll"], M["RefSearchAll"] = str(tot["closed"]), str(tot["feedback"]), str(tot["search"])
    M["VerClosedAll"], M["VerFeedbackAll"], M["VerSearchAll"] = str(tot["closed_ver"]), str(tot["feedback_ver"]), str(tot["search_ver"])
    M["RefQuestionsAll"] = str(len(have) * S[have[0]]["T4_list"]["questions"])
    M["RefLostAll"], M["RefGainedAll"] = str(tot["lost"]), str(tot["gained"])
    # exact two-sided McNemar test on the discordant (model, question) pairs
    n_d, k_d = tot["lost"] + tot["gained"], min(tot["lost"], tot["gained"])
    p = min(1.0, 2 * sum(math.comb(n_d, i) for i in range(k_d + 1)) / 2 ** n_d) if n_d else 1.0
    M["RefMcNemarP"] = f"{p:.3f}" if p >= 0.001 else "$<$0.001"
    M["SearchTopicRefAll"], M["SearchTopicCasesAll"] = str(tot["topic_ref"]), str(tot["topic_cases"])
    for tag in ("closed", "search"):
        src = [S[m]["T4_list"] if tag == "closed" else S[f"{m}+search"]["T4_list"] for m in have]
        M[f"Cases{tag.capitalize()}All"] = str(sum(t["cases"] for t in src))
        M[f"NF{tag.capitalize()}All"] = str(sum(t["labels"].get("NOT_FOUND", 0) for t in src))
    M["SearchTOneCorrectMin"] = str(min(S[f"{m}+search"]["T1_all_all"]["correct"]["k"] for m in have))
    M["SearchTOneCorrectMax"] = str(max(S[f"{m}+search"]["T1_all_all"]["correct"]["k"] for m in have))
    M["NumRefJudgments"] = str(sum(len(v) for v in REFERENCE.values()))
    from citebench import search_tools, run_search
    M["SearchK"], M["SearchMaxActions"] = str(search_tools.K), str(run_search.MAX_ACTIONS)
    (PAPER / "tab_search_cit.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrrrr}", "\\toprule",
        "& \\multicolumn{3}{c}{T1 (\\%)} & \\multicolumn{2}{c}{T2 (\\%)} & \\multicolumn{2}{c}{T3 corr.\\ (\\%)} \\\\",
        "\\cmidrule(lr){2-4}\\cmidrule(lr){5-6}\\cmidrule(lr){7-8}",
        "Model & Corr. & Wrong & Decl. & Named & Decl. & S.C.R. & Neutr. \\\\", "\\midrule", *rows_c,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")
    (PAPER / "tab_search_t4.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrr}", "\\toprule",
        "Condition & Cases & Verified & Not found & Reference \\\\", "\\midrule", *rows_4,
        "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")


def graph_retrieval_macros(M, S, main_models):
    """citation graph (graph/stats.json), retrieval evaluations (retrieval/results_*.json) and the topic-search runs"""
    gs_f = ROOT / "graph" / "stats.json"
    if not gs_f.exists():
        return
    gs = json.loads(gs_f.read_text())
    man = [json.loads(l) for l in (ROOT / "corpus" / "manifest.jsonl").read_text().splitlines()]
    final = {}
    for m in man:
        if m["status"] != "cached" or m["id"] not in final:
            final[m["id"]] = m["status"]
    ok = sum(1 for i in final if (ROOT / "corpus" / "text" / f"{i}.txt.gz").exists())
    M["GraphTextOK"], M["GraphTextFail"] = num(ok), num(len(final) - ok)
    pilot = json.loads((ROOT / "pilot" / "sample.json").read_text(encoding="utf-8"))
    M["PilotN"] = str(len(pilot))
    t = gs["tiers"]
    res = t.get("exact", 0) + t.get("parallel", 0) + t.get("name", 0)
    units = gs["units"] - t.get("self", 0)
    M["GraphJudgments"] = num(gs["judgments"])
    M["GraphUnits"] = num(units)
    M["GraphResolved"], M["GraphResolvedPct"] = num(res), pct(res, units)
    M["GraphExact"], M["GraphParallel"], M["GraphName"] = num(t.get("exact", 0)), num(t.get("parallel", 0)), num(t.get("name", 0))
    M["GraphConflict"] = num(t.get("conflict", 0))
    M["GraphEdges"] = num(gs["edges"])
    M["GraphCited"] = num(gs["cited_at_least_once"])
    M["GraphCitedPct"] = pct(gs["cited_at_least_once"], int(M["CorpusSC"].replace("{,}", "")))
    M["GraphMaxIn"] = num(gs["max_indegree"])
    M["GraphMedianOut"] = f"{gs['median_outdeg']:g}"
    a, n = gs["agree"]
    M["GraphAgreePct"], M["GraphAgreeN"] = pct(a, n), num(n)
    a, n = gs["name_precision"]
    M["GraphNamePrecPct"], M["GraphNamePrecN"], M["GraphNamePrecOK"] = pct(a, n), num(n), num(a)
    # strict split of that check, straight from units.jsonl: the name reaches the SAME record as the number, a DIFFERENT record
    # with matching parties (e.g. another order of the same case), or a record with different parties
    same = loose = wrong = 0
    for l in (ROOT / "graph" / "units.jsonl").read_text(encoding="utf-8").splitlines():
        u = json.loads(l)
        if u.get("num") and u.get("by_name") is not None:
            if u["by_name"] in u["num"]:
                same += 1
            elif u["agree"]:
                loose += 1
            else:
                wrong += 1
    assert same + loose == a and same + loose + wrong == n, (same, loose, wrong, a, n)      # consistent with stats.json
    M["GraphNameSamePct"], M["GraphNameLoosePct"], M["GraphNameWrongPct"] = pct(same, n), pct(loose, n), pct(wrong, n)
    M["GraphNameSameN"] = num(same)
    v, n = gs["violations"]["all"]
    M["GraphLater"], M["GraphLaterPct"] = num(v), pct(v, n, 2)
    for tier in ("exact", "parallel", "name"):
        if tier in gs["violations"]:
            v, n = gs["violations"][tier]
            M[f"GraphLaterPct{tier.capitalize()}"] = pct(v, n, 2)
    for k, (r, n) in gs["by_kind_resolved"].items():
        M[f"GraphKind{k.upper()}"], M[f"GraphKind{k.upper()}Pct"] = num(n), pct(r, n)
    M["GraphLandmarkPct"] = f"{gs['landmark_median_percentile']:.1f}"
    M["GraphLandmarkCited"], M["GraphLandmarkN"] = str(gs["landmark_cited"][0]), str(gs["landmark_cited"][1])
    M["GraphCiting"] = num(gs["citing_judgments"])
    top = gs["top_cited"]
    expect = ["MANEKA GANDHI", "KESAVANANDA", "SHARAD BIRDHI", "RAMANA DAYARAM", "SHIVAJI SAHEBRAO"]    # named in the text
    for k, (word, (title, year, n)) in enumerate(zip(expect, top[:5])):
        assert word in title.upper(), (word, title)
        M[f"GraphTop{['One', 'Two', 'Three', 'Four', 'Five'][k]}N"] = num(n)
    hc_f = ROOT / "hc_scope" / "results.json"
    if hc_f.exists():
        hc = json.loads(hc_f.read_text(encoding="utf-8"))
        M["HCRecords"] = num(hc["high_court_records_with_link"])
        M["HCMeanKB"], M["HCSampleN"] = str(hc["pdf_size_mean_kb"]), num(hc["pdf_size_sample_n"])
        M["HCTotalTB"] = f"{hc['estimated_total_pdf_tb']:.1f}"
        M["HCTotalTBLow"], M["HCTotalTBHigh"] = f"{hc['estimated_total_pdf_tb_low']:.1f}", f"{hc['estimated_total_pdf_tb_high']:.1f}"
        M["HCMetaN"] = num(hc["metadata_sample_n"])
        assert hc["citation_field_nonempty"] == 0 and hc["neutral_citation_field_nonempty"] == 0     # the text says "no citation numbers"
    chk_f = ROOT / "graph" / "check_labels.json"
    if chk_f.exists():
        chk = json.loads(chk_f.read_text(encoding="utf-8"))["labels"]
        e = [c for c in chk if c["tag"] == "NAME_EDGE"]
        M["GraphCheckN"], M["GraphCheckOK"] = str(len(e)), str(sum(1 for c in e if c["correct"]))
        M["GraphCheckPct"] = pct(sum(1 for c in e if c["correct"]), len(e))
        u = [c for c in chk if c["tag"] == "UNRESOLVED"]
        from collections import Counter
        cc = Counter(c["category"] for c in u)
        M["UnresN"], M["UnresNotIndex"] = str(len(u)), str(cc["not_in_index"])
        M["UnresInIndex"] = str(len(u) - cc["not_in_index"])
        M["UnresExtraction"], M["UnresSource"] = str(cc["in_index_extraction_or_ocr"]), str(cc["in_index_source_error"])
        M["UnresAmbig"], M["UnresVerifier"] = str(cc["in_index_ambiguous_name"]), str(cc["in_index_verifier_limitation"])
    # decade table
    rows = []
    for d, v in sorted(gs["by_era"].items(), key=lambda x: int(x[0])):
        rows.append(f"{d}s & {num(v['units'])} & {v['resolved_pct']:.1f} & {num(v['exact'])} & {num(v['parallel'])} & {num(v['name'])} \\\\")
    (PAPER / "tab_graph.tex").write_text("\n".join([
        "\\begin{tabular}{lrrrrr}", "\\toprule",
        "Citing & Citations & Resolved & \\multicolumn{3}{c}{Resolved by} \\\\", "\\cmidrule(lr){4-6}",
        "decade & & (\\%) & Number & Parallel & Name \\\\", "\\midrule", *rows, "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # retrieval cost, read from the run logs: embedding throughput and time to prepare the 1,000 test queries
    import re as _re
    emb_rates = [float(x) for x in _re.findall(r"/38366\s+([\d.]+)/s", (ROOT / "retrieval" / "embed.log").read_text())]
    if emb_rates:
        M["EmbedRate"] = f"{median(emb_rates):.0f}"
    prep = _re.findall(r"prepared 1000/1000\s+(\d+)s", (ROOT / "retrieval" / "eval_recommend.log").read_text())
    if prep:
        M["QueryMs"] = f"{int(prep[-1]) / 1000 * 1000:.0f}"

    rr_f = ROOT / "retrieval" / "results_recommend.json"
    if rr_f.exists():
        rr = json.loads(rr_f.read_text())
        meta = rr["_meta"]
        M["RecNDev"], M["RecNTest"], M["RecMinTargets"] = num(meta["n_dev"]), num(meta["n_test"]), str(meta["min_targets"])
        M["RecPool"], M["RecMeanTargets"], M["RecLeakPct"] = num(meta["pool"]), f"{meta['mean_targets']:.1f}", f"{meta['leakage_pct']:.1f}\\%"
        names = {"popularity": "Most cited so far", "bm25": "BM25", "dense": "Dense (bge-m3)", "hybrid": "BM25 + dense",
                 "bm25+prior": "BM25 + prior", "dense+prior": "Dense + prior", "hybrid+prior": "BM25 + dense + prior"}
        rows = []
        for k, lab in names.items():
            r = rr[k]
            rows.append(f"{lab} & {r['recall10']:.3f} & {r['recall50']:.3f} & {r['hit10']:.3f} & {r['mrr']:.3f} \\\\")
            key = k.replace("+prior", "Prior").replace("bm25", "Bm").replace("dense", "Dense").replace("hybrid", "Hybrid").replace("popularity", "Pop")
            M[f"Rec{key}RTen"] = f"{r['recall10']:.3f}"
            M[f"Rec{key}RTenCI"] = f"{r['recall10_ci'][0]:.3f}--{r['recall10_ci'][1]:.3f}"
            M[f"Rec{key}RFifty"] = f"{r['recall50']:.3f}"
            M[f"Rec{key}HitTen"] = f"{100 * r['hit10']:.1f}\\%"
            M[f"Rec{key}MRR"] = f"{r['mrr']:.3f}"
        w = rr["hybrid+prior"]["weights"]
        M["RecWeights"] = f"{w[0]:g}, {w[1]:g}, {w[2]:g}"
        M["RecLeakStrictPct"] = f"{meta['leakage_strict_pct']:.1f}\\%"
        M["RecLeakRareDF"] = str(meta["leakage_rare_df"])
        M["RecHybridRTenUnleaked"] = f"{rr['hybrid']['recall10_unleaked']:.3f}"
        M["RecHybridPriorRTenUnleaked"] = f"{rr['hybrid+prior']['recall10_unleaked']:.3f}"
        for tag, a, b in (("Prior", "hybrid", "hybrid+prior"), ("PriorBm", "bm25", "bm25+prior"), ("PriorDense", "dense", "dense+prior"), ("Hybrid", "bm25", "hybrid")):
            d = rr[f"diff:{a}->{b}"]
            M[f"RecDiff{tag}"] = f"{d['mean']:+.3f}".replace("+", "$+$")
            M[f"RecDiff{tag}CI"] = f"{d['ci'][0]:+.3f} to {d['ci'][1]:+.3f}".replace("+", "$+$")
            M[f"RecDiff{tag}Better"], M[f"RecDiff{tag}Worse"] = str(d["better"]), str(d["worse"])
        M["RecHybridPriorRTenPct"] = f"{100 * rr['hybrid+prior']['recall10']:.1f}\\%"
        rel = (rr["hybrid+prior"]["recall10"] / rr["hybrid"]["recall10"] - 1) * 100
        M["RecPriorRelGain"] = f"{rel:.0f}\\%"
        (PAPER / "tab_recommend.tex").write_text("\n".join([
            "\\begin{tabular}{lrrrr}", "\\toprule", "Method & R@10 & R@50 & Hit@10 & MRR \\\\", "\\midrule", *rows,
            "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")
    rq_f = ROOT / "retrieval" / "results_questions.json"
    if rq_f.exists():
        rq = json.loads(rq_f.read_text())
        for k in ("popularity", "bm25", "dense", "hybrid", "hybrid+prior", "dense+prior"):
            if k in rq:
                key = k.replace("+prior", "Prior").replace("bm25", "Bm").replace("dense", "Dense").replace("hybrid", "Hybrid").replace("popularity", "Pop")
                for kk, word in ((3, "Three"), (5, "Five"), (10, "Ten")):
                    M[f"Q{key}Hit{word}"] = str(rq[k][f"hit{kk}"])
                M[f"Q{key}RTen"] = f"{rq[k]['recall10']:.2f}"
        rows = []
        names = {"popularity": "Most cited", "bm25": "BM25", "dense": "Dense", "hybrid": "BM25 + dense", "hybrid+prior": "BM25 + dense + prior"}
        for k, lab in names.items():
            r = rq[k]
            rows.append(f"{lab} & {r['hit3']} & {r['hit5']} & {r['hit10']} & {r['recall10']:.2f} \\\\")
        (PAPER / "tab_questions.tex").write_text("\n".join([
            "\\begin{tabular}{lrrrr}", "\\toprule", "Retriever & Top 3 & Top 5 & Top 10 & R@10 \\\\", "\\midrule", *rows,
            "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")

    # topic-search runs of the models (T4 only)
    key = {"llama3.1:8b": "Llama", "qwen3:8b": "Qwen", "gemma3:4b": "Gemma", "qwen2.5vl:7b": "QwenVL"}
    conds = [("from memory", lambda m: S[m]["T4_list"]), ("after feedback", lambda m: S[m].get("T4_after_feedback")),
             ("name search", lambda m: S.get(f"{m}+search", {}).get("T4_list")),
             ("topic search", lambda m: S.get(f"{m}+retrieval", {}).get("T4_list")),
             ("topic + prior", lambda m: S.get(f"{m}+retrievalprior", {}).get("T4_list"))]
    have = [m for m in main_models if f"{m}+retrieval" in S]
    if have:
        rows = []
        tot = {c: [0, 0, 0, 0] for c, _ in conds}
        for m in have:
            cells = []
            for c, f in conds:
                t = f(m)
                if t is None:
                    cells += ["--", "--"]
                    continue
                cells += [str(t["reference_questions"]["k"]), str(t["labels"].get("NOT_FOUND", 0))]
                tot[c][0] += t["reference_questions"]["k"]
                tot[c][1] += t["labels"].get("NOT_FOUND", 0)
                tot[c][2] += t["labels"].get("VERIFIED", 0)
                tot[c][3] += t["cases"]
            rows.append(f"{DISPLAY[m]} & " + " & ".join(cells) + " \\\\")
            for tag in ("retrieval", "retrievalprior"):
                if f"{m}+{tag}" in S:
                    t = S[f"{m}+{tag}"]["T4_list"]
                    T = "Topic" if tag == "retrieval" else "TopicPrior"
                    M[f"Ref{T}{key[m]}"] = str(t["reference_questions"]["k"])
                    M[f"NF{T}{key[m]}"] = str(t["labels"].get("NOT_FOUND", 0))
                    M[f"Ver{T}{key[m]}"] = str(t["labels"].get("VERIFIED", 0))
                    M[f"Cases{T}{key[m]}"] = str(t["cases"])
                    M[f"Mis{T}{key[m]}"] = str(t["labels"].get("MISATTRIBUTED", 0))
                    su = S[f"{m}+{tag}"].get("search", {}).get("T4", {})
                    if su:
                        M[f"Shown{T}{key[m]}"] = rate_str(su["cases_shown"]) + "\\%"
        rows.append("\\midrule")
        rows.append("All four & " + " & ".join(f"{tot[c][0]} & {tot[c][1]}" for c, _ in conds) + " \\\\")
        # paired comparisons over (model, question) pairs with an exact McNemar test
        def ref_keys(stem):
            f = RES / f"scored_{stem}.jsonl"
            return {r["key"] for r in map(json.loads, f.read_text(encoding="utf-8").splitlines())
                    if r["task"] == "T4" and any(c["reference_id"] for c in r["cases"])}
        for tag, (a, b) in {"ClosedTopicPrior": ("", "_retrievalprior"), "TopicTopicPrior": ("_retrieval", "_retrievalprior"),
                            "ClosedTopic": ("", "_retrieval")}.items():
            lost = gained = 0
            for m in have:
                stem = m.replace(":", "_")
                x, y = ref_keys(stem + a), ref_keys(stem + b)
                lost += len(x - y)
                gained += len(y - x)
            n_d, k_d = lost + gained, min(lost, gained)
            p = min(1.0, 2 * sum(math.comb(n_d, i) for i in range(k_d + 1)) / 2 ** n_d) if n_d else 1.0
            M[f"Pair{tag}Lost"], M[f"Pair{tag}Gained"] = str(lost), str(gained)
            M[f"Pair{tag}P"] = f"{p:.3f}" if p >= 0.001 else "$<$0.001"
        # the four models answer the SAME 40 questions, so model-question pairs are not independent: also test per question
        # (each question's number of models naming a deciding judgment, compared between two conditions; exact sign test)
        def per_q(suffix):
            out = {}
            for m in have:
                f = RES / f"scored_{m.replace(':', '_')}{suffix}.jsonl"
                for r in map(json.loads, f.read_text(encoding="utf-8").splitlines()):
                    if r["task"] == "T4":
                        out[r["key"]] = out.get(r["key"], 0) + bool(any(c["reference_id"] for c in r["cases"]))
            return out
        pq = {"Closed": per_q(""), "Name": per_q("_search"), "Topic": per_q("_retrieval"), "TopicPrior": per_q("_retrievalprior")}
        for tag, (a_, b_) in {"ClosedTopicPrior": ("Closed", "TopicPrior"), "TopicTopicPrior": ("Topic", "TopicPrior"), "ClosedName": ("Closed", "Name")}.items():
            up = sum(1 for k in pq[a_] if pq[b_][k] > pq[a_][k])
            down = sum(1 for k in pq[a_] if pq[b_][k] < pq[a_][k])
            n_d, k_d = up + down, min(up, down)
            p = min(1.0, 2 * sum(math.comb(n_d, i) for i in range(k_d + 1)) / 2 ** n_d) if n_d else 1.0
            M[f"Sign{tag}Better"], M[f"Sign{tag}Worse"] = str(up), str(down)
            M[f"Sign{tag}P"] = f"{p:.3f}" if p >= 0.001 else "$<$0.001"
            M[f"Sign{tag}N"] = str(len(pq[a_]))
        # how many topic-search answers were cut off by Ollama's repetition limit (counted as empty lists)
        ab = 0
        for m in have:
            for suffix in ("_retrieval", "_retrievalprior"):
                f = RES / f"{m.replace(':', '_')}{suffix}.jsonl"
                ab += sum(1 for r in map(json.loads, f.read_text(encoding="utf-8").splitlines()) if r.get("done_reason") == "aborted_repetition")
        M["TopicAborted"] = str(ab)
        for c, T in zip([c for c, _ in conds], ("Closed", "Feedback", "Name", "Topic", "TopicPrior")):
            M[f"RefAll{T}"], M[f"NFAll{T}"], M[f"VerAll{T}"] = str(tot[c][0]), str(tot[c][1]), str(tot[c][2])
            M[f"CasesAll{T}"] = str(tot[c][3])
            M[f"VerPctAll{T}"] = pct(tot[c][2], tot[c][3])
            # share of (model, question) pairs whose list includes a deciding judgment, whole percent (used in the title)
            M[f"RefRate{T}"] = f"{100 * tot[c][0] / (len(have) * S[have[0]]['T4_list']['questions']):.0f}\\%"
        (PAPER / "tab_t4conds.tex").write_text("\n".join([
            "\\begin{tabular}{l" + "rr" * len(conds) + "}", "\\toprule",
            " & " + " & ".join(f"\\multicolumn{{2}}{{c}}{{{c.capitalize()}}}" for c, _ in conds) + " \\\\",
            "".join(f"\\cmidrule(lr){{{2 + 2 * i}-{3 + 2 * i}}}" for i in range(len(conds))),
            "Model" + " & Ref. & N.F." * len(conds) + " \\\\", "\\midrule", *rows, "\\bottomrule", "\\end{tabular}"]) + "\n", encoding="utf-8")


IX = None
T1_TRUTH = {}


def result_macros(M, S, main_models, models):
    """named numbers used in the results text; each is computed from summary.json, the scored files or the audit"""
    from collections import Counter
    global IX, T1_TRUTH
    from citebench.index import SCIndex
    IX = SCIndex()
    bench = json.loads((ROOT / "data" / "benchmark.json").read_text(encoding="utf-8"))
    T1_TRUTH = {f"{it['task']}|{it['form']}|{it['citation']}": it["truth_id"] for it in bench["T1"]}
    key = {"llama3.1:8b": "Llama", "qwen3:8b": "Qwen", "gemma3:4b": "Gemma", "qwen2.5vl:7b": "QwenVL", "qwen3:8b+think": "QwenThink"}
    for m in models:
        s, k = S[m], key[m]
        t1, t2 = s["T1_all_all"], s["T2_all"]
        M[f"TOneCorrect{k}"] = f"{t1['correct']['k']}"
        M[f"TOneWrongPct{k}"] = rate_str(t1["wrong"]) + "\\%"
        M[f"TOneDeclPct{k}"] = rate_str(t1["abstain"]) + "\\%"
        M[f"TTwoNamed{k}"] = f"{t2['fabricated']['k']}"
        M[f"TTwoNamedPct{k}"] = rate_str(t2["fabricated"]) + "\\%"
        if t2["fabricated"]["n"]:
            M[f"TTwoNamedCI{k}"] = f"{100 * t2['fabricated']['lo']:.1f}--{100 * t2['fabricated']['hi']:.1f}\\%"
        M[f"TTwoDecl{k}"] = f"{t2['abstain']['k']}"
        M[f"TTwoInvalid{k}"] = f"{t2['invalid']['k']}"
        if "T3_scr_all" in s and s["T3_scr_all"]["n"]:
            for f_ in ("scr", "neutral"):
                v = s[f"T3_{f_}_all"]
                F = "Scr" if f_ == "scr" else "Neutral"
                M[f"TThree{F}Correct{k}"] = f"{v['correct']['k']}"
                M[f"TThree{F}Wrong{k}"] = f"{v['wrong']['k']}"
                M[f"TThree{F}WrongPct{k}"] = rate_str(v["wrong"]) + "\\%"
            M[f"TThreeUnassigned{k}"] = str(sum(s[f"T3_neutral_{st}"]["wrong_kinds"].get("unassigned_number", 0) for st in ("landmark", "random")))
        t4 = s["T4"]
        if not t4["cases"]:
            continue
        M[f"TFourCases{k}"] = str(t4["cases"])
        M[f"TFourVerPct{k}"] = small(100 * t4["labels"].get("VERIFIED", 0) / t4["cases"], 1) + "\\%"
        M[f"TFourNFPct{k}"] = small(100 * t4["labels"].get("NOT_FOUND", 0) / t4["cases"], 1) + "\\%"
        M[f"TFourNF{k}"] = str(t4["labels"].get("NOT_FOUND", 0))
        M[f"TFourWrongYear{k}"] = str(t4["labels"].get("WRONG_YEAR", 0))
        M[f"TFourQUnverified{k}"] = str(t4["questions_with_unverified"])
        rows = [json.loads(l) for l in (RES / f"scored_{m.replace(':', '_').replace('+', '_')}.jsonl").read_text(encoding="utf-8").splitlines()]
        wrong_answers = Counter(r.get("answer") for r in rows if r["task"] in ("T1", "T2") and r["outcome"] == "wrong")
        M[f"TopAnswerCount{k}"] = str(wrong_answers.most_common(1)[0][1]) if wrong_answers else "0"
        M[f"TopAnswer{k}"] = tex_escape(wrong_answers.most_common(1)[0][0]) if wrong_answers else ""
        M[f"TTwoNamedReal{k}"] = str(t2["named_real_case"])
        if "T3_neutral_all" in s and s["T3_neutral_all"]["n"]:
            M[f"TThreeNeutralOtherFormat{k}"] = str(sum(s[f"T3_neutral_{st}"]["wrong_kinds"].get("other_format", 0) for st in ("landmark", "random")))
            M[f"TThreeNeutralOtherJudgment{k}"] = str(sum(s[f"T3_neutral_{st}"]["wrong_kinds"].get("other_judgment", 0) for st in ("landmark", "random")))
            M[f"TThreeScrNoJudgment{k}"] = str(sum(s[f"T3_scr_{st}"]["wrong_kinds"].get("no_judgment_at_page", 0) for st in ("landmark", "random")))
        kinds = s["T4"]["citation_kinds"]
        if s["T4"]["cases"]:
            M[f"TFourReporterCitePct{k}"] = small(100 * (kinds.get("scr", 0) + kinds.get("neutral", 0)) / s["T4"]["cases"], 1) + "\\%"
        M[f"DistinctAnswers{k}"] = str(len(wrong_answers))
        M[f"WrongAnswers{k}"] = str(sum(wrong_answers.values()))
        # how close did wrong T1 answers come? lenient (plain IDF-weighted F1) name score against the true judgment
        wr = [IX.name_score(set(tokens(r["answer"])), IX.by_id[T1_TRUTH[r["key"]]]) for r in rows if r["task"] == "T1" and r["outcome"] == "wrong"]
        M[f"MaxWrongLenient{k}"] = f"{max(wr):.2f}" if wr else "--"
        t4c = [c for r in rows if r["task"] == "T4" for c in r["cases"] if c["citation_kind"] in ("scr", "neutral")]
        M[f"TFourReporterCites{k}"] = str(len(t4c))
        M[f"TFourReporterResolved{k}"] = str(sum(1 for c in t4c if c["citation_ids"]))
        M[f"TFourReporterResolvedMis{k}"] = str(sum(1 for c in t4c if c["citation_ids"] and c["label"] == "MISATTRIBUTED"))

    # cross-model summaries used in the abstract / conclusion
    t1c = {m: S[m]["T1_all_all"]["correct"]["k"] for m in main_models}
    M["BestTOneCorrect"] = str(max(t1c.values()))
    M["TOneN"] = str(S[main_models[0]]["T1_all_all"]["n"])
    ver = {m: 100 * S[m]["T4"]["labels"].get("VERIFIED", 0) / S[m]["T4"]["cases"] for m in main_models}
    M["TFourVerifiedRange"] = f"{min(ver.values()):.0f}--{max(ver.values()):.0f}\\%"
    short = {"llama3.1:8b": "Llama", "qwen3:8b": "Qwen3", "gemma3:4b": "Gemma", "qwen2.5vl:7b": "Qwen2.5-VL"}
    cases = {m: S[m]["T4"]["cases"] for m in main_models}
    M["TFourCasesMin"], M["TFourCasesMax"] = str(min(cases.values())), str(max(cases.values()))
    nf = {m: 100 * S[m]["T4"]["labels"].get("NOT_FOUND", 0) / S[m]["T4"]["cases"] for m in main_models}
    lo, hi = min(nf, key=nf.get), max(nf, key=nf.get)
    M["TFourNFMinPct"], M["TFourNFMinModel"] = small(nf[lo], 1) + "\\%", short[lo]
    M["TFourNFMaxPct"], M["TFourNFMaxModel"] = small(nf[hi], 1) + "\\%", short[hi]
    t3c = sum(S[m][f"T3_{f}_all"]["correct"]["k"] for m in main_models for f in ("scr", "neutral"))
    t3n = sum(S[m][f"T3_{f}_all"]["n"] for m in main_models for f in ("scr", "neutral"))
    M["TThreeCorrectAll"], M["TThreeAskedAll"] = str(t3c), str(t3n)

    # T5: revision after verifier feedback (questions where at least one cited case was not VERIFIED)
    for m in main_models:
        k = key[m]
        rv = S[m]["T4_vs_T5_revised_questions"]
        if not rv["questions"]:
            continue
        b, a = rv["before"], rv["after"]
        M[f"TFiveQ{k}"] = str(rv["questions"])
        M[f"TFiveCasesBefore{k}"], M[f"TFiveCasesAfter{k}"] = str(b["cases"]), str(a["cases"])
        M[f"TFiveVerBefore{k}"] = str(b["labels"].get("VERIFIED", 0))
        M[f"TFiveVerAfter{k}"] = str(a["labels"].get("VERIFIED", 0))
        M[f"TFiveNFBefore{k}"] = str(b["labels"].get("NOT_FOUND", 0))
        M[f"TFiveNFAfter{k}"] = str(a["labels"].get("NOT_FOUND", 0))
        M[f"TFiveVerPctBefore{k}"] = rate_str(b["verified"]) + "\\%"
        M[f"TFiveVerPctAfter{k}"] = rate_str(a["verified"]) + "\\%"
        M[f"TFiveEmptyAfter{k}"] = str(rv.get("empty_after", 0))
        M[f"TFiveNewNF{k}"] = str(rv.get("new_not_found", 0))
        M[f"TFiveKeptNF{k}"] = str(rv.get("kept_not_found", 0))
        M[f"TFiveNewVer{k}"] = str(rv.get("new_verified", 0))
    tq = [m for m in main_models if S[m]["T4_vs_T5_revised_questions"]["questions"]]
    if tq:
        nb = sum(S[m]["T4_vs_T5_revised_questions"]["before"]["labels"].get("NOT_FOUND", 0) for m in tq)
        na = sum(S[m]["T4_vs_T5_revised_questions"]["after"]["labels"].get("NOT_FOUND", 0) for m in tq)
        M["TFiveNFBeforeAll"], M["TFiveNFAfterAll"] = str(nb), str(na)
        M["TFiveNewNFAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"].get("new_not_found", 0) for m in tq))
        M["TFiveNewVerAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"].get("new_verified", 0) for m in tq))
        M["TFiveNewCasesAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["new_cases"] for m in tq))
        M["TFiveRepeatedAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["repeated_cases"] for m in tq))
        M["TFiveCasesAfterAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["after"]["cases"] for m in tq))
        newers = [short[m] for m in tq if S[m]["T4_vs_T5_revised_questions"]["new_cases"]]
        M["TFiveNewCaseModels"] = " and ".join(newers) if newers else "none"
        M["TFiveVerBeforeAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["before"]["labels"].get("VERIFIED", 0) for m in tq))
        M["TFiveVerAfterAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["after"]["labels"].get("VERIFIED", 0) for m in tq))
        M["TFiveQAll"] = str(sum(S[m]["T4_vs_T5_revised_questions"]["questions"] for m in tq))

    # thinking ablation (Qwen3 8B, T1, T2 and T4 only)
    if "qwen3:8b+think" in S and S["qwen3:8b+think"]["T4"]["cases"]:
        th, no = S["qwen3:8b+think"], S["qwen3:8b"]
        M["ThinkTOneCorrect"] = str(th["T1_all_all"]["correct"]["k"])
        M["ThinkTOneWrong"] = str(th["T1_all_all"]["wrong"]["k"])
        M["ThinkTOneDecl"] = str(th["T1_all_all"]["abstain"]["k"])
        M["ThinkTOneInvalid"] = str(th["T1_all_all"]["invalid"]["k"])
        M["ThinkTTwoNamed"] = str(th["T2_all"]["fabricated"]["k"])
        M["ThinkTTwoDecl"] = str(th["T2_all"]["abstain"]["k"])
        M["ThinkTFourCases"] = str(th["T4"]["cases"])
        M["ThinkTFourVerPct"] = small(100 * th["T4"]["labels"].get("VERIFIED", 0) / th["T4"]["cases"], 1) + "\\%"
        M["ThinkTFourNFPct"] = small(100 * th["T4"]["labels"].get("NOT_FOUND", 0) / th["T4"]["cases"], 1) + "\\%"
        M["NoThinkTFourVerPct"] = small(100 * no["T4"]["labels"].get("VERIFIED", 0) / no["T4"]["cases"], 1) + "\\%"
        recs = [json.loads(l) for l in (RES / "qwen3_8b_think.jsonl").read_text(encoding="utf-8").splitlines()]
        tc = sorted(r.get("thinking_chars") or 0 for r in recs)
        M["ThinkMedianChars"] = f"{median(tc):,.0f}".replace(",", "{,}")
        ms = sorted(r["ms"] for r in recs)
        M["ThinkMedianSec"] = f"{median(ms) / 1000:.1f}"
        recs0 = [json.loads(l) for l in (RES / "qwen3_8b.jsonl").read_text(encoding="utf-8").splitlines()]
        ms0 = sorted(r["ms"] for r in recs0 if r["task"] in ("T1", "T2", "T4"))
        M["NoThinkMedianSec"] = f"{median(ms0) / 1000:.1f}"
        M["ThinkTruncated"] = str(sum(1 for r in recs if r.get("done_reason") in ("length", "aborted_repetition")))
        M["ThinkTTwoInvalid"] = str(th["T2_all"]["invalid"]["k"])
        M["ThinkTFourAnswered"] = str(th["T4"]["questions"] - sum(1 for r in recs if r["key"].startswith("T4|") and r.get("parsed") is None))
        M["ThinkTFourInvalid"] = str(sum(1 for r in recs if r["key"].startswith("T4|") and r.get("parsed") is None))
        M["ThinkTFourNF"] = str(th["T4"]["labels"].get("NOT_FOUND", 0))
        M["ThinkTFourVer"] = str(th["T4"]["labels"].get("VERIFIED", 0))
        M["NoThinkTFourNFPct"] = small(100 * no["T4"]["labels"].get("NOT_FOUND", 0) / no["T4"]["cases"], 1) + "\\%"
        M["ThinkRecords"] = str(len(recs))

    # verifier and serving latency
    vt = json.loads((ROOT / "data" / "verifier_timing.json").read_text())
    M["VerifyMedianMs"] = f"{vt['median_ms']:.0f}"
    M["VerifyPNinetyFiveMs"] = f"{vt['p95_ms']:,.0f}".replace(",", "{,}")
    benches = sorted((DATA).glob("bench-2026-09-30*.json"))
    if benches:
        bj = json.loads(benches[-1].read_text())
        C = bj["classes"]
        ex = [x for c in ("exact: CNR", "exact: neutral citation", "exact: reporter citation") for x in C[c]["pass1"] + C[c]["pass2"]]
        M["LatExactMedian"] = f"{median(ex):.1f}"
        M["LatExactMax"] = f"{max(ex):.0f}"
        cf = sorted(C["keyword, common"]["pass1"])
        M["LatCommonFirstMedian"] = f"{median(cf):,.0f}".replace(",", "{,}")
        M["LatCommonFirstMax"] = f"{max(cf):,.0f}".replace(",", "{,}")
        cw = sorted(C["keyword, common"]["pass2"])
        M["LatCommonWarmMedian"] = f"{median(cw):,.0f}".replace(",", "{,}")
        M["LatFallbackFirst"] = str(sum(C[c].get("fallback1", 0) for c in C))
        M["LatFallbackWarm"] = str(sum(C[c].get("fallback2", 0) for c in C))
        M["LatBenchDate"] = benches[-1].stem.replace("bench-", "")[:10]
        M["LatQueries"] = str(sum(len(v["paths"]) for v in C.values()))

    # audit
    A = json.loads((DATA.parent / "experiment" / "data" / "audit_labels.json").read_text(encoding="utf-8"))["labels"]
    M["AuditN"] = str(len(A))
    M["AuditCorrect"] = str(sum(a["correct"] for a in A))
    M["AuditPct"] = pct(sum(a["correct"] for a in A), len(A))
    for lab, name in (("VERIFIED", "Ver"), ("NOT_FOUND", "NF"), ("WRONG_YEAR", "WY"), ("MISATTRIBUTED", "Mis")):
        sel = [a for a in A if a["label"] == lab]
        M[f"Audit{name}N"] = str(len(sel))
        M[f"Audit{name}Correct"] = str(sum(a["correct"] for a in sel))
    cat = Counter(a.get("category") for a in A if a["label"] == "NOT_FOUND")
    for c, name in (("fabricated", "Fab"), ("generic_no_match_near_year", "Generic"), ("real_misdated_misnamed", "Misdated"),
                    ("not_a_judgment", "NotJudgment"), ("verifier_miss", "Miss")):
        M[f"AuditNF{name}"] = str(cat.get(c, 0))


if __name__ == "__main__":
    main()
