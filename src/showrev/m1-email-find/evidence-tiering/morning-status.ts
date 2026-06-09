/**
 * Morning status — one-command operator AM summary.
 *
 * Run: npx tsx src/showrev/m1-email-find/evidence-tiering/morning-status.ts
 *
 * Outputs to stdout AND writes data/showrev/MORNING-STATUS.md
 *
 * Includes:
 *   - Latest pipeline v2 run + outcomes
 *   - sr_company_contacts + sr_company_evidence counts
 *   - Wake-operator flag (if present)
 *   - Last 10 overnight commits
 *   - Pointer to overnight session-end write-up
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../.env') });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function sb<T>(path: string): Promise<T> {
  const res = await fetch(`${SB_URL}${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const lines: string[] = [];
  const push = (s: string = '') => { lines.push(s); console.log(s); };

  push('# MORNING STATUS');
  push('');
  push(`Generated: ${new Date().toISOString()}`);
  push('');

  // Check wake-operator flag
  if (existsSync('WAKE-OPERATOR-NOW.md')) {
    push('## 🚨 WAKE-OPERATOR FLAG SET');
    push('');
    push(readFileSync('WAKE-OPERATOR-NOW.md', 'utf-8'));
    push('');
  } else {
    push('## ✓ No wake-operator flag set');
    push('');
  }

  // Latest pipeline run summary
  push('## Latest pipeline v2 run');
  push('');
  try {
    const latestRuns = await sb<Array<{ run_id: string; count: number; min: string; max: string }>>(
      `/rest/v1/rpc/sr_engine_output_run_summary`,
    ).catch(() => null);
    if (!latestRuns) {
      // Fallback: direct query
      const rows = await sb<Array<{ run_id: string }>>(
        `/rest/v1/sr_engine_output?select=run_id,created_at&order=created_at.desc&limit=1`,
      );
      if (rows.length > 0) {
        const runId = rows[0].run_id;
        const summary = await sb<Array<{
          icp_status: string;
          confidence_color: string;
          email: string;
          icp_volume_verdict: string;
          research_summary: string;
        }>>(
          `/rest/v1/sr_engine_output?select=icp_status,confidence_color,email,icp_volume_verdict,research_summary&run_id=eq.${encodeURIComponent(runId)}&limit=500`,
        );
        const total = summary.length;
        const passed = summary.filter(r => r.icp_status === 'pass').length;
        const composed = summary.filter(r => r.email).length;
        const green = summary.filter(r => r.confidence_color === 'green').length;
        const yellow = summary.filter(r => r.confidence_color === 'yellow').length;
        const red = summary.filter(r => r.confidence_color === 'red').length;
        const noEmail = summary.filter(r => !r.email).length;
        const fit = summary.filter(r => r.icp_volume_verdict === 'fit').length;
        const leaningFit = summary.filter(r => r.icp_volume_verdict === 'leaning_fit').length;
        let specific = 0;
        let generalized = 0;
        let apolloCredits = 0;
        for (const r of summary) {
          try {
            const rs = JSON.parse(r.research_summary || '{}');
            if (rs.composer_mode === 'specific') specific++;
            else if (rs.composer_mode === 'generalized') generalized++;
            apolloCredits += rs.apollo_credits_used || 0;
          } catch { /* ignore */ }
        }
        push(`**Run ID:** \`${runId}\``);
        push(`**Total:** ${total} | **ICP passed:** ${passed} | **Composed:** ${composed}`);
        push(`**Confidence:** green=${green} yellow=${yellow} red=${red} no-email=${noEmail}`);
        push(`**ICP:** fit=${fit} leaning_fit=${leaningFit}`);
        push(`**Mode:** specific=${specific} generalized=${generalized}`);
        push(`**Apollo credits:** ${apolloCredits} (~$${(apolloCredits * 0.002).toFixed(2)})`);
      }
    }
  } catch (err) {
    push(`(error querying: ${(err as Error).message})`);
  }
  push('');

  // sr_company_contacts + evidence health
  push('## Evidence base health');
  push('');
  try {
    const contactsCount = await sb<Array<{ count: number }>>(`/rest/v1/sr_company_contacts?select=count`, ).catch(() => null);
    const contactsWithEmail = await sb<Array<{ count: number }>>(`/rest/v1/sr_company_contacts?select=count&email=not.is.null`).catch(() => null);
    const evidenceCount = await sb<Array<{ count: number }>>(`/rest/v1/sr_company_evidence?select=count`).catch(() => null);
    const substrateTagged = await sb<Array<{ count: number }>>(`/rest/v1/sr_brain_substrate?select=count&metadata=not.is.null`).catch(() => null);

    // PostgREST may return ?Prefer: count=exact; we'll just count via length
    const directCounts = await sb<Array<unknown>>(`/rest/v1/sr_company_contacts?limit=10000`).catch(() => []);
    push(`- **sr_company_contacts:** ${directCounts.length}+ rows`);

    const emailRows = await sb<Array<unknown>>(`/rest/v1/sr_company_contacts?email=not.is.null&limit=10000`).catch(() => []);
    push(`- **with verified email:** ${emailRows.length}`);

    const evidenceRows = await sb<Array<unknown>>(`/rest/v1/sr_company_evidence?limit=10000`).catch(() => []);
    push(`- **sr_company_evidence:** ${evidenceRows.length}+ rows`);

    const useDirectlyRows = await sb<Array<unknown>>(`/rest/v1/sr_company_evidence?source_kind=in.(substrate_quoted,apollo_cross,web_research_dated,csv_input,manual,fcc_bdc)&limit=10000`).catch(() => []);
    push(`- **USE_DIRECTLY rows:** ${useDirectlyRows.length}`);

    const substrateRows = await sb<Array<unknown>>(`/rest/v1/sr_brain_substrate?metadata=not.is.null&limit=10000`).catch(() => []);
    push(`- **sr_brain_substrate tagged:** ${substrateRows.length} chunks`);
  } catch (err) {
    push(`(error: ${(err as Error).message})`);
  }
  push('');

  // Recent commits
  push('## Overnight commits');
  push('');
  push('```');
  try {
    const log = execSync('git log --oneline --since="6 hours ago"', { encoding: 'utf-8' }).trim();
    push(log || '(no commits in last 6 hours)');
  } catch {
    push('(git log error)');
  }
  push('```');
  push('');

  // Pointer to session end + overnight plan
  push('## Read next');
  push('');
  push('- **Overnight plan + boundaries:** `data/showrev/OVERNIGHT-PLAN-2026-06-09.md`');
  push('- **Full session-end write-up:** `data/showrev/_session_transcripts/SESSION_END_2026-06-09_OVERNIGHT.md`');
  push('- **Latest cohort report:** look in `data/showrev/cohort-report-*.md`');
  push('- **AM decisions needed:** see SESSION_END "AM operator decisions needed" section');
  push('');

  writeFileSync('data/showrev/MORNING-STATUS.md', lines.join('\n'));
  console.log('');
  console.log('Wrote data/showrev/MORNING-STATUS.md');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
