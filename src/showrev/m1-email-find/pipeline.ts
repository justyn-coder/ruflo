#!/usr/bin/env npx tsx

// DEPRECATED: Use premium-pipeline.ts instead. This v1 pipeline uses single-agent
// research and template-style composition. The premium pipeline uses 3-persona STORM
// research, influence pattern selection, and anti-AI-tell composition (v3 format).

import { resolve, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { importProspects, printImportSummary, type ImportResult, type Prospect } from './importer.js';
import { researchBatch, type Dossier } from './researcher.js';
import { composeBatch, type ComposedEmail } from './composer.js';
import { judgeBatch, type JudgeReport } from './judge.js';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev');

interface PipelineState {
  stage: 'import' | 'research' | 'compose' | 'judge' | 'review' | 'complete';
  importResult?: ImportResult;
  dossiers: Dossier[];
  emails: ComposedEmail[];
  judgeReports: JudgeReport[];
  startedAt: string;
  lastUpdated: string;
  config: PipelineConfig;
}

interface PipelineConfig {
  csvPath: string;
  tiers: string[];
  model: string;
  maxBudgetPerProspect: number;
  dryRun: boolean;
  batchSize: number;
}

function loadState(): PipelineState | null {
  const statePath = resolve(BASE_DIR, 'pipeline-state.json');
  if (existsSync(statePath)) {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  }
  return null;
}

function saveState(state: PipelineState): void {
  mkdirSync(BASE_DIR, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  writeFileSync(resolve(BASE_DIR, 'pipeline-state.json'), JSON.stringify(state, null, 2));
}

function loadExistingDossiers(): Dossier[] {
  const dossierDir = resolve(BASE_DIR, 'dossiers');
  if (!existsSync(dossierDir)) return [];
  return readdirSync(dossierDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(resolve(dossierDir, f), 'utf-8')));
}

function loadExistingEmails(): ComposedEmail[] {
  const emailDir = resolve(BASE_DIR, 'emails');
  if (!existsSync(emailDir)) return [];
  return readdirSync(emailDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(resolve(emailDir, f), 'utf-8')));
}

function loadExistingReports(): JudgeReport[] {
  const reportDir = resolve(BASE_DIR, 'judge-reports');
  if (!existsSync(reportDir)) return [];
  return readdirSync(reportDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(resolve(reportDir, f), 'utf-8')));
}

function generateReviewSummary(
  importResult: ImportResult,
  dossiers: Dossier[],
  emails: ComposedEmail[],
  reports: JudgeReport[]
): string {
  const lines: string[] = [];
  lines.push('# M1 Email Find — Pipeline Review Summary');
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  lines.push('## Import');
  lines.push(`- Total rows: ${importResult.total}`);
  lines.push(`- Unique contacts: ${importResult.unique}`);
  lines.push(`- Duplicates removed: ${importResult.duplicatesRemoved}`);
  lines.push(`- Emails corrected: ${importResult.emailsCorrected}\n`);

  lines.push('## Research');
  lines.push(`- Dossiers generated: ${dossiers.length}`);
  const tierDist: Record<string, number> = {};
  for (const d of dossiers) {
    tierDist[d.revisedTier] = (tierDist[d.revisedTier] || 0) + 1;
  }
  lines.push(`- Revised tier distribution: ${JSON.stringify(tierDist)}`);
  const highConf = dossiers.filter(d => d.jtbd.confidenceLevel === 'high').length;
  const medConf = dossiers.filter(d => d.jtbd.confidenceLevel === 'medium').length;
  const lowConf = dossiers.filter(d => d.jtbd.confidenceLevel === 'low').length;
  lines.push(`- Confidence: ${highConf} high / ${medConf} medium / ${lowConf} low\n`);

  lines.push('## Composition');
  lines.push(`- Emails composed: ${emails.length}`);
  lines.push(`- Total touches: ${emails.reduce((s, e) => s + e.touches.length, 0)}\n`);

  lines.push('## Judge Results');
  const passed = reports.filter(r => r.allPassed).length;
  const held = reports.filter(r => !r.allPassed && r.verdicts.some(v => v.recommendation !== 'reject')).length;
  const rejected = reports.filter(r => r.verdicts.some(v => v.recommendation === 'reject')).length;
  lines.push(`- Send-ready: ${passed}`);
  lines.push(`- Hold (needs fixes): ${held}`);
  lines.push(`- Reject (needs rewrite): ${rejected}\n`);

  lines.push('## Prospect Detail\n');
  lines.push('| Prospect | Company | Original Tier | Revised Tier | JTBD | Confidence | T1 | T2 | T3 |');
  lines.push('|----------|---------|---------------|--------------|------|------------|----|----|-----|');

  for (const dossier of dossiers) {
    const email = emails.find(e => e.prospectId === dossier.prospectId);
    const report = reports.find(r => r.prospectId === dossier.prospectId);

    const touchResults = [1, 2, 3].map(t => {
      const verdict = report?.verdicts.find(v => v.touchNumber === t);
      if (!verdict) return '-';
      return `${verdict.recommendation === 'send' ? '✓' : verdict.recommendation === 'hold' ? '⚠' : '✗'}${verdict.overallScore}`;
    });

    lines.push(`| ${dossier.prospect.firstName} ${dossier.prospect.lastName} | ${dossier.company.name || dossier.prospect.company} | ${dossier.prospect.tier} | ${dossier.revisedTier} | ${dossier.jtbd.personaBucket || '-'} | ${dossier.jtbd.confidenceLevel || '-'} | ${touchResults.join(' | ')} |`);
  }

  lines.push('\n## Send-Ready Emails\n');
  for (const report of reports.filter(r => r.allPassed)) {
    const email = emails.find(e => e.prospectId === report.prospectId);
    if (!email) continue;

    lines.push(`### ${email.prospectName} @ ${email.company}\n`);
    for (const touch of email.touches) {
      lines.push(`**T${touch.touchNumber}** (${touch.sendDelay})`);
      lines.push(`Subject: ${touch.subject}`);
      lines.push(`\n${touch.body}\n`);
    }
    lines.push('---\n');
  }

  lines.push('\n## Hold/Reject Emails (need operator review)\n');
  for (const report of reports.filter(r => !r.allPassed)) {
    const email = emails.find(e => e.prospectId === report.prospectId);
    if (!email) continue;

    lines.push(`### ${email.prospectName} @ ${email.company}\n`);
    for (const verdict of report.verdicts.filter(v => v.recommendation !== 'send')) {
      const touch = email.touches.find(t => t.touchNumber === verdict.touchNumber);
      if (!touch) continue;

      lines.push(`**T${touch.touchNumber}** — ${verdict.recommendation.toUpperCase()} (${verdict.overallScore}/10)`);
      lines.push(`Subject: ${touch.subject}`);
      lines.push(`\n${touch.body}\n`);
      lines.push(`Must fix: ${verdict.mustFix.join('; ') || 'none'}`);
      lines.push(`Scores: ${verdict.scores.map(s => `${s.dimension}:${s.score}`).join(', ')}\n`);
    }
    lines.push('---\n');
  }

  return lines.join('\n');
}

async function runPipeline(config: PipelineConfig): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  M1 Email Find — Pipeline Runner     ║');
  console.log('╚══════════════════════════════════════╝\n');

  const state: PipelineState = {
    stage: 'import',
    dossiers: [],
    emails: [],
    judgeReports: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    config,
  };

  // Stage 1: Import
  console.log('▶ Stage 1: Import & Clean');
  const importResult = importProspects(config.csvPath);
  printImportSummary(importResult);
  state.importResult = importResult;
  state.stage = 'research';
  saveState(state);

  const prospects = config.tiers.flatMap(t => importResult.byTier[t] || []);
  console.log(`\nProspects to process: ${prospects.length} (tiers: ${config.tiers.join(', ')})`);

  // Stage 2: Research
  console.log('\n▶ Stage 2: Research');
  const dossiers = await researchBatch(prospects, {
    batchSize: config.batchSize,
    model: config.model,
    maxBudgetPerProspect: config.maxBudgetPerProspect,
    dryRun: config.dryRun,
    tiersToProcess: config.tiers,
    outputDir: resolve(BASE_DIR, 'dossiers'),
  });
  state.dossiers = dossiers;
  state.stage = 'compose';
  saveState(state);

  if (config.dryRun) {
    console.log('\n[DRY RUN] Pipeline complete. No emails composed or judged.');
    return;
  }

  // Stage 3: Compose
  console.log('\n▶ Stage 3: Compose Emails');
  const emails = await composeBatch(dossiers, {
    model: config.model,
    outputDir: resolve(BASE_DIR, 'emails'),
  });
  state.emails = emails;
  state.stage = 'judge';
  saveState(state);

  // Stage 4: Judge
  console.log('\n▶ Stage 4: Quality Judge');
  const reports = await judgeBatch(dossiers, emails, {
    model: config.model,
    outputDir: resolve(BASE_DIR, 'judge-reports'),
  });
  state.judgeReports = reports;
  state.stage = 'review';
  saveState(state);

  // Stage 5: Generate review summary
  console.log('\n▶ Stage 5: Generate Review Summary');
  const summary = generateReviewSummary(importResult, dossiers, emails, reports);
  const summaryPath = resolve(BASE_DIR, 'review-summary.md');
  writeFileSync(summaryPath, summary);
  console.log(`Review summary written to: ${summaryPath}`);

  state.stage = 'complete';
  saveState(state);

  const passed = reports.filter(r => r.allPassed).length;
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  Pipeline Complete                    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\nDossiers: ${dossiers.length} | Emails: ${emails.length} | Send-ready: ${passed}`);
  console.log(`\nNext: Review ${summaryPath}`);
  console.log('Then: Approve send-ready emails for HubSpot push');
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'run';

const config: PipelineConfig = {
  csvPath: args.find(a => a.endsWith('.csv')) || resolve(BASE_DIR, 'fiber-connect-2026-booth-scans.csv'),
  tiers: (args.find(a => a.startsWith('--tiers='))?.split('=')[1] || 'A,B').split(','),
  model: args.find(a => a.startsWith('--model='))?.split('=')[1] || 'sonnet',
  maxBudgetPerProspect: parseFloat(args.find(a => a.startsWith('--budget='))?.split('=')[1] || '0.50'),
  dryRun: args.includes('--dry-run'),
  batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '5'),
};

switch (command) {
  case 'run':
    runPipeline(config);
    break;

  case 'import':
    const result = importProspects(config.csvPath);
    printImportSummary(result);
    break;

  case 'status': {
    const state = loadState();
    if (state) {
      console.log(`Pipeline state: ${state.stage}`);
      console.log(`Started: ${state.startedAt}`);
      console.log(`Last updated: ${state.lastUpdated}`);
      console.log(`Dossiers: ${state.dossiers.length}`);
      console.log(`Emails: ${state.emails.length}`);
      console.log(`Judge reports: ${state.judgeReports.length}`);
    } else {
      console.log('No pipeline state found. Run: npx tsx pipeline.ts run');
    }
    break;
  }

  case 'resume': {
    const existingState = loadState();
    if (!existingState) {
      console.log('No state to resume. Starting fresh.');
      runPipeline(config);
    } else {
      console.log(`Resuming from stage: ${existingState.stage}`);
      const dossiers = existingState.stage === 'compose' ? loadExistingDossiers() : existingState.dossiers;
      const emails = existingState.stage === 'judge' ? loadExistingEmails() : existingState.emails;

      if (existingState.stage === 'compose' && dossiers.length > 0) {
        console.log(`Found ${dossiers.length} existing dossiers. Composing emails...`);
        composeBatch(dossiers, { model: config.model, outputDir: resolve(BASE_DIR, 'emails') })
          .then(composed => {
            existingState.emails = composed;
            existingState.stage = 'judge';
            saveState(existingState);
            return judgeBatch(dossiers, composed, { model: config.model, outputDir: resolve(BASE_DIR, 'judge-reports') });
          })
          .then(reports => {
            existingState.judgeReports = reports;
            existingState.stage = 'review';
            saveState(existingState);
            const summary = generateReviewSummary(existingState.importResult!, dossiers, existingState.emails, reports);
            writeFileSync(resolve(BASE_DIR, 'review-summary.md'), summary);
            console.log('Resume complete. Review summary updated.');
          });
      } else if (existingState.stage === 'judge' && emails.length > 0) {
        console.log(`Found ${emails.length} existing emails. Judging...`);
        judgeBatch(dossiers, emails, { model: config.model, outputDir: resolve(BASE_DIR, 'judge-reports') })
          .then(reports => {
            existingState.judgeReports = reports;
            existingState.stage = 'review';
            saveState(existingState);
            const summary = generateReviewSummary(existingState.importResult!, dossiers, emails, reports);
            writeFileSync(resolve(BASE_DIR, 'review-summary.md'), summary);
            console.log('Resume complete. Review summary updated.');
          });
      }
    }
    break;
  }

  case 'summary': {
    const dossiers = loadExistingDossiers();
    const emails = loadExistingEmails();
    const reports = loadExistingReports();
    const imp = importProspects(config.csvPath);
    const summary = generateReviewSummary(imp, dossiers, emails, reports);
    console.log(summary);
    break;
  }

  default:
    console.log(`
M1 Email Find Pipeline

Usage:
  npx tsx pipeline.ts run [options]       Run full pipeline
  npx tsx pipeline.ts import              Import and analyze CSV only
  npx tsx pipeline.ts status              Check pipeline state
  npx tsx pipeline.ts resume              Resume from last checkpoint
  npx tsx pipeline.ts summary             Generate review summary from existing data

Options:
  --tiers=A,B,C,D    Tiers to process (default: A,B)
  --model=sonnet     LLM model (default: sonnet)
  --budget=0.50      Max $ per prospect research (default: 0.50)
  --batch=5          Parallel batch size (default: 5)
  --dry-run          Run without making API calls
`);
}
