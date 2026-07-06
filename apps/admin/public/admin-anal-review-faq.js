/* ===== admin-anal-review-faq.js — 분석 + 검증 + FAQ 관리 (쪼개기 Step 8, 마지막) =====
 * 사장님 명령 (2026-05-02): "쪼개기 한다음에" — Step 8 (마지막).
 *
 * 분리 범위 (admin.js → admin-anal-review-faq.js, ~460줄):
 *  - 검증 탭 (원격 유지): curFilter / filt / loadReview / 검증 액션 (mark_reviewed, report_and_review)
 *                          + 신뢰도 분류 / 의심 답변 검토
 *  - 분석 탭: loadAnalytics + 통계 대시보드
 *  - FAQ 관리 (RAG): faqStatus / loadFaqs / loadFaqStatus / 새 FAQ 추가
 *                    + status verified/suspicious/wrong 필터 + 재임베딩
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, tab
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js
 *   → admin-rooms-list.js → admin-rooms-msg.js → admin-rooms-misc.js → admin-users-tab.js → admin-docs.js
 *   → admin-anal-review-faq.js
 *
 * ⭐ 마지막 step — 쪼개기 작업 완료. */

/* ===== 검증 탭 (원격 유지) ===== */
var curFilter='pending';
function filt(f){
curFilter=f;
$g('fltPending').className=f==='pending'?'on':'';
$g('fltMedium').className=f==='medium'?'on':'';
$g('fltLow').className=f==='low'?'on':'';
$g('fltReported').className=f==='reported'?'on':'';
$g('fltAll').className=f==='all'?'on':'';
loadReview(f);
}

async function loadReview(f){
const el=$g('reviewList');
el.innerHTML='<div class="empty">로딩 중...</div>';
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY)+'&filter='+f);
const d=await r.json();
if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
if(!d.items||d.items.length===0){el.innerHTML='<div class="empty">해당 항목 없음</div>';return}
if(f==='pending'){
const bg=$g('reviewBadge');
if(d.items.length>0){bg.style.display='inline-block';bg.textContent=d.items.length}
else bg.style.display='none';
}
el.innerHTML=d.items.map(x=>{
const conf=x.confidence||'미분류';
const confClass=conf==='높음'?'high':conf==='보통'?'medium':conf==='낮음'?'low':'medium';
const reportMark=x.reported?' 🚨자동감지':'';
return '<div class="review-card" id="card_'+x.id+'">'
+'<div class="r-head"><span>'+e(x.user_name||'비로그인')+'</span> · <span>'+e(x.created_at||'')+'</span> <span class="conf '+confClass+'">'+e(conf)+'</span>'+reportMark+'</div>'
+'<div class="r-q">'+e(x.question||'(질문 없음)').substring(0,200)+'</div>'
+'<div class="r-a">'+e(x.content||'')+'</div>'
+'<div class="r-actions">'
+'<button class="btn-ok" onclick="rev('+x.id+',\'mark_reviewed\')">✅ 정답 확인</button>'
+'<button class="btn-fix" onclick="rev('+x.id+',\'report_and_review\')">⚠️ 수정필요 (Claude로)</button>'
+'<select class="conf-set" onchange="setConf('+x.id+',this.value);this.selectedIndex=0">'
+'<option value="">신뢰도 변경…</option>'
+'<option value="높음">↑ 높음으로 승급</option>'
+'<option value="보통">↓ 보통으로 강등</option>'
+'<option value="낮음">↓ 낮음으로 강등</option>'
+'</select>'
+'</div></div>';
}).join('');
}catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

async function bulkReview(){
// 현재 필터에 따라 다르게 처리
var act='bulk_review_all_reported';
var msg='신고된 모든 답변을 처리완료 처리합니다.\nClaude가 이미 검토/수정한 후 누르세요. 계속할까요?';
if(curFilter==='pending'){
act='bulk_review_pending';
msg='검증 대기 중인 모든 답변(신뢰도 보통/낮음 + 신고된 것)을 처리완료 처리합니다.\nClaude가 이미 검토/수정한 후 누르세요. 계속할까요?';
}
if(!confirm(msg))return;
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:act})});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
alert('✅ 완료! '+(d.updated||0)+'건 처리되었습니다.');
loadReview(curFilter);
}catch(err){alert('오류: '+err.message)}
}

async function syncGithub(){
if(!confirm('검증 필요 데이터를 GitHub에 올려서 Claude가 처리할 수 있게 합니다.\n계속할까요?'))return;
try{
const r=await fetch('/api/admin-sync-to-github?key='+encodeURIComponent(KEY),{method:'POST'});
const d=await r.json();
if(d.error){alert('오류: '+d.error+'\n\nGITHUB_TOKEN 환경변수가 Cloudflare에 설정되어 있어야 합니다.');return}
alert('✅ 동기화 완료!\n\n'+d.total+'건을 GitHub에 업로드했습니다.\n\n이제 Claude한테 "flagged-items.json 처리해줘"라고 하시면 됩니다.');
}catch(err){alert('오류: '+err.message)}
}

async function migrateConf(){
if(!confirm('기존 답변의 신뢰도를 소급해서 분류합니다. 실행할까요?'))return;
try{
const r=await fetch('/api/admin-migrate-confidence?key='+encodeURIComponent(KEY),{method:'POST'});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
alert('완료!\n검사: '+d.total_checked+'건\n업데이트: '+d.updated+'건\n높음: '+d.stats.high+' / 보통: '+d.stats.medium+' / 낮음: '+d.stats.low+' / 미표시: '+d.stats.none);
loadReview(curFilter);
}catch(err){alert('오류: '+err.message)}
}

async function rev(id,action){
try{
await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});
const c=$g('card_'+id);
if(c)c.style.opacity='.3';
setTimeout(()=>{loadReview(curFilter)},500);
}catch(err){alert('오류: '+err.message)}
}

async function setConf(id,conf){
if(!conf)return;
const downgrade=(conf==='보통'||conf==='낮음');
const msg=downgrade
?'신뢰도를 "'+conf+'"(으)로 강등합니다.\n검증 파이프라인 재투입 (reviewed=0, reported=1) → 다음 Claude 호출 시 flagged-items.json 포함.\n계속할까요?'
:'신뢰도를 "높음"으로 승급합니다. 계속할까요?';
if(!confirm(msg))return;
try{
const r=await fetch('/api/admin-review?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:'set_confidence',confidence:conf})});
const d=await r.json();
if(d.error){alert('오류: '+d.error);return}
const c=$g('card_'+id);
if(c)c.style.opacity='.3';
setTimeout(()=>{loadReview(curFilter)},500);
}catch(err){alert('오류: '+err.message)}
}

/* ============================================================
 * 토스-홈 (2026-06-12 사장님 "마저하고 이모지도 토스스럽게"):
 * 홈(대화 탭) 상단 — 인사 + KPI 빅넘버 4카드 + 바로가기 4버튼.
 * 아이콘 = 이모지 대신 토스풍 SVG (stroke currentColor).
 * 데이터: admin-approve counts + analytics daily + admin-users total.
 * 실패해도 홈 리스트는 정상 (전부 try/catch — 회귀 0).
 * ============================================================ */
function _hIco(name){
  var P={
    receipt:'<path d="M4 2h12v18l-2-1.5L12 20l-2-1.5L8 20l-2-1.5L4 20V2z"/><path d="M8 7h6M8 11h6"/>',
    target:'<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/>',
    usercheck:'<circle cx="8" cy="6.5" r="3.5"/><path d="M2.5 17c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/><path d="M13.5 9l2 2 3.5-3.5"/>',
    doc:'<path d="M5 2h7l4 4v12H5V2z"/><path d="M12 2v4h4M8 11h5M8 14h5"/>',
    people:'<circle cx="7.5" cy="7" r="3"/><path d="M2 17c0-3 2.5-4.5 5.5-4.5S13 14 13 17"/><circle cx="14" cy="8" r="2.4"/><path d="M14 12.4c2.4 0 4 1.4 4 3.6"/>',
    wait:'<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l2.6 2"/>',
    chat:'<path d="M3 4h14v10H8l-4 3.5V4z"/>',
    biz:'<path d="M4 18V5h8v13M12 9h4v9M4 18h14"/><path d="M6.5 8h1.5M6.5 11h1.5M6.5 14h1.5"/>',
  }[name]||'';
  return '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+P+'</svg>';
}
var _hhTries=0, _hhData=null, _hhFetching=false, _hhTodo=null, _hhTodoFetching=false;
/* 시간대별 인사 (KST 시각) — 토스 앱 톤 */
function _hhGreet(h){
  if(h>=5&&h<11) return '좋은 아침이에요, 사장님 ☀️';
  if(h>=11&&h<14) return '점심은 챙겨 드셨어요, 사장님?';
  if(h>=14&&h<18) return '오후도 화이팅입니다, 사장님.';
  if(h>=18&&h<23) return '오늘 하루도 고생 많으셨어요, 사장님.';
  return '늦은 시간까지 고생 많으세요, 사장님.';
}
/* 미니 스파크라인 (최근 7일 막대) — 마지막 막대만 진하게 */
function _hhSpark(arr,color){
  if(!arr||!arr.length) return '';
  var mx=Math.max.apply(null,arr.concat([1]));
  var bars='';
  for(var i=0;i<arr.length;i++){
    var h=Math.max(3,Math.round((arr[i]||0)/mx*24));
    bars+='<rect x="'+(i*10)+'" y="'+(26-h)+'" width="6" height="'+h+'" rx="2" fill="'+color+'" opacity="'+(i===arr.length-1?'1':'.35')+'"/>';
  }
  return '<svg width="'+(arr.length*10-4)+'" height="26" style="display:block;flex-shrink:0" title="최근 7일">'+bars+'</svg>';
}
/* 숫자 카운트업 (0 → 목표, 550ms ease-out) — 토스 손맛 */
function _hhCountUp(){
  try{
    var els=document.querySelectorAll('[data-hh-num]');
    Array.prototype.forEach.call(els,function(el){
      if(el.getAttribute('data-hh-done'))return;
      el.setAttribute('data-hh-done','1');
      var target=parseInt(el.getAttribute('data-hh-num'),10);
      if(!isFinite(target)||target<=0){ el.textContent=isFinite(target)?String(target):el.getAttribute('data-hh-num'); return; }
      var t0=null, dur=550;
      function step(ts){
        if(t0===null)t0=ts;
        var p=Math.min(1,(ts-t0)/dur); p=1-Math.pow(1-p,3);
        el.textContent=(p>=1?target:Math.round(target*p)).toLocaleString();
        if(p<1)requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }catch(_){}
}
/* KPI 박스 1개 HTML — 토스 톤: 아이콘 틴트 + 카운트업 숫자 + (옵션) 스파크라인 */
function _hhKpi(ico,label,val,unit,color,onclick,tintBg,tintFg,spark){
  var num=(typeof val==='number')?'<span data-hh-num="'+val+'">0</span>':val;
  return '<div onclick="'+(onclick||'')+'" style="flex:1 1 180px;min-width:160px;background:#fff;border-radius:20px;padding:16px 20px;box-shadow:0 2px 10px rgba(25,31,40,.05);cursor:'+(onclick?'pointer':'default')+'">'
    +'<div style="display:flex;align-items:center;gap:9px">'
    +'<span style="width:34px;height:34px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:'+(tintBg||'#f2f4f6')+';color:'+(tintFg||'var(--text-sub)')+';flex-shrink:0">'+_hIco(ico)+'</span>'
    +'<span style="font-size:12.5px;color:var(--text-mute);font-weight:700">'+label+'</span>'
    +'</div>'
    +'<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:8px">'
    +'<div style="font-size:27px;font-weight:800;letter-spacing:-.03em;color:'+color+'">'+num+'<span style="font-size:14px;font-weight:700;color:var(--text-sub)"> '+unit+'</span></div>'
    +(spark||'')
    +'</div></div>';
}
/* 히어로 브리핑 칩 한 줄 — 🏛 오늘 마감 · 📋 할 일 · 👤 승인 대기 */
function _hhBrief(){
  var box=$g('homeBriefLine'); if(!box) return;
  var KST=new Date(Date.now()+9*3600*1000);
  var taxToday=0;
  try{ if(typeof _mtTaxSchedule==='function'){ taxToday=(_mtTaxSchedule(KST.getUTCFullYear(),KST.getUTCMonth())[KST.getUTCDate()]||[]).length; } }catch(_){}
  var chip=function(txt,hot){ return '<span style="background:rgba(255,255,255,'+(hot?'.24':'.13')+');border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;color:#fff">'+txt+'</span>'; };
  var t=_hhTodo, d=_hhData;
  var todoN=t?((t.overdue||0)+(t.today||0)):'·';
  box.innerHTML=chip('🏛 오늘 마감 '+taxToday+'건', taxToday>0)
    +chip('📋 할 일 '+todoN+'건'+((t&&t.overdue>0)?' · 지남 '+t.overdue:''), !!(t&&t.overdue>0))
    +chip('👤 승인 대기 '+(d?(d.pending||0):'·')+'명', !!(d&&d.pending>0));
}
/* KPI 채우기 — 캐시(_hhData) 있으면 숫자, 없으면 '·' 플레이스홀더. fetch 안 함(쌈). */
function _hhFill(){
  var box=$g('homeKpis'); if(!box) return;
  var d=_hhData||{};
  var P=function(v){ return (_hhData && v!=null)?v:'·'; };
  var uTab="(document.querySelector('[data-admin-tab=\\'users\\']')||{click:function(){}}).click()";
  var pend=d.pending;
  box.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +_hhKpi('people','기장거래처',P(d.approvedClient),'곳','var(--of-primary)',uTab,'#e8f3ff','var(--of-primary)')
    +_hhKpi('wait','승인 대기',P(pend),'명',(pend>0)?'var(--toss-red)':'var(--text-main)',uTab,(pend>0)?'#fdecec':'#f2f4f6',(pend>0)?'var(--toss-red)':'var(--text-sub)')
    +_hhKpi('chat','오늘 챗봇 상담',P(d.todayCnt),'건','var(--text-main)','','#e6f4ea','#188038',_hhSpark(d.daily7,'#188038'))
    +_hhKpi('biz','전체 사용자',P(d.totalUsers),'명','var(--text-main)',uTab,'#f2f4f6','var(--text-sub)')
    +'</div>';
  /* 가입 승인 숏컷 빨간 점 */
  var dot=$g('hqPendingDot'); if(dot)dot.style.display=(pend>0)?'block':'none';
  _hhCountUp();
  try{ _hhBrief(); }catch(_){}
  try{ _hhToday(); }catch(_){}
}
/* ── 오늘의 브리핑 (2026-07-06): 좌 🏛 법정마감(7일) — admin.js _mtTaxSchedule 재사용 /
 *    우 📋 내 할일(지남·오늘) — /api/memos scope=my 재사용. 클릭 = 내 할일 모달. */
function _hhToday(){
  var box=$g('homeToday'); if(!box) return;
  var KST=new Date(Date.now()+9*3600*1000);
  var days=['일','월','화','수','목','금','토'];
  /* 1) 법정마감 — 오늘부터 7일 */
  var taxRows='';
  try{
    if(typeof _mtTaxSchedule==='function'){
      var found=[];
      for(var off=0; off<=7 && found.length<3; off++){
        var dt=new Date(KST.getTime()); dt.setUTCDate(dt.getUTCDate()+off);
        var sched=_mtTaxSchedule(dt.getUTCFullYear(), dt.getUTCMonth());
        var items=sched[dt.getUTCDate()]||[];
        for(var i=0;i<items.length && found.length<3;i++){
          found.push({m:dt.getUTCMonth()+1,d:dt.getUTCDate(),w:days[dt.getUTCDay()],label:items[i],dday:off});
        }
      }
      taxRows=found.length
        ? found.map(function(f){
            var dd=f.dday===0
              ? '<span style="background:#fdecec;color:var(--toss-red);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800">오늘</span>'
              : (f.dday<=3
                ? '<span style="background:#fff4e5;color:#e37400;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800">D-'+f.dday+'</span>'
                : '<span style="background:#f2f4f6;color:var(--text-sub);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:800">D-'+f.dday+'</span>');
            return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-main);margin-top:8px"><span style="font-weight:700;color:var(--text-sub);flex-shrink:0">'+f.m+'/'+f.d+' ('+f.w+')</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+f.label+'</span>'+dd+'</div>';
          }).join('')
        : '<div style="font-size:13px;color:var(--text-mute);margin-top:8px">7일 내 법정 마감 없음 🎉</div>';
    }
  }catch(_){ taxRows='<div style="font-size:13px;color:var(--text-mute);margin-top:8px">·</div>'; }
  /* 2) 내 할일 요약 */
  var t=_hhTodo||{};
  var todoLine=(_hhTodo==null)
    ? '<div style="font-size:13px;color:var(--text-mute);margin-top:8px">불러오는 중…</div>'
    : '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
      +((t.overdue>0)?'<span style="background:#fdecec;color:var(--toss-red);border-radius:999px;padding:4px 12px;font-size:13px;font-weight:700">지남 '+t.overdue+'</span>':'')
      +'<span style="background:#e8f3ff;color:var(--of-primary);border-radius:999px;padding:4px 12px;font-size:13px;font-weight:700">오늘 '+(t.today||0)+'</span>'
      +'<span style="background:#f2f4f6;color:var(--text-sub);border-radius:999px;padding:4px 12px;font-size:13px;font-weight:700">전체 '+(t.total||0)+'</span>'
      +'</div>';
  var open="if(typeof openMyTodos==='function')openMyTodos()";
  box.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    +'<div onclick="'+open+'" style="flex:1 1 300px;min-width:260px;background:#fff;border-radius:20px;padding:16px 20px;box-shadow:0 2px 10px rgba(25,31,40,.05);cursor:pointer" title="클릭 → 내 할 일 달력">'
    +'<div style="font-size:12.5px;font-weight:700;color:var(--text-mute)">🏛 다가오는 법정 마감 <span style="font-weight:500">(7일 · 주말이면 다음 영업일)</span></div>'+taxRows+'</div>'
    +'<div onclick="'+open+'" style="flex:1 1 300px;min-width:260px;background:#fff;border-radius:20px;padding:16px 20px;box-shadow:0 2px 10px rgba(25,31,40,.05);cursor:pointer" title="클릭 → 내 할 일">'
    +'<div style="font-size:12.5px;font-weight:700;color:var(--text-mute)">📋 내 할 일</div>'+todoLine+'</div>'
    +'</div>';
  if(_hhTodo==null) _hhTodoFetch();
}
async function _hhTodoFetch(){
  if(_hhTodo!==null || _hhTodoFetching) return;
  _hhTodoFetching=true;
  try{
    var r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my&only_mine=1');
    var d=await r.json();
    var memos=(d&&d.memos)||[];
    var today=new Date(Date.now()+9*3600*1000).toISOString().substring(0,10);
    var over=0, tod=0;
    memos.forEach(function(m){
      var due=m.due_date;
      if(due && /^\d{4}-\d{2}-\d{2}$/.test(due)){ if(due<today)over++; else if(due===today)tod++; }
    });
    _hhTodo={overdue:over, today:tod, total:memos.length};
  }catch(_){ _hhTodo={overdue:0,today:0,total:0}; }
  _hhTodoFetching=false;
  try{ _hhToday(); }catch(_){}
  try{ _hhBrief(); }catch(_){}
}
/* 데이터 1회만 fetch — 캐시 후 재호출 시 skip (2026-06-15 사장님 "불러오는중 느림":
 * 여러 트리거가 각각 fetch 3개씩 발사 → admin-approve 등 5~6중복 → D1 경합 → 전체 지연.
 * 이제 fetch 는 한 번, 렌더(_hhRender)는 비면 캐시로 재적용(쌈) → 사라짐도 방지). */
async function _hhFetch(){
  if(_hhData || _hhFetching) return;
  _hhFetching=true;
  try{
    var now=new Date(Date.now()+9*3600*1000);
    var rs=await Promise.all([
      fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=pending').then(function(r){return r.json()}).catch(function(){return {}}),
      fetch('/api/analytics?key='+encodeURIComponent(KEY)).then(function(r){return r.json()}).catch(function(){return {}}),
      fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&page=1').then(function(r){return r.json()}).catch(function(){return {}}),
    ]);
    var c=(rs[0]&&rs[0].counts)||{};
    var todayKey=now.toISOString().slice(0,10);
    var daily=((rs[1]&&rs[1].daily)||[]).slice().sort(function(a,b){return String(a.date)<String(b.date)?-1:1});
    var dRow=daily.find(function(d){return d.date===todayKey});
    /* 최근 7일 상담 건수 (스파크라인용) */
    var daily7=daily.slice(-7).map(function(x){return x.count||0});
    _hhData={ approvedClient:(c.approved_client||0), pending:(c.pending||0), todayCnt:(dRow?dRow.count:0), totalUsers:((rs[2]&&rs[2].total)||0), daily7:daily7 };
  }catch(_){ _hhData=null; }
  _hhFetching=false;
  try{ _hhFill(); }catch(_){}
}
/* 렌더 — 멱등. 이미 그려졌고(=#homeKpis 존재) 데이터도 있으면 즉시 return.
 * 비어있으면(주입/재주입으로 노출) shell 다시 그림 + 캐시로 채움 + (처음이면)fetch. */
function renderHomeHero(){
  var el=$g('homeHero');
  if(!el){ if(_hhTries++<20) setTimeout(renderHomeHero,400); return; }
  if(el.querySelector('#homeKpis')){ if(_hhData) return; _hhFill(); if(!_hhData) _hhFetch(); return; }
  try{
    var now=new Date(Date.now()+9*3600*1000);
    var days=['일','월','화','수','목','금','토'];
    var dateStr=(now.getUTCMonth()+1)+'월 '+now.getUTCDate()+'일 '+days[now.getUTCDay()]+'요일';
    var uTab="(document.querySelector('[data-admin-tab=\\'users\\']')||{click:function(){}}).click()";
    /* 뱅킹앱식 숏컷 — 틴트 원형 아이콘 + 라벨. 가입 승인은 대기>0 시 빨간 점(hqPendingDot) */
    function qk(ico,label,onclick,tintBg,tintFg,dotId){
      return '<button onclick="'+onclick+'" onmouseover="this.style.background=\'#fafbfc\'" onmouseout="this.style.background=\'#fff\'" style="flex:1;min-width:110px;background:#fff;border:none;border-radius:18px;padding:16px 8px 14px;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:9px;box-shadow:0 2px 10px rgba(25,31,40,.05)">'
        +'<span style="width:46px;height:46px;border-radius:16px;background:'+tintBg+';color:'+tintFg+';display:inline-flex;align-items:center;justify-content:center;position:relative">'+_hIco(ico)
        +(dotId?'<span id="'+dotId+'" style="display:none;position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--toss-red);border:2px solid #fff"></span>':'')
        +'</span>'
        +'<span style="font-size:13px;font-weight:700;color:var(--text-main)">'+label+'</span></button>';
    }
    el.innerHTML=''
      /* 다크 그라데이션 히어로 — 시간대 인사 + 오늘 브리핑 칩 (2026-07-06 사장님 "별거 없는데? 니가 해봐") */
      +'<div style="background:linear-gradient(120deg,#1e2b45 0%,#28406c 55%,#3178e0 150%);border-radius:24px;padding:24px 26px;margin:2px 0 16px;color:#fff;box-shadow:0 8px 24px rgba(27,43,69,.22)">'
      +'<div style="font-size:13px;font-weight:600;opacity:.72">'+dateStr+'</div>'
      +'<div style="font-size:24px;font-weight:800;letter-spacing:-.03em;margin-top:5px">'+_hhGreet(now.getUTCHours())+'</div>'
      +'<div id="homeBriefLine" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"></div>'
      +'</div>'
      +'<div id="homeKpis"></div>'
      +'<div id="homeToday"></div>'
      +'<div id="homeQuick"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">'
      +qk('receipt','청구서 발행',"window.open('https://sewmu-admin.pages.dev/admin/billing/new','_blank')",'#e8f3ff','var(--of-primary)')
      +qk('target','영업 타겟',"window.open('https://sewmu-admin.pages.dev/admin/sales-targets','_blank')",'#e6f4ea','#188038')
      +qk('usercheck','가입 승인',uTab,'#fff4e5','#e37400','hqPendingDot')
      +qk('doc','검토표 모아보기',"($g('sbReviewAllBtn')||{click:function(){}}).click()",'#f3e8fd','#8430ce')
      +'</div></div>';
    try{ _hhBrief(); }catch(_){}
    _hhFill();           /* 캐시 있으면 숫자, 없으면 '·' */
    if(!_hhData) _hhFetch();  /* 처음이면 1회 fetch → 끝나면 _hhFill 재적용 */
  }catch(_){/* 홈 헤더 실패해도 리스트는 정상 */}
}
/* 홈 히어로 자동 렌더 — 모달 DOM 준비 신호에 직접 훅 (2026-06-15 사장님 "왜안되노").
 * 원인: #homeHero 는 admin-modals.html 안에 있고, ESM loadAdminModals 가 주입 후
 * 'adminModalsLoaded' 이벤트 dispatch. setTimeout(600) 자가시작은 이 주입 타이밍과
 * 안 맞아 빗나갔음(부팅 경로마다 주입 시점 다름). → 이벤트에 직접 건다 = 항상 정확.
 * + 백업: 이미 주입된 뒤 진입한 경우(이벤트 놓침) 대비 짧은 폴링도 유지. */
try{ document.addEventListener('adminModalsLoaded', function(){ try{ renderHomeHero(); }catch(_){} }); }catch(_){}
/* 백업 재렌더 — 모달 재주입 등으로 homeHero 가 비워지는 케이스 대비.
 * renderHomeHero 는 멱등 + fetch 1회 캐시라 여러 번 불러도 비용 거의 0 (DOM 재적용만). */
try{ [600,1500,3000,5000].forEach(function(ms){ setTimeout(renderHomeHero, ms); }); }catch(_){}

async function loadList(){
try{renderHomeHero()}catch(_){}
const r=await fetch('/api/conversations?key='+encodeURIComponent(KEY)+'&page=1');
const d=await r.json();
const el=$g('list');
if(!d.sessions||d.sessions.length===0){el.innerHTML='<div class="empty">대화 없음</div>';return}
el.innerHTML=d.sessions.map(s=>{
const nm=s.user_name||'비로그인';
const av=s.user_profile_image
?'<img src="'+e(s.user_profile_image)+'" alt="">'
:nm[0];
const pv=s.user_provider||'';
/* 토스 정리 (2026-06-16 사장님 "후가 훨씬 낫다"): 신뢰도 3색 뱃지 → 점 하나.
 * 낮음(주의) 있으면 빨강점+개수, 없으면 회색점(양호). 행마다 색 3개 → 1개 = 차분. */
var _dot=function(color,label){return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.72em;font-weight:700;color:'+color+';margin-left:6px"><span style="width:6px;height:6px;border-radius:50%;background:'+color+';display:inline-block"></span>'+label+'</span>';};
let confBadges='';
if(s.count_low>0) confBadges=_dot('var(--toss-red)','낮음 '+s.count_low);
else if(s.count_medium>0) confBadges=_dot('var(--text-mute)','보통');
else if(s.count_high>0) confBadges=_dot('var(--of-success)','');
return '<div class="item" onclick="detail(\''+e(s.group_id)+'\')">'
+'<div class="avatar">'+av+'</div>'
+'<div class="info"><div class="name">'+e(nm)+confBadges+'</div>'
+'<div class="meta">'+(pv?'<span class="badge">'+pv+'</span> ':'')+e(s.last_at||s.started_at||'')+'</div></div>'
+'<div class="right"><div class="cnt">'+s.message_count+'건</div></div>'
+'</div>';
}).join('');
}

async function detail(gid){
const r=await fetch('/api/conversation-detail?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(gid));
const d=await r.json();
$g('chatView').style.display='none';
$g('detailView').style.display='block';
const el=$g('msgs');
if(!d.messages||d.messages.length===0){el.innerHTML='<div class="empty">메시지 없음</div>';return}
el.innerHTML=d.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>{
let conf='';
if(m.role==='assistant'){
const cm=String(m.content||'').match(/\[신뢰도:\s*(높음|보통|낮음)/);
if(cm){const c=cm[1];const cls=c==='높음'?'high':c==='보통'?'medium':'low';conf=' <span class="conf '+cls+'">'+c+'</span>';}
}
return '<div class="msg '+e(m.role)+'">'+renderMsgBody(m.content)+'<div class="ts">'+(m.role==='user'?'사용자':'AI')+conf+' · '+e(m.created_at||'')+'</div></div>';
}).join('');
/* 최신 메시지로 스크롤 (카톡 스타일) */
setTimeout(function(){
  el.scrollTop=el.scrollHeight;
  window.scrollTo(0,document.body.scrollHeight);
},50);
}

function backToList(){
$g('detailView').style.display='none';
$g('chatView').style.display='block';
}

async function loadAnalytics(){
const el=$g('analView');
el.innerHTML='<div class="empty">분석 중...</div>';
try{
const r=await fetch('/api/analytics?key='+encodeURIComponent(KEY));
const d=await r.json();
if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
const s=d.summary;
const mx=Math.max(...d.categories.map(c=>c.count),1);
let h='<div class="stats">'
+'<div class="stat"><div class="n">'+s.total_messages+'</div><div class="l">메시지</div></div>'
+'<div class="stat"><div class="n">'+s.total_sessions+'</div><div class="l">세션</div></div>'
+'<div class="stat"><div class="n">'+s.total_users+'</div><div class="l">사용자</div></div>'
+'<div class="stat"><div class="n">'+s.total_questions+'</div><div class="l">질문</div></div>'
+'</div>';
h+='<div class="sec">질문 유형</div>';
d.categories.filter(c=>c.count>0).forEach(c=>{
const w=Math.max(c.count/mx*100,4);
h+='<div class="bar-item"><span class="bar-label">'+e(c.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+w+'%">'+c.count+'</div></div><span class="bar-cnt">'+c.count+'건</span></div>';
});
if(d.topKeywords&&d.topKeywords.length>0){
h+='<div class="sec">인기 키워드</div><div class="kw-wrap">';
d.topKeywords.forEach(k=>{h+='<span class="kw">'+e(k.keyword)+'<b>'+k.count+'</b></span>'});
h+='</div>';
}
el.innerHTML=h;
}catch(err){el.innerHTML='<div class="empty">오류</div>'}
}

/* ===== FAQ 관리 (RAG) ===== */
var faqSearchTimer=null;
var editingFaqId=null;

function onFaqSearchInput(){
  if(faqSearchTimer)clearTimeout(faqSearchTimer);
  faqSearchTimer=setTimeout(loadFaqs,250);
}

async function loadFaqStatus(){
  try{
    const r=await fetch('/api/admin-faq-migrate?key='+encodeURIComponent(KEY));
    const d=await r.json();
    if(d.error){$g('faqStatus').textContent='오류: '+d.error;return}
    $g('faqStatus').textContent='DB '+d.db_total+'건 (활성 '+d.db_active+', 임베딩 '+d.db_embedded+') · _faq.js 하드코딩 '+d.faq_js_count+'건';
  }catch(e){$g('faqStatus').textContent='상태 확인 실패: '+e.message}
}

async function loadFaqs(){
  const el=$g('faqList');
  el.innerHTML='<div class="empty">불러오는 중...</div>';
  try{
    const q=$g('faqSearchInput').value.trim();
    const cat=$g('faqCatFilter').value;
    const ver=$g('faqVerifiedFilter').value;
    const params=new URLSearchParams({key:KEY});
    if(q)params.set('search',q);
    if(cat&&cat!=='all')params.set('category',cat);
    if(ver&&ver!=='all')params.set('verified',ver);
    const r=await fetch('/api/admin-faq?'+params.toString());
    const d=await r.json();
    if(d.error){el.innerHTML='<div class="empty">'+e(d.error)+'</div>';return}
    /* 카테고리 드롭다운 갱신 */
    const sel=$g('faqCatFilter');
    const cur=sel.value;
    sel.innerHTML='<option value="all">전체 카테고리</option>'+(d.categories||[]).map(c=>'<option value="'+e(c.category||'기타')+'">'+e(c.category||'기타')+' ('+c.n+')</option>').join('');
    sel.value=cur||'all';
    if(!d.faqs||d.faqs.length===0){el.innerHTML='<div class="empty">FAQ 없음 — "🚀 마이그레이션" 버튼으로 _faq.js 에서 가져오세요</div>';return}
    /* 검증 카운트 배지도 업데이트 */
    if(d.verified_counts){
      const vc=d.verified_counts;
      const stElm=$g('faqStatus');
      const prev=stElm.textContent||'';
      stElm.innerHTML=prev+' <span style="margin-left:8px">❓'+vc.unchecked+' ✅'+vc.verified+' 🟡'+vc.suspicious+' ❌'+vc.wrong+'</span>';
    }
    el.innerHTML=d.faqs.map(f=>{
      const embMark=f.has_embedding?'<span style="background:#e0f5ec;color:#10b981;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700">임베딩 ✓</span>':'<span style="background:#fee2e2;color:#f04452;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700">임베딩 ✗</span>';
      const actMark=f.active?'':'<span style="background:#e5e8eb;color:#8b95a1;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-left:4px">비활성</span>';
      const catMark=f.category?'<span style="background:#e8f3ff;color:#3182f6;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">'+e(f.category)+'</span>':'';
      /* 검증 상태 배지 */
      const vs=f.verified_status||'unchecked';
      const verBadge=vs==='verified'?'<span style="background:#e0f5ec;color:#10b981;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">✅ 통과</span>':
        vs==='suspicious'?'<span style="background:#fef3c7;color:#b45309;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">🟡 의심</span>':
        vs==='wrong'?'<span style="background:#fee2e2;color:#f04452;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">❌ 틀림</span>':
        '<span style="background:#e5e8eb;color:#8b95a1;font-size:.68em;padding:1px 6px;border-radius:5px;font-weight:700;margin-right:4px">❓ 미검증</span>';
      const noteLine=f.verified_note?'<div class="meta" style="color:#b45309;margin-top:3px">📝 '+e(f.verified_note).slice(0,120)+'</div>':'';
      return '<div class="item" onclick="openFaqForm('+f.id+')" style="align-items:flex-start">'
        +'<div style="flex-shrink:0;background:#f2f4f6;color:#6b7684;width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;font-size:.78em">Q'+(f.q_number||'?')+'</div>'
        +'<div class="info">'
          +'<div class="name">'+verBadge+catMark+e(f.question)+actMark+'</div>'
          +'<div class="meta" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal">'+e(String(f.answer||'').slice(0,150))+'</div>'
          +(f.law_refs?'<div class="meta" style="color:#3182f6;margin-top:3px">📖 '+e(f.law_refs)+'</div>':'')
          +noteLine
        +'</div>'
        +'<div class="right">'+embMark+'</div>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

function openFaqForm(id){
  editingFaqId=id;
  $g('faqFormErr').style.display='none';
  if(id){
    $g('faqFormTitle').textContent='FAQ 수정';
    $g('faqFormDeleteBtn').style.display='inline-block';
    $g('faqFormActiveLabel').style.display='flex';
    $g('faqFormVerifiedWrap').style.display='block';
    /* 상세 로드 */
    fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&id='+id).then(r=>r.json()).then(d=>{
      if(!d.faq)return;
      $g('faqFormQnum').value=d.faq.q_number||'';
      $g('faqFormCat').value=d.faq.category||'기타';
      $g('faqFormQ').value=d.faq.question||'';
      $g('faqFormA').value=d.faq.answer||'';
      $g('faqFormLaw').value=d.faq.law_refs||'';
      $g('faqFormActive').checked=d.faq.active!==0;
      $g('faqFormVerifiedStatus').value=d.faq.verified_status||'unchecked';
      $g('faqFormVerifiedNote').value=d.faq.verified_note||'';
    });
  } else {
    $g('faqFormTitle').textContent='새 FAQ 추가';
    $g('faqFormDeleteBtn').style.display='none';
    $g('faqFormActiveLabel').style.display='none';
    $g('faqFormVerifiedWrap').style.display='none';
    $g('faqFormQnum').value='';
    $g('faqFormCat').value='기타';
    $g('faqFormQ').value='';
    $g('faqFormA').value='';
    $g('faqFormLaw').value='';
    $g('faqFormActive').checked=true;
    $g('faqFormVerifiedStatus').value='unchecked';
    $g('faqFormVerifiedNote').value='';
  }
  $g('faqFormModal').style.display='flex';
}

async function submitFaq(){
  console.log('[submitFaq] clicked, editingFaqId=', editingFaqId);
  const err=$g('faqFormErr');err.style.display='none';
  const question=$g('faqFormQ').value.trim();
  const answer=$g('faqFormA').value.trim();
  console.log('[submitFaq] Q len:', question.length, 'A len:', answer.length);
  if(!question||!answer){err.textContent='질문과 답변을 입력해 주세요';err.style.display='block';alert('질문과 답변을 모두 입력해 주세요');return}
  const payload={
    q_number:$g('faqFormQnum').value?Number($g('faqFormQnum').value):null,
    category:$g('faqFormCat').value,
    question,answer,
    law_refs:$g('faqFormLaw').value.trim()||null,
    active:$g('faqFormActive').checked?1:0,
  };
  if(editingFaqId)payload.id=editingFaqId;
  const action=editingFaqId?'update':'create';
  console.log('[submitFaq] payload:', payload, 'action:', action, 'KEY set?', !!KEY);
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    console.log('[submitFaq] response status:', r.status);
    const d=await r.json();
    console.log('[submitFaq] response body:', d);
    if(!d.ok){
      const msg=d.error||'저장 실패 (status '+r.status+')';
      err.textContent=msg;err.style.display='block';
      alert('저장 실패: '+msg);
      return;
    }
    if(d.warning)alert('⚠️ 저장은 됐지만 경고: '+d.warning);
    /* 수정 모드면 검증 상태도 별도 업데이트 */
    if(editingFaqId){
      try{
        await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=set_verified',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingFaqId,status:$g('faqFormVerifiedStatus').value,note:$g('faqFormVerifiedNote').value.trim()})});
      }catch(e){console.error('set_verified fail',e)}
    }
    $g('faqFormModal').style.display='none';
    loadFaqStatus();loadFaqs();
    alert('✅ 저장 완료');
  }catch(er){
    console.error('[submitFaq] exception:', er);
    err.textContent='오류: '+er.message;err.style.display='block';
    alert('네트워크 오류: '+er.message);
  }
}

async function deleteFaq(){
  if(!editingFaqId)return;
  if(!confirm('이 FAQ를 영구 삭제합니다. 계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editingFaqId})});
    const d=await r.json();
    if(d.ok){$g('faqFormModal').style.display='none';loadFaqStatus();loadFaqs()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(er){alert('오류: '+er.message)}
}

async function migrateFaqs(){
  if(!confirm('_faq.js 하드코딩 FAQ를 D1로 이관하고 임베딩을 생성합니다.\n기존 동일 내용은 스킵, 변경된 것만 재임베딩.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='마이그레이션 중...'}
  try{
    const r=await fetch('/api/admin-faq-migrate?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n파싱: '+d.parsed_count+'건\n신규: '+d.inserted+'건\n수정: '+d.updated+'건\n임베딩: '+d.embedded+'건\n스킵: '+d.skipped+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🚀 마이그레이션'}}
}

async function seedFaqs(batchId){
  if(!confirm('배치 '+batchId+' 의 FAQ를 일괄 추가합니다.\n(중복 질문은 자동 스킵)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='추가 중...'}
  try{
    const r=await fetch('/api/admin-faq-seed?key='+encodeURIComponent(KEY)+'&batch='+encodeURIComponent(batchId),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n배치: '+d.batch_name+'\n총: '+d.total_in_batch+'건\n신규: '+d.inserted+'건\n스킵(중복): '+d.skipped+'건\n임베딩: '+d.embedded+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='📦 배치 1 추가'}}
}

async function syncFaqsToGithub(){
  if(!confirm('의심·틀림 상태 FAQ 전체를 GitHub의 flagged-faqs.json 에 업로드합니다.\n이후 Claude한테 "flagged-faqs.json 처리해줘" 하시면 재검토 후 수정됩니다.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='업로드 중...'}
  try{
    const r=await fetch('/api/admin-faq-sync-to-github?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error+'\n\nGITHUB_TOKEN 환경변수 확인 필요');return}
    alert('✅ 업로드 완료\n\n의심·틀림 FAQ '+d.total+'건을 GitHub에 올렸습니다.\n\n이제 Claude한테 "flagged-faqs.json 처리해줘"라고 말씀하시면\n각 항목 법령 확인 → 수정 → DB 반영 → 상태를 verified로 변경합니다.\n\n파일 위치: '+(d.github_url||'GitHub 레포 루트'));
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🚀 Claude 재검토 요청'}}
}

function downloadBackup(){
  if(!confirm('전체 데이터 백업 JSON을 다운로드합니다.\n(users, conversations, rooms, faqs, client 등 포함)\n\n계속할까요?'))return;
  location.href='/api/admin-backup?key='+encodeURIComponent(KEY);
}

async function applyReverifyV1(){
  if(!confirm('Claude 재검증 V1 결과를 적용합니다.\n- 의심 11건을 verified로 승격\n- 4건은 답변 내용 수정 + 재임베딩 (Q38, Q63, Q67, Q70, Q123)\n- 1건(Q93)은 삭제(active=0)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='적용 중...'}
  try{
    const r=await fetch('/api/admin-faq-reverify-apply?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    let msg='✅ 재검증 V1 적용 완료\n\n';
    msg+='리포트 총: '+d.total_in_report+'건\n';
    msg+='verified 승격: '+d.verified_count+'건\n';
    msg+='내용 수정: '+d.content_updated+'건\n';
    msg+='재임베딩: '+d.reembedded+'건\n';
    msg+='삭제(비활성): '+d.deleted+'건\n';
    msg+='스킵: '+d.skipped+'건';
    if(d.missing_q&&d.missing_q.length>0)msg+='\n매칭 안된 q: '+d.missing_q.join(', ');
    alert(msg);
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ 재검증 V1 적용'}}
}

async function applyVerifyReport(){
  if(!confirm('Claude 삼중체크 검증 리포트를 FAQ 전체에 일괄 적용합니다.\n각 FAQ에 verified/suspicious/wrong 상태 + 메모가 기록됩니다.\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='적용 중...'}
  try{
    const r=await fetch('/api/admin-faq-verify-apply?key='+encodeURIComponent(KEY),{method:'POST'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    let msg='✅ 검증 적용 완료\n\n';
    msg+='리포트 총: '+d.total_in_report+'건\n';
    msg+='적용: '+d.applied+'건\n';
    msg+='스킵: '+d.skipped+'건\n';
    if(d.missing_q&&d.missing_q.length>0){
      msg+='\n⚠️ 매칭 안된 q_number: '+d.missing_q.slice(0,20).join(', ');
      if(d.missing_q.length>20)msg+=' 외 '+(d.missing_q.length-20)+'건';
      msg+='\n(해당 Q 번호의 FAQ가 DB에 없음 - 파싱 누락/삭제 가능성)';
    }
    alert(msg);
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='🔍 Claude 검증 적용'}}
}

async function reembedAllFaqs(){
  if(!confirm('활성 FAQ 전체를 재임베딩합니다.\n(API 비용 소량 발생 + 시간 걸림)\n\n계속할까요?'))return;
  const btn=event?event.target:null;
  if(btn){btn.disabled=true;btn.textContent='재임베딩 중...'}
  try{
    const r=await fetch('/api/admin-faq?key='+encodeURIComponent(KEY)+'&action=reembed_all',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    alert('✅ 완료\n\n재임베딩: '+d.reembedded+'건\n실패: '+d.failed+'건');
    loadFaqStatus();loadFaqs();
  }catch(er){alert('오류: '+er.message)}
  finally{if(btn){btn.disabled=false;btn.textContent='♻️ 전체 재임베딩'}}
}

