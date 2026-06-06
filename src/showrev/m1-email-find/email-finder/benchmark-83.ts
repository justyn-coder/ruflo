#!/usr/bin/env npx tsx
/**
 * benchmark-83.ts — Full 83-contact booth visitor accuracy test.
 * Full stack: self-hosted + Autodiscover + Apollo fallback + MillionVerifier.
 *
 * Run: npx tsx src/showrev/m1-email-find/email-finder/benchmark-83.ts
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { findEmail } from './orchestrator.js';
import { apolloPeopleMatch } from './apollo-fallback.js';
import { verifyEmailMV } from './million-verifier.js';
import type { ApolloFallbackResult, EmailFinderResult } from './orchestrator.js';

const CSV_PATH = new URL(
  '../../../../data/showrev/fiber-connect-2026-booth-scans.csv',
  import.meta.url,
).pathname;

const RESULTS_DIR = new URL(
  '../../../../data/showrev/premium/test-runs/',
  import.meta.url,
).pathname;

const SOCIAL_DOMAINS = [
  'x.com', 'twitter.com', 'linkedin.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com',
  'wikipedia.org', 'pinterest.com',
];

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'comcast.net', 'me.com',
  'live.com', 'msn.com', 'protonmail.com',
]);

async function realSearchFn(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const urls: string[] = [];
    const urlRegex = /uddg=([^&"]+)/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith('http')) {
          const domain = new URL(decoded).hostname.replace(/^www\./, '');
          const isSocial = SOCIAL_DOMAINS.some(sd => domain === sd || domain.endsWith('.' + sd));
          if (!isSocial && !domain.includes('duckduckgo')) urls.push(decoded);
        }
      } catch {}
    }
    return urls.slice(0, 10);
  } catch { return []; }
}

async function realFetchFn(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain') && !ct.includes('application/json')) return '';
    return (await res.text()).slice(0, 50000);
  } catch { return ''; }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

interface TestContact {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  knownEmail: string;
  knownDomain: string;
}

function loadContacts(): TestContact[] {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1);

  const seen = new Set<string>();
  const contacts: TestContact[] = [];

  // CSV columns: Lead Type(0), First Name(1), Last Name(2), Email(3),
  // Contact Info(4), Grade(5), Country(6), Primary Phone(7), Title(8),
  // City(9), Company Name(10), State(11), AE notes(12)
  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    const email = (fields[3] || '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;

    const domain = email.split('@')[1];
    if (PERSONAL_DOMAINS.has(domain)) continue;

    const firstName = (fields[1] || '').trim();
    const lastName = (fields[2] || '').trim();
    const company = (fields[10] || '').trim();
    const title = (fields[8] || '').trim();

    if (!firstName || !lastName || !company) continue;

    const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    contacts.push({ firstName, lastName, company, title, knownEmail: email, knownDomain: domain });
  }

  return contacts;
}

async function main() {
  console.log('=== 83-Contact Booth Visitor Benchmark (Full Stack) ===\n');

  const apolloKey = process.env.APOLLO_API_KEY;
  const mvKey = process.env.MILLIONVERIFIER_API_KEY;
  console.log(`Apollo: ${apolloKey ? 'active' : 'MISSING'}  |  MV: ${mvKey ? 'active' : 'MISSING'}\n`);

  const apolloPeopleMatchFn = apolloKey
    ? async (fn: string, ln: string, co: string, d?: string): Promise<ApolloFallbackResult> =>
        apolloPeopleMatch(fn, ln, co, d, { apiKey: apolloKey })
    : undefined;

  const millionVerifierFn = mvKey
    ? async (email: string) => {
        const r = await verifyEmailMV(email, { apiKey: mvKey });
        return { quality: r.quality, result: r.result };
      }
    : undefined;

  // Load domain hints (inventory + Focus 100)
  const HINTS_PATH = new URL(
    '../../../../data/showrev/premium/domain-hints.json',
    import.meta.url,
  ).pathname;
  let domainHints: Record<string, string> = {};
  if (existsSync(HINTS_PATH)) {
    domainHints = JSON.parse(readFileSync(HINTS_PATH, 'utf-8'));
    console.log(`Domain hints: ${Object.keys(domainHints).length} entries loaded\n`);
  }

  const contacts = loadContacts();
  console.log(`Loaded ${contacts.length} corporate contacts\n`);

  const results: Array<{
    name: string;
    company: string;
    found: string | null;
    confidence: string;
    known: string;
    domainMatch: boolean;
    exactMatch: boolean;
    apolloUsed: boolean;
    mvQuality: string;
    duration: number;
  }> = [];

  let apolloCreditsUsed = 0;
  const t0 = Date.now();

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    console.log(`\n[${i + 1}/${contacts.length}] ${c.firstName} ${c.lastName} @ ${c.company}...`);

    const ct = Date.now();

    // Suppress verbose logs
    const origLog = console.log;
    console.log = () => {};

    let result: EmailFinderResult;
    try {
      result = await findEmail(
        { firstName: c.firstName, lastName: c.lastName, company: c.company, title: c.title },
        { searchFn: realSearchFn, fetchFn: realFetchFn, smtpVerify: true, apolloPrimary: true, domainHints, apolloPeopleMatchFn, millionVerifierFn },
      );
    } catch (err) {
      console.log = origLog;
      result = {
        contact: { firstName: c.firstName, lastName: c.lastName, company: c.company },
        email: null, confidence: 'not-found', domain: null, pattern: null,
        verificationStatus: 'skipped', mailProvider: 'unknown',
        tacticsAttempted: [], tacticsSucceeded: [], duration: 0, timestamp: new Date().toISOString(),
      };
    }
    console.log = origLog;

    const duration = Date.now() - ct;
    const apolloUsed = result.tacticsSucceeded.some(t => t.includes('apollo'));
    if (apolloUsed) apolloCreditsUsed++;

    // Run MV on self-hosted results (Apollo results already checked inline)
    let mvQuality = 'skipped';
    if (result.email && mvKey && !result.mailProvider.startsWith('apollo:')) {
      const origLog2 = console.log;
      console.log = () => {};
      try {
        const mvr = await verifyEmailMV(result.email, { apiKey: mvKey });
        mvQuality = mvr.quality;
      } catch {}
      console.log = origLog2;
    } else if (result.mailProvider.startsWith('apollo:')) {
      mvQuality = 'apollo-verified';
    }

    const foundDomain = result.email?.split('@')[1] ?? null;
    const domainMatch = foundDomain !== null && foundDomain === c.knownDomain;
    const exactMatch = result.email !== null && result.email.toLowerCase() === c.knownEmail;

    results.push({
      name: `${c.firstName} ${c.lastName}`,
      company: c.company,
      found: result.email,
      confidence: result.confidence,
      known: c.knownEmail,
      domainMatch,
      exactMatch,
      apolloUsed,
      mvQuality,
      duration,
    });

    const foundEmail = result.email || 'NOT FOUND';
    const conf = result.confidence.toUpperCase();
    const dm = domainMatch ? 'dom:Y' : 'dom:N';
    const em = exactMatch ? 'exact:Y' : 'exact:N';
    const apo = apolloUsed ? 'apollo:Y' : '';
    console.log(`  → ${foundEmail} [${conf}] ${dm} ${em} mv:${mvQuality} ${apo} ${duration}ms`);

    if ((i + 1) % 10 === 0) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const found = results.filter(r => r.found).length;
      const exact = results.filter(r => r.exactMatch).length;
      console.log(`\n  --- [${i + 1}/${contacts.length}] ${elapsed}s elapsed | Found: ${found} | Exact: ${exact} | Apollo: ${apolloCreditsUsed} ---\n`);
    }
  }

  const totalTime = Math.round((Date.now() - t0) / 1000);
  console.log(`\n\nCompleted in ${totalTime}s\n`);

  // Summary
  const found = results.filter(r => r.found).length;
  const green = results.filter(r => r.confidence === 'green').length;
  const yellow = results.filter(r => r.confidence === 'yellow').length;
  const amber = results.filter(r => r.confidence === 'amber').length;
  const red = results.filter(r => r.confidence === 'red').length;
  const notFound = results.filter(r => r.confidence === 'not-found').length;
  const domainMatches = results.filter(r => r.domainMatch).length;
  const exactMatches = results.filter(r => r.exactMatch).length;
  const mvGood = results.filter(r => r.mvQuality === 'good' || r.mvQuality === 'apollo-verified').length;
  const mvBad = results.filter(r => r.mvQuality === 'bad').length;
  const mvCatchAll = results.filter(r => r.mvQuality === 'catch_all').length;
  const mvUnknown = results.filter(r => r.mvQuality === 'unknown').length;

  const summary = [
    '=== SUMMARY ===',
    '',
    `Total contacts: ${results.length}`,
    `Found: ${found}/${results.length} (${((found / results.length) * 100).toFixed(1)}%)`,
    `Green: ${green}  Yellow: ${yellow}  Amber: ${amber}  Red: ${red}  Not-found: ${notFound}`,
    '',
    `Domain match: ${domainMatches}/${results.length} (${((domainMatches / results.length) * 100).toFixed(1)}%)`,
    `Exact email match: ${exactMatches}/${results.length} (${((exactMatches / results.length) * 100).toFixed(1)}%)`,
    '',
    `MV good: ${mvGood}  |  MV catch-all: ${mvCatchAll}  |  MV bad: ${mvBad}  |  MV unknown: ${mvUnknown}  |  MV skipped: ${results.filter(r => r.mvQuality === 'skipped').length}`,
    `Deliverable (MV good + catch-all): ${mvGood + mvCatchAll}/${results.length} (${(((mvGood + mvCatchAll) / results.length) * 100).toFixed(1)}%)`,
    '',
    `Apollo credits used: ${apolloCreditsUsed}`,
    `Total time: ${totalTime}s  |  Avg: ${Math.round(totalTime / results.length)}s/contact`,
    '',
  ].join('\n');

  console.log(summary);

  // Detail table
  const header = 'Name'.padEnd(25) + 'Company'.padEnd(22) + 'Found'.padEnd(32) + 'Conf'.padEnd(7) + 'Dom'.padEnd(5) + 'Exact'.padEnd(6) + 'MV'.padEnd(10) + 'Apo'.padEnd(5) + 'Time';
  console.log(header);
  console.log('─'.repeat(120));
  for (const r of results) {
    console.log(
      r.name.slice(0, 24).padEnd(25) +
      r.company.slice(0, 20).padEnd(22) +
      (r.found || 'NOT FOUND').slice(0, 30).padEnd(32) +
      r.confidence.toUpperCase().slice(0, 6).padEnd(7) +
      (r.domainMatch ? 'Y' : 'N').padEnd(5) +
      (r.exactMatch ? 'Y' : 'N').padEnd(6) +
      r.mvQuality.slice(0, 8).padEnd(10) +
      (r.apolloUsed ? 'Y' : '-').padEnd(5) +
      `${r.duration}ms`,
    );
  }

  // Save results
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = `${RESULTS_DIR}benchmark-83-full-stack-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(outPath, JSON.stringify({ summary: { found, green, yellow, amber, red, notFound, domainMatches, exactMatches, mvGood, mvBad, mvCatchAll, mvUnknown, apolloCreditsUsed, totalTime }, results }, null, 2));
  console.log(`\nResults saved to ${outPath}`);

  // Misses
  const misses = results.filter(r => !r.exactMatch);
  if (misses.length > 0) {
    console.log(`\n=== MISSES (${misses.length}) ===\n`);
    for (const m of misses) {
      const domainNote = m.domainMatch ? 'domain OK, wrong local' : 'wrong domain';
      console.log(`  ${m.name.padEnd(25)} Found: ${(m.found || 'NONE').padEnd(30)} Known: ${m.known.padEnd(30)} [${domainNote}]`);
    }
  }
}

main().catch(console.error);
