import type { Prospect } from './importer.js';
import type { PatternSelection } from './influence.js';
import type { MechanicalCheckResult } from './judge.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

async function supabaseRest(
  table: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  body?: any,
  query?: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers: Record<string, string> = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `${res.status} ${errText}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

interface DossierRow {
  prospect_id: string;
  run_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  title: string;
  state: string;
  icp_status: string;
  icp_reason: string;
  assigned_ae: string;
  ae_email: string;
  persona_bucket: string;
  research_summary: string;
  challenger_insight: string;
  influence_pattern_t1: string;
  influence_pattern_t2: string;
  influence_pattern_t3: string;
  email_subject_t1: string;
  email_body_t1: string;
  email_ps_t1: string;
  email_subject_t2: string;
  email_body_t2: string;
  email_ps_t2: string;
  email_subject_t3: string;
  email_body_t3: string;
  email_ps_t3: string;
  microsite_slug: string;
  microsite_headline: string;
  microsite_insight: string;
  research_model: string;
  research_confidence: string;
  mechanical_check_passed: boolean;
  mechanical_check_failures: string;
  intel_signal_strength: string;
  intel_fit_rationale: string;
  intel_next_action: string;
  intel_buying_timeline: string;
  intel_risk_factors: string;
  intel_talking_points: string;
  intel_decision_authority: string;
  company_summary: string;
  company_size: string;
  fiber_activities: string;
  bead_status: string;
  growth_signals: string;
  key_projects: string;
  external_deadlines: string;
  known_tools: string;
  likely_competitors: string;
  market_moment: string;
  bellwether_inference: string;
  linkedin_summary: string;
  other_stakeholders: string;
  likely_objections: string;
  meddpicc_identified_pain: string;
  meddpicc_economic_buyer: string;
  meddpicc_decision_criteria: string;
  meddpicc_champion: string;
  meddpicc_competition: string;
  created_at: string;
}

interface EmailRow {
  touchNumber: number;
  pattern: PatternSelection;
  subject: string;
  previewText: string;
  body: string;
  ps: string;
  wordCount: number;
}

export interface SupabaseWritePayload {
  dossier: DossierRow;
  prospect: Prospect;
  emails: EmailRow[];
  mechanicalCheck: MechanicalCheckResult;
}

// --- Pre-write validation ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateBeforeWrite(payload: SupabaseWritePayload): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const d = payload.dossier;

  if (!d.prospect_id) errors.push('Missing prospect_id');
  if (!d.run_id) errors.push('Missing run_id');
  if (!d.email) errors.push('Missing email');
  if (!d.company) errors.push('Missing company');
  if (!d.first_name) errors.push('Missing first_name');

  if (!d.assigned_ae) errors.push('Missing assigned_ae');
  if (!d.ae_email) errors.push('Missing ae_email');

  if (d.email_body_t1 && d.email_body_t1.split(/\s+/).length > 95) {
    errors.push(`T1 body exceeds 88 words (${d.email_body_t1.split(/\s+/).length})`);
  }
  if (d.email_body_t2 && d.email_body_t2.split(/\s+/).length > 95) {
    errors.push(`T2 body exceeds 88 words (${d.email_body_t2.split(/\s+/).length})`);
  }

  if (d.email_subject_t1 && d.email_subject_t1.split(/\s+/).length > 8) {
    warnings.push(`T1 subject exceeds 8 words`);
  }

  if (!d.microsite_slug) warnings.push('Missing microsite_slug');
  if (!d.research_summary) warnings.push('Empty research_summary');

  if (d.influence_pattern_t1 === d.influence_pattern_t2) {
    warnings.push('T1 and T2 use same influence pattern');
  }

  if (!d.mechanical_check_passed) {
    warnings.push(`Mechanical checks failed: ${d.mechanical_check_failures}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Build the row from pipeline output ---

export function buildDossierRow(
  prospect: Prospect,
  runId: string,
  researchSummary: string,
  emails: EmailRow[],
  ae: { name: string; email: string },
  micrositeSlug: string,
  mechanicalCheck: MechanicalCheckResult,
  structuredDossier?: any,
  micrositeRow?: { headline: string; insight_text: string },
): DossierRow {
  const t1 = emails.find(e => e.touchNumber === 1);
  const t2 = emails.find(e => e.touchNumber === 2);
  const t3 = emails.find(e => e.touchNumber === 3);

  return {
    prospect_id: prospect.id,
    run_id: runId,
    first_name: prospect.firstName,
    last_name: prospect.lastName,
    email: prospect.email,
    company: prospect.company,
    title: prospect.title,
    state: prospect.state,
    icp_status: prospect.icpStatus,
    icp_reason: prospect.icpReason,
    assigned_ae: ae.name,
    ae_email: ae.email,
    persona_bucket: '',
    research_summary: researchSummary.slice(0, 5000),
    challenger_insight: t1?.pattern?.challengerInsight || '',
    influence_pattern_t1: t1?.pattern?.pattern || '',
    influence_pattern_t2: t2?.pattern?.pattern || '',
    influence_pattern_t3: t3?.pattern?.pattern || '',
    email_subject_t1: t1?.subject || '',
    email_body_t1: t1?.body || '',
    email_ps_t1: t1?.ps || '',
    email_subject_t2: t2?.subject || '',
    email_body_t2: t2?.body || '',
    email_ps_t2: t2?.ps || '',
    email_subject_t3: t3?.subject || '',
    email_body_t3: t3?.body || '',
    email_ps_t3: t3?.ps || '',
    microsite_slug: micrositeSlug,
    microsite_headline: micrositeRow?.headline || '',
    microsite_insight: micrositeRow?.insight_text || '',
    research_model: 'premium_3persona',
    research_confidence: structuredDossier?.meta?.showrev_research_confidence || '',
    mechanical_check_passed: mechanicalCheck.passed,
    mechanical_check_failures: mechanicalCheck.failures.join('; '),
    intel_signal_strength: structuredDossier?.salesIntel?.showrev_signal_strength || '',
    intel_fit_rationale: structuredDossier?.salesIntel?.showrev_fit_rationale || '',
    intel_next_action: structuredDossier?.salesIntel?.showrev_next_best_action || '',
    intel_buying_timeline: structuredDossier?.salesIntel?.showrev_buying_timeline || '',
    intel_risk_factors: structuredDossier?.salesIntel?.showrev_risk_factors || '',
    intel_talking_points: structuredDossier?.contact?.showrev_talking_points || '',
    intel_decision_authority: structuredDossier?.contact?.showrev_decision_authority || '',
    company_summary: structuredDossier?.company?.showrev_company_summary || '',
    company_size: structuredDossier?.company?.showrev_company_size || '',
    fiber_activities: structuredDossier?.company?.showrev_fiber_activities || '',
    bead_status: structuredDossier?.company?.showrev_bead_status || '',
    growth_signals: structuredDossier?.company?.showrev_growth_signals || '',
    key_projects: structuredDossier?.company?.showrev_key_projects || '',
    external_deadlines: structuredDossier?.company?.showrev_external_deadlines || '',
    known_tools: structuredDossier?.company?.showrev_competitive_landscape || '',
    likely_competitors: structuredDossier?.company?.showrev_competitive_landscape || '',
    market_moment: structuredDossier?.company?.showrev_recent_news || '',
    bellwether_inference: '',
    linkedin_summary: structuredDossier?.contact?.showrev_linkedin_summary || '',
    other_stakeholders: structuredDossier?.contact?.showrev_other_stakeholders || '',
    likely_objections: structuredDossier?.contact?.showrev_likely_objections || '',
    meddpicc_identified_pain: structuredDossier?.salesIntel?.showrev_fit_rationale || '',
    meddpicc_economic_buyer: structuredDossier?.salesIntel?.showrev_deal_size_estimate || '',
    meddpicc_decision_criteria: '',
    meddpicc_champion: structuredDossier?.contact?.showrev_decision_authority || '',
    meddpicc_competition: structuredDossier?.salesIntel?.showrev_risk_factors || '',
    created_at: new Date().toISOString(),
  };
}

// --- Dry-run mode ---

export function dryRunPreview(payload: SupabaseWritePayload): void {
  const d = payload.dossier;
  const validation = validateBeforeWrite(payload);

  console.log(`\n  [DRY RUN] Would write to sr_engine_output:`);
  console.log(`    prospect_id: ${d.prospect_id}`);
  console.log(`    run_id: ${d.run_id}`);
  console.log(`    ${d.first_name} ${d.last_name} @ ${d.company}`);
  console.log(`    ICP: ${d.icp_status} | AE: ${d.assigned_ae}`);
  console.log(`    T1: ${d.influence_pattern_t1} | "${d.email_subject_t1}"`);
  console.log(`    T2: ${d.influence_pattern_t2} | "${d.email_subject_t2}"`);
  console.log(`    T3: ${d.influence_pattern_t3} | "${d.email_subject_t3}"`);
  console.log(`    Mechanical: ${d.mechanical_check_passed ? 'PASS' : 'FAIL'}`);

  if (!validation.valid) {
    console.log(`    VALIDATION ERRORS:`);
    for (const err of validation.errors) console.log(`      ✗ ${err}`);
  }
  if (validation.warnings.length > 0) {
    console.log(`    WARNINGS:`);
    for (const w of validation.warnings) console.log(`      ⚠ ${w}`);
  }
}

// --- Write to Supabase via REST API ---

export async function writeDossierToSupabase(payload: SupabaseWritePayload): Promise<boolean> {
  const validation = validateBeforeWrite(payload);
  if (!validation.valid) {
    console.error(`  ✗ Pre-write validation failed:`);
    for (const err of validation.errors) console.error(`    ${err}`);
    return false;
  }

  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) console.log(`  ⚠ ${w}`);
  }

  if (!SUPABASE_KEY) {
    console.error(`  ✗ SUPABASE_ANON_KEY not set. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY env var.`);
    return false;
  }

  const result = await supabaseRest('sr_engine_output', 'POST', payload.dossier);
  if (!result.ok) {
    console.error(`  ✗ Supabase write failed: ${result.error}`);
    return false;
  }
  return true;
}

// --- Rollback by run_id ---

export async function rollbackRun(runId: string, dryRun: boolean = true): Promise<void> {
  if (!SUPABASE_KEY) {
    console.error(`  ✗ SUPABASE_ANON_KEY not set.`);
    return;
  }

  const countResult = await supabaseRest(
    'sr_engine_output', 'GET', undefined,
    `run_id=eq.${encodeURIComponent(runId)}&select=prospect_id`
  );

  console.log(`\n  Rollback target: run_id = ${runId}`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would delete all records with run_id = ${runId}`);
    console.log(`  To execute: npx tsx supabase-adapter.ts rollback ${runId} --confirm`);
    return;
  }

  const result = await supabaseRest(
    'sr_engine_output', 'DELETE', undefined,
    `run_id=eq.${encodeURIComponent(runId)}`
  );

  if (result.ok) {
    console.log(`  ✓ Rolled back run_id = ${runId}`);
  } else {
    console.error(`  ✗ Rollback failed: ${result.error}`);
  }
}

// CLI for standalone rollback
if (process.argv[1]?.includes('supabase-adapter')) {
  const cmd = process.argv[2];
  if (cmd === 'rollback') {
    const runId = process.argv[3];
    const confirm = process.argv.includes('--confirm');
    if (!runId) {
      console.log('Usage: npx tsx supabase-adapter.ts rollback <run-id> [--confirm]');
      process.exit(1);
    }
    rollbackRun(runId, !confirm);
  }
}
