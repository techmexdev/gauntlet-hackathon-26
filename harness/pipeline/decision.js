import {
  buildCommitRationale,
  COMMIT_BRANCH,
} from '../lib/commit-rationale.js';
import { buildScoreExplanation } from '../lib/score-explanation.js';

const SHOW_THRESHOLD = 40;
export const HIGH_REACH_LIKES = 10000;
const LOW_CONFIDENCE = 0.5;

export function commitDecision(normalized, agentOutput, guardrailResult) {
  if (guardrailResult && !guardrailResult.passed) {
    const commitBranch = COMMIT_BRANCH.GUARDRAIL_BLOCK;
    return {
      action: 'BLOCK',
      reasonCodes: guardrailResult.reasonCodes,
      signalScore: null,
      category: null,
      worker: null,
      commitBranch,
      commitRationale: buildCommitRationale({
        normalized,
        guardrailResult,
        agentOutput: null,
        commitBranch,
      }),
    };
  }

  const { signal_score, category, reasons, confidence, escalate, worker } = agentOutput;
  const scoreExplanation = buildScoreExplanation(agentOutput, worker);
  const likes = normalized.engagement?.likes || 0;
  const isHighReach = likes >= HIGH_REACH_LIKES;
  const isLowConfidence = confidence < LOW_CONFIDENCE;

  if (escalate || (isHighReach && isLowConfidence)) {
    const commitBranch = escalate
      ? COMMIT_BRANCH.AGENT_ESCALATION
      : COMMIT_BRANCH.LOW_CONFIDENCE_HIGH_REACH;
    return {
      action: 'HOLD',
      reasonCodes: escalate ? ['AGENT_ESCALATION'] : ['LOW_CONFIDENCE_HIGH_REACH'],
      signalScore: signal_score,
      category,
      worker: worker || 'heuristic',
      agentReasons: reasons,
      scoreExplanation,
      commitBranch,
      commitRationale: buildCommitRationale({
        normalized,
        guardrailResult,
        agentOutput,
        commitBranch,
      }),
    };
  }

  if (signal_score >= SHOW_THRESHOLD) {
    const commitBranch = COMMIT_BRANCH.SCORE_ABOVE_THRESHOLD;
    return {
      action: 'SHOW',
      reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
      signalScore: signal_score,
      category,
      worker: worker || 'heuristic',
      agentReasons: reasons || [],
      scoreExplanation,
      commitBranch,
      commitRationale: buildCommitRationale({
        normalized,
        guardrailResult,
        agentOutput,
        commitBranch,
      }),
    };
  }

  const commitBranch = COMMIT_BRANCH.SCORE_BELOW_THRESHOLD;
  return {
    action: 'HIDE',
    reasonCodes: ['SCORE_BELOW_THRESHOLD'],
    signalScore: signal_score,
    category,
    worker: worker || 'heuristic',
    agentReasons: reasons || [],
    scoreExplanation,
    commitBranch,
    commitRationale: buildCommitRationale({
      normalized,
      guardrailResult,
      agentOutput,
      commitBranch,
    }),
  };
}

export function buildPolicyLabel(action, signalScore) {
  if (action === 'BLOCK') return 'Guardrail block (pre-agent)';
  if (action === 'HOLD') return 'Escalated — operator must resolve';
  if (action === 'SHOW') {
    return signalScore != null ? `SHOW (score ${signalScore} ≥ ${SHOW_THRESHOLD})` : `SHOW (≥ ${SHOW_THRESHOLD})`;
  }
  if (action === 'HIDE') {
    return signalScore != null ? `HIDE (score ${signalScore} < ${SHOW_THRESHOLD})` : `HIDE (< ${SHOW_THRESHOLD})`;
  }
  return null;
}

export { SHOW_THRESHOLD };
