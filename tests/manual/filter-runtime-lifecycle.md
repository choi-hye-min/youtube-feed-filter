# Filter runtime lifecycle

Run on both the home feed and `/watch` recommendations, in English and Korean.
Use a test YouTube account: submitted feedback changes recommendations.

Record the extension and Chrome versions, locale, page type, and
pass/fail/not-observed result for each scenario. See the live run record below.
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
5. Repeat with Debug Logging off and on. Confirm delayed programmatic focus/scroll requests on the automatic hidden result cannot move focus away from the search field. Click or Tab into that result and confirm Undo remains usable. Record unrelated asynchronous window scrolling or layout movement separately.

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

## Live YouTube run — 2026-11-13

The user confirmed the installed unpacked extension reports 2.0.0 and enabled Debug
Logging. The signed-in Chrome session loaded the edited local scripts on page refresh.

Before the fix, Korean home produced 7 `missing_resolver` failures and no hidden
results; Korean watch produced 15 `missing_command` failures and no hidden results.
Live diagnostics identified signal-backed `rawProps.data()` on view-model cards and
`ytd-app.handleCommandWithCommandHandler(command, element)` as the available dispatcher.

After adding those paths, the Korean home run confirmed 27 hidden results in one
snapshot (additional cards were still queued). Korean watch confirmed 11 hidden
results and 9 retained cards, with no failed cards. YouTube supplied the hidden
result and Undo controls; the extension annotated its reason and title. A separate
title fix now prefers the heading's title over the accessible label with duration.

The user confirmed popup Skipped and the icon badge both showed 11 on the Korean
watch run, then disabled filtering. Both open page runtimes logged Stopped; a fresh
home load had no processed markers or hidden results. The user subsequently reloaded
the extension and set 6 Months, repeated home appearances ON at 2, and filtering ON.

English testing exposed two further bugs: the actual hidden label was `Video removed`
and therefore did not receive visible annotations, and asynchronous Undo focus moved
search focus to a button and scrolled from 0 to 3740.5 and then 5897. The final fix
recognizes that label and guards only automatic results' programmatic focus/scroll.
It also prefers the heading title, excluding playback duration.

| Final scenario | Observed evidence |
| --- | --- |
| English home repeated appearances | Actual results showed cumulative 2 and 3 appearances with the title and native Undo/Tell us why controls. |
| Successful filtering during scrolling/input | Hidden count increased from 5 to 7 while scrollY stayed 1168 and the search INPUT retained `filter focus test`. |
| Pointer and keyboard Undo | Clicking Undo restored its video. Tab moved from Undo to Tell us why; Shift+Tab returned to Undo; Enter restored another video. |
| User menu | A manually opened recommendation menu stayed open during scroll attempts. No new eligible action was observed during this interval; deterministic fixtures separately cover menu_busy and resume. |
| English home → watch | SPA logs stopped home and started watch. One 11-month-old recommendation was hidden; 19 remained checked under the 6-month threshold. The player's K shortcut still paused playback. |
| Korean watch after language restore | One 10-month-old recommendation was hidden with the exact title, reason and native controls; 19 remained checked. |
| Korean watch → home | Logo navigation stopped watch and started home. Repeat reasons (2 and 6 appearances) and a 6-year upload-age result displayed correctly; search focus remained INPUT at scrollY 0. |
| Sponsored cards | A repeated sponsored card initially failed missing_command. After the final extension reload, all 4 ad slots had no processed/video-ID markers. Two ordinary recommendations completed (repeat count 2 and upload age 6 months), with no failed cards or extension console errors. |

The YouTube display language was restored to Korean. The latest user-selected test
settings are 6 Months and repeat ON at 2. Debug Logging remains ON. Browser tooling
cannot open the installed extension popup because its URL scheme is blocked; popup
and badge values above were confirmed by the user, not inferred from DOM counts.

The automated suite additionally verifies all threshold presets, global/page settings,
login gates, debug toggles, visit deduplication and persistence, cancellation, target
recycling, failure handling, unrelated focus delegation and result reuse. Signed-out
and browser-restart behavior were covered by fixtures; no account sign-out or browser
restart was performed for the live run. Live observations are evidence for the tested
YouTube version, not a guarantee against future changes to its internal commands.
