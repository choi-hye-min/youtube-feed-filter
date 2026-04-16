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
  skipped: 0
};

// Queue for sequential "Not interested" actions
let actionQueue = [];
let isProcessingQueue = false;

/**
 * Custom logger
 */
function debugLog(...args) {
  console.log('[youtube_skip]', ...args);
}

/**
 * Add a video to the action queue
 */
function queueNotInterested(videoElement) {
  if (videoElement.dataset.youtubeSkipProcessed === 'queued' || 
      videoElement.dataset.youtubeSkipProcessed === 'done') return;
  
  videoElement.dataset.youtubeSkipProcessed = 'queued';
  stats.skipped++;
  
  actionQueue.push(videoElement);
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
    const videoElement = actionQueue.shift();
    try {
      const success = await performMarkAsNotInterested(videoElement);
      if (success) {
        videoElement.dataset.youtubeSkipProcessed = 'done';
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
 * Actual implementation of marking as not interested by bridging to the MAIN world
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
      
      videoElement.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      videoElement.style.opacity = '0';
      videoElement.style.transform = 'scale(0.9)';
      
      setTimeout(() => {
        videoElement.remove();
        debugLog('Removed video element from DOM');
      }, 400);

      resolve(true);
    } catch (e) {
      console.error('[youtube_skip] Error bridging to internal command:', e);
      resolve(false);
    }
  });
}

/**
 * Trigger "Not interested" action on a video element
 */
function markAsNotInterested(videoElement) {
  queueNotInterested(videoElement);
  return true;
}

// Threshold value definitions (in milliseconds)
const THRESHOLD_PRESETS = {
  '1week': 7 * 24 * 60 * 60 * 1000,
  '2weeks': 14 * 24 * 60 * 60 * 1000,
  '1month': 30 * 24 * 60 * 60 * 1000,
  '3months': 90 * 24 * 60 * 60 * 1000,
  '6months': 180 * 24 * 60 * 60 * 1000
};

/**
 * Extract upload age
 */
function extractUploadAge(videoElement) {
  try {
    const allText = videoElement.innerText || videoElement.textContent || '';
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      if (/\d+\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i.test(line)) {
        return parseTimeToMs(line);
      }
    }
    
    const allElements = videoElement.querySelectorAll('*');
    for (const elem of allElements) {
      const ariaLabel = elem.getAttribute('aria-label') || '';
      if (/\d+\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i.test(ariaLabel)) {
        return parseTimeToMs(ariaLabel);
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function parseTimeToMs(timeText) {
  if (!timeText) return 0;
  const match = timeText.toLowerCase().match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)?/);
  if (!match) return 0;
  
  const amount = parseInt(match[1], 10);
  let unit = match[2].toLowerCase();
  
  const unitMap = { '분': 'minute', '시간': 'hour', '일': 'day', '주': 'week', '달': 'month', '월': 'month', '년': 'year', '개월': 'month' };
  if (unitMap[unit]) unit = unitMap[unit];
  
  const unitToMs = {
    'minute': 60 * 1000,
    'hour': 60 * 60 * 1000,
    'day': 24 * 60 * 60 * 1000,
    'week': 7 * 24 * 60 * 60 * 1000,
    'month': 30 * 24 * 60 * 60 * 1000,
    'year': 365 * 24 * 60 * 60 * 1000
  };
  return amount * (unitToMs[unit] || 0);
}

/**
 * Evaluate all visible feed videos
 */
function applyFilter() {
  console.log('[youtube_skip] applyFilter triggered. Enabled:', filterState.enabled);
  if (!filterState.enabled) return;
  
  const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer');
  console.log(`[youtube_skip] Found ${videoElements.length} video elements`);
  
  videoElements.forEach((videoElement, index) => {
    const state = videoElement.dataset.youtubeSkipProcessed;
    if (state === 'queued' || state === 'done' || state === 'checked') return;

    if (!state) {
      stats.detected++;
      videoElement.dataset.youtubeSkipProcessed = 'detected';
    }

    const uploadAge = extractUploadAge(videoElement);
    if (uploadAge !== null) {
      if (uploadAge >= filterState.thresholdMs) {
        debugLog(`Video ${index}: Marking as not interested (age: ${uploadAge}ms)`);
        markAsNotInterested(videoElement);
      } else {
        videoElement.dataset.youtubeSkipProcessed = 'checked';
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
          if (node.nodeType === 1 && (node.matches?.('ytd-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-row') || node.querySelector?.('ytd-video-renderer, ytd-rich-item-renderer'))) {
            shouldReapply = true; break;
          }
        }
      }
      if (shouldReapply) break;
    }
    if (shouldReapply) setTimeout(applyFilter, 200);
  });
  
  const target = document.querySelector('ytd-app') || document.body;
  observer.observe(target, { childList: true, subtree: true });
  console.log('[youtube_skip] MutationObserver started');

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
    console.log('[youtube_skip] inject.js injected');
  } catch (e) {
    console.error('[youtube_skip] Injection failed:', e);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyFilter') {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      Object.assign(filterState, response);
      filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
      applyFilter();
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'getStats') {
    sendResponse(stats);
    return false;
  }
});

function init() {
  console.log('[youtube_skip] Initializing...');
  injectMainScript();
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    console.log('[youtube_skip] State loaded:', response);
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
console.log('[youtube_skip] Content script loaded');
