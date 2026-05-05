/**
 * popup.js
 * 
 * Popup script for extension control. Reads threshold selection and filter state,
 * sends to background script for processing.
 */

document.addEventListener('DOMContentLoaded', () => {
  const thresholdSelect = document.getElementById('threshold-select');
  const enableFilter = document.getElementById('enable-filter');
  const enableLogging = document.getElementById('enable-logging');
  const statusDiv = document.getElementById('status');
  const detectedCountSpan = document.getElementById('detected-count');
  const skippedCountSpan = document.getElementById('skipped-count');
  const skippedList = document.getElementById('skipped-list');
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
  
  let lastVideoCount = -1;

  // Load saved state from storage
  chrome.storage.local.get(['filter_threshold', 'filter_enabled', 'logging_enabled'], (result) => {
    const savedThreshold = result.filter_threshold || '1month';
    const savedEnabled = result.filter_enabled !== false;
    const savedLogging = result.logging_enabled === true;
    
    // Restore UI state
    thresholdSelect.value = savedThreshold;
    enableFilter.checked = savedEnabled;
    enableLogging.checked = savedLogging;
    
    updateStatus(savedThreshold, savedEnabled);
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
            
            // Update skipped video list if count changed
            if (response.skipped !== lastVideoCount) {
              lastVideoCount = response.skipped;
              renderSkippedList(response.skippedVideos || []);
            }
          }
        });
      }
    });
  }

  function renderSkippedList(videos) {
    skippedList.innerHTML = '';
    
    if (videos.length === 0) {
      const emptyMsg = document.createElement('li');
      emptyMsg.className = 'skipped-item empty-state';
      emptyMsg.textContent = 'No videos skipped yet';
      skippedList.appendChild(emptyMsg);
      return;
    }

    videos.forEach(video => {
      const li = document.createElement('li');
      li.className = 'skipped-item';
      
      const title = document.createElement('div');
      title.className = 'skipped-title';
      title.title = video.title;
      title.textContent = video.title;
      
      const age = document.createElement('div');
      age.className = 'skipped-age';
      age.textContent = `Uploaded: ${video.ageText}`;
      
      li.appendChild(title);
      li.appendChild(age);
      skippedList.appendChild(li);
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
            updateStatus(selectedThreshold, enableFilter.checked);
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
            updateStatus(result.filter_threshold || '1month', enabled);
          });
        }
      });
    });
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
  
  function updateStatus(threshold, enabled) {
    statusDiv.classList.toggle('is-inactive', !enabled);

    if (!enabled) {
      statusDiv.textContent = 'Filter Inactive';
    } else {
      const thresholdLabel = thresholdLabels[threshold] || threshold;
      statusDiv.textContent = `Filtering ${thresholdLabel}+ content`;
    }
  }
});
