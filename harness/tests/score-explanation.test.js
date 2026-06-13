import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoreExplanation } from '../lib/score-explanation.js';

test('buildScoreExplanation prefers LLM explanation field', () => {
  const explanation = buildScoreExplanation(
    {
      worker: 'llm',
      explanation: 'This post cites primary sources and adds analysis beyond the headline.',
      reasons: ['cites sources'],
    },
    'llm'
  );

  assert.equal(
    explanation,
    'This post cites primary sources and adds analysis beyond the headline.'
  );
});

test('buildScoreExplanation synthesizes heuristic prose from reasons', () => {
  const explanation = buildScoreExplanation(
    {
      worker: 'heuristic',
      reasons: ['high information density', 'citation or source reference'],
    },
    'heuristic'
  );

  assert.equal(
    explanation,
    'Heuristic scoring: high information density; citation or source reference.'
  );
});

test('buildScoreExplanation falls back to joined LLM reasons', () => {
  const explanation = buildScoreExplanation(
    {
      worker: 'llm',
      reasons: ['borderline signal', 'no citations'],
    },
    'llm'
  );

  assert.equal(explanation, 'borderline signal. no citations.');
});
