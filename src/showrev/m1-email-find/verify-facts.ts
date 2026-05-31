/**
 * Fact Verification Gate
 *
 * Sits between research and composition. Every load-bearing claim
 * in a dossier is tagged with source tier, verification status,
 * and a decision on whether it's safe to use in the email body.
 *
 * Rules:
 * - Tier 1 (government primary): safe for email body
 * - Tier 2 (trade press corroborated): safe if 2+ sources agree
 * - Tier 3 (single secondary): safe for dossier, NOT for email body unless verified
 * - Tier 4 (LLM inference): NEVER in email body. Dossier only with [UNVERIFIED] tag.
 *
 * Load-bearing claims: dollar amounts, project names, miles of fiber,
 * BEAD awards, acquisitions, employee counts, tools used, named clients.
 */

export interface FactClaim {
  claim: string;
  claimType: ClaimType;
  sourceUrl: string;
  sourceTier: 1 | 2 | 3 | 4;
  verificationStatus: 'verified' | 'unverified' | 'disputed' | 'retracted';
  verificationSource?: string;
}

export type ClaimType =
  | 'dollar_amount'
  | 'project_name'
  | 'miles_fiber'
  | 'bead_award'
  | 'acquisition'
  | 'employee_count'
  | 'tool_used'
  | 'named_client'
  | 'job_title'
  | 'funding_program'
  | 'geographic_scope'
  | 'general';

const CLAIM_PATTERNS: { type: ClaimType; patterns: RegExp[] }[] = [
  { type: 'dollar_amount', patterns: [/\$[\d,.]+[MBK]?/i, /\d+[\s,]*million/i, /\d+[\s,]*billion/i] },
  { type: 'miles_fiber', patterns: [/\d+[\s,]*miles?\b/i, /\d+[\s,]*linear\s*feet/i, /\d+[\s,]*LF\b/] },
  { type: 'bead_award', patterns: [/BEAD\s*(award|fund|grant|allocat)/i, /broadband equity/i] },
  { type: 'acquisition', patterns: [/acquir/i, /merger/i, /purchas.*by/i, /subsidiary\s*of/i] },
  { type: 'employee_count', patterns: [/\d+[\s,]*employees?/i, /\d+[\s,]*crews?/i, /\d+[\s,]*engineers?/i, /team\s*of\s*\d+/i] },
  { type: 'named_client', patterns: [/named\s*client/i, /customer.*includ/i, /work.*with/i, /project\s*for/i] },
  { type: 'tool_used', patterns: [/AutoCAD|MicroStation|Bentley|3GIS|Katapult|IQGeo|ArcGIS|FOND|Render\s*Networks/i] },
  { type: 'funding_program', patterns: [/RDOF|ReConnect|ARPA|CAF|USF|A-CAM/i] },
];

export function detectClaims(text: string): { text: string; type: ClaimType; position: number }[] {
  const claims: { text: string; type: ClaimType; position: number }[] = [];

  for (const { type, patterns } of CLAIM_PATTERNS) {
    for (const pattern of patterns) {
      const matches = text.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        const start = Math.max(0, (match.index || 0) - 40);
        const end = Math.min(text.length, (match.index || 0) + match[0].length + 40);
        const context = text.slice(start, end).trim();
        claims.push({ text: context, type, position: match.index || 0 });
      }
    }
  }

  const seen = new Set<string>();
  return claims.filter(c => {
    const key = `${c.type}:${c.text.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface VerificationResult {
  claim: string;
  claimType: ClaimType;
  tier: 1 | 2 | 3 | 4;
  safeForEmail: boolean;
  safeForMicrosite: boolean;
  safeForDossier: boolean;
  reason: string;
}

export function assessClaimSafety(
  claim: string,
  claimType: ClaimType,
  sourceTier: 1 | 2 | 3 | 4,
  hasCorroboration: boolean
): VerificationResult {
  const base = { claim, claimType, tier: sourceTier };

  if (sourceTier === 1) {
    return { ...base, safeForEmail: true, safeForMicrosite: true, safeForDossier: true,
      reason: 'Tier 1 government source. Safe for all uses.' };
  }

  if (sourceTier === 2 && hasCorroboration) {
    return { ...base, safeForEmail: true, safeForMicrosite: true, safeForDossier: true,
      reason: 'Tier 2 with corroboration. Safe for all uses.' };
  }

  if (sourceTier === 2 && !hasCorroboration) {
    if (['dollar_amount', 'bead_award', 'employee_count', 'miles_fiber'].includes(claimType)) {
      return { ...base, safeForEmail: false, safeForMicrosite: false, safeForDossier: true,
        reason: 'Tier 2 without corroboration on a quantitative claim. Dossier only. Verify before email use.' };
    }
    return { ...base, safeForEmail: true, safeForMicrosite: true, safeForDossier: true,
      reason: 'Tier 2 single source, non-quantitative claim. Acceptable risk.' };
  }

  if (sourceTier === 3) {
    return { ...base, safeForEmail: false, safeForMicrosite: false, safeForDossier: true,
      reason: 'Tier 3 single secondary source. Dossier only with [UNVERIFIED] tag.' };
  }

  return { ...base, safeForEmail: false, safeForMicrosite: false, safeForDossier: true,
    reason: 'Tier 4 LLM inference. NEVER in email or microsite. Dossier only with [UNVERIFIED] tag.' };
}

export interface EntityResolution {
  companyNameRaw: string;
  companyNameResolved: string;
  identifiersMatched: {
    name: boolean;
    domain: boolean;
    city: boolean;
    state: boolean;
    contactName: boolean;
  };
  matchCount: number;
  parentCompany: string | null;
  corporateStructure: 'independent' | 'pe_backed' | 'subsidiary' | 'public' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
}

export function resolveEntity(
  rawName: string,
  rawCity: string,
  rawState: string,
  contactName: string,
  emailDomain: string,
  researchFindings: {
    resolvedName?: string;
    resolvedDomain?: string;
    resolvedCity?: string;
    resolvedState?: string;
    foundContactName?: boolean;
    parentCompany?: string;
    corporateStructure?: string;
  }
): EntityResolution {
  const matched = {
    name: researchFindings.resolvedName?.toLowerCase().includes(rawName.toLowerCase().slice(0, 8)) || false,
    domain: researchFindings.resolvedDomain === emailDomain || false,
    city: researchFindings.resolvedCity?.toLowerCase() === rawCity.toLowerCase() || false,
    state: researchFindings.resolvedState?.toUpperCase() === rawState.toUpperCase() || false,
    contactName: researchFindings.foundContactName || false,
  };

  const matchCount = Object.values(matched).filter(Boolean).length;

  let confidence: 'high' | 'medium' | 'low';
  if (matchCount >= 4) confidence = 'high';
  else if (matchCount >= 3) confidence = 'medium';
  else confidence = 'low';

  return {
    companyNameRaw: rawName,
    companyNameResolved: researchFindings.resolvedName || rawName,
    identifiersMatched: matched,
    matchCount,
    parentCompany: researchFindings.parentCompany || null,
    corporateStructure: (researchFindings.corporateStructure as EntityResolution['corporateStructure']) || 'unknown',
    confidence,
  };
}

export function buildVerificationPrompt(
  emailBody: string,
  dossierSummary: string,
  sourcesUsed: string[]
): string {
  return `You are a fact-verification specialist. Review this email draft and identify every load-bearing factual claim. For each claim, assess:

1. Is this claim specific enough to be wrong? ("fiber company in Oklahoma" is not load-bearing. "$250M in builds across three states" IS load-bearing.)
2. What is the source for this claim? (Cite the specific URL from the research.)
3. What tier is that source? (Tier 1 = government. Tier 2 = trade press. Tier 3 = single secondary. Tier 4 = inference.)
4. Could this claim be about a DIFFERENT company with a similar name?
5. Is there a parent company or corporate structure change that affects this claim?

## Email to verify:
${emailBody}

## Dossier summary the email was derived from:
${dossierSummary}

## Sources the researcher used:
${sourcesUsed.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Output (JSON):
{
  "claims": [
    {
      "claim": "the specific factual statement",
      "claimType": "dollar_amount|project_name|miles_fiber|bead_award|acquisition|employee_count|tool_used|named_client|general",
      "sourceUrl": "the URL this came from",
      "sourceTier": 1-4,
      "safeForEmail": true/false,
      "risk": "what could go wrong if this is wrong",
      "verificationSuggestion": "how to verify this claim against a Tier 1 source"
    }
  ],
  "entityConfidence": "high|medium|low",
  "entityRisks": ["any company disambiguation concerns"],
  "parentCompanyNote": "if a parent company was found, note it here",
  "overallVerdict": "all_clear|needs_verification|has_risk",
  "blockingIssues": ["any claims that MUST be verified before sending"]
}`;
}
