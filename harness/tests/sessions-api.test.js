import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createApp } from '../server.js';
import { createAgent } from '../agents/index.js';

let store;

before(() => {
  store = createStore(':memory:');
});

after(() => store.close());

test('GET /sessions/:id/alarms returns alarms in created_at order with snake_case fields', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  store.createSession({ sessionId: 's-alarms', mode: 'live' });
  store.insertAlarm({
    alarmId: 'a-1',
    sessionId: 's-alarms',
    type: 'high_block_rate',
    severity: 'warning',
    message: 'Block rate high',
    recommendedAction: 'Review guardrails',
  });
  store.insertAlarm({
    alarmId: 'a-2',
    sessionId: 's-alarms',
    type: 'agent_latency',
    severity: 'warning',
    message: 'Slow agent',
    recommendedAction: 'Switch to heuristic',
  });

  const response = await fetch(`http://127.0.0.1:${port}/sessions/s-alarms/alarms`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].alarm_id, 'a-1');
  assert.equal(rows[1].alarm_id, 'a-2');
  assert.equal(rows[0].recommended_action, 'Review guardrails');
  assert.equal(rows[0].session_id, 's-alarms');

  const missing = await fetch(`http://127.0.0.1:${port}/sessions/missing/alarms`);
  assert.equal(missing.status, 404);

  const empty = await fetch(`http://127.0.0.1:${port}/sessions/s-empty/alarms`);
  assert.equal(empty.status, 404);

  await new Promise((resolve) => server.close(resolve));
});
