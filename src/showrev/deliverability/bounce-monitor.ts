/**
 * Persistent bounce monitor — spec v6 Component 4.
 *
 * Replaces module-scope state (the previous version held events[] and
 * totalSent in memory, which reset on process restart and silently
 * disabled halt logic). All state now lives in sr_bounce_events with a
 * batch_id discriminator.
 *
 * Reference: docs/showrev/HUBSPOT-INTEGRATION-RESEARCH.md Q5, judge v2
 * must-fix #1, spec v6 Component 4.
 *
 * API surface preserved + extended:
 *   recordSend(batchId, email, prospectId?, sequenceStep=1)
 *   recordBounce(batchId, event)
 *   shouldHalt(batchId): based on rolling window of last 20-40 sends
 *   getBatchStats(batchId): same shape as before, computed from DB
 *
 * Threshold logic per Q5:
 *   - Hard bounce rate ≥ 5% → halt
 *   - Total bounce rate ≥ 10% → halt
 *   - ≥ 3 "Unknown user" / "Mailbox full" bounces in the rolling window
 *     → immediate halt (per Q5: these are auto-drop signals from HS)
 *   - Rolling window: 40 most-recent sends (per Breeze: 20-40 range)
 */

export interface BounceEvent {
  email: string;
  prospectId?: string;
  bounceType: 'hard' | 'soft' | 'unknown';
  source: 'hubspot' | 'millionverifier' | 'manual';
  sequenceStep?: number;
  bounceReason?: string;
}

export interface BatchStats {
  total: number;
  delivered: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  bounceRate: number;
  hardBounceRate: number;
  strongStops: number; // count of "Unknown user" + "Mailbox full" bounces
}

export interface HaltDecision {
  shouldHalt: boolean;
  reason: string;
  stats: BatchStats;
}

const HARD_BOUNCE_HALT_THRESHOLD = 0.05;
const TOTAL_BOUNCE_HALT_THRESHOLD = 0.10;
const MIN_SAMPLE_SIZE = 10;
const ROLLING_WINDOW = 40;
const STRONG_STOP_REASONS = new Set(['Unknown user', 'Mailbox full']);
const STRONG_STOP_THRESHOLD = 3;

function sbHeaders(): Record<string, string> {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function sbUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  return url;
}

/**
 * Record a send event. Idempotent per (batchId, email, event_type='send', sequenceStep)
 * — the UNIQUE constraint on sr_bounce_events will silently merge duplicate calls,
 * which is the desired behavior on retries.
 */
export async function recordSend(
  batchId: string,
  email: string,
  prospectId?: string,
  sequenceStep: number = 1,
): Promise<void> {
  const res = await fetch(`${sbUrl()}/rest/v1/sr_bounce_events`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      batch_id: batchId,
      email,
      prospect_id: prospectId || null,
      event_type: 'send',
      sequence_step: sequenceStep,
      source: 'hubspot',
    }),
  });
  // 409 on the UNIQUE constraint is a retry — silently OK.
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => '');
    throw new Error(`recordSend failed: ${res.status} ${text}`);
  }
}

/**
 * Record a bounce event. bounceType maps to event_type:
 *   'hard' → 'hard_bounce'
 *   'soft' → 'soft_bounce'
 *   'unknown' → 'hard_bounce' (treat as hard for safety)
 */
export async function recordBounce(
  batchId: string,
  event: BounceEvent,
): Promise<void> {
  const eventType =
    event.bounceType === 'soft' ? 'soft_bounce' : 'hard_bounce';
  const res = await fetch(`${sbUrl()}/rest/v1/sr_bounce_events`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      batch_id: batchId,
      email: event.email,
      prospect_id: event.prospectId || null,
      event_type: eventType,
      sequence_step: event.sequenceStep || 1,
      source: event.source,
      bounce_reason: event.bounceReason || null,
    }),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => '');
    throw new Error(`recordBounce failed: ${res.status} ${text}`);
  }
}

/**
 * Get aggregated batch stats from sr_bounce_events.
 * Rolling window: 40 most-recent sends + all their corresponding bounces.
 */
export async function getBatchStats(batchId: string): Promise<BatchStats> {
  const headers = sbHeaders();
  const base = sbUrl();

  // Last ROLLING_WINDOW sends
  const sendsRes = await fetch(
    `${base}/rest/v1/sr_bounce_events?batch_id=eq.${encodeURIComponent(
      batchId,
    )}&event_type=eq.send&select=email,timestamp&order=timestamp.desc&limit=${ROLLING_WINDOW}`,
    { headers },
  );
  if (!sendsRes.ok) throw new Error(`getBatchStats sends: ${sendsRes.status}`);
  const recentSends: Array<{ email: string; timestamp: string }> =
    await sendsRes.json();

  const sendEmails = recentSends.map((s) => s.email.toLowerCase());
  const total = recentSends.length;

  if (total === 0) {
    return {
      total: 0,
      delivered: 0,
      bounced: 0,
      hardBounces: 0,
      softBounces: 0,
      bounceRate: 0,
      hardBounceRate: 0,
      strongStops: 0,
    };
  }

  // All bounces in this batch for emails in the rolling window
  const inList = `(${sendEmails.map((e) => `"${e}"`).join(',')})`;
  const bouncesRes = await fetch(
    `${base}/rest/v1/sr_bounce_events?batch_id=eq.${encodeURIComponent(
      batchId,
    )}&event_type=in.(hard_bounce,soft_bounce)&email=in.${encodeURIComponent(
      inList,
    )}&select=event_type,bounce_reason`,
    { headers },
  );
  if (!bouncesRes.ok)
    throw new Error(`getBatchStats bounces: ${bouncesRes.status}`);
  const bounces: Array<{ event_type: string; bounce_reason: string | null }> =
    await bouncesRes.json();

  const hardBounces = bounces.filter(
    (b) => b.event_type === 'hard_bounce',
  ).length;
  const softBounces = bounces.filter(
    (b) => b.event_type === 'soft_bounce',
  ).length;
  const bounced = hardBounces + softBounces;
  const delivered = total - bounced;
  const strongStops = bounces.filter(
    (b) => b.bounce_reason && STRONG_STOP_REASONS.has(b.bounce_reason),
  ).length;

  return {
    total,
    delivered,
    bounced,
    hardBounces,
    softBounces,
    bounceRate: bounced / total,
    hardBounceRate: hardBounces / total,
    strongStops,
  };
}

/**
 * Decide whether to halt the batch.
 * Order of checks (per Q5):
 *   1. Sample-size guard — < 10 sends, don't halt prematurely
 *   2. Strong-stop count (Unknown user / Mailbox full) — these are
 *      auto-drop signals from HS; halt at 3+ even if other rates are low
 *   3. Hard bounce rate ≥ 5%
 *   4. Total bounce rate ≥ 10%
 */
export async function shouldHalt(batchId: string): Promise<HaltDecision> {
  const stats = await getBatchStats(batchId);

  if (stats.total < MIN_SAMPLE_SIZE) {
    return {
      shouldHalt: false,
      reason: `sample too small (${stats.total}/${MIN_SAMPLE_SIZE})`,
      stats,
    };
  }

  if (stats.strongStops >= STRONG_STOP_THRESHOLD) {
    return {
      shouldHalt: true,
      reason: `${stats.strongStops} Unknown user / Mailbox full bounces in rolling ${ROLLING_WINDOW} — immediate halt (per Q5)`,
      stats,
    };
  }

  if (stats.hardBounceRate >= HARD_BOUNCE_HALT_THRESHOLD) {
    return {
      shouldHalt: true,
      reason: `hard bounce rate ${(stats.hardBounceRate * 100).toFixed(1)}% exceeds ${HARD_BOUNCE_HALT_THRESHOLD * 100}% threshold`,
      stats,
    };
  }

  if (stats.bounceRate >= TOTAL_BOUNCE_HALT_THRESHOLD) {
    return {
      shouldHalt: true,
      reason: `total bounce rate ${(stats.bounceRate * 100).toFixed(1)}% exceeds ${TOTAL_BOUNCE_HALT_THRESHOLD * 100}% threshold`,
      stats,
    };
  }

  return { shouldHalt: false, reason: 'within acceptable limits', stats };
}

/**
 * Reset (wipe) a batch's events. Test utility — do NOT use in production.
 * Production restart-recovery happens naturally because state is in DB.
 */
export async function reset(batchId: string): Promise<void> {
  const res = await fetch(
    `${sbUrl()}/rest/v1/sr_bounce_events?batch_id=eq.${encodeURIComponent(batchId)}`,
    {
      method: 'DELETE',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`reset failed: ${res.status} ${text}`);
  }
}

/**
 * Get all events for a batch (test utility / debugging).
 */
export async function getEvents(batchId: string): Promise<unknown[]> {
  const res = await fetch(
    `${sbUrl()}/rest/v1/sr_bounce_events?batch_id=eq.${encodeURIComponent(
      batchId,
    )}&select=*&order=timestamp.asc`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`getEvents: ${res.status}`);
  return res.json();
}
