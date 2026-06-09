/**
 * Composer Guard — the type-level + runtime contract composers must obey.
 *
 * Spec: docs/specs/substrate-query-orchestrator-phase-a-scope.md v4 §7.5,
 * Hardening 2 + 3, SC #7 + #8.
 *
 * Two guards land in Phase A (full composer rewrite is a separate ticket):
 *
 * 1. assertDossierFresh(claims, body): composer-side runtime check. If ANY
 *    cited claim has `date_confidence !== 'verified'`, the body MUST NOT
 *    contain temporal-language strings ("recently", "this year",
 *    "just announced", etc.). Throws TemporalLanguageError if violated.
 *    Closes Hardening 2 — kills the "recently launched" fabrication when
 *    we have no actual launch date.
 *
 * 2. shouldSkip(dossier): the early-return helper. Returns either
 *    `{ skip: false }` (proceed) or `{ skip: true, reason: ... }` so the
 *    composer can route to operator queue rather than auto-send.
 *    Closes Hardening 3 + PM fix 4 — empty dossier never produces an email.
 */

import type { RichDossier, ScoredClaim } from './types.js';

/**
 * Temporal-language tokens forbidden when any cited claim has unverified date.
 * Hardening 2: composer must refuse "recently", "this year", "just announced"
 * (and reasonable variants) when date_confidence !== 'verified'.
 *
 * Conservative list — kept short to avoid false positives on legitimate
 * industry-context language. Add new patterns only after observing
 * fabrication in production.
 */
const TEMPORAL_TOKENS: RegExp[] = [
  /\brecently\b/i,
  /\bthis (?:year|quarter|month|week)\b/i,
  /\blast (?:year|quarter|month|week)\b/i,
  /\bjust (?:announced|launched|raised|hired|closed)\b/i,
  /\bin the (?:past|last) (?:few|several) (?:months|weeks)\b/i,
  /\bin 20\d{2}\b/i, // "in 2026", "in 2027" — defensible only with verified date
];

export class TemporalLanguageError extends Error {
  constructor(public token: string, public claim: string) {
    super(
      `Composer used temporal language "${token}" while citing a claim with ` +
      `date_confidence != 'verified'. Either remove the temporal phrase or ` +
      `cite a claim with a known source_date. Claim: "${claim.slice(0, 80)}..."`,
    );
    this.name = 'TemporalLanguageError';
  }
}

/**
 * Composer-side runtime assertion. Call AFTER composing the email body
 * but BEFORE returning it.
 *
 * @param body         The composed email body string.
 * @param citedClaims  The ScoredClaim[] the composer actually cited in the body.
 *                     Pass the full list of attributed claims so the guard knows
 *                     which dates are exposed in the body.
 *
 * Throws TemporalLanguageError on violation. Spec §11 SC #8 requires zero
 * production emissions of this error — failure here is a bug, not a warning.
 */
export function assertDossierFresh(body: string, citedClaims: ScoredClaim[]): void {
  // If every cited claim has verified date, no enforcement needed.
  const anyUnverified = citedClaims.some(c => c.date_confidence !== 'verified');
  if (!anyUnverified) return;

  for (const re of TEMPORAL_TOKENS) {
    const m = body.match(re);
    if (m) {
      // Pick a representative unverified claim for the error message.
      const offender = citedClaims.find(c => c.date_confidence !== 'verified');
      throw new TemporalLanguageError(m[0], offender?.claim || '(unknown)');
    }
  }
}

/**
 * Composer-side early-return gate. Call BEFORE invoking the LLM composer.
 *
 *   const gate = shouldSkip(dossier);
 *   if (gate.skip) return gate;   // route to operator queue
 *
 * Spec SC #7: zero emails emitted when `dossier.empty_reason` is set.
 * The contract is "hard-stop, never auto-regenerate" — gracefully degrade
 * the prospect to the operator-review queue.
 */
export function shouldSkip(
  dossier: RichDossier,
): { skip: false } | { skip: true; reason: NonNullable<RichDossier['empty_reason']> } {
  if (dossier.empty_reason) {
    return { skip: true, reason: dossier.empty_reason };
  }
  return { skip: false };
}
