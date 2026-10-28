(function() {
  const filterState = {
    threshold: '1month',
    enabled: true,
    homeEnabled: true,
    watchEnabled: true,
    loggingEnabled: false
  };
  let activePageKey = null;
  let activePageUrl = null;
  let activeThreshold = null;
  let runtime = null;
  let authState = 'unknown';
  let authObserver = null;
  let stateLoaded = false;
  let mainScriptLoaded = false;
  let navigating = false;

  function injectMainScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => {
      mainScriptLoaded = true;
      script.remove();
      activatePage();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function getAdapter() {
    if (!stateLoaded || !mainScriptLoaded || navigating) return null;
    if (!filterState.enabled) return null;
    if (authState !== 'signed-in') return null;
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
      window.YouTubeSkipShared.showSignInNotice();
    } else {
      window.YouTubeSkipShared.hideSignInNotice();
    }

    const adapter = getAdapter();
    if (adapter?.key === activePageKey && activePageUrl === window.location.href && activeThreshold === filterState.threshold) {
      runtime?.apply();
      return;
    }

    stopRuntime();
    if (adapter) {
      activePageKey = adapter.key;
      activePageUrl = window.location.href;
      activeThreshold = filterState.threshold;
      runtime = window.YouTubeSkipShared.createRuntime(adapter, filterState);
      runtime.start();
    }
  }

  function stopRuntime(clearCompleted = false) {
    runtime?.stop();
    runtime?.reset(clearCompleted);
    runtime = null;
    activePageKey = null;
    activePageUrl = null;
    activeThreshold = null;
  }

  function startNavigation() {
    navigating = true;
    stopRuntime(activePageKey === 'home');
  }

  function finishNavigation() {
    navigating = false;
    activatePage();
  }

  function loadState(callback) {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (!chrome.runtime.lastError && response) {
        Object.assign(filterState, response);
        stateLoaded = true;
      }
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
      if (refreshAuthState()) activatePage();
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
    document.addEventListener('yt-navigate-start', startNavigation);
    document.addEventListener('yt-navigate-finish', finishNavigation);
    window.addEventListener('popstate', finishNavigation);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
