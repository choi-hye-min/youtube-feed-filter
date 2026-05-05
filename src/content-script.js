/**
 * content-script.js
 * 
 * Executes on YouTube main page. Observes feed for new videos, extracts upload age,
 * and triggers "Not interested" action for videos matching the filter criteria.
 */

// State
let filterState = {
  threshold: '1month',
  enabled: true,
  thresholdMs: 30 * 24 * 60 * 60 * 1000, // 1 month default
  loggingEnabled: false
};

// Stats tracking
let stats = {
  detected: 0,
  skipped: 0,
  skippedVideos: [] // Array of {title, ageText}
};

// Set to track processed video IDs (to handle YouTube's element recycling)
const processedVideoIds = new Set();

// Queue for sequential "Not interested" actions
let actionQueue = [];
let isProcessingQueue = false;

/**
 * Custom logger
 */
function debugLog(...args) {
  if (filterState.loggingEnabled) {
    console.log('[youtube_skip]', ...args);
  }
}

/**
 * Add a video to the action queue
 */
function queueNotInterested(videoElement, videoInfo, videoId) {
  const status = videoElement.dataset.youtubeSkipProcessed;
  if (status === 'queued' || status === 'done') return;
  
  videoElement.dataset.youtubeSkipProcessed = 'queued';
  if (videoId) processedVideoIds.add(videoId);
  
  stats.skipped++;
  stats.skippedVideos.unshift(videoInfo);
  if (stats.skippedVideos.length > 50) stats.skippedVideos.pop();
  
  // Update badge
  chrome.runtime.sendMessage({ action: 'updateBadge', count: stats.skipped });
  
  actionQueue.push({ element: videoElement, id: videoId });
  if (!isProcessingQueue) {
    processQueue();
  }
}

/**
 * Process the queue sequentially
 */
async function processQueue() {
  if (isProcessingQueue || actionQueue.length === 0) return;
  
  isProcessingQueue = true;
  debugLog(`Processing queue of ${actionQueue.length} videos`);
  
  while (actionQueue.length > 0) {
    const item = actionQueue.shift();
    try {
      const success = await performMarkAsNotInterested(item.element);
      if (success) {
        item.element.dataset.youtubeSkipProcessed = 'done';
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e) {
      console.error('[youtube_skip] Error in queue processing:', e);
    }
  }
  
  isProcessingQueue = false;
  debugLog('Finished processing queue');
}

/**
 * Actual implementation of marking as not interested
 */
function performMarkAsNotInterested(videoElement) {
  return new Promise((resolve) => {
    try {
      const videoId = 'yt-skip-' + Math.random().toString(36).substr(2, 9);
      videoElement.dataset.youtubeSkipId = videoId;

      const event = new CustomEvent('youtube-skip-action', {
        detail: { videoId: videoId }
      });
      window.dispatchEvent(event);
      
      // Visual feedback and permanent hiding
      videoElement.style.setProperty('display', 'none', 'important');
      videoElement.setAttribute('hidden', '');
      
      // Try to remove but also keep hidden in case YouTube re-inserts
      setTimeout(() => {
        if (videoElement.parentNode) {
          videoElement.remove();
        }
      }, 400);

      resolve(true);
    } catch (e) {
      console.error('[youtube_skip] Error bridging to internal command:', e);
      resolve(false);
    }
  });
}

/**
 * Trigger "Not interested" action
 */
function markAsNotInterested(videoElement, videoInfo, videoId) {
  queueNotInterested(videoElement, videoInfo, videoId);
  return true;
}

// Threshold value definitions
const THRESHOLD_PRESETS = {
  '1day': 1 * 24 * 60 * 60 * 1000,
  '2days': 2 * 24 * 60 * 60 * 1000,
  '3days': 3 * 24 * 60 * 60 * 1000,
  '4days': 4 * 24 * 60 * 60 * 1000,
  '5days': 5 * 24 * 60 * 60 * 1000,
  '1week': 7 * 24 * 60 * 60 * 1000,
  '2weeks': 14 * 24 * 60 * 60 * 1000,
  '1month': 30 * 24 * 60 * 60 * 1000,
  '3months': 90 * 24 * 60 * 60 * 1000,
  '6months': 180 * 24 * 60 * 60 * 1000
};

/**
 * Get video ID from href
 */
function getVideoId(videoElement) {
  const link = videoElement.querySelector('a[href*="/watch?v="]');
  if (link) {
    const url = new URL(link.href, window.location.origin);
    return url.searchParams.get('v');
  }
  return null;
}

/**
 * Extract upload age
 */
function extractUploadAge(videoElement) {
  try {
    const ariaLabel = videoElement.getAttribute('aria-label') || '';
    const ageFromAria = findAgeInText(ariaLabel);
    if (ageFromAria) return ageFromAria;

    const allText = videoElement.innerText || videoElement.textContent || '';
    const ageFromText = findAgeInText(allText);
    if (ageFromText) return ageFromText;

    const metadataSpans = videoElement.querySelectorAll('span, yt-formatted-string, yt-attributed-string');
    for (const span of metadataSpans) {
      const age = findAgeInText(span.innerText || span.textContent);
      if (age) return age;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function findAgeInText(text) {
  if (!text) return null;
  const timeRegex = /(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i;
  const match = text.match(timeRegex);
  if (match) {
    return { ms: parseTimeToMs(match[0]), text: match[0] };
  }
  return null;
}

function parseTimeToMs(timeText) {
  if (!timeText) return 0;
  const match = timeText.toLowerCase().match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)?/);
  if (!match) return 0;
  
  const amount = parseInt(match[1], 10);
  let unit = match[2].trim();
  const unitMap = { '분': 'minute', '시간': 'hour', '일': 'day', '주': 'week', '달': 'month', '월': 'month', '년': 'year', '개월': 'month' };
  if (unitMap[unit]) unit = unitMap[unit];
  
  const unitToMs = {
    'minute': 60 * 1000, 'hour': 60 * 60 * 1000, 'day': 24 * 60 * 60 * 1000,
    'week': 7 * 24 * 60 * 60 * 1000, 'month': 30 * 24 * 60 * 60 * 1000, 'year': 365 * 24 * 60 * 60 * 1000
  };
  return amount * (unitToMs[unit] || 0);
}

function extractVideoTitle(videoElement) {
  try {
    const titleElem = videoElement.querySelector('#video-title, #video-title-link, .yt-lockup-metadata-view-model-wiz__title');
    if (titleElem) return titleElem.innerText || titleElem.textContent;
    const vmTitle = videoElement.querySelector('.ytAttributedStringHost');
    if (vmTitle) return vmTitle.innerText || vmTitle.textContent;
    return 'Unknown Title';
  } catch (e) { return 'Unknown Title'; }
}

/**
 * Main filtering logic
 */
function applyFilter() {
  if (!filterState.enabled) return;
  
  const selectors = [
    'ytd-rich-item-renderer', 
    'ytd-video-renderer', 
    'ytd-rich-grid-media', 
    'yt-lockup-view-model',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer'
  ];
  
  const videoElements = document.querySelectorAll(selectors.join(', '));
  
  videoElements.forEach((videoElement) => {
    // 1. Target the actual container if we're on a view-model
    let targetElement = videoElement;
    if (videoElement.tagName.toLowerCase() === 'yt-lockup-view-model') {
      targetElement = videoElement.closest('ytd-rich-item-renderer, ytd-video-renderer') || videoElement;
    }

    const videoId = getVideoId(targetElement);
    const lastSeenId = targetElement.dataset.youtubeSkipVideoId;

    // 2. If node is recycled (video ID changed), reset processing state
    if (videoId && lastSeenId && videoId !== lastSeenId) {
      targetElement.dataset.youtubeSkipProcessed = '';
      targetElement.style.display = '';
      targetElement.removeAttribute('hidden');
    }
    
    if (videoId) targetElement.dataset.youtubeSkipVideoId = videoId;

    // 3. Skip if already done for this specific video ID
    if (videoId && processedVideoIds.has(videoId)) {
      targetElement.style.setProperty('display', 'none', 'important');
      targetElement.setAttribute('hidden', '');
      return;
    }

    const state = targetElement.dataset.youtubeSkipProcessed;
    if (state === 'queued' || state === 'done' || state === 'checked') return;

    if (!state) {
      stats.detected++;
      targetElement.dataset.youtubeSkipProcessed = 'detected';
    }

    const ageData = extractUploadAge(targetElement);
    if (ageData !== null) {
      if (ageData.ms >= filterState.thresholdMs) {
        const title = extractVideoTitle(targetElement);
        markAsNotInterested(targetElement, { title: title.trim(), ageText: ageData.text }, videoId);
      } else {
        targetElement.dataset.youtubeSkipProcessed = 'checked';
      }
    }
  });
}

function initMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldReapply = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches?.('ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytd-rich-grid-row') || 
                node.querySelector?.('ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model')) {
              shouldReapply = true; break;
            }
          }
        }
      }
      if (shouldReapply) break;
    }
    if (shouldReapply) setTimeout(applyFilter, 200);
  });
  
  const target = document.querySelector('ytd-app') || document.body;
  observer.observe(target, { childList: true, subtree: true });
  
  window.addEventListener('scroll', () => {
    clearTimeout(window.scrollTimer);
    window.scrollTimer = setTimeout(applyFilter, 500);
  }, { passive: true });
  
  setInterval(applyFilter, 3000);
}

function injectMainScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyFilter') {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) {
        Object.assign(filterState, response);
        filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
        applyFilter();
      }
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'getStats') {
    sendResponse(stats);
    return false;
  }
});

function init() {
  injectMainScript();
  // Inject CSS to ensure hidden elements STAY hidden
  const style = document.createElement('style');
  style.textContent = `
    [data-youtube-skip-processed="done"], 
    [data-youtube-skip-processed="queued"],
    ytd-rich-item-renderer[hidden],
    ytd-video-renderer[hidden] { 
      display: none !important; 
    }
  `;
  document.head.appendChild(style);

  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      Object.assign(filterState, response);
      filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
      initMutationObserver();
      applyFilter();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
