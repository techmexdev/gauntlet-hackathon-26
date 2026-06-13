import { v4 as uuidv4 } from 'uuid';
import { getLlmCallsLimit } from '../lib/llm-limit.js';

const BLOCK_RATE_WINDOW = 20;
const BLOCK_RATE_THRESHOLD = 0.8;
const LATENCY_THRESHOLD_MS = 2000;

const CONFIDENCE_WINDOW = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const CONFIDENCE_COLLAPSE_COUNT = 5;
export const ESCALATION_QUEUE_THRESHOLD = 3;

export class AlarmManager {
  constructor(store, emit) {
    this.store = store;
    this.emit = emit;
    this.recentDecisions = [];
    this.recentConfidences = [];
    this.escalationQueueThreshold = ESCALATION_QUEUE_THRESHOLD;
    this.llmCallCounts = new Map();
    this.llmLimitAlarmFired = new Set();
  }

  getLlmCallCount(sessionId) {
    return this.llmCallCounts.get(sessionId) || 0;
  }

  canInvokeLlm(sessionId) {
    const limit = getLlmCallsLimit();
    if (limit == null) return true;
    return this.getLlmCallCount(sessionId) < limit;
  }

  recordLlmCall(sessionId, bundleId = null) {
    const count = this.getLlmCallCount(sessionId) + 1;
    this.llmCallCounts.set(sessionId, count);

    const limit = getLlmCallsLimit();
    if (limit != null && count >= limit && !this.llmLimitAlarmFired.has(sessionId)) {
      this.llmLimitAlarmFired.add(sessionId);
      this.fire({
        sessionId,
        type: 'llm_calls_limit',
        severity: 'warning',
        message: `LLM call budget exhausted (${limit} per session)`,
        recommendedAction: 'Increase LLM_CALLS, switch to heuristic mode, or start a new session',
        bundleId,
        metadata: { llmCallsLimit: limit, llmCallsUsed: count },
      });
    }

    return count;
  }

  recordConfidence(sessionId, confidence, bundleId) {
    this.recentConfidences.push({ confidence, at: Date.now() });
    if (this.recentConfidences.length > CONFIDENCE_WINDOW) {
      this.recentConfidences.shift();
    }

    const lowCount = this.recentConfidences.filter((c) => c.confidence < LOW_CONFIDENCE_THRESHOLD).length;
    if (this.recentConfidences.length >= CONFIDENCE_WINDOW && lowCount >= CONFIDENCE_COLLAPSE_COUNT) {
      this.confidenceCollapse(sessionId, bundleId);
      this.recentConfidences = [];
    }
  }

  recordDecision(sessionId, action) {
    this.recentDecisions.push({ action, at: Date.now() });
    if (this.recentDecisions.length > BLOCK_RATE_WINDOW) {
      this.recentDecisions.shift();
    }

    const blockCount = this.recentDecisions.filter((d) => d.action === 'BLOCK').length;
    const rate = blockCount / this.recentDecisions.length;
    if (this.recentDecisions.length >= 10 && rate > BLOCK_RATE_THRESHOLD) {
      this.fire({
        sessionId,
        type: 'high_block_rate',
        severity: 'warning',
        message: `Block rate ${Math.round(rate * 100)}% exceeds threshold`,
        recommendedAction: 'Review guardrail rules or demo tape composition',
        metadata: { blockRate: rate, windowSize: this.recentDecisions.length },
      });
    }
  }

  checkLatency(sessionId, latencyMs, bundleId) {
    if (latencyMs > LATENCY_THRESHOLD_MS) {
      this.fire({
        sessionId,
        type: 'agent_latency',
        severity: 'warning',
        message: `Agent latency ${latencyMs}ms exceeded ${LATENCY_THRESHOLD_MS}ms`,
        recommendedAction: 'Switch to heuristic-only mode or reduce LLM calls',
        bundleId,
        metadata: { latencyMs },
      });
    }
  }

  schemaViolation(sessionId, bundleId, errors) {
    this.fire({
      sessionId,
      type: 'schema_violation',
      severity: 'critical',
      message: 'Agent output failed schema validation',
      recommendedAction: 'Hold post and review agent response',
      bundleId,
      metadata: { errors },
    });
  }

  confidenceCollapse(sessionId, bundleId) {
    this.fire({
      sessionId,
      type: 'confidence_collapse',
      severity: 'warning',
      message: 'Multiple low-confidence scores detected',
      recommendedAction: 'Review scoring worker configuration',
      bundleId,
    });
  }

  escalationQueueFull(sessionId, count) {
    this.fire({
      sessionId,
      type: 'escalation_queue_full',
      severity: 'info',
      message: `Escalation queue has ${count} pending posts`,
      recommendedAction: 'Resolve held posts before continuing demo',
      metadata: { heldCount: count },
    });
  }

  fire({ sessionId, type, severity, message, recommendedAction, bundleId = null, metadata = null }) {
    const alarmId = uuidv4();
    const alarm = {
      alarm_id: alarmId,
      session_id: sessionId,
      type,
      severity,
      message,
      recommended_action: recommendedAction,
      bundle_id: bundleId,
      metadata,
      created_at: new Date().toISOString(),
    };

    this.store.insertAlarm({
      alarmId,
      sessionId,
      type,
      severity,
      message,
      recommendedAction,
      bundleId,
      metadata,
    });

    if (this.emit) {
      this.emit('alarm', alarm);
    }

    return alarm;
  }
}
