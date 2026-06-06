#!/usr/bin/env npx tsx

import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('.env', import.meta.url).pathname });

import { callLLM } from './llm-client.js';
import { verifyAllClaims } from './semantic-verifier.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

async function run() {
  const res = await fetch(`${url}/rest/v1/sr_engine_output?verified=eq.false&select=id,prospect_id,first_name,last_name,company,email_body_t1,email_ps_t1,company_summary,intel_signal_strength`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
  });
  const rows = await res.json();
  console.log(`Verifying ${rows.length} prospects...\n`);

  let passed = 0, flagged = 0;

  for (const row of rows) {
    const text = [row.email_body_t1 || '', row.email_ps_t1 || '', row.company_summary || ''].join(' ');
    console.log(`--- ${row.first_name || ''} ${row.last_name || ''} @ ${row.company || ''}`);

    const report = await verifyAllClaims(text, row.company || '', row.prospect_id);
    const isClean = report.blockers.length === 0;

    await fetch(`${url}/rest/v1/sr_engine_output?id=eq.${row.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ verified: isClean, verification_report: report }),
    });

    if (isClean) {
      passed++;
      console.log(`  PASS (${report.totalClaims} claims, ${report.verified} verified)\n`);
    } else {
      flagged++;
      console.log(`  FLAG: ${report.blockers.join('; ')}\n`);
    }
  }

  console.log(`\n=== VERIFICATION COMPLETE ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Flagged: ${flagged}`);
  console.log(`Total: ${rows.length}`);
}

run().catch(e => console.error(e));
