---
title: Supabase Field Mapping Audit
status: DRAFT
last_updated: 2026-06-07 01:15 EST
version: v1
---

# Supabase Field Mapping Audit

## Executive Summary

Three tables audited. Two critical findings:

1. **RLS blocks ALL writes with anon key.** All three tables have RLS enabled. Only SELECT policies exist (for anon reads). No INSERT/UPDATE policies. The anon key cannot write to any of them. The service role key bypasses RLS and is required for all writes. This was the root cause of 0/4 Supabase write failures on the v1 pipeline run.

2. **28 sr_engine_output columns go unfilled.** The intel-structurer (Phase 3c) produces 29+ structured fields, but `phaseSupabaseWrite` doesn't map them into the dossier row. All intel_*, company_*, meddpicc_*, and linkedin_* columns are left NULL.

## Table 1: sr_engine_output (Phase 9)

**Code writes 39 fields. Table has 67 columns.**

### Fields written (all exist in table) -- OK

prospect_id, run_id, first_name, last_name, email, company, title, state, icp_status, icp_reason, assigned_ae, ae_email, persona_bucket, research_summary, challenger_insight, influence_pattern_t1, influence_pattern_t2, influence_pattern_t3, email_subject_t1, email_body_t1, email_ps_t1, email_subject_t2, email_body_t2, email_ps_t2, email_subject_t3, email_body_t3, email_ps_t3, microsite_slug, microsite_headline, microsite_insight, research_model, research_confidence, mechanical_check_passed, mechanical_check_failures, domain_mismatch, email_confidence, confidence_score, confidence_color, created_at

### Fields NOT written (28 columns left NULL)

| Column | Data available? | Source |
|--------|----------------|--------|
| intel_signal_strength | YES | intel-structurer Phase 3c |
| intel_fit_rationale | YES | intel-structurer Phase 3c |
| intel_next_action | YES | intel-structurer Phase 3c |
| intel_buying_timeline | YES | intel-structurer Phase 3c |
| intel_risk_factors | YES | intel-structurer Phase 3c |
| intel_talking_points | YES | intel-structurer Phase 3c |
| intel_decision_authority | YES | intel-structurer Phase 3c |
| company_summary | YES | intel-structurer Phase 3c |
| company_size | YES | intel-structurer Phase 3c |
| fiber_activities | YES | intel-structurer Phase 3c |
| bead_status | YES | intel-structurer Phase 3c |
| growth_signals | YES | intel-structurer Phase 3c |
| key_projects | YES | intel-structurer Phase 3c |
| external_deadlines | YES | intel-structurer Phase 3c |
| known_tools | YES | intel-structurer Phase 3c |
| likely_competitors | YES | intel-structurer Phase 3c |
| market_moment | YES | intel-structurer Phase 3c |
| bellwether_inference | YES | intel-structurer Phase 3c |
| linkedin_summary | YES | intel-structurer Phase 3c |
| other_stakeholders | YES | intel-structurer Phase 3c |
| likely_objections | YES | intel-structurer Phase 3c |
| meddpicc_identified_pain | YES | intel-structurer Phase 3c |
| meddpicc_economic_buyer | YES | intel-structurer Phase 3c |
| meddpicc_decision_criteria | YES | intel-structurer Phase 3c |
| meddpicc_champion | YES | intel-structurer Phase 3c |
| meddpicc_competition | YES | intel-structurer Phase 3c |
| verified | NO | Not computed |
| verification_report | NO | Was from semantic verify (now disabled) |
| change_log | NO | Not computed |

**Impact:** Mission Control and AE review surfaces show empty intel fields for every prospect. The data exists in the pipeline's `result.structuredIntel` object but is never mapped to the Supabase write payload.

### Type mismatches -- None found

All written fields match their column types (text, boolean, integer, timestamptz).

## Table 2: sr_prospects (Phase 2b)

**Code writes 17 fields. Table has 42 columns.**

### Fields written -- OK (all exist)

id, first_name, last_name, email, company, title, state, tier, assigned_ae, icp_status, icp_reason, icp_type, send_status, ae_review_status, show_name, company_website, lead_type

### Fields NOT written (25 columns left to defaults)

| Column | Data available? | Source |
|--------|----------------|--------|
| email_verified | YES | MV verification result |
| email_verification_status | YES | MV quality (good/catch_all/bad) |
| email_provider | YES | Email finder detects provider (microsoft-365, google, etc.) |
| email_corrected | YES | Pipeline knows if CSV email was replaced |
| original_email | YES | Pipeline has CSV email vs found email |
| phone | NO | Not collected |
| city | NO | Not in CSV |
| grade | NO | Not computed for cold prospects |
| persona_bucket | YES | detectPersona() result available |
| ae_notes | NO | Cold prospects have no AE notes |
| has_ae_notes | YES | Always false for cold |
| contact_persona | YES | Same as persona_bucket |

**Impact:** Email verification data is available but not persisted. When reviewing prospects in Mission Control, the AE cannot see whether the email was verified, corrected, or what provider hosts it. This data is computed by the pipeline but discarded at the write step.

### Missing on_conflict

The sr_prospects POST uses `Prefer: resolution=merge-duplicates,return=minimal` but does NOT specify `?on_conflict=id` in the URL. Supabase REST API requires the `on_conflict` query parameter to know which column to use for upsert. Without it, duplicate prospect IDs will fail with a unique constraint violation instead of updating.

## Table 3: sr_microsites (Phase 8b)

**Code writes 16 fields. Table has 27 columns.**

### Fields written -- OK (all exist)

slug, prospect_id, company_name, company_logo_url, recipient_name, recipient_title, headline, insight_text, case_study_text, ae_name, ae_title, ae_email, ae_phone, ae_booking_url, ae_photo_url, status

### Fields NOT written (11 columns left to defaults)

| Column | Data available? | Notes |
|--------|----------------|-------|
| dossier_id | YES | Could link to sr_engine_output UUID |
| case_study_source | NO | Not tracked |
| ae_video_url | NO | Not used currently |
| calendly_url | NO | Using ae_booking_url instead |
| page_views | N/A | Runtime counter |
| last_viewed_at | N/A | Runtime counter |
| logo_includes_wordmark | NO | Not detected |
| booking_prefill_note | NO | Not composed |

**Impact:** Low. Most missing fields are optional or runtime-populated.

### Missing on_conflict

Same issue as sr_prospects. The sr_microsites POST uses `Prefer: resolution=merge-duplicates` but does NOT specify `?on_conflict=slug` in the URL. Re-runs for the same prospect will fail on unique constraint instead of updating.

## RLS Policy Analysis

| Table | RLS Enabled | SELECT Policy | INSERT Policy | UPDATE Policy |
|-------|-------------|---------------|---------------|---------------|
| sr_engine_output | YES | NONE | NONE | NONE |
| sr_prospects | YES | anon_read_prospects_via_microsite | NONE | NONE |
| sr_microsites | YES | anon_read_live_microsites | NONE | NONE |

**Conclusion:** The anon key can only SELECT from sr_microsites (status='live') and sr_prospects (linked to live microsites). It CANNOT insert, update, or select from sr_engine_output at all.

**The service role key is REQUIRED for all pipeline writes.** This was confirmed as the root cause of 0/4 Phase 9 failures. The service role key was missing from the ruflo .env and has now been added.

## Recommendations

### Critical (fix now)

1. **Add `?on_conflict=id` to sr_prospects POST** and `?on_conflict=slug` to sr_microsites POST. Without this, re-runs fail on unique constraint.
2. **Map intel-structurer output to sr_engine_output write.** The 28 empty columns have data available from `result.structuredIntel`. Wire the mapping.

### Important (fix soon)

3. **Write email verification data to sr_prospects.** Set `email_verified`, `email_verification_status`, `email_provider`, `email_corrected`, `original_email` from pipeline results.
4. **Write `persona_bucket` to sr_prospects.** The `detectPersona()` result is available but not written.
5. **Always log Supabase errors** regardless of verbose flag (already fixed for sr_engine_output; same fix needed for sr_prospects and sr_microsites).

### Low priority

6. Consider adding INSERT/UPDATE RLS policies so anon key can also write (reduces dependency on service role key). But service role key is simpler and already works.

## Version history

| Version | Date (EST) | Author | Change |
|---------|------------|--------|--------|
| v1 | 2026-06-07 01:15 | Claude | Initial audit — 3 tables, 67+42+27 columns checked |
