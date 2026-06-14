---
title: Adversarial red-team — Send Priority spec v1
status: DRAFT
author: Claude (skeptic lens)
date: 2026-06-09
---

## Adversarial verdict

**NEEDS-REVISION.** The formula is deterministic and the safety-flags-beside-score design is sound. But three structural holes let known-fabricated emails reach SEND-tier scores: (1) "specific + 2 cites" earns max research_pts even when the cited claim_ids resolve to broken evidence (the 7 known-broken P3A ids), (2) `hallucination_fail` only fires on tier3 verdict='fail' — silent fabrications that didn't trip tier3 stay green, (3) the formula has no penalty for substrate contradictions (ALLO/Finley pattern). Today's 60% fabrication finding on zero-cite emails is partially mitigated (composer_mode=specific + 0 cites → research_pts=1), but a single fabricated cite gets the prospect to research_pts=2 — same score as a legitimate one. Ship after hardening cite-resolution + adding a contradiction flag.

## Worst-case prospect constructions

**Case 1 — green SMTP catch-all + leaning_fit + 1 cite:**
- email_pts=4, icp_pts=2, research_pts=2
- raw = 4.0 + 1.5 + 1.5 = **7.0 → OK band, yellow badge**
- AE behavior: yellow badge + no hallucination flag → likely sends. Catch-all means MV "risky" but spec doesn't read MV. Harm: bounce risk to sender domain, leaning_fit means borderline ICP. **Moderate harm.**

**Case 2 — amber Apollo-guessed + fit + 3 cites:**
- email_pts=3, icp_pts=3, research_pts=3
- raw = 3.0 + 2.25 + 2.25 = **7.5 → 8 OK band**
- Lower email confidence than Case 1, but better ICP+research lifts it higher. Reasonable.

**Case 3 — green + fit + 5 cites, one cite is the fabricated 40-50% stat:**
- email_pts=4, icp_pts=3, research_pts=3
- raw = 4.0 + 2.25 + 2.25 = **8.5 → 9 SEND band, green badge**
- Hallucination flag only fires if tier3 caught it. The 60% finding says tier3 misses most. **High harm** — client sends polished email with fabricated industry stat to a real fit prospect. Reputation damage on first impression.

## Hallucination escape paths

1. **Cite-count without cite-validation.** Spec counts `claim_id` references but doesn't verify the id resolves to a non-broken P3A library entry. Fix: research_pts requires `cite_resolves=true AND cite_not_in_broken_set`.
2. **tier3Hallucination silent passes.** Verdict='pass' or null both → no flag. Fix: treat null as 'unverified', soft-warn.
3. **Composer-mode='specific' with generic claim_ids.** A claim_id pointing to a generic industry stat (not prospect-specific) still scores 3. Fix: require claim_source_type='prospect_specific'.
4. **Contradictions invisible.** ALLO/Finley-style hard contradictions in substrate don't penalize. Fix: add `substrate_contradiction` flag.

## NULL/missing input gaming

- `icp_volume_verdict=null` defaults to 1 pt (miss-equivalent) — safe.
- `confidence_color=null` not specified — undefined behavior. Likely defaults to 1, but should be explicit.
- `composer_mode=null` not in mapping — falls to default (1?). Should be explicit.
- **Game vector**: an AE with DB write access could flip `icp_volume_verdict` from `leaning_fit` to `fit` (+0.75 to score), or bump cite count by inserting claim_ids. No audit trail in spec. Fix: snapshot inputs into `priority_inputs_hash` at compute time; recompute on display and flag drift.

## Substrate-quality realism check

- **7 broken P3A evidence_ids**: spec does NOT account. A prospect citing a broken id gets full research_pts=3. This is the single biggest hole.
- **ALLO/Finley contradiction pattern**: spec does NOT acknowledge. Two contradictory cites cancel epistemically but score additively. Fix: P3B contradiction-detector output as `substrate_contradiction` flag (beside score, not folded in — matches existing pattern).
- The "deferred to v2" note about distinct-source-count waiting for "Phase 3A library will need fixing" tacitly admits the substrate is broken NOW — but ships the score now anyway. That's the tell.

## Strongest 3 concerns (prioritized)

1. **FIX BEFORE BUILD — broken-cite resolution.** research_pts must validate that cited claim_ids exist and aren't in the 7-broken-id set. Otherwise Case 3 ships at score 9. ~1hr work: join against P3A library + broken-id list.
2. **FIX BEFORE BUILD — contradiction flag.** Add `substrate_contradiction` safety flag beside score (same pattern as `hallucination_fail`). Otherwise ALLO/Finley pattern produces high-confidence wrong sends.
3. **NOTED FOR V2 — input audit trail.** Hash inputs at compute; show hash in tooltip. Detects DB tampering. Lower priority because current AE workflow doesn't suggest gaming intent, but needed before multi-AE rollout.

Also worth fixing before build (cheap): explicit null-handling rows in mapping table; treat tier3 verdict=null as soft-warn not silent-pass.
