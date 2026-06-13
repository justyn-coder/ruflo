/**
 * tests/composer-constraints.test.ts — F1 (BL-016) kill-list verification.
 *
 * Validates the 5 Nick-canon kill-list patterns added to PRODUCT_GUARDS
 * per canon/sources/inorsa-product-truth-nick-2026-06-04.md lines 57-61.
 *
 * Run:
 *   npx tsx src/showrev/m1-email-find/evidence-tiering/tests/composer-constraints.test.ts
 *
 * Exit code 0 = all pass. Non-zero = at least one test failed.
 */

import { checkBannedPhrases } from '../composer-constraints.js';

// ----------------------------------------------------------------------------
// Lightweight grep-friendly harness (matches refutation.test.ts style)
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

function assertContains(hits: string[], needle: string, msg: string) {
  const found = hits.some(h => h.toLowerCase().includes(needle.toLowerCase()));
  if (!found) {
    throw new Error(`${msg}\n      Expected hit containing "${needle}"; got hits: ${JSON.stringify(hits)}`);
  }
}

function assertEmpty(hits: string[], msg: string) {
  if (hits.length > 0) {
    throw new Error(`${msg}\n      Expected zero hits; got: ${JSON.stringify(hits)}`);
  }
}

// ----------------------------------------------------------------------------
// The 5 killed phrases (Nick canon lines 57-61). Test each: as standalone
// sentence, as fragment in larger body, case variants, leading/trailing context.
// ----------------------------------------------------------------------------

const KILL_PHRASES = [
  'Inorsa validates inputs',
  'Inorsa validates design data',
  'Inorsa validates design inputs',
  'Inorsa catches input errors',
  'Inorsa validates inputs before generating',
];

for (const phrase of KILL_PHRASES) {
  test(`F1: "${phrase}" — standalone sentence blocked`, () => {
    const body = `Hi Tim,\n\n${phrase}. That cuts your kickback risk.\n\nMike`;
    const hits = checkBannedPhrases(body, 'Following up', 'cold');
    assertContains(hits, 'kill-list', `Killed phrase "${phrase}" must trigger kill-list label`);
  });

  test(`F1: "${phrase}" — case insensitive (UPPER)`, () => {
    const body = `Note: ${phrase.toUpperCase()} reduces input drift.`;
    const hits = checkBannedPhrases(body, 'Drawings', 'cold');
    assertContains(hits, 'kill-list', `Case-insensitive match must fire for upper-cased "${phrase}"`);
  });

  test(`F1: "${phrase}" — inside larger body blocked`, () => {
    const body =
      `Hey Sarah,\n\nQuick note for the BAM Broadband ` +
      `deployment — ${phrase} so your team has space to focus on QC. ` +
      `Mind sharing a 15-min call?\n\nMike`;
    const hits = checkBannedPhrases(body, 'BAM Broadband drawings', 'cold');
    assertContains(hits, 'kill-list', `Killed phrase in mid-body must block`);
  });

  test(`F1: "${phrase}" — also blocks for warm leads`, () => {
    // Per Nick canon, the kill-list applies universally — booth visitors
    // cannot say "Inorsa validates inputs" any more than cold prospects can.
    const body = `Great meeting you at Fiber Connect! ${phrase}.`;
    const hits = checkBannedPhrases(body, 'Follow-up from booth', 'warm');
    assertContains(hits, 'kill-list', `Kill-list must apply to warm leads too`);
  });
}

// ----------------------------------------------------------------------------
// Benign control — Nick-canon-approved replacement framing should NOT trigger.
// ----------------------------------------------------------------------------

test('F1: canon-approved framing — accelerates production line passes', () => {
  const body =
    `Hi Tim,\n\nInorsa accelerates drawing production so your team has time ` +
    `for thorough QC before jurisdictional submission. Worth a 15-min walkthrough?\n\nMike`;
  const hits = checkBannedPhrases(body, 'Drawings throughput', 'cold');
  // Canon-approved framing should not trip the kill-list patterns. Note: this
  // body may still trip OTHER guards (e.g., "worth a 15-min" hits Tim-kill).
  // For F1 specifically we assert no kill-list-label hits.
  const killListHits = hits.filter(h => h.toLowerCase().includes('kill-list'));
  if (killListHits.length > 0) {
    throw new Error(`Expected zero kill-list hits on canon-approved line; got: ${JSON.stringify(killListHits)}`);
  }
});

test('F1: "flags missing inputs" framing passes (the one exception per Nick)', () => {
  // Per Nick: "Validating inputs doesn't really apply ... EXCEPT when a key
  // input is missing." So affirmative framing about flagging missing inputs
  // is canonically correct.
  const body =
    `Hi Sarah,\n\nIf a required input is missing, Inorsa surfaces it before ` +
    `drawings are produced — drafters don't burn hours on a dead-end package.\n\nMike`;
  const hits = checkBannedPhrases(body, 'Missing-input surfacing', 'cold');
  const killListHits = hits.filter(h => h.toLowerCase().includes('kill-list'));
  if (killListHits.length > 0) {
    throw new Error(`Expected zero kill-list hits on "flags missing inputs" framing; got: ${JSON.stringify(killListHits)}`);
  }
});

test('F1: generic benign sentence passes', () => {
  const body =
    `Hi Sarah,\n\nQuick question on your BEAD drawings cadence. ` +
    `Are construction drawings keeping pace with your build schedule?\n\nMike`;
  const hits = checkBannedPhrases(body, 'Drawings cadence', 'cold');
  const killListHits = hits.filter(h => h.toLowerCase().includes('kill-list'));
  assertEmpty(killListHits, 'Generic benign body must produce zero kill-list hits');
});

// ----------------------------------------------------------------------------
// Subject-line coverage — killed phrase in subject only (no body match) must
// still block (checkBannedPhrases concatenates subject + body before scan).
// ----------------------------------------------------------------------------

test('F1: killed phrase in subject blocks even if body is benign', () => {
  const subject = 'How Inorsa validates inputs for your BEAD deployment';
  const body = `Hi Sarah,\n\nQuick question on your drawings cadence.\n\nMike`;
  const hits = checkBannedPhrases(body, subject, 'cold');
  assertContains(hits, 'kill-list', 'Killed phrase in subject must trigger label');
});

// ----------------------------------------------------------------------------
// Summary + exit
// ----------------------------------------------------------------------------

console.log('');
console.log(`F1 kill-list test summary: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
