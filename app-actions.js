// INTEKPLUS ALARM Manager — app-actions.js
// 의존: app-core.js → app-render.js

// ══════════════════════════════════════
//  EDIT (Admin)
// ══════════════════════════════════════
function showEF(k){
  if(!isAdmin){ showToast(currentLang==='en'?'Admin required':'관리자 권한 필요','err'); return; }
  const a=alarms.find(x=>ak(x)===k); if(!a) return;
  const g=ga(a);
  const lbl = currentLang==='en'
    ? {name:'Alarm Name',sev:'Severity',cause:'Direct Cause',occ:'Occurrence',inf:'Influence',rel:'Related Alarms',plc:'PLC Output',save:'Save',cancel:'Cancel',mode:'✏️ Admin Edit Mode'}
    : {name:'알람명',sev:'심각도',cause:'직접 원인',occ:'발생 조건',inf:'영향 조건',rel:'관련 알람',plc:'PLC 출력',save:'저장',cancel:'취소',mode:'✏️ 관리자 수정 모드'};
  document.getElementById('ef-area').innerHTML=`
    <div class="ef">
      <div style="font-size:11px;font-weight:500;color:var(--yellow);margin-bottom:4px">${lbl.mode}</div>
      <div class="efr">
        <div><label>${lbl.name}</label><textarea id="ef-name" rows="1">${esc(g.name)}</textarea></div>
        <div><label>${lbl.sev}</label>
          <select class="fc" id="ef-sev" style="margin:0;font-size:12px;padding:6px 9px">
            <option value="Critical" ${g.severity==='Critical'?'selected':''}>Critical</option>
            <option value="Warning" ${g.severity==='Warning'?'selected':''}>Warning</option>
            <option value="Info" ${g.severity==='Info'?'selected':''}>Info</option>
          </select>
        </div>
      </div>
      <label>${lbl.cause}</label><textarea id="ef-dir" rows="2">${esc(g.direct_cause)}</textarea>
      <label>${lbl.occ}</label><textarea id="ef-occ" rows="2">${esc(g.occurrence)}</textarea>
      <label>${lbl.inf}</label><textarea id="ef-inf" rows="2">${esc(g.influence)}</textarea>
      <label>${lbl.rel}</label><textarea id="ef-rel" rows="1">${esc(g.related_alarms)}</textarea>
      <label>${lbl.plc}</label><textarea id="ef-plc" rows="1">${esc(g.plc_output)}</textarea>
      <div style="display:flex;gap:6px;margin-top:3px">
        <button class="btn primary sm" onclick="saveEdit('${k}')">${lbl.save}</button>
        <button class="btn sm" onclick="document.getElementById('ef-area').innerHTML=''">${lbl.cancel}</button>
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
  showToast(currentLang==='en'?'Updated ✅':'수정 완료','ok');
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
  const cnt=document.getElementById('aa-cnt');
  if(cnt) cnt.textContent = currentLang==='en' ? `Total ${all.length} items` : `총 ${all.length}건`;

  const html=all.length?all.map(ac=>{
    const g=ga(ac._a);
    const sCls=SCLS[ac.status||'']||'sp none';
    const sLbl=slbl(ac.status);
    // ac.text_en: EN 모드에서 번역본이 있으면 사용
    const displayText = (currentLang==='en' && ac.text_en) ? ac.text_en : ac.text;
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
      <div class="ac-txt">${esc(displayText)}</div>
      ${(ac.helpful||0)>0?`<div style="font-size:10px;color:var(--green);margin-top:4px">👍 ${ac.helpful}</div>`:''}
    </div>`;
  }).join(''):`<div style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center">${t('no_actions_all')}</div>`;

  if(mobile){ const el=document.getElementById('mob-acts-body'); if(el)el.innerHTML=html; }
  else{ document.getElementById('aap-body').innerHTML=html; }
}

// ══════════════════════════════════════
//  FAVORITES / RECENT
// ══════════════════════════════════════
function toggleFav(k){
  favorites.includes(k) ? (favorites=favorites.filter(x=>x!==k),showToast(currentLang==='en'?'Removed from favorites':'즐겨찾기 해제'))
    : (favorites=[k,...favorites], showToast(currentLang==='en'?'Added to favorites ⭐':'즐겨찾기 추가 ⭐','ok'));
  sS('vam_favorites',favorites); renderFavorites();
  if(curAlarm&&ak(curAlarm)===k) renderDetail(curAlarm);
  renderList(document.getElementById('srch').value);
}

function renderFavorites(){
  const list=document.getElementById('fav-list');
  if(!favorites.length){ list.innerHTML=`<div style="font-size:11px;color:var(--text3);padding:3px 6px">${t('none')}</div>`; return; }
  list.innerHTML=favorites.slice(0,8).map(k=>{
    const p=k.split('_');
    return `<div class="si" onclick="jumpTo('${k}')"><span style="color:var(--yellow)">★</span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
  }).join('');
}

function renderRecent(){
  const list=document.getElementById('recent-list');
  if(!recentViewed.length){ list.innerHTML=`<div style="font-size:11px;color:var(--text3);padding:3px 6px">${t('none')}</div>`; return; }
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

  // Recent actions
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
    const displayText = (currentLang==='en' && ac.text_en) ? ac.text_en : (ac.text||'');
    return `<div class="hi" onclick="jumpTo('${ac._k}')">
      <span class="hi-t">${g.vision.replace('Vision','')} · Code ${g.code}</span>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(displayText.slice(0,45))}${displayText.length>45?'…':''}</div>
      <div class="hi-m">${ac.date} · ${esc(ac.author)} <span class="${sCls}" style="font-size:9px;padding:1px 5px">${slbl(ac.status)}</span></div>
    </div>`;
  }).join('')||`<div style="font-size:11px;color:var(--text3)">${t('none')}</div>`;

  // Audit log
  const typeLabelEn={
    '조치방안 등록':'Action Added','조치방안 수정':'Action Edited',
    '조치방안 삭제':'Action Deleted','알람 정보 수정':'Alarm Edited',
    'Excel 업로드':'Excel Upload','알람 추가':'Alarm Added'
  };
  const typeIcon={'조치방안 등록':'✅','조치방안 수정':'✏️','조치방안 삭제':'🗑️','알람 정보 수정':'🔧','Excel 업로드':'📤','알람 추가':'➕'};
  document.getElementById('hist-list').innerHTML=auditLog.slice(-10).reverse().map(h=>{
    const icon = typeIcon[h.type]||'📝';
    const label = currentLang==='en' ? (typeLabelEn[h.type]||h.type) : h.type;
    return `<div class="hi">
      <span class="hi-t">${icon} ${esc(label)}</span>
      <div style="font-size:10px;color:var(--text2);margin-top:1px">${esc(h.target.split('_').slice(0,3).join(' / '))}</div>
      <div class="hi-m">${esc(h.date)} · ${esc(h.user)}</div>
    </div>`;
  }).join('')||`<div style="font-size:11px;color:var(--text3)">${t('none')}</div>`;
}
