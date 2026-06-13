import { scorePost as heuristicScore } from './heuristic-classifier.js';
import { logLlm, truncate } from '../lib/llm-log.js';
import { executeTool, STRETCH_TOOL_DEFINITIONS } from './tools/index.js';
import { loadGuardrailConfig } from '../pipeline/guardrails.js';

export function buildLlmPrompt(normalized, heuristicResult = null, toolContextLines = []) {
  const lines = [
    'Score this social media post for signal quality. Return JSON only with keys: signal_score (0-100), category (news|analysis|engagement_bait|personal|promo|noise), reasons (array of short tags), explanation (1-2 sentences in plain English explaining why you assigned this score), confidence (0-1), escalate (boolean).',
    '',
    `Post by @${normalized.author_handle}:`,
    normalized.text,
  ];

  if (normalized.urls?.length) {
    lines.push('', 'URLs:', ...normalized.urls.map((url) => `- ${url}`));
  }

  if (normalized.engagement) {
    const { likes = 0, reposts = 0, replies = 0 } = normalized.engagement;
    lines.push('', `Engagement: ${likes} likes, ${reposts} reposts, ${replies} replies`);
  }

  if (normalized.posted_at) {
    lines.push('', `Posted at: ${normalized.posted_at}`);
  }

  if (heuristicResult) {
    lines.push(
      '',
      `Heuristic pre-score: ${heuristicResult.signal_score}`,
      `Heuristic reasons: ${(heuristicResult.reasons || []).join('; ') || 'none'}`,
      `Heuristic escalate flag: ${heuristicResult.escalate === true}`
    );
  }

  if (toolContextLines.length) {
    lines.push('', 'Tool context:', ...toolContextLines);
  }

  return lines.join('\n');
}

function recordToolCall(toolCallsRef, name, input, execution) {
  if (!toolCallsRef) return;
  toolCallsRef.calls.push({
    name,
    input,
    output: execution.output,
    latency_ms: execution.latency_ms,
    status: execution.status,
  });
}

function parseAgentJson(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM returned non-JSON response');
  }
  return JSON.parse(jsonMatch[0]);
}

async function runSingleTool(name, input, normalized, options) {
  const toolContext = {
    store: options.toolContext?.store,
    sessionId: options.toolContext?.sessionId,
    guardrailConfig: options.toolContext?.guardrailConfig || loadGuardrailConfig(),
  };

  if (name === 'lookup_author_history' && !input?.author_handle) {
    input = { ...input, author_handle: normalized.author_handle };
  }

  if (name === 'lookup_url_trust' && !input?.urls?.length) {
    input = { ...input, urls: normalized.urls || [] };
  }

  if (name === 'lookup_engagement_percentile' && input?.likes == null) {
    input = { ...input, likes: normalized.engagement?.likes || 0 };
  }

  return executeTool(name, input, toolContext, { timeoutMs: options.toolTimeoutMs || 500 });
}

function buildToolContextLines(toolCallsRef) {
  if (!toolCallsRef?.calls?.length) return [];
  return toolCallsRef.calls.map((call) => {
    return `${call.name}: ${JSON.stringify(call.output)}`;
  });
}

async function callAnthropic(body, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  return response.json();
}

export async function scoreWithLlm(normalized, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const toolCallsRef = options.toolCallsRef || null;

  if (options.mockResponse) {
    return options.mockResponse;
  }

  if (options.mockToolUse) {
    const execution = await runSingleTool(options.mockToolUse.name, options.mockToolUse.input || {}, normalized, options);
    recordToolCall(toolCallsRef, options.mockToolUse.name, options.mockToolUse.input || {}, execution);
    if (options.mockResponseAfterTool) {
      return options.mockResponseAfterTool;
    }
  }

  if (!apiKey) {
    return heuristicScore(normalized);
  }

  const toolsEnabled = options.toolsEnabled === true && options.toolContext?.store && options.toolContext?.sessionId;

  const prompt = buildLlmPrompt(
    normalized,
    options.heuristicResult,
    buildToolContextLines(toolCallsRef)
  );
  const started = Date.now();

  logLlm('→ anthropic', {
    handle: normalized.author_handle,
    trigger: options.trigger,
    heuristic_score: options.heuristicResult?.signal_score,
    tools_enabled: toolsEnabled,
    snippet: truncate(normalized.text),
  });

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 384,
    messages: [{ role: 'user', content: prompt }],
  };

  if (toolsEnabled) {
    requestBody.tools = STRETCH_TOOL_DEFINITIONS;
    requestBody.system =
      'You may call at most one read-only lookup tool when author history, URL trust, or engagement percentile would materially improve a borderline score. After any tool result, return final JSON only.';
  }

  let data = await callAnthropic(requestBody, apiKey);
  let toolUsed = false;

  if (toolsEnabled && data.stop_reason === 'tool_use') {
    const toolBlocks = (data.content || []).filter((block) => block.type === 'tool_use');
    const firstTool = toolBlocks[0];
    if (firstTool) {
      toolUsed = true;
      const execution = await runSingleTool(firstTool.name, firstTool.input || {}, normalized, options);
      recordToolCall(toolCallsRef, firstTool.name, firstTool.input || {}, execution);

      const followUpMessages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: data.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: firstTool.id,
              content: JSON.stringify(execution.output),
            },
          ],
        },
      ];

      data = await callAnthropic(
        {
          model: requestBody.model,
          max_tokens: requestBody.max_tokens,
          messages: followUpMessages,
        },
        apiKey
      );
    }
  }

  const textBlocks = (data.content || []).filter((block) => block.type === 'text');
  const text = textBlocks.map((block) => block.text).join('\n');
  const result = parseAgentJson(text);

  logLlm('← anthropic', {
    handle: normalized.author_handle,
    score: result.signal_score,
    tool_used: toolUsed,
    latency_ms: Date.now() - started,
  });

  return result;
}
