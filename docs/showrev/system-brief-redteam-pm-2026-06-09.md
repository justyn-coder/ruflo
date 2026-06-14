---
title: PM red-team — Send Priority spec v1
status: DRAFT
last_updated: 2026-06-09 14:00 EST
author: Claude (PM/operator-trust lens)
version: v1
---

## PM verdict

**NEEDS-REVISION.** The formula is defensible and deterministic, which is the right foundation. But three things will erode operator trust in the first 50 sends: (1) the band thresholds were set in the abstract, not against actual data — running them on the 357 existing `sr_engine_output` rows predicts ~52% land in HOLD and ~0% in KILL, which means the band is doing the work of saying "your data is bad", not "this prospect is bad" (operator's stated bar: "bad data → client reputation harm", `feedback_preload_verification_required` 2026-06-02); (2) the email-confidence dimension is a 2-state field in reality (green/red, no amber/yellow exist in the DB), so the 4-point granularity is theatre; (3) the tooltip "Email: green; ICP: fit; Research: 2 cites" answers WHAT but not WHY — a non-engineer cannot defend a 7-vs-9 distinction from that string in a 1:1.

## Trust failure modes

1. **Red-email leaning-fit prospects scoring 5 (HOLD) get sent anyway because operator overrides — then bounces hit sender domain.** First-50 manifestation: 26 of the first 50 (52%) show HOLD, AE feels "the system is too pessimistic", clicks Approve on a red-email row, bounce lands → `feedback_preload_verification_required` violation, operator faith gone. Mitigation: HOLD should disable Approve OR auto-strip red-email rows pre-portal.
2. **Two prospects with materially different fit get the same score 8.** First-50 manifestation: green+leaning_fit (8) sits next to a hypothetical green+fit-with-only-1-cite (8). AE asks "which do I send first?", system has no answer. Score collisions in the OK band will be ~40% of the cohort.
3. **`priority_weakest = "research"` for 350 of 357 prospects is constant noise.** First-50: every tooltip says "weakest: email" because red dominates. The column adds zero discriminating info and erodes the "less is more" principle (operator quote, intent line in spec).
4. **Amber/yellow email_pts levels (2-3) never fire** because the substrate only emits green/red. The 4-point email scale implies precision the data can't deliver. First-50: operator notices every email_pts is 4 or 1 → "why is this a 1-10 scale if it's really a coin flip on email?"
5. **Hallucination-fail rows could still score 9.** Spec says safety flags are SEPARATE — correct architecturally — but a SEND badge next to a ⚠️ Hallucination warning is cognitively confusing and AEs WILL fold them mentally. First-50: a 9-SEND-with-⚠️ trains the AE to ignore the badge.

## Band-threshold sanity check

Predicted distribution against the 357 existing `sr_engine_output` rows (queried slttpknnuthbttjuzrnz, 2026-06-09):

| Cohort | n | % | raw_score | rounded | band |
|---|---|---|---|---|---|
| green + fit + specific/cites | 27 | 7.6% | 8.5 | 9 | SEND |
| green + leaning_fit + specific/cites | 106 | 29.7% | 7.75 | 8 | OK |
| red + fit + specific/cites | 38 | 10.6% | 5.5 | 6 | OK |
| red + leaning_fit + specific/cites | 185 | 51.8% | 4.75 | 5 | HOLD |
| other (null verdict, etc.) | 1 | 0.3% | — | — | — |

**Predicted bands: SEND 8%, OK 40%, HOLD 52%, KILL 0%.**

This is not a realistic cohort distribution — it's a data-quality distribution. The system isn't sorting prospects, it's sorting which rows have a verified email. KILL never fires because composer_mode is always `specific` (352/356) and claim_ids are always present (350/356). The HOLD band is entirely "red email + leaning_fit ICP", which is a binary, not a 5-point judgment.

## AE-usability score

- **Scan + decide in 5s? Partially Y for SEND (8% of rows), N for OK (40%).** Green SEND badge is unambiguous. The OK band collapses prospects with very different underlying signals into score 6, 7, 8 with no obvious ordering — AE will hover every row, breaking the 5s rule.
- **"Why is this a 7?" answerable from tooltip? N.** Tooltip says inputs, not weights. An AE sees "Email: green; ICP: leaning_fit; Research: 2 cites" → score 8. They cannot derive "why not 9" without knowing 4×1.0 + 2×0.75 + 3×0.75 = 7.75 and that fit (not leaning_fit) is the missing point. That's an engineering explanation, not a sales one.

## Recommendations (before build)

1. **Re-band against real data.** Cap HOLD at <20% of cohort (operator wants "start with the very best", not "show all the rejects"). Suggested: SEND ≥8, OK 6-7, HOLD ≤5. Or drop bands entirely and just sort by score.
2. **Collapse email_pts to 2 levels (green=4, red=1).** Stop pretending amber/yellow exists until the substrate emits them. Document as a v2 expansion point.
3. **Cut `priority_weakest`.** It's near-constant ("email") and adds no decision value. Open question #4 in the spec already flags this — answer is cut.
4. **Re-write the tooltip as a sales sentence, not a field dump.** Example: "Verified email + strong ICP fit (founder of a Tier-1 BDC)" for a 9. "Best-guess email — hold until we re-verify" for a 5. Templated still, but operator-defensible. The current "Email: green; ICP: fit; Research: 2 cites" violates "sound human-written" bar (operator intent line, spec).
5. **HOLD should disable Approve by default.** Force the override. This protects sender domain even when AE is fatigued. Spec's open question #3 — answer is yes.
6. **Pre-strip the portal.** Don't show KILL/HOLD at all in v1. Operator quote: "Less is more — only show what we can trust." Show only OK + SEND in the portal; HOLD rows go to a separate "needs verify" queue.
7. **Show the gap, not the absolute score.** "7 (held back by red email)" beats "7". Generated from `priority_weakest`-style logic but as plain English, not a column.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-09 14:00 | Claude | Initial PM red-team |
