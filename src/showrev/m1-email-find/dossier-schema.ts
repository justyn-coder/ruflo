export interface HubSpotDossier {
  contact: HubSpotContactFields;
  company: HubSpotCompanyFields;
  salesIntel: SalesIntelFields;
  emailSequence: EmailSequenceFields;
  meta: DossierMeta;
}

export interface HubSpotContactFields {
  email: string;
  firstname: string;
  lastname: string;
  jobtitle: string;
  phone: string;
  city: string;
  state: string;

  // Custom properties for AE prep (comments show HubSpot property name)
  showrev_research_summary: string;          // HS: showrev_research_summary — "Oversees fiber engineering across 50 states. 15yr career in fiber construction."
  showrev_decision_authority: string;        // HS: showrev_decision_authority — "Budget owner" | "Influencer" | "Champion" | "Unknown"
  showrev_likely_objections: string;         // HS: showrev_likely_objections — "Price sensitivity (prior relationship), may compare to Nvidia tool"
  showrev_talking_points: string;            // HS: showrev_talking_points — "Ask about Maryland ISP project. Reference BEAD timeline pressure."
  showrev_booth_notes: string;               // HS: showrev_booth_notes — Raw AE booth notes
  showrev_persona_classification: string;    // HS: showrev_persona_classification — "drawings_quality" | "permit_cycle" | "network_expansion" etc.
  showrev_linkedin_summary: string;          // HS: showrev_linkedin_summary — Key points from LinkedIn
  showrev_other_stakeholders: string;        // HS: showrev_other_stakeholders — "Landon Willets (National Account Director) also visited booth"
}

export interface HubSpotCompanyFields {
  name: string;
  domain: string;
  city: string;
  state: string;
  industry: string;

  // Custom properties for AE prep (comments show HubSpot property name)
  showrev_company_summary: string;           // HS: showrev_company_summary — "Family-owned telco, 60yr history. $250M fiber expansion underway."
  showrev_company_size: string;              // HS: showrev_company_size — "~200 employees, ~$30M revenue"
  showrev_fiber_activities: string;          // HS: showrev_fiber_activities — "FTTH + long haul. TDS acquisition added 35K locations."
  showrev_bead_status: string;               // HS: showrev_bead_status — "$797M Oklahoma BEAD allocation. Primary recipient. Construction Q4 2026."
  showrev_growth_signals: string;            // HS: showrev_growth_signals — "TDS acquisition Jul 2025. 8,000-home FTTH deployment. 11-county ARPA projects."
  showrev_competitive_landscape: string;     // HS: showrev_competitive_landscape — "Prospect mentioned Nvidia tool. Hexagon identified as competitor by AE."
  showrev_key_projects: string;              // HS: showrev_key_projects — "200-mile Maryland ISP project. Project Santa: 70K homes in 20 days."
  showrev_recent_news: string;               // HS: showrev_recent_news — "Acquired TDS Oklahoma operations Jul 2025. BEAD provisional award Aug 2025."
  showrev_external_deadlines: string;        // HS: showrev_external_deadlines — "BEAD construction must begin by Q4 2026. Services operational by end 2028."
}

export interface SalesIntelFields {
  showrev_influence_pattern: string;         // HS: showrev_influence_pattern — "commitment_consistency"
  showrev_challenger_insight: string;        // HS: showrev_challenger_insight — The one thing they probably don't know
  showrev_buying_timeline: string;           // HS: showrev_buying_timeline — "Q4 2026 - BEAD construction start" | "No external deadline"
  showrev_deal_size_estimate: string;        // HS: showrev_deal_size_estimate — "Mid-market. Est. $100K-300K if multi-year."
  showrev_signal_strength: string;           // HS: showrev_signal_strength — "Strong" | "Good" | "Possible" | "Weak" | "No fit"
  showrev_fit_rationale: string;             // HS: showrev_fit_rationale — "High volume, multi-state, BEAD-funded. Core ICP."
  showrev_next_best_action: string;          // HS: showrev_next_best_action — "Book demo - prospect asked for it at booth"
  showrev_risk_factors: string;              // HS: showrev_risk_factors — "Price was sticking point in prior relationship"
  showrev_multi_thread_contacts: string;     // HS: showrev_multi_thread_contacts — "Also contact: Landon Willets (same company, same show)"
}

export interface EmailSequenceFields {
  showrev_t1_subject: string;
  showrev_t1_body: string;
  showrev_t1_ps: string;
  showrev_t1_send_date: string;
  showrev_t1_status: string;                 // "draft" | "approved" | "sent" | "replied" | "bounced"
  showrev_t2_subject: string;
  showrev_t2_body: string;
  showrev_t2_ps: string;
  showrev_t2_send_date: string;
  showrev_t2_status: string;
  showrev_t3_subject: string;
  showrev_t3_body: string;
  showrev_t3_ps: string;
  showrev_t3_send_date: string;
  showrev_t3_status: string;
}

export interface DossierMeta {
  showrev_research_date: string;
  showrev_research_confidence: string;       // "high" | "medium" | "low"
  showrev_sources_count: number;
  showrev_sources_list: string;              // JSON array of URLs
  showrev_original_tier: string;             // "A" | "B" | "C" | "D" | "E"
  showrev_revised_tier: string;
  showrev_tier_revision_reason: string;
  showrev_research_model: string;            // "premium_3persona" | "standard_1agent"
  showrev_personas_used: string;             // "analyst,ae_proxy,tech_evaluator"
  showrev_show_name: string;                 // "Fiber Connect 2026"
  showrev_show_date: string;                 // "2026-05-18" (May 18-19, 2026, Gaylord Palms Resort, Kissimmee FL, Booth 1728)
}

export const HUBSPOT_CUSTOM_PROPERTIES = {
  contact: [
    { name: 'showrev_research_summary', label: 'ShowRev: Research Summary', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_decision_authority', label: 'ShowRev: Decision Authority', type: 'enumeration', options: ['Budget owner', 'Influencer', 'Champion', 'Unknown'], group: 'showrev_intel' },
    { name: 'showrev_likely_objections', label: 'ShowRev: Likely Objections', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_talking_points', label: 'ShowRev: AE Talking Points', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_booth_notes', label: 'ShowRev: Booth Notes', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_persona_classification', label: 'ShowRev: Persona Classification', type: 'enumeration', options: ['drawings_quality', 'permit_cycle', 'network_expansion', 'cost_reduction', 'competitive_pressure', 'bead_deployment', 'workforce'], group: 'showrev_intel' },
    { name: 'showrev_linkedin_summary', label: 'ShowRev: LinkedIn Summary', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_other_stakeholders', label: 'ShowRev: Other Stakeholders', type: 'string', group: 'showrev_intel' },
  ],
  company: [
    { name: 'showrev_company_summary', label: 'ShowRev: Company Summary', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_company_size', label: 'ShowRev: Company Size', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_fiber_activities', label: 'ShowRev: Fiber Activities', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_bead_status', label: 'ShowRev: BEAD Status', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_growth_signals', label: 'ShowRev: Growth Signals', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_competitive_landscape', label: 'ShowRev: Competitive Landscape', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_key_projects', label: 'ShowRev: Key Projects', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_recent_news', label: 'ShowRev: Recent News', type: 'string', group: 'showrev_intel' },
    { name: 'showrev_external_deadlines', label: 'ShowRev: External Deadlines', type: 'string', group: 'showrev_intel' },
  ],
  salesIntel: [
    { name: 'showrev_influence_pattern', label: 'ShowRev: Influence Pattern', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_challenger_insight', label: 'ShowRev: Challenger Insight', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_buying_timeline', label: 'ShowRev: Buying Timeline', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_deal_size_estimate', label: 'ShowRev: Deal Size Estimate', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_signal_strength', label: 'ShowRev: Signal Strength', type: 'enumeration', options: ['Strong', 'Good', 'Possible', 'Weak', 'No fit'], group: 'showrev_sales' },
    { name: 'showrev_fit_rationale', label: 'ShowRev: Fit Rationale', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_next_best_action', label: 'ShowRev: Next Best Action', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_risk_factors', label: 'ShowRev: Risk Factors', type: 'string', group: 'showrev_sales' },
    { name: 'showrev_multi_thread_contacts', label: 'ShowRev: Multi-Thread Contacts', type: 'string', group: 'showrev_sales' },
  ],
};

export function formatDossierForAE(dossier: HubSpotDossier): string {
  const d = dossier;
  return `## ${d.contact.firstname} ${d.contact.lastname} -- ${d.contact.jobtitle} @ ${d.company.name}

**30-Second Prep:**
${d.salesIntel.showrev_next_best_action}

**About them:** ${d.contact.showrev_research_summary}
**Decision authority:** ${d.contact.showrev_decision_authority}
**Persona:** ${d.contact.showrev_persona_classification}

**About ${d.company.name}:** ${d.company.showrev_company_summary}
**Size:** ${d.company.showrev_company_size}
**Fiber work:** ${d.company.showrev_fiber_activities}
**BEAD:** ${d.company.showrev_bead_status}
**Growth signals:** ${d.company.showrev_growth_signals}
**Key projects:** ${d.company.showrev_key_projects}

**The insight they probably don't know:** ${d.salesIntel.showrev_challenger_insight}

**Talking points for the call:**
${d.contact.showrev_talking_points}

**Watch out for:**
- Likely objections: ${d.contact.showrev_likely_objections}
- Risk factors: ${d.salesIntel.showrev_risk_factors}
${d.salesIntel.showrev_multi_thread_contacts ? `- Other contacts from this company: ${d.salesIntel.showrev_multi_thread_contacts}` : ''}

**Fit:** ${d.salesIntel.showrev_signal_strength} -- ${d.salesIntel.showrev_fit_rationale}
**Timeline:** ${d.salesIntel.showrev_buying_timeline}
**Competitive:** ${d.company.showrev_competitive_landscape || 'None identified'}

---
*Research confidence: ${d.meta.showrev_research_confidence} | Sources: ${d.meta.showrev_sources_count} | Model: ${d.meta.showrev_research_model}*`;
}
