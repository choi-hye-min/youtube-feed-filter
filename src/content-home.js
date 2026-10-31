(function() {
  const Shared = window.YouTubeSkipShared;
  const candidateSelector = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-rich-grid-media',
    'yt-lockup-view-model',
    'ytd-grid-video-renderer'
  ].join(', ');

  function createExposureObserver(onExposure) {
    const observed = new Set();
    const visible = new Set();
    let disconnected = false;

    function notify(element) {
      if (document.visibilityState !== 'visible' || !element.isConnected ||
          element.hidden || element.closest('[hidden]') ||
          !element.closest('ytd-browse[page-subtype="home"]') ||
          element.getClientRects().length === 0) return;
      const visibility = window.getComputedStyle(element).visibility;
      if (visibility === 'hidden' || visibility === 'collapse') return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      if (width * height >= rect.width * rect.height * 0.5) onExposure(element);
    }

    function remove(element) {
      observer.unobserve(element);
      observed.delete(element);
      visible.delete(element);
    }

    const observer = new IntersectionObserver((entries) => {
      if (disconnected) return;
      for (const entry of entries) {
        const element = entry.target;
        if (!observed.has(element)) continue;
        if (!element.isConnected) {
          remove(element);
        } else if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          visible.add(element);
          notify(element);
        } else {
          visible.delete(element);
        }
      }
    }, { threshold: 0.5 });

    function refresh() {
      if (disconnected) return;
      for (const element of observed) {
        if (!element.isConnected) remove(element);
      }
      for (const element of visible) notify(element);
    }

    document.addEventListener('visibilitychange', refresh);
    return {
      observe(element) {
        if (disconnected || observed.has(element) ||
            !element.closest('ytd-browse[page-subtype="home"]')) return;
        observed.add(element);
        observer.observe(element);
      },
      refresh,
      disconnect() {
        disconnected = true;
        observer.disconnect();
        document.removeEventListener('visibilitychange', refresh);
        observed.clear();
        visible.clear();
      }
    };
  }

  window.YouTubeSkipHome = {
    key: 'home',
    createExposureObserver,
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
      'a[title]',
      'a[href*="/watch?v="][aria-label]'
    ]),
    getObserverRoot: (root) => root.querySelector('ytd-browse[page-subtype="home"]') || root.querySelector('ytd-app'),
    shouldReapply: (mutations) => mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) =>
      node.nodeType === 1 && (node.matches?.(candidateSelector) || node.querySelector?.(candidateSelector))
    ))
  };
})();
