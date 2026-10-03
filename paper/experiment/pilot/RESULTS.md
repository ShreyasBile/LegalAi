# Citation-graph pilot (2026-09-30)

Question: can the citations inside Supreme Court judgments be resolved to judgments in our index reliably enough to build an
open citation graph? Sample: 502 judgments (70 reference + 54 random per period, 1950s-2020s, seed "pilot-2026").
PDFs from the public bucket (CC-BY-4.0), 624 MB, in `pdf/`; extracted text in `text/`.

## Text
- 502/502 PDFs have a text layer (scanned pages with a hidden OCR layer, font `HiddenHorzOCR`); no extra OCR needed.
- Clean-word share 95.4-97.7% by decade (proxy: share of 4+-letter tokens found in >=3 pilot judgments); the judgment's
  party names are on pages 1-2 for 95-99%.
- Random sample means: 0.51 MB PDF, 15.7 pages, 36k characters. Full 38,366: ~20 GB PDFs (~70 min download), ~1.4 GB text
  (rough: the sample is equal across periods, not proportional to the corpus).

## Citations (citations.py, analyze.py, final_eval.py)
- 10,423 citations found (S.C.R. 5,568; SCC 3,680; AIR 847; other-court AIR 292; neutral 36). Era matters: before 1990 mostly
  S.C.R.; from 2000 mostly SCC; 2010s-2020s often give a parallel S.C.R. number.
- Pipeline: exact S.C.R./neutral number -> SCC/AIR next to a parallel S.C.R. number -> name + year through the verifier
  (unique candidates only); number/name conflicts dropped.
- 432 random judgments (not used for development): 2,431 distinct (judgment, citation) pairs, 1,687 edges (69.4%):
  987 exact number, 385 SCC via parallel number, 315 name + year. Unresolved: 232 S.C.R. numbers not in index, 377 SCC, 133 AIR.
- Accuracy without labels: for S.C.R. mentions with a name, name + year reached the same judgment as the number in 856 of 884
  cases where it found something (96.8%); finds nothing for 54% (OCR noise, margin letters, truncated names).
  Of the 28 disagreements most are truncated names (name wrong, number right); a few are OCR digit errors (number wrong).
- Hand check (single annotator: Claude): 30 of 30 name-only edges correct.
- Sanity: most cited within the pilot: Maneka Gandhi (28), A.K. Gopalan (19), Kesavananda Bharati (15), Minerva Mills (14).

## What did not work
- A window-based resolver (match words before/after the citation instead of a parsed name) was worse: precision 84%, recall 39%.

## Known fixable failures
- Margin letters A-H inside names ("A. R. F Antulay", "Minerva B Mills"): strip single capitals without a period.
- Junk words from the preceding sentence; OCR slips ("Shtvakant", "oflndia").

## Not measured
- Recall against the true citation set; short-form references ("Maneka Gandhi's case"); treatment (followed/overruled);
  how many unresolved SCC/AIR citations are cases outside the index (High Courts, Privy Council, unreported).
