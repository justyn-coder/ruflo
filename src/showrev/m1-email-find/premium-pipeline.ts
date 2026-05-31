#!/usr/bin/env npx tsx

/**
 * Premium M1 Email Find Pipeline
 *
 * 3-persona STORM research → influence pattern selection → anti-tell composition → quality judge
 *
 * Usage:
 *   npx tsx premium-pipeline.ts run --tiers=A,B
 *   npx tsx premium-pipeline.ts run --tiers=A,B,C,D --batch=5
 *   npx tsx premium-pipeline.ts run --prospect=fc2026-061   (single prospect)
 *   npx tsx premium-pipeline.ts dry-run --tiers=A,B
 */

import { resolve, dirname } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { importProspects, printImportSummary, type Prospect } from './importer.js';
import { RESEARCH_PERSONAS, buildMultiPersonaPrompt, generateCrossExamQuestions } from './personas.js';
import { INFLUENCE_TOOLKIT, buildPatternSelectorPrompt, buildComposerPrompt, type PatternSelection } from './influence.js';
import { type HubSpotDossier, formatDossierForAE } from './dossier-schema.js';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev');
const INORSA_VP_SUMMARY = `Inorsa turns design data into permit-ready construction drawings. Quality control is built in, so builds keep moving. Engineering Suite + Data Suite. Fiber only (no tower/cellular).`;

const AE_TERRITORY: Record<string, { name: string; email: string }> = {
  east: { name: 'Mike Rutski', email: 'mike@inorsa.com' },
  central: { name: 'Nathan Dunn', email: 'nathan@inorsa.com' },
  west: { name: 'Lucas Spencer', email: 'lucas@inorsa.com' },
};

interface PremiumConfig {
  csvPath: string;
  tiers: string[];
  model: string;
  batchSize: number;
  dryRun: boolean;
  singleProspect?: string;
  outputDir: string;
}

interface ProspectOutput {
  prospect: Prospect;
  personaFindings: {
    analyst: string;
    aeProxy: string;
    techEval: string;
  };
  crossExamInsights: string;
  dossier: HubSpotDossier;
  emails: Array<{
    touchNumber: number;
    pattern: PatternSelection;
    subject: string;
    previewText: string;
    body: string;
    ps: string;
    wordCount: number;
  }>;
  aePrep: string;
}

function buildProspectContext(p: Prospect): string {
  return `Company: ${p.company}
Contact: ${p.firstName} ${p.lastName}
Title: ${p.title}
Location: ${p.city}, ${p.state}
Email: ${p.email}
Phone: ${p.phone}
Lead type: ${p.leadType}
Current tier: ${p.tier} (${p.grade})`;
}

function findRelatedContacts(prospect: Prospect, allProspects: Prospect[]): Prospect[] {
  const companyNormalized = prospect.company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return allProspects.filter(p =>
    p.id !== prospect.id &&
    p.company.toLowerCase().replace(/[^a-z0-9]/g, '').includes(companyNormalized.slice(0, 6))
  );
}

async function processProspect(
  prospect: Prospect,
  allProspects: Prospect[],
  config: PremiumConfig
): Promise<ProspectOutput | null> {
  const prospectContext = buildProspectContext(prospect);
  const relatedContacts = findRelatedContacts(prospect, allProspects);
  const relatedNote = relatedContacts.length > 0
    ? `\n\nOther contacts from this company at the show: ${relatedContacts.map(c => `${c.firstName} ${c.lastName} (${c.title})`).join(', ')}`
    : '';

  console.log(`\n  ┌─ ${prospect.firstName} ${prospect.lastName} @ ${prospect.company} [Tier ${prospect.tier}]`);
  if (relatedContacts.length > 0) {
    console.log(`  │  Multi-thread: ${relatedContacts.map(c => c.firstName + ' ' + c.lastName).join(', ')}`);
  }

  if (config.dryRun) {
    console.log(`  │  [DRY RUN] Would run 3-persona research + influence selection + 3-touch composition`);
    console.log(`  └─ Skipped (dry run)\n`);
    return null;
  }

  // PHASE 1: Multi-persona research (3 parallel agents)
  console.log(`  │  Phase 1: 3-persona research...`);
  const personaResults: Record<string, string> = {};

  for (const persona of RESEARCH_PERSONAS) {
    const prompt = buildMultiPersonaPrompt(
      prospectContext + relatedNote,
      persona,
      prospect.aeNotes,
      Object.keys(personaResults).length > 0 ? {
        analyst: personaResults['Industry Analyst'],
        ae: personaResults['AE Proxy'],
        tech: personaResults['Technical Evaluator'],
      } : undefined
    );

    // In production, these would be parallel API calls
    // For now, we write the prompts to files for agent execution
    const promptPath = resolve(config.outputDir, 'prompts', `${prospect.id}-${persona.role.toLowerCase().replace(/\s/g, '-')}.md`);
    mkdirSync(dirname(promptPath), { recursive: true });
    writeFileSync(promptPath, prompt);
    personaResults[persona.role] = `[Awaiting ${persona.role} research results]`;
    console.log(`  │  ✓ ${persona.role} prompt generated`);
  }

  // PHASE 2: Cross-examination questions
  console.log(`  │  Phase 2: Cross-examination questions generated`);
  const crossExamQuestions = generateCrossExamQuestions(
    personaResults['Industry Analyst'] || '',
    personaResults['AE Proxy'] || '',
    personaResults['Technical Evaluator'] || ''
  );

  const crossExamPath = resolve(config.outputDir, 'prompts', `${prospect.id}-cross-exam.md`);
  writeFileSync(crossExamPath, JSON.stringify(crossExamQuestions, null, 2));

  // PHASE 3: Influence pattern selection for each touch
  console.log(`  │  Phase 3: Influence pattern selection...`);
  const dossierSummary = `Company: ${prospect.company}. Title: ${prospect.title}. ${prospect.aeNotes ? `Booth notes: "${prospect.aeNotes}"` : 'No booth notes.'}${relatedNote}`;

  const patternPrompts: string[] = [];
  for (const touchNum of [1, 2, 3] as const) {
    const prompt = buildPatternSelectorPrompt(dossierSummary, prospect.aeNotes, prospect.title, touchNum);
    const promptPath = resolve(config.outputDir, 'prompts', `${prospect.id}-pattern-t${touchNum}.md`);
    writeFileSync(promptPath, prompt);
    patternPrompts.push(prompt);
    console.log(`  │  ✓ T${touchNum} influence pattern prompt generated`);
  }

  // PHASE 4: Email composition prompts
  console.log(`  │  Phase 4: Email composition prompts...`);
  // These would be generated after pattern selection in production
  // For now, generate a template composer prompt for each touch
  for (const touchNum of [1, 2, 3] as const) {
    const mockPattern: PatternSelection = {
      pattern: prospect.aeNotes?.includes('demo') || prospect.aeNotes?.includes('meeting')
        ? 'commitment_consistency'
        : prospect.aeNotes?.includes('price') || prospect.aeNotes?.includes('previously')
          ? 'reframe_anchor'
          : prospect.aeNotes
            ? 'challenger_insight'
            : 'curiosity_gap',
      rationale: 'Auto-selected based on available signals',
      emotionalFrame: prospect.aeNotes?.includes('BEAD') || prospect.aeNotes?.includes('ASAP') ? 'urgency' : 'curiosity',
      challengerInsight: '[Generated by pattern selector]',
      psStrategy: '[Generated by pattern selector]',
      ctaType: touchNum === 1 ? 'interest_based' : touchNum === 2 ? 'soft_time' : 'binary_close',
    };

    // Resolve AE from prospect territory or assigned_ae field
    const aeKey = (prospect as any).assigned_ae || 'east';
    const ae = AE_TERRITORY[aeKey] || AE_TERRITORY.east;
    const micrositeSlug = prospect.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const composerPrompt = buildComposerPrompt(
      mockPattern,
      dossierSummary,
      { firstName: prospect.firstName, lastName: prospect.lastName, title: prospect.title, company: prospect.company },
      prospect.aeNotes,
      touchNum,
      undefined,  // previousTouchSubject
      ae.name,
      ae.email,
      micrositeSlug
    );

    const promptPath = resolve(config.outputDir, 'prompts', `${prospect.id}-compose-t${touchNum}.md`);
    writeFileSync(promptPath, composerPrompt);
    console.log(`  │  ✓ T${touchNum} composer prompt generated`);
  }

  // PHASE 5: Generate AE prep sheet
  console.log(`  │  Phase 5: AE prep sheet...`);
  const mockDossier: HubSpotDossier = {
    contact: {
      email: prospect.email,
      firstname: prospect.firstName,
      lastname: prospect.lastName,
      jobtitle: prospect.title,
      phone: prospect.phone,
      city: prospect.city,
      state: prospect.state,
      showrev_research_summary: '[Populated by research]',
      showrev_decision_authority: 'Unknown',
      showrev_likely_objections: prospect.aeNotes?.includes('price') ? 'Price sensitivity (prior relationship)' : '[Populated by research]',
      showrev_talking_points: prospect.aeNotes ? `Reference booth conversation: "${prospect.aeNotes}"` : '[Populated by research]',
      showrev_booth_notes: prospect.aeNotes || '',
      showrev_persona_classification: '[Populated by research]',
      showrev_linkedin_summary: '[Populated by research]',
      showrev_other_stakeholders: relatedContacts.map(c => `${c.firstName} ${c.lastName} (${c.title})`).join(', ') || 'None identified at show',
    },
    company: {
      name: prospect.company,
      domain: prospect.email.split('@')[1] || '',
      city: prospect.city,
      state: prospect.state,
      industry: 'Fiber Optics / Telecommunications',
      showrev_company_summary: '[Populated by research]',
      showrev_company_size: '[Populated by research]',
      showrev_fiber_activities: '[Populated by research]',
      showrev_bead_status: '[Populated by research]',
      showrev_growth_signals: '[Populated by research]',
      showrev_competitive_landscape: '[Populated by research]',
      showrev_key_projects: '[Populated by research]',
      showrev_recent_news: '[Populated by research]',
      showrev_external_deadlines: '[Populated by research]',
    },
    salesIntel: {
      showrev_influence_pattern: '[Selected by pattern selector]',
      showrev_challenger_insight: '[Generated by research]',
      showrev_buying_timeline: '[Inferred by research]',
      showrev_deal_size_estimate: '[Estimated by research]',
      showrev_signal_strength: '[Scored by research]',
      showrev_fit_rationale: '[Generated by research]',
      showrev_next_best_action: prospect.aeNotes?.includes('demo') ? 'Book demo - prospect asked at booth' : '[Determined by research]',
      showrev_risk_factors: '[Identified by research]',
      showrev_multi_thread_contacts: relatedContacts.map(c => `${c.firstName} ${c.lastName} (${c.title})`).join(', ') || '',
    },
    emailSequence: {
      showrev_t1_subject: '[Composed]', showrev_t1_body: '[Composed]', showrev_t1_ps: '[Composed]',
      showrev_t1_send_date: new Date().toISOString().split('T')[0], showrev_t1_status: 'draft',
      showrev_t2_subject: '[Composed]', showrev_t2_body: '[Composed]', showrev_t2_ps: '[Composed]',
      showrev_t2_send_date: '', showrev_t2_status: 'draft',
      showrev_t3_subject: '[Composed]', showrev_t3_body: '[Composed]', showrev_t3_ps: '[Composed]',
      showrev_t3_send_date: '', showrev_t3_status: 'draft',
    },
    meta: {
      showrev_research_date: new Date().toISOString(),
      showrev_research_confidence: 'pending',
      showrev_sources_count: 0,
      showrev_sources_list: '[]',
      showrev_original_tier: prospect.tier,
      showrev_revised_tier: prospect.tier,
      showrev_tier_revision_reason: '',
      showrev_research_model: 'premium_3persona',
      showrev_personas_used: 'analyst,ae_proxy,tech_evaluator',
      showrev_show_name: 'Fiber Connect 2026',  // Gaylord Palms Resort, Kissimmee FL, Booth 1728
      showrev_show_date: '2026-05-18',           // May 18-19, 2026
    },
  };

  const aePrep = formatDossierForAE(mockDossier);
  const aePrepPath = resolve(config.outputDir, 'ae-prep', `${prospect.id}-ae-prep.md`);
  mkdirSync(dirname(aePrepPath), { recursive: true });
  writeFileSync(aePrepPath, aePrep);

  const dossierPath = resolve(config.outputDir, 'dossiers', `${prospect.id}-dossier.json`);
  mkdirSync(dirname(dossierPath), { recursive: true });
  writeFileSync(dossierPath, JSON.stringify(mockDossier, null, 2));

  console.log(`  └─ ✓ All prompts + schema generated for ${prospect.firstName} ${prospect.lastName}\n`);

  return {
    prospect,
    personaFindings: {
      analyst: personaResults['Industry Analyst'] || '',
      aeProxy: personaResults['AE Proxy'] || '',
      techEval: personaResults['Technical Evaluator'] || '',
    },
    crossExamInsights: '',
    dossier: mockDossier,
    emails: [],
    aePrep,
  };
}

async function runPremiumPipeline(config: PremiumConfig): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  M1 Email Find — PREMIUM Pipeline                ║');
  console.log('║  3-Persona STORM + Influence Psychology + Anti-Tell ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const importResult = importProspects(config.csvPath);
  printImportSummary(importResult);

  const allProspects = importResult.prospects;
  const prospects = config.singleProspect
    ? allProspects.filter(p => p.id === config.singleProspect)
    : config.tiers.flatMap(t => importResult.byTier[t] || []);

  console.log(`\n▶ Processing ${prospects.length} prospects (tiers: ${config.tiers.join(', ')})`);
  console.log(`  Model: ${config.model} | Batch: ${config.batchSize} | Dry run: ${config.dryRun}`);
  console.log(`  Output: ${config.outputDir}\n`);

  const results: ProspectOutput[] = [];

  for (let i = 0; i < prospects.length; i += config.batchSize) {
    const batch = prospects.slice(i, i + config.batchSize);
    const batchNum = Math.floor(i / config.batchSize) + 1;
    const totalBatches = Math.ceil(prospects.length / config.batchSize);

    console.log(`═══ Batch ${batchNum}/${totalBatches} (${batch.length} prospects) ═══`);

    for (const prospect of batch) {
      const result = await processProspect(prospect, allProspects, config);
      if (result) results.push(result);
    }
  }

  // Write execution manifest
  const manifest = {
    pipeline: 'premium_3persona',
    runDate: new Date().toISOString(),
    config,
    prospectCount: prospects.length,
    resultsCount: results.length,
    tiers: config.tiers,
    promptsGenerated: results.length * 9,  // 3 personas + 1 cross-exam + 3 patterns + 3 composers - 1
    nextStep: config.dryRun
      ? 'Run without --dry-run to generate prompts, then execute with agent swarm'
      : 'Execute prompts via agent swarm: npx tsx premium-pipeline.ts execute',
  };

  const manifestPath = resolve(config.outputDir, 'premium-manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Pipeline Generation Complete                     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Prospects processed: ${results.length}`);
  console.log(`  Prompts generated: ${results.length * 9} files`);
  console.log(`  Dossier templates: ${results.length}`);
  console.log(`  AE prep sheets: ${results.length}`);
  console.log(`\n  Output directory: ${config.outputDir}`);
  console.log(`\n  Next step: Execute research prompts with agent swarm`);
  console.log(`  Command: npx tsx premium-pipeline.ts execute --tiers=${config.tiers.join(',')}`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'run';

const config: PremiumConfig = {
  csvPath: args.find(a => a.endsWith('.csv')) || resolve(BASE_DIR, 'fiber-connect-2026-booth-scans.csv'),
  tiers: (args.find(a => a.startsWith('--tiers='))?.split('=')[1] || 'A,B').split(','),
  model: args.find(a => a.startsWith('--model='))?.split('=')[1] || 'sonnet',
  batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '5'),
  dryRun: command === 'dry-run' || args.includes('--dry-run'),
  singleProspect: args.find(a => a.startsWith('--prospect='))?.split('=')[1],
  outputDir: resolve(BASE_DIR, 'premium'),
};

switch (command) {
  case 'run':
  case 'dry-run':
    runPremiumPipeline(config);
    break;

  case 'execute':
    console.log('Execute mode: runs generated prompts through agent swarm.');
    console.log('This spawns researcher agents for each prospect\'s prompts.');
    console.log('Implementation: use Agent tool or direct API calls.');
    console.log('\nFor now, run prompts manually:');
    console.log(`  ls ${resolve(config.outputDir, 'prompts')}/*.md`);
    break;

  default:
    console.log(`
M1 Email Find — Premium Pipeline

Usage:
  npx tsx premium-pipeline.ts run [options]      Generate all prompts + schemas
  npx tsx premium-pipeline.ts dry-run [options]  Preview without generating
  npx tsx premium-pipeline.ts execute [options]  Execute generated prompts via agents

Options:
  --tiers=A,B,C,D      Tiers to process (default: A,B)
  --prospect=fc2026-061 Process single prospect by ID
  --model=sonnet        LLM model (default: sonnet)
  --batch=5             Parallel batch size (default: 5)
  --dry-run             Preview only
`);
}
