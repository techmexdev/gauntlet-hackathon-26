import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePost } from '../agents/heuristic-classifier.js';
import { runCascade } from '../pipeline/cascade.js';
import { createAgent } from '../agents/index.js';

test('obvious bait post scores below 30 heuristic-only', () => {
  const result = scorePost({
    text: '🔥🔥🔥 Like if you agree! Retweet for FREE giveaway!!! 🚀🚀🚀',
    author_handle: 'bait',
  });
  assert.ok(result.signal_score < 30);
  assert.equal(result.category, 'engagement_bait');
});

test('borderline post scores in gray band', () => {
  const result = scorePost({
    text: 'Interesting thread on market structure. Some good points but hard to verify.',
    author_handle: 'analyst',
  });
  assert.ok(result.signal_score >= 30 && result.signal_score <= 60);
});

test('AGENT=heuristic skips LLM entirely', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const result = await runCascade(
    { text: 'Interesting thread on market structure changes today.', author_handle: 'a' },
    agent
  );
  assert.equal(result.llmInvoked, false);
  assert.equal(result.output.worker, 'heuristic');
});

test('same post produces different scores after worker swap', async () => {
  const normalized = {
    text: 'Interesting thread on market structure. Some good points but hard to verify.',
    author_handle: 'analyst',
  };

  const heuristicAgent = createAgent({ agent: 'heuristic' });
  const llmAgent = createAgent({ agent: 'llm' });

  const hResult = heuristicAgent.scoreHeuristic(normalized);
  const llmResult = await llmAgent.score(normalized, {
    mockResponse: {
      signal_score: 75,
      category: 'analysis',
      reasons: ['detailed analysis'],
      confidence: 0.9,
      escalate: false,
    },
  });

  assert.notEqual(hResult.signal_score, llmResult.signal_score);
});
