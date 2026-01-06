// 확장 프로그램 아이콘을 클릭했을 때 사이드 패널이 열리도록 설정
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 설치 시 초기화 로직 (선택 사항)
chrome.runtime.onInstalled.addListener(() => {
  console.log("나이스샷이 설치되었습니다.");
});