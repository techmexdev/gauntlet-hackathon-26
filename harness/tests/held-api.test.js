import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, HELD_QUEUE_CAP } from '../db/store.js';
import { createApp } from '../server.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { processPost } from '../pipeline/processor.js';

let store;
let agent;

before(() => {
  store = createStore(':memory:');
  agent = createAgent({ agent: 'heuristic' });
});

after(() => store.close());

test('getHeldPosts returns enriched author, snippet, and worker newest-first', () => {
  store.createSession({ sessionId: 's-held-enrich', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-held-1',
    sessionId: 's-held-enrich',
    contentHash: 'hash-1',
    normalized: {
      bundle_id: 'b-held-1',
      author_handle: 'analyst',
      text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    },
    ingestSource: 'live',
  });
  store.insertHeldPost({
    bundleId: 'b-held-1',
    sessionId: 's-held-enrich',
    agentReasons: ['borderline quality', 'needs human review'],
    signalScore: 42,
    category: 'analysis',
  });
  store.insertDecision({
    bundleId: 'b-held-1',
    sessionId: 's-held-enrich',
    action: 'HOLD',
    reasonCodes: ['AGENT_ESCALATION'],
    signalScore: 42,
    category: 'analysis',
    worker: 'heuristic',
    agentReasons: ['borderline quality', 'needs human review'],
    confidence: 0.55,
    escalate: true,
    cascadeMeta: { heuristic_score: 42, final_worker: 'heuristic', branch_trigger: 'gray_band' },
  });

  const held = store.getHeldPosts('s-held-enrich');
  assert.equal(held.length, 1);
  assert.equal(held[0].authorHandle, 'analyst');
  assert.ok(held[0].textSnippet.includes('market structure'));
  assert.equal(held[0].worker, 'heuristic');
  assert.deepEqual(held[0].agentReasons, ['borderline quality', 'needs human review']);
  assert.equal(held[0].confidence, 0.55);
  assert.equal(held[0].escalate, true);
  assert.equal(held[0].cascadeMeta.heuristic_score, 42);
});

test('resolveHeldPost removes row from getHeldPosts', () => {
  store.resolveHeldPost('b-held-1', 'HIDE');
  assert.equal(store.getHeldCount('s-held-enrich'), 0);
  assert.deepEqual(store.getHeldPosts('s-held-enrich'), []);
});

test('GET /hitl/:sessionId/held returns enriched rows', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  store.createSession({ sessionId: 's-held-api', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-held-api',
    sessionId: 's-held-api',
    contentHash: 'hash-api',
    normalized: {
      bundle_id: 'b-held-api',
      author_handle: 'borderline',
      text: 'Maybe interesting take on inflation but sources are thin.',
    },
    ingestSource: 'live',
  });
  store.insertHeldPost({
    bundleId: 'b-held-api',
    sessionId: 's-held-api',
    agentReasons: ['uncertain'],
    signalScore: 38,
    category: 'macro',
  });
  store.insertDecision({
    bundleId: 'b-held-api',
    sessionId: 's-held-api',
    action: 'HOLD',
    reasonCodes: ['SCORE_BORDERLINE'],
    signalScore: 38,
    category: 'macro',
    worker: 'heuristic',
  });

  const response = await fetch(`http://127.0.0.1:${port}/hitl/s-held-api/held`);
  assert.equal(response.status, 200);
  const body = await response.json();
  const rows = body.rows;
  assert.equal(body.total, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].authorHandle, 'borderline');
  assert.ok(rows[0].textSnippet.includes('inflation'));
  assert.equal(rows[0].worker, 'heuristic');

  await new Promise((resolve) => server.close(resolve));
});

test('processPost HOLD produces enrichable held row via API', async () => {
  const sessionId = 's-held-process';
  store.createSession({ sessionId, mode: 'live' });
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    {
      bundle_id: 'b-process-held',
      text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
      author_handle: 'analyst',
    },
    sessionId,
    { store, agent, alarmManager }
  );

  const held = store.getHeldPosts(sessionId);
  assert.ok(held.length >= 1);
  assert.ok(held[0].authorHandle);
  assert.ok(held[0].textSnippet);
  assert.ok(held[0].agentReasons.length > 0);
  assert.ok(held.length <= HELD_QUEUE_CAP);
});
