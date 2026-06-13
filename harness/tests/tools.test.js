import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../db/store.js';
import { executeTool } from '../agents/tools/index.js';
import { loadGuardrailConfig, resetGuardrailConfig } from '../pipeline/guardrails.js';

let store;

before(() => {
  store = createStore(':memory:');
  store.createSession({ sessionId: 'tool-session', mode: 'replay' });
});

after(() => {
  resetGuardrailConfig();
  store.close();
});

function seedAuthorHistory(authorHandle, decisions) {
  for (const [index, decision] of decisions.entries()) {
    const bundleId = `author-${authorHandle}-${index}`;
    store.insertBundle({
      bundleId,
      sessionId: 'tool-session',
      contentHash: `hash-${bundleId}`,
      normalized: { author_handle: authorHandle, text: `Post ${index}` },
      ingestSource: 'tape',
    });
    store.insertDecision({
      bundleId,
      sessionId: 'tool-session',
      action: decision.action,
      reasonCodes: ['TEST'],
      signalScore: decision.signalScore,
      category: decision.category,
    });
  }
}

function seedEngagementPosts(likesList) {
  for (const [index, likes] of likesList.entries()) {
    const bundleId = `engagement-${index}`;
    store.insertBundle({
      bundleId,
      sessionId: 'tool-session',
      contentHash: `hash-${bundleId}`,
      normalized: {
        author_handle: 'news_bot',
        text: `Engagement post ${index}`,
        engagement: { likes, reposts: 0, replies: 0 },
      },
      ingestSource: 'tape',
    });
  }
}

test('lookup_author_history returns hide_rate for prior HIDE decisions', async () => {
  seedAuthorHistory('promo_co', [
    { action: 'HIDE', signalScore: 20, category: 'promo' },
    { action: 'HIDE', signalScore: 25, category: 'promo' },
    { action: 'SHOW', signalScore: 55, category: 'promo' },
  ]);

  const result = await executeTool(
    'lookup_author_history',
    { author_handle: 'promo_co' },
    { store, sessionId: 'tool-session' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.output.post_count, 3);
  assert.ok(result.output.hide_rate > 0.6);
  assert.deepEqual(result.output.recent_categories, ['promo', 'promo', 'promo']);
});

test('lookup_author_history returns empty stats for new author', async () => {
  const result = await executeTool(
    'lookup_author_history',
    { author_handle: 'new_author' },
    { store, sessionId: 'tool-session' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.output.post_count, 0);
  assert.equal(result.output.avg_signal_score, null);
  assert.equal(result.output.hide_rate, 0);
});

test('lookup_url_trust classifies trusted and spam domains', async () => {
  const guardrailConfig = loadGuardrailConfig();
  const result = await executeTool(
    'lookup_url_trust',
    {
      urls: ['https://example.com/fed', 'https://bit.ly/spam/deal', 'https://unknown.site/x'],
    },
    { guardrailConfig }
  );

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.output.results, [
    { url: 'https://example.com/fed', trust: 'trusted' },
    { url: 'https://bit.ly/spam/deal', trust: 'spam' },
    { url: 'https://unknown.site/x', trust: 'unknown' },
  ]);
});

test('lookup_url_trust returns empty results for empty urls input', async () => {
  const result = await executeTool('lookup_url_trust', { urls: [] }, { guardrailConfig: loadGuardrailConfig() });
  assert.deepEqual(result.output.results, []);
});

test('lookup_engagement_percentile marks high reach and percentile', async () => {
  seedEngagementPosts([120, 180, 200, 240, 300]);

  const result = await executeTool(
    'lookup_engagement_percentile',
    { likes: 12000 },
    { store, sessionId: 'tool-session' }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.output.likes, 12000);
  assert.equal(result.output.is_high_reach, true);
  assert.ok(result.output.percentile >= 90);
});

test('lookup_engagement_percentile handles first post in session', async () => {
  const emptyStore = createStore(':memory:');
  emptyStore.createSession({ sessionId: 'empty-session', mode: 'replay' });

  const result = await executeTool(
    'lookup_engagement_percentile',
    { likes: 50 },
    { store: emptyStore, sessionId: 'empty-session' }
  );

  assert.equal(result.output.session_median_likes, null);
  assert.equal(result.output.percentile, null);
  emptyStore.close();
});

test('lookup_engagement_percentile handles missing engagement input', async () => {
  const result = await executeTool(
    'lookup_engagement_percentile',
    {},
    { store, sessionId: 'tool-session' }
  );

  assert.equal(result.output.likes, 0);
  assert.equal(result.output.is_high_reach, false);
});

test('executeTool returns error status for unknown tool', async () => {
  const result = await executeTool('unknown_tool', {}, {});
  assert.equal(result.status, 'error');
});
