/**
 * Cohort report generator for run-pipeline-v2 runs.
 *
 * Reads sr_engine_output for a run_id, computes distributions, picks
 * top USE_DIRECTLY prospects, identifies worst-case red/no-email
 * candidates, writes markdown to data/showrev/.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/cohort-report.ts <run-id-prefix>
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface Row {
  prospect_id: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  state: string;
  icp_status: string;
  icp_reason: string;
  email: string;
  confidence_color: string;
  email_subject_t1: string;
  email_body_t1: string;
  icp_volume_verdict: string;
  icp_volume_reasoning: string;
  research_summary: string;
  run_id: string;
}

async function sb<T>(path: string): Promise<T> {
  const res = await fetch(`${SB_URL}${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const runIdPrefix = process.argv[2];
  if (!runIdPrefix) {
    console.error('Usage: cohort-report.ts <run-id-prefix>');
    process.exit(1);
  }
  console.log(`Generating report for run_id LIKE '${runIdPrefix}%'`);

  const rows = await sb<Row[]>(
    `/rest/v1/sr_engine_output?run_id=like.${encodeURIComponent(runIdPrefix)}%25&order=created_at.desc&limit=500`,
  );
  console.log(`Found ${rows.length} prospects`);

  // Parse research_summary for richer fields
  const parsed = rows.map(r => {
    let rs: { composer_mode?: string; tier_counts?: { useDirectly?: number; useToShape?: number }; pull_stats?: { substrate_records?: number; apollo_matched?: boolean }; apollo_credits_used?: number } = {};
    try { rs = JSON.parse(r.research_summary || '{}'); } catch { /* ignore */ }
    return {
      ...r,
      composer_mode: rs.composer_mode,
      use_directly: rs.tier_counts?.useDirectly ?? 0,
      use_to_shape: rs.tier_counts?.useToShape ?? 0,
      substrate_records: rs.pull_stats?.substrate_records ?? 0,
      apollo_matched: rs.pull_stats?.apollo_matched ?? false,
      apollo_credits: rs.apollo_credits_used ?? 0,
    };
  });

  // Distributions
  const total = parsed.length;
  const passedIcp = parsed.filter(p => p.icp_status === 'pass').length;
  const rejected = total - passedIcp;
  const composed = parsed.filter(p => p.email_subject_t1).length;
  const specific = parsed.filter(p => p.composer_mode === 'specific').length;
  const generalized = parsed.filter(p => p.composer_mode === 'generalized').length;

  const confDist: Record<string, number> = { green: 0, yellow: 0, amber: 0, red: 0, none: 0 };
  for (const p of parsed) {
    const c = p.confidence_color || 'none';
    if (!p.email) confDist.none = (confDist.none || 0) + 1;
    else confDist[c] = (confDist[c] || 0) + 1;
  }

  const icpDist: Record<string, number> = { fit: 0, leaning_fit: 0, miss: 0, none: 0 };
  for (const p of parsed) {
    const v = p.icp_volume_verdict || 'none';
    icpDist[v] = (icpDist[v] || 0) + 1;
  }

  // Top 10 USE_DIRECTLY count (richest substrate)
  const topUseDirectly = [...parsed]
    .filter(p => p.email_subject_t1)
    .sort((a, b) => b.use_directly - a.use_directly)
    .slice(0, 10);

  // Worst 5 red/no-email (Path B refinement candidates)
  const worstEmail = [...parsed]
    .filter(p => p.icp_status === 'pass' && (p.confidence_color === 'red' || !p.email))
    .slice(0, 10);

  const totalApolloCredits = parsed.reduce((s, p) => s + p.apollo_credits, 0);

  // Render markdown
  const dateStr = new Date().toISOString().slice(0, 10);
  const md: string[] = [];
  md.push(`---`);
  md.push(`title: Overnight Cohort Report — ${runIdPrefix}`);
  md.push(`status: ACTIVE`);
  md.push(`last_updated: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} EDT`);
  md.push(`version: v1`);
  md.push(`---`);
  md.push('');
  md.push(`# Overnight Cohort Report — \`${runIdPrefix}\``);
  md.push('');
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push('');
  md.push(`## Headline numbers`);
  md.push('');
  md.push(`- **Total processed:** ${total}`);
  md.push(`- **ICP passed:** ${passedIcp} (${Math.round(passedIcp / total * 100)}%)`);
  md.push(`- **ICP rejected:** ${rejected}`);
  md.push(`- **Emails composed:** ${composed}/${passedIcp}`);
  md.push(`- **Specific mode:** ${specific}`);
  md.push(`- **Generalized mode:** ${generalized}`);
  md.push(`- **Apollo credits used:** ${totalApolloCredits} (~$${(totalApolloCredits * 0.002).toFixed(2)})`);
  md.push('');
  md.push(`## Email confidence distribution`);
  md.push('');
  md.push(`| Confidence | Count | % |`);
  md.push(`|---|---|---|`);
  for (const [k, v] of Object.entries(confDist)) {
    if (v === 0) continue;
    md.push(`| ${k} | ${v} | ${Math.round(v / total * 100)}% |`);
  }
  md.push('');
  md.push(`## ICP volume verdict distribution`);
  md.push('');
  md.push(`| Verdict | Count | % |`);
  md.push(`|---|---|---|`);
  for (const [k, v] of Object.entries(icpDist)) {
    if (v === 0) continue;
    md.push(`| ${k} | ${v} | ${Math.round(v / total * 100)}% |`);
  }
  md.push('');
  md.push(`## Top 10 USE_DIRECTLY-rich prospects (best substrate coverage)`);
  md.push('');
  md.push(`| # | Name | Company | USE_DIRECTLY | USE_TO_SHAPE | Email |`);
  md.push(`|---|---|---|---|---|---|`);
  topUseDirectly.forEach((p, i) => {
    md.push(`| ${i + 1} | ${p.first_name} ${p.last_name} | ${p.company} | ${p.use_directly} | ${p.use_to_shape} | ${p.confidence_color || '-'} |`);
  });
  md.push('');
  md.push(`## Worst 10 red/no-email cases (Path B refinement candidates)`);
  md.push('');
  md.push(`| # | Name | Company | Confidence | ICP verdict |`);
  md.push(`|---|---|---|---|---|`);
  worstEmail.forEach((p, i) => {
    md.push(`| ${i + 1} | ${p.first_name} ${p.last_name} | ${p.company} | ${p.confidence_color || 'no-email'} | ${p.icp_volume_verdict || '-'} |`);
  });
  md.push('');
  md.push(`## Sample composed email (best USE_DIRECTLY case)`);
  md.push('');
  if (topUseDirectly[0]) {
    const p = topUseDirectly[0];
    md.push(`**Prospect:** ${p.first_name} ${p.last_name} @ ${p.company}`);
    md.push('');
    md.push(`**Subject:** ${p.email_subject_t1}`);
    md.push('');
    md.push(`**Body:**`);
    md.push('');
    md.push('```');
    md.push(p.email_body_t1);
    md.push('```');
    md.push('');
    md.push(`**Tiers:** ${p.use_directly} USE_DIRECTLY + ${p.use_to_shape} USE_TO_SHAPE`);
    md.push(`**Substrate records pulled:** ${p.substrate_records}`);
    md.push(`**Apollo matched:** ${p.apollo_matched}`);
    md.push(`**Email confidence:** ${p.confidence_color}`);
  }
  md.push('');

  const outPath = `data/showrev/cohort-report-${runIdPrefix}-${dateStr}.md`;
  writeFileSync(outPath, md.join('\n'));
  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
