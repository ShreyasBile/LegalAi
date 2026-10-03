"""The two tools a model can call in the search condition, over the same Supreme Court index the verifier uses.

search(query)  judgments whose party names best match the query words (IDF-weighted F1, index.SCIndex.name_score;
               candidates include spelling variants of the query's most specific words); a year in the query only
               breaks ties
lookup(query)  the judgment(s) with a neutral citation (YEAR INSC NUMBER) or S.C.R. citation in the query

Both return (text shown to the model, list of row ids shown). The index holds names, dates and citations only,
so neither tool can search by subject.
"""
import re

from .index import tokens, norm_neutral, norm_scr
from .verifier import citation_kind

K = 6                                   # results shown per search
YEAR_RE = re.compile(r"\b(19[5-9]\d|20[0-2]\d)\b")
# citations to other law reports ('AIR 1978 SC 597', '(2017) 10 SCC 1', '2019 SCC OnLine SC 12'): not searchable
OTHER_REPORT_RE = re.compile(r"\bAIR\s*\(?\s*\d{4}|\d{4}\s*\)?\s*AIR\b|\bSCC\b|\bSCALE\b|\bJT\s*\d{4}|\bCri\s*LJ\b", re.I)
FUZZY = 0.85


def variants(ix, word):
    """index words that are spelling variants of a query word (5+ letters), whether or not the word itself occurs:
    titles contain OCR errors ('MACHHL' for 'Machhi') and transliteration variants"""
    if len(word) < 5:
        return []
    from difflib import SequenceMatcher
    pool = ix.vocab_by_len.get(len(word), []) + ix.vocab_by_len.get(len(word) - 1, []) + ix.vocab_by_len.get(len(word) + 1, [])
    return [y for y in pool if y != word and SequenceMatcher(None, word, y).ratio() >= FUZZY]


def fmt_row(i, r):
    name = f"{r.petitioner} versus {r.respondent}" if (r.petitioner and r.respondent) else r.title
    return f"{i}. {name} | decided {r.decision_date} | S.C.R.: {r.scr or '-'} | neutral: {r.neutral or '-'}"


def lookup(ix, query):
    kind = citation_kind(query)
    if kind == "neutral":
        rows = ix.by_neutral.get(norm_neutral(query), [])
    elif kind == "scr":
        rows = ix.scr_rows(norm_scr(query))
    else:
        return ("The index can only look up neutral citations (YEAR INSC NUMBER) and Supreme Court Reports "
                "citations ([YEAR] VOLUME S.C.R. PAGE).", [])
    rows = sorted(rows, key=lambda r: r.id)[:K]
    if not rows:
        return "No judgment in the index has this citation.", []
    return "\n".join(fmt_row(i + 1, r) for i, r in enumerate(rows)), [r.id for r in rows]


def search(ix, query):
    if citation_kind(query) in ("neutral", "scr"):
        return lookup(ix, query)
    if OTHER_REPORT_RE.search(query or ""):
        return ("Search looks for party names. The index cannot look up SCC, AIR or other law-report citations; "
                "search by the names of the parties instead.", [])
    a = set(tokens(query))
    if not a:
        return "The query contains no party-name words to search for.", []
    m = YEAR_RE.search(query or "")
    year = int(m.group(1)) if m else None
    rare = sorted(a, key=lambda t: -ix.idf.get(t, ix.idf_unknown))[:3]
    look = set(rare) | {v for t in rare for v in variants(ix, t)}
    cand = {r.id: r for t in look for r in ix.postings.get(t, [])}.values()
    scored = [(ix.name_score(a, r), r) for r in cand]
    scored = sorted(((s, r) for s, r in scored if s > 0),
                    key=lambda x: (-round(x[0], 6), abs(x[1].dyear - year) if year else 0, x[1].id))[:K]
    if not scored:
        return "No judgment in the index matches these party names.", []
    return "\n".join(fmt_row(i + 1, r) for i, (_, r) in enumerate(scored)), [r.id for _, r in scored]
