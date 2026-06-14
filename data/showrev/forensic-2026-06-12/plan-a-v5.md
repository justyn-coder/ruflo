---
title: Plan A v5 — Negation + Predicate-Type Guardrails
date: 2026-06-13 (drafted)
status: DRAFT v5 for round-5 judge review
authored_by: Claude (Opus 4.7) — round-4 GPT-5 + Gemini converged on negation/polarity gap
purpose: Close last identified semantic gap. After v5, if judges still hold, the residual is Plan B work and accepted via statistical audit safety net.
---

# What v5 changes vs v4

Round 4 trajectory: median 75% → 81.5%. Grok flipped to SHIP. **GPT-5 + Gemini converge on ONE gap:** negation + predicate/polarity mismatch.

Examples that v4 fails to catch:
- Composer writes "Inorsa raised $100M" — source quote says "Inorsa did NOT raise $100M" → v4 matcher passes ($100M appears in quote)
- Composer writes "CNE acquired Vistal" — source says "CNE was acquired by Vistal" → v4 passes (both entities + "acquired" appear)
- Composer writes "Frontier hired 71 engineers" — source says "Frontier laid off 71 engineers" → v4 passes (71, "engineers" appear)

v5 adds 2 deltas to close this.

## v5-Δ1 — Negation detection

For every extracted atomic fact, check the **5-token window** before the fact in the composed text:
- Negation cues: `not`, `did not`, `didn't`, `never`, `no`, `none`, `without`, `cannot`, `won't`, `wouldn't`, `couldn't`, `failed to`, `unable to`, `lacks`
- If a negation cue is in the window AND the cue's scope syntactically reaches the fact → **flip the polarity of the assertion**

Then check the supporting_quote for the **same polarity**:
- If composer's sentence asserts POSITIVE polarity, the quote must contain the fact in POSITIVE polarity (no negation cue in cue-token-window before the fact in the quote)
- If composer asserts NEGATIVE polarity, quote must contain it in NEGATIVE polarity

Implementation: simple regex + token-window. ~150 lines. CI tests for 15 negation patterns.

For ambiguous cases (negation cue present but uncertain scope, like "we did not just raise $100M, we raised $200M") → **reject as ambiguous, require composer to rephrase OR escalate to operator**.

## v5-Δ2 — Predicate/event-type classification

For verbs and event nouns in the composer's sentence, check the bound claim_id's `supporting_quote` for compatible predicate:

**Predicate antonym pairs** (composer-vs-quote must not be antonyms):
- acquired ↔ acquired-by, divested, sold
- hired ↔ laid-off, fired, terminated
- raised ↔ returned, refunded
- launched ↔ shut-down, terminated, deprecated
- expanded ↔ contracted, retrenched
- partnered ↔ sued, divorced
- gained ↔ lost
- approved ↔ rejected, denied

**Implementation:** maintain a domain-specific antonym table (~50 pairs for fiber + B2B SaaS). For each predicate in composer's span, check whether the bound claim's supporting_quote contains an antonym instead. If yes → reject.

**Composer-side prompt change:** explicitly list the antonym pairs the composer must distinguish; warn about misattribution patterns.

## v5 keeps everything from v4

11 v2 steps + 4 v3 deltas + 7 v4 deltas + 2 v5 deltas.

## Revised time budget

| Item | v4 budget | v5 added | v5 total |
|---|---|---|---|
| v4 total | 45-54 hrs | — | 45-54 hrs |
| v5-Δ1 negation detection | — | 3 hrs | 3 hrs |
| v5-Δ2 predicate antonyms | — | 2 hrs | 2 hrs |
| **Total** | 45-54 hrs | +5 hrs | **50-59 hrs** |
| First 15 ready | EOD Day 3-5 | +0.5 day | EOD Day 4-5 |
| 500 shippable | 8-12 days | +1 day | **9-13 days** |

# What v5 STILL defers to Plan B

- Full coreference resolution ("the company" disambiguation)
- Typed evidence grounding (structured columns for headcount/funding/dates)
- LLM-judged semantic equivalence
- Multi-sentence claim spans (claims that span paragraphs)
- Sarcasm / irony detection

These are honest residual risks. **Statistical audit (v4-Δ7) is the safety net.**

# Stopping criteria

If v5 round 5 produces:
- Median KR1 confidence ≥ 85% AND
- At most 1 hold vote OR
- All hold votes are on items explicitly deferred to Plan B (acknowledged)

→ **Ship v5 as final Plan A.** Move to implementation spec.

If round 5 surfaces NEW show-stoppers (not Plan B-deferred) → v6.

# Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 00:05 | Claude | 3-1 hold, 30% median |
| v2 | 2026-06-13 00:55 | Claude | 2-2 split, 52.5% median |
| v3 | 2026-06-13 01:30 | Claude | 2-2 split, 75% median |
| v4 | 2026-06-13 02:00 | Claude | 2-2 split (different alignment), 81.5% median |
| v5 | 2026-06-13 02:30 | Claude | Negation + predicate-type. Stopping criteria explicit. |
