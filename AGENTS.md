# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Manifest V3 Chrome extension with no build step. Extension code lives in `src/`: `background.js` manages persisted state, `content-script.js` selects the active page adapter, `content-home.js` and `content-watch.js` handle page-specific DOM behavior, and `content-shared.js` contains shared filtering logic. Popup files are `popup.html`, `popup.js`, and `styles.css`; extension metadata is in `manifest.json`. Store artwork belongs in `assets/`. Use `tests/manual/` for repeatable manual test notes. `MESSAGE_PROTOCOL.md` documents communication between extension contexts.

## Build, Test, and Development Commands

There is no package manager or compilation step. For local development:

```powershell
git config core.hooksPath .githooks
```

Enables the tracked pre-push check, which requires a committed `README.md` update when source, protocol, or specification files change.

Load `src/` through `chrome://extensions/` using **Developer mode > Load unpacked**. After editing, click the extension's reload button and refresh the relevant YouTube tab. Release archives are built by GitHub Actions when a tag matching `release-*` is pushed, for example `release-v1.5.2`.

## Coding Style & Naming Conventions

Match the existing plain JavaScript style: two-space indentation, semicolons, single quotes, and camelCase identifiers. Use uppercase namespace-style globals only for shared browser objects such as `window.YouTubeSkipWatch`. Keep page-specific DOM selectors and behavior in their adapter file; place genuinely shared queue, state, or parsing logic in `content-shared.js`. Prefer small targeted changes because YouTube DOM behavior is fragile. CSS uses kebab-case class names.

## Testing Guidelines

No automated test framework or coverage threshold is configured. Manually verify both the YouTube home feed and `/watch` recommendations in English and Korean where relevant. Check filtering on/off states, thresholds, Detected/Skipped counts, placeholder content, navigation without a full reload, and browser console errors. Record reusable procedures under `tests/manual/`.

## Commit & Pull Request Guidelines

History mixes short imperative messages with Conventional Commits. Prefer scoped Conventional Commits such as `fix(watch): preserve skipped card placeholder` or `feat(popup): add page toggle`. Keep each commit focused. Pull requests should explain user-visible behavior, list manual verification steps, link related issues or specs, and include screenshots for popup or placeholder UI changes. Update `README.md` whenever behavior, settings, permissions, or message contracts change.
