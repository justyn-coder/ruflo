---
title: Session Rules — ruflo / Inorsa pilot
status: ACTIVE
last_updated: 2026-06-12 16:30 EDT
version: v1
purpose: Load-bearing rules for session lifecycle in this repo. Referenced from CLAUDE.md.
---

# Session Rules

Three rules govern session lifecycle in this repo. They exist because the framework's anti-drift apparatus solves agent-swarm-coordination drift, not long-human-conversation drift. These three close that gap.

---

## RULE 1 — Read the handoff FIRST (load-bearing)

At session start, BEFORE any other tool call or response, you MUST read the most-recent `docs/showrev/HANDOFF-*.md` file completely.

The SessionStart hook at `.claude/hooks/session_start_handoff.sh` surfaces it automatically. You still must read it — not just acknowledge it surfaced.

**Fail closed:** if no recent handoff exists (none in `docs/showrev/HANDOFF-*.md`, or the most-recent is more than 48 hours old), you MUST ask the operator before proceeding with any substantive action. Substantive = HS writes, file edits to source code, memory writes, external API calls.

**Why this rule exists:** Today (2026-06-12) a session loaded a parallel 5-contact cohort to HubSpot because the session didn't read the prior session's HANDOFF doc that already specified the canonical 18-contact roster. Damage to live client CRM. Avoidable.

---

## RULE 2 — End the session with a fresh HANDOFF

Before `/clear`, before `/exit`, before going dark, you MUST write a fresh handoff using the template at `docs/showrev/HANDOFF-TEMPLATE.md`.

**Required fields:**
- `git_commit` (from `git rev-parse HEAD`)
- `tool_calls_at_handoff` (from `~/.claude/.session-tool-count-ruflo`)
- `status` (complete | mid-task | blocked)
- TL;DR (2-3 sentences)

**File naming:** `docs/showrev/HANDOFF-<YYYY-MM-DD>-<short-topic-kebab>.md`

**Why this rule exists:** Sessions die at /clear, /exit, or context limit. Without a written handoff, the next session reconstructs from scratch + re-makes mistakes the prior session already learned past.

---

## RULE 3 — Health-check thresholds (proactive handoff signaling)

A PostToolUse counter tracks tool calls per session as a proxy for context utilization. At threshold crossings, the hook surfaces a recommendation:

| Tool calls | Signal | Action |
|---|---|---|
| 60 | Substrate healthy. Start thinking about handoff. | Optional — keep working. |
| 120 | Recommend handoff + `/clear` + fresh session. | Strongly consider — context retention drops 15-30% per arxiv 2601.04170. |
| 180 | Drafting handoff is now the PRIMARY task. | Stop new substantive work. |

**Operator override allowed:** if operator says "keep going," comply but log the deviation in the next handoff under "Operator decisions pending."

**Why these thresholds:** community consensus (claude-code-session-kit 92-session battle test, vexp.dev memory bank guide, sitepoint long-running session guide) converges on 60% / 80% / 90% context utilization triggers. The tool-call count is a coarse proxy — 60 / 120 / 180 calls maps approximately to those thresholds in typical sessions but is bounded by tool-call patterns rather than true tokens.

---

## How the three rules interlock

```
Session start
    └── RULE 1 — read latest HANDOFF before anything else
        └── work happens
            └── PostToolUse counter fires every N calls
                └── RULE 3 — at 60/120/180, surface handoff recommendation
                    └── Operator decides to continue OR draft handoff
                        └── RULE 2 — before /clear, write fresh HANDOFF
                            └── next session starts at RULE 1
```

The pattern is intentionally minimal. Three rules. Each is load-bearing. Removing any one breaks the chain.

---

## What this DOES NOT replace

These rules complement, not replace:
- **`~/.claude/CLAUDE.md`** — global operator instructions (Pyramid Principle comms, doc versioning rule, etc.)
- **`~/Documents/CLAUDE.md`** — code-channel adapter (External Judge rule, Tool Chain Reference, Verify-before-cached-claims)
- **`ruflo/CLAUDE.md`** — framework rules (concurrency, swarm config, hooks system)
- **GOSPEL memory** (`reference_hubspot_loading_protocol.md`) — HS interaction canon
- **HUBSPOT-INTEGRATION-RESEARCH.md** — HS gospel doc

This file only addresses session lifecycle. Other concerns live elsewhere.

---

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 16:30 | Claude | Initial draft after harness red-team + community-pattern research |
