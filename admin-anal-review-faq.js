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
 * 로드 순서 (admin.html / staff.html):
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

async function loadList(){
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
let confBadges='';
if(s.count_high>0)confBadges+='<span class="conf high">높음 '+s.count_high+'</span>';
if(s.count_medium>0)confBadges+='<span class="conf medium">보통 '+s.count_medium+'</span>';
if(s.count_low>0)confBadges+='<span class="conf low">낮음 '+s.count_low+'</span>';
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

