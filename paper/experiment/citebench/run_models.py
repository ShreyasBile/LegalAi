"""Run every benchmark item through each model via Ollama and save the raw responses (resumable).

    python citebench/run_models.py main llama3.1:8b@11435 qwen3:8b@11435 ...   # T1-T4
    python citebench/run_models.py t5   llama3.1:8b@11435 ...                    # after the verifier is frozen

Settings are identical for every model: temperature 0, fixed seed, JSON-schema constrained output, thinking
disabled for models that support it. Each response is appended to results/<model>.jsonl as soon as it arrives.
T5 (revision after verifier feedback) runs after a model finishes T4, only for questions where at least one
cited case was not VERIFIED.
"""
import json, sys, time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from citebench.verifier import verify, cases_of

BENCH = json.loads((ROOT / "data" / "benchmark.json").read_text(encoding="utf-8"))
RESULTS = ROOT / "results"
SEED = 7

SYSTEM = ("You are a careful legal research assistant for Indian law. Only state facts you are confident are accurate. "
          "If you do not know something, say so instead of guessing.")

S_IDENTIFY = {"type": "object", "properties": {"known": {"type": "boolean"}, "case_name": {"type": "string"},
                                                 "decision_date": {"type": "string"}},
              "required": ["known", "case_name", "decision_date"]}
S_CITE = {"type": "object", "properties": {"scr": {"type": "string"}, "neutral": {"type": "string"}}, "required": ["scr", "neutral"]}
S_LIST = {"type": "object", "properties": {"cases": {"type": "array", "items": {"type": "object", "properties": {
    "case_name": {"type": "string"}, "year": {"type": "integer"}, "citation": {"type": "string"}},
    "required": ["case_name", "year", "citation"]}}}, "required": ["cases"]}


def prompt_identify(cit):
    return (f"Which judgment of the Supreme Court of India is reported as {cit}? Give the case name (the parties, "
            f"in the form 'Petitioner v. Respondent') and the date of decision in YYYY-MM-DD format. If you do not know, "
            f"set known to false and leave case_name and decision_date empty.")


def prompt_cite(it):
    return (f"Give the citations of the Supreme Court of India judgment in {it['petitioner']} v. {it['respondent']}, "
            f"decided on {it['decision_date']}: (a) scr: its Supreme Court Reports citation in the form "
            f"[YEAR] VOLUME S.C.R. PAGE, and (b) neutral: its neutral citation in the form YEAR INSC NUMBER. "
            f"Use an empty string for any citation you do not know.")


def prompt_list(topic):
    return (f"List up to three judgments of the Supreme Court of India that are leading authorities on the following "
            f"question: {topic} For each judgment give the case name ('Petitioner v. Respondent'), the year of decision, "
            f"and one citation from any law report. Only include judgments you are confident exist.")


FEEDBACK_TEXT = {
    "VERIFIED": "found in the index",
    "WRONG_CITATION": "the parties match a real judgment, but the citation you gave does not point to it",
    "MISATTRIBUTED": "no judgment with these parties was found near that year; the citation you gave belongs to a different judgment",
    "WRONG_YEAR": "a judgment with these parties exists, but not in or near the year you gave",
    "NOT_FOUND": "no Supreme Court judgment with these parties was found near that year, and the citation does not exist in the index",
}


def feedback_text(v):
    """what the check found; NOT_FOUND is worded by whether the citation itself could be looked up"""
    if v["label"] == "NOT_FOUND" and v["citation_kind"] not in ("scr", "neutral"):
        return ("no Supreme Court judgment with these parties was found near that year "
                "(the citation is to a law report the index does not cover, so only the name and year were checked)")
    return FEEDBACK_TEXT[v["label"]]


def feedback_message(cases, verdicts):
    lines = [f"{i + 1}. {c.get('case_name', '')} ({c.get('year', '')}), {c.get('citation', '')}: {feedback_text(v)}."
             for i, (c, v) in enumerate(zip(cases, verdicts))]
    return ("I checked each case against an index of the reported judgments of the Supreme Court of India "
            "(Supreme Court Reports, 1950 onwards):\n" + "\n".join(lines) +
            "\nRevise your list. Keep only judgments you are confident exist, correct any wrong names, years or "
            "citations, and return fewer cases if you are unsure.")


THINK_BUDGET = 3000        # extra tokens allowed for the reasoning trace when thinking is enabled (ablation only)


def chat(host, model, messages, schema, num_predict, think=False):
    body = {"model": model, "messages": messages, "format": schema, "stream": False,
            "options": {"temperature": 0, "seed": SEED, "num_ctx": 8192 if think else 4096,
                        "num_predict": num_predict + (THINK_BUDGET if think else 0)}}
    if model.startswith("qwen3"):
        body["think"] = think
    t0 = time.time()
    r = requests.post(f"http://127.0.0.1:{host}/api/chat", json=body, timeout=900)
    if r.status_code == 500 and "repeat limit" in r.text:
        # Ollama aborts a generation stuck repeating one token: a model failure, recorded as an invalid output
        return {"raw": "", "parsed": None, "ms": round((time.time() - t0) * 1000), "eval_count": None,
                "done_reason": "aborted_repetition", "thinking_chars": 0, "error": r.json().get("error")}
    r.raise_for_status()
    j = r.json()
    raw = j["message"]["content"]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None
    return {"raw": raw, "parsed": parsed, "ms": round((time.time() - t0) * 1000),
            "eval_count": j.get("eval_count"), "done_reason": j.get("done_reason"),
            "thinking_chars": len(j["message"].get("thinking") or "")}


def run(spec, host, phase):
    """spec is an Ollama model tag, optionally with '+think' (Qwen3 with its reasoning mode switched on)"""
    model, think = spec.split("+")[0], spec.endswith("+think")
    chat_ = lambda h, m, msgs, sch, n: chat(h, m, msgs, sch, n, think)
    out = RESULTS / (spec.replace(":", "_").replace("/", "_").replace("+", "_") + ".jsonl")
    done = set()
    if out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            done.add(json.loads(line)["key"])
    info = requests.post(f"http://127.0.0.1:{host}/api/show", json={"model": model}, timeout=60).json()
    meta = {"model": spec, "host": host, "digest": None, "details": info.get("details"), "think": think}
    tags = requests.get(f"http://127.0.0.1:{host}/api/tags", timeout=60).json()
    for m in tags.get("models", []):
        if m["name"] == model:
            meta["digest"] = m.get("digest")
    (RESULTS / (out.stem + ".meta.json")).write_text(json.dumps(meta, indent=1), encoding="utf-8")

    items = []
    for it in BENCH["T1"] + BENCH["T2"]:
        items.append((f"{it['task']}|{it['form']}|{it['citation']}", prompt_identify(it["citation"]), S_IDENTIFY, 200, it))
    for it in ([] if think else BENCH["T3"]):          # the thinking ablation covers T1, T2 and T4 only
        items.append((f"T3|{it['truth_id']}", prompt_cite(it), S_CITE, 200, it))
    for it in BENCH["T4"]:
        items.append((f"T4|{it['topic_id']}", prompt_list(it["topic"]), S_LIST, 600, it))

    f = out.open("a", encoding="utf-8")
    t_start = time.time()
    todo = [x for x in items if x[0] not in done] if phase == "main" else []
    for n, (key, prompt, schema, npred, it) in enumerate(todo, 1):
        messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}]
        res = chat_(host, model, messages, schema, npred)
        f.write(json.dumps({"key": key, "task": it["task"], "prompt": prompt, **res}, ensure_ascii=False) + "\n")
        f.flush()
        if n % 25 == 0 or n == len(todo):
            print(f"[{spec}] {n}/{len(todo)}  {time.time() - t_start:.0f}s", flush=True)

    if phase != "t5":
        f.close()
        print(f"[{spec}] main phase done; {time.time() - t_start:.0f}s", flush=True)
        return

    # T5: revision after verifier feedback (run only once the verifier is final)
    ix = SCIndex()
    records = {json.loads(l)["key"]: json.loads(l) for l in out.read_text(encoding="utf-8").splitlines()}
    n5 = 0
    for it in BENCH["T4"]:
        k4, k5 = f"T4|{it['topic_id']}", f"T5|{it['topic_id']}"
        if k5 in records:
            continue
        cases = cases_of(records[k4]["parsed"])
        verdicts = [verify(ix, c.get("case_name"), c.get("year"), c.get("citation")) for c in cases]
        if not cases or all(v["label"] == "VERIFIED" for v in verdicts):
            continue
        messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt_list(it["topic"])},
                    {"role": "assistant", "content": records[k4]["raw"]},
                    {"role": "user", "content": feedback_message(cases, verdicts)}]
        res = chat_(host, model, messages, S_LIST, 600)
        f.write(json.dumps({"key": k5, "task": "T5", "prompt": messages[-1]["content"], **res}, ensure_ascii=False) + "\n")
        f.flush()
        n5 += 1
    f.close()
    print(f"[{spec}] done; T5 revisions run: {n5}; total {time.time() - t_start:.0f}s", flush=True)


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    phase = sys.argv[1]                    # "main" (T1-T4) or "t5"
    assert phase in ("main", "t5")
    for spec in sys.argv[2:]:
        m, host = spec.rsplit("@", 1)
        run(m, int(host), phase)
