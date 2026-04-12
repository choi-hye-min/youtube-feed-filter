# YouTube Feed Filter - Message Protocol Documentation

## Overview

Communication between extension components (popup, background script, content script) uses Chrome's `chrome.runtime.sendMessage()` API.

## Message Types

### 1. setThreshold
**From**: popup.js  
**To**: background.js  
**Purpose**: Update the time threshold filter value

```javascript
chrome.runtime.sendMessage({
  action: 'setThreshold',
  threshold: '1month' // '1week', '2weeks', '1month', '3months', '6months'
}, (response) => {
  console.log('Threshold updated:', response.success);
});
```

**Response**:
```javascript
{ success: true }
```

**Side Effects**: Background script broadcasts `applyFilter` message to all YouTube tabs

---

### 2. setFilterEnabled
**From**: popup.js  
**To**: background.js  
**Purpose**: Enable or disable the filter

```javascript
chrome.runtime.sendMessage({
  action: 'setFilterEnabled',
  enabled: true  // true to enable, false to disable
}, (response) => {
  console.log('Filter state updated:', response.success);
});
```

**Response**:
```javascript
{ success: true }
```

**Side Effects**: Background script broadcasts `applyFilter` message to all YouTube tabs

---

### 3. getState
**From**: popup.js, content-script.js  
**To**: background.js  
**Purpose**: Retrieve current filter state (threshold and enabled status)

```javascript
chrome.runtime.sendMessage({
  action: 'getState'
}, (response) => {
  console.log('Current threshold:', response.threshold);
  console.log('Filter enabled:', response.enabled);
});
```

**Response**:
```javascript
{
  threshold: '1month',
  enabled: true
}
```

---

### 4. applyFilter
**From**: background.js  
**To**: content-script.js (all YouTube tabs)  
**Purpose**: Re-evaluate visible feed videos with updated filter settings

```javascript
// Automatically broadcast by background.js when state changes
// Content script listens and responds:
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyFilter') {
    // Re-fetch state and evaluate feed
    sendResponse({ success: true });
  }
});
```

**Response**:
```javascript
{ success: true }
```

---

## Storage Keys

All extension state is stored in `chrome.storage.local`:

- **`filter_threshold`**: Current time threshold ('1week', '2weeks', '1month', '3months', '6months')
- **`filter_enabled`**: Boolean indicating if filter is active (true/false)

---

## Error Handling

- If content script is not loaded on a tab, `chrome.tabs.sendMessage()` fails silently (wrapped in `.catch()`)
- If storage keys are missing, defaults are applied (1month, enabled=true)
- Upload age extraction gracefully returns `null` if time text cannot be found on a video

---

## Flow Examples

### User selects a new threshold

1. User clicks dropdown in popup
2. `popup.js` sends `setThreshold` message to `background.js`
3. `background.js` stores new threshold in `chrome.storage.local`
4. `background.js` queries all YouTube tabs and sends `applyFilter` message
5. `content-script.js` receives `applyFilter`, fetches new threshold, evaluates feed
6. Newer videos are marked as not interested

### User disables filter

1. User unchecks enable toggle in popup
2. `popup.js` sends `setFilterEnabled` message to `background.js`
3. `background.js` stores `enabled: false` in `chrome.storage.local`
4. `background.js` broadcasts `applyFilter` message to all YouTube tabs
5. `content-script.js` checks `filterState.enabled` and skips filtering

---

## Debugging

Enable console logging in:
- **popup**: Browser DevTools → Extensions tab → YouTube Feed Filter → Inspect views: background page
- **background**: Same as above
- **content-script**: YouTube.com → F12 → Console (marked as "content-script")
