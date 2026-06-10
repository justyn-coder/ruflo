#!/usr/bin/env node
// Env health check — confirms canonical .env is at project root and all
// expected keys are present. Run any time: `node scripts/check-env.mjs`.
// See CLAUDE.md "Env file canonical location" for the consolidation policy.

import { config as loadEnv } from 'dotenv';
import { realpathSync, lstatSync, readlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const canonical = resolve(root, '.env');

const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'APOLLO_API_KEY',
  'MILLIONVERIFIER_API_KEY',
  'FINDYMAIL_API_KEY',
  'HUNTER_API_KEY',
  'HUBSPOT_TOKEN_INORSA_PROD',
  'HUBSPOT_PRIVATE_APP_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'BRAVE_SEARCH_API_KEY',
  'EXA_API_KEY',
  'ZEROBOUNCE_API_KEY',
];

// Operator expects these but they may still be gaps — warn, do not fail.
// VERCEL_TOKEN intentionally NOT here — Vercel auth lives at
//   ~/Library/Application Support/com.vercel.cli/auth.json (CLI session)
// + the Vercel MCP server (OAuth via claude.ai connection).
// Add VERCEL_TOKEN here only if a script starts calling the Vercel REST API
// directly without `vercel` CLI / MCP.
const EXPECTED_BUT_OPTIONAL = [];

const MIRROR_PATHS = [
  'src/showrev/.env',
  'src/showrev/m1-email-find/.env',
];

let failed = false;
const warn = (m) => console.log(`\x1b[33m⚠\x1b[0m ${m}`);
const fail = (m) => { console.log(`\x1b[31m✗\x1b[0m ${m}`); failed = true; };
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);

// 1. Canonical .env exists at project root.
if (!existsSync(canonical)) {
  fail(`canonical .env missing at ${canonical}`);
  process.exit(1);
}
ok(`canonical .env at project root`);

// 2. Mirror paths resolve back to canonical.
for (const rel of MIRROR_PATHS) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    warn(`${rel} does not exist (pipeline path may not need it, but flagging)`);
    continue;
  }
  const stat = lstatSync(p);
  const isSym = stat.isSymbolicLink();
  const real = realpathSync(p);
  if (real !== canonical) {
    fail(`${rel} does not resolve to canonical (got ${real})`);
  } else if (!isSym) {
    warn(`${rel} is a real file equal to canonical (should be a symlink for one-source-of-truth)`);
  } else {
    ok(`${rel} → ${readlinkSync(p)} (resolves to canonical)`);
  }
}

// 3. Required keys present.
loadEnv({ path: canonical });
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  fail(`missing required keys: ${missing.join(', ')}`);
} else {
  ok(`all ${REQUIRED.length} required keys present`);
}

// 4. Optional keys (warnings only).
const missingOptional = EXPECTED_BUT_OPTIONAL.filter((k) => !process.env[k]);
if (missingOptional.length) {
  warn(`expected-but-optional keys missing: ${missingOptional.join(', ')}`);
}

process.exit(failed ? 1 : 0);
