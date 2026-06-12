/**
 * popup.js
 * 
 * Popup script for extension control. Reads threshold selection and filter state,
 * sends to background script for processing.
 */

document.addEventListener('DOMContentLoaded', () => {
  const thresholdSelect = document.getElementById('threshold-select');
  const enableFilter = document.getElementById('enable-filter');
  const enableHomeFilter = document.getElementById('enable-home-filter');
  const enableWatchFilter = document.getElementById('enable-watch-filter');
  const pageToggleGroup = document.querySelector('.page-toggle-group');
  const enableLogging = document.getElementById('enable-logging');
  const statusDiv = document.getElementById('status');
  const detectedCountSpan = document.getElementById('detected-count');
  const skippedCountSpan = document.getElementById('skipped-count');
  const thresholdLabels = {
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
  
  // Load saved state from storage
  chrome.storage.local.get([
    'filter_threshold',
    'filter_enabled',
    'home_filter_enabled',
    'watch_filter_enabled',
    'logging_enabled'
  ], (result) => {
    const savedThreshold = result.filter_threshold || '1month';
    const savedEnabled = result.filter_enabled !== false;
    const savedHomeEnabled = result.home_filter_enabled !== false;
    const savedWatchEnabled = result.watch_filter_enabled !== false;
    const savedLogging = result.logging_enabled === true;
    
    // Restore UI state
    thresholdSelect.value = savedThreshold;
    enableFilter.checked = savedEnabled;
    enableHomeFilter.checked = savedHomeEnabled;
    enableWatchFilter.checked = savedWatchEnabled;
    enableLogging.checked = savedLogging;
    
    updateStatus(savedThreshold, savedEnabled, savedHomeEnabled, savedWatchEnabled);
    updatePageToggleAvailability(savedEnabled);
    updateStats();
  });

  // Periodically update stats while popup is open
  const statsInterval = setInterval(updateStats, 1000);
  
  // Cleanup interval when popup closes
  window.addEventListener('unload', () => {
    clearInterval(statsInterval);
  });

  function updateStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStats' }, (response) => {
          if (response) {
            detectedCountSpan.textContent = response.detected || 0;
            skippedCountSpan.textContent = response.skipped || 0;
          }
        });
      }
    });
  }
  
  // Threshold selection handler
  thresholdSelect.addEventListener('change', (e) => {
    const selectedThreshold = e.target.value;
    if (selectedThreshold) {
      chrome.storage.local.set({ filter_threshold: selectedThreshold }, () => {
        chrome.runtime.sendMessage({
          action: 'setThreshold',
          threshold: selectedThreshold
        }, (response) => {
          if (response && response.success) {
            updateStatus(selectedThreshold, enableFilter.checked, enableHomeFilter.checked, enableWatchFilter.checked);
          }
        });
      });
    }
  });
  
  // Filter toggle handler
  enableFilter.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ filter_enabled: enabled }, () => {
      chrome.runtime.sendMessage({
        action: 'setFilterEnabled',
        enabled: enabled
      }, (response) => {
        if (response && response.success) {
          chrome.storage.local.get(['filter_threshold'], (result) => {
            updateStatus(result.filter_threshold || '1month', enabled, enableHomeFilter.checked, enableWatchFilter.checked);
            updatePageToggleAvailability(enabled);
          });
        }
      });
    });
  });

  function handlePageToggle(page, enabled) {
    chrome.runtime.sendMessage({
      action: 'setPageFilterEnabled',
      page,
      enabled
    }, (response) => {
      if (response?.success) {
        chrome.storage.local.get(['filter_threshold'], (result) => {
          updateStatus(
            result.filter_threshold || '1month',
            enableFilter.checked,
            enableHomeFilter.checked,
            enableWatchFilter.checked
          );
        });
      }
    });
  }

  enableHomeFilter.addEventListener('change', (event) => {
    handlePageToggle('home', event.target.checked);
  });

  enableWatchFilter.addEventListener('change', (event) => {
    handlePageToggle('watch', event.target.checked);
  });

  // Logging toggle handler
  enableLogging.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ logging_enabled: enabled }, () => {
      chrome.runtime.sendMessage({
        action: 'setLoggingEnabled',
        enabled: enabled
      });
    });
  });
  
  function updatePageToggleAvailability(enabled) {
    pageToggleGroup.classList.toggle('is-disabled', !enabled);
    enableHomeFilter.disabled = !enabled;
    enableWatchFilter.disabled = !enabled;
  }

  function updateStatus(threshold, enabled, homeEnabled, watchEnabled) {
    const activePages = [homeEnabled && 'Main', watchEnabled && 'Watch'].filter(Boolean);
    const isActive = enabled && activePages.length > 0;
    statusDiv.classList.toggle('is-inactive', !isActive);

    if (!isActive) {
      statusDiv.textContent = 'Filter Inactive';
    } else {
      const thresholdLabel = thresholdLabels[threshold] || threshold;
      statusDiv.textContent = `${activePages.join(' + ')} · ${thresholdLabel}+`;
    }
  }
});
