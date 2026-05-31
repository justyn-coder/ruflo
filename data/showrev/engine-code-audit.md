---
title: Engine Code Audit -- src/showrev/m1-email-find/
status: ACTIVE
last_updated: 2026-05-31 01:45 EST
version: v1
purpose: Honest assessment of what works vs what is scaffolding in the engine code. Identifies gaps between the code and the methodology that actually produced approved emails.
---

# Engine Code Audit

## Summary

12 TypeScript files, ~126KB total. The architecture is sound. The gap is that the v3 email format (insight-led, prospect-reality opener) was developed in CONVERSATION after this code was written. The code implements v1/v2 approaches. The premium pipeline is closest to v3 but needs prompt updates.

---

## File-by-File Assessment

### importer.ts (7.7KB) -- WORKING

**What it does:** Parses CSV, deduplicates, cleans, assigns tiers.
**Status:** Functional. Correctly handles the booth-scan CSV format.
**Gap:** Tier assignment logic (A/B/C/D) is based on AE grades from the CSV. Tiers have since been deprecated (they were batch labels, not strategic priority). The importer should assign ICP status (pass/hold/reject) instead of tiers.
**Fix needed:** Replace tier logic with ICP gating based on segment (A&E/operator/contractor = possible pass; equipment/software/staffing = auto-reject).

### researcher.ts (11KB) -- WORKING, V1 ONLY

**What it does:** Single-agent hypothesis-driven research via `claude -p`.
**Status:** Functional. Produces JSON dossiers with company profile, contact profile, JTBD inference.
**Gap:** This is the v1 single-agent researcher. The approved methodology uses 3-persona STORM research (personas.ts) with cross-examination. The v1 researcher produces adequate results but lacks the depth and cross-validation of the STORM approach.
**Fix needed:** Wire personas.ts into the research stage so premium-pipeline.ts is the default, not pipeline.ts.

### personas.ts (11KB) -- BUILT, CORRECT

**What it does:** Defines 3 STORM personas (Industry Analyst, AE Proxy, Technical Evaluator) with search strategies, focus areas, and cross-examination questions.
**Status:** Well-built. The search strategies are specific and actionable. The cross-examination framework is the key differentiator from v1.
**Gap:** Not wired into pipeline.ts (only premium-pipeline.ts uses it). Should be the default research path.
**Fix needed:** None to the file itself. Just needs to be the default research method.

### influence.ts (14.6KB) -- BUILT, CORRECT, CORE

**What it does:** Defines 8 influence patterns, signal-to-pattern mapping, pattern selector prompt, and composer prompt with full anti-AI-tell checklist.
**Status:** This is the most important file. The influence patterns, anti-tell checklist, and composer prompts are well-designed and match the approved methodology.
**Gap:** The composer prompt signs off as "Tim" (line 189). AE senders have since been changed to Mike/Nathan/Lucas. Tim is no longer a sender.
**Fix needed:** 
1. Replace hardcoded "Tim" with dynamic AE name
2. Update "Fiber Connect 2026 (ended May 19)" to be configurable
3. The anti-AI-tell checklist is correct and should be enforced

### composer.ts (7.4KB) -- WORKING, V1 FORMAT

**What it does:** V1 email composition via `claude -p`. 3-touch sequence.
**Status:** Functional but uses the v1 format: "Great connecting at Fiber Connect" opener, product-forward framing.
**Gap:** The v3 approved format opens with the prospect's operational reality, not a booth callback. Inorsa appears once, described by outcome. Each email uses a different structural approach. This composer produces template-feeling emails.
**Fix needed:** Replace with influence.ts composer prompts (buildComposerPrompt). The influence.ts version IS the v3 approach.

### judge.ts (7.3KB) -- WORKING, CORRECT

**What it does:** 4-dimension quality judge. Scores research depth, VP connection, tone, conciseness. All >= 7 to pass.
**Status:** Correct. The rubric matches what the operator and Tim actually checked.
**Gap:** Missing the additional operator checks (em-dash scan, pitch verbatim compliance, P.S. slug verification, AE signature match). These are mechanical checks that should be automated, not left to the judge LLM.
**Fix needed:** Add post-judge mechanical checks:
- `body.includes('—')` -> fail (em-dash)
- `wordCount > 80` -> fail
- P.S. contains correct slug
- Signature matches assigned AE

### judges.ts (13.3KB) -- BUILT, EXTENDED

**What it does:** Extended judging system with more detailed prompts.
**Status:** Built but not clearly wired into either pipeline. Appears to be an iteration on judge.ts.
**Fix needed:** Consolidate with judge.ts or replace it. Having two judge files creates confusion.

### premium-pipeline.ts (16.5KB) -- BUILT, CLOSEST TO CORRECT

**What it does:** Full premium pipeline: CSV import -> 3-persona STORM research -> influence pattern selection -> anti-tell composition -> quality judge.
**Status:** This is the pipeline that should be used. Architecture is correct.
**Gap:** 
1. Uses `claude -p` for execution (spawns headless CLI instances). Works but is slow and hard to debug.
2. Signs off as "Tim" (needs dynamic AE)
3. VP description in prompts is slightly outdated (pre-Fiber Connect feedback)
4. Does not write to Supabase (writes to JSON files). Needs Supabase integration for Mission Control.
**Fix needed:** Update prompts to match v3 methodology, add Supabase output, make AE dynamic.

### dossier-schema.ts (9KB) -- BUILT, PREFIX MISMATCH

**What it does:** Defines 30+ HubSpot property interfaces (contact, company, sales intel, email sequence).
**Status:** Well-structured. Covers all the fields needed.
**Gap:** Uses `sr_` prefix throughout. Inorsa's actual HubSpot uses `showrev_` prefix. The schema is conceptually right but the field names don't match production.
**Fix needed:** Rename all `sr_*` fields to `showrev_*` to match existing HubSpot properties. Some fields exist already (showrev_research_summary, showrev_signal_strength), some need to be created (showrev_microsite_url, showrev_challenger_insight).

### verify-emails.ts (6.4KB) -- BUILT

**What it does:** Email address verification.
**Status:** Built. References Findymail API.
**Fix needed:** Verify API key is still valid. Confirm it runs against current prospect list.

### verify-facts.ts (8.3KB) -- BUILT

**What it does:** Fact verification for dossier claims.
**Status:** Built. Good defensive check.
**Fix needed:** None identified. Should be wired into the pipeline after research stage.

### pipeline.ts (14.2KB) -- WORKING, V1

**What it does:** V1 pipeline runner. Import -> research (single agent) -> compose -> judge.
**Status:** Functional but uses v1 single-agent research and v1 composer. Not the approved methodology.
**Fix needed:** Should be deprecated in favor of premium-pipeline.ts as the default.

---

## Architecture Assessment

**What works:**
- The modular architecture (each stage is a separate file with its own prompts)
- The influence pattern system (8 patterns, signal mapping, anti-tell checklist)
- The STORM persona research approach
- The 4-dimension quality judge
- The hypothesis-driven research method (Heuer ACH)

**What is scaffolding:**
- The v1 pipeline (pipeline.ts + composer.ts) -- superseded by premium approach
- The tier assignment system -- tiers deprecated, replaced by ICP status
- The "Tim" sender references -- Tim is no longer a sender

**Critical gaps to close for 2,300-contact scale:**
1. Supabase integration (currently writes JSON files, needs to write to sr_brain_dossiers + sr_microsites)
2. Dynamic AE assignment (not hardcoded)
3. Rate limiting for web search and LLM calls
4. Error recovery and checkpointing (premium-pipeline has basic checkpointing but needs hardening)
5. Template fatigue detection (ensure emails across a batch don't sound the same)
6. Mechanical quality checks (em-dash, word count, AE signature) as code, not LLM judgment

---

## Recommendation

**Do not rewrite from scratch.** The architecture is correct. The premium-pipeline.ts is 80% of the way there. What needs to happen:

1. Update prompts in influence.ts and premium-pipeline.ts to match v3 methodology
2. Replace hardcoded "Tim" with dynamic AE from prospect data
3. Add Supabase output adapter (write dossiers + emails to sr_brain_dossiers)
4. Add mechanical post-judge checks
5. Deprecate pipeline.ts + composer.ts (v1 approach)
6. Update dossier-schema.ts prefix from sr_ to showrev_
7. Add template fatigue detection across batch

Estimated effort: 2-3 focused sessions.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-31 01:45 | Claude | Initial code audit. 12 files assessed. Architecture sound, prompts need v3 update, Supabase integration missing. |
