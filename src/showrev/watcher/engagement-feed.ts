/**
 * Watcher → Brain Feed
 * Reads prospect engagement signals from sr_microsite_events
 * and updates brain dossiers with engagement-driven intelligence.
 */

export interface EngagementSignal {
  prospectId: string;
  company: string;
  firstName: string;
  lastName: string;
  totalEvents: number;
  pageViews: number;
  assessViews: number;
  engagementScore: number;
  engagementLevel: 'hot' | 'warm' | 'cold';
  lastSeen: string;
  recentlyActive: boolean;
}

export interface BrainUpdate {
  prospectId: string;
  nextBestAction: string;
  inferredUrgency: string;
  engagementNote: string;
}

function deriveNextAction(signal: EngagementSignal): string {
  if (signal.assessViews > 0 && signal.engagementLevel === 'hot') {
    return `High engagement — ${signal.assessViews} assessment views. Prioritize direct outreach with assessment results.`;
  }
  if (signal.engagementLevel === 'hot') {
    return `Active engagement (${signal.totalEvents} events). Ready for personalized follow-up.`;
  }
  if (signal.engagementLevel === 'warm') {
    return `Moderate engagement. Send targeted content aligned to their viewing patterns.`;
  }
  return `Low engagement. Re-evaluate messaging angle or timing.`;
}

function deriveUrgency(signal: EngagementSignal): string {
  if (signal.recentlyActive && signal.engagementLevel === 'hot') return 'high';
  if (signal.recentlyActive || signal.engagementLevel === 'warm') return 'medium';
  return 'low';
}

export function computeBrainUpdates(signals: EngagementSignal[]): BrainUpdate[] {
  return signals
    .filter(s => s.engagementLevel !== 'cold')
    .map(s => ({
      prospectId: s.prospectId,
      nextBestAction: deriveNextAction(s),
      inferredUrgency: deriveUrgency(s),
      engagementNote: `${s.engagementLevel} (score ${s.engagementScore}): ${s.pageViews} page, ${s.assessViews} assess views. Last active ${s.lastSeen}.`,
    }));
}

export async function fetchEngagement(sbUrl: string, sbKey: string): Promise<EngagementSignal[]> {
  const res = await fetch(`${sbUrl}/rest/v1/v_prospect_engagement?order=engagement_score.desc`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch engagement: ${res.status}`);
  const rows = await res.json();
  return rows.map((r: any) => ({
    prospectId: r.prospect_id,
    company: r.company,
    firstName: r.first_name,
    lastName: r.last_name,
    totalEvents: r.total_events,
    pageViews: r.page_views,
    assessViews: r.assess_views,
    engagementScore: r.engagement_score,
    engagementLevel: r.engagement_level,
    lastSeen: r.last_seen,
    recentlyActive: r.recently_active,
  }));
}

export async function pushBrainUpdates(
  updates: BrainUpdate[],
  sbUrl: string,
  sbKey: string,
  verbose = false,
): Promise<number> {
  let updated = 0;
  for (const u of updates) {
    const res = await fetch(
      `${sbUrl}/rest/v1/sr_brain_dossiers?prospect_id=eq.${encodeURIComponent(u.prospectId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          next_best_action: u.nextBestAction,
          inferred_urgency: u.inferredUrgency,
          engagement_note: u.engagementNote,
        }),
      },
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        updated++;
        if (verbose) console.log(`  Updated brain: ${u.prospectId} → ${u.inferredUrgency}`);
      } else if (verbose) {
        console.log(`  No dossier found for ${u.prospectId} — skipped (PATCH matched 0 rows)`);
      }
    } else if (verbose) {
      console.log(`  Brain update failed for ${u.prospectId}: ${res.status}`);
    }
  }
  return updated;
}

export async function runFeed(verbose = false): Promise<{ fetched: number; updated: number }> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) throw new Error('Supabase key not set');

  const signals = await fetchEngagement(sbUrl, sbKey);
  if (verbose) console.log(`Fetched ${signals.length} engagement signals`);

  const updates = computeBrainUpdates(signals);
  if (verbose) console.log(`${updates.length} brain updates to push (warm/hot only)`);

  const updated = await pushBrainUpdates(updates, sbUrl, sbKey, verbose);
  return { fetched: signals.length, updated };
}
