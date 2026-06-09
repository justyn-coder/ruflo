#!/usr/bin/env npx tsx
/**
 * apollo-bulk-rescue.ts
 *
 * Post-cohort rescue sweep using Apollo's bulk_match endpoint.
 *
 * Why this exists:
 *   Apollo's per-prospect /people/match (used during the cohort run via
 *   apollo-fallback.ts → apolloPeopleMatch) and /people/bulk_match use
 *   DIFFERENT internal matching algorithms. bulk_match sometimes lands
 *   matches that single-match misses, at a meaningfully cheaper per-credit
 *   cost. Expected lift on a normal red-heavy cohort is 2-5 net green.
 *
 * Flow:
 *   1. Query sr_engine_output WHERE run_id = $runId
 *        AND confidence_color = 'red'
 *        AND first_name != 'Sample'      (defensive — skip test rows)
 *   2. Group prospects into batches of 10 (Apollo bulk_match cap).
 *   3. POST /api/v1/people/bulk_match with the batch.
 *   4. For each newly matched person, UPDATE sr_engine_output:
 *        - email                = matched email
 *        - confidence_color     = green (verified/valid) | yellow (unverified)
 *        - confidence_score     = 0.95 | 0.65
 *   5. Track credits used + dollars spent via ApolloCreditTracker.
 *
 * Idempotent: only operates on rows where confidence_color is still 'red'.
 * Re-running after a successful sweep is a no-op for the just-rescued rows
 * because they have already been lifted to yellow/green.
 *
 * CLI:
 *   npx tsx src/showrev/m1-email-find/email-finder/apollo-bulk-rescue.ts \
 *     --run-id v2-mq6mto4c
 *     [--dry-run]                   # show what would happen, no API or DB writes
 *     [--skip-apollo]                # honor caller's Apollo cap (no-op rescue)
 *     [--max-credits N]              # ceiling — stop if we'd exceed it
 *     [--verbose]
 *
 * Programmatic:
 *   import { runBulkRescue } from './apollo-bulk-rescue.js';
 *   const { rescued, credits } = await runBulkRescue(runId, {
 *     skipApollo: false, dryRun: false,
 *   });
 */

import { parseArgs } from 'node:util';
import { config as loadEnv } from 'dotenv';

import { ApolloCreditTracker, normalizeForApollo } from '../evidence-tiering/apollo-client.js';

// Load .env relative to this file (matches the pattern used by sibling
// scripts like run-verification-sweep.ts).
loadEnv({ path: new URL('../.env', import.meta.url).pathname });

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://slttpknnuthbttjuzrnz.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const APOLLO_BULK_MATCH_URL = 'https://api.apollo.io/api/v1/people/bulk_match';
const APOLLO_BULK_BATCH_SIZE = 10; // Apollo cap per bulk_match call
const APOLLO_TIMEOUT_MS = 30_000;

// ----------------------------------------------------------------------------
// Row + result shapes
// ----------------------------------------------------------------------------

interface RedRow {
  id: string;
  prospect_id: string;
  run_id: string;
  first_name: string;
  last_name: string;
  company: string;
  email: string | null;
  confidence_color: string;
}

interface BulkMatchPerson {
  index?: number;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  email_status?: string;
  title?: string | null;
  linkedin_url?: string | null;
  organization?: { name?: string; primary_domain?: string };
}

interface BulkMatchResponse {
  status?: string;
  error_code?: string | null;
  total_credits_consumed?: number;
  matches?: Array<BulkMatchPerson | null>;
}

interface RescueOutcome {
  rowId: string;
  prospect: string;
  company: string;
  email: string | null;
  confidence_color: 'green' | 'yellow' | 'red';
  confidence_score: number | null;
  status: 'rescued' | 'no-match' | 'skipped' | 'error';
  note?: string;
}

export interface RunBulkRescueOptions {
  skipApollo: boolean;
  dryRun: boolean;
  /** Optional ceiling — abort batches once cumulative credits reach this. */
  maxCredits?: number;
  /** Verbose per-row logging. */
  verbose?: boolean;
}

export interface RunBulkRescueResult {
  rescued: number;
  credits: number;
  estimatedDollars: string;
  totalRed: number;
  batches: number;
  outcomes: RescueOutcome[];
}

// ----------------------------------------------------------------------------
// Supabase helpers (PostgREST direct — same shape used elsewhere)
// ----------------------------------------------------------------------------

function sbHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function fetchRedRows(runId: string): Promise<RedRow[]> {
  if (!SUPABASE_KEY) {
    throw new Error('No Supabase key — set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const select =
    'id,prospect_id,run_id,first_name,last_name,company,email,confidence_color';
  const url =
    `${SUPABASE_URL}/rest/v1/sr_engine_output` +
    `?run_id=eq.${encodeURIComponent(runId)}` +
    `&confidence_color=eq.red` +
    `&first_name=neq.Sample` +
    `&select=${encodeURIComponent(select)}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as RedRow[];
}

async function patchEngineOutput(
  rowId: string,
  patch: { email: string; confidence_color: 'green' | 'yellow'; confidence_score: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { ok: false, error: 'No Supabase key' };
  const url = `${SUPABASE_URL}/rest/v1/sr_engine_output?id=eq.${encodeURIComponent(rowId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Apollo bulk_match call
// ----------------------------------------------------------------------------

interface BulkMatchInput {
  first_name: string;
  last_name: string;
  organization_name: string;
}

async function callApolloBulkMatch(
  details: BulkMatchInput[],
  apiKey: string,
): Promise<BulkMatchResponse | null> {
  try {
    const res = await fetch(APOLLO_BULK_MATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      // Apollo's bulk_match accepts `details: [...]`. We also pass
      // `reveal_personal_emails: false` to avoid extra credit cost; the
      // pipeline only ever wants business emails.
      body: JSON.stringify({
        details,
        reveal_personal_emails: false,
      }),
      signal: AbortSignal.timeout(APOLLO_TIMEOUT_MS),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(
        `[apollo-bulk-rescue] HTTP ${res.status}: ${txt.slice(0, 200)}`,
      );
      return null;
    }
    return (await res.json()) as BulkMatchResponse;
  } catch (err) {
    console.warn(
      `[apollo-bulk-rescue] request error: ${(err as Error).message}`,
    );
    return null;
  }
}

// ----------------------------------------------------------------------------
// Confidence mapping (Apollo email_status → our color/score)
// ----------------------------------------------------------------------------

function mapApolloStatusToColor(
  emailStatus: string | undefined,
): { color: 'green' | 'yellow'; score: number } {
  const s = (emailStatus || '').toLowerCase();
  if (s === 'verified' || s === 'valid') {
    return { color: 'green', score: 0.95 };
  }
  // unverified / unknown / blank → yellow (still better than red)
  return { color: 'yellow', score: 0.65 };
}

// ----------------------------------------------------------------------------
// Core: runBulkRescue
// ----------------------------------------------------------------------------

export async function runBulkRescue(
  runId: string,
  options: RunBulkRescueOptions,
): Promise<RunBulkRescueResult> {
  const tracker = new ApolloCreditTracker();
  const outcomes: RescueOutcome[] = [];

  const redRows = await fetchRedRows(runId);
  const totalRed = redRows.length;
  if (options.verbose) {
    console.log(
      `[apollo-bulk-rescue] run_id=${runId}: ${totalRed} red prospects`,
    );
  }

  if (totalRed === 0) {
    return {
      rescued: 0,
      credits: 0,
      estimatedDollars: '0.0000',
      totalRed: 0,
      batches: 0,
      outcomes: [],
    };
  }

  if (options.skipApollo) {
    if (options.verbose) {
      console.log('[apollo-bulk-rescue] --skip-apollo set, no-op');
    }
    return {
      rescued: 0,
      credits: 0,
      estimatedDollars: '0.0000',
      totalRed,
      batches: 0,
      outcomes: redRows.map(r => ({
        rowId: r.id,
        prospect: `${r.first_name} ${r.last_name}`,
        company: r.company,
        email: r.email,
        confidence_color: 'red',
        confidence_score: null,
        status: 'skipped',
        note: 'skipApollo=true',
      })),
    };
  }

  const apiKey = process.env.APOLLO_API_KEY || '';
  if (!options.dryRun && !apiKey) {
    throw new Error(
      'APOLLO_API_KEY missing — set it in env or pass --dry-run',
    );
  }

  // Pre-filter rows we can't form a bulk_match request from. Apollo needs
  // first + last + company; defensive against any pipeline rows that slipped
  // in without one of those.
  const usableRows = redRows.filter(
    r => r.first_name && r.last_name && r.company,
  );
  const skipped = redRows.length - usableRows.length;
  if (skipped > 0 && options.verbose) {
    console.log(
      `[apollo-bulk-rescue] ${skipped} row(s) missing first/last/company — skipped`,
    );
  }

  let rescued = 0;
  let batchesRun = 0;

  for (let i = 0; i < usableRows.length; i += APOLLO_BULK_BATCH_SIZE) {
    const batch = usableRows.slice(i, i + APOLLO_BULK_BATCH_SIZE);

    // Credit cap check BEFORE the request goes out.
    if (tracker.shouldStop(options.maxCredits)) {
      if (options.verbose) {
        console.log(
          `[apollo-bulk-rescue] credit cap ${options.maxCredits} reached after ${tracker.total()} credits — stopping`,
        );
      }
      for (const r of batch) {
        outcomes.push({
          rowId: r.id,
          prospect: `${r.first_name} ${r.last_name}`,
          company: r.company,
          email: r.email,
          confidence_color: 'red',
          confidence_score: null,
          status: 'skipped',
          note: 'credit cap',
        });
      }
      continue;
    }

    const details: BulkMatchInput[] = batch.map(r => ({
      first_name: r.first_name,
      last_name: r.last_name,
      organization_name: normalizeForApollo(r.company),
    }));

    if (options.dryRun) {
      console.log(
        `[DRY RUN] Would call bulk_match with ${details.length} prospect(s):`,
      );
      for (const d of details) {
        console.log(`    - ${d.first_name} ${d.last_name} @ ${d.organization_name}`);
      }
      for (const r of batch) {
        outcomes.push({
          rowId: r.id,
          prospect: `${r.first_name} ${r.last_name}`,
          company: r.company,
          email: r.email,
          confidence_color: 'red',
          confidence_score: null,
          status: 'skipped',
          note: 'dry-run',
        });
      }
      batchesRun++;
      continue;
    }

    const resp = await callApolloBulkMatch(details, apiKey);
    batchesRun++;

    if (!resp) {
      for (const r of batch) {
        outcomes.push({
          rowId: r.id,
          prospect: `${r.first_name} ${r.last_name}`,
          company: r.company,
          email: r.email,
          confidence_color: 'red',
          confidence_score: null,
          status: 'error',
          note: 'apollo error',
        });
      }
      continue;
    }

    // Apollo returns credit usage explicitly. Fall back to assuming 1 per
    // matched row if the field is missing.
    const credits =
      typeof resp.total_credits_consumed === 'number'
        ? resp.total_credits_consumed
        : (resp.matches || []).filter(m => m && m.email).length;
    tracker.add(credits);

    const matches = resp.matches || [];

    // Apollo returns matches in the same order as the input `details` array.
    // When a prospect doesn't match, the entry is null or has no email.
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const match = matches[j];

      if (!match || !match.email) {
        outcomes.push({
          rowId: row.id,
          prospect: `${row.first_name} ${row.last_name}`,
          company: row.company,
          email: row.email,
          confidence_color: 'red',
          confidence_score: null,
          status: 'no-match',
        });
        if (options.verbose) {
          console.log(
            `    - no match: ${row.first_name} ${row.last_name} @ ${row.company}`,
          );
        }
        continue;
      }

      const { color, score } = mapApolloStatusToColor(match.email_status);
      const email = match.email.toLowerCase();
      const patch = {
        email,
        confidence_color: color,
        confidence_score: score,
      };

      const res = await patchEngineOutput(row.id, patch);
      if (!res.ok) {
        outcomes.push({
          rowId: row.id,
          prospect: `${row.first_name} ${row.last_name}`,
          company: row.company,
          email,
          confidence_color: 'red',
          confidence_score: null,
          status: 'error',
          note: `db patch failed: ${res.error || 'unknown'}`,
        });
        continue;
      }

      rescued++;
      outcomes.push({
        rowId: row.id,
        prospect: `${row.first_name} ${row.last_name}`,
        company: row.company,
        email,
        confidence_color: color,
        confidence_score: score,
        status: 'rescued',
        note: `email_status=${match.email_status || 'unknown'}`,
      });
      if (options.verbose) {
        console.log(
          `    + rescued: ${row.first_name} ${row.last_name} @ ${row.company} → ${email} (${color})`,
        );
      }
    }
  }

  return {
    rescued,
    credits: tracker.total(),
    estimatedDollars: tracker.estimatedDollars(),
    totalRed,
    batches: batchesRun,
    outcomes,
  };
}

// ----------------------------------------------------------------------------
// CLI entry point
// ----------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'run-id': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'skip-apollo': { type: 'boolean', default: false },
      'max-credits': { type: 'string' },
      verbose: { type: 'boolean', default: false, short: 'v' },
    },
    strict: false,
  });

  const runId = values['run-id'] as string | undefined;
  if (!runId) {
    console.error(
      'Usage: apollo-bulk-rescue --run-id <id> [--dry-run] [--skip-apollo] [--max-credits N] [--verbose]',
    );
    process.exit(1);
  }

  const maxCredits = values['max-credits']
    ? parseInt(values['max-credits'] as string, 10)
    : undefined;

  console.log('='.repeat(70));
  console.log('  Apollo bulk_match rescue sweep');
  console.log(`  Run ID:        ${runId}`);
  console.log(`  Mode:          ${values['dry-run'] ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Skip Apollo:   ${values['skip-apollo'] ? 'yes' : 'no'}`);
  if (maxCredits) console.log(`  Max credits:   ${maxCredits}`);
  console.log('='.repeat(70));

  const t0 = Date.now();
  const result = await runBulkRescue(runId, {
    skipApollo: !!values['skip-apollo'],
    dryRun: !!values['dry-run'],
    maxCredits,
    verbose: !!values.verbose,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('');
  console.log('-'.repeat(70));
  console.log(`  Total red prospects:   ${result.totalRed}`);
  console.log(`  Batches called:        ${result.batches}`);
  console.log(`  Rescued (red→amber+):  ${result.rescued}`);
  console.log(`  Apollo credits used:   ${result.credits} (~$${result.estimatedDollars})`);
  console.log(`  Elapsed:               ${elapsed}s`);
  console.log('-'.repeat(70));

  if (values.verbose) {
    const rescuedRows = result.outcomes.filter(o => o.status === 'rescued');
    if (rescuedRows.length > 0) {
      console.log('\n  Rescued rows:');
      for (const r of rescuedRows) {
        console.log(
          `    ${r.prospect} @ ${r.company} → ${r.email} (${r.confidence_color})`,
        );
      }
    }
  }
}

// Run only if invoked directly (npx tsx apollo-bulk-rescue.ts ...)
const isDirect = (() => {
  try {
    const argv1 = process.argv[1] ?? '';
    return argv1.endsWith('apollo-bulk-rescue.ts') ||
      argv1.endsWith('apollo-bulk-rescue.js');
  } catch {
    return false;
  }
})();

if (isDirect) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
