---
title: Wave 1+2 Implementation Plan — Inorsa Sales Intelligence Integration
status: DRAFT
last_updated: 2026-06-05 23:39 EST
version: v2
---

## Context

Inorsa shared their complete internal sales intelligence system (ICP profiles, products, qualification guardrails, sales stages, MEDDPICC framework, competitive landscape, talk track doctrine, pre-call brief skill, pipeline review tools). A 9-agent workflow (4 analysts, 1 system integrator, 3 adversarial judges, 1 synthesizer) analyzed this intelligence against the current pipeline codebase and produced a 3-wave improvement plan. This file captures the corrected Wave 1 + Wave 2 plan with all operator flags incorporated.

**Session origin:** 2dc13dbc-ae03-43e1-be34-ac0a1a53d094 (2026-06-05)
**Full workflow output:** /private/tmp/claude-501/-Users-justynszymczyk-Documents-GitHub-ruflo/2dc13dbc-ae03-43e1-be34-ac0a1a53d094/tasks/wzihxgxby.output
**External judge score:** Completeness 8, Risk 9, Testability 9, System Coherence 9, Operator Actionability 7, Adversarial Thoroughness 9

## Operator Corrections (must be honored)

1. **COLD PROSPECTS.** P2 = 2,300 FC2026 attendees who did NOT visit booth 1728. No booth notes, no AE interactions, no badge-scan data. These are COLD, not post-show follow-up. The composer prompt's "post-show follow-up for Fiber Connect 2026" framing (influence.ts line 273) must change for P2.
2. **Focus 100.** First wave is 100 priority companies matched against the attendee list. Find their contacts who fit ICP personas. Run through pipeline first. Rest of P2 follows.
3. **NOT "exhibitors."** The prospect source is the FC2026 ATTENDEE LIST. Never use "exhibitor list" — that was agent drift, not reality.
4. **No `commitment_consistency` for cold.** No booth interaction means this influence pattern is irrelevant. Pattern selector must deprioritize or exclude for cold prospects.
5. **Consolidate pipelines.** premium-pipeline.ts (created May 31) and run-pipeline.ts (created June 4) must be consolidated into one pipeline. run-pipeline.ts is the production path. Audit premium for useful features (lean-composer routing, signal-strength-based composition selection) and merge into run-pipeline.ts. Deprecate premium-pipeline.ts.
6. **Wave 3 is parked.** Low priority. Do not implement in this build cycle.
7. **Primary pipeline is run-pipeline.ts.** All Wave 2 composition changes target this file.

## Current System State (verified 2026-06-05)

### Files to modify

| File | Lines | Role |
|---|---|---|
| `src/showrev/m1-email-find/judge.ts` | 319 | Mechanical checks + LLM judge prompt |
| `src/showrev/m1-email-find/influence.ts` | 368 | Persona detection, pattern selector, composer prompt |
| `src/showrev/m1-email-find/icp-gate.ts` | 134 | ICP classification (regex + LLM) |
| `src/showrev/m1-email-find/run-pipeline.ts` | ~1800 | Pipeline orchestrator |
| `src/showrev/m1-email-find/intel-structurer.ts` | ~200 | Structured intel extraction |
| `src/showrev/m1-email-find/brain-ingest.ts` | ~200 | Brain entity extraction + storage |
| `src/showrev/m1-email-find/personas.ts` | ~80 | Research persona prompts |
| `src/showrev/m1-email-find/premium-pipeline.ts` | ~900 | TO BE CONSOLIDATED into run-pipeline.ts |
| `src/showrev/m1-email-find/lean-composer.ts` | ~200 | Minimal composition for weak signals |

### Key function signatures (current)

```typescript
// judge.ts line 18
runMechanicalChecks(body, subject, ps, aeName, aeEmail, prospectFirstName, micrositeSlug): MechanicalCheckResult

// judge.ts line 159
buildJudgePrompt(dossier, touch, researchContext?): string

// influence.ts line 196
buildPatternSelectorPrompt(dossierSummary, aeNotes, contactTitle, touchNumber, previousPatterns): string

// influence.ts line 258
buildComposerPrompt(patternSelection, dossierSummary, prospect, aeNotes, touchNumber, previousTouchSubject?, aeName, aeEmail, micrositeSlug?, keyFacts?): string

// run-pipeline.ts line 432
extractKeyFacts(structuredIntel?): string
```

### Call sites for buildComposerPrompt

1. `run-pipeline.ts` phaseComposition — 10 args including keyFacts
2. `run-pipeline.ts` recompose paths (2 sites, ~lines 1601, 1736) — same 10 args
3. `premium-pipeline.ts` line 598 — 9 args, NO keyFacts
4. `lean-composer.ts` — has its own `buildLeanPrompt`, does NOT call `buildComposerPrompt`

### Call sites for buildPatternSelectorPrompt

1. `run-pipeline.ts` phasePatternSelection
2. `premium-pipeline.ts` pattern selection phase

### Call sites for runMechanicalChecks

1. `run-pipeline.ts` phaseJudge
2. `premium-pipeline.ts` mechanical check phase
3. `lean-composer.ts` line ~221

### Guard scanning surface inconsistency (current bug)

- Lines 108-110 (tower/cellular/Harmoni/structural analysis): scan `body` only
- Line 114 (offshore/India): scans `prospectCopy` (subject + body)
- All new guards should scan `prospectCopy` for consistency

## WAVE 1 — Safety + Plumbing (4-6 hours)

**Goal:** Zero email output changes. Add mechanical guards, thread icpType through signatures, enrich intel structurer. Pipeline produces identical emails before and after Wave 1.

### 1a. Unify tower/cellular guard scanning surface (judge.ts)

**What:** Move lines 108-110 from scanning `body` to scanning `prospectCopy` (subject + body). Add two new patterns: `/\bmount analysis\b/i` and `/\bTNX\b/`.

**Why:** Subject line could carry tower language undetected. Mount analysis (MA) and TNX are tower products not currently guarded.

**Code change:**
```typescript
// REPLACE lines 108-110 (currently scan body) with prospectCopy scanning:
// structural analysis, Harmoni, tower/cellular — now scan subject + body
// ADD: mount analysis, TNX as new guards
```

**Test:** Existing 5-company validation set passes unchanged. Synthetic: subject "Tower engineering solutions" triggers. Body "mount analysis credits" triggers.

### 1b. MicroStation guard (judge.ts)

**What:** Add `/\bMicroStation\b/i` test against `prospectCopy`. Failure level.

**Test:** "compatible with MicroStation" triggers. Pitch A "Quality control is built in" does NOT trigger. Existing corpus passes.

### 1c. Drawing QC guard (judge.ts)

**What:** Add `/\b(?:drawing\s+QC|drawing\s+quality\s+control)\b/i` test against `prospectCopy`. Failure level.

**Test:** "Drawing QC tool" triggers. "Quality control is built in" does NOT trigger (no "drawing" prefix).

### 1d. Thread icpType through function signatures

**What:** Add `icpType?: string` as OPTIONAL last parameter (default `'fiber_operator'`) to:
- `buildPatternSelectorPrompt` (influence.ts)
- `buildComposerPrompt` (influence.ts)
- `buildJudgePrompt` (judge.ts)
- `runMechanicalChecks` (judge.ts)

Update `run-pipeline.ts` to pass `result.icpResult?.icpType` through phasePatternSelection, phaseComposition, and phaseJudge.

**CRITICAL:** Parameter MUST be optional with default. premium-pipeline.ts (until consolidated), lean-composer.ts, and validate-only.ts call these functions without icpType and must continue working.

**NO PROMPT TEXT CHANGES in this step.** Signatures only.

**Test:** TypeScript compiles. Pipeline on 3-company set produces byte-identical output (diff before/after). icpType logged at entry to each phase.

### 1e. Intel structurer fields (intel-structurer.ts)

**What:** Add two fields to the JSON schema in `buildStructurerPrompt`:
- `company.showrev_automation_level`: enum `manual | partial | moderate | high | unknown`
- `salesIntel.showrev_product_fit`: enum `fiber_drawings | validation_suite | data_suite | multiple | unknown`

Add validation arrays and validateAndClean logic (map unexpected values to `unknown`).

**Test:** Run structurer on 3 existing research outputs. Fields appear. Unknown when evidence thin. Existing field quality unchanged.

### 1f. Brain competitor entities (brain-ingest.ts)

**What:** Add `'competitor_tool'` to BrainEntity type union. Add known-competitor list with competitive_category metadata:
```
IQGeo -> system_of_record
SiteTracker -> system_of_record
Esri -> system_of_record
Biarri -> system_of_record
Render Networks -> system_of_record
3GIS -> system_of_record
Katapult -> system_of_record
SharePoint -> document_repository
Osmose -> engineering_software
Autodesk -> engineering_software
```

When extractEntities matches a known competitor, classify as `competitor_tool` instead of generic `tool`.

**Test:** Run pipeline on prospects known to use IQGeo. Brain captures `competitor_tool` entity. No duplicates.

### 1g. Research qualification signals (personas.ts)

**What:** Add 2 questions to Technical Evaluator persona:
1. "What is their GIS-to-CAD automation level? Look for evidence of existing automation tools, custom scripts, or manual workflow."
2. "Is this company a MicroStation shop? Check job postings and tech stack mentions for MicroStation/Bentley indicators."

**Test:** Research output mentions automation level assessment. No tower/cellular language introduced.

### 1h. Enrich extractKeyFacts (run-pipeline.ts)

**Depends on:** 1e (intel structurer fields must exist first)

**What:** Add 3 conditional lines to `extractKeyFacts()` before the return statement:
- Competitive tools (from showrev_competitive_landscape)
- Automation level (from showrev_automation_level, omit if 'unknown')
- Best product fit (from showrev_product_fit, omit if 'unknown')

**Test:** Run pipeline on 3 prospects. keyFacts includes competitive tools. Unknown values omitted.

### 1x. Consolidate premium-pipeline.ts into run-pipeline.ts

**What:** Audit premium-pipeline.ts for features run-pipeline.ts lacks:
- Lean-composer routing (signal strength -> lean/full decision) — **MERGE** into run-pipeline.ts
- INORSA_VP_SUMMARY block — **already in run-pipeline.ts**
- AE territory mapping — **already in run-pipeline.ts**

After merge, add deprecation header to premium-pipeline.ts pointing to run-pipeline.ts.

**Test:** run-pipeline.ts with `--composer=auto` routes weak signals to lean-composer. TypeScript compiles. 3-company test identical output.

### Wave 1 validation gate

Run 5-company validation set (Hawaiian Telcom, PCCI Group, JDI Fibertech, Terracon, Mohawk Networks) through run-pipeline.ts:
- [ ] All 5 pass mechanical checks
- [ ] Email output identical to pre-Wave-1 baseline (except new guard checks logged)
- [ ] icpType logged at phasePatternSelection, phaseComposition, phaseJudge
- [ ] New guards catch synthetic bad inputs (MicroStation, Drawing QC, mount analysis, TNX)
- [ ] No false positives on Pitch A "Quality control is built in"

## WAVE 2 — ICP-Aware Composition (8-12 hours, after Wave 1 validated)

**Goal:** A&E firms get different CTAs, bridge framing, and judge scoring than fiber operators. Cold prospect framing replaces post-show follow-up framing.

### 2a. ICP-specific CTAs in hypothesis format (influence.ts)

**What:** Add `ICP_CTA_OPTIONS` constant mapping icpType to 4 discovery questions each. Fiber operators get GIS-to-CAD questions. A&E firms get throughput/QA-time questions (e.g., "How many hours does someone spend cross-checking before engineering can start?"). These are workflow-pain questions about the prospect's bottleneck, NOT references to Inorsa's Validation Suite product — the anti-validation rule still applies.

Replace hardcoded CTA default in `buildComposerPrompt` with segment-selected options. When keyFacts have company-specific data (>3 lines, not just state-level), use hypothesis format: "Based on [fact], I suspect [hypothesis]. Is that directionally right?" When thin, fall back to diagnostic CTA from the list.

**CRITICAL:** Hypothesis CTAs fire on research richness, NOT booth notes (there are none for P2).

### 2b. Cold prospect framing (influence.ts)

**What:** The composer prompt line 273 says "You are writing a post-show follow-up email for Fiber Connect 2026." For P2 cold prospects, this must change:

- If prospect has aeNotes (P1 booth visitors): keep current "post-show follow-up" framing
- If prospect has NO aeNotes (P2 cold): use "You are writing a cold outreach email to a fiber industry professional. No prior interaction."

Also update pattern selector: when no aeNotes, exclude `commitment_consistency` from available patterns.

### 2c. Activate ICP-aware prompt framing (influence.ts + run-pipeline.ts)

**What:** Add ICP-segment blocks to `buildComposerPrompt` and `buildPatternSelectorPrompt`. For fiber_operator: GIS-to-CAD, build schedule, BEAD deadlines. For ae_firm: validation bottleneck, project throughput, CD revision overhead, margin-per-project.

Update run-pipeline.ts recompose paths (~lines 1601, 1736) to pass icpType.

**IMPORTANT:** The anti-validation instruction on line 310 ("NEVER claim Inorsa validates inputs or catches errors") stays UNIVERSAL. Do NOT soften for A&E. Validation context goes in pre-call brief (Wave 3, parked) where a human AE gates it.

### 2d. Talk-track bridge structure (influence.ts)

**What:** Replace bridge instruction in `buildComposerPrompt` with failure-friction micro-template:
1. Name the specific friction the opener fact implies
2. Make it specific to the persona's workflow
3. Do NOT name the fix yet — let the CTA invite the conversation

Add 2 examples per ICP segment (good bridge vs bad bridge).

### 2e. Competitive bridge adaptation (influence.ts)

**What:** Hard-code top 10 competitors to 6 playbook categories. Conditional block: when keyFacts mention a known competitor, bridge acknowledges incumbent + names the gap. Unknown competitors get standard bridge.

### 2f. ICP-aware judge scoring — bonus only (judge.ts)

**What:** Add ICP-segment JTBD guidance to `buildJudgePrompt`. BONUS scoring only (+1-2 for segment-appropriate framing). No penalties. No existing email scores lower.

**MUST deploy WITH or AFTER composition changes, never before.**

### 2g. Tower A&E exclusion (icp-gate.ts)

**What:** Narrow patterns only: cell site, macro site, small cell, tower engineering/design, DAS. Conflict resolution: fiber indicators override tower indicators.

### Wave 2 validation gate

Run 15-company set (5 A&E + 10 fiber operators) through run-pipeline.ts:
- [ ] A&E firms get throughput/QA-time CTAs (NOT Validation Suite references)
- [ ] Fiber operators get GIS-to-CAD CTAs
- [ ] No dimension drops >1 point vs baseline
- [ ] Average score >= 6.5 (baseline 6.92, regression budget 0.42)
- [ ] Zero tower/cellular contamination (grep all output)
- [ ] Cold prospect framing used (no "post-show follow-up" for prospects without aeNotes)
- [ ] `commitment_consistency` pattern NOT selected for cold prospects
- [ ] Lean-composer path works (from consolidated pipeline)

## DO NOT DO

| Item | Why Not |
|---|---|
| Soften validation ban for A&E emails | Ban exists in 3 locations. Conditioning one creates contradictory LLM instructions. If ICP classification wrong, fiber operator gets validation claims. Keep universal in automated email. |
| Inject playbook discovery questions into research personas | Tower/cellular risk. Structural Analysis could leak into research output. |
| Wave 3 (pre-call brief, MEDDPICC hypothesis, competitive extraction) | Parked per operator directive. Low priority. |

## P2 Prerequisite: Thin-Substrate Discovery

Waves 1-2 improve composition quality for prospects the pipeline already has emails for. P2 cold prospects have NO email and NO domain — just name, company, title, state, country. Before any Wave 1-2 composition improvements apply to P2 prospects, a discovery phase must run:

1. **Domain discovery** — match company name to website domain (Clearbit, Apollo, web search fallback)
2. **Company verification** — confirm the company is real and fiber-relevant
3. **Email discovery** — find contact email via domain (the existing m1-email-find pipeline handles this once domain is known)

This discovery phase is **pipeline infrastructure work, separate from Waves 1-2.** Waves 1-2 assume the pipeline receives a prospect with at least company + domain + email. The P2 pipeline wrapper that feeds prospects into run-pipeline.ts must solve discovery first.

**Focus 100 matching logic:** Take Focus 100 company names, fuzzy-match against P2 attendee list company column. For each match, pull all contacts at that company whose title fits ICP persona patterns (revenue_leader, ops_builder, technical_designer). These contacts become batch 1. Non-matches are flagged for operator review (company may appear under different name, subsidiary, or may not have attendees at FC2026).

## Open Questions (for operator, not for implementor to decide)

1. What does Tim actually edit in the 29% he modifies? (Validates whether CTA/bridge changes target the right component)
2. Does Inorsa want research-derived MEDDPICC pain signals at Stage 0? (Wave 3 gating question, parked)
3. Alternative data sources for research_depth 5.8? (State broadband databases, USAC filings, FCC 477, job boards)
4. Where is the Focus 100 list? What format? (Needed to match against P2 attendee list)
5. **Microsite ICP-segment audit.** Microsites were built for cold prospects (confirmed by operator 2026-06-05 — all 3 are cold, not P1-specific). No booth-context concern. Remaining audit question: do the assessment questions and results framing speak to the right JTBD per ICP segment? A&E firms have validation/cross-checking pain; fiber operators have GIS-to-CAD pain. If all 3 microsites assume fiber operator JTBD, A&E prospects hitting the microsite via email P.S. link will see misaligned content. Check before Wave 2 ships.

## Hard Rules (carry forward — see memory files for details)

- DNC list: 2 companies on it per wiki-459-mirror.md section 10. Pipeline must not name them in outreach.
- Tom Marciano = INERT. NEVER a sender. NEVER a From name.
- AE senders: Mike Rutski (East), Nathan Dunn (Central), Lucas Spencer (West/spread). Default unassigned = Lucas.
- Locked pitch variants (A/B/C) — do NOT change.
- Salutation hard-lock: `[FirstName],` (comma only, NO greeting word).
- Value prop scope: drawings-only. NO Validation in automated email. NO structural analysis. Fiber-only.
- Show: Fiber Connect (TWO words, space between).
- Drawing QC: NOT on roadmap. NEVER mention to customers.
- MicroStation: NEVER sell to MicroStation customers.
- Tower/Cellular: parse carefully. When in doubt, do not use or ask Operator.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v2 | 2026-06-05 23:39 | Claude | Red-team fixes: validation-CTA clarification, thin-substrate discovery section, Focus 100 matching logic, extractKeyFacts insertion point fix, microsite audit updated per operator confirmation (cold, not P1) |
| v1 | 2026-06-05 22:45 | Claude | Initial draft with all operator corrections from planning session |
