/**
 * Thesis test: run context assembly + one research persona + pattern selection
 * Stops before composition. Compares new context vs. old.
 *
 * Usage: npx tsx test-thesis.ts <prospect_id>
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function sb(path: string): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

async function main() {
  const prospectId = process.argv[2];
  if (!prospectId) { console.log('Usage: npx tsx test-thesis.ts <prospect_id>'); return; }

  // Get prospect
  const prospects = await sb(`sr_prospects?id=eq.${prospectId}&select=*`);
  if (!prospects.length) { console.log(`Prospect ${prospectId} not found`); return; }
  const p = prospects[0];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`THESIS TEST: ${p.first_name} ${p.last_name} @ ${p.company} (${p.state || 'no state'})`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. SUBSTRATE QUERY
  console.log('--- SUBSTRATE (NEW) ---');
  const titleKw = (p.title || '').match(/\b(engineer|design|permit|construction|fiber|broadband|GIS|CAD|manager|director|VP)\b/gi) || [];
  const ctxTerms = [
    p.state, 'fiber', ...titleKw.slice(0, 2),
    /tribal|nation/i.test(p.company) ? 'tribal' : '',
    /municipal|city|county/i.test(p.company) ? 'municipal' : '',
    /engineer|design/i.test(p.company + ' ' + p.title) ? 'engineering' : '',
  ].filter(Boolean).map((t: string) => t.replace(/[^a-zA-Z0-9\s]/g, '').trim()).filter((t: string) => t.length > 2);
  const terms = [...new Set(ctxTerms)].slice(0, 4).join(' & ');

  const subRows = terms ? await sb(
    `sr_brain_substrate?search_vector=fts.${encodeURIComponent(terms)}&select=title,source,published_date,content&limit=5&order=published_date.desc`
  ) : [];

  if (subRows.length) {
    for (const r of subRows) {
      console.log(`  [${r.source}] ${(r.title || '').slice(0, 60)} (${r.published_date || 'no date'})`);
      console.log(`    ${(r.content || '').slice(0, 150)}...\n`);
    }
  } else {
    console.log('  No substrate matches. Trying broader search...');
    const broadTerms = (p.state || 'fiber') + ' & broadband';
    const broadRows = await sb(
      `sr_brain_substrate?search_vector=fts.${encodeURIComponent(broadTerms)}&select=title,source,published_date&limit=3&order=published_date.desc`
    );
    for (const r of broadRows) console.log(`  [${r.source}] ${(r.title || '').slice(0, 60)}`);
  }

  // 2. SIMILAR PROSPECT RETRIEVAL (NEW)
  console.log('\n--- SIMILAR PROSPECTS (NEW) ---');
  const similar = await sb(
    `sr_engine_output?select=company,title,persona_bucket,influence_pattern_t1,intel_signal_strength,challenger_insight&research_summary=not.is.null&company=neq.${encodeURIComponent(p.company)}&limit=3&order=created_at.desc`
  );
  for (const s of similar) {
    console.log(`  ${s.company} (${s.title}) → ${s.persona_bucket} / ${s.influence_pattern_t1} / ${s.intel_signal_strength}`);
    if (s.challenger_insight) console.log(`    Insight: ${s.challenger_insight.slice(0, 120)}...`);
  }

  // 3. THOMPSON SAMPLING (NEW)
  console.log('\n--- THOMPSON SAMPLING (NEW) ---');
  const patterns = await sb(
    `sr_brain_outreach_patterns?select=pattern_name,sample_size,success_rate,confidence,works_best_for&order=success_rate.desc`
  );
  if (patterns.length) {
    const samples = patterns.map((pat: any) => {
      const alpha = Math.round(pat.success_rate * pat.sample_size) + 1;
      const beta = pat.sample_size - Math.round(pat.success_rate * pat.sample_size) + 1;
      const mean = alpha / (alpha + beta);
      const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
      const noise = (Math.random() - 0.5) * Math.sqrt(variance) * 4;
      return { name: pat.pattern_name, sample: Math.max(0, mean + noise), rate: pat.success_rate, n: pat.sample_size, best_for: pat.works_best_for };
    });
    samples.sort((a: any, b: any) => b.sample - a.sample);
    for (const s of samples) {
      console.log(`  ${s.name}: ${Math.round(s.rate * 100)}% rate, N=${s.n}${s.best_for ? ` (best for: ${s.best_for})` : ''}`);
    }
    console.log(`\n  TS recommends: ${samples[0].name}`);
  }

  // 4. COMPARE WITH OLD RESEARCH
  console.log('\n--- OLD RESEARCH OUTPUT (for comparison) ---');
  const oldDir = resolve(__dirname, '../../../data/showrev/premium/research');
  for (const persona of ['industry-analyst', 'ae-proxy', 'technical-evaluator']) {
    const file = resolve(oldDir, `${prospectId}-${persona}.json`);
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        const findings = parsed.keyFindings || [];
        const gaps = parsed.gaps || [];
        console.log(`\n  ${persona}:`);
        console.log(`    Findings: ${findings.length}`);
        if (findings[0]) console.log(`    Top: ${findings[0].slice(0, 120)}...`);
        if (gaps.length) console.log(`    Gaps: ${gaps.slice(0, 2).map((g: string) => g.slice(0, 80)).join('; ')}`);
      } catch {
        console.log(`  ${persona}: ${content.slice(0, 200)}...`);
      }
    }
  }

  // 5. SUMMARY
  console.log(`\n${'='.repeat(60)}`);
  console.log('THESIS ASSESSMENT:');
  console.log(`  Substrate chunks available: ${subRows.length}`);
  console.log(`  Similar prior dossiers: ${similar.length}`);
  console.log(`  Pattern recommendation: ${patterns.length ? 'TS active' : 'no data'}`);
  console.log(`  Improvement over baseline: research agents now start with`);
  console.log(`    ${subRows.length} industry context chunks + ${similar.length} example dossiers`);
  console.log(`    + statistically-ranked pattern selection`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => console.error('Error:', err.message));
