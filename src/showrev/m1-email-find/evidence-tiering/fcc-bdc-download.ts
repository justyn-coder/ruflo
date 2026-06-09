/**
 * FCC BDC bulk download + parse + load.
 *
 * Two paths supported:
 *
 * PATH A — API token (preferred, programmatic):
 *   Operator generates token at bdc.fcc.gov → Manage API Access → Generate
 *   (requires agreeing to FCC disclaimer text).
 *   Export FCC_BDC_API_TOKEN=<token>
 *   Run: npx tsx fcc-bdc-download.ts
 *
 * PATH B — manual download (fallback):
 *   Operator downloads ZIP files from broadbandmap.fcc.gov/data-download
 *   (select state, technology=Fiber, as-of-date=latest), saves to
 *   data/fcc-bdc/raw/.
 *   Run: npx tsx fcc-bdc-download.ts --skip-download
 *
 * Either path → CSV parser → load to fcc_bdc_coverage +
 * fcc_bdc_provider_summary.
 *
 * NOTE: Single nationwide fiber-only snapshot is ~5-8 GB. We don't pull
 * all technologies (cable/DSL irrelevant to ICP). Per-state fiber files
 * are ~50-300 MB each — manageable.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, createReadStream, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

const RAW_DIR = resolve(__dirname, '../../../../data/fcc-bdc/raw');
const TOKEN = process.env.FCC_BDC_API_TOKEN || '';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// FCC BDC API endpoints (per https://www.fcc.gov/sites/default/files/bdc-public-data-api-spec.pdf)
const BDC_API_BASE = 'https://broadbandmap.fcc.gov/nbm/map/api';
const FILE_LIST_ENDPOINT = `${BDC_API_BASE}/published/files`;
const FILE_DOWNLOAD_ENDPOINT = `${BDC_API_BASE}/published/file`;

interface BDCFile {
  file_id: string;
  state_name?: string;
  state_fips?: string;
  technology_code?: number;
  as_of_date: string;
  file_name: string;
  file_size: number;
}

// ----------------------------------------------------------------------------
// Path A — API list + download
// ----------------------------------------------------------------------------

async function listAvailableFiles(): Promise<BDCFile[]> {
  if (!TOKEN) throw new Error('FCC_BDC_API_TOKEN required for PATH A');
  // List published files, filter to latest snapshot + fiber
  const res = await fetch(`${FILE_LIST_ENDPOINT}?category=Nationwide&subcategory=Fixed_Broadband`, {
    headers: {
      'username': 'apikey',  // FCC BDC uses HTTP Basic with username=apikey, password=token
      'hash_value': TOKEN,
    },
  });
  if (!res.ok) {
    throw new Error(`FCC BDC API list failed: ${res.status} ${await res.text()}`);
  }
  return await res.json() as BDCFile[];
}

async function downloadFile(file: BDCFile): Promise<string> {
  if (!TOKEN) throw new Error('FCC_BDC_API_TOKEN required');
  const url = `${FILE_DOWNLOAD_ENDPOINT}/${encodeURIComponent(file.file_id)}/${encodeURIComponent(file.file_name)}`;
  const outPath = join(RAW_DIR, file.file_name);
  if (existsSync(outPath)) {
    const stat = statSync(outPath);
    if (stat.size === file.file_size) {
      console.log(`  ${file.file_name}: already downloaded (${(stat.size / 1e6).toFixed(1)} MB)`);
      return outPath;
    }
  }
  console.log(`  ${file.file_name}: downloading (${(file.file_size / 1e6).toFixed(1)} MB)...`);
  const res = await fetch(url, {
    headers: { 'username': 'apikey', 'hash_value': TOKEN },
  });
  if (!res.ok) throw new Error(`Download ${file.file_id}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const { writeFileSync } = await import('fs');
  writeFileSync(outPath, Buffer.from(buf));
  return outPath;
}

// ----------------------------------------------------------------------------
// Parse CSV → fcc_bdc_coverage rows
// ----------------------------------------------------------------------------

interface CoverageRow {
  provider_id: string;
  provider_name: string;
  location_id: string;
  state: string;
  county_fips: string;
  census_block: string;
  technology_code: number;
  max_down_mbps: number;
  max_up_mbps: number;
  service_tier: string;
  snapshot_date: string;
}

function normalize(s: string): string {
  return s.trim().replace(/^"|"$/g, '');
}

async function parseAndLoad(csvPath: string, snapshotDate: string): Promise<{ rows: number; providers: Set<string> }> {
  console.log(`  Parsing ${csvPath}...`);
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return { rows: 0, providers: new Set() };

  const header = lines[0].split(',').map(normalize).map(s => s.toLowerCase());
  const idx = (name: string) => header.findIndex(h => h === name.toLowerCase());

  const iProviderId = idx('frn') !== -1 ? idx('frn') : idx('provider_id');
  const iProviderName = idx('brand_name') !== -1 ? idx('brand_name') : idx('provider_name');
  const iLocationId = idx('location_id');
  const iCensusBlock = idx('block_geoid') !== -1 ? idx('block_geoid') : idx('census_block');
  const iState = idx('state_abbr') !== -1 ? idx('state_abbr') : idx('state');
  const iTech = idx('technology') !== -1 ? idx('technology') : idx('technology_code');
  const iDown = idx('max_advertised_download_speed') !== -1 ? idx('max_advertised_download_speed') : idx('max_down');
  const iUp = idx('max_advertised_upload_speed') !== -1 ? idx('max_advertised_upload_speed') : idx('max_up');
  const iTier = idx('low_latency') !== -1 ? idx('business_service') : idx('service_tier');

  const providers = new Set<string>();
  const batch: CoverageRow[] = [];
  let rowsWritten = 0;
  const BATCH_SIZE = 1000;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = line.split(',').map(normalize);
    const techCode = parseInt(fields[iTech] || '0', 10);
    if (techCode !== 50) continue; // fiber only
    const row: CoverageRow = {
      provider_id: fields[iProviderId] || '',
      provider_name: fields[iProviderName] || '',
      location_id: fields[iLocationId] || '',
      state: fields[iState] || '',
      county_fips: (fields[iCensusBlock] || '').slice(0, 5),
      census_block: fields[iCensusBlock] || '',
      technology_code: techCode,
      max_down_mbps: parseInt(fields[iDown] || '0', 10),
      max_up_mbps: parseInt(fields[iUp] || '0', 10),
      service_tier: fields[iTier] === '1' ? 'business' : 'residential',
      snapshot_date: snapshotDate,
    };
    batch.push(row);
    providers.add(row.provider_name);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      rowsWritten += batch.length;
      batch.length = 0;
      if (rowsWritten % 10000 === 0) process.stdout.write(`\r  ${rowsWritten.toLocaleString()} rows...`);
    }
  }
  if (batch.length > 0) {
    await flushBatch(batch);
    rowsWritten += batch.length;
  }
  console.log(`\r  ${rowsWritten.toLocaleString()} rows loaded, ${providers.size} providers`);
  return { rows: rowsWritten, providers };
}

async function flushBatch(batch: CoverageRow[]): Promise<void> {
  const rows = batch.map(r => ({
    id: `${r.snapshot_date}|${r.provider_id}|${r.location_id}`,
    snapshot_date: r.snapshot_date,
    provider_id: r.provider_id,
    provider_normalized: r.provider_name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(),
    location_id: r.location_id,
    state: r.state,
    county_fips: r.county_fips,
    census_block: r.census_block,
    technology_code: r.technology_code,
    max_down_mbps: r.max_down_mbps,
    max_up_mbps: r.max_up_mbps,
    service_tier: r.service_tier,
    metadata: null,
  }));
  const res = await fetch(`${SB_URL}/rest/v1/fcc_bdc_coverage?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch insert: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function refreshProviderSummary(snapshotDate: string): Promise<void> {
  console.log(`  Refreshing fcc_bdc_provider_summary for ${snapshotDate}...`);
  // Insert summary rows via raw SQL aggregate
  const sql = `
    INSERT INTO fcc_bdc_provider_summary (provider_normalized, snapshot_date, technology_code, locations_served, state_count, census_block_count)
    SELECT provider_normalized, snapshot_date, technology_code,
           COUNT(*) AS locations_served,
           COUNT(DISTINCT state) AS state_count,
           COUNT(DISTINCT census_block) AS census_block_count
    FROM fcc_bdc_coverage
    WHERE snapshot_date = '${snapshotDate}'
    GROUP BY provider_normalized, snapshot_date, technology_code
    ON CONFLICT (provider_normalized, snapshot_date, technology_code) DO UPDATE
    SET locations_served = EXCLUDED.locations_served,
        state_count = EXCLUDED.state_count,
        census_block_count = EXCLUDED.census_block_count;
  `;
  // Execute via Supabase RPC if available; otherwise note the SQL for manual run
  console.log('  Summary SQL:');
  console.log(sql);
  console.log('  (run via Supabase SQL editor if RPC not wired)');
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const skipDownload = process.argv.includes('--skip-download');
  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

  console.log('================================================');
  console.log('  FCC BDC bulk download + parse + load');
  console.log('================================================');

  if (!skipDownload) {
    if (!TOKEN) {
      console.error('ERROR: FCC_BDC_API_TOKEN not set in env.');
      console.error('');
      console.error('Get one via:');
      console.error('  1. Login to https://bdc.fcc.gov/');
      console.error('  2. Click "Manage API Access"');
      console.error('  3. Click "Generate" + agree to disclaimer');
      console.error('  4. Export FCC_BDC_API_TOKEN=<value> in .env');
      console.error('');
      console.error('OR use manual path:');
      console.error('  1. Visit https://broadbandmap.fcc.gov/data-download');
      console.error('  2. Select state, Technology=Fiber, latest as-of-date');
      console.error('  3. Download ZIP, unzip CSV to data/fcc-bdc/raw/');
      console.error(`  4. Re-run with --skip-download`);
      process.exit(2);
    }
    console.log('  Listing available BDC files...');
    const files = await listAvailableFiles();
    console.log(`  Found ${files.length} files`);
    const fiberFiles = files.filter(f => f.technology_code === undefined || f.technology_code === 50);
    console.log(`  ${fiberFiles.length} are fiber-relevant`);
    // Download latest snapshot
    const snapshots = [...new Set(fiberFiles.map(f => f.as_of_date))].sort().reverse();
    const latestSnapshot = snapshots[0];
    console.log(`  Latest snapshot: ${latestSnapshot}`);
    for (const file of fiberFiles.filter(f => f.as_of_date === latestSnapshot)) {
      await downloadFile(file);
    }
  } else {
    console.log('  --skip-download mode: parsing existing files in', RAW_DIR);
  }

  // Parse + load all CSVs in raw dir
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.csv'));
  if (files.length === 0) {
    console.log('  No CSV files in', RAW_DIR);
    console.log('  Either download via API token, or manually download from FCC + unzip to that dir.');
    process.exit(0);
  }
  let totalRows = 0;
  let totalProviders = new Set<string>();
  // Best-effort snapshot date inference from filename
  const snapshotDate = inferSnapshotDate(files[0]);
  for (const f of files) {
    const { rows, providers } = await parseAndLoad(join(RAW_DIR, f), snapshotDate);
    totalRows += rows;
    providers.forEach(p => totalProviders.add(p));
  }
  await refreshProviderSummary(snapshotDate);
  console.log('================================================');
  console.log(`  Loaded ${totalRows.toLocaleString()} rows`);
  console.log(`  ${totalProviders.size} unique providers`);
  console.log(`  Snapshot date: ${snapshotDate}`);
  console.log('================================================');
}

function inferSnapshotDate(filename: string): string {
  const m = filename.match(/(\d{4})[_-]?(0[1-9]|1[0-2])/);
  if (m) return `${m[1]}-${m[2]}-01`;
  // Default fallback: assume Jun 2025
  return '2025-06-01';
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
