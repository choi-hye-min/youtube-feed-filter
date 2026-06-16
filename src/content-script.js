(function() {
  const filterState = {
    threshold: '1month',
    enabled: true,
    homeEnabled: true,
    watchEnabled: true,
    loggingEnabled: false
  };
  let activePageKey = null;
  let runtime = null;
  let authState = 'unknown';
  let authObserver = null;

  function injectMainScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function getAdapter() {
    if (!filterState.enabled) return null;
    if (authState === 'signed-out') return null;
    if (filterState.watchEnabled && window.YouTubeSkipWatch.matchesPath(window.location.pathname)) {
      return window.YouTubeSkipWatch;
    }
    if (filterState.homeEnabled && window.YouTubeSkipHome.matchesPath(window.location.pathname)) {
      return window.YouTubeSkipHome;
    }
    return null;
  }

  function detectAuthState() {
    if (document.querySelector(
      'ytd-masthead #avatar-btn, ytd-masthead button#avatar-btn, ytd-masthead button[aria-label*="Account menu"], ytd-masthead button[aria-label*="계정 메뉴"], ytd-masthead button[aria-label*="Google Account"], ytd-masthead button[aria-label*="Google 계정"]'
    )) {
      return 'signed-in';
    }

    if (document.querySelector(
      'a[href*="ServiceLogin"], a[href*="accounts.google.com"], ytd-button-renderer a[aria-label*="Sign in"], ytd-button-renderer a[aria-label*="로그인"]'
    )) {
      return 'signed-out';
    }

    return 'unknown';
  }

  function refreshAuthState() {
    const nextAuthState = detectAuthState();
    if (nextAuthState === authState) return false;
    authState = nextAuthState;
    return true;
  }

  function activatePage() {
    refreshAuthState();

    if (authState === 'signed-out') {
      runtime?.stop();
      runtime = null;
      activePageKey = null;
      window.YouTubeSkipShared.showSignInNotice();
      return;
    }

    window.YouTubeSkipShared.hideSignInNotice();
    const adapter = getAdapter();
    const nextKey = adapter?.key || null;
    if (nextKey === activePageKey) {
      runtime?.apply();
      return;
    }

    runtime?.stop();
    runtime = null;
    activePageKey = nextKey;
    if (adapter) {
      runtime = window.YouTubeSkipShared.createRuntime(adapter, filterState);
      runtime.start();
    }
  }

  function resetHomePage() {
    if (activePageKey !== 'home') return;
    runtime?.stop();
    runtime?.reset();
    runtime = null;
    activePageKey = null;
  }

  function loadState(callback) {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) Object.assign(filterState, response);
      callback?.();
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'applyFilter') {
      loadState(() => {
        activatePage();
        sendResponse({ success: true });
      });
      return true;
    }
    if (request.action === 'getStats') {
      sendResponse(window.YouTubeSkipShared.getStats());
    }
    if (request.action === 'getAuthState') {
      refreshAuthState();
      sendResponse({ authState });
    }
    return false;
  });

  function init() {
    injectMainScript();
    loadState(activatePage);
    authObserver = new MutationObserver(() => {
      const changed = refreshAuthState();
      if (changed || authState === 'unknown') activatePage();
    });
    authObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-start', resetHomePage);
    document.addEventListener('yt-navigate-finish', activatePage);
    window.addEventListener('popstate', activatePage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
