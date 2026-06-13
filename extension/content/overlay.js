(() => {
  const decisions = new Map();
  const revealedTimers = new Map();
  const REVEAL_DURATION_MS = 10000;

  function findArticle(bundleId) {
    return document.querySelector(`article[data-testid="tweet"][data-sdf-bundle-id="${bundleId}"]`);
  }

  function statusUrl(bundleId) {
    const statusId = bundleId?.match(/^x-(\d+)$/)?.[1];
    return statusId ? `https://x.com/i/status/${statusId}` : null;
  }

  function normalizeDecision(data) {
    return {
      bundle_id: data.bundle_id || data.bundleId,
      action: data.action,
      reason_codes: data.reason_codes || data.reasonCodes || [],
      signal_score: data.signal_score ?? data.signalScore ?? null,
      score_explanation: data.score_explanation || data.scoreExplanation || null,
      agent_reasons: data.agent_reasons || data.agentReasons || [],
      confidence: data.confidence ?? null,
      escalate: data.escalate ?? null,
      worker: data.worker || null,
      cascade_meta: data.cascade_meta || data.cascadeMeta || null,
    };
  }

  function reviewMetaFromDecision(decision) {
    return {
      score: decision.signal_score,
      reasonCodes: decision.reason_codes || [],
      scoreExplanation: decision.score_explanation,
      agentReasons: decision.agent_reasons,
      confidence: decision.confidence,
      escalate: decision.escalate,
      worker: decision.worker,
      cascadeMeta: decision.cascade_meta,
    };
  }

  function holdReasonText(meta) {
    return window.sdfHoldReason?.buildHoldReason(meta) || {
      summary: 'Filter is unsure',
      inline: 'Pick what should happen to this post.',
      tooltip: 'Filter is unsure — pick what should happen to this post.',
    };
  }

  const reviewObservers = new WeakMap();

  function findTweetActionRow(article) {
    const reply = article.querySelector('[data-testid="reply"]');
    if (!reply) return null;

    let node = reply.parentElement;
    while (node && node !== article) {
      const like = node.querySelector('[data-testid="like"], [data-testid="unlike"]');
      const retweet = node.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
      if (like && retweet) return node;
      node = node.parentElement;
    }

    return reply.closest('[role="group"]');
  }

  function clearReviewObserver(article) {
    const observer = reviewObservers.get(article);
    if (!observer) return;
    observer.disconnect();
    reviewObservers.delete(article);
  }

  function compactNativeActions(row) {
    const hideIds = ['bookmark', 'removeBookmark', 'share', 'analytics'];
    for (const child of row.children) {
      if (child.classList.contains('sdf-review-actions')) continue;
      const hideById = hideIds.some((id) => child.querySelector(`[data-testid="${id}"]`));
      const hideByViews = Boolean(
        child.querySelector('[aria-label*="view" i], [aria-label*="View" i]')
      );
      if (hideById || hideByViews) child.classList.add('sdf-native-action-hidden');
    }
  }

  function restoreNativeActions(article) {
    article.querySelectorAll('.sdf-native-action-hidden').forEach((el) => {
      el.classList.remove('sdf-native-action-hidden');
    });
  }

  function removeReviewActions(article) {
    clearReviewObserver(article);
    restoreNativeActions(article);
    article.querySelector('.sdf-review-actions')?.remove();
  }

  function renderReviewActions(actions, meta) {
    const why = holdReasonText(meta);
    const reasonText = `${why.tooltip} — pick what should happen to this post.`;
    actions.innerHTML = `
      <p class="sdf-review-why">${escapeHtml(reasonText)}</p>
      <div class="sdf-review-segment" role="group" aria-label="Review actions">
        <button type="button" class="sdf-review-btn sdf-review-btn-show" data-res="SHOW" title="Keep visible in feed">Show</button>
        <button type="button" class="sdf-review-btn sdf-review-btn-hide" data-res="HIDE" title="Low-signal filter — remove from timeline (Hidden list)">Low signal</button>
        <button type="button" class="sdf-review-btn sdf-review-btn-block" data-res="BLOCK" title="Guardrail block — policy rejection (Blocked list)">Guardrail</button>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mountReviewActions(row, actions) {
    if (actions.parentElement === row) {
      row.removeChild(actions);
    }
    row.insertAdjacentElement('afterend', actions);
  }

  function ensureReviewActions(article, meta) {
    const row = findTweetActionRow(article);
    let actions = article.querySelector('.sdf-review-actions');

    if (!row) {
      if (!actions) {
        const pending = document.createElement('div');
        pending.className = 'sdf-review-actions sdf-review-actions-pending';
        pending.hidden = true;
        article.appendChild(pending);
        actions = pending;
      }
      renderReviewActions(actions, meta);

      if (!reviewObservers.has(article)) {
        const observer = new MutationObserver(() => {
          if (!findTweetActionRow(article)) return;
          clearReviewObserver(article);
          const bundleId = article.dataset.sdfBundleId;
          const decision = decisions.get(bundleId);
          if (decision?.action === 'HOLD') {
            ensureReviewActions(article, reviewMetaFromDecision(decision));
          }
        });
        observer.observe(article, { childList: true, subtree: true });
        reviewObservers.set(article, observer);
      }
      return;
    }

    clearReviewObserver(article);
    compactNativeActions(row);

    if (!actions || actions.classList.contains('sdf-review-actions-pending')) {
      actions?.remove();
      actions = document.createElement('div');
      actions.className = 'sdf-review-actions';
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', 'Needs review');
      mountReviewActions(row, actions);
    } else if (actions.previousElementSibling !== row) {
      mountReviewActions(row, actions);
    }

    renderReviewActions(actions, meta);
  }

  document.addEventListener(
    'click',
    (event) => {
      const btn = event.target.closest('.sdf-review-btn[data-res]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();

      const article = btn.closest('article[data-sdf-bundle-id]');
      const bundleId = article?.dataset.sdfBundleId;
      const resolution = btn.dataset.res;
      if (!bundleId || !resolution) return;

      document.dispatchEvent(
        new CustomEvent('sdf:resolve-held', { detail: { bundleId, resolution } })
      );
    },
    true
  );

  document.addEventListener(
    'mousedown',
    (event) => {
      if (event.target.closest('.sdf-review-actions')) {
        event.stopPropagation();
      }
    },
    true
  );

  function scoreWhyText(decision) {
    const explanation = decision.score_explanation?.trim();
    if (explanation) return explanation;
    const reasons = decision.agent_reasons || [];
    if (reasons.length) return reasons.join('; ');
    return null;
  }

  function applyDecision(decision) {
    const { bundle_id: bundleId, action, reason_codes: reasonCodes = [], signal_score: score } = decision;
    if (!bundleId) return;
    decisions.set(bundleId, decision);

    const article = findArticle(bundleId);
    if (!article) return;

    article.classList.remove('sdf-show', 'sdf-hide', 'sdf-hold', 'sdf-block');
    removeReviewActions(article);

    if (action === 'HOLD') {
      article.classList.add('sdf-hold');
      ensureReviewActions(article, reviewMetaFromDecision(decision));
      article.querySelector('.sdf-badge')?.remove();
      article.querySelector('.sdf-score-why')?.remove();
      return;
    }

    let badge = article.querySelector('.sdf-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sdf-badge';
      article.appendChild(badge);
    }

    const label = score != null ? `SCORE ${score}` : action;
    badge.textContent = label;

    const why = scoreWhyText(decision);
    badge.title = why || reasonCodes.join(', ') || action;

    let whyEl = article.querySelector('.sdf-score-why');
    if (why && action === 'SHOW') {
      if (!whyEl) {
        whyEl = document.createElement('p');
        whyEl.className = 'sdf-score-why';
        article.appendChild(whyEl);
      }
      whyEl.textContent = why;
    } else {
      whyEl?.remove();
    }

    switch (action) {
      case 'SHOW':
        article.classList.add('sdf-show');
        break;
      case 'HIDE':
        article.classList.add('sdf-hide');
        break;
      case 'BLOCK':
        article.classList.add('sdf-block');
        break;
      default:
        break;
    }
  }

  function revealPost(bundleId, { temporary = true } = {}) {
    if (!bundleId) return false;

    const article = findArticle(bundleId);
    if (!article) {
      const url = statusUrl(bundleId);
      if (url) window.location.assign(url);
      return Boolean(url);
    }

    clearTimeout(revealedTimers.get(bundleId));
    article.classList.add('sdf-revealed');
    article.scrollIntoView({ behavior: 'smooth', block: 'center' });
    article.classList.add('sdf-highlight');
    setTimeout(() => article.classList.remove('sdf-highlight'), 2000);

    if (temporary) {
      const timer = setTimeout(() => {
        article.classList.remove('sdf-revealed');
        revealedTimers.delete(bundleId);
      }, REVEAL_DURATION_MS);
      revealedTimers.set(bundleId, timer);
    }

    return true;
  }

  function scrollToPost(bundleId) {
    const article = findArticle(bundleId);
    if (!article) {
      revealPost(bundleId);
      return;
    }
    if (article.classList.contains('sdf-block') || article.classList.contains('sdf-hide')) {
      revealPost(bundleId);
      return;
    }
    article.scrollIntoView({ behavior: 'smooth', block: 'center' });
    article.classList.add('sdf-highlight');
    setTimeout(() => article.classList.remove('sdf-highlight'), 2000);
  }

  function reconcileVisibleArticles() {
    for (const article of document.querySelectorAll(
      'article[data-testid="tweet"][data-sdf-bundle-id]'
    )) {
      const decision = decisions.get(article.dataset.sdfBundleId);
      if (decision) applyDecision(decision);
    }
  }

  function hydrateDecisions() {
    if (!sdfRuntime.isAvailable()) return;
    Promise.all([
      sdfRuntime.sendMessage({ type: 'fetch_filtered_decisions' }),
      sdfRuntime.sendMessage({ type: 'fetch_held_decisions' }),
    ])
      .then(([filtered, held]) => {
        const rows = [
          ...(Array.isArray(filtered) ? filtered : []),
          ...(Array.isArray(held) ? held : []),
        ];
        for (const row of rows) applyDecision(normalizeDecision(row));
        reconcileVisibleArticles();
      })
      .catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'decision') {
      applyDecision(normalizeDecision(message.data));
    }
    if (message.type === 'reveal_post') {
      revealPost(message.bundleId);
    }
  });

  document.addEventListener('sdf:override', (event) => {
    if (event.detail) applyDecision(normalizeDecision(event.detail));
  });

  document.addEventListener('sdf:article-tagged', (event) => {
    const bundleId = event.detail?.bundleId;
    if (!bundleId) return;
    const decision = decisions.get(bundleId);
    if (decision) applyDecision(decision);
  });

  document.addEventListener('sdf:scroll-to', (event) => {
    scrollToPost(event.detail?.bundleId);
  });

  document.addEventListener('sdf:review-target', (event) => {
    const bundleId = event.detail?.bundleId || null;
    for (const article of document.querySelectorAll('article[data-testid="tweet"].sdf-review-target')) {
      article.classList.remove('sdf-review-target');
    }
    if (!bundleId) return;
    const article = findArticle(bundleId);
    if (article) article.classList.add('sdf-review-target');
  });

  hydrateDecisions();
})();
