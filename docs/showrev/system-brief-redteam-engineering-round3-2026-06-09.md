---
title: System Brief Send-Priority — Engineering Red-Team Round 3
status: DRAFT
author: Claude (red-team eng/architect lens)
date: 2026-06-09
target_spec: docs/showrev/system-brief-priority-spec-v2.1-2026-06-09.md
prior_round: docs/showrev/system-brief-redteam-engineering-round2-2026-06-09.md
---

## Verdict: REVISE — DNC parser is broken; ship-blocker.

v2.1 closes 2 of 3 R2 blockers. The DNC regex passes a sniff test but fails on the real hook file. Migration and N+1 are clean.

## R2 finding-by-finding

| R2 | v2.1 status | Evidence |
|---|---|---|
| DNC source | **NOT addressed.** Regex parses hook, but extractor mis-reads. See N1. | Hook read at `~/.claude/hooks/inorsa_compliance_check.py` lines 85-104. |
| Migration columns | **Addressed.** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is postgres-valid, idempotent. | §Migration block. |
| Cite N+1 | **Addressed.** `WHERE id = ANY($1)` is supported by supabase-js v2 (`.in('id', ids)` compiles to this). | §Cite Validation. |
| NULL+null cap | **Addressed.** Double-NULL → priority ≤4 explicit. | Formula line 67. |
| Parse-failure floor | **Addressed.** NULL table row "malformed JSON → research_pts=1". | NULL table. |

## NEW issues (Round 3)

**N1 — DNC extractor mis-reads inline Python comments. SHIP-BLOCKER.**
Hook lines 85-104 (`DNC_COMPANY_NAMES` array) have inline `# comment` strings that themselves contain quoted variants (e.g., a root entry plus a comment like `# catches "<root> + <suffix>"`). 6 of the 18 entries have comment-quoted strings on the same line.

The spec's extractor `[...match[1].matchAll(/"([^"]+)"/g)]` is **comment-blind**. It scrapes BOTH the real entry AND the comment-quoted variant — producing a DNC list polluted with phantom strings like company-name-plus-suffix combos that are not real DNC entities and would falsely flag non-DNC prospects.

The regex `[^\]]+` also matches the FIRST array body only — silently drops `DNC_PEOPLE_NAMES` (line 113, 3 entries) and `CELLULAR_TESTBED_CLIENTS` (line 160, 2 entries). The hook treats all three as DNC-equivalent; ruflo will not.

**Fix**: strip `#.*$` per line BEFORE extracting quotes; parse all 3 arrays by name; assert count matches expected (18 companies + 3 people + 2 cellular = 23). Better: have the hook write the canonical list to a sibling `.json` file at startup; ruflo reads the same json. Single source, no regex.

**N2 — Migration has no rollback block.** Spec fix table (row 2) promises rollback; §Migration body has only `UP`. `ADD COLUMN IF NOT EXISTS` is forward-idempotent but not reversible; if a botched backfill writes garbage to `priority_inputs_snapshot`, operator has no scripted way back. Add `DROP COLUMN IF EXISTS ...` block, flag-gated.

**N3 — Index on `sr_company_evidence(company_normalized)` may already exist.** Migration uses `IF NOT EXISTS`, safe — but spec should verify before-state. Trivial.

**N4 — Dual write to `sr_engine_output` AND `sr_prospects` still has no sync rule** (R2 #6 deferred, not killed). v2.1 §Migration adds priority columns to BOTH. Which is canonical? Race window if compose writes one, backfill writes other. Declare `sr_engine_output` canonical, `sr_prospects.priority_*` is a denormalized read-cache populated by trigger or post-write.

## NULL traces (2 new not in v2.1 table)

1. **`research_summary` valid + `body_sentences=[]` + halluc=split + green/fit**: research_pts=1, halluc_pts=0.25 → raw = 3 + 2.55 + 0.7 + 0.25 = 6.5 → round=7 → SEND. Halluc-cap fires (`halluc_pts<1 && raw_score≥7`) → capped at 6 → OK. Works, but document the `body_sentences=[]` case explicitly — table currently lists only "research_summary IS NULL".
2. **`dnc_match=true` + `compose_failed=true`**: order matters. Spec applies `compose_failed→priority=1` BEFORE `dnc_match→priority=0`. Final = 0. But if developer reverses, dnc=true gets overwritten by compose_failed=1, sending a DNC company. Lock cap-application ordering with a test fixture.

## Worst-case engineering risks introduced by v2.1

- **DNC parser silently drifts** when hook author edits comments (most likely failure mode).
- **`CONTRADICTION_KEYWORDS` is hardcoded in TS**, not operator-editable without a deploy (spec says "PR" — friction). Move to DB or `.json`.
- **Nightly URL HEAD job (WC1)** is referenced but not specified: cadence, timeout, rate limit, retry policy. Ship gap.

## Must-fix before build

| # | What | Severity |
|---|---|---|
| 1 | Replace DNC regex with comment-stripped, multi-array parser OR sibling JSON | **P0** |
| 2 | Add `DOWN` migration block | **P1** |
| 3 | Declare `sr_engine_output` canonical; `sr_prospects` denormalized | **P1** |
| 4 | Spec the WC1 nightly URL HEAD job (cadence/timeout/retry) | **P2** |
| 5 | Move `CONTRADICTION_KEYWORDS` to operator-editable substrate | **P2** |

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Round-3 red-team on spec v2.1 |
