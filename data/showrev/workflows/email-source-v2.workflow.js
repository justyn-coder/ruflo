/**
 * Email-source workflow v2 — operator-improved (PDF, time budgets, fallbacks, accidentally-public)
 *
 * Per docs/specs/email-source-workflow-v2-design.md.
 *
 * Decomposes v1's 5 agents into 12 sub-agents for smaller blast radius.
 * Time budgets baked in, fallback matrices per source kind, PDF reading enabled.
 *
 * Run via Workflow tool:
 *   Workflow({scriptPath: "data/showrev/workflows/email-source-v2.workflow.js"})
 *
 * Expected: ~30 min wall-clock, ~$30 Firecrawl, ~400-500 verified emails.
 * Operator authorization required (Firecrawl billing).
 */

export const meta = {
  name: 'email-source-v2',
  description: 'Email-source discovery v2 — 12-agent decomposed workflow targeting BEAD portals (3 regional sub-agents), ReConnect/RDOF (2 sub-agents), Top-100 press releases (3 sub-agents of 33 companies each), state+national associations (2 sub-agents), and accidentally-public conference docs (2 sub-agents). Time budgets + fallback matrices + PDF support enabled per operator critique of w5mdoejzp. Targets ~400-500 verified emails vs v1 actual 100.',
  phases: [
    { title: 'Plan' },
    { title: 'Mine' },
    { title: 'Synthesize' }
  ]
}

phase('Plan')

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    bead_west_states: { type: 'array', items: { type: 'object' } },
    bead_midwest_states: { type: 'array', items: { type: 'object' } },
    bead_east_states: { type: 'array', items: { type: 'object' } },
    reconnect_round_urls: { type: 'array', items: { type: 'string' } },
    rdof_winner_url: { type: 'string' },
    press_target_companies_a: { type: 'array', items: { type: 'string' }, description: 'Top-100 companies 1-33' },
    press_target_companies_b: { type: 'array', items: { type: 'string' }, description: 'Top-100 companies 34-66' },
    press_target_companies_c: { type: 'array', items: { type: 'string' }, description: 'Top-100 companies 67-100' },
    state_assoc_uncovered: { type: 'array', items: { type: 'object' } },
    national_assoc_technical_committees: { type: 'array', items: { type: 'object' } },
    google_pdf_queries: { type: 'array', items: { type: 'string' } },
    conference_sponsor_doc_targets: { type: 'array', items: { type: 'object' } }
  },
  required: ['bead_west_states', 'bead_midwest_states', 'bead_east_states', 'press_target_companies_a', 'press_target_companies_b', 'press_target_companies_c']
}

const plan = await agent(`Plan email-source-v2 workflow.

Read for context:
- data/showrev/p2-cold/focus-100.csv (100 priority companies)
- Prior v1 (w5mdoejzp) yielded 228 contacts / 100 emails. v2 must hit ~400-500 emails.

Per-region BEAD splits:
- WEST (15 states): CA, WA, OR, AZ, NV, UT, ID, MT, WY, CO, NM, AK, HI, OK, KS
- MIDWEST (15 states): TX, NE, MN, IA, WI, IL, IN, OH, MI, MO, ND, SD, AR, KY, TN
- EAST (15 states): NY, PA, NJ, MA, MD, VA, NC, SC, GA, FL, AL, MS, LA, WV, ME

For each state: portal URL + subgrantee listing URL + award doc pattern.

Top-100 press splits: 1-33, 34-66, 67-100 from focus-100.csv (in order).

State associations not covered in v1: identify 15+ BEAD-active state telecom/broadband associations beyond TX, IA, MN-partial, PA, FL.

National association technical committees: FBA, NTCA, WTA, USTelecom, INCOMPAS technical-committee rosters (often have committee-member emails not on public board pages).

Google PDF queries: 20+ variants of \`site:[conf].org filetype:pdf attendee 2024 OR 2025\`, sponsor packets, post-event reports.

Conference sponsor doc targets: FC2026, BBC, Mountain Connect, NTCA RTIME, INCOMPAS Show, WTA Spring/Fall.

Output per schema.`,
  { phase: 'Plan', label: 'planning', schema: PLAN_SCHEMA })

log(`Plan complete. BEAD: ${plan.bead_west_states.length + plan.bead_midwest_states.length + plan.bead_east_states.length} states across 3 regions. Press: ${plan.press_target_companies_a.length + plan.press_target_companies_b.length + plan.press_target_companies_c.length} companies across 3 sub-agents.`)

phase('Mine')

const HARVEST_SCHEMA = {
  type: 'object',
  properties: {
    agent_name: { type: 'string' },
    sources_attempted: { type: 'number' },
    sources_succeeded: { type: 'number' },
    contacts_found: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, source_url: { type: 'string' }, source_kind: { type: 'string' }, source_doc_date: { type: 'string' } } } }
  },
  required: ['agent_name', 'contacts_found']
}

const STANDARD_FALLBACKS = `YOUR FALLBACK MATRIX:
- 403/blocked → fetch web.archive.org/web/2026*/[url]
- JS-rendered → switch from firecrawl-scrape to firecrawl-instruct
- PDF → firecrawl-scrape format='markdown' (PDFs DO work, don't skip them)
- Members-only → Google site: search for accidentally-public copies
- 404 → continue, never halt the agent

YOUR DECOMPOSITION:
- Process every entry in your prompt, not just the first 20
- If entry >5 min: log "slow, skipped", move on
- Execute, do NOT plan-then-execute`

const results = await parallel([
  // Agent A1 — West BEAD
  () => agent(`AGENT A1 — BEAD West states\n\nTIME BUDGET: 25 minutes.\n\nSTATES: ${JSON.stringify(plan.bead_west_states)}\n\n${STANDARD_FALLBACKS}\n\nFor each portal: scrape subgrantee listings + signed award PDFs. Extract named contacts + emails + phones from signature blocks.`,
    { phase: 'Mine', label: 'A1-bead-west', schema: HARVEST_SCHEMA }),
  // Agent A2 — Midwest BEAD
  () => agent(`AGENT A2 — BEAD Midwest states\n\nTIME BUDGET: 25 minutes.\n\nSTATES: ${JSON.stringify(plan.bead_midwest_states)}\n\n${STANDARD_FALLBACKS}\n\nSame extraction rules as A1.`,
    { phase: 'Mine', label: 'A2-bead-midwest', schema: HARVEST_SCHEMA }),
  // Agent A3 — East BEAD
  () => agent(`AGENT A3 — BEAD East states\n\nTIME BUDGET: 25 minutes.\n\nSTATES: ${JSON.stringify(plan.bead_east_states)}\n\n${STANDARD_FALLBACKS}\n\nSame extraction rules as A1.`,
    { phase: 'Mine', label: 'A3-bead-east', schema: HARVEST_SCHEMA }),
  // Agent B1 — USDA ReConnect
  () => agent(`AGENT B1 — USDA ReConnect awardee mining\n\nTIME BUDGET: 25 minutes.\n\nROUND URLs: ${JSON.stringify(plan.reconnect_round_urls)}\n\n${STANDARD_FALLBACKS}\n\nFor each round: scrape awardee press releases. Then for each awardee in our prospect cohort: chase the project detail page. Extract project manager + comms contact emails.`,
    { phase: 'Mine', label: 'B1-reconnect', schema: HARVEST_SCHEMA }),
  // Agent B2 — FCC RDOF
  () => agent(`AGENT B2 — FCC RDOF winners cross-match\n\nTIME BUDGET: 20 minutes.\n\nRDOF WINNER URL: ${plan.rdof_winner_url || 'https://www.fcc.gov/auction/904 (RDOF Phase I results)'}\n\n${STANDARD_FALLBACKS}\n\nDownload the bid winner CSV (or scrape the HTML version). Cross-match to focus-100 + FC2026 attendee companies. For each match: look up named officers via SEC filings or company website /about pages.`,
    { phase: 'Mine', label: 'B2-rdof', schema: HARVEST_SCHEMA }),
  // Agents C1/C2/C3 — Press releases (3 splits)
  () => agent(`AGENT C1 — Top-100 press releases (companies 1-33)\n\nTIME BUDGET: 25 minutes.\n\nCOMPANIES: ${JSON.stringify(plan.press_target_companies_a)}\n\n${STANDARD_FALLBACKS}\n\nFor each company: firecrawl-map their domain → /press, /newsroom, /news, /media. Scrape index page → 2-3 most recent releases. Extract Media Contact email + named executives quoted.`,
    { phase: 'Mine', label: 'C1-press-1-33', schema: HARVEST_SCHEMA }),
  () => agent(`AGENT C2 — Top-100 press releases (companies 34-66)\n\nTIME BUDGET: 25 minutes.\n\nCOMPANIES: ${JSON.stringify(plan.press_target_companies_b)}\n\n${STANDARD_FALLBACKS}\n\nSame extraction as C1.`,
    { phase: 'Mine', label: 'C2-press-34-66', schema: HARVEST_SCHEMA }),
  () => agent(`AGENT C3 — Top-100 press releases (companies 67-100)\n\nTIME BUDGET: 25 minutes.\n\nCOMPANIES: ${JSON.stringify(plan.press_target_companies_c)}\n\n${STANDARD_FALLBACKS}\n\nSame extraction as C1.`,
    { phase: 'Mine', label: 'C3-press-67-100', schema: HARVEST_SCHEMA }),
  // Agents D1/D2 — Associations
  () => agent(`AGENT D1 — Uncovered state telecom/broadband associations\n\nTIME BUDGET: 25 minutes.\n\nASSOCIATIONS: ${JSON.stringify(plan.state_assoc_uncovered)}\n\n${STANDARD_FALLBACKS}\n\nFor each: scrape /board, /staff, /members, /events. Extract emails from board + executive staff pages.`,
    { phase: 'Mine', label: 'D1-state-assoc', schema: HARVEST_SCHEMA }),
  () => agent(`AGENT D2 — National association technical-committee rosters\n\nTIME BUDGET: 20 minutes.\n\nASSOCIATIONS: ${JSON.stringify(plan.national_assoc_technical_committees)}\n\n${STANDARD_FALLBACKS}\n\nFocus specifically on TECHNICAL COMMITTEE rosters — these often have committee-member emails NOT on public board pages.`,
    { phase: 'Mine', label: 'D2-nat-tech-committees', schema: HARVEST_SCHEMA }),
  // Agents E1/E2 — Accidentally-public PDFs
  () => agent(`AGENT E1 — Google PDF accidentally-public sweep\n\nTIME BUDGET: 25 minutes.\n\nQUERIES: ${JSON.stringify(plan.google_pdf_queries)}\n\n${STANDARD_FALLBACKS}\n\nWebSearch each query. For PDF results: firecrawl-scrape (PDFs work natively). Extract any contact email patterns. Operator-specific ask: badges, post-event reports, sponsor packets accidentally left on conf CDNs.`,
    { phase: 'Mine', label: 'E1-google-pdf', schema: HARVEST_SCHEMA }),
  () => agent(`AGENT E2 — Conference sponsor decks + post-event reports\n\nTIME BUDGET: 25 minutes.\n\nTARGETS: ${JSON.stringify(plan.conference_sponsor_doc_targets)}\n\n${STANDARD_FALLBACKS}\n\nFor each conference: search for sponsor commitment PDFs, post-event impact reports, attendee badge images. Extract named POCs.`,
    { phase: 'Mine', label: 'E2-conf-sponsor', schema: HARVEST_SCHEMA }),
])

log(`Mine phase complete. ${results.length} agents returned.`)
const totalContacts = results.reduce((s, r) => s + (r?.contacts_found?.length || 0), 0)
const withEmail = results.reduce((s, r) => s + (r?.contacts_found?.filter(c => c.email).length || 0), 0)
log(`Total: ${totalContacts} contacts, ${withEmail} verified emails`)

phase('Synthesize')

const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    per_agent_summary: { type: 'array', items: { type: 'object' } },
    total_unique_contacts: { type: 'number' },
    total_with_email: { type: 'number' },
    deduped_contacts_to_load: { type: 'array', items: { type: 'object' } },
    apollo_replacement_uplift: { type: 'string' },
    next_steps: { type: 'array', items: { type: 'string' } }
  },
  required: ['total_unique_contacts', 'total_with_email', 'deduped_contacts_to_load']
}

const synthesis = await agent(`Synthesize email-source-v2 results.

Raw per-agent: ${JSON.stringify(results.map((r, i) => ({ agent_idx: i, ...r })), null, 2)}

DELIVERABLES:
1. Honest counts from arrays (NOT inflated like prior synthesis)
2. Dedup by (lower(name), lower(company))
3. Mark source_kind: PDFs/grant-docs → web_research_dated (USE_DIRECTLY); plain web → web_research (USE_TO_SHAPE)
4. Return deduped_contacts_to_load array for the SQL loader
5. Honest "Apollo replacement uplift" estimate
6. Ranked next steps

Hard cap 800 words.`,
  { phase: 'Synthesize', label: 'synthesis', schema: SYNTH_SCHEMA })

return { plan, results, synthesis }
