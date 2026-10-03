"""Reference answers for the T4 questions: the Supreme Court judgments that decided each question.

Each T4 question was written around a landmark judgment. For each question this lists, by index row id, the
judgment(s) that decided it, including companion decisions and earlier decisions that were later overruled (for
example Suresh Kumar Koushal for Section 377). Compiled from the question wording after the closed-book runs and
before the search runs; recorded with a hash in data/t4_reference.sha256. A listed case "hits" the reference when
its name matches a reference judgment (strict score >= TAU) within one year of it -- the verifier's own VERIFIED
condition, applied to that judgment. The hit rate is a lower bound on relevance: a model may list other judgments
that are also good authorities.
"""
import json
from pathlib import Path

from .index import tokens
from .verifier import TAU, near_year, parse_year

REFERENCE = {
    0: [38546, 11678, 30742],            # Sushila Aggarwal (2020); Gurbaksh Singh Sibbia (1980); Siddharam Satlingappa Mhetre (2010)
    1: [8302, 11699],                    # Kesavananda Bharati (1973); Minerva Mills (1980)
    2: [36212],                          # K.S. Puttaswamy (2017)
    3: [13016],                          # Olga Tellis (1985)
    4: [11682, 12463],                   # Bachan Singh (1980); Machhi Singh (1983; source title 'MACHHL')
    5: [33190],                          # Lalita Kumari (2013)
    6: [34170],                          # Arnesh Kumar (2014)
    7: [18329, 16623],                   # D.K. Basu (1996); Joginder Kumar (1994)
    8: [19564],                          # Vishaka (1997)
    9: [37329, 33457],                   # Navtej Singh Johar (2018); Suresh Kumar Koushal (2013)
    10: [37121, 13038],                  # Joseph Shine (2018); Sowmithri Vishnu (1985)
    11: [36332],                         # Shayara Bano (2017)
    12: [35109],                         # Shreya Singhal (2015)
    13: [38824],                         # Anuradha Bhasin (2020)
    14: [12928, 22075],                  # Mohd. Ahmed Khan v. Shah Bano Begum (1985); Danial Latifi (2001)
    15: [16524],                         # S.R. Bommai (1994)
    16: [16018, 25831],                  # Indra Sawhney (1992); M. Nagaraj (2006)
    17: [16046, 16446],                  # Mohini Jain (1992); Unni Krishnan (1993)
    18: [31706, 32199, 37269],           # Aruna Ramchandra Shanbaug (2011, two orders); Common Cause (2018)
    19: [10697],                         # Maneka Gandhi (1978)
    20: [9783],                          # A.D.M. Jabalpur v. S.S. Shukla (1976)
    21: [11191, 11024, 11084, 10984, 11020, 15559],   # Hussainara Khatoon (1979, five orders); A.R. Antulay v. R.S. Nayak (1991)
    22: [12433, 16196],                  # Rudul Sah (1983); Nilabati Behera (1993)
    23: [32934],                         # Lily Thomas (2013)
    24: [26253],                         # Prakash Singh (2006)
    25: [10526, 10587, 31792, 40226],    # State of Rajasthan v. Balchand (1977); Gudikanti Narasimhulu (1977); Sanjay Chandra (2011); Satender Kumar Antil (2022)
    26: [15707, 4945],                   # Chand Rani v. Kamal Rani (1992); Gomathinayagam Pillai (1966)
    27: [36640],                         # Excel Crop Care (2017)
    28: [19684, 13554],                  # L. Chandra Kumar (1997); S.P. Sampath Kumar (1986)
    29: [26894, 11794],                  # I.R. Coelho (2007); Waman Rao (1980)
    30: [3019, 9393],                    # Kharak Singh (1962); Govind v. State of M.P. (1975)
    31: [12, 5],                         # Romesh Thappar (1950); Brij Bhushan (1950)
    32: [13387],                         # Bijoe Emmanuel (1986)
    33: [15690],                         # Kihoto Hollohan (1991)
    34: [36771],                         # Indian Young Lawyers Association (2018)
    35: [35442],                         # Subramanian Swamy v. Union of India (2016)
    36: [31808],                         # Nandini Sundar (2011)
    37: [16150, 34642, 12116],           # S.C. Advocates-on-Record Assn. (1993; 2015); S.P. Gupta (1981)
    38: [22668, 25078, 23883],           # T.M.A. Pai Foundation (2002); P.A. Inamdar (2005); Islamic Academy of Education (2003)
    39: [27713],                         # Selvi v. State of Karnataka (2010; metadata date 2007)
}


def hits_reference(ix, topic_id, name, year):
    """the reference judgment a listed case names, or None"""
    y = parse_year(year)
    if y is None or not tokens(name):
        return None
    for rid in REFERENCE[topic_id]:
        row = ix.by_id[rid]
        if near_year(row, y) and ix.strict_score(name, row) >= TAU:
            return rid
    return None


if __name__ == "__main__":
    # write the reference list with the titles as the index stores them (for review), then print a hash
    import hashlib, sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from citebench.index import SCIndex
    ix = SCIndex()
    bench = json.loads((Path(__file__).resolve().parents[1] / "data" / "benchmark.json").read_text(encoding="utf-8"))
    out = []
    for it in bench["T4"]:
        out.append({"topic_id": it["topic_id"], "topic": it["topic"], "reference": [
            {"id": rid, "title": ix.by_id[rid].title, "decision_date": ix.by_id[rid].decision_date,
             "scr": ix.by_id[rid].scr, "neutral": ix.by_id[rid].neutral} for rid in REFERENCE[it["topic_id"]]]})
    p = Path(__file__).resolve().parents[1] / "data" / "t4_reference.json"
    p.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(len(out), "questions,", sum(len(v) for v in REFERENCE.values()), "reference judgments ->", p)
    print(hashlib.sha256(p.read_bytes()).hexdigest(), p.name)
