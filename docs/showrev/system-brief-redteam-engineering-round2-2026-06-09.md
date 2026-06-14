---
title: System Brief Send-Priority — Engineering Red-Team Round 2
status: DRAFT
author: Claude (red-team eng/architect lens)
date: 2026-06-09
target_spec: docs/showrev/system-brief-priority-spec-v2-2026-06-09.md
prior_round: docs/showrev/system-brief-redteam-engineering-2026-06-09.md
---

## Verdict: REVISE

v2 closes 8 of 10 round-1 items cleanly. Two are still ghost-wired and one new schema/index issue surfaced. None block the model; all block the migration.

## Round-1 item-by-item

| # | Round-1 finding | v2 status | Evidence |
|---|---|---|---|
| 1 | `research_summary` is text-stringified JSON; declare parse contract | **Addressed.** Verified: 352/357 are single-stringified JSON, 0/357 double-escaped, 4 are plaintext/malformed. `JSON.parse(text)` once is safe. NULL handling row covers the 4 outliers via `research_pts=1`. | `LEFT(research_summary,100)` returns `{\"composer_mode\":...` not `\"{\\\"composer_mode\\\"...`. Single parse confirmed. |
| 2 | `verification_report` 0/357 — `hallucination_fail` ghost | **Addressed.** v2 pivots to `tier3Hallucination.verdict` from `tiered-judge.ts` (already wired in compose path). | Removed dependency on the empty jsonb column. |
| 3 | DNC list at `canon/wiki-459 §10` does not exist | **NOT addressed.** v2 pivots to `data/showrev/inorsa-source-of-truth.md §10`. File exists, but §10 is titled "Show Facts (canonical per wiki-459-mirror)" and contains show name / dates / booth / location — **no DNC list, no names**. Still ghost-wired. | Section content read: 5 bullets, all show logistics. Closest DNC-style content is §7 "Value Prop Scope" (hard constraints) and §15 "ICP Qualification Guardrails", neither a name list. |
| 4 | NULL handling unspecified | **Addressed** for the 4 declared inputs; gaps remain (see below). |
| 5 | Rounding rule unpinned | **Addressed.** `Math.round` (half-to-positive-infinity in JS) declared explicit. |
| 6 | Single source of truth (sr_engine_output vs sr_prospects) | **Partially addressed.** v2 still writes to both ("New DB columns on `sr_engine_output` + `sr_prospects`"); no sync rule. |
| 7 | Add `priority_version` + `priority_inputs_snapshot` | **Addressed in spec, NOT in schema.** Neither column exists on `sr_engine_output` today. Spec implies they will — migration required. |
| 8 | `priority_weakest` algorithm | **Addressed.** Field dropped. |
| 9 | Collapsed input distribution → score ~3-7 | **Addressed.** Bands re-anchored (SEND ≥7, OK 5-6, HOLD 3-4, KILL 1-2); predicted distribution table added. |
| 10 | `priority_input_hash` for re-compute skip | Not addressed (P2; acceptable). |

## NEW issues

**N1. CITE VALIDATION scale (round-1 Q3).** `sr_company_evidence` has 756 rows, PK on `id` (text). Lookup is index-backed and trivial per row. BUT v2 says "cross-checked against sr_company_evidence" — the spec never declares whether validation runs per row at score-time, or once per cohort. At 300 prospects × ~3 claim_ids each, that's 900 PK lookups per pipeline run, fine. Declare it as a batched `WHERE id = ANY(...)` to avoid an N+1 inside `persistToSupabase`.

**N2. `priority_inputs_snapshot` migration.** `sr_engine_output` has no `jsonb` column for it today; columns listed in spec do not exist on the live table. Migration must add: `priority_score int`, `priority_band text`, `priority_version int`, `priority_inputs_snapshot jsonb`, `substrate_contradiction_flag bool`. Add an Alembic-style migration file path to the spec.

**N3. Plaintext research_summary (4 rows).** Try/catch around `JSON.parse` is implied by NULL table but not stated; declare `try { JSON.parse } catch { research_pts = 1 }`.

## NULL traces not in v2 table

1. `confidence_color` NULL + `icp_volume_verdict` NULL + valid research + pass → 1 + 0.85 + 2.1 + 1.0 = 4.95 → **5 (OK)**. A double-null on the two strongest inputs lands in OK band. Likely too generous; clamp to HOLD.
2. Valid green + valid fit + `research_summary` malformed JSON + halluc NULL → 3 + 2.55 + 0.7 + 0.5 = 6.75 → **7 (SEND)**. Parser failure rewarded with SEND because email+ICP carry it. Add a "parse_failed → HOLD floor" rule.
3. All four NULL → 1 + 0.85 + 0.7 + 0.5 = 3.05 → **3 (HOLD)**. Acceptable. Document.

## Must-fix before build

| # | What | Severity |
|---|---|---|
| 1 | Replace DNC source. §10 of `inorsa-source-of-truth.md` is show facts, not a name list. Define `sr_dnc_list` table OR point to actual file (likely in showrev repo, out of scope) | **P0** |
| 2 | Add migration spec for 5 new columns on `sr_engine_output` | **P0** |
| 3 | Pick one write target (sr_engine_output OR sr_prospects). Spec writes to both with no sync rule | **P1** |
| 4 | Add `try/catch` around `JSON.parse(research_summary)` → research_pts=1 on throw | **P1** |
| 5 | Batched cite-validation (`WHERE id = ANY($1)`) declared in integration section | **P1** |
| 6 | Parse-failure floor: malformed research_summary should not be allowed to score SEND | **P2** |

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Round-2 red-team on spec v2 |
