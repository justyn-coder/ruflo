/**
 * Stat Library — Phase B v1.1 (pure, deterministic, citation-backed).
 *
 * INTENT (spec §1):
 *   Kill the fabricated-stat class in P.S. composition. Composers paste a
 *   pre-curated `claimText` verbatim or omit the P.S. — never interpolate.
 *
 * NON-GOALS:
 *   - No DB reads (sr_company_evidence is company-scoped; would misattribute
 *     industry stats — explicitly excluded per spec §2 + db-integrity audit).
 *   - No LLM tagging.
 *   - No I/O after module load EXCEPT a sync append to miss-log on cache miss.
 *
 * GUARANTEES:
 *   1. Sidecar files are validated by zod at module load. Malformed schema,
 *      future publishedDate, numericValue != claimText numeric token,
 *      unknown URL domain, unknown topic/applicability tag -> THROW at load.
 *      Pipeline fails fast. No silent vendor fallback (red-team cut from v1).
 *   2. Per-call NOW (test-overridable via opts.nowOverride) — prevents
 *      long-running-process drift (PM critique).
 *   3. recencyMonths > 24 is a HARD cutoff, not a decay (red-team cut).
 *   4. Sort is byte-stable: (rankScore desc, id asc).
 *   5. Returned arrays are frozen.
 *   6. Miss-log append is SYNC (not async — async swallowed errors per RT).
 *
 * SHAPE (spec §4):
 *   getVerifiedStat(topic, persona, prospectTags, opts?) -> readonly stat[]
 *   Throws NoVerifiedStatError on zero matches (after sync miss-log append).
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// ---------- Controlled vocabulary (spec §4) ----------

/** Persona vocab — the 5 personas the library can target.
 *  Aligned to influence.ts PersonaBucket conceptually but at a finer grain
 *  (CEO/COO/VP_Eng/VP_Ops/PM) for stat-routing precision. The composer
 *  boundary translates PersonaBucket -> Persona. */
export const PERSONAS = ['CEO', 'COO', 'VP_Eng', 'VP_Ops', 'PM'] as const;
export type Persona = (typeof PERSONAS)[number];

/** Source tier vocab — weighted in rankScore. */
export const SOURCE_TIERS = ['primary', 'trade', 'vendor'] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

/** Topic tags — controlled enum (spec §4). Adding a value requires
 *  updating Bucket->Topic map in `bucket-topic-map.ts`. */
export const TOPIC_TAGS = [
  'permit-cycle', // legacy alias retained for back-compat with research notes
  'drawing-cycle',
  'bead',
  'gis-cad',
  'middle-mile',
  'operator-survey',
  'diagnostic',
  'permit',
  'peer-pattern',
  'capacity',
  'ops-cost',
] as const;
export type TopicTag = (typeof TOPIC_TAGS)[number];

/** Applicability tags — prospect-segment intersection gate (spec §3 step 2). */
export const APPLICABILITY_TAGS = [
  'bead-funded',
  'rural-middle-mile',
  'private-clec',
  'ftth',
  'tower-co',
] as const;
export type ApplicabilityTag = (typeof APPLICABILITY_TAGS)[number];

// ---------- Public types (spec §4) ----------

export interface VerifiedStat {
  id: string;
  claimText: string;
  numericValue: string;
  topicTags: TopicTag[];
  applicabilityTags: ApplicabilityTag[];
  source: { title: string; url: string; publishedDate: string };
  sourceTier: SourceTier;
  /** Months since publishedDate, computed per-call at query time. */
  recencyMonths: number;
  /** Composite rank: tierWeight*0.6 + recencyDecay*0.4. */
  rankScore: number;
  personaFit: Persona[];
}

export class NoVerifiedStatError extends Error {
  readonly topic: TopicTag;
  readonly persona: Persona;
  readonly reason: 'no-stat-for-topic' | 'no-applicability-overlap';
  constructor(
    topic: TopicTag,
    persona: Persona,
    reason: 'no-stat-for-topic' | 'no-applicability-overlap',
    message?: string,
  ) {
    super(message ?? `No verified stat for topic=${topic} persona=${persona} reason=${reason}`);
    this.name = 'NoVerifiedStatError';
    this.topic = topic;
    this.persona = persona;
    this.reason = reason;
  }
}

// ---------- Zod schemas (sidecar validation at load) ----------

/** Why `z.enum` over `z.string`: anything not in the controlled vocab is
 *  rejected at load — closes the "unknown topicTag" silent-failure path. */
const TopicTagSchema = z.enum(TOPIC_TAGS);
const ApplicabilityTagSchema = z.enum(APPLICABILITY_TAGS);
const PersonaSchema = z.enum(PERSONAS);
const SourceTierSchema = z.enum(SOURCE_TIERS);

const SourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  /** ISO date — parsed at load to catch future dates / unparseable strings. */
  publishedDate: z.string().min(1),
});

const StatEntrySchema = z.object({
  id: z.string().min(1),
  claimText: z.string().min(1),
  numericValue: z.string().min(1),
  topicTags: z.array(TopicTagSchema).min(1),
  applicabilityTags: z.array(ApplicabilityTagSchema).min(1),
  source: SourceSchema,
  sourceTier: SourceTierSchema,
  personaFit: z.array(PersonaSchema).min(1),
});

const StatLibraryFileSchema = z.object({
  schemaVersion: z.literal(1),
  /** Top-level metadata fields tolerated (e.g., `_notes`) but ignored. */
  stats: z.array(StatEntrySchema).min(1),
});

const SourceTiersFileSchema = z.object({
  schemaVersion: z.literal(1),
  domains: z.record(z.string(), SourceTierSchema),
});

type RawStat = z.infer<typeof StatEntrySchema>;

// ---------- Sidecar load (executes on first import) ----------

/** Resolved at module load. The library is process-local immutable state. */
interface LoadedLibrary {
  stats: readonly Readonly<RawStat>[];
  domainTiers: Readonly<Record<string, SourceTier>>;
  /** Cached absolute miss-log path. */
  missLogPath: string;
}

const HARD_RECENCY_CUTOFF_MONTHS = 24;
const TIER_WEIGHTS: Readonly<Record<SourceTier, number>> = Object.freeze({
  primary: 1.0,
  trade: 0.7,
  vendor: 0.4,
});

/** Repo root resolution: walk up from this module's directory to find the
 *  `data/showrev/stat-library/` directory. This lets the library work whether
 *  it's imported from src/ directly or from a compiled `dist/`. */
function resolveDataPath(relative: string): string {
  // __dirname equivalent under ESM:
  const here = dirname(fileURLToPath(import.meta.url));
  // src/showrev/m1-email-find/stat-library -> repo root is 4 levels up.
  const repoRoot = resolve(here, '..', '..', '..', '..');
  return resolve(repoRoot, 'data', 'showrev', 'stat-library', relative);
}

/** Extract hostname for domain-tier lookup. Strips leading 'www.'. */
function hostnameOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    throw new Error(`Invalid URL in stat library: ${url}`);
  }
}

/** Validate that the numeric token in claimText matches numericValue verbatim.
 *  We require numericValue to appear as a substring of claimText. This is
 *  the byte-equal forcing function from spec §6: catches the "claim says 40%
 *  but data shipped 50%" class of authoring error. */
function assertNumericTokenMatches(s: RawStat): void {
  if (!s.claimText.includes(s.numericValue)) {
    throw new Error(
      `Stat ${s.id}: numericValue ${JSON.stringify(s.numericValue)} not found ` +
        `verbatim in claimText. Fix the sidecar — composer pastes claimText, ` +
        `so any drift here is a fabrication risk.`,
    );
  }
}

/** Validate publishedDate parses, is not in the future, is not a sentinel. */
function assertPublishedDateOk(s: RawStat): Date {
  const d = new Date(s.source.publishedDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Stat ${s.id}: unparseable publishedDate ${s.source.publishedDate}`);
  }
  // Compare against load time. Per-call NOW only governs recency math at
  // query time; sidecar publishedDate is bounded by actual wall-clock.
  if (d.getTime() > Date.now()) {
    throw new Error(
      `Stat ${s.id}: future publishedDate ${s.source.publishedDate} ` +
        `(now=${new Date().toISOString()})`,
    );
  }
  return d;
}

/** Load + validate both sidecars. Executes ONCE at first import. */
function loadLibrary(): LoadedLibrary {
  const statsPath = resolveDataPath('verified-stats.v1.json');
  const tiersPath = resolveDataPath('source-tiers.json');
  const missLogPath = resolveDataPath('miss-log.jsonl');

  const statsRaw = JSON.parse(readFileSync(statsPath, 'utf8'));
  const tiersRaw = JSON.parse(readFileSync(tiersPath, 'utf8'));

  const statsParsed = StatLibraryFileSchema.parse(statsRaw);
  const tiersParsed = SourceTiersFileSchema.parse(tiersRaw);

  // Per-stat validation: numeric-token equality, publishedDate sanity,
  // declared sourceTier matches domain allowlist (no silent fallback).
  for (const s of statsParsed.stats) {
    assertNumericTokenMatches(s);
    assertPublishedDateOk(s);
    const host = hostnameOf(s.source.url);
    const declared = tiersParsed.domains[host];
    if (declared === undefined) {
      throw new Error(
        `Stat ${s.id}: domain ${host} not in source-tiers.json. ` +
          `Add it explicitly with a tier OR fix the URL — silent vendor ` +
          `fallback was deliberately removed (spec §6).`,
      );
    }
    if (declared !== s.sourceTier) {
      throw new Error(
        `Stat ${s.id}: declared sourceTier=${s.sourceTier} but domain ` +
          `${host} is tiered as ${declared} in source-tiers.json. Reconcile.`,
      );
    }
  }

  // Detect duplicate IDs (would break byte-stable sort tiebreak).
  const seen = new Set<string>();
  for (const s of statsParsed.stats) {
    if (seen.has(s.id)) throw new Error(`Duplicate stat id: ${s.id}`);
    seen.add(s.id);
  }

  return Object.freeze({
    stats: Object.freeze(statsParsed.stats.map((s) => Object.freeze({ ...s }))),
    domainTiers: Object.freeze({ ...tiersParsed.domains }),
    missLogPath,
  });
}

/** Lazy singleton — loaded on first call to getVerifiedStat. We do NOT
 *  load at module-import time so tests can set up the sidecar path before
 *  the first call (and so import errors don't blow up unrelated callers). */
let _library: LoadedLibrary | null = null;
function getLibrary(): LoadedLibrary {
  if (_library === null) _library = loadLibrary();
  return _library;
}

/** Test-only escape hatch to reset the singleton between tests.
 *  NOT exported under the public-API name; tests can import this and
 *  production code never sees it without the underscore prefix flag. */
export function _resetLibraryForTests(): void {
  _library = null;
}

// ---------- Core API ----------

/** Compute recencyMonths against a per-call NOW (spec §3 step 5).
 *  Why per-call: long-running dispatcher processes would drift if NOW were
 *  captured at boot. Tests can inject nowOverride for snapshot stability. */
function computeRecencyMonths(publishedISO: string, now: number): number {
  const published = new Date(publishedISO).getTime();
  const msPerMonth = 30.44 * 24 * 60 * 60 * 1000;
  return Math.floor((now - published) / msPerMonth);
}

/** Sync append to miss-log.jsonl. Sync, not async — async errors get
 *  swallowed and we lose the audit trail (red-team cut). */
function appendMissLogSync(
  missLogPath: string,
  payload: { ts: string; topic: TopicTag; persona: Persona; prospectTags: ApplicabilityTag[]; reason: string },
): void {
  try {
    appendFileSync(missLogPath, JSON.stringify(payload) + '\n', 'utf8');
  } catch (e) {
    // Last-resort: stderr. We do NOT throw — a miss-log write failure
    // should never be the reason a pipeline fails. The miss itself still
    // surfaces via NoVerifiedStatError downstream.
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[stat-library] miss-log write failed: ${msg}\n`);
  }
}

export interface GetVerifiedStatOpts {
  /** Max number of survivors to return after rank+sort. Clamped to >=1. */
  limit?: number;
  /** Test-only NOW injection (ms since epoch). Production omits. */
  nowOverride?: number;
}

/**
 * Resolve a topic+persona+prospect-segment to a frozen, rank-ordered list
 * of verified stats. Throws NoVerifiedStatError on empty (after sync
 * append to miss-log).
 *
 * Algorithm (spec §3):
 *   1. Reject empty topic
 *   2. Filter by topic membership AND personaFit membership AND
 *      applicability intersection
 *   3. Drop recencyMonths > 24 (hard cutoff)
 *   4. Empty -> throw NoVerifiedStatError (sync log first)
 *   5. Score each survivor: rankScore = tierWeight*0.6 + recencyDecay*0.4
 *   6. Sort desc by (rankScore, id-asc tiebreak)
 *   7. Slice to limit; freeze; return
 */
export function getVerifiedStat(
  topic: TopicTag,
  persona: Persona,
  prospectTags: ApplicabilityTag[],
  opts?: GetVerifiedStatOpts,
): readonly VerifiedStat[] {
  // Normalize topic: spec §3 step 1 says "if '' -> NoVerifiedStatError".
  // Our type system already rules out empty string via the enum, but we
  // still defensively check at runtime for `as TopicTag` casts at the
  // integration boundary.
  if (!topic || (TOPIC_TAGS as readonly string[]).indexOf(topic) === -1) {
    throw new NoVerifiedStatError(
      topic as TopicTag,
      persona,
      'no-stat-for-topic',
      `Unknown topic at runtime: ${JSON.stringify(topic)}`,
    );
  }

  const lib = getLibrary();
  const now = opts?.nowOverride ?? Date.now();
  const limit = Math.max(1, opts?.limit ?? 3);
  const prospectTagSet = new Set<ApplicabilityTag>(prospectTags);

  // Step 2: topic + persona filter.
  const topicPersonaMatches = lib.stats.filter(
    (s) => s.topicTags.includes(topic) && s.personaFit.includes(persona),
  );

  if (topicPersonaMatches.length === 0) {
    appendMissLogSync(lib.missLogPath, {
      ts: new Date(now).toISOString(),
      topic,
      persona,
      prospectTags: [...prospectTags],
      reason: 'no-stat-for-topic',
    });
    throw new NoVerifiedStatError(topic, persona, 'no-stat-for-topic');
  }

  // Step 2 cont.: applicability intersection. If prospectTags is empty,
  // there can be no intersection — we treat empty prospectTags as "no
  // applicability info" and short-circuit to no-applicability-overlap.
  const applicabilityMatches = topicPersonaMatches.filter((s) => {
    if (prospectTags.length === 0) return false;
    return s.applicabilityTags.some((t) => prospectTagSet.has(t));
  });

  if (applicabilityMatches.length === 0) {
    appendMissLogSync(lib.missLogPath, {
      ts: new Date(now).toISOString(),
      topic,
      persona,
      prospectTags: [...prospectTags],
      reason: 'no-applicability-overlap',
    });
    throw new NoVerifiedStatError(topic, persona, 'no-applicability-overlap');
  }

  // Step 3: hard recency cutoff (not decay) at 24 months.
  const recent = applicabilityMatches
    .map((s) => ({ raw: s, recencyMonths: computeRecencyMonths(s.source.publishedDate, now) }))
    .filter((x) => x.recencyMonths <= HARD_RECENCY_CUTOFF_MONTHS);

  if (recent.length === 0) {
    // All matches are stale. Distinguishable from no-applicability-overlap
    // for miss-log triage.
    appendMissLogSync(lib.missLogPath, {
      ts: new Date(now).toISOString(),
      topic,
      persona,
      prospectTags: [...prospectTags],
      reason: `all-stale-${HARD_RECENCY_CUTOFF_MONTHS}mo`,
    });
    throw new NoVerifiedStatError(topic, persona, 'no-stat-for-topic');
  }

  // Step 5: score.
  const scored: VerifiedStat[] = recent.map(({ raw, recencyMonths }) => {
    const tierWeight = TIER_WEIGHTS[raw.sourceTier];
    const recencyDecay = Math.max(0, 1 - recencyMonths / HARD_RECENCY_CUTOFF_MONTHS);
    const rankScore = tierWeight * 0.6 + recencyDecay * 0.4;
    return {
      id: raw.id,
      claimText: raw.claimText,
      numericValue: raw.numericValue,
      topicTags: [...raw.topicTags],
      applicabilityTags: [...raw.applicabilityTags],
      source: { ...raw.source },
      sourceTier: raw.sourceTier,
      recencyMonths,
      rankScore,
      personaFit: [...raw.personaFit],
    };
  });

  // Step 6: byte-stable sort. We sort by (rankScore desc, id asc) — the
  // id ascending tiebreak guarantees deterministic order across runs
  // even when two stats have identical scores.
  scored.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Step 7: slice + freeze the returned array AND its members.
  const sliced = scored.slice(0, limit).map((s) => Object.freeze(s));
  return Object.freeze(sliced);
}

// ---------- Re-exports for ergonomics ----------

export { HARD_RECENCY_CUTOFF_MONTHS, TIER_WEIGHTS };
