/**
 * inject.js
 * Runs in the MAIN world. Robustly triggers "Not interested" action.
 */
(function() {
  let activeAction = null;
  const hiddenResultSelector = '.ytDismissibleItemReplacedContent';
  const popupSelector = 'ytd-menu-popup-renderer, tp-yt-iron-dropdown, yt-sheet-view-model';
  const isVisible = (element) => Boolean(
    element && element.isConnected && element.getClientRects().length > 0
  );

  function findFeedbackCommand(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 30) return null;
    if (obj.feedbackEndpoint || obj.feedbackCommand) return obj;
    if (obj.commandExecutorCommand?.commands?.some((command) => findFeedbackCommand(command, depth + 1))) {
      return obj;
    }
    for (const key of ['serviceEndpoint', 'command', 'onTap', 'innertubeCommand', 'rendererContext', 'commandContext']) {
      const command = findFeedbackCommand(obj[key], depth + 1);
      if (command) return command;
    }
    return null;
  }

  /**
   * Helper: Recursive search for the feedback endpoint in data
   */
  function findNotInterestedEndpoint(obj, depth = 0) {
    if (!obj || depth > 30) return null;
    if (typeof obj !== 'object') return null;

    // Only an explicit label or the specific icon identifies this feedback action.
    const isNotInterestedIcon = obj.icon?.iconType === 'NOT_INTERESTED' ||
                               obj.iconType === 'NOT_INTERESTED';
    const label = (
      obj.text?.simpleText || obj.text?.runs?.map((run) => run.text).join('') ||
      obj.title?.content || obj.title || obj.accessibility?.accessibilityData?.label ||
      obj.accessibilityText || ''
    ).toString();
    if (/^(관심없음|Notinterested|興味なし|不感兴趣)$/i.test(label.replace(/\s/g, '')) || isNotInterestedIcon) {
      const command = findFeedbackCommand(obj);
      if (command) return command;
    }

    // Optimization: avoid searching large irrelevant branches
    if (obj.playerResponse || obj.responseContext) return null;

    // First, try priority keys that usually lead to the menu
    const priorityKeys = [
      'content', 'lockupViewModel', 'metadata', 'lockupMetadataViewModel', 
      'menu', 'menuRenderer', 'menuViewModel', 'items', 'menuItemViewModel',
      'richItemRenderer', 'videoRenderer', 'onTap', 'command', 'serviceEndpoint'
    ];

    for (const key of priorityKeys) {
      if (obj[key] && typeof obj[key] === 'object') {
        const result = findNotInterestedEndpoint(obj[key], depth + 1);
        if (result) return result;
      }
    }
    
    // Fallback: search all other keys
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && !priorityKeys.includes(key) && obj[key] && typeof obj[key] === 'object') {
        const result = findNotInterestedEndpoint(obj[key], depth + 1);
        if (result) return result;
      }
    }
    return null;
  }

  function resolveWithoutMovingPage(app, resolver, command) {
    const originalFocus = HTMLElement.prototype.focus;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = window.scrollTo;
    const originalScrollBy = window.scrollBy;

    // Limit suppression to this synchronous command call. User input and later
    // page work must retain their normal focus and scrolling behavior.
    HTMLElement.prototype.focus = function() {};
    Element.prototype.scrollIntoView = function() {};
    window.scrollTo = function() {};
    window.scrollBy = function() {};
    try {
      return resolver.call(app, command);
    } finally {
      HTMLElement.prototype.focus = originalFocus;
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.scrollTo = originalScrollTo;
      window.scrollBy = originalScrollBy;
    }
  }

  function actionFailure(method) {
    return Object.assign(new Error(method), { method });
  }

  function getVideoId(element) {
    const link = element.querySelector('a[href*="/watch?v="]');
    return link ? new URL(link.href, window.location.origin).searchParams.get('v') : null;
  }

  function assertCurrent(action, requireCard = true) {
    if (action.controller.signal.aborted) throw action.controller.signal.reason;
    if (window.location.href !== action.pageUrl) throw actionFailure('stale_page');
    const currentVideoId = getVideoId(action.element);
    if ((currentVideoId && currentVideoId !== action.targetVideoId) ||
        (requireCard && (!action.element.isConnected || currentVideoId !== action.targetVideoId))) {
      throw actionFailure('stale_target');
    }
  }

  function wait(ms, action) {
    const signal = action.controller.signal;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      function onAbort() {
        clearTimeout(timeout);
        reject(signal.reason);
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function waitForHiddenResult(action) {
    for (let attempt = 0; attempt <= 16; attempt++) {
      assertCurrent(action, false);
      const candidates = action.element.isConnected ? [action.element] : [];
      if (action.element.isConnected && !isVisible(action.element)) {
        const previous = action.element.previousElementSibling;
        const next = action.element.nextElementSibling;
        if (next && next !== action.nextSibling && next.nextElementSibling === action.nextSibling &&
            previous === action.previousSibling) candidates.push(next);
        if (previous && previous !== action.previousSibling && previous.previousElementSibling === action.previousSibling &&
            next === action.nextSibling) candidates.push(previous);
      }
      if (!action.element.isConnected && action.parent?.isConnected) {
        const replacement = action.parent.children[action.index];
        if (replacement && replacement.previousElementSibling === action.previousSibling &&
            replacement.nextElementSibling === action.nextSibling) candidates.push(replacement);
      }
      for (const candidate of candidates) {
        const results = candidate.matches(hiddenResultSelector)
          ? [candidate] : candidate.querySelectorAll(hiddenResultSelector);
        for (const result of results) {
          if (isVisible(result) && !action.existingResults.has(result)) return result;
        }
      }
      if (attempt < 16) await wait(100, action);
    }
    throw actionFailure('result_timeout');
  }

  window.addEventListener('youtube-skip-cancel', (event) => {
    if (activeAction?.videoId === event.detail.videoId) {
      activeAction.controller.abort(actionFailure('cancelled'));
    }
  });
  document.addEventListener('yt-navigate-start', () => {
    activeAction?.controller.abort(actionFailure('stale_page'));
  });
  window.addEventListener('popstate', () => {
    activeAction?.controller.abort(actionFailure('stale_page'));
  });

  window.addEventListener('youtube-skip-action', async function(e) {
    const { videoId, targetVideoId, pageUrl, pageType = 'home', loggingEnabled = false } = e.detail;
    const debugLog = (...args) => {
      if (loggingEnabled) console.log('[youtube_skip]', ...args);
    };

    const currentPageType = window.location.pathname === '/watch'
      ? 'watch'
      : (window.location.pathname === '/' || window.location.pathname === '' ? 'home' : null);
    if (pageType !== currentPageType || pageUrl !== window.location.href) {
      sendResponse(false, 'stale_page');
      return;
    }

    const videoElement = document.querySelector(`[data-youtube-skip-id="${videoId}"]`);
    
    function sendResponse(success, method) {
      window.dispatchEvent(new CustomEvent('youtube-skip-response', {
        detail: { videoId, success, method }
      }));
    }

    if (activeAction) {
      sendResponse(false, 'action_busy');
      return;
    }
    if (!videoElement) {
      debugLog('Video element not found for action:', videoId);
      sendResponse(false, 'missing_element');
      return;
    }

    const action = {
      videoId, targetVideoId, pageUrl, element: videoElement, controller: new AbortController(),
      parent: videoElement.parentElement,
      index: videoElement.parentElement ? Array.from(videoElement.parentElement.children).indexOf(videoElement) : -1,
      previousSibling: videoElement.previousElementSibling,
      nextSibling: videoElement.nextElementSibling,
      existingResults: new Set(Array.from(document.querySelectorAll(hiddenResultSelector)).filter(isVisible))
    };
    activeAction = action;
    let response = { success: false, method: 'failed' };

    try {
      assertCurrent(action);
      const pageSelectors = pageType === 'watch'
        ? 'yt-lockup-view-model, ytd-compact-video-renderer, yt-lockup-metadata-view-model'
        : 'ytd-rich-grid-media, ytd-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer';
      const candidates = [videoElement, ...videoElement.querySelectorAll(pageSelectors)];
      const content = videoElement.querySelector('#content');
      if (content) candidates.push(content);
      let command = null;
      for (const candidate of candidates) {
        for (const data of [candidate.data, candidate.__data?.data, candidate.__data]) {
          command = findNotInterestedEndpoint(data);
          if (command) break;
        }
        if (command) break;
      }
      if (!command) throw actionFailure('missing_command');

      const ytdApp = document.querySelector('ytd-app');
      const resolver = typeof ytdApp?.resolveCommand === 'function' ? ytdApp.resolveCommand : ytdApp?.resolve;
      if (typeof resolver !== 'function') throw actionFailure('missing_resolver');
      if (Array.from(document.querySelectorAll(popupSelector)).some(isVisible)) {
        throw actionFailure('menu_busy');
      }

      try {
        Promise.resolve(resolveWithoutMovingPage(ytdApp, resolver, command)).catch(() => {
          action.controller.abort(actionFailure('command_failed'));
        });
      } catch {
        throw actionFailure('command_failed');
      }
      debugLog('Not interested command submitted for:', targetVideoId);
      response.method = 'api';
      const result = await waitForHiddenResult(action);
      assertCurrent(action, false);
      if (!isVisible(result)) throw actionFailure('stale_target');
      result.setAttribute('data-youtube-skip-result-id', videoId);
      response.success = true;
    } catch (err) {
      response = { success: false, method: err.method || 'error' };
      if (err.method) debugLog('Action did not complete:', err.method);
      else console.error('[youtube_skip] Injection error:', err);
    } finally {
      activeAction = null;
    }
    sendResponse(response.success, response.method);
  });
})();
