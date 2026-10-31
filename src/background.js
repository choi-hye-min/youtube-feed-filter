/**
 * background.js
 * 
 * Manages extension state, local storage, and communication between popup and content scripts.
 * Handles threshold selection, filter state, and message passing.
 */

// Storage keys
const STORAGE_KEYS = {
  THRESHOLD: 'filter_threshold',
  ENABLED: 'filter_enabled',
  HOME_ENABLED: 'home_filter_enabled',
  WATCH_ENABLED: 'watch_filter_enabled',
  REPEAT_ENABLED: 'repeat_filter_enabled',
  REPEAT_THRESHOLD: 'repeat_exposure_threshold',
  LOGGING: 'logging_enabled'
};

const STATE_STORAGE_KEYS = Object.values(STORAGE_KEYS);
const EXPOSURE_HISTORY_KEY = 'home_exposure_history';
let exposureOperations = Promise.resolve();

function isRepeatThreshold(value) {
  return Number.isSafeInteger(value) && value >= 2;
}

function readStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function writeStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function runExposureTask(operation, sendResponse) {
  const result = exposureOperations.then(operation);
  exposureOperations = result.catch(() => {});
  if (sendResponse) {
    result.then(sendResponse, () => sendResponse({ success: false, error: 'storage_error' }));
  }
  return true;
}

async function handleHomeExposure(request, sender) {
  const { visitId, videoId } = request;
  if (!Number.isInteger(sender.tab?.id) || typeof visitId !== 'string' || !visitId) {
    return { success: false, error: 'invalid_request' };
  }
  if (request.action === 'recordHomeExposure' &&
      (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(videoId))) {
    return { success: false, error: 'invalid_request' };
  }

  const stored = await readStorage([EXPOSURE_HISTORY_KEY, STORAGE_KEYS.ENABLED, STORAGE_KEYS.HOME_ENABLED, STORAGE_KEYS.REPEAT_ENABLED]);
  const history = stored[EXPOSURE_HISTORY_KEY] || { counts: {}, visits: {} };
  const tabId = String(sender.tab.id);
  const documentId = sender.documentId || null;
  const visit = history.visits[tabId];
  const sameVisit = visit?.id === visitId && visit.documentId === documentId;

  if (request.action === 'beginHomeVisit') {
    if (!sameVisit) {
      history.visits[tabId] = { id: visitId, documentId, seen: [] };
      await writeStorage({ [EXPOSURE_HISTORY_KEY]: history });
    }
    return { success: true, visitId };
  }

  if (!sameVisit) return { success: false, error: 'stale_visit' };
  if (request.action === 'endHomeVisit') {
    delete history.visits[tabId];
    await writeStorage({ [EXPOSURE_HISTORY_KEY]: history });
    return { success: true, visitId };
  }
  if (stored[STORAGE_KEYS.ENABLED] === false || stored[STORAGE_KEYS.HOME_ENABLED] === false ||
      stored[STORAGE_KEYS.REPEAT_ENABLED] !== true) {
    return { success: false, error: 'filter_disabled' };
  }

  let count = Object.hasOwn(history.counts, videoId) ? history.counts[videoId] : 0;
  if (!visit.seen.includes(videoId)) {
    count++;
    history.counts = { ...history.counts, [videoId]: count };
    visit.seen.push(videoId);
    await writeStorage({ [EXPOSURE_HISTORY_KEY]: history });
  }
  return { success: true, visitId, count };
}

function clearHomeVisits(tabId) {
  runExposureTask(async () => {
    const stored = await readStorage([EXPOSURE_HISTORY_KEY]);
    const history = stored[EXPOSURE_HISTORY_KEY];
    if (!history || (tabId !== undefined && !history.visits[String(tabId)])) return;
    if (tabId === undefined) history.visits = {};
    else delete history.visits[String(tabId)];
    await writeStorage({ [EXPOSURE_HISTORY_KEY]: history });
  });
}

chrome.tabs.onRemoved.addListener((tabId) => clearHomeVisits(tabId));
chrome.runtime.onStartup.addListener(() => clearHomeVisits());

function notifyYouTubeTabs() {
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'applyFilter' }).catch(() => {});
    });
  });
}

// Threshold value definitions (in milliseconds)
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
 * Initialize extension state from storage
 */
chrome.runtime.onInstalled.addListener(() => {
  // Set default state
  chrome.storage.local.get(STATE_STORAGE_KEYS, (result) => {
    if (!result[STORAGE_KEYS.THRESHOLD]) {
      chrome.storage.local.set({ [STORAGE_KEYS.THRESHOLD]: '1month' });
    }
    if (result[STORAGE_KEYS.ENABLED] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: true });
    }
    if (result[STORAGE_KEYS.HOME_ENABLED] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.HOME_ENABLED]: true });
    }
    if (result[STORAGE_KEYS.WATCH_ENABLED] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.WATCH_ENABLED]: true });
    }
    if (result[STORAGE_KEYS.REPEAT_ENABLED] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.REPEAT_ENABLED]: false });
    }
    if (result[STORAGE_KEYS.REPEAT_THRESHOLD] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.REPEAT_THRESHOLD]: 3 });
    }
    if (result[STORAGE_KEYS.LOGGING] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.LOGGING]: false });
    }
  });
  console.log('[youtube_skip] YouTube Feed Filter extension installed');
});

/**
 * Message listener: Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (['beginHomeVisit', 'endHomeVisit', 'recordHomeExposure'].includes(request.action)) {
    return runExposureTask(() => handleHomeExposure(request, sender), sendResponse);
  } else if (request.action === 'setRepeatFilter') {
    if (typeof request.enabled !== 'boolean' || !isRepeatThreshold(request.threshold)) {
      sendResponse({ success: false, error: 'invalid_settings' });
      return false;
    }
    return runExposureTask(async () => {
      await writeStorage({
        [STORAGE_KEYS.REPEAT_ENABLED]: request.enabled,
        [STORAGE_KEYS.REPEAT_THRESHOLD]: request.threshold
      });
      notifyYouTubeTabs();
      return { success: true };
    }, sendResponse);
  } else if (request.action === 'setThreshold') {
    console.log('[youtube_skip] Background: Setting threshold to', request.threshold);
    chrome.storage.local.set({ [STORAGE_KEYS.THRESHOLD]: request.threshold }, () => {
      // Notify content scripts to re-evaluate
      notifyYouTubeTabs();
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'setFilterEnabled') {
    console.log('[youtube_skip] Background: Setting filter enabled to', request.enabled);
    chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: request.enabled }, () => {
      // Notify content scripts
      notifyYouTubeTabs();
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'setPageFilterEnabled') {
    const storageKey = request.page === 'watch'
      ? STORAGE_KEYS.WATCH_ENABLED
      : STORAGE_KEYS.HOME_ENABLED;
    chrome.storage.local.set({ [storageKey]: request.enabled }, () => {
      notifyYouTubeTabs();
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'setLoggingEnabled') {
    console.log('[youtube_skip] Background: Setting logging enabled to', request.enabled);
    chrome.storage.local.set({ [STORAGE_KEYS.LOGGING]: request.enabled }, () => {
      // Notify content scripts
      notifyYouTubeTabs();
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'getState') {
    chrome.storage.local.get(STATE_STORAGE_KEYS, (result) => {
      const state = {
        threshold: result[STORAGE_KEYS.THRESHOLD] || '1month',
        enabled: result[STORAGE_KEYS.ENABLED] !== false,
        homeEnabled: result[STORAGE_KEYS.HOME_ENABLED] !== false,
        watchEnabled: result[STORAGE_KEYS.WATCH_ENABLED] !== false,
        repeatEnabled: result[STORAGE_KEYS.REPEAT_ENABLED] === true,
        repeatThreshold: isRepeatThreshold(result[STORAGE_KEYS.REPEAT_THRESHOLD]) ? result[STORAGE_KEYS.REPEAT_THRESHOLD] : 3,
        loggingEnabled: result[STORAGE_KEYS.LOGGING] === true
      };
      sendResponse(state);
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'updateBadge') {
    const skipped = Number.isFinite(request.skipped) ? request.skipped : 0;
    chrome.action.setBadgeText({
      text: `${skipped}`,
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#d93025',
      tabId: sender.tab.id
    });
    return false;
  }
});

console.log('[youtube_skip] Background script loaded');
