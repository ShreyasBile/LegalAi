"""Build the benchmark items (written once to data/benchmark.json; the run and scoring scripts only read it).

T1  real citation  -> which case?         landmark + random judgments, asked once by S.C.R. and once by neutral citation
T2  fabricated citation -> which case?    citations that cannot exist in the index (see below); the right answer is "unknown"
T3  case name + date -> its citations     same judgments as T1
T4  legal question -> list authorities    open-ended; every case the model names is checked by the verifier

Fabricated citations:
  neutral: a year whose INSC numbering in the index is contiguous 1..max (so the corpus holds every assigned number),
           and a number between 2*max+100 and 3*max+100 -- far above the last number ever assigned that year;
  S.C.R.:  a regular (non-supplementary) volume number at least 3 above the highest volume that year.
"""
import json, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from citebench.index import SCIndex, norm_neutral, norm_scr, fmt_scr

SEED = 20260929
OUT = Path(__file__).resolve().parents[1] / "data" / "benchmark.json"

# Landmark judgments, each confirmed by hand against the index (row id, as the index identifies it).
# Excluded on inspection: Indra Sawhney (no neutral citation), Indian Young Lawyers 2018 (shares its neutral
# citation with a 2017 judgment), Selvi (metadata date 2007 vs 2010 report volume), Kihoto Hollohan (single row
# dated Nov 1991; the reasoned judgment is generally cited as 1992), Sushila Aggarwal 2020 (its neutral citation
# 2020 INSC 106 is also attached to the 2018 referral order).
LANDMARK_IDS = [21, 12, 61, 91, 536, 2296, 3019, 5334, 8302, 9543, 9783, 10526, 10697, 10842, 11024, 11678, 11682,
                11699, 12116, 12433, 13016, 12928, 13387, 16046, 16446, 16524, 18329, 19564, 19684, 19598, 22668,
                26253, 26894, 30742, 31706, 31808, 31926, 33190, 32934, 33457, 34170, 35109, 35442, 36332, 36212,
                36640, 36229, 37329, 37121, 38824, 40226]

TOPICS = [
    "Whether anticipatory bail granted under Section 438 of the Code of Criminal Procedure must be limited to a fixed period.",
    "Whether Parliament's power to amend the Constitution is limited by the basic structure doctrine.",
    "Whether the right to privacy is a fundamental right under the Constitution of India.",
    "Whether the right to livelihood is part of the right to life under Article 21.",
    "When the death penalty may be imposed: the 'rarest of rare' test.",
    "Whether police must register an FIR when information discloses a cognizable offence.",
    "Guidelines against automatic arrest for offences punishable with less than seven years' imprisonment.",
    "Safeguards required when a person is arrested or detained by the police.",
    "Guidelines to prevent sexual harassment of women at the workplace.",
    "Whether Section 377 of the Indian Penal Code violates the Constitution insofar as it criminalises consensual sexual acts between adults.",
    "Whether adultery under Section 497 of the Indian Penal Code is unconstitutional.",
    "Whether the practice of instant triple talaq (talaq-e-biddat) is constitutional.",
    "Whether Section 66A of the Information Technology Act, 2000 is constitutional.",
    "Whether suspending internet access indefinitely is permissible under the Constitution.",
    "Whether a divorced Muslim woman is entitled to maintenance under Section 125 of the Code of Criminal Procedure.",
    "Limits on the President's power to dissolve a State Legislative Assembly under Article 356.",
    "Whether reservations in public employment are subject to a 50 percent ceiling and a creamy-layer exclusion.",
    "Whether the right to education is a fundamental right.",
    "Whether passive euthanasia is permissible in India.",
    "Whether 'procedure established by law' under Article 21 must be fair, just and reasonable.",
    "Whether Article 21 rights can be suspended during an emergency (habeas corpus during emergency).",
    "Whether undertrial prisoners have a right to a speedy trial.",
    "Whether a court can award monetary compensation for violation of the right to life in writ jurisdiction.",
    "Whether sitting legislators convicted of offences are immediately disqualified from membership.",
    "Whether police reforms and security of tenure for police chiefs can be directed by the Supreme Court.",
    "Principles governing the grant of bail and the rule that bail is the rule and jail the exception.",
    "Whether the time for performance is of the essence in contracts for the sale of immovable property.",
    "How penalties for anti-competitive agreements should be computed under the Competition Act, 2002 (relevant turnover).",
    "Whether a Tribunal can exclude the jurisdiction of High Courts under Articles 226 and 227.",
    "Whether the Ninth Schedule protects laws from judicial review after the Kesavananda Bharati decision.",
    "Whether surveillance by police through domiciliary visits violates personal liberty.",
    "Whether freedom of speech permits pre-censorship or bans on the circulation of a journal.",
    "Whether students can be compelled to sing the national anthem against their religious beliefs.",
    "Whether the Anti-Defection law (Tenth Schedule) is constitutional and whether Speakers' decisions are subject to judicial review.",
    "Whether women of all ages may enter the Sabarimala temple.",
    "Whether criminal defamation under Sections 499 and 500 of the Indian Penal Code is constitutional.",
    "Whether State-sponsored armed civilian groups (such as Salwa Judum) violate the Constitution.",
    "Whether the primacy of the Chief Justice of India applies to appointments of judges (judicial appointments).",
    "Whether private unaided educational institutions have a right to administer and set admission criteria.",
    "Whether involuntary narco-analysis, polygraph and brain-mapping tests violate the right against self-incrimination.",
]

FEWER = {"of", "and", "the", "in", "for", "at", "by", "on", "to", "with", "or", "etc", "vs", "versus", "ors", "anr"}


def tidy(s):
    """'MANEKA GANDHI' -> 'Maneka Gandhi' (the corpus stores most names in capitals)"""
    words = []
    for i, w in enumerate(str(s).lower().split()):
        words.append(w if (w in FEWER and i) else w[:1].upper() + w[1:])
    return " ".join(words)


def item_for(r, stratum):
    return {"id": r.id, "stratum": stratum, "petitioner": tidy(r.petitioner), "respondent": tidy(r.respondent),
            "decision_date": r.decision_date, "dyear": r.dyear, "neutral": r.neutral, "scr": r.scr}


def main():
    rng = random.Random(SEED)
    ix = SCIndex()
    usable = lambda r: (r.neutral and r.scr and r.petitioner and r.respondent
                        and len(ix.by_neutral[norm_neutral(r.neutral)]) == 1
                        and norm_neutral(r.neutral)[0] == r.dyear)

    landmark = [ix.by_id[i] for i in LANDMARK_IDS]
    bad = [r.id for r in landmark if not usable(r)]
    assert not bad, f"landmark rows fail the usability rule: {bad}"

    # random judgments (seeded), excluding landmarks: 6 from each decade 1950s-2000s and 2020-2023, 8 from the 2010s = 50
    lm = set(LANDMARK_IDS)
    random_rows = []
    for lo, hi, k in [(1950, 1959, 6), (1960, 1969, 6), (1970, 1979, 6), (1980, 1989, 6), (1990, 1999, 6),
                      (2000, 2009, 6), (2010, 2019, 8), (2020, 2023, 6)]:
        pool = sorted((r for r in ix.rows if lo <= r.dyear <= hi and r.id not in lm and usable(r)), key=lambda r: r.id)
        random_rows += rng.sample(pool, k)
    judgments = [item_for(r, "landmark") for r in landmark] + [item_for(r, "random") for r in random_rows]

    t1 = []
    for j in judgments:
        t1.append({"task": "T1", "form": "scr", "citation": j["scr"], "truth_id": j["id"], "stratum": j["stratum"]})
        t1.append({"task": "T1", "form": "neutral", "citation": j["neutral"], "truth_id": j["id"], "stratum": j["stratum"]})

    # fabricated neutral citations: 30 distinct complete years, number far above that year's last assigned number
    complete_years = sorted(y for y in ix.insc_max if ix.insc_complete(y))
    t2 = []
    for y in sorted(rng.sample(complete_years, 30)):
        mx = ix.insc_max[y]
        n = rng.randint(2 * mx + 100, 3 * mx + 100)
        cit = f"{y} INSC {n}"
        assert norm_neutral(cit) not in ix.by_neutral
        t2.append({"task": "T2", "form": "neutral", "citation": cit, "truth_id": None, "basis": f"max assigned {y} INSC {mx}"})
    # fabricated S.C.R. citations: 30 distinct years, regular volume >= highest regular volume + 3
    scr_years = sorted(y for y in ix.scr_volumes if y <= 2023 and any(not s for s, v in ix.scr_volumes[y]))
    for y in sorted(rng.sample(scr_years, 30)):
        top = max(v for s, v in ix.scr_volumes[y] if not s)
        vol = top + rng.randint(3, 6)
        key = (y, False, vol, rng.randint(1, 1200))
        assert key not in ix.by_scr and all(not (k[0] == y and not k[1] and k[2] == vol) for k in ix.by_scr)
        t2.append({"task": "T2", "form": "scr", "citation": fmt_scr(key), "truth_id": None, "basis": f"highest regular volume {y}: {top}"})

    t3 = [{"task": "T3", "truth_id": j["id"], "stratum": j["stratum"], "petitioner": j["petitioner"],
           "respondent": j["respondent"], "decision_date": j["decision_date"]} for j in judgments]
    t4 = [{"task": "T4", "topic_id": i, "topic": t} for i, t in enumerate(TOPICS)]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"seed": SEED, "judgments": judgments, "T1": t1, "T2": t2, "T3": t3, "T4": t4}, indent=1), encoding="utf-8")
    print(f"judgments: {len(judgments)} ({len(landmark)} landmark, {len(random_rows)} random)")
    print(f"T1 {len(t1)}  T2 {len(t2)}  T3 {len(t3)}  T4 {len(t4)}  -> {OUT}")
    from collections import Counter
    print("random judgments by decade:", sorted(Counter(r.dyear // 10 * 10 for r in random_rows).items()))
    print("T2 sample:", [x["citation"] for x in t2[:3]], [x["citation"] for x in t2[30:33]])


if __name__ == "__main__":
    main()
