---
title: HubSpot Loader Specification — ShowRev FC2026 Pilot
status: DRAFT
last_updated: 2026-05-29 01:30 EST
version: v1
purpose: Spec for loading ShowRev pipeline output into Inorsa's HubSpot. Zero-error requirement. READ-ONLY until operator authorizes each write operation.
---

# HubSpot Loader Specification

## Guiding principle

The client's HubSpot is a production system with active deals, sequences, and automations. Every write operation must be reversible, auditable, and approved. A single bad write (wrong field, duplicate contact, broken association) can damage trust permanently.

## Architecture

```
Supabase (sr_ tables)          HubSpot (Inorsa account 20729069)
─────────────────              ────────────────────────────────
sr_prospects          ────→    Contacts (create or match)
sr_dossiers           ────→    Contact custom properties (sr_ prefix)
sr_emails             ────→    Sequence enrollment (T1/T2/T3)
sr_microsites         ────→    Contact custom property (sr_microsite_url)
sr_outcomes           ←────    HubSpot engagement events (webhooks)
```

## Phase 1: Contact Creation / Matching

### The matching problem

Before creating ANY contact, we must check if they already exist in HubSpot. Chris explicitly said: "do not contact anyone who's already in your HubSpot." This means:

1. Search HubSpot by email address (exact match)
2. If found: DO NOT create. Flag for operator review. The contact is already in their system.
3. If not found: create as new contact with ShowRev properties.

### Pre-flight check (run BEFORE any writes)

```
For each prospect in sr_prospects where icp_status = 'pass' or 'hold':
  1. Search HubSpot: GET /contacts/v1/contact/email/{email}
  2. If exists:
     - Log to sr_decision_trace: "BLOCKED: contact already exists in HubSpot, ID: {id}"
     - Set prospect.hubspot_status = 'exists_blocked'
     - DO NOT proceed
  3. If not found:
     - Set prospect.hubspot_status = 'ready_to_create'
     - Proceed to creation queue
```

### Contact creation payload

```json
{
  "properties": {
    "email": "len.dewees@btgrp.com",
    "firstname": "Len",
    "lastname": "DeWees",
    "jobtitle": "Program Director - Fiber",
    "phone": "267-567-5624",
    "city": "Tulsa",
    "state": "OK",
    "company": "B+T GRP",
    
    "hs_lead_status": "NEW",
    "lifecyclestage": "lead",
    "hubspot_owner_id": 89105203,
    
    "lead_source": "Tradeshow",
    "lead_event": "Fiber Connect 2026",
    "showrev_source": "showrev-fc2026",
    "showrev_tier": "A",
    "showrev_abm_strategy": "1:few",
    
    "sr_role_summary": "Owns fiber engineering output. 50-state licensing...",
    "sr_decision_authority": "Unknown",
    "sr_likely_objections": "May compare to existing tools...",
    "sr_talking_points": "Reference Maryland ISP project. Ask about...",
    "sr_booth_notes": "05/18/2026 1:15 PM: he leads up their...",
    "sr_persona_bucket": "design_document",
    "sr_fit_score": "Strong",
    "sr_fit_rationale": "Multi-state fiber contractor, high permit volume...",
    "sr_challenger_insight": "50-state licensing means 50 jurisdictional...",
    "sr_next_best_action": "Book demo - prospect asked at booth",
    "sr_microsite_url": "https://fiber.inorsa.com/b-t-grp"
  }
}
```

### Custom properties that need to exist in HubSpot first

Before loading ANY data, these custom properties must be created in HubSpot. This is a one-time setup.

**Contact properties (sr_ prefix, property group: showrev_intel):**

| Property | Type | Description |
|----------|------|-------------|
| sr_role_summary | single-line text | ShowRev: Role Summary |
| sr_decision_authority | dropdown (Budget owner / Influencer / Champion / Unknown) | ShowRev: Decision Authority |
| sr_likely_objections | multi-line text | ShowRev: Likely Objections |
| sr_talking_points | multi-line text | ShowRev: AE Talking Points |
| sr_booth_notes | multi-line text | ShowRev: Booth Notes |
| sr_persona_bucket | dropdown (build / design_document / fund_capitalize) | ShowRev: Persona Bucket |
| sr_fit_score | dropdown (Strong / Good / Possible / Weak / No fit) | ShowRev: Fit Score |
| sr_fit_rationale | multi-line text | ShowRev: Fit Rationale |
| sr_challenger_insight | multi-line text | ShowRev: Challenger Insight |
| sr_next_best_action | single-line text | ShowRev: Next Best Action |
| sr_microsite_url | single-line text | ShowRev: Microsite URL |
| sr_influence_pattern | single-line text | ShowRev: Influence Pattern Used |
| sr_research_confidence | dropdown (high / medium / low) | ShowRev: Research Confidence |

**Existing HubSpot properties we'll use (already in their system):**

| Property | Our mapping |
|----------|-------------|
| lead_source | "Tradeshow" |
| lead_event | "Fiber Connect 2026" |
| hubspot_owner_id | Mike: 89105202, Nathan: 89105203, Lucas: 163468117 |
| lifecyclestage | "lead" (becomes "marketingqualifiedlead" when meeting booked) |
| hs_lead_status | "NEW" |

**ABM property (Chris approved):**

| Property | Value |
|----------|-------|
| showrev_abm_strategy | "1:few" (per Chris's correction from our HubSpot review) |

## Phase 2: Company Creation / Association

### Company matching

Same discipline as contacts:
1. Search HubSpot by company domain
2. If found: associate contact with existing company
3. If not found: create company, then associate

### Company properties

```json
{
  "properties": {
    "name": "B+T GRP",
    "domain": "btgrp.com",
    "city": "Tulsa",
    "state": "OK",
    "industry": "Telecommunications",
    
    "sr_company_summary": "~200 employees, Gladstone-backed...",
    "sr_company_size": "~200 employees, ~$30M revenue",
    "sr_fiber_activities": "Fiber construction and design, 50-state licensing...",
    "sr_bead_status": "Oklahoma BEAD allocation $797M...",
    "sr_growth_signals": "200-mile MD ISP project...",
    "sr_key_projects": "Maryland ISP 200-mile fiber project...",
    "sr_external_deadlines": "BEAD construction expected Q4 2026..."
  }
}
```

## Phase 3: Sequence Enrollment

### Sequence structure in HubSpot

Chris confirmed: sequences handle the send timing and tracking. We need to:

1. Create a sequence template with 3 steps (T1, T2, T3) and the correct delays
2. Enroll each contact into the sequence assigned to their AE
3. The email BODY for each step comes from our sr_emails table — each contact gets a unique body

### Sequence enrollment constraints (from Chris's throttling concerns)

- Domain warming is a concern. Inorsa doesn't normally do cold prospecting.
- Chris said HubSpot throttling was "more severe than expected"
- Recommended: send no more than 20-30 emails per day initially
- Batch by AE territory: Mike's contacts one day, Nathan's the next, Lucas's the third
- Monitor bounce rate after each batch. If bounce > 5%, HALT.

### Enrollment payload

```
POST /automation/v4/sequences/{sequenceId}/enrollments
{
  "contactId": "{hubspot_contact_id}",
  "enrollmentConfig": {
    "senderId": {ae_owner_id},
    "steps": [
      {
        "stepId": "{step1_id}",
        "body": "{T1 email body from sr_emails}",
        "subject": "{T1 subject from sr_emails}"
      },
      {
        "stepId": "{step2_id}",
        "body": "{T2 email body}",
        "subject": "{T2 subject}",
        "delay": "5 business days"
      },
      {
        "stepId": "{step3_id}",
        "body": "{T3 email body}",
        "subject": "{T3 subject}",
        "delay": "5 business days"
      }
    ]
  }
}
```

## Phase 4: Outcome Tracking (HubSpot → Supabase)

Once emails are sent, HubSpot tracks:
- Opens (unreliable due to Apple Mail pixel preloading)
- Clicks (reliable — tracks microsite link clicks)
- Replies (reliable — the metric that matters)
- Bounces (critical — domain reputation)
- Unsubscribes (critical — compliance)

We need to sync these back to `sr_outcomes` in Supabase for the Brain's learning loop.

Options:
1. **HubSpot webhooks** → Vercel edge function → Supabase insert (real-time, complex)
2. **Polling via HubSpot API** → daily batch sync (simpler, good enough for pilot)
3. **Manual export** → CSV → Supabase import (simplest, operator effort)

Recommendation for pilot: **Option 2 (daily polling)**. Set up a scheduled job that queries HubSpot engagement API daily and syncs to sr_outcomes.

## Safety guardrails

### Pre-write checklist (every batch)

- [ ] All contacts email-verified via Findymail (no invalid addresses)
- [ ] All contacts checked against existing HubSpot contacts (no duplicates)
- [ ] All contacts checked against DNC list (wiki-459-mirror section 10)
- [ ] ABM strategy set to "1:few" (not "1:1" or "1:many")
- [ ] AE owner ID correct per territory mapping
- [ ] Custom properties created in HubSpot (one-time setup)
- [ ] Sequence template created with correct delays
- [ ] Throttle: max 20-30 emails per day initially
- [ ] Operator approval obtained for this specific batch

### Rollback plan

If something goes wrong:
1. All ShowRev-created contacts have `showrev_source = 'showrev-fc2026'` — filterable
2. All ShowRev-created companies have the same tag
3. Sequence enrollment can be paused/unenrolled per contact
4. Custom property values can be cleared without deleting the contact
5. `sr_decision_trace` in Supabase logs every write with timestamp and payload

### What we NEVER do

- Never modify existing contacts that were already in HubSpot
- Never enroll contacts into sequences that aren't ShowRev-created
- Never change lifecycle stage on existing contacts
- Never delete anything in HubSpot
- Never write without operator approval per batch

## Implementation order

1. **Create custom property group** "showrev_intel" in HubSpot (operator does this in HubSpot UI, or we do via API with approval)
2. **Create custom properties** (13 contact + 7 company) — API or UI
3. **Pre-flight contact match** — search all 23 PASS prospects against existing HubSpot
4. **Operator review** — present the match results: "X contacts are new, Y already exist"
5. **Create new contacts** — batch, with full sr_ property population
6. **Create/match companies** — associate contacts
7. **Create sequence templates** — 3 steps, correct delays
8. **Enroll batch 1** — smallest batch first (5-10 contacts), monitor for 24h
9. **If clean: enroll remaining** — in daily batches of 20-30
10. **Set up daily outcome sync** — HubSpot → Supabase

## Open questions for operator

1. Should we create the custom properties via API (faster) or have Chris/HubSpot admin do it via UI (safer)?
2. Do the AEs need to approve the sequence template before first enrollment?
3. Is there a sandbox/test HubSpot account we can validate against first?
4. What's the maximum daily send volume Chris is comfortable with?
5. Should T2/T3 bodies be locked at enrollment time, or dynamically updated based on T1 engagement signals? (Dynamic requires a more complex sequence setup.)

## Version history

| Version | Date (EST) | Author | Change |
|---------|-----------|--------|--------|
| v1 | 2026-05-29 01:30 | Claude | Initial spec. Contact matching, property mapping, sequence enrollment, safety guardrails, rollback plan. |
