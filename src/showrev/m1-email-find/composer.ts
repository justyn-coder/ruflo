// DEPRECATED: Use premium-pipeline.ts instead. This v1 pipeline uses single-agent
// research and template-style composition. The premium pipeline uses 3-persona STORM
// research, influence pattern selection, and anti-AI-tell composition (v3 format).

import { Dossier } from './researcher.js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface EmailTouch {
  touchNumber: 1 | 2 | 3;
  subject: string;
  body: string;
  sendDelay: string;
}

export interface ComposedEmail {
  prospectId: string;
  prospectName: string;
  company: string;
  touches: EmailTouch[];
  composedAt: string;
}

function buildComposePrompt(dossier: Dossier, touchNumber: 1 | 2 | 3): string {
  const prospect = dossier.prospect;
  const boothNote = prospect.aeNotes
    ? `The AE met this person at the booth and noted: "${prospect.aeNotes}"`
    : 'No AE booth notes available — reference the booth visit generally.';

  const touchGuidance: Record<number, string> = {
    1: `TOUCH 1 — Warm re-engagement (send ASAP)
- Open with booth-visit reference: "Great connecting at Fiber Connect" or similar
- ${prospect.aeNotes ? 'Reference what the AE discussed with them at the booth' : 'Reference their booth visit generally'}
- Bridge to ONE specific p/g/JTBD finding from the research
- Connect that finding to ONE Inorsa capability
- Close with low-friction next step (not "let me know if you want to chat")
- Tone: peer-to-peer, not salesy. Like a colleague following up after meeting at a conference.`,

    2: `TOUCH 2 — Deeper angle (send T1 + 5 days)
- Do NOT repeat Touch 1 framing
- Lead with a DIFFERENT angle on their JTBD (industry trend, competitive pressure, regulatory deadline)
- Share a specific insight about their situation that demonstrates research depth
- Connect to a DIFFERENT Inorsa capability than Touch 1
- Direct meeting ask: propose a specific format ("15-minute call to show you X")
- Tone: consultative, showing you understand their world`,

    3: `TOUCH 3 — Final direct touch (send T2 + 5 days)
- Shortest of the three. 3-4 sentences max.
- Acknowledge you've reached out twice
- One sentence restating the core value connection
- Simple binary close: "Worth a 15-minute look, or not the right time?"
- Tone: respectful, direct, easy to say yes or no to`,
  };

  return `You are writing a post-show follow-up email for a B2B fiber optics tradeshow (Fiber Connect 2026, May 18-19, Gaylord Palms Resort, Kissimmee FL).

## Rules (non-negotiable)
- Under 80 words. Count them. If over, cut.
- No flattery openers ("I hope this finds you well", "It was a pleasure", "I enjoyed our conversation")
- No corporate jargon ("synergize", "leverage", "innovative solution", "cutting-edge")
- One specific question per email the recipient would actually want to answer
- Subject line: specific to their situation, not salesy. Under 8 words.
- Sign off as the AE team at Inorsa (not as AI, not as ShowRev)

## ${touchGuidance[touchNumber]}

## Prospect
- Name: ${prospect.firstName} ${prospect.lastName}
- Title: ${prospect.title}
- Company: ${dossier.company.name || prospect.company}
- What they do: ${dossier.company.description || 'fiber optics industry'}
- AE booth interaction: ${boothNote}

## Research findings
- Persona bucket: ${dossier.jtbd.personaBucket}
- Primary JTBD: ${dossier.jtbd.primaryJTBD}
- VP connection: ${dossier.jtbd.vpConnection}
- Key signals: ${dossier.company.keySignals?.join('; ') || 'none identified'}
- BEAD status: ${dossier.company.beadStatus || 'unknown'}
- Evidence: ${dossier.jtbd.supportingEvidence?.join('; ') || 'limited'}

## Inorsa capabilities (reference only what's relevant)
- AI-powered fiber drawing generation from GIS/CAD data
- Permit-ready construction drawings at scale
- FTTH and long-haul network design automation
- Engineering time reduction from weeks to hours
- Quality output matching PE-stamp requirements

## Output format (JSON only, no markdown)
{
  "subject": "",
  "body": "",
  "wordCount": 0
}`;
}

export async function composeEmails(
  dossier: Dossier,
  model: string = 'sonnet',
  dryRun: boolean = false
): Promise<ComposedEmail | null> {
  const touches: EmailTouch[] = [];

  for (const touchNum of [1, 2, 3] as const) {
    const prompt = buildComposePrompt(dossier, touchNum);

    if (dryRun) {
      console.log(`  [DRY RUN] Would compose T${touchNum} for ${dossier.prospect.firstName} ${dossier.prospect.lastName}`);
      continue;
    }

    try {
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      const result = execSync(
        `claude -p --model ${model} --max-budget-usd 0.10 --output-format json '${escapedPrompt}'`,
        { encoding: 'utf-8', timeout: 60000, maxBuffer: 1024 * 1024 * 5 }
      );

      let parsed: any;
      try {
        const jsonResponse = JSON.parse(result);
        const content = jsonResponse.result || jsonResponse.content || result;
        const jsonMatch = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null;
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : (typeof content === 'object' ? content : JSON.parse(content));
      } catch {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      }

      if (parsed?.subject && parsed?.body) {
        touches.push({
          touchNumber: touchNum,
          subject: parsed.subject,
          body: parsed.body,
          sendDelay: touchNum === 1 ? 'ASAP' : touchNum === 2 ? 'T1 + 5 days' : 'T2 + 5 days',
        });
        console.log(`  ✓ T${touchNum}: "${parsed.subject}" (${parsed.wordCount || '?'} words)`);
      }
    } catch (error: any) {
      console.error(`  [ERROR] T${touchNum} composition failed: ${error.message}`);
    }
  }

  if (dryRun || touches.length === 0) return null;

  const composed: ComposedEmail = {
    prospectId: dossier.prospectId,
    prospectName: `${dossier.prospect.firstName} ${dossier.prospect.lastName}`,
    company: dossier.company.name || dossier.prospect.company,
    touches,
    composedAt: new Date().toISOString(),
  };

  return composed;
}

export async function composeBatch(
  dossiers: Dossier[],
  options: { model?: string; outputDir?: string; dryRun?: boolean } = {}
): Promise<ComposedEmail[]> {
  const model = options.model || 'sonnet';
  const outputDir = options.outputDir || resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev/emails');
  const dryRun = options.dryRun || false;
  const composed: ComposedEmail[] = [];

  console.log(`\n=== Email Composer ===`);
  console.log(`Dossiers to compose for: ${dossiers.length}`);
  console.log(`Model: ${model}`);
  console.log(`Output: ${outputDir}\n`);

  for (const dossier of dossiers) {
    if (dossier.revisedTier === 'E') {
      console.log(`  [SKIP] ${dossier.prospect.firstName} ${dossier.prospect.lastName} — Tier E`);
      continue;
    }

    console.log(`Composing 3 touches for ${dossier.prospect.firstName} ${dossier.prospect.lastName} @ ${dossier.company.name || dossier.prospect.company}...`);
    const email = await composeEmails(dossier, model, dryRun);

    if (email) {
      composed.push(email);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        resolve(outputDir, `${dossier.prospectId}-emails.json`),
        JSON.stringify(email, null, 2)
      );
    }
  }

  console.log(`\n=== Composition Complete ===`);
  console.log(`Emails composed: ${composed.length}/${dossiers.length}`);
  console.log(`Total touches: ${composed.reduce((sum, e) => sum + e.touches.length, 0)}`);

  return composed;
}
