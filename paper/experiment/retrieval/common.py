"""Shared helpers for the retrieval experiments: loading judgment text and cutting out the reporter's headnote.

Every judgment in the Supreme Court Reports starts with a headnote: the parties, date and bench, then a short summary of the
legal issues and holdings, then the start of the judgment proper ('CIVIL APPELLATE JURISDICTION: ...'). The headnote is what
we index for subject search; it has a few hundred words.
"""
import gzip, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = ROOT / "corpus" / "text"
MAX_HEAD = 3000          # characters of headnote kept
MIN_HEAD = 400

CUT = re.compile(r"(?:CIVIL|CRIMINAL|ORIGINAL|APPELLATE|WRIT|ADVISORY|SPECIAL LEAVE|REVIEW|CONTEMPT|TRANSFER|ELECTION|INCOME[- ]?TAX)"
                 r"[A-Za-z ,./-]{0,50}JURISDICTION|Case Law Reference|CASE LAW REFERENCE|\bJUDGMENT\b|List of Keywords")
MARGIN = re.compile(r"(?:\b[A-H]\b[ .]*){3,}")                                   # running margin letters 'A B C D E F G H'
RUNHEAD = re.compile(r"SUPREME COURT REPORTS\s*\[?\(?\d{4}[\])]?\s*(?:SUPP\.?\s*)?\d*\s*S\.?C\.?R\.?", re.I)


def read_text(i):
    p = TEXT / f"{i}.txt.gz"
    if not p.exists():
        return None
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return f.read()


def normalise(text):
    t = re.sub(r"\s+", " ", text)
    return re.sub(r"(\w)- (\w)", r"\1\2", t)                                    # words hyphenated across a line break


def headnote(text):
    """the headnote of a judgment: from the start to the first 'JURISDICTION' / 'Case Law Reference' marker, max MAX_HEAD chars"""
    t = normalise(text)
    m = CUT.search(t)
    end = m.start() if m and m.start() >= MIN_HEAD else min(len(t), 2500)
    h = t[:min(end, MAX_HEAD)]
    h = RUNHEAD.sub(" ", h)
    h = MARGIN.sub(" ", h)
    return re.sub(r"\s+", " ", h).strip()
