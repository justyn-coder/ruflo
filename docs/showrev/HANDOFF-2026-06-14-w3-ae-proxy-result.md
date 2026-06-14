---
title: W3 AE Proxy Enrollment Test — PASS on all 3 Day-1 criteria; (d) deferred per operator
date: 2026-06-14 12:35 EDT
session_name: w3-ae-proxy-enrollment-test
status: complete
git_commit: 84b757b46bffb94d213c749f1edc322d6ec04638
tool_calls_at_handoff: ~104
authored_by: Claude (Opus 4.7) at end of ~30-min parallel W3 session
operator_state: high-energy validation moment ("it's coming from him!!!!!" / "i can't believe it works!!"). Data-strategy parallel session unrelated.
next_session_must_read:
  - docs/showrev/HANDOFF-2026-06-14-w3-ae-proxy-result.md  # THIS handoff
  - docs/showrev/HANDOFF-2026-06-14-data-strategy-ratified.md  # parallel-session handoff (data strategy)
  - docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md  # Q1 needs updating with userId finding
  - docs/showrev/POST-PORTAL-SPEC-V6.md  # Component 0 wrapper needs userId param
  - data/showrev/fix-plan-sprint-2026-06-13-v2.md  # §W3 spec lines 454-503
  - SESSION-RULES.md
---

# Handoff: W3 AE proxy enrollment — PASS, proxy path open for Sunday smoke

## TL;DR for next reader

W3 test ran in parallel with the data-strategy implementation session. **Day 1 PASS on all 3 active criteria** — the Sequences API can enroll a contact on Mike Rutski's behalf, the email fires within 60 seconds, and Gmail receives it as `Michael Rutski <mike@inorsa.com>` with `mailed-by: inorsa.com` (not via.hubspot.com). Day 2 criterion deferred per operator at 11:58 AM EDT.

**Significant finding worth flagging immediately:** the 2026-03 endpoint requires `userId` as a **query parameter** in addition to `senderEmail` in the body. Q1 in HUBSPOT-INTEGRATION-RESEARCH.md captured the endpoint URL but not this requirement. Without the query param: `400 "query param userId may not be null"`. POST-POSTAL v6 Component 0 wrapper must take a userId arg.

**Sunday 6-9pm smoke decision:** proxy path is technically open. Operator decides at 3pm checkpoint whether to use proxy or stay manual for the 15-contact roster.

## Goal of this session

Validate W3 AE Proxy Enrollment Test (single-contact, against `justyn+apienrolltest@tasteforyourself.com`, sender = `mike@inorsa.com`). Spec at `data/showrev/fix-plan-sprint-2026-06-13-v2.md` §W3 lines 454-503.

## Completed

- [x] Read W3 spec, HUBSPOT-INTEGRATION-RESEARCH Q1/Q10/Q13/Q16, POST-PORTAL v6 Component 0
- [x] Operator pre-flight confirmed (3 items): test inbox = `justyn+apienrolltest@tasteforyourself.com`, WatchTower scope present, operator hand-built sequence in HS UI
- [x] HS read-only prep: Mike's owner ID + userId both = **89105202** (`hs_internal_user_id` confirmed via `search_crm_objects objectType=users`); test email confirmed clean (no existing contact)
- [x] Operator built segment `FC2026 P2 - Mike Rutski Proxy Test` (email-only filter, dynamic, size 0 until contact created)
- [x] Operator built sequence `FC2026 — Mike Rutski AE Proxy Test` (ID **685757171**, single-step Day 1, sharing = Everyone, unenroll on reply + meeting-booked)
- [x] Created test contact via MCP — ID **501625020132**, owner = Mike (89105202), 6 T1 token properties populated with benign placeholder
- [x] Wrote one-shot enrollment script at `/tmp/w3-proxy-enroll.mjs` (raw fetch, NOT wired into Component 0 since N=1)
- [x] First POST attempt: **400** with finding — `userId` is a required query param (NOT in Q1 research)
- [x] Second POST: **200 OK** at 12:27:11 EDT, enrollment ID **3734521535**
- [x] Operator confirmed inbox arrival at 12:27 PM EDT (~< 1 min from enrollment), `From: Michael Rutski <mike@inorsa.com>`, `mailed-by: inorsa.com`, full Mike signature, unsubscribe link present
- [x] Unenroll DELETE returned 404 — single-step sequence ran to completion, no active enrollment to delete (this is correct behavior, not an error)
- [x] Archived test contact: owner cleared, slug → `excluded-test-proxy-w3-2026-06-14`, lastname → `W3-Proxy-Test-ARCHIVED`

## Verdict by criterion

| Criterion | Verdict | Evidence |
|---|---|---|
| (a) API returns 200/201 | ✅ PASS | `200 OK`, enrollment ID `3734521535`, response body shows `toEmail` + `enrolledAt` |
| (b) Email fires within 10 min | ✅ PASS | Enrolled 12:27:11 EDT → received 12:27 PM EDT, <60s |
| (c) Recipient sees AE-branded send | ✅ PASS | `From: Michael Rutski <mike@inorsa.com>`, `mailed-by: inorsa.com` (NOT via.hubspot.com), full Mike signature, `Reply-To: mike@inorsa.com`, SPF/DKIM/DMARC aligned (Gmail TLS green check, no spoofing warning) |
| (d) Day 2 step fires on schedule | ⏸ DEFERRED | Per operator at 11:58 AM EDT: "we'll do the Day 2 test after we confirm this works." Sequence was single-step; Day 2 not added. Documented behavior in HS research Q8/Q10 — not blocking smoke decision. |

**Overall verdict:** 3-of-3 active criteria PASS. W3 hypothesis validated.

## In progress (mid-flight)

None. Session complete.

## Blockers

None.

## Operator decisions pending

- [ ] **3pm Sunday checkpoint:** use proxy path or stay manual for 15-contact smoke at 6-9pm tonight?
  - Proxy: API call enrolls all 15 across 3 AEs, no per-contact AE UI touch. Validated tonight.
  - Manual: AEs each click "Enroll contacts" from active list. POST-PORTAL v6 default.
  - Trade-off: proxy is now de-risked at N=1. The 15-contact smoke serves as N=15 validation before scaling to 800. Manual loses that signal.

- [ ] **HS UI cleanup (low priority, your-time-permitting):**
  - Delete sequence `FC2026 — Mike Rutski AE Proxy Test` (ID 685757171) via UI: Sequences → search → Actions → Delete
  - Delete segment `FC2026 P2 - Mike Rutski Proxy Test` via UI: Lists → search → Actions → Delete
  - Both plainly named with "Proxy Test" so trivial to find. No urgency — they don't interfere with anything.

- [ ] **Day 2 (deferred) follow-up validation:** before scaling to 800-prospect P2 cohort, want N=1 Day 2 fire validation? Adds belt-and-suspenders to the documented Q8/Q10 behavior. ~25 min setup + 1-day wait.

## Next 3 actions (sequential, for next session)

1. **Update HUBSPOT-INTEGRATION-RESEARCH.md Q1** — add the `userId` query-param requirement to the answer. Q1 currently shows endpoint URL only; the body shape `{sequenceId, contactId, senderEmail}` is correct but incomplete. Document: `POST /automation/sequences/2026-03/enrollments?userId=<hs_internal_user_id>`. This stops the next session from re-hitting the 400.

2. **Update POST-PORTAL-SPEC-V6.md Component 0** — `hsApi()` signature needs a `queryParams` arg, OR Component 3 (Sequence enroller — currently DROPPED in v6) needs reinstating with userId as a per-AE input. Operator's call which way. If proxy enrollment is the new default for 800-prospect scale, Component 3 comes back.

3. **Capture userId per AE into config** — the proxy path requires a userId per sender. For the 3 AEs (Mike, Nathan, Lucas), look up their `hs_internal_user_id` via the same MCP query I used (`search_crm_objects objectType=users query=<name>`) and add to engagement config. Mike = 89105202 confirmed.

## Substrate state

- **HS portal:** test contact `501625020132` archived (owner cleared, slug = `excluded-test-proxy-w3-2026-06-14`, lastname tagged ARCHIVED). Sequence + segment remain in place pending operator UI deletion (low priority — plainly named "Proxy Test"). Enrollment `3734521535` ran to completion + auto-cleared. **Production AE owner properties on real contacts NOT touched.**
- **DB state:** zero writes this session. Did not touch `sr_prospects`, `sr_hs_api_calls`, or any other sr_* table. N=1 didn't need wrapper instrumentation.
- **Uncommitted files:** none added this session (continuation of prior 152-uncommitted state). New file: `docs/showrev/HANDOFF-2026-06-14-w3-ae-proxy-result.md` (this file). One-shot scripts at `/tmp/w3-proxy-enroll.mjs` + `/tmp/w3-unenroll.mjs` are tmp, not repo.
- **API quota burn:** ~6 calls total (1 owner search, 1 user search, 1 contact create, 2 enrollment POST, 1 enrollment DELETE, 1 contact update). 624,996/625,000 daily remaining at 12:27 EDT — sub-0.001% of pool.

## What NOT to do

- **Do NOT re-attempt enrollment for this test contact** — it's archived, sequence ran to completion. Any further enrollment work belongs in a fresh test or production scale-up.
- **Do NOT rely on Q1 alone for the enrollment endpoint shape** — Q1 captures URL but misses `userId` query param. Always check current source-of-truth (this handoff + amended Q1 once updated).
- **Do NOT confuse ownerId with userId in general.** For Mike they happen to be equal (both 89105202). For Nathan + Lucas this may not hold — verify via `search_crm_objects objectType=users` per AE before scale enrollment.
- **Do NOT delete the test sequence/segment via API.** Operator deletes via UI when convenient. Programmatic delete adds blast-radius risk for zero gain.
- **Do NOT claim Day 2 PASS without actually validating it.** (d) is currently DEFERRED, not validated. Document trust-by-Q8/Q10 instead of "PASS."

## Lessons learned this session (for memory hygiene)

- **`feedback_hs_sequences_2026_03_requires_userId`** (NEW candidate memory) — the 2026-03 enrollment endpoint requires `?userId=<hs_internal_user_id>` query param, even though `senderEmail` is also in body. Without it: 400 "query param userId may not be null". `userId` ≠ `ownerId` conceptually, even if same numeric value for some users. Lookup pattern: `mcp__claude_ai_HubSpot__search_crm_objects objectType=users query=<name> properties=[hs_internal_user_id, hs_email]`.

- **Sequence "Owner" in HS UI ≠ "Sender" via API.** The sequence Owner field shows whoever created it (Justyn here). Send routing is determined by `senderEmail` body + `userId` query at enrollment time. As long as sharing is set to "Everyone" (or shared with the target AE) on the sequence, anyone whose userId is passed can send.

- **MCP `manage_crm_objects` schema gotcha:** `confirmationStatus` is REQUIRED (not optional), and the wrapper expects `createRequest: { objects: [...] }` not flat `operations: [...]`. Worth noting for any session that wants to programmatically write to HS via MCP.

- **404 on enrollment DELETE for completed enrollments is correct behavior, not failure.** Single-step sequences run to completion immediately; no "active" state exists post-fire. Don't write retry logic around this.

- **`mailed-by: inorsa.com` (not `via.hubspot.com`) is a load-bearing deliverability signal.** SPF/DKIM/DMARC on inorsa.com are aligned. Scale to 800 contacts won't incur "via" deliverability degradation. Capture this in any future proxy-vs-manual write-up.

## Version history

| Version | Date (EDT) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-14 12:35 | Claude | Initial handoff — W3 PASS verdict, userId query-param finding, archive trail captured |
