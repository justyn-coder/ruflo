/**
 * run-pipeline-v2 — Substrate-first cold prospecting pipeline
 *
 * New entry point that uses the evidence-tiering stack end-to-end.
 * Runs alongside the existing `run-pipeline.ts` (no changes to that file).
 * Operator can run both on the same cohort and compare outputs.
 *
 * Architecture:
 *   1. ICP gate              (icp-gate.ts — existing, unchanged)
 *   2. Email find            (email-finder/orchestrator.ts — existing, unchanged)
 *   3. Evidence orchestrate  (evidence-tiering/orchestrator.ts — NEW)
 *   4. Compose               (specific-composer / generalized-composer — NEW)
 *   5. Persist to Supabase   (direct write — sr_engine_output)
 *
 * Skipped vs v1 (intentionally — to be wired later):
 *   - Microsite generation (Phase 8)
 *   - LLM judge gate (Phase 7) — tier discipline replaces "did the LLM hallucinate"
 *   - Cross-model judge (Phase 7b)
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/evidence-tiering/run-pipeline-v2.ts \
 *     --input data/showrev/p2-cold/some-cohort.csv \
 *     [--skip-apollo] [--concurrency 5] [--limit 5]
 */

import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { parseArgs } from 'util';
import { icpGate } from '../icp-gate.js';
import { resolveAE } from '../ae-config.js';
import { findEmail } from '../email-finder/orchestrator.js';
import { orchestrateEvidence } from './orchestrator.js';
import { composeSpecific } from './specific-composer.js';
import { ApolloCreditTracker } from './apollo-client.js';
import type { ComposedEmail, TieredDossier, IcpVolumeVerdict } from './types.js';

// ----------------------------------------------------------------------------
// CSV parse (no email column per SoT §16)
// ----------------------------------------------------------------------------

interface CsvRow {
  firstName: string;
  lastName: string;
  company: string;
  title?: string;
  state?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex(h => h === name);
  const iFirst = idx('firstname') !== -1 ? idx('firstname') : idx('fname');
  const iLast = idx('lastname') !== -1 ? idx('lastname') : idx('lname');
  const iCompany = idx('company') !== -1 ? idx('company') : idx('company name');
  const iTitle = idx('title') !== -1 ? idx('title') : idx('role');
  const iState = idx('state');

  return lines.slice(1).map(line => {
    const fields = line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
    return {
      firstName: fields[iFirst] || '',
      lastName: fields[iLast] || '',
      company: fields[iCompany] || '',
      title: iTitle >= 0 ? fields[iTitle] || '' : '',
      state: iState >= 0 ? fields[iState] || '' : '',
    };
  }).filter(r => r.firstName && r.lastName && r.company);
}

// ----------------------------------------------------------------------------
// Per-prospect result
// ----------------------------------------------------------------------------

interface ProspectResult {
  row: CsvRow;
  ae: { name: string; email: string };
  micrositeSlug: string;
  icp_verdict: 'pass' | 'reject' | 'pending';
  icp_type?: 'fiber_operator' | 'ae_firm';
  icp_reason?: string;
  email_found?: string;
  email_confidence?: string;
  email_confidence_score?: number;
  dossier?: TieredDossier;
  composed?: ComposedEmail;
  composer_mode?: 'specific' | 'generalized';
  icp_volume_verdict?: IcpVolumeVerdict;
  research_quality?: string;
  pull_substrate_records?: number;
  pull_apollo_matched?: boolean;
  pull_industry_records?: number;
  apollo_credits_used?: number;
  durations_ms: {
    icp?: number;
    email?: number;
    orchestrate?: number;
    compose?: number;
    persist?: number;
    total: number;
  };
  errors: string[];
}

// ----------------------------------------------------------------------------
// Process one prospect
// ----------------------------------------------------------------------------

async function processOne(
  row: CsvRow,
  options: { skipApollo: boolean; runId: string; verbose: boolean },
  creditTracker: ApolloCreditTracker,
): Promise<ProspectResult> {
  const t0 = Date.now();
  const ae = resolveAE(row.state);
  const slug = `${row.company}-${row.firstName}-${row.lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const result: ProspectResult = {
    row,
    ae,
    micrositeSlug: slug,
    icp_verdict: 'pending',
    durations_ms: { total: 0 },
    errors: [],
  };

  console.log(`\n[${row.firstName} ${row.lastName}] @ ${row.company} (${row.state || '?'})`);

  // Phase 1: ICP gate (existing primitive)
  try {
    const t1 = Date.now();
    const icp = await icpGate(row.company, row.title || '');
    result.icp_verdict = icp.verdict === 'pass' ? 'pass' : 'reject';
    result.icp_type = icp.icpType === 'non_icp' ? undefined : icp.icpType as 'fiber_operator' | 'ae_firm';
    result.icp_reason = icp.reason;
    result.durations_ms.icp = Date.now() - t1;
    console.log(`  icp: ${icp.verdict} (${icp.icpType})`);
    if (icp.verdict !== 'pass') {
      result.durations_ms.total = Date.now() - t0;
      return result;
    }
  } catch (err) {
    result.errors.push(`icp: ${(err as Error).message}`);
  }

  // Phase 2: Email find (existing primitive)
  // Per SoT §16: CSV has no email column. Always discover via Apollo + SMTP.
  try {
    const t2 = Date.now();
    const emailResult = await findEmail({
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
    });
    result.email_found = emailResult.email || undefined;
    result.email_confidence = emailResult.confidence;
    result.durations_ms.email = Date.now() - t2;
    console.log(`  email: ${emailResult.email || 'NOT-FOUND'} (${emailResult.confidence})`);
  } catch (err) {
    result.errors.push(`email-find: ${(err as Error).message}`);
  }

  // Phase 3: Evidence orchestration (NEW substrate-first)
  if (result.icp_type) {
    try {
      const t3 = Date.now();
      const orch = await orchestrateEvidence(
        {
          firstName: row.firstName,
          lastName: row.lastName,
          company: row.company,
          title: row.title || '',
          state: row.state,
        },
        {
          icpType: result.icp_type,
          verbose: options.verbose,
          skipApollo: options.skipApollo,
          apolloCreditTracker: creditTracker,
        },
      );
      result.dossier = orch.dossier;
      result.composer_mode = orch.dossier.composer_mode;
      result.icp_volume_verdict = orch.dossier.icp_volume_verdict;
      result.research_quality = orch.dossier.research_quality;
      result.pull_substrate_records = orch.pullStats.substrate_records;
      result.pull_apollo_matched = orch.pullStats.apollo_matched;
      result.pull_industry_records = orch.pullStats.industry_records;
      result.apollo_credits_used = orch.apolloCreditsUsed;
      result.durations_ms.orchestrate = Date.now() - t3;
      console.log(
        `  orchestrate: ${orch.dossier.tierCounts.useDirectly} USE_DIRECTLY + ${orch.dossier.tierCounts.useToShape} USE_TO_SHAPE, mode=${orch.dossier.composer_mode}, icp=${orch.dossier.icp_volume_verdict}`,
      );
    } catch (err) {
      result.errors.push(`orchestrate: ${(err as Error).message}`);
    }
  }

  // Phase 4: Composition (NEW — specific with auto-fallback to generalized)
  if (result.icp_type && result.dossier) {
    try {
      const t4 = Date.now();
      const composed = await composeSpecific({
        prospect: {
          firstName: row.firstName,
          lastName: row.lastName,
          company: row.company,
          title: row.title || '',
          state: row.state,
        },
        icpType: result.icp_type,
        aeName: ae.name,
        micrositeSlug: slug,
        verbose: false,
      });
      result.composed = composed;
      result.durations_ms.compose = Date.now() - t4;
      console.log(`  compose: ${composed.body.split(/\s+/).length}w, mode=${composed.composer_mode}, subject="${composed.subject.slice(0, 50)}"`);
    } catch (err) {
      result.errors.push(`compose: ${(err as Error).message}`);
    }
  }

  // Phase 5: Persist to Supabase
  if (result.icp_type) {
    try {
      const t5 = Date.now();
      await persistToSupabase(result, options.runId);
      result.durations_ms.persist = Date.now() - t5;
    } catch (err) {
      result.errors.push(`persist: ${(err as Error).message}`);
    }
  }

  result.durations_ms.total = Date.now() - t0;
  return result;
}

// ----------------------------------------------------------------------------
// Supabase persistence (direct write to sr_engine_output)
// ----------------------------------------------------------------------------

async function persistToSupabase(result: ProspectResult, runId: string): Promise<void> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) {
    result.errors.push('persist: no Supabase key');
    return;
  }

  const prospectId = `${result.row.firstName}-${result.row.lastName}-${result.row.company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const body = {
    prospect_id: prospectId,
    run_id: runId,
    first_name: result.row.firstName,
    last_name: result.row.lastName,
    email: result.email_found || '',
    company: result.row.company,
    title: result.row.title || '',
    state: result.row.state || '',
    icp_status: result.icp_verdict,
    icp_reason: result.icp_reason || '',
    assigned_ae: result.ae.name,
    ae_email: result.ae.email,
    mechanical_check_passed: !!result.composed,
    email_subject_t1: result.composed?.subject || '',
    email_body_t1: result.composed?.body || '',
    email_ps_t1: result.composed?.ps || '',
    confidence_color: result.email_confidence === 'high' ? 'green' : result.email_confidence === 'medium' ? 'yellow' : 'red',
    confidence_score: result.email_confidence_score ?? null,
    icp_volume_verdict: result.icp_volume_verdict || null,
    icp_volume_reasoning: result.dossier?.icp_volume_reasoning || null,
    research_summary: JSON.stringify({
      composer_mode: result.composer_mode,
      research_quality: result.research_quality,
      tier_counts: result.dossier?.tierCounts,
      pull_stats: {
        substrate_records: result.pull_substrate_records,
        apollo_matched: result.pull_apollo_matched,
        industry_records: result.pull_industry_records,
      },
      body_sentences: result.composed?.bodySentences,
      apollo_credits_used: result.apollo_credits_used,
    }),
  };

  const res = await fetch(`${sbUrl}/rest/v1/sr_engine_output`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sr_engine_output upsert ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ----------------------------------------------------------------------------
// Summary print
// ----------------------------------------------------------------------------

function printSummary(results: ProspectResult[], runId: string, totalMs: number): void {
  console.log('\n' + '='.repeat(70));
  console.log(`  Pipeline v2 Summary — run_id ${runId}`);
  console.log('='.repeat(70));

  const passed = results.filter(r => r.icp_verdict === 'pass');
  const composed = results.filter(r => r.composed);
  const specificMode = results.filter(r => r.composer_mode === 'specific');
  const generalizedMode = results.filter(r => r.composer_mode === 'generalized');
  const emailFound = results.filter(r => r.email_found).length;
  const totalApolloCredits = results.reduce((s, r) => s + (r.apollo_credits_used || 0), 0);

  console.log(`  Total prospects:     ${results.length}`);
  console.log(`  ICP passed:          ${passed.length}/${results.length}`);
  console.log(`  Emails found:        ${emailFound}/${results.length}`);
  console.log(`  Emails composed:     ${composed.length}/${results.length}`);
  console.log(`    Specific mode:     ${specificMode.length}`);
  console.log(`    Generalized mode:  ${generalizedMode.length}`);
  console.log(`  Apollo credits:      ${totalApolloCredits}`);
  console.log(`  Total wall-clock:    ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Avg per prospect:    ${(totalMs / results.length / 1000).toFixed(1)}s`);

  console.log('\n  Per prospect:');
  console.log('  ' + 'Name'.padEnd(28) + 'Company'.padEnd(28) + 'Mode'.padEnd(13) + 'Tiers'.padEnd(14) + 'Email');
  console.log('  ' + '-'.repeat(95));
  for (const r of results) {
    const name = `${r.row.firstName} ${r.row.lastName}`.slice(0, 27);
    const company = r.row.company.slice(0, 27);
    const mode = r.composer_mode || (r.icp_verdict === 'reject' ? 'ICP-reject' : 'no-compose');
    const tiers = r.dossier ? `${r.dossier.tierCounts.useDirectly}D/${r.dossier.tierCounts.useToShape}S` : '-';
    const email = r.email_found ? r.email_confidence?.slice(0, 6) : 'no-email';
    console.log(`  ${name.padEnd(28)}${company.padEnd(28)}${mode.padEnd(13)}${tiers.padEnd(14)}${email}`);
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string', short: 'i' },
      'skip-apollo': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false, short: 'v' },
      limit: { type: 'string' },
    },
    strict: false,
  });

  const inputPath = values.input as string;
  if (!inputPath) {
    console.error('Usage: --input <csv-path> [--skip-apollo] [--verbose] [--limit N]');
    process.exit(1);
  }

  const csvText = readFileSync(resolve(inputPath), 'utf-8');
  let rows = parseCsv(csvText);
  if (values.limit) {
    rows = rows.slice(0, parseInt(values.limit as string, 10));
  }

  const runId = `v2-${Date.now().toString(36)}`;
  console.log('='.repeat(70));
  console.log(`  Pipeline v2 — substrate-first cold prospecting`);
  console.log(`  Run ID: ${runId}`);
  console.log(`  Input:  ${inputPath} (${rows.length} prospects)`);
  console.log(`  Apollo: ${values['skip-apollo'] ? 'SKIPPED' : 'enabled (fallback)'}`);
  console.log('='.repeat(70));

  const creditTracker = new ApolloCreditTracker();
  const t0 = Date.now();
  const results: ProspectResult[] = [];

  for (const row of rows) {
    try {
      const result = await processOne(
        row,
        {
          skipApollo: !!values['skip-apollo'],
          runId,
          verbose: !!values.verbose,
        },
        creditTracker,
      );
      results.push(result);
    } catch (err) {
      console.error(`  FATAL on ${row.firstName} ${row.lastName}: ${(err as Error).message}`);
    }
  }

  printSummary(results, runId, Date.now() - t0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
