import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { runMigrations } from './migrations.js';
import { buildTextSnippet } from '../lib/publish-decision.js';

export const HELD_QUEUE_CAP = 20;

const SORT_FIELDS = {
  signal_score: 'd.signal_score',
  decided_at: 'd.decided_at',
  bundle_id: 'd.bundle_id',
};

function parseSort(sort) {
  if (!sort) return null;

  const parts = [];
  for (const segment of sort.split(',')) {
    const [field, dir = 'asc'] = segment.trim().split(':');
    const column = SORT_FIELDS[field];
    if (!column) continue;

    const direction = dir.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    if (field === 'signal_score') {
      parts.push(`${column} ${direction} NULLS LAST`);
    } else {
      parts.push(`${column} ${direction}`);
    }
  }

  if (parts.some((part) => part.startsWith('d.signal_score')) && !sort.includes('bundle_id')) {
    parts.push('d.bundle_id ASC');
  }

  return parts.length ? parts.join(', ') : null;
}

export function createStore(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  return {
    db,
    close: () => db.close(),

    createSession({ sessionId, mode, tapeId = null, metadata = null }) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sessions (session_id, mode, tape_id, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionId, mode, tapeId, now, metadata ? JSON.stringify(metadata) : null);
      return { sessionId, mode, tapeId, createdAt: now };
    },

    getSession(sessionId) {
      const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
      if (!row) return null;
      return {
        sessionId: row.session_id,
        mode: row.mode,
        tapeId: row.tape_id,
        createdAt: row.created_at,
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      };
    },

    insertBundle({ bundleId, sessionId, contentHash, normalized, ingestSource }) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO bundles (bundle_id, session_id, content_hash, normalized_json, ingest_source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(bundleId, sessionId, contentHash, JSON.stringify(normalized), ingestSource, now);
      return { bundleId, sessionId, contentHash, createdAt: now };
    },

    getBundle(bundleId) {
      const row = db.prepare('SELECT * FROM bundles WHERE bundle_id = ?').get(bundleId);
      if (!row) return null;
      return {
        bundleId: row.bundle_id,
        sessionId: row.session_id,
        contentHash: row.content_hash,
        normalized: JSON.parse(row.normalized_json),
        ingestSource: row.ingest_source,
        createdAt: row.created_at,
      };
    },

    findRecentDuplicate(contentHash, withinHours = 24) {
      const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
      return db.prepare(`
        SELECT * FROM bundles
        WHERE content_hash = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1
      `).get(contentHash, cutoff);
    },

    insertCheckpointRun({ bundleId, sessionId, stage, status, reasonCode = null, payload = null }) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO checkpoint_runs (bundle_id, session_id, stage, status, reason_code, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        bundleId,
        sessionId,
        stage,
        status,
        reasonCode,
        payload ? JSON.stringify(payload) : null,
        now
      );
      return { id: result.lastInsertRowid, stage, status, reasonCode, createdAt: now };
    },

    getCheckpointRuns(bundleId) {
      return db
        .prepare('SELECT * FROM checkpoint_runs WHERE bundle_id = ? ORDER BY id ASC')
        .all(bundleId)
        .map((row) => ({
          id: row.id,
          bundleId: row.bundle_id,
          sessionId: row.session_id,
          stage: row.stage,
          status: row.status,
          reasonCode: row.reason_code,
          payload: row.payload_json ? JSON.parse(row.payload_json) : null,
          createdAt: row.created_at,
        }));
    },

    getStoredAgentOutput(bundleId) {
      const payload = this.getStoredCp2Payload(bundleId);
      return payload?.agentOutput ?? null;
    },

    getStoredCp2Payload(bundleId) {
      const runs = db
        .prepare('SELECT * FROM checkpoint_runs WHERE bundle_id = ? ORDER BY id DESC')
        .all(bundleId);

      for (const row of runs) {
        if (row.status !== 'passed' || !row.payload_json) continue;
        const payload = JSON.parse(row.payload_json);
        if (payload?.agentOutput) return payload;
      }
      return null;
    },

    getAuthorDecisionStats(sessionId, authorHandle) {
      const rows = db
        .prepare(
          `
        SELECT d.action, d.signal_score, d.category
        FROM decisions d
        JOIN bundles b ON b.bundle_id = d.bundle_id
        WHERE d.session_id = ?
          AND json_extract(b.normalized_json, '$.author_handle') = ?
        ORDER BY d.decided_at ASC
      `
        )
        .all(sessionId, authorHandle);

      if (!rows.length) {
        return {
          postCount: 0,
          avgSignalScore: null,
          hideRate: 0,
          recentCategories: [],
        };
      }

      const hideCount = rows.filter((row) => row.action === 'HIDE').length;
      const scored = rows.filter((row) => typeof row.signal_score === 'number');
      const avgSignalScore = scored.length
        ? scored.reduce((sum, row) => sum + row.signal_score, 0) / scored.length
        : null;

      return {
        postCount: rows.length,
        avgSignalScore,
        hideRate: hideCount / rows.length,
        recentCategories: rows
          .map((row) => row.category)
          .filter(Boolean)
          .slice(-5),
      };
    },

    getSessionEngagementLikes(sessionId) {
      const rows = db
        .prepare(
          `
        SELECT normalized_json
        FROM bundles
        WHERE session_id = ?
      `
        )
        .all(sessionId);

      return rows
        .map((row) => {
          const normalized = JSON.parse(row.normalized_json);
          return Number(normalized?.engagement?.likes) || 0;
        })
        .filter((likes) => likes > 0);
    },

    insertDecision({
      bundleId,
      sessionId,
      action,
      reasonCodes,
      signalScore,
      category,
      worker = null,
      agentReasons = null,
      scoreExplanation = null,
      confidence = null,
      escalate = null,
      cascadeMeta = null,
      commitBranch = null,
      commitRationale = null,
    }) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO decisions (
          bundle_id, session_id, action, reason_codes_json, signal_score, category, worker,
          agent_reasons_json, confidence, escalate, cascade_meta_json, commit_branch,
          commit_rationale_json, score_explanation, decided_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bundleId,
        sessionId,
        action,
        JSON.stringify(reasonCodes),
        signalScore ?? null,
        category ?? null,
        worker,
        agentReasons?.length ? JSON.stringify(agentReasons) : null,
        confidence ?? null,
        escalate == null ? null : escalate ? 1 : 0,
        cascadeMeta ? JSON.stringify(cascadeMeta) : null,
        commitBranch,
        commitRationale ? JSON.stringify(commitRationale) : null,
        scoreExplanation ?? null,
        now
      );
      return {
        id: result.lastInsertRowid,
        bundleId,
        sessionId,
        action,
        reasonCodes,
        signalScore,
        category,
        worker,
        agentReasons: agentReasons || [],
        scoreExplanation: scoreExplanation ?? null,
        confidence,
        escalate,
        cascadeMeta,
        commitBranch,
        commitRationale,
        decidedAt: now,
      };
    },

    getDecisionsBySession(sessionId, { actions = null, latestOnly = false, sort = null } = {}) {
      let sql = `
        SELECT d.*, b.normalized_json
        FROM decisions d
        LEFT JOIN bundles b ON b.bundle_id = d.bundle_id
      `;
      const params = [];

      if (latestOnly) {
        sql += `
          INNER JOIN (
            SELECT bundle_id, MAX(decided_at) AS max_decided_at
            FROM decisions
            WHERE session_id = ?
            GROUP BY bundle_id
          ) latest ON latest.bundle_id = d.bundle_id AND latest.max_decided_at = d.decided_at
        `;
        params.push(sessionId);
      }

      sql += ' WHERE d.session_id = ?';
      params.push(sessionId);

      if (actions?.length) {
        sql += ` AND d.action IN (${actions.map(() => '?').join(', ')})`;
        params.push(...actions);
      }

      sql += ` ORDER BY ${parseSort(sort) || 'd.decided_at ASC'}`;

      return db
        .prepare(sql)
        .all(...params)
        .map((row) => {
          const normalized = row.normalized_json ? JSON.parse(row.normalized_json) : null;
          return {
            id: row.id,
            bundleId: row.bundle_id,
            sessionId: row.session_id,
            action: row.action,
            reasonCodes: JSON.parse(row.reason_codes_json),
            signalScore: row.signal_score,
            category: row.category,
            worker: row.worker,
            agentReasons: row.agent_reasons_json ? JSON.parse(row.agent_reasons_json) : [],
            scoreExplanation: row.score_explanation ?? null,
            confidence: row.confidence ?? null,
            escalate: row.escalate == null ? null : Boolean(row.escalate),
            cascadeMeta: row.cascade_meta_json ? JSON.parse(row.cascade_meta_json) : null,
            commitBranch: row.commit_branch || null,
            commitRationale: row.commit_rationale_json ? JSON.parse(row.commit_rationale_json) : null,
            decidedAt: row.decided_at,
            authorHandle: normalized?.author_handle || normalized?.authorHandle || null,
            textSnippet: normalized?.text ? buildTextSnippet(normalized.text) : null,
          };
        });
    },

    getDecisionCountsBySession(sessionId, { latestOnly = true } = {}) {
      const counts = { show: 0, hide: 0, block: 0, hold: 0, total: 0 };
      let sql;
      const params = [];

      if (latestOnly) {
        sql = `
          SELECT d.action, COUNT(*) AS count
          FROM decisions d
          INNER JOIN (
            SELECT bundle_id, MAX(decided_at) AS max_decided_at
            FROM decisions
            WHERE session_id = ?
            GROUP BY bundle_id
          ) latest ON latest.bundle_id = d.bundle_id AND latest.max_decided_at = d.decided_at
          WHERE d.session_id = ?
          GROUP BY d.action
        `;
        params.push(sessionId, sessionId);
      } else {
        sql = `
          SELECT action, COUNT(*) AS count
          FROM decisions
          WHERE session_id = ?
          GROUP BY action
        `;
        params.push(sessionId);
      }

      for (const row of db.prepare(sql).all(...params)) {
        const action = String(row.action || '').toLowerCase();
        if (action in counts) {
          counts[action] = row.count;
          counts.total += row.count;
        }
      }

      return counts;
    },

    insertAlarm({ alarmId, sessionId, type, severity, message, recommendedAction, bundleId = null, metadata = null }) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO alarms (alarm_id, session_id, type, severity, message, recommended_action, bundle_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        alarmId,
        sessionId,
        type,
        severity,
        message,
        recommendedAction,
        bundleId,
        metadata ? JSON.stringify(metadata) : null,
        now
      );
      return { alarmId, sessionId, type, severity, message, recommendedAction, createdAt: now };
    },

    getAlarmsBySession(sessionId) {
      return db
        .prepare('SELECT * FROM alarms WHERE session_id = ? ORDER BY created_at ASC')
        .all(sessionId)
        .map((row) => ({
          alarmId: row.alarm_id,
          sessionId: row.session_id,
          type: row.type,
          severity: row.severity,
          message: row.message,
          recommendedAction: row.recommended_action,
          bundleId: row.bundle_id,
          metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
          createdAt: row.created_at,
        }));
    },

    insertHeldPost({ bundleId, sessionId, agentReasons, signalScore, category }) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO held_posts (bundle_id, session_id, agent_reasons_json, signal_score, category, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
        ON CONFLICT(bundle_id) DO UPDATE SET
          session_id = excluded.session_id,
          agent_reasons_json = excluded.agent_reasons_json,
          signal_score = excluded.signal_score,
          category = excluded.category,
          status = 'pending',
          resolution = NULL,
          resolved_at = NULL
      `).run(bundleId, sessionId, JSON.stringify(agentReasons), signalScore, category, now);
      return { bundleId, sessionId, status: 'pending', createdAt: now };
    },

    getHeldCount(sessionId) {
      const row = db
        .prepare("SELECT COUNT(*) as count FROM held_posts WHERE session_id = ? AND status = 'pending'")
        .get(sessionId);
      return row.count;
    },

    getHeldPosts(sessionId, { limit = HELD_QUEUE_CAP } = {}) {
      const rows = db
        .prepare(
          `
        SELECT h.*, b.normalized_json,
          d.worker AS hold_worker,
          d.agent_reasons_json AS hold_agent_reasons_json,
          d.confidence AS hold_confidence,
          d.escalate AS hold_escalate,
          d.cascade_meta_json AS hold_cascade_meta_json,
          d.score_explanation AS hold_score_explanation
        FROM held_posts h
        LEFT JOIN bundles b ON b.bundle_id = h.bundle_id
        LEFT JOIN decisions d ON d.id = (
          SELECT id FROM decisions
          WHERE bundle_id = h.bundle_id
            AND session_id = h.session_id
            AND action = 'HOLD'
          ORDER BY decided_at DESC
          LIMIT 1
        )
        WHERE h.session_id = ? AND h.status = 'pending'
        ORDER BY h.created_at DESC
        LIMIT ?
      `
        )
        .all(sessionId, limit);

      return rows.map((row) => {
        const normalized = row.normalized_json ? JSON.parse(row.normalized_json) : null;
        return {
          bundleId: row.bundle_id,
          sessionId: row.session_id,
          agentReasons: row.hold_agent_reasons_json
            ? JSON.parse(row.hold_agent_reasons_json)
            : JSON.parse(row.agent_reasons_json),
          signalScore: row.signal_score,
          category: row.category,
          worker: row.hold_worker || null,
          confidence: row.hold_confidence ?? null,
          escalate: row.hold_escalate == null ? null : Boolean(row.hold_escalate),
          cascadeMeta: row.hold_cascade_meta_json ? JSON.parse(row.hold_cascade_meta_json) : null,
          scoreExplanation: row.hold_score_explanation ?? null,
          status: row.status,
          createdAt: row.created_at,
          authorHandle: normalized?.author_handle || normalized?.authorHandle || null,
          textSnippet: normalized?.text ? buildTextSnippet(normalized.text) : null,
        };
      });
    },

    getHeldPostsTotal(sessionId) {
      const row = db
        .prepare("SELECT COUNT(*) as count FROM held_posts WHERE session_id = ? AND status = 'pending'")
        .get(sessionId);
      return row.count;
    },

    resolveHeldPost(bundleId, resolution) {
      const pending = db
        .prepare("SELECT created_at FROM held_posts WHERE bundle_id = ? AND status = 'pending'")
        .get(bundleId);
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE held_posts SET status = 'resolved', resolution = ?, resolved_at = ?
        WHERE bundle_id = ? AND status = 'pending'
      `).run(resolution, now, bundleId);
      return {
        bundleId,
        resolution,
        resolvedAt: now,
        heldCreatedAt: pending?.created_at || null,
      };
    },

    getLatestDecision(bundleId, sessionId) {
      const row = db
        .prepare(
          `
        SELECT * FROM decisions
        WHERE bundle_id = ? AND session_id = ?
        ORDER BY decided_at DESC, id DESC
        LIMIT 1
      `
        )
        .get(bundleId, sessionId);

      if (!row) return null;

      return {
        id: row.id,
        bundleId: row.bundle_id,
        sessionId: row.session_id,
        action: row.action,
        reasonCodes: JSON.parse(row.reason_codes_json),
        signalScore: row.signal_score,
        category: row.category,
        worker: row.worker,
        decidedAt: row.decided_at,
      };
    },

    getBundleTrace(sessionId, bundleId) {
      const bundle = this.getBundle(bundleId);
      if (!bundle || bundle.sessionId !== sessionId) return null;

      const checkpoints = this.getCheckpointRuns(bundleId);
      const decision = this.getLatestDecision(bundleId, sessionId);
      const alarms = this.getAlarmsBySession(sessionId).filter((alarm) => alarm.bundleId === bundleId);
      const heldRows = this.getHeldPosts(sessionId, { limit: HELD_QUEUE_CAP });
      const held = heldRows.find((row) => row.bundleId === bundleId) || null;

      return { bundle, checkpoints, decision, alarms, held };
    },
  };
}
