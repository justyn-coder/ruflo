#!/bin/bash
# Run: cd ~/Documents/GitHub/ruflo/src/showrev/m1-email-find && bash load-substrate-standalone.sh
set -e
source .env 2>/dev/null
KEY="${SUPABASE_SERVICE_ROLE_KEY}"
URL="${NEXT_PUBLIC_SUPABASE_URL}"
TMP="/tmp/sb-batch.json"

echo "Loading substrate into Supabase..."
echo "URL: ${URL:0:40}..."

TOTAL=0
for SRC in dawson-pots-and-pans community-broadband-bits; do
  DIR="../../../data/brain/substrate/${SRC}"
  [ ! -d "$DIR" ] && continue
  echo ""
  echo "=== $SRC ==="

  for START in $(seq 0 100 5000); do
    python3 - "$DIR" "$SRC" "$START" <<'PYEOF'
import json, sys
from pathlib import Path
d, src, start = Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
files = sorted(f for f in d.iterdir() if f.suffix == '.json' and not f.name.startswith('_'))[start:start+100]
if not files: sys.exit(1)
rows = []
for fp in files:
    data = json.loads(fp.read_text())
    c = data.get('content', '')
    if len(c) < 100: continue
    s, ci = 0, 0
    while s < len(c):
        e = min(s+2000, len(c))
        ch = c[s:e].strip()
        if len(ch) > 100:
            rows.append({'source':src,'title':data.get('title','')[:500],'url':data.get('url',''),'published_date':data.get('date',''),'chunk_index':ci,'content':ch,'char_count':len(ch)})
            ci += 1
        s = e - 200
        if s >= len(c): break
Path('/tmp/sb-batch.json').write_text(json.dumps(rows))
print(len(rows))
PYEOF

    [ $? -ne 0 ] && echo "  done at batch $START" && break

    ROWS=$(cat /tmp/sb-batch.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
    [ "$ROWS" = "0" ] && continue

    HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      "${URL}/rest/v1/sr_brain_substrate" \
      -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" \
      -H "Content-Type: application/json" -H "Prefer: return=minimal" \
      -d @"$TMP")

    TOTAL=$((TOTAL + ROWS))
    echo "  batch $START: $ROWS chunks → HTTP $HTTP (total: $TOTAL)"
  done
done

echo ""
echo "=== DONE: $TOTAL chunks loaded ==="
