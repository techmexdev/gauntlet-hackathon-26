import { SHOW_THRESHOLD } from '../pipeline/decision.js';

export const COMMIT_BRANCH = {
  GUARDRAIL_BLOCK: 'GUARDRAIL_BLOCK',
  SCORE_ABOVE_THRESHOLD: 'SCORE_ABOVE_THRESHOLD',
  SCORE_BELOW_THRESHOLD: 'SCORE_BELOW_THRESHOLD',
  LOW_CONFIDENCE_HIGH_REACH: 'LOW_CONFIDENCE_HIGH_REACH',
  AGENT_ESCALATION: 'AGENT_ESCALATION',
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',
};

export function buildCommitRationale({
  normalized,
  guardrailResult,
  agentOutput,
  commitBranch,
}) {
  const likes = normalized?.engagement?.likes ?? 0;
  const base = {
    show_threshold: SHOW_THRESHOLD,
    likes,
    guardrail_passed: guardrailResult?.passed !== false,
    guardrail_codes: guardrailResult?.passed === false ? guardrailResult.reasonCodes || [] : [],
  };

  if (agentOutput) {
    base.confidence = agentOutput.confidence ?? null;
    base.escalate = agentOutput.escalate ?? null;
  }

  if (commitBranch === COMMIT_BRANCH.GUARDRAIL_BLOCK) {
    return { ...base, guardrail_passed: false };
  }

  return base;
}

export function commitBranchLabel(branch) {
  const labels = {
    GUARDRAIL_BLOCK: 'Guardrail block (pre-agent)',
    SCORE_ABOVE_THRESHOLD: 'Score at or above show threshold',
    SCORE_BELOW_THRESHOLD: 'Score below show threshold',
    LOW_CONFIDENCE_HIGH_REACH: 'Low confidence on high-reach post',
    AGENT_ESCALATION: 'Agent requested escalation',
    SCHEMA_VIOLATION: 'Schema validation failed',
  };
  return labels[branch] || branch;
}
