import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { processPost } from '../pipeline/processor.js';

let store;

before(() => {
  store = createStore(':memory:');
  store.createSession({ sessionId: 's-hitl-api', mode: 'live' });
});

after(() => store.close());

test('held post appears with agent reasons', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    {
      bundle_id: 'hitl-borderline',
      text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
      author_handle: 'analyst',
    },
    's-hitl-api',
    { store, agent, alarmManager }
  );

  const held = store.getHeldPosts('s-hitl-api');
  assert.ok(held.length >= 1);
  assert.ok(held[0].agentReasons.length > 0);
});

test('operator resolves Hide and held count decrements', async () => {
  store.resolveHeldPost('hitl-borderline', 'HIDE');
  store.insertDecision({
    bundleId: 'hitl-borderline',
    sessionId: 's-hitl-api',
    action: 'HIDE',
    reasonCodes: ['HITL_RESOLVED'],
    signalScore: null,
    category: null,
    worker: 'human',
  });

  assert.equal(store.getHeldCount('s-hitl-api'), 0);
});
