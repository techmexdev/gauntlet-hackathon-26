import { normalizePost } from './material-handler.js';
import { evaluateGuardrails, loadGuardrailConfig } from './guardrails.js';
import { runCascade } from './cascade.js';
import { runCheckpoint, CHECKPOINT_STAGES } from './checkpoints.js';
import { commitDecision } from './decision.js';
import { resolveCascadeMeta } from '../lib/decision-enrich.js';
import { buildCommitRationale, COMMIT_BRANCH } from '../lib/commit-rationale.js';
import { buildScoreExplanation } from '../lib/score-explanation.js';

function explainabilityFields(decision, agentOutput, cascadeResult) {
  const base = {
    commitBranch: decision.commitBranch ?? null,
    commitRationale: decision.commitRationale ?? null,
  };
  if (!decision || decision.action === 'BLOCK') {
    return base;
  }
  return {
    ...base,
    agentReasons: decision.agentReasons || agentOutput?.reasons || [],
    scoreExplanation:
      decision.scoreExplanation ||
      buildScoreExplanation(agentOutput, agentOutput?.worker || decision.worker),
    confidence: agentOutput?.confidence ?? null,
    escalate: agentOutput?.escalate ?? null,
    cascadeMeta: resolveCascadeMeta(cascadeResult, decision, agentOutput),
  };
}

function recordCheckpoint(store, bundleId, sessionId, stage, result, eventBus) {
  store.insertCheckpointRun({
    bundleId,
    sessionId,
    stage,
    status: result.passed ? 'passed' : 'failed',
    reasonCode: result.reasonCode || null,
    payload: result.payload || null,
  });

  if (eventBus) {
    eventBus.publish('checkpoint', {
      bundle_id: bundleId,
      session_id: sessionId,
      stage,
      status: result.passed ? 'passed' : 'failed',
      reason_code: result.reasonCode || null,
    });
  }

  return result;
}

function stagesFrom(fromStage) {
  const idx = CHECKPOINT_STAGES.findIndex((s) => s.id === fromStage);
  return idx === -1 ? CHECKPOINT_STAGES : CHECKPOINT_STAGES.slice(idx);
}

export async function processPost(raw, sessionId, deps) {
  const {
    store,
    agent,
    alarmManager,
    ingestSource = 'live',
    fromStage = 'CP-0',
    skipAgent = false,
    existingAgentOutput = null,
    existingToolCalls = null,
    eventBus = null,
  } = deps;

  const normalized = normalizePost(raw, sessionId, ingestSource);
  const bundleId = normalized.bundle_id;

  if (!store.getBundle(bundleId)) {
    store.insertBundle({
      bundleId,
      sessionId,
      contentHash: normalized.content_hash,
      normalized,
      ingestSource,
    });
  }

  const guardrailResult = evaluateGuardrails(normalized, store);
  const context = { normalized, guardrailResult };
  const stageIds = stagesFrom(fromStage).map((s) => s.id).filter((id) => id !== 'CP-5');

  for (const stageId of stageIds) {
    if (stageId === 'CP-2' || stageId === 'CP-3' || stageId === 'CP-4') {
      break;
    }

    const result = recordCheckpoint(
      store,
      bundleId,
      sessionId,
      stageId,
      runCheckpoint(stageId, context),
      eventBus
    );

    if (!result.passed) {
      const decision = commitDecision(normalized, null, guardrailResult);
      const saved = store.insertDecision({
        bundleId,
        sessionId,
        action: decision.action,
        reasonCodes: decision.reasonCodes,
        signalScore: decision.signalScore,
        category: decision.category,
        worker: decision.worker,
        commitBranch: decision.commitBranch,
        commitRationale: decision.commitRationale,
      });

      recordCheckpoint(store, bundleId, sessionId, 'CP-5', { passed: true, payload: saved }, eventBus);
      alarmManager.recordDecision(sessionId, decision.action);

      return { normalized, guardrailResult, decision: saved, agentOutput: null, failedAt: stageId };
    }
  }

  let agentOutput = existingAgentOutput;
  let cascadeResult = null;
  const agentStageIdx = CHECKPOINT_STAGES.findIndex((s) => s.id === 'CP-2');
  const fromIdx = CHECKPOINT_STAGES.findIndex((s) => s.id === fromStage);

  if (!agentOutput && !skipAgent && fromIdx <= agentStageIdx) {
    cascadeResult = await runCascade(normalized, agent, {
      alarmManager,
      sessionId,
      store,
      guardrailConfig: loadGuardrailConfig(),
      existingToolCalls,
      ...deps.llmCascadeOptions,
    });
    agentOutput = cascadeResult.output;

    if (cascadeResult.latencyMs) {
      alarmManager.checkLatency(sessionId, cascadeResult.latencyMs, bundleId);
    }
  }

  context.agentOutput = agentOutput;

  for (const stageId of ['CP-2', 'CP-3', 'CP-4']) {
    if (!stageIds.includes(stageId)) continue;
    if (!agentOutput && stageId !== 'CP-2') continue;

    let cpResult = runCheckpoint(stageId, context);
    if (stageId === 'CP-2' && cpResult.passed && agentOutput) {
      const payload = { agentOutput };
      if (cascadeResult?.toolCalls?.length) {
        payload.tool_calls = cascadeResult.toolCalls;
      } else if (existingToolCalls?.length) {
        payload.tool_calls = existingToolCalls;
      }
      cpResult = { ...cpResult, payload };
    }

    const result = recordCheckpoint(store, bundleId, sessionId, stageId, cpResult, eventBus);

    if (!result.passed) {
      alarmManager.schemaViolation(sessionId, bundleId, result.payload || result.reasonCode);

      const schemaBranch = COMMIT_BRANCH.SCHEMA_VIOLATION;
      const saved = store.insertDecision({
        bundleId,
        sessionId,
        action: 'HOLD',
        reasonCodes: ['SCHEMA_VIOLATION'],
        signalScore: agentOutput?.signal_score ?? null,
        category: agentOutput?.category ?? null,
        worker: agentOutput?.worker ?? null,
        agentReasons: agentOutput?.reasons || [],
        scoreExplanation: buildScoreExplanation(agentOutput, agentOutput?.worker),
        confidence: agentOutput?.confidence ?? null,
        escalate: agentOutput?.escalate ?? null,
        cascadeMeta: resolveCascadeMeta(cascadeResult, { worker: agentOutput?.worker, signalScore: agentOutput?.signal_score }, agentOutput),
        commitBranch: schemaBranch,
        commitRationale: buildCommitRationale({
          normalized,
          guardrailResult,
          agentOutput,
          commitBranch: schemaBranch,
        }),
      });

      store.insertHeldPost({
        bundleId,
        sessionId,
        agentReasons: agentOutput?.reasons || [],
        signalScore: agentOutput?.signal_score,
        category: agentOutput?.category,
      });

      const heldCount = store.getHeldCount(sessionId);
      return { normalized, guardrailResult, decision: saved, agentOutput, cascadeResult, heldCount, failedAt: stageId };
    }
  }

  const decision = commitDecision(normalized, agentOutput, guardrailResult);
  const saved = store.insertDecision({
    bundleId,
    sessionId,
    action: decision.action,
    reasonCodes: decision.reasonCodes,
    signalScore: decision.signalScore,
    category: decision.category,
    worker: decision.worker,
    ...explainabilityFields(decision, agentOutput, cascadeResult),
  });

  if (decision.action === 'HOLD') {
    store.insertHeldPost({
      bundleId,
      sessionId,
      agentReasons: decision.agentReasons || agentOutput?.reasons || [],
      signalScore: decision.signalScore,
      category: decision.category,
    });
  }

  recordCheckpoint(store, bundleId, sessionId, 'CP-5', { passed: true, payload: saved }, eventBus);
  alarmManager.recordDecision(sessionId, decision.action);

  if (agentOutput?.confidence !== undefined) {
    alarmManager.recordConfidence(sessionId, agentOutput.confidence, bundleId);
  }

  const heldCount = store.getHeldCount(sessionId);
  if (decision.action === 'HOLD' && heldCount >= alarmManager.escalationQueueThreshold) {
    alarmManager.escalationQueueFull(sessionId, heldCount);
  }

  return { normalized, guardrailResult, decision: saved, agentOutput, cascadeResult, heldCount };
}
