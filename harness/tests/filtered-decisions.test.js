import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createApp } from '../server.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { processPost } from '../pipeline/processor.js';
import { publishDecision } from '../lib/publish-decision.js';

let store;
let agent;

before(() => {
  store = createStore(':memory:');
  agent = createAgent({ agent: 'heuristic' });
});

after(() => store.close());

test('filtered decisions join bundle author and text snippet', () => {
  store.createSession({ sessionId: 's-filter', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-hide',
    sessionId: 's-filter',
    contentHash: 'hash-hide',
    normalized: {
      bundle_id: 'b-hide',
      author_handle: 'bait_bot',
      text: 'Retweet if you love crypto! Follow for follow now!!!',
    },
    ingestSource: 'live',
  });
  store.insertBundle({
    bundleId: 'b-show',
    sessionId: 's-filter',
    contentHash: 'hash-show',
    normalized: {
      bundle_id: 'b-show',
      author_handle: 'analyst',
      text: 'Markets rallied after the Fed held rates steady according to WSJ reporting today.',
    },
    ingestSource: 'live',
  });

  store.insertDecision({
    bundleId: 'b-hide',
    sessionId: 's-filter',
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD', 'engagement bait'],
    signalScore: 12,
    category: 'engagement_bait',
    worker: 'heuristic',
  });
  store.insertDecision({
    bundleId: 'b-show',
    sessionId: 's-filter',
    action: 'SHOW',
    reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
    signalScore: 80,
    category: 'news',
    worker: 'heuristic',
  });

  const filtered = store.getDecisionsBySession('s-filter', { actions: ['HIDE', 'BLOCK'] });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].action, 'HIDE');
  assert.equal(filtered[0].authorHandle, 'bait_bot');
  assert.ok(filtered[0].textSnippet.includes('Retweet'));
  assert.deepEqual(filtered[0].reasonCodes, ['SCORE_BELOW_THRESHOLD', 'engagement bait']);
});

test('processPost BLOCK publishes guardrail reason with post snippet', async () => {
  store.createSession({ sessionId: 's-block', mode: 'live' });
  const events = [];
  const eventBus = { publish: (type, data) => events.push({ type, data }) };
  const alarmManager = new AlarmManager(store, () => {});

  const result = await processPost(
    { text: 'hi', author_handle: 'bait_bot' },
    's-block',
    { store, agent, alarmManager, ingestSource: 'live', eventBus }
  );

  publishDecision(eventBus, {
    sessionId: 's-block',
    normalized: result.normalized,
    decision: result.decision,
  });

  assert.equal(result.decision.action, 'BLOCK');
  const decisionEvent = events.find((e) => e.type === 'decision');
  assert.ok(decisionEvent);
  assert.equal(decisionEvent.data.author_handle, 'bait_bot');
  assert.ok(decisionEvent.data.text_snippet.includes('hi'));
  assert.ok(decisionEvent.data.reason_codes.includes('GUARDRAIL_TOO_SHORT'));
});

test('GET /sessions/:id/decisions?action=HIDE returns policy and agent reasons on hydrate', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  store.createSession({ sessionId: 's-hide-api', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-hide-api',
    sessionId: 's-hide-api',
    contentHash: 'hash-hide-api',
    normalized: {
      bundle_id: 'b-hide-api',
      author_handle: 'noisy',
      text: 'Retweet if you love crypto! Follow for follow now!!!',
    },
    ingestSource: 'live',
  });
  store.insertDecision({
    bundleId: 'b-hide-api',
    sessionId: 's-hide-api',
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD', 'engagement bait'],
    signalScore: 12,
    category: 'engagement_bait',
    worker: 'heuristic',
    agentReasons: ['engagement bait'],
    confidence: 0.9,
    escalate: false,
    commitBranch: 'SCORE_BELOW_THRESHOLD',
    commitRationale: { show_threshold: 40, likes: 0, guardrail_passed: true, confidence: 0.9 },
  });
  store.insertCheckpointRun({
    bundleId: 'b-hide-api',
    sessionId: 's-hide-api',
    stage: 'CP-2',
    status: 'passed',
    payload: {
      agentOutput: {
        signal_score: 12,
        category: 'engagement_bait',
        reasons: ['engagement bait'],
        confidence: 0.9,
        escalate: false,
        worker: 'heuristic',
      },
    },
  });

  const response = await fetch(
    `http://127.0.0.1:${port}/sessions/s-hide-api/decisions?action=HIDE,BLOCK`
  );
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  assert.match(rows[0].policyLabel, /12.*40/);
  assert.deepEqual(rows[0].agentReasons, ['engagement bait']);
  assert.equal(rows[0].cascadeMeta.heuristic_score, 12);
  assert.equal(rows[0].commitBranch, 'SCORE_BELOW_THRESHOLD');
  assert.equal(rows[0].commitRationale.show_threshold, 40);
  assert.equal(rows[0].confidence, 0.9);

  await new Promise((resolve) => server.close(resolve));
});

test('GET /sessions/:id/metrics returns decision counts by action', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  store.createSession({ sessionId: 's-metrics', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-metrics',
    sessionId: 's-metrics',
    contentHash: 'hash-metrics',
    normalized: { bundle_id: 'b-metrics', author_handle: 'a', text: 'hello' },
    ingestSource: 'live',
  });
  store.insertDecision({
    bundleId: 'b-metrics',
    sessionId: 's-metrics',
    action: 'HOLD',
    reasonCodes: ['BORDERLINE'],
    signalScore: 30,
    category: 'analysis',
    worker: 'heuristic',
  });

  const response = await fetch(`http://127.0.0.1:${port}/sessions/s-metrics/metrics?latest=true`);
  assert.equal(response.status, 200);
  const counts = await response.json();
  assert.equal(counts.hold, 1);
  assert.equal(counts.total, 1);

  await new Promise((resolve) => server.close(resolve));
});

test('GET /sessions/:id/decisions?action=HIDE,BLOCK returns enriched rows', async () => {
  const { app } = createApp({ store, agent: createAgent({ agent: 'heuristic' }) });
  const server = app.listen(0);
  const { port } = server.address();

  store.createSession({ sessionId: 's-api', mode: 'live' });
  store.insertBundle({
    bundleId: 'b-api',
    sessionId: 's-api',
    contentHash: 'hash-api',
    normalized: {
      bundle_id: 'b-api',
      author_handle: 'spammy',
      text: 'FREE AIRDROP click here now!!!',
    },
    ingestSource: 'live',
  });
  store.insertDecision({
    bundleId: 'b-api',
    sessionId: 's-api',
    action: 'BLOCK',
    reasonCodes: ['GUARDRAIL_TOO_SHORT', 'GUARDRAIL_ENGAGEMENT_BAIT'],
    signalScore: null,
    category: null,
    worker: null,
  });

  const response = await fetch(
    `http://127.0.0.1:${port}/sessions/s-api/decisions?action=HIDE,BLOCK`
  );
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'BLOCK');
  assert.equal(rows[0].authorHandle, 'spammy');
  assert.ok(rows[0].reasonCodes.includes('GUARDRAIL_TOO_SHORT'));
  assert.equal(rows[0].policyLabel, 'Guardrail block (pre-agent)');

  const missing = await fetch(`http://127.0.0.1:${port}/sessions/missing/decisions`);
  assert.equal(missing.status, 404);

  await new Promise((resolve) => server.close(resolve));
});
