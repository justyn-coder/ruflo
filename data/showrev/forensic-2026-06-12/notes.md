---
title: Forensic Technical Review — Cold Prospecting System
date: 2026-06-12 (started 23:30 EDT)
authored_by: Claude (Opus 4.7, fresh session)
status: WORKING NOTES — accumulating findings
purpose: PM/Engineer/Architect/Biz Lead lens forensic on system that produced PROHIBITED-source claims in 5 of 15 smoke emails
---

# THE ROOT CAUSE (preliminary — to be confirmed by DB query)

**TWO PARALLEL TIER SYSTEMS EXIST IN CODE. THE DOMAIN-AWARE ONE IS NOT WIRED INTO THE PIPELINE.**

## System A — domain-aware (verify-facts.ts, 336 lines)

Has `classifySourceTier(url)` (lines 208-213):
```
.gov / ntia.gov / fcc.gov / sec.gov                           → Tier 1
lightreading / fiercenetwork / telecompetitor / bbcmag /
geekwire / prnewswire / businesswire                          → Tier 2
linkedin / zoominfo / glassdoor / indeed                      → Tier 3
default                                                       → Tier 3
```

ZoomInfo is **explicitly named** in this code. It would be classified Tier 3.

`assessClaimSafety()` says:
- Tier 3 = "Dossier only with [UNVERIFIED] tag. **NEVER in email body.**"

ALSO has:
- `detectClaims()` — regex-based load-bearing claim extraction (dollar amounts, miles fiber, BEAD awards, etc.)
- `verifyClaimsWithWebSearch()` — automated LLM re-verification with citation
- `buildVerificationPrompt()` — full fact-verification prompt

## System B — domain-BLIND (evidence-tiering/types.ts, 327 lines)

Has `tierBySourceKind(kind)` (lines 310-326). Source kinds:
```
apollo / apollo_cross / brain / substrate / substrate_quoted /
web_research / web_research_dated / csv_input / manual / fcc_bdc
```

These are **collection methods, not domains.** A `web_research` call can pull from t-mobile.com OR zoominfo.com and both are tagged `web_research` → ceiling `USE_TO_SHAPE`.

## How System B got the ZoomInfo data in

The workflow loaders (`load-email-workflow.ts`, `load-workflow-output.ts`) map upstream labels to SourceKind:
- `'press-release'` → `web_research_dated` (USE_DIRECTLY ceiling)
- `'media-contact'` → `web_research_dated` (USE_DIRECTLY ceiling)
- `'web-research'` → `web_research` (USE_TO_SHAPE)
- **DEFAULT for unknown:** `web_research` (USE_TO_SHAPE)

So an upstream agent doing "web research" on Zack Burnes that pulled `zoominfo.com/c/united-tel-supply-inc/356508170` and labeled it `source_kind: 'web-research'` would land in `sr_company_evidence` as `web_research` → `USE_TO_SHAPE` → composer-eligible for "shaping" — which is exactly how the Fiber Connect Orlando + COO recruiting claims (from ZoomInfo per audit) entered Zack's body.

## How System A would have caught it

If `verify-facts.ts` had been called on each evidence URL at ingestion:
- ZoomInfo URLs → Tier 3 → `safeForEmail: false` for quantitative claims
- LeadIQ URLs → would have been default Tier 3 → same blocking verdict
- Yelp URLs → would have been default Tier 3 → same

**System A has these blockers. System B doesn't. The pipeline runs System B.**

## Likely history (hypothesis)

`verify-facts.ts` was built earlier (4-tier domain-aware). The post-critique simplification on 2026-06-08 (per types.ts header) collapsed 4 tiers to 2 to reduce "LLM tier-consolidator" judgment and use pure deterministic rules. **But the deterministic rules used SourceKind (the collection method) not source domain.** Domain awareness was lost in the simplification.

verify-facts.ts wasn't deleted — it sits stranded, unused.

# Confirming this empirically (next step)

Query `sr_company_evidence` for the 5 strip-recomposed prospects and check:
1. What are the actual `source_citation` URLs stored?
2. Do they include zoominfo.com / leadiq.com / yelp.com?
3. What `source_kind` did the system assign them?
4. What `tier` would `tierBySourceKind()` give them?
5. What `tier` would `classifySourceTier()` give them?

# Frame

**Project intent:** Better cold prospecting than top 0.01% B2B SaaS AEs. 15-25% reply, 3-6% meeting. Scale to 800+ without trust degradation. Brain function actively learning from outcomes.

**OKRs (synthesis Section 7):**
- KR1 trust: 100% facts map to VERIFIED claims, 0 PROHIBITED sources, <5% inference language, 95%+ T1-T5
- KR2 send quality: bounce <3%, spam <0.1%, meeting >3% T1, reply >12% T1
- KR3 tempo: 30-60/AE/day, substrate refresh 30 days, Brain weekly
- KR4 empirical: 2+ active A/B variants, p<0.05 promotion
- KR5 Brain: L0/L1/L2/L3 active

# Files read so far

| File | Status | Key finding |
|---|---|---|
| evidence-tiering/types.ts | Done | 2-tier domain-blind model. tierBySourceKind() pure function. |
| evidence-tiering/send-confidence.ts | Done | 3-axis (ICP + email + substrate). v1.0-uncalibrated. Substrate axis uses use_directly_count, falls back to research_summary length. |
| evidence-tiering/orchestrator.ts | Done | 3-phase pull/gapfill/tier. Concatenates substrate + Apollo + FCC + gap-fill into one flat list. No domain check anywhere. |
| evidence-tiering/substrate-query.ts | Done | Pulls from sr_brain_substrate + sr_company_evidence + semantic fallback. Trusts source_kind labels from upstream. writeEvidence() does no validation. |
| substrate-harvester.ts | Done | ONLY harvests Doug Dawson blog + Community Broadband Bits. Both clean T5-T7. ZoomInfo did NOT come from this. |
| verify-facts.ts | Done | **STRANDED DOMAIN-AWARE TIER SYSTEM.** Has zoominfo/leadiq awareness. Not wired into orchestrator or composer. |
| load-email-workflow.ts | Done (grep) | Maps upstream workflow-output source labels to SourceKind. DEFAULT='web_research'. |
| load-workflow-output.ts | Done (grep) | Same — workflow loader. |
| scripts/enrich-substrate-news.ts | Pending | Not yet read — could be another contamination vector |

# What I still need to read (Phase 1 continues)

- composer-constraints.ts (43K — biggest file) — does the composer have any guardrails I'm missing?
- specific-composer.ts (large) — actual composer logic
- generalized-composer.ts (29K) — fallback composer
- composer.ts + lean-composer.ts (main composers)
- frame-registry.ts (18K) — claim → frame mapping
- refutation.ts — adversarial refutation
- judge.ts + judges.ts + cross-model-judge.ts + tiered-judge.ts — what judging actually catches
- preload-audit.ts + preload-verify.ts — does pre-load catch source tier?
- hubspot-loader.ts — anything in the HS load that could catch?
- brain-ingest.ts + brain-agentdb.ts — does the Brain function carry forward contamination?
- semantic-verifier.ts — what does this verify?
