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

test('guardrail block streak emits alarm checkpoint and decision events', async () => {
  store.createSession({ sessionId: 's-pipeline', mode: 'live' });
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };
  const alarmManager = new AlarmManager(store, (type, data) => eventBus.publish(type, data));

  for (let i = 0; i < 12; i++) {
    await processPost(
      { text: 'hi', author_handle: `bot_${i}` },
      's-pipeline',
      { store, agent, alarmManager, ingestSource: 'live', eventBus }
    );
  }

  assert.ok(events.some((e) => e.type === 'alarm' && e.data.type === 'high_block_rate'));
  assert.ok(events.some((e) => e.type === 'checkpoint'));
  assert.ok(events.filter((e) => e.type === 'checkpoint').length >= 12);
});

test('checkpoint events emit before pipeline completes for a single post', async () => {
  store.createSession({ sessionId: 's-order', mode: 'live' });
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    {
      text: 'Markets rallied after the Fed held rates steady according to WSJ reporting today.',
      author_handle: 'analyst',
    },
    's-order',
    { store, agent, alarmManager, ingestSource: 'live', eventBus }
  );

  assert.ok(events.some((e) => e.type === 'checkpoint' && e.data.stage === 'CP-0'));
  assert.ok(events.some((e) => e.type === 'checkpoint' && e.data.stage === 'CP-5'));
});
