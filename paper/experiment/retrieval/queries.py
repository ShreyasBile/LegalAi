"""Citation-free queries: the headnote of a judgment with its bench line, every reporter citation, every 'X v. Y' case name and
every "'s case" reference removed, so that the query describes the legal issues without naming the precedents."""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from graph.citextract import find_cites
from retrieval.common import headnote

NAME_RE = re.compile(r"(?:\b[A-Z][\w.&'’-]*\s+){1,7}(?:v\.|vs\.?|versus)\s+(?:[A-Z][\w.&'’-]*[ ,]*){1,8}")
CASE_RE = re.compile(r"(?:[A-Z][\w.&'’-]*\s+){1,4}['’]?s?\s*case\b")
REF_RE = re.compile(r"\[\s*\d+[-\w, ]*\]")                                   # paragraph / page references like [403-C]
BENCH_END = re.compile(r"\bJ{1,2}\.?\s*[\]\)J]")                              # the end of the bench line: 'JJ.]', 'J.)', OCR 'JJ.J'
MAX_Q = 1800


def citation_free_query(text):
    t = headnote(text)
    m = BENCH_END.search(t[:600]) or re.search(r"\]", t[:500])
    if m:
        t = t[m.end():]                                                     # drop the title, date and bench line
    for c in reversed(find_cites(t)):
        t = t[:c["start"]] + " " + t[c["end"]:]
    t = NAME_RE.sub(" ", t)
    t = CASE_RE.sub(" ", t)
    t = REF_RE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()[:MAX_Q]
