---
title: ShowRev Engine — src/showrev/m1-email-find/
status: ACTIVE
last_updated: 2026-05-31 12:30 EST
version: v1
---

# ShowRev Engine

B2B post-show outreach pipeline. Takes a booth-scan CSV, researches each prospect
with 3 AI personas, composes influence-led emails, quality-gates them, and stages
output for operator review before HubSpot delivery.

## Quick start

```bash
# Dry run (preview, no LLM calls)
npx tsx premium-pipeline.ts dry-run --tiers=A,B

# Run on ICP-pass contacts
npx tsx premium-pipeline.ts run --icp=pass --batch=3

# Single prospect by ID or email
npx tsx premium-pipeline.ts run --prospect=fc2026-061
npx tsx premium-pipeline.ts run --email=len@btgrp.com

# Resume a crashed run
npx tsx premium-pipeline.ts run --run-id=run-20260531-a4x2

# Rollback a bad run from Supabase
npx tsx supabase-adapter.ts rollback run-20260531-a4x2          # dry-run
npx tsx supabase-adapter.ts rollback run-20260531-a4x2 --confirm # execute
```

## File map

```
premium-pipeline.ts   Orchestrator. The pipeline to use.
                      CSV import -> STORM research -> influence selection ->
                      composition -> mechanical checks -> Supabase write.
                      Includes: retry w/ backoff, checkpointing, run_id tracking.

importer.ts           CSV parser + ICP classification.
                      Reads booth-scan CSVs. Deduplicates. Assigns ICP status
                      (pass/hold/reject) based on segment + title + AE grade.
                      Tiers (A-E) retained as batch-order labels only.

personas.ts           STORM multi-persona research definitions.
                      3 personas: Industry Analyst, AE Proxy, Technical Evaluator.
                      Each has search strategies, focus areas, cross-exam questions.

researcher.ts         V1 single-agent researcher (via claude -p).
                      Produces JSON dossiers. Used by premium-pipeline.ts for
                      hypothesis-driven research within each persona.

influence.ts          8 influence patterns + signal-to-pattern mapping.
                      Builds the pattern selector prompt and the composer prompt.
                      Contains the full anti-AI-tell checklist.

judge.ts              4-dimension LLM judge + mechanical checks.
                      Scores research_depth, vp_connection, tone, conciseness.
                      runMechanicalChecks: deterministic rules (word count,
                      em-dash, salutation, AI-tell phrases, product refs).

judges.ts             3-judge panel: Tim Proxy, Recipient Proxy, Skeptic.
                      Tim Proxy trained on 75 reviewed emails. Contains
                      TIM_EDIT_PATTERNS (killed phrases, AI tells, approved
                      patterns). Used for deeper quality assessment.

cross-model-judge.ts  5-model judge panel (Claude, Gemini, GPT-5, Grok, DeepSeek).
                      Majority-vote consensus. Divergence detection.

supabase-adapter.ts   Supabase output adapter.
                      Pre-write validation, dry-run preview, upsert on
                      (prospect_id, run_id), rollback by run_id.

dossier-schema.ts     HubSpot property schema (showrev_ prefix).
                      30+ fields across contact, company, sales intel, email
                      sequence. formatDossierForAE() produces AE prep sheets.

verify-emails.ts      Email address verification (Findymail API).
verify-facts.ts       Fact verification for dossier claims.

--- Deprecated ---
composer.ts           V1 email composer. Use influence.ts buildComposerPrompt.
pipeline.ts           V1 pipeline runner. Use premium-pipeline.ts.
```

## Data flow

```
CSV → importer.ts (parse, dedup, ICP classify)
  → personas.ts + researcher.ts (3-persona STORM research via claude -p)
  → influence.ts (pattern selection for each touch)
  → influence.ts buildComposerPrompt (email composition via claude -p)
  → judge.ts runMechanicalChecks (deterministic quality gate)
  → supabase-adapter.ts (write to sr_brain_dossiers)
  → JSON + Markdown output files
```

## Key types

| Type | File | What it is |
|------|------|-----------|
| `Prospect` | importer.ts | Parsed CSV row with ICP status |
| `ICPStatus` | importer.ts | `'pass' \| 'hold' \| 'reject'` |
| `PatternSelection` | influence.ts | Chosen influence pattern + rationale |
| `InfluencePattern` | influence.ts | One of 8 pattern keys |
| `MechanicalCheckResult` | judge.ts | Pass/fail + failure list |
| `JudgeVerdict` | judge.ts | Per-touch 4-dimension score |
| `HubSpotDossier` | dossier-schema.ts | Full HubSpot property set |
| `ProspectOutput` | premium-pipeline.ts | Complete pipeline output per prospect |
| `CrossModelReport` | cross-model-judge.ts | Multi-model consensus result |
| `SupabaseWritePayload` | supabase-adapter.ts | Validated row for Supabase write |

## CLI flags

| Flag | Default | What it does |
|------|---------|-------------|
| `--tiers=A,B` | A,B | Filter by batch tier |
| `--icp=pass,hold` | — | Filter by ICP status |
| `--prospect=fc2026-001` | — | Single prospect by ID |
| `--email=user@co.com` | — | Single prospect by email |
| `--model=sonnet` | sonnet | LLM model for claude -p |
| `--batch=5` | 5 | Prospects per batch |
| `--run-id=run-xxx` | auto | Resume from checkpoint |
| `--dry-run` | false | Preview only, no LLM/Supabase |

## AE territory mapping

| Territory | AE | States |
|-----------|-----|--------|
| East | Mike Rutski | CT MA RI NH VT ME NY NJ PA DE MD DC VA WV NC SC GA FL AL MS TN KY OH IN MI |
| Central | Nathan Dunn | TX OK KS NE SD ND MN IA MO AR LA WI IL |
| West | Lucas Spencer (default) | WA OR CA NV AZ NM CO UT WY MT ID HI AK |

Resolution order: `assigned_ae` field > state mapping > default Lucas.

## External dependencies

- `claude -p` (Anthropic CLI) — all LLM calls
- Supabase project `slttpknnuthbttjuzrnz` — sr_* tables
- Findymail API — email verification
- Gemini / GPT-5 / Grok / DeepSeek APIs — cross-model judging (via engine/scripts/)

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 12:30 | Claude | Initial README. File map, data flow, types, CLI flags. |
