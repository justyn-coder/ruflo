import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { createClient } from '@supabase/supabase-js';
import { analyzeEmails } from './test-quality-checker.js';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
);

async function main() {
  const since = process.argv[2] || '2026-06-06';
  console.log(`\nFetching emails from sr_engine_output since ${since}...\n`);

  const { data, error } = await supabase
    .from('sr_engine_output')
    .select('first_name, last_name, company, title, icp_status, email_subject_t1, email_body_t1, email_ps_t1, influence_pattern_t1, persona_bucket')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No emails found.');
    process.exit(0);
  }

  // Deduplicate — keep latest per prospect (last_name + company)
  const seen = new Map<string, typeof data[0]>();
  for (const row of data) {
    const key = `${row.last_name}-${row.company}`.toLowerCase();
    seen.set(key, row);
  }
  const unique = Array.from(seen.values());

  console.log(`Found ${data.length} rows, ${unique.length} unique prospects.\n`);

  let totalChecks = 0;
  let totalPassed = 0;
  let totalCritical = 0;
  const summaries: { label: string; passRate: number; criticals: number }[] = [];

  for (const row of unique) {
    if (!row.email_body_t1 || row.email_body_t1 === '[Composition error]') continue;

    const email = {
      touchNumber: 1,
      subject: row.email_subject_t1 || '',
      body: row.email_body_t1 || '',
      ps: row.email_ps_t1 || '',
      wordCount: (row.email_body_t1 || '').split(/\s+/).filter(Boolean).length,
      pattern: row.influence_pattern_t1 || 'unknown',
    };

    const label = `${row.first_name} ${row.last_name} / ${row.company}`;
    const icpType = row.icp_status || 'fiber_operator';
    const isPostShow = false; // Focus 100 = cold prospecting

    const result = analyzeEmails([email], row.first_name, icpType, isPostShow, label);
    totalChecks += result.checks.length;
    totalPassed += result.checks.filter(c => c.pass).length;
    totalCritical += result.criticalFailures;
    summaries.push({ label, passRate: result.passRate, criticals: result.criticalFailures });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  QUALITY CHECK SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Prospects checked: ${summaries.length}`);
  console.log(`  Total checks: ${totalChecks}`);
  console.log(`  Passed: ${totalPassed}/${totalChecks} (${((totalPassed / totalChecks) * 100).toFixed(1)}%)`);
  console.log(`  Critical failures: ${totalCritical}`);
  console.log('');

  for (const s of summaries) {
    const icon = s.criticals > 0 ? 'FAIL' : s.passRate === 100 ? 'PASS' : 'WARN';
    console.log(`  [${icon}] ${s.label}: ${s.passRate.toFixed(0)}% (${s.criticals} critical)`);
  }
  console.log('');
}

main().catch(console.error);
