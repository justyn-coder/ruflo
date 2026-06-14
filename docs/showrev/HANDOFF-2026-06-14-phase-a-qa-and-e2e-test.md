---
title: Phase A QA gate PASSED + E2E composer test on 3 prospects — structural finding flagged for operator decision before smoke fire
date: 2026-06-14 13:05 EDT
session_name: phase-a-qa-and-e2e-test
status: mid-task — Phase A backfill still running (~30% LLM done, ~1.5hr ETA); GATE checkpoint blocked on operator strategic call on lead-claim tier rule
git_commit: a4a3735c8329e8aee2b0aa6985adebafb1f5208c
tool_calls_at_handoff: ~55
authored_by: Claude (Opus 4.7) — Sunday phase-a-qa-and-e2e-test session
operator_state: Path (a) chosen prior session, smoke fire window = Mon-Wed evening (recipient LOCAL). This session: QA gate passed + E2E test surfaced ICP-type-conditional structural finding that needs operator decision before GATE.
next_session_must_read:
  - docs/showrev/HANDOFF-2026-06-14-phase-a-qa-and-e2e-test.md  # THIS handoff
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-v2-shipped.md  # prior — composer wiring shipped
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md  # synthesis ratification origin
  - data/showrev/forensic-2026-06-13-claude/phase-a-qa-spot-check-2026-06-14.md  # QA gate results
  - data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md  # E2E findings + the 3 emails
  - data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md  # synthesis v2 (ratified 98.6/100)
  - SESSION-RULES.md
---

# Handoff: Phase A QA gate PASSED + E2E test surfaced structural ICP-conditional lead-tier finding

## TL;DR for next reader

Phase A QA gate PASSED at 2% strict misclassification (LLM at 0%). One row re-tagged via qa-correction. E2E composer test on 3 prospects ran clean BUT surfaced an ICP-type-conditional structural finding: for `ae_firm` ICP, lead sentence cites Tier A naturally; for `fiber_operator` ICP, composer picks company-specific personalization stat as lead and lands Tier A in sentences 2 + 4 (after 6-attempt best-of-N retry). The mech check IS firing; the composer IS retrying; the LLM converges on personalization-lead for fiber_operator. **Operator strategic call needed before GATE/smoke**: accept current behavior (Interpretation 1) OR tighten lead discipline (Interpretation 2, ~1-2hr fix). Phase A backfill still running (1800/6049 LLM rows, ~30%, ~1.5hr ETA).

## Goal of this session

Finish data-strategy v2 implementation by (1) verifying Phase A backfill completion + classifier sanity, (2) running Phase A QA spot-check gate, (3) running full E2E composer test on 3 prospects, so the system is GATE-ready for Mon-Wed evening smoke fire.

## Completed

- [x] Read all 12 must-reads (12 acknowledged)
- [x] Verified Phase A state at session start: bg process `60000` active, LLM 800/6049 rows, log healthy, 0 LLM-failed-default-D rows
- [x] Confirmed Supabase state: 308 rows classified (44 phase-b + 214 rule + 50 LLM) + 6,248 NULL
- [x] Phase A QA spot-check gate — 50 random rows (25 C + 25 D) inspected:
  - Strict misclassification: 1/50 = **2%** (Section 230 row, rule false-positive)
  - LLM strict misclassification: 0/12 = **0%** (judge dissent #3 concern is satisfied)
  - Lenient bound (including borderlines): 5/50 = 10%
  - **Verdict: ACCEPT** — `data/showrev/forensic-2026-06-13-claude/phase-a-qa-spot-check-2026-06-14.md`
- [x] One row re-tagged via qa-correction: `71be941f-0476-484c-9805-db165cfed06b` (Section 230 content-liability podcast) → Tier D
- [x] E2E composer test on 3 prospects (Joe Kunz/GFiber, EPB Fiber Optics, Acme Test Engineering):
  - Stage 4 fired 2x per prospect (orchestrator pull + phase-2 gap-fill): "appended 44 Tier A/B universal claim(s)"
  - INORSA-SCOPE TIER DISCIPLINE prompt section confirmed (specific-composer.ts:224)
  - 1/3 (Acme/ae_firm) leads with TWO Tier A Mike Rutski Phase B verbatim quotes — clean compliant
  - 2/3 (GFiber, EPB/fiber_operator) lead with untiered company-specific stat; Tier A lands in body sentences 2 + 4
  - Tier D filter active; 0 Tier D rows surfaced
  - Full output: `data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md` + raw log `e2e-test-raw.log`

## In progress (mid-flight)

- [ ] Phase A backfill (bg process `60000`)
  - Current state: 1800/6049 LLM rows processed at 12:58 EDT; rate ~44 rpm; 4249 remaining
  - ETA: ~1.5 hr more (~14:30 EDT)
  - Log: `/tmp/phase-a-full-run.log` (will not survive host reboot)
  - DB shows only 50 LLM-committed vs 1800 log-processed — script may be batching commits (next session should investigate this lag; if commits stall, may need to kill + resume with a remaining-rows query)
  - Owner: Claude bg process; next session should verify completion via `SELECT inorsa_scope_tier_method, COUNT(*) FROM sr_brain_substrate GROUP BY 1`

## Blockers

- **GATE checkpoint blocked on operator strategic call** (owner: operator)
  - Why blocked: E2E test surfaced ICP-type-conditional lead behavior. For `fiber_operator`, composer picks company-specific stat as lead even after 6-retry best-of-N. Mech check fires + best-of-N picks this as lowest-violation. Synthesis v2 §5.1 step 6 strict reading would call this non-compliant. Operator needs to choose: (Interpretation 1) accept current behavior, Tier A lands in body — ship; or (Interpretation 2) tighten lead discipline, requires ~1-2 hr code change
  - What unblocks it: operator decides + (if Interpretation 2) implements one of: (a) reorder claim block to put Phase B Tier A/B first in USE_DIRECTLY prompt, (b) push fiber_operator company stats to USE_TO_SHAPE, (c) stronger prompt + hard fail on mech check
  - **Recommended default: Interpretation 1** — review the 3 emails, they're substantively strong; if operator agrees, ship to GATE

## Operator decisions pending

- [ ] **Strategic call: lead-claim tier rule** — review the 3 E2E emails at `data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md`. Decide Interpretation 1 (accept current behavior, mech check fires as portal warning but ship) vs Interpretation 2 (tighten lead discipline before smoke). This is the only thing blocking GATE.

## Next 3 actions (sequential, for next session)

1. **Verify Phase A backfill completion** — query `SELECT inorsa_scope_tier_method, COUNT(*) FROM sr_brain_substrate GROUP BY 1`. Expected: ~6,500 rows classified (rule + llm + phase-b-ingest + qa-correction); ~0 NULL. If bg script still running, let it finish. If it died, identify the last committed batch and resume with `--limit` flag or restart from scratch (the script is idempotent on existing classifications). Also investigate the log-vs-DB lag: log says 1800 processed but DB has 50 with method='llm' — likely batched commits, but worth confirming.
2. **Run a quick post-completion QA pass** — 10 random LLM-only rows (after Phase A completes) to validate the larger sample. Same scoring criteria as Round 1. Should take ~10 min.
3. **Operator strategic call on lead-tier rule** — review the 3 E2E emails + decide Interpretation 1 vs 2. If 1: proceed to GATE step (build adversarial-prompts doc + re-judge 15-prospect smoke roster + operator F10 portal approvals + preload-verify + smoke fire). If 2: implement the chosen tighten option (~1-2 hr), re-run E2E test on the same 3 prospects, then proceed to GATE.

## Substrate state

- **HS portal:** Unchanged this session (no HS writes).
- **Production DB (slttpknnuthbttjuzrnz):**
  - sr_brain_substrate: 6,556 rows total. Classification state:
    - `phase-b-ingest` = 44 (38 Tier A + 6 Tier B, manually curated)
    - `rule` = 213 (was 214; -1 for the Section 230 qa-correction)
    - `llm` = 50 (Gemini Flash, first 50 ambiguous; may grow during the in-flight bg process)
    - `qa-correction` = 1 (Section 230 row re-tagged D)
    - NULL = 6,248 (pending Phase A bg)
- **P1 Restore DB (joxzazwuehhvywanyrze):** Unchanged.
- **sr_insight_reviews:** Unchanged.
- **Files written this session:**
  - `data/showrev/forensic-2026-06-13-claude/phase-a-qa-spot-check-2026-06-14.md` (new — QA gate results)
  - `data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md` (new — E2E findings + 3 emails)
  - `data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-test-raw.log` (raw test output)
  - `docs/showrev/HANDOFF-2026-06-14-phase-a-qa-and-e2e-test.md` (this file)
- **External state:**
  - Supabase MCP: ~6 execute_sql calls (5 read + 1 qa-correction UPDATE)
  - Gemini API: in-flight (Phase A bg, still classifying ~4,249 remaining rows; cost ~$0.0001/call ≈ $0.40-0.50 more spend)
  - HubSpot MCP: 0 calls
  - OpenAI/Claude/etc: composer LLM calls during E2E test (~6 attempts × 3 prospects × ~5K tokens each ≈ $1-2 spend)
  - 0 emails sent / sequences enrolled
- **Background processes at handoff:**
  - `60000` (zsh wrapper `59994`) — phase-a-classify-inorsa-scope-tier.mjs --apply still running. Will exit on its own when 6,049 LLM rows complete.

## What NOT to do (next session)

- **DO NOT re-litigate the synthesis or judge panel.** Strategy is ratified at 98.6/100.
- **DO NOT skip the post-completion QA pass on the LLM output.** Round 1 was a sample of 12 LLM rows of 6,049 final — judge dissent #3 wanted manual gate before composer consumes at scale.
- **DO NOT modify the 4-tier model or fiber-rescue rule.** Operator-locked.
- **DO NOT auto-tag inorsa_scope_tier on new rows ingested by other pipelines** until Phase A is verified clean.
- **DO NOT touch the existing F3 evidence-tier classifier.** Working as designed; the new tier sits orthogonally on top.
- **DO NOT extend the kill-list on composer-constraints.ts.** The substrate tier discipline + Tier D filter is the upstream intervention.
- **DO NOT change the rule-pass classifier prompt** for the Section 230 false-positive — single false-positive doesn't justify re-running rule pass. Re-tag of that one row is the right surgical fix.
- **DO NOT use a Claude model for cross-family judging.** Use `scripts/judge-panel-data-strategy-2026-06-14.mjs` for any new judge rounds.
- **DO NOT bring smoke fire forward** without operator F10 portal approvals. Mon-Wed evening recipient LOCAL stays as Path (a) timing.

## What this session did NOT do (deferred to next)

- **GATE checkpoint adversarial-prompts doc** — `data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-14.md` not yet written. Should be FROZEN PRE-FIRE per plan v2 §GATE step 3.
- **Re-judge of 15 smoke roster + 5 historical + 5 crafted adversarial replay.** Needs the Phase A completion + operator strategic call as upstream gates.
- **Operator F10 per-prospect approvals via /ops portal.** Post-GATE step.
- **preload-verify.ts on the 15 (12 BLOCKING checks).** Post-GATE.
- **Smoke fire.** Per Path (a): Mon-Wed evening recipient LOCAL.
- **W3 AE proxy enrollment test — PASSED in parallel session** (2026-06-14 12:35 EDT). Day 1 PASS on all 3 active criteria. See `docs/showrev/HANDOFF-2026-06-14-w3-ae-proxy-result.md`. Significant finding: 2026-03 endpoint requires `userId` query param + `senderEmail` body. POST-PORTAL v6 Component 0 wrapper needs updating. Smoke can now use proxy path OR manual — operator decides at GATE.

## Architectural observations (worth recording)

1. **Stage 4 fires TWICE per prospect** — once during orchestrator phase 1 pull (initial company-name retrieval) and once during phase 2 gap-fill (persona-keyword retrieval when gap-fill triggers). Both pull the same 44 Tier A/B universal claims. This is technically duplicate work but functionally correct (and the second call gets the same companyName seed via the gap-fill query string). Could optimize by short-circuiting the second call, but ~0ms cost in practice.

2. **The ICP-conditional lead behavior is a real phenomenon, not a bug.** For `ae_firm` ICP, the orchestrator's tier-ordering surfaces Mike Rutski Phase B Tier A quotes as USE_DIRECTLY top-1/top-2/top-3, so the composer naturally leads with them. For `fiber_operator` ICP, the orchestrator surfaces company-specific research (Astound acquisition, home counts) as USE_DIRECTLY top-1/2/3, and the Phase B Tier A claims are further down. The composer LLM prefers the top-of-block company-specific claims for the lead sentence as personalization. Best-of-N retry runs 6 attempts, all converge on personalization-lead, mech check fires, composer ships the lowest-violation attempt.

3. **Tier A LANGUAGE always lands in the email body** for fiber_operator — Mike Rutski "permit return on FTTX" + Variant A/B pitch consistently in sentences 2 + 4. The discipline is succeeding substantively even when failing the strict sentence-1 rule.

4. **The substrate_quoted source_kind is OVERLOADED** — it's used both for Phase B Tier A internal substrate (e.g., Mike Rutski quotes ingested via phase-b-ingest.mjs) AND for sr_company_evidence rows that get tagged substrate_quoted by other pipelines. The orchestrator surfaces both as USE_DIRECTLY without distinguishing them in the lead-eligibility sense. This is the structural reason the mech check fires on EPB's "76,000+ homes" stat — substrate_quoted source but no inorsa_scope_tier.

## STANDING INSTRUCTION FOR EVERY FUTURE SESSION (do not strip — propagate forward)

**Every handoff MUST include a comprehensive paste-in prompt in the next section, structured exactly like the one below.** Operator-directed 2026-06-14 PM. The prompt is what the operator copies into the next session's first message. If the prompt is missing, terse, or vague, the next session re-derives state from scratch + repeats avoidable mistakes. The required structure is:

1. Opening "You are picking up an in-progress project" framing + one-job summary
2. CRITICAL STATE — READ FIRST BEFORE PLANNING ANYTHING (background processes, ephemeral state, verification SQLs)
3. READ THESE FIRST, IN THIS ORDER, BEFORE ANY OTHER ACTION (numbered must-reads with file paths + one-line purpose each — at least 10 entries for non-trivial sessions)
4. Explicit "Acknowledge all N reads" instruction
5. THE PROJECT OBJECTIVE (locked, copied forward verbatim)
6. WHERE WE ARE (recent state — what shipped + what's mid-flight)
7. WHAT REMAINS (your scope this session — numbered)
8. YOUR DELIVERABLE THIS SESSION (numbered steps with explicit verification criteria + halt conditions + save-path locations + per-step time estimate)
9. DO NOT REOPEN SETTLED DECISIONS (bulleted)
10. OPERATOR DECISIONS ALREADY CAPTURED (bulleted, do NOT re-ask)
11. Closing single word "Begin."

Inside step 8, every step that produces an artifact must name the exact save path. The next session inherits this standing instruction — propagate the entire standing-instruction block + a freshly-updated paste-in prompt into THEIR handoff.

## Paste-in prompt for fresh session (copy from here through the closing "Begin.")

```
You are picking up an in-progress project. Your one job in this session is to
verify the data-strategy v2 Phase A backfill completed cleanly, run a
post-completion LLM QA pass, surface the lead-tier-rule strategic finding to
operator (1/3 fiber_operator E2E prospects PASS strict mech check; 2/3 lead
with personalization, Tier A in body), and — pending operator strategic call
— proceed to the GATE checkpoint so the system is ship-ready for the Mon-Wed
evening smoke fire window.

CRITICAL STATE — READ FIRST BEFORE PLANNING ANYTHING:

1. Phase A backfill was running in background at end of prior session. PID
   60000 (zsh wrapper PID 59994). Log at /tmp/phase-a-full-run.log (ephemeral —
   may be gone after host reboot). Progress at handoff: 1800/6049 LLM rows
   (~30%), rate ~44 rpm, ~1.5hr ETA. SHOULD be done by the time you read this.
   Verification SQLs (run all 3 immediately):
     -- (a) Method distribution. Expected ~6,500 in rule+llm+phase-b-ingest+
     --     qa-correction; ~0 NULL.
     SELECT inorsa_scope_tier_method, COUNT(*) AS n
       FROM sr_brain_substrate GROUP BY 1 ORDER BY 1;
     -- (b) Tier x source distribution. Sanity check: cartesian-cost-report all
     --     Tier D; ntia-bead-subgrantees all Tier C; community-broadband-bits
     --     mixed C/D ~60/40; dawson-pots-and-pans mixed C/D ~95/5.
     SELECT inorsa_scope_tier, source, COUNT(*) AS n
       FROM sr_brain_substrate WHERE inorsa_scope_tier IS NOT NULL
       GROUP BY 1,2 ORDER BY 1,2;
     -- (c) LLM-failed-default-D count. Expected = 0. If >0, those rows need
     --     reset to NULL + re-run via scripts/phase-a-classify-inorsa-scope-tier.mjs --apply.
     SELECT COUNT(*) FROM sr_brain_substrate
       WHERE inorsa_scope_tier_rationale LIKE 'LLM-failed-default-D:%';

2. KNOWN MYSTERY worth investigating: log showed 1800 LLM rows processed but
   DB at handoff had only 50 with method='llm'. Likely batch-commit lag in the
   script. If Phase A actually completed, check method=llm count > 5000. If
   stuck at 50, the script may have died mid-batch — diagnose at
   scripts/phase-a-classify-inorsa-scope-tier.mjs before restarting.

3. E2E test from prior session surfaced an ICP-CONDITIONAL lead-tier finding.
   Read this file FIRST before talking to operator:
     data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md
   It has the 3 emails + the structural finding + the specific operator
   decision required (Interpretation 1 = accept current behavior, ship;
   Interpretation 2 = tighten the lead rule, ~1-2hr fix).

4. W3 AE proxy enrollment PASSED in parallel session 2026-06-14 12:35 EDT.
   POST-PORTAL v6 Component 0 needs a userId-query-param fix per the W3
   finding. Proxy path is now also viable for the smoke — operator decides at
   GATE which path to use.

5. W4 HS mistakes remediation may be running in a parallel session per operator
   request 2026-06-14 PM (~30 min budget). DO NOT touch HS contacts. If you
   spot HS state issues during your work, log them as "discovered, deferred to
   W4 session" in your handoff.

READ THESE FIRST, IN THIS ORDER, BEFORE ANY OTHER ACTION, YOU MUST READ THIS:

1. docs/showrev/HANDOFF-2026-06-14-phase-a-qa-and-e2e-test.md          (THIS handoff, load-bearing)
2. docs/showrev/HANDOFF-2026-06-14-data-strategy-v2-shipped.md         (prior — composer wiring shipped)
3. docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md           (synthesis ratification origin)
4. docs/showrev/HANDOFF-2026-06-14-w3-ae-proxy-result.md               (W3 PASS — proxy path now open + userId-query-param fix needed in POST-PORTAL v6)
5. data/showrev/forensic-2026-06-13-claude/phase-a-qa-spot-check-2026-06-14.md       (QA gate Round 1 PASSED at 2%)
6. data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-2026-06-14/e2e-results.md  (E2E findings + 3 emails)
7. data/showrev/forensic-2026-06-13-claude/data-strategy-synthesis-2026-06-14.md     (v2 — ratified 98.6/100)
8. data/showrev/forensic-2026-06-13-claude/data-strategy-rubric-2026-06-14.md        (10-dim rubric)
9. data/showrev/forensic-2026-06-13-claude/judge-panel-data-strategy-round-1.md      (verdict + 5 dissents)
10. data/showrev/forensic-2026-06-13-claude/phase-b-tier-ab-manifest.json             (44 internal Tier A/B rows)
11. data/showrev/inorsa-source-of-truth.md                                            (v10 — Inorsa product canon)
12. data/showrev/jtbd-matrix.md                                                       (7 Nick-validated JTBDs + Tier A AE-quote sources)
13. canon/sources/inorsa-product-truth-nick-2026-06-04.md                             (Nick canon)
14. docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md                                      (HS GOSPEL Q1-Q16; note Q1 needs userId-as-query-param amendment per W3 finding)
15. docs/showrev/POST-PORTAL-SPEC-V6.md                                               (ratified manual enrollment default + Component 0 needs userId fix)
16. SESSION-RULES.md                                                                  (session-lifecycle rules)

Acknowledge all 16 reads.

THE PROJECT OBJECTIVE (locked across sessions):
Better cold prospecting than the top 0.01% of B2B SaaS AEs on the 800-prospect
Inorsa FC2026 cohort. Target: 15-25% reply T1, 3-6% meeting. Verified data in
every body. Verified email for every send. "Humans respond to craft / elegance
/ insight."

WHERE WE ARE:
Data strategy v2 (4-tier substrate scope A/B/C/D + fiber-only safety default +
fiber-rescue rule + program_leverage x JTBD 7 Tier-C lead exception) ratified
at 98.6/100 by cross-family judge panel. Composer wiring shipped on main as 4
commits (7baa6c846 Phase A schema + classifier, df4154ef0 Phase B 44 internal
substrate, 93e5a24eb composer prompt + Stage 4 + mech check, a4a3735c8 prior
handoff). Phase A QA gate Round 1 PASSED at 2% strict misclassification (LLM
0%). One row re-tagged via qa-correction. E2E test on 3 prospects ran:
1/3 (ae_firm) clean Tier A lead; 2/3 (fiber_operator) lead on personalization
stat with Tier A landing in body sentences 2 + 4 — structural finding worth
flagging. Phase A backfill was still running at handoff (1800/6049 LLM rows,
~30%). W3 AE proxy enrollment PASSED in parallel session.

WHAT REMAINS (your scope this session):
  1) Verify Phase A backfill completion + classifier sanity (run 3 SQLs above)
  2) Post-completion QA pass on LLM output (10 random LLM-only rows, ~15 min)
  3) Surface the lead-tier-rule strategic call to operator + execute their
     choice (Interpretation 1 = accept, ship; Interpretation 2 = tighten,
     ~1-2hr code change)
  4) GATE checkpoint when operator green-lights pre-smoke-fire
  5) Smoke fire — operator picks manual (POST-PORTAL v6) or AE proxy (W3
     PASSED) per their preference

YOUR DELIVERABLE THIS SESSION:

1. Read the 16 must-reads. Acknowledge.

2. Verify Phase A completion (~5 min):
   - Run the 3 verification SQLs from CRITICAL STATE block above
   - Expected: ~6,500 rows classified, ~0 NULL, 0 LLM-failed-default-D rows
   - If method='llm' count is still ~50: investigate the batch-commit lag at
     scripts/phase-a-classify-inorsa-scope-tier.mjs. Diagnose: did the script
     actually persist work? If yes, count anomaly is a query artifact. If no,
     resume or restart.
   - If clean: proceed. Note method='llm' count delta in handoff.

3. Post-completion QA pass on LLM output (~15 min):
   - SQL: SELECT id, source, inorsa_scope_tier, inorsa_scope_tier_rationale,
            LEFT(title, 120) AS title_trim, LEFT(content, 600) AS content_trim
            FROM sr_brain_substrate
            WHERE inorsa_scope_tier_method='llm' ORDER BY random() LIMIT 10;
   - Read each rationale + content against synthesis v2 §2.4 criteria (Tier C
     = Inorsa-aligned regulatory/permitting context; Tier D = construction-cost
     / tower / off-Inorsa-scope; fiber-rescue rule applies)
   - If strict misclassification <=10%: ACCEPT, persist results to
     data/showrev/forensic-2026-06-13-claude/phase-a-qa-spot-check-round-2-<YYYY-MM-DD>.md
   - If >10%: HALT, escalate to operator with the misclassified rows + a
     proposed prompt refinement, do not proceed to step 4.

4. Surface the lead-tier-rule strategic call to operator (~5 min):
   - Show them the 3 E2E emails from the forensic doc
   - Ask: Interpretation 1 (accept current behavior, mech check fires as
     portal warning, Tier A lands in body — recommended ship) vs
     Interpretation 2 (tighten, options: (a) reorder claim block to put Phase
     B Tier A/B first in USE_DIRECTLY prompt, (b) push fiber_operator
     company-specific stats to USE_TO_SHAPE, (c) stronger prompt + hard fail
     on mech check)
   - If Interpretation 1: proceed to step 5.
   - If Interpretation 2: implement chosen option (~1-2hr), re-run the E2E
     test on the same 3 prospects, persist new results to
     data/showrev/forensic-2026-06-13-claude/e2e-3-prospect-test-<YYYY-MM-DD>-round-2/,
     then proceed to step 5.

5. GATE checkpoint (when operator green-lights pre-fire) (~2-3 hr):
   - Build data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-14.md
     (5 crafted adversarial prompts per plan v2 §GATE step 3, FROZEN
     PRE-FIRE — synonym + indirect-framing + citation-injection + mixed-tier
     + stale-fact break vectors)
   - Run 5 historical + 5 crafted adversarial replay against the 15 smoke
     roster. 5/5 + 5/5 block required.
   - Operator F10 per-prospect approvals via /ops portal
   - preload-verify.ts on the 15 (12 BLOCKING checks)
   - Operator picks enrollment path: manual (POST-PORTAL v6) OR proxy (W3
     PASSED; needs POST-PORTAL v6 Component 0 userId-query-param amendment
     before proxy is production-ready — verify the fix landed if operator
     picks proxy)
   - Smoke fire — operator-chosen path, Mon-Wed evening recipient LOCAL

6. Write fresh handoff before session end per SESSION-RULES.md RULE 2 (~15 min):
   - File name: docs/showrev/HANDOFF-<YYYY-MM-DD>-<topic>.md
   - Include git_commit, tool_calls_at_handoff, status, TL;DR per template at
     docs/showrev/HANDOFF-TEMPLATE.md
   - PROPAGATE the "STANDING INSTRUCTION FOR EVERY FUTURE SESSION" block + a
     freshly-updated comprehensive paste-in prompt into YOUR handoff verbatim.
     Future sessions inherit this discipline. Do NOT shorten or strip the
     standing instruction.

DO NOT REOPEN SETTLED DECISIONS:
- Data strategy synthesis v2 RATIFIED at 98.6/100. No re-litigation.
- 4-tier substrate model A/B/C/D + fiber-only safety default + fiber-rescue
  rule + program_leverage x JTBD 7 Tier-C lead exception — all locked.
- 7 JTBDs are Nick-validated. Don't restructure or renumber.
- composer-constraints.ts existing kill-lists STAY. No blanket extension.
- POST-PORTAL v6 manual enrollment WAS the default. W3 proxy PASSED 2026-06-14
  in parallel session — proxy path is now also viable. Operator decides at
  GATE. POST-PORTAL v6 Component 0 needs userId-query-param fix before proxy
  is production-ready.
- W4 HS mistakes remediation — operator may have a parallel session for this
  (~30 min). Do NOT touch HS contacts. If you discover HS state issues during
  your work, log them as "discovered, deferred to W4 session" in your handoff.
- W1 P1 microsite recovery DEFERRED (not blocking P2).
- Stay-inside-ruflo-repo (one exception: ~/Documents/GitHub/showrev-microsites
  for portal work — operator must authorize per-request).
- NO Claude model for cross-family judging. Use
  scripts/judge-panel-data-strategy-2026-06-14.mjs for any new judge rounds.
- Inorsa-scope tier (A/B/C/D) is ORTHOGONAL to F3 evidence-trust tier
  (USE_DIRECTLY/USE_TO_SHAPE). Both run; the composer uses both signals.
- Stage 4 universal Tier A/B retrieval fires for EVERY prospect (the 44
  internal rows are product-level pitch, not company-specific) — don't
  restrict to specific-prospect matching.
- Tier D filter happens UPSTREAM of composer. Composer never sees D rows.
- Mechanical check fires inside the existing 6-attempt best-of-N loop. No
  separate retry budget. Violations surface to operator portal via existing
  flag-review pathway.
- Smoke window: Mon-Wed evening recipient LOCAL (per Path (a) chosen prior
  session).
- Per-prospect microsite approval default + batch option (F10 already shipped).
- Operator owns all loop decisions. NO direct Tim/Nick/partner contact.

OPERATOR DECISIONS ALREADY CAPTURED (do NOT re-ask):
- Path (a) chosen — proper implementation, smoke punts to Mon-Wed evening
- All 5 prior-session implementation decisions locked (classifier hybrid,
  Phase B all 4 sources, composer prompt option a, mech check option a)
- Phase A QA gate Round 1 PASSED at 2% strict misclassification (LLM 0%) —
  Section 230 row re-tagged via qa-correction, no rule-pass refinement
  needed
- E2E test on 3 prospects completed — Acme/ae_firm clean Tier A lead;
  GFiber + EPB/fiber_operator lead on company-specific stat with Tier A in
  body
- W3 AE proxy enrollment PASSED 2026-06-14 12:35 EDT — proxy path now also
  viable for smoke
- W4 HS mistakes remediation surfaced to operator as a parallel-session lane
  (~30 min)
- Smoke roster = 15 real + 3 dummies (18 HS contacts, all hubspot_contact_id
  -backfilled prior sessions)
- Per-prospect F10 approval default + batch option
- showrev-microsites repo path = ~/Documents/GitHub/showrev-microsites
- Operator owns all loop decisions — no direct Tim/Nick/partner contact

Begin.
```

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 13:05 EDT | Claude (Opus 4.7) | Phase A QA gate PASSED at 2% strict misclassification (LLM 0%). E2E composer test on 3 prospects surfaced ICP-conditional lead behavior — Acme/ae_firm clean Tier A; GFiber + EPB/fiber_operator lead with personalization stat + Tier A in body. Operator strategic call pending. Phase A still running (1800/6049). 0 commits this session. |
