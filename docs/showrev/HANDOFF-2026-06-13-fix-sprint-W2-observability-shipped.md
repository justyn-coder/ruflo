---
title: Fix-sprint W2 observability + verification + mechanical + portal + gate shipped — handoff for W3 + W4 + W1 + GATE
date: 2026-06-13 EDT
session_name: fix-sprint-w2-observability-mechanical
status: in-flight — 8 of 8 plan-v2 W2 F-items shipped (across ruflo + showrev-microsites); W3 + W4 + W1 + GATE pending
git_commit_ruflo: 84b757b46  # tip of ruflo main at handoff (7 commits this session)
git_commit_showrev_microsites: 98c6418  # tip of showrev-microsites main at handoff (1 commit this session — F10 portal pieces)
tool_calls_at_handoff: ~92 (past 60 'thinking about handoff'; under 120 'strongly consider')
authored_by: Claude (Opus 4.7) at end of fix-sprint W2 observability+mechanical+portal session
operator_state: Mid-session operator surfaced submodule scoping concern + provided ~/Documents/GitHub/showrev-microsites path. F10 portal pieces ported + committed in correct repo before handoff. Operator signaled "should we start a new session" — natural stop after F10 ship.
next_session_must_read:
  - docs/showrev/HANDOFF-2026-06-13-fix-sprint-W2-observability-shipped.md  # THIS handoff
  - data/showrev/fix-plan-sprint-2026-06-13-v2.md                            # plan v2 (still the contract)
  - docs/showrev/HANDOFF-2026-06-13-fix-sprint-W2-substrate-truth-shipped.md  # prior session handoff (substrate-truth ship)
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md                             # HS GOSPEL Q1-Q16
  - docs/showrev/POST-PORTAL-SPEC-V6.md                                      # ratified manual enrollment default
  - SESSION-RULES.md                                                         # session-lifecycle rules
---

# Handoff: F8 + F9 + Stop-hook + F5a/b + F6 + F7 + F10-gate shipped; F10 portal + W3 + W4 + W1 + GATE pending

## TL;DR for next reader

Observability + verification + mechanical/HS half of plan v2 W2 landed end-to-end across 7 commits (f414eef13 → 84b757b46). F8 sr_pipeline_runs telemetry (fallback path per plan v2 cover), F9 sr_emails per-touch persistence, Stop-hook R5-lite within-session calibration loop, F5a 18-contact HS-id backfill (SQL-only) + F5b forward-wire, F6 craft/facts semantic rename + reset-on-red trigger (migration `f6_craft_facts_review_separation_2026_06_13` applied, production-subset rollback exercise passes), F7 single-call HS contact create with embedded associations array, F10 preload-verify BLOCKING gate (OPERATOR_GO_AND_LIVE_MICROSITE). 18-of-18 smoke roster correctly fails the F10 gate today (operator_go=0/18, live_microsite=0/18) — gate is mechanically blocking smoke fire as designed.

**Working tree carries the substantive F10 portal pieces** (activateGo extended to flip sr_microsites + log sr_review_actions, activateGoBulk server action, /api/microsite-promote route) but they're at `src/showrev/microsite/...` which is the stale ruflo submodule per `reference_showrev_repo_mapping` memory. Operator confirmed "Move to showrev-microsites repo (Recommended)" — needs the repo path before they can be moved + committed. Code is fully written; mechanical move only.

Pending: F10 portal pieces (port to showrev-microsites), W4 HS mistakes (5 wrong Mike + 2 retag), W3 AE proxy enrollment test, W1 P1 microsite restore (operator chose "this evening" two sessions in a row — still not yet fired), GATE Sunday 3pm checkpoint.

## Completed this session

- [x] Read all 7 session-start must-reads + acknowledged
- [x] Confirmed F1 + F3 wiring still on main at 185c1795f via grep (PRODUCT_GUARDS regex + classifyDomainTier export both present)
- [x] Verified judge-panel-2026-06-13.mjs still executable
- [x] Operator decisions captured: W2-first / per-F-item commits

### F8 — sr_pipeline_runs telemetry (commit f414eef13)
- Fallback path chosen per plan v2's explicit "Fallback if OTEL is fragile" cover. OTEL primary would have required a long-running receiver + global ~/.claude/settings.json side-effect; fallback gives deterministic capture in ~10 lines of code with no infra dependency.
- `startPipelineRun(opts)` + `finishPipelineRun(id, opts)` helpers in run-pipeline-v2.ts. Called immediately after runId is computed + after printSummary. Captures status=running → completed | completed_with_errors | failed.
- summary jsonb shape: `{ run_id, duration_ms, prospects_processed, pending_count, flag_count, composed_count, error_count, apollo_credits_used (creditTracker.total()), mv_credits_used (mvCreditTracker.getSpent()), session_id (CLAUDE_CODE_SESSION_ID) }`
- Outer `main().catch()` handler PATCHes the most-recent running v2-cold row to status='failed' if a fatal exception bubbles out before finishPipelineRun runs.
- SQL round-trip test on production: INSERT + PATCH + DELETE cleaned. Schema verified compatible.

### F9 — sr_emails per-touch persistence (commit 346ff1711)
- persistComposedEmail block inside persistToSupabase, fires AFTER sr_prospects upsert (because sr_emails has FK to sr_prospects.id).
- UPSERT on (prospect_id, touch_number) — UNIQUE constraint enforced. CHECK constraint validated: touch_number BETWEEN 1 AND 3 (smoke = touch_number=1).
- Mapped: subject, body, ps_line, word_count, status='draft' (default), ae_name, judge_score (Tier2Result.score), judge_verdict (JudgeAction enum: ship/retry/flag/flag-hallucination), judge_details (full TieredJudgeResult as jsonb).
- SQL upsert smoke against production sr_emails at touch_number=2: payload accepted, judge_details jsonb round-trips, cleanup successful.

### Stop-hook R5-lite (commit 34070ca4c)
- `.claude/hooks/judge_feedback_to_context.py` (NEW, executable). stdlib-only (urllib + json + collections.Counter). Fail-closed: any DB / JSON / env error returns empty stdout.
- fetch_session_verdicts: finds session's pipeline runs via sr_pipeline_runs.config->>session_id, fetches sr_emails rows since the earliest run's started_at.
- compute_context: gates ≥5 verdicts + score std-dev <25 + ≥10pp movement vs persisted rolling average (/tmp/judge-rolling-avg-<sid>.json).
- Returns hookSpecificOutput.additionalContext JSON on stdout when signal is meaningful; silent otherwise (prevents pollution per plan v2 §"downside acknowledged").
- .claude/settings.json: 1-hunk add to Stop event hooks array, 8s timeout. Prior-session unrelated hooks (session_health_proxy + session_start_handoff) deliberately left uncommitted via revert-and-re-apply pattern.

### F5a + F5b — hubspot_contact_id (SQL-only F5a + commit a2c2143b6 for F5b)
- F5a: HS MCP search by `showrev_engagement_slug = 'inorsa-fiberconnect-2026-cold'` returned 19 contacts (18 real-name + 1 May-13 canary-spike). 18 emails resolved to sr_prospects rows. Single CTE-based UPDATE backfilled all 18: aamer-abbasi-lyte-fiber, aaron-snyder-citizens-fiber (hold status, kept for audit), allison-ellis-frontier-communications, anthony-jelniker-great-plains-communications, alex-king-blue-ridge-mountain-emc, alex-mora-tep, ben-lewis-ramirez-communication-network-engineering, chad-mueller-omni-fiber, casey-worth-united-fiber, dara-leslie-shentel, doug-spurlin-frontier-communications, gabriel-gilliland-blue-ridge-mountain-emc, george-spengler-lyte-fiber, issac-roehm-ideatek-telcom, jesus-loya-pc-telcom, jeff-reiman-the-broadband-group, michele-sadwick-greenlight-networks, zack-burnes-united-tel-supply. Sweet 18/18 hit rate, no orphans.
- F5b: Inline PATCH block in hubspot-loader.ts loadProspectToHubSpot after contactId is finalized (post-create OR post-update), before the association step. Best-effort fail. Sets hubspot_contact_id + hubspot_loaded_at + updated_at. Smoke-load script delegates through this function via the existing import (no edit to smoke-load-2026-06-11.ts needed).

### F6 — craft/facts rename + reset trigger (commit 3f4b62730 + migration f6_craft_facts_review_separation_2026_06_13)
- Migration applied transactionally. ALTER RENAME composition_reviewed_{by,at} → craft_reviewed_{by,at} (renamed _at too for symmetry — plan v2 trigger body references NEW.craft_reviewed_at, load-bearing for compile). ADD COLUMN facts_reviewed_{by,at}. CREATE FUNCTION reset_craft_review_on_red() + CREATE TRIGGER trg_reset_craft_review_on_red BEFORE UPDATE FOR EACH ROW.
- Trigger logic: when confidence_color transitions TO red (and OLD wasn't red, or was NULL), null out craft_reviewed_{by,at}. Facts review NOT reset (operator facts verification persists across substrate confidence drops — substrate gates F1+F3 fire on re-compose).
- COMMENT ON for the 4 new/renamed columns + the function (audit trail).
- Production-subset rollback exercise (per F3.e precedent): row chad-plemons-empower-broadband (green + Tim, 2026-06-11 20:17:38.06+00). green→red: craft pair auto-nulled ✓. Restored green + Tim. green→yellow: craft pair preserved ✓. Restored. Row byte-for-byte original at end.
- Code reference update: run-pipeline-v2.ts ~L1268 carry-forward block: composition_reviewed_{by,at} → craft_reviewed_{by,at} in SELECT + typed payload + docstring.
- F6c portal badges ("Craft Approved (Tim)" + "Facts Approved (operator)" + "Reset since" indicator) DEFERRED to F10 portal touch — same UI iteration absorbs the badge render cleanly.

### F7 — single-call HS contact create with associations (commit f679f3175)
- hubspot-loader.ts loadProspectToHubSpot: new-contact create path embeds associations array in POST body when companyId is known (companyId can be null on contacts with no resolvable domain). associationTypeId=1 (HUBSPOT_DEFINED Contact → Primary Company). contactCreatedWithAssoc bool tracks this so the legacy Step 3 PUT is skipped on the embed path.
- Cuts ~30% of API calls on the new-contact path per HS GOSPEL Q7 §Impact.
- PATCH path for existing contacts unchanged (no v3 single-call upsert+assoc equivalent — would need to wait for HS v4 spec).

### F10 preload-verify gate (commit 84b757b46)
- preload-verify.ts: BLOCKING check OPERATOR_GO_AND_LIVE_MICROSITE. Optional VerifyInput.prospectIds field (backward compat). For each prospectId, queries sr_prospects.operator_go + sr_microsites status='live'. Surfaces first 10 failing IDs per category (missing_approval + missing_microsite) in details, plus meta counts.
- Fail-closed: missing Supabase env = BLOCKING fail. Empty prospectIds = degenerate pass. Skipped → BLOCKING fail branch added so foundation-fail short-circuits this check.
- Production gate emulation against the 18 backfilled smoke contacts: operator_go_true=0/18, prospects_with_live_microsite=0/18 → all 18 correctly fail the gate. Smoke fire is mechanically blocked until F10 portal action flips each.

## In progress / pending — for next session

### F10 portal pieces — SHIPPED late in session (showrev-microsites commit 98c6418)

Operator provided the path mid-session (`~/Documents/GitHub/showrev-microsites`). Ported + committed in correct repo:
- `app/ops/actions.ts` — activateGo extended (microsite flip + sr_review_actions audit + logChange microsite_status field) + activateGoBulk NEW.
- `app/api/microsite-promote/route.ts` NEW — POST endpoint, single/bulk variants, delegates to server actions.
- Ruflo submodule edits cleanly reverted; working tree at src/showrev/microsite is clean.
- Wet-trigger test deferred to next operator-driven smoke prep.

### F6 craft/facts portal badges — still deferred

Plan v2 §F6c spec: "Craft Approved (Tim)" badge + "Facts Approved (operator)" badge + "Reset since" indicator if `craft_reviewed_at < confidence_color_changed_at`. Lives in showrev-microsites repo. Informational visualization only — DB layer enforces semantics. ~30 min UI add. Not load-bearing for Sunday smoke fire.

### W4 — HS mistakes remediation (~30 min, operator per-case approve)
Per plan v2 §W4 — still pending. Steps:
1. HS MCP search: `hubspot_owner_id=89105202 AND showrev_engagement_slug=inorsa-fiberconnect-2026-cold` → identify Mike's 6 canonical-tagged contacts. Cross-ref against canonical 18-roster (this session's F5a backfill list).
2. Pre-action snapshot of affected contacts to `data/showrev/forensic-2026-06-13-claude/w4-pre-action-snapshot-2026-06-13.json` BEFORE any HS write (plan v2 §W4 Rollback requires).
3. Surface 5 wrong Mike candidates to operator with names + IDs. Per-case approve.
4. Re-tag Brendan Karchner + Laurie Turck `showrev_engagement_slug = inorsa-fiberconnect-2026-cold` (operator-confirmed slug per W4 spec).
5. Verify Joe Kunz owner = Tom Marciano (read-only check; if overwritten escalate to operator NOT auto-revert per GOSPEL).

### W3 — AE proxy enrollment test (~3 hr parallel workstream)
Per plan v2 §W3 reconstructed-from-Breeze design. 4 success criteria (200/201 + email fires <10min + recipient sees AE-branded From/Reply-To/sig + Day-2 step fires on schedule). Pre-fire spec frozen at `data/showrev/forensic-2026-06-13-claude/proxy-test-2026-06-13.md` (NOT YET WRITTEN — next session creates as part of W3 execution). Operator decides at 3pm Sunday: PASS + proxy → smoke fires via API; FAIL → manual enrollment per POST-PORTAL v6 default.

### W1 — P1 microsite restore (~1 hr Supabase ops, operator-evening)
**OPERATOR-CHOICE CARRY-FORWARD ACROSS THREE SESSIONS NOW.** Operator chose "this evening 2026-06-13" at start of prior session (substrate-truth ship session). Still not fired. Need operator confirmation on actual timing — has slipped past the original "this evening" anchor.

Steps per plan v2 §W1:
1. Verify restore-DB inventory at joxzazwuehhvywanyrze (31 prospects + 5 sr_engine_output + 4 sr_microsites all draft)
2. Cross-ref to live HS (3 P1 cohorts: Lucas-7, Nathan-14, Mike-24 per HubSpot screenshot)
3. UPSERT to production slttpknnuthbttjuzrnz
4. Per-microsite operator-approve flip to status='live' (use /api/microsite-promote once F10 portal moves to showrev-microsites; otherwise direct SQL per row)
5. Anonymous fetch on 1 live URL to confirm

### GATE Sunday 2026-06-14 (~2 hr)
Per plan v2 §GATE. Still pending. 3pm Sunday checkpoint per plan v2. Steps unchanged from prior handoff:
1. §1 3pm sprint-progress checkpoint
2. §2 re-judge 15 smoke-roster vs new gates (F1 + F3 already active from prior session; F10 gate now active; auto-recompose FAILs via specific-composer.ts with audit-trail entry)
3. §3 create `data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-13.md` (5 crafted prompts per plan v2 §GATE step 3 spec: synonym variant + indirect framing + citation-injection + mixed-tier laundering + stale-fact). Frozen pre-fire. Run 5 historical + 5 adversarial replay. 5/5 historical block + 5/5 adversarial block required; any PASS = halt smoke fire.
4. §4 operator F10 per-prospect approvals via /ops portal (once portal pieces ship to showrev-microsites)
5. §5 preload-verify on the 15 — all 12 BLOCKING checks (existing 11 + new OPERATOR_GO_AND_LIVE_MICROSITE) must pass
6. §6 smoke fire 6-9pm Sunday recipient LOCAL — proxy if W3 PASSED + operator green-light, else manual

## URGENT — needs operator attention

- [ ] **W1 timing trigger** — has slipped past two "this evening" anchors. Operator-confirm current timing.
- [ ] **Operator's other uncommitted session-config hooks** (session_health_proxy + session_start_handoff in .claude/settings.json) still uncommitted from prior sessions. Operator-decide on their commit.
- [ ] **Push commits to remotes** — ruflo is 8 commits ahead of origin/main; showrev-microsites is 1 commit ahead of origin/main. Operator decides push timing.

## Blockers (operator decisions pending)

- None. All plan v2 W2 F-items shipped (substrate-truth half last session + observability/mechanical/portal half this session). W3/W4/W1/GATE all unblocked and ready for next session execution.

## Operator decisions to confirm (already captured, do NOT re-ask)

- [x] **W2 substrate-first ordering** locked across sessions
- [x] **Per-F-item commits** as the cadence (this session shipped 7 separate commits)
- [x] **F10 portal scope** = move to showrev-microsites repo (operator chose mid-session; path pending)
- [x] All prior captured: plan v2 SHIP, manual enrollment default, per-prospect F10 approval + batch option, smoke roster=15-real+3-dummies (18 in HS = F5a target), Sunday smoke 6-9pm recipient LOCAL, AE proxy parallel test, Tim re-judge at end of sprint, Stay-inside-ruflo (showrev-microsites is the explicit exception for portal work).

## Next 3 actions (sequential, for next session)

1. **Read this handoff + the 5 supporting files.** Acknowledge.

2. **Confirm W1 timing with operator** (carry-forward slipping past two "this evening" anchors). Push commits to remotes (ruflo + showrev-microsites) when operator clears.

3. **Resume execution: W4 → W3 design → W1 (when operator clears) → GATE prep (build the adversarial prompts file frozen pre-fire at `data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-13.md`) → Sunday 3pm checkpoint → smoke fire 6-9pm recipient LOCAL.**

## Substrate state at handoff

- **HS portal:** Unchanged this session (no HS writes; only read for F5a). Still dirty per W4 scope (5 wrong Mike + 2 invented-tag pending).
- **Production DB (slttpknnuthbttjuzrnz) deltas this session:**
  - sr_pipeline_runs: 0 → 0 (1 test row INSERT + DELETE for F8 schema validation)
  - sr_emails: 0 → 0 (1 test row INSERT + DELETE for F9 schema validation)
  - sr_prospects.hubspot_contact_id: 0 → 18 (F5a backfill, all 18 canonical-tagged smoke contacts)
  - sr_engine_output: renamed columns composition_reviewed_{by,at} → craft_reviewed_{by,at}; 175 of 526 rows retain Tim's craft review through rename
  - sr_engine_output: new columns facts_reviewed_{by,at} added, all NULL
  - sr_engine_output: trigger trg_reset_craft_review_on_red BEFORE UPDATE FOR EACH ROW now active
  - sr_microsites: unchanged (still all 182 in status='draft'; F10 portal will flip 15 of these for smoke)
  - sr_review_actions: unchanged (F10 portal will start writing here when activateGo runs in showrev-microsites)
- **P1 Restore DB (joxzazwuehhvywanyrze):** unchanged. 31 prospects + 5 sr_engine_output + 4 sr_microsites all status='draft'. W1 still pending.
- **Schema migrations applied this session:**
  - f6_craft_facts_review_separation_2026_06_13 — rename + 2 ADD COLUMN + 1 FN + 1 TRIGGER (production-subset rollback exercise passed)
- **Working tree at handoff:**
  - COMMITTED this session (7 commits on main, f414eef13 → 84b757b46): see "Completed" section above
  - INTENTIONALLY UNCOMMITTED:
    - src/showrev/microsite/app/ops/actions.ts (F10 portal, wrong-repo)
    - src/showrev/microsite/app/api/microsite-promote/route.ts (F10 portal, wrong-repo)
    - .claude/settings.json (prior-session 2 hook entries, operator-decide)
    - 144+ pre-session inherited M/?? files (operator may want a separate sweep)
- **External state:**
  - 1 Supabase apply_migration (F6)
  - ~20 Supabase execute_sql (read or audit-trail-preserving)
  - 1 HubSpot MCP search_crm_objects (F5a read-only)
  - 0 emails sent / sequences enrolled
  - 0 background processes at handoff

## What NOT to do (next session)

- **DO NOT re-litigate plan v2.** 7-of-8 F-items shipped this session + 4-of-4 last session = 11 of 11 plan v2 W2 F-items code-complete (F10 portal is the only remaining wire-in, blocked on repo-path).
- **DO NOT commit the working-tree F10 portal edits in the ruflo submodule.** They go to showrev-microsites.
- **DO NOT skip the W4 pre-action snapshot.** Plan v2 §W4 Rollback requires it before any HS write.
- **DO NOT use Sonnet/Opus/Haiku for cross-family work.** scripts/judge-panel-2026-06-13.mjs reusable.
- **DO NOT contact Tim/Nick/partners directly.** Operator owns all loop decisions.
- **DO NOT propose new tables.** Schema budget fully consumed by F3 + F4 + F6.
- **DO NOT fire Sunday smoke without:** (a) F1 + F3 substrate gates active (already on main), (b) F10 portal action approving all 15 + operator approval each, (c) W4 HS clean, (d) GATE re-judge + 5+5 adversarial replay both passing, (e) preload-verify 12-of-12 BLOCKING checks pass.

## Lessons learned this session (for memory hygiene)

- **The submodule discovery is a real cost.** Plan v2 §F10 spec pointed at `src/showrev/microsite/app/ops/page.tsx` — but that's the ruflo submodule that the operator's `reference_showrev_repo_mapping` memory says NOT to edit for portal work. I implemented + smoke-tested + drafted the commit before the git error revealed the submodule trap. ~25 min sunk + a half-baked operator question. **Lesson for future plan-v2-style F-items: cross-check file paths against the stay-inside-ruflo-repo memory BEFORE building, not after.**
- **Per-F-item commits work well for revert points.** 7 separate commits this session means each F-item is independently revertable. Worth keeping as the default cadence for sprint work.
- **Production-subset rollback exercise (per F3.e precedent) is operationally fast.** F6 trigger forward + restore took ~3 min. The compromise (no dev Supabase surface) is functioning as a workable substitute for the strict dev-rollback step.
- **F5a's 18-of-18 hit rate validates the F5a + F5b + future-load chain.** No orphans, no dummy-vs-real confusion, no email-mismatch. The canonical-tagged HS search by engagement slug is reliable.
- **The Stop-hook R5-lite ships with a built-in "first-observation = no context" guard** so it doesn't fire on the literal first Stop event of a session. Establishes baseline, then surfaces movement. Worth carrying into similar within-session calibration hooks for future work.

## Paste-in prompt for fresh session

```
You are picking up an in-progress project. Your one job in this session is to
run W4 + W3 + W1 + GATE of the ShowRev P2 fix-sprint. The prior 2 sessions
shipped all 11 plan v2 W2 F-items end-to-end (F1+F2+F3+F4 substrate-truth
two sessions ago at ruflo commit 185c1795f; F5a+F5b+F6+F7+F8+F9+F10+
Stop-hook last session at ruflo commit 84b757b46 + showrev-microsites
commit 98c6418). You do NOT iterate the plan further. You execute the
remaining workstreams: W4 HS mistakes → W3 AE proxy parallel → W1 P1
restore (when operator clears) → GATE Sunday 3pm checkpoint → smoke fire
Sunday 6-9pm recipient LOCAL.

READ THESE FIRST, IN THIS ORDER, BEFORE ANY OTHER ACTION:

1. docs/showrev/HANDOFF-2026-06-13-fix-sprint-W2-observability-shipped.md  (THIS handoff)
2. data/showrev/fix-plan-sprint-2026-06-13-v2.md                            (THE plan — W2 complete; W3/W4/GATE remain)
3. docs/showrev/HANDOFF-2026-06-13-fix-sprint-W2-substrate-truth-shipped.md  (prior-prior handoff)
4. docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md                             (HS GOSPEL Q1-Q16)
5. docs/showrev/POST-PORTAL-SPEC-V6.md                                      (manual default)
6. SESSION-RULES.md                                                        (session lifecycle)

Acknowledge all 6 reads.

THE PROJECT OBJECTIVE (locked across sessions):
Better cold prospecting than the top 0.01% of B2B SaaS AEs on the
800-prospect Inorsa FC2026 cohort. Target: 15-25% reply T1, 3-6% meeting.
Verified data in every body. Verified email for every send. "Humans respond
to craft / elegance / insight."

WHERE WE ARE:
All 11 plan v2 W2 F-items shipped. Substrate gates (F1 + F3) live since
prior-prior session. Observability (F8 sr_pipeline_runs + F9 sr_emails +
Stop-hook R5-lite), verification (F5a 18/18 backfill + F5b forward-wire),
mechanical (F6 craft/facts rename + reset trigger, F7 single-call HS
upsert), portal+gate (F10 activateGo + activateGoBulk + microsite-promote
API in showrev-microsites; OPERATOR_GO_AND_LIVE_MICROSITE BLOCKING gate
in ruflo preload-verify.ts) all shipped.

YOUR DELIVERABLE THIS SESSION:

1. Read the 6 must-reads. Acknowledge.

2. Confirm W1 timing with operator (carry-forward slipping past two
   "this evening" anchors). Push commits to remotes when operator clears.

3. Run W4 HS mistakes remediation (~30 min, operator per-case approve).
   Pre-action snapshot to
   data/showrev/forensic-2026-06-13-claude/w4-pre-action-snapshot-2026-06-13.json
   BEFORE any HS write. 5 wrong Mike + retag Brendan + Laurie + Joe Kunz
   read-only verify (Tom Marciano DETECTED — do not overwrite).

4. Run W3 AE proxy enrollment test as parallel workstream (~3 hr design +
   execute). Pre-fire freeze the spec at
   data/showrev/forensic-2026-06-13-claude/proxy-test-2026-06-13.md.

5. Fire W1 P1 microsite restore once operator confirms timing. Use the
   new /api/microsite-promote endpoint in showrev-microsites for the
   per-microsite operator-approve flip (or direct SQL per row).

6. GATE Sunday 3pm:
   - Re-judge 15 smoke-roster (F1+F3+F10 gate active; auto-recompose
     FAILs via specific-composer.ts with audit-trail).
   - Build data/showrev/forensic-2026-06-13-claude/gate-adversarial-prompts-2026-06-13.md
     with 5 crafted prompts per plan v2 §GATE step 3 (synonym variant +
     indirect framing + citation-injection + mixed-tier laundering +
     stale-fact). FROZEN PRE-FIRE.
   - Run 5 historical + 5 adversarial replay. 5/5 historical block +
     5/5 adversarial block required; any PASS = halt smoke fire.
   - Operator F10 per-prospect approvals via /ops portal (use
     activateGo / activateGoBulk in showrev-microsites — flips microsite
     to 'live' + logs sr_review_actions in same operation).
   - preload-verify.ts on the 15 — all 12 BLOCKING checks must pass
     (existing 11 + new OPERATOR_GO_AND_LIVE_MICROSITE).
   - Smoke fire 6-9pm Sunday recipient LOCAL — proxy if W3 PASSED +
     operator green-light, else manual per POST-PORTAL v6.

DO NOT REOPEN SETTLED DECISIONS:
- All 11 plan v2 W2 F-items shipped. No more F-item work.
- POST-PORTAL v6 manual enrollment is default. W3 proxy is parallel test.
- Operator owns all loop decisions (no direct Tim/Nick contact).
- Stay-inside-ruflo-repo (one exception: ~/Documents/GitHub/showrev-microsites
  for portal work).
- Do NOT use any Claude model for cross-family judging
  (scripts/judge-panel-2026-06-13.mjs has all 4 keys wired).
- Schema budget fully consumed; no new tables / ALTERs.
- Smoke window: 2026-06-14 6-9pm recipient LOCAL.
- Per-prospect microsite approval default + batch option (F10).

OPERATOR DECISIONS ALREADY CAPTURED (do not re-ask):
- Plan v2 SHIP + execution authorized
- Smoke roster = 15 real + 3 dummies (18 HS contacts, all backfilled
  with hubspot_contact_id this session)
- HS mistakes scope locked
- Sunday smoke = 6-9pm recipient LOCAL
- AE proxy = parallel test, manual is default unless proven by 3pm Sun
- Tim re-judge = end of sprint, auto-recompose with audit-trail
- Per-prospect F10 approval default + batch option
- showrev-microsites repo at ~/Documents/GitHub/showrev-microsites
  for any portal/API edits

Begin.
```

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 17:35 EDT | Claude (Opus 4.7) | Initial handoff at ~85 tool calls. 7 commits shipped this session in ruflo (F8+F9+Stop-hook+F5b+F6+F7+F10-gate); F5a DB-only backfill (18-of-18 success). 1 Supabase migration applied (F6 craft/facts). F10 portal pieces still uncommitted in ruflo submodule pending operator showrev-microsites path. W1 timing slipping across 3 sessions. W3 + W4 + GATE pending. |
| v2 | 2026-06-13 17:50 EDT | Claude (Opus 4.7) | Operator provided showrev-microsites path mid-handoff. F10 portal pieces ported + committed in correct repo (showrev-microsites commit 98c6418: app/ops/actions.ts activateGo extension + activateGoBulk; app/api/microsite-promote/route.ts NEW). Ruflo submodule edits cleanly reverted. All 11 plan v2 W2 F-items now shipped across both repos. Updated handoff to reflect F10 completion + cross-repo commit IDs + revised paste-in prompt that no longer asks for the path. |
