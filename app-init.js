// INTEKPLUS ALARM Manager — app-init.js
// 1단계 수정: Auth 초기화 우선, 앱 초기화는 로그인 후 실행

// ══════════════════════════════════════
//  유틸리티 (app-auth.js에서 사용)
// ══════════════════════════════════════

// 비밀번호 표시 토글
function togglePwVisible(inputId, btn){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  if(inp.type === 'password'){
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

// 소속 구분 선택
function selectOrgType(btn){
  document.querySelectorAll('#reg-orgtype-group .org-type-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('reg-orgtype').value = btn.dataset.val;
}

// 모달 열기/닫기 (기존 closeModal과 통일)
function openModal(id){
  const el = document.getElementById(id);
  if(el) el.classList.add('open');
}

// ══════════════════════════════════════
//  로그인 후 버튼 표시 처리
// ══════════════════════════════════════
function showLoggedInButtons(){
  const ids = ['tb-username','logout-btn','chpw-btn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = '';
  });
  // Admin 전용 버튼
  if(currentUserProfile && currentUserProfile.role === 'admin'){
    const adminBtns = ['session-btn','backup-btn','vision-manage-btn'];
    adminBtns.forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = '';
    });
  }
  // 쓰기 가능한 경우 알람 추가 버튼 표시
  if(currentUserProfile && currentUserProfile.orgType !== 'customer'){
    const addBtn = document.querySelector('[onclick="openAddAlarmModal()"]');
    if(addBtn) addBtn.style.display = '';
  }
}

// ══════════════════════════════════════
//  Firebase 프로젝트 설정 입력 UI
// ══════════════════════════════════════
// Firebase SDK 초기화를 위해 apiKey와 projectId가 필요
// 기존 FB_URL에서 projectId를 추출하고, apiKey는 별도 입력받음

function getFirebaseConfig(){
  const savedUrl = FB_URL || localStorage.getItem('vam_fb_url') || '';
  const savedKey = localStorage.getItem('vam_fb_api_key') || '';
  return { url: savedUrl, apiKey: savedKey };
}

function initFirebaseSDK(){
  try{
    if(firebase.apps.length === 0){
      firebase.initializeApp({
        apiKey:      "AIzaSyCSdJtMPatu-zBAilrgSQ6aIIqElkG7IOk",
        authDomain:  "vision-alarm-manager.firebaseapp.com",
        databaseURL: "https://vision-alarm-manager-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId:   "vision-alarm-manager",
        storageBucket: "vision-alarm-manager.firebasestorage.app",
        messagingSenderId: "865410742273",
      });
      // FB_URL 자동 설정
      if(!localStorage.getItem('vam_fb_url')){
        localStorage.setItem('vam_fb_url',
          'https://vision-alarm-manager-default-rtdb.asia-southeast1.firebasedatabase.app');
      }
      // app-core.js의 FB_URL 변수도 업데이트
      if(typeof FB_URL !== 'undefined' && !FB_URL){
        FB_URL = 'https://vision-alarm-manager-default-rtdb.asia-southeast1.firebasedatabase.app';
      }
      console.log('[Firebase SDK] 초기화 완료: vision-alarm-manager');
    }
    return true;
  } catch(e){
    console.error('[Firebase SDK] 초기화 실패:', e);
    return false;
  }
}

// ══════════════════════════════════════
//  진입점 — Auth 우선 초기화
// ══════════════════════════════════════
(function bootstrap(){
  // Firebase SDK 초기화 시도
  const sdkReady = initFirebaseSDK();

  if(sdkReady){
    // Auth 초기화 → onAuthStateChanged에서 앱 진입 제어
    initAuth();
  } else {
    // FB_URL 미설정: Firebase 설정 화면 먼저 표시
    showAuthScreen('login');
    // 로그인 화면에서 Firebase 설정 안내
    setTimeout(()=>{
      const errEl = document.getElementById('auth-err-login');
      if(errEl){
        errEl.textContent = '⚙️ Firebase URL을 먼저 설정해주세요. 우측 상단 ⚙️ Firebase 버튼을 눌러 설정 후 새로고침하세요.';
        errEl.style.display = 'block';
      }
    }, 500);
  }
})();
