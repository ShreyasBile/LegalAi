# A real case to try every feature on

**Rajendra S/o Ramdas Kolhe v. State of Maharashtra**, Criminal Appeal No. 2281 of 2011, Supreme Court of India, decided 15 May 2024 ([2024] 6 S.C.R. 740 : 2024 INSC 422).

A murder appeal (s.302 read with s.34 IPC) that turns on a dying declaration. The Supreme Court dismissed it. The case was picked from the project's own Supreme Court data because it has what the features need: a chronology with real dates, six prosecution witnesses whose statements the court summarises, a dying declaration with a time lacuna, several orders, and eight earlier judgments that the Court itself relies on (all eight are in the case-law database).

The judgment text is published by the Supreme Court and carried on the AWS Open Data registry under CC-BY-4.0 (Dattam Labs); see the main README. The text here was extracted from the official PDF.

## In the app

Matters → **Rajendra Kolhe v. State of Maharashtra** (the last one). It holds the facts, a 10-event chronology (one event flagged as an inconsistency), nine pinned authorities each linked to the judgment in the database, four arguments for the appellant, three points for the State, and three tasks. Every date, citation, paragraph number and witness name in it is checked against `01_judgment_full_text.txt` by `lawyerai/test/real-case.test.js`.

The matter starts with no documents and no drafts, so that adding evidence and writing a draft can be tried from nothing.

## The files, and what each one is for

| File | Use it for | What you should see |
| --- | --- | --- |
| `01_judgment_full_text.txt` | **Evidence → Add evidence**, tick *Read the text now* | 8,619 words read; 30 dates and 1 amount found; searching `Ex. 59` finds 23 matches in this file; *Add to chronology* opens with the date and a quotation filled in |
| `02_witness_statements.txt` | **Evidence → Compare witness statements** (needs a model). Paste the whole file; each blank-line-separated block is one witness | Points on which two witnesses differ. Any position the model attributes to a witness that is not in that witness's block is dropped, and the page says how many |
| `03_supreme_court_orders.txt` | **Case status → Digest a court order** (needs a model). Paste one order block, e.g. the final order | Appeal dismissed; surrender within two weeks; next date `not stated in the order` |
| `04_draft_to_check.txt` | **Drafting → Citation check** (it works with pasted text, so no draft is needed). Paste the whole file; no model needed | 8 found: **4 confirmed** (Khushal Rao, Ashabai, Lakhan, Sher Singh), **wrong number** (Paniben: `[1992] 9 S.C.R. 197`, the real one is `[1992] 2 S.C.R. 197`), **belongs to another case** (Rajendra Kolhe given Khushal Rao's number), **not found** (Verma v. State of Karnataka, invented), **cannot be checked** (State v. Rao, a High Court case) |

## Other things to try

- **Limitation dates**: *Review petition in the Supreme Court*, start date 15 May 2024 → last date Friday 14 June 2024 (30 days, the day of the judgment left out).
- **Research**: the nine authorities are pinned. Search `Rajendra Kolhe` to find this judgment in the database; the Bombay High Court judgment under appeal also appears.
- **Drafting → Written submissions → Auto**: the form arrives filled from the matter. The draft may cite only the nine pinned authorities, and the citations in it are checked in the same response.
- **Argue the other side** (Arguments), **Chronology and cross-examination questions from the documents** (Evidence) and **Write a WhatsApp update for the client** (Hearing prep) are model tools; see the next section for what a small model does with them.

## What to expect and what not to

- The model tools do not need OpenRouter: a local model works too (Settings → AI, address `http://localhost:11434/v1`). A small local model (7B) ran all of them and produced readable but thin answers: it found no real contradiction between these witnesses, its counter-arguments repeated the question, and its Hindi client note called the Supreme Court "the High Court". Use a stronger model for anything beyond a check of the plumbing, and read every answer.
- **Sudhakar v. State of Madhya Pradesh** (pinned) is not found by name: the archive spells it `SHUDHAKAR`, and the search matches whole words. It is found by its number, `[2012] 7 S.C.R. 128`.
- The case-law search reads titles, parties and citations, not what a judgment says, so a subject such as `dying declaration` finds nothing.
- **Case status** says *Not yet synced* for this matter: the eCourts service in the project only has sample records.
- The app's "today" is fixed at 11 September 2026 (the sample-data date), so day counts such as *819 days ago* are measured from that date, not from the real clock.
- There is no Hindi or Marathi document in this case, so the scanned-page reading (OCR) and *Summarise a Hindi or Marathi document in English* have nothing to read here.
- `01_judgment_full_text.txt` is the whole published judgment of a criminal case and the matter names the real parties. It is public court record, but think about it before copying it anywhere else.
