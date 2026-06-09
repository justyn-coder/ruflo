/**
 * Apollo client wrapper — FALLBACK-ONLY usage
 *
 * Per P2-PILOT-ALIGNMENT.md v2 amendment (2026-06-09): Apollo is demoted
 * to fallback. The substrate-tagging build delivers 1st-party authoritative
 * data; Apollo fills two specific roles:
 *
 *   1. EMAIL DISCOVERY — Apollo's people-match is genuinely good at this,
 *      and the per-credit cost (~$0.01-0.02) is fine for the email-finder
 *      track. Substrate doesn't surface emails.
 *
 *   2. STRUCTURED FACT TIE-BREAKER — when substrate is silent on a company
 *      (e.g., a small operator with no podcast mentions / no trade press
 *      coverage), Apollo's org enrichment is an acceptable backstop.
 *      Output emits as USE_TO_SHAPE tier (Apollo alone) unless a 2nd
 *      source corroborates within 12 months (apollo_cross → USE_DIRECTLY).
 *
 * Folds three backlog items:
 *   - BL-013: company name normalization (strip ", LLC", ", Inc", etc.)
 *   - BL-014: organization enrichment with volume signal mining
 *   - BL-015: peer-pattern email derivation when prospect not in Apollo
 *
 * Does NOT do tier computation — emits EvidenceRecord[] with source_kind
 * set; the deterministic tier rules in types.ts → tierBySourceKind compute
 * the actual tier downstream.
 */

import type { EvidenceRecord, SourceKind } from './types.js';
import { tierBySourceKind, evidenceRecordId, normalizeCompanyName } from './types.js';
// Note: normalizeCompanyName is exported from substrate-query.ts; for
// independence we re-implement minimal stripping here to avoid circular dep
import { apolloPeopleMatch } from '../email-finder/apollo-fallback.js';

// ----------------------------------------------------------------------------
// BL-013 — Company name normalization
// ----------------------------------------------------------------------------

const CORPORATE_SUFFIX_RE =
  /,?\s+(LLC|Inc|Incorporated|Ltd|Limited|Corp|Corporation|Co|Company|Cooperative|Coop|Co-op|LP|LLP|GmbH|AG)\.?$/i;

/**
 * Strip corporate suffix from a company name before passing to Apollo.
 * Andrew Aeschliman case: CSV "United Fiber, LLC" → Apollo's "United Fiber".
 * Without this strip, Apollo returns no match.
 */
export function normalizeForApollo(raw: string): string {
  return raw.replace(CORPORATE_SUFFIX_RE, '').trim();
}

// ----------------------------------------------------------------------------
// Result shapes
// ----------------------------------------------------------------------------

export interface EmailFindResult {
  /** The discovered email (may be guessed via peer pattern). */
  email: string | null;
  /** Confidence per Apollo's own status mapping. */
  confidence: 'high' | 'medium' | 'low' | 'guessed' | 'not-found';
  /** Where it came from for telemetry. */
  source: 'apollo:direct' | 'apollo:peer-pattern' | 'apollo:no-match' | 'apollo:error';
  /** Cost incurred. */
  creditsUsed: number;
  /** Notes / why this confidence level. */
  notes?: string;
  /** Optional supporting data for downstream use. */
  apolloPersonId?: string;
  linkedinUrl?: string;
  title?: string;
}

export interface OrgEnrichResult {
  /** The company name we sent. */
  query: string;
  /** Whether Apollo had any data on the company. */
  matched: boolean;
  /** Apollo organization ID for later lookups. */
  apolloOrgId?: string;
  /** Authoritative-ish but crowdsourced fields. */
  primaryDomain?: string;
  shortDescription?: string;
  employeeCount?: number;
  estimatedRevenue?: string;
  foundedYear?: number;
  /** Mined volume signals (mile counts, customer counts) extracted from
   *  shortDescription + keywords by a light extractor. */
  volumeSignals: Array<{
    metric: 'miles_of_fiber' | 'customers' | 'locations' | 'employees' | 'revenue';
    value: number | string;
    raw_text: string;
  }>;
  /** Industry / keyword tags. */
  keywords: string[];
  /** Cost incurred. */
  creditsUsed: number;
}

export interface PeerEmailPattern {
  domain: string;
  /** Pattern like "{first_initial}{last}" or "{first}.{last}". */
  format: string;
  /** Confidence based on how many peers we sampled. */
  confidence: 'high' | 'medium' | 'low';
  /** The peers we extracted the pattern from. */
  basedOn: Array<{ name: string; email: string }>;
  creditsUsed: number;
}

// ----------------------------------------------------------------------------
// Light volume-signal extractor (no LLM call — regex over short_description)
// ----------------------------------------------------------------------------

interface VolumeSignal {
  metric: 'miles_of_fiber' | 'customers' | 'locations' | 'employees' | 'revenue';
  value: number | string;
  raw_text: string;
}

/**
 * Mine volume signals from Apollo's `short_description` field using
 * regex patterns. Deterministic; no LLM call.
 *
 * Examples it catches:
 *   "100% fiber optic network spanning over 1,700 miles" → miles_of_fiber: 1700
 *   "over 16,000 active customers" → customers: 16000
 *   "covering 3,900 locations" → locations: 3900
 */
export function mineVolumeSignals(text: string): VolumeSignal[] {
  if (!text) return [];
  const signals: VolumeSignal[] = [];
  const lower = text.toLowerCase();

  // Miles
  const milesMatches = [...lower.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:\+\s*)?\s*(?:miles?|mi)\b/g)];
  for (const m of milesMatches) {
    const num = parseInt(m[1].replace(/,/g, ''), 10);
    if (num > 10) signals.push({ metric: 'miles_of_fiber', value: num, raw_text: m[0] });
  }

  // Customers
  const custMatches = [...lower.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:\+\s*)?\s*(?:active\s+)?(?:customers?|subscribers?|members?)\b/g)];
  for (const m of custMatches) {
    const num = parseInt(m[1].replace(/,/g, ''), 10);
    if (num > 100) signals.push({ metric: 'customers', value: num, raw_text: m[0] });
  }

  // Locations
  const locMatches = [...lower.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:\+\s*)?\s*locations?\b/g)];
  for (const m of locMatches) {
    const num = parseInt(m[1].replace(/,/g, ''), 10);
    if (num > 10) signals.push({ metric: 'locations', value: num, raw_text: m[0] });
  }

  // Revenue
  const revMatches = [...lower.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|m|billion|b)\b/g)];
  for (const m of revMatches) {
    const unit = m[2].toLowerCase().startsWith('b') ? 1e9 : 1e6;
    const num = parseFloat(m[1].replace(/,/g, '')) * unit;
    signals.push({ metric: 'revenue', value: num, raw_text: m[0] });
  }

  return signals;
}

// ----------------------------------------------------------------------------
// Direct Apollo API helpers (we re-implement the org-enrich and peer-search
// since the existing apollo-fallback.ts only does people-match)
// ----------------------------------------------------------------------------

const APOLLO_ORG_ENRICH_URL = 'https://api.apollo.io/api/v1/organizations/enrich';
const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_ORG_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search';
const DEFAULT_TIMEOUT_MS = 15_000;

interface ApolloRequestOptions {
  apiKey?: string;
  timeoutMs?: number;
}

function getApolloKey(options?: ApolloRequestOptions): string | null {
  return options?.apiKey || process.env.APOLLO_API_KEY || null;
}

async function apolloFetch<T>(
  url: string,
  body: Record<string, unknown>,
  options?: ApolloRequestOptions,
): Promise<T | null> {
  const apiKey = getApolloKey(options);
  if (!apiKey) return null;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[apollo-client] ${url} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[apollo-client] ${url} error: ${(err as Error).message}`);
    return null;
  }
}

// ----------------------------------------------------------------------------
// BL-014 — Organization enrichment
// ----------------------------------------------------------------------------

interface ApolloOrgResponse {
  organization?: {
    id?: string;
    name?: string;
    primary_domain?: string;
    short_description?: string;
    estimated_num_employees?: number;
    organization_revenue?: number;
    organization_revenue_printed?: string;
    founded_year?: number;
    keywords?: string[];
  };
}

/**
 * Enrich a company. BL-014 — folded as fallback structured-fact source.
 *
 * Always strips corporate suffix before query (BL-013). Mines volume signals
 * from short_description deterministically (no LLM call).
 *
 * Used by:
 *   - Evidence orchestrator Phase 1 (Pull facts) when substrate-query
 *     returns thin results for this company
 *   - Email-finder Path B as a side-effect during peer-pattern search
 *
 * Cost: 1 credit per matched call (0 if unmatched).
 */
export async function enrichOrganization(
  companyName: string,
  options?: ApolloRequestOptions,
): Promise<OrgEnrichResult> {
  const normalized = normalizeForApollo(companyName);
  const data = await apolloFetch<ApolloOrgResponse>(
    APOLLO_ORG_ENRICH_URL,
    { organization_name: normalized },
    options,
  );

  if (!data?.organization) {
    return {
      query: companyName,
      matched: false,
      volumeSignals: [],
      keywords: [],
      creditsUsed: 0,
    };
  }

  const org = data.organization;
  const description = org.short_description || '';
  const keywords = org.keywords || [];
  const volumeSignals = [
    ...mineVolumeSignals(description),
    // Also mine from keywords (sometimes formatted as e.g. "1,700 miles fiber")
    ...keywords.flatMap(k => mineVolumeSignals(k)),
  ];

  return {
    query: companyName,
    matched: true,
    apolloOrgId: org.id,
    primaryDomain: org.primary_domain,
    shortDescription: description,
    employeeCount: org.estimated_num_employees,
    estimatedRevenue: org.organization_revenue_printed,
    foundedYear: org.founded_year,
    volumeSignals,
    keywords,
    creditsUsed: 1,
  };
}

// ----------------------------------------------------------------------------
// BL-015 — Peer-pattern email derivation
// ----------------------------------------------------------------------------

interface ApolloPeopleSearchResponse {
  people?: Array<{
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    organization?: { name?: string; primary_domain?: string };
  }>;
}

/**
 * When a prospect's own people-match returns no email, find peers at the
 * same domain, sample 3-5, derive the email pattern from them.
 *
 * Andrew Aeschliman demonstration case: Apollo had no email for Andrew,
 * but 9 peers at unitedfiber.com had emails. Sampling one peer (Eric Furr)
 * revealed `efurr@ueci.coop` — pattern is `{first_initial}{last}@ueci.coop`
 * (parent-co domain!). Andrew's correct email is therefore likely
 * `aaeschliman@ueci.coop`, NOT `andrew.aeschliman@unitedfiber.com`.
 *
 * Cost: 1 credit for the people-search + 1 credit per enriched peer
 *       (we enrich the cheapest peer to read their email).
 *       Total typically 2-3 credits per prospect.
 */
export async function derivePeerEmailPattern(
  companyDomain: string,
  options?: ApolloRequestOptions,
): Promise<PeerEmailPattern | null> {
  // Step 1: find peers at the same domain
  const peerSearch = await apolloFetch<ApolloPeopleSearchResponse>(
    APOLLO_PEOPLE_SEARCH_URL,
    {
      q_organization_domains_list: [companyDomain],
      per_page: 10,
    },
    options,
  );

  const peers = peerSearch?.people || [];
  const peersWithEmail = peers.filter(p => p.email && p.first_name && p.last_name);
  if (peersWithEmail.length === 0) return null;

  // Step 2: derive pattern from up to 3 peers
  const sampled = peersWithEmail.slice(0, 3);
  const patternVotes = new Map<string, number>();
  const observations: Array<{ name: string; email: string; pattern: string }> = [];
  const domainVotes = new Map<string, number>();

  for (const peer of sampled) {
    const email = peer.email!.toLowerCase();
    const first = (peer.first_name || '').toLowerCase();
    const last = (peer.last_name || '').toLowerCase();
    const [local, domain] = email.split('@');
    if (!domain) continue;

    domainVotes.set(domain, (domainVotes.get(domain) || 0) + 1);

    let pattern: string | null = null;
    if (local === `${first}.${last}`) pattern = '{first}.{last}';
    else if (local === `${first[0]}${last}`) pattern = '{first_initial}{last}';
    else if (local === `${first}${last}`) pattern = '{first}{last}';
    else if (local === `${first}.${last[0]}`) pattern = '{first}.{last_initial}';
    else if (local === last) pattern = '{last}';
    else if (local === first) pattern = '{first}';
    else pattern = `{custom:${local}}`;

    if (pattern) {
      patternVotes.set(pattern, (patternVotes.get(pattern) || 0) + 1);
      observations.push({ name: `${peer.first_name} ${peer.last_name}`, email, pattern });
    }
  }

  if (patternVotes.size === 0) return null;

  // Pick the most-voted pattern and most-voted domain
  const [topPattern] = [...patternVotes.entries()].sort((a, b) => b[1] - a[1])[0];
  const [topDomain, topDomainCount] = [...domainVotes.entries()].sort((a, b) => b[1] - a[1])[0];

  const conf: 'high' | 'medium' | 'low' =
    observations.length >= 3 && patternVotes.get(topPattern)! >= 2
      ? 'high'
      : observations.length >= 2
        ? 'medium'
        : 'low';

  return {
    domain: topDomain,
    format: topPattern,
    confidence: conf,
    basedOn: observations.map(o => ({ name: o.name, email: o.email })),
    creditsUsed: 1 + sampled.length, // 1 search + N enriches via the people_match each peer was already in
  };
}

/**
 * Render a pattern against a target prospect's name to produce the
 * derived email address.
 */
export function renderPatternForProspect(
  pattern: PeerEmailPattern,
  firstName: string,
  lastName: string,
): string {
  const first = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const last = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const filled = pattern.format
    .replace('{first}', first)
    .replace('{last}', last)
    .replace('{first_initial}', first[0] || '')
    .replace('{last_initial}', last[0] || '');
  return `${filled}@${pattern.domain}`;
}

// ----------------------------------------------------------------------------
// Email finding (orchestrated — direct match first, peer-pattern fallback)
// ----------------------------------------------------------------------------

/**
 * Find an email for a prospect via Apollo. Two-step:
 *   1. Direct people-match (uses BL-013 normalization)
 *   2. If null, peer-pattern derivation (BL-015) against the resolved domain
 *
 * Returns an EmailFindResult that the email-finder track consumes. Composer
 * track does NOT call this directly — composer reads tagged substrate via
 * substrate-query.getCompanyEvidence first.
 */
export async function findEmailForProspect(args: {
  firstName: string;
  lastName: string;
  company: string;
  knownDomain?: string;
  options?: ApolloRequestOptions;
}): Promise<EmailFindResult> {
  const { firstName, lastName, company, knownDomain, options } = args;
  const normalized = normalizeForApollo(company);

  // Step 1: direct match (BL-013 normalization baked in)
  const direct = await apolloPeopleMatch(
    firstName,
    lastName,
    normalized,
    knownDomain,
    { apiKey: getApolloKey(options) || '', timeoutMs: options?.timeoutMs },
  );

  if (direct.email) {
    return {
      email: direct.email,
      confidence:
        direct.confidence === 'not-found'
          ? 'not-found'
          : (direct.confidence as EmailFindResult['confidence']),
      source: 'apollo:direct',
      creditsUsed: 1,
      title: direct.title || undefined,
      linkedinUrl: direct.linkedinUrl || undefined,
      apolloPersonId: direct.source.split(':')[1],
    };
  }

  // Step 2: peer-pattern derivation (BL-015) requires a domain hint
  const domainToUse = knownDomain || direct.domain;
  if (!domainToUse) {
    return {
      email: null,
      confidence: 'not-found',
      source: 'apollo:no-match',
      creditsUsed: 0,
      notes: 'No direct match and no domain hint for peer-pattern derivation.',
    };
  }

  const pattern = await derivePeerEmailPattern(domainToUse, options);
  if (!pattern) {
    return {
      email: null,
      confidence: 'not-found',
      source: 'apollo:no-match',
      creditsUsed: 1,
      notes: 'Direct match failed; peer-pattern derivation could not find peers with emails.',
    };
  }

  const guessedEmail = renderPatternForProspect(pattern, firstName, lastName);
  return {
    email: guessedEmail,
    confidence:
      pattern.confidence === 'high'
        ? 'medium' // pattern-derived even from 3 peers is at best "medium"
        : 'guessed',
    source: 'apollo:peer-pattern',
    creditsUsed: pattern.creditsUsed,
    notes: `Derived from ${pattern.basedOn.length} peer email(s), pattern=${pattern.format}@${pattern.domain}, confidence=${pattern.confidence}`,
  };
}

// ----------------------------------------------------------------------------
// Convert an enrichment to EvidenceRecord[] for the substrate-query write path
// ----------------------------------------------------------------------------

/**
 * Turn an OrgEnrichResult into EvidenceRecord[] so it can be ingested into
 * sr_company_evidence via substrate-query.writeEvidence.
 *
 * Apollo data emits as `apollo` source_kind → USE_TO_SHAPE per the
 * deterministic tier rules. A downstream caller may cross-confirm with a
 * 2nd source dated <12mo to promote to `apollo_cross` → USE_DIRECTLY.
 */
export function enrichmentToEvidence(enrich: OrgEnrichResult): EvidenceRecord[] {
  if (!enrich.matched) return [];
  const out: EvidenceRecord[] = [];
  const baseSource = {
    kind: 'apollo' as SourceKind,
    citation: `apollo:organizations/enrich:${enrich.apolloOrgId || enrich.query}`,
    fetched_at: new Date().toISOString(),
  };

  // Description as a USE_TO_SHAPE claim
  if (enrich.shortDescription) {
    out.push({
      id: evidenceRecordId({ citation: baseSource.citation }, enrich.shortDescription),
      claim: enrich.shortDescription.slice(0, 500),
      source: baseSource,
      tier: tierBySourceKind('apollo'),
      tierReason: 'Apollo short_description — crowdsourced. USE_TO_SHAPE.',
      category: 'company_fact',
    });
  }

  // Mined volume signals (each becomes its own claim)
  for (const sig of enrich.volumeSignals) {
    const claim = `${enrich.query} has approximately ${sig.value} ${sig.metric.replace(/_/g, ' ')} (Apollo). Raw: "${sig.raw_text}"`;
    out.push({
      id: evidenceRecordId({ citation: baseSource.citation }, claim),
      claim: claim.slice(0, 500),
      source: baseSource,
      tier: tierBySourceKind('apollo'),
      tierReason: 'Apollo-mined volume signal. USE_TO_SHAPE until cross-confirmed.',
      category: 'company_fact',
    });
  }

  // Employee count + revenue (less reliable, kept as low-priority claims)
  if (enrich.employeeCount) {
    out.push({
      id: evidenceRecordId({ citation: baseSource.citation }, `employees:${enrich.employeeCount}`),
      claim: `${enrich.query} has approximately ${enrich.employeeCount} employees (Apollo)`,
      source: baseSource,
      tier: tierBySourceKind('apollo'),
      tierReason: 'Apollo employee count estimate. USE_TO_SHAPE.',
      category: 'persona_signal',
    });
  }

  return out;
}

// ----------------------------------------------------------------------------
// Telemetry / credit accounting
// ----------------------------------------------------------------------------

/**
 * Lightweight credit tracker. Caller increments after each Apollo call;
 * orchestrator surfaces total in logs.
 */
export class ApolloCreditTracker {
  private credits = 0;
  add(n: number) {
    this.credits += n;
  }
  total() {
    return this.credits;
  }
  estimatedDollars() {
    // Apollo Starter plan: ~$49/mo for 30,000 credits → $0.0016/credit
    // Apollo Professional: ~$99/mo for 60,000 credits → $0.0017/credit
    // We assume $0.002/credit as a conservative bound.
    return (this.credits * 0.002).toFixed(4);
  }
}
