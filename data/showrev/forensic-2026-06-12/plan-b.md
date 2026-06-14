---
title: Plan B — Holy Grail System Architecture
date: 2026-06-12
status: VISION DRAFT for operator + judge panel
authored_by: Claude (Opus 4.7)
purpose: 1-3 week architecture work that turns the system into compounding advantage. What separates this from "another cold email tool."
---

# Goal

Build a substrate verification + composer architecture where:
- Every shipped claim has a provenance chain back to a primary source
- Every shipped sentence has sentence-level attribution
- The Brain function compounds learning from every outcome
- The system can self-audit and refuse to send when confidence drops
- Cross-source corroboration is first-class, not a special case
- At 5,000 prospects per quarter, the operating cost per high-quality send drops because Brain rules accumulate

# 9 capabilities

## B1 — `sr_claim_verifications` table (per-claim verdict pipeline)

Every claim that enters substrate gets a verification record:

```
sr_claim_verifications:
  id (text PK), claim_id (text FK → sr_company_evidence.id)
  source_url, source_domain, source_tier (1-4 + PROHIBITED)
  source_date, http_status, content_match (bool), matched_distinctive_terms (text[])
  verdict (VERIFIED / DEAD-URL / CONTENT-MISMATCH / PROHIBITED-SOURCE / STALE)
  verified_at, next_recheck_at, recheck_interval_days
  cross_source_count (int), cross_source_urls (text[])
```

Composer reads only `verdict = 'VERIFIED'` AND `verified_at + recheck_interval_days > NOW()` claims. Stale claims auto-trigger re-verification. The recheck cycle is per-tier: T1 = 30 days, T2 = 60 days, T3 = 90 days.

## B2 — Sentence-level attribution end-to-end

The data model already supports it (`AttributedSentence`, `ComposedEmail.bodySentences`). Plan B populates it.

For every composed body sentence, the composer emits:
- `text`: the sentence
- `claim_ids`: list of `sr_claim_verifications.id` values the sentence draws from

Portal renders click-sentence-see-source. Operator can click any sentence to see the primary URL.

**No sentence ships without ≥1 verified claim_id OR a "no-claim industry-framing" tag.**

## B3 — Composer state machine with substrate-strict mode

```
substrate-strict mode (NEW):
  Mode is selected by orchestrator based on tierCounts:
    >= 3 verified USE_DIRECTLY claims → 'specific'
    1-2 verified USE_DIRECTLY claims  → 'hybrid' (industry frame + 1-2 anchors)
    0 verified USE_DIRECTLY claims    → 'generalized' (industry frame only)

In substrate-strict mode:
  - Composer prompt explicitly lists allowed claims with verified status
  - Refusal mode: if composer tries to add specifics not in allowed list, output is rejected and re-composed
  - Inference-modifier list ("active mode", "full capture", etc.) is rejected at composer-output validation
  - Every numeric/named claim must map to a claim_id
```

## B4 — Brain learning loop active (L0-L3)

| Brain layer | What | Update cadence | Composer impact |
|---|---|---|---|
| **L0 Universal** | Cold email best practices, anti-patterns, source classification, composer rules | Operator-curated, rare changes | Composer system prompt |
| **L1 Per-prospect substrate** | sr_company_evidence rows + sr_claim_verifications | Per-prospect on harvest + per-claim on recheck cycle | Composer reads via getCompanyEvidence |
| **L2 Per-pattern learnings** | Reply rate by source tier × persona × send window × subject pattern × inference language presence | Weekly recompute from sr_email_experiments + sr_outcomes | Composer rules auto-adjust |
| **L3 Composer rules (auto-derived)** | When to use specific vs generalized, which anchor patterns work for which personas, A/B winning structures | Monthly from L2 statistical significance | Composer prompt + template selection |

Implementation: scheduled job (cron daily at 4am ET) runs L2 recompute. L3 rules update on Sundays. Brain rules log all changes to `sr_decision_trace` so operator can audit "why did the composer suddenly use shorter subjects?"

## B5 — Cross-source corroboration as first-class

Replace `apollo_cross` special case with generalized cross-source rule:

```
At write time:
  When inserting a claim with matching distinctive terms to an existing claim:
    - If the existing claim was from a different domain AND domain_tier ≥ 2 on both:
      → Mark new claim with cross_source: true, cross_source_count++
      → Tier promotion: if both individually USE_TO_SHAPE, jointly become USE_DIRECTLY_CROSS
      → composer treats USE_DIRECTLY_CROSS as authoritative
```

This is the right model: a claim that 2 trade press orgs agree on within 12 months is more authoritative than a single corporate press release. Real-world facts have this multi-source-corroboration shape; the data model should reflect it.

## B6 — Live FCC BDC ingestion

Per existing `getFccCoverage()` scaffold. FCC BDC data is regulatory T1 — fiber location counts, technology codes, growth deltas per snapshot. Currently scaffold returns null because table is empty.

Plan B: run the ~30 GB BDC bulk download, populate `fcc_bdc_coverage` + `fcc_bdc_provider_summary` tables, schedule semi-annual refresh. Every fiber prospect gets a high-trust authoritative anchor without manual research.

## B7 — AI-tell hardening (DL-199 recommendation)

From open-loops: VERMILLION Framework + PNAS 2025 + B2B practitioner findings. 3 checks before send:
1. **Echoed sentence structures** — adjacent sentences mirroring grammatical rhythm
2. **Participial clause density** — flag if >1 present-participial opener per body
3. **Sentence-length variance** — std-dev check; low variance = AI tell

Adds to mechanical_check_failures. Composer re-prompted with "vary structure" hint if any check trips.

## B8 — Sender identity rotation + reputation defense

Per send-confidence's hard zero rule: domain reputation is the meta-layer. Plan B adds:
- Per-AE per-day daily-cap enforcement at the send layer (already in send-cap-monitor; tighten)
- SPF/DKIM/DMARC continuous monitoring (alert on drift)
- Open/reply pattern outlier detection (a single AE's open rate dropping 30%+ → flag for human review)
- Sender warm-up tracking for any new inorsa.com sub-domains
- Reply-thread routing: AE-personal reply-tos that route to a monitored inbox

## B9 — Portal as control plane (not just dashboard)

Today the portal shows confidence scores and lets operator dispose prospects. Plan B promotes it to a control plane:
- Brain rule edit UI — operator can tune which patterns L3 promotes
- Per-cohort analytics — reply rate by tier × persona × send window with statistical confidence intervals
- A/B configuration — declare variants in UI, system handles assignment + significance test
- Operator notes that train Brain — "we don't reach out to e-coops in summer" becomes an L0 rule

# Sequencing (if Plan B greenlit)

| Phase | Weeks | Deliverable | Depends on |
|---|---|---|---|
| Phase 1 | 1 | B1 `sr_claim_verifications` schema + verifier daemon + backfill | Plan A complete |
| Phase 2 | 2 | B2 sentence-level attribution wired end-to-end | B1 |
| Phase 3 | 2 | B3 composer state machine + substrate-strict mode | B2 |
| Phase 4 | 3 | B4 Brain learning loop L0/L1/L2/L3 active | B3, first 500 emails sent (needed for L2 data) |
| Phase 5 | 2 | B5 cross-source corroboration generalized | B1, B2 |
| Phase 6 | 3 | B6 FCC BDC bulk ingestion + cohort enrichment | parallel — operator-authorized download |
| Phase 7 | 1 | B7 AI-tell hardening | B3 |
| Phase 8 | 2 | B8 sender reputation defense layer | parallel |
| Phase 9 | 4 | B9 portal as control plane | B4 (depends on Brain rules existing to surface) |

Total: ~16-20 weeks if serial. Heavy parallelization brings it to ~10-12 weeks.

# Strategic value

| Capability | Compounding effect |
|---|---|
| sr_claim_verifications | Every prospect researched once → re-verifiable forever. Cost per prospect drops over time. |
| Sentence-level attribution | Tim and operator stop checking facts manually. Click-sentence-see-source replaces audit. |
| Substrate-strict composer | Bad data physically can't reach the email. The trust crisis is structurally impossible. |
| Brain learning loop | Reply rate improvement is monotonic with volume. At 5K prospects/quarter, the system gets sharper every week. |
| Cross-source corroboration | Defensible specifics increase per prospect. Tier promotion is data-driven, not LLM-judged. |
| FCC BDC | Every fiber prospect has a T1 anchor without research. Substrate cost drops to zero per prospect. |
| AI-tell hardening | Reply rates trend up; spam complaints trend down. Sender reputation compounds. |
| Sender reputation defense | The 800 → 5,000 → 50,000-prospect path is structurally available. |
| Portal as control plane | Operator goes from approver to system tuner. Time per prospect drops 10x. |

**At 5,000 prospects per quarter with Plan B, the marginal cost per HIGH-QUALITY send is lower than the marginal cost per LOW-QUALITY template send is today.** That's the compounding moat.

# Open questions

1. **Plan B parallel or sequential to Plan A?** Plan A unblocks T1 P2. Plan B is the moat. They can be parallel if we have the bandwidth.
2. **Who builds Plan B?** Candidate: Fable 5 deployed on B1 + B2 (the sr_claim_verifications + sentence-level attribution work). See Fable-5-candidate.md.
3. **What's the success metric for Plan B?** Reply rate trajectory beats T2 baseline by 50%+ at week 4. Cost per send drops 30%+ by week 8. No PROHIBITED claim in any shipped email since launch.
4. **What changes for Inorsa's pilot?** Inorsa sees the live portal as control plane. They become a reference. Strategic positioning for the next 5 enterprise pilots.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:15 | Claude (Opus 4.7, fresh session) | Initial Plan B. 9 capabilities, 16-20 week serial / 10-12 week parallel. |
