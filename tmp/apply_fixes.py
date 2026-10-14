import re

def fix_file(filepath, replacements):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    orig = content
    for old, new in replacements:
        if old not in content:
            print(f"WARN: Could not find snippet in {filepath}")
        else:
            content = content.replace(old, new, 1)
    if content != orig:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed {filepath}")
    else:
        print(f"No changes in {filepath}")

# 1. dashboard-stats
with open("app/api/institution/dashboard-stats/route.ts", "r", encoding="utf-8") as f:
    c = f.read()

pattern = r"const \[membersRes, loansRes, txRes, savingsRes, portfolioRes, collectionRes, overdueRes\] =\s*await Promise\.all\(\[\s*(client\.query[\s\S]*?loansParams,\s*)\s*\]\)"
m = re.search(pattern, c)
if m:
    # replace with sequential queries
    inner = m.group(1)
    # The queries in inner are separated by commas
    # We can split by client.query
    parts = inner.split("client.query(")
    # parts[0] is empty or whitespace
    seq_queries = []
    names = ["membersRes", "loansRes", "txRes", "savingsRes", "portfolioRes", "collectionRes", "overdueRes"]
    for i, name in enumerate(names):
        q_body = parts[i+1].rstrip()
        if q_body.endswith(","):
            q_body = q_body[:-1].rstrip()
        seq_queries.append(f"const {name} = await client.query({q_body}")
    replacement = "\n      ".join(seq_queries)
    c = c[:m.start()] + replacement + c[m.end():]
    with open("app/api/institution/dashboard-stats/route.ts", "w", encoding="utf-8") as f:
        f.write(c)
    print("Fixed app/api/institution/dashboard-stats/route.ts")
else:
    print("Could not match dashboard-stats pattern")

