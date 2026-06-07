export interface BounceEvent {
  email: string;
  prospectId?: string;
  bounceType: 'hard' | 'soft' | 'unknown';
  timestamp: string;
  source: 'hubspot' | 'millionverifier' | 'manual';
}

export interface BatchStats {
  total: number;
  delivered: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  bounceRate: number;
  hardBounceRate: number;
}

export interface HaltDecision {
  shouldHalt: boolean;
  reason: string;
  stats: BatchStats;
}

const HARD_BOUNCE_HALT_THRESHOLD = 0.05;
const TOTAL_BOUNCE_HALT_THRESHOLD = 0.10;
const MIN_SAMPLE_SIZE = 10;

const events: BounceEvent[] = [];
let totalSent = 0;

export function recordSend(): void {
  totalSent++;
}

export function recordBounce(event: BounceEvent): void {
  events.push(event);
}

export function recordOutcome(email: string, bounced: boolean, bounceType: 'hard' | 'soft' | 'unknown' = 'unknown', source: 'hubspot' | 'millionverifier' | 'manual' = 'hubspot'): void {
  totalSent++;
  if (bounced) {
    events.push({ email, bounceType, timestamp: new Date().toISOString(), source });
  }
}

export function getBatchStats(): BatchStats {
  const bounced = events.length;
  const hardBounces = events.filter(e => e.bounceType === 'hard').length;
  const softBounces = events.filter(e => e.bounceType === 'soft').length;
  const delivered = totalSent - bounced;

  return {
    total: totalSent,
    delivered,
    bounced,
    hardBounces,
    softBounces,
    bounceRate: totalSent > 0 ? bounced / totalSent : 0,
    hardBounceRate: totalSent > 0 ? hardBounces / totalSent : 0,
  };
}

export function shouldHalt(): HaltDecision {
  const stats = getBatchStats();

  if (stats.total < MIN_SAMPLE_SIZE) {
    return { shouldHalt: false, reason: `sample too small (${stats.total}/${MIN_SAMPLE_SIZE})`, stats };
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

export function reset(): void {
  events.length = 0;
  totalSent = 0;
}

export function getEvents(): readonly BounceEvent[] {
  return events;
}

export async function seedFromSupabase(): Promise<void> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return;

  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/sr_brain_outcomes?select=prospect_id,t1_bounced`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (!res.ok) return;
    const rows: Array<{ prospect_id: string; t1_bounced: boolean | null }> = await res.json();
    for (const r of rows) {
      totalSent++;
      if (r.t1_bounced) {
        events.push({ email: r.prospect_id, bounceType: 'hard', timestamp: '', source: 'hubspot' });
      }
    }
  } catch {}
}
