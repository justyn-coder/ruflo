/**
 * Substrate-Query API — the unified interface composer (specific + generalized)
 * calls to ask "what do we know about Company X?"
 *
 * Per P2-PILOT-ALIGNMENT.md v2 amendment (2026-06-09): substrate is the
 * PRIMARY structured-fact source, Apollo is fallback. This API abstracts
 * three storage surfaces behind one interface:
 *
 *   - `sr_brain_substrate` (existing, extended with metadata) — 6,512 chunks
 *     tagged by company mention + speaker affiliation + topic
 *   - `sr_company_evidence` (NEW) — per-(company, claim) rows populated by
 *     the 6-agent enrichment workflow (websites + FCC BDC + trade press +
 *     conference bios + trade associations)
 *   - `sr_company_contacts` (NEW) — discovered contacts (name + title +
 *     company + optional email/linkedin)
 *
 * Composer code never queries Supabase directly. It calls this API, gets
 * tiered EvidenceRecord[] back, and dresses them up. That's the contract.
 *
 * Tier promotion happens deterministically via source-kind table (see types.ts
 * `tierBySourceKind`). The query API can apply the cross-source rule
 * (Apollo + 2nd source <12mo → apollo_cross → USE_DIRECTLY) by joining
 * results across source_kind.
 */

import type {
  EvidenceRecord,
  ClaimTier,
  ClaimCategory,
  SourceKind,
} from './types.js';
import { tierBySourceKind, evidenceRecordId } from './types.js';

// ----------------------------------------------------------------------------
// Storage shapes (the wire format that comes back from Supabase)
// ----------------------------------------------------------------------------

/**
 * A row from `sr_brain_substrate` (existing table, extended with metadata).
 *
 * Schema migration to add:
 *   ALTER TABLE sr_brain_substrate
 *     ADD COLUMN IF NOT EXISTS metadata jsonb;
 *   CREATE INDEX IF NOT EXISTS idx_substrate_companies
 *     ON sr_brain_substrate USING GIN ((metadata->'companies_mentioned'));
 *
 * Metadata structure (populated by Agent A substrate tagger):
 *   {
 *     companies_mentioned: string[];     -- normalized company names
 *     speaker_name?: string;
 *     speaker_company?: string;          -- enables speaker-affiliation gate
 *     speaker_role?: string;             -- CEO / COO / VP-Ops / etc.
 *     topics: string[];
 *     claims: Array<{company: string; claim: string}>;
 *   }
 */
export interface SubstrateChunkRow {
  id: string;
  source: string;
  title: string;
  content: string;
  similarity?: number; // from vector search
  metadata?: {
    companies_mentioned?: string[];
    speaker_name?: string;
    speaker_company?: string;
    speaker_role?: string;
    topics?: string[];
    claims?: Array<{ company: string; claim: string }>;
  };
}

/**
 * A row from `sr_company_evidence` (new table).
 *
 * DDL migration:
 *   CREATE TABLE IF NOT EXISTS sr_company_evidence (
 *     id text PRIMARY KEY,
 *     company_name text NOT NULL,
 *     company_normalized text NOT NULL,
 *     claim text NOT NULL,
 *     source_kind text NOT NULL,
 *     source_citation text NOT NULL,
 *     source_date timestamptz,
 *     speaker_name text,
 *     speaker_company text,
 *     speaker_role text,
 *     category text NOT NULL,
 *     extracted_at timestamptz NOT NULL DEFAULT now(),
 *     metadata jsonb
 *   );
 *   CREATE INDEX idx_evidence_company ON sr_company_evidence (company_normalized);
 *   CREATE INDEX idx_evidence_source_kind ON sr_company_evidence (source_kind);
 *   CREATE INDEX idx_evidence_category ON sr_company_evidence (category);
 */
export interface CompanyEvidenceRow {
  id: string;
  company_name: string;
  company_normalized: string;
  claim: string;
  source_kind: SourceKind;
  source_citation: string;
  source_date?: string;
  speaker_name?: string;
  speaker_company?: string;
  speaker_role?: string;
  category: ClaimCategory;
  extracted_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * A row from `sr_company_contacts` (new table).
 *
 * DDL migration:
 *   CREATE TABLE IF NOT EXISTS sr_company_contacts (
 *     id text PRIMARY KEY,
 *     name text NOT NULL,
 *     title text,
 *     company_name text NOT NULL,
 *     company_normalized text NOT NULL,
 *     email text,
 *     linkedin text,
 *     source_kind text NOT NULL,
 *     source_citation text NOT NULL,
 *     discovered_at timestamptz NOT NULL DEFAULT now(),
 *     metadata jsonb
 *   );
 *   CREATE UNIQUE INDEX idx_contacts_unique
 *     ON sr_company_contacts (lower(name), company_normalized);
 *   CREATE INDEX idx_contacts_company ON sr_company_contacts (company_normalized);
 *   CREATE INDEX idx_contacts_email ON sr_company_contacts (email)
 *     WHERE email IS NOT NULL;
 */
export interface CompanyContactRow {
  id: string;
  name: string;
  title?: string;
  company_name: string;
  company_normalized: string;
  email?: string;
  linkedin?: string;
  source_kind: SourceKind;
  source_citation: string;
  discovered_at: string;
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Public Contact type (composers + portal consume this)
// ----------------------------------------------------------------------------

export interface DiscoveredContact {
  name: string;
  title?: string;
  company: string;
  email?: string;
  linkedin?: string;
  source: {
    kind: SourceKind;
    citation: string;
    discovered_at: string;
  };
}

// ----------------------------------------------------------------------------
// Normalization helpers — used everywhere to dedup companies
// ----------------------------------------------------------------------------

const CORPORATE_SUFFIXES = [
  /,?\s+(LLC|Inc|Incorporated|Ltd|Limited|Corp|Corporation|Co|Company|Cooperative|Coop|Co-op|LP|LLP|GmbH|AG)\.?$/i,
];

/**
 * Normalize a company name for dedup + lookup.
 *
 * "United Fiber, LLC" → "united fiber"
 * "Farmers Telecommunications Cooperative" → "farmers telecommunications"
 */
export function normalizeCompanyName(raw: string): string {
  let s = raw.trim();
  for (const re of CORPORATE_SUFFIXES) {
    s = s.replace(re, '');
  }
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ----------------------------------------------------------------------------
// Supabase helpers
// ----------------------------------------------------------------------------

function supabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://slttpknnuthbttjuzrnz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

async function supabaseFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, key } = supabaseConfig();
  if (!key) throw new Error('substrate-query: SUPABASE key missing from env');
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`substrate-query: ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ----------------------------------------------------------------------------
// Core query API — what composers and the orchestrator call
// ----------------------------------------------------------------------------

/**
 * Pull every piece of evidence we have about a specific company.
 *
 * Aggregates across all three storage surfaces:
 *   1. `sr_brain_substrate` chunks where metadata.companies_mentioned contains the name
 *   2. `sr_company_evidence` rows directly tagged to the company
 *   3. (does NOT pull contacts — use `getCompanyContacts` for that)
 *
 * Returns EvidenceRecord[] with tiers already computed by source-kind rules.
 *
 * Used by:
 *   - Evidence orchestrator Phase 1 (Pull facts)
 *   - Specific-mode composer to assemble the dossier
 *   - Portal click-sentence-see-source trace
 */
export async function getCompanyEvidence(
  companyName: string,
  options: { limitPerSource?: number; minSourceDate?: string } = {},
): Promise<EvidenceRecord[]> {
  const normalized = normalizeCompanyName(companyName);
  const limit = options.limitPerSource ?? 50;

  const results: EvidenceRecord[] = [];

  // 1. Substrate chunks mentioning this company
  try {
    const substrateRows = await supabaseFetch<SubstrateChunkRow[]>(
      `/rest/v1/sr_brain_substrate?select=id,source,title,content,metadata` +
        `&metadata->companies_mentioned=cs.${encodeURIComponent(
          JSON.stringify([normalized]),
        )}&limit=${limit}`,
    );
    for (const row of substrateRows) {
      const md = row.metadata || {};
      // Promote substrate chunk to substrate_quoted IF speaker affiliation matches
      // (closes the competitor-claim-leak failure mode from the critique).
      const speakerMatches =
        md.speaker_company &&
        normalizeCompanyName(md.speaker_company) === normalized &&
        md.speaker_role &&
        /^(ceo|coo|cto|vp|chief|president|director|head of|sr\s*vp)/i.test(
          md.speaker_role,
        );
      const sourceKind: SourceKind = speakerMatches ? 'substrate_quoted' : 'substrate';
      const claims = md.claims?.filter(
        c => normalizeCompanyName(c.company) === normalized,
      ) || [];
      for (const c of claims) {
        const tier = tierBySourceKind(sourceKind);
        results.push({
          id: evidenceRecordId({ citation: `${row.source}#${row.id}` }, c.claim),
          claim: c.claim,
          source: {
            kind: sourceKind,
            citation: `${row.source}: ${row.title || row.id}`,
            fetched_at: new Date(0).toISOString(),
          },
          tier,
          tierReason:
            sourceKind === 'substrate_quoted'
              ? `Substrate quote where speaker (${md.speaker_name} as ${md.speaker_role}) is from ${companyName}. USE_DIRECTLY.`
              : 'Substrate chunk mentions company but speaker not affiliated. USE_TO_SHAPE.',
          category: 'company_fact',
        });
      }
    }
  } catch (err) {
    console.warn(`[substrate-query] getCompanyEvidence substrate lookup failed: ${(err as Error).message}`);
  }

  // 2. Direct evidence rows from the multi-source enrichment build
  try {
    const evidenceRows = await supabaseFetch<CompanyEvidenceRow[]>(
      `/rest/v1/sr_company_evidence?company_normalized=eq.${encodeURIComponent(
        normalized,
      )}&limit=${limit}` +
        (options.minSourceDate
          ? `&source_date=gte.${encodeURIComponent(options.minSourceDate)}`
          : ''),
    );
    for (const row of evidenceRows) {
      const tier = tierBySourceKind(row.source_kind);
      results.push({
        id: row.id,
        claim: row.claim,
        source: {
          kind: row.source_kind,
          citation: row.source_citation,
          fetched_at: row.extracted_at,
          sourceDate: row.source_date,
        },
        tier,
        tierReason: `Evidence row from ${row.source_kind} build. Tier computed by source-kind rules.`,
        category: row.category,
      });
    }
  } catch (err) {
    console.warn(`[substrate-query] getCompanyEvidence row lookup failed: ${(err as Error).message}`);
  }

  return results;
}

/**
 * Pull discovered contacts at a specific company.
 *
 * Returns all known people at the company, with emails where available.
 * Used by the email-finder Path B (peer-pattern derivation falls back here)
 * AND by the portal review surface (operator sees who else we know about).
 */
export async function getCompanyContacts(
  companyName: string,
): Promise<DiscoveredContact[]> {
  const normalized = normalizeCompanyName(companyName);
  try {
    const rows = await supabaseFetch<CompanyContactRow[]>(
      `/rest/v1/sr_company_contacts?company_normalized=eq.${encodeURIComponent(
        normalized,
      )}&limit=100`,
    );
    return rows.map(r => ({
      name: r.name,
      title: r.title,
      company: r.company_name,
      email: r.email,
      linkedin: r.linkedin,
      source: {
        kind: r.source_kind,
        citation: r.source_citation,
        discovered_at: r.discovered_at,
      },
    }));
  } catch (err) {
    console.warn(`[substrate-query] getCompanyContacts failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Pull industry-context chunks for a (state, ICP type, persona) shape.
 *
 * Used by:
 *   - Generalized composer (already wired in generalized-composer.ts; that
 *     wrapper calls into `search-substrate` edge fn directly today, but
 *     should migrate to this API once `sr_brain_substrate` is tagged)
 *
 * Currently delegates to the existing search-substrate edge function;
 * post-tagging the implementation can switch to a more targeted query.
 */
export async function getIndustryContext(args: {
  state?: string;
  icpType: 'fiber_operator' | 'ae_firm';
  persona: 'revenue_leader' | 'ops_builder' | 'technical_designer';
  topN?: number;
}): Promise<EvidenceRecord[]> {
  const { state, icpType, persona, topN = 5 } = args;
  const { url, key } = supabaseConfig();
  if (!key) return [];

  const queryParts: string[] = [];
  if (icpType === 'fiber_operator') {
    queryParts.push('fiber operator construction drawing throughput');
  } else {
    queryParts.push('A&E firm fiber design drawing per engineer');
  }
  if (persona === 'revenue_leader') queryParts.push('revenue capital BEAD');
  else if (persona === 'ops_builder') queryParts.push('build schedule permit cycle crew');
  else queryParts.push('GIS CAD traceability automation');
  if (state) queryParts.push(`${state} BEAD broadband`);

  try {
    const res = await fetch(`${url}/functions/v1/search-substrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryParts.join('. '), limit: topN }),
    });
    if (!res.ok) return [];
    const data: { results?: Array<{ id?: string; source?: string; title?: string; content?: string; similarity?: number }> } = await res.json();
    const rows = data.results || [];
    return rows.map((r, i): EvidenceRecord => ({
      id: `ev_industry_${i}_${(r.id || Date.now()).toString().slice(0, 8)}`,
      claim: (r.content || '').slice(0, 500),
      source: {
        kind: 'substrate',
        citation: `${r.source}: ${r.title || 'untitled'}`,
        fetched_at: new Date(0).toISOString(),
      },
      tier: 'USE_TO_SHAPE',
      tierReason: 'Industry context chunk; not company-specific.',
      category: 'industry_context',
    }));
  } catch {
    return [];
  }
}

/**
 * Pull trade-association annual-plan + priorities content.
 *
 * Returned as USE_TO_SHAPE (industry-stated priorities, not company-specific).
 * Composer uses these to ground the bridge/CTA in real industry priorities
 * rather than fabricated framing.
 *
 * Populated by Agent F (trade association deep dive).
 */
export async function getAssociationPriorities(
  options: { matchesCompany?: string; topN?: number } = {},
): Promise<EvidenceRecord[]> {
  const { matchesCompany, topN = 10 } = options;
  try {
    let path = `/rest/v1/sr_company_evidence?source_kind=in.(trade_association_plan,trade_association_blog)&category=eq.industry_context&limit=${topN}`;
    if (matchesCompany) {
      const normalized = normalizeCompanyName(matchesCompany);
      path += `&company_normalized=eq.${encodeURIComponent(normalized)}`;
    }
    const rows = await supabaseFetch<CompanyEvidenceRow[]>(path);
    return rows.map(r => ({
      id: r.id,
      claim: r.claim,
      source: {
        kind: r.source_kind,
        citation: r.source_citation,
        fetched_at: r.extracted_at,
        sourceDate: r.source_date,
      },
      tier: tierBySourceKind(r.source_kind),
      tierReason: 'Trade-association stated priority. Industry context.',
      category: 'industry_context',
    }));
  } catch (err) {
    console.warn(`[substrate-query] getAssociationPriorities failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Pull speaker quotes attributed to a specific company.
 *
 * Filters substrate chunks where:
 *   - companies_mentioned contains the company
 *   - speaker_company === company (speaker-affiliation gate)
 *   - speaker_role is decision-maker-level
 *
 * Returns USE_DIRECTLY tier evidence — these are the highest-confidence
 * quotes we have about a company.
 */
export async function getSpeakerQuotes(
  companyName: string,
): Promise<EvidenceRecord[]> {
  const all = await getCompanyEvidence(companyName);
  return all.filter(e => e.source.kind === 'substrate_quoted');
}

// ----------------------------------------------------------------------------
// Writer API — used by the workflow agents + by future ingestion code
// ----------------------------------------------------------------------------

/**
 * Bulk insert evidence rows. Used by Agents B/C/D/E/F when they finish
 * extracting facts from their respective sources.
 *
 * Dedupes by id (hash of citation + claim); duplicate inserts merge.
 */
export async function writeEvidence(
  records: Array<Omit<CompanyEvidenceRow, 'id' | 'extracted_at' | 'company_normalized'> & { id?: string }>,
): Promise<{ inserted: number; failed: number }> {
  if (records.length === 0) return { inserted: 0, failed: 0 };
  const rows = records.map(r => ({
    id:
      r.id ||
      evidenceRecordId({ citation: r.source_citation }, r.claim),
    company_name: r.company_name,
    company_normalized: normalizeCompanyName(r.company_name),
    claim: r.claim,
    source_kind: r.source_kind,
    source_citation: r.source_citation,
    source_date: r.source_date,
    speaker_name: r.speaker_name,
    speaker_company: r.speaker_company,
    speaker_role: r.speaker_role,
    category: r.category,
    extracted_at: new Date().toISOString(),
    metadata: r.metadata,
  }));

  try {
    await supabaseFetch(`/rest/v1/sr_company_evidence?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    return { inserted: rows.length, failed: 0 };
  } catch (err) {
    console.warn(`[substrate-query] writeEvidence failed: ${(err as Error).message}`);
    return { inserted: 0, failed: rows.length };
  }
}

/**
 * Bulk insert contact rows. Used by Agents E + F.
 *
 * Dedupes by (lower(name), company_normalized); duplicate inserts merge
 * (lets later sources improve/correct earlier data, e.g. add email if
 * first source had only name+title).
 */
export async function writeContacts(
  contacts: Array<Omit<CompanyContactRow, 'id' | 'discovered_at' | 'company_normalized'> & { id?: string }>,
): Promise<{ inserted: number; failed: number }> {
  if (contacts.length === 0) return { inserted: 0, failed: 0 };
  const rows = contacts.map(c => ({
    id:
      c.id ||
      evidenceRecordId(
        { citation: c.source_citation },
        `${c.name}@${c.company_name}`,
      ),
    name: c.name,
    title: c.title,
    company_name: c.company_name,
    company_normalized: normalizeCompanyName(c.company_name),
    email: c.email,
    linkedin: c.linkedin,
    source_kind: c.source_kind,
    source_citation: c.source_citation,
    discovered_at: new Date().toISOString(),
    metadata: c.metadata,
  }));

  try {
    await supabaseFetch(`/rest/v1/sr_company_contacts?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    return { inserted: rows.length, failed: 0 };
  } catch (err) {
    console.warn(`[substrate-query] writeContacts failed: ${(err as Error).message}`);
    return { inserted: 0, failed: rows.length };
  }
}

/**
 * Health check — returns row counts per surface. Used by the orchestrator
 * to know whether the evidence base is populated enough to query, and by
 * the portal to surface "X facts about this prospect" badge.
 */
export async function getEvidenceBaseHealth(): Promise<{
  substrateChunks: number;
  taggedSubstrateChunks: number;
  companyEvidenceRows: number;
  companyContactRows: number;
  companiesWithEvidence: number;
}> {
  const counts = await Promise.allSettled([
    supabaseFetch<[{ count: number }]>(
      `/rest/v1/sr_brain_substrate?select=count`,
      { headers: { Prefer: 'count=exact' } },
    ),
    supabaseFetch<[{ count: number }]>(
      `/rest/v1/sr_brain_substrate?select=count&metadata=not.is.null`,
      { headers: { Prefer: 'count=exact' } },
    ),
    supabaseFetch<[{ count: number }]>(
      `/rest/v1/sr_company_evidence?select=count`,
      { headers: { Prefer: 'count=exact' } },
    ),
    supabaseFetch<[{ count: number }]>(
      `/rest/v1/sr_company_contacts?select=count`,
      { headers: { Prefer: 'count=exact' } },
    ),
    supabaseFetch<Array<{ company_normalized: string }>>(
      `/rest/v1/sr_company_evidence?select=company_normalized&limit=10000`,
    ),
  ]);

  const get = <T,>(r: PromiseSettledResult<T>): T | undefined =>
    r.status === 'fulfilled' ? r.value : undefined;

  return {
    substrateChunks: get(counts[0])?.[0]?.count ?? 0,
    taggedSubstrateChunks: get(counts[1])?.[0]?.count ?? 0,
    companyEvidenceRows: get(counts[2])?.[0]?.count ?? 0,
    companyContactRows: get(counts[3])?.[0]?.count ?? 0,
    companiesWithEvidence: (() => {
      const rows = get(counts[4]) || [];
      return new Set(rows.map(r => r.company_normalized)).size;
    })(),
  };
}

// ----------------------------------------------------------------------------
// What this API does NOT expose (intentionally)
// ----------------------------------------------------------------------------
// - Direct table writes — agents call writeEvidence/writeContacts, not raw SQL
// - LLM extraction — that's the agents' job; this layer is storage only
// - Tier computation — happens in callers via tierBySourceKind(); we just
//   return source_kind so the orchestrator decides
// - Vector search — delegated to existing search-substrate edge function
//   for industry queries; specific company queries use indexed metadata
// - Cross-source dedup at write time — duplicates collapse by id (hash of
//   citation + claim); composer can re-dedupe at read time if needed
