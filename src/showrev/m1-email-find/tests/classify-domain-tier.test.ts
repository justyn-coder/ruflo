/**
 * tests/classify-domain-tier.test.ts — F3.c (fix-sprint-2026-06-13-v2)
 *
 * Unit test for classifyDomainTier() in verify-facts.ts. Fixture URLs cover:
 *  - PROHIBITED scrapers (zoominfo, leadiq, rocketreach)
 *  - T1 government primaries (.gov + FCC/SEC/NTIA)
 *  - T2 trade press + news wires
 *  - T3 default bucket (company own-sites, finance aggregators, local news)
 *  - T4 no-URL fallback
 *  - Subdomain handling (investor.shentel.com → T3; broadbandmap.fcc.gov → T1)
 *  - www. normalization
 *  - Malformed URLs
 *
 * Run:
 *   npx tsx src/showrev/m1-email-find/tests/classify-domain-tier.test.ts
 *
 * Exit code 0 = pass, non-zero = fail.
 */

import { classifyDomainTier, extractHost } from '../verify-facts.js';

// ----------------------------------------------------------------------------
// Lightweight grep-friendly harness
// ----------------------------------------------------------------------------

let pass = 0;
let fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    pass++;
  } catch (e: any) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${e.message}`);
    failures.push(name);
    fail++;
  }
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(actual)}`);
  }
}

// ----------------------------------------------------------------------------
// PROHIBITED — scraper/aggregator data brokers
// ----------------------------------------------------------------------------

const PROHIBITED_URLS = [
  'https://www.zoominfo.com/c/empower-broadband',
  'https://zoominfo.com/p/john-smith',
  'http://leadiq.com/companies/altamaha-emc',
  'https://www.leadiq.com/contact/jane-doe',
  'https://rocketreach.co/profile/mike-rutski',
  'https://rocketreach.com/profile/mike-rutski',
  'https://hunter.io/companies/example.com',
  'https://lusha.com/profile/abc',
  'https://www.snov.io/contact/test',
  'https://signalhire.com/profile/foo',
  'https://contactout.com/u/bar',
];

for (const url of PROHIBITED_URLS) {
  test(`F3.c: PROHIBITED — ${url}`, () => {
    assertEq(classifyDomainTier(url), 'PROHIBITED', `${url} must classify as PROHIBITED`);
  });
}

// ----------------------------------------------------------------------------
// T1 — government primary
// ----------------------------------------------------------------------------

const T1_URLS = [
  'https://www.fcc.gov/document/foo',
  'https://broadbandmap.fcc.gov/data/2024',
  'https://www.ntia.gov/programs/bead',
  'https://broadbandusa.ntia.gov/awards/state-x',
  'https://www.sec.gov/edgar/something',
  'https://www.congress.gov/bill/118th',
  'https://www.gao.gov/products/gao-24-456',
  // any .gov host
  'https://broadband.ny.gov/initiatives',
  'https://oeb.ca.gov/programs',
  'https://www.commerce.gov/news/press-releases',
];

for (const url of T1_URLS) {
  test(`F3.c: T1 — ${url}`, () => {
    assertEq(classifyDomainTier(url), 'T1', `${url} must classify as T1`);
  });
}

// ----------------------------------------------------------------------------
// T2 — trade press + news wires + trade associations
// ----------------------------------------------------------------------------

const T2_URLS = [
  'https://www.prnewswire.com/news-releases/foo',
  'https://www.businesswire.com/news/home/123',
  'https://www.globenewswire.com/news-release/xyz',
  'https://www.reuters.com/business/telecom/article-x',
  'https://www.bloomberg.com/news/articles/abc',
  'https://www.wsj.com/articles/fiber-build',
  'https://www.lightreading.com/broadband',
  'https://www.fiercenetwork.com/broadband/xyz',
  'https://www.fierce-network.com/broadband/xyz',
  'https://www.telecompetitor.com/news/post',
  'https://www.broadbandbreakfast.com/2024/foo',
  'https://www.fiberbroadband.org/page',
  'https://www.communitynetworks.org/initiative',
  'https://www.ntca.org/foo',
  'https://www.ustelecom.org/research',
  'https://www.bbcmag.com/post',
  'https://www.datacenterdynamics.com/news/foo',
  'https://www.insidetowers.com/article/x',
  'https://newswire.telecomramblings.com/2025/xyz',
];

for (const url of T2_URLS) {
  test(`F3.c: T2 — ${url}`, () => {
    assertEq(classifyDomainTier(url), 'T2', `${url} must classify as T2`);
  });
}

// ----------------------------------------------------------------------------
// T3 — single secondary (default bucket)
// ----------------------------------------------------------------------------

const T3_URLS = [
  // Company own-sites
  'https://www.empower-broadband.com/about',
  'https://www.tepgroup.net/services/fiber',
  'https://gatewayfiber.com/news',
  'https://www.epb.com/community',
  'https://verizon.com/about',
  // Finance aggregators
  'https://finance.yahoo.com/quote/SHEN',
  'https://www.investing.com/equities/shentel',
  'https://uk.investing.com/news/foo',
  // Local news / regional press
  'https://www.timesfreepress.com/news/x',
  'https://losalamosreporter.com/2024/foo',
  'https://sierranewsonline.com/article',
  // LinkedIn (primary social content but unverified)
  'https://www.linkedin.com/company/altamaha-emc',
  'https://linkedin.com/in/john-smith',
  // Glassdoor / Indeed (employee reviews, not scrapers — T3 per existing classifier)
  'https://www.glassdoor.com/Overview/Working-at-X.htm',
  'https://www.indeed.com/cmp/foo/reviews',
  // Investor relations
  'https://investor.shentel.com/news',
  'https://ir.isg-one.com/news/foo',
  // Industry blogs we don't explicitly tier
  'https://www.themountainbuzz.com/2024/post',
];

for (const url of T3_URLS) {
  test(`F3.c: T3 default — ${url}`, () => {
    assertEq(classifyDomainTier(url), 'T3', `${url} must classify as T3 (default)`);
  });
}

// ----------------------------------------------------------------------------
// T4 — no URL / LLM inference
// ----------------------------------------------------------------------------

test('F3.c: T4 — empty string', () => {
  assertEq(classifyDomainTier(''), 'T4', 'Empty string must classify as T4');
});

test('F3.c: T4 — whitespace only', () => {
  assertEq(classifyDomainTier('   '), 'T4', 'Whitespace must classify as T4');
});

test('F3.c: T4 — malformed (no domain at all)', () => {
  assertEq(classifyDomainTier('this is not a url'), 'T4', 'Non-URL text must classify as T4');
});

test('F3.c: T4 — protocol-only', () => {
  assertEq(classifyDomainTier('https://'), 'T4', 'Protocol with no host must classify as T4');
});

// ----------------------------------------------------------------------------
// Edge cases: precedence + normalization
// ----------------------------------------------------------------------------

test('F3.c: PROHIBITED takes precedence over T3 default', () => {
  // zoominfo.com would otherwise fall through to T3 — must hit PROHIBITED first
  assertEq(classifyDomainTier('https://zoominfo.com/foo'), 'PROHIBITED',
    'PROHIBITED must be checked before T3 default');
});

test('F3.c: T1 .gov suffix catches arbitrary state/local hosts', () => {
  assertEq(classifyDomainTier('https://broadband.tx.gov/programs'), 'T1', 'State .gov must be T1');
  assertEq(classifyDomainTier('https://www.cdc.gov/research'), 'T1', 'Any .gov must be T1');
});

test('F3.c: www. prefix stripped before host match', () => {
  assertEq(classifyDomainTier('https://www.zoominfo.com/foo'), 'PROHIBITED', 'www.zoominfo.com → PROHIBITED');
  assertEq(classifyDomainTier('https://www.lightreading.com/foo'), 'T2', 'www.lightreading.com → T2');
});

test('F3.c: missing protocol still works (tolerant)', () => {
  // Common case: pipeline-extracted source_citation may not carry protocol
  assertEq(classifyDomainTier('zoominfo.com/foo'), 'PROHIBITED', 'Bare host must still classify');
  assertEq(classifyDomainTier('www.fcc.gov/document'), 'T1', 'Bare gov host must still classify');
});

test('F3.c: subdomains of PROHIBITED hosts also blocked', () => {
  assertEq(classifyDomainTier('https://api.zoominfo.com/v1/x'), 'PROHIBITED', 'Subdomain of PROHIBITED → PROHIBITED');
  assertEq(classifyDomainTier('https://cache.rocketreach.co/foo'), 'PROHIBITED', 'Subdomain of PROHIBITED → PROHIBITED');
});

test('F3.c: subdomains of T2 hosts inherit T2', () => {
  assertEq(classifyDomainTier('https://news.businesswire.com/foo'), 'T2', 'Subdomain of T2 → T2');
  assertEq(classifyDomainTier('https://blogs.reuters.com/foo'), 'T2', 'Subdomain of T2 → T2');
});

test('F3.c: extractHost helper directly', () => {
  assertEq(extractHost('https://www.example.com/foo'), 'example.com', 'extractHost strips www. + path');
  assertEq(extractHost('https://example.com'),         'example.com', 'extractHost handles no-path');
  assertEq(extractHost(''),                            '',            'extractHost handles empty');
  assertEq(extractHost('not a url'),                   '',            'extractHost handles garbage');
  assertEq(extractHost('https://'),                    '',            'extractHost handles protocol-only');
});

// ----------------------------------------------------------------------------
// Smoke: classifier is total (returns one of 5 enum values for any input)
// ----------------------------------------------------------------------------

test('F3.c: classifier is total — every URL returns a valid enum value', () => {
  const samples = [
    'https://www.example.com',
    'mailto:foo@bar.com',
    'ftp://files.example.com/x',
    '',
    'asdf',
    'https://foo.gov.uk/page',  // non-US .gov.uk → not T1 (no .gov suffix match by current rules)
  ];
  const valid = new Set(['T1', 'T2', 'T3', 'T4', 'PROHIBITED']);
  for (const url of samples) {
    const tier = classifyDomainTier(url);
    if (!valid.has(tier)) {
      throw new Error(`classifyDomainTier(${JSON.stringify(url)}) returned invalid tier: ${tier}`);
    }
  }
});

// ----------------------------------------------------------------------------
// Summary + exit
// ----------------------------------------------------------------------------

console.log('');
console.log(`F3.c classifyDomainTier test summary: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
