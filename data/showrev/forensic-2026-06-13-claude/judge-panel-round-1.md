---
title: Judge Panel — Round 1 — sprint plan v1 vs rubric v2
status: COMPLETE
last_updated: 2026-06-13T17:18:31.086Z
round: 1
plan_path: data/showrev/fix-plan-sprint-2026-06-13.md
rubric_path: data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md
judges:
  - gemini-2.5-pro (Google)
  - gpt-5 (OpenAI)
  - grok-4 (xAI)
  - deepseek-reasoner (DeepSeek)
authored_by: scripts/judge-panel-2026-06-13.mjs (inline REST in ruflo, NOT showrev/engine)
---

# Cross-Family Judge Panel — Round 1

## Headline

- **Weighted total (mean of 4 judges):** **83.9 / 100** (pass=70, ship=80)
- **Weakest dim:** D2_risk_discipline @ **6.3** / 10 (weakest-link gate ≥6)
- **Panel recommendation:** **SHIP**



## Per-dim heatmap

| Dim | Weight | Mean | StdDev | Min | Max | Scores |
|---|---|---|---|---|---|---|
| D1_sequencing | 13 | **9.3** | 0.43 | 9 | 10 | 10, 9, 9, 9 |
| D2_risk_discipline | 13 | **6.3** | 1.92 | 4 | 9 | 5, 4, 9, 7 |
| D3_capability_coverage | 10 | **8.5** | 0.5 | 8 | 9 | 9, 8, 9, 8 |
| D4_defensibility | 11 | **8.3** | 1.09 | 7 | 10 | 10, 7, 8, 8 |
| D5_scope_discipline | 7 | **9.8** | 0.43 | 9 | 10 | 10, 9, 10, 10 |
| D6_substrate_trust | 14 | **8.3** | 0.43 | 8 | 9 | 8, 8, 9, 8 |
| D7_observability | 8 | **8.5** | 0.5 | 8 | 9 | 9, 8, 8, 9 |
| D8_human_in_loop | 4 | **9** | 1.22 | 7 | 10 | 10, 9, 7, 10 |
| D9_concrete_spec_depth | 10 | **8.8** | 1.3 | 7 | 10 | 10, 7, 8, 10 |
| D10_elegance_insight | 10 | **8.3** | 0.43 | 8 | 9 | 9, 8, 8, 8 |



## Per-judge weighted totals

| Judge | Model | Weighted Total | Ship Rec | Elapsed |
|---|---|---|---|---|
| gemini | gemini-2.5-pro | 87.9 | REVISE | 41197ms |
| gpt5 | gpt-5-2025-08-07 | 74.1 | REVISE | 67999ms |
| grok | grok-4.3 | 86 | SHIP | 12480ms |
| deepseek | deepseek-v4-flash | 85 | SHIP | 58599ms |

## Top concerns surfaced by judges

**gemini (gemini-2.5-pro):**
- D2_risk_discipline score of 5 is a critical failure. The rollback for HS contact deletion (W4) is destructive, and several test plans are happy-path only.
- The plan fails the weakest-link gate (score < 6), which overrides its high total score. This single dimension makes the plan unsafe to ship as-is.
- Substrate trust (D6), while strong, could be perfected by adding the rubric-specified adversarial replay tests to the final GATE step.

**gpt5 (gpt-5-2025-08-07):**
- Risk gaps: W3 lacks rollback; F3 rollback is destructive (DROP COLUMN) + git revert on data change; no rollback tests anywhere (rollback theater).
- Substrate-trust falsifiability incomplete: GATE lacks adversarial replay beyond F1’s 5 historical; no 5 new adversarial prompts.
- Precision: Line anchors missing on many edits; some tests rely on manual UI steps without scripted commands.

**grok (grok-4.3):**
- D8 open assumptions section too brief (only 4 items); Tim touchpoints lack explicit cost audit
- F3 rollback untested (schema drop)
- W3 proxy test reconstructs from memory without direct audit line citation

**deepseek (deepseek-v4-flash):**
- F3 column-drop rollback is destructive; consider audit column for reversibility.
- No rollback tests for any item; untested rollback paths could fail in practice.
- GATE re-judge lacks adversarial prompts to falsify new gates (only historical replay).

## Per-judge per-dim rationales

### D1_sequencing (weight 13)

- **gemini** (score 10): Excellent. The 'Defended sequencing logic' section explicitly justifies the order for high-leverage items like F3 ('everything downstream is cleaner') and F6 ('after substrate is clean'), and correctly places the GATE workstream last. This meets the 9-10 band.
- **gpt5** (score 9): Strong substrate-first order (W2 order block). Hour-by-hour F-bucket sequencing summary defends why-now/why-later. GATE re-judge is last (GATE §). Dependencies named per item (e.g., Stop-hook depends on F9). 'Defended sequencing logic' explicit.
- **grok** (score 9): Explicit substrate-first order (F1→F2→F3 then observability) with Tim re-judge in GATE only. Defended sequencing logic cites operator correction 2026-06-13 and why F6 after F3. Reordering would degrade quality.
- **deepseek** (score 9): Sequencing follows operator's 'substrate first, re-judge last' correction. Explicit order with defended rationale for top moves F3, F6, Tim-rejudge. Sequencing summary table present. Nearly excellent.

### D2_risk_discipline (weight 13)

- **gemini** (score 5): Started at 10. Deductions: -2 for destructive rollback in W4 (manual re-creation from audit log). -2 for happy-path-only test plan in W4 (just checks counts). -1 for plausible-but-untested rollback on DDL changes (F3, F6), i.e. 'rollback theater'.
- **gpt5** (score 4): Start 10; -3 W3 lacks rollback path (AE Proxy Test); -2 F3 rollback uses DROP COLUMN + git revert on migration (non-atomic) (F3 Rollback); -1 rollback theater (no item tests its rollback). Dependencies mostly named; plan not happy-path-only (F1/F3/F10 adversarial).
- **grok** (score 9): Started at 10. -1 for F3: schema rollback (DROP COLUMN) untested (rollback theater). All items have atomic paths + named deps + falsifiable tests (e.g., F1 historical replay).
- **deepseek** (score 7): Started 10, -2 for destructive rollback (F3 column drop loses data, no audit column), -1 for rollback theater (git checkout rollbacks untested). All items have rollback paths, dependencies, falsifiable tests. Score 7.

### D3_capability_coverage (weight 10)

- **gemini** (score 9): Strong. Plan has a 'Capability spine' header, and all 4 capabilities (M, K, L, S) are advanced by at least 2 items. Test plans defend the capability tags (e.g., F8's test verifies an observability write), meeting the 9-10 band.
- **gpt5** (score 8): Capability spine present. All 4 caps advance: K(F1,F2,F3,F4,F6,W1,W4,GATE), M(F8,F9,F5), L(Stop-hook,GATE), S(F7,F10,W3,W1). Some tags feel padded (W1 K+S), but coverage is real; tests for M include row-count checks (F8/F9).
- **grok** (score 9): Capability spine header present. Every F-item tagged and defended in test plans (e.g., F3: 'we will know K improved because domain_tier rows move from null to T1-T4'). All 4 caps advance with ≥2 items.
- **deepseek** (score 8): Capability spine header present. All four capabilities advance with ≥2 items. Simple tagging but no defense in test plans. Strong but not excellent.

### D4_defensibility (weight 11)

- **gemini** (score 10): Excellent. Every item traces to an audit or canon source (e.g., F8/F9 cite tool-audit items). The 'REBUILD bucket' and 'What this plan does NOT include' sections explicitly address deferred/dropped items, meeting the 9-10 band.
- **gpt5** (score 7): Many items cite audit/tool-audit (F1 BL-016; F8/F9 tool-audit items 13/16; Stop-hook item 7). Canon ties in F1/F2. Some items lack explicit audit refs (F4 staleness backfill, F10 portal action). No 'deferred because' blocks for dropped audit recs.
- **grok** (score 8): F1 cites canon 57-61, F3/F8 cite tool-audit 13+16, W1 cites audit wipe event. One minor gap: W3 proxy test reconstructs from memory without direct audit citation.
- **deepseek** (score 8): Most items trace to audit findings (tool-audit items cited). F2 is novel but with rationale. Deferred R1-R5 have operator-question block. Not all items carry specific audit citation numbers in test plans.

### D5_scope_discipline (weight 7)

- **gemini** (score 10): Started at 10. No deductions. The plan has an explicit 'What this plan does NOT include' section that correctly lists all 6 audit-ruled-out decisions. No scope creep or spirit-of-the-law violations are visible.
- **gpt5** (score 9): Start 10; -0 reopens: none. 'What this plan does NOT include' present (scope guard). -1 Slack auto-ingest (one of 6 settled items) not listed in out-of-scope. AE proxy kept as TEST, not default (W3 + out-of-scope). No spirit-of-law creep.
- **grok** (score 10): Started at 10. Explicit 'What this plan does NOT include' section lists all 6 settled decisions. No renames or spirit-of-law creep. Each in-scope item references POST-PORTAL v6.
- **deepseek** (score 10): No reopened audit-ruled-out decisions. Explicit 'What this plan does NOT include' section covers all 6 settled items. No spirit-of-the-law violations.

### D6_substrate_trust (weight 14)

- **gemini** (score 8): Strong. The plan closes the loop from F1 (kill-list) to F3 (ingest gate) to the final GATE re-judge. F3's quarantine pattern is excellent. Misses the 9-10 band because the GATE re-judge step lacks the specified adversarial/falsifiable replay test.
- **gpt5** (score 8): Deep K fixes: F1 pulls canon l57-61; F2 SoT alignment; F3 wires classifier + backfill + PROHIBITED quarantine; F4 date backfill to power staleness; GATE re-judge last. Missing GATE adversarial replay beyond F1’s 5 historical (no extra 5 crafted prompts).
- **grok** (score 9): F1 verbatim canon lines, F3 wire paths + quarantine pattern + backfill. GATE replays 5 historical hallucinations + adversarial prompts. End-to-end loop closed and mechanically verifiable.
- **deepseek** (score 8): F1 kill-list, F2 SoT alignment, F3 domain classifier with backfill and PROHIBITED quarantine. GATE re-judges against new gates. Lacks adversarial test prompts for re-judge. Strong but not excellent.

### D7_observability (weight 8)

- **gemini** (score 9): Excellent. The plan correctly prefers the OTEL path (F8/F9) over scattered INSERTs, specifies a fallback, and includes a cross-system check. The Stop-hook has a noise gate and a 'Downside acknowledged' section, meeting the 9-10 band.
- **gpt5** (score 8): F8/F9 prefer OTEL with session correlation (CLAUDE_CODE_SESSION_ID) and DB checks; fallback path named. Stop-hook has noise gate and limits. Impact verifiable via SELECTs. Slightly short of excellence: no explicit falsifiable test of OTEL fragility/bounds.
- **grok** (score 8): F8/F9 prefer OTEL with bounded fallback, CLAUDE_CODE_SESSION_ID correlation test, row-count verification (0→N). Stop-hook has explicit noise gate. Anticipates next problem class.
- **deepseek** (score 9): F8/F9 OTEL path with fallback, cross-system session ID check, noise gate on Stop-hook. Downside acknowledged. Pre/post DB queries verify rows land. Excellent.

### D8_human_in_loop (weight 4)

- **gemini** (score 10): Excellent. The plan includes an 'Open assumptions flagged' section, a tight operator question block in the 'REBUILD bucket', and names operator touchpoints in the GATE workstream. This perfectly matches the 9-10 band criteria.
- **gpt5** (score 9): Operator decisions locked up front (frontmatter). Per-prospect default + batch in F10. GATE operator touchpoints explicit. 'Open assumptions flagged' lists 4 crisp items. No auto-overwrite of Joe Kunz (W4 guardrail).
- **grok** (score 7): Operator decisions locked at top, per-prospect microsite default named, 5-question REBUILD block. Open assumptions section exists but only flags 4 items; Tim touchpoints in GATE not fully cost-audited.
- **deepseek** (score 10): Operator decisions locked at top. Per-prospect microsite approval default with batch option. REBUILD has 5 tight questions. Open assumptions section lists <5 items. GATE operator touchpoints per step.

### D9_concrete_spec_depth (weight 10)

- **gemini** (score 10): Started at 10. No deductions. Every item has file paths and anchors. Test plans are specified with concrete SQL queries (e.g., F3) or reproducible actions (e.g., F10), not vague 'manual checks'. The precision is exceptional.
- **gpt5** (score 7): Start 10; -3 many items lack explicit line anchors (most F-items have files; only F2/F7 give lines). Tests include concrete SQL and expected outputs (e.g., F8/F9 SELECTs), unit/integration tests (F1/F3), and negative checks (F10).
- **grok** (score 8): Started at 10. -2 for F8/F9: OTEL receiver lacks exact expected output strings; -0 for most others having file+lines+queries. Test plans reproducible except 2 OTEL edge cases.
- **deepseek** (score 10): All items have file paths, explicit anchors (function names, DDL, route paths). Test plans include commands and expected outputs. Pre/post DB queries where applicable. Reproducible by agent.

### D10_elegance_insight (weight 10)

- **gemini** (score 9): Excellent. The plan shows significant craft. Examples: F3's non-destructive quarantine, F8/F9's architectural choice of OTEL, the Stop-hook R5-lite's bounded innovation, and F6's root-cause semantic fix. The plan thinks 2-3 sprints ahead.
- **gpt5** (score 8): Second-order craft visible: F3 quarantines not delete (audit trail); F8/F9 OTEL substitution over hand-roll; Stop-hook R5-lite closes loop boundedly; F6 craft/facts split hits root semantic blur. Forward-looking REBUILD Qs. Could articulate ‘enables X’ more.
- **grok** (score 8): F3 quarantine (not delete) for audit trail, F6 semantic split addresses root blur, OTEL chosen over hand-roll for downstream extensibility. Observability surfaces next failure mode. 2-3 sprint thinking visible.
- **deepseek** (score 8): Multiple second-order moves: PROHIBITED-row quarantine for audit trail, OTEL substitution for architectural insight, Stop-hook noise gate, F6 semantic split. Reads 1-2 sprints ahead. Lacks adversarial tests for re-judge.

## Ship/Hold logic

- Pass bar: 70 (panel ✓ above)
- Ship target: 80 (panel ✓ above)
- Weakest-link gate: weakest dim ≥6 (panel ✓ above)
- **Result:** SHIP

## Convergence tracking (vs prior rounds)

This is round 1. No prior round to compare.

Convergence rule: <3 pt weighted-total move AND no dim Δ>2 across two rounds = declare convergence.

## Next step

Surface to operator for final red-team. Plan is ship-ready per panel — pass bar, ship target, AND weakest-link gate all cleared.


