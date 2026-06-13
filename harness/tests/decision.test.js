import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitDecision, SHOW_THRESHOLD } from '../pipeline/decision.js';
import { COMMIT_BRANCH } from '../lib/commit-rationale.js';

const baseOutput = {
  signal_score: 50,
  category: 'analysis',
  reasons: ['test reason'],
  confidence: 0.8,
  escalate: false,
  worker: 'heuristic',
};

test('score 39 → HIDE with policy-only reason codes', () => {
  const decision = commitDecision(
    { engagement: {} },
    { ...baseOutput, signal_score: 39, reasons: ['a', 'b', 'c'] },
    { passed: true }
  );
  assert.equal(decision.action, 'HIDE');
  assert.deepEqual(decision.reasonCodes, ['SCORE_BELOW_THRESHOLD']);
  assert.deepEqual(decision.agentReasons, ['a', 'b', 'c']);
});

test('score 40 → SHOW', () => {
  const decision = commitDecision({ engagement: {} }, { ...baseOutput, signal_score: 40 }, { passed: true });
  assert.equal(decision.action, 'SHOW');
});

test('escalate true → HOLD regardless of score', () => {
  const decision = commitDecision(
    { engagement: {} },
    { ...baseOutput, signal_score: 90, escalate: true },
    { passed: true }
  );
  assert.equal(decision.action, 'HOLD');
  assert.ok(decision.reasonCodes.includes('AGENT_ESCALATION'));
});

test('guardrail block → BLOCK before agent', () => {
  const decision = commitDecision(
    { engagement: {} },
    null,
    { passed: false, reasonCodes: ['GUARDRAIL_TOO_SHORT'] }
  );
  assert.equal(decision.action, 'BLOCK');
  assert.equal(decision.commitBranch, COMMIT_BRANCH.GUARDRAIL_BLOCK);
  assert.equal(decision.commitRationale.guardrail_passed, false);
  assert.deepEqual(decision.reasonCodes, ['GUARDRAIL_TOO_SHORT']);
  assert.equal(decision.agentReasons, undefined);
});

test('score 62 → SCORE_ABOVE_THRESHOLD with rationale threshold', () => {
  const decision = commitDecision(
    { engagement: { likes: 50 } },
    { ...baseOutput, signal_score: 62 },
    { passed: true }
  );
  assert.equal(decision.action, 'SHOW');
  assert.equal(decision.commitBranch, COMMIT_BRANCH.SCORE_ABOVE_THRESHOLD);
  assert.equal(decision.commitRationale.show_threshold, SHOW_THRESHOLD);
  assert.equal(decision.commitRationale.likes, 50);
  assert.equal(decision.commitRationale.guardrail_passed, true);
});

test('low confidence high reach → LOW_CONFIDENCE_HIGH_REACH', () => {
  const decision = commitDecision(
    { engagement: { likes: 15000 } },
    { ...baseOutput, signal_score: 70, confidence: 0.4 },
    { passed: true }
  );
  assert.equal(decision.action, 'HOLD');
  assert.equal(decision.commitBranch, COMMIT_BRANCH.LOW_CONFIDENCE_HIGH_REACH);
  assert.equal(decision.commitRationale.confidence, 0.4);
  assert.equal(decision.commitRationale.likes, 15000);
  assert.deepEqual(decision.agentReasons, ['test reason']);
});
