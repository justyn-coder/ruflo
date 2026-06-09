/**
 * Load email-source-discovery workflow output to Supabase.
 *
 * Reads structured output from workflow `w5mdoejzp` and writes contacts
 * (with emails where present) to sr_company_contacts. Different schema
 * than load-workflow-output.ts because the email-discovery workflow's
 * contacts_found has source_url + source_kind + source_doc_date fields.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/load-email-workflow.ts [path]
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { writeContacts } from './substrate-query.js';
import type { SourceKind } from './types.js';

const DEFAULT_PATH =
  '/private/tmp/claude-501/-Users-justynszymczyk-Documents-GitHub-ruflo/d3b09c77-707b-407a-85d4-50f0be012623/tasks/w5mdoejzp.output';

interface EmailWorkflowContact {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  source_url?: string;
  source_kind?: string;
  source_doc_date?: string;
  context_note?: string;
}

interface EmailWorkflowAgentResult {
  agent_name?: string;
  sources_attempted?: number;
  sources_succeeded?: number;
  contacts_found?: EmailWorkflowContact[];
  notes?: string;
}

const SOURCE_KIND_MAP: Record<string, SourceKind> = {
  'bead-application': 'web_research_dated',
  'bead-portal': 'web_research_dated',
  'reconnect-award': 'web_research_dated',
  'rdof-bid': 'web_research_dated',
  'press-release': 'web_research_dated',
  'media-contact': 'web_research_dated',
  'trade-association': 'web_research',
  'conference-pdf': 'web_research_dated',
  'state-association': 'web_research',
  'web-research': 'web_research',
  'web-research-dated': 'web_research_dated',
  default: 'web_research',
};

function normalizeSourceKind(raw: string | undefined): SourceKind {
  if (!raw) return 'web_research';
  const lower = raw.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  return SOURCE_KIND_MAP[lower] || 'web_research';
}

async function main() {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`Loading email-workflow output from: ${path}`);
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const results: EmailWorkflowAgentResult[] = data?.result?.results || [];
  if (results.length === 0) {
    console.error('No agent results found in workflow output');
    process.exit(1);
  }

  console.log(`Found ${results.length} agent outputs`);

  const queue: Array<Parameters<typeof writeContacts>[0][number]> = [];
  const seen = new Set<string>();

  let totalAttempts = 0;
  let totalWithEmail = 0;

  for (const agent of results) {
    const agentName = agent.agent_name || 'unknown';
    const contacts = agent.contacts_found || [];
    let agentEmails = 0;

    for (const c of contacts) {
      totalAttempts++;
      const name = (c.name || '').trim();
      const company = (c.company || '').trim();
      if (!name || !company) continue;

      const dedupKey = `${name.toLowerCase()}|${company.toLowerCase()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const hasEmail = !!c.email && c.email.includes('@');
      if (hasEmail) {
        agentEmails++;
        totalWithEmail++;
      }

      queue.push({
        name,
        title: c.title,
        company_name: company,
        email: hasEmail ? c.email : undefined,
        source_kind: normalizeSourceKind(c.source_kind),
        source_citation: c.source_url || `${agentName}: ${c.context_note?.slice(0, 60) || ''}`,
      });
    }

    console.log(
      `  ${agentName.padEnd(35)}  contacts=${contacts.length.toString().padStart(4)}  emails=${agentEmails.toString().padStart(3)}`,
    );
  }

  console.log('');
  console.log(`Total raw contacts: ${totalAttempts}`);
  console.log(`Unique after dedup: ${queue.length}`);
  console.log(`With verified email: ${totalWithEmail}`);
  console.log('');

  console.log('Writing to sr_company_contacts (upsert, merges with existing)...');
  let inserted = 0;
  let failed = 0;
  const CHUNK = 200;
  for (let i = 0; i < queue.length; i += CHUNK) {
    const slice = queue.slice(i, i + CHUNK);
    const result = await writeContacts(slice);
    inserted += result.inserted;
    failed += result.failed;
  }

  console.log('');
  console.log('================================================');
  console.log(`  Email workflow load complete`);
  console.log(`    ${inserted} rows upserted, ${failed} failed`);
  console.log(`    ${totalWithEmail} verified emails added/merged`);
  console.log('================================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
