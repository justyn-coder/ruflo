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

function sbHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function sbUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

// --- Cutoff: only count events AFTER sequences were sent ---
const SEQUENCE_SEND_DATE = '2026-06-02T00:00:00Z';

// --- HubSpot engagement properties (request both naming conventions) ---
const ENGAGEMENT_PROPS = [
  'email', 'firstname', 'lastname',
  'showrev_assigned_ae', 'showrev_engagement_slug', 'showrev_outreach_cohort',
  'hs_sales_email_last_opened', 'hs_email_last_open_date',
  'hs_sales_email_last_clicked', 'hs_email_last_click_date',
  'hs_sales_email_last_replied', 'hs_email_last_reply_date',
  'hs_email_bounce', 'hs_email_is_ineligible',
  'hs_sequences_is_enrolled', 'hs_sequences_actively_enrolled_count',
  'notes_last_contacted', 'hs_last_sales_activity_date',
  'num_associated_deals',
];

// --- Fetch all ShowRev contacts from HubSpot with engagement data ---
async function fetchHsContacts(): Promise<any[]> {
  const all: any[] = [];
  let after: string | undefined;

  do {
    const body: any = {
      filterGroups: [{
        filters: [{ propertyName: 'showrev_pilot_owner', operator: 'EQ', value: 'true' }],
      }],
      properties: ENGAGEMENT_PROPS,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await hsApi('/crm/v3/objects/contacts/search', 'POST', body);
    all.push(...(res.results || []));
    after = res.paging?.next?.after;
  } while (after);

  return all;
}

// --- Get prospect mapping: email → { id, assigned_ae } ---
async function getProspectMap(): Promise<Map<string, any>> {
  const res = await fetch(
    `${sbUrl()}/rest/v1/sr_prospects?send_status=eq.send&select=id,email,assigned_ae,first_name,last_name`,
    { headers: sbHeaders() },
  );
  const prospects: any[] = await res.json();
  const map = new Map<string, any>();
  for (const p of prospects) {
    if (p.email) map.set(p.email.toLowerCase(), p);
  }
  return map;
}

// --- Extract engagement events from HubSpot contact properties ---
function extractEvents(contact: any, prospectMap: Map<string, any>): any[] {
  const props = contact.properties;
  const email = props.email?.toLowerCase();
  if (!email) return [];

  const prospect = prospectMap.get(email);
  const prospectId = prospect?.id || null;
  const ae = props.showrev_assigned_ae || prospect?.assigned_ae || '';
  const base = { prospect_id: prospectId, event_source: 'hubspot', contact_email: email };
  const meta = { ae, hs_contact_id: contact.id };

  const events: any[] = [];
  const cutoff = new Date(SEQUENCE_SEND_DATE).getTime();
  const isAfterCutoff = (ts: string | null) => ts && new Date(ts).getTime() >= cutoff;

  const openedAt = props.hs_sales_email_last_opened || props.hs_email_last_open_date;
  if (isAfterCutoff(openedAt)) {
    events.push({ ...base, event_type: 'opened', hs_event_id: `${email}:opened`,
      event_data: { ...meta, timestamp: openedAt } });
  }

  const clickedAt = props.hs_sales_email_last_clicked || props.hs_email_last_click_date;
  if (isAfterCutoff(clickedAt)) {
    events.push({ ...base, event_type: 'clicked', hs_event_id: `${email}:clicked`,
      event_data: { ...meta, timestamp: clickedAt } });
  }

  const repliedAt = props.hs_sales_email_last_replied || props.hs_email_last_reply_date;
  if (isAfterCutoff(repliedAt)) {
    events.push({ ...base, event_type: 'replied', hs_event_id: `${email}:replied`,
      event_data: { ...meta, timestamp: repliedAt } });
  }

  const bounce = props.hs_email_bounce;
  if (bounce && bounce !== '0' && bounce !== 'false') {
    events.push({ ...base, event_type: 'bounced', hs_event_id: `${email}:bounced`,
      event_data: { ...meta, bounce_data: bounce } });
  }

  // deals: skip — HubSpot num_associated_deals is cumulative (includes pre-outreach deals).
  // Meeting bookings are logged manually via operator confirmation, not auto-polled.

  return events;
}

// --- Upsert events to sr_outcomes (dedup by hs_event_id) ---
async function upsertOutcomes(events: any[]): Promise<number> {
  if (!events.length) return 0;

  const res = await fetch(`${sbUrl()}/rest/v1/sr_outcomes?on_conflict=hs_event_id`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(events),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert: ${res.status} ${err}`);
  }

  const rows: any[] = await res.json();
  return rows.length;
}

// --- Poll command ---
async function poll(): Promise<void> {
  console.log('Polling HubSpot for engagement events...\n');

  const prospectMap = await getProspectMap();
  console.log(`${prospectMap.size} SEND contacts in Supabase`);

  const contacts = await fetchHsContacts();
  console.log(`${contacts.length} ShowRev contacts in HubSpot\n`);

  const allEvents: any[] = [];
  for (const c of contacts) {
    allEvents.push(...extractEvents(c, prospectMap));
  }

  if (!allEvents.length) {
    console.log('No engagement events yet. Prospects haven\'t opened/clicked/replied.');
    return;
  }

  const written = await upsertOutcomes(allEvents);
  console.log(`${written} events written to sr_outcomes\n`);

  const byType = new Map<string, string[]>();
  for (const e of allEvents) {
    if (!byType.has(e.event_type)) byType.set(e.event_type, []);
    byType.get(e.event_type)!.push(e.contact_email);
  }
  for (const [type, emails] of byType) {
    console.log(`  ${type}: ${emails.length} contacts`);
  }
}

// --- Status command ---
async function status(): Promise<void> {
  const h = sbHeaders();
  const base = sbUrl();

  const [pRes, oRes, mRes] = await Promise.all([
    fetch(`${base}/rest/v1/sr_prospects?send_status=eq.send&select=id,email,assigned_ae`, { headers: h }),
    fetch(`${base}/rest/v1/sr_outcomes?event_source=eq.hubspot&select=*`, { headers: h }),
    fetch(`${base}/rest/v1/sr_microsite_events?select=id,prospect_id,event_type`, { headers: h }),
  ]);

  const prospects: any[] = await pRes.json();
  const outcomes: any[] = await oRes.json();
  const msEvents: any[] = await mRes.json();
  const totalSent = prospects.length;

  const byType = new Map<string, Set<string>>();
  for (const o of outcomes) {
    const key = o.contact_email || o.prospect_id || 'unknown';
    if (!byType.has(o.event_type)) byType.set(o.event_type, new Set());
    byType.get(o.event_type)!.add(key);
  }

  const count = (t: string) => byType.get(t)?.size || 0;
  const pct = (n: number) => totalSent ? `${Math.round(n / totalSent * 100)}%` : '-';
  const views = msEvents.filter(e => e.event_type === 'page_view').length;
  const viewContacts = new Set(msEvents.filter(e => e.event_type === 'page_view').map(e => e.prospect_id)).size;

  console.log('=== ENGAGEMENT STATUS ===\n');
  console.log(`Sent:     ${totalSent}`);
  console.log(`Opened:   ${count('opened')} (${pct(count('opened'))})`);
  console.log(`Clicked:  ${count('clicked')} (${pct(count('clicked'))})`);
  console.log(`Replied:  ${count('replied')} (${pct(count('replied'))})`);
  console.log(`Bounced:  ${count('bounced')} (${pct(count('bounced'))})`);
  console.log(`Meetings: ${count('meeting_booked')}`);
  console.log(`Microsite views: ${views} (${viewContacts} unique contacts)\n`);

  // AE breakdown
  const aeStats = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();
  for (const p of prospects) {
    const ae = p.assigned_ae || 'Unassigned';
    if (!aeStats.has(ae)) aeStats.set(ae, { sent: 0, opened: 0, clicked: 0, replied: 0 });
    aeStats.get(ae)!.sent++;
  }
  for (const o of outcomes) {
    const ae = o.event_data?.ae || 'Unknown';
    if (!aeStats.has(ae)) aeStats.set(ae, { sent: 0, opened: 0, clicked: 0, replied: 0 });
    const s = aeStats.get(ae)!;
    if (o.event_type === 'opened') s.opened++;
    if (o.event_type === 'clicked') s.clicked++;
    if (o.event_type === 'replied') s.replied++;
  }

  console.log('By AE:');
  for (const [ae, s] of aeStats) {
    console.log(`  ${ae}: ${s.sent} sent, ${s.opened} opened, ${s.clicked} clicked, ${s.replied} replied`);
  }

  if (!outcomes.length) {
    console.log('\nNo engagement events yet. Run "poll" to fetch from HubSpot.');
  }
}

// --- Learn command: feed outcomes into Brain tables ---
async function learn(): Promise<void> {
  const h = sbHeaders();
  const base = sbUrl();

  // 1. Get all SEND prospects with engine data + outcomes + microsite events
  const [pRes, eRes, oRes, mRes] = await Promise.all([
    fetch(`${base}/rest/v1/sr_prospects?send_status=eq.send&select=id,email,first_name,last_name,company,assigned_ae`, { headers: h }),
    fetch(`${base}/rest/v1/sr_engine_output?select=prospect_id,influence_pattern_t1,influence_pattern_t2,influence_pattern_t3,persona_bucket,intel_signal_strength`, { headers: h }),
    fetch(`${base}/rest/v1/sr_outcomes?event_source=eq.hubspot&select=prospect_id,event_type,contact_email,event_data`, { headers: h }),
    fetch(`${base}/rest/v1/sr_microsite_events?event_type=eq.page_view&select=prospect_id`, { headers: h }),
  ]);

  const prospects: any[] = await pRes.json();
  const engine: any[] = await eRes.json();
  const outcomes: any[] = await oRes.json();
  const msEvents: any[] = await mRes.json();

  const engineMap = new Map<string, any>();
  for (const e of engine) engineMap.set(e.prospect_id, e);

  const outcomeMap = new Map<string, Set<string>>();
  for (const o of outcomes) {
    if (!outcomeMap.has(o.prospect_id)) outcomeMap.set(o.prospect_id, new Set());
    outcomeMap.get(o.prospect_id)!.add(o.event_type);
  }

  const msViewSet = new Set(msEvents.map((e: any) => e.prospect_id));

  // 2. Fetch existing brain_outcomes to preserve manually-set sentiments
  const existingBoRes = await fetch(`${base}/rest/v1/sr_brain_outcomes?select=prospect_id,t1_reply_sentiment,angle_that_landed,objection_encountered,ae_notes,meeting_booked,meeting_booked_at`, { headers: h });
  const existingBo: any[] = await existingBoRes.json();
  const existingBoMap = new Map(existingBo.map((b: any) => [b.prospect_id, b]));

  // Build sr_brain_outcomes rows (one per prospect), preserving existing sentiments
  const brainOutcomes: any[] = [];
  for (const p of prospects) {
    const eng = engineMap.get(p.id);
    if (!eng) continue;
    const events = outcomeMap.get(p.id) || new Set();
    const existing = existingBoMap.get(p.id);

    brainOutcomes.push({
      prospect_id: p.id,
      t1_opened: events.has('opened'),
      t1_replied: events.has('replied'),
      t1_reply_sentiment: existing?.t1_reply_sentiment || (events.has('replied') ? 'unclassified' : null),
      t1_bounced: events.has('bounced'),
      microsite_viewed: msViewSet.has(p.id),
      microsite_booking_clicked: events.has('clicked'),
      meeting_booked: existing?.meeting_booked || events.has('meeting_booked'),
      meeting_booked_at: existing?.meeting_booked_at || null,
      angle_that_landed: existing?.angle_that_landed || (events.has('replied') ? eng.influence_pattern_t1 : null),
      objection_encountered: existing?.objection_encountered || null,
      ae_notes: existing?.ae_notes || null,
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert to sr_brain_outcomes
  if (brainOutcomes.length) {
    const res = await fetch(`${base}/rest/v1/sr_brain_outcomes?on_conflict=prospect_id`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(brainOutcomes),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`brain_outcomes upsert: ${res.status} ${err}`);
    }
    const rows: any[] = await res.json();
    console.log(`sr_brain_outcomes: ${rows.length} rows written\n`);
  }

  // 3. Aggregate by pattern → sr_brain_outreach_patterns
  const patternStats = new Map<string, { sent: number; opened: number; replied: number; personas: Set<string>; signals: Set<string> }>();

  for (const p of prospects) {
    const eng = engineMap.get(p.id);
    if (!eng || !eng.influence_pattern_t1) continue;
    const pattern = eng.influence_pattern_t1;
    const events = outcomeMap.get(p.id) || new Set();

    if (!patternStats.has(pattern)) {
      patternStats.set(pattern, { sent: 0, opened: 0, replied: 0, personas: new Set(), signals: new Set() });
    }
    const s = patternStats.get(pattern)!;
    s.sent++;
    if (events.has('opened')) s.opened++;
    if (events.has('replied')) s.replied++;
    if (eng.persona_bucket) s.personas.add(eng.persona_bucket);
    if (eng.intel_signal_strength) s.signals.add(eng.intel_signal_strength);
  }

  const patternRows: any[] = [];
  for (const [name, s] of patternStats) {
    const rate = s.sent > 0 ? s.replied / s.sent : 0;
    const confidence = s.sent >= 10 ? 'high' : s.sent >= 5 ? 'medium' : 'low';

    // Which personas replied?
    const repliedPersonas = new Set<string>();
    for (const p of prospects) {
      const eng = engineMap.get(p.id);
      if (!eng || eng.influence_pattern_t1 !== name) continue;
      const events = outcomeMap.get(p.id) || new Set();
      if (events.has('replied') && eng.persona_bucket) repliedPersonas.add(eng.persona_bucket);
    }

    const noReplyPersonas = new Set([...s.personas].filter(x => !repliedPersonas.has(x)));

    patternRows.push({
      pattern_type: 'influence',
      pattern_name: name,
      pattern_description: `T1 influence pattern used in FC2026 booth outreach`,
      sample_size: s.sent,
      success_rate: Math.round(rate * 100) / 100,
      confidence,
      works_best_for: repliedPersonas.size ? [...repliedPersonas].join(', ') : null,
      does_not_work_for: noReplyPersonas.size ? [...noReplyPersonas].join(', ') : null,
      source_client: 'inorsa',
      source_show: 'fiber-connect-2026',
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert to sr_brain_outreach_patterns
  if (patternRows.length) {
    const res = await fetch(`${base}/rest/v1/sr_brain_outreach_patterns?on_conflict=pattern_name`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(patternRows),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`brain_outreach_patterns upsert: ${res.status} ${err}`);
    }
    const rows: any[] = await res.json();
    console.log(`sr_brain_outreach_patterns: ${rows.length} rows written\n`);
  }

  // 4. Print what the Brain now knows
  console.log('=== BRAIN LEARNINGS ===\n');
  console.log('Pattern performance (T1 touch, FC2026 booth):');
  const sorted = [...patternStats.entries()].sort((a, b) => {
    const rateA = a[1].sent > 0 ? a[1].replied / a[1].sent : 0;
    const rateB = b[1].sent > 0 ? b[1].replied / b[1].sent : 0;
    return rateB - rateA;
  });
  for (const [name, s] of sorted) {
    const rate = s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0;
    const confidence = s.sent >= 10 ? 'HIGH' : s.sent >= 5 ? 'MED' : 'LOW';
    console.log(`  ${name}: ${s.replied}/${s.sent} replied (${rate}%) [${confidence} confidence]`);
  }

  console.log('\nHow the composer uses this:');
  console.log('  1. Reads sr_brain_outreach_patterns WHERE source_client = current client');
  console.log('  2. Ranks patterns by success_rate (weighted by confidence)');
  console.log('  3. For a new prospect: matches persona_bucket → works_best_for');
  console.log('  4. Selects highest-performing pattern that fits the persona');
  console.log('  5. Falls back to challenger_insight (default) if no match');
}

// --- Classify command: read reply content from HubSpot, classify sentiment ---

const OOO_PATTERNS = [
  /out of (the )?office/i, /\booo\b/i, /automatic reply/i, /auto[- ]?reply/i,
  /away from/i, /on leave/i, /limited access/i, /\breturning\b/i,
  /on (annual |parental |maternity |paternity )?leave/i, /will be out/i,
  /currently (out|away|on)/i,
];

const MEETING_PATTERNS = [
  /\bbooked\b/i, /\bconfirmed\b/i, /looking forward to connect/i,
  /on .* calendar/i, /meeting (is )?(set|scheduled|confirmed)/i,
];

const POSITIVE_PATTERNS = [
  /\byes\b/i, /let'?s set up/i, /sounds (good|great|interesting)/i,
  /\bavailable\b.*\b(next|this)\b/i, /happy to (chat|talk|meet|connect|discuss)/i,
  /would (like|love) to/i, /i'?m interested/i, /let'?s (do|schedule|find)/i,
  /works for me/i, /count me in/i,
];

const WARM_DECLINE_PATTERNS = [
  /not the right time/i, /not a (good )?fit/i, /parallel to.*services/i,
  /we already have/i, /we use.*similar/i, /not (currently )?looking/i,
  /maybe (later|next)/i, /circle back/i, /revisit/i,
];

const NEGATIVE_PATTERNS = [
  /unsubscribe/i, /remove me/i, /not interested/i, /stop (emailing|contacting)/i,
  /do not contact/i, /take me off/i,
];

function classifySentiment(subject: string, body: string, hasMeeting: boolean): string {
  if (hasMeeting) return 'meeting_booked';
  const text = `${subject} ${body}`;
  if (OOO_PATTERNS.some(p => p.test(text))) return 'ooo';
  if (MEETING_PATTERNS.some(p => p.test(text))) return 'meeting_booked';
  if (NEGATIVE_PATTERNS.some(p => p.test(text))) return 'negative';
  if (WARM_DECLINE_PATTERNS.some(p => p.test(text))) return 'warm_decline';
  if (POSITIVE_PATTERNS.some(p => p.test(text))) return 'positive';
  return 'unclassified';
}

async function classify(): Promise<void> {
  const h = sbHeaders();
  const base = sbUrl();
  const cutoff = new Date(SEQUENCE_SEND_DATE).getTime();

  // 1. Get all replied contacts from sr_outcomes
  const oRes = await fetch(
    `${base}/rest/v1/sr_outcomes?event_type=eq.replied&event_source=eq.hubspot&select=prospect_id,contact_email,event_data`,
    { headers: h }
  );
  const replies: any[] = await oRes.json();
  if (!replies.length) { console.log('No replies to classify.'); return; }

  // 2. Get prospect names for display
  const pRes = await fetch(
    `${base}/rest/v1/sr_prospects?send_status=eq.send&select=id,first_name,last_name,company`,
    { headers: h }
  );
  const prospects: any[] = await pRes.json();
  const prospectMap = new Map(prospects.map((p: any) => [p.id, p]));

  // 3. Get existing brain_outcomes to check which need classification
  const boRes = await fetch(
    `${base}/rest/v1/sr_brain_outcomes?select=prospect_id,t1_reply_sentiment`,
    { headers: h }
  );
  const brainOutcomes: any[] = await boRes.json();
  const sentimentMap = new Map(brainOutcomes.map((b: any) => [b.prospect_id, b.t1_reply_sentiment]));

  console.log(`Classifying ${replies.length} replies...\n`);

  let classified = 0;
  let skipped = 0;

  for (const reply of replies) {
    const existing = sentimentMap.get(reply.prospect_id);
    const preserveExisting = existing && !['positive', 'unclassified'].includes(existing);
    const p = prospectMap.get(reply.prospect_id);
    const name = p ? `${p.first_name} ${p.last_name}` : reply.contact_email;
    const company = p?.company || '';

    if (preserveExisting) {
      console.log(`  ${name} (${company}): SKIP — already classified as "${existing}"`);
      skipped++;
      continue;
    }

    // 4. Read actual reply content from HubSpot Engagements API
    const hsContactId = reply.event_data?.hs_contact_id;
    if (!hsContactId) {
      console.log(`  ${name} (${company}): SKIP — no HubSpot contact ID`);
      skipped++;
      continue;
    }

    let replySubject = '';
    let replyBody = '';
    try {
      const engRes = await hsApi(`/engagements/v1/engagements/associated/CONTACT/${hsContactId}/paged?limit=20`);
      const incoming = (engRes.results || [])
        .filter((e: any) =>
          e.engagement?.type === 'INCOMING_EMAIL' &&
          new Date(e.engagement.timestamp).getTime() >= cutoff
        )
        .sort((a: any, b: any) => b.engagement.timestamp - a.engagement.timestamp);

      if (incoming.length > 0) {
        const meta = incoming[0].metadata || {};
        replySubject = meta.subject || '';
        replyBody = meta.text || meta.body || '';
      }
    } catch (err: any) {
      console.log(`  ${name} (${company}): API error — ${err.message?.slice(0, 60)}`);
    }

    // 5. Check for meeting associations
    let hasMeeting = false;
    try {
      const meetRes = await hsApi(`/crm/v3/objects/contacts/${hsContactId}/associations/meetings`);
      const meetings = (meetRes.results || []);
      if (meetings.length > 0) hasMeeting = true;
    } catch {}

    // 6. Classify
    const sentiment = classifySentiment(replySubject, replyBody, hasMeeting);

    console.log(`  ${name} (${company}): ${sentiment}`);
    if (replyBody) console.log(`    "${replyBody.slice(0, 100).replace(/\n/g, ' ')}..."`);

    // 7. Update sr_brain_outcomes
    if (sentiment !== 'unclassified') {
      const updateRes = await fetch(
        `${base}/rest/v1/sr_brain_outcomes?prospect_id=eq.${reply.prospect_id}`,
        {
          method: 'PATCH',
          headers: { ...h, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ t1_reply_sentiment: sentiment, updated_at: new Date().toISOString() }),
        }
      );
      if (updateRes.ok) classified++;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone: ${classified} classified, ${skipped} skipped (already set or no data)`);
}

// --- Deliverability command: feed bounce data into deliverability monitor ---
async function deliverability(): Promise<void> {
  const { recordOutcome: recordDel, getBatchStats, shouldHalt } = await import('../deliverability/index.js');
  const { evaluateConfidence } = await import('../deliverability/index.js');

  const h = sbHeaders();
  const base = sbUrl();

  const [pRes, oRes, eRes] = await Promise.all([
    fetch(`${base}/rest/v1/sr_prospects?send_status=eq.send&select=id,email,first_name,last_name,company`, { headers: h }),
    fetch(`${base}/rest/v1/sr_outcomes?event_source=eq.hubspot&select=prospect_id,event_type,contact_email`, { headers: h }),
    fetch(`${base}/rest/v1/sr_engine_output?select=prospect_id,email_confidence,domain_mismatch`, { headers: h }),
  ]);

  const prospects: any[] = await pRes.json();
  const outcomes: any[] = await oRes.json();
  const engine: any[] = await eRes.json();

  const engineMap = new Map<string, any>();
  for (const e of engine) engineMap.set(e.prospect_id, e);

  const outcomeByProspect = new Map<string, Set<string>>();
  for (const o of outcomes) {
    if (!outcomeByProspect.has(o.prospect_id)) outcomeByProspect.set(o.prospect_id, new Set());
    outcomeByProspect.get(o.prospect_id)!.add(o.event_type);
  }

  console.log('=== DELIVERABILITY REPORT ===\n');

  const redProspects: string[] = [];
  const yellowProspects: string[] = [];

  for (const p of prospects) {
    const events = outcomeByProspect.get(p.id) || new Set();
    const bounced = events.has('bounced');
    const eng = engineMap.get(p.id);
    const confidence = eng?.email_confidence || 'unknown';
    const mismatch = eng?.domain_mismatch || false;

    recordDel(p.email, bounced, bounced ? 'hard' : 'unknown');

    const gate = evaluateConfidence(p.email, confidence, undefined, mismatch);

    if (gate.color === 'red') {
      redProspects.push(`  🔴 ${p.first_name} ${p.last_name} (${p.company}) — score ${gate.score}, ${gate.reasons.join(', ')}${bounced ? ' [BOUNCED]' : ''}`);
    } else if (gate.color === 'yellow') {
      yellowProspects.push(`  🟡 ${p.first_name} ${p.last_name} (${p.company}) — score ${gate.score}, ${gate.reasons.join(', ')}`);
    }
  }

  const stats = getBatchStats();
  const halt = shouldHalt();

  console.log(`Total sent: ${stats.total}`);
  console.log(`Delivered:  ${stats.delivered}`);
  console.log(`Bounced:    ${stats.bounced} (${(stats.bounceRate * 100).toFixed(1)}%)`);
  console.log(`Hard:       ${stats.hardBounces} (${(stats.hardBounceRate * 100).toFixed(1)}%)`);
  console.log(`Halt?       ${halt.shouldHalt ? '⛔ YES' : '✅ NO'} — ${halt.reason}\n`);

  if (redProspects.length) {
    console.log(`RED gate (${redProspects.length} — do NOT send):`);
    redProspects.forEach(r => console.log(r));
    console.log();
  }

  if (yellowProspects.length) {
    console.log(`YELLOW gate (${yellowProspects.length} — verify before sending):`);
    yellowProspects.forEach(r => console.log(r));
    console.log();
  }

  const greenCount = prospects.length - redProspects.length - yellowProspects.length;
  console.log(`GREEN gate: ${greenCount} prospects clear to send`);
}

// CLI
if (process.argv[1]?.includes('watcher')) {
  const cmd = process.argv[2] || 'help';

  switch (cmd) {
    case 'poll':
      poll().catch(err => { console.error('Poll failed:', err.message); process.exit(1); });
      break;

    case 'status':
      status().catch(err => { console.error('Status failed:', err.message); process.exit(1); });
      break;

    case 'learn':
      learn().catch(err => { console.error('Learn failed:', err.message); process.exit(1); });
      break;

    case 'classify':
      classify().catch(err => { console.error('Classify failed:', err.message); process.exit(1); });
      break;

    case 'deliverability':
      deliverability().catch(err => { console.error('Deliverability check failed:', err.message); process.exit(1); });
      break;

    default:
      console.log(`
ShowRev Watcher — HubSpot engagement poller + Brain feed

Usage:
  npx tsx watcher.ts poll            Fetch engagement events from HubSpot → sr_outcomes
  npx tsx watcher.ts status          Show engagement stats (opens, clicks, replies, microsites)
  npx tsx watcher.ts learn           Feed outcomes into Brain (sr_brain_outcomes + sr_brain_outreach_patterns)
  npx tsx watcher.ts classify        Read reply content from HubSpot, classify sentiment
  npx tsx watcher.ts deliverability  Run deliverability audit (bounce rates, confidence gates, halt check)

Env: HUBSPOT_PRIVATE_APP_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
`);
  }
}
