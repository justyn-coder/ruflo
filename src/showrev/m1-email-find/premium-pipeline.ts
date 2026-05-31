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
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
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

const STATE_TO_AE: Record<string, string> = {
  // East (Mike Rutski)
  CT: 'east', MA: 'east', RI: 'east', NH: 'east', VT: 'east', ME: 'east',
  NY: 'east', NJ: 'east', PA: 'east', DE: 'east', MD: 'east', DC: 'east',
  VA: 'east', WV: 'east', NC: 'east', SC: 'east', GA: 'east', FL: 'east',
  AL: 'east', MS: 'east', TN: 'east', KY: 'east', OH: 'east', IN: 'east', MI: 'east',
  // Central (Nathan Dunn)
  TX: 'central', OK: 'central', KS: 'central', NE: 'central', SD: 'central', ND: 'central',
  MN: 'central', IA: 'central', MO: 'central', AR: 'central', LA: 'central',
  WI: 'central', IL: 'central',
  // West (Lucas Spencer)
  WA: 'west', OR: 'west', CA: 'west', NV: 'west', AZ: 'west', NM: 'west',
  CO: 'west', UT: 'west', WY: 'west', MT: 'west', ID: 'west', HI: 'west', AK: 'west',
};

function resolveAE(prospect: Prospect): { name: string; email: string } {
  // 1. Check assigned_ae from sr_prospects (if loaded from Supabase)
  const assigned = (prospect as any).assigned_ae || '';
  if (assigned.toLowerCase().includes('mike')) return AE_TERRITORY.east;
  if (assigned.toLowerCase().includes('nathan')) return AE_TERRITORY.central;
  if (assigned.toLowerCase().includes('lucas')) return AE_TERRITORY.west;

  // 2. Fall back to state-based mapping
  const stateKey = prospect.state?.toUpperCase().trim();
  const territory = STATE_TO_AE[stateKey];
  if (territory) return AE_TERRITORY[territory];

  // 3. Default to Lucas (West/spread) per operator rule
  return AE_TERRITORY.west;
}

function executePrompt(prompt: string, model: string = 'sonnet', timeoutMs: number = 300000): string {
  const tmpFile = resolve('/tmp', `showrev-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`);
  writeFileSync(tmpFile, prompt);
  try {
    const result = execSync(
      `cat '${tmpFile}' | claude -p --model ${model}`,
      { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 1024 * 1024 * 10 }
    );
    return result.trim();
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function parseJSON(text: string): any {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(text);
}

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

    console.log(`  │  ⏳ ${persona.role} researching...`);
    const result = executePrompt(prompt, config.model);
    personaResults[persona.role] = result;

    // Save research output for audit trail
    const outputPath = resolve(config.outputDir, 'research', `${prospect.id}-${persona.role.toLowerCase().replace(/\s/g, '-')}.json`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, result);
    console.log(`  │  ✓ ${persona.role} complete`);
  }

  // PHASE 2: Cross-examination questions
  console.log(`  │  Phase 2: Cross-examination questions generated`);
  const crossExamQuestions = generateCrossExamQuestions(
    personaResults['Industry Analyst'] || '',
    personaResults['AE Proxy'] || '',
    personaResults['Technical Evaluator'] || ''
  );

  const crossExamPath = resolve(config.outputDir, 'prompts', `${prospect.id}-cross-exam.md`);
  mkdirSync(dirname(crossExamPath), { recursive: true });
  writeFileSync(crossExamPath, JSON.stringify(crossExamQuestions, null, 2));

  // PHASE 3: Influence pattern selection for each touch
  console.log(`  │  Phase 3: Influence pattern selection...`);
  const researchSummaryForPatterns = Object.values(personaResults).join('\n\n---\n\n');
  const enrichedDossierSummary = `Company: ${prospect.company}. Title: ${prospect.title}.\n\nResearch findings:\n${researchSummaryForPatterns}\n\n${prospect.aeNotes ? `Booth notes: "${prospect.aeNotes}"` : 'No booth notes.'}${relatedNote}`;

  const patternSelections: PatternSelection[] = [];
  for (const touchNum of [1, 2, 3] as const) {
    const prompt = buildPatternSelectorPrompt(enrichedDossierSummary, prospect.aeNotes, prospect.title, touchNum);
    console.log(`  │  ⏳ T${touchNum} pattern selection...`);
    const result = executePrompt(prompt, config.model, 300000);

    try {
      const parsed = parseJSON(result);
      patternSelections.push(parsed as PatternSelection);
      console.log(`  │  ✓ T${touchNum} → ${parsed.pattern}`);
    } catch (e) {
      console.log(`  │  ⚠ T${touchNum} pattern parse failed, using fallback`);
      patternSelections.push({
        pattern: touchNum === 1 ? 'challenger_insight' : touchNum === 2 ? 'curiosity_gap' : 'challenger_insight',
        rationale: 'Fallback due to parse error',
        emotionalFrame: 'curiosity',
        challengerInsight: '[Parse error - manual review needed]',
        psStrategy: 'Microsite link',
        ctaType: touchNum === 1 ? 'interest_based' : touchNum === 2 ? 'soft_time' : 'binary_close',
      });
    }
  }

  // PHASE 4: Email composition (using actual pattern selections)
  console.log(`  │  Phase 4: Email composition...`);

  const emails: Array<{ touchNumber: number; pattern: PatternSelection; subject: string; previewText: string; body: string; ps: string; wordCount: number }> = [];

  const ae = resolveAE(prospect);

  // Generate microsite slug
  const micrositeSlug = prospect.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const researchSummary = Object.values(personaResults).join('\n\n');

  for (let i = 0; i < 3; i++) {
    const touchNum = (i + 1) as 1 | 2 | 3;
    const pattern = patternSelections[i];

    const composerPrompt = buildComposerPrompt(
      pattern,
      researchSummary,
      { firstName: prospect.firstName, lastName: prospect.lastName, title: prospect.title, company: prospect.company },
      prospect.aeNotes,
      touchNum,
      i > 0 ? emails[i - 1]?.subject : undefined,
      ae.name,
      ae.email,
      micrositeSlug
    );

    console.log(`  │  ⏳ T${touchNum} composing (${pattern.pattern})...`);
    const result = executePrompt(composerPrompt, config.model, 300000);

    try {
      const parsed = parseJSON(result);
      emails.push({
        touchNumber: touchNum,
        pattern,
        subject: parsed.subject || '',
        previewText: parsed.previewText || '',
        body: parsed.body || '',
        ps: parsed.ps || '',
        wordCount: parsed.wordCount || (parsed.body || '').split(/\s+/).length,
      });
      console.log(`  │  ✓ T${touchNum} composed (${(parsed.body || '').split(/\s+/).length} words)`);
    } catch (e) {
      console.log(`  │  ⚠ T${touchNum} compose parse failed`);
      emails.push({
        touchNumber: touchNum,
        pattern,
        subject: '[Parse error]',
        previewText: '',
        body: '[Parse error - manual review needed]',
        ps: '',
        wordCount: 0,
      });
    }
  }

  // PHASE 5: Write output
  console.log(`  │  Phase 5: Writing output...`);

  const output: ProspectOutput = {
    prospect,
    personaFindings: {
      analyst: personaResults['Industry Analyst'] || '',
      aeProxy: personaResults['AE Proxy'] || '',
      techEval: personaResults['Technical Evaluator'] || '',
    },
    crossExamInsights: JSON.stringify(crossExamQuestions),
    dossier: {} as any,
    emails,
    aePrep: '',
  };

  // Write JSON output
  const jsonPath = resolve(config.outputDir, 'output', `${prospect.id}-output.json`);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));

  // Write human-readable markdown
  const mdPath = resolve(config.outputDir, 'output', `${prospect.id}-output.md`);
  let md = `# ${prospect.firstName} ${prospect.lastName} — ${prospect.company}\n\n`;
  md += `**AE:** ${ae.name} (${ae.email})\n`;
  md += `**Microsite:** https://fiber.inorsa.com/brief/${micrositeSlug}\n\n`;
  md += `## Research Summary\n\n${researchSummary}\n\n`;
  md += `---\n\n`;

  for (const email of emails) {
    md += `## T${email.touchNumber} — ${email.pattern.pattern}\n\n`;
    md += `**Subject:** ${email.subject}\n\n`;
    md += `${email.body}\n\n`;
    if (email.ps) md += `${email.ps}\n\n`;
    md += `**Word count:** ${email.wordCount}\n\n---\n\n`;
  }

  writeFileSync(mdPath, md);
  console.log(`  │  ✓ Output written to ${jsonPath}`);

  console.log(`  └─ ✅ Complete: ${emails.length} touches composed\n`);
  return output;
}

async function runPremiumPipeline(config: PremiumConfig): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  M1 Email Find — PREMIUM Pipeline                ║');
  console.log('║  3-Persona STORM + Influence Psychology + Anti-Tell ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const importResult = importProspects(config.csvPath);
  printImportSummary(importResult);

  const allProspects = importResult.prospects;
  const emailFilter = process.argv.find(a => a.startsWith('--email='))?.split('=')[1];
  const prospects = config.singleProspect
    ? allProspects.filter(p => p.id === config.singleProspect)
    : emailFilter
      ? allProspects.filter(p => p.email === emailFilter)
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
  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
  const manifest = {
    pipeline: 'premium_3persona',
    runDate: new Date().toISOString(),
    config,
    prospectCount: prospects.length,
    resultsCount: results.length,
    tiers: config.tiers,
    emailsComposed: totalEmails,
    status: config.dryRun ? 'dry_run' : 'executed',
  };

  const manifestPath = resolve(config.outputDir, 'premium-manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Pipeline Execution Complete                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Prospects processed: ${results.length}`);
  console.log(`  Emails composed: ${totalEmails}`);
  console.log(`\n  Output directory: ${config.outputDir}`);
  console.log(`  JSON: ${config.outputDir}/output/<prospect-id>-output.json`);
  console.log(`  Markdown: ${config.outputDir}/output/<prospect-id>-output.md`);
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

  default:
    console.log(`
M1 Email Find — Premium Pipeline

Usage:
  npx tsx premium-pipeline.ts run [options]      Execute full pipeline (research + compose)
  npx tsx premium-pipeline.ts dry-run [options]  Preview without executing

Options:
  --tiers=A,B,C,D      Tiers to process (default: A,B)
  --prospect=fc2026-001 Process single prospect by ID
  --model=sonnet        LLM model (default: sonnet)
  --batch=5             Batch size (default: 5)
  --dry-run             Preview only
`);
}
