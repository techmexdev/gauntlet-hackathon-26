import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichDecisionRow,
  extractAgentReasons,
  buildCascadeMetaFromStored,
  resolveCascadeMeta,
} from '../lib/decision-enrich.js';

test('extractAgentReasons strips system and guardrail codes', () => {
  assert.deepEqual(
    extractAgentReasons(['SCORE_BELOW_THRESHOLD', 'engagement bait', 'no citations'], 'HIDE'),
    ['engagement bait', 'no citations']
  );
  assert.deepEqual(extractAgentReasons(['GUARDRAIL_TOO_SHORT'], 'BLOCK'), []);
});

test('enrichDecisionRow adds policy label and agent reasons', () => {
  const enriched = enrichDecisionRow({
    bundleId: 'b-1',
    sessionId: 's-1',
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD', 'engagement bait'],
    signalScore: 39,
    category: 'engagement_bait',
    worker: 'heuristic',
    decidedAt: '2026-06-13T12:00:00.000Z',
  });

  assert.match(enriched.policyLabel, /39.*40/);
  assert.deepEqual(enriched.agentReasons, ['engagement bait']);
  assert.equal(enriched.cascadeMeta.heuristic_score, 39);
  assert.equal(enriched.cascadeMeta.llm_invoked, false);
});

test('buildCascadeMetaFromStored rebuilds LLM disagreement from checkpoint output', () => {
  const meta = buildCascadeMetaFromStored(
    {
      action: 'HIDE',
      signalScore: 39,
      worker: 'llm',
      reasonCodes: ['SCORE_BELOW_THRESHOLD'],
    },
    {
      worker: 'llm',
      signal_score: 39,
      disagreement: { heuristic: 47, llm: 39, delta: 8 },
    }
  );

  assert.equal(meta.heuristic_score, 47);
  assert.equal(meta.llm_invoked, true);
  assert.equal(meta.disagreement_delta, 8);
});

test('resolveCascadeMeta rebuilds from stored agent output when cascade result is missing', () => {
  const meta = resolveCascadeMeta(
    null,
    { action: 'HIDE', signalScore: 39, worker: 'llm' },
    {
      worker: 'llm',
      signal_score: 39,
      disagreement: { heuristic: 47, llm: 39, delta: 8 },
    }
  );

  assert.equal(meta.llm_invoked, true);
  assert.equal(meta.heuristic_score, 47);
});
