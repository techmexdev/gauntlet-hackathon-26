import { lookupAuthorHistory } from './lookup-author-history.js';
import { lookupUrlTrust } from './lookup-url-trust.js';
import { lookupEngagementPercentile } from './lookup-engagement-percentile.js';

const TOOL_HANDLERS = {
  lookup_author_history: lookupAuthorHistory,
  lookup_url_trust: lookupUrlTrust,
  lookup_engagement_percentile: lookupEngagementPercentile,
};

export const STRETCH_TOOL_DEFINITIONS = [
  {
    name: 'lookup_author_history',
    description:
      'Read prior scoring decisions for this author in the current session. Use when author track record is ambiguous.',
    input_schema: {
      type: 'object',
      properties: {
        author_handle: { type: 'string', description: 'Author handle without @' },
      },
      required: ['author_handle'],
    },
  },
  {
    name: 'lookup_url_trust',
    description:
      'Classify post URLs against local spam and trusted domain lists. Use when URLs are present and citation quality is unclear.',
    input_schema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs extracted from the post',
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'lookup_engagement_percentile',
    description:
      'Compare post likes to the session distribution. Use when engagement looks high but signal quality is borderline.',
    input_schema: {
      type: 'object',
      properties: {
        likes: { type: 'number', description: 'Like count for this post' },
      },
    },
  },
];

export async function executeTool(name, input, context = {}, { timeoutMs = 500 } = {}) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return {
      status: 'error',
      output: { error: `unknown_tool:${name}` },
      latency_ms: 0,
    };
  }

  const started = Date.now();
  try {
    const output = await Promise.race([
      Promise.resolve(handler(input, context)),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('tool_timeout')), timeoutMs);
      }),
    ]);

    return {
      status: 'ok',
      output,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: message === 'tool_timeout' ? 'timeout' : 'error',
      output: message === 'tool_timeout' ? { error: 'timeout' } : { error: message },
      latency_ms: Date.now() - started,
    };
  }
}

export { lookupAuthorHistory, lookupUrlTrust, lookupEngagementPercentile };
