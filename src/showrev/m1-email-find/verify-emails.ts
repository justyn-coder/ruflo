#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { importProspects, type Prospect } from './importer.js';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '../../../data/showrev');
const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..');
const API_BASE = 'https://app.findymail.com/api';

function loadApiKey(): string {
  if (process.env.FINDYMAIL_API_KEY) return process.env.FINDYMAIL_API_KEY;
  if (process.env.FINDYMAIL_API_KEY_RUFLO3) return process.env.FINDYMAIL_API_KEY_RUFLO3;
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^FINDYMAIL_API_KEY=(.+)$/);
      if (match) return match[1].trim();
    }
  }
  return '';
}
const API_KEY = loadApiKey();

interface VerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'error';
  provider?: string;
  prospectId: string;
  prospectName: string;
  company: string;
  raw?: any;
}

async function verifyEmail(email: string): Promise<{ status: string; provider?: string; raw?: any }> {
  const key = process.env.FINDYMAIL_API_KEY_RUFLO3 || process.env.FINDYMAIL_API_KEY_RUFLO2 || process.env.FINDYMAIL_API_KEY || API_KEY;
  if (!key) {
    throw new Error('No Findymail API key found. Set FINDYMAIL_API_KEY_RUFLO3 or FINDYMAIL_API_KEY env var.');
  }

  const response = await fetch(`${API_BASE}/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      console.log(`  [RATE LIMITED] Waiting 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      return verifyEmail(email);
    }
    throw new Error(`Findymail API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const verified = data.verified;
  let status: string;
  if (verified === true) status = 'valid';
  else if (verified === false) status = 'invalid';
  else status = 'unknown';
  return {
    status,
    provider: data.provider,
    raw: data,
  };
}

async function verifyBatch(prospects: Prospect[], options: { dryRun?: boolean; delayMs?: number } = {}): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const delayMs = options.delayMs || 500;

  console.log('\n=== Email Verification (Findymail) ===');
  console.log(`Prospects to verify: ${prospects.length}`);
  console.log(`Dry run: ${options.dryRun || false}\n`);

  for (const p of prospects) {
    const display = `${p.firstName} ${p.lastName} <${p.email}>`;

    if (options.dryRun) {
      console.log(`  [DRY] ${display}`);
      results.push({
        email: p.email,
        status: 'unknown',
        prospectId: p.id,
        prospectName: `${p.firstName} ${p.lastName}`,
        company: p.company,
      });
      continue;
    }

    try {
      const verification = await verifyEmail(p.email);
      const status = verification.status as VerificationResult['status'];
      const icon = status === 'valid' ? '✓' : status === 'invalid' ? '✗' : status === 'catch_all' ? '~' : '?';

      console.log(`  ${icon} ${display} → ${status}${verification.provider ? ` (${verification.provider})` : ''}`);

      results.push({
        email: p.email,
        status,
        provider: verification.provider,
        prospectId: p.id,
        prospectName: `${p.firstName} ${p.lastName}`,
        company: p.company,
        raw: verification.raw,
      });

      await new Promise(r => setTimeout(r, delayMs));
    } catch (error: any) {
      console.log(`  ✗ ${display} → ERROR: ${error.message}`);
      results.push({
        email: p.email,
        status: 'error',
        prospectId: p.id,
        prospectName: `${p.firstName} ${p.lastName}`,
        company: p.company,
      });
    }
  }

  // Summary
  const valid = results.filter(r => r.status === 'valid').length;
  const invalid = results.filter(r => r.status === 'invalid').length;
  const catchAll = results.filter(r => r.status === 'catch_all').length;
  const unknown = results.filter(r => r.status === 'unknown').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log('\n=== Verification Summary ===');
  console.log(`  Valid:     ${valid} (safe to send)`);
  console.log(`  Invalid:   ${invalid} (DO NOT SEND — will bounce)`);
  console.log(`  Catch-all: ${catchAll} (domain accepts all — can't verify individual address)`);
  console.log(`  Unknown:   ${unknown} (verification inconclusive)`);
  console.log(`  Errors:    ${errors} (API errors)`);

  if (invalid > 0) {
    console.log('\n  ⚠ INVALID EMAILS (remove before sending):');
    for (const r of results.filter(r => r.status === 'invalid')) {
      console.log(`    ${r.prospectName} <${r.email}> @ ${r.company}`);
    }
  }

  // Save results
  const outPath = resolve(BASE_DIR, 'email-verification-results.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({
    verifiedAt: new Date().toISOString(),
    total: results.length,
    summary: { valid, invalid, catchAll, unknown, errors },
    results,
  }, null, 2));
  console.log(`\nResults saved to: ${outPath}`);

  return results;
}

// CLI
const args = process.argv.slice(2);
const csvPath = args.find(a => a.endsWith('.csv')) || resolve(BASE_DIR, 'fiber-connect-2026-booth-scans.csv');
const tiers = (args.find(a => a.startsWith('--tiers='))?.split('=')[1] || 'A,B,C,D').split(',');
const dryRun = args.includes('--dry-run');
const singleEmail = args.find(a => a.startsWith('--email='))?.split('=')[1];

if (singleEmail) {
  console.log(`Verifying single email: ${singleEmail}`);
  verifyEmail(singleEmail).then(r => {
    console.log(`Result: ${JSON.stringify(r, null, 2)}`);
  });
} else {
  const importResult = importProspects(csvPath);
  const prospects = tiers.flatMap(t => importResult.byTier[t] || []);
  console.log(`Loaded ${prospects.length} prospects from tiers: ${tiers.join(', ')}`);
  verifyBatch(prospects, { dryRun });
}
