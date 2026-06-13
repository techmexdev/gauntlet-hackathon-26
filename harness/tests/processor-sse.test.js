import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
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

test('processPost emits checkpoint SSE events through CP-5 for valid post', async () => {
  store.createSession({ sessionId: 's-sse', mode: 'live' });
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    {
      text: 'Markets rallied after the Fed held rates steady according to WSJ reporting today.',
      author_handle: 'analyst',
    },
    's-sse',
    { store, agent, alarmManager, ingestSource: 'live', eventBus }
  );

  const checkpoints = events.filter((e) => e.type === 'checkpoint');
  const stages = checkpoints.map((e) => e.data.stage);
  assert.ok(stages.includes('CP-0'));
  assert.ok(stages.includes('CP-1'));
  assert.ok(stages.includes('CP-2'));
  assert.ok(stages.includes('CP-5'));
});

test('guardrail block emits checkpoint events before early exit', async () => {
  store.createSession({ sessionId: 's-block-sse', mode: 'live' });
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    { text: 'hi', author_handle: 'bait_bot' },
    's-block-sse',
    { store, agent, alarmManager, ingestSource: 'live', eventBus }
  );

  const checkpoints = events.filter((e) => e.type === 'checkpoint');
  assert.ok(checkpoints.some((e) => e.data.stage === 'CP-0'));
  assert.ok(checkpoints.some((e) => e.data.stage === 'CP-1'));
  assert.ok(checkpoints.some((e) => e.data.status === 'failed'));
});

test('third HOLD fires escalation_queue_full', async () => {
  store.createSession({ sessionId: 's-hold', mode: 'live' });
  const alarms = [];
  const alarmManager = new AlarmManager(store, (_type, data) => alarms.push(data));

  for (let i = 0; i < 3; i++) {
    await processPost(
      {
        bundle_id: `b-hold-${i}`,
        // Unique text per post avoids GUARDRAIL_DUPLICATE on identical content_hash.
        text: `Interesting thread on market structure (${i}). Some good points but hard to verify without sources.`,
        author_handle: 'analyst',
      },
      's-hold',
      { store, agent, alarmManager, ingestSource: 'live' }
    );
  }

  assert.ok(alarms.some((a) => a.type === 'escalation_queue_full'));
});
