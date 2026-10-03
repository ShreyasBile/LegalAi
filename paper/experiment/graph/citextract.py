"""Extract the citations inside a judgment and resolve them to judgments of the Supreme Court index.

A judgment's text is cleaned (running page headers and the margin letters A-H of the printed report removed), every reporter
citation is found, and each distinct (kind, citation) pair is resolved in this order:
  exact     S.C.R. / neutral citation: the number identifies the judgment in the index
  parallel  SCC / AIR citation written beside an S.C.R. / neutral citation ('(2012) 1 SCC 40 : [2011] 13 SCR 309')
  name      the case name before the citation + its year, through the (frozen) verifier; unique matches only
A number and a name that point to different judgments are a 'conflict' (no edge). The verifier (citebench/verifier.py) is used
unchanged.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.verifier import verify, rows_for_citation, name_candidates, TAU

YR = r"(?:19|20)\d{2}"
M = r"(?:[A-H]\s+)?"
SC_RE = re.compile(
    rf"(?:[\[(]\s*(?P<y1>{YR})\s*[\])]\s*(?:(?P<s1>Supp(?:l|lement)?\.?)\s*)?(?P<v1>\d{{1,2}})?"
    rf"|(?P<y2>{YR})\s*\(\s*(?P<v2>\d{{1,2}})\s*\)\s*(?P<s2>)?)"
    rf"\s*(?P<rep>S\.?\s*C\.?\s*[CR]\.?)\s*(?:\(\s*[A-Za-z&]+\s*\)\s*)?{M}(?P<pg>\d{{1,4}})\b", re.I)
AIR_RE = re.compile(
    rf"A\.?\s*I\.?\s*R\.?\s*[\[(]?\s*(?P<y>{YR})\s*[\])]?\s*(?P<court>S\.?\s*C\.?|[A-Z][A-Za-z&]{{1,6}}\.?)\s*{M}(?P<pg>\d{{1,4}})\b")
INSC_RE = re.compile(rf"\b(?P<y>{YR})\s*INSC\s*(?P<n>\d{{1,5}})\b", re.I)
V_RE = re.compile(r"\s(?:v\.?|vs\.?|versus)\s", re.I)
LEAD_STOP = {"see", "in", "also", "vide", "case", "cases", "held", "observed", "decided", "reported", "following", "with", "that",
             "where", "by", "as", "per", "cited", "relied", "on", "upon", "the", "this", "court", "judgment", "and", "of", "to", "for"}
JUNK = {"scr", "scc", "supp", "suppl", "air", "sc", "referred", "relied", "dissented", "distinguished", "followed", "overruled"}
RUNHEAD = re.compile(r"SUPREME COURT REPORTS\s*[\[(]?\s*\d{4}\s*[\])]?\s*(?:SUPP\.?\s*)?\d*\s*S\.?\s*C\.?\s*R\.?", re.I)
MARGIN = re.compile(r"(?<![\w.'’])[A-Hc](?![\w.'’])")                        # a margin letter: one letter, no full stop
GAP = re.compile(r"^\s{0,3}[:;=,]?\s{0,3}$")


def clean(text):
    t = re.sub(r"\s+", " ", text)
    t = re.sub(r"(\w)- (\w)", r"\1\2", t)
    t = RUNHEAD.sub(" ", t)
    t = MARGIN.sub(" ", t)
    return re.sub(r"\s+", " ", t)


def find_cites(text):
    cites = []
    for m in SC_RE.finditer(text):
        yr = int(m.group("y1") or m.group("y2"))
        vol = m.group("v1") or m.group("v2")
        rep = re.sub(r"[^A-Za-z]", "", m.group("rep")).upper()
        if rep == "SCR":
            norm = f"[{yr}] {'SUPP. ' if m.group('s1') else ''}{vol or ''} S.C.R. {m.group('pg')}".replace("  ", " ")
            cites.append({"kind": "scr", "year": yr, "raw": m.group(0), "norm": norm, "start": m.start(), "end": m.end()})
        else:
            cites.append({"kind": "scc", "year": yr, "raw": m.group(0), "norm": None, "start": m.start(), "end": m.end()})
    for m in AIR_RE.finditer(text):
        court = re.sub(r"[^A-Za-z]", "", m.group("court")).upper()
        cites.append({"kind": "air" if court == "SC" else "air_other", "year": int(m.group("y")), "raw": m.group(0), "norm": None,
                      "start": m.start(), "end": m.end()})
    for m in INSC_RE.finditer(text):
        cites.append({"kind": "insc", "year": int(m.group("y")), "raw": m.group(0), "norm": f"{m.group('y')} INSC {m.group('n')}",
                      "start": m.start(), "end": m.end()})
    cites.sort(key=lambda c: c["start"])
    out, last = [], -1
    for c in cites:
        if c["start"] >= last:
            out.append(c)
            last = c["end"]
    return out


def name_before(text, start, prev_end):
    """the 'X v. Y' that ends just before a citation: text between the previous citation and this one"""
    seg = text[max(prev_end, start - 240):start]
    seg = re.sub(r"[\[(]\s*$", "", seg)
    vs = list(V_RE.finditer(seg))
    if not vs:
        return None
    v = vs[-1]
    right = seg[v.end():].strip(" ,;:[(")
    lead = []
    for w in reversed(seg[:v.start()].split()[-10:]):
        if w.endswith((";", ":", "]", ")")) and lead:
            break
        if w.lower().strip(".,") in LEAD_STOP and lead:
            break
        lead.append(w)
    lead = list(reversed(lead))
    while len(lead) > 1 and (lead[0].lower().strip(".,") in LEAD_STOP or lead[0][:1].islower()):   # names start with a capital
        lead.pop(0)

    def keep(ws):
        return " ".join(w for w in ws if re.fullmatch(r"[A-Za-z.&'()-]+,?", w) and w.lower().strip(".,()") not in JUNK)
    left, right = keep(lead), keep(right.split()[:14])
    if not left or not right:
        return None
    return f"{left} v. {right}".strip(" ,.")


def process_doc(ix, src_id, text, cache=None):
    """resolved citation units of one judgment: a list of dicts (see module docstring)"""
    cache = {} if cache is None else cache
    t = clean(text)
    cites = [c for c in find_cites(t) if c["kind"] != "air_other"]
    src = ix.by_id.get(src_id)
    units = {}
    prev_end = 0
    for i, c in enumerate(cites):
        name = name_before(t, c["start"], prev_end)
        prev_end = c["end"]
        key = (c["kind"], c["norm"] or re.sub(r"\W", "", c["raw"].lower()))
        u = units.setdefault(key, {"src": src_id, "kind": c["kind"], "raw": c["raw"], "year": c["year"], "norm": c["norm"],
                                   "name": None, "num_ids": None, "parallel": False})
        u["name"] = u["name"] or name
        if c["kind"] in ("scr", "insc"):
            rows = rows_for_citation(ix, c["norm"])[1]
            u["num_ids"] = u["num_ids"] or ([r.id for r in rows] or None)
        else:
            for j in (i - 1, i + 1):
                if 0 <= j < len(cites) and cites[j]["kind"] in ("scr", "insc") and abs(cites[j]["year"] - c["year"]) <= 2:
                    a, b = (cites[j], c) if j < i else (c, cites[j])
                    if GAP.match(t[a["end"]:b["start"]]):
                        rows = rows_for_citation(ix, cites[j]["norm"])[1]
                        if rows:
                            u["num_ids"] = u["num_ids"] or [r.id for r in rows]
                            u["parallel"] = True
    out = []
    for u in units.values():
        rec = {k: u[k] for k in ("src", "kind", "raw", "year", "norm", "name")}
        by_name, n_cand = None, 0
        if u["name"]:
            ck = (u["name"].lower(), u["year"])
            if ck not in cache:
                v = verify(ix, u["name"], u["year"], "")
                cands = [(s, r) for s, r in name_candidates(ix, u["name"], u["year"]) if s >= TAU]
                cache[ck] = (v["matched_id"] if v["label"] == "VERIFIED" else None, len({r.toks for _, r in cands}))
            by_name, n_cand = cache[ck]
            if n_cand != 1:
                by_name = None
        rec["cands"] = n_cand
        rec["by_name"] = by_name                      # the unique judgment the name + year reach (None if none or several)
        rec["num"] = u["num_ids"]                     # the judgment(s) the citation number points to (None if none)
        if u["num_ids"]:
            gt = u["num_ids"]
            agree = None
            if u["name"]:
                agree = any(ix.strict_score(u["name"], ix.by_id[i]) >= TAU for i in gt)
            if by_name is not None and by_name not in gt and not agree:
                rec.update(tier="conflict", dst=None, agree=False)
            else:
                rec.update(tier="parallel" if (u["parallel"] and u["kind"] in ("scc", "air")) else "exact", dst=gt[0], agree=agree)
        elif by_name is not None:
            rec.update(tier="name", dst=by_name, agree=None)
        else:
            reason = ("number_missing" if u["kind"] in ("scr", "insc") and not u["name"] else
                      "no_name" if not u["name"] else "ambiguous" if n_cand > 1 else "name_not_found")
            rec.update(tier="unresolved", reason=reason, dst=None, agree=None)
        if rec.get("dst") == src_id:
            rec.update(tier="self", dst=None)
        out.append(rec)
    return out
