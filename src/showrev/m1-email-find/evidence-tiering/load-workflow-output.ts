/**
 * Load evidence-base build workflow output into Supabase.
 *
 * Reads the structured result from workflow `wei06huvu` (the 8-agent
 * evidence-base build) and writes:
 *   - sr_company_evidence (per-(company, claim) rows)
 *   - sr_company_contacts (discovered people)
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/load-workflow-output.ts [workflow-output-path]
 *
 * Default path: /private/tmp/.../wei06huvu.output
 *
 * Idempotent — re-running with the same data merges duplicates via
 * substrate-query.writeEvidence / writeContacts (which use upsert).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { writeEvidence, writeContacts } from './substrate-query.js';
import type { SourceKind, ClaimCategory } from './types.js';

const DEFAULT_PATH = '/private/tmp/claude-501/-Users-justynszymczyk-Documents-GitHub-ruflo/d3b09c77-707b-407a-85d4-50f0be012623/tasks/wei06huvu.output';

type AgentFact = {
  claim: string;
  source_kind?: string;
  citation?: string;
  date?: string;
  speaker?: string;
  speaker_company?: string;
  speaker_role?: string;
};

type AgentCompany = {
  company: string;
  facts: AgentFact[];
};

type AgentContact = {
  name: string;
  title?: string;
  company: string;
  email?: string;
  source: string;
};

type AgentOutput = {
  agent_name: string;
  sources_pulled?: string[];
  companies_found: AgentCompany[];
  contacts_found: AgentContact[];
  gaps_and_followups?: string[];
  notes?: string;
};

const SOURCE_KIND_MAP: Record<string, SourceKind> = {
  substrate: 'substrate',
  'substrate-quoted': 'substrate_quoted',
  apollo: 'apollo',
  'apollo-cross': 'apollo_cross',
  web: 'web_research',
  'web-dated': 'web_research_dated',
  website: 'web_research',
  press: 'web_research_dated',
  'trade-press': 'web_research_dated',
  conference: 'web_research_dated',
  'conference-bio': 'web_research_dated',
  'trade-association': 'web_research',
  'fcc-bdc': 'fcc_bdc',
  manual: 'manual',
  default: 'web_research',
};

function normalizeSourceKind(raw: string | undefined): SourceKind {
  if (!raw) return 'web_research';
  const lower = raw.toLowerCase().replace(/\s+/g, '-');
  return SOURCE_KIND_MAP[lower] || SOURCE_KIND_MAP[lower.replace(/_/g, '-')] || 'web_research';
}

/**
 * Normalize an agent-returned date string to ISO 8601 timestamp.
 * Agents return things like "2017", "2026-05", "March 2024", etc.
 * Supabase wants full timestamptz.
 */
function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Year only: "2017"
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01T00:00:00Z`;
  }
  // Year-month: "2026-05"
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01T00:00:00Z`;
  }
  // Year-month-day: "2026-05-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00Z`;
  }
  // Try Date constructor for everything else (handles "March 2024", "2024-05-15T10:00:00Z", etc.)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  // Couldn't parse — drop the date so we don't poison the row
  return undefined;
}

function categorizeClaimWithFacts(claim: string): ClaimCategory {
  const lower = claim.toLowerCase();
  if (/\d+\s*(miles?|locations?|customers?|subscribers?|drawings?|engineers?|employees?)|revenue|bead|reconnect|grant|fiber|gigabit|customer base/.test(lower)) {
    return 'company_fact';
  }
  if (/ceo|cto|coo|cfo|vp |president|director|head of|chief |hired|joined|board of/.test(lower)) {
    return 'persona_signal';
  }
  return 'industry_context';
}

async function main() {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`Loading workflow output from: ${path}`);
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const results: AgentOutput[] = data?.result?.executeResults || [];
  if (results.length === 0) {
    console.error('No execute results found in workflow output');
    process.exit(1);
  }

  console.log(`Found ${results.length} agent outputs`);

  // Aggregate before writing — dedup by id within the script so we
  // minimize round-trips and so we know how much we collapsed.
  const evidenceQueue: Array<{
    company_name: string;
    claim: string;
    source_kind: SourceKind;
    source_citation: string;
    source_date?: string;
    speaker_name?: string;
    speaker_company?: string;
    speaker_role?: string;
    category: ClaimCategory;
  }> = [];
  const contactsQueue: Array<{
    name: string;
    title?: string;
    company_name: string;
    email?: string;
    linkedin?: string;
    source_kind: SourceKind;
    source_citation: string;
  }> = [];

  const seenEvidence = new Set<string>();
  const seenContacts = new Set<string>();

  for (const agent of results) {
    const agentName = agent.agent_name || 'unknown';

    for (const c of agent.companies_found || []) {
      const companyName = (c.company || '').trim();
      if (!companyName) continue;

      for (const f of c.facts || []) {
        const claim = (f.claim || '').trim();
        if (!claim) continue;

        const source_kind = normalizeSourceKind(f.source_kind || agentName);
        const source_citation = f.citation || `${agentName}: ${claim.slice(0, 60)}`;
        const dedupKey = `${companyName.toLowerCase()}|${claim.toLowerCase().slice(0, 100)}`;
        if (seenEvidence.has(dedupKey)) continue;
        seenEvidence.add(dedupKey);

        // If speaker_company matches the company, source kind becomes substrate_quoted
        const sk: SourceKind =
          source_kind === 'substrate' && f.speaker_company &&
          f.speaker_company.trim().toLowerCase() === companyName.toLowerCase()
            ? 'substrate_quoted'
            : source_kind;

        evidenceQueue.push({
          company_name: companyName,
          claim,
          source_kind: sk,
          source_citation,
          source_date: normalizeDate(f.date),
          speaker_name: f.speaker,
          speaker_company: f.speaker_company,
          speaker_role: f.speaker_role,
          category: categorizeClaimWithFacts(claim),
        });
      }
    }

    for (const ct of agent.contacts_found || []) {
      const name = (ct.name || '').trim();
      const company = (ct.company || '').trim();
      if (!name || !company) continue;

      const dedupKey = `${name.toLowerCase()}|${company.toLowerCase()}`;
      if (seenContacts.has(dedupKey)) continue;
      seenContacts.add(dedupKey);

      contactsQueue.push({
        name,
        title: ct.title,
        company_name: company,
        email: ct.email,
        source_kind: normalizeSourceKind(agentName),
        source_citation: ct.source || `${agentName}`,
      });
    }
  }

  console.log('');
  console.log(`Prepared to write:`);
  console.log(`  Evidence rows:  ${evidenceQueue.length} unique`);
  console.log(`  Contact rows:   ${contactsQueue.length} unique`);
  console.log(`  Contacts with email: ${contactsQueue.filter(c => c.email).length}`);
  console.log('');

  // Write in chunks of 200 so we don't overwhelm Supabase REST
  const CHUNK = 200;
  console.log('Writing evidence rows...');
  let evidenceInserted = 0;
  let evidenceFailed = 0;
  for (let i = 0; i < evidenceQueue.length; i += CHUNK) {
    const slice = evidenceQueue.slice(i, i + CHUNK);
    const result = await writeEvidence(slice);
    evidenceInserted += result.inserted;
    evidenceFailed += result.failed;
    process.stdout.write(`  ${Math.min(i + CHUNK, evidenceQueue.length)}/${evidenceQueue.length} (${result.inserted} ok, ${result.failed} fail)\r`);
  }
  console.log('');
  console.log(`Evidence rows: ${evidenceInserted} inserted, ${evidenceFailed} failed`);

  console.log('');
  console.log('Writing contact rows...');
  let contactsInserted = 0;
  let contactsFailed = 0;
  for (let i = 0; i < contactsQueue.length; i += CHUNK) {
    const slice = contactsQueue.slice(i, i + CHUNK);
    const result = await writeContacts(slice);
    contactsInserted += result.inserted;
    contactsFailed += result.failed;
    process.stdout.write(`  ${Math.min(i + CHUNK, contactsQueue.length)}/${contactsQueue.length} (${result.inserted} ok, ${result.failed} fail)\r`);
  }
  console.log('');
  console.log(`Contact rows: ${contactsInserted} inserted, ${contactsFailed} failed`);

  console.log('');
  console.log('================================================');
  console.log(`  Load Complete`);
  console.log(`    ${evidenceInserted} evidence rows`);
  console.log(`    ${contactsInserted} contact rows`);
  console.log(`    ${contactsQueue.filter(c => c.email).length} contacts with verified email`);
  console.log('================================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
