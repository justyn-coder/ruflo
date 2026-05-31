import { Prospect, ImportResult } from './importer.js';
import { execSync, exec } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

export interface Dossier {
  prospectId: string;
  prospect: Prospect;
  company: CompanyProfile;
  contact: ContactProfile;
  jtbd: JTBDInference;
  researchMeta: ResearchMeta;
  revisedTier: 'A' | 'B' | 'C' | 'D' | 'E';
  tierReason: string;
}

export interface CompanyProfile {
  name: string;
  description: string;
  size: string;
  services: string[];
  geography: string;
  recentNews: string[];
  fiberActivities: string[];
  beadStatus: string;
  competitors: string[];
  keySignals: string[];
}

export interface ContactProfile {
  name: string;
  title: string;
  role: string;
  responsibilities: string[];
  linkedinSummary: string;
  publicActivity: string[];
}

export interface JTBDInference {
  personaBucket: string;
  primaryJTBD: string;
  supportingEvidence: string[];
  vpConnection: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  confidenceReason: string;
}

export interface ResearchMeta {
  hypothesesTested: number;
  sourcesChecked: number;
  sourcesUsed: string[];
  lateralSearchAttempted: boolean;
  lateralFindings: string;
  timeSpentMs: number;
  searchesExhausted: boolean;
}

const INORSA_VP = {
  core: 'Inorsa provides AI-powered fiber optic network design and drafting automation',
  capabilities: [
    'Automated fiber drawing generation from GIS/CAD data',
    'Permit-ready construction drawings at scale',
    'FTTH and long-haul network design',
    'Reduction in engineering time from weeks to hours',
    'Quality-controlled output matching PE-stamp requirements',
  ],
  personaBuckets: [
    'drawings_quality — needs better/faster construction drawings',
    'permit_cycle — bottlenecked on permitting throughput',
    'network_expansion — scaling fiber footprint, needs design capacity',
    'cost_reduction — looking to reduce engineering/drafting costs',
    'competitive_pressure — competitors deploying faster, need to keep pace',
    'bead_deployment — BEAD-funded expansion requiring rapid design output',
    'workforce — can\'t hire enough designers/drafters',
  ],
};

function buildResearchPrompt(prospect: Prospect): string {
  return `You are a B2B research analyst performing deep research on a tradeshow booth visitor for post-show follow-up.

## Your task
Research this prospect and their company to build a dossier that supports a personalized follow-up email. The client (Inorsa) sells AI-powered fiber optic network design and drafting automation.

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- Location: ${prospect.city}, ${prospect.state}
- Email: ${prospect.email}
${prospect.aeNotes ? `- AE booth notes: "${prospect.aeNotes}"` : '- No AE booth notes available'}

## Inorsa's value proposition
${INORSA_VP.core}
Key capabilities: ${INORSA_VP.capabilities.join('; ')}

## Persona buckets (assign one)
${INORSA_VP.personaBuckets.join('\n')}

## Research method: Hypothesis-Driven Inference (Heuer ACH)
Do NOT walk a source checklist. Instead:
1. Form a specific hypothesis about this company's 1-3 year goals and how the contact's role creates exposure to fiber design/drafting needs
2. Search to confirm or DISCONFIRM (disconfirming evidence weighted higher)
3. If hypothesis survives, refine and search again
4. If it dies, form new hypothesis from what evidence surfaced
5. 3-5 iterations max

## What to research
- Company: what they do, size, geography, fiber-related activities, BEAD participation, recent news, growth signals
- Contact: role, responsibilities, what their day-to-day likely involves given title + company
- Industry context: competitive pressures, regulatory tailwinds, market dynamics affecting this company

## Sources to consider (chosen by hypothesis, not walked as a list)
- Company website (About, Services, News/Press, Careers pages)
- LinkedIn company page and contact profile
- State PUC/BEAD application records
- FCC filings, NTIA broadband maps
- Industry press (Fiber Broadband Association, ISE Magazine, Lightwave)
- Trade association memberships
- Recent job postings (signal what they're building)

## Output format (JSON)
Respond with ONLY a JSON object, no markdown fencing:
{
  "company": {
    "name": "",
    "description": "",
    "size": "",
    "services": [],
    "geography": "",
    "recentNews": [],
    "fiberActivities": [],
    "beadStatus": "",
    "competitors": [],
    "keySignals": []
  },
  "contact": {
    "name": "",
    "title": "",
    "role": "",
    "responsibilities": [],
    "linkedinSummary": "",
    "publicActivity": []
  },
  "jtbd": {
    "personaBucket": "",
    "primaryJTBD": "",
    "supportingEvidence": [],
    "vpConnection": "",
    "confidenceLevel": "high|medium|low",
    "confidenceReason": ""
  },
  "researchMeta": {
    "hypothesesTested": 0,
    "sourcesChecked": 0,
    "sourcesUsed": [],
    "lateralSearchAttempted": false,
    "lateralFindings": "",
    "searchesExhausted": false
  },
  "revisedTier": "A|B|C|D|E",
  "tierReason": ""
}

## Tier revision rules
- A: Strong fit + expressed interest (AE notes confirm) + decision-maker
- B: Good fit + some signal of interest or need
- C: Plausible fit but thin evidence
- D: Unclear fit, insufficient public information
- E: No fit (wrong industry, vendor, not-ICP)

Be honest about confidence. "Low confidence" with cited evidence is more valuable than "high confidence" with none.`;
}

export interface ResearchOptions {
  batchSize: number;
  model: string;
  maxBudgetPerProspect: number;
  outputDir: string;
  dryRun: boolean;
  tiersToProcess: string[];
}

const DEFAULT_OPTIONS: ResearchOptions = {
  batchSize: 5,
  model: 'sonnet',
  maxBudgetPerProspect: 0.50,
  outputDir: resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev/dossiers'),
  dryRun: false,
  tiersToProcess: ['A', 'B', 'C', 'D'],
};

export async function researchProspect(
  prospect: Prospect,
  options: ResearchOptions = DEFAULT_OPTIONS
): Promise<Dossier | null> {
  const prompt = buildResearchPrompt(prospect);
  const startTime = Date.now();

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would research: ${prospect.firstName} ${prospect.lastName} @ ${prospect.company}`);
    return null;
  }

  try {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const result = execSync(
      `claude -p --model ${options.model} --max-budget-usd ${options.maxBudgetPerProspect} --output-format json '${escapedPrompt}'`,
      {
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10,
      }
    );

    let parsed: any;
    try {
      const jsonResponse = JSON.parse(result);
      const content = jsonResponse.result || jsonResponse.content || result;
      const jsonMatch = typeof content === 'string'
        ? content.match(/\{[\s\S]*\}/)
        : null;
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : (typeof content === 'object' ? content : JSON.parse(content));
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse research output as JSON');
      }
    }

    const dossier: Dossier = {
      prospectId: prospect.id,
      prospect,
      company: parsed.company || {},
      contact: parsed.contact || {},
      jtbd: parsed.jtbd || {},
      researchMeta: {
        ...parsed.researchMeta,
        timeSpentMs: Date.now() - startTime,
      },
      revisedTier: parsed.revisedTier || prospect.tier,
      tierReason: parsed.tierReason || '',
    };

    const outPath = resolve(options.outputDir, `${prospect.id}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(dossier, null, 2));

    return dossier;
  } catch (error: any) {
    console.error(`  [ERROR] Research failed for ${prospect.firstName} ${prospect.lastName}: ${error.message}`);
    return null;
  }
}

export async function researchBatch(
  prospects: Prospect[],
  options: Partial<ResearchOptions> = {}
): Promise<Dossier[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dossiers: Dossier[] = [];
  const filtered = prospects.filter(p => opts.tiersToProcess.includes(p.tier));

  console.log(`\n=== Research Orchestrator ===`);
  console.log(`Total prospects: ${prospects.length}`);
  console.log(`Processing tiers: ${opts.tiersToProcess.join(', ')}`);
  console.log(`Filtered to process: ${filtered.length}`);
  console.log(`Batch size: ${opts.batchSize}`);
  console.log(`Model: ${opts.model}`);
  console.log(`Max budget/prospect: $${opts.maxBudgetPerProspect}`);
  console.log(`Output: ${opts.outputDir}`);
  console.log(`Dry run: ${opts.dryRun}\n`);

  for (let i = 0; i < filtered.length; i += opts.batchSize) {
    const batch = filtered.slice(i, i + opts.batchSize);
    const batchNum = Math.floor(i / opts.batchSize) + 1;
    const totalBatches = Math.ceil(filtered.length / opts.batchSize);

    console.log(`--- Batch ${batchNum}/${totalBatches} (${batch.length} prospects) ---`);

    const batchPromises = batch.map(async (prospect) => {
      console.log(`  Researching: ${prospect.firstName} ${prospect.lastName} @ ${prospect.company} [Tier ${prospect.tier}]`);
      const dossier = await researchProspect(prospect, opts);
      if (dossier) {
        console.log(`  ✓ ${prospect.firstName} ${prospect.lastName}: ${dossier.jtbd.personaBucket || 'unknown'} (${dossier.jtbd.confidenceLevel || 'unknown'} confidence) → Tier ${dossier.revisedTier}`);
        dossiers.push(dossier);
      }
      return dossier;
    });

    await Promise.all(batchPromises);
    console.log('');
  }

  console.log(`=== Research Complete ===`);
  console.log(`Dossiers generated: ${dossiers.length}/${filtered.length}`);

  const tierSummary: Record<string, number> = {};
  for (const d of dossiers) {
    tierSummary[d.revisedTier] = (tierSummary[d.revisedTier] || 0) + 1;
  }
  console.log(`Revised tier distribution: ${JSON.stringify(tierSummary)}`);

  return dossiers;
}

if (process.argv[1]?.includes('researcher')) {
  const csvPath = process.argv[2] || resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev/fiber-connect-2026-booth-scans.csv');
  const { importProspects } = await import('./importer.js');
  const result = importProspects(csvPath);

  const tiers = process.argv[3] ? process.argv[3].split(',') : ['A', 'B'];
  const dryRun = process.argv.includes('--dry-run');
  const model = process.argv.find(a => a.startsWith('--model='))?.split('=')[1] || 'sonnet';

  const prospects = tiers.flatMap(t => result.byTier[t] || []);

  researchBatch(prospects, {
    tiersToProcess: tiers,
    dryRun,
    model,
  }).then(dossiers => {
    console.log(`\nDone. ${dossiers.length} dossiers written to data/showrev/dossiers/`);
  });
}
