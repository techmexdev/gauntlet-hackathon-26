(() => {
  function getPostPreview(bundleId) {
    const article = document.querySelector(
      `article[data-testid="tweet"][data-sdf-bundle-id="${CSS.escape(bundleId)}"]`
    );
    if (!article) return null;

    const text =
      article.querySelector(':scope [data-testid="tweetText"]')?.innerText?.trim() ||
      article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() ||
      '';

    const handle =
      article
        .querySelector('[data-testid="User-Name"] a[href^="/"]')
        ?.getAttribute('href')
        ?.replace(/^\//, '') || null;

    const displayName =
      article.querySelector('[data-testid="User-Name"] span')?.innerText?.trim() ||
      handle ||
      null;

    const avatarImg =
      article.querySelector('[data-testid="Tweet-User-Avatar"] img') ||
      article.querySelector('img[src*="profile_images"]');
    const avatarUrl = avatarImg?.getAttribute('src') || null;

    const photo = article.querySelector('[data-testid="tweetPhoto"] img');
    const video = article.querySelector('[data-testid="videoPlayer"] video');
    const mediaUrl = photo?.getAttribute('src') || video?.getAttribute('poster') || null;

    return { text, handle, displayName, inFeed: true, avatarUrl, mediaUrl };
  }

  window.sdfPostPreview = { getPostPreview };
})();
