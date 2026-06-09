/**
 * KB Classifier — Haiku one-call-per-claim with confidence + evidence quote.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §4 step 7,
 * §6, §9 (determinism), PM fix 3, Hardening 4.
 *
 * WHY one-call-per-claim instead of one-call-per-dossier:
 * The 2026-06-09 hallucination sweep showed bulk-classify prompts let Haiku
 * confidently confirm claims that weren't even in the KB. Per-claim isolation
 * removes the "carry-confidence" effect from previously-confirmed claims.
 *
 * WHY cache key includes KB file contents hash:
 * Eng fix 2 — when the operator edits industry-intelligence-kb.md, every
 * cached row instantly invalidates. No "I forgot to bust the cache" footgun.
 * The hash is sha256(claim + sha256(kb_file_contents)) per spec §4 step 7.
 *
 * WHY confidence + evidence quote required and force-unaddressed below 0.7:
 * PM fix 3 — without the threshold, Haiku confidently says "confirmed" with
 * no quote and the composer renders a fabricated bullet. Forcing unaddressed
 * on low-confidence is the only deterministic guard.
 *
 * Cache TTL 7 days (Hardening 4) — prevents permanent poisoning if a single
 * bad Haiku call gets cached. Operator can also nuke the cache by
 * touching the KB file (cache key changes).
 */

import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { callLLM } from '../../llm-client.js';
import type { KbStatus } from './types.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, Hardening 4
const CONFIDENCE_THRESHOLD = 0.7;             // PM fix 3 force-unaddressed cutoff

/** Resolved cache directory (lazy created). */
function cacheDir(): string {
  const here = new URL('.', import.meta.url).pathname;
  // Co-located with the module so dev + prod share the same cache surface.
  // .gitignore'd by convention (cache files are .json hashes, no PII).
  return join(here, '../../../../../../.cache/kb-classifier');
}

function defaultKbPath(): string {
  const here = new URL('.', import.meta.url).pathname;
  return join(here, '../../../../../../data/showrev/industry-intelligence-kb.md');
}

let cachedKbBody: string | null = null;
let cachedKbHash: string | null = null;

function getKbBodyAndHash(): { body: string; hash: string } {
  if (cachedKbBody && cachedKbHash) {
    return { body: cachedKbBody, hash: cachedKbHash };
  }
  const body = readFileSync(defaultKbPath(), 'utf-8');
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  cachedKbBody = body;
  cachedKbHash = hash;
  return { body, hash };
}

/**
 * Test seam — inject a KB body for unit tests instead of reading from disk.
 */
export function _setKbForTests(body: string): void {
  cachedKbBody = body;
  cachedKbHash = createHash('sha256').update(body).digest('hex').slice(0, 16);
}

export function reloadKb(): void {
  cachedKbBody = null;
  cachedKbHash = null;
}

interface CacheEntry {
  status: KbStatus;
  confidence: number;
  evidence_quote: string;
  written_at: number;
}

function cacheKey(claim: string, kbHash: string): string {
  return createHash('sha256').update(`${claim}|${kbHash}`).digest('hex');
}

function cacheFilePath(key: string): string {
  return join(cacheDir(), `${key}.json`);
}

function readCache(key: string): CacheEntry | null {
  const path = cacheFilePath(key);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.written_at > CACHE_TTL_MS) {
      // Stale — best-effort delete, then miss
      try { unlinkSync(path); } catch { /* race ok */ }
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  const path = cacheFilePath(key);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(entry));
  } catch {
    // Cache is best-effort; failure to persist does not break the pipeline.
  }
}

/**
 * Best-effort cache cleanup. Called rarely (once per orchestrator boot) so
 * stale TTL'd entries don't pile up. Not on the hot path.
 */
export function gcKbCache(): void {
  const dir = cacheDir();
  if (!existsSync(dir)) return;
  try {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (Date.now() - st.mtimeMs > CACHE_TTL_MS) {
        try { unlinkSync(path); } catch { /* ignore */ }
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Parse Haiku JSON output. Defensively extracts {status, confidence, evidence_quote}
 * even if the model wraps in markdown fences. Returns a forced-unaddressed result
 * if parsing fails so downstream code never sees garbage.
 */
function parseHaikuResponse(raw: string): { status: KbStatus; confidence: number; evidence_quote: string } {
  let json = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = json.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) json = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { status: 'unaddressed', confidence: 0, evidence_quote: '' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'unaddressed', confidence: 0, evidence_quote: '' };
  }
  const obj = parsed as Record<string, unknown>;
  const rawStatus = String(obj.status || '').toLowerCase();
  const status: KbStatus =
    rawStatus === 'confirmed' || rawStatus === 'contradicted' || rawStatus === 'unaddressed'
      ? (rawStatus as KbStatus)
      : 'unaddressed';
  const confidence = typeof obj.confidence === 'number'
    ? Math.max(0, Math.min(1, obj.confidence))
    : 0;
  const evidence_quote = typeof obj.evidence_quote === 'string'
    ? obj.evidence_quote.trim()
    : '';
  return { status, confidence, evidence_quote };
}

const SYSTEM_PROMPT = `You classify whether a single claim is confirmed, contradicted, or unaddressed by an industry knowledge base.

Rules:
- "confirmed": the KB explicitly supports the claim. You MUST quote the exact sentence(s) from the KB as evidence_quote.
- "contradicted": the KB explicitly states the opposite. You MUST quote the contradicting sentence(s).
- "unaddressed": the KB does not speak to this claim, OR you are not sure. Empty evidence_quote.

DO NOT confirm if the KB merely "could plausibly support" the claim. Confirmed requires explicit corroboration.

Output JSON only, no prose, no markdown fences:
{"status":"confirmed"|"contradicted"|"unaddressed","confidence":0.0-1.0,"evidence_quote":"..."}`;

/**
 * Classify a single claim against the industry KB.
 *
 * @param claim       The claim string to classify.
 * @param opts.skipLlm If true, skip the API call and return cached or unaddressed.
 *                     Used by unit tests to keep them hermetic.
 */
export async function classifyClaim(
  claim: string,
  opts: { skipLlm?: boolean } = {},
): Promise<{ status: KbStatus; confidence: number; evidence_quote: string; cached: boolean }> {
  const { body, hash } = getKbBodyAndHash();
  const key = cacheKey(claim, hash);

  const cached = readCache(key);
  if (cached) {
    return { status: cached.status, confidence: cached.confidence, evidence_quote: cached.evidence_quote, cached: true };
  }

  if (opts.skipLlm) {
    return { status: 'unaddressed', confidence: 0, evidence_quote: '', cached: false };
  }

  const prompt =
    `Knowledge base:\n---\n${body}\n---\n\n` +
    `Claim: ${claim}\n\n` +
    `Return JSON only.`;

  let raw: string;
  try {
    raw = await callLLM(prompt, {
      model: HAIKU_MODEL,
      maxTokens: 512,
      timeoutMs: 15000,
      label: 'kb-classifier',
      cacheableSystemContent: SYSTEM_PROMPT,
    });
  } catch (err) {
    // Per spec §6: Haiku fail → unaddressed, kb_confidence=0.
    // Do NOT cache the failure — next call should retry.
    return { status: 'unaddressed', confidence: 0, evidence_quote: '', cached: false };
  }

  const parsed = parseHaikuResponse(raw);

  // PM fix 3: force-unaddressed when confidence<0.7 OR evidence_quote empty.
  // This is the load-bearing fabrication guard.
  let final = parsed;
  if (parsed.confidence < CONFIDENCE_THRESHOLD || parsed.evidence_quote.length === 0) {
    final = { status: 'unaddressed', confidence: parsed.confidence, evidence_quote: parsed.evidence_quote };
  }

  writeCache(key, {
    status: final.status,
    confidence: final.confidence,
    evidence_quote: final.evidence_quote,
    written_at: Date.now(),
  });

  return { ...final, cached: false };
}

/**
 * KB-classifier weight in the score formula (§4 step 9).
 * confirmed=1.0, unaddressed=0.7, contradicted=0.2.
 */
export function kbWeight(status: KbStatus): number {
  switch (status) {
    case 'confirmed':    return 1.0;
    case 'unaddressed':  return 0.7;
    case 'contradicted': return 0.2;
  }
}
