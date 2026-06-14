import { loadProspectToHubSpot, EngineRow } from '../src/showrev/m1-email-find/hubspot-loader';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

async function load(pid: string): Promise<void> {
  console.log(`Loading ${pid}...`);
  const ps = await (await fetch(`${sbUrl}/rest/v1/sr_prospects?id=eq.${pid}&select=*`, { headers: H })).json();
  if (!ps[0]) { console.log('  PROSPECT NOT FOUND'); return; }
  const p = ps[0];
  const es = await (await fetch(`${sbUrl}/rest/v1/sr_engine_output?prospect_id=eq.${pid}&select=*&order=created_at.desc&limit=1`, { headers: H })).json();
  const e: any = es[0] || {};
  const row: EngineRow = {
    prospect_id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email,
    company: e.company || p.company, title: p.title || '', state: p.state || '',
    assigned_ae: p.assigned_ae, icp_status: p.icp_status || 'in_icp',
    persona_bucket: e.persona_bucket || 'core_icp',
    research_summary: e.company_summary || '', challenger_insight: e.challenger_insight || '',
    intel_signal_strength: e.intel_signal_strength || 'Possible',
    intel_talking_points: e.intel_talking_points || '', intel_next_action: e.intel_next_action || '',
    intel_decision_authority: e.intel_decision_authority || '', intel_buying_timeline: e.intel_buying_timeline || '',
    intel_risk_factors: e.intel_risk_factors || '', likely_objections: e.likely_objections || '',
    linkedin_summary: e.linkedin_summary || '', other_stakeholders: e.other_stakeholders || '',
    company_summary: e.company_summary || '', company_size: e.company_size || '',
    fiber_activities: e.fiber_activities || '', bead_status: e.bead_status || '',
    growth_signals: e.growth_signals || '', key_projects: e.key_projects || '',
    likely_competitors: e.likely_competitors || e.known_tools || '', external_deadlines: e.external_deadlines || '',
    market_moment: e.market_moment || '', microsite_slug: e.microsite_slug || '',
    email_subject_t1: e.email_subject_t1 || '', email_body_t1: e.email_body_t1 || '', email_ps_t1: e.email_ps_t1 || '',
    email_subject_t2: '', email_body_t2: '', email_ps_t2: '',
    email_subject_t3: '', email_body_t3: '', email_ps_t3: '',
    lead_type: 'Cold',
  };
  const r: any = await loadProspectToHubSpot(row, false);
  console.log(`  ✅ ${p.first_name} ${p.last_name} (${p.assigned_ae}) → HS contact ${r.contactId}`);
}

(async () => {
  await load('zack-burnes-united-tel-supply');
  await load('jeff-reiman-the-broadband-group');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
