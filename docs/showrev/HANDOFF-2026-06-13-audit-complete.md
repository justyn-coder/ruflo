---
title: Audit complete — fix-plan session next
date: 2026-06-13 EDT
session_name: pm-build-fix
status: complete
git_commit: pending — uncommitted working tree
tool_calls_at_handoff: ~140
authored_by: Claude (Opus 4.7) at end of ~6h forensic + substrate-effectiveness + recommendation session
operator_state: At coffee when this was drafted. Mid-week, calmer than late last week.
next_session_must_read:
  - data/showrev/forensic-2026-06-13-claude/audit-report.md  # THE primary input — has fix/rebuild/re-orch recommendations
  - data/showrev/forensic-2026-06-13-claude/system-schematic.html  # visual reference
  - data/showrev/pipeline-backlog.md  # BL-016 at top is the canonical pre-flight item
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md  # GOSPEL — binding HS constraints any plan must respect
  - docs/showrev/POST-PORTAL-SPEC-V6.md  # ratified post-portal — DO NOT propose API enrollment
  - canon/sources/inorsa-product-truth-nick-2026-06-04.md  # Nick canon — kill-list lines 57-61
  - SESSION-RULES.md  # session lifecycle rules from 2026-06-12 PM
---

# Handoff: forensic audit complete, fix-plan session next

## TL;DR for next reader

We finished a comprehensive forensic on the P2 cold-prospecting system today, including 85 minutes of focused gap-closing after the operator caught a thoroughness shortfall. The audit report is the primary deliverable and lives at `data/showrev/forensic-2026-06-13-claude/audit-report.md`. It is calibrated, sourced, and ready to be turned into a plan of action.

Your job in the next session is to take that audit and develop the build plan that gets us to the win — 800-prospect FC2026 cohort, top-0.01% reply rate, sustainable trust. The recommendations are organized as FIX / REBUILD / RE-ORCHESTRATE, mapped to four binding capabilities (Measure outcomes / Know what is true / Close the loop / Scale humans). Use that as the spine of your plan.

Do not reopen settled decisions. POST-PORTAL v6 ratified manual sequence enrollment. Operator chose manual capture for Nick DMs over a Slack pipe. v2 is the production pipeline; v1 is retired-on-disk. The composer is fine — it does not need a rewrite. The judge is fine — it does not need a rewrite. The DB schema is sane — it needs columns wired, not redesigned.

## Goal of this session (now complete)

Originally: be honest about thoroughness, close the gaps that would let a Sn PM catch us, then write the audit + recommendations + handoff.

Done. Audit report exists. Recommendations cover three buckets with effort estimates. Handoff bridges to the build-plan session.

## Completed

- [x] Read all session-required docs (handoffs, SESSION-RULES, prior forensic synthesis)
- [x] Built visual schematic at `data/showrev/forensic-2026-06-13-claude/system-schematic.html` (light-mode, WCAG-accessible)
- [x] Filed BL-016 in `pipeline-backlog.md` for the Inorsa-validates kill-list gap
- [x] Promoted Nick's JTBD review into DB as 14 `sr_company_evidence` rows (`nick_jtbd_01` through `nick_jtbd_14`)
- [x] Captured Nick's Slack clarification on critical-datapoint behavior (`nick_jtbd_14_critical_datapoint_clarification`)
- [x] Verified the /brief/chris URL is wired for Nick's 20-quote review (with hardcoded reviewer='chris' workaround — operator chose to flip attribution post-hoc)
- [x] Verified the Inorsa-validates-inputs hallucination gate is decision-made-but-not-code-wired
- [x] 85-minute focused gap-closing pass: HS GOSPEL, post-portal v6, send-confidence spec, influence.ts (the 600-line stat-library + PS-variant integration), personas.ts, core table schemas, /ops portal WebFetch, real shipped-email sample
- [x] Wrote `audit-report.md` covering executive summary, four binding capabilities, what's built, what's working, what's broken, what's never been built, calibrated 51/100 forensic score, 10-FIX + 5-REBUILD + 6-RE-ORCHESTRATE recommendations mapped to objectives, risks if no action

## In progress (mid-flight)

- [ ] Nick's 20-curated-quote validation pass — link sent to operator, awaiting Nick session
  - Operator chose Option A: share URL as-is (hardcoded reviewer='chris'), flip attribution after via SQL UPDATE
  - Recipe for the flip is documented in the chat thread; run it when Nick is done

## URGENT — needs operator attention before next session ends

- [ ] **P1 microsites are likely broken in production.** Operator confirmed 2026-06-13 that a prior agent erased all P1 send data from the production Supabase (`slttpknnuthbttjuzrnz`). The pre-erase state was captured in a separate project, **P1 Restore at `joxzazwuehhvywanyrze.supabase.co`** — confirmed accessible. Restore inventory: 31 prospects (3 Attendee + 26 Cold), 5 sr_engine_output rows, 4 sr_microsites all `status='draft'`. **Live risk:** the 45 booth-visitor contacts in the FC2026 HS lists (Lucas 7 + Nathan 14 + Mike 24) received emails last week. If they click their microsite link RIGHT NOW, they hit nothing under anon RLS (which only exposes `status='live'`). This is a live trust-degradation event happening every day until restore + status flip. Treat as URGENT-1 in the build plan.

## Blockers (operator decisions pending)

- [ ] **Are we starting the build phase now, or holding for Sunday-smoke result?** Sunday smoke fires 2026-06-14 8-10am recipient local. Result data lands Mon-Wed. Fix-plan execution could either (a) start now with F1-F2 (the 30-minute consistency fixes), or (b) wait for smoke replies to inform priority. Operator-decide.
- [ ] **Approval to flip microsites to 'live'** is required before any HS sequence-driven sends. Today every microsite is `status='draft'` in production. The 18 Sunday-smoke prospects need their microsites flipped or the prospect-facing pages will return nothing to clicks. The 45 P1 contacts need restore + flip. This is F10 in the audit but practically needs to be done before Sunday 8am ET for P2 and ASAP for P1.
- [ ] **Fix-plan session model + budget.** The audit estimates ~15 hours of FIX work, ~50 hours of REBUILD over 2-3 weeks, ongoing RE-ORCH cadence. Operator-decide on calendar shape (sprint vs trickle) and whether to bring Tim/Nick into the loop on any of it.
- [ ] **P1 send-results analysis** — the 45 P1 contacts in the 3 FC2026 HS lists have ~9 days of engagement data (opens, clicks, bounces, replies, meetings). Operator-confirm whether next session should pull this and use it as a baseline / sanity check on warm-cohort metrics. Caveat: P1 was WARM (booth-visitor, badge-scanned, known emails), so reply rates here are a ceiling not a benchmark for P2 cold targets.

## Operator decisions to confirm

- [ ] Audit grading at 51/100 — operator agrees / pushes back / wants me to defend specific dimensions?
- [ ] FIX-tier priority ordering as proposed (F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10) — operator wants different sequencing?
- [ ] Are there capabilities I missed? The audit organizes around 4 binding (Measure / Know-truth / Close-loop / Scale-humans). Anything else load-bearing?

## Next 3 actions (sequential, for next session)

1. **Read `data/showrev/forensic-2026-06-13-claude/audit-report.md` end-to-end before any other action.** It's the primary input. Acknowledge in your first response that you've read it.

2. **Produce a build plan that takes the FIX bucket and turns it into a sprint.** Each FIX item with: file path, exact lines to change, test plan, who-does-the-review, rollback strategy. The audit gives you the WHAT — you produce the HOW with concrete enough detail that the operator can red-team it.

3. **Identify the operator-decision dependencies in REBUILD.** R1 (KB-to-DB) and R3 (Distillation layer) both require operator judgment calls before code starts — what JTBD weighting, what bellwether accounts to track, what cadence. Surface those decisions as a tight 3-question block at the end of your first message, after the build plan.

## Substrate state

- **HubSpot**: 18 Sunday-smoke contacts loaded across 3 AE cold lists. 2026-06-12 morning damage (5 wrong Mike contacts + 2 contacts with invented `excluded-prohibited-substrate` tag) still **pending operator remediation** per yesterday's PM handoff. DB has 0 prospects with `hubspot_contact_id` backfilled — operator may have actioned the remediation, or it may still be open.
- **DB**: 14 new `sr_company_evidence` rows landed today under `source_kind='manual'` with Nick provenance. Composer does not yet pull them (R1 in audit). Other state unchanged.
- **Microsites**: 182 rows, all `status='draft'`. Anon RLS blocks. Sunday smoke prospect-facing pages need status flip.
- **Uncommitted working tree**: numerous new files including the schematic, audit report, this handoff, the SESSION-RULES + harness from yesterday. Operator can stage + commit on their schedule.

## What NOT to do (next session)

- **Do not reopen the v1-vs-v2 pipeline debate.** v2 is production. v1 is retired-on-disk. Done.
- **Do not propose API sequence enrollment.** POST-PORTAL v6 ratified manual. The reasons (P1 did it this way, eliminates silent-skip/sender-disconnect failure classes, no API scope needed) are settled.
- **Do not propose new tables for substrate trust.** The narrow fix is two ALTER TABLE column adds (`domain_tier`) — not new tables.
- **Do not auto-execute the FIX bucket.** Operator wants a plan first.
- **Do not propose composer or judge rewrites.** Both work. Wire the gates we have; don't redesign.
- **Do not skip the audit-report read.** It's 12KB but it carries the calibrated grading and the load-bearing constraint that the recommendations respect (the 10 don't-recommend items at the bottom).
- **Do not invent a Tim-approval-reset rule** without flagging that no spec exists for it. Surface as a decision point.
- **Do not auto-flip microsite status to 'live'** without operator approval per prospect.

## Lessons learned this session (for memory hygiene)

- **The thoroughness shortfall I had at hour 5 was real and operator-caught.** I had ~50% of the forensic done with high confidence on the substrate-and-composer dimensions, and effectively zero on the post-portal workflow, HS GOSPEL, decisions infrastructure, real shipped-email reality, and audit-trail state. The 85-minute follow-up pass changed the score from 53→51 but materially changed WHERE the gaps are. **Lesson: a forensic that hasn't read the spec docs AND queried the audit tables AND fetched a real email is incomplete, regardless of how confident the partial story sounds.**
- **The substrate-contamination narrative was over-indexed.** Yesterday I had it as the headline gap. After reading actual shipped emails: composer is following prompt-template guidance (Nick's voice baked into `personas.ts`) and producing defensible specifics. The gap is regression-shaped, not actively-breaking. Real headline gap is observability.
- **The audit-trail tables being empty (`sr_pipeline_runs`, `sr_emails`, etc.) is the single thing I'd most want a Sn PM to call out about this system.** Schema is wired; write-side is not. The system runs on `sr_engine_output` for everything, which means there's no separation between "what was composed" and "what was sent" or "what's in HS."
- **Soft enforcement via prompt templates is more powerful than I credited.** Nick's "40-50% permit rejection" + "Inorsa's value is SPEED, does not perform QA" framing is in the `personas.ts` research prompt. The LLM sees this every compose-time. That's why the regression I worried about isn't currently happening. But it's also why the BL-016 hard-gate is still the right fix — soft enforcement is one bad prompt-edit away from drift.
- **Manual capture for operator-source content was the right operator call.** The other paths (Slack channel watcher, portal attestation lane) are over-engineering for the <10-DM/week cadence. Pattern stays as it is.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-13 EDT | Claude (Opus 4.7) | Initial handoff after audit-report finalized. Includes 85-minute gap-closing pass + Nick promotion + URL wiring verification + BL-016 filing. |
