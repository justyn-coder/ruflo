---
title: Send-Confidence System — Spec v1
status: DRAFT (awaiting red-team)
last_updated: 2026-06-10 12:05 EDT
version: v1
purpose: Compute and surface three confidence axes per prospect (ICP fit, email address, substrate richness) so operators can dispute the system's recommendations and prioritize first-cohort sends by composite confidence.
author: Claude
---

# Send-Confidence System — Spec v1

## Why

Today the System Brief tells the operator WHY a prospect is flagged. It does not tell the operator HOW CONFIDENT the system is in ICP fit, email deliverability, or substrate richness. That means the operator cannot push back on overstrict or overlenient calls — they must take the recommendation on faith.

**Operating principle (operator 2026-06-10):** every flag/recommendation should answer "why did the system decide this, and what would change my mind?" — so operator can override with full context, not blind faith.

**Goal:** ship visible confidence axes + composite + queue ranking so the first cohort fires against the highest-confidence prospects first, with the operator's calibrated weights, not the engine's opinion.

## Out of scope (v1)

- Decision-maker tier multiplier (CEO/COO/VP boost) → v2
- Bandit/learning loop (refine weights from open/reply outcomes) → v2
- Per-AE confidence weighting (Mike vs Nathan vs Lucas might value differently) → v2

## The three axes

### Axis 1 — ICP Fit (0-100)

Measures: does this person match our buyer?

Inputs (all already on `sr_engine_output` / `sr_prospects`):
- `icp_status` ('pass' / 'fail')
- `icp_volume_verdict` ('fit' / 'leaning_fit' / 'miss')
- `persona_bucket` ('technical_designer' / 'ops_builder' / 'revenue_leader' / 'wrong_persona' / etc.)
- `intel_signal_strength` ('GREEN' / 'YELLOW' / 'ORANGE' / 'RED')

Formula (v1, will be replaced by operator-calibrated weights after gate):
```
icp_score = 0
if icp_status == 'pass': icp_score += 40
if icp_volume_verdict == 'fit': icp_score += 30 elif 'leaning_fit': icp_score += 15
if persona_bucket in CORE_ICP_PERSONAS: icp_score += 20
if intel_signal_strength == 'GREEN': icp_score += 10 elif 'YELLOW': icp_score += 5
clamp(0, 100)
```

CORE_ICP_PERSONAS = `['technical_designer', 'ops_builder', 'revenue_leader']` (per Inorsa persona doctrine).

### Axis 2 — Email Address (0-100)

Measures: will this email reach a real inbox?

Inputs:
- `confidence_color` ('green' / 'amber' / 'red')
- NEW column: `email_find_method` ('peer_verified' / 'pattern_inferred' / 'apollo_match' / 'smtp_only' / 'catchall' / 'not_found')

Formula:
```
email_score = 0
if email_find_method == 'peer_verified': email_score = 100
elif email_find_method == 'pattern_inferred' AND confidence_color == 'green': email_score = 80
elif email_find_method == 'pattern_inferred' AND confidence_color == 'amber': email_score = 60
elif email_find_method == 'apollo_match': email_score = 70
elif email_find_method == 'smtp_only' AND confidence_color == 'green': email_score = 55
elif email_find_method == 'catchall': email_score = 30
elif email_find_method == 'not_found': email_score = 0
```

If `email_find_method` column doesn't exist yet (it doesn't today), v1 builder derives it from existing fields: presence of MV-verified flag, peer-pattern flag in the email-finder output, etc. New column added to engine output.

### Axis 3 — Substrate Richness (0-100)

Measures: does the email cite real company facts, or is it persona-frame industry context?

Inputs:
- NEW: `substrate_use_directly_count` (count of USE_DIRECTLY claims pulled)
- NEW: `substrate_use_to_shape_count`
- NEW: `substrate_source_tier_max` ('verified' / 'trade' / 'unverified' / 'none')
- Existing: `composer_mode` ('specific' / 'generalized')

Formula:
```
substrate_score = 0
if substrate_use_directly_count >= 10: substrate_score += 50
elif substrate_use_directly_count >= 5: substrate_score += 35
elif substrate_use_directly_count >= 3: substrate_score += 20
elif substrate_use_directly_count >= 1: substrate_score += 10

# Source-tier ceiling
if substrate_source_tier_max == 'verified': substrate_score += 30
elif substrate_source_tier_max == 'trade': substrate_score += 20
elif substrate_source_tier_max == 'unverified': substrate_score += 5

# Composer mode signal
if composer_mode == 'specific': substrate_score += 20
elif composer_mode == 'generalized': substrate_score += 5

clamp(0, 100)
```

Source-tier hierarchy comes from existing `verified-stats.v1.json` sourceTier field.

## Composite send-confidence

```
composite = (icp_score × w_icp + email_score × w_email + substrate_score × w_substrate) / 100
```

Where `w_icp + w_email + w_substrate = 1.0` (operator-calibrated, see below).

**Hard rule (override behavior):**
- If `email_score == 0` → composite = 0, label = "CANNOT SEND" (no email)
- Otherwise composite reflects weighted blend

## Operator calibration gate (CRITICAL — addresses red-team risk 1)

Before composite weights are applied to live ranking:

1. Engine computes 3 raw axis scores on 10 representative prospects (mix of high/medium/low across axes).
2. Operator manually ranks those 10 prospects 1-10 (by gut, no system recommendation visible).
3. System back-solves the weights (least-squares fit) that produce a ranking closest to operator's manual order.
4. Weights are saved as the calibrated defaults for that cohort.
5. Operator can re-calibrate by repeating the exercise.

**No auto-apply of weights without calibration step.** Until calibrated, portal sorts by creation date (current behavior) and displays the 3 axis scores as informational badges only.

## Persistence (new columns)

Add to `sr_engine_output`:
- `icp_score` integer (0-100)
- `email_score` integer (0-100)
- `substrate_score` integer (0-100)
- `composite_score` numeric (0-100, decimal allowed)
- `email_find_method` text
- `substrate_use_directly_count` integer
- `substrate_use_to_shape_count` integer
- `substrate_source_tier_max` text
- `composite_label` text ('cannot_send' / 'low' / 'medium' / 'high')

Add to `sr_cohort_status` (new table, or extend existing config):
- `w_icp`, `w_email`, `w_substrate` numeric (calibrated weights per cohort)
- `calibration_set` jsonb (the 10-prospect ranking used to derive weights)
- `calibration_date` timestamptz

## Display in Portal

### List view (`/ops`)
- New column: composite_score (sortable, default sort descending)
- Three colored badges per row: ICP fit, Email, Substrate (each green/amber/red based on score thresholds)
- "CANNOT SEND" label replaces score for email_score=0 prospects

### Detail view (`/ops/prospect/[id]`)
- New "Send Confidence" panel at top of page
- Composite score (large number)
- Three axis breakdown cards with: score number, label (high/medium/low), 1-line explanation pulled from a why-text generator
- Existing System Brief stays as-is below the confidence panel

### Why-text generator (the "what would change my mind" answer)

For each axis, generate a short text explaining the score:

ICP: "Pass + leaning_fit ICP volume + ops_builder persona + YELLOW signal strength → 65/100 (medium). What would raise this: a fit verdict (substrate citing more activity for this company) or signal strength upgrade."

Email: "Pattern-inferred from confirmed domain `@cemc.org` (verified via CEMC newsletter PDF). No SMTP test ran. → 60/100 (medium). What would raise this: an Apollo match confirming address or peer-pattern from a colleague."

Substrate: "4 USE_DIRECTLY claims, mostly trade-source, composer ran in specific mode. → 45/100 (medium). What would raise this: more company-specific facts (BEAD award doc, FCC BDC location data, recent press release)."

## Acceptance criteria

- A1. Pipeline writes 3 axis scores + composite to every prospect row.
- A2. Portal list page shows scores in a sortable column + 3 badges per row.
- A3. Portal detail page shows the why-text per axis.
- A4. Composite weights are pulled from `sr_cohort_status` (calibrated) or fallback uniform 1/3 + warning banner ("uncalibrated").
- A5. Email-found prospects with score=0 display "CANNOT SEND" label, NOT a numeric score.
- A6. Operator can re-run calibration via a portal button or CLI command.
- A7. All 22 currently-pending v2-mq7nti2t prospects show real (non-null) confidence scores when query runs.

## Test plan

### Unit
- `computeIcpScore(prospect, engine)` covers each branch
- `computeEmailScore(...)` covers each method + color combo
- `computeSubstrateScore(...)` covers count + tier + mode
- `computeComposite(...)` honors weights, applies hard 0-rule on email=0

### Integration
- Run on all 22 v2-mq7nti2t pending prospects + compute distribution of scores
- Spot-check 5 known prospects (Lobdell, Ellis, Amanda, Tim, Anthem) — do the scores match your eyeball intuition?
- Re-run on the 5-prospect smoke cohort — verify Anthem (flagged) scores lower than Amanda/Ron (pending)

### Calibration validation
- Manually pick 10 of the 22 pending prospects representing high/medium/low across the 3 axes
- Operator ranks them 1-10
- Solve weights, then re-rank, verify operator's top 3 = system's top 3 (or close)

### Regression
- Existing 22 pending prospects don't change `send_status` from this work
- Existing portal pages don't 404 or break on the new columns

## Effort estimate

| Phase | Effort |
|---|---|
| Engine: compute + persist axis scores | 1.5 hr |
| Schema migration (new columns + cohort_status table) | 30 min |
| Backfill scores on existing 22 pending prospects | 30 min |
| Calibration tool (CLI: rank 10, solve weights) | 1.5 hr |
| Portal list page: column + badges + sort | 2 hr |
| Portal detail page: why-text panel | 1.5 hr |
| Tests (unit + integration) | 1.5 hr |
| **Total** | **9 hr** |

Realistic over 1-2 focused sessions. Calibration step is operator-blocking — until you rank 10, weights default to uniform and portal shows "uncalibrated" warning.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-10 12:05 | Claude | Initial spec — captures operator-confirmed design: 3 axes + composite + operator calibration gate + portal display. Defers decision-maker tier to v2. |
