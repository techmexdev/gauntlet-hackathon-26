import { buildPolicyLabel } from '../pipeline/decision.js';
import { buildCascadeMeta } from './cascade-meta.js';
import { buildScoreExplanation } from './score-explanation.js';

const SYSTEM_REASON_CODES = new Set([
  'SCORE_ABOVE_THRESHOLD',
  'SCORE_BELOW_THRESHOLD',
  'AGENT_ESCALATION',
  'LOW_CONFIDENCE_HIGH_REACH',
  'SCHEMA_VIOLATION',
]);

export function extractAgentReasons(reasonCodes = [], action) {
  if (action === 'BLOCK') return [];
  return reasonCodes.filter(
    (code) => !SYSTEM_REASON_CODES.has(code) && !String(code).startsWith('GUARDRAIL_')
  );
}

export function resolveCascadeMeta(cascadeResult, decision, agentOutput = null) {
  return (
    buildCascadeMeta(cascadeResult) ||
    decision?.cascadeMeta ||
    buildCascadeMetaFromStored(decision, agentOutput)
  );
}

export function buildCascadeMetaFromStored(decision, agentOutput = null) {
  if (!decision) return null;

  const { worker, signalScore } = decision;
  const finalWorker = worker || agentOutput?.worker || 'heuristic';
  const score = signalScore ?? agentOutput?.signal_score ?? null;

  if (agentOutput?.disagreement) {
    return buildCascadeMeta({
      heuristicResult: { signal_score: agentOutput.disagreement.heuristic },
      llmInvoked: true,
      output: {
        worker: agentOutput.worker || finalWorker,
        signal_score: agentOutput.disagreement.llm,
        disagreement: agentOutput.disagreement,
      },
    });
  }

  if (score == null && finalWorker !== 'llm') return null;

  return buildCascadeMeta({
    heuristicResult: { signal_score: finalWorker === 'llm' ? null : score },
    llmInvoked: finalWorker === 'llm',
    output: { worker: finalWorker, signal_score: score },
  });
}

export function enrichDecisionRow(decision, agentOutput = null) {
  const policyLabel = buildPolicyLabel(decision.action, decision.signalScore);
  const agentReasons =
    decision.agentReasons?.length
      ? decision.agentReasons
      : extractAgentReasons(decision.reasonCodes, decision.action);
  const cascadeMeta =
    decision.cascadeMeta || buildCascadeMetaFromStored(decision, agentOutput);
  const confidence = decision.confidence ?? agentOutput?.confidence ?? null;
  const escalate = decision.escalate ?? agentOutput?.escalate ?? null;
  const scoreExplanation =
    decision.scoreExplanation ||
    buildScoreExplanation(agentOutput, decision.worker || agentOutput?.worker);

  return {
    ...decision,
    ...(policyLabel ? { policyLabel } : {}),
    ...(agentReasons.length ? { agentReasons } : {}),
    ...(scoreExplanation ? { scoreExplanation } : {}),
    ...(cascadeMeta ? { cascadeMeta } : {}),
    ...(confidence != null ? { confidence } : {}),
    ...(escalate != null ? { escalate } : {}),
    ...(decision.commitBranch ? { commitBranch: decision.commitBranch } : {}),
    ...(decision.commitRationale ? { commitRationale: decision.commitRationale } : {}),
  };
}
