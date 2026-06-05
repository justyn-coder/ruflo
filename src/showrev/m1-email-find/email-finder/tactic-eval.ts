/**
 * tactic-eval.ts — Independent tactic evaluation against 83 known-email contacts.
 *
 * Goal: measure each email-finder tactic in isolation so we can build
 * an evidence-based decision tree instead of guessing at waterfall order.
 *
 * Tactics:
 *   A  Heuristic + MX (offline — DNS only)
 *   B  Industry-context person search (DuckDuckGo + page fetch)
 *   C  Industry-context company search (DuckDuckGo)
 *   D  Clearbit Autocomplete with strict name match
 *   E  DMARC rua= extraction (offline — DNS only)
 *   F  M365 Graph user-exists check (online — only M365 domains)
 *
 * Run offline (A + E only, seconds):
 *   npx tsx src/showrev/m1-email-find/email-finder/tactic-eval.ts --offline
 *
 * Run full (all tactics, ~8-10 min per online tactic):
 *   source engine/.env && export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && \
 *   npx tsx src/showrev/m1-email-find/email-finder/tactic-eval.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { promises as dns } from 'dns';
import { resolveDomain, resolveDomainsFromMx } from './domain-resolver.js';
import { detectPatternFromDmarc, inferPattern } from './pattern-detector.js';
import { detectMailProvider, verifyM365Email } from './smtp-verifier.js';
import type { DomainResult } from './domain-resolver.js';
import type { MailProvider } from './smtp-verifier.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CSV_PATH = new URL(
  '../../../../data/showrev/fiber-connect-2026-booth-scans.csv',
  import.meta.url,
).pathname;

const RESULTS_DIR = new URL(
  '../../../../data/showrev/premium/test-runs/',
  import.meta.url,
).pathname;

const OFFLINE = process.argv.includes('--offline');
const VERBOSE = process.argv.includes('--verbose');

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'comcast.net', 'me.com',
  'live.com', 'msn.com', 'protonmail.com',
]);

const TYPO_ENDINGS = ['.cok', '.con', '.om'];

const SOCIAL_DOMAINS = [
  'x.com', 'twitter.com', 'linkedin.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com',
  'wikipedia.org', 'pinterest.com',
];

// ---------------------------------------------------------------------------
// CSV parsing (same as test-harness.ts)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---------------------------------------------------------------------------
// Test case type
// ---------------------------------------------------------------------------

interface TestCase {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  knownEmail: string;
  knownDomain: string;
}

// ---------------------------------------------------------------------------
// Load test cases
// ---------------------------------------------------------------------------

function loadTestCases(): TestCase[] {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const dataLines = lines.slice(1);

  const seen = new Set<string>();
  const cases: TestCase[] = [];

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    const email = (fields[3] ?? '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;

    if (seen.has(email)) continue;
    seen.add(email);

    const domain = email.split('@')[1];
    if (!domain) continue;
    if (PERSONAL_DOMAINS.has(domain)) continue;
    if (TYPO_ENDINGS.some((t) => email.endsWith(t))) continue;

    cases.push({
      firstName: (fields[1] ?? '').trim(),
      lastName: (fields[2] ?? '').trim(),
      company: (fields[10] ?? '').trim(),
      title: (fields[8] ?? '').trim(),
      knownEmail: email,
      knownDomain: domain,
    });
  }

  return cases;
}

// ---------------------------------------------------------------------------
// Rate limiting + timeout helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo search (real network)
// ---------------------------------------------------------------------------

async function ddgSearch(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const urls: string[] = [];
  const urlRegex = /uddg=([^&"]+)/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith('http')) {
        const hostname = new URL(decoded).hostname.replace(/^www\./, '');
        const isSocial = SOCIAL_DOMAINS.some(
          (sd) => hostname === sd || hostname.endsWith('.' + sd),
        );
        if (!isSocial && !hostname.includes('duckduckgo')) {
          urls.push(decoded);
        }
      }
    } catch { /* bad URL */ }
  }
  return urls.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Real web fetch
// ---------------------------------------------------------------------------

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return '';
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/') && !contentType.includes('application/json')) return '';
  const text = await res.text();
  return text.slice(0, 50_000);
}

// ---------------------------------------------------------------------------
// Email extraction helper
// ---------------------------------------------------------------------------

function extractEmails(text: string): string[] {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(re) ?? [];
  const unique = [...new Set(matches.map((e) => e.toLowerCase()))];
  return unique.filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif'),
  );
}

// ---------------------------------------------------------------------------
// Domain normalization
// ---------------------------------------------------------------------------

function normalizeDomain(raw: string): string {
  return raw.toLowerCase().trim().replace(/^www\./, '').replace(/[./]+$/, '').replace(/^\.+/, '');
}

// ---------------------------------------------------------------------------
// Tactic result types
// ---------------------------------------------------------------------------

interface TacticResult {
  contact: TestCase;
  foundDomain: string | null;
  foundEmail: string | null;
  domainCorrect: boolean;
  emailCorrect: boolean;
  detail: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// TACTIC A: Heuristic + MX (offline)
// ---------------------------------------------------------------------------

async function tacticA(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC A: Heuristic + MX ---');
  const results: TacticResult[] = [];
  const noopSearch = async (_q: string): Promise<string[]> => [];
  const noopFetch = async (_u: string): Promise<string> => '';

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`  [${i + 1}/${cases.length}] Testing ${tc.company} — ${tc.firstName} ${tc.lastName}...\r`);

    try {
      const result: DomainResult | null = await resolveDomain(tc.company, undefined, {
        searchFn: noopSearch,
        fetchFn: noopFetch,
        timeout: 5_000,
      });

      const foundDomain = result?.domain ?? null;
      const domainCorrect = foundDomain === tc.knownDomain;
      const inAlternatives = !domainCorrect && (result?.alternativeDomains ?? []).includes(tc.knownDomain);

      results.push({
        contact: tc,
        foundDomain,
        foundEmail: null,
        domainCorrect,
        emailCorrect: false,
        detail: domainCorrect
          ? `correct: ${foundDomain}`
          : inAlternatives
            ? `in-alternatives (primary: ${foundDomain})`
            : foundDomain
              ? `wrong: ${foundDomain} (expected: ${tc.knownDomain})`
              : `no domain found`,
      });
    } catch (err) {
      results.push({
        contact: tc,
        foundDomain: null,
        foundEmail: null,
        domainCorrect: false,
        emailCorrect: false,
        detail: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  console.log();
  return results;
}

// ---------------------------------------------------------------------------
// TACTIC B: Industry-context person search (online)
// ---------------------------------------------------------------------------

async function tacticB(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC B: Person + industry search ---');
  const results: TacticResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`  [${i + 1}/${cases.length}] Testing ${tc.company} — ${tc.firstName} ${tc.lastName}...\r`);

    try {
      const query = `"${tc.firstName} ${tc.lastName}" "${tc.company}" fiber OR broadband OR engineering "@"`;
      const searchResults = await withTimeout(ddgSearch(query), 10_000);

      if (!searchResults || searchResults.length === 0) {
        results.push({
          contact: tc,
          foundDomain: null,
          foundEmail: null,
          domainCorrect: false,
          emailCorrect: false,
          detail: 'no search results',
        });
        await delay(2000);
        continue;
      }

      // Check search result URLs for emails
      let allText = searchResults.join(' ');
      let foundEmails = extractEmails(allText);

      // Fetch top 5 pages if no emails in URLs
      if (foundEmails.length === 0) {
        for (const url of searchResults.slice(0, 5)) {
          if (!url.startsWith('http')) continue;
          try {
            const hostname = new URL(url).hostname;
            if (SOCIAL_DOMAINS.some((sd) => hostname.replace(/^www\./, '') === sd || hostname.endsWith('.' + sd))) continue;
          } catch { continue; }

          const pageHtml = await withTimeout(fetchPage(url), 10_000);
          if (pageHtml) {
            foundEmails.push(...extractEmails(pageHtml));
          }
        }
      }

      if (foundEmails.length > 0) {
        // Filter for name-matching emails
        const first = tc.firstName.toLowerCase();
        const last = tc.lastName.toLowerCase();
        const nameMatch = foundEmails.filter((e) => {
          const local = e.split('@')[0].toLowerCase();
          return local.includes(first) || local.includes(last);
        });

        const bestEmail = nameMatch.length > 0 ? nameMatch[0] : foundEmails[0];
        const bestDomain = bestEmail.split('@')[1];
        const emailCorrect = bestEmail === tc.knownEmail;
        const domainCorrect = bestDomain === tc.knownDomain;

        results.push({
          contact: tc,
          foundDomain: bestDomain,
          foundEmail: bestEmail,
          domainCorrect,
          emailCorrect,
          detail: emailCorrect
            ? `exact email match: ${bestEmail}`
            : domainCorrect
              ? `domain correct, wrong email: ${bestEmail}`
              : `wrong: ${bestEmail} (expected: ${tc.knownEmail})`,
        });
      } else {
        // Try to extract domain from search result URLs
        const candidateDomains: string[] = [];
        for (const url of searchResults) {
          try {
            const hostname = normalizeDomain(new URL(url).hostname);
            if (!SOCIAL_DOMAINS.some((sd) => hostname === sd || hostname.endsWith('.' + sd))) {
              if (!hostname.includes('google') && !hostname.includes('bing') && !hostname.includes('duckduckgo')) {
                if (!candidateDomains.includes(hostname)) candidateDomains.push(hostname);
              }
            }
          } catch { /* bad URL */ }
        }

        const domainMatch = candidateDomains.find((d) => d === tc.knownDomain);
        results.push({
          contact: tc,
          foundDomain: domainMatch ?? candidateDomains[0] ?? null,
          foundEmail: null,
          domainCorrect: !!domainMatch,
          emailCorrect: false,
          detail: domainMatch
            ? `domain from URLs: ${domainMatch}`
            : candidateDomains.length > 0
              ? `wrong domain from URLs: ${candidateDomains[0]}`
              : 'no emails or domains found',
        });
      }
    } catch (err) {
      results.push({
        contact: tc,
        foundDomain: null,
        foundEmail: null,
        domainCorrect: false,
        emailCorrect: false,
        detail: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await delay(2000);
  }
  console.log();
  return results;
}

// ---------------------------------------------------------------------------
// TACTIC C: Industry-context company search (online)
// ---------------------------------------------------------------------------

async function tacticC(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC C: Company + industry search ---');
  const results: TacticResult[] = [];

  // Dedupe by company to avoid re-searching the same company
  const companyMap = new Map<string, TestCase[]>();
  for (const tc of cases) {
    const key = tc.company.toLowerCase().trim();
    const arr = companyMap.get(key) ?? [];
    arr.push(tc);
    companyMap.set(key, arr);
  }

  const companyResults = new Map<string, { domain: string | null; detail: string }>();
  let companyIdx = 0;
  const totalCompanies = companyMap.size;

  for (const [companyKey, contacts] of companyMap) {
    const tc = contacts[0]; // Use first contact as representative
    companyIdx++;
    process.stdout.write(`  [${companyIdx}/${totalCompanies}] Searching ${tc.company}...\r`);

    try {
      const query = `"${tc.company}" fiber OR telecom OR broadband official site -twitter -linkedin -facebook`;
      const searchResults = await withTimeout(ddgSearch(query), 10_000);

      if (!searchResults || searchResults.length === 0) {
        companyResults.set(companyKey, { domain: null, detail: 'no search results' });
        await delay(2000);
        continue;
      }

      // Extract domains from URLs
      const candidateDomains: string[] = [];
      for (const url of searchResults) {
        try {
          const hostname = normalizeDomain(new URL(url).hostname);
          if (!SOCIAL_DOMAINS.some((sd) => hostname === sd || hostname.endsWith('.' + sd))) {
            if (!hostname.includes('google') && !hostname.includes('bing') && !hostname.includes('duckduckgo')) {
              if (!candidateDomains.includes(hostname)) candidateDomains.push(hostname);
            }
          }
        } catch { /* bad URL */ }
      }

      // Prefer domain that contains company name tokens
      const slug = tc.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const words = tc.company.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 4);

      const preferred = candidateDomains.find((d) => {
        const base = d.split('.')[0];
        return base.includes(slug) || slug.includes(base) || words.some((w) => base.includes(w));
      });

      const chosen = preferred ?? candidateDomains[0] ?? null;
      companyResults.set(companyKey, {
        domain: chosen,
        detail: chosen ? `found: ${chosen}` : 'no suitable domain in results',
      });
    } catch (err) {
      companyResults.set(companyKey, {
        domain: null,
        detail: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    await delay(2000);
  }
  console.log();

  // Map company results back to all contacts
  for (const tc of cases) {
    const key = tc.company.toLowerCase().trim();
    const cr = companyResults.get(key)!;
    const domainCorrect = cr.domain === tc.knownDomain;

    results.push({
      contact: tc,
      foundDomain: cr.domain,
      foundEmail: null,
      domainCorrect,
      emailCorrect: false,
      detail: domainCorrect ? `correct: ${cr.domain}` : cr.detail,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// TACTIC D: Clearbit Autocomplete with strict name match (online)
// ---------------------------------------------------------------------------

async function tacticD(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC D: Clearbit Autocomplete ---');
  const results: TacticResult[] = [];

  // Dedupe by company
  const companyMap = new Map<string, TestCase[]>();
  for (const tc of cases) {
    const key = tc.company.toLowerCase().trim();
    const arr = companyMap.get(key) ?? [];
    arr.push(tc);
    companyMap.set(key, arr);
  }

  const companyResults = new Map<string, { domain: string | null; matchedName: string | null; overlap: number; detail: string }>();
  let companyIdx = 0;
  const totalCompanies = companyMap.size;

  for (const [companyKey, contacts] of companyMap) {
    const tc = contacts[0];
    companyIdx++;
    process.stdout.write(`  [${companyIdx}/${totalCompanies}] Clearbit: ${tc.company}...\r`);

    try {
      const encoded = encodeURIComponent(tc.company);
      const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encoded}`;
      const raw = await withTimeout(fetchPage(url), 10_000);

      if (!raw) {
        companyResults.set(companyKey, { domain: null, matchedName: null, overlap: 0, detail: 'no response' });
        await delay(1000);
        continue;
      }

      let parsed: Array<{ name?: string; domain?: string }>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        companyResults.set(companyKey, { domain: null, matchedName: null, overlap: 0, detail: 'invalid JSON' });
        await delay(1000);
        continue;
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        companyResults.set(companyKey, { domain: null, matchedName: null, overlap: 0, detail: 'empty results' });
        await delay(1000);
        continue;
      }

      // Check token overlap for each result
      const companyTokens = tc.company.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const LEGAL_SUFFIXES = new Set(['inc', 'llc', 'llp', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'the']);
      const companySignificantTokens = companyTokens.filter((t) => !LEGAL_SUFFIXES.has(t));

      let bestMatch: { name: string; domain: string; overlap: number } | null = null;

      for (const result of parsed.slice(0, 5)) {
        if (!result.domain || !result.name) continue;

        const resultTokens = result.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const resultSignificant = resultTokens.filter((t) => !LEGAL_SUFFIXES.has(t));

        // Calculate token overlap (percentage of our tokens that appear in their name)
        const matchCount = companySignificantTokens.filter((t) =>
          resultSignificant.some((rt) => rt.includes(t) || t.includes(rt)),
        ).length;
        const overlap = companySignificantTokens.length > 0
          ? matchCount / companySignificantTokens.length
          : 0;

        if (overlap > (bestMatch?.overlap ?? 0)) {
          bestMatch = { name: result.name, domain: normalizeDomain(result.domain), overlap };
        }
      }

      if (bestMatch && bestMatch.overlap > 0.8) {
        companyResults.set(companyKey, {
          domain: bestMatch.domain,
          matchedName: bestMatch.name,
          overlap: bestMatch.overlap,
          detail: `matched "${bestMatch.name}" (${(bestMatch.overlap * 100).toFixed(0)}% overlap) -> ${bestMatch.domain}`,
        });
      } else if (bestMatch) {
        companyResults.set(companyKey, {
          domain: null,
          matchedName: bestMatch.name,
          overlap: bestMatch.overlap,
          detail: `rejected: "${bestMatch.name}" only ${(bestMatch.overlap * 100).toFixed(0)}% overlap (need >80%)`,
        });
      } else {
        companyResults.set(companyKey, { domain: null, matchedName: null, overlap: 0, detail: 'no matching results' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      companyResults.set(companyKey, {
        domain: null,
        matchedName: null,
        overlap: 0,
        detail: msg.includes('429') ? 'rate-limited (429)' : `error: ${msg.slice(0, 60)}`,
      });
    }

    await delay(1000);
  }
  console.log();

  // Map back to all contacts
  for (const tc of cases) {
    const key = tc.company.toLowerCase().trim();
    const cr = companyResults.get(key)!;
    const domainCorrect = cr.domain === tc.knownDomain;

    results.push({
      contact: tc,
      foundDomain: cr.domain,
      foundEmail: null,
      domainCorrect,
      emailCorrect: false,
      detail: domainCorrect ? `correct: ${cr.domain} (${cr.matchedName})` : cr.detail,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// TACTIC E: DMARC rua= extraction (offline — DNS only)
// ---------------------------------------------------------------------------

async function tacticE(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC E: DMARC rua= extraction ---');
  const results: TacticResult[] = [];

  // Dedupe by known domain
  const domainMap = new Map<string, TestCase[]>();
  for (const tc of cases) {
    const arr = domainMap.get(tc.knownDomain) ?? [];
    arr.push(tc);
    domainMap.set(tc.knownDomain, arr);
  }

  const domainResults = new Map<string, {
    dmarcEmails: string[];
    patternDetected: string | null;
    detail: string;
  }>();

  let domainIdx = 0;
  const totalDomains = domainMap.size;

  for (const [domain, contacts] of domainMap) {
    domainIdx++;
    process.stdout.write(`  [${domainIdx}/${totalDomains}] DMARC: ${domain}...\r`);

    try {
      const dmarcResult = await withTimeout(detectPatternFromDmarc(domain), 5_000);

      if (!dmarcResult) {
        domainResults.set(domain, { dmarcEmails: [], patternDetected: null, detail: 'no DMARC record or no rua=' });
        continue;
      }

      const emails = dmarcResult.sampleEmails ?? [];
      let patternDetected = dmarcResult.pattern !== 'unknown' ? dmarcResult.pattern : null;

      // Try to match DMARC emails against known contacts at this domain
      if (!patternDetected && emails.length > 0) {
        for (const dmarcEmail of emails) {
          for (const tc of contacts) {
            const matched = inferPattern(dmarcEmail, tc.firstName, tc.lastName);
            if (matched !== 'unknown') {
              patternDetected = matched;
              break;
            }
          }
          if (patternDetected) break;
        }
      }

      domainResults.set(domain, {
        dmarcEmails: emails,
        patternDetected,
        detail: emails.length > 0
          ? `found ${emails.length} email(s): ${emails.join(', ')}${patternDetected ? ` — pattern: ${patternDetected}` : ''}`
          : 'DMARC exists but no rua= emails at this domain',
      });
    } catch (err) {
      domainResults.set(domain, {
        dmarcEmails: [],
        patternDetected: null,
        detail: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  console.log();

  // Map back to all contacts
  for (const tc of cases) {
    const dr = domainResults.get(tc.knownDomain)!;

    // Check if any DMARC email matches this contact
    const emailMatch = dr.dmarcEmails.find((e) => e === tc.knownEmail);

    results.push({
      contact: tc,
      foundDomain: tc.knownDomain, // We're cheating — using known domain
      foundEmail: emailMatch ?? null,
      domainCorrect: true, // Always true since we use known domain
      emailCorrect: !!emailMatch,
      detail: dr.detail,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// TACTIC F: M365 Graph user-exists check (online)
// ---------------------------------------------------------------------------

async function tacticF(cases: TestCase[]): Promise<TacticResult[]> {
  console.log('\n--- TACTIC F: M365 Graph user-exists ---');
  const results: TacticResult[] = [];

  // First detect which domains are M365
  const domainProviders = new Map<string, MailProvider>();
  const uniqueDomains = [...new Set(cases.map((tc) => tc.knownDomain))];

  console.log(`  Detecting providers for ${uniqueDomains.length} domains...`);
  for (const domain of uniqueDomains) {
    try {
      const provider = await withTimeout(detectMailProvider(domain), 5_000);
      domainProviders.set(domain, provider ?? 'unknown');
    } catch {
      domainProviders.set(domain, 'unknown');
    }
  }

  const m365Domains = uniqueDomains.filter((d) => domainProviders.get(d) === 'microsoft-365');
  const m365Cases = cases.filter((tc) => domainProviders.get(tc.knownDomain) === 'microsoft-365');
  console.log(`  ${m365Domains.length} M365 domains, ${m365Cases.length} contacts to test`);

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const provider = domainProviders.get(tc.knownDomain) ?? 'unknown';

    if (provider !== 'microsoft-365') {
      results.push({
        contact: tc,
        foundDomain: null,
        foundEmail: null,
        domainCorrect: false,
        emailCorrect: false,
        detail: `skipped: provider is ${provider}, not M365`,
      });
      continue;
    }

    process.stdout.write(`  [${i + 1}/${cases.length}] M365 check: ${tc.knownEmail}...\r`);

    try {
      // Test the known-correct email
      const correctResult = await withTimeout(verifyM365Email(tc.knownEmail), 10_000);
      const correctValid = correctResult?.status === 'valid';

      // Test a wrong email to confirm the API discriminates
      const wrongEmail = `xyztest9999@${tc.knownDomain}`;
      const wrongResult = await withTimeout(verifyM365Email(wrongEmail), 10_000);
      const wrongRejected = wrongResult?.status === 'invalid';

      const discriminating = correctValid && wrongRejected;

      results.push({
        contact: tc,
        foundDomain: tc.knownDomain,
        foundEmail: correctValid ? tc.knownEmail : null,
        domainCorrect: true,
        emailCorrect: correctValid,
        detail: discriminating
          ? `M365 discriminates: correct=${correctResult?.status}, wrong=${wrongResult?.status}`
          : `M365 non-discriminating: correct=${correctResult?.status ?? 'timeout'}, wrong=${wrongResult?.status ?? 'timeout'}`,
      });
    } catch (err) {
      results.push({
        contact: tc,
        foundDomain: null,
        foundEmail: null,
        domainCorrect: false,
        emailCorrect: false,
        detail: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    await delay(1000);
  }
  console.log();
  return results;
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function analyzeByCompanyType(
  results: TacticResult[],
  cases: TestCase[],
): { bestFor: string; failsFor: string } {
  // Group by patterns we can detect
  const correct = results.filter((r) => r.domainCorrect);
  const failed = results.filter((r) => !r.domainCorrect);

  // Analyze company name length
  const correctAvgLen = correct.length > 0
    ? correct.reduce((sum, r) => sum + r.contact.company.length, 0) / correct.length
    : 0;
  const failedAvgLen = failed.length > 0
    ? failed.reduce((sum, r) => sum + r.contact.company.length, 0) / failed.length
    : 0;

  // Check for common patterns in successes
  const patterns: string[] = [];
  const failPatterns: string[] = [];

  // Companies where name resembles domain
  const correctSimpleDomain = correct.filter((r) => {
    const slug = r.contact.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domBase = r.contact.knownDomain.split('.')[0];
    return slug.includes(domBase) || domBase.includes(slug);
  });
  if (correctSimpleDomain.length > correct.length * 0.3) {
    patterns.push(`simple name->domain mapping (${correctSimpleDomain.length}/${correct.length})`);
  }

  // Companies where name does NOT match domain
  const failedMismatch = failed.filter((r) => {
    const slug = r.contact.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domBase = r.contact.knownDomain.split('.')[0];
    return !slug.includes(domBase) && !domBase.includes(slug);
  });
  if (failedMismatch.length > 0) {
    failPatterns.push(`name/domain mismatch (${failedMismatch.length})`);
  }

  // Companies with industry-specific suffixes
  const industryKeywords = ['fiber', 'telecom', 'broadband', 'communications', 'network', 'engineering'];
  const correctIndustry = correct.filter((r) =>
    industryKeywords.some((kw) => r.contact.company.toLowerCase().includes(kw)),
  );
  if (correctIndustry.length > 3) {
    patterns.push(`industry-name companies (${correctIndustry.length})`);
  }

  const failedIndustry = failed.filter((r) =>
    industryKeywords.some((kw) => r.contact.company.toLowerCase().includes(kw)),
  );
  if (failedIndustry.length > 0) {
    failPatterns.push(`industry-name companies that still fail (${failedIndustry.length})`);
  }

  return {
    bestFor: patterns.length > 0 ? patterns.join('; ') : 'no clear pattern',
    failsFor: failPatterns.length > 0 ? failPatterns.join('; ') : 'no clear pattern',
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

interface TacticSummary {
  name: string;
  description: string;
  results: TacticResult[];
  totalCases: number;
}

function formatReport(
  cases: TestCase[],
  summaries: TacticSummary[],
): string {
  const N = cases.length;
  const lines: string[] = [];
  const hr = '='.repeat(70);

  lines.push('');
  lines.push(`${hr}`);
  lines.push(`  TACTIC EVALUATION — ${N} CONTACTS`);
  lines.push(`  Run date: ${new Date().toISOString()}`);
  lines.push(`  Mode: ${OFFLINE ? 'OFFLINE (A + E only)' : 'FULL (all tactics)'}`);
  lines.push(`${hr}`);
  lines.push('');

  for (const summary of summaries) {
    const { name, description, results, totalCases } = summary;
    const domainCorrect = results.filter((r) => r.domainCorrect).length;
    const emailCorrect = results.filter((r) => r.emailCorrect).length;
    const noResult = results.filter((r) => !r.foundDomain && !r.foundEmail).length;
    const wrongDomain = totalCases - domainCorrect - noResult;
    const errors = results.filter((r) => r.error).length;

    const analysis = analyzeByCompanyType(results, cases);

    lines.push(`--- ${name}: ${description} ---`);
    lines.push(`  Correct domain:       ${domainCorrect}/${totalCases} (${pct(domainCorrect, totalCases)})`);
    if (emailCorrect > 0) {
      lines.push(`  Correct email:        ${emailCorrect}/${totalCases} (${pct(emailCorrect, totalCases)})`);
    }
    lines.push(`  Wrong domain:         ${wrongDomain}`);
    lines.push(`  No result:            ${noResult}`);
    if (errors > 0) {
      lines.push(`  Errors:               ${errors}`);
    }
    lines.push(`  Best for:             ${analysis.bestFor}`);
    lines.push(`  Fails for:            ${analysis.failsFor}`);

    // Show failures with details
    const failures = results.filter((r) => !r.domainCorrect);
    if (failures.length > 0 && failures.length <= 40) {
      lines.push(`  Failures:`);
      for (const f of failures.slice(0, 20)) {
        lines.push(`    ${f.contact.company.padEnd(35)} ${f.contact.knownDomain.padEnd(28)} ${f.detail.slice(0, 50)}`);
      }
      if (failures.length > 20) {
        lines.push(`    ... and ${failures.length - 20} more`);
      }
    }
    lines.push('');
  }

  // --- Cross-tactic comparison ---
  lines.push(`${hr}`);
  lines.push(`  CROSS-TACTIC COMPARISON`);
  lines.push(`${hr}`);
  lines.push('');

  // Header row
  const tacticNames = summaries.map((s) => s.name.split(':')[0].trim());
  lines.push(`  ${'Company'.padEnd(30)} ${'Known Domain'.padEnd(25)} ${tacticNames.map((n) => n.padEnd(8)).join(' ')}`);
  lines.push(`  ${'-'.repeat(30)} ${'-'.repeat(25)} ${tacticNames.map(() => '-'.repeat(8)).join(' ')}`);

  // Per-contact row
  for (const tc of cases) {
    const row = summaries.map((s) => {
      const result = s.results.find((r) => r.contact === tc);
      if (!result) return '  ?  ';
      if (result.emailCorrect) return '  E  '; // exact email
      if (result.domainCorrect) return '  D  '; // domain only
      return '  -  ';
    });
    lines.push(`  ${tc.company.slice(0, 29).padEnd(30)} ${tc.knownDomain.padEnd(25)} ${row.join(' ')}`);
  }

  lines.push('');
  lines.push(`  Legend: E=exact email, D=correct domain, -=miss`);
  lines.push('');

  // --- Company type analysis ---
  lines.push(`${hr}`);
  lines.push(`  COMPANY TYPE ANALYSIS`);
  lines.push(`${hr}`);
  lines.push('');

  // Split companies by whether domain matches name
  const predictableDomain = cases.filter((tc) => {
    const slug = tc.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domBase = tc.knownDomain.split('.')[0].replace(/[^a-z0-9]/g, '');
    return slug.includes(domBase) || domBase.includes(slug);
  });
  const unpredictableDomain = cases.filter((tc) => !predictableDomain.includes(tc));

  lines.push(`  Predictable domains (name ~ domain): ${predictableDomain.length}/${N}`);
  lines.push(`  Unpredictable domains (name != domain): ${unpredictableDomain.length}/${N}`);
  lines.push('');

  for (const summary of summaries) {
    const predCorrect = summary.results
      .filter((r) => predictableDomain.some((tc) => tc === r.contact) && r.domainCorrect)
      .length;
    const unpredCorrect = summary.results
      .filter((r) => unpredictableDomain.some((tc) => tc === r.contact) && r.domainCorrect)
      .length;

    lines.push(`  ${summary.name.split(':')[0].trim().padEnd(15)} predictable: ${pct(predCorrect, predictableDomain.length).padEnd(8)} unpredictable: ${pct(unpredCorrect, unpredictableDomain.length)}`);
  }

  // Industry keyword analysis
  const industryKeywords = ['fiber', 'telecom', 'broadband', 'communications', 'network', 'engineering'];
  const industryCompanies = cases.filter((tc) =>
    industryKeywords.some((kw) => tc.company.toLowerCase().includes(kw)),
  );
  const nonIndustryCompanies = cases.filter((tc) => !industryCompanies.includes(tc));

  lines.push('');
  lines.push(`  Industry-keyword companies: ${industryCompanies.length}/${N}`);
  lines.push(`  Non-industry companies: ${nonIndustryCompanies.length}/${N}`);
  lines.push('');

  for (const summary of summaries) {
    const indCorrect = summary.results
      .filter((r) => industryCompanies.some((tc) => tc === r.contact) && r.domainCorrect)
      .length;
    const nonIndCorrect = summary.results
      .filter((r) => nonIndustryCompanies.some((tc) => tc === r.contact) && r.domainCorrect)
      .length;

    lines.push(`  ${summary.name.split(':')[0].trim().padEnd(15)} industry: ${pct(indCorrect, industryCompanies.length).padEnd(8)} non-industry: ${pct(nonIndCorrect, nonIndustryCompanies.length)}`);
  }

  lines.push('');

  // --- DMARC-specific analysis ---
  const dmarcSummary = summaries.find((s) => s.name.startsWith('TACTIC E'));
  if (dmarcSummary) {
    const dmarcWithEmails = dmarcSummary.results.filter((r) =>
      r.detail.includes('found') && r.detail.includes('email'),
    );
    const uniqueDmarcDomains = [...new Set(dmarcWithEmails.map((r) => r.contact.knownDomain))];

    lines.push(`  DMARC rua= coverage: ${uniqueDmarcDomains.length} of ${[...new Set(cases.map((tc) => tc.knownDomain))].length} unique domains have extractable emails`);
    if (uniqueDmarcDomains.length > 0) {
      lines.push(`  Domains with DMARC emails: ${uniqueDmarcDomains.join(', ')}`);
    }
    lines.push('');
  }

  // --- Provider breakdown ---
  lines.push(`${hr}`);
  lines.push(`  MAIL PROVIDER BREAKDOWN (by known domain)`);
  lines.push(`${hr}`);
  lines.push('');

  // We'll only have provider data if we ran tactic F (online)
  const tacticFSummary = summaries.find((s) => s.name.startsWith('TACTIC F'));
  if (tacticFSummary) {
    const providerBuckets: Record<string, number> = {};
    for (const r of tacticFSummary.results) {
      const provider = r.detail.includes('M365')
        ? 'microsoft-365'
        : r.detail.includes('skipped: provider is')
          ? r.detail.replace('skipped: provider is ', '').replace(', not M365', '')
          : 'unknown';
      providerBuckets[provider] = (providerBuckets[provider] || 0) + 1;
    }
    for (const [provider, count] of Object.entries(providerBuckets).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${provider.padEnd(25)} ${count} contacts (${pct(count, N)})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== TACTIC EVALUATION ===\n');

  // Load test data
  console.log('Loading test cases...');
  const cases = loadTestCases();
  console.log(`Loaded: ${cases.length} contacts with corporate emails`);
  console.log(`Unique companies: ${new Set(cases.map((tc) => tc.company.toLowerCase().trim())).size}`);
  console.log(`Unique domains: ${new Set(cases.map((tc) => tc.knownDomain)).size}`);
  console.log(`Mode: ${OFFLINE ? 'OFFLINE (tactics A + E only)' : 'FULL (all tactics)'}`);

  const summaries: TacticSummary[] = [];

  // TACTIC A: Heuristic + MX (always runs — offline)
  const tacticAResults = await tacticA(cases);
  summaries.push({
    name: 'TACTIC A: Heuristic + MX',
    description: 'offline — DNS MX only, no web',
    results: tacticAResults,
    totalCases: cases.length,
  });
  const aCorrect = tacticAResults.filter((r) => r.domainCorrect).length;
  console.log(`  -> Tactic A: ${aCorrect}/${cases.length} domains correct (${pct(aCorrect, cases.length)})`);

  // TACTIC E: DMARC rua= extraction (always runs — offline)
  const tacticEResults = await tacticE(cases);
  summaries.push({
    name: 'TACTIC E: DMARC rua=',
    description: 'offline — DNS DMARC records (uses known domain)',
    results: tacticEResults,
    totalCases: cases.length,
  });
  const eEmails = tacticEResults.filter((r) => r.detail.includes('found')).length;
  const eEmailCorrect = tacticEResults.filter((r) => r.emailCorrect).length;
  console.log(`  -> Tactic E: ${eEmails} domains with DMARC emails, ${eEmailCorrect} exact email matches`);

  // Online tactics (skip if --offline)
  if (!OFFLINE) {
    // TACTIC B: Person + industry search
    const tacticBResults = await tacticB(cases);
    summaries.push({
      name: 'TACTIC B: Person search',
      description: 'online — DuckDuckGo + page fetch',
      results: tacticBResults,
      totalCases: cases.length,
    });
    const bDomain = tacticBResults.filter((r) => r.domainCorrect).length;
    const bEmail = tacticBResults.filter((r) => r.emailCorrect).length;
    console.log(`  -> Tactic B: ${bDomain}/${cases.length} domains, ${bEmail}/${cases.length} exact emails`);

    // TACTIC C: Company + industry search
    const tacticCResults = await tacticC(cases);
    summaries.push({
      name: 'TACTIC C: Company search',
      description: 'online — DuckDuckGo company search',
      results: tacticCResults,
      totalCases: cases.length,
    });
    const cCorrect = tacticCResults.filter((r) => r.domainCorrect).length;
    console.log(`  -> Tactic C: ${cCorrect}/${cases.length} domains correct`);

    // TACTIC D: Clearbit Autocomplete
    const tacticDResults = await tacticD(cases);
    summaries.push({
      name: 'TACTIC D: Clearbit',
      description: 'online — Clearbit autocomplete with name match',
      results: tacticDResults,
      totalCases: cases.length,
    });
    const dCorrect = tacticDResults.filter((r) => r.domainCorrect).length;
    console.log(`  -> Tactic D: ${dCorrect}/${cases.length} domains correct`);

    // TACTIC F: M365 Graph check
    const tacticFResults = await tacticF(cases);
    summaries.push({
      name: 'TACTIC F: M365 Graph',
      description: 'online — M365 user-exists (known domain only)',
      results: tacticFResults,
      totalCases: cases.length,
    });
    const fCorrect = tacticFResults.filter((r) => r.emailCorrect).length;
    const fM365Count = tacticFResults.filter((r) => !r.detail.includes('skipped')).length;
    console.log(`  -> Tactic F: ${fCorrect}/${fM365Count} M365 emails verified`);
  }

  // Generate and print report
  const report = formatReport(cases, summaries);
  console.log(report);

  // Write results file
  const mdContent = `---
title: Tactic Evaluation Results
status: ACTIVE
last_updated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} EST
version: v1
---

\`\`\`
${report}
\`\`\`

## Version history

| Version | Date (EST) | Author | Change |
|---|---|---|---|
| v1 | ${new Date().toISOString().replace('T', ' ').substring(0, 16)} | Claude | Initial tactic evaluation run |
`;

  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(`${RESULTS_DIR}tactic-eval-results.md`, mdContent, 'utf-8');
    console.log(`\nResults written to: data/showrev/premium/test-runs/tactic-eval-results.md`);
  } catch (err) {
    console.error(`Failed to write results: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error('Tactic eval failed:', err);
  process.exit(1);
});
