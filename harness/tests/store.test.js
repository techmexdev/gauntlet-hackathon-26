import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';

let store;

before(() => {
  store = createStore(':memory:');
});

after(() => {
  store.close();
});

test('insert bundle with stable bundle_id; replay run references same id', () => {
  store.createSession({ sessionId: 's-live', mode: 'live' });
  store.createSession({ sessionId: 's-replay', mode: 'replay', tapeId: 'demo-v1' });

  const normalized = {
    bundle_id: 'b-stable-001',
    session_id: 's-live',
    ingest_source: 'live',
    author_handle: 'alice',
    text: 'Test post',
    content_hash: 'hash-001',
    captured_at: '2026-06-13T12:00:00.000Z',
  };

  store.insertBundle({
    bundleId: 'b-stable-001',
    sessionId: 's-live',
    contentHash: 'hash-001',
    normalized,
    ingestSource: 'live',
  });

  const replayBundle = store.getBundle('b-stable-001');
  assert.equal(replayBundle.bundleId, 'b-stable-001');
  assert.equal(replayBundle.normalized.text, 'Test post');

  store.insertCheckpointRun({
    bundleId: 'b-stable-001',
    sessionId: 's-replay',
    stage: 'CP-0',
    status: 'passed',
  });

  const runs = store.getCheckpointRuns('b-stable-001');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].stage, 'CP-0');
});

test('checkpoint run records stage, status, reason_code, payload_json', () => {
  store.createSession({ sessionId: 's-cp', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-cp-001',
    sessionId: 's-cp',
    contentHash: 'hash-cp',
    normalized: { text: 'x' },
    ingestSource: 'live',
  });

  store.insertCheckpointRun({
    bundleId: 'b-cp-001',
    sessionId: 's-cp',
    stage: 'CP-3',
    status: 'failed',
    reasonCode: 'INVALID_CATEGORY',
    payload: { category: 'invalid' },
  });

  const runs = store.getCheckpointRuns('b-cp-001');
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].reasonCode, 'INVALID_CATEGORY');
  assert.deepEqual(runs[0].payload, { category: 'invalid' });
});

test('query decisions by session_id returns ordered timeline', () => {
  store.createSession({ sessionId: 's-dec', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-dec-1',
    sessionId: 's-dec',
    contentHash: 'h1',
    normalized: {},
    ingestSource: 'live',
  });
  store.insertBundle({
    bundleId: 'b-dec-2',
    sessionId: 's-dec',
    contentHash: 'h2',
    normalized: {},
    ingestSource: 'live',
  });

  store.insertDecision({
    bundleId: 'b-dec-1',
    sessionId: 's-dec',
    action: 'HIDE',
    reasonCodes: ['LOW_SCORE'],
    signalScore: 20,
    category: 'noise',
    worker: 'heuristic',
  });

  store.insertDecision({
    bundleId: 'b-dec-2',
    sessionId: 's-dec',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 75,
    category: 'news',
    worker: 'heuristic',
  });

  const decisions = store.getDecisionsBySession('s-dec');
  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].action, 'HIDE');
  assert.equal(decisions[1].action, 'SHOW');
});

test('held post count and resolution', () => {
  store.createSession({ sessionId: 's-hitl', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-held-1',
    sessionId: 's-hitl',
    contentHash: 'h-held',
    normalized: {},
    ingestSource: 'live',
  });

  store.insertHeldPost({
    bundleId: 'b-held-1',
    sessionId: 's-hitl',
    agentReasons: ['borderline signal'],
    signalScore: 45,
    category: 'analysis',
  });

  assert.equal(store.getHeldCount('s-hitl'), 1);
  store.resolveHeldPost('b-held-1', 'HIDE');
  assert.equal(store.getHeldCount('s-hitl'), 0);
});

test('getDecisionCountsBySession aggregates latest decisions by action', () => {
  store.createSession({ sessionId: 's-counts', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-count-1',
    sessionId: 's-counts',
    contentHash: 'h-count-1',
    normalized: {},
    ingestSource: 'live',
  });
  store.insertBundle({
    bundleId: 'b-count-2',
    sessionId: 's-counts',
    contentHash: 'h-count-2',
    normalized: {},
    ingestSource: 'live',
  });

  store.insertDecision({
    bundleId: 'b-count-1',
    sessionId: 's-counts',
    action: 'HOLD',
    reasonCodes: ['BORDERLINE'],
    signalScore: 30,
    category: 'analysis',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-count-2',
    sessionId: 's-counts',
    action: 'HIDE',
    reasonCodes: ['LOW_SCORE'],
    signalScore: 12,
    category: 'noise',
    worker: 'heuristic',
  });

  const counts = store.getDecisionCountsBySession('s-counts', { latestOnly: true });
  assert.equal(counts.hold, 1);
  assert.equal(counts.hide, 1);
  assert.equal(counts.show, 0);
  assert.equal(counts.total, 2);
});
