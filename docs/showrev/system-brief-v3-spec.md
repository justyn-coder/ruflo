---
title: System Brief v3 — list-view badge spec
status: DRAFT
last_updated: 2026-06-10 00:58 EDT
version: v3
---

# System Brief v3 — list-view badge spec

## Headline

**Don't synthesize. Project.** v1/v2/v2.1 tried to combine substrate signals into a 1-10 send-priority score; three round-3 judges said NEEDS-REVISION and PM proved v2.1 dropped SEND to 0% on real data. v3 throws that whole direction away. Instead, the portal **renders the engine's existing hard decisions** as a single per-row badge plus one defendable sentence, in the LIST VIEW.

Phase B (verified-stat library + fallback) and Phase C (substrate refutation, shipped + validated against Frontier on 2026-06-09) now defend against fabrication and contradiction natively. Email confidence gate and ICP volume verdict label deliverability and fit. Every signal the AE needs to act in ~5 seconds already exists as a discrete decision on `sr_engine_output`. v3 surfaces those, end of story.

## Intent (operator's original, captured here so v4 doesn't drift again)

- AE scans → decide send / hold / skip in ~5 sec/row in the **list view** (not the detail panel).
- Trust: operator can defend any badge by pointing to a single engine decision. No theater.
- Two surfaces: badge + one sentence. Detail panel stays as the collapse-to-detail.
- Reliable + trustable. No spaghetti. No new code paths.

## Scope

**In scope:**
- New per-row badge in the LIST VIEW of `showrev-microsites` (the portal repo on Vercel).
- One-sentence reason rendered adjacent to the badge, sourced from existing DB fields.
- The mapping table (below) is the spec — badge state ↔ engine decision ↔ sentence source.
- Acceptance criteria (below).

**Out of scope (call out explicitly):**
- No new engine code. The ruflo pipeline already writes everything.
- No new DB columns, no migrations.
- No 1-10 score, ever. Badge is categorical.
- No redesign of the existing detail panel (ICP Volume Verdict / Heads Up / Status Recommendation / Email Deliverability / Research Confidence / AE Notes). Stays as is.
- No human-in-the-loop "pick alternate frame" override flow. That's a separate spec (Phase C L2/L3).
- **No DNC badge.** DNC handling belongs to the HubSpot-loading stage, not the System Brief. At HubSpot-loading time the pipeline will check whether the account already exists in HubSpot, how active it is, and surface that back to the portal for operator decision (DNC vs override). The badge does not show a DNC state — DNC is a *send-time* gate, not a *display* signal.

## Mapping table — the spec

Evaluation order is top-to-bottom. First matching row wins. This guarantees a 1:1 mapping from engine decision to badge.

Every sentence source below reads from a single field on `sr_engine_output`. No cross-table joins at render time. The Phase C decision is read indirectly via `system_brief` (which already names refuters in plain English) rather than via `sr_decision_trace` directly.

| # | Badge | Fires when | Sentence source |
|---|---|---|---|
| 1 | 🔴 Skip | `send_status='flag'` AND `system_brief` starts with "The substrate-refutation gate halted" (Phase C halt — any reason: substrate refuted with named refuters, judge unavailable, or insufficient evidence) | `system_brief` first sentence, truncated to 140 chars |
| 2 | 🔴 Skip | `send_status='flag'` AND `confidence_color='red'` (email gate) | `ae_flag` if present, else literal `"Email not deliverable — manual lookup required"` |
| 3 | 🟠 Hold | `send_status='flag'` AND `system_brief` is non-null AND does not match Row 1 or Row 2 (ICP volume verdict, hallucination flag, composer failure, ICP-leaning) | `system_brief` first sentence, truncated to 140 chars |
| 4 | 🟢 Send | `send_status='pending'` AND `confidence_color='green'` (covers both refutation clear and swap — both produce a clean composed email) | Literal: `"Verified fit, deliverable, no substrate conflicts."` |
| 5 | 🟠 Hold | anything else (catch-all — flag with null `system_brief`, `compose_violations`, unexpected state) | `ae_flag` if present, else literal `"Operator review — unclassified engine state"` |

Engine fields referenced — all written by today's pipeline on `sr_engine_output`, verified 2026-06-10:
- `send_status` — pipeline-resolved (`pending` or `flag`). `dnc` is set only by AE-manual action and is not consumed by this spec.
- `confidence_color` — email-gate signal (`green` / `yellow` / `red`).
- `ae_flag` — short operator-facing label, populated on email-gate-red rows; may be null on other flag paths.
- `system_brief` — plain-English explanation written by the engine for any flagged row. Includes Phase C refuter names, ICP volume verdict reasoning, composer-failure summary, and judge-unavailable explanations. Null on clean `pending` rows.

Detection of "Phase C halt" (Row 1) uses a prefix match on `system_brief` rather than joining `sr_decision_trace`. The engine's `generateFlagSystemBrief()` writes the same opening phrase ("The substrate-refutation gate halted") for ALL Phase C halt sub-reasons — substrate-refuted with named refuters, judge-unavailable (judge timeout/parse failure), and insufficient-evidence. All three land 🔴 Skip. This is intentional: a halt of any flavor means the engine could not safely write an email, and the AE should review either way. If the operator later wants to distinguish judge-unavailable as 🟠 Hold (transient infra issue) vs 🔴 Skip (real substrate problem), the engine must first be patched to write a distinct opening phrase for that sub-reason — out of scope for this spec.

## Acceptance criteria

- **A1.** Every badge state maps to a single engine decision. No formula, no weighted sum, no synthesis. The mapping table above is the entire decision logic.
- **A2.** Every sentence is either (a) pulled verbatim or by simple substring/truncation from an existing DB field on `sr_engine_output`, OR (b) a fixed safe literal — explicitly allowed for the Row 4 Send case (all-clear state has no field-sourced sentence to pull) and for fallback paths when the primary field is null. No LLM call at render time. No template rewriting beyond truncation.
- **A3.** Operator can defend any badge by naming a single engine decision. Worked example: "Why is Frontier 🔴 Skip?" → "Phase C halt, `system_brief` cites Verizon acquisition Jan 20 2026 (Light Reading)." If the answer needs more than one decision, A3 fails.
- **A4.** No new tables, no migrations, no changes inside ruflo. Pure portal-side render. Diff lives entirely in `showrev-microsites`. No cross-table joins at render time — every read targets `sr_engine_output`.

**Design goal (not acceptance):** AE scans 10 rows and decides on each in <5 seconds total. This is a usability target measured in a portal walk-through with the operator after build; it does not gate ship. If the badge regularly requires opening the detail panel to interpret, revise the mapping rather than the goal.

A test run targeting `run_id='v2-mq7iex0p'` (5 prospects from 2026-06-09 smoke test) under this spec should produce: 2× 🟢 Send (Fastwyre, Fidium — both pending + green), 1× 🟠 Hold (Finley — Row 3, ICP volume verdict), 1× 🔴 Skip (ALLO — Row 2, email confidence red), 1× 🔴 Skip (Frontier — Row 1, Phase C judge-unavailable halt; the shared "substrate-refutation gate halted" opening fires Row 1's prefix match). For the current engine (post Phase C fixes, run `v2-mq7jyegl`), Frontier swap-composes and lands Row 4 🟢 Send instead — the halt is no longer reached. If badges misfire, the mapping is wrong, not the engine.

## Kill list (operator action after spec approval)

Delete these — they represent the dead 1-10-score direction:

- `docs/showrev/system-brief-priority-spec-v1-2026-06-09.md`
- `docs/showrev/system-brief-priority-spec-v2-2026-06-09.md`
- `docs/showrev/system-brief-priority-spec-v2.1-2026-06-09.md`
- `docs/showrev/system-brief-redteam-adversarial-2026-06-09.md`
- `docs/showrev/system-brief-redteam-adversarial-round2-2026-06-09.md`
- `docs/showrev/system-brief-redteam-adversarial-round3-2026-06-09.md`
- `docs/showrev/system-brief-redteam-engineering-2026-06-09.md`
- `docs/showrev/system-brief-redteam-engineering-round2-2026-06-09.md`
- `docs/showrev/system-brief-redteam-engineering-round3-2026-06-09.md`
- `docs/showrev/system-brief-redteam-pm-2026-06-09.md`
- `docs/showrev/system-brief-redteam-pm-round2-2026-06-09.md`
- `docs/showrev/system-brief-redteam-pm-round3-2026-06-09.md`
- `src/showrev/m1-email-find/evidence-tiering/send-priority.ts` (304 lines, half-built, never imported)

All untracked. No git history to preserve.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v3 | 2026-06-10 00:58 | Claude | Red-team v2 revision. Corrected Row 1 description and test prediction: ALL Phase C halts share the engine prefix "The substrate-refutation gate halted" (including judge-unavailable and insufficient-evidence sub-reasons), so Row 1 catches them all and they land 🔴 Skip — judge-unavailable does NOT land Hold under this spec. Documented this as intentional with a stated escape hatch (engine patch needed to differentiate). Updated Row 3 examples to call out `hallucination` flag path. Updated Row 5 catch-all examples to call out `compose_violations`. Frontier in historical `v2-mq7iex0p` now correctly predicted as 🔴 Skip; current-engine `v2-mq7jyegl` still 🟢 Send via swap. |
| v2 | 2026-06-10 00:42 | Claude | Red-team revision. Dropped DNC row (DNC moves to HubSpot-loading stage, separate spec). Collapsed mapping to 5 rows + safe single-table reads from `sr_engine_output` (no `sr_decision_trace` join at render). Row 1 detects Phase C halt via `system_brief` prefix match. Amended A2 to explicitly allow safe literals for the all-clear and fallback paths. Moved A3 (<5s scan) from acceptance to design goal — not portal-testable as a binary pass/fail. Updated test prediction for `v2-mq7iex0p` with the new mapping (ALLO/Frontier outcomes corrected). Fixed `send-priority.ts` line count (304, not 236). |
| v1 | 2026-06-10 00:09 | Claude | Initial spec — projection-over-synthesis thesis, mapping table, acceptance criteria, kill list. |
