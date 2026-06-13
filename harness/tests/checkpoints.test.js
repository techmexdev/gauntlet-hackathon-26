import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckpoint } from '../pipeline/checkpoints.js';

test('invalid category enum fails CP-3', () => {
  const result = runCheckpoint('CP-3', {
    normalized: { bundle_id: 'b', session_id: 's' },
    agentOutput: {
      signal_score: 50,
      category: 'invalid_cat',
      reasons: ['test'],
      confidence: 0.8,
      escalate: false,
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.reasonCode, 'INVALID_CATEGORY');
});

test('checkpoint failure includes reason without crashing', () => {
  const result = runCheckpoint('CP-3', {
    normalized: { bundle_id: 'b', session_id: 's' },
    agentOutput: {
      signal_score: 150,
      category: 'news',
      reasons: ['test'],
      confidence: 0.8,
      escalate: false,
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.reasonCode, 'INVALID_SCORE');
});
