import { evaluateConfidence } from '../../src/showrev/deliverability/confidence-gate.js';
import {
  recordOutcome, shouldHalt, reset, getBatchStats,
} from '../../src/showrev/deliverability/bounce-monitor.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function eq(a: any, b: any, name: string) {
  assert(a === b, `${name} (got ${a}, expected ${b})`);
}

console.log('\n=== Confidence Gate ===\n');

let r = evaluateConfidence('j@acme.com', 'provided-verified', { quality: 'good' }, false);
eq(r.color, 'green', 'provided-verified + MV good = green');
eq(r.score, 100, 'provided-verified + MV good = 100 (clamped)');
eq(r.canSend, true, 'can send');

r = evaluateConfidence('j@acme.com', 'apollo-verified', undefined, false);
eq(r.score, 90, 'apollo-verified no MV = 90');
eq(r.color, 'green', 'apollo-verified = green');

r = evaluateConfidence('j@acme.com', 'duckduckgo', undefined, false);
eq(r.score, 40, 'duckduckgo = 40');
eq(r.color, 'yellow', 'duckduckgo = yellow');

r = evaluateConfidence('j@acme.com', 'duckduckgo', { quality: 'good' }, false);
eq(r.score, 60, 'duckduckgo + MV good = 60');

r = evaluateConfidence('j@acme.com', 'clearbit', { quality: 'good' }, false);
eq(r.score, 70, 'clearbit + MV good = 70');
eq(r.color, 'green', 'clearbit + MV good = green');

r = evaluateConfidence('j@acme.com', 'apollo-verified', undefined, true);
eq(r.score, 75, 'apollo-verified + CSV domain mismatch = 75');
eq(r.color, 'green', 'still green');

r = evaluateConfidence('j@acme.com', 'pattern-derived', { quality: 'bad' }, false);
eq(r.score, 0, 'pattern-derived + MV bad = 0');
eq(r.color, 'red', 'MV bad = red');
eq(r.canSend, false, 'cannot send');

r = evaluateConfidence('j@acme.com', 'provided-verified', { quality: 'catch_all' }, false);
eq(r.score, 85, 'provided-verified + catch_all = 85');

r = evaluateConfidence('pending@acme.com', 'provided', undefined, false);
eq(r.score, 0, 'pending@ = 0');
eq(r.color, 'red', 'pending@ = red');
eq(r.canSend, false, 'pending@ cannot send');

r = evaluateConfidence('', 'unknown', undefined, false);
eq(r.score, 0, 'empty email = 0');
eq(r.canSend, false, 'empty email cannot send');

// Edge: MV disposable
r = evaluateConfidence('j@acme.com', 'provided', { quality: 'disposable' }, false);
eq(r.score, 0, 'provided + disposable = 0 (clamped from -10)');
eq(r.canSend, false, 'disposable cannot send');

console.log('\n=== Bounce Monitor ===\n');

reset();
for (let i = 0; i < 5; i++) recordOutcome(`user${i}@test.com`, false);
recordOutcome('bad@test.com', true, 'hard');
let d = shouldHalt();
eq(d.shouldHalt, false, 'no halt below min sample (6/10)');
assert(d.reason.includes('sample too small'), 'reason says sample too small');

reset();
for (let i = 0; i < 19; i++) recordOutcome(`user${i}@test.com`, false);
recordOutcome('bad@test.com', true, 'hard');
d = shouldHalt();
eq(d.shouldHalt, true, 'halt at 5% hard bounce (1/20)');
assert(d.reason.includes('hard bounce'), 'reason mentions hard bounce');

reset();
for (let i = 0; i < 19; i++) recordOutcome(`user${i}@test.com`, false);
recordOutcome('soft@test.com', true, 'soft');
d = shouldHalt();
eq(d.shouldHalt, false, 'no halt at 5% soft-only (under 10% total)');

reset();
for (let i = 0; i < 9; i++) recordOutcome(`user${i}@test.com`, false);
recordOutcome('soft@test.com', true, 'soft');
d = shouldHalt();
eq(d.shouldHalt, true, 'halt at 10% total bounce (1/10)');
assert(d.reason.includes('total bounce'), 'reason mentions total bounce');

reset();
recordOutcome('a@test.com', false);
recordOutcome('b@test.com', true, 'hard');
recordOutcome('c@test.com', true, 'soft');
recordOutcome('d@test.com', false);
const s = getBatchStats();
eq(s.total, 4, 'total = 4');
eq(s.delivered, 2, 'delivered = 2');
eq(s.hardBounces, 1, 'hardBounces = 1');
eq(s.softBounces, 1, 'softBounces = 1');
eq(s.bounced, 2, 'bounced = 2');

reset();
const s2 = getBatchStats();
eq(s2.total, 0, 'reset clears total');
eq(s2.bounced, 0, 'reset clears bounced');

console.log(`\n${'='.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
