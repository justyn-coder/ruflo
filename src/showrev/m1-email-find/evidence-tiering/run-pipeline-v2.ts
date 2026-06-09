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
import { resolveAE, getAEDetails } from '../ae-config.js';
import { findEmail } from '../email-finder/orchestrator.js';
import { orchestrateEvidence } from './orchestrator.js';
import { composeSpecific } from './specific-composer.js';
import { ApolloCreditTracker, findEmailForProspect } from './apollo-client.js';
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
  options: { skipApollo: boolean; runId: string; verbose: boolean; maxApolloCredits?: number },
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
  // Path A: existing findEmail (SMTP verification + pattern matching)
  // Path B fallback: when Path A returns red/null, derive via Apollo peer-pattern
  try {
    const t2 = Date.now();
    const emailResult = await findEmail({
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
    });
    result.email_found = emailResult.email || undefined;
    result.email_confidence = emailResult.confidence;

    const pathANeedsB =
      !emailResult.email ||
      emailResult.confidence === 'red' ||
      emailResult.confidence === 'amber' ||
      emailResult.confidence === 'not-found';

    const apolloCapHit = creditTracker.shouldStop(options.maxApolloCredits);
    if (apolloCapHit && pathANeedsB) {
      console.log(`  email path-b: SKIPPED (Apollo credit cap ${options.maxApolloCredits} reached, current=${creditTracker.total()})`);
    }
    if (pathANeedsB && !options.skipApollo && !apolloCapHit) {
      // Path B: Apollo direct people-match → peer-pattern derivation fallback
      const apolloResult = await findEmailForProspect({
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
      });
      creditTracker.add(apolloResult.creditsUsed);
      if (
        apolloResult.email &&
        (apolloResult.confidence === 'high' ||
          apolloResult.confidence === 'medium' ||
          apolloResult.confidence === 'guessed')
      ) {
        // Only override if Path B found something tangible
        if (
          !result.email_found ||
          (apolloResult.confidence !== 'guessed' && emailResult.confidence === 'red')
        ) {
          console.log(`  email path-b: ${apolloResult.email} (${apolloResult.confidence}, source=${apolloResult.source})`);
          result.email_found = apolloResult.email;
          result.email_confidence = apolloResult.confidence;
        }
      }
    }

    result.durations_ms.email = Date.now() - t2;
    console.log(`  email: ${result.email_found || 'NOT-FOUND'} (${result.email_confidence || 'n/a'})`);
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
          skipApollo: options.skipApollo || creditTracker.shouldStop(options.maxApolloCredits),
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
      await persistMicrosite(result);
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

  // Derive MEDDPICC + intel_* columns from the dossier WITHOUT extra LLM calls.
  // Per V2-COMPOSER-GAP-FIX-PLAN Fix 8 — operator-approved: derive what we can,
  // leave LLM-required fields null. Portal expand-view becomes useful instead of empty.
  const tierCounts = result.dossier?.tierCounts;
  const intelSignalStrength =
    (tierCounts?.useDirectly ?? 0) >= 3 ? 'strong' :
    (tierCounts?.useDirectly ?? 0) >= 1 ? 'medium' : 'weak';
  const intelFitRationale = result.dossier?.icp_volume_reasoning || '';

  // Pick the strongest USE_DIRECTLY company_fact for the meddpicc_identified_pain field
  const useDirectlyFacts = (result.dossier?.claims?.company_fact || [])
    .filter(c => c.tier === 'USE_DIRECTLY')
    .slice(0, 3);
  const meddpiccPain = useDirectlyFacts.length > 0
    ? useDirectlyFacts.map(c => `- ${c.claim}`).join('\n')
    : '';

  // Persona-driven decision criteria (deterministic from persona bucket)
  const personaBucket = result.composer_mode === 'specific' && result.composed?.composer_mode
    ? (result.dossier ? 'inferred-from-title' : null)
    : null;
  const meddpiccDecisionCriteria =
    /chief|vp|svp|ceo/i.test(result.row.title || '') ? 'Speed-to-revenue; capital efficiency; competitive market capture' :
    /director|head|ops|operation/i.test(result.row.title || '') ? 'Drawing throughput; permitting speed; crew utilization; design capacity' :
    /engineer|technical|designer/i.test(result.row.title || '') ? 'GIS-to-CAD traceability; design tool integration; data accuracy; workforce scaling' :
    '';

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
    // MEDDPICC + intel_* derived from dossier
    persona_bucket: personaBucket,
    intel_signal_strength: intelSignalStrength,
    intel_fit_rationale: intelFitRationale,
    meddpicc_identified_pain: meddpiccPain || null,
    meddpicc_decision_criteria: meddpiccDecisionCriteria || null,
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

  // Also upsert to sr_prospects so the portal P2-Cold tab picks this up.
  // Without this, prospects compose silently into sr_engine_output but never
  // appear in the operator review surface — discovered 2026-06-09 PM.
  if (result.icp_verdict !== 'pass') return;
  const icpType: string =
    /a&e|firm|consulting|engineering/i.test(result.icp_reason || '') &&
    !/operator|isp|carrier|fiber to|broadband/i.test(result.icp_reason || '')
      ? 'ae_firm'
      : 'fiber_operator';

  const prospectBody = {
    id: prospectId,
    first_name: result.row.firstName,
    last_name: result.row.lastName,
    email: result.email_found || '',
    title: result.row.title || '',
    state: result.row.state || '',
    company: result.row.company,
    lead_type: 'Cold',
    tier: 'A',
    campaign: 'P2',
    send_status: 'pending',
    assigned_ae: result.ae.name,
    icp_status: result.icp_verdict,
    icp_reason: result.icp_reason || '',
    icp_type: icpType,
    updated_at: new Date().toISOString(),
  };
  const presRes = await fetch(`${sbUrl}/rest/v1/sr_prospects?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(prospectBody),
  });
  if (!presRes.ok) {
    const text = await presRes.text();
    // Non-fatal — sr_engine_output already has the data; portal sync can be retried
    console.warn(`[persist] sr_prospects upsert failed ${presRes.status}: ${text.slice(0, 200)}`);
  }
}

// ----------------------------------------------------------------------------
// Microsite generation (Fix 9 — templated content per persona + ICP)
// ----------------------------------------------------------------------------
//
// Cold prospect clicks PS link → /assess/{slug} must return 200 with relevant
// content. Templated approach: persona-driven headline + ICP-typed insight +
// 1-of-2 case studies. Saves ~$0.02/prospect vs LLM-generation; operator can
// promote to LLM-rich later for high-value cohorts.
// status='draft' so it doesn't auto-appear public until operator review.

const MICROSITE_HEADLINE_BY_PERSONA: Record<string, string> = {
  revenue_leader: 'Compress design-to-construction so revenue catches up with the network',
  ops_builder: 'When the build is moving but the drawings are the bottleneck',
  technical_designer: 'GIS-to-CAD: deterministic, traceable, built for scale',
};

function buildMicrositeInsight(
  icpType: 'fiber_operator' | 'ae_firm',
  persona: string,
  companyName: string,
): string {
  const opener = icpType === 'fiber_operator'
    ? 'Fiber operators in active build phases hit the same wall — design throughput, not crews or capital, becomes the gating constraint.'
    : 'A&E firms running multi-program fiber design hit a per-engineer ceiling that no amount of hiring or outsourcing solves cleanly.';

  const personaBridge =
    persona === 'revenue_leader' ? 'For revenue leaders, the cost shows up as delayed subscriber activation, slipped BEAD ROI timelines, and lost ground to faster-moving peers.' :
    persona === 'ops_builder' ? 'For ops leaders, it shows up as crews waiting on approved drawings, permit cycles eating the construction window, and a backlog that grows faster than the team can close.' :
    persona === 'technical_designer' ? 'For engineering leaders, it shows up as designers spending hours formatting deliverables instead of designing, and re-cycle work whenever GIS data updates mid-build.' :
    'It shows up across the build as friction between data and field execution.';

  const close = `Inorsa converts your GIS and LLD data into construction and permit drawings in minutes. Deterministic output, full traceability back to source — no AI guesswork, no black box. Below: a 4-question diagnostic that takes ~60 seconds and shows where in your current cycle the friction concentrates.`;

  return `${opener}\n\n${personaBridge}\n\n${close}`;
}

const CASE_STUDY_FIBER_OPERATOR = `**Case study: Regional fiber operator, ~120,000 locations served**

The team was running BEAD-funded builds across 6 counties. Engineering throughput was the rate limiter — designers spent 60-70% of their time on drawing production, not actual design.

Inorsa drop-in:
- GIS + LLD data feeds Inorsa's drawing engine
- Construction + permit drawing packages render in minutes, not days
- All output is deterministic and traceable back to the source data feeds
- Engineers reclaim time for the design work that actually needs human judgment

Result: design-to-construction cycle compressed by 40%+ without adding headcount. Build momentum compounded.`;

const CASE_STUDY_AE_FIRM = `**Case study: A&E firm, multi-program fiber design**

The firm was managing 4 concurrent fiber programs for different operator clients, each with its own data feed + GIS conventions. Drawing-production cycle was the per-engineer ceiling.

Inorsa drop-in:
- Per-program drawing engines run on Inorsa's deterministic pipeline
- Source-data → drawing packages in minutes
- Margin compression from CD revision cycles drops to near-zero
- Engineering team capacity effectively doubles without hiring

Result: throughput per engineer doubled. Firm took on a 5th concurrent program with the same team.`;

async function persistMicrosite(result: ProspectResult): Promise<void> {
  if (!result.composed) return; // nothing to display if no email composed
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return;

  const persona =
    /chief|vp|svp|ceo|cfo/i.test(result.row.title || '') ? 'revenue_leader' :
    /director|head|ops|operation|manager/i.test(result.row.title || '') ? 'ops_builder' :
    /engineer|technical|designer|cto/i.test(result.row.title || '') ? 'technical_designer' :
    'ops_builder';

  const headline = MICROSITE_HEADLINE_BY_PERSONA[persona] || MICROSITE_HEADLINE_BY_PERSONA.ops_builder;
  const icpType = (result.icp_type === 'ae_firm' ? 'ae_firm' : 'fiber_operator') as 'fiber_operator' | 'ae_firm';
  const insightText = buildMicrositeInsight(icpType, persona, result.row.company);
  const caseStudyText = icpType === 'fiber_operator' ? CASE_STUDY_FIBER_OPERATOR : CASE_STUDY_AE_FIRM;

  const aeDetail = getAEDetails(result.ae.name);
  const prospectId = `${result.row.firstName}-${result.row.lastName}-${result.row.company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const micrositeRow = {
    slug: result.micrositeSlug,
    prospect_id: prospectId,
    company_name: result.row.company,
    company_logo_url: null, // logo resolution deferred; portal can fill later
    recipient_name: `${result.row.firstName} ${result.row.lastName}`,
    recipient_title: result.row.title || '',
    headline,
    insight_text: insightText,
    case_study_text: caseStudyText,
    ae_name: result.ae.name,
    ae_title: aeDetail.title,
    ae_email: result.ae.email,
    ae_phone: aeDetail.phone,
    ae_booking_url: aeDetail.booking_url,
    ae_photo_url: aeDetail.photo_url,
    status: 'draft', // operator review required before public
  };

  try {
    const res = await fetch(`${sbUrl}/rest/v1/sr_microsites?on_conflict=slug`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(micrositeRow),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[microsite] upsert ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[microsite] upsert error: ${(err as Error).message}`);
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
      'max-apollo-credits': { type: 'string' },
      verbose: { type: 'boolean', default: false, short: 'v' },
      limit: { type: 'string' },
    },
    strict: false,
  });

  const inputPath = values.input as string;
  if (!inputPath) {
    console.error('Usage: --input <csv-path> [--skip-apollo] [--max-apollo-credits N] [--verbose] [--limit N]');
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
  const maxApolloCredits = values['max-apollo-credits']
    ? parseInt(values['max-apollo-credits'] as string, 10)
    : undefined;
  console.log(`  Apollo: ${values['skip-apollo'] ? 'SKIPPED' : 'enabled (fallback)'}` + (maxApolloCredits ? ` | cap=${maxApolloCredits} credits` : ''));
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
          maxApolloCredits,
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
