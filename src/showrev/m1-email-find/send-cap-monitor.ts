/**
 * Per-AE per-day send cap monitor — spec v6 Component 6 + v6.1 A4.
 *
 * Tiered caps per operator's 2026-06-11 throttle direction:
 *   - Day 1 (first day of sequence enrollment): 20 emails per AE
 *   - Day 2+: 30 emails per AE per day (steady state)
 *   - Ceiling: 50 emails per AE per day (never exceed — under HS 500/day)
 *
 * The cap is COUNT OF DISTINCT PROSPECTS ENROLLED PER AE PER UTC DAY.
 * Steady-state per-AE volume across all touches ~90/day (well under
 * HS 500/inbox/day limit per Q3).
 *
 * Reference: docs/showrev/POST-PORTAL-SPEC-V6.md §v6.1 A4 +
 *            COLD-EMAIL-BEST-PRACTICES.md v0.5 (operator throttle correction).
 *
 * Reads from sr_prospects.sequence_enrolled_at (timestamp set by AE
 * enrolling a prospect in HS UI — the watcher backfills this property
 * from HS engagement events).
 */

const SHOWREV_AE_DAY1_CAP = 20;
const SHOWREV_AE_DAILY_CAP = 30;
const SHOWREV_AE_CEILING = 50;

const KNOWN_AES = ['Mike Rutski', 'Nathan Dunn', 'Lucas Spencer'];

export type AeName = string;

export interface AeDayState {
  ae: AeName;
  enrolledToday: number;
  cap: number;
  ceiling: number;
  daysSinceFirstEnrollment: number;
  remaining: number;
  remainingToCeiling: number;
  utilizationPct: number;
  statusColor: 'green' | 'yellow' | 'red';
  warnings: string[];
}

export interface SendCapReport {
  asOfUtc: string;
  perAe: AeDayState[];
  cohortTotalEnrolledToday: number;
  cohortMaxAllowedToday: number;
  cohortRemaining: number;
}

function todayUtcDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetweenUtc(later: string, earlier: string): number {
  const lat = new Date(later);
  const ear = new Date(earlier);
  return Math.floor(
    (lat.getTime() - ear.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Get the daily cap for an AE based on days since their first enrollment.
 *   Day 0 (first day) → SHOWREV_AE_DAY1_CAP (20)
 *   Day 1+            → SHOWREV_AE_DAILY_CAP (30)
 */
export function getAeDailyCap(daysSinceFirstEnrollment: number): number {
  if (daysSinceFirstEnrollment <= 0) return SHOWREV_AE_DAY1_CAP;
  return SHOWREV_AE_DAILY_CAP;
}

function sbHeaders(): Record<string, string> {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  return url;
}

/**
 * Query sr_prospects for sequence_enrolled_at + assigned_ae across
 * the cohort. Returns enrollment history per AE.
 */
async function fetchEnrollmentHistory(): Promise<
  Array<{ ae: string; sequence_enrolled_at: string }>
> {
  const headers = sbHeaders();
  const url = `${sbUrl()}/rest/v1/sr_prospects?select=assigned_ae,sequence_enrolled_at&sequence_enrolled_at=not.is.null&limit=2000`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`fetchEnrollmentHistory failed: ${res.status}`);
  }
  const rows: Array<{
    assigned_ae: string | null;
    sequence_enrolled_at: string;
  }> = await res.json();
  return rows
    .filter((r) => r.assigned_ae && r.sequence_enrolled_at)
    .map((r) => ({
      ae: r.assigned_ae as string,
      sequence_enrolled_at: r.sequence_enrolled_at,
    }));
}

/**
 * Build a SendCapReport for "today" (UTC).
 */
export async function buildReport(): Promise<SendCapReport> {
  const enrollments = await fetchEnrollmentHistory();
  const today = todayUtcDateString();

  // Group enrollments by AE
  const byAe = new Map<string, string[]>();
  for (const e of enrollments) {
    if (!byAe.has(e.ae)) byAe.set(e.ae, []);
    byAe.get(e.ae)!.push(e.sequence_enrolled_at);
  }

  const perAe: AeDayState[] = [];
  let cohortToday = 0;
  let cohortAllowed = 0;

  // Ensure all known AEs show even if 0 enrollments
  const aesToReport = new Set<string>([...byAe.keys(), ...KNOWN_AES]);

  for (const ae of aesToReport) {
    const dates = (byAe.get(ae) || []).sort();
    const firstEnrollment = dates[0];
    const daysSinceFirst = firstEnrollment
      ? daysBetweenUtc(today, firstEnrollment.split('T')[0])
      : -1;

    const enrolledToday = dates.filter((d) => d.startsWith(today)).length;
    const cap = firstEnrollment ? getAeDailyCap(daysSinceFirst) : SHOWREV_AE_DAY1_CAP;
    const ceiling = SHOWREV_AE_CEILING;
    const remaining = Math.max(0, cap - enrolledToday);
    const remainingToCeiling = Math.max(0, ceiling - enrolledToday);
    const utilizationPct = cap > 0 ? (enrolledToday / cap) * 100 : 0;

    let statusColor: 'green' | 'yellow' | 'red' = 'green';
    if (enrolledToday >= ceiling) statusColor = 'red';
    else if (utilizationPct >= 95) statusColor = 'red';
    else if (utilizationPct >= 80) statusColor = 'yellow';

    const warnings: string[] = [];
    if (enrolledToday > cap) {
      warnings.push(
        `AE has exceeded today's cap (${enrolledToday}/${cap}). Stop enrolling more until tomorrow.`,
      );
    }
    if (enrolledToday >= ceiling) {
      warnings.push(
        `AE has hit ABSOLUTE CEILING (${enrolledToday}/${ceiling}). Any further enrollment violates throttle policy.`,
      );
    }

    perAe.push({
      ae,
      enrolledToday,
      cap,
      ceiling,
      daysSinceFirstEnrollment: daysSinceFirst,
      remaining,
      remainingToCeiling,
      utilizationPct,
      statusColor,
      warnings,
    });

    cohortToday += enrolledToday;
    cohortAllowed += cap;
  }

  return {
    asOfUtc: new Date().toISOString(),
    perAe: perAe.sort((a, b) => a.ae.localeCompare(b.ae)),
    cohortTotalEnrolledToday: cohortToday,
    cohortMaxAllowedToday: cohortAllowed,
    cohortRemaining: Math.max(0, cohortAllowed - cohortToday),
  };
}

/**
 * Should an AE enroll more prospects today? Returns false (with reasons)
 * once cap or ceiling is hit.
 */
export async function canAeEnrollMore(ae: AeName): Promise<{
  allowed: boolean;
  reason: string;
  state: AeDayState | null;
}> {
  const report = await buildReport();
  const state = report.perAe.find((s) => s.ae === ae);
  if (!state) {
    return { allowed: false, reason: `Unknown AE: ${ae}`, state: null };
  }
  if (state.enrolledToday >= state.ceiling) {
    return {
      allowed: false,
      reason: `${ae} has hit absolute ceiling (${state.enrolledToday}/${state.ceiling})`,
      state,
    };
  }
  if (state.enrolledToday >= state.cap) {
    return {
      allowed: false,
      reason: `${ae} has hit today's cap (${state.enrolledToday}/${state.cap}). Resume tomorrow.`,
      state,
    };
  }
  return {
    allowed: true,
    reason: `${ae}: ${state.enrolledToday}/${state.cap} today (${state.remaining} remaining before cap)`,
    state,
  };
}

/**
 * Format a SendCapReport as a CLI-friendly table.
 */
export function formatReport(report: SendCapReport): string {
  const lines: string[] = [];
  lines.push(`Send-cap report — ${report.asOfUtc}`);
  lines.push(
    `  Cohort: ${report.cohortTotalEnrolledToday}/${report.cohortMaxAllowedToday} enrolled today (${report.cohortRemaining} remaining)`,
  );
  lines.push('');
  lines.push(
    '  | AE             | Today | Cap | Day | Util | Status | Remaining |',
  );
  lines.push(
    '  |----------------|-------|-----|-----|------|--------|-----------|',
  );
  for (const s of report.perAe) {
    const color =
      s.statusColor === 'red' ? '🔴' : s.statusColor === 'yellow' ? '🟡' : '🟢';
    const day = s.daysSinceFirstEnrollment >= 0 ? `D${s.daysSinceFirstEnrollment}` : '—';
    lines.push(
      `  | ${s.ae.padEnd(14)} | ${String(s.enrolledToday).padStart(5)} | ${String(s.cap).padStart(3)} | ${day.padStart(3)} | ${s.utilizationPct.toFixed(0).padStart(3)}% | ${color}     | ${String(s.remaining).padStart(9)} |`,
    );
    for (const w of s.warnings) {
      lines.push(`    ⚠ ${w}`);
    }
  }
  return lines.join('\n');
}
