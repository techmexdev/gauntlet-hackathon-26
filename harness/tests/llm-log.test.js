import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logLlm, llmLoggingEnabled } from '../lib/llm-log.js';

test('logLlm respects LLM_LOG=0', () => {
  const prev = process.env.LLM_LOG;
  process.env.LLM_LOG = '0';
  assert.equal(llmLoggingEnabled(), false);

  let called = false;
  const original = console.log;
  console.log = () => {
    called = true;
  };

  try {
    logLlm('→ anthropic', { handle: 'test' });
    assert.equal(called, false);
  } finally {
    console.log = original;
    if (prev === undefined) delete process.env.LLM_LOG;
    else process.env.LLM_LOG = prev;
  }
});
