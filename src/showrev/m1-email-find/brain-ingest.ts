import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface BrainEntity {
  type: 'company' | 'funding' | 'relationship' | 'tool' | 'competitor_tool' | 'regulation' | 'person' | 'market_dynamic';
  name: string;
  facts: string[];
  sources: string[];
  firstSeen: string;
  lastUpdated: string;
  metadata?: Record<string, string>;
}

export interface BrainConfig {
  brainDir: string;
  digestInterval: number;
}

const DEFAULT_BRAIN_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026');

const KNOWN_COMPETITORS: Record<string, string> = {
  'iqgeo': 'systems_of_record',
  '3gis': 'systems_of_record',
  'sitetracker': 'systems_of_record',
  'katapult': 'systems_of_record',
  'render networks': 'systems_of_record',
  'biarri': 'systems_of_record',
  'osmose': 'engineering_software',
  'hexagon': 'engineering_software',
  'vetro': 'systems_of_record',
  'comsof': 'engineering_software',
};

function entityKey(entity: BrainEntity): string {
  return `${entity.type}::${entity.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

export function loadEntityGraph(brainDir: string): Map<string, BrainEntity> {
  const graphPath = resolve(brainDir, 'entity-graph.jsonl');
  const entities = new Map<string, BrainEntity>();

  if (!existsSync(graphPath)) return entities;

  const lines = readFileSync(graphPath, 'utf-8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const entity: BrainEntity = JSON.parse(line);
      entities.set(entityKey(entity), entity);
    } catch {}
  }
  return entities;
}

function saveEntityGraph(brainDir: string, entities: Map<string, BrainEntity>): void {
  const graphPath = resolve(brainDir, 'entity-graph.jsonl');
  mkdirSync(dirname(graphPath), { recursive: true });
  const lines = Array.from(entities.values()).map(e => JSON.stringify(e));
  writeFileSync(graphPath, lines.join('\n') + '\n');
}

function appendToGraph(brainDir: string, entity: BrainEntity): void {
  const graphPath = resolve(brainDir, 'entity-graph.jsonl');
  mkdirSync(dirname(graphPath), { recursive: true });
  appendFileSync(graphPath, JSON.stringify(entity) + '\n');
}

export function extractEntities(
  researchOutput: string,
  prospectId: string
): BrainEntity[] {
  const entities: BrainEntity[] = [];
  const now = new Date().toISOString().slice(0, 10);

  const companyPattern = /(?:Company|company|firm|operator|contractor|ISP|provider)[:\s]+([A-Z][A-Za-z\s&.,'-]+?)(?:\s*(?:is|has|was|operates|formed|signed|acquired|received|deployed|announced|partnered))/g;
  const fundingPattern = /\$[\d,.]+[KMB]?\s+(?:in\s+)?(?:funding|grant|award|allocation|investment|BEAD|NTIA|TBCP|ARPA|RUS)/gi;
  const jvPattern = /(?:JV|joint venture|partnership|merger|acquisition)\s+(?:with|between)\s+([A-Z][A-Za-z\s&.,'-]+)/gi;
  const toolPattern = /(?:uses?|deployed?|platform|tool|software|system)[:\s]+([A-Z][A-Za-z\s]+?)(?:\s+(?:platform|tool|software|system|for|to))/gi;
  const beadPattern = /BEAD\s+(?:allocation|award|funding|grant|program|subgrant|construction|deadline)[^.]*\./gi;

  const sourcePattern = /(?:Source|source|https?):?\s*(https?:\/\/[^\s"',)]+)/g;
  const sources: string[] = [];
  let sourceMatch;
  while ((sourceMatch = sourcePattern.exec(researchOutput)) !== null) {
    sources.push(sourceMatch[1]);
  }

  let match;
  while ((match = companyPattern.exec(researchOutput)) !== null) {
    const name = match[1].trim().replace(/[.,]+$/, '');
    if (name.length > 2 && name.length < 60) {
      entities.push({
        type: 'company',
        name,
        facts: [match[0].slice(0, 200)],
        sources: sources.slice(0, 3),
        firstSeen: prospectId,
        lastUpdated: now,
      });
    }
  }

  const fundingMatches = researchOutput.match(fundingPattern) || [];
  for (const f of fundingMatches) {
    entities.push({
      type: 'funding',
      name: f.trim().slice(0, 100),
      facts: [f.trim()],
      sources: sources.slice(0, 2),
      firstSeen: prospectId,
      lastUpdated: now,
    });
  }

  while ((match = jvPattern.exec(researchOutput)) !== null) {
    entities.push({
      type: 'relationship',
      name: match[1].trim().replace(/[.,]+$/, ''),
      facts: [match[0].slice(0, 200)],
      sources: sources.slice(0, 2),
      firstSeen: prospectId,
      lastUpdated: now,
      metadata: { relationship_type: 'JV/partnership' },
    });
  }

  while ((match = toolPattern.exec(researchOutput)) !== null) {
    const toolName = match[1].trim().replace(/[.,]+$/, '');
    if (toolName.length > 2 && toolName.length < 40) {
      const competitorCategory = KNOWN_COMPETITORS[toolName.toLowerCase()];
      entities.push({
        type: competitorCategory ? 'competitor_tool' : 'tool',
        name: toolName,
        facts: [match[0].slice(0, 200)],
        sources: sources.slice(0, 2),
        firstSeen: prospectId,
        lastUpdated: now,
        metadata: competitorCategory ? { competitor_category: competitorCategory } : undefined,
      });
    }
  }

  // Direct competitor scan — catches competitors not matched by toolPattern regex
  for (const [competitor, category] of Object.entries(KNOWN_COMPETITORS)) {
    const re = new RegExp(`\\b${competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(researchOutput)) {
      const displayName = competitor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const existingKey = `competitor_tool::${displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      if (!entities.some(e => entityKey(e) === existingKey)) {
        entities.push({
          type: 'competitor_tool',
          name: displayName,
          facts: [`Competitor (${category}): ${displayName} mentioned in research`],
          sources: sources.slice(0, 2),
          firstSeen: prospectId,
          lastUpdated: now,
          metadata: { competitor_category: category },
        });
      }
    }
  }

  const beadMatches = researchOutput.match(beadPattern) || [];
  for (const b of beadMatches) {
    entities.push({
      type: 'regulation',
      name: 'BEAD',
      facts: [b.trim()],
      sources: sources.slice(0, 2),
      firstSeen: prospectId,
      lastUpdated: now,
    });
  }

  return entities;
}

export function ingestEntities(
  brainDir: string,
  newEntities: BrainEntity[]
): { added: number; updated: number; total: number } {
  const graph = loadEntityGraph(brainDir);
  let added = 0;
  let updated = 0;

  for (const entity of newEntities) {
    const key = entityKey(entity);
    const existing = graph.get(key);

    if (existing) {
      const newFacts = entity.facts.filter(f =>
        !existing.facts.some(ef => ef.toLowerCase().includes(f.toLowerCase().slice(0, 30)))
      );
      if (newFacts.length > 0) {
        existing.facts.push(...newFacts);
        existing.lastUpdated = entity.lastUpdated;
        const newSources = entity.sources.filter(s => !existing.sources.includes(s));
        existing.sources.push(...newSources);
        updated++;
      }
    } else {
      graph.set(key, entity);
      added++;
    }
  }

  saveEntityGraph(brainDir, graph);
  return { added, updated, total: graph.size };
}

export function generateDigest(brainDir: string): string {
  const graph = loadEntityGraph(brainDir);
  if (graph.size === 0) return '';

  const byType = new Map<string, BrainEntity[]>();
  for (const entity of graph.values()) {
    const list = byType.get(entity.type) || [];
    list.push(entity);
    byType.set(entity.type, list);
  }

  let digest = `Brain Knowledge Digest (${graph.size} entities)\n\n`;

  const companies = byType.get('company') || [];
  if (companies.length > 0) {
    digest += `## Companies discovered (${companies.length})\n`;
    for (const c of companies.slice(0, 50)) {
      digest += `- **${c.name}**: ${c.facts[0]?.slice(0, 120) || 'no details'}\n`;
    }
    digest += '\n';
  }

  const funding = byType.get('funding') || [];
  if (funding.length > 0) {
    digest += `## Funding programs (${funding.length})\n`;
    const seen = new Set<string>();
    for (const f of funding) {
      const key = f.facts[0]?.slice(0, 50) || f.name;
      if (!seen.has(key)) {
        digest += `- ${f.facts[0]?.slice(0, 150) || f.name}\n`;
        seen.add(key);
      }
    }
    digest += '\n';
  }

  const relationships = byType.get('relationship') || [];
  if (relationships.length > 0) {
    digest += `## Relationships (${relationships.length})\n`;
    for (const r of relationships) {
      digest += `- ${r.name}: ${r.facts[0]?.slice(0, 120) || ''}\n`;
    }
    digest += '\n';
  }

  const competitors = byType.get('competitor_tool') || [];
  if (competitors.length > 0) {
    digest += `## Known competitors in use (${competitors.length})\n`;
    for (const c of competitors) {
      digest += `- ${c.name}${c.metadata?.competitor_category ? ` (${c.metadata.competitor_category})` : ''}\n`;
    }
    digest += '\n';
  }

  const tools = byType.get('tool') || [];
  if (tools.length > 0) {
    digest += `## Tools / platforms in use (${tools.length})\n`;
    for (const t of tools) {
      digest += `- ${t.name}\n`;
    }
    digest += '\n';
  }

  const regulations = byType.get('regulation') || [];
  if (regulations.length > 0) {
    digest += `## Regulatory / funding landscape (${regulations.length} entries)\n`;
    const seen = new Set<string>();
    for (const r of regulations) {
      const factKey = r.facts[0]?.slice(0, 40) || '';
      if (!seen.has(factKey)) {
        digest += `- ${r.facts[0]?.slice(0, 150) || r.name}\n`;
        seen.add(factKey);
      }
    }
    digest += '\n';
  }

  const digestPath = resolve(brainDir, 'brain-context-digest.md');
  writeFileSync(digestPath, digest);
  return digest;
}

let agentDBInitialized = false;

export async function ingestResearchIntoBrain(
  personaResults: Record<string, string>,
  prospectId: string,
  brainDir: string = DEFAULT_BRAIN_DIR,
  prospectCount: number = 0,
  digestInterval: number = 10
): Promise<{ added: number; updated: number; total: number; digestRefreshed: boolean; agentDBStored: number }> {
  const allResearch = Object.values(personaResults).join('\n\n');

  const entities = extractEntities(allResearch, prospectId);

  const result = ingestEntities(brainDir, entities);

  // Store to AgentDB for semantic search
  let agentDBStored = 0;
  try {
    const { initBrainDB, ingestEntitiesToAgentDB } = await import('./brain-agentdb.js');
    if (!agentDBInitialized) {
      await initBrainDB();
      agentDBInitialized = true;
    }
    const dbResult = await ingestEntitiesToAgentDB(entities);
    agentDBStored = dbResult.stored;
  } catch (err: any) {
    // AgentDB is optional — JSONL is the primary store
  }

  let digestRefreshed = false;
  if (prospectCount % digestInterval === 0 || prospectCount <= 1) {
    generateDigest(brainDir);
    digestRefreshed = true;
  }

  return { ...result, digestRefreshed, agentDBStored };
}

export function loadBrainDigest(brainDir: string = DEFAULT_BRAIN_DIR): string {
  const digestPath = resolve(brainDir, 'brain-context-digest.md');
  if (!existsSync(digestPath)) return '';
  return readFileSync(digestPath, 'utf-8');
}
