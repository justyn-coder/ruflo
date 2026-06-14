---
title: PM red-team round 2 — Send Priority spec v2
status: DRAFT
last_updated: 2026-06-09 EST
author: Claude (PM/operator-trust lens)
version: v1
supersedes: none (companion to round-1)
---

## Verdict

**STILL NEEDS-REVISION.** v2 fixed the audit-trail + cite-validation + email-binary issues cleanly, but the headline PM finding from round-1 — "the band is sorting data quality, not prospects" — is NOT resolved against real data. Predicted 25/35/30/5/5 is wrong by a wide margin.

## Round-1 issues: resolved vs not

| # | Round-1 issue | v2 fix | Status |
|---|---|---|---|
| 1 | 52% HOLD on real data | Re-banded SEND≥7 / OK 5-6 / HOLD 3-4 | **NOT RESOLVED.** Measured: HOLD = 40.1% (was 51.8%). Marginal shift, same root cause: red+leaning_fit dominates the cohort, scores at 3.9 |
| 2 | Email confidence binary in reality | Collapsed to 2 levels (green=3, red=1) | **RESOLVED** |
| 3 | Tooltip robotic | Templated sales sentence | **RESOLVED** (subject to example check below) |
| 4 | `priority_weakest` noise | Cut | **RESOLVED** |
| 5 | HOLD Approve enabled | HOLD disables Approve | **PARTIALLY RESOLVED** — see Q4 below |
| 6 | Hallucination silent fail | null=caution / pass=verified / fail=MUST_NOT_SEND | **RESOLVED in spec, BROKEN in practice.** No `tier3Hallucination` column on `sr_engine_output`. Every existing row scores at halluc=0.5. The 10% halluc weight is dead weight until persistence lands. Critical gap. |

## Measured band distribution vs predicted

Real run, all 357 rows, v2 formula exactly as written, halluc_pts = 0.5 (NULL — what production sees today):

| Band | Predicted | Actual | Delta |
|---|---|---|---|
| SEND | 25% | **15.7%** (n=56) | −9.3 |
| OK | 35% | **44.3%** (n=158) | +9.3 |
| HOLD | 30% | **40.1%** (n=143) | +10.1 |
| KILL | 5% | **0%** (n=0) | −5 |
| MUST_NOT_SEND | 5% | **0%** (n=0, no halluc column) | −5 |

Score range used: **3-7 only.** Bands 1, 2, 8, 9, 10 NEVER FIRE on real data. The 1-10 scale is theatre — it's a 3-7 scale.

Root cause: 142 rows (40%) sit at exactly raw=3.90 (red+leaning_fit+research=1+halluc=0.5). The v2 formula isn't sorting these; it's just labeling "your data is mid".

## Walk-through: 3 v2 tooltip examples

| Example | Tooltip | PM judgment |
|---|---|---|
| SEND 9: "Green email at confirmed multi-state operator; cites 3 dated sources." | Sales-defensible. AE can repeat this in a 1:1. **Buys it.** | ✅ |
| OK 6: "Green email at leaning-fit operator; substrate present but only 1 dated source." | OK. But "leaning-fit" is jargon — operator will ask "what's leaning vs fit?" Tooltip exposes internal taxonomy. **Borderline.** | ⚠️ |
| HOLD 4: "Email pattern unverified. Hold." | Too thin. Doesn't tell AE WHY held or what would unblock. Operator will ask "unverified how?" **Doesn't buy it.** | ❌ |

Verdict: SEND tooltip works. OK leaks jargon. HOLD is uninformative. Spec needs concrete "what would move this to OK?" hint in HOLD/KILL tooltips.

## Trust-defensibility of weights (35/30/25/10)

**Justyn-defensible? Marginal.** Spec says "weights chosen so a clean prospect lands at ~8.4 (SEND)". That's reverse-engineered from a target score, not derived from a business principle. Operator question "why is email 35% and not 40%?" has no answer. Recommend either: (a) document the principle ("email failure = bounce = sender reputation = highest cost"), or (b) drop weighted-sum entirely and use a decision tree (red email → max OK; halluc fail → MUST_NOT_SEND; rest → SEND). A tree is easier to defend than a 4-term polynomial.

## Approve-disabled-on-HOLD: paternalistic?

Defensible. Operator's stated bar is "bad data → client harm" (`feedback_preload_verification_required`). Sender domain protection > AE autonomy in the first 50. Keep disabled-by-default. Document the CLI override path so it's not a dead end.

## `priority_version` + `inputs_snapshot`: trust or theater?

**Trust, not theater.** When a SEND-9 row bounces in week 2 and operator asks "what scored this 9?", the snapshot answers it in one query. Worth the column cost. Keep.

## New trust risks (v2-specific)

1. **Halluc column doesn't exist in DB.** v2 references `tier3Hallucination` but it's not persisted on `sr_engine_output`. The 10% weight is dead until persistence ships. Either persist it FIRST or remove from v2 and re-add later.
2. **Score scale theatre.** Real range is 3-7. The 1-10 surface implies precision that doesn't exist. Either narrow to 1-5 or document that 8-10 is reserved for when halluc=pass lands.
3. **KILL never fires** = system can't say "don't send". Defeats the safety promise. KILL needs a real trigger (e.g., red email + null ICP + generalized research).

## Recommend before build

1. Persist `tier3Hallucination.verdict` to `sr_engine_output` FIRST. Without it, halluc_pts is constant.
2. Define KILL trigger that actually fires (e.g., score ≤ 4 AND red email).
3. Strengthen HOLD/KILL tooltips with "what would unblock this" hint.
4. Document weight rationale in one sentence ("email weighted highest because bounce = domain reputation").

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 | Claude | Round-2 PM red-team against measured data |
