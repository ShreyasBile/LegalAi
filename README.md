# LegalAI

A litigation-workspace prototype for Indian advocates, the data services behind it, and research on how reliably
language models cite Indian Supreme Court judgments. It has four parts:

| Folder | What it is | Status |
|---|---|---|
| [`lawyerai/`](lawyerai) | Web workspace: matters, calendar, documents, case chat, case-law search, eCourts. Vanilla JavaScript, no framework or build step. | **UI prototype.** Most screens run on built-in sample data (see below). The matter tabs, limitation calculator, reminders, Word export and evidence reading are working tools that save in your browser. |
| [`caselaw-db/`](caselaw-db) | PostgreSQL 17 catalogue of 19.3 million Indian court judgments and orders (Supreme Court + 25 High Courts) with a search API. | **Working on real data.** |
| [`ecourts-service/`](ecourts-service) | Microservice that turns an eCourts case lookup into a JSON API (cache, API keys, rate limits, drift checks). | **Working on sample data.** The live scraper was never run. |
| [`paper/`](paper) | IEEE-format paper and all research code: citation verifier, an open citation graph of 38,357 Supreme Court judgments, retrieval, and model experiments. | Complete draft. |

## What is real and what is not

Real and tested:
- Case-law catalogue and search over **19,319,963** records (Supreme Court 38,366; High Courts 19,281,597), loaded from the
  public AWS Open Data archive. Exact lookup by CNR, neutral citation and S.C.R. citation; full-text and typo-tolerant search;
  PDF links to the archive (no PDFs are stored).
- The eCourts service's architecture and its **83 tests**.
- All research code and results in `paper/`.
- The workspace's working tools, all in the browser and each with unit and/or browser tests (**141 unit tests**,
  `cd lawyerai && npm test`; the browser suites drive the real pages with Playwright):
  - **Build the case** tabs on a matter. *Research:* search judgments and pin authorities, keep notes, save an Ask AI answer as
    a note. *Evidence:* record documents, build a dated chronology, and read the documents' text (below). *Arguments:* points
    with linked authorities, risks and counter-arguments. *Drafting:* a library of document formats (ten built in, and the
    user's own, each of which can be made the default for its document type) that every new draft follows.
  - **Word export.** A real `.docx` (the OOXML and ZIP are written in the browser and checked with python-docx and
    LibreOffice) with paper size, margins, font, line spacing, numbering and page numbers. **Court rules** are profiles the
    user enters; the app ships no court's rules, and warns where a draft departs from the profile you entered.
  - **Para-wise replies.** Paste the plaint or notice; the tool numbers its paragraphs and builds the reply paragraph by
    paragraph from the stance you choose for each (admitted, denied, partly, no knowledge, legal). It words the stance; it
    never writes the substance — that stays a visible `[____]`.
  - **Version history and review comments.** Every draft keeps its versions (the latest 12), with a word-level redline
    between any two and restore. A reviewer's comments are attached to a section and can be replied to and resolved.
  - **Limitation and deadlines.** 27 built-in periods (suits, pleadings, appeals and review, forums and statutes, cheque
    dishonour) with the source named, your own periods, time excluded for certified copies where the law allows it, Sundays,
    your court's closures, and the day the court reopens. Saved dates appear on the Calendar, Today and Reminders.
    **Check every period against the current statute and the court's own rules before relying on it.**
  - **WhatsApp reminders.** Hearing and deadline reminders are prepared from editable templates, with the client's number and
    consent. The button opens WhatsApp with the message written; **you press send** — the app cannot send messages itself.
  - **Reading evidence.** For each document you can read its text: text files, Word files and PDFs with a text layer are read
    directly; scanned pages and photos are read by OCR in **English, Hindi and Marathi** (Tesseract in your browser). The files are never
    uploaded or stored — only the text is kept, in this browser's IndexedDB. You can then search across the documents, see the
    dates and rupee amounts each one mentions (Devanagari digits and month names included) and add them to the chronology, and
    see a list of **possible inconsistencies** where two documents give different dates or amounts next to the same word.
    That list is pattern matching, not understanding: it is a place to look, never a finding, and OCR can misread a digit.
    Correct the text by hand where it has.

**Sample or simulated, not real:**
- The workspace's matters, hearings, calendar notes, knowledge graph and the demo evidence documents are hard-coded sample
  data. What it saves is what you add or change: on a matter's tabs, your document formats and court rules, draft approvals,
  versions and comments, saved deadlines, reminders and contacts. All of it is kept in this browser (`localStorage`, and
  IndexedDB for document text), not on a server, so it is not shared between people or devices. A matter created through the
  guided intake is itself not saved, so what you add to it is lost on reload.
- **Comments and approvals are not multi-user.** A reviewer's name is typed in, not signed in, and a draft's history lives on
  one computer. Real senior-review workflow needs accounts and a server.
- **Drafting does not use AI.** A draft is your chosen format filled with what is already recorded for the matter; where the
  matter has nothing it leaves a visible `[____]`, and you write the rest. The built-in formats are general starting points,
  not legal advice. Export is allowed only after you approve a draft.
- **No translation.** Translating orders or drafts (for example between English, Hindi and Marathi) is not built: doing it
  honestly needs a translation model or service, and nothing here calls one. OCR can read Hindi and Marathi text; it does not
  translate it.
- **OCR quality varies.** It was checked on clean, typed Hindi, Marathi and English pages and read them correctly, including
  digits. Handwriting, poor photographs, stamps and skewed scans will be read worse; the reader shows an overall confidence
  and the text can be corrected by hand.
- **"Ask AI" is not an AI.** Its replies come from keyword matching in the browser. Text such as "verified against the
  knowledge graph" is a fixed label.
- "Save to matter" and "export" on the sample pages only show a confirmation message.
- The eCourts service answers from saved HTML fixtures and a made-up index of 8 cases. Its live mode (Playwright plus a
  CAPTCHA solver) was written but **never run** against the real portal.
- The retriever, verifier and language models in `paper/` are **not** connected to the workspace.

The original proposal also described LangGraph/CrewAI agents, a Neo4j knowledge graph and a vector store inside the product.
None of that is implemented.

## Run it

Requires Node.js 20+. Python 3.13 for the data scripts.

```bash
# workspace (http://localhost:4173) and its unit tests
cd lawyerai && node server.mjs
cd lawyerai && npm test

# eCourts service on sample data (http://localhost:8080) and its tests
cd ecourts-service && cp .env.example .env && npm start
npm test
```

### OCR and PDF libraries

Reading a PDF or a scanned page loads two libraries on demand: pdf.js and Tesseract (about 2–4 MB of code, then 1.5–3 MB of
language data per language). By default they come from the jsDelivr CDN at pinned versions (pdf.js 4.10.38, tesseract.js
5.1.1), so the first scan read needs the internet; the document itself is never sent anywhere. Word and text files need neither.
To run offline, host the files yourself and set this before `extract.js` loads:

```html
<script>window.LEGALAI_LIBS = { pdfjs: '/vendor/pdf.min.mjs', pdfjsWorker: '/vendor/pdf.worker.min.mjs',
  tesseract: '/vendor/tesseract.min.js', tesseractWorker: '/vendor/worker.min.js',
  tesseractCore: '/vendor/tesseract-core/', langPath: '/vendor/lang' };</script>
```

`langPath` holds `eng.traineddata.gz`, `hin.traineddata.gz` and `mar.traineddata.gz` (npm: `@tesseract.js-data/eng|hin|mar`, folder
`4.0.0_best_int`); `tesseractCore` is the `tesseract.js-core` package folder. They must be served with CORS headers if on another origin.

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
`src` and `dst` are row ids of the author's PostgreSQL table, so on their own they mean nothing.
[`paper/experiment/graph/node_ids.csv.gz`](paper/experiment/graph/node_ids.csv.gz) maps every Supreme Court row id (38,366 rows, 29,498 of
them in the graph) to the archive's record id and CNR, the neutral citation, the S.C.R. citation, the title, the decision date and
the PDF path in the AWS bucket `s3://indian-supreme-court-judgments/`. Joining the two files reproduces the paper's most cited judgments
(*Maneka Gandhi*, 261 citing judgments). Regenerate it with `python graph/export_ids.py` (needs the database).

Not included (too large, rebuilt by the scripts above): the downloaded text, the headnote embeddings, and
`graph/units.jsonl` (every resolved and unresolved citation, 51 MB).

## Known issues

- Default credentials: the eCourts service falls back to demo API keys (`demo-key-firm-a`, `demo-admin-key`) and the workspace
  ships a demo key in the browser. Change them before exposing anything beyond localhost.
- All three Node servers listen on `127.0.0.1` only. Set `HOST=0.0.0.0` to share one on your network. The eCourts service then refuses to
  start while it still accepts a published demo key (set `API_KEYS` and `ADMIN_KEY`); the other two have no keys, so do not expose them.
- The archive's `year` for a Supreme Court judgment is its law-report year, so 5,179 of 38,366 differ from the decision year. A search
  restricted to the Supreme Court filters by decision date and shows the decision year; a search over all courts still filters on
  `year` (an OR across the two rules defeats the index and takes minutes on 19 M rows), so Supreme Court rows can be off by one year at
  the edges of a year range there.
- The workspace is a demo with a fixed "today" (`TODAY_ISO` in `lawyerai/app.js`, 11 September 2026) so that its sample hearings and deadlines stay
  consistent. The anticipatory-bail matter now cites BNSS s.482 (formerly CrPC s.438), as the sample FIR is from 2026.

- The sample Post-judgment matter (MACT award) is internally inconsistent: it lists a 90-day appeal window, but its hard-coded
  appeal deadline (2 October 2026) is 30 days after the 2 September judgment. Sample data only; the Limitation page works the
  period out from the rule you pick.

## Data and licence

Code: MIT, see [LICENSE](LICENSE).

Judgments and their metadata come from the AWS Open Data registry, published under CC-BY-4.0 by Dattam Labs:
[Indian Supreme Court Judgments](https://registry.opendata.aws/indian-supreme-court-judgments/) and
[Indian High Court Judgments](https://registry.opendata.aws/indian-high-court-judgments/). Entries are catalogue records:
verify every citation against the official record before relying on it.

## How this was built

Most of the code, the experiments and the paper draft were written with Claude (Anthropic) through Claude Code, under the
author's direction. The paper's Acknowledgment says the same.
