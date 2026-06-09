---
title: Substrate-Tiering Architecture Spec — P2 Pilot
status: ACTIVE
last_updated: 2026-06-08 23:10 EDT
version: v2
purpose: Technical spec for the substrate-tiering layer and the unified evidence pipeline. Post-critique synthesis from workflow wf_45c688ad-620. Implements P2-PILOT-ALIGNMENT.md (v2) challenge #3. Scope stops at operator gate/portal — delivery/HubSpot/reporting deferred to C portion.
---

# Substrate-Tiering Architecture Spec (v2 — post-critique)

## 0. What changed from v1 (2026-06-08 21:45 → v2 22:55)

Adversarial 4-angle critique (operator-alignment, technical-feasibility, consequence-of-being-wrong, simplicity) converged on `ship_with_amendments`. All amendments accepted. Plus operator scope cut: spec stops at portal — C portion (delivery + HubSpot Sequence + bounce/circuit + reporting) deferred.

| v1 → v2 change | Reason |
|---|---|
| 4 tiers (VERIFIED/STRONGLY_INFERRED/WEAKLY_INFERRED/GENERALIZED) → **2 tiers + 1 mode** (USE_DIRECTLY/USE_TO_SHAPE + composer_mode='generalized') | Matches operator's 4-state language exactly. WEAKLY = discard. GENERALIZED = mode switch. Simpler, deterministic, cuts the LLM tier-consolidator. |
| 5-phase orchestrator → **3-phase** (Pull / Gap-fill / Tier+emit) | Collapses redundant phases. Substrate retrieval becomes sub-call inside Phase 2 gap-fill. |
| Apollo data treated as VERIFIED → **Apollo demoted to USE_TO_SHAPE** unless cross-source confirmed <12mo | Closes the stale-Apollo reputation-damage failure mode the alignment doc flagged as a hidden trust point. |
| Email-level sources_used → **sentence-level** (`bodySentences: Array<{text, claim_ids}>`) | Operator's BL-002 promise (click-sentence-see-source) requires sentence-level attribution. |
| Generalized mode = Step 6 → **Generalized built FIRST (Day 1-2)** | Every prospect has defensible path immediately. Specific-mode is the upgrade. |
| Phase E LLM tier-consolidation call | **CUT.** Deterministic source-kind table only. |
| Brain Level 2 (peer-pattern store) | **CUT to post-pilot.** Cold P2 has thin Brain anyway. |
| Brain Level 3 (inference cache) | **CUT to post-pilot.** No invalidation policy = cache-poisoning risk. |
| Substrate entity-tagging backfill (4,005 files) | **CUT to post-pilot.** Phase B retrieval works without it. |
| Composer attribution UI = Step 9 | **Re-sequenced BEFORE specific-mode goes live.** Tim/Justyn cannot catch tier errors at 90s/email review without click-sentence-see-source. |
| Out-of-scope delivery side | **C portion deferred** per operator 2026-06-08. Spec stops at portal. |

## 1. Problem statement (unchanged)

The composition layer is approved by Tim. The unsolved problem is upstream: **substrate-tiering**. Today's pipeline conflates verified facts and narrative — research returns prose, the structurer extracts 30 fields, the composer reads them all as ground truth. No tier on any claim.

Per P2-PILOT-ALIGNMENT.md (v2) §"Claude's responsibility for fact-quality": **Claude decides what's true, the composer dresses it up.** This spec is how that decision is made and made traceable AT SENTENCE LEVEL.

## 2. The 2-tier claim model (single source of truth)

Operator's 4-state framing maps to 2 tiers + 1 mode + 1 discard:

| Operator's word | Internal | Composer usage |
|---|---|---|
| **Verified** | **USE_DIRECTLY** | May reference. **Numeric claims framed as approximations** ("north of 1,500 miles" not "1,700 miles") unless cross-source confirmed within 12 months. |
| **Likely** | **USE_TO_SHAPE** | Informs POV. **NEVER quoted as fact.** Frame implicitly ("for operators at this scale…"). |
| **Not confident** | (discarded) | No EvidenceRecord kept. Orchestrator must trigger second-best gap-fill loop BEFORE declaring the category empty (operator's "find second-best, or third"). |
| **Nothing usable** | `composer_mode='generalized'` | Not a tier — composer mode switch. Industry/region/peer framing only. Zero company-specific factual claims. |

## 3. Deterministic tier computation (no LLM judgment)

Tier is computed by a hard source-kind table, not an LLM call. Per critique consequence-analysis: an LLM "synthesizer" on top of computed rules is a place for bugs to live AND has no human check downstream.

### 3.1 Source-kind → tier mapping (from `types.ts`)

```ts
USE_DIRECTLY: apollo_cross, substrate_quoted, web_research_dated, csv_input, manual
USE_TO_SHAPE: apollo, brain, substrate, web_research
```

### 3.2 Source-kind definitions (rules)

- `apollo_cross` — Apollo data PLUS a 2nd source dated <12mo agreeing on the same claim
- `substrate_quoted` — Substrate quote where `speaker.company === prospect.company` AND `speaker.role ∈ (CEO, COO, VP-Ops, similar)`
- `web_research_dated` — live web research with explicit publication date <12mo
- `apollo` — Apollo alone (crowdsourced/scraped, not authoritative)
- `brain` — prior dossier entry, no datable source
- `substrate` — industry context, not a company-quoted statement
- `web_research` — research without date confidence

Per critique consequence #1: Apollo alone is **USE_TO_SHAPE** because Apollo data is crowdsourced/scraped. To earn USE_DIRECTLY, Apollo data must be corroborated by a second dated source.

### 3.3 Speaker-affiliation gate (consequence #3 amendment)

For `substrate_quoted` promotion, the entity tagging must enforce: `speaker.company === entity.company AND speaker.role ∈ {CEO, COO, VP-Operations, ...similar}`. Prevents the competitor-claim-leak failure mode (Speaker A from Company X saying something about Company Y → falsely promoted as a Y-said claim).

## 4. The orchestrator (3 phases)

Per critique simplicity-cut: 5-phase orchestrator collapses to 3. Substrate retrieval becomes a sub-call inside Phase 2.

```
┌─────────────────────────────────────────────────────────┐
│  EVIDENCE ORCHESTRATOR (one call per prospect)          │
│                                                         │
│  Phase 1 — Pull facts (parallel)                        │
│    A. Apollo people-match + org-enrich                  │
│    B. Brain entity lookup (per-prospect history)        │
│    → typed evidence records, source-kind set            │
│                                                         │
│  Phase 2 — Gap-fill research                            │
│    Identify which categories Phase 1 didn't cover.      │
│    Targeted research (substrate retrieval + web)        │
│    on gaps only.                                        │
│    **Second-best re-query loop**: if category yields    │
│    only WEAKLY_INFERRED material, re-query with         │
│    alternate angle BEFORE declaring empty.              │
│    (operator's "find second-best, or third")            │
│                                                         │
│  Phase 3 — Tier + emit                                  │
│    Apply §3 source-kind rules deterministically.        │
│    Apply speaker-affiliation gate.                      │
│    Apply Apollo cross-confirmation rule.                │
│    Compute tierCounts, research_quality, composer_mode. │
│    Emit TieredDossier.                                  │
└─────────────────────────────────────────────────────────┘
```

Cost per prospect:
- Phase 1: 1 Apollo credit + 1 LLM (Sonnet, ~$0.015) for source-kind assignment
- Phase 2: targeted 1-2 Sonnet calls only on gaps (~$0.03)
- Phase 3: 0 LLM (deterministic rules)

Estimated: ~$0.05 per prospect. Wall-clock ~30-40s.

## 5. The TieredDossier (replaces today's structuredIntel)

See `src/showrev/m1-email-find/evidence-tiering/types.ts` for the canonical schema. Key fields:

- `claims: Record<ClaimCategory, EvidenceRecord[]>` — only USE_DIRECTLY + USE_TO_SHAPE
- `generalizedFraming: EvidenceRecord[]` — industry/region/peer framing, populated when `composer_mode='generalized'`
- `composer_mode: 'specific' | 'generalized'` — switched by `(useDirectly + useToShape) >= SPECIFIC_MODE_THRESHOLD`
- `tierCounts: { useDirectly, useToShape }`
- `research_quality: 'high' | 'medium' | 'low'`
- `icp_volume_verdict: 'fit' | 'leaning_fit' | 'miss'` (preserved)

## 6. Composer integration

### 6.1 Generalized mode (built FIRST — Day 1-2)

Per critique simplicity #7: build generalized mode FIRST so every prospect has a defensible path immediately.

Inputs:
- TieredDossier with `composer_mode='generalized'` and populated `generalizedFraming`
- Inorsa positioning (SoT §2 Chris's one-pager, §4 fiber solution positioning, §11 copy rules)
- Persona variants A/B/C (SoT §1)
- P.S. variants (SoT §14, 6 options)
- Industry intelligence KB (BEAD/ReConnect, fiber dynamics)

The "generalized" email is informed by industry context but makes **zero company-specific factual claims**. NOT generic. The substrate is the differentiator. Operator's bar: "better than top 0.01% of AEs."

Composer instructions for generalized mode:
- Lead with industry/region/persona framing (e.g., "Operators running multi-state fiber programs in BEAD-active geographies typically hit a permit-throughput wall around month 6 of construction.")
- Frame the friction abstractly with industry-data citation (FBA, NTIA, Cartesian)
- Bridge to the pitch sentence (verbatim Variant A/B/C by persona)
- P.S. uses `industry_data_hook` variant (FBA citation) — neutral, citation-backed, doesn't claim to know the company
- **Anti-fallback-tell test**: a third party reading 5 specific + 5 generalized emails cannot distinguish quality (only specificity)

### 6.2 Specific mode (built AFTER generalized — Days 3-5)

Inputs include TieredDossier with `composer_mode='specific'` and USE_DIRECTLY/USE_TO_SHAPE claims grouped by category.

Composer instructions:
- USE_DIRECTLY company-specific numeric claims framed as **approximations** ("north of 1,500 miles") unless source has cross-confirmation
- USE_TO_SHAPE used to inform POV but never quoted as fact
- Each sentence emits `claim_ids: string[]` for the portal click-trace
- Generalized framing material NOT injected in specific mode

### 6.3 Composer output schema

See `types.ts → ComposedEmail`. Key field: `bodySentences: Array<{text, claim_ids}>` for sentence-level attribution. The portal renders this as click-sentence-see-source.

## 7. Step 0 prerequisites (BEFORE any tier-rule ships)

Per critique technical-feasibility + consequence-analysis: 3 gates must complete before tier rules ship.

### 7.1 Pick canonical substrate store

Currently dual-pathed: Supabase `sr_brain_substrate` (used by `phaseSubstrateSearch`) AND AgentDB substrate namespace (used by `substrate-indexer.ts`). Phase B has two retrieval paths.

**Decision pending operator review:** pick ONE. Recommended: Supabase as canonical (already wired to portal); retire AgentDB substrate namespace OR mark it as ingestion-only mirror.

### 7.2 Apollo `short_description` quality audit

Run Apollo org-enrich on 10 of the 28 true-cold P2 prospects. Cross-check `short_description` and mined `parsed_volume_signals` against each company's own website. If <70% match the company's published facts, USE_DIRECTLY tier is poisoned at root → ship as generalized-mode-only pilot.

### 7.3 Calibration-first N

Run orchestrator on all 28 true-cold prospects BEFORE picking the SPECIFIC_MODE_THRESHOLD. Report distribution of `(useDirectly + useToShape)` counts. Operator picks N from actual data. Hard floor: if >70% would hit generalized mode at chosen N, ship specific mode off this pilot.

## 8. Migration path (revised)

| Step | Effort | What ships | Cumulative |
|---|---|---|---|
| **0** | 1 day | Step 0 prerequisites: canonical substrate store decision, Apollo quality audit, N calibration | Day 1 |
| **1** | 0.5 day | Types committed (DONE: `e0e96a968`); committed types match v2 spec | Day 1 |
| **2** | 1 day | Apollo client wrapper (BL-013 normalize, BL-014 org enrich, parsed_volume_signals extractor) | Day 2 |
| **3** | 1 day | Shadow-emit orchestrator skeleton — emits BOTH `structuredIntel` (current) AND TieredDossier (new) so 11 downstream consumers keep working | Day 3 |
| **4** | 1 day | Generalized-mode composer prompt — uses Inorsa positioning + industry KB + persona variants + P.S. variants. Validates anti-fallback-tell test on 5 prospects. | Day 4 |
| **5** | 1.5 days | Portal source-click view (deferred from Step 9 → re-sequenced before specific mode). Composer emits `bodySentences`. Supabase persists `composed_emails` with sentence-level attribution. | Day 5.5 |
| **6** | 1 day | Specific-mode composer prompt — USE_DIRECTLY/USE_TO_SHAPE distinction, approximation framing on numbers. Cohort test. | Day 6.5 |
| **7** | 0.5 day | Domain-sanity pre-check at portal review (Andrew-class detection). | Day 7 |
| **8** | 1 day | Engine-qa Test 1 (blind quality) + Test 2 (new prospect E2E) on 10-prospect cohort | Day 8 |
| **9** | 1 day | Operator timed-review test + 10-claim source-attribution audit | Day 9 |

**Total: ~9 days to portal-ready.** Email-finder (B track) and delivery (C portion) are separate streams.

## 9. Test plan

Per-step:
- Step 0: Apollo audit report (operator reviews) + N decision
- Step 2: TypeScript clean; orchestrator emits BOTH structuredIntel and TieredDossier for 5 prospects (shadow mode)
- Step 4: 5 generalized emails composed; anti-fallback-tell test (third party can't tell quality from specific)
- Step 5: Portal click-sentence-see-source works on a real prospect's email
- Step 6: 10-prospect cohort run; tierCounts distribution matches Step 0 calibration; Tim approves ≥4/5 on each mode
- Step 8: Engine-qa Tests 1 + 2
- Step 9: Operator reviews 10 emails in <15 min, zero rewrites; manually traces 10 USE_DIRECTLY claims to source, zero misattributions

## 10. Out of scope (C portion — deferred per operator 2026-06-08)

- Email-finder service (sibling B-track spec)
- Send queue with warming / circuit-breaker / bounce monitoring
- HubSpot Sequence loader (per-paragraph properties wiring)
- Post-send reporting (delivery, opens, replies, meetings)
- Outcome learning loop
- Brain Level 2 peer-pattern store
- Brain Level 3 inference cache
- Substrate entity-tagging backfill (4,005 files)
- Composer attribution UI beyond click-trace MVP

## 11. Risks

| Risk | Mitigation |
|---|---|
| Step 0 Apollo audit reveals <70% short_description quality → specific mode unviable | Pilot ships generalized-only. Re-run Apollo audit quarterly to rebuild confidence. |
| Phase 2 gap-detection collapses to "always run all 3 personas" | Acceptable cost; budget assumes worst-case 3 persona calls per prospect anyway. |
| Calibrated N drops to 1 (most prospects ship generalized) | Operator-stated: generalized templates are bulletproof. Substrate richness compensates. |
| Tim ratify rate on generalized <80% | Anti-fallback-tell test catches this at Step 4. Iterate composer prompt before Step 5. |
| Sentence-level attribution introduces composer hallucination (LLM cites claim_ids that don't exist) | Mechanical check: validate every claim_id in `bodySentences` exists in dossier source_index. Reject if mismatch. |
| Shadow-emit orchestrator regression breaks 11 downstream consumers | Cutover gated on 5-frozen-prospect regression suite passing; revert easy because both fields populated. |
| Apollo `parsed_volume_signals` extraction itself uses LLM (Haiku) → could mis-extract | Mechanical fallback: if extractor confidence is low, demote to no-volume-signal-found; intel-structurer still emits leaning_fit verdict (already calibrated). |

## 12. What this spec does NOT cover

- Email-finder service architecture (separate spec, B track)
- Send queue + warming + circuit-breaker (separate spec, C portion — deferred)
- HubSpot Sequence loader (C portion)
- Operator portal UI changes beyond the new sentence-attribution surface (separate UI work)
- Outcome learning loop (C portion)
- Multi-client platform abstraction (post-pilot)

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v2 | 2026-06-08 23:10 | Claude | Post-critique synthesis: 4 tiers → 2 + mode, 5 phases → 3, Apollo demoted, sentence-level sources_used, generalized-built-first, attribution UI re-sequenced before specific mode. Step 0 prerequisites added (substrate store choice, Apollo quality audit, calibration-first N). C-portion (delivery/reporting) scope-cut per operator. ~9-day timeline. |
| v1 | 2026-06-08 21:45 | Claude | Initial draft. Folded BL-001/002/003/004/005/007/012/013/014/015. Awaited critique. |
