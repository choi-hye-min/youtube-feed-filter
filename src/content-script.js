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
  thresholdMs: 30 * 24 * 60 * 60 * 1000 // 1 month default
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
  console.log(`[youtube_skip] Processing queue of ${actionQueue.length} videos`);
  
  while (actionQueue.length > 0) {
    const videoElement = actionQueue.shift();
    try {
      const success = await performMarkAsNotInterested(videoElement);
      if (success) {
        videoElement.dataset.youtubeSkipProcessed = 'done';
      }
      // Wait for UI to stabilize before next action
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error('[youtube_skip] Error in queue processing:', e);
    }
  }
  
  isProcessingQueue = false;
  console.log('[youtube_skip] Finished processing queue');
  
  // Scroll to top after completing all filter actions
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Actual implementation of marking as not interested
 */
function performMarkAsNotInterested(videoElement) {
  return new Promise((resolve) => {
    try {
      // Find the menu button (context menu trigger)
      let menuButton = videoElement.querySelector('button[aria-label*="menu"]') ||
                       videoElement.querySelector('button[aria-label*="More"]') ||
                       videoElement.querySelector('button[aria-label*="옵션"]') ||
                       videoElement.querySelector('button[aria-label*="추가 작업"]') ||
                       videoElement.querySelector('yt-icon-button[aria-label*="menu"]') ||
                       videoElement.querySelector('yt-icon-button[aria-label*="추가 작업"]') ||
                       videoElement.querySelector('#button[aria-haspopup="menu"]') ||
                       videoElement.querySelector('button[aria-haspopup="menu"]') ||
                       videoElement.querySelector('button[aria-haspopup="true"]');
      
      if (!menuButton) {
        const allButtons = videoElement.querySelectorAll('button, yt-icon-button');
        for (const btn of allButtons) {
          const ariaLabel = btn.getAttribute('aria-label') || '';
          const ariaHaspopup = btn.getAttribute('aria-haspopup') || '';
          if (ariaHaspopup === 'menu' || ariaHaspopup === 'true' || 
              ariaLabel.includes('menu') || ariaLabel.includes('옵션') || 
              ariaLabel.includes('More') || ariaLabel.includes('추가 작업')) {
            menuButton = btn;
            break;
          }
        }
      }
      
      if (!menuButton) {
        console.log('[youtube_skip] Menu button not found for video');
        return resolve(false);
      }
      
      menuButton.click();
      
      setTimeout(() => {
        try {
          const menuItems = document.querySelectorAll('yt-formatted-string, span, a, button');
          let notInterestedItem = null;
          
          for (const item of menuItems) {
            const text = item.textContent.trim().replace(/\s+/g, '');
            if (text === '관심없음' || text === 'Notinterested' || text.includes('Notinterested')) {
              notInterestedItem = item.closest('[role="option"], [role="menuitem"], yt-menu-service-item-renderer');
              if (!notInterestedItem) notInterestedItem = item.parentElement;
              break;
            }
          }
          
          if (notInterestedItem) {
            notInterestedItem.click();
            console.log('[youtube_skip] Marked video as not interested');
            resolve(true);
          } else {
            console.log('[youtube_skip] Not interested option not found in menu');
            resolve(false);
          }
        } catch (e) {
          console.error('[youtube_skip] Error clicking not interested:', e);
          resolve(false);
        }
      }, 500);
    } catch (e) {
      console.error('[youtube_skip] Error triggering not interested action:', e);
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
 * Extract upload age (in milliseconds) from a YouTube video recommendation card.
 * Looks for time text like "1 week ago", "3 days ago", "Uploaded 2 hours ago", etc.
 * Returns null if no upload age could be extracted.
 */
function extractUploadAge(videoElement) {
  try {
    let timeText = null;
    
    // Get all text content from the entire video element
    const allText = videoElement.innerText || videoElement.textContent || '';
    
    // Split by lines and look for time patterns
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    
    console.log('[youtube_skip] Video text lines:', lines.slice(0, 10)); // Debug: first 10 lines
    
    for (const line of lines) {
      // Match English patterns: "2 weeks ago", "1 day ago"
      // Match Korean patterns: "2주 전", "1일 전", "3년 전"
      if (/\d+\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i.test(line)) {
        timeText = line;
        console.log('[youtube_skip] Found time text in line:', timeText);
        break;
      }
    }
    
    if (!timeText) {
      // Fallback: check all elements recursively for aria-label with time info
      const allElements = videoElement.querySelectorAll('*');
      for (const elem of allElements) {
        const ariaLabel = elem.getAttribute('aria-label') || '';
        // Check for English or Korean time patterns
        if (/\d+\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i.test(ariaLabel)) {
          timeText = ariaLabel;
          console.log('[youtube_skip] Found time in aria-label:', timeText);
          break;
        }
      }
    }
    
    if (!timeText) {
      console.log('[youtube_skip] No time text found. Full element text sample:', allText.substring(0, 200));
      return null;
    }
    
    console.log('[youtube_skip] Extracted time text:', timeText);
    
    // Parse time text and convert to milliseconds
    const timeMs = parseTimeToMs(timeText);
    return timeMs;
  } catch (e) {
    console.error('[youtube_skip] Error extracting upload age:', e);
    return null;
  }
}

/**
 * Convert time strings like "2 days ago", "3 weeks ago" or Korean "2일 전", "3년 전" to milliseconds
 */
function parseTimeToMs(timeText) {
  if (!timeText) return 0;
  
  const text = timeText.toLowerCase().trim();
  
  // Extract number and unit using regex
  // Handles: "2 days ago", "1 week ago", "2일 전", "3년 전", etc.
  const match = text.match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)?/);
  
  if (!match) {
    console.log('[youtube_skip] Could not parse time text:', timeText);
    return 0;
  }
  
  const amount = parseInt(match[1], 10);
  let unit = match[2].toLowerCase();
  
  // Normalize Korean units to English equivalents
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
  
  // If unit is Korean, convert to English
  if (unitMap[unit]) {
    unit = unitMap[unit];
  }
  
  // Convert to milliseconds
  const unitToMs = {
    'minute': 60 * 1000,
    'hour': 60 * 60 * 1000,
    'day': 24 * 60 * 60 * 1000,
    'week': 7 * 24 * 60 * 60 * 1000,
    'month': 30 * 24 * 60 * 60 * 1000,
    'year': 365 * 24 * 60 * 60 * 1000
  };
  
  const timeMs = amount * (unitToMs[unit] || 0);
  console.log(`[youtube_skip] Parsed "${timeText}" as ${amount} ${unit} = ${timeMs}ms`);
  return timeMs;
}

/**
 * Evaluate all visible feed videos and apply filter
 */
function applyFilter() {
  if (!filterState.enabled) {
    console.log('[youtube_skip] Filter is disabled');
    return;
  }
  
  try {
    // Find all video recommendation cards on the main page
    const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer');
    
    console.log(`[youtube_skip] Evaluating ${videoElements.length} videos against threshold of ${filterState.threshold}`);
    
    videoElements.forEach((videoElement, index) => {
      // Track newly detected videos
      if (!videoElement.dataset.youtubeSkipProcessed) {
        stats.detected++;
        videoElement.dataset.youtubeSkipProcessed = 'detected';
      }

      const uploadAge = extractUploadAge(videoElement);
      
      if (uploadAge !== null && uploadAge >= filterState.thresholdMs) {
        // Video is older than or equal to threshold - mark as not interested
        console.log(`[youtube_skip] Video ${index}: ${uploadAge}ms old (matches/exceeds threshold)`);
        markAsNotInterested(videoElement);
      } else if (uploadAge !== null) {
        console.log(`[youtube_skip] Video ${index}: ${uploadAge}ms old (within threshold)`);
      } else {
        console.log(`[youtube_skip] Video ${index}: Could not determine age`);
      }
    });
  } catch (e) {
    console.error('[youtube_skip] Error applying filter:', e);
  }
}

/**
 * DOM Mutation Observer to detect new feed items
 */
function initMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldReapply = false;
    
    mutations.forEach((mutation) => {
      // Check if new video elements were added
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            if (node.matches && (node.matches('ytd-video-renderer') || node.matches('ytd-rich-item-renderer'))) {
              shouldReapply = true;
            } else if (node.querySelector && (node.querySelector('ytd-video-renderer') || node.querySelector('ytd-rich-item-renderer'))) {
              shouldReapply = true;
            }
          }
        });
      }
    });
    
    if (shouldReapply) {
      setTimeout(applyFilter, 100); // Debounce to avoid excessive evaluation
    }
  });
  
  // Start observing the feed container
  let feedContainer = document.querySelector('ytd-feed-renderer');
  
  // Debug: Log available ytd elements
  if (!feedContainer) {
    feedContainer = document.querySelector('ytd-browse-results-renderer') ||
                   document.querySelector('ytd-two-column-browse-results-renderer') ||
                   document.querySelector('#content') ||
                   document.querySelector('#primary') ||
                   document.querySelector('main');
  }
  
  if (feedContainer) {
    observer.observe(feedContainer, {
      childList: true,
      subtree: true,
      attributes: false
    });
    console.log('[youtube_skip] Mutation observer started on:', feedContainer.tagName);
  }
}

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyFilter') {
    // Re-fetch state and apply filter
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      filterState.threshold = response.threshold;
      filterState.enabled = response.enabled;
      filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
      applyFilter();
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'getStats') {
    sendResponse(stats);
    return false;
  }
});

/**
 * Initialize on page load
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Fetch current state from background
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      filterState.threshold = response.threshold;
      filterState.enabled = response.enabled;
      filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
      
      initMutationObserver();
      applyFilter();
    });
  });
} else {
  // Already loaded
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    filterState.threshold = response.threshold;
    filterState.enabled = response.enabled;
    filterState.thresholdMs = THRESHOLD_PRESETS[response.threshold];
    
    initMutationObserver();
    applyFilter();
  });
}

console.log('[youtube_skip] Content script loaded on', window.location.href);
