/**
 * domain-resolver.ts
 *
 * Resolves company names to corporate email domains via a waterfall of tactics:
 *   A. Clearbit Company Autocomplete (free, purpose-built, highest signal)
 *   B. Person + company email search (finds published emails directly)
 *   C. Filtered web search (social-media excluded)
 *   1. Website extraction (injected fetchFn)
 *   2. Company name -> domain heuristics + DNS MX verification
 *   3. FCC filing lookup (fiber telecom specific)
 *   4. Subsidiary / DBA handling
 *
 * All network I/O is dependency-injected (searchFn, fetchFn) so the module
 * is fully testable with no external dependencies beyond Node.js builtins.
 */

import { promises as dns, MxRecord } from 'dns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainResult {
  domain: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  alternativeDomains?: string[];
  emailsFound?: string[];
}

export interface ResolveOptions {
  /** Injected web search — returns an array of result snippets/URLs */
  searchFn?: (query: string) => Promise<string[]>;
  /** Injected web fetch — returns raw HTML/text of a page */
  fetchFn?: (url: string) => Promise<string>;
  /** Per-tactic timeout in ms (default 10 000) */
  timeout?: number;
  /** Contact's first name — enables person+company email search tactic */
  firstName?: string;
  /** Contact's last name — enables person+company email search tactic */
  lastName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

/** Suffixes stripped when generating domain guesses from a company name. */
const COMPANY_SUFFIXES = [
  'incorporated', 'inc', 'llc', 'llp', 'corp', 'corporation',
  'co', 'company', 'ltd', 'limited', 'group', 'holdings',
  'engineering', 'communications', 'fiber', 'broadband', 'telecom',
  'telecommunications', 'technologies', 'technology', 'tech',
  'services', 'solutions', 'enterprises', 'network', 'networks',
];

/** Corporate-suffix words to try appending back to the stripped slug. */
const APPEND_SUFFIXES = ['inc', 'corp', 'llc', 'ltd', 'group', 'grp'];

/** Patterns that signal a subsidiary/DBA relationship. */
const SUBSIDIARY_PATTERNS = [
  /a\s+(?:division|subsidiary|unit|brand)\s+of\s+["']?([^"',.<]+)/i,
  /(?:subsidiary|division)\s+of\s+["']?([^"',.<]+)/i,
  /formerly\s+(?:known\s+as|called)\s+["']?([^"',.<]+)/i,
  /(?:owned|operated)\s+by\s+["']?([^"',.<]+)/i,
  /(?:part|member)\s+of\s+["']?([^"',.<]+)/i,
  /doing\s+business\s+as\s+["']?([^"',.<]+)/i,
  /d\.?b\.?a\.?\s+["']?([^"',.<]+)/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a promise with a timeout. Resolves null on timeout instead of throwing. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Normalize a domain string: lowercase, strip www., trim whitespace/dots. */
function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^www\./, '')
    .replace(/[./]+$/, '')
    .replace(/^\.+/, '');
}

/** Extract all email addresses from a block of text. */
function extractEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(re) ?? [];
  const unique = [...new Set(matches.map((e) => e.toLowerCase()))];
  // Filter out image/file-like false positives
  return unique.filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif'),
  );
}

/** Extract plausible domains from a set of URLs / text snippets. */
function extractDomainsFromResults(results: string[]): string[] {
  const domainSet = new Set<string>();
  const urlRe = /https?:\/\/([\w.\-]+)/gi;
  for (const snippet of results) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(snippet)) !== null) {
      const d = normalizeDomain(m[1]);
      if (
        d &&
        !d.includes('google') &&
        !d.includes('linkedin') &&
        !d.includes('facebook') &&
        !d.includes('twitter') &&
        !d.includes('youtube') &&
        !d.includes('wikipedia') &&
        !d.includes('bing') &&
        !d.includes('yahoo') &&
        !d.includes('reddit')
      ) {
        domainSet.add(d);
      }
    }
  }
  return [...domainSet];
}

/**
 * Turn a company name into a slug suitable for domain guessing.
 * "Dobson Fiber Inc." -> "dobsonfiber"
 */
function companyToSlug(name: string): string {
  let slug = name.toLowerCase().trim();
  // Replace + with nothing
  slug = slug.replace(/\+/g, '');
  // Remove punctuation
  slug = slug.replace(/[^a-z0-9\s\-]/g, '');
  // Strip known suffixes (word-boundary match)
  for (const suffix of COMPANY_SUFFIXES) {
    slug = slug.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  slug = slug.trim().replace(/\s+/g, '');
  return slug;
}

/**
 * Generate a hyphenated variant: "Dobson Fiber" -> "dobson-fiber"
 */
function companyToHyphenated(name: string): string {
  let slug = name.toLowerCase().trim();
  slug = slug.replace(/\+/g, '');
  slug = slug.replace(/[^a-z0-9\s\-]/g, '');
  for (const suffix of COMPANY_SUFFIXES) {
    slug = slug.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  slug = slug.trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug;
}

/**
 * Full company name as slug with NO suffix stripping (keeps descriptors
 * like "networks", "telecom", "communications").
 * "Render Networks" -> "rendernetworks"
 */
function companyToFullSlug(name: string): string {
  let slug = name.toLowerCase().trim();
  // Replace + with nothing
  slug = slug.replace(/\+/g, '');
  // Remove punctuation except spaces/hyphens
  slug = slug.replace(/[^a-z0-9\s\-]/g, '');
  // Only strip legal suffixes (inc, llc, llp, corp, corporation, ltd, limited, co, company, holdings)
  const legalOnly = [
    'incorporated', 'inc', 'llc', 'llp', 'corp', 'corporation',
    'co', 'company', 'ltd', 'limited', 'holdings',
  ];
  for (const suffix of legalOnly) {
    slug = slug.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  slug = slug.trim().replace(/\s+/g, '');
  return slug;
}

/**
 * Full company name as hyphenated slug with NO suffix stripping.
 * "Mohawk Networks" -> "mohawk-networks"
 */
function companyToFullHyphenated(name: string): string {
  let slug = name.toLowerCase().trim();
  slug = slug.replace(/\+/g, '');
  slug = slug.replace(/[^a-z0-9\s\-]/g, '');
  const legalOnly = [
    'incorporated', 'inc', 'llc', 'llp', 'corp', 'corporation',
    'co', 'company', 'ltd', 'limited', 'holdings',
  ];
  for (const suffix of legalOnly) {
    slug = slug.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  slug = slug.trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug;
}

/**
 * Generate acronym from company name initials.
 * "Fiber Optic Solutions" -> "fos"
 */
function companyToAcronym(name: string): string {
  let cleaned = name.toLowerCase().trim();
  cleaned = cleaned.replace(/\+/g, '');
  cleaned = cleaned.replace(/[^a-z0-9\s\-]/g, '');
  // Strip legal suffixes only
  const legalOnly = [
    'incorporated', 'inc', 'llc', 'llp', 'corp', 'corporation',
    'co', 'company', 'ltd', 'limited', 'holdings',
  ];
  for (const suffix of legalOnly) {
    cleaned = cleaned.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  const words = cleaned.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return '';
  return words.map((w) => w[0]).join('');
}

// ---------------------------------------------------------------------------
// DNS MX helper (exported for reuse)
// ---------------------------------------------------------------------------

/**
 * Check whether a domain has valid MX records — i.e. it can receive email.
 * Returns the MX records if found, or null.
 */
export async function resolveDomainsFromMx(
  domain: string,
): Promise<MxRecord[] | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (records && records.length > 0) {
      return records;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

interface AuditEntry {
  tactic: string;
  attempted: boolean;
  outcome: 'success' | 'fail' | 'skip';
  detail?: string;
}

function log(entries: AuditEntry[], entry: AuditEntry): void {
  entries.push(entry);
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

type SearchFn = (query: string) => Promise<string[]>;
type FetchFn = (url: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Social-media domains to exclude from URL-based results
// ---------------------------------------------------------------------------

const SOCIAL_DOMAINS = [
  'x.com', 'twitter.com', 'linkedin.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com',
  'wikipedia.org', 'pinterest.com',
];

function isSocialDomain(hostname: string): boolean {
  const h = hostname.replace(/^www\./, '').toLowerCase();
  return SOCIAL_DOMAINS.some((sd) => h === sd || h.endsWith(`.${sd}`));
}

// ---------------------------------------------------------------------------
// Tactic A: Clearbit Company Autocomplete (FREE, no API key)
// ---------------------------------------------------------------------------

async function tacticClearbit(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'fetchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.fetchFn) {
    log(audit, { tactic: 'clearbit-autocomplete', attempted: false, outcome: 'skip', detail: 'no fetchFn provided' });
    return null;
  }

  const encoded = encodeURIComponent(companyName);
  const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encoded}`;

  const raw = await withTimeout(opts.fetchFn(url), opts.timeout);
  if (!raw) {
    log(audit, { tactic: 'clearbit-autocomplete', attempted: true, outcome: 'fail', detail: 'fetch returned nothing' });
    return null;
  }

  try {
    const results = JSON.parse(raw);
    if (Array.isArray(results) && results.length > 0) {
      // Clearbit ranks by relevance — first result is best match
      const best = results[0] as { name?: string; domain?: string; logo?: string };
      if (best.domain) {
        const domain = normalizeDomain(best.domain);
        log(audit, {
          tactic: 'clearbit-autocomplete',
          attempted: true,
          outcome: 'success',
          detail: `matched "${best.name}" -> ${domain}`,
        });
        return {
          domain,
          confidence: 'high',
          source: 'clearbit-autocomplete',
          emailsFound: [],
        };
      }
    }
  } catch {
    // JSON parse failure — non-JSON response
  }

  log(audit, { tactic: 'clearbit-autocomplete', attempted: true, outcome: 'fail', detail: 'no domain in response' });
  return null;
}

// ---------------------------------------------------------------------------
// Tactic B: Person + Company email search
// ---------------------------------------------------------------------------

async function tacticPersonEmailSearch(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn' | 'fetchFn' | 'firstName' | 'lastName'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.firstName || !opts.lastName) {
    log(audit, { tactic: 'person-email-search', attempted: false, outcome: 'skip', detail: 'no firstName/lastName' });
    return null;
  }
  if (!opts.searchFn) {
    log(audit, { tactic: 'person-email-search', attempted: false, outcome: 'skip', detail: 'no searchFn provided' });
    return null;
  }

  const query = `"${opts.firstName} ${opts.lastName}" "${companyName}" "@" -site:linkedin.com -site:twitter.com -site:facebook.com`;
  const results = await withTimeout(opts.searchFn(query), opts.timeout);
  if (!results || results.length === 0) {
    log(audit, { tactic: 'person-email-search', attempted: true, outcome: 'fail', detail: 'search returned no results' });
    return null;
  }

  // Check URLs text for email addresses
  const allText = results.join(' ');
  const emails = extractEmails(allText);

  // If search results are URLs, also try to fetch each and look for emails
  if (emails.length === 0 && opts.fetchFn) {
    for (const urlOrSnippet of results.slice(0, 5)) {
      if (!urlOrSnippet.startsWith('http')) continue;
      // Skip social media URLs
      try {
        const hostname = new URL(urlOrSnippet).hostname;
        if (isSocialDomain(hostname)) continue;
      } catch { continue; }

      const pageHtml = await withTimeout(opts.fetchFn(urlOrSnippet), opts.timeout);
      if (!pageHtml) continue;

      const pageEmails = extractEmails(pageHtml);
      // Look for emails that match the person's name
      const nameMatch = pageEmails.filter((e) => {
        const local = e.split('@')[0].toLowerCase();
        const first = opts.firstName!.toLowerCase();
        const last = opts.lastName!.toLowerCase();
        return local.includes(first) || local.includes(last);
      });

      if (nameMatch.length > 0) {
        const domain = normalizeDomain(nameMatch[0].split('@')[1]);
        log(audit, {
          tactic: 'person-email-search',
          attempted: true,
          outcome: 'success',
          detail: `found person email on ${urlOrSnippet}`,
        });
        return {
          domain,
          confidence: 'high',
          source: `person-email-search: ${urlOrSnippet}`,
          emailsFound: nameMatch,
        };
      }
    }
  }

  if (emails.length > 0) {
    // Filter for emails matching the person's name
    const first = opts.firstName.toLowerCase();
    const last = opts.lastName.toLowerCase();
    const nameMatch = emails.filter((e) => {
      const local = e.split('@')[0].toLowerCase();
      return local.includes(first) || local.includes(last);
    });
    const bestEmail = nameMatch.length > 0 ? nameMatch[0] : emails[0];
    const domain = normalizeDomain(bestEmail.split('@')[1]);
    log(audit, {
      tactic: 'person-email-search',
      attempted: true,
      outcome: 'success',
      detail: `found email in search result text: ${bestEmail}`,
    });
    return {
      domain,
      confidence: 'high',
      source: 'person-email-search',
      emailsFound: nameMatch.length > 0 ? nameMatch : [bestEmail],
    };
  }

  log(audit, { tactic: 'person-email-search', attempted: true, outcome: 'fail', detail: 'no emails found' });
  return null;
}

// ---------------------------------------------------------------------------
// Tactic C: Filtered web search (social-media excluded)
// ---------------------------------------------------------------------------

async function tacticFilteredWebSearch(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.searchFn) {
    log(audit, { tactic: 'filtered-web-search', attempted: false, outcome: 'skip', detail: 'no searchFn provided' });
    return null;
  }

  const slug = companyToSlug(companyName);
  const query = `"${companyName}" official site OR website OR "contact us" -twitter -linkedin -facebook -instagram -youtube -reddit`;
  const results = await withTimeout(opts.searchFn(query), opts.timeout);
  if (!results || results.length === 0) {
    log(audit, { tactic: 'filtered-web-search', attempted: true, outcome: 'fail', detail: 'search returned no results' });
    return null;
  }

  // Extract domains from URLs, filtering out social media
  const urlRe = /https?:\/\/([\w.\-]+)/gi;
  const candidateDomains: string[] = [];
  for (const snippet of results) {
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(snippet)) !== null) {
      const d = normalizeDomain(m[1]);
      if (!d || isSocialDomain(d)) continue;
      // Skip search engines too
      if (d.includes('google') || d.includes('bing') || d.includes('yahoo') || d.includes('duckduckgo')) continue;
      if (!candidateDomains.includes(d)) candidateDomains.push(d);
    }
  }

  if (candidateDomains.length === 0) {
    log(audit, { tactic: 'filtered-web-search', attempted: true, outcome: 'fail', detail: 'no non-social domains found' });
    return null;
  }

  // Prefer domain whose hostname contains a distinctive token from the company name
  const slugTokens = slug.length >= 4 ? [slug] : [];
  // Also try individual words from the company name (3+ chars)
  const nameWords = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 4);

  const preferred = candidateDomains.find((d) => {
    const base = d.split('.')[0];
    return slugTokens.some((t) => base.includes(t)) || nameWords.some((w) => base.includes(w));
  });

  const chosen = preferred ?? candidateDomains[0];

  log(audit, {
    tactic: 'filtered-web-search',
    attempted: true,
    outcome: 'success',
    detail: `found domain: ${chosen} (preferred=${!!preferred})`,
  });
  return {
    domain: normalizeDomain(chosen),
    confidence: preferred ? 'medium' : 'low',
    source: `filtered-web-search`,
    alternativeDomains: candidateDomains.filter((d) => d !== chosen).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Tactic 1: Google Search scraping (legacy — kept for backwards compatibility)
// ---------------------------------------------------------------------------

async function tacticGoogleSearch(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn' | 'fetchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.searchFn) {
    log(audit, { tactic: 'google-search', attempted: false, outcome: 'skip', detail: 'no searchFn provided' });
    return null;
  }

  const slug = companyToSlug(companyName);
  const queries = [
    `"${companyName}" site:linkedin.com/company`,
    `"${companyName}" fiber broadband official site`,
    `"@${slug}" email`,
    `"${companyName}" contact email`,
  ];

  for (const query of queries) {
    const results = await withTimeout(opts.searchFn(query), opts.timeout);
    if (!results || results.length === 0) continue;

    // Look for emails in results
    const allText = results.join(' ');
    const emails = extractEmails(allText);
    if (emails.length > 0) {
      const domain = normalizeDomain(emails[0].split('@')[1]);
      log(audit, {
        tactic: 'google-search',
        attempted: true,
        outcome: 'success',
        detail: `found email in search results for query: ${query}`,
      });
      return {
        domain,
        confidence: 'high',
        source: `google-search: ${query}`,
        emailsFound: emails,
      };
    }

    // Look for corporate domains in URLs
    const domains = extractDomainsFromResults(results);
    if (domains.length > 0) {
      // Prefer domains that contain part of the company name
      const preferred = domains.find((d) => d.includes(slug) || slug.includes(d.split('.')[0]));
      const chosen = preferred ?? domains[0];
      log(audit, {
        tactic: 'google-search',
        attempted: true,
        outcome: 'success',
        detail: `found domain from search URLs for query: ${query}`,
      });
      return {
        domain: normalizeDomain(chosen),
        confidence: preferred ? 'medium' : 'low',
        source: `google-search: ${query}`,
        alternativeDomains: domains.filter((d) => d !== chosen),
      };
    }
  }

  log(audit, { tactic: 'google-search', attempted: true, outcome: 'fail', detail: 'no domains found across all queries' });
  return null;
}

// ---------------------------------------------------------------------------
// Tactic 2: Website extraction
// ---------------------------------------------------------------------------

async function tacticWebsiteExtraction(
  companyName: string,
  companyUrl: string | undefined,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn' | 'fetchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.fetchFn) {
    log(audit, { tactic: 'website-extraction', attempted: false, outcome: 'skip', detail: 'no fetchFn provided' });
    return null;
  }

  // Determine URL to fetch
  let url = companyUrl;
  if (!url) {
    // Try the most obvious domain guess
    const slug = companyToSlug(companyName);
    if (slug) {
      url = `https://${slug}.com`;
    }
  }

  if (!url) {
    log(audit, { tactic: 'website-extraction', attempted: false, outcome: 'skip', detail: 'no URL to fetch' });
    return null;
  }

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  const html = await withTimeout(opts.fetchFn(url), opts.timeout);
  if (!html) {
    log(audit, { tactic: 'website-extraction', attempted: true, outcome: 'fail', detail: `fetch returned nothing for ${url}` });
    return null;
  }

  // Extract canonical domain from the URL we fetched
  const urlMatch = url.match(/https?:\/\/([\w.\-]+)/);
  const urlDomain = urlMatch ? normalizeDomain(urlMatch[1]) : null;

  // Extract emails from page
  const emails = extractEmails(html);
  if (emails.length > 0) {
    const emailDomain = normalizeDomain(emails[0].split('@')[1]);
    log(audit, {
      tactic: 'website-extraction',
      attempted: true,
      outcome: 'success',
      detail: `found ${emails.length} email(s) on page ${url}`,
    });
    return {
      domain: emailDomain,
      confidence: 'high',
      source: `website-extraction: ${url}`,
      emailsFound: emails,
      alternativeDomains: urlDomain && urlDomain !== emailDomain ? [urlDomain] : undefined,
    };
  }

  // No emails but we have the domain from the URL
  if (urlDomain) {
    log(audit, {
      tactic: 'website-extraction',
      attempted: true,
      outcome: 'success',
      detail: `no emails found, using URL domain from ${url}`,
    });
    return {
      domain: urlDomain,
      confidence: 'medium',
      source: `website-extraction: ${url}`,
    };
  }

  log(audit, { tactic: 'website-extraction', attempted: true, outcome: 'fail', detail: `no useful data from ${url}` });
  return null;
}

// ---------------------------------------------------------------------------
// Tactic 3: Company name -> domain heuristics + MX verification
// ---------------------------------------------------------------------------

async function tacticHeuristics(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  const slug = companyToSlug(companyName);
  const hyphenated = companyToHyphenated(companyName);
  const fullSlug = companyToFullSlug(companyName);
  const fullHyphenated = companyToFullHyphenated(companyName);
  const acronym = companyToAcronym(companyName);
  const nameLower = companyName.toLowerCase().trim();

  if (!slug) {
    log(audit, { tactic: 'heuristics', attempted: false, outcome: 'skip', detail: 'empty slug after stripping' });
    return null;
  }

  // All TLDs to try — .tech and .io added for modern companies (Fix 7)
  const TLDS = ['com', 'net', 'org', 'us', 'io', 'tech'];

  // Build candidate list — order matters (most likely first)
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (c: string) => {
    const n = normalizeDomain(c);
    if (n && !seen.has(n) && n.includes('.')) {
      seen.add(n);
      candidates.push(n);
    }
  };

  // --- Tier 1: stripped slug across TLDs ---
  for (const tld of TLDS) {
    addCandidate(`${slug}.${tld}`);
  }

  // --- Tier 2: full slug (no descriptor stripping) across TLDs (Fix 4) ---
  if (fullSlug !== slug) {
    for (const tld of TLDS) {
      addCandidate(`${fullSlug}.${tld}`);
    }
  }

  // --- Tier 3: hyphenated variants (Fix 5) ---
  if (hyphenated !== slug) {
    for (const tld of TLDS) {
      addCandidate(`${hyphenated}.${tld}`);
    }
  }
  if (fullHyphenated !== fullSlug && fullHyphenated !== hyphenated) {
    for (const tld of TLDS) {
      addCandidate(`${fullHyphenated}.${tld}`);
    }
  }

  // --- Tier 4: "the" prefix (Fix 2) ---
  const startsWithThe = nameLower.startsWith('the ') || nameLower.startsWith('the-');
  if (!startsWithThe && slug.length > 2) {
    for (const tld of TLDS) {
      addCandidate(`the${slug}.${tld}`);
    }
    if (fullSlug !== slug) {
      for (const tld of TLDS) {
        addCandidate(`the${fullSlug}.${tld}`);
      }
    }
  }

  // --- Tier 5: slug + corporate suffix (Fix 3) ---
  // Always generate inc/corp/llc appended variants — many telecom companies
  // use the suffix in their domain even when casual references omit it.
  for (const corpSuffix of APPEND_SUFFIXES) {
    // .com and .net only for unconditional appends (limit explosion)
    addCandidate(`${slug}${corpSuffix}.com`);
    addCandidate(`${slug}${corpSuffix}.net`);

    // Full TLD spread only if the company name actually contains the suffix
    const nameWords = nameLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    if (nameWords.some((w) => w === corpSuffix)) {
      for (const tld of TLDS) {
        addCandidate(`${slug}${corpSuffix}.${tld}`);
      }
    }
    // Also try for fullSlug if different
    if (fullSlug !== slug) {
      addCandidate(`${fullSlug}${corpSuffix}.com`);
      addCandidate(`${fullSlug}${corpSuffix}.net`);
    }
  }

  // --- Tier 6: acronym-based (Fix 6) ---
  if (acronym && acronym.length >= 2 && acronym !== slug) {
    for (const tld of TLDS) {
      addCandidate(`${acronym}.${tld}`);
    }
    // acronym + corporate suffixes (e.g. fos-llc)
    for (const corpSuffix of ['llc', 'inc', 'corp']) {
      addCandidate(`${acronym}-${corpSuffix}.com`);
      addCandidate(`${acronym}${corpSuffix}.com`);
    }
  }

  // --- Tier 7: abbreviated forms for names with "Telecom"/"Communications"/etc. ---
  // "LCC Telecom" -> "lcctelecom", "Hawaiian Telcom" -> "hawaiiantel"
  // Track which bases came from this logic for ranking later
  const telecomConcats = new Set<string>();
  const telecomAbbrevs: Record<string, string[]> = {
    'telecommunications': ['telecom', 'tel'],
    'telecom': ['telecom', 'tel'],
    'telcom': ['telcom', 'tel'],
    'communications': ['comm', 'com'],
    'technologies': ['tech'],
    'technology': ['tech'],
    'engineering': ['eng'],
    'broadband': ['broadband', 'bb'],
    'insurance': ['ins'],
  };
  for (const [word, abbrevs] of Object.entries(telecomAbbrevs)) {
    if (nameLower.includes(word)) {
      const beforeWord = nameLower.split(word)[0]
        .replace(/[^a-z0-9]/g, '');
      if (beforeWord) {
        for (const abbrev of abbrevs) {
          const base = `${beforeWord}${abbrev}`;
          telecomConcats.add(base);
          for (const tld of TLDS) {
            addCandidate(`${base}.${tld}`);
          }
        }
      }
    }
  }

  // Check MX records for all candidates in parallel
  const verified: string[] = [];
  const mxChecks = candidates.map(async (domain) => {
    const mx = await withTimeout(resolveDomainsFromMx(domain), opts.timeout);
    if (mx) verified.push(domain);
  });

  await Promise.all(mxChecks);

  if (verified.length > 0) {
    // Fix 1: smarter primary selection
    // Prefer the domain whose base name most closely matches the full slug or slug
    const primary = pickBestDomain(verified, slug, fullSlug, acronym, companyName, telecomConcats);
    const alternatives = verified.filter((d) => d !== primary);

    log(audit, {
      tactic: 'heuristics',
      attempted: true,
      outcome: 'success',
      detail: `MX verified: ${verified.join(', ')} | primary: ${primary}`,
    });
    return {
      domain: primary,
      confidence: 'medium',
      source: 'heuristics-mx-verified',
      alternativeDomains: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  log(audit, {
    tactic: 'heuristics',
    attempted: true,
    outcome: 'fail',
    detail: `no MX records for candidates: ${candidates.join(', ')}`,
  });
  return null;
}

/**
 * Pick the best domain from a set of MX-verified candidates.
 *
 * Key insight: for telecom companies, the "full slug" (with descriptors like
 * "networks", "telecom") is often the actual domain. The stripped slug is a
 * fallback. We rank by specificity: more-specific bases beat shorter ones.
 */
function pickBestDomain(
  verified: string[],
  slug: string,
  fullSlug: string,
  acronym: string,
  companyName: string,
  telecomConcats: Set<string>,
): string {
  const TLD_RANK: Record<string, number> = {
    'com': 0, 'net': 1, 'org': 2, 'us': 3, 'io': 4, 'tech': 5,
  };

  const nameLower = companyName.toLowerCase();
  // Check if company name originally contained corporate suffixes
  const nameContainsInc = /\binc\b/i.test(nameLower);
  const nameContainsCorp = /\bcorp\b/i.test(nameLower);
  const nameContainsLlc = /\bllc\b/i.test(nameLower);
  const nameContainsLtd = /\bltd\b/i.test(nameLower);

  // Score each candidate
  const scored = verified.map((domain) => {
    const dotIdx = domain.indexOf('.');
    const base = dotIdx > 0 ? domain.substring(0, dotIdx) : domain;
    const tld = dotIdx > 0 ? domain.substring(dotIdx + 1) : '';
    const tldRank = TLD_RANK[tld] ?? 10;

    // Priority tiers — lower = better:
    // 0 = slug+corporate-suffix when name had that suffix (immcoinc.com for IMMCO Inc.)
    // 1 = full slug match (rendernetworks.com for Render Networks)
    // 1 = telecom-concatenated forms from abbrev logic (lcctelecom, nomadtelecom)
    // 2 = stripped slug match (esri.com for Esri) — most common case
    // 2 = "the" prefix variant (thetalentpartners for TalentPartners)
    // 3 = abbreviated telecom variant (hawaiiantel for Hawaiian Telcom)
    // 4 = speculative slug+suffix (dycominc when name doesn't say Inc.)
    // 5 = acronym
    // 6 = everything else

    let matchTier = 6;

    // Check if base is a known telecom-concatenated form from abbrev logic
    const isTelecomConcat = telecomConcats.has(base);

    // Slug + corporate suffix matches when name actually contains the suffix
    if (nameContainsInc && (base === `${slug}inc` || base === `${fullSlug}inc`)) matchTier = 0;
    else if (nameContainsCorp && (base === `${slug}corp` || base === `${fullSlug}corp`)) matchTier = 0;
    else if (nameContainsLlc && (base === `${slug}llc` || base === `${fullSlug}llc`)) matchTier = 0;
    else if (nameContainsLtd && (base === `${slug}ltd` || base === `${fullSlug}ltd`)) matchTier = 0;
    // Full slug (with descriptors kept) — more specific = more likely correct
    else if (base === fullSlug && fullSlug !== slug && fullSlug.length > slug.length) matchTier = 1;
    // Telecom concatenated forms (lcctelecom, nomadtelecom, bookereng)
    else if (isTelecomConcat) matchTier = 1;
    // Stripped slug — the safest default
    else if (base === slug) matchTier = 2;
    // "the" prefix variants — very common for companies that can't get bare domain
    else if (base === `the${slug}` || base === `the${fullSlug}`) matchTier = 2;
    // Abbreviated telecom variants (e.g. "hawaiiantel" for "Hawaiian Telcom")
    // Must be a prefix of the full slug and shorter (not suffix-appended)
    else if (base.length > 4 && base.length < fullSlug.length && fullSlug.startsWith(base)) matchTier = 3;
    // Speculative slug + corporate suffix (name doesn't contain the suffix)
    else if (base === `${slug}inc` || base === `${slug}corp` || base === `${slug}llc`
          || base === `${slug}ltd` || base === `${slug}group` || base === `${slug}grp`) matchTier = 4;
    // Acronym
    else if (acronym && (base === acronym || base.startsWith(acronym))) matchTier = 5;
    // Anything else
    else matchTier = 6;

    return { domain, matchTier, tldRank };
  });

  scored.sort((a, b) => a.matchTier - b.matchTier || a.tldRank - b.tldRank);
  return scored[0].domain;
}

// ---------------------------------------------------------------------------
// Tactic 4: FCC filing lookup (fiber telecom specific)
// ---------------------------------------------------------------------------

async function tacticFccLookup(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn' | 'fetchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.fetchFn && !opts.searchFn) {
    log(audit, { tactic: 'fcc-lookup', attempted: false, outcome: 'skip', detail: 'no fetchFn or searchFn' });
    return null;
  }

  // Strategy A: search for FCC filings containing the company + email
  if (opts.searchFn) {
    const query = `site:fcc.gov "${companyName}" email contact`;
    const results = await withTimeout(opts.searchFn(query), opts.timeout);
    if (results && results.length > 0) {
      const allText = results.join(' ');
      const emails = extractEmails(allText);
      if (emails.length > 0) {
        const domain = normalizeDomain(emails[0].split('@')[1]);
        log(audit, {
          tactic: 'fcc-lookup',
          attempted: true,
          outcome: 'success',
          detail: `found email in FCC search results`,
        });
        return {
          domain,
          confidence: 'high',
          source: 'fcc-filing-search',
          emailsFound: emails,
        };
      }
    }
  }

  // Strategy B: fetch FCC search page directly
  if (opts.fetchFn) {
    const encoded = encodeURIComponent(companyName);
    const fccUrl = `https://www.fcc.gov/search#q=${encoded}&t=all`;
    const html = await withTimeout(opts.fetchFn(fccUrl), opts.timeout);
    if (html) {
      const emails = extractEmails(html);
      if (emails.length > 0) {
        const domain = normalizeDomain(emails[0].split('@')[1]);
        log(audit, {
          tactic: 'fcc-lookup',
          attempted: true,
          outcome: 'success',
          detail: `found email on FCC page`,
        });
        return {
          domain,
          confidence: 'high',
          source: 'fcc-filing-page',
          emailsFound: emails,
        };
      }
    }
  }

  log(audit, { tactic: 'fcc-lookup', attempted: true, outcome: 'fail', detail: 'no emails found in FCC sources' });
  return null;
}

// ---------------------------------------------------------------------------
// Tactic 5: Subsidiary / DBA handling
// ---------------------------------------------------------------------------

async function tacticSubsidiaryLookup(
  companyName: string,
  opts: Required<Pick<ResolveOptions, 'timeout'>> & Pick<ResolveOptions, 'searchFn'>,
  audit: AuditEntry[],
): Promise<DomainResult | null> {
  if (!opts.searchFn) {
    log(audit, { tactic: 'subsidiary-lookup', attempted: false, outcome: 'skip', detail: 'no searchFn' });
    return null;
  }

  const queries = [
    `"${companyName}" "a division of" OR "a subsidiary of" OR "formerly known as"`,
    `"${companyName}" parent company`,
  ];

  for (const query of queries) {
    const results = await withTimeout(opts.searchFn(query), opts.timeout);
    if (!results || results.length === 0) continue;

    const allText = results.join(' ');

    // Look for subsidiary patterns
    const parentNames: string[] = [];
    for (const pattern of SUBSIDIARY_PATTERNS) {
      const match = pattern.exec(allText);
      if (match && match[1]) {
        const parentName = match[1].trim();
        if (parentName.length > 2 && parentName.length < 60) {
          parentNames.push(parentName);
        }
      }
    }

    if (parentNames.length === 0) continue;

    // For each potential parent, try MX-verified domain guesses
    for (const parent of parentNames) {
      const parentSlug = companyToSlug(parent);
      if (!parentSlug) continue;

      const parentCandidates = [
        `${parentSlug}.com`,
        `${parentSlug}.net`,
        `${parentSlug}.org`,
      ];

      for (const candidate of parentCandidates) {
        const mx = await withTimeout(resolveDomainsFromMx(candidate), opts.timeout);
        if (mx) {
          // Also try the brand domain
          const brandSlug = companyToSlug(companyName);
          const brandCandidates = [`${brandSlug}.com`, `${brandSlug}.net`];
          const altDomains: string[] = [];
          for (const bc of brandCandidates) {
            const brandMx = await withTimeout(resolveDomainsFromMx(bc), opts.timeout);
            if (brandMx) altDomains.push(bc);
          }

          log(audit, {
            tactic: 'subsidiary-lookup',
            attempted: true,
            outcome: 'success',
            detail: `"${companyName}" -> parent "${parent}" -> ${candidate}`,
          });
          return {
            domain: candidate,
            confidence: 'medium',
            source: `subsidiary-lookup: parent="${parent}"`,
            alternativeDomains: altDomains.length > 0 ? altDomains : undefined,
          };
        }
      }
    }
  }

  log(audit, { tactic: 'subsidiary-lookup', attempted: true, outcome: 'fail', detail: 'no parent domain resolved' });
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Resolve a company name to its corporate email domain.
 *
 * Runs a waterfall of tactics (clearbit -> person-email-search ->
 * filtered-web-search -> website extraction -> heuristics + MX ->
 * FCC filings -> subsidiary lookup) and returns the first successful
 * result, or null if nothing works.
 *
 * @param companyName - The company name to resolve (e.g. "Dobson Fiber")
 * @param companyUrl  - Optional known website URL
 * @param options     - Injected dependencies and configuration
 * @returns           - DomainResult with the resolved domain, or null
 */
export async function resolveDomain(
  companyName: string,
  companyUrl?: string,
  options?: ResolveOptions,
): Promise<DomainResult | null> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const opts = {
    searchFn: options?.searchFn,
    fetchFn: options?.fetchFn,
    timeout,
    firstName: options?.firstName,
    lastName: options?.lastName,
  };
  const audit: AuditEntry[] = [];

  // Waterfall: data-driven order (tactic-eval 2026-06-05 against 83 booth contacts)
  // Heuristic+MX first (44.6%) — best for niche fiber companies
  // Clearbit second (22.9%) — good for well-known companies, but returns WRONG
  //   results for niche firms if run first (Booker Engineering -> booker.com)
  // DuckDuckGo search (B/C) REMOVED — 0% hit rate on both person and company search
  // Person search kept but deprioritized — needs Bing API to be useful
  const tactics: Array<() => Promise<DomainResult | null>> = [
    () => tacticWebsiteExtraction(companyName, companyUrl, opts, audit),
    () => tacticHeuristics(companyName, opts, audit),
    () => tacticClearbit(companyName, opts, audit),
    () => tacticPersonEmailSearch(companyName, opts, audit),
    () => tacticFccLookup(companyName, opts, audit),
    () => tacticSubsidiaryLookup(companyName, opts, audit),
    // tacticFilteredWebSearch removed — DuckDuckGo returns 0% correct domains
  ];

  for (const tactic of tactics) {
    try {
      const result = await tactic();
      if (result) {
        // Attach full audit trail to source for debugging
        result.source = `${result.source} | audit: ${audit.map((a) => `${a.tactic}:${a.outcome}`).join(', ')}`;
        return result;
      }
    } catch {
      // Tactic threw — log and continue to next
      const tacticName = audit.length > 0 ? audit[audit.length - 1].tactic : 'unknown';
      log(audit, {
        tactic: tacticName,
        attempted: true,
        outcome: 'fail',
        detail: 'unhandled exception',
      });
    }
  }

  return null;
}
