import { execSync } from 'child_process';
import type { Prospect } from './importer.js';
import type { PatternSelection } from './influence.js';
import type { MechanicalCheckResult } from './judge.js';

const SUPABASE_PROJECT = 'slttpknnuthbttjuzrnz';

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
  research_model: string;
  research_confidence: string;
  mechanical_check_passed: boolean;
  mechanical_check_failures: string;
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

  if (d.email_body_t1 && d.email_body_t1.split(/\s+/).length > 80) {
    errors.push(`T1 body exceeds 80 words (${d.email_body_t1.split(/\s+/).length})`);
  }
  if (d.email_body_t2 && d.email_body_t2.split(/\s+/).length > 80) {
    errors.push(`T2 body exceeds 80 words (${d.email_body_t2.split(/\s+/).length})`);
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
  mechanicalCheck: MechanicalCheckResult
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
    research_model: 'premium_3persona',
    research_confidence: '',
    mechanical_check_passed: mechanicalCheck.passed,
    mechanical_check_failures: mechanicalCheck.failures.join('; '),
    created_at: new Date().toISOString(),
  };
}

// --- Dry-run mode ---

export function dryRunPreview(payload: SupabaseWritePayload): void {
  const d = payload.dossier;
  const validation = validateBeforeWrite(payload);

  console.log(`\n  [DRY RUN] Would write to sr_brain_dossiers:`);
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

// --- Write to Supabase ---

function escapeSql(val: string): string {
  return val.replace(/'/g, "''");
}

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

  const d = payload.dossier;

  const sql = `INSERT INTO sr_brain_dossiers (
    prospect_id, run_id, first_name, last_name, email, company, title, state,
    icp_status, icp_reason, assigned_ae, ae_email, persona_bucket,
    research_summary, challenger_insight,
    influence_pattern_t1, influence_pattern_t2, influence_pattern_t3,
    email_subject_t1, email_body_t1, email_ps_t1,
    email_subject_t2, email_body_t2, email_ps_t2,
    email_subject_t3, email_body_t3, email_ps_t3,
    microsite_slug, research_model, research_confidence,
    mechanical_check_passed, mechanical_check_failures, created_at
  ) VALUES (
    '${escapeSql(d.prospect_id)}', '${escapeSql(d.run_id)}',
    '${escapeSql(d.first_name)}', '${escapeSql(d.last_name)}',
    '${escapeSql(d.email)}', '${escapeSql(d.company)}',
    '${escapeSql(d.title)}', '${escapeSql(d.state)}',
    '${escapeSql(d.icp_status)}', '${escapeSql(d.icp_reason)}',
    '${escapeSql(d.assigned_ae)}', '${escapeSql(d.ae_email)}',
    '${escapeSql(d.persona_bucket)}',
    '${escapeSql(d.research_summary)}', '${escapeSql(d.challenger_insight)}',
    '${escapeSql(d.influence_pattern_t1)}', '${escapeSql(d.influence_pattern_t2)}',
    '${escapeSql(d.influence_pattern_t3)}',
    '${escapeSql(d.email_subject_t1)}', '${escapeSql(d.email_body_t1)}',
    '${escapeSql(d.email_ps_t1)}',
    '${escapeSql(d.email_subject_t2)}', '${escapeSql(d.email_body_t2)}',
    '${escapeSql(d.email_ps_t2)}',
    '${escapeSql(d.email_subject_t3)}', '${escapeSql(d.email_body_t3)}',
    '${escapeSql(d.email_ps_t3)}',
    '${escapeSql(d.microsite_slug)}', '${escapeSql(d.research_model)}',
    '${escapeSql(d.research_confidence)}',
    ${d.mechanical_check_passed}, '${escapeSql(d.mechanical_check_failures)}',
    '${d.created_at}'
  ) ON CONFLICT (prospect_id, run_id) DO UPDATE SET
    email_subject_t1 = EXCLUDED.email_subject_t1,
    email_body_t1 = EXCLUDED.email_body_t1,
    email_ps_t1 = EXCLUDED.email_ps_t1,
    email_subject_t2 = EXCLUDED.email_subject_t2,
    email_body_t2 = EXCLUDED.email_body_t2,
    email_ps_t2 = EXCLUDED.email_ps_t2,
    email_subject_t3 = EXCLUDED.email_subject_t3,
    email_body_t3 = EXCLUDED.email_body_t3,
    email_ps_t3 = EXCLUDED.email_ps_t3,
    mechanical_check_passed = EXCLUDED.mechanical_check_passed,
    mechanical_check_failures = EXCLUDED.mechanical_check_failures;`;

  try {
    execSync(
      `npx supabase db execute --project-ref ${SUPABASE_PROJECT} --sql '${sql.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return true;
  } catch (err: any) {
    console.error(`  ✗ Supabase write failed: ${err.message}`);
    return false;
  }
}

// --- Rollback by run_id ---

export async function rollbackRun(runId: string, dryRun: boolean = true): Promise<void> {
  const countSql = `SELECT COUNT(*) as count FROM sr_brain_dossiers WHERE run_id = '${escapeSql(runId)}'`;

  try {
    const countResult = execSync(
      `npx supabase db execute --project-ref ${SUPABASE_PROJECT} --sql "${countSql}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    console.log(`\n  Rollback target: run_id = ${runId}`);
    console.log(`  Records found: ${countResult.trim()}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would delete all records with run_id = ${runId}`);
      console.log(`  To execute: npx tsx supabase-adapter.ts rollback ${runId} --confirm`);
      return;
    }

    const deleteSql = `DELETE FROM sr_brain_dossiers WHERE run_id = '${escapeSql(runId)}'`;
    execSync(
      `npx supabase db execute --project-ref ${SUPABASE_PROJECT} --sql "${deleteSql}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    console.log(`  ✓ Rolled back run_id = ${runId}`);
  } catch (err: any) {
    console.error(`  ✗ Rollback failed: ${err.message}`);
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
