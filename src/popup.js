/**
 * popup.js
 * 
 * Popup script for extension control. Reads threshold selection and filter state,
 * sends to background script for processing.
 */

document.addEventListener('DOMContentLoaded', () => {
  const thresholdSelect = document.getElementById('threshold-select');
  const enableFilter = document.getElementById('enable-filter');
  const statusDiv = document.getElementById('status');
  
  console.log('[youtube_skip] Popup opened, loading state...');

  // Load saved state from storage
  chrome.storage.local.get(['filter_threshold', 'filter_enabled'], (result) => {
    const savedThreshold = result.filter_threshold || '1month';
    const savedEnabled = result.filter_enabled !== false;
    
    console.log('[youtube_skip] Loaded state:', { savedThreshold, savedEnabled });
    
    // Restore UI state
    thresholdSelect.value = savedThreshold;
    enableFilter.checked = savedEnabled;
    
    updateStatus(savedThreshold, savedEnabled);
  });
  
  // Threshold selection handler
  thresholdSelect.addEventListener('change', (e) => {
    const selectedThreshold = e.target.value;
    if (selectedThreshold) {
      console.log('[youtube_skip] Threshold changed to:', selectedThreshold);
      chrome.storage.local.set({ filter_threshold: selectedThreshold }, () => {
        chrome.runtime.sendMessage({
          action: 'setThreshold',
          threshold: selectedThreshold
        }, (response) => {
          if (response && response.success) {
            updateStatus(selectedThreshold, enableFilter.checked);
          }
        });
      });
    }
  });
  
  // Filter toggle handler
  enableFilter.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    console.log('[youtube_skip] Filter toggle changed to:', enabled);
    chrome.storage.local.set({ filter_enabled: enabled }, () => {
      chrome.runtime.sendMessage({
        action: 'setFilterEnabled',
        enabled: enabled
      }, (response) => {
        if (response && response.success) {
          chrome.storage.local.get(['filter_threshold'], (result) => {
            updateStatus(result.filter_threshold || '1month', enabled);
          });
        }
      });
    });
  });
  
  function updateStatus(threshold, enabled) {
    if (!enabled) {
      statusDiv.textContent = 'Status: Filter disabled';
      statusDiv.style.color = '#999';
    } else {
      statusDiv.textContent = `Status: Active (${threshold} filter)`;
      statusDiv.style.color = '#0d652d';
    }
  }
});

console.log('[youtube_skip] Popup script loaded');
