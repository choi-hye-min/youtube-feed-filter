(function() {
  const Shared = window.YouTubeSkipShared;
  const relatedSelector = '#secondary, ytd-watch-next-secondary-results-renderer';
  const candidateSelector = [
    'ytd-watch-next-secondary-results-renderer yt-lockup-view-model',
    'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer',
    '#secondary yt-lockup-view-model',
    '#secondary ytd-compact-video-renderer'
  ].join(', ');

  window.YouTubeSkipWatch = {
    key: 'watch',
    matchesPath: (path) => path === '/watch',
    findCandidates: (root) => root.querySelectorAll(candidateSelector),
    normalizeCandidate: (element) => element,
    isEligible: (element) => Boolean(element.closest(relatedSelector)),
    extractAge: (element) => Shared.findAgeInElement(element, [
      'yt-content-metadata-view-model [aria-label*="전"]',
      'yt-content-metadata-view-model [aria-label*="ago"]',
      '.ytContentMetadataViewModelMetadataRow [aria-label]',
      '#metadata-line span'
    ]),
    extractTitle: (element) => Shared.firstText(element, [
      '.ytLockupMetadataViewModelTitle',
      '.ytLockupMetadataViewModelHeadingReset[title]',
      '#video-title',
      'a[href*="/watch?v="][aria-label]'
    ]),
    getActionDelay: (method) => method === 'api' ? 50 : 150,
    getObserverRoot: (root) => root.querySelector('ytd-watch-next-secondary-results-renderer') || root.querySelector('#secondary') || root.querySelector('ytd-watch-flexy') || root.querySelector('ytd-app'),
    shouldReapply: (mutations) => mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
      node.nodeType === 1 && (node.matches?.('ytd-watch-next-secondary-results-renderer, yt-lockup-view-model, ytd-compact-video-renderer, ytd-item-section-renderer') ||
        node.querySelector?.('ytd-watch-next-secondary-results-renderer, yt-lockup-view-model, ytd-compact-video-renderer'))
    ))
  };
})();
