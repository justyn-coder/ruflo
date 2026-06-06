import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUBSTRATE_DIR = resolve(__dirname, '../../../data/brain/substrate');
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

function chunkText(text: string, size: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + size * 0.5) end = lastPeriod + 2;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter(c => c.length > 100);
}

async function indexSource(sourceDir: string, sourceName: string): Promise<{ indexed: number; skipped: number; errors: number }> {
  const { initBrainDB } = await import('./brain-agentdb.js');
  await initBrainDB();
  const { AgentDB } = await import('agentdb');

  const dbPath = resolve(__dirname, '../../../data/brain/brain.sqlite');
  const db = new AgentDB({ dbPath });
  await db.initialize();
  const memoryCtrl = db.getController('memory');

  const progressFile = resolve(sourceDir, '_index_progress.json');
  const indexed = new Set<string>();
  if (existsSync(progressFile)) {
    const progress = JSON.parse(readFileSync(progressFile, 'utf-8'));
    (progress.indexed || []).forEach((f: string) => indexed.add(f));
  }

  const files = readdirSync(sourceDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  let newIndexed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (indexed.has(file)) { skipped++; continue; }

    try {
      const data = JSON.parse(readFileSync(resolve(sourceDir, file), 'utf-8'));
      const content = data.content || '';
      if (content.length < 100) { skipped++; continue; }

      const chunks = chunkText(content);

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkText = chunks[ci];
        const contextLine = `[${sourceName}] ${data.title || ''} (${data.date || ''})`;

        await memoryCtrl.storeEpisode({
          agentId: 'substrate',
          taskDescription: sourceName,
          approach: chunkText,
          outcome: contextLine,
          reflection: data.url || '',
          success: true,
          metadata: {
            source: sourceName,
            title: data.title || '',
            date: data.date || '',
            url: data.url || '',
            chunkIndex: ci,
            totalChunks: chunks.length,
            file,
          },
        });
      }

      indexed.add(file);
      newIndexed++;

      if (newIndexed % 50 === 0) {
        console.log(`  ${sourceName}: ${newIndexed} new (${skipped} skipped, ${i + 1}/${files.length} files)`);
        writeFileSync(progressFile, JSON.stringify({ indexed: [...indexed], total: indexed.size }));
      }
    } catch (err: any) {
      errors++;
      if (errors <= 3) console.log(`  Error on ${file}: ${err.message?.slice(0, 80)}`);
    }
  }

  writeFileSync(progressFile, JSON.stringify({ indexed: [...indexed], total: indexed.size }));
  await db.close();

  return { indexed: newIndexed, skipped, errors };
}

async function testSearch(query: string): Promise<void> {
  const { initBrainDB, searchBrain } = await import('./brain-agentdb.js');
  await initBrainDB();

  console.log(`\nSearching substrate for: "${query}"\n`);
  const results = await searchBrain(query, 5, 'substrate');

  for (const r of results) {
    console.log(`[${(r.score * 100).toFixed(0)}%] ${r.name}`);
    console.log(`  ${r.facts[0]?.slice(0, 150) || '(no text)'}`);
    console.log(`  Source: ${r.sources}`);
    console.log('');
  }

  if (!results.length) console.log('No results. Index may be empty or query too specific.');
}

// CLI
if (process.argv[1]?.includes('substrate-indexer')) {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'index': {
      const source = process.argv[3] || 'all';
      (async () => {
        const sources: Array<[string, string]> = [];
        if (source === 'all' || source === 'dawson') {
          sources.push([resolve(SUBSTRATE_DIR, 'dawson-pots-and-pans'), 'dawson-pots-and-pans']);
        }
        if (source === 'all' || source === 'cbb') {
          sources.push([resolve(SUBSTRATE_DIR, 'community-broadband-bits'), 'community-broadband-bits']);
        }

        for (const [dir, name] of sources) {
          console.log(`\n=== Indexing ${name} ===`);
          const result = await indexSource(dir, name);
          console.log(`Done: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`);
        }
      })().catch(err => { console.error('Failed:', err.message); process.exit(1); });
      break;
    }

    case 'search':
      testSearch(process.argv.slice(3).join(' ') || 'BEAD fiber deployment challenges').catch(err => {
        console.error('Search failed:', err.message); process.exit(1);
      });
      break;

    default:
      console.log(`
Substrate Indexer — chunk, embed, and index harvested content into AgentDB

Usage:
  npx tsx substrate-indexer.ts index [dawson|cbb|all]    Index harvested content
  npx tsx substrate-indexer.ts search <query>             Test semantic search

Resumable — tracks indexed files in _index_progress.json per source.
`);
  }
}
