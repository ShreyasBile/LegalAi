"""Citation verifier: decides whether a case a model cites is a real Supreme Court of India judgment in the index.

Input: a case name, a year and a citation string, as a model produced them.
Output: one of
  VERIFIED        a judgment with matching parties exists within one year of the stated year, and the citation
                  (if it is an S.C.R. or neutral citation) points to that same judgment
  WRONG_CITATION  the parties match a real judgment, but the S.C.R./neutral citation points elsewhere or nowhere
  MISATTRIBUTED   no judgment with these parties near that year, but the citation resolves to a different judgment
  WRONG_YEAR      no judgment with these parties near that year and no resolvable citation, but the name identifies
                  exactly one judgment (or one matter) elsewhere in the corpus: a real case cited with the wrong year
  NOT_FOUND       neither the parties nor the citation resolve to any judgment in the index
The name match uses index.SCIndex.strict_score (IDF-weighted F1 with precision and initials conditions), threshold TAU.
Citations to other law reports (SCC, AIR, ...) cannot be checked against this index; for those only the
name + year decides, and the result records `citation_kind`.
"""
from .index import SCIndex, norm_neutral, norm_scr, tokens

TAU = 0.5          # name-match threshold (strict score), validated on a held-out manual audit
STRONG = 0.8       # a name identifies one judgment unambiguously (WRONG_YEAR) ...
RARE_DF = 15       # ... and contains a word found in at most this many Supreme Court judgments
YEAR_WINDOW = 1


def citation_kind(cit):
    if not cit or not str(cit).strip():
        return "none"
    if norm_neutral(cit):
        return "neutral"
    if norm_scr(cit):
        return "scr"
    return "other"


def rows_for_citation(ix, cit):
    k = citation_kind(cit)
    if k == "neutral":
        return k, ix.by_neutral.get(norm_neutral(cit), [])
    if k == "scr":
        return k, ix.scr_rows(norm_scr(cit))
    return k, []


def name_candidates(ix, name, year):
    """best (score, row) for a name; year matches if the decision year OR the S.C.R. volume year is within the window.
    Scores are index.SCIndex.strict_score (IDF-weighted F1 with the precision and initials conditions)."""
    a = set(tokens(name))
    if not a:
        return []
    rare = sorted(a, key=lambda t: -ix.idf.get(t, ix.idf_unknown))[:3]
    look = set(rare) | {v for t in rare for v in ix.similar_words(t)}     # spelling variants of unseen words
    cand = {r.id: r for t in look for r in ix.postings.get(t, [])}.values()
    if year is not None:
        cand = [r for r in cand if near_year(r, year)]
    return sorted(((ix.strict_score(name, r), r) for r in cand), key=lambda x: (-x[0], x[1].id))


def near_year(r, year, window=YEAR_WINDOW):
    sy = norm_scr(r.scr)[0] if r.scr else None
    return abs(r.dyear - year) <= window or (sy is not None and abs(sy - year) <= window)


def unique_strong_match(ix, name):
    """the judgment a name identifies unambiguously anywhere in the corpus: best strict score >= STRONG, and every
    other judgment at >= STRONG is in the same matter (same party words, e.g. several orders in one case)"""
    cands = [(s, r) for s, r in name_candidates(ix, name, None) if s >= STRONG]
    if not cands:
        return None
    best = cands[0][1]
    if not all(r.toks == best.toks for _, r in cands):
        return None
    # a generic name ('Rajesh Kumar v. State of Bihar') cannot identify a judgment: require a rare word
    words = set(tokens(name))
    rare = {t for t in words & best.toks if len(ix.postings.get(t, ())) <= RARE_DF}
    rare |= {t for t in words if t not in ix.idf and any(v in best.toks for v in ix.similar_words(t))}
    return best if rare else None


def parse_year(y):
    try:
        y = int(str(y).strip()[:4])
        return y if 1947 <= y <= 2026 else None
    except (TypeError, ValueError):
        return None


def verify(ix: SCIndex, name, year, cit):
    year = parse_year(year)
    kind, cit_rows = rows_for_citation(ix, cit)
    cands = name_candidates(ix, name, year)
    best_score, best = (cands[0] if cands else (0.0, None))
    name_ok = best_score >= TAU
    res = {"label": None, "citation_kind": kind, "name_score": round(best_score, 3),
           "matched_id": best.id if (best and name_ok) else None, "citation_ids": [r.id for r in cit_rows]}
    if name_ok:
        matching = [s_r for s_r in cands if s_r[0] >= TAU]
        if kind in ("neutral", "scr"):
            same = any(r.id == c.id for _, r in matching for c in cit_rows)
            # the citation also counts if it points to a judgment with the same parties (e.g. a companion decision)
            same = same or any(ix.strict_score(name, c) >= TAU for c in cit_rows)
            res["label"] = "VERIFIED" if same else "WRONG_CITATION"
        else:
            res["label"] = "VERIFIED"
        return res
    if cit_rows:
        res["label"] = "MISATTRIBUTED"
        return res
    # not near the stated year: is it a real judgment the name identifies unambiguously, cited with the wrong year?
    u = unique_strong_match(ix, name) if year is not None else None
    if u is not None:
        res["label"], res["matched_id"] = "WRONG_YEAR", u.id
    else:
        res["label"] = "NOT_FOUND"
    return res


def cases_of(parsed):
    """the (at most three) cases in a T4/T5 answer; a case repeated with the same name and citation counts once"""
    cs = (parsed or {}).get("cases") or []
    out, seen = [], set()
    for c in [c for c in cs if isinstance(c, dict) and str(c.get("case_name", "")).strip()][:3]:
        k = (" ".join(str(c.get("case_name")).lower().split()), " ".join(str(c.get("citation", "")).lower().split()))
        if k not in seen:
            seen.add(k)
            out.append(c)
    return out


def n_duplicates(parsed):
    cs = [c for c in ((parsed or {}).get("cases") or []) if isinstance(c, dict) and str(c.get("case_name", "")).strip()][:3]
    return len(cs) - len(cases_of(parsed))
