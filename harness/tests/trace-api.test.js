import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createStore } from '../db/store.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { replayTape } from '../replay/tape-player.js';
import { mapTraceToRest } from '../lib/trace-api.js';
import { buildCascadeMeta, formatCascadeChip } from '../lib/cascade-meta.js';
import { buildPolicyLabel } from '../pipeline/decision.js';
import { createApp } from '../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

let store;

before(() => {
  store = createStore(':memory:');
});

after(() => store.close());

test('getBundleTrace returns assembled trace for session-scoped bundle', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});
  const sessionId = 'trace-session-1';

  await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId,
  });

  const trace = store.getBundleTrace(sessionId, 'demo-bait-0');
  assert.ok(trace);
  assert.equal(trace.bundle.bundleId, 'demo-bait-0');
  assert.ok(trace.checkpoints.some((run) => run.stage === 'CP-1' && run.status === 'failed'));
  assert.equal(trace.decision.action, 'BLOCK');

  const rest = mapTraceToRest(trace);
  assert.equal(rest.bundle_id, 'demo-bait-0');
  assert.ok(rest.normalized.text);
  assert.ok(rest.checkpoints.length >= 2);
});

test('getBundleTrace returns null for wrong session', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});

  await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId: 'trace-session-a',
  });

  assert.equal(store.getBundleTrace('other-session', 'demo-bait-0'), null);
});

test('buildCascadeMeta and formatCascadeChip summarize worker path', () => {
  const meta = buildCascadeMeta({
    heuristicResult: { signal_score: 47, escalate: false },
    llmInvoked: true,
    latencyMs: 120,
    output: {
      worker: 'llm',
      signal_score: 52,
      disagreement: { heuristic: 47, llm: 52, delta: 5 },
    },
  });

  assert.equal(meta.heuristic_score, 47);
  assert.equal(meta.llm_invoked, true);
  assert.equal(meta.branch_trigger, 'disagreement');
  assert.equal(formatCascadeChip(meta), 'H:47 → L:52 Δ5');
});

test('buildPolicyLabel encodes SHOW threshold', () => {
  assert.match(buildPolicyLabel('HIDE', 39), /39.*40/);
  assert.match(buildPolicyLabel('SHOW', 42), /42.*40/);
});

test('GET /sessions/:id/traces/:bundleId returns trace JSON', async () => {
  const httpStore = createStore(':memory:');
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(httpStore, () => {});
  const sessionId = 'trace-http-session';

  try {
    await replayTape('demo-v1', {
      store: httpStore,
      agent,
      alarmManager,
      tapesDir: join(ROOT, 'tapes'),
      sessionId,
    });

    const { app } = createApp({ store: httpStore, agent });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const ok = await fetch(`http://127.0.0.1:${port}/sessions/${sessionId}/traces/demo-bait-0`);
      assert.equal(ok.status, 200);
      const body = await ok.json();
      assert.equal(body.bundle_id, 'demo-bait-0');
      assert.ok(body.checkpoints.some((cp) => cp.stage === 'CP-1' && cp.status === 'failed'));

      const missingSession = await fetch(
        `http://127.0.0.1:${port}/sessions/missing-session/traces/demo-bait-0`
      );
      assert.equal(missingSession.status, 404);

      httpStore.createSession({ sessionId: 'other-session', mode: 'replay' });
      const wrongSession = await fetch(
        `http://127.0.0.1:${port}/sessions/other-session/traces/demo-bait-0`
      );
      assert.equal(wrongSession.status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    httpStore.close();
  }
});
