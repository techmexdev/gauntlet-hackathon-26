import { logLlm } from '../lib/llm-log.js';

const GRAY_BAND_LOW = 30;
const GRAY_BAND_HIGH = 60;
const DISAGREEMENT_THRESHOLD = 15;

export function isForceLlmEnabled(options = {}) {
  if (options.forceLlm === true) return true;
  const value = process.env.FORCE_LLM?.toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export async function runCascade(normalized, agent, options = {}) {
  const start = Date.now();
  const heuristicResult = agent.scoreHeuristic(normalized);
  let finalResult = { ...heuristicResult, worker: 'heuristic' };
  let llmInvoked = false;
  let toolCalls = options.existingToolCalls || [];

  const llmAgent = agent.type === 'llm' && !options.skipLlm;
  const inGrayBand =
    heuristicResult.signal_score >= GRAY_BAND_LOW &&
    heuristicResult.signal_score <= GRAY_BAND_HIGH;
  const shouldEscalate = heuristicResult.escalate === true;
  const alwaysLlm = isForceLlmEnabled(options);
  const trigger = alwaysLlm ? 'force_llm' : shouldEscalate ? 'escalate' : 'gray_band';

  const shouldInvokeLlm = llmAgent && (alwaysLlm || inGrayBand || shouldEscalate);
  const llmBlockedByLimit =
    shouldInvokeLlm &&
    options.alarmManager &&
    options.sessionId &&
    !options.alarmManager.canInvokeLlm(options.sessionId);

  if (llmBlockedByLimit) {
    logLlm('skipped', {
      handle: normalized.author_handle,
      trigger,
      heuristic_score: heuristicResult.signal_score,
      reason: 'llm_limit',
    });
    finalResult = { ...heuristicResult, worker: 'heuristic', llm_limit_skipped: true };
  } else if (shouldInvokeLlm) {
    try {
      if (options.alarmManager && options.sessionId) {
        options.alarmManager.recordLlmCall(options.sessionId, normalized.bundle_id);
      }

      const toolCallsRef = { calls: options.existingToolCalls ? [...options.existingToolCalls] : [] };
      const llmResult = await agent.score(normalized, {
        ...options.llmOptions,
        heuristicResult,
        trigger,
        toolsEnabled: !options.existingToolCalls?.length && Boolean(options.store && options.sessionId),
        toolContext: options.store
          ? {
              store: options.store,
              sessionId: options.sessionId,
              guardrailConfig: options.guardrailConfig,
            }
          : options.llmOptions?.toolContext,
        toolCallsRef,
      });
      llmInvoked = true;
      finalResult = { ...llmResult, worker: 'llm' };
      toolCalls = toolCallsRef.calls;

      const scoreDiff = Math.abs(heuristicResult.signal_score - llmResult.signal_score);
      if (scoreDiff >= DISAGREEMENT_THRESHOLD) {
        finalResult.disagreement = {
          heuristic: heuristicResult.signal_score,
          llm: llmResult.signal_score,
          delta: scoreDiff,
        };
        logLlm('disagreement', {
          handle: normalized.author_handle,
          heuristic_score: heuristicResult.signal_score,
          score: llmResult.signal_score,
        });
      }
    } catch (err) {
      logLlm('fallback', {
        handle: normalized.author_handle,
        heuristic_score: heuristicResult.signal_score,
        error: err instanceof Error ? err.message : String(err),
      });
      finalResult = { ...heuristicResult, worker: 'heuristic', llm_fallback: true };
    }
  }

  return {
    output: finalResult,
    heuristicResult,
    llmInvoked,
    latencyMs: Date.now() - start,
    toolCalls,
  };
}

export { GRAY_BAND_LOW, GRAY_BAND_HIGH };
