---
title: Inorsa product truth — Nick's validation (2026-06-04)
status: CANON
last_updated: 2026-06-11 10:15 EDT
version: v1
source: Direct feedback from Nick (Inorsa product), via Fiber Connect Email Campaign validation doc
authority: Highest — Nick is Inorsa's product expert; his statements override prior marketing/internal copy
---

# Authoritative product truth (per Nick, 2026-06-04)

This document is the canonical source for what Inorsa actually does and does not do. Any prior content claiming otherwise (esp. "Inorsa validates inputs" — see kill-list at the bottom) is overridden by this doc.

## What Inorsa DOES

- Inorsa generates fiber drawings from GIS and LLD inputs.
- Inorsa **accelerates production**, taking the manual drafting workload off the customer's team.
- That acceleration gives the customer's team **time to perform their own more rigorous QC** before submitting to jurisdictions.
- Output is **deterministic and traceable** back to source data. (Chris's framing — verbatim trust line.)
- Output to **each client's standard** from one input process (after onboarding with agreed-upon configuration scope).
- Volume scaling is supported via token-based pricing — pay-as-you-go, no large upfront commitment.

## What Inorsa does NOT do

- **Inorsa does NOT validate inputs — with ONE exception: it flags missing inputs.** Per Nick: *"Validating inputs doesn't really apply on our fiber drawing generation product EXCEPT when a key input is missing."* So Inorsa surfaces missing-input gaps but does NOT do schema validation or quality checking on the inputs that are present. **Affirmative default (per operator 2026-06-10 pending Nick clarification): assume Inorsa flags missing inputs broadly (across expected input fields), not only on a narrow defined "required inputs" set. AE can position as: "if a required input is missing, Inorsa surfaces it before drawings are produced." Refine if Nick narrows.**
- **Inorsa does NOT catch errors in the customer's network management tool.** Per Nick: *"Any errors or inaccuracies in their network management tool will translate directly as errors in the Inorsa output."*
- **Inorsa does NOT do QC on the drawings it generates.** Per Nick: *"We won't catch the errors, but now they have more time to."*
- Inorsa does NOT support conflict avoidance against utility GIS layers today (though it CAN ingest those layers — water, sewer, sanitary).

## Industry datapoints Nick confirmed

- **Permit rejection rate on first submission: ~30-40%** (scaled back from Nick's "40-50%" anecdotal estimate at operator's direction 2026-06-10 — the lower bound is safer for outbound use). Higher than the often-cited "8-12% industry average". **LOCKED 2026-06-10 as Inorsa's internally-claimed number** — usable in outreach emails, PS lines, and microsites with attribution to "industry sources" or "Inorsa observed data." Source: Inorsa product team estimate, no public URL.
- Most common finance/budget objection from fiber prospects: *"price not commensurate with delivered value"* — Nick notes the product is recent and still receiving consistent, actionable feedback; value will grow into the pricing as the product matures.
- Biggest objection NOT on the JTBD list: *"Network management tools are conceptual; creating CAD parity still requires drafter intervention."*

## JTBDs validated by Nick (with his nuances)

A&E Firms — Inorsa replaces their drafters' manual work. Value = more billable throughput.

1. **Scale without hiring** — YES. Automation potential is proportional to how well they're leveraging their network management tool. Don't claim a fixed % without a file review. Position as: "We partner to maximize the automation potential of your existing systems."
2. **Standardize across clients** — YES, after onboarding with agreed-upon configuration scope.
3. **Protect the client relationship** — NO, framed wrong. Inorsa does not validate inputs. The acceleration gives the customer more time to QC properly.
4. **Win the BEAD bid** — YES with nuance. Drafters still finish drawings (so drawings could still be a bottleneck), but the increased capacity over manual provides confidence in the bid and smooths sporadic-work instability.

Operators — Inorsa feeds their construction pipeline. Value = drawings never bottleneck field crews.

5. **Stop the kickback cascade** — NUANCED. Inorsa doesn't catch input errors. But the accelerated production gives the customer more time to do rigorous QC before submission. Frame as: "more time for their own QC", not "we catch errors".
6. **Keep crews moving** — YES. Accelerated production contributes to accelerated construction schedules (other variables constant).
7. **Make BEAD economics work** — YES. Accelerated production accelerates revenue with cost reduction.

JTBD 1 (kickback cascade) is equally relevant to A&E and operators because A&E delays become operator delays. A&E is paid by cycle time and volume; operators care about speed-to-subscribers and BEAD deployment timelines. Cycle-time delays are days; kickback delays are months.

## Kill list (claims that contradict this truth)

These exact phrasings, anywhere in our materials/substrate, are **WRONG**:

- "Inorsa validates inputs"
- "Inorsa validates design data"
- "Inorsa validates design inputs"
- "Inorsa catches input errors"
- "Inorsa validates inputs before generating"

**Correct framing instead:**

- "Inorsa accelerates drawing production so your team has time for thorough QC before jurisdictional submission."
- "Inorsa converts your GIS and LLD data into construction and permit drawings, freeing your drafters to focus on QC and review."

## Needs verification with Nick (skepticism flags from canon review 2026-06-10)

Three claims in this doc are RESOLVED on the operator side but worth a confirmation from Nick when convenient. Not blocking outreach — the resolutions are safe — but the underlying data would tighten our story.

| # | Flag | Operator resolution 2026-06-10 | What Nick should confirm |
|---|---|---|---|
| 1 | Original 40-50% permit rejection rate is 2-4× higher than typical industry sources (8-12% to 15-25%) | **Confirmed anecdotal per operator 2026-06-10.** Scaled to **30-40%**, locked as Inorsa's internally-claimed number. In outreach: cite as "industry sources estimate" or "Inorsa product team estimate" — NOT as observed customer data. | Closed. |
| 2 | JTBD #3 "Protect the client relationship" marked NO by Nick — contradicts framing we'd used in prior pitches | Confirmed origin: framework came from our 2026-06-03 review doc sent TO Nick; he already responded; `jtbd-matrix.md` updated to JTBD 6 "Deliver Faster, Protect the Relationship" with corrected framing | No verification needed — already in canon. Flag closed. |
| 3 | "Inorsa does NOT do QC" vs "does NOT validate inputs" — fuzzy distinction | **Operator decision 2026-06-10: go with the affirmative position until Nick narrows.** Default = Inorsa flags missing inputs broadly across expected input fields (not only a narrow required-input set). AE positions as: "if a required input is missing, Inorsa surfaces it before drawings are produced." Slack-ready question drafted for Nick when he's available. | Open. Refine if Nick says "only defined required inputs." |

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-11 10:15 | Claude | Initial canon — captures Nick's 2026-06-04 validation doc. Overrides prior "Inorsa validates inputs" content site-wide. |
| v2 | 2026-06-10 11:35 | Claude | Operator corrections applied: scaled 40-50% → 30-40% (and locked as internally-claimed number), added missing-input flagging exception, added skepticism-flags section documenting 3 items for Nick to confirm. |
| v3 | 2026-06-10 11:50 | Claude | Operator resolutions to 3 skepticism flags: (1) 40-50% confirmed anecdotal — closed; (2) JTBD #3 already closed; (3) affirmative default for missing-input flagging (broad across expected inputs, not narrow required-input set) — Slack question drafted, refine if Nick narrows. |
