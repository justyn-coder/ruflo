/**
 * PROVE IT Protocol — Module Wiring Verification
 *
 * Greps run-pipeline.ts for every module that SHOULD be wired.
 * Produces a truth table: imported? called? mocked? SMTP enabled?
 *
 * Run: npx tsx src/showrev/m1-email-find/verify-wiring.ts
 *
 * RULE: This script MUST be run before any status claim about
 * the pipeline. If grep returns empty for a module, its status
 * is "built-not-wired" — period. No exceptions.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PIPELINE = resolve(import.meta.dirname, 'run-pipeline.ts');

interface ModuleCheck {
  id: string;
  name: string;
  file: string;
  importPattern: RegExp;
  callPattern: RegExp;
  mockPattern?: RegExp;
}

const MODULES: ModuleCheck[] = [
  {
    id: 'email-finder',
    name: 'Email Finder (orchestrator)',
    file: 'email-finder/orchestrator.ts',
    importPattern: /import.*findEmail.*email-finder/,
    callPattern: /findEmail\s*\(/,
    mockPattern: /mockSearchFn|mockFetchFn/,
  },
  {
    id: 'search-fn',
    name: 'Web Search (searchFn)',
    file: 'injected in run-pipeline.ts',
    importPattern: /realSearchFn|searchFn/,
    callPattern: /searchFn:\s*realSearchFn/,
    mockPattern: /mockSearchFn|searchFn:\s*async.*=>\s*\[\]/,
  },
  {
    id: 'fetch-fn',
    name: 'Web Fetch (fetchFn)',
    file: 'injected in run-pipeline.ts',
    importPattern: /realFetchFn|fetchFn/,
    callPattern: /fetchFn:\s*realFetchFn/,
    mockPattern: /mockFetchFn|fetchFn:\s*async.*=>\s*''/,
  },
  {
    id: 'smtp',
    name: 'SMTP Verification',
    file: 'email-finder/smtp-verifier.ts',
    importPattern: /smtpVerify/,
    callPattern: /smtpVerify:\s*true/,
    mockPattern: /smtpVerify:\s*false/,
  },
  {
    id: 'research',
    name: '3-Persona STORM Research',
    file: 'personas.ts + researcher.ts',
    importPattern: /import.*personas|import.*researcher|phaseResearch/,
    callPattern: /phaseResearch\s*\(/,
  },
  {
    id: 'substrate',
    name: 'Substrate Semantic Search',
    file: 'supabase edge function',
    importPattern: /search-substrate/,
    callPattern: /functions\/v1\/search-substrate/,
  },
  {
    id: 'thompson',
    name: 'Thompson Sampling (beta posteriors)',
    file: 'premium-pipeline.ts',
    importPattern: /thompson|betaPosterior|bandit/i,
    callPattern: /thompson|betaPosterior|sampleArm/i,
  },
  {
    id: 'influence',
    name: 'Influence Pattern Selector',
    file: 'influence.ts',
    importPattern: /import.*influence|phasePatternSelection/,
    callPattern: /phasePatternSelection\s*\(/,
  },
  {
    id: 'composer-full',
    name: 'Full Email Composer',
    file: 'influence.ts',
    importPattern: /import.*influence|buildComposerPrompt|composeEmail/,
    callPattern: /composeEmail|buildComposerPrompt/,
  },
  {
    id: 'composer-lean',
    name: 'Lean Email Composer',
    file: 'lean-composer.ts',
    importPattern: /import.*lean-composer|leanCompose/,
    callPattern: /leanCompose\s*\(/,
  },
  {
    id: 'judge-mechanical',
    name: 'Judge — Mechanical Checks',
    file: 'judge.ts',
    importPattern: /import.*judge|runMechanicalChecks/,
    callPattern: /runMechanicalChecks|phaseJudge/,
  },
  {
    id: 'judge-5dim',
    name: 'Judge — 5-Dimension LLM Scorer',
    file: 'judge.ts',
    importPattern: /scoreEmail|judgeDimensions|research_depth|vp_connection/,
    callPattern: /scoreEmail|judgeDimensions/,
  },
  {
    id: 'semantic-verifier',
    name: 'Semantic Verifier',
    file: 'semantic-verifier.ts',
    importPattern: /import.*semantic-verifier|semanticVerif/,
    callPattern: /semanticVerif|verifyClaims/,
  },
  {
    id: 'fact-verifier',
    name: 'Fact Verifier',
    file: 'verify-facts.ts',
    importPattern: /import.*verify-facts|verifyFacts/,
    callPattern: /verifyFacts/,
  },
  {
    id: 'cross-model-judge',
    name: 'Cross-Model Judge',
    file: 'cross-model-judge.ts',
    importPattern: /import.*cross-model-judge|crossModelJudge/,
    callPattern: /crossModelJudge/,
  },
  {
    id: 'brain-ingest',
    name: 'Brain Ingest (entity extraction)',
    file: 'brain-ingest.ts',
    importPattern: /import.*brain-ingest|brainIngest/,
    callPattern: /brainIngest|extractEntities/,
  },
  {
    id: 'brain-agentdb',
    name: 'Brain / AgentDB',
    file: 'brain-agentdb.ts',
    importPattern: /import.*brain-agentdb|agentDb|AgentDB/,
    callPattern: /agentDb|searchBrain|queryAgentDB/,
  },
  {
    id: 'intel-structurer',
    name: 'Intel Report Structurer',
    file: 'intel-structurer.ts',
    importPattern: /import.*intel-structurer|structureIntel/,
    callPattern: /structureIntel|buildHubSpotDossier/,
  },
  {
    id: 'microsite-composer',
    name: 'ABM Microsite Composer',
    file: 'microsite-composer.ts',
    importPattern: /import.*microsite-composer|composeMicrosite/,
    callPattern: /composeMicrosite|phaseMicrosite/,
  },
];

type Status = 'live' | 'partial' | 'built-not-wired' | 'planned';

interface Result {
  id: string;
  name: string;
  file: string;
  imported: boolean;
  importLine: number | null;
  called: boolean;
  callLine: number | null;
  mocked: boolean;
  mockLine: number | null;
  status: Status;
}

function checkModule(source: string, lines: string[], mod: ModuleCheck): Result {
  let imported = false;
  let importLine: number | null = null;
  let called = false;
  let callLine: number | null = null;
  let mocked = false;
  let mockLine: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!imported && mod.importPattern.test(line)) {
      imported = true;
      importLine = i + 1;
    }
    if (!called && mod.callPattern.test(line)) {
      called = true;
      callLine = i + 1;
    }
    if (mod.mockPattern && !mocked && mod.mockPattern.test(line)) {
      mocked = true;
      mockLine = i + 1;
    }
  }

  let status: Status;
  if (imported && called && !mocked) {
    status = 'live';
  } else if (imported && called && mocked) {
    status = 'partial';
  } else if (imported || called) {
    status = 'partial';
  } else {
    // Check if the file exists (built but not wired)
    const filePath = resolve(import.meta.dirname, mod.file);
    try {
      readFileSync(filePath);
      status = 'built-not-wired';
    } catch {
      status = 'planned';
    }
  }

  return { id: mod.id, name: mod.name, file: mod.file, imported, importLine, called, callLine, mocked, mockLine, status };
}

// ── Run ──

const source = readFileSync(PIPELINE, 'utf-8');
const lines = source.split('\n');

console.log('=========================================================');
console.log('  PROVE IT — Module Wiring Verification');
console.log('  Target: run-pipeline.ts');
console.log(`  Scanned: ${lines.length} lines`);
console.log(`  Date: ${new Date().toISOString()}`);
console.log('=========================================================\n');

const results = MODULES.map(mod => checkModule(source, lines, mod));

// Status counts
const counts = { live: 0, partial: 0, 'built-not-wired': 0, planned: 0 };
results.forEach(r => counts[r.status]++);

// Print results
const statusEmoji = { live: '●', partial: '◐', 'built-not-wired': '◑', planned: '○' };
const statusColor = { live: '\x1b[32m', partial: '\x1b[33m', 'built-not-wired': '\x1b[35m', planned: '\x1b[90m' };
const reset = '\x1b[0m';

for (const r of results) {
  const e = statusEmoji[r.status];
  const c = statusColor[r.status];
  const imp = r.imported ? `imported:L${r.importLine}` : 'NOT imported';
  const call = r.called ? `called:L${r.callLine}` : 'NOT called';
  const mock = r.mocked ? `\x1b[31mMOCKED:L${r.mockLine}${reset}` : '';
  console.log(`${c}${e} ${r.status.toUpperCase().padEnd(16)}${reset} ${r.name}`);
  console.log(`  ${imp} | ${call}${mock ? ' | ' + mock : ''}`);
}

console.log('\n---------------------------------------------------------');
console.log(`  LIVE: ${counts.live}  |  PARTIAL: ${counts.partial}  |  BUILT-NOT-WIRED: ${counts['built-not-wired']}  |  PLANNED: ${counts.planned}`);
console.log('---------------------------------------------------------');

// Fail loudly if anything is mocked
const mocked = results.filter(r => r.mocked);
if (mocked.length > 0) {
  console.log(`\n\x1b[31m!! WARNING: ${mocked.length} module(s) have MOCKED implementations:\x1b[0m`);
  mocked.forEach(r => console.log(`   ${r.name} — mock at line ${r.mockLine}`));
}

// List built-not-wired for operator awareness
const bnw = results.filter(r => r.status === 'built-not-wired');
if (bnw.length > 0) {
  console.log(`\n\x1b[35m!! ${bnw.length} module(s) are BUILT but NOT WIRED into the pipeline:\x1b[0m`);
  bnw.forEach(r => console.log(`   ${r.name} (${r.file})`));
}

console.log('');
