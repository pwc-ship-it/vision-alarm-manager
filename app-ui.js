// INTEKPLUS ALARM Manager — app-ui.js
// 의존: app-core.js → app-render.js → app-actions.js → app-admin.js

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
    // 현재 필터 상태 반영
    const curV = document.getElementById('sel-v').value;
    const curT = document.getElementById('sel-t').value;
    const curQ = document.getElementById('srch').value;
    const curNA = document.getElementById('noact-f').checked;
    const visions = getVisionList();
    const types = getTypeList();

    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div class="sbl">Vision</div>
      <select class="fc" id="m-v" onchange="syncM()">
        <option value="">${t('all_vision')}</option>
        ${visions.map(v=>`<option value="${v}"${v===curV?' selected':''}>${v}</option>`).join('')}
      </select>
      <select class="fc" id="m-t" onchange="syncM()">
        <option value="">${t('all_type')}</option>
        ${types.map(tp=>`<option value="${tp}"${tp===curT?' selected':''}>${tp}</option>`).join('')}
      </select>
      <div class="sbl">${t('mob_keyword')}</div>
      <input class="fc" type="text" id="m-q" placeholder="${t('search_ph')}" value="${esc(curQ)}" oninput="syncM()">
      <div class="sbl">${t('mob_severity')}</div>
      <div class="pills">
        <button class="pill ${sevFilter===''?'on':''}" onclick="setMS(this,'')">${t('mob_all')}</button>
        <button class="pill rc ${sevFilter==='Critical'?'on':''}" onclick="setMS(this,'Critical')">Critical</button>
        <button class="pill yc ${sevFilter==='Warning'?'on':''}" onclick="setMS(this,'Warning')">Warning</button>
        <button class="pill bc ${sevFilter==='Info'?'on':''}" onclick="setMS(this,'Info')">Info</button>
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2)">
        <input type="checkbox" id="m-na" onchange="syncM()"${curNA?' checked':''}> ${t('mob_noact')}
      </label>
      <button class="btn primary" onclick="mobNav('list',document.querySelectorAll('.mn')[0])">${t('mob_result')}</button>`;

  } else if(page==='acts'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div style="font-weight:500;font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        ${t('all_actions_title')}
        ${fbOnline?'<span class="live-dot" title="'+t('sync_live')+'"></span>':'<span style="font-size:10px;color:var(--yellow)">'+t('mob_local')+'</span>'}
      </div>
      <div id="mob-acts-body"></div>`;
    renderAllActions(true);

  } else if(page==='fav'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div class="sbl">${t('favorites')}</div>
      ${favorites.length?favorites.map(k=>{
        const p=k.split('_');
        return `<div class="si" style="background:var(--bg3);border-radius:var(--r);border:1px solid var(--border)" onclick="jumpTo('${k}');mobNav('list',document.querySelectorAll('.mn')[0])"><span style="color:var(--yellow)">★</span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
      }).join(''):`<div style="color:var(--text3);font-size:12px">${t('none')}</div>`}
      <div class="sbl" style="margin-top:12px">${t('recent')}</div>
      ${recentViewed.slice(0,5).map(k=>{
        const p=k.split('_');
        return `<div class="si" onclick="jumpTo('${k}');mobNav('list',document.querySelectorAll('.mn')[0])"><span class="si-dot"></span><span>${esc(p[0].replace('Vision',''))} · C${p[2]}</span></div>`;
      }).join('')||`<div style="color:var(--text3);font-size:12px">${t('none')}</div>`}
      <button class="btn" style="margin-top:12px" onclick="mobNav('list',document.querySelectorAll('.mn')[0])">${t('mob_back')}</button>`;

  } else if(page==='more'){
    document.getElementById('mob-sheet').style.display='flex';
    document.getElementById('mob-sheet').innerHTML=`
      <div class="sbl" style="margin-bottom:4px">⚙️ ${currentLang==='en'?'More':'더보기'}</div>

      <button class="btn primary" style="width:100%;text-align:left;padding:12px 14px;font-size:13px" onclick="closeMoreSheet();openAddAlarmModal()">
        ➕ ${t('btn_add_alarm')}
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px 14px;font-size:13px;margin-top:2px" onclick="closeMoreSheet();toggleLang()">
        🌐 ${currentLang==='en'?'Switch to Korean (KO)':'Switch to English (EN)'}
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px 14px;font-size:13px;margin-top:2px" onclick="closeMoreSheet();openFbSetup()">
        ⚙️ Firebase ${currentLang==='en'?'Setup':'설정'}
        ${fbOnline?'<span style="font-size:10px;color:var(--green);margin-left:6px">● '+t('db_online')+'</span>':'<span style="font-size:10px;color:var(--red);margin-left:6px">● '+t('db_offline')+'</span>'}
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px 14px;font-size:13px;margin-top:2px" onclick="closeMoreSheet();showQR()">
        📱 QR ${currentLang==='en'?'Code':'코드'}
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px 14px;font-size:13px;margin-top:2px;${isAdmin?'border-color:var(--yellow);color:var(--yellow)':''}" onclick="closeMoreSheet();toggleAdmin()">
        👤 ${isAdmin?(currentLang==='en'?'Switch to Viewer':'뷰어로 전환'):(currentLang==='en'?'Switch to Admin':'관리자로 전환')}
        <span style="font-size:10px;margin-left:6px;opacity:.7">${isAdmin?'ADMIN':'VIEWER'}</span>
      </button>

      <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn ghost" style="width:100%;padding:10px" onclick="closeMoreSheet()">
          ${currentLang==='en'?'Close':'닫기'} ✕
        </button>
      </div>`;
  }
}

function closeMoreSheet(){
  document.getElementById('mob-sheet').style.display='none';
  // 더보기 버튼 활성화 해제
  document.querySelectorAll('.mn').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.mn')[0].classList.add('on');
}

function syncM(){
  const v=document.getElementById('m-v')?.value||'';
  const tp=document.getElementById('m-t')?.value||'';
  const q=document.getElementById('m-q')?.value||'';
  const na=document.getElementById('m-na')?.checked||false;

  // sel-v / sel-t 가 숨겨진 사이드바 안에 있으므로
  // value 직접 설정 후 강제로 option selected 상태도 맞춤
  const selV = document.getElementById('sel-v');
  const selT = document.getElementById('sel-t');
  if(selV){
    selV.value = v;
    // value 설정이 안 먹힐 경우 대비: option을 직접 selected 처리
    Array.from(selV.options).forEach(o => o.selected = (o.value === v));
  }
  if(selT){
    selT.value = tp;
    Array.from(selT.options).forEach(o => o.selected = (o.value === tp));
  }
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
      const delta = startX - e.clientX;
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

function showDpResizer(open){
  const rsz = document.getElementById('rsz-detail');
  if(rsz) rsz.style.display = open ? 'block' : 'none';
}
