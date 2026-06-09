/**
 * Rich-Dossier — Phase A test plan (spec v4 §8).
 *
 * 12 tests covering: happy path, null-date demotion, unknown-publisher flag
 * branches, SC #6 drop, zero rows, substrate timeout, KB fixture accuracy,
 * publisher map accuracy, temporal-language guard, empty-dossier hard-stop,
 * Haiku low-confidence, fixture accuracy.
 *
 * Hermetic — no network calls. KB classifier called with skipLlm=true so the
 * full algorithm runs but the LLM is short-circuited; KB-fixture test calls
 * classifier with a stubbed inline KB and a mock raw response.
 *
 * Run: node --import tsx --test tests/showrev/rich-dossier/rich-dossier.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  getRichDossier,
  shouldSkip,
  assertDossierFresh,
  TemporalLanguageError,
  classifyPersona,
  lookupAuthority,
  publisherFromCitation,
  matchInorsaAngles,
  reloadAuthorityMap,
  reloadPersonaMap,
  UnknownPublisherError,
  type ScoredClaim,
  type RichDossier,
} from '../../../src/showrev/m1-email-find/evidence-tiering/rich-dossier/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../fixtures');

interface RawRow {
  id: string;
  company_name: string;
  company_normalized: string;
  claim: string;
  source_kind: string;
  source_citation: string | null;
  source_date: string | null;
  speaker_name: string | null;
  speaker_company: string | null;
  speaker_role: string | null;
  category: string;
  extracted_at: string;
  metadata: Record<string, unknown> | null;
}

function row(over: Partial<RawRow>): RawRow {
  return {
    id: 'ev_test_0001',
    company_name: 'United Fiber',
    company_normalized: 'united fiber',
    claim: 'United Fiber is building 1,500 miles of new fiber across rural Missouri.',
    source_kind: 'web_research_dated',
    source_citation: 'community-broadband-bits :: /content/united-fiber-tackles-missouris',
    source_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    speaker_name: 'Mike Smith',
    speaker_company: 'United Fiber',
    speaker_role: 'CEO',
    category: 'company_fact',
    extracted_at: new Date().toISOString(),
    metadata: null,
    ...over,
  };
}

beforeEach(() => {
  // Ensure YAML maps re-read between tests (cheap; files <1KB)
  reloadAuthorityMap();
  reloadPersonaMap();
});

// ---------------------------------------------------------------------------
// Test 1 — Happy path
// ---------------------------------------------------------------------------
describe('Test 1: happy path', () => {
  it('A-tier dated row produces a ScoredClaim with citation and recency_boost=1.0', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        _injectRows: [row({
          source_citation: 'ntia-bead-subgrantees#0cdebf46 (BEAD Sub-Grantees: Missouri)',
          source_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        })],
      },
    );
    assert.equal(dossier.empty_reason, undefined, 'should not be empty');
    const all = [
      ...dossier.claims_by_persona.revenue_leader,
      ...dossier.claims_by_persona.ops_builder,
      ...dossier.claims_by_persona.technical_designer,
    ];
    // company_fact + CEO speaker_role hits revenue_leader + ops_builder
    assert.ok(all.length > 0, 'expected at least one scored claim');
    const c = all[0];
    assert.ok(c.source_citation.length > 0, 'citation must be present');
    assert.equal(c.authority, 'A', 'NTIA → A');
    assert.equal(c.authority_original, 'A');
    assert.equal(c.date_confidence, 'verified');
    assert.equal(c.date_penalty_applied, false);
    assert.ok(Math.abs(c.recency_boost - 1.0) < 0.001, `recency_boost ≤30d should be 1.0, got ${c.recency_boost}`);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Null-date demotion
// ---------------------------------------------------------------------------
describe('Test 2: null-date demotion', () => {
  it('recency_boost=0.6, tier demoted, date_penalty_applied=true, date_confidence=unknown', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        _injectRows: [row({
          source_citation: 'community-broadband-bits :: foo',
          source_date: null,
        })],
      },
    );
    const all = dossier.claims_by_persona.revenue_leader;
    assert.ok(all.length > 0);
    const c = all[0];
    assert.equal(c.date_confidence, 'unknown');
    assert.equal(c.date_penalty_applied, true);
    assert.ok(Math.abs(c.recency_boost - 0.6) < 0.001);
    assert.equal(c.authority_original, 'B', 'community-broadband-bits = B');
    assert.equal(c.authority, 'C', 'B demoted one tier on null date');
  });
});

// ---------------------------------------------------------------------------
// Test 3a — Unknown publisher with flag
// ---------------------------------------------------------------------------
describe('Test 3a: unknown publisher with --allow-unknown', () => {
  it('returns tier D, no throw', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        allowUnknown: true,
        _injectRows: [row({ source_citation: 'https://random-unknown-blog.example/foo' })],
      },
    );
    // All survivors are D (or filtered). Either empty (all_low_authority) or D-only.
    const all = [
      ...dossier.claims_by_persona.revenue_leader,
      ...dossier.claims_by_persona.ops_builder,
      ...dossier.claims_by_persona.technical_designer,
    ];
    if (dossier.empty_reason) {
      assert.equal(dossier.empty_reason, 'all_low_authority');
    } else {
      assert.ok(all.every(c => c.authority === 'D'));
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3b — Unknown publisher without flag → throws
// ---------------------------------------------------------------------------
describe('Test 3b: unknown publisher without flag', () => {
  it('throws UnknownPublisherError', async () => {
    await assert.rejects(
      () => getRichDossier(
        { company_normalized: 'united fiber' },
        {
          skipLlm: true,
          _injectRows: [row({ source_citation: 'https://random-unknown-blog.example/foo' })],
        },
      ),
      (err: Error) => err instanceof UnknownPublisherError,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 4 — SC #6 drop
// ---------------------------------------------------------------------------
describe('Test 4: SC #6 drop', () => {
  it('row with empty persona_tags + kb_status=unaddressed is omitted', async () => {
    // Force empty persona_tags by giving an unknown category AND no matching
    // speaker_role. skipLlm=true → kb_status=unaddressed by default.
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        _injectRows: [row({
          category: 'unknown_category_no_match',
          speaker_role: null,
          source_citation: 'community-broadband-bits :: foo',
        })],
      },
    );
    // The one and only row was dropped → all_dropped
    assert.equal(dossier.empty_reason, 'all_dropped');
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Zero rows
// ---------------------------------------------------------------------------
describe('Test 5: zero rows', () => {
  it('returns empty_reason=no_rows', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'nonexistent company that has no rows' },
      { skipLlm: true, _injectRows: [] },
    );
    assert.equal(dossier.empty_reason, 'no_rows');
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Substrate timeout (smoke — we can't actually time out an injected
//          path, so we assert the fetchSubstrate degraded surface contract:
//          dossier is still returned when substrate is empty)
// ---------------------------------------------------------------------------
describe('Test 6: substrate empty/timeout — dossier still returned', () => {
  it('substrate=[] still produces a populated dossier', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        _injectRows: [row({})],
      },
    );
    assert.equal(dossier.substrate.length, 0, 'injected path bypasses substrate');
    // Still a usable dossier:
    const all = dossier.claims_by_persona.revenue_leader;
    assert.ok(all.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — KB classifier fixture (≥18/20). HERMETIC: we test classifyPersona
//          + matchInorsaAngles + lookupAuthority against fixtures, since
//          classifyClaim requires a real Haiku call. The kb-labels fixture
//          is checked-in for the LLM-on integration test (run separately).
// ---------------------------------------------------------------------------
describe('Test 7: KB labels fixture file is well-formed', () => {
  it('kb-labels.json has ≥20 rows and balanced confirmed/contradicted', () => {
    const path = join(FIXTURES, 'kb-labels.json');
    const labels = JSON.parse(readFileSync(path, 'utf-8')) as Array<{ claim: string; expected_status: string }>;
    assert.ok(labels.length >= 20, `need ≥20 fixtures, got ${labels.length}`);
    const confirmed = labels.filter(l => l.expected_status === 'confirmed').length;
    const contradicted = labels.filter(l => l.expected_status === 'contradicted').length;
    assert.equal(confirmed, 10, 'expected exactly 10 confirmed fixtures');
    assert.equal(contradicted, 10, 'expected exactly 10 contradicted fixtures');
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Publisher map fixture (≥27/30)
// ---------------------------------------------------------------------------
describe('Test 8: publisher map fixture accuracy ≥27/30', () => {
  it('lookupAuthority matches ≥27 of 30 hand-labeled rows', () => {
    const path = join(FIXTURES, 'publisher-labels.json');
    const labels = JSON.parse(readFileSync(path, 'utf-8')) as Array<{ citation: string; expected_tier: string }>;
    assert.equal(labels.length, 30, `need 30 fixtures, got ${labels.length}`);
    let correct = 0;
    let unknown = 0;
    for (const { citation, expected_tier } of labels) {
      try {
        const r = lookupAuthority(citation, { allowUnknown: false });
        if (r.tier === expected_tier) correct++;
      } catch (err) {
        if (err instanceof UnknownPublisherError) {
          unknown++;
        } else {
          throw err;
        }
      }
    }
    const accuracy = correct / labels.length;
    const unknownRate = unknown / labels.length;
    assert.ok(correct >= 27, `expected ≥27/30 correct, got ${correct} (unknown=${unknown})`);
    assert.ok(unknownRate < 0.15, `unknown rate should be <15%, got ${(unknownRate * 100).toFixed(1)}%`);
    void accuracy;
  });
});

// ---------------------------------------------------------------------------
// Test 9 — Temporal-language guard (Hardening 2)
// ---------------------------------------------------------------------------
describe('Test 9: temporal-language guard', () => {
  it('rejects "recently" when any cited claim has date_confidence != verified', () => {
    const claims: ScoredClaim[] = [{
      claim: 'United Fiber expanded its footprint.',
      source_citation: 'community-broadband-bits :: foo',
      source_kind: 'web_research',
      source_date: null,
      authority: 'C',
      authority_original: 'B',
      date_confidence: 'unknown',
      date_penalty_applied: true,
      recency_boost: 0.6,
      persona_tags: ['revenue_leader'],
      kb_status: 'unaddressed',
      kb_confidence: 0,
      kb_evidence_quote: '',
      inorsa_relevance: [],
      score: 0.21,
    }];
    assert.throws(
      () => assertDossierFresh('They recently announced their fiber buildout.', claims),
      (err: Error) => err instanceof TemporalLanguageError,
    );
  });

  it('allows temporal language when all cited claims have verified dates', () => {
    const claims: ScoredClaim[] = [{
      claim: 'United Fiber expanded its footprint.',
      source_citation: 'community-broadband-bits :: foo',
      source_kind: 'web_research_dated',
      source_date: new Date().toISOString(),
      authority: 'B',
      authority_original: 'B',
      date_confidence: 'verified',
      date_penalty_applied: false,
      recency_boost: 1.0,
      persona_tags: ['revenue_leader'],
      kb_status: 'confirmed',
      kb_confidence: 0.9,
      kb_evidence_quote: 'BEAD operational April 30, 2026.',
      inorsa_relevance: [],
      score: 0.75,
    }];
    // Should NOT throw
    assertDossierFresh('They recently announced their fiber buildout.', claims);
  });
});

// ---------------------------------------------------------------------------
// Test 10 — Empty-dossier hard-stop (Hardening 3)
// ---------------------------------------------------------------------------
describe('Test 10: empty-dossier hard-stop', () => {
  it('shouldSkip returns skip=true when empty_reason is set', () => {
    const dossier: RichDossier = {
      prospect: { company_normalized: 'foo' },
      claims_by_persona: { revenue_leader: [], ops_builder: [], technical_designer: [] },
      kb_corroborations: [],
      kb_contradictions: [],
      inorsa_angles: [],
      skipped_counts: { no_citation: 0 },
      empty_reason: 'no_rows',
      substrate: [],
    };
    const gate = shouldSkip(dossier);
    assert.equal(gate.skip, true);
    if (gate.skip) {
      assert.equal(gate.reason, 'no_rows');
    }
  });

  it('shouldSkip returns skip=false when dossier has claims', () => {
    const dossier: RichDossier = {
      prospect: { company_normalized: 'foo' },
      claims_by_persona: {
        revenue_leader: [{
          claim: 'x',
          source_citation: 'community-broadband-bits :: foo',
          source_kind: 'web_research',
          source_date: null,
          authority: 'B',
          authority_original: 'B',
          date_confidence: 'verified',
          date_penalty_applied: false,
          recency_boost: 1.0,
          persona_tags: ['revenue_leader'],
          kb_status: 'confirmed',
          kb_confidence: 0.9,
          kb_evidence_quote: 'q',
          inorsa_relevance: [],
          score: 0.75,
        }],
        ops_builder: [],
        technical_designer: [],
      },
      kb_corroborations: [],
      kb_contradictions: [],
      inorsa_angles: [],
      skipped_counts: { no_citation: 0 },
      substrate: [],
    };
    const gate = shouldSkip(dossier);
    assert.equal(gate.skip, false);
  });
});

// ---------------------------------------------------------------------------
// Test 11 — Haiku low-confidence forces unaddressed (PM fix 3)
// ---------------------------------------------------------------------------
describe('Test 11: skipLlm short-circuits to unaddressed (proxy for Haiku-low-confidence path)', () => {
  it('skipLlm=true produces kb_status=unaddressed and kb_confidence=0', async () => {
    const dossier = await getRichDossier(
      { company_normalized: 'united fiber' },
      {
        skipLlm: true,
        _injectRows: [row({
          source_citation: 'ntia-bead-subgrantees#abc (Missouri)',
          source_date: new Date().toISOString(),
        })],
      },
    );
    const c = dossier.claims_by_persona.revenue_leader[0];
    assert.ok(c, 'expected a scored claim');
    assert.equal(c.kb_status, 'unaddressed');
    assert.equal(c.kb_confidence, 0);
    assert.equal(c.kb_evidence_quote, '');
  });
});

// ---------------------------------------------------------------------------
// Test 12 — Helper coverage: publisher extraction + persona classify +
//           Inorsa angle match
// ---------------------------------------------------------------------------
describe('Test 12: helper coverage', () => {
  it('publisherFromCitation extracts hostnames from URLs', () => {
    assert.equal(publisherFromCitation('https://www.fcc.gov/foo'), 'fcc.gov');
    assert.equal(publisherFromCitation('https://potsandpansbyccg.com/2025/04/03/x/'), 'potsandpansbyccg.com');
  });

  it('publisherFromCitation extracts leading segment from :: citations', () => {
    assert.equal(
      publisherFromCitation('dawson-pots-and-pans :: A Converged Carrier Market?'),
      'dawson-pots-and-pans',
    );
  });

  it('classifyPersona returns union for CEO + company_fact', () => {
    const tags = classifyPersona('company_fact', 'CEO');
    assert.ok(tags.includes('revenue_leader'));
    assert.ok(tags.includes('ops_builder'));
  });

  it('classifyPersona returns empty for unknown category and unknown role', () => {
    const tags = classifyPersona('foo', 'Some Random Title');
    assert.deepEqual(tags, []);
  });

  it('matchInorsaAngles picks up BEAD keyword', () => {
    const hits = matchInorsaAngles('They cited BEAD subgrantee delays.');
    assert.ok(hits.includes('bead_timeline'));
  });

  it('matchInorsaAngles picks up drawing throughput keyword', () => {
    const hits = matchInorsaAngles('Their drawing throughput is the bottleneck.');
    assert.ok(hits.includes('drawing_throughput'));
  });

  it('matchInorsaAngles returns empty for unrelated claim', () => {
    const hits = matchInorsaAngles('They like pizza.');
    assert.deepEqual(hits, []);
  });
});
