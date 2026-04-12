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
  LOGGING: 'logging_enabled'
};

// Threshold value definitions (in milliseconds)
const THRESHOLD_PRESETS = {
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
  chrome.storage.local.get([STORAGE_KEYS.THRESHOLD, STORAGE_KEYS.ENABLED, STORAGE_KEYS.LOGGING], (result) => {
    if (!result[STORAGE_KEYS.THRESHOLD]) {
      chrome.storage.local.set({ [STORAGE_KEYS.THRESHOLD]: '1month' });
    }
    if (result[STORAGE_KEYS.ENABLED] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: true });
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
  if (request.action === 'setThreshold') {
    console.log('[youtube_skip] Background: Setting threshold to', request.threshold);
    chrome.storage.local.set({ [STORAGE_KEYS.THRESHOLD]: request.threshold }, () => {
      // Notify content scripts to re-evaluate
      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'applyFilter' }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'setFilterEnabled') {
    console.log('[youtube_skip] Background: Setting filter enabled to', request.enabled);
    chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: request.enabled }, () => {
      // Notify content scripts
      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'applyFilter' }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'setLoggingEnabled') {
    console.log('[youtube_skip] Background: Setting logging enabled to', request.enabled);
    chrome.storage.local.set({ [STORAGE_KEYS.LOGGING]: request.enabled }, () => {
      // Notify content scripts
      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'setLoggingEnabled', enabled: request.enabled }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true; // Asynchronous
  } else if (request.action === 'getState') {
    chrome.storage.local.get([STORAGE_KEYS.THRESHOLD, STORAGE_KEYS.ENABLED, STORAGE_KEYS.LOGGING], (result) => {
      const state = {
        threshold: result[STORAGE_KEYS.THRESHOLD] || '1month',
        enabled: result[STORAGE_KEYS.ENABLED] !== false,
        logging: result[STORAGE_KEYS.LOGGING] === true
      };
      console.log('[youtube_skip] Background: Sending state', state);
      sendResponse(state);
    });
    return true; // Will respond asynchronously
  }
});

console.log('[youtube_skip] Background script loaded');
