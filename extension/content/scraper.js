(() => {
  const seen = new Set();
  let mode = 'live';
  let scrapeEnabled = true;
  let dead = false;

  function teardown() {
    if (dead) return;
    dead = true;
    observer.disconnect();
    scrapeEnabled = false;
  }

  sdfRuntime.onInvalidate(teardown);

  function hashText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    }
    return `x-${Math.abs(h)}`;
  }

  function extractPost(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (!textEl) return null;

    const text = textEl.innerText.trim();
    if (!text) return null;

    const handleEl = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
    const handle = handleEl?.getAttribute('href')?.replace(/^\//, '') || 'unknown';
    const displayName = article.querySelector('[data-testid="User-Name"] span')?.innerText || handle;
    const timeEl = article.querySelector('time');
    const capturedAt = timeEl?.getAttribute('datetime') || new Date().toISOString();
    const statusLink = article.querySelector('a[href*="/status/"]');
    const statusId = statusLink?.href?.match(/status\/(\d+)/)?.[1];

    const bundleId = statusId ? `x-${statusId}` : hashText(`${handle}:${text.slice(0, 120)}`);
    if (seen.has(bundleId)) return null;
    seen.add(bundleId);

    article.dataset.sdfBundleId = bundleId;
    document.dispatchEvent(new CustomEvent('sdf:article-tagged', { detail: { bundleId } }));

    return {
      bundle_id: bundleId,
      author_handle: handle,
      author_display_name: displayName,
      text,
      captured_at: capturedAt,
      engagement: { likes: 0, retweets: 0, replies: 0 },
    };
  }

  function scrapeVisible() {
    if (dead || !scrapeEnabled || mode === 'replay') return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const posts = [];
    for (const article of articles) {
      const post = extractPost(article);
      if (post) posts.push(post);
    }

    if (posts.length) {
      sdfRuntime.sendMessage({ type: 'ingest', posts }).catch(() => teardown());
    }
  }

  const observer = new MutationObserver(() => {
    scrapeVisible();
  });

  function start() {
    scrapeVisible();
    const timeline = document.querySelector('[data-testid="primaryColumn"]') || document.body;
    observer.observe(timeline, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (dead) return;
    if (message.type === 'mode') {
      mode = message.data.mode;
      scrapeEnabled = mode !== 'replay';
      if (mode === 'replay') observer.disconnect();
      else start();
    }
  });

  if (!sdfRuntime.isAvailable()) return;

  sdfRuntime
    .sendMessage({ type: 'get_state' })
    .then((state) => {
      if (dead) return;
      if (state?.mode) {
        mode = state.mode;
        scrapeEnabled = mode !== 'replay';
      }
      if (scrapeEnabled) start();
    })
    .catch(() => teardown());
})();
