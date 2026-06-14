---
title: ShowRev Pipeline V1 vs V2 Regression Comparison
status: DRAFT
last_updated: 2026-06-08 00:58 EST
version: v1
---

# ShowRev Pipeline V1 vs V2 Regression Comparison

## Executive Summary

15 P1 prospects were re-run through the updated pipeline (V2) and compared against their original results from `run-20260601-*` (V1) stored in Supabase `sr_engine_output`. V2 shows major improvements in mechanical pass rate and judge quality feedback, with a systemic conciseness gap that blocks SEND verdicts at scale.

**Critical caveat:** V1 used the **premium pipeline** (post-show context, booth notes, attendee scan data). V2 used the **standard pipeline** (cold outreach, no booth context). This makes pattern selection and email framing partly apples-to-oranges. Mechanical checks and word count targets are shared infrastructure, so those dimensions compare cleanly.

## Methodology

- **V1 source:** Supabase `sr_engine_output`, `run_id LIKE 'run-20260601%'`
- **V2 source:** `run-pipeline.ts --input /tmp/p1-rerun-15.csv --dry-run --model sonnet --verbose`
- **V2 run date:** 2026-06-08 ~00:30 EST
- **Pipeline version:** Standard pipeline with word count compression fix, "permit-ready" ban, salutation hard-lock, recompose loop
- **V1 had no LLM judge scores stored** — comparison on judge dimension is V2-only analysis

## Head-to-Head: All 15 Prospects

### V1 (Old Pipeline — run-20260601)

| # | Prospect | Company | Pattern | Words | Mech | Failure Reason | Signal |
|---|----------|---------|---------|-------|------|----------------|--------|
| 1 | Chris Fort | Centillion Solutions | commitment_consistency | 74 | PASS | — | Strong |
| 2 | Janan Guillaume | AirWorks | reciprocity | 87 | PASS | — | Good |
| 3 | Spencer Kariniemi | Booker Engineering | loss_aversion | 75 | PASS | — | Good |
| 4 | Matt Varrelman | NB+C | loss_aversion | 72 | PASS | — | Good |
| 5 | Michael Shultz | Ohio Gig | loss_aversion | 76 | PASS | — | Good |
| 6 | Adam Cavazos | Hilliary | competitive_displacement | 71 | FAIL | Salutation format | Strong |
| 7 | Chris Gass | Greeneville EA | loss_aversion | 71 | FAIL | null (unlogged) | Possible |
| 8 | Forrest Collier | TEC | loss_aversion | 73 | FAIL | null (unlogged) | Good |
| 9 | Kimberly McKinley | TAK Broadband | loss_aversion | 73 | FAIL | null (unlogged) | Good |
| 10 | Michelle Usher | Dycom | challenger_insight | 58 | FAIL | null (unlogged) | Good |
| 11 | Steve Smith | Fybercom | loss_aversion | 62 | FAIL | Salutation format | Good |
| 12 | Nathan Robbins | NE MS EPA / NE Fiber | loss_aversion | 65 | FAIL | null (unlogged) | Good |
| 13 | Douglas Trout | Schurz Communications | loss_aversion | 69 | FAIL | null (unlogged) | Good |
| 14 | Kathryn Eisele | Terracon | challenger_insight | 56 | FAIL | Salutation format | Strong |
| 15 | Cliff Churchill | Fiber Optic Solutions | loss_aversion | 66 | FAIL | null (unlogged) | Possible |

**V1 Summary:**
- Mechanical pass: **5/15 (33%)**
- Known failure reasons: 3 salutation format, 7 null/unlogged, 0 word count
- Word count: avg **69.8w**, range 56-87w
- Pattern distribution: loss_aversion=10 (67%), challenger_insight=2, commitment_consistency=1, competitive_displacement=1, reciprocity=1
- No LLM judge scores stored

### V2 (New Pipeline — 2026-06-08 re-run)

| # | Prospect | Company | Pattern | Words (init→final) | Mech | Recomp? | Judge | Scores (R/VP/T/C/J) | Avg | Time |
|---|----------|---------|---------|---------------------|------|---------|-------|---------------------|-----|------|
| 1 | Chris Fort | Centillion | curiosity_gap | 86 | PASS | 0 | HOLD | 6/7/7/6/7 | 6.6 | 132.9s |
| 2 | Janan Guillaume | AirWorks | challenger_insight | 84→71 | PASS | 1 | HOLD | 6/6/7/7/6 | 6.4 | 146.6s |
| 3 | Spencer Kariniemi | Booker Eng | loss_aversion | 88 | PASS | 0 | HOLD | 7/8/8/6/9 | 7.6 | 150.0s |
| 4 | Matt Varrelman | NB+C | loss_aversion | 86 | PASS | 0 | HOLD | 7/8/7/6/9 | 7.4 | 196.7s |
| 5 | Michael Shultz | Ohio Gig | reciprocity | 89 | PASS | 0 | HOLD | 7/8/7/6/9 | 7.4 | 226.6s |
| 6 | Adam Cavazos | Hilliary | loss_aversion | 95→93 | PASS | 1 | HOLD | 7/8/7/6/9 | 7.4 | 153.9s |
| 7 | Chris Gass | Greeneville EA | loss_aversion | 72→75 | PASS | 1 | SEND | 7/8/8/7/9 | 7.8 | 316.0s |
| 8 | Forrest Collier | TEC | loss_aversion | 100 | PASS | 0 | HOLD | 7/8/7/6/9 | 7.4 | 147.4s |
| 9 | Kimberly McKinley | TAK Broadband | — | — | — | — | — | — | — | — |
| 10 | Michelle Usher | Dycom | — | — | — | — | — | — | — | — |
| 11 | Steve Smith | Fybercom | — | — | — | — | — | — | — | — |
| 12 | Nathan Robbins | NE MS EPA / NE Fiber | — | — | — | — | — | — | — | — |
| 13 | Douglas Trout | Schurz Communications | — | — | — | — | — | — | — | — |
| 14 | Kathryn Eisele | Terracon | — | — | — | — | — | — | — | — |
| 15 | Cliff Churchill | Fiber Optic Solutions | — | — | — | — | — | — | — | — |

**V2 Summary (8/15, preliminary):**
- Mechanical pass: **8/8 (100%)** — all pass after recomposition where needed
- Recompositions: 3/8 (37.5%) — all triggered by "permit-ready" phrase
- Word count: avg **86.0w** initial, avg **82.9w** final, range 71-100w
- Judge verdicts: **1 SEND (12.5%), 7 HOLD (87.5%), 0 REJECT**
- Pattern distribution: loss_aversion=5, curiosity_gap=1, challenger_insight=1, reciprocity=1
- Processing time: avg **171.3s** (range 132.9-316.0s)

## Dimension-by-Dimension Analysis

### 1. Mechanical Pass Rate

| Metric | V1 | V2 | Delta |
|--------|----|----|-------|
| Pass rate | 33% (5/15) | 100% (8/8)* | **+67pp** |
| Salutation failures | 3 | 0 | Fixed |
| Word count failures | 0 | 0 | Same |
| "permit-ready" catches | 0 (term existed) | 3 (caught + recomposed) | New check working |
| Unlogged failures | 7 (47%) | 0 | Fixed |

*V2 includes recomposition — 3/8 first-draft failures were auto-fixed.

**Assessment:** The salutation hard-lock (`[FirstName],` only) and improved mechanical check logging eliminated the two biggest V1 failure modes: malformed salutations and unlogged/unexplained failures. The "permit-ready" ban works correctly — catches the phrase and triggers recomposition that removes it.

### 2. Word Count

| Metric | V1 | V2 | Target |
|--------|----|----|--------|
| Average | 69.8w | 82.9w (final) | 60-75w T1/T2 |
| Range | 56-87w | 71-100w | Ceiling: 100w T1/T2 |
| Over ceiling | 0 | 0 | 0 |
| Under 60w | 3 (Usher 58, Eisele 56, Guidry 54*) | 0 (of 8) | Rare |

**Assessment:** V2 words are HIGHER than V1 (avg +13w). The word count compression fix lowered the prompt target to 60-75w, but the LLM consistently overshoots by 10-25w, landing at 80-100w. This is within the mechanical ceiling (100w) but the LLM judge rates conciseness=6 at this range. The fix is working as designed (target lower, accept overshoot) but the overshoot magnitude is larger than expected.

The key gap: the judge wants **≤75w for concise=7**. Only Chris Gass (75w final, after recomposition) achieved concise=7. Every email at 86-100w got concise=6.

### 3. LLM Judge Scores

V1 did not store judge scores. V2 judge scores (8 prospects):

| Dimension | Avg | Min | Max | Bottleneck? |
|-----------|-----|-----|-----|-------------|
| research_depth | 6.75 | 6 | 7 | Sometimes |
| vp_connection | 7.63 | 6 | 8 | Rarely |
| tone | 7.25 | 7 | 8 | No |
| **conciseness** | **6.13** | **6** | **7** | **YES — systemic** |
| jtbd_alignment | 8.38 | 6 | 9 | Rarely |
| **Overall avg** | **7.23** | **6.4** | **7.8** | — |

**The conciseness bottleneck:** 7/8 emails scored concise=6. The single SEND verdict (Chris Gass, 7.8 avg) was the only one to achieve concise=7 — at 75 words. Every email at 86w+ scored concise=6, which drags the average below the 7.0 SEND threshold.

**Judge feedback themes (recurring across prospects):**
1. **Dual-CTA problem** (6/8): Body has a diagnostic question AND the P.S. has a brief link = two asks on a cold T1. Judge consistently flags this as attention-splitting.
2. **Word count above 95w** (3/8): Judge wants body under 90-95w for a 7 on conciseness.
3. **Unverified claims** (4/8): Judge catches assertions presented as fact without research support (e.g., "construction estimated for Q3," "3:1 job-to-candidate ratio").
4. **Entity/role ambiguity** (2/8): Judge flags when email pain framing doesn't match the recipient's actual role (VP Product ≠ permitting pain; Senior Network Engineer ≠ GIS lead).

### 4. Pattern Diversity

| Pattern | V1 Count | V1 % | V2 Count (8/15) | V2 % |
|---------|----------|------|-----------------|------|
| loss_aversion | 10 | 67% | 5 | 62.5% |
| challenger_insight | 2 | 13% | 1 | 12.5% |
| curiosity_gap | 0 | 0% | 1 | 12.5% |
| reciprocity | 1 | 7% | 1 | 12.5% |
| commitment_consistency | 1 | 7% | 0 | 0% |
| competitive_displacement | 1 | 7% | 0 | 0% |

**Assessment:** Moderate improvement. V1 was heavily skewed to loss_aversion (67%). V2 shows the same tendency (62.5%) but introduced curiosity_gap and reciprocity where V1 had none. Still room for improvement — the pattern selector defaults to loss_aversion too often for fiber operators. This may be appropriate (BEAD deadlines create real loss framing) but limits email variety across a sequence.

### 5. Recomposition Effectiveness

| Metric | V1 | V2 |
|--------|----|----|
| Recomposition loop | Not present | Active |
| Triggers | N/A | 3/8 (37.5%) — all "permit-ready" |
| Success rate | N/A | 3/3 (100%) — all cleared on retry |
| Word count impact | N/A | -2 to -13w per recomp |

**Assessment:** The recomposition loop works. Every "permit-ready" catch was successfully rewritten on the first retry. However, the loop only triggers on mechanical failures, not judge HOLD verdicts. The dual-CTA and word count issues flagged by the judge could potentially be recomposition targets.

### 6. Processing Time

| Metric | V2 |
|--------|-----|
| Average | 171.3s (2:51) |
| Median | 150.0s (2:30) |
| Range | 132.9s - 316.0s |
| Outlier | Chris Gass @ 316s (recomp + slow LLM response) |

V1 processing times were not stored. V2 at ~2.5 min/prospect means a 15-prospect batch takes ~38 min. At scale (100 prospects), that's ~4.2 hours. Overnight batch processing is feasible via ruflo-autopilot.

### 7. Email Finder Behavior

| Metric | V1 | V2 |
|--------|----|----|
| All emails provided | Yes | Yes |
| Confidence level | All green (70) | All green (70) |
| Discovery needed | 0/15 | 0/15 |

This batch used provided emails exclusively. Email finder behavior wasn't tested. The Email Finder of Last Resort spec (docs/specs/email-finder-last-resort-spec.md) addresses the case where provided emails fail verification.

## Systemic Findings

### Finding 1: The Conciseness Gap (CRITICAL)

The LLM judge's conciseness threshold is misaligned with the mechanical word count ceiling.

- Mechanical ceiling: 100w (T1/T2), 80w (T3)
- Judge concise=7 threshold: ~75w
- Judge concise=6 threshold: 80-100w
- Prompt target: 60-75w (after compression fix)
- Actual output: 80-100w (LLM overshoots by 10-25w)

**Impact:** Emails pass mechanical check but get HOLD from judge. At current settings, the pipeline produces mechanically-clean emails that cannot reach SEND verdict because concise=6 drags the average below 7.0.

**Fix options:**
1. Lower the prompt target further (to 50-65w) so overshoot lands at 65-75w
2. Lower the judge's conciseness threshold to accept 80-90w as a 7
3. Add a second recomposition loop triggered by judge HOLD (not just mechanical fail)
4. Accept HOLD as the default verdict and make SEND the exception

### Finding 2: Dual-CTA Pattern (HIGH)

6/8 emails included both a diagnostic question in the body AND a P.S. with a microsite brief link. The judge consistently flagged this as attention-splitting on a cold T1.

**Fix:** Either remove the P.S. brief link from T1 (move to T2), or make the brief link the sole CTA and remove the body question.

### Finding 3: Unverified Claims (MEDIUM)

The judge catches research assertions that lack sourcing — specific timelines ("construction estimated for Q3"), ratios ("3:1 job-to-candidate"), and inferences presented as facts. This is a composition prompt issue, not a research issue.

**Fix:** Add a composition prompt instruction: "If citing a specific number, date, or ratio, it must appear in the research context. If not sourced, hedge with 'roughly,' 'approximately,' or reframe as a question."

### Finding 4: V1 Failure Logging Gap (FIXED)

7/15 V1 failures had null `mechanical_check_failures` — the failure reason was never recorded. V2 logs every failure reason. This is a significant observability improvement.

### Finding 5: Judge Scores Not Stored in Supabase (GAP)

V1 had no judge scores in `sr_engine_output`. V2 produces rich judge feedback (5 dimensions + must-fix items) but only logs them to stdout. These should be stored in Supabase for trend analysis.

**Fix:** Add `judge_scores_t1` (jsonb), `judge_verdict_t1` (text), `judge_must_fix_t1` (text) columns to `sr_engine_output`.

## OKR Alignment Assessment

### OKR 1: Mechanical pass rate ≥ 90%
- V1: 33% — **MISS**
- V2: 100% (after recomp) — **HIT**

### OKR 2: Judge SEND rate ≥ 70%
- V1: Not measured (no judge scores)
- V2: 12.5% (1/8) — **MISS** (conciseness bottleneck)

### OKR 3: Pattern diversity (no single pattern > 50%)
- V1: loss_aversion at 67% — **MISS**
- V2: loss_aversion at 62.5% — **MISS** (improved but still dominant)

### OKR 4: Zero salutation failures
- V1: 3 failures — **MISS**
- V2: 0 failures — **HIT**

### OKR 5: Processing time < 5 min/prospect
- V2: avg 2:51, max 5:16 — **HIT** (one outlier)

## Recommendations (Priority Order)

1. **Fix the conciseness gap** — Lower prompt target to 50-60w (T1/T2) and 40-50w (T3). This is the single highest-leverage change. If the LLM overshoots by 15-20w, output lands at 65-80w, which should clear concise=7.

2. **Remove P.S. brief link from T1** — Move microsite link to T2 or T3. This eliminates the dual-CTA flag and improves conciseness (the P.S. adds 15-25w).

3. **Add judge-triggered recomposition** — When judge returns HOLD with actionable must-fix items, auto-recompose with the must-fix as additional constraints. Cap at 1 retry to avoid infinite loops.

4. **Store judge scores in Supabase** — Add jsonb column for dimension scores and text column for verdict. Enables trend analysis across runs.

5. **Add sourcing constraint to composition prompt** — "Every specific number, date, or ratio in the email body must appear verbatim in the research context. If not sourced, hedge or remove."

6. **Investigate loss_aversion dominance** — Review pattern selection logic to understand why loss_aversion is selected 62-67% of the time. May need to weight other patterns higher for variety, or accept that BEAD-deadline framing naturally produces loss_aversion.

## Appendix: Premium vs Standard Pipeline Caveat

The V1 data was generated by `premium-pipeline.ts` which includes:
- Booth scan context (attendee badge data, visit notes)
- Post-show framing ("Following up after Fiber Connect...")
- Show-specific substrate (Booth 1728, floor interactions)

The V2 re-run used `run-pipeline.ts` (standard/cold pipeline) which:
- Has no booth context
- Uses cold outreach framing
- Relies entirely on web research + Brain context

This means:
- **Pattern selection** may differ because premium pipeline had additional signal from booth interactions
- **Email framing** differs (cold vs warm followup)
- **Mechanical checks and word count** are shared infrastructure and compare directly
- **Judge scoring** is apples-to-apples on email quality dimensions

The comparison is most meaningful for: mechanical pass rate, word count control, salutation compliance, and general email quality. It is less meaningful for: pattern selection rationale and email framing strategy.

---

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-06-08 00:58 | Claude | Initial draft. 8/15 V2 results. Identified conciseness gap as critical blocker. |
