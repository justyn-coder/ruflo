import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const HS_API_BASE = 'https://api.hubapi.com';

function getToken(): string {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not set');
  return token;
}

async function hsApi(path: string, method: string = 'GET', body?: any): Promise<any> {
  const res = await fetch(`${HS_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HubSpot ${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// --- Signal strength mapping (engine → HubSpot) ---
const SIGNAL_MAP: Record<string, string> = {
  'Strong': 'GREEN',
  'Good': 'YELLOW',
  'Possible': 'ORANGE',
  'Weak': 'RED',
  'No fit': 'RED',
};

// --- Persona rollup (7-bucket → 3-value) ---
const PERSONA_MAP: Record<string, string> = {
  'build_pace': 'core_icp',
  'drawings_quality': 'core_icp',
  'permit_cycle': 'core_icp',
  'program_leverage': 'core_icp',
  'cycle_time_exec': 'exec_tier',
  'capital_efficiency': 'exec_tier',
  'pass_through': 'wrong_persona',
  'connect_request': 'wrong_persona',
};

// --- AE Owner IDs ---
const AE_OWNER_IDS: Record<string, string> = {
  'Mike Rutski': '89105202',
  'Nathan Dunn': '89105203',
  'Lucas Spencer': '163468117',
};

// --- Property groups (created before properties) ---
const PROPERTY_GROUPS = {
  contact: [
    { name: 'showrev_intel', displayOrder: 0, label: 'ShowRev Intel' },
    { name: 'showrev_context', displayOrder: 1, label: 'ShowRev Context' },
    { name: 'showrev_email_tokens', displayOrder: 2, label: 'ShowRev Email Tokens' },
  ],
  company: [
    { name: 'showrev_company_intel', displayOrder: 0, label: 'ShowRev Company Intel' },
  ],
};

// --- Property creation (run once) ---
// Tier 1: AE must see before sending email or taking a call
// Tier 2: high-value context for deeper prep
// Tier 3: email tokens for Sequence template (system fields)
const CONTACT_PROPERTIES_TO_CREATE = [
  // Tier 1 — ShowRev Intel group (always visible in sidebar)
  { name: 'showrev_signal_strength', label: 'ShowRev: Signal Strength', type: 'enumeration', groupName: 'showrev_intel', options: [{ label: 'Strong', value: 'GREEN' }, { label: 'Good', value: 'YELLOW' }, { label: 'Possible', value: 'ORANGE' }, { label: 'Weak', value: 'RED' }] },
  { name: 'showrev_next_action', label: 'ShowRev: Next Action', type: 'string', groupName: 'showrev_intel' },
  { name: 'showrev_challenger_insight', label: 'ShowRev: Challenger Insight', type: 'string', groupName: 'showrev_intel' },
  { name: 'showrev_decision_authority', label: 'ShowRev: Decision Authority', type: 'enumeration', groupName: 'showrev_intel', options: [{ label: 'Budget owner', value: 'Budget owner' }, { label: 'Influencer', value: 'Influencer' }, { label: 'Champion', value: 'Champion' }, { label: 'Unknown', value: 'Unknown' }] },
  { name: 'showrev_buying_timeline', label: 'ShowRev: Buying Timeline', type: 'string', groupName: 'showrev_intel' },
  { name: 'showrev_ae_talking_points', label: 'ShowRev: Talking Points', type: 'string', groupName: 'showrev_intel' },
  { name: 'showrev_likely_objections', label: 'ShowRev: Likely Objections', type: 'string', groupName: 'showrev_intel' },
  { name: 'showrev_risk_factors', label: 'ShowRev: Risk Factors', type: 'string', groupName: 'showrev_intel' },

  // Tier 2 — ShowRev Context group (collapsible)
  { name: 'showrev_research_summary', label: 'ShowRev: Research Summary', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_persona_classification', label: 'ShowRev: Persona', type: 'enumeration', groupName: 'showrev_context', options: [{ label: 'Core ICP', value: 'core_icp' }, { label: 'Executive Tier', value: 'exec_tier' }, { label: 'Wrong Persona', value: 'wrong_persona' }] },
  { name: 'showrev_linkedin_summary', label: 'ShowRev: LinkedIn Summary', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_other_stakeholders', label: 'ShowRev: Other Stakeholders', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_booth_notes', label: 'ShowRev: Booth Notes', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_microsite_url', label: 'ShowRev: Microsite URL', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_engagement_slug', label: 'ShowRev: Engagement', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_assigned_ae', label: 'ShowRev: Assigned AE', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_outreach_cohort', label: 'ShowRev: Outreach Cohort', type: 'string', groupName: 'showrev_context' },
  { name: 'showrev_first_outreach_date', label: 'ShowRev: First Outreach Date', type: 'date', groupName: 'showrev_context' },

  // Tier 3 — ShowRev Email Tokens group (Sequence template system fields)
  { name: 'showrev_pre_show_t1_subject', label: 'ShowRev: T1 Subject', type: 'string', groupName: 'showrev_email_tokens' },
  { name: 'showrev_pre_show_t1_para1', label: 'ShowRev: T1 Para 1', type: 'string', groupName: 'showrev_email_tokens' },
  { name: 'showrev_pre_show_t1_para2', label: 'ShowRev: T1 Para 2', type: 'string', groupName: 'showrev_email_tokens' },
  { name: 'showrev_pre_show_t1_para3', label: 'ShowRev: T1 Para 3', type: 'string', groupName: 'showrev_email_tokens' },
  { name: 'showrev_pre_show_t1_para4', label: 'ShowRev: T1 Para 4', type: 'string', groupName: 'showrev_email_tokens' },
  { name: 'showrev_pre_show_t1_ps', label: 'ShowRev: T1 PS Line', type: 'string', groupName: 'showrev_email_tokens' },
];

const COMPANY_PROPERTIES_TO_CREATE = [
  { name: 'showrev_company_summary', label: 'ShowRev: Company Summary', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_company_size', label: 'ShowRev: Company Size', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_fiber_activities', label: 'ShowRev: Fiber Activities', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_bead_status', label: 'ShowRev: BEAD Status', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_growth_signals', label: 'ShowRev: Growth Signals', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_competitive_landscape', label: 'ShowRev: Competitive Landscape', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_key_projects', label: 'ShowRev: Key Projects', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_recent_news', label: 'ShowRev: Recent News', type: 'string', groupName: 'showrev_company_intel' },
  { name: 'showrev_external_deadlines', label: 'ShowRev: External Deadlines', type: 'string', groupName: 'showrev_company_intel' },
];

async function createPropertyGroups(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const group of PROPERTY_GROUPS.contact) {
    try {
      await hsApi('/crm/v3/properties/contacts/groups', 'POST', group);
      created.push(`contact.${group.name}`);
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('already exists')) {
        skipped.push(`contact.${group.name}`);
      }
    }
  }
  for (const group of PROPERTY_GROUPS.company) {
    try {
      await hsApi('/crm/v3/properties/companies/groups', 'POST', group);
      created.push(`company.${group.name}`);
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('already exists')) {
        skipped.push(`company.${group.name}`);
      }
    }
  }
  return { created, skipped };
}

export async function createMissingProperties(): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Create property groups first
  const groups = await createPropertyGroups();
  console.log(`Property groups: ${groups.created.length} created, ${groups.skipped.length} existing`);

  for (const prop of CONTACT_PROPERTIES_TO_CREATE) {
    try {
      const payload: any = {
        name: prop.name,
        label: prop.label,
        type: prop.type,
        groupName: prop.groupName,
        fieldType: prop.type === 'enumeration' ? 'select' : 'textarea',
      };
      if ((prop as any).options) {
        payload.options = (prop as any).options;
      }
      await hsApi('/crm/v3/properties/contacts', 'POST', payload);
      created.push(`contact.${prop.name}`);
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('already exists')) {
        skipped.push(`contact.${prop.name}`);
      } else {
        errors.push(`contact.${prop.name}: ${err.message?.slice(0, 100)}`);
      }
    }
  }

  for (const prop of COMPANY_PROPERTIES_TO_CREATE) {
    try {
      await hsApi('/crm/v3/properties/companies', 'POST', { ...prop, fieldType: 'textarea' });
      created.push(`company.${prop.name}`);
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('already exists')) {
        skipped.push(`company.${prop.name}`);
      } else {
        errors.push(`company.${prop.name}: ${err.message?.slice(0, 100)}`);
      }
    }
  }

  return { created, skipped, errors };
}

// --- Domain extraction ---
function extractDomain(email: string): string | null {
  if (!email?.includes('@')) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) return null;
  return domain;
}

// --- Load a single prospect from sr_engine_output row ---
export interface EngineRow {
  prospect_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  title: string;
  state: string;
  assigned_ae: string;
  icp_status: string;
  persona_bucket: string;
  research_summary: string;
  challenger_insight: string;
  intel_signal_strength: string;
  intel_talking_points: string;
  intel_next_action: string;
  intel_decision_authority: string;
  intel_buying_timeline: string;
  intel_risk_factors: string;
  likely_objections: string;
  linkedin_summary: string;
  other_stakeholders: string;
  company_summary: string;
  company_size: string;
  fiber_activities: string;
  bead_status: string;
  growth_signals: string;
  key_projects: string;
  likely_competitors: string;
  external_deadlines: string;
  market_moment: string;
  microsite_slug: string;
  email_subject_t1: string;
  email_body_t1: string;
  email_ps_t1: string;
  email_subject_t2: string;
  email_body_t2: string;
  email_ps_t2: string;
  email_subject_t3: string;
  email_body_t3: string;
  email_ps_t3: string;
  // Spec v6.1 A3: distinguish P1 booth-visitor (Warm) vs P2 cold prospects
  // for engagement slug branching. Required for cold-list filtering in HS.
  lead_type: string;
}

function decomposeEmail(body: string, ps: string): { para1: string; para2: string; para3: string; para4: string } {
  // Body already has salutation joined ("Chris, opening sentence...")
  // Split on blank lines to get paragraphs
  const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Remove signature lines (AE Name | Inorsa | email)
  const filtered = paragraphs.filter(p => !p.includes('| Inorsa |'));

  // Para 4 = P.S. line (per Sequence template structure)
  return {
    para1: filtered[0] || '',
    para2: filtered[1] || '',
    para3: filtered[2] || '',
    para4: ps || '',
  };
}

export async function loadProspectToHubSpot(
  row: EngineRow,
  dryRun: boolean = true
): Promise<{ status: string; companyId?: string; contactId?: string; error?: string }> {
  const domain = extractDomain(row.email);

  console.log(`  ${row.first_name} ${row.last_name} @ ${row.company}`);

  // Step 1: Find or create company by domain
  let companyId: string | null = null;

  if (domain) {
    try {
      const search = await hsApi('/crm/v3/objects/companies/search', 'POST', {
        filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
        properties: ['name', 'domain'],
      });
      if (search.results?.length > 0) {
        companyId = search.results[0].id;
        console.log(`    Company found: ${companyId} (${domain})`);
      }
    } catch {}
  }

  const companyProps: Record<string, string> = {
    name: row.company,
    ...(domain ? { domain } : {}),
    abm_play: 'ABM 1:Few',
    ...(row.company_summary ? { showrev_company_summary: row.company_summary } : {}),
    ...(row.company_size ? { showrev_company_size: row.company_size } : {}),
    ...(row.fiber_activities ? { showrev_fiber_activities: row.fiber_activities } : {}),
    ...(row.bead_status ? { showrev_bead_status: row.bead_status } : {}),
    ...(row.growth_signals ? { showrev_growth_signals: row.growth_signals } : {}),
    ...(row.likely_competitors ? { showrev_competitive_landscape: row.likely_competitors } : {}),
    ...(row.key_projects ? { showrev_key_projects: row.key_projects } : {}),
    ...(row.market_moment ? { showrev_recent_news: row.market_moment } : {}),
    ...(row.external_deadlines ? { showrev_external_deadlines: row.external_deadlines } : {}),
  };

  if (dryRun) {
    console.log(`    [DRY RUN] Company: ${companyId ? 'UPDATE ' + companyId : 'CREATE'} (${domain})`);
    console.log(`    [DRY RUN] Props: ${Object.keys(companyProps).length} fields`);
  } else if (!companyId) {
    const created = await hsApi('/crm/v3/objects/companies', 'POST', { properties: companyProps });
    companyId = created.id;
    console.log(`    Company created: ${companyId}`);
  } else {
    await hsApi(`/crm/v3/objects/companies/${companyId}`, 'PATCH', { properties: companyProps });
    console.log(`    Company updated: ${companyId}`);
  }

  // Step 2: Check if contact exists
  let contactId: string | null = null;
  try {
    const search = await hsApi('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: row.email }] }],
      properties: ['email', 'firstname', 'lastname'],
    });
    if (search.results?.length > 0) {
      contactId = search.results[0].id;
      console.log(`    Contact found: ${contactId} (existing)`);
    }
  } catch {}

  if (!row.assigned_ae || !AE_OWNER_IDS[row.assigned_ae]) {
    console.log(`    ⚠ No AE assigned — skipping (assign an AE first)`);
    return { status: 'skipped', error: `No AE assigned for ${row.first_name} ${row.last_name}` };
  }
  const aeOwnerId = AE_OWNER_IDS[row.assigned_ae];
  const signalMapped = SIGNAL_MAP[row.intel_signal_strength] || 'ORANGE';
  const personaMapped = PERSONA_MAP[row.persona_bucket] || 'core_icp';

  // Decompose email bodies into paragraph tokens for Sequence templates
  const t1Parts = decomposeEmail(row.email_body_t1 || '', row.email_ps_t1 || '');
  const t2Parts = decomposeEmail(row.email_body_t2 || '', row.email_ps_t2 || '');
  const t3Parts = decomposeEmail(row.email_body_t3 || '', row.email_ps_t3 || '');

  const contactProps: Record<string, string> = {
    email: row.email,
    firstname: row.first_name,
    lastname: row.last_name,
    jobtitle: row.title,
    showrev_research_summary: (row.research_summary || '').slice(0, 2000),
    // Spec v6.1 A3: branch engagement slug + outreach cohort by lead_type.
    // P1 booth visitors (Warm) → existing list filter.
    // P2 cold prospects → -cold suffix on slug; cohort label updated.
    showrev_engagement_slug:
      row.lead_type === 'Cold'
        ? 'inorsa-fiberconnect-2026-cold'
        : 'inorsa-fiberconnect-2026',
    showrev_assigned_ae: row.assigned_ae || 'Unassigned',
    showrev_outreach_cohort:
      row.lead_type === 'Cold' ? 'fc2026-cold' : 'fc2026-booth',
    showrev_first_outreach_date: new Date().toISOString().split('T')[0],
    showrev_pilot_owner: 'true',
    showrev_signal_strength: signalMapped,
    showrev_persona_classification: personaMapped,
    showrev_ae_talking_points: (row.intel_talking_points || '').slice(0, 2000),
    ...(row.challenger_insight ? { showrev_challenger_insight: row.challenger_insight.slice(0, 2000) } : {}),
    ...(row.intel_decision_authority ? { showrev_decision_authority: row.intel_decision_authority } : {}),
    ...(row.likely_objections ? { showrev_likely_objections: row.likely_objections.slice(0, 2000) } : {}),
    ...(row.linkedin_summary ? { showrev_linkedin_summary: row.linkedin_summary.slice(0, 2000) } : {}),
    ...(row.other_stakeholders ? { showrev_other_stakeholders: row.other_stakeholders } : {}),
    ...(row.microsite_slug ? { showrev_microsite_url: `https://fiber.inorsa.com/brief/${row.microsite_slug}` } : {}),
    ...(row.intel_next_action ? { showrev_next_action: row.intel_next_action.slice(0, 2000) } : {}),
    ...(row.intel_buying_timeline ? { showrev_buying_timeline: row.intel_buying_timeline } : {}),
    ...(row.intel_risk_factors ? { showrev_risk_factors: row.intel_risk_factors.slice(0, 2000) } : {}),
    // T1 email decomposed for Sequence template tokens
    ...(row.email_subject_t1 ? { showrev_pre_show_t1_subject: row.email_subject_t1 } : {}),
    ...(t1Parts.para1 ? { showrev_pre_show_t1_para1: t1Parts.para1 } : {}),
    ...(t1Parts.para2 ? { showrev_pre_show_t1_para2: t1Parts.para2 } : {}),
    ...(t1Parts.para3 ? { showrev_pre_show_t1_para3: t1Parts.para3 } : {}),
    ...(t1Parts.para4 ? { showrev_pre_show_t1_para4: t1Parts.para4 } : {}),
    ...(row.email_ps_t1 ? { showrev_pre_show_t1_ps: row.email_ps_t1 } : {}),
    ...(row.email_ps_t1 ? { showrev_pilot_anchor_paragraph: t1Parts.para1 } : {}),
    ...(t1Parts.para3 || t1Parts.para2 ? { showrev_pilot_cta_phrasing: t1Parts.para3 || t1Parts.para2 } : {}),
  };

  // Only set owner + lifecycle on NEW contacts (per Tim's rules)
  if (!contactId) {
    contactProps.hubspot_owner_id = aeOwnerId;
    contactProps.lifecyclestage = '1162148264';
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Contact: ${contactId ? 'UPDATE ' + contactId : 'CREATE'}`);
    console.log(`    [DRY RUN] Props: ${Object.keys(contactProps).length} fields`);
    console.log(`    [DRY RUN] Signal: ${row.intel_signal_strength} → ${signalMapped}`);
    console.log(`    [DRY RUN] Persona: ${row.persona_bucket} → ${personaMapped}`);
    console.log(`    [DRY RUN] AE: ${row.assigned_ae} → owner ${aeOwnerId}`);
    return { status: 'dry-run' };
  }

  if (!contactId) {
    const created = await hsApi('/crm/v3/objects/contacts', 'POST', { properties: contactProps });
    contactId = created.id;
    console.log(`    Contact created: ${contactId}`);
  } else {
    // Existing contact: only set showrev_* fields (per Tim's rules)
    const updateProps = Object.fromEntries(
      Object.entries(contactProps).filter(([k]) => k.startsWith('showrev_'))
    );
    await hsApi(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', { properties: updateProps });
    console.log(`    Contact updated: ${contactId} (showrev_* fields only)`);
  }

  // F5b (fix-sprint-2026-06-13-v2): forward-wire hubspot_contact_id into
  // sr_prospects in the same call chain. After every successful create/upsert,
  // immediately persist the HS contactId so the DB knows what's in HS
  // without needing a separate backfill pass. Best-effort UPSERT — failures
  // log a warning but don't block the load. Companion to F5a (the one-time
  // backfill for the 18 pre-loaded smoke contacts).
  if (contactId && row.prospect_id) {
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (sbKey) {
        const patchRes = await fetch(
          `${sbUrl}/rest/v1/sr_prospects?id=eq.${encodeURIComponent(row.prospect_id)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              hubspot_contact_id: contactId,
              hubspot_loaded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          },
        );
        if (!patchRes.ok) {
          const text = await patchRes.text();
          console.warn(`    F5b: sr_prospects.hubspot_contact_id update failed ${patchRes.status}: ${text.slice(0, 160)}`);
        } else {
          console.log(`    F5b: sr_prospects.${row.prospect_id} → hubspot_contact_id=${contactId}`);
        }
      }
    } catch (err) {
      console.warn(`    F5b: sr_prospects update error: ${(err as Error).message?.slice(0, 160)}`);
    }
  }

  // Step 3: Associate contact → company
  if (companyId && contactId) {
    try {
      await hsApi(`/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`, 'PUT', [
        { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }
      ]);
      console.log(`    Associated contact ${contactId} → company ${companyId}`);
    } catch (err: any) {
      console.log(`    Association failed: ${err.message?.slice(0, 80)}`);
    }
  }

  return { status: 'loaded', companyId: companyId || undefined, contactId };
}

// --- Shared data fetching (Supabase) ---

interface SendData {
  prospects: any[];
  engineMap: Map<string, any>;
  micrositeMap: Map<string, any>;
}

async function fetchSendData(): Promise<SendData> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const sbHeaders = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };

  const [pRes, eRes, mRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/sr_prospects?send_status=eq.send&select=*&limit=0`, { headers: { ...sbHeaders, 'Range-Unit': 'items', Range: '0-9999' } }),
    fetch(`${sbUrl}/rest/v1/sr_engine_output?send_status=eq.send&select=*&limit=0`, { headers: { ...sbHeaders, 'Range-Unit': 'items', Range: '0-9999' } }),
    fetch(`${sbUrl}/rest/v1/sr_microsites?select=*&limit=0`, { headers: { ...sbHeaders, 'Range-Unit': 'items', Range: '0-9999' } }),
  ]);

  const prospects: any[] = await pRes.json();
  const engineRows: any[] = await eRes.json();
  const microsites: any[] = await mRes.json();

  const engineMap = new Map<string, any>();
  for (const e of engineRows) engineMap.set(e.prospect_id, e);

  const micrositeMap = new Map<string, any>();
  for (const m of microsites) micrositeMap.set(m.slug, m);

  return { prospects, engineMap, micrositeMap };
}

// --- Pre-load verification (10 checks from FC2026 post-mortem) ---

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  total: number;
  passed: number;
  details: string[];
}

function extractPsSlug(ps: string): string | null {
  const match = ps.match(/fiber\.inorsa\.com\/brief\/([a-z0-9][a-z0-9-]*[a-z0-9])/);
  return match ? match[1] : null;
}

async function runVerify(data?: SendData): Promise<{ results: CheckResult[]; blocked: boolean }> {
  const { prospects, engineMap, micrositeMap } = data || await fetchSendData();

  const rows: Array<{ prospect: any; engine: any }> = [];
  for (const p of prospects) {
    const e = engineMap.get(p.id);
    if (!e || !e.email_body_t1) continue;
    rows.push({ prospect: p, engine: e });
  }

  console.log(`Verifying ${rows.length} SEND contacts (${micrositeMap.size} microsites in DB)\n`);
  const results: CheckResult[] = [];

  // 1. PS_URL_EXISTS — every microsite URL in PS must resolve to an sr_microsites row
  {
    const details: string[] = [];
    let passed = 0;
    let checked = 0;
    for (const { prospect: p, engine: e } of rows) {
      const slug = extractPsSlug(e.email_ps_t1 || '');
      if (!slug) continue;
      checked++;
      if (micrositeMap.has(slug)) passed++;
      else details.push(`${p.first_name} ${p.last_name}: slug "${slug}" not in sr_microsites`);
    }
    results.push({ name: 'PS_URL_EXISTS', status: details.length ? 'FAIL' : 'PASS', total: checked, passed, details });
  }

  // 2. MICROSITE_AE_MATCH — microsite ae_name must match prospect assigned_ae
  {
    const details: string[] = [];
    let passed = 0;
    const checked = new Set<string>();
    for (const { prospect: p, engine: e } of rows) {
      const slug = e.microsite_slug || '';
      if (!slug || checked.has(slug)) continue;
      checked.add(slug);
      const ms = micrositeMap.get(slug);
      if (!ms) continue;
      if (ms.ae_name === p.assigned_ae) passed++;
      else details.push(`${slug}: microsite AE="${ms.ae_name}" != prospect AE="${p.assigned_ae}"`);
    }
    results.push({ name: 'MICROSITE_AE_MATCH', status: details.length ? 'FAIL' : 'PASS', total: checked.size, passed, details });
  }

  // 3. MICROSITE_PHOTO_SET — ae_photo_url must not be NULL
  {
    const details: string[] = [];
    let passed = 0;
    const checked = new Set<string>();
    for (const { engine: e } of rows) {
      const slug = e.microsite_slug || '';
      if (!slug || checked.has(slug)) continue;
      checked.add(slug);
      const ms = micrositeMap.get(slug);
      if (!ms) continue;
      if (ms.ae_photo_url) passed++;
      else details.push(`${slug}: ae_photo_url is NULL`);
    }
    results.push({ name: 'MICROSITE_PHOTO_SET', status: details.length ? 'FAIL' : 'PASS', total: checked.size, passed, details });
  }

  // 4. MICROSITE_STATUS_LIVE — status must be 'live' (not 'active' or other)
  {
    const details: string[] = [];
    let passed = 0;
    const checked = new Set<string>();
    for (const { engine: e } of rows) {
      const slug = e.microsite_slug || '';
      if (!slug || checked.has(slug)) continue;
      checked.add(slug);
      const ms = micrositeMap.get(slug);
      if (!ms) { details.push(`${slug}: not found in sr_microsites`); continue; }
      if (ms.status === 'live') passed++;
      else details.push(`${slug}: status="${ms.status}" (must be "live")`);
    }
    results.push({ name: 'MICROSITE_STATUS_LIVE', status: details.length ? 'FAIL' : 'PASS', total: checked.size, passed, details });
  }

  // 5. MICROSITE_LOGO_CHECK — warn if logo is NULL or looks like a CMS favicon
  {
    const CMS_TELLS = ['wordpress', 'squarespace', 'wix', 'weebly', 'shopify', 'w3-total-cache', 'flavor-favicon'];
    const details: string[] = [];
    let passed = 0;
    const checked = new Set<string>();
    for (const { engine: e } of rows) {
      const slug = e.microsite_slug || '';
      if (!slug || checked.has(slug)) continue;
      checked.add(slug);
      const ms = micrositeMap.get(slug);
      if (!ms) continue;
      const logo = (ms.company_logo_url || '').toLowerCase();
      if (!logo) details.push(`${slug}: company_logo_url is NULL`);
      else if (CMS_TELLS.some(t => logo.includes(t))) details.push(`${slug}: logo looks like CMS favicon`);
      else passed++;
    }
    results.push({ name: 'MICROSITE_LOGO_CHECK', status: details.length ? 'WARN' : 'PASS', total: checked.size, passed, details });
  }

  // 6. HUBSPOT_DUPLICATE_CHECK — warn if firstname+lastname match exists without email
  {
    const details: string[] = [];
    let passed = 0;
    for (const { prospect: p } of rows) {
      try {
        const search = await hsApi('/crm/v3/objects/contacts/search', 'POST', {
          filterGroups: [{ filters: [
            { propertyName: 'firstname', operator: 'EQ', value: p.first_name },
            { propertyName: 'lastname', operator: 'EQ', value: p.last_name },
          ]}],
          properties: ['email', 'firstname', 'lastname'],
        });
        const noEmail = (search.results || []).filter((m: any) => !m.properties.email);
        if (noEmail.length) details.push(`${p.first_name} ${p.last_name}: ${noEmail.length} HubSpot record(s) without email`);
        else passed++;
      } catch { passed++; }
      await new Promise(r => setTimeout(r, 200));
    }
    results.push({ name: 'HUBSPOT_DUPLICATE_CHECK', status: details.length ? 'WARN' : 'PASS', total: rows.length, passed, details });
  }

  // 7. CONTACT_OWNER_ALIGNMENT — existing HubSpot contacts must have correct owner
  {
    const details: string[] = [];
    let passed = 0;
    for (const { prospect: p } of rows) {
      if (!p.email) continue;
      try {
        const search = await hsApi('/crm/v3/objects/contacts/search', 'POST', {
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: p.email }] }],
          properties: ['email', 'hubspot_owner_id'],
        });
        if (search.results?.length) {
          const hsOwner = search.results[0].properties.hubspot_owner_id;
          const expected = AE_OWNER_IDS[p.assigned_ae];
          if (hsOwner && expected && hsOwner !== expected) {
            details.push(`${p.first_name} ${p.last_name}: owner=${hsOwner}, expected=${expected} (${p.assigned_ae})`);
          } else passed++;
        } else passed++;
      } catch { passed++; }
      await new Promise(r => setTimeout(r, 200));
    }
    results.push({ name: 'CONTACT_OWNER_ALIGNMENT', status: details.length ? 'FAIL' : 'PASS', total: rows.length, passed, details });
  }

  // 8. NULL_AE_CHECK — every contact must have a valid AE assignment
  {
    const details: string[] = [];
    let passed = 0;
    for (const { prospect: p } of rows) {
      if (p.assigned_ae && AE_OWNER_IDS[p.assigned_ae]) passed++;
      else details.push(`${p.first_name} ${p.last_name}: assigned_ae="${p.assigned_ae || 'NULL'}"`);
    }
    results.push({ name: 'NULL_AE_CHECK', status: details.length ? 'FAIL' : 'PASS', total: rows.length, passed, details });
  }

  // 9. EMAIL_CONTENT_CHECKS — subject capitalized, no forbidden phrases, no personal email
  {
    const PERSONAL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    const details: string[] = [];
    let passed = 0;
    for (const { prospect: p, engine: e } of rows) {
      const issues: string[] = [];
      const subj = e.email_subject_t1 || '';
      const body = e.email_body_t1 || '';
      if (subj && subj[0] !== subj[0].toUpperCase()) issues.push('subject not capitalized');
      if (body.toLowerCase().includes('permit-ready')) issues.push('"permit-ready" in body');
      if (body.includes('Worth a 20-minute conversation?')) issues.push('generic CTA');
      const dom = (p.email || '').split('@')[1]?.toLowerCase();
      if (dom && PERSONAL_DOMAINS.includes(dom)) issues.push(`personal email: ${dom}`);
      if (issues.length) details.push(`${p.first_name} ${p.last_name}: ${issues.join('; ')}`);
      else passed++;
    }
    results.push({ name: 'EMAIL_CONTENT_CHECKS', status: details.length ? 'FAIL' : 'PASS', total: rows.length, passed, details });
  }

  // 10. FIELD_COMPLETENESS — required fields must be non-empty
  {
    const REQ_P = ['email', 'assigned_ae'];
    const REQ_E = ['intel_signal_strength', 'persona_bucket', 'email_subject_t1', 'email_body_t1', 'email_ps_t1'];
    const details: string[] = [];
    let passed = 0;
    for (const { prospect: p, engine: e } of rows) {
      const missing = [...REQ_P.filter(f => !p[f]), ...REQ_E.filter(f => !e[f])];
      if (missing.length) details.push(`${p.first_name} ${p.last_name}: missing ${missing.join(', ')}`);
      else passed++;
    }
    results.push({ name: 'FIELD_COMPLETENESS', status: details.length ? 'FAIL' : 'PASS', total: rows.length, passed, details });
  }

  // Print summary
  let failCount = 0, warnCount = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`${icon} ${r.name}: ${r.passed}/${r.total} pass`);
    for (const d of r.details) console.log(`    → ${d}`);
    if (r.status === 'FAIL') failCount++;
    if (r.status === 'WARN') warnCount++;
  }

  const blocked = failCount > 0;
  console.log(blocked
    ? `\n✗ ${failCount} check(s) FAILED${warnCount ? `, ${warnCount} warning(s)` : ''} — BLOCKED`
    : `\n✓ ALL CHECKS PASSED${warnCount ? ` (${warnCount} warning(s))` : ''}`);

  return { results, blocked };
}

// --- Build EngineRow from prospect + engine data ---

function buildEngineRow(p: any, e: any): EngineRow {
  return {
    prospect_id: p.id,
    first_name: p.first_name, last_name: p.last_name,
    email: p.email, company: e.company || p.company,
    title: p.title || e.title || '', state: p.state || '',
    assigned_ae: p.assigned_ae || '', icp_status: p.icp_status || '',
    persona_bucket: e.persona_bucket || '',
    research_summary: e.company_summary || '',
    challenger_insight: e.challenger_insight || '',
    intel_signal_strength: e.intel_signal_strength || '',
    intel_talking_points: e.intel_talking_points || '',
    intel_next_action: e.intel_next_action || '',
    intel_decision_authority: e.intel_decision_authority || '',
    intel_buying_timeline: e.intel_buying_timeline || '',
    intel_risk_factors: e.intel_risk_factors || '',
    likely_objections: e.likely_objections || '',
    linkedin_summary: e.linkedin_summary || '',
    other_stakeholders: e.other_stakeholders || '',
    company_summary: e.company_summary || '',
    company_size: e.company_size || '',
    fiber_activities: e.fiber_activities || '',
    bead_status: e.bead_status || '',
    growth_signals: e.growth_signals || '',
    key_projects: e.key_projects || '',
    likely_competitors: e.known_tools || '',
    external_deadlines: e.external_deadlines || '',
    market_moment: e.market_moment || '',
    microsite_slug: e.microsite_slug || p.company?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '',
    email_subject_t1: e.email_subject_t1 || '',
    email_body_t1: e.email_body_t1 || '',
    email_ps_t1: e.email_ps_t1 || '',
    email_subject_t2: '', email_body_t2: '', email_ps_t2: '',
    email_subject_t3: '', email_body_t3: '', email_ps_t3: '',
    // Spec v6.1 A3: pulled from sr_prospects.lead_type. Drives slug branch
    // in contactProps. "Cold" → inorsa-fiberconnect-2026-cold list filter.
    lead_type: p.lead_type || '',
  };
}

// CLI
if (process.argv[1]?.includes('hubspot-loader')) {
  const cmd = process.argv[2] || 'help';
  const skipVerify = process.argv.includes('--skip-verify');

  switch (cmd) {
    case 'create-properties':
      createMissingProperties().then(r => {
        console.log(`Created: ${r.created.length}`);
        console.log(`Skipped: ${r.skipped.length}`);
        if (r.errors.length) console.log(`Errors: ${r.errors.join(', ')}`);
      });
      break;

    case 'verify': {
      const { blocked } = await runVerify();
      process.exit(blocked ? 1 : 0);
      break;
    }

    case 'dry-run':
    case 'load': {
      const isDryRun = cmd === 'dry-run';
      const data = await fetchSendData();
      const { prospects, engineMap } = data;

      if (!isDryRun && !skipVerify) {
        console.log('=== PRE-LOAD VERIFICATION ===\n');
        const { blocked } = await runVerify(data);
        if (blocked) {
          console.log('\nLoad aborted. Fix failures or pass --skip-verify.\n');
          process.exit(1);
        }
        console.log('\n---\n');
      }

      console.log(`${isDryRun ? '=== DRY RUN ===' : '=== LOADING ==='}`);
      console.log(`${prospects.length} SEND contacts\n`);

      let loaded = 0, skipped = 0, failed = 0;
      for (const p of prospects) {
        const e = engineMap.get(p.id);
        if (!e || !e.email_body_t1) {
          console.log(`  SKIP ${p.first_name} ${p.last_name} — no email composed`);
          skipped++;
          continue;
        }
        const row = buildEngineRow(p, e);
        try {
          const result = await loadProspectToHubSpot(row, isDryRun);
          if (result.status === 'loaded' || result.status === 'dry-run') loaded++;
          else { skipped++; console.log(`    ${result.error || 'unknown'}`); }
        } catch (err: any) {
          failed++;
          console.log(`  FAIL ${p.first_name} ${p.last_name}: ${err.message?.slice(0, 80)}`);
        }
        if (!isDryRun) await new Promise(r => setTimeout(r, 500));
      }
      console.log(`\n=== ${isDryRun ? 'DRY RUN' : 'LOAD'} COMPLETE ===`);
      console.log(`Processed: ${loaded} | Skipped: ${skipped} | Failed: ${failed}`);
      break;
    }

    default:
      console.log(`
HubSpot Loader

Usage:
  npx tsx hubspot-loader.ts verify               Run 10-check pre-load verification
  npx tsx hubspot-loader.ts create-properties     Create missing showrev_* properties
  npx tsx hubspot-loader.ts dry-run               Preview what would be loaded
  npx tsx hubspot-loader.ts load                  Load prospects (runs verify first)
  npx tsx hubspot-loader.ts load --skip-verify    Load without verification gate

Env: HUBSPOT_PRIVATE_APP_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
`);
  }
}
