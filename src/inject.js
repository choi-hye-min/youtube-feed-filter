/**
 * inject.js
 * Runs in the MAIN world. Robustly triggers "Not interested" action.
 */
(function() {
  /**
   * Helper: Recursive search for the feedback endpoint in data
   */
  function findNotInterestedEndpoint(obj, depth = 0) {
    if (!obj || depth > 30) return null;
    if (typeof obj !== 'object') return null;

    // Check if this object is a feedback command
    const isFeedback = obj.feedbackEndpoint || obj.feedbackCommand;
    const hasMetadata = obj.commandMetadata?.webCommandMetadata?.url?.includes('v1/feedback');
    
    // Check by icon type if label matching fails
    const isNotInterestedIcon = obj.icon?.iconType === 'NOT_INTERESTED' || 
                               obj.icon?.iconType === 'REMOVE_CIRCLE_OUTLINE' ||
                               obj.iconType === 'NOT_INTERESTED';

    if (isFeedback || hasMetadata || isNotInterestedIcon) {
      // Try to verify if this is the "Not interested" one
      const label = (
        obj.text?.simpleText || 
        obj.text?.runs?.[0]?.text || 
        obj.title?.content || 
        obj.title || 
        obj.accessibility?.accessibilityData?.label ||
        obj.accessibilityText || 
        ""
      ).toString();

      const isNotInterestedMatch = label.replace(/\s/g, '').match(/관심없음|Notinterested|興味なし|不感兴趣/i);
      
      // If we found a feedback command and it matches "Not interested" OR it's the right icon
      if (isNotInterestedMatch || isNotInterestedIcon || (depth > 12 && label === "")) {
        return obj.serviceEndpoint || obj.command || obj.onTap || obj;
      }
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

    return () => {
      HTMLElement.prototype.focus = originalFocus;
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.scrollTo = originalScrollTo;
      window.scrollBy = originalScrollBy;
      if (shouldRestorePosition) originalScrollTo.call(window, savedX, savedY);
    };
  }

  /**
   * Helper: Click the actual "Not interested" button in the UI
   */
  async function clickNotInterestedUI(videoElement, pageType, debugLog, restoreActionScrolling) {
    const isVisible = (element) => Boolean(
      element && element.isConnected && element.getClientRects().length > 0
    );

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
        if (btn.innerText?.includes('⋮') || 
            btn.innerHTML?.includes('more_vert') || 
            label.match(/메뉴|menu|Action|더보기/i)) {
          menuButton = btn;
          break;
        }
      }
    }

    if (!menuButton || !videoElement.isConnected) {
      restoreActionScrolling();
      return { success: false, reason: 'missing_menu' };
    }

    // Avoid fighting with a menu the user or YouTube already has open.
    // The queue will retry this card later instead of toggling that popup.
    const openPopup = Array.from(document.querySelectorAll(
      'ytd-menu-popup-renderer, tp-yt-iron-dropdown, yt-sheet-view-model'
    )).find(isVisible);
    if (openPopup) {
      restoreActionScrolling();
      return { success: false, reason: 'menu_busy' };
    }

    menuButton.click();
    
    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        
        const items = document.querySelectorAll('yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item, yt-button-view-model, ytd-menu-navigation-item-renderer');
        
        let foundAny = false;
        for (const item of items) {
          if (!isVisible(item)) continue;
          foundAny = true;
          const text = item.innerText || item.textContent || "";
          if (text.replace(/\s/g, '').match(/관심없음|Notinterested|興味なし|不感兴趣/i)) {
            debugLog('Found UI button, clicking...');
            const clickTarget = item.querySelector('button, [role="button"]') || item;
            clickTarget.click();
            clearInterval(interval);
            // Let YouTube complete the feedback request and recommendation-list
            // reconciliation before the next queued card is processed.
            setTimeout(() => {
              restoreActionScrolling();
              resolve({ success: true, reason: 'ui' });
            }, pageType === 'watch' ? 200 : 700);
            return;
          }
        }

        if (pageType === 'home' && foundAny && attempts >= 5) {
          clearInterval(interval);
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
          }));
          restoreActionScrolling();
          resolve({ success: false, reason: 'missing_not_interested' });
          return;
        }

        if (attempts > 40) { 
          clearInterval(interval);
          if (foundAny) {
              const availableItems = Array.from(items).map(i => i.innerText || i.textContent || "unknown").filter(t => t.trim() !== "");
              debugLog('UI Items found but none matched "Not interested":', availableItems);
          }
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
          }));
          restoreActionScrolling();
          resolve({ success: false, reason: foundAny ? 'missing_not_interested' : 'menu_timeout' });
        }
      }, 100);
    });
  }

  window.addEventListener('youtube-skip-action', async function(e) {
    const { videoId, pageType = 'home', loggingEnabled = false } = e.detail;
    const debugLog = (...args) => {
      if (loggingEnabled) console.log('[youtube_skip]', ...args);
    };

    const currentPageType = window.location.pathname === '/watch'
      ? 'watch'
      : (window.location.pathname === '/' || window.location.pathname === '' ? 'home' : null);
    if (pageType !== currentPageType) {
      sendResponse(false, 'stale_page');
      return;
    }

    const videoElement = document.querySelector(`[data-youtube-skip-id="${videoId}"]`);
    
    function sendResponse(success, method) {
      window.dispatchEvent(new CustomEvent('youtube-skip-response', {
        detail: { videoId, success, method }
      }));
    }

    if (!videoElement) {
      debugLog('Video element not found for action:', videoId);
      sendResponse(false, 'missing_element');
      return;
    }

    let restoreActionScrolling = null;

    try {
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
        resolver(command);
        debugLog('v1/feedback triggered via API for:', videoId);
        setTimeout(() => {
          restoreActionScrolling();
          sendResponse(true, 'api');
        }, pageType === 'watch' ? 200 : 700);
        return;
      }

      debugLog('API discovery failed, attempting UI simulation for:', videoId);
      const uiResult = await clickNotInterestedUI(videoElement, pageType, debugLog, restoreActionScrolling);
      if (uiResult.success) {
        debugLog('v1/feedback triggered via UI Click for:', videoId);
        sendResponse(true, 'ui');
      } else {
        debugLog('All methods failed for:', videoId);
        if (data) {
            debugLog('Failed data object:', data);
        }
        sendResponse(false, uiResult.reason || 'failed');
      }
    } catch (err) {
      restoreActionScrolling?.();
      console.error('[youtube_skip] Injection error:', err);
      sendResponse(false, 'error');
    }
  });
})();
