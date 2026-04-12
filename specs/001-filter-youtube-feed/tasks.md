---

description: "Task list for filter-youtube-feed Chrome extension"

---

# Tasks: filter-youtube-feed

**Input**: Design documents from `/specs/001-filter-youtube-feed/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Manual browser validation tasks for each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Extension structure**: `src/`, `tests/manual/` at repository root
- Paths shown below follow the architecture from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and extension structure

- [x] T001 Create project directory structure with `src/`, `tests/manual/` folders
- [x] T002 [P] Create manifest.json with required permissions (tabs, storage, scripting)
- [x] T003 [P] Create stub files: content-script.js, background.js, popup.html, popup.js, styles.css in src/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core extension infrastructure that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement Chrome extension communication bridge between content-script and background.js
- [x] T005 [P] Implement browser local storage wrapper in background.js for threshold and enabled state
- [x] T006 [P] Implement DOM mutation observer in content-script.js to detect new feed items on YouTube main page
- [x] T007 Create utility function in content-script.js to extract upload age metadata from YouTube feed item DOM
- [x] T008 Implement extension enable/disable state management in background.js
- [x] T009 Create message passing protocol documentation (send threshold, request filtering, report status) in MESSAGE_PROTOCOL.md

---

## Phase 3: User Story 1 - Time-Based Feed Filtering (Priority: P1) 🎯 MVP

**Goal**: Core filtering functionality that evaluates feed videos against a time threshold and marks newer ones as not interested

**Independent Test**: User selects a time threshold (e.g., "1 month") on the YouTube main page, the extension evaluates visible feed videos and marks newer ones as not interested. Can be tested independently by loading YouTube and manually verifying feed reactions.

### Manual Validation for User Story 1

- [ ] T010 [US1] Manual test: Verify visible feed items are detected and upload ages parsed correctly in console
- [ ] T011 [US1] Manual test: Verify "Not interested" action is triggered when available for newer videos

### Implementation for User Story 1

- [x] T012 [P] [US1] Create popup.html with time threshold dropdown (1 week, 2 weeks, 1 month, 3 months, 6 months) in src/popup.html
- [x] T013 [P] [US1] Create popup.js to read threshold selection and send to background.js via message passing in src/popup.js
- [x] T014 [US1] Implement threshold comparison logic in background.js to determine which videos exceed threshold
- [x] T015 [US1] Implement "Not interested" action trigger in content-script.js (find button by DOM selector, simulate click)
- [x] T016 [US1] Implement fallback behavior in content-script.js: if "Not interested" button unavailable, skip that item without error (per FR-006)
- [x] T017 [US1] Add logging for filtering decisions (which videos marked, which skipped) in both scripts
- [x] T018 [US1] Integrate popup threshold selection → background → content-script filtering pipeline

**Checkpoint**: At this point, User Story 1 should be fully functional: user can select threshold and see newer videos marked as not interested

---

## Phase 4: User Story 2 - Persistent Filter State (Priority: P2)

**Goal**: Preserve the selected threshold across page refreshes so the user doesn't need to re-select it repeatedly

**Independent Test**: After selecting a time threshold and refreshing the YouTube main page, verify the same threshold is active and filtering continues. Can be tested by measuring if threshold persists in popup across refreshes.

### Manual Validation for User Story 2

- [ ] T019 [US2] Manual test: Select threshold, refresh YouTube main page, verify threshold is still selected in popup
- [ ] T020 [US2] Manual test: Verify filtering continues without interruption after refresh

### Implementation for User Story 2

- [ ] T021 [US2] Implement local storage persistence in background.js to save selected threshold
- [ ] T022 [US2] Implement local storage retrieval in popup.js on load to restore last selected threshold
- [ ] T023 [US2] Implement auto-apply logic: on YouTube main page load, restore threshold and re-evaluate visible feed
- [ ] T024 [US2] Add session-based expiry handling (persist for browser session, clear on extension disable)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work: threshold persists and filtering auto-resumes after page refresh

---

## Phase 5: User Story 3 - Filter Control and Reversion (Priority: P3)

**Goal**: Allow user to disable the filter temporarily to see the normal YouTube feed without uninstalling the extension

**Independent Test**: User enables the filter with a threshold, then disables it. Verify that newly loaded feed videos are no longer marked as not interested. Can be tested by checking that the disable toggle stops filter actions.

### Manual Validation for User Story 3

- [ ] T025 [US3] Manual test: Enable filter, disable filter, verify new feed items are not affected
- [ ] T026 [US3] Manual test: Verify disable state persists and re-enables correctly

### Implementation for User Story 3

- [ ] T027 [P] [US3] Add enable/disable toggle to popup.html in src/popup.html
- [ ] T028 [US3] Implement toggle state management in popup.js that sends enable/disable message to background.js
- [ ] T029 [US3] Implement filter bypass logic in content-script.js: check enabled state before applying filter
- [ ] T030 [US3] Persist enabled/disabled state in local storage
- [ ] T031 [US3] Sync enabled state across all content scripts when toggle changes

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and finalization across all user stories

- [ ] T032 [P] Manual end-to-end test: Complete workflow (select threshold → enable → refresh → disable → re-enable)
- [ ] T033 [P] Manual test: Multiple video types (standard recommendations, promoted content, mixed sections)
- [ ] T034 [P] Manual test: Edge cases (no upload age label, dynamic loading, slow connections)
- [ ] T035 Code cleanup: Remove debug logging and comments from src/content-script.js, src/background.js, src/popup.js
- [ ] T036 Documentation: Update README with installation, usage, and troubleshooting steps
- [ ] T037 Browser compatibility check: Verify manifest.json and APIs work on target Chrome version
- [ ] T038 Performance validation: Confirm DOM observation and filtering do not cause noticeable UI jank

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational
  - User Story 2 (P2): Can start after Foundational (independent of US1, but builds on same foundation)
  - User Story 3 (P3): Can start after Foundational (independent of US1/US2)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - no dependencies on other stories
- **User Story 2 (P2)**: Independent - no dependencies on US1, but builds on same foundation
- **User Story 3 (P3)**: Independent - no dependencies on US1/US2

### Within Each User Story

- Manual tests → Implementation tasks → Integration
- All tasks within a story can proceed after Foundational completion
- Stories can be developed in parallel by different team members

### Parallel Opportunities

- **Phase 1**: All T002, T003 can run in parallel (different files)
- **Phase 2**: T005, T006, T007, T008 marked [P] can run in parallel
- **Phase 3+**: Different user stories can be worked on in parallel
- **Within Phase 3**: T012, T013 marked [P] can run in parallel
- **Within Phase 5**: T027 marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Parallel opportunities in US1:
- T012 and T013 can run together (popup HTML and JS)
- After T013, T014 can run (no dependency blocking)
- T015 and T016 can run in parallel (both in content-script, different functions)
- T017 can follow T015/T016 integration
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Manual test User Story 1 independently
5. Deploy/demo if ready, then proceed to Phase 4 (US2) and Phase 5 (US3)

### Incremental Delivery

- **Increment 1**: US1 (core filtering) - Ship when working
- **Increment 2**: US2 (persistence) - Ship when ready
- **Increment 3**: US3 (toggle control) - Ship when ready or as part of final release
