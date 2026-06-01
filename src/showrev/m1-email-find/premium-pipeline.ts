#!/usr/bin/env npx tsx

import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('.env', import.meta.url).pathname });

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
import { callLLM, callLLMWithBrainCache, setBrainCacheContent, type LLMCallOptions } from './llm-client.js';
import { importProspects, printImportSummary, type Prospect, type ICPStatus } from './importer.js';
import { RESEARCH_PERSONAS, buildMultiPersonaPrompt, generateCrossExamQuestions } from './personas.js';
import { INFLUENCE_TOOLKIT, buildPatternSelectorPrompt, buildComposerPrompt, type PatternSelection } from './influence.js';
import { runMechanicalChecks } from './judge.js';
import { buildDossierRow, validateBeforeWrite, dryRunPreview, writeDossierToSupabase, type SupabaseWritePayload } from './supabase-adapter.js';
import { ingestResearchIntoBrain, loadBrainDigest } from './brain-ingest.js';
import { structureIntelReport } from './intel-structurer.js';
import { composeMicrositeContent, type MicrositeRow } from './microsite-composer.js';

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

const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

const COMPOSITION_HARD_CONSTRAINTS = `STRICT RULES — violations cause rejection:
1. Email body MUST be under 80 words. Count every word before outputting. If over 80, cut sentences until under. This is non-negotiable.
2. NEVER use em-dashes (—) or en-dashes (–) anywhere. Use commas, periods, or semicolons instead.
3. Salutation is "[FirstName]," on its own line. Next line starts the body immediately, no blank line.
4. NEVER reference India, offshore, outsourced, or workforce geography.
5. Sign off ONCE only: "[AE Name] | Inorsa | [email]". Never duplicate the signature.
6. Subject line: 8 words maximum.
Count the words in your body text RIGHT NOW before outputting. If the count exceeds 80, revise.`;

async function executePrompt(
  prompt: string,
  model: string = 'sonnet',
  timeoutMs: number = 300000,
  label: string = 'prompt'
): Promise<string> {
  const resolvedModel = MODEL_MAP[model] || model;
  const isComposition = label.includes('compose');
  return callLLMWithBrainCache(prompt, {
    model: resolvedModel,
    timeoutMs,
    label,
    hardConstraints: isComposition ? COMPOSITION_HARD_CONSTRAINTS : undefined,
  });
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
  runId: string;
}

function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${date}-${rand}`;
}

interface Checkpoint {
  runId: string;
  completedProspectIds: string[];
  startedAt: string;
  lastUpdated: string;
  config: Omit<PremiumConfig, 'outputDir'>;
}

function getCheckpointPath(outputDir: string, runId: string): string {
  return resolve(outputDir, `${runId}-checkpoint.json`);
}

function loadCheckpoint(outputDir: string, runId: string): Checkpoint | null {
  const path = getCheckpointPath(outputDir, runId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(outputDir: string, checkpoint: Checkpoint): void {
  const path = getCheckpointPath(outputDir, checkpoint.runId);
  mkdirSync(dirname(path), { recursive: true });
  checkpoint.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

export interface EmailOutput {
  touchNumber: number;
  pattern: PatternSelection;
  subject: string;
  previewText: string;
  body: string;
  ps: string;
  wordCount: number;
}

export interface ProspectOutput {
  prospect: Prospect;
  runId: string;
  personaFindings: {
    analyst: string;
    aeProxy: string;
    techEval: string;
  };
  crossExamInsights: string;
  ae: { name: string; email: string };
  micrositeSlug: string;
  emails: EmailOutput[];
  mechanicalCheckPassed: boolean;
  mechanicalCheckFailures: string[];
}

function buildProspectContext(p: Prospect): string {
  return `Company: ${p.company}
Contact: ${p.firstName} ${p.lastName}
Title: ${p.title}
Location: ${p.city}, ${p.state}
Email: ${p.email}
Phone: ${p.phone}
Lead type: ${p.leadType}
ICP: ${p.icpStatus} (${p.icpReason})
Batch tier: ${p.tier} (${p.grade})`;
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
  config: PremiumConfig,
  prospectIndex: number = 0
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

  // Load Brain context — semantic search (AgentDB) with JSONL digest fallback
  const brainDir = resolve(BASE_DIR, '../brain/fiber-telecom/inorsa/fiber/fiber-connect-2026');
  let brainContext = '';
  try {
    const { initBrainDB, buildSemanticDigest } = await import('./brain-agentdb.js');
    await initBrainDB();
    const query = `${prospect.company} ${prospect.title} fiber design permitting ${prospect.state}`;
    const semanticDigest = await buildSemanticDigest(query, 15);
    if (semanticDigest) {
      brainContext = `\n\n${semanticDigest}`;
      console.log(`  │  Brain: semantic search (${semanticDigest.split('\n').length} lines)`);
    }
  } catch {
    // Fallback to flat file digest
    const brainDigest = loadBrainDigest(brainDir);
    brainContext = brainDigest
      ? `\n\n## Prior research knowledge (from Brain)\n${brainDigest.slice(0, 2000)}`
      : '';
  }

  const cacheableContent = [
    `## What Inorsa does\n${INORSA_VP_SUMMARY}`,
    brainContext || '',
  ].filter(Boolean).join('\n\n');

  if (cacheableContent) {
    setBrainCacheContent(cacheableContent);
  }

  // PHASE 1: Multi-persona research (3 parallel agents)
  console.log(`  │  Phase 1: 3-persona research (parallel)...`);
  const personaResults: Record<string, string> = {};

  const researchPromises = RESEARCH_PERSONAS.map(persona => {
    const prompt = buildMultiPersonaPrompt(
      prospectContext + relatedNote + brainContext,
      persona,
      prospect.aeNotes,
      undefined
    );
    console.log(`  │  ⏳ ${persona.role} researching...`);
    return executePrompt(prompt, config.model, 300000, persona.role)
      .then(result => {
        personaResults[persona.role] = result;
        const outputPath = resolve(config.outputDir, 'research', `${prospect.id}-${persona.role.toLowerCase().replace(/\s/g, '-')}.json`);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, result);
        console.log(`  │  ✓ ${persona.role} complete`);
        return result;
      });
  });
  await Promise.all(researchPromises);

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

  // PHASE 2b: Brain Ingest (extract entities, update KB)
  console.log(`  │  Phase 2b: Brain ingest...`);
  const brainResult = await ingestResearchIntoBrain(personaResults, prospect.id, brainDir, prospectIndex, 10);
  console.log(`  │  ✓ Brain: +${brainResult.added} new, ${brainResult.updated} updated (${brainResult.total} total)${brainResult.agentDBStored ? ` [${brainResult.agentDBStored} → AgentDB]` : ''}${brainResult.digestRefreshed ? ' [digest refreshed]' : ''}`);

  // PHASE 3: Influence pattern selection for each touch
  console.log(`  │  Phase 3: Influence pattern selection...`);
  const researchSummaryForPatterns = Object.values(personaResults).join('\n\n---\n\n');
  const enrichedDossierSummary = `Company: ${prospect.company}. Title: ${prospect.title}.\n\nResearch findings:\n${researchSummaryForPatterns}\n\n${prospect.aeNotes ? `Booth notes: "${prospect.aeNotes}"` : 'No booth notes.'}${relatedNote}`;

  const patternSelections: PatternSelection[] = [];
  for (const touchNum of [1, 2, 3] as const) {
    const prompt = buildPatternSelectorPrompt(enrichedDossierSummary, prospect.aeNotes, prospect.title, touchNum);
    console.log(`  │  ⏳ T${touchNum} pattern selection...`);
    const result = await executePrompt(prompt, config.model, 300000, `T${touchNum}-pattern`);

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

  const emails: EmailOutput[] = [];

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
    const result = await executePrompt(composerPrompt, config.model, 300000, `T${touchNum}-compose`);

    try {
      const parsed = parseJSON(result);
      const cleanBody = (parsed.body || '').replace(/—/g, ',').replace(/–/g, ',');
      const cleanSubject = (parsed.subject || '').replace(/—/g, ',').replace(/–/g, ',');
      const cleanPs = (parsed.ps || '').replace(/—/g, ',').replace(/–/g, ',');
      emails.push({
        touchNumber: touchNum,
        pattern,
        subject: cleanSubject,
        previewText: parsed.previewText || '',
        body: cleanBody,
        ps: cleanPs,
        wordCount: cleanBody.split(/\s+/).length,
      });
      console.log(`  │  ✓ T${touchNum} composed (${cleanBody.split(/\s+/).length} words)`);
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

  // PHASE 5: Intel Report Structuring
  console.log(`  │  Phase 5: Intel structuring...`);
  let structuredDossier: any = null;
  let intelWarnings: string[] = [];
  try {
    const resolvedModel = MODEL_MAP[config.model] || config.model;
    const intelResult = await structureIntelReport(
      personaResults,
      JSON.stringify(crossExamQuestions),
      prospect,
      emails,
      patternSelections,
      ae.name,
      resolvedModel,
    );
    structuredDossier = intelResult.dossier;
    intelWarnings = intelResult.warnings;
    console.log(`  │  ✓ Intel structured (${intelWarnings.length} warnings)`);
    for (const w of intelWarnings) console.log(`  │    ⚠ ${w}`);
  } catch (err: any) {
    console.log(`  │  ⚠ Intel structuring failed: ${err.message?.slice(0, 80)}`);
  }

  // PHASE 6: ABM Microsite Composition
  console.log(`  │  Phase 6: Microsite composition...`);
  const challengerInsight = patternSelections[0]?.challengerInsight || '';
  const personaBucket = structuredDossier?.contact?.showrev_persona_classification || '';
  const micrositeRow = composeMicrositeContent(
    prospect, config.runId, micrositeSlug, ae,
    challengerInsight, researchSummary, personaBucket, brainDir
  );
  console.log(`  │  ✓ Microsite: "${micrositeRow.headline.slice(0, 50)}..."`);

  // PHASE 7: Mechanical quality checks
  console.log(`  │  Phase 7: Mechanical checks...`);
  const t1 = emails.find(e => e.touchNumber === 1);
  const mechanicalCheck = t1
    ? runMechanicalChecks(t1.body, t1.subject, t1.ps, ae.name, ae.email, prospect.firstName, micrositeSlug)
    : { passed: false, failures: ['No T1 email produced'], warnings: [] };

  if (mechanicalCheck.passed) {
    console.log(`  │  ✓ Mechanical checks passed${mechanicalCheck.warnings.length > 0 ? ` (${mechanicalCheck.warnings.length} warnings)` : ''}`);
  } else {
    console.log(`  │  ⚠ Mechanical failures: ${mechanicalCheck.failures.join(', ')}`);
  }
  for (const w of mechanicalCheck.warnings) console.log(`  │    ⚠ ${w}`);

  // PHASE 8: Write output
  console.log(`  │  Phase 8: Writing output...`);

  const output: ProspectOutput = {
    prospect,
    runId: config.runId,
    personaFindings: {
      analyst: personaResults['Industry Analyst'] || '',
      aeProxy: personaResults['AE Proxy'] || '',
      techEval: personaResults['Technical Evaluator'] || '',
    },
    crossExamInsights: JSON.stringify(crossExamQuestions),
    ae,
    micrositeSlug,
    emails,
    mechanicalCheckPassed: mechanicalCheck.passed,
    mechanicalCheckFailures: mechanicalCheck.failures,
  };

  // Write JSON output
  const jsonPath = resolve(config.outputDir, 'output', `${prospect.id}-output.json`);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));

  // Write human-readable markdown
  const mdPath = resolve(config.outputDir, 'output', `${prospect.id}-output.md`);
  let md = `# ${prospect.firstName} ${prospect.lastName} — ${prospect.company}\n\n`;
  md += `**Run:** ${config.runId}\n`;
  md += `**AE:** ${ae.name} (${ae.email})\n`;
  md += `**ICP:** ${prospect.icpStatus} — ${prospect.icpReason}\n`;
  md += `**Mechanical:** ${mechanicalCheck.passed ? 'PASS' : 'FAIL — ' + mechanicalCheck.failures.join(', ')}\n`;
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

  if (structuredDossier) {
    md += `## Intel Report\n\n`;
    const si = structuredDossier.salesIntel || {};
    md += `**Signal:** ${si.showrev_signal_strength || 'N/A'} — ${si.showrev_fit_rationale || ''}\n`;
    md += `**Next action:** ${si.showrev_next_best_action || ''}\n`;
    md += `**Buying timeline:** ${si.showrev_buying_timeline || ''}\n`;
    md += `**Risk:** ${si.showrev_risk_factors || ''}\n\n`;
    const ct = structuredDossier.contact || {};
    md += `**Talking points:**\n${ct.showrev_talking_points || ''}\n\n---\n\n`;
  }

  md += `## Microsite Content\n\n`;
  md += `**Headline:** ${micrositeRow.headline}\n`;
  md += `**Insight:** ${micrositeRow.insight_text}\n`;
  md += `**Case study:** ${micrositeRow.case_study_text}\n\n---\n\n`;

  writeFileSync(mdPath, md);
  console.log(`  │  ✓ Files written to ${jsonPath}`);

  // PHASE 9: Supabase write (or dry-run preview)
  const dossierRow = buildDossierRow(prospect, config.runId, researchSummary, emails, ae, micrositeSlug, mechanicalCheck, structuredDossier, micrositeRow);
  if (structuredDossier?.contact?.showrev_persona_classification) {
    dossierRow.persona_bucket = structuredDossier.contact.showrev_persona_classification;
  }
  const payload: SupabaseWritePayload = { dossier: dossierRow, prospect, emails, mechanicalCheck };

  if (config.dryRun) {
    dryRunPreview(payload);
  } else {
    const validation = validateBeforeWrite(payload);
    if (validation.valid) {
      console.log(`  │  Phase 9: Supabase write...`);
      const written = await writeDossierToSupabase(payload);
      console.log(`  │  ${written ? '✓ Written to Supabase' : '✗ Supabase write failed (JSON saved as fallback)'}`);
    } else {
      console.log(`  │  ⚠ Skipping Supabase (validation failed): ${validation.errors.join(', ')}`);
    }
  }

  console.log(`  └─ ✅ Complete: ${emails.length} touches composed\n`);
  return output;
}

async function runPremiumPipeline(config: PremiumConfig): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  M1 Email Find — PREMIUM Pipeline                ║');
  console.log('║  3-Persona STORM + Influence Psychology + Anti-Tell ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Run ID: ${config.runId}`);

  const importResult = importProspects(config.csvPath);
  printImportSummary(importResult);

  const allProspects = importResult.prospects;
  const emailFilter = process.argv.find(a => a.startsWith('--email='))?.split('=')[1];
  const icpFilter = process.argv.find(a => a.startsWith('--icp='))?.split('=')[1];

  let prospects: Prospect[];
  if (config.singleProspect) {
    prospects = allProspects.filter(p => p.id === config.singleProspect);
  } else if (emailFilter) {
    prospects = allProspects.filter(p => p.email === emailFilter);
  } else if (icpFilter) {
    const statuses = icpFilter.split(',') as ICPStatus[];
    prospects = allProspects.filter(p => statuses.includes(p.icpStatus));
  } else {
    prospects = config.tiers.flatMap(t => importResult.byTier[t] || []);
  }

  // Load checkpoint for resume
  const checkpoint = loadCheckpoint(config.outputDir, config.runId);
  const completedIds = new Set(checkpoint?.completedProspectIds || []);
  const remaining = prospects.filter(p => !completedIds.has(p.id));

  if (completedIds.size > 0) {
    console.log(`\n  Resuming: ${completedIds.size} already done, ${remaining.length} remaining`);
  }

  console.log(`\n▶ Processing ${remaining.length} prospects (tiers: ${config.tiers.join(', ')})`);
  console.log(`  Model: ${config.model} | Batch: ${config.batchSize} | Dry run: ${config.dryRun}`);
  console.log(`  Output: ${config.outputDir}\n`);

  const currentCheckpoint: Checkpoint = checkpoint || {
    runId: config.runId,
    completedProspectIds: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    config: { ...config, outputDir: undefined } as any,
  };

  const results: ProspectOutput[] = [];

  for (let i = 0; i < remaining.length; i += config.batchSize) {
    const batch = remaining.slice(i, i + config.batchSize);
    const batchNum = Math.floor(i / config.batchSize) + 1;
    const totalBatches = Math.ceil(remaining.length / config.batchSize);

    console.log(`═══ Batch ${batchNum}/${totalBatches} (${batch.length} prospects) ═══`);

    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const prospect = batch[batchIdx];
      const globalIdx = i + batchIdx;
      try {
        const result = await processProspect(prospect, allProspects, config, globalIdx);
        if (result) results.push(result);
        currentCheckpoint.completedProspectIds.push(prospect.id);
        saveCheckpoint(config.outputDir, currentCheckpoint);
      } catch (err: any) {
        console.error(`  ✗ ${prospect.firstName} ${prospect.lastName} FAILED: ${err.message}`);
        console.error(`    Checkpoint saved. Resume with: --run-id=${config.runId}`);
        saveCheckpoint(config.outputDir, currentCheckpoint);
      }
    }
  }

  // Write execution manifest
  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
  const manifest = {
    pipeline: 'premium_3persona',
    runId: config.runId,
    runDate: new Date().toISOString(),
    config,
    prospectCount: prospects.length,
    resultsCount: results.length + completedIds.size,
    skippedFromCheckpoint: completedIds.size,
    tiers: config.tiers,
    emailsComposed: totalEmails,
    status: config.dryRun ? 'dry_run' : 'executed',
  };

  const manifestPath = resolve(config.outputDir, `${config.runId}-manifest.json`);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Pipeline Execution Complete                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Run ID: ${config.runId}`);
  console.log(`  Prospects processed: ${results.length} (${completedIds.size} from checkpoint)`);
  console.log(`  Emails composed: ${totalEmails}`);
  console.log(`\n  Output directory: ${config.outputDir}`);
  console.log(`  Manifest: ${manifestPath}`);
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
  runId: args.find(a => a.startsWith('--run-id='))?.split('=')[1] || generateRunId(),
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
  npx tsx premium-pipeline.ts run [options]      Execute full pipeline
  npx tsx premium-pipeline.ts dry-run [options]  Preview without executing

Options:
  --tiers=A,B,C,D        Batch tiers to process (default: A,B)
  --icp=pass,hold        Filter by ICP status (pass/hold/reject)
  --prospect=fc2026-001  Process single prospect by ID
  --email=user@co.com    Process single prospect by email
  --model=sonnet         LLM model (default: sonnet)
  --batch=5              Batch size (default: 5)
  --run-id=run-xxx       Resume a previous run from checkpoint
  --dry-run              Preview only
`);
}
