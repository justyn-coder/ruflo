-- RLS Hardening Migration — FC2026 Security (#4)
--
-- PRE-REQUISITE: SUPABASE_SERVICE_ROLE_KEY must be set in Vercel
-- and the app redeployed BEFORE running this migration.
-- Service role key bypasses RLS entirely — server code unaffected.
-- This migration ONLY restricts what the anon key can do.
--
-- ROLLBACK: Re-create the permissive policies (see bottom of file).

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Drop all 24 permissive ALL-true policies
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service_all" ON sr_brain_ae_interactions;
DROP POLICY IF EXISTS "service_all" ON sr_brain_bellwethers;
DROP POLICY IF EXISTS "service_all" ON sr_brain_citations;
DROP POLICY IF EXISTS "service_all" ON sr_brain_competitors;
DROP POLICY IF EXISTS "service_all" ON sr_brain_dossiers;
DROP POLICY IF EXISTS "service_all" ON sr_brain_market_signals;
DROP POLICY IF EXISTS "service_all" ON sr_brain_outcomes;
DROP POLICY IF EXISTS "service_all" ON sr_brain_outreach_patterns;
DROP POLICY IF EXISTS "service_full_access" ON sr_brain_patterns;
DROP POLICY IF EXISTS "service_all" ON sr_brain_verify_items;
DROP POLICY IF EXISTS "service_full_access" ON sr_decision_trace;
DROP POLICY IF EXISTS "service_full_access" ON sr_dossiers;
DROP POLICY IF EXISTS "service_full_access" ON sr_emails;
DROP POLICY IF EXISTS "service_full_access" ON sr_engine_output;
DROP POLICY IF EXISTS "service_full_access" ON sr_entity_resolution;
DROP POLICY IF EXISTS "service_full_access" ON sr_fact_checks;
DROP POLICY IF EXISTS "service_full_access" ON sr_microsite_events;
DROP POLICY IF EXISTS "service_full_access" ON sr_microsites;
DROP POLICY IF EXISTS "service_full_access" ON sr_outcomes;
DROP POLICY IF EXISTS "service_full_access" ON sr_pipeline_runs;
DROP POLICY IF EXISTS "service_full_access" ON sr_prospects;
DROP POLICY IF EXISTS "service_full_access" ON sr_review_actions;
DROP POLICY IF EXISTS "service_full_access" ON sr_review_notes;
DROP POLICY IF EXISTS "service_full_access" ON sr_review_timestamps;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Create 2 narrow policies for the anon role
-- ══════════════════════════════════════════════════════════════

-- Anon can read live microsites (prospect-facing pages)
CREATE POLICY "anon_read_live_microsites"
  ON sr_microsites FOR SELECT
  TO anon
  USING (status = 'live');

-- Anon can read prospect data joined through microsites (for page rendering)
CREATE POLICY "anon_read_prospects_via_microsite"
  ON sr_prospects FOR SELECT
  TO anon
  USING (
    id IN (SELECT prospect_id FROM sr_microsites WHERE status = 'live')
  );

-- Anon can insert page view events (microsite analytics)
CREATE POLICY "anon_insert_microsite_events"
  ON sr_microsite_events FOR INSERT
  TO anon
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- RESULT: After this migration
-- ══════════════════════════════════════════════════════════════
--
-- anon key can:
--   SELECT sr_microsites WHERE status='live'
--   SELECT sr_prospects WHERE linked to a live microsite
--   INSERT sr_microsite_events
--
-- anon key CANNOT:
--   Read sr_engine_output, sr_brain_*, sr_dossiers, sr_emails,
--   sr_outcomes, sr_review_*, sr_pipeline_runs, sr_fact_checks,
--   sr_entity_resolution, sr_decision_trace, or any other table
--   Write/update/delete any table except sr_microsite_events INSERT
--
-- service_role key: full access (bypasses RLS entirely)

-- ══════════════════════════════════════════════════════════════
-- ROLLBACK (emergency — re-creates permissive access)
-- ══════════════════════════════════════════════════════════════
--
-- DROP POLICY IF EXISTS "anon_read_live_microsites" ON sr_microsites;
-- DROP POLICY IF EXISTS "anon_read_prospects_via_microsite" ON sr_prospects;
-- DROP POLICY IF EXISTS "anon_insert_microsite_events" ON sr_microsite_events;
--
-- CREATE POLICY "service_full_access" ON sr_microsites FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "service_full_access" ON sr_microsite_events FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "service_full_access" ON sr_prospects FOR ALL TO public USING (true) WITH CHECK (true);
-- ... (repeat for all 24 tables)
