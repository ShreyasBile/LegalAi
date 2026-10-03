"""T4 with topic search: the model can search the judgments by title or headnote (subject matter), not only by party names.

    python retrieval/run_retrieval.py <condition> <model@port> ...
    conditions:  retrieval        BM25 + dense fusion
                 retrievalprior   the same plus the citation prior (weights chosen on the recommendation dev split)

Same protocol as run_search.py: one JSON action at a time (search / lookup / answer), at most 5 actions, then the final answer
in the T4 schema. Results: results/<model>_<condition>.jsonl (T4 only), scored by score.py.
"""
import json, re, sys, time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex
from citebench.run_models import BENCH, RESULTS, SYSTEM, S_LIST, prompt_list
from citebench.run_search import call, S_ACTION, MAX_ACTIONS
from citebench import search_tools
from retrieval.engine import Engine
from retrieval.queries import BENCH_END

K = 6
SNIPPET = 280
WEIGHTS = {"retrieval": (1.0, 1.0, 0.0)}            # 'retrievalprior' weights are read from results_recommend.json

TOOLS = (
    "Before you answer, you can search an index of the reported judgments of the Supreme Court of India (1950 onwards). For each "
    "judgment the index holds the parties, the date of decision, the Supreme Court Reports (S.C.R.) citation and neutral citation, "
    "and the headnote: the reporter's summary of the legal issues and holdings. It cannot look up SCC, AIR or other law-report citations.\n"
    "Actions:\n"
    "- search: finds the judgments whose title or headnote best match your query. You can search by subject (for example the legal "
    "question) or by party names: {\"action\": \"search\", \"query\": \"<words>\"}\n"
    "- lookup: finds the judgment with a given S.C.R. citation (form [YEAR] VOLUME S.C.R. PAGE) or neutral citation (form YEAR INSC NUMBER): "
    "{\"action\": \"lookup\", \"query\": \"<citation>\"}\n"
    "- answer: when you are ready: {\"action\": \"answer\", \"query\": \"\"}. You will then be asked for your final answer.\n"
    f"Reply with one action at a time. You can take at most {MAX_ACTIONS} search or lookup actions."
)


def snippet(eng, i):
    h = eng.head[i]
    m = BENCH_END.search(h[:600]) or re.search(r"\]", h[:500])
    h = h[m.end():] if m else h
    return re.sub(r"\s+", " ", h).strip()[:SNIPPET]


def make_tools(eng, ix, w):
    def search(query):
        if re.search(r"\bINSC\b|S\.?C\.?R", query or "", re.I):
            return search_tools.lookup(ix, query)
        ids = eng.search(query, k=K, w=w)
        if not ids:
            return "No judgment matches this query.", []
        lines = []
        for n, i in enumerate(ids, 1):
            mt = eng.meta[i]
            lines.append(f"{n}. {mt['title'].replace(' versus ', ' v. ')} | decided {mt['date']} | S.C.R.: {mt['scr'] or '-'} | "
                         f"neutral: {mt['neutral'] or '-'}\n   Summary: {snippet(eng, i)}")
        return "\n".join(lines), ids
    return search, lambda q: search_tools.lookup(ix, q)


def episode(tools, host, model, prompt):
    search, lookup = tools
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt + "\n\n" + TOOLS}]
    steps, shown, ms, stop = [], [], 0, "budget"
    for i in range(MAX_ACTIONS + 1):
        res = call(host, model, messages, S_ACTION, 150)
        ms += res["ms"]
        p = res["parsed"] if isinstance(res["parsed"], dict) else None
        action = (p or {}).get("action")
        query = str((p or {}).get("query") or "")
        step = {"action": action, "query": query, "ms": res["ms"], "done_reason": res["done_reason"], "prompt_eval_count": res["prompt_eval_count"]}
        if action not in ("search", "lookup"):
            if action != "answer":
                step["raw"] = res["raw"][:1000]
            steps.append(step)
            stop = "answer" if action == "answer" else "invalid_action"
            break
        if i == MAX_ACTIONS:
            step["over_budget"] = True
            steps.append(step)
            break
        text, ids = (search if action == "search" else lookup)(query)
        step["result_ids"] = ids
        steps.append(step)
        shown += [x for x in ids if x not in shown]
        left = MAX_ACTIONS - i - 1
        messages += [{"role": "assistant", "content": res["raw"]},
                     {"role": "user", "content": f"Result of {action} \"{query}\":\n{text}\n\n"
                                                 + (f"Reply with your next action ({left} search or lookup actions left)." if left
                                                    else "No search or lookup actions left; reply with the answer action.")}]
    if stop == "answer":
        messages.append({"role": "assistant", "content": json.dumps({"action": "answer", "query": ""})})
    messages.append({"role": "user", "content": "Now give your final answer to the original question.\n\n" + prompt})
    final = call(host, model, messages, S_LIST, 600)
    ms += final["ms"]
    n_tool = sum(1 for s in steps if s["action"] in ("search", "lookup") and not s.get("over_budget"))
    return {"raw": final["raw"], "parsed": final["parsed"], "ms": ms, "eval_count": final["eval_count"],
            "prompt_eval_count": final["prompt_eval_count"], "done_reason": final["done_reason"],
            "steps": steps, "n_tool_calls": n_tool, "stop": stop, "shown_ids": shown}


def main():
    cond = sys.argv[1]
    if cond == "retrievalprior":
        w = tuple(json.loads((Path(__file__).resolve().parent / "results_recommend.json").read_text())["hybrid+prior"]["weights"])
    else:
        w = WEIGHTS[cond]
    eng = Engine(ROOT / "graph" / "edges.jsonl")
    ix = SCIndex()
    tools = make_tools(eng, ix, w)
    print(f"condition {cond}, weights {w}, {len(eng.ids)} judgments", flush=True)
    for spec in sys.argv[2:]:
        model, host = spec.rsplit("@", 1)
        out = RESULTS / (model.replace(":", "_").replace("/", "_") + f"_{cond}.jsonl")
        done = {json.loads(l)["key"] for l in out.read_text(encoding="utf-8").splitlines()} if out.exists() else set()
        info = requests.post(f"http://127.0.0.1:{host}/api/show", json={"model": model}, timeout=60).json()
        meta = {"model": f"{model}+{cond}", "host": host, "details": info.get("details"), "weights": list(w), "max_actions": MAX_ACTIONS,
                "results_per_search": K, "snippet_chars": SNIPPET, "tasks": ["T4"]}
        (RESULTS / (out.stem + ".meta.json")).write_text(json.dumps(meta, indent=1), encoding="utf-8")
        t0 = time.time()
        with out.open("a", encoding="utf-8") as f:
            for it in BENCH["T4"]:
                key = f"T4|{it['topic_id']}"
                if key in done:
                    continue
                prompt = prompt_list(it["topic"])
                res = episode(tools, int(host), model, prompt)
                f.write(json.dumps({"key": key, "task": "T4", "prompt": prompt, **res}, ensure_ascii=False) + "\n")
                f.flush()
        print(f"[{model}+{cond}] done; {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
