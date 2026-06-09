/**
 * Authority-Map — deterministic publisher → tier lookup.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §4 step 3,
 * Hardening 1, §10.
 *
 * WHY a separate module from substrate-query.ts:
 * Today's substrate-query.ts treats every row as `source_kind` regardless of
 * publisher quality. The 2026-06-09 hallucination sweep showed pots-and-pans
 * (analyst commentary) was treated identically to NTIA filings. Phase A
 * splits that out so authority is recoverable from the raw citation string
 * via a checked-in YAML map (no LLM, no inference).
 *
 * Unknown publishers FAIL LOUD by default (Hardening 1). The escape hatch
 * `--allow-unknown` exists only for backfill scripts; the production pipeline
 * never sets it. A weekly RemoteTrigger lints DISTINCT publishers from
 * sr_company_evidence against this YAML and Slacks the diff (§10).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { AuthorityTier } from './types.js';
import { UnknownPublisherError } from './types.js';

interface AuthorityMapEntry {
  publisher: string;
  tier: AuthorityTier;
}

interface AuthorityMapFile {
  publishers: AuthorityMapEntry[];
}

/**
 * Module-cached map. Re-read on disk change via {@link reloadAuthorityMap}
 * (the weekly lint job writes a new copy; the running pipeline picks it up
 * by restart, not by file-watcher — keep this module side-effect-free).
 */
let cachedMap: Map<string, AuthorityTier> | null = null;

/**
 * Default file location relative to repo root. Resolved from this module's
 * URL to keep tests + production in lockstep.
 *
 * The path goes:
 *   src/showrev/m1-email-find/evidence-tiering/rich-dossier/authority-map.ts
 *   ../../../../../../data/showrev/source-authority-map.yaml
 *
 * That's 6 levels up (rich-dossier → evidence-tiering → m1-email-find →
 * showrev → src → repo-root → data/showrev/...).
 */
function defaultMapPath(): string {
  const here = new URL('.', import.meta.url).pathname;
  return join(here, '../../../../../../data/showrev/source-authority-map.yaml');
}

function loadMap(path: string): Map<string, AuthorityTier> {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw) as AuthorityMapFile | null;
  if (!parsed || !Array.isArray(parsed.publishers)) {
    throw new Error(`authority-map: ${path} did not parse as { publishers: [...] }`);
  }
  const m = new Map<string, AuthorityTier>();
  for (const entry of parsed.publishers) {
    // Normalize publisher key — lowercased, whitespace-collapsed — so the
    // matcher is tolerant of cosmetic citation variation across the corpus.
    m.set(normalizePublisher(entry.publisher), entry.tier);
  }
  return m;
}

/**
 * Lowercased + whitespace-collapsed publisher key.
 *
 * WHY: citations across sr_company_evidence vary ("FC2026 Speaker Page",
 * "fc2026 speaker page", "FC2026  Speaker Page") — normalizing the
 * comparison key absorbs that without ballooning the YAML.
 */
function normalizePublisher(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract a candidate publisher token from a raw source_citation.
 *
 * The 2026-06-09 DB sample shows three citation shapes:
 *   1. "publisher :: title"                — most common
 *   2. "publisher | title | url"           — multi-segment with bar separator
 *   3. "https://host.com/path"             — bare URL
 *   4. "publisher" (bare)                  — short form, no segment markers
 *
 * For (1)/(2)/(4) we take the leading non-URL segment.
 * For (3) we strip protocol + path and take the hostname.
 *
 * Returns the normalized key (lowercased, whitespace-collapsed). The caller
 * looks that up in the cached map.
 */
export function publisherFromCitation(citation: string): string {
  const trimmed = citation.trim();
  if (!trimmed) return '';

  // If the leading token is a URL, parse it and use the hostname (strip www.)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return normalizePublisher(u.hostname.replace(/^www\./, ''));
    } catch {
      // Malformed URL — fall through to segment-based extraction
    }
  }

  // Find the first segment using either of the two known delimiters.
  // Order matters — `::` is more common (70% of corpus), then ` | `.
  const segs = trimmed.split(/\s*::\s*|\s*\|\s*|\s+—\s+/);
  const head = (segs[0] || '').trim();

  // The "head" might itself be a URL hidden inside a multi-segment citation
  // (e.g. "Broadband Communities — https://bbcmag.com/..."). Re-test.
  if (/^https?:\/\//i.test(head)) {
    try {
      const u = new URL(head);
      return normalizePublisher(u.hostname.replace(/^www\./, ''));
    } catch {
      // fall through
    }
  }

  return normalizePublisher(head);
}

/**
 * Test seam — bypass disk read so unit tests can inject a fixture map.
 * Production code never calls this.
 */
export function _setAuthorityMapForTests(map: Map<string, AuthorityTier>): void {
  cachedMap = map;
}

/**
 * Test seam — clear cache so the next call re-reads from disk.
 */
export function reloadAuthorityMap(): void {
  cachedMap = null;
}

function getMap(): Map<string, AuthorityTier> {
  if (!cachedMap) {
    cachedMap = loadMap(defaultMapPath());
  }
  return cachedMap;
}

/**
 * Look up the tier for a citation.
 *
 * On unknown publisher:
 *   - allowUnknown=false (default) → throw UnknownPublisherError (Hardening 1)
 *   - allowUnknown=true            → return tier 'D' so the row is still
 *                                    scored but heavily penalized
 *
 * The caller is responsible for setting `authority_original` to the returned
 * tier BEFORE applying the null-date demotion (§4 step 4, PM fix 1).
 */
export function lookupAuthority(
  citation: string,
  opts: { allowUnknown?: boolean } = {},
): { publisher: string; tier: AuthorityTier; isUnknown: boolean } {
  const publisher = publisherFromCitation(citation);
  const map = getMap();
  const hit = map.get(publisher);
  if (hit) {
    return { publisher, tier: hit, isUnknown: false };
  }
  if (opts.allowUnknown) {
    return { publisher, tier: 'D', isUnknown: true };
  }
  throw new UnknownPublisherError(publisher || '(empty)', citation);
}

/**
 * Convert a tier to its multiplicative weight in the score formula
 * (§4 step 9). Constants are co-located here so the score function in
 * get-rich-dossier.ts has a single import surface.
 */
export function authorityWeight(tier: AuthorityTier): number {
  switch (tier) {
    case 'A': return 1.0;
    case 'B': return 0.75;
    case 'C': return 0.5;
    case 'D': return 0.25;
  }
}

/**
 * Demote a tier by one step (A→B, B→C, C→D, D→D).
 * Used by the null-date rule (§4 step 4).
 */
export function demoteAuthority(tier: AuthorityTier): AuthorityTier {
  switch (tier) {
    case 'A': return 'B';
    case 'B': return 'C';
    case 'C': return 'D';
    case 'D': return 'D';
  }
}
