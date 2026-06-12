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

  function injectMainScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function getAdapter() {
    if (!filterState.enabled) return null;
    if (filterState.watchEnabled && window.YouTubeSkipWatch.matchesPath(window.location.pathname)) {
      return window.YouTubeSkipWatch;
    }
    if (filterState.homeEnabled && window.YouTubeSkipHome.matchesPath(window.location.pathname)) {
      return window.YouTubeSkipHome;
    }
    return null;
  }

  function activatePage() {
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
    return false;
  });

  function init() {
    injectMainScript();
    loadState(activatePage);
    document.addEventListener('yt-navigate-finish', activatePage);
    window.addEventListener('popstate', activatePage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
