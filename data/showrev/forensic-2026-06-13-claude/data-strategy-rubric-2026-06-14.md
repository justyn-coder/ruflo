---
title: Data strategy synthesis rubric — 10 dimensions
status: ACTIVE
last_updated: 2026-06-14 03:30 EDT
version: v1
purpose: Cross-family judge panel evaluation rubric for data-strategy-synthesis-2026-06-14.md. Each dimension 0-10, equal weights (10 each), sum to 100.
threshold: ship at ≥80 weighted_total AND no single dim below 6
authored_by: Claude (Opus 4.7) — fix-sprint Sunday session
---

# Data strategy synthesis rubric — 10 dimensions

## What you are evaluating

You are a non-Anthropic LLM serving as an independent external judge. The artifact you are scoring is a **DATA STRATEGY SYNTHESIS** — a forensic audit + proposed substrate-tiering strategy for an enterprise cold-outreach pilot. It is NOT a sprint plan, NOT a product spec, NOT an email draft. It proposes:

1. A red-team of the author's initial interpretation of expert feedback (Nick McManus, Inorsa product expert)
2. A market-side audit (ICPs, personas, JTBDs, pain language)
3. A product-side audit (Inorsa fiber value-prop scope, in/out)
4. A novel 4-tier substrate-source model (A/B/C/D) for ranking pain-language by relevance-to-Inorsa-scope
5. Connection-point bridges between market pain and Inorsa value
6. A recommended implementation (substrate column add + composer preference + mechanical check)
7. An email strategy aligned to the highlevelae talk-track doctrine

Your job is to **scrutinize the strategy rigorously**, not to be charitable. The operator apex is quality + precision + craft-resonance over speed.

## Scoring rules

1. Score each of the 10 dimensions D1-D10 on a 0-10 scale per the bands below.
2. All dimensions are POSITIVE-FRAMED. If the strategy does not address a dimension at all, score 0 (NOT N/A).
3. Equal weights: each dimension contributes 10 points to the 0-100 total.
4. Compute `weighted_total = sum(dim_score * 10 / 10) = sum(dim_score)` (since weight is 10 each, total is straight sum 0-100).
5. Weakest-link gate: identify the weakest dim. If weakest <6, the strategy does NOT ship even at total ≥80.
6. Pass bar: 70. Ship target: 80.
7. **Adversarial dissent required** — surface at least one specific concern per judge, even if you'd otherwise score high. Sycophancy is a failure mode.

You MUST return a JSON object matching the schema described in your system prompt. No prose outside the JSON. Be opinionated; cite specific synthesis sections (e.g., "§2.4 Tier D row", "§4.2 bridge math") in rationales.

## The 10 dimensions

### D1 — Boundary fidelity (Construction-vs-Engineering)

Does the strategy respect Nick's hard boundary: Inorsa impacts design-side (CAD drawings, permit packages) but NOT construction execution ($/ft, labor, crew availability)?

- 10: All recommendations stay within Inorsa's design-side scope. Construction-impact claims are explicitly excluded. Tier D includes ANY claim that could cross the boundary.
- 7-9: Mostly within scope; one minor leak that could be tightened.
- 4-6: Multiple boundary slips; recommends content that conflates design with construction.
- 0-3: Recommends construction-impact claims as if they were Inorsa value.

### D2 — Substrate tiering coherence (4-tier model A/B/C/D)

Is the 4-tier scheme actually distinguishable? Could a new substrate row be classified deterministically by a reader who hadn't seen the synthesis before?

- 10: Each tier has clear inclusion criteria + example + non-example. The fiber-only safety default in Tier D is explicit. Tiers don't blur.
- 7-9: Mostly clean; one or two edge cases would require judgment.
- 4-6: Tiers blur; e.g., "Tier C aligned" vs "Tier D off-target" boundary is fuzzy on the BEAD-pressure family of claims.
- 0-3: Not actually a tiering system; just a list of vibes.

### D3 — JTBD preservation

Does the strategy maintain the 7 Nick-validated JTBDs from jtbd-matrix.md v1 without recasting or renumbering?

- 10: No JTBD framework changes proposed. Only substrate tagging changes. Explicitly states "JTBDs are sound; substrate-to-JTBD pairing is the bug."
- 7-9: Preserves JTBDs but proposes minor relabeling.
- 4-6: Suggests JTBD restructuring without explicit operator approval.
- 0-3: Throws out the JTBD framework.

### D4 — Persona-pattern fidelity

Does the strategy honor documented engagement signal (e.g., `challenger_insight` got 75% reply rate for `permit_cycle` persona on JTBD 1) instead of overriding with a priori reasoning?

- 10: Names the empirical signal explicitly. Recommends pattern selection by persona × JTBD with documented engagement weights.
- 7-9: Mentions persona-pattern data; doesn't override.
- 4-6: Generic "use challenger" without persona segmentation.
- 0-3: Ignores empirical engagement data entirely.

### D5 — Talk-track doctrine alignment

Does the strategy map cleanly to the highlevelae talk-track doctrine: "Name the failure → Describe friction → Explain Inorsa fix → Connect to outcome"?

- 10: Email strategy section explicitly follows the 4-step doctrine. Banned-opener list referenced. Diagnostic CTA over "worth 20 minutes."
- 7-9: Mostly follows doctrine; some implicit steps.
- 4-6: Doctrine is mentioned but not load-bearing in the recommendation.
- 0-3: Breaks doctrine (e.g., leads with abstract outcomes instead of operational failure).

### D6 — Bridging mechanism clarity (novel + effective)

Is the path from market pain to Inorsa value EXPLICIT and NOVEL? Each connection point should name (a) the pain, (b) the bridge, (c) the Inorsa lever.

- 10: 4-5 distinct bridges spelled out with pain → bridge → Inorsa lever for each. Novel framing (e.g., "Speed creates time creates quality").
- 7-9: Bridges named but some are generic; novelty present in 1-2.
- 4-6: Bridges are implicit; reader has to infer.
- 0-3: No bridging mechanism articulated.

### D7 — Risk of over-correction

Does the strategy AVOID throwing out valid Tier C bridging language along with Tier D off-target language? Composer-constraints.ts kill-list extension was rejected in favor of upstream tiering — is that the right call?

- 10: Tier C is explicitly preserved as bridge/context. Only Tier D is banned. The author explicitly red-teamed their initial over-correction.
- 7-9: Tier C preserved but with caveats that could over-constrain.
- 4-6: Strategy hints at banning more than necessary.
- 0-3: Over-corrects (e.g., bans all industry-research substrate).

### D8 — Empirical grounding

Is the strategy grounded in observed data (booth observations, customer email threads, AE call recaps, engagement signals, Nick canon) vs reasoning from first principles?

- 10: Every major claim cites a canonical source (Mike Rutski email, Spencer Kariniemi booth obs, Nick canon line, engagement metric). The Tier A/B examples are concrete and verbatim.
- 7-9: Most claims grounded; some abstract.
- 4-6: Mix of grounded and abstract reasoning.
- 0-3: Reasons from first principles without grounding.

### D9 — Implementability

Can this be built in 4-5 hours and tested before Sunday 6-9pm smoke fire? Is the effort estimate credible? Is there a clear test plan?

- 10: Discrete, scoped, has clear effort estimate (2hr backfill + 1hr composer + 1hr E2E test + 30min docs). E2E test plan named explicitly. All changes traceable.
- 7-9: Implementable but timeline tight or test plan vague.
- 4-6: Sweeping; would take more than 1 working session.
- 0-3: Multi-week scope or no test plan.

### D10 — Reversibility

If this strategy turns out to be wrong, can it be rolled back without losing P2 send timing? Are all changes additive, taggable, revertable?

- 10: All changes are additive (new column, soft constraint, additional check). Nothing destructive. Tier classifications can be re-tagged without data loss. Composer behavior can be reverted by flag.
- 7-9: Mostly reversible; one minor change is destructive but bounded.
- 4-6: Reversible but expensive (e.g., would require re-running 6,512 row backfill if tier scheme changed).
- 0-3: Destructive changes that block smoke fire if rolled back.

## Output schema

You MUST output exactly one JSON object with this shape:

```json
{
  "judge_id": "<your model id>",
  "round": <int>,
  "scores": {
    "D1_boundary_fidelity": {"score": <0-10>, "weight": 10, "rationale": "<≤300 chars, cite synthesis sections>"},
    "D2_tier_coherence": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D3_jtbd_preservation": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D4_persona_pattern_fidelity": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D5_talk_track_alignment": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D6_bridging_clarity": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D7_over_correction_risk": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D8_empirical_grounding": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D9_implementability": {"score": <0-10>, "weight": 10, "rationale": "<...>"},
    "D10_reversibility": {"score": <0-10>, "weight": 10, "rationale": "<...>"}
  },
  "weighted_total": <0-100>,
  "weakest_dim": "<e.g., D7_over_correction_risk>",
  "weakest_dim_score": <0-10>,
  "top_concerns": ["<concern 1, ≤200 chars>", "<concern 2>", "<concern 3>"],
  "adversarial_dissent": "<≤400 chars: at least ONE specific dissent or non-obvious risk you spotted, even if your scores are high. NOT optional. Sycophancy is a failure mode.>",
  "ship_recommendation": "<SHIP | HOLD | REVISE>",
  "ship_rationale": "<≤300 chars: cite weighted_total vs 80 bar AND weakest_dim vs 6 gate>"
}
```

Do not output prose outside the JSON. Cite specific synthesis sections (e.g., §2.4, §4.2, §5.1) in rationales.
