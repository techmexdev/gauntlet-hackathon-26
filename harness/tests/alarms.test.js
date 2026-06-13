import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { AlarmManager } from '../pipeline/alarms.js';

let store;
let alarms;

before(() => {
  store = createStore(':memory:');
  store.createSession({ sessionId: 's-alarm', mode: 'live' });
  alarms = [];
  new AlarmManager(store, (_type, data) => alarms.push(data));
});

after(() => store.close());

test('block rate > 80% fires high_block_rate', () => {
  const mgr = new AlarmManager(store, (_type, data) => alarms.push(data));
  for (let i = 0; i < 10; i++) {
    mgr.recordDecision('s-alarm', 'BLOCK');
  }
  mgr.recordDecision('s-alarm', 'BLOCK');
  assert.ok(alarms.some((a) => a.type === 'high_block_rate'));
});

test('agent latency > 2s fires agent_latency', () => {
  const mgr = new AlarmManager(store, (_type, data) => alarms.push(data));
  mgr.checkLatency('s-alarm', 2500, 'b-001');
  const latency = alarms.find((a) => a.type === 'agent_latency');
  assert.ok(latency);
  assert.equal(latency.bundle_id, 'b-001');
});

test('five low-confidence scores fire confidence_collapse', () => {
  const fired = [];
  const mgr = new AlarmManager(store, (_type, data) => fired.push(data));

  for (let i = 0; i < 10; i++) {
    mgr.recordConfidence('s-alarm', i < 5 ? 0.3 : 0.9, `b-${i}`);
  }

  const collapse = fired.find((a) => a.type === 'confidence_collapse');
  assert.ok(collapse);
  assert.ok(collapse.bundle_id);
});

test('LLM_CALLS limit fires llm_calls_limit alarm once per session', () => {
  const prev = process.env.LLM_CALLS;
  process.env.LLM_CALLS = '1';

  try {
    const fired = [];
    const mgr = new AlarmManager(store, (_type, data) => fired.push(data));

    mgr.recordLlmCall('s-alarm', 'b-llm-1');
    mgr.recordLlmCall('s-alarm', 'b-llm-2');

    const limitAlarms = fired.filter((a) => a.type === 'llm_calls_limit');
    assert.equal(limitAlarms.length, 1);
    assert.equal(limitAlarms[0].metadata.llmCallsLimit, 1);
    assert.equal(limitAlarms[0].metadata.llmCallsUsed, 1);
  } finally {
    if (prev === undefined) delete process.env.LLM_CALLS;
    else process.env.LLM_CALLS = prev;
  }
});
