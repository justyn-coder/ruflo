#!/usr/bin/env npx tsx
/**
 * benchmark-8.ts — Run the expanded 8-contact benchmark with full stack:
 * self-hosted domain resolution + Autodiscover verification + Apollo fallback + MillionVerifier.
 *
 * Run: npx tsx src/showrev/m1-email-find/email-finder/benchmark-8.ts
 *
 * Requires .env with APOLLO_API_KEY and MILLIONVERIFIER_API_KEY.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { findEmail } from './orchestrator.js';
import { apolloPeopleMatch } from './apollo-fallback.js';
import { verifyEmailMV } from './million-verifier.js';
import type { ApolloFallbackResult } from './orchestrator.js';

const CSV_PATH = new URL(
  '../../../../data/showrev/premium/test-runs/p1-benchmark-expanded.csv',
  import.meta.url,
).pathname;

const SOCIAL_DOMAINS = [
  'x.com', 'twitter.com', 'linkedin.com', 'facebook.com',
  'instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com',
  'wikipedia.org', 'pinterest.com',
];

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
    const text = await res.text();
    return text.slice(0, 50000);
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

async function main() {
  console.log('=== 8-Contact Benchmark (Full Stack: Self-Hosted + Apollo + MillionVerifier) ===\n');

  const apolloKey = process.env.APOLLO_API_KEY;
  const mvKey = process.env.MILLIONVERIFIER_API_KEY;
  console.log(`Apollo API key: ${apolloKey ? 'loaded' : 'MISSING'}`);
  console.log(`MillionVerifier API key: ${mvKey ? 'loaded' : 'MISSING'}\n`);

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

  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const contacts = lines.slice(1).filter(l => l.trim()).map(l => {
    const f = parseCSVLine(l);
    return {
      firstName: f[0] || '',
      lastName: f[1] || '',
      company: f[2] || '',
      title: f[3] || '',
      state: f[4] || '',
      knownEmail: f[5] || '',
      companyUrl: f[6] || '',
    };
  });

  console.log(`Loaded ${contacts.length} contacts from benchmark CSV\n`);
  console.log('─'.repeat(100));

  const results: Array<{
    name: string;
    company: string;
    found: string | null;
    confidence: string;
    known: string;
    domainMatch: boolean;
    exactMatch: boolean;
    tactics: string[];
    duration: number;
    mvQuality?: string;
  }> = [];

  for (const c of contacts) {
    console.log(`\n>>> ${c.firstName} ${c.lastName} @ ${c.company}`);
    const t0 = Date.now();

    const result = await findEmail(
      {
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        title: c.title,
        companyUrl: c.companyUrl,
        state: c.state,
      },
      {
        searchFn: realSearchFn,
        fetchFn: realFetchFn,
        smtpVerify: true,
        apolloPeopleMatchFn,
        millionVerifierFn,
      },
    );

    const duration = Date.now() - t0;

    // Run MillionVerifier on final result (if self-hosted found it, MV wasn't called yet)
    let mvQuality = 'skipped';
    if (result.email && mvKey && !result.mailProvider.startsWith('apollo:')) {
      try {
        const mvResult = await verifyEmailMV(result.email, { apiKey: mvKey });
        mvQuality = mvResult.quality;
        console.log(`[MV] ${result.email} = ${mvQuality} (${mvResult.result})`);
      } catch (e) {
        console.log(`[MV] error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (result.mailProvider.startsWith('apollo:')) {
      mvQuality = 'checked-inline';
    }

    const foundDomain = result.email?.split('@')[1] ?? null;
    const knownDomain = c.knownEmail ? c.knownEmail.split('@')[1] : '';
    const domainMatch = foundDomain !== null && knownDomain !== '' && foundDomain === knownDomain;
    const exactMatch = result.email !== null && c.knownEmail !== '' && result.email.toLowerCase() === c.knownEmail.toLowerCase();

    results.push({
      name: `${c.firstName} ${c.lastName}`,
      company: c.company,
      found: result.email,
      confidence: result.confidence,
      known: c.knownEmail || '(unknown)',
      domainMatch,
      exactMatch,
      tactics: result.tacticsSucceeded,
      duration,
      mvQuality,
    });

    console.log(`  Result: ${result.email || 'NOT FOUND'} [${result.confidence.toUpperCase()}]`);
    console.log(`  Known:  ${c.knownEmail || '(none)'}`);
    console.log(`  Domain: ${domainMatch ? 'MATCH' : 'MISS'}  |  Exact: ${exactMatch ? 'MATCH' : 'MISS'}  |  MV: ${mvQuality}`);
    console.log(`  Tactics: ${result.tacticsSucceeded.join(', ')}`);
    console.log(`  Duration: ${duration}ms  |  Provider: ${result.mailProvider}`);
    console.log('─'.repeat(100));
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  const withKnown = results.filter(r => r.known !== '(unknown)');
  const domainMatches = withKnown.filter(r => r.domainMatch).length;
  const exactMatches = withKnown.filter(r => r.exactMatch).length;
  const totalFound = results.filter(r => r.found).length;
  const green = results.filter(r => r.confidence === 'green').length;
  const yellow = results.filter(r => r.confidence === 'yellow').length;
  const amber = results.filter(r => r.confidence === 'amber').length;
  const red = results.filter(r => r.confidence === 'red').length;
  const notFound = results.filter(r => r.confidence === 'not-found').length;
  const apolloUsed = results.filter(r => r.tactics.some(t => t.includes('apollo'))).length;
  const avgDuration = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.duration, 0) / results.length) : 0;

  console.log(`Contacts: ${results.length}`);
  console.log(`Found:    ${totalFound}/${results.length} (${((totalFound / results.length) * 100).toFixed(0)}%)`);
  console.log(`Green: ${green}  Yellow: ${yellow}  Amber: ${amber}  Red: ${red}  Not-found: ${notFound}`);
  if (withKnown.length > 0) {
    console.log(`\nAgainst known emails (${withKnown.length} contacts):`);
    console.log(`  Domain match: ${domainMatches}/${withKnown.length} (${((domainMatches / withKnown.length) * 100).toFixed(0)}%)`);
    console.log(`  Exact match:  ${exactMatches}/${withKnown.length} (${((exactMatches / withKnown.length) * 100).toFixed(0)}%)`);
  }
  console.log(`\nApollo fallback used: ${apolloUsed}/${results.length}`);
  console.log(`Avg duration: ${avgDuration}ms`);

  console.log('\n=== DETAIL TABLE ===\n');
  console.log('Name'.padEnd(25) + 'Company'.padEnd(25) + 'Found'.padEnd(35) + 'Conf'.padEnd(8) + 'Domain'.padEnd(8) + 'Exact'.padEnd(8) + 'MV'.padEnd(12) + 'Time');
  console.log('─'.repeat(130));
  for (const r of results) {
    console.log(
      r.name.padEnd(25) +
      r.company.slice(0, 23).padEnd(25) +
      (r.found || 'NOT FOUND').padEnd(35) +
      r.confidence.toUpperCase().padEnd(8) +
      (r.domainMatch ? 'YES' : r.known === '(unknown)' ? '?' : 'NO').padEnd(8) +
      (r.exactMatch ? 'YES' : r.known === '(unknown)' ? '?' : 'NO').padEnd(8) +
      (r.mvQuality || 'n/a').padEnd(12) +
      `${r.duration}ms`,
    );
  }
}

main().catch(console.error);
