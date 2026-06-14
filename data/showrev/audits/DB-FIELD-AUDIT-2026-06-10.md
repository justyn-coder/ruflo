---
title: DB Field Audit — sr_prospects + sr_engine_output integrity map
status: ACTIVE
last_updated: 2026-06-10 17:30 EDT
version: v1
---

# DB Field Audit (2026-06-10)

**Purpose:** map every column in `sr_prospects` and `sr_engine_output`, identify cross-contamination risks (ghost-risk fields), operator-protected fields, and pipeline-owned fields. Validates the operator's concern: *"what happens if during the old run you hallucinated and filled in a field, and then in the new run found nothing so thought you left it blank but in fact it just kept the old information?"*

## TL;DR — your concern was valid

**Yes, cross-contamination is a real risk on `sr_prospects`** because the pipeline uses PostgREST UPSERT with merge behavior — **fields NOT in the upsert body are preserved from the previous write**. There is ONE column with a real ghost-risk pattern today.

| Field | Risk |
|---|---|
| `sr_prospects.skip_reason` | **GHOST-RISK CONFIRMED.** Only written when `send_status='hold'`. If old run set it (was 'hold') and new run is 'pending', old `skip_reason` persists in DB pointing at stale reason. |

Everything else either always writes, never writes (operator-protected), or is on `sr_engine_output` which uses INSERT-by-run_id (no overlap, no contamination — old rows just accumulate).

## Table 1: `sr_prospects` (44 columns) — write/read map

Legend:
- **PIPELINE-OWNED** — pipeline writes every run; safe to clear before re-run
- **OPERATOR-PROTECTED** — pipeline never writes; operator owns; must not clobber
- **GHOST-RISK** — pipeline writes CONDITIONALLY; old value can leak through
- **AUTO** — Postgres-managed (created_at, updated_at)
- **DEAD** — column exists in schema but nothing writes it currently

| Column | Type | Status | Writer (file:line) | Reader |
|---|---|---|---|---|
| `id` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1114 (slug) | Portal (key) |
| `first_name` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1115 | Portal |
| `last_name` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1116 | Portal |
| `email` | text | PIPELINE-OWNED + operator-locked path | run-pipeline-v2.ts:1118 (operator-locked wins) | Portal |
| `title` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1119 | Portal |
| `state` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1120 | Portal |
| `city` | text | DEAD | (nothing writes) | (nothing reads) |
| `company` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1121 | Portal |
| `company_website` | text | OPERATOR-PROTECTED + backfill script | NOT in run-pipeline-v2.ts. Only `backfill-company-website.ts` writes | Portal (logo + link-out) |
| `phone` | text | DEAD | (nothing writes) | (nothing reads) |
| `lead_type` | text | PIPELINE-OWNED (hardcoded 'Cold') | run-pipeline-v2.ts:1122 | Portal filter |
| `tier` | text | PIPELINE-OWNED (hardcoded 'A') | run-pipeline-v2.ts:1123 | Portal filter |
| `campaign` | text | PIPELINE-OWNED (hardcoded 'P2') | run-pipeline-v2.ts:1124 | Portal filter |
| `send_status` | text | PIPELINE-OWNED (always written) | run-pipeline-v2.ts:1127 | Portal (key UX field) |
| `skip_reason` | text | **GHOST-RISK** (conditional spread on 'hold') | run-pipeline-v2.ts:1131-1133 | Portal (shown when hold) |
| `system_brief` | text | PIPELINE-OWNED (always written, null when not flagged) | run-pipeline-v2.ts:1134 | Portal (system brief section) |
| `persona_bucket` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1137 | Portal (Persona col) |
| `assigned_ae` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1138 | Portal (AE col) |
| `icp_status` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1139 | Portal + send-confidence |
| `icp_reason` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1140 | Portal expand-view |
| `icp_type` | text | PIPELINE-OWNED | run-pipeline-v2.ts:1141 | Portal (filter) |
| `updated_at` | timestamptz | PIPELINE-OWNED | run-pipeline-v2.ts:1142 | Portal (freshness) |
| `created_at` | timestamptz | AUTO | Postgres default | Portal |
| `email_corrected` | bool | OPERATOR-PROTECTED | NOT in pipeline body (READ-ONLY at upsert; pipeline only reads to check) | Pipeline precheck + portal |
| `original_email` | text | DEAD | (nothing writes) | (nothing reads) |
| `email_provider` | text | DEAD | (nothing writes) | (nothing reads) |
| `email_verification_status` | text | DEAD | (nothing writes) | (nothing reads) |
| `email_verified` | bool | DEAD | (nothing writes) | (nothing reads) |
| `contact_persona` | text | DEAD | (nothing writes — distinct from persona_bucket which IS written) | (nothing reads) |
| `grade` | text | DEAD | (nothing writes) | (nothing reads) |
| `icp_evidence` | text | DEAD | (nothing writes) | (nothing reads) |
| `operator_go` | bool | OPERATOR-PROTECTED | NOT in pipeline body | Portal (GO state) |
| `operator_go_at` | timestamptz | OPERATOR-PROTECTED | NOT in pipeline body | Portal |
| `revised_tier` | text | DEAD | (nothing writes) | (nothing reads) |
| `tier_revision_reason` | text | DEAD | (nothing writes) | (nothing reads) |
| `send_batch` | text | OPERATOR-PROTECTED (manual) | NOT in pipeline body | Portal (batch tagging) |
| `show_date` | date | DEAD | (nothing writes) | (nothing reads) |
| `show_name` | text | DEAD | (nothing writes) | (nothing reads) |
| `ae_notes` | text | OPERATOR-PROTECTED | NOT in pipeline body | Portal expand-view |
| `ae_owner_id` | text | OPERATOR-PROTECTED | NOT in pipeline body | Portal |
| `ae_review_notes` | text | OPERATOR-PROTECTED | NOT in pipeline body | Portal (used today for Dandridge + Ron Llamas context) |
| `ae_review_status` | text | OPERATOR-PROTECTED | NOT in pipeline body | Portal (verified/fixed badge) |
| `ae_reviewed_at` | timestamptz | OPERATOR-PROTECTED | NOT in pipeline body | Portal |
| `has_ae_notes` | bool | OPERATOR-PROTECTED (derived) | NOT in pipeline body | Portal |

### Summary for `sr_prospects`

| Bucket | Count | Notes |
|---|---|---|
| PIPELINE-OWNED (always written) | 17 | Safe to assume pipeline state |
| OPERATOR-PROTECTED | 9 | Never touched by pipeline. Safe. |
| GHOST-RISK | **1** | `skip_reason` — fix below |
| DEAD | 13 | No reader, no writer. Could be removed in a future migration. |
| AUTO | 1 | created_at |
| Backfill-only | 1 | company_website (only backfill-company-website.ts) |
| Identity | 2 | id, updated_at |

## Table 2: `sr_engine_output` (75 columns) — write/read map

**Key insight: `sr_engine_output` uses INSERT with a unique `run_id` per pipeline run. Old rows are NEVER overwritten.** The view `v_sr_engine_output_latest` shows the newest row per `prospect_id`. So:
- No cross-contamination WITHIN a row
- Old rows accumulate indefinitely
- The portal reads `v_sr_engine_output_latest` (newest)
- Operator's concern about hallucinated old data leaking applies less here, but **stale rows still exist in the table**

### Columns the v2 pipeline writes (from run-pipeline-v2.ts:973-1054)

| Column | Status | Notes |
|---|---|---|
| `prospect_id` | PIPELINE-OWNED | Composite key with run_id |
| `run_id` | PIPELINE-OWNED | Unique per run |
| `first_name`, `last_name`, `company`, `title`, `state`, `email` | PIPELINE-OWNED | Identity |
| `icp_status`, `icp_reason` | PIPELINE-OWNED | |
| `assigned_ae`, `ae_email` | PIPELINE-OWNED | |
| `mechanical_check_passed` | PIPELINE-OWNED | bool |
| `email_subject_t1`, `email_body_t1`, `email_ps_t1` | PIPELINE-OWNED | T1 only (T2/T3 columns exist but not written by v2) |
| `confidence_color` (green/yellow/amber/red) | PIPELINE-OWNED | mapped from email_confidence |
| `confidence_score` | PIPELINE-OWNED | MV score |
| `icp_volume_verdict`, `icp_volume_reasoning` | PIPELINE-OWNED | |
| `persona_bucket` | PIPELINE-OWNED | |
| `intel_signal_strength`, `intel_fit_rationale` | PIPELINE-OWNED | |
| `meddpicc_identified_pain`, `meddpicc_decision_criteria` | PIPELINE-OWNED (DERIVED — title regex) | |
| `system_brief` | PIPELINE-OWNED (null when not flagged) | |
| `send_status` | PIPELINE-OWNED (unified with sr_prospects) | |
| `research_summary` (JSON) | PIPELINE-OWNED (composer_mode, tier_counts, body_sentences, **citations** (Fix #3), apollo_credits, flag_status) | |
| `send_confidence` (JSON) | PIPELINE-OWNED (3-axis + composite) | |
| `ae_flag`, `company_summary` (CONDITIONAL: only when result.flag_status) | **GHOST-RISK on engine_output too** — but since each run inserts new row, only matters if same run_id repeats |
| `id`, `created_at` | AUTO | |

### Columns NOT written by v2 pipeline (ghost / dead in engine_output)

These exist in the schema but the v2 pipeline doesn't write them. On a fresh prospect: NULL. On a prospect with an OLD pipeline-version row: those fields contain stale OLD data (and v_sr_engine_output_latest picks the latest row, which is new and these fields are NULL).

If we re-run the v2 pipeline on a prospect that has OLD rows: a NEW row is inserted with NULLs in these fields. The view picks the new row, so the portal sees NULL. OK from a portal standpoint, but the old data still exists in older rows.

| Column | Notes |
|---|---|
| `email_body_t2`, `email_body_t3` | T2/T3 not yet generated by v2 |
| `email_subject_t2`, `email_subject_t3` | Same |
| `email_ps_t2`, `email_ps_t3` | Same |
| `influence_pattern_t1`, `t2`, `t3` | Older pipeline version field |
| `intel_buying_timeline`, `intel_decision_authority`, `intel_next_action`, `intel_risk_factors`, `intel_talking_points` | Older intel-structurer fields |
| `meddpicc_champion`, `meddpicc_competition`, `meddpicc_economic_buyer` | Older MEDDPICC fields |
| `microsite_headline`, `microsite_insight`, `microsite_slug` | Microsite content (written by separate persistMicrosite, not the main upsert) |
| `bead_status`, `bellwether_inference`, `challenger_insight`, `company_size`, `external_deadlines`, `fiber_activities`, `growth_signals`, `key_projects`, `known_tools`, `likely_competitors`, `likely_objections`, `market_moment`, `other_stakeholders`, `linkedin_summary` | All older company-facts / intel structurer columns. **The v2 pipeline does NOT populate these.** The portal expand-view DOES read some of them. So these display as empty on v2 outputs. |
| `research_confidence` | Older field |
| `research_model` | Older field |
| `verification_report`, `verified`, `domain_mismatch` | Verification suite — DEAD |
| `change_log` | Read by portal for "Changes" tab; NOT currently written by v2. Portal sees empty. |
| `email_confidence` | Read by portal but v2 writes `confidence_color` + `confidence_score` instead |

### Summary for `sr_engine_output`

| Bucket | Count | Notes |
|---|---|---|
| Written by v2 pipeline | ~28 | Mostly new + Fix #3 citations |
| Schema exists but v2 doesn't write | ~47 | Older pipeline versions wrote these; v2 doesn't; portal reads some |
| **Stale-row risk** | All | Old rows from prior runs persist forever. View hides them, but they're there. |

## The cross-contamination findings

### Finding 1 — `sr_prospects.skip_reason` ghost-risk (HIGH SEVERITY)

**Scenario:** Old wet-run produced send_status='hold' + skip_reason='Email pattern-guess...'. Operator manually fixes the email → re-runs pipeline. New run produces send_status='pending' (operator-locked). prospectBody:

```ts
send_status: 'pending',
...(finalSendStatus === 'hold' && { skip_reason: '...' }),  // NOT in body
```

The conditional spread doesn't add skip_reason → the old "Email pattern-guess..." text **stays in the DB**. Portal shows `pending` status with a stale "queued for back-pocket recovery" skip_reason next to it.

**Fix:** Always include skip_reason in the body, set to null when not hold. One-line change in run-pipeline-v2.ts:1131.

### Finding 2 — `sr_engine_output` stale rows (LOW SEVERITY)

Old run rows accumulate forever. Not visible in portal (view picks newest), but:
- Storage bloat (~600 rows for 5 wet-run prospects from multiple runs today)
- Confusing for SQL queries that don't use the view

**Fix:** Archive `sr_engine_output` rows older than X days OR with `pre-*` run_id prefixes to `sr_engine_output_archive` table. One-time SQL.

### Finding 3 — Many `sr_engine_output` schema columns are dead-or-stale (MEDIUM SEVERITY)

~47 columns exist that v2 doesn't write. The portal reads some (challenger_insight, growth_signals, etc.). On v2-only outputs they're NULL. On prospects with older rows, the view picks the v2 row → NULL displayed.

**Decision needed:** keep the columns and accept they'll be empty on v2 outputs, OR populate them in v2 (more LLM cost), OR drop them from schema (migration risk).

### Finding 4 — `sr_prospects` has 13 dead columns

Schema exists but no writer and no reader. Cruft. Low priority, but they confuse anyone reading the schema.

## Operator-protected fields (the "do not touch" list)

When you do the clean-slate, **DO NOT** clear these on sr_prospects:

```
email_corrected        # operator pre-verified flag
ae_notes
ae_owner_id
ae_review_notes
ae_review_status
ae_reviewed_at
operator_go
operator_go_at
send_batch
company_website        # populated by backfill script, not pipeline
```

## What the portal actually reads (page.tsx)

From `app/ops/page.tsx`:

- `sr_prospects.*` (all columns fetched, only some used)
- `v_sr_engine_output_latest.*` (the latest engine row per prospect)
- `sr_brain_dossiers.*` (fallback for prospects not in engine output)
- `sr_microsites.{prospect_id, slug}`
- `sr_review_notes.*` (operator review notes)
- `sr_review_timestamps.*` (for "has changes since X" computation)
- `sr_engine_output.{prospect_id, send_confidence, created_at}` (side-fetch for Send Confidence — view doesn't expose it)

The portal mostly reads from `v_sr_engine_output_latest` for engine-derived fields and `sr_prospects` for operator-set fields.

## Recommended clean-slate plan (DO NOT EXECUTE YET — propose only)

When you say GO:

### Step A — Archive (preserve, don't lose data)
```sql
CREATE TABLE sr_engine_output_archive_2026_06_10 AS
SELECT * FROM sr_engine_output WHERE prospect_id IN (...87 P2 cold IDs...);
```

### Step B — Clear sr_engine_output for P2 Cold cohort
```sql
DELETE FROM sr_engine_output WHERE prospect_id IN (...87 P2 cold IDs...);
```
(Fresh rows will be inserted by re-run.)

### Step C — Clear pipeline-owned fields on sr_prospects, KEEP operator-protected

```sql
UPDATE sr_prospects SET
  send_status = NULL,
  skip_reason = NULL,
  system_brief = NULL,
  persona_bucket = NULL,
  icp_reason = NULL,
  icp_type = NULL,
  -- DO NOT touch: email_corrected, ae_*, operator_*, company_website, send_batch
WHERE lead_type = 'Cold' AND id IN (...87 P2 cold IDs...);
```

### Step D — Fix the skip_reason ghost-risk in pipeline code
One-line fix in run-pipeline-v2.ts. Always include skip_reason, set null when not hold.

### Step E — Re-run pipeline on the canonical CSV
After A-D, fire `npx tsx run-pipeline-v2.ts --input data/showrev/p2-cold/P2-CANONICAL-2026-06-10.csv --include-flagged`. Every prospect gets a fresh full v2 run.

### Step F — Verify ONE prospect end-to-end
Pick Mark Evans. Trace every column written. Confirm portal displays match.

### Step G — Validate at scale
Spot-check 5-10 prospects across status buckets.

## Recommendations

1. **Read this. Confirm or push back** on the buckets above.
2. **Decide on the skip_reason fix** — I can ship in 5 min once approved.
3. **Decide on stale `sr_engine_output` rows** — archive vs leave.
4. **Decide on dead columns** — leave as cruft vs migration.
5. **THEN** approve the clean-slate plan.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-10 17:30 | Claude | Initial audit — sr_prospects + sr_engine_output column map, ghost-risk identification, clean-slate proposal |
