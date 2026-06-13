CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'record', 'replay')),
  tape_id TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS bundles (
  bundle_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  content_hash TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  ingest_source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bundles_session ON bundles(session_id);
CREATE INDEX IF NOT EXISTS idx_bundles_content_hash ON bundles(content_hash);

CREATE TABLE IF NOT EXISTS checkpoint_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_id TEXT NOT NULL REFERENCES bundles(bundle_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
  reason_code TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_runs_bundle ON checkpoint_runs(bundle_id);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_id TEXT NOT NULL REFERENCES bundles(bundle_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  action TEXT NOT NULL CHECK (action IN ('SHOW', 'HIDE', 'HOLD', 'BLOCK')),
  reason_codes_json TEXT NOT NULL,
  signal_score INTEGER,
  category TEXT,
  worker TEXT,
  agent_reasons_json TEXT,
  confidence REAL,
  escalate INTEGER,
  cascade_meta_json TEXT,
  commit_branch TEXT,
  commit_rationale_json TEXT,
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id, decided_at);

CREATE TABLE IF NOT EXISTS alarms (
  alarm_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  bundle_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alarms_session ON alarms(session_id, created_at);

CREATE TABLE IF NOT EXISTS held_posts (
  bundle_id TEXT PRIMARY KEY REFERENCES bundles(bundle_id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  agent_reasons_json TEXT NOT NULL,
  signal_score INTEGER,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolution TEXT CHECK (resolution IN ('SHOW', 'HIDE', 'BLOCK')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_held_posts_session ON held_posts(session_id, status);
