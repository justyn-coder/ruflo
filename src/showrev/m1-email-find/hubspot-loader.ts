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

// --- Property creation (run once) ---
const CONTACT_PROPERTIES_TO_CREATE = [
  { name: 'showrev_decision_authority', label: 'ShowRev: Decision Authority', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_talking_points', label: 'ShowRev: Talking Points', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_microsite_url', label: 'ShowRev: Microsite URL', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_booth_notes', label: 'ShowRev: Booth Notes', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_other_stakeholders', label: 'ShowRev: Other Stakeholders', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_challenger_insight', label: 'ShowRev: Challenger Insight', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_linkedin_summary', label: 'ShowRev: LinkedIn Summary', type: 'string', groupName: 'contactinformation' },
  { name: 'showrev_likely_objections', label: 'ShowRev: Likely Objections', type: 'string', groupName: 'contactinformation' },
];

const COMPANY_PROPERTIES_TO_CREATE = [
  { name: 'showrev_company_summary', label: 'ShowRev: Company Summary', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_company_size', label: 'ShowRev: Company Size', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_fiber_activities', label: 'ShowRev: Fiber Activities', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_bead_status', label: 'ShowRev: BEAD Status', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_growth_signals', label: 'ShowRev: Growth Signals', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_competitive_landscape', label: 'ShowRev: Competitive Landscape', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_key_projects', label: 'ShowRev: Key Projects', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_recent_news', label: 'ShowRev: Recent News', type: 'string', groupName: 'companyinformation' },
  { name: 'showrev_external_deadlines', label: 'ShowRev: External Deadlines', type: 'string', groupName: 'companyinformation' },
];

export async function createMissingProperties(): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const prop of CONTACT_PROPERTIES_TO_CREATE) {
    try {
      await hsApi('/crm/v3/properties/contacts', 'POST', { ...prop, fieldType: 'textarea' });
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
}

function decomposeEmail(body: string): { para1: string; para2: string; para3: string; para4: string } {
  const lines = body.split('\n');
  // Remove salutation line (e.g., "Chris,")
  const startIdx = lines.findIndex((l, i) => i > 0 && l.trim() !== '') > 0
    ? lines.findIndex((l, i) => i > 0 && l.trim() !== '')
    : 1;

  const contentLines = lines.slice(startIdx).join('\n').trim();
  // Split on blank lines to get paragraphs
  const paragraphs = contentLines.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Remove signature lines (AE Name | Inorsa | email)
  const filtered = paragraphs.filter(p => !p.includes('| Inorsa |'));

  return {
    para1: filtered[0] || '',
    para2: filtered[1] || '',
    para3: filtered[2] || '',
    para4: filtered[3] || '',
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

  const aeOwnerId = AE_OWNER_IDS[row.assigned_ae] || AE_OWNER_IDS['Lucas Spencer'];
  const signalMapped = SIGNAL_MAP[row.intel_signal_strength] || 'ORANGE';
  const personaMapped = PERSONA_MAP[row.persona_bucket] || 'core_icp';

  // Decompose email bodies into paragraph tokens for Sequence templates
  const t1Parts = decomposeEmail(row.email_body_t1 || '');
  const t2Parts = decomposeEmail(row.email_body_t2 || '');
  const t3Parts = decomposeEmail(row.email_body_t3 || '');

  const contactProps: Record<string, string> = {
    email: row.email,
    firstname: row.first_name,
    lastname: row.last_name,
    jobtitle: row.title,
    showrev_research_summary: (row.research_summary || '').slice(0, 2000),
    showrev_engagement_slug: 'inorsa-fiberconnect-2026',
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
    // T1 email decomposed for Sequence template tokens
    ...(row.email_subject_t1 ? { showrev_pre_show_t1_subject: row.email_subject_t1 } : {}),
    ...(t1Parts.para1 ? { showrev_pre_show_t1_para1: t1Parts.para1 } : {}),
    ...(t1Parts.para2 ? { showrev_pre_show_t1_para2: t1Parts.para2 } : {}),
    ...(t1Parts.para3 ? { showrev_pre_show_t1_para3: t1Parts.para3 } : {}),
    ...(t1Parts.para4 ? { showrev_pre_show_t1_para4: t1Parts.para4 } : {}),
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

// CLI
if (process.argv[1]?.includes('hubspot-loader')) {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'create-properties':
      createMissingProperties().then(r => {
        console.log(`Created: ${r.created.length}`);
        console.log(`Skipped: ${r.skipped.length}`);
        if (r.errors.length) console.log(`Errors: ${r.errors.join(', ')}`);
      });
      break;

    case 'dry-run':
      console.log('Dry-run mode. Reads from sr_engine_output via Supabase REST.');
      console.log('TODO: implement batch load from Supabase');
      break;

    default:
      console.log(`
HubSpot Loader

Usage:
  npx tsx hubspot-loader.ts create-properties    Create missing showrev_* properties in HubSpot
  npx tsx hubspot-loader.ts dry-run              Preview what would be loaded (no writes)
  npx tsx hubspot-loader.ts load                 Load prospects to HubSpot

Requires: HUBSPOT_PRIVATE_APP_TOKEN env var
Protocol: domain-search → company create/find → contact create → associate
`);
  }
}
