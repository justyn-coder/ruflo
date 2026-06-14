---
title: Fable 5 Deployment Candidate — Holy Grail Substrate Rebuild
date: 2026-06-12
status: PROPOSAL for operator decision
authored_by: Claude (Opus 4.7)
purpose: A genuinely hard, big, autonomous problem for Fable 5 with clear hard-stop criteria and a verification gate
---

# The candidate problem

**Build Plan B's B1 + B2 in one Fable 5 run, then re-substrate the entire 800-prospect P2 cold cohort against the new architecture.**

In one sentence: *give Fable the goal of "every shipped claim has a provenance chain back to a primary source, every shipped sentence has sentence-level attribution," then let it figure out the work.*

# Why this fits Fable 5

| Fable 5 strength | This problem's shape |
|---|---|
| Low-detail prompts with environment discovery | Spec exists in Plan B but is high-level — Fable has to read the codebase to find where to wire claim_id into composer prompts, how AttributedSentence integrates with sr_engine_output, where the existing tests live, etc. |
| Long autonomous work | Re-substrate of 800 prospects with multi-source verification is genuinely days of work — autonomous research, claim extraction, cross-source matching, primary-source URL-fetch with content-match check, dedup |
| Multi-file changes | B1 (table schema + verifier daemon) + B2 (composer attribution + portal display) touches ~12 files |
| Discovery-driven | Plan B says "wire sentence-level attribution end-to-end" — but the end-to-end path isn't fully traced. Fable has to discover it |

# Why the operator should consider this (vs. Claude Code Opus)

- This is a 3-5 day continuous task. Opus sessions break across context limits. Fable 5 carries forward.
- Quality-apex with a hard verification gate. Fable's "keep going till done" trait fits perfectly when "done" is provable.
- Cost-controlled by the gate (not by token budget). The gate IS the budget.

# Hard stop criteria (so Fable doesn't run forever burning budget)

Fable must STOP and surface to operator when ANY of these fire:

1. **A claim has 0 corroborating primary sources after 3 research attempts** — surface for human decision (drop the prospect? or accept a single T2 source?)
2. **A new domain appears that isn't in the canonical T1/T2/T3 lists** — operator must classify it (is t-mobile.com T1 or T2? is themountainbuzz.com T6 or PROHIBITED?). Don't guess.
3. **Composer state machine refuses to produce a body for >40% of prospects in a batch** — substrate is too thin; surface the cohort for re-research strategy decision
4. **Any test in `evidence-tiering/tests/` fails after a code change** — block until human reviews
5. **24 hours of work elapsed with no checkpoint commit** — surface progress for operator review
6. **Token budget over $100 in a single batch run** — surface for budget approval to continue
7. **Database write rate > 1000 rows/minute sustained** — pause, verify nothing's looping

# Verification gate (the success criterion)

Fable's work is "done" when:

1. `sr_claim_verifications` table is populated for every `sr_company_evidence` row referenced by a `sr_engine_output` row
2. Every `sr_engine_output.email_body_t1` sentence has ≥1 `claim_id` in its `AttributedSentence` OR a `no_claim_industry_framing` tag
3. **Zero PROHIBITED-domain claims surface in any `getCompanyEvidence()` call across a 100-prospect test cohort**
4. Composer state machine selects `'specific' | 'hybrid' | 'generalized'` correctly per dossier (verified against 20 hand-graded cases)
5. Portal renders click-sentence-see-source for 10 spot-checked prospects
6. All `evidence-tiering/tests/` pass + new tests for sr_claim_verifications + AttributedSentence
7. End-to-end smoke: 5 prospects re-run through new pipeline produce bodies where every numeric/named claim maps to a `claim_id` in `sr_claim_verifications` with `verdict = 'VERIFIED'`

# What Claude Code's role is during this

- **Hand-off prep:** I (Opus) prepare the Plan B spec in enough detail Fable can act on it without re-deriving design decisions.
- **Mid-run review:** Operator + I check Fable's checkpoints at 24-hour intervals. Catch wrong-direction work early.
- **Acceptance review:** When Fable declares "done", I run the verification gate criteria against the live system.
- **Fallback:** If Fable hits an unsolvable architectural blocker, I take over the specific blocker.

# Cost guardrails

- Budget cap: operator declares a token ceiling up front (suggested: $200 for the full run).
- Spend dashboard: per-day spend visible to operator.
- Auto-pause at 80% budget: Fable surfaces remaining work and asks "extend budget or stop?"

# Alternative candidate (smaller scope)

If a 3-5 day Fable run is too much commitment for the first deployment, smaller candidate:

**"Build the sentence-level attribution pipeline end-to-end for the 15-prospect smoke cohort."**

- Goal: populate `AttributedSentence` for every sentence in those 15 bodies
- Time: ~12-24 hours of Fable work
- Verification: portal click-sentence-see-source works for all 15
- Risk: bounded — only 15 prospects, not 800
- Learn-from: gives operator + me data on Fable's actual behavior before committing to the bigger run

I'd recommend the SMALLER candidate first. The full Plan B re-substrate is the right Fable problem once we trust its behavior on the smaller one.

# Recommended sequence

1. **Tonight:** Operator reviews Plan A + Plan B + this Fable proposal.
2. **Tomorrow:** Plan A executes (Claude Code Opus, overnight). 15 emails ship.
3. **Next week:** Smaller Fable candidate runs (sentence-level attribution on 15 smoke). Learn-from.
4. **Following week:** If Fable's behavior is trustworthy, full Plan B re-substrate kicks off.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:25 | Claude (Opus 4.7, fresh session) | Initial Fable 5 candidate. Recommended starting with smaller scope (15-prospect attribution) before the 800-prospect re-substrate. |
