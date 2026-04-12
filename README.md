# YouTube Feed Filter (유튜브 피드 필터)

Automatically filter and hide old YouTube recommendations based on upload date to keep your feed fresh.
업로드 날짜를 기준으로 오래된 유튜브 추천 영상을 자동으로 필터링하고 숨겨서 피드를 항상 최신 상태로 유지합니다.

---

## 🌍 Language (언어)
- [English](#english)
- [한국어](#한국어)

---

## English

### 🚀 Key Features
- **Custom Time Thresholds**: Choose to filter videos older than 1 week, 2 weeks, 1 month, 3 months, or 6 months.
- **Automated "Not Interested" Marking**: Automatically clicks the "Not interested" menu for videos that exceed the time threshold.
- **DOM Cleanup**: Instantly removes "Video hidden" notification areas from the feed for a seamless browsing experience.
- **Real-time Statistics**: View the number of detected and skipped videos directly in the extension popup.
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
4. Ensure **"Enable Filter"** is checked.
5. Watch your feed refresh as old videos are automatically removed!

---

## 한국어

### 🚀 주요 기능
- **사용자 설정 시간 기준**: 1주일, 2주일, 1개월, 3개월, 6개월 중 필터링 기준을 선택할 수 있습니다.
- **자동 "관심없음" 처리**: 시간 기준을 초과한 오래된 영상의 "관심없음" 메뉴를 자동으로 클릭합니다.
- **DOM 즉시 제거**: "동영상 숨김" 알림 영역을 피드에서 즉시 삭제하여 깔끔한 화면을 유지합니다.
- **실시간 통계**: 팝업창에서 감지된 영상 수와 스킵된 영상 수를 실시간으로 확인할 수 있습니다.
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
4. **"Enable Filter"**가 체크되어 있는지 확인합니다.
5. 오래된 영상들이 자동으로 사라지며 피드가 새로고침되는 것을 확인하세요!

---

## 📄 License
This project is licensed under the MIT License.
