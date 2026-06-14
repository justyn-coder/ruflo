#!/bin/bash
# session_health_proxy.sh
# Increments per-session tool-call counter, surfaces health check at thresholds.
# Scope: ruflo project. Fail-safe (never blocks tool call).

set -e

COUNTER_FILE="$HOME/.claude/.session-tool-count-ruflo"

# Read existing count (default 0 if missing)
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)

# Defensive — strip any non-numeric content
if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  COUNT=0
fi

COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE" 2>/dev/null || true

# Threshold messages — silent for all other counts
case "$COUNT" in
  60)
    echo ""
    echo "📊 SESSION HEALTH CHECK — 60 tool calls"
    echo "   Substrate looks healthy. Consider drafting handoff before next major task."
    echo "   Template: docs/showrev/HANDOFF-TEMPLATE.md"
    echo ""
    ;;
  120)
    echo ""
    echo "📊 SESSION HEALTH CHECK — 120 tool calls"
    echo "   ⚠️  Strongly recommend: finish current task, draft handoff, /clear, fresh session."
    echo "   Context retention drops 15-30% past this point (arxiv 2601.04170)."
    echo ""
    ;;
  180)
    echo ""
    echo "📊 SESSION HEALTH CHECK — 180 tool calls"
    echo "   🛑 Drafting the handoff is now the PRIMARY task. Stop substantive new work."
    echo "   New session will be faster and fresher than continuing here."
    echo ""
    ;;
esac

exit 0
