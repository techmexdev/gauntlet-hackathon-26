/* global chrome */

(function (global) {
  const GRADING_TABS = ['agent', 'cascade', 'gates', 'policy'];
  const COMMIT_BRANCH_LABELS = {
    GUARDRAIL_BLOCK: 'Guardrail block (pre-agent)',
    SCORE_ABOVE_THRESHOLD: 'Score at or above show threshold',
    SCORE_BELOW_THRESHOLD: 'Score below show threshold',
    LOW_CONFIDENCE_HIGH_REACH: 'Low confidence on high-reach post',
    AGENT_ESCALATION: 'Agent requested escalation',
    SCHEMA_VIOLATION: 'Schema validation failed',
  };

  let expandedBundleId = null;
  const traceCache = new Map();

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCascadeChip(meta) {
    if (!meta) return '';
    const h = meta.heuristic_score;
    if (h == null) return meta.final_worker || '';
    if (!meta.llm_invoked) return `H:${h}`;
    const llm = meta.llm_score ?? 'L';
    if (meta.disagreement_delta != null) return `H:${h} → L:${llm} Δ${meta.disagreement_delta}`;
    return `H:${h} → L`;
  }

  function renderWorkerBadge(row) {
    if (row.action === 'BLOCK' || !row.worker) return '';
    const isLlm = row.worker === 'llm' || row.cascadeMeta?.llm_invoked;
    const label = isLlm ? 'LLM' : 'H';
    const cls = isLlm ? 'llm' : 'heuristic';
    return `<span class="gsr-worker-badge ${cls}" title="Scoring worker: ${label}">${label}</span>`;
  }

  function renderGateRail(gateDigest) {
    if (!gateDigest?.length) return '';
    const dots = gateDigest
      .map(
        (gate) =>
          `<span class="gsr-gate-dot ${gate.state}" title="${escapeHtml(gate.stage)}: ${gate.state}"></span>`
      )
      .join('');
    const passed = gateDigest.filter((g) => g.state === 'pass').length;
    const failed = gateDigest.filter((g) => g.state === 'fail').length;
    const title = `Gates ${passed}/${gateDigest.length} passed${failed ? ` · ${failed} failed` : ''}`;
    return `<span class="gsr-gate-rail" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${dots}</span>`;
  }

  function defaultTabForEntry(entryPoint) {
    return entryPoint === 'checkpoint' ? 'gates' : 'agent';
  }

  function renderConfidenceBar(confidence) {
    if (confidence == null || Number.isNaN(confidence)) {
      return '<div class="gsr-confidence"><span class="gsr-confidence-label">N/A</span></div>';
    }
    const pct = Math.max(0, Math.min(100, confidence * 100));
    return `<div class="gsr-confidence" title="Confidence ${confidence.toFixed(2)}">
    <div class="gsr-confidence-track">
      <div class="gsr-confidence-fill" style="width:${pct}%"></div>
      <div class="gsr-confidence-marker" style="left:50%"></div>
    </div>
    <span class="gsr-confidence-label">${confidence.toFixed(2)}</span>
  </div>`;
  }

  function actionTag(action) {
    const cls = action?.toLowerCase() || 'block';
    return `<span class="sdf-action-tag ${cls}">${action || '—'}</span>`;
  }

  function truncateExplanation(text, max = 140) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max)}…`;
  }

  function renderCollapsedSummary(row) {
    const scorePart = row.signalScore != null ? `<span class="score"> · ${row.signalScore}</span>` : '';
    const categoryPart = row.category ? `<span class="score"> · ${row.category}</span>` : '';
    const cascade = formatCascadeChip(row.cascadeMeta);
    const cascadeChip = cascade
      ? `<span class="cascade-chip gsr-cascade-chip">${escapeHtml(cascade)}</span>`
      : '';
    const workerBadge = renderWorkerBadge(row);
    const gateRail = renderGateRail(row.gateDigest);
    const explanationPart = row.scoreExplanation
      ? `<p class="gsr-collapsed-explanation">${escapeHtml(truncateExplanation(row.scoreExplanation))}</p>`
      : '';

    return `<div class="gsr-collapsed-head">
    <button type="button" class="gsr-expand-btn" aria-expanded="false" title="Expand grading story">▸</button>
    <div class="gsr-collapsed-main">
      <div>${actionTag(row.action)}${scorePart}${categoryPart}</div>
      ${renderConfidenceBar(row.confidence)}
      <div class="gsr-meta-row">
        ${workerBadge}${cascadeChip}${gateRail}
      </div>
      ${explanationPart}
    </div>
  </div>`;
  }

  function systemReasonCodes(codes = []) {
    const system = new Set([
      'SCORE_ABOVE_THRESHOLD',
      'SCORE_BELOW_THRESHOLD',
      'AGENT_ESCALATION',
      'LOW_CONFIDENCE_HIGH_REACH',
      'SCHEMA_VIOLATION',
      'HITL_RESOLVED',
    ]);
    return codes.filter(
      (code) => system.has(code) || String(code).startsWith('GUARDRAIL_')
    );
  }

  function renderAgentTab(row) {
    if (row.action === 'BLOCK' || !row.worker) {
      return '<p class="gsr-empty">No agent scoring — guardrail or pre-agent path.</p>';
    }
    const parts = [];
    if (row.scoreExplanation) {
      parts.push(`<p class="gsr-score-explanation">${escapeHtml(row.scoreExplanation)}</p>`);
    }
    if (row.agentReasons?.length) {
      const label = row.scoreExplanation ? 'Key signals' : 'Reasons';
      const items = row.agentReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
      parts.push(`<h4 class="gsr-subhead">${label}</h4><ul class="gsr-reason-list">${items}</ul>`);
    } else if (!row.scoreExplanation) {
      parts.push('<p class="gsr-empty">No agent reasons recorded.</p>');
    }
    parts.push(`<dl class="gsr-kv">
    <dt>Category</dt><dd>${escapeHtml(row.category || '—')}</dd>
    <dt>Worker</dt><dd>${escapeHtml(row.worker || '—')}</dd>
    <dt>Confidence</dt><dd>${row.confidence != null ? row.confidence.toFixed(2) : 'N/A'}</dd>
    <dt>Escalate</dt><dd>${row.escalate === true ? 'yes' : row.escalate === false ? 'no' : '—'}</dd>
  </dl>`);
    return parts.join('');
  }

  function renderCascadeTab(row) {
    const meta = row.cascadeMeta;
    if (!meta) {
      return '<p class="gsr-empty">No cascade metadata — heuristic-only or pre-agent.</p>';
    }
    const grayHint =
      meta.heuristic_score != null && meta.heuristic_score >= 30 && meta.heuristic_score <= 60
        ? '<p class="gsr-hint">Heuristic score in gray band (30–60) — LLM may have been invoked.</p>'
        : '';
    const limitHint =
      meta.branch_trigger === 'llm_limit'
        ? '<p class="gsr-hint gsr-hint-warn">LLM budget exhausted for this session — heuristic path only.</p>'
        : '';
    return `${grayHint}${limitHint}<dl class="gsr-kv">
    <dt>LLM invoked</dt><dd>${meta.llm_invoked ? 'yes' : 'no'}</dd>
    <dt>Heuristic score</dt><dd>${meta.heuristic_score ?? '—'}</dd>
    <dt>Branch trigger</dt><dd>${escapeHtml(meta.branch_trigger || '—')}</dd>
    <dt>Disagreement Δ</dt><dd>${meta.disagreement_delta ?? '—'}</dd>
    <dt>Latency</dt><dd>${meta.latency_ms != null ? `${meta.latency_ms} ms` : '—'}</dd>
    <dt>Final worker</dt><dd>${escapeHtml(meta.final_worker || row.worker || '—')}</dd>
  </dl>`;
  }

  function renderPolicyTab(row) {
    const branch = row.commitBranch;
    const label = COMMIT_BRANCH_LABELS[branch] || branch || row.policyLabel || '—';
    const rationale = row.commitRationale || {};
    const harnessCodes = systemReasonCodes(row.reasonCodes);
    const codeList = harnessCodes.length
      ? `<ul class="gsr-reason-list">${harnessCodes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
      : '<p class="gsr-empty">No harness reason codes.</p>';

    return `<p class="gsr-policy-branch"><strong>${escapeHtml(label)}</strong></p>
    <dl class="gsr-kv">
      <dt>Show threshold</dt><dd>${rationale.show_threshold ?? '—'}</dd>
      <dt>Likes (reach)</dt><dd>${rationale.likes ?? '—'}</dd>
      <dt>Guardrail passed</dt><dd>${rationale.guardrail_passed === false ? 'no' : rationale.guardrail_passed ? 'yes' : '—'}</dd>
      <dt>Confidence</dt><dd>${rationale.confidence != null ? rationale.confidence : row.confidence ?? '—'}</dd>
      <dt>Escalate flag</dt><dd>${rationale.escalate != null ? rationale.escalate : row.escalate ?? '—'}</dd>
    </dl>
    <h4 class="gsr-subhead">Harness reason codes</h4>
    ${codeList}`;
  }

  function checkpointClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('pass') || s.includes('ok') || s === 'valid') return 'sdf-checkpoint-pass';
    if (s.includes('fail') || s.includes('invalid') || s.includes('block')) return 'sdf-checkpoint-fail';
    if (s.includes('hold') || s.includes('pending')) return 'sdf-checkpoint-hold';
    return '';
  }

  function renderToolCalls(toolCalls) {
    if (!toolCalls?.length) return '';
    const items = toolCalls
      .map((call) => {
        const output =
          call.output == null
            ? '—'
            : typeof call.output === 'string'
              ? call.output
              : JSON.stringify(call.output);
        return `<div class="trace-tool-call">
      <div class="trace-tool-head"><strong>${escapeHtml(call.name)}</strong> · ${escapeHtml(call.status || 'ok')} · ${call.latency_ms ?? '—'}ms</div>
      <div class="trace-meta">${escapeHtml(output)}</div>
    </div>`;
      })
      .join('');
    return `<div class="trace-tool-section"><div class="trace-stage-head">LLM tool calls</div>${items}</div>`;
  }

  function renderTraceStage(cp, trace) {
    const labels = {
      'CP-0': 'Material Handler — normalized',
      'CP-1': 'Guardrails',
      'CP-2': 'Agent scored',
      'CP-3': 'Schema valid',
      'CP-4': 'Confidence checked',
      'CP-5': 'Decision committed',
    };
    const statusClass = checkpointClass(cp.status);
    let detail = '';

    if (cp.stage === 'CP-0' && trace.normalized) {
      detail = `<div class="trace-body">${escapeHtml(trace.normalized.text || '')}</div>
      <div class="trace-meta">hash: ${escapeHtml(trace.content_hash || '—')}</div>`;
    }

    if (cp.stage === 'CP-2' && cp.payload?.agentOutput) {
      const ao = cp.payload.agentOutput;
      const explanation = ao.explanation?.trim();
      const explanationPart = explanation
        ? `<p class="trace-explanation">${escapeHtml(explanation)}</p>`
        : '';
      detail = `<div class="trace-body">score ${ao.signal_score ?? '—'} · ${escapeHtml(ao.category || '—')} · ${escapeHtml((ao.reasons || []).join(', '))}</div>${explanationPart}`;
    }

    if (cp.stage === 'CP-2' && cp.payload?.tool_calls?.length) {
      detail += renderToolCalls(cp.payload.tool_calls);
    }

    if (cp.reason_code) {
      detail += `<div class="trace-meta reason-guardrail">${escapeHtml(cp.reason_code)}</div>`;
    }

    return `<div class="trace-stage ${statusClass}">
    <div class="trace-stage-head"><strong>${labels[cp.stage] || cp.stage}</strong> · ${escapeHtml(cp.status)}</div>
    ${detail}
  </div>`;
  }

  function renderTraceBody(trace) {
    if (!trace || trace.error) {
      return `<p class="gsr-empty">${escapeHtml(trace?.error || 'Trace unavailable for this bundle.')}</p>`;
    }
    const stages = (trace.checkpoints || []).map((cp) => renderTraceStage(cp, trace)).join('');
    const decision = trace.decision
      ? `<div class="trace-decision">${actionTag(trace.decision.action)} · ${trace.decision.signal_score ?? '—'}</div>`
      : '';
    return `<div class="trace-title">Gate chain · ${escapeHtml(trace.bundle_id)}</div>
    ${stages || '<div class="trace-meta">No checkpoints recorded</div>'}
    ${decision}`;
  }

  function renderTabStrip(activeTab) {
    const labels = { agent: 'Agent', cascade: 'Cascade', gates: 'Gates', policy: 'Policy' };
    return `<div class="gsr-tabs" role="tablist">
    ${GRADING_TABS.map(
      (tab) =>
        `<button type="button" class="gsr-tab${tab === activeTab ? ' active' : ''}" role="tab" data-tab="${tab}" aria-selected="${tab === activeTab}">${labels[tab]}</button>`
    ).join('')}
  </div>`;
  }

  function renderTabContent(tab, row) {
    switch (tab) {
      case 'agent':
        return renderAgentTab(row);
      case 'cascade':
        return renderCascadeTab(row);
      case 'gates':
        return '<div class="gsr-loading">Loading gate trace…</div>';
      case 'policy':
        return renderPolicyTab(row);
      default:
        return '';
    }
  }

  function collapseOtherRows(currentLi) {
    document.querySelectorAll('.gsr-expanded').forEach((el) => {
      if (el !== currentLi) {
        el.classList.remove('gsr-expanded');
        el.querySelector('.gsr-expand-btn')?.setAttribute('aria-expanded', 'false');
        el.querySelector('.gsr-expanded-panel')?.remove();
      }
    });
  }

  function fetchTrace(bundleId) {
    if (traceCache.has(bundleId)) {
      return Promise.resolve(traceCache.get(bundleId));
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'fetch_trace', bundleId }, (trace) => {
        traceCache.set(bundleId, trace);
        resolve(trace);
      });
    });
  }

  function ensureGatesContent(panel, row, bundleId) {
    const gatesPanel = panel.querySelector('[data-tab-panel="gates"]');
    if (!gatesPanel || gatesPanel.dataset.loaded === 'true') return;

    gatesPanel.innerHTML = '<div class="gsr-loading">Loading gate trace…</div>';
    fetchTrace(bundleId).then((trace) => {
      if (!panel.isConnected) return;
      gatesPanel.dataset.loaded = 'true';
      gatesPanel.innerHTML = renderTraceBody(trace);
    });
  }

  function switchTab(li, row, tab, bundleId) {
    const panel = li.querySelector('.gsr-expanded-panel');
    if (!panel) return;

    panel.querySelectorAll('.gsr-tab').forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panel.querySelectorAll('[data-tab-panel]').forEach((el) => {
      el.hidden = el.dataset.tabPanel !== tab;
    });

    if (tab === 'gates') {
      ensureGatesContent(panel, row, bundleId);
    }
  }

  function mountExpandedPanel(li, row, options) {
    const tab = options.activeTab || defaultTabForEntry(options.entryPoint);
    const bundleId = row.bundleId;

    const panel = document.createElement('div');
    panel.className = 'gsr-expanded-panel';
    panel.innerHTML = `${renderTabStrip(tab)}
    <div class="gsr-tab-panels">
      ${GRADING_TABS.map(
        (t) =>
          `<div class="gsr-tab-panel" data-tab-panel="${t}" role="tabpanel"${t !== tab ? ' hidden' : ''}>${renderTabContent(t, row)}</div>`
      ).join('')}
    </div>`;

    li.appendChild(panel);

    panel.querySelectorAll('.gsr-tab').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        switchTab(li, row, btn.dataset.tab, bundleId);
      });
    });

    if (tab === 'gates') {
      ensureGatesContent(panel, row, bundleId);
    }
  }

  function toggleExpand(li, row, options) {
    const isExpanded = li.classList.contains('gsr-expanded');
    if (expandedBundleId === row.bundleId && isExpanded) {
      li.classList.remove('gsr-expanded');
      li.querySelector('.gsr-expand-btn')?.setAttribute('aria-expanded', 'false');
      li.querySelector('.gsr-expanded-panel')?.remove();
      expandedBundleId = null;
      return;
    }

    collapseOtherRows(li);
    li.querySelector('.gsr-expanded-panel')?.remove();
    li.classList.add('gsr-expanded');
    li.querySelector('.gsr-expand-btn')?.setAttribute('aria-expanded', 'true');
    expandedBundleId = row.bundleId;
    mountExpandedPanel(li, row, options);
  }

  function mountGradingStoryRow(li, row, options = {}) {
    const headerHtml = options.headerHtml || '';
    li.classList.add('gsr-row');
    if (row.bundleId) li.dataset.bundleId = row.bundleId;

    li.innerHTML = `${headerHtml}${renderCollapsedSummary(row)}`;

    const expandBtn = li.querySelector('.gsr-expand-btn');
    expandBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleExpand(li, row, options);
    });
  }

  function normalizeGradingRow(data) {
    return {
      bundleId: data.bundle_id || data.bundleId,
      action: data.action,
      reasonCodes: data.reason_codes || data.reasonCodes || [],
      signalScore: data.signal_score ?? data.signalScore ?? null,
      category: data.category ?? null,
      worker: data.worker ?? null,
      confidence: data.confidence ?? null,
      escalate: data.escalate ?? null,
      cascadeMeta: data.cascade_meta || data.cascadeMeta || null,
      agentReasons: data.agent_reasons || data.agentReasons || [],
      scoreExplanation: data.score_explanation || data.scoreExplanation || null,
      commitBranch: data.commit_branch || data.commitBranch || null,
      commitRationale: data.commit_rationale || data.commitRationale || null,
      policyLabel: data.policy_label || data.policyLabel || null,
      authorHandle: data.author_handle || data.authorHandle || 'unknown',
      textSnippet: data.text_snippet || data.textSnippet || '',
      decidedAt: data.decided_at || data.decidedAt,
      gateDigest: data.gateDigest || data.gate_digest || null,
    };
  }

  function findRowForBundle(bundleId) {
    const fromFiltered = global.filteredByBundle?.get?.(bundleId);
    if (fromFiltered) return fromFiltered;
    const li = document.querySelector(`[data-bundle-id="${bundleId}"]`);
    if (li?.dataset.gradingRow) {
      try {
        return JSON.parse(li.dataset.gradingRow);
      } catch {
        return null;
      }
    }
    return null;
  }

  function expandGradingStoryForBundle(bundleId, entryPoint = 'checkpoint') {
    let li = document.querySelector(`li[data-bundle-id="${bundleId}"]`);
    const row = findRowForBundle(bundleId) || normalizeGradingRow({ bundle_id: bundleId, action: '—' });

    if (!li) {
      li = document.createElement('li');
      li.className = 'gsr-row feed-row-clickable';
      global.decisionList?.prepend(li);
    }

    collapseOtherRows(li);
    li.classList.add('gsr-expanded', 'feed-row-clickable');
    li.dataset.bundleId = bundleId;
    if (!li.querySelector('.gsr-collapsed-head')) {
      mountGradingStoryRow(li, row, { entryPoint, headerHtml: '' });
    }
    li.querySelector('.gsr-expanded-panel')?.remove();
    li.querySelector('.gsr-expand-btn')?.setAttribute('aria-expanded', 'true');
    expandedBundleId = bundleId;
    mountExpandedPanel(li, row, { entryPoint, activeTab: defaultTabForEntry(entryPoint) });
    li.scrollIntoView({ block: 'nearest' });
    return true;
  }

  global.GradingStoryRow = {
    mountGradingStoryRow,
    expandGradingRow: (li, row, options) => {
      collapseOtherRows(li);
      li.classList.add('gsr-expanded');
      li.querySelector('.gsr-expanded-panel')?.remove();
      li.querySelector('.gsr-expand-btn')?.setAttribute('aria-expanded', 'true');
      expandedBundleId = row.bundleId;
      mountExpandedPanel(li, row, options);
    },
    normalizeGradingRow,
    formatCascadeChip,
    renderGateRail,
    expandGradingStoryForBundle,
  };
})(window);
