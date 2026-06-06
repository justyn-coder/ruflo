import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUBSTRATE_DIR = resolve(__dirname, '../../../data/brain/substrate');

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 50;

function sbHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
function sbUrl(): string { return process.env.NEXT_PUBLIC_SUPABASE_URL || ''; }

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + CHUNK_SIZE * 0.5) end = lastPeriod + 2;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 100) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks;
}

async function loadSource(sourceDir: string, sourceName: string): Promise<{ loaded: number; skipped: number; errors: number }> {
  const progressFile = resolve(sourceDir, '_load_progress.json');
  const loaded = new Set<string>();
  if (existsSync(progressFile)) {
    const progress = JSON.parse(readFileSync(progressFile, 'utf-8'));
    (progress.loaded || []).forEach((f: string) => loaded.add(f));
    console.log(`  Resuming: ${loaded.size} files already loaded`);
  }

  const files = readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  let newLoaded = 0;
  let skipped = 0;
  let errors = 0;
  let batch: any[] = [];

  async function flushBatch() {
    if (!batch.length) return;
    const res = await fetch(`${sbUrl()}/rest/v1/sr_brain_substrate`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`  Batch insert error: ${err.slice(0, 100)}`);
      errors += batch.length;
    }
    batch = [];
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (loaded.has(file)) { skipped++; continue; }

    try {
      const data = JSON.parse(readFileSync(resolve(sourceDir, file), 'utf-8'));
      const content = data.content || '';
      if (content.length < 100) { skipped++; continue; }

      const chunks = chunkText(content);
      for (let ci = 0; ci < chunks.length; ci++) {
        batch.push({
          source: sourceName,
          title: (data.title || '').slice(0, 500),
          url: data.url || '',
          published_date: data.date || '',
          chunk_index: ci,
          content: chunks[ci],
          char_count: chunks[ci].length,
        });
      }

      loaded.add(file);
      newLoaded++;

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }

      if (newLoaded % 100 === 0) {
        console.log(`  ${sourceName}: ${newLoaded} files loaded (${skipped} skipped, ${i + 1}/${files.length})`);
        writeFileSync(progressFile, JSON.stringify({ loaded: [...loaded] }));
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.log(`  Error: ${file}: ${err.message?.slice(0, 60)}`);
    }
  }

  await flushBatch();
  writeFileSync(progressFile, JSON.stringify({ loaded: [...loaded] }));

  return { loaded: newLoaded, skipped, errors };
}

async function stats(): Promise<void> {
  const res = await fetch(
    `${sbUrl()}/rest/v1/sr_brain_substrate?select=source,id&order=source`,
    { headers: sbHeaders() }
  );
  const rows: any[] = await res.json();
  const bySource = new Map<string, number>();
  for (const r of rows) {
    bySource.set(r.source, (bySource.get(r.source) || 0) + 1);
  }
  console.log('=== Substrate Stats ===\n');
  let total = 0;
  for (const [source, count] of bySource) {
    console.log(`  ${source}: ${count} chunks`);
    total += count;
  }
  console.log(`\n  Total: ${total} chunks`);
}

async function search(query: string): Promise<void> {
  const tsQuery = query.split(/\s+/).join(' & ');
  const res = await fetch(
    `${sbUrl()}/rest/v1/sr_brain_substrate?search_vector=fts.${encodeURIComponent(tsQuery)}&select=source,title,published_date,content,url&limit=5&order=published_date.desc`,
    { headers: sbHeaders() }
  );
  const rows: any[] = await res.json();
  console.log(`Search: "${query}" → ${rows.length} results\n`);
  for (const r of rows) {
    console.log(`[${r.source}] ${r.title} (${r.published_date})`);
    console.log(`  ${r.content.slice(0, 200)}...`);
    console.log(`  ${r.url}\n`);
  }
}

// CLI
if (process.argv[1]?.includes('substrate-loader')) {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'load': {
      const source = process.argv[3] || 'all';
      (async () => {
        const sources: Array<[string, string]> = [];
        if (source === 'all' || source === 'dawson') sources.push([resolve(SUBSTRATE_DIR, 'dawson-pots-and-pans'), 'dawson-pots-and-pans']);
        if (source === 'all' || source === 'cbb') sources.push([resolve(SUBSTRATE_DIR, 'community-broadband-bits'), 'community-broadband-bits']);
        for (const [dir, name] of sources) {
          console.log(`\n=== Loading ${name} ===`);
          const r = await loadSource(dir, name);
          console.log(`Done: ${r.loaded} loaded, ${r.skipped} skipped, ${r.errors} errors`);
        }
      })().catch(err => { console.error('Failed:', err.message); process.exit(1); });
      break;
    }
    case 'stats':
      stats().catch(err => { console.error(err.message); process.exit(1); });
      break;
    case 'search':
      search(process.argv.slice(3).join(' ') || 'BEAD fiber deployment').catch(err => { console.error(err.message); process.exit(1); });
      break;
    default:
      console.log(`
Substrate Loader — bulk load harvested content into Supabase with full-text search

Usage:
  npx tsx substrate-loader.ts load [dawson|cbb|all]    Load chunks to sr_brain_substrate
  npx tsx substrate-loader.ts stats                    Show chunk counts by source
  npx tsx substrate-loader.ts search <query>           Full-text search the substrate

Resumable. Chunks stored with tsvector for instant PostgreSQL full-text search.
`);
  }
}
