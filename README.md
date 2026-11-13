# YouTube Feed Filter (유튜브 피드 필터)

Current extension version: **2.0.0**

Automatically mark YouTube recommendations as "Not interested" based on upload age or cumulative appearances on the home feed, then show the reason and video title in YouTube's hidden-video message.
업로드 날짜 또는 홈 피드의 누적 노출 횟수를 기준으로 추천 영상을 자동으로 "관심없음" 처리하고, YouTube의 숨김 안내 문구에 처리 사유와 제목을 표시합니다.

### 🛠 최신 개선 사항 (Recent Improvements)
| 개선 기능 | 상세 내용 |
| :--- | :--- |
| **반복 노출 영상 필터** | 홈에서 실제 화면에 보인 영상을 방문당 한 번 집계하고, 사용자가 설정한 누적 N회에 도달하면 관심 없음 처리. 중간 미노출이나 날짜 경과로 횟수를 초기화하지 않음 |
| **실행 제어 및 대상 검증** | 저장 설정과 로그인 확인 후 시작하며, 중단·페이지 이동 시 대기 작업을 취소하고 실행 직전 영상 ID와 최신 시간 기준을 다시 확인 |
| **설정 변경 즉시 반영** | 시간 기준 변경 시 미완료 카드를 재평가하고, Debug Logging 변경을 열린 탭에 즉시 반영 |
| **최신 추천 카드 지원** | 새 카드의 관심없음 명령과 YouTube 실행 경로를 지원하고, 제목 영역을 우선 읽어 재생 시간이 제목에 섞이지 않도록 표시 |
| <subSmall>**메뉴 간섭 방지**</subSmall> | <subSmall>카드 메뉴를 자동으로 열거나 닫지 않고 관심없음 명령을 실행하며, 사용자가 연 메뉴가 있으면 처리를 보류</subSmall> |
| <subSmall>**스크롤·포커스 보호**</subSmall> | <subSmall>명령의 동기 실행 중 화면 이동과 자동 처리된 숨김 결과의 뒤늦은 포커스·스크롤 요청을 차단. 사용자가 결과를 직접 조작하면 해당 결과의 보호를 해제하며 과거 위치로 되돌리지 않음</subSmall> |
| <subSmall>**처리 결과 확인**</subSmall> | <subSmall>대상 카드에 YouTube의 숨김 결과가 표시된 것을 확인한 뒤 Skipped 통계 반영</subSmall> |
| <subSmall>**페이지별 독립 처리**</subSmall> | <subSmall>홈(`/`)과 시청(`/watch`) 추천 영역의 DOM 탐색 및 변경 코드를 분리해 서로의 수정에 영향을 받지 않도록 구성</subSmall> |
| <subSmall>**페이지별 활성화 설정**</subSmall> | <subSmall>팝업에서 메인 페이지와 `/watch` 추천 필터를 각각 켜거나 끌 수 있도록 개선</subSmall> |
| <subSmall>**로그인 상태 안내**</subSmall> | <subSmall>YouTube 미로그인 상태에서는 자동 관심없음 필터링을 중단하고 로그인 필요 안내를 표시</subSmall> |
| <subSmall>**Watch 처리 안정화**</subSmall> | <subSmall>추천 목록 갱신 시 최신 카드 DOM을 다시 탐색하고, 페이지 전환 중인 이전 요청과 YouTube DOM 후처리 충돌을 방지</subSmall> |
| <subSmall>**성공 결과만 반영**</subSmall> | <subSmall>명령 호출만으로 성공 처리하지 않고 대상 카드의 숨김 결과를 확인</subSmall> |
| <subSmall>**숨김 사유 표시**</subSmall> | <subSmall>YouTube의 `동영상 숨김`·`Video removed`·`Video hidden` 결과 문구를 처리 사유와 영상 제목으로 변경</subSmall> |
| <subSmall>**콘솔 오류 노이즈 감소**</subSmall> | <subSmall>YouTube DOM에서 관심없음 액션을 찾지 못한 예상 실패는 Debug Logging이 켜진 경우에만 출력</subSmall> |
| <subSmall>**확장 아이콘 통계 배지**</subSmall> | <subSmall>확장 아이콘 배지에 Skipped 값만 표시</subSmall> |
| <subSmall>**간결한 팝업 UI**</subSmall> | <subSmall>Detected/Skipped 통계를 필터 설정 위로 이동하고 팝업을 세로 스크롤 없이 사용할 수 있도록 압축</subSmall> |

---

## 🌍 Language (언어)
- [English](#english)
- [한국어](#한국어)

---

## English

### 🚀 Key Features
- **Recommendation Cards Only**: Sponsored ad slots are excluded from upload-age filtering and home appearance counts.
- **Repeated Home Videos**: Enable the switch beside **Home appearances** and choose the count (default 3, integer ≥ 2). A card counts when at least half is visible in a visible home tab, including while scrolling. Each video counts once per home visit; missing visits and elapsed time never reset its total. The repeat rule defaults to OFF.
- **Flexible Time Thresholds**: Choose to filter videos older than 1 day, 2 days, 3 days, 4 days, 5 days, 1 week, 2 weeks, 1 month, 3 months, or 6 months.
- **Automated "Not Interested" Marking**: Submits "Not interested" without opening card menus. Cards that cannot be processed this way remain visible and do not increase Skipped.
- **Home and Watch Recommendations**: Supports both the home feed and the related-video list on `/watch`, using separate page-specific DOM adapters.
- **Independent Page Controls**: Enable or disable filtering separately for the YouTube main page and `/watch` recommendations from the extension popup.
- **Signed-in YouTube Only**: Filtering runs only when the current YouTube page is signed in, with popup and page notices when sign-in is required.
- **Stable Watch-Page Processing**: Reacquires recommendation cards after YouTube updates the DOM and checks the current page and video before each action.
- **Confirmed Results**: Only actions that produce YouTube's hidden-video result for the target card increment the skipped count. This confirms the page result, not server-side persistence.
- **Hidden Reason Message**: Replaces YouTube's `Video removed`, `Video hidden`, or `동영상 숨김` result text with `[upload age]` and the video title, preserving Undo and feedback controls. Prefers the title heading over accessibility labels that include playback duration.
- **Home Feed Refresh Reset**: Re-evaluates refreshed home-feed recommendations after in-page navigation.
- **Real-time Statistics**: View compact Detected and Skipped counters above the threshold control.
- **Icon Badge Counts**: Shows only the Skipped count on the extension icon.
- **YouTube Dark Theme Popup UI**: Manage settings from a token-based popup designed around YouTube dark surfaces, borders, text colors, and brand red accents.
- **Sequential Processing**: Processes feedback actions one at a time, including across runtime restarts. Filtering waits while a user menu is open and never closes it automatically.
- **Browsing Controls**: Blocks automatic focus and scroll-into-view requests from the extension's hidden results while focus is elsewhere. Direct pointer or keyboard interaction with a result releases its protection so its controls remain usable. Does not restore an earlier scroll position or focus after waiting for feedback.
- **Safe Settings Changes**: Waits for saved settings and sign-in before starting, re-evaluates unfinished cards when the threshold changes, and checks the video ID and latest threshold immediately before each action.
- **Locale Support**: Fully supports both English and Korean YouTube interfaces.
- **Debug Logging**: Toggle expected feedback diagnostics on/off via the popup UI for troubleshooting.

### 🛠 Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the `src` folder of this project.

### 📖 How to Use
1. Sign in to [YouTube](https://www.youtube.com/).
2. Click the extension icon in the toolbar.
3. Select your desired **Time Threshold** (default is 1 month).
4. Ensure **"Enable Filtering"** is turned on.
5. Turn **"Main Page"** and **"Watch Page"** filtering on or off independently.
6. Optionally enable **"Debug Logging"** to inspect feedback behavior in DevTools.
7. Confirm the Skipped counter increases only after recommendations are successfully marked as "Not interested" and the hidden-video message shows `[upload age]` plus the video title.

For repeated videos, enable the **Home appearances** switch under **Main Page**, then set its count. Counts are shared across tabs in the same Chrome profile and persist across browser restarts. A reload, a return to home, or a logo-driven home refresh starts a new visit; scrolling, switching tabs, and changing settings do not. Only appearances while the global, Main Page, and repeat switches are enabled and YouTube is signed in are recorded. Stored totals remain when filtering is paused or an action succeeds.

For N = 3, appearances on home visits 1, 2, and 4 trigger the action on visit 4 even if the video was absent on visit 3. Upload age and repeat rules are combined with OR, so an old video may be filtered before reaching N. A repeat result displays `[홈에서 누적 3회 노출]` and the title. Updating N re-evaluates already observed cards without adding an appearance. Counts are local to the Chrome profile, not separated by YouTube account, and are not synced to other devices.

The global **Enable Filtering** switch overrides both page-specific switches. Turning it off stops the active observer, cancels pending work and releases unfinished cards for the next activation. Page navigation also cancels pending work. Feedback already submitted to YouTube cannot be undone by cancellation.
When YouTube is signed out, filtering controls are paused and the extension shows a sign-in notice instead of attempting feedback actions.

### 📌 Available Thresholds
- 1 Day
- 2 Days
- 3 Days
- 4 Days
- 5 Days
- 1 Week
- 2 Weeks
- 1 Month
- 3 Months
- 6 Months

### 🔒 README Freshness Check
Enable the tracked Git hook once per local clone:

```bash
git config core.hooksPath .githooks
```

After that, `git push` is blocked when source, protocol, or spec files change without a committed `README.md` update.

---

## 한국어

### 🚀 주요 기능
- **일반 추천 카드만 처리**: 스폰서 광고 슬롯은 업로드 기간 필터와 홈 노출 횟수 집계에서 제외합니다.
- **반복 노출 영상 필터**: **Home appearances** 옆 토글을 켜고 누적 기준 N을 설정합니다(기본 3, 2 이상의 정수). 스크롤을 포함해 표시 중인 홈 탭에서 카드의 절반 이상이 보이면 방문당 한 번 집계합니다. 중간 미노출·시간 경과로 초기화하지 않으며, 반복 필터의 초기 상태는 OFF입니다.
- **유연한 시간 기준 설정**: 1일, 2일, 3일, 4일, 5일, 1주일, 2주일, 1개월, 3개월, 6개월 중 원하는 필터링 기준을 선택할 수 있습니다.
- **자동 "관심없음" 처리**: 카드 메뉴를 열지 않고 "관심없음"을 요청합니다. 이 방식으로 처리할 수 없는 카드는 그대로 남으며 Skipped에 포함하지 않습니다.
- **메인 및 시청 페이지 추천 지원**: 메인 피드와 `/watch` 우측 추천 목록을 지원하며, 페이지별 DOM 처리를 독립된 코드로 관리합니다.
- **페이지별 활성화 설정**: 확장 프로그램 팝업에서 메인 페이지와 `/watch` 추천 필터를 각각 켜거나 끌 수 있습니다.
- **YouTube 로그인 사용자 전용**: 현재 YouTube 페이지가 로그인 상태일 때만 필터링이 실행되며, 미로그인 상태에서는 팝업과 페이지에 안내를 표시합니다.
- **Watch 페이지 처리 안정화**: 유튜브가 추천 DOM을 갱신하면 최신 카드를 다시 탐색하며, 페이지 전환 중인 이전 요청과 YouTube의 추천 카드 DOM 후처리가 충돌하지 않도록 처리합니다.
- **성공 결과만 반영**: 대상 카드에 YouTube의 숨김 결과가 나타난 경우에만 Skipped 통계에 반영합니다. 페이지 결과를 확인하며 서버 저장 완료까지 보장하지는 않습니다.
- **숨김 사유 표시**: YouTube의 `동영상 숨김`·`Video removed`·`Video hidden` 결과 문구를 `[업로드 시점]`과 영상 제목으로 변경하고 실행취소·피드백 버튼을 유지합니다. 재생 시간이 포함된 접근성 안내보다 제목 영역을 우선 읽습니다.
- **홈 피드 갱신 재검사**: 유튜브 로고 클릭 등 페이지 내 이동으로 홈 피드가 갱신되면 새 추천 영상을 다시 검사합니다.
- **실시간 통계**: 시간 기준 설정 위에서 간결한 Detected 및 Skipped 통계를 확인할 수 있습니다.
- **아이콘 배지 통계**: 확장 프로그램 아이콘에 Skipped 값만 표시합니다.
- **유튜브 다크 테마 팝업 UI**: 유튜브 다크 테마의 배경, 표면, 테두리, 텍스트 색상, 브랜드 레드 포인트를 디자인 토큰으로 정의해 적용했습니다.
- **순차 처리**: 런타임 재시작 중에도 feedback 작업을 한 번에 하나씩 처리합니다. 사용자가 연 메뉴가 있으면 보류하며 메뉴를 자동으로 닫지 않습니다.
- **탐색 상태 유지**: 다른 영역에 포커스가 있으면 자동 처리된 숨김 결과가 포커스를 가져가거나 화면을 그 결과로 이동시키는 요청을 차단합니다. 사용자가 결과를 직접 클릭하거나 키보드로 접근하면 해당 결과의 보호를 해제합니다. 결과 대기 후 과거 스크롤 위치나 포커스를 복원하지 않습니다.
- **설정 변경 처리**: 저장 설정과 로그인을 확인한 뒤 시작하며, 시간 기준 변경 시 미완료 카드를 재평가하고 요청 직전 영상 ID와 최신 기준을 다시 확인합니다.
- **다국어 지원**: 유튜브의 영어 및 한국어 인터페이스를 완벽하게 지원합니다.
- **로그 제어**: 팝업 UI에서 예상 가능한 feedback 진단 로그 출력 여부를 간편하게 설정할 수 있습니다.

### 🛠 설치 방법
1. 이 저장소를 다운로드하거나 클론(Clone)합니다.
2. 크롬 브라우저를 열고 `chrome://extensions/` 주소로 이동합니다.
3. 우측 상단의 **"개발자 모드"**를 활성화합니다.
4. **"압축해제된 확장 프로그램을 로드합니다"** 버튼을 클릭하고, 이 프로젝트의 `src` 폴더를 선택합니다.

### 📖 사용 방법
1. [YouTube](https://www.youtube.com/)에 로그인합니다.
2. 툴바에서 확장 프로그램 아이콘을 클릭합니다.
3. 원하는 **Time Threshold(시간 기준)**를 선택합니다 (기본값: 1개월).
4. **"Enable Filtering"**이 켜져 있는지 확인합니다.
5. **"Main Page"**와 **"Watch Page"** 토글로 각 페이지의 필터를 독립적으로 설정합니다.
6. 필요하면 **"Debug Logging"**을 켜서 개발자 도구 콘솔 로그를 확인합니다.
7. 추천 영상이 성공적으로 "관심없음" 처리된 뒤에만 Skipped 통계가 증가하고, 숨김 안내 문구에 `[업로드 시점]`과 영상 제목이 표시되는지 확인합니다.

반복 영상은 **Main Page** 아래의 **Home appearances** 토글을 켜고 N을 설정합니다. 누적 횟수는 같은 Chrome 프로필의 탭들이 공유하며 브라우저 재시작 후에도 유지됩니다. 새로고침·다른 페이지에서 홈 복귀·로고를 통한 홈 갱신은 새 방문이고, 스크롤·탭 전환·설정 변경은 새 방문이 아닙니다. 전체·Main Page·반복 필터가 모두 켜지고 YouTube에 로그인한 동안의 노출만 기록하며, 필터 중단이나 관심 없음 처리 성공으로 누적값을 지우지 않습니다.

N이 3이면 1·2·4번째 방문에 노출된 영상은 3번째 방문에서 보이지 않았어도 4번째 방문에 처리합니다. 업로드 기간 조건과 반복 조건 중 하나를 만족하면 처리하므로 오래된 영상은 N회 이전에도 처리될 수 있습니다. 반복 사유는 `[홈에서 누적 3회 노출]`과 제목으로 표시합니다. N 변경은 현재 방문에서 노출된 카드를 재평가하며 횟수를 추가하지 않습니다. 이력은 Chrome 프로필 기준으로 저장되며 YouTube 계정별 분리나 기기 간 동기화는 지원하지 않습니다.

상위 **Enable Filtering**을 끄면 페이지별 설정과 관계없이 observer와 대기 작업을 취소하고 미완료 카드의 대기 표식을 해제합니다. 페이지 이동 시에도 대기 작업을 취소합니다. 이미 YouTube에 제출한 feedback은 취소로 되돌릴 수 없습니다.
YouTube 미로그인 상태에서는 feedback 작업을 시도하지 않고 로그인 안내를 표시합니다.

### 📌 선택 가능한 시간 기준
- 1일
- 2일
- 3일
- 4일
- 5일
- 1주일
- 2주일
- 1개월
- 3개월
- 6개월

### 🔒 README 최신화 검사
로컬 클론마다 한 번만 추적 가능한 Git 훅을 활성화합니다:

```bash
git config core.hooksPath .githooks
```

이후 `git push` 시 소스, 프로토콜, 스펙 파일이 바뀌었는데 커밋된 `README.md` 변경이 없으면 push가 중단됩니다.

---

## Verification

Node.js 22 or newer is sufficient; no package installation or extension build is required:

```bash
node tools/check-extension.cjs
node --test tests/automated/*.test.cjs
```

The regression tests cover initialization, settings changes, cancellation, recycled cards, feedback selection without menu clicks, synchronous focus/scroll protection, hidden-result confirmation, visible home exposures, cumulative storage, worker restarts, and popup controls using DOM fixtures. Run the browser scenarios in `tests/manual/` against English and Korean YouTube as well. GitHub Actions runs the checks for pushes, pull requests, and releases. Release tags must match the manifest version, for example `release-v2.0.0`.

Command discovery reads legacy renderer data and current view-model `rawProps.data` / `componentProps.data` values, including signal functions. When `resolveCommand` and `resolve` are unavailable, it uses `handleCommandWithCommandHandler` with the card's menu button as context, or the card itself if that button is absent. It does not click that button or open its menu.

During the synchronous YouTube command call, focus and scrolling methods are temporarily suppressed. After that call, a guard remains only for the actual hidden results of this extension's actions: it blocks programmatic `focus()` and `scrollIntoView()` while focus is outside that result. Trusted pointer, key, or focus interaction releases the guard for that automatic action. If YouTube reuses the same result element for a later automatic action, its protection is enabled again. Other controls retain native behavior. Later `window.scrollTo`/`scrollBy` calls and layout changes are outside this guard. Live command discovery and delayed YouTube behavior still require browser checks; passing fixtures alone does not verify them.

명령 탐색은 기존 렌더러 데이터와 새 view-model의 `rawProps.data` / `componentProps.data` 및 함수 형태의 값을 지원합니다. `resolveCommand`와 `resolve`가 없으면 `handleCommandWithCommandHandler`에 해당 카드의 메뉴 버튼(없으면 카드)을 문맥으로 전달합니다. 버튼 클릭이나 메뉴 열기는 수행하지 않습니다.

검증은 초기화·설정 변경·취소·DOM 재사용·메뉴 클릭 없는 명령 선택·동기 실행 중 포커스/스크롤 보호·숨김 결과 확인을 포함합니다. 명령 호출 후에는 확장의 자동 처리로 생긴 실제 숨김 결과에 한해, 포커스가 다른 곳에 있을 때 `focus()`·`scrollIntoView()`를 차단합니다. 사용자의 실제 포인터·키보드·포커스 진입은 해당 자동 처리에 대한 보호를 해제합니다. YouTube가 같은 결과 요소를 이후 다른 자동 처리에 재사용하면 보호를 다시 적용합니다. 다른 컨트롤은 원래대로 동작하며, 이후 `window.scrollTo`/`scrollBy` 호출과 레이아웃 변화는 이 보호 범위에 포함되지 않습니다. 실제 명령 탐색과 YouTube의 뒤늦은 동작은 `tests/manual/` 절차로 별도 확인해야 합니다.

CI also checks the PowerShell branch helpers. With PowerShell installed, run `pwsh -File tests/automated/feature-branch.test.ps1` locally.

## Promotional video tool

`tools/render_youtube_skip_intro.py` requires NumPy, Pillow, and FFmpeg on `PATH` (or `imageio_ffmpeg`). It searches common Korean system fonts on macOS, Windows, and Linux; use `--font /path/to/font.ttf` and optionally `--bold-font /path/to/bold.ttf` to specify fonts.

## 📄 License
This project is licensed under the MIT License.
