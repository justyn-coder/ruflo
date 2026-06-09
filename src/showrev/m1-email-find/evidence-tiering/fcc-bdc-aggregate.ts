/**
 * FCC BDC pre-aggregator — streams per-state Fiber CSV files, builds
 * per-(provider, state) location counts, writes to fcc_bdc_provider_summary.
 *
 * Skips fcc_bdc_coverage (15M+ per-location rows would take ~25 min via REST).
 * The composer only needs aggregates for volume signals (locations served,
 * state footprint, growth trajectory across snapshots).
 *
 * For our immediate use case this is the right shape — per-location detail
 * can be loaded later if we need census-block queries.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/fcc-bdc-aggregate.ts
 */

import { createReadStream, readdirSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname, join } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

const RAW_DIR = resolve(__dirname, '../../../../data/fcc-bdc/raw');
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Snapshot date is encoded in filename: D25_27may2026 = D25 (Dec 2025 snapshot)
// Use 2025-12-31 as the snapshot date (FCC convention)
const SNAPSHOT_DATE = '2025-12-31';

function normalizeProvider(brandName: string): string {
  return brandName
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|cooperative|coop|co-op|lp|llp|gmbh|ag)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ProviderAgg {
  provider_id: string;
  brand_name: string;
  provider_normalized: string;
  state: string;
  locations_served: Set<string>;  // unique location_ids
  block_geoids: Set<string>;
}

async function aggregateFile(filePath: string, aggregates: Map<string, ProviderAgg>): Promise<void> {
  console.log(`  Streaming ${filePath.split('/').pop()}...`);
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNum = 0;
  let processed = 0;
  let headers: string[] = [];
  let iFrn = -1, iProvId = -1, iBrand = -1, iLocId = -1, iState = -1, iBlock = -1, iTech = -1;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) {
      headers = line.split(',').map(h => h.trim().toLowerCase());
      iFrn = headers.indexOf('frn');
      iProvId = headers.indexOf('provider_id');
      iBrand = headers.indexOf('brand_name');
      iLocId = headers.indexOf('location_id');
      iState = headers.indexOf('state_usps');
      iBlock = headers.indexOf('block_geoid');
      iTech = headers.indexOf('technology');
      continue;
    }
    if (!line.trim()) continue;
    const fields = line.split(',');
    const tech = fields[iTech]?.trim();
    if (tech !== '50') continue; // fiber only (defensive — file is already fiber-filtered)
    const providerId = fields[iProvId]?.trim();
    const brandName = fields[iBrand]?.trim();
    const state = fields[iState]?.trim();
    const locId = fields[iLocId]?.trim();
    const block = fields[iBlock]?.trim();
    if (!providerId || !brandName || !state || !locId) continue;

    const key = `${providerId}|${state}`;
    let agg = aggregates.get(key);
    if (!agg) {
      agg = {
        provider_id: providerId,
        brand_name: brandName,
        provider_normalized: normalizeProvider(brandName),
        state,
        locations_served: new Set(),
        block_geoids: new Set(),
      };
      aggregates.set(key, agg);
    }
    agg.locations_served.add(locId);
    if (block) agg.block_geoids.add(block);
    processed++;
    if (processed % 500000 === 0) {
      process.stdout.write(`\r    ${processed.toLocaleString()} rows, ${aggregates.size} provider+state combos`);
    }
  }
  console.log(`\r    ${processed.toLocaleString()} rows, ${aggregates.size} provider+state combos`);
}

interface SummaryRow {
  provider_normalized: string;
  snapshot_date: string;
  technology_code: number;
  locations_served: number;
  state_count: number;
  census_block_count: number;
}

async function writeSummary(rows: SummaryRow[]): Promise<{ ok: number; fail: number }> {
  const payload = rows.map(r => ({
    provider_normalized: r.provider_normalized,
    snapshot_date: r.snapshot_date,
    technology_code: r.technology_code,
    locations_served: r.locations_served,
    state_count: r.state_count,
    census_block_count: r.census_block_count,
  }));
  // Upsert via on_conflict on the PK (provider_normalized, snapshot_date, technology_code)
  try {
    const res = await fetch(`${SB_URL}/rest/v1/fcc_bdc_provider_summary?on_conflict=provider_normalized,snapshot_date,technology_code`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: payload.length, fail: 0 };
    const text = await res.text();
    console.warn(`Write failed: ${res.status} ${text.slice(0, 200)}`);
    return { ok: 0, fail: payload.length };
  } catch (err) {
    return { ok: 0, fail: payload.length };
  }
}

async function main() {
  console.log('================================================');
  console.log('  FCC BDC pre-aggregator');
  console.log('================================================');

  if (!SB_KEY) {
    console.error('Supabase key missing');
    process.exit(1);
  }

  const fiberFiles = readdirSync(RAW_DIR).filter(f =>
    f.endsWith('.csv') && f.includes('FibertothePremises'),
  );
  if (fiberFiles.length === 0) {
    console.error(`No fiber CSV files in ${RAW_DIR}`);
    process.exit(1);
  }
  console.log(`Found ${fiberFiles.length} fiber files`);

  // Stage 1: stream all files into in-memory (provider, state) aggregates
  const aggregates = new Map<string, ProviderAgg>();
  for (const f of fiberFiles) {
    await aggregateFile(join(RAW_DIR, f), aggregates);
  }
  console.log(`Total (provider, state) combos: ${aggregates.size}`);

  // Stage 2: collapse to per-provider rows (sum locations across states)
  const byProvider = new Map<string, {
    provider_normalized: string;
    locations: number;
    states: Set<string>;
    blocks: Set<string>;
  }>();
  for (const agg of aggregates.values()) {
    const key = agg.provider_normalized;
    let p = byProvider.get(key);
    if (!p) {
      p = {
        provider_normalized: key,
        locations: 0,
        states: new Set(),
        blocks: new Set(),
      };
      byProvider.set(key, p);
    }
    p.locations += agg.locations_served.size;
    p.states.add(agg.state);
    agg.block_geoids.forEach(b => p!.blocks.add(b));
  }
  console.log(`Unique providers (post-aggregation): ${byProvider.size}`);

  // Stage 3: build summary rows + write
  const summaryRows: SummaryRow[] = [];
  for (const p of byProvider.values()) {
    if (!p.provider_normalized) continue;
    summaryRows.push({
      provider_normalized: p.provider_normalized,
      snapshot_date: SNAPSHOT_DATE,
      technology_code: 50,
      locations_served: p.locations,
      state_count: p.states.size,
      census_block_count: p.blocks.size,
    });
  }

  console.log(`Writing ${summaryRows.length} summary rows...`);
  const CHUNK = 500;
  let totalOk = 0;
  let totalFail = 0;
  for (let i = 0; i < summaryRows.length; i += CHUNK) {
    const slice = summaryRows.slice(i, i + CHUNK);
    const { ok, fail } = await writeSummary(slice);
    totalOk += ok;
    totalFail += fail;
    process.stdout.write(`\r  ${Math.min(i + CHUNK, summaryRows.length)}/${summaryRows.length} (${totalOk} ok, ${totalFail} fail)`);
  }
  console.log('');

  // Show top-10 providers by location count
  const top = summaryRows
    .sort((a, b) => b.locations_served - a.locations_served)
    .slice(0, 10);
  console.log('');
  console.log('Top-10 providers by fiber locations served:');
  for (const t of top) {
    console.log(`  ${t.locations_served.toLocaleString().padStart(10)} | ${t.state_count} states | ${t.provider_normalized}`);
  }

  console.log('');
  console.log('================================================');
  console.log(`  ${totalOk.toLocaleString()} provider summaries written`);
  console.log(`  ${summaryRows.length.toLocaleString()} unique providers (5 states only)`);
  console.log(`  Snapshot: ${SNAPSHOT_DATE}`);
  console.log('================================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
