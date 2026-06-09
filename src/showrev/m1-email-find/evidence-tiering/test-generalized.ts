/**
 * Quick test harness for the generalized-mode composer.
 *
 * Runs on 2 prospects (1 Fiber operator, 1 A&E firm) drawn to mirror
 * Focus 100 list structure. Composes generalized emails and prints them
 * so the operator can eyeball quality against the "top 0.01% of AEs" bar.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/test-generalized.ts
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { composeGeneralized } from './generalized-composer.js';
import { resolveAE } from '../ae-config.js';

interface TestProspect {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state: string;
  icpType: 'fiber_operator' | 'ae_firm';
}

const TEST_PROSPECTS: TestProspect[] = [
  // 1. Fiber operator (matches Focus 100 ICP=Fiber operator slice)
  // Real prospect from sr_prospects — Adam Willoughby
  {
    firstName: 'Adam',
    lastName: 'Willoughby',
    company: 'Farmers Telecommunications Cooperative',
    title: 'Senior Outside Plant Tech',
    state: 'AL',
    icpType: 'fiber_operator',
  },
  // 2. A&E firm (matches Focus 100 ICP=High-volume A&E firm slice)
  // Synthetic prospect using a name+title shape from FC2026 attendee CSV
  {
    firstName: 'Sarah',
    lastName: 'Chen',
    company: 'Coleman Engineering',
    title: 'VP of Engineering',
    state: 'CO',
    icpType: 'ae_firm',
  },
];

function micrositeSlugFor(p: TestProspect): string {
  return `${p.company}-${p.firstName}-${p.lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log('======================================================');
  console.log('  Generalized-Mode Composer — Test Run');
  console.log(`  ${new Date().toISOString()}`);
  console.log('======================================================\n');

  for (const p of TEST_PROSPECTS) {
    const ae = resolveAE(p.state);
    const slug = micrositeSlugFor(p);

    console.log(`\n[${p.firstName} ${p.lastName}]`);
    console.log(`  Company: ${p.company}`);
    console.log(`  Title:   ${p.title}`);
    console.log(`  State:   ${p.state}`);
    console.log(`  ICP:     ${p.icpType}`);
    console.log(`  AE:      ${ae.name} (${ae.email})`);
    console.log(`  Slug:    ${slug}`);
    console.log('');

    try {
      const t0 = Date.now();
      const composed = await composeGeneralized({
        prospect: {
          firstName: p.firstName,
          lastName: p.lastName,
          company: p.company,
          title: p.title,
          state: p.state,
        },
        icpType: p.icpType,
        aeName: ae.name,
        micrositeSlug: slug,
        verbose: true,
      });
      const dur = ((Date.now() - t0) / 1000).toFixed(1);

      console.log('---');
      console.log(`  Composed in ${dur}s, mode=${composed.composer_mode}, substrate chunks=${composed.tier_breakdown.generalized_count}`);
      console.log('---');
      console.log(`  SUBJECT: ${composed.subject}`);
      console.log('');
      console.log(`  BODY (${composed.body.split(/\s+/).length} words, ${composed.body.split(/\n\s*\n+/).length} paragraphs):`);
      console.log('');
      console.log(composed.body
        .split('\n')
        .map(l => `    ${l}`)
        .join('\n'));
      console.log('');
      console.log(`  P.S.:`);
      console.log(`    ${composed.ps}`);
      console.log('');
      console.log(`  bodySentences (sentence-level attribution):`);
      for (const s of composed.bodySentences) {
        console.log(`    - "${s.text.slice(0, 80)}..." [claim_ids: ${s.claim_ids.join(', ') || '(empty — generalized)'}]`);
      }
      console.log('');
      console.log('======================================================');
    } catch (err: any) {
      console.error(`  ERROR: ${err.message || err}`);
      console.error(err.stack || '');
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
