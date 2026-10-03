# LegalAI

A litigation-workspace prototype for Indian advocates, the data services behind it, and research on how reliably
language models cite Indian Supreme Court judgments. It has four parts:

| Folder | What it is | Status |
|---|---|---|
| [`lawyerai/`](lawyerai) | Web workspace: matters, calendar, documents, case chat, case-law search, eCourts. Vanilla JavaScript, no framework or build step. | **UI prototype.** Most screens run on built-in sample data (see below). |
| [`caselaw-db/`](caselaw-db) | PostgreSQL 17 catalogue of 19.3 million Indian court judgments and orders (Supreme Court + 25 High Courts) with a search API. | **Working on real data.** |
| [`ecourts-service/`](ecourts-service) | Microservice that turns an eCourts case lookup into a JSON API (cache, API keys, rate limits, drift checks). | **Working on sample data.** The live scraper was never run. |
| [`paper/`](paper) | IEEE-format paper and all research code: citation verifier, an open citation graph of 38,357 Supreme Court judgments, retrieval, and model experiments. | Complete draft. |

## What is real and what is not

Real and tested:
- Case-law catalogue and search over **19,319,963** records (Supreme Court 38,366; High Courts 19,281,597), loaded from the
  public AWS Open Data archive. Exact lookup by CNR, neutral citation and S.C.R. citation; full-text and typo-tolerant search;
  PDF links to the archive (no PDFs are stored).
- The eCourts service's architecture and its **79 tests**.
- All research code and results in `paper/`.

**Sample or simulated, not real:**
- The workspace's matters, hearings, deadlines, documents, notes, reminders, audit log and knowledge graph are hard-coded
  sample data, and nothing is saved when the page reloads.
- **"Ask AI" is not an AI.** Its replies come from keyword matching in the browser. Text such as "verified against the
  knowledge graph" is a fixed label.
- WhatsApp reminders, "save to matter" and "export" only show a confirmation message.
- The eCourts service answers from saved HTML fixtures and a made-up index of 8 cases. Its live mode (Playwright plus a
  CAPTCHA solver) was written but **never run** against the real portal.
- The retriever, verifier and language models in `paper/` are **not** connected to the workspace.

The original proposal also described LangGraph/CrewAI agents, a Neo4j knowledge graph and a vector store inside the product.
None of that is implemented.

## Run it

Requires Node.js 20+. Python 3.13 for the data scripts.

```bash
# workspace (http://localhost:4173)
cd lawyerai && node server.mjs

# eCourts service on sample data (http://localhost:8080) and its tests
cd ecourts-service && cp .env.example .env && npm start
npm test
```

### Case-law database and API

```bash
# 1. Postgres 17 with a database named caselaw, bound to this machine only; choose your own password
docker run -d --name caselaw-pg -p 127.0.0.1:5433:5432 -e POSTGRES_PASSWORD=<choose-one> -e POSTGRES_DB=caselaw \
  -v caselaw_pgdata:/var/lib/postgresql/data postgres:17

# 2. the password is never read from the source: export it in your shell
export PGPASSWORD=<the-same-password>        # PowerShell: $env:PGPASSWORD = "<the-same-password>"

# 3. schema, then load (reads Parquet straight from the public S3 buckets), repair, link-check
cd caselaw-db && pip install -r requirements.txt
docker exec -i caselaw-pg psql -U postgres -d caselaw < schema.sql
python load_metadata.py sc            # or: all-hc   (the database is about 32 GB after the full load)
python repair_mobile_rows.py && python resolve_mobile_pdfs.py
docker exec -i caselaw-pg psql -U postgres -d caselaw < indexes_browse.sql

# 4. API (http://localhost:8090) and tests
npm install && npm start
npm test
```

## The research

Paper: [`paper/ieee/main.pdf`](paper/ieee/main.pdf). Title: *An Open Citation Graph of 38,357 Indian Supreme Court
Judgments: Graph-Ranked Retrieval Lifts Small Models' Hit Rate on Deciding Judgments from 30% to 83%.*

What was measured (all numbers are generated from the saved results in `paper/experiment/results` and `graph`):
- **Citation graph:** citations extracted from the text of 38,357 Supreme Court judgments and resolved to judgments in the
  index: 109,370 distinct links. Where a citation number allows a check, links resolved by party names alone reach the same
  record as the number in 97.1% of 46,091 cases.
- **Retrieval:** BM25 + bge-m3 embeddings over the reporters' headnotes, plus a citation-count prior. On 1,000 held-out
  judgments (their own citations are the labels), recall@10 is 0.204 with the prior and 0.167 without.
- **Language models** (Llama 3.1 8B, Qwen3 8B, Gemma 3 4B, Qwen2.5-VL 7B, 4-bit, via Ollama): the share of answers naming a
  judgment that decided the question rises from 30% from memory to 83% with subject search and the prior (48 to 133 of 160).

Limits worth knowing: only small open models were tested; the reference answers for the 40 legal questions, the verifier
audit labels and the manual graph check were each produced by a single annotator (the AI assistant), not independently.
See the paper's Discussion.

To reproduce, run from `paper/experiment` (Ollama with the five models pulled; the scripts expect it on ports 11434/11435):

```bash
pip install -r requirements.txt
python citebench/run_models.py main llama3.1:8b@11435 qwen3:8b@11435 gemma3:4b@11435 qwen2.5vl:7b@11434   # T1-T4
python citebench/run_search.py  llama3.1:8b@11435 qwen3:8b@11435 gemma3:4b@11435 qwen2.5vl:7b@11434      # name search
python corpus/fetch_all.py 12            # downloads ~20 GB of PDFs from S3, keeps 518 MB of text
python retrieval/embed_headnotes.py      # bge-m3 embeddings of every headnote (GPU recommended)
python graph/build_graph.py 12           # citation graph
python retrieval/eval_recommend.py 300 1000 && python retrieval/eval_questions.py
python retrieval/run_retrieval.py retrieval llama3.1:8b@11435 qwen3:8b@11435 gemma3:4b@11435 qwen2.5vl:7b@11434
python retrieval/run_retrieval.py retrievalprior llama3.1:8b@11435 qwen3:8b@11435 gemma3:4b@11435 qwen2.5vl:7b@11434
python citebench/score.py && python citebench/make_tex.py          # then build paper/ieee/main.tex
```

The verifier, search protocol, reference answers and retrieval code are frozen with SHA-256 hashes in `paper/experiment/data/`.

### The citation graph file

[`paper/experiment/graph/edges.jsonl`](paper/experiment/graph/edges.jsonl): one line per resolved citation
(`src` cites `dst`, how it was resolved, which kind of citation). 153,382 lines give 109,370 distinct links.
**Limitation:** `src` and `dst` are row ids of the author's PostgreSQL table, not stable identifiers, so they map to
judgments only if you load the data yourself in the same order. A table mapping ids to citations and PDF paths is not
included yet.

Not included (too large, rebuilt by the scripts above): the downloaded text, the headnote embeddings, and
`graph/units.jsonl` (every resolved and unresolved citation, 51 MB).

## Known issues

- Default credentials: the eCourts service falls back to demo API keys (`demo-key-firm-a`, `demo-admin-key`) and the workspace
  ships a demo key in the browser. Change them before exposing anything beyond localhost.
- A malformed URL (for example `/%E0%A4`) crashes `ecourts-service` and `lawyerai/server.mjs`.
- Supreme Court year filters use the law-report year, so 5,179 judgments appear under the wrong year.
- The eCourts page fails on a case with no next-hearing date, and reopening "New matter" shows the previous answers.
- The demo anticipatory-bail matter cites CrPC s.438; that law was replaced by BNSS s.482 in July 2024.

## Data and licence

Code: MIT, see [LICENSE](LICENSE).

Judgments and their metadata come from the AWS Open Data registry, published under CC-BY-4.0 by Dattam Labs:
[Indian Supreme Court Judgments](https://registry.opendata.aws/indian-supreme-court-judgments/) and
[Indian High Court Judgments](https://registry.opendata.aws/indian-high-court-judgments/). Entries are catalogue records:
verify every citation against the official record before relying on it.

## How this was built

Most of the code, the experiments and the paper draft were written with Claude (Anthropic) through Claude Code, under the
author's direction. The paper's Acknowledgment says the same.
