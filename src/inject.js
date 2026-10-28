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

  function suppressActionScrolling(videoElement, shouldRestorePosition) {
    const originalFocus = HTMLElement.prototype.focus;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = window.scrollTo;
    const originalScrollBy = window.scrollBy;
    const savedX = window.scrollX;
    const savedY = window.scrollY;

    HTMLElement.prototype.focus = function(options) {
      return originalFocus.call(this, { ...(options || {}), preventScroll: true });
    };
    Element.prototype.scrollIntoView = function(options) {
      const isTargetCard = this === videoElement || videoElement.contains(this);
      const isMenuPopup = this.closest?.(
        'ytd-menu-popup-renderer, tp-yt-iron-dropdown, yt-sheet-view-model'
      );
      if (isTargetCard || isMenuPopup) return;
      return originalScrollIntoView.call(this, options);
    };
    window.scrollTo = function(...args) {
      if (shouldRestorePosition) return;
      return originalScrollTo.apply(this, args);
    };
    window.scrollBy = function(...args) {
      if (shouldRestorePosition) return;
      return originalScrollBy.apply(this, args);
    };

    return (restorePosition = true) => {
      HTMLElement.prototype.focus = originalFocus;
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.scrollTo = originalScrollTo;
      window.scrollBy = originalScrollBy;
      if (shouldRestorePosition && restorePosition) originalScrollTo.call(window, savedX, savedY);
    };
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

  /**
   * Helper: Click the actual "Not interested" button in the UI
   */
  async function clickNotInterestedUI(action, pageType, debugLog) {
    const videoElement = action.element;

    const homeSelectors = [
        '.ytLockupMetadataViewModelMenuButton button[aria-label="추가 작업"]',
        'button[aria-label*="메뉴"]', 
        'button[aria-label*="menu"]', 
        'button[aria-label*="Action"]',
        'yt-icon-button#button', 
        '.dropdown-trigger', 
        '#menu button', 
        'yt-icon-button.ytd-menu-renderer',
        '.yt-button-view-model button',
        'yt-button-shape button',
        'ytd-menu-renderer button'
    ];
    const watchSelectors = [
        '.ytLockupMetadataViewModelMenuButton button[aria-label="추가 작업"]',
        '.ytLockupMetadataViewModelMenuButton button',
        'yt-lockup-metadata-view-model button[aria-label*="추가"]',
        'yt-lockup-metadata-view-model button[aria-label*="작업"]',
        'yt-lockup-metadata-view-model button[aria-label*="Action"]',
        'yt-lockup-metadata-view-model button[aria-label*="menu"]',
        'button-view-model button[aria-label*="추가"]',
        'button-view-model button[aria-label*="Action"]',
        'yt-button-shape button[aria-label*="추가"]',
        'yt-button-shape button[aria-label*="Action"]',
        'button[aria-label="Action menu"]',
        'button[aria-label*="Action"]',
        'button[aria-label*="추가 작업"]',
        'button[aria-label*="작업 메뉴"]',
        'ytd-menu-renderer button'
    ];
    const selectors = pageType === 'watch' ? watchSelectors : homeSelectors;
    
    let menuButton = null;
    for (const sel of selectors) {
        const btns = videoElement.querySelectorAll(sel);
        for (const btn of btns) {
            if (isVisible(btn)) {
                menuButton = btn;
                break;
            }
        }
        if (menuButton) break;
    }
    
    if (!menuButton) {
      const allButtons = videoElement.querySelectorAll('button, yt-icon-button');
      for (const btn of allButtons) {
        const label = btn.getAttribute('aria-label') || "";
        if (isVisible(btn) && (btn.innerText?.includes('⋮') ||
            btn.innerHTML?.includes('more_vert') || 
            label.match(/메뉴|menu|Action|더보기/i))) {
          menuButton = btn;
          break;
        }
      }
    }

    if (!menuButton || !videoElement.isConnected) {
      return { success: false, reason: 'missing_menu' };
    }

    // Avoid fighting with a menu the user or YouTube already has open.
    // The queue will retry this card later instead of toggling that popup.
    const openPopup = Array.from(document.querySelectorAll(popupSelector)).find(isVisible);
    if (openPopup) {
      return { success: false, reason: 'menu_busy' };
    }

    assertCurrent(action);
    action.openedMenu = true;
    menuButton.click();
    let foundAny = false;
    for (let attempt = 1; attempt <= 41; attempt++) {
      await wait(100, action);
      assertCurrent(action);
      action.menuPopup ||= Array.from(document.querySelectorAll(popupSelector)).find(isVisible);
      if (action.menuPopup && !isVisible(action.menuPopup)) return { success: false, reason: 'menu_closed' };
      const items = action.menuPopup?.querySelectorAll(
        'yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item, yt-button-view-model, ytd-menu-navigation-item-renderer'
      ) || [];
      foundAny = false;
      for (const item of items) {
        if (!isVisible(item)) continue;
        foundAny = true;
        const text = item.innerText || item.textContent || '';
        if (/^(관심없음|Notinterested|興味なし|不感兴趣)$/i.test(text.replace(/\s/g, ''))) {
          assertCurrent(action);
          debugLog('Found UI button, clicking...');
          const clickTarget = item.querySelector('button, [role="button"]') || item;
          clickTarget.click();
          return { success: true, reason: 'ui' };
        }
      }
      if (pageType === 'home' && foundAny && attempt >= 5) {
        return { success: false, reason: 'missing_not_interested' };
      }
    }
    return { success: false, reason: foundAny ? 'missing_not_interested' : 'menu_timeout' };
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
    let restoreActionScrolling = null;
    let response = { success: false, method: 'failed' };

    try {
      assertCurrent(action);
      let data = videoElement.data || (videoElement.__data && videoElement.__data.data) || videoElement.__data;
      
      if (!data) {
          const pageSelectors = pageType === 'watch'
            ? 'yt-lockup-view-model, ytd-compact-video-renderer, yt-lockup-metadata-view-model'
            : 'ytd-rich-grid-media, ytd-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer';
          const vm = videoElement.matches(pageSelectors) ? videoElement : videoElement.querySelector(pageSelectors);
          if (vm) data = vm.data || vm.__data;
      }
      
      if (!data) {
          const content = videoElement.querySelector('#content');
          if (content) data = content.data || content.__data;
      }

      const command = data ? findNotInterestedEndpoint(data) : null;
      const ytdApp = document.querySelector('ytd-app');

      restoreActionScrolling = suppressActionScrolling(videoElement, pageType === 'home');

      if (command && (ytdApp?.resolveCommand || ytdApp?.resolve)) {
        const resolver = (ytdApp.resolveCommand || ytdApp.resolve).bind(ytdApp);
        Promise.resolve(resolver(command)).catch(() => {
          action.controller.abort(actionFailure('command_failed'));
        });
        debugLog('v1/feedback triggered via API for:', videoId);
        response.method = 'api';
      } else {
        debugLog('API discovery failed, attempting UI simulation for:', videoId);
        const uiResult = await clickNotInterestedUI(action, pageType, debugLog);
        if (!uiResult.success) throw actionFailure(uiResult.reason);
        response.method = 'ui';
      }
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
      if (action.openedMenu && window.location.href === pageUrl &&
          (isVisible(action.menuPopup) || (!action.menuPopup && Array.from(document.querySelectorAll(popupSelector)).some(isVisible)))) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      restoreActionScrolling?.(!action.controller.signal.aborted && window.location.href === pageUrl);
      activeAction = null;
    }
    sendResponse(response.success, response.method);
  });
})();
