/**
 * enrich-substrate-news.ts (2026-06-10)
 *
 * One-shot substrate enrichment for the P2 Cold cohort. Uses Anthropic's
 * built-in web_search tool to surface recent (last 12 months) news, press
 * releases, awards, partnerships, and executive moves per company.
 *
 * Goal: close the gap caught by the Fidium audit — engine had 6 USE_DIRECTLY
 * from Telecompetitor + Broadband Communities, but missed Keene NH award,
 * Katy 2026, Portland Chamber, 145K Texas passings. Those facts live on
 * LinkedIn newsroom + local newspapers + chamber sites.
 *
 * One-shot scope per operator 2026-06-10: project ends in 2 weeks; build once,
 * run once, populate sr_company_evidence, future pipeline runs read existing
 * substrate. No continuous service.
 *
 * Usage:
 *   npx tsx src/showrev/m1-email-find/scripts/enrich-substrate-news.ts            # dry-run
 *   npx tsx src/showrev/m1-email-find/scripts/enrich-substrate-news.ts --live
 *   npx tsx src/showrev/m1-email-find/scripts/enrich-substrate-news.ts --live --limit 10
 *   npx tsx src/showrev/m1-email-find/scripts/enrich-substrate-news.ts --live --only fidium-fiber,blue-ridge-communications
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const LIVE = process.argv.includes('--live');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 1000;
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
const ONLY_COMPANIES = ONLY_ARG ? ONLY_ARG.split(',').map(s => s.toLowerCase().trim()) : null;
const CONCURRENCY = 3;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Source src/showrev/.env first.');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Source src/showrev/.env first.');
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

interface CompanyTarget {
  company_name: string;
  company_normalized: string;
  company_website: string | null;
  state: string | null;
}

interface ExtractedClaim {
  claim: string;
  source_kind: string;          // 'press_release', 'news_article', 'award_announcement', 'company_blog', 'industry_pub', 'newsroom_post'
  source_citation: string;       // full URL or "outlet - URL"
  speaker_name: string | null;
  speaker_role: string | null;
  category: 'company_fact' | 'company_news' | 'leadership_quote' | 'product_launch' | 'partnership' | 'award' | 'expansion';
}

const ENRICHMENT_PROMPT = `You are researching {COMPANY} for fiber-telecom sales outreach. Use the web_search tool to find recent (last 12 months — June 2025 to today) news, press releases, partnerships, awards, executive moves, and product launches for this company.

Search queries to try (search 3-5 of these):
1. "{COMPANY}" press release 2026
2. "{COMPANY}" award 2026
3. "{COMPANY}" announces
4. "{COMPANY}" partnership 2026
5. "{COMPANY}" newsroom
6. "{COMPANY}" expansion fiber
7. "{COMPANY}" leadership change OR new CEO OR new president 2026

Focus on finding CONCRETE, CITABLE facts that would help a fiber-industry AE write a peer-feel email — numbers, dates, real people, real partnerships, real awards.

After your searches, return ONLY a JSON array (no preamble, no markdown fences) of extracted facts in this exact shape:
[
  {
    "claim": "Concrete fact in 1-2 sentences. Include numbers/names/dates where present. e.g. 'Fidium named Gold Winner for Best Internet Provider in The Keene Sentinel Reader's Choice Awards 2026.'",
    "source_kind": "press_release | news_article | award_announcement | company_blog | industry_pub | newsroom_post",
    "source_citation": "Full URL of the source",
    "speaker_name": "Named executive who said it OR null",
    "speaker_role": "Their role OR null",
    "category": "company_fact | company_news | leadership_quote | product_launch | partnership | award | expansion"
  }
]

Rules:
- Only include facts you actually verified via web_search results. Do NOT fabricate.
- Each claim must have a real URL from your search results.
- Prefer recent (2026 > 2025) over older.
- Skip facts already commonly-known about the company (focus on NEW news).
- Max 10 claims per company. Return an empty array [] if no recent verifiable news.
- If a search returns nothing relevant, that's fine — just return [] rather than padding with guesses.

Return ONLY the JSON array, no other text.`;

async function fetchTargets(): Promise<CompanyTarget[]> {
  const url = `${SUPABASE_URL}/rest/v1/sr_prospects?lead_type=eq.Cold&company_website=not.is.null&select=company,company_website,state&order=company`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`fetch targets failed: ${r.status} ${await r.text()}`);
  const rows = (await r.json()) as Array<{ company: string; company_website: string | null; state: string | null }>;
  // Dedupe by normalized company name
  const seen = new Set<string>();
  const targets: CompanyTarget[] = [];
  for (const r of rows) {
    if (!r.company) continue;
    const norm = r.company.toLowerCase().trim().replace(/\s+/g, ' ');
    if (seen.has(norm)) continue;
    seen.add(norm);
    targets.push({
      company_name: r.company,
      company_normalized: norm,
      company_website: r.company_website,
      state: r.state,
    });
  }
  if (ONLY_COMPANIES) {
    return targets.filter(t => ONLY_COMPANIES.some(o => t.company_normalized.includes(o.replace(/-/g, ' '))));
  }
  return targets.slice(0, LIMIT);
}

async function fetchExistingClaimsForCompany(companyName: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/sr_company_evidence?company_name=eq.${encodeURIComponent(companyName)}&select=id`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) return 0;
  return ((await r.json()) as unknown[]).length;
}

async function enrichOne(target: CompanyTarget): Promise<{ company: string; verdict: string; count: number; reason: string }> {
  try {
    const prompt = ENRICHMENT_PROMPT.replace(/\{COMPANY\}/g, target.company_name);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    // Concatenate all text blocks (final assistant reply)
    let final = '';
    for (const block of response.content) {
      if (block.type === 'text') final += block.text;
    }
    final = final.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
    if (!final.startsWith('[')) {
      // Model may have produced explanation before JSON — try to extract
      const m = final.match(/\[[\s\S]*\]/);
      if (m) final = m[0];
    }
    let claims: ExtractedClaim[];
    try {
      claims = JSON.parse(final);
    } catch {
      return { company: target.company_name, verdict: 'parse-err', count: 0, reason: `non-JSON output: ${final.slice(0, 100)}` };
    }
    if (!Array.isArray(claims)) {
      return { company: target.company_name, verdict: 'not-array', count: 0, reason: 'output was not a JSON array' };
    }
    // Filter out garbage / missing fields
    const valid = claims.filter(c =>
      c && typeof c.claim === 'string' && c.claim.length > 20 &&
      typeof c.source_citation === 'string' && c.source_citation.length > 10
    );
    if (valid.length === 0) {
      return { company: target.company_name, verdict: 'no-news', count: 0, reason: 'no verifiable recent news found' };
    }

    if (LIVE) {
      // Map the prompt's granular source_kind to the DB CHECK constraint values.
      // The DB only accepts: substrate, substrate_quoted, web_research, web_research_dated.
      // The original granular source_kind is preserved in metadata.original_source_kind
      // so the composer / portal can still display it. Fix 2026-06-11 (enum mismatch
      // blocked the original 2026-06-10 run from writing any rows).
      const mapSourceKind = (granular: string): string => {
        switch ((granular || '').toLowerCase()) {
          case 'press_release':
          case 'news_article':
          case 'award_announcement':
          case 'industry_pub':
          case 'newsroom_post':
            return 'web_research_dated';
          case 'company_blog':
            return 'web_research';
          default:
            return 'web_research';
        }
      };

      // Map the prompt's granular category to the DB CHECK constraint values.
      // DB accepts: company_fact, industry_context, persona_signal.
      const mapCategory = (granular: string, speakerName: string | null): string => {
        switch ((granular || '').toLowerCase()) {
          case 'leadership_quote':
            return 'persona_signal';
          case 'company_fact':
          case 'company_news':
          case 'product_launch':
          case 'partnership':
          case 'award':
          case 'expansion':
            return 'company_fact';
          default:
            return speakerName ? 'persona_signal' : 'company_fact';
        }
      };

      // Write to sr_company_evidence — append-only, never overwrite existing
      const inserts = valid.map(c => ({
        id: `ev_${Math.random().toString(16).slice(2, 10)}`,
        company_name: target.company_name,
        company_normalized: target.company_normalized,
        claim: c.claim,
        source_kind: mapSourceKind(c.source_kind || 'news_article'),
        source_citation: c.source_citation,
        speaker_name: c.speaker_name || null,
        speaker_role: c.speaker_role || null,
        category: mapCategory(c.category || 'company_news', c.speaker_name || null),
        extracted_at: new Date().toISOString(),
        metadata: {
          enrichment_run: '2026-06-11-news-substrate',
          script: 'enrich-substrate-news',
          original_source_kind: c.source_kind || null,
          original_category: c.category || null,
        },
      }));
      const w = await fetch(`${SUPABASE_URL}/rest/v1/sr_company_evidence`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(inserts),
      });
      if (!w.ok) {
        return { company: target.company_name, verdict: 'write-err', count: 0, reason: `${w.status} ${(await w.text()).slice(0, 100)}` };
      }
      return { company: target.company_name, verdict: 'wrote', count: valid.length, reason: `${valid.length} claims persisted` };
    }
    // Dry-run: print full claims so operator can audit quality before going live.
    console.log(`\n--- ${target.company_name} (${valid.length} claims) ---`);
    for (const c of valid) {
      console.log(`  [${c.category}] ${c.claim}`);
      console.log(`     source: ${c.source_citation}`);
      if (c.speaker_name) console.log(`     speaker: ${c.speaker_name} (${c.speaker_role || '?'})`);
    }
    return { company: target.company_name, verdict: 'would-write', count: valid.length, reason: `${valid.length} claims` };
  } catch (err) {
    return { company: target.company_name, verdict: 'err', count: 0, reason: (err as Error).message.slice(0, 150) };
  }
}

async function runWithConcurrency<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  console.log(`[enrich-news] mode=${LIVE ? 'LIVE' : 'dry-run'} limit=${LIMIT}${ONLY_COMPANIES ? ` only=${ONLY_COMPANIES.join(',')}` : ''} concurrency=${CONCURRENCY}`);
  const targets = await fetchTargets();
  console.log(`[enrich-news] fetched ${targets.length} unique companies with canonical website set`);

  // Show existing claim counts for context
  if (targets.length > 0 && targets.length <= 20) {
    console.log('\nExisting claim counts (sr_company_evidence) for context:');
    for (const t of targets) {
      const n = await fetchExistingClaimsForCompany(t.company_name);
      console.log(`  ${t.company_name.padEnd(40)} = ${n}`);
    }
  }

  console.log('\nRunning enrichment (Anthropic web_search per company)...');
  const results = await runWithConcurrency(targets, CONCURRENCY, enrichOne);

  const buckets = { wrote: 0, 'would-write': 0, 'no-news': 0, 'parse-err': 0, 'not-array': 0, 'write-err': 0, err: 0 } as Record<string, number>;
  let totalClaims = 0;
  for (const r of results) {
    buckets[r.verdict] = (buckets[r.verdict] || 0) + 1;
    totalClaims += r.count;
  }

  console.log('\n=== Verdict counts ===');
  for (const [k, v] of Object.entries(buckets)) {
    if (v > 0) console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log(`  total claims ${LIVE ? 'persisted' : 'would persist'}: ${totalClaims}`);

  // Show writes
  const writes = results.filter(r => r.verdict === 'wrote' || r.verdict === 'would-write');
  if (writes.length > 0) {
    console.log(`\n=== ${LIVE ? 'Wrote' : 'Would write'} (${writes.length} companies) ===`);
    for (const r of writes.slice(0, 30)) {
      console.log(`  ${r.company.padEnd(40)} ${r.count} claims  ${r.reason.slice(0, 80)}`);
    }
    if (writes.length > 30) console.log(`  ... and ${writes.length - 30} more`);
  }

  // Show errors
  const errs = results.filter(r => r.verdict === 'err' || r.verdict === 'parse-err' || r.verdict === 'write-err' || r.verdict === 'not-array');
  if (errs.length > 0) {
    console.log(`\n=== Errors / parse issues (${errs.length}) ===`);
    for (const r of errs) console.log(`  ${r.company}: ${r.verdict} — ${r.reason}`);
  }
}

main().catch(err => {
  console.error('[enrich-news] fatal:', err);
  process.exit(1);
});
