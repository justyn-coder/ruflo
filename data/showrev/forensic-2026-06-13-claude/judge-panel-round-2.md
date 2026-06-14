---
title: Judge Panel — Round 2 — sprint plan v1 vs rubric v2
status: COMPLETE
last_updated: 2026-06-13T17:31:36.466Z
round: 2
plan_path: data/showrev/fix-plan-sprint-2026-06-13-v2.md
rubric_path: data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md
judges:
  - gemini-2.5-pro (Google)
  - gpt-5 (OpenAI)
  - grok-4 (xAI)
  - deepseek-reasoner (DeepSeek)
authored_by: scripts/judge-panel-2026-06-13.mjs (inline REST in ruflo, NOT showrev/engine)
---

# Cross-Family Judge Panel — Round 2

## Headline

- **Weighted total (mean of 4 judges):** **93.4 / 100** (pass=70, ship=80)
- **Weakest dim:** D3_capability_coverage @ **8** / 10 (weakest-link gate ≥6)
- **Panel recommendation:** **SHIP**



## Per-dim heatmap

| Dim | Weight | Mean | StdDev | Min | Max | Scores |
|---|---|---|---|---|---|---|
| D1_sequencing | 13 | **9.5** | 0.5 | 9 | 10 | 10, 9, 9, 10 |
| D2_risk_discipline | 13 | **9.3** | 1.3 | 7 | 10 | 10, 7, 10, 10 |
| D3_capability_coverage | 10 | **8** | 1.22 | 6 | 9 | 9, 8, 9, 6 |
| D4_defensibility | 11 | **9.5** | 0.5 | 9 | 10 | 10, 9, 9, 10 |
| D5_scope_discipline | 7 | **9.8** | 0.43 | 9 | 10 | 10, 9, 10, 10 |
| D6_substrate_trust | 14 | **10** | 0 | 10 | 10 | 10, 10, 10, 10 |
| D7_observability | 8 | **9.3** | 0.83 | 8 | 10 | 10, 8, 9, 10 |
| D8_human_in_loop | 4 | **9.8** | 0.43 | 9 | 10 | 10, 10, 9, 10 |
| D9_concrete_spec_depth | 10 | **8.8** | 1.3 | 7 | 10 | 10, 8, 10, 7 |
| D10_elegance_insight | 10 | **9.5** | 0.5 | 9 | 10 | 10, 9, 9, 10 |



## Per-judge weighted totals

| Judge | Model | Weighted Total | Ship Rec | Elapsed |
|---|---|---|---|---|
| gemini | gemini-2.5-pro | 99 | SHIP | 34694ms |
| gpt5 | gpt-5-2025-08-07 | 86.4 | SHIP | 77957ms |
| grok | grok-4.3 | 94 | SHIP | 14221ms |
| deepseek | deepseek-v4-flash | 93 | SHIP | 67658ms |

## Top concerns surfaced by judges

**gemini (gemini-2.5-pro):**
- The plan's v2 revisions map so perfectly to the rubric's deductions (non-destructive rollback, anti-rollback-theater, adversarial tests) that it suggests the plan was revised specifically to pass this rubric, rather than arriving at these solutions organically.
- The L (Close the loop) capability, while covered, rests on only two items (Stop-hook, GATE telemetry). It's the thinnest capability pillar in the plan.
- The plan's advanced features (F8/F9 OTEL path, Stop-hook) rely on new-ish, potentially fragile toolchain capabilities. Failure here would degrade M and L outcomes, though F8 has a fallback.

**gpt5 (gpt-5-2025-08-07):**
- Falsifiability and rollback tests are not uniform (F8/F9/F7/W1/W3 rely on happy-path checks; few rollback verifications).
- Observability fallback lacks an explicit test to trigger/verify non-OTEL path; potential fragility if OTEL flakes.
- Scope guard: 'Slack auto-ingest' omitted from 'does not include' despite being audit-settled.

**grok (grok-4.3):**
- D1 could add explicit 'why not earlier/later' paragraph for F3/F6/Tim-rejudge
- D3/D4/D7/D10 at 9 leave minor room vs 10-band perfection
- No material concerns; plan already incorporates all R1 fixes

**deepseek (deepseek-v4-flash):**
- L (close-the-loop) capability only advanced by Stop-hook; may need more items to ensure robust learning loop.
- D9 deducted for missing line anchors on some items (F9, Stop-hook, W4, GATE); minor spec gap.
- D3 barely meets weakest-link threshold; consider adding another L item in next sprint.

## Per-judge per-dim rationales

### D1_sequencing (weight 13)

- **gemini** (score 10): Excellent. The plan not only provides an explicit 'substrate first, re-judge last' block but defends the entire F-bucket order in the 'Defended sequencing logic' section, explaining why F3 is early, F6 is late, and the GATE is last. Reordering would visibly degrade the outcome.
- **gpt5** (score 9): W2 order-of-ops block + F-bucket sequencing summary defend 'substrate first, re-judge last'. GATE after W2. Deps named (F9→F8, Stop-hook→F9, F6 after F1/F3). Minor items mark deps 'None' though preferable order noted (F3).
- **grok** (score 9): Explicit substrate-first order (F1→F2→F3 then observability) with Tim re-judge LAST in GATE. Sequencing summary defends item-by-item; F3/F6 positioned after substrate. Matches 9-10 band.
- **deepseek** (score 10): Explicit 'substrate first, re-judge last' order; F3, F6, GATE defended with 'why not earlier/why not later'; reordering would degrade outcomes.

### D2_risk_discipline (weight 13)

- **gemini** (score 10): Started at 10. No deductions. The plan's v2 revisions systematically eliminate all rubric-defined risks. Rollback paths exist for all items (W3, F3). Rollbacks are non-destructive (F3, F6, W4). Falsifiable tests are exemplary (GATE adversarial replay). Rollback theater is explicitly avoided (F3, F6, F10).
- **gpt5** (score 7): Start 10; -2 happy-path-only tests on several items (F8, F9, F7, F2) lacking falsify steps; -1 rollback untested for some (F1, F2, F7, F8, F9, Stop-hook, W1, W3). Rollbacks mostly atomic/non-destructive; deps generally named.
- **grok** (score 10): Started at 10. No deductions: every item (F3/F6/F10/W3/W4) has atomic non-destructive rollback + 'rollback verified in dev' step + named deps + adversarial falsifiability tests (GATE 5+5 prompts).
- **deepseek** (score 10): Started at 10. All items have rollbacks (non-destructive for F3,F6). Falsifiability via adversarial GATE replay. Dependencies explicit. Rollback theater addressed for high-risk items.

### D3_capability_coverage (weight 10)

- **gemini** (score 9): Excellent. The plan includes a 'Capability spine' and tags every item. All 4 capabilities are advanced, with L being covered by Stop-hook and GATE. The 9-10 band is met by F8's test plan, which defends the M-tag by verifying DB row counts move from 0 to N, as requested by the rubric.
- **gpt5** (score 8): Capability spine present; each item tagged. K via F1-F4/F6/F10; M via F8/F9/F5; S via F7/F10/W3; L via Stop-hook + GATE watch. Tags feel honest; L advances but thinner than K/M.
- **grok** (score 9): Capability spine header present. All 4 (M/K/L/S) advance with ≥2 items each; test plans defend tags (e.g., F8 'we will know M improved because sr_pipeline_runs row count goes from 0 to N').
- **deepseek** (score 6): Capability spine present, M/K/S have multiple items, but L (close-the-loop) only advanced by Stop-hook; insufficient for 7-8 band.

### D4_defensibility (weight 11)

- **gemini** (score 10): Excellent. Every item traces to a source artifact (audit, canon, operator decision). The plan meets the highest band by explicitly deferring the REBUILD items (R1-R5) in a dedicated section with rationale, showing full alignment with the audit's scope and findings.
- **gpt5** (score 9): F1 cites canon l57-61; F8/F9 cite tool-audit items 13/16; Stop-hook cites tool-audit 7; W3 references HUBSPOT Q1/Q10/Q16; REBUILD defers R1-R5 w/ operator-decision deps. No novel scope without provenance.
- **grok** (score 9): Every F-item maps to specific audit/tool-audit findings (F8 cites items 13+16). Items beyond audit carry operator-decision provenance. No novel scope without rationale.
- **deepseek** (score 10): Every F-item cites specific audit/tool-audit findings; deferred items (R1-R5) have explicit operator-decision dependencies; no scope without provenance.

### D5_scope_discipline (weight 7)

- **gemini** (score 10): Started at 10. No deductions. The plan includes a comprehensive 'What this plan does NOT include' section that explicitly lists all 6 audit-ruled-out decisions, plus others. There is no evidence of scope creep or spirit-of-the-law violations.
- **gpt5** (score 9): Start 10; explicit 'What this plan does NOT include' block. -1 Slack auto-ingest (audit-settled) not listed. No spirit-of-law creep; API enrollment kept as test-only (W3).
- **grok** (score 10): Started at 10. Explicit 'What this plan does NOT include' section lists all 6 settled decisions with no spirit-of-the-law creep or renames.
- **deepseek** (score 10): Start 10. No reopened decisions; explicit 'What this plan does NOT include' covers all settled items; no semantic scope creep.

### D6_substrate_trust (weight 14)

- **gemini** (score 10): Excellent. The plan closes the substrate-trust loop perfectly, from F1/F3 fixes to the GATE re-judge. The 'Adversarial falsifiability replay' in the GATE section is a textbook implementation of the rubric's R-3 requirement, testing not just historical failures but crafted break-vectors.
- **gpt5** (score 10): F1 regex from canon; F2 SoT align; F3 classifier wire-in + quarantine + backfill; F4 staleness backfill; GATE re-judge w/ 5 hist + 5 adversarial prompts, mech verifiable. End-to-end K loop closed.
- **grok** (score 10): F1 cites canon 57-61 verbatim. F3 specifies wire paths, quarantine pattern, backfill. GATE closes loop with 5 historical + 5 adversarial falsifiability replays. End-to-end substrate trust.
- **deepseek** (score 10): End-to-end loop: F1→F2→F3→F4→GATE. GATE includes 5 historical + 5 adversarial replay prompts; pass criteria mechanically verifiable.

### D7_observability (weight 8)

- **gemini** (score 10): Excellent. The plan materially moves observability forward by leveraging the tool audit's OTEL finding (F8/F9), providing a fallback path, specifying a cross-system check, and including a noise gate on the Stop-hook. Impact is verifiable via DB row counts, meeting the 9-10 band.
- **gpt5** (score 8): F8/F9 prefer OTEL w/ fallback; receiver path + CLAUDE_CODE_SESSION_ID correlation; DB checks defined. Stop-hook has noise gate + downside. Would benefit from explicit fallback-falsification test.
- **grok** (score 9): F8/F9 prefer OTEL with bounded fallback + CLAUDE_CODE_SESSION_ID correlation. Stop-hook noise gate present. Verifiable via DB row counts 0→N.
- **deepseek** (score 10): OTEL path preferred with explicit fallback; falsifiable tests (SELECT queries expect rows); Stop-hook downside acknowledged; impact verifiable post-sprint.

### D8_human_in_loop (weight 4)

- **gemini** (score 10): Excellent. The plan excels at surfacing operator decisions. It locks decisions at the top, provides a tight 5-question block for the REBUILD bucket, and includes an 'Open assumptions flagged' section, directly matching the rubric's 9-10 band criteria.
- **gpt5** (score 10): Operator decisions locked (frontmatter). Per-prospect microsite approval default (F10). W4 guardrail (Joe Kunz). 'Open assumptions' (4 items). GATE names operator touchpoints. Clear and auditable.
- **grok** (score 9): Operator decisions locked at top. Per-prospect microsite default + batch option named. Open assumptions flagged section + tight REBUILD question block.
- **deepseek** (score 10): Operator decisions locked at top; per-prospect microsite default with batch; REBUILD 5-question block; GATE approval per email.

### D9_concrete_spec_depth (weight 10)

- **gemini** (score 10): Started at 10. No deductions. The plan is exceptionally precise. All items have file paths and line/function anchors (per v2 revision note). Test plans use specific queries and commands, not 'manual check'. The plan is fully reproducible by another agent without interpretation.
- **gpt5** (score 8): Start 10; -1 some tests lack explicit commands/expected outputs (F6 portal UI, F7 sr_hs_api_calls check, W3 inbox check); -1 reproducibility gaps for manual UI/inbox steps. Files/anchors + SQL present on major F-items.
- **grok** (score 10): Started at 10. Every item has file paths, line/function anchors, reproducible test commands, expected outputs, pre/post queries, and rollback verification steps.
- **deepseek** (score 7): Start 10. -3 for missing line numbers/anchors on F9, Stop-hook, W4, GATE. All other spec elements present (file paths, commands, expected outputs, reproducibility).

### D10_elegance_insight (weight 10)

- **gemini** (score 10): Excellent. The plan demonstrates craft and second-order thinking throughout. Examples: F3's non-destructive quarantine for future audit, F8/F9's architectural OTEL choice over tactical INSERTs, and the Stop-hook creating a forward-looking learning loop. This plan solves root causes, not just symptoms.
- **gpt5** (score 9): OTEL over hand-rolled INSERTs (F8/F9); PROHIBITED quarantine not delete (F3); craft/facts split solves root cause (F6); adversarial GATE; RE-ORCH cadence anticipates next issues. Reads ~2 sprints ahead.
- **grok** (score 9): F3 quarantine (not delete) for audit trail, F6 root-cause semantic split, OTEL architectural choice, observability surfaces next problem class. Reads 2-3 sprints ahead.
- **deepseek** (score 10): PROHIBITED quarantine for audit trail; OTEL substitution shows architectural insight; F6 semantic split prevents downstream errors; adversarial prompts show second-order thinking.

## Ship/Hold logic

- Pass bar: 70 (panel ✓ above)
- Ship target: 80 (panel ✓ above)
- Weakest-link gate: weakest dim ≥6 (panel ✓ above)
- **Result:** SHIP

## Convergence tracking (vs prior rounds)

This is round 2. See judge-panel-round-1.md for prior values.

Convergence rule: <3 pt weighted-total move AND no dim Δ>2 across two rounds = declare convergence.

## Next step

Surface to operator for final red-team. Plan is ship-ready per panel — pass bar, ship target, AND weakest-link gate all cleared.


