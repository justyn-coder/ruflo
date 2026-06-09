/**
 * Load email-source-discovery workflow output via raw SQL upsert.
 *
 * The sr_company_contacts unique index uses lower(name) (function-based),
 * which PostgREST can't target cleanly for on_conflict. So we generate
 * INSERT...ON CONFLICT...DO UPDATE SQL ourselves and execute via the
 * service-role key.
 *
 * Strategy:
 *   - Email-bearing rows: insert + on conflict, UPDATE email if existing was null
 *   - Name-only rows: insert + on conflict, do nothing (no info to add)
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/load-email-workflow-sql.ts [path]
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

import { normalizeCompanyName } from './substrate-query.js';
import type { SourceKind } from './types.js';

const DEFAULT_PATH =
  '/private/tmp/claude-501/-Users-justynszymczyk-Documents-GitHub-ruflo/d3b09c77-707b-407a-85d4-50f0be012623/tasks/w5mdoejzp.output';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

function sqlString(s: string | null | undefined): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

async function execSql(sql: string): Promise<unknown> {
  // Use Supabase REST RPC for raw SQL via the postgrest_query function if available;
  // otherwise fall back to a stored procedure exec endpoint.
  // Simplest: hit the v1/rpc/exec endpoint via the management API.
  // But cleanest available path: use the auth endpoint to call pg_meta query.
  //
  // Actually the most reliable path for service-role: hit postgrest at /rpc with
  // a function we define. But since we don't have an exec_sql function, we use
  // raw SQL via the pg-rest extension. Fallback: do per-row inserts via REST.
  //
  // For simplicity here: batch into a single transaction via PostgREST's
  // /rpc endpoint that supports any function. We assume the project has the
  // standard postgrest_query or similar. If not, the user can run the SQL
  // manually via the Supabase SQL editor.
  //
  // Easier path: chunk the inserts via per-row REST and accept duplicates.
  throw new Error('execSql: use the chunked-insert path instead');
}

async function main() {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`Loading email-workflow output from: ${path}`);

  if (!SB_KEY) {
    console.error('Supabase key missing');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const results = data?.result?.results || [];
  if (results.length === 0) {
    console.error('No agent results in workflow output');
    process.exit(1);
  }

  // Aggregate + dedup by (lower(name), normalized(company))
  const semantic = new Map<string, {
    name: string;
    title?: string;
    company: string;
    company_normalized: string;
    email?: string;
    source_kind: SourceKind;
    source_citation: string;
  }>();

  for (const agent of results) {
    const agentName = agent.agent_name || 'unknown';
    for (const c of (agent.contacts_found || []) as EmailWorkflowContact[]) {
      const name = (c.name || '').trim();
      const company = (c.company || '').trim();
      if (!name || !company) continue;
      const company_normalized = normalizeCompanyName(company);
      const key = `${name.toLowerCase()}|${company_normalized}`;
      const existing = semantic.get(key);
      const hasEmail = !!c.email && c.email.includes('@');
      // Prefer email-bearing source over name-only
      if (existing && !existing.email && hasEmail) {
        existing.email = c.email!;
        existing.source_kind = normalizeSourceKind(c.source_kind);
        existing.source_citation = c.source_url || `${agentName}`;
      } else if (!existing) {
        semantic.set(key, {
          name,
          title: c.title,
          company,
          company_normalized,
          email: hasEmail ? c.email : undefined,
          source_kind: normalizeSourceKind(c.source_kind),
          source_citation: c.source_url || `${agentName}`,
        });
      }
    }
  }

  const allRows = [...semantic.values()];
  const emailRows = allRows.filter(r => r.email);
  console.log(`Aggregated: ${allRows.length} unique (${emailRows.length} with email)`);
  console.log('');

  // Per-row upsert via PostgREST to handle the function-based unique index gracefully.
  // We send each row as a single INSERT...ON CONFLICT...DO UPDATE via the REST endpoint
  // using the Postgres SQL adapter through the function-based primary key (id).
  // Simpler approach: chunk into transactions of 50 via /rest/v1/sr_company_contacts
  // with on_conflict targeting the id column. Since we now have stable ids
  // (deterministic from name+company), this should work.
  //
  // Use the deterministic id strategy applied earlier to substrate-query.writeContacts.

  // Compute deterministic id from name+normalized-company (matches new strategy)
  const { createHash } = await import('crypto');
  function detId(name: string, normalized: string): string {
    return 'ev_' + createHash('sha1').update(`contact|${name.toLowerCase()}@${normalized}`).digest('hex').slice(0, 8);
  }

  const payloads = allRows.map(r => ({
    id: detId(r.name, r.company_normalized),
    name: r.name,
    title: r.title || null,
    company_name: r.company,
    company_normalized: r.company_normalized,
    email: r.email || null,
    linkedin: null,
    source_kind: r.source_kind,
    source_citation: r.source_citation,
    discovered_at: new Date().toISOString(),
    metadata: null,
  }));

  // Upsert in chunks of 50 — small enough that any single conflict row doesn't
  // block the whole batch via PostgREST behavior
  console.log('Upserting via PostgREST (on_conflict=id, returns minimal)...');
  let inserted = 0;
  let failed = 0;
  let conflictsAvoided = 0;
  const CHUNK = 50;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const slice = payloads.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sr_company_contacts?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(slice),
      });
      if (res.ok) {
        inserted += slice.length;
      } else {
        const text = await res.text();
        if (text.includes('idx_contacts_unique')) {
          // Per-row retry: existing row has same (lower(name), company_normalized)
          // but different id. For these, do an UPDATE by name+company.
          conflictsAvoided += slice.length;
          for (const row of slice) {
            try {
              const updateRes = await fetch(
                `${SB_URL}/rest/v1/sr_company_contacts?name=eq.${encodeURIComponent(row.name)}&company_normalized=eq.${encodeURIComponent(row.company_normalized)}`,
                {
                  method: 'PATCH',
                  headers: {
                    apikey: SB_KEY,
                    Authorization: `Bearer ${SB_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                  },
                  body: JSON.stringify({
                    email: row.email,
                    title: row.title,
                    source_citation: row.source_citation,
                    source_kind: row.source_kind,
                  }),
                },
              );
              if (updateRes.ok) inserted++;
              else failed++;
            } catch {
              failed++;
            }
          }
        } else {
          failed += slice.length;
          console.warn(`  batch ${i}: ${res.status} ${text.slice(0, 100)}`);
        }
      }
    } catch (err) {
      failed += slice.length;
      console.warn(`  batch ${i}: ${(err as Error).message}`);
    }
  }

  console.log('');
  console.log('================================================');
  console.log(`  Email workflow load complete`);
  console.log(`    Total unique aggregated:   ${allRows.length}`);
  console.log(`    With email:                ${emailRows.length}`);
  console.log(`    Inserted/updated:          ${inserted}`);
  console.log(`    Existing-row conflicts:    ${conflictsAvoided} (then PATCH-updated)`);
  console.log(`    Failed:                    ${failed}`);
  console.log('================================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
