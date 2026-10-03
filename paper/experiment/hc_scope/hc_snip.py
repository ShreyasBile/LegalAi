import os
import random
from statistics import mean, median

import psycopg2

# password comes from PGPASSWORD (or ~/.pgpass); CASELAW_DSN overrides the whole DSN
cur = psycopg2.connect(os.environ.get("CASELAW_DSN", "host=localhost port=5433 dbname=caselaw user=postgres")).cursor()
rng = random.Random(11)
ids = [rng.randint(1, 20655605) for _ in range(3000)]
cur.execute("select id, court_code, length(snippet), left(snippet, 400) from case_laws where source='aws-hc' and id = any(%s) and snippet is not null and snippet <> ''", (ids,))
rows = cur.fetchall()
L = [r[2] for r in rows]
print(len(rows), "snippets; length mean", round(mean(L)), "median", median(L), "p90", sorted(L)[9 * len(L) // 10], "max", max(L))
for r in rows[:3]:
    print(f"\n[{r[1]}] {r[2]} chars: {r[3]!r}")
cur.execute("select count(*) from case_laws where source='aws-hc' and id = any(%s) and length(snippet) > 1500", (ids,))
print("\nsnippets longer than 1500 chars:", cur.fetchone()[0], "of", len(rows))
