(() => {
  const HOLD_TRIGGER_LABELS = {
    AGENT_ESCALATION: 'Model flagged borderline — asked for your judgment',
    LOW_CONFIDENCE_HIGH_REACH: 'High-reach post with low model confidence',
  };

  const BRANCH_TRIGGER_HINTS = {
    llm_limit: 'LLM budget exhausted — scored with heuristics only',
    heuristic_only: 'Borderline heuristic score — LLM did not run',
    llm_fallback: 'LLM failed — fell back to heuristics',
    gray_band: 'Gray-band score — model could not settle',
    escalate: 'Model set escalate — could not decide confidently',
    disagreement: 'Heuristic and LLM disagreed',
  };

  function truncate(text, max = 72) {
    if (!text) return '';
    const trimmed = String(text).trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
  }

  function inferReasonCodes(meta) {
    const codes = meta.reasonCodes?.filter(Boolean) || [];
    if (codes.length) return codes;
    if (meta.escalate === true) return ['AGENT_ESCALATION'];
    if (typeof meta.confidence === 'number' && meta.confidence < 0.5) {
      return ['LOW_CONFIDENCE_HIGH_REACH'];
    }
    return [];
  }

  function buildHoldReason(meta = {}) {
    const reasonCodes = inferReasonCodes(meta);
    const triggerCode =
      reasonCodes.find((code) => HOLD_TRIGGER_LABELS[code]) || reasonCodes[0] || null;
    const summary = triggerCode
      ? HOLD_TRIGGER_LABELS[triggerCode] || 'Filter is unsure'
      : 'Filter is unsure';

    const branchTrigger = meta.cascadeMeta?.branch_trigger;
    const branchHint = branchTrigger ? BRANCH_TRIGGER_HINTS[branchTrigger] : null;

    const detail =
      meta.scoreExplanation?.trim() ||
      (meta.agentReasons?.length ? meta.agentReasons.join('; ') : null);

    const tooltipParts = [summary];
    if (branchHint) tooltipParts.push(branchHint);
    if (typeof meta.confidence === 'number' && meta.confidence < 0.5) {
      tooltipParts.push(`Confidence ${Math.round(meta.confidence * 100)}%`);
    }
    if (detail) tooltipParts.push(detail);
    if (meta.score != null) tooltipParts.push(`Score ${meta.score}`);

    const inline = detail ? truncate(detail) : branchHint || summary;

    return {
      summary,
      detail,
      inline,
      tooltip: tooltipParts.join(' — '),
    };
  }

  const LLM_REVIEW_BRANCHES = new Set([
    'gray_band',
    'escalate',
    'disagreement',
    'llm_fallback',
    'force_llm',
  ]);

  const PRE_LLM_BRANCHES = new Set(['heuristic_only', 'llm_limit']);

  function getHeldReviewBucket(meta = {}) {
    const cascadeMeta = meta.cascadeMeta || null;
    if (cascadeMeta?.llm_invoked === true) return 'llm';
    if (cascadeMeta?.llm_invoked === false) {
      const branch = cascadeMeta.branch_trigger;
      if (branch && LLM_REVIEW_BRANCHES.has(branch)) return 'llm';
      return 'pre_llm';
    }

    const branch = cascadeMeta?.branch_trigger;
    if (branch && LLM_REVIEW_BRANCHES.has(branch)) return 'llm';
    if (branch && PRE_LLM_BRANCHES.has(branch)) return 'pre_llm';
    if (meta.worker === 'llm') return 'llm';
    return 'pre_llm';
  }

  window.sdfHoldReason = { buildHoldReason, getHeldReviewBucket };
})();
