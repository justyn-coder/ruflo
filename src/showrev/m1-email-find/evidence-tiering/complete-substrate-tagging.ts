/**
 * Complete the substrate-tagging pass via direct Anthropic API.
 *
 * Operator authorized direct API use (separate from Claude Code subscription)
 * when it makes things meaningfully faster. The Workflow approach takes
 * ~15-20 min queued through subscription rate limits; direct API with
 * concurrent batching finishes ~1,600 untagged chunks in ~2 min, ~$3.
 *
 * Reads chunks where metadata IS NULL, runs Haiku 4.5 extraction in
 * batches of 20, writes tagged metadata + emits evidence rows.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/complete-substrate-tagging.ts
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { callLLM } from '../llm-client.js';
import { writeEvidence } from './substrate-query.js';
import { normalizeCompanyName } from './substrate-query.js';
import type { ClaimCategory, SourceKind } from './types.js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';
const CHUNKS_PER_CALL = 20;
const CONCURRENT_WORKERS = 10;

interface Chunk {
  id: string;
  source: string;
  title: string;
  content: string;
}

interface ExtractedTag {
  id: string;
  companies_mentioned: string[];
  speaker_name: string | null;
  speaker_company: string | null;
  speaker_role: string | null;
  topics: string[];
  claims: Array<{ company: string; claim: string }>;
}

// ----------------------------------------------------------------------------
// Whitelist (Focus 100 + FC2026 attendees normalized)
// ----------------------------------------------------------------------------

function loadWhitelist(): Set<string> {
  const list = new Set<string>();
  const focus100 = readFileSync(
    resolve(__dirname, '../../../../data/showrev/p2-cold/focus-100.csv'),
    'utf-8',
  );
  focus100.split('\n').slice(1).forEach(line => {
    const company = line.split(',')[0]?.replace(/^"|"$/g, '').trim();
    if (company) list.add(normalizeCompanyName(company));
  });
  const attendees = readFileSync(
    resolve(__dirname, '../../../../data/showrev/p2-cold/fc2026-attendees-usa.csv'),
    'utf-8',
  );
  attendees.split('\n').slice(1).forEach(line => {
    const fields = line.split(',');
    const company = fields[2]?.replace(/^"|"$/g, '').trim();
    if (company) list.add(normalizeCompanyName(company));
  });
  return list;
}

// ----------------------------------------------------------------------------
// Fetch untagged chunks
// ----------------------------------------------------------------------------

async function fetchUntaggedChunks(): Promise<Chunk[]> {
  const url = `${SB_URL}/rest/v1/sr_brain_substrate?select=id,source,title,content&metadata=is.null&order=id&limit=2000`;
  const res = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`fetch untagged: ${res.status}`);
  return (await res.json()) as Chunk[];
}

// ----------------------------------------------------------------------------
// Haiku extraction prompt
// ----------------------------------------------------------------------------

function buildExtractionPrompt(chunks: Chunk[]): string {
  return `You are tagging fiber-industry substrate chunks for downstream queries. For each chunk, extract:
- companies_mentioned: array of company names that ARE actual ISPs/operators/A&E firms/equipment vendors. Normalize: lowercase, no "Inc"/"LLC"/"Corp" suffix. Skip generic mentions like "fiber operators" or "service providers."
- speaker_name: who is talking, if a podcast/interview. null otherwise.
- speaker_company: the speaker's employer at time of recording. null if not clear.
- speaker_role: the speaker's title (CEO, COO, VP, Director, etc.). null if not clear.
- topics: 1-5 topical tags (BEAD, ReConnect, drawing throughput, GIS-to-CAD, permit cycle, fiber expansion, M&A, AI infrastructure, etc.).
- claims: ONLY quotable claims tied to a specific company. Each claim ≤30 words. Skip generic industry framing. If a speaker said "we built 1,700 miles," tag as { company: speaker_company, claim: "1,700 miles built" }.

Output a JSON array, one object per input chunk, in the same order:

[
  {
    "id": "<chunk_id>",
    "companies_mentioned": [...],
    "speaker_name": null | "...",
    "speaker_company": null | "...",
    "speaker_role": null | "...",
    "topics": [...],
    "claims": [{ "company": "...", "claim": "..." }]
  },
  ...
]

INPUT CHUNKS (${chunks.length}):

${chunks.map(c => `--- CHUNK ${c.id} (source: ${c.source || 'unknown'}, title: ${(c.title || '').slice(0, 120)}) ---\n${(c.content || '').slice(0, 1500)}`).join('\n\n')}

Return JSON only, no prose.`;
}

function parseExtractionResponse(raw: string, expectedIds: string[]): ExtractedTag[] {
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) throw new Error('no JSON array in Haiku output');
  const parsed = JSON.parse(jsonMatch[1]) as ExtractedTag[];
  if (!Array.isArray(parsed)) throw new Error('expected array');
  return parsed;
}

// ----------------------------------------------------------------------------
// Write tagged metadata back to sr_brain_substrate
// ----------------------------------------------------------------------------

async function writeMetadata(taggings: ExtractedTag[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  // PostgREST PATCH with filter for each row (small batches)
  await Promise.all(taggings.map(async tag => {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sr_brain_substrate?id=eq.${tag.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          metadata: {
            companies_mentioned: (tag.companies_mentioned || []).map(c => normalizeCompanyName(c)),
            speaker_name: tag.speaker_name,
            speaker_company: tag.speaker_company ? normalizeCompanyName(tag.speaker_company) : null,
            speaker_role: tag.speaker_role,
            topics: tag.topics || [],
            claims: tag.claims || [],
          },
        }),
      });
      if (res.ok) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }));
  return { ok, fail };
}

// ----------------------------------------------------------------------------
// Emit evidence rows for whitelisted company mentions
// ----------------------------------------------------------------------------

async function emitEvidence(
  taggings: ExtractedTag[],
  whitelist: Set<string>,
  chunkMeta: Map<string, { source: string; title: string }>,
): Promise<number> {
  const rows: Array<Parameters<typeof writeEvidence>[0][number]> = [];

  for (const tag of taggings) {
    const meta = chunkMeta.get(tag.id);
    if (!meta) continue;

    for (const c of tag.claims || []) {
      if (!c?.company || typeof c.company !== 'string') continue;
      if (!c?.claim || typeof c.claim !== 'string') continue;
      const companyNorm = normalizeCompanyName(c.company);
      if (!whitelist.has(companyNorm)) continue;

      const sourceKind: SourceKind =
        tag.speaker_company &&
        normalizeCompanyName(tag.speaker_company) === companyNorm &&
        tag.speaker_role &&
        /^(ceo|coo|cto|cdo|vp|chief|president|director|head of)/i.test(tag.speaker_role)
          ? 'substrate_quoted'
          : 'substrate';

      rows.push({
        company_name: c.company,
        claim: c.claim,
        source_kind: sourceKind,
        source_citation: `${meta.source}#${tag.id} (${meta.title.slice(0, 80)})`,
        speaker_name: tag.speaker_name || undefined,
        speaker_company: tag.speaker_company || undefined,
        speaker_role: tag.speaker_role || undefined,
        category: 'company_fact' as ClaimCategory,
      });
    }
  }

  if (rows.length === 0) return 0;
  // writeEvidence chunks internally; we just batch
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const res = await writeEvidence(slice);
    totalInserted += res.inserted;
  }
  return totalInserted;
}

// ----------------------------------------------------------------------------
// Process one batch (20 chunks)
// ----------------------------------------------------------------------------

async function processBatch(
  chunks: Chunk[],
  whitelist: Set<string>,
  chunkMeta: Map<string, { source: string; title: string }>,
  batchNum: number,
): Promise<{ tagged: number; evidence: number; error?: string }> {
  try {
    const prompt = buildExtractionPrompt(chunks);
    const raw = await callLLM(prompt, {
      model: MODEL,
      timeoutMs: 60000,
      label: `tag-batch-${batchNum}`,
    });
    const taggings = parseExtractionResponse(raw, chunks.map(c => c.id));
    const meta = await writeMetadata(taggings);
    const evidence = await emitEvidence(taggings, whitelist, chunkMeta);
    return { tagged: meta.ok, evidence };
  } catch (err) {
    return { tagged: 0, evidence: 0, error: (err as Error).message?.slice(0, 100) };
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log('======================================================');
  console.log('  Complete Substrate Tagging — direct API');
  console.log('======================================================');

  if (!SB_KEY) {
    console.error('SUPABASE key missing from env');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing from env');
    process.exit(1);
  }

  const whitelist = loadWhitelist();
  console.log(`  Whitelist: ${whitelist.size} normalized company names`);

  const chunks = await fetchUntaggedChunks();
  console.log(`  Untagged chunks: ${chunks.length}`);
  if (chunks.length === 0) {
    console.log('  Nothing to do.');
    return;
  }

  const chunkMeta = new Map<string, { source: string; title: string }>();
  chunks.forEach(c => chunkMeta.set(c.id, { source: c.source, title: c.title }));

  const batches: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += CHUNKS_PER_CALL) {
    batches.push(chunks.slice(i, i + CHUNKS_PER_CALL));
  }
  console.log(`  ${batches.length} batches × ${CHUNKS_PER_CALL} chunks (concurrency ${CONCURRENT_WORKERS})`);
  console.log('');

  const t0 = Date.now();
  let completed = 0;
  let totalTagged = 0;
  let totalEvidence = 0;
  let failedBatches = 0;

  // Run with concurrency control
  const queue = [...batches.entries()];
  const workers = Array.from({ length: CONCURRENT_WORKERS }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const [batchNum, batch] = next;
      const res = await processBatch(batch, whitelist, chunkMeta, batchNum);
      totalTagged += res.tagged;
      totalEvidence += res.evidence;
      if (res.error) {
        failedBatches++;
        console.log(`  batch ${batchNum + 1}: FAIL ${res.error}`);
      } else {
        completed++;
        process.stdout.write(`\r  progress: ${completed}/${batches.length} batches done, ${totalTagged} chunks tagged, ${totalEvidence} evidence rows`);
      }
    }
  });
  await Promise.all(workers);
  console.log('');

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('======================================================');
  console.log(`  Substrate Tagging Complete (${dur}s)`);
  console.log(`    ${totalTagged} chunks tagged with metadata`);
  console.log(`    ${totalEvidence} evidence rows written`);
  console.log(`    ${failedBatches} batches failed`);
  console.log('======================================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
