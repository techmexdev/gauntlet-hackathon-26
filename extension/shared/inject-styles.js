(() => {
  const RESOURCES = [
    'shared/tokens.css',
    'shared/components.css',
    'shared/overlay.css',
    'shared/high-signal.css',
    'shared/timeline-sort.css',
  ];

  function injectStylesheet(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(href);
    document.head.appendChild(link);
  }

  RESOURCES.forEach((href) => {
    injectStylesheet(href, `sdf-style-${href.replace(/\W/g, '-')}`);
  });
})();
