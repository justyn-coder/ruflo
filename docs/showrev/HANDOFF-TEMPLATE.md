---
title: HANDOFF Template — single-file session bridge
status: ACTIVE
last_updated: 2026-06-12 16:30 EDT
version: v1
purpose: Canonical template for end-of-session HANDOFF docs. Copy this file, rename to HANDOFF-<YYYY-MM-DD>-<topic>.md, fill in.
---

# HANDOFF TEMPLATE — single-file session bridge

This is the canonical template for end-of-session handoff docs. The next session's SessionStart hook reads the most-recent `docs/showrev/HANDOFF-*.md` and surfaces it before any other action.

**Discipline:**
- One file per session-end (NOT per task)
- Folded structure: status snapshot + work state + decisions pending (no separate CONTINUITY file)
- File name pattern: `HANDOFF-<YYYY-MM-DD>-<short-topic-kebab>.md`
- Always include `git_commit` from `git rev-parse HEAD`

---

## Template (copy below this line)

```markdown
---
title: <Brief session title>
date: <YYYY-MM-DD HH:MM EDT>
session_name: <kebab-case-session-id>
status: complete | mid-task | blocked
git_commit: <sha from `git rev-parse HEAD`>
tool_calls_at_handoff: <count from PostToolUse counter>
authored_by: Claude (Opus 4.X) at end of ~Xh session
operator_state: <one phrase — fresh / exhausted / mid-call / etc.>
next_session_must_read:
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md
  - <other canon paths as needed>
---

# Handoff: <session topic>

## TL;DR for next reader

<2-3 sentences. What got done, what's mid-flight, what's blocked. Optimize for "if reader stops after this paragraph, they know enough to not break anything.">

## Goal of this session

<one sentence — what we set out to do>

## Completed

- [x] thing — `<file:line OR commit-sha OR external pointer>`
- [x] thing

## In progress (mid-flight)

- [ ] thing
  - Current state: <what's done so far>
  - Next step: <exact next action>
  - Owner: <Claude | operator | external>

## Blockers

- <thing> (owner: operator | Claude | external)
  - Why blocked: <one sentence>
  - What unblocks it: <action or decision>

## Operator decisions pending

- [ ] <question for operator> — context: <one line>

## Next 3 actions (sequential, for next session)

1. <first action — file + intent>
2. <second>
3. <third>

## Substrate state

- **HS portal:** <any open writes / dirty state / contacts left in wrong tags>
- **DB state:** <tables touched / pending migrations / dirty rows>
- **Uncommitted files:** <count + bullet list if relevant to next session>
- **Open browser tabs / external state:** <if operator needs to remember anything>

## What NOT to do

- <traps the next session would naturally fall into>
- <stale assumptions to discard>
- <invalidated patterns from before>

## Lessons learned this session (for memory hygiene)

- <Any rules that should become feedback memory entries>
- <Any patterns to canonicalize>
- <Any anti-patterns to flag>
```

---

## Why this format

| Section | Why it exists |
|---|---|
| Frontmatter | Machine-parseable for tooling + SessionStart hook |
| TL;DR | Fail-safe — if reader bails after one paragraph, no damage |
| Completed / In Progress / Blockers | The three states all work falls into |
| Operator decisions pending | What needs operator brain, surfaced explicitly |
| Next 3 actions | Specific enough to start; loose enough to adapt |
| Substrate state | Catches the "wait, the DB is in what state?" surprises |
| What NOT to do | Captures negative learning — the most valuable kind |
| Lessons learned | Feeds memory hygiene at end of session |

## When to write this file

1. **Approaching context threshold:** at 120 tool calls (per SESSION-RULES.md), drafting handoff becomes the primary task.
2. **Before `/clear`:** never clear without writing first.
3. **Before going dark:** end of day, before sleep, before context switch to another client.
4. **Mid-task forced stop:** if operator interrupts with higher-priority work, write a quick handoff covering current state.

## How the next session uses it

The SessionStart hook (`.claude/hooks/session_start_handoff.sh`) automatically reads the most-recent `HANDOFF-*.md` and surfaces it. The next Claude is then bound by SESSION-RULES.md to read it completely before taking any other action.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 16:30 | Claude | Initial template — single-file folded CONTINUITY+HANDOFF |
