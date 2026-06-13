export function buildCascadeMeta(cascadeResult) {
  if (!cascadeResult) return null;

  const { heuristicResult, llmInvoked, latencyMs, output } = cascadeResult;
  const meta = {
    heuristic_score: heuristicResult?.signal_score ?? null,
    llm_invoked: Boolean(llmInvoked),
    final_worker: output?.worker || 'heuristic',
    latency_ms: latencyMs ?? null,
  };

  if (output?.disagreement) {
    meta.disagreement_delta = output.disagreement.delta;
    meta.llm_score = output.disagreement.llm;
  } else if (llmInvoked && output?.signal_score != null) {
    meta.llm_score = output.signal_score;
  }

  if (!llmInvoked && output?.llm_limit_skipped) {
    meta.branch_trigger = 'llm_limit';
  } else if (!llmInvoked) {
    meta.branch_trigger = 'heuristic_only';
  } else if (output?.llm_fallback) {
    meta.branch_trigger = 'llm_fallback';
  } else if (heuristicResult?.escalate) {
    meta.branch_trigger = 'escalate';
  } else if (output?.disagreement) {
    meta.branch_trigger = 'disagreement';
  } else {
    meta.branch_trigger = 'gray_band';
  }

  return meta;
}

export function formatCascadeChip(cascadeMeta) {
  if (!cascadeMeta) return '';
  const h = cascadeMeta.heuristic_score;
  if (h == null) return cascadeMeta.final_worker || '';
  if (!cascadeMeta.llm_invoked) return `H:${h}`;
  const llm = cascadeMeta.llm_score ?? cascadeMeta.final_worker;
  const delta = cascadeMeta.disagreement_delta;
  if (delta != null) return `H:${h} → L:${llm} Δ${delta}`;
  return `H:${h} → L`;
}
