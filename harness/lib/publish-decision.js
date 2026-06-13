export const TEXT_SNIPPET_LENGTH = 120;

export function buildTextSnippet(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.length <= TEXT_SNIPPET_LENGTH) return trimmed;
  return `${trimmed.slice(0, TEXT_SNIPPET_LENGTH)}…`;
}

import { buildPolicyLabel } from '../pipeline/decision.js';
import { resolveCascadeMeta } from './decision-enrich.js';
import { buildScoreExplanation } from './score-explanation.js';

export function buildDecisionEventPayload({
  sessionId,
  normalized,
  decision,
  bundle = null,
  cascadeResult = null,
  agentReasons = null,
  agentOutput = null,
}) {
  const norm = normalized || bundle?.normalized;
  const payload = {
    bundle_id: norm?.bundle_id || decision.bundleId,
    session_id: sessionId,
    action: decision.action,
    reason_codes: decision.reasonCodes,
    signal_score: decision.signalScore ?? null,
    category: decision.category ?? null,
    decided_at: decision.decidedAt,
  };

  if (decision.worker) {
    payload.worker = decision.worker;
  }

  const reasons = agentReasons ?? decision.agentReasons;
  if (reasons?.length) {
    payload.agent_reasons = reasons;
  }

  const scoreExplanation =
    decision.scoreExplanation ||
    buildScoreExplanation(agentOutput, agentOutput?.worker || decision.worker);
  if (scoreExplanation) {
    payload.score_explanation = scoreExplanation;
  }

  const policyLabel = buildPolicyLabel(decision.action, decision.signalScore);
  if (policyLabel) {
    payload.policy_label = policyLabel;
  }

  const cascadeMeta = resolveCascadeMeta(cascadeResult, decision, agentOutput);
  if (cascadeMeta) {
    payload.cascade_meta = cascadeMeta;
  }

  if (decision.action !== 'BLOCK') {
    const confidence = agentOutput?.confidence ?? decision.confidence;
    const escalate = agentOutput?.escalate ?? decision.escalate;
    if (typeof confidence === 'number') {
      payload.confidence = confidence;
    }
    if (typeof escalate === 'boolean') {
      payload.escalate = escalate;
    }
  }

  if (norm) {
    payload.author_handle = norm.author_handle || norm.authorHandle || 'unknown';
    payload.text_snippet = buildTextSnippet(norm.text || '');
  }

  if (decision.commitBranch) {
    payload.commit_branch = decision.commitBranch;
  }
  if (decision.commitRationale) {
    payload.commit_rationale = decision.commitRationale;
  }

  return payload;
}

export function publishDecision(eventBus, {
  sessionId,
  normalized,
  decision,
  bundle = null,
  cascadeResult = null,
  agentReasons = null,
  agentOutput = null,
}) {
  if (!eventBus) return null;
  const payload = buildDecisionEventPayload({
    sessionId,
    normalized,
    decision,
    bundle,
    cascadeResult,
    agentReasons,
    agentOutput,
  });
  eventBus.publish('decision', payload);
  return payload;
}
