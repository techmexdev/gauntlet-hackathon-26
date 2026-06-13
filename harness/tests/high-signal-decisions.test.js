import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createApp } from '../server.js';
import { createAgent } from '../agents/index.js';

let store;

before(() => {
  store = createStore(':memory:');
  seedShowSession();
});

after(() => store.close());

function seedShowSession() {
  store.createSession({ sessionId: 's-show', mode: 'replay' });

  const bundles = [
    { bundleId: 'b-91', score: 91, text: 'High signal markets analysis.' },
    { bundleId: 'b-72', score: 72, text: 'Moderate signal policy update.' },
    { bundleId: 'b-55', score: 55, text: 'Lower signal commentary thread.' },
    { bundleId: 'b-null', score: null, text: 'Missing score post.' },
    { bundleId: 'b-hide', score: 99, text: 'Hidden despite high score.' },
    { bundleId: 'b-hold', score: 88, text: 'Held for review.' },
  ];

  for (const bundle of bundles) {
    store.insertBundle({
      bundleId: bundle.bundleId,
      sessionId: 's-show',
      contentHash: `hash-${bundle.bundleId}`,
      normalized: {
        bundle_id: bundle.bundleId,
        author_handle: bundle.bundleId,
        text: bundle.text,
      },
      ingestSource: 'tape',
    });
  }

  store.insertDecision({
    bundleId: 'b-91',
    sessionId: 's-show',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 91,
    category: 'news',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-72',
    sessionId: 's-show',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 72,
    category: 'news',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-55',
    sessionId: 's-show',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 55,
    category: 'news',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-null',
    sessionId: 's-show',
    action: 'SHOW',
    reasonCodes: ['HITL_RESOLVED'],
    signalScore: null,
    category: null,
    worker: 'human',
  });
  store.insertDecision({
    bundleId: 'b-hide',
    sessionId: 's-show',
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD'],
    signalScore: 99,
    category: 'spam',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-hold',
    sessionId: 's-show',
    action: 'HOLD',
    reasonCodes: ['NEEDS_REVIEW'],
    signalScore: 88,
    category: 'uncertain',
    worker: 'heuristic',
  });

  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ?')
    .run('2026-06-13T10:00:00.000Z', 'b-91', 's-show');
  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ?')
    .run('2026-06-13T10:01:00.000Z', 'b-72', 's-show');
  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ?')
    .run('2026-06-13T10:02:00.000Z', 'b-55', 's-show');
  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ?')
    .run('2026-06-13T10:03:00.000Z', 'b-null', 's-show');
}

test('SHOW score sort returns descending order with nulls last', () => {
  const rows = store.getDecisionsBySession('s-show', {
    actions: ['SHOW'],
    latestOnly: true,
    sort: 'signal_score:desc,decided_at:desc',
  });

  assert.deepEqual(
    rows.map((row) => row.bundleId),
    ['b-91', 'b-72', 'b-55', 'b-null']
  );
  assert.deepEqual(
    rows.map((row) => row.signalScore),
    [91, 72, 55, null]
  );
});

test('SHOW filter excludes HOLD, HIDE, and BLOCK rows', () => {
  const rows = store.getDecisionsBySession('s-show', {
    actions: ['SHOW'],
    latestOnly: true,
    sort: 'signal_score:desc,decided_at:desc',
  });

  assert.ok(rows.every((row) => row.action === 'SHOW'));
  assert.ok(!rows.some((row) => ['b-hide', 'b-hold'].includes(row.bundleId)));
});

test('latestOnly excludes bundle when latest decision is not SHOW', () => {
  store.insertBundle({
    bundleId: 'b-flip',
    sessionId: 's-show',
    contentHash: 'hash-b-flip',
    normalized: {
      bundle_id: 'b-flip',
      author_handle: 'flip',
      text: 'Flipped from SHOW to HIDE.',
    },
    ingestSource: 'tape',
  });
  store.insertDecision({
    bundleId: 'b-flip',
    sessionId: 's-show',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 80,
    category: 'news',
    worker: 'heuristic',
  });
  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ? AND action = ?')
    .run('2026-06-13T09:00:00.000Z', 'b-flip', 's-show', 'SHOW');

  store.insertDecision({
    bundleId: 'b-flip',
    sessionId: 's-show',
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD'],
    signalScore: 80,
    category: 'news',
    worker: 'heuristic',
  });
  store.db
    .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ? AND action = ?')
    .run('2026-06-13T11:00:00.000Z', 'b-flip', 's-show', 'HIDE');

  const rows = store.getDecisionsBySession('s-show', {
    actions: ['SHOW'],
    latestOnly: true,
    sort: 'signal_score:desc,decided_at:desc',
  });

  assert.ok(!rows.some((row) => row.bundleId === 'b-flip'));
});

test('tied scores break by decided_at descending', () => {
  store.createSession({ sessionId: 's-tie', mode: 'live' });

  for (const [bundleId, decidedAt] of [
    ['b-tie-a', '2026-06-13T12:00:00.000Z'],
    ['b-tie-b', '2026-06-13T12:05:00.000Z'],
  ]) {
    store.insertBundle({
      bundleId,
      sessionId: 's-tie',
      contentHash: `hash-${bundleId}`,
      normalized: { bundle_id: bundleId, author_handle: bundleId, text: `${bundleId} text` },
      ingestSource: 'live',
    });
    store.insertDecision({
      bundleId,
      sessionId: 's-tie',
      action: 'SHOW',
      reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
      signalScore: 70,
      category: 'news',
      worker: 'heuristic',
    });
    store.db
      .prepare('UPDATE decisions SET decided_at = ? WHERE bundle_id = ? AND session_id = ?')
      .run(decidedAt, bundleId, 's-tie');
  }

  const rows = store.getDecisionsBySession('s-tie', {
    actions: ['SHOW'],
    latestOnly: true,
    sort: 'signal_score:desc,decided_at:desc',
  });

  assert.deepEqual(
    rows.map((row) => row.bundleId),
    ['b-tie-b', 'b-tie-a']
  );
});

test('GET /sessions/:id/decisions supports SHOW sort and latest query params', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  const response = await fetch(
    `http://127.0.0.1:${port}/sessions/s-show/decisions?action=SHOW&sort=signal_score:desc,decided_at:desc&latest=true`
  );
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.deepEqual(
    rows.map((row) => row.bundleId),
    ['b-91', 'b-72', 'b-55', 'b-null']
  );

  await new Promise((resolve) => server.close(resolve));
});
