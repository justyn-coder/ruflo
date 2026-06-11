---
title: HubSpot Integration Research — Breeze Q&A Log
status: ACTIVE
last_updated: 2026-06-11 16:35 EDT
version: v1
audience: Future Claude sessions + operator
purpose: Canonical reference for HubSpot Sequences API behavior, rate limits, and tier-specific constraints. Stop re-asking the same questions across sessions.
---

# HubSpot Integration Research — Breeze Q&A Log

**Client context:**
- HubSpot plan: **Sales Hub Professional + Marketing Hub** (NOT Enterprise)
- Verified 2026-06-11 by operator
- Private app used for showrev pipeline integration

**How to use this doc:**
- Questions are numbered Q1-Q14 (drafted for spec v4 post-portal pipeline)
- Each question has the prompt verbatim (so it can be re-asked if HubSpot's behavior changes)
- Answers are captured with date received + source URLs if cited
- Status: `pending` / `answered` / `partially answered` / `deferred`
- Impact on showrev spec is captured per answer

---

## Q1 — Sequences API rate limits — ANSWERED 2026-06-11

### Prompt verbatim
> When I use the HubSpot Sequences API to enroll contacts via POST /automation/v3/sequences/{id}/enrollments on a Sales Hub Professional plan, what are the rate limits? Is it shared with the standard CRM v3 limits (190 requests per 10 seconds), or does it have separate quotas? What's the typical throughput I should expect for enrolling 50-100 contacts in a single batch using a private app?

### Answer (Breeze, 2026-06-11)
- **Burst limit:** 190 requests per 10 seconds per private app
- **Daily limit:** 625,000 requests/day per account (shared across private apps)
- **Sequences-specific daily cap:** **1,000 enrollments per portal inbox per day**
- Sequences endpoint uses the standard private-app burst quota (no documented per-second sub-limit)
- For 50-100 enrollments in a batch: well within burst ceiling, can fit in a single 10-second window
- **Recommended pattern:** throttle to 5-10 enrollments/second with 429 retry handling
- 429 responses identify whether 10-second or daily policy was hit
- Response headers expose active window + remaining quota on normal requests

### CRITICAL CORRECTION
- The current endpoint is **`POST /automation/sequences/2026-03/enrollments`** — NOT `/automation/v3/sequences/{id}/enrollments`
- Spec v5 had the wrong endpoint. Must be updated to v6.

### Impact on spec
- Component 3 endpoint URL must be corrected throughout
- Component 6 (send-cap enforcer): the 1,000/day inbox cap is the OUTER bound. Our 30/AE/day × 3 AEs = 90/day is well within
- Add 429 retry logic with exponential backoff
- Add header inspection for remaining-quota awareness

---

## Q2 — Sequence enrollment idempotency — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, if I POST to /automation/v3/sequences/{id}/enrollments with a contactId that is already actively enrolled in that same sequence, what does the API return? A 409 conflict, a 200 with "already enrolled" status, a duplicate enrollment, or does it silently pause and restart? I need this to make my retry logic safe.

### Answer (Breeze, 2026-06-11)
- HubSpot does NOT document the exact response behavior for duplicate-enrollment attempts
- **Documented safe pattern:** check enrollment status FIRST via `GET /automation/sequences/2026-03/enrollments/contact/{contactId}` before POST
- This endpoint returns whether a contact is enrolled in ANY sequence at the time of the request
- If returned `sequenceId` matches target → treat as idempotent success, do NOT POST again
- Only POST a new enrollment if contact is not currently enrolled

### Retry pattern (recommended)
```
On timeout / unknown result:
  - call enrollment-status for that contactId
  - if sequenceId == targetSequenceId, mark success
  - otherwise retry POST with backoff
```

### Impact on spec
- Component 3 Step 5 (pre-enroll idempotency): use the documented enrollment-status endpoint instead of the property-read pattern (`hs_sequences_actively_enrolled_count`) — more reliable
- This is the documented safe pathway

---

## Q3 — Sequence pause/edit detection — PENDING

### Prompt verbatim
> On Sales Hub Professional, is there a way via the API to programmatically detect if a HubSpot sequence has been edited or paused since my last successful enrollment? Specifically, is there a lastModifiedDate or isActive field I can check on the sequence object before enrolling new contacts? I want to halt enrollment automatically if the sequence is being edited.

### Status
Not yet asked Breeze.

---

## Q4 — Engagement event real-time vs batched — PENDING

### Prompt verbatim
> On Sales Hub Professional, when a contact is enrolled in a sequence and the first email sends, how quickly do engagement events appear on the contact record's properties? Specifically: notes_last_contacted, hs_email_last_open_date, hs_email_last_click_date, hs_email_last_reply_date. Are these real-time, or batched at some interval? I'm building a watcher that polls these properties and want to set the right poll interval.

---

## Q5 — Bounce event propagation — PENDING

### Prompt verbatim
> On Sales Hub Professional, when a sequence email hard-bounces, does HubSpot automatically update the contact's hs_email_hard_bounce_reason and pause the sequence for that contact? How quickly does this happen? Or do I need to monitor and respond myself? What's the recommended way to halt an entire sequence batch if hard-bounce rate exceeds 5%?

---

## Q6 — Custom property visibility for AEs — PENDING

### Prompt verbatim
> On Sales Hub Professional, when I create custom contact properties via the API (e.g., showrev_research_summary, showrev_talking_points, showrev_signal_strength), are they automatically visible to AEs in the HubSpot UI on the contact record? Or do I need to manually add them to the AE's contact-view configuration? Trying to ensure the AE sees the research context when they open the contact.

---

## Q7 — Contact-to-company auto-association — PENDING

### Prompt verbatim
> On Sales Hub Professional, when I POST a new contact via /crm/v3/objects/contacts with a "company" property value that matches an existing company name in the portal, does HubSpot automatically associate the contact to that company? Or do I need to explicitly POST an association via /crm/v4/objects/contacts/{cid}/associations/companies/{cid}? Trying to avoid creating orphan contacts.

---

## Q8 — Sequence enrollment vs immediate send — PENDING

### Prompt verbatim
> On Sales Hub Professional, if I enroll 100 contacts in a sequence via API on a Monday morning, does HubSpot honor the sequence's day-of-week and time-of-day send schedule, or does it fire all the first-step emails immediately? I want to enroll in batches but trust HubSpot to throttle the actual sends per the sequence settings.

---

## Q9 — HS 409 response shape — PENDING

### Prompt verbatim
> On Sales Hub Professional, when I POST a new contact to /crm/v3/objects/contacts with an email that already exists in HubSpot, what's the exact response body structure for the 409 conflict? Specifically: is the existing contact ID returned in the 409 body (so I can use it directly), or do I need to follow up with a separate GET-by-email search?

---

## Q10 — Per-user sequence enrollment daily cap — PARTIALLY ANSWERED

### Prompt verbatim
> On Sales Hub Professional, what is the maximum number of contacts a single user can enroll in sequences per day? Is there a per-user daily cap, a per-portal daily cap, or both? I'm planning to enroll 30 contacts per day per AE across 3 AEs (90 total per day) — is this safely within limits?

### Partial answer (derived from Q1 answer, 2026-06-11)
- HubSpot documents **1,000 enrollments per portal inbox per day** (Q1 answer)
- Whether this is per-USER or per-PORTAL is unclear — likely per-portal
- 90/day total across all AEs is well within the 1,000/day cap
- BUT: per-sender daily send limit on Sales Hub Pro exists separately — that's the "silent skip" hazard
- Still need explicit Breeze confirmation of per-USER (vs per-portal) cap

---

## Q11 — Bounce property update lag — PENDING

### Prompt verbatim
> On Sales Hub Professional, when a hard bounce occurs in a sequence, how quickly does HubSpot update hs_email_hard_bounce_reason on the contact record? Is it real-time (within seconds), or batched (every X minutes)? I need to know to set my bounce monitor polling interval — too short wastes API calls, too long lets the sequence keep firing while I'm blind to bounces.

---

## Q12 — Custom property types on Pro — PENDING

### Prompt verbatim
> On Sales Hub Professional, can I create custom contact properties of type "textarea" (multi-line text) and "richtext" via the /crm/v3/properties/contacts API? Or are some property types restricted to Enterprise? I need to know which types are available because some of my showrev_* properties (research summaries, talking points) need rich formatting.

---

## Q13 — Workflow API access on Pro — PENDING

### Prompt verbatim
> On Sales Hub Professional + Marketing Hub, what level of access do I have to the Workflows API via private apps? Can I programmatically create workflows, read workflow state, trigger workflows via property changes? I'm considering using a workflow as a fallback for sequence enrollment — if a contact has showrev_ready_for_sequence=true, a workflow could enroll them in the right sequence. Is this pattern supported on Pro?

---

## Q14 — Daily API limit confirmation — ANSWERED via Q1

### Prompt verbatim
> Confirming for Sales Hub Professional: my private app has 190 requests per 10-second burst limit and 625,000 requests per day account-wide. Is this accurate as of June 2026? Are there any per-endpoint sub-limits I should know about (e.g., search endpoints, sequence endpoints, property endpoints with their own caps)?

### Answer (Breeze via Q1, 2026-06-11)
- **CONFIRMED:** 190 req/10s burst + 625K/day per account
- **Per-endpoint sub-limit confirmed for Sequences:** 1,000 enrollments per portal inbox per day
- Other endpoints (search, properties) don't have separately documented daily caps — they share the 625K/day pool

---

## Other key constraints (operator-provided 2026-06-11 prior to v5)

These came from prior Breeze research the operator had done — captured for context.

### Sequence enrollment behavior
1. **Dynamic lists do NOT auto-enroll** contacts into sequences (passive monitoring tool only)
2. **A contact can be in only ONE sequence at a time** (HubSpot constraint)
3. **If sender exceeds their daily send limit, enrollment is silently skipped** (no error returned)
4. HubSpot explicitly warns against auto-enrolling cold leads or using broad/non-personalized criteria

### Pro-tier automation pathways
- Sequence's **Automation tab** (Pro-supported) — triggers based on property changes, form submissions, page views
- Workflow-based "Enroll in sequence" action — **Enterprise-only**
- For our use case (API-driven enrollment): use the documented enrollment endpoint with proper rate-limit awareness

---

## Decision impact summary (for spec v6)

| What changes | Source |
|---|---|
| Endpoint URL: `/automation/sequences/2026-03/enrollments` (not v3) | Q1 |
| Idempotency check: use `GET /automation/sequences/2026-03/enrollments/contact/{contactId}` | Q2 |
| Send-cap: 1,000/day per portal inbox is OUTER bound; per-sender silent-skip is the real hazard | Q1 + Q10 partial + prior research |
| Throttle pattern: 5-10 enrollments/second with 429 retry | Q1 |
| ANY-sequence check before enroll (not target-sequence-only) | Prior research |

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v1 | 2026-06-11 16:35 | Initial canonical research doc. Q1, Q2 answered. Q3-Q9, Q11-Q13 pending. Q10, Q14 partial/answered via Q1. Captures operator's prior research on sequence behavior + Pro-tier pathways. |
