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
const VALID_AUTOMATION_LEVELS = ['manual', 'partial', 'moderate', 'high'];
const VALID_PRODUCT_FIT = ['fiber_drawings', 'data_validation', 'engineering_credits', 'unknown'];

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

## IMPORTANT: Write for an AE who has 30 seconds per prospect.
- Each field: 1-2 SHORT sentences max. No paragraphs. No prose.
- Use fragments, not full sentences. "756 employees. Canton GA. 4 continents." not "They are a 756-employee firm headquartered in Canton, Georgia with offices across four continents."
- Bullet points with "- " prefix for lists (talking_points, objections).
- Numbers > words. "$83M BEAD" not "approximately eighty-three million dollars in BEAD funding."

## Extract into these fields (JSON only)

{
  "contact": {
    "showrev_research_summary": "1-2 sentences. Who they are, what they control. Fragment style.",
    "showrev_decision_authority": "Budget owner | Influencer | Champion | Unknown",
    "showrev_likely_objections": "Numbered list. 1. Objection. 2. Objection. Max 3.",
    "showrev_talking_points": "- Bullet point question/topic\\n- Bullet point\\n- Bullet point. Max 5.",
    "showrev_persona_classification": "build_pace | drawings_quality | permit_cycle | program_leverage | cycle_time_exec | capital_efficiency | pass_through | connect_request",
    "showrev_linkedin_summary": "Title history + certifications. 1 line.",
    "showrev_other_stakeholders": "Name (Title) — relationship. One per line."
  },
  "company": {
    "showrev_company_summary": "What they do. Size. Location. 1-2 sentences max.",
    "showrev_company_size": "Employee count + revenue if known. e.g. '756 employees. ~$120M revenue.'",
    "showrev_fiber_activities": "Comma-separated list. FTTx, OSP engineering, pole loading, etc.",
    "showrev_bead_status": "State, dollar amount, timeline. e.g. 'OK BEAD $797M. Construction Q3 2026.'",
    "showrev_growth_signals": "Acquisitions, hiring, expansion. Fragment list.",
    "showrev_competitive_landscape": "Tools/vendors in use. e.g. 'IQGeo (GIS), Centillion/Osmose (design).'",
    "showrev_key_projects": "Named projects with scale. e.g. 'TDS integration: 35,000 locations.'",
    "showrev_recent_news": "Last 12 months. One line per event.",
    "showrev_external_deadlines": "Dates. e.g. 'BEAD construction Q3 2026. ISP contracts close Oct 2026.'",
    "showrev_automation_level": "manual | partial | moderate | high (manual: 0-20% automated, partial: 20-40%, moderate: 40-60%, high: >60%. Classify based on number of manual vs automated steps described.)",
    "showrev_hq_state": "2-letter US state code where the company is headquartered. e.g. 'TX'. If unknown, use '[insufficient data]'."
  },
  "salesIntel": {
    "showrev_influence_pattern": "${patternSelections[0]?.pattern || ''}",
    "showrev_challenger_insight": "The one thing they probably don't know. 1 sentence.",
    "showrev_buying_timeline": "Window + driver. e.g. 'Q2-Q3 2026. BEAD construction start.'",
    "showrev_deal_size_estimate": "Range. e.g. 'Mid-market $100K-300K.'",
    "showrev_signal_strength": "Strong | Good | Possible | Weak | No fit",
    "showrev_fit_rationale": "One sentence. Why they fit or don't.",
    "showrev_next_best_action": "One specific step. Name the person. Name the action.",
    "showrev_risk_factors": "1. Risk. 2. Risk. Max 3.",
    "showrev_multi_thread_contacts": "Name (Title). One per line.",
    "showrev_product_fit": "fiber_drawings | data_validation | engineering_credits | unknown (which Inorsa product best fits this prospect's primary need)"
  },
  "meta": {
    "showrev_research_confidence": "high | medium | low",
    "showrev_sources_count": 0
  }
}

Rules:
- BREVITY IS MANDATORY. An AE reads this in 30 seconds before a call. If they can't scan it, it failed.
- Fields with insufficient data: use "[insufficient data]" — do NOT make up facts.
- showrev_decision_authority MUST be exactly one of: Budget owner, Influencer, Champion, Unknown
- showrev_signal_strength MUST be exactly one of: Strong, Good, Possible, Weak, No fit
- showrev_persona_classification MUST be exactly one of: build_pace, drawings_quality, permit_cycle, program_leverage, cycle_time_exec, capital_efficiency, pass_through, connect_request
- showrev_automation_level MUST be exactly one of: manual, partial, moderate, high
- showrev_product_fit MUST be exactly one of: fiber_drawings, data_validation, engineering_credits, unknown`;
}

function repairJSON(text: string): string {
  return text
    .replace(/[\x00-\x1f]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    })
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
}

function parseStructuredOutput(raw: string): any {
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
  const jsonText = jsonMatch ? jsonMatch[1] : raw;

  try {
    return JSON.parse(jsonText);
  } catch {
    return JSON.parse(repairJSON(jsonText));
  }
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

  if (company.showrev_automation_level && !VALID_AUTOMATION_LEVELS.includes(company.showrev_automation_level)) {
    warnings.push(`Invalid automation_level "${company.showrev_automation_level}", defaulting to unknown`);
    company.showrev_automation_level = 'unknown';
  }

  if (salesIntel.showrev_product_fit && !VALID_PRODUCT_FIT.includes(salesIntel.showrev_product_fit)) {
    warnings.push(`Invalid product_fit "${salesIntel.showrev_product_fit}", defaulting to unknown`);
    salesIntel.showrev_product_fit = 'unknown';
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
