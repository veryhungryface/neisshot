const dataInput = document.getElementById('dataInput');
const tableBody = document.getElementById('tableBody');
const rowCountDisplay = document.getElementById('rowCount');
const clearBtn = document.getElementById('clearBtn');

// 데이터 지우기 버튼
clearBtn.addEventListener('click', () => {
  dataInput.value = '';
  tableBody.innerHTML = '';
  rowCountDisplay.textContent = '0건';
  chrome.storage.local.remove('savedArray');
});

// [핵심] 붙여넣기 이벤트 감지 (엑셀 HTML 파싱)
dataInput.addEventListener('paste', (e) => {
  e.preventDefault();

  const clipboardData = e.clipboardData || window.clipboardData;
  const htmlData = clipboardData.getData('text/html');
  const textData = clipboardData.getData('text/plain');

  let finalData = [];

  if (htmlData) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    const rows = doc.querySelectorAll('tr');

    if (rows.length > 0) {
      rows.forEach(row => {
        // 각 셀(td/th)의 텍스트를 개별적으로 추출
        const cells = row.querySelectorAll('td, th');
        if (cells.length > 0) {
          // 셀들의 텍스트를 합침 (여러 열인 경우 탭으로 구분)
          const cellTexts = Array.from(cells).map(cell => {
            // textContent에서 줄바꿈을 공백으로 치환하고 연속 공백 정리
            return cell.textContent
              .replace(/[\r\n]+/g, ' ')  // 줄바꿈 → 공백
              .replace(/\s+/g, ' ')       // 연속 공백 → 단일 공백
              .trim();
          });
          const rowText = cellTexts.join('\t').trim();
          if (rowText) finalData.push(rowText);
        } else {
          // td/th가 없으면 행 전체 텍스트 (줄바꿈 제거)
          const rowText = row.textContent
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (rowText) finalData.push(rowText);
        }
      });
    } else {
      // HTML은 있지만 표가 아닌 경우
      finalData = textData.split('\n').filter(line => line.trim() !== '');
    }
  } else {
    finalData = textData.split('\n').filter(line => line.trim() !== '');
  }

  processAndSave(finalData);
  dataInput.value = finalData.join('\n----------------------------------------\n');
});

// 수동 입력을 위한 보조 이벤트
dataInput.addEventListener('input', (e) => {
  if (e.inputType === 'insertFromPaste') return;

  const lines = dataInput.value.split('\n').filter(line => line.trim() !== '' && !line.includes('---'));
  chrome.storage.local.set({ 'savedArray': lines });
  renderTable(lines);
});

// 공통 저장 및 렌더링 함수
function processAndSave(lines) {
  chrome.storage.local.set({ 'savedArray': lines });
  renderTable(lines);
}

// 표 렌더링 함수
function renderTable(lines) {
  tableBody.innerHTML = '';
  rowCountDisplay.innerText = `${lines.length}건`;

  lines.forEach((line, index) => {
    const tr = document.createElement('tr');

    const tdNum = document.createElement('td');
    tdNum.innerText = index + 1;
    tdNum.style.textAlign = 'center';
    tdNum.style.color = '#999';

    const tdContent = document.createElement('td');
    tdContent.innerText = line;
    tdContent.style.whiteSpace = 'pre-wrap';

    tr.appendChild(tdNum);
    tr.appendChild(tdContent);
    tableBody.appendChild(tr);
  });
}

// --- 나이스 입력 실행 함수 (Tab 방식) ---
async function injectData(tabCount) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // 추가 모드 확인
  const appendType = document.querySelector('input[name="appendType"]:checked')?.value || 'none';
  const customSeparator = document.getElementById('customSeparator')?.value || ', ';
  const appendConfig = { type: appendType, separator: customSeparator };

  // 딜레이 설정 - 5단계 속도 프리셋
  const speedPresets = {
    fastest: { tab: 30, afterTab: 40, focus: 10, blur: 30, next: 80 },
    fast: { tab: 50, afterTab: 60, focus: 20, blur: 50, next: 120 },
    normal: { tab: 80, afterTab: 100, focus: 30, blur: 80, next: 200 },
    slow: { tab: 120, afterTab: 150, focus: 50, blur: 120, next: 300 },
    slowest: { tab: 200, afterTab: 250, focus: 80, blur: 180, next: 400 }
  };

  const selectedSpeed = document.querySelector('input[name="speed"]:checked')?.value || 'normal';
  const delays = speedPresets[selectedSpeed];

  chrome.storage.local.get(['savedArray'], (res) => {
    const dataList = res.savedArray || [];
    if (dataList.length === 0) return alert("데이터가 없습니다.");

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async (list, tabsPerRow, appendCfg, delayConfig) => {
        const TABS_PER_ROW = tabsPerRow;
        const APPEND_CONFIG = appendCfg;
        const DELAYS = delayConfig;
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        let successCount = 0;

        // 활성화된 입력 요소 확인 (사용자가 클릭한 요소 우선!)
        console.log('🔄 활성화된 입력 요소 확인...');

        // 1. 먼저 현재 포커스된 요소 확인 (사용자가 실제로 클릭한 것)
        let activeInput = null;
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
          activeInput = document.activeElement;
          console.log('✅ activeElement에서 입력 요소 발견:', activeInput.tagName);
        }

        // 2. 없으면 :focus 셀렉터로 찾기
        if (!activeInput) {
          activeInput = document.querySelector('textarea.cl-text:focus') ||
            document.querySelector('input.cl-text:focus') ||
            document.querySelector('.cl-grid-row.cl-selected textarea.cl-text') ||
            document.querySelector('.cl-grid-row.cl-selected input.cl-text') ||
            document.querySelector('.cl-grid-row.cl-editing textarea.cl-text') ||
            document.querySelector('.cl-grid-row.cl-editing input.cl-text');
        }

        // 활성화된 입력 요소가 없으면 결과 반환
        if (!activeInput) {
          console.warn('⚠️ 활성화된 입력 요소 없음');
          return { success: false, error: 'NO_CURSOR' };
        }

        console.log('✅ 활성화된 입력 요소 발견! Tab 방식으로 입력 시작');

        // Tab 키 이벤트 헬퍼
        const pressTab = async (element) => {
          const tabDown = new KeyboardEvent('keydown', {
            key: 'Tab', code: 'Tab', keyCode: 9, which: 9,
            bubbles: true, cancelable: true
          });
          const tabUp = new KeyboardEvent('keyup', {
            key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true
          });
          element.dispatchEvent(tabDown);
          await wait(50);
          element.dispatchEvent(tabUp);
          await wait(100);
        };

        // 더블클릭 헬퍼
        const simulateDblClick = (element) => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            }));
          });
          element.dispatchEvent(new MouseEvent('dblclick', {
            bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, detail: 2
          }));
        };

        let currentInput = activeInput;

        for (let i = 0; i < list.length; i++) {
          const textData = list[i];

          // 첫 번째가 아니면 Tab으로 다음 행 이동
          if (i > 0) {
            console.log(`${i}번: Tab ${TABS_PER_ROW}회로 다음 행 이동...`);

            // 설정된 횟수만큼 Tab
            for (let t = 0; t < TABS_PER_ROW; t++) {
              await pressTab(document.activeElement || currentInput);
              await wait(DELAYS.tab);
            }
            await wait(DELAYS.afterTab);

            // 새로 활성화된 입력 요소 찾기 (textarea 또는 input)
            let newInput = document.querySelector('textarea.cl-text:focus') ||
              document.querySelector('input.cl-text:focus');
            if (!newInput && (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT')) {
              newInput = document.activeElement;
            }

            if (newInput) {
              currentInput = newInput;
              console.log(`${i}번: Tab으로 이동 성공!`);
            } else {
              // Tab 실패 시 직접 행 찾기
              console.log(`${i}번: Tab 실패, 직접 행 찾기...`);
              const nextRow = document.querySelector(`div[data-rowindex="${i}"]`);
              if (nextRow) {
                nextRow.scrollIntoView({ behavior: 'auto', block: 'center' });
                await wait(100);
                const nextCell = nextRow.querySelector(`div[data-cellindex="${TARGET_CELL_INDEX}"]`);
                if (nextCell) {
                  let textarea = nextCell.querySelector('textarea.cl-text');
                  if (!textarea) {
                    const clControl = nextCell.querySelector('.cl-control');
                    if (clControl) {
                      simulateDblClick(clControl);
                      await wait(300);
                      textarea = nextCell.querySelector('textarea.cl-text');
                    }
                  }
                  if (textarea) {
                    currentTextarea = textarea;
                  }
                }
              }
            }
          }

          // 현재 입력 요소에 입력 (textarea 또는 input)
          if (currentInput && (currentInput.tagName === 'TEXTAREA' || currentInput.tagName === 'INPUT')) {
            console.log(`${i}번: ${currentInput.tagName} 발견, 입력 시작...`);

            // 확실히 포커스
            currentInput.focus();
            await wait(DELAYS.focus);

            // APPEND_CONFIG에 따라 기존 텍스트 처리
            let finalText = textData;
            if (APPEND_CONFIG.type !== 'none') {
              const existingText = (currentInput.value || '').trim();
              if (existingText) {
                if (APPEND_CONFIG.type === 'newline') {
                  finalText = existingText + '\n' + textData;
                } else if (APPEND_CONFIG.type === 'custom') {
                  finalText = existingText + APPEND_CONFIG.separator + textData;
                }
                console.log(`${i}번: 기존 텍스트 뒤에 추가 (${APPEND_CONFIG.type})`);
              }
            } else {
              currentInput.select && currentInput.select();
            }

            currentInput.value = finalText;

            // 네이티브 setter (textarea와 input 모두 지원)
            const setter = currentInput.tagName === 'TEXTAREA'
              ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
              : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(currentInput, finalText);

            // 이벤트 발생
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            currentInput.dispatchEvent(new Event('change', { bubbles: true }));

            // blur 이벤트로 값 확정
            await wait(DELAYS.blur);
            currentInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

            successCount++;
            console.log(`✅ ${i}번 입력 완료: "${textData.substring(0, 20)}..."`);
          } else {
            console.warn(`⚠️ ${i}번: 입력 요소 없음, 스킵`);
          }

          // 다음 입력 전 대기 (값 확정 시간 부여)
          await wait(DELAYS.next);
        }

        return { success: true, total: list.length, count: successCount };
      },
      args: [dataList, tabCount, appendConfig, delays]
    }).then((results) => {
      // 모든 프레임의 결과 확인
      let hasSuccess = false;
      let totalCount = 0;
      let successCount = 0;
      let allNoCursor = true;

      if (results) {
        for (const r of results) {
          if (r.result) {
            if (r.result.success) {
              hasSuccess = true;
              totalCount = r.result.total;
              successCount += r.result.count;
              allNoCursor = false;
            } else if (r.result.error !== 'NO_CURSOR') {
              allNoCursor = false;
            }
          }
        }
      }

      if (hasSuccess) {
        alert(`${totalCount}명 중 ${successCount}건 입력 완료\n\n⚠️ 저장 버튼을 눌러 저장해주세요!`);
      } else if (allNoCursor) {
        alert(
          '⚠️ 커서가 활성화되지 않았습니다!\n\n' +
          '【사용 방법】\n' +
          '1. 나이스에서 입력을 시작할 첫 번째 칸을 클릭하세요\n' +
          '2. 커서가 깜빡이는 것을 확인하세요\n' +
          '3. 다시 "일괄 입력 실행" 버튼을 누르세요\n\n' +
          '※ 반드시 입력칸을 클릭한 상태에서 버튼을 눌러야 합니다.'
        );
      }
    }).catch((err) => {
      console.error('executeScript 오류:', err);
      alert('⚠️ 나이스 페이지에서 실행해주세요!');
    });
  });
}

// 버튼 이벤트 핸들러
document.getElementById('btnTab2').addEventListener('click', () => injectData(2));

document.getElementById('btnCustom').addEventListener('click', () => {
  const customTabCount = parseInt(document.getElementById('customTabCount').value, 10);
  injectData(customTabCount);
});

// --- 옵션 사이드바 ---
const optionsBtn = document.getElementById('optionsBtn');
const optionsSidebar = document.getElementById('optionsSidebar');
const optionsOverlay = document.getElementById('optionsOverlay');
const optionsClose = document.getElementById('optionsClose');

function openOptions() {
  optionsSidebar.classList.add('open');
  optionsOverlay.classList.add('open');
}

function closeOptions() {
  optionsSidebar.classList.remove('open');
  optionsOverlay.classList.remove('open');
}

optionsBtn.addEventListener('click', openOptions);
optionsClose.addEventListener('click', closeOptions);
optionsOverlay.addEventListener('click', closeOptions);

// 속도 선택 UI 로직
const speedOptions = document.querySelectorAll('.speed-option');
speedOptions.forEach(option => {
  option.addEventListener('click', () => {
    // 모든 선택 해제
    speedOptions.forEach(o => o.classList.remove('selected'));
    // 클릭된 것 선택
    option.classList.add('selected');
    option.querySelector('input[type="radio"]').checked = true;

    // 저장
    const speed = option.dataset.speed;
    chrome.storage.local.set({ speedSetting: speed });
  });
});

// 저장된 속도 설정 로드
chrome.storage.local.get(['speedSetting'], (res) => {
  const savedSpeed = res.speedSetting || 'normal';
  speedOptions.forEach(option => {
    if (option.dataset.speed === savedSpeed) {
      option.classList.add('selected');
      option.querySelector('input[type="radio"]').checked = true;
    } else {
      option.classList.remove('selected');
    }
  });
});