import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createApp } from '../server.js';
import { createAgent } from '../agents/index.js';
import { EventBus } from '../routes/events.js';

let store;
let app;
let port;
let server;
const published = [];

before(async () => {
  store = createStore(':memory:');
  const eventBus = new EventBus();
  eventBus.on('oversight', (data) => published.push({ type: 'oversight', data }));
  ({ app, store } = createApp({
    store,
    agent: createAgent({ agent: 'heuristic' }),
    eventBus,
  }));
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  store.createSession({ sessionId: 's-oversight', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-oversight',
    sessionId: 's-oversight',
    contentHash: 'hash-oversight',
    normalized: {
      bundle_id: 'b-oversight',
      text: 'Borderline market thread needing human review.',
      author_handle: 'analyst',
    },
    ingestSource: 'live',
  });
  store.insertHeldPost({
    bundleId: 'b-oversight',
    sessionId: 's-oversight',
    agentReasons: ['borderline'],
    signalScore: 45,
    category: 'discussion',
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
});

test('resolve publishes oversight event and returns dwell metadata', async () => {
  published.length = 0;

  const response = await fetch(`http://127.0.0.1:${port}/hitl/s-oversight/resolve/b-oversight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution: 'HIDE', note: 'Too noisy for demo' }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(typeof body.oversight?.dwell_ms === 'number');

  const oversight = published.find((event) => event.type === 'oversight')?.data;
  assert.ok(oversight);
  assert.equal(oversight.bundle_id, 'b-oversight');
  assert.equal(oversight.prior, 'HOLD');
  assert.equal(oversight.resolution, 'HIDE');
  assert.equal(oversight.actor, 'operator');
  assert.equal(oversight.optional_note, 'Too noisy for demo');
  assert.equal(oversight.author_handle, 'analyst');
  assert.ok(typeof oversight.dwell_ms === 'number');
});
