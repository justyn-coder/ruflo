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
import { detectPersona } from '../influence.js';
import { findEmail } from '../email-finder/orchestrator.js';
import { verifyEmailMV, MvCreditTracker } from '../email-finder/million-verifier.js';
import { resolveCompanyLogo } from '../logo-resolver.js';
import { composeMicrosite } from './microsite-composer.js';
import { orchestrateEvidence } from './orchestrator.js';
import { composeSpecific } from './specific-composer.js';
import { computeSendConfidence } from './send-confidence.js';
import { resolveCompany, deriveIcpOverride } from './company-resolver.js';
import { loadDirectory, lookupDirectory, type DirectoryEntry, type DirectoryMap } from './company-directory.js';
import { ApolloCreditTracker, findEmailForProspect } from './apollo-client.js';
import {
  checkSubstrateRefutation,
  type RefutationResult,
  type Refuter,
  type FrameId,
} from './refutation.js';
import {
  runTieredJudgeOnProspect,
  judgeMonitor,
  resetJudgeMonitor,
  type TieredJudgeResult,
  type JudgeAction,
} from './tiered-judge.js';
import type { ComposedEmail, EvidenceRecord, TieredDossier, IcpVolumeVerdict } from './types.js';

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

/**
 * Parse one CSV line respecting double-quoted fields with embedded commas.
 * Fixes the column-shift bug discovered 2026-06-11: rows like
 *   Ed,Carson,"Palmetto Rural Telephone Cooperative, Inc.",Director ...,SC,,
 * were splitting on the comma INSIDE the quoted company name, shifting every
 * downstream field by one. Affected ~25% of the cohort (50 of 204 rows).
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') { out.push(current.trim()); current = ''; }
      else if (ch === '"') inQuote = true;
      else current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex(h => h === name);
  const iFirst = idx('firstname') !== -1 ? idx('firstname') : idx('fname');
  const iLast = idx('lastname') !== -1 ? idx('lastname') : idx('lname');
  const iCompany = idx('company') !== -1 ? idx('company') : idx('company name');
  const iTitle = idx('title') !== -1 ? idx('title') : idx('role');
  const iState = idx('state');

  return lines.slice(1).map(line => {
    const fields = parseCsvLine(line);
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
  // Item 9 (2026-06-09): expose email-finder + Apollo signals so the
  // system_brief generator can explain Path A / Path B outcomes in
  // plain English without re-running anything.
  email_tactics_attempted?: string[];
  email_verification_status?: string;
  email_path_b_attempted?: boolean;
  email_path_b_source?: string;
  email_path_b_confidence?: string;
  dossier?: TieredDossier;
  composed?: ComposedEmail;
  composer_mode?: 'specific' | 'generalized';
  judge_result?: TieredJudgeResult;
  judge_action?: JudgeAction;
  send_status?: 'pending' | 'flag';
  icp_volume_verdict?: IcpVolumeVerdict;
  research_quality?: string;
  pull_substrate_records?: number;
  pull_apollo_matched?: boolean;
  pull_industry_records?: number;
  apollo_credits_used?: number;
  // Item 6 (2026-06-09): flag-status pattern. When an ICP-passed prospect
  // exhausts Path A + Path B with no usable email, mark as 'flag' so it still
  // surfaces in the portal for human review with a plain-English System Brief
  // explaining why and what technique might unblock it later.
  flag_status?: boolean;
  flag_reason_short?: string;  // → sr_engine_output.ae_flag (terse, one-line)
  flag_reason_brief?: string;  // → sr_engine_output.company_summary (System Brief, 1-3 sentences plain English)
  // Phase C (audit fresh-eyes 2026-06-09 integration handoff): the
  // refutation result captured pre-compose. status='halt' means the
  // substrate refuted the chosen frame and no safe alternative existed —
  // the prospect routes to system_brief with refuter claims named.
  refutation_result?: RefutationResult;
  refutation_frame?: FrameId;
  durations_ms: {
    resolve?: number;  // Fix #2 2026-06-10: company-resolver phase 0.5
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
  options: { skipApollo: boolean; runId: string; verbose: boolean; maxApolloCredits?: number; prospectIdx: number; directory?: DirectoryMap },
  creditTracker: ApolloCreditTracker,
  mvCreditTracker: MvCreditTracker,
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

  // Phase 0.4: Per-company directory lookup (Directory integration 2026-06-11).
  // Look up the prospect's raw company in the operator-reviewed directory CSV.
  // A hit gives us canonical_domain (for email-find pinning) + canonical_name
  // (for substrate-query aliasing) + business_type. Miss = legacy behavior.
  const directoryHint: DirectoryEntry | null = options.directory
    ? lookupDirectory(options.directory, row.company)
    : null;
  if (directoryHint) {
    console.log(`  directory: hit — canonical="${directoryHint.canonical_name}", domain=${directoryHint.canonical_domain} (${directoryHint.confidence})`);
  }

  // Phase 0.5: Company resolver (Fix #2 2026-06-10).
  // Identifies what the company actually does BEFORE the title-only ICP gate
  // runs. Catches the class of misses that title-driven fiber-override let
  // through (TEP = Tower Engineering Professionals classified as fiber_operator
  // because Mora's title contained "Fiber Engineering").
  //
  // If business_type is tower_ae with high/medium confidence, hard-reject
  // before we waste research budget. Otherwise pass through to existing ICP
  // gate which makes the final pass/reject call.
  let companyContext: import('./company-resolver.js').CompanyContext | null = null;
  try {
    const t05 = Date.now();
    companyContext = await resolveCompany(row.company, row.state);
    result.durations_ms.resolve = Date.now() - t05;
    console.log(`  resolve: ${companyContext.business_type} (${companyContext.business_type_confidence})${companyContext.alt_name_hint ? ` — ${companyContext.alt_name_hint}` : ''}`);
    // Operator-directed 2026-06-10: pass prospectTitle so a fiber-specific
    // title (e.g. "Sr. Director - Fiber Engineering") protects them from a
    // company-level tower_ae reject. Primary source (title) beats LLM company
    // classification. See feedback_primary_source_beats_llm_classification.
    const override = deriveIcpOverride(companyContext, row.title);
    if (override) {
      result.icp_verdict = 'reject';
      result.icp_reason = override.icp_reason;
      console.log(`  icp: reject (company-resolver override — ${companyContext.business_type})`);
      result.durations_ms.total = Date.now() - t0;
      return result;
    }
  } catch (err) {
    result.errors.push(`resolve: ${(err as Error).message}`);
    // Soft-fail — fall through to existing ICP gate
  }

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
  //
  // FIX 2026-06-10 (operator directive: "don't overwrite good emails"):
  // BEFORE the email-finder runs, check if sr_prospects.email is already set
  // (operator manually recovered an email via research). If yes, use that
  // verbatim and skip the finder. Otherwise the finder's worst-case output
  // (e.g., "couldn't find") would overwrite manually-recovered peer-verified
  // anchors like Stephanie Lobdell's slobdell@cemc.org or Allison Ellis's
  // Allison.Ellis@ftr.com. Bug caught in wet-run v2-mq8byucj.
  try {
    const t2 = Date.now();

    // Precheck: existing email in sr_prospects
    const sbUrlEarly = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKeyEarly = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let preservedEmail: string | null = null;
    let preservedColor: string | null = null;
    if (sbUrlEarly && sbKeyEarly) {
      try {
        const prospectIdSlug = `${row.firstName.toLowerCase().trim()}-${row.lastName.toLowerCase().trim()}-${(row.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        const r = await fetch(
          `${sbUrlEarly}/rest/v1/sr_prospects?id=eq.${encodeURIComponent(prospectIdSlug)}&select=email,email_corrected`,
          { headers: { apikey: sbKeyEarly, Authorization: `Bearer ${sbKeyEarly}` } },
        );
        if (r.ok) {
          const rows = (await r.json()) as Array<{ email: string | null; email_corrected: boolean | null }>;
          if (rows.length > 0 && rows[0].email && rows[0].email !== 'pending@calibration' && rows[0].email.includes('@')) {
            preservedEmail = rows[0].email;
            // Also check engine_output for prior confidence_color so we don't downgrade
            const r2 = await fetch(
              `${sbUrlEarly}/rest/v1/sr_engine_output?prospect_id=eq.${encodeURIComponent(prospectIdSlug)}&select=confidence_color&order=created_at.desc&limit=1`,
              { headers: { apikey: sbKeyEarly, Authorization: `Bearer ${sbKeyEarly}` } },
            );
            if (r2.ok) {
              const er = (await r2.json()) as Array<{ confidence_color: string | null }>;
              if (er.length > 0) preservedColor = er[0].confidence_color;
            }
          }
        }
      } catch {
        // best-effort; fall through to normal email-find
      }
    }

    if (preservedEmail) {
      result.email_found = preservedEmail;
      // Map the prior confidence_color back to email_confidence.
      // confidence_color values seen in DB: 'green', 'yellow', 'amber', 'red'.
      // 'yellow' and 'amber' both map to 'medium' (they're both intermediate
      // confidence — yellow=SMTP-verified, amber=pattern-inferred-with-domain-confirmed).
      result.email_confidence =
        preservedColor === 'green' ? 'high' :
        preservedColor === 'yellow' || preservedColor === 'amber' ? 'medium' :
        'guessed';
      result.durations_ms.phase_email_find = Date.now() - t2;
      console.log(`  email: ${result.email_found} (PRESERVED from sr_prospects, prior color=${preservedColor || 'unknown'} → confidence=${result.email_confidence})`);
      // Skip findEmail/Apollo paths entirely
    } else {
    const emailResult = await findEmail({
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
    }, {
      // MillionVerifier as Path A final-gate (operator-confirmed wiring 2026-06-09).
      // Resolves M365/Google catch-all "200 OK for everything" ambiguity that
      // currently kills ~18 of 43 red prospects per cohort. valid → green,
      // catch_all → amber, unknown/invalid → keep red.
      millionVerifierFn: async (email: string) => {
        const mv = await verifyEmailMV(email);
        return { quality: mv.quality, result: mv.result };
      },
      // Red-team #8 (2026-06-09): MV is invoked at up to 4 sites per prospect
      // inside orchestrator. The tracker enforces a hard cap on credits spent;
      // orchestrator checks shouldStop() before each call and skips when hit
      // (no degrade — email keeps raw SMTP confidence).
      mvCreditTracker,
      // Directory integration 2026-06-11: when directory has a canonical_domain
      // for this prospect's company, Step 6 verification SKIPS alt-domain fallback.
      // Closes the wrong-company-send class (Trawinski/Omni Fiber → omni.com).
      pinDomain: directoryHint?.canonical_domain,
    });
    result.email_found = emailResult.email || undefined;
    result.email_confidence = emailResult.confidence;
    // Item 9 (2026-06-09): capture Path A signals for system_brief.
    result.email_tactics_attempted = emailResult.tacticsAttempted;
    result.email_verification_status = emailResult.verificationStatus;

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
      result.email_path_b_attempted = true;
      const apolloResult = await findEmailForProspect({
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
      });
      creditTracker.add(apolloResult.creditsUsed);
      // Item 9: record Path B telemetry for system_brief, regardless of accept/reject.
      result.email_path_b_source = apolloResult.source;
      result.email_path_b_confidence = apolloResult.confidence;
      if (
        apolloResult.email &&
        (apolloResult.confidence === 'high' ||
          apolloResult.confidence === 'medium' ||
          apolloResult.confidence === 'guessed')
      ) {
        // Path 1 fix (2026-06-09 operator-approved): override Path A red
        // for ANY tangible Path B result, including 'guessed' (peer-pattern
        // derived). Without this, the cohort splits binary 25g/0y/75r
        // because Apollo Basic returns 'guessed' for many small-operator
        // domains and we were dropping those to red.
        if (
          !result.email_found ||
          emailResult.confidence === 'red' ||
          emailResult.confidence === 'not-found' ||
          emailResult.confidence === 'amber'
        ) {
          console.log(`  email path-b: ${apolloResult.email} (${apolloResult.confidence}, source=${apolloResult.source})`);
          result.email_found = apolloResult.email;
          result.email_confidence = apolloResult.confidence;
        }
      }
    }

    result.durations_ms.email = Date.now() - t2;
    console.log(`  email: ${result.email_found || 'NOT-FOUND'} (${result.email_confidence || 'n/a'})`);
    } // close `else` (no preservedEmail path)
  } catch (err) {
    result.errors.push(`email-find: ${(err as Error).message}`);
  }

  // Phase 2.5: Flag-status detection (Item 6 — 2026-06-09)
  // Operator rule: "If the prospect is an ICP then we do all we can to find
  // their email, but in the interest of time you stop after you've tried all
  // our modules and you post it to the Portal as status 'Flag' and in the
  // System Brief you explain why it's flagged."
  //
  // Trigger: ICP=pass AND (no email found OR confidence='red'/'not-found' OR
  //          Path B was suppressed/failed AND Path A was red).
  // The flag still flows into the Portal for human review (auto-promote runs
  // for flagged prospects too, see Phase 5 persist logic).
  if (result.icp_verdict === 'pass') {
    const noEmail = !result.email_found;
    const redConfidence =
      result.email_confidence === 'red' ||
      result.email_confidence === 'not-found';
    if (noEmail || redConfidence) {
      result.flag_status = true;
      // Terse one-liner for sr_engine_output.ae_flag
      const apolloPart = options.skipApollo
        ? 'Path B (Apollo) skipped'
        : creditTracker.shouldStop(options.maxApolloCredits)
          ? `Path B (Apollo) suppressed (credit cap ${options.maxApolloCredits} reached)`
          : 'Path B (Apollo) returned no usable match';
      result.flag_reason_short =
        `Email find exhausted: Path A (SMTP) ${redConfidence ? 'red' : 'no-result'}; ${apolloPart}.`
          .slice(0, 200);

      // Plain-English 1-3 sentence System Brief for sr_engine_output.company_summary.
      // Per operator: "explain why it's flagged" + recommendations. No jargon.
      const brief: string[] = [];
      brief.push(
        `This prospect passed our ICP check (${result.icp_type === 'ae_firm' ? 'A&E firm' : 'fiber operator'}) but we could not reliably find their email through our standard tools.`,
      );
      if (options.skipApollo) {
        brief.push(`Our Apollo fallback was not run for this batch, so no peer-pattern derivation was attempted.`);
      } else if (creditTracker.shouldStop(options.maxApolloCredits)) {
        brief.push(`Our Apollo fallback was stopped early because the batch hit its credit cap of ${options.maxApolloCredits}.`);
      } else if (redConfidence) {
        brief.push(`SMTP pattern verification returned red confidence (the patterns we tested did not respond), and Apollo did not return a usable contact match either.`);
      } else {
        brief.push(`Neither SMTP pattern verification nor Apollo contact match returned an email we trust.`);
      }
      brief.push(`Recommendation: surface to the AE for manual lookup, or revisit when a new email-find technique (e.g., LinkedIn-Sales-Navigator-bridge, web-scrape enrichment, Apollo upgrade) comes online — re-run this prospect with --include-flagged.`);
      result.flag_reason_brief = brief.join(' ').slice(0, 2000);

      console.log(`  flag: ${result.flag_reason_short}`);
    }
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
          // Directory integration 2026-06-11: when directory has a canonical_name
          // for this prospect's company, substrate query keys on it instead of
          // raw row.company. Closes substrate-keying mismatch (Google-GFiber).
          companyAlias: directoryHint?.canonical_name,
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

  // Phase 3.5: Substrate refutation (Phase C activation 2026-06-09 evening)
  // ---------------------------------------------------------------------
  // After substrate is pulled but BEFORE compose, ask: "does the substrate
  // refute this frame's premise?" — and on halt, route the prospect to
  // send_status='flag' with a system_brief that names the refuter claims.
  //
  // Frame selection: default-frame per ICP type. Operator can later refine
  // based on persona_bucket or BEAD-state context. This activation closes
  // the ALLO/Finley fabrication class — see verified-claim-library-B-* docs.
  //   fiber_operator → bead_timeline_v1 (BEAD obligations on the clock)
  //   ae_firm        → gis_pain_v1      (GIS-to-CAD friction)
  if (result.icp_type && !result.refutation_frame) {
    result.refutation_frame = result.icp_type === 'fiber_operator'
      ? 'bead_timeline_v1'
      : 'gis_pain_v1';
  }
  if (result.icp_type && result.dossier && result.refutation_frame) {
    try {
      const prospectId = `${row.firstName}-${row.lastName}-${row.company}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      const refResult = await checkSubstrateRefutation(
        {
          id: prospectId,
          company_normalized: row.company.toLowerCase().trim(),
        },
        result.refutation_frame,
        { runId: options.runId },
      );
      result.refutation_result = refResult;
      console.log(
        `  refutation: ${refResult.status}` +
          (refResult.status === 'swap'
            ? ` (${result.refutation_frame} → ${refResult.alternative}, method=${refResult.method})`
            : refResult.status === 'halt'
              ? ` (reason=${refResult.reason}, refuters=${refResult.refuters.length})`
              : ''),
      );
    } catch (err) {
      result.errors.push(`refutation: ${(err as Error).message}`);
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

  // Phase 4.5: Tiered judge (items 7+8 — synthesis 2026-06-09 + halluc 2026-06-09 PM)
  // T1 mechanical regex (instant, $0) -> T2 Tim-style edit-patterns (instant, $0)
  // -> T3 Gemini quality judge (~10s, ~$0.005) for borderline cases only
  // -> T3 Gemini hallucination check (~10s, ~$0.005) ALWAYS-ON for every prospect.
  // Result.judge_action drives send_status:
  //   'ship'               -> send_status='pending', composed email proceeds
  //   'flag'               -> send_status='flag' (quality borderline), human review
  //   'flag-hallucination' -> send_status='flag' (unsupported claims found), human review
  //   'retry'              -> best-of-N composer upstream already handles. If we land
  //                            here, composer exhausted retries — treat as flag.
  if (result.composed) {
    try {
      // Flatten substrate claims across all categories + generalized framing.
      // Hallucination check grounds the email against ONLY what the composer saw.
      const substrateClaims: EvidenceRecord[] = [];
      if (result.dossier) {
        for (const cat of Object.keys(result.dossier.claims) as Array<keyof typeof result.dossier.claims>) {
          substrateClaims.push(...result.dossier.claims[cat]);
        }
        substrateClaims.push(...result.dossier.generalizedFraming);
      }

      const judgeResult = await runTieredJudgeOnProspect(
        result.composed,
        {
          firstName: row.firstName,
          lastName: row.lastName,
          company: row.company,
          title: row.title || '',
          state: row.state,
        },
        {
          substrateClaims,
        },
      );
      result.judge_result = judgeResult;
      result.judge_action = judgeResult.action;
      result.send_status =
        judgeResult.action === 'ship' ? 'pending'
        : 'flag'; // 'flag' | 'flag-hallucination' | 'retry' all collapse to flag here
      console.log(
        `  judge: T1=${judgeResult.tier1.pass ? 'pass' : 'fail'} T2=${judgeResult.tier2.score}/5` +
        (judgeResult.tier3 ? ` T3=${judgeResult.tier3.verdict}` : '') +
        (judgeResult.tier3Hallucination ? ` H=${judgeResult.tier3Hallucination.verdict}` : '') +
        ` -> ${judgeResult.action} (${judgeResult.rationale})`,
      );
      // Item 8 monitoring — track rolling rates and write JUDGE-ALERT.md if tripped
      judgeMonitor(options.prospectIdx, judgeResult);
    } catch (err) {
      result.errors.push(`judge: ${(err as Error).message}`);
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
// Item 9 (2026-06-09) — Plain-English System Brief for flagged prospects
// ----------------------------------------------------------------------------
//
// Operator rule (verbatim 2026-06-09):
//   "Regardless of how we set this up, the rule of thumb is that everything
//    that's an ICP needs to make it into the Portal for the human to see.
//    But if it hasn't passed our full pipeline then it gets a Status of Flag
//    in there and in the System Brief you explain, plain english no jargon,
//    why it failed and any recommendations you have"
//
// This replaces the prior machine-y debug content with operator-readable
// 2-3 sentence explanations, each ending with a recommendation for what
// technique would unblock the prospect in a future run.
//
// Coordination note for items 5/6/7/8: this function writes to a field
// named `system_brief` on sr_engine_output (and the same field on
// sr_prospects). Sibling items can read this field name and wire UI later.

/**
 * Decide whether a prospect should be flagged for human review.
 *
 * A prospect is flagged when it's an ICP but did NOT pass the full
 * pipeline. Reasons cascade in priority order — the most blocking issue
 * wins so the brief explains the actual root cause, not a downstream
 * symptom.
 */
function classifyFlagReason(
  result: ProspectResult,
):
  | 'compose_failed'
  | 'compose_violations'
  | 'hallucination'
  | 'substrate_refuted'
  | 'email_red'
  | 'email_guessed_only'
  | 'research_low'
  | 'none' {
  // Phase C halt — substrate refuted the chosen frame and no safe alt
  // existed. This is the audit's "halt → system_brief" wiring (fresh-eyes
  // 2026-06-09 §"Integration handoff"). Highest priority below compose
  // because the refutation gate runs PRE-compose; if it halted, there is
  // no email to evaluate further.
  if (result.refutation_result?.status === 'halt') return 'substrate_refuted';

  // Composer errors trump everything — without an email body, the
  // portal has nothing to show the human.
  if (result.errors.some(e => e.startsWith('compose:'))) return 'compose_failed';
  if (!result.composed) return 'compose_failed';

  // Hallucination check (always-on Tier 3, added 2026-06-09 PM). This is
  // a content-safety signal — if the email cites facts the substrate
  // doesn't support, route to human even if every other gate passes.
  if (result.judge_action === 'flag-hallucination') return 'hallucination';

  // Compose-time quality violations — tier-1 (banned phrases, em-dash,
  // word count, paragraph count, company-name) or tier-2 (peer-feel score
  // below ship threshold). Without this case, judge_action='retry' and
  // judge_action='flag' produce send_status='flag' with an empty
  // system_brief — the operator sees a mystery flag with no reason. Added
  // 2026-06-10 after the ICP fix unmasked this edge case (Amanda Griffith
  // at 123Net in run v2-mq7mxgmx: T1 fail, 1 violation, empty brief).
  if (result.judge_action === 'retry' || result.judge_action === 'flag') {
    return 'compose_violations';
  }

  // Email confidence next — a 'red' confidence means we never produced
  // a usable address.
  const conf = (result.email_confidence || '').toLowerCase();
  if (!result.email_found || conf === 'red' || conf === 'not-found') return 'email_red';

  // 'guessed' = Apollo peer-pattern derived. Usable but unverified —
  // operator should know before send.
  if (conf === 'guessed' || conf === 'amber') return 'email_guessed_only';

  // ICP volume verdict is INFORM-ONLY per SoT §15 and the original
  // feature commit 734f731b7 ("inform-only label, not a gate"). Verdict
  // + reasoning are persisted to sr_engine_output.icp_volume_verdict and
  // .icp_volume_reasoning for display in the detail panel — they do NOT
  // cause a flag. Previously a leaning_fit verdict gated 64% of cold
  // cohort prospects into 'flag' status (smoke run v2-mq7lm7h8, 9 of 14
  // landed prospects flagged ONLY for leaning_fit). Removed 2026-06-10.

  // Low research quality — composer ran in generalized mode without
  // company-specific claims.
  if (result.research_quality === 'low' || result.composer_mode === 'generalized') {
    return 'research_low';
  }

  return 'none';
}

/**
 * generateFlagSystemBrief — Plain-English 2-3 sentence explanation of
 * why a prospect was flagged, ending with a recommendation.
 *
 * No jargon. No internal IDs. No tier labels. Written for an operator
 * who's reviewing the portal and decides whether to send, hold, or
 * route to another path.
 */
export function generateFlagSystemBrief(result: ProspectResult): string {
  const reason = classifyFlagReason(result);
  const firstName = result.row.firstName;
  const company = result.row.company;

  switch (reason) {
    case 'substrate_refuted': {
      // Phase C halt — name the refuter claims so the operator can see WHY
      // the substrate killed the frame, and what the original frame was.
      const ref = result.refutation_result;
      const refuters: Refuter[] =
        ref && ref.status === 'halt' ? ref.refuters : [];
      const reason = ref && ref.status === 'halt' ? ref.reason : 'unknown';
      const method = ref && ref.status === 'halt' ? ref.method : 'unknown';
      const claimList = refuters.length === 0
        ? 'no specific refuter claims captured'
        : refuters
            .slice(0, 3)
            .map(r => `"${r.claim}" (${r.source_citation || 'no citation'})`)
            .join('; ');
      const reasonHuman =
        reason === 'refuted_no_safe_alt'
          ? 'the substrate evidence directly contradicted the angle we picked, and no materially-different alternative passed its own check'
          : reason === 'insufficient_evidence'
            ? 'this frame requires substrate evidence we never found for this company'
            : reason === 'judge_unavailable'
              ? 'the semantic refutation judge timed out or failed and we fail-closed rather than risk a fabricated email'
              : 'an internal refutation gate decision';
      return (
        `The substrate-refutation gate halted ${firstName} at ${company} before composing — ${reasonHuman} (method=${method}, frame=${result.refutation_frame ?? 'unknown'}). ` +
        `Refuter claims: ${claimList}. ` +
        `Recommendation: either select a different frame for this prospect (Phase B can re-route to a non-refuted angle), or hand-write a message that explicitly acknowledges the refuting context. Do not auto-send — that's the ALLO/Finley fabrication class.`
      );
    }
    case 'compose_failed': {
      const composeErr = result.errors.find(e => e.startsWith('compose:'));
      const detail = composeErr ? composeErr.replace(/^compose:\s*/, '') : 'no email body produced';
      return (
        `The composer could not produce a clean email for ${firstName} at ${company} after 4 attempts. ` +
        `Specific issue: ${detail}. ` +
        `Recommendation: hand-write this one or wait until we tune the compose constraints — likely a banned-phrase or paragraph-count violation the model can't self-correct on this prospect's evidence set.`
      );
    }
    case 'hallucination': {
      // Always-on Tier 3 cross-family judge found factual claims in the email
      // body that the substrate evidence doesn't support. Name them in the
      // brief so the operator knows exactly what to verify (or strip).
      const halluc = result.judge_result?.tier3Hallucination;
      const claims = halluc?.unsupportedClaims ?? [];
      const claimsList = claims.length === 0
        ? 'no specific claims listed (verdict was a fail with empty list — treat as cautionary)'
        : claims.slice(0, 3).map(c => `"${c}"`).join('; ');
      const reasoning = halluc?.reasoning ? ` Reviewer reasoning: ${halluc.reasoning}.` : '';
      return (
        `The email for ${firstName} at ${company} cites one or more factual claims that our substrate evidence does not clearly support: ${claimsList}.${reasoning} ` +
        `Recommendation: either rewrite the email to remove those specifics and stick to industry framing the operator can defend, or verify the claims against a primary source (their website, press, BDC filing) before sending. Sending unverified specifics on cold outbound damages trust faster than a generic email does.`
      );
    }
    case 'email_red': {
      const tactics = result.email_tactics_attempted || [];
      const tacticCount = tactics.length;
      const pathBSource = result.email_path_b_source || '';
      const pathBNote = result.email_path_b_attempted
        ? (pathBSource === 'apollo:no-match'
            ? `Apollo's contact database also had no record of this person at this company`
            : pathBSource === 'apollo:error'
              ? `Apollo's lookup errored out before returning a result`
              : `the Apollo fallback came back empty`)
        : `we did not run the Apollo fallback (credit cap or skip flag)`;
      return (
        `Email could not be verified for ${firstName} at ${company} — we tried ${tacticCount} domain and pattern variation${tacticCount === 1 ? '' : 's'} via SMTP probe, and ${pathBNote}. ` +
        `Recommendation: this prospect may be using a personal email or be a recent hire not yet in directories. Revisit when we add LinkedIn pattern derivation as a Path B+ technique, or pull the email manually from a sales-tool sign-in if available.`
      );
    }
    case 'email_guessed_only': {
      const pathBSource = result.email_path_b_source || '';
      const verifiedHint = pathBSource === 'apollo:peer-pattern'
        ? `we derived it from how their colleagues' emails are formatted, but no peer at this company was verified to confirm the exact pattern is current`
        : `we have a likely format but no verified peer at the company to confirm it`;
      return (
        `Email for ${firstName} at ${company} is a best-guess pattern — ${verifiedHint}. ` +
        `Recommendation: this can be sent at lower priority with the understanding bounces will happen. Long-term fix: enrich the peer pattern check to verify against 2+ active inboxes at this company before promoting to "verified."`
      );
    }
    // 'icp_leaning_fit' case removed 2026-06-10 — verdict is inform-only
    // per SoT §15; it no longer reaches the brief generator. The verdict
    // and reasoning are displayed via the ICP Volume Verdict card in the
    // detail panel, sourced directly from sr_engine_output.icp_volume_*.
    case 'compose_violations': {
      const jr = result.judge_result;
      const t1 = jr?.tier1;
      const t2 = jr?.tier2;
      const t1ViolationCount = t1?.violations?.length ?? 0;
      const t1ViolationsList = (t1?.violations || []).slice(0, 3).map((v: string) => `"${v}"`).join(', ');
      const t2Score = t2?.score ?? 'n/a';
      const judgeAction = result.judge_action || 'unknown';

      if (judgeAction === 'retry' && t1ViolationCount > 0) {
        return (
          `The email for ${firstName} at ${company} failed our tier-1 quality check after 4 composer attempts: ${t1ViolationCount} violation${t1ViolationCount === 1 ? '' : 's'} ${t1ViolationsList ? `(${t1ViolationsList})` : ''}. ` +
          `Recommendation: review the body, manually edit to remove the flagged content (banned phrases, em-dashes, word count, or company-name mismatches), or hand-write a replacement. Long-term fix: tune the composer prompt to avoid the recurring violation pattern.`
        );
      }
      return (
        `The email for ${firstName} at ${company} did not clear our tier-2 quality bar (peer-feel score ${t2Score}/5; ship threshold higher). ` +
        `Recommendation: review the body for tone (does it sound like a peer fiber AE writing or a vendor pitch?), and either approve, edit, or hand-write a sharper version. Long-term fix: surface what tier-2 specifically scored low on so we can iterate the composer prompt.`
      );
    }
    case 'research_low': {
      const tierCounts = result.dossier?.tierCounts;
      const directCount = tierCounts?.useDirectly ?? 0;
      const shapeCount = tierCounts?.useToShape ?? 0;
      return (
        `The composer wrote a generalized email for ${firstName} at ${company} because we only found ${directCount} hard fact${directCount === 1 ? '' : 's'} and ${shapeCount} contextual signal${shapeCount === 1 ? '' : 's'} about this company — not enough to write a fully specific message. ` +
        `Recommendation: this is fine to send if the operator wants volume, but a 5-10 minute LinkedIn or company-news scan would surface enough to upgrade it to a specific email. Long-term fix: expand the substrate sources we pull from for sub-100-location operators.`
      );
    }
    case 'none':
    default: {
      // Should never reach here when called from a flag branch — but
      // provide a graceful fallback in case sibling items wire this
      // differently than expected.
      return (
        `${firstName} at ${company} cleared the mechanical pipeline but was flagged for human review. ` +
        `Recommendation: spot-check the composed email and approve or edit before sending.`
      );
    }
  }
}

/**
 * Should this prospect be flagged (send_status='flag') for human review?
 * True when the prospect is an ICP pass but did NOT clear the full
 * pipeline cleanly.
 */
function shouldFlag(result: ProspectResult): boolean {
  if (result.icp_verdict !== 'pass') return false;
  return classifyFlagReason(result) !== 'none';
}

// ----------------------------------------------------------------------------
// Supabase persistence (direct write to sr_engine_output)
// ----------------------------------------------------------------------------

/**
 * Fix #3 (2026-06-10 operator directive): resolve claim_ids referenced in
 * email body sentences to their full citation objects in sr_company_evidence,
 * so the audit trail lives alongside the email body in sr_engine_output
 * instead of forcing a join through research_summary.body_sentences.
 *
 * Output shape: { [claim_id]: { claim, source_kind, source_citation, speaker_name, speaker_role } }
 * Pure additive — does not change body_sentences or composer output.
 */
async function resolveCitationProvenance(
  bodySentences: Array<{ text: string; claim_ids?: string[] }> | undefined,
  sbUrl: string,
  sbKey: string,
): Promise<Record<string, Record<string, unknown>>> {
  if (!bodySentences || !Array.isArray(bodySentences)) return {};
  const ids = Array.from(new Set(
    bodySentences.flatMap(s => s.claim_ids || []).filter(Boolean),
  ));
  if (ids.length === 0) return {};
  try {
    const inList = ids.map(id => encodeURIComponent(id)).join(',');
    const r = await fetch(
      `${sbUrl}/rest/v1/sr_company_evidence?id=in.(${inList})&select=id,claim,source_kind,source_citation,speaker_name,speaker_role,category`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (!r.ok) return {};
    const rows = (await r.json()) as Array<{
      id: string; claim: string; source_kind: string; source_citation: string;
      speaker_name: string | null; speaker_role: string | null; category: string;
    }>;
    const out: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      out[row.id] = {
        claim: row.claim,
        source_kind: row.source_kind,
        source_citation: row.source_citation,
        speaker_name: row.speaker_name,
        speaker_role: row.speaker_role,
        category: row.category,
      };
    }
    return out;
  } catch {
    return {};
  }
}

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

  // Persona bucket — uses canonical detectPersona() from influence.ts which
  // uses two-token regex pairs (leadership word + domain word). Correctly
  // disambiguates "Director of Engineering" → technical_designer vs
  // "Director of Construction" → ops_builder, etc. Extended 2026-06-09 to
  // include AI/innovation/data/platform domain words for cases like
  // "Head of AI & Innovation".
  const personaBucket: string = detectPersona(result.row.title || '');
  const meddpiccDecisionCriteria =
    /chief|vp|svp|ceo/i.test(result.row.title || '') ? 'Speed-to-revenue; capital efficiency; competitive market capture' :
    /director|head|ops|operation/i.test(result.row.title || '') ? 'Drawing throughput; permitting speed; crew utilization; design capacity' :
    /engineer|technical|designer/i.test(result.row.title || '') ? 'GIS-to-CAD traceability; design tool integration; data accuracy; workforce scaling' :
    '';

  // Unified send_status resolution (2026-06-09 red-team CRITICAL #4 fix).
  // Three flag sources + one production gate, ALL converge here to a SINGLE
  // finalSendStatus value that both sr_engine_output AND sr_prospects write —
  // no more table-level disagreement.
  //
  // Priority order (most-authoritative wins):
  //   1. Tiered judge action (items 7+8) — set via result.send_status
  //   2. Email-find flag pattern (item 6) — result.flag_status when red/no-email
  //   3. System-brief flag (item 9) — shouldFlag(result) for any ICP-pass + pipeline-incomplete
  //   4. Production email gate (Fix #1 2026-06-10) — amber/red email + NOT operator-locked → 'hold'
  //
  // Operator rule (2026-06-10): pattern-guess emails must NOT ship. Only green-
  // verified (Apollo high or MV-confirmed) or operator-locked (email_corrected=true)
  // emails reach 'pending'. Everything else goes to 'hold' (back-pocket queue).
  // 'flag' still wins over 'hold' because flag means active issue, hold means
  // email-axis queue waiting for back-pocket recovery.
  const flagged = shouldFlag(result);
  const systemBrief = flagged ? generateFlagSystemBrief(result) : null;

  // Fix #1 (2026-06-10): is the operator already pre-verified this email?
  // Check sr_prospects.email_corrected BEFORE finalSendStatus — bypasses the
  // production gate when the operator has manually verified the email.
  let preCheckOperatorLocked = false;
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/sr_prospects?id=eq.${encodeURIComponent(prospectId)}&select=email_corrected`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (r.ok) {
      const rows = (await r.json()) as Array<{ email_corrected: boolean | null }>;
      preCheckOperatorLocked = rows.length > 0 && rows[0].email_corrected === true;
    }
  } catch { /* best-effort; if check fails, gate engages */ }

  // Email confidence is green only when the pipeline finds 'high' (Apollo people-match
  // or MV-verified). 'medium' (Apollo medium), 'guessed' (peer-pattern), and 'red'
  // (no email) all fail the production gate.
  const emailIsGreen = result.email_confidence === 'high';
  const productionGateFails = !emailIsGreen && !preCheckOperatorLocked;

  const finalSendStatus: 'pending' | 'flag' | 'hold' =
    result.send_status === 'flag' ? 'flag' :  // tiered judge wins
    result.flag_status ? 'flag' :              // email-find pattern
    flagged ? 'flag' :                          // system-brief shouldFlag
    productionGateFails ? 'hold' :              // Fix #1 production email gate
    'pending';

  const body: Record<string, unknown> = {
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
    // Path 1 (2026-06-09): map 'guessed' to amber (a step below yellow), not red.
    // 'guessed' = Apollo peer-pattern derived (verified pattern, applied to prospect).
    // Not as strong as Apollo people-match (high → green) or SMTP verified (yellow),
    // but more usable than red (= no email at all).
    confidence_color: result.email_confidence === 'high' ? 'green'
      : result.email_confidence === 'medium' ? 'yellow'
      : result.email_confidence === 'guessed' ? 'amber'
      : 'red',
    confidence_score: result.email_confidence_score ?? null,
    icp_volume_verdict: result.icp_volume_verdict || null,
    icp_volume_reasoning: result.dossier?.icp_volume_reasoning || null,
    // MEDDPICC + intel_* derived from dossier
    persona_bucket: personaBucket,
    intel_signal_strength: intelSignalStrength,
    intel_fit_rationale: intelFitRationale,
    meddpicc_identified_pain: meddpiccPain || null,
    meddpicc_decision_criteria: meddpiccDecisionCriteria || null,
    // Item 9: plain-english explanation for portal operator review.
    system_brief: systemBrief,
    send_status: finalSendStatus,  // unified — same value as sr_prospects below
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
      // Fix #3 (2026-06-10): denormalize citation provenance from sr_company_evidence.
      // Each claim_id referenced in body_sentences resolves to a full citation object
      // (claim text, source kind, source URL, speaker name/role). Audit trail lives
      // inline so verifying email grounding doesn't require a sr_company_evidence join.
      citations: await resolveCitationProvenance(result.composed?.bodySentences, sbUrl, sbKey),
      apollo_credits_used: result.apollo_credits_used,
      flag_status: result.flag_status || false,
    }),
  };

  // Send-confidence axes (v1.0-uncalibrated, 2026-06-10 — spec at
  // docs/showrev/send-confidence-system-spec-2026-06-10.md). Surfaces
  // 3-axis breakdown + composite so operators can dispute strict/lenient calls.
  // Reuses existing tierCounts from line 762 above.
  body.send_confidence = computeSendConfidence({
    icp_status: result.icp_verdict,
    icp_volume_verdict: result.icp_volume_verdict,
    persona_bucket: personaBucket,
    intel_signal_strength: intelSignalStrength,
    email: result.email_found,
    confidence_color: body.confidence_color as string,
    system_brief: systemBrief,
    use_directly_count: tierCounts?.useDirectly ?? null,
    use_to_shape_count: tierCounts?.useToShape ?? null,
    composer_mode: result.composer_mode,
    intel_talking_points: meddpiccDecisionCriteria || meddpiccPain || null,
  }) as unknown as Record<string, unknown>;

  // Item 6 (2026-06-09): flag-status pattern — populate ae_flag (terse) and
  // company_summary (System Brief, plain English) so the portal expand-view
  // shows the WHY and the AE knows what to do.
  if (result.flag_status) {
    body.ae_flag = result.flag_reason_short || 'Email find exhausted.';
    body.company_summary = result.flag_reason_brief || result.flag_reason_short || '';
  }

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

  // Item 6 (2026-06-09): flagged prospects still auto-promote to sr_prospects
  // so they appear in the portal for human review — but with send_status='flag'
  // (not 'pending') so the AE knows the pipeline could not complete and the
  // System Brief on sr_engine_output.company_summary explains why.
  //
  // FIX 2026-06-10 (operator directive: "don't overwrite good emails"):
  // BEFORE writing prospectBody, check if sr_prospects.email is operator-locked
  // (email_corrected=true). If yes, OMIT email from the upsert so we don't
  // clobber the operator's manual research. Sibling fix to the email-find
  // precheck at line ~213.
  // Fetch existing sr_prospects.email + email_corrected. If email_corrected=true,
  // we use the EXISTING email (not result.email_found) so the upsert never
  // clobbers operator-set values. Defensive — the precheck at line ~213 should
  // have already set result.email_found = existing email, but in edge cases
  // (precheck fails, race condition, etc.) this is the belt-and-suspenders.
  let operatorLockedEmail: string | null = null;
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/sr_prospects?id=eq.${encodeURIComponent(prospectId)}&select=email,email_corrected`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (r.ok) {
      const rows = (await r.json()) as Array<{ email: string | null; email_corrected: boolean | null }>;
      if (rows.length > 0 && rows[0].email_corrected === true && rows[0].email && rows[0].email.includes('@')) {
        operatorLockedEmail = rows[0].email;
        console.log(`[persist] sr_prospects.email_corrected=true → using operator-locked email ${operatorLockedEmail} (not result.email_found=${result.email_found})`);
      }
    }
  } catch {
    // best-effort; if check fails, fall through to result.email_found
  }

  const prospectBody: Record<string, unknown> = {
    id: prospectId,
    first_name: result.row.firstName,
    last_name: result.row.lastName,
    // operator-locked wins; otherwise use what the pipeline found
    email: operatorLockedEmail || result.email_found || '',
    title: result.row.title || '',
    state: result.row.state || '',
    company: result.row.company,
    lead_type: 'Cold',
    tier: 'A',
    campaign: 'P2',
    // Unified resolution — same value as sr_engine_output above.
    // See finalSendStatus block ~line 631 for priority order.
    send_status: finalSendStatus,
    // Fix #1 (2026-06-10): skip_reason is ALWAYS in the body. When status='hold'
    // we set the back-pocket queue explanation; otherwise NULL clears any stale
    // value from a previous run. This is the ghost-risk fix per DB-FIELD-AUDIT
    // 2026-06-10 — without this, an old 'hold' skip_reason would persist after
    // a new run that produces 'pending'.
    skip_reason: finalSendStatus === 'hold'
      ? `Email confidence is ${result.email_confidence || 'unknown'} (production gate requires green or operator-verified). Queued for back-pocket email recovery (FCC 499 / NTCA / PUC / press releases). Override by setting email_corrected=true after manual verification.`
      : null,
    system_brief: systemBrief,
    // DB integrity audit 2026-06-09: persona_bucket was on engine but not
    // on prospects (98% NULL). Portal reads it from prospects too.
    persona_bucket: personaBucket,
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

  const persona = detectPersona(result.row.title || '');
  const icpType = (result.icp_type === 'ae_firm' ? 'ae_firm' : 'fiber_operator') as 'fiber_operator' | 'ae_firm';

  // Option A microsite content — LLM-generated headline + bloom (operator-approved 2026-06-09).
  // Template renders: <p>{headline} <span class="bloom">{insight_text}</span></p>
  // where the bloom span fades in on scroll for dynamic effect.
  // Falls back to templated content if LLM call fails (graceful degradation).
  let headline: string;
  let insightText: string;
  if (result.dossier) {
    try {
      const microsite = await composeMicrosite({
        prospect: { firstName: result.row.firstName, lastName: result.row.lastName, company: result.row.company, title: result.row.title || '', state: result.row.state || '' },
        persona,
        icpType,
        dossier: result.dossier,
        emailBody: result.composed.body || '',
        emailSubject: result.composed.subject || '',
      });
      headline = microsite.headline;
      insightText = microsite.bloom_text;
    } catch (err) {
      console.warn(`  ⚠ microsite-composer fallback to templated: ${(err as Error).message}`);
      headline = MICROSITE_HEADLINE_BY_PERSONA[persona] || MICROSITE_HEADLINE_BY_PERSONA.ops_builder;
      insightText = buildMicrositeInsight(icpType, persona, result.row.company);
    }
  } else {
    headline = MICROSITE_HEADLINE_BY_PERSONA[persona] || MICROSITE_HEADLINE_BY_PERSONA.ops_builder;
    insightText = buildMicrositeInsight(icpType, persona, result.row.company);
  }
  const caseStudyText = icpType === 'fiber_operator' ? CASE_STUDY_FIBER_OPERATOR : CASE_STUDY_AE_FIRM;

  const aeDetail = getAEDetails(result.ae.name);
  const prospectId = `${result.row.firstName}-${result.row.lastName}-${result.row.company}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  // Resolve company logo via 5-source PNG waterfall (logo.dev primary —
  // returns transparent PNG by default; ops want transparent for microsite).
  // Probes in parallel, returns first valid. Fails gracefully to null —
  // microsite renders text fallback when logo absent.
  let companyLogoUrl: string | null = null;
  if (result.email_found) {
    const domain = result.email_found.split('@')[1];
    if (domain) {
      try {
        companyLogoUrl = await resolveCompanyLogo(domain);
      } catch (err) {
        console.warn(`  ⚠ logo resolution failed: ${(err as Error).message}`);
      }
    }
  }

  const micrositeRow = {
    slug: result.micrositeSlug,
    prospect_id: prospectId,
    company_name: result.row.company,
    company_logo_url: companyLogoUrl,
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
  const flagged = results.filter(r => r.flag_status).length;
  const totalApolloCredits = results.reduce((s, r) => s + (r.apollo_credits_used || 0), 0);

  console.log(`  Total prospects:     ${results.length}`);
  console.log(`  ICP passed:          ${passed.length}/${results.length}`);
  console.log(`  Emails found:        ${emailFound}/${results.length}`);
  console.log(`  Flagged (no email):  ${flagged}/${results.length}`);
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
// Flagged-prospect skip helper (Item 6 — 2026-06-09)
// ----------------------------------------------------------------------------
//
// Reads sr_prospects.id where send_status='flag'. Returned as a Set so the
// input CSV can be filtered in O(1) per row. Failure mode is permissive:
// if the read fails, return an empty set (don't block the whole run).

async function fetchFlaggedProspectIds(): Promise<Set<string>> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return new Set();
  try {
    const ids = new Set<string>();
    // PostgREST defaults to 1000-row limit; page through if needed.
    let offset = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${sbUrl}/rest/v1/sr_prospects?send_status=eq.flag&select=id&limit=${pageSize}&offset=${offset}`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      );
      if (!res.ok) {
        console.warn(`[flag-skip] sr_prospects read ${res.status} — proceeding without flag-skip`);
        return ids;
      }
      const page = (await res.json()) as Array<{ id: string }>;
      for (const r of page) ids.add(r.id);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return ids;
  } catch (err) {
    console.warn(`[flag-skip] read error: ${(err as Error).message} — proceeding without flag-skip`);
    return new Set();
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
      // Red-team #8 (2026-06-09): cap MillionVerifier credits per run.
      // Default 200 covers the 163 credits on hand at the time of the finding
      // with a small buffer. Set to 0 to disable the cap.
      'max-mv-credits': { type: 'string' },
      verbose: { type: 'boolean', default: false, short: 'v' },
      limit: { type: 'string' },
      // Item 6 (2026-06-09): when set, include prospects that already have
      // send_status='flag' in sr_prospects. Default behavior is to skip them
      // so flagged prospects don't get re-burned through the pipeline on every
      // run. Operator turns this on for the future "we developed a new
      // email-find technique, re-run the parking lot" bulk pass.
      'include-flagged': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const inputPath = values.input as string;
  if (!inputPath) {
    console.error('Usage: --input <csv-path> [--skip-apollo] [--max-apollo-credits N] [--max-mv-credits N] [--verbose] [--limit N] [--include-flagged]');
    process.exit(1);
  }

  const csvText = readFileSync(resolve(inputPath), 'utf-8');
  let rows = parseCsv(csvText);
  if (values.limit) {
    rows = rows.slice(0, parseInt(values.limit as string, 10));
  }

  // Item 6 (2026-06-09): default-skip prospects already in sr_prospects with
  // send_status='flag'. CLI override --include-flagged bypasses the skip for
  // bulk re-runs after a new email-find technique comes online.
  const includeFlagged = !!values['include-flagged'];
  if (!includeFlagged) {
    const flaggedIds = await fetchFlaggedProspectIds();
    if (flaggedIds.size > 0) {
      const before = rows.length;
      rows = rows.filter(r => {
        const id = `${r.firstName}-${r.lastName}-${r.company}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        return !flaggedIds.has(id);
      });
      const skipped = before - rows.length;
      if (skipped > 0) {
        console.log(`  flag-skip: ${skipped} prospect(s) skipped (already flagged in sr_prospects; pass --include-flagged to re-run)`);
      }
    }
  } else {
    console.log(`  --include-flagged: previously-flagged prospects will be re-processed`);
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
  // Red-team #8 (2026-06-09): default 200 covers 163-credit standing balance + buffer.
  // Pass --max-mv-credits 0 to disable the cap entirely.
  const maxMvCredits = values['max-mv-credits'] !== undefined
    ? parseInt(values['max-mv-credits'] as string, 10)
    : 200;
  console.log(`  MV budget: ${maxMvCredits > 0 ? `${maxMvCredits} credits` : 'UNCAPPED'}`);
  console.log(`  Flag-skip: ${includeFlagged ? 'OFF (--include-flagged set)' : 'ON (default; pass --include-flagged to re-run flagged)'}`);
  console.log('='.repeat(70));

  const creditTracker = new ApolloCreditTracker();
  const mvCreditTracker = new MvCreditTracker(maxMvCredits);
  resetJudgeMonitor(); // item 8: fresh rolling rates per pipeline run
  const t0 = Date.now();
  const results: ProspectResult[] = [];

  // Directory integration 2026-06-11: load once at startup, pass through to every prospect.
  // Misses (companies not in directory) gracefully fall through to legacy behavior in processOne.
  const directory = loadDirectory();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const result = await processOne(
        row,
        {
          skipApollo: !!values['skip-apollo'],
          maxApolloCredits,
          runId,
          verbose: !!values.verbose,
          prospectIdx: i,
          directory,
        },
        creditTracker,
        mvCreditTracker,
      );
      results.push(result);
    } catch (err) {
      // Gates audit 2026-06-09: a fatal exception in processOne used to make the
      // prospect silently disappear from BOTH summary AND DB. Now we synthesize
      // a flag-status row so the operator can see + retry. Plain-English brief
      // explains the technical error in operator terms.
      const errMsg = (err as Error).message || 'unknown error';
      console.error(`  FATAL on ${row.firstName} ${row.lastName}: ${errMsg}`);
      const ae = resolveAE(row.state);
      results.push({
        row,
        ae,
        micrositeSlug: `${row.company}-${row.firstName}-${row.lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        icp_verdict: 'pass',
        flag_status: true,
        send_status: 'flag',
        flag_reason_short: 'Pipeline error',
        flag_reason_brief: `The pipeline could not finish processing this prospect because of a technical error: ${errMsg.slice(0, 200)}. Recommendation: re-run with --include-flagged once the underlying issue is resolved, or hand-research and add directly to HubSpot.`,
        confidence_color: 'red',
        durations_ms: { total: 0 },
        errors: [`fatal: ${errMsg}`],
      } as ProspectResult);
    }
  }

  printSummary(results, runId, Date.now() - t0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
