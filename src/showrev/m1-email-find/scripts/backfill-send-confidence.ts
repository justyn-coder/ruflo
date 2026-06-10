/**
 * Backfill sr_engine_output.send_confidence for existing pending prospects.
 *
 * Reads each pending row, computes the 3 axes + composite via the shared
 * send-confidence module, writes back as jsonb.
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-send-confidence.ts
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-send-confidence.ts --dry-run
 *   npx tsx src/showrev/m1-email-find/scripts/backfill-send-confidence.ts --run-id v2-mq81ejsu
 */

import 'dotenv/config';
import { computeSendConfidence } from '../evidence-tiering/send-confidence.js';

const DRY_RUN = process.argv.includes('--dry-run');
const RUN_ID_ARG = process.argv.find((a) => a.startsWith('--run-id='))?.split('=')[1];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars (.env). Source it first.');
  process.exit(1);
}

async function fetchPending() {
  const filter = RUN_ID_ARG
    ? `run_id=eq.${RUN_ID_ARG}`
    : `send_status=eq.pending&run_id=like.v2-mq*`;
  const url = `${SUPABASE_URL}/rest/v1/sr_engine_output?${filter}&select=id,prospect_id,first_name,last_name,company,send_status,confidence_color,email,icp_status,icp_volume_verdict,persona_bucket,intel_signal_strength,system_brief,research_summary,company_summary,challenger_insight,intel_talking_points&order=created_at.desc`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetch failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as Array<Record<string, unknown>>;
}

async function writeConfidence(id: string, confidence: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/sr_engine_output?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ send_confidence: confidence }),
  });
  if (!r.ok) throw new Error(`write failed for ${id}: ${r.status} ${await r.text()}`);
}

async function main() {
  console.log(`[backfill] mode=${DRY_RUN ? 'dry-run' : 'live'} ${RUN_ID_ARG ? `run_id=${RUN_ID_ARG}` : 'all-pending-v2'}`);
  const rows = await fetchPending();
  console.log(`[backfill] fetched ${rows.length} rows\n`);

  let updated = 0;
  const distribution = { high: 0, medium: 0, low: 0, cannot_send: 0 } as Record<string, number>;
  const samples: Array<{ name: string; company: string; composite: number; label: string; icp: number; email: number; substrate: number }> = [];

  for (const row of rows) {
    // research_summary is JSON ({composer_mode, tier_counts:{useDirectly,useToShape}, ...}).
    // Parse it so the substrate axis uses the real tier counts instead of
    // falling back to summary-length proxy.
    let useDirectly: number | null = null;
    let useToShape: number | null = null;
    let composerMode: string | null = null;
    try {
      const rs = row.research_summary;
      if (rs && typeof rs === 'string') {
        const parsed = JSON.parse(rs as string);
        if (parsed?.tier_counts) {
          useDirectly = parsed.tier_counts.useDirectly ?? parsed.tier_counts.use_directly ?? null;
          useToShape = parsed.tier_counts.useToShape ?? parsed.tier_counts.use_to_shape ?? null;
        }
        if (parsed?.composer_mode) composerMode = parsed.composer_mode;
      }
    } catch { /* leave as null — falls back to summary-length path */ }

    const conf = computeSendConfidence({
      icp_status: row.icp_status as string,
      icp_volume_verdict: row.icp_volume_verdict as string,
      persona_bucket: row.persona_bucket as string,
      intel_signal_strength: row.intel_signal_strength as string,
      email: row.email as string,
      confidence_color: row.confidence_color as string,
      system_brief: row.system_brief as string,
      use_directly_count: useDirectly,
      use_to_shape_count: useToShape,
      composer_mode: composerMode,
      research_summary: row.research_summary as string,
      company_summary: row.company_summary as string,
      challenger_insight: row.challenger_insight as string,
      intel_talking_points: row.intel_talking_points as string,
    });

    distribution[conf.composite.label] = (distribution[conf.composite.label] || 0) + 1;

    samples.push({
      name: `${row.first_name} ${row.last_name}`,
      company: row.company as string,
      composite: conf.composite.score,
      label: conf.composite.label,
      icp: conf.icp.score,
      email: conf.email.score,
      substrate: conf.substrate.score,
    });

    if (!DRY_RUN) {
      await writeConfidence(row.id as string, conf as unknown as object);
      updated++;
    }
  }

  // Sort samples by composite descending for human eyeball
  samples.sort((a, b) => b.composite - a.composite);

  console.log('=== Distribution ===');
  for (const [label, count] of Object.entries(distribution)) {
    console.log(`  ${label.padEnd(12)} ${count}`);
  }

  console.log('\n=== Top 10 by composite ===');
  samples.slice(0, 10).forEach((s, i) => {
    console.log(
      `  ${(i + 1).toString().padStart(2)}. ${s.composite.toString().padStart(5)} (${s.label.padEnd(12)}) ICP=${s.icp.toString().padStart(3)} Email=${s.email.toString().padStart(3)} Subs=${s.substrate.toString().padStart(3)}  ${s.name} / ${s.company}`,
    );
  });

  console.log('\n=== Bottom 10 by composite ===');
  samples.slice(-10).forEach((s, i) => {
    console.log(
      `  ${(samples.length - 10 + i + 1).toString().padStart(2)}. ${s.composite.toString().padStart(5)} (${s.label.padEnd(12)}) ICP=${s.icp.toString().padStart(3)} Email=${s.email.toString().padStart(3)} Subs=${s.substrate.toString().padStart(3)}  ${s.name} / ${s.company}`,
    );
  });

  console.log(`\n[backfill] ${DRY_RUN ? 'would have updated' : 'updated'} ${DRY_RUN ? rows.length : updated} rows`);
}

main().catch((err) => {
  console.error('[backfill] error:', err);
  process.exit(1);
});
