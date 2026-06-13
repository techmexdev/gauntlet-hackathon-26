export const AGENT_OUTPUT_SCHEMA = {
  signal_score: 'number',
  category: 'string',
  reasons: 'array',
  confidence: 'number',
  escalate: 'boolean',
};

export function validateAgentOutput(output) {
  const required = ['signal_score', 'category', 'reasons', 'confidence', 'escalate'];
  for (const key of required) {
    if (output[key] === undefined) {
      return { valid: false, error: `Missing field: ${key}` };
    }
  }
  return { valid: true };
}
