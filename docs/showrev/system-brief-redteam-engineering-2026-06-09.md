---
title: System Brief Send-Priority — Engineering Red-Team v1
status: DRAFT
author: Claude (red-team eng/architect lens)
date: 2026-06-09
target_spec: docs/showrev/system-brief-priority-spec-v1-2026-06-09.md
---

## Engineering verdict

**NEEDS-REVISION.** The formula is clean and the deterministic-no-LLM claim mostly holds. But two of three weighted inputs are ghost-wired against the actual `sr_engine_output` schema: `research_summary` is a `text` column holding a stringified JSON blob (not jsonb — double-parse required, never declared), and `verification_report` (source for `hallucination_fail`) is 0/357 populated. Today's data is also so collapsed (confidence binary green/red, ICP verdict 82% `leaning_fit`, composer_mode 99% `specific`) that the formula will produce ~3 scores at scale, not 10. Spec ships fine after declaring parse contract, removing dead branches, fixing DNC source path, and lowering scale ambitions.

## Spaghetti audit

- **No cascading conditionals in the formula itself.** Clean — three independent lookups, weighted sum, round. Good.
- **Hidden dependency #1: text-encoded JSON.** `research_summary` is `data_type: text` with a stringified JSON string inside (verified: `"{\"composer_mode\":\"specific\",...}"`). Spec writes `research_summary.composer_mode` as if jsonb. Implementer will either `JSON.parse(JSON.parse(text))` or break. Declare this.
- **Hidden dependency #2: `priority_weakest`.** Spec says "the dimension with the lowest weighted contribution" — that's a second pass over the three pts × weight products with argmin and tie-break. Not in the formula block. Add pseudocode or drop the field (open question #4 already flags this).
- **Hidden dependency #3: backfill order.** "Compute on every existing row" requires row-level idempotency keyed on input hash. Not specified. Re-running on a row whose `confidence_color` changed later will silently change score. Either freeze inputs into a `priority_inputs_snapshot` jsonb or document that re-compute follows source-of-truth.

## Ghost wiring audit

| Field | Spec assumes | Actual schema | Fill rate (n=357) | Verdict |
|---|---|---|---|---|
| `confidence_color` | text, 4 values | text | 357/357 (100%) | **Real.** But only 2 values present (green 133, red 224). Yellow/amber branches are dead code at v1. |
| `icp_volume_verdict` | text, 3 values | text | 356/357 (99.7%) | **Real.** But only 2 values used (fit 65, leaning_fit 291). `miss` branch dead. 1 NULL row. |
| `research_summary.composer_mode` | jsonb path | **text column, stringified JSON** | 352/357 contain `"composer_mode":"specific"`, 5 missing | **Ghost-wired path.** Need `JSON.parse` before access. Mode also 99% `specific` — branch dead at v1. |
| claim_id count from `body_sentences[].claim_ids` | nested array | nested in stringified JSON | 350/357 rows contain the literal `"claim_ids":[]`, 119 rows have at least one non-empty `claim_ids` array | **Real but skewed.** Most rows will score 1pt research. |
| `tier3Hallucination.verdict` (for `hallucination_fail`) | safety flag source | `verification_report` jsonb column | **0/357 populated** | **GHOST.** Safety flag has no data source today. Either backfill or remove flag from v1. |
| DNC list at `canon/wiki-459 §10` | static lookup | **No `canon/wiki-459*` file exists in ruflo repo.** `canon/` contains only `_session_transcripts/`. | n/a | **GHOST.** Pipeline cannot read this path. Either point to actual showrev-repo location (out of scope per instructions) or define a `sr_dnc_list` table. |

## NULL handling

Formula: `(email_pts × 1.0) + (icp_pts × 0.75) + (research_pts × 0.75)`. Spec maps `icp NULL → 1`, but other NULLs are unspecified. Traces:

1. **`confidence_color=NULL`** — no mapping row. Implementer choice → divergent scores. Default to 1 pt explicitly.
2. **`icp_volume_verdict=NULL`** (1 row exists today) — spec says 1 pt. OK. Score floor = 1+0.75+0.75 = 2.5 → rounds to 3 (KILL/HOLD boundary — banker's rounding matters; declare half-up).
3. **`research_summary=NULL`** (5 rows today) — no `composer_mode`, no claim_ids. Spec implies 1 pt via `generalized` fallback but that's a stretch. Declare NULL→1.
4. **`research_summary` present but malformed JSON** — parser throws. Spec is silent. Wrap in try/catch → 1 pt + log.
5. **All three NULL** — score = 1.0 + 0.75 + 0.75 = 2.5 → 3 = HOLD. Reasonable; document.

`Math.round(2.5)` is 3 in JS (half-away-from-zero) but 2 in Python (banker's). **Pick a language-specific rounding rule and pin it.**

## Schema evolution risk

- Three new columns added flat to `sr_engine_output` AND `sr_prospects` (spec says both — that's denorm with no sync rule declared). Pick one source of truth.
- v2 adds a dimension → either change weights (silently invalidates all stored scores) or add `priority_score_v2` column (schema bloat, two truths). Mitigate now: store `priority_version text` + `priority_inputs_snapshot jsonb` so a v2 backfill can re-derive cleanly and old v1 rows stay legible.
- Adding a 4th dimension at the same 30% will need weights renormalized — spec gives no normalization rule. Document the invariant `sum(weights) → score scaled to 1-10`.

## Concrete punch list (must-fix before build)

| # | What | Severity | Effort |
|---|---|---|---|
| 1 | Declare `research_summary` is text-stringified JSON; specify double-parse contract and try/catch fallback to 1 pt | **P0** | 15 min spec |
| 2 | Remove `hallucination_fail` from v1 OR backfill `verification_report` first (0/357 today) | **P0** | drop = 5 min; backfill = days |
| 3 | DNC list source `canon/wiki-459 §10` does not exist in ruflo repo. Replace with concrete path or `sr_dnc_list` table spec | **P0** | 30 min |
| 4 | Add NULL row to each mapping table (`confidence_color=NULL → 1`, `composer_mode=NULL → 1`, malformed JSON → 1) | **P0** | 10 min |
| 5 | Pin rounding rule (`Math.round` half-up vs banker's) — 2.5 → 3 explicit | **P0** | 5 min |
| 6 | Decide single source of truth: write to `sr_engine_output` only OR `sr_prospects` only, not both | **P1** | 10 min decision |
| 7 | Add `priority_version text` + `priority_inputs_snapshot jsonb` columns for re-derive defensibility + idempotency | **P1** | 30 min spec, 1 hr migration |
| 8 | Document `priority_weakest` algorithm explicitly (argmin over weighted contributions, tie-break rule) OR drop per open Q#4 | **P1** | 15 min |
| 9 | Acknowledge collapsed input distributions (confidence binary, ICP 82% leaning, composer 99% specific) → expected v1 score range is ~3-7, not 1-10. Adjust bands so HOLD/KILL aren't empty in practice | **P1** | 20 min |
| 10 | Add deterministic `priority_input_hash` column for cheap re-compute skip | **P2** | 20 min |

Scale note: 1k–10k rows is fine — single SQL `UPDATE … FROM` pass, no N+1. The risk is not throughput; it's silent drift when an upstream row changes and nobody re-derives priority. Punch-list #7 closes that loop.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Initial red-team |
