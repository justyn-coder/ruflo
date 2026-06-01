---
title: ShowRev Engine — src/showrev/m1-email-find/
status: ACTIVE
last_updated: 2026-05-31 23:32 EST
version: v2
---

# ShowRev Engine

B2B post-show outreach pipeline. Takes a booth-scan CSV, researches each prospect
with 3 AI personas (parallel), composes influence-led emails, structures intel
reports, generates ABM microsite content, quality-gates everything, and stages
output for operator review before HubSpot delivery.

## Quick start

```bash
# Set API key (required)
export ANTHROPIC_API_KEY=$(cat ~/.anthropic-api-key)

# Dry run (preview, no LLM calls)
npx tsx premium-pipeline.ts dry-run --icp=pass

# Run on ICP-pass contacts
npx tsx premium-pipeline.ts run --icp=pass --batch=3

# Single prospect
npx tsx premium-pipeline.ts run --prospect=fc2026-054

# Resume a crashed run
npx tsx premium-pipeline.ts run --run-id=run-20260531-dgiq

# Rollback a bad run from Supabase
npx tsx supabase-adapter.ts rollback run-20260531-a4x2 --confirm

# Optimize prompts with dspy.ts (uses scale test data as training set)
npx tsx prompt-optimizer.ts optimize
```

## File map

```
=== Pipeline ===
premium-pipeline.ts   Orchestrator. 10-phase pipeline:
                      1. CSV import + ICP classify
                      2. STORM 3-persona research (parallel)
                      2b. Brain ingest (entity extraction)
                      3. Influence pattern selection
                      4. Email composition
                      5. Intel report structuring
                      6. ABM microsite composition
                      7. Mechanical quality checks
                      8. Output files (JSON + Markdown)
                      9. Supabase write
                      Includes: checkpointing, run_id, retry, resume.

llm-client.ts         Anthropic SDK client with prompt caching.
                      All LLM calls go through callLLM / callLLMWithBrainCache.
                      cache_control: ephemeral on system content (Brain KB).
                      Retry logic: rate-limit, overloaded, timeout detection.
                      Requires: ANTHROPIC_API_KEY env var.

=== Research ===
importer.ts           CSV parser + ICP classification (pass/hold/reject).
                      Segment-based auto-reject. Title-signal detection.

personas.ts           STORM 3-persona definitions: Industry Analyst, AE Proxy,
                      Technical Evaluator. Search strategies + cross-exam questions.

researcher.ts         V1 single-agent researcher. Used within persona prompts.

=== Composition ===
influence.ts          8 influence patterns + signal mapping + anti-AI-tell checklist.
                      buildPatternSelectorPrompt + buildComposerPrompt.

intel-structurer.ts   Extracts 30+ structured HubSpot dossier fields from raw
                      3-persona research. Single LLM call with validation.

microsite-composer.ts Generates ABM Field Brief content (headline, insight, case study)
                      from dossier + pattern selection. Extensible format field.

=== Quality ===
judge.ts              4-dimension LLM judge + runMechanicalChecks (deterministic).
                      Word count gate: target 80, fail at 88 (+10% buffer).
                      P.S. slug check is warning, not failure.

judges.ts             3-judge adversarial panel: Tim Proxy, Recipient Proxy, Skeptic.
                      Tim Proxy trained on 75 real email reviews.

cross-model-judge.ts  5-model judge panel (Claude, Gemini, GPT-5, Grok, DeepSeek).
                      Majority-vote consensus. Divergence detection.

=== Brain ===
brain-ingest.ts       Entity extraction from research output. Dedup against graph.
                      Dual-write: JSONL (primary) + AgentDB (semantic search).
                      Digest regeneration every 10 prospects.

brain-agentdb.ts      AgentDB semantic persistence. Vector-indexed entities
                      (384-dim all-MiniLM-L6-v2). Semantic search replaces
                      linear scan for Brain context loading.

=== Data ===
supabase-adapter.ts   Supabase REST API adapter. Pre-write validation, dry-run
                      preview, upsert on (prospect_id, run_id), rollback by run_id.

dossier-schema.ts     HubSpot property schema (showrev_ prefix, 30+ fields).
                      formatDossierForAE() produces AE prep sheets.

=== Optimization ===
prompt-optimizer.ts   dspy.ts integration. BootstrapFewShot compiler using scale
                      test emails as training data (36 examples). AnthropicLM
                      with CachingLM. Judge scores as optimization metric.

=== Verification ===
verify-emails.ts      Email address verification (Findymail API).
verify-facts.ts       Fact verification for dossier claims.

=== Deprecated ===
composer.ts           V1 email composer. Use influence.ts buildComposerPrompt.
pipeline.ts           V1 pipeline runner. Use premium-pipeline.ts.
```

## Data flow

```
Phase 0:  Brain Warmup (pre-run, once per project)
Phase 1:  CSV ──► importer.ts (parse, dedup, ICP classify)
Phase 2:  ──► personas.ts + researcher.ts (3-persona STORM, parallel, via Anthropic SDK)
Phase 2b: ──► brain-ingest.ts (extract entities ──► JSONL + AgentDB)
Phase 3:  ──► influence.ts (pattern selection per touch)
Phase 4:  ──► influence.ts buildComposerPrompt (email composition)
Phase 5:  ──► intel-structurer.ts (raw research ──► 30+ HubSpot fields)
Phase 6:  ──► microsite-composer.ts (dossier ──► ABM content)
Phase 7:  ──► judge.ts runMechanicalChecks (deterministic gate)
Phase 8:  ──► JSON + Markdown output files
Phase 9:  ──► supabase-adapter.ts (write to sr_brain_dossiers + sr_microsites)
```

## Key types

| Type | File | What it is |
|------|------|-----------|
| `Prospect` | importer.ts | Parsed CSV row with ICP status |
| `ICPStatus` | importer.ts | `'pass' \| 'hold' \| 'reject'` |
| `EmailOutput` | premium-pipeline.ts | Composed email with pattern + metrics |
| `ProspectOutput` | premium-pipeline.ts | Complete pipeline output per prospect |
| `PatternSelection` | influence.ts | Chosen influence pattern + rationale |
| `InfluencePattern` | influence.ts | One of 8 pattern keys |
| `MechanicalCheckResult` | judge.ts | Pass/fail + failures + warnings |
| `HubSpotDossier` | dossier-schema.ts | Full HubSpot property set (30+ fields) |
| `BrainEntity` | brain-ingest.ts | Extracted entity (company/funding/relationship/tool) |
| `MicrositeRow` | microsite-composer.ts | ABM page content for sr_microsites |
| `CrossModelReport` | cross-model-judge.ts | Multi-model consensus result |
| `SupabaseWritePayload` | supabase-adapter.ts | Validated row for Supabase write |

## CLI flags

| Flag | Default | What it does |
|------|---------|-------------|
| `--tiers=A,B` | A,B | Filter by batch tier |
| `--icp=pass,hold` | — | Filter by ICP status |
| `--prospect=fc2026-001` | — | Single prospect by ID |
| `--email=user@co.com` | — | Single prospect by email |
| `--model=sonnet` | sonnet | LLM model (sonnet/opus/haiku) |
| `--batch=5` | 5 | Prospects per batch |
| `--run-id=run-xxx` | auto | Resume from checkpoint |
| `--dry-run` | false | Preview only, no LLM/Supabase |

## Environment variables

| Var | Required | What it does |
|-----|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API for all LLM calls |
| `NEXT_PUBLIC_SUPABASE_URL` | For Supabase writes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For Supabase writes | Supabase anon key |

## AE territory mapping

| Territory | AE | States |
|-----------|-----|--------|
| East | Mike Rutski | CT MA RI NH VT ME NY NJ PA DE MD DC VA WV NC SC GA FL AL MS TN KY OH IN MI |
| Central | Nathan Dunn | TX OK KS NE SD ND MN IA MO AR LA WI IL |
| West | Lucas Spencer (default) | WA OR CA NV AZ NM CO UT WY MT ID HI AK |

Resolution order: `assigned_ae` field > state mapping > default Lucas.

## Test results (2026-05-31)

- **Scale test**: 11 ICP-PASS prospects, 33 emails, 34 Brain entities
- **Pattern diversity**: 5 of 8 influence patterns used across T1 emails
- **Word count**: all 33 emails under 88-word gate (range: 47-85)
- **Intel structurer**: 10/11 succeeded (1 timeout, retry recovered)
- **Microsite headlines**: 11 unique, company-specific
- **Performance**: ~17 min/prospect (claude -p) → ~7 min/prospect (Anthropic SDK + parallel)

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v2 | 2026-05-31 23:32 | Claude | Full rewrite. Added llm-client, brain-agentdb, intel-structurer, microsite-composer, prompt-optimizer. Updated data flow to 10 phases. Added env vars section + test results. |
| v1 | 2026-05-31 12:30 | Claude | Initial README. |
