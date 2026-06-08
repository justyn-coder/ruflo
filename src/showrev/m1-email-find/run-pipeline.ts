#!/usr/bin/env npx tsx

/**
 * run-pipeline.ts — CLI orchestrator for the ShowRev premium pipeline.
 *
 * Takes a prospect CSV and runs every module in sequence:
 *   CSV parse -> email find -> 3-persona research -> substrate search ->
 *   pattern selection -> email composition -> judge gate -> microsite ->
 *   Supabase write -> summary report.
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/run-pipeline.ts --input prospects.csv
 *   npx tsx src/showrev/m1-email-find/run-pipeline.ts --input prospects.csv --limit 5
 *   npx tsx src/showrev/m1-email-find/run-pipeline.ts --input prospects.csv --dry-run
 *   npx tsx src/showrev/m1-email-find/run-pipeline.ts --input prospects.csv --skip-existing --skip-research
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load .env from pipeline directory (where API keys live), then CWD as fallback
const pipelineDir = dirname(new URL(import.meta.url).pathname);
dotenvConfig({ path: resolve(pipelineDir, '.env') });
dotenvConfig(); // CWD fallback (won't override already-set vars)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineConfig {
  input: string;
  limit?: number;
  dryRun: boolean;
  skipExisting: boolean;
  skipResearch: boolean;
  skipComposition: boolean;
  crossModelJudge: boolean;
  optimizePrompts: boolean;
  touches: number[];
  verbose: boolean;
  model: string;
  composer: 'full' | 'lean' | 'auto';
  leadType: string;
}

interface ProspectRow {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state?: string;
  email?: string;
  companyUrl?: string;
  aeNotes?: string;
}

interface PhaseTiming {
  phase: string;
  durationMs: number;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  detail?: string;
}

interface SemanticVerification {
  totalClaims: number;
  verified: number;
  flagged: number;
  overallConfidence: 'high' | 'medium' | 'low';
  blockers: string[];
}

interface FactVerification {
  totalClaims: number;
  verified: number;
  unverified: number;
  summary: string;
  unsafeForEmail: string[];
}

interface PipelineResult {
  prospect: ProspectRow;
  icpResult: { verdict: string; icpType: string; reason: string; confidence: number; method: string } | null;
  emailFound: string | null;
  emailConfidence: string;
  domainMismatch: string | null;
  researchSummary: string;
  semanticVerification: SemanticVerification | null;
  factVerification: FactVerification | null;
  structuredIntel: { dossier: any; warnings: string[] } | null;
  brainIngest: { added: number; updated: number; total: number } | null;
  brainContext: { entriesFound: number } | null;
  judgeScores: Record<string, number>;
  judgePass: boolean;
  crossModelJudge: { consensus: string; divergence: string[] } | null;
  confidenceScore: number | null;
  confidenceColor: string | null;
  mvQuality: string | null;
  emailCorrected: boolean;
  originalEmail: string | null;
  emailSubjects: { t1: string; t2: string; t3: string };
  emailBodies: { t1: string; t2: string; t3: string };
  emailPs: { t1: string; t2: string; t3: string };
  persona: string;
  micrositeSlug: string;
  prospectUpserted: boolean;
  micrositeUpserted: boolean;
  aeSender: string;
  aeFlag: string | null;
  duration: number;
  errors: string[];
  warnings: string[];
  phaseTimings: PhaseTiming[];
}

import { resolveAE, getAEDetails } from './ae-config.js';

// ---------------------------------------------------------------------------
// CSV parser (no external deps)
// ---------------------------------------------------------------------------

function parseCSV(content: string): ProspectRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Map header names to our fields (flexible matching)
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (/first.?name/i.test(h)) colMap['firstName'] = i;
    else if (/last.?name/i.test(h)) colMap['lastName'] = i;
    else if (h === 'company' || h === 'company_name') colMap['company'] = i;
    else if (h === 'title' || h === 'job_title') colMap['title'] = i;
    else if (h === 'state') colMap['state'] = i;
    else if (h === 'email') colMap['email'] = i;
    else if (/company.?url|website/i.test(h)) colMap['companyUrl'] = i;
    else if (/ae.?notes|booth.?notes/i.test(h)) colMap['aeNotes'] = i;
  });

  if (colMap['firstName'] === undefined || colMap['lastName'] === undefined || colMap['company'] === undefined) {
    throw new Error(
      `CSV must have first_name, last_name, company columns. Found headers: ${headers.join(', ')}`
    );
  }

  const rows: ProspectRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Basic CSV field splitting (handles quoted fields with commas)
    const fields = splitCSVLine(line);

    const row: ProspectRow = {
      firstName: (fields[colMap['firstName']] || '').trim(),
      lastName: (fields[colMap['lastName']] || '').trim(),
      company: (fields[colMap['company']] || '').trim(),
      title: (fields[colMap['title'] ?? -1] || '').trim(),
      state: (fields[colMap['state'] ?? -1] || '').trim() || undefined,
      email: (fields[colMap['email'] ?? -1] || '').trim() || undefined,
      companyUrl: (fields[colMap['companyUrl'] ?? -1] || '').trim() || undefined,
      aeNotes: (fields[colMap['aeNotes'] ?? -1] || '').trim() || undefined,
    };

    if (row.firstName && row.lastName && row.company) {
      rows.push(row);
    }
  }

  return rows;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---------------------------------------------------------------------------
// Run ID
// ---------------------------------------------------------------------------

function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// Microsite slug
// ---------------------------------------------------------------------------

function toSlug(company: string, firstName?: string, lastName?: string): string {
  const base = firstName && lastName
    ? `${company}-${firstName}-${lastName}`
    : company;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Phase runners — each phase wraps in try/catch so failures don't crash pipeline
// ---------------------------------------------------------------------------

async function phaseEmailFind(
  row: ProspectRow,
  verbose: boolean,
): Promise<{ email: string | null; confidence: string; domainMismatch: string | null; csvDomainMismatch: boolean; mvQuality: string | null }> {
  const isPlaceholder = !row.email || row.email.startsWith('pending@');

  // Verify CSV-provided emails with MillionVerifier before trusting them.
  // CSV domain is a data point, not truth — MV catches bad domains and typos
  // before we burn research credits on a dead address.
  if (!isPlaceholder && row.email) {
    const mvKey = process.env.MILLIONVERIFIER_API_KEY;
    if (mvKey) {
      try {
        const { verifyEmailMV } = await import('./email-finder/million-verifier.js');
        const vr = await verifyEmailMV(row.email, { apiKey: mvKey });
        if (vr.quality === 'good' || vr.quality === 'catch_all') {
          return { email: row.email, confidence: 'provided-verified', domainMismatch: null, csvDomainMismatch: false, mvQuality: vr.quality };
        }
        if (verbose) console.log(`    MV rejected provided email ${row.email}: ${vr.quality}/${vr.result} — falling through to discovery`);
      } catch (err: any) {
        if (verbose) console.log(`    MV check failed: ${err.message?.slice(0, 60)} — accepting provided email`);
        return { email: row.email, confidence: 'provided', domainMismatch: null, csvDomainMismatch: false, mvQuality: null };
      }
    } else {
      return { email: row.email, confidence: 'provided', domainMismatch: null, csvDomainMismatch: false, mvQuality: null };
    }
  }

  try {
    const { findEmail } = await import('./email-finder/orchestrator.js');

    // Load domain hints
    const HINTS_PATH = new URL(
      '../../../data/showrev/premium/domain-hints.json',
      import.meta.url,
    ).pathname;
    let domainHints: Record<string, string> = {};
    if (existsSync(HINTS_PATH)) {
      domainHints = JSON.parse(readFileSync(HINTS_PATH, 'utf-8'));
    }

    // Social media domains to always exclude from search results
    const SOCIAL_DOMAINS = [
      'x.com', 'twitter.com', 'linkedin.com', 'facebook.com',
      'instagram.com', 'youtube.com', 'reddit.com', 'tiktok.com',
      'wikipedia.org', 'pinterest.com',
    ];

    // DuckDuckGo HTML search with social-media filtering
    const realSearchFn = async (query: string): Promise<string[]> => {
      try {
        const encoded = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return [];
        const html = await res.text();
        const urls: string[] = [];
        const urlRegex = /uddg=([^&"]+)/g;
        let match;
        while ((match = urlRegex.exec(html)) !== null) {
          try {
            const decoded = decodeURIComponent(match[1]);
            if (decoded.startsWith('http')) {
              // Filter out social media and DuckDuckGo self-links
              const domain = new URL(decoded).hostname.replace(/^www\./, '');
              const isSocial = SOCIAL_DOMAINS.some(
                (sd) => domain === sd || domain.endsWith('.' + sd),
              );
              if (!isSocial && !domain.includes('duckduckgo')) {
                urls.push(decoded);
              }
            }
          } catch {}
        }
        return urls.slice(0, 10);
      } catch {
        return [];
      }
    };

    // Real web page fetch
    const realFetchFn = async (url: string): Promise<string> => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShowRev/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return '';
        const contentType = res.headers.get('content-type') || '';
        // Accept HTML, plain text, AND JSON (Clearbit API returns application/json)
        if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) return '';
        const text = await res.text();
        // Limit to 50KB to avoid memory issues on large pages
        return text.slice(0, 50000);
      } catch {
        return '';
      }
    };

    // Apollo People Match fallback — called when self-hosted returns RED/NOT-FOUND
    const apolloApiKey = process.env.APOLLO_API_KEY;
    let apolloPeopleMatchFn: ((fn: string, ln: string, co: string, d?: string) => Promise<any>) | undefined;
    if (apolloApiKey) {
      const { apolloPeopleMatch } = await import('./email-finder/apollo-fallback.js');
      apolloPeopleMatchFn = (fn: string, ln: string, co: string, d?: string) =>
        apolloPeopleMatch(fn, ln, co, d, { apiKey: apolloApiKey });
    }

    // MillionVerifier — final verification on Apollo results
    const mvApiKey = process.env.MILLIONVERIFIER_API_KEY;
    let millionVerifierFn: ((email: string) => Promise<{ quality: string; result: string }>) | undefined;
    if (mvApiKey) {
      const { verifyEmailMV } = await import('./email-finder/million-verifier.js');
      millionVerifierFn = async (email: string) => {
        const r = await verifyEmailMV(email, { apiKey: mvApiKey });
        return { quality: r.quality, result: r.result };
      };
    }

    const result = await findEmail(
      {
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
        title: row.title,
        companyUrl: row.companyUrl,
        state: row.state,
      },
      {
        searchFn: realSearchFn,
        fetchFn: realFetchFn,
        smtpVerify: true,
        apolloPrimary: true,
        domainHints,
        apolloPeopleMatchFn,
        millionVerifierFn,
      },
    );
    // Domain mismatch detection: compare discovered domain against CSV/companyUrl
    let domainMismatch: string | null = null;
    let csvDomainMismatch = false;
    if (result.email) {
      const discoveredDomain = result.email.split('@')[1]?.toLowerCase();
      if (discoveredDomain) {
        const csvDomain = row.email?.includes('@')
          ? row.email.split('@')[1]?.toLowerCase()
          : null;
        const companyDomain = row.companyUrl
          ? (() => { try { return new URL(row.companyUrl.startsWith('http') ? row.companyUrl : `https://${row.companyUrl}`).hostname.replace(/^www\./, ''); } catch { return null; } })()
          : null;

        const mismatches: string[] = [];
        if (csvDomain && csvDomain !== discoveredDomain && !csvDomain.startsWith('pending')) {
          mismatches.push(`csv=${csvDomain}`);
          csvDomainMismatch = true;
        }
        // companyUrl mismatch is informational only — many companies use different
        // domains for website vs email (e.g. acme-corp.com vs acme.com)
        if (companyDomain && companyDomain !== discoveredDomain)
          mismatches.push(`companyUrl=${companyDomain} (info-only)`);

        if (mismatches.length > 0) {
          domainMismatch = `discovered=${discoveredDomain} vs ${mismatches.join(', ')}`;
          if (verbose) console.log(`    DOMAIN MISMATCH: ${domainMismatch}`);
        }
      }
    }
    return { email: result.email, confidence: result.confidence, domainMismatch, csvDomainMismatch, mvQuality: null };
  } catch (err: any) {
    if (verbose) console.log(`    email-find error: ${err.message?.slice(0, 80)}`);
    return { email: null, confidence: 'error', domainMismatch: null, csvDomainMismatch: false, mvQuality: null };
  }
}

async function phaseResearch(
  row: ProspectRow,
  model: string,
  verbose: boolean,
): Promise<{ analyst: string; aeProxy: string; techEval: string }> {
  const { RESEARCH_PERSONAS, buildMultiPersonaPrompt } = await import('./personas.js');
  const { callLLM, setBrainCacheContent } = await import('./llm-client.js');

  const prospectContext = `Company: ${row.company}
Contact: ${row.firstName} ${row.lastName}
Title: ${row.title}
State: ${row.state || 'Unknown'}
Email: ${row.email || 'Unknown'}`;

  const results: Record<string, string> = {};

  // Run 3 personas in parallel
  const promises = RESEARCH_PERSONAS.map(async (persona) => {
    const prompt = buildMultiPersonaPrompt(prospectContext, persona, '', undefined);
    if (verbose) console.log(`    ${persona.role} researching...`);
    const result = await callLLM(prompt, {
      model: model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      label: persona.role,
    });
    results[persona.role] = result;
    if (verbose) console.log(`    ${persona.role} complete`);
  });

  await Promise.all(promises);

  return {
    analyst: results['Industry Analyst'] || '',
    aeProxy: results['AE Proxy'] || '',
    techEval: results['Technical Evaluator'] || '',
  };
}

async function phaseSubstrateSearch(
  row: ProspectRow,
  verbose: boolean,
): Promise<string> {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!sbKey) return '';

    const semanticQuery = [
      row.company,
      row.title,
      row.state ? `${row.state} fiber broadband` : 'fiber construction',
    ].filter(Boolean).join('. ');

    const res = await fetch(`${sbUrl}/functions/v1/search-substrate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: semanticQuery, limit: 8 }),
    });

    if (!res.ok) return '';

    const data: any = await res.json();
    const rows = data.results || [];
    if (rows.length === 0) return '';

    const context = rows
      .map((r: any) => `**${r.title}** (${r.source}, relevance: ${(r.similarity * 100).toFixed(0)}%):\n${r.content.slice(0, 600)}`)
      .join('\n\n');

    if (verbose) console.log(`    Substrate: ${rows.length} semantic matches`);
    return context;
  } catch (err: any) {
    if (verbose) console.log(`    Substrate skip: ${err.message?.slice(0, 40)}`);
    return '';
  }
}

function extractKeyFacts(structuredIntel?: any): string {
  if (!structuredIntel?.dossier) return '';
  const d = structuredIntel.dossier;
  const facts: string[] = [];

  const company = d.company || {};
  const contact = d.contact || {};
  const sales = d.salesIntel || {};

  if (company.showrev_bead_status && company.showrev_bead_status !== '[insufficient data]')
    facts.push(`BEAD status: ${company.showrev_bead_status}`);
  if (company.showrev_key_projects && company.showrev_key_projects !== '[insufficient data]')
    facts.push(`Key projects: ${company.showrev_key_projects}`);
  if (company.showrev_growth_signals && company.showrev_growth_signals !== '[insufficient data]')
    facts.push(`Growth signals: ${company.showrev_growth_signals}`);
  if (company.showrev_company_summary && company.showrev_company_summary !== '[insufficient data]')
    facts.push(`Company: ${company.showrev_company_summary}`);
  if (company.showrev_company_size && company.showrev_company_size !== '[insufficient data]')
    facts.push(`Size: ${company.showrev_company_size}`);
  if (company.showrev_fiber_activities && company.showrev_fiber_activities !== '[insufficient data]')
    facts.push(`Fiber activities: ${company.showrev_fiber_activities}`);
  if (company.showrev_external_deadlines && company.showrev_external_deadlines !== '[insufficient data]')
    facts.push(`Deadlines: ${company.showrev_external_deadlines}`);
  if (company.showrev_recent_news && company.showrev_recent_news !== '[insufficient data]')
    facts.push(`Recent news: ${company.showrev_recent_news}`);
  if (sales.showrev_challenger_insight && sales.showrev_challenger_insight !== '[insufficient data]')
    facts.push(`Challenger insight: ${sales.showrev_challenger_insight}`);
  if (contact.showrev_research_summary && contact.showrev_research_summary !== '[insufficient data]')
    facts.push(`Contact: ${contact.showrev_research_summary}`);
  if (company.showrev_competitive_landscape && company.showrev_competitive_landscape !== '[insufficient data]')
    facts.push(`Competitive landscape: ${company.showrev_competitive_landscape}`);
  if (company.showrev_automation_level && company.showrev_automation_level !== 'unknown' && company.showrev_automation_level !== '[insufficient data]')
    facts.push(`Automation level: ${company.showrev_automation_level}`);
  if (sales.showrev_product_fit && sales.showrev_product_fit !== 'unknown' && sales.showrev_product_fit !== '[insufficient data]')
    facts.push(`Product fit: ${sales.showrev_product_fit}`);

  return facts.join('\n');
}

async function phasePatternSelection(
  row: ProspectRow,
  researchSummary: string,
  model: string,
  verbose: boolean,
  touches: number[] = [1, 2, 3],
  icpType?: string,
): Promise<Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }>> {
  const { buildPatternSelectorPrompt } = await import('./influence.js');
  const { callLLM } = await import('./llm-client.js');

  const enrichedSummary = `Company: ${row.company}. Title: ${row.title}.\n\nResearch findings:\n${researchSummary}`;

  const selections: Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }> = [];

  for (const touchNum of (touches as Array<1 | 2 | 3>)) {
    const previousPatterns = selections.map(s => s.pattern) as any[];
    const prompt = buildPatternSelectorPrompt(enrichedSummary, row.aeNotes || '', row.title, touchNum, previousPatterns, icpType);
    if (verbose) console.log(`    T${touchNum} pattern selection...`);

    let parsed: any = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const result = await callLLM(prompt, {
          model: model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
          label: `T${touchNum}-pattern${attempt > 0 ? '-retry' : ''}`,
        });
        const jsonMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || result.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else if (verbose && attempt === 0) {
          console.log(`    T${touchNum} pattern: no JSON in response, retrying...`);
        }
      } catch {}
    }

    if (parsed) {
      selections.push({
        pattern: parsed.pattern || 'challenger_insight',
        challengerInsight: parsed.challengerInsight || '',
        emotionalFrame: parsed.emotionalFrame || 'curiosity',
        rationale: parsed.rationale || '',
        ctaType: parsed.ctaType || 'interest_based',
        psStrategy: parsed.psStrategy || '',
      });
      if (verbose) console.log(`    T${touchNum} -> ${parsed.pattern}`);
    } else {
      selections.push({
        pattern: touchNum === 1 ? 'challenger_insight' : touchNum === 2 ? 'curiosity_gap' : 'challenger_insight',
        challengerInsight: '',
        emotionalFrame: 'curiosity',
        rationale: 'Fallback — pattern selection failed after retry',
        ctaType: touchNum === 1 ? 'interest_based' : touchNum === 2 ? 'soft_time' : 'binary_close',
        psStrategy: 'Microsite link',
      });
      if (verbose) console.log(`    T${touchNum} -> FALLBACK (challenger_insight)`);
    }
  }

  return selections;
}

interface ComposedEmail {
  touchNumber: number;
  subject: string;
  body: string;
  ps: string;
  wordCount: number;
  pattern: string;
}

async function phaseComposition(
  row: ProspectRow,
  researchSummary: string,
  patterns: Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }>,
  ae: { name: string; email: string },
  micrositeSlug: string,
  composerMode: 'full' | 'lean' | 'auto',
  model: string,
  verbose: boolean,
  structuredIntel?: any,
  icpType?: string,
): Promise<ComposedEmail[]> {
  const { composeLean } = await import('./lean-composer.js');
  const { buildComposerPrompt } = await import('./influence.js');
  const { callLLM } = await import('./llm-client.js');

  // Decide lean vs full based on signal hints from research
  const researchLower = researchSummary.toLowerCase();
  const useLean =
    composerMode === 'lean' ||
    (composerMode === 'auto' &&
      (researchLower.match(/weak.*signal|low.*confidence|insufficient|poor.*fit/g) || []).length >
        (researchLower.match(/strong.*signal|high.*confidence/g) || []).length);

  const emails: ComposedEmail[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const touchNum = (i + 1) as 1 | 2 | 3;
    const pattern = patterns[i];
    if (!pattern) continue;

    if (useLean) {
      if (verbose) console.log(`    T${touchNum} lean composing (${pattern.pattern})...`);
      try {
        const lean = composeLean(
          {
            prospect: { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
            companySummary: researchSummary.slice(0, 1500),
            challengerInsight: pattern.challengerInsight || '',
            talkingPoints: pattern.rationale || '',
            fitRationale: pattern.emotionalFrame || '',
            boothNotes: row.aeNotes || '',
            ae,
            touchNumber: touchNum,
            previousSubject: i > 0 ? emails[i - 1]?.subject : undefined,
            micrositeSlug,
          },
          model === 'opus' ? 'opus' : 'sonnet',
        );
        emails.push({
          touchNumber: touchNum,
          subject: lean.subject,
          body: lean.body,
          ps: lean.ps,
          wordCount: lean.wordCount,
          pattern: pattern.pattern,
        });
        if (verbose) console.log(`    T${touchNum} composed (${lean.wordCount} words)`);
      } catch (err: any) {
        if (verbose) console.log(`    T${touchNum} lean error: ${err.message?.slice(0, 60)}`);
        emails.push({ touchNumber: touchNum, subject: '[Error]', body: '[Composition error]', ps: '', wordCount: 0, pattern: pattern.pattern });
      }
      continue;
    }

    // Full composition via LLM
    if (verbose) console.log(`    T${touchNum} full composing (${pattern.pattern})...`);
    try {
      const keyFacts = extractKeyFacts(structuredIntel);
      const prompt = buildComposerPrompt(
        pattern as any,
        researchSummary,
        { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
        row.aeNotes || '',
        touchNum,
        i > 0 ? emails[i - 1]?.subject : undefined,
        ae.name,
        ae.email,
        micrositeSlug,
        keyFacts,
        icpType,
      );

      const result = await callLLM(prompt, {
        model: model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
        label: `T${touchNum}-compose`,
      });

      const jsonMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || result.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        let cleanBody = (parsed.body || '')
          .replace(/(\d)[–—](\d)/g, '$1-$2')
          .replace(/[—–]/g, ',')
          .replace(/\s+,/g, ',');
        cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
        cleanBody = cleanBody.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();

        const cleanSubject = (parsed.subject || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');
        let cleanPs = (parsed.ps || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',');

        if (touchNum <= 2 && micrositeSlug && !cleanPs.includes('fiber.inorsa.com')) {
          cleanPs = cleanPs
            ? `${cleanPs}\nhttps://fiber.inorsa.com/brief/${micrositeSlug}`
            : `P.S. Put together an overview: https://fiber.inorsa.com/brief/${micrositeSlug}`;
        }

        emails.push({
          touchNumber: touchNum,
          subject: cleanSubject,
          body: cleanBody,
          ps: cleanPs,
          wordCount: cleanBody.split(/\s+/).length,
          pattern: pattern.pattern,
        });
        if (verbose) console.log(`    T${touchNum} composed (${cleanBody.split(/\s+/).length} words)`);
      } else {
        throw new Error('No JSON found in composer output');
      }
    } catch (err: any) {
      if (verbose) console.log(`    T${touchNum} compose error: ${err.message?.slice(0, 60)}`);
      emails.push({ touchNumber: touchNum, subject: '[Error]', body: '[Composition error]', ps: '', wordCount: 0, pattern: pattern.pattern });
    }
  }

  return emails;
}

async function phaseJudge(
  emails: ComposedEmail[],
  row: ProspectRow,
  ae: { name: string; email: string },
  micrositeSlug: string,
  verbose: boolean,
  model: string = 'sonnet',
  researchSummary: string = '',
  icpType?: string,
): Promise<{ scores: Record<string, number>; pass: boolean; failures: string[]; warnings: string[] }> {
  // Phase 1: Mechanical checks (no LLM needed)
  const { runMechanicalChecks, judgeEmail: judgeDimensions } = await import('./judge.js');
  // 5-dimension LLM scorer: research_depth, vp_connection, tone, conciseness, jtbd_alignment

  const allFailures: string[] = [];
  const allWarnings: string[] = [];

  for (const email of emails) {
    const mechanical = runMechanicalChecks(
      email.body, email.subject, email.ps,
      ae.name, ae.email,
      row.firstName, micrositeSlug, icpType, email.touchNumber,
    );

    if (verbose) {
      if (!mechanical.passed) {
        console.log(`    T${email.touchNumber} mechanical failures: ${mechanical.failures.join(', ')}`);
      }
      for (const w of mechanical.warnings) {
        console.log(`    T${email.touchNumber} warning: ${w}`);
      }
    }

    if (!mechanical.passed) {
      allFailures.push(...mechanical.failures.map(f => `T${email.touchNumber}: ${f}`));
    }
    allWarnings.push(...mechanical.warnings.map(w => `T${email.touchNumber}: ${w}`));
  }

  // If mechanical checks fail, don't spend LLM budget on 5-dim scoring
  if (allFailures.length > 0) {
    const t1 = emails.find(e => e.touchNumber === 1);
    return {
      scores: {
        wordCount: (t1?.wordCount ?? 999) <= 100 ? 8 : 4,
        mechanicalPass: 3,
      },
      pass: false,
      failures: allFailures,
      warnings: allWarnings,
    };
  }

  // Phase 2: 5-dimension LLM scoring (research_depth, vp_connection, tone, conciseness, jtbd_alignment)
  const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Build a minimal Dossier compatible with judgeEmail
  const minimalDossier = {
    prospectId,
    prospect: {
      id: prospectId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email || '',
      emailCorrected: false,
      phone: '',
      title: row.title,
      city: '',
      company: row.company,
      state: row.state || '',
      grade: 'Ungraded' as const,
      tier: 'A' as const,
      icpStatus: 'pass' as const,
      icpReason: '',
      aeNotes: row.aeNotes || '',
      hasAeNotes: !!(row.aeNotes && row.aeNotes.trim().length > 0),
      leadType: '',
      isDuplicate: false,
    },
    company: {
      name: row.company,
      description: '',
      size: '',
      services: [] as string[],
      geography: row.state || '',
      recentNews: [] as string[],
      fiberActivities: [] as string[],
      beadStatus: '',
      competitors: [] as string[],
      keySignals: [] as string[],
    },
    contact: {
      name: `${row.firstName} ${row.lastName}`,
      title: row.title,
      role: '',
      responsibilities: [] as string[],
      linkedinSummary: '',
      publicActivity: [] as string[],
    },
    jtbd: {
      personaBucket: '',
      primaryJTBD: researchSummary.slice(0, 300),
      supportingEvidence: [] as string[],
      vpConnection: '',
      confidenceLevel: 'medium' as const,
      confidenceReason: '',
    },
    researchMeta: {
      hypothesesTested: 0,
      sourcesChecked: 0,
      sourcesUsed: [] as string[],
      lateralSearchAttempted: false,
      lateralFindings: '',
      timeSpentMs: 0,
      searchesExhausted: false,
    },
    revisedTier: 'A' as const,
    tierReason: '',
  };

  const aggregatedScores: Record<string, number> = {
    mechanicalPass: 9,
  };
  let worstRecommendation: 'send' | 'hold' | 'reject' = 'send';
  let anyJtbdReject = false;

  for (const email of emails) {
    // Build EmailTouch compatible with judgeEmail
    const touch = {
      touchNumber: email.touchNumber as 1 | 2 | 3,
      subject: email.subject,
      body: `${email.body}${email.ps ? `\n\n${email.ps}` : ''}`,
      sendDelay: email.touchNumber === 1 ? '0d' : email.touchNumber === 2 ? '5d' : '10d',
    };

    try {
      const verdict = await judgeDimensions(minimalDossier as any, touch, model, researchSummary, icpType);

      if (!verdict) {
        console.log(`    T${email.touchNumber} LLM judge returned null — mechanical-only fallback`);
        continue;
      }

      // Extract per-dimension scores
      const dimMap: Record<string, number> = {};
      for (const s of verdict.scores) {
        dimMap[s.dimension] = s.score;
      }

      const research = dimMap['research_depth'] ?? 0;
      const vp = dimMap['vp_connection'] ?? 0;
      const tone = dimMap['tone'] ?? 0;
      const concise = dimMap['conciseness'] ?? 0;
      const jtbd = dimMap['jtbd_alignment'] ?? 0;
      const avg = verdict.overallScore;

      // Log dimension scores
      console.log(`    T${email.touchNumber} dimension scores: research=${research}, vp=${vp}, tone=${tone}, concise=${concise}, jtbd=${jtbd} (avg: ${avg} -> ${verdict.recommendation.toUpperCase()})`);

      if (verdict.mustFix.length > 0 && verbose) {
        console.log(`    T${email.touchNumber} must fix: ${verdict.mustFix.join('; ')}`);
      }

      // Store per-touch scores
      aggregatedScores[`t${email.touchNumber}_research_depth`] = research;
      aggregatedScores[`t${email.touchNumber}_vp_connection`] = vp;
      aggregatedScores[`t${email.touchNumber}_tone`] = tone;
      aggregatedScores[`t${email.touchNumber}_conciseness`] = concise;
      aggregatedScores[`t${email.touchNumber}_jtbd_alignment`] = jtbd;
      aggregatedScores[`t${email.touchNumber}_avg`] = avg;

      // JTBD alignment <= 4 = auto-reject regardless of other scores
      if (jtbd <= 4) {
        anyJtbdReject = true;
        allFailures.push(`T${email.touchNumber}: jtbd_alignment=${jtbd} (auto-reject, threshold: >4)`);
      }

      // Track worst recommendation across all touches
      if (verdict.recommendation === 'reject') {
        worstRecommendation = 'reject';
      } else if (verdict.recommendation === 'hold' && worstRecommendation !== 'reject') {
        worstRecommendation = 'hold';
      }
    } catch (err: any) {
      console.log(`    T${email.touchNumber} LLM judge error: ${err.message?.slice(0, 80)} — mechanical-only fallback`);
    }
  }

  // Determine final pass/hold/reject
  // JTBD <= 4 = reject (hard gate)
  // Average < 7.0 on any touch = hold (flag for operator review, don't block)
  // Average >= 7.0 on all touches = pass
  const touchAvgs = emails.map(e => aggregatedScores[`t${e.touchNumber}_avg`]).filter(v => v !== undefined);
  const anyBelowThreshold = touchAvgs.some(avg => avg < 7.0);

  let finalPass: boolean;
  if (anyJtbdReject) {
    finalPass = false;
    console.log(`    5-dim verdict: REJECT (jtbd_alignment <= 4)`);
  } else if (worstRecommendation === 'reject') {
    finalPass = false;
    console.log(`    5-dim verdict: REJECT (dimension <= 4)`);
  } else if (anyBelowThreshold || worstRecommendation === 'hold') {
    // HOLD = flag for review, but don't block pipeline
    finalPass = true;
    console.log(`    5-dim verdict: HOLD (avg < 7.0 on some touches — flagged for operator review)`);
  } else {
    finalPass = true;
    console.log(`    5-dim verdict: PASS (all touches avg >= 7.0)`);
  }

  return {
    scores: aggregatedScores,
    pass: finalPass,
    failures: allFailures,
    warnings: allWarnings,
  };
}

async function phaseMicrosite(
  row: ProspectRow,
  runId: string,
  micrositeSlug: string,
  ae: { name: string; email: string },
  challengerInsight: string,
  researchSummary: string,
  personaBucket: string,
): Promise<{ headline: string; insightText: string; caseStudy: string }> {
  const { composeMicrositeContent } = await import('./microsite-composer.js');

  // Build a Prospect-like object for the microsite composer
  const prospect = {
    id: `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email || '',
    emailCorrected: false,
    phone: '',
    title: row.title,
    city: '',
    company: row.company,
    state: row.state || '',
    grade: 'Ungraded' as const,
    tier: 'A' as const,
    icpStatus: 'pass' as const,
    icpReason: '',
    aeNotes: row.aeNotes || '',
    hasAeNotes: !!(row.aeNotes && row.aeNotes.trim().length > 0),
    leadType: '',
    isDuplicate: false,
  };

  const micrositeRow = composeMicrositeContent(
    prospect, runId, micrositeSlug, ae,
    challengerInsight, researchSummary, personaBucket,
  );

  return {
    headline: micrositeRow.headline,
    insightText: micrositeRow.insight_text,
    caseStudy: micrositeRow.case_study_text,
  };
}

async function phaseSupabaseWrite(
  row: ProspectRow,
  runId: string,
  emails: ComposedEmail[],
  ae: { name: string; email: string },
  micrositeSlug: string,
  researchSummary: string,
  mechanicalCheck: { pass: boolean; failures: string[] },
  patterns: Array<{ pattern: string; challengerInsight: string }>,
  microsite: { headline: string; insightText: string },
  domainMismatch: string | null,
  emailConfidence: string,
  confidenceScore: number | null,
  confidenceColor: string | null,
  structuredIntel: { dossier: any; warnings: string[] } | null,
  aeFlag: string | null,
  dryRun: boolean,
  verbose: boolean,
): Promise<boolean> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!sbKey) {
    if (verbose) console.log('    Supabase key not set, skipping write');
    return false;
  }

  const t1 = emails.find(e => e.touchNumber === 1);
  const t2 = emails.find(e => e.touchNumber === 2);
  const t3 = emails.find(e => e.touchNumber === 3);

  const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const dossierRow: Record<string, any> = {
    prospect_id: prospectId,
    run_id: runId,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email || '',
    company: row.company,
    title: row.title,
    state: row.state || '',
    icp_status: 'pass',
    icp_reason: '',
    assigned_ae: ae.name,
    ae_email: ae.email,
    ae_flag: aeFlag,
    persona_bucket: structuredIntel?.dossier?.contact?.showrev_persona_classification || '',
    research_summary: researchSummary.slice(0, 5000),
    challenger_insight: patterns[0]?.challengerInsight || '',
    influence_pattern_t1: t1?.pattern || '',
    influence_pattern_t2: t2?.pattern || '',
    influence_pattern_t3: t3?.pattern || '',
    email_subject_t1: t1?.subject || '',
    email_body_t1: t1?.body || '',
    email_ps_t1: t1?.ps || '',
    email_subject_t2: t2?.subject || '',
    email_body_t2: t2?.body || '',
    email_ps_t2: t2?.ps || '',
    email_subject_t3: t3?.subject || '',
    email_body_t3: t3?.body || '',
    email_ps_t3: t3?.ps || '',
    microsite_slug: micrositeSlug,
    microsite_headline: microsite.headline,
    microsite_insight: microsite.insightText,
    research_model: 'premium_3persona',
    research_confidence: structuredIntel?.dossier?.meta?.showrev_research_confidence || '',
    mechanical_check_passed: mechanicalCheck.pass,
    mechanical_check_failures: mechanicalCheck.failures.join('; '),
    domain_mismatch: domainMismatch,
    email_confidence: emailConfidence || null,
    confidence_score: confidenceScore,
    confidence_color: confidenceColor,
    created_at: new Date().toISOString(),
  };

  // Map intel-structurer output to Supabase columns
  if (structuredIntel?.dossier) {
    const { contact = {}, company = {}, salesIntel = {} } = structuredIntel.dossier;
    const strip = (v: any) => (v && !String(v).startsWith('[insufficient data]')) ? String(v) : null;
    Object.assign(dossierRow, {
      intel_signal_strength: strip(salesIntel.showrev_signal_strength),
      intel_fit_rationale: strip(salesIntel.showrev_fit_rationale),
      intel_next_action: strip(salesIntel.showrev_next_best_action),
      intel_buying_timeline: strip(salesIntel.showrev_buying_timeline),
      intel_risk_factors: strip(salesIntel.showrev_risk_factors),
      intel_talking_points: strip(contact.showrev_talking_points),
      intel_decision_authority: strip(contact.showrev_decision_authority),
      company_summary: strip(company.showrev_company_summary),
      company_size: strip(company.showrev_company_size),
      fiber_activities: strip(company.showrev_fiber_activities),
      bead_status: strip(company.showrev_bead_status),
      growth_signals: strip(company.showrev_growth_signals),
      key_projects: strip(company.showrev_key_projects),
      external_deadlines: strip(company.showrev_external_deadlines),
      known_tools: strip(company.showrev_competitive_landscape),
      likely_competitors: null,
      market_moment: strip(company.showrev_recent_news),
      linkedin_summary: strip(contact.showrev_linkedin_summary),
      other_stakeholders: strip(contact.showrev_other_stakeholders),
      likely_objections: strip(contact.showrev_likely_objections),
      meddpicc_identified_pain: strip(salesIntel.showrev_fit_rationale),
      meddpicc_economic_buyer: strip(contact.showrev_decision_authority),
      meddpicc_champion: strip(salesIntel.showrev_multi_thread_contacts),
      meddpicc_decision_criteria: null,
      meddpicc_competition: strip(company.showrev_competitive_landscape),
    });
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Would write to sr_engine_output:`);
    console.log(`      ${row.firstName} ${row.lastName} @ ${row.company}`);
    console.log(`      AE: ${ae.name} | T1: ${t1?.pattern} | "${t1?.subject}"`);
    console.log(`      Mechanical: ${mechanicalCheck.pass ? 'PASS' : 'FAIL'}`);
    return true;
  }

  // Check if overwriting existing data
  try {
    const checkRes = await fetch(
      `${sbUrl}/rest/v1/sr_engine_output?prospect_id=eq.${encodeURIComponent(prospectId)}&select=prospect_id,created_at`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (existing.length > 0) {
        console.log(`    ⚠ OVERWRITING existing sr_engine_output for ${prospectId} (created ${existing[0].created_at})`);
      }
    }
  } catch {}

  try {
    const res = await fetch(`${sbUrl}/rest/v1/sr_engine_output?on_conflict=prospect_id,run_id`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(dossierRow),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`    Supabase write failed: ${res.status} ${errText.slice(0, 200)}`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.log(`    Supabase write error: ${err.message?.slice(0, 120)}`);
    return false;
  }
}

async function checkExisting(row: ProspectRow): Promise<boolean> {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!sbKey) return false;

    const email = row.email;
    const name = `${row.firstName} ${row.lastName}`;
    const filter = email
      ? `email=eq.${encodeURIComponent(email)}`
      : `first_name=eq.${encodeURIComponent(row.firstName)}&last_name=eq.${encodeURIComponent(row.lastName)}&company=eq.${encodeURIComponent(row.company)}`;

    const res = await fetch(
      `${sbUrl}/rest/v1/sr_engine_output?${filter}&select=prospect_id&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );

    if (!res.ok) return false;
    const data = (await res.json()) as any[];
    return data.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 2b: Upsert sr_prospects (Mission Control needs prospect rows)
// ---------------------------------------------------------------------------

async function phaseProspectUpsert(
  row: ProspectRow,
  ae: { name: string; email: string },
  emailFound: string | null,
  emailConfidence: string,
  dryRun: boolean,
  verbose: boolean,
  icpStatus: string = 'pending',
  icpReason: string = '',
  icpType: string = '',
  leadType: string = '',
  emailVerification?: { mvQuality?: string; corrected?: boolean; originalEmail?: string; provider?: string; persona?: string },
): Promise<boolean> {
  const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (dryRun) {
    if (verbose) console.log(`    [DRY RUN] Would upsert sr_prospects: ${prospectId}`);
    return true;
  }

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return false;

  const prospectRow: Record<string, any> = {
    id: prospectId,
    first_name: row.firstName,
    last_name: row.lastName,
    email: emailFound || row.email || '',
    company: row.company,
    title: row.title || '',
    state: row.state || '',
    tier: 'A',
    assigned_ae: ae.name,
    icp_status: icpStatus,
    icp_reason: icpReason,
    icp_type: icpType,
    send_status: 'pending',
    ae_review_status: 'pending',
    show_name: 'Fiber Connect 2026',
    company_website: row.companyUrl || '',
    ...(leadType ? { lead_type: leadType } : {}),
    ...(emailVerification?.mvQuality ? { email_verification_status: emailVerification.mvQuality } : {}),
    ...(emailVerification?.mvQuality ? { email_verified: emailVerification.mvQuality === 'good' } : {}),
    ...(emailVerification?.corrected ? { email_corrected: true, original_email: emailVerification.originalEmail || '' } : {}),
    ...(emailVerification?.persona ? { persona_bucket: emailVerification.persona, contact_persona: emailVerification.persona } : {}),
  };

  try {
    const res = await fetch(`${sbUrl}/rest/v1/sr_prospects?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(prospectRow),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`    sr_prospects upsert failed: ${res.status} ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.log(`    sr_prospects upsert error: ${err.message?.slice(0, 120)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 8b: Upsert sr_microsites (renderer reads this table)
// ---------------------------------------------------------------------------

async function phaseMicrositeUpsert(
  row: ProspectRow,
  runId: string,
  micrositeSlug: string,
  ae: { name: string; email: string },
  microsite: { headline: string; insightText: string; caseStudy: string },
  dryRun: boolean,
  verbose: boolean,
): Promise<boolean> {
  if (dryRun) {
    if (verbose) console.log(`    [DRY RUN] Would upsert sr_microsites: ${micrositeSlug}`);
    return true;
  }

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return false;

  const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const aeDetail = getAEDetails(ae.name);

  const { resolveOrVerify } = await import('./logo-resolver.js');
  const existingLogo = null; // fresh upsert — no existing URL to verify
  const logoUrl = await resolveOrVerify(existingLogo, row.companyUrl || row.company + '.com', { verbose });

  const micrositeRow: Record<string, any> = {
    slug: micrositeSlug,
    prospect_id: prospectId,
    company_name: row.company,
    company_logo_url: logoUrl,
    recipient_name: `${row.firstName} ${row.lastName}`,
    recipient_title: row.title || '',
    headline: microsite.headline,
    insight_text: microsite.insightText,
    case_study_text: microsite.caseStudy,
    ae_name: ae.name,
    ae_title: aeDetail.title,
    ae_email: ae.email,
    ae_phone: aeDetail.phone,
    ae_booking_url: aeDetail.booking_url,
    ae_photo_url: aeDetail.photo_url,
    status: (microsite.headline.includes('[Fallback') || microsite.insightText.includes('[Fallback')) ? 'draft' : 'live',
  };

  try {
    const res = await fetch(`${sbUrl}/rest/v1/sr_microsites?on_conflict=slug`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(micrositeRow),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`    sr_microsites upsert failed: ${res.status} ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.log(`    sr_microsites upsert error: ${err.message?.slice(0, 120)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 7b: Cross-Model Judge (multi-model consensus)
// ---------------------------------------------------------------------------

async function phaseCrossModelJudge(
  emails: ComposedEmail[],
  row: ProspectRow,
  researchSummary: string,
  outputDir: string,
  verbose: boolean,
): Promise<{ consensus: string; divergence: string[] } | null> {
  const availableKeys: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) availableKeys.push('claude-sonnet');
  if (process.env.GEMINI_API_KEY) availableKeys.push('gemini');
  if (process.env.OPENAI_API_KEY) availableKeys.push('gpt-5');
  if (process.env.XAI_API_KEY) availableKeys.push('grok');
  if (process.env.DEEPSEEK_API_KEY) availableKeys.push('deepseek');

  if (availableKeys.length < 2) {
    if (verbose) console.log(`    Cross-model judge skipped (need ≥2 API keys, have ${availableKeys.length})`);
    return null;
  }

  const t1 = emails.find(e => e.touchNumber === 1);
  if (!t1 || !t1.body || t1.body === '[Composition error]') return null;

  try {
    const { crossModelJudge } = await import('./cross-model-judge.js');
    const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const report = await crossModelJudge(
      t1.subject, t1.body, t1.ps,
      prospectId,
      `${row.firstName} ${row.lastName}`,
      row.company,
      row.title,
      1,
      researchSummary,
      outputDir,
      availableKeys,
    );

    console.log(`    Cross-model consensus: ${report.consensus.toUpperCase()} (${report.verdicts.length} models)`);
    if (report.divergence.length > 0) {
      console.log(`    Divergence: ${report.divergence[0].slice(0, 100)}`);
    }

    return { consensus: report.consensus, divergence: report.divergence };
  } catch (err: any) {
    if (verbose) console.log(`    Cross-model judge error: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Failure flag writer — saves what we have + error explanation for operator review
// ---------------------------------------------------------------------------

async function writeFailureFlag(
  row: ProspectRow,
  runId: string,
  firstResult: PipelineResult,
  retryResult: PipelineResult | null,
): Promise<void> {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!sbKey) return;

  const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const allErrors = [
    ...firstResult.errors.map(e => `[attempt 1] ${e}`),
    ...(retryResult?.errors || []).map(e => `[attempt 2] ${e}`),
  ];
  const errorSummary = allErrors.slice(0, 5).join('; ');

  const strip = (v: any) => (v && !String(v).startsWith('[insufficient data]')) ? String(v) : null;
  const intel = firstResult.structuredIntel?.dossier || retryResult?.structuredIntel?.dossier || {};
  const { contact = {}, company = {}, salesIntel = {} } = intel;

  try {
    await fetch(`${sbUrl}/rest/v1/sr_engine_output`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        prospect_id: prospectId, run_id: runId,
        first_name: row.firstName, last_name: row.lastName,
        email: firstResult.emailFound || retryResult?.emailFound || '',
        company: row.company, title: row.title, state: row.state || '',
        icp_status: firstResult.icpResult?.verdict || retryResult?.icpResult?.verdict || 'pass',
        icp_reason: firstResult.icpResult?.reason || retryResult?.icpResult?.reason || '',
        assigned_ae: firstResult.aeSender || resolveAE(row.state).name,
        ae_email: resolveAE(row.state).email,
        ae_flag: `FAILED after 2 attempts: ${errorSummary.slice(0, 200)}`,
        research_summary: (firstResult.researchSummary || retryResult?.researchSummary || '').slice(0, 5000),
        intel_signal_strength: strip(salesIntel.showrev_signal_strength),
        company_summary: strip(company.showrev_company_summary),
        persona_bucket: strip(contact.showrev_persona_classification),
        email_subject_t1: firstResult.emailSubjects.t1 || retryResult?.emailSubjects.t1 || '',
        email_body_t1: firstResult.emailBodies.t1 || retryResult?.emailBodies.t1 || '',
        email_ps_t1: firstResult.emailPs.t1 || retryResult?.emailPs.t1 || '',
        mechanical_check_passed: false,
        mechanical_check_failures: `retry-exhausted: ${errorSummary.slice(0, 200)}`,
        confidence_score: firstResult.confidenceScore ?? retryResult?.confidenceScore ?? null,
      }),
    });
    console.log(`  -> Flagged in Supabase: ${prospectId} (2 attempts failed)`);
  } catch (err: any) {
    console.log(`  -> Flag write error: ${err.message?.slice(0, 60)}`);
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function processOneProspect(
  row: ProspectRow,
  index: number,
  total: number,
  config: PipelineConfig,
  runId: string,
): Promise<PipelineResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const result: PipelineResult = {
    prospect: row,
    icpResult: null,
    emailFound: row.email || null,
    emailConfidence: row.email ? 'provided' : 'not-attempted',
    domainMismatch: null,
    researchSummary: '',
    semanticVerification: null,
    factVerification: null,
    structuredIntel: null,
    brainIngest: null,
    brainContext: null,
    confidenceScore: null,
    confidenceColor: null,
    mvQuality: null,
    emailCorrected: false,
    originalEmail: null,
    judgeScores: {},
    judgePass: false,
    crossModelJudge: null,
    emailSubjects: { t1: '', t2: '', t3: '' },
    emailBodies: { t1: '', t2: '', t3: '' },
    emailPs: { t1: '', t2: '', t3: '' },
    persona: '',
    micrositeSlug: toSlug(row.company, row.firstName, row.lastName),
    prospectUpserted: false,
    micrositeUpserted: false,
    aeSender: '',
    aeFlag: null,
    duration: 0,
    errors: [],
    warnings: [],
    phaseTimings: [],
  };

  const recordPhase = (phase: string, startMs: number, status: PhaseTiming['status'], detail?: string) => {
    result.phaseTimings.push({ phase, durationMs: Date.now() - startMs, status, detail });
  };

  console.log(`\n[${index + 1}/${total}] Processing ${row.company} -- ${row.firstName} ${row.lastName}...`);

  // Phase 1: ICP Gate — reject non-ICP before burning pipeline time
  console.log('  Phase 1: ICP qualification...');
  const p1Start = Date.now();
  try {
    const { icpGate } = await import('./icp-gate.js');
    const icp = await icpGate(row.company, row.title, config.verbose);
    result.icpResult = icp;
    console.log(`  -> ICP: ${icp.verdict.toUpperCase()} — ${icp.icpType} (${icp.reason})`);

    if (icp.verdict === 'reject') {
      recordPhase('1-icp-gate', p1Start, 'pass', `reject:${icp.icpType}`);
      result.duration = Date.now() - t0;
      result.errors = errors;
      console.log(`  -> SKIPPED: Non-ICP prospect.`);

      // Upsert prospect row with reject status so Mission Control shows the reason
      try {
        const ae = resolveAE(row.state);
        await phaseProspectUpsert(row, ae, null, 'not-attempted', config.dryRun, config.verbose, 'reject', icp.reason, icp.icpType, config.leadType);
        result.prospectUpserted = true;
      } catch {}

      return result;
    }
    recordPhase('1-icp-gate', p1Start, 'pass', `${result.icpResult?.verdict}:${result.icpResult?.icpType}`);
  } catch (err: any) {
    console.log(`  -> ICP gate error (non-blocking, defaulting to pass): ${err.message?.slice(0, 60)}`);
    result.icpResult = { verdict: 'pass', icpType: 'unknown', reason: 'Gate error — defaulting to pass', confidence: 0, method: 'error' };
    recordPhase('1-icp-gate', p1Start, 'warn', 'error-defaulted-pass');
  }

  // Phase 2: Email Discovery (also runs for pending@ placeholders and MV-rejected emails)
  const needsDiscovery = !row.email || row.email.startsWith('pending@');
  if (needsDiscovery) {
    console.log('  Phase 2: Email discovery...');
  } else {
    console.log('  Phase 2: Email verification + discovery...');
  }
  const p2Start = Date.now();
  try {
    const emailResult = await phaseEmailFind(row, config.verbose);
    result.emailFound = emailResult.email;
    result.emailConfidence = emailResult.confidence;
    result.domainMismatch = emailResult.domainMismatch;
    result.mvQuality = emailResult.mvQuality;
    result.emailCorrected = !!(emailResult.email && row.email && emailResult.email !== row.email);
    result.originalEmail = result.emailCorrected ? row.email : null;
    if (emailResult.email) {
      row.email = emailResult.email;
      console.log(`  -> ${needsDiscovery ? 'Found' : 'Verified'}: ${emailResult.email} (${emailResult.confidence})`);
      if (emailResult.domainMismatch) {
        console.log(`  -> ⚠ DOMAIN MISMATCH: ${emailResult.domainMismatch}`);
      }

      const { evaluateConfidence } = await import('../deliverability/confidence-gate.js');
      const mvForGate = emailResult.mvQuality
        ? { quality: emailResult.mvQuality as any }
        : undefined;
      const confEval = evaluateConfidence(
        emailResult.email,
        emailResult.confidence as any,
        mvForGate,
        emailResult.csvDomainMismatch,
      );
      result.confidenceScore = confEval.score;
      result.confidenceColor = confEval.color;
      console.log(`  -> Confidence: ${confEval.color} (${confEval.score}) — ${confEval.canSend ? 'can send' : 'BLOCKED'}`);
    } else {
      console.log(`  -> No email found (${emailResult.confidence})`);
    }
    recordPhase('2-email-find', p2Start, result.emailFound ? 'pass' : 'fail', `${result.emailConfidence}${result.mvQuality ? `:mv=${result.mvQuality}` : ''}`);
  } catch (err: any) {
    errors.push(`email-find: ${err.message?.slice(0, 80)}`);
    console.log(`  -> Email find error: ${err.message?.slice(0, 60)}`);
    recordPhase('2-email-find', p2Start, 'fail', 'error');
  }

  // Phase 2b: Upsert sr_prospects (Mission Control needs prospect rows)
  let ae = resolveAE(row.state);
  result.aeSender = ae.name;
  console.log('  Phase 2b: Prospect upsert...');
  const p2bStart = Date.now();
  try {
    result.prospectUpserted = await phaseProspectUpsert(
      row, ae, result.emailFound, result.emailConfidence, config.dryRun, config.verbose,
      result.icpResult?.verdict === 'pass' ? 'pass' : 'pending',
      result.icpResult?.reason || '',
      result.icpResult?.icpType || '',
      config.leadType,
      {
        mvQuality: result.mvQuality,
        corrected: result.emailCorrected,
        originalEmail: result.originalEmail,
        persona: result.persona,
      },
    );
    console.log(`  -> ${result.prospectUpserted ? 'Prospect upserted to sr_prospects' : 'Prospect upsert failed (non-blocking)'}`);
    recordPhase('2b-prospect-upsert', p2bStart, result.prospectUpserted ? 'pass' : 'warn', result.prospectUpserted ? undefined : 'upsert-failed');
  } catch (err: any) {
    errors.push(`prospect-upsert: ${err.message?.slice(0, 80)}`);
    console.log(`  -> Prospect upsert error: ${err.message?.slice(0, 60)}`);
    recordPhase('2b-prospect-upsert', p2bStart, 'fail', 'error');
  }

  // No-email early exit: skip composition pipeline, write flag status for operator review
  if (!result.emailFound) {
    console.log('  -> No email found — skipping composition. Flagging for operator review.');
    result.warnings.push('No email found — flagged for operator review. Check System Brief for research details.');
    result.duration = Date.now() - t0;
    // Still run research + intel so the System Brief is useful, but skip compose/judge/microsite
    // Write a minimal engine output row with 'flag' status
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (sbKey) {
        await fetch(`${sbUrl}/rest/v1/sr_engine_output`, {
          method: 'POST',
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            prospect_id: prospectId,
            run_id: runId,
            first_name: row.firstName,
            last_name: row.lastName,
            email: '',
            company: row.company,
            title: row.title,
            state: row.state || '',
            icp_status: result.icpResult?.verdict || 'pass',
            icp_reason: result.icpResult?.reason || '',
            assigned_ae: ae.name,
            ae_email: ae.email,
            ae_flag: 'No email found — requires manual lookup',
            mechanical_check_passed: false,
            mechanical_check_failures: 'no-email: skipped composition pipeline',
          }),
        });
        console.log(`  -> Flagged in Supabase (status=flag, no email)`);
      }
    } catch (err: any) {
      console.log(`  -> Flag write error (non-blocking): ${err.message?.slice(0, 60)}`);
    }
    return result;
  }

  // Phase 3a: Brain/AgentDB context query — provide cached knowledge to research
  //   Strategy: try AgentDB semantic search first (searchBrain), fall back to JSONL filtering
  const brainDir = resolve(process.cwd(), 'data/brain/fiber-telecom/inorsa/fiber/fiber-connect-2026');
  let brainContextEntries = 0;
  const p3aStart = Date.now();
  if (!config.skipResearch) {
    console.log('  Phase 3a: Brain context query...');
    try {
      let brainContextText = '';

      // Attempt 1: AgentDB semantic search (HNSW vector similarity)
      try {
        const { initBrainDB, searchBrain } = await import('./brain-agentdb.js');
        await initBrainDB();
        const query = `${row.company} ${row.title} fiber broadband ${row.state || ''}`.trim();
        const agentDBResults = await searchBrain(query, 10);
        if (agentDBResults.length > 0) {
          brainContextEntries = agentDBResults.length;
          brainContextText = `## Prior Brain Knowledge — AgentDB (${agentDBResults.length} semantic matches)\n\n` +
            agentDBResults.map(r => `- [${r.type}] **${r.name}** (${(r.score * 100).toFixed(0)}%): ${r.facts[0] || ''}`).join('\n') + '\n';
          console.log(`  -> AgentDB: ${agentDBResults.length} semantic matches`);
        }
      } catch {
        // AgentDB not available — fall through to JSONL
      }

      // Attempt 2: JSONL entity graph filtering (always available)
      if (!brainContextText) {
        const { loadEntityGraph, loadBrainDigest } = await import('./brain-ingest.js');
        const graph = loadEntityGraph(brainDir);

        const companyLower = row.company.toLowerCase();
        const relevant: string[] = [];
        for (const entity of Array.from(graph.values())) {
          const nameMatch = entity.name.toLowerCase().includes(companyLower) ||
            companyLower.includes(entity.name.toLowerCase());
          const factMatch = entity.facts.some((f: string) => f.toLowerCase().includes(companyLower));
          if (nameMatch || factMatch) {
            relevant.push(`[${entity.type}] ${entity.name}: ${entity.facts[0]?.slice(0, 200) || ''}`);
          }
        }

        if (relevant.length > 0) {
          brainContextEntries = relevant.length;
          brainContextText = `## Prior Brain Knowledge (${relevant.length} entities)\n\n${relevant.slice(0, 20).join('\n')}\n`;
          console.log(`  -> Brain context: ${relevant.length} relevant JSONL entries found`);
        } else {
          // Fallback: load the full digest for general industry context
          const digest = loadBrainDigest(brainDir);
          if (digest) {
            brainContextText = digest.slice(0, 3000);
            console.log(`  -> Brain context: digest loaded (no company-specific matches)`);
          } else {
            console.log('  -> Brain context: no prior knowledge');
          }
        }
      }

      result.brainContext = { entriesFound: brainContextEntries };

      // Inject whatever context we found into LLM cacheable system content
      if (brainContextText) {
        const { setBrainCacheContent } = await import('./llm-client.js');
        setBrainCacheContent(brainContextText);
      }
      recordPhase('3a-brain-context', p3aStart, brainContextEntries > 0 ? 'pass' : 'warn', `${brainContextEntries} entries`);
    } catch (err: any) {
      console.log(`  -> Brain context error (non-blocking): ${err.message?.slice(0, 60)}`);
      recordPhase('3a-brain-context', p3aStart, 'warn', 'error');
    }
  } else {
    recordPhase('3a-brain-context', p3aStart, 'skip');
  }

  // Phase 3: Research (3-persona STORM)
  let researchResults = { analyst: '', aeProxy: '', techEval: '' };
  const p3Start = Date.now();
  if (config.skipResearch) {
    console.log('  Phase 3: Research SKIPPED (--skip-research)');
    result.researchSummary = '[Research skipped]';
    recordPhase('3-research', p3Start, 'skip');
  } else {
    console.log('  Phase 3: 3-persona research...');
    try {
      researchResults = await phaseResearch(row, config.model, config.verbose);
      result.researchSummary = [
        researchResults.analyst.slice(0, 1000),
        researchResults.aeProxy.slice(0, 1000),
        researchResults.techEval.slice(0, 1000),
      ].join('\n---\n');
      console.log('  -> Research complete (3 personas)');
      recordPhase('3-research', p3Start, 'pass', '3 personas');
    } catch (err: any) {
      errors.push(`research: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Research error: ${err.message?.slice(0, 60)}`);
      recordPhase('3-research', p3Start, 'fail', 'error');
    }
  }

  const researchSummary = Object.values(researchResults).filter(Boolean).join('\n\n');

  // Phase 3b: Brain Ingest — extract entities from research into entity graph
  const p3bStart = Date.now();
  if (!config.skipResearch && researchSummary) {
    console.log('  Phase 3b: Brain ingest...');
    try {
      const { ingestResearchIntoBrain } = await import('./brain-ingest.js');
      const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const brainResult = await ingestResearchIntoBrain(
        { 'Industry Analyst': researchResults.analyst, 'AE Proxy': researchResults.aeProxy, 'Technical Evaluator': researchResults.techEval },
        prospectId,
        undefined, // default brain dir
        index,     // prospect count for digest interval
        10,        // refresh digest every 10 prospects
      );
      result.brainIngest = { added: brainResult.added, updated: brainResult.updated, total: brainResult.total };
      console.log(`  -> Brain ingest: ${brainResult.added + brainResult.updated} entities extracted (${brainResult.added} new, ${brainResult.updated} updated)${brainResult.digestRefreshed ? ' [digest refreshed]' : ''}`);
      recordPhase('3b-brain-ingest', p3bStart, 'pass', `${brainResult.added}+${brainResult.updated} entities`);
    } catch (err: any) {
      errors.push(`brain-ingest: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Brain ingest error (non-blocking): ${err.message?.slice(0, 60)}`);
      recordPhase('3b-brain-ingest', p3bStart, 'warn', 'error');
    }
  } else {
    recordPhase('3b-brain-ingest', p3bStart, 'skip');
  }

  // Phase 3c: Intel Structurer — structure research into HubSpot dossier fields
  const p3cStart = Date.now();
  if (!config.skipResearch && researchSummary) {
    console.log('  Phase 3c: Intel structurer...');
    try {
      const { structureIntelReport } = await import('./intel-structurer.js');
      const prospectObj = {
        id: `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email || '',
        emailCorrected: false,
        phone: '',
        title: row.title,
        city: '',
        company: row.company,
        state: row.state || '',
        grade: 'Ungraded' as const,
        tier: 'A' as const,
        icpStatus: 'pass' as const,
        icpReason: '',
        aeNotes: row.aeNotes || '',
        hasAeNotes: !!(row.aeNotes && row.aeNotes.trim().length > 0),
        leadType: '',
        isDuplicate: false,
      };

      const intelResult = await structureIntelReport(
        { 'Industry Analyst': researchResults.analyst, 'AE Proxy': researchResults.aeProxy, 'Technical Evaluator': researchResults.techEval },
        '', // cross-exam insights (not available at this phase)
        prospectObj as any,
        [], // emails not yet composed
        [], // pattern selections not yet available
        ae.name,
        config.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      );

      result.structuredIntel = intelResult;
      const fieldCount = Object.values(intelResult.dossier || {}).reduce((sum: number, section: any) => {
        return sum + (typeof section === 'object' ? Object.keys(section).filter(k => section[k] && section[k] !== '[insufficient data]').length : 0);
      }, 0);
      console.log(`  -> Intel structured: ${fieldCount} fields populated${intelResult.warnings.length > 0 ? ` (${intelResult.warnings.length} warnings)` : ''}`);
      recordPhase('3c-intel-structurer', p3cStart, 'pass', `${fieldCount} fields`);
    } catch (err: any) {
      errors.push(`intel-structurer: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Intel structurer error (non-blocking): ${err.message?.slice(0, 60)}`);
      recordPhase('3c-intel-structurer', p3cStart, 'fail', 'error');
    }
  } else {
    recordPhase('3c-intel-structurer', p3cStart, 'skip');
  }

  // Phase 3d: HQ state detection — re-resolve AE if intel reveals different HQ state
  if (result.structuredIntel?.dossier?.company?.showrev_hq_state) {
    const hqState = result.structuredIntel.dossier.company.showrev_hq_state.trim().toUpperCase();
    const contactState = (row.state || '').trim().toUpperCase();
    if (hqState.length === 2 && hqState !== contactState) {
      const hqAe = resolveAE(hqState);
      if (hqAe.name !== ae.name) {
        result.aeFlag = `HQ=${hqState} (contact=${contactState}), reassigned ${ae.name} → ${hqAe.name}`;
        result.warnings.push(`AE reassigned: contact state ${contactState} → HQ state ${hqState} (${ae.name} → ${hqAe.name}). Flag for operator review.`);
        console.log(`  -> ⚠ AE reassigned: HQ state ${hqState} differs from contact state ${contactState} (${ae.name} → ${hqAe.name}) — flagged for operator review`);
        ae = hqAe;
        result.aeSender = ae.name;
      } else if (hqState !== contactState) {
        result.aeFlag = `Multi-state: contact=${contactState}, HQ=${hqState} (same AE territory)`;
        console.log(`  -> HQ state ${hqState} differs from contact state ${contactState} but same AE territory`);
      }
    }
  }

  // Phase 4: Substrate search
  console.log('  Phase 4: Substrate search...');
  const p4Start = Date.now();
  let substrateContext = '';
  try {
    substrateContext = await phaseSubstrateSearch(row, config.verbose);
    if (substrateContext) {
      console.log('  -> Substrate context loaded');
    } else {
      console.log('  -> No substrate matches');
    }
    recordPhase('4-substrate', p4Start, substrateContext ? 'pass' : 'warn', substrateContext ? undefined : 'no-matches');
  } catch (err: any) {
    errors.push(`substrate: ${err.message?.slice(0, 80)}`);
    recordPhase('4-substrate', p4Start, 'fail', 'error');
  }

  // Phase 4b: Semantic Verification — DISABLED
  // Root cause: asks LLM to "search the web" but callLLM has no web access.
  // Every claim returns [UNVERIFIED] because fabricated URLs never match classifySource() tiers.
  // Cost: ~10 LLM calls per prospect for zero signal. The judge's research_depth dimension
  // already evaluates claim support against actual research context in a single call.
  result.semanticVerification = null;

  // Extract icpType for downstream routing
  const icpType = result.icpResult?.icpType || 'unknown';

  // Phase 5: Pattern selection (Thompson Sampling fallback to default)
  console.log('  Phase 5: Pattern selection...');
  const p5Start = Date.now();
  let patterns: Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }> = [];
  if (config.skipResearch) {
    // Use safe defaults when no research to ground pattern selection
    patterns = [
      { pattern: 'challenger_insight', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Default (no research)', ctaType: 'interest_based', psStrategy: 'Microsite link' },
      { pattern: 'curiosity_gap', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Default (no research)', ctaType: 'soft_time', psStrategy: 'Office Hours' },
      { pattern: 'social_proof', challengerInsight: '', emotionalFrame: 'belonging', rationale: 'Default (no research)', ctaType: 'binary_close', psStrategy: 'Case study' },
    ];
    console.log('  -> Using defaults (research skipped)');
    recordPhase('5-pattern-select', p5Start, 'skip');
  } else {
    try {
      patterns = await phasePatternSelection(row, researchSummary, config.model, config.verbose, config.touches, icpType);
      console.log(`  -> ${patterns.map((p, i) => `T${config.touches[i]}: ${p.pattern}`).join(', ')}`);
      recordPhase('5-pattern-select', p5Start, 'pass', patterns.map(p => p.pattern).join(','));
    } catch (err: any) {
      errors.push(`pattern-selection: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Pattern selection error, using defaults`);
      patterns = [
        { pattern: 'challenger_insight', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Fallback', ctaType: 'interest_based', psStrategy: 'Microsite link' },
        { pattern: 'curiosity_gap', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Fallback', ctaType: 'soft_time', psStrategy: 'Office Hours' },
        { pattern: 'social_proof', challengerInsight: '', emotionalFrame: 'belonging', rationale: 'Fallback', ctaType: 'binary_close', psStrategy: 'Case study' },
      ];
      recordPhase('5-pattern-select', p5Start, 'warn', 'fallback-defaults');
    }
  }

  // Phase 6: Email composition
  const micrositeSlug = toSlug(row.company, row.firstName, row.lastName);
  let emails: ComposedEmail[] = [];
  let judgeResult = { scores: {} as Record<string, number>, pass: false, failures: [] as string[], warnings: [] as string[] };
  let microsite = { headline: '', insightText: '', caseStudy: '' };
  const p6Start = Date.now();

  if (config.skipComposition) {
    // --skip-composition: phases 1-4 only, skip 6/7/8
    console.log('  Phase 6-8: SKIPPED (--skip-composition)');
    recordPhase('6-composition', p6Start, 'skip');
    recordPhase('7-judge', p6Start, 'skip');
    recordPhase('8-microsite', p6Start, 'skip');
  } else if (config.skipResearch) {
    console.log('  Phase 6: Email composition SKIPPED (no research to compose from)');
    emails = config.touches.map(n => ({
      touchNumber: n,
      subject: '[Skipped]',
      body: '[Composition skipped - no research]',
      ps: '',
      wordCount: 0,
      pattern: patterns[n - 1]?.pattern || 'challenger_insight',
    }));
  } else {
    console.log(`  Phase 6: Email composition (touches: ${config.touches.join(', ')})...`);
    try {
      const allEmails = await phaseComposition(
        row, researchSummary, patterns, ae, micrositeSlug,
        config.composer, config.model, config.verbose, result.structuredIntel, icpType,
      );
      // Filter to only requested touches
      emails = allEmails.filter(e => config.touches.includes(e.touchNumber));
      console.log(`  -> ${emails.length} touches composed`);

      // Word count: target 70-90w T1/T2, 55-70w T3. Ceiling 100w / 80w
      const { buildComposerPrompt: wcRecomposeBuilder } = await import('./influence.js');
      const { callLLM: wcRecomposeLLM } = await import('./llm-client.js');
      for (let idx = 0; idx < emails.length; idx++) {
        const email = emails[idx];
        const wc = email.body.split(/\s+/).filter(Boolean).length;
        const wcCeiling = email.touchNumber === 3 ? 80 : 100;
        if (wc > wcCeiling) {
          console.log(`  -> WARNING: T${email.touchNumber} has ${wc} words (ceiling ${wcCeiling}), recomposing...`);
          try {
            const tNum = email.touchNumber as 1 | 2 | 3;
            const patternForTouch = patterns[tNum - 1];
            const wcKeyFacts = extractKeyFacts(result.structuredIntel);
            const wcPrompt = wcRecomposeBuilder(
              patternForTouch as any,
              researchSummary,
              { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
              row.aeNotes || '',
              tNum,
              tNum > 1 ? emails.find(e => e.touchNumber === tNum - 1)?.subject : undefined,
              ae.name,
              ae.email,
              micrositeSlug,
              wcKeyFacts,
              icpType,
            ) + `\n\n## CRITICAL: WORD COUNT FIX\nYour previous draft was ${wc} words. The HARD CEILING is ${wcCeiling} words. Your TARGET is ${wcCeiling === 80 ? '45-60' : '60-75'} words. You naturally overshoot by 10-20 words, so aim for the TARGET — not the ceiling. Structure: opener (1-2 sentences), bridge question (1 sentence), pitch line (1 sentence). Cut entire sentences rather than trimming individual words. KEEP the company-specific opener fact.`;
            const wcResult = await wcRecomposeLLM(wcPrompt, {
              model: config.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
              label: `T${tNum}-wc-recompose`,
            });
            const jsonMatch = wcResult.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || wcResult.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[1]);
              let cleanBody = (parsed.body || '')
                .replace(/(\d)[–—](\d)/g, '$1-$2')
                .replace(/[—–]/g, ',')
                .replace(/\s+,/g, ',');
              cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
              cleanBody = cleanBody.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();
              emails[idx] = {
                touchNumber: tNum,
                subject: (parsed.subject || email.subject).replace(/[—–]/g, ','),
                body: cleanBody,
                ps: (parsed.ps || '').replace(/[—–]/g, ','),
                wordCount: cleanBody.split(/\s+/).length,
                pattern: email.pattern,
              };
              console.log(`  -> T${tNum} recomposed (${cleanBody.split(/\s+/).length} words)`);
            }
          } catch (err: any) {
            console.log(`  -> T${email.touchNumber} wc-recompose failed: ${err.message?.slice(0, 60)}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`composition: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Composition error: ${err.message?.slice(0, 60)}`);
    }
    recordPhase('6-composition', p6Start, emails.length > 0 ? 'pass' : 'fail', `${emails.length} touches, wc=${emails.map(e => e.body.split(/\s+/).length).join('/')}`);

    result.emailSubjects = {
      t1: emails.find(e => e.touchNumber === 1)?.subject || '',
      t2: emails.find(e => e.touchNumber === 2)?.subject || '',
      t3: emails.find(e => e.touchNumber === 3)?.subject || '',
    };
    result.emailBodies = {
      t1: emails.find(e => e.touchNumber === 1)?.body || '',
      t2: emails.find(e => e.touchNumber === 2)?.body || '',
      t3: emails.find(e => e.touchNumber === 3)?.body || '',
    };
    result.emailPs = {
      t1: emails.find(e => e.touchNumber === 1)?.ps || '',
      t2: emails.find(e => e.touchNumber === 2)?.ps || '',
      t3: emails.find(e => e.touchNumber === 3)?.ps || '',
    };
    const { detectPersona } = await import('./influence.js');
    result.persona = detectPersona(row.title);

    // Phase 6b: Fact Verification — DISABLED (redundant with semantic verify, added latency without gating)
    result.factVerification = null;

    // Phase 7: Judge gate (with auto-recompose on mechanical failure, up to 2 retries)
    const p7Start = Date.now();
    const MAX_JUDGE_RETRIES = 2;
    for (let judgeAttempt = 0; judgeAttempt <= MAX_JUDGE_RETRIES; judgeAttempt++) {
      console.log(`  Phase 7: Judge gate${judgeAttempt > 0 ? ` (retry ${judgeAttempt})` : ''}...`);
      try {
        judgeResult = await phaseJudge(emails, row, ae, micrositeSlug, config.verbose, config.model, researchSummary, icpType);
        result.judgeScores = judgeResult.scores;
        result.judgePass = judgeResult.pass;
        console.log(`  -> ${judgeResult.pass ? 'PASS' : 'FAIL'}${judgeResult.failures.length > 0 ? ` (${judgeResult.failures.length} failures)` : ''}`);
      } catch (err: any) {
        errors.push(`judge: ${err.message?.slice(0, 80)}`);
        console.log(`  -> Judge error: ${err.message?.slice(0, 60)}`);
        break;
      }

      if (judgeResult.pass || judgeAttempt === MAX_JUDGE_RETRIES) break;

      // Auto-recompose failing touches
      const failingTouches = new Set<number>();
      for (const f of judgeResult.failures) {
        const tm = f.match(/^T(\d)/);
        if (tm) failingTouches.add(parseInt(tm[1]));
      }
      if (failingTouches.size === 0) break;

      console.log(`  -> Auto-recomposing T${[...failingTouches].join(', T')} after judge failure...`);
      const { buildComposerPrompt: recomposePromptBuilder } = await import('./influence.js');
      const { callLLM: recomposeLLM } = await import('./llm-client.js');
      for (const tNum of failingTouches) {
        const idx = emails.findIndex(e => e.touchNumber === tNum);
        if (idx < 0) continue;
        const patternForTouch = patterns[tNum - 1];
        if (!patternForTouch) continue;
        try {
          const reKeyFacts = extractKeyFacts(result.structuredIntel);
          const mustFixFeedback = judgeResult.failures
            .filter(f => f.startsWith(`T${tNum}`))
            .map(f => f.replace(/^T\d\s*/, ''))
            .join('\n');
          const rePrompt = recomposePromptBuilder(
            patternForTouch as any,
            researchSummary,
            { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
            row.aeNotes || '',
            tNum as 1 | 2 | 3,
            tNum > 1 ? emails.find(e => e.touchNumber === tNum - 1)?.subject : undefined,
            ae.name,
            ae.email,
            micrositeSlug,
            reKeyFacts,
            icpType,
          ) + (mustFixFeedback ? `\n\n## JUDGE FEEDBACK (fix these issues in your rewrite)\n${mustFixFeedback}` : '');
          const reResult = await recomposeLLM(rePrompt, {
            model: config.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
            label: `T${tNum}-recompose`,
          });
          const jsonMatch = reResult.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || reResult.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            let cleanBody = (parsed.body || '')
              .replace(/(\d)[–—](\d)/g, '$1-$2')
              .replace(/[—–]/g, ',')
              .replace(/\s+,/g, ',');
            cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
            cleanBody = cleanBody.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();
            emails[idx] = {
              touchNumber: tNum,
              subject: (parsed.subject || emails[idx].subject).replace(/[—–]/g, ','),
              body: cleanBody,
              ps: (parsed.ps || '').replace(/[—–]/g, ','),
              wordCount: cleanBody.split(/\s+/).length,
              pattern: emails[idx].pattern,
            };
            console.log(`    T${tNum} recomposed (${cleanBody.split(/\s+/).length} words)`);
          } else {
            console.log(`    T${tNum} recompose: no JSON in LLM output`);
          }
        } catch (err: any) {
          console.log(`    T${tNum} recompose failed: ${err.message?.slice(0, 60)}`);
        }
      }
    }

    // Phase 7b: Cross-Model Judge (multi-model consensus on T1)
    if (config.crossModelJudge && judgeResult.pass) {
      console.log('  Phase 7b: Cross-model judge...');
      try {
        const outputDir = resolve(process.cwd(), 'data/showrev/premium');
        result.crossModelJudge = await phaseCrossModelJudge(
          emails, row, researchSummary, outputDir, config.verbose,
        );
        if (result.crossModelJudge?.consensus === 'reject') {
          judgeResult.pass = false;
          judgeResult.failures.push('Cross-model consensus: REJECT');
          result.judgePass = false;
          console.log('  -> Cross-model REJECT overrides single-model PASS');
        }
      } catch (err: any) {
        errors.push(`cross-model-judge: ${err.message?.slice(0, 80)}`);
        console.log(`  -> Cross-model judge error: ${err.message?.slice(0, 60)}`);
      }
    }

    {
      const scoreStr = Object.entries(judgeResult.scores).map(([k, v]) => `${k}=${v}`).join(',');
      recordPhase('7-judge', p7Start, judgeResult.pass ? 'pass' : 'fail', scoreStr);
    }

    // Phase 8: Microsite content
    const p8Start = Date.now();
    console.log('  Phase 8: Microsite content...');
    try {
      microsite = await phaseMicrosite(
        row, runId, micrositeSlug, ae,
        patterns[0]?.challengerInsight || '', researchSummary, '',
      );
      const genericFallback = microsite.headline.startsWith('What ') && microsite.headline.includes('should know');
      if (genericFallback && patterns[0]?.challengerInsight) {
        console.log(`  -> WARNING: microsite headline fell back to generic despite available challenger insight`);
      }
      console.log(`  -> "${microsite.headline.slice(0, 50)}..."`);
    } catch (err: any) {
      errors.push(`microsite: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Microsite error: ${err.message?.slice(0, 60)}`);
    }

    // Phase 8b: Upsert sr_microsites (renderer reads this table)
    if (microsite.headline) {
      console.log('  Phase 8b: Microsite upsert...');
      try {
        result.micrositeUpserted = await phaseMicrositeUpsert(
          row, runId, micrositeSlug, ae, microsite, config.dryRun, config.verbose,
        );
        console.log(`  -> ${result.micrositeUpserted ? 'Microsite upserted to sr_microsites' : 'Microsite upsert failed (non-blocking)'}`);
      } catch (err: any) {
        errors.push(`microsite-upsert: ${err.message?.slice(0, 80)}`);
        console.log(`  -> Microsite upsert error: ${err.message?.slice(0, 60)}`);
      }
    }
    recordPhase('8-microsite', p8Start, microsite.headline ? 'pass' : 'warn', microsite.headline ? undefined : 'no-headline');
  }
  result.micrositeSlug = micrositeSlug;

  // Phase 9: Supabase write
  console.log('  Phase 9: Supabase write...');
  const p9Start = Date.now();
  try {
    const written = await phaseSupabaseWrite(
      row, runId, emails, ae, micrositeSlug, researchSummary,
      { pass: judgeResult.pass, failures: judgeResult.failures },
      patterns, { headline: microsite.headline, insightText: microsite.insightText },
      result.domainMismatch,
      result.emailConfidence,
      result.confidenceScore,
      result.confidenceColor,
      result.structuredIntel || null,
      result.aeFlag,
      config.dryRun, config.verbose,
    );
    if (!config.dryRun) {
      console.log(`  -> ${written ? 'Written to Supabase' : 'Supabase write failed (non-blocking)'}`);
    }
    recordPhase('9-supabase-write', p9Start, 'pass');
  } catch (err: any) {
    errors.push(`supabase: ${err.message?.slice(0, 80)}`);
    console.log(`  -> Supabase error: ${err.message?.slice(0, 60)}`);
    recordPhase('9-supabase-write', p9Start, 'fail', 'error');
  }

  result.duration = Date.now() - t0;
  result.errors = errors;
  result.warnings = judgeResult.warnings || [];
  console.log(`  Done (${(result.duration / 1000).toFixed(1)}s, ${errors.length} errors${result.warnings.length > 0 ? `, ${result.warnings.length} warnings` : ''})`);

  return result;
}

// ---------------------------------------------------------------------------
// Telemetry report
// ---------------------------------------------------------------------------

function writeTelemetryReport(results: PipelineResult[], runId: string, totalDuration: number): string {
  const allPhases = new Set<string>();
  for (const r of results) {
    for (const pt of r.phaseTimings) allPhases.add(pt.phase);
  }
  const phases = [...allPhases].sort();

  const phaseAgg: Record<string, { count: number; passCount: number; failCount: number; totalMs: number; maxMs: number }> = {};
  for (const phase of phases) {
    phaseAgg[phase] = { count: 0, passCount: 0, failCount: 0, totalMs: 0, maxMs: 0 };
  }
  for (const r of results) {
    for (const pt of r.phaseTimings) {
      const a = phaseAgg[pt.phase];
      a.count++;
      if (pt.status === 'pass') a.passCount++;
      if (pt.status === 'fail') a.failCount++;
      a.totalMs += pt.durationMs;
      if (pt.durationMs > a.maxMs) a.maxMs = pt.durationMs;
    }
  }

  const icpPassed = results.filter(r => r.icpResult?.verdict !== 'reject');
  const report = {
    runId,
    timestamp: new Date().toISOString(),
    totalDuration: `${(totalDuration / 1000).toFixed(1)}s`,
    prospectCount: results.length,
    icpPassCount: icpPassed.length,
    emailFoundCount: results.filter(r => r.emailFound).length,
    judgePassCount: results.filter(r => r.judgePass).length,
    emailFindRate: icpPassed.length > 0 ? `${Math.round(results.filter(r => r.emailFound).length / icpPassed.length * 100)}%` : 'n/a',
    judgePassRate: icpPassed.length > 0 ? `${Math.round(results.filter(r => r.judgePass).length / icpPassed.length * 100)}%` : 'n/a',
    phaseStats: Object.fromEntries(
      phases.map(p => [p, {
        passRate: phaseAgg[p].count > 0 ? `${Math.round(phaseAgg[p].passCount / phaseAgg[p].count * 100)}%` : 'n/a',
        failRate: phaseAgg[p].count > 0 ? `${Math.round(phaseAgg[p].failCount / phaseAgg[p].count * 100)}%` : 'n/a',
        avgMs: phaseAgg[p].count > 0 ? Math.round(phaseAgg[p].totalMs / phaseAgg[p].count) : 0,
        maxMs: phaseAgg[p].maxMs,
        count: phaseAgg[p].count,
      }]),
    ),
    bottleneck: phases.reduce((worst, p) => {
      const avg = phaseAgg[p].count > 0 ? phaseAgg[p].totalMs / phaseAgg[p].count : 0;
      return avg > (phaseAgg[worst]?.totalMs / (phaseAgg[worst]?.count || 1) || 0) ? p : worst;
    }, phases[0] || ''),
    prospects: results.map(r => ({
      name: `${r.prospect.firstName} ${r.prospect.lastName}`,
      company: r.prospect.company,
      email: r.emailFound || null,
      emailConfidence: r.emailConfidence,
      mvQuality: r.mvQuality,
      judgePass: r.judgePass,
      judgeScores: r.judgeScores,
      duration: `${(r.duration / 1000).toFixed(1)}s`,
      errors: r.errors,
      warnings: r.warnings,
      phases: r.phaseTimings.map(pt => ({
        phase: pt.phase,
        ms: pt.durationMs,
        status: pt.status,
        ...(pt.detail ? { detail: pt.detail } : {}),
      })),
    })),
  };

  const outDir = resolve(process.cwd(), 'data/showrev/premium/telemetry');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runId}-telemetry.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Print phase summary table
  console.log('\n  Phase Telemetry:');
  console.log('  ' + '-'.repeat(72));
  console.log('  ' + 'Phase'.padEnd(22) + 'Pass%'.padEnd(8) + 'Fail%'.padEnd(8) + 'AvgMs'.padEnd(10) + 'MaxMs'.padEnd(10) + 'Count');
  console.log('  ' + '-'.repeat(72));
  for (const phase of phases) {
    const s = phaseAgg[phase];
    if (s.count === 0) continue;
    const passRate = `${Math.round(s.passCount / s.count * 100)}%`;
    const failRate = `${Math.round(s.failCount / s.count * 100)}%`;
    const avgMs = Math.round(s.totalMs / s.count).toString();
    console.log(`  ${phase.padEnd(22)}${passRate.padEnd(8)}${failRate.padEnd(8)}${avgMs.padEnd(10)}${s.maxMs.toString().padEnd(10)}${s.count}`);
  }
  console.log('  ' + '-'.repeat(72));
  console.log(`  Bottleneck: ${report.bottleneck} (avg ${phaseAgg[report.bottleneck]?.count > 0 ? Math.round(phaseAgg[report.bottleneck].totalMs / phaseAgg[report.bottleneck].count) : 0}ms)`);
  console.log(`  Telemetry saved: ${outPath}`);

  return outPath;
}

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------

function printSummary(results: PipelineResult[], runId: string, totalDuration: number): void {
  console.log('\n' + '='.repeat(70));
  console.log(`  PIPELINE SUMMARY — ${runId}`);
  console.log('='.repeat(70));

  // Per-prospect results
  console.log('\n  Prospect Results:');
  console.log('  ' + '-'.repeat(66));
  console.log('  ' + 'Name'.padEnd(25) + 'Company'.padEnd(20) + 'Email'.padEnd(8) + 'Judge'.padEnd(8) + 'T1 Subject');
  console.log('  ' + '-'.repeat(66));

  for (const r of results) {
    const name = `${r.prospect.firstName} ${r.prospect.lastName}`.slice(0, 24);
    const company = r.prospect.company.slice(0, 19);
    const icpRejected = r.icpResult?.verdict === 'reject';
    if (icpRejected) {
      console.log(`  ${name.padEnd(25)}${company.padEnd(20)}${'—'.padEnd(8)}${'ICP ✗'.padEnd(8)}${r.icpResult?.reason?.slice(0, 30) || 'non-ICP'}`);
      continue;
    }
    const emailStatus = r.emailFound ? `Y (${r.emailConfidence.slice(0, 3)})` : 'N';
    const judgeStatus = r.judgePass ? 'PASS' : 'FAIL';
    const t1 = r.emailSubjects.t1.slice(0, 30) || '[none]';
    console.log(`  ${name.padEnd(25)}${company.padEnd(20)}${emailStatus.padEnd(8)}${judgeStatus.padEnd(8)}${t1}`);
  }

  // Aggregate stats
  console.log('\n  ' + '-'.repeat(66));
  const total = results.length;
  const icpRejected = results.filter(r => r.icpResult?.verdict === 'reject').length;
  const icpPassed = results.filter(r => r.icpResult?.verdict !== 'reject').length;
  const emailsFound = results.filter(r => r.emailFound).length;
  const judgePass = results.filter(r => r.judgePass).length;
  const avgDuration = total > 0 ? results.reduce((s, r) => s + r.duration, 0) / total : 0;
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  const prospectsUpserted = results.filter(r => r.prospectUpserted).length;
  const micrositesUpserted = results.filter(r => r.micrositeUpserted).length;
  const crossModelRan = results.filter(r => r.crossModelJudge).length;

  console.log(`\n  Total processed:    ${total}`);
  if (icpRejected > 0) {
    console.log(`  ICP rejected:       ${icpRejected}/${total} (saved ~${icpRejected * 4} min of pipeline time)`);
    console.log(`  ICP passed:         ${icpPassed}/${total}`);
  }
  console.log(`  Emails found:       ${emailsFound}/${icpPassed} (${icpPassed > 0 ? Math.round(emailsFound / icpPassed * 100) : 0}%)`);
  console.log(`  Judge pass rate:    ${judgePass}/${icpPassed} (${icpPassed > 0 ? Math.round(judgePass / icpPassed * 100) : 0}%)`);
  console.log(`  Prospects upserted: ${prospectsUpserted}/${total}`);
  console.log(`  Microsites created: ${micrositesUpserted}/${icpPassed}`);
  if (crossModelRan > 0) console.log(`  Cross-model judged: ${crossModelRan}/${total}`);
  console.log(`  Avg per prospect:   ${(avgDuration / 1000).toFixed(1)}s`);
  console.log(`  Total duration:     ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Total errors:       ${totalErrors}`);
  const warnCount = results.reduce((s, r) => s + r.warnings.length, 0);
  if (warnCount > 0) console.log(`  AI-tell warnings:   ${warnCount}`);

  if (icpRejected > 0) {
    console.log('\n  ICP Rejections:');
    for (const r of results) {
      if (r.icpResult?.verdict === 'reject') {
        console.log(`    ✗ ${r.prospect.firstName} ${r.prospect.lastName} @ ${r.prospect.company} — ${r.icpResult.reason}`);
      }
    }
  }

  if (totalErrors > 0) {
    console.log('\n  Errors:');
    for (const r of results) {
      if (r.errors.length > 0) {
        console.log(`    ${r.prospect.firstName} ${r.prospect.lastName}: ${r.errors.join('; ')}`);
      }
    }
  }

  const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0);
  if (totalWarnings > 0) {
    console.log(`\n  AI-Tell Warnings: ${totalWarnings}`);
    for (const r of results) {
      if (r.warnings.length > 0) {
        console.log(`    ${r.prospect.firstName} ${r.prospect.lastName}:`);
        for (const w of r.warnings) console.log(`      ${w}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
}

function printEmails(results: PipelineResult[]): void {
  const composed = results.filter(r => r.emailBodies.t1);
  if (composed.length === 0) return;

  console.log('\n' + '='.repeat(70));
  console.log('  T1 EMAILS FOR REVIEW');
  console.log('='.repeat(70));

  for (const r of composed) {
    const name = `${r.prospect.firstName} ${r.prospect.lastName}`;
    console.log('\n' + '-'.repeat(70));
    console.log(`  TO:       ${name} <${r.emailFound ? r.prospect.email || '[found]' : '[no email]'}>`);
    console.log(`  COMPANY:  ${r.prospect.company}`);
    console.log(`  TITLE:    ${r.prospect.title}`);
    console.log(`  PERSONA:  ${r.persona || 'unknown'}`);
    console.log(`  AE:       ${r.aeSender || 'unassigned'}${r.aeFlag ? ` ⚠ ${r.aeFlag}` : ''}`);
    console.log(`  JUDGE:    ${r.judgePass ? 'PASS' : 'FAIL'} — ${Object.entries(r.judgeScores).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    if (r.crossModelJudge) {
      console.log(`  X-MODEL:  ${r.crossModelJudge.consensus}`);
    }
    console.log(`  SUBJECT:  ${r.emailSubjects.t1}`);
    console.log('-'.repeat(70));
    console.log(r.emailBodies.t1);
    if (r.emailPs.t1) {
      console.log(`\n${r.emailPs.t1.startsWith('P.S.') ? r.emailPs.t1 : `P.S. ${r.emailPs.t1}`}`);
    }
    console.log('-'.repeat(70));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  ${composed.length} T1 email(s) above. Copy to Tim for review.`);
  console.log('='.repeat(70) + '\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      limit: { type: 'string', short: 'n' },
      'dry-run': { type: 'boolean', default: false },
      'skip-existing': { type: 'boolean', default: false },
      'skip-research': { type: 'boolean', default: false },
      'skip-composition': { type: 'boolean', default: false },
      'cross-model-judge': { type: 'boolean', default: false },
      'optimize-prompts': { type: 'boolean', default: false },
      touches: { type: 'string', default: '1' },
      verbose: { type: 'boolean', short: 'v', default: false },
      model: { type: 'string', default: 'sonnet' },
      composer: { type: 'string', default: 'full' },
      'lead-type': { type: 'string', default: '' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
  });

  if (values.help || !values.input) {
    console.log(`
ShowRev Premium Pipeline — CLI Orchestrator

Usage:
  npx tsx src/showrev/m1-email-find/run-pipeline.ts --input <csv-file> [options]

Options:
  --input, -i <file>     CSV file with prospects (required)
  --limit, -n <N>        Process only first N rows
  --touches <list>       Comma-separated touch numbers to compose (default: 1)
                         e.g. --touches 1,2,3  or  --touches 1,2
  --dry-run              Print plan but don't write to Supabase
  --skip-existing        Skip prospects already in sr_engine_output
  --skip-research        Skip LLM research (for testing)
  --skip-composition     Run phases 1-4 only (email find + research + substrate +
                         pattern selection). Writes research fields to Supabase,
                         skips composition/judge/microsite.
  --cross-model-judge    Enable 5-model cross-model judge panel (needs ≥2 API keys)
  --optimize-prompts     Run dspy.ts prompt optimization before pipeline
  --verbose, -v          Verbose output
  --model <model>        LLM model: sonnet (default) or opus
  --composer <mode>      Composition: auto (default), lean, or full
  --lead-type <type>     Lead type tag: Cold (P2 cold outreach), Attendee (P1 booth)
  --help, -h             Show this help

CSV format:
  first_name,last_name,company,title,state,email,company_url

Environment variables:
  ANTHROPIC_API_KEY              Required for LLM calls
  SUPABASE_SERVICE_ROLE_KEY      For Supabase reads/writes
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Alternative Supabase key
  NEXT_PUBLIC_SUPABASE_URL       Supabase URL (defaults to production)
  GEMINI_API_KEY                 For cross-model judge (Gemini)
  OPENAI_API_KEY                 For cross-model judge (GPT-5)
  XAI_API_KEY                    For cross-model judge (Grok)
  DEEPSEEK_API_KEY               For cross-model judge (DeepSeek)
`);
    process.exit(values.help ? 0 : 1);
  }

  const parsedTouches = ((values.touches as string) || '1,2,3')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => n >= 1 && n <= 3);

  const config: PipelineConfig = {
    input: values.input as string,
    limit: values.limit ? parseInt(values.limit as string, 10) : undefined,
    dryRun: values['dry-run'] as boolean,
    skipExisting: values['skip-existing'] as boolean,
    skipResearch: values['skip-research'] as boolean,
    skipComposition: values['skip-composition'] as boolean,
    crossModelJudge: values['cross-model-judge'] as boolean,
    optimizePrompts: values['optimize-prompts'] as boolean,
    touches: parsedTouches.length > 0 ? parsedTouches : [1, 2, 3],
    verbose: values.verbose as boolean,
    model: (values.model as string) || 'sonnet',
    composer: ((values.composer as string) || 'full') as 'full' | 'lean' | 'auto',
    leadType: (values['lead-type'] as string) || '',
  };

  // Validate --lead-type
  const VALID_LEAD_TYPES = ['', 'Cold', 'Attendee', 'Scanned'];
  if (config.leadType && !VALID_LEAD_TYPES.includes(config.leadType)) {
    console.error(`Error: --lead-type must be one of: ${VALID_LEAD_TYPES.filter(Boolean).join(', ')}`);
    process.exit(1);
  }

  // Validate input file
  const inputPath = resolve(process.cwd(), config.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Validate env vars
  if (!config.skipResearch && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set. Export it or use --skip-research for testing.');
    process.exit(1);
  }

  // Parse CSV
  console.log('='.repeat(70));
  console.log('  ShowRev Premium Pipeline');
  console.log('='.repeat(70));

  const csvContent = readFileSync(inputPath, 'utf-8');
  let rows = parseCSV(csvContent);
  console.log(`\n  Input: ${inputPath}`);
  console.log(`  Rows parsed: ${rows.length}`);

  if (config.limit && config.limit < rows.length) {
    rows = rows.slice(0, config.limit);
    console.log(`  Limited to: ${rows.length} (--limit ${config.limit})`);
  }

  const runId = generateRunId();
  console.log(`  Run ID: ${runId}`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Composer: ${config.composer}`);
  if (config.dryRun) console.log('  Mode: DRY RUN');
  if (config.skipComposition) console.log('  Mode: SKIP COMPOSITION (phases 1-4 only)');
  if (config.skipResearch) console.log('  Mode: SKIP RESEARCH');
  if (config.skipExisting) console.log('  Mode: SKIP EXISTING');
  if (config.touches.length < 3) console.log(`  Touches: ${config.touches.join(', ')} only`);
  if (config.crossModelJudge) console.log('  Cross-model judge: ENABLED');

  // Pre-loop: Prompt Optimizer (compile optimized composer if requested)
  if (config.optimizePrompts) {
    console.log('\n  Pre-loop: Prompt optimization...');
    try {
      const { optimizeEmailComposer } = await import('./prompt-optimizer.js');
      const optResult = await optimizeEmailComposer();
      console.log(`  -> Compiled from ${optResult.trainSize} examples, saved to ${optResult.savedTo}`);
    } catch (err: any) {
      console.log(`  -> Prompt optimization failed (non-blocking): ${err.message?.slice(0, 80)}`);
    }
  }

  // Seed bounce monitor from prior runs
  const { shouldHalt: checkHalt, seedFromSupabase, getBatchStats } = await import('../deliverability/bounce-monitor.js');
  await seedFromSupabase();
  const seedStats = getBatchStats();
  if (seedStats.total > 0) {
    console.log(`  Bounce monitor seeded: ${seedStats.total} prior sends, ${seedStats.bounced} bounces (${(seedStats.bounceRate * 100).toFixed(1)}%)`);
    const preCheck = checkHalt();
    if (preCheck.shouldHalt) {
      console.error(`\n  🛑 HALT: ${preCheck.reason}`);
      console.error('  Pipeline stopped. Investigate bounces before continuing.');
      process.exit(1);
    }
  }

  // Process each prospect
  const t0 = Date.now();
  const results: PipelineResult[] = [];
  const retryQueue: Array<{ row: ProspectRow; index: number; firstResult: PipelineResult }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check bounce monitor before each prospect
    const haltCheck = checkHalt();
    if (haltCheck.shouldHalt) {
      console.error(`\n  🛑 HALT after ${i} prospects: ${haltCheck.reason}`);
      console.error('  Remaining prospects skipped. Investigate bounces.');
      break;
    }

    // Skip existing if flag set
    if (config.skipExisting) {
      const exists = await checkExisting(row);
      if (exists) {
        console.log(`\n[${i + 1}/${rows.length}] SKIPPING ${row.firstName} ${row.lastName} @ ${row.company} (already in sr_engine_output)`);
        continue;
      }
    }

    const result = await processOneProspect(row, i, rows.length, config, runId);
    results.push(result);

    // Track for retry if transient errors occurred
    const hasTransientError = result.errors.some(e =>
      /connection|fetch failed|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket hang up|503|429/i.test(e)
    );
    if (hasTransientError && result.errors.length > 0) {
      retryQueue.push({ row, index: i, firstResult: result });
    }
  }

  // Retry queue: auto-retry prospects that failed due to transient errors
  if (retryQueue.length > 0) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  AUTO-RETRY: ${retryQueue.length} prospect(s) had transient errors`);
    console.log('='.repeat(70));

    for (const { row, index, firstResult } of retryQueue) {
      console.log(`\n  [RETRY] ${row.firstName} ${row.lastName} @ ${row.company} (errors: ${firstResult.errors.length})`);
      try {
        const retryResult = await processOneProspect(row, index, rows.length, config, runId);

        // If retry succeeded better (fewer errors or has emails now), replace the first result
        if (retryResult.errors.length < firstResult.errors.length || (retryResult.emailBodies.t1 && !firstResult.emailBodies.t1)) {
          const origIdx = results.indexOf(firstResult);
          if (origIdx >= 0) results[origIdx] = retryResult;
          console.log(`  [RETRY] SUCCESS — replaced original result (${firstResult.errors.length} errors → ${retryResult.errors.length})`);
        } else {
          // Retry also failed — flag for operator review
          console.log(`  [RETRY] FAILED AGAIN — flagging for operator review`);
          await writeFailureFlag(row, runId, firstResult, retryResult);
        }
      } catch (err: any) {
        console.log(`  [RETRY] FATAL: ${err.message?.slice(0, 80)} — flagging for operator review`);
        await writeFailureFlag(row, runId, firstResult, null);
      }
    }
  }

  // Phase 10: Summary report + telemetry
  const totalDuration = Date.now() - t0;
  printSummary(results, runId, totalDuration);
  writeTelemetryReport(results, runId, totalDuration);
  printEmails(results);
}

main().catch(err => {
  console.error('\nPipeline fatal error:', err.message || err);
  process.exit(1);
});
