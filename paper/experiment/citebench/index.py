"""In-memory view of the Supreme Court part of the case-law index, plus the name matcher.

Everything the benchmark and the verifier know about Supreme Court judgments comes from here:
one row per judgment in the `case_laws` table (source 'aws-sc'), loaded once from Postgres.
The decision year is taken from `decision_date` -- NOT from the `year` column, which for the
Supreme Court holds the year of the S.C.R. volume (it differs for 5,179 judgments).
"""
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher

import psycopg2

# No password in the source: set PGPASSWORD (or ~/.pgpass), or override the whole DSN with CASELAW_DSN.
DSN = os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")
# Known OCR errors in the source titles of benchmark judgments, corrected at load time (documented in the paper).
ERRATA = {22668: ("T.M.A. PAI FOUNDATION AND ORS.", None)}      # source: 'T.M.A. PAL FOUNDATION AND ORS.'
FUZZY = 0.85        # word-level similarity for transliteration variants (difflib ratio)
PREC_MIN = 0.8      # share of a cited name's own weight that must be matched (strict_score)
ANCHOR_DF = 100     # a word in at most this many judgments is distinctive enough to anchor a name-to-initial match

# words that carry no identifying information in an Indian case title
STOP = {
    "the", "of", "and", "v", "vs", "versus", "ors", "anr", "others", "other", "another", "etc", "a", "an",
    "in", "re", "by", "its", "through", "thr", "at", "for", "to", "on", "with", "or",
    "m", "s", "ms", "mr", "mrs", "sri", "shri", "smt", "dr", "km", "kumari",
    "lrs", "lr", "legal", "representatives", "dead", "deceased", "deed",
}
# state codes: expanded only after 'of' ('State of U.P.'); elsewhere 'M.P. Sharma' is a person's initials
STATE_ABBR = {"up": ["uttar", "pradesh"], "mp": ["madhya", "pradesh"], "ap": ["andhra", "pradesh"], "hp": ["himachal", "pradesh"],
              "tn": ["tamil", "nadu"], "wb": ["west", "bengal"], "jk": ["jammu", "kashmir"]}
# other abbreviations in Indian case names -> the words used in the official titles (expanded anywhere)
ABBREV = {
    "uoi": ["union", "india"], "govt": ["government"], "cbi": ["central", "bureau", "investigation"],
    "mcd": ["municipal", "corporation", "delhi"], "adm": ["additional", "district", "magistrate"],
    "bmc": ["bombay", "municipal", "corporation"], "lic": ["life", "insurance", "corporation"],
    "soc": ["society"], "assn": ["association"], "corpn": ["corporation"],
    "mohd": ["mohammad"], "md": ["mohammad"], "muhammad": ["mohammad"], "mohammed": ["mohammad"], "mohamed": ["mohammad"],
}
INITIAL_CLUSTER = re.compile(r"\b(?:[A-Za-z]\b[.\s]*){1,4}")


def parse_name(text):
    """A party or case name -> (word tokens, initials). Initials are the single letters written as initials
    ('K.S. Puttaswamy' -> {'k','s'}); a dotted cluster that is a known abbreviation (A.D.M., C.B.I., or a state code
    after 'of') is expanded to words instead. Words are lower case, stop-words and single letters removed."""
    if not text:
        return [], set()
    t = re.sub(r"\b[MSWDR]\s*/\s*[SO]\b", " ", text, flags=re.I)          # M/s, S/o, W/o, D/o, R/o
    t = re.sub(r"['’]s\b", "", t, flags=re.I)                              # People's -> People
    t = t.replace("&", " and ")
    t = re.sub(r"(?:^|\s)(?:v\.?|vs\.?|versus)(?=\s)", " | ", t, flags=re.I)  # the separator is not an initial
    ini, parts, pos = set(), [], 0
    for m in INITIAL_CLUSTER.finditer(t):
        letters = re.sub(r"[^A-Za-z]", "", m.group(0)).lower()
        before = t[:m.start()].lower().split()
        if len(letters) >= 2 and letters in STATE_ABBR and before and before[-1] == "of":
            words = STATE_ABBR[letters]
        elif letters in ABBREV:
            words = ABBREV[letters]
        else:
            ini.update(letters)
            words = []
        parts.append(t[pos:m.start()] + " " + " ".join(words) + " ")
        pos = m.end()
    parts.append(t[pos:])
    raw = re.sub(r"[^a-z0-9]+", " ", "".join(parts).lower()).split()
    out = []
    for i, w in enumerate(raw):
        exp = STATE_ABBR[w] if (w in STATE_ABBR and i and raw[i - 1] == "of") else ABBREV.get(w, [w])
        out += [x for x in exp if len(x) > 1 and x not in STOP and not x.isdigit()]
    return out, ini


def tokens(text):
    """word tokens of a name (see parse_name)"""
    return parse_name(text)[0]


def initials(text):
    """initials written in a name (see parse_name)"""
    return parse_name(text)[1]


def split_case_name(name):
    """'A v. B' -> ('A', 'B'); a name without a 'v.' separator is returned as one party"""
    parts = re.split(r"\s+(?:v\.?|vs\.?|versus)\s+", name or "", maxsplit=1, flags=re.I)
    return (parts[0], parts[1]) if len(parts) == 2 else (parts[0], "")


@dataclass
class Row:
    id: int
    decision_date: str          # ISO yyyy-mm-dd (read as text -- no timezone conversion)
    dyear: int                  # decision year
    neutral: str | None         # e.g. '1973 INSC 91'
    scr: str | None             # e.g. '[1973] SUPP. 1 S.C.R. 1'
    petitioner: str
    respondent: str
    title: str
    toks: frozenset
    initials: frozenset = frozenset()


class SCIndex:
    def __init__(self, dsn=DSN):
        conn = psycopg2.connect(dsn)
        cur = conn.cursor()
        cur.execute("""select id, decision_date::text, extract(year from decision_date)::int, neutral_citation, citation,
                              coalesce(petitioner,''), coalesce(respondent,''), coalesce(title,'')
                         from case_laws where source = 'aws-sc' and decision_date is not null""")
        self.rows = []
        for r in cur.fetchall():
            if r[0] in ERRATA:
                pet, resp = ERRATA[r[0]]
                r = (*r[:5], pet or r[5], resp or r[6], *r[7:])
            toks = frozenset(tokens(r[5]) + tokens(r[6])) or frozenset(tokens(r[7]))
            ini = frozenset(initials(r[5]) | initials(r[6])) if (r[5] or r[6]) else frozenset(initials(r[7]))
            self.rows.append(Row(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], toks, ini))
        conn.close()
        self.by_id = {r.id: r for r in self.rows}
        self.by_neutral = defaultdict(list)
        self.by_scr = defaultdict(list)
        for r in self.rows:
            if r.neutral:
                self.by_neutral[norm_neutral(r.neutral)].append(r)
            if r.scr:
                self.by_scr[norm_scr(r.scr)].append(r)
        df = Counter(t for r in self.rows for t in r.toks)
        n = len(self.rows)
        self.idf = {t: math.log(n / c) for t, c in df.items()}
        self.idf_unknown = math.log(n)                   # a word never seen in any title is maximally specific
        self.postings = defaultdict(list)
        for r in self.rows:
            for t in r.toks:
                self.postings[t].append(r)
        self.vocab_by_len = defaultdict(list)
        for t in self.idf:
            if len(t) >= 5:
                self.vocab_by_len[len(t)].append(t)
        # neutral-citation numbering is contiguous (1..max) up to 2013; afterwards the corpus holds only reported judgments
        self.insc_max = {}
        self.insc_count = Counter()
        for key in self.by_neutral:
            y, n_ = key
            self.insc_max[y] = max(self.insc_max.get(y, 0), n_)
            self.insc_count[y] += 1
        self.scr_volumes = defaultdict(set)              # year -> set of (supp?, volume)
        for key in self.by_scr:
            self.scr_volumes[key[0]].add((key[1], key[2]))

    def scr_rows(self, key):
        """rows reported at an S.C.R. key; a citation without a volume number matches every volume of its series"""
        if key is None:
            return []
        if key[2] == 0:
            return [r for k, rs in self.by_scr.items() if scr_equiv(key, k) for r in rs]
        return self.by_scr.get(key, [])

    def insc_complete(self, year):
        """True when every number 1..max for that year is present, i.e. a missing number really is unassigned."""
        return year in self.insc_max and self.insc_count[year] == self.insc_max[year]

    def w(self, toks):
        return sum(self.idf.get(t, self.idf_unknown) for t in toks)

    def name_score(self, name_toks, row):
        """IDF-weighted F1 between the tokens of a case name and a judgment's party tokens (0..1).
        Words match exactly or, for words of 5+ letters, when they are transliteration variants
        (difflib ratio >= FUZZY, e.g. 'keshavananda'/'kesavananda', 'rajgopal'/'rajagopal')."""
        a, b = set(name_toks), set(row.toks)
        if not a or not b:
            return 0.0
        matched_a, matched_b = a & b, set(a & b)
        for x in a - matched_a:
            if len(x) < 5:
                continue
            best = max(((SequenceMatcher(None, x, y).ratio(), y) for y in b - matched_b if len(y) >= 5), default=(0, None))
            if best[0] >= FUZZY:
                matched_a.add(x)
                matched_b.add(best[1])
        if not matched_a:
            return 0.0
        p, r = self.w(matched_a) / self.w(a), self.w(matched_b) / self.w(b)
        return 2 * p * r / (p + r)

    def strict_score(self, name, row):
        """name_score, but 0 unless (a) at least PREC_MIN of the name's own weight is matched -- so an unmatched
        given name such as 'Kavita' in 'Kavita Devi' vs 'Ram Kumari Devi' cannot be outweighed by common words --
        and (b) any initials written in the name also appear in the judgment's party names."""
        a, b = set(tokens(name)), set(row.toks)
        if not a or not b:
            return 0.0
        matched_a, matched_b = a & b, set(a & b)
        for x in a - matched_a:
            if len(x) < 5:
                continue
            best = max(((SequenceMatcher(None, x, y).ratio(), y) for y in b - matched_b if len(y) >= 5), default=(0, None))
            if best[0] >= FUZZY:
                matched_a.add(x)
                matched_b.add(best[1])
        # a full given name may stand for an initial in the official title ('Shivkant' ~ 'S. S. Shukla'), but only
        # once a distinctive word (in at most ANCHOR_DF judgments) has already matched, and each initial once
        # only personal names (rare words) can stand for an initial -- never 'Kerala' in 'State of Kerala'
        anchored = any(len(self.postings.get(t, ())) <= ANCHOR_DF for t in matched_a)
        if anchored:
            free = set(row.initials)
            for x in sorted(a - matched_a):
                if len(x) >= 3 and x[0] in free and len(self.postings.get(x, ())) <= ANCHOR_DF:
                    free.discard(x[0])
                    matched_a.add(x)
        if not matched_a:
            return 0.0
        p, r = self.w(matched_a) / self.w(a), self.w(matched_b) / self.w(b)
        if p < PREC_MIN:
            return 0.0
        # initials written in the cited name must appear in the judgment as initials, or -- once a distinctive word
        # has matched -- as the first letter of a name the title spells out ('R.D. Shetty' ~ 'Ramana Dayaram Shetty')
        ini = initials(name)
        covered = set(row.initials) | ({y[0] for y in b - matched_b} if anchored else set())
        if ini and not ini <= covered:
            return 0.0
        return 2 * p * r / (p + r)

    def similar_words(self, word):
        """index vocabulary words that are transliteration variants of a word the index has never seen"""
        if word in self.idf or len(word) < 5:
            return []
        return [y for y in self.vocab_by_len.get(len(word), []) + self.vocab_by_len.get(len(word) - 1, []) + self.vocab_by_len.get(len(word) + 1, [])
                if SequenceMatcher(None, word, y).ratio() >= FUZZY]

    def search_name(self, name, year=None, window=1, k=5):
        """Best-matching judgments for a case name, optionally restricted to decision years year±window."""
        a = set(tokens(name))
        if not a:
            return []
        # candidates: judgments sharing at least one of the three most specific words
        rare = sorted(a, key=lambda t: -self.idf.get(t, self.idf_unknown))[:3]
        cand = {id(r): r for t in rare for r in self.postings.get(t, [])}.values()
        if year is not None:
            cand = [r for r in cand if abs(r.dyear - year) <= window]
        scored = sorted(((self.name_score(a, r), r) for r in cand), key=lambda x: -x[0])
        return scored[:k]


# ── citation normalisation ────────────────────────────────────────────────────
INSC_RE = re.compile(r"\b((?:19|20)\d{2})\s*INSC\s*(\d{1,5})\b", re.I)
# '[1978] 2 S.C.R. 621', '(1978) 2 SCR 621', '1995 (3) SCR 1', '[1995] Supp. 2 S.C.R. 359', '[1973] Supp. S.C.R. 1'
SCR_RE = re.compile(r"[\[(]?\s*((?:19|20)\d{2})\s*[\])]?\s*(SUPP\.?\s*)?\(?\s*(\d{1,2})?\s*\)?\s*(SUPP\.?\s*)?\(?\s*(\d{1,2})?\s*\)?"
                    r"\s*S\.?\s*C\.?\s*R\.?\s*(\d{1,4})", re.I)


def norm_neutral(s):
    m = INSC_RE.search(s or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


def norm_scr(s):
    """'[1995] SUPP. 2 S.C.R. 359' -> (1995, True, 2, 359); '[1973] 1 S.C.R. 898' -> (1973, False, 1, 898).
    Also accepts '[1973] Supp S.C.R. 1' (supplement without a volume number -> volume 0)."""
    m = SCR_RE.search(s or "")
    if not m:
        return None
    year, supp_a, vol_a, supp_b, vol_b, page = m.groups()
    supp = bool(supp_a or supp_b)
    vol = vol_a or vol_b
    return (int(year), supp, int(vol) if vol else 0, int(page))


def scr_equiv(a, b):
    """Two S.C.R. keys denote the same report. Volumes are often left out ('[1973] Supp. S.C.R. 1' for
    '[1973] SUPP. 1 S.C.R. 1'), so a citation with no volume number matches any volume of the same series
    (regular or supplementary) of that year at that page."""
    if a is None or b is None:
        return False
    if a == b:
        return True
    return a[0] == b[0] and a[1] == b[1] and a[3] == b[3] and (a[2] == 0 or b[2] == 0)


def fmt_scr(key):
    y, supp, vol, page = key
    return f"[{y}] {'SUPP. ' if supp else ''}{vol} S.C.R. {page}"
