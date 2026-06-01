#!/usr/bin/env npx tsx

import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('.env', import.meta.url).pathname });

import { callLLM } from './llm-client.js';
import { detectClaims, assessClaimSafety } from './verify-facts.js';
import { buildTimProxyPrompt } from './judges.js';
import { runMechanicalChecks } from './judge.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function fetchRows(filter?: string): Promise<any[]> {
  const query = filter || '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sr_engine_output?${query}&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

interface ValidationReport {
  prospectId: string;
  name: string;
  company: string;
  factClaims: { text: string; type: string; safe: boolean }[];
  unsafeClaimCount: number;
  timProxy: { pass: boolean; score: number; mustFix: string[]; wouldSend: string } | null;
  mechanical: { passed: boolean; failures: string[]; warnings: string[] };
  overallVerdict: 'CLEAR' | 'NEEDS_REVIEW' | 'BLOCK';
}

async function validateProspect(row: any): Promise<ValidationReport> {
  const name = `${row.first_name} ${row.last_name}`;
  const body = row.email_body_t1 || '';
  const subject = row.email_subject_t1 || '';
  const ps = row.email_ps_t1 || '';
  const micrositeSlug = row.microsite_slug || '';

  console.log(`\n  ┌─ ${name} @ ${row.company}`);

  // 1. Fact claims
  console.log(`  │  Fact verification...`);
  const claims = detectClaims(body + ' ' + ps);
  const assessed = claims.map(c => {
    const result = assessClaimSafety(c.text, c.type, 3, false);
    return { text: c.text, type: c.type, safe: result.safeForEmail };
  });
  const unsafe = assessed.filter(c => !c.safe);

  if (unsafe.length > 0) {
    console.log(`  │  ⚠ ${unsafe.length} unverified claims:`);
    for (const c of unsafe) console.log(`  │    [${c.type}] "${c.text.slice(0, 60)}"`);
  } else {
    console.log(`  │  ✓ ${claims.length} claims, none flagged`);
  }

  // 2. Tim Proxy
  console.log(`  │  Tim Proxy judge...`);
  let timVerdict: any = null;
  try {
    const ctx = `${name}, ${row.title || ''} at ${row.company}`;
    const prompt = buildTimProxyPrompt(subject, body, ps, ctx, 1);
    const raw = await callLLM(prompt, { model: 'claude-sonnet-4-6', timeoutMs: 120000, label: 'tim-proxy' });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    timVerdict = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (timVerdict) {
      const icon = timVerdict.pass ? '✓' : '⚠';
      console.log(`  │  ${icon} Tim: ${timVerdict.pass ? 'PASS' : 'FAIL'} (${timVerdict.score}/10)`);
      if (timVerdict.mustFix?.length > 0) {
        for (const fix of timVerdict.mustFix) console.log(`  │    Fix: ${fix.slice(0, 80)}`);
      }
    }
  } catch (err: any) {
    console.log(`  │  ⚠ Tim Proxy failed: ${err.message?.slice(0, 60)}`);
  }

  // 3. Mechanical checks
  console.log(`  │  Mechanical checks...`);
  const mech = runMechanicalChecks(body, subject, ps, '', '', row.first_name || '', micrositeSlug);
  if (mech.passed) {
    console.log(`  │  ✓ Mechanical passed${mech.warnings.length > 0 ? ` (${mech.warnings.length} warnings)` : ''}`);
  } else {
    console.log(`  │  ⚠ Mechanical: ${mech.failures.join(', ')}`);
  }

  // Overall
  let verdict: 'CLEAR' | 'NEEDS_REVIEW' | 'BLOCK' = 'CLEAR';
  if (unsafe.length > 0) verdict = 'NEEDS_REVIEW';
  if (timVerdict && !timVerdict.pass && timVerdict.score < 5) verdict = 'BLOCK';
  if (!mech.passed && mech.failures.some(f => f.includes('offshore') || f.includes('tower'))) verdict = 'BLOCK';

  const icon = verdict === 'CLEAR' ? '✅' : verdict === 'NEEDS_REVIEW' ? '⚠️' : '🛑';
  console.log(`  └─ ${icon} ${verdict}`);

  return {
    prospectId: row.prospect_id,
    name,
    company: row.company,
    factClaims: assessed,
    unsafeClaimCount: unsafe.length,
    timProxy: timVerdict ? {
      pass: timVerdict.pass,
      score: timVerdict.score,
      mustFix: timVerdict.mustFix || [],
      wouldSend: timVerdict.wouldYouSendThis || '',
    } : null,
    mechanical: mech,
    overallVerdict: verdict,
  };
}

async function main() {
  const target = process.argv[2] || 'icp-pass';

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Validation Gates — Read-Only (no data changes)  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let rows: any[];
  if (target === 'icp-pass') {
    rows = await fetchRows('icp_status=eq.pass&email_body_t1=not.is.null');
    if (rows.length === 0) rows = await fetchRows('email_body_t1=not.is.null');
  } else if (target === 'all') {
    rows = await fetchRows('email_body_t1=not.is.null');
  } else {
    rows = await fetchRows(`prospect_id=eq.${target}`);
  }

  console.log(`Validating ${rows.length} prospects...\n`);

  const reports: ValidationReport[] = [];
  for (const row of rows) {
    const report = await validateProspect(row);
    reports.push(report);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Validation Summary                               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const clear = reports.filter(r => r.overallVerdict === 'CLEAR');
  const review = reports.filter(r => r.overallVerdict === 'NEEDS_REVIEW');
  const block = reports.filter(r => r.overallVerdict === 'BLOCK');

  console.log(`  CLEAR:        ${clear.length}`);
  console.log(`  NEEDS REVIEW: ${review.length}`);
  console.log(`  BLOCK:        ${block.length}`);

  if (review.length > 0) {
    console.log('\n  --- NEEDS REVIEW ---');
    for (const r of review) {
      console.log(`  ${r.name} @ ${r.company}: ${r.unsafeClaimCount} unverified claims`);
    }
  }

  if (block.length > 0) {
    console.log('\n  --- BLOCKED ---');
    for (const r of block) {
      console.log(`  ${r.name} @ ${r.company}: ${r.timProxy?.mustFix?.join('; ') || r.mechanical.failures.join('; ')}`);
    }
  }
}

main().catch(e => console.error(e));
