import Anthropic from '@anthropic-ai/sdk';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY not set. Export it before running the pipeline:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface LLMCallOptions {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  label?: string;
  cacheableSystemContent?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callLLM(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const {
    model = 'claude-sonnet-4-6',
    maxTokens = 8192,
    timeoutMs = 300000,
    label = 'llm-call',
    cacheableSystemContent,
  } = options;

  const anthropic = getClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const systemBlocks: Anthropic.MessageCreateParams['system'] = [];

      if (cacheableSystemContent) {
        systemBlocks.push({
          type: 'text' as const,
          text: cacheableSystemContent,
          cache_control: { type: 'ephemeral' as const },
        });
      }

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      if (!text.trim()) {
        throw new Error('Empty response from API');
      }

      return text.trim();
    } catch (err: any) {
      lastError = err;

      const status = err?.status || err?.error?.status;
      const isRateLimit = status === 429;
      const isOverloaded = status === 529 || status === 503;
      const isTimeout = err.name === 'AbortError' || err.code === 'ETIMEDOUT';

      if (attempt < MAX_RETRIES) {
        const delayMs = isRateLimit
          ? BASE_DELAY_MS * Math.pow(3, attempt)
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const reason = isRateLimit ? 'rate-limit' : isOverloaded ? 'overloaded' : isTimeout ? 'timeout' : 'error';
        console.log(`  │  ⚠ ${label} attempt ${attempt}/${MAX_RETRIES} failed (${reason}), retrying in ${Math.round(delayMs / 1000)}s...`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'unknown error'}`);
}

let brainCacheContent: string | null = null;

export function setBrainCacheContent(content: string): void {
  brainCacheContent = content;
}

export function getBrainCacheContent(): string | null {
  return brainCacheContent;
}

export async function callLLMWithBrainCache(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  return callLLM(prompt, {
    ...options,
    cacheableSystemContent: brainCacheContent || options.cacheableSystemContent,
  });
}
