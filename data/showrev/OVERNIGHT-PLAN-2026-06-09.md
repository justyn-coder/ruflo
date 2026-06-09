---
title: Overnight Autonomous Build Plan — 2026-06-09 (Mon → Tue)
status: ACTIVE
last_updated: 2026-06-09 02:00 EDT
version: v1
purpose: Plan for autonomous overnight work while operator sleeps. Codifies what runs, what doesn't, and what to wake operator for.
---

# Overnight Autonomous Plan — 2026-06-09 (Mon late → Tue early)

## Operator brief

Operator said "i'm falling asleep, can you come up with a plan to continue to run throughout the night without me please" at 2026-06-09 ~02:00 EDT. This doc captures my plan + boundaries before executing.

## Scope (what runs)

Numbered in execution order. Each step is bounded; if a step blows past its time budget I stop and write to the status log for morning review.

### Step 1 — Wait for + load email-source workflow `w5mdoejzp` (15-30 min)

It's running. When it returns:
- Read result via Workflow tool notification
- Honest count from structured output (NOT synthesis fork)
- Load deduped contacts to `sr_company_contacts` via existing loader
- Cross-match against existing 296 contacts (enrich emails where source has email + existing has none)

**Budget:** 30 min wall-clock. **Cost:** $0 (just DB writes).

### Step 2 — Full Focus 100 cohort run on pipeline v2 (60-90 min)

After Step 1, run pipeline v2 against all 100 prospects in `data/showrev/p2-cold/focus-100.csv` (using sampled real names from FC2026 attendees at those companies where we have them; placeholder "Sample Contact" only as fallback).

Capture per-prospect:
- ICP verdict
- Email confidence (Path A + Path B)
- Composer mode (specific vs generalized)
- Tier counts
- Apollo credits used

Write per-prospect rows to `sr_engine_output` with `run_id = v2-overnight-2026-06-09`.

**Budget:** 90 min wall-clock (100 prospects × ~45s avg). **Cost:** ~$2 in Anthropic API tokens (composition Sonnet calls), ~$1 in Apollo credits (≈300 credits).

### Step 3 — Generate cohort report (10 min)

Single SQL query + write to `data/showrev/cohort-report-overnight-2026-06-09.md`:
- Distribution: specific vs generalized
- Distribution: green / yellow / amber / red / no-email
- ICP verdict distribution
- Top-10 highest USE_DIRECTLY count prospects (the ones with richest substrate)
- Apollo credits total
- 5 worst red/no-email cases (for AM review — Path B refinement candidates)

**Budget:** 10 min. **Cost:** $0.

### Step 4 — FCC BDC scaffolding (60 min)

Build the layer to receive FCC BDC data WITHOUT committing the 30 GB bulk download:
- Apply DDL migration for `fcc_bdc_coverage` + `fcc_bdc_provider_summary` per `docs/specs/fcc-bdc-ingestion-spec.md`
- Add `getFccCoverage(companyName)` stub to `substrate-query.ts`
- Wire `fcc_bdc` source_kind to USE_DIRECTLY tier (already done in types.ts)
- Document the bulk-download script as a TODO (don't execute — that's a multi-hour download)

**Budget:** 60 min. **Cost:** $0.

### Step 5 — PROJECT-STATE.md refresh (15 min)

The session-start hook flagged 261h stale. Bring the day-row checkboxes current, refresh System Health, add today's substrate-tiering build + email workflow as decision rows.

**Budget:** 15 min. **Cost:** $0.

### Step 6 — Revised next-pass workflow plan (deliverable doc, 30 min)

Don't EXECUTE the workflow overnight — too risky without operator gate. Instead, write the design as a deliverable:
- Operator's improvements: PDF reading, accidentally-public attendee lists, time budgets, fallback paths
- Per-agent prompt templates
- Cost ceiling per agent
- Spawnable script the operator can fire AM

**Budget:** 30 min. **Cost:** $0.

### Step 7 — Final status write-up (15 min)

Write `data/showrev/_session_transcripts/SESSION_END_2026-06-09_OVERNIGHT.md` summarizing:
- What ran
- What landed in the database
- What's ready for AM operator review
- Any blockers or things needing operator decision
- Spend totals

**Budget:** 15 min. **Cost:** $0.

### Step 8 — Stop

Total wall-clock target: ~4 hours (most of it Step 2's pipeline run).

## Boundaries (what does NOT run)

| Hard NO | Reason |
|---|---|
| Email sends (Gmail, SMTP) | C-portion deferred. Operator gate required. |
| HubSpot writes / Sequence enrollment | Client system safety op_64. Operator gate required. |
| Apollo bulk credit burn >500 credits ($1) | Hardware ceiling. Step 2 expects 300; if it exceeds, I stop. |
| Firecrawl >1000 credits ($10) | Same. |
| Branch switches (off main / feat/canon-foundations-2026-05-04) | Per post-compact reminder. |
| Bulk FCC BDC download (30 GB) | Multi-hour disk-intensive operation. Operator should approve. |
| Architecture pivots / spec changes | Operator-only decisions. |
| Any "destructive" git operations | Standard rule. |

## When I wake the operator

If any of these happen, I stop and write a `WAKE-OPERATOR-NOW.md` flag at repo root:
- Hit any hard NO above
- Step 2 fails on >20% of cohort (architecture-level issue)
- Email-source workflow returns and yields are bizarrely low (< 50 verified emails) or bizarrely high (> 5000 verified emails) — both signal something off
- Anthropic API rate-limiting mid-overnight (would need operator to authorize direct API switch)
- Supabase write failures
- Anything I can't reason through

## Spending ledger (will update as I go)

| Step | Anthropic API | Apollo | Firecrawl | Notes |
|---|---|---|---|---|
| Step 1 | $0 | $0 | $0 | wait + load |
| Step 2 | est. $2 | est. $1 | $0 | composition + Path B |
| Step 3 | $0 | $0 | $0 | SQL only |
| Step 4 | $0 | $0 | $0 | code + DDL |
| Step 5 | $0 | $0 | $0 | doc work |
| Step 6 | $0 | $0 | $0 | doc work |
| Step 7 | $0 | $0 | $0 | doc work |
| **Cap** | **$10** | **$1 ($500 credits)** | **$10** | hard stops |

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 02:00 | Claude | Initial overnight plan + boundaries. |
