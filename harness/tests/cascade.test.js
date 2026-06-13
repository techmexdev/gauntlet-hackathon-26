import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCascade, isForceLlmEnabled } from '../pipeline/cascade.js';
import { createAgent } from '../agents/index.js';

test('borderline post in gray band triggers LLM path when agent is llm', async () => {
  const agent = createAgent({ agent: 'llm' });
  const normalized = {
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    author_handle: 'analyst',
  };

  const result = await runCascade(normalized, agent, {
    llmOptions: {
      mockResponse: {
        signal_score: 45,
        category: 'analysis',
        reasons: ['borderline signal'],
        confidence: 0.6,
        escalate: true,
      },
    },
  });

  assert.equal(result.llmInvoked, true);
  assert.equal(result.output.worker, 'llm');
  assert.equal(result.output.escalate, true);
});

test('FORCE_LLM=1 scores every post through LLM even outside gray band', async () => {
  const prev = process.env.FORCE_LLM;
  process.env.FORCE_LLM = '1';

  try {
    const agent = createAgent({ agent: 'llm' });
    const normalized = {
      text: 'LIKE AND RETWEET FOR A FREE iPHONE!!!',
      author_handle: 'spam',
    };

    const result = await runCascade(normalized, agent, {
      llmOptions: {
        mockResponse: {
          signal_score: 5,
          category: 'engagement_bait',
          reasons: ['promotional spam'],
          confidence: 0.95,
          escalate: false,
        },
      },
    });

    assert.equal(result.llmInvoked, true);
    assert.equal(result.output.worker, 'llm');
    assert.ok(result.heuristicResult.signal_score < 30);
  } finally {
    if (prev === undefined) delete process.env.FORCE_LLM;
    else process.env.FORCE_LLM = prev;
  }
});

test('isForceLlmEnabled accepts 1, true, and yes', () => {
  const prev = process.env.FORCE_LLM;
  process.env.FORCE_LLM = '1';
  assert.equal(isForceLlmEnabled(), true);
  process.env.FORCE_LLM = 'true';
  assert.equal(isForceLlmEnabled(), true);
  process.env.FORCE_LLM = 'yes';
  assert.equal(isForceLlmEnabled(), true);
  process.env.FORCE_LLM = '0';
  assert.equal(isForceLlmEnabled(), false);
  if (prev === undefined) delete process.env.FORCE_LLM;
  else process.env.FORCE_LLM = prev;
});

test('AGENT=llm with mocked lookup_url_trust passes CP-3 output shape', async () => {
  const agent = createAgent({ agent: 'llm' });
  const normalized = {
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    author_handle: 'tech_analyst',
    urls: ['https://example.com/fed'],
    bundle_id: 'tool-url-1',
    session_id: 'tool-cascade-session',
  };

  const result = await runCascade(normalized, agent, {
    llmOptions: {
      mockToolUse: {
        name: 'lookup_url_trust',
        input: { urls: ['https://example.com/fed'] },
      },
      mockResponseAfterTool: {
        signal_score: 48,
        category: 'analysis',
        reasons: ['trusted source cited'],
        confidence: 0.7,
        escalate: false,
      },
    },
  });

  assert.equal(result.llmInvoked, true);
  assert.equal(result.output.worker, 'llm');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'lookup_url_trust');
});

test('AGENT=heuristic invokes zero tools on borderline post', async () => {
  const agent = createAgent({ agent: 'heuristic' });
  const normalized = {
    text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
    author_handle: 'analyst',
    urls: ['https://example.com/fed'],
  };

  const result = await runCascade(normalized, agent);
  assert.equal(result.llmInvoked, false);
  assert.equal(result.toolCalls.length, 0);
});

test('AGENT=llm outside gray band skips tools and LLM', async () => {
  const agent = createAgent({ agent: 'llm' });
  const normalized = {
    text: 'LIKE AND RETWEET FOR A FREE iPHONE!!!',
    author_handle: 'spam',
  };

  const result = await runCascade(normalized, agent, {
    store: { getAuthorDecisionStats: () => ({}), getSessionEngagementLikes: () => [] },
    sessionId: 's1',
    llmOptions: {
      mockToolUse: { name: 'lookup_url_trust', input: { urls: [] } },
      mockResponseAfterTool: {
        signal_score: 5,
        category: 'engagement_bait',
        reasons: ['spam'],
        confidence: 0.9,
        escalate: false,
      },
    },
  });

  assert.equal(result.llmInvoked, false);
  assert.equal(result.toolCalls.length, 0);
});
test('LLM_CALLS limit skips further LLM invocations', async () => {
  const prev = process.env.LLM_CALLS;
  process.env.LLM_CALLS = '1';

  try {
    const { AlarmManager } = await import('../pipeline/alarms.js');
    const { createStore } = await import('../db/store.js');
    const store = createStore(':memory:');
    store.createSession({ sessionId: 's-limit', mode: 'live' });
    const alarmManager = new AlarmManager(store, () => {});

    const agent = createAgent({ agent: 'llm' });
    const normalized = {
      text: 'Interesting thread on market structure. Some good points but hard to verify without sources.',
      author_handle: 'analyst',
    };
    const llmOptions = {
      mockResponse: {
        signal_score: 45,
        category: 'analysis',
        reasons: ['borderline signal'],
        confidence: 0.6,
        escalate: true,
      },
    };

    const first = await runCascade(normalized, agent, {
      alarmManager,
      sessionId: 's-limit',
      llmOptions,
    });
    const second = await runCascade(normalized, agent, {
      alarmManager,
      sessionId: 's-limit',
      llmOptions,
    });

    assert.equal(first.llmInvoked, true);
    assert.equal(second.llmInvoked, false);
    assert.equal(second.output.llm_limit_skipped, true);
    assert.equal(alarmManager.getLlmCallCount('s-limit'), 1);
    store.close();
  } finally {
    if (prev === undefined) delete process.env.LLM_CALLS;
    else process.env.LLM_CALLS = prev;
  }
});
