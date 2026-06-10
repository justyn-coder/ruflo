/**
 * company-resolver.ts — Fix #2 (2026-06-10 operator directive)
 *
 * Resolves a raw company name (possibly ambiguous: TEP, GFiber, EPB) to a
 * normalized company context BEFORE the ICP gate runs. Catches the class of
 * misses the title-only ICP gate let through:
 *
 *   - TEP = Tower Engineering Professionals (tower A&E, NOT fiber operator)
 *   - GFiber = Google Fiber subsidiary
 *   - EPB = Electric Power Board (electric utility WITH fiber arm)
 *
 * Strategy: LLM-only first pass (Sonnet has reasonable training-data coverage
 * of major US telecom + A&E firms). Outputs a structured business_type that the
 * ICP gate can use to hard-reject tower_ae or escalate ambiguous cases to a
 * web-search second pass. Web-search wiring is intentionally OUT of this v1 —
 * keeps the change small and reversible. Add as a v2 upgrade if v1's coverage
 * proves insufficient on the production cohort.
 *
 * IMPORTANT: this module does NOT touch composer files. It runs before phase 1
 * and writes its output to a new `companyContext` field on ProspectResult so
 * the ICP gate can read it. Composer is downstream and reads dossier-only.
 */

import { callLLM } from '../llm-client.js';

export type BusinessType =
  | 'fiber_operator'      // ISP, telco, cable co with fiber, electric co-op fiber arm, muni broadband
  | 'tower_ae'            // tower-side A&E firm (site acquisition, structural, RF, installation)
  | 'mixed_telecom'       // does both fiber + tower portfolios
  | 'ae_firm_fiber'       // fiber-focused A&E firm (in scope — these design for operators)
  | 'fiber_adjacent'      // OSS/BSS SaaS, equipment vendor, financial sponsor
  | 'other'               // out of scope (consulting, generic IT services, etc.)
  | 'unknown';            // LLM uncertain — fall back to existing ICP gate

export interface CompanyContext {
  raw_name: string;
  canonical_url: string | null;     // best-guess canonical domain (e.g. "tepgroup.net")
  business_type: BusinessType;
  business_type_confidence: 'high' | 'medium' | 'low';
  reason: string;                    // 1-2 sentence explanation
  tower_indicators: string[];        // ["builds 200K towers", "site acquisition", "structural eng"]
  fiber_indicators: string[];        // ["fiber operator", "FTTH deployment", "FCC BDC filer"]
  alt_name_hint: string | null;      // expanded form if abbreviation: "TEP" → "Tower Engineering Professionals"
}

const RESOLVE_PROMPT = `You are identifying a company from its name to classify its business for fiber-telecom outreach scoping.

Company name: "{COMPANY}"
State (if provided): "{STATE}"

Return JSON ONLY (no preamble, no markdown) with this exact shape:
{
  "canonical_url": "best-guess canonical website domain (e.g. tepgroup.net, fidiumfiber.com) — null if unsure",
  "business_type": "fiber_operator | tower_ae | mixed_telecom | ae_firm_fiber | fiber_adjacent | other | unknown",
  "business_type_confidence": "high | medium | low",
  "reason": "1-2 sentence plain English explanation of what this company does and why it's that business type",
  "tower_indicators": ["tower-side activity 1", "tower-side activity 2"],
  "fiber_indicators": ["fiber-side activity 1", "fiber-side activity 2"],
  "alt_name_hint": "if name is an abbreviation/acronym, the expanded form (e.g. TEP -> Tower Engineering Professionals); else null"
}

Classification rules (BINDING):
- fiber_operator: deploys/operates fiber-to-the-X (ISP, CLEC, RLEC, muni, electric co-op fiber arm). The buyer of construction drawings.
- tower_ae: engineering/construction firm that builds, structurally analyzes, or installs cell towers. Out of scope for fiber drawings.
- mixed_telecom: operator with BOTH fiber and tower portfolios. Lean toward in-scope if fiber is named.
- ae_firm_fiber: A&E firm focused on fiber drawings/permitting (consultancies serving fiber operators). In scope.
- fiber_adjacent: OSS/BSS SaaS, equipment vendor, financial sponsor, marketing agency. Reachable but lower priority.
- other: utility (non-fiber), MSO without fiber, consulting unrelated to fiber, generic IT.
- unknown: you genuinely don't know this company. Set confidence='low' and reason='unknown to me'.

Reference examples (study these patterns):
- Tower Engineering Professionals (TEP): tower_ae (Raleigh NC, ~650 engineers, builds 200K+ towers per year). NOT fiber.
- Google Fiber / GFiber: fiber_operator (Google subsidiary).
- Electric Power Board (EPB) Chattanooga: fiber_operator (strong municipal fiber arm).
- Finley Engineering: ae_firm_fiber (RLEC-focused engineering consultancy).
- Communications Data Group (CDG): fiber_adjacent (OSS/BSS SaaS for broadband providers).
- Fidium Fiber: fiber_operator (Consolidated Communications fiber brand, top-10 US fiber provider).
- American Tower: tower_ae (large tower owner/operator, structural and site work).

Confidence rules:
- high: well-known company, you're confident about the classification AND the canonical domain.
- medium: you know the company but the domain or sub-categorization is uncertain.
- low: ambiguous abbreviation OR multiple matches OR you genuinely don't know.

Return ONLY the JSON object, no other text.`;

/**
 * Resolve a company name to its business context.
 *
 * Falls back gracefully on errors — returns a 'unknown' result so the caller
 * can decide to continue with existing ICP gate logic instead of crashing.
 */
export async function resolveCompany(
  companyName: string,
  state?: string,
): Promise<CompanyContext> {
  const safeFallback: CompanyContext = {
    raw_name: companyName,
    canonical_url: null,
    business_type: 'unknown',
    business_type_confidence: 'low',
    reason: 'resolver fallback - LLM error or parse failure',
    tower_indicators: [],
    fiber_indicators: [],
    alt_name_hint: null,
  };

  if (!companyName || companyName.trim().length === 0) return safeFallback;

  const prompt = RESOLVE_PROMPT
    .replace('{COMPANY}', companyName.replace(/"/g, ''))
    .replace('{STATE}', state || '');

  try {
    const raw = await callLLM(prompt, {
      label: `company-resolve:${companyName.slice(0, 30)}`,
      model: 'claude-sonnet-4-6',
      maxTokens: 800,
      timeoutMs: 30000,
    });
    const cleaned = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<CompanyContext>;
    return {
      raw_name: companyName,
      canonical_url: typeof parsed.canonical_url === 'string' ? parsed.canonical_url : null,
      business_type: validateBusinessType(parsed.business_type),
      business_type_confidence: validateConfidence(parsed.business_type_confidence),
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      tower_indicators: Array.isArray(parsed.tower_indicators) ? parsed.tower_indicators : [],
      fiber_indicators: Array.isArray(parsed.fiber_indicators) ? parsed.fiber_indicators : [],
      alt_name_hint: typeof parsed.alt_name_hint === 'string' ? parsed.alt_name_hint : null,
    };
  } catch {
    return safeFallback;
  }
}

function validateBusinessType(v: unknown): BusinessType {
  const valid: BusinessType[] = [
    'fiber_operator', 'tower_ae', 'mixed_telecom', 'ae_firm_fiber',
    'fiber_adjacent', 'other', 'unknown',
  ];
  return valid.includes(v as BusinessType) ? (v as BusinessType) : 'unknown';
}

function validateConfidence(v: unknown): CompanyContext['business_type_confidence'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'low';
}

/**
 * Apply company-resolver output to gate the ICP verdict. The pipeline
 * runs this AFTER resolveCompany() and BEFORE the existing ICP gate. If the
 * business_type is tower_ae with high/medium confidence, hard-reject before
 * we waste research budget.
 *
 * Returns null if no override needed; returns an ICP-reject decision if the
 * company is out of scope.
 */
export function deriveIcpOverride(ctx: CompanyContext): {
  icp_verdict: 'reject';
  icp_reason: string;
} | null {
  if (ctx.business_type === 'tower_ae' && ctx.business_type_confidence !== 'low') {
    return {
      icp_verdict: 'reject',
      icp_reason: `Company-resolver: ${ctx.raw_name}${ctx.alt_name_hint ? ` (${ctx.alt_name_hint})` : ''} is tower-side A&E. Out of fiber-only scope. ${ctx.reason}`,
    };
  }
  return null;
}
