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
  threshold: '1month' // See Storage Keys for all supported presets.
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
**Purpose**: Retrieve current filter settings

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
  enabled: true,
  homeEnabled: true,
  watchEnabled: true,
  loggingEnabled: false
}
```

---

### 4. applyFilter
**From**: background.js  
**To**: content-script.js (all YouTube tabs)  
**Purpose**: Reload settings and re-evaluate the current page. A changed threshold recreates the runtime and re-evaluates unfinished cards; disabling filtering cancels pending work. Unchanged settings retain the runtime.

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

### 5. getAuthState
**From**: popup.js  
**To**: content-script.js  
**Purpose**: Check whether the active YouTube tab is signed in before exposing filtering controls

```javascript
chrome.tabs.sendMessage(tab.id, {
  action: 'getAuthState'
}, (response) => {
  console.log('YouTube auth state:', response.authState);
});
```

**Response**:
```javascript
{ authState: 'signed-in' } // 'signed-in', 'signed-out', or 'unknown'
```

---

### 6. updateBadge
**From**: content-script.js  
**To**: background.js  
**Purpose**: Update the extension icon badge with the Skipped count

```javascript
chrome.runtime.sendMessage({
  action: 'updateBadge',
  detected: 12,
  skipped: 3
});
```

**Badge Text**:
```text
3
```

---

### 7. setPageFilterEnabled

**From**: popup.js

**To**: background.js

```javascript
{ action: 'setPageFilterEnabled', page: 'watch', enabled: false }
// page: 'home' or 'watch'
```

**Response**: `{ success: true }` after storage is updated. Broadcasts `applyFilter` to YouTube tabs.

### 8. setLoggingEnabled

**From**: popup.js

**To**: background.js

```javascript
{ action: 'setLoggingEnabled', enabled: true }
```

**Response**: `{ success: true }` after storage is updated. Broadcasts `applyFilter`, so existing runtimes reload `loggingEnabled` without reloading the page.

### 9. getStats

**From**: popup.js

**To**: content-script.js

```javascript
{ action: 'getStats' }
// Response:
{ detected: 12, skipped: 3 }
```

Counts accumulate for the current tab until a full page reload. Rechecking the same card and video ID, including while upload metadata is unavailable, does not increase `detected`. `skipped` increases only after the target card's hidden result is confirmed.

## MAIN World Events

Content and MAIN world scripts communicate through window `CustomEvent`s:

```javascript
// youtube-skip-action
{
  videoId: 'yt-skip-home-request-id', // Request ID, not the YouTube video ID
  targetVideoId: 'youtube-video-id',
  pageType: 'home', // 'home' or 'watch'
  pageUrl: 'https://www.youtube.com/',
  loggingEnabled: false
}

// youtube-skip-cancel
{ videoId: 'yt-skip-home-request-id' }

// youtube-skip-response
{ videoId: 'yt-skip-home-request-id', success: true, method: 'api' }
```

Only one MAIN world action may run at a time; overlapping requests return `action_busy`. The URL and target video ID are checked before execution and after asynchronous waits. Cancellation and page navigation stop pending waits and UI clicks and restore temporary focus/scroll overrides. An already submitted feedback request cannot be undone by cancellation.

Success (`method: 'api'` or `'ui'`) requires a new visible `.ytDismissibleItemReplacedContent` belonging to the target card or its replacement. The confirmed result receives `data-youtube-skip-result-id` with the request ID; only that result receives the upload-age/title text. This confirms YouTube's page result, not server-side persistence. Failures include `cancelled`, `stale_page`, `stale_target`, `action_busy`, `menu_busy`, and `result_timeout`.

## Storage Keys

All extension state is stored in `chrome.storage.local`:

- **`filter_threshold`**: Current time threshold ('1day', '2days', '3days', '4days', '5days', '1week', '2weeks', '1month', '3months', '6months')
- **`filter_enabled`**: Boolean indicating if filter is active (true/false)
- **`home_filter_enabled`**: Boolean indicating if home feed filtering is active
- **`watch_filter_enabled`**: Boolean indicating if watch-page recommendation filtering is active
- **`logging_enabled`**: Boolean indicating if debug logging is active

---

## Error Handling

- If content script is not loaded on a tab, `chrome.tabs.sendMessage()` fails silently (wrapped in `.catch()`)
- If storage keys are missing, defaults are applied (1month, enabled=true)
- Filtering starts only after saved settings and the MAIN world script are loaded and YouTube is confirmed signed in
- If the YouTube page is signed out, content script stops the active runtime and shows a sign-in notice; unknown authentication pauses filtering without assuming sign-in
- Upload age extraction gracefully returns `null` if time text cannot be found on a video

---

## Flow Examples

### User selects a new threshold

1. User clicks dropdown in popup
2. `popup.js` sends `setThreshold` message to `background.js`
3. `background.js` stores new threshold in `chrome.storage.local`
4. `background.js` queries all YouTube tabs and sends `applyFilter` message
5. `content-script.js` receives `applyFilter`, fetches new threshold, evaluates feed
6. Unfinished cards are re-evaluated; videos at least as old as the new threshold are queued

### User disables filter

1. User unchecks enable toggle in popup
2. `popup.js` sends `setFilterEnabled` message to `background.js`
3. `background.js` stores `enabled: false` in `chrome.storage.local`
4. `background.js` broadcasts `applyFilter` message to all YouTube tabs
5. `content-script.js` stops the runtime, cancels the pending action, and clears unfinished card markers

---

## Debugging

Enable console logging in:
- **popup**: Open the popup, right-click it, then choose Inspect
- **background**: `chrome://extensions/` → YouTube Feed Filter → Service worker (Inspect)
- **content-script**: YouTube.com → F12 → Console (marked as "content-script")
