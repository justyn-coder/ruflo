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

## Q3 — Sequence pause/edit detection — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, is there a way via the API to programmatically detect if a HubSpot sequence has been edited or paused since my last successful enrollment? Specifically, is there a lastModifiedDate or isActive field I can check on the sequence object before enrolling new contacts? I want to halt enrollment automatically if the sequence is being edited.

### Answer (Breeze, 2026-06-11)
- **YES (partial):** sequence object exposes `updatedAt` timestamp — can detect that the sequence was modified since last successful run
- **NO documented `isActive` / `paused` / `editing-in-progress` field** — only `updatedAt`
- Documented sequence fields: `id, name, createdAt, updatedAt, userId, steps, settings`, plus step-level + settings-level `updatedAt` values
- Will catch SAVED edits, but cannot tell if someone has the sequence open and unsaved (no editing-lock field)

### Recommended pattern
```
store lastKnownSequenceUpdatedAt after each approved enrollment run

before enrolling next batch:
  GET sequence object
  IF sequence.updatedAt != lastKnownSequenceUpdatedAt:
    HALT, require operator re-approval
  (optionally inspect returned steps[].updatedAt and settings.updatedAt for finer-grained audit)
```

### Endpoint correction (consistent with Q1)
- Current docs: `POST /automation/sequences/2026-03/enrollments`
- Older docs reference `/automation/v4/sequences/enrollments/`
- The `/automation/v3/sequences/{id}/enrollments` form I had originally written is OUTDATED

### Impact on spec
- Component 3 Step 4 (sequence-edit check) now has a documented implementation pattern
- Replace "lastModifiedDate within last 5 min" approach with stored-vs-current `updatedAt` comparison

---

## Q4 — Engagement event real-time vs batched — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, when a contact is enrolled in a sequence and the first email sends, how quickly do engagement events appear on the contact record's properties? Specifically: notes_last_contacted, hs_email_last_open_date, hs_email_last_click_date, hs_email_last_reply_date. Are these real-time, or batched at some interval? I'm building a watcher that polls these properties and want to set the right poll interval.

### Answer (Breeze, 2026-06-11)
- **HubSpot does NOT document** batching interval or SLA for these properties
- Properties are **event-driven but NOT guaranteed real-time** — treat as eventually consistent
- Documented behavior:
  - `hs_email_last_open_date` / `hs_email_last_click_date` / `hs_email_last_reply_date` — standard contact properties for email interactions
  - Sequence emails use HubSpot's one-to-one email tracking/logging model
  - If tracking is ineligible (privacy/legal-basis rules), related properties will NOT update
  - `notes_last_contacted` exists but refresh cadence is undocumented

### Recommended polling pattern (Breeze)
- **Normal interval:** 60-120 seconds
- **After fresh sequence send:** poll every 30-60 seconds for 10-15 min
- **Then back off to 5 min**
- Avoid sub-30-second polling (undocumented SLA — could over-poll on assumptions)

### Property-by-property guidance
- `notes_last_contacted` — coarse activity signal, NOT precise send-confirmation timestamp
- `hs_email_last_open_date` / `hs_email_last_click_date` / `hs_email_last_reply_date` — better for watcher logic, but eventually consistent
- For send confirmation specifically, prefer the email activity / enrollment record over `notes_last_contacted`

### Best design choice (priority order)
1. Sequence/email activity event (if available)
2. Contact engagement properties as fallback
3. Polling at 1-2 minute cadence (not sub-30-second)

### Impact on spec
- Component 5 (watcher) needs adaptive polling logic: tighter polling for 10-15 min after sends, normal cadence otherwise
- Watcher's current SEQUENCE_SEND_DATE constant needs to be replaced with dynamic per-prospect logic (already in v5 spec — confirmed correct approach)
- Cannot promise sub-minute engagement detection

---

## Q5 — Bounce event propagation — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, when a sequence email hard-bounces, does HubSpot automatically update the contact's hs_email_hard_bounce_reason and pause the sequence for that contact? How quickly does this happen? Or do I need to monitor and respond myself? What's the recommended way to halt an entire sequence batch if hard-bounce rate exceeds 5%?

### Answer (Breeze, 2026-06-11)

**YES — HubSpot updates the bounce information when it can identify the bounce.**

- `hs_email_hard_bounce_reason` is populated when HubSpot can classify the bounce
- For one-to-one and sequence emails, bounce details appear on email engagement on contact timeline
- Some sequence bounces may not have enough data for HubSpot to fully classify root cause

**NO — sequence is NOT automatically paused for that contact (not documented).**

- Hard-bounced contacts ARE excluded from future emails (sender reputation protection)
- "Unknown user" and "Mailbox full" → HubSpot AUTO-drops contact from future emails
- Other reasons (Content / Spam / Policy) → not auto-dropped, need our review

**NO documented timing SLA** — treat bounce propagation as eventually consistent, not instant.

### HubSpot's auto-unenrollment triggers
- ✅ Replies → auto-unenroll
- ✅ Meeting bookings → auto-unenroll
- ❌ Bounces → NO auto-batch-halt — we build this ourselves

### Manual pause options (UI)
- Single sequence: Sequences > Actions > Pause
- All sequences: Sequences > Actions > Pause all
- Individual contact: Contact record > sequence enrollment > unenroll

### Recommended watcher pattern (Breeze)
For our staggered 8-10 companies/day cold-outbound motion:

1. Use **rolling denominator** (last 20-40 sends) instead of huge batches
2. **Stop NEW enrollments first** when threshold crossed
3. **Pause sequence** if rate stays above 5%
4. Treat "Unknown user" / "Mailbox full" as especially strong stop signals
5. For Content / Spam / Policy bounces → review auth/content before resuming

### Impact on spec
- Component 4 (bounce monitor) threshold logic confirmed: 5% hard bounce halt
- Use rolling window (20-40 sends) — more responsive than batch-level
- Component 6 (send-cap) gains a "halt new enrollments while existing batch active" mode
- Watcher Component 5 should classify `hs_email_hard_bounce_reason` and treat Unknown user / Mailbox full as immediate-halt signals
- Cannot rely on HubSpot to auto-pause the batch — our watcher is the gate


---

## Q6 — Custom property visibility for AEs — PENDING

### Prompt verbatim
> On Sales Hub Professional, when I create custom contact properties via the API (e.g., showrev_research_summary, showrev_talking_points, showrev_signal_strength), are they automatically visible to AEs in the HubSpot UI on the contact record? Or do I need to manually add them to the AE's contact-view configuration? Trying to ensure the AE sees the research context when they open the contact.

---

## Q7 — Contact-to-company auto-association — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, when I POST a new contact via /crm/v3/objects/contacts with a "company" property value that matches an existing company name in the portal, does HubSpot automatically associate the contact to that company? Or do I need to explicitly POST an association via /crm/v4/objects/contacts/{cid}/associations/companies/{cid}? Trying to avoid creating orphan contacts.

### Answer (Breeze, 2026-06-11)

**NO — `"company": "Acme"` does NOT create an association.** Contact properties and record associations are documented as separate concepts.

### What auto-association IS

HubSpot's documented auto-association is:
- **Domain-based** (contact's email domain ↔ company's "Company domain name" property)
- Or for freemail contacts: Website URL ↔ company domain
- **Gated by portal setting** "Create and associate companies with contacts" — must be enabled
- May pick wrong company if multiple share the same domain value (manual fix needed)

### What auto-association is NOT
- It is NOT company-name-based
- Setting `"company": "Acme"` in the contact properties just stores the string — no association created

### Documented patterns (do one of these explicitly)

**Best:** create contact with `associations` array in the SAME POST request:
```json
POST /crm/v3/objects/contacts
{
  "properties": { "email": "...", "firstname": "...", ... },
  "associations": [{
    "to": { "id": "<company_id>" },
    "types": [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 1 }]
  }]
}
```

**Alternative:** create contact, then PUT to Associations API:
```
PUT /crm/v4/objects/contacts/{cid}/associations/companies/{cid}
```

### Impact on spec
- Our current loader at hubspot-loader.ts:397-401 DOES call the v4 associations endpoint after create — CORRECT but inefficient (2 API calls per contact)
- **Optimization for spec v6:** use the single-request pattern with `associations` array in the create POST → cuts loader API calls by ~30%
- For our cohort: 150 contacts × 1 fewer call = 150 fewer API calls = stays within Pro's 625K/day comfortably
- Auto-association by domain setting is portal-controlled — operator action: confirm if it's on/off

### Operator action item
Check HS portal setting: **Settings > Objects > Companies > Auto-create and associate companies with contacts** — is it ON?
- If ON: we MIGHT get some auto-associations even if we don't pass them. Risky for wrong-company matches.
- If OFF: we MUST pass associations explicitly (which we already do — good)
- Recommend: keep OFF + use explicit associations from our loader = no ambiguity


---

## Q8 — Sequence enrollment vs immediate send — ANSWERED 2026-06-11

### Prompt verbatim
> On Sales Hub Professional, if I enroll 100 contacts in a sequence via API on a Monday morning, does HubSpot honor the sequence's day-of-week and time-of-day send schedule, or does it fire all the first-step emails immediately? I want to enroll in batches but trust HubSpot to throttle the actual sends per the sequence settings.

### Answer (Breeze, 2026-06-11)

**Do NOT count on HubSpot to throttle. First-step emails fire ASAP after enrollment.**

- **First step:** sends immediately / ASAP upon enrollment — NOT held to sequence's day-of-week / time-of-day rules
- **Subsequent steps (2, 3, ...):** DO follow configured delays + contact's time zone
- HubSpot docs explicitly say "the first email in the sequence will send as soon as possible by default"

### Partial throttle (UI-only, NOT API)

- HubSpot UI bulk-enroll has a documented limit of **3 emails per minute**
- This is NOT a guaranteed throttle contract for the API
- We cannot assume the API enforces this

### Recommended pattern (Breeze)

For our personalized cold-outbound motion:

1. Enroll contacts in smaller batches (8-10/day per AE)
2. Pace enrollments throughout the day (not all at 9 AM)
3. Assume each contact's first email goes out right after enrollment
4. Use randomized spacing between enrollments for human-like pacing

### Impact on spec

- **Component 6 (send-cap enforcer) must do the pacing — NOT trust sequence settings to throttle**
- Implementation pattern: `pace_enrollments_with_random_jitter(8_to_10_per_day_per_ae, business_hours_only)`
- Each enrollment = each first-send (immediate). Controlling enrollment time = controlling send time.
- Component 3 needs an `enrollment_window` parameter to limit when enrollments fire
- BUT: subsequent sequence steps DO honor schedule — so step 2, 3 etc will land in the configured time windows


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

## Q11 — Bounce property update lag — DROPPED (covered by Q4 + Q5)

Q4 established engagement properties are eventually consistent. Q5 established bounce events follow same model. No additional info needed.

---

## Q12 (refined) — Custom property types on Sales Pro — PENDING

### Prompt verbatim (refined)
> On Sales Hub Professional, when creating custom contact properties via /crm/v3/properties/contacts API, are the following types available: textarea (multi-line text), richtext (formatted text)? Or are some property types restricted to Enterprise? I need rich/long-text fields for showrev_research_summary and showrev_talking_points.

---

## Q13 — Workflow API access on Sales Pro — PENDING

### Prompt verbatim
> On Sales Hub Professional + Marketing Hub, what level of access do I have to the Workflows API via a private app? Can I programmatically: (a) create workflows, (b) read workflow state/enrollments, (c) trigger workflows via contact property changes? I'm considering using a workflow as a fallback for sequence enrollment — if a contact has showrev_ready_for_sequence=true, a workflow could enroll them in the right sequence. Is this pattern supported on Pro tier, or is the "Enroll in sequence" workflow action Enterprise-only?

---

## Q14 — Daily API limit confirmation — DROPPED (covered by Q1)

Q1 confirmed: 190 req/10s burst + 625K/day per account. Sequences-specific: 1,000 enrollments/day per portal inbox. No additional info needed.

---

## Q15 (new) — 429 retry pattern — PENDING

### Prompt verbatim
> On Sales Hub Professional, when my private app hits a 429 Too Many Requests on the Sequences enrollment endpoint, what's the recommended retry pattern? The docs mention response headers expose the active window and remaining quota — what specific headers should I read (X-HubSpot-RateLimit-Remaining? X-HubSpot-RateLimit-Reset?), and is exponential backoff or wait-until-window-reset the safer pattern? Should retry behavior differ based on whether I hit the 10-second burst limit vs the daily limit?

---

## Q16 (new) — Sender disconnect handling mid-batch — PENDING

### Prompt verbatim
> On Sales Hub Professional, if I'm enrolling contacts in a sequence via API and one of my AE senders' connected inbox gets disconnected mid-batch (token revoked, password change, OAuth lapse), what happens? Does the enrollment API return an error indicating the sender is disconnected, does enrollment succeed but the email silently fails to send, or does the contact get enrolled but stuck waiting? What's the correct way to detect and handle this failure mode programmatically?

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
| v2 | 2026-06-11 16:45 | Q3 answered (sequence edit detection via updatedAt comparison) + Q4 answered (engagement event lag — eventually consistent, recommended polling 60-120s normal / 30-60s for 10-15 min after send / then 5 min). |
| v3 | 2026-06-11 16:55 | Q5 answered (bounce events: detectable but no auto-batch-pause — we build watcher with rolling 20-40 send denominator + 5% threshold) + Q6 answered (custom properties NOT auto-visible in AE sidebar — operator action: configure Record Customization) + Q7 answered (`"company"` property does NOT auto-associate — must use explicit `associations` array in single-request pattern OR enable portal-level domain-based setting). |
| v4 | 2026-06-11 17:05 | Q8 answered (first-step emails fire ASAP upon enrollment — NOT held to sequence day/time schedule; subsequent steps DO follow schedule; we must pace enrollments ourselves). Plus Q11, Q14 marked DROPPED (covered by Q5 + Q1). Q10 and Q12 marked REFINED (focused on unanswered specifics). Q15 + Q16 added (429 retry pattern + sender disconnect handling). |
