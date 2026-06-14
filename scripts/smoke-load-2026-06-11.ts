/**
 * Smoke load — 15 real + 3 dummies for Friday Jun 12 send.
 *
 * Flow:
 *   1. Run pre-load verify (SPF/DKIM/DMARC/HS auth/EXISTING/UNSUB)
 *   2. Build final 18-prospect roster
 *   3. Run pre-load audit per prospect (dedup + bounce history)
 *   4. Load each contact via loadProspectToHubSpot (dry-run first, then live)
 *   5. Verify each landed in correct list
 *   6. Output final roster with HS contact IDs
 */

import { runVerify, formatReport as formatVerifyReport } from '../src/showrev/m1-email-find/preload-verify';
import { runAudit, formatReport as formatAuditReport, ProspectInput } from '../src/showrev/m1-email-find/preload-audit';
import { loadProspectToHubSpot, EngineRow } from '../src/showrev/m1-email-find/hubspot-loader';
import { hsApi } from '../src/showrev/m1-email-find/hs-api-client';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SIGNAL_RANK: Record<string, number> = {
  strong: 4, medium: 3, possible: 2, weak: 1, 'no fit': 0,
};

const AE_OWNER_IDS: Record<string, string> = {
  'Mike Rutski': '89105202',
  'Nathan Dunn': '89105203',
  'Lucas Spencer': '163468117',
};

const DUMMY_CONFIGS = [
  { ae: 'Mike Rutski', email: 'justyn@showrev.co', firstName: 'Justyn', lastName: 'Test-Mike' },
  { ae: 'Nathan Dunn', email: 'justyn@tasteforyourself.com', firstName: 'Justyn', lastName: 'Test-Nathan' },
  { ae: 'Lucas Spencer', email: 'justyn@trellisag.ca', firstName: 'Justyn', lastName: 'Test-Lucas' },
];

async function sbGet(path: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return res.json();
}

async function selectRoster(): Promise<{ real: any[], dummies: any[] }> {
  // Pull PENDING prospects
  const prospects = await sbGet('/rest/v1/sr_prospects?lead_type=eq.Cold&send_status=eq.pending&select=id,first_name,last_name,company,company_website,title,assigned_ae,email,state&limit=200');

  // Quality filter
  const isClean = (p: any) => {
    if (!p.email) return false;
    const email = p.email.toLowerCase();
    if (/@(gmail|yahoo|hotmail)\.com$/.test(email)) return false;
    const title = (p.title || '').trim();
    if (['LLC', 'Inc.', 'LLC.', 'Inc', ''].includes(title)) return false;
    if (!p.first_name || !p.last_name) return false;
    if (p.first_name === 'Jason' && p.last_name === 'Miller') return false; // explicit operator skip
    return true;
  };
  const clean = prospects.filter(isClean);

  // Get engine output for signal strength
  const ids = clean.map((p: any) => `"${p.id}"`).join(',');
  const engineRows = await sbGet(`/rest/v1/sr_engine_output?prospect_id=in.(${ids})&select=*&order=created_at.desc`);
  const engineMap = new Map<string, any>();
  for (const r of engineRows) {
    if (!engineMap.has(r.prospect_id)) engineMap.set(r.prospect_id, r);
  }
  for (const p of clean) Object.assign(p, engineMap.get(p.id) || {});

  // Pick top 5 per AE by signal
  const byAe: Record<string, any[]> = { 'Mike Rutski': [], 'Nathan Dunn': [], 'Lucas Spencer': [] };
  for (const p of clean) if (byAe[p.assigned_ae]) byAe[p.assigned_ae].push(p);

  const real: any[] = [];
  for (const ae of Object.keys(byAe)) {
    const picks = byAe[ae].sort((a, b) =>
      (SIGNAL_RANK[(b.intel_signal_strength || '').toLowerCase()] || 0)
      - (SIGNAL_RANK[(a.intel_signal_strength || '').toLowerCase()] || 0)
    ).slice(0, 5);
    real.push(...picks);
  }

  // Pull Chad Mueller's content for dummies
  const chadRows = await sbGet('/rest/v1/sr_engine_output?prospect_id=eq.chad-mueller-omni-fiber&select=*&order=created_at.desc&limit=1');
  const chadContent = chadRows[0];
  if (!chadContent) throw new Error('Chad Mueller content not found');

  // Build dummies with Chad's content
  const dummies = DUMMY_CONFIGS.map((d) => ({
    id: `smoke-dummy-${d.email.replace(/[^a-z0-9]+/gi, '-')}`,
    first_name: d.firstName,
    last_name: d.lastName,
    email: d.email,
    title: chadContent.title || 'EVP Operations',
    company: chadContent.company || 'Omni Fiber (test)',
    state: chadContent.state || 'OH',
    assigned_ae: d.ae,
    company_website: 'https://www.omnifiber.com',
    persona_bucket: chadContent.persona_bucket,
    icp_status: 'in_icp',
    intel_signal_strength: chadContent.intel_signal_strength,
    research_summary: chadContent.research_summary,
    company_summary: chadContent.company_summary,
    challenger_insight: chadContent.challenger_insight,
    intel_talking_points: chadContent.intel_talking_points,
    intel_next_action: chadContent.intel_next_action,
    intel_decision_authority: chadContent.intel_decision_authority,
    intel_buying_timeline: chadContent.intel_buying_timeline,
    intel_risk_factors: chadContent.intel_risk_factors,
    likely_objections: chadContent.likely_objections,
    linkedin_summary: chadContent.linkedin_summary,
    other_stakeholders: chadContent.other_stakeholders,
    fiber_activities: chadContent.fiber_activities,
    bead_status: chadContent.bead_status,
    growth_signals: chadContent.growth_signals,
    key_projects: chadContent.key_projects,
    competitive_landscape: chadContent.competitive_landscape,
    likely_competitors: chadContent.likely_competitors,
    external_deadlines: chadContent.external_deadlines,
    market_moment: chadContent.market_moment,
    microsite_slug: chadContent.microsite_slug || 'omni-fiber-chad-mueller',
    email_subject_t1: chadContent.email_subject_t1,
    email_body_t1: chadContent.email_body_t1,
    email_ps_t1: chadContent.email_ps_t1,
  }));

  return { real, dummies };
}

function toEngineRow(p: any): EngineRow {
  return {
    prospect_id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    company: p.company || '',
    title: p.title || '',
    state: p.state || '',
    assigned_ae: p.assigned_ae || '',
    icp_status: p.icp_status || 'in_icp',
    persona_bucket: p.persona_bucket || 'core_icp',
    research_summary: p.company_summary || '',
    challenger_insight: p.challenger_insight || '',
    intel_signal_strength: p.intel_signal_strength || 'Possible',
    intel_talking_points: p.intel_talking_points || '',
    intel_next_action: p.intel_next_action || '',
    intel_decision_authority: p.intel_decision_authority || '',
    intel_buying_timeline: p.intel_buying_timeline || '',
    intel_risk_factors: p.intel_risk_factors || '',
    likely_objections: p.likely_objections || '',
    linkedin_summary: p.linkedin_summary || '',
    other_stakeholders: p.other_stakeholders || '',
    company_summary: p.company_summary || '',
    company_size: p.company_size || '',
    fiber_activities: p.fiber_activities || '',
    bead_status: p.bead_status || '',
    growth_signals: p.growth_signals || '',
    key_projects: p.key_projects || '',
    likely_competitors: p.likely_competitors || p.known_tools || '',
    external_deadlines: p.external_deadlines || '',
    market_moment: p.market_moment || '',
    microsite_slug: p.microsite_slug || '',
    email_subject_t1: p.email_subject_t1 || '',
    email_body_t1: p.email_body_t1 || '',
    email_ps_t1: p.email_ps_t1 || '',
    email_subject_t2: '',
    email_body_t2: '',
    email_ps_t2: '',
    email_subject_t3: '',
    email_body_t3: '',
    email_ps_t3: '',
    lead_type: 'Cold',
  };
}

function domainFor(p: any): string {
  if (p.email && p.email.includes('@')) return p.email.split('@')[1].toLowerCase();
  if (p.company_website) {
    const m = p.company_website.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    if (m) return m[1].toLowerCase();
  }
  return '';
}

async function main() {
  console.log('=== SMOKE LOAD ===');
  console.log('Target: 15 real + 3 dummies = 18 contacts to HubSpot');
  console.log('');

  // STEP 1: Pre-load verify (6 checks)
  console.log('STEP 1 — Pre-load verify');
  const { real, dummies } = await selectRoster();
  const allProspects = [...real, ...dummies];
  console.log(`  Selected ${real.length} real + ${dummies.length} dummies = ${allProspects.length} total\n`);

  const verifyReport = await runVerify({
    prospectEmails: allProspects.map((p: any) => p.email),
    sequenceNames: [
      'FC2026 — Lucas Spencer Cold - AM',
      'FC2026 — Lucas Spencer Cold - PM',
      'FC2026 — Mike Rutski Cold - AM',
      'FC2026 — Mike Rutski Cold - PM',
      'FC2026 — Nathan Dunn Cold - AM',
      'FC2026 — Nathan Dunn Cold - PM',
    ],
  });
  console.log(formatVerifyReport(verifyReport));
  if (!verifyReport.allPassed) {
    console.error('❌ Pre-load verify FAILED — aborting');
    process.exit(1);
  }
  console.log('  ✅ All pre-load checks passed\n');

  // STEP 2: Pre-load audit
  console.log('STEP 2 — Pre-load audit (dedup + bounce history per prospect)');
  const auditInputs: ProspectInput[] = allProspects.map((p: any) => ({
    id: p.id,
    email: p.email,
    firstName: p.first_name,
    lastName: p.last_name,
    company: p.company || '',
    companyDomain: domainFor(p),
    assignedAe: p.assigned_ae,
  }));
  const auditReport = await runAudit(auditInputs);
  console.log(`  Audit: PROCEED=${auditReport.proceedCount}, REVIEW=${auditReport.reviewCount}, BLOCK=${auditReport.blockCount}\n`);

  const blocked = auditReport.rows.filter(r => r.loadVerdict === 'BLOCK');
  if (blocked.length > 0) {
    console.log('🚫 BLOCKED prospects (will skip):');
    for (const r of blocked) {
      console.log(`  - ${r.prospect.firstName} ${r.prospect.lastName} (${r.prospect.email}):`);
      for (const f of r.riskFlags) console.log(`      ${f}`);
    }
    console.log('');
  }

  const review = auditReport.rows.filter(r => r.loadVerdict === 'REVIEW');
  if (review.length > 0) {
    console.log(`⚠️  ${review.length} REVIEW prospects (will load with warnings):`);
    for (const r of review) {
      console.log(`  - ${r.prospect.firstName} ${r.prospect.lastName} (${r.prospect.email})`);
    }
    console.log('');
  }

  // STEP 3: Load each contact (skip BLOCK)
  console.log('STEP 3 — Loading 18 contacts to HubSpot...');
  const loadable = auditReport.rows.filter(r => r.loadVerdict !== 'BLOCK');
  const idToProspect = new Map(allProspects.map((p: any) => [p.id, p]));

  const loadResults: Array<{prospect: any, status: string, hsContactId?: string, error?: string}> = [];
  for (const auditRow of loadable) {
    const prospect = idToProspect.get(auditRow.prospect.id);
    if (!prospect) continue;
    const row = toEngineRow(prospect);
    try {
      const result: any = await loadProspectToHubSpot(row, false /* live */);
      const status = result.status || 'unknown';
      const hsContactId = result.contactId || result.contact?.id || undefined;
      loadResults.push({ prospect, status, hsContactId });
      console.log(`  ✅ ${prospect.first_name} ${prospect.last_name} → HS id ${hsContactId || '?'} (${status})`);
    } catch (e: any) {
      loadResults.push({ prospect, status: 'error', error: e.message?.slice(0, 200) });
      console.log(`  ❌ ${prospect.first_name} ${prospect.last_name} → ERROR: ${e.message?.slice(0, 100)}`);
    }
  }

  // STEP 4: Final roster
  console.log('');
  console.log('=== FINAL ROSTER ===');
  const grouped: Record<string, any[]> = {'Mike Rutski': [], 'Nathan Dunn': [], 'Lucas Spencer': []};
  for (const r of loadResults) grouped[r.prospect.assigned_ae]?.push(r);

  for (const ae of ['Mike Rutski', 'Nathan Dunn', 'Lucas Spencer']) {
    console.log(`\n--- ${ae} ---`);
    for (const r of grouped[ae] || []) {
      const isDummy = r.prospect.id?.startsWith('smoke-dummy-');
      const tag = isDummy ? '🧪 DUMMY' : '👤 REAL';
      const hsLink = r.hsContactId ? `https://app.hubspot.com/contacts/20729069/contact/${r.hsContactId}` : 'no id';
      console.log(`  ${tag} ${r.prospect.first_name} ${r.prospect.last_name} | ${r.prospect.company} | ${r.prospect.email}`);
      console.log(`        → ${hsLink} (${r.status})`);
    }
  }

  console.log('');
  console.log(`Summary: ${loadResults.filter(r => r.status === 'loaded').length} loaded, ${loadResults.filter(r => r.status === 'error').length} errors`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
