/**
 * Lean Composer — minimal-prompt email composition.
 *
 * Philosophy: give the writer a clean brief and get out of its way.
 * All formatting constraints enforced in post-processing, not in the prompt.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { runMechanicalChecks } from './judge.js';

export interface LeanBrief {
  prospect: {
    firstName: string;
    lastName: string;
    title: string;
    company: string;
  };
  companySummary: string;
  challengerInsight: string;
  talkingPoints: string;
  fitRationale: string;
  boothNotes: string;
  ae: { name: string; email: string };
  touchNumber: 1 | 2 | 3;
  previousSubject?: string;
  micrositeSlug?: string;
}

export interface LeanEmail {
  subject: string;
  body: string;
  ps: string;
  wordCount: number;
  touchNumber: 1 | 2 | 3;
  mechanicalPass: boolean;
  mechanicalFailures: string[];
  recomposeCount: number;
}

function buildLeanPrompt(brief: LeanBrief): string {
  const { prospect, ae, touchNumber } = brief;

  const touchContext =
    touchNumber === 1
      ? `First email after meeting at Fiber Connect 2026 (Gaylord Palms, Kissimmee FL).${brief.boothNotes ? ` You spoke briefly: "${brief.boothNotes}"` : ' You crossed paths at the show.'}`
      : touchNumber === 2
        ? `Second email. Your first email subject was: "${brief.previousSubject || '(unknown)'}". This should feel like a natural follow-up, not a new pitch. Include a secondary CTA: "Or see it live — Inorsa runs weekly Office Hours where the team demos fiber drawing generation and takes questions. 30 minutes, no commitment." Link: https://events.teams.microsoft.com/event/d351d0fb-4db5-4b4e-b627-ace41b7a75c2@1ffe754f-042e-41a2-857b-2ff7c6da0c27`
        : `Third and final email. Short. Direct. Easy to say yes or no to. If this is a fallback for a non-responder, mention Office Hours as a lighter alternative: "If a 1:1 isn't the right fit, our weekly Office Hours might be" with link https://events.teams.microsoft.com/event/d351d0fb-4db5-4b4e-b627-ace41b7a75c2@1ffe754f-042e-41a2-857b-2ff7c6da0c27`;

  return `Write a short sales email from ${ae.name} (Inorsa) to ${prospect.firstName} ${prospect.lastName}, ${prospect.title} at ${prospect.company}.

${touchContext}

About ${prospect.company}: ${brief.companySummary}

The insight to lead with: ${brief.challengerInsight}

Why they're a fit: ${brief.fitRationale}

${brief.talkingPoints ? `Possible angles:\n${brief.talkingPoints}` : ''}

What Inorsa does: automates GIS-to-CAD construction drawing generation. Dramatically faster (~10 min vs hours). Teams get more capacity and more time for their own QC. Does NOT validate inputs or catch errors — speed is the value. Fiber only.

Write the email. Target 78-99 words (hard ceiling 110). MUST open with a specific, verifiable fact about THIS company from the context above (dollar amounts, projects, geography). End with ONE specific diagnostic question about THEIR situation (not "Worth a conversation?" or any generic ask). No fluff, no flattery, no "I hope this finds you well." Do NOT start with "Good meeting you" or any booth reference unless there are specific booth notes above.

Output EXACTLY this format, nothing else — no commentary, no word count, no notes:

Subject: [subject line, under 8 words, specific to their situation]

${prospect.firstName},
[body starts on this line, lowercase first word unless proper noun]

[rest of email body]

${ae.name} | Inorsa | ${ae.email}

${touchNumber <= 2 && brief.micrositeSlug ? `P.S. [one sentence referencing their briefing] https://fiber.inorsa.com/brief/${brief.micrositeSlug}` : ''}`;
}

function executePrompt(prompt: string, model: string = 'sonnet'): string {
  const tmpFile = `/tmp/showrev-lean-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`;
  writeFileSync(tmpFile, prompt);
  try {
    return execSync(
      `cat '${tmpFile}' | claude -p --model ${model}`,
      { encoding: 'utf-8', timeout: 300000, maxBuffer: 1024 * 1024 * 10 }
    ).trim();
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function postProcess(raw: string, brief: LeanBrief): { subject: string; body: string; ps: string } {
  let text = raw;

  // Strip markdown formatting (bold, headers, italic markers)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/^#{1,3}\s+/gm, '');

  // Strip model commentary — aggressive patterns
  text = text.split('\n').filter(line => {
    const t = line.trim();
    if (/^\d+\s+words?\b/i.test(t)) return false;
    if (/^variant\s+[a-c]/i.test(t)) return false;
    if (/^note:/i.test(t)) return false;
    if (/^here'?s?\s+(the|my|an?|your)\s/i.test(t)) return false;
    if (/^(I'?ve|Let me|Below is|This email|The email|Word count)/i.test(t)) return false;
    if (/^---+$/.test(t)) return false;
    if (/^\[?(word count|character count|total|version|draft)/i.test(t)) return false;
    if (/^(Email|Output|Response):?\s*$/i.test(t)) return false;
    return true;
  }).join('\n');

  // Strip everything after sign-off + P.S. block
  const signoffIdx = text.lastIndexOf('| Inorsa |');
  if (signoffIdx > -1) {
    const afterSignoff = text.indexOf('\n', signoffIdx);
    if (afterSignoff > -1) {
      const remainder = text.slice(afterSignoff);
      const psInRemainder = remainder.match(/\n\s*P\.?S\.?\s/i);
      if (psInRemainder) {
        const urlEnd = remainder.indexOf('\n', remainder.indexOf('fiber.inorsa.com', psInRemainder.index!));
        text = text.slice(0, afterSignoff) + (urlEnd > -1 ? remainder.slice(0, urlEnd) : remainder);
      } else {
        text = text.slice(0, afterSignoff);
      }
    }
  }

  // Extract subject — handle many formats (Subject:, **Subject:**, first line if short)
  let subject = '';
  const subjectPatterns = [
    /^(?:\*?\*?Subject\*?\*?|Re|Subj)[:\s]+(.+)/im,
    /^(?:Email\s+)?Subject\s*(?:Line)?[:\s]+(.+)/im,
  ];
  for (const pat of subjectPatterns) {
    const m = text.match(pat);
    if (m) { subject = m[1].trim().replace(/\*\*/g, ''); text = text.replace(m[0], '').trim(); break; }
  }
  // Fallback: if no subject extracted and first line is short (<60 chars, no comma), use it
  if (!subject) {
    const firstLine = text.split('\n')[0].trim();
    if (firstLine.length < 60 && !firstLine.includes(',') && !firstLine.startsWith(brief.prospect.firstName)) {
      subject = firstLine;
      text = text.slice(firstLine.length).trim();
    }
  }
  // Last resort: generate from challenger insight
  if (!subject && brief.challengerInsight) {
    subject = brief.challengerInsight.split(/[.!?]/)[0].trim().split(/\s+/).slice(0, 8).join(' ');
  }

  // Extract P.S. — broader pattern
  let ps = '';
  const psMatch = text.match(/\n\s*P\.?S\.?\s*[.:—,]?\s*(.+(?:\n(?!\n).+)*)/i);
  if (psMatch) {
    ps = psMatch[0].trim();
    text = text.replace(psMatch[0], '').trim();
  }
  // Deduplicate P.S. lines
  if (ps) {
    const psLines = ps.split('\n').filter(Boolean);
    const seen = new Set<string>();
    const deduped = psLines.filter(l => { const k = l.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    ps = deduped.join('\n');
  }

  // Strip signatures (HubSpot adds the real one)
  text = text.replace(/\n\s*\w[\w\s]*\| Inorsa \| \w+@inorsa\.com\s*/g, '').trim();

  // Em-dash/en-dash cleanup (preserve number ranges)
  text = text.replace(/(\d)[–—](\d)/g, '$1-$2');
  text = text.replace(/[—–]/g, ',');
  text = text.replace(/\s+,/g, ',');

  // Salutation join: "Name,\nbody" → "Name, body"
  text = text.replace(/^([A-Z][a-z]+,)\s*\n+\s*/m, '$1 ');

  // Lowercase first word after salutation unless proper noun
  text = text.replace(/^([A-Z][a-z]+, )([A-Z][a-z]+)\b/m, (_, sal, word) => {
    const keep = /^(BEAD|NTIA|GIS|CAD|Most|Every|When|Your|One|Three|Last|The|This|We|You|But|And|If)$/.test(word);
    return keep ? sal + word : sal + word[0].toLowerCase() + word.slice(1);
  });

  // Ensure microsite link in P.S. for T1/T2
  if (brief.touchNumber <= 2 && brief.micrositeSlug && !ps.includes('fiber.inorsa.com')) {
    ps = ps
      ? `${ps}\nhttps://fiber.inorsa.com/brief/${brief.micrositeSlug}`
      : `P.S. Put together an overview for ${brief.prospect.company}: https://fiber.inorsa.com/brief/${brief.micrositeSlug}`;
  }

  if (ps) {
    ps = ps.replace(/[—–]/g, ',').replace(/\s+,/g, ',');
  }
  if (subject) {
    subject = subject.replace(/[—–]/g, ',').replace(/\s+,/g, ',');
  }

  return { subject, body: text, ps };
}

export function composeLean(
  brief: LeanBrief,
  model: string = 'sonnet',
  maxRetries: number = 1,
): LeanEmail {
  const prompt = buildLeanPrompt(brief);

  let bestResult: LeanEmail | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const recomposeHint = bestResult?.mechanicalFailures.length
      ? `\n\nPREVIOUS DRAFT HAD ISSUES — fix these:\n${bestResult.mechanicalFailures.map(f => `- ${f}`).join('\n')}\n`
      : '';

    const raw = executePrompt(prompt + recomposeHint, model);
    const { subject, body, ps } = postProcess(raw, brief);

    const checks = runMechanicalChecks(
      body, subject, ps,
      brief.ae.name, brief.ae.email,
      brief.prospect.firstName,
      brief.micrositeSlug || ''
    );

    const result: LeanEmail = {
      subject,
      body,
      ps,
      wordCount: body.split(/\s+/).length,
      touchNumber: brief.touchNumber,
      mechanicalPass: checks.passed,
      mechanicalFailures: checks.failures,
      recomposeCount: attempt,
    };

    if (checks.passed || attempt === maxRetries) {
      return result;
    }

    bestResult = result;
    console.log(`    ↻ recomposing (${checks.failures.length} failures: ${checks.failures[0]})`);
  }

  return bestResult!;
}

// --- Comparison runner: lean vs current on same prospects ---

export async function runComparison(prospectIds: string[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  for (const pid of prospectIds) {
    const res = await fetch(
      `${url}/rest/v1/sr_engine_output?prospect_id=eq.${pid}&select=prospect_id,first_name,last_name,title,company,company_summary,challenger_insight,intel_talking_points,intel_fit_rationale,assigned_ae,email_body_t1,email_subject_t1,email_ps_t1,intel_next_action`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = await res.json();
    if (!rows.length) { console.log(`  ${pid}: not found`); continue; }

    const row = rows[0];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PROSPECT: ${row.first_name} ${row.last_name} @ ${row.company}`);
    console.log(`${'='.repeat(60)}`);

    // Current email (already composed)
    console.log(`\n--- CURRENT (pipeline) ---`);
    console.log(`Subject: ${row.email_subject_t1}`);
    console.log(`Words: ${(row.email_body_t1 || '').split(/\s+/).length}`);
    console.log(row.email_body_t1);
    if (row.email_ps_t1) console.log(`\n${row.email_ps_t1}`);

    // Lean compose
    const brief: LeanBrief = {
      prospect: { firstName: row.first_name, lastName: row.last_name, title: row.title || '', company: row.company },
      companySummary: row.company_summary || '',
      challengerInsight: row.challenger_insight || '',
      talkingPoints: row.intel_talking_points || '',
      fitRationale: row.intel_fit_rationale || '',
      boothNotes: '',
      ae: { name: row.assigned_ae || 'Tim', email: `${(row.assigned_ae || 'tim').split(' ')[0].toLowerCase()}@inorsa.com` },
      touchNumber: 1,
      micrositeSlug: row.company?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    };

    console.log(`\n--- LEAN (minimal prompt) ---`);
    const lean = composeLean(brief);
    console.log(`Subject: ${lean.subject}`);
    console.log(`Words: ${lean.wordCount}`);
    console.log(lean.body);
    if (lean.ps) console.log(`\n${lean.ps}`);
    console.log(`Mechanical: ${lean.mechanicalPass ? 'PASS' : `FAIL (${lean.mechanicalFailures.join(', ')})`}`);
    if (lean.recomposeCount > 0) console.log(`Recomposed: ${lean.recomposeCount}x`);
  }
}

// CLI
if (process.argv[1]?.includes('lean-composer')) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: new URL('.env', import.meta.url).pathname });

  const ids = process.argv.slice(2).filter(a => a.startsWith('fc2026-'));
  if (!ids.length) {
    console.log('Usage: npx tsx lean-composer.ts fc2026-001 fc2026-002 ...');
    console.log('Compares lean vs current pipeline output for given prospect IDs.');
    process.exit(0);
  }
  await runComparison(ids);
}
