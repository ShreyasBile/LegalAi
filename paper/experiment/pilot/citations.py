"""Pilot: find the cases each judgment cites and resolve them against the Supreme Court index.

A mention = a case name ('X v. Y') followed by a reporter citation. Extracted from the OCR text of each judgment:
  scr   [1978] 2 S.C.R. 621 / (1978) 2 SCR 621 / 1978 (2) SCR 621     -> exact lookup in the index
  insc  2017 INSC 801                                                   -> exact lookup in the index
  scc   (1978) 1 SCC 248                                                -> name + year only (not in the index)
  air   AIR 1978 SC 597                                                 -> name + year only (not in the index)
  air_other  AIR 1950 Bom 10 etc.                                       -> not a Supreme Court judgment
Annotator-free accuracy check: for scr/insc mentions the citation number identifies the judgment independently of the
name, so we measure how often name + year alone (what scc/air mentions have) reaches the same judgment.
Writes pilot/mentions.jsonl.
"""
import json, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from citebench.index import SCIndex, norm_scr, norm_neutral
from citebench.verifier import verify, rows_for_citation, name_candidates, TAU

PILOT = Path(__file__).resolve().parent
YR = r"(?:19|20)\d{2}"
M = r"(?:[A-H]\s+)?"                                   # a stray margin letter between reporter and page (OCR)
SC_RE = re.compile(
    rf"(?:[\[(]\s*(?P<y1>{YR})\s*[\])]\s*(?:(?P<s1>Supp(?:l|lement)?\.?)\s*)?(?P<v1>\d{{1,2}})?"
    rf"|(?P<y2>{YR})\s*\(\s*(?P<v2>\d{{1,2}})\s*\)\s*(?P<s2>)?)"
    rf"\s*(?P<rep>S\.?\s*C\.?\s*[CR]\.?)\s*(?:\(\s*[A-Za-z&]+\s*\)\s*)?{M}(?P<pg>\d{{1,4}})\b", re.I)
AIR_RE = re.compile(
    rf"A\.?\s*I\.?\s*R\.?\s*[\[(]?\s*(?P<y>{YR})\s*[\])]?\s*(?P<court>S\.?\s*C\.?|[A-Z][A-Za-z&]{{1,6}}\.?)\s*{M}(?P<pg>\d{{1,4}})\b")
INSC_RE = re.compile(rf"\b(?P<y>{YR})\s*INSC\s*(?P<n>\d{{1,5}})\b", re.I)
V_RE = re.compile(r"\s(?:v\.?|vs\.?|versus)\s", re.I)
LEAD_STOP = {"see", "in", "also", "vide", "case", "cases", "held", "observed", "decided", "reported", "following", "with",
             "that", "where", "by", "as", "per", "cited", "relied", "on", "upon", "the", "this", "court", "judgment"}


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
    # drop overlaps (e.g. a SCC match inside an AIR match)
    out, last = [], -1
    for c in cites:
        if c["start"] >= last:
            out.append(c)
            last = c["end"]
    return out


def name_before(text, start, prev_end):
    """the 'X v. Y' that ends just before a citation: text between the previous citation and this one"""
    seg = text[max(prev_end, start - 240):start]
    seg = re.sub(r"[\[(]\s*$", "", seg)                      # the citation's own opening bracket
    vs = list(V_RE.finditer(seg))
    if not vs:
        return None
    v = vs[-1]
    right = seg[v.end():].strip(" ,;:[(")
    left_words = seg[:v.start()].split()
    lead = []
    for w in reversed(left_words[-10:]):
        if w.endswith((";", ":", "]", ")")) and lead:
            break
        if w.lower().strip(".,") in LEAD_STOP and lead:
            break
        lead.append(w)
    left = " ".join(reversed(lead)).strip(" ,;:[(")
    right_words = right.split()[:14]
    clean = lambda ws: " ".join(w for w in ws if re.fullmatch(r"[A-Za-z.&'()-]+,?", w))      # drop OCR garbage tokens
    left, right = clean(left.split()), clean(right_words)
    if len(left.split()) < 1 or len(right.split()) < 1:
        return None
    return f"{left} v. {right}".strip(" ,.")


def main():
    ix = SCIndex()
    sample = json.loads((PILOT / "sample.json").read_text(encoding="utf-8"))
    out = (PILOT / "mentions.jsonl").open("w", encoding="utf-8")
    kinds = Counter()
    for it in sample:
        text = re.sub(r"\s+", " ", (PILOT / "text" / f"{it['id']}.txt").read_text(encoding="utf-8"))
        text = re.sub(r"(\w)- (\w)", r"\1\2", text)                                   # hyphenation across line breaks
        cites = find_cites(text)
        prev_end = 0
        seen = set()
        for c in cites:
            name = name_before(text, c["start"], prev_end)
            prev_end = c["end"]
            kinds[c["kind"]] += 1
            if name is None or c["kind"] == "air_other":
                rec = {"doc": it["id"], "stratum": it["stratum"], "year_doc": it["year"], **{k: c[k] for k in ("kind", "year", "raw", "norm")}, "name": name}
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                continue
            key = (name.lower(), c["kind"], c["norm"] or c["raw"])
            if key in seen:
                continue
            seen.add(key)
            rec = {"doc": it["id"], "stratum": it["stratum"], "year_doc": it["year"], **{k: c[k] for k in ("kind", "year", "raw", "norm")}, "name": name}
            # resolution by name + year alone (what scc/air mentions have)
            v_name = verify(ix, name, c["year"], "")
            cands = [(s, r) for s, r in name_candidates(ix, name, c["year"]) if s >= TAU]
            rec["by_name"] = {"label": v_name["label"], "matched_id": v_name["matched_id"], "score": v_name["name_score"],
                              "n_candidates": len({r.toks for _, r in cands}), "n_rows": len(cands)}
            if c["kind"] in ("scr", "insc"):
                k, rows = rows_for_citation(ix, c["norm"])
                rec["by_number"] = {"ids": [r.id for r in rows]}
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    out.close()
    print("raw citation matches by kind:", dict(kinds))


if __name__ == "__main__":
    main()
