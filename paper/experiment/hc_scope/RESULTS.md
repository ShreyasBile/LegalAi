# High Court scope check (2026-09-30)

Question: could the citation graph / retrieval be extended from the Supreme Court to the 19.3M High Court records?
Scripts in this folder (seeded random samples; HEAD requests only, nothing downloaded).

- PDF size (hc_size.py; 300 uniformly sampled linked records, all 300 HEAD requests returned a size): mean 86 KB
  (95% CI +/- 17 KB), median 53 KB, p10 17 KB, p90 146 KB, max 1.5 MB. Estimated total for 19,281,597 linked records:
  1.67 TB (range 1.34-2.00 TB). The Supreme Court corpus is ~20 GB for 38k judgments (mean 0.51 MB).
- Metadata (hc_fields.py; 5,592 sampled records): citation 0.0%, neutral_citation 0.0%; title 100%, petitioner/respondent 99.9%,
  case_type 98.9%, disposal_nature 93.7%, judges 85.8%. Titles look like 'CR. MISC./43052/2008 of X Vs STATE OF BIHAR'.
- Snippet (hc_snip.py; 2,625 snippets): at most 150 characters, a page header (court, case number, parties); no legal text.
- Consequence: the exact-number tiers (70% of Supreme Court graph links) do not exist for High Courts; there is no reporter
  headnote; retrieval needs full text; at the Supreme Court download rate (~9-10 PDFs/s, unmeasured for smaller files) a full
  download is weeks of continuous running and far exceeds the ~60 GB free on D:.
- Possible affordable extension (not run): High Court -> Supreme Court citation edges on a sample of judgments from a few courts,
  resolved with the existing Supreme Court pipeline.
