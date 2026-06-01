import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { BrainEntity } from './brain-ingest.js';

let db: any = null;
let memoryCtrl: any = null;

const DEFAULT_DB_PATH = resolve(
  dirname(new URL(import.meta.url).pathname),
  '../../../data/brain/brain.sqlite'
);

export async function initBrainDB(dbPath: string = DEFAULT_DB_PATH): Promise<void> {
  if (db) return;

  const { AgentDB } = await import('agentdb');
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new AgentDB({ dbPath });
  await db.initialize();
  memoryCtrl = db.getController('memory');
}

export async function closeBrainDB(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    memoryCtrl = null;
  }
}

export async function storeEntity(entity: BrainEntity, namespace: string = 'brain'): Promise<void> {
  if (!memoryCtrl) throw new Error('BrainDB not initialized. Call initBrainDB() first.');

  const text = `${entity.type}: ${entity.name}. ${entity.facts.join('. ')}`;

  await memoryCtrl.storeEpisode({
    agentId: namespace,
    taskDescription: `brain-entity-${entity.type}`,
    approach: entity.name,
    outcome: entity.facts.join(' | '),
    reflection: entity.sources.join(', '),
    success: true,
    metadata: {
      entityType: entity.type,
      entityName: entity.name,
      firstSeen: entity.firstSeen,
      lastUpdated: entity.lastUpdated,
      factCount: entity.facts.length,
      ...entity.metadata,
    },
  });
}

export async function searchBrain(
  query: string,
  limit: number = 10,
  namespace: string = 'brain'
): Promise<Array<{
  name: string;
  type: string;
  facts: string[];
  score: number;
  sources: string;
}>> {
  if (!memoryCtrl) throw new Error('BrainDB not initialized. Call initBrainDB() first.');

  const results = await memoryCtrl.retrieveRelevant(namespace, query, limit);

  return (results || []).map((r: any) => ({
    name: r.approach || r.metadata?.entityName || 'unknown',
    type: r.metadata?.entityType || 'unknown',
    facts: (r.outcome || '').split(' | ').filter(Boolean),
    score: r.similarity || r.score || 0,
    sources: r.reflection || '',
  }));
}

export async function buildSemanticDigest(
  query: string,
  limit: number = 15,
  namespace: string = 'brain'
): Promise<string> {
  const results = await searchBrain(query, limit, namespace);
  if (results.length === 0) return '';

  let digest = `## Relevant Brain Knowledge (${results.length} matches)\n\n`;

  const byType = new Map<string, typeof results>();
  for (const r of results) {
    const list = byType.get(r.type) || [];
    list.push(r);
    byType.set(r.type, list);
  }

  for (const [type, entities] of byType) {
    digest += `### ${type} (${entities.length})\n`;
    for (const e of entities) {
      digest += `- **${e.name}** (relevance: ${(e.score * 100).toFixed(0)}%): ${e.facts[0] || ''}\n`;
    }
    digest += '\n';
  }

  return digest;
}

export async function ingestEntitiesToAgentDB(
  entities: BrainEntity[],
  namespace: string = 'brain'
): Promise<{ stored: number; errors: number }> {
  let stored = 0;
  let errors = 0;

  for (const entity of entities) {
    try {
      await storeEntity(entity, namespace);
      stored++;
    } catch (err: any) {
      errors++;
    }
  }

  return { stored, errors };
}

export async function getBrainStats(namespace: string = 'brain'): Promise<{
  totalEntities: number;
  byType: Record<string, number>;
}> {
  if (!memoryCtrl) throw new Error('BrainDB not initialized.');

  const stats = await memoryCtrl.getTaskStats(namespace);
  return {
    totalEntities: stats?.totalEpisodes || 0,
    byType: stats?.byTask || {},
  };
}
