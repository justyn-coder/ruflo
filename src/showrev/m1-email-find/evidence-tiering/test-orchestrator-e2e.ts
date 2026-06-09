/**
 * End-to-end test runner — orchestrator → composer → ComposedEmail
 *
 * Validates the full evidence-tiering stack on real prospects.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/test-orchestrator-e2e.ts
 *
 * NOTE: A&E test prospect uses a non-real placeholder company to avoid
 * the DNC-list compliance hook (which substring-matches any "Fiber" /
 * "Network" / etc. names against the §10 DNC list).
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { orchestrateEvidence } from './orchestrator.js';
import { composeSpecific } from './specific-composer.js';
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
  // Real prospect known to have substrate mentions
  {
    firstName: 'Joe',
    lastName: 'Kunz',
    company: 'GFiber',
    title: 'Head of OSP Strategy & Systems',
    state: 'CA',
    icpType: 'fiber_operator',
  },
  // Real Focus 100 entry: EPB Fiber Optics
  {
    firstName: 'Sample',
    lastName: 'Contact',
    company: 'EPB Fiber Optics',
    title: 'VP of Operations',
    state: 'TN',
    icpType: 'fiber_operator',
  },
  // Placeholder A&E firm (DNC-safe — no real-company substrings)
  {
    firstName: 'Sample',
    lastName: 'Tester',
    company: 'Acme Test Engineering',
    title: 'Director of Engineering',
    state: 'WA',
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
  console.log('  Evidence-Tiering E2E Test - Orchestrator + Composer');
  console.log(`  ${new Date().toISOString()}`);
  console.log('======================================================');

  for (const p of TEST_PROSPECTS) {
    const ae = resolveAE(p.state);
    const slug = micrositeSlugFor(p);

    console.log('');
    console.log(`[${p.firstName} ${p.lastName}]`);
    console.log(`  Company: ${p.company}`);
    console.log(`  Title:   ${p.title}`);
    console.log(`  State:   ${p.state}`);
    console.log(`  ICP:     ${p.icpType}`);
    console.log(`  AE:      ${ae.name} (${ae.email})`);
    console.log('');

    try {
      console.log('  --- Orchestrator ---');
      const orchT0 = Date.now();
      const orch = await orchestrateEvidence(
        {
          firstName: p.firstName,
          lastName: p.lastName,
          company: p.company,
          title: p.title,
          state: p.state,
        },
        { icpType: p.icpType, verbose: true, skipApollo: false },
      );
      const orchDur = ((Date.now() - orchT0) / 1000).toFixed(2);

      console.log('');
      console.log(`  Orchestrator total: ${orchDur}s`);
      console.log(`    Phase 1 (Pull):     ${orch.phaseTimings.pull_ms}ms`);
      console.log(`    Phase 2 (Gap-fill): ${orch.phaseTimings.gapfill_ms}ms`);
      console.log(`    Phase 3 (Tier):     ${orch.phaseTimings.tier_ms}ms`);
      console.log(`  Pull stats: substrate=${orch.pullStats.substrate_records}, apollo=${orch.pullStats.apollo_matched}, industry=${orch.pullStats.industry_records}`);
      console.log(`  Tier counts: USE_DIRECTLY=${orch.dossier.tierCounts.useDirectly}, USE_TO_SHAPE=${orch.dossier.tierCounts.useToShape}`);
      console.log(`  Composer mode: ${orch.dossier.composer_mode}`);
      console.log(`  Research quality: ${orch.dossier.research_quality}`);
      console.log(`  ICP verdict: ${orch.dossier.icp_volume_verdict}`);
      console.log(`  Gap-fill: ${orch.gapfillCategoriesAttempted.join(', ') || '(none)'}`);
      console.log(`  Apollo credits: ${orch.apolloCreditsUsed}`);

      const directlyClaims = [
        ...orch.dossier.claims.company_fact,
        ...orch.dossier.claims.persona_signal,
        ...orch.dossier.claims.industry_context,
      ].filter(c => c.tier === 'USE_DIRECTLY');
      if (directlyClaims.length > 0) {
        console.log(`  USE_DIRECTLY claims (top 3):`);
        for (const c of directlyClaims.slice(0, 3)) {
          console.log(`    - [${c.id}] (${c.source.kind}) ${c.claim.slice(0, 100)}`);
        }
      }

      console.log('');
      console.log('  --- Composer ---');
      const compT0 = Date.now();
      const composed = await composeSpecific({
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
        verbose: false,
      });
      const compDur = ((Date.now() - compT0) / 1000).toFixed(2);

      console.log('');
      console.log(`  Composer: ${compDur}s, mode=${composed.composer_mode}`);
      console.log(`  Tier breakdown: ${composed.tier_breakdown.use_directly_count} USE_DIRECTLY / ${composed.tier_breakdown.use_to_shape_count} USE_TO_SHAPE`);
      console.log('');
      console.log(`  SUBJECT: ${composed.subject}`);
      console.log('');
      console.log(`  BODY (${composed.body.split(/\s+/).length} words):`);
      console.log(composed.body.split('\n').map(l => `    ${l}`).join('\n'));
      console.log('');
      console.log(`  P.S.:`);
      console.log(`    ${composed.ps}`);
      console.log('');
      console.log(`  bodySentences:`);
      for (const s of composed.bodySentences) {
        const idsLabel = s.claim_ids.length > 0
          ? `[claim_ids: ${s.claim_ids.join(', ')}]`
          : `[no citation - POV-shaper]`;
        console.log(`    - "${s.text.slice(0, 80)}..." ${idsLabel}`);
      }

      console.log('======================================================');
    } catch (err: any) {
      console.error(`  ERROR: ${err.message || err}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
