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

// Queue for sequential "Not interested" actions
let actionQueue = [];
let isProcessingQueue = false;

/**
 * Custom logger that respects loggingEnabled state
 */
function debugLog(...args) {
  if (filterState.loggingEnabled) {
    console.log('[youtube_skip]', ...args);
  }
}

/**
 * Add a video to the action queue
 */
function queueNotInterested(videoElement, videoInfo) {
  if (videoElement.dataset.youtubeSkipProcessed === 'queued' || 
      videoElement.dataset.youtubeSkipProcessed === 'done') return;
  
  videoElement.dataset.youtubeSkipProcessed = 'queued';
  stats.skipped++;
  
  // Save video info for popup UI (keep last 50)
  stats.skippedVideos.unshift(videoInfo);
  if (stats.skippedVideos.length > 50) {
    stats.skippedVideos.pop();
  }
  
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
      // Assign a temporary unique ID to find it in the MAIN world
      const videoId = 'yt-skip-' + Math.random().toString(36).substr(2, 9);
      videoElement.dataset.youtubeSkipId = videoId;

      // Dispatch event to the injected script in MAIN world
      const event = new CustomEvent('youtube-skip-action', {
        detail: { videoId: videoId }
      });
      window.dispatchEvent(event);
      
      // Smooth fade-out and remove
      videoElement.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      videoElement.style.opacity = '0';
      videoElement.style.transform = 'scale(0.9)';
      
      setTimeout(() => {
        if (videoElement.parentNode) {
          videoElement.remove();
        }
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
function markAsNotInterested(videoElement, videoInfo) {
  queueNotInterested(videoElement, videoInfo);
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

/**
 * Helper to find age pattern in a string and parse it
 */
function findAgeInText(text) {
  if (!text) return null;
  const timeRegex = /(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i;
  const match = text.match(timeRegex);
  if (match) {
    return {
      ms: parseTimeToMs(match[0]),
      text: match[0]
    };
  }
  return null;
}

function parseTimeToMs(timeText) {
  if (!timeText) return 0;
  const match = timeText.toLowerCase().match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)?/);
  if (!match) return 0;
  
  const amount = parseInt(match[1], 10);
  let unit = match[2].trim();
  
  const unitMap = { 
    '분': 'minute', 
    '시간': 'hour', 
    '일': 'day', 
    '주': 'week', 
    '달': 'month', 
    '월': 'month', 
    '년': 'year', 
    '개월': 'month' 
  };
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
 * Extract video title
 */
function extractVideoTitle(videoElement) {
  try {
    // Standard layout title
    const titleElem = videoElement.querySelector('#video-title, #video-title-link, .yt-lockup-metadata-view-model-wiz__title');
    if (titleElem) return titleElem.innerText || titleElem.textContent;

    // View model title
    const vmTitle = videoElement.querySelector('.ytAttributedStringHost');
    if (vmTitle) return vmTitle.innerText || vmTitle.textContent;

    return 'Unknown Title';
  } catch (e) {
    return 'Unknown Title';
  }
}

/**
 * Evaluate all visible feed videos and apply filter
 */
function applyFilter() {
  if (!filterState.enabled) return;
  
  const selectors = [
    'ytd-video-renderer', 
    'ytd-rich-item-renderer', 
    'ytd-rich-grid-media', 
    'yt-lockup-view-model',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer'
  ];
  
  const videoElements = document.querySelectorAll(selectors.join(', '));
  debugLog(`applyFilter triggered. Found ${videoElements.length} video elements`);
  
  videoElements.forEach((videoElement, index) => {
    const state = videoElement.dataset.youtubeSkipProcessed;
    if (state === 'queued' || state === 'done' || state === 'checked') return;

    if (!state) {
      stats.detected++;
      videoElement.dataset.youtubeSkipProcessed = 'detected';
    }

    const ageData = extractUploadAge(videoElement);
    if (ageData !== null) {
      if (ageData.ms >= filterState.thresholdMs) {
        const title = extractVideoTitle(videoElement);
        const videoInfo = {
          title: title.trim(),
          ageText: ageData.text
        };
        debugLog(`Video ${index}: Marking as not interested (age: ${ageData.text})`);
        markAsNotInterested(videoElement, videoInfo);
      } else {
        videoElement.dataset.youtubeSkipProcessed = 'checked';
      }
    }
  });
}

/**
 * DOM Mutation Observer to detect new feed items
 */
function initMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldReapply = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const isVideo = node.matches?.('ytd-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, yt-lockup-view-model, ytd-rich-grid-row');
            const containsVideo = node.querySelector?.('ytd-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, yt-lockup-view-model');
            
            if (isVideo || containsVideo) {
              shouldReapply = true;
              break;
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
  debugLog('MutationObserver started');

  window.addEventListener('scroll', () => {
    clearTimeout(window.scrollTimer);
    window.scrollTimer = setTimeout(applyFilter, 500);
  }, { passive: true });
  
  setInterval(applyFilter, 3000);
}

/**
 * Inject the helper script into the MAIN world
 */
function injectMainScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
    debugLog('inject.js injected');
  } catch (e) {
    console.error('[youtube_skip] Injection failed:', e);
  }
}

/**
 * Handle messages from background/popup script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyFilter') {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) {
        filterState.threshold = response.threshold;
        filterState.enabled = response.enabled;
        filterState.loggingEnabled = response.logging;
        filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
        applyFilter();
      }
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'getStats') {
    sendResponse(stats);
    return false;
  } else if (request.action === 'setLoggingEnabled') {
    filterState.loggingEnabled = request.enabled;
    debugLog('Logging state changed to:', request.enabled);
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Initialize on page load
 */
function init() {
  injectMainScript();
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      filterState.threshold = response.threshold;
      filterState.enabled = response.enabled;
      filterState.loggingEnabled = response.logging;
      filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
      
      debugLog('State loaded:', response);
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
