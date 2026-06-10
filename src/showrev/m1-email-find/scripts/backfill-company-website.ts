/**
 * backfill-company-website.ts (2026-06-10)
 *
 * Backfill canonical company_website for sr_prospects rows where it's null.
 * Uses the same company-resolver the pipeline uses at Phase 0.5, so the
 * canonical URLs match what new pipeline runs will write.
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-company-website.ts            # dry-run
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-company-website.ts --live     # actually write
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-company-website.ts --live --lead-type Cold
 *
 * Safety:
 *   - Only updates rows where company_website is NULL or empty. Never overwrites
 *     a value already set (covers manual operator patches like Amanda's).
 *   - Skips low-confidence resolutions (resolver returns 'low' or canonical_url=null).
 *   - Logs each decision so the operator can audit what got written.
 *   - Sequential by default to be polite to the LLM API; pass --concurrency N for parallel.
 */

import 'dotenv/config';
import { resolveCompany } from '../evidence-tiering/company-resolver.js';

const LIVE = process.argv.includes('--live');
const LEAD_TYPE_ARG = process.argv.find(a => a.startsWith('--lead-type='))?.split('=')[1] || 'Cold';
const CONCURRENCY_ARG = process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1];
const CONCURRENCY = CONCURRENCY_ARG ? parseInt(CONCURRENCY_ARG, 10) : 4;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Source src/showrev/.env first.');
  process.exit(1);
}

interface Prospect {
  id: string;
  company: string | null;
  state: string | null;
  company_website: string | null;
}

async function fetchTargets(): Promise<Prospect[]> {
  const url = `${SUPABASE_URL}/rest/v1/sr_prospects?lead_type=eq.${LEAD_TYPE_ARG}&or=(company_website.is.null,company_website.eq.)&select=id,company,state,company_website&order=id`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetch failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as Prospect[];
}

async function writeWebsite(id: string, url: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/sr_prospects?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ company_website: url }),
  });
  if (!r.ok) throw new Error(`write failed for ${id}: ${r.status} ${await r.text()}`);
}

function normalizeUrl(domain: string): string {
  let d = domain.trim().toLowerCase();
  // Strip scheme if accidentally included
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  return `https://${d}`;
}

async function isUrlReachable(url: string): Promise<boolean> {
  // LLM can produce typo'd domains (e.g. bostonomeahabroadband.com instead of
  // bostonomahabroadband.com). Cheap HEAD probe with short timeout filters them.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    return r.ok || (r.status >= 300 && r.status < 400);
  } catch {
    clearTimeout(t);
    return false;
  }
}

async function processOne(p: Prospect): Promise<{ id: string; verdict: string; url: string | null; reason: string }> {
  if (!p.company || p.company.trim() === '') {
    return { id: p.id, verdict: 'skip', url: null, reason: 'no company name' };
  }
  const ctx = await resolveCompany(p.company, p.state || undefined);
  if (!ctx.canonical_url) {
    return { id: p.id, verdict: 'no-url', url: null, reason: `${ctx.business_type}/${ctx.business_type_confidence}: ${ctx.reason.slice(0, 80)}` };
  }
  // Low-confidence resolver output is risky — skip
  if (ctx.business_type_confidence === 'low' || ctx.business_type === 'unknown') {
    return { id: p.id, verdict: 'low-conf', url: ctx.canonical_url, reason: `${ctx.business_type}/${ctx.business_type_confidence}` };
  }
  const url = normalizeUrl(ctx.canonical_url);
  // Filter out LLM typos by probing the URL before writing
  const reachable = await isUrlReachable(url);
  if (!reachable) {
    return { id: p.id, verdict: 'unreachable', url, reason: `${ctx.business_type}/${ctx.business_type_confidence} — URL probe failed` };
  }
  if (LIVE) {
    try {
      await writeWebsite(p.id, url);
      return { id: p.id, verdict: 'wrote', url, reason: `${ctx.business_type}/${ctx.business_type_confidence}` };
    } catch (err) {
      return { id: p.id, verdict: 'err', url, reason: (err as Error).message };
    }
  }
  return { id: p.id, verdict: 'would-write', url, reason: `${ctx.business_type}/${ctx.business_type_confidence}` };
}

async function runWithConcurrency<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  console.log(`[backfill-website] mode=${LIVE ? 'LIVE' : 'dry-run'} lead-type=${LEAD_TYPE_ARG} concurrency=${CONCURRENCY}`);
  const targets = await fetchTargets();
  console.log(`[backfill-website] fetched ${targets.length} rows needing canonical website`);

  const results = await runWithConcurrency(targets, CONCURRENCY, processOne);

  const buckets = { wrote: 0, 'would-write': 0, 'low-conf': 0, 'no-url': 0, skip: 0, err: 0 } as Record<string, number>;
  for (const r of results) buckets[r.verdict] = (buckets[r.verdict] || 0) + 1;

  console.log('\n=== Verdict counts ===');
  for (const [k, v] of Object.entries(buckets)) {
    if (v > 0) console.log(`  ${k.padEnd(12)} ${v}`);
  }

  // Show the writes / would-writes
  const written = results.filter(r => r.verdict === 'wrote' || r.verdict === 'would-write');
  if (written.length > 0) {
    console.log(`\n=== ${LIVE ? 'Wrote' : 'Would write'} (${written.length}) ===`);
    for (const r of written.slice(0, 50)) {
      console.log(`  ${r.id.padEnd(50)} → ${r.url}`);
    }
    if (written.length > 50) console.log(`  ... and ${written.length - 50} more`);
  }

  // Show low-confidence skips (operator may want to review these)
  const lowConf = results.filter(r => r.verdict === 'low-conf');
  if (lowConf.length > 0) {
    console.log(`\n=== Low-confidence — review manually (${lowConf.length}) ===`);
    for (const r of lowConf) {
      console.log(`  ${r.id.padEnd(50)} → ${r.url || '(no url)'} [${r.reason}]`);
    }
  }

  // Show errors
  const errs = results.filter(r => r.verdict === 'err');
  if (errs.length > 0) {
    console.log(`\n=== Errors (${errs.length}) ===`);
    for (const r of errs) console.log(`  ${r.id}: ${r.reason}`);
  }

  console.log(`\n[backfill-website] done. ${LIVE ? 'Wrote' : 'Would write'} ${buckets['wrote'] || buckets['would-write'] || 0} canonical URLs.`);
}

main().catch(err => {
  console.error('[backfill-website] error:', err);
  process.exit(1);
});
