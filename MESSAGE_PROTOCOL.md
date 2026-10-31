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
  repeatEnabled: false,
  repeatThreshold: 3,
  loggingEnabled: false
}
```

`repeatThreshold` is a safe integer of at least 2. Missing or invalid saved values use 3; repeat filtering defaults to OFF. This response contains settings only, not the cumulative exposure history or per-video counts.

---

### 4. applyFilter
**From**: background.js  
**To**: content-script.js (all YouTube tabs)  
**Purpose**: Reload settings and re-evaluate the current page. A changed time threshold or repeat setting recreates the runtime and re-evaluates unfinished cards; disabling filtering cancels pending work. Unchanged settings retain the runtime. Runtime recreation preserves the current home visit and its already-recorded exposures, so settings changes do not increment exposure counts.

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

### 10. setRepeatFilter

**From**: popup.js

**To**: background.js

```javascript
{ action: 'setRepeatFilter', enabled: true, threshold: 3 }
// Success:
{ success: true }
// Failure:
{ success: false, error: 'invalid_settings' } // or 'storage_error'
```

Both fields are required: `enabled` must be a boolean and `threshold` must be a safe integer of at least 2. The background saves both settings together and broadcasts `applyFilter` only after a successful save. Updating N re-evaluates cards already exposed during the current home visit without counting them again. The latest settings are checked again before a queued action executes.

### 11. beginHomeVisit

**From**: content-shared.js (home runtime)

**To**: background.js

```javascript
{ action: 'beginHomeVisit', visitId: 'home-visit-uuid' }
// Success:
{ success: true, visitId: 'home-visit-uuid' }
// Failure:
{ success: false, error: 'invalid_request' } // or 'storage_error'
```

Registers the current visit for `sender.tab.id`, retaining `sender.documentId` when available. Registering the same visit and document again preserves its recorded videos. A different visit replaces the tab's previous visit record without resetting cumulative counts. The content script creates a new visit for initial home entry, reload, home navigation/refresh, or a restored page after `pagehide`; scrolling, tab visibility changes, DOM updates, and settings changes preserve the visit.

### 12. endHomeVisit

**From**: content-script.js (navigation or pagehide)

**To**: background.js

```javascript
{ action: 'endHomeVisit', visitId: 'home-visit-uuid' }
// Success:
{ success: true, visitId: 'home-visit-uuid' }
// Failure:
{ success: false, error: 'stale_visit' } // or 'invalid_request', 'storage_error'
```

Removes only the matching tab/document visit record. A delayed end request cannot close a newer visit. Cumulative video counts remain unchanged. Later exposure requests for the closed visit return `stale_visit`.

### 13. recordHomeExposure

**From**: content-shared.js (home runtime)

**To**: background.js

```javascript
{ action: 'recordHomeExposure', visitId: 'home-visit-uuid', videoId: 'youtube-video-id' }
// Success:
{ success: true, visitId: 'home-visit-uuid', count: 3 }
// Failure:
{ success: false, error: 'stale_visit' }
// Other errors: 'invalid_request', 'filter_disabled', 'storage_error'
```

The home adapter reports a card only while the document is visible and at least 50% of the card is inside the viewport, including after scrolling. Content-side recording requires signed-in state and enabled global, home, and repeat filters. Background recording independently checks the three switches, the tab/document visit identity, and a nonempty video ID containing only letters, digits, `_`, or `-`.

The content script sends registration before exposure records; it may send a record while the registration response is pending so a briefly visible card is still counted. The background serializes both operations in receipt order.

The first `(visitId, videoId)` record increments the shared cumulative count by 1. A duplicate request does not write or increment again and returns the current shared count, including increments from other tabs. No-response retries and service-worker restarts therefore preserve visit-level deduplication. Successful responses follow the combined count/visit storage write; storage errors never return an estimated count.

The runtime retains the returned count as that video's snapshot for the current visit and rejects responses for a closed visit. Other tabs' later increments are not broadcast into existing snapshots. The full history is not returned by `getState`; this message returns only the requested video's count. Cards that have never been visibly exposed during the current visit cannot qualify through the repeat condition.

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

Success (`method: 'api'` or `'ui'`) requires a new visible `.ytDismissibleItemReplacedContent` belonging to the target card or its replacement. The confirmed result receives `data-youtube-skip-result-id` with the request ID; only that result receives its reason and title. The reason is the upload age or `[홈에서 누적 N회 노출]` for repeat filtering. If both conditions qualify when the action executes, the repeat reason takes precedence. This confirms YouTube's page result, not server-side persistence. Failures include `cancelled`, `stale_page`, `stale_target`, `action_busy`, `menu_busy`, and `result_timeout`.

## Storage Keys

All extension state is stored in `chrome.storage.local`:

- **`filter_threshold`**: Current time threshold ('1day', '2days', '3days', '4days', '5days', '1week', '2weeks', '1month', '3months', '6months')
- **`filter_enabled`**: Boolean indicating if filter is active (true/false)
- **`home_filter_enabled`**: Boolean indicating if home feed filtering is active
- **`watch_filter_enabled`**: Boolean indicating if watch-page recommendation filtering is active
- **`repeat_filter_enabled`**: Boolean enabling cumulative home exposure filtering; defaults to `false`
- **`repeat_exposure_threshold`**: Minimum cumulative exposure count N; safe integer of at least 2, defaults to `3`
- **`logging_enabled`**: Boolean indicating if debug logging is active
- **`home_exposure_history`**: Cumulative video counts shared by tabs in the same Chrome profile, plus the active visit and recorded videos for each tab

```javascript
// home_exposure_history
{
  counts: { 'youtube-video-id': 3 },
  visits: {
    '123': {
      id: 'home-visit-uuid',
      documentId: 'chrome-document-id', // null if unavailable
      seen: ['youtube-video-id']
    }
  }
}
```

The background serializes exposure operations and saves `counts` and `visits` together under one storage key. Concurrent tabs cannot overwrite an increment, and an A-tab → B-tab → A-tab retry does not increment A twice. A worker restart reloads this persistent state. Tab removal clears only that tab's visit; browser startup clears `visits` while retaining `counts`.

Missing appearances, elapsed time, settings changes, and feedback success/failure do not reset or expire cumulative counts. There is no seven-day window. Storage failure leaves the last committed state intact and returns `storage_error`; counts are not silently evicted to free space.

---

## Error Handling

- If content script is not loaded on a tab, `chrome.tabs.sendMessage()` fails silently (wrapped in `.catch()`)
- If storage keys are missing, defaults are applied (1month, enabled=true, repeatEnabled=false, repeatThreshold=3)
- Filtering starts only after saved settings and the MAIN world script are loaded and YouTube is confirmed signed in
- If the YouTube page is signed out, content script stops the active runtime and shows a sign-in notice; unknown authentication pauses filtering without assuming sign-in
- Upload age extraction gracefully returns `null` if time text cannot be found on a video; a confirmed repeat count can still qualify that home card
- Repeat settings/exposure messages return `{ success: false, error }` for invalid input, a disabled repeat filter, a stale visit, or a storage failure as documented above. Failed storage does not count the video or acknowledge a successful save

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

### A home video reaches its cumulative exposure threshold

1. With global, home, and repeat filtering enabled and YouTube signed in, the runtime registers the home visit with `beginHomeVisit`.
2. A card becomes at least 50% visible in the foreground document, initially or through scrolling.
3. `recordHomeExposure` saves its first exposure for that visit and returns the cumulative count. Re-scans and re-scrolling in that visit do not increment it again.
4. The shared queue accepts a card when the upload-age condition OR the repeat count meets the current setting; satisfying both conditions creates one queued action.
5. The queue rechecks the video ID and latest settings before execution. A confirmed hidden result updates `Skipped` and displays the reason; exposure history is preserved.

For N=3, appearances on visits 1, 2, and 4 yield counts 1, 2, and 3. Absence on visit 3 leaves the count at 2. `/watch` uses its existing age filter and does not record home exposure counts.

---

## Debugging

Enable console logging in:
- **popup**: Open the popup, right-click it, then choose Inspect
- **background**: `chrome://extensions/` → YouTube Feed Filter → Service worker (Inspect)
- **content-script**: YouTube.com → F12 → Console (marked as "content-script")
