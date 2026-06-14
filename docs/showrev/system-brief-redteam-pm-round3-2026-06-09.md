---
title: PM red-team round 3 — Send Priority spec v2.1
status: DRAFT
last_updated: 2026-06-09 EST
author: Claude (PM/operator-trust lens)
version: v1
supersedes: none (companion to round-2)
---

## Verdict

**STILL NEEDS-REVISION.** v2.1 closes 2 of 3 round-2 PM issues but **measured distribution is worse than v2.** All 357 rows collapse into OK+HOLD+KILL. SEND is **empty** under today's halluc=NULL. The new "halluc_pts<1 AND raw≥7 → cap at 6" rule is so aggressive it strangles the SEND band until tier3 persistence ships. The score scale is still theater.

## Round-2 issues: resolved vs not

| # | R2 issue | v2.1 fix | Status |
|---|---|---|---|
| 5 | Halluc not persisted | New `tier3_hallucination_result` column + halluc_pts<1 cap | **RESOLVED in spec.** Backfill needed. Until then SEND is empty. |
| 6 | KILL never fires | KILL triggers: compose_failed OR icp_verdict≠pass OR raw<3 | **PARTIALLY.** Compose_failed fires on 3 rows. ICP-reject is dead (cohort pre-filtered, all icp_status=pass). Raw<3 never fires (floor is 3.9). |
| | 1-10 theater | Bands re-set 7/5/3/1 | **NOT RESOLVED.** Real range under today's halluc=NULL is **4-6.** Bands 7-10 are unreachable. Same theater, narrower window. |

## Measured v2.1 distribution (real 357 rows, halluc_pts=0.5)

Cross-tab (cc × icp × research) using current sr_engine_output:

| Band | Count | % | Composition |
|---|---|---|---|
| SEND (≥7) | **0** | **0%** | None — halluc-cap blocks all green/fit + green/leaning |
| OK (5-6) | 350 | 98.0% | 106 g/lean + 27 g/fit + 38 r/fit + 185 r/lean (all 350 with body_sentences) |
| HOLD (3-4) | 4 | 1.1% | rows without parseable claim_ids + 1 r/null |
| KILL (1-2) | 3 | 0.8% | compose_failed (email_body_t1 empty) |
| MUST_NOT_SEND | 0 | 0% | No DNC match, no halluc=fail (column absent) |

**v2.1 is WORSE than v2 today.** v2 had 15.7% SEND. v2.1 has 0%. The halluc cap is correct in principle but premature without persisted tier3.

## Tooltip walk-through

| Tooltip | Operator read | Verdict |
|---|---|---|
| SEND-9: "Green email at confirmed multi-state operator; 3 dated cites verified." | Sales-defensible. Concrete, repeatable. | ✅ Buys it |
| OK-6 (substrate_contradiction): "Green email at confirmed multi-state operator — prospect's own positioning contradicts our default frame. Re-frame before sending." | Operator-defensible IF the keyword list is curated by Tim. But "default frame" is internal jargon — AE will ask "what frame, what's the re-frame?" | ⚠️ Borderline. Needs "see prospect substrate: [keyword found]" |
| HOLD-4 (numeric_mismatch): "Email cites a number that does not match the source. Verify before sending." | Better than v2's HOLD. Names the problem. But doesn't say WHICH number or WHICH cite — AE has to hunt. | ⚠️ Borderline. Should surface body number + claim number side-by-side |

## Compose_failed → KILL trust

**Operator-understandable.** Tooltip "Pipeline error — see system_brief for technical details" is honest. But 3 of 3 today have email_body_t1 empty — operator will reasonably ask "why did pipeline break?" Spec needs the system_brief surface to include the failure mode, or KILL becomes a black box. Add: tooltip should include the failure reason from system_brief when available.

## Weights (35/30/25/10) — justified?

**Still arbitrary.** Spec calls weights "weighted-sum" but provides no rationale tying weight magnitude to business cost. Round-2 recommended either documenting principle (bounce=sender-rep=highest-cost) or decision tree. v2.1 did neither. The cap stack now does most of the work — caps fire 4 times, weighted-sum just sorts within bands. Recommend: **drop the weights, drive bands purely from a decision tree on (cc, icp, research, halluc, flags).** Tree is operator-defensible; polynomial isn't.

## New trust risks in v2.1

1. **Halluc-cap is too aggressive pre-backfill.** Until tier3 lands and backfill runs, ZERO rows can reach SEND. AE will see all-OK portal and lose trust in the bands. Either gate the cap behind "halluc column populated" OR run backfill BEFORE migration deploy.
2. **Compose_failed surface is 3 rows of mystery.** KILL tooltip must include the actual failure reason or operator loses confidence.
3. **WC3 contradiction keyword list is 7 strings, hand-curated.** False-negatives will dominate. Needs operator-edit workflow (PR-only is friction).
4. **icp_verdict KILL is dead trigger.** All 357 rows pre-filtered to icp_status=pass. Trigger is theater on this cohort. Acceptable if next cohort includes rejects; flag it explicitly.

## Recommend before build

1. **Backfill tier3_hallucination_result BEFORE migration ships.** Otherwise SEND band is empty Day 1.
2. **Replace weighted-sum with decision tree.** Operator-defensible.
3. **Tooltip surfaces failure detail** for KILL + numeric_mismatch + contradiction (which number, which cite, which keyword).
4. **Document that icp_verdict KILL is dormant on pre-filtered cohorts.**

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Round-3 PM red-team against v2.1 with measured 357-row data |
