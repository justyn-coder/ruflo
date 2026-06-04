/**
 * domain-resolver.ts
 *
 * Resolves company names to corporate email domains via a waterfall of tactics:
 *   1. Google Search scraping (injected searchFn)
 *   2. Website extraction (injected fetchFn)
 *   3. Company name -> domain heuristics + DNS MX verification
 *   4. FCC filing lookup (fiber telecom specific)
 *   5. Subsidiary / DBA handling
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
  slug = slug.replace(/[^a-z0-9\s\-]/g, '');
  for (const suffix of COMPANY_SUFFIXES) {
    slug = slug.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }
  slug = slug.trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug;
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
// Tactic 1: Google Search scraping
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

  if (!slug) {
    log(audit, { tactic: 'heuristics', attempted: false, outcome: 'skip', detail: 'empty slug after stripping' });
    return null;
  }

  // Build candidate list — order matters (most likely first)
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (c: string) => {
    const n = normalizeDomain(c);
    if (n && !seen.has(n)) {
      seen.add(n);
      candidates.push(n);
    }
  };

  // Primary guesses
  addCandidate(`${slug}.com`);
  if (hyphenated !== slug) addCandidate(`${hyphenated}.com`);
  addCandidate(`${slug}.net`);
  addCandidate(`${slug}.org`);
  if (hyphenated !== slug) {
    addCandidate(`${hyphenated}.net`);
    addCandidate(`${hyphenated}.org`);
  }

  // Telecom-specific TLDs
  addCandidate(`${slug}.us`);
  addCandidate(`${slug}.io`);

  // Check MX records for each candidate
  const verified: string[] = [];
  const mxChecks = candidates.map(async (domain) => {
    const mx = await withTimeout(resolveDomainsFromMx(domain), opts.timeout);
    if (mx) verified.push(domain);
  });

  await Promise.all(mxChecks);

  if (verified.length > 0) {
    log(audit, {
      tactic: 'heuristics',
      attempted: true,
      outcome: 'success',
      detail: `MX verified: ${verified.join(', ')}`,
    });
    return {
      domain: verified[0],
      confidence: 'medium',
      source: 'heuristics-mx-verified',
      alternativeDomains: verified.length > 1 ? verified.slice(1) : undefined,
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
 * Runs a waterfall of tactics (google search -> website extraction ->
 * heuristics + MX -> FCC filings -> subsidiary lookup) and returns
 * the first successful result, or null if nothing works.
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
  const opts = { searchFn: options?.searchFn, fetchFn: options?.fetchFn, timeout };
  const audit: AuditEntry[] = [];

  // Waterfall: try each tactic in order, stop on first success
  const tactics: Array<() => Promise<DomainResult | null>> = [
    () => tacticGoogleSearch(companyName, opts, audit),
    () => tacticWebsiteExtraction(companyName, companyUrl, opts, audit),
    () => tacticHeuristics(companyName, opts, audit),
    () => tacticFccLookup(companyName, opts, audit),
    () => tacticSubsidiaryLookup(companyName, opts, audit),
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
