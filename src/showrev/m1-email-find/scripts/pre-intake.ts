/**
 * pre-intake.ts (2026-06-11)
 *
 * PRE-INTAKE QUEUE for the main pipeline. Lives OUTSIDE the runtime pipeline
 * loop. Processes prospects sitting in intake_status='pending' or with stale
 * substrate, then promotes them to intake_status='ready' so the main pipeline
 * only processes prepared prospects.
 *
 * Architecture (operator-approved 2026-06-11):
 *
 *   ┌─────────────┐   ┌──────────────┐   ┌────────────────┐
 *   │  New        │   │  Pre-intake  │   │  Main pipeline │
 *   │  prospects  │──→│  daemon      │──→│  (ICP, email,  │
 *   │  arrive     │   │  (this file) │   │  composer)     │
 *   └─────────────┘   └──────────────┘   └────────────────┘
 *        pending          enriching             ready
 *
 * What this script does per pass:
 *   1. Find prospects with intake_status='pending' OR intake_last_enriched_at
 *      NULL/older than STALE_DAYS days OR company has zero sr_company_evidence
 *      claims
 *   2. For each unique company in the queue:
 *      a. Verify company_website is set (skip if missing — operator must fix)
 *      b. Fire enrich-substrate-news for that company (via dynamic --only list)
 *      c. Update intake_last_enriched_at on all prospects for that company
 *      d. Promote intake_status='enriching' → 'ready'
 *   3. Log results
 *
 * Modes:
 *   --once       : run one pass + exit (default — good for cron / RemoteTrigger)
 *   --loop       : continuous loop with POLL_INTERVAL_SEC between passes
 *   --dry-run    : report what WOULD be done, no writes
 *   --gap-only   : only enrich companies that have ZERO evidence claims today
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/scripts/pre-intake.ts                  # one pass
 *   npx tsx src/showrev/m1-email-find/scripts/pre-intake.ts --loop           # continuous
 *   npx tsx src/showrev/m1-email-find/scripts/pre-intake.ts --dry-run        # preview
 *   npx tsx src/showrev/m1-email-find/scripts/pre-intake.ts --gap-only       # close today's gap
 */

import 'dotenv/config';
import { spawn } from 'child_process';

const STALE_DAYS = 14; // re-enrich substrate every 14 days
const POLL_INTERVAL_SEC = 600; // 10 min between loop passes
const DRY_RUN = process.argv.includes('--dry-run');
const LOOP = process.argv.includes('--loop');
const GAP_ONLY = process.argv.includes('--gap-only');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env. Source src/showrev/.env first.');
  process.exit(1);
}

interface Prospect {
  id: string;
  company: string;
  company_website: string | null;
  intake_status: string | null;
  intake_last_enriched_at: string | null;
}

async function fetchQueue(): Promise<Prospect[]> {
  const staleDate = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // intake_status NULL or 'pending' OR last enriched > STALE_DAYS ago
  const filter = `or=(intake_status.is.null,intake_status.eq.pending,intake_last_enriched_at.lt.${staleDate})`;
  const url = `${SUPABASE_URL}/rest/v1/sr_prospects?lead_type=eq.Cold&${filter}&select=id,company,company_website,intake_status,intake_last_enriched_at`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetch queue failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as Prospect[];
}

async function fetchEvidenceCount(companyName: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/sr_company_evidence?company_name=eq.${encodeURIComponent(companyName)}&select=id`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) return 0;
  return ((await r.json()) as unknown[]).length;
}

async function setIntakeStatus(prospectIds: string[], status: string, enrichedAt?: boolean): Promise<void> {
  if (prospectIds.length === 0) return;
  for (const id of prospectIds) {
    const body: Record<string, unknown> = { intake_status: status };
    if (enrichedAt) body.intake_last_enriched_at = new Date().toISOString();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sr_prospects?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error(`  PATCH ${id}: ${r.status}`);
  }
}

function runEnrichment(companyNormalizedList: string[]): Promise<{ ok: boolean; summary: string }> {
  return new Promise((resolve) => {
    if (companyNormalizedList.length === 0) {
      resolve({ ok: true, summary: 'no companies to enrich' });
      return;
    }
    const onlyArg = `--only=${companyNormalizedList.map((c) => c.replace(/\s+/g, '-')).join(',')}`;
    const args = ['tsx', 'src/showrev/m1-email-find/scripts/enrich-substrate-news.ts', '--live', onlyArg];
    console.log(`  → spawn: npx ${args.join(' ')}`);
    const child = spawn('npx', args, { cwd: process.cwd(), env: process.env });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });
    child.on('close', (code) => {
      const lines = stdout.split('\n');
      const wroteLines = lines.filter((l) => /wrote\s+\d+/.test(l)).slice(-companyNormalizedList.length);
      resolve({ ok: code === 0, summary: wroteLines.join('\n  ') || `exit=${code}` });
    });
  });
}

async function processOnePass(): Promise<void> {
  console.log(`\n=== Pre-intake pass at ${new Date().toISOString()} ===`);
  const queue = await fetchQueue();
  console.log(`Queue size: ${queue.length} prospects`);

  if (queue.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  // Group prospects by company (unique enrichment unit)
  const byCompany: Record<string, Prospect[]> = {};
  for (const p of queue) {
    if (!p.company) continue;
    if (!byCompany[p.company]) byCompany[p.company] = [];
    byCompany[p.company].push(p);
  }
  const companies = Object.keys(byCompany).sort();
  console.log(`Unique companies in queue: ${companies.length}`);

  // Filter — gap-only mode skips companies with existing evidence
  const toEnrich: string[] = [];
  const skipped: string[] = [];
  for (const c of companies) {
    if (GAP_ONLY) {
      const count = await fetchEvidenceCount(c);
      if (count > 0) {
        skipped.push(`${c} (already ${count} claims)`);
        // Still mark ready (substrate exists, just not refreshed today)
        if (!DRY_RUN) await setIntakeStatus(byCompany[c].map((p) => p.id), 'ready', true);
        continue;
      }
    }
    // Verify company_website (required by enrichment script)
    const hasWebsite = byCompany[c].some((p) => p.company_website);
    if (!hasWebsite) {
      skipped.push(`${c} (no company_website — operator must set)`);
      if (!DRY_RUN) await setIntakeStatus(byCompany[c].map((p) => p.id), 'failed');
      continue;
    }
    toEnrich.push(c);
  }

  console.log(`  to enrich: ${toEnrich.length}  |  skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    console.log('  skipped reasons:');
    for (const s of skipped.slice(0, 10)) console.log(`    ${s}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] would enrich:');
    for (const c of toEnrich) console.log(`  ${c}`);
    return;
  }

  if (toEnrich.length === 0) {
    console.log('Nothing to enrich this pass.');
    return;
  }

  // Mark enriching
  const allIds = toEnrich.flatMap((c) => byCompany[c].map((p) => p.id));
  await setIntakeStatus(allIds, 'enriching');

  // Fire enrichment in chunks of 10 to keep each spawn manageable
  for (let i = 0; i < toEnrich.length; i += 10) {
    const chunk = toEnrich.slice(i, i + 10);
    console.log(`\n[chunk ${Math.floor(i / 10) + 1}/${Math.ceil(toEnrich.length / 10)}] ${chunk.length} companies`);
    const result = await runEnrichment(chunk);
    console.log(`  result: ${result.summary.slice(0, 200)}`);
    // Mark ready (regardless of per-company success — enrichment script logs its own per-company verdicts)
    const chunkIds = chunk.flatMap((c) => byCompany[c].map((p) => p.id));
    await setIntakeStatus(chunkIds, 'ready', true);
  }

  console.log(`\n=== Pass complete. Enriched ${toEnrich.length} companies, promoted ${allIds.length} prospects to ready ===`);
}

async function main() {
  console.log(`[pre-intake] mode=${LOOP ? 'LOOP' : 'ONCE'} dry-run=${DRY_RUN} gap-only=${GAP_ONLY}`);
  console.log(`[pre-intake] staleDays=${STALE_DAYS} pollIntervalSec=${POLL_INTERVAL_SEC}`);

  if (LOOP) {
    while (true) {
      try {
        await processOnePass();
      } catch (err) {
        console.error(`pass failed: ${(err as Error).message}`);
      }
      console.log(`\nSleeping ${POLL_INTERVAL_SEC}s until next pass...`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_SEC * 1000));
    }
  } else {
    await processOnePass();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
