// INTEKPLUS ALARM Manager - Application Logic
// 이 파일은 vision_alarm_manager.html 에서 분리된 스크립트입니다.
// 로드 순서: alarms.js → app.js

// ══════════════════════════════════════
//  DATA
// ══════════════════════════════════════
// ← alarms.js 에서 로드됨

// ══════════════════════════════════════
//  FIREBASE LAYER
// ══════════════════════════════════════
let FB_URL = (localStorage.getItem('vam_fb_url') || '').replace(/\/+$/, '');
let fbOnline = false;

// URL 조합 - 슬래시 중복 방지
function fbPath(path){
  if(!path || path === '') return FB_URL + '/.json';
  return FB_URL + '/' + path.replace(/^\/+/, '') + '.json';
}

async function fbGet(path){
  if(!FB_URL) return null;
  try{
    const r = await fetch(fbPath(path));
    if(!r.ok) return null;
    const text = await r.text();
    if(!text || text === 'null') return {};
    return JSON.parse(text);
  } catch(e){ console.error('fbGet error:', e); return null; }
}

async function fbPatch(path, data){
  if(!FB_URL) return false;
  try{
    const r = await fetch(fbPath(path), {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    return r.ok;
  } catch(e){ console.error('fbPatch error:', e); return false; }
}

async function fbDelete(path){
  if(!FB_URL) return false;
  try{
    const r = await fetch(fbPath(path), { method:'DELETE' });
    return r.ok;
  } catch(e){ console.error('fbDelete error:', e); return false; }
}

let pollTimer = null;
function startPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async ()=>{
    if(!FB_URL || !fbOnline) return;
    try{
      const [actData, auditData, caData, cvData, ctData, suData] = await Promise.all([
        fbGet('actions'),
        fbGet('auditLog'),
        fbGet('customAlarms'),
        fbGet('customVisions'),
        fbGet('customTypes'),
        fbGet('siteUnits')
      ]);
      let changed = false;
      const newActions = (actData && typeof actData === 'object') ? actData : {};
      if(JSON.stringify(newActions) !== JSON.stringify(actions)){
        actions = newActions; changed = true;
      }
      if(auditData){
        const newAudit = Array.isArray(auditData) ? auditData : Object.values(auditData);
        if(JSON.stringify(newAudit) !== JSON.stringify(auditLog)){
          auditLog = newAudit; changed = true;
        }
      }
      if(caData && Array.isArray(caData) && JSON.stringify(caData)!==JSON.stringify(customAlarms)){
        customAlarms = caData; sS('vam_custom_alarms', customAlarms); rebuildAlarms(); changed = true;
      }
      if(cvData && Array.isArray(cvData) && JSON.stringify(cvData)!==JSON.stringify(customVisions)){
        customVisions = cvData; sS('vam_custom_visions', customVisions); renderVisionSelects(); changed = true;
      }
      if(ctData && Array.isArray(ctData) && JSON.stringify(ctData)!==JSON.stringify(customTypes)){
        customTypes = ctData; sS('vam_custom_types', customTypes); renderVisionSelects(); changed = true;
      }
      if(suData && Array.isArray(suData) && JSON.stringify(suData)!==JSON.stringify(siteUnits)){
        siteUnits = suData; sS('vam_site_units', siteUnits); changed = true;
      }
      if(changed){
        renderRight();
        if(curAlarm) renderDetail(curAlarm);
        if(allActOpen) renderAllActions();
        renderList(document.getElementById('srch').value);
        updateStats();
      }
    } catch(e){}
  }, 8000);
}

async function initFirebase(){
  if(!FB_URL){ setDbStatus('offline'); applyFilters(); return; }
  console.log('[Firebase] 연결 시도:', FB_URL);
  setDbStatus('loading');
  try{
    const testUrl = FB_URL + '/.json?shallow=true';
    const r = await fetch(testUrl);
    console.log('[Firebase] 응답 상태:', r.status, r.ok);
    if(!r.ok){
      console.error('[Firebase] 연결 실패 HTTP:', r.status);
      fbOnline = false; setDbStatus('offline');
      applyFilters(); updateStats(); renderRight(); return;
    }
    // 연결 성공 - 각 키별로 개별 로드
    fbOnline = true;
    setDbStatus('online');
    console.log('[Firebase] 연결 성공! 데이터 로드 중...');

    const [actData, editData, auditData, caData, cvData, ctData, suData] = await Promise.all([
      fbGet('actions'),
      fbGet('alarmEdits'),
      fbGet('auditLog'),
      fbGet('customAlarms'),
      fbGet('customVisions'),
      fbGet('customTypes'),
      fbGet('siteUnits')
    ]);

    if(actData && typeof actData === 'object') actions = actData;
    if(editData && typeof editData === 'object') alarmEdits = editData;
    if(auditData && typeof auditData === 'object') auditLog = Array.isArray(auditData) ? auditData : Object.values(auditData);
    if(caData && Array.isArray(caData)){ customAlarms = caData; sS('vam_custom_alarms', customAlarms); }
    if(cvData && Array.isArray(cvData)){ customVisions = cvData; sS('vam_custom_visions', customVisions); }
    if(ctData && Array.isArray(ctData)){ customTypes = ctData; sS('vam_custom_types', customTypes); }
    if(suData && Array.isArray(suData)){ siteUnits = suData; sS('vam_site_units', siteUnits); }

    // alarms 재구성 (RAW + customAlarms)
    rebuildAlarms();

    console.log('[Firebase] 로드 완료 - actions:', Object.keys(actions).length, '개');
    startPolling();
    showToast('Firebase 연결됨 ✅', 'ok');
  } catch(e){
    console.error('[Firebase] 연결 에러:', e);
    fbOnline = false;
    setDbStatus('offline');
  }
  applyFilters(); updateStats(); renderRight();
}

function setDbStatus(s){
  const el = document.getElementById('db-status');
  const txt = document.getElementById('db-txt');
  if(s === 'online'){
    el.className='online'; if(txt) txt.textContent='실시간 연동 중';
  } else if(s === 'offline'){
    el.className='offline'; if(txt) txt.textContent='로컬 모드';
  } else {
    el.className='loading'; if(txt) txt.textContent='⏳ 연결 중...';
  }
  const ld = document.getElementById('aap-live');
  if(ld) ld.style.display = s==='online'?'inline-block':'none';
}

// ══════════════════════════════════════
//  LOCAL STORAGE FALLBACK
// ══════════════════════════════════════
function gS(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch{ return d; } }
function sS(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); } catch{} }

// ══════════════════════════════════════
//  i18n — 언어 설정
// ══════════════════════════════════════
let currentLang = gS('vam_lang', 'ko'); // 'ko' | 'en'

const I18N = {
  ko: {
    // 상단 버튼
    btn_all_actions:  '📋 전체 조치방안',
    btn_add_alarm:    '➕ 알람 추가',
    // 사이드바
    vision_select:    'Vision 선택',
    search_ph:        '코드 · 알람명 · 원인 · 조치방안',
    severity:         '심각도',
    favorites:        '즐겨찾기 ⭐',
    recent:           '최근 조회',
    no_act_only:      '미등록만',
    // 정렬
    sort_code:        '코드순',
    sort_name:        '이름순',
    sort_sev:         '심각도순',
    sort_acts:        '조치방안 많은순',
    sort_recent:      '최신 조치방안순',
    // 상세 패널
    basic_info:       '기본 정보',
    direct_cause:     '직접 원인',
    occurrence:       '발생 조건',
    influence:        '영향 조건',
    related_alarms:   '관련 알람',
    timing:           '발생 시점',
    plc_output:       'PLC 출력',
    related_log:      '관련 로그',
    actions_history:  '조치방안 이력',
    add_action:       '+ 조치방안 등록',
    // 조치방안 폼
    name_label:       '이름',
    site_label:       '현장',
    content_label:    '조치 내용 *',
    status_label:     '상태',
    date_label:       '날짜',
    link_label:       '참고 자료 링크',
    submit_action:    '등록',
    // 통계
    stat_total:       '전체',
    stat_acts:        '조치방안',
    stat_noact:       '미등록',
    stat_resolved:    '해결됨',
    // Trouble 필드
    tr_site:          '사이트',
    tr_unit:          '호기',
    tr_time:          '조치 시간',
    tr_keywords:      '키워드',
    tr_desc:          '발생 현상',
    // 기타
    loading:          '로딩 중...',
    no_result:        '검색 결과가 없습니다',
    alarm_count:      '개 알람',
    save_firebase:    'Firebase에 저장됨 ✅',
    save_local:       '로컬에 저장됨',
    top10:            'TOP 10 조회',
    recent_actions:   '최근 조치방안',
    edit_history:     '수정 이력',
    view_all:         '전체 보기',
    view_all2:        '전체보기',
    close:            '닫기',
    cancel:           '취소',
    offline_notice:   '오프라인 모드',
    // 랭킹 토글
    rank_7d:          '7일',
    rank_all:         '전체',
    rank_no_data:     '기록 없음',
    // 상태 라벨
    status_unset:     '미지정',
    status_resolved:  '✅ 해결됨',
    status_temp:      '⚠️ 임시조치',
    status_checking:  '🔍 확인중',
    status_default:   '📌 Default',
    // 조치방안 폼
    action_placeholder: '조치 내용을 상세히 입력하세요\n(증상 / 원인 확인 방법 / 조치 절차 / 결과)',
    // Trouble 상세
    resolution_time:  '조치 시간',
    hour:             '시간',
    minute:           '분',
    // 기타
    none:             '없음',
    added:            '추가됨',
    all_vision:       '전체 Vision',
    all_type:         '전체 타입',
    // 조치방안 카드 버튼
    edit:             '✏️ 수정',
    delete_admin:     '🗑️ 삭제',
    helpful:          '👍 도움됐어요',
    action_add_title: '+ 조치방안 등록',
    action_edit_title:'✏️ 조치방안 수정',
    name_required:    '이름 (필수)',
    site_optional:    '현장 (선택)',
    ref_link:         '🔗 참고 자료 URL (선택)',
    // 알람 수정/삭제
    alarm_edit:       '✏️ 수정',
    alarm_delete:     '🗑️ 삭제',
  },
  en: {
    btn_all_actions:  '📋 All Actions',
    btn_add_alarm:    '➕ Add Alarm',
    vision_select:    'Vision Select',
    search_ph:        'Code · Name · Cause · Action',
    severity:         'Severity',
    favorites:        'Favorites ⭐',
    recent:           'Recent',
    no_act_only:      'No Action Only',
    sort_code:        'By Code',
    sort_name:        'By Name',
    sort_sev:         'By Severity',
    sort_acts:        'Most Actions',
    sort_recent:      'Latest Action',
    basic_info:       'Basic Info',
    direct_cause:     'Direct Cause',
    occurrence:       'Occurrence',
    influence:        'Influence',
    related_alarms:   'Related Alarms',
    timing:           'Timing',
    plc_output:       'PLC Output',
    related_log:      'Related Log',
    actions_history:  'Action History',
    add_action:       '+ Add Action Plan',
    name_label:       'Name',
    site_label:       'Site',
    content_label:    'Content *',
    status_label:     'Status',
    date_label:       'Date',
    link_label:       'Reference Link',
    submit_action:    'Submit',
    stat_total:       'Total',
    stat_acts:        'Actions',
    stat_noact:       'No Action',
    stat_resolved:    'Resolved',
    tr_site:          'Site',
    tr_unit:          'Line',
    tr_time:          'Resolution Time',
    tr_keywords:      'Keywords',
    tr_desc:          'Description',
    loading:          'Loading...',
    no_result:        'No results found',
    alarm_count:      ' alarms',
    save_firebase:    'Saved to Firebase ✅',
    save_local:       'Saved locally',
    top10:            'TOP 10 Views',
    recent_actions:   'Recent Actions',
    edit_history:     'Edit History',
    view_all:         'View All',
    view_all2:        'View All',
    close:            'Close',
    cancel:           'Cancel',
    offline_notice:   'Offline Mode',
    // rank toggle
    rank_7d:          '7 Days',
    rank_all:         'All Time',
    rank_no_data:     'No records',
    // status labels
    status_unset:     'Unspecified',
    status_resolved:  '✅ Resolved',
    status_temp:      '⚠️ Temporary',
    status_checking:  '🔍 Checking',
    status_default:   '📌 Default',
    // action form
    action_placeholder: 'Describe the action plan in detail\n(Symptom / Root cause / Steps / Result)',
    // Trouble detail
    resolution_time:  'Resolution Time',
    hour:             'hr',
    minute:           'min',
    // misc
    none:             'None',
    added:            'Added',
    all_vision:       'All Vision',
    all_type:         'All Types',
    // action card buttons
    edit:             '✏️ Edit',
    delete_admin:     '🗑️ Delete',
    helpful:          '👍 Helpful',
    action_add_title: '+ Add Action Plan',
    action_edit_title:'✏️ Edit Action Plan',
    name_required:    'Name (required)',
    site_optional:    'Site (optional)',
    ref_link:         '🔗 Reference URL (optional)',
    // alarm edit/delete
    alarm_edit:       '✏️ Edit',
    alarm_delete:     '🗑️ Delete',
  }
};

function t(key){ return (I18N[currentLang]||I18N.ko)[key] || (I18N.ko)[key] || key; }

function toggleLang(){
  currentLang = currentLang === 'ko' ? 'en' : 'ko';
  sS('vam_lang', currentLang);
  applyLang();
  // 언어에 따라 alarms 재구성
  rebuildAlarms();
  applyFilters(); updateStats(); renderRight();
  if(curAlarm) renderDetail(curAlarm);
  showToast(currentLang === 'en' ? '🌐 English Mode' : '🌐 한국어 모드', 'ok');
}

function applyLang(){
  const isEn = currentLang === 'en';
  // html lang 속성 변경 (CSS 셀렉터에서 사용)
  document.getElementById('html-root').setAttribute('lang', currentLang);
  // 토글 버튼 업데이트
  const btn = document.getElementById('lang-btn');
  if(btn){
    btn.textContent = isEn ? '🌐 EN' : '🌐 KO';
    btn.classList.toggle('en', isEn);
  }
  // data-i18n 속성으로 정적 텍스트 교체
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if(t(key)) el.textContent = t(key);
  });
  // 검색창 placeholder
  const srch = document.getElementById('srch');
  if(srch) srch.placeholder = t('search_ph');
  // 정렬 옵션
  const sortSel = document.getElementById('sort-sel');
  if(sortSel){
    const opts = sortSel.querySelectorAll('option');
    const keys = ['sort_code','sort_name','sort_sev','sort_acts','sort_recent'];
    opts.forEach((opt,i)=>{ if(keys[i]) opt.textContent = t(keys[i]); });
  }
  // 사이드바 라벨들
  const visionLabel = document.querySelector('#sidebar .sbl');
  if(visionLabel) visionLabel.childNodes[0].textContent = t('vision_select');
  // 통계 라벨
  [['sb-scl','stat_total'],['sb-scl','stat_acts'],['sb-scl','stat_noact'],['sb-scl','stat_resolved']].forEach(()=>{});
  document.querySelectorAll('.sb-scl').forEach((el,i)=>{
    const keys=['stat_total','stat_acts','stat_noact','stat_resolved'];
    if(keys[i]) el.textContent = t(keys[i]);
  });
}

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let customAlarms  = gS('vam_custom_alarms', []);
let customVisions = gS('vam_custom_visions', []);
let customTypes   = gS('vam_custom_types', []);

// 사이트/호기 데이터 (CSV 초기값 포함)
const DEFAULT_SITE_UNITS = [
  {"site":"ESHD","units":["1-1A","1-2A","2-1A","2-2A","1-1C","1-2C","2-1C","2-2C","3-1A","3-2A","4-1A","4-2A","5-1C","5-2C","6-1C","6-2C"]},
  {"site":"ESHG","units":["1A-A","1A-C","1B-A","1B-C","1C-A","1C-C","1D-A","1D-C","2A-A","2A-C","2B-A","2B-C","2C-A","2C-C","2D-A","2D-C"]},
  {"site":"ESMI","units":["1-1C","1-2C","2-1C","2-2C","3-1C","3-2C","3-3C","4-1C","4-2C","4-3C","5-1C","5-2C","1-1A","1-2A","2-1A","2-2A","3-1A","3-2A","3-3A","4-1A","4-2A","4-3A","5-1A","5-2A"]},
  {"site":"ESMIL","units":["1A","2A","3A","4A","5A","6A","7A"]},
  {"site":"ESNA","units":["1-1C","2-1C","2-2C","3-1C","3-2C","4-1C","4-2C","5-1C","5-2C","6-1C","6-2C","6-3C","7-1C","7-2C","7-3C","1-1A","2-1A","2-2A","3-1A","3-2A","4-1A","4-2A","5-1A","5-2A","6-1A","6-2A","6-3A","7-1A","7-2A","7-3A"]},
  {"site":"ESNB","units":["ESS2-1C","ESS2-2C","2-1C","2-2C","2-3C","3-1C","3-2C","4-1C","4-2C","ESS1-1C","ESS1-2C","6-1C","6-2C","10-1C","11-1C","12-1C","13-1C","14-1C","14-2C","ESS2-1A","ESS2-2A","2-1A","2-2A","ESS2-3A","3-1A","3-2A","4-1A","4-2A","5-1A","5-2A","ESS1-1A","ESS1-2A","6-1A","6-3A","7-1A","7-2A","10-1A","11-1A","12-1A","13-1A","14-1A","14-2A"]},
  {"site":"ESOT","units":["1-1A","1-2A","2-1A","2-2A","3-1A","3-2A","4-1A","4-2A","1-1C","1-2C","2-1C","2-2C","3-1C","3-2C","4-1C","4-2C"]},
  {"site":"ESUC2","units":["1A","2A","3A","4A","5A","6A","7A"]},
  {"site":"ESWA","units":["1-1C","1-2C","2-1C","2-2C","3-1C","3-2C","3-3C","3-4C","1-1A","1-2A","2-1A","2-2A","3-1A","3-2A","3-3A","3-4A","4-1C","5-1C","6-1C","6-2C","7-1C","7-2C","25-1C","25-2C","4-1A","5-1A","6-1A","6-2A","7-1A","7-2A","25-1A","25-2A","8-1C","8-2C","9-1C","9-2C","10-1C","11-1C","11-2C","12-1C","12-2C","13-1C","14-1C","15-1C","15-2C","16-1C","16-2C","17-1C","17-2C","18-1C","18-2C","19-1C","19-2C","20-1C","21-1C","22-1C","23-1C","24-1C","8-1A","8-2A","9-1A","9-2A","10-1A","11-1A","11-2A","12-1A","12-2A","13-1A","14-1A","15-1A","15-2A","16-1A","16-2A","17-1A","17-2A","18-1A","18-2A","19-1A","19-2A","20-1A","21-1A","22-1A","23-1A","24-1A","26-1C","26-2C","27-1C","27-2C","28-1C","28-2C","26-1A","26-2A","27-1A","27-2A","28-1A","28-2A","29-1A","29-1C"]}
];
let siteUnits = gS('vam_site_units', null);
// 최초 실행 시 또는 데이터 없을 때 기본값 사용
if(!siteUnits || !Array.isArray(siteUnits) || siteUnits.length === 0){
  siteUnits = DEFAULT_SITE_UNITS;
  sS('vam_site_units', siteUnits);
}

// 사이트명 정규화: LGESWA → ESWA, ESWA → ESWA
function normalizeSite(s){ return (s||'').replace(/^LGES/, 'ES').toUpperCase(); }
let alarms = [...RAW.map(a=>({...a})), ...customAlarms.map(a=>({...a}))];
let actions    = gS('vam_actions', {});
let favorites  = gS('vam_favorites', []);
let searchLog  = gS('vam_search_log', []);
let recentViewed = gS('vam_recent', []);
let auditLog   = gS('vam_audit', []);
let alarmEdits = gS('vam_alarm_edits', {});
let savedAuthor = gS('vam_author', '');
let savedSite   = gS('vam_site', '');
let isAdmin = false;
let curAlarm = null;
let rankPeriod = '7d';
let sevFilter = '';
let filtered = [];
let allActOpen = false;
let sortDescAct = 'desc';
// 페이지네이션 상태
const PG_THRESHOLD = 100; // 이 수 이상이면 페이지네이션 활성화
let pgCur  = 1;           // 현재 페이지
let pgSize = 50;          // 페이지당 표시 수

// ══════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════
function ak(a){ return a.vision+'_'+a.type+'_'+a.code; }
function ga(a){ return {...a,...(alarmEdits[ak(a)]||{})}; }

// EN 모드에서 아직 번역 안 된 항목 감지 (한글 포함 여부)
function needsTranslation(text){
  if(currentLang !== 'en') return false;
  return /[가-힣]/.test(text||'');
}

// 미번역 텍스트 표시: 한글이면 안내 추가
function enText(text){
  if(!needsTranslation(text)) return esc(text);
  return `<span class="translating">${esc(text)}</span>`;
}

// RAW + customAlarms 합쳐서 alarms 재구성 (언어 반영)
function rebuildAlarms(){
  // EN 모드이고 RAW_EN이 로드된 경우 영문 데이터 사용
  const base = (currentLang === 'en' && typeof RAW_EN !== 'undefined') ? RAW_EN : RAW;
  alarms = [...base.map(a=>({...a})), ...customAlarms.map(a=>({...a}))];
}

// Vision/타입 드롭다운 동적 렌더링
function getVisionList(){
  const base = ['NotchingVision','FoilVision','DelaminationVision','NGVision'];
  return [...new Set([...base, ...customVisions])];
}
function getTypeList(){
  const base = ['HOST','Vision','Trouble'];
  return [...new Set([...base, ...customTypes])];
}

function renderVisionSelects(){
  const visions = getVisionList();
  const types = getTypeList();

  // 사이드바 필터
  ['sel-v'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML=`<option value="">${t('all_vision')}</option>`+visions.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(cur) el.value=cur;
  });
  ['sel-t'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML=`<option value="">${t('all_type')}</option>`+types.map(t=>`<option value="${t}">${t}</option>`).join('');
    if(cur) el.value=cur;
  });

  // 전체 조치방안 패널 Vision 필터
  const aav=document.getElementById('aa-v');
  if(aav){
    const cur=aav.value;
    aav.innerHTML=`<option value="">${t('all_vision')}</option>`+visions.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(cur) aav.value=cur;
  }

  // 알람 추가 모달
  const nav=document.getElementById('na-vision');
  if(nav){
    const cur=nav.value;
    nav.innerHTML=visions.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(cur) nav.value=cur;
  }
  const nat=document.getElementById('na-type');
  if(nat){
    const cur=nat.value;
    nat.innerHTML=`<option value="HOST">HOST</option><option value="Vision">Vision</option><option value="Trouble">Trouble (비알람 이슈)</option>`
      +customTypes.map(t=>`<option value="${t}">${t}</option>`).join('');
    if(cur) nat.value=cur;
  }
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hl(s,q){
  if(!q) return esc(s);
  // 다중 키워드 각각 하이라이트
  const terms = q.trim().replace(/\s+/g,' ').split(' ').filter(Boolean);
  let result = esc(s);
  terms.forEach(term => {
    const re = new RegExp('('+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
    result = result.replace(re,'<mark>$1</mark>');
  });
  return result;
}
const SLBL = ()=>({
  resolved: t('status_resolved'),
  temp:     t('status_temp'),
  checking: t('status_checking'),
  default:  t('status_default')
});
const SCLS = {resolved:'sp resolved', temp:'sp temp', checking:'sp checking', default:'sp default', '':'sp none'};
function slbl(status){ return SLBL()[status] || t('status_unset'); }

// ══════════════════════════════════════
//  SAVE (Firebase + LocalStorage)
// ══════════════════════════════════════
async function saveActions(){
  sS('vam_actions', actions);
  if(!fbOnline) return;
  await fbPatch('actions', actions);
}

async function saveActionKey(k){
  sS('vam_actions', actions);
  if(!fbOnline) return;
  if(actions[k]){
    await fbPatch('actions/' + k.replace(/[.#$[\]]/g,'_'), actions[k]);
  } else {
    await fbDelete('actions/' + k.replace(/[.#$[\]]/g,'_'));
  }
}

async function saveCustomAlarms(){
  sS('vam_custom_alarms', customAlarms);
  if(fbOnline) await fbPatch('customAlarms', customAlarms.length ? customAlarms : null);
}

async function saveCustomVisions(){
  sS('vam_custom_visions', customVisions);
  if(fbOnline) await fbPatch('customVisions', customVisions.length ? customVisions : null);
}

async function saveCustomTypes(){
  sS('vam_custom_types', customTypes);
  if(fbOnline) await fbPatch('customTypes', customTypes.length ? customTypes : null);
}

async function saveSiteUnits(){
  sS('vam_site_units', siteUnits);
  if(fbOnline) await fbPatch('siteUnits', siteUnits.length ? siteUnits : null);
}
async function saveAlarmEdits(){
  sS('vam_alarm_edits', alarmEdits);
  if(fbOnline) await fbPatch('alarmEdits', alarmEdits);
}
async function saveAudit(){
  sS('vam_audit', auditLog);
  if(fbOnline) await fbPatch('auditLog', auditLog);
}
async function saveSearchLog(){
  sS('vam_search_log', searchLog);
  // searchLog는 로컬만 저장
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════
function updateStats(){
  const total = alarms.length;
  const totalActs = Object.values(actions).reduce((s,a)=>s+(Array.isArray(a)?a.length:0), 0);
  const noAct = alarms.filter(a=>(actions[ak(a)]||[]).length===0).length;
  const resolved = Object.values(actions).flat().filter(a=>a&&a.status==='resolved').length;
  // 사이드바 통계
  ['st-total'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=total; });
  ['st-acts'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=totalActs; });
  ['st-noact'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=noAct; });
  const sr=document.getElementById('st-resolved'); if(sr)sr.textContent=resolved;
}

// ══════════════════════════════════════
//  FILTERS & LIST
// ══════════════════════════════════════
function applyFilters(){
  const v=document.getElementById('sel-v').value;
  const t=document.getElementById('sel-t').value;
  // 검색어 정규화: 앞뒤 공백 제거 + 중간 공백 정규화 + 소문자
  const raw = (document.getElementById('srch').value||'').trim().replace(/\s+/g,' ').toLowerCase();
  // 다중 키워드 AND 검색: 공백으로 분리
  const qTerms = raw ? raw.split(' ').filter(Boolean) : [];
  const sort=document.getElementById('sort-sel').value;
  const noActOnly=document.getElementById('noact-f').checked;

  filtered = alarms.filter(a=>{
    const g=ga(a);
    if(v&&g.vision!==v) return false;
    if(t&&g.type!==t) return false;
    if(sevFilter&&g.severity!==sevFilter) return false;
    const k=ak(a); const acts=actions[k]||[];
    if(noActOnly&&acts.length>0) return false;
    if(qTerms.length){
      const hay=[
        String(g.code), g.name, g.direct_cause, g.occurrence,
        g.influence, g.related_alarms, g.log,
        g.tr_site||'', g.tr_unit||'', g.tr_desc||'',
        (g.tr_keywords||[]).join(' ')
      ].join(' ').toLowerCase();
      const atxt=acts.map(x=>(x.text||'')+' '+(x.author||'')).join(' ').toLowerCase();
      const combined = hay + ' ' + atxt;
      // 모든 키워드가 포함되어야 함 (AND 검색)
      if(!qTerms.every(term => combined.includes(term))) return false;
    }
    return true;
  });

  filtered.sort((a,b)=>{
    if(sort==='code') return a.code-b.code;
    if(sort==='name') return (a.name||'').localeCompare(b.name||'');
    if(sort==='sev'){ const o={Critical:0,Warning:1,Info:2}; return (o[a.severity]||2)-(o[b.severity]||2); }
    if(sort==='acts'){ const ac=x=>(actions[ak(x)]||[]).length; return ac(b)-ac(a); }
    if(sort==='recent-act'){
      const ld=x=>{ const a2=actions[ak(x)]||[]; return a2.length?new Date(a2[a2.length-1].date):new Date(0); };
      return ld(b)-ld(a);
    }
    return 0;
  });

  pgCur = 1; // 필터 변경 시 항상 1페이지로
  renderList(raw);
  const alarmWord = (typeof t === 'function') ? t('alarm_count') : '개 알람';
  document.getElementById('res-cnt').textContent = filtered.length + alarmWord;
  updateStats();
  if(raw.length>1||v||sevFilter) logSearch((v||'ALL')+'_'+(document.getElementById('sel-t').value||'ALL')+'_'+raw);
}

function onSearch(el){
  document.getElementById('srch-clr').classList.toggle('show', el.value.length>0);
  clearTimeout(el._t); el._t=setTimeout(()=>applyFilters(), 260);
}
function clearSearch(){
  document.getElementById('srch').value='';
  document.getElementById('srch-clr').classList.remove('show');
  applyFilters();
}
function setSev(btn,val){
  sevFilter=val;
  document.querySelectorAll('#sidebar .pills .pill').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on'); applyFilters();
}

// ── RENDER LIST ──
function renderList(q=''){
  const list = document.getElementById('alarm-list');
  if(!filtered.length){
    list.innerHTML='<div class="empty-s"><div class="empty-ico">🔍</div><div>검색 결과가 없습니다</div></div>';
    renderPagination(0);
    return;
  }

  const usePg = filtered.length > PG_THRESHOLD;
  const items  = usePg ? filtered.slice((pgCur-1)*pgSize, pgCur*pgSize) : filtered;

  list.innerHTML = items.map(a=>{
    const g=ga(a), k=ak(a), isFav=favorites.includes(k);
    const acts=actions[k]||[];
    const hasActs=acts.length>0;
    const isCur=curAlarm&&ak(curAlarm)===k;
    const vcls=g.severity==='Critical'?'vr':g.severity==='Warning'?'vy':'';
    const lastSt=acts.length?acts[acts.length-1].status:'';
    const sdot=lastSt?`<span class="sdot sd-${lastSt}" title="${slbl(lastSt)}"></span>`:'';
    const isCustom=a.isCustom?'custom-alarm':'';
    return `<div class="ai${isCur?' cur':''} ${vcls}${hasActs?'':' no-act'} ${isCustom}" onclick="selAlarm(${a.id})" id="ai-${a.id}">
      <div class="ai-top">
        <span class="ct">C${g.code}</span>
        <span class="sb ${g.severity}">${g.severity}</span>
        <span class="tt">${g.type}</span>
        <span class="vt">${g.vision.replace('Vision','')}</span>
        ${a.isCustom?`<span class="custom-badge">${t('added')}</span>`:''}
        <button class="star-b ${isFav?'on':''}" onclick="event.stopPropagation();toggleFav('${k}')" title="${isFav?'즐겨찾기 해제':'즐겨찾기'}">★</button>
      </div>
      <div class="ai-name">${needsTranslation(g.name) ? `<span class="translating">${hl(g.name,q)}</span>` : hl(g.name,q)}</div>
      <div class="ai-cause">${
        g.type==='Trouble'
          ? hl([g.tr_site, g.tr_unit, (g.tr_keywords||[]).join(' · ')].filter(Boolean).join(' / ') || (g.tr_desc||'').split('\n')[0], q)
          : hl((g.direct_cause||'').split('\n')[0], q)
      }</div>
      ${hasActs?`<div class="ai-acts"><span class="hc">조치방안 ${acts.length}건</span>${sdot}</div>`:''}
    </div>`;
  }).join('');

  renderPagination(filtered.length);
}

function renderPagination(total){
  const bar = document.getElementById('pg-bar');
  if(!bar) return;

  if(total <= PG_THRESHOLD){
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const totalPages = Math.ceil(total / pgSize);

  // 페이지 정보
  const start = (pgCur-1)*pgSize + 1;
  const end   = Math.min(pgCur*pgSize, total);
  document.getElementById('pg-info').textContent = `${start}-${end} / ${total}`;

  // 이전/다음 버튼
  document.getElementById('pg-prev').disabled = pgCur <= 1;
  document.getElementById('pg-next').disabled = pgCur >= totalPages;

  // 페이지 번호 버튼 (최대 5개 표시)
  const range = 2;
  let pages = [];
  for(let i = Math.max(1, pgCur-range); i <= Math.min(totalPages, pgCur+range); i++) pages.push(i);
  // 첫/끝 페이지 항상 포함
  if(!pages.includes(1)) pages = [1, '…', ...pages];
  if(!pages.includes(totalPages)) pages = [...pages, '…', totalPages];

  document.getElementById('pg-nums').innerHTML = pages.map(p =>
    p === '…'
      ? `<span style="color:var(--text3);padding:0 2px;font-size:12px">…</span>`
      : `<button class="pg-num${p===pgCur?' on':''}" onclick="goPage(${p})">${p}</button>`
  ).join('');

  // 페이지 크기 선택 동기화
  const sel = document.getElementById('pg-size');
  if(sel) sel.value = pgSize;
}

function changePage(dir){
  const total = filtered.length;
  const totalPages = Math.ceil(total / pgSize);
  pgCur = Math.max(1, Math.min(totalPages, pgCur + dir));
  renderList(document.getElementById('srch').value);
  // 목록 상단으로 스크롤
  document.getElementById('alarm-list').scrollTop = 0;
}

function goPage(p){
  if(typeof p !== 'number') return;
  pgCur = p;
  renderList(document.getElementById('srch').value);
  document.getElementById('alarm-list').scrollTop = 0;
}

function changePageSize(val){
  pgSize = parseInt(val);
  pgCur  = 1;
  renderList(document.getElementById('srch').value);
}

// ══════════════════════════════════════
//  SELECT ALARM
// ══════════════════════════════════════
function selAlarm(id){
  const a=alarms.find(x=>x.id===id); if(!a) return;
  curAlarm=a;

  // 페이지네이션 중일 때 해당 알람이 현재 페이지에 없으면 해당 페이지로 이동
  if(filtered.length > PG_THRESHOLD){
    const idx = filtered.findIndex(x=>x.id===id);
    if(idx >= 0){
      const targetPage = Math.floor(idx / pgSize) + 1;
      if(targetPage !== pgCur){
        pgCur = targetPage;
        renderList(document.getElementById('srch').value);
      }
    }
  }

  document.querySelectorAll('.ai').forEach(el=>el.classList.remove('cur'));
  const el=document.getElementById('ai-'+id);
  if(el){ el.classList.add('cur'); el.scrollIntoView({block:'nearest',behavior:'smooth'}); }
  const k=ak(a);
  recentViewed=[k,...recentViewed.filter(x=>x!==k)].slice(0,10);
  sS('vam_recent',recentViewed); renderRecent();
  logSearch(k);
  if(allActOpen&&window.innerWidth>768) closeAllActions();
  renderDetail(a);
  document.getElementById('dp').classList.add('open');
  showDpResizer(true);
  try{
    const u=new URL(location.href);
    u.searchParams.set('v',a.vision); u.searchParams.set('t',a.type); u.searchParams.set('c',a.code);
    history.replaceState({},'',u);
  } catch{}
  if(window.innerWidth<=768){
    document.getElementById('mob-sheet').style.display='none';
  }
}

// ══════════════════════════════════════
//  RENDER DETAIL
// ══════════════════════════════════════
function renderDetail(a){
  const g=ga(a), k=ak(a), isFav=favorites.includes(k);
  const acts=(actions[k]||[]).filter(Boolean).slice().sort((x,y)=>
    sortDescAct === 'desc' ? new Date(y.date)-new Date(x.date) :
    sortDescAct === 'asc'  ? new Date(x.date)-new Date(y.date) :
    (y.helpful||0)-(x.helpful||0)
  );
  const relLinks=(g.related_alarms||'').split(/[,\n]/).map(s=>{
    const m=s.trim().match(/\d+/); if(!m) return esc(s.trim());
    const code=parseInt(m[0]);
    const rel=alarms.find(x=>x.vision===a.vision&&x.type===a.type&&x.code===code);
    return rel?`<a onclick="selAlarm(${rel.id})">Code ${code}</a>`:esc(s.trim());
  }).filter(Boolean).join(', ');

  const fbSync = fbOnline
    ? `<span class="syncing"><span class="live-dot"></span>실시간 동기화</span>`
    : `<span class="syncing" style="color:var(--yellow)">⚠️ 로컬 저장</span>`;

  document.getElementById('dp-content').innerHTML=`
    <div class="dph">
      <div class="dpm">
        <span class="ct">Code ${g.code}</span>
        <span class="sb ${g.severity}">${g.severity}</span>
        <span class="tt">${g.type}</span>
        <span style="font-size:11px;color:var(--text3)">${g.vision}</span>
      </div>
      <div class="dpt">${enText(g.name)}</div>
      <div class="dpa">
        <button class="btn sm ${isFav?'':'primary'}" onclick="toggleFav('${k}')">${isFav?'⭐ 해제':'☆ 즐겨찾기'}</button>
        ${isAdmin?`<button class="btn sm" onclick="showEF('${k}')">✏️ 알람정보 수정</button>`:''}
        ${a.isCustom?`<button class="btn sm" onclick="openEditAlarmModal(${a.id})" style="background:var(--bg4);border-color:var(--yellow);color:var(--yellow)">${t('alarm_edit')}</button>`:''}
        ${a.isCustom?`<button class="btn sm" onclick="deleteCustomAlarm(${a.id})" style="background:var(--redbg);border-color:var(--red);color:var(--red)">${t('alarm_delete')}</button>`:''}
        <button class="btn sm" onclick="shareLink('${k}')">🔗 공유</button>
        <button class="btn sm ghost" onclick="window.print()">🖨️</button>
        <button class="btn sm ghost" onclick="document.getElementById('dp').classList.remove('open');curAlarm=null;showDpResizer(false);try{const u=new URL(location.href);u.searchParams.delete('v');u.searchParams.delete('t');u.searchParams.delete('c');history.replaceState({},'',u);}catch{}">✕</button>
      </div>
    </div>
    <div class="dpb">
      <div>
        <div class="st">기본 정보</div>
        ${g.type==='Trouble'?`
        <div class="ig" style="margin-top:9px">
          ${g.tr_site?`<div class="ic"><div class="icl">${t('tr_site')}</div><div class="icv">${esc(g.tr_site)}</div></div>`:''}
          ${g.tr_unit?`<div class="ic"><div class="icl">${t('tr_unit')}</div><div class="icv">${esc(g.tr_unit)}</div></div>`:''}
          <div class="ic"><div class="icl">${t('resolution_time')}</div><div class="icv">${(g.tr_hour||0)+t('hour')+' '+(g.tr_min||0)+t('minute')}</div></div>
          ${g.tr_keywords&&g.tr_keywords.length?`<div class="ic f"><div class="icl">${t('tr_keywords')}</div><div class="icv">${g.tr_keywords.map(kw=>`<span style="background:var(--bg4);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:11px;margin-right:3px">${esc(kw)}</span>`).join('')}</div></div>`:''}
          ${g.tr_desc?`<div class="ic f"><div class="icl">${t('tr_desc')}</div><div class="icv">${enText(g.tr_desc)}</div></div>`:''}
          ${g.direct_cause?`<div class="ic f"><div class="icl">${t('direct_cause')}</div><div class="icv">${enText(g.direct_cause)}</div></div>`:''}
        </div>`:`
        <div class="ig" style="margin-top:9px">
          <div class="ic f"><div class="icl">${t('direct_cause')}</div><div class="icv">${enText(g.direct_cause)}</div></div>
          <div class="ic f"><div class="icl">${t('occurrence')}</div><div class="icv">${enText(g.occurrence)}</div></div>
          <div class="ic f"><div class="icl">${t('influence')}</div><div class="icv">${enText(g.influence)}</div></div>
          <div class="ic"><div class="icl">${t('related_alarms')}</div><div class="icv">${relLinks||'-'}</div></div>
          <div class="ic"><div class="icl">${t('timing')}</div><div class="icv">${enText(g.timing)||'-'}</div></div>
          <div class="ic f"><div class="icl">${t('plc_output')}</div><div class="icv mn">${enText(g.plc_output)||'-'}</div></div>
          <div class="ic f"><div class="icl">${t('related_log')}</div><div class="icv mn" style="font-size:11px">${enText(g.log)||'-'}</div></div>
        </div>`}
        </div>
      </div>
      <div id="ef-area"></div>
      <div>
        <div class="st">
          ${t('actions_history')} <span class="stc">${acts.length}${currentLang==='en'?' items':'건'}</span>
          ${fbSync}
          ${acts.length>1?`<select class="stsort-sel" onchange="changeActSort('${k}',this.value)" style="font-size:11px;background:var(--bg4);border:1px solid var(--border);border-radius:4px;color:var(--text2);padding:2px 5px;font-family:var(--font);cursor:pointer">
            <option value="desc" ${sortDescAct==='desc'?'selected':''}>↑ 최신순</option>
            <option value="asc" ${sortDescAct==='asc'?'selected':''}>↓ 오래된순</option>
            <option value="helpful" ${sortDescAct==='helpful'?'selected':''}>👍 많은순</option>
          </select>`:''}
        </div>
        <div class="al" id="al-${k}" style="margin-top:9px">
          ${acts.length?acts.map((ac,i)=>actCard(ac,k,i,acts)).join('')
            :'<div style="color:var(--text3);font-size:12px;padding:6px 0">아직 등록된 조치방안이 없습니다.</div>'}
        </div>
        <div class="af" style="margin-top:10px">
          <div class="af-tit">${t('action_add_title')}</div>
          <div class="fr">
            <input type="text" id="ac-auth" placeholder="${t('name_required')}" value="${esc(savedAuthor)}" maxlength="20">
            <input type="text" id="ac-site" placeholder="${t('site_optional')}" value="${esc(savedSite)}" maxlength="20">
          </div>
          <textarea id="ac-txt" placeholder="${t('action_placeholder')}" rows="4"></textarea>
          <input type="text" id="ac-link" placeholder="🔗 참고 자료 URL (선택 · 구글드라이브, 사진 링크 등)" style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:6px 9px;width:100%">
          <div class="fr" style="align-items:center">
            <select id="ac-st">
              <option value="">${t('status_unset')}</option>
              <option value="default">${t('status_default')}</option>
              <option value="resolved">${t('status_resolved')}</option>
              <option value="temp">${t('status_temp')}</option>
              <option value="checking">${t('status_checking')}</option>
            </select>
            <button class="btn primary" id="ac-submit-btn" onclick="addAction('${k}')">${t('submit_action')}</button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── ACTION CARD ──
function actCard(ac,k,i,allActs){
  if(!ac) return '';
  const helpful=ac.helpful||0;
  const voted=(gS('vam_voted_'+k,[]))[i];
  const sCls=SCLS[ac.status||'']||'sp none';
  const sLbl=slbl(ac.status);
  const best=helpful>=3&&helpful===Math.max(...allActs.map(a=>a&&a.helpful||0))&&allActs.length>1;
  const linkHtml=ac.link?`<a href="${esc(ac.link)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);display:inline-flex;align-items:center;gap:3px;margin-top:5px;text-decoration:none;background:var(--aglow);padding:2px 8px;border-radius:4px;border:1px solid rgba(79,124,255,.2)">🔗 참고 자료 열기</a>`:'';
  return `<div class="ac${best?' best':''}" id="ac-${k}-${i}">
    ${best?`<span class="best-b">★ Best</span>`:''}
    <div class="ac-meta">
      <span class="ac-auth">${esc(ac.author)}</span>
      ${ac.site?`<span class="ac-site">· ${esc(ac.site)}</span>`:''}
      <span>${ac.date}</span>
      <span style="margin-left:auto;display:flex;gap:4px">
        <button onclick="showEditAction('${k}',${i})" style="background:none;border:1px solid var(--border2);border-radius:4px;color:var(--text3);font-size:10px;padding:1px 7px;cursor:pointer;font-family:var(--font)" title="${t('edit')}">${t('edit')}</button>
        ${isAdmin?`<button onclick="deleteAction('${k}',${i})" style="background:none;border:1px solid rgba(255,77,106,.3);border-radius:4px;color:var(--red);font-size:10px;padding:1px 7px;cursor:pointer;font-family:var(--font)" title="${t('delete_admin')}">${t('delete_admin')}</button>`:''}
      </span>
    </div>
    <div class="ac-txt">${esc(ac.text)}</div>
    ${linkHtml}
    <div class="ac-foot">
      <span class="${sCls}">${sLbl}</span>
      <button class="hb ${voted?'voted':''}" onclick="markHelpful('${k}',${i})">${t('helpful')}${helpful>0?' <b>'+helpful+'</b>':''}</button>
    </div>
  </div>`;
}

function showEditAction(k,idx){
  const ac=actions[k]?.[idx]; if(!ac) return;
  const card=document.getElementById(`ac-${k}-${idx}`); if(!card) return;
  // 이미 편집 중이면 닫기
  const existing=card.querySelector('.ac-edit-form');
  if(existing){ existing.remove(); return; }
  const form=document.createElement('div');
  form.className='ac-edit-form';
  form.style.cssText='margin-top:8px;padding:10px;background:var(--bg4);border-radius:var(--r);border:1px solid var(--border2);display:flex;flex-direction:column;gap:6px';
  form.innerHTML=`
    <div style="font-size:10px;color:var(--yellow);font-weight:500">${t('action_edit_title')}</div>
    <textarea id="ea-txt-${k}-${idx}" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:7px;width:100%;min-height:80px;resize:vertical" >${esc(ac.text)}</textarea>
    <input type="text" id="ea-link-${k}-${idx}" placeholder="참고 자료 URL (선택, 구글드라이브·사진 링크 등)" value="${esc(ac.link||'')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:6px 9px;width:100%">
    <div style="display:flex;gap:5px;align-items:center">
      <select id="ea-st-${k}-${idx}" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:5px 8px;flex:1">
        <option value="" ${!ac.status?'selected':''}>${t('status_unset')}</option>
        <option value="default" ${ac.status==='default'?'selected':''}>${t('status_default')}</option>
        <option value="resolved" ${ac.status==='resolved'?'selected':''}>${t('status_resolved')}</option>
        <option value="temp" ${ac.status==='temp'?'selected':''}>${t('status_temp')}</option>
        <option value="checking" ${ac.status==='checking'?'selected':''}>${t('status_checking')}</option>
      </select>
      <button class="btn primary sm" onclick="saveEditAction('${k}',${idx})">${t('submit_action')}</button>
      <button class="btn sm" onclick="this.closest('.ac-edit-form').remove()">${t('cancel')}</button>
    </div>`;
  card.appendChild(form);
}

async function saveEditAction(k,idx){
  const ac=actions[k]?.[idx]; if(!ac) return;
  const txt=document.getElementById(`ea-txt-${k}-${idx}`)?.value.trim();
  const lnk=document.getElementById(`ea-link-${k}-${idx}`)?.value.trim();
  const st=document.getElementById(`ea-st-${k}-${idx}`)?.value;
  if(!txt||txt.length<5){ showToast('5자 이상 입력하세요','err'); return; }
  const before=ac.text.slice(0,60);
  ac.text=txt; ac.link=lnk; ac.status=st;
  ac.edited=new Date().toISOString().slice(0,16).replace('T',' ');
  await saveActions();
  addAudit('조치방안 수정',k,ac.author,before,txt.slice(0,60));
  await saveAudit();
  if(curAlarm) renderDetail(curAlarm);
  renderRight(); if(allActOpen) renderAllActions();
  showToast('수정 완료 ✅','ok');
}

async function deleteAction(k,idx){
  if(!isAdmin){ showToast('관리자 권한이 필요합니다','err'); return; }
  const ac = actions[k]?.[idx];
  if(!ac) return;
  const confirmed = window.confirm(`조치방안을 삭제하시겠습니까?\n\n작성자: ${ac.author}\n내용: ${ac.text.slice(0,50)}${ac.text.length>50?'…':''}`);
  if(!confirmed) return;

  actions[k].splice(idx, 1);
  if(actions[k].length === 0) delete actions[k];

  // 로컬 저장
  sS('vam_actions', actions);

  // Firebase: 해당 키만 정확히 업데이트/삭제
  if(fbOnline){
    const fbKey = k.replace(/[.#$[\]]/g,'_');
    if(actions[k]){
      // 남은 항목 있으면 업데이트
      await fbPatch('actions/' + fbKey, actions[k]);
    } else {
      // 빈 배열이면 Firebase에서 키 완전 삭제
      await fbDelete('actions/' + fbKey);
    }
  }

  addAudit('조치방안 삭제', k, 'Admin', ac.text.slice(0,60), '');
  await saveAudit();
  updateStats();
  if(curAlarm) renderDetail(curAlarm);
  renderList(document.getElementById('srch').value);
  renderRight();
  if(allActOpen) renderAllActions();
  showToast('조치방안이 삭제되었습니다', 'ok');
}

function changeActSort(k, val){
  sortDescAct = val;
  if(curAlarm) renderDetail(curAlarm);
}

async function markHelpful(k,idx){
  let voted=gS('vam_voted_'+k,[]);
  if(voted[idx]) return;
  voted[idx]=true; sS('vam_voted_'+k,voted);
  if(!actions[k]||!actions[k][idx]) return;
  actions[k][idx].helpful=(actions[k][idx].helpful||0)+1;
  await saveActions();
  if(curAlarm&&ak(curAlarm)===k) renderDetail(curAlarm);
  renderRight(); showToast('도움됐어요 👍','ok');
}

// ══════════════════════════════════════
//  ADD ACTION
// ══════════════════════════════════════
async function addAction(k){
  const author=document.getElementById('ac-auth').value.trim();
  const site=document.getElementById('ac-site').value.trim();
  const text=document.getElementById('ac-txt').value.trim();
  const status=document.getElementById('ac-st').value;
  const link=(document.getElementById('ac-link')?.value||'').trim();
  if(!author){ showToast('이름을 입력하세요','err'); return; }
  if(text.length<5){ showToast('5자 이상 입력하세요','err'); return; }
  const btn=document.getElementById('ac-submit-btn');
  if(btn){ btn.disabled=true; btn.textContent='저장 중...'; }
  sS('vam_author',author); sS('vam_site',site);
  savedAuthor=author; savedSite=site;
  if(!actions[k]) actions[k]=[];
  const now=new Date();
  const dateStr=now.toISOString().slice(0,10)+' '+now.toTimeString().slice(0,5);
  const entry={author,site,text,date:dateStr,status,helpful:0};
  if(link) entry.link=link;
  actions[k].push(entry);
  await saveActions();
  addAudit('조치방안 등록',k,author,'',text.slice(0,60));
  await saveAudit();
  updateStats();
  if(curAlarm) renderDetail(curAlarm);
  renderList(document.getElementById('srch').value);
  renderRight();
  if(allActOpen) renderAllActions();
  showToast(fbOnline?'Firebase에 저장됨 ✅':'로컬에 저장됨','ok');
}

// ══════════════════════════════════════
//  EDIT (Admin)
// ══════════════════════════════════════
function showEF(k){
  if(!isAdmin){ showToast('관리자 권한 필요','err'); return; }
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  const g=ga(a);
  document.getElementById('ef-area').innerHTML=`
    <div class="ef">
      <div style="font-size:11px;font-weight:500;color:var(--yellow);margin-bottom:4px">✏️ 관리자 수정 모드</div>
      <div class="efr">
        <div><label>알람명</label><textarea id="ef-name" rows="1">${esc(g.name)}</textarea></div>
        <div><label>심각도</label>
          <select class="fc" id="ef-sev" style="margin:0;font-size:12px;padding:6px 9px">
            <option value="Critical" ${g.severity==='Critical'?'selected':''}>Critical</option>
            <option value="Warning" ${g.severity==='Warning'?'selected':''}>Warning</option>
            <option value="Info" ${g.severity==='Info'?'selected':''}>Info</option>
          </select>
        </div>
      </div>
      <label>직접 원인</label><textarea id="ef-dir" rows="2">${esc(g.direct_cause)}</textarea>
      <label>발생 조건</label><textarea id="ef-occ" rows="2">${esc(g.occurrence)}</textarea>
      <label>영향 조건</label><textarea id="ef-inf" rows="2">${esc(g.influence)}</textarea>
      <label>관련 알람</label><textarea id="ef-rel" rows="1">${esc(g.related_alarms)}</textarea>
      <label>PLC 출력</label><textarea id="ef-plc" rows="1">${esc(g.plc_output)}</textarea>
      <div style="display:flex;gap:6px;margin-top:3px">
        <button class="btn primary sm" onclick="saveEdit('${k}')">저장</button>
        <button class="btn sm" onclick="document.getElementById('ef-area').innerHTML=''">취소</button>
      </div>
    </div>`;
}

async function saveEdit(k){
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  const g=ga(a);
  const nd={
    name:document.getElementById('ef-name').value.trim(),
    severity:document.getElementById('ef-sev').value,
    direct_cause:document.getElementById('ef-dir').value.trim(),
    occurrence:document.getElementById('ef-occ').value.trim(),
    influence:document.getElementById('ef-inf').value.trim(),
    related_alarms:document.getElementById('ef-rel').value.trim(),
    plc_output:document.getElementById('ef-plc').value.trim()
  };
  const before=JSON.stringify({name:g.name,severity:g.severity});
  if(!alarmEdits[k]) alarmEdits[k]={};
  Object.assign(alarmEdits[k],nd);
  await saveAlarmEdits();
  addAudit('알람 정보 수정',k,'Admin',before,JSON.stringify({name:nd.name,severity:nd.severity}));
  await saveAudit();
  renderDetail(a); renderList(document.getElementById('srch').value); renderRight();
  showToast('수정 완료','ok');
}

// ══════════════════════════════════════
//  ALL ACTIONS VIEW
// ══════════════════════════════════════
function openAllActions(){
  allActOpen=true;
  if(window.innerWidth>768){
    document.getElementById('dp').classList.remove('open');
    document.getElementById('aap').classList.add('open');
    const ld=document.getElementById('aap-live'); if(ld) ld.style.display=fbOnline?'inline-block':'none';
  } else {
    mobNav('acts', document.querySelectorAll('.mn')[2]);
    return;
  }
  renderAllActions();
}
function closeAllActions(){ allActOpen=false; document.getElementById('aap').classList.remove('open'); }
function renderAllActions(mobile=false){
  const vf=mobile?'':document.getElementById('aa-v').value;
  const sf=mobile?'':document.getElementById('aa-s').value;
  const so=mobile?'date-desc':(document.getElementById('aa-o').value||'date-desc');
  let all=[];
  Object.entries(actions).forEach(([k,acts])=>{
    if(!Array.isArray(acts)) return;
    const a=alarms.find(x=>ak(x)===k); if(!a) return;
    if(vf&&a.vision!==vf) return;
    acts.forEach((ac,i)=>{
      if(!ac) return;
      if(sf&&ac.status!==sf) return;
      all.push({...ac,_k:k,_a:a,_i:i});
    });
  });
  all.sort((a,b)=>{
    if(so==='date-asc') return new Date(a.date)-new Date(b.date);
    if(so==='helpful') return (b.helpful||0)-(a.helpful||0);
    return new Date(b.date)-new Date(a.date);
  });
  const cnt=document.getElementById('aa-cnt'); if(cnt) cnt.textContent=`총 ${all.length}건`;
  const html=all.length?all.map(ac=>{
    const g=ga(ac._a);
    const sCls=SCLS[ac.status||'']||'sp none';
    const sLbl=slbl(ac.status);
    return `<div class="api">
      <div class="api-ref" onclick="selAlarm(${ac._a.id});${window.innerWidth>768?'closeAllActions()':''}">
        ${esc(g.vision.replace('Vision',''))} · ${esc(g.type)} · Code ${g.code} — ${esc(g.name)}
      </div>
      <div class="ac-meta">
        <span class="ac-auth">${esc(ac.author)}</span>
        ${ac.site?`<span class="ac-site">· ${esc(ac.site)}</span>`:''}
        <span>${ac.date}</span>
        <span class="${sCls}" style="margin-left:auto">${sLbl}</span>
      </div>
      <div class="ac-txt">${esc(ac.text)}</div>
      ${(ac.helpful||0)>0?`<div style="font-size:10px;color:var(--green);margin-top:4px">👍 ${ac.helpful}</div>`:''}
    </div>`;
  }).join(''):'<div style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center">조치방안이 없습니다</div>';
  if(mobile){ const el=document.getElementById('mob-acts-body'); if(el)el.innerHTML=html; }
  else{ document.getElementById('aap-body').innerHTML=html; }
}

// ══════════════════════════════════════
//  FAVORITES / RECENT
// ══════════════════════════════════════
function toggleFav(k){
  favorites.includes(k) ? (favorites=favorites.filter(x=>x!==k),showToast('즐겨찾기 해제'))
    : (favorites=[k,...favorites], showToast('즐겨찾기 추가 ⭐','ok'));
  sS('vam_favorites',favorites); renderFavorites();
  if(curAlarm&&ak(curAlarm)===k) renderDetail(curAlarm);
  renderList(document.getElementById('srch').value);
}
function renderFavorites(){
  const list=document.getElementById('fav-list');
  if(!favorites.length){ list.innerHTML='<div style="font-size:11px;color:var(--text3);padding:3px 6px">없음</div>'; return; }
  list.innerHTML=favorites.slice(0,8).map(k=>{
    const p=k.split('_');
    return `<div class="si" onclick="jumpTo('${k}')"><span style="color:var(--yellow)">★</span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
  }).join('');
}
function renderRecent(){
  const list=document.getElementById('recent-list');
  if(!recentViewed.length){ list.innerHTML='<div style="font-size:11px;color:var(--text3);padding:3px 6px">없음</div>'; return; }
  list.innerHTML=recentViewed.slice(0,8).map(k=>{
    const p=k.split('_');
    return `<div class="si" onclick="jumpTo('${k}')"><span class="si-dot"></span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
  }).join('');
}
function jumpTo(k){
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  document.getElementById('sel-v').value=a.vision;
  document.getElementById('sel-t').value=a.type;
  document.getElementById('srch').value='';
  document.getElementById('srch-clr').classList.remove('show');
  sevFilter='';
  document.querySelectorAll('#sidebar .pills .pill').forEach(p=>p.classList.remove('on'));
  document.querySelector('#sidebar .pills .pill').classList.add('on');
  applyFilters(); setTimeout(()=>selAlarm(a.id), 60);
}

// ══════════════════════════════════════
//  SEARCH LOG & RANKING
// ══════════════════════════════════════
function logSearch(key){
  searchLog.push({key,ts:Date.now()});
  if(searchLog.length>2000) searchLog=searchLog.slice(-1000);
  saveSearchLog();
}
function getRanking(period){
  const cut=period==='7d'?Date.now()-7*24*3600*1000:0;
  const cnt={};
  searchLog.filter(s=>s.ts>=cut).forEach(s=>{ cnt[s.key]=(cnt[s.key]||0)+1; });
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,10);
}
function setRankP(btn,p){
  rankPeriod=p;
  document.querySelectorAll('.rtt').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.rtt').forEach(b=>{ if(b.textContent===btn.textContent) b.classList.add('on'); });
  renderRight();
}

// ══════════════════════════════════════
//  RENDER RIGHT PANEL
// ══════════════════════════════════════
function renderRight(){
  updateStats();
  // 패널 제목 i18n 적용
  const rpts = document.querySelectorAll('.rpt');
  if(rpts[0]) rpts[0].childNodes[0].textContent = t('top10')+' ';
  if(rpts[1]) rpts[1].textContent = t('recent_actions');
  if(rpts[2]) rpts[2].childNodes[0].textContent = t('edit_history')+' ';
  // 랭킹 기간 버튼
  const btn7d  = document.getElementById('rank-btn-7d');
  const btnAll = document.getElementById('rank-btn-all');
  if(btn7d)  btn7d.textContent  = t('rank_7d');
  if(btnAll) btnAll.textContent = t('rank_all');
  // 전체 보기 버튼
  const viewAllBtn = document.querySelector('#rp .btn[onclick="openAllActions()"]');
  if(viewAllBtn) viewAllBtn.textContent = t('view_all');
  const viewAllBtn2 = document.querySelector('.rtt[onclick="openHistModal()"]');
  if(viewAllBtn2) viewAllBtn2.textContent = t('view_all2');
  // Ranking
  const ranking=getRanking(rankPeriod);
  const mx=ranking[0]?.[1]||1;
  document.getElementById('rank-list').innerHTML=ranking.length?ranking.map(([k,cnt],i)=>{
    const p=k.split('_');
    const lbl=p.length>=3?p[0].replace('Vision','')+' · C'+p[2]:k;
    const pct=Math.round(cnt/mx*100);
    return `<div class="ri" onclick="jumpTo('${k}')">
      <span class="rn">${i+1}</span>
      <div style="flex:1;overflow:hidden"><div class="rt-tx" title="${esc(lbl)}">${esc(lbl)}</div><div class="rbar" style="width:${pct}%"></div></div>
      <span class="rt-cn">${cnt}</span>
    </div>`;
  }).join(''):`<div style="font-size:11px;color:var(--text3)">${t('rank_no_data')}</div>`;

  // Recent actions - 10개로 확장
  const allActs=[];
  Object.entries(actions).forEach(([k,acts])=>{
    if(!Array.isArray(acts)) return;
    const a=alarms.find(x=>ak(x)===k); if(!a) return;
    acts.forEach(ac=>{ if(ac) allActs.push({...ac,_a:a,_k:k}); });
  });
  allActs.sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('recent-acts').innerHTML=allActs.slice(0,10).map(ac=>{
    const g=ga(ac._a);
    const sCls=SCLS[ac.status||'']||'sp none';
    return `<div class="hi" onclick="jumpTo('${ac._k}')">
      <span class="hi-t">${g.vision.replace('Vision','')} · Code ${g.code}</span>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc((ac.text||'').slice(0,45))}${(ac.text||'').length>45?'…':''}</div>
      <div class="hi-m">${ac.date} · ${esc(ac.author)} <span class="${sCls}" style="font-size:9px;padding:1px 5px">${slbl(ac.status)}</span></div>
    </div>`;
  }).join('')||`<div style="font-size:11px;color:var(--text3)">${t('none')}</div>`;

  // Audit - 10개로 확장, 등록/수정/삭제 아이콘 추가
  const typeIconKo={'조치방안 등록':'✅','조치방안 수정':'✏️','조치방안 삭제':'🗑️','알람 정보 수정':'🔧','Excel 업로드':'📤','알람 추가':'➕'};
  const typeIconEn={'조치방안 등록':'✅','조치방안 수정':'✏️','조치방안 삭제':'🗑️','알람 정보 수정':'🔧','Excel 업로드':'📤','알람 추가':'➕'};
  const typeLabelEn={'조치방안 등록':'Action Added','조치방안 수정':'Action Edited','조치방안 삭제':'Action Deleted','알람 정보 수정':'Alarm Edited','Excel 업로드':'Excel Upload','알람 추가':'Alarm Added'};
  document.getElementById('hist-list').innerHTML=auditLog.slice(-10).reverse().map(h=>{
    const icon = typeIconKo[h.type]||'📝';
    const label = currentLang==='en' ? (typeLabelEn[h.type]||h.type) : h.type;
    return `<div class="hi">
      <span class="hi-t">${icon} ${esc(label)}</span>
      <div style="font-size:10px;color:var(--text2);margin-top:1px">${esc(h.target.split('_').slice(0,3).join(' / '))}</div>
      <div class="hi-m">${esc(h.date)} · ${esc(h.user)}</div>
    </div>`;
  }).join('')||`<div style="font-size:11px;color:var(--text3)">${currentLang==='en'?'None':'없음'}</div>`;
}

// ══════════════════════════════════════
//  AUDIT LOG
// ══════════════════════════════════════
function addAudit(type,target,user,before,after){
  const now=new Date();
  const date=now.toISOString().slice(0,10)+' '+now.toTimeString().slice(0,5);
  auditLog.push({type,target,user,before,after,date});
  if(auditLog.length>500) auditLog=auditLog.slice(-300);
}
function openHistModal(){ renderHistModal(); document.getElementById('hist-mo').classList.add('open'); }
function renderHistModal(){
  const tf=document.getElementById('hm-f')?.value||'';
  const fl=tf?auditLog.filter(h=>h.type===tf):auditLog;
  document.getElementById('hist-mo-list').innerHTML=fl.slice().reverse().map(h=>`
    <div class="ac">
      <div class="ac-meta"><span class="ac-auth">${esc(h.type)}</span><span>${esc(h.date)}</span><span>${esc(h.user)}</span></div>
      <div class="ac-txt">${esc(h.target.split('_').slice(0,3).join(' / '))}</div>
      ${h.after&&h.after.length<80?`<div style="font-size:10px;color:var(--text3);margin-top:3px">${esc(h.after)}</div>`:''}
    </div>`).join('')||'<div style="color:var(--text3);font-size:12px">없음</div>';
}

// ══════════════════════════════════════
//  FIREBASE SETUP UI
// ══════════════════════════════════════
function openFbSetup(){
  document.getElementById('fb-url-inp').value=FB_URL||'';
  document.getElementById('fb-test-result').style.display='none';
  document.getElementById('fb-setup').classList.add('open');
}
function closeFbSetup(){ document.getElementById('fb-setup').classList.remove('open'); }

async function testFbConnection(){
  const url=document.getElementById('fb-url-inp').value.trim().replace(/\/$/,'');
  if(!url){ showToast('URL을 입력하세요','err'); return; }
  const res=document.getElementById('fb-test-result');
  res.style.display='block';
  res.style.background='var(--bg4)'; res.style.color='var(--text3)';
  res.textContent='⏳ 연결 테스트 중...';
  try{
    const r=await fetch(url+'/.json?shallow=true');
    if(r.ok){
      res.style.background='var(--greenbg)'; res.style.color='var(--green)';
      res.textContent='✅ 연결 성공! 저장 버튼을 눌러 적용하세요.';
    } else {
      res.style.background='var(--redbg)'; res.style.color='var(--red)';
      res.textContent='❌ 연결 실패 (HTTP '+r.status+'). URL과 보안 규칙을 확인하세요.';
    }
  } catch(e){
    res.style.background='var(--redbg)'; res.style.color='var(--red)';
    res.textContent='❌ 연결 실패: '+e.message;
  }
}

async function saveFbConfig(){
  const url = document.getElementById('fb-url-inp').value.trim().replace(/\/+$/, '');
  if(!url){ showToast('URL을 입력하세요','err'); return; }
  FB_URL = url;
  localStorage.setItem('vam_fb_url', url);
  fbOnline = false;
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  closeFbSetup();
  showToast('Firebase 연결 중...', '');
  await initFirebase();
}

// ══════════════════════════════════════
//  SHARE / PRINT / ADMIN
// ══════════════════════════════════════
// ══════════════════════════════════════
//  ALARM ADD / EDIT / DELETE (Custom)
// ══════════════════════════════════════
function onNaTypeChange(){
  const type = document.getElementById('na-type').value;
  const isTrouble = type === 'Trouble';
  document.getElementById('na-normal-fields').style.display = isTrouble ? 'none' : '';
  document.getElementById('na-trouble-fields').style.display = isTrouble ? '' : 'none';
}

// 사이트 드롭다운 렌더링
function renderSiteSelect(selId='na-site', selectedSite=''){
  const el = document.getElementById(selId);
  if(!el) return;
  el.innerHTML = `<option value="">-- 선택 --</option>`
    + siteUnits.map(su=>`<option value="${su.site}"${su.site===selectedSite?' selected':''}>${su.site} (${su.units.length}개)</option>`).join('');
}

// 호기 드롭다운 렌더링 (사이트 선택 후)
function renderUnitSelect(site, selId='na-unit', selectedUnit=''){
  const el = document.getElementById(selId);
  if(!el) return;
  const su = siteUnits.find(x=>x.site===site);
  if(!su || !su.units.length){
    el.innerHTML = `<option value="">-- 호기 없음 --</option>`;
    return;
  }
  el.innerHTML = `<option value="">-- 선택 --</option>`
    + su.units.map(u=>`<option value="${u}"${u===selectedUnit?' selected':''}>${u}</option>`).join('');
}

function onNaSiteChange(){
  const site = document.getElementById('na-site').value;
  renderUnitSelect(site);
  const hint = document.getElementById('na-site-hint');
  if(hint){
    const su = siteUnits.find(x=>x.site===site);
    hint.textContent = su ? `호기 ${su.units.length}개` : '';
  }
}

// 기존 자유입력 핸들러 (호환성 유지 - 더 이상 사용 안 함)
function onNaSiteInput(el){ el.value = el.value.toUpperCase(); }
function onNaUnitInput(el){ el.value = el.value.toUpperCase(); }

function renderKeywordPreview(){
  const val = document.getElementById('na-keywords').value;
  const tags = val.split(',').map(s=>s.trim()).filter(Boolean);
  document.getElementById('na-keyword-tags').innerHTML = tags.map(t=>
    `<span style="background:var(--bg4);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text2)">${t}</span>`
  ).join('');
}

function openAddAlarmModal(){
  // 추가 모드 초기화
  document.getElementById('na-edit-id').value = '';
  document.getElementById('add-alarm-mo-title').textContent = '➕ 알람 / 트러블 추가';
  document.getElementById('na-submit-btn').textContent = '➕ 등록';
  ['na-code','na-name','na-cause','na-occur','na-infl','na-related',
   'na-site','na-unit','na-hour','na-min','na-keywords','na-desc'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('na-sev').value='Warning';
  document.getElementById('na-sev-t').value='Warning';
  document.getElementById('na-keyword-tags').innerHTML='';
  document.getElementById('na-site-hint').textContent='';
  document.getElementById('na-unit-hint').textContent='';
  renderSiteSelect();  // 사이트 드롭다운 초기화
  renderUnitSelect(''); // 호기 드롭다운 초기화
  renderVisionSelects();
  onNaTypeChange();
  document.getElementById('add-alarm-mo').classList.add('open');
}

function openEditAlarmModal(id){
  const a = alarms.find(x=>x.id===id);
  if(!a||!a.isCustom){ showToast('기본 알람은 수정할 수 없습니다','err'); return; }
  document.getElementById('na-edit-id').value = id;
  document.getElementById('add-alarm-mo-title').textContent = '✏️ 알람 수정';
  document.getElementById('na-submit-btn').textContent = '💾 저장';
  renderVisionSelects();
  document.getElementById('na-vision').value = a.vision;
  document.getElementById('na-type').value = a.type;
  document.getElementById('na-code').value = a.code;
  document.getElementById('na-name').value = a.name;
  document.getElementById('na-cause').value = a.direct_cause||'';
  document.getElementById('na-occur').value = a.occurrence||'';
  document.getElementById('na-infl').value = a.influence||'';
  document.getElementById('na-sev').value = a.severity||'Warning';
  document.getElementById('na-related').value = a.related_alarms||'';
  // Trouble 필드
  const editSite = a.tr_site||'';
  const editUnit = a.tr_unit||'';
  renderSiteSelect('na-site', editSite);
  renderUnitSelect(editSite, 'na-unit', editUnit);
  if(editSite){
    const hint = document.getElementById('na-site-hint');
    const su = siteUnits.find(x=>x.site===editSite);
    if(hint && su) hint.textContent = `호기 ${su.units.length}개`;
  }
  document.getElementById('na-hour').value = a.tr_hour||0;
  document.getElementById('na-min').value = a.tr_min||0;
  document.getElementById('na-keywords').value = (a.tr_keywords||[]).join(', ');
  document.getElementById('na-desc').value = a.tr_desc||'';
  document.getElementById('na-sev-t').value = a.severity||'Warning';
  renderKeywordPreview();
  onNaTypeChange();
  document.getElementById('add-alarm-mo').classList.add('open');
}

async function submitAlarmModal(){
  const editId = document.getElementById('na-edit-id').value;
  if(editId) await saveEditAlarm(parseInt(editId));
  else await addNewAlarm();
}

async function addNewAlarm(){
  const vision = document.getElementById('na-vision').value;
  const type   = document.getElementById('na-type').value;
  const codeVal= document.getElementById('na-code').value.trim();
  const name   = document.getElementById('na-name').value.trim();
  const isTrouble = type === 'Trouble';

  if(!name){ showToast('알람명/이슈명을 입력하세요','err'); return; }

  let code = codeVal ? parseInt(codeVal) : null;
  if(!code){
    const existCodes = alarms.filter(a=>a.vision===vision&&a.type===type).map(a=>a.code);
    code = Math.max(9000, ...existCodes.filter(c=>c>=9000).concat([9000])) + 1;
  }
  const dup = alarms.find(a=>a.vision===vision&&a.type===type&&a.code===code);
  if(dup){ showToast(`이미 존재하는 코드입니다 (${vision} ${type} C${code})`,'err'); return; }

  const newId = Math.max(...alarms.map(a=>a.id).concat([0])) + 1;
  const newAlarm = {
    id:newId, vision, type, code, name,
    direct_cause: isTrouble?'':document.getElementById('na-cause').value.trim(),
    occurrence:   isTrouble?'':document.getElementById('na-occur').value.trim(),
    influence:    isTrouble?'':document.getElementById('na-infl').value.trim(),
    related_alarms: isTrouble?'':document.getElementById('na-related').value.trim(),
    plc_output:'', timing:'', log:'',
    severity: isTrouble ? document.getElementById('na-sev-t').value : document.getElementById('na-sev').value,
    isCustom: true
  };
  if(isTrouble){
    newAlarm.tr_site     = document.getElementById('na-site').value.trim().toUpperCase();
    newAlarm.tr_unit     = document.getElementById('na-unit').value.trim().toUpperCase();
    newAlarm.tr_hour     = parseInt(document.getElementById('na-hour').value)||0;
    newAlarm.tr_min      = parseInt(document.getElementById('na-min').value)||0;
    newAlarm.tr_keywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    newAlarm.tr_desc     = document.getElementById('na-desc').value.trim();
  }

  customAlarms.push(newAlarm);
  await saveCustomAlarms();
  rebuildAlarms();
  addAudit('알람 추가', ak(newAlarm), '사용자', '', name);
  await saveAudit();
  closeModal('add-alarm-mo');
  applyFilters(); updateStats(); renderRight();
  showToast(`등록됨: ${vision.replace('Vision','')} ${type} C${code}`, 'ok');
  setTimeout(()=>selAlarm(newId), 200);
}

async function saveEditAlarm(id){
  const idx = customAlarms.findIndex(a=>a.id===id);
  if(idx<0){ showToast('수정할 알람을 찾을 수 없습니다','err'); return; }
  const a = customAlarms[idx];
  const isTrouble = document.getElementById('na-type').value === 'Trouble';

  a.vision = document.getElementById('na-vision').value;
  a.type   = document.getElementById('na-type').value;
  a.name   = document.getElementById('na-name').value.trim();
  a.severity = isTrouble ? document.getElementById('na-sev-t').value : document.getElementById('na-sev').value;
  if(!isTrouble){
    a.direct_cause    = document.getElementById('na-cause').value.trim();
    a.occurrence      = document.getElementById('na-occur').value.trim();
    a.influence       = document.getElementById('na-infl').value.trim();
    a.related_alarms  = document.getElementById('na-related').value.trim();
    delete a.tr_site; delete a.tr_unit; delete a.tr_hour; delete a.tr_min; delete a.tr_keywords; delete a.tr_desc;
  } else {
    a.tr_site     = document.getElementById('na-site').value.trim().toUpperCase();
    a.tr_unit     = document.getElementById('na-unit').value.trim().toUpperCase();
    a.tr_hour     = parseInt(document.getElementById('na-hour').value)||0;
    a.tr_min      = parseInt(document.getElementById('na-min').value)||0;
    a.tr_keywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    a.tr_desc     = document.getElementById('na-desc').value.trim();
  }

  customAlarms[idx] = a;
  await saveCustomAlarms();
  rebuildAlarms();
  addAudit('알람 수정', ak(a), '사용자', '', a.name);
  await saveAudit();
  closeModal('add-alarm-mo');
  applyFilters(); updateStats(); renderRight();
  if(curAlarm&&curAlarm.id===id){ const upd=alarms.find(x=>x.id===id); if(upd) renderDetail(upd); }
  showToast('알람 수정 완료 ✅', 'ok');
}

async function deleteCustomAlarm(id){
  const a = alarms.find(x=>x.id===id);
  if(!a||!a.isCustom){ showToast('기본 알람은 삭제할 수 없습니다','err'); return; }
  if(!confirm(`알람을 삭제하시겠습니까?\n\n${a.vision} ${a.type} C${a.code}\n${a.name}`)){ return; }

  customAlarms = customAlarms.filter(x=>x.id!==id);
  await saveCustomAlarms();
  rebuildAlarms();
  // 해당 알람의 조치방안도 삭제
  const k=ak(a);
  if(actions[k]){ delete actions[k]; await saveActions(); }
  addAudit('알람 삭제', k, '사용자', a.name, '');
  await saveAudit();
  if(curAlarm&&curAlarm.id===id){ curAlarm=null; document.getElementById('detail').innerHTML='<div class="empty-s"><div class="empty-ico">🔍</div><div>알람을 선택하세요</div></div>'; }
  applyFilters(); updateStats(); renderRight();
  showToast('알람 삭제됨', 'ok');
}

// ══════════════════════════════════════
//  VISION / TYPE / SITE MANAGE (Admin)
// ══════════════════════════════════════
let vmCurrentSite = '';

function openVisionManage(){
  if(!isAdmin){ showToast('Admin 권한이 필요합니다','err'); return; }
  switchVmTab('vision');
  document.getElementById('vision-manage-mo').classList.add('open');
}

function switchVmTab(tab){
  ['vision','type','site'].forEach(t=>{
    document.getElementById(`vm-tab-${t}`)?.classList.toggle('on', t===tab);
    const pane=document.getElementById(`vm-pane-${t}`);
    if(pane) pane.style.display = t===tab?'':'none';
  });
  if(tab==='vision') renderVisionManageModal();
  if(tab==='type')   renderTypeManageModal();
  if(tab==='site')   renderSiteManageModal();
}

function renderVisionManageModal(){
  const base=['NotchingVision','FoilVision','DelaminationVision','NGVision'];
  document.getElementById('vm-vision-list').innerHTML=[
    ...base.map(v=>`<div class="vm-item"><span>${v}</span><span style="font-size:10px;color:var(--text3)">기본</span></div>`),
    ...customVisions.map((v,i)=>`<div class="vm-item"><span>${v}</span><button onclick="deleteCustomVision(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`)
  ].join('');
}

function renderTypeManageModal(){
  const base=['HOST','Vision','Trouble'];
  document.getElementById('vm-type-list').innerHTML=[
    ...base.map(t=>`<div class="vm-item"><span>${t}</span><span style="font-size:10px;color:var(--text3)">기본</span></div>`),
    ...customTypes.map((t,i)=>`<div class="vm-item"><span>${t}</span><button onclick="deleteCustomType(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`)
  ].join('');
}

function renderSiteManageModal(){
  document.getElementById('vm-site-list').innerHTML=siteUnits.map((su,i)=>
    `<div class="vm-item ${su.site===vmCurrentSite?'on':''}" style="${su.site===vmCurrentSite?'border-color:var(--accent);background:var(--bg4)':''}" onclick="selectVmSite('${su.site}')">
      <span style="cursor:pointer;flex:1">${su.site}</span>
      <span style="font-size:10px;color:var(--text3)">${su.units.length}개</span>
      <button onclick="event.stopPropagation();deleteSite(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer;margin-left:4px">🗑️</button>
    </div>`
  ).join('')||`<div style="font-size:11px;color:var(--text3)">사이트 없음</div>`;

  const suSel=siteUnits.find(x=>x.site===vmCurrentSite);
  document.getElementById('vm-selected-site').textContent=vmCurrentSite?`— ${vmCurrentSite}`:'';
  document.getElementById('vm-unit-add-row').style.display=vmCurrentSite?'flex':'none';
  document.getElementById('vm-unit-list').innerHTML=vmCurrentSite
    ? (suSel?.units.map((u,i)=>
        `<div class="vm-item"><span>${u}</span><button onclick="deleteUnit('${vmCurrentSite}',${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`
      ).join('')||`<div style="font-size:11px;color:var(--text3)">호기 없음</div>`)
    : `<div style="font-size:11px;color:var(--text3)">← 사이트를 선택하세요</div>`;
}

function selectVmSite(site){ vmCurrentSite=site; renderSiteManageModal(); }

async function addCustomVision(){
  const v=document.getElementById('vm-vision-inp').value.trim();
  if(!v){ showToast('Vision명을 입력하세요','err'); return; }
  const base=['NotchingVision','FoilVision','DelaminationVision','NGVision'];
  if([...base,...customVisions].includes(v)){ showToast('이미 존재합니다','err'); return; }
  customVisions.push(v);
  document.getElementById('vm-vision-inp').value='';
  await saveCustomVisions(); renderVisionSelects(); renderVisionManageModal();
  showToast(`Vision 추가됨: ${v}`,'ok');
}
async function deleteCustomVision(i){
  if(!confirm(`"${customVisions[i]}" Vision을 삭제하시겠습니까?`)) return;
  customVisions.splice(i,1);
  await saveCustomVisions(); renderVisionSelects(); renderVisionManageModal();
  showToast('Vision 삭제됨','ok');
}
async function addCustomType(){
  const t=document.getElementById('vm-type-inp').value.trim();
  if(!t){ showToast('타입명을 입력하세요','err'); return; }
  const base=['HOST','Vision','Trouble'];
  if([...base,...customTypes].includes(t)){ showToast('이미 존재합니다','err'); return; }
  customTypes.push(t);
  document.getElementById('vm-type-inp').value='';
  await saveCustomTypes(); renderVisionSelects(); renderTypeManageModal();
  showToast(`타입 추가됨: ${t}`,'ok');
}
async function deleteCustomType(i){
  if(!confirm(`"${customTypes[i]}" 타입을 삭제하시겠습니까?`)) return;
  customTypes.splice(i,1);
  await saveCustomTypes(); renderVisionSelects(); renderTypeManageModal();
  showToast('타입 삭제됨','ok');
}

// ── 사이트 추가/삭제 ──
async function addSite(){
  const v=document.getElementById('vm-site-inp').value.trim().toUpperCase();
  if(!v){ showToast('사이트명을 입력하세요','err'); return; }
  if(siteUnits.find(x=>x.site===v)){ showToast('이미 존재합니다','err'); return; }
  siteUnits.push({site:v,units:[]}); vmCurrentSite=v;
  document.getElementById('vm-site-inp').value='';
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`사이트 추가됨: ${v}`,'ok');
}
async function deleteSite(i){
  const s=siteUnits[i]; if(!s) return;
  if(!confirm(`"${s.site}" 사이트와 호기 ${s.units.length}개를 삭제하시겠습니까?`)) return;
  if(vmCurrentSite===s.site) vmCurrentSite='';
  siteUnits.splice(i,1);
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`사이트 삭제됨: ${s.site}`,'ok');
}

// ── 호기 추가/삭제 ──
async function addUnit(){
  if(!vmCurrentSite){ showToast('사이트를 먼저 선택하세요','err'); return; }
  const raw=document.getElementById('vm-unit-inp').value.trim();
  if(!raw){ showToast('호기명을 입력하세요','err'); return; }
  const su=siteUnits.find(x=>x.site===vmCurrentSite); if(!su) return;
  const added=raw.split(',').map(u=>u.trim()).filter(u=>u&&!su.units.includes(u));
  if(!added.length){ showToast('이미 존재하거나 빈 값입니다','err'); return; }
  su.units.push(...added);
  document.getElementById('vm-unit-inp').value='';
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`호기 추가됨: ${added.join(', ')}`,'ok');
}
async function deleteUnit(site,i){
  const su=siteUnits.find(x=>x.site===site); if(!su) return;
  const u=su.units[i];
  if(!confirm(`"${site} - ${u}" 호기를 삭제하시겠습니까?`)) return;
  su.units.splice(i,1);
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`호기 삭제됨: ${u}`,'ok');
}



function showQR(){
  const base = location.href.split('?')[0];
  // Firebase URL이 설정되어 있으면 파라미터로 포함
  const url = FB_URL ? base + '?fburl=' + encodeURIComponent(FB_URL) : base;
  const displayUrl = url.length > 80 ? url.slice(0,80)+'...' : url;
  document.getElementById('qr-url').textContent = displayUrl;
  document.getElementById('qr-url').title = url;

  const canvas = document.getElementById('qr-canvas');
  canvas.innerHTML = '';
  const c = document.createElement('canvas');
  canvas.appendChild(c);
  if(typeof QRCode !== 'undefined'){
    QRCode.toCanvas(c, url, {width:200, margin:2, color:{dark:'#e8eaf2',light:'#13161d'}}, err=>{
      if(err) canvas.innerHTML=`<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" style="border-radius:8px">`;
    });
  } else {
    canvas.innerHTML=`<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&color=e8eaf2&bgcolor=13161d" style="border-radius:8px">`;
  }

  // Firebase 포함 여부 안내
  const info = document.getElementById('qr-info');
  if(info){
    if(FB_URL){
      info.innerHTML='<span style="color:var(--green)">✅ Firebase URL 포함 — QR 스캔 시 자동 연결됩니다</span>';
    } else {
      info.innerHTML='<span style="color:var(--yellow)">⚠️ Firebase 미설정 — 스캔 후 수동 연결 필요</span>';
    }
  }
  document.getElementById('qr-mo').classList.add('open');
}
function copyQrUrl(){
  const base = location.href.split('?')[0];
  const url = FB_URL ? base + '?fburl=' + encodeURIComponent(FB_URL) : base;
  try{ navigator.clipboard.writeText(url); showToast('URL 복사됨 🔗','ok'); } catch{ prompt('URL:', url); }
}

function shareLink(k){
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  const u=new URL(location.href);
  u.searchParams.set('v',a.vision); u.searchParams.set('t',a.type); u.searchParams.set('c',a.code);
  try{ navigator.clipboard.writeText(u.toString()); showToast('링크 복사됨 🔗','ok'); }
  catch{ prompt('링크를 복사하세요:', u.toString()); }
}
function toggleAdmin(){
  const pw=isAdmin?'':prompt('관리자 비밀번호:');
  if(!isAdmin&&pw!=='admin1234'){ if(pw!==null) showToast('비밀번호 오류','err'); return; }
  isAdmin=!isAdmin;
  const b=document.getElementById('role-b');
  b.textContent=isAdmin?'ADMIN':'VIEWER';
  b.style.background=isAdmin?'rgba(255,179,71,.15)':'var(--aglow)';
  b.style.color=isAdmin?'var(--yellow)':'var(--accent)';
  b.style.borderColor=isAdmin?'rgba(255,179,71,.3)':'rgba(79,124,255,.3)';
  // Vision 관리 버튼 표시/숨김
  const vmb=document.getElementById('vision-manage-btn');
  if(vmb) vmb.style.display=isAdmin?'block':'none';
  // Admin 진입 시 번역 사용량 확인
  if(isAdmin) checkTranslationStatus();
  if(curAlarm) renderDetail(curAlarm);
  showToast(isAdmin?'관리자 모드':'뷰어 모드','ok');
}

// DeepL 번역 사용량 Admin 알림
async function checkTranslationStatus(){
  if(!fbOnline) return;
  try {
    const status = await fbGet('translationStatus');
    if(!status) return;
    const pct = status.usage_pct || 0;
    const warn = status.warning || false;
    if(warn || pct >= 95){
      const msg = `⚠️ DeepL 번역 사용량 ${pct}% (${(status.usage_count||0).toLocaleString()} / ${(status.usage_limit||500000).toLocaleString()}자)\n번역이 중단되었습니다. 다음 달 초기화까지 한글로 표시됩니다.`;
      showToast(`⚠️ DeepL ${pct}% 사용 — 번역 중단됨`, 'err');
      console.warn('[DeepL]', msg);
    } else if(pct >= 80){
      showToast(`⚠️ DeepL 사용량 ${pct}% — 주의 필요`, 'ok');
    } else {
      showToast(`🌐 DeepL 번역 ${pct}% 사용 중`, 'ok');
    }
  } catch(e) { /* 조용히 실패 */ }
}

// ══════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════
function handleUpload(event){
  const files=Array.from(event.target.files);
  const status=document.getElementById('up-status');
  if(!files.length) return;
  status.innerHTML='<span class="spin"></span> 파싱 중...';
  let done=0, added=0;
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        if(typeof XLSX==='undefined') throw new Error('SheetJS 미로드');
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        const fname=file.name.replace(/\.xlsx$/i,'').split('_');
        const vision=fname[0]||'Unknown', type=fname[1]||'HOST';
        let hr=-1;
        data.forEach((row,i)=>{ if(String(row[0]).toLowerCase().includes('code')) hr=i; });
        if(hr<0){ done++; check(); return; }
        data.slice(hr+1).forEach(row=>{
          const code=parseInt(row[0]); if(isNaN(code)) return;
          if(alarms.find(a=>ak(a)===vision+'_'+type+'_'+code)) return;
          const newId=Math.max(...alarms.map(a=>a.id))+1;
          alarms.push({id:newId,vision,type,code,name:String(row[1]||''),
            direct_cause:String(row[2]||''),occurrence:String(row[3]||''),
            influence:String(row[4]||''),related_alarms:String(row[5]||''),
            plc_output:String(row[6]||''),timing:String(row[7]||''),
            log:String(row[8]||''),severity:'Info'});
          added++;
        });
        done++; check();
      } catch(err){ status.innerHTML=`❌ ${file.name}: ${err.message}`; done++; check(); }
    };
    reader.readAsArrayBuffer(file);
  });
  function check(){
    if(done<files.length) return;
    status.innerHTML=`✅ ${files.length}개 파일, 신규 ${added}건 추가`;
    addAudit('Excel 업로드',files.map(f=>f.name).join(','),'User','',`+${added}건`);
    applyFilters(); updateStats(); renderRight();
    showToast(`${added}건 추가됨`,'ok');
  }
}

// ══════════════════════════════════════
//  MODALS / TOAST
// ══════════════════════════════════════
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.addEventListener('click',e=>{ if(e.target.classList.contains('mo')) e.target.classList.remove('open'); });

let toastT;
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='show'+(type?' '+type:'');
  clearTimeout(toastT); toastT=setTimeout(()=>t.className='',2800);
}

// ══════════════════════════════════════
//  MOBILE
// ══════════════════════════════════════
function mobNav(page,btn){
  document.querySelectorAll('.mn').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
  document.getElementById('mob-sheet').style.display='none';
  document.getElementById('dp').classList.remove('open');

  if(page==='filter'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div class="sbl">Vision</div>
      <select class="fc" id="m-v" onchange="syncM()"><option value="">전체</option><option>NotchingVision</option><option>FoilVision</option><option>DelaminationVision</option><option>NGVision</option></select>
      <select class="fc" id="m-t" onchange="syncM()"><option value="">${t('all_type')}</option><option>HOST</option><option>Vision</option></select>
      <div class="sbl">키워드</div>
      <input class="fc" type="text" id="m-q" placeholder="코드 또는 키워드" oninput="syncM()">
      <div class="sbl">심각도</div>
      <div class="pills">
        <button class="pill on" onclick="setMS(this,'')">전체</button>
        <button class="pill rc" onclick="setMS(this,'Critical')">Critical</button>
        <button class="pill yc" onclick="setMS(this,'Warning')">Warning</button>
        <button class="pill bc" onclick="setMS(this,'Info')">Info</button>
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2)">
        <input type="checkbox" id="m-na" onchange="syncM()"> 미등록만
      </label>
      <button class="btn primary" onclick="mobNav('list',document.querySelectorAll('.mn')[0])">결과 보기</button>`;
  } else if(page==='acts'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div style="font-weight:500;font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        📋 전체 조치방안
        ${fbOnline?'<span class="live-dot" title="실시간 동기화"></span>':'<span style="font-size:10px;color:var(--yellow)">⚠️로컬</span>'}
      </div>
      <div id="mob-acts-body"></div>`;
    renderAllActions(true);
  } else if(page==='fav'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div class="sbl">즐겨찾기 ⭐</div>
      ${favorites.length?favorites.map(k=>{
        const p=k.split('_');
        return `<div class="si" style="background:var(--bg3);border-radius:var(--r);border:1px solid var(--border)" onclick="jumpTo('${k}');mobNav('list',document.querySelectorAll('.mn')[0])"><span style="color:var(--yellow)">★</span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
      }).join(''):'<div style="color:var(--text3);font-size:12px">없음</div>'}
      <div class="sbl" style="margin-top:12px">최근 조회</div>
      ${recentViewed.slice(0,5).map(k=>{
        const p=k.split('_');
        return `<div class="si" onclick="jumpTo('${k}');mobNav('list',document.querySelectorAll('.mn')[0])"><span class="si-dot"></span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
      }).join('')||'<div style="color:var(--text3);font-size:12px">없음</div>'}
      <button class="btn" style="margin-top:12px" onclick="mobNav('list',document.querySelectorAll('.mn')[0])">← 목록으로</button>`;
  }
}
function syncM(){
  const v=document.getElementById('m-v')?.value||'';
  const t=document.getElementById('m-t')?.value||'';
  const q=document.getElementById('m-q')?.value||'';
  const na=document.getElementById('m-na')?.checked||false;
  document.getElementById('sel-v').value=v;
  document.getElementById('sel-t').value=t;
  document.getElementById('srch').value=q;
  document.getElementById('noact-f').checked=na;
  applyFilters();
}
function setMS(btn,val){
  sevFilter=val;
  document.querySelectorAll('#mob-sheet .pills .pill').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  const sb=document.querySelector(`#sidebar .pills .pill[data-sev="${val}"]`);
  if(sb){ document.querySelectorAll('#sidebar .pills .pill').forEach(p=>p.classList.remove('on')); sb.classList.add('on'); }
  applyFilters();
}

// ══════════════════════════════════════
//  PANEL RESIZER
// ══════════════════════════════════════
function initResizers(){
  // Sidebar resizer
  const rszSb = document.getElementById('rsz-sidebar');
  const sidebar = document.getElementById('sidebar');
  if(rszSb && sidebar){
    let dragging = false, startX = 0, startW = 0;
    rszSb.addEventListener('mousedown', e=>{
      dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
      rszSb.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const newW = Math.max(180, Math.min(400, startW + e.clientX - startX));
      sidebar.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', ()=>{
      if(!dragging) return;
      dragging = false;
      rszSb.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
  // Detail panel resizer
  const rszDp = document.getElementById('rsz-detail');
  const dp = document.getElementById('dp');
  if(rszDp && dp){
    let dragging = false, startX = 0, startW = 0;
    rszDp.addEventListener('mousedown', e=>{
      dragging = true; startX = e.clientX; startW = dp.offsetWidth;
      rszDp.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const delta = startX - e.clientX; // 오른쪽에서 드래그하므로 반전
      const newW = Math.max(300, Math.min(800, startW + delta));
      dp.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', ()=>{
      if(!dragging) return;
      dragging = false;
      rszDp.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}

// Detail panel 열릴 때 resizer 표시
const _origDpOpen = selAlarm;
function showDpResizer(open){
  const rsz = document.getElementById('rsz-detail');
  if(rsz) rsz.style.display = open ? 'block' : 'none';
}
function handleUrl(){
  try{
    const p=new URLSearchParams(location.search);

    // fburl 파라미터가 있으면 Firebase 자동 연결
    const fburl = p.get('fburl');
    if(fburl && !FB_URL){
      FB_URL = decodeURIComponent(fburl).replace(/\/+$/, '');
      localStorage.setItem('vam_fb_url', FB_URL);
      // Firebase 연결 시작 (백그라운드)
      initFirebase();
    }

    // 알람 바로가기
    const v=p.get('v'), t=p.get('t'), c=p.get('c');
    if(v&&t&&c){
      document.getElementById('sel-v').value=v;
      document.getElementById('sel-t').value=t;
      applyFilters();
      const a=alarms.find(x=>x.vision===v&&x.type===t&&x.code===parseInt(c));
      if(a) setTimeout(()=>selAlarm(a.id), 200);
    }
  } catch{}
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
async function init(){
  initResizers();
  rebuildAlarms();         // 언어에 맞는 데이터로 초기 구성
  applyLang();             // 저장된 언어 설정 적용
  renderVisionSelects();
  renderFavorites(); renderRecent();
  // 알람 목록은 즉시 렌더링 (Firebase 기다리지 않음)
  applyFilters(); updateStats(); renderRight();
  // Demo search log seed
  if(searchLog.length===0){
    const demo=['NotchingVision_HOST_0','FoilVision_HOST_30','NotchingVision_HOST_7',
      'NGVision_HOST_11','DelaminationVision_HOST_4','FoilVision_Vision_30',
      'NotchingVision_HOST_1','NGVision_HOST_0'];
    const now=Date.now();
    demo.forEach((k,i)=>{ for(let j=0;j<(8-i)*3;j++) searchLog.push({key:k,ts:now-Math.random()*6*24*3600*1000}); });
    sS('vam_search_log',searchLog);
  }
  handleUrl();
  // Firebase는 백그라운드에서 연결 (UI 블로킹 없음)
  console.log('[Init] FB_URL:', FB_URL);
  if(FB_URL){
    initFirebase(); // await 제거 - 백그라운드 실행
  } else {
    setDbStatus('offline');
    setTimeout(()=>{ showToast('⚙️ Firebase 버튼을 눌러 URL을 설정하면 팀 공유가 가능합니다'); }, 1500);
  }
}

init();
