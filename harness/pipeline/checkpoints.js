import { validate } from '../lib/schemas.js';

export const CHECKPOINT_STAGES = [
  { id: 'CP-0', name: 'normalized', description: 'Valid normalized post shape' },
  { id: 'CP-1', name: 'guardrails_passed', description: 'No guardrail block' },
  { id: 'CP-2', name: 'agent_scored', description: 'Worker returned valid output' },
  { id: 'CP-3', name: 'schema_valid', description: 'Score 0-100, category in enum, reasons present' },
  { id: 'CP-4', name: 'confidence_checked', description: 'Confidence present; escalation flag valid' },
  { id: 'CP-5', name: 'decision_committed', description: 'SHOW/HIDE/HOLD/BLOCK written' },
];

const VALID_CATEGORIES = ['news', 'analysis', 'engagement_bait', 'personal', 'promo', 'noise'];

export function runCheckpoint(stageId, context) {
  switch (stageId) {
    case 'CP-0': {
      const { valid, errors } = validate('normalized-post', context.normalized);
      return valid
        ? { passed: true }
        : { passed: false, reasonCode: 'INVALID_NORMALIZED', payload: errors };
    }
    case 'CP-1': {
      if (context.guardrailResult?.passed === false) {
        return {
          passed: false,
          reasonCode: context.guardrailResult.reasonCodes[0],
          payload: context.guardrailResult,
        };
      }
      return { passed: true };
    }
    case 'CP-2': {
      if (!context.agentOutput) {
        return { passed: false, reasonCode: 'AGENT_NO_OUTPUT' };
      }
      return { passed: true };
    }
    case 'CP-3': {
      const output = context.agentOutput;
      if (output.signal_score < 0 || output.signal_score > 100) {
        return { passed: false, reasonCode: 'INVALID_SCORE', payload: { score: output.signal_score } };
      }
      if (!VALID_CATEGORIES.includes(output.category)) {
        return { passed: false, reasonCode: 'INVALID_CATEGORY', payload: { category: output.category } };
      }
      if (!output.reasons?.length) {
        return { passed: false, reasonCode: 'MISSING_REASONS' };
      }
      const schemaPayload = {
        signal_score: output.signal_score,
        category: output.category,
        reasons: output.reasons,
        confidence: output.confidence,
        escalate: output.escalate,
      };
      const { valid, errors } = validate('agent-output', schemaPayload);
      if (!valid) {
        return { passed: false, reasonCode: 'SCHEMA_VIOLATION', payload: errors };
      }
      return { passed: true };
    }
    case 'CP-4': {
      const output = context.agentOutput;
      if (typeof output.confidence !== 'number') {
        return { passed: false, reasonCode: 'MISSING_CONFIDENCE' };
      }
      if (typeof output.escalate !== 'boolean') {
        return { passed: false, reasonCode: 'INVALID_ESCALATE_FLAG' };
      }
      return { passed: true };
    }
    case 'CP-5': {
      if (!context.decision) {
        return { passed: false, reasonCode: 'NO_DECISION' };
      }
      return { passed: true };
    }
    default:
      return { passed: false, reasonCode: 'UNKNOWN_STAGE' };
  }
}

export function getStagesFrom(fromStage) {
  const idx = CHECKPOINT_STAGES.findIndex((s) => s.id === fromStage);
  if (idx === -1) return CHECKPOINT_STAGES;
  return CHECKPOINT_STAGES.slice(idx);
}

export function runCheckpoints(context, store, fromStage = 'CP-0') {
  const stages = getStagesFrom(fromStage);
  const results = [];

  for (const stage of stages) {
    if (stage.id === 'CP-5') continue;

    const result = runCheckpoint(stage.id, context);
    store.insertCheckpointRun({
      bundleId: context.normalized.bundle_id,
      sessionId: context.normalized.session_id,
      stage: stage.id,
      status: result.passed ? 'passed' : 'failed',
      reasonCode: result.reasonCode || null,
      payload: result.payload || null,
    });

    results.push({ stage: stage.id, ...result });

    if (!result.passed) {
      return { allPassed: false, results, failedAt: stage.id, reasonCode: result.reasonCode };
    }
  }

  return { allPassed: true, results };
}
