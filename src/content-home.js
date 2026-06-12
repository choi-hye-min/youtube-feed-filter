(function() {
  const Shared = window.YouTubeSkipShared;
  const candidateSelector = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-rich-grid-media',
    'yt-lockup-view-model',
    'ytd-grid-video-renderer'
  ].join(', ');

  window.YouTubeSkipHome = {
    key: 'home',
    matchesPath: (path) => path === '/' || path === '',
    findCandidates: (root) => root.querySelectorAll(candidateSelector),
    normalizeCandidate(element) {
      if (element.tagName.toLowerCase() !== 'yt-lockup-view-model') return element;
      return element.closest('ytd-rich-item-renderer, ytd-video-renderer') || element;
    },
    isEligible: (element) => !element.closest('#secondary'),
    extractAge: (element) => Shared.findAgeInElement(element, [
      '#metadata-line span',
      'yt-content-metadata-view-model [aria-label]',
      'span',
      'yt-formatted-string'
    ]),
    extractTitle: (element) => Shared.firstText(element, [
      '#video-title',
      '#video-title-link',
      '.yt-lockup-metadata-view-model-wiz__title',
      '.ytLockupMetadataViewModelTitle',
      'a[title]'
    ]),
    getObserverRoot: (root) => root.querySelector('ytd-browse[page-subtype="home"]') || root.querySelector('ytd-app'),
    shouldReapply: (mutations) => mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
      node.nodeType === 1 && (node.matches?.(candidateSelector) || node.querySelector?.(candidateSelector))
    ))
  };
})();
