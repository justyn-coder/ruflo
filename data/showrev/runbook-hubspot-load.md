---
title: HubSpot Load Runbook
status: ACTIVE
last_updated: 2026-06-02 17:09 EST
version: v2
---

# HubSpot Load Runbook

Step-by-step process for loading ShowRev contacts into HubSpot and setting up Sequences. Based on FC2026 booth contacts (45 loaded June 2, 2026). Use this for future loads (cold prospecting, next show).

---

## Pre-Flight Checklist

### 1. Data Quality (Mission Control)
- [ ] All SEND contacts have: email, assigned AE, signal strength, persona, composed email
- [ ] No NULL assigned_ae (loader will refuse — won't silently default)
- [ ] No personal emails unless explicitly approved (gmail/yahoo/hotmail flagged by System Brief)
- [ ] Subject lines capitalized
- [ ] No "permit-ready" in email bodies (wrong pitch)
- [ ] No "Worth a 20-minute conversation?" (generic CTA — use diagnostic questions)
- [ ] Contacts with status REJECT/DNC/HOLD are excluded from load
- [ ] Run `SELECT ... WHERE send_status = 'send' AND (assigned_ae IS NULL OR intel_signal_strength IS NULL)` to catch gaps

### 2. HubSpot Layout (one-time, or verify)
- [ ] Contact Record Customization: ShowRev Intelligence section at top, Email Tokens collapsed at bottom
- [ ] Company Record Customization: ShowRev Company Intel section with 9 fields
- [ ] Legacy pilot fields removed from sections (About/Bio, Areas of Expertise, City/State, LinkedIn URL, Prior Companies, Years at Company, Seniority)

### 3. HubSpot Properties
```bash
cd src/showrev/m1-email-find
export $(grep -v '^#' .env | xargs)
npx tsx hubspot-loader.ts create-properties
```
Expected: "Created: N, Skipped: N (already exist), Errors: 0"
Note: `date` type fields need `fieldType: 'date'` not `'textarea'` — the loader handles this but if adding new date fields, check.

### 4. Verify No Automation Risk
- [ ] Check active workflows in HubSpot that could auto-enroll new contacts
- [ ] Ask Breeze: "What active workflows could enroll new contacts?"
- [ ] Specifically check any workflow with "contact creation" or "list upload" triggers
- [ ] Our contacts have `hs_marketable_status: false` (set by HubSpot for API-created contacts) — marketing workflows should skip them
- [ ] Spot-check 5 new contacts for workflow enrollment after load

---

## Pre-Load Verification (MANDATORY)

### 5. Run Verify
```bash
export $(grep -v '^#' .env | xargs)
npx tsx hubspot-loader.ts verify
```

Runs 10 automated checks against Supabase + HubSpot data. Blocks on any FAIL.

| # | Check | Type | Catches |
|---|-------|------|---------|
| 1 | PS_URL_EXISTS | FAIL | Broken microsite links in email P.S. |
| 2 | MICROSITE_AE_MATCH | FAIL | Wrong person's face/name on microsite |
| 3 | MICROSITE_PHOTO_SET | FAIL | NULL ae_photo_url → default/wrong headshot |
| 4 | MICROSITE_STATUS_LIVE | FAIL | status != 'live' → 404 page |
| 5 | MICROSITE_LOGO_CHECK | WARN | NULL or CMS favicon as company logo |
| 6 | HUBSPOT_DUPLICATE_CHECK | WARN | Name match without email (potential duplicate) |
| 7 | CONTACT_OWNER_ALIGNMENT | FAIL | HubSpot owner != expected AE |
| 8 | NULL_AE_CHECK | FAIL | Missing or invalid AE assignment |
| 9 | EMAIL_CONTENT_CHECKS | FAIL | Uncapitalized subject, forbidden phrases, personal email |
| 10 | FIELD_COMPLETENESS | FAIL | Missing required fields (email, AE, signal, persona, email content) |

FAIL = blocks load. WARN = review but doesn't block.

Checks 6-7 hit HubSpot API (~200ms/contact). At 900 contacts, expect ~6 min runtime.

### 6. Dry Run
```bash
npx tsx hubspot-loader.ts dry-run
```
Review output for:
- Correct AE assignments (no null → Lucas defaults)
- Correct signal mapping (Strong→GREEN, Good→YELLOW, Possible→ORANGE, Weak→RED)
- Existing contacts found (UPDATE showrev_* only, not CREATE)
- Company domain matching (existing companies found and updated, not duplicated)
- Gmail contacts creating companies without domain (expected, harmless)

### 7. Load
```bash
npx tsx hubspot-loader.ts load
```
- **Automatically runs verify first** — blocks on any FAIL check
- To bypass (emergency only): `npx tsx hubspot-loader.ts load --skip-verify`
- Processes one contact at a time with 500ms delay
- Stops on first error
- Logs every action: company create/update, contact create/update, association
- Existing contacts: ONLY writes `showrev_*` properties (line in code: `Object.entries(contactProps).filter(([k]) => k.startsWith('showrev_'))`)
- New contacts: writes all properties including name, title, lifecycle stage, owner

### 8. Post-Load Verification
- [ ] Spot-check 3 random contacts in HubSpot — properties populated correctly?
- [ ] Check an existing contact (e.g., Kathryn Eisele) — standard fields NOT overwritten?
- [ ] Check company records — ShowRev Company Intel populated?
- [ ] Verify `showrev_outreach_cohort` is set (e.g., "fc2026-booth")
- [ ] Verify `showrev_assigned_ae` is set on all contacts
- [ ] Run Breeze check: "Are any of these contacts enrolled in a workflow?" with 5 sample emails
- [ ] Run `npx tsx hubspot-loader.ts verify` again — check 7 (CONTACT_OWNER_ALIGNMENT) catches owner drift

---

## Sequence Setup

### 9. Create Sequences (one per AE)
- Template: Subject token + 4 paragraph tokens + PS
- Settings: business days only, send window 10-11 AM
- Unenroll: on reply + on meeting booked
- Sharing: Everyone
- One sequence per AE for clean tracking

### 10. Create Active Lists (one per AE)

Go to Contacts → Lists → Create list → Contact-based → Active list

Filter for each AE:
- `showrev_assigned_ae` is equal to `[AE Name]`
- AND `showrev_engagement_slug` is equal to `[engagement slug]`

Names: "FC2026 — Mike Rutski Sends", "FC2026 — Nathan Dunn Sends", "FC2026 — Lucas Spencer Sends"

### 11. AE Enrollment
- Each AE opens their Sequence → Enroll contacts → Select from their list
- HubSpot sends as the enrolling user (AE must have connected email)
- Tokens snapshot at enrollment time — properties must be populated BEFORE enrollment
- Verify: AE sends test to themselves first if nervous

---

## Private App Permissions Required

When setting up the HubSpot Private App, include these scopes:
- `crm.objects.contacts.read` + `crm.objects.contacts.write`
- `crm.objects.companies.read` + `crm.objects.companies.write`
- `crm.schemas.contacts.read` (properties)
- `crm.schemas.companies.read` (properties)
- `contacts-lists-create-simple` + `contacts-lists-create-advanced` ← **MISSED in FC2026 — had to create lists manually in UI**

---

## Gotchas Learned (FC2026)

1. **Loader used to silently default NULL AEs to Lucas** — fixed, now refuses to load without explicit assignment
2. **`showrev_first_outreach_date` needs `fieldType: 'date'`** — generic `'textarea'` fails for date properties
3. **Portal shows AE from a display default, not the database** — if portal shows "Lucas S" but DB has null, that's a display fallback, not a real assignment
4. **Existing contacts get HS routing rules applied** — `hubspot_owner_id` may get overridden by territory rules. Use `showrev_assigned_ae` (custom field, never overridden) for list filtering
5. **Marketing workflow risk** — API-created contacts get `hs_marketable_status: false` by default, but always verify active workflows before loading
6. **Christine Kohut test record** — delete after go-live, don't leave test data in production
7. **Contacts composed manually (not through engine)** — will have NULL signal_strength and persona_bucket. Backfill before loading.
8. **Subject lines** — engine sometimes outputs lowercase. Run `UPDATE sr_engine_output SET email_subject_t1 = UPPER(LEFT(email_subject_t1, 1)) || SUBSTRING(email_subject_t1 FROM 2)` before load

---

## Key Fields Reference

### Contact Properties We Write

| Property | Source | Always Write? |
|---|---|---|
| showrev_signal_strength | engine | Yes (enum: GREEN/YELLOW/ORANGE/RED) |
| showrev_next_action | engine | Yes |
| showrev_challenger_insight | engine | Yes |
| showrev_decision_authority | engine | Yes (enum) |
| showrev_buying_timeline | engine | Yes |
| showrev_ae_talking_points | engine | Yes |
| showrev_likely_objections | engine | Yes |
| showrev_risk_factors | engine | Yes |
| showrev_research_summary | engine | Yes |
| showrev_persona_classification | engine | Yes (enum: core_icp/exec_tier/wrong_persona) |
| showrev_linkedin_summary | engine | If available |
| showrev_other_stakeholders | engine | If available |
| showrev_microsite_url | computed | Yes |
| showrev_engagement_slug | hardcoded | Yes ("inorsa-fiberconnect-2026") |
| showrev_assigned_ae | prospect | Yes |
| showrev_outreach_cohort | hardcoded | Yes ("fc2026-booth" or "fc2026-cold") |
| showrev_first_outreach_date | computed | Yes (date of load) |
| showrev_pilot_owner | hardcoded | Yes ("true") |
| showrev_pre_show_t1_subject | engine | Yes (Sequence token) |
| showrev_pre_show_t1_para1-4 | engine | Yes (Sequence tokens) |
| showrev_pre_show_t1_ps | engine | Yes (Sequence token) |

### Company Properties We Write

| Property | Source |
|---|---|
| showrev_company_summary | engine |
| showrev_company_size | engine |
| showrev_fiber_activities | engine |
| showrev_bead_status | engine |
| showrev_growth_signals | engine |
| showrev_competitive_landscape | engine |
| showrev_key_projects | engine |
| showrev_recent_news | engine |
| showrev_external_deadlines | engine |

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v2 | 2026-06-02 17:09 | Claude | Added 10-check verify command (step 5), load gates on verify, renumbered steps |
| v1 | 2026-06-02 13:30 | Claude | Initial runbook from FC2026 booth load (45 contacts) |
