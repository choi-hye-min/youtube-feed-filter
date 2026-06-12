(function() {
  const Shared = window.YouTubeSkipShared;
  const candidateSelector = '#secondary yt-lockup-view-model, #secondary ytd-compact-video-renderer';

  window.YouTubeSkipWatch = {
    key: 'watch',
    matchesPath: (path) => path === '/watch',
    findCandidates: (root) => root.querySelectorAll(candidateSelector),
    normalizeCandidate: (element) => element,
    isEligible: (element) => Boolean(element.closest('#secondary')),
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
    getObserverRoot: (root) => root.querySelector('#secondary') || root.querySelector('ytd-watch-flexy') || root.querySelector('ytd-app'),
    shouldReapply: (mutations) => mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
      node.nodeType === 1 && (node.matches?.('yt-lockup-view-model, ytd-compact-video-renderer, ytd-item-section-renderer') ||
        node.querySelector?.('yt-lockup-view-model, ytd-compact-video-renderer'))
    ))
  };
})();
