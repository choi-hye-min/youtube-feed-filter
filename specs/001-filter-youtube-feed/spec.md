# Feature Specification: filter-youtube-feed

**Feature Branch**: `001-filter-youtube-feed`  
**Created**: 2026-04-13  
**Status**: Draft  
**Input**: User description: "https://www.youtube.com/ 의 메인페이지에서 유저가 입력된 시간 예를들어 \"1개월\" 선택시 선택된 시간보다 늦게 생성된 유튜브 피드 영상은 \"관심없음\" 처리가 되도록 크롬확장프로그램을 만들고 싶어"

## Clarifications

### Session 2026-04-13

- Q: 새 피드 영상들을 어떻게 처리할까요? → A: Use YouTube's built-in "Not interested" action on newer feed videos.
- Q: YouTube “관심 없음” 버튼이 없으면 어떻게 처리할까요? → A: If unavailable, leave the item unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Time-Based Feed Filtering (Priority: P1)

A YouTube viewer on the main page wants to apply a time threshold so newer recommendations are marked as not interested.

**Why this priority**: This is the core user need and defines the extension's primary behavior.

**Independent Test**: User selects a time threshold and the extension evaluates visible feed videos to mark newer content as not interested.

**Acceptance Scenarios**:

1. **Given** the YouTube main page is open and a time window is selected, **when** the extension evaluates the feed, **then** every video uploaded more recently than the selected threshold is treated as not interested.
2. **Given** the user changes the time threshold, **when** the selection updates, **then** the feed is re-evaluated so the active filter reflects the new threshold.

---

### User Story 2 - Persistent Filter State (Priority: P2)

A returning user wants the selected time threshold to remain active while browsing the YouTube main page.

**Why this priority**: Preserving the filter state reduces repeated setup and makes the extension feel reliable.

**Independent Test**: The selected threshold remains available after a page refresh or navigation within the YouTube main page.

**Acceptance Scenarios**:

1. **Given** the user has selected a time threshold and refreshed the page, **when** the main page reloads, **then** the same threshold remains active and filtering continues.

---

### User Story 3 - Filter Control and Reversion (Priority: P3)

A user wants to disable the filter temporarily to restore the normal YouTube feed.

**Why this priority**: Users need a way to revert the filter without uninstalling the extension.

**Independent Test**: The user disables the filter and the extension stops marking newer videos as not interested.

**Acceptance Scenarios**:

1. **Given** the filter is active, **when** the user disables it, **then** newly loaded feed videos are no longer marked as not interested.

---

### Edge Cases

- What happens when a feed item does not display a recognizable upload age label?
- How does the extension behave if the YouTube feed loads videos dynamically after the initial page render?
- How is the filter applied to mixed content sections or promoted videos on the main page?
- What if a feed item does not expose YouTube's "Not interested" action in the current UI? If unavailable, the extension should leave that item unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST provide a visible time threshold control on the YouTube main page.
- **FR-002**: The extension MUST determine each feed video's upload age and compare it to the selected threshold.
- **FR-003**: Videos uploaded more recently than the selected threshold MUST be treated as not interested using YouTube's built-in "Not interested" action where available.
- **FR-004**: The extension MUST allow the user to disable or change the time filter at any time.
- **FR-005**: The extension MUST preserve the selected threshold across page refreshes while the browser session remains active.
- **FR-006**: If YouTube's built-in "Not interested" action is unavailable for a feed item, the extension MUST leave that item unchanged.

### Key Entities *(include if feature involves data)*

- **Video feed item**: A YouTube main page recommendation card with upload age and metadata.
- **Time threshold**: The user-selected age filter such as 1 month or 3 months.
- **Filter state**: The active setting that determines whether newer videos are marked not interested.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can apply a selected age threshold on the YouTube main page and see newer feed items marked not interested within the same browsing session.
- **SC-002**: At least 90% of visible videos uploaded more recently than the selected threshold are treated as not interested when the filter is active.
- **SC-003**: Users can change or disable the filter without needing to uninstall or reinstall the extension.
- **SC-004**: The selected threshold remains active after page refreshes on the YouTube main page.

## Assumptions

- The feature targets the YouTube main page feed only.
- The filter uses page-visible upload age information to decide which videos are newer than the selected threshold.
- The extension can preserve the selected threshold across page refreshes for the duration of the browser session.
- Marking a video as not interested is accepted as the appropriate outcome for removing newer recommended videos from the active feed.
