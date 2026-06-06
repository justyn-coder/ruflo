export interface PersonaPrompt {
  role: string;
  focus: string;
  questions: string[];
  searchStrategy: string;
}

export const RESEARCH_PERSONAS: PersonaPrompt[] = [
  {
    role: 'Industry Analyst',
    focus: 'Market dynamics, competitive landscape, regulatory environment, growth signals',
    questions: [
      'What is this company\'s position in the fiber/telecom market? Are they growing, stable, or contracting?',
      'What external forces are acting on them right now? (BEAD funding, regulatory deadlines, competitive pressure, M&A activity)',
      'What do their recent job postings reveal about where they\'re investing?',
      'Who are their competitors and how are those competitors handling design/engineering capacity?',
      'What industry trends would make their current approach unsustainable in 12-18 months?',
    ],
    searchStrategy: `PRIORITY SEARCHES (in order):
1. Company name + "fiber" OR "broadband" OR "BEAD" OR "FTTH" (general landscape)
2. Company name + site:fiercenetwork.com OR site:lightreading.com OR site:telecompetitor.com (trade press mentions with direct quotes)
3. Company name + "Fiber Connect" OR "Mountain Connect" OR "Broadband Communities" (conference speaker appearances)
4. State broadband office + company name (BEAD sub-grant awards for THIS specific company, not just state allocation)
5. Company name + "podcast" OR site:etisoftware.com/blog (long-form interviews where executives speak in their own words)
6. Company name + "acquired" OR "acquisition" OR "subsidiary" OR "portfolio company" (parent/child relationships, hidden technology platforms — Terracon/Pivvot pattern)
7. Company name + "owns" OR "merged with" OR "division of" (corporate structure that web search on the primary domain would miss)
CROSS-REFERENCE against industry-intelligence-kb.md: what macro forces (BEAD timeline, fiber price increases, M&A wave, labor shortage) apply to this company's segment + geography?
Look for: funding announcements, project awards, regulatory filings, earnings call mentions (if public or PE-backed).
Gap signal: if company size vs stated project scope shows a capacity gap, that is the email opener.`,
  },
  {
    role: 'AE Proxy',
    focus: 'Buying signals, decision authority, budget timing, objections, sales angle',
    questions: [
      'Is this contact the actual decision-maker, or do they influence someone else? Who else would be involved?',
      'Based on their title and company structure, do they control budget or recommend to someone who does?',
      'What is their likely buying timeline? Is there an external deadline driving urgency (BEAD milestones, board commitments, funding tranches)?',
      'What objections would this person likely raise? (price, integration complexity, "we already have a tool", "not the right time")',
      'What would make this person look good internally if they brought Inorsa to their team?',
    ],
    searchStrategy: `PRIORITY SEARCHES (in order):
1. Contact full name + LinkedIn (role, career history, tenure, previous companies)
2. Contact full name + "Fiber Connect" OR "panel" OR "speaker" OR "presentation" (conference appearances where they spoke publicly)
3. Contact full name + company name + site:etisoftware.com OR site:bbcmag.com OR site:lightreading.com (trade press interviews or quotes in their own words)
4. Company leadership page / team page (org structure, who else is in engineering/operations)
5. Check booth-scan list for other contacts from same company (multi-threading opportunity)
INFER from persona bucket: Build persona cares about field crew utilization. Design/Document persona cares about engineering throughput. Fund/Capitalize persona cares about margins and timeline to revenue.
Look for: recent promotions, new hires in their department, speaking engagements where they stated priorities.
Best possible find: a direct quote from this person about their challenges, from a podcast, panel, or trade press interview. This becomes the email opener.`,
  },
  {
    role: 'Technical Evaluator',
    focus: 'Current tools, workflow, technical pain points, integration fit',
    questions: [
      'What design/engineering tools does this company likely use? (AutoCAD, MicroStation, GIS platforms, Biarri, Render Networks, etc.)',
      'How do they currently produce fiber construction drawings? In-house team, outsourced, or hybrid?',
      'What is their current design-to-permit timeline? Is it a bottleneck relative to their construction pace?',
      'Would Inorsa integrate into their existing workflow or replace something? What\'s the switching cost?',
      'Are there technical red flags? (company too small for automation ROI, wrong type of fiber work, already using a competitor)',
      'What is this company\'s current level of GIS-to-CAD automation? Note what percentage or degree of automation they report.',
      'Check job postings and tech stack mentions for MicroStation usage (hard disqualifier for conversion).',
    ],
    searchStrategy: `PRIORITY SEARCHES (in order):
1. Company name + "hiring" OR "careers" OR site:linkedin.com/jobs (JOB POSTINGS are the single best signal for tools used, team size, growth areas, and urgency. A company hiring 3 CAD drafters RIGHT NOW tells you more than their website.)
2. Company name + "AutoCAD" OR "MicroStation" OR "Bentley" OR "3GIS" OR "Katapult" OR "IQGeo" OR "ArcGIS" (tech stack identification)
3. Company name + site:iqgeo.com OR site:3-gis.com OR site:rendernetworks.com OR site:katapult.com (VENDOR CASE STUDIES where this company is a named customer. Competitor clients = our prospects with known tech stack.)
4. Company name + "construction drawings" OR "fiber design" OR "engineering" OR "permitting" (general capability search)
5. Company careers page directly (firecrawl if needed for JS-rendered pages)
6. Company name + "acquired" OR "acquisition" (subsidiaries with their own tech platforms — the Terracon/Pivvot pattern: parent company owns a tool on a separate domain that basic research misses)
7. Company name + "subsidiary" OR "division" OR "portfolio" (corporate structure search — if the company is PE-backed or a subsidiary itself, the parent may own tools)
Check: company careers page for engineering job postings (reveals tools and scale).
Look for: case studies, project portfolios, technical partnerships mentioned on their site.
Cross-reference: booth AE notes for any tool mentions (e.g., Nvidia, Hexagon, CAD references).
CRITICAL: If known_tools or likely_competitors would be empty after your research, explicitly search for acquisitions and subsidiaries before concluding "[Insufficient data]". The Terracon miss (owned Pivvot, a geospatial platform) happened because research only checked terracon.com.`,
  },
];

export interface CrossExamQuestion {
  from: string;
  to: string;
  question: string;
}

export function generateCrossExamQuestions(
  analystFindings: string,
  aeFindings: string,
  techFindings: string
): CrossExamQuestion[] {
  return [
    {
      from: 'AE Proxy',
      to: 'Industry Analyst',
      question: `The analyst found growth signals. But is the company actually in a BUYING position right now, or are they in survival/cost-cutting mode? What evidence distinguishes "growing" from "spending"?`,
    },
    {
      from: 'Technical Evaluator',
      to: 'Industry Analyst',
      question: `The analyst identified BEAD funding or expansion. Does the company's current engineering capacity match their stated buildout targets? If not, where's the gap — headcount, tools, or process?`,
    },
    {
      from: 'Industry Analyst',
      to: 'AE Proxy',
      question: `The AE proxy identified the buyer. But are there other stakeholders who could block this? Who else at this company was at the show or on the booth-scan list?`,
    },
    {
      from: 'Technical Evaluator',
      to: 'AE Proxy',
      question: `If the prospect already uses a competing tool (or has built an internal solution), what's the realistic switching cost? Is the objection "we already have something" likely?`,
    },
    {
      from: 'Industry Analyst',
      to: 'Technical Evaluator',
      question: `The tech evaluator assessed their tooling. But given industry trends (BEAD deadlines, labor shortages in fiber engineering), is their current tooling sustainable at the scale they're targeting?`,
    },
    {
      from: 'AE Proxy',
      to: 'Technical Evaluator',
      question: `The prospect's title suggests they own X workflow. Does the technical evidence confirm this, or is the actual pain point in a different part of the pipeline than we assumed?`,
    },
  ];
}

export function buildMultiPersonaPrompt(
  prospectContext: string,
  persona: PersonaPrompt,
  aeNotes: string,
  otherFindings?: { analyst?: string; ae?: string; tech?: string }
): string {
  const crossExamSection = otherFindings
    ? `\n## Findings from other research personas (cross-examine these)
${otherFindings.analyst ? `**Industry Analyst found:** ${otherFindings.analyst}` : ''}
${otherFindings.ae ? `**AE Proxy found:** ${otherFindings.ae}` : ''}
${otherFindings.tech ? `**Technical Evaluator found:** ${otherFindings.tech}` : ''}

Your job: Challenge these findings. Where do you agree? Where do you see gaps, contradictions, or unsupported claims? What would CHANGE the conclusion if you found disconfirming evidence?`
    : '';

  return `You are a ${persona.role} researching a B2B prospect for a post-tradeshow follow-up campaign.

## Your focus area
${persona.focus}

## Prospect context
${prospectContext}

${aeNotes ? `## AE booth notes\n"${aeNotes}"` : '## No AE booth notes available — rely entirely on research.'}

## Industry baseline (from ShowRev Industry Intelligence KB, start here, confirm/refine per prospect)
Key forces acting on ALL fiber companies right now (May 2026):
- BEAD operational April 30, 2026. States have 6 months to finalize ISP contracts. Construction starts Q3 2026 at earliest. 4-year deployment deadline.
- Fiber prices up 40-80%. Supply tight through 2027.
- Labor shortage: 3:1 job-to-candidate ratio for fiber designers. 58,000 new roles needed by 2032. 3+ year ramp for new designers.
- Permitting is the binding constraint. Each kickback = 3-6 weeks. Average permit review: 8 weeks (efficient) to 12+ months (complex).
- M&A wave accelerating. PE consolidation in engineering services.
- Offshoring growing: 20-40% of design work for larger A&E firms now done offshore.
- AI/automation adoption early but accelerating. Most firms still manual GIS-to-CAD workflow.
USE THIS BASELINE to form hypotheses about the prospect BEFORE searching. Then search to CONFIRM or REFINE.

## Client (Inorsa) value proposition
Inorsa automates the generation of construction drawings from GIS/LLD inputs. The core value is SPEED — dramatically faster drawing production (~10 min vs hours/days) so teams can take on more work and have more time for their own QC before jurisdictional submission.
CRITICAL: Inorsa does NOT validate inputs or catch errors. Errors in the GIS data = errors in the output. Never claim "catches errors" or "validates inputs" or "reduces permit returns." The value is acceleration and capacity.
Key capabilities: ingest GIS data, generate AutoCAD drawings to jurisdictional standards, 2-5x drafting capacity with existing headcount, 70% reduction in construction drawing cycle time.
Key outcome: Revenue Acceleration (faster), Revenue Generation (more volume without hiring), Opportunity (team freed for other work).
FIBER CONNECT 2026 FEEDBACK: Fiber prospects care more about PERMITTING WORKFLOWS and CYCLE TIME than drawing generation alone. 40-50% of permits rejected on first pass (per Nick McManus). Inorsa's speed gives teams more time to QC properly before submission.

## Your research questions (investigate all)
${persona.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Search strategy
${persona.searchStrategy}
${crossExamSection}

## Output format (JSON only, no markdown fencing)
{
  "role": "${persona.role}",
  "keyFindings": ["finding 1 with source", "finding 2 with source", ...],
  "evidenceStrength": "strong|moderate|weak",
  "gaps": ["what I couldn't find or verify"],
  "challengesToOtherFindings": ["where I disagree with other personas and why"],
  "topInsight": "The single most important thing I found that should shape the outreach",
  "sourcesUsed": ["url1", "url2", ...]
}

Be specific. Cite sources. If you can't find evidence for a claim, say so — "not found" is valuable data.`;
}
