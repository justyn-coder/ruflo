/**
 * Prioritizer — scores and tiers the P2 cold prospect list before research.
 *
 * Input: CSV of Fiber Connect attendees (name, company, title, state)
 * Output: Tiered list in sr_prospects with priority_tier (A/B/C/Skip)
 *
 * Scoring signals:
 * 1. Company type match (A&E firm or fiber operator = ICP)
 * 2. Role/title match (engineering, design, VP, director = decision-relevant)
 * 3. Brain entity match (company already in our entity graph = warm)
 * 4. Substrate match (company mentioned in podcasts/blogs = industry presence)
 * 5. BEAD sub-grantee match (company has BEAD awards = active builder)
 * 6. Company scale signals (from title keywords — "VP" implies larger firm)
 *
 * Usage:
 *   npx tsx prioritizer.ts score attendees.csv
 *   npx tsx prioritizer.ts stats
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function sbHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
function sbUrl(): string { return process.env.NEXT_PUBLIC_SUPABASE_URL || ''; }

// --- ICP detection from company name + title ---

const AE_INDICATORS = [
  /engineer/i, /design/i, /A&E/i, /consult/i, /drafting/i, /CAD/i,
  /surveying/i, /construction.*services/i, /infrastructure.*services/i,
  /telecom.*services/i, /solutions/i, /technical.*services/i,
];

const OPERATOR_INDICATORS = [
  /broadband/i, /telecom(?!.*services)/i, /communications/i, /fiber/i,
  /electric.*coop/i, /utility/i, /municipal/i, /gig\b/i, /connect\b/i,
];

const SKIP_INDICATORS = [
  /equipment/i, /vendor/i, /software/i, /magazine/i, /media/i,
  /association/i, /university/i, /government/i, /law\b/i, /legal/i,
  /financial/i, /bank/i, /insurance/i, /real estate/i,
];

const ICP_ROLES = [
  /VP/i, /director/i, /manager/i, /engineer/i, /designer/i,
  /president/i, /CEO/i, /COO/i, /CTO/i, /SVP/i, /head of/i,
  /principal/i, /partner/i, /superintendent/i, /coordinator/i,
  /lead/i, /supervisor/i, /chief/i, /GM\b/i, /general manager/i,
];

const NON_ICP_ROLES = [
  /marketing/i, /sales(?!.*engineer)/i, /HR/i, /human resources/i,
  /legal/i, /counsel/i, /admin/i, /receptionist/i, /intern/i,
  /student/i, /analyst(?!.*fiber)/i, /recruiter/i, /accountant/i,
];

function detectICP(company: string, title: string): { type: 'ae' | 'operator' | 'skip' | 'unknown'; confidence: number } {
  const combined = `${company} ${title}`;

  if (SKIP_INDICATORS.some(p => p.test(company))) return { type: 'skip', confidence: 0.8 };
  if (NON_ICP_ROLES.some(p => p.test(title))) return { type: 'skip', confidence: 0.6 };

  const aeScore = AE_INDICATORS.filter(p => p.test(combined)).length;
  const opScore = OPERATOR_INDICATORS.filter(p => p.test(combined)).length;

  if (aeScore > opScore && aeScore >= 1) return { type: 'ae', confidence: Math.min(aeScore * 0.3, 0.9) };
  if (opScore > aeScore && opScore >= 1) return { type: 'operator', confidence: Math.min(opScore * 0.3, 0.9) };
  if (aeScore === opScore && aeScore >= 1) return { type: 'ae', confidence: 0.4 };

  return { type: 'unknown', confidence: 0 };
}

function detectRoleRelevance(title: string): number {
  if (!title) return 0;
  if (ICP_ROLES.some(p => p.test(title))) return 1;
  if (NON_ICP_ROLES.some(p => p.test(title))) return -1;
  return 0.5;
}

// --- Score a prospect against Brain + substrate ---

async function scoreBrainMatch(company: string): Promise<number> {
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/sr_engine_output?company=ilike.*${encodeURIComponent(company.slice(0, 30))}*&select=company&limit=1`,
      { headers: sbHeaders() }
    );
    if (res.ok) {
      const rows = await res.json();
      return rows.length > 0 ? 2 : 0;
    }
  } catch {}
  return 0;
}

async function scoreSubstrateMatch(company: string, state: string): Promise<number> {
  try {
    const terms = [company.replace(/[^a-zA-Z0-9\s]/g, '').trim(), state].filter(Boolean).join(' & ');
    if (!terms) return 0;
    const res = await fetch(
      `${sbUrl()}/rest/v1/sr_brain_substrate?search_vector=fts.${encodeURIComponent(terms)}&select=id&limit=1`,
      { headers: sbHeaders() }
    );
    if (res.ok) {
      const rows = await res.json();
      return rows.length > 0 ? 1 : 0;
    }
  } catch {}
  return 0;
}

async function scoreBEADMatch(company: string): Promise<number> {
  try {
    const res = await fetch(
      `${sbUrl()}/rest/v1/sr_brain_substrate?source=eq.ntia-bead-subgrantees&search_vector=fts.${encodeURIComponent(company.replace(/[^a-zA-Z0-9\s]/g, ''))}&select=id&limit=1`,
      { headers: sbHeaders() }
    );
    if (res.ok) {
      const rows = await res.json();
      return rows.length > 0 ? 3 : 0;
    }
  } catch {}
  return 0;
}

// --- Main scoring function ---

interface ProspectScore {
  name: string;
  company: string;
  title: string;
  state: string;
  icpType: string;
  icpConfidence: number;
  roleRelevance: number;
  brainMatch: number;
  substrateMatch: number;
  beadMatch: number;
  totalScore: number;
  tier: 'A' | 'B' | 'C' | 'Skip';
}

function assignTier(score: number, icpType: string): 'A' | 'B' | 'C' | 'Skip' {
  if (icpType === 'skip') return 'Skip';
  if (score >= 5) return 'A';
  if (score >= 3) return 'B';
  if (score >= 1) return 'C';
  return 'Skip';
}

async function scoreProspect(name: string, company: string, title: string, state: string): Promise<ProspectScore> {
  const icp = detectICP(company, title);
  const roleRelevance = detectRoleRelevance(title);

  // Skip non-ICP early — don't waste Brain/substrate queries
  if (icp.type === 'skip' || roleRelevance < 0) {
    return {
      name, company, title, state,
      icpType: icp.type, icpConfidence: icp.confidence,
      roleRelevance, brainMatch: 0, substrateMatch: 0, beadMatch: 0,
      totalScore: 0, tier: 'Skip',
    };
  }

  const [brainMatch, substrateMatch, beadMatch] = await Promise.all([
    scoreBrainMatch(company),
    scoreSubstrateMatch(company, state),
    scoreBEADMatch(company),
  ]);

  const totalScore = (icp.confidence * 3) + (roleRelevance * 2) + brainMatch + substrateMatch + beadMatch;

  return {
    name, company, title, state,
    icpType: icp.type, icpConfidence: icp.confidence,
    roleRelevance, brainMatch, substrateMatch, beadMatch,
    totalScore, tier: assignTier(totalScore, icp.type),
  };
}

// --- CSV parsing ---

function parseCSV(filepath: string): Array<{ name: string; company: string; title: string; state: string }> {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const nameIdx = headers.findIndex(h => h.includes('name') && !h.includes('company'));
  const firstIdx = headers.findIndex(h => h.includes('first'));
  const lastIdx = headers.findIndex(h => h.includes('last'));
  const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('organization'));
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('role') || h.includes('position'));
  const stateIdx = headers.findIndex(h => h.includes('state') || h.includes('province'));

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    const name = nameIdx >= 0 ? cols[nameIdx] : `${cols[firstIdx] || ''} ${cols[lastIdx] || ''}`.trim();
    return {
      name,
      company: cols[companyIdx] || '',
      title: cols[titleIdx] || '',
      state: cols[stateIdx] || '',
    };
  }).filter(p => p.name && p.company);
}

// --- CLI ---

async function main() {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'score': {
      const csvPath = process.argv[3];
      if (!csvPath) { console.log('Usage: npx tsx prioritizer.ts score <attendees.csv>'); return; }

      const prospects = parseCSV(resolve(csvPath));
      console.log(`Scoring ${prospects.length} prospects...\n`);

      const results: ProspectScore[] = [];
      for (let i = 0; i < prospects.length; i++) {
        const p = prospects[i];
        const score = await scoreProspect(p.name, p.company, p.title, p.state);
        results.push(score);
        if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${prospects.length} scored`);
      }

      // Summary
      const tiers = { A: 0, B: 0, C: 0, Skip: 0 };
      const icpTypes = { ae: 0, operator: 0, skip: 0, unknown: 0 };
      for (const r of results) {
        tiers[r.tier]++;
        icpTypes[r.icpType as keyof typeof icpTypes]++;
      }

      console.log('\n=== PRIORITIZATION RESULTS ===\n');
      console.log(`Total: ${results.length}`);
      console.log(`Tier A (research deeply): ${tiers.A}`);
      console.log(`Tier B (standard research): ${tiers.B}`);
      console.log(`Tier C (lean research): ${tiers.C}`);
      console.log(`Skip: ${tiers.Skip}`);
      console.log(`\nICP breakdown: ${icpTypes.ae} A&E, ${icpTypes.operator} Operator, ${icpTypes.unknown} Unknown, ${icpTypes.skip} Skip`);

      // Print top 20 Tier A
      const tierA = results.filter(r => r.tier === 'A').sort((a, b) => b.totalScore - a.totalScore);
      if (tierA.length > 0) {
        console.log(`\nTop Tier A prospects:`);
        for (const r of tierA.slice(0, 20)) {
          console.log(`  [${r.totalScore.toFixed(1)}] ${r.name} — ${r.title} @ ${r.company} (${r.icpType}${r.beadMatch ? ', BEAD' : ''}${r.brainMatch ? ', Brain' : ''})`);
        }
      }

      break;
    }

    default:
      console.log(`
Prioritizer — tier the P2 cold prospect list before research

Usage:
  npx tsx prioritizer.ts score <attendees.csv>    Score and tier all prospects

Tiers:
  A = research deeply (ICP match + role match + Brain/BEAD signals)
  B = standard research (ICP match + role match)
  C = lean research (possible ICP, weaker signals)
  Skip = not ICP or wrong role

Scoring: ICP type (0-3) + role relevance (0-2) + Brain match (0-2) + substrate (0-1) + BEAD (0-3)
`);
  }
}

main().catch(err => console.error('Error:', err.message));
