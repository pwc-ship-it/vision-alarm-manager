// INTEKPLUS ALARM Manager — app-core.js
// 로드 순서: alarms.js → alarms_en.js → app-core.js → app-render.js → app-actions.js → app-admin.js → app-ui.js → app-init.js

// ══════════════════════════════════════
//  FIREBASE LAYER
// ══════════════════════════════════════
let FB_URL = (localStorage.getItem('vam_fb_url') || '').replace(/\/+$/, '');
let fbOnline = false;

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
      // Firebase 배열→객체 변환 대응 (빈 데이터는 무시)
      if(caData && typeof caData === 'object'){
        const arr = Array.isArray(caData) ? caData : Object.values(caData);
        if(arr.length > 0 && JSON.stringify(arr)!==JSON.stringify(customAlarms)){
          customAlarms=arr; sS('vam_custom_alarms',customAlarms);
          rebuildAlarms();
          // curAlarm 참조 갱신
          if(curAlarm){ const upd=alarms.find(x=>x.id===curAlarm.id); if(upd) curAlarm=upd; }
          changed=true;
        }
      }
      if(cvData && typeof cvData === 'object'){
        const arr = Array.isArray(cvData) ? cvData : Object.values(cvData);
        if(arr.length > 0 && JSON.stringify(arr)!==JSON.stringify(customVisions)){
          customVisions=arr; sS('vam_custom_visions',customVisions); renderVisionSelects(); changed=true;
        }
      }
      if(ctData && typeof ctData === 'object'){
        const arr = Array.isArray(ctData) ? ctData : Object.values(ctData);
        if(arr.length > 0 && JSON.stringify(arr)!==JSON.stringify(customTypes)){
          customTypes=arr; sS('vam_custom_types',customTypes); renderVisionSelects(); changed=true;
        }
      }
      if(suData && typeof suData === 'object'){
        const arr = Array.isArray(suData) ? suData : Object.values(suData);
        if(arr.length > 0 && JSON.stringify(arr)!==JSON.stringify(siteUnits)){
          siteUnits=arr; sS('vam_site_units',siteUnits); changed=true;
        }
      }
      if(changed){
        renderRight();
        if(curAlarm){
          // changed 후 curAlarm 참조 최신화
          const upd=alarms.find(x=>x.id===curAlarm.id); if(upd) curAlarm=upd;
          renderDetail(curAlarm);
        }
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
    // Firebase는 배열을 객체({0:{...},1:{...}})로 저장하는 경우가 있으므로 양쪽 처리
    if(caData && typeof caData === 'object'){
      const arr = Array.isArray(caData) ? caData : Object.values(caData);
      if(arr.length){ customAlarms = arr; sS('vam_custom_alarms', customAlarms); }
    }
    if(cvData && typeof cvData === 'object'){
      const arr = Array.isArray(cvData) ? cvData : Object.values(cvData);
      if(arr.length){ customVisions = arr; sS('vam_custom_visions', customVisions); }
    }
    if(ctData && typeof ctData === 'object'){
      const arr = Array.isArray(ctData) ? ctData : Object.values(ctData);
      if(arr.length){ customTypes = arr; sS('vam_custom_types', customTypes); }
    }
    // siteUnits: Firebase 데이터가 실제로 있을 때만 덮어씀
    // 빈 객체({}) 또는 null이면 DEFAULT_SITE_UNITS 유지
    if(suData && typeof suData === 'object'){
      const arr = Array.isArray(suData) ? suData : Object.values(suData);
      if(arr.length > 0){
        siteUnits = arr;
        sS('vam_site_units', siteUnits);
      }
      // arr.length === 0 이면 기존 siteUnits(DEFAULT) 그대로 유지
    }

    rebuildAlarms();
    // curAlarm이 있으면 새 alarms 배열 기준으로 참조 갱신
    if(curAlarm){ const upd=alarms.find(x=>x.id===curAlarm.id); if(upd) curAlarm=upd; }
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

// ── DB 상태 표시 (i18n 적용) ──
function setDbStatus(s){
  const el = document.getElementById('db-status');
  const txt = document.getElementById('db-txt');
  if(s === 'online'){
    el.className='online';
    if(txt) txt.textContent = t('db_online');
  } else if(s === 'offline'){
    el.className='offline';
    if(txt) txt.textContent = t('db_offline');
  } else {
    el.className='loading';
    if(txt) txt.textContent = t('db_loading');
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
    btn_all_actions:    '📋 전체 조치방안',
    btn_add_alarm:      '➕ 알람 추가',
    // DB 상태
    db_online:          '실시간 연동 중',
    db_offline:         '로컬 모드',
    db_loading:         '⏳ 연결 중...',
    // 사이드바
    vision_select:      'Vision 선택',
    search_ph:          '코드 · 알람명 · 원인 · 조치방안',
    severity:           '심각도',
    favorites:          '즐겨찾기 ⭐',
    recent:             '최근 조회',
    no_act_only:        '미등록만',
    // 정렬
    sort_code:          '코드순',
    sort_name:          '이름순',
    sort_sev:           '심각도순',
    sort_acts:          '조치방안 많은순',
    sort_recent:        '최신 조치방안순',
    // 상세 패널
    basic_info:         '기본 정보',
    direct_cause:       '직접 원인',
    occurrence:         '발생 조건',
    influence:          '영향 조건',
    related_alarms:     '관련 알람',
    timing:             '발생 시점',
    plc_output:         'PLC 출력',
    related_log:        '관련 로그',
    actions_history:    '조치방안 이력',
    actions_count_unit: '건',
    add_action:         '+ 조치방안 등록',
    fav_add:            '☆ 즐겨찾기',
    fav_remove:         '⭐ 해제',
    share:              '🔗 공유',
    sync_live:          '실시간 동기화',
    sync_local:         '⚠️ 로컬 저장',
    no_actions:         '아직 등록된 조치방안이 없습니다.',
    sort_desc:          '↑ 최신순',
    sort_asc:           '↓ 오래된순',
    sort_helpful:       '👍 많은순',
    ref_link_open:      '🔗 참고 자료 열기',
    saving:             '저장 중...',
    no_actions_all:     '조치방안이 없습니다',
    // 조치방안 폼
    name_label:         '이름',
    site_label:         '현장',
    content_label:      '조치 내용 *',
    status_label:       '상태',
    date_label:         '날짜',
    link_label:         '참고 자료 링크',
    submit_action:      '등록',
    // 통계
    stat_total:         '전체',
    stat_acts:          '조치방안',
    stat_noact:         '미등록',
    stat_resolved:      '해결됨',
    // Trouble 필드
    tr_site:            '사이트',
    tr_unit:            '호기',
    tr_time:            '조치 시간',
    tr_keywords:        '키워드',
    tr_desc:            '발생 현상',
    reg_date:           '등록일',
    // 기타
    loading:            '로딩 중...',
    no_result:          '검색 결과가 없습니다',
    alarm_count:        '개 알람',
    save_firebase:      'Firebase에 저장됨 ✅',
    save_local:         '로컬에 저장됨',
    top10:              'TOP 10 조회',
    recent_actions:     '최근 조치방안',
    edit_history:       '수정 이력',
    view_all:           '전체 보기',
    view_all2:          '전체보기',
    close:              '닫기',
    cancel:             '취소',
    offline_notice:     '오프라인 모드',
    // 랭킹 토글
    rank_7d:            '7일',
    rank_all:           '전체',
    rank_no_data:       '기록 없음',
    // 상태 라벨
    status_unset:       '미지정',
    status_resolved:    '✅ 해결됨',
    status_temp:        '⚠️ 임시조치',
    status_checking:    '🔍 확인중',
    status_default:     '📌 Default',
    // 조치방안 폼 placeholder
    action_placeholder: '조치 내용을 상세히 입력하세요\n(증상 / 원인 확인 방법 / 조치 절차 / 결과)',
    // Trouble 상세
    resolution_time:    '조치 시간',
    hour:               '시간',
    minute:             '분',
    // 기타
    none:               '없음',
    added:              '추가됨',
    all_vision:         '전체 Vision',
    all_type:           '전체 타입',
    // 조치방안 카드 버튼
    edit:               '✏️ 수정',
    delete_admin:       '🗑️ 삭제',
    helpful:            '👍 도움됐어요',
    action_add_title:   '+ 조치방안 등록',
    action_edit_title:  '✏️ 조치방안 수정',
    name_required:      '이름 (필수)',
    site_optional:      '현장 (선택)',
    ref_link:           '🔗 참고 자료 URL (선택)',
    // 알람 수정/삭제
    alarm_edit:         '✏️ 수정',
    alarm_delete:       '🗑️ 삭제',
    // 전체 조치방안 패널
    all_actions_title:  '📋 전체 조치방안',
    all_status:         '전체 상태',
    all_order_new:      '최신순',
    all_order_old:      '오래된순',
    all_order_helpful:  '👍 많은순',
    // 이력 모달
    hist_title:         '📋 전체 수정 이력',
    hist_filter_all:    '전체 유형',
    hist_filter_act:    '조치방안 등록',
    hist_filter_edit:   '알람 수정',
    hist_filter_up:     '업로드',
    // 업로드 모달
    upload_title:       '📤 Excel 업로드',
    upload_click:       '클릭하여 파일 선택',
    // QR 모달
    qr_title:           '📱 사이트 QR 코드',
    qr_copy:            '🔗 URL 복사',
    // 알람 추가 모달
    add_alarm_title:    '➕ 알람 / 트러블 추가',
    add_alarm_submit:   '➕ 등록',
    edit_alarm_title:   '✏️ 알람 수정',
    edit_alarm_submit:  '💾 저장',
    // Firebase 설정
    fb_title:           '⚡ Firebase 설정',
    fb_save:            '💾 저장 및 연결',
    fb_test:            '🔗 연결 테스트',
    // 모바일
    mob_keyword:        '키워드',
    mob_severity:       '심각도',
    mob_all:            '전체',
    mob_noact:          '미등록만',
    mob_result:         '결과 보기',
    mob_back:           '← 목록으로',
    mob_local:          '⚠️로컬',
    // Vision 관리
    vm_tab_type:        '타입',
    vm_tab_site:        '사이트/호기',
    // Admin 모드
    admin_mode:         '관리자 모드',
    viewer_mode:        '뷰어 모드',
  },
  en: {
    // 상단 버튼
    btn_all_actions:    '📋 All Actions',
    btn_add_alarm:      '➕ Add Alarm',
    // DB 상태
    db_online:          'Live Sync',
    db_offline:         'Local Mode',
    db_loading:         '⏳ Connecting...',
    // 사이드바
    vision_select:      'Vision Select',
    search_ph:          'Code · Name · Cause · Action',
    severity:           'Severity',
    favorites:          'Favorites ⭐',
    recent:             'Recent',
    no_act_only:        'No Action Only',
    // 정렬
    sort_code:          'By Code',
    sort_name:          'By Name',
    sort_sev:           'By Severity',
    sort_acts:          'Most Actions',
    sort_recent:        'Latest Action',
    // 상세 패널
    basic_info:         'Basic Info',
    direct_cause:       'Direct Cause',
    occurrence:         'Occurrence',
    influence:          'Influence',
    related_alarms:     'Related Alarms',
    timing:             'Timing',
    plc_output:         'PLC Output',
    related_log:        'Related Log',
    actions_history:    'Action History',
    actions_count_unit: 'items',
    add_action:         '+ Add Action Plan',
    fav_add:            '☆ Favorite',
    fav_remove:         '⭐ Unfavorite',
    share:              '🔗 Share',
    sync_live:          'Live Sync',
    sync_local:         '⚠️ Local Save',
    no_actions:         'No action plans registered yet.',
    sort_desc:          '↑ Newest',
    sort_asc:           '↓ Oldest',
    sort_helpful:       '👍 Most Helpful',
    ref_link_open:      '🔗 Open Reference',
    saving:             'Saving...',
    no_actions_all:     'No actions found',
    // 조치방안 폼
    name_label:         'Name',
    site_label:         'Site',
    content_label:      'Content *',
    status_label:       'Status',
    date_label:         'Date',
    link_label:         'Reference Link',
    submit_action:      'Submit',
    // 통계
    stat_total:         'Total',
    stat_acts:          'Actions',
    stat_noact:         'No Action',
    stat_resolved:      'Resolved',
    // Trouble 필드
    tr_site:            'Site',
    tr_unit:            'Line',
    tr_time:            'Resolution Time',
    tr_keywords:        'Keywords',
    tr_desc:            'Description',
    reg_date:           'Registered',
    // 기타
    loading:            'Loading...',
    no_result:          'No results found',
    alarm_count:        ' alarms',
    save_firebase:      'Saved to Firebase ✅',
    save_local:         'Saved locally',
    top10:              'TOP 10 Views',
    recent_actions:     'Recent Actions',
    edit_history:       'Edit History',
    view_all:           'View All',
    view_all2:          'View All',
    close:              'Close',
    cancel:             'Cancel',
    offline_notice:     'Offline Mode',
    // 랭킹 토글
    rank_7d:            '7 Days',
    rank_all:           'All Time',
    rank_no_data:       'No records',
    // 상태 라벨
    status_unset:       'Unspecified',
    status_resolved:    '✅ Resolved',
    status_temp:        '⚠️ Temporary',
    status_checking:    '🔍 Checking',
    status_default:     '📌 Default',
    // 조치방안 폼 placeholder
    action_placeholder: 'Describe the action plan in detail\n(Symptom / Root cause / Steps / Result)',
    // Trouble 상세
    resolution_time:    'Resolution Time',
    hour:               'hr',
    minute:             'min',
    // 기타
    none:               'None',
    added:              'Added',
    all_vision:         'All Vision',
    all_type:           'All Types',
    // 조치방안 카드 버튼
    edit:               '✏️ Edit',
    delete_admin:       '🗑️ Delete',
    helpful:            '👍 Helpful',
    action_add_title:   '+ Add Action Plan',
    action_edit_title:  '✏️ Edit Action Plan',
    name_required:      'Name (required)',
    site_optional:      'Site (optional)',
    ref_link:           '🔗 Reference URL (optional)',
    // 알람 수정/삭제
    alarm_edit:         '✏️ Edit',
    alarm_delete:       '🗑️ Delete',
    // 전체 조치방안 패널
    all_actions_title:  '📋 All Actions',
    all_status:         'All Status',
    all_order_new:      'Newest',
    all_order_old:      'Oldest',
    all_order_helpful:  '👍 Most Helpful',
    // 이력 모달
    hist_title:         '📋 Full Edit History',
    hist_filter_all:    'All Types',
    hist_filter_act:    'Action Added',
    hist_filter_edit:   'Alarm Edited',
    hist_filter_up:     'Upload',
    // 업로드 모달
    upload_title:       '📤 Excel Upload',
    upload_click:       'Click to select file',
    // QR 모달
    qr_title:           '📱 Site QR Code',
    qr_copy:            '🔗 Copy URL',
    // 알람 추가 모달
    add_alarm_title:    '➕ Add Alarm / Trouble',
    add_alarm_submit:   '➕ Add',
    edit_alarm_title:   '✏️ Edit Alarm',
    edit_alarm_submit:  '💾 Save',
    // Firebase 설정
    fb_title:           '⚡ Firebase Setup',
    fb_save:            '💾 Save & Connect',
    fb_test:            '🔗 Test Connection',
    // 모바일
    mob_keyword:        'Keyword',
    mob_severity:       'Severity',
    mob_all:            'All',
    mob_noact:          'No Action Only',
    mob_result:         'Show Results',
    mob_back:           '← Back to List',
    mob_local:          '⚠️Local',
    // Vision 관리
    vm_tab_type:        'Type',
    vm_tab_site:        'Site/Line',
    // Admin 모드
    admin_mode:         'Admin Mode',
    viewer_mode:        'Viewer Mode',
  }
};

function t(key){ return (I18N[currentLang]||I18N.ko)[key] || (I18N.ko)[key] || key; }

function toggleLang(){
  currentLang = currentLang === 'ko' ? 'en' : 'ko';
  sS('vam_lang', currentLang);
  applyLang();
  rebuildAlarms();
  applyFilters(); updateStats(); renderRight();
  if(curAlarm) renderDetail(curAlarm);
  showToast(currentLang === 'en' ? '🌐 English Mode' : '🌐 한국어 모드', 'ok');
}

function applyLang(){
  const isEn = currentLang === 'en';
  document.getElementById('html-root').setAttribute('lang', currentLang);
  // 토글 버튼
  const btn = document.getElementById('lang-btn');
  if(btn){
    btn.textContent = isEn ? '🌐 EN' : '🌐 KO';
    btn.classList.toggle('en', isEn);
  }
  // data-i18n 정적 텍스트
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
  // 사이드바 Vision 라벨
  const visionLabel = document.querySelector('#sidebar .sbl');
  if(visionLabel) visionLabel.childNodes[0].textContent = t('vision_select');
  // 통계 라벨
  document.querySelectorAll('.sb-scl').forEach((el,i)=>{
    const keys=['stat_total','stat_acts','stat_noact','stat_resolved'];
    if(keys[i]) el.textContent = t(keys[i]);
  });
  // 전체 조치방안 패널 정적 요소
  const aapTitle = document.querySelector('#aap .aph span[data-i18n="all_actions_title"]');
  if(aapTitle) aapTitle.textContent = t('all_actions_title');
  const aaStatus = document.getElementById('aa-s');
  if(aaStatus){
    const opts = aaStatus.querySelectorAll('option');
    const keys = ['all_status','status_default','status_resolved','status_temp','status_checking'];
    opts.forEach((opt,i)=>{ if(keys[i]) opt.textContent = t(keys[i]); });
  }
  const aaOrder = document.getElementById('aa-o');
  if(aaOrder){
    const opts = aaOrder.querySelectorAll('option');
    const keys = ['all_order_new','all_order_old','all_order_helpful'];
    opts.forEach((opt,i)=>{ if(keys[i]) opt.textContent = t(keys[i]); });
  }
  // DB 상태 텍스트 갱신 (현재 상태 유지하며 언어만 변경)
  const dbEl = document.getElementById('db-status');
  if(dbEl){
    const cls = dbEl.className;
    if(cls === 'online') setDbStatus('online');
    else if(cls === 'offline') setDbStatus('offline');
    else setDbStatus('loading');
  }
}

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let customAlarms  = gS('vam_custom_alarms', []);
let customVisions = gS('vam_custom_visions', []);
let customTypes   = gS('vam_custom_types', []);

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
let _rawSiteUnits = gS('vam_site_units', null);
// 배열/객체 양쪽 처리 후 비어있으면 DEFAULT 사용
let siteUnits = (()=>{
  if(!_rawSiteUnits) return DEFAULT_SITE_UNITS;
  const arr = Array.isArray(_rawSiteUnits) ? _rawSiteUnits : Object.values(_rawSiteUnits);
  return arr.length ? arr : DEFAULT_SITE_UNITS;
})();
sS('vam_site_units', siteUnits);

function normalizeSite(s){ return (s||'').replace(/^LGES/, 'ES').toUpperCase(); }

function sortUnits(units){
  return [...units].sort((a, b) => {
    const parseUnit = s => {
      const parts = s.match(/(\d+)/g) || [];
      const chars = s.replace(/\d+/g, '').replace(/[-]/g, '');
      return { nums: parts.map(Number), str: chars };
    };
    const pa = parseUnit(a), pb = parseUnit(b);
    for(let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++){
      const na = pa.nums[i] ?? -1, nb = pb.nums[i] ?? -1;
      if(na !== nb) return na - nb;
    }
    return pa.str.localeCompare(pb.str);
  });
}

let alarms       = [...RAW.map(a=>({...a})), ...customAlarms.map(a=>({...a}))];
let actions      = gS('vam_actions', {});
let favorites    = gS('vam_favorites', []);
let searchLog    = gS('vam_search_log', []);
let recentViewed = gS('vam_recent', []);
let auditLog     = gS('vam_audit', []);
let alarmEdits   = gS('vam_alarm_edits', {});
let savedAuthor  = gS('vam_author', '');
let savedSite    = gS('vam_site', '');
let isAdmin      = false;
let curAlarm     = null;
let rankPeriod   = '7d';
let sevFilter    = '';
let filtered     = [];
let allActOpen   = false;
let sortDescAct  = 'desc';
const PG_THRESHOLD = 100;
let pgCur  = 1;
let pgSize = 50;

// ══════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════
function ak(a){ return a.vision+'_'+a.type+'_'+a.code; }
function ga(a){ return {...a,...(alarmEdits[ak(a)]||{})}; }

function needsTranslation(text){
  if(currentLang !== 'en') return false;
  return /[가-힣]/.test(text||'');
}

function enText(text){
  if(!needsTranslation(text)) return esc(text);
  return `<span class="translating">${esc(text)}</span>`;
}

function rebuildAlarms(){
  const base = (currentLang === 'en' && typeof RAW_EN !== 'undefined') ? RAW_EN : RAW;
  alarms = [...base.map(a=>({...a})), ...customAlarms.map(a=>({...a}))];
}

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

  ['sel-v'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML=`<option value="">${t('all_vision')}</option>`+visions.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(cur) el.value=cur;
  });
  ['sel-t'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML=`<option value="">${t('all_type')}</option>`+types.map(tp=>`<option value="${tp}">${tp}</option>`).join('');
    if(cur) el.value=cur;
  });

  const aav=document.getElementById('aa-v');
  if(aav){
    const cur=aav.value;
    aav.innerHTML=`<option value="">${t('all_vision')}</option>`+visions.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(cur) aav.value=cur;
  }

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
      +customTypes.map(tp=>`<option value="${tp}">${tp}</option>`).join('');
    if(cur) nat.value=cur;
  }
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function hl(s,q){
  if(!q) return esc(s);
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
