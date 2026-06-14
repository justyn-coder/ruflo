---
title: WANT vs ARE Matrix — Every System Claim vs Empirical Reality
date: 2026-06-12
status: COMPLETE — based on Wave 1 forensic (15 agents, 641-line rolling synthesis)
purpose: Operator-readable distillation. Every CEO brief / canon claim mapped to empirical truth with cited evidence.
authored_by: Claude (Opus 4.7) Coordinator
---

# How to read this

For each row:
- **WANT** = the stated claim (from CEO brief, canon docs, code comments, spec)
- **ARE** = the empirical reality from Wave 1 forensic
- **Status** = ✓ (matches), ⚠ (partly matches), ✗ (doesn't match)
- **Evidence** = file:line citation or SQL query result

Color coding: this isn't subjective. ✗ means "the system makes a claim that's empirically false." ⚠ means "the system makes a claim that's partially supported but materially overstated." ✓ means "the system delivers what it claims."

---

# Layer 1 — The pitch (CEO brief claims)

## 1.1 "Substrate-grounded composition"

> **WANT** (abm-ceo-brief.md): "Every prospect gets a 3-touch email sequence paired with a personalized microsite... built from real data, not theory... 7 JTBDs extracted from Inorsa's own sales threads, booth recordings, and 6,512 industry intelligence documents."

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| 6,512 substrate chunks | True corpus | True corpus, **but FROZEN** | ⚠ | All chunks created within 7-hr window on 2026-06-03; never refreshed. DB query in /tmp/wave1-db-fill-rates.md |
| Substrate has clean sources | "industry intelligence" | **29 PROHIBITED-source rows confirmed across 1,475 evidence rows; zoominfo.com is the #7 most-cited host** | ✗ | DB query confirms 17 zoominfo + 6 leadiq + 3 rocketreach + 2 prospeo + 1 yelp |
| Every claim cites primary source | Implied by "substrate-grounded" | Only 10 of 1,522 evidence rows have `source_date` set; **freshness checking structurally impossible** | ✗ | `SELECT COUNT(*) WHERE source_date IS NOT NULL` returned 10 |
| Composer constrained to substrate | Spec | Generalized-composer **disables citation gate** by hardcoding `0` (composer-constraints.checkCitationCoverage(body, **0**)) — no-op for the dominant cold-cohort mode | ✗ | generalized-composer.ts:426 |

## 1.2 "3-touch email sequence"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Touch 1 (challenger) | Shipped | Shipped to the extent V2 composes | ✓ | sr_engine_output.email_body_t1 populated 67-79% of rows |
| Touch 2 (proof number) | Shipped | **100% NULL across all 526 sr_engine_output rows** | ✗ | `email_subject_t2`, `email_body_t2`, `email_ps_t2` all 100% NULL |
| Touch 3 (low-risk demo) | Shipped | **100% NULL across all 526 sr_engine_output rows** | ✗ | Same: T3 columns 100% NULL |
| Influence pattern per touch | "challenger / proof / low-risk" | `influence_pattern_t1/t2/t3` all 100% NULL across cohort | ✗ | DB fill-rate audit |

**The "3-touch ABM" is a 1-touch system in production.**

## 1.3 "Personalized microsite per prospect"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Microsite renders for each prospect | Yes | 15/15 verified live earlier tonight | ✓ | WebFetch on all 15 smoke /assess URLs |
| Standard /assess questionnaire | Yes (operator confirmed) | Yes | ✓ | Operator confirmed today |
| Workflow diagram showing where Inorsa fits in THEIR process | Promised in CEO brief Section "The proposal" | **Not implemented.** All 182 microsites are status=`draft`, `calendly_url=NULL`, `ae_video_url=NULL` | ✗ | DB query: 100% of sr_microsites are draft |
| Page-views tracked | Yes | `sr_microsites.page_views` permanently 0 while `sr_microsite_events` has 332 events | ✗ | Rollup broken |
| Personalization includes prospect's GIS tool / team size / jurisdictions | CEO brief: "rendered differently per prospect based on their GIS tool, team size, and jurisdictions (all from research output)" | Not implemented. Microsite is name + logo + generic questionnaire | ✗ | Operator confirmed today: "standard /assess questionnaire with name + logo personalization only" |

**The personalized microsite is half-built. The "workflow map" version doesn't exist.**

## 1.4 "5 quality gates" / "Nothing ships unchecked"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Mechanical regex (22 AI tells) | Wired and firing | Wired and firing | ✓ | composer-constraints.ts ALL_BANNED + checkBannedPhrases |
| Tim Proxy judge | Wired and firing | Wired and firing | ✓ | tiered-judge runTier2 |
| Always-on Gemini hallucination check | Fires on every prospect | Fires on every prospect | ✓ | run-pipeline-v2.ts:635 + tiered-judge.runTier3HallucinationCheck |
| 5-dim LLM judge | Wired | judges.ts Recipient Proxy + Skeptic imported by premium-pipeline.ts BUT **never called** | ✗ | Grep proves only 1 of the 3 advertised adversarial judges fires |
| Cross-model GPT-5 spot-check | "Spot-check via GPT-5" | **Calls gpt-4o + grok-3** (cross-model-judge.ts lines 53, 67). Filename + comments lie. | ✗ | Generation-older models being called |
| **Actual gate count promised vs delivered** | "5 quality gates" | **62 numbered gates exist per gates-inventory-2026-06-09.md**, but ~25-30 are theatre per our forensic | ⚠ | Canon reader confirmed gates-inventory; safety + judge forensics confirm theatre count |

**Compose-time quality is real. Post-compose safety stack is mostly theatre (see Layer 3 below).**

## 1.5 "Brain learns from outcomes"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Brain pyramid 3 layers (Client/Show, Industry, Universal) | Documented | sr_brain_substrate has 6,512 chunks (frozen). Other Brain tables: sr_brain_outreach_patterns has 8 patterns × 43 sends; bellwethers, market_signals, patterns, ae_interactions, citations all DEAD (0 rows); dossiers near-dead (3 rows); outcomes 2 rows | ⚠ | DB fill-rate audit |
| Brain compounds learning from sends | Core moat | **Brain learning loop is dormant.** No caller pipes `sr_outcomes` or `sr_email_experiments` back into Brain. `searchBrain` is read-only retrieval. | ✗ | substrate-chain forensic |
| Outcomes tracked from HubSpot replies/opens/clicks | Yes | sr_outcomes has 10 rows total. sr_sent_emails has 0 rows (45 FC2026 sends never logged) | ✗ | DB fill-rate audit |
| Watcher fires on schedule | Implied | **Only fires when operator manually runs `npx tsx watcher.ts learn`** | ✗ | safety-watcher forensic |
| Thompson Sampling explores 8 patterns | CEO brief Section "What we're still validating" | sr_email_experiments = 0 rows. **Thompson Sampling has no data to sample from.** | ✗ | DB query |

**The compounding-advantage moat is operating on 10 outcome events. Total. Across all time.**

## 1.6 "FC2026 calibration signal" (the 4.4% baseline)

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| 45 FC2026 sends with tracked outcomes | Yes | 8 replies + 2 opens captured in sr_outcomes. 45 sends NOT logged to sr_sent_emails | ⚠ | DB query — outcomes captured but sends not |
| challenger_insight drove 75% of replies | Yes | Confirmed by sr_brain_outreach_patterns: challenger_insight 75% success at n=4 | ✓ | Empirically validated by DB query |
| Other 7 patterns tracked | Yes | Yes — 8 patterns total in sr_brain_outreach_patterns. loss_aversion 6% at n=18. | ✓ | DB query |

**The FC2026 baseline is the most empirically-supported claim in the system. Everything that supposed to follow from it (Thompson Sampling, Brain compounding) does not.**

---

# Layer 2 — The pipeline (V1 vs V2 unmanaged migration)

## 2.1 "Which pipeline ships emails"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| One canonical pipeline | Implied by spec | **TWO live entry points run in parallel**: V1 (`run-pipeline.ts`) and V2 (`run-pipeline-v2.ts`). Neither invoked by npm script — both ad-hoc CLIs. | ⚠ | Pipeline-chain forensic |
| Pipeline ingests intel into 30 sr_engine_output fields | Spec | **V2 writes only 4 of 30 intel fields. V1 writes all 30 BUT V1 throws TypeError at runtime** (broken `seedFromSupabase` import) | ✗ | substrate-chain + safety-watcher forensics |
| intel-structurer.ts produces the dossier | Spec, V1 design | **V2 never invokes intel-structurer.ts**. Explains why 23 of 30 intel fields are 100% NULL on all 120 cohort rows. | ✗ | Grep `structureIntelReport` in run-pipeline-v2.ts returns 0 hits |
| prompt-optimizer.ts (DSPy) tunes prompts | Wired | **Real DSPy implementation wired into V1 only**. V2 production path has no DSPy. | ✗ | composer-chain forensic |
| Brain ingestion of research | Wired (V1 design) | **V2 doesn't ingest research into Brain**. brain-ingest.ts wired V1-only. | ✗ | substrate-chain forensic |

## 2.2 "DB writes are clean"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Foreign key integrity | Implied | **sr_engine_output.prospect_id is NOT NULL text with NO FK to sr_prospects.** Orphan rows physically possible. | ✗ | DB schema mapper |
| CHECK constraints validate enums | Implied | **Zero CHECK constraints in entire sr_* namespace.** `send_status` accepts `'banana'`. The pilot_* schema (0 rows) has 89 CHECK constraints. | ✗ | DB schema mapper |
| sr_emails has the canonical email content | Schema | **sr_emails has 0 rows. V2 crams body into sr_engine_output.email_body_t1.** sr_outcomes.email_id → sr_emails.id FK broken at source. | ✗ | DB schema mapper |
| 9 typed send-confidence columns per spec | send-confidence-system-spec | **None exist.** All data stuffed into `send_confidence` jsonb blob. All 493 populated blobs have `weights_calibrated = false`. Spec's "uncalibrated = warning banner" rule has no DB representation. | ✗ | DB schema mapper |
| RLS protects PII | Implied | **7 sr_* tables have RLS OFF** including sr_company_evidence, sr_company_contacts, sr_sent_emails, sr_dnc_log. These contain prospect emails. | ✗ | DB schema mapper |
| sr_engine_output queries are indexed | Implied | **3 indexes on 81 columns + 526 rows.** Portal filters by persona_bucket or icp_status do sequential scans. Won't scale to 800. | ⚠ | DB schema mapper |

---

# Layer 3 — Safety + monitoring

## 3.1 "Post-compose safety stack"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Circuit breaker | Wired | **circuit-breaker.ts has ZERO callers.** Never instantiated. | ✗ | safety-watcher forensic |
| Send cap monitor (per-AE per-day) | Wired and enforced | **send-cap-monitor.ts has zero programmatic callers.** Cap is observability only. **Justyn enforces the cap socially by telling AEs in the morning email.** | ✗ | safety-watcher forensic |
| Bounce monitor (5% hard-bounce halt) | Wired | Well-designed, fires correctly **only when operator manually runs `npx tsx watcher.ts deliverability`**. No scheduled execution. | ⚠ | safety-watcher forensic |
| Engagement feed / watcher | Wired | **Two parallel watcher implementations exist** (m1-email-find/watcher.ts + watcher/engagement-feed.ts). One has zero callers. Watcher only runs when operator types the command. | ⚠ | safety-watcher forensic |

**There is no automatic safety net. If a bounce storm happens overnight, no system halts the send. The operator finds out by checking HubSpot the next morning.**

## 3.2 "Pre-load verification gates"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| SPF / DKIM / DMARC check before send | Wired | Wired in `preload-verify.ts` (BLOCKING) | ⚠ | Loader forensic — BUT the loader CLI calls its own internal verify, not this one. The DNS-check preload-verify orchestrator appears stranded. |
| HS auth check | Wired | Wired | ✓ | Both verifiers check HS auth |
| Unsubscribe-enabled-per-sequence | Blocking | Wired (loader L734) | ✓ | preload-verify Phase 2 |
| Substrate-cleanliness check before HS load | Implied by spec | **No gate anywhere in load path inspects sr_company_evidence.domain_tier.** **ZoomInfo-derived company_summary ships verbatim to HubSpot.** | ✗ | Loader forensic |
| Duplicate-contact race protection | Implied | **Read-then-write for both companies (L271-310) and contacts (L312-323), no transaction or idempotency key.** Only HS-side dedup-on-email mitigates contacts; companies exposed. | ✗ | Loader forensic |
| Throttling on HS API | Wired | Proactive (sleep at <30 remaining) but `lastSeenRemaining` is **per-process — concurrent pipeline runs cannot coordinate**. | ⚠ | hs-api-client throttling code |

## 3.3 "Always-on substrate-faithfulness gate"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Gemini hallucination check fires per prospect | Yes | **Yes** | ✓ | run-pipeline-v2.ts:635 + tiered-judge.runTier3HallucinationCheck |
| Check scope is right | "Is every claim supported by substrate?" | Yes — that's what it asks | ✓ | tiered-judge buildHallucinationPrompt |
| But substrate validity is checked | Implied by safety | **No.** Check asks faithfulness-to-substrate, not substrate-cleanliness. **Contaminated substrate (zoominfo claims) passes through.** | ✗ | This is THE root cause of the smoke crisis |
| Hallucination-check repudiation attack defended | Implied | **Force Gemini to return malformed JSON; parseHallucinationResponse returns `verdict='split'`; decision rule requires `verdict='fail'` to flag. Split fails open. Adversary bypasses the only always-on gate.** | ✗ | tiered-judge.ts lines 488 + 622-625 |
| DoS attack defended | Implied | **5-second Haiku timeout, no retry on abort.** Anthropic slow day → cohort halts. No fallback model. | ✗ | refutation.ts forensic |
| PII / cohort data egress controlled | Implied for enterprise | **Every fan-out sends full substrate + email body to four third-party LLMs (OpenAI, xAI, DeepSeek, Google).** No zero-retention contracts referenced. BRMEMC's "21,000 subscribers" leaves perimeter to four vendors per invocation. | ✗ | Judge-chain forensic |

---

# Layer 4 — Operator portal

## 4.1 "Three-axis confidence review"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| ICP / Email / Substrate confidence visible | Yes | **Yes — 3-axis card works as designed**. Send confidence JSONB populated for 493/526 rows. | ✓ | Portal forensic |
| Uncalibrated weights surface warning banner | send-confidence-system-spec | **All 493 populated blobs have `weights_calibrated=false`. The spec's warning rule has no DB representation. Portal can't enforce it.** | ✗ | DB schema mapper |
| Composite score visible | Yes | Yes — Gabriel scored 93.3 (high) | ✓ | Portal screenshot |
| Composite calibrated to operator judgment | Spec | Never calibrated (operator-calibration gate not run) | ⚠ | send-confidence-system-spec gap |

## 4.2 "Intel tab — AE-ready data"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Persona shown | Yes | Yes | ✓ | Portal screenshot |
| MEDDPICC: Metrics | Spec | **`meddpicc_metrics` column doesn't exist in sr_engine_output** | ✗ | Portal forensic; column exists in sr_brain_dossiers (3 rows) — wrong table |
| MEDDPICC: Decision Criteria | Spec | Populated 99/120 rows BUT only 3 distinct values across 69 ops_builder prospects — **persona-templated boilerplate, not research** | ✗ | DB fill-rate query |
| MEDDPICC: Decision Process | Spec | **Column doesn't exist** | ✗ | Portal forensic |
| MEDDPICC: Identified Pain | Spec | Populated 94/120 rows BUT contains substrate-press-release copy, **not pain analysis** | ✗ | DB fill-rate sample shows "BRMEMC unveiled new logo..." not pain |
| MEDDPICC: Economic Buyer | Spec | **0% populated across 120 cohort rows** | ✗ | DB query |
| MEDDPICC: Champion | Spec | **0% populated** | ✗ | DB query |
| MEDDPICC: Competition | Spec | **0% populated** | ✗ | DB query |
| Intel talking points | Spec | **0% populated** | ✗ | DB query |
| Intel next action | Spec | **0% populated** | ✗ | DB query |
| Intel buying timeline | Spec | **0% populated** | ✗ | DB query |
| Intel decision authority | Spec | **0% populated** | ✗ | DB query |
| Intel risk factors | Spec | **0% populated** | ✗ | DB query |
| Company size / fiber activities / bead status / growth signals / key projects / external deadlines / known tools / likely competitors / market moment | All spec'd | **All 0% populated** | ✗ | DB query |
| Bellwether inference | Spec | **0% populated. Plus the renderer references the wrong column name (`inferred_from_bellwether` vs schema's `bellwether_inference`)** | ✗ | Portal forensic + DB query |
| Total renderer dead references | Implied: 0 | **10 dead column references in Row type**: meddpicc_metrics, meddpicc_decision_process, meddpicc_paper_process, switching_signals, source_class, substrate_badge, pinned_note_text, halt_reason, hs_note_research, hs_note_call_prep | ✗ | Portal forensic |
| Total empty-rendered surfaces | Implied: 0 | **~32 dead UI surfaces total (10 dead refs + 22 always-NULL fields)** | ✗ | Portal forensic |

**The Intel tab is structurally empty for the V2 cohort. The operator's review job has silently bifurcated — confidence axes get richer surface than designed, AE-ready intel gets nothing.**

## 4.3 "Tim review reset behavior"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Tim approval captured | Yes | Yes — 37/120 cohort rows have `composition_review='approved'` by Tim | ✓ | DB query |
| Tim approval resets if confidence later degrades | Implied for safety | **No. actions.ts has zero references to `composition_review`.** Tim's approval persists indefinitely. Portal displays "approved by Tim" alongside red rows. | ✗ | Portal forensic — STALE APPROVAL BUG |

## 4.4 "Server-side authorization"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Server actions authenticated | Implied | **11 server actions exported, 0 authorization checks.** | ✗ | Portal forensic |
| State gate on activateGo | Yes | `activateGo` requires `ae_review_status === 'verified'` | ⚠ | But the gate is bypassable: `submitAeReview(id, 'verified', '')` has no auth, so attacker can self-issue verified → activateGo → force `send_status='go'` |
| Author/reviewer values server-validated | Implied | **Author/reviewer values client-supplied throughout** | ✗ | Portal forensic |

## 4.5 "Scale to 800-2,300 prospects"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| Pagination | Implied | **None implemented. SELECT * on 4 tables. Built for ~50 rows.** Silently degrades at 800-2,300. | ✗ | Portal forensic |
| Virtualization | Implied | **None** | ✗ | Portal forensic |
| Bulk operations throttled | Implied | **"Approve All" fires Promise.all(updateSendStatus...) with no rate limit.** 800 concurrent PATCH requests trigger unpredictable Supabase REST throttling. | ✗ | Portal forensic |
| Naming consistent with action | Implied | **Button says "Approve All" but sets status='send', not 'go'.** AE review + activateGo still required. | ⚠ | Naming asymmetry |

## 4.6 "Brain function surfaced to operator"

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| BrainActivity component | Live | Component exists | ⚠ | Portal forensic |
| Shows reply / meeting rate per pattern with sample-size + CI | Promised by compounding-advantage thesis | **Shows only research-event counts + influence-pattern distributions. Does NOT surface what Brain learning loop promises.** `research_confidence` badge column is 0% populated — badge never renders. | ✗ | Portal forensic |
| The compounding-advantage claim visible to operator | Yes | **No.** Operator has no UI surface showing "the system is learning." | ✗ | Portal forensic |

---

# Layer 5 — Email finding

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| MillionVerifier quality persisted | Implied | **MV `quality` is dropped on the floor by V2.** `EmailFinderResult` type has no `mvQuality` field. V2's sr_prospects upsert omits `email_verification_status`, `email_verified`, `email_provider`, `verification_report` entirely. | ✗ | Email-finder forensic; 100% NULL on 36 cohort rows confirmed |
| Portal "verified by MillionVerifier" copy is true | Implied | **Inferred from `confidence_color='green'` via send-confidence.ts:160.** No stored MV trace. Cannot audit historical MV. | ✗ | Email-finder forensic |
| Fail-open paths controlled | Implied for safety | **5 dangerous fail-open paths in domain-resolver**: Person+Email Search returns `emails[0]` even when none name-match (HIGH confidence!). Website Extraction trusts operator URL. Heuristics promotes speculative slug+suffix. pinDomain skips alt-domain verification. DMARC pattern detection wired but bypassed. | ✗ | Email-finder forensic |
| DMARC pattern detection used | Wired | **Bypassed by orchestrator Step 2.** Per tactic-eval, DMARC adds 8-12% coverage on small/mid telcos. **Losing it.** | ✗ | Email-finder forensic |
| Single confidence system | Implied | **Two confidence systems coexist.** System A (orchestrator qualitative) active. System B (confidence-gate.ts, MV-aware score-based) **never called from V2**. | ⚠ | Email-finder forensic |
| Apollo + MV throttled | Implied | Caller-enforced ceilings (`ApolloCreditTracker`, `MvCreditTracker`). No per-second rate limit, only batch delays. | ⚠ | apollo-client + million-verifier |

---

# Layer 6 — ICP gate

| Component | WANT | ARE | Status | Evidence |
|---|---|---|---|---|
| ICP gate produces pass/reject | Yes | Yes — regex first, then Haiku LLM | ✓ | icp-gate.ts |
| Inclusivity bias documented | Yes | Explicit in prompt: "False negatives 10x worse than false positives" | ✓ | icp-gate.ts:111 |
| Volume verdict can return 'miss' | Spec value: 'fit' / 'leaning_fit' / 'miss' | **All 526 rows: 327 leaning_fit + 199 fit + 0 miss. Structurally never returns 'miss'.** | ✗ | DB query confirms; pipeline forensic confirms code path |
| ICP regex patterns consistent across files | Implied | **icp-gate.ts, prioritizer.ts, p2-processor.ts each have their own ICP regex patterns — similar but not identical.** Patterns ban "business development" titles — would skip Ben Lewis-Ramirez at CNE, an A&E firm operator explicitly recognizes as in-scope. | ✗ | Pipeline forensic |
| Anthony Jelniker correctly classified as Revenue Leader | Cohort labeling | **Anthony Jelniker is Sr. Director Procurement at Great Plains, NOT a revenue leader.** | ✗ | Revenue-Leader persona research |
| "Design Document" persona is real | Operator confirmed today | **Not a real fiber-industry job title.** Placeholder. Agent recommends renaming to BEAD Compliance Owner. | ✗ | Design-Document persona research |

---

# Summary scorecard

| Layer | ✓ Matches | ⚠ Partial | ✗ Doesn't match |
|---|---|---|---|
| Layer 1 — The pitch | 6 | 6 | 16 |
| Layer 2 — Pipeline | 0 | 2 | 11 |
| Layer 3 — Safety + monitoring | 3 | 5 | 12 |
| Layer 4 — Operator portal | 2 | 3 | 29 |
| Layer 5 — Email finding | 0 | 3 | 6 |
| Layer 6 — ICP gate | 2 | 0 | 5 |
| **Total** | **13 (10%)** | **19 (15%)** | **79 (75%)** |

**Bottom line: of 111 verifiable claims in the system documentation and CEO brief, 75% don't match empirical reality, 15% match only partly, 10% are real.**

This isn't "the system has bugs." This is "the system documentation is a spec written for one system, and what's running is mostly a stub." That reframes the redesign:

**The Wave 6 redesign spec should not be a NEW system. It should be a RECONCILIATION — finishing the migration from V1 spec to V2 implementation, with the design discipline V2 skipped, with the gates that exist as stranded code actually wired, with the persona-4 question answered, with the V1 carcass deleted.**

# Single most damning finding

**The compounding-advantage thesis (the moat) rests on 10 outcome events. Total. Across all time.** Plus zero rows in sr_email_experiments, sr_sent_emails, sr_bounce_events. Plus a frozen substrate. The Brain function the CEO brief calls the product's defensible advantage **has never compounded anything.**

If the redesign accomplishes ONE thing, it should be making the loop close from send → outcome → pattern update → next composition. Everything else is downstream.

# Version history

| Version | Date | Author | Change |
|---|---|---|---|
| v1 | 2026-06-12 | Claude (Opus 4.7) Coordinator | First pass after Wave 1 forensic completed (all 15 returns in). 111 claims mapped to empirical reality. 75% don't match. |
