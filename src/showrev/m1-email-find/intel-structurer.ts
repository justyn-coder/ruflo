import type { Prospect } from './importer.js';
import type { PatternSelection } from './influence.js';
import type { EmailOutput } from './premium-pipeline.js';
import { callLLM } from './llm-client.js';

const VALID_DECISION_AUTHORITY = ['Budget owner', 'Influencer', 'Champion', 'Unknown'];
const VALID_SIGNAL_STRENGTH = ['Strong', 'Good', 'Possible', 'Weak', 'No fit'];
const VALID_PERSONA_BUCKETS = [
  'build_pace', 'drawings_quality', 'permit_cycle', 'program_leverage',
  'cycle_time_exec', 'capital_efficiency', 'pass_through', 'connect_request',
];

function buildStructurerPrompt(
  analystOutput: string,
  aeProxyOutput: string,
  techEvalOutput: string,
  crossExamInsights: string,
  prospect: Prospect,
  emails: EmailOutput[],
  patternSelections: PatternSelection[],
  aeName: string,
): string {
  return `You are extracting structured intelligence fields from raw research output. Your job is to map findings to specific HubSpot dossier fields. Be specific and cite evidence — do not fill fields with generic statements.

## Raw research

### Industry Analyst findings
${analystOutput.slice(0, 3000)}

### AE Proxy findings
${aeProxyOutput.slice(0, 3000)}

### Technical Evaluator findings
${techEvalOutput.slice(0, 3000)}

### Cross-examination insights
${crossExamInsights.slice(0, 1500)}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${prospect.company}
- State: ${prospect.state}

## Extract into these fields (JSON only)

{
  "contact": {
    "showrev_research_summary": "2-3 sentence summary of who this person is and why they matter. Include career tenure and scope of responsibility.",
    "showrev_decision_authority": "Budget owner | Influencer | Champion | Unknown — based on org position, title, and AE Proxy findings",
    "showrev_likely_objections": "What would make them say no? Price, timing, existing tool, skepticism, wrong priority?",
    "showrev_talking_points": "3-5 bullet points for the AE call. Specific questions to ask, topics to raise, things to reference.",
    "showrev_persona_classification": "build_pace | drawings_quality | permit_cycle | program_leverage | cycle_time_exec | capital_efficiency | pass_through | connect_request",
    "showrev_linkedin_summary": "Key points from LinkedIn research (if found). Role history, stated interests, certifications.",
    "showrev_other_stakeholders": "Other contacts from this company found during research. Name, title, relationship."
  },
  "company": {
    "showrev_company_summary": "2-3 sentences. What the company does, size, history, current trajectory.",
    "showrev_company_size": "Employee count and/or revenue range. Cite source.",
    "showrev_fiber_activities": "What fiber/telecom work they do. FTTH, long haul, A&E, construction, etc.",
    "showrev_bead_status": "BEAD allocation, award status, construction timeline. State and dollar amount if known.",
    "showrev_growth_signals": "Acquisitions, expansions, new markets, hiring, funding rounds.",
    "showrev_competitive_landscape": "Known competitors or tools in use. Vendor relationships.",
    "showrev_key_projects": "Named projects with scale (miles, homes, dollars).",
    "showrev_recent_news": "News from last 12 months. Acquisitions, awards, leadership changes.",
    "showrev_external_deadlines": "BEAD construction deadlines, funding tranche dates, regulatory milestones."
  },
  "salesIntel": {
    "showrev_influence_pattern": "${patternSelections[0]?.pattern || ''}",
    "showrev_challenger_insight": "${patternSelections[0]?.challengerInsight?.slice(0, 100) || ''}",
    "showrev_buying_timeline": "When is the buying window? External deadline or internal priority?",
    "showrev_deal_size_estimate": "Estimated deal size range based on company size and project scope.",
    "showrev_signal_strength": "Strong | Good | Possible | Weak | No fit — based on evidence weight",
    "showrev_fit_rationale": "One sentence: why this company fits or doesn't fit Inorsa's ICP.",
    "showrev_next_best_action": "The single most important next step for the AE. Be specific.",
    "showrev_risk_factors": "What could go wrong? Prior objections, competitor entrenchment, timing issues.",
    "showrev_multi_thread_contacts": "Other people at this company to engage. Names and roles."
  },
  "meta": {
    "showrev_research_confidence": "high | medium | low — based on source count and evidence quality",
    "showrev_sources_count": 0
  }
}

Rules:
- Every field that has evidence: fill it with specific, cited content.
- Fields with insufficient data: use "[insufficient data]" — do NOT make up facts.
- showrev_talking_points: format as "- Question/topic\\n- Question/topic" (newline-separated bullets)
- showrev_decision_authority MUST be exactly one of: Budget owner, Influencer, Champion, Unknown
- showrev_signal_strength MUST be exactly one of: Strong, Good, Possible, Weak, No fit
- showrev_persona_classification MUST be exactly one of: build_pace, drawings_quality, permit_cycle, program_leverage, cycle_time_exec, capital_efficiency, pass_through, connect_request`;
}

function parseStructuredOutput(raw: string): any {
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
  if (jsonMatch) return JSON.parse(jsonMatch[1]);
  return JSON.parse(raw);
}

function validateAndClean(parsed: any): { dossier: any; warnings: string[] } {
  const warnings: string[] = [];

  const contact = parsed.contact || {};
  const company = parsed.company || {};
  const salesIntel = parsed.salesIntel || {};
  const meta = parsed.meta || {};

  if (contact.showrev_decision_authority && !VALID_DECISION_AUTHORITY.includes(contact.showrev_decision_authority)) {
    warnings.push(`Invalid decision_authority "${contact.showrev_decision_authority}", defaulting to Unknown`);
    contact.showrev_decision_authority = 'Unknown';
  }

  if (salesIntel.showrev_signal_strength && !VALID_SIGNAL_STRENGTH.includes(salesIntel.showrev_signal_strength)) {
    warnings.push(`Invalid signal_strength "${salesIntel.showrev_signal_strength}", defaulting to Possible`);
    salesIntel.showrev_signal_strength = 'Possible';
  }

  if (contact.showrev_persona_classification && !VALID_PERSONA_BUCKETS.includes(contact.showrev_persona_classification)) {
    warnings.push(`Invalid persona "${contact.showrev_persona_classification}", defaulting to cycle_time_exec`);
    contact.showrev_persona_classification = 'cycle_time_exec';
  }

  const insufficientFields: string[] = [];
  for (const [section, fields] of Object.entries({ contact, company, salesIntel }) as [string, Record<string, string>][]) {
    for (const [key, val] of Object.entries(fields)) {
      if (val === '[insufficient data]') {
        insufficientFields.push(`${section}.${key}`);
      }
    }
  }
  if (insufficientFields.length > 0) {
    warnings.push(`Insufficient data for: ${insufficientFields.join(', ')}`);
  }

  return { dossier: { contact, company, salesIntel, meta }, warnings };
}

export async function structureIntelReport(
  personaResults: Record<string, string>,
  crossExamInsights: string,
  prospect: Prospect,
  emails: EmailOutput[],
  patternSelections: PatternSelection[],
  aeName: string,
  model: string = 'claude-sonnet-4-6',
): Promise<{ dossier: any; warnings: string[] }> {
  const prompt = buildStructurerPrompt(
    personaResults['Industry Analyst'] || '',
    personaResults['AE Proxy'] || '',
    personaResults['Technical Evaluator'] || '',
    crossExamInsights,
    prospect,
    emails,
    patternSelections,
    aeName,
  );

  const raw = await callLLM(prompt, { model, timeoutMs: 180000, label: 'intel-structure' });
  const parsed = parseStructuredOutput(raw);
  return validateAndClean(parsed);
}
