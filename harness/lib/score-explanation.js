export function buildScoreExplanation(agentOutput, worker = null) {
  if (!agentOutput) return null;

  const explanation = agentOutput.explanation?.trim();
  if (explanation) return explanation;

  const w = worker || agentOutput.worker;
  const reasons = agentOutput.reasons;
  if (!reasons?.length) return null;

  if (w === 'llm') {
    if (reasons.length === 1 && reasons[0].length > 48) return reasons[0];
    return `${reasons.join('. ')}.`;
  }

  return `Heuristic scoring: ${reasons.join('; ')}.`;
}
