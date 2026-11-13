# Filter runtime lifecycle

Run on both the home feed and `/watch` recommendations, in English and Korean.
Use a test YouTube account: submitted feedback changes recommendations.

Live YouTube verification for this change has not been performed. Record the extension and
Chrome versions, locale, page type, and pass/fail/not-observed result for each scenario.
DOM fixtures cover known command-data shapes; they do not establish that current live
YouTube exposes a usable command or resolver.

## Initialization and settings

1. Disable filtering, reload YouTube, and wait for recommendations to load. Confirm no automatic menus or feedback requests occur.
2. Enable filtering with a 1-month threshold. Find a recommendation between 1 week and 1 month old.
3. Change the threshold to 1 week. Confirm the existing card is re-evaluated without reloading.
4. While several cards are pending, change the threshold to 6 months. Confirm cards below that age are no longer submitted.
5. Toggle Debug Logging without changing any other setting. Confirm subsequent diagnostic messages follow the toggle.

## Cancellation and navigation

1. Disable filtering while feedback results or other cards are pending. Confirm no later command starts and no card menu opens. Already submitted feedback may still complete.
2. Re-enable filtering. Confirm unfinished cards can be processed and the page still scrolls and focuses normally.
3. Repeat while navigating home → watch, watch → another video, and through browser Back/Forward. Confirm no old-page command or result annotation continues on the destination page and no old scroll position is restored.
4. Refresh the home feed through the YouTube logo. Confirm new cards are checked.
5. Leave a recommendation menu open manually. Confirm filtering does not submit feedback, click items, close the menu, or send Escape. Close the menu and scroll to trigger another scan; confirm pending cards can resume.

## Scrolling, focus, and menus

1. With several eligible cards present, scroll continuously using the wheel or touchpad while filtering runs. Confirm the page does not jump back to a previous position after a result or failure.
2. Focus the YouTube search field and type while results are pending. Confirm focus remains where you placed it and typing is uninterrupted after each result or failure.
3. On `/watch`, focus the player and use its keyboard controls while recommendations are processed. Confirm filtering does not move focus to a recommendation or menu.
4. Open and close your own recommendation menu while cards are pending. Confirm no automatic menu appears and filtering does not close your menu or act on its items.
5. Repeat with Debug Logging off and on. Record any later YouTube-driven focus or layout movement separately: protection covers only the synchronous resolver call, not YouTube's asynchronous work or browser layout changes.

## Unavailable commands and failures

1. Enable Debug Logging. If `missing_command` or `missing_resolver` occurs, confirm the unsupported card remains visible, no automatic menu opens, and Skipped does not increase.
2. After a command error, `result_timeout`, or response `timeout`, scroll to trigger repeated scans. Confirm feedback is not resubmitted while the failed marker remains on the same card element for the same video, and Skipped does not increase without a confirmed result. Runtime restarts or replacement card elements may re-evaluate the video.
3. Confirm other supported cards can still be processed after a failure. If an unavailable-command or failure case cannot be observed on live YouTube, mark it not observed; the automated fixtures cover these cases deterministically.

## Results and counters

1. Confirm Skipped increases only after the target card shows YouTube's hidden result.
2. Confirm only that result receives its upload age and title; neighboring hidden cards and Undo controls remain intact.
3. Keep a live or scheduled card without an upload age visible for several scans. Confirm Detected does not increase repeatedly for that card.
4. Confirm no extension errors appear in the browser console.

The Node fixtures cover recycled DOM, no-op commands, synchronous focus/scroll protection,
and failure handling deterministically. This checklist checks actual YouTube command
availability, zero automatic menu openings, user scrolling/focus, and layout in all four
page/locale combinations. Passing fixtures alone does not complete live YouTube verification.

## Local Chrome fixture result — 2026-11-13

Google Chrome 156.0.8078.74, headless with isolated profiles: all six scenarios passed
for home/watch × Korean/English. The fixture loaded the actual `src/inject.js` with
a stubbed YouTube command resolver and exercised native DOM, focus, and scroll APIs:
synchronous movement suppression, user changes during the result wait, missing
commands, missing resolvers, an open user menu, and command rejection.
This does not verify the extension loader or signed-in live YouTube command availability.
