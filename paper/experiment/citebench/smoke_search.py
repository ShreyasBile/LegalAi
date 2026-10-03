"""Check the search protocol end to end on items that are NOT in the benchmark (nothing is saved to results/)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from citebench.index import SCIndex
from citebench.run_models import BENCH, S_IDENTIFY, S_CITE, S_LIST, prompt_identify, prompt_cite, prompt_list
from citebench.run_search import episode

ix = SCIndex()
used = {j["id"] for j in BENCH["judgments"]}
# Githa Hariharan v. Reserve Bank of India (1999): not a benchmark judgment and not a T4 topic
row = next(r for r in ix.rows if "GITHA HARIHARAN" in r.title.upper())
assert row.id not in used
items = [
    ("T1-like", prompt_identify(row.neutral), S_IDENTIFY, 200),
    ("T2-like", prompt_identify("1999 INSC 9999"), S_IDENTIFY, 200),
    ("T3-like", prompt_cite({"petitioner": "Githa Hariharan", "respondent": "Reserve Bank of India",
                             "decision_date": row.decision_date}), S_CITE, 200),
    ("T4-like", prompt_list("Whether the mother can be the natural guardian of a minor during the father's lifetime "
                            "under the Hindu Minority and Guardianship Act, 1956."), S_LIST, 600),
]
spec = sys.argv[1] if len(sys.argv) > 1 else "llama3.1:8b@11435"
model, host = spec.rsplit("@", 1)
print("truth:", row.id, row.title, row.decision_date, row.scr, row.neutral)
for name, prompt, schema, npred in items:
    r = episode(ix, int(host), model, prompt, schema, npred)
    print(f"\n== {name}: stop={r['stop']} tools={r['n_tool_calls']} ms={r['ms']} prompt_tokens={r['prompt_eval_count']}")
    for s in r["steps"]:
        print("   ", s["action"], repr(s["query"]), s.get("result_ids"))
    print("   final:", r["raw"][:400])
