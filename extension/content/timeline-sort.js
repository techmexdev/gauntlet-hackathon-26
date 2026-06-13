(() => {
  const SORT_KEY = 'sdfTimelineSort';
  const SCROLL_SETTLE_MS = 450;
  const SORT_STREAM_CLASS = 'sdf-sorted-stream';
  const UNSCORED_ORDER = '10000';
  const CHROME_ORDER = '-1';

  let dead = false;
  let sortMode = 'chrono';
  let decisions = new Map();
  let scrolling = false;
  let scrollTimer = 0;
  let sortFrame = 0;
  let feedObserver = null;
  let mutationTimer = 0;
  const sortedCells = new Set();

  sdfRuntime.onInvalidate(teardown);

  function isHomePage() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/home' || path === '/';
  }

  function normalizeDecision(data) {
    return {
      bundle_id: data.bundle_id || data.bundleId,
      action: data.action,
      signal_score: data.signal_score ?? data.signalScore ?? null,
    };
  }

  function sortEnabled() {
    return sortMode === 'signal' && isHomePage();
  }

  function isHighSignalFeedActive() {
    return Boolean(document.querySelector('.sdf-high-signal-tab[aria-selected="true"]'));
  }

  function sortBarShouldShow() {
    return isHomePage() && !isHighSignalFeedActive();
  }

  function isSortableDecision(decision) {
    if (!decision || decision.signal_score == null) return false;
    return decision.action === 'SHOW' || decision.action === 'HOLD';
  }

  function sortOrderForScore(score) {
    return String(1000 - Number(score));
  }

  function getFeedStream() {
    const column = document.querySelector('[data-testid="primaryColumn"]');
    if (!column) return null;

    const cells = column.querySelectorAll('[data-testid="cellInnerDiv"]');
    if (cells.length >= 2) {
      const parentCounts = new Map();
      for (const cell of cells) {
        const parent = cell.parentElement;
        if (!parent) continue;
        parentCounts.set(parent, (parentCounts.get(parent) || 0) + 1);
      }

      let bestParent = null;
      let bestCount = 0;
      for (const [parent, count] of parentCounts) {
        if (count > bestCount) {
          bestParent = parent;
          bestCount = count;
        }
      }
      if (bestCount >= 2) return bestParent;
    }

    const article = column.querySelector('article[data-testid="tweet"]');
    if (!article) return null;

    let node = article.parentElement;
    while (node && node !== column) {
      const siblings = [...node.parentElement?.children || []].filter((child) =>
        child.querySelector?.('article[data-testid="tweet"]')
      );
      if (siblings.length > 1) return node.parentElement;
      node = node.parentElement;
    }

    return article.parentElement;
  }

  function ensureCellBundleId(cell) {
    let article = cell.querySelector?.('article[data-testid="tweet"][data-sdf-bundle-id]');
    if (article?.dataset.sdfBundleId) return article.dataset.sdfBundleId;

    article = cell.querySelector?.('article[data-testid="tweet"]');
    if (!article) return null;

    const statusId = article.querySelector('a[href*="/status/"]')?.href?.match(/status\/(\d+)/)?.[1];
    if (!statusId) return null;

    const bundleId = `x-${statusId}`;
    article.dataset.sdfBundleId = bundleId;
    document.dispatchEvent(new CustomEvent('sdf:article-tagged', { detail: { bundleId } }));
    return bundleId;
  }

  function clearSortOrders() {
    for (const cell of sortedCells) {
      if (!cell.isConnected) continue;
      cell.style.order = '';
      delete cell.dataset.sdfSortRank;
    }
    sortedCells.clear();

    for (const stream of document.querySelectorAll(`.${SORT_STREAM_CLASS}`)) {
      stream.classList.remove(SORT_STREAM_CLASS);
      stream.style.display = '';
      stream.style.flexDirection = '';
    }
  }

  function applySortOrders() {
    if (dead || !sortEnabled() || isHighSignalFeedActive() || scrolling) {
      if (!sortEnabled()) clearSortOrders();
      return;
    }

    const stream = getFeedStream();
    if (!stream) return;

    stream.classList.add(SORT_STREAM_CLASS);
    stream.style.display = 'flex';
    stream.style.flexDirection = 'column';

    const cells = [...stream.children];
    if (cells.filter((child) => child.querySelector?.('article[data-testid="tweet"]')).length < 2) return;

    const nextSorted = new Set();

    for (const cell of cells) {
      const article = cell.querySelector?.('article[data-testid="tweet"]');
      if (!article) {
        cell.style.order = CHROME_ORDER;
        cell.dataset.sdfSortRank = '';
        nextSorted.add(cell);
        continue;
      }

      const bundleId = ensureCellBundleId(cell);
      const decision = bundleId ? decisions.get(bundleId) : null;

      if (isSortableDecision(decision)) {
        cell.style.order = sortOrderForScore(decision.signal_score);
        cell.dataset.sdfSortRank = String(decision.signal_score);
        nextSorted.add(cell);
        continue;
      }

      cell.style.order = UNSCORED_ORDER;
      cell.dataset.sdfSortRank = '';
      nextSorted.add(cell);
    }

    for (const cell of sortedCells) {
      if (!nextSorted.has(cell) && cell.isConnected) {
        cell.style.order = '';
        delete cell.dataset.sdfSortRank;
      }
    }

    sortedCells.clear();
    for (const cell of nextSorted) sortedCells.add(cell);
  }

  function scheduleSortApply() {
    if (!sortEnabled() || scrolling) return;
    cancelAnimationFrame(sortFrame);
    sortFrame = requestAnimationFrame(() => {
      sortFrame = requestAnimationFrame(applySortOrders);
    });
  }

  function onScroll() {
    scrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      scrolling = false;
      scheduleSortApply();
    }, SCROLL_SETTLE_MS);
  }

  function applyDecision(data) {
    const decision = normalizeDecision(data);
    if (!decision.bundle_id) return;
    decisions.set(decision.bundle_id, decision);
    scheduleSortApply();
  }

  function reconcileVisibleCells() {
    const stream = getFeedStream();
    if (!stream) return;

    for (const cell of stream.children) {
      ensureCellBundleId(cell);
    }
  }

  function hydrateDecisions() {
    if (!sdfRuntime.isAvailable()) return Promise.resolve();
    return Promise.all([
      sdfRuntime.sendMessage({ type: 'fetch_filtered_decisions' }),
      sdfRuntime.sendMessage({ type: 'fetch_held_decisions' }),
      sdfRuntime.sendMessage({ type: 'fetch_show_decisions' }),
    ])
      .then(([filtered, held, show]) => {
        if (dead) return;
        const rows = [
          ...(Array.isArray(filtered) ? filtered : []),
          ...(Array.isArray(held) ? held : []),
          ...(Array.isArray(show) ? show : []),
        ];
        for (const row of rows) {
          const decision = normalizeDecision(row);
          if (decision.bundle_id) decisions.set(decision.bundle_id, decision);
        }
        reconcileVisibleCells();
        applySortOrders();
      })
      .catch(() => {});
  }

  function updateSortBarUi() {
    const bar = document.getElementById('sdf-sort-bar');
    if (!bar) return;

    for (const btn of bar.querySelectorAll('.sdf-sort-btn')) {
      const active = btn.dataset.sort === sortMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    bar.classList.toggle('sdf-sort-bar-hidden', !sortBarShouldShow());
  }

  function findFeedTablist(column) {
    const forYouTab = [...column.querySelectorAll('[role="tab"]')].find((tab) =>
      tab.textContent?.trim().toLowerCase().startsWith('for you')
    );
    return forYouTab?.closest('[role="tablist"]') || column.querySelector('[role="tablist"]');
  }

  function mountSortBar(bar, column) {
    const compose = column.querySelector('[data-testid="tweetTextarea_0"]');
    const composer = compose?.closest('[data-testid="inlineComposer"]');
    if (composer?.parentElement) {
      if (bar.parentElement !== composer.parentElement || bar.nextElementSibling !== composer) {
        composer.parentElement.insertBefore(bar, composer);
      }
      return;
    }

    const tablist = findFeedTablist(column);
    if (tablist) {
      if (bar.parentElement !== tablist.parentElement || bar.previousElementSibling !== tablist) {
        tablist.insertAdjacentElement('afterend', bar);
      }
      return;
    }

    if (bar.parentElement !== column) {
      column.prepend(bar);
    }
  }

  function removeStaleSortBars(keep = null) {
    for (const node of document.querySelectorAll('#sdf-sort-bar')) {
      if (node !== keep) node.remove();
    }
  }

  function setSortMode(mode, { persist = true } = {}) {
    if (mode !== 'chrono' && mode !== 'signal') return;
    sortMode = mode;
    if (persist && chrome.storage?.session) {
      chrome.storage.session.set({ [SORT_KEY]: mode }).catch(() => {});
    }
    updateSortBarUi();
    if (mode === 'signal') {
      hydrateDecisions().finally(() => applySortOrders());
    } else {
      clearSortOrders();
    }
  }

  function onSortBarClick(event) {
    const btn = event.target.closest('#sdf-sort-bar .sdf-sort-btn[data-sort]');
    if (!btn || dead) return;
    event.preventDefault();
    setSortMode(btn.dataset.sort);
  }

  function ensureSortBar() {
    if (!isHomePage()) {
      removeStaleSortBars();
      return null;
    }

    const column = document.querySelector('[data-testid="primaryColumn"]');
    if (!column) return null;

    let bar = document.getElementById('sdf-sort-bar');
    if (bar && !bar.isConnected) {
      bar.remove();
      bar = null;
    }
    if (bar?.isConnected) {
      mountSortBar(bar, column);
      updateSortBarUi();
      return bar;
    }

    removeStaleSortBars();
    bar = document.createElement('div');
    bar.id = 'sdf-sort-bar';
    bar.className = 'sdf-sort-bar';
    bar.innerHTML = `
      <span class="sdf-sort-label">Sort</span>
      <div class="sdf-sort-toggle" role="group" aria-label="Timeline sort">
        <button type="button" class="sdf-sort-btn active" data-sort="chrono" aria-pressed="true">Chronological</button>
        <button type="button" class="sdf-sort-btn" data-sort="signal" aria-pressed="false">By signal</button>
      </div>
    `;

    mountSortBar(bar, column);
    updateSortBarUi();
    return bar;
  }

  function watchFeed() {
    if (feedObserver) return;
    feedObserver = new MutationObserver(() => {
      ensureSortBar();
      updateSortBarUi();
      clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        reconcileVisibleCells();
        scheduleSortApply();
      }, 120);
    });
    const column = document.querySelector('[data-testid="primaryColumn"]') || document.body;
    feedObserver.observe(column, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected'],
    });
  }

  function restoreSortPreference() {
    if (!chrome.storage?.session) return Promise.resolve();
    return chrome.storage.session
      .get([SORT_KEY])
      .then((stored) => {
        if (stored[SORT_KEY] === 'signal') setSortMode('signal', { persist: false });
      })
      .catch(() => {});
  }

  function teardown() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(sortFrame);
    clearTimeout(scrollTimer);
    clearTimeout(mutationTimer);
    feedObserver?.disconnect();
    feedObserver = null;
    clearSortOrders();
    removeStaleSortBars();
    document.removeEventListener('click', onSortBarClick, true);
    window.removeEventListener('scroll', onScroll, true);
  }

  if (!sdfRuntime.isAvailable()) return;

  document.addEventListener('click', onSortBarClick, true);
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });

  chrome.runtime.onMessage.addListener((message) => {
    if (dead) return;
    if (message.type === 'decision') applyDecision(message.data);
  });

  document.addEventListener('sdf:override', (event) => {
    if (event.detail) applyDecision(event.detail);
  });

  document.addEventListener('sdf:article-tagged', () => {
    scheduleSortApply();
  });

  restoreSortPreference().then(() => {
    ensureSortBar();
    watchFeed();
    hydrateDecisions();
  });
})();
