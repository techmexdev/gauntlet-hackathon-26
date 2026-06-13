export function getLlmCallsLimit(options = {}) {
  if (options.llmCallsLimit != null) return options.llmCallsLimit;
  const raw = process.env.LLM_CALLS;
  if (raw == null || raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
