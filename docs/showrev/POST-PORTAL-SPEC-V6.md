---
title: Post-Portal System Spec v6
status: ACTIVE
last_updated: 2026-06-11 19:00 EDT
version: v6
supersedes: /tmp/post-portal-system-spec-v1.md through v4.md (in repo as docs/showrev/POST-PORTAL-SPEC-V*.md if migrated)
breeze_research: docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md (Q1-Q16 all resolved)
---

# Post-Portal System Spec v6 (ship-ready)

**Operating principle:** Simplest architecture that maximizes client-HS safety + AE-trust preservation. When two approaches achieve the same safety outcome, prefer the simpler one. **Code that doesn't exist can't have a bug.**

---

## What changed v4 → v6

| Change | Why |
|---|---|
| **DROPPED Component 3 (Sequence enroller)** | Operator confirmed P1 architecture: AEs manually bulk-enroll from HubSpot active lists via UI's "Enroll contacts" button. No API enrollment needed. Eliminates entire scope-dependency on WatchTower + all the silent-skip / sender-disconnect failure modes. |
| **Component 2 Loader** uses legacy upsert-by-email | Single API call (Q9-followup). Avoids 409 recovery logic. Empirically verified working on WatchTower. |
| **Component 4 Bounce Monitor** schema fixed | `sequence_step` column added so UNIQUE constraint doesn't block multi-step events (judge v2 must-fix). |
| **Component 5 Watcher** SEQUENCE_SEND_DATE dynamic | Pulled from `MIN(sequence_enrolled_at)` per Q4; fallback to `now - 7 days` not `2026-01-01` (judge v2 must-fix). Adds polling for "Sequences errored" events per Q16. |
| **Component 6 Send-cap** is monitoring, not blocking | Since AEs enroll manually, we can't programmatically prevent over-sending. Component 6 tracks per-AE pacing + flags if AE approaches 500/day cap (Q10). |
| **NEW: HS API client wrapper module** | Records rate-limit headers, sleeps proactively when remaining low, distinguishes burst vs daily 429s (Q15). Used by Loader + Watcher. |
| **Endpoint URLs corrected** | Throughout: `/automation/sequences/2026-03/enrollments` (per Q1) NOT v3 form. (Note: dropped along with Component 3, but referenced in monitoring.) |
| **Total effort** | 9-12 hr → **5-6 hr**. |

---

## Three categories of work

1. **Code to write** (Components 1, 2, 4, 5, 6 + HS API wrapper)
2. **Operator setup tasks** (3 segments, 3 sequences, portal settings)
3. **AE playbook** (how AEs bulk-enroll from their list)

---

## Schema DDL (run before any code ships)

```sql
-- sr_prospects: track HS lifecycle + per-prospect post-portal state
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS hubspot_loaded_at TIMESTAMPTZ;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS dnc_reason TEXT;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS dnc_evidence JSONB;
ALTER TABLE sr_prospects ADD COLUMN IF NOT EXISTS sequence_enrolled_at TIMESTAMPTZ;
  -- Note: sequence_enrolled_at is populated by AE manual enrollment, NOT by us.
  -- We DETECT it by polling hs_sequences_actively_enrolled_count on the HS contact.

CREATE INDEX IF NOT EXISTS idx_sr_prospects_hubspot_loaded_at ON sr_prospects (hubspot_loaded_at);
CREATE INDEX IF NOT EXISTS idx_sr_prospects_sequence_enrolled_at ON sr_prospects (sequence_enrolled_at);

-- sr_bounce_events: persistent bounce monitor state (Q5 + judge v2 fix)
CREATE TABLE IF NOT EXISTS sr_bounce_events (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL,           -- pilot-fc2026-cold-{YYYY-MM-DD}-{N}
  email TEXT NOT NULL,
  prospect_id TEXT,
  event_type TEXT NOT NULL,         -- 'send' | 'hard_bounce' | 'soft_bounce' | 'sequence_error'
  sequence_step INT NOT NULL DEFAULT 1,
  source TEXT NOT NULL,             -- 'hubspot' | 'manual'
  bounce_reason TEXT,               -- 'Unknown user' | 'Mailbox full' | etc (per Q5)
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (batch_id, email, event_type, sequence_step)
);

CREATE INDEX IF NOT EXISTS idx_sr_bounce_events_batch ON sr_bounce_events (batch_id);

-- sr_dnc_log: every DNC decision with evidence (audit trail)
CREATE TABLE IF NOT EXISTS sr_dnc_log (
  id BIGSERIAL PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES sr_prospects (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,             -- 'existing_hs_contact' | 'domain_recent_activity' | 'null_email' | 'manual'
  evidence JSONB,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sr_dnc_log_prospect ON sr_dnc_log (prospect_id);

-- sr_hs_api_calls: rate-limit observability (NEW v6 — from Q15)
CREATE TABLE IF NOT EXISTS sr_hs_api_calls (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  rate_limit_remaining INT,         -- from X-HubSpot-RateLimit-Remaining
  rate_limit_max INT,                -- from X-HubSpot-RateLimit-Max
  rate_limit_interval_ms INT,        -- from X-HubSpot-RateLimit-Interval-Milliseconds
  daily_remaining INT,               -- from X-HubSpot-RateLimit-Daily-Remaining
  retry_count INT DEFAULT 0,
  policy_hit TEXT,                   -- if 429: 'burst' | 'daily' | 'sequences_inbox_daily'
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_hs_api_calls_timestamp ON sr_hs_api_calls (timestamp);
CREATE INDEX IF NOT EXISTS idx_sr_hs_api_calls_429 ON sr_hs_api_calls (timestamp) WHERE status_code = 429;
```

---

## Component 0: HS API client wrapper (NEW v6)

Foundational — Components 2, 5, 6 all use it.

```typescript
// src/showrev/m1-email-find/hs-api-client.ts (NEW)

interface HsApiResponse {
  status: number;
  data: any;
  rateLimits: {
    remaining: number;
    max: number;
    intervalMs: number;
    dailyRemaining?: number;
  };
}

const PROACTIVE_THROTTLE_THRESHOLD = 30; // sleep proactively if remaining < 30

export async function hsApi(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<HsApiResponse> {
  const url = `https://api.hubapi.com${path}`;
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN!;

  // Pre-flight: check our recent rate-limit observations from sr_hs_api_calls
  const recentRemaining = await getRecentRateLimitRemaining();
  if (recentRemaining !== null && recentRemaining < PROACTIVE_THROTTLE_THRESHOLD) {
    // Proactively sleep ~2 seconds to let the window roll
    await sleep(2000);
  }

  let retryCount = 0;
  while (true) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const rateLimits = {
      remaining: parseInt(res.headers.get('X-HubSpot-RateLimit-Remaining') || '0'),
      max: parseInt(res.headers.get('X-HubSpot-RateLimit-Max') || '0'),
      intervalMs: parseInt(res.headers.get('X-HubSpot-RateLimit-Interval-Milliseconds') || '10000'),
      dailyRemaining: parseInt(res.headers.get('X-HubSpot-RateLimit-Daily-Remaining') || '0') || undefined,
    };

    const data = await res.json().catch(() => null);

    // Log call to sr_hs_api_calls
    await logApiCall({
      endpoint: path, method, status: res.status,
      rateLimits, retryCount,
      policyHit: res.status === 429 ? (data?.policyName === 'DAILY' ? 'daily' : 'burst') : null,
    });

    if (res.status === 429) {
      // 429 decision tree per Q15
      const policy = data?.policyName || '';
      if (policy.includes('DAILY') || policy.includes('daily')) {
        // Daily limit hit — do NOT retry. Caller must defer to next day.
        throw new HsDailyLimitError(`Daily limit hit on ${path}`, rateLimits);
      }
      // Burst limit: wait window + jitter, retry
      const jitter = 250 + Math.floor(Math.random() * 750);
      await sleep(rateLimits.intervalMs + jitter);
      retryCount++;
      if (retryCount >= 5) throw new Error(`429 retry limit exceeded on ${path}`);
      continue;
    }

    if (!res.ok) throw new HsApiError(`${method} ${path}: ${res.status}`, data);
    return { status: res.status, data, rateLimits };
  }
}

export class HsDailyLimitError extends Error { /* with rateLimits info */ }
export class HsApiError extends Error { /* with response body */ }
```

**Effort:** ~1.5 hr build + smoke test against existing endpoints.

---

## Component 1: Pre-load Verify (EXISTING_HS_CONTACT)

Extends existing 10 verify checks with 1 new BLOCKING check.

```typescript
// Add to runVerify() in src/showrev/m1-email-find/hubspot-loader.ts

// CHECK 11: EXISTING_HS_CONTACT (blocking)
for (const prospect of prospects) {
  // Step 1: Null-email guard (judge fix)
  if (!prospect.email) {
    prospect.send_status = 'dnc';
    await insertDncLog(prospect.id, 'null_email', { prospect_id: prospect.id });
    continue;
  }

  // Step 2: Direct email-match check via hsApi (HS API wrapper)
  const searchRes = await hsApi('/crm/v3/objects/contacts/search', 'POST', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: prospect.email }] }],
    properties: ['email', 'lifecyclestage', 'notes_last_contacted', 'hubspot_owner_id'],
  });

  if (searchRes.data.results?.length > 0) {
    const existing = searchRes.data.results[0];
    prospect.send_status = 'dnc';
    prospect.hubspot_contact_id = existing.id;
    prospect.dnc_reason = 'existing_hs_contact';
    prospect.dnc_evidence = {
      hs_contact_id: existing.id,
      hs_lifecycle_stage: existing.properties.lifecyclestage,
      notes_last_contacted: existing.properties.notes_last_contacted,
      hubspot_owner_id: existing.properties.hubspot_owner_id,
      found_via: 'email_match',
    };
    await insertDncLog(prospect.id, 'existing_hs_contact', prospect.dnc_evidence);
    continue;
  }

  // Step 3: Domain-level secondary check (90 days)
  const domain = prospect.email.split('@')[1];
  const domainRes = await hsApi('/crm/v3/objects/contacts/search', 'POST', {
    filterGroups: [{ filters: [
      { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: `@${domain}` },
      { propertyName: 'notes_last_contacted', operator: 'GTE', value: new Date(Date.now() - 90*86400*1000).toISOString() },
    ]}],
    properties: ['email', 'notes_last_contacted', 'hubspot_owner_id'],
    limit: 5,
  });

  if (domainRes.data.results?.length > 0) {
    prospect.send_status = 'dnc';
    prospect.dnc_reason = 'domain_recent_activity';
    prospect.dnc_evidence = {
      same_domain_contact_count: domainRes.data.results.length,
      sample_contact: domainRes.data.results[0],
      found_via: 'domain_match_within_90d',
    };
    await insertDncLog(prospect.id, 'domain_recent_activity', prospect.dnc_evidence);
    continue;
  }

  // Step 4: Proceed — new contact, zero collision risk
}

// Write DNC CSV for operator review
await writeDncCsv(`data/showrev/dnc-${date}.csv`);
```

**Effort:** ~1 hr.

---

## Component 2: HS Loader (Path A — legacy upsert)

Uses the empirically-confirmed working legacy endpoint.

```typescript
// Replaces the create/update branching in current loadProspectToHubSpot()

export async function loadProspectToHubSpot(row: EngineRow, dryRun: boolean = true) {
  // Pre-check: prospect must have passed verify + composition_review + operator send_status='send'
  if (row.send_status !== 'send' || row.composition_review !== 'approved') {
    return { status: 'skipped', reason: 'not yet ship-approved' };
  }
  if (row.hubspot_loaded_at) return { status: 'skipped', reason: 'already loaded' };

  const contactProps = buildContactProps(row);  // existing buildContactProps logic

  // Find or create company first (existing logic unchanged)
  const companyId = await findOrCreateCompany(row);

  if (dryRun) {
    console.log(`[DRY] Would upsert ${row.email} + associate to company ${companyId}`);
    return { status: 'dry-run' };
  }

  // Path A: legacy upsert-by-email (single call, no 409 logic)
  const upsertRes = await hsApi(
    `/contacts/v1/contact/createOrUpdate/email/${encodeURIComponent(row.email)}`,
    'POST',
    { properties: Object.entries(contactProps).map(([property, value]) => ({ property, value: String(value) })) }
  );
  const contactId = upsertRes.data.vid;

  // Associate to company via v4 (existing pattern, confirmed working)
  if (companyId) {
    await hsApi(
      `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`,
      'PUT',
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]
    );
  }

  // Write local timestamps
  await supabase.from('sr_prospects').update({
    hubspot_contact_id: String(contactId),
    hubspot_loaded_at: new Date().toISOString(),
  }).eq('id', row.prospect_id);

  return { status: 'created', contactId };
}
```

**Effort:** ~1.5 hr (mostly testing).

---

## Component 4: Bounce Monitor (persistent, sequence_step-aware)

Replaces module-scope state in `bounce-monitor.ts`. Same API surface, persistent backend.

```typescript
// Updated src/showrev/deliverability/bounce-monitor.ts

const HARD_BOUNCE_HALT_THRESHOLD = 0.05;
const TOTAL_BOUNCE_HALT_THRESHOLD = 0.10;
const ROLLING_WINDOW = 40;  // per Q5: 20-40 send rolling denominator

export async function recordSend(
  batchId: string,
  email: string,
  prospectId: string,
  sequenceStep: number = 1
): Promise<void> {
  await supabase.from('sr_bounce_events').insert({
    batch_id: batchId, email, prospect_id: prospectId,
    event_type: 'send', sequence_step: sequenceStep,
    source: 'hubspot',
  });
}

export async function recordBounce(
  batchId: string,
  event: { email: string; prospectId?: string; bounceType: 'hard'|'soft'; sequenceStep?: number; reason?: string }
): Promise<void> {
  await supabase.from('sr_bounce_events').insert({
    batch_id: batchId, email: event.email, prospect_id: event.prospectId || null,
    event_type: event.bounceType === 'hard' ? 'hard_bounce' : 'soft_bounce',
    sequence_step: event.sequenceStep || 1,
    source: 'hubspot', bounce_reason: event.reason || null,
  });
}

export async function shouldHalt(batchId: string): Promise<HaltDecision> {
  // Get last ROLLING_WINDOW sends + their corresponding bounces
  const { data: recentSends } = await supabase
    .from('sr_bounce_events')
    .select('email, timestamp')
    .eq('batch_id', batchId)
    .eq('event_type', 'send')
    .order('timestamp', { ascending: false })
    .limit(ROLLING_WINDOW);

  if (!recentSends || recentSends.length < 10) {
    return { shouldHalt: false, reason: 'sample too small', stats: null };
  }

  const sendEmails = recentSends.map(s => s.email);
  const { data: bounces } = await supabase
    .from('sr_bounce_events')
    .select('event_type, bounce_reason')
    .eq('batch_id', batchId)
    .in('event_type', ['hard_bounce', 'soft_bounce'])
    .in('email', sendEmails);

  const hardBounces = (bounces || []).filter(b => b.event_type === 'hard_bounce').length;
  const total = recentSends.length;
  const hardBounceRate = hardBounces / total;
  const totalBounceRate = (bounces?.length || 0) / total;

  if (hardBounceRate >= HARD_BOUNCE_HALT_THRESHOLD) {
    return { shouldHalt: true, reason: `hard bounce rate ${(hardBounceRate*100).toFixed(1)}% exceeds 5%`, stats: { hardBounces, total } };
  }
  if (totalBounceRate >= TOTAL_BOUNCE_HALT_THRESHOLD) {
    return { shouldHalt: true, reason: `total bounce rate ${(totalBounceRate*100).toFixed(1)}% exceeds 10%`, stats: { hardBounces, total } };
  }

  // Per Q5: Unknown user / Mailbox full → especially strong signals
  const strongStops = (bounces || []).filter(b =>
    b.bounce_reason === 'Unknown user' || b.bounce_reason === 'Mailbox full'
  ).length;
  if (strongStops >= 3) {
    return { shouldHalt: true, reason: `${strongStops} Unknown user / Mailbox full bounces — immediate halt`, stats: { strongStops, total } };
  }

  return { shouldHalt: false, reason: 'within limits', stats: { hardBounces, total } };
}
```

**Effort:** ~2 hr.

---

## Component 5: Watcher (dynamic cutoff + error events)

Updates `watcher.ts` with dynamic SEQUENCE_SEND_DATE + Sequences errored event polling.

```typescript
// Updated src/showrev/m1-email-find/watcher.ts

// REMOVED: const SEQUENCE_SEND_DATE = '2026-06-02T00:00:00Z';

async function getSequenceSendCutoff(): Promise<Date> {
  const { data } = await supabase
    .from('sr_prospects')
    .select('sequence_enrolled_at')
    .not('sequence_enrolled_at', 'is', null)
    .order('sequence_enrolled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  // v3+ fix: fallback to now - 7 days, NOT 2026-01-01 (which floods with pre-outreach noise)
  if (!data?.sequence_enrolled_at) return new Date(Date.now() - 7*86400*1000);
  return new Date(data.sequence_enrolled_at);
}

// Adaptive polling per Q4 recommendation:
async function adaptivePoll() {
  const cutoff = await getSequenceSendCutoff();
  const now = Date.now();
  const minutesSinceCutoff = (now - cutoff.getTime()) / 60000;

  let pollIntervalMs: number;
  if (minutesSinceCutoff < 15) {
    pollIntervalMs = 30000 + Math.random() * 30000;  // 30-60s for fresh sends
  } else {
    pollIntervalMs = 60000 + Math.random() * 60000;  // 60-120s normal
  }
  // After 2 hours, back off to 5min
  if (minutesSinceCutoff > 120) pollIntervalMs = 5 * 60 * 1000;

  await poll();
  setTimeout(adaptivePoll, pollIntervalMs);
}

// NEW per Q16: poll Sequences errored events alongside engagement
// (Implementation depends on HS event API surface — out of scope this round
//  if we don't have Sequences scope. Defer to v7.)
```

**Effort:** ~1 hr (mostly cutoff + adaptive polling logic).

---

## Component 6: Send-cap (monitoring, not blocking)

Since AEs enroll manually, we don't gate enrollment. We OBSERVE the rate.

```typescript
// src/showrev/deliverability/send-cap-monitor.ts (NEW)

export async function getAeSendStats(aeName: string): Promise<AeStats> {
  const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0);

  // Count contacts in the AE's HubSpot sequence today via watcher data
  const { count } = await supabase
    .from('sr_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_ae', aeName)
    .gte('sequence_enrolled_at', todayStart.toISOString());

  return {
    enrolled_today: count || 0,
    daily_cap: 500,                              // per Q10: 500 sequence emails/day per user
    approaching_cap: (count || 0) >= 450,
    sequences_inbox_cap: 1000,                   // per Q1: 1,000 enrollments/inbox/day
  };
}

// Surface in portal: dashboard widget showing per-AE today's enrollments
// vs 500 cap — alert if any AE > 450 (warning) or > 480 (red)
```

**Effort:** ~1 hr.

---

## Compliance — Unsubscribe (operator-managed)

**Unsubscribe link is enabled at the Sequences level**, not in our composer code. Operator controls this per sequence in HS UI: Sequences → {sequence} → Settings → Unsubscribe.

HS injects the unsubscribe link **below the signature** automatically when the toggle is on.

**Implications for our composer:**
- Email body content should END with the signature (`Mike Rutski | Inorsa | mike@inorsa.com`)
- Our `email_ps_t1` (P.S. line) is rendered via the `showrev_pre_show_t1_ps` token in the sequence template — placement within the template (above vs below signature) is operator-configured
- We do NOT add any unsubscribe text in our composer — HS handles it
- We do NOT need code-side suppression list — HS honors the unsubscribe per-contact globally

**Validation checklist (operator action item):**
- ☐ All 3 P2 sequences (Mike T1, Nathan T1, Lucas T1) have Unsubscribe enabled
- ☐ Signature placement = last line of body content
- ☐ P.S. line placement decided (above or below signature — operator preference)
- ☐ Test enrollment fires a real email with visible unsubscribe link

---

## Out of scope this round

The following came up during spec discussion but belong in separate workstreams to keep this spec focused:

### Microsite tracking (deferred to separate spec)

Operator confirmed: build OUR OWN tracking, do NOT embed HubSpot's `hs-script-loader` JS on microsites. Reasons:
- `fiber.inorsa.com` isn't in Inorsa's HS tracked-domains list → HS attribution wouldn't work reliably
- We want richer event data than HS's generic page-view (assess completion, section scrolling, CTA clicks, time on page)
- We own the data, lives in our `sr_microsite_events` table
- Privacy: no cookies needed if we design that way

Architecture (deferred):
- Phase 1: Next.js API route `/api/track` → `sr_microsite_events` (~2 hr)
- Phase 2 (only if AEs need it): bridge worker posts notable events to HS Custom Events API for contact timeline visibility (~1-2 hr)

Will be specced separately when prioritized.

---

## Operator setup tasks (one-time, in HS UI)

### 1. P2 Active Lists (3 segments)

Create in HS Settings → Lists:
- `FC2026 P2 - Mike Rutski Sends`
- `FC2026 P2 - Nathan Dunn Sends`
- `FC2026 P2 - Lucas Spencer Sends`

Filter per list: `showrev_assigned_ae = {AE name}` AND `showrev_engagement_slug = inorsa-fiberconnect-2026-cold`

### 2. P2 Sequences (3 sequences) — OR reuse P1

**Option A — Reuse P1 sequences** (`FC2026 — Mike T1`, etc.) — works if our P2 email copy maps to the same `showrev_pre_show_t1_*` properties our loader writes.

**Option B — Clone for P2** — separate `FC2026 — Mike T1 (P2 Cold)` etc. if you want different copy/cadence. Personalization tokens pull from same showrev_* properties.

Recommendation: Option A initially for simplicity. Migrate to Option B if P2 needs different cadence.

### 3. Portal settings to verify

- ✅ Settings → Objects → Companies → "Create and associate companies with contacts" → confirm OFF (we associate explicitly to avoid wrong-company picks)
- ✅ Settings → Objects → Contacts → Record Customization → ShowRev Intelligence + ShowRev Pre-Show cards exist (confirmed via operator screenshot)
- ✅ Settings → Objects → Companies → Record Customization → ShowRev Intelligence card exists (confirmed via operator screenshot)

---

## AE playbook (the manual step)

For each AE:

1. **Open their list** — `FC2026 P2 - {AE} Sends` in HS Lists
2. **Review the contacts** — make sure showrev_* properties look reasonable (research summary, talking points)
3. **Select all** in the list (or a daily batch of 8-10 per our pacing recommendation from Q8)
4. **Click "Enroll contacts"** → choose `FC2026 — {AE} T1` sequence
5. **Confirm** — HS sends step 1 ASAP, schedules subsequent steps per sequence settings

**Pacing guidance (per Q8 + Q10):**
- 8-10 enrollments per AE per day with random spacing
- Stay well under 500/AE/day cap (binding limit on Sales Pro)
- Don't bulk-enroll all 30 at once — HS UI throttles at 3 emails/min anyway, but human pacing is better

---

## Red-team v6

### Concern 1: AE forgets to enroll
**Mitigation:** Component 6 portal widget shows "X contacts ready in your list, last enrollment Y days ago." Operator pings AE if no enrollment for >2 days.

### Concern 2: Sender daily-send silent skip
**Mitigation:** Component 6 monitors per-AE enrollments today; alerts when approaching 500/day cap. AE pauses before silent-skip hazard.

### Concern 3: AE enrolls in WRONG sequence (e.g., P1 sequence for P2 contact)
**Mitigation:** Operator playbook + sequence naming convention. Long-term: portal-side AE-facing dashboard suggesting "your queue + recommended sequence."

### Concern 4: Contact already in another sequence
**Mitigation:** HubSpot natively blocks one-sequence-at-a-time (per operator's prior Breeze research). UI will refuse enrollment with a clear error. No code-side fix needed.

### Concern 5: AE leaves company / inbox disconnects mid-sequence
**Mitigation:** Component 5 (watcher) polls "Sequences errored" events per Q16. Alerts operator within minutes. Operator can manually reroute the prospect or unenroll.

### Concern 6: Pipeline rerun overwrites operator decisions
**Mitigation:** Operator-lock guard already shipped earlier in this session. Pipeline reruns skip prospects with `send_status='send'` or `'dnc'`.

### Concern 7: Bounce monitor process restart loses state
**Mitigation:** Persistent state in sr_bounce_events — no module-scope loss. Resumes seamlessly.

### Concern 8: HS API rate limit hit
**Mitigation:** HS API wrapper module proactively throttles when remaining < 30. 429 decision tree per Q15.

---

## Ship order (revised)

1. Schema DDL (5 min)
2. HS API client wrapper (Component 0) — 1.5 hr
3. Component 4 Bounce monitor persistence — 2 hr
4. Component 1 EXISTING_HS_CONTACT pre-load — 1 hr
5. Component 2 Loader (Path A) — 1.5 hr
6. Component 6 Send-cap monitoring widget — 1 hr
7. Component 5 Watcher dynamic cutoff + adaptive polling — 1 hr

**Total: ~8 hr** (with smoke tests + integration time = ~10 hr realistic).

---

## v6.1 Amendments (2026-06-11, post-research integration)

Four changes absorbed from COLD-EMAIL-BEST-PRACTICES.md + operator clarifications. All within scope of existing components — no new components added.

### A1. Schema DDL: add `sr_email_experiments` table

For per-send metadata + outcomes (test-and-learn infrastructure).

```sql
CREATE TABLE IF NOT EXISTS sr_email_experiments (
  id BIGSERIAL PRIMARY KEY,
  prospect_id TEXT REFERENCES sr_prospects (id),
  ae_name TEXT NOT NULL,
  sequence_id TEXT,
  step_n INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ NOT NULL,
  day_of_week_utc INT,
  hour_of_day_utc INT,
  recipient_timezone TEXT,
  hour_of_day_recipient_local INT,
  subject_text TEXT,
  subject_pattern TEXT,
  body_word_count INT,
  paragraph_count INT,
  sentence_count INT,
  has_question_count INT,
  has_cta BOOLEAN,
  cta_type TEXT,
  personalization_signal TEXT,
  verified_substrate_claim_count INT,
  ps_present BOOLEAN,
  ps_variant TEXT,
  ps_includes_link BOOLEAN,
  signature_format TEXT,
  link_count INT,
  has_microsite_link BOOLEAN,
  has_external_link BOOLEAN,
  microsite_variant TEXT,
  composer_model TEXT,
  send_confidence_score NUMERIC,
  send_confidence_label TEXT,
  outcome_at_24h TEXT,
  outcome_at_3d TEXT,
  outcome_at_7d TEXT,
  reply_sentiment TEXT,
  meeting_booked BOOLEAN DEFAULT FALSE,
  meeting_booked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_experiments_prospect ON sr_email_experiments (prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_experiments_ae ON sr_email_experiments (ae_name);
CREATE INDEX IF NOT EXISTS idx_email_experiments_sent_at ON sr_email_experiments (sent_at);
CREATE INDEX IF NOT EXISTS idx_email_experiments_outcomes ON sr_email_experiments (outcome_at_7d);
```

### A2. Component 1 — add SPF/DKIM/DMARC pre-flight check

Sender-domain DNS posture must be valid before any cold send. **Verified compliant today** (2026-06-11): inorsa.com has SPF (including HubSpot portal 20729069), 2048-bit DKIM CNAMEs (hs1/hs2), and DMARC at p=quarantine. The check guards against silent regression.

```typescript
// Add as CHECK 12 in runVerify() (after EXISTING_HS_CONTACT)
async function verifySpfDkimDmarc(): Promise<{ pass: boolean; details: string[] }> {
  const details: string[] = [];
  const spf = await dnsResolveTxt('inorsa.com');
  const hasSpfHs = spf.some(r => r.includes('20729069.spf03.hubspotemail.net'));
  if (!hasSpfHs) details.push('SPF missing HubSpot portal 20729069 include');

  const dkim1 = await dnsResolveCname('hs1-20729069._domainkey.inorsa.com').catch(() => null);
  const dkim2 = await dnsResolveCname('hs2-20729069._domainkey.inorsa.com').catch(() => null);
  if (!dkim1 || !dkim2) details.push(`DKIM CNAMEs missing: hs1=${!!dkim1}, hs2=${!!dkim2}`);

  const dmarc = await dnsResolveTxt('_dmarc.inorsa.com');
  const hasDmarc = dmarc.some(r => r.includes('v=DMARC1'));
  if (!hasDmarc) details.push('DMARC record missing or invalid');

  return { pass: details.length === 0, details };
}
```

Failure = BLOCKING (cannot proceed to load).

### A3. Component 2 — branch engagement slug on `lead_type`

P1 booth-visitor warm sends and P2 cold prospects need separate active lists in HubSpot to avoid cross-pollination. Single line in loader.

```typescript
// In contactProps construction:
const engagementSlug = row.lead_type === 'Cold'
  ? 'inorsa-fiberconnect-2026-cold'
  : 'inorsa-fiberconnect-2026';
contactProps.showrev_engagement_slug = engagementSlug;
```

Operator creates 3 P2 lists in HS UI with filter `showrev_engagement_slug = inorsa-fiberconnect-2026-cold` + their AE filter.

### A4. Component 6 — tiered daily caps (Day 1 = 20, Day 2+ = 30, ceiling = 50)

Per operator's 2026-06-11 throttle correction. Cap is per-AE-per-day, applied at enrollment time.

```typescript
// In send-cap-monitor.ts
const SHOWREV_AE_DAY1_CAP = 20;
const SHOWREV_AE_DAILY_CAP = 30;
const SHOWREV_AE_DAILY_CAP_CEILING = 50;

function getAeDailyCap(daysSinceStart: number): number {
  if (daysSinceStart === 0) return SHOWREV_AE_DAY1_CAP;
  return SHOWREV_AE_DAILY_CAP;
}

// daysSinceStart = days between today and earliest sequence_enrolled_at for this AE
// Component 6 dashboard widget shows: per-AE today's enrollments / cap, color-coded
// >80% of cap = yellow warning
// >95% of cap = red (block via Component 6 if AE tries to enroll above)
```

### A5. T2/T3 = post-launch data-driven (NOT pre-launch scope)

Per operator: *"we don't know what T2 nor T3 will look like."*

Ship T1 single-step at launch. After ≥10 replies received from T1 cohort → analyze reply sentiment + objections + persona patterns → design T2 content informed by data, not generic 5-day-follow-up template. Same gate for T3.

**Net for spec v6 components:** no T2/T3 work pre-launch. Loader writes T1 only (existing behavior, correct). HS sequences stay single-step at P2 launch (matches current P1 architecture).

### Total amendment delta

- Schema: +1 table, +4 indexes (Apply via Supabase MCP)
- Component 1: +1 new check (SPF/DKIM/DMARC verify)
- Component 2: +1 line (slug branch)
- Component 6: +3 constants + 1 function (tiered caps)
- **Effort delta: ~45 min** (mostly Component 1 DNS verification logic)

### Status

✅ v6.1 amendments captured. Ready for code. Spec v6 + this amendment block = canonical source for implementation.

**Smoke test gates between each component.** Don't ship all at once.

---

## Decision gates before ship

1. ✅ Operator approves spec v6
2. ✅ Schema DDL applied (5 min)
3. ✅ HS API wrapper + smoke test against existing endpoints
4. ✅ Component 4 + smoke test (insert send → simulate bounce → verify shouldHalt fires)
5. ✅ Component 1 + dry-run on cohort (verify DNC CSV looks right)
6. ✅ Component 2 + dry-run on 1 prospect (verify HS state + local timestamp)
7. ✅ Operator confirms 3 P2 segments exist
8. ✅ Operator confirms 3 sequences ready (reuse P1 or clone)
9. ✅ Live load 5-prospect smoke batch
10. ✅ One AE enrolls from their list, sends first batch
11. ✅ Watcher observes engagement events
12. ✅ Operator authorizes full P2 rollout

---

## Version history

| Version | Date (EST) | Change |
|---|---|---|
| v1 | 2026-06-11 14:30 | Initial system spec + Breeze prompts |
| v2 | 2026-06-11 15:30 | Judge must-fixes 1-3 + corrections + schema DDL |
| v3 | 2026-06-11 15:50 | Judge v2 must-fixes (sequence_step column, Step 4.5 pseudocode) |
| v4 | 2026-06-11 16:05 | Judge v3 must-fix (recordSend signature alignment) |
| v5 | 2026-06-11 16:25 | Operator-flagged Breeze constraints integrated (1-sequence, silent skip, cold-lead warning) |
| **v6** | **2026-06-11 19:00** | **All 14 Breeze questions resolved. Component 3 (Sequence enroller) DROPPED — AE manual enrollment per P1 architecture. Path A legacy upsert for Component 2. HS API client wrapper added. Send-cap is monitoring not blocking. Adaptive watcher polling. Total effort 5-6 hr.** |
