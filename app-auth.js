// INTEKPLUS ALARM Manager — app-auth.js
// 1단계: Firebase Authentication 기반 로그인/가입/세션 관리
// 로드 순서: app-core.js 이후, app-init.js 이전

// ══════════════════════════════════════
//  Firebase Auth SDK (compat 방식)
// ══════════════════════════════════════
// vision_alarm_manager.html 에서 Firebase SDK 스크립트 로드 후 사용

// ══════════════════════════════════════
//  전역 인증 상태
// ══════════════════════════════════════
let currentUser     = null;   // Firebase Auth 사용자 객체
let currentUserProfile = null; // DB의 사용자 프로필 {name,org,orgType,role,status,...}
let sessionTimer    = null;   // 세션 타임아웃 타이머
let sessionWarnTimer = null;  // 세션 경고 타이머
let lastActivityTs  = Date.now(); // 마지막 활동 시각

// 세션 설정 (분 단위, localStorage에 저장)
const SESSION_DEFAULT_MIN = 120; // 기본 2시간
function getSessionMin(){
  return parseInt(localStorage.getItem('vam_session_min') || SESSION_DEFAULT_MIN);
}
function setSessionMin(min){
  localStorage.setItem('vam_session_min', String(min));
}

// ══════════════════════════════════════
//  EmailJS 설정
// ══════════════════════════════════════
const EMAILJS_SERVICE_ID  = 'service_p8md6zd';
const EMAILJS_TEMPLATE_ID = 'template_x6qowo8';
const EMAILJS_PUBLIC_KEY  = 'sLxfXJSqzf_-t-Nt_';

// ══════════════════════════════════════
//  비밀번호 정책
// ══════════════════════════════════════
const PW_POLICY = {
  minLen:    8,
  hasLower:  /[a-zA-Z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
};

function checkPasswordPolicy(pw){
  return {
    minLen:    pw.length >= PW_POLICY.minLen,
    hasLower:  PW_POLICY.hasLower.test(pw),
    hasNumber: PW_POLICY.hasNumber.test(pw),
    hasSpecial: PW_POLICY.hasSpecial.test(pw)
  };
}

function isPwValid(pw){
  const r = checkPasswordPolicy(pw);
  return Object.values(r).every(Boolean);
}

// ══════════════════════════════════════
//  Firebase Auth 초기화
// ══════════════════════════════════════
let firebaseAuth = null;

function initAuth(){
  try{
    firebaseAuth = firebase.auth();
    console.log('[Auth] Firebase Auth 초기화 시작');

    // 인증 상태 변경 감지
    firebaseAuth.onAuthStateChanged(async (user) => {
      console.log('[Auth] onAuthStateChanged:', user ? user.uid : 'null');
      if(user){
        await onUserSignedIn(user);
      } else {
        onUserSignedOut();
      }
    });
  } catch(e){
    console.error('[Auth] Firebase Auth 초기화 실패:', e);
    showAuthScreen('login');
  }
}

// ══════════════════════════════════════
//  로그인 성공 처리
// ══════════════════════════════════════
async function onUserSignedIn(user){
  // 중복 호출 방지
  if(currentUserProfile) return;
  currentUser = user;
  console.log('[Auth] onUserSignedIn 시작:', user.uid);

  try{
    // Firebase Database SDK 준비 대기 (최대 3초)
    let db = null;
    for(let i = 0; i < 6; i++){
      try{
        db = firebase.database();
        if(db) break;
      } catch(e){}
      await new Promise(r => setTimeout(r, 500));
    }

    if(!db){
      console.error('[Auth] Database SDK 초기화 실패');
      showAuthError('login', 'DB 연결 실패. 페이지를 새로고침해 주세요.');
      return;
    }

    // 프로필 조회 (재시도 3회)
    let profile = null;
    for(let i = 0; i < 3; i++){
      try{
        const snap = await db.ref('users/' + user.uid).once('value');
        profile = snap.val();
        console.log('[Auth] 프로필 조회 시도', i+1, ':', profile ? '성공' : 'null');
        if(profile) break;
      } catch(e){
        console.warn('[Auth] 조회 시도', i+1, '실패:', e.message);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // 프로필 없음
    if(!profile || !profile.status){
      console.error('[Auth] 프로필 없음 — signOut');
      setAuthLoading(false);
      await firebaseAuth.signOut();
      showAuthError('login', '계정 정보를 찾을 수 없습니다. 관리자에게 문의하세요.');
      return;
    }

    // 상태별 처리
    if(profile.status === 'pending'){
      currentUser = null;
      setAuthLoading(false);
      await firebaseAuth.signOut();
      showPendingScreen(profile);
      return;
    }
    if(profile.status === 'rejected'){
      currentUser = null;
      setAuthLoading(false);
      await firebaseAuth.signOut();
      showAuthError('login', '가입이 거절된 계정입니다. 관리자에게 문의하세요.');
      return;
    }
    if(profile.status === 'suspended'){
      currentUser = null;
      setAuthLoading(false);
      await firebaseAuth.signOut();
      showAuthError('login', '정지된 계정입니다. 관리자에게 문의하세요.');
      return;
    }

    // 승인된 계정 — 앱 진입
    console.log('[Auth] 승인된 계정 진입:', profile.name, profile.role);
    currentUserProfile = profile;
    isAdmin = (profile.role === 'admin');

    // lastLogin 기록 (비동기, 실패해도 진입 가능)
    db.ref('users/' + user.uid + '/lastLogin')
      .set(new Date().toISOString())
      .catch(e => console.warn('[Auth] lastLogin 실패:', e));

    // 세션 타이머
    startSessionTimer();

    // UI 전환
    hideAuthScreen();
    setAuthLoading(false);
    updateTopbarUser();
    showLoggedInButtons();

    // Admin 전용 버튼 표시
    if(profile.role === 'admin'){
      const umBtn = document.getElementById('user-manage-btn');
      if(umBtn) umBtn.style.display = '';
      const sesBtn = document.getElementById('session-btn');
      if(sesBtn) sesBtn.style.display = '';
    }
    // Vision 필터 버튼 항상 표시
    const vpBtn = document.getElementById('vision-personal-btn');
    if(vpBtn) vpBtn.style.display = '';

    // Vision 개인화 필터 적용
    setTimeout(()=>applyVisionPersonalize(), 300);

    // 앱 초기화
    if(!appInitialized){
      await initApp();
    } else {
      applyUserPermissions();
    }

  } catch(e){
    console.error('[Auth] onUserSignedIn 오류:', e);
    setAuthLoading(false);
    showAuthError('login', '로그인 처리 중 오류: ' + e.message);
  }
}

// ══════════════════════════════════════
//  로그아웃 처리
// ══════════════════════════════════════
function onUserSignedOut(){
  currentUser        = null;
  currentUserProfile = null;
  isAdmin            = false;
  clearSessionTimer();
  showAuthScreen('login');
}

async function signOut(){
  if(!confirm('로그아웃 하시겠습니까?')) return;
  clearSessionTimer();
  await firebaseAuth.signOut();
}

// ══════════════════════════════════════
//  로그인
// ══════════════════════════════════════
async function doLogin(){
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-pw').value;
  if(!email || !pw){
    showAuthError('login', '이메일과 비밀번호를 입력하세요.');
    return;
  }
  setAuthLoading(true);
  try{
    const cred = await firebaseAuth.signInWithEmailAndPassword(email, pw);
    console.log('[Auth] 로그인 성공:', cred.user.uid);
    // onAuthStateChanged에서 처리 (직접 호출 제거 — 중복 방지)
  } catch(e){
    setAuthLoading(false);
    const msg = authErrMsg(e.code);
    showAuthError('login', msg);
  }
}

// ══════════════════════════════════════
//  가입신청
// ══════════════════════════════════════
async function doRegister(){
  const name    = document.getElementById('reg-name').value.trim();
  const org     = document.getElementById('reg-org').value.trim();
  const orgType = document.getElementById('reg-orgtype').value;
  const email   = document.getElementById('reg-email').value.trim();
  const pw      = document.getElementById('reg-pw').value;
  const pw2     = document.getElementById('reg-pw2').value;

  // 입력 검증
  if(!name || !org || !email || !pw || !pw2){
    showAuthError('register', '모든 필드를 입력하세요.');
    return;
  }
  if(!isPwValid(pw)){
    showAuthError('register', '비밀번호 정책을 확인하세요.');
    return;
  }
  if(pw !== pw2){
    showAuthError('register', '비밀번호가 일치하지 않습니다.');
    return;
  }

  setAuthLoading(true);
  try{
    // Firebase Auth 계정 생성
    const cred = await firebaseAuth.createUserWithEmailAndPassword(email, pw);
    const uid  = cred.user.uid;

    // DB에 프로필 저장 (pending 상태)
    const now = new Date().toISOString();
    const profile = {
      uid, name, org, orgType, email,
      role:         'member',
      status:       'pending',
      visibleVisions: ['ALL'],
      mustChangePw: false,
      createdAt:    now,
      approvedAt:   null,
      approvedBy:   null,
      lastLogin:    null
    };
    await fbSet('users/' + uid, profile);

    // 가입 즉시 로그아웃 (승인 전 접근 차단)
    await firebaseAuth.signOut();

    // Admin들에게 이메일 알림 발송
    await sendRegisterNotification(profile);

    // 승인 대기 화면 표시
    showPendingScreen(profile);
    setAuthLoading(false);

  } catch(e){
    setAuthLoading(false);
    const msg = authErrMsg(e.code);
    showAuthError('register', msg);
  }
}

// ══════════════════════════════════════
//  비밀번호 찾기
// ══════════════════════════════════════
async function doResetPassword(){
  const email = document.getElementById('reset-email').value.trim();
  if(!email){
    showAuthError('reset', '이메일을 입력하세요.');
    return;
  }
  setAuthLoading(true);
  try{
    await firebaseAuth.sendPasswordResetEmail(email);
    setAuthLoading(false);
    document.getElementById('auth-reset').style.display = 'none';
    document.getElementById('reset-success').style.display = 'block';
  } catch(e){
    setAuthLoading(false);
    showAuthError('reset', authErrMsg(e.code));
  }
}

// ══════════════════════════════════════
//  비밀번호 변경 (로그인 상태)
// ══════════════════════════════════════
async function doChangePassword(){
  const current = document.getElementById('chpw-current').value;
  const next    = document.getElementById('chpw-new').value;
  const next2   = document.getElementById('chpw-new2').value;

  if(!current || !next || !next2){
    showToast('모든 필드를 입력하세요.', 'err'); return;
  }
  if(!isPwValid(next)){
    showToast('새 비밀번호가 정책에 맞지 않습니다.', 'err'); return;
  }
  if(next !== next2){
    showToast('새 비밀번호가 일치하지 않습니다.', 'err'); return;
  }

  try{
    // 재인증 후 변경
    const credential = firebase.auth.EmailAuthProvider.credential(
      currentUser.email, current
    );
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.updatePassword(next);

    // mustChangePw 플래그 해제
    if(currentUserProfile && currentUserProfile.mustChangePw){
      await fbPatch('users/' + currentUser.uid, { mustChangePw: false });
      currentUserProfile.mustChangePw = false;
    }

    closeModal('chpw-mo');
    document.getElementById('chpw-current').value = '';
    document.getElementById('chpw-new').value     = '';
    document.getElementById('chpw-new2').value    = '';
    showToast('비밀번호가 변경되었습니다 ✅', 'ok');
  } catch(e){
    if(e.code === 'auth/wrong-password'){
      showToast('현재 비밀번호가 올바르지 않습니다.', 'err');
    } else {
      showToast('비밀번호 변경 실패: ' + e.message, 'err');
    }
  }
}

// ══════════════════════════════════════
//  세션 타임아웃
// ══════════════════════════════════════
function startSessionTimer(){
  clearSessionTimer();
  lastActivityTs = Date.now();

  // 활동 감지 이벤트
  ['click','keydown','mousemove','touchstart'].forEach(ev=>{
    document.addEventListener(ev, resetSessionTimer, { passive:true });
  });

  scheduleSessionCheck();
}

function scheduleSessionCheck(){
  const ms = getSessionMin() * 60 * 1000;
  const warnMs = ms - 2 * 60 * 1000; // 만료 2분 전 경고

  sessionWarnTimer = setTimeout(()=>{
    showSessionWarning();
  }, Math.max(warnMs, 0));

  sessionTimer = setTimeout(()=>{
    autoLogout();
  }, ms);
}

function resetSessionTimer(){
  lastActivityTs = Date.now();
  clearSessionTimer();
  scheduleSessionCheck();
}

function clearSessionTimer(){
  if(sessionTimer)     { clearTimeout(sessionTimer);     sessionTimer = null; }
  if(sessionWarnTimer) { clearTimeout(sessionWarnTimer); sessionWarnTimer = null; }
  ['click','keydown','mousemove','touchstart'].forEach(ev=>{
    document.removeEventListener(ev, resetSessionTimer);
  });
}

function showSessionWarning(){
  showToast('⚠️ 2분 후 자동 로그아웃됩니다. 계속 사용하려면 화면을 클릭하세요.', '');
}

async function autoLogout(){
  clearSessionTimer();
  alert('세션이 만료되어 자동 로그아웃됩니다.');
  await firebaseAuth.signOut();
}

// ══════════════════════════════════════
//  세션 시간 설정 (Admin)
// ══════════════════════════════════════
function openSessionSettings(){
  const cur = getSessionMin();
  document.getElementById('session-min-inp').value = cur;
  document.getElementById('session-mo').classList.add('open');
}

function saveSessionSettings(){
  const val = parseInt(document.getElementById('session-min-inp').value);
  if(isNaN(val) || val < 10 || val > 480){
    showToast('10분 ~ 480분(8시간) 사이로 입력하세요.', 'err'); return;
  }
  setSessionMin(val);
  closeModal('session-mo');
  // 현재 세션 타이머 재시작
  if(currentUser) resetSessionTimer();
  showToast(`세션 시간이 ${val}분으로 설정되었습니다.`, 'ok');
}

// ══════════════════════════════════════
//  EmailJS 가입 알림 발송
// ══════════════════════════════════════
async function sendRegisterNotification(profile){
  try{
    // Admin 목록 조회
    const usersData = await fbGet('users');
    if(!usersData) return;

    const admins = Object.values(usersData).filter(u =>
      u.role === 'admin' && u.status === 'approved' && u.email
    );
    if(!admins.length) return;

    const orgTypeLabel = {
      headquarter: '본사',
      outsource:   '외주',
      customer:    '고객사'
    }[profile.orgType] || profile.orgType;

    const now = new Date();
    const requestTime = now.toLocaleDateString('ko-KR') + ' ' +
                        now.toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'});

    // Admin 각각에게 발송
    for(const admin of admins){
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email:      admin.email,
          name:          'Vision Alarm Manager',
          user_name:     profile.name,
          user_org:      profile.org,
          user_org_type: orgTypeLabel,
          user_email:    profile.email,
          request_time:  requestTime
        },
        EMAILJS_PUBLIC_KEY
      );
    }
    console.log('[EmailJS] 가입 알림 발송 완료:', admins.length + '명');
  } catch(e){
    console.warn('[EmailJS] 발송 실패 (앱 동작에는 영향 없음):', e);
  }
}

// ══════════════════════════════════════
//  사용자 권한 적용 (UI 제어)
// ══════════════════════════════════════
function applyUserPermissions(){
  if(!currentUserProfile) return;
  const isCustomer = currentUserProfile.orgType === 'customer';
  const adm        = currentUserProfile.role === 'admin';

  // 쓰기 기능 버튼 표시/숨김 (고객사는 읽기 전용)
  const writeEls = document.querySelectorAll('[data-write-only]');
  writeEls.forEach(el => {
    el.style.display = isCustomer ? 'none' : '';
  });

  // Admin 전용 버튼
  const adminEls = document.querySelectorAll('[data-admin-only]');
  adminEls.forEach(el => {
    el.style.display = adm ? '' : 'none';
  });

  // topbar Admin 관련 요소
  const vmb = document.getElementById('vision-manage-btn');
  if(vmb) vmb.style.display = adm ? 'block' : 'none';
  const bkb = document.getElementById('backup-btn');
  if(bkb) bkb.style.display = adm ? 'inline-flex' : 'none';
  const addAlarmBtn = document.querySelector('[onclick="openAddAlarmModal()"]');
  if(addAlarmBtn) addAlarmBtn.style.display = isCustomer ? 'none' : '';
}

// ══════════════════════════════════════
//  Topbar 사용자 정보 표시
// ══════════════════════════════════════
function updateTopbarUser(){
  if(!currentUserProfile) return;
  const badge = document.getElementById('role-b');
  if(badge){
    const roleLabel = currentUserProfile.role === 'admin' ? 'ADMIN' : 'VIEWER';
    badge.textContent = roleLabel;
    if(currentUserProfile.role === 'admin'){
      badge.style.background    = 'rgba(255,179,71,.15)';
      badge.style.color         = 'var(--yellow)';
      badge.style.borderColor   = 'rgba(255,179,71,.3)';
    } else {
      badge.style.background    = 'var(--aglow)';
      badge.style.color         = 'var(--accent)';
      badge.style.borderColor   = 'rgba(79,124,255,.3)';
    }
  }

  // 사용자 이름 표시
  const userNameEl = document.getElementById('tb-username');
  if(userNameEl) userNameEl.textContent = currentUserProfile.name;

  // 저자 자동 입력 (기존 savedAuthor 대체)
  savedAuthor = currentUserProfile.name;
  savedSite   = currentUserProfile.org || '';
}

// ══════════════════════════════════════
//  화면 전환 (auth ↔ app)
// ══════════════════════════════════════
function showAuthScreen(tab = 'login'){
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display         = 'none';
  switchAuthTab(tab);
}

function hideAuthScreen(){
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display         = 'flex';
}

function showPendingScreen(profile){
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app').style.display            = 'none';
  document.getElementById('pending-screen').style.display = 'flex';
  const nm = document.getElementById('pending-name');
  if(nm) nm.textContent = profile.name + '님';
}

function switchAuthTab(tab){
  ['login','register','reset'].forEach(t=>{
    const el = document.getElementById('auth-' + t);
    if(el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.getElementById('reset-success').style.display = 'none';
  clearAuthErrors();
}

// ══════════════════════════════════════
//  에러/로딩 헬퍼
// ══════════════════════════════════════
function showAuthError(form, msg){
  const el = document.getElementById('auth-err-' + form);
  if(el){ el.textContent = msg; el.style.display = 'block'; }
}

function clearAuthErrors(){
  ['login','register','reset'].forEach(f=>{
    const el = document.getElementById('auth-err-' + f);
    if(el){ el.textContent = ''; el.style.display = 'none'; }
  });
}

function setAuthLoading(on){
  const btns = document.querySelectorAll('.auth-submit-btn');
  btns.forEach(b => { b.disabled = on; b.textContent = on ? '처리 중...' : b.dataset.label; });
}

function authErrMsg(code){
  const map = {
    'auth/user-not-found':      '등록되지 않은 이메일입니다.',
    'auth/wrong-password':      '비밀번호가 올바르지 않습니다.',
    'auth/invalid-email':       '이메일 형식이 올바르지 않습니다.',
    'auth/email-already-in-use':'이미 사용 중인 이메일입니다.',
    'auth/weak-password':       '비밀번호가 너무 약합니다. (6자 이상)',
    'auth/too-many-requests':   '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
    'auth/network-request-failed':'네트워크 오류가 발생했습니다.',
    'auth/user-disabled':       '비활성화된 계정입니다. 관리자에게 문의하세요.',
    'auth/invalid-credential':  '이메일 또는 비밀번호가 올바르지 않습니다.',
  };
  return map[code] || '오류가 발생했습니다: ' + code;
}

// ══════════════════════════════════════
//  비밀번호 정책 실시간 체크 UI
// ══════════════════════════════════════
function onPwInput(pw, prefix){
  const r = checkPasswordPolicy(pw);
  const items = [
    { id: prefix + '-p-len',     ok: r.minLen,    text: '8자 이상' },
    { id: prefix + '-p-lower',   ok: r.hasLower,  text: '영문 포함 (대/소문자)' },
    { id: prefix + '-p-num',     ok: r.hasNumber, text: '숫자 포함' },
    { id: prefix + '-p-special', ok: r.hasSpecial,text: '특수문자 포함 (!@#$% 등)' },
  ];
  items.forEach(item=>{
    const el = document.getElementById(item.id);
    if(!el) return;
    el.className = 'pw-policy-item ' + (item.ok ? 'ok' : 'fail');
    el.innerHTML = (item.ok ? '✅' : '❌') + ' ' + item.text;
  });
}

function onPwConfirmInput(pw, pw2, confirmId){
  const el = document.getElementById(confirmId);
  if(!el) return;
  if(!pw2){
    el.textContent = '';
    el.className   = 'pw-match-msg';
    return;
  }
  if(pw === pw2){
    el.textContent = '✅ 비밀번호가 일치합니다.';
    el.className   = 'pw-match-msg ok';
  } else {
    el.textContent = '❌ 비밀번호가 일치하지 않습니다.';
    el.className   = 'pw-match-msg fail';
  }
}

// ══════════════════════════════════════
//  앱 초기화 완료 플래그
// ══════════════════════════════════════
let appInitialized = false;

async function initApp(){
  if(appInitialized) return;
  appInitialized = true;

  // 기존 app-init.js의 init() 로직 실행
  initResizers();
  rebuildAlarms();
  applyLang();
  renderVisionSelects();
  renderFavorites();
  renderRecent();
  applyFilters();
  updateStats();
  renderRight();
  applyUserPermissions();

  // Demo search log seed
  if(searchLog.length === 0){
    const demo = ['NotchingVision_HOST_0','FoilVision_HOST_30','NotchingVision_HOST_7',
      'NGVision_HOST_11','DelaminationVision_HOST_4','FoilVision_Vision_30',
      'NotchingVision_HOST_1','NGVision_HOST_0'];
    const now = Date.now();
    demo.forEach((k,i)=>{
      for(let j = 0; j < (8-i)*3; j++)
        searchLog.push({ key:k, ts: now - Math.random()*6*24*3600*1000 });
    });
    sS('vam_search_log', searchLog);
  }

  // URL 파라미터 처리
  try{
    const p = new URLSearchParams(location.search);
    const fburl = p.get('fburl');
    if(fburl && !FB_URL){
      FB_URL = decodeURIComponent(fburl).replace(/\/+$/, '');
      localStorage.setItem('vam_fb_url', FB_URL);
    }
    if(FB_URL) await initFirebase();
    else setDbStatus('offline');

    const v = p.get('v'), tp = p.get('t'), c = p.get('c');
    if(v && tp && c){
      document.getElementById('sel-v').value = v;
      document.getElementById('sel-t').value = tp;
      applyFilters();
      const a = alarms.find(x => x.vision===v && x.type===tp && x.code===parseInt(c));
      if(a) setTimeout(()=>selAlarm(a.id), 200);
    }
  } catch(e){ console.warn('[initApp] URL 처리 오류:', e); }
}

// ══════════════════════════════════════
//  사용자 관리 (Admin 전용)
// ══════════════════════════════════════

// 사용자 목록 모달 열기
async function openUserManage(){
  if(!isAdmin){ showToast('관리자 권한 필요','err'); return; }
  document.getElementById('user-manage-mo').classList.add('open');
  await renderUserList();
}

function closeUserManage(){
  document.getElementById('user-manage-mo').classList.remove('open');
}

// 사용자 목록 렌더링
async function renderUserList(){
  const body = document.getElementById('um-body');
  if(!body) return;
  body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">⏳ 불러오는 중...</div>';

  try{
    const db = firebase.database();
    const snap = await db.ref('users').once('value');
    const users = snap.val();

    if(!users){
      body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">등록된 사용자가 없습니다.</div>';
      return;
    }

    const userList = Object.values(users);
    // 상태별 정렬: pending 먼저, 그 다음 approved, 나머지
    userList.sort((a,b)=>{
      const order = {pending:0, approved:1, suspended:2, rejected:3};
      return (order[a.status]??9) - (order[b.status]??9);
    });

    const orgTypeLabel = { headquarter:'본사', outsource:'외주', customer:'고객사' };
    const statusLabel  = { pending:'승인대기', approved:'승인', suspended:'정지', rejected:'거절' };
    const statusColor  = { pending:'var(--yellow)', approved:'var(--green)', suspended:'var(--red)', rejected:'var(--text3)' };

    body.innerHTML = userList.map(u => {
      const isSelf = u.uid === currentUser?.uid;
      const lastLogin = u.lastLogin ? u.lastLogin.slice(0,16).replace('T',' ') : '없음';
      const orgLabel  = orgTypeLabel[u.orgType] || u.orgType;
      const stLabel   = statusLabel[u.status]   || u.status;
      const stColor   = statusColor[u.status]   || 'var(--text3)';

      return `
      <div class="um-row" id="um-${u.uid}">
        <div class="um-info">
          <div class="um-name">
            ${esc(u.name)}
            ${isSelf ? '<span style="font-size:10px;color:var(--accent);margin-left:4px">(나)</span>' : ''}
            ${u.role==='admin' ? '<span style="font-size:10px;color:var(--yellow);margin-left:4px">ADMIN</span>' : ''}
          </div>
          <div class="um-detail">
            <span>${esc(u.email)}</span>
            <span>${esc(u.org)} · ${orgLabel}</span>
            <span>마지막 로그인: ${lastLogin}</span>
          </div>
        </div>
        <div class="um-actions">
          <span class="um-status" style="color:${stColor}">${stLabel}</span>
          ${!isSelf ? `
            ${u.status==='pending'  ? `<button class="btn sm primary" onclick="updateUserStatus('${u.uid}','approved')">✅ 승인</button>` : ''}
            ${u.status==='pending'  ? `<button class="btn sm" onclick="updateUserStatus('${u.uid}','rejected')" style="color:var(--red);border-color:rgba(255,77,106,.3)">❌ 거절</button>` : ''}
            ${u.status==='approved' ? `<button class="btn sm" onclick="updateUserStatus('${u.uid}','suspended')" style="color:var(--red);border-color:rgba(255,77,106,.3)">🚫 정지</button>` : ''}
            ${u.status==='suspended'? `<button class="btn sm" onclick="updateUserStatus('${u.uid}','approved')">🔓 정지해제</button>` : ''}
            ${u.status==='rejected' ? `<button class="btn sm" onclick="updateUserStatus('${u.uid}','approved')">↩️ 재승인</button>` : ''}
            ${u.role!=='admin' ? `<button class="btn sm" onclick="updateUserRole('${u.uid}','admin')" style="color:var(--yellow);border-color:rgba(255,179,71,.3)">⭐ Admin</button>` : ''}
            ${u.role==='admin' ? `<button class="btn sm" onclick="updateUserRole('${u.uid}','member')" style="color:var(--text3)">👤 일반</button>` : ''}
          ` : '<span style="font-size:10px;color:var(--text3)">본인 계정</span>'}
        </div>
      </div>`;
    }).join('');

    // 승인대기 건수 표시
    const pendingCnt = userList.filter(u=>u.status==='pending').length;
    const cntEl = document.getElementById('um-pending-cnt');
    if(cntEl){
      cntEl.textContent = pendingCnt > 0 ? `승인대기 ${pendingCnt}명` : '';
      cntEl.style.color = pendingCnt > 0 ? 'var(--yellow)' : '';
    }

  } catch(e){
    console.error('[UserManage] 오류:', e);
    body.innerHTML = `<div style="color:var(--red);padding:20px">오류: ${e.message}</div>`;
  }
}

// 사용자 상태 변경 (승인/거절/정지)
async function updateUserStatus(uid, newStatus){
  const statusMsg = {
    approved:  '승인하시겠습니까?',
    rejected:  '거절하시겠습니까?',
    suspended: '정지하시겠습니까?',
  };
  if(!confirm(statusMsg[newStatus] || '변경하시겠습니까?')) return;

  try{
    const db = firebase.database();
    await db.ref('users/' + uid + '/status').set(newStatus);

    // 감사 로그
    addAudit('사용자 상태 변경', uid, currentUserProfile.name, '', newStatus);
    await saveAudit();

    showToast(`✅ ${newStatus === 'approved' ? '승인' : newStatus === 'rejected' ? '거절' : '정지'} 완료`, 'ok');
    await renderUserList(); // 목록 새로고침

    // 승인 시 EmailJS로 알림 (선택)
    if(newStatus === 'approved'){
      try{
        const snap = await db.ref('users/' + uid).once('value');
        const profile = snap.val();
        if(profile && profile.email){
          await emailjs.send(
            'service_p8md6zd',
            'template_x6qowo8',
            {
              to_email:      profile.email,
              name:          'Vision Alarm Manager',
              user_name:     profile.name,
              user_org:      profile.org,
              user_org_type: profile.orgType,
              user_email:    profile.email,
              request_time:  '가입 승인 완료'
            },
            'sLxfXJSqzf_-t-Nt_'
          );
        }
      } catch(e){ console.warn('[EmailJS] 승인 알림 실패:', e); }
    }
  } catch(e){
    showToast('❌ 변경 실패: ' + e.message, 'err');
  }
}

// 사용자 권한 변경 (admin/member)
async function updateUserRole(uid, newRole){
  const msg = newRole === 'admin' ? 'Admin 권한을 부여하시겠습니까?' : 'Admin 권한을 해제하시겠습니까?';
  if(!confirm(msg)) return;

  try{
    const db = firebase.database();
    await db.ref('users/' + uid + '/role').set(newRole);

    addAudit('사용자 권한 변경', uid, currentUserProfile.name, '', newRole);
    await saveAudit();

    showToast(`✅ ${newRole === 'admin' ? 'Admin 권한 부여' : '일반 사용자로 변경'} 완료`, 'ok');
    await renderUserList();
  } catch(e){
    showToast('❌ 변경 실패: ' + e.message, 'err');
  }
}

// ══════════════════════════════════════
//  Vision 개인화 필터
// ══════════════════════════════════════

function openVisionPersonalize(){
  if(!currentUserProfile) return;
  const mo = document.getElementById('vision-personal-mo');
  if(!mo) return;

  const myVisions = currentUserProfile.visibleVisions || ['ALL'];
  const allVisions = getVisionList();

  document.getElementById('vp-list').innerHTML = allVisions.map(v => `
    <label class="vp-item">
      <input type="checkbox" value="${v}"
        ${myVisions.includes('ALL') || myVisions.includes(v) ? 'checked' : ''}>
      <span>${v}</span>
    </label>
  `).join('') + `
    <label class="vp-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <input type="checkbox" id="vp-all" ${myVisions.includes('ALL') ? 'checked' : ''}
        onchange="toggleVpAll(this)">
      <span style="color:var(--accent)">전체 보기</span>
    </label>
  `;

  mo.classList.add('open');
}

function toggleVpAll(cb){
  const items = document.querySelectorAll('#vp-list input[type="checkbox"]:not(#vp-all)');
  items.forEach(i => i.checked = cb.checked);
}

async function saveVisionPersonalize(){
  const allCb = document.getElementById('vp-all');
  let visions;

  if(allCb && allCb.checked){
    visions = ['ALL'];
  } else {
    visions = Array.from(
      document.querySelectorAll('#vp-list input[type="checkbox"]:not(#vp-all):checked')
    ).map(i => i.value);
    if(visions.length === 0) visions = ['ALL'];
  }

  try{
    const db = firebase.database();
    await db.ref('users/' + currentUser.uid + '/visibleVisions').set(visions);
    currentUserProfile.visibleVisions = visions;

    closeModal('vision-personal-mo');
    applyVisionPersonalize();
    showToast('✅ Vision 설정 저장됨', 'ok');
  } catch(e){
    showToast('❌ 저장 실패: ' + e.message, 'err');
  }
}

// Vision 개인화 필터 적용
function applyVisionPersonalize(){
  if(!currentUserProfile) return;
  const myVisions = currentUserProfile.visibleVisions || ['ALL'];
  if(myVisions.includes('ALL')) return; // 전체 보기면 필터 없음

  // Vision 선택 드롭다운에서 해당 Vision만 표시
  const selV = document.getElementById('sel-v');
  if(!selV) return;
  Array.from(selV.options).forEach(opt => {
    if(opt.value === '') return; // 전체 옵션 유지
    opt.style.display = myVisions.includes(opt.value) ? '' : 'none';
  });
}
