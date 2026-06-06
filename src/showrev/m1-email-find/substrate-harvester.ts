import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUBSTRATE_DIR = resolve(__dirname, '../../../data/brain/substrate');

// --- Doug Dawson's POTs and PANs blog (WordPress REST API) ---
async function harvestDawson(maxPages: number = 999): Promise<number> {
  const dir = resolve(SUBSTRATE_DIR, 'dawson-pots-and-pans');
  mkdirSync(dir, { recursive: true });

  let page = 1;
  let total = 0;
  const progressFile = resolve(dir, '_progress.json');
  let startPage = 1;
  if (existsSync(progressFile)) {
    const progress = JSON.parse(readFileSync(progressFile, 'utf-8'));
    startPage = (progress.lastPage || 0) + 1;
    total = progress.total || 0;
    console.log(`  Resuming from page ${startPage} (${total} posts already harvested)`);
  }
  page = startPage;

  while (page <= maxPages) {
    const url = `https://potsandpansbyccg.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,link,date,content,excerpt`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 400) break;
        console.log(`  Page ${page}: HTTP ${res.status}, stopping`);
        break;
      }
      const posts: any[] = await res.json();
      if (!posts.length) break;

      for (const post of posts) {
        const text = stripHtml(post.content?.rendered || '');
        const title = stripHtml(post.title?.rendered || '');
        if (!text || text.length < 100) continue;

        const entry = {
          source: 'dawson-pots-and-pans',
          url: post.link,
          title,
          date: post.date?.slice(0, 10),
          content: text,
          charCount: text.length,
        };

        const filename = `${post.date?.slice(0, 10)}-${post.id}.json`;
        writeFileSync(resolve(dir, filename), JSON.stringify(entry, null, 2));
        total++;
      }

      console.log(`  Page ${page}: ${posts.length} posts (${total} total)`);
      writeFileSync(progressFile, JSON.stringify({ lastPage: page, total }));
      page++;
      await sleep(500);
    } catch (err: any) {
      console.log(`  Page ${page} error: ${err.message?.slice(0, 60)}`);
      break;
    }
  }

  console.log(`\nDawson harvest complete: ${total} posts in ${dir}`);
  return total;
}

// --- Community Broadband Bits (scrape episode listing + transcripts) ---
async function harvestCBB(maxEpisodes: number = 999): Promise<number> {
  const dir = resolve(SUBSTRATE_DIR, 'community-broadband-bits');
  mkdirSync(dir, { recursive: true });

  const baseUrl = 'https://communitynetworks.org';
  let total = 0;
  let pageNum = 0;

  const progressFile = resolve(dir, '_progress.json');
  if (existsSync(progressFile)) {
    const progress = JSON.parse(readFileSync(progressFile, 'utf-8'));
    total = progress.total || 0;
    pageNum = progress.lastListPage || 0;
    console.log(`  Resuming from list page ${pageNum} (${total} episodes already harvested)`);
  }

  while (total < maxEpisodes) {
    const listUrl = pageNum === 0
      ? `${baseUrl}/broadbandbits`
      : `${baseUrl}/broadbandbits?page=${pageNum}`;

    const res = await fetch(listUrl, { redirect: 'follow' });
    if (!res.ok) break;
    const html = await res.text();

    const episodeLinks = [...html.matchAll(/href="(\/content\/[^"]*community-broadband[^"]*)"/g)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i);

    if (!episodeLinks.length) break;

    for (const path of episodeLinks) {
      if (total >= maxEpisodes) break;
      const epUrl = `${baseUrl}${path}`;
      const filename = path.replace(/^\/content\//, '').replace(/[^a-z0-9-]/g, '-').slice(0, 80) + '.json';
      if (existsSync(resolve(dir, filename))) { total++; continue; }

      try {
        const epRes = await fetch(epUrl);
        if (!epRes.ok) continue;
        const epHtml = await epRes.text();

        const titleMatch = epHtml.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const title = titleMatch ? stripHtml(titleMatch[1]) : path;

        const bodyMatch = epHtml.match(/<div[^>]*class="[^"]*field-name-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
        const body = bodyMatch ? stripHtml(bodyMatch[1]) : '';

        if (body.length < 200) {
          const allText = stripHtml(epHtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
          const entry = { source: 'community-broadband-bits', url: epUrl, title, content: allText.slice(0, 15000), charCount: allText.length };
          writeFileSync(resolve(dir, filename), JSON.stringify(entry, null, 2));
        } else {
          const entry = { source: 'community-broadband-bits', url: epUrl, title, content: body, charCount: body.length };
          writeFileSync(resolve(dir, filename), JSON.stringify(entry, null, 2));
        }
        total++;
      } catch {}
      await sleep(300);
    }

    console.log(`  List page ${pageNum}: ${episodeLinks.length} episodes found (${total} total)`);
    writeFileSync(progressFile, JSON.stringify({ lastListPage: pageNum, total }));
    pageNum++;
    await sleep(500);
  }

  console.log(`\nCBB harvest complete: ${total} episodes in ${dir}`);
  return total;
}

// --- Helpers ---
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// --- CLI ---
if (process.argv[1]?.includes('substrate-harvester')) {
  const source = process.argv[2] || 'help';
  const limit = parseInt(process.argv[3] || '999');

  switch (source) {
    case 'dawson':
      harvestDawson(limit).catch(err => { console.error('Failed:', err.message); process.exit(1); });
      break;
    case 'cbb':
      harvestCBB(limit).catch(err => { console.error('Failed:', err.message); process.exit(1); });
      break;
    case 'all':
      (async () => {
        console.log('=== Harvesting Doug Dawson POTs and PANs ===');
        await harvestDawson(limit);
        console.log('\n=== Harvesting Community Broadband Bits ===');
        await harvestCBB(limit);
        console.log('\n=== DONE ===');
      })().catch(err => { console.error('Failed:', err.message); process.exit(1); });
      break;
    default:
      console.log(`
Substrate Harvester — scrape first-party industry sources for Brain

Usage:
  npx tsx substrate-harvester.ts dawson [limit]    Scrape Doug Dawson's blog
  npx tsx substrate-harvester.ts cbb [limit]       Scrape Community Broadband Bits
  npx tsx substrate-harvester.ts all [limit]       Scrape all sources

Output: data/brain/substrate/{source}/*.json
Resumable — tracks progress in _progress.json per source.
`);
  }
}
