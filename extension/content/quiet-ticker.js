(() => {
  const STORAGE_KEY = 'sdf.quietTicker.dismissed';
  const PULSE_MS = 700;

  const SM = () => window.sdfSessionMetrics;
  let metrics = SM()?.createSessionMetrics() ?? { show: 0, hide: 0, block: 0, hold: 0, total: 0 };
  let root = null;
  let rateEl = null;
  let detailEl = null;
  let lastActionEl = null;
  let heroLabelEl = null;
  let pulseTimer = null;
  let dismissed = false;

  function formatActionLabel(action) {
    switch (String(action || '').toUpperCase()) {
      case 'SHOW':
        return 'kept visible';
      case 'HIDE':
        return 'hidden from feed';
      case 'BLOCK':
        return 'blocked';
      case 'HOLD':
        return 'held for review';
      default:
        return String(action || '').toLowerCase() || 'unknown';
    }
  }

  function buildTickerCopy(summary, lastAction) {
    if (!summary || !summary.total) {
      return {
        rateLabel: '—',
        rateTitle: 'Percent of scored posts hidden, blocked, or held for review',
        detail: 'Waiting for post decisions…',
        last: '',
        aria: 'Feed quieting: waiting for post decisions',
      };
    }

    const detail = `${summary.quieted} quieted of ${summary.total} posts · ${summary.show} kept visible (${summary.snrLabel})`;
    let last = '';
    if (lastAction?.action) {
      const score =
        lastAction.signal_score ?? lastAction.signalScore ?? lastAction.score ?? null;
      const scorePart = score != null ? ` · signal score ${score}` : '';
      last = `Latest: ${formatActionLabel(lastAction.action)}${scorePart}`;
    }

    return {
      rateLabel: summary.quietRateLabel,
      rateTitle: 'Quiet rate — percent of scored posts hidden, blocked, or held',
      detail,
      last,
      aria: `Feed quieting: ${summary.quietRateLabel} quieted. ${detail}.${last ? ` ${last}.` : ''}`,
    };
  }

  function isHomePage() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/home' || path === '/';
  }

  function loadStyles() {
    if (document.getElementById('sdf-quiet-ticker-css')) return;
    const link = document.createElement('link');
    link.id = 'sdf-quiet-ticker-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('shared/quiet-ticker.css');
    document.head.appendChild(link);
  }

  function ensureTicker() {
    if (root || dismissed) return;
    loadStyles();
    root = document.createElement('div');
    root.className = 'sdf-quiet-ticker';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="sdf-quiet-ticker-head">
        <span class="sdf-quiet-ticker-title">Feed quieting</span>
        <button type="button" class="sdf-quiet-ticker-dismiss" title="Dismiss ticker" aria-label="Dismiss feed quiet ticker">×</button>
      </div>
      <div class="sdf-quiet-ticker-body">
        <div class="sdf-quiet-ticker-hero" title="Percent of scored posts hidden, blocked, or held for review">
          <span class="sdf-quiet-ticker-hero-label">Quieted</span>
          <span class="sdf-quiet-ticker-rate">—</span>
        </div>
        <div class="sdf-quiet-ticker-meta">
          <span class="sdf-quiet-ticker-detail">Waiting for post decisions…</span>
          <span class="sdf-quiet-ticker-last"></span>
        </div>
      </div>
    `;
    rateEl = root.querySelector('.sdf-quiet-ticker-rate');
    heroLabelEl = root.querySelector('.sdf-quiet-ticker-hero-label');
    detailEl = root.querySelector('.sdf-quiet-ticker-detail');
    lastActionEl = root.querySelector('.sdf-quiet-ticker-last');
    root.querySelector('.sdf-quiet-ticker-dismiss')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismissed = true;
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore
      }
      root?.remove();
      root = null;
    });
    const slot = document.getElementById('sdf-quiet-ticker-slot');
    (slot || window.sdfHudAnchor?.ensureHud?.()).appendChild(root);
    updateVisibility();
  }

  function updateVisibility() {
    if (!root) return;
    const visible = isHomePage() && !dismissed;
    root.classList.toggle('sdf-quiet-ticker-hidden', !visible);
  }

  function pulse() {
    if (!root) return;
    root.classList.add('sdf-quiet-ticker-pulse');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      root?.classList.remove('sdf-quiet-ticker-pulse');
    }, PULSE_MS);
  }

  function render(lastAction) {
    if (dismissed) return;
    ensureTicker();
    if (!rateEl) return;

    const summary = SM()?.formatMetricsSummary(metrics);
    if (summary) {
      rateEl.textContent = summary.quietRateLabel;
      detailEl.textContent = `${summary.quieted}/${summary.total} quieted · SNR ${summary.snrLabel}`;
      root.dataset.ae1State = summary.ae1?.state || 'collecting';
    } else {
      rateEl.textContent = '—';
      detailEl.textContent = '0 quieted';
    }

    if (lastAction) {
      const score =
        lastAction.signal_score ?? lastAction.signalScore ?? lastAction.score ?? null;
      const scorePart = score != null ? ` · ${score}` : '';
      lastActionEl.textContent = `Last: ${lastAction.action}${scorePart}`;
    }

    updateVisibility();
  }

  function ingestDecision(data) {
    const action = data?.action || data?.resolution;
    if (!action || !SM()) return;
    SM().applyDecision(metrics, action);
    render({ action, signal_score: data.signal_score ?? data.signalScore });
    if (action === 'HIDE' || action === 'BLOCK' || action === 'HOLD') pulse();
  }

  function ingestOversight(data) {
    if (!data?.resolution || !SM()) return;
    SM().applyOversight(metrics, data.resolution);
    render({ action: data.resolution, signal_score: data.signal_score ?? data.signalScore });
    if (data.resolution === 'HIDE' || data.resolution === 'BLOCK') pulse();
  }

  function hydrateMetrics() {
    if (!SM()) return;
    sdfRuntime.sendMessage({ type: 'fetch_session_metrics' }, (counts) => {
      if (!counts || counts.error) return;
      metrics = SM().metricsFromCounts(counts);
      render();
    });
  }

  function teardown() {
    clearTimeout(pulseTimer);
    root?.remove();
    root = null;
    rateEl = null;
    detailEl = null;
    lastActionEl = null;
  }

  try {
    dismissed = sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    dismissed = false;
  }

  sdfRuntime.onInvalidate(teardown);

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'decision':
        ingestDecision(message.data);
        break;
      case 'oversight':
        ingestOversight(message.data);
        break;
      case 'mode':
        hydrateMetrics();
        break;
      default:
        break;
    }
  });

  window.addEventListener('popstate', updateVisibility);
  const observer = new MutationObserver(updateVisibility);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  if (!dismissed) {
    hydrateMetrics();
    render();
  }
})();
