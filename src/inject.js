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

  /**
   * Helper: Click the actual "Not interested" button in the UI
   */
  async function clickNotInterestedUI(videoElement) {
    const selectors = [
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
    
    let menuButton = null;
    for (const sel of selectors) {
        const btns = videoElement.querySelectorAll(sel);
        for (const btn of btns) {
            if (btn && btn.offsetParent !== null) {
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

    if (!menuButton) return false;

    menuButton.scrollIntoView({ block: 'center', inline: 'nearest' });
    menuButton.click();
    
    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        
        const items = document.querySelectorAll('yt-list-item-view-model, ytd-menu-service-item-renderer, tp-yt-paper-item, .ytd-menu-popup-renderer, yt-button-view-model, ytd-menu-navigation-item-renderer');
        
        let foundAny = false;
        for (const item of items) {
          foundAny = true;
          const text = item.innerText || item.textContent || "";
          if (text.replace(/\s/g, '').match(/관심없음|Notinterested|興味なし|不感兴趣/i)) {
            console.log('[youtube_skip] Found UI button, clicking...');
            item.click();
            clearInterval(interval);
            setTimeout(() => {
                document.body.click();
                window.dispatchEvent(new Event('click'));
            }, 200);
            resolve(true);
            return;
          }
        }

        if (attempts > 40) { 
          clearInterval(interval);
          if (foundAny) {
              const availableItems = Array.from(items).map(i => i.innerText || i.textContent || "unknown").filter(t => t.trim() !== "");
              console.log('[youtube_skip] UI Items found but none matched "Not interested":', availableItems);
          }
          document.body.click();
          resolve(false);
        }
      }, 100);
    });
  }

  window.addEventListener('youtube-skip-action', async function(e) {
    const { videoId } = e.detail;
    const videoElement = document.querySelector(`[data-youtube-skip-id="${videoId}"]`);
    
    function sendResponse(success, method) {
      window.dispatchEvent(new CustomEvent('youtube-skip-response', {
        detail: { videoId, success, method }
      }));
    }

    if (!videoElement) {
      console.error('[youtube_skip] Video element not found for action:', videoId);
      sendResponse(false, 'missing_element');
      return;
    }

    try {
      let data = videoElement.data || (videoElement.__data && videoElement.__data.data) || videoElement.__data;
      
      if (!data) {
          const vm = videoElement.querySelector('ytd-rich-grid-media, ytd-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer');
          if (vm) data = vm.data || vm.__data;
      }
      
      if (!data) {
          const content = videoElement.querySelector('#content');
          if (content) data = content.data || content.__data;
      }

      const command = data ? findNotInterestedEndpoint(data) : null;
      const ytdApp = document.querySelector('ytd-app');

      if (command && (ytdApp?.resolveCommand || ytdApp?.resolve)) {
        const resolver = (ytdApp.resolveCommand || ytdApp.resolve).bind(ytdApp);
        resolver(command);
        console.log('[youtube_skip] v1/feedback triggered via API for:', videoId);
        sendResponse(true, 'api');
        return;
      }

      console.log('[youtube_skip] API discovery failed, attempting UI simulation for:', videoId);
      const success = await clickNotInterestedUI(videoElement);
      if (success) {
        console.log('[youtube_skip] v1/feedback triggered via UI Click for:', videoId);
        sendResponse(true, 'ui');
      } else {
        console.error('[youtube_skip] All methods failed for:', videoId);
        if (data) {
            console.log('[youtube_skip] Failed data object:', data);
        }
        sendResponse(false, 'failed');
      }
    } catch (err) {
      console.error('[youtube_skip] Injection error:', err);
      sendResponse(false, 'error');
    }
  });
})();
