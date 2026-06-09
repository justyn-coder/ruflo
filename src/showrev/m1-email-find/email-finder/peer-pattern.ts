/**
 * peer-pattern.ts
 *
 * Peer-pattern derivation from Supabase `sr_company_contacts`.
 *
 * Why: the email-finder rebuilds pattern detection from scratch for every
 * prospect, even when we already have one or more verified emails at the
 * same company stored from prior research. If we know one verified Gateway
 * Fiber email is `lisa.rosema@gatewayfiber.com`, we can infer the company
 * pattern is `first.last` and apply it directly to other Gateway Fiber
 * prospects, skipping web scraping + SMTP guess-and-check.
 *
 * Flow:
 *   1. queryCompanyPeers(company) — fetch all stored contacts at the company
 *      that have a usable (non-generic) email.
 *   2. inferPatternFromPeers(peers) — infer the dominant pattern + confidence
 *      level (high = 2+ peers match same pattern, medium = 1 peer, low/none).
 *   3. applyPatternToProspect(pattern, first, last, domain) — generate the
 *      predicted email for the new prospect.
 *
 * All Supabase access is via fetch() to the PostgREST endpoint using the
 * same env-var convention as run-pipeline-v2.ts (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY).
 */

import { inferPattern, normalizeNameForEmail } from './pattern-detector.js';
import type { EmailPattern } from './pattern-detector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyPeer {
  name: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PeerPatternResult {
  pattern: EmailPattern | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedPeers: number;
  totalPeers: number;
  sampleEmails: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Generic mailbox prefixes that don't reveal a per-person pattern. */
const GENERIC_LOCAL_PARTS = new Set([
  'info', 'contact', 'hello', 'support', 'sales', 'admin', 'office',
  'help', 'team', 'hr', 'jobs', 'press', 'media', 'marketing',
  'billing', 'accounts', 'noreply', 'no-reply', 'webmaster', 'postmaster',
  'inquiries', 'enquiries', 'general',
]);

/**
 * Suffixes stripped from a company name to match `company_normalized` style.
 * Kept conservative — observed sr_company_contacts data is inconsistent
 * (some rows kept "group", some stripped "cooperative"), so we lean on the
 * ilike fallback in queryCompanyPeers() rather than over-stripping here.
 */
const COMPANY_SUFFIXES: string[] = [
  ' inc.', ' inc', ' llc.', ' llc', ' corp.', ' corp',
  ' ltd.', ' ltd', ' co.', ' co',
  ' incorporated', ' corporation', ' limited',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefix(): string {
  return '[peer-pattern]';
}

/**
 * Normalize a company name the same way `sr_company_contacts.company_normalized`
 * is built: lowercase, drop parentheticals, drop corp suffixes, collapse
 * non-alphanumeric to single spaces, trim.
 *
 * Verified against sample rows on 2026-06-09:
 *   "Pioneer Communications (Pioneer Telephone Association)"
 *      -> "pioneer communications pioneer telephone association"
 *   "Shelby Electric Cooperative (PWR-net / ShelbyFiber)"
 *      -> "shelby electric cooperative pwrnet shelbyfiber"
 */
export function normalizeCompanyName(company: string): string {
  if (!company) return '';
  let s = company.toLowerCase();
  // Drop punctuation but keep parenthetical contents (per observed table data)
  s = s.replace(/[().,/&'"]/g, ' ');
  // Drop trailing corp suffixes
  for (const sfx of COMPANY_SUFFIXES) {
    if (s.endsWith(sfx)) s = s.slice(0, -sfx.length);
  }
  // Collapse hyphens (pwr-net -> pwrnet)
  s = s.replace(/-/g, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Split a full `name` field into first + last (best-effort). */
function splitName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  // Drop middle initials like "Josh M." or "Josh M"
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ').filter(p => {
    // Drop bare single-letter or "X." middle tokens
    const stripped = p.replace(/\./g, '');
    return stripped.length > 1;
  });
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

/** Treat info@, sales@, etc. as non-personal. */
function isGenericEmail(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase();
  if (!local) return true;
  return GENERIC_LOCAL_PARTS.has(local);
}

// ---------------------------------------------------------------------------
// Supabase query
// ---------------------------------------------------------------------------

/**
 * Query `sr_company_contacts` for all contacts at the given company that
 * have a usable, non-generic email. Matches `company_normalized` against
 * a normalized form of the input company name. Returns `[]` on no match,
 * no env vars, or fetch failure.
 */
export async function queryCompanyPeers(company: string): Promise<CompanyPeer[]> {
  if (!company || !company.trim()) return [];

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) {
    console.log(`${prefix()} no Supabase key — skipping peer query`);
    return [];
  }

  const normalized = normalizeCompanyName(company);
  if (!normalized) return [];

  // First attempt: exact match on company_normalized. Fast index lookup.
  const exactUrl = `${sbUrl}/rest/v1/sr_company_contacts`
    + `?select=name,email,company_name,company_normalized`
    + `&company_normalized=eq.${encodeURIComponent(normalized)}`
    + `&email=not.is.null`
    + `&email=neq.`
    + `&limit=50`;

  async function fetchRows(url: string): Promise<Array<{ name?: string; email?: string }>> {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        console.log(`${prefix()} Supabase query failed (${res.status})`);
        return [];
      }
      return (await res.json()) as Array<{ name?: string; email?: string }>;
    } catch (err) {
      console.log(`${prefix()} fetch error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  let rows = await fetchRows(exactUrl);

  // Fallback: if exact match yielded nothing, try ilike on company_name with
  // the most distinctive first 1-2 tokens. Handles cases where the stored
  // company_normalized was built by a different version of the normalizer
  // (e.g. "Citizens Telephone Cooperative" stored as `citizens telephone`,
  // not `citizens telephone cooperative`).
  if (rows.length === 0) {
    const tokens = normalized.split(' ').filter(t => t.length >= 3);
    if (tokens.length > 0) {
      const pattern = tokens.slice(0, 2).join(' ');
      const fallbackUrl = `${sbUrl}/rest/v1/sr_company_contacts`
        + `?select=name,email,company_name,company_normalized`
        + `&company_name=ilike.${encodeURIComponent('%' + pattern + '%')}`
        + `&email=not.is.null`
        + `&email=neq.`
        + `&limit=50`;
      rows = await fetchRows(fallbackUrl);
      if (rows.length > 0) {
        console.log(`${prefix()} fallback ilike "${pattern}" matched ${rows.length} row(s)`);
      }
    }
  }

  const peers: CompanyPeer[] = [];
  for (const row of rows) {
    const name = (row.name || '').trim();
    const email = (row.email || '').trim().toLowerCase();
    if (!name || !email || !email.includes('@')) continue;
    if (isGenericEmail(email)) continue;
    const { firstName, lastName } = splitName(name);
    if (!firstName || !lastName) continue;
    peers.push({ name, email, firstName, lastName });
  }

  console.log(`${prefix()} "${company}" -> normalized="${normalized}" -> ${peers.length} usable peer(s)`);
  return peers;
}

// ---------------------------------------------------------------------------
// Pattern inference
// ---------------------------------------------------------------------------

/**
 * Given 1+ peers (name + verified email), infer the dominant email pattern
 * for the company and assign a confidence level.
 *
 * Confidence rubric:
 *   - high   : 2+ peers all agree on the same pattern (or the only peer pattern
 *              is shared by every classifiable peer). Use directly as GREEN.
 *   - medium : exactly 1 classifiable peer. Use as a candidate to verify via
 *              Path A SMTP — AMBER until SMTP confirms.
 *   - low    : peers exist but their emails don't classify into a known
 *              pattern (e.g. nickname-based, unusual format). Skip.
 *   - none   : no peers, or no classifiable peers.
 */
export function inferPatternFromPeers(peers: CompanyPeer[]): PeerPatternResult {
  if (peers.length === 0) {
    return { pattern: null, confidence: 'none', matchedPeers: 0, totalPeers: 0, sampleEmails: [] };
  }

  const counts: Partial<Record<EmailPattern, number>> = {};
  const matchedSamples: string[] = [];

  for (const peer of peers) {
    const detected = inferPattern(peer.email, peer.firstName, peer.lastName);
    if (detected !== 'unknown') {
      counts[detected] = (counts[detected] || 0) + 1;
      matchedSamples.push(peer.email);
    }
  }

  // Pick most-common pattern
  let bestPattern: EmailPattern | null = null;
  let bestCount = 0;
  for (const [p, c] of Object.entries(counts)) {
    if ((c as number) > bestCount) {
      bestCount = c as number;
      bestPattern = p as EmailPattern;
    }
  }

  if (!bestPattern || bestCount === 0) {
    return {
      pattern: null,
      confidence: 'low',
      matchedPeers: 0,
      totalPeers: peers.length,
      sampleEmails: peers.slice(0, 3).map(p => p.email),
    };
  }

  // Confidence based on classifiable-peer agreement
  const totalClassified = matchedSamples.length;
  let confidence: 'high' | 'medium' | 'low';
  if (bestCount >= 2 && bestCount === totalClassified) {
    confidence = 'high';
  } else if (bestCount >= 2) {
    // 2+ agree but at least one peer classified differently — still high
    // if dominant pattern is >= 2/3 of classifiable peers
    confidence = bestCount / totalClassified >= 0.66 ? 'high' : 'medium';
  } else {
    confidence = 'medium';
  }

  return {
    pattern: bestPattern,
    confidence,
    matchedPeers: bestCount,
    totalPeers: peers.length,
    sampleEmails: matchedSamples.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// Pattern application
// ---------------------------------------------------------------------------

/**
 * Apply a detected pattern to the new prospect's name + domain.
 * Returns the predicted email address (lowercased, ASCII-folded), or null
 * if the names can't be normalized.
 */
export function applyPatternToProspect(
  pattern: EmailPattern,
  firstName: string,
  lastName: string,
  domain: string,
): string | null {
  if (!pattern || pattern === 'unknown') return null;
  if (!firstName || !lastName || !domain) return null;

  const firstVariants = normalizeNameForEmail(firstName);
  const lastVariants = normalizeNameForEmail(lastName);
  if (firstVariants.length === 0 || lastVariants.length === 0) return null;

  const first = firstVariants[0];
  const last = lastVariants[0];
  const cleanDomain = domain.toLowerCase().replace(/^@/, '').trim();
  if (!cleanDomain) return null;

  let local: string | null;
  switch (pattern) {
    case 'first.last': local = `${first}.${last}`; break;
    case 'flast': local = `${first[0]}${last}`; break;
    case 'firstl': local = `${first}${last[0]}`; break;
    case 'first': local = first; break;
    case 'last.first': local = `${last}.${first}`; break;
    case 'first_last': local = `${first}_${last}`; break;
    case 'firstlast': local = `${first}${last}`; break;
    case 'lastf': local = `${last}${first[0]}`; break;
    case 'f.last': local = `${first[0]}.${last}`; break;
    case 'initials': local = `${first[0]}${last[0]}`; break;
    default: local = null;
  }

  if (!local) return null;
  return `${local}@${cleanDomain}`;
}
