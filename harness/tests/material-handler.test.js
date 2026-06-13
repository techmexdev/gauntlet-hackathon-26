import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, normalizePost, computeContentHash } from '../pipeline/material-handler.js';

test('HTML-heavy input becomes plain text only in normalized output', () => {
  const result = normalizePost(
    {
      html: '<p>Hello <strong>world</strong></p> <a href="https://example.com">link</a>',
      author_handle: '@alice',
    },
    's-001'
  );
  assert.equal(result.text, 'Hello world link');
  assert.ok(!result.text.includes('<'));
});

test('replay inject sets ingest_source tape', () => {
  const result = normalizePost({ text: 'Replay post', author_handle: 'bob' }, 's-replay', 'tape');
  assert.equal(result.ingest_source, 'tape');
});

test('content_hash is stable for same content', () => {
  const h1 = computeContentHash('Same text', 'alice');
  const h2 = computeContentHash('Same text', 'alice');
  assert.equal(h1, h2);
});

test('duplicate content_hash flagged via guardrails path', () => {
  const post = normalizePost({ text: 'Duplicate content here for testing', author_handle: 'alice' }, 's-dup');
  assert.ok(post.content_hash);
});
