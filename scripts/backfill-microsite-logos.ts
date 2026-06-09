/**
 * Backfill company_logo_url for sr_microsites rows that are missing logos.
 *
 * Strategy: derive domain from prospect email if available, else from
 * company name → guess domain. Run resolveCompanyLogo waterfall
 * (logo.dev → Clearbit → CompanyEnrich → Hunter → UpLead). First valid
 * PNG/SVG wins. Logo.dev is PNG-default + transparent background.
 *
 * Usage:
 *   npx tsx scripts/backfill-microsite-logos.ts [--dry-run] [--verbose] [--limit N]
 *
 * Operator request 2026-06-09: 76 of 76 sr_microsites rows are missing logos.
 * Microsite page uses logos so this backfill is high-value.
 */

import { resolve, dirname } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(new URL(import.meta.url).pathname);
loadEnv({ path: resolve(__dirname, '../src/showrev/m1-email-find/.env') });

import { resolveCompanyLogo } from '../src/showrev/m1-email-find/logo-resolver.js';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slttpknnuthbttjuzrnz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function guessDomainFromCompany(company: string): string | null {
  if (!company) return null;
  // Strip suffixes, normalize to lowercase, replace spaces with no separator
  const clean = company
    .toLowerCase()
    .replace(/\s+(inc|llc|corp|corporation|incorporated|cooperative|coop|co|ltd|limited|company)\.?$/i, '')
    .replace(/[,&'']/g, '')
    .replace(/\s+/g, '');
  return clean ? `${clean}.com` : null;
}

interface MicrositeRow {
  slug: string;
  company_name: string;
  prospect_id: string;
}

async function fetchMissingLogos(limit: number): Promise<MicrositeRow[]> {
  const url = `${SB_URL}/rest/v1/sr_microsites?select=slug,company_name,prospect_id&or=(company_logo_url.is.null,company_logo_url.eq.)&limit=${limit}`;
  const res = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`fetch missing logos failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<MicrositeRow[]>;
}

async function tryFindEmailDomain(prospectId: string): Promise<string | null> {
  const url = `${SB_URL}/rest/v1/sr_engine_output?select=email&prospect_id=eq.${encodeURIComponent(prospectId)}&email=neq.&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ email: string }>;
  if (!rows.length) return null;
  const email = rows[0].email;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : null;
}

async function updateMicrositeLogo(slug: string, url: string): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/sr_microsites?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ company_logo_url: url }),
  });
  return res.ok;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '500', 10) : 500;

  if (!SB_KEY) {
    console.error('ERROR: missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  console.log(`Fetching microsites missing logos (limit ${limit})...`);
  const missing = await fetchMissingLogos(limit);
  console.log(`Found ${missing.length} microsites missing logos`);

  let resolved = 0;
  let failed = 0;
  let domainGuessed = 0;
  let domainFromEmail = 0;

  for (const m of missing) {
    let domain = await tryFindEmailDomain(m.prospect_id);
    if (domain) {
      domainFromEmail++;
    } else {
      domain = guessDomainFromCompany(m.company_name);
      if (domain) domainGuessed++;
    }
    if (!domain) {
      if (verbose) console.log(`  - no domain: ${m.company_name}`);
      failed++;
      continue;
    }

    const logoUrl = await resolveCompanyLogo(domain, { verbose: false });
    if (logoUrl) {
      if (dryRun) {
        console.log(`  ✓ [dry-run] ${m.company_name} (${domain}) → ${logoUrl}`);
      } else {
        const ok = await updateMicrositeLogo(m.slug, logoUrl);
        if (ok) {
          console.log(`  ✓ ${m.company_name} (${domain}) → ${logoUrl.slice(0, 80)}`);
          resolved++;
        } else {
          console.log(`  ✗ DB update failed: ${m.company_name}`);
          failed++;
        }
      }
    } else {
      if (verbose) console.log(`  - no logo found: ${m.company_name} (${domain})`);
      failed++;
    }
  }

  console.log('');
  console.log('--------');
  console.log(`Total processed:      ${missing.length}`);
  console.log(`Domain from email:    ${domainFromEmail}`);
  console.log(`Domain guessed:       ${domainGuessed}`);
  console.log(`Logos resolved:       ${resolved}`);
  console.log(`Failed/no logo:       ${failed}`);
  console.log(`Mode:                 ${dryRun ? 'DRY RUN' : 'LIVE'}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
