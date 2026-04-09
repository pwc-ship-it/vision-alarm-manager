// INTEKPLUS ALARM Manager — app-init.js
// 로드 순서의 마지막 파일 — 모든 함수가 정의된 후 실행

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
function handleUrl(){
  try{
    const p=new URLSearchParams(location.search);

    // fburl 파라미터가 있으면 Firebase 자동 연결
    const fburl = p.get('fburl');
    if(fburl && !FB_URL){
      FB_URL = decodeURIComponent(fburl).replace(/\/+$/, '');
      localStorage.setItem('vam_fb_url', FB_URL);
      initFirebase();
    }

    // 알람 바로가기
    const v=p.get('v'), tp=p.get('t'), c=p.get('c');
    if(v&&tp&&c){
      document.getElementById('sel-v').value=v;
      document.getElementById('sel-t').value=tp;
      applyFilters();
      const a=alarms.find(x=>x.vision===v&&x.type===tp&&x.code===parseInt(c));
      if(a) setTimeout(()=>selAlarm(a.id), 200);
    }
  } catch{}
}

async function init(){
  initResizers();
  rebuildAlarms();
  applyLang();
  renderVisionSelects();
  renderFavorites(); renderRecent();
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

  console.log('[Init] FB_URL:', FB_URL);
  if(FB_URL){
    initFirebase();
  } else {
    setDbStatus('offline');
    setTimeout(()=>{
      showToast(currentLang==='en'
        ? '⚙️ Click Firebase to set URL for team sharing'
        : '⚙️ Firebase 버튼을 눌러 URL을 설정하면 팀 공유가 가능합니다');
    }, 1500);
  }
}

init();
