import { configureLM, ChainOfThought, BootstrapFewShot, type Example } from 'dspy.ts';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev');

interface EmailExample {
  dossierSummary: string;
  pattern: string;
  prospectName: string;
  company: string;
  touchNumber: string;
  aeNotes: string;
  subject: string;
  body: string;
  ps: string;
  wordCount: string;
}

function loadTrainingExamples(): Example[] {
  const outputDir = resolve(BASE_DIR, 'premium/output');
  if (!existsSync(outputDir)) return [];

  const files = readdirSync(outputDir).filter(f => f.endsWith('-output.json'));
  const examples: Example[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(outputDir, file), 'utf-8'));
      const prospect = data.prospect;
      const research = [
        data.personaFindings?.analyst || '',
        data.personaFindings?.aeProxy || '',
        data.personaFindings?.techEval || '',
      ].join('\n\n').slice(0, 2000);

      for (const email of data.emails || []) {
        if (!email.body || email.body.includes('[Parse error')) continue;

        examples.push({
          input: {
            dossierSummary: research,
            pattern: email.pattern?.pattern || 'challenger_insight',
            prospectName: `${prospect.firstName} ${prospect.lastName}`,
            company: prospect.company,
            touchNumber: String(email.touchNumber),
            aeNotes: prospect.aeNotes || '',
          },
          output: {
            subject: email.subject,
            body: email.body,
            ps: email.ps || '',
            wordCount: String(email.wordCount),
          },
        });
      }
    } catch {}
  }

  return examples;
}

function emailMetric(input: any, output: any): number {
  const body = output.body || '';
  const wordCount = body.split(/\s+/).length;

  let score = 0.5;

  if (wordCount <= 80) score += 0.15;
  else if (wordCount <= 88) score += 0.05;
  else score -= 0.2;

  if (!/\bI'm curious\b/i.test(body) && !/\bHappy to\b/i.test(body)) score += 0.1;
  if (body.includes('—') || body.includes('–')) score -= 0.15;
  if (output.subject && output.subject.split(/\s+/).length <= 8) score += 0.1;

  const firstLine = body.split('\n')[0]?.trim() || '';
  if (firstLine.endsWith(',') && !firstLine.includes(' ')) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

export async function initAnthropicLM(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required for prompt optimization');
  }

  const { AnthropicLM, CachingLM } = await import('dspy.ts');
  const lm = new AnthropicLM({
    apiKey,
    model: 'claude-sonnet-4-6',
  });
  await lm.init();
  configureLM(new CachingLM(lm));
}

export function createEmailComposerModule() {
  return new ChainOfThought<
    { dossierSummary: string; pattern: string; prospectName: string; company: string; touchNumber: string; aeNotes: string },
    { subject: string; body: string; ps: string; wordCount: string }
  >({
    name: 'ShowRevEmailComposer',
    signature: {
      inputs: [
        { name: 'dossierSummary', type: 'string', required: true },
        { name: 'pattern', type: 'string', required: true },
        { name: 'prospectName', type: 'string', required: true },
        { name: 'company', type: 'string', required: true },
        { name: 'touchNumber', type: 'string', required: true },
        { name: 'aeNotes', type: 'string', required: false },
      ],
      outputs: [
        { name: 'subject', type: 'string', required: true },
        { name: 'body', type: 'string', required: true },
        { name: 'ps', type: 'string', required: true },
        { name: 'wordCount', type: 'string', required: true },
      ],
    },
  });
}

export async function optimizeEmailComposer(): Promise<{
  optimizedModule: any;
  trainSize: number;
  savedTo: string;
}> {
  await initAnthropicLM();

  const trainset = loadTrainingExamples();
  console.log(`Loaded ${trainset.length} training examples from scale test output`);

  if (trainset.length < 3) {
    throw new Error(`Need at least 3 training examples, found ${trainset.length}. Run the pipeline first.`);
  }

  const composer = createEmailComposerModule();

  const optimizer = new BootstrapFewShot(emailMetric, {
    maxLabeledDemos: 3,
    maxBootstrappedDemos: 2,
    minScore: 0.6,
  });

  console.log('Compiling optimized email composer...');
  const optimized = await optimizer.compile(composer, trainset);

  const savePath = resolve(BASE_DIR, 'premium/optimized-composer.json');
  writeFileSync(savePath, JSON.stringify({
    compiledAt: new Date().toISOString(),
    trainSize: trainset.length,
    metric: 'emailMetric (wordCount + antiTell + format)',
    optimizer: 'BootstrapFewShot',
    config: { maxLabeledDemos: 3, maxBootstrappedDemos: 2, minScore: 0.6 },
  }, null, 2));

  console.log(`Optimized composer compiled from ${trainset.length} examples`);
  console.log(`Saved to: ${savePath}`);

  return { optimizedModule: optimized, trainSize: trainset.length, savedTo: savePath };
}

if (process.argv[1]?.includes('prompt-optimizer')) {
  const cmd = process.argv[2] || 'optimize';

  switch (cmd) {
    case 'optimize':
      optimizeEmailComposer()
        .then(r => console.log(`Done. ${r.trainSize} examples compiled.`))
        .catch(e => console.error(`Failed: ${e.message}`));
      break;

    case 'examples':
      const examples = loadTrainingExamples();
      console.log(`Found ${examples.length} training examples`);
      for (const ex of examples.slice(0, 3)) {
        console.log(`  ${(ex.input as any).prospectName} @ ${(ex.input as any).company} — T${(ex.input as any).touchNumber} — ${(ex.output as any).subject}`);
      }
      break;

    default:
      console.log(`
Prompt Optimizer — dspy.ts integration

Usage:
  npx tsx prompt-optimizer.ts optimize   Compile optimized email composer from scale test data
  npx tsx prompt-optimizer.ts examples   List available training examples
`);
  }
}
