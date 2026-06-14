#!/bin/bash
# session_start_handoff.sh
# Surfaces the most-recent HANDOFF-*.md at SessionStart + resets tool-call counter.
# Scope: ruflo project. Fail-safe (never blocks session).

set -e

REPO_ROOT="${CLAUDE_PROJECT_DIR:-/Users/justynszymczyk/Documents/GitHub/ruflo}"
HANDOFF_DIR="$REPO_ROOT/docs/showrev"
COUNTER_FILE="$HOME/.claude/.session-tool-count-ruflo"

# Reset counter on every new session
echo 0 > "$COUNTER_FILE" 2>/dev/null || true

# Find most-recent HANDOFF doc (excluding the template itself)
LATEST=$(ls -t "$HANDOFF_DIR"/HANDOFF-*.md 2>/dev/null | grep -v 'HANDOFF-TEMPLATE.md' | head -1)

if [ -z "$LATEST" ]; then
  echo "⚠️  SessionStart: No HANDOFF-*.md found in $HANDOFF_DIR"
  echo "    Per SESSION-RULES.md RULE 1: ASK OPERATOR before any substantive action."
  exit 0
fi

# Age check
AGE_SECONDS=$(( $(date +%s) - $(stat -f %m "$LATEST" 2>/dev/null || stat -c %Y "$LATEST" 2>/dev/null || echo 0) ))
AGE_HOURS=$(( AGE_SECONDS / 3600 ))

echo "📋 SessionStart — most recent handoff (${AGE_HOURS}h ago):"
echo "    $(basename "$LATEST")"
echo ""

# Stale warning
if [ "$AGE_HOURS" -gt 48 ]; then
  echo "⚠️  Handoff is older than 48 hours. Per SESSION-RULES.md RULE 1: confirm with operator before substantive action."
  echo ""
fi

echo "--- HANDOFF CONTENT ---"
cat "$LATEST"
echo ""
echo "--- END HANDOFF ---"
echo ""
echo "🚨 RULE 1: Read this handoff completely before any other action."
echo "🚨 RULE 2: Write a fresh handoff at session end (template: docs/showrev/HANDOFF-TEMPLATE.md)."
echo "🚨 RULE 3: Health check at tool-call counts 60/120/180."

exit 0
