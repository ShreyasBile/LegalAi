"""Search condition: the same T1-T4 items, but the model may search the Supreme Court index before answering.

    python citebench/run_search.py llama3.1:8b@11435 qwen3:8b@11435 gemma3:4b@11435 qwen2.5vl:7b@11434

Each item is an episode. The user message is the closed-book prompt (run_models.py) followed by a description
of two tools, search and lookup (search_tools.py). The model replies with one JSON action at a time, constrained
by a schema, {"action": "search" | "lookup" | "answer", "query": ...}; the tool's result is sent back as the next
user message. After "answer", or after MAX_ACTIONS tool calls, the model is asked for its final answer in the
task's own schema, which is scored exactly like the closed-book answer. The same protocol is used for every
model (Gemma 3 has no native tool calling in Ollama). Settings as in run_models.py (temperature 0, fixed seed,
thinking disabled), except an 8,192-token context to hold the tool results. Output: results/<model>_search.jsonl.
"""
import json, sys, time

import requests

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from citebench.index import SCIndex
from citebench.run_models import (BENCH, RESULTS, SEED, SYSTEM, S_IDENTIFY, S_CITE, S_LIST,
                                  prompt_identify, prompt_cite, prompt_list)
from citebench import search_tools

MAX_ACTIONS = 5
NUM_CTX = 8192
S_ACTION = {"type": "object", "properties": {"action": {"type": "string", "enum": ["search", "lookup", "answer"]},
                                              "query": {"type": "string"}}, "required": ["action", "query"]}

TOOLS = (
    "Before you answer, you can check facts in an index of the reported judgments of the Supreme Court of India "
    "(1950 onwards). For each judgment the index holds the names of the parties, the date of decision, the Supreme "
    "Court Reports (S.C.R.) citation and the neutral citation. It holds no text or subject matter, so search by the "
    "names of the parties, not by topic. It cannot look up SCC, AIR or other law-report citations.\n"
    "Actions:\n"
    "- search: finds the judgments whose party names best match your query (a year in the query is used to break "
    "ties): {\"action\": \"search\", \"query\": \"<party names>\"}\n"
    "- lookup: finds the judgment with a given S.C.R. citation (form [YEAR] VOLUME S.C.R. PAGE) or neutral citation "
    "(form YEAR INSC NUMBER): {\"action\": \"lookup\", \"query\": \"<citation>\"}\n"
    "- answer: when you are ready: {\"action\": \"answer\", \"query\": \"\"}. You will then be asked for your final answer.\n"
    f"Reply with one action at a time. You can take at most {MAX_ACTIONS} search or lookup actions."
)


def call(host, model, messages, schema, num_predict):
    body = {"model": model, "messages": messages, "format": schema, "stream": False,
            "options": {"temperature": 0, "seed": SEED, "num_ctx": NUM_CTX, "num_predict": num_predict}}
    if model.startswith("qwen3"):
        body["think"] = False
    t0 = time.time()
    r = requests.post(f"http://127.0.0.1:{host}/api/chat", json=body, timeout=900)
    if r.status_code == 500 and "repeat limit" in r.text:
        return {"raw": "", "parsed": None, "ms": round((time.time() - t0) * 1000), "eval_count": None,
                "prompt_eval_count": None, "done_reason": "aborted_repetition", "error": r.json().get("error")}
    r.raise_for_status()
    j = r.json()
    raw = j["message"]["content"]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None
    return {"raw": raw, "parsed": parsed, "ms": round((time.time() - t0) * 1000), "eval_count": j.get("eval_count"),
            "prompt_eval_count": j.get("prompt_eval_count"), "done_reason": j.get("done_reason")}


def episode(ix, host, model, prompt, schema, num_predict):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt + "\n\n" + TOOLS}]
    steps, shown, ms, stop = [], [], 0, "budget"
    for i in range(MAX_ACTIONS + 1):
        res = call(host, model, messages, S_ACTION, 150)
        ms += res["ms"]
        p = res["parsed"] if isinstance(res["parsed"], dict) else None
        action = (p or {}).get("action")
        query = str((p or {}).get("query") or "")
        step = {"action": action, "query": query, "ms": res["ms"], "done_reason": res["done_reason"],
                "prompt_eval_count": res["prompt_eval_count"]}
        if action not in ("search", "lookup"):
            if action != "answer":
                step["raw"] = res["raw"][:1000]
            steps.append(step)
            stop = "answer" if action == "answer" else "invalid_action"
            break
        if i == MAX_ACTIONS:                      # a tool call beyond the budget is not executed
            step["over_budget"] = True
            steps.append(step)
            break
        text, ids = (search_tools.search if action == "search" else search_tools.lookup)(ix, query)
        step["result_ids"] = ids
        steps.append(step)
        shown += [x for x in ids if x not in shown]
        left = MAX_ACTIONS - i - 1
        messages += [{"role": "assistant", "content": res["raw"]},
                     {"role": "user", "content": f"Result of {action} \"{query}\":\n{text}\n\n"
                                                 + (f"Reply with your next action ({left} search or lookup actions left)."
                                                    if left else "No search or lookup actions left; reply with the answer action.")}]
    # without a valid "answer" action the model's last reply is dropped, and it is asked for the answer anyway
    if stop == "answer":
        messages.append({"role": "assistant", "content": json.dumps({"action": "answer", "query": ""})})
    messages.append({"role": "user", "content": "Now give your final answer to the original question.\n\n" + prompt})
    final = call(host, model, messages, schema, num_predict)
    ms += final["ms"]
    n_tool = sum(1 for s in steps if s["action"] in ("search", "lookup") and not s.get("over_budget"))
    return {"raw": final["raw"], "parsed": final["parsed"], "ms": ms, "eval_count": final["eval_count"],
            "prompt_eval_count": final["prompt_eval_count"], "done_reason": final["done_reason"],
            "steps": steps, "n_tool_calls": n_tool, "stop": stop, "shown_ids": shown}


def run(spec, host):
    model = spec
    out = RESULTS / (spec.replace(":", "_").replace("/", "_") + "_search.jsonl")
    done = set()
    if out.exists():
        done = {json.loads(l)["key"] for l in out.read_text(encoding="utf-8").splitlines()}
    info = requests.post(f"http://127.0.0.1:{host}/api/show", json={"model": model}, timeout=60).json()
    meta = {"model": spec + "+search", "host": host, "digest": None, "details": info.get("details"),
            "max_actions": MAX_ACTIONS, "num_ctx": NUM_CTX, "results_per_search": search_tools.K}
    for m in requests.get(f"http://127.0.0.1:{host}/api/tags", timeout=60).json().get("models", []):
        if m["name"] == model:
            meta["digest"] = m.get("digest")
    (RESULTS / (out.stem + ".meta.json")).write_text(json.dumps(meta, indent=1), encoding="utf-8")

    items = []
    for it in BENCH["T1"] + BENCH["T2"]:
        items.append((f"{it['task']}|{it['form']}|{it['citation']}", prompt_identify(it["citation"]), S_IDENTIFY, 200, it))
    for it in BENCH["T3"]:
        items.append((f"T3|{it['truth_id']}", prompt_cite(it), S_CITE, 200, it))
    for it in BENCH["T4"]:
        items.append((f"T4|{it['topic_id']}", prompt_list(it["topic"]), S_LIST, 600, it))
    todo = [x for x in items if x[0] not in done]

    ix = SCIndex()
    t_start = time.time()
    with out.open("a", encoding="utf-8") as f:
        for n, (key, prompt, schema, npred, it) in enumerate(todo, 1):
            res = episode(ix, host, model, prompt, schema, npred)
            f.write(json.dumps({"key": key, "task": it["task"], "prompt": prompt, **res}, ensure_ascii=False) + "\n")
            f.flush()
            if n % 25 == 0 or n == len(todo):
                print(f"[{spec}+search] {n}/{len(todo)}  {time.time() - t_start:.0f}s", flush=True)
    print(f"[{spec}+search] done; {time.time() - t_start:.0f}s", flush=True)


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    for spec in sys.argv[1:]:
        m, host = spec.rsplit("@", 1)
        run(m, int(host))
