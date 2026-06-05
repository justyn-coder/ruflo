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
  touches: number[];
  verbose: boolean;
  model: string;
  composer: 'full' | 'lean' | 'auto';
}

interface ProspectRow {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  state?: string;
  email?: string;
  companyUrl?: string;
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
  emailFound: string | null;
  emailConfidence: string;
  researchSummary: string;
  semanticVerification: SemanticVerification | null;
  factVerification: FactVerification | null;
  judgeScores: Record<string, number>;
  judgePass: boolean;
  emailSubjects: { t1: string; t2: string; t3: string };
  micrositeSlug: string;
  duration: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// AE territory mapping (mirrored from premium-pipeline.ts)
// ---------------------------------------------------------------------------

const AE_TERRITORY: Record<string, { name: string; email: string }> = {
  east: { name: 'Mike Rutski', email: 'mike@inorsa.com' },
  central: { name: 'Nathan Dunn', email: 'nathan@inorsa.com' },
  west: { name: 'Lucas Spencer', email: 'lucas@inorsa.com' },
};

const STATE_TO_AE: Record<string, string> = {
  CT: 'east', MA: 'east', RI: 'east', NH: 'east', VT: 'east', ME: 'east',
  NY: 'east', NJ: 'east', PA: 'east', DE: 'east', MD: 'east', DC: 'east',
  VA: 'east', WV: 'east', NC: 'east', SC: 'east', GA: 'east', FL: 'east',
  AL: 'east', MS: 'east', TN: 'east', KY: 'east', OH: 'east', IN: 'east', MI: 'east',
  TX: 'central', OK: 'central', KS: 'central', NE: 'central', SD: 'central', ND: 'central',
  MN: 'central', IA: 'central', MO: 'central', AR: 'central', LA: 'central',
  WI: 'central', IL: 'central',
  WA: 'west', OR: 'west', CA: 'west', NV: 'west', AZ: 'west', NM: 'west',
  CO: 'west', UT: 'west', WY: 'west', MT: 'west', ID: 'west', HI: 'west', AK: 'west',
};

function resolveAE(state?: string): { name: string; email: string } {
  const stateKey = state?.toUpperCase().trim() || '';
  const territory = STATE_TO_AE[stateKey];
  if (territory) return AE_TERRITORY[territory];
  return AE_TERRITORY.west; // default to Lucas
}

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

function toSlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Phase runners — each phase wraps in try/catch so failures don't crash pipeline
// ---------------------------------------------------------------------------

async function phaseEmailFind(
  row: ProspectRow,
  verbose: boolean,
): Promise<{ email: string | null; confidence: string }> {
  if (row.email) {
    return { email: row.email, confidence: 'provided' };
  }

  try {
    const { findEmail } = await import('./email-finder/orchestrator.js');

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
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';
        const text = await res.text();
        // Limit to 50KB to avoid memory issues on large pages
        return text.slice(0, 50000);
      } catch {
        return '';
      }
    };

    const result = await findEmail(
      {
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
        title: row.title,
        companyUrl: row.companyUrl,
        state: row.state,
      },
      { searchFn: realSearchFn, fetchFn: realFetchFn, smtpVerify: true },
    );
    return { email: result.email, confidence: result.confidence };
  } catch (err: any) {
    if (verbose) console.log(`    email-find error: ${err.message?.slice(0, 80)}`);
    return { email: null, confidence: 'error' };
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

async function phasePatternSelection(
  row: ProspectRow,
  researchSummary: string,
  model: string,
  verbose: boolean,
): Promise<Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }>> {
  const { buildPatternSelectorPrompt } = await import('./influence.js');
  const { callLLM } = await import('./llm-client.js');

  const enrichedSummary = `Company: ${row.company}. Title: ${row.title}.\n\nResearch findings:\n${researchSummary}`;

  const selections: Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }> = [];

  for (const touchNum of [1, 2, 3] as const) {
    const previousPatterns = selections.map(s => s.pattern) as any[];
    const prompt = buildPatternSelectorPrompt(enrichedSummary, '', row.title, touchNum, previousPatterns);
    if (verbose) console.log(`    T${touchNum} pattern selection...`);

    try {
      const result = await callLLM(prompt, {
        model: model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
        label: `T${touchNum}-pattern`,
      });

      const jsonMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || result.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        selections.push({
          pattern: parsed.pattern || 'challenger_insight',
          challengerInsight: parsed.challengerInsight || '',
          emotionalFrame: parsed.emotionalFrame || 'curiosity',
          rationale: parsed.rationale || '',
          ctaType: parsed.ctaType || 'interest_based',
          psStrategy: parsed.psStrategy || '',
        });
        if (verbose) console.log(`    T${touchNum} -> ${parsed.pattern}`);
        continue;
      }
    } catch {}

    // Fallback
    selections.push({
      pattern: touchNum === 1 ? 'challenger_insight' : touchNum === 2 ? 'curiosity_gap' : 'challenger_insight',
      challengerInsight: '[Fallback - review needed]',
      emotionalFrame: 'curiosity',
      rationale: 'Fallback due to parse error',
      ctaType: touchNum === 1 ? 'interest_based' : touchNum === 2 ? 'soft_time' : 'binary_close',
      psStrategy: 'Microsite link',
    });
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

  for (let i = 0; i < 3; i++) {
    const touchNum = (i + 1) as 1 | 2 | 3;
    const pattern = patterns[i];

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
            boothNotes: '',
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
      const prompt = buildComposerPrompt(
        pattern as any,
        researchSummary,
        { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
        '', // no booth notes
        touchNum,
        i > 0 ? emails[i - 1]?.subject : undefined,
        ae.name,
        ae.email,
        micrositeSlug,
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
          .replace(/[—–]/g, ',');
        cleanBody = cleanBody.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');
        cleanBody = cleanBody.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();

        const cleanSubject = (parsed.subject || '').replace(/[—–]/g, ',');
        let cleanPs = (parsed.ps || '').replace(/[—–]/g, ',');

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
): Promise<{ scores: Record<string, number>; pass: boolean; failures: string[] }> {
  // Phase 1: Mechanical checks (no LLM needed)
  const { runMechanicalChecks, judgeEmail: judgeDimensions } = await import('./judge.js');
  // 5-dimension LLM scorer: research_depth, vp_connection, tone, conciseness, jtbd_alignment

  const allFailures: string[] = [];

  for (const email of emails) {
    const mechanical = runMechanicalChecks(
      email.body, email.subject, email.ps,
      ae.name, ae.email,
      row.firstName, micrositeSlug,
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
  }

  // If mechanical checks fail, don't spend LLM budget on 5-dim scoring
  if (allFailures.length > 0) {
    const t1 = emails.find(e => e.touchNumber === 1);
    return {
      scores: {
        wordCount: (t1?.wordCount ?? 999) <= 88 ? 8 : 4,
        mechanicalPass: 3,
      },
      pass: false,
      failures: allFailures,
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
      aeNotes: '',
      hasAeNotes: false,
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
      const verdict = await judgeDimensions(minimalDossier as any, touch, model);

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
    aeNotes: '',
    hasAeNotes: false,
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
    persona_bucket: '',
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
    research_confidence: '',
    mechanical_check_passed: mechanicalCheck.pass,
    mechanical_check_failures: mechanicalCheck.failures.join('; '),
    created_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(`    [DRY RUN] Would write to sr_engine_output:`);
    console.log(`      ${row.firstName} ${row.lastName} @ ${row.company}`);
    console.log(`      AE: ${ae.name} | T1: ${t1?.pattern} | "${t1?.subject}"`);
    console.log(`      Mechanical: ${mechanicalCheck.pass ? 'PASS' : 'FAIL'}`);
    return true;
  }

  try {
    const res = await fetch(`${sbUrl}/rest/v1/sr_engine_output`, {
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
      if (verbose) console.log(`    Supabase write failed: ${res.status} ${errText.slice(0, 100)}`);
      return false;
    }

    return true;
  } catch (err: any) {
    if (verbose) console.log(`    Supabase write error: ${err.message?.slice(0, 80)}`);
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
    emailFound: row.email || null,
    emailConfidence: row.email ? 'provided' : 'not-attempted',
    researchSummary: '',
    semanticVerification: null,
    factVerification: null,
    judgeScores: {},
    judgePass: false,
    emailSubjects: { t1: '', t2: '', t3: '' },
    micrositeSlug: toSlug(row.company),
    duration: 0,
    errors: [],
  };

  console.log(`\n[${index + 1}/${total}] Processing ${row.company} -- ${row.firstName} ${row.lastName}...`);

  // Phase 1: CSV already parsed; this is per-prospect processing

  // Phase 2: Email Discovery
  if (!row.email) {
    console.log('  Phase 2: Email discovery...');
    try {
      const emailResult = await phaseEmailFind(row, config.verbose);
      result.emailFound = emailResult.email;
      result.emailConfidence = emailResult.confidence;
      if (emailResult.email) {
        row.email = emailResult.email;
        console.log(`  -> Found: ${emailResult.email} (${emailResult.confidence})`);
      } else {
        console.log(`  -> No email found (${emailResult.confidence})`);
      }
    } catch (err: any) {
      errors.push(`email-find: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Email find error: ${err.message?.slice(0, 60)}`);
    }
  } else {
    console.log(`  Phase 2: Email provided (${row.email})`);
  }

  // Phase 3: Research (3-persona STORM)
  let researchResults = { analyst: '', aeProxy: '', techEval: '' };
  if (config.skipResearch) {
    console.log('  Phase 3: Research SKIPPED (--skip-research)');
    result.researchSummary = '[Research skipped]';
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
    } catch (err: any) {
      errors.push(`research: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Research error: ${err.message?.slice(0, 60)}`);
    }
  }

  const researchSummary = Object.values(researchResults).filter(Boolean).join('\n\n');

  // Phase 4: Substrate search
  console.log('  Phase 4: Substrate search...');
  let substrateContext = '';
  try {
    substrateContext = await phaseSubstrateSearch(row, config.verbose);
    if (substrateContext) {
      console.log('  -> Substrate context loaded');
    } else {
      console.log('  -> No substrate matches');
    }
  } catch (err: any) {
    errors.push(`substrate: ${err.message?.slice(0, 80)}`);
  }

  // Phase 4b: Semantic Verification — cross-check research claims against substrate
  let semanticVerification: SemanticVerification | null = null;
  if (!config.skipResearch && researchSummary) {
    console.log('  Phase 4b: Semantic verification...');
    try {
      const { verifyAllClaims } = await import('./semantic-verifier.js');
      const prospectId = `${row.firstName}-${row.lastName}-${row.company}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const verificationReport = await verifyAllClaims(researchSummary, row.company, prospectId);
      semanticVerification = {
        totalClaims: verificationReport.totalClaims,
        verified: verificationReport.verified,
        flagged: verificationReport.unverified,
        overallConfidence: verificationReport.overallConfidence,
        blockers: verificationReport.blockers,
      };
      console.log(`  -> Semantic verification: ${verificationReport.totalClaims} claims checked, ${verificationReport.verified} verified, ${verificationReport.unverified} flagged`);
      if (verificationReport.blockers.length > 0) {
        console.log(`  -> Blockers: ${verificationReport.blockers.join('; ').slice(0, 120)}`);
      }
    } catch (err: any) {
      errors.push(`semantic-verify: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Semantic verification error: ${err.message?.slice(0, 60)}`);
    }
  }
  result.semanticVerification = semanticVerification;

  // Phase 5: Pattern selection (Thompson Sampling fallback to default)
  console.log('  Phase 5: Pattern selection...');
  let patterns: Array<{ pattern: string; challengerInsight: string; emotionalFrame: string; rationale: string; ctaType: string; psStrategy: string }> = [];
  if (config.skipResearch) {
    // Use safe defaults when no research to ground pattern selection
    patterns = [
      { pattern: 'challenger_insight', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Default (no research)', ctaType: 'interest_based', psStrategy: 'Microsite link' },
      { pattern: 'curiosity_gap', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Default (no research)', ctaType: 'soft_time', psStrategy: 'Office Hours' },
      { pattern: 'social_proof', challengerInsight: '', emotionalFrame: 'belonging', rationale: 'Default (no research)', ctaType: 'binary_close', psStrategy: 'Case study' },
    ];
    console.log('  -> Using defaults (research skipped)');
  } else {
    try {
      patterns = await phasePatternSelection(row, researchSummary, config.model, config.verbose);
      console.log(`  -> T1: ${patterns[0]?.pattern}, T2: ${patterns[1]?.pattern}, T3: ${patterns[2]?.pattern}`);
    } catch (err: any) {
      errors.push(`pattern-selection: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Pattern selection error, using defaults`);
      patterns = [
        { pattern: 'challenger_insight', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Fallback', ctaType: 'interest_based', psStrategy: 'Microsite link' },
        { pattern: 'curiosity_gap', challengerInsight: '', emotionalFrame: 'curiosity', rationale: 'Fallback', ctaType: 'soft_time', psStrategy: 'Office Hours' },
        { pattern: 'social_proof', challengerInsight: '', emotionalFrame: 'belonging', rationale: 'Fallback', ctaType: 'binary_close', psStrategy: 'Case study' },
      ];
    }
  }

  // Phase 6: Email composition
  const ae = resolveAE(row.state);
  const micrositeSlug = toSlug(row.company);
  let emails: ComposedEmail[] = [];
  let judgeResult = { scores: {} as Record<string, number>, pass: false, failures: [] as string[] };
  let microsite = { headline: '', insightText: '', caseStudy: '' };

  if (config.skipComposition) {
    // --skip-composition: phases 1-4 only, skip 6/7/8
    console.log('  Phase 6-8: SKIPPED (--skip-composition)');
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
        config.composer, config.model, config.verbose,
      );
      // Filter to only requested touches
      emails = allEmails.filter(e => config.touches.includes(e.touchNumber));
      console.log(`  -> ${emails.length} touches composed`);

      // Word count safety net: recompose with lean if any touch exceeds 88 words
      const { composeLean } = await import('./lean-composer.js');
      for (let idx = 0; idx < emails.length; idx++) {
        const email = emails[idx];
        const wc = email.body.split(/\s+/).filter(Boolean).length;
        if (wc > 88) {
          console.log(`  -> WARNING: T${email.touchNumber} has ${wc} words (limit 88), recomposing with lean...`);
          try {
            const lean = composeLean(
              {
                prospect: { firstName: row.firstName, lastName: row.lastName, title: row.title, company: row.company },
                companySummary: researchSummary.slice(0, 1500),
                challengerInsight: patterns[email.touchNumber - 1]?.challengerInsight || '',
                talkingPoints: patterns[email.touchNumber - 1]?.rationale || '',
                fitRationale: patterns[email.touchNumber - 1]?.emotionalFrame || '',
                boothNotes: '',
                ae,
                touchNumber: email.touchNumber as 1 | 2 | 3,
                previousSubject: email.touchNumber > 1 ? emails.find(e => e.touchNumber === email.touchNumber - 1)?.subject : undefined,
                micrositeSlug,
              },
              config.model === 'opus' ? 'opus' : 'sonnet',
            );
            emails[idx] = {
              touchNumber: email.touchNumber,
              subject: lean.subject,
              body: lean.body,
              ps: lean.ps,
              wordCount: lean.wordCount,
              pattern: email.pattern,
            };
            console.log(`  -> T${email.touchNumber} recomposed (${lean.wordCount} words)`);
          } catch (err: any) {
            console.log(`  -> T${email.touchNumber} lean recompose failed: ${err.message?.slice(0, 60)}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`composition: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Composition error: ${err.message?.slice(0, 60)}`);
    }

    result.emailSubjects = {
      t1: emails.find(e => e.touchNumber === 1)?.subject || '',
      t2: emails.find(e => e.touchNumber === 2)?.subject || '',
      t3: emails.find(e => e.touchNumber === 3)?.subject || '',
    };

    // Phase 6b: Fact Verification — check composed email claims via web search
    let factVerification: FactVerification | null = null;
    if (emails.length > 0) {
      console.log('  Phase 6b: Fact verification...');
      try {
        const { verifyClaimsWithWebSearch: verifyFacts } = await import('./verify-facts.js');
        const { callLLM: verifyCallLLM } = await import('./llm-client.js');

        // Verify claims in T1 body (primary touch, most claim-dense)
        const t1 = emails.find(e => e.touchNumber === 1);
        if (t1 && t1.body && t1.body !== '[Composition error]') {
          const factResult = await verifyFacts(t1.body, row.company, verifyCallLLM);
          const unsafeForEmail = factResult.verified
            .filter(c => !c.safeForEmail)
            .map(c => `${c.claimType}: "${c.claim.slice(0, 50)}" — ${c.discrepancy || 'unverified'}`);

          factVerification = {
            totalClaims: factResult.verified.length,
            verified: factResult.verified.filter(c => c.verified).length,
            unverified: factResult.verified.filter(c => !c.verified).length,
            summary: factResult.summary,
            unsafeForEmail,
          };
          console.log(`  -> Fact verification: ${factResult.summary}`);
          if (unsafeForEmail.length > 0) {
            console.log(`  -> Unsafe for email: ${unsafeForEmail.length} claim(s) flagged`);
          }
        }
      } catch (err: any) {
        errors.push(`fact-verify: ${err.message?.slice(0, 80)}`);
        console.log(`  -> Fact verification error: ${err.message?.slice(0, 60)}`);
      }
    }
    result.factVerification = factVerification;

    // Phase 7: Judge gate
    console.log('  Phase 7: Judge gate...');
    try {
      judgeResult = await phaseJudge(emails, row, ae, micrositeSlug, config.verbose, config.model, researchSummary);
      result.judgeScores = judgeResult.scores;
      result.judgePass = judgeResult.pass;
      console.log(`  -> ${judgeResult.pass ? 'PASS' : 'FAIL'}${judgeResult.failures.length > 0 ? ` (${judgeResult.failures.length} failures)` : ''}`);
    } catch (err: any) {
      errors.push(`judge: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Judge error: ${err.message?.slice(0, 60)}`);
    }

    // Phase 8: Microsite content
    console.log('  Phase 8: Microsite content...');
    try {
      microsite = await phaseMicrosite(
        row, runId, micrositeSlug, ae,
        patterns[0]?.challengerInsight || '', researchSummary, '',
      );
      console.log(`  -> "${microsite.headline.slice(0, 50)}..."`);
    } catch (err: any) {
      errors.push(`microsite: ${err.message?.slice(0, 80)}`);
      console.log(`  -> Microsite error: ${err.message?.slice(0, 60)}`);
    }
  }
  result.micrositeSlug = micrositeSlug;

  // Phase 9: Supabase write
  console.log('  Phase 9: Supabase write...');
  try {
    const written = await phaseSupabaseWrite(
      row, runId, emails, ae, micrositeSlug, researchSummary,
      { pass: judgeResult.pass, failures: judgeResult.failures },
      patterns, { headline: microsite.headline, insightText: microsite.insightText },
      config.dryRun, config.verbose,
    );
    if (!config.dryRun) {
      console.log(`  -> ${written ? 'Written to Supabase' : 'Supabase write failed (non-blocking)'}`);
    }
  } catch (err: any) {
    errors.push(`supabase: ${err.message?.slice(0, 80)}`);
    console.log(`  -> Supabase error: ${err.message?.slice(0, 60)}`);
  }

  result.duration = Date.now() - t0;
  result.errors = errors;
  console.log(`  Done (${(result.duration / 1000).toFixed(1)}s, ${errors.length} errors)`);

  return result;
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
    const emailStatus = r.emailFound ? `Y (${r.emailConfidence.slice(0, 3)})` : 'N';
    const judgeStatus = r.judgePass ? 'PASS' : 'FAIL';
    const t1 = r.emailSubjects.t1.slice(0, 30) || '[none]';
    console.log(`  ${name.padEnd(25)}${company.padEnd(20)}${emailStatus.padEnd(8)}${judgeStatus.padEnd(8)}${t1}`);
  }

  // Aggregate stats
  console.log('\n  ' + '-'.repeat(66));
  const total = results.length;
  const emailsFound = results.filter(r => r.emailFound).length;
  const judgePass = results.filter(r => r.judgePass).length;
  const avgDuration = total > 0 ? results.reduce((s, r) => s + r.duration, 0) / total : 0;
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  console.log(`\n  Total processed: ${total}`);
  console.log(`  Emails found:    ${emailsFound}/${total} (${total > 0 ? Math.round(emailsFound / total * 100) : 0}%)`);
  console.log(`  Judge pass rate:  ${judgePass}/${total} (${total > 0 ? Math.round(judgePass / total * 100) : 0}%)`);
  console.log(`  Avg per prospect: ${(avgDuration / 1000).toFixed(1)}s`);
  console.log(`  Total duration:   ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Total errors:     ${totalErrors}`);

  if (totalErrors > 0) {
    console.log('\n  Errors:');
    for (const r of results) {
      if (r.errors.length > 0) {
        console.log(`    ${r.prospect.firstName} ${r.prospect.lastName}: ${r.errors.join('; ')}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
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
      touches: { type: 'string', default: '1,2,3' },
      verbose: { type: 'boolean', short: 'v', default: false },
      model: { type: 'string', default: 'sonnet' },
      composer: { type: 'string', default: 'auto' },
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
  --touches <list>       Comma-separated touch numbers to compose (default: 1,2,3)
                         e.g. --touches 1  or  --touches 1,2
  --dry-run              Print plan but don't write to Supabase
  --skip-existing        Skip prospects already in sr_engine_output
  --skip-research        Skip LLM research (for testing)
  --skip-composition     Run phases 1-4 only (email find + research + substrate +
                         pattern selection). Writes research fields to Supabase,
                         skips composition/judge/microsite.
  --verbose, -v          Verbose output
  --model <model>        LLM model: sonnet (default) or opus
  --composer <mode>      Composition: auto (default), lean, or full
  --help, -h             Show this help

CSV format:
  first_name,last_name,company,title,state,email,company_url

Environment variables:
  ANTHROPIC_API_KEY              Required for LLM calls
  SUPABASE_SERVICE_ROLE_KEY      For Supabase reads/writes
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Alternative Supabase key
  NEXT_PUBLIC_SUPABASE_URL       Supabase URL (defaults to production)
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
    touches: parsedTouches.length > 0 ? parsedTouches : [1, 2, 3],
    verbose: values.verbose as boolean,
    model: (values.model as string) || 'sonnet',
    composer: ((values.composer as string) || 'auto') as 'full' | 'lean' | 'auto',
  };

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

  // Process each prospect
  const t0 = Date.now();
  const results: PipelineResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

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
  }

  // Phase 10: Summary report
  const totalDuration = Date.now() - t0;
  printSummary(results, runId, totalDuration);
}

main().catch(err => {
  console.error('\nPipeline fatal error:', err.message || err);
  process.exit(1);
});
