---
title: P2 Pilot — Operator-Vetted Alignment Document
status: ACTIVE
last_updated: 2026-06-08 21:30 EDT
version: v1
purpose: Single source of truth for the P2 pilot build. Codifies operator-stated scope, the architectural reframing from 2026-06-08, and the definition of "ship-ready." This document is the contract between Claude (builder) and Justyn (operator). Drift from this without an explicit version bump = scope creep.
---

# P2 Pilot — Operator-Vetted Alignment Document

## Why this document exists

After ~10 hours of deep work on 2026-06-08, the project pivoted from "incremental judge-pass-rate optimization" to a system-level reframing led by the operator. This doc captures that reframing verbatim so that the next 2-3 weeks of build work has unambiguous direction.

If Claude proposes a path inconsistent with this doc, the operator should call it out. If the operator changes scope, this doc gets a version bump with the operator-named reason. No drift in either direction.

## Reframing — the 5 operator-defined challenges

Operator-stated, 2026-06-08, replacing my prior failure-mode catalog:

1. **ICP**: Is this prospect company an ICP, or do we have reason to believe they might be?
2. **Email confidence + sending order**: Can we find the contact's email to a degree of certainty we're comfortable assuming the risk? Alternatively, run the full list and send the highest-confidence first, work down the list (better for avoiding spam flags).
3. **Information verification tiers** (the load-bearing one): The info we source — objective, pains, gains, JTBD — can we verify it?
   - **Verified** → use directly, willing to stake reputation on it
   - **Likely** → use to shape the pitch but don't quote the exact claim
   - **Not confident** → don't use; find second-best, or third
   - **Nothing usable** → generalized statement inferred from similar companies
4. **Tone**: Professional human speaking to a peer they've just met. Pitch is about THEIR pain/gain/JTBD and how our product addresses one — so they connect to hear if it's a fit. Avoid AI tells. Don't force company-name personalization.
5. **Psychology / funnel**: Subject → email → microsite. Open → click → consider → connect. Best practices from consumer behavior/psychology research.

**Operator stance on ideal vs. pilot**: This is the ideal. The pilot bar is lower. Don't let perfect get in the way of done. For prospects we don't feel good about, either flag them and find solutions later, OR send a generalized email — we have generalized templates that are bulletproof. We have ~2,300 contacts and email warming throttles daily volume anyway, so substrate is not the constraint.

## The architectural inversion (operator-stated, 2026-06-08)

Original pipeline (current): linear. Email-find blocks composition. Operator reviews emails for prospects who may never receive them.

**New pipeline (operator-designed)**: two tracks.

- **Composition track**: ICP → research → substrate-tiering → composition → judge → microsite → operator approval. Runs unattended. Parallel workers (20+). Output: composed package + ICP_fit + research_quality ranking.
- **Email-finder track**: separate async service. Takes approved-content prospects. Two-path:
  - **Path A — Quick**: Apollo direct match + MV verify. Fast, cheap, ~50-60% hit.
  - **Path B — Thorough**: multi-agent (Apollo peer-pattern, web/LinkedIn scrape, MX/DNS inference). Prioritized by ICP rank. Slower, ~25-30% incremental hit.
- **Send queue**: confidence-thresholded, warming-throttled. HubSpot Sequence add when (operator-approved ✓ AND email_confidence ≥ green).
- **Uncertainty pool**: low-confidence prospects. Background workers keep retrying; either rise to send queue or stay.

Operating principle: **uncertainty falls down the list. Certainty rises and ships.**

## Claude's responsibility for fact-quality (operator-stated)

Per operator: "Tim, nor I, nor any human can evaluate whether the substrate/facts/data that you are using to compose those emails is correct. We're relying on you to rationalize the truth."

This is the load-bearing responsibility for the build. The composition layer is already approved by Tim — that's not the issue. **The unsolved problem is upstream: substrate-tiering.** Claude decides:

- What's verified enough to assert
- What's likely enough to shape the pitch but not quote
- What's too uncertain to use at all
- When to fall back to generalized framing that is bulletproof

The composer never decides what's true. It dresses up whatever Claude hands it. Claude's job at the tiering layer is to hand it only claims worth defending.

## Cuts from prior plans (operator-confirmed or implied)

- **Phase 5 outcome-learning loop** — defer until post-production data exists
- **Phase 3 evidence-first redesign as a separate phase** — wrong framing; the substrate-tiering layer IS the evidence-first work; it's not a separate redesign
- **Tim calibration sub-loop** — Tim already approves the vast majority of composed emails. No additional calibration pass needed before ship; rely on portal review at small batch sizes.
- **Phase 5 measurement loop (#5 in operator's 5)** — defer; numbers game works without it for the pilot
- **Claim-tier verification as v1.1** — wrong call; it's the v1 architecture per operator's #1 and #3

## Keeps (still in scope)

- Catastrophic-risk infrastructure (warming, circuit-breaker, bounce monitoring) — folded into the SEND QUEUE controller, not standalone
- Engine-qa-test-plan as the validation gate (Tests 1 + 2)
- Regression suite (5-frozen-prospect)
- Domain-sanity pre-check before any send
- Pain-first composer prompt rewrite (operator #4 — light revision, not from scratch, since Tim already approves)

## Definition of "P2 Focus 100 ship-ready"

A production run we can trust means ALL of:

1. ✓ **Composition pipeline parallel-capable** at 20+ concurrent workers
2. ✓ **Substrate-tiering layer functioning** — every claim in the final dossier carries a confidence tier and source citation
3. ✓ **Generalized-fallback mode wired** — composer can produce a defensible email when verified facts are thin
4. ✓ **Email-finder two-path service** running independently of composition
5. ✓ **Send queue with warming + circuit-breaker + bounce monitoring** active
6. ✓ **Domain-sanity pre-check** firing before every send
7. ✓ **Operator portal** shows ranked composition output sortable by (ICP_fit × research_quality × email_confidence)
8. ✓ **Engine-qa Test 1 + 2 pass** on a fresh 10-prospect cohort
9. ✓ **Operator timed-review test**: 10 emails in <15 min, zero rewrites
10. ✓ **Hidden trust points verified or explicitly accepted** (Apollo short_description, pitch variants re-ratified, ICP volume floors re-ratified, anti-AI-tell regex refreshed)

If any of these is not green, we don't have production. Full 2,300 ship follows once Focus 100 produces clean data.

## What "ICP rank" means (used everywhere)

A computed ranking per prospect. Composite score from:

- ICP volume verdict (fit > leaning_fit > miss)
- Research quality (high > medium > low — based on source count + verifiability)
- Persona fit (revenue_leader > ops_builder > technical_designer when the operator is named decision-maker; tunable)
- Substrate density (rich peer/regional context > thin)

Used to:
- Prioritize email-finder queue (highest ICP rank first)
- Sort operator review queue (highest first)
- Inform send order (highest sends first under warming throttle)

Formal scoring rubric lives in the architecture spec.

## What "Email confidence" means (used everywhere)

The output of the confidence-gate against the email-finder result. Existing scale: green (90+) / yellow (50-89) / red (<50). Surfaces in:

- Send queue (only green = eligible)
- Operator portal (already surfaces — Email Deliverability section)
- Uncertainty pool (red = stays in pool, background workers retry)

## Open decisions (operator must answer before relevant build)

| # | Decision | Default if no answer |
|---|---|---|
| 1 | Where does claim-tier verification live? | Inside composition pipeline (post-research, pre-composer) — this is the substrate-tiering layer per #3 |
| 2 | Generalized fallback emails — do we already have them written, and where? | Need to inventory; if not, draft 3-6 templates against persona × ICP segment |
| 3 | Email-finder priority — strict ICP order or batched? | Always work on highest available (more efficient than fixed-batch) |
| 4 | Per-paragraph properties for HubSpot — wire now or later? | Wire now, since 4-paragraph mandate already exists in composer |
| 5 | Generalized-fallback trigger threshold — at what tier level does composer switch to generalized mode? | When fewer than N=3 claims survive the tiering gate (TBD: maybe 2, maybe 3 — calibrate during build) |

## Hidden trust points to re-verify before ship

- **Apollo short_description**: Cross-check ≥3 with their own websites
- **Brain entities**: Phase 0 staleness audit (drop entities >30d old or tag with provenance)
- **Pitch variants** (2026-06-07): Re-ratify with operator
- **ICP volume floors** (250 mi / 500 drawings, SKO 2026): Re-ratify post-ACV-decoupling
- **Anti-AI-tell regex** (2025 research): Refresh with 2026 sources
- **ICP_CTA_OPTIONS per segment**: Last review unknown — operator re-ratify

## Backlog items folded into this build

These were filed as deferrals but now belong inside the substrate-tiering layer build:

- **BL-001**: Substrate dead code (substrateContext computed but never reaches composer) — fixed by the unified evidence layer
- **BL-002**: Composer has no attribution/tracing — fixed by per-claim source-tagging schema
- **BL-003**: Brain is memory store, not intelligence engine — fixed by cross-company pattern aggregation
- **BL-004**: Substrate has no entity tagging — fixed by entity-extract pass on substrate ingest
- **BL-005**: Brain + Substrate disconnected — fixed by unified retrieval interface
- **BL-007**: Research confidence has no rubric — fixed by computed-from-source-count rubric
- **BL-012**: Research + Substrate coordination — fixed by gap-fill orchestrator (substrate first, research fills gaps)
- **BL-014**: Apollo enrichment as ICP booster — folded into evidence acquisition phase
- **BL-013**: Apollo company-name suffix strip — folded into Apollo client wrapper
- **BL-015**: Apollo peer-pattern derivation — folded into email-finder Path B

## What this doc is NOT

- It is NOT the architecture spec. That doc enumerates code structure, schemas, sequence diagrams. Lives at `docs/specs/substrate-tiering-architecture-spec.md`.
- It is NOT the build plan. That's a separate doc once the spec is critiqued and finalized.
- It is NOT the operator-test plan. That references `engine-qa-test-plan.md`.

This doc is the contract. Spec details what to build to honor the contract. Build plan sequences the work.

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-08 21:30 | Claude | Initial alignment doc captured from operator-driven reframing 2026-06-08. Codifies 5 challenges, architecture inversion, substrate-tiering responsibility, ship-ready definition. Will be amended only by operator-explicit decisions. |
