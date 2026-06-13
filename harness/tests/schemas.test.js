import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../lib/schemas.js';

const validPost = {
  bundle_id: 'b-001',
  session_id: 's-001',
  ingest_source: 'live',
  author_handle: 'alice',
  text: 'Markets rallied after the Fed announcement.',
  content_hash: 'abc123',
  captured_at: '2026-06-13T12:00:00.000Z',
};

const validAgentOutput = {
  signal_score: 72,
  category: 'news',
  reasons: ['cites primary source', 'information dense'],
  confidence: 0.85,
  escalate: false,
};

test('valid normalized post passes schema validation', () => {
  const { valid, errors } = validate('normalized-post', validPost);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('agent output missing confidence fails schema validation', () => {
  const { valid } = validate('agent-output', {
    signal_score: 50,
    category: 'analysis',
    reasons: ['test'],
    escalate: false,
  });
  assert.equal(valid, false);
});

test('decision enum rejects unknown action values', () => {
  const { valid } = validate('decision', {
    bundle_id: 'b-001',
    session_id: 's-001',
    action: 'MAYBE',
    reason_codes: ['TEST'],
    signal_score: 50,
    category: 'news',
    decided_at: '2026-06-13T12:00:00.000Z',
  });
  assert.equal(valid, false);
});

test('valid agent output passes schema validation', () => {
  const { valid } = validate('agent-output', validAgentOutput);
  assert.equal(valid, true);
});

test('valid BLOCK decision passes schema validation', () => {
  const { valid } = validate('decision', {
    bundle_id: 'b-001',
    session_id: 's-001',
    action: 'BLOCK',
    reason_codes: ['GUARDRAIL_TOO_SHORT'],
    signal_score: null,
    category: null,
    decided_at: '2026-06-13T12:00:00.000Z',
    author_handle: 'bait_bot',
    text_snippet: 'hi',
  });
  assert.equal(valid, true);
});

test('valid decision passes schema validation', () => {
  const { valid } = validate('decision', {
    bundle_id: 'b-001',
    session_id: 's-001',
    action: 'SHOW',
    reason_codes: ['SCORE_ABOVE_THRESHOLD'],
    signal_score: 72,
    category: 'news',
    decided_at: '2026-06-13T12:00:00.000Z',
    worker: 'heuristic',
  });
  assert.equal(valid, true);
});

test('valid alarm passes schema validation', () => {
  const { valid } = validate('alarm', {
    alarm_id: 'a-001',
    session_id: 's-001',
    type: 'high_block_rate',
    severity: 'warning',
    message: 'Block rate exceeded 80%',
    recommended_action: 'Review guardrail thresholds',
    created_at: '2026-06-13T12:00:00.000Z',
  });
  assert.equal(valid, true);
});
