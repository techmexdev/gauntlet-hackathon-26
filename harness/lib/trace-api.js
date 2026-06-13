const STAGE_ORDER = ['CP-0', 'CP-1', 'CP-2', 'CP-3', 'CP-4', 'CP-5'];

export function orderCheckpointRuns(runs) {
  const byStage = new Map();
  for (const run of runs || []) {
    byStage.set(run.stage, run);
  }
  return STAGE_ORDER.filter((stage) => byStage.has(stage)).map((stage) => byStage.get(stage));
}

export function mapTraceToRest(trace) {
  if (!trace) return null;

  return {
    bundle_id: trace.bundle.bundleId,
    session_id: trace.bundle.sessionId,
    normalized: trace.bundle.normalized,
    content_hash: trace.bundle.contentHash,
    checkpoints: orderCheckpointRuns(trace.checkpoints).map((run) => ({
      stage: run.stage,
      status: run.status,
      reason_code: run.reasonCode,
      payload: run.payload,
      created_at: run.createdAt,
    })),
    decision: trace.decision
      ? {
          action: trace.decision.action,
          reason_codes: trace.decision.reasonCodes,
          signal_score: trace.decision.signalScore,
          category: trace.decision.category,
          worker: trace.decision.worker,
          decided_at: trace.decision.decidedAt,
        }
      : null,
    alarms: (trace.alarms || []).map((alarm) => ({
      alarm_id: alarm.alarmId,
      type: alarm.type,
      severity: alarm.severity,
      message: alarm.message,
      recommended_action: alarm.recommendedAction,
      created_at: alarm.createdAt,
    })),
    held: trace.held
      ? {
          agent_reasons: trace.held.agentReasons,
          signal_score: trace.held.signalScore,
          category: trace.held.category,
          worker: trace.held.worker,
        }
      : null,
  };
}
