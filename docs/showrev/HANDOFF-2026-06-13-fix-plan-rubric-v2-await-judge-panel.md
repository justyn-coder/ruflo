---
title: Fix-plan v1 written, rubric v2 APPROVED — fresh session runs cross-family judge panel
date: 2026-06-13 EDT
session_name: fix-plan-rubric-v2
status: mid-task — v2 rubric approved, ready for judge panel in fresh session
git_commit: 507059907d3fa5859e0534fcd710c1920f28ba3a
tool_calls_at_handoff: 85
authored_by: Claude (Opus 4.7) at end of ~3h fix-plan + rubric-build session
operator_state: Sharp, mid-session, on Opus Max effort. Chose handoff-then-fresh-session for judge panel to preserve quality on iteration synthesis.
next_session_must_read:
  - data/showrev/fix-plan-sprint-2026-06-13.md  # THE primary artifact — v1 sprint plan being scored
  - data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md  # v2 RUBRIC the judge panel will score the plan against. HOLDING on operator approval before use.
  - data/showrev/forensic-2026-06-13-claude/rubric-external-audit.md  # Gemini's REVISION verdict on v1 rubric — the reason v2 exists. Read to understand why v2 differs.
  - data/showrev/forensic-2026-06-13-claude/audit-report.md  # The forensic audit the plan responds to
  - data/showrev/forensic-2026-06-13-claude/tool-audit.md  # Tool-capabilities audit (RuVector, Claude Code OTEL, Ruflo, etc.) — folded into plan
  - docs/showrev/HANDOFF-2026-06-13-audit-complete.md  # PRIOR handoff (start of this session)
  - canon/sources/inorsa-product-truth-nick-2026-06-04.md  # Nick canon — kill-list lines 57-61 (BL-016 + plan F1)
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md  # HS GOSPEL — binding HS constraints
  - docs/showrev/POST-PORTAL-SPEC-V6.md  # Ratified post-portal — DO NOT propose API enrollment as DEFAULT
  - SESSION-RULES.md  # session-lifecycle rules
---

# Handoff: fix-plan + rubric build + Gemini audit complete, HOLDING for operator approval before judge panel

## TL;DR for next reader

This session took the prior audit (`audit-report.md`) and turned it into a sprint plan (`fix-plan-sprint-2026-06-13.md` — substrate-first ordering, F1-F10 + URGENT-1 + Stop-hook R5-lite + AE proxy parallel test + HS mistakes fix + pre-send gate + REBUILD operator-decision block + RE-ORCH cadence). Then per the operator-confirmed governance protocol (rubric → show → cross-family judge → iterate), a v1 rubric was built (by a Claude subagent — see "Lessons learned"), externally audited by Gemini 2.5 Pro (verdict: REVISION), and revised to v2 along operator-selected **Path 2 (Affirmative-First)** — adopting Gemini's weight shifts + adding D10 Elegance / Insight / Second-Order at weight 10 + R-3 Falsifiability + R-4 anti-patterns + R-5 deduction scoring; deferring 3 blind-spot dims (Cost / PII / Stakeholder) to v3 next-sprint rubric.

**Current state: v2 rubric APPROVED by operator** (verbatim: "v2 approved" 2026-06-13 PM). Next session runs the cross-family judge panel (Gemini + GPT-5 + Grok + DeepSeek inline REST in ruflo, NOT showrev/engine scripts, NOT Sonnet/Claude) against v1 plan + v2 rubric, capped at 3 iteration rounds with convergence rule (<3 pt move + no dim Δ>2).

## Goal of this session

Take the forensic audit produced by the prior session and turn its FIX recommendations into a concrete sprint plan the operator can red-team. Then run the operator-confirmed governance protocol (rubric → judge panel → iterate) against the plan before any code ships.

## Completed

- [x] Read all 8 required inputs from prior handoff (audit, schematic, backlog, Nick canon, HS GOSPEL, POST-PORTAL v6, SESSION-RULES, prior handoff)
- [x] Saved 5 new memories (operator-loop-decisions, p2-sunday-smoke-window, ae-proxy-enrollment-test-open, sprint-ordering-substrate-first-tim-rejudge-last, humans-respond-to-craft) + updated MEMORY.md
- [x] Surgical memory hygiene pass (removed bare emails from MEMORY.md line 1; removed stale [Local Drive Access] tombstone)
- [x] Tool audit complete — `data/showrev/forensic-2026-06-13-claude/tool-audit.md` — 5 sources (RuVector gist, Claude Code changelog, Ruflo v3.10.x, other Anthropic tools, Ruvent ecosystem). Top 3: OTEL + post-session hook + stdio MCP session-ID propagation (F8/F9 simplification); Stop hook `additionalContext` (R5-lite within-session learning loop); `/code-review --fix` + `/simplify` (FIX-bucket accelerator). Side flag: CLAUDE.md Tool Chain Reference is 40+ Ruflo patch releases stale.
- [x] Sprint plan v1 written — `data/showrev/fix-plan-sprint-2026-06-13.md` — substrate-first ordering, ~650 lines, 4 workstreams (W1 URGENT-1 P1 microsite restore, W2 main F1-F10 + Stop-hook R5-lite, W3 AE proxy parallel test, W4 HS mistakes remediation) + terminal GATE (pre-send re-judge → operator approval → smoke fire). 12 operator decisions locked in frontmatter.
- [x] Rubric v1 built by `general-purpose` Claude subagent — 9 dimensions, weights sum 100. Operator flagged process gap: should have been cross-family from start (subagent ≠ external family). Acknowledged.
- [x] Gemini 2.5 Pro external audit of v1 rubric — `data/showrev/forensic-2026-06-13-claude/rubric-external-audit.md` — Gemini called inline via REST (key sourced from `.env`, masked, request files deleted). Verdict: **REVISION**. 3 blind spots (cost/PII/stakeholder), 2 weight-bias findings (D9 critically under-weighted vs operator's "precision" pillar; D1>D6 was inverted), 3 anti-pattern coverage gaps (rollback theater, capability-tag inflation, spirit-of-law scope creep), 2 operator-intent gaps (defensive-only / no affirmative craft dim).
- [x] Operator selected Path 2 (Affirmative-First) after I presented 3 reformulated paths (after rejecting an AskUserQuestion widget mid-flow per operator preference). Defended Path 2 over Path 1 (12-dim over-engineering) and Path 3 (half-measured blind-spot pick).
- [x] Rubric v2 written inline — `data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md` (supersedes v1, version history captures diff) — 10 dimensions, weights sum 100. **NEW D10 Elegance/Insight/Second-Order at weight 10** (apex-aligned with operator's "humans respond to craft" elevation). R-1 weight shifts (D1↓13, D4↓11, D6↑14, D9↑10) + R-3 Falsifiability baked into D2 + D6 9-10 bands + R-4 three new anti-patterns + R-5 deduction scoring for D2/D5/D9. R-2 three blind-spot dims (Cost/PII/Stakeholder) DEFERRED to v3 with hand-audit notes for this sprint.
- [x] Two iMessage texts sent to operator (rubric ready, then Gemini audit verdict, then v2 rewrite done) per standing operator instruction "text me when artifacts ready"

## In progress (mid-flight)

- [x] **Operator approval on v2 rubric** — APPROVED 2026-06-13 PM (verbatim: "v2 approved"). Unblocks judge panel.

- [ ] **Cross-family judge panel** (owner: Claude, next session)
  - Current state: NOT STARTED. v2 rubric approved + ready; this session chose handoff-then-fresh-session for the panel to preserve quality on iteration synthesis (tool count was at 85, panel would push toward 120).
  - Next step: spawn 4 inline REST calls — Gemini 2.5 Pro + GPT-5 + Grok + DeepSeek — each scoring the v1 plan against v2 rubric. Aggregate per-dimension. Use the convergence rule (<3 pt move + no dim Δ>2 across 2 rounds = declare done). Cap at 3 rounds per operator decision; escalate to operator at cap.
  - Owner: Claude (next session)

## URGENT — needs operator attention before next session ends

- [ ] **P1 microsites likely still broken in production** (carried forward from prior audit handoff — NOT actioned this session). 31 prospects + 4 draft microsites in `joxzazwuehhvywanyrze.supabase.co` (P1 Restore). 45 P1 booth-visitor contacts received emails last week; their microsite links return nothing under anon RLS right now. **W1 in the sprint plan addresses this — but the sprint plan is gated on judge-panel iteration which is gated on operator approval.** If operator wants to action W1 ASAP (independent of plan iteration), it's ~1 hr Supabase + per-microsite operator-approve flip.

## Blockers (operator decisions pending)

- [x] ~~v2 rubric approval~~ — APPROVED 2026-06-13 PM. No longer blocking.
- [ ] **W1 P1 microsite restore — fire ASAP or fold into post-judge-panel plan execution?** (Argument for ASAP: live trust degradation every day until fixed. Argument for fold-in: plan execution starts immediately after panel converges anyway.)
- [ ] **HS mistakes remediation (W4) scope** — confirmed earlier this session via PM handoff (5 wrong Mike + 2 invented-tag contacts re-tag + Joe Kunz DO NOT overwrite guardrail). When to action: pre-Sunday-evening, before smoke roster fires.

## Operator decisions to confirm

- [x] Path 2 selected (Affirmative-First) — locked
- [x] Smoke roster = 15 — locked
- [x] HS mistakes scope = 5+2+Joe Kunz guardrail — locked
- [x] Sunday smoke window = 2026-06-14 6-9pm recipient LOCAL — locked (memory saved)
- [x] Judge scripts: inline REST in ruflo (not showrev/engine) — locked
- [x] Judge iteration cap = 3 then escalate — locked
- [x] Model: Opus 4.7 this session; operator-side decision on 4.8 next session
- [x] Stop-hook R5-lite IN scope — locked
- [x] AE proxy enrollment: parallel test workstream; Sunday smoke fires manual by default, override possible if proxy test passes by 3pm Sun — locked
- [x] Tim re-judge: end of sprint, not early. Auto-re-compose with "previous Tim approval = stale" audit trail (no visibility gate) — locked
- [x] Operator owns all loop decisions (no direct Tim/Nick contact from Claude) — locked, memory saved

## Next 3 actions (sequential, for next session)

1. **Read this handoff + all 9 next_session_must_read files completely.** Acknowledge in first response. v2 rubric IS APPROVED (this session captured operator's "v2 approved" before clear). No further approval question to ask before judge panel — proceed directly to action 2.

2. **Build the inline REST judge-panel script.** Path: `scripts/judge-panel-2026-06-13.ts` or `.py` (operator decided "inline REST in ruflo," see frontmatter). 4 API calls in parallel (Gemini 2.5 Pro, GPT-5, Grok, DeepSeek), each receiving (a) the v1 plan as input, (b) the v2 rubric as scoring criteria, (c) per-dim score (0-10 with rationale) + weighted total. Aggregate. Write results to `data/showrev/forensic-2026-06-13-claude/judge-panel-round-N.md`. Honor the convergence rule (round-1 vs round-2 weighted-score Δ <3 + no dim Δ>2 = converged; cap at 3 rounds; escalate to operator at cap). API keys: GEMINI_API_KEY confirmed live in `.env`; verify OPENAI_API_KEY / XAI_API_KEY / DEEPSEEK_API_KEY presence first — if any missing, ask operator, do NOT silently fall back to a Claude model.

3. **Iterate the plan against scores: if any dim scores <6 (weakest-link gate), revise plan to address; re-run panel.** If weighted total ≥80 AND weakest dim ≥6 = ship-ready, surface to operator for red-team and final approval before any code execution begins. Do NOT begin executing plan W1-W4 + GATE without operator's explicit go.

## Substrate state

- **HS portal:** Dirty — 5 wrong Mike contacts + 2 contacts with invented `excluded-prohibited-substrate` tag (Brendan Karchner + Laurie Turck) per prior PM handoff. Joe Kunz NOT to be overwritten (Tom Marciano DETECTED owner). Operator-flagged as pre-Sunday-evening remediation, scope confirmed this session. NOT actioned this session.
- **DB state:** Clean. No DB writes this session. The sr_company_evidence rows added in prior session (nick_jtbd_01 through 14) remain unchanged. Inorsa-fiber Brain entries unchanged.
- **P1 Restore DB (`joxzazwuehhvywanyrze.supabase.co`):** 31 prospects + 5 sr_engine_output rows + 4 sr_microsites all `status='draft'`. Verified earlier sessions; NOT touched this session. W1 of sprint plan is the restore-and-flip path.
- **Uncommitted files (working tree):** ~136 from session-start baseline + this session's additions:
  - NEW: `data/showrev/fix-plan-sprint-2026-06-13.md` (sprint plan v1)
  - NEW: `data/showrev/forensic-2026-06-13-claude/tool-audit.md`
  - NEW: `data/showrev/forensic-2026-06-13-claude/sprint-plan-rubric.md` (rubric v2, supersedes v1)
  - NEW: `data/showrev/forensic-2026-06-13-claude/rubric-external-audit.md` (Gemini audit)
  - NEW: 5 memory files (operator-loop-decisions, sunday-smoke-window, ae-proxy-test, sprint-ordering, humans-respond-to-craft)
  - EDITED: MEMORY.md (5 pointers added, 1 stale tombstone removed, bare-URL surgical fix)
  - EDITED: this handoff
- **External state:**
  - `GEMINI_API_KEY` confirmed live in `.env` (used inline this session, masked from logs, request files deleted post-call)
  - Two iMessages sent to operator this session (rubric ready, Gemini audit verdict, v2 rewrite done — actually three messages)
  - HubSpot MCP: not touched this session
  - Supabase MCP: not touched this session
- **Background agents:** none running at handoff. Tool-audit + rubric-builder + Gemini-audit agents all completed cleanly (the first tool-audit fork stalled, was re-launched as fresh general-purpose; that's why the audit succeeded on attempt 2).

## What NOT to do (next session)

- **v2 rubric IS APPROVED** (operator: "v2 approved" 2026-06-13 PM). Judge panel cleared to run on first turn of next session. The "don't proceed until approval" gate is satisfied for THIS deliverable — but the same gate applies to the NEXT one (plan iteration / ship). Do not begin executing the actual plan (W1-W4 + GATE) without a fresh explicit go.
- **DO NOT use Sonnet (or any Claude model) for the cross-family panel.** Defeats the purpose. Gemini + GPT-5 + Grok + DeepSeek only — that's the operator-confirmed protocol AND the FRESH-SESSION handoff Section 6 protocol.
- **DO NOT use showrev/engine scripts.** Operator decided "inline REST in ruflo" — keep stay_inside_ruflo_repo. API keys live in `.env` inside ruflo (Gemini confirmed; GPT-5 / Grok / DeepSeek need verification — check `.env` first, ask operator if missing, do NOT silently fall back to Sonnet).
- **DO NOT auto-iterate past 3 rounds.** Cap is operator-locked. Escalate at cap with weighted scores + weakest-dim summary.
- **DO NOT begin executing plan W1-W4 + GATE without operator's explicit go after judge-panel convergence.** Plan is a draft until the panel + operator both clear it.
- **DO NOT skip the affirmative D10 dim in scoring.** It's load-bearing per operator's "humans respond to craft" elevation. If any judge tries to score D10 as 0 because "the plan doesn't have a dimension for craft," that's a misread — D10 scores how the PLAN demonstrates craft / insight / second-order thinking. The audit findings (e.g., F3 PROHIBITED-row quarantine vs delete) are exactly the kind of choices D10 should reward.
- **DO NOT reopen Path 2 selection** — Cost / PII / Stakeholder dims are DEFERRED to v3, not re-litigated this sprint. Hand-audit notes in the rubric explain how those concerns are managed in-plan instead.
- **DO NOT propose AskUserQuestion widgets for choices the operator wants in prose form** — operator rejected the A/B/C widget mid-session, asked for paths + recommendation in chat. Default to prose with explicit recommendation; widgets only when genuinely structured choice helps.
- **DO NOT auto-fix MEMORY.md markdownlint warnings** — pre-existing structural patterns (no h1, list-style index); operator hasn't asked for cleanup. Surgical fixes only when operator flags specific waste (as happened with email addresses on line 1 this session).

## Lessons learned this session (for memory hygiene)

- **Same-family rubric for same-family plan = single-perspective audit dressed as two.** Operator caught this — I built v1 rubric with a Claude `general-purpose` subagent, then queued external judges for the SCORING step. Operator-intent reading of the "another agent builds the rubric → judges → iterate" protocol was "external/cross-family agent from the start." Real process gap. NEXT TIME for governance protocol: when the artifact author is Claude, the rubric author should be cross-family (Gemini Deep Research is the natural fit for methodology critique). The current pattern (Claude rubric + Gemini audit + revise) recovers from the gap but adds an extra round. Better: cross-family rubric from start. Worth a feedback memory if this recurs — for now, captured here.
- **"Humans respond to craft / elegance / insight"** is operator-elevated strategic apex (memory saved as `project_humans_respond_to_craft.md`). Applies to BOTH (a) composer output we ship to recipients AND (b) our evaluation rubrics. The D10 Elegance/Insight/Second-Order dim is the rubric-side application; the composer-side application is "prefer competent AND insightful over competent but predictable" when both are defensible.
- **"Quality + precision pillars, speed irrelevant"** = operator apex 2026-06-13. Bake into every rubric / process artifact. Don't let "speed" or "efficiency" sneak in as a scoring dimension on quality-apex work.
- **Operator owns all loop decisions** (memory saved). When work would benefit from outside input (Tim on craft, Nick on product), surface inside the response — don't propose "I'll send this to Tim." Operator routes.
- **Substrate fixes ship FIRST, Tim re-judge runs LAST** (memory saved). Don't re-judge against gates that are themselves about to change — moving target. Fix substrate, then re-judge once.
- **AE proxy enrollment is operator-opened lane** (memory saved). Manual stays default per POST-PORTAL v6; proxy test is parallel workstream to confirm/deny before locking. Test procedure was scoped in prior PM handoff but the literal step-by-step from the chat wasn't captured in a doc — reconstructed in plan W3.
- **Memory bloat in MEMORY.md (bare URLs / email addresses inline in index) is real performance cost** — operator caught it this session. Surgical fix applied; broader hygiene pass deferred. If next session has time post-judge-panel and pre-plan-execution, consider full MEMORY.md audit pass (escape bare URLs, trim wordy descriptions, archive entries that are stale or absorbed by newer rules).
- **Tool-audit fork pattern stalled at 600s** — when a fork inherits big context AND has to do heavy WebFetch, watchdog can kill it. Fallback to fresh general-purpose agent with tight self-contained brief worked cleanly. Pattern: forks for context-inheriting research that can complete in <5min; fresh agents for heavier multi-fetch work.
- **CLAUDE.md Tool Chain Reference is 40+ Ruflo patch releases stale** — flagged in tool-audit. Worth a separate refresh pass post-pilot. Not in scope for this sprint.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial handoff after ~3h fix-plan + rubric-build session. Captures sprint-plan v1 + rubric v1 (Claude subagent) → Gemini external audit (verdict REVISION) → rubric v2 (operator Path 2) → HOLDING for operator approval on v2 before cross-family judge panel. 5 new memories saved. Operator-flagged process gap on cross-family rubric authoring captured for next-time. |
| v2 | 2026-06-13 EDT | Claude (Opus 4.7) | Operator approved v2 rubric ("v2 approved") after handoff was first written. Updated status / TL;DR / blockers / next actions / what-not-to-do to reflect that the approval gate is satisfied — judge panel cleared to run on first turn of next session. No content changes; same level of detail. |
