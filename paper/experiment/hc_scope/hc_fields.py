import os
import random
import psycopg2

# password comes from PGPASSWORD (or ~/.pgpass); CASELAW_DSN overrides the whole DSN
cur = psycopg2.connect(os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")).cursor()
rng = random.Random(7)
ids = [rng.randint(1, 20655605) for _ in range(6000)]
cur.execute("""select count(*), count(nullif(citation,'')), count(nullif(neutral_citation,'')), count(nullif(snippet,'')),
                      count(nullif(case_type,'')), count(nullif(disposal_nature,'')), count(nullif(judges,'')),
                      count(nullif(petitioner,'')), count(nullif(respondent,'')), count(nullif(title,''))
                 from case_laws where source='aws-hc' and id = any(%s)""", (ids,))
n, cit, neu, snip, ct, disp, judges, pet, resp, title = cur.fetchone()
print(f"{n} High Court records sampled")
for name, v in (("citation", cit), ("neutral_citation", neu), ("snippet (text)", snip), ("case_type", ct), ("disposal_nature", disp),
                ("judges", judges), ("petitioner", pet), ("respondent", resp), ("title", title)):
    print(f"  {name:18s} {v:5d}  ({100 * v / n:.1f}%)")
cur.execute("select case_type, count(*) from case_laws where source='aws-hc' and id = any(%s) group by 1 order by 2 desc limit 5", (ids,))
print("top case types:", cur.fetchall())
cur.execute("select title from case_laws where source='aws-hc' and id = any(%s) limit 4", (ids[:400],))
print("example titles:", [t[0][:70] for t in cur.fetchall()])
