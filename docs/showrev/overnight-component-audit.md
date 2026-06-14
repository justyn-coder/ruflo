---
title: Pipeline Component Audit
status: DRAFT
last_updated: 2026-06-07 01:30 EST
version: v1
---

# Pipeline Component Audit

## Executive Summary

16 modules imported by `run-pipeline.ts` audited. The pipeline is architecturally sound and functionally complete for its current mission (CSV-to-email generation with judge gating). Three critical findings, two moderate, and several minor issues.

### Critical

1. **28 structured intel fields never written to Supabase.** `phaseSupabaseWrite` (line 980-1098) does not unpack `result.structuredIntel` into the `dossierRow`. All `intel_*`, `company_*`, `meddpicc_*`, and `linkedin_*` columns in `sr_engine_output` remain NULL. The data exists in the pipeline result object, confirmed by the companion Supabase audit. This is the single highest-impact fix: Mission Control and AE surfaces show empty intel panels.

2. **`phaseSupabaseWrite` hardcodes `icp_status: 'pass'` and `persona_bucket: ''`.** Line 1020-1024 ignores the actual ICP gate result and the `detectPersona()` output. The real `icpResult` and `persona` are available on the `PipelineResult` object but are never passed to this function. Every dossier row shows "pass" regardless of actual ICP classification, and persona bucket is always blank.

3. **`lean-composer.ts` shells out to `claude -p` via `execSync`.** Line 81-92: this spawns a child process piping a temp file into the CLI. This works but is fragile, expensive (cold CLI boot per call), and blocks the Node event loop. The full composer path uses `callLLM()` from `llm-client.ts` via the Anthropic SDK. The lean composer should use the same path. Also: `execSync` timeout is 300s (5 min) per email, which could stall the pipeline on a slow model response.

### Moderate

4. **`intel-structurer.ts` receives empty `emails` and `patternSelections` arrays.** Phase 3c (line 1595-1600) calls `structureIntelReport` with `[]` for both parameters because composition hasn't happened yet. The structurer prompt uses `patternSelections[0]?.pattern` (line 78 of intel-structurer.ts) which evaluates to empty string. This doesn't break anything but means the LLM gets no pattern context during structuring. Re-ordering phases or passing patterns post-composition would improve intel quality.

5. **`setBrainCacheContent` is module-global state, not per-prospect.** `llm-client.ts` line 109-117: `brainCacheContent` is a module-level variable set once per prospect (Phase 3a). If Phase 3a fails for prospect N, prospect N+1 inherits prospect N's brain cache. The risk is low because the cache is reset each iteration, but it's a shared mutable state smell. Additionally, `callLLMWithBrainCache()` (line 119-127) is exported but never called anywhere, the cache injection happens via `callLLM(..., { cacheableSystemContent })` in the research phase.

### Minor

6. **Duplicate AE_DETAILS definitions.** `microsite-composer.ts` (line 37-56) and `run-pipeline.ts` `phaseMicrositeUpsert` (line 1220-1224) both define AE details inline. If an AE changes their booking URL or title, both must be updated.

7. **`bounce-monitor.ts` uses in-memory arrays, not persisted.** The `events[]` array and `totalSent` counter (line 29-31) reset on process exit. `seedFromSupabase()` partially restores from `sr_brain_outcomes.t1_bounced` but this table is separate from the pipeline's write path. The halt decision (`shouldHalt()`) only activates after 10+ sends in the same process invocation, which doesn't happen in the current batch-of-N pipeline usage pattern. The module is correctly wired but effectively a no-op for current batch sizes.

8. **`prompt-optimizer.ts` depends on `dspy.ts` which may not be installed.** The module is flag-gated (`--optimize-prompts`) so it never loads unless explicitly requested. But if invoked, a missing `dspy.ts` dependency would crash at import time (line 1 of prompt-optimizer.ts). No `try/catch` around the import in `main()` — actually there is one (line 2186-2190), so this is non-blocking. Low risk.

---

## Per-Component Findings

### 1. brain-agentdb.ts (55 lines)

**Purpose:** AgentDB wrapper for semantic Brain search (HNSW vector similarity).

**Effective?** Yes. Clean wrapper around AgentDB's `storeEpisode` / `retrieveRelevant`. Used in two places: brain ingest (Phase 3b) and brain context query (Phase 3a).

**Efficiency:** Good. Lazy initialization (singleton `db` instance). No redundant calls.

**Issues:**
- `storeEntity` (line 36-52) maps Brain entities to AgentDB's episode schema by overloading fields: `approach` = entity name, `outcome` = facts joined by pipe, `reflection` = sources. This works but is a semantic mismatch. If AgentDB's retrieval weighting changes, the search quality could degrade silently.
- Error swallowing: `ingestEntitiesToAgentDB` catches errors per entity but never logs them (line 117). Failed entities are silently dropped.

**Verdict:** Working correctly. Low risk.

### 2. brain-ingest.ts (335 lines)

**Purpose:** Extract entities from research output using regex patterns, maintain JSONL entity graph, generate brain digest.

**Effective?** Yes. Entity extraction covers companies, funding, relationships, tools, competitors, and BEAD references. The JSONL graph is append-and-deduplicate. Digest generation groups by type.

**Efficiency:** Good. `loadEntityGraph` reads the full JSONL on every call (line 38-52), but the file is small (hundreds of lines). Entity dedup uses key-based Map lookup.

**Issues:**
- Regex-based entity extraction is inherently noisy. The `companyPattern` (line 74) requires a capital letter followed by a verb, which misses companies mentioned in other grammatical constructions. However, this is a "better than nothing" accumulator, not a precision tool.
- `appendToGraph` (line 61-65) is defined but never called. `ingestEntities` always rewrites the full file via `saveEntityGraph`. The append function is dead code.
- `agentDBInitialized` (line 292) is module-global, same pattern as the brain cache. Harmless for sequential pipeline use.

**Verdict:** Working correctly. Regex noise is expected and acceptable for a knowledge accumulator.

### 3. cross-model-judge.ts (273 lines, flag-gated)

**Purpose:** Send T1 email to 5 external LLM models for consensus quality scoring.

**Effective?** Yes. Clean implementation of parallel judge calls with `Promise.allSettled`, majority-vote consensus, divergence detection, and quorum requirements (min 2 judges).

**Efficiency:** Good. All model calls run in parallel. Each call is a single prompt.

**Issues:**
- Line 54: `gpt-5` handler sends to model `'gpt-4o'`, not `'gpt-5'`. The variable name says gpt-5 but the actual model ID is gpt-4o. This is correct behavior (gpt-4o is the current production model) but the naming is confusing. If OpenAI ships an actual gpt-5 model ID, this won't use it without a code change.
- Only judges T1 (line 1299 in run-pipeline.ts). T2 and T3 are not cross-model judged. This is intentional (T1 is the most important touch) but not documented.
- Report files are written to `data/showrev/premium/judge-reports/` but never cleaned up. Over many runs, this directory grows unbounded.

**Verdict:** Working correctly. The gpt-4o/gpt-5 naming mismatch should be clarified.

### 4. icp-gate.ts (161 lines)

**Purpose:** Two-stage ICP qualification: fast regex classification, then LLM fallback for ambiguous cases.

**Effective?** Yes. Regex handles clear-cut cases (known non-ICP patterns, obvious A&E/operator indicators). LLM handles ambiguous companies with a bias toward passing uncertain cases (false negatives are 10x worse than false positives).

**Efficiency:** Excellent. Regex-first saves an LLM call for ~60-70% of prospects. The LLM call uses Haiku (cheap, fast, 15s timeout).

**Issues:**
- Line 59-61: The first `NON_ICP_INDICATORS` check (line 59) rejects based on company name alone, regardless of title. Line 63-65 checks title+company. But the standalone company check on line 59 means a company named "XYZ Software Engineering" would be rejected as non-ICP before the `AE_INDICATORS` on "engineering" are checked. The ordering matters: `NON_ICP_INDICATORS` fires before `AE_INDICATORS`. A company like "Finley Engineering" (a real A&E firm) contains "engineering" (AE indicator) but does NOT match any non-ICP indicators, so it passes correctly. However, a hypothetical "GIS Software Engineering" would match `software` in non-ICP and get rejected before the A&E check runs. This is an edge case, not a bug, because the LLM fallback doesn't fire for regex rejects.
- The `TOWER_AE_INDICATORS` / `FIBER_OVERRIDE_INDICATORS` logic (line 72-78) is well-designed. It correctly handles the "does both tower AND fiber" case by checking for fiber override signals.

**Verdict:** Working correctly. Well-calibrated for the fiber/A&E domain.

### 5. influence.ts (494 lines)

**Purpose:** Influence pattern definitions (8 patterns), persona detection (3 buckets), pattern selector prompt builder, and full composer prompt builder with ICP-specific CTA options and competitive bridge logic.

**Effective?** Yes. This is the core intelligence of the email composition system. The 8 influence patterns are well-defined with clear when-to-use guidance. The 3 persona buckets (revenue_leader, ops_builder, technical_designer) each have distinct pitch variants, framing instructions, and value lenses. The competitive bridge (line 337-346) correctly maps known competitors to gap statements.

**Efficiency:** Good. No LLM calls in this module. All pattern/persona logic is deterministic.

**Issues:**
- None found. This module is the strongest component in the pipeline. The prompt engineering is sophisticated: tiered opener quality guidance, anti-hallucination rules, anti-AI-tell rules, ICP-specific CTA questions, competitive bridge with "acknowledge, not trash" framing, and word count constraints.
- The `buildComposerPrompt` function (line 311-494) is 183 lines long but necessarily so, given the complexity of the prompt. Each section serves a distinct purpose.

**Verdict:** Working well. No changes recommended.

### 6. intel-structurer.ts (200 lines)

**Purpose:** Extract structured HubSpot dossier fields from raw 3-persona research output via LLM.

**Effective?** Partially. The structurer correctly prompts for 29+ fields across contact, company, salesIntel, and meta sections. JSON parsing includes repair logic for control characters and trailing commas. Field validation enforces enum values for decision_authority, signal_strength, persona_classification, automation_level, and product_fit.

**Efficiency:** One LLM call per prospect. 180s timeout is generous but appropriate for the large output schema.

**Issues:**
- **Critical (upstream wiring):** Called with empty `emails` and `patternSelections` arrays (Phase 3c in run-pipeline.ts line 1598-1599). The structurer prompt references `patternSelections[0]?.pattern` (line 78) which evaluates to `''`. This means the `showrev_influence_pattern` field in the output is always empty. The fix is to either move structuring after pattern selection (Phase 5) or accept that this field will be populated separately.
- The `crossExamInsights` parameter is passed as `''` (line 1597). The cross-exam questions are generated by `personas.ts` but never executed as a separate LLM call in the current pipeline. This is a design gap: the cross-exam questions exist but are only used as static prompt decoration in the first research pass.
- Type imports (`Prospect`, `EmailOutput`) reference `importer.js` and `premium-pipeline.js` which are dead/standalone files. The actual `prospect` object passed in is a manually constructed object literal in `run-pipeline.ts`. The type imports work because TypeScript only needs the type shape, not runtime values.

**Verdict:** Effective at what it does, but the output is wasted because `phaseSupabaseWrite` never maps it to database columns. This is the highest-ROI fix across the entire pipeline.

### 7. judge.ts (342 lines)

**Purpose:** Two-layer email quality gate: mechanical checks (no LLM) + 5-dimension LLM scoring.

**Effective?** Yes. Mechanical checks cover 22 AI-tell patterns, 10 Tim-kill phrases, product/industry guards (tower, MicroStation, Drawing QC, offshore), word count, em-dash, subject length, salutation format, duplicate signature, and competitor-negative framing. The LLM scoring covers research_depth, vp_connection, tone, conciseness, and jtbd_alignment with ICP-specific bonus guidance.

**Efficiency:** Smart cost control: mechanical checks run first (free). If they fail, the LLM scoring is skipped entirely (line 757-768 in run-pipeline.ts). This saves ~$0.01-0.03 per failing prospect.

**Issues:**
- Word count ceiling in mechanical checks (line 33-34) uses 80 for T3, 100 for T1/T2. But the composer prompt targets 60-75 words (T1/T2) and 45-55 words (T3). The mechanical check ceiling is more lenient than the composer's ceiling (88 and 66 respectively, per the +10% flex rule in influence.ts line 480). This means a draft that exceeds the composer's ceiling but passes the mechanical check could still be sent. The mismatch is intentional: the mechanical check is a hard safety net, not a stylistic enforcer. But the ceilings should ideally match. Emails passing at 99 words are bloated relative to the 75-word target.
- The `judgeBatch` function (line 279-341) is exported but never called by `run-pipeline.ts`. It's used by the standalone `premium-pipeline.ts` (dead file). Not a bug, just dead code in this function.

**Verdict:** Working correctly. The word count ceiling mismatch is a calibration issue, not a bug.

### 8. lean-composer.ts (312 lines)

**Purpose:** Alternative email composition path using minimal prompts and post-processing. Shells out to `claude -p` CLI.

**Effective?** Yes when it works. The post-processing (line 94-202) is thorough: strips markdown formatting, removes model commentary, extracts subject/PS/body, cleans em-dashes, joins salutation, fixes capitalization, ensures microsite links, deduplicates PS lines.

**Efficiency:** Poor. Each email composition spawns a child process (`execSync` to `claude -p`), which cold-boots the CLI, loads context, and runs. This is ~10-30x slower than a direct SDK call via `callLLM()`. The `maxBuffer` is set to 10MB (line 87) which is excessive for email output.

**Issues:**
- **Critical architecture smell:** The `executePrompt` function (line 81-92) writes a temp file, cats it into `claude -p`, and parses stdout. This bypasses the Anthropic SDK entirely. If `claude` CLI is not installed or not in PATH, it fails with a cryptic `execSync` error. The lean composer should use `callLLM()` from `llm-client.ts` like everything else.
- The lean prompt (line 41-78) lacks the anti-hallucination rules, ICP-specific CTA options, competitive bridge logic, persona framing, and tiered opener quality guidance that the full composer prompt in `influence.ts` has. Lean-composed emails are structurally simpler and may score lower on research_depth and jtbd_alignment.
- The `runComparison` function (line 252-298) queries Supabase using the anon key (line 253-254), which only has SELECT access via RLS. This works for reads but would fail for writes.
- Auto-selection logic (line 610-614 in run-pipeline.ts): when `composerMode === 'auto'`, lean is chosen if "weak signal" / "low confidence" phrases outnumber "strong signal" / "high confidence" in research. This heuristic is crude but directionally correct.

**Verdict:** Functionally correct but architecturally inconsistent. The `execSync` approach should be replaced with `callLLM()`.

### 9. llm-client.ts (128 lines)

**Purpose:** Thin wrapper around the Anthropic SDK with retry logic, exponential backoff, and prompt caching support.

**Effective?** Yes. Clean implementation with 3 retries, rate-limit-aware backoff (3x multiplier for 429s vs 2x for other errors), timeout detection, and system prompt block support for caching.

**Efficiency:** Good. Singleton client instance. Prompt caching via `cache_control: { type: 'ephemeral' }` on system blocks is correctly implemented.

**Issues:**
- The `timeoutMs` parameter (line 43) is accepted but never used. The Anthropic SDK handles its own timeouts. The parameter exists in the interface but has no effect on the API call. If a call needs a shorter timeout, it won't get one.
- `callLLMWithBrainCache` (line 119-127) is exported but never imported anywhere. Dead function.
- `hardConstraints` (line 63-67) system block is always non-cached. This is correct, as hard constraints should not be shared across different prompts. But the option is never used by any caller in the pipeline.

**Verdict:** Working correctly. Minimal, reliable, well-structured.

### 10. logo-resolver.ts (73 lines)

**Purpose:** Resolve company logo URLs from 5 free logo APIs in parallel.

**Effective?** Yes. Probes logo.dev, Clearbit, CompanyEnrich, Hunter, and UpLead in parallel with a 4s timeout. Validates response is actually an image (content-type check) and not a placeholder pixel (<200 bytes).

**Efficiency:** Excellent. All 5 probes run in parallel via `Promise.allSettled`. First valid result wins. Total wall time = slowest probe (capped at 4s).

**Issues:**
- `pk_anonymous` token for logo.dev (line 4) is a public/free tier token. Rate limits unknown. If logo.dev deprecates anonymous access, this source silently fails (caught by the settled promise).
- No result caching. If the same company domain is resolved twice (e.g., same company in different pipeline runs), all 5 probes run again. For single-run batch processing, this is fine because `phaseMicrositeUpsert` is called once per prospect.

**Verdict:** Working correctly. Clean, efficient design.

### 11. microsite-composer.ts (174 lines)

**Purpose:** Compose microsite content (headline, insight text, case study selection) for the prospect briefing page.

**Effective?** Yes. Deterministic composition with no LLM calls. Case study selection uses segment/persona matching with fallback to segment-only, then any.

**Efficiency:** Excellent. Pure functions, no I/O except optional case study library file read.

**Issues:**
- Default case studies (line 58-64) are all `status: 'generated'`, none are `status: 'approved'`. The `productionMode` parameter (line 81) filters for approved-only, but no case studies would pass. In practice, `productionMode` is never set to `true` by the pipeline (line 968 in run-pipeline.ts always passes `false` by omitting the parameter, which defaults to `false`). So this is not a live bug, but the production gate is non-functional.
- `composeInsightText` fallback (line 126) says "We researched [Company]'s current operations and found something worth discussing." This is generic and vague. It fires when `challengerInsight` is under 50 chars and no company-name-matching sentences exist in `researchSummary`. Low frequency, but low quality when it fires.
- The `format` field (line 170) is always `'field-brief'`. The type definition supports 4 formats but only one is implemented. The other 3 ('interactive-demo', 'gamified-challenge', 'work-product-preview') are dead enum values.

**Verdict:** Working correctly for current needs. Case study production gate is non-functional.

### 12. personas.ts (186 lines)

**Purpose:** Define 3 research personas (Industry Analyst, AE Proxy, Technical Evaluator) with search strategies, generate cross-exam questions, and build multi-persona research prompts.

**Effective?** Yes. Each persona has a distinct focus area, 5-7 research questions, and a prioritized search strategy. The search strategies are well-ordered (company-specific searches first, then broader industry searches). The cross-exam questions (line 84-121) create adversarial tension between personas.

**Efficiency:** Good. No LLM calls in this module. It only builds prompts.

**Issues:**
- Cross-exam questions are generated (line 84-121) but never executed as a separate LLM call. The `buildMultiPersonaPrompt` function accepts `otherFindings` (line 127-128) for cross-examination, but the pipeline (Phase 3, line 412-447 in run-pipeline.ts) runs all 3 personas in parallel without feeding results back for cross-examination. The cross-exam section only fires if `otherFindings` is provided, which it never is. This is a missed opportunity for research depth, not a bug.
- The `searchStrategy` text in each persona prompt instructs the LLM to "search" various websites. But the LLM (via `callLLM`) has no web search tools. The search strategy text serves as implicit guidance for the LLM to recall training data about these sources, not actual web search. This is a known limitation documented in Phase 4b comments (line 1631-1635): "asks LLM to search the web but callLLM has no web access."

**Verdict:** Working correctly. Cross-exam is structurally present but operationally unused.

### 13. prompt-optimizer.ts (191 lines, flag-gated)

**Purpose:** DSPy.ts integration for few-shot prompt optimization using prior pipeline output as training examples.

**Effective?** Untested in production. The module loads training examples from `data/showrev/premium/output/*.json`, scores them on word count, anti-AI-tell compliance, format, and salutation, then compiles an optimized ChainOfThought module via BootstrapFewShot.

**Efficiency:** N/A (not used in standard pipeline runs).

**Issues:**
- The `dspy.ts` dependency is unconditionally imported at the top of the file (line 1). If the package is not installed, any import of this module crashes. However, the module is only imported behind the `--optimize-prompts` flag with a try/catch (line 2186-2190 in run-pipeline.ts), so this is non-blocking.
- The `emailMetric` function (line 63-81) is simplistic: it only checks word count, two AI tells, em-dashes, subject length, and salutation format. It doesn't evaluate research depth, tone, or VP connection. The metric doesn't correlate well with the 5-dimension judge scores that actually gate emails.
- The compiled optimizer is saved to JSON (line 148-155) but never loaded or used by the main composition pipeline. The feature is incomplete.

**Verdict:** Incomplete feature. Present as infrastructure but not integrated into the composition path.

### 14. email-finder/* (orchestrator.ts: 1106 lines, apollo-fallback.ts: 122 lines, million-verifier.ts: 160 lines)

**Purpose:** Multi-strategy email discovery pipeline: Apollo-primary -> domain resolution -> pattern detection -> candidate generation -> SMTP/Autodiscover verification -> MillionVerifier gate.

**Effective?** Yes. The orchestrator is the most sophisticated module in the codebase. It implements:
- Apollo-primary path (Step 0) with MV verification gate
- Domain resolution with domain hints, suffix stripping, and fuzzy matching (Step 1)
- MX-based alternative domain discovery (Step 1c)
- Web-based pattern detection + inference from found emails (Step 2)
- Candidate generation from detected patterns (Step 3)
- Apollo enrichment as Step 4 enhancement
- Mail provider detection (Step 5)
- SMTP verification with Autodiscover elimination strategy for M365/Google (Step 6)
- Apollo People Match as last-resort fallback (Step 7)
- Company-level caching to avoid redundant domain/pattern lookups

**Efficiency:** Good. Company-level caching (line 123-128) avoids redundant DNS/MX/pattern lookups for multiple contacts at the same company. Pipeline timeout (60s default) prevents runaway SMTP connections. Per-call timeout (15s, capped by remaining budget) prevents individual hangs.

**Issues:**
- `apollo-fallback.ts` line 54: the `body` object is typed as `Record<string, string>` but Apollo's API expects `string` values. This works because all values are strings, but TypeScript doesn't enforce that `firstName` and `lastName` are non-empty. An empty first/last name would produce a valid but useless API call.
- `million-verifier.ts`: the batch verifier (line 114-131) uses sequential calls with a 500ms delay. For large batches, this is slow. However, the pipeline uses single-email verification, so `verifyBatchMV` is never called by `run-pipeline.ts`.
- The `buildResult` helper (line 952-961) always sets `timestamp` to `new Date().toISOString()`. This timestamp is never written to Supabase or used downstream.

**Verdict:** Working correctly. Robust multi-strategy approach with appropriate fallbacks and timeouts.

### 15. deliverability/confidence-gate.ts (74 lines)

**Purpose:** Score email confidence on a 0-100 scale based on discovery method, MillionVerifier result, and domain mismatch, then gate by color (green/yellow/red).

**Effective?** Yes. Simple scoring model with additive adjustments. Base scores range from 95 (provided-verified) to 10 (unknown). MV good adds +20, MV bad subtracts -60. Domain mismatch subtracts -15.

**Efficiency:** Excellent. Pure function, no I/O.

**Issues:**
- The `ConfidenceLevel` type (line 1) includes `'clearbit'` and `'duckduckgo'` as discovery methods, but the pipeline never produces these values. The email finder's confidence values are `'green'`, `'yellow'`, `'amber'`, `'red'`, `'not-found'`, `'provided'`, `'provided-verified'`, and `'error'`. The confidence gate's `ConfidenceLevel` type doesn't match the email finder's output type. Line 1418-1425 in run-pipeline.ts casts `emailResult.confidence as any` to work around this. If the email finder returns `'green'` (which maps to confidence score 10 via the `unknown` default), a verified-green email would score only 10+20=30 (yellow gate). This is a potential scoring bug for Apollo-verified emails where the finder returns a color instead of a method name.

**Verdict:** Working but has a type mismatch with the email finder that could produce incorrect confidence scores. Needs investigation to verify actual runtime values.

### 16. deliverability/bounce-monitor.ts (119 lines)

**Purpose:** Track send/bounce events in-memory, compute batch stats, and provide a halt decision when bounce rates exceed thresholds (5% hard bounce, 10% total bounce).

**Effective?** Structurally yes, operationally no. The module is correctly designed with proper thresholds and a minimum sample size (10). But:
- Events are in-memory only (reset on process exit).
- `seedFromSupabase` (line 99-118) reads from `sr_brain_outcomes.t1_bounced`, which is populated by a separate process (not the pipeline).
- `recordSend()` and `recordBounce()` are imported by run-pipeline.ts but the pipeline doesn't call them for each email it sends (it doesn't send emails at all, it writes them to Supabase for HubSpot to send later).
- The halt check `shouldHalt()` runs at the top of the main loop (line 2195-2198 in run-pipeline.ts) but only has data if `seedFromSupabase` found historical bounces.

**Efficiency:** Good. O(n) operations on small arrays.

**Issues:**
- `recordOutcome` (line 40-45) increments `totalSent` AND records a bounce if `bounced=true`. But `recordSend` (line 34-35) ALSO increments `totalSent`. If both are called for the same email, `totalSent` is double-counted. The module expects callers to use EITHER `recordOutcome` (one call for both send+result) OR `recordSend` + `recordBounce` (two calls). This isn't enforced.

**Verdict:** Correctly wired but effectively dormant. The pipeline generates emails but doesn't send them, so bounce monitoring has no runtime data source.

---

## Supabase Write Functions (run-pipeline.ts)

### phaseSupabaseWrite (line 980-1098)

Writes to `sr_engine_output`. The `on_conflict=prospect_id,run_id` parameter is correctly set (line 1076). Uses service role key with merge-duplicates preference.

**Bug: 28 unmapped fields.** The `dossierRow` object (line 1011-1051) maps 39 fields but skips all structured intel fields. The `result.structuredIntel.dossier` object contains contact, company, salesIntel, and meta sections with 25+ populated fields. None are unpacked into `dossierRow`. This is confirmed by the companion Supabase audit.

**Bug: Hardcoded ICP fields.** `icp_status: 'pass'` (line 1020) and `icp_reason: ''` (line 1021) are hardcoded instead of using the actual ICP gate result. The function signature doesn't accept ICP parameters. `persona_bucket: ''` (line 1024) is hardcoded instead of using `detectPersona(row.title)`.

### phaseProspectUpsert (line 1129-1194)

Writes to `sr_prospects`. The `on_conflict=id` parameter is correctly set (line 1173). The companion audit noted this was missing, but the current code has it (likely fixed in uncommitted changes).

**Missing fields:** `email_verified`, `email_verification_status`, `email_provider`, `persona_bucket` are not written despite being available from the pipeline result.

### phaseMicrositeUpsert (line 1200-1273)

Writes to `sr_microsites`. The `on_conflict=slug` parameter is correctly set (line 1252).

**Minor:** Logo resolution (line 1228-1230) constructs a fallback domain as `row.company + '.com'` when `companyUrl` is missing. This is a guess that won't resolve for many companies (e.g., "Altamaha EMC" -> "altamaha emc.com"). The logo resolver handles this gracefully (returns null), so the microsite just won't have a logo.

---

## Recommendations (ranked by impact)

### Must fix (blocks AE effectiveness)

1. **Map structuredIntel to sr_engine_output.** Unpack `result.structuredIntel.dossier.{contact,company,salesIntel,meta}` into the `dossierRow` in `phaseSupabaseWrite`. This fills 25+ empty columns that Mission Control and AE review surfaces depend on. Estimated effort: 30-40 lines of field mapping.

2. **Pass real ICP result and persona to phaseSupabaseWrite.** Add `icpResult` and `persona` parameters to the function signature. Map `icp_status` from `icpResult.verdict`, `icp_reason` from `icpResult.reason`, and `persona_bucket` from `detectPersona(row.title)`.

### Should fix (improves reliability)

3. **Fix confidence gate type mismatch.** The email finder returns color-coded confidence (`'green'`, `'yellow'`, etc.) but the confidence gate expects method-coded confidence (`'provided-verified'`, `'apollo-verified'`, etc.). Either normalize the email finder output before passing to the gate, or add the color values to the gate's scoring table.

4. **Replace lean-composer execSync with callLLM.** The `executePrompt` function should call `callLLM` from `llm-client.ts` instead of shelling out to `claude -p`. This removes the CLI dependency, uses the shared retry/backoff logic, and doesn't block the event loop.

5. **Write email verification data to sr_prospects.** Add `email_verified`, `email_verification_status`, `email_provider`, and `persona_bucket` to `phaseProspectUpsert`.

### Nice to have (improves quality)

6. **Move intel structuring after pattern selection.** Currently Phase 3c runs before Phase 5 (pattern selection), so the structurer gets empty pattern arrays. Re-ordering would give the structurer the actual influence pattern context.

7. **Execute cross-exam as a second research pass.** The cross-exam questions in `personas.ts` are generated but never used for actual adversarial evaluation. A second parallel LLM call feeding each persona the other two personas' findings would improve research depth.

8. **Consolidate AE_DETAILS into a single source.** Extract to a shared module to avoid the duplicate definitions in `microsite-composer.ts` and `phaseMicrositeUpsert`.

9. **Align word count ceilings.** The mechanical check allows 100 words (T1/T2) and 80 words (T3), but the composer targets 60-75 (T1/T2) and 45-55 (T3) with +10% flex ceilings of 88 and 66. The mechanical check should use 88/66 to match the composer's declared constraints.

---

## Dead/Standalone Files (not imported by run-pipeline.ts)

These files exist in `src/showrev/m1-email-find/` but are NOT imported by the active pipeline. They may have been part of earlier pipeline versions, standalone tools, or experimental features.

| File | Purpose (inferred) | Notes |
|------|-------------------|-------|
| `backfill-intel.ts` | Backfill structured intel for existing prospects | Standalone CLI tool |
| `composer.ts` | Original email composer | Superseded by `influence.ts` buildComposerPrompt |
| `dossier-schema.ts` | Dossier type definitions | Types referenced by dead modules |
| `hubspot-loader.ts` | Load prospects from HubSpot | Superseded by CSV input |
| `importer.ts` | CSV import with type definitions | Types still used via import in `intel-structurer.ts` and `microsite-composer.ts` |
| `judges.ts` | 3-judge adversarial panel (Tim Proxy / Recipient / Skeptic) | Superseded by `judge.ts` single-judge + mechanical checks |
| `p2-processor.ts` | P2 cold prospect processor | Standalone variant |
| `pipeline.ts` | Original pipeline orchestrator | Superseded by `run-pipeline.ts` |
| `premium-pipeline.ts` | Premium pipeline orchestrator | Superseded by `run-pipeline.ts` |
| `prioritizer.ts` | Prospect prioritization | Not used in current flow |
| `researcher.ts` | Research module | Types used by `judge.ts` (`Dossier`, `ComposedEmail`, `EmailTouch`) |
| `run-quality-check.ts` | Standalone quality checker | CLI tool, not part of pipeline |
| `run-verification-sweep.ts` | Standalone email verification sweep | CLI tool |
| `semantic-verifier.ts` | Semantic claim verification | **DISABLED** in pipeline (Phase 4b, line 1631-1635). Root cause: LLM has no web access, so all claims return UNVERIFIED. |
| `substrate-harvester.ts` | Harvest substrate content | Standalone tool |
| `substrate-indexer.ts` | Index substrate for search | Standalone tool |
| `substrate-loader.ts` | Load substrate data | Standalone tool |
| `supabase-adapter.ts` | Supabase CRUD operations | Not used by run-pipeline.ts (direct REST calls used instead) |
| `test-quality-checker.ts` | Test harness for quality checks | Test file |
| `test-thesis.ts` | Test harness for thesis generation | Test file |
| `test-wave2.ts` | Test harness for wave 2 processing | Test file |
| `validate-only.ts` | Validate-only pipeline mode | Standalone CLI tool |
| `verify-emails.ts` | Standalone email verification | CLI tool |
| `verify-facts.ts` | Fact verification | **DISABLED** in pipeline (Phase 6b, line 1773-1774). Redundant with semantic verifier. |
| `verify-wiring.ts` | Verify module wiring | Diagnostic tool |
| `watcher.ts` | File watcher for auto-rebuild | Development tool |

**Note:** `importer.ts` and `researcher.ts` are not directly imported by `run-pipeline.ts` but their TYPE EXPORTS are used by `intel-structurer.ts` (`Prospect`, `PatternSelection`, `EmailOutput`) and `judge.ts` (`Dossier`, `ComposedEmail`, `EmailTouch`). These type dependencies compile fine because TypeScript erases them at runtime.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|------------|--------|--------|
| v1 | 2026-06-07 01:30 | Claude | Initial audit, 16 imported modules + 3 Supabase write functions + 24 dead files |
