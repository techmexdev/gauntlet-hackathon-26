import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { createAgent } from '../agents/index.js';
import { AlarmManager } from '../pipeline/alarms.js';
import { processPost } from '../pipeline/processor.js';
import { createTapeRecorder } from '../replay/tape-recorder.js';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let store;
let tmpDir;

before(() => {
  store = createStore(':memory:');
  tmpDir = mkdtempSync(join(tmpdir(), 'tape-rec-'));
});

after(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

test('live session with recording produces replayable tape', () => {
  const recorder = createTapeRecorder('test-tape', tmpDir);
  const normalized = {
    bundle_id: 'rec-1',
    session_id: 's-rec',
    ingest_source: 'live',
    author_handle: 'alice',
    text: 'Recorded post content',
    content_hash: 'abc',
    captured_at: new Date().toISOString(),
  };

  recorder.record(normalized);
  const content = readFileSync(join(tmpDir, 'test-tape/posts.jsonl'), 'utf8');
  assert.ok(content.includes('Recorded post content'));
});

test('held post resolution decrements count', async () => {
  store.createSession({ sessionId: 's-hitl', mode: 'live' });
  const agent = createAgent({ agent: 'heuristic' });
  const alarmManager = new AlarmManager(store, () => {});

  await processPost(
    {
      bundle_id: 'hitl-1',
      text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
      author_handle: 'analyst',
      escalate: true,
    },
    's-hitl',
    { store, agent, alarmManager }
  );

  assert.ok(store.getHeldCount('s-hitl') >= 1);
  store.resolveHeldPost('hitl-1', 'HIDE');
  assert.equal(store.getHeldCount('s-hitl'), 0);
});
