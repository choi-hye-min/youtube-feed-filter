# YouTube Feed Filter (유튜브 피드 필터)

Automatically mark old YouTube recommendations as "Not interested" based on upload date and replace the feed card with a visible reason.
업로드 날짜를 기준으로 오래된 유튜브 추천 영상을 자동으로 "관심없음" 처리하고, 해당 피드 카드에 처리 사유를 표시합니다.

---

## 🌍 Language (언어)
- [English](#english)
- [한국어](#한국어)

---

## English

### 🚀 Key Features
- **Flexible Time Thresholds**: Choose to filter videos older than 1 day, 2 days, 3 days, 4 days, 5 days, 1 week, 2 weeks, 1 month, 3 months, or 6 months.
- **Automated "Not Interested" Marking**: Automatically clicks the "Not interested" menu for videos that exceed the time threshold.
- **Visible Reason Placeholder**: Replaces processed feed cards with a "관심없음" placeholder and shows why the video was filtered, including upload age and the active threshold.
- **Real-time Statistics**: View the number of detected and skipped videos directly in the extension popup.
- **Liquid Glass Popup UI**: Manage settings from a redesigned popup with a glass-style dashboard, live status badge, and activity feed.
- **Performance Optimized**: Rapidly processes feed items with minimal delays (approx. 0.5s per video).
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
5. Optionally enable **"Debug Logging"** if you want to inspect extension behavior in DevTools.
6. Processed videos remain visible as a "관심없음" card with the upload age and threshold reason.

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

---

## 한국어

### 🚀 주요 기능
- **유연한 시간 기준 설정**: 1일, 2일, 3일, 4일, 5일, 1주일, 2주일, 1개월, 3개월, 6개월 중 원하는 필터링 기준을 선택할 수 있습니다.
- **자동 "관심없음" 처리**: 시간 기준을 초과한 오래된 영상의 "관심없음" 메뉴를 자동으로 클릭합니다.
- **처리 사유 표시**: 처리된 피드 카드를 삭제하지 않고 "관심없음" 영역으로 바꾼 뒤, 업로드 시점과 적용된 기준을 함께 표시합니다.
- **실시간 통계**: 팝업창에서 감지된 영상 수와 스킵된 영상 수를 실시간으로 확인할 수 있습니다.
- **리퀴드 글래스 팝업 UI**: 글래스 스타일 대시보드, 실시간 상태 배지, 최근 활동 목록으로 설정을 더 직관적으로 관리할 수 있습니다.
- **성능 최적화**: 영상당 약 0.5초 내외의 빠른 속도로 피드를 처리합니다.
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
5. 필요하면 **"Debug Logging"**을 켜서 개발자 도구 콘솔 로그를 확인합니다.
6. 처리된 영상 카드가 "관심없음" 영역으로 바뀌고, 업로드 시점과 기준 시간이 표시되는 것을 확인하세요.

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

---

## 📄 License
This project is licensed under the MIT License.
