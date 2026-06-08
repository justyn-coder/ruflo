---
title: P1 Source of Truth — FC2026 Booth Visitors
status: ACTIVE
last_updated: 2026-06-06 08:22 EDT
version: v1
---

# P1 Source of Truth — FC2026 Booth Visitors

P1 = prospects who visited Inorsa booth 1728 at Fiber Connect 2026 (May 18-19, Gaylord Palms, Kissimmee FL). They have badge-scan data, AE notes, and in some cases conversations with Tom Marciano or the AEs.

---

## 1. Population

| Metric | Count |
|--------|-------|
| Total booth visitors (badge scans) | 45 |
| Researched (3-persona STORM) | 71 prospect IDs in research/ |
| Pipeline runs (manifests) | 108 |
| Loaded to HubSpot | ~45 (T1 only) |
| Cross-model judge reports | 1 (Dan Gillan / Dobson Fiber) |

**Source CSV:** Inorsa-provided booth scan export, processed through importer.ts.
**Research output:** `data/showrev/premium/research/fc2026-{NNN}-{persona}.json` (3 files per prospect: ae-proxy, industry-analyst, technical-evaluator).
**Cross-exam prompts:** `data/showrev/premium/prompts/fc2026-{NNN}-cross-exam.md`

---

## 2. Touch Status

| Touch | Status | System Used | Notes |
|-------|--------|-------------|-------|
| T1 | SENT | premium-pipeline.ts + run-pipeline.ts (mixed) | Loaded to HubSpot via hubspot-loader.ts. AE sequences enrolled. |
| T2 | NOT STARTED | Will use run-pipeline.ts (Wave 2 system) | New system has ICP gate, cold/post-show framing, competitive bridge |
| T3 | NOT STARTED | Will use run-pipeline.ts (Wave 2 system) | Under 60 words per copy rule |

**T2/T3 will use the upgraded pipeline (run-pipeline.ts with Wave 1+2 features).** T1 was built on a mix of premium-pipeline.ts and early run-pipeline.ts before the systems were consolidated.

---

## 3. What's Different for T2/T3 vs T1

| Capability | T1 | T2/T3 (Wave 2 system) |
|------------|----|-----------------------|
| ICP classification | Manual/implicit | Automated ICP gate (fiber_operator / ae_firm / non_icp) |
| Tower A&E rejection | None | Regex + LLM tier with fiber override |
| Composition framing | Post-show only | ICP-aware: different CTAs per ICP type |
| Competitive bridge | None | 9 competitors, 5 categories, competitor-aware hooks |
| Influence patterns | All 8 available | commitment_consistency excluded (no booth for P2, still valid for P1 T2/T3) |
| Judge scoring | 4 dimensions | 5 dimensions + ICP bonus scoring |
| Fact verification | Basic | Semantic verifier + web-search verification |
| Brain context | Partial | Full AgentDB/HNSW semantic retrieval |
| aeNotes threading | Broken in 3 sites | Fixed — dynamic from CSV through all phases |

**KEY for P1 T2/T3:** commitment_consistency IS valid for P1 because they DID visit the booth. The pattern selector should not exclude it. This is different from P2 where it must be excluded.

---

## 4. Decisions Log (P1-specific)

| # | Decision | Date | Why | Impact |
|---|----------|------|-----|--------|
| D-P1-01 | T1 emails sent as post-show follow-up framing | 2026-05-29 | Booth visitors expect follow-up | Correct for P1, wrong for P2 |
| D-P1-02 | AE assignment by territory (Mike=East, Nathan=Central, Lucas=West) | 2026-05-01 | Territory alignment with Inorsa sales org | Carry forward to T2/T3 |
| D-P1-03 | Tom Marciano INERT — never a sender | 2026-05-01 | Sovereign Operator directive | Permanent. Booth asset only. |
| D-P1-04 | Nick McManus corrections to value prop | 2026-06-03 | Product team input: validation claims were wrong | T2/T3 must use corrected framing (see inorsa-source-of-truth.md §7) |
| D-P1-05 | Premium-pipeline.ts deprecated, run-pipeline.ts is production | 2026-06-05 | Two pipelines caused drift | T2/T3 use run-pipeline.ts exclusively |
| D-P1-06 | Salutation hard-lock: `[FirstName],` only | 2026-05-01 | Tim directive — no greeting words | Permanent |
| D-P1-07 | Under 80 words T1/T2, under 60 words T3 | 2026-05-01 | Tim directive | Enforced by mechanical checks in judge.ts |
| D-P1-08 | One Inorsa sentence per email | 2026-05-01 | Pitch discipline | Mechanical check enforced |
| D-P1-09 | Pitch variants (3 approved, supersedes decisions.log #026) | 2026-06-07 | "We convert your GIS and LLD data into construction and permit drawings in minutes..." | Rotate A/B/C variants for spam differentiation |
| D-P1-10 | Each touch stands alone — no "following up on my previous email" | 2026-05-01 | Tim directive | T2/T3 must not reference T1 |

---

## 5. Issues and Cautions (carry forward to T2/T3)

### ACTIVE Issues

| ID | Issue | Severity | Detail |
|----|-------|----------|--------|
| I-P1-01 | **Validation claims in T1 emails** | HIGH | T1 was sent BEFORE Nick McManus's 2026-06-03 corrections. Some T1 emails may contain "validates" or "catches errors" language that is factually wrong. T2/T3 must NOT repeat this. Anti-validation rule is now universal. |
| I-P1-02 | **Tim TC-1B-v2 dispositions pending** | MEDIUM | Tim received 6 body variants for review (2026-05-27). Waiting for 5/6 dispositions before authorizing TC-2 cohort. Check `pilot_page_responses` in Supabase for `tim-tc-cohort-1b-2026-05-27-*` prefix. |
| I-P1-03 | **Cross-model judge not run on most T1 emails** | MEDIUM | Only Dan Gillan / Dobson Fiber has a cross-model report. T1 went through single-model judge only. T2/T3 should use `--cross-model-judge` flag. |
| I-P1-04 | **AI-writing detection not hardened** | MEDIUM | Pipeline scores 6/10 against research-validated tells. 3 checks identified (echoed sentence structures, participial clause density, sentence-length variance) but not yet implemented. See open-loop #1. |
| I-P1-05 | **HubSpot engagement data is all-time, not per-campaign** | LOW | HS properties don't filter by date. When measuring T1 performance, must apply date filter + OOO classification. See memory `feedback_hubspot_engagement_data_quality.md`. |
| I-P1-06 | **6 prospects fell to LLM ICP tier with API key error** | LOW | During Wave 2 testing, 6 of 15 Focus 100 contacts errored at LLM tier because ANTHROPIC_API_KEY wasn't in shell env. Pipeline's `import 'dotenv/config'` loads it at runtime but test environment missed it. Not a production issue — production runs load .env. |

### RESOLVED Issues (for reference)

| ID | Issue | Resolution |
|----|-------|-----------|
| R-P1-01 | aeNotes hardcoded to empty string in 3 sites | Fixed 2026-06-06: all 3 minimalDossier sites + CSV parser now use `row.aeNotes` dynamically |
| R-P1-02 | Git remote pointed to ruvnet/ruflo instead of fork | Fixed 2026-06-06: origin = justyn-coder/ruflo, upstream = ruvnet/ruflo |
| R-P1-03 | dotenv dropped during upstream merge | Fixed 2026-06-06: `npm install dotenv --save` |
| R-P1-04 | Osmose not caught by tower regex | By design: aeScore=0 means tower gate doesn't fire. LLM tier handles Osmose correctly in production. |

---

## 6. Pipeline Architecture (T2/T3 path)

**Orchestrator:** `src/showrev/m1-email-find/run-pipeline.ts` (~2000 lines)

**9-phase pipeline:**

```
P1 ICP Gate → P2 Email Find → P2b Prospect Upsert → P3a Brain Context →
P3 STORM Research (3 personas) → P3b Brain Ingest → P3c Intel Structurer →
P4 Substrate Search → P4b Semantic Verify → P5 Pattern Selection →
P6 Composition → P6b Fact Verify → P7 Judge Gate → P7b Cross-Model Judge →
P8 Microsite → P8b Microsite Upsert → P9 Supabase Write
```

**Key modules:**

| Module | File | Role |
|--------|------|------|
| ICP Gate | icp-gate.ts | Classifies fiber_operator / ae_firm / non_icp + tower rejection |
| Influence | influence.ts | 8 patterns, persona detection, ICP-aware CTAs, competitive bridge |
| Judge | judge.ts | Mechanical checks (word count, salutation, forbidden terms) + LLM scoring |
| Composer | run-pipeline.ts phaseComposition | ICP-aware framing, post-show vs cold |
| Brain | brain-agentdb.ts + brain-ingest.ts | AgentDB/HNSW semantic retrieval + entity ingestion |
| Research | personas.ts | 3-persona STORM: AE Proxy, Industry Analyst, Technical Evaluator |
| Cross-model | cross-model-judge.ts | Multi-model adversarial judge (optional flag) |

---

## 7. Data Locations

| What | Path | Notes |
|------|------|-------|
| Research outputs | data/showrev/premium/research/ | 213 files (71 prospects x 3 personas) |
| Cross-exam prompts | data/showrev/premium/prompts/ | Persona cross-examination questions |
| Judge reports | data/showrev/premium/judge-reports/ | Cross-model verdicts |
| Run manifests | data/showrev/premium/run-*.json | 108 pipeline runs |
| Run checkpoints | data/showrev/premium/run-*-checkpoint.json | 106 intermediate states |
| Test data | data/showrev/test/ | wave2-icp-test.csv, wave2-focus100-test.csv |
| Brain entities | data/brain/fiber-telecom/inorsa/ | Entity graph + context digest |
| Brain substrate | data/brain/substrate/ | 4,000+ podcast transcript chunks |
| Brain DB | data/brain/brain.sqlite | AgentDB SQLite store |
| HubSpot loader | src/showrev/m1-email-find/hubspot-loader.ts | Breeze-validated load protocol |
| Inorsa SOT | data/showrev/inorsa-source-of-truth.md | Product claims, constraints, AE roster |

---

## 8. T2/T3 Execution Checklist

Before running T2:

- [ ] Confirm Tim TC-1B-v2 dispositions (need 5/6) — check Supabase `pilot_page_responses`
- [ ] Source .env before pipeline run: `source src/showrev/m1-email-find/.env`
- [ ] Run with `--cross-model-judge` flag for adversarial scoring
- [ ] Verify T2 does NOT reference T1 content (each touch stands alone)
- [ ] Verify anti-validation compliance (no "validates", "catches errors", "quality control" as error-catching)
- [ ] Spot-check ICP-aware CTAs match prospect type
- [ ] Verify commitment_consistency IS allowed for P1 (booth visitors)
- [ ] Verify word count: under 80 words T2, under 60 words T3
- [ ] HubSpot load: use hubspot-loader.ts with domain-first dedup + explicit association
- [ ] Post-load: date-filter engagement data, classify OOO responses

---

## 9. What NOT to Carry Forward

These were T1 artifacts or one-shot work. Not needed for T2/T3:

- `premium-pipeline.ts` — deprecated, use run-pipeline.ts
- `pipeline.ts` — original prototype, superseded
- `data/showrev/premium/test-quality-*.csv` — T1 quality iteration CSVs
- Python substrate loader scripts (`gen-substrate-csv*.py`, `load-substrate*.py/sh`) — one-shot data loads, done
- Session transcripts in `canon/_session_transcripts/` — historical, not operational

---

## Version history

| Version | Date (EDT) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-06 08:22 | Claude | Initial P1 SOT. Sources: inorsa-source-of-truth.md, wave-1-2-implementation-plan.md, pipeline source code, run artifacts, session context from Wave 1+2 builds. |
