#!/bin/bash
# Run: cd ~/Documents/GitHub/ruflo/src/showrev/m1-email-find && bash load-substrate-safe.sh
source .env 2>/dev/null
KEY="${SUPABASE_SERVICE_ROLE_KEY}"
URL="${NEXT_PUBLIC_SUPABASE_URL}"
TOTAL=0

for SRC_DIR in dawson-pots-and-pans community-broadband-bits; do
  FULL_DIR="/Users/justynszymczyk/Documents/GitHub/ruflo/data/brain/substrate/${SRC_DIR}"
  [ ! -d "$FULL_DIR" ] && continue
  echo "=== $SRC_DIR ==="

  for START in $(seq 0 50 5000); do
    # Python reads files, writes JSON to /tmp/sb.json, prints row count
    ROWS=$(python3 /tmp/genbatch.py "$FULL_DIR" "$SRC_DIR" "$START" 50 2>&1)

    if [ -z "$ROWS" ] || [ "$ROWS" = "0" ]; then
      echo "  done at $START"
      break
    fi

    HTTP=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
      "${URL}/rest/v1/sr_brain_substrate" \
      -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" \
      -H "Content-Type: application/json" -H "Prefer: return=minimal" \
      -d @/tmp/sb.json)

    TOTAL=$((TOTAL + ROWS))
    echo "  $START: $ROWS chunks → $HTTP (total: $TOTAL)"
  done
done
echo "=== ALL DONE: $TOTAL chunks ==="
