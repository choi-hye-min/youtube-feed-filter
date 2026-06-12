# YouTube Feed Filter (유튜브 피드 필터)

Current extension version: **1.5.0**

Automatically mark old YouTube home and watch-page recommendations as "Not interested" based on upload date and replace the recommendation card with a visible reason.
업로드 날짜를 기준으로 오래된 유튜브 메인 및 시청 페이지 추천 영상을 자동으로 "관심없음" 처리하고, 해당 추천 카드에 처리 사유를 표시합니다.

### 🛠 최신 개선 사항 (Recent Improvements)
| 개선 기능 | 상세 내용 |
| :--- | :--- |
| <subSmall>**최신 유튜브 UI 대응**</subSmall> | <subSmall>`yt-lockup-view-model` 등 최신 데이터 구조에서 "관심없음" 명령을 추적하도록 개선</subSmall> |
| <subSmall>**네트워크 안정성 확보**</subSmall> | <subSmall>API 호출 및 클릭 시뮬레이션 완료 후 UI를 교체하여 `v1/feedback` 요청 누락 방지</subSmall> |
| <subSmall>**페이지별 독립 처리**</subSmall> | <subSmall>홈(`/`)과 시청(`/watch`) 추천 영역의 DOM 탐색 및 변경 코드를 분리해 서로의 수정에 영향을 받지 않도록 구성</subSmall> |
| <subSmall>**페이지별 활성화 설정**</subSmall> | <subSmall>팝업에서 메인 페이지와 `/watch` 추천 필터를 각각 켜거나 끌 수 있도록 개선</subSmall> |
| <subSmall>**Watch 처리 안정화**</subSmall> | <subSmall>추천 목록 갱신 시 최신 카드 DOM을 다시 탐색하고, 메뉴 포커스로 인한 페이지 스크롤 이동을 방지</subSmall> |
| <subSmall>**성공 결과만 반영**</subSmall> | <subSmall>실제 `feedback` 처리가 성공한 영상만 Skipped 통계와 관심없음 플레이스홀더에 반영</subSmall> |
| <subSmall>**간결한 팝업 UI**</subSmall> | <subSmall>Detected/Skipped 통계를 필터 설정 위로 이동하고 팝업을 세로 스크롤 없이 사용할 수 있도록 압축</subSmall> |
| <subSmall>**상세 정보 표시**</subSmall> | <subSmall>플레이스홀더에 필터링된 영상의 **제목**을 추가하여 어떤 영상이 처리되었는지 명시</subSmall> |
| <subSmall>**데이터 보존 및 재사용**</subSmall> | <subSmall>스크롤 시 요소가 재사용되어도 영상 제목이 유실되지 않도록 데이터 관리 최적화</subSmall> |
| <subSmall>**다크 모드 최적화**</subSmall> | <subSmall>유튜브 다크 테마 환경에서도 제목과 텍스트가 잘 보이도록 색상 및 대비 조정</subSmall> |

---

## 🌍 Language (언어)
- [English](#english)
- [한국어](#한국어)

---

## English

### 🚀 Key Features
- **Flexible Time Thresholds**: Choose to filter videos older than 1 day, 2 days, 3 days, 4 days, 5 days, 1 week, 2 weeks, 1 month, 3 months, or 6 months.
- **Automated "Not Interested" Marking**: Automatically clicks the "Not interested" menu for videos that exceed the time threshold.
- **Home and Watch Recommendations**: Supports both the home feed and the related-video list on `/watch`, using separate page-specific DOM adapters.
- **Independent Page Controls**: Enable or disable filtering separately for the YouTube main page and `/watch` recommendations from the extension popup.
- **Stable Watch-Page Processing**: Reacquires recommendation cards after YouTube updates the DOM and prevents menu focus from moving the user's scroll position.
- **Success-based Results**: Only confirmed feedback actions increment the skipped count and replace a recommendation with a placeholder.
- **Visible Reason Placeholder**: Replaces processed feed cards with a "관심없음" placeholder and shows why the video was filtered, including upload age and the active threshold.
- **Real-time Statistics**: View compact Detected and Skipped counters above the threshold control.
- **YouTube Dark Theme Popup UI**: Manage settings from a token-based popup designed around YouTube dark surfaces, borders, text colors, and brand red accents.
- **Sequential Processing**: Processes feedback actions one at a time to avoid menu collisions and duplicate requests.
- **Locale Support**: Fully supports both English and Korean YouTube interfaces.
- **Debug Logging**: Toggle console logs on/off via the popup UI for troubleshooting.

### 🛠 Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the `src` folder of this project.

### 📖 How to Use
1. Open [YouTube](https://www.youtube.com/).
2. Click the extension icon in the toolbar.
3. Select your desired **Time Threshold** (default is 1 month).
4. Ensure **"Enable Filtering"** is turned on.
5. Turn **"Main Page"** and **"Watch Page"** filtering on or off independently.
6. Optionally enable **"Debug Logging"** to inspect feedback behavior in DevTools.
7. Confirmed recommendations remain visible as a "관심없음" card with the title, upload age, and active threshold.

The global **Enable Filtering** switch overrides both page-specific switches. Turning it off stops the active observer and pending queue for the current page.

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
- **유연한 시간 기준 설정**: 1일, 2일, 3일, 4일, 5일, 1주일, 2주일, 1개월, 3개월, 6개월 중 원하는 필터링 기준을 선택할 수 있습니다.
- **자동 "관심없음" 처리**: 시간 기준을 초과한 오래된 영상의 "관심없음" 메뉴를 자동으로 클릭합니다.
- **메인 및 시청 페이지 추천 지원**: 메인 피드와 `/watch` 우측 추천 목록을 지원하며, 페이지별 DOM 처리를 독립된 코드로 관리합니다.
- **페이지별 활성화 설정**: 확장 프로그램 팝업에서 메인 페이지와 `/watch` 추천 필터를 각각 켜거나 끌 수 있습니다.
- **Watch 페이지 처리 안정화**: 유튜브가 추천 DOM을 갱신하면 최신 카드를 다시 탐색하며, 메뉴 포커스로 인해 사용 중인 스크롤 위치가 이동하지 않도록 처리합니다.
- **성공 결과만 반영**: 실제 feedback 처리가 확인된 영상만 Skipped 통계와 관심없음 플레이스홀더에 반영합니다.
- **처리 사유 표시**: 처리된 피드 카드를 삭제하지 않고 "관심없음" 영역으로 바꾼 뒤, 업로드 시점과 적용된 기준을 함께 표시합니다.
- **실시간 통계**: 시간 기준 설정 위에서 간결한 Detected 및 Skipped 통계를 확인할 수 있습니다.
- **유튜브 다크 테마 팝업 UI**: 유튜브 다크 테마의 배경, 표면, 테두리, 텍스트 색상, 브랜드 레드 포인트를 디자인 토큰으로 정의해 적용했습니다.
- **순차 처리**: 메뉴 충돌과 중복 요청을 막기 위해 feedback 작업을 한 번에 하나씩 처리합니다.
- **다국어 지원**: 유튜브의 영어 및 한국어 인터페이스를 완벽하게 지원합니다.
- **로그 제어**: 팝업 UI에서 개발자 도구 콘솔 로그 출력 여부를 간편하게 설정할 수 있습니다.

### 🛠 설치 방법
1. 이 저장소를 다운로드하거나 클론(Clone)합니다.
2. 크롬 브라우저를 열고 `chrome://extensions/` 주소로 이동합니다.
3. 우측 상단의 **"개발자 모드"**를 활성화합니다.
4. **"압축해제된 확장 프로그램을 로드합니다"** 버튼을 클릭하고, 이 프로젝트의 `src` 폴더를 선택합니다.

### 📖 사용 방법
1. [YouTube](https://www.youtube.com/)에 접속합니다.
2. 툴바에서 확장 프로그램 아이콘을 클릭합니다.
3. 원하는 **Time Threshold(시간 기준)**를 선택합니다 (기본값: 1개월).
4. **"Enable Filtering"**이 켜져 있는지 확인합니다.
5. **"Main Page"**와 **"Watch Page"** 토글로 각 페이지의 필터를 독립적으로 설정합니다.
6. 필요하면 **"Debug Logging"**을 켜서 개발자 도구 콘솔 로그를 확인합니다.
7. 처리가 확인된 영상 카드가 "관심없음" 영역으로 바뀌고, 제목·업로드 시점·기준 시간이 표시되는 것을 확인합니다.

상위 **Enable Filtering**을 끄면 페이지별 설정과 관계없이 현재 페이지의 observer와 대기 중인 처리 큐가 중단됩니다.

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

## 📄 License
This project is licensed under the MIT License.
