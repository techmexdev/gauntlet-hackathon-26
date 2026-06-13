import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreWithLlm, buildLlmPrompt } from '../agents/llm-classifier.js';
import { validate } from '../lib/schemas.js';
import { runCascade } from '../pipeline/cascade.js';
import { createAgent } from '../agents/index.js';

test('gray-band prompt includes heuristic pre-score and reasons', () => {
  const normalized = {
    author_handle: 'analyst',
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
  };
  const heuristicResult = {
    signal_score: 45,
    reasons: ['borderline density', 'no citations'],
    escalate: false,
  };

  const prompt = buildLlmPrompt(normalized, heuristicResult);
  assert.match(prompt, /Heuristic pre-score: 45/);
  assert.match(prompt, /borderline density/);
});

test('prompt lists extracted URLs', () => {
  const prompt = buildLlmPrompt({
    author_handle: 'tech',
    text: 'Read more here',
    urls: ['https://example.com/report', 'https://news.org/story'],
  });
  assert.match(prompt, /https:\/\/example.com\/report/);
  assert.match(prompt, /https:\/\/news.org\/story/);
});

test('prompt includes engagement summary for high-reach posts', () => {
  const prompt = buildLlmPrompt({
    author_handle: 'viral',
    text: 'Breaking news update',
    engagement: { likes: 15000, reposts: 2000, replies: 500 },
  });
  assert.match(prompt, /15000 likes/);
});

test('valid API response parses to agent-output schema', async () => {
  const mockResponse = {
    signal_score: 65,
    category: 'analysis',
    reasons: ['information dense', 'cites sources'],
    confidence: 0.85,
    escalate: false,
  };

  const result = await scoreWithLlm(
    { author_handle: 'test', text: 'Analysis post' },
    { mockResponse }
  );

  const { valid } = validate('agent-output', result);
  assert.equal(valid, true);
});

test('malformed response falls back to heuristic', async () => {
  const result = await scoreWithLlm(
    { author_handle: 'test', text: 'Short post for testing here' },
    {}
  );
  assert.ok(result.signal_score !== undefined);
  assert.ok(result.reasons);
});

test('cascade passes heuristic context into LLM path', async () => {
  const agent = createAgent({ agent: 'llm' });
  const normalized = {
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    author_handle: 'analyst',
    urls: ['https://example.com/fed'],
    engagement: { likes: 15000, reposts: 100, replies: 20 },
  };

  let capturedOptions = null;
  const originalScore = agent.score.bind(agent);
  agent.score = async (post, options) => {
    capturedOptions = options;
    return originalScore(post, {
      ...options,
      mockResponse: {
        signal_score: 45,
        category: 'analysis',
        reasons: ['borderline signal'],
        confidence: 0.6,
        escalate: true,
      },
    });
  };

  await runCascade(normalized, agent);
  assert.ok(capturedOptions?.heuristicResult);
  assert.ok(capturedOptions.heuristicResult.signal_score !== undefined);
});
