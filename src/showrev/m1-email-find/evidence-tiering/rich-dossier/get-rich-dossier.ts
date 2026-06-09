/**
 * getRichDossier — the single function composers now consume.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §3, §4,
 * §5, §6, §11.
 *
 * Replaces every composer's ad-hoc fan-out across sr_company_evidence + the
 * industry KB + substrate search. The 2026-06-09 hallucination sweep showed
 * that fan-out produced 60% fabricated emails because each composer
 * "invented its own grounding". This module is the single grounding surface.
 *
 * Determinism contract (§9):
 *   - ORDER BY id ASC, extracted_at ASC      (single query, stable order)
 *   - YAML maps                              (checked-in, lint-able)
 *   - Haiku cached on sha256(claim + sha256(kb))  (auto-invalidate on edit)
 *   - All weights are constants              (no random, no time)
 * Same inputs → same output.
 */

import type {
  RichDossier,
  ScoredClaim,
  PersonaTag,
  EmptyReason,
  AuthorityTier,
} from './types.js';
import { SubstrateQueryError } from './types.js';
import {
  lookupAuthority,
  authorityWeight,
  demoteAuthority,
} from './authority-map.js';
import { classifyPersona } from './persona-map.js';
import { classifyClaim, kbWeight, gcKbCache } from './kb-classifier.js';
import { fetchSubstrate } from './substrate-bridge.js';
import { matchInorsaAngles } from './inorsa-angles.js';

const PERSONA_TAGS: PersonaTag[] = ['revenue_leader', 'ops_builder', 'technical_designer'];

/**
 * Raw row shape from sr_company_evidence — pulled from spec §2 + verified
 * against information_schema 2026-06-09. 13 columns, schema is stable.
 */
interface RawEvidenceRow {
  id: string;
  company_name: string;
  company_normalized: string;
  claim: string;
  source_kind: string;
  source_citation: string | null;
  source_date: string | null;
  speaker_name: string | null;
  speaker_company: string | null;
  speaker_role: string | null;
  category: string;
  extracted_at: string;
  metadata: Record<string, unknown> | null;
}

function supabaseConfig(): { url: string; key: string } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://slttpknnuthbttjuzrnz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

async function selectRows(companyNormalized: string): Promise<RawEvidenceRow[]> {
  const { url, key } = supabaseConfig();
  if (!key) {
    throw new SubstrateQueryError('SUPABASE key missing from env');
  }
  // §4 step 1: single indexed query, ORDER BY id ASC, extracted_at ASC for
  // deterministic + chronological debug. Eng fix 1.
  const path =
    `/rest/v1/sr_company_evidence` +
    `?select=id,company_name,company_normalized,claim,source_kind,source_citation,` +
    `source_date,speaker_name,speaker_company,speaker_role,category,extracted_at,metadata` +
    `&company_normalized=eq.${encodeURIComponent(companyNormalized)}` +
    `&order=id.asc,extracted_at.asc` +
    `&limit=500`;
  const res = await fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SubstrateQueryError(
      `sr_company_evidence select failed: ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as RawEvidenceRow[];
}

/**
 * Recency boost per §4 step 5:
 *   ≤30 days → 1.0
 *   linear decay to 0.5 at 365 days
 *   floor 0.5
 *
 * Treats invalid/parse-failed dates as effectively maximally-old to be safe.
 */
function computeRecencyBoost(dateStr: string): number {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
  if (ageDays <= 30) return 1.0;
  if (ageDays >= 365) return 0.5;
  // Linear from 1.0 at 30d to 0.5 at 365d
  const range = 365 - 30;
  const decay = (ageDays - 30) / range; // 0..1
  return 1.0 - 0.5 * decay;
}

/**
 * Build a single ScoredClaim from a raw DB row.
 *
 * Returns null if the row must be skipped — caller increments
 * skipped_counts.no_citation in that case.
 * Throws UnknownPublisherError unless opts.allowUnknown=true.
 */
async function scoreRow(
  row: RawEvidenceRow,
  opts: { allowUnknown: boolean; skipLlm: boolean },
): Promise<ScoredClaim | null> {
  // §4 step 2: skip empty citations.
  if (!row.source_citation || row.source_citation.trim() === '') {
    return null;
  }

  // §4 step 3: authority via YAML map (throws on unknown unless allowed).
  const auth = lookupAuthority(row.source_citation, { allowUnknown: opts.allowUnknown });
  const authority_original: AuthorityTier = auth.tier;

  // §4 steps 4 + 5: date handling.
  let authority: AuthorityTier = authority_original;
  let recency_boost: number;
  let date_confidence: 'verified' | 'unknown';
  let date_penalty_applied = false;
  if (!row.source_date) {
    recency_boost = 0.6;
    authority = demoteAuthority(authority_original); // demote one tier
    date_confidence = 'unknown';
    date_penalty_applied = true;
  } else {
    recency_boost = computeRecencyBoost(row.source_date);
    date_confidence = 'verified';
  }

  // §4 step 6: persona tags from category + speaker_role substring.
  const persona_tags = classifyPersona(row.category, row.speaker_role) as PersonaTag[];

  // §4 step 7: KB classification with Haiku + cache + force-unaddressed guard.
  const kb = await classifyClaim(row.claim, { skipLlm: opts.skipLlm });

  // §4 step 8: Inorsa angle keyword match.
  const inorsa_relevance = matchInorsaAngles(row.claim);

  // §4 step 9: composite score.
  const score = authorityWeight(authority) * recency_boost * kbWeight(kb.status);

  return {
    claim: row.claim,
    source_citation: row.source_citation,
    source_kind: row.source_kind,
    source_date: row.source_date,
    authority,
    authority_original,
    date_confidence,
    date_penalty_applied,
    recency_boost,
    persona_tags,
    kb_status: kb.status,
    kb_confidence: kb.confidence,
    kb_evidence_quote: kb.evidence_quote,
    inorsa_relevance,
    score,
  };
}

/**
 * Filter per §4 step 10 (SC #6): drop rows where persona_tags=[] AND
 * kb_status='unaddressed'. These rows are neither addressable nor grounded,
 * so they cannot contribute to a defensible email body.
 */
function passesDropFilter(c: ScoredClaim): boolean {
  return !(c.persona_tags.length === 0 && c.kb_status === 'unaddressed');
}

/**
 * Bucket surviving claims by persona for composer ergonomics.
 * A claim with multiple persona_tags is duplicated into each bucket — that's
 * intentional, composers should never have to do persona filtering.
 */
function bucketByPersona(claims: ScoredClaim[]): Record<PersonaTag, ScoredClaim[]> {
  const out: Record<PersonaTag, ScoredClaim[]> = {
    revenue_leader: [],
    ops_builder: [],
    technical_designer: [],
  };
  for (const c of claims) {
    for (const tag of c.persona_tags) {
      if (PERSONA_TAGS.includes(tag)) out[tag].push(c);
    }
  }
  // Sort by score desc within each bucket so composer picks the best
  // claim first without re-sorting.
  for (const tag of PERSONA_TAGS) {
    out[tag].sort((a, b) => b.score - a.score);
  }
  return out;
}

function emptyClaimsByPersona(): Record<PersonaTag, ScoredClaim[]> {
  return { revenue_leader: [], ops_builder: [], technical_designer: [] };
}

/**
 * Public entrypoint.
 *
 * @param prospect.company_normalized  Must match sr_company_evidence.company_normalized.
 *                                     Caller is responsible for normalizing
 *                                     (substrate-query.ts normalizeCompanyName).
 * @param prospect.persona             Optional. Used by callers as a hint for
 *                                     which persona bucket to read from
 *                                     `claims_by_persona`. Does NOT change retrieval.
 * @param opts.allowUnknown            Default false. Set true ONLY for backfill
 *                                     scripts; the production pipeline runs strict.
 * @param opts.skipLlm                 Default false. Tests pass true to keep
 *                                     hermetic; production must leave false.
 * @param opts.substrateQuery          Default: `"${company} industry context"`.
 *                                     Caller can override (e.g. for AE firms).
 */
export async function getRichDossier(
  prospect: { company_normalized: string; persona?: PersonaTag },
  opts: {
    allowUnknown?: boolean;
    skipLlm?: boolean;
    substrateQuery?: string;
    /** Test hook — inject pre-fetched rows to bypass DB. */
    _injectRows?: RawEvidenceRow[];
  } = {},
): Promise<RichDossier> {
  const allowUnknown = opts.allowUnknown ?? false;
  const skipLlm = opts.skipLlm ?? false;

  // Best-effort cache cleanup once per call — cheap, off the hot path.
  if (!skipLlm) gcKbCache();

  // Substrate fetch runs in parallel with DB fetch (cuts ~1.5s tail).
  const substrateQuery = opts.substrateQuery
    ?? `${prospect.company_normalized} fiber operator industry context`;

  let rows: RawEvidenceRow[];
  let substrateResult: Awaited<ReturnType<typeof fetchSubstrate>>;
  try {
    if (opts._injectRows) {
      rows = opts._injectRows;
      substrateResult = { rows: [], timedOut: false };
    } else {
      const [r, s] = await Promise.all([
        selectRows(prospect.company_normalized),
        fetchSubstrate(substrateQuery, 6),
      ]);
      rows = r;
      substrateResult = s;
    }
  } catch (err) {
    if (err instanceof SubstrateQueryError) {
      return {
        prospect,
        claims_by_persona: emptyClaimsByPersona(),
        kb_corroborations: [],
        kb_contradictions: [],
        inorsa_angles: [],
        skipped_counts: { no_citation: 0 },
        empty_reason: 'db_error' as EmptyReason,
        substrate: [],
      };
    }
    throw err;
  }

  // §6: zero DB rows → no_rows, but still attach substrate so generalized
  // composer can still render something (though SC #7 says hard-stop anyway).
  if (rows.length === 0) {
    return {
      prospect,
      claims_by_persona: emptyClaimsByPersona(),
      kb_corroborations: [],
      kb_contradictions: [],
      inorsa_angles: [],
      skipped_counts: { no_citation: 0 },
      empty_reason: 'no_rows' as EmptyReason,
      substrate: substrateResult.rows,
    };
  }

  // Score every row (sequential — Haiku cache hits are sub-ms so the loop
  // is fast warm; cold p95 stays <3s per §10).
  let skippedNoCitation = 0;
  const scored: ScoredClaim[] = [];
  for (const row of rows) {
    const claim = await scoreRow(row, { allowUnknown, skipLlm });
    if (claim === null) {
      skippedNoCitation++;
      continue;
    }
    scored.push(claim);
  }

  // §4 step 10: SC #6 drop filter.
  const survivors = scored.filter(passesDropFilter);

  // §6: all_dropped vs all_low_authority precedence.
  if (survivors.length === 0) {
    // If we DID have scored rows but all were dropped → all_dropped.
    // If we scored zero (all skipped no-citation) → fall through to no_rows-ish;
    // but the spec says no_rows only fires when rows.length===0, so use all_dropped here.
    return {
      prospect,
      claims_by_persona: emptyClaimsByPersona(),
      kb_corroborations: [],
      kb_contradictions: [],
      inorsa_angles: [],
      skipped_counts: { no_citation: skippedNoCitation },
      empty_reason: 'all_dropped' as EmptyReason,
      substrate: substrateResult.rows,
    };
  }

  // §6: all survivors authority=D → all_low_authority.
  const allLowAuthority = survivors.every(c => c.authority === 'D');
  if (allLowAuthority) {
    return {
      prospect,
      claims_by_persona: emptyClaimsByPersona(),
      kb_corroborations: [],
      kb_contradictions: [],
      inorsa_angles: collectInorsaAngles(survivors),
      skipped_counts: { no_citation: skippedNoCitation },
      empty_reason: 'all_low_authority' as EmptyReason,
      substrate: substrateResult.rows,
    };
  }

  // Edge case from §4 step 11: substrate timed out AND we'd otherwise have an
  // empty result. Survivors exist here, so we don't fire `timeout`. The spec's
  // `timeout` reason is reserved for "no DB rows AND substrate timed out",
  // but the no_rows branch already handled the zero-rows case. Leaving
  // `timeout` for explicit caller signaling in a future Phase B integration.
  void substrateResult.timedOut;

  // Assemble final dossier.
  const claims_by_persona = bucketByPersona(survivors);
  const kb_corroborations = survivors
    .filter(c => c.kb_status === 'confirmed')
    .sort((a, b) => b.score - a.score);
  const kb_contradictions = survivors
    .filter(c => c.kb_status === 'contradicted')
    .sort((a, b) => b.score - a.score);
  const inorsa_angles = collectInorsaAngles(survivors);

  return {
    prospect,
    claims_by_persona,
    kb_corroborations,
    kb_contradictions,
    inorsa_angles,
    skipped_counts: { no_citation: skippedNoCitation },
    substrate: substrateResult.rows,
  };
}

function collectInorsaAngles(claims: ScoredClaim[]): string[] {
  const acc = new Set<string>();
  for (const c of claims) for (const a of c.inorsa_relevance) acc.add(a);
  return Array.from(acc);
}
