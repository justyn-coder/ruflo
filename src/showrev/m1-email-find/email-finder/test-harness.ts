/**
 * test-harness.ts — Email Finder accuracy test against known booth-scan contacts.
 *
 * Parses the FC2026 booth-scan CSV, filters to corporate emails, then runs
 * each module (domain resolver, pattern detector, candidate generator,
 * full pipeline) and measures accuracy against known-good addresses.
 *
 * Run:  npx tsx src/showrev/m1-email-find/email-finder/test-harness.ts
 *
 * Optional: set ENABLE_SMTP=1 to run Phase 5 SMTP verification on a subset.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolveDomain } from './domain-resolver.js';
import { inferPattern, generateCandidates } from './pattern-detector.js';
import { findEmail } from './orchestrator.js';
import type { EmailFinderResult, ContactInput } from './orchestrator.js';
import type { EmailPattern } from './pattern-detector.js';

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

const ENABLE_SMTP = process.env.ENABLE_SMTP === '1';

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'comcast.net', 'me.com',
  'live.com', 'msn.com', 'protonmail.com',
]);

const TYPO_ENDINGS = ['.cok', '.con', '.om'];

// ---------------------------------------------------------------------------
// CSV parsing (handles quoted fields with commas)
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
        i++; // skip escaped quote
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
// Phase 1: Data prep
// ---------------------------------------------------------------------------

function loadTestCases(): TestCase[] {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  // Skip header
  const dataLines = lines.slice(1);

  const seen = new Set<string>();
  const cases: TestCase[] = [];

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    // Columns: Lead Type(0), First Name(1), Last Name(2), Email(3),
    //          Contact Info(4), Grade(5), Country(6), Primary Phone(7),
    //          Title(8), City(9), Company Name(10), State(11), AE notes(12)
    const email = (fields[3] ?? '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;

    // Dedup by email
    if (seen.has(email)) continue;
    seen.add(email);

    const domain = email.split('@')[1];
    if (!domain) continue;

    // Filter personal emails
    if (PERSONAL_DOMAINS.has(domain)) continue;

    // Filter typo endings
    if (TYPO_ENDINGS.some((t) => email.endsWith(t))) continue;

    // Filter generic-prefix emails where the local part doesn't match a person
    // (e.g. office@, marketing@) — keep these, they're still corporate domains
    // but note them for analysis

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
// Phase 2: Domain resolution (heuristic + MX only, no web)
// ---------------------------------------------------------------------------

interface DomainTestResult {
  testCase: TestCase;
  foundDomain: string | null;
  correct: boolean;
  inAlternatives: boolean;
  source: string;
}

async function testDomainResolution(cases: TestCase[]): Promise<DomainTestResult[]> {
  const results: DomainTestResult[] = [];
  const noopSearch = async (_q: string): Promise<string[]> => [];
  const noopFetch = async (_u: string): Promise<string> => '';

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`  Testing ${i + 1}/${cases.length}... ${tc.company}\r`);

    try {
      const result = await resolveDomain(tc.company, undefined, {
        searchFn: noopSearch,
        fetchFn: noopFetch,
        timeout: 5_000,
      });

      const foundDomain = result?.domain ?? null;
      const alternatives = result?.alternativeDomains ?? [];
      const correct = foundDomain === tc.knownDomain;
      const inAlternatives = !correct && alternatives.includes(tc.knownDomain);

      results.push({
        testCase: tc,
        foundDomain,
        correct,
        inAlternatives,
        source: result?.source ?? 'none',
      });
    } catch (err) {
      results.push({
        testCase: tc,
        foundDomain: null,
        correct: false,
        inAlternatives: false,
        source: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  console.log(); // clear \r line
  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Pattern + candidate tests
// ---------------------------------------------------------------------------

interface PatternTestResult {
  testCase: TestCase;
  inferredPattern: EmailPattern;
  candidatesContainCorrect: boolean;
  correctRank: number | null;
  withPatternCorrect: boolean;
  totalCandidates: number;
}

function testPatterns(cases: TestCase[], domainResults: DomainTestResult[]): PatternTestResult[] {
  const results: PatternTestResult[] = [];

  // Only test contacts where we found the correct domain
  const correctDomainCases = domainResults
    .filter((r) => r.correct)
    .map((r) => r.testCase);

  for (const tc of correctDomainCases) {
    // Infer pattern from known email
    const pattern = inferPattern(tc.knownEmail, tc.firstName, tc.lastName);

    // Generate candidates WITHOUT known pattern
    const candidates = generateCandidates(tc.firstName, tc.lastName, tc.knownDomain);
    const candidateEmails = candidates.map((c) => c.email);
    const correctIdx = candidateEmails.indexOf(tc.knownEmail);
    const candidatesContainCorrect = correctIdx >= 0;
    const correctRank = candidatesContainCorrect ? candidates[correctIdx].rank : null;

    // Generate candidates WITH known pattern
    let withPatternCorrect = false;
    if (pattern !== 'unknown') {
      const patternCandidates = generateCandidates(tc.firstName, tc.lastName, tc.knownDomain, pattern);
      withPatternCorrect = patternCandidates.some((c) => c.email === tc.knownEmail);
    }

    results.push({
      testCase: tc,
      inferredPattern: pattern,
      candidatesContainCorrect,
      correctRank,
      withPatternCorrect,
      totalCandidates: candidates.length,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 4: Full pipeline (heuristic only, no web, no SMTP)
// ---------------------------------------------------------------------------

interface PipelineTestResult {
  testCase: TestCase;
  result: EmailFinderResult;
  emailCorrect: boolean;
  domainCorrect: boolean;
}

async function testFullPipeline(cases: TestCase[]): Promise<PipelineTestResult[]> {
  const results: PipelineTestResult[] = [];
  const noopSearch = async (_q: string): Promise<string[]> => [];
  const noopFetch = async (_u: string): Promise<string> => '';

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    process.stdout.write(`  Testing ${i + 1}/${cases.length}... ${tc.firstName} ${tc.lastName} @ ${tc.company}\r`);

    const contact: ContactInput = {
      firstName: tc.firstName,
      lastName: tc.lastName,
      company: tc.company,
      title: tc.title,
    };

    // Suppress orchestrator console.log noise during test
    const origLog = console.log;
    console.log = () => {};

    try {
      const result = await findEmail(contact, {
        searchFn: noopSearch,
        fetchFn: noopFetch,
        smtpVerify: false,
      });

      const emailCorrect = result.email?.toLowerCase() === tc.knownEmail;
      const domainCorrect = result.domain === tc.knownDomain;

      results.push({ testCase: tc, result, emailCorrect, domainCorrect });
    } catch (err) {
      results.push({
        testCase: tc,
        result: {
          contact,
          email: null,
          confidence: 'not-found',
          domain: null,
          pattern: null,
          verificationStatus: 'skipped',
          mailProvider: 'unknown',
          tacticsAttempted: [],
          tacticsSucceeded: [],
          duration: 0,
          timestamp: new Date().toISOString(),
        },
        emailCorrect: false,
        domainCorrect: false,
      });
    } finally {
      console.log = origLog;
    }
  }
  console.log(); // clear \r line
  return results;
}

// ---------------------------------------------------------------------------
// Phase 5: SMTP test (optional, small subset)
// ---------------------------------------------------------------------------

async function testSmtpSubset(
  cases: TestCase[],
  pipelineResults: PipelineTestResult[],
): Promise<{ contact: string; before: string; after: string; upgraded: boolean }[]> {
  // Find first 10 contacts where pipeline returned amber or red but we have a domain
  const candidates = pipelineResults
    .filter(
      (r) =>
        (r.result.confidence === 'amber' || r.result.confidence === 'red') &&
        r.result.domain !== null,
    )
    .slice(0, 10);

  if (candidates.length === 0) return [];

  const results: { contact: string; before: string; after: string; upgraded: boolean }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const pr = candidates[i];
    const tc = pr.testCase;
    process.stdout.write(`  SMTP testing ${i + 1}/${candidates.length}... ${tc.firstName} ${tc.lastName}\r`);

    const contact: ContactInput = {
      firstName: tc.firstName,
      lastName: tc.lastName,
      company: tc.company,
      title: tc.title,
    };

    const origLog = console.log;
    console.log = () => {};

    try {
      const result = await findEmail(contact, {
        searchFn: async () => [],
        fetchFn: async () => '',
        smtpVerify: true,
      });

      const upgraded =
        (pr.result.confidence === 'red' || pr.result.confidence === 'amber') &&
        (result.confidence === 'green' || result.confidence === 'yellow');

      results.push({
        contact: `${tc.firstName} ${tc.lastName} @ ${tc.company}`,
        before: pr.result.confidence,
        after: result.confidence,
        upgraded,
      });
    } catch {
      results.push({
        contact: `${tc.firstName} ${tc.lastName} @ ${tc.company}`,
        before: pr.result.confidence,
        after: 'error',
        upgraded: false,
      });
    } finally {
      console.log = origLog;
    }
  }
  console.log();
  return results;
}

// ---------------------------------------------------------------------------
// Failure analysis
// ---------------------------------------------------------------------------

interface FailureAnalysis {
  reason: string;
  count: number;
  examples: string[];
}

function analyzeFailures(
  domainResults: DomainTestResult[],
  patternResults: PatternTestResult[],
  pipelineResults: PipelineTestResult[],
): FailureAnalysis[] {
  const buckets: Record<string, string[]> = {};

  function add(reason: string, example: string) {
    if (!buckets[reason]) buckets[reason] = [];
    buckets[reason].push(example);
  }

  // Domain failures
  for (const r of domainResults) {
    if (r.correct) continue;
    const tc = r.testCase;
    const label = `${tc.firstName} ${tc.lastName} @ ${tc.company} (${tc.knownDomain})`;

    if (!r.foundDomain) {
      // Why didn't we find it? Check if slug matches domain
      const slug = tc.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const domainBase = tc.knownDomain.split('.')[0];
      if (slug.includes(domainBase) || domainBase.includes(slug)) {
        add('Domain slug should match but MX failed', label);
      } else {
        add('Domain name bears no resemblance to company name', label);
      }
    } else if (r.inAlternatives) {
      add('Correct domain in alternatives but not primary', label);
    } else {
      add('Wrong domain guessed', `${label} -> guessed ${r.foundDomain}`);
    }
  }

  // Pattern failures (only for contacts with correct domain)
  for (const r of patternResults) {
    if (r.inferredPattern !== 'unknown') continue;
    const tc = r.testCase;
    const local = tc.knownEmail.split('@')[0];
    add('Pattern not recognized', `${tc.knownEmail} (local: ${local})`);
  }

  // Candidate misses
  for (const r of patternResults) {
    if (r.candidatesContainCorrect) continue;
    const tc = r.testCase;
    add('Correct email not in candidate list', `${tc.knownEmail}`);
  }

  // Sort by count descending
  const analyses: FailureAnalysis[] = Object.entries(buckets)
    .map(([reason, examples]) => ({ reason, count: examples.length, examples: examples.slice(0, 5) }))
    .sort((a, b) => b.count - a.count);

  return analyses;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function formatReport(
  cases: TestCase[],
  domainResults: DomainTestResult[],
  patternResults: PatternTestResult[],
  pipelineResults: PipelineTestResult[],
  smtpResults: { contact: string; before: string; after: string; upgraded: boolean }[] | null,
  failures: FailureAnalysis[],
): string {
  const N = cases.length;
  const lines: string[] = [];
  const hr = '─'.repeat(60);

  lines.push('');
  lines.push('=== EMAIL FINDER TEST HARNESS ===');
  lines.push(`Test set: ${N} contacts with corporate emails`);
  lines.push(`Run date: ${new Date().toISOString()}`);
  lines.push('');

  // --- Domain Resolution ---
  const domCorrect = domainResults.filter((r) => r.correct).length;
  const domInAlt = domainResults.filter((r) => r.inAlternatives).length;
  const domNotFound = domainResults.filter((r) => !r.foundDomain).length;
  const domWrong = N - domCorrect - domNotFound - domInAlt;

  lines.push(`--- DOMAIN RESOLUTION (heuristic + MX) ---`);
  lines.push(`Correct domain found:        ${domCorrect}/${N} (${pct(domCorrect, N)})`);
  lines.push(`Correct in alternatives:     ${domInAlt}/${N} (${pct(domInAlt, N)})`);
  lines.push(`Domain not found:            ${domNotFound}`);
  lines.push(`Wrong domain:                ${domWrong}`);
  lines.push('');

  // --- Pattern Detection ---
  const patN = patternResults.length;
  const patCorrect = patternResults.filter((r) => r.inferredPattern !== 'unknown').length;
  const patUnknown = patN - patCorrect;

  lines.push(`--- PATTERN DETECTION (on ${patN} contacts with correct domain) ---`);
  lines.push(`Pattern correctly inferred:  ${patCorrect}/${patN} (${pct(patCorrect, patN)})`);
  lines.push(`Unknown pattern:             ${patUnknown}`);
  lines.push('');

  // Pattern breakdown
  const patternCounts: Record<string, number> = {};
  for (const r of patternResults) {
    const p = r.inferredPattern;
    patternCounts[p] = (patternCounts[p] || 0) + 1;
  }
  lines.push(`Pattern breakdown:`);
  for (const [pattern, count] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${pattern.padEnd(15)} ${count} (${pct(count, patN)})`);
  }
  lines.push('');

  // --- Candidate Generation ---
  const candCorrect = patternResults.filter((r) => r.candidatesContainCorrect).length;
  const ranks = patternResults.filter((r) => r.correctRank !== null).map((r) => r.correctRank!);
  const avgRank = ranks.length > 0 ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : 'N/A';
  const rank1 = ranks.filter((r) => r === 1).length;

  lines.push(`--- CANDIDATE GENERATION (no pattern hint, on ${patN} correct-domain contacts) ---`);
  lines.push(`Correct email in candidates: ${candCorrect}/${patN} (${pct(candCorrect, patN)})`);
  lines.push(`Average rank of correct:     ${avgRank}`);
  lines.push(`Correct email at rank 1:     ${rank1}/${patN} (${pct(rank1, patN)})`);
  lines.push('');

  // With-pattern test
  const withPatCorrect = patternResults.filter((r) => r.withPatternCorrect).length;
  lines.push(`--- CANDIDATE GENERATION (with known pattern) ---`);
  lines.push(`Correct email generated:     ${withPatCorrect}/${patCorrect} (${pct(withPatCorrect, patCorrect)})`);
  lines.push('');

  // --- Full Pipeline ---
  const pipN = pipelineResults.length;
  const pipGreen = pipelineResults.filter((r) => r.result.confidence === 'green').length;
  const pipYellow = pipelineResults.filter((r) => r.result.confidence === 'yellow').length;
  const pipAmber = pipelineResults.filter((r) => r.result.confidence === 'amber').length;
  const pipRed = pipelineResults.filter((r) => r.result.confidence === 'red').length;
  const pipNotFound = pipelineResults.filter((r) => r.result.confidence === 'not-found').length;
  const pipCorrect = pipelineResults.filter((r) => r.emailCorrect).length;
  const pipDomCorrect = pipelineResults.filter((r) => r.domainCorrect).length;

  lines.push(`--- FULL PIPELINE (heuristic only, no SMTP, no web) ---`);
  lines.push(`GREEN:            ${pipGreen} (${pct(pipGreen, pipN)})`);
  lines.push(`YELLOW:           ${pipYellow} (${pct(pipYellow, pipN)})`);
  lines.push(`AMBER:            ${pipAmber} (${pct(pipAmber, pipN)})`);
  lines.push(`RED:              ${pipRed} (${pct(pipRed, pipN)})`);
  lines.push(`NOT-FOUND:        ${pipNotFound} (${pct(pipNotFound, pipN)})`);
  lines.push(`Correct email:    ${pipCorrect}/${pipN} (${pct(pipCorrect, pipN)})`);
  lines.push(`Correct domain:   ${pipDomCorrect}/${pipN} (${pct(pipDomCorrect, pipN)})`);
  lines.push('');

  // --- SMTP results (if run) ---
  if (smtpResults && smtpResults.length > 0) {
    const upgraded = smtpResults.filter((r) => r.upgraded).length;
    lines.push(`--- SMTP VERIFICATION (${smtpResults.length} contacts) ---`);
    lines.push(`Upgraded confidence: ${upgraded}/${smtpResults.length}`);
    for (const r of smtpResults) {
      lines.push(`  ${r.contact}: ${r.before} -> ${r.after} ${r.upgraded ? '(UPGRADED)' : ''}`);
    }
    lines.push('');
  }

  // --- Missed contacts ---
  const missed = pipelineResults.filter((r) => !r.emailCorrect);
  lines.push(`--- MISSED CONTACTS (${missed.length}) ---`);
  lines.push(`${'Name'.padEnd(25)} ${'Company'.padEnd(30)} ${'Known Email'.padEnd(35)} ${'Found'.padEnd(35)} Conf`);
  lines.push(hr);
  for (const m of missed) {
    const tc = m.testCase;
    const name = `${tc.firstName} ${tc.lastName}`.substring(0, 24);
    const company = tc.company.substring(0, 29);
    const known = tc.knownEmail.substring(0, 34);
    const found = (m.result.email ?? '(none)').substring(0, 34);
    lines.push(`${name.padEnd(25)} ${company.padEnd(30)} ${known.padEnd(35)} ${found.padEnd(35)} ${m.result.confidence}`);
  }
  lines.push('');

  // --- Failure patterns ---
  lines.push(`--- TOP FAILURE PATTERNS ---`);
  for (const f of failures) {
    lines.push(`\n${f.reason} (${f.count} cases):`);
    for (const ex of f.examples) {
      lines.push(`  - ${ex}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== EMAIL FINDER TEST HARNESS ===\n');

  // Phase 1: Data prep
  console.log('Phase 1: Loading and filtering test data...');
  const cases = loadTestCases();
  console.log(`Test set: ${cases.length} contacts with corporate emails\n`);

  // Phase 2: Domain resolution
  console.log('Phase 2: Domain resolution (heuristic + MX)...');
  const domainResults = await testDomainResolution(cases);
  const domCorrect = domainResults.filter((r) => r.correct).length;
  console.log(`  -> ${domCorrect}/${cases.length} domains correct\n`);

  // Phase 3: Pattern + candidate tests
  console.log('Phase 3: Pattern detection + candidate generation...');
  const patternResults = testPatterns(cases, domainResults);
  const patCorrect = patternResults.filter((r) => r.inferredPattern !== 'unknown').length;
  const candCorrect = patternResults.filter((r) => r.candidatesContainCorrect).length;
  console.log(`  -> ${patCorrect}/${patternResults.length} patterns detected`);
  console.log(`  -> ${candCorrect}/${patternResults.length} correct emails in candidates\n`);

  // Phase 4: Full pipeline
  console.log('Phase 4: Full pipeline (heuristic only, no SMTP, no web)...');
  const pipelineResults = await testFullPipeline(cases);
  const pipCorrect = pipelineResults.filter((r) => r.emailCorrect).length;
  console.log(`  -> ${pipCorrect}/${cases.length} correct emails found\n`);

  // Phase 5: SMTP (optional)
  let smtpResults: { contact: string; before: string; after: string; upgraded: boolean }[] | null = null;
  if (ENABLE_SMTP) {
    console.log('Phase 5: SMTP verification (subset of amber/red)...');
    smtpResults = await testSmtpSubset(cases, pipelineResults);
    const upgraded = smtpResults.filter((r) => r.upgraded).length;
    console.log(`  -> ${upgraded}/${smtpResults.length} upgraded\n`);
  } else {
    console.log('Phase 5: SMTP verification SKIPPED (set ENABLE_SMTP=1 to enable)\n');
  }

  // Failure analysis
  console.log('Analyzing failure patterns...');
  const failures = analyzeFailures(domainResults, patternResults, pipelineResults);

  // Format and print report
  const report = formatReport(cases, domainResults, patternResults, pipelineResults, smtpResults, failures);
  console.log(report);

  // Write results file
  const mdContent = `---
title: Email Finder Test Results
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
| v1 | ${new Date().toISOString().replace('T', ' ').substring(0, 16)} | Claude | Initial test run |
`;

  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(`${RESULTS_DIR}email-finder-test-results.md`, mdContent, 'utf-8');
    console.log(`\nResults written to: data/showrev/premium/test-runs/email-finder-test-results.md`);
  } catch (err) {
    console.error(`Failed to write results file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error('Test harness failed:', err);
  process.exit(1);
});
