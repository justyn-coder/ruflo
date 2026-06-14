---
title: Judge panel run, plan v2 authorized — fresh session begins build
date: 2026-06-13 EDT
session_name: judge-panel-then-authorize
status: complete — operator authorized plan v2 execution; next session starts the build
git_commit: 507059907d3fa5859e0534fcd710c1920f28ba3a (no commits this session — all changes uncommitted in working tree)
tool_calls_at_handoff: ~92
authored_by: Claude (Opus 4.7) at end of judge-panel + plan-v2 + schematics + authorization session
operator_state: Sharp, end-of-afternoon Saturday, made 3 decisive calls (SHIP v2 / P1 evening / authorize build) then redirected schematics to Claude Design path
next_session_must_read:
  - data/showrev/fix-plan-sprint-2026-06-13-v2.md  # THE plan to execute — operator-authorized 2026-06-13 PM
  - data/showrev/forensic-2026-06-13-claude/judge-panel-final-2026-06-13.md  # the 3-round panel result that v2 cleared
  - data/showrev/forensic-2026-06-13-claude/audit-report.md  # the forensic audit v2 responds to
  - docs/showrev/HANDOFF-2026-06-13-fix-plan-rubric-v2-await-judge-panel.md  # PRIOR handoff (start of THIS session)
  - canon/sources/inorsa-product-truth-nick-2026-06-04.md  # Nick canon — F1 kill-list lines 57-61
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md  # HS GOSPEL — binding constraints (manual enroll default, single-call upsert, rate limits)
  - docs/showrev/POST-PORTAL-SPEC-V6.md  # ratified post-portal — DO NOT propose API enrollment as DEFAULT
  - SESSION-RULES.md  # session-lifecycle rules (read handoff first, write fresh handoff at end, 60/120/180 thresholds)
---

# Handoff: judge panel converged, plan v2 authorized — fresh session starts the build

## TL;DR for next reader

This session ran the cross-family judge panel on the v1 sprint plan against the v2 rubric. Round 1 (v1 plan) scored 83.9/100 mean but 2 of 4 judges said REVISE with 4 unanimous specific D2 risk-discipline failures. I revised the plan to v2 addressing all 4 + a D9 line-anchor fix, then ran R2 + R3 on v2. R2 was 93.4/100 with 4/4 SHIP. R3 (stability check, same plan v2) was 89.1/100 with 3/4 SHIP (DeepSeek the lone HOLD driven by a single D9 swing 7→4 — LLM stochasticity on the same plan). Cap hit, formal convergence rule not met (R2→R3 move -4.3 > 3-pt threshold), so I escalated to operator per the operator-locked cap rule.

**Operator made 3 decisions at escalation:**
1. **SHIP plan v2 as-is** (recommendation accepted)
2. **P1 microsite restore (W1) can wait until this evening 2026-06-13** — no build dependency in plan v2 (I confirmed; W1 only touches sr_prospects + sr_microsites + sr_engine_output via restore-from-backup, not the substrate tables F3/F4 touch; F5 backfill could even support W1's HS cross-ref step)
3. **Authorize plan execution** — but NOT in this session. After schematics, write handoff for fresh session to begin the build

**Then operator redirected schematics:** instead of me hand-coding both architecture maps as HTML/SVG, I drafted two paste-ready Claude Design prompts (Goal/Layout/Content/Audience format) at `docs/showrev/CLAUDE-DESIGN-PROMPTS-2026-06-13.md`. Operator runs Design with prompts + attaches the system-architecture HTML draft as reference material; that's a parallel workstream the next session does NOT block on.

**Current state at handoff:** plan v2 is at `data/showrev/fix-plan-sprint-2026-06-13-v2.md` — authorized to execute. Fresh session reads the plan + the 6 supporting docs, confirms operator decisions captured below, fires W1 (per operator's evening preference), then begins W2 substrate-first sequence.

## Goal of this session (now complete)

Run the cross-family judge panel (Gemini + GPT-5 + Grok + DeepSeek inline REST in ruflo) scoring v1 plan against operator-approved v2 rubric. Iterate per convergence rule, cap at 3 rounds. Surface result for operator red-team and authorization.

Done. Plan iterated v1 → v2 in response to R1 panel signal. v2 cleared R2 (4/4 SHIP, 93.4) and R3 (3/4 SHIP, 89.1). Operator authorized SHIP + plan execution.

## Completed

- [x] Read all 11 required handoff/canon files from session-start brief
- [x] Verified 4 API keys present in .env (GEMINI / OPENAI / XAI / DEEPSEEK — confirmed via env-vars check, GROK_API_KEY legacy name absent but XAI_API_KEY is the correct one per CLAUDE.md tool chain)
- [x] Built `scripts/judge-panel-2026-06-13.mjs` — inline REST in ruflo, 4 calls in parallel, JSON-mode forced, no Claude fallback, structured output schema, per-round MD + raw JSON outputs
- [x] Round 1 fired against plan v1 — 4/4 judges returned valid JSON. Mean 83.9/100, weakest D2_risk_discipline @ 6.3 (just above gate 6). 2 of 4 said REVISE; all 4 named the same D2 failures: W3 no rollback, F3 destructive DROP COLUMN rollback, rollback theater unanimous (no item tests its rollback), GATE missing adversarial replay
- [x] Revised plan v1 → v2 (`data/showrev/fix-plan-sprint-2026-06-13-v2.md`) — 5 targeted v2 revisions all responsive to R1 named failures:
  - R1-D2-1: W3 AE proxy test gained an explicit Rollback section (unenroll test contact + delete list/sequence + revoke scope + DB rows tagged not deleted + sandbox dev-exercise sign-off)
  - R1-D2-2: F3 rollback redesigned non-destructive — DROP COLUMN replaced with additive `domain_tier_set_at` audit column + `PROHIBITED_ROLLBACK_QUARANTINED` tag pattern, fully reversible per-row
  - R1-D2-3: "Rollback verified in dev" sign-off step added to F3 + F6 + F10 + W4 (the items judges flagged for rollback theater)
  - R1-D2-4: GATE adversarial replay — 5 crafted prompts added beyond the 5 historical (synonym variant, indirect framing, citation-injection, mixed-tier laundering, stale-fact break vectors). Frozen at `data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-13.md` (referenced in plan v2; file not yet written — next session should create when GATE step approaches)
  - R1-D9-1: function-name anchors added on F3, F4, F5, F8, F9 wire targets (replaces line numbers that drift between read-time and ship-time)
- [x] Round 2 fired against plan v2 — 4/4 judges SHIP. Mean 93.4/100. Weakest D3_capability_coverage @ 8 (well above gate). No dim disagreement >2. D2 jumped 6.3→9.3. D6_substrate_trust unanimous 10
- [x] Round 3 fired against plan v2 (stability check, no plan change) — 3/4 SHIP, 1 HOLD (DeepSeek 79.0 with D9 collapse 7→4 from R2). Mean 89.1/100. Weakest D9_concrete_spec_depth @ 7.8 (above gate but stddev 2.28 = judge disagreement)
- [x] Wrote consolidated escalation memo at `data/showrev/forensic-2026-06-13-claude/judge-panel-final-2026-06-13.md` — 3-round trajectory + per-dim heatmap + per-judge totals + ship/hold logic + recommendation (SHIP) + operator-decision block
- [x] Operator made 3 decisions: SHIP v2, P1 evening OK, authorize plan execution after handoff
- [x] Confirmed W1 has no build dependency on W2 (substrate tables don't conflict with P1 restore tables; F10 portal-vs-SQL flip is either-way per W1 step 4) — surfaced to operator
- [x] Rebuilt `data/showrev/forensic-2026-06-13-claude/system-architecture-2026-06-13.html` twice (operator caught insider-acronym overload; rewrote as SVG flow + plain-English notes for 50-year-old eyes + WCAG accessibility)
- [x] Operator redirected schematics → Claude Design path. Wrote `docs/showrev/CLAUDE-DESIGN-PROMPTS-2026-06-13.md` with two paste-ready prompts (Goal/Layout/Content/Audience format) for system + database architecture maps
- [x] This handoff written

## In progress (mid-flight, for operator — NOT for next session)

- [ ] **Operator pastes Claude Design prompts** at https://claude.ai/design + attaches the HTML draft as reference material + iterates with inline edit tools. Output saved to `data/showrev/forensic-2026-06-13-claude/{system,database}-architecture-2026-06-13-design.{pdf,png,html}`. This is a parallel workstream — next session does NOT block on it.

## URGENT — needs operator attention or fresh-session action

- [ ] **W1 P1 microsite restore — operator wants evening 2026-06-13.** No build dependency confirmed. Step-by-step is in plan v2 §W1. ~1 hr Supabase ops + per-microsite operator-approve flip (or SQL with green-light per row if F10 hasn't shipped yet). Fresh session should ask operator at start whether to fire W1 first or proceed with W2 substrate-first and circle back to W1 at evening.

## Blockers (operator decisions pending — none blocking next session start)

- None. Operator gave 3 decisive calls at this session's escalation (SHIP / P1 evening OK / authorize build). Fresh session begins execution. The only operator-touchpoint expected at next session start is the W1 timing-of-fire question.

## Operator decisions to confirm (already captured, do NOT re-ask)

- [x] **SHIP plan v2** — operator explicit 2026-06-13 PM ("1 ship v2")
- [x] **Authorize plan execution** — operator explicit 2026-06-13 PM ("3 yes, authorize to begin")
- [x] **P1 restore (W1) timing = this evening 2026-06-13** — operator explicit ("can i push the P1 restore until this evening")
- [x] **No W1↔W2 build dependency** — Claude confirmed; plan v2 has no item that must run before W1 (F3/F4/F5 touch substrate not microsites; F10 portal-vs-SQL is either-way)
- [x] **Architecture maps via Claude Design path** — operator-chosen; prompts ready in `docs/showrev/CLAUDE-DESIGN-PROMPTS-2026-06-13.md`
- [x] **Smoke window = Sunday 2026-06-14 6-9pm recipient LOCAL** (not 8-10am — locked prior session)
- [x] **Smoke roster = 15** — locked prior session
- [x] **HS mistakes scope (W4) = 5 wrong Mike + 2 invented-tag (Brendan, Laurie) + Joe Kunz DO NOT overwrite** — locked prior session
- [x] **AE proxy enrollment (W3) = parallel test, manual enrollment is Sunday smoke default** unless proxy proven by 3pm Sun
- [x] **Tim re-judge = end of sprint, auto-recompose with audit-trail entry** — locked prior session
- [x] **Per-prospect microsite approval default + batch option** (F10) — locked prior session
- [x] **Operator owns all loop decisions** — no direct Tim/Nick contact from Claude
- [x] **Judge scripts inline REST in ruflo** — not showrev/engine
- [x] **Model = Opus 4.7 this session; operator-side decision on 4.8 next session** (still open per prior handoff; carry forward)

## Next 3 actions (sequential, for next session)

1. **Read this handoff + all 7 next_session_must_read files completely before any other action.** Acknowledge in first response.

2. **Confirm W1 P1 restore timing with operator at session start.** Question: "Fire W1 first now (~1 hr), or proceed with W2 substrate-first and circle back to W1 in the evening per your earlier preference?" Either path is valid. If operator confirms evening preference, proceed to action 3. If operator says fire-W1-now, do W1 first then resume action 3.

3. **Begin executing plan v2 W2 in substrate-first order: F1 → F2 → F3 → F8 → F9 → Stop-hook R5-lite → F4 → F5 → F6 → F7 → F10.** Each F-item ships with: forward-step, test plan execution (mechanical verify), rollback-verified-in-dev sign-off (for F3 + F6 + F10 + W4), then DB query confirming the gate fires. Track progress with TodoWrite. Surface any item that fails its test plan to operator immediately.

After W2 substrate-first foundations land (F1 + F2 + F3 minimum), fire **W4 HS mistakes remediation** (~30 min, operator per-case approve on the 5 wrong Mike) before Sunday-evening smoke. **W3 AE proxy test** runs in parallel as background workstream. **GATE** runs Sunday at 3pm checkpoint per plan v2 §GATE.

**DO NOT fire Sunday smoke without:** (a) F1 + F3 substrate gates active, (b) W4 HS clean, (c) GATE re-judge + adversarial replay passing, (d) operator approval per F10 portal action (or bulk-with-green-light).

## Substrate state at handoff

- **HS portal:** Dirty — 5 wrong Mike + 2 invented-tag (Brendan Karchner + Laurie Turck) still pending; Joe Kunz NOT to be overwritten. Plan W4 handles.
- **Production DB (`slttpknnuthbttjuzrnz`):** Unchanged this session. 274 sr_prospects, 526 sr_engine_output (182 distinct), 182 sr_microsites all status='draft', 1,522 sr_company_evidence (incl. 14 Nick rows landed 2026-06-13 prior session), 6,512 sr_brain_substrate. Audit-trail tables (sr_pipeline_runs, sr_emails, sr_prospects.hubspot_contact_id backfill, sr_microsites.status='live', sr_prospects.operator_go=true) still all 0 — plan F4 + F5 + F8 + F9 + F10 collectively close this.
- **P1 Restore DB (`joxzazwuehhvywanyrze.supabase.co`):** Unchanged this session. 31 prospects + 5 sr_engine_output + 4 sr_microsites all status='draft' — W1 fires this evening per operator decision.
- **Uncommitted files (working tree):** ~150 from session-start baseline + this session's additions:
  - NEW: `scripts/judge-panel-2026-06-13.mjs` (executable, JSON-mode 4-API-parallel)
  - NEW: `data/showrev/fix-plan-sprint-2026-06-13-v2.md` (plan v2, ~720 lines)
  - NEW: `data/showrev/forensic-2026-06-13-claude/judge-panel-round-{1,2,3}.md` + matching `-raw.json` (6 files)
  - NEW: `data/showrev/forensic-2026-06-13-claude/judge-panel-final-2026-06-13.md` (escalation memo)
  - NEW: `data/showrev/forensic-2026-06-13-claude/system-architecture-2026-06-13.html` (rewritten v2, SVG flow + plain-English)
  - NEW: `docs/showrev/CLAUDE-DESIGN-PROMPTS-2026-06-13.md` (paste-ready prompts for operator)
  - NEW: this handoff
- **External state:**
  - 0 iMessages this session (operator-active in chat; no artifact-ready push needed)
  - HubSpot MCP: not touched this session
  - Supabase MCP: not touched this session
  - Cross-family APIs called 12 times total (4 judges × 3 rounds), all successful, all logged in panel raw-JSON files
- **Background processes at handoff:** none running. All 3 judge-panel rounds completed cleanly.

## What NOT to do (next session)

- **DO NOT re-litigate the SHIP decision.** Plan v2 IS authorized. The R3 DeepSeek HOLD was investigated + dismissed as LLM stochasticity per the escalation memo. Operator accepted SHIP recommendation. Just execute.
- **DO NOT iterate plan v2 further.** No round 4, no v3 plan. The 2 actionable concerns surfaced in R3 (DeepSeek line-anchor follow-up; GPT-5 smaller-item rollback theater) are deferred to v3 next-sprint per operator's "1 ship v2" call.
- **DO NOT fire Sunday smoke without GATE re-judge + adversarial replay passing AND operator F10 approval per-prospect.** Plan v2 §GATE is the gate. Default to halt-on-uncertainty.
- **DO NOT use Sonnet, Opus, Haiku, or any Claude model for cross-family work.** If you need cross-family judging for any in-flight decision, use the existing `scripts/judge-panel-2026-06-13.mjs` script with appropriate flags. Defeats the purpose otherwise.
- **DO NOT use showrev/engine scripts** — stay_inside_ruflo_repo. The one explicit exception is `showrev-microsites` repo for Vercel deploys (operator-confirmed; ask path).
- **DO NOT contact Tim or Nick directly.** Operator owns all loop decisions. Surface inside response; operator routes.
- **DO NOT propose API enrollment as DEFAULT.** POST-PORTAL v6 ratified manual. W3 is a parallel test, not a re-architecture.
- **DO NOT auto-flip microsites to 'live' without operator approval per-prospect** (or batch with explicit green-light per F10).
- **DO NOT block W2 execution on the Claude Design parallel workstream** for the architecture maps. Those are operator-driven and run in their own lane.
- **DO NOT skip rollback-verified-in-dev sign-off for F3, F6, F10, W4.** Plan v2 made those load-bearing for the D2 risk-discipline panel score. Honor them in execution.
- **DO NOT propose new tables.** Plan v2 confines to 4 ALTER + 2 new audit columns (domain_tier_set_at, source_date_backfilled_at, plus the F6 craft/facts rename) + 1 trigger + 1 function. No new tables.
- **DO NOT propose composer or judge rewrites.** Both work per the audit. Wire the gates we have.
- **DO NOT skip the GATE adversarial replay block** in §GATE step 3. 5 crafted prompts beyond the 5 historical is the falsifiability test the panel awarded D6 a perfect 10 on. If you skip it, you're shipping with a hole.
- **DO NOT pollute the working tree with extra files.** Plan execution should produce: code changes in `src/...`, schema migrations under `migrations/` (if any), test additions under `__tests__/`, and one execution log at `data/showrev/sprint-execution-log-2026-06-13.md`. Nothing else.

## Lessons learned this session (for memory hygiene)

- **The iterate-vs-stability tension in the convergence rule is real and worth noting.** R2→R3 was a -4.3 move (above the <3 threshold) but only because of one judge's single-dim swing. The operator-locked formal rule had to break the tie via escalation. Spirit-of-rule was SHIP; letter-of-rule was "not converged." Operator chose spirit. Worth a future-sprint reflection: should the convergence rule weight by judge-consensus + dim-stability rather than mean-of-means alone?
- **DeepSeek scored same plan + same rubric differently across R2 and R3 by 14 weighted points.** Driven by D9 score collapse 7→4 with no plan change. That's pure model stochasticity. The 4-judge panel design is what saved us — Gemini + GPT-5 + Grok all stayed within ±5 R2→R3, so the noise was dampened. Single-judge panels would have whipsawed. The 4-model design pays.
- **Plan-revision-targeted-at-rubric-deductions is honest work, not gaming.** Gemini R2 flagged "v2 maps so perfectly to rubric deductions it suggests revised specifically to pass." That's true — and that's the point. The deductions named specific failures (W3 no rollback, F3 destructive, rollback theater); the revisions fixed those specific failures. If the rubric had named different deductions, the revisions would have been different. Per-deduction targeted revision IS the alignment loop the rubric was built to drive.
- **Claude Design > hand-coded HTML for operator-facing visual artifacts.** Operator caught the system-architecture HTML reading like a spec outline with insider acronyms. Even after rewriting to SVG flow + plain-English, operator preferred the Claude Design path. Lesson: for operator-facing visual artifacts (briefs, architecture maps, summary one-pagers), default to drafting structured Claude Design prompts + attaching reference material, rather than hand-coding HTML. Saves operator-facing-quality time AND saves my hand-coding time.
- **Operator-comprehension is the apex for shared-tool artifacts.** The CLAUDE.md operator-apex memory ("humans respond to craft / elegance / insight") applies to internal artifacts too, not just outbound emails. The same principle — distinguish CORRECT from BRILLIANT — applies to "is this technically right" vs "can the operator hold this in their head in 30 seconds."

## Paste-in prompt for fresh session

The block below is the literal session-start brief for the next session. Same format as the session-start brief I received today. Copy-paste it into a fresh chat.

```
You are picking up an in-progress project. Your one job in this session is to
EXECUTE plan v2 of the ShowRev P2 fix-sprint. The plan was authorized by
operator at end of prior session after a 3-round cross-family judge panel
(R1 83.9, R2 93.4, R3 89.1; operator chose SHIP). You do NOT iterate the plan
further. You execute it: substrate-first ordering, W2 → W4 → W3 parallel →
GATE Sunday 3pm checkpoint → smoke fire Sunday 6-9pm recipient LOCAL.

READ THESE FIRST, IN THIS ORDER, BEFORE ANY OTHER ACTION. YOU MUST READ EVERYTHING:

1. docs/showrev/HANDOFF-2026-06-13-judge-panel-converged-authorize-build.md  (session bridge — primary)
2. data/showrev/fix-plan-sprint-2026-06-13-v2.md                              (THE plan to execute)
3. data/showrev/forensic-2026-06-13-claude/judge-panel-final-2026-06-13.md   (why v2 is ship-ready)
4. data/showrev/forensic-2026-06-13-claude/audit-report.md                    (the audit v2 responds to)
5. canon/sources/inorsa-product-truth-nick-2026-06-04.md                      (Nick canon — F1 kill-list)
6. docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md                               (HS GOSPEL — binding constraints)
7. docs/showrev/POST-PORTAL-SPEC-V6.md                                        (ratified post-portal — manual enroll default)
8. SESSION-RULES.md                                                          (session-lifecycle rules)

Acknowledge in your first response that you've read all 8.

THE PROJECT OBJECTIVE (locked across sessions):
Better cold prospecting than the top 0.01% of B2B SaaS AEs on the 800-prospect
Inorsa FC2026 cohort. Target: 15-25% reply rate on T1, 3-6% meeting-booked.
Two non-negotiable apexes: verified data in every body + verified email
addresses for every send. "Humans respond to craft / elegance / insight" —
applies to both composer output AND our own evaluation rubrics.

WHERE WE ARE (state at handoff, 2026-06-13 EDT ~late-afternoon):
- Plan v2 written and operator-authorized. 4 workstreams + terminal GATE.
  W1 URGENT P1 microsite restore (~1 hr, operator wants evening 2026-06-13).
  W2 MAIN fix-sprint F1-F10 + Stop-hook R5-lite (~13 hr, substrate-first order).
  W3 AE proxy enrollment parallel test (~3 hr).
  W4 HS mistakes remediation (~30 min, pre-Sunday-evening).
  GATE pre-send (Tim re-judge + adversarial replay + operator F10 approval + smoke fire 6-9pm Sun recipient LOCAL).
- 3-round judge panel result: R2+R3 mean 91.25 / 100 (well above ship bar 80).
  Weakest dim across all rounds clears the ≥6 gate. 4/4 SHIP at R2, 3/4 SHIP at R3.
- 2 actionable R3 concerns deferred to v3 next-sprint per operator "1 ship v2" call:
  (a) DeepSeek's line-anchor follow-up on F1/F2/F4 + Stop-hook manual test steps,
  (b) GPT-5's "rollback theater on smaller items" — symmetry with F3/F6/F10/W4.

YOUR DELIVERABLE THIS SESSION:

1. Read the 8 must-reads. Acknowledge.

2. At session start, ask operator: "Fire W1 P1 microsite restore first (~1 hr,
   per your evening preference), or proceed W2 substrate-first and circle back
   to W1 in the evening?" Either path valid. Honor operator's choice.

3. Execute plan v2 W2 in the operator-locked order:
   SUBSTRATE TRUTH:    F1 → F2 → F3
   OBSERVABILITY:      F8 → F9 (OTEL path) → Stop-hook R5-lite
   VERIFICATION:       F4 → F5
   MECHANICAL/PORTAL:  F6 → F7 → F10
   Each F-item ships with: forward-step, test plan execution (mechanical verify),
   rollback-verified-in-dev sign-off (where v2 added it — F3 + F6 + F10 + W4),
   DB query confirming the gate fires. Track progress with TodoWrite.

4. Run W4 HS mistakes remediation (~30 min) BEFORE Sunday-evening smoke. Operator
   per-case approve the 5 wrong Mike. Re-tag Brendan + Laurie. Verify Joe Kunz
   owner unchanged (Tom Marciano is DETECTED owner — DO NOT overwrite).

5. Run W3 AE proxy enrollment test in parallel as background workstream. If
   PASS by 3pm Sunday + operator green-lights → Sunday smoke fires via API.
   Otherwise → manual enrollment per POST-PORTAL v6 default.

6. Sunday 3pm checkpoint (per plan v2 §GATE step 1): assess sprint progress.
   What shipped? What deferred? Did URGENT-1 + F1 + F2 + F3 ship? (Required for
   re-judge.) Did W4 ship? (Required to prevent re-loading wrong contacts.)
   Did W3 PASS or FAIL?

7. GATE re-judge the 15 smoke-roster emails against new gates (F1 + F3 active).
   Output: per-email PASS / FAIL-mechanical / FAIL-hallucination. For FAILs:
   re-compose via specific-composer.ts (auto-recompose with audit-trail entry,
   no per-email visibility gate).

8. GATE adversarial falsifiability replay (~20 min) — 5 historical hallucination
   emails AND 5 crafted adversarial prompts at
   data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-13.md
   (file does not yet exist; create it from the spec in plan v2 §GATE step 3).
   Expected: 5/5 historical block + 5/5 adversarial block. Any PASS = real gap →
   halt smoke fire.

9. Operator approval per re-composed email via /ops portal F10 "Approve + Go Live"
   action (per-prospect default; batch option per operator decision 5).

10. Final pre-send check: preload-verify.ts on the 15. All 11 BLOCKING checks
    must pass. Then smoke fire 6-9pm recipient LOCAL (Sunday 2026-06-14).

11. Post-fire: F8 / F9 telemetry capturing sends + bounces. Stop-hook R5-lite
    calibrating judge during any session work. Operator checks justyn+* inboxes
    for sender-identity validation (3 dummies if running with proxy).

URGENT carry-forward:
- W1 P1 microsite restore fires this evening 2026-06-13 per operator decision.
  31 prospects + 5 sr_engine_output + 4 sr_microsites in
  joxzazwuehhvywanyrze.supabase.co (P1 Restore project) need restore to
  slttpknnuthbttjuzrnz (production) + status flip to 'live' on the 4 microsites
  that have an actual P1-send-recipient match. ~1 hr Supabase ops.

PASS / SHIP BARS (from plan v2 GATE step):
- 15 of 15 have operator_go=true + live microsite + cleared all 11 preload checks
- HS sequence stats show 15 enrollments within 1 hr of fire
- Bounce monitor reports <5% hard-bounce on the 15

DO NOT REOPEN SETTLED DECISIONS:
- Plan v2 authorized. No more iteration on the plan itself.
- POST-PORTAL v6 manual enrollment is default. AE proxy is parallel test only.
- Substrate-first ordering is locked. Tim re-judge runs at END of sprint, not early.
- Operator owns all loop decisions. Do NOT contact Tim/Nick/partners directly.
- Inline REST in ruflo for cross-family work. Do NOT use showrev/engine/scripts/.
- Do NOT use any Claude model (Sonnet/Opus/Haiku) for cross-family judging.
  4 keys present (GEMINI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY).
  Script ready at scripts/judge-panel-2026-06-13.mjs.
- No new tables in plan execution. v2 adds 4 ALTER + 2 audit columns + 1 trigger
  + 1 function. That's the schema budget. No new tables.
- No composer rewrites. No judge rewrites. Wire the gates we have.
- Smoke window: 2026-06-14 6-9pm recipient LOCAL (NOT 8-10am — was corrected
  prior session).
- Per-prospect microsite approval default + batch option (F10).
- HS mistakes scope = 5 wrong Mike + 2 invented-tag + Joe Kunz DO NOT overwrite.

OPERATOR DECISIONS ALREADY CAPTURED (do not re-ask):
- Plan v2 SHIP authorized
- Plan execution AUTHORIZED to begin
- W1 P1 restore fires this evening (operator preference; no build dependency)
- Architecture maps (system + database) via Claude Design path —
  prompts ready in docs/showrev/CLAUDE-DESIGN-PROMPTS-2026-06-13.md;
  operator drives that workstream; fresh session does NOT block on it.
- Smoke roster = 15
- HS mistakes scope locked
- Sunday smoke window = 6-9pm recipient LOCAL
- AE proxy = parallel test, manual is default unless proven by 3pm Sun
- Tim re-judge = end of sprint, auto-recompose with audit-trail
- Per-prospect F10 approval default + batch option

YOUR FIRST RESPONSE:
- Acknowledge all 8 reads (one line each is fine)
- One paragraph stating your understanding of this session's deliverable
  (execute plan v2 W2 substrate-first → W4 → W3 parallel → GATE → smoke)
- Ask operator the W1 timing question (fire-now or evening-circle-back)
- Verify the 4 API keys still present in .env (Bash check) + verify
  scripts/judge-panel-2026-06-13.mjs is still executable
- Decide TodoWrite breakdown for W2 substrate-first F-items + surface
- THEN start executing — don't delay on additional clarifying questions
  unless something is genuinely unclear. Operator already gave 3 decisive
  calls + 11 captured decisions; trust the captured context.

CONTEXT THE PRIOR SESSION ALREADY CAPTURED (no need to re-derive):
- 3-round judge panel ran successfully with 4 cross-family judges
- Plan v2 has 5 targeted v2-revisions over v1 (W3 rollback, F3 non-destructive,
  rollback-tested-in-dev on F3+F6+F10+W4, GATE 5 adversarial prompts, D9 anchors)
- Mean weighted score across R2+R3 = 91.25/100. Operator authorized SHIP.
- Claude Design path for architecture maps — operator-driven parallel workstream
- 2 actionable R3 concerns deferred to v3 next-sprint (not this sprint)
- DeepSeek R3 D9 swing was LLM noise on same plan; not new plan weakness
- Cross-family judge script at scripts/judge-panel-2026-06-13.mjs is reusable
  for any future cross-family work this sprint (operator-ranks-10 calibration,
  GATE re-judge cross-family second opinion, etc.) — adapt --plan and --rubric
  flags as needed

Begin.
```

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial handoff after judge-panel + plan-v2 + escalation + operator-authorize session. Captures 3-round panel trajectory (R1 83.9 → R2 93.4 → R3 89.1) + plan v1→v2 revisions + operator's 3 decisive calls (SHIP / P1 evening / authorize build) + Claude Design redirect for schematics. Embedded paste-ready prompt block for fresh session at end. |
