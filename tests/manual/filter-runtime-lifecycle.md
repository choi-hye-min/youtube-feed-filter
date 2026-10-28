# Filter runtime lifecycle

Run on both the home feed and `/watch` recommendations, in English and Korean.
Use a test YouTube account: submitted feedback changes recommendations.

## Initialization and settings

1. Disable filtering, reload YouTube, and wait for recommendations to load. Confirm no automatic menus or feedback requests occur.
2. Enable filtering with a 1-month threshold. Find a recommendation between 1 week and 1 month old.
3. Change the threshold to 1 week. Confirm the existing card is re-evaluated without reloading.
4. While several cards are pending, change the threshold to 6 months. Confirm cards below that age are no longer submitted.
5. Toggle Debug Logging without changing any other setting. Confirm subsequent diagnostic messages follow the toggle.

## Cancellation and navigation

1. Disable filtering while a card menu is opening. Confirm no later retry or pending menu click occurs. Already submitted feedback may still complete.
2. Re-enable filtering. Confirm unfinished cards can be processed and the page still scrolls and focuses normally.
3. Repeat while navigating home → watch, watch → another video, and through browser Back/Forward. Confirm no old-page menu action continues on the destination page.
4. Refresh the home feed through the YouTube logo. Confirm new cards are checked.
5. Leave a menu open manually. Confirm filtering does not click it, then close it and confirm pending cards can resume.

## Results and counters

1. Confirm Skipped increases only after the target card shows YouTube's hidden result.
2. Confirm only that result receives its upload age and title; neighboring hidden cards and Undo controls remain intact.
3. Keep a live or scheduled card without an upload age visible for several scans. Confirm Detected does not increase repeatedly for that card.
4. Confirm no extension errors appear in the browser console.

The Node fixtures cover recycled DOM and no-op commands deterministically. This checklist checks actual YouTube selectors, menu behavior, and layout, which fixtures cannot guarantee.
