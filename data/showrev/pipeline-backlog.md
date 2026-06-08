---
title: ShowRev Pipeline Backlog — Post-V1 Improvements
status: ACTIVE
last_updated: 2026-06-08 00:44 EDT
version: v2
purpose: Items identified during pipeline audit that are deferred until V1 achieves minimum OKRs. Not blocking current pipeline operation.
---

# Pipeline Backlog

## Priority: After V1 OKRs Met

### BL-001: Substrate dead code in standard pipeline
**Phase:** 4 (Substrate Search)
**Finding:** `substrateContext` is computed (~1s latency per prospect) but never passed to `phaseComposition()`. The 8 semantic matches go nowhere. Premium pipeline (`premium-pipeline.ts`) correctly injects substrate via `setBrainCacheContent()`, but the CLI pipeline (`run-pipeline.ts`) drops it.
**Fix:** Either wire `substrateContext` into the composer prompt (add parameter to `phaseComposition`) or remove Phase 4 from standard pipeline to save latency.
**Impact:** Low — emails are already good without it. Medium opportunity cost from unused industry context.

### BL-002: Composer has no attribution/tracing
**Phase:** 6 (Composition)
**Finding:** Composer is a single LLM call with no tools, no retrieval, no chain-of-thought capture. Cannot trace which research facts influenced which email sentences. No source citations in output schema.
**Fix:** Add `sources_used: string[]` to composer output JSON schema. Require LLM to cite which research findings it drew on. Store alongside email in Supabase.
**Impact:** Enables quality debugging and operator confidence in email content.

### BL-003: Brain is a memory store, not an intelligence engine
**Phase:** 3a (Brain Context)
**Finding:** Brain stores entities per-prospect and retrieves by company-name match only. No cross-company pattern recognition, no regional inference, no industry-level pattern accumulation, no confidence tagging on inferred vs directly-sourced data.
**Vision gap:** Operator expected Brain to: (a) identify company strategies/objectives from 1st-party data; (b) pattern-match across similar companies to infer JTBD for under-researched prospects; (c) build regional/national patterns over time; (d) tag inferred data so downstream never states it as fact.
**Fix:** Major architecture work — aggregation layer, pattern extraction, confidence tagging, inference pipeline.
**Impact:** High opportunity — would meaningfully improve pitch quality for under-researched prospects.

### BL-004: Substrate has no entity tagging
**Phase:** 4 (Substrate Search)
**Finding:** 4,005 files (3,345 Dawson blog, 605 Community Broadband Bits, 24 Fiber for Breakfast, Cartesian report, NTIA BEAD) loaded as raw text chunks into Supabase. No company-name extraction, no JTBD tagging, no speaker identification. If a CEO discussed their company on a podcast, nothing tags that as 1st-party data about that company.
**Fix:** Entity extraction pass on substrate content — tag chunks with mentioned companies, speakers, topics, JTBDs. Enable targeted retrieval ("what do we know about Company X from 1st-party sources?").
**Impact:** High — transforms substrate from generic industry color into targeted company intelligence.

### BL-005: Brain and Substrate are disconnected
**Phase:** 3a + 4
**Finding:** Two parallel systems that don't communicate. Brain stores pipeline research findings. Substrate stores ingested industry content. Neither feeds the other. Research agents search the web without knowing what's already in substrate.
**Fix:** Unified retrieval — Brain queries substrate before/during research to avoid re-discovering known information. Substrate entities feed into Brain graph. Single retrieval interface for both.
**Impact:** Efficiency (less redundant research) + quality (1st-party data prioritized over web search).

### BL-006: Signal Strength has no defined rubric
**Phase:** 3c (Intel Structurer)
**Finding:** `showrev_signal_strength` (Strong/Good/Possible/Weak/No fit) is set by LLM judgment with only "Strong | Good | Possible | Weak | No fit" as instruction. No criteria for each level.
**Fix:** Define explicit rubric (e.g., "Strong = confirmed drawing bottleneck + active construction timeline + budget authority"). Add to structurer prompt.
**Impact:** Low — the fit_rationale prose is doing the real work. Label is secondary.

### BL-007: Research Confidence has no rubric
**Phase:** 3c (Intel Structurer)
**Finding:** `showrev_research_confidence` (high/medium/low) is LLM vibes-based. No threshold criteria (e.g., "high = 3+ authoritative sources confirmed key claims"). Portal shows "Needs Review" badge but operator can't act on it.
**Fix:** Define source-count thresholds or verifiability criteria. Consider making it a computed field rather than LLM judgment.
**Impact:** Low for email quality. Medium for operator trust in portal.

### BL-008: Semantic judge for banned phrases — PARTIALLY FIXED 2026-06-08
**Phase:** 7 (Judge Gate)
**Finding:** "Worth a quick call?" slipped past the judge because the banned list uses exact string matching. Semantic variants of banned phrases aren't caught until manually added.
**Fix applied (option A):** Regex expanded to catch full "worth a {quick call/conversation/chat/look/exploring/discussing/N minutes}" family + "open to a {call/chat/conversation}" family. Also added 2 structural AI-tell warnings (participial clause density + sentence-length variance from PNAS 2025 / VERMILLION Framework research).
**Remaining (option B):** ONNX embeddings cosine similarity against banned-phrase cluster. Deferred — regex covers known variants.
**Impact:** Medium — prevents banned-phrase variants from reaching operator review.

### BL-009: Parent/child organization mapping
**Phase:** 3 (Research)
**Finding:** Brain has `relationship` entity type for JV/partnerships but no explicit parent/subsidiary hierarchy. "GFiber is a division of Google" would be stored as a relationship, not a structured parent_org field.
**Fix:** Add `parent_org` / `subsidiary_of` fields to company entities. Detect during research and structure explicitly.
**Impact:** Low-medium — useful for multi-threading strategy and account mapping.

### BL-010: Persona classification buckets — missing Nick value props
**Phase:** 3c (Intel Structurer)
**Finding:** 8 persona buckets created 2026-05-31, never reviewed against Nick McManus value prop framing (2026-06-03). Nick's "Opportunity" (workforce redeployment) and "Mistake proofing" (missing-input detection) have no dedicated buckets. No BEAD-deadline-specific bucket.
**Assessment:** Not critical — buckets are CRM labels, not composition drivers. Composer already adapts based on research content regardless of bucket label.
**Fix:** Add buckets if/when CRM analytics require finer segmentation.
**Impact:** Low for email quality. Medium for CRM reporting.

### BL-011: Extra pitch sub-variants within each persona
**Phase:** 6 (Composition)
**Finding:** Currently 3 variants (A/B/C) mapped to 3 personas. User deferred additional sub-variants within each persona for spam differentiation and A/B testing.
**Status:** Explicitly deferred by operator — "not right now, let's work on hardening."
**Impact:** Medium — improves spam-filter avoidance and testing substrate.

### BL-012: Research + Substrate coordination inefficiency
**Phase:** 3 + 4
**Finding:** Research agents do live web searches without knowing what's in substrate. Substrate provides results without knowing what research found. No dedup, no gap-fill coordination.
**Efficient architecture:** Brain checks existing knowledge → Substrate provides known context → Research fills only the GAPS → all three merge with provenance tags.
**Current:** Three parallel streams dumped into composer prompt independently.
**Impact:** Medium — reduces redundant API calls, improves research targeting.

### BL-013: Apollo company-name normalization
**Phase:** 2 (Email Discovery — apollo-fallback)
**Finding:** Apollo people-match is strict on the company string. CSV has `"United Fiber, LLC"`; Apollo has `"United Fiber"`. The match returns no result, and the pipeline falls through to SMTP probing where it times out. Surfaced 2026-06-08 on Andrew Aeschliman in run-20260608-tgas/zobi. Repeating the search by name only — without the LLC suffix — found him in 1 query.
**Fix:** Strip corporate suffixes (`, LLC`, `, Inc`, `, Ltd`, `, Corp`, `, Co.`, ` Corp`) before passing `organization_name` to Apollo people-match. Same normalization the icp-gate.ts company-name parser already does. ~5 lines in `apollo-fallback.ts`.
**Impact:** High — every prospect with a corporate-suffix company name currently bypasses Apollo and hits the slower SMTP fallback. Estimated 20-30% of P2 cold list.

### BL-014: Apollo enrichment as ICP volume-verdict booster
**Phase:** 3c (Intel Structurer) post-pass
**Finding:** When intel-structurer returns `leaning_fit` (no quotable volume signal in public research), Apollo enrichment often surfaces the missing data. Demonstrated 2026-06-08: Apollo's company description for United Fiber said "100% fiber optic network spanning over 1,700 miles." That's a definitive `fit` signal that our research didn't surface (it relied on the brand site which doesn't quote mileage).
**Fix:** Add an optional post-pass after intel-structurer: when `icp_volume_verdict === 'leaning_fit'`, fire one Apollo company-enrich call. Scan `organization.short_description` and `organization.keywords` for mile/location/customer-count signals. If found, upgrade verdict to `fit` and append the Apollo citation to evidence. ~$0.0001 per call + 1 credit; runs only on ~70-80% of cold prospects that come back leaning.
**Impact:** Medium-high — converts more verdicts from leaning to definitive, reducing operator review load on the portal.

### BL-015: Apollo peer-pattern email derivation when prospect not in Apollo
**Phase:** 2 (Email Discovery)
**Finding:** When Apollo people-match returns no result for the prospect, but Apollo HAS emails for peers at the same company, we can derive the company's email pattern from the peers and synthesize the prospect's address. Demonstrated 2026-06-08: Andrew Aeschliman returned no Apollo email. Searching `unitedfiber.com` peers returned 45 people with 9 emails. Enriching one peer revealed `efurr@ueci.coop` (parent co domain + first-initial+lastname pattern). Andrew's correct email is therefore likely `aaeschliman@ueci.coop`, not the CSV's `andrew.aeschliman@unitedfiber.com`.
**Fix:** When prospect Apollo match returns no email AND SMTP probing fails, fire `apollo_mixed_people_api_search` with `q_organization_domains_list=[provided_domain]`. Pick the top result with `has_email: true`. Enrich it (1 credit). Extract `(domain, pattern)` from the peer's email. Apply to prospect.
**Impact:** High — recovers prospects that would otherwise be red-confidence drops. Estimated 5-10% of P2 cold list have parent-company domain mismatches like Andrew.

---

## Completed (Fixed This Session)

### BL-FIX-001: Confidence gate type mismatch (FIXED 2026-06-07)
**Phase:** 2 (Email Discovery)
**Finding:** Orchestrator returns confidence as color strings (`green/yellow/amber`) but confidence-gate expected method strings (`apollo-verified/provided/etc.`). Every Apollo result scored 10 → red → BLOCKED.
**Fix:** Added color-string mappings to `CONFIDENCE_SCORES` in `confidence-gate.ts`.

### BL-FIX-002: Word count target lowered (FIXED 2026-06-08)
**Phase:** 6 (Composition)
**Finding:** Composer targeted 90w with 100w ceiling — only 10% margin. LLMs overshoot by 10-20% consistently, landing at 95-110w. 33% of test prospects failed word count after 3 retries.
**Fix:** Dropped prompt target to 60-75w (T1/T2) and 45-60w (T3) in `influence.ts`. Recompose prompt now targets 25% below ceiling with structural guidance ("cut entire sentences rather than trimming words"). Hard ceiling unchanged at 100w/80w.

### BL-FIX-003: "Permit kickbacks" reputational risk (FIXED 2026-06-08)
**Phase:** 6+7 (Composition + Judge)
**Finding:** Composer generated "permit kickbacks" (implies bribery). LLM judge caught it but no mechanical check existed. Relied on luck.
**Fix:** (a) Added "kickback" to composer banned phrases in `influence.ts`. (b) Added 5 reputational-risk mechanical checks to `judge.ts`: kickback, brib*, fraud, negligen*, illegal.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v3 | 2026-06-08 00:52 | Claude | BL-FIX-002 (word count target), BL-FIX-003 (kickback ban + reputational risk checks). |
| v2 | 2026-06-08 00:44 | Claude | BL-008 partial fix (CTA regex expansion + structural AI-tell warnings). |
| v1 | 2026-06-07 23:11 | Claude | Initial backlog from pipeline audit session. 12 items logged + 1 fix completed. |
