import { readFileSync, existsSync } from 'fs';
import { processPost } from '../pipeline/processor.js';
import { publishDecision } from '../lib/publish-decision.js';
import { defaultTapesDir, resolveTapePath } from '../lib/tapes-dir.js';

export async function replayTape(tapeId, options) {
  const {
    store,
    agent,
    alarmManager,
    eventBus,
    fromStage = 'CP-0',
    tapesDir = defaultTapesDir(),
  } = options;

  const tapePath = resolveTapePath(tapeId, tapesDir);
  if (!existsSync(tapePath)) {
    throw new Error(`Tape not found: ${tapePath}`);
  }

  const lines = readFileSync(tapePath, 'utf8').trim().split('\n').filter(Boolean);
  const sessionId = options.sessionId || `replay-${tapeId}-${Date.now()}`;

  const existing = store.getSession(sessionId);
  if (!existing) {
    store.createSession({ sessionId, mode: 'replay', tapeId });
  } else {
    store.db
      .prepare('UPDATE sessions SET mode = ?, tape_id = ? WHERE session_id = ?')
      .run('replay', tapeId, sessionId);
  }

  const results = [];
  for (const line of lines) {
    const raw = JSON.parse(line);
    raw.bundle_id = raw.bundle_id || raw.bundleId;

    const agentStageIdx = ['CP-0', 'CP-1', 'CP-2', 'CP-3', 'CP-4', 'CP-5'].indexOf(fromStage);
    const storedCp2 = agentStageIdx > 2 ? store.getStoredCp2Payload(raw.bundle_id || raw.bundleId) : null;
    const existingAgentOutput = storedCp2?.agentOutput ?? null;
    const existingToolCalls = storedCp2?.tool_calls ?? null;

    const result = await processPost(raw, sessionId, {
      store,
      agent,
      alarmManager,
      ingestSource: 'tape',
      fromStage,
      existingAgentOutput,
      existingToolCalls,
      eventBus,
      llmCascadeOptions: options.llmCascadeOptions,
    });

    if (eventBus) {
      publishDecision(eventBus, {
        sessionId,
        normalized: result.normalized,
        decision: result.decision,
        cascadeResult: result.cascadeResult,
        agentReasons: result.agentOutput?.reasons || result.decision.agentReasons,
        agentOutput: result.agentOutput,
      });

      if (result.heldCount !== undefined) {
        eventBus.publish('held_count', { session_id: sessionId, count: result.heldCount });
      }
    }

    results.push(result);
  }

  return { sessionId, processed: results.length, results };
}
