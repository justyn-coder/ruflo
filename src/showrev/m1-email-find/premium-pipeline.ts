#!/usr/bin/env npx tsx

// @deprecated — Use run-pipeline.ts instead. This file is kept for reference only.
// run-pipeline.ts is the production pipeline. Features unique to this file
// (Thompson Sampling, gap detection) are candidates for future merge into run-pipeline.ts.
// Created: 2026-05-31. Deprecated: 2026-06-06 (Wave 1x).

import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('.env', import.meta.url).pathname });

/**
 * @deprecated Use run-pipeline.ts instead.
 *
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
import { callLLM, callLLMWithBrainCache, setBrainCacheContent, type LLMCallOptions } from './llm-client.js';
import { importProspects, printImportSummary, type Prospect, type ICPStatus } from './importer.js';
import { RESEARCH_PERSONAS, buildMultiPersonaPrompt, generateCrossExamQuestions } from './personas.js';
import { INFLUENCE_TOOLKIT, buildPatternSelectorPrompt, buildComposerPrompt, type PatternSelection } from './influence.js';
import { runMechanicalChecks } from './judge.js';
import { buildTimProxyPrompt, buildRecipientProxyPrompt, buildSkepticPrompt, analyzeDisagreements } from './judges.js';
import { detectClaims, assessClaimSafety, buildVerificationPrompt } from './verify-facts.js';
import { buildDossierRow, validateBeforeWrite, dryRunPreview, writeDossierToSupabase, resolveProspectId, type SupabaseWritePayload } from './supabase-adapter.js';
import { ingestResearchIntoBrain, loadBrainDigest } from './brain-ingest.js';
import { structureIntelReport } from './intel-structurer.js';
import { composeMicrositeContent, type MicrositeRow } from './microsite-composer.js';
import { composeLean, type LeanBrief } from './lean-composer.js';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev');
const INORSA_VP_SUMMARY = `## What Inorsa does
Inorsa automates the generation of construction drawings from GIS/LLD inputs. They ingest GIS data and produce construction-grade AutoCAD drawings. The core value is SPEED — accelerating production so teams can do more work, get paid sooner, and have more time for their own QC. Fiber only (no tower/cellular).

CRITICAL: Inorsa does NOT validate inputs or catch errors in the GIS data. Errors in the network management tool translate directly as errors in the output. The value is acceleration and capacity, NOT quality assurance. Never claim Inorsa "catches errors" or "validates inputs" or "reduces permit returns." The product accelerates production, giving the customer MORE TIME to do their own QC before submission.

## How it works (from sales deck, confirmed by Nick McManus, Dir. Customer Transformation)
INGEST: GIS data (GeoPackage/shapefile or direct IQGeo integration) + CAD standards + jurisdictional standards.
GENERATE: LLD GIS → formatted construction drawing packages (AutoCAD to YOUR standard + PDF for permitting). Drawing Agent reads point + line metadata, maps to CAD blocks, generates pages with cross-references and jurisdictional callouts.
+ NORA AI: Ask questions across your portfolio, get answers in seconds.

## CRITICAL NUANCE (from Nick McManus, confirmed 2026-06-03)
- Automation potential depends on how well the prospect leverages their network management tool. DO NOT promise a specific automation percentage without a file review. Say: "We partner with you to maximize automation based on your current systems."
- "80% of the drafting lift" was in Nathan's sales deck but Nick says giving a percentage without a file review is a mistake. Use instead: "significant acceleration of drafting production" or cite the approved time metrics (~10 min, 70% cycle time reduction).
- Drafters still finish the drawings. Inorsa accelerates production but drawings could still bottleneck if the finishing step is slow.
- Any errors in the prospect's GIS/network management data will appear in Inorsa's output. Garbage in = garbage out. Never promise error-free output.

## The real value proposition (Nick's framing)
1. Revenue Acceleration — do the work faster, get paid sooner
2. Revenue Generation — accept more work without adding headcount
3. Opportunity — your team isn't stuck on this work, can do other things
4. Mistake proofing — ONLY where a key input is missing (not general QA)

## Proof points (approved for outreach)
- ~10 min source data to preliminary drawing
- 2-5x drafting scaling capacity with existing headcount
- 70% reduction in construction drawing cycle time
- "On longer-route fiber projects, a week of manual drafting can compress to minutes of automation plus your team's finishing work"
- 40-50% of permit submissions rejected on first pass (industry reality per Nick) — Inorsa's speed gives teams more time for QC before submission

## Pricing model
Token-based SaaS (OPEX). No seat licenses. Pay-as-you-go. Per-unit cost drops at scale. Do NOT promise CAPEX treatment.
Known objection (from Nick): "The price is not commensurate with delivered value." Product is recent and still growing into its pricing model. Focus on time/capacity ROI, not cost savings.

## What Inorsa does NOT do (hard boundary — never claim these)
- Route design (HLD or LLD generation)
- Splicing diagrams
- As-built reconciliation
- Bore profiles and traffic control plans
- Parcel-based plans
- Fixing or normalizing bad GIS data
- Input validation or error detection (except missing key inputs)
- Conflict avoidance (utility GIS layers can be ingested but conflict avoidance is NOT supported today)

## Prospect objections to prepare for
1. "Our GIS data is conceptual, not construction-grade" — Network management tools are often conceptual. Creating CAD parity still requires drafter intervention. Counter: Inorsa maximizes what CAN be automated from their current data and partners to improve over time.
2. "The price doesn't match the value yet" — Product is growing. Focus on time savings and capacity gain, not cost reduction.
3. "We can't capitalize it" — It's SaaS/OPEX. Frame as: the throughput gain more than covers the OPEX.

## Discovery questions that land with prospects (from Inorsa sales deck)
1. How much of your QC cycle is spent catching simple human mistakes that consistent source documents could eliminate?
2. Are your engineers carrying inconsistent inputs from source documents into deliverables, then catching them in redlines later?
3. Are issues showing up after drawings are produced, forcing redesigns?
4. Do LLDs and permit inputs vary across teams or markets, even for similar builds?

## How the sales team talks about it
Nathan Dunn: "GIS designs move fast, but converting them to construction-grade AutoCAD remains manual, slow, and different for each client's drawing standard."
Lucas Spencer: "The bottleneck is not crews or equipment. It is whether CAD-ready drawings stay ahead of the construction schedule."
Elevator pitch: "Speed without accuracy just creates more rework."

## Integration points (safe to reference if prospect uses these)
AutoCAD, IQGeo, SiteTracker, Egnyte, SharePoint. Do NOT claim integration with 3GIS or Katapult Pro.`;

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

// COMPOSITION_HARD_CONSTRAINTS removed — was dead code (never passed to any function).
// Real constraints live inline in buildComposerPrompt() in influence.ts.

function executePromptCLI(prompt: string, model: string = 'sonnet', timeoutMs: number = 300000): string {
  const tmpFile = `/tmp/showrev-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`;
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

async function executePrompt(
  prompt: string,
  model: string = 'sonnet',
  timeoutMs: number = 300000,
  label: string = 'prompt'
): Promise<string> {
  const resolvedModel = MODEL_MAP[model] || model;
  const isComposition = label.includes('compose');

  if (isComposition) {
    return executePromptCLI(prompt, model, timeoutMs);
  }

  return callLLMWithBrainCache(prompt, {
    model: resolvedModel,
    timeoutMs,
    label,
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
  composer?: 'full' | 'lean' | 'auto';
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

  // Load substrate context — SEMANTIC search via pgvector Edge Function
  // Searches 6,512 chunks of industry intelligence by MEANING, not keywords
  let substrateContext = '';
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (sbKey) {
      // Build a natural-language query from prospect context
      const semanticQuery = [
        prospect.company,
        prospect.title,
        prospect.state ? `${prospect.state} fiber broadband` : 'fiber construction',
        /engineer|design|A&E|consult/i.test(prospect.company + ' ' + prospect.title)
          ? 'A&E engineering firm GIS to CAD drawing production capacity'
          : 'fiber operator construction schedule permit drawing',
      ].filter(Boolean).join('. ');

      const subRes = await fetch(`${sbUrl}/functions/v1/search-substrate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: semanticQuery, limit: 8 }),
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const subRows = subData.results || [];
        if (subRows.length > 0) {
          substrateContext = '\n\n## Industry intelligence (semantic search — podcasts, expert blogs, BEAD data)\n' +
            subRows.map((r: any) => `**${r.title}** (${r.source}, ${r.published_date}, relevance: ${(r.similarity * 100).toFixed(0)}%):\n${r.content.slice(0, 600)}`).join('\n\n');
          const avgSim = subRows.reduce((s: number, r: any) => s + (r.similarity || 0), 0) / subRows.length;
          console.log(`  │  Substrate: ${subRows.length} semantic matches (avg relevance: ${(avgSim * 100).toFixed(0)}%)`);
        }
      }
    }
  } catch (err: any) {
    console.log(`  │  Substrate: skip (${err.message?.slice(0, 40)})`);
  }

  // Load similar-prospect dossiers — match by segment + role, not recency
  let similarProspectContext = '';
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (sbKey) {
      // Match by ICP type: A&E roles get A&E examples, operator roles get operator examples
      const isAE = /engineer|design|A&E|consult|drafting|CAD/i.test(prospect.title + ' ' + prospect.company);
      const isExec = /CEO|COO|CFO|VP|SVP|President|Director|Head/i.test(prospect.title);
      const personaFilter = isAE
        ? 'persona_bucket=in.(build_pace,drawings_quality)'
        : isExec
          ? 'persona_bucket=in.(cycle_time_exec,capital_efficiency,program_leverage)'
          : 'persona_bucket=in.(permit_cycle,build_pace)';

      const simRes = await fetch(
        `${sbUrl}/rest/v1/sr_engine_output?select=company,title,persona_bucket,influence_pattern_t1,intel_signal_strength,challenger_insight,research_summary&research_summary=not.is.null&company=neq.${encodeURIComponent(prospect.company)}&${personaFilter}&limit=3&order=created_at.desc`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      if (simRes.ok) {
        const similar: any[] = await simRes.json();
        if (similar.length > 0) {
          similarProspectContext = '\n\n## Similar prospects we researched previously (use as reference, not template)\n' +
            similar.map((s: any) => `**${s.company}** (${s.title}): Signal=${s.intel_signal_strength}, Persona=${s.persona_bucket}, Pattern=${s.influence_pattern_t1}\nResearch: ${(s.research_summary || '').slice(0, 400)}\nChallenger insight: ${(s.challenger_insight || '').slice(0, 200)}`).join('\n\n');
          console.log(`  │  Similar prospects: ${similar.length} dossiers (matched by ${isAE ? 'A&E' : isExec ? 'exec' : 'operator'} segment)`);
        }
      }
    }
  } catch {}

  const cacheableContent = [
    `## What Inorsa does\n${INORSA_VP_SUMMARY}`,
    brainContext || '',
    substrateContext || '',
    similarProspectContext || '',
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

  // PHASE 2c: Gap detection — trigger re-search if tools/competitors insufficient
  const techFindings = personaResults['Technical Evaluator'] || '';
  const toolGapIndicators = [
    'insufficient data', 'not found', 'no confirmed', 'could not identify',
    'unable to determine', 'no evidence of', 'unclear what tools',
  ];
  const hasToolGap = toolGapIndicators.some(indicator =>
    techFindings.toLowerCase().includes(indicator) &&
    (techFindings.toLowerCase().includes('tool') || techFindings.toLowerCase().includes('competitor') || techFindings.toLowerCase().includes('software'))
  );
  if (hasToolGap) {
    console.log(`  │  Phase 2c: Tool/competitor gap detected — running acquisition/subsidiary search...`);
    const acqPrompt = `You are researching whether ${prospect.company} owns, has acquired, or is a subsidiary of a company that operates technology platforms relevant to fiber/telecom engineering, GIS, or construction management.

Search for:
1. "${prospect.company}" acquired OR acquisition
2. "${prospect.company}" subsidiary OR division OR portfolio company
3. "${prospect.company}" owns OR merged with
4. Parent company of "${prospect.company}" (if it is itself a subsidiary)

Also check: does ${prospect.company} operate any technology platforms on separate domains (like Terracon owning Pivvot on pivvot.com)?

Return JSON: { "acquisitions": [...], "subsidiaries": [...], "parentCompany": "..." or null, "technologyPlatforms": [...], "sources": [...] }
If nothing found, return empty arrays. Do not guess.`;
    try {
      const acqResult = await executePrompt(acqPrompt, config.model, 120000, 'acquisition-search');
      personaResults['Technical Evaluator'] += `\n\n## Acquisition/Subsidiary Search (Phase 2c gap-fill)\n${acqResult}`;
      console.log(`  │  ✓ Acquisition search complete`);
    } catch (err: any) {
      console.log(`  │  ⚠ Acquisition search failed: ${err.message?.slice(0, 60)}`);
    }
  }

  // PHASE 3: Influence pattern selection for each touch
  // Thompson Sampling: query Brain for pattern performance, suggest top patterns
  let tsRecommendation = '';
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (sbKey) {
      const patRes = await fetch(
        `${sbUrl}/rest/v1/sr_brain_outreach_patterns?select=pattern_name,sample_size,success_rate,confidence,works_best_for,does_not_work_for&order=success_rate.desc`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      if (patRes.ok) {
        const patterns: any[] = await patRes.json();
        if (patterns.length > 0) {
          // Thompson Sampling: sample from Beta posteriors
          const samples: Array<{ name: string; sample: number; rate: number; n: number }> = patterns.map((p: any) => {
            const alpha = Math.round(p.success_rate * p.sample_size) + 1;
            const beta = p.sample_size - Math.round(p.success_rate * p.sample_size) + 1;
            // Beta approximation: use mean + noise proportional to variance
            const mean = alpha / (alpha + beta);
            const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
            const noise = (Math.random() - 0.5) * Math.sqrt(variance) * 4;
            return { name: p.pattern_name, sample: Math.max(0, mean + noise), rate: p.success_rate, n: p.sample_size };
          });
          samples.sort((a, b) => b.sample - a.sample);

          tsRecommendation = `\n\n## Brain recommendation (Thompson Sampling from ${patterns.length} patterns, ${patterns.reduce((s: number, p: any) => s + p.sample_size, 0)} prior sends)\n` +
            `Ranked by sampled probability of reply:\n` +
            samples.map((s, i) => `${i + 1}. **${s.name}** (${Math.round(s.rate * 100)}% reply rate, N=${s.n})${
              patterns.find((p: any) => p.pattern_name === s.name)?.works_best_for ? ` — works best for: ${patterns.find((p: any) => p.pattern_name === s.name).works_best_for}` : ''
            }`).join('\n') +
            `\nUse these rankings as a strong prior. Override only if the specific prospect context demands a different pattern.`;

          console.log(`  │  Thompson Sampling: top=${samples[0].name} (${Math.round(samples[0].rate * 100)}%, N=${samples[0].n})`);
        }
      }
    }
  } catch {}

  console.log(`  │  Phase 3: Influence pattern selection...`);
  const researchSummaryForPatterns = Object.values(personaResults).join('\n\n---\n\n');
  const enrichedDossierSummary = `Company: ${prospect.company}. Title: ${prospect.title}.\n\nResearch findings:\n${researchSummaryForPatterns}\n\n${prospect.aeNotes ? `Booth notes: "${prospect.aeNotes}"` : 'No booth notes.'}${relatedNote}${tsRecommendation}`;

  const patternSelections: PatternSelection[] = [];
  for (const touchNum of [1, 2, 3] as const) {
    const previousPatterns = patternSelections.map(p => p.pattern);
    const prompt = buildPatternSelectorPrompt(enrichedDossierSummary, prospect.aeNotes, prospect.title, touchNum, previousPatterns);
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

  // PHASE 4: Email composition
  // Hybrid: lean composer for Possible/Weak signals, full pipeline for Strong/Good
  // Signal detected from raw research (Phase 5 structuring hasn't happened yet)
  const researchText = Object.values(personaResults).join(' ').toLowerCase();
  const signalHints = {
    strong: (researchText.match(/signal.*strong|strong.*signal|high.*confidence/g) || []).length,
    weak: (researchText.match(/signal.*weak|weak.*signal|low.*confidence|insufficient|poor.*fit/g) || []).length,
  };
  const useLean = config.composer === 'lean' || signalHints.weak > signalHints.strong;

  const ae = resolveAE(prospect);
  const micrositeSlug = prospect.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (useLean) {
    console.log(`  │  Phase 4: LEAN composition (signal: Possible/Weak)...`);
  } else {
    console.log(`  │  Phase 4: FULL composition (signal: Strong/Good)...`);
  }

  const emails: EmailOutput[] = [];

  const researchSummary = Object.values(personaResults).join('\n\n');

  for (let i = 0; i < 3; i++) {
    const touchNum = (i + 1) as 1 | 2 | 3;
    const pattern = patternSelections[i];

    // Lean composer path (Possible/Weak signals or --composer=lean)
    if (useLean) {
      const leanBrief: LeanBrief = {
        prospect: { firstName: prospect.firstName, lastName: prospect.lastName, title: prospect.title, company: prospect.company },
        companySummary: researchSummary.slice(0, 1500),
        challengerInsight: pattern.challengerInsight || '',
        talkingPoints: pattern.rationale || '',
        fitRationale: pattern.emotionalFrame || '',
        boothNotes: prospect.aeNotes || '',
        ae: { name: ae.name, email: ae.email },
        touchNumber: touchNum,
        previousSubject: i > 0 ? emails[i - 1]?.subject : undefined,
        micrositeSlug,
      };
      console.log(`  │  ⏳ T${touchNum} lean composing (${pattern.pattern})...`);
      const lean = composeLean(leanBrief, config.model === 'opus' ? 'opus' : 'sonnet');
      emails.push({
        touchNumber: touchNum,
        subject: lean.subject,
        body: lean.body,
        ps: lean.ps,
        wordCount: lean.wordCount,
        pattern: pattern.pattern,
        antiTellChecks: [],
      });
      console.log(`  │  ✓ T${touchNum} lean composed (${lean.wordCount} words${lean.mechanicalPass ? '' : ', MECH FAIL: ' + lean.mechanicalFailures[0]})`);
      continue;
    }

    // Full composer path (Strong/Good signals)
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
      let cleanBody = (parsed.body || '')
        .replace(/(\d)–(\d)/g, '$1-$2').replace(/(\d)—(\d)/g, '$1-$2')
        .replace(/—/g, ',').replace(/–/g, ',');
      // Join salutation with first paragraph: "Len,\nyou" → "Len, you"
      cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
      // Lowercase first word after "Name, " unless it's a proper noun/acronym/name
      cleanBody = cleanBody.replace(/^([A-Z][a-z]+, )(\S+)/m, (_, sal, word) => {
        if (/[A-Z]/.test(word.slice(1))) return sal + word;
        const commonWords = /^(The|This|That|These|Those|We|You|Your|Our|But|And|If|So|At|In|On|By|Or|As|It|Is|Was|Are|No|Not|One|Two|Most|Every|When|Where|Why|How|Each|All|Has|Had|Last|Next|Here|Now|Just|Still|Also|Even|Back)$/;
        if (commonWords.test(word)) return sal + word[0].toLowerCase() + word.slice(1);
        return sal + word;
      });
      // Strip ALL signatures from body — HubSpot adds the real one
      cleanBody = cleanBody.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();
      const cleanSubject = (parsed.subject || '').replace(/—/g, ',').replace(/–/g, ',');
      let cleanPs = (parsed.ps || '').replace(/—/g, ',').replace(/–/g, ',');
      // Ensure microsite link in P.S. for T1 and T2
      if (touchNum <= 2 && micrositeSlug && !cleanPs.includes('fiber.inorsa.com')) {
        cleanPs = cleanPs
          ? `${cleanPs}\nhttps://fiber.inorsa.com/brief/${micrositeSlug}`
          : `P.S. Put together an overview: https://fiber.inorsa.com/brief/${micrositeSlug}`;
      }
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
  console.log(`  │  ✓ Microsite: "${(micrositeRow.headline || '').slice(0, 50)}..."`);

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

  // PHASE 7b: Fact verification — web-search verify load-bearing claims
  console.log(`  │  Phase 7b: Fact verification (web search)...`);
  const t1Body = emails.find(e => e.touchNumber === 1)?.body || '';
  const detectedClaims = detectClaims(t1Body);
  let unsafeClaims: any[] = [];

  if (detectedClaims.length > 0) {
    try {
      const { verifyClaimsWithWebSearch } = await import('./verify-facts.js');
      const verification = await verifyClaimsWithWebSearch(t1Body, prospect.company, callLLM);
      unsafeClaims = verification.verified.filter(c => !c.verified);
      const verifiedCount = verification.verified.filter(c => c.verified).length;
      console.log(`  │  ${verification.summary}`);
      for (const c of verification.verified) {
        const icon = c.verified ? '✓' : '⚠';
        console.log(`  │    ${icon} [${c.claimType}] ${c.verified ? 'VERIFIED' : 'UNVERIFIED'}: "${c.claim.slice(0, 50)}"`);
        if (c.discrepancy) console.log(`  │      Discrepancy: ${c.discrepancy.slice(0, 80)}`);
      }
    } catch (err: any) {
      console.log(`  │  ⚠ Web verification failed: ${err.message?.slice(0, 60)}`);
      unsafeClaims = detectedClaims.map(c => ({ ...c, verified: false }));
    }
  } else {
    console.log(`  │  ✓ No load-bearing claims detected`);
  }

  // PHASE 7c: Tim Proxy Judge — would Tim send this?
  console.log(`  │  Phase 7c: Tim Proxy judge...`);
  let timVerdict: any = null;
  try {
    const prospectCtx = `${prospect.firstName} ${prospect.lastName}, ${prospect.title} at ${prospect.company}`;
    const timPrompt = buildTimProxyPrompt(
      emails[0]?.subject || '', emails[0]?.body || '', emails[0]?.ps || '',
      prospectCtx, 1
    );
    const timRaw = await executePrompt(timPrompt, config.model, 120000, 'tim-proxy');
    try {
      const jsonMatch = timRaw.match(/\{[\s\S]*\}/);
      timVerdict = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {}
    if (timVerdict) {
      const icon = timVerdict.pass ? '✓' : '⚠';
      console.log(`  │  ${icon} Tim Proxy: ${timVerdict.pass ? 'PASS' : 'FAIL'} (${timVerdict.score}/10) — ${timVerdict.wouldYouSendThis || ''}`);
      if (timVerdict.mustFix?.length > 0) {
        for (const fix of timVerdict.mustFix) console.log(`  │    Fix: ${fix.slice(0, 80)}`);
      }
    }
  } catch (err: any) {
    console.log(`  │  ⚠ Tim Proxy failed: ${err.message?.slice(0, 60)}`);
  }

  // PHASE 7d: 5-Dimension LLM Judge Gate
  console.log(`  │  Phase 7d: 5-dimension judge gate...`);
  let judgeVerdict: any = null;
  try {
    const { judgeEmail } = await import('./judge.js');
    const dossierForJudge = {
      prospect: { firstName: prospect.firstName, lastName: prospect.lastName, title: prospect.title, company: prospect.company, aeNotes: prospect.aeNotes || '' },
      company: { name: prospect.company },
      jtbd: {
        personaBucket: structuredDossier?.contact?.showrev_persona_classification || patternSelections[0]?.pattern || '',
        primaryJTBD: patternSelections[0]?.challengerInsight || '',
        vpConnection: patternSelections[0]?.rationale || '',
        confidenceLevel: structuredDossier?.salesIntel?.showrev_signal_strength || 'medium',
      },
    };
    const touchForJudge = {
      touchNumber: 1,
      subject: emails[0]?.subject || '',
      body: emails[0]?.body || '',
      ps: emails[0]?.ps || '',
    };
    const verdict = await judgeEmail(dossierForJudge as any, touchForJudge as any, config.model);
    judgeVerdict = verdict;
    const allScores = (verdict?.scores || []).map((s: any) => `${s.dimension}:${s.score}`).join(', ');
    const rec = verdict?.recommendation || 'unknown';
    const icon = rec === 'send' ? '✓' : rec === 'hold' ? '⚠' : '✗';
    console.log(`  │  ${icon} Judge: ${rec.toUpperCase()} (${allScores})`);
    if (verdict?.mustFix?.length > 0) {
      for (const fix of verdict.mustFix) console.log(`  │    Fix: ${fix.slice(0, 80)}`);
    }
    if (rec === 'reject') {
      console.log(`  │  ✗ JUDGE REJECTED — email needs rewrite before shipping`);
    }
  } catch (err: any) {
    console.log(`  │  ⚠ Judge failed: ${err.message?.slice(0, 60)}`);
  }

  // PHASE 7e: Gemini spot-check (every 5th prospect)
  if (prospectIndex % 5 === 0) {
    console.log(`  │  Phase 7e: Gemini cross-model spot-check...`);
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && emails[0]) {
        const geminiPrompt = `Score this B2B sales email 1-10 on: research_depth, vp_connection, tone, conciseness, jtbd_alignment. Return JSON with scores array and recommendation (send/hold/reject). All ≥7 = send, any 5-6 = hold, any ≤4 = reject.\n\nSubject: ${emails[0].subject}\nBody: ${emails[0].body}\n\nProspect: ${prospect.firstName} ${prospect.lastName}, ${prospect.title} at ${prospect.company}`;
        const gemRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + geminiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] }),
        });
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          const gemText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const gemJsonMatch = gemText.match(/\{[\s\S]*\}/);
          if (gemJsonMatch) {
            const gemVerdict = JSON.parse(gemJsonMatch[0]);
            const gemRec = gemVerdict.recommendation || 'unknown';
            const claudeRec = judgeVerdict?.recommendation || 'unknown';
            const agree = gemRec === claudeRec;
            console.log(`  │  ${agree ? '✓' : '⚠'} Gemini: ${gemRec.toUpperCase()}${agree ? ' (agrees with Claude)' : ` (DISAGREES — Claude said ${claudeRec.toUpperCase()})`}`);
            if (!agree) {
              console.log(`  │    ⚠ Cross-model divergence — flag for operator review`);
            }
          }
        }
      }
    } catch (err: any) {
      console.log(`  │  ⚠ Gemini spot-check failed: ${err.message?.slice(0, 60)}`);
    }
  }

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

  md += `## Verification Gates\n\n`;
  md += `**Fact claims detected:** ${detectedClaims.length} | **Unsafe:** ${unsafeClaims.length}\n`;
  if (unsafeClaims.length > 0) {
    for (const c of unsafeClaims) md += `- [${c.type}] "${c.text.slice(0, 80)}"\n`;
  }
  md += `**Tim Proxy:** ${timVerdict ? `${timVerdict.pass ? 'PASS' : 'FAIL'} (${timVerdict.score}/10)` : 'Not run'}\n`;
  if (timVerdict?.mustFix?.length > 0) {
    for (const fix of timVerdict.mustFix) md += `- Fix: ${fix}\n`;
  }
  md += `\n---\n\n`;

  md += `## Microsite Content\n\n`;
  md += `**Headline:** ${micrositeRow.headline}\n`;
  md += `**Insight:** ${micrositeRow.insight_text}\n`;
  md += `**Case study:** ${micrositeRow.case_study_text}\n\n---\n\n`;

  writeFileSync(mdPath, md);
  console.log(`  │  ✓ Files written to ${jsonPath}`);

  // PHASE 9: Supabase write (or dry-run preview)
  // Resolve prospect_id to Supabase ID (prevents importer vs Supabase ID mismatch)
  const resolvedId = await resolveProspectId(prospect);
  if (resolvedId !== prospect.id) {
    console.log(`  │  ID resolved: ${prospect.id} → ${resolvedId}`);
  }
  const prospectWithResolvedId = { ...prospect, id: resolvedId };
  const dossierRow = buildDossierRow(prospectWithResolvedId, config.runId, researchSummary, emails, ae, micrositeSlug, mechanicalCheck, structuredDossier, micrositeRow);
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
  composer: (args.find(a => a.startsWith('--composer='))?.split('=')[1] || 'auto') as 'full' | 'lean' | 'auto',
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
