(() => {
  let dead = false;
  let dock = null;
  let drawer = null;
  let reviewPanel = null;
  let hiddenRows = [];
  let passedRows = [];
  let heldPosts = [];
  let heldTotal = 0;
  let heldMeta = new Map();
  let drawerOpen = false;
  let drawerMode = 'blocked';
  let heldTab = 'pre_llm';
  let reviewOpen = false;

  function teardown() {
    if (dead) return;
    dead = true;
    drawerOpen = false;
    reviewOpen = false;
    setHudDrawerOpen(false);
    setReviewTarget(null);
    dock?.remove();
    drawer?.remove();
    reviewPanel?.remove();
  }

  sdfRuntime.onInvalidate(teardown);

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function postPreview(bundleId) {
    return window.sdfPostPreview?.getPostPreview(bundleId) ?? null;
  }

  function cacheHeldMeta(data) {
    const bundleId = data.bundle_id || data.bundleId;
    if (!bundleId) return;
    heldMeta.set(bundleId, {
      authorHandle: data.author_handle || data.authorHandle || null,
      textSnippet: data.text_snippet || data.textSnippet || '',
      signalScore: data.signal_score ?? data.signalScore ?? null,
      reasonCodes: data.reason_codes || data.reasonCodes || [],
      scoreExplanation: data.score_explanation || data.scoreExplanation || null,
      agentReasons: data.agent_reasons || data.agentReasons || [],
      confidence: data.confidence ?? null,
      escalate: data.escalate ?? null,
      worker: data.worker || null,
      cascadeMeta: data.cascade_meta || data.cascadeMeta || null,
    });
  }

  function holdReasonForPost(post) {
    const meta = heldMeta.get(post.bundleId);
    return window.sdfHoldReason?.buildHoldReason({
      reasonCodes: post.reasonCodes || meta?.reasonCodes,
      scoreExplanation: post.scoreExplanation || meta?.scoreExplanation,
      agentReasons: post.agentReasons || meta?.agentReasons,
      confidence: post.confidence ?? meta?.confidence,
      escalate: post.escalate ?? meta?.escalate,
      worker: post.worker || meta?.worker,
      cascadeMeta: post.cascadeMeta || meta?.cascadeMeta,
      score: post.signalScore ?? meta?.signalScore ?? null,
    }) || {
      summary: 'Filter is unsure',
      inline: post.scoreExplanation || post.agentReasons?.join('; ') || 'Borderline signal score',
      detail: null,
      tooltip: 'Filter is unsure',
    };
  }

  function reviewContext(post) {
    const preview = postPreview(post.bundleId);
    const meta = heldMeta.get(post.bundleId);
    const handle = preview?.handle || meta?.authorHandle || null;
    const snippet = preview?.text || meta?.textSnippet || '';
    const displayName = preview?.displayName || (handle ? `@${handle}` : null);
    const inFeed = Boolean(preview?.inFeed);

    return {
      handle,
      displayName,
      snippet,
      inFeed,
      signalScore: post.signalScore ?? meta?.signalScore ?? null,
    };
  }

  function setReviewTarget(bundleId) {
    document.dispatchEvent(new CustomEvent('sdf:review-target', { detail: { bundleId } }));
  }

  function focusReviewPost(bundleId) {
    if (!bundleId) return;
    setReviewTarget(bundleId);
    scrollToPost(bundleId);
  }

  function blockedCount() {
    return hiddenRows.filter((r) => r.action === 'BLOCK').length;
  }

  function hiddenCount() {
    return hiddenRows.filter((r) => r.action === 'HIDE').length;
  }

  function passedCount() {
    return passedRows.length;
  }

  function ensureDock() {
    const anchor = window.sdfHudAnchor;
    const hud = anchor?.ensureHud?.() ?? document.getElementById('sdf-hud');
    const slot = document.getElementById(anchor?.dockSlotId ?? 'sdf-dock-slot');

    if (dock?.isConnected && dock.parentElement === slot) return dock;

    dock?.remove();
    dock = document.createElement('div');
    dock.id = 'sdf-dock';
    dock.className = 'sdf-panel';
    (slot || hud || document.body).appendChild(dock);
    dock.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sdf-action]');
      if (!btn || dead) return;
      if (btn.dataset.sdfAction === 'passed') {
        drawerMode = 'passed';
        drawerOpen = true;
        reviewOpen = false;
        renderDrawer();
        renderReview();
      }
      if (btn.dataset.sdfAction === 'hidden') {
        drawerMode = 'hidden';
        drawerOpen = true;
        reviewOpen = false;
        renderDrawer();
        renderReview();
      }
      if (btn.dataset.sdfAction === 'blocked') {
        drawerMode = 'blocked';
        drawerOpen = true;
        reviewOpen = false;
        renderDrawer();
        renderReview();
      }
      if (btn.dataset.sdfAction === 'review') {
        drawerMode = 'held';
        drawerOpen = true;
        reviewOpen = false;
        setReviewTarget(null);
        syncHeldTabForDrawer();
        renderDrawer();
        renderReview();
      }
    });
    return dock;
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('aside');
    drawer.id = 'sdf-hidden-drawer';
    drawer.className = 'sdf-panel';
    drawer.innerHTML = `
      <div class="drawer-backdrop" data-sdf-action="close-drawer"></div>
      <div class="drawer-sheet">
        <header class="drawer-header">
          <div>
            <h2 class="drawer-title" id="sdf-drawer-title">Blocked posts</h2>
            <p class="drawer-subtitle" id="sdf-drawer-subtitle">Guardrail rejections removed from your timeline.</p>
          </div>
          <button type="button" class="drawer-close" data-sdf-action="close-drawer" aria-label="Close">×</button>
        </header>
        <div class="drawer-tabs" id="sdf-drawer-tabs" hidden>
          <button type="button" class="drawer-tab" data-held-tab="pre_llm">
            Pre-LLM <span class="drawer-tab-count" id="sdf-held-tab-pre-count">0</span>
          </button>
          <button type="button" class="drawer-tab" data-held-tab="llm">
            LLM reviewed <span class="drawer-tab-count" id="sdf-held-tab-llm-count">0</span>
          </button>
        </div>
        <div class="drawer-body" id="sdf-drawer-list"></div>
      </div>
    `;
    document.body.appendChild(drawer);

    drawer.addEventListener('click', (e) => {
      if (dead) return;
      const action = e.target.closest('[data-sdf-action]')?.dataset.sdfAction;
      if (action === 'close-drawer') {
        drawerOpen = false;
        renderDrawer();
        return;
      }
      const heldTabBtn = e.target.closest('[data-held-tab]');
      if (heldTabBtn) {
        heldTab = heldTabBtn.dataset.heldTab;
        renderDrawer();
        return;
      }
      const restoreBtn = e.target.closest('[data-restore]');
      if (restoreBtn) {
        restorePost(restoreBtn.dataset.restore);
        return;
      }
      const heldBtn = e.target.closest('[data-held-review]');
      if (heldBtn) {
        openHeldReview(heldBtn.dataset.heldReview);
        return;
      }
      const findBtn = e.target.closest('[data-find]');
      if (findBtn) {
        scrollToPost(findBtn.dataset.find);
        return;
      }
      const heldCard = e.target.closest('.drawer-card[data-held-review]');
      if (heldCard) {
        openHeldReview(heldCard.dataset.heldReview);
        return;
      }
      const card = e.target.closest('.drawer-card[data-find]');
      if (card) {
        scrollToPost(card.dataset.find);
        drawerOpen = false;
        renderDrawer();
      }
    });

    return drawer;
  }

  function ensureReviewPanel() {
    if (reviewPanel) return reviewPanel;
    reviewPanel = document.createElement('div');
    reviewPanel.id = 'sdf-review-panel';
    reviewPanel.className = 'sdf-panel';
    document.body.appendChild(reviewPanel);
    return reviewPanel;
  }

  function scrollToPost(bundleId) {
    document.dispatchEvent(new CustomEvent('sdf:scroll-to', { detail: { bundleId } }));
    drawerOpen = false;
    renderDrawer();
  }

  function restorePost(bundleId) {
    const row = hiddenRows.find((r) => r.bundleId === bundleId);
    document.dispatchEvent(
      new CustomEvent('sdf:override', {
        detail: {
          bundle_id: bundleId,
          action: 'SHOW',
          reason_codes: ['OPERATOR_RESTORED'],
          signal_score: row?.signalScore ?? null,
        },
      })
    );
    hiddenRows = hiddenRows.filter((r) => r.bundleId !== bundleId);
    renderDock();
    renderDrawer();
  }

  function renderDock() {
    if (dead) return;
    const el = ensureDock();
    const hidden = hiddenCount();
    const blocked = blockedCount();
    const passed = passedCount();

    el.innerHTML = `
      <button type="button" class="dock-btn dock-btn-passed" data-sdf-action="passed">
        <span class="dock-label">Passed</span>
        <span class="dock-count">${passed}</span>
      </button>
      <button type="button" class="dock-btn dock-btn-hidden" data-sdf-action="hidden">
        <span class="dock-label">Hidden</span>
        <span class="dock-count">${hidden}</span>
      </button>
      <button type="button" class="dock-btn dock-btn-blocked" data-sdf-action="blocked">
        <span class="dock-label">Blocked</span>
        <span class="dock-count">${blocked}</span>
      </button>
      <button type="button" class="dock-btn dock-btn-review" data-sdf-action="review">
        <span class="dock-label">Alarms (Needs review)</span>
        <span class="dock-count">${heldTotal}</span>
      </button>
    `;
  }

  function normalizeHeldRow(row) {
    return {
      bundleId: row.bundleId || row.bundle_id,
      reasonCodes: row.reasonCodes || row.reason_codes || ['AGENT_ESCALATION'],
      agentReasons: row.agentReasons || row.agent_reasons || [],
      scoreExplanation: row.scoreExplanation || row.score_explanation || null,
      signalScore: row.signalScore ?? row.signal_score ?? null,
      worker: row.worker || null,
      confidence: row.confidence ?? null,
      escalate: row.escalate ?? null,
      cascadeMeta: row.cascadeMeta || row.cascade_meta || null,
      authorHandle: row.authorHandle || row.author_handle || 'unknown',
      textSnippet: row.textSnippet || row.text_snippet || '',
      createdAt: row.createdAt || row.created_at,
      decidedAt: row.decidedAt || row.decided_at || row.createdAt || row.created_at,
    };
  }

  function heldReviewBucket(post) {
    const meta = heldMeta.get(post.bundleId);
    return (
      window.sdfHoldReason?.getHeldReviewBucket({
        cascadeMeta: post.cascadeMeta || meta?.cascadeMeta || null,
        worker: post.worker || meta?.worker || null,
      }) || 'pre_llm'
    );
  }

  function partitionHeldPosts() {
    const sorted = [...heldPosts].sort(
      (a, b) => new Date(b.createdAt || b.decidedAt) - new Date(a.createdAt || a.decidedAt)
    );
    const preLlm = [];
    const llm = [];
    for (const post of sorted) {
      if (heldReviewBucket(post) === 'llm') llm.push(post);
      else preLlm.push(post);
    }
    return { preLlm, llm };
  }

  function syncHeldTabForDrawer() {
    const { preLlm, llm } = partitionHeldPosts();
    if (heldTab === 'pre_llm' && !preLlm.length && llm.length) heldTab = 'llm';
    else if (heldTab === 'llm' && !llm.length && preLlm.length) heldTab = 'pre_llm';
  }

  function heldReasonsText(post) {
    const meta = heldMeta.get(post.bundleId);
    const explanation = post.scoreExplanation || meta?.scoreExplanation;
    if (explanation) return explanation;
    const reasons = post.agentReasons || meta?.agentReasons || [];
    if (reasons.length) return reasons.join(', ');
    return post.reasonCodes?.join(', ') || '—';
  }

  function renderHeldDrawerTabs() {
    const tabs = drawer?.querySelector('#sdf-drawer-tabs');
    if (!tabs) return;

    const { preLlm, llm } = partitionHeldPosts();
    tabs.hidden = false;
    tabs.querySelector('#sdf-held-tab-pre-count').textContent = String(preLlm.length);
    tabs.querySelector('#sdf-held-tab-llm-count').textContent = String(llm.length);
    for (const btn of tabs.querySelectorAll('[data-held-tab]')) {
      btn.classList.toggle('active', btn.dataset.heldTab === heldTab);
    }
  }

  function renderHeldDrawerList(list) {
    renderHeldDrawerTabs();

    const { preLlm, llm } = partitionHeldPosts();
    const rows = heldTab === 'llm' ? llm : preLlm;

    if (!heldPosts.length) {
      list.innerHTML = `<div class="drawer-empty">
        No posts need review yet…
        Borderline posts awaiting your call appear here.
      </div>`;
      return;
    }

    if (!rows.length) {
      list.innerHTML =
        heldTab === 'llm'
          ? `<div class="drawer-empty">
        No LLM-reviewed holds in queue.
        Posts the model scored and escalated appear here.
      </div>`
          : `<div class="drawer-empty">
        No pre-LLM holds in queue.
        Heuristic-only borderline posts appear here.
      </div>`;
      return;
    }

    const cards = rows
      .map((row) => {
        const ctx = reviewContext(row);
        const author = ctx.handle ? `@${ctx.handle}` : `@${row.authorHandle || 'unknown'}`;
        const snippet = ctx.snippet || row.textSnippet || '—';
        const reasons = heldReasonsText(row);
        const score = row.signalScore != null ? `Score ${row.signalScore}` : '';
        const reasonClass =
          row.scoreExplanation || heldMeta.get(row.bundleId)?.scoreExplanation
            ? 'drawer-explanation'
            : 'drawer-reasons';
        return `
        <article class="drawer-card drawer-card-clickable sdf-action-hold" data-held-review="${escapeHtml(row.bundleId)}" role="button" tabindex="0" title="Review on timeline">
          <div class="drawer-card-meta">
            <span class="sdf-action-tag hold">HOLD</span>
            ${score ? `<span class="drawer-score">${score}</span>` : ''}
          </div>
          <div class="drawer-author">${escapeHtml(author)}</div>
          <p class="drawer-snippet">${escapeHtml(snippet)}</p>
          <div class="${reasonClass}">${escapeHtml(reasons)}</div>
          <div class="drawer-card-actions">
            <span class="drawer-hint">Click to review on timeline</span>
          </div>
        </article>`;
      })
      .join('');

    const overflow =
      heldTotal > heldPosts.length
        ? `<p class="drawer-overflow">+${heldTotal - heldPosts.length} more in queue</p>`
        : '';

    list.innerHTML = cards + overflow;
  }

  function renderDrawerList() {
    const list = drawer?.querySelector('#sdf-drawer-list');
    const tabs = drawer?.querySelector('#sdf-drawer-tabs');
    if (!list) return;

    if (drawerMode === 'held') {
      renderHeldDrawerList(list);
      return;
    }

    if (tabs) tabs.hidden = true;

    const rows =
      drawerMode === 'passed'
        ? [...passedRows].sort(
            (a, b) =>
              (b.signalScore ?? -1) - (a.signalScore ?? -1) ||
              new Date(b.decidedAt) - new Date(a.decidedAt)
          )
        : hiddenRows
            .filter((r) => r.action === (drawerMode === 'hidden' ? 'HIDE' : 'BLOCK'))
            .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt));

    if (!rows.length) {
      list.innerHTML =
        drawerMode === 'passed'
          ? `<div class="drawer-empty">
        No passed posts yet.
        High-signal posts kept visible appear here.
      </div>`
          : drawerMode === 'hidden'
            ? `<div class="drawer-empty">
        No hidden posts yet.
        Low-signal posts appear here.
      </div>`
            : `<div class="drawer-empty">
        No blocked posts yet.
        Guardrail rejections appear here.
      </div>`;
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const reasons =
          row.scoreExplanation ||
          row.agentReasons?.join('; ') ||
          (row.reasonCodes || []).join(', ') ||
          '—';
        const score = row.signalScore != null ? `Score ${row.signalScore}` : '';
        const isBlock = row.action === 'BLOCK';
        const isPassed = drawerMode === 'passed';
        const actionTag = isPassed ? 'show' : row.action.toLowerCase();
        const actionLabel = isPassed ? 'SHOW' : row.action;
        return `
        <article class="drawer-card drawer-card-clickable sdf-action-${actionTag}" data-find="${escapeHtml(row.bundleId)}" role="button" tabindex="0" title="View original post on timeline">
          <div class="drawer-card-meta">
            <span class="sdf-action-tag ${actionTag}">${actionLabel}</span>
            ${score ? `<span class="drawer-score">${score}</span>` : ''}
          </div>
          <div class="drawer-author">@${escapeHtml(row.authorHandle || 'unknown')}</div>
          <p class="drawer-snippet">${escapeHtml(row.textSnippet || '—')}</p>
          <div class="${row.scoreExplanation ? 'drawer-explanation' : 'drawer-reasons'}">${escapeHtml(reasons)}</div>
          <div class="drawer-card-actions">
            ${
              isBlock || isPassed
                ? `<span class="drawer-hint">Click to view on timeline</span>`
                : `<button type="button" class="sdf-btn sdf-btn-show" data-restore="${escapeHtml(row.bundleId)}">Restore to feed</button>
                   <button type="button" class="sdf-btn drawer-btn-ghost" data-find="${escapeHtml(row.bundleId)}">Find on timeline</button>`
            }
          </div>
        </article>`;
      })
      .join('');
  }

  function setHudDrawerOpen(open) {
    document.getElementById('sdf-hud')?.classList.toggle('sdf-hud-drawer-open', open);
  }

  function renderDrawer() {
    if (dead) return;
    setHudDrawerOpen(drawerOpen);
    if (!drawerOpen) {
      drawer?.classList.remove('open');
      return;
    }

    const el = ensureDrawer();
    el.classList.add('open');

    const title = el.querySelector('#sdf-drawer-title');
    const subtitle = el.querySelector('#sdf-drawer-subtitle');
    if (title) {
      if (drawerMode === 'held') title.textContent = 'Posts needing review';
      else if (drawerMode === 'passed') title.textContent = 'Passed posts';
      else title.textContent = drawerMode === 'hidden' ? 'Hidden posts' : 'Blocked posts';
    }
    if (subtitle) {
      if (drawerMode === 'held') {
        subtitle.textContent =
          heldTab === 'llm'
            ? 'Model scored these posts and escalated for your call.'
            : 'Heuristic scored before LLM — filter could not decide.';
      } else if (drawerMode === 'passed') {
        subtitle.textContent = 'High-signal posts kept visible in your feed.';
      } else {
        subtitle.textContent =
          drawerMode === 'hidden'
            ? 'Low-signal posts removed from your timeline.'
            : 'Guardrail rejections removed from your timeline.';
      }
    }

    renderDrawerList();
  }

  function renderReview() {
    if (dead) return;
    const el = ensureReviewPanel();

    if (!reviewOpen || !heldPosts.length) {
      el.classList.remove('visible');
      el.innerHTML = '';
      setReviewTarget(null);
      return;
    }

    const post = heldPosts[0];
    const ctx = reviewContext(post);
    const holdWhy = holdReasonForPost(post);
    const authorLabel = ctx.displayName || (ctx.handle ? `@${ctx.handle}` : 'Unknown author');
    const snippet =
      ctx.snippet || 'Could not load post text — use "Show in feed" to find the highlighted post.';
    const queueNote =
      heldTotal > 1 ? `<p class="review-queue">${heldTotal - 1} more after this one</p>` : '';

    setReviewTarget(post.bundleId);

    el.classList.add('visible');
    el.innerHTML = `
      <div class="review-header">
        <div>
          <span class="review-title">Needs your review</span>
          <span class="review-count">${heldTotal} pending</span>
        </div>
        <button type="button" class="review-close" data-close-review aria-label="Close">×</button>
      </div>
      <p class="review-explainer">${escapeHtml(holdWhy.summary)}. <strong>Show</strong> keeps it; <strong>Low signal</strong> hides it; <strong>Guardrail</strong> blocks it.</p>
      <div class="review-post">
        <div class="review-post-label">
          <span class="review-post-tag">Reviewing</span>
          ${ctx.inFeed ? '<span class="review-post-hint">highlighted in your feed</span>' : '<span class="review-post-hint">not currently visible</span>'}
        </div>
        <div class="review-handle">${escapeHtml(authorLabel)}</div>
        <p class="review-snippet">${escapeHtml(snippet.slice(0, 200))}${snippet.length > 200 ? '…' : ''}</p>
        ${ctx.signalScore != null ? `<div class="review-score">Signal score ${ctx.signalScore}</div>` : ''}
      </div>
      <button type="button" class="review-show-feed" data-show-feed>Show in feed →</button>
      <div class="review-reason">${escapeHtml(holdWhy.inline)}</div>
      ${queueNote}
      <div class="review-actions">
        <button type="button" data-res="SHOW" class="sdf-btn sdf-btn-show" title="Keep visible in feed">
          <span class="btn-main">Keep in feed</span>
          <span class="btn-sub">Show normally</span>
        </button>
        <button type="button" data-res="HIDE" class="sdf-btn sdf-btn-hide" title="Low-signal filter — remove from timeline">
          <span class="btn-main">Low signal</span>
          <span class="btn-sub">Filter out → Hidden</span>
        </button>
        <button type="button" data-res="BLOCK" class="sdf-btn sdf-btn-block" title="Guardrail block — policy rejection">
          <span class="btn-main">Guardrail</span>
          <span class="btn-sub">Hard block → Blocked</span>
        </button>
      </div>
      <button type="button" class="review-link-blocked" data-sdf-action="blocked">View blocked posts →</button>
    `;

    el.querySelector('[data-close-review]')?.addEventListener('click', () => {
      reviewOpen = false;
      setReviewTarget(null);
      renderReview();
    });

    el.querySelector('[data-show-feed]')?.addEventListener('click', () => {
      focusReviewPost(post.bundleId);
    });

    el.querySelector('[data-sdf-action="blocked"]')?.addEventListener('click', () => {
      drawerMode = 'blocked';
      drawerOpen = true;
      reviewOpen = false;
      setReviewTarget(null);
      renderDrawer();
      renderReview();
    });

    el.querySelectorAll('button[data-res]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (dead) return;
        sdfRuntime
          .sendMessage({ type: 'resolve_held', bundleId: post.bundleId, resolution: btn.dataset.res })
          .then(() => refresh())
          .catch(() => teardown());
      });
    });
  }

  function upsertPassedRow(data) {
    if (data.action !== 'SHOW') return;
    const bundleId = data.bundle_id || data.bundleId;
    if (!bundleId) return;

    const row = {
      bundleId,
      action: 'SHOW',
      reasonCodes: data.reason_codes || data.reasonCodes || [],
      signalScore: data.signal_score ?? data.signalScore,
      scoreExplanation: data.score_explanation || data.scoreExplanation || null,
      agentReasons: data.agent_reasons || data.agentReasons || [],
      category: data.category,
      authorHandle: data.author_handle || data.authorHandle || 'unknown',
      textSnippet: data.text_snippet || data.textSnippet || '',
      decidedAt: data.decided_at || data.decidedAt,
    };

    const idx = passedRows.findIndex((r) => r.bundleId === bundleId);
    if (idx >= 0) passedRows[idx] = row;
    else passedRows.push(row);

    renderDock();
    if (drawerOpen) renderDrawer();
  }

  function upsertFilteredRow(data) {
    if (!['HIDE', 'BLOCK'].includes(data.action)) return;
    const bundleId = data.bundle_id || data.bundleId;
    if (!bundleId) return;

    const row = {
      bundleId,
      action: data.action,
      reasonCodes: data.reason_codes || data.reasonCodes || [],
      signalScore: data.signal_score ?? data.signalScore,
      scoreExplanation: data.score_explanation || data.scoreExplanation || null,
      agentReasons: data.agent_reasons || data.agentReasons || [],
      category: data.category,
      authorHandle: data.author_handle || data.authorHandle || 'unknown',
      textSnippet: data.text_snippet || data.textSnippet || '',
      decidedAt: data.decided_at || data.decidedAt,
    };

    const idx = hiddenRows.findIndex((r) => r.bundleId === bundleId);
    if (idx >= 0) hiddenRows[idx] = row;
    else hiddenRows.push(row);

    renderDock();
    if (drawerOpen) renderDrawer();
  }

  function openHeldReview(bundleId) {
    if (!bundleId) return;

    const showReview = () => {
      const idx = heldPosts.findIndex((p) => p.bundleId === bundleId);
      if (idx < 0) {
        renderDock();
        renderDrawer();
        return;
      }
      reviewOpen = true;
      drawerOpen = false;
      heldTab = heldReviewBucket(heldPosts[idx]);
      if (idx > 0) {
        const [post] = heldPosts.splice(idx, 1);
        heldPosts.unshift(post);
      }
      focusReviewPost(bundleId);
      renderDrawer();
      renderReview();
    };

    const idx = heldPosts.findIndex((p) => p.bundleId === bundleId);
    if (idx >= 0) {
      showReview();
      return;
    }

    refresh().then(showReview);
  }

  function refresh() {
    if (dead) return Promise.resolve();
    if (!sdfRuntime.isAvailable()) {
      renderDock();
      return Promise.resolve();
    }

    return Promise.all([
      sdfRuntime.sendMessage({ type: 'fetch_filtered_decisions' }),
      sdfRuntime.sendMessage({ type: 'fetch_show_decisions' }),
      sdfRuntime.sendMessage({ type: 'fetch_held' }),
      sdfRuntime.sendMessage({ type: 'fetch_held_decisions' }),
    ])
      .then(([filtered, showDecisions, heldPayload, heldDecisions]) => {
        if (dead) return;
        hiddenRows = Array.isArray(filtered) ? filtered : [];
        passedRows = Array.isArray(showDecisions) ? showDecisions : [];
        const heldRows = Array.isArray(heldPayload?.rows)
          ? heldPayload.rows
          : Array.isArray(heldPayload)
            ? heldPayload
            : [];
        heldTotal = heldPayload?.total ?? heldRows.length;
        const decisionByBundle = new Map(
          (Array.isArray(heldDecisions) ? heldDecisions : []).map((row) => [row.bundleId, row])
        );
        heldPosts = heldRows.map((row) => {
          const normalized = normalizeHeldRow(row);
          const decision = decisionByBundle.get(normalized.bundleId);
          return decision
            ? normalizeHeldRow({ ...normalized, ...decision, signalScore: normalized.signalScore ?? decision.signalScore })
            : normalized;
        });
        if (Array.isArray(heldDecisions)) {
          for (const row of heldDecisions) {
            cacheHeldMeta(row);
          }
        }
        renderDock();
        renderDrawer();
        renderReview();
        if (reviewOpen && heldPosts[0]) focusReviewPost(heldPosts[0].bundleId);
      })
      .catch(() => {
        if (dead) return;
        renderDock();
        setTimeout(() => {
          if (!dead) refresh();
        }, 1500);
      });
  }

  window.sdfHudAnchor?.ensureHud?.();
  renderDock();

  document.addEventListener('sdf:open-review', (event) => {
    openHeldReview(event.detail?.bundleId);
  });

  document.addEventListener('sdf:resolve-held', (event) => {
    const { bundleId, resolution } = event.detail || {};
    if (!bundleId || !resolution || dead) return;
    sdfRuntime
      .sendMessage({ type: 'resolve_held', bundleId, resolution })
      .then(() => refresh())
      .catch(() => teardown());
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (dead) return;
    if (message.type === 'decision') {
      if (message.data?.action === 'HOLD') cacheHeldMeta(message.data);
      upsertFilteredRow(message.data);
      upsertPassedRow(message.data);
      if (message.data?.action === 'HOLD') refresh();
    }
    if (message.type === 'oversight') {
      const data = message.data;
      if (!data?.resolution) return;
      const row = { ...data, action: data.resolution, bundle_id: data.bundle_id };
      upsertPassedRow(row);
      upsertFilteredRow(row);
    }
    if (message.type === 'held_count') {
      refresh();
    }
    if (message.type === 'open_held_review') {
      openHeldReview(message.bundleId);
    }
  });

  if (sdfRuntime.isAvailable()) refresh();
})();
