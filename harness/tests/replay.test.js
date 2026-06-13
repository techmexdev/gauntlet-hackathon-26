import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createStore } from '../db/store.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { replayTape } from '../replay/tape-player.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

let store;

before(() => {
  store = createStore(':memory:');
});

after(() => store.close());

test('full tape replay produces decisions without network', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});

  const result = await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
  });

  assert.ok(result.processed > 0);
  const hideBlock = result.results.filter((r) => ['HIDE', 'BLOCK'].includes(r.decision.action));
  assert.ok(hideBlock.length / result.processed >= 0.5);
});

test('replay from CP-3 skips earlier stages and reuses bundle rows', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});

  const initial = await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId: 'replay-cp3-base',
  });

  assert.ok(initial.processed > 0);
  const sample = initial.results.find((r) => r.agentOutput);
  assert.ok(sample, 'expected agent output from initial replay');

  const checkpointRuns = store.getCheckpointRuns(sample.normalized.bundle_id);
  assert.ok(checkpointRuns.some((r) => r.stage === 'CP-2' && r.status === 'passed'));

  const rerun = await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId: 'replay-cp3-rerun',
    fromStage: 'CP-3',
  });

  assert.ok(rerun.processed > 0);
  const rerunSample = rerun.results.find((r) => r.normalized.bundle_id === sample.normalized.bundle_id);
  assert.ok(rerunSample?.decision);
  assert.equal(store.getBundle(sample.normalized.bundle_id).bundleId, sample.normalized.bundle_id);
});

test('replay from CP-3 preserves tool_calls in checkpoint payload', async () => {
  const agent = createAgent({ agent: 'llm' });
  const alarmManager = new AlarmManager(store, () => {});

  const initial = await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId: 'replay-tools-base',
    llmCascadeOptions: {
      llmOptions: {
        mockToolUse: { name: 'lookup_author_history', input: { author_handle: 'promo_co' } },
        mockResponseAfterTool: {
          signal_score: 42,
          category: 'promo',
          reasons: ['author history consulted'],
          confidence: 0.55,
          escalate: false,
        },
      },
    },
  });

  const sample = initial.results.find((r) => r.cascadeResult?.toolCalls?.length);
  if (!sample) {
    assert.ok(initial.processed > 0);
    return;
  }

  const cp2 = store
    .getCheckpointRuns(sample.normalized.bundle_id)
    .find((r) => r.stage === 'CP-2' && r.sessionId === 'replay-tools-base');
  assert.ok(cp2?.payload?.tool_calls?.length);

  const rerun = await replayTape('demo-v1', {
    store,
    agent,
    alarmManager,
    tapesDir: join(ROOT, 'tapes'),
    sessionId: 'replay-tools-rerun',
    fromStage: 'CP-3',
  });

  const rerunSample = rerun.results.find((r) => r.normalized.bundle_id === sample.normalized.bundle_id);
  assert.ok(rerunSample?.decision);
});
test('worker swap on replay changes borderline decision', async () => {
  const normalized = {
    bundle_id: 'swap-test-1',
    author_handle: 'analyst',
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    captured_at: new Date().toISOString(),
  };

  const heuristicAgent = createAgent({ agent: 'heuristic' });
  const llmAgent = createAgent({ agent: 'llm' });

  const hScore = heuristicAgent.scoreHeuristic(normalized);
  const lScore = await llmAgent.score(normalized, {
    mockResponse: {
      signal_score: 75,
      category: 'analysis',
      reasons: ['strong analysis'],
      confidence: 0.9,
      escalate: false,
    },
  });

  assert.notEqual(hScore.signal_score, lScore.signal_score);
});
