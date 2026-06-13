import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { processPost } from '../pipeline/processor.js';
import { replayTape } from '../replay/tape-player.js';
import { publishDecision } from '../lib/publish-decision.js';
import { mapTraceToRest } from '../lib/trace-api.js';
import { enrichDecisionRow, buildCascadeMetaFromStored } from '../lib/decision-enrich.js';

export function createIngestRouter(deps) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { session_id, posts, post } = req.body;
      if (!session_id) {
        return res.status(400).json({ error: 'session_id required' });
      }

      const session = deps.store.getSession(session_id);
      if (!session) {
        return res.status(404).json({ error: 'session not found' });
      }

      const rawPosts = posts || (post ? [post] : []);
      if (!rawPosts.length) {
        return res.status(400).json({ error: 'post or posts required' });
      }

      const results = [];
      for (const raw of rawPosts) {
        const result = await processPost(raw, session_id, {
          store: deps.store,
          agent: deps.agent,
          alarmManager: deps.alarmManager,
          ingestSource: session.mode === 'replay' ? 'tape' : 'live',
          eventBus: deps.eventBus,
        });

        publishDecision(deps.eventBus, {
          sessionId: session_id,
          normalized: result.normalized,
          decision: result.decision,
          cascadeResult: result.cascadeResult,
          agentReasons: result.agentOutput?.reasons || result.decision.agentReasons,
          agentOutput: result.agentOutput,
        });

        if (result.heldCount !== undefined) {
          deps.eventBus.publish('held_count', { session_id, count: result.heldCount });
        }

        if (deps.tapeRecorder) {
          deps.tapeRecorder.record(result.normalized);
        }

        results.push(result);
      }

      res.json({ processed: results.length, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

export function createSessionsRouter(deps) {
  const router = Router();

  router.post('/', (req, res) => {
    const { mode = 'live', tape_id = null, metadata = null } = req.body;
    const sessionId = req.body.session_id || uuidv4();

    const session = deps.store.createSession({
      sessionId,
      mode,
      tapeId: tape_id,
      metadata,
    });

    res.status(201).json(session);
  });

  router.get('/:sessionId', (req, res) => {
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });
    res.json(session);
  });

  router.patch('/:sessionId/mode', (req, res) => {
    const { mode, tape_id } = req.body;
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });

    deps.store.db
      .prepare('UPDATE sessions SET mode = ?, tape_id = COALESCE(?, tape_id) WHERE session_id = ?')
      .run(mode, tape_id ?? null, req.params.sessionId);

    res.json({ ...session, mode, tapeId: tape_id ?? session.tapeId });
  });

  router.get('/:sessionId/alarms', (req, res) => {
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });

    const alarms = deps.store.getAlarmsBySession(req.params.sessionId).map((alarm) => ({
      alarm_id: alarm.alarmId,
      session_id: alarm.sessionId,
      type: alarm.type,
      severity: alarm.severity,
      message: alarm.message,
      recommended_action: alarm.recommendedAction,
      bundle_id: alarm.bundleId,
      metadata: alarm.metadata,
      created_at: alarm.createdAt,
    }));
    res.json(alarms);
  });

  router.get('/:sessionId/metrics', (req, res) => {
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });

    const latestOnly = req.query.latest !== 'false' && req.query.latest !== '0';
    const counts = deps.store.getDecisionCountsBySession(req.params.sessionId, { latestOnly });
    res.json(counts);
  });

  router.get('/:sessionId/decisions', (req, res) => {
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });

    const actions = req.query.action
      ? req.query.action.split(',').map((value) => value.trim()).filter(Boolean)
      : null;
    const latestOnly = req.query.latest === 'true' || req.query.latest === '1';
    const sort = req.query.sort || null;

    const decisions = deps.store
      .getDecisionsBySession(req.params.sessionId, {
        actions,
        latestOnly,
        sort,
      })
      .map((decision) =>
        enrichDecisionRow(decision, deps.store.getStoredAgentOutput(decision.bundleId))
      );
    res.json(decisions);
  });

  router.get('/:sessionId/checkpoints/:bundleId', (req, res) => {
    const runs = deps.store.getCheckpointRuns(req.params.bundleId);
    res.json(runs);
  });

  router.get('/:sessionId/traces/:bundleId', (req, res) => {
    const session = deps.store.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'not found' });

    const trace = deps.store.getBundleTrace(req.params.sessionId, req.params.bundleId);
    if (!trace) return res.status(404).json({ error: 'not found' });

    res.json(mapTraceToRest(trace));
  });

  router.post('/:sessionId/replay', async (req, res) => {
    try {
      const session = deps.store.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'not found' });

      const { tape_id = session.tapeId || 'demo-v1', from_stage = 'CP-0' } = req.body;

      const result = await replayTape(tape_id, {
        store: deps.store,
        agent: deps.agent,
        alarmManager: deps.alarmManager,
        eventBus: deps.eventBus,
        sessionId: req.params.sessionId,
        fromStage: from_stage,
      });

      res.json({
        sessionId: result.sessionId,
        processed: result.processed,
        tapeId: tape_id,
        fromStage: from_stage,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

export function createHitlRouter(deps) {
  const router = Router();

  router.get('/:sessionId/held', (req, res) => {
    const sessionId = req.params.sessionId;
    const rows = deps.store.getHeldPosts(sessionId).map((row) => {
      if (row.cascadeMeta) return row;
      const agentOutput = deps.store.getStoredAgentOutput(row.bundleId);
      const cascadeMeta = buildCascadeMetaFromStored(
        { worker: row.worker, signalScore: row.signalScore, action: 'HOLD' },
        agentOutput
      );
      return cascadeMeta ? { ...row, cascadeMeta } : row;
    });
    const total = deps.store.getHeldCount(sessionId);
    res.json({ rows, total });
  });

  router.post('/:sessionId/resolve/:bundleId', (req, res) => {
    const { resolution, note: optionalNote } = req.body;
    if (!['SHOW', 'HIDE', 'BLOCK'].includes(resolution)) {
      return res.status(400).json({ error: 'resolution must be SHOW, HIDE, or BLOCK' });
    }

    const bundle = deps.store.getBundle(req.params.bundleId);
    const resolved = deps.store.resolveHeldPost(req.params.bundleId, resolution);
    const dwellMs =
      resolved.heldCreatedAt != null
        ? Math.max(0, Date.now() - new Date(resolved.heldCreatedAt).getTime())
        : null;

    const decision = deps.store.insertDecision({
      bundleId: req.params.bundleId,
      sessionId: req.params.sessionId,
      action: resolution,
      reasonCodes: ['HITL_RESOLVED'],
      signalScore: null,
      category: null,
      worker: 'human',
    });

    const heldCount = deps.store.getHeldCount(req.params.sessionId);
    publishDecision(deps.eventBus, {
      sessionId: req.params.sessionId,
      decision,
      bundle,
    });
    deps.eventBus.publish('held_count', { session_id: req.params.sessionId, count: heldCount });

    const normalized = bundle?.normalized;
    deps.eventBus.publish('oversight', {
      bundle_id: req.params.bundleId,
      session_id: req.params.sessionId,
      actor: 'operator',
      prior: 'HOLD',
      resolution,
      dwell_ms: dwellMs,
      optional_note: optionalNote || null,
      author_handle: normalized?.author_handle || normalized?.authorHandle || null,
      text_snippet: normalized?.text ? normalized.text.slice(0, 120) : null,
      resolved_at: resolved.resolvedAt,
    });

    res.json({ decision, heldCount, oversight: { dwell_ms: dwellMs } });
  });

  return router;
}
