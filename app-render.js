// INTEKPLUS ALARM Manager — app-render.js
// 의존: app-core.js

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
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════
function updateStats(){
  const total = alarms.length;
  const totalActs = Object.values(actions).reduce((s,a)=>s+(Array.isArray(a)?a.length:0), 0);
  const noAct = alarms.filter(a=>(actions[ak(a)]||[]).length===0).length;
  const resolved = Object.values(actions).flat().filter(a=>a&&a.status==='resolved').length;
  ['st-total'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=total; });
  ['st-acts'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=totalActs; });
  ['st-noact'].forEach(id=>{ const el=document.getElementById(id); if(el)el.textContent=noAct; });
  const sr=document.getElementById('st-resolved'); if(sr)sr.textContent=resolved;
}

// ══════════════════════════════════════
//  FILTERS & LIST
// ══════════════════════════════════════
function applyFilters(){
  // 모바일 필터 시트가 열려있을 경우 m-v / m-t 값을 우선 사용
  const mobV = document.getElementById('m-v');
  const mobT = document.getElementById('m-t');
  const v  = (mobV && document.getElementById('mob-sheet').style.display==='flex')
             ? mobV.value
             : document.getElementById('sel-v').value;
  const tp = (mobT && document.getElementById('mob-sheet').style.display==='flex')
             ? mobT.value
             : document.getElementById('sel-t').value;
  const raw = (document.getElementById('srch').value||'').trim().replace(/\s+/g,' ').toLowerCase();
  const qTerms = raw ? raw.split(' ').filter(Boolean) : [];
  const sort=document.getElementById('sort-sel').value;
  const noActOnly=document.getElementById('noact-f').checked;

  filtered = alarms.filter(a=>{
    const g=ga(a);
    if(v&&g.vision!==v) return false;
    if(tp&&g.type!==tp) return false;
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

  pgCur = 1;
  renderList(raw);
  document.getElementById('res-cnt').textContent = filtered.length + t('alarm_count');
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
    list.innerHTML=`<div class="empty-s"><div class="empty-ico">🔍</div><div>${t('no_result')}</div></div>`;
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
        <button class="star-b ${isFav?'on':''}" onclick="event.stopPropagation();toggleFav('${k}')" title="${isFav?t('fav_remove'):t('fav_add')}">★</button>
      </div>
      <div class="ai-name">${needsTranslation(g.name) ? `<span class="translating">${hl(g.name,q)}</span>` : hl(g.name,q)}</div>
      <div class="ai-cause">${
        g.type==='Trouble'
          ? hl([g.tr_site, g.tr_unit, (g.tr_keywords||[]).join(' · ')].filter(Boolean).join(' / ') || (g.tr_desc||'').split('\n')[0], q)
          : hl((g.direct_cause||'').split('\n')[0], q)
      }</div>
      ${hasActs?`<div class="ai-acts"><span class="hc">${currentLang==='en'?`Actions ${acts.length}`:`조치방안 ${acts.length}건`}</span>${sdot}</div>`:''}
    </div>`;
  }).join('');

  renderPagination(filtered.length);
}

function renderPagination(total){
  const bar = document.getElementById('pg-bar');
  if(!bar) return;
  if(total <= PG_THRESHOLD){ bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  const totalPages = Math.ceil(total / pgSize);
  const start = (pgCur-1)*pgSize + 1;
  const end   = Math.min(pgCur*pgSize, total);
  document.getElementById('pg-info').textContent = `${start}-${end} / ${total}`;
  document.getElementById('pg-prev').disabled = pgCur <= 1;
  document.getElementById('pg-next').disabled = pgCur >= totalPages;

  const range = 2;
  let pages = [];
  for(let i = Math.max(1, pgCur-range); i <= Math.min(totalPages, pgCur+range); i++) pages.push(i);
  if(!pages.includes(1)) pages = [1, '…', ...pages];
  if(!pages.includes(totalPages)) pages = [...pages, '…', totalPages];

  document.getElementById('pg-nums').innerHTML = pages.map(p =>
    p === '…'
      ? `<span style="color:var(--text3);padding:0 2px;font-size:12px">…</span>`
      : `<button class="pg-num${p===pgCur?' on':''}" onclick="goPage(${p})">${p}</button>`
  ).join('');

  const sel = document.getElementById('pg-size');
  if(sel) sel.value = pgSize;
}

function changePage(dir){
  const totalPages = Math.ceil(filtered.length / pgSize);
  pgCur = Math.max(1, Math.min(totalPages, pgCur + dir));
  renderList(document.getElementById('srch').value);
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
    ? `<span class="syncing"><span class="live-dot"></span>${t('sync_live')}</span>`
    : `<span class="syncing" style="color:var(--yellow)">${t('sync_local')}</span>`;

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
        <button class="btn sm ${isFav?'':'primary'}" onclick="toggleFav('${k}')">${isFav?t('fav_remove'):t('fav_add')}</button>
        ${isAdmin?`<button class="btn sm" onclick="showEF('${k}')">✏️ ${currentLang==='en'?'Edit Alarm Info':'알람정보 수정'}</button>`:''}
        ${a.isCustom?`<button class="btn sm" onclick="openEditAlarmModal(${a.id})" style="background:var(--bg4);border-color:var(--yellow);color:var(--yellow)">${t('alarm_edit')}</button>`:''}
        ${a.isCustom?`<button class="btn sm" onclick="deleteCustomAlarm(${a.id})" style="background:var(--redbg);border-color:var(--red);color:var(--red)">${t('alarm_delete')}</button>`:''}
        <button class="btn sm" onclick="shareLink('${k}')">${t('share')}</button>
        <button class="btn sm ghost" onclick="window.print()">🖨️</button>
        <button class="btn sm ghost" onclick="document.getElementById('dp').classList.remove('open');curAlarm=null;showDpResizer(false);try{const u=new URL(location.href);u.searchParams.delete('v');u.searchParams.delete('t');u.searchParams.delete('c');history.replaceState({},'',u);}catch{}">✕</button>
      </div>
    </div>
    <div class="dpb">
      <div>
        <div class="st">${t('basic_info')}</div>
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
          ${t('actions_history')} <span class="stc">${acts.length} ${t('actions_count_unit')}</span>
          ${fbSync}
          ${acts.length>1?`<select class="stsort-sel" onchange="changeActSort('${k}',this.value)" style="font-size:11px;background:var(--bg4);border:1px solid var(--border);border-radius:4px;color:var(--text2);padding:2px 5px;font-family:var(--font);cursor:pointer">
            <option value="desc" ${sortDescAct==='desc'?'selected':''}>${t('sort_desc')}</option>
            <option value="asc" ${sortDescAct==='asc'?'selected':''}>${t('sort_asc')}</option>
            <option value="helpful" ${sortDescAct==='helpful'?'selected':''}>${t('sort_helpful')}</option>
          </select>`:''}
        </div>
        <div class="al" id="al-${k}" style="margin-top:9px">
          ${acts.length?acts.map((ac,i)=>actCard(ac,k,i,acts)).join('')
            :`<div style="color:var(--text3);font-size:12px;padding:6px 0">${t('no_actions')}</div>`}
        </div>
        <div class="af" style="margin-top:10px">
          <div class="af-tit">${t('action_add_title')}</div>
          <div class="fr">
            <input type="text" id="ac-auth" placeholder="${t('name_required')}" value="${esc(savedAuthor)}" maxlength="20">
            <input type="text" id="ac-site" placeholder="${t('site_optional')}" value="${esc(savedSite)}" maxlength="20">
          </div>
          <textarea id="ac-txt" placeholder="${t('action_placeholder')}" rows="4"></textarea>
          <input type="text" id="ac-link" placeholder="${t('ref_link')}" style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:6px 9px;width:100%">
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
  // ac.text_en: EN 모드에서 DeepL 번역본이 있으면 사용
  const displayText = (currentLang==='en' && ac.text_en) ? ac.text_en : ac.text;
  const linkHtml=ac.link?`<a href="${esc(ac.link)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);display:inline-flex;align-items:center;gap:3px;margin-top:5px;text-decoration:none;background:var(--aglow);padding:2px 8px;border-radius:4px;border:1px solid rgba(79,124,255,.2)">${t('ref_link_open')}</a>`:'';
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
    <div class="ac-txt">${esc(displayText)}</div>
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
  const existing=card.querySelector('.ac-edit-form');
  if(existing){ existing.remove(); return; }
  const form=document.createElement('div');
  form.className='ac-edit-form';
  form.style.cssText='margin-top:8px;padding:10px;background:var(--bg4);border-radius:var(--r);border:1px solid var(--border2);display:flex;flex-direction:column;gap:6px';
  form.innerHTML=`
    <div style="font-size:10px;color:var(--yellow);font-weight:500">${t('action_edit_title')}</div>
    <textarea id="ea-txt-${k}-${idx}" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:7px;width:100%;min-height:80px;resize:vertical" >${esc(ac.text)}</textarea>
    <input type="text" id="ea-link-${k}-${idx}" placeholder="${t('ref_link')}" value="${esc(ac.link||'')}" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--font);font-size:12px;padding:6px 9px;width:100%">
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
  if(!txt||txt.length<5){ showToast(currentLang==='en'?'Enter at least 5 characters':'5자 이상 입력하세요','err'); return; }
  const before=ac.text.slice(0,60);
  ac.text=txt; ac.link=lnk; ac.status=st;
  ac.edited=new Date().toISOString().slice(0,16).replace('T',' ');
  await saveActions();
  addAudit('조치방안 수정',k,ac.author,before,txt.slice(0,60));
  await saveAudit();
  if(curAlarm) renderDetail(curAlarm);
  renderRight(); if(allActOpen) renderAllActions();
  showToast(currentLang==='en'?'Updated ✅':'수정 완료 ✅','ok');
}

async function deleteAction(k,idx){
  if(!isAdmin){ showToast(currentLang==='en'?'Admin required':'관리자 권한이 필요합니다','err'); return; }
  const ac = actions[k]?.[idx];
  if(!ac) return;
  const confirmed = window.confirm(
    currentLang==='en'
      ? `Delete this action?\n\nAuthor: ${ac.author}\nContent: ${ac.text.slice(0,50)}${ac.text.length>50?'…':''}`
      : `조치방안을 삭제하시겠습니까?\n\n작성자: ${ac.author}\n내용: ${ac.text.slice(0,50)}${ac.text.length>50?'…':''}`
  );
  if(!confirmed) return;

  actions[k].splice(idx, 1);
  if(actions[k].length === 0) delete actions[k];
  sS('vam_actions', actions);

  if(fbOnline){
    const fbKey = k.replace(/[.#$[\]]/g,'_');
    if(actions[k]){
      await fbPatch('actions/' + fbKey, actions[k]);
    } else {
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
  showToast(currentLang==='en'?'Action deleted':'조치방안이 삭제되었습니다', 'ok');
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
  renderRight(); showToast(currentLang==='en'?'Marked helpful 👍':'도움됐어요 👍','ok');
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
  if(!author){ showToast(currentLang==='en'?'Enter your name':'이름을 입력하세요','err'); return; }
  if(text.length<5){ showToast(currentLang==='en'?'Enter at least 5 characters':'5자 이상 입력하세요','err'); return; }
  const btn=document.getElementById('ac-submit-btn');
  if(btn){ btn.disabled=true; btn.textContent=t('saving'); }
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
  showToast(fbOnline?t('save_firebase'):t('save_local'),'ok');
}
