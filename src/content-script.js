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

const THRESHOLD_LABELS = {
  '1day': '1 Day',
  '2days': '2 Days',
  '3days': '3 Days',
  '4days': '4 Days',
  '5days': '5 Days',
  '1week': '1 Week',
  '2weeks': '2 Weeks',
  '1month': '1 Month',
  '3months': '3 Months',
  '6months': '6 Months'
};

// Map to track processed video data (ID -> info)
const processedVideos = new Map();

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
  if (videoId) processedVideos.set(videoId, videoInfo);
  
  stats.skipped++;
  
  // Update badge
  chrome.runtime.sendMessage({ action: 'updateBadge', count: stats.skipped });
  
  actionQueue.push({ element: videoElement, videoInfo, id: videoId });
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
      const success = await performMarkAsNotInterested(item.element, item.videoInfo);
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
function renderNotInterestedPlaceholder(videoElement, videoInfo = null) {
  if (videoElement.dataset.youtubeSkipPlaceholder === 'true') return;

  const currentHeight = videoElement.offsetHeight;
  const placeholder = document.createElement('div');
  placeholder.className = 'youtube-skip-placeholder';
  placeholder.setAttribute('role', 'status');
  placeholder.setAttribute('aria-label', '관심없음 처리됨');

  const title = document.createElement('div');
  title.className = 'youtube-skip-placeholder-title';
  title.textContent = '관심없음';

  // Video Title element
  const videoTitle = document.createElement('div');
  videoTitle.className = 'youtube-skip-placeholder-video-title';
  videoTitle.textContent = videoInfo?.title || '알 수 없는 제목';

  const reason = document.createElement('div');
  reason.className = 'youtube-skip-placeholder-reason';
  const thresholdLabel = THRESHOLD_LABELS[filterState.threshold] || filterState.threshold;
  const ageText = videoInfo?.ageText || '기준 초과';
  reason.textContent = `업로드: ${ageText} / 기준: ${thresholdLabel} 이상`;

  placeholder.appendChild(title);
  placeholder.appendChild(videoTitle);
  placeholder.appendChild(reason);

  if (currentHeight > 0) {
    placeholder.style.minHeight = `${Math.max(currentHeight, 96)}px`;
  }

  videoElement.dataset.youtubeSkipPlaceholder = 'true';
  videoElement.replaceChildren(placeholder);
}

function performMarkAsNotInterested(videoElement, videoInfo) {
  return new Promise((resolve) => {
    const videoId = 'yt-skip-' + Math.random().toString(36).substr(2, 9);
    videoElement.dataset.youtubeSkipId = videoId;

    const timeout = setTimeout(() => {
      window.removeEventListener('youtube-skip-response', onResponse);
      debugLog('Response timeout for:', videoId);
      renderNotInterestedPlaceholder(videoElement, videoInfo);
      resolve(false);
    }, 5000);

    function onResponse(e) {
      if (e.detail.videoId === videoId) {
        clearTimeout(timeout);
        window.removeEventListener('youtube-skip-response', onResponse);
        debugLog(`Received response for ${videoId}: success=${e.detail.success}, method=${e.detail.method}`);
        renderNotInterestedPlaceholder(videoElement, videoInfo);
        resolve(e.detail.success);
      }
    }

    window.addEventListener('youtube-skip-response', onResponse);

    try {
      const event = new CustomEvent('youtube-skip-action', {
        detail: { videoId: videoId }
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error('[youtube_skip] Error bridging to internal command:', e);
      clearTimeout(timeout);
      window.removeEventListener('youtube-skip-response', onResponse);
      renderNotInterestedPlaceholder(videoElement, videoInfo);
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
    // 1. Try standard YouTube title IDs/Classes
    const titleSelectors = [
      '#video-title', 
      '#video-title-link', 
      '.yt-lockup-metadata-view-model-wiz__title',
      '#content-text',
      '.style-scope ytd-rich-grid-media #video-title'
    ];
    
    for (const sel of titleSelectors) {
      const el = videoElement.querySelector(sel);
      if (el && (el.innerText || el.textContent).trim()) {
        const found = (el.innerText || el.textContent).trim();
        debugLog('Title found via selector:', sel, found);
        return found;
      }
    }

    // 2. Try view-model specific strings (modern UI)
    const vmTitle = videoElement.querySelector('.ytAttributedStringHost, .yt-core-attributed-string');
    if (vmTitle && (vmTitle.innerText || vmTitle.textContent).trim()) {
      const found = (vmTitle.innerText || vmTitle.textContent).trim();
      debugLog('Title found via VM selector:', found);
      return found;
    }

    // 3. Try ARIA label
    const ariaLabel = videoElement.getAttribute('aria-label');
    if (ariaLabel) {
      const byIndex = ariaLabel.indexOf(' by ');
      const found = byIndex > 0 ? ariaLabel.substring(0, byIndex).trim() : ariaLabel.trim();
      debugLog('Title found via ARIA:', found);
      return found;
    }

    // 4. Try finding any anchor with a title attribute
    const titledAnchor = videoElement.querySelector('a[title]');
    if (titledAnchor && titledAnchor.getAttribute('title')) {
      const found = titledAnchor.getAttribute('title').trim();
      debugLog('Title found via Anchor title:', found);
      return found;
    }

    console.warn('[youtube_skip] Failed to extract title for element:', videoElement);
    return '알 수 없는 제목';
  } catch (e) { 
    console.error('[youtube_skip] Error extracting title:', e);
    return '알 수 없는 제목'; 
  }
}

/**
 * Main filtering logic
 */
function applyFilter() {
  if (!filterState.enabled) return;

  // Only run on the home page
  const path = window.location.pathname;
  if (path !== '/' && path !== '') {
    return;
  }
  
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
    }
    
    if (videoId) targetElement.dataset.youtubeSkipVideoId = videoId;

    // 3. Skip if already done for this specific video ID
    if (videoId && processedVideos.has(videoId)) {
      renderNotInterestedPlaceholder(targetElement, processedVideos.get(videoId));
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
  const style = document.createElement('style');
  style.textContent = `
    .youtube-skip-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      min-height: 96px;
      border-radius: 12px;
      background: rgba(15, 15, 15, 0.06);
      color: var(--yt-spec-text-secondary, #606060);
      font-family: Roboto, Arial, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-sizing: border-box;
      text-align: center;
    }

    .youtube-skip-placeholder-title {
      color: var(--yt-spec-text-primary, #0f0f0f);
      font-size: 15px;
      font-weight: 600;
    }

    .youtube-skip-placeholder-video-title {
      max-width: 90%;
      color: var(--yt-spec-text-primary, #0f0f0f);
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin: 2px 0;
    }

    .youtube-skip-placeholder-reason {
      max-width: 92%;
      color: var(--yt-spec-text-secondary, #606060);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    html[dark] .youtube-skip-placeholder,
    [dark] .youtube-skip-placeholder {
      background: rgba(255, 255, 255, 0.08);
      color: var(--yt-spec-text-secondary, #aaa);
    }

    html[dark] .youtube-skip-placeholder-title,
    [dark] .youtube-skip-placeholder-title,
    html[dark] .youtube-skip-placeholder-video-title,
    [dark] .youtube-skip-placeholder-video-title {
      color: var(--yt-spec-text-primary, #f1f1f1);
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
