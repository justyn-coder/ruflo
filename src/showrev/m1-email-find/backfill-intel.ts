#!/usr/bin/env npx tsx

import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('.env', import.meta.url).pathname });

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { structureIntelReport } from './intel-structurer.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function supaGet(query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sr_engine_output?${query}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function supaPatch(id: string, data: any): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sr_engine_output?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function run() {
  // Get all records missing intel
  const rows = await supaGet('company_summary=is.null&select=id,prospect_id,first_name,last_name,company,email');
  const rows2 = await supaGet("company_summary=eq.&select=id,prospect_id,first_name,last_name,company,email");
  const allMissing = [...rows, ...rows2];

  console.log(`\nRecords missing intel: ${allMissing.length}\n`);

  const outputDir = resolve('data/showrev/premium/output');
  let filled = 0, skipped = 0, failed = 0;

  for (const row of allMissing) {
    // Find the JSON output file by email match
    const files = readdirSync(outputDir).filter(f => f.endsWith('-output.json'));
    let matchFile: string | null = null;

    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(resolve(outputDir, f), 'utf-8'));
        if (data.prospect?.email?.toLowerCase() === row.email?.toLowerCase()) {
          matchFile = f;
          break;
        }
      } catch {}
    }

    if (!matchFile) {
      console.log(`  - ${row.first_name} ${row.last_name}: no JSON output found`);
      skipped++;
      continue;
    }

    const data = JSON.parse(readFileSync(resolve(outputDir, matchFile), 'utf-8'));
    const personaResults: Record<string, string> = {
      'Industry Analyst': data.personaFindings?.analyst || '',
      'AE Proxy': data.personaFindings?.aeProxy || '',
      'Technical Evaluator': data.personaFindings?.techEval || '',
    };

    if (!personaResults['Industry Analyst'] && !personaResults['AE Proxy']) {
      console.log(`  - ${row.first_name} ${row.last_name}: no research data in JSON`);
      skipped++;
      continue;
    }

    console.log(`  ⏳ ${row.first_name} ${row.last_name} @ ${row.company}...`);

    try {
      const result = await structureIntelReport(
        personaResults,
        data.crossExamInsights || '',
        { id: row.prospect_id, firstName: row.first_name, lastName: row.last_name, email: row.email, company: row.company, title: '', state: '', icpStatus: 'hold', icpReason: '', grade: 'Ungraded' as any, tier: 'D' as any, aeNotes: '', hasAeNotes: false, leadType: '', isDuplicate: false, phone: '', city: '', emailCorrected: false },
        [],
        [],
        '',
        'claude-sonnet-4-6',
      );

      const d = result.dossier;
      const updates: Record<string, string> = {};

      if (d?.company?.showrev_company_summary) updates.company_summary = d.company.showrev_company_summary;
      if (d?.company?.showrev_company_size) updates.company_size = d.company.showrev_company_size;
      if (d?.company?.showrev_fiber_activities) updates.fiber_activities = d.company.showrev_fiber_activities;
      if (d?.company?.showrev_bead_status) updates.bead_status = d.company.showrev_bead_status;
      if (d?.company?.showrev_growth_signals) updates.growth_signals = d.company.showrev_growth_signals;
      if (d?.company?.showrev_key_projects) updates.key_projects = d.company.showrev_key_projects;
      if (d?.company?.showrev_external_deadlines) updates.external_deadlines = d.company.showrev_external_deadlines;
      if (d?.company?.showrev_competitive_landscape) updates.known_tools = d.company.showrev_competitive_landscape;
      if (d?.company?.showrev_recent_news) updates.market_moment = d.company.showrev_recent_news;
      if (d?.salesIntel?.showrev_signal_strength) updates.intel_signal_strength = d.salesIntel.showrev_signal_strength;
      if (d?.salesIntel?.showrev_fit_rationale) updates.intel_fit_rationale = d.salesIntel.showrev_fit_rationale;
      if (d?.salesIntel?.showrev_next_best_action) updates.intel_next_action = d.salesIntel.showrev_next_best_action;
      if (d?.salesIntel?.showrev_buying_timeline) updates.intel_buying_timeline = d.salesIntel.showrev_buying_timeline;
      if (d?.salesIntel?.showrev_risk_factors) updates.intel_risk_factors = d.salesIntel.showrev_risk_factors;
      if (d?.contact?.showrev_talking_points) updates.intel_talking_points = d.contact.showrev_talking_points;
      if (d?.contact?.showrev_decision_authority) updates.intel_decision_authority = d.contact.showrev_decision_authority;
      if (d?.contact?.showrev_likely_objections) updates.likely_objections = d.contact.showrev_likely_objections;
      if (d?.contact?.showrev_persona_classification) updates.persona_bucket = d.contact.showrev_persona_classification;
      if (d?.salesIntel?.showrev_challenger_insight) updates.challenger_insight = d.salesIntel.showrev_challenger_insight;
      if (d?.meta?.showrev_research_confidence) updates.research_confidence = d.meta.showrev_research_confidence;

      if (Object.keys(updates).length > 0) {
        const ok = await supaPatch(row.id, updates);
        if (ok) {
          filled++;
          console.log(`  ✓ ${row.first_name} ${row.last_name}: ${Object.keys(updates).length} fields`);
        } else {
          failed++;
          console.log(`  ✗ ${row.first_name} ${row.last_name}: Supabase write failed`);
        }
      } else {
        console.log(`  - ${row.first_name} ${row.last_name}: structurer returned empty`);
        skipped++;
      }
    } catch (err: any) {
      failed++;
      console.log(`  ✗ ${row.first_name} ${row.last_name}: ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`\n=== INTEL BACKFILL COMPLETE ===`);
  console.log(`Filled: ${filled}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

run().catch(e => console.error(e));
