---
title: System Brief — Send Priority spec v1 (red-team draft)
status: DRAFT
author: Claude
date: 2026-06-09
---

# Intent (the one thing this solves)

An AE scanning N prospects in the portal makes a `send / hold / skip` decision in ≤5 seconds per row. The decision must be:
- **Right** — bad sends harm client reputation + sender domain reputation
- **Trustable** — operator can re-derive the score from underlying signals
- **Deterministic** — same inputs → same score, always
- **Real** — every input is a populated DB field (no theatre, no LLM-generated narratives)

# Inputs (exact DB fields — all already populated)

| # | Input | Source field | Range | Weight |
|---|---|---|---|---|
| 1 | Email confidence | `sr_engine_output.confidence_color` (green/yellow/amber/red) | 1-4 pts | 40% |
| 2 | ICP fit | `sr_engine_output.icp_volume_verdict` (fit/leaning_fit/miss) | 1-3 pts | 30% |
| 3 | Research depth | `sr_engine_output.research_summary.composer_mode` + cited claim_id count | 1-3 pts | 30% |

# Formula

```
raw_score = (email_pts × 1.0) + (icp_pts × 0.75) + (research_pts × 0.75)
priority  = round(raw_score)         // 1-10 integer
```

Mapping:

| confidence_color | email_pts | | icp_volume_verdict | icp_pts | | composer_mode + cites | research_pts |
|---|---|---|---|---|---|---|---|
| green | 4 | | fit | 3 | | specific + ≥2 claim_ids | 3 |
| amber | 3 | | leaning_fit | 2 | | specific + ≥1 claim_ids | 2 |
| yellow | 2 | | miss | 1 | | specific + 0 claim_ids | 1 |
| red | 1 | | (null) | 1 | | generalized | 1 |

# Output (3 new columns on sr_prospects + sr_engine_output)

| Column | Type | Example |
|---|---|---|
| `priority_score` | int 1-10 | `8` |
| `priority_band` | text | `SEND` / `OK` / `HOLD` / `KILL` |
| `priority_weakest` | text | `research` (the dimension with the lowest weighted contribution) |

# Display (portal)

| Score | Band | Visual |
|---|---|---|
| 9-10 | SEND | green badge |
| 6-8 | OK | yellow badge |
| 3-5 | HOLD | orange badge |
| 1-2 | KILL | red badge |

Row tooltip = "Email: green; ICP: fit; Research: 2 cites" (templated from inputs, no LLM).

# Safety flags (BESIDE the score, never folded in)

| Flag | Source | UI | Behavior |
|---|---|---|---|
| `hallucination_fail` | tier3Hallucination.verdict === 'fail' | ⚠️ "Hallucination check failed" + disable Approve | Operator must override explicitly |
| `dnc_match` | static lookup vs §10 wiki-459 DNC list | 🚫 "DNC list" + disable Approve | Hard block |
| `email_red_flag` | confidence_color = 'red' | ⚠️ "Email is best-guess only" | Soft warning, Approve still available |

# Why this is elegant (rather than spaghetti)

- **One formula** — no cascading overrides
- **All inputs are existing DB fields** — no new computation
- **Tooltip is templated** — no LLM cost, no narrative drift
- **Safety flags are SEPARATE columns** — visible alongside the score, never folded in
- **Deterministic** — same prospect always gets the same score across runs

# What this spec does NOT do (deferred to v2)

- Per-prospect persona-match boost (composer enforces this; don't double-count)
- BDC location count granularity for ICP strength (needs extraction from JSON column first)
- Reply-rate feedback loop (no send data yet)
- Distinct-source-count for research depth (Phase 3A library will need fixing before this is trustable)

# Open questions

1. Are the weights (40/30/30) right? Or should email be 50/25/25 since a dead email = wasted send slot regardless of fit/research?
2. Should `composer_mode='generalized'` cap research at 1 pt or allow 2 if the email is well-written? (Today: caps at 1)
3. Should HOLD band auto-skip the Approve button, or just visually warn?
4. Does `priority_weakest` add value or is it noise? Maybe just show the underlying tooltip.

# Test plan after build

1. Backfill: compute priority on every existing `sr_engine_output` row, save to DB
2. Sample 10 random prospects, manually verify the score matches the formula
3. Run on the 43-test re-run: validate score distribution makes sense (not 99% in one bucket)
4. Operator eyeball 5 priority-10 prospects + 5 priority-2 prospects: do they agree?
