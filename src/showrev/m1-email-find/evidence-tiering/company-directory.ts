/**
 * Per-company directory loader + lookup.
 *
 * The directory CSV (data/showrev/p2-cold/COMPANY-DIRECTORY-2026-06-10.csv) is
 * an operator-reviewed map from raw CSV company names to canonical metadata:
 *
 *   - canonical_name (display + substrate-key form)
 *   - canonical_url (full https URL for portal link-out + company_website field)
 *   - canonical_domain (bare domain for email-find pinning)
 *   - business_type + confidence (skip resolver when available)
 *
 * Two failure modes this directory closes:
 *
 *   1. Wrong-company email send. Without pinning, email-find can land on
 *      "ctrawinski@omni.com" (Omni Hotels) for an Omni Fiber prospect because
 *      its 31-alt-domain fallback explores too aggressively.
 *
 *   2. Substrate-keying mismatch. Raw CSV name "Google-GFiber" normalizes to
 *      "google gfiber" but substrate is keyed under "gfiber". Composer can't
 *      find rich GFiber substrate. Alias resolves both to the same key.
 *
 * Per the spec red-team:
 *   - We REUSE normalizeCompanyName from substrate-query.ts (single source of
 *     truth — see ## Normalization function in spec v2). Do NOT define a
 *     parallel normalizer here.
 *   - All paths fail-open: directory miss → legacy behavior; malformed CSV
 *     → empty Map → legacy behavior; bad canonical_domain → email-find logs
 *     and the operator review of the CSV catches Highline-class wrong-domain
 *     resolver outputs.
 *
 * Phase A composer fix 2026-06-10 + Phase B/C same day + Directory integration
 * 2026-06-11.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeCompanyName } from './substrate-query.js';

export interface DirectoryEntry {
  raw_name: string;
  canonical_name: string;
  canonical_url: string;
  canonical_domain: string;
  business_type: 'fiber_operator' | 'ae_firm' | 'electric_coop_fiber' | 'tower_ae' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
}

export type DirectoryMap = Map<string, DirectoryEntry>;

const DEFAULT_DIRECTORY_PATH = 'data/showrev/p2-cold/COMPANY-DIRECTORY-2026-06-10.csv';

/**
 * Load + parse the directory CSV. Returns an empty Map on any error so the
 * pipeline runs as today if the directory is missing or malformed.
 *
 * CSV format (after `# comment` and blank lines are filtered):
 *   raw_name,canonical_name,canonical_url,canonical_domain,business_type,confidence,reasoning
 *
 * A "### POTENTIAL DUPLICATES" section may follow the main directory; we stop
 * parsing once we see it.
 */
export function loadDirectory(csvPath?: string): DirectoryMap {
  const map: DirectoryMap = new Map();
  const path = resolve(csvPath || DEFAULT_DIRECTORY_PATH);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    console.log(`[directory] could not read ${path}: ${(err as Error).message} — falling back to legacy behavior`);
    return map;
  }

  const lines = raw.split(/\r?\n/);
  let inDupSection = false;
  let headerRow: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Check `###` (section delimiter) BEFORE `#` (comment) — '###' starts with '#'
    // so order matters. Caught during smoke test 2026-06-11.
    if (line.startsWith('###')) { inDupSection = true; continue; }
    if (line.startsWith('#')) continue;
    if (inDupSection) continue;

    const cells = parseCsvLine(line);
    if (cells.length < 4) continue;

    if (!headerRow && cells[0] === 'raw_name') {
      headerRow = cells;
      continue;
    }
    if (cells[0] === 'a_raw_name') continue; // dup-section header sanity

    const entry: DirectoryEntry = {
      raw_name: cells[0].trim(),
      canonical_name: cells[1]?.trim() || cells[0].trim(),
      canonical_url: cells[2]?.trim() || '',
      canonical_domain: cells[3]?.trim() || '',
      business_type: normalizeBusinessType(cells[4]?.trim()),
      confidence: normalizeConfidence(cells[5]?.trim()),
    };

    if (!entry.raw_name) continue;
    const key = normalizeCompanyName(entry.raw_name);
    if (!key) continue;
    map.set(key, entry);
  }

  console.log(`[directory] loaded ${map.size} entries from ${path}`);
  return map;
}

/**
 * Look up an entry by the prospect's raw CSV company name. Uses the same
 * normalization function the substrate is keyed by, so a hit guarantees
 * substrate-side coherence.
 *
 * Returns null if the prospect's company is not in the directory. Caller MUST
 * handle null and degrade to legacy per-phase behavior (no resolver skip, no
 * email-find pin, no substrate alias).
 */
export function lookupDirectory(
  map: DirectoryMap,
  rawCompany: string,
): DirectoryEntry | null {
  if (!rawCompany) return null;
  const key = normalizeCompanyName(rawCompany);
  return map.get(key) || null;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Parse one CSV line — handles quoted fields with embedded commas.
 *
 * We don't import a CSV library because the directory format is well-known
 * and the pipeline already avoids heavy deps in this code path.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') { out.push(current); current = ''; }
      else if (ch === '"') inQuote = true;
      else current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalizeBusinessType(s: string | undefined): DirectoryEntry['business_type'] {
  const v = (s || '').toLowerCase().trim();
  if (v === 'fiber_operator' || v === 'ae_firm' || v === 'electric_coop_fiber' || v === 'tower_ae') return v;
  return 'unknown';
}

function normalizeConfidence(s: string | undefined): DirectoryEntry['confidence'] {
  const v = (s || '').toLowerCase().trim();
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'low';
}
