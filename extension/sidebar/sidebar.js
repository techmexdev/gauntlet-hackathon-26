const MAX_HELD = 20;
const MAX_ITEMS = 20;
const MAX_FILTERED = 50;

const STAGE_ORDER = ['CP-0', 'CP-1', 'CP-2', 'CP-3', 'CP-4', 'CP-5'];
const STAGE_LABELS = {
  'CP-0': 'Normalized',
  'CP-1': 'Guardrails',
  'CP-2': 'Agent scored',
  'CP-3': 'Schema valid',
  'CP-4': 'Confidence',
  'CP-5': 'Committed',
};

const alarmList = document.getElementById('alarm-list');
const checkpointList = document.getElementById('checkpoint-list');
const decisionList = document.getElementById('decision-list');
const filteredList = document.getElementById('filtered-list');
const blockedList = document.getElementById('blocked-list');
const blockedSection = document.getElementById('blocked-section');
const blockedStat = document.getElementById('blocked-stat');
const hiddenSection = document.getElementById('hidden-section');
const hiddenStat = document.getElementById('hidden-stat');
const heldList = document.getElementById('held-list');
const heldSection = document.getElementById('held-section');
const heldSectionCount = document.getElementById('held-section-count');
const heldOverflow = document.getElementById('held-overflow');
const heldCountEl = document.getElementById('held-count');
const heldStat = document.getElementById('held-stat');
const decisionCountEl = document.getElementById('decision-count');
const hiddenCountEl = document.getElementById('hidden-count');
const blockedCountEl = document.getElementById('blocked-count');
const modeBadge = document.getElementById('mode-badge');
const replayBtn = document.getElementById('replay-btn');
const connectionStatus = document.getElementById('connection-status');
const connectionLabel = document.getElementById('connection-label');
const connectionFallback = document.getElementById('connection-fallback');
const startDemoBtn = document.getElementById('start-demo-btn');
const startDemoError = document.getElementById('start-demo-error');
const vitalScored = document.getElementById('vital-scored');
const vitalLlm = document.getElementById('vital-llm');
const vitalConfidence = document.getElementById('vital-confidence');
const vitalDisagreements = document.getElementById('vital-disagreements');
const ae1Badge = document.getElementById('ae1-badge');
const metricFilterRate = document.getElementById('metric-filter-rate');
const metricSnr = document.getElementById('metric-snr');
const metricFiltered = document.getElementById('metric-filtered');
const metricShow = document.getElementById('metric-show');

const sessionMetricsApi = () => window.sdfSessionMetrics;
let sessionMetrics = sessionMetricsApi()?.createSessionMetrics() ?? {
  show: 0,
  hide: 0,
  block: 0,
  hold: 0,
  total: 0,
};
const checkpointsToggle = document.getElementById('checkpoints-toggle');
const checkpointsBody = document.getElementById('checkpoints-body');
const alarmsToggle = document.getElementById('alarms-toggle');
const alarmsBody = document.getElementById('alarms-body');

let decisionCount = 0;
let hiddenCount = 0;
let blockedCount = 0;
let showHidden = false;
let showBlocked = false;
let showHeld = false;
let heldTotal = 0;
const filteredByBundle = new Map();
const decisionsByBundle = new Map();
const heldByBundle = new Map();
const checkpointsByBundle = new Map();

const gradingVitals = {
  agentScored: 0,
  llmInvoked: 0,
  confidenceSum: 0,
  confidenceCount: 0,
  disagreements: 0,
};

function normalizeFilteredRow(data) {
  const row = GradingStoryRow.normalizeGradingRow(data);
  if (row.bundleId) {
    row.gateDigest = buildGateDigest(row.bundleId);
  }
  return row;
}

function checkpointDigestState(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('pass') || s.includes('ok') || s === 'valid') return 'pass';
  if (s.includes('fail') || s.includes('invalid') || s.includes('block')) return 'fail';
  if (s.includes('hold') || s.includes('pending')) return 'hold';
  return 'unknown';
}

function buildGateDigest(bundleId) {
  if (!bundleId) return null;
  const byStage = checkpointsByBundle.get(bundleId) || {};
  return STAGE_ORDER.map((stage) => ({
    stage,
    state: byStage[stage] ? checkpointDigestState(byStage[stage].status) : 'pending',
  }));
}

function rememberCheckpoint(data) {
  if (!data.bundle_id) return;
  let byStage = checkpointsByBundle.get(data.bundle_id);
  if (!byStage) {
    byStage = {};
    checkpointsByBundle.set(data.bundle_id, byStage);
  }
  byStage[data.stage] = { status: data.status, reason_code: data.reason_code };
  updateRowGateDigest(data.bundle_id);
}

function updateRowGateDigest(bundleId) {
  const digest = buildGateDigest(bundleId);
  if (!digest) return;
  for (const list of [decisionList, filteredList, blockedList, heldList]) {
    const li = list.querySelector(`[data-bundle-id="${bundleId}"]`);
    const rail = li?.querySelector('.gsr-gate-rail');
    if (rail) {
      rail.outerHTML = GradingStoryRow.renderGateRail(digest);
    }
  }
}

function absorbVitals(row) {
  if (row.action === 'BLOCK' || !row.worker) return;
  gradingVitals.agentScored += 1;
  if (row.cascadeMeta?.llm_invoked || row.worker === 'llm') {
    gradingVitals.llmInvoked += 1;
  }
  if (row.confidence != null && !Number.isNaN(row.confidence)) {
    gradingVitals.confidenceSum += row.confidence;
    gradingVitals.confidenceCount += 1;
  }
  if (row.cascadeMeta?.disagreement_delta >= 15) {
    gradingVitals.disagreements += 1;
  }
}

function renderVitals() {
  vitalScored.textContent = String(gradingVitals.agentScored);
  const llmPct =
    gradingVitals.agentScored > 0
      ? Math.round((gradingVitals.llmInvoked / gradingVitals.agentScored) * 100)
      : 0;
  vitalLlm.textContent =
    gradingVitals.agentScored > 0
      ? `${gradingVitals.llmInvoked} (${llmPct}%)`
      : '0';
  vitalConfidence.textContent =
    gradingVitals.confidenceCount > 0
      ? (gradingVitals.confidenceSum / gradingVitals.confidenceCount).toFixed(2)
      : '—';
  vitalDisagreements.textContent = String(gradingVitals.disagreements);
}

function resetVitals() {
  gradingVitals.agentScored = 0;
  gradingVitals.llmInvoked = 0;
  gradingVitals.confidenceSum = 0;
  gradingVitals.confidenceCount = 0;
  gradingVitals.disagreements = 0;
  renderVitals();
}

function resetSessionMetrics() {
  sessionMetrics = sessionMetricsApi()?.createSessionMetrics() ?? {
    show: 0,
    hide: 0,
    block: 0,
    hold: 0,
    total: 0,
  };
  renderSessionMetrics();
}

function trackDecisionMetrics(action) {
  if (!action || !sessionMetricsApi()) return;
  sessionMetricsApi().applyDecision(sessionMetrics, action);
  renderSessionMetrics();
}

function trackOversightMetrics(resolution) {
  if (!resolution || !sessionMetricsApi()) return;
  sessionMetricsApi().applyOversight(sessionMetrics, resolution);
  renderSessionMetrics();
}

function renderAe1Badge(ae1) {
  if (!ae1Badge || !ae1) return;
  ae1Badge.className = `ae1-badge ae1-${ae1.state}`;
  if (ae1.state === 'collecting') {
    ae1Badge.textContent = `Collecting ${ae1.total}/${ae1.required}`;
    return;
  }
  const rateLabel = sessionMetricsApi()?.formatPercent(ae1.filterRate) ?? '—';
  if (ae1.state === 'ready') {
    ae1Badge.textContent = `AE1 READY ${rateLabel}`;
    return;
  }
  ae1Badge.textContent = `AE1 BELOW ${rateLabel}`;
}

function renderSessionMetrics() {
  const summary = sessionMetricsApi()?.formatMetricsSummary(sessionMetrics);
  if (!summary) return;
  if (metricFilterRate) {
    metricFilterRate.textContent = summary.quietRateLabel;
    metricFilterRate.title = `${summary.quieted} quieted of ${summary.total} scored posts (hidden, blocked, or held)`;
  }
  if (metricSnr) {
    metricSnr.textContent = summary.snrLabel;
    metricSnr.title = `${summary.show} kept visible of ${summary.total} scored posts`;
  }
  if (metricFiltered) {
    metricFiltered.textContent = `${summary.quieted}/${summary.total}`;
    metricFiltered.title = `${summary.filtered} hidden or blocked · ${summary.hold} held of ${summary.total} scored posts`;
  }
  if (metricShow) {
    metricShow.textContent = String(summary.show);
    metricShow.title = `${summary.show} posts kept visible`;
  }
  renderAe1Badge(summary.ae1);
}

function hydrateSessionMetrics() {
  chrome.runtime.sendMessage({ type: 'fetch_session_metrics' }, (counts) => {
    if (!counts || counts.error || !sessionMetricsApi()) return;
    sessionMetrics = sessionMetricsApi().metricsFromCounts(counts);
    renderSessionMetrics();
  });
}

function setConnectionStatus(state) {
  connectionStatus.className = `connection-pill ${state}`;
  const labels = {
    connected: 'Connected',
    disconnected: 'Offline',
    connecting: 'Connecting',
  };
  connectionLabel.textContent = labels[state] || state;
  connectionStatus.title =
    state === 'connected'
      ? 'Harness SSE stream active'
      : state === 'disconnected'
        ? 'Harness unreachable — retrying'
        : 'Connecting to harness…';
  if (connectionFallback) {
    connectionFallback.hidden = state !== 'disconnected';
  }
}

function hydratePanelFromHarness() {
  hydrateSessionMetrics();
  chrome.runtime.sendMessage({ type: 'fetch_recent_decisions' }, (rows) => {
    if (Array.isArray(rows)) hydrateRecentDecisions(rows);
  });
  chrome.runtime.sendMessage({ type: 'fetch_filtered_decisions' }, (rows) => {
    if (Array.isArray(rows)) hydrateFiltered(rows);
  });
  chrome.runtime.sendMessage({ type: 'fetch_alarms' }, (rows) => {
    if (Array.isArray(rows)) hydrateAlarms(rows);
  });
  refreshHeldQueue();
}

function resetSessionMetricsForDemo() {
  hydrateSessionMetrics();
}

function isHumanHitlDecision(data) {
  const worker = data.worker;
  const codes = data.reason_codes || data.reasonCodes || [];
  return worker === 'human' && codes.includes('HITL_RESOLVED');
}

function isSpotlightDecision(row) {
  if (row.action === 'BLOCK' || !row.worker) return false;
  if (row.escalate === true) return true;
  if (row.cascadeMeta?.disagreement_delta >= 15) return true;
  if (row.cascadeMeta?.llm_invoked) return true;
  return false;
}

function spotlightDecisionRow(li, row) {
  if (!isSpotlightDecision(row)) return;

  li.classList.add('gsr-spotlight');
  setTimeout(() => li.classList.remove('gsr-spotlight'), 2400);
  li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  if (row.escalate === true || row.cascadeMeta?.disagreement_delta >= 15) {
    setTimeout(() => {
      GradingStoryRow.expandGradingRow(li, row, { entryPoint: 'recent', activeTab: 'cascade' });
    }, 350);
  }
}

function formatDwell(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function setupCollapsibleSection(toggle, body, { defaultExpanded = true } = {}) {
  if (!toggle || !body) return;
  const expanded = defaultExpanded;
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  body.hidden = !expanded;
  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    body.hidden = isExpanded;
  });
}

function rememberDecisionRow(row) {
  if (row?.bundleId) decisionsByBundle.set(row.bundleId, row);
}

function gradingRowHeader(row, { showBundle = false } = {}) {
  const bundlePart = showBundle ? ` · ${row.bundleId?.slice(0, 18) || '—'}` : '';
  return `<div class="meta">${formatTime(row.decidedAt)}${bundlePart}</div>
     <div class="author">@${row.authorHandle}</div>
     <div class="post-snippet">${row.textSnippet || '—'}</div>`;
}

function mountRowWithGrading(li, row, options) {
  GradingStoryRow.mountGradingStoryRow(li, row, {
    headerHtml: gradingRowHeader(row, options),
    ...options,
  });
}

function formatTime(iso) {
  if (!iso) return new Date().toLocaleTimeString();
  return new Date(iso).toLocaleTimeString();
}

function actionClass(action) {
  if (!action) return '';
  return `sdf-action-${action.toLowerCase()}`;
}

function checkpointClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('pass') || s.includes('ok') || s === 'valid') return 'sdf-checkpoint-pass';
  if (s.includes('fail') || s.includes('invalid') || s.includes('block')) return 'sdf-checkpoint-fail';
  if (s.includes('hold') || s.includes('pending')) return 'sdf-checkpoint-hold';
  return '';
}

function normalizeHeldRow(row) {
  return {
    bundleId: row.bundleId || row.bundle_id,
    action: 'HOLD',
    reasonCodes: row.reasonCodes || ['AGENT_ESCALATION'],
    agentReasons: row.agentReasons || row.agent_reasons || [],
    scoreExplanation: row.scoreExplanation || row.score_explanation || null,
    signalScore: row.signalScore ?? row.signal_score,
    category: row.category,
    worker: row.worker || '—',
    confidence: row.confidence ?? null,
    escalate: row.escalate ?? null,
    cascadeMeta: row.cascadeMeta || row.cascade_meta || null,
    policyLabel: row.policyLabel || row.policy_label || null,
    authorHandle: row.authorHandle || row.author_handle || 'unknown',
    textSnippet: row.textSnippet || row.text_snippet || '',
    createdAt: row.createdAt || row.created_at,
    decidedAt: row.decidedAt || row.decided_at || row.createdAt || row.created_at,
  };
}

function prependItem(list, html, className = '', maxItems = MAX_ITEMS, options = {}) {
  const li = document.createElement('li');
  if (className) li.className = className;
  if (options.bundleId) {
    li.dataset.bundleId = options.bundleId;
    li.classList.add('feed-row-clickable');
    li.title = options.title || 'Open grading story';
  }
  li.innerHTML = html;
  list.prepend(li);
  while (list.children.length > maxItems) {
    list.removeChild(list.lastChild);
  }
  return li;
}

function renderHeldList() {
  heldList.innerHTML = '';
  const rows = [...heldByBundle.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_HELD);

  for (const entry of rows) {
    const li = document.createElement('li');
    li.className = `${actionClass('HOLD')} feed-row-clickable`;
    li.dataset.bundleId = entry.bundleId;
    li.title = 'Review on timeline';
    mountRowWithGrading(li, { ...entry, action: 'HOLD' }, { entryPoint: 'recent' });
    heldList.appendChild(li);
  }

  heldSectionCount.textContent = `(${heldTotal})`;
  if (heldTotal > MAX_HELD) {
    heldOverflow.hidden = false;
    heldOverflow.textContent = `+${heldTotal - MAX_HELD} more in queue`;
  } else {
    heldOverflow.hidden = true;
    heldOverflow.textContent = '';
  }
}

function hydrateHeld(rows, total) {
  heldByBundle.clear();
  heldTotal = total ?? rows?.length ?? 0;
  for (const row of rows || []) {
    const normalized = normalizeHeldRow(row);
    if (!normalized.bundleId) continue;
    heldByBundle.set(normalized.bundleId, normalized);
  }
  renderHeldList();
  if (heldTotal > 0 && !showHeld) {
    // keep collapsed when empty policy; count still visible in stat
  }
}

function setHeldVisible(visible) {
  showHeld = visible;
  heldSection.hidden = !visible;
  heldStat.setAttribute('aria-expanded', visible ? 'true' : 'false');
  heldStat.classList.toggle('active-held', visible || heldTotal > 0);
}

function pulseHeldSection() {
  heldSection.classList.remove('pulse-header');
  heldStat.classList.remove('pulse');
  void heldSection.offsetWidth;
  heldSection.classList.add('pulse-header');
  heldStat.classList.add('pulse');
}

function refreshHeldQueue() {
  Promise.all([
    new Promise((resolve) => chrome.runtime.sendMessage({ type: 'fetch_held' }, resolve)),
    new Promise((resolve) => chrome.runtime.sendMessage({ type: 'fetch_held_decisions' }, resolve)),
  ]).then(([payload, heldDecisions]) => {
    if (!payload || payload.error) return;
    const heldRows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
    const total = typeof payload.total === 'number' ? payload.total : heldRows.length;
    const decisionByBundle = new Map(
      (Array.isArray(heldDecisions) ? heldDecisions : []).map((row) => [row.bundleId || row.bundle_id, row])
    );
    const merged = heldRows.map((row) => {
      const normalized = normalizeHeldRow(row);
      const decision = decisionByBundle.get(normalized.bundleId);
      return decision
        ? normalizeHeldRow({
            ...normalized,
            ...decision,
            signalScore: normalized.signalScore ?? decision.signalScore,
          })
        : normalized;
    });
    hydrateHeld(merged, total);
  });
}

function updateFilteredCounts() {
  hiddenCount = 0;
  blockedCount = 0;
  for (const row of filteredByBundle.values()) {
    if (row.action === 'HIDE') hiddenCount += 1;
    if (row.action === 'BLOCK') blockedCount += 1;
  }
  hiddenCountEl.textContent = String(hiddenCount);
  blockedCountEl.textContent = String(blockedCount);
}

function renderFilteredRows(list, rows, { clickable = false, revealOnTimeline = false, entryPoint = 'filtered' } = {}) {
  list.innerHTML = '';
  for (const entry of rows) {
    rememberDecisionRow(entry);
    const li = document.createElement('li');
    li.className = `${actionClass(entry.action)} gsr-row`;
    if (clickable) {
      li.classList.add('feed-row-clickable');
      li.title = 'Expand grading story';
    }
    mountRowWithGrading(li, entry, { entryPoint, showBundle: true });
    if (revealOnTimeline) {
      const footer = document.createElement('div');
      footer.className = 'trace-footer';
      footer.innerHTML =
        '<button type="button" class="trace-reveal-link sdf-btn-link">View on timeline</button>';
      li.appendChild(footer);
    }
    list.appendChild(li);
  }
}

function renderFilteredList() {
  const hiddenRows = [...filteredByBundle.values()]
    .filter((row) => row.action === 'HIDE')
    .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))
    .slice(0, MAX_FILTERED);
  renderFilteredRows(filteredList, hiddenRows, {
    clickable: true,
    revealOnTimeline: true,
    entryPoint: 'filtered',
  });

  const blockedRows = [...filteredByBundle.values()]
    .filter((row) => row.action === 'BLOCK')
    .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))
    .slice(0, MAX_FILTERED);
  renderFilteredRows(blockedList, blockedRows, {
    clickable: true,
    revealOnTimeline: true,
    entryPoint: 'filtered',
  });

  updateFilteredCounts();
}

function setHiddenVisible(visible) {
  showHidden = visible;
  hiddenSection.hidden = !visible;
  hiddenStat.setAttribute('aria-expanded', visible ? 'true' : 'false');
  hiddenStat.classList.toggle('active-hidden', visible);
}

function setBlockedVisible(visible) {
  showBlocked = visible;
  blockedSection.hidden = !visible;
  blockedStat.setAttribute('aria-expanded', visible ? 'true' : 'false');
  blockedStat.classList.toggle('active-blocked', visible);
}

function upsertFilteredRow(data) {
  if (!['HIDE', 'BLOCK'].includes(data.action)) return;

  const row = normalizeFilteredRow(data);
  if (!row.bundleId) return;

  rememberDecisionRow(row);
  filteredByBundle.set(row.bundleId, row);
  renderFilteredList();
}

function hydrateFiltered(rows) {
  filteredByBundle.clear();
  for (const row of rows || []) {
    const normalized = normalizeFilteredRow(row.bundleId ? row : {
      bundle_id: row.bundleId || row.bundle_id,
      action: row.action,
      reason_codes: row.reasonCodes || row.reason_codes,
      signal_score: row.signalScore ?? row.signal_score,
      category: row.category,
      worker: row.worker,
      confidence: row.confidence,
      escalate: row.escalate,
      cascade_meta: row.cascadeMeta || row.cascade_meta,
      agent_reasons: row.agentReasons || row.agent_reasons,
      score_explanation: row.scoreExplanation || row.score_explanation,
      commit_branch: row.commitBranch || row.commit_branch,
      commit_rationale: row.commitRationale || row.commit_rationale,
      policy_label: row.policyLabel || row.policy_label,
      author_handle: row.authorHandle || row.author_handle,
      text_snippet: row.textSnippet || row.text_snippet,
      decided_at: row.decidedAt || row.decided_at,
    });
    rememberDecisionRow(normalized);
    if (!['HIDE', 'BLOCK'].includes(normalized.action)) continue;
    filteredByBundle.set(normalized.bundleId, normalized);
  }
  renderFilteredList();
}

function expandGradingForBundle(bundleId, entryPoint) {
  const row =
    decisionsByBundle.get(bundleId) ||
    filteredByBundle.get(bundleId) ||
    normalizeFilteredRow({ bundle_id: bundleId, action: '—' });

  for (const list of [filteredList, blockedList, decisionList]) {
    const li = list.querySelector(`[data-bundle-id="${bundleId}"]`);
    if (li) {
      GradingStoryRow.expandGradingRow(li, row, { entryPoint, activeTab: entryPoint === 'checkpoint' ? 'gates' : 'agent' });
      li.scrollIntoView({ block: 'nearest' });
      return;
    }
  }

  GradingStoryRow.expandGradingStoryForBundle(bundleId, entryPoint);
}

function handleGradingRowClick(event) {
  if (event.target.closest('.trace-reveal-link')) return;
  if (event.target.closest('.gsr-expand-btn') || event.target.closest('.gsr-tab')) return;
  const rowEl = event.target.closest('[data-bundle-id]');
  if (!rowEl?.dataset.bundleId) return;
  const entryPoint = rowEl.closest('#checkpoint-list') ? 'checkpoint' : 'filtered';
  expandGradingForBundle(rowEl.dataset.bundleId, entryPoint);
}

function handleDecision(data, { skipMetrics = false } = {}) {
  if (isHumanHitlDecision(data)) return;

  decisionCount += 1;
  decisionCountEl.textContent = String(decisionCount);
  const row = normalizeFilteredRow(data);
  rememberDecisionRow(row);
  absorbVitals(row);
  renderVitals();
  if (!skipMetrics) trackDecisionMetrics(data.action);
  const li = document.createElement('li');
  li.className = `${actionClass(data.action)} gsr-row feed-row-clickable`;
  li.title = 'Expand grading story';
  li.dataset.bundleId = row.bundleId;
  decisionList.prepend(li);
  mountRowWithGrading(li, row, {
    entryPoint: 'recent',
    showBundle: true,
    headerHtml: `<div class="meta">${formatTime(data.decided_at || data.decidedAt)} · ${(data.bundle_id || data.bundleId)?.slice(0, 16)}</div>
     <div class="author">@${row.authorHandle}</div>
     <div class="post-snippet">${row.textSnippet || '—'}</div>`,
  });
  spotlightDecisionRow(li, row);
  while (decisionList.children.length > MAX_ITEMS) {
    decisionList.removeChild(decisionList.lastChild);
  }
  upsertFilteredRow(data);
}

function handleOversight(data) {
  trackOversightMetrics(data.resolution);
  const author = data.author_handle || 'unknown';
  const dwell = formatDwell(data.dwell_ms);
  const notePart = data.optional_note
    ? `<div class="reasons">${escapeHtml(data.optional_note)}</div>`
    : '';
  const li = prependItem(
    decisionList,
    `<div class="meta">${formatTime(data.resolved_at)} · oversight</div>
     <div><span class="oversight-badge">Operator</span> HOLD → ${data.resolution} · @${author} · ${dwell} dwell</div>
     ${notePart}
     <div class="post-snippet">${escapeHtml(data.text_snippet || '—')}</div>`,
    `oversight-row ${actionClass(data.resolution)}`,
    MAX_ITEMS,
    { bundleId: data.bundle_id, title: 'Human oversight resolution' }
  );
  li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function handleAlarm(data) {
  const severity = (data.severity || 'info').toLowerCase();
  const bundleId = data.bundle_id;
  const bundlePart = bundleId
    ? `<div class="reasons">bundle: ${bundleId.slice(0, 22)}</div>`
    : '';
  const investigatePart = bundleId
    ? `<button type="button" class="alarm-bundle-link sdf-btn-link" data-bundle-id="${bundleId}">Investigate grading story</button>`
    : '';
  const extraClass = bundleId ? ' alarm-row-investigable' : '';
  prependItem(
    alarmList,
    `<div class="meta">${data.type} · ${data.severity}</div>
     <div>${data.message}</div>
     ${data.recommended_action ? `<div class="reasons">${data.recommended_action}</div>` : ''}
     ${bundlePart}
     ${investigatePart}`,
    `severity-${severity}${extraClass}`,
    MAX_ITEMS,
    bundleId ? { bundleId, title: 'Investigate linked bundle' } : {}
  );
  if (data.type === 'escalation_queue_full') {
    setHeldVisible(true);
    refreshHeldQueue();
    pulseHeldSection();
  }
  if (severity === 'critical' || severity === 'warning') {
    alarmsToggle?.setAttribute('aria-expanded', 'true');
    if (alarmsBody) alarmsBody.hidden = false;
  }
}

function hydrateAlarms(rows) {
  alarmList.innerHTML = '';
  const ordered = [...(rows || [])].reverse();
  for (const data of ordered) {
    handleAlarm(data);
  }
}

function handleCheckpoint(data) {
  rememberCheckpoint(data);
  const known = decisionsByBundle.get(data.bundle_id);
  const stageLabel = STAGE_LABELS[data.stage] || data.stage;
  const authorPart = known?.authorHandle
    ? `<span class="checkpoint-author"> · @${known.authorHandle}</span>`
    : '';
  const digest = buildGateDigest(data.bundle_id);
  const gateRail = digest ? GradingStoryRow.renderGateRail(digest) : '';

  prependItem(
    checkpointList,
    `<div class="meta">${data.stage} · ${data.status}</div>
     <div><span class="checkpoint-stage-label">${stageLabel}</span>${authorPart}</div>
     <div class="gsr-meta-row">${gateRail}<span class="score">${data.bundle_id?.slice(0, 20) || '—'}${data.reason_code ? ` · ${data.reason_code}` : ''}</span></div>`,
    checkpointClass(data.status),
    MAX_ITEMS,
    { bundleId: data.bundle_id, title: 'Open grading story (Gates tab)' }
  );
}

function hydrateRecentDecisions(rows) {
  decisionList.innerHTML = '';
  decisionCount = 0;
  resetVitals();

  const ordered = [...(rows || [])].sort(
    (a, b) => new Date(b.decidedAt || b.decided_at) - new Date(a.decidedAt || a.decided_at)
  );

  for (const rest of ordered.slice(0, MAX_ITEMS)) {
    const payload = {
      bundle_id: rest.bundleId || rest.bundle_id,
      action: rest.action,
      reason_codes: rest.reasonCodes || rest.reason_codes,
      signal_score: rest.signalScore ?? rest.signal_score,
      category: rest.category,
      worker: rest.worker,
      confidence: rest.confidence,
      escalate: rest.escalate,
      cascade_meta: rest.cascadeMeta || rest.cascade_meta,
      agent_reasons: rest.agentReasons || rest.agent_reasons,
      score_explanation: rest.scoreExplanation || rest.score_explanation,
      commit_branch: rest.commitBranch || rest.commit_branch,
      commit_rationale: rest.commitRationale || rest.commit_rationale,
      policy_label: rest.policyLabel || rest.policy_label,
      author_handle: rest.authorHandle || rest.author_handle,
      text_snippet: rest.textSnippet || rest.text_snippet,
      decided_at: rest.decidedAt || rest.decided_at,
    };
    handleDecision(payload, { skipMetrics: true });
  }
}

function setHeldCount(count) {
  const n = count ?? 0;
  heldTotal = n;
  heldCountEl.textContent = String(n);
  heldSectionCount.textContent = `(${n})`;
  heldStat.classList.toggle('active-held', n > 0 || showHeld);
  heldStat.classList.remove('pulse');
  void heldStat.offsetWidth;
  if (n > 0) heldStat.classList.add('pulse');
  if (n === 0) {
    heldByBundle.clear();
    renderHeldList();
    if (!showHeld) setHeldVisible(false);
  }
}

function setMode(mode) {
  modeBadge.textContent = mode;
  modeBadge.className = `sdf-badge-pill ${mode}`;
}

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'decision':
      handleDecision(message.data);
      break;
    case 'alarm':
      handleAlarm(message.data);
      break;
    case 'checkpoint':
      handleCheckpoint(message.data);
      break;
    case 'held_count':
      setHeldCount(message.data.count);
      refreshHeldQueue();
      break;
    case 'mode':
      setMode(message.data.mode);
      break;
    case 'connection':
      setConnectionStatus(message.data.status);
      break;
    case 'oversight':
      handleOversight(message.data);
      break;
    default:
      break;
  }
});

replayBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'switch_replay' }, (res) => {
    if (res?.mode) setMode(res.mode);
  });
});

if (startDemoBtn) {
  startDemoBtn.addEventListener('click', () => {
    startDemoBtn.disabled = true;
    if (startDemoError) {
      startDemoError.hidden = true;
      startDemoError.textContent = '';
    }
    chrome.runtime.sendMessage({ type: 'start_demo_replay' }, (res) => {
      startDemoBtn.disabled = false;
      if (chrome.runtime.lastError || res?.error) {
        if (startDemoError) {
          startDemoError.textContent =
            res?.error || chrome.runtime.lastError?.message || 'Could not reach harness';
          startDemoError.hidden = false;
        }
        return;
      }
      if (res?.mode) setMode(res.mode);
      resetSessionMetricsForDemo();
      hydratePanelFromHarness();
    });
  });
}

hiddenStat.addEventListener('click', () => {
  setHiddenVisible(!showHidden);
});

blockedStat.addEventListener('click', () => {
  setBlockedVisible(!showBlocked);
});

heldStat.addEventListener('click', () => {
  setHeldVisible(!showHeld);
});

heldList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-bundle-id]');
  if (!row?.dataset.bundleId) return;
  chrome.runtime.sendMessage({ type: 'open_held_review', bundleId: row.dataset.bundleId });
});

filteredList.addEventListener('click', (event) => {
  const reveal = event.target.closest('.trace-reveal-link');
  if (reveal) {
    const row = reveal.closest('[data-bundle-id]');
    if (row?.dataset.bundleId) {
      chrome.runtime.sendMessage({ type: 'reveal_post', bundleId: row.dataset.bundleId });
    }
    return;
  }
  handleGradingRowClick(event);
});

checkpointList.addEventListener('click', handleGradingRowClick);
decisionList.addEventListener('click', handleGradingRowClick);

alarmList.addEventListener('click', (event) => {
  const link = event.target.closest('.alarm-bundle-link');
  const row = event.target.closest('[data-bundle-id]');
  const bundleId = link?.dataset.bundleId || row?.dataset.bundleId;
  if (!bundleId) return;
  expandGradingForBundle(bundleId, 'checkpoint');
});

blockedList.addEventListener('click', (event) => {
  const reveal = event.target.closest('.trace-reveal-link');
  if (reveal) {
    const row = reveal.closest('[data-bundle-id]');
    if (row?.dataset.bundleId) {
      chrome.runtime.sendMessage({ type: 'reveal_post', bundleId: row.dataset.bundleId });
    }
    return;
  }
  handleGradingRowClick(event);
});

chrome.runtime.sendMessage({ type: 'get_state' }, (state) => {
  if (state?.mode) setMode(state.mode);
  if (state?.connectionStatus) setConnectionStatus(state.connectionStatus);
});

hydratePanelFromHarness();

setupCollapsibleSection(checkpointsToggle, checkpointsBody, { defaultExpanded: false });
setupCollapsibleSection(alarmsToggle, alarmsBody, { defaultExpanded: true });

setConnectionStatus('connecting');
refreshHeldQueue();
renderSessionMetrics();

window.filteredByBundle = filteredByBundle;
window.decisionsByBundle = decisionsByBundle;
window.decisionList = decisionList;
