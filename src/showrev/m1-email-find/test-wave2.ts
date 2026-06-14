import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '.env') });

import { icpGate, type ICPResult } from './icp-gate.js';

interface TestRow {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state: string;
  email?: string;
  aeNotes?: string;
}

function parseCSV(path: string): TestRow[] {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    fields.push(current.trim());
    return {
      firstName: fields[headers.indexOf('first_name')] || '',
      lastName: fields[headers.indexOf('last_name')] || '',
      company: fields[headers.indexOf('company')] || '',
      title: fields[headers.indexOf('title')] || '',
      state: fields[headers.indexOf('state')] || '',
      email: fields[headers.indexOf('email')] || undefined,
      aeNotes: fields[headers.indexOf('ae_notes')] || undefined,
    };
  });
}

async function runICPTest(label: string, rows: TestRow[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ICP GATE TEST: ${label} (${rows.length} contacts)`);
  console.log(`${'='.repeat(70)}\n`);

  const results: Array<{ row: TestRow; result: ICPResult }> = [];

  for (const row of rows) {
    const result = await icpGate(row.company, row.title, false);
    results.push({ row, result });

    const icon = result.verdict === 'pass' ? '✅' : '❌';
    const conf = (result.confidence * 100).toFixed(0);
    console.log(
      `${icon} ${row.firstName} ${row.lastName} | ${row.company}` +
      `\n   Title: ${row.title}` +
      `\n   ICP: ${result.icpType} (${result.method}, ${conf}% confidence)` +
      `\n   Reason: ${result.reason}` +
      (row.aeNotes ? `\n   aeNotes: "${row.aeNotes.slice(0, 60)}${row.aeNotes.length > 60 ? '...' : ''}"` : '') +
      `\n`
    );
  }

  const passed = results.filter(r => r.result.verdict === 'pass');
  const rejected = results.filter(r => r.result.verdict === 'reject');
  const fiberOps = results.filter(r => r.result.icpType === 'fiber_operator');
  const aeFirms = results.filter(r => r.result.icpType === 'ae_firm');
  const nonIcp = results.filter(r => r.result.icpType === 'non_icp');
  const regexCount = results.filter(r => r.result.method === 'regex').length;
  const llmCount = results.filter(r => r.result.method === 'llm').length;

  console.log(`\n--- Summary ---`);
  console.log(`  Total: ${results.length}`);
  console.log(`  Passed: ${passed.length} | Rejected: ${rejected.length}`);
  console.log(`  fiber_operator: ${fiberOps.length} | ae_firm: ${aeFirms.length} | non_icp: ${nonIcp.length}`);
  console.log(`  Method: regex=${regexCount} | llm=${llmCount}`);

  return results;
}

async function main() {
  console.log(`\nWave 2 System Test — ${new Date().toISOString()}\n`);

  const syntheticPath = resolve(__dirname, '../../../data/showrev/test/wave2-icp-test.csv');
  const focus100Path = resolve(__dirname, '../../../data/showrev/test/wave2-focus100-test.csv');

  const syntheticRows = parseCSV(syntheticPath);
  const focus100Rows = parseCSV(focus100Path);

  console.log(`Loaded: ${syntheticRows.length} synthetic + ${focus100Rows.length} Focus 100 contacts`);

  const syntheticResults = await runICPTest('Synthetic (edge cases)', syntheticRows);
  const focus100Results = await runICPTest('Focus 100 (real prospects)', focus100Rows);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  EDGE CASE VERIFICATION`);
  console.log(`${'='.repeat(70)}\n`);

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  const towerEngSolutions = syntheticResults.find(r => r.row.company === 'Tower Engineering Solutions');
  checks.push({
    name: 'Tower A&E rejection',
    pass: towerEngSolutions?.result.verdict === 'reject',
    detail: `Tower Engineering Solutions: ${towerEngSolutions?.result.verdict} (${towerEngSolutions?.result.icpType})`,
  });

  const osmose = syntheticResults.find(r => r.row.company === 'Osmose Utilities Services');
  checks.push({
    name: 'Osmose falls to LLM (aeScore=0)',
    pass: osmose?.result.method === 'llm',
    detail: `Osmose: method=${osmose?.result.method}, verdict=${osmose?.result.verdict}`,
  });

  const fiberTowerAssoc = syntheticResults.find(r => r.row.company === 'Fiber Tower Engineering Associates');
  checks.push({
    name: 'Fiber override on tower+fiber company',
    pass: fiberTowerAssoc?.result.verdict === 'pass',
    detail: `Fiber Tower Engineering: ${fiberTowerAssoc?.result.verdict} (${fiberTowerAssoc?.result.icpType})`,
  });

  const techWave = syntheticResults.find(r => r.row.company === 'TechWave Media Group');
  checks.push({
    name: 'Non-ICP media company rejected',
    pass: techWave?.result.verdict === 'reject',
    detail: `TechWave Media: ${techWave?.result.verdict} (${techWave?.result.icpType})`,
  });

  const midwestFiber = syntheticResults.find(r => r.row.company === 'Midwest Fiber Networks');
  checks.push({
    name: 'Fiber operator with booth notes passes',
    pass: midwestFiber?.result.verdict === 'pass' && midwestFiber?.result.icpType === 'fiber_operator',
    detail: `Midwest Fiber: ${midwestFiber?.result.verdict} (${midwestFiber?.result.icpType}), aeNotes present: ${!!midwestFiber?.row.aeNotes}`,
  });

  const apexDesign = syntheticResults.find(r => r.row.company === 'Apex Design Group');
  checks.push({
    name: 'A&E firm passes (design indicator)',
    pass: apexDesign?.result.verdict === 'pass' && apexDesign?.result.icpType === 'ae_firm',
    detail: `Apex Design Group: ${apexDesign?.result.verdict} (${apexDesign?.result.icpType})`,
  });

  const focus100AllPass = focus100Results.every(r => r.result.verdict === 'pass');
  checks.push({
    name: 'All Focus 100 prospects pass (curated list)',
    pass: focus100AllPass,
    detail: `${focus100Results.filter(r => r.result.verdict === 'pass').length}/${focus100Results.length} passed`,
  });

  const focus100NoErrors = focus100Results.every(r => r.result.confidence > 0);
  checks.push({
    name: 'No API errors (all confidence > 0)',
    pass: focus100NoErrors,
    detail: `${focus100Results.filter(r => r.result.confidence > 0).length}/${focus100Results.length} have real confidence`,
  });

  console.log(`Edge case results:\n`);
  for (const check of checks) {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
    console.log(`     ${check.detail}\n`);
  }

  const passCount = checks.filter(c => c.pass).length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULT: ${passCount}/${checks.length} checks passed`);
  if (passCount === checks.length) {
    console.log(`  STATUS: ALL CHECKS PASSED`);
  } else {
    console.log(`  STATUS: ${checks.length - passCount} FAILURES — investigate above`);
  }
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
