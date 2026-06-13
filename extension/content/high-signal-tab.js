(() => {
  const TAB_KEY = 'sdfHighSignalTab';
  const MAX_SHOW = 100;
  const SNIPPET_LEN = 120;

  let dead = false;
  let activeTab = 'for_you';
  let feedState = 'for_you';
  let showByBundle = new Map();
  let showOrder = [];
  let tabButton = null;
  let feedRoot = null;
  let nativeFeed = null;
  let tabObserver = null;
  let selectionObserver = null;
  let syncingNativeTabSelection = false;
  let syncNativeTabSelectionFrame = 0;

  sdfRuntime.onInvalidate(teardown);

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isHomePage() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/home' || path === '/';
  }

  function normalizeRow(data) {
    return {
      bundleId: data.bundle_id || data.bundleId,
      action: data.action,
      reasonCodes: data.reason_codes || data.reasonCodes || [],
      signalScore: data.signal_score ?? data.signalScore ?? null,
      authorHandle: data.author_handle || data.authorHandle || null,
      textSnippet: data.text_snippet || data.textSnippet || '',
      decidedAt: data.decided_at || data.decidedAt || null,
      agentReasons: data.agent_reasons || data.agentReasons || [],
      scoreExplanation: data.score_explanation || data.scoreExplanation || null,
    };
  }

  function truncateSnippet(text) {
    const value = String(text || '').trim();
    if (value.length <= SNIPPET_LEN) return value;
    return `${value.slice(0, SNIPPET_LEN)}…`;
  }

  function scoreLabel(score) {
    return score != null ? String(score) : '—';
  }

  function rowPreview(row) {
    return window.sdfPostPreview?.getPostPreview(row?.bundleId) ?? null;
  }

  function authorLabel(row, preview = rowPreview(row)) {
    if (preview?.displayName) return preview.displayName;
    if (preview?.handle) return `@${preview.handle}`;
    if (row.authorHandle) return `@${row.authorHandle}`;
    return 'Unknown author';
  }

  function snippetForRow(row, preview = rowPreview(row)) {
    const text = preview?.text || row.textSnippet || '';
    return truncateSnippet(text) || '—';
  }

  function findPrimaryColumn() {
    return document.querySelector('[data-testid="primaryColumn"]');
  }

  function findNativeFeedWrapper() {
    const column = findPrimaryColumn();
    if (!column) return null;
    return (
      column.querySelector('section[role="region"]') ||
      column.querySelector('[aria-label*="Timeline" i]')?.closest('section') ||
      column.querySelector('div > div > section')
    );
  }

  function isFlexRow(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display !== 'flex' && style.display !== 'inline-flex') return false;
    return !['column', 'column-reverse'].includes(style.flexDirection);
  }

  function feedTabLabel(tab) {
    return tab.textContent?.trim().toLowerCase() || '';
  }

  function findForYouTab() {
    const column = findPrimaryColumn();
    if (!column) return null;

    for (const tab of column.querySelectorAll('[role="tablist"] [role="tab"]')) {
      if (feedTabLabel(tab).startsWith('for you')) return tab;
    }
    return null;
  }

  function findFollowingTab() {
    const column = findPrimaryColumn();
    if (!column) return null;

    for (const tab of column.querySelectorAll('[role="tablist"] [role="tab"]')) {
      if (feedTabLabel(tab).startsWith('following')) return tab;
    }
    return null;
  }

  function findTablist(tab) {
    return tab?.closest('[role="tablist"]') || null;
  }

  function collectHorizontalFlexAncestors(node, stopAt) {
    const rows = [];
    let el = node?.parentElement;

    while (el && el !== stopAt) {
      if (isFlexRow(el)) rows.push(el);
      el = el.parentElement;
    }

    return rows;
  }

  function innermostHorizontalFlexRow(node, tablist) {
    const rows = collectHorizontalFlexAncestors(node, tablist);
    return rows.length ? rows[0] : null;
  }

  function isScrollableX(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return ['auto', 'scroll', 'overlay', 'hidden'].includes(style.overflowX);
  }

  function findTabScrollContainer(forYouTab) {
    let el = forYouTab.parentElement;

    while (el && el.getAttribute('role') !== 'tablist') {
      if (isScrollableX(el)) return el;
      el = el.parentElement;
    }

    const tablist = forYouTab.closest('[role="tablist"]');
    if (!tablist) return null;

    for (const candidate of tablist.querySelectorAll('*')) {
      if (!candidate.contains(forYouTab) || candidate === forYouTab) continue;
      if (isScrollableX(candidate)) return candidate;
    }

    return null;
  }

  function directChildContaining(row, node) {
    let current = node;
    while (current && current.parentElement !== row) {
      current = current.parentElement;
    }
    if (!current || current.parentElement !== row) return null;
    return current;
  }

  function resolveRowInsertReference(row, reference) {
    if (!row?.isConnected || !reference?.isConnected) return null;
    if (reference.parentElement === row) return reference;
    return directChildContaining(row, reference);
  }

  function insertIntoRow(row, node, insertBefore) {
    if (!row?.isConnected || !node) return false;

    const ref = resolveRowInsertReference(row, insertBefore);
    if (ref) {
      row.insertBefore(node, ref);
      return true;
    }

    row.appendChild(node);
    return true;
  }

  function findCanonicalTabRow(forYouTab) {
    const followingTab = findFollowingTab();
    const tablist = findTablist(forYouTab || followingTab);
    if (!tablist) return forYouTab?.parentElement || null;

    if (followingTab) {
      const row = innermostHorizontalFlexRow(followingTab, tablist);
      if (row) return row;
    }

    if (forYouTab) {
      const row = innermostHorizontalFlexRow(forYouTab, tablist);
      if (row) return row;
    }

    return forYouTab?.parentElement || null;
  }

  function ensureTabDirectChild(row, tab, beforeTab) {
    if (!row?.isConnected || !tab?.isConnected) return null;

    flattenForYouWrappers(row, tab);

    let guard = 0;
    while (tab.parentElement !== row && guard++ < 24) {
      const parent = tab.parentElement;
      if (!parent || !row.contains(tab)) {
        const ref =
          beforeTab?.isConnected && row.contains(beforeTab) && beforeTab !== tab
            ? beforeTab
            : row.firstElementChild;
        if (ref && ref !== tab) row.insertBefore(tab, ref);
        else row.appendChild(tab);
        continue;
      }

      row.insertBefore(tab, parent);
      if (!parent.childElementCount && !parent.textContent?.trim()) {
        parent.remove();
      }
    }

    if (
      beforeTab?.isConnected &&
      row.contains(beforeTab) &&
      beforeTab !== tab &&
      tab.nextElementSibling !== beforeTab
    ) {
      row.insertBefore(tab, beforeTab);
    }

    return tab.parentElement === row ? tab : null;
  }

  function findForYouInsertionPoint() {
    const forYouTab = findForYouTab();
    if (!forYouTab) return null;

    const row = findCanonicalTabRow(forYouTab);
    if (!row?.isConnected) return null;

    row.classList.add('sdf-hs-tab-strip');
    const followingTab = findFollowingTab();
    const anchoredTab = ensureTabDirectChild(row, forYouTab, followingTab);
    if (!anchoredTab) return null;

    const insertBefore = anchoredTab;
    const scroller = resolveTabScroller(forYouTab, row);

    return { row, insertBefore, nativeTab: forYouTab, scroller };
  }

  function resolveTabScroller(forYouTab, row) {
    return (
      findTabScrollContainer(forYouTab) ||
      findTabScrollContainer(findFollowingTab()) ||
      (isScrollableX(row) ? row : null)
    );
  }

  function flattenForYouWrappers(row, forYouTab) {
    if (!row || !forYouTab) return;

    let el = forYouTab.parentElement;
    while (el && el !== row) {
      el.classList.add('sdf-hs-tab-wrapper-flatten');
      el = el.parentElement;
    }
  }

  function isNestedInsideForYouBranch(node, forYouTab) {
    if (!node || !forYouTab || node === forYouTab) return false;
    return forYouTab.contains(node);
  }

  function tabNeedsReposition(tab, insertion, forYouTab) {
    if (!tab?.isConnected || !insertion?.row?.isConnected) return false;
    if (forYouTab?.parentElement !== insertion.row) return true;
    if (tab.parentElement !== insertion.row) return true;
    if (isNestedInsideForYouBranch(tab, forYouTab)) return true;

    const ref = resolveRowInsertReference(insertion.row, insertion.insertBefore);
    if (!ref) return false;
    return tab.nextElementSibling !== ref;
  }

  function ensureTabVisible(scroller) {
    if (!tabButton?.isConnected) return;

    if (scroller?.isConnected) {
      scroller.scrollLeft = 0;
    }

    tabButton.scrollIntoView({ block: 'nearest', inline: 'start' });
  }

  function applyNativeTabMetrics(nativeTab, customTab) {
    if (!nativeTab || !customTab) return;
    const style = getComputedStyle(nativeTab);
    const layoutProps = [
      'height',
      'minHeight',
      'maxHeight',
      'padding',
      'margin',
      'font',
      'lineHeight',
      'letterSpacing',
      'boxSizing',
      'display',
      'alignItems',
      'justifyContent',
    ];

    for (const prop of layoutProps) {
      customTab.style[prop] = style[prop];
    }

    customTab.style.flex = '0 0 auto';
    customTab.style.alignSelf = style.alignSelf === 'stretch' ? 'stretch' : 'center';
  }

  function metricsReferenceTab() {
    return findFollowingTab() || findForYouTab();
  }

  function nativeTabDecorators(tab) {
    const nodes = new Set([tab]);
    let el = tab.parentElement;

    while (el && el.getAttribute('role') !== 'tablist') {
      nodes.add(el);
      el = el.parentElement;
    }

    return [...nodes];
  }

  function findAllNativeTabs() {
    const column = findPrimaryColumn();
    if (!column) return [];

    const tabs = new Set();
    for (const tab of column.querySelectorAll('[role="tablist"] [role="tab"]')) {
      if (!tab.classList.contains('sdf-high-signal-tab')) tabs.add(tab);
    }

    const row = findForYouInsertionPoint()?.row;
    if (row) {
      for (const tab of row.querySelectorAll('[role="tab"]')) {
        if (!tab.classList.contains('sdf-high-signal-tab')) tabs.add(tab);
      }
    }

    return [...tabs];
  }

  function isLikelyTabIndicator(el) {
    if (!el?.isConnected || el.closest('.sdf-high-signal-tab')) return false;
    if (el.getAttribute('role') === 'tab' || el.classList.contains('sdf-high-signal-tab')) {
      return false;
    }

    const scope = el.closest('[role="tablist"], .sdf-hs-tab-strip');
    if (!scope) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const transform = style.transform || '';

    if (rect.height > 0 && rect.height <= 12 && rect.width >= 20) {
      if (style.position === 'absolute' || style.position === 'fixed') return true;
      if (transform.includes('translateX') || transform.includes('matrix')) return true;
    }

    if (el.getAttribute('aria-hidden') === 'true') {
      for (const child of el.children) {
        const childRect = child.getBoundingClientRect();
        if (childRect.height > 0 && childRect.height <= 12 && childRect.width >= 20) return true;
      }
    }

    return false;
  }

  function suppressNativeIndicatorBars(scope, suppress) {
    if (!scope?.isConnected) return;

    for (const el of scope.querySelectorAll('div, span')) {
      if (isLikelyTabIndicator(el)) {
        el.classList.toggle('sdf-hs-native-indicator-hidden', suppress);
      }
    }
  }

  function setNativeTabStripActive({ tablist, row, suppress }) {
    tablist?.classList.toggle('sdf-hs-custom-active', suppress);
    row?.classList.toggle('sdf-hs-custom-active', suppress);
    suppressNativeIndicatorBars(tablist, suppress);
    suppressNativeIndicatorBars(row, suppress);
  }

  function nativeTabIndicatorNeedsHiding() {
    const tablist = findFeedTablist();
    const row = findForYouInsertionPoint()?.row;

    for (const scope of [tablist, row]) {
      if (!scope?.isConnected) continue;
      for (const el of scope.querySelectorAll('div, span')) {
        if (isLikelyTabIndicator(el) && !el.classList.contains('sdf-hs-native-indicator-hidden')) {
          return true;
        }
      }
    }

    return false;
  }

  function stopSelectionObserver() {
    selectionObserver?.disconnect();
    selectionObserver = null;
  }

  function findFeedTablist() {
    return findTablist(findForYouTab() || findFollowingTab() || tabButton);
  }

  function nativeTabNeedsSuppressionSync() {
    if (activeTab !== 'high_signal') return false;

    const insertion = findForYouInsertionPoint();
    const tablist = findFeedTablist();
    if (tablist && !tablist.classList.contains('sdf-hs-custom-active')) return true;
    if (insertion?.row && !insertion.row.classList.contains('sdf-hs-custom-active')) return true;
    if (nativeTabIndicatorNeedsHiding()) return true;

    return findAllNativeTabs().some(
      (tab) =>
        tab.getAttribute('aria-selected') === 'true' ||
        tab.getAttribute('tabindex') === '0' ||
        !tab.classList.contains('sdf-native-tab-suppressed')
    );
  }

  function scheduleSyncNativeTabSelection() {
    if (activeTab !== 'high_signal') return;
    if (syncNativeTabSelectionFrame) return;

    syncNativeTabSelectionFrame = requestAnimationFrame(() => {
      syncNativeTabSelectionFrame = 0;
      if (activeTab === 'high_signal' && nativeTabNeedsSuppressionSync()) {
        syncNativeTabSelection();
      }
    });
  }

  function watchNativeTabSelection() {
    stopSelectionObserver();
    if (activeTab !== 'high_signal') return;

    const tablist = findFeedTablist();
    if (!tablist) return;

    selectionObserver = new MutationObserver(() => scheduleSyncNativeTabSelection());
    selectionObserver.observe(tablist, {
      attributes: true,
      attributeFilter: ['aria-selected', 'class', 'tabindex', 'style'],
      childList: true,
      subtree: true,
    });
  }

  function syncNativeTabSelection() {
    if (syncingNativeTabSelection) return;
    syncingNativeTabSelection = true;

    try {
      const nativeTabs = findAllNativeTabs();
      const insertion = findForYouInsertionPoint();
      const tablist = findFeedTablist();
      const suppress = activeTab === 'high_signal';

      setNativeTabStripActive({ tablist, row: insertion?.row, suppress });

      for (const tab of nativeTabs) {
        for (const node of nativeTabDecorators(tab)) {
          if (!node?.isConnected) continue;
          node.classList.toggle('sdf-native-tab-suppressed', suppress);
        }

        if (suppress) {
          tab.setAttribute('aria-selected', 'false');
          tab.setAttribute('tabindex', '-1');
          tab.dataset.sdfSuppressed = 'true';
        } else {
          delete tab.dataset.sdfSuppressed;
        }
      }

      if (suppress) {
        watchNativeTabSelection();
      } else {
        stopSelectionObserver();
      }
    } finally {
      syncingNativeTabSelection = false;
    }
  }

  function reconcileTimelineOverlays() {
    for (const article of document.querySelectorAll(
      'article[data-testid="tweet"][data-sdf-bundle-id]'
    )) {
      document.dispatchEvent(
        new CustomEvent('sdf:article-tagged', { detail: { bundleId: article.dataset.sdfBundleId } })
      );
    }
  }

  function ensureFeedRoot() {
    if (feedRoot?.isConnected) return feedRoot;

    nativeFeed = findNativeFeedWrapper();
    const column = findPrimaryColumn();
    if (!column) return null;

    feedRoot = document.createElement('div');
    feedRoot.id = 'sdf-high-signal-root';

    if (nativeFeed?.parentElement) {
      nativeFeed.insertAdjacentElement('afterend', feedRoot);
    } else {
      column.appendChild(feedRoot);
    }
    return feedRoot;
  }

  function setNativeFeedHidden(hidden) {
    if (!hidden) {
      document.querySelectorAll('.sdf-native-feed-hidden').forEach((node) => {
        node.classList.remove('sdf-native-feed-hidden');
      });
    }

    nativeFeed = findNativeFeedWrapper();
    if (!nativeFeed) return;
    nativeFeed.classList.toggle('sdf-native-feed-hidden', hidden);
  }

  function updateTabUi() {
    if (!tabButton) return;
    const hsActive = activeTab === 'high_signal';
    tabButton.setAttribute('aria-selected', hsActive ? 'true' : 'false');
    tabButton.setAttribute('tabindex', hsActive ? '0' : '-1');
    syncNativeTabSelection();
  }

  function persistTab() {
    if (!chrome.storage?.session) return;
    chrome.storage.session.set({ [TAB_KEY]: activeTab }).catch(() => {});
  }

  function restoreTabPreference() {
    if (!chrome.storage?.session) return Promise.resolve();
    return chrome.storage.session
      .get([TAB_KEY])
      .then((stored) => {
        if (stored[TAB_KEY] === 'high_signal' && isHomePage()) {
          selectHighSignalTab({ skipPersist: true });
        }
      })
      .catch(() => {});
  }

  function wireNativeFeedTabs() {
    const column = findPrimaryColumn();
    if (!column) return;

    for (const tab of column.querySelectorAll('[role="tablist"] [role="tab"]')) {
      if (tab.classList.contains('sdf-high-signal-tab')) continue;
      if (tab.dataset.sdfNativeFeedTabWired) continue;
      tab.dataset.sdfNativeFeedTabWired = 'true';
      tab.addEventListener('click', onNativeFeedTabSelected, true);
    }
  }

  function injectTab() {
    if (dead || !isHomePage()) return;

    const insertion = findForYouInsertionPoint();
    if (!insertion) return;

    const forYouTab = findForYouTab();
    const metricsTab = metricsReferenceTab() || insertion.nativeTab;

    if (tabButton?.isConnected) {
      if (tabNeedsReposition(tabButton, insertion, forYouTab)) {
        insertIntoRow(insertion.row, tabButton, insertion.insertBefore);
      }
      applyNativeTabMetrics(metricsTab, tabButton);
      wireNativeFeedTabs();
      updateTabUi();
      ensureTabVisible(insertion.scroller);
      return;
    }

    tabButton = document.createElement('div');
    tabButton.className = 'sdf-high-signal-tab';
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-selected', 'false');
    tabButton.setAttribute('tabindex', '-1');
    tabButton.textContent = 'High signal';
    tabButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectHighSignalTab();
    });

    insertIntoRow(insertion.row, tabButton, insertion.insertBefore);
    applyNativeTabMetrics(metricsTab, tabButton);
    wireNativeFeedTabs();
    updateTabUi();
    ensureTabVisible(insertion.scroller);
  }

  function onNativeFeedTabSelected(event) {
    if (dead) return;
    if (event.target.closest('.sdf-high-signal-tab')) return;
    selectForYouTab();
  }

  function clearFeedData() {
    showByBundle = new Map();
    showOrder = [];
  }

  function scoreExplanationForRow(row) {
    return row.scoreExplanation || row.agentReasons?.join('; ') || null;
  }

  function createRow(row) {
    const preview = rowPreview(row);
    const avatar = preview?.avatarUrl
      ? `<img class="sdf-hs-fallback-avatar" src="${escapeHtml(preview.avatarUrl)}" alt="" loading="lazy">`
      : '<div class="sdf-hs-fallback-avatar" aria-hidden="true"></div>';
    const thumbnail = preview?.mediaUrl
      ? `<img class="sdf-hs-thumbnail" src="${escapeHtml(preview.mediaUrl)}" alt="" loading="lazy">`
      : '';
    const timelineHint = preview?.inFeed
      ? ''
      : '<span class="sdf-hs-fallback-hint">Not yet in timeline</span>';

    const explanation = scoreExplanationForRow(row);
    const explanationMarkup = explanation
      ? `<p class="sdf-hs-reasons-inline">${escapeHtml(explanation)}</p>`
      : '';

    const wrap = document.createElement('div');
    wrap.className = 'sdf-hs-fallback';
    wrap.dataset.hsFallback = row.bundleId;
    wrap.innerHTML = `
      <div class="sdf-hs-fallback-inner">
        ${avatar}
        <div class="sdf-hs-fallback-body">
          <div class="sdf-hs-fallback-header">
            <span class="sdf-hs-fallback-name">${escapeHtml(authorLabel(row, preview))}</span>
          </div>
          <p class="sdf-hs-fallback-text">${escapeHtml(snippetForRow(row, preview))}</p>
          ${thumbnail}
          <div class="sdf-hs-fallback-meta">
            <span class="sdf-hs-score">
              <span class="sdf-hs-show-tag">SHOW</span>
              ${escapeHtml(scoreLabel(row.signalScore))}
            </span>
            ${timelineHint}
          </div>
          ${explanationMarkup}
        </div>
      </div>`;
    return wrap;
  }

  function renderShowList() {
    const root = ensureFeedRoot();
    if (!root) return;

    root.querySelectorAll('[data-hs-fallback]').forEach((el) => el.remove());
    root.querySelectorAll('.sdf-hs-more-note').forEach((el) => el.remove());

    const visibleIds = showOrder.slice(0, MAX_SHOW);
    const hiddenCount = Math.max(showOrder.length - MAX_SHOW, 0);
    const fragment = document.createDocumentFragment();

    for (const bundleId of visibleIds) {
      const row = showByBundle.get(bundleId);
      if (row) fragment.appendChild(createRow(row));
    }

    root.appendChild(fragment);

    if (hiddenCount) {
      const note = document.createElement('p');
      note.className = 'sdf-hs-more-note';
      note.textContent = `+${hiddenCount} more high-signal posts not shown`;
      root.appendChild(note);
    }
  }

  function renderFeed() {
    const root = ensureFeedRoot();
    if (!root) return;

    if (feedState === 'high_signal_loading') {
      root.classList.add('visible');
      root.innerHTML = '<div class="sdf-hs-state"><p>Loading high-signal posts…</p></div>';
      return;
    }

    if (feedState === 'high_signal_disconnected') {
      root.classList.add('visible');
      root.innerHTML = `
        <div class="sdf-hs-state">
          <h2>Harness disconnected</h2>
          <p>Could not load high-signal posts. Check that the harness is running, then click High signal again.</p>
        </div>`;
      return;
    }

    if (activeTab !== 'high_signal') {
      root.classList.remove('visible');
      root.innerHTML = '';
      return;
    }

    root.classList.add('visible');

    if (feedState === 'high_signal_empty' || !showOrder.length) {
      root.innerHTML = `
        <div class="sdf-hs-state">
          <h2>No high-signal posts yet</h2>
          <p>SHOW decisions will appear here as the filter runs.</p>
        </div>`;
      return;
    }

    renderShowList();
  }

  function upsertShowRow(row) {
    if (!row?.bundleId || row.action !== 'SHOW') return;

    const existing = showByBundle.has(row.bundleId);
    showByBundle.set(row.bundleId, { ...showByBundle.get(row.bundleId), ...row, action: 'SHOW' });

    if (!existing) {
      showOrder.push(row.bundleId);
    }

    feedState = showOrder.length ? 'high_signal_ready' : 'high_signal_empty';
  }

  function removeShowRow(bundleId) {
    if (!bundleId) return;
    showByBundle.delete(bundleId);
    showOrder = showOrder.filter((id) => id !== bundleId);
    feedState = showOrder.length ? 'high_signal_ready' : 'high_signal_empty';
  }

  function applyDecision(data) {
    const row = normalizeRow(data);
    if (!row.bundleId) return;

    if (row.action === 'SHOW') {
      upsertShowRow(row);
      if (activeTab === 'high_signal') renderFeed();
      return;
    }

    if (showByBundle.has(row.bundleId)) {
      removeShowRow(row.bundleId);
      if (activeTab === 'high_signal') renderFeed();
    }
  }

  function hydrate() {
    if (dead || !sdfRuntime.isAvailable()) {
      feedState = 'high_signal_disconnected';
      renderFeed();
      return Promise.resolve();
    }

    feedState = 'high_signal_loading';
    renderFeed();

    return sdfRuntime
      .sendMessage({ type: 'fetch_show_decisions' })
      .then((rows) => {
        if (dead) return;
        clearFeedData();
        if (!Array.isArray(rows)) {
          feedState = 'high_signal_disconnected';
          renderFeed();
          return;
        }

        for (const row of rows) {
          upsertShowRow(normalizeRow(row));
        }
        feedState = showOrder.length ? 'high_signal_ready' : 'high_signal_empty';
        renderFeed();
      })
      .catch(() => {
        if (dead) return;
        feedState = 'high_signal_disconnected';
        renderFeed();
      });
  }

  function selectHighSignalTab({ skipPersist = false } = {}) {
    activeTab = 'high_signal';
    if (!skipPersist) persistTab();
    setNativeFeedHidden(true);
    updateTabUi();
    scheduleSyncNativeTabSelection();
    const insertion = findForYouInsertionPoint();
    ensureTabVisible(insertion?.scroller);
    hydrate();
  }

  function selectForYouTab() {
    activeTab = 'for_you';
    feedState = 'for_you';
    persistTab();
    setNativeFeedHidden(false);
    updateTabUi();
    renderFeed();
    reconcileTimelineOverlays();
  }

  function onModeChange() {
    clearFeedData();
    if (activeTab === 'high_signal') {
      hydrate();
    }
  }

  function onArticleTagged(event) {
    if (activeTab !== 'high_signal') return;
    const bundleId = event.detail?.bundleId;
    if (!bundleId || !showByBundle.has(bundleId)) return;
    if (feedState === 'high_signal_ready') renderFeed();
  }

  function startTabObserver() {
    if (tabObserver) return;
    tabObserver = new MutationObserver(() => {
      if (dead) return;
      if (isHomePage()) {
        injectTab();
        wireNativeFeedTabs();
        syncNativeTabSelection();
        if (tabButton?.isConnected) {
          ensureTabVisible(findForYouInsertionPoint()?.scroller);
        }
      } else if (tabButton?.isConnected) {
        selectForYouTab();
        tabButton.remove();
        tabButton = null;
      }
    });
    tabObserver.observe(document.body, { childList: true, subtree: true });
  }

  function teardown() {
    if (dead) return;
    dead = true;
    stopSelectionObserver();
    if (syncNativeTabSelectionFrame) {
      cancelAnimationFrame(syncNativeTabSelectionFrame);
      syncNativeTabSelectionFrame = 0;
    }
    tabObserver?.disconnect();
    tabObserver = null;
    activeTab = 'for_you';
    syncNativeTabSelection();
    setNativeFeedHidden(false);
    tabButton?.remove();
    tabButton = null;
    feedRoot?.remove();
    feedRoot = null;
  }

  if (!sdfRuntime.isAvailable()) return;

  chrome.runtime.onMessage.addListener((message) => {
    if (dead) return;
    if (message.type === 'decision') applyDecision(message.data);
    if (message.type === 'mode') onModeChange();
  });

  document.addEventListener('sdf:override', (event) => {
    if (event.detail) applyDecision(event.detail);
  });

  document.addEventListener('sdf:article-tagged', onArticleTagged);

  startTabObserver();
  injectTab();
  restoreTabPreference();
})();
