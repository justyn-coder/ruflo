import { callLLM } from './llm-client.js';
import { detectClaims, type ClaimType } from './verify-facts.js';

export interface VerifiedClaim {
  claim: string;
  claimType: ClaimType;
  verified: boolean;
  confidence: 'tier1' | 'tier2' | 'reported' | 'unverified' | 'stale';
  sourceUrl: string;
  sourceSnippet: string;
  discrepancy: string;
  tag: string;
}

export interface VerificationReport {
  prospectId: string;
  totalClaims: number;
  verified: number;
  unverified: number;
  claims: VerifiedClaim[];
  overallConfidence: 'high' | 'medium' | 'low';
  blockers: string[];
}

function classifySource(url: string): 'tier1' | 'tier2' | 'reported' | 'unverified' {
  if (!url) return 'unverified';
  if (/\.gov|ntia\.gov|fcc\.gov|sec\.gov|broadbandusa|commerce\.wa/.test(url)) return 'tier1';
  if (/lightreading|fiercenetwork|telecompetitor|bbcmag|geekwire|prnewswire|businesswire|yahoo\.com\/news/.test(url)) return 'tier2';
  return 'reported';
}

function buildTag(confidence: string, url: string): string {
  if (confidence === 'tier1') return `[VERIFIED — Tier 1: ${url}]`;
  if (confidence === 'tier2') return `[VERIFIED — Tier 2: ${url}]`;
  if (confidence === 'reported') return `[REPORTED — ${url}]`;
  return '[UNVERIFIED]';
}

export async function semanticVerifyClaim(
  claim: string,
  claimType: ClaimType,
  company: string,
): Promise<VerifiedClaim> {
  const prompt = `You are a fact-checker for a B2B sales email. Verify this specific claim.

CLAIM: "${claim}"
CLAIM TYPE: ${claimType}
COMPANY: ${company}

INSTRUCTIONS:
1. Search the web for this claim
2. Find the most authoritative source
3. CRITICALLY: Does the source actually support THIS EXACT claim? Or does it support a DIFFERENT claim about the same company? (e.g., revenue vs backlog are different numbers — don't conflate them)
4. If the claim is about a dollar amount, employee count, or project scale — verify the EXACT number, not just that the company exists

Output JSON only:
{
  "verified": true/false,
  "sourceUrl": "URL of the source you found",
  "sourceSnippet": "exact quote from the source that confirms or contradicts",
  "discrepancy": "if not verified, what the correct information is",
  "reasoning": "why you believe this source does or does not support the claim"
}`;

  try {
    const raw = await callLLM(prompt, {
      model: 'claude-sonnet-4-6',
      timeoutMs: 60000,
      label: `semantic-verify-${claimType}`,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { claim, claimType, verified: false, confidence: 'unverified', sourceUrl: '', sourceSnippet: '', discrepancy: 'Parse error', tag: '[UNVERIFIED]' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const confidence = classifySource(parsed.sourceUrl || '');
    const finalVerified = parsed.verified && confidence !== 'unverified';

    return {
      claim,
      claimType,
      verified: finalVerified,
      confidence: finalVerified ? confidence : 'unverified',
      sourceUrl: parsed.sourceUrl || '',
      sourceSnippet: (parsed.sourceSnippet || '').slice(0, 200),
      discrepancy: parsed.discrepancy || '',
      tag: buildTag(finalVerified ? confidence : 'unverified', parsed.sourceUrl || ''),
    };
  } catch {
    return { claim, claimType, verified: false, confidence: 'unverified', sourceUrl: '', sourceSnippet: '', discrepancy: 'Verification failed', tag: '[UNVERIFIED]' };
  }
}

export async function verifyAllClaims(
  text: string,
  company: string,
  prospectId: string,
): Promise<VerificationReport> {
  const detected = detectClaims(text);
  const claims: VerifiedClaim[] = [];
  const blockers: string[] = [];

  for (const claim of detected) {
    console.log(`    ⏳ Verifying [${claim.type}]: "${claim.text.slice(0, 40)}..."`);
    const result = await semanticVerifyClaim(claim.text, claim.type, company);
    claims.push(result);

    if (!result.verified && ['dollar_amount', 'bead_award', 'employee_count', 'acquisition'].includes(claim.type)) {
      blockers.push(`${claim.type}: "${claim.text.slice(0, 60)}" — ${result.discrepancy || 'could not verify'}`);
    }

    const icon = result.verified ? '✓' : '⚠';
    console.log(`    ${icon} ${result.tag}`);
  }

  const verified = claims.filter(c => c.verified).length;
  const unverified = claims.filter(c => !c.verified).length;

  let overallConfidence: 'high' | 'medium' | 'low';
  if (blockers.length > 0) overallConfidence = 'low';
  else if (unverified > 0) overallConfidence = 'medium';
  else overallConfidence = 'high';

  return {
    prospectId,
    totalClaims: claims.length,
    verified,
    unverified,
    claims,
    overallConfidence,
    blockers,
  };
}

export function tagIntelWithConfidence(
  intelText: string,
  verifiedClaims: VerifiedClaim[],
): string {
  let tagged = intelText;
  for (const claim of verifiedClaims) {
    const claimSnippet = claim.claim.slice(0, 30);
    if (tagged.includes(claimSnippet)) {
      tagged = tagged.replace(claimSnippet, `${claimSnippet} ${claim.tag}`);
    }
  }
  return tagged;
}
