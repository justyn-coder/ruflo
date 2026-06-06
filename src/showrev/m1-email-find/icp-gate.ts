import { callLLM } from './llm-client.js';

export type ICPType = 'fiber_operator' | 'ae_firm' | 'non_icp';
export type ICPVerdict = 'pass' | 'reject';

export interface ICPResult {
  verdict: ICPVerdict;
  icpType: ICPType;
  reason: string;
  confidence: number;
  method: 'regex' | 'llm';
}

const AE_INDICATORS = [
  /\bengineering?\b/i, /\bdesign\b/i, /\bA&E\b/i, /\bconsult/i,
  /\bdrafting\b/i, /\bCAD\b/i, /\bsurveying\b/i, /\bconstruction.*services\b/i,
  /\binfrastructure.*services\b/i, /\btelecom.*services\b/i,
  /\btechnical.*services\b/i, /\barchitect/i,
];

const OPERATOR_INDICATORS = [
  /\bbroadband\b/i, /\btelecom(?!.*services)\b/i, /\bcommunications\b/i,
  /\bfiber\b/i, /\belectric.*coop\b/i, /\butility\b/i, /\bmunicipal\b/i,
  /\bgig\b/i, /\bconnect\b/i, /\bISP\b/i, /\binternet\b/i, /\bteleph/i,
];

const NON_ICP_INDICATORS = [
  /\bequipment\b/i, /\bvendor\b/i, /\bsoftware\b/i, /\bmagazine\b/i,
  /\bmedia\b/i, /\bassociation\b/i, /\buniversity\b/i, /\bgovernment\b/i,
  /\blaw\b/i, /\blegal\b/i, /\bfinancial\b/i, /\bbank\b/i, /\binsurance\b/i,
  /\breal estate\b/i, /\bmanufactur/i, /\bhardware\b/i, /\bdistribut/i,
  /\bpublish/i, /\btraining\b/i, /\bacademi/i, /\bresearch\b(?!.*services)/i,
];

const TOWER_AE_INDICATORS = [
  /\bcell\s*site/i,
  /\bmacro\s*site/i,
  /\bsmall\s*cell/i,
  /\btower\s+(?:engineering|design|analysis|construction)/i,
  /\bDAS\b/,
  /\bdistributed\s+antenna/i,
  /\bosmose\b/i,
];

const FIBER_OVERRIDE_INDICATORS = [
  /\bfiber\b/i, /\bFTT[HPx]\b/i, /\bbroadband\b/i,
  /\bOSP\b/i, /\boutside\s+plant\b/i,
];

const NON_ICP_ROLES = [
  /\bmarketing\b/i, /\bsales(?!.*engineer)\b/i, /\bHR\b/i,
  /\bhuman resources\b/i, /\blegal\b/i, /\bcounsel\b/i,
  /\badmin\b/i, /\breceptionist\b/i, /\bintern\b/i,
  /\bstudent\b/i, /\brecruiter\b/i, /\baccountant\b/i,
  /\bbusiness\s+development\b/i,
];

function regexClassify(company: string, title: string): ICPResult | null {
  if (NON_ICP_INDICATORS.some(p => p.test(company))) {
    return { verdict: 'reject', icpType: 'non_icp', reason: `Company name matches non-ICP pattern`, confidence: 0.8, method: 'regex' };
  }

  // Non-ICP roles at non-ICP companies are reject — but non-ICP roles at unknown companies go to LLM
  if (NON_ICP_ROLES.some(p => p.test(title)) && NON_ICP_INDICATORS.some(p => p.test(company))) {
    return { verdict: 'reject', icpType: 'non_icp', reason: `Non-ICP role at non-ICP company`, confidence: 0.8, method: 'regex' };
  }

  const aeScore = AE_INDICATORS.filter(p => p.test(company)).length;
  const opScore = OPERATOR_INDICATORS.filter(p => p.test(company)).length;

  if (aeScore >= 1) {
    const hasTowerSignals = TOWER_AE_INDICATORS.some(p => p.test(company) || p.test(title));
    if (hasTowerSignals) {
      const hasFiberOverride = FIBER_OVERRIDE_INDICATORS.some(p => p.test(company) || p.test(title));
      if (!hasFiberOverride) {
        return { verdict: 'reject', icpType: 'non_icp', reason: `A&E firm with tower/cellular indicators (no fiber override)`, confidence: 0.7, method: 'regex' };
      }
    }
  }

  if (aeScore >= 1 && aeScore > opScore) {
    return { verdict: 'pass', icpType: 'ae_firm', reason: `Company matches A&E indicators (${aeScore} signals)`, confidence: Math.min(aeScore * 0.3, 0.9), method: 'regex' };
  }
  if (opScore >= 1 && opScore > aeScore) {
    return { verdict: 'pass', icpType: 'fiber_operator', reason: `Company matches fiber operator indicators (${opScore} signals)`, confidence: Math.min(opScore * 0.3, 0.9), method: 'regex' };
  }
  if (aeScore >= 1 && aeScore === opScore) {
    return { verdict: 'pass', icpType: 'ae_firm', reason: `Company matches both A&E and operator indicators`, confidence: 0.5, method: 'regex' };
  }

  return null;
}

async function llmClassify(company: string, title: string): Promise<ICPResult> {
  const prompt = `Classify this company for a fiber broadband sales tool. Answer JSON only.

Company: "${company}"
Contact title: "${title}"

Inorsa's ICP has TWO segments:
1. **Fiber operators** — ISPs, telcos, cable companies, electric cooperatives, municipal broadband utilities, or any entity that builds/operates fiber optic networks.
2. **A&E firms** — Architecture & Engineering firms, design firms, OSP engineering firms, consulting engineering firms, or construction services firms that do fiber network design work.

REJECT as non_icp ONLY when you have POSITIVE evidence the company is one of these:
- Hardware/equipment manufacturers or distributors (e.g., Clearfield makes fiber cabinets)
- Software/SaaS companies (e.g., Biarri sells network planning software)
- Media, trade associations, universities, government agencies, law firms, financial firms

ALSO REJECT as non_icp if the company is an A&E firm that ONLY does tower/cellular work (cell sites, macro sites, small cells, DAS, distributed antenna systems, tower structural analysis). These companies are NOT in Inorsa's fiber ICP. HOWEVER: if the company does BOTH tower AND fiber work, classify as "ae_firm" — fiber indicators (fiber, FTTH, broadband, OSP, outside plant) override tower indicators.

CRITICAL RULE: If you are UNCERTAIN what the company does based on the name alone, classify as "fiber_operator" with low confidence. Do NOT reject uncertain companies — the pipeline will research them and the judge will catch mismatches. False negatives (rejecting a real prospect) are 10x worse than false positives (researching a non-fit).

Output JSON:
{
  "icpType": "fiber_operator" | "ae_firm" | "non_icp",
  "reason": "one sentence explaining what the company does and why it fits or doesn't fit",
  "confidence": 0.0-1.0
}`;

  try {
    const raw = await callLLM(prompt, {
      model: 'claude-haiku-4-5-20251001',
      timeoutMs: 15000,
      label: 'icp-gate',
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { verdict: 'pass', icpType: 'fiber_operator', reason: 'ICP classification failed to parse — defaulting to pass', confidence: 0, method: 'llm' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const icpType: ICPType = parsed.icpType || 'non_icp';
    const verdict: ICPVerdict = icpType === 'non_icp' ? 'reject' : 'pass';

    return {
      verdict,
      icpType,
      reason: parsed.reason || 'No reason provided',
      confidence: parsed.confidence || 0.5,
      method: 'llm',
    };
  } catch (err: any) {
    return { verdict: 'pass', icpType: 'fiber_operator', reason: `ICP classification error: ${err.message?.slice(0, 60)} — defaulting to pass`, confidence: 0, method: 'llm' };
  }
}

export async function icpGate(company: string, title: string, verbose = false): Promise<ICPResult> {
  const regexResult = regexClassify(company, title);

  if (regexResult) {
    if (verbose) console.log(`  -> ICP (regex): ${regexResult.verdict} — ${regexResult.icpType} (${regexResult.reason})`);
    return regexResult;
  }

  if (verbose) console.log(`  -> ICP regex inconclusive, calling LLM classifier...`);
  const llmResult = await llmClassify(company, title);
  if (verbose) console.log(`  -> ICP (LLM): ${llmResult.verdict} — ${llmResult.icpType} (${llmResult.reason})`);
  return llmResult;
}
