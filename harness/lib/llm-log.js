function llmLoggingEnabled() {
  const value = process.env.LLM_LOG?.toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

function truncate(text, max = 80) {
  if (!text) return '';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

export function logLlm(event, details = {}) {
  if (!llmLoggingEnabled()) return;

  const parts = [`[llm] ${event}`];
  if (details.handle) parts.push(`@${details.handle}`);
  if (details.trigger) parts.push(`trigger=${details.trigger}`);
  if (details.reason) parts.push(`reason=${details.reason}`);
  if (details.heuristic_score !== undefined) parts.push(`heuristic=${details.heuristic_score}`);
  if (details.score !== undefined) parts.push(`score=${details.score}`);
  if (details.latency_ms !== undefined) parts.push(`${details.latency_ms}ms`);
  if (details.snippet) parts.push(`"${details.snippet}"`);
  if (details.error) parts.push(`error=${details.error}`);

  console.log(parts.join(' '));
}

export { truncate, llmLoggingEnabled };
