// INTEKPLUS ALARM Manager — app-admin.js
// 의존: app-core.js → app-render.js → app-actions.js

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
    </div>`).join('')||`<div style="color:var(--text3);font-size:12px">${t('none')}</div>`;
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
  if(!url){ showToast(currentLang==='en'?'Enter URL':'URL을 입력하세요','err'); return; }
  const res=document.getElementById('fb-test-result');
  res.style.display='block';
  res.style.background='var(--bg4)'; res.style.color='var(--text3)';
  res.textContent = currentLang==='en' ? '⏳ Testing connection...' : '⏳ 연결 테스트 중...';
  try{
    const r=await fetch(url+'/.json?shallow=true');
    if(r.ok){
      res.style.background='var(--greenbg)'; res.style.color='var(--green)';
      res.textContent = currentLang==='en' ? '✅ Connected! Click Save to apply.' : '✅ 연결 성공! 저장 버튼을 눌러 적용하세요.';
    } else {
      res.style.background='var(--redbg)'; res.style.color='var(--red)';
      res.textContent = currentLang==='en'
        ? `❌ Failed (HTTP ${r.status}). Check URL and security rules.`
        : `❌ 연결 실패 (HTTP ${r.status}). URL과 보안 규칙을 확인하세요.`;
    }
  } catch(e){
    res.style.background='var(--redbg)'; res.style.color='var(--red)';
    res.textContent='❌ '+(currentLang==='en'?'Connection failed: ':'연결 실패: ')+e.message;
  }
}

async function saveFbConfig(){
  const url = document.getElementById('fb-url-inp').value.trim().replace(/\/+$/, '');
  if(!url){ showToast(currentLang==='en'?'Enter URL':'URL을 입력하세요','err'); return; }
  FB_URL = url;
  localStorage.setItem('vam_fb_url', url);
  fbOnline = false;
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  closeFbSetup();
  showToast(currentLang==='en'?'Connecting to Firebase...':'Firebase 연결 중...', '');
  await initFirebase();
}

// ══════════════════════════════════════
//  SHARE / QR / ADMIN
// ══════════════════════════════════════
function showQR(){
  const base = location.href.split('?')[0];
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

  const info = document.getElementById('qr-info');
  if(info){
    if(FB_URL){
      info.innerHTML = currentLang==='en'
        ? '<span style="color:var(--green)">✅ Firebase URL included — auto-connects on scan</span>'
        : '<span style="color:var(--green)">✅ Firebase URL 포함 — QR 스캔 시 자동 연결됩니다</span>';
    } else {
      info.innerHTML = currentLang==='en'
        ? '<span style="color:var(--yellow)">⚠️ No Firebase — manual setup required after scan</span>'
        : '<span style="color:var(--yellow)">⚠️ Firebase 미설정 — 스캔 후 수동 연결 필요</span>';
    }
  }
  document.getElementById('qr-mo').classList.add('open');
}

function copyQrUrl(){
  const base = location.href.split('?')[0];
  const url = FB_URL ? base + '?fburl=' + encodeURIComponent(FB_URL) : base;
  try{ navigator.clipboard.writeText(url); showToast(currentLang==='en'?'URL copied 🔗':'URL 복사됨 🔗','ok'); }
  catch{ prompt('URL:', url); }
}

function shareLink(k){
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  const u=new URL(location.href);
  u.searchParams.set('v',a.vision); u.searchParams.set('t',a.type); u.searchParams.set('c',a.code);
  try{ navigator.clipboard.writeText(u.toString()); showToast(currentLang==='en'?'Link copied 🔗':'링크 복사됨 🔗','ok'); }
  catch{ prompt(currentLang==='en'?'Copy the link:':'링크를 복사하세요:', u.toString()); }
}

function toggleAdmin(){
  const pw=isAdmin?'':prompt(currentLang==='en'?'Admin password:':'관리자 비밀번호:');
  if(!isAdmin&&pw!=='admin1234'){ if(pw!==null) showToast(currentLang==='en'?'Wrong password':'비밀번호 오류','err'); return; }
  isAdmin=!isAdmin;
  const b=document.getElementById('role-b');
  b.textContent=isAdmin?'ADMIN':'VIEWER';
  b.style.background=isAdmin?'rgba(255,179,71,.15)':'var(--aglow)';
  b.style.color=isAdmin?'var(--yellow)':'var(--accent)';
  b.style.borderColor=isAdmin?'rgba(255,179,71,.3)':'rgba(79,124,255,.3)';
  const vmb=document.getElementById('vision-manage-btn');
  if(vmb) vmb.style.display=isAdmin?'block':'none';
  if(isAdmin) checkTranslationStatus();
  if(curAlarm) renderDetail(curAlarm);
  showToast(isAdmin?t('admin_mode'):t('viewer_mode'),'ok');
}

async function checkTranslationStatus(){
  if(!fbOnline) return;
  try {
    const status = await fbGet('translationStatus');
    if(!status) return;
    const pct = status.usage_pct || 0;
    const warn = status.warning || false;
    if(warn || pct >= 95){
      showToast(`⚠️ DeepL ${pct}% — translation stopped`, 'err');
      console.warn('[DeepL]', `Usage: ${pct}% (${(status.usage_count||0).toLocaleString()} / ${(status.usage_limit||500000).toLocaleString()})`);
    } else if(pct >= 80){
      showToast(`⚠️ DeepL ${pct}% — caution`, 'ok');
    } else {
      showToast(`🌐 DeepL ${pct}% used`, 'ok');
    }
  } catch(e) { /* silent fail */ }
}

// ══════════════════════════════════════
//  ALARM ADD / EDIT / DELETE (Custom)
// ══════════════════════════════════════
function onNaTypeChange(){
  const type = document.getElementById('na-type').value;
  const isTrouble = type === 'Trouble';
  document.getElementById('na-normal-fields').style.display = isTrouble ? 'none' : '';
  document.getElementById('na-trouble-fields').style.display = isTrouble ? '' : 'none';
  // Trouble은 비전별 자동 채번이므로 코드 입력란을 숨김 (남은 '알람명' 필드는 전체 폭)
  const codeWrap = document.getElementById('na-code-wrap');
  const codeRow  = document.getElementById('na-code-row');
  if(codeWrap) codeWrap.style.display = isTrouble ? 'none' : '';
  if(codeRow)  codeRow.style.gridTemplateColumns = isTrouble ? '1fr' : '1fr 2fr';
  // Trouble 모드 진입 시 코드 값 초기화 (자동 채번 사용)
  if(isTrouble){
    const codeEl = document.getElementById('na-code');
    if(codeEl) codeEl.value = '';
  }
}

function renderSiteSelect(selId='na-site', selectedSite=''){
  const el = document.getElementById(selId);
  if(!el) return;
  const placeholder = currentLang==='en' ? '-- Select --' : '-- 선택 --';
  el.innerHTML = `<option value="">${placeholder}</option>`
    + siteUnits.map(su=>`<option value="${su.site}"${su.site===selectedSite?' selected':''}>${su.site} (${su.units.length}${currentLang==='en'?' lines':'개'})</option>`).join('');
}

function renderUnitSelect(site, selId='na-unit', selectedUnit=''){
  const el = document.getElementById(selId);
  if(!el) return;
  const su = siteUnits.find(x=>x.site===site);
  if(!su || !su.units.length){
    el.innerHTML = `<option value="">${currentLang==='en'?'-- No lines --':'-- 호기 없음 --'}</option>`;
    return;
  }
  const placeholder = currentLang==='en' ? '-- Select --' : '-- 선택 --';
  el.innerHTML = `<option value="">${placeholder}</option>`
    + sortUnits(su.units).map(u=>`<option value="${u}"${u===selectedUnit?' selected':''}>${u}</option>`).join('');
}

function onNaSiteChange(){
  const site = document.getElementById('na-site').value;
  renderUnitSelect(site);
  const hint = document.getElementById('na-site-hint');
  if(hint){
    const su = siteUnits.find(x=>x.site===site);
    hint.textContent = su ? (currentLang==='en'?`${su.units.length} lines`:`호기 ${su.units.length}개`) : '';
  }
}

function onNaSiteInput(el){ el.value = el.value.toUpperCase(); }
function onNaUnitInput(el){ el.value = el.value.toUpperCase(); }

function renderKeywordPreview(){
  const val = document.getElementById('na-keywords').value;
  const tags = val.split(',').map(s=>s.trim()).filter(Boolean);
  document.getElementById('na-keyword-tags').innerHTML = tags.map(tg=>
    `<span style="background:var(--bg4);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text2)">${tg}</span>`
  ).join('');
}

function openAddAlarmModal(){
  document.getElementById('na-edit-id').value = '';
  document.getElementById('add-alarm-mo-title').textContent = t('add_alarm_title');
  document.getElementById('na-submit-btn').textContent = t('add_alarm_submit');
  ['na-code','na-name','na-cause','na-occur','na-infl','na-related',
   'na-site','na-unit','na-hour','na-min','na-keywords','na-desc'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('na-sev').value='Warning';
  document.getElementById('na-sev-t').value='Warning';
  document.getElementById('na-keyword-tags').innerHTML='';
  document.getElementById('na-site-hint').textContent='';
  document.getElementById('na-unit-hint').textContent='';
  // 등록일 오늘 날짜 디폴트
  const dateEl=document.getElementById('na-created-date');
  if(dateEl) dateEl.value=new Date().toISOString().slice(0,10);
  // ═══════ 작성자: 로그인 프로필 이름 자동 입력 (읽기 전용) ═══════
  const authorEl=document.getElementById('na-author');
  if(authorEl){
    const myName = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : '';
    authorEl.value = myName;
    authorEl.readOnly = true;  // 신규 등록 시에는 로그인 이름 고정
    authorEl.style.opacity = '0.7';
    authorEl.title = currentLang==='en' ? 'Auto-filled from login' : '로그인 계정에서 자동 입력됨';
  }
  const authorHint=document.getElementById('na-author-hint');
  if(authorHint){
    authorHint.textContent = currentLang==='en' ? 'Auto-filled from login' : '로그인 계정 자동 입력';
    authorHint.style.color = 'var(--text3)';
  }
  renderSiteSelect();
  renderUnitSelect('');
  renderVisionSelects();
  onNaTypeChange();
  document.getElementById('add-alarm-mo').classList.add('open');
}

function openEditAlarmModal(id){
  const a = alarms.find(x=>x.id===id);
  if(!a||!a.isCustom){ showToast(currentLang==='en'?'Cannot edit default alarms':'기본 알람은 수정할 수 없습니다','err'); return; }
  document.getElementById('na-edit-id').value = id;
  document.getElementById('add-alarm-mo-title').textContent = t('edit_alarm_title');
  document.getElementById('na-submit-btn').textContent = t('edit_alarm_submit');
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
  const editSite = a.tr_site||'';
  const editUnit = a.tr_unit||'';
  renderSiteSelect('na-site', editSite);
  renderUnitSelect(editSite, 'na-unit', editUnit);
  if(editSite){
    const hint = document.getElementById('na-site-hint');
    const su = siteUnits.find(x=>x.site===editSite);
    if(hint && su) hint.textContent = currentLang==='en'?`${su.units.length} lines`:`호기 ${su.units.length}개`;
  }
  document.getElementById('na-hour').value = a.tr_hour||0;
  document.getElementById('na-min').value = a.tr_min||0;
  document.getElementById('na-keywords').value = (a.tr_keywords||[]).join(', ');
  document.getElementById('na-desc').value = a.tr_desc||'';
  document.getElementById('na-sev-t').value = a.severity||'Warning';
  // 등록일: 기존값 표시 (Admin만 수정 가능)
  const dateEl=document.getElementById('na-created-date');
  if(dateEl){
    dateEl.value = a.created_date||'';
    dateEl.readOnly = !isAdmin;
    dateEl.style.opacity = isAdmin ? '1' : '0.5';
    dateEl.title = isAdmin ? '' : (currentLang==='en'?'Admin only':'관리자만 수정 가능');
  }
  // ═══════ 작성자: 기존값 로드 + 수정 권한 제어 ═══════
  // 권한: 본인(기존작성자 === 로그인이름) 또는 Admin, 또는 기존값 빈 경우 누구나
  const authorEl=document.getElementById('na-author');
  if(authorEl){
    const oldAuthor = a.tr_author || '';
    const myName    = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : '';
    const canEdit   = !oldAuthor || isAdmin || (myName && myName === oldAuthor);
    authorEl.value  = oldAuthor;
    authorEl.readOnly = !canEdit;
    authorEl.style.opacity = canEdit ? '1' : '0.5';
    if(canEdit){
      authorEl.title = currentLang==='en'
        ? (oldAuthor ? 'You can edit (owner/admin)' : 'Empty — fill with your name')
        : (oldAuthor ? '본인/Admin 수정 가능' : '미지정 — 본인 이름으로 채워주세요');
    } else {
      authorEl.title = currentLang==='en' ? 'Only owner or admin can edit' : '본인 또는 Admin만 수정 가능';
    }
  }
  const authorHint=document.getElementById('na-author-hint');
  if(authorHint){
    const oldAuthor = a.tr_author || '';
    const myName    = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : '';
    const canEdit   = !oldAuthor || isAdmin || (myName && myName === oldAuthor);
    if(!oldAuthor){
      authorHint.textContent = currentLang==='en' ? 'Not set — fill with your name' : '미지정 — 본인 이름으로 채워주세요';
      authorHint.style.color = 'var(--yellow)';
    } else if(canEdit){
      authorHint.textContent = currentLang==='en' ? (isAdmin?'Admin: can edit':'You (owner): can edit') : (isAdmin?'Admin: 수정 가능':'본인 글: 수정 가능');
      authorHint.style.color = 'var(--text3)';
    } else {
      authorHint.textContent = currentLang==='en' ? 'Locked (not owner)' : '잠김 (본인 아님)';
      authorHint.style.color = 'var(--text3)';
    }
  }
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

  if(!name){ showToast(currentLang==='en'?'Enter alarm/issue name':'알람명/이슈명을 입력하세요','err'); return; }

  // ═══════ Trouble 필수 필드 검증 ═══════
  // 알람코드는 항상 자동채번이므로 제외, 나머지 모든 필드 필수
  if(isTrouble){
    const trSite     = document.getElementById('na-site').value.trim();
    const trUnit     = document.getElementById('na-unit').value.trim();
    const trHourRaw  = document.getElementById('na-hour').value.trim();
    const trMinRaw   = document.getElementById('na-min').value.trim();
    const trKeywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    const trDesc     = document.getElementById('na-desc').value.trim();

    if(!trSite){
      showToast(currentLang==='en'?'Select site':'사이트를 선택하세요','err');
      document.getElementById('na-site')?.focus(); return;
    }
    if(!trUnit){
      showToast(currentLang==='en'?'Select unit':'호기를 선택하세요','err');
      document.getElementById('na-unit')?.focus(); return;
    }
    // 조치 시간: hour, min 둘 다 빈 값이면 미입력으로 판정 (0시간 0분은 허용 안 함)
    if(trHourRaw === '' && trMinRaw === ''){
      showToast(currentLang==='en'?'Enter resolution time':'조치 시간을 입력하세요','err');
      document.getElementById('na-hour')?.focus(); return;
    }
    const trHour = parseInt(trHourRaw)||0;
    const trMin  = parseInt(trMinRaw)||0;
    if(trHour === 0 && trMin === 0){
      showToast(currentLang==='en'?'Resolution time must be > 0':'조치 시간은 0보다 커야 합니다','err');
      document.getElementById('na-hour')?.focus(); return;
    }
    if(trKeywords.length === 0){
      showToast(currentLang==='en'?'Enter at least one keyword':'키워드를 하나 이상 입력하세요','err');
      document.getElementById('na-keywords')?.focus(); return;
    }
    if(!trDesc){
      showToast(currentLang==='en'?'Enter description':'발생 현상을 입력하세요','err');
      document.getElementById('na-desc')?.focus(); return;
    }
  }

  let code = codeVal ? parseInt(codeVal) : null;
  if(!code){
    const existCodes = alarms.filter(a=>a.vision===vision&&a.type===type).map(a=>a.code);
    code = Math.max(9000, ...existCodes.filter(c=>c>=9000).concat([9000])) + 1;
  }
  const dup = alarms.find(a=>a.vision===vision&&a.type===type&&a.code===code);
  if(dup){ showToast(`${currentLang==='en'?'Duplicate code: ':'이미 존재하는 코드입니다: '}(${vision} ${type} C${code})`,'err'); return; }

  const newId = Math.max(...alarms.map(a=>a.id).concat([0])) + 1;
  const createdDate = document.getElementById('na-created-date')?.value || new Date().toISOString().slice(0,10);

  // 작성자: 로그인 프로필 이름 자동 입력
  const authorName = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : '';

  const newAlarm = {
    id:newId, vision, type, code, name,
    direct_cause: isTrouble?'':document.getElementById('na-cause').value.trim(),
    occurrence:   isTrouble?'':document.getElementById('na-occur').value.trim(),
    influence:    isTrouble?'':document.getElementById('na-infl').value.trim(),
    related_alarms: isTrouble?'':document.getElementById('na-related').value.trim(),
    plc_output:'', timing:'', log:'',
    severity: isTrouble ? document.getElementById('na-sev-t').value : document.getElementById('na-sev').value,
    isCustom: true,
    created_date: createdDate
  };
  if(isTrouble){
    newAlarm.tr_site     = document.getElementById('na-site').value.trim().toUpperCase();
    newAlarm.tr_unit     = document.getElementById('na-unit').value.trim().toUpperCase();
    newAlarm.tr_hour     = parseInt(document.getElementById('na-hour').value)||0;
    newAlarm.tr_min      = parseInt(document.getElementById('na-min').value)||0;
    newAlarm.tr_keywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    newAlarm.tr_desc     = document.getElementById('na-desc').value.trim();
    newAlarm.tr_author   = authorName; // 작성자 자동 입력 (로그인 이름)
  }

  customAlarms.push(newAlarm);
  await saveCustomAlarms();
  rebuildAlarms();
  addAudit('알람 추가', ak(newAlarm), authorName || (currentLang==='en'?'User':'사용자'), '', name);
  await saveAudit();
  closeModal('add-alarm-mo');
  applyFilters(); updateStats(); renderRight();
  showToast(`${currentLang==='en'?'Added: ':'등록됨: '}${vision.replace('Vision','')} ${type} C${code}`, 'ok');
  setTimeout(()=>selAlarm(newId), 200);
}

async function saveEditAlarm(id){
  const idx = customAlarms.findIndex(a=>a.id===id);
  if(idx<0){ showToast(currentLang==='en'?'Alarm not found':'수정할 알람을 찾을 수 없습니다','err'); return; }
  const a = customAlarms[idx];
  const isTrouble = document.getElementById('na-type').value === 'Trouble';

  const nameVal = document.getElementById('na-name').value.trim();
  if(!nameVal){ showToast(currentLang==='en'?'Enter alarm/issue name':'알람명/이슈명을 입력하세요','err'); return; }

  // ═══════ Trouble 필수 필드 검증 (수정 시에도 동일 적용) ═══════
  if(isTrouble){
    const trSite     = document.getElementById('na-site').value.trim();
    const trUnit     = document.getElementById('na-unit').value.trim();
    const trHourRaw  = document.getElementById('na-hour').value.trim();
    const trMinRaw   = document.getElementById('na-min').value.trim();
    const trKeywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    const trDesc     = document.getElementById('na-desc').value.trim();

    if(!trSite){
      showToast(currentLang==='en'?'Select site':'사이트를 선택하세요','err');
      document.getElementById('na-site')?.focus(); return;
    }
    if(!trUnit){
      showToast(currentLang==='en'?'Select unit':'호기를 선택하세요','err');
      document.getElementById('na-unit')?.focus(); return;
    }
    if(trHourRaw === '' && trMinRaw === ''){
      showToast(currentLang==='en'?'Enter resolution time':'조치 시간을 입력하세요','err');
      document.getElementById('na-hour')?.focus(); return;
    }
    const trHour = parseInt(trHourRaw)||0;
    const trMin  = parseInt(trMinRaw)||0;
    if(trHour === 0 && trMin === 0){
      showToast(currentLang==='en'?'Resolution time must be > 0':'조치 시간은 0보다 커야 합니다','err');
      document.getElementById('na-hour')?.focus(); return;
    }
    if(trKeywords.length === 0){
      showToast(currentLang==='en'?'Enter at least one keyword':'키워드를 하나 이상 입력하세요','err');
      document.getElementById('na-keywords')?.focus(); return;
    }
    if(!trDesc){
      showToast(currentLang==='en'?'Enter description':'발생 현상을 입력하세요','err');
      document.getElementById('na-desc')?.focus(); return;
    }
  }

  a.vision = document.getElementById('na-vision').value;
  a.type   = document.getElementById('na-type').value;
  a.name   = nameVal;
  a.severity = isTrouble ? document.getElementById('na-sev-t').value : document.getElementById('na-sev').value;
  // Admin만 등록일 수정 가능
  if(isAdmin){
    const dateVal = document.getElementById('na-created-date')?.value;
    if(dateVal) a.created_date = dateVal;
  }
  if(!isTrouble){
    a.direct_cause    = document.getElementById('na-cause').value.trim();
    a.occurrence      = document.getElementById('na-occur').value.trim();
    a.influence       = document.getElementById('na-infl').value.trim();
    a.related_alarms  = document.getElementById('na-related').value.trim();
    delete a.tr_site; delete a.tr_unit; delete a.tr_hour; delete a.tr_min; delete a.tr_keywords; delete a.tr_desc;
    delete a.tr_author;
  } else {
    a.tr_site     = document.getElementById('na-site').value.trim().toUpperCase();
    a.tr_unit     = document.getElementById('na-unit').value.trim().toUpperCase();
    a.tr_hour     = parseInt(document.getElementById('na-hour').value)||0;
    a.tr_min      = parseInt(document.getElementById('na-min').value)||0;
    a.tr_keywords = document.getElementById('na-keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
    a.tr_desc     = document.getElementById('na-desc').value.trim();

    // ═══════ 작성자 수정 권한: 본인(=기존작성자) 또는 Admin, 또는 기존에 작성자 없는 경우 누구나 ═══════
    const authorEl  = document.getElementById('na-author');
    const newAuthor = authorEl ? authorEl.value.trim() : '';
    const oldAuthor = a.tr_author || '';
    const myName    = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : '';
    // 편집 허용 조건:
    // 1) 기존 작성자 미지정 (빈 값) → 누구나 채울 수 있음
    // 2) Admin 권한
    // 3) 본인 (현재 로그인 이름 === 기존 작성자)
    const canEditAuthor = !oldAuthor || isAdmin || (myName && myName === oldAuthor);
    if(canEditAuthor){
      a.tr_author = newAuthor; // 빈 값도 허용 (Admin이 지울 수도 있음)
    }
    // 편집 권한 없으면 기존 값 유지 (변경 무시)
  }

  customAlarms[idx] = a;
  await saveCustomAlarms();
  rebuildAlarms();
  const actor = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : (currentLang==='en'?'User':'사용자');
  addAudit('알람 수정', ak(a), actor, '', a.name);
  await saveAudit();
  closeModal('add-alarm-mo');
  applyFilters(); updateStats(); renderRight();
  if(curAlarm&&curAlarm.id===id){ const upd=alarms.find(x=>x.id===id); if(upd) renderDetail(upd); }
  showToast(currentLang==='en'?'Alarm updated ✅':'알람 수정 완료 ✅', 'ok');
}

async function deleteCustomAlarm(id){
  const a = alarms.find(x=>x.id===id);
  if(!a||!a.isCustom){ showToast(currentLang==='en'?'Cannot delete default alarms':'기본 알람은 삭제할 수 없습니다','err'); return; }
  const msg = currentLang==='en'
    ? `Delete this alarm?\n\n${a.vision} ${a.type} C${a.code}\n${a.name}`
    : `알람을 삭제하시겠습니까?\n\n${a.vision} ${a.type} C${a.code}\n${a.name}`;
  if(!confirm(msg)){ return; }

  customAlarms = customAlarms.filter(x=>x.id!==id);
  await saveCustomAlarms();
  rebuildAlarms();
  const k=ak(a);
  if(actions[k]){ delete actions[k]; await saveActions(); }
  addAudit('알람 삭제', k, currentLang==='en'?'User':'사용자', a.name, '');
  await saveAudit();
  if(curAlarm&&curAlarm.id===id){
    curAlarm=null;
    const dp=document.getElementById('dp-content');
    if(dp) dp.innerHTML=`<div class="empty-s"><div class="empty-ico">🔍</div><div>${currentLang==='en'?'Select an alarm':'알람을 선택하세요'}</div></div>`;
  }
  applyFilters(); updateStats(); renderRight();
  showToast(currentLang==='en'?'Alarm deleted':'알람 삭제됨', 'ok');
}

// ══════════════════════════════════════
//  VISION / TYPE / SITE MANAGE (Admin)
// ══════════════════════════════════════
let vmCurrentSite = '';

function openVisionManage(){
  if(!isAdmin){ showToast(currentLang==='en'?'Admin required':'Admin 권한이 필요합니다','err'); return; }
  switchVmTab('vision');
  document.getElementById('vision-manage-mo').classList.add('open');
}

function switchVmTab(tab){
  ['vision','type','site'].forEach(tp=>{
    document.getElementById(`vm-tab-${tp}`)?.classList.toggle('on', tp===tab);
    const pane=document.getElementById(`vm-pane-${tp}`);
    if(pane) pane.style.display = tp===tab?'':'none';
  });
  if(tab==='vision') renderVisionManageModal();
  if(tab==='type')   renderTypeManageModal();
  if(tab==='site')   renderSiteManageModal();
}

function renderVisionManageModal(){
  const base=['NotchingVision','FoilVision','DelaminationVision','NGVision'];
  const baseLabel = currentLang==='en' ? 'default' : '기본';
  document.getElementById('vm-vision-list').innerHTML=[
    ...base.map(v=>`<div class="vm-item"><span>${v}</span><span style="font-size:10px;color:var(--text3)">${baseLabel}</span></div>`),
    ...customVisions.map((v,i)=>`<div class="vm-item"><span>${v}</span><button onclick="deleteCustomVision(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`)
  ].join('');
}

function renderTypeManageModal(){
  const base=['HOST','Vision','Trouble'];
  const baseLabel = currentLang==='en' ? 'default' : '기본';
  document.getElementById('vm-type-list').innerHTML=[
    ...base.map(tp=>`<div class="vm-item"><span>${tp}</span><span style="font-size:10px;color:var(--text3)">${baseLabel}</span></div>`),
    ...customTypes.map((tp,i)=>`<div class="vm-item"><span>${tp}</span><button onclick="deleteCustomType(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`)
  ].join('');
}

function renderSiteManageModal(){
  const noSite = currentLang==='en' ? 'No sites' : '사이트 없음';
  const selectSite = currentLang==='en' ? '← Select a site' : '← 사이트를 선택하세요';
  const noUnit = currentLang==='en' ? 'No lines' : '호기 없음';
  const unitUnit = currentLang==='en' ? 'lines' : '개';

  document.getElementById('vm-site-list').innerHTML=siteUnits.map((su,i)=>
    `<div class="vm-item ${su.site===vmCurrentSite?'on':''}" style="${su.site===vmCurrentSite?'border-color:var(--accent);background:var(--bg4)':''}" onclick="selectVmSite('${su.site}')">
      <span style="cursor:pointer;flex:1">${su.site}</span>
      <span style="font-size:10px;color:var(--text3)">${su.units.length}${unitUnit}</span>
      <button onclick="event.stopPropagation();deleteSite(${i})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer;margin-left:4px">🗑️</button>
    </div>`
  ).join('')||`<div style="font-size:11px;color:var(--text3)">${noSite}</div>`;

  const suSel=siteUnits.find(x=>x.site===vmCurrentSite);
  document.getElementById('vm-selected-site').textContent=vmCurrentSite?`— ${vmCurrentSite}`:'';
  document.getElementById('vm-unit-add-row').style.display=vmCurrentSite?'flex':'none';
  document.getElementById('vm-unit-list').innerHTML=vmCurrentSite
    ? (suSel ? sortUnits(suSel.units).map((u,i)=>
        `<div class="vm-item"><span>${u}</span><button onclick="deleteUnit('${vmCurrentSite}',${suSel.units.indexOf(u)})" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer">🗑️</button></div>`
      ).join('')||`<div style="font-size:11px;color:var(--text3)">${noUnit}</div>` : '')
    : `<div style="font-size:11px;color:var(--text3)">${selectSite}</div>`;
}

function selectVmSite(site){ vmCurrentSite=site; renderSiteManageModal(); }

async function addCustomVision(){
  const v=document.getElementById('vm-vision-inp').value.trim();
  if(!v){ showToast(currentLang==='en'?'Enter Vision name':'Vision명을 입력하세요','err'); return; }
  const base=['NotchingVision','FoilVision','DelaminationVision','NGVision'];
  if([...base,...customVisions].includes(v)){ showToast(currentLang==='en'?'Already exists':'이미 존재합니다','err'); return; }
  customVisions.push(v);
  document.getElementById('vm-vision-inp').value='';
  await saveCustomVisions(); renderVisionSelects(); renderVisionManageModal();
  showToast(`${currentLang==='en'?'Vision added: ':'Vision 추가됨: '}${v}`,'ok');
}

async function deleteCustomVision(i){
  if(!confirm(`"${customVisions[i]}" ${currentLang==='en'?'Vision — delete?':'Vision을 삭제하시겠습니까?'}`)) return;
  customVisions.splice(i,1);
  await saveCustomVisions(); renderVisionSelects(); renderVisionManageModal();
  showToast(currentLang==='en'?'Vision deleted':'Vision 삭제됨','ok');
}

async function addCustomType(){
  const tp=document.getElementById('vm-type-inp').value.trim();
  if(!tp){ showToast(currentLang==='en'?'Enter type name':'타입명을 입력하세요','err'); return; }
  const base=['HOST','Vision','Trouble'];
  if([...base,...customTypes].includes(tp)){ showToast(currentLang==='en'?'Already exists':'이미 존재합니다','err'); return; }
  customTypes.push(tp);
  document.getElementById('vm-type-inp').value='';
  await saveCustomTypes(); renderVisionSelects(); renderTypeManageModal();
  showToast(`${currentLang==='en'?'Type added: ':'타입 추가됨: '}${tp}`,'ok');
}

async function deleteCustomType(i){
  if(!confirm(`"${customTypes[i]}" ${currentLang==='en'?'— delete?':'타입을 삭제하시겠습니까?'}`)) return;
  customTypes.splice(i,1);
  await saveCustomTypes(); renderVisionSelects(); renderTypeManageModal();
  showToast(currentLang==='en'?'Type deleted':'타입 삭제됨','ok');
}

async function addSite(){
  const v=document.getElementById('vm-site-inp').value.trim().toUpperCase();
  if(!v){ showToast(currentLang==='en'?'Enter site name':'사이트명을 입력하세요','err'); return; }
  if(siteUnits.find(x=>x.site===v)){ showToast(currentLang==='en'?'Already exists':'이미 존재합니다','err'); return; }
  siteUnits.push({site:v,units:[]}); vmCurrentSite=v;
  document.getElementById('vm-site-inp').value='';
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`${currentLang==='en'?'Site added: ':'사이트 추가됨: '}${v}`,'ok');
}

async function deleteSite(i){
  const s=siteUnits[i]; if(!s) return;
  const msg = currentLang==='en'
    ? `Delete site "${s.site}" with ${s.units.length} lines?`
    : `"${s.site}" 사이트와 호기 ${s.units.length}개를 삭제하시겠습니까?`;
  if(!confirm(msg)) return;
  if(vmCurrentSite===s.site) vmCurrentSite='';
  siteUnits.splice(i,1);
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`${currentLang==='en'?'Site deleted: ':'사이트 삭제됨: '}${s.site}`,'ok');
}

async function addUnit(){
  if(!vmCurrentSite){ showToast(currentLang==='en'?'Select a site first':'사이트를 먼저 선택하세요','err'); return; }
  const raw=document.getElementById('vm-unit-inp').value.trim();
  if(!raw){ showToast(currentLang==='en'?'Enter line name':'호기명을 입력하세요','err'); return; }
  const su=siteUnits.find(x=>x.site===vmCurrentSite); if(!su) return;
  const added=raw.split(',').map(u=>u.trim()).filter(u=>u&&!su.units.includes(u));
  if(!added.length){ showToast(currentLang==='en'?'Already exists or empty':'이미 존재하거나 빈 값입니다','err'); return; }
  su.units.push(...added);
  document.getElementById('vm-unit-inp').value='';
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`${currentLang==='en'?'Lines added: ':'호기 추가됨: '}${added.join(', ')}`,'ok');
}

async function deleteUnit(site,i){
  const su=siteUnits.find(x=>x.site===site); if(!su) return;
  const u=su.units[i];
  const msg = currentLang==='en'
    ? `Delete line "${site} - ${u}"?`
    : `"${site} - ${u}" 호기를 삭제하시겠습니까?`;
  if(!confirm(msg)) return;
  su.units.splice(i,1);
  await saveSiteUnits(); renderSiteManageModal();
  showToast(`${currentLang==='en'?'Line deleted: ':'호기 삭제됨: '}${u}`,'ok');
}

// ══════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════
function handleUpload(event){
  const files=Array.from(event.target.files);
  const status=document.getElementById('up-status');
  if(!files.length) return;
  status.innerHTML=`<span class="spin"></span> ${currentLang==='en'?'Parsing...':'파싱 중...'}`;
  let done=0, added=0;
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        if(typeof XLSX==='undefined') throw new Error(currentLang==='en'?'SheetJS not loaded':'SheetJS 미로드');
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
    status.innerHTML = currentLang==='en'
      ? `✅ ${files.length} file(s), ${added} new entries added`
      : `✅ ${files.length}개 파일, 신규 ${added}건 추가`;
    addAudit('Excel 업로드',files.map(f=>f.name).join(','),'User','',`+${added}건`);
    applyFilters(); updateStats(); renderRight();
    showToast(`${added}${t('added')}`,'ok');
  }
}

// ══════════════════════════════════════
//  BACKUP / RESTORE
// ══════════════════════════════════════

function openBackupModal(){
  if(!isAdmin){ showToast('관리자 권한 필요','err'); return; }
  const mo = document.getElementById('backup-mo');
  if(mo) mo.classList.add('open');
}
function closeBackupModal(){
  const mo = document.getElementById('backup-mo');
  if(mo) mo.classList.remove('open');
}

async function exportBackup(){
  showToast('⏳ 백업 데이터 수집 중...','');
  let source = 'localStorage';
  let data = {
    actions:       gS('vam_actions',{}),
    customAlarms:  gS('vam_custom_alarms',[]),
    alarmEdits:    gS('vam_alarm_edits',{}),
    auditLog:      gS('vam_audit',[]),
    customVisions: gS('vam_custom_visions',[]),
    customTypes:   gS('vam_custom_types',[]),
    siteUnits:     gS('vam_site_units',[])
  };
  if(fbOnline){
    try{
      const [actD,editD,auditD,caD,cvD,ctD,suD] = await Promise.all([
        fbGet('actions'),fbGet('alarmEdits'),fbGet('auditLog'),
        fbGet('customAlarms'),fbGet('customVisions'),fbGet('customTypes'),fbGet('siteUnits')
      ]);
      if(actD  && typeof actD==='object')  data.actions       = actD;
      if(editD && typeof editD==='object') data.alarmEdits    = editD;
      if(auditD) data.auditLog     = Array.isArray(auditD)?auditD:Object.values(auditD);
      if(caD)    data.customAlarms = Array.isArray(caD)?caD:Object.values(caD).filter(Boolean);
      if(cvD)    data.customVisions= Array.isArray(cvD)?cvD:Object.values(cvD).filter(Boolean);
      if(ctD)    data.customTypes  = Array.isArray(ctD)?ctD:Object.values(ctD).filter(Boolean);
      if(suD)    data.siteUnits    = Array.isArray(suD)?suD:Object.values(suD).filter(x=>x&&typeof x==='object');
      source = 'Firebase';
    } catch(e){ source = 'localStorage (Firebase 오류)'; }
  }
  const actCount = Object.values(data.actions||{}).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0);
  const backup = {
    _date: new Date().toISOString(), _version: 2,
    _source: source,
    _stats: { actions: actCount, customAlarms: (data.customAlarms||[]).length },
    ...data
  };
  const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vam_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 10000);
  showToast(`✅ 백업 완료 (${source}) — 조치방안 ${actCount}건`,'ok');
}

async function importBackup(event){
  const file = event.target.files[0];
  if(!file) return;
  const fnEl = document.getElementById('restore-file-name');
  if(fnEl) fnEl.textContent = file.name;
  event.target.value = '';
  try{
    const text = await file.text();
    const backup = JSON.parse(text);
    if(!backup._version) throw new Error('올바른 백업 파일이 아닙니다');
    const backupDate = (backup._date||'').slice(0,16).replace('T',' ')||'날짜 불명';
    const src = backup._source||'?';
    let cAct=0, cAlarm=0, cEdit=0;
    if(backup.actions && typeof backup.actions==='object'){
      Object.entries(backup.actions).forEach(([k,arr])=>{
        if(!Array.isArray(arr)) return;
        const cur = actions[k];
        if(!Array.isArray(cur)) return;
        const curKeys = new Set(cur.map(x=>(x.author||'')+'|'+(x.date||'')));
        arr.forEach(x=>{ if(curKeys.has((x.author||'')+'|'+(x.date||''))) cAct++; });
      });
    }
    if(Array.isArray(backup.customAlarms)){
      const curIds = new Set(customAlarms.map(a=>a.id));
      backup.customAlarms.forEach(a=>{ if(curIds.has(a.id)) cAlarm++; });
    }
    if(backup.alarmEdits && typeof backup.alarmEdits==='object'){
      Object.keys(backup.alarmEdits).forEach(k=>{ if(alarmEdits[k]) cEdit++; });
    }
    const step1 = confirm(
      `📂 백업: ${backupDate} (출처: ${src})\n\n`+
      `충돌 항목:\n  조치방안: ${cAct}건\n  커스텀 알람: ${cAlarm}건\n  알람 수정이력: ${cEdit}건\n\n`+
      `[확인] 현재 우선 (충돌 시 현재 유지, 신규만 추가)\n`+
      `[취소] 다음 단계 선택`
    );
    let mode;
    if(step1){ mode='keep-current'; }
    else {
      const step2 = confirm(
        `[확인] 백업 우선 (충돌 시 백업으로 교체)\n`+
        `[취소] 완전 덮어쓰기`
      );
      mode = step2 ? 'backup-first' : 'overwrite';
    }
    if(backup.actions && typeof backup.actions==='object'){
      if(mode==='overwrite'){ actions=backup.actions; }
      else {
        const merged={...actions};
        Object.entries(backup.actions).forEach(([k,arr])=>{
          if(!Array.isArray(arr)) return;
          const existing=Array.isArray(merged[k])?merged[k]:[];
          const curKeys=new Set(existing.map(x=>(x.author||'')+'|'+(x.date||'')));
          if(mode==='keep-current'){
            merged[k]=[...existing,...arr.filter(x=>!curKeys.has((x.author||'')+'|'+(x.date||'')))];
          } else {
            const bkKeys=new Set(arr.map(x=>(x.author||'')+'|'+(x.date||'')));
            merged[k]=[...arr,...existing.filter(x=>!bkKeys.has((x.author||'')+'|'+(x.date||'')))];
          }
        });
        actions=merged;
      }
      await saveActions();
    }
    if(Array.isArray(backup.customAlarms)){
      if(mode==='overwrite'){ customAlarms=backup.customAlarms; }
      else {
        const curIds=new Set(customAlarms.map(a=>a.id));
        if(mode==='keep-current'){
          customAlarms=[...customAlarms,...backup.customAlarms.filter(a=>!curIds.has(a.id))];
        } else {
          const bkIds=new Set(backup.customAlarms.map(a=>a.id));
          customAlarms=[...backup.customAlarms,...customAlarms.filter(a=>!bkIds.has(a.id))];
        }
      }
      await saveCustomAlarms();
    }
    if(backup.alarmEdits && typeof backup.alarmEdits==='object'){
      alarmEdits = mode==='overwrite' ? backup.alarmEdits
        : mode==='keep-current' ? {...backup.alarmEdits,...alarmEdits}
        : {...alarmEdits,...backup.alarmEdits};
      await saveAlarmEdits();
    }
    if(Array.isArray(backup.auditLog)){
      if(mode==='overwrite'){ auditLog=backup.auditLog; }
      else {
        const curKeys=new Set(auditLog.map(h=>(h.date||'')+'|'+(h.type||'')+'|'+(h.target||'')));
        auditLog=[...auditLog,...backup.auditLog.filter(h=>!curKeys.has((h.date||'')+'|'+(h.type||'')+'|'+(h.target||'')))].sort((a,b)=>a.date>b.date?1:-1);
      }
      await saveAudit();
    }
    if(Array.isArray(backup.customVisions)){ customVisions=[...new Set([...customVisions,...backup.customVisions])]; await saveCustomVisions(); }
    if(Array.isArray(backup.customTypes)){   customTypes=[...new Set([...customTypes,...backup.customTypes])];       await saveCustomTypes(); }
    if(Array.isArray(backup.siteUnits)){
      if(mode==='overwrite'){ siteUnits=backup.siteUnits; }
      else {
        const merged=[...siteUnits];
        backup.siteUnits.forEach(bSu=>{
          const exist=merged.find(x=>x.site===bSu.site);
          if(exist){ exist.units=[...new Set([...exist.units,...bSu.units])]; }
          else { merged.push(bSu); }
        });
        siteUnits=merged;
      }
      await saveSiteUnits();
    }
    addAudit('백업 복원','backup-import','Admin','',mode+' / '+backupDate);
    await saveAudit();
    rebuildAlarms();
    applyFilters(); updateStats(); renderRight();
    if(curAlarm){ const u=alarms.find(x=>x.id===curAlarm.id); if(u){curAlarm=u;renderDetail(u);} else {curAlarm=null;document.getElementById('dp').classList.remove('open');} }
    const modeLabel={'keep-current':'현재 우선','backup-first':'백업 우선','overwrite':'완전 덮어쓰기'}[mode]||mode;
    showToast(`✅ 복원 완료 (${modeLabel})`,'ok');
  } catch(e){
    showToast('❌ 복원 실패: '+e.message,'err');
    console.error('[importBackup]',e);
  }
}
