---
title: FC2026 HubSpot Load — Post-Mortem
status: ACTIVE
last_updated: 2026-06-02 15:00 EST
version: v1
---

# FC2026 HubSpot Load — Post-Mortem

45 contacts loaded June 2, 2026. Manual QA exposed 13 distinct data quality issues. Every one would have been visible to a prospect if not caught. At 900 contacts, this process is untenable.

---

## Issues Found and Fixed (13 total)

### Category 1: Broken Microsite URLs in Email P.S. (6 issues)

These would have sent prospects to 404 pages.

| # | Contact | Problem | Root Cause |
|---|---------|---------|------------|
| 1 | Matthew Mongell | PS linked to `/brief/lhtc-broadband` (doesn't exist) | Composer used company-slug format but microsite was created with person-slug `matthew-mongell-lhtc` |
| 2 | Leila Hussein | PS linked to `/brief/isg` (doesn't exist) | Same — composer guessed `isg`, actual slug was `leila-hussein-isg` |
| 3 | Lauren Lanoux | PS linked to `/brief/terracon` (Kathryn Eisele's microsite) | No microsite created for Lauren — only one per company, not per contact |
| 4 | Laura Lora | PS linked to `/brief/lcc-telecom-services-llc` (doesn't exist) | Microsite never created — manual composition bypassed microsite generation |
| 5 | Joel Swanson | PS linked to `/brief/globema` (doesn't exist) | Same as #4 — manual composition, no microsite |
| 6 | Steve Smith | PS linked to `/brief/fybercom` (Vince Calkins' microsite) | Intentional cross-reference but confusing — same company, different contact |

**Systemic cause:** The composer generates PS URLs by guessing the microsite slug. There is NO validation that the slug actually exists in `sr_microsites`. The URL is baked into the email and loaded into HubSpot before anyone checks.

### Category 2: Microsite AE / Photo Mismatches (4 issues)

These would have shown the wrong person's face and name on the prospect-facing page.

| # | Contact | Problem | Root Cause |
|---|---------|---------|------------|
| 7 | Nathan Dunn's 7 microsites | Showed Mike Rutski's headshot | `ae_photo_url` was NULL, template fell back to default photo (Mike's) |
| 8 | Nomad Telecom (Dastan) | Microsite AE said Nathan Dunn | Prospect reassigned from Nathan to Mike after microsite generation |
| 9 | NEMEPA (Nathan Robbins) | Microsite AE said Nathan Dunn | Same as #8 |
| 10 | LCC Telecom + Globema | WordPress/wrong favicon as company logo | Google Favicon API returns CMS favicon, not company logo |

**Systemic cause:** Microsites are generated once and never re-validated against current prospect assignments. AE reassignments don't cascade to microsites.

### Category 3: HubSpot Record Issues (3 issues)

| # | Contact | Problem | Root Cause |
|---|---------|---------|------------|
| 11 | Laura Lora + Lauren Lanoux | Duplicate HubSpot records (one from Nathan's import, one from our loader) | Pre-existing records from earlier import had no email — loader couldn't match, created new record |
| 12 | Dastan, Michelle, Lauren, Kimberly | Wrong Contact Owner (deactivated user, Automations Team, wrong AE) | Loader set `showrev_assigned_ae` but `hubspot_owner_id` was inherited from prior records or HubSpot auto-assignment |
| 13 | Microsite status | New microsites created with `status: 'active'` but app requires `status: 'live'` | Template code uses `'live'` as the filter value — not documented, easy to miss |

---

## What Should Have Caught These (and didn't)

| Check | Would have caught | Existed? |
|-------|-------------------|----------|
| PS URL → microsite slug validation | #1-6 | **No** |
| Microsite AE vs prospect AE alignment check | #8-9 | **No** |
| Microsite photo NULL check | #7 | **No** |
| Company logo quality check (favicon = WordPress?) | #10 | **No** |
| HubSpot duplicate detection (name match, not just email) | #11 | **No** |
| Contact Owner vs Assigned AE alignment | #12 | **No** |
| Microsite status value validation | #13 | **No** |

**Zero of these checks existed.** Every issue was caught by manual QA during the session.

---

## Required: Pre-Load Verification Script

A single script that runs BEFORE `hubspot-loader.ts load` and blocks if any check fails.

### Checks to implement:

```
1. PS_URL_EXISTS
   For every SEND contact: extract slug from email_ps_t1, verify slug exists in sr_microsites.
   FAIL = broken link in prospect email.

2. MICROSITE_AE_MATCH
   For every microsite: ae_name must match sr_prospects.assigned_ae.
   FAIL = wrong person's face on prospect page.

3. MICROSITE_PHOTO_SET
   For every microsite: ae_photo_url must not be NULL.
   FAIL = default/wrong headshot.

4. MICROSITE_STATUS_LIVE
   For every microsite linked to a SEND contact: status must be 'live'.
   FAIL = 404 page.

5. MICROSITE_LOGO_CHECK
   For every microsite: if company_logo_url is NULL, check if Google Favicon
   for prospect email domain returns a CMS favicon (WordPress, Squarespace, Wix).
   WARN = probably wrong logo.

6. HUBSPOT_DUPLICATE_CHECK
   Before loading: search HubSpot for firstname+lastname match.
   If found without email, WARN = potential duplicate.

7. CONTACT_OWNER_ALIGNMENT
   After loading: verify hubspot_owner_id matches the correct owner for showrev_assigned_ae.
   FAIL = AE can't see their contacts.

8. NULL_AE_CHECK (exists)
   Already implemented — loader refuses null assigned_ae.

9. EMAIL_CONTENT_CHECKS
   - Subject line capitalized
   - No "permit-ready" in body
   - No "Worth a 20-minute conversation?"
   - No personal email addresses (gmail/yahoo/hotmail)

10. FIELD_COMPLETENESS
    Every SEND contact must have: email, assigned_ae, signal_strength,
    persona_bucket, email_subject_t1, email_body_t1, email_ps_t1.
    FAIL = incomplete record going to HubSpot.
```

### How it runs:

```bash
# Pre-load verification (blocks on FAIL)
npx tsx hubspot-loader.ts verify

# Output:
# ✓ PS_URL_EXISTS: 45/45 pass
# ✓ MICROSITE_AE_MATCH: 48/48 pass
# ✗ MICROSITE_PHOTO_SET: 7 FAIL (Nathan Dunn microsites missing photo)
#   → nomad-telecommunications-llc, nemepa, lightbulb, ...
# ✗ MICROSITE_STATUS_LIVE: 3 FAIL (status='active', need 'live')
#   → lcc-telecom-services-llc, globema, lauren-lanoux-terracon
#
# BLOCKED: 2 checks failed. Fix before running 'load'.
```

The `load` command should refuse to run unless `verify` passes or `--skip-verify` is explicitly passed.

---

## Scale Estimate: 900 Contacts

At current manual QA rate (~2 min per issue found + fixed):
- 45 contacts → 13 issues → ~90 min of firefighting
- 900 contacts → estimated 50-100 issues → **3-6 hours of manual QA**
- Issues compound: a broken microsite slug pattern affects every contact using it

**The verification script is not optional. It's the difference between shipping and disaster.**

---

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | 2026-06-02 15:00 | Claude | Initial post-mortem from FC2026 booth load |
