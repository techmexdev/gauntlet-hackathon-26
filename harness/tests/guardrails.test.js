import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { evaluateGuardrails, resetGuardrailConfig } from '../pipeline/guardrails.js';
import { normalizePost } from '../pipeline/material-handler.js';

let store;

before(() => {
  resetGuardrailConfig();
  store = createStore(':memory:');
  store.createSession({ sessionId: 's-gr', mode: 'live' });
});

after(() => store.close());

test('post under min length → BLOCK GUARDRAIL_TOO_SHORT', () => {
  const normalized = normalizePost({ text: 'short', author_handle: 'alice' }, 's-gr');
  const result = evaluateGuardrails(normalized, store);
  assert.equal(result.passed, false);
  assert.ok(result.reasonCodes.includes('GUARDRAIL_TOO_SHORT'));
});

test('duplicate content_hash within 24h → BLOCK GUARDRAIL_DUPLICATE', () => {
  const normalized = normalizePost({ text: 'Unique duplicate test content here', author_handle: 'bob' }, 's-gr');
  store.insertBundle({
    bundleId: 'existing-b',
    sessionId: 's-gr',
    contentHash: normalized.content_hash,
    normalized,
    ingestSource: 'live',
  });

  const dup = normalizePost({ text: 'Unique duplicate test content here', author_handle: 'bob' }, 's-gr');
  const result = evaluateGuardrails(dup, store);
  assert.ok(result.reasonCodes.includes('GUARDRAIL_DUPLICATE'));
});

test('engagement-bait regex match → BLOCK GUARDRAIL_ENGAGEMENT_BAIT', () => {
  const normalized = normalizePost(
    { text: 'Retweet if you love crypto! Follow for follow now!!!', author_handle: 'bait' },
    's-gr'
  );
  const result = evaluateGuardrails(normalized, store);
  assert.ok(result.reasonCodes.includes('GUARDRAIL_ENGAGEMENT_BAIT'));
});

test('clean post passes through to agent stage', () => {
  const normalized = normalizePost(
    {
      text: 'Markets rallied after the Fed held rates steady according to WSJ reporting today.',
      author_handle: 'analyst',
    },
    's-gr'
  );
  const result = evaluateGuardrails(normalized, store);
  assert.equal(result.passed, true);
});
