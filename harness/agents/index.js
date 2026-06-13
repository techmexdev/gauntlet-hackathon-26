import { scorePost as heuristicScore } from './heuristic-classifier.js';
import { scoreWithLlm } from './llm-classifier.js';

export function createAgent(options = {}) {
  const agentType =
    options.agent ||
    process.env.AGENT ||
    (process.env.ANTHROPIC_API_KEY ? 'llm' : 'heuristic');

  return {
    type: agentType,
    async score(normalized, scoreOptions = {}) {
      if (agentType === 'llm') {
        return scoreWithLlm(normalized, scoreOptions);
      }
      return heuristicScore(normalized);
    },
    scoreHeuristic: heuristicScore,
  };
}

export { heuristicScore, scoreWithLlm };
