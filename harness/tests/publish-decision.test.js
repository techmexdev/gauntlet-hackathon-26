import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextSnippet,
  buildDecisionEventPayload,
  publishDecision,
  TEXT_SNIPPET_LENGTH,
} from '../lib/publish-decision.js';
import { validate } from '../lib/schemas.js';
import { COMMIT_BRANCH } from '../lib/commit-rationale.js';

test('buildTextSnippet truncates long text', () => {
  const long = 'a'.repeat(TEXT_SNIPPET_LENGTH + 10);
  const snippet = buildTextSnippet(long);
  assert.equal(snippet.length, TEXT_SNIPPET_LENGTH + 1);
  assert.ok(snippet.endsWith('…'));
});

test('buildDecisionEventPayload includes observability fields for HIDE', () => {
  const payload = buildDecisionEventPayload({
    sessionId: 's-1',
    normalized: {
      bundle_id: 'b-1',
      author_handle: 'alice',
      text: 'Markets rallied after the Fed announcement.',
    },
    decision: {
      action: 'HIDE',
      reasonCodes: ['SCORE_BELOW_THRESHOLD'],
      signalScore: 22,
      category: 'engagement_bait',
      worker: 'heuristic',
      decidedAt: '2026-06-13T12:00:00.000Z',
    },
    agentReasons: ['engagement bait'],
  });

  assert.equal(payload.author_handle, 'alice');
  assert.equal(payload.text_snippet, 'Markets rallied after the Fed announcement.');
  assert.equal(payload.worker, 'heuristic');
  assert.deepEqual(payload.reason_codes, ['SCORE_BELOW_THRESHOLD']);
  assert.deepEqual(payload.agent_reasons, ['engagement bait']);
});

test('BLOCK decision with null score passes schema validation', () => {
  const payload = buildDecisionEventPayload({
    sessionId: 's-1',
    normalized: {
      bundle_id: 'b-1',
      author_handle: 'bait_bot',
      text: 'hi',
    },
    decision: {
      action: 'BLOCK',
      reasonCodes: ['GUARDRAIL_TOO_SHORT'],
      signalScore: null,
      category: null,
      decidedAt: '2026-06-13T12:00:00.000Z',
    },
  });

  const { valid, errors } = validate('decision', payload);
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(payload.signal_score, null);
  assert.equal(payload.category, null);
});

test('buildDecisionEventPayload includes policy and cascade metadata', () => {
  const payload = buildDecisionEventPayload({
    sessionId: 's-1',
    normalized: { bundle_id: 'b-1', author_handle: 'alice', text: 'Hello' },
    decision: {
      action: 'HIDE',
      reasonCodes: ['SCORE_BELOW_THRESHOLD'],
      signalScore: 39,
      category: 'noise',
      worker: 'llm',
      decidedAt: '2026-06-13T12:00:00.000Z',
    },
    agentOutput: { confidence: 0.55, escalate: true, explanation: 'Low substance and no verifiable sources.' },
    cascadeResult: {
      heuristicResult: { signal_score: 47 },
      llmInvoked: true,
      latencyMs: 100,
      output: { worker: 'llm', signal_score: 39, disagreement: { heuristic: 47, llm: 39, delta: 8 } },
    },
    agentReasons: ['low density', 'no citations'],
  });

  assert.match(payload.policy_label, /39.*40/);
  assert.equal(payload.cascade_meta.heuristic_score, 47);
  assert.equal(payload.cascade_meta.llm_invoked, true);
  assert.equal(payload.confidence, 0.55);
  assert.equal(payload.escalate, true);
  assert.deepEqual(payload.agent_reasons, ['low density', 'no citations']);
  assert.equal(payload.score_explanation, 'Low substance and no verifiable sources.');
});

test('buildDecisionEventPayload includes commit branch and rationale', () => {
  const payload = buildDecisionEventPayload({
    sessionId: 's-1',
    normalized: { bundle_id: 'b-1', author_handle: 'alice', text: 'Hello' },
    decision: {
      action: 'SHOW',
      reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
      signalScore: 62,
      category: 'news',
      worker: 'heuristic',
      decidedAt: '2026-06-13T12:00:00.000Z',
      commitBranch: COMMIT_BRANCH.SCORE_ABOVE_THRESHOLD,
      commitRationale: { show_threshold: 40, likes: 0, guardrail_passed: true },
    },
    agentOutput: { confidence: 0.9, escalate: false },
    agentReasons: ['solid signal'],
  });

  assert.equal(payload.commit_branch, COMMIT_BRANCH.SCORE_ABOVE_THRESHOLD);
  assert.equal(payload.commit_rationale.show_threshold, 40);
  assert.equal(payload.confidence, 0.9);
  assert.equal(payload.escalate, false);

  const { valid, errors } = validate('decision', payload);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('publishDecision emits on event bus', () => {
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };

  publishDecision(eventBus, {
    sessionId: 's-1',
    normalized: { bundle_id: 'b-1', author_handle: 'alice', text: 'Hello world' },
    decision: {
      action: 'HIDE',
      reasonCodes: ['SCORE_BELOW_THRESHOLD'],
      signalScore: 10,
      category: 'noise',
      worker: 'llm',
      decidedAt: '2026-06-13T12:00:00.000Z',
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'decision');
  assert.equal(events[0].data.author_handle, 'alice');
});
