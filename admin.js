/* ⛳ 디버깅 — 캐시 적용 여부 즉시 확인. 화면 좌상단에 5초간 작은 라벨 표시. */
window.__ADMIN_VERSION='v=127';
try{
  setTimeout(function(){
    try{
      var b=document.createElement('div');
      b.style.cssText='position:fixed;top:0;left:0;background:#10b981;color:#fff;font-size:10px;padding:2px 6px;z-index:99999;font-family:monospace;border-bottom-right-radius:4px';
      b.textContent='✓ '+window.__ADMIN_VERSION;
      (document.body||document.documentElement).appendChild(b);
      setTimeout(function(){try{b.remove()}catch(_){}},5000);
    }catch(_){}
  },300);
}catch(_){}
let KEY='';
/* null-safe getElementById: 없으면 no-op 객체 반환 (admin.html/staff.html 공유용) */
function _noop(){return {style:{},classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},dataset:{},children:[],value:'',innerHTML:'',textContent:'',checked:false,disabled:false,className:'',addEventListener:function(){},removeEventListener:function(){},focus:function(){},click:function(){},blur:function(){},scrollIntoView:function(){},closest:function(){return null},querySelector:function(){return null},querySelectorAll:function(){return []},appendChild:function(a){return a},removeChild:function(a){return a},setAttribute:function(){},getAttribute:function(){return null},removeAttribute:function(){},insertAdjacentHTML:function(){}}}
function $g(id){return document.getElementById(id)||_noop()}
function e(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]+/g,' ')}
/* URL 자동링크: escape 된 문자열에만 적용(XSS 안전). http(s)://, www. 만 대상 */
function linkify(s){
  if(!s)return s;
  return String(s).replace(/\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi,function(u){
    var href=/^www\./i.test(u)?'http://'+u:u;
    return '<a href="'+href.replace(/"/g,'&quot;')+'" target="_blank" rel="noopener noreferrer" style="color:#3182f6;text-decoration:underline;word-break:break-all">'+u+'</a>';
  });
}
/* @멘션 하이라이트 — 이미 escaped 된 텍스트에 적용.
   @한글/영문/숫자/_  최대 20자 → 파란색 강조. 본인 언급이면 노란 배경. */
function mentionify(s){
  if(!s)return s;
  return String(s).replace(/(^|[\s(\[])@([가-힣A-Za-z0-9_\.]{1,20})/g, function(_, pre, name){
    const selfName=(typeof ADMIN_SELF_NAME!=='undefined'&&ADMIN_SELF_NAME)?ADMIN_SELF_NAME:null;
    const isMe = selfName && (name===selfName||name===(selfName+'대표'));
    const bg = isMe ? 'background:#fef08a;color:#854d0e;border-radius:4px;padding:0 3px' : 'color:#3182f6';
    return pre+'<span style="'+bg+';font-weight:700" data-mention="'+name.replace(/"/g,'&quot;')+'">@'+name+'</span>';
  });
}
/* 스태프 리스트 캐시 — @ 입력 시 자동완성·본인 감지에 사용 */
let _mentionStaffCache=null;
let ADMIN_SELF_NAME=null;
async function _ensureMentionStaff(){
  if(_mentionStaffCache)return _mentionStaffCache;
  try{
    const r=await fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&action=staff_list');
    const d=await r.json();
    _mentionStaffCache=(d.staff||[]).map(u=>({id:u.id,name:u.display_name||('ID#'+u.id),is_admin:u.is_admin}));
    /* 본인 식별 — ADMIN_KEY 로그인은 대표 / 스태프 세션은 쿠키 기반 별도 식별 필요. 일단 localStorage 저장 값 활용 */
    try{
      const saved=localStorage.getItem('adminSelfName');
      if(saved)ADMIN_SELF_NAME=saved;
    }catch(_){}
  }catch(_){_mentionStaffCache=[]}
  return _mentionStaffCache;
}

/* ===== @ 자동완성 드롭다운 =====
   roomInput(textarea) 에서 @ 입력 감지 → 스태프 목록 띄움.
   방향키 탐색 / Enter·Tab·클릭 선택 / Esc 닫기.
   본인이 @언급된 메시지는 렌더에서 노란색으로 강조. */
let _mentionBox=null;
let _mentionActive=false;
let _mentionMatches=[];
let _mentionSelIdx=0;
let _mentionStart=-1; /* @ 시작 위치 (textarea value 기준) */
function _mentionEnsureBox(){
  if(_mentionBox)return _mentionBox;
  const b=document.createElement('div');
  b.id='mentionBox';
  b.style.cssText='position:fixed;background:#fff;border:1px solid #e5e8eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px 0;min-width:160px;max-width:260px;max-height:200px;overflow-y:auto;z-index:12000;display:none;font-family:inherit;font-size:.88em';
  document.body.appendChild(b);
  _mentionBox=b;
  return b;
}
function _mentionClose(){
  _mentionActive=false;
  _mentionMatches=[];
  _mentionSelIdx=0;
  _mentionStart=-1;
  if(_mentionBox)_mentionBox.style.display='none';
}
function _mentionRender(){
  const b=_mentionEnsureBox();
  if(!_mentionMatches.length){_mentionClose();return}
  b.innerHTML=_mentionMatches.map((u,i)=>{
    const sel=i===_mentionSelIdx;
    return '<div data-idx="'+i+'" onclick="_mentionPick('+i+')" style="padding:7px 12px;cursor:pointer;'+(sel?'background:#eff6ff;color:#1e40af':'color:#191f28')+'"><b>@'+e(u.name)+'</b> <span style="font-size:.72em;color:#8b95a1">'+(u.is_admin?'직원':'')+'</span></div>';
  }).join('');
}
function _mentionPosition(input){
  const r=input.getBoundingClientRect();
  const b=_mentionEnsureBox();
  /* 입력창 위에 띄움 (바닥 고정 입력창 위로) */
  b.style.left=Math.max(8, r.left)+'px';
  b.style.bottom=(window.innerHeight - r.top + 4)+'px';
  b.style.top='auto';
}
async function _mentionOnInput(input){
  const v=input.value||'';
  const pos=input.selectionStart||0;
  /* 커서 앞 토큰 찾기 — 공백까지 역방향 */
  let i=pos-1;
  while(i>=0 && !/[\s\n]/.test(v[i]))i--;
  const token=v.slice(i+1, pos); /* 공백 다음 ~ 커서 */
  if(!token.startsWith('@')){_mentionClose();return}
  const q=token.slice(1);
  /* 20자 초과는 보통 오작동 */
  if(q.length>20){_mentionClose();return}
  const staff=await _ensureMentionStaff();
  const qLow=q.toLowerCase();
  _mentionMatches=staff.filter(s=>{
    const n=(s.name||'').toLowerCase();
    return !q || n.startsWith(qLow) || n.includes(qLow);
  }).slice(0,8);
  if(!_mentionMatches.length){_mentionClose();return}
  _mentionActive=true;
  _mentionStart=i+1; /* @ 위치 */
  _mentionSelIdx=0;
  _mentionPosition(input);
  _mentionRender();
  _mentionBox.style.display='block';
}
function _mentionPick(idx){
  const input=document.getElementById('roomInput');
  if(!input)return;
  const u=_mentionMatches[idx];if(!u)return;
  const before=input.value.slice(0,_mentionStart);
  const after=input.value.slice(input.selectionStart||0);
  const insert='@'+u.name+' ';
  input.value=before+insert+after;
  const caret=(before+insert).length;
  input.selectionStart=input.selectionEnd=caret;
  input.focus();
  _mentionClose();
}
function _mentionOnKeydown(input, ev){
  if(!_mentionActive)return false;
  const k=ev.key;
  if(k==='ArrowDown'){_mentionSelIdx=Math.min(_mentionMatches.length-1,_mentionSelIdx+1);_mentionRender();ev.preventDefault();return true}
  if(k==='ArrowUp'){_mentionSelIdx=Math.max(0,_mentionSelIdx-1);_mentionRender();ev.preventDefault();return true}
  if(k==='Enter'||k==='Tab'){_mentionPick(_mentionSelIdx);ev.preventDefault();return true}
  if(k==='Escape'){_mentionClose();ev.preventDefault();return true}
  return false;
}
/* roomInput 리스너 한 번만 등록 */
(function _bindMentionInput(){
  function bind(){
    const input=document.getElementById('roomInput');
    if(!input||input.dataset.mentionBound)return;
    input.dataset.mentionBound='1';
    input.addEventListener('input',function(){_mentionOnInput(input)});
    /* keydown: 드롭다운 활성 시 화살표·Enter·Esc 가로채기. 인라인 onkeydown(sendRoomMessage) 전에 실행됨 */
    input.addEventListener('keydown',function(ev){_mentionOnKeydown(input, ev)}, true);
    input.addEventListener('blur',function(){setTimeout(_mentionClose,180)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);
  else setTimeout(bind,0);
  /* openRoom 호출마다 input 이 새로 붙을 수 있으므로 지연 재바인딩 */
  setInterval(bind, 2000);
})();

/* [REPLY]{json}\n, [IMG], [FILE], [DOC:id] 프리픽스 파싱 */
function parseMsg(content){
  if(!content)return {reply:null,image:null,file:null,doc_id:null,alert:null,chatbot_share:null,text:''};
  let reply=null;
  const mr=/^\[REPLY\](\{[^\n]+\})\n([\s\S]*)$/.exec(content);
  if(mr){
    try{reply=JSON.parse(mr[1]);content=mr[2]}catch{}
  }
  const mc=/^\[CHATBOT_SHARE\](\{[\s\S]+\})$/.exec(content);
  if(mc){
    try{return {reply:reply,image:null,file:null,doc_id:null,alert:null,chatbot_share:JSON.parse(mc[1]),text:''}}catch{}
  }
  const ma=/^\[ALERT\](\{[\s\S]+\})$/.exec(content);
  if(ma){
    try{return {reply:reply,image:null,file:null,doc_id:null,alert:JSON.parse(ma[1]),chatbot_share:null,text:''}}catch{}
  }
  const md=/^\[DOC:(\d+)\](\n([\s\S]*))?$/.exec(content);
  if(md)return {reply:reply,image:null,file:null,doc_id:parseInt(md[1],10),alert:null,chatbot_share:null,text:md[3]||''};
  const mf=/^\[FILE\](\{[^\n]+\})(\n([\s\S]*))?$/.exec(content);
  if(mf){
    try{const obj=JSON.parse(mf[1]);return {reply:reply,image:null,file:obj,doc_id:null,alert:null,chatbot_share:null,text:mf[3]||''}}catch{}
  }
  const m=/^\[IMG\](\S+)(\n([\s\S]*))?$/.exec(content);
  if(m)return {reply:reply,image:m[1],file:null,doc_id:null,alert:null,chatbot_share:null,text:m[3]||''};
  return {reply:reply,image:null,file:null,doc_id:null,alert:null,chatbot_share:null,text:content};
}

/* 영수증 카드 렌더링 — 세무사측 (승인/반려 버튼 포함) */
function renderReceiptCardAdmin(doc){
  if(!doc) return '<div style="padding:10px 12px;border-radius:10px;background:#f2f4f6;font-size:.82em">🧾 문서 (조회 불가)</div>';
  const statusMap={pending:{tx:'⏳ 검토 중',bg:'#fef3c7',fg:'#92400e'},approved:{tx:'✅ 승인',bg:'#d1fae5',fg:'#065f46'},rejected:{tx:'❌ 반려',bg:'#fee2e2',fg:'#991b1b'}};
  const st=statusMap[doc.status]||statusMap.pending;
  const fmt=n=>n==null?'-':(Number(n)||0).toLocaleString('ko-KR')+'원';
  const imgUrl='/api/image?k='+encodeURIComponent(doc.image_key);
  const amb=doc.ocr_confidence!=null&&doc.ocr_confidence<0.7;
  const catOptions=['식비','교통비','숙박비','소모품비','접대비','통신비','공과금','임대료','인건비','기타'];
  const catSel=catOptions.map(c=>`<option value="${c}"${doc.category===c?' selected':''}>${c}</option>`).join('');
  const canEdit=doc.status!=='approved';
  const amb2=amb?` <span style="color:#d97706;font-size:.7em">(인식 낮음 ${Math.round(doc.ocr_confidence*100)}%)</span>`:'';
  /* 프리랜서·급여처럼 placeholder 이미지인 경우 썸네일 숨김 */
  const isPayroll=doc.doc_type==='freelancer_payment'||doc.doc_type==='payroll';
  const typeLabel=docTypeLabelAdmin(doc.doc_type);
  /* extra JSON 파싱 (프리랜서·급여 정보 표시용) */
  let exHTML='';
  if(isPayroll){
    let ex={};try{ex=JSON.parse(doc.ocr_raw||'{}')}catch{}
    /* admin은 documents.extra 컬럼이 들어오면 좋지만 raw에 들어올 수도 */
    try{if(doc.extra)ex=JSON.parse(doc.extra)||ex}catch{}
    if(ex.resident_no_masked)exHTML+=`<div style="font-size:.78em;color:#6b7684">주민번호: ${e(ex.resident_no_masked)}</div>`;
    if(ex.net_amount)exHTML+=`<div style="font-size:.78em;color:#6b7684">실수령: ${fmt(ex.net_amount)}</div>`;
    if(doc.doc_type==='freelancer_payment'&&ex.withholding_tax)exHTML+=`<div style="font-size:.78em;color:#6b7684">원천세 3.3%: ${fmt(ex.withholding_tax)}</div>`;
    if(doc.doc_type==='payroll'&&ex.total_4ins)exHTML+=`<div style="font-size:.78em;color:#6b7684">4대보험: ${fmt(ex.total_4ins)}</div>`;
  }
  /* 액션 버튼 — 상태별 분기 */
  let actionsHTML='';
  if(doc.status==='pending'){
    actionsHTML=`<button onclick="approveDoc(${doc.id},this)" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인</button>`
      +`<button onclick="rejectDocPrompt(${doc.id})" style="background:#fff;color:#f04452;border:1px solid #f04452;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">❌ 반려</button>`;
  } else if(doc.status==='approved'){
    actionsHTML=`<button onclick="revertDocApproval(${doc.id})" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">↺ 승인 취소</button>`;
  } else if(doc.status==='rejected'){
    actionsHTML=`<button onclick="approveDocById(${doc.id})" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:.85em;font-weight:700;cursor:pointer;font-family:inherit">✅ 복원</button>`;
  }
  /* 사진·파일로 되돌리기 — 잘못 분류된 경우 */
  if(!isPayroll && doc.status!=='approved'){
    actionsHTML+=`<button onclick="revertDocToPhotoAdmin(${doc.id})" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="일반 사진으로 되돌리기">📷 사진</button>`;
    actionsHTML+=`<button onclick="convertDocToFileAdmin(${doc.id})" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="일반 파일로 되돌리기">📁 파일</button>`;
  }
  /* 완전 삭제 */
  actionsHTML+=`<button onclick="deleteDocAdmin(${doc.id})" style="background:#fff;color:#dc2626;border:1px solid #dc2626;padding:7px 10px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit" title="R2 원본·DB·상담방 메시지 완전 삭제">🗑️ 삭제</button>`;
  /* 반응형: 모바일(≤480px)에선 세로 스택, 데스크톱에선 가로. max-width:100% + box-sizing 으로 폭 보장 */
  const thumb=isPayroll
    ? `<div class="rc-doc-thumb" style="flex-shrink:0;width:46px;height:46px;background:#dbeafe;color:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4em">${doc.doc_type==='payroll'?'👥':'🧑‍💼'}</div>`
    : `<div class="rc-doc-thumb" style="flex-shrink:0;width:88px;height:88px;background:#f3f4f6;border-radius:8px;overflow:hidden;cursor:zoom-in" onclick="openImgViewer('${imgUrl}',['${imgUrl}'])"><img src="${imgUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" onerror="this.style.display='none'"></div>`;
  return ''
    +`<div data-doc-id="${doc.id}" class="adm-doc-card" style="display:flex;gap:10px;flex-wrap:wrap;width:100%;max-width:380px;box-sizing:border-box;border-radius:12px;background:#fff;border:1px solid #e5e8eb;padding:10px">`
    + thumb
    +  `<div style="flex:1 1 180px;min-width:0;font-size:.8em">`
    +     `<div style="color:#8b95a1;font-size:.82em;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${typeLabel}${isPayroll?'':' · '+(doc.ocr_confidence!=null?Math.round(doc.ocr_confidence*100)+'%':'-')+amb2}</div>`
    +     `<div style="display:grid;grid-template-columns:52px 1fr;gap:4px 6px;align-items:center">`
    +       `<label style="color:#8b95a1;font-size:.88em">${isPayroll?'이름':'가맹점'}</label>`
    +       `<input type="text" value="${escAttr(doc.vendor||'')}" data-field="vendor" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       `<label style="color:#8b95a1;font-size:.88em">${isPayroll?'세전':'금액'}</label>`
    +       `<input type="number" value="${doc.amount||''}" data-field="amount" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       `<label style="color:#8b95a1;font-size:.88em">날짜</label>`
    +       `<input type="text" value="${escAttr(doc.receipt_date||'')}" data-field="receipt_date" placeholder="YYYY-MM-DD" ${canEdit?'':'readonly'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}">`
    +       (isPayroll?'':`<label style="color:#8b95a1;font-size:.88em">계정</label>`
    +         `<select data-field="category" ${canEdit?'':'disabled'} style="padding:5px 7px;border:1px solid #e5e8eb;border-radius:5px;font-size:.92em;width:100%;max-width:100%;box-sizing:border-box;font-family:inherit;background:${canEdit?'#fff':'#f9fafb'}"><option value="">(선택)</option>${catSel}</select>`)
    +     `</div>`
    +     exHTML
    +     `<div style="margin-top:6px"><span style="display:inline-block;font-size:.76em;padding:2px 8px;border-radius:8px;background:${st.bg};color:${st.fg};font-weight:700">${st.tx}</span></div>`
    +     (doc.reject_reason?`<div style="margin-top:4px;font-size:.8em;color:#991b1b">반려: ${e(doc.reject_reason)}</div>`:'')
    +     `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${actionsHTML}</div>`
    +  `</div>`
    +`</div>`;
}
function fileIconFor(name){
  const ext=(name||'').split('.').pop().toLowerCase();
  if(['pdf'].includes(ext))return '📕';
  if(['xls','xlsx','csv'].includes(ext))return '📊';
  if(['doc','docx'].includes(ext))return '📘';
  if(['ppt','pptx'].includes(ext))return '📽️';
  if(['hwp','hwpx'].includes(ext))return '📄';
  if(['zip'].includes(ext))return '🗜️';
  if(['txt'].includes(ext))return '📝';
  return '📎';
}
function fmtSize(n){
  if(!n)return '';
  if(n<1024)return n+'B';
  if(n<1024*1024)return (n/1024).toFixed(1)+'KB';
  return (n/1024/1024).toFixed(1)+'MB';
}
function renderMsgBody(content, attachedDoc){
  const p=parseMsg(content);
  let h='';
  if(p.reply){
    const s=p.reply.s||'', t=(p.reply.t||'').slice(0,100), ji=p.reply.i||'';
    h+='<div class="rc-quote" data-jump-mid="'+escAttr(String(ji))+'" onclick="jumpToOriginalMsgAdmin(\''+escAttr(String(ji))+'\')" style="cursor:pointer"><div class="rc-quote-sender">↩︎ '+e(s)+'</div><div class="rc-quote-text">'+e(t)+'</div></div>';
  }
  if(p.chatbot_share){
    const cs=p.chatbot_share;
    h+='<div style="border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;overflow:hidden;min-width:260px;max-width:400px">'
      +'<div style="padding:6px 10px;background:#dbeafe;color:#1e40af;font-size:.72em;font-weight:700;display:flex;align-items:center;gap:4px">🤖 챗봇 Q&A 공유 (고객이 챗봇에서 물어봄)</div>'
      +'<div style="padding:8px 10px;border-bottom:1px dashed #bfdbfe">'
      +'<div style="font-size:.7em;color:#3b82f6;font-weight:700;margin-bottom:2px">Q</div>'
      +'<div style="font-size:.88em;color:#1e3a8a;line-height:1.45;white-space:pre-wrap;word-break:break-word">'+e(String(cs.q||'').slice(0,400))+'</div>'
      +'</div>'
      +'<div style="padding:8px 10px">'
      +'<div style="font-size:.7em;color:#3b82f6;font-weight:700;margin-bottom:2px">A (AI 답변)</div>'
      +'<div style="font-size:.85em;color:#1e293b;line-height:1.5;white-space:pre-wrap;word-break:break-word">'+e(String(cs.a||'').slice(0,1500))+'</div>'
      +'</div>'
      +'</div>';
    return h;
  }
  if(p.alert){
    const a=p.alert;
    h+='<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#fff7ed,#fef3c7);border:1px solid #fcd34d;max-width:420px">'
      +'<div style="font-size:1.6em;line-height:1">🔔</div>'
      +'<div style="flex:1;min-width:0">'
      +  '<div style="font-weight:700;font-size:.92em;color:#92400e;margin-bottom:3px">'+e(a.t||'알림')+'</div>'
      +  '<div style="font-size:.82em;color:#78350f;line-height:1.4">'+e(a.m||'')+'</div>'
      +  (a.d?'<div style="font-size:.72em;color:#a16207;margin-top:4px">📅 '+e(a.d)+'</div>':'')
      +'</div></div>';
    return h;
  }
  if(p.doc_id){
    h+=renderReceiptCardAdmin(attachedDoc||null);
    if(p.text)h+='<div style="margin-top:6px">'+linkify(e(p.text))+'</div>';
    return h;
  }
  if(p.image){
    /* 관리자 채널: 이미지 wrapper + 의심 배지 overlay (onload 휴리스틱) */
    h+='<span class="rc-img-wrap" style="position:relative;display:inline-block;line-height:0">'
      +  '<img class="rc-img-msg" src="'+e(p.image)+'" alt="이미지" loading="lazy" style="display:inline-block;max-width:220px;max-height:300px;border-radius:10px;background:rgba(0,0,0,.06);object-fit:cover;cursor:zoom-in" onload="rcCheckDocSuspect(this)" onclick="if(window._lpJustFired){window._lpJustFired=false;return}openImgViewer(this.src,collectImagesNear(this))" onerror="this.outerHTML=\'<div style=\\\'padding:10px;color:#f04452;font-size:.8em\\\'>이미지 로드 실패</div>\'">'
      +  '<span class="rc-doc-badge" style="display:none;position:absolute;top:6px;right:6px;background:rgba(255,255,255,.92);border:1px solid #fcd34d;color:#92400e;font-size:.68em;font-weight:700;padding:2px 7px;border-radius:10px;line-height:1.4;box-shadow:0 1px 3px rgba(0,0,0,.15);pointer-events:none"></span>'
      +'</span>';
  }
  if(p.file){
    const nm=p.file.name||'파일';
    h+='<a href="'+e(p.file.url||'#')+'" download="'+e(nm)+'" onclick="if(!confirm(\'파일을 다운로드 하시겠습니까?\')){event.preventDefault();return false}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,.05);border-radius:10px;text-decoration:none;color:inherit;max-width:260px">'
      +'<div style="font-size:1.8em;line-height:1">'+fileIconFor(nm)+'</div>'
      +'<div style="flex:1;min-width:0;overflow:hidden"><div style="font-weight:600;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(nm)+'</div>'
      +'<div style="font-size:.72em;color:#8b95a1;margin-top:2px">'+fmtSize(p.file.size)+' · 다운로드</div></div></a>';
  }
  if(p.text)h+=((p.image||p.file)?'<div style="margin-top:6px">':'')+mentionify(linkify(e(p.text)))+((p.image||p.file)?'</div>':'');
  return h;
}

async function login(){
var k=$g('keyInput').value.trim();
if(!k)return;
await doLogin(k,true);
}

async function doLogin(k,showErr){
try{
const r=await fetch('/api/conversations?key='+encodeURIComponent(k)+'&page=1');
if(!r.ok)throw 0;
KEY=k;
/* 보안: ADMIN_KEY는 세션 단위(탭 닫히면 삭제)로만 보관. localStorage 영구 저장 금지 */
try{sessionStorage.setItem('admin_key',k)}catch{}
try{localStorage.removeItem('admin_key')}catch{}
$g('loginView').style.display='none';
$g('mainView').style.display='block';
/* Phase S3c-1: of-app flex layout 활성화 (사이드바 + mainView 함께 표시) */
var _mainAppView = document.getElementById('mainAppView');
if(_mainAppView){ _mainAppView.classList.remove('hidden'); _mainAppView.style.display='flex'; }
loadList();
refreshPendingBadge();
refreshLiveBadge();
setInterval(refreshPendingBadge,30000);
setInterval(refreshLiveBadge,10000);
/* 이전 탭 복원 (유효한 owner 탭만) */
try{
  var saved=localStorage.getItem('admin_last_tab');
  if(saved&&['chat','live','rooms','users','anal','review','faq'].indexOf(saved)>=0)tab(saved);
}catch{}
return true;
}catch{
try{sessionStorage.removeItem('admin_key')}catch{}
try{localStorage.removeItem('admin_key')}catch{}
if(showErr)$g('err').style.display='block';
return false;
}
}


function logout(){
KEY='';
try{sessionStorage.removeItem('admin_key')}catch{}
try{localStorage.removeItem('admin_key')}catch{}
$g('loginView').style.display='flex';
$g('mainView').style.display='none';
var _mainAppView = document.getElementById('mainAppView');
if(_mainAppView){ _mainAppView.style.display='none'; }
}

/* 세션 기반 사용자가 is_admin=1이면 staff.html로 리다이렉트 (owner 전용 페이지) */
async function tryAdminBySession(){
  try{
    const r=await fetch('/api/auth/me');
    const d=await r.json();
    if(d.logged_in&&d.user&&d.user.is_admin){
      location.replace('/staff.html');
      return true;
    }
  }catch{}
  return false;
}

/* 페이지 로드: 저장된 ADMIN_KEY가 있으면 자동 로그인. 없으면 로그인 폼 표시.
   (staff.html은 자체 staffBoot() 사용하므로 이 IIFE 스킵)
   이전: 저장된 키 없으면 /staff.html 로 자동 리다이렉트했는데,
   이 경우 사장님 본인이 카톡 로그인 상태면 staff로 튕겨서 ADMIN_KEY 입력 기회가 없었음.
   해결: admin.html은 항상 ADMIN_KEY 입력을 기다린다. 직원은 /staff.html 직접 방문 또는 마이페이지 버튼 사용. */
let IS_OWNER=true;
(async function(){
  if(location.pathname.endsWith('/staff.html'))return;
  /* 보안: 세션 스토리지(탭 수명)만 조회. 과거 localStorage 잔존 키는 정리 */
  try{localStorage.removeItem('admin_key')}catch{}
  try{
    var saved=sessionStorage.getItem('admin_key');
    if(saved){IS_OWNER=true;await doLogin(saved,false)}
  }catch{}
})();

/* 🔐 상담방 목록 모드: 'external'(기본) | 'internal'(관리자방) */
/* SPA 뒤로가기 지원 — 메타 12종 #7 Phase S3b (2026-05-04, 사장님 명령)
 *  - tab 클릭 시 history.pushState — 뒤로가기 시 이전 탭 복원
 *  - popstate (브라우저 뒤로가기/앞으로가기) → 자동 tab 호출
 *  - hash 기반 (admin#tab=users) — query string 충돌 없음, ?embedded=1 와 공존
 *  - _tabBypassPushState 로 무한 루프 방지 */
var _tabBypassPushState = false;
function tab(t){
/* SPA history push — popstate 호출 시 skip */
if(!_tabBypassPushState){
  try{
    if(typeof t === 'string' && t){
      var newHash = '#tab=' + t;
      if(location.hash !== newHash){
        history.pushState({adminTab: t}, '', location.pathname + location.search + newHash);
      }
    }
  }catch(_){}
}
_tabBypassPushState = false;
/* Phase S3c-2: 사이드바 active state 동기화 (data-admin-tab 매칭) */
try{
  document.querySelectorAll('.of-sb-item').forEach(function(b){
    if(b.dataset.adminTab === t) b.classList.add('on');
    else if(b.dataset.adminTab) b.classList.remove('on');
    /* data-mode='user' 항목은 tab='users' 일 때만 active 후보 (status 별 active 는 _adminSidebarClick 에서) */
    if(t !== 'users' && b.dataset.mode === 'user') b.classList.remove('on');
  });
}catch(_){}
try{localStorage.setItem('admin_last_tab',t)}catch{}
$g('tabChat').className=t==='chat'?'on':'';
$g('tabLive').className=t==='live'?'on':'';
$g('tabRooms').className=t==='rooms'?'on':'';
if($g('tabInternal'))$g('tabInternal').className=t==='internal'?'on':'';
if($g('tabDocs').className!==undefined)$g('tabDocs').className=t==='docs'?'on':'';
$g('tabUsers').className=t==='users'?'on':'';
$g('tabAnal').className=t==='anal'?'on':'';
$g('tabReview').className=t==='review'?'on':'';
$g('tabFaq').className=t==='faq'?'on':'';
$g('chatView').style.display=t==='chat'?'block':'none';
$g('detailView').style.display='none';
$g('liveView').style.display=t==='live'?'block':'none';
/* 상담방/관리자방은 같은 roomsView 재활용하되 모드만 다름 */
$g('roomsView').style.display=(t==='rooms'||t==='internal')?'block':'none';
$g('docsView').style.display=t==='docs'?'block':'none';
document.body.classList.toggle('docs-wide', t==='docs');
$g('usersView').style.display=t==='users'?'block':'none';
$g('analView').style.display=t==='anal'?'block':'none';
$g('reviewView').style.display=t==='review'?'block':'none';
$g('faqView').style.display=t==='faq'?'block':'none';
if(t==='anal')loadAnalytics();
if(t==='users')loadUsers(currentStatus||'pending');
if(t==='review')loadReview('pending');
if(t==='faq'){loadFaqStatus();loadFaqs()}
if(t==='docs')loadDocsTab();
if(t==='live')startLivePolling();
else stopLivePolling();
/* 모드 전환 시 현재 열린 방이 성격이 다르면 해제, 같으면 유지 */
if(t==='rooms'){
  if(_roomsMode!=='external')currentRoomId=null;
  _roomsMode='external';startRoomsPolling();
} else if(t==='internal'){
  if(_roomsMode!=='internal')currentRoomId=null;
  _roomsMode='internal';startRoomsPolling();
} else stopRoomsPolling();
}

/* ===== 🔔 PC 브라우저 알림 (OS 네이티브) =====
   - 설정: localStorage 'pcNotifyOn' (0/1)
   - 권한: Notification.requestPermission()
   - 감지: loadRoomList 주기 polling 결과에서 user_msg_count 증가분
   - 클릭: 해당 방 openRoom + 창 focus
   - 현재 열린 방은 알림 X (이미 보고 있음)
   - 첫 로드(캐시 비어있음) 시엔 알림 X */
const _notifyPrevCounts = {};
let _notifyFirstLoad = true;
function _pcNotifyEnabled(){
  try{return localStorage.getItem('pcNotifyOn')==='1'}catch(_){return false}
}
function _pcNotifySet(on){
  try{localStorage.setItem('pcNotifyOn', on?'1':'0')}catch(_){}
}
function _updatePcNotifyBtn(){
  const on=_pcNotifyEnabled();
  const perm=(typeof Notification!=='undefined')?Notification.permission:'denied';
  /* 헤더 버튼 (있으면) */
  const b=document.getElementById('pcNotifyBtn');
  if(b){
    if(on && perm==='granted'){
      b.innerHTML='🔔 알림';
      b.style.background='#10b981';b.style.color='#fff';
      b.title='PC 알림 켜짐 — 클릭해서 끄기';
    } else if(on && perm!=='granted'){
      b.innerHTML='🔕 알림 (차단)';
      b.style.background='#fef3c7';b.style.color='#92400e';
      b.title='브라우저 알림 권한 거부됨 — 주소창 왼쪽 자물쇠 아이콘에서 허용 필요';
    } else {
      b.innerHTML='🔕 알림';
      b.style.background='';b.style.color='';
      b.title='PC 알림 꺼짐 — 클릭해서 켜기';
    }
  }
  /* Phase M7 (2026-05-05 사장님 명령): 사이드바 sbPcNotifyBtn 도 시각 토글 */
  const sb=document.getElementById('sbPcNotifyBtn');
  if(sb){
    const ic=sb.querySelector('.ic'); const lb=sb.querySelector('.lb');
    if(on && perm==='granted'){
      if(ic) ic.textContent='🔔';
      if(lb) lb.textContent='PC 알림 ON';
      sb.style.color='var(--sb-active-text, #3182f6)';
      sb.style.fontWeight='700';
      sb.title='PC 알림 켜짐 — 클릭해서 끄기';
    } else if(on && perm!=='granted'){
      if(ic) ic.textContent='🔕';
      if(lb) lb.textContent='PC 알림 (차단)';
      sb.style.color='#92400e';
      sb.style.fontWeight='';
      sb.title='브라우저 알림 권한 거부됨 — 주소창 왼쪽 자물쇠 아이콘에서 허용 필요';
    } else {
      if(ic) ic.textContent='🔕';
      if(lb) lb.textContent='PC 알림';
      sb.style.color='';
      sb.style.fontWeight='';
      sb.title='PC 알림 꺼짐 — 클릭해서 켜기';
    }
  }
}
async function togglePcNotify(){
  if(typeof Notification==='undefined'){alert('이 브라우저는 알림을 지원하지 않습니다');return}
  const nowOn=_pcNotifyEnabled();
  if(nowOn){
    _pcNotifySet(false);
    _updatePcNotifyBtn();
    if(typeof showAdminToast==='function')showAdminToast('🔕 PC 알림 꺼짐');
    return;
  }
  /* 켜기 — 권한 요청 */
  let perm=Notification.permission;
  if(perm==='default'){
    try{perm=await Notification.requestPermission()}catch(_){perm='denied'}
  }
  if(perm!=='granted'){
    alert('브라우저 알림 권한이 필요합니다.\n주소창 왼쪽 자물쇠(🔒) 아이콘 → 알림 → 허용으로 바꿔주세요.');
    _pcNotifySet(false);
    _updatePcNotifyBtn();
    return;
  }
  _pcNotifySet(true);
  _updatePcNotifyBtn();
  /* 시범 알림 — 켜졌다는 피드백 */
  try{
    const n=new Notification('🔔 PC 알림 켜짐', {
      body: '고객에게 새 메시지가 오면 여기 표시됩니다',
      icon: '/logo-icon.png',
      tag: 'pcNotifyTest',
    });
    setTimeout(()=>{try{n.close()}catch(_){}},3000);
  }catch(_){}
  if(typeof showAdminToast==='function')showAdminToast('🔔 PC 알림 켜짐');
}
function _detectNewMessagesForNotify(rooms){
  try{
    if(!Array.isArray(rooms))return;
    const first=_notifyFirstLoad;
    /* 첫 로드는 baseline 만 설정하고 알림 X */
    if(first){
      for(const rm of rooms)_notifyPrevCounts[rm.id]=Number(rm.user_msg_count||0);
      _notifyFirstLoad=false;
      _updatePcNotifyBtn();
      return;
    }
    if(!_pcNotifyEnabled())return;
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    /* 탭이 보이고 해당 방이 열려있으면 알림 X (이미 보고 있음) */
    const visible=(typeof document.visibilityState==='string')?(document.visibilityState==='visible'):true;
    for(const rm of rooms){
      const prev=_notifyPrevCounts[rm.id];
      const now=Number(rm.user_msg_count||0);
      _notifyPrevCounts[rm.id]=now;
      if(prev==null)continue;
      if(now<=prev)continue;
      /* 현재 열린 방 + 탭 보임 상태면 스킵 */
      if(visible && currentRoomId===rm.id)continue;
      /* 알림 생성 */
      const diff=now-prev;
      const who=rm.first_member_name||rm.name||'거래처';
      const preview=String(rm.last_msg_preview||'새 메시지가 있습니다').slice(0,80);
      try{
        const n=new Notification('💬 '+who+(diff>1?' ('+diff+')':''), {
          body: preview,
          icon: '/logo-icon.png',
          tag: 'room-'+rm.id,
          renotify: true,
          requireInteraction: false,
        });
        n.onclick=function(){
          try{window.focus();if(typeof openRoom==='function')openRoom(rm.id);n.close()}catch(_){}
        };
      }catch(_){}
    }
  }catch(_){}
}
/* 초기 버튼 상태 반영 (DOM 준비 후) */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',_updatePcNotifyBtn);
} else {
  setTimeout(_updatePcNotifyBtn,0);
}

async function setRoomPriority(roomId, value){
  const n = Number(value);
  const p = (n===1 || n===2 || n===3) ? n : null;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=set_priority',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:roomId, priority:p})});
    const d=await r.json();
    if(d.ok){loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

/* 상담방 햄버거 메뉴 토글 */
function toggleRoomMenu(){
  var el=document.getElementById('roomActions');
  if(!el)return;
  el.style.display = (el.style.display==='none'||!el.style.display) ? 'flex' : 'none';
}

/* 상담방 팝업 (새 창) — PC 멀티태스킹용. 모바일에선 그냥 기존 방식 */
function popoutCurrentRoom(){
  if(!currentRoomId){alert('상담방이 선택돼 있지 않습니다');return}
  /* 세션 기반(직원) 이거나 sessionStorage ADMIN_KEY 있으면 새 창도 자동 로그인 */
  var url=location.pathname+'?popup=1&room='+encodeURIComponent(currentRoomId);
  try{
    window.open(url,'room_'+currentRoomId,'width=520,height=840,resizable=yes,scrollbars=yes');
  }catch(e){
    /* 팝업 차단 대비 */
    window.open(url,'_blank');
  }
}

/* 팝업 모드 초기 진입: ?popup=1 이면 좌측·상단 숨기고 채팅만 풀스크린 */
(function popupBoot(){
  try{
    var p=new URLSearchParams(location.search);
    if(p.get('popup')!=='1')return;
    var roomId=p.get('room');
    if(!roomId)return;
    document.addEventListener('DOMContentLoaded',function(){applyPopupLayout(roomId)});
    if(document.readyState!=='loading')applyPopupLayout(roomId);
  }catch{}
})();
function applyPopupLayout(roomId){
  try{
    /* 상단 헤더 숨김, 다른 탭 숨김 */
    var hdr=document.querySelector('.hdr');if(hdr)hdr.style.display='none';
    var sm=document.getElementById('searchModal');if(sm)sm.style.display='none';
    /* 상담방 탭 자동 전환 + 방 자동 오픈 */
    if(typeof tab==='function')tab('rooms');
    setTimeout(function(){if(typeof openRoom==='function')openRoom(roomId)},200);
    /* 팝업 안에선 목록 숨김 */
    setTimeout(function(){
      var list=document.querySelector('.room-list-panel');if(list)list.style.display='none';
      var chat=document.querySelector('.room-chat-panel');
      if(chat){chat.style.width='100%';chat.style.flex='1'}
      var wrap=document.querySelector('.wrap');
      if(wrap){wrap.style.maxWidth='none';wrap.style.padding='0';wrap.style.margin='0'}
      /* 팝업 창에선 '🔗 새 창' 버튼 감추기 (이미 팝업인데) */
      var btn=document.getElementById('roomPopoutBtn');if(btn)btn.style.display='none';
      /* 팝업에선 햄버거 메뉴 자동으로 펼침 (이미 별도 창이라 화면 여유 있음) */
      var act=document.getElementById('roomActions');if(act)act.style.display='flex';
      /* 팝업 탭 이름 */
      document.title='상담방 · '+roomId+' — 세무회계 이윤';
    },400);
  }catch(err){console.error('popup layout',err)}
}


/* ===== 📥 owner 전용 전체 내보내기 (사장님 명령 2026-04-30) =====
 * "관리자도 내보내기 기능 — 이거 나만 할 수 있어야 하고 세무사만"
 * IS_OWNER 시에만 admin.html 거래처 탭 헤더의 #ownerExportBtn 표시.
 * 클릭 → 3가지 CSV 선택 (사용자 / 업체 / 메모) confirm 후 download. */
function _refreshOwnerExportBtn(){
  const btn = document.getElementById('ownerExportBtn');
  if(!btn) return;
  /* IS_OWNER 는 admin.js 의 전역 변수 (true 면 ADMIN_KEY 사장님). */
  btn.style.display = (typeof IS_OWNER !== 'undefined' && IS_OWNER) ? 'inline-block' : 'none';
}
/* IS_OWNER 변경 시점에 호출 — 부트 + login */
(function(){
  if(window._ownerExportBtnTimer) clearTimeout(window._ownerExportBtnTimer);
  window._ownerExportBtnTimer = setInterval(_refreshOwnerExportBtn, 1500);
})();

function openOwnerExport(){
  if(typeof IS_OWNER !== 'undefined' && !IS_OWNER){
    alert('owner(사장님) 권한 필요');
    return;
  }
  const choice = prompt(
    '📥 전체 내보내기 — 무엇을 받으시겠습니까?\n\n' +
    '1 = 거래처(사용자) CSV\n' +
    '2 = 업체 CSV\n' +
    '3 = 메모 전체 CSV\n\n' +
    '번호 입력 (1/2/3):',
    '1'
  );
  if(!choice) return;
  let type = '';
  if(choice === '1') type = 'users';
  else if(choice === '2') type = 'businesses';
  else if(choice === '3') type = 'memos';
  else { alert('1, 2, 3 중 하나'); return; }
  /* 새 탭으로 다운로드 (Content-Disposition: attachment 라 자동 다운) */
  const url = '/api/admin-export?type=' + type + '&key=' + encodeURIComponent(KEY || '');
  window.location.href = url;
}

/* ===== 📋 내 할 일 대시보드 — 전체 방 + 개인 일정 통합 뷰 =====
   Purpose: 방 150개 일일이 클릭 안 해도 오늘·내일·이번주 할 일 한 번에 파악
   Data source: /api/memos?scope=my (미완료 할 일만, 방 정보 JOIN) */
let _myTodosCache=[];
async function openMyTodos(){
  const m=$g('myTodosModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  if($g('mtNewContent'))$g('mtNewContent').value='';
  if($g('mtNewDue'))$g('mtNewDue').value='';
  await loadMyTodos();
}
function closeMyTodos(){
  const m=$g('myTodosModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function loadMyTodos(){
  const list=$g('myTodosList');if(!list)return;
  list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  const onlyMine=$g('mtOnlyMine')?.checked?1:0;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my&only_mine='+onlyMine);
    const d=await r.json();
    if(d.error){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    _myTodosCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
/* 기한 그룹핑: 지남 / 오늘 / 내일 / 이번주(2~7일) / 다음주이후 / 기한없음 */
function _bucketByDue(due){
  if(!due||!/^\d{4}-\d{2}-\d{2}$/.test(due))return 'none';
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  if(diff<0)return 'overdue';
  if(diff===0)return 'today';
  if(diff===1)return 'tomorrow';
  if(diff<=7)return 'week';
  return 'later';
}
function _renderMyTodos(){
  const list=$g('myTodosList');if(!list)return;
  if(!_myTodosCache.length){
    list.innerHTML='<div style="text-align:center;padding:50px 20px;color:#8b95a1;font-size:.9em">📭 처리할 일이 없습니다<br><span style="font-size:.85em;color:#adb5bd">위 입력창에서 개인 일정을 추가하거나<br>상담방 📒 메모에서 할 일을 작성하세요</span></div>';
    $g('mtMeta').textContent='0건';
    return;
  }
  const groups={overdue:[],today:[],tomorrow:[],week:[],later:[],none:[]};
  for(const m of _myTodosCache)groups[_bucketByDue(m.due_date)].push(m);
  const labels=[
    ['overdue','🔴 지남','#dc2626'],
    ['today','🟠 오늘','#ea580c'],
    ['tomorrow','🟡 내일','#ca8a04'],
    ['week','🟢 이번주','#059669'],
    ['later','🔵 다음주 이후','#2563eb'],
    ['none','⚪ 기한 없음','#6b7280'],
  ];
  let html='';
  const total=_myTodosCache.length;
  for(const [k,lab,col] of labels){
    const arr=groups[k];if(!arr.length)continue;
    html+='<div style="margin-bottom:14px">'
      +'<div style="font-size:.82em;font-weight:700;color:'+col+';margin-bottom:6px;padding:3px 0;border-bottom:2px solid '+col+'">'+e(lab)+' <span style="font-weight:500;color:#6b7280">('+arr.length+')</span></div>'
      +arr.map(_todoRow).join('')
      +'</div>';
  }
  list.innerHTML=html;
  $g('mtMeta').textContent=total+'건';
}
function _todoRow(m){
  const isPersonal=!m.room_id;
  const roomBadge=isPersonal
    ? '<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:8px;font-size:.7em;font-weight:700">📍 개인</span>'
    : '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomFromTodo(\''+escAttr(m.room_id)+'\')" style="background:#dbeafe;color:#1e40af;padding:1px 7px;border-radius:8px;font-size:.7em;font-weight:700;text-decoration:none" title="이 방으로 이동">📍 '+e(m.room_name||m.room_id)+'</a>';
  const dueLbl=m.due_date?'<span style="font-size:.7em;color:#6b7280">📅 '+e(m.due_date)+'</span>':'';
  const linkBtn=m.linked_message_id
    ? '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomFromTodo(\''+escAttr(m.room_id||'')+'\','+m.linked_message_id+')" style="color:#3182f6;font-size:.72em;text-decoration:none" title="원본 메시지">🔗#'+m.linked_message_id+'</a>'
    : '';
  return '<div style="display:flex;gap:9px;padding:8px 10px;border:1px solid #fde68a;border-radius:7px;margin-bottom:5px;background:#fffef5;align-items:flex-start">'
    +'<input type="checkbox" onchange="completeTodo('+m.id+')" style="width:18px;height:18px;cursor:pointer;accent-color:#10b981;flex-shrink:0;margin-top:1px">'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:.88em;color:#191f28;line-height:1.45;word-break:break-word">'+e(m.content||'')+'</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">'
    +roomBadge+dueLbl+linkBtn
    +'<span style="font-size:.7em;color:#9ca3af;margin-left:auto">'+e(m.author_name||'')+'</span>'
    +'<button onclick="deleteTodoFromDashboard('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:0 2px" title="삭제">🗑️</button>'
    +'</div></div></div>';
}
async function completeTodo(id){
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'완료'})
    });
    const d=await r.json();
    if(!d.ok){alert('완료 처리 실패: '+(d.error||'unknown'));return}
    /* 즉시 UI 제거 (캐시에서 빼고 리렌더) */
    _myTodosCache=_myTodosCache.filter(m=>m.id!==id);
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){alert('오류: '+err.message)}
}
async function deleteTodoFromDashboard(id){
  if(!confirm('이 할 일을 삭제할까요?'))return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    _myTodosCache=_myTodosCache.filter(m=>m.id!==id);
    _renderMyTodos();
    _updateMyTodosBadge();
  }catch(err){alert('오류: '+err.message)}
}
async function addPersonalTask(){
  const content=($g('mtNewContent')?.value||'').trim();
  const due=($g('mtNewDue')?.value||'').trim();
  if(!content){alert('일정 내용을 입력하세요');return}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:'할 일', content, due_date: due||null}) /* room_id 없음 = 개인 일정 */
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    $g('mtNewContent').value='';
    $g('mtNewDue').value='';
    await loadMyTodos();
  }catch(err){alert('오류: '+err.message)}
}
/* 대시보드에서 방 점프 — 모달 닫고 방 열기 */
function jumpToRoomFromTodo(roomId, msgId){
  if(!roomId)return;
  closeMyTodos();
  if(typeof openRoom==='function'){
    setTimeout(()=>{
      openRoom(roomId);
      if(msgId){
        setTimeout(()=>jumpToRoomMessage(msgId), 500);
      }
    }, 100);
  }
}
/* 📋 할 일 버튼 뱃지 (미완료 총 개수) */
function _updateMyTodosBadge(){
  const b=$g('myTodosBadge');if(!b)return;
  const n=_myTodosCache.filter(m=>m._t==='할 일').length;
  if(n>0){b.textContent=n;b.style.display='inline-block'}
  else{b.style.display='none'}
}
/* 초기 로드 — 헤더 뱃지 표시용 조용히 한 번 조회 */
async function _silentLoadMyTodos(){
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my');
    const d=await r.json();
    if(d.memos){
      _myTodosCache=d.memos.map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
      _updateMyTodosBadge();
    }
  }catch(_){}
}
/* 페이지 로드 후 한 번 + 이후 60초마다 뱃지 갱신 */
setTimeout(_silentLoadMyTodos, 2000);
setInterval(_silentLoadMyTodos, 60000);

/* ===== 📒 담당자 메모 (내부 전용 · 재설계 2026-04-22) =====
   타입 3종: '할 일' (방 or 개인) / '완료' (체크상태) / '거래처 정보' (영구, user_id 기반)
   체크박스: 할 일 ↔ 완료 토글 (PATCH memo_type)
   거래처 정보: AI 요약 시 항상 상단 주입 → 인수인계·기본사항 자동 반영
   기한(due_date) + 연결 메시지(#ID) + D-day 하이라이트 */
const _MEMO_TYPES=['할 일','거래처 정보','완료'];
const _MEMO_COLORS={'할 일':'#b45309','완료':'#64748b','거래처 정보':'#1e40af','참고':'#1e40af'};
const _MEMO_ICONS={'할 일':'📌','완료':'✅','거래처 정보':'🏢','참고':'📝'};
/* 구 타입 → 신 타입 매핑 */
const _MEMO_LEGACY={
  '사실메모':'거래처 정보','확인필요':'할 일','고객요청':'할 일',
  '담당자판단':'거래처 정보','주의사항':'거래처 정보','완료처리':'완료',
  '참고':'거래처 정보',
};
function _normType(t){return _MEMO_LEGACY[t]||t||'할 일'}
let _memoSelectedType='할 일';
let _memoEditingId=null;
let _memoFilter='todo'; /* todo | ref | done | all */
let _memoCache=[];

async function openRoomMemos(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const modal=$g('memoModal');
  if(!modal)return;
  /* 팝업 창이면 사이드 도킹용 공간 확보 — 자동 폭 확장 */
  try{
    const isPopup=new URLSearchParams(location.search).get('popup')==='1';
    if(isPopup && window.innerWidth<1100){
      window.resizeTo(1100, Math.max(window.innerHeight, 780));
    }
  }catch(_){}
  /* 사이드 도킹 모드: 대화창과 나란히 볼 수 있게. PC(≥1024px)에선 우측 패널, 모바일은 바텀 시트.
     body 스크롤은 유지 (채팅 스크롤 되도록) — PC 사이드 모드에선 배경 투명이라 밖 클릭도 채팅에 전달됨. */
  modal.classList.add('side-dock');
  modal.style.display='flex';
  document.body.classList.add('memo-side-open');
  /* 모바일에선 화면 가리므로 body overflow 잠금 유지 */
  if(window.matchMedia('(max-width:1023px)').matches){
    document.body.style.overflow='hidden';
  } else {
    document.body.style.overflow='';
  }
  _memoEditingId=null;
  _memoSelectedType='할 일';
  _memoFilter='todo';
  if($g('memoInput'))$g('memoInput').value='';
  if($g('memoDueDate'))$g('memoDueDate').value='';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value='';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
  _renderMemoFilterTabs();
  await loadRoomMemos();
}
function closeMemoModal(){
  const m=$g('memoModal');if(m)m.style.display='none';
  if(m)m.classList.remove('side-dock');
  document.body.classList.remove('memo-side-open');
  document.body.style.overflow='';
}
/* 창 크기 변화 시 body overflow 조정 (PC ↔ 모바일 전환) */
window.addEventListener('resize',function(){
  const m=document.getElementById('memoModal');
  if(!m||m.style.display!=='flex')return;
  document.body.style.overflow=window.matchMedia('(max-width:1023px)').matches?'hidden':'';
});
/* ESC 로 메모 패널 닫기 (한 번만 등록) */
(function(){
  if(window._memoEscBound)return;
  window._memoEscBound=true;
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Escape')return;
    const m=document.getElementById('memoModal');
    if(!m||m.style.display!=='flex')return;
    /* 입력 중이면 기본 동작(포커스 해제) 보존하되 모달 닫기도 */
    closeMemoModal();
  });
})();
function _renderMemoTypeTabs(){
  const box=$g('memoTypeTabs');if(!box)return;
  box.innerHTML='<span style="font-size:.72em;color:#6b7280;margin-right:4px">종류:</span>'
    +_MEMO_TYPES.map(t=>{
      const on=t===_memoSelectedType;
      const c=_MEMO_COLORS[t]||'#334155';
      return '<button onclick="selectMemoType(\''+t+'\')" style="background:'+(on?c:'#fff')+';color:'+(on?'#fff':'#334155')+';border:1px solid '+(on?c:'#e5e8eb')+';padding:4px 10px;border-radius:14px;font-size:.74em;cursor:pointer;font-family:inherit;font-weight:'+(on?'700':'500')+'">'+_MEMO_ICONS[t]+' '+e(t)+'</button>';
    }).join('');
}
function selectMemoType(t){
  if(_MEMO_TYPES.indexOf(t)<0)return;
  _memoSelectedType=t;
  _renderMemoTypeTabs();
}
function setMemoFilter(f){
  _memoFilter=f;
  _renderMemoFilterTabs();
  _renderMemoList();
}
function _renderMemoFilterTabs(){
  document.querySelectorAll('.memo-filter').forEach(b=>{
    const on=b.getAttribute('data-filter')===_memoFilter;
    b.style.background=on?'#191f28':'#e5e8eb';
    b.style.color=on?'#fff':'#555';
    b.style.fontWeight=on?'700':'500';
  });
}
async function loadRoomMemos(){
  const list=$g('memoList');
  if(!list||!currentRoomId)return;
  list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    if(d.error){list.innerHTML='<div style="color:#f04452;padding:20px 0">불러오기 실패: '+e(d.error)+'</div>';return}
    _memoCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _updateMemoCounts();
    _renderMemoList();
    /* 📒 메뉴 버튼에 할 일 건수 뱃지 (존재하면) */
    _updateRoomMemoBadge();
  }catch(err){list.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function _updateMemoCounts(){
  const counts={'할 일':0,'거래처 정보':0,'완료':0,total:_memoCache.length};
  _memoCache.forEach(m=>{counts[m._t]=(counts[m._t]||0)+1});
  if($g('memoCountTodo'))$g('memoCountTodo').textContent=counts['할 일']?'('+counts['할 일']+')':'';
  if($g('memoCountRef'))$g('memoCountRef').textContent=counts['거래처 정보']?'('+counts['거래처 정보']+')':'';
  if($g('memoCountDone'))$g('memoCountDone').textContent=counts['완료']?'('+counts['완료']+')':'';
  if($g('memoCountAll'))$g('memoCountAll').textContent=counts.total?'('+counts.total+')':'';
}
function _filterMemos(){
  if(_memoFilter==='todo')return _memoCache.filter(m=>m._t==='할 일');
  if(_memoFilter==='ref') return _memoCache.filter(m=>m._t==='거래처 정보');
  if(_memoFilter==='done')return _memoCache.filter(m=>m._t==='완료');
  return _memoCache;
}
function _dDayLabel(due){
  if(!due)return null;
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due))return null;
  const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  let color='#64748b', label='';
  if(diff<0){color='#991b1b';label='지남 '+(-diff)+'일'}
  else if(diff===0){color='#dc2626';label='D-DAY'}
  else if(diff<=3){color='#ea580c';label='D-'+diff}
  else if(diff<=7){color='#b45309';label='D-'+diff}
  else {color='#64748b';label='D-'+diff}
  return '<span style="background:'+color+';color:#fff;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:4px">📅 '+due+' · '+label+'</span>';
}
function _renderMemoList(){
  const list=$g('memoList');if(!list)return;
  const memos=_filterMemos();
  if(!memos.length){
    const hint=_memoFilter==='todo'?'지금 할 일이 없습니다. 입력창에서 새 메모를 추가하세요.'
              :_memoFilter==='done'?'완료된 메모가 없습니다.'
              :_memoFilter==='ref' ?'참고 메모가 없습니다.'
              :'메모가 없습니다.';
    list.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 16px;font-size:.88em">📭 '+e(hint)+'</div>';
    return;
  }
  list.innerHTML=memos.map(m=>{
    const typ=m._t;
    const c=_MEMO_COLORS[typ]||'#334155';
    const icon=_MEMO_ICONS[typ]||'📌';
    const isDone=typ==='완료';
    const edited=m.is_edited?'<span style="font-size:.68em;color:#8b95a1;margin-left:3px">·수정</span>':'';
    const dueBadge=_dDayLabel(m.due_date)||'';
    const linkBadge=m.linked_message_id
      ? '<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToRoomMessage('+m.linked_message_id+')" style="color:#3182f6;text-decoration:none;background:#eff6ff;border:1px solid #bfdbfe;padding:0 5px;border-radius:4px;font-size:.7em;margin-left:4px">🔗 #'+m.linked_message_id+'</a>'
      : '';
    const contentStyle=isDone
      ? 'font-size:.88em;color:#9ca3af;text-decoration:line-through;white-space:pre-wrap;word-break:break-word;line-height:1.55'
      : 'font-size:.88em;color:#191f28;white-space:pre-wrap;word-break:break-word;line-height:1.55';
    /* 체크박스: 할 일 ↔ 완료 토글. 참고는 체크박스 대신 인디케이터만 */
    const checkbox = (typ==='할 일' || typ==='완료')
      ? '<label style="display:flex;align-items:center;cursor:pointer;flex-shrink:0"><input type="checkbox" '+(isDone?'checked':'')+' onchange="toggleMemoDone('+m.id+','+(!isDone)+')" style="width:18px;height:18px;cursor:pointer;accent-color:#10b981"></label>'
      : '<span style="width:18px;display:inline-block;flex-shrink:0;text-align:center;color:'+c+'">'+icon+'</span>';
    const bg=isDone?'#fafbfc':(typ==='할 일'?'#fffef5':'#fff');
    const borderColor=isDone?'#e5e8eb':(typ==='할 일'?'#fde68a':'#e5e8eb');
    return '<div style="display:flex;gap:10px;padding:9px 11px;border:1px solid '+borderColor+';border-radius:8px;margin-bottom:6px;background:'+bg+';align-items:flex-start">'
      +checkbox
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;font-size:.7em;color:#6b7280;flex-wrap:wrap">'
      +  (typ!=='할 일' && typ!=='완료' ? '<span style="background:'+c+';color:#fff;padding:1px 7px;border-radius:10px;font-weight:700">'+icon+' '+e(typ)+'</span>' : '')
      +  '<span>'+e(m.author_name||'담당자')+'</span>'
      +  '<span>·</span>'
      +  '<span>'+e((m.created_at||'').substring(5,16).replace('T',' '))+'</span>'
      +  edited
      +  dueBadge
      +  linkBadge
      +  '<div style="flex:1"></div>'
      +  '<button onclick="startEditMemo('+m.id+')" style="background:none;border:none;color:#3182f6;font-size:.76em;cursor:pointer;font-family:inherit;padding:1px 4px" title="수정">✏️</button>'
      +  '<button onclick="deleteMemo('+m.id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:1px 4px" title="삭제">🗑️</button>'
      +'</div>'
      +'<div style="'+contentStyle+'">'+e(m.content||'')+'</div>'
      +'</div></div>';
  }).join('');
}
function _updateMemoEditBanner(){
  const b=$g('memoEditBanner'), c=$g('memoCancelBtn'), s=$g('memoSubmitBtn');
  if(_memoEditingId){
    if(b)b.style.display='inline';
    if(c)c.style.display='inline-block';
    if(s)s.textContent='수정 저장';
  } else {
    if(b)b.style.display='none';
    if(c)c.style.display='none';
    if(s)s.textContent='저장';
  }
}
/* 체크박스 클릭 — 할 일 ↔ 완료 PATCH */
async function toggleMemoDone(id, done){
  const newType=done?'완료':'할 일';
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({memo_type:newType})
    });
    const d=await r.json();
    if(!d.ok){alert('상태 변경 실패: '+(d.error||'unknown'));return}
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
}
/* id 만 받아서 캐시에서 본문·타입·기한·연결 추출 */
function startEditMemo(id){
  const m=_memoCache.find(x=>x.id===id);
  if(!m)return;
  _memoEditingId=id;
  _memoSelectedType=m._t;
  if($g('memoInput'))$g('memoInput').value=String(m.content||'');
  if($g('memoDueDate'))$g('memoDueDate').value=m.due_date||'';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value=m.linked_message_id||'';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
  if($g('memoInput'))$g('memoInput').focus();
}
function cancelMemoEdit(){
  _memoEditingId=null;
  if($g('memoInput'))$g('memoInput').value='';
  if($g('memoDueDate'))$g('memoDueDate').value='';
  if($g('memoLinkMsg'))$g('memoLinkMsg').value='';
  _memoSelectedType='할 일';
  _renderMemoTypeTabs();
  _updateMemoEditBanner();
}
async function submitMemo(){
  if(!currentRoomId){alert('상담방이 선택되지 않았습니다');return}
  const input=$g('memoInput'), content=input.value.trim();
  if(!content){alert('메모 내용을 입력하세요');return}
  const due=($g('memoDueDate')?.value||'').trim();
  const linkIdRaw=($g('memoLinkMsg')?.value||'').trim();
  const linkId=linkIdRaw?parseInt(linkIdRaw,10):null;
  const btn=$g('memoSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';}
  try{
    const payload={memo_type:_memoSelectedType, content, due_date: due||null, linked_message_id: linkId||null};
    let r;
    if(_memoEditingId){
      r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+_memoEditingId,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
    } else {
      r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...payload, room_id:currentRoomId})
      });
    }
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    cancelMemoEdit();
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='';}}
}
async function deleteMemo(id){
  if(!confirm('이 메모를 삭제할까요?'))return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    await loadRoomMemos();
  }catch(err){alert('오류: '+err.message)}
}
/* 📒 버튼에 미완료(할 일) 건수 뱃지 표시 — 찾을 수 있으면만 */
function _updateRoomMemoBadge(){
  try{
    const todo=_memoCache.filter(m=>m._t==='할 일').length;
    const btns=document.querySelectorAll('button[onclick="openRoomMemos()"]');
    btns.forEach(b=>{
      b.innerHTML='📒 메모'+(todo?' <span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 6px;font-size:.7em;font-weight:700">'+todo+'</span>':'');
    });
  }catch(_){}
}

/* ===== D안: 입력창 옆 빠른 메모 토글 ===== */
let _quickMemoMode=false;
function toggleQuickMemoMode(){
  _quickMemoMode=!_quickMemoMode;
  const input=$g('roomInput'), btn=$g('roomQuickMemoBtn'), sendBtn=$g('roomSendBtn');
  if(!input)return;
  if(_quickMemoMode){
    input.dataset._origPlaceholder=input.placeholder||'';
    input.placeholder='📒 내부 메모 (고객에게 안 보임) — Enter로 저장';
    input.style.background='#fffbeb';
    input.style.border='2px solid #f59e0b';
    if(btn){btn.style.background='#f59e0b';btn.style.color='#fff';btn.title='메모 모드 해제'}
    if(sendBtn){sendBtn.textContent='저장';sendBtn.style.background='#f59e0b'}
    input.focus();
  } else {
    input.placeholder=input.dataset._origPlaceholder||'메시지 입력...';
    input.style.background='';
    input.style.border='1px solid #e5e8eb';
    if(btn){btn.style.background='';btn.style.color='';btn.title='빠른 메모 (내부 전용)'}
    if(sendBtn){sendBtn.textContent='전송';sendBtn.style.background='#3182f6'}
  }
}
async function submitQuickMemo(){
  if(!currentRoomId){alert('상담방이 선택되지 않았습니다');return}
  const input=$g('roomInput');
  const content=(input?.value||'').trim();
  if(!content){toggleQuickMemoMode();return}
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:currentRoomId, memo_type:'할 일', content})
    });
    const d=await r.json();
    if(!d.ok){alert('메모 저장 실패: '+(d.error||'unknown'));return}
    input.value='';
    input.style.height='auto';
    if(typeof showAdminToast==='function')showAdminToast('📒 메모 저장됨');
    /* 메모 모드 그대로 유지 — 여러 건 연속 입력 편의. 해제는 버튼으로 */
    /* 열린 메모 모달이 있으면 리로드 */
    if($g('memoModal')?.style.display==='flex') await loadRoomMemos();
    /* 버튼 뱃지 갱신을 위해 조용히 호출 */
    else _refreshMemoBadgeSilent();
  }catch(err){alert('오류: '+err.message)}
}
async function _refreshMemoBadgeSilent(){
  if(!currentRoomId)return;
  try{
    const r=await fetch('/api/memos?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    _memoCache=(d.memos||[]).map(m=>({...m, _t:_normType(m.memo_type_display||m.memo_type)}));
    _updateRoomMemoBadge();
  }catch(_){}
}

/* ===== 거래처 종합 대시보드 (C안) — admin-customer-dash.js 로 분리 (Step 2, 2026-04-30) =====
 * 원본 5012~5210 라인. 모두 admin-customer-dash.js 에 이전됨.
 * 분리 함수: openCustomerDashboard / _loadCdAutoSummary / _loadCdTodosAndSummaries
 *           / _cdCompleteTodo / _cdOpenSummary / closeCustomerDashboard / cdGotoDocs
 *           / cdGotoRoom / cdExportCsv / openCustomerDashboardFromRoom
 *           / openCustomerSummary / _cdCurrentCustomerName
 * 분리 상태: _cdCurrentUserId / _cdUserCache / _summaryMode
 *           / _customerSummaryUserId / _customerSummaryBusinessId
 * 의존: KEY, e, escAttr, $g, docsSelectedUserId, openBusinessDashboard, _normType,
 *       openRoom, openRoomSummary, openSummaryHistory, selectCustomer,
 *       openRoomForCurrentCustomer, exportWehago, currentRoomId, _lastSummaryText,
 *       _lastSummaryJson, _lastSummaryRange, _setSummaryRangeUI, tab, openCustSidePanel,
 *       openAddBizForUser, openBizDocsPanel
 * (admin.js 그대로 cross-script 공유) */
/* (intentional empty — 실제 함수는 admin-customer-dash.js) */
/* (intentional empty — 실제 함수는 admin-customer-dash.js) */
/* ===== 공통 유틸: 개업연도 기준 N기 자동 계산 =====
   올해 기준 (2026년 개업 → 1기 / 2025년 개업 → 2기 / 2024년 → 3기 ...) */
function _calcFiscalTerm(estDate){
  if(!estDate)return '';
  var m=/^(\d{4})/.exec(String(estDate));
  if(!m)return '';
  var y=parseInt(m[1],10);
  if(!y||isNaN(y))return '';
  var cur=new Date().getFullYear();
  var term=cur-y+1;
  return term>0?String(term):'';
}

/* ===== ➕ 수동 거래처 등록 (위하고 수임처 신규생성 스타일) ===== */
async function openManualClientModal(){
  const m=$g('manualClientModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  /* 👤 사람 정보 */
  ['mcRealName','mcPhone','mcCompany','mcCeo','mcBizNo','mcSubBiz','mcCorpNo',
   'mcAddr1','mcAddr2','mcBizPhone','mcIndustryCode','mcBizCategory','mcIndustry',
   'mcEstDate','mcFiscalTerm','mcNotes'].forEach(id=>{const el=$g(id);if(el)el.value=''});
  if($g('mcForm'))$g('mcForm').value='0.법인사업자';
  /* 📊 기수·인사연도 — 올해 기본값 */
  var curYear=new Date().getFullYear();
  if($g('mcFiscalStart'))$g('mcFiscalStart').value=curYear+'-01-01';
  if($g('mcFiscalEnd'))$g('mcFiscalEnd').value=curYear+'-12-31';
  if($g('mcHrYear'))$g('mcHrYear').value=String(curYear);
  if($g('mcAutoRoom'))$g('mcAutoRoom').checked=true;
  /* 담당자 라벨 select 채우기 */
  const sel=$g('mcPriority');
  if(sel){
    sel.innerHTML='<option value="">— 미지정</option><option value="" disabled>불러오는 중...</option>';
    try{
      const labels=await _ensureRoomLabels(true);
      sel.innerHTML='<option value="">— 미지정</option>'
        +labels.map(lb=>'<option value="'+lb.id+'" style="background:'+escAttr(lb.color||'#fff')+'">'+e(lb.name)+'</option>').join('');
    }catch(_){}
  }
  setTimeout(()=>$g('mcRealName')?.focus(),50);
}
function closeManualClientModal(){
  const m=$g('manualClientModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  /* addBiz 모드 정리 — 다음 신규 거래처 등록 시 readonly·hidden 잔존 방지 */
  if(_mcMode==='addBiz'){
    _mcMode='newClient'; _mcAddBizUserId=null;
    const rn=$g('mcRealName'); if(rn){rn.readOnly=false; rn.style.background=''; rn.style.cursor=''}
    const ph=$g('mcPhone'); if(ph){ph.readOnly=false; ph.style.background=''; ph.style.cursor=''}
    const ar=$g('mcAutoRoom'); if(ar){const lbl=ar.closest('label'); if(lbl)lbl.style.display=''}
    const titleEl=document.querySelector('#manualClientModal div[style*="font-weight:700"]');
    if(titleEl)titleEl.innerHTML='➕ 수동 거래처 등록 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:6px">로그인 없는 관리용</span>';
    const btn=$g('mcSubmitBtn');
    if(btn){btn.textContent='➕ 등록'; btn.disabled=false; btn.style.opacity='1'}
  }
}

/* 🏢 user dashboard [+ 사업장 추가] → 기존 manualClientModal 재활용.
   사람 정보(이름·전화) 는 readonly 잠그고 사업장 부분만 입력. submit 분기로 add_to_user API 호출. */
let _mcMode='newClient';
let _mcAddBizUserId=null;
async function openAddBizForUser(userId, userName, userPhone){
  if(!userId){alert('user_id 누락');return}
  _mcMode='addBiz';
  _mcAddBizUserId=Number(userId);
  await openManualClientModal();
  const rn=$g('mcRealName');
  if(rn){rn.value=userName||''; rn.readOnly=true; rn.style.background='#f3f4f6'; rn.style.cursor='not-allowed'}
  const ph=$g('mcPhone');
  if(ph){ph.value=userPhone||''; ph.readOnly=true; ph.style.background='#f3f4f6'; ph.style.cursor='not-allowed'}
  const ar=$g('mcAutoRoom');
  if(ar){ar.checked=false; const lbl=ar.closest('label'); if(lbl)lbl.style.display='none'}
  const titleEl=document.querySelector('#manualClientModal div[style*="font-weight:700"]');
  if(titleEl)titleEl.innerHTML='🏢 사업장 추가 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:6px">['+e(userName||'#'+userId)+'] 매핑</span>';
  const btn=$g('mcSubmitBtn');
  if(btn)btn.textContent='🏢 사업장 추가';
  setTimeout(()=>$g('mcCompany')?.focus(),60);
}
async function submitAddBizForUser(userId){
  const company=($g('mcCompany')?.value||'').trim();
  if(!company){alert('회사명 (수임처명) 은 필수입니다');return}
  const addr1=($g('mcAddr1')?.value||'').trim();
  const addr2=($g('mcAddr2')?.value||'').trim();
  const body={
    user_id:Number(userId),
    role:'대표자',
    is_primary:false,
    company_name:company,
    business_number:($g('mcBizNo')?.value||'').trim()||null,
    ceo_name:($g('mcCeo')?.value||'').trim()||null,
    company_form:$g('mcForm')?.value||null,
    sub_business_number:($g('mcSubBiz')?.value||'').trim()||null,
    corporate_number:($g('mcCorpNo')?.value||'').trim()||null,
    business_category:($g('mcBizCategory')?.value||'').trim()||null,
    industry:($g('mcIndustry')?.value||'').trim()||null,
    industry_code:($g('mcIndustryCode')?.value||'').trim()||null,
    address:[addr1,addr2].filter(Boolean).join(' ')||null,
    phone:($g('mcBizPhone')?.value||'').trim()||null,
    establishment_date:$g('mcEstDate')?.value||null,
    fiscal_year_start:$g('mcFiscalStart')?.value||null,
    fiscal_year_end:$g('mcFiscalEnd')?.value||null,
    fiscal_term:$g('mcFiscalTerm')?.value?Number($g('mcFiscalTerm').value):null,
    hr_year:$g('mcHrYear')?.value?Number($g('mcHrYear').value):null,
    notes:($g('mcNotes')?.value||'').trim()||null,
  };
  const btn=$g('mcSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';btn.textContent='추가 중...'}
  try{
    const r=await fetch('/api/admin-businesses?action=add_to_user&key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    alert('✅ 사업장 매핑됨 ('+(d.merged?'기존 업체에 연결':'신규 업체 등록 후 연결')+')');
    closeManualClientModal();
    /* dashboard 강제 새로고침 — modal 닫고 다시 열어야 cdBizDocs 가 새 매핑 가져옴 */
    const cm=$g('custDashModal');
    if(cm){cm.style.display='none'; document.body.style.overflow=''}
    setTimeout(()=>{
      if(typeof openCustomerDashboard==='function')openCustomerDashboard(Number(userId));
    }, 100);
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent='🏢 사업장 추가'}}
}
/* 🔍 카카오 주소검색 — 수동 거래처용 */
function _mcOpenAddressSearch(){
  if(typeof daum==='undefined'||!daum.Postcode){
    alert('주소검색 스크립트가 아직 로드 중입니다. 잠시 후 다시 시도해주세요.');return;
  }
  new daum.Postcode({
    oncomplete:function(data){
      var full=data.roadAddress||data.jibunAddress||data.address||'';
      if(data.buildingName)full+=' ('+data.buildingName+')';
      $g('mcAddr1').value=full;
      var d2=$g('mcAddr2');if(d2)d2.focus();
    }
  }).open();
}
/* 개업일 변경 시 N기 자동 계산 */
function _mcUpdateFiscalTerm(){
  var t=_calcFiscalTerm($g('mcEstDate')?.value);
  var el=$g('mcFiscalTerm');if(el)el.value=t;
}
async function submitManualClient(){
  /* user dashboard 의 [+ 🏢 사업장 추가] 모드면 별도 분기 */
  if(_mcMode==='addBiz' && _mcAddBizUserId){
    return submitAddBizForUser(_mcAddBizUserId);
  }
  const realName=($g('mcRealName')?.value||'').trim();
  if(!realName){alert('이름(실명)은 필수입니다');return}
  const phone=($g('mcPhone')?.value||'').trim();
  const company=($g('mcCompany')?.value||'').trim();
  const ceo=($g('mcCeo')?.value||'').trim()||realName;
  const bizNo=($g('mcBizNo')?.value||'').trim();
  const notes=($g('mcNotes')?.value||'').trim();
  const autoRoom=$g('mcAutoRoom')?.checked?true:false;
  const priorityRaw=$g('mcPriority')?.value||'';
  const priority=priorityRaw?Number(priorityRaw):null;
  /* 위하고 호환 필드 */
  const addr1=($g('mcAddr1')?.value||'').trim();
  const addr2=($g('mcAddr2')?.value||'').trim();
  const body={
    name:realName, real_name:realName, phone,
    company_name:company, ceo_name:ceo, business_number:bizNo, notes,
    auto_create_room: autoRoom, priority: priority,
    company_form:$g('mcForm')?.value||null,
    sub_business_number:($g('mcSubBiz')?.value||'').trim()||null,
    corporate_number:($g('mcCorpNo')?.value||'').trim()||null,
    address:[addr1,addr2].filter(Boolean).join(' ')||null,
    biz_phone:($g('mcBizPhone')?.value||'').trim()||null,
    industry_code:($g('mcIndustryCode')?.value||'').trim()||null,
    business_category:($g('mcBizCategory')?.value||'').trim()||null,
    industry:($g('mcIndustry')?.value||'').trim()||null,
    establishment_date:$g('mcEstDate')?.value||null,
    fiscal_year_start:$g('mcFiscalStart')?.value||null,
    fiscal_year_end:$g('mcFiscalEnd')?.value||null,
    fiscal_term:$g('mcFiscalTerm')?.value?Number($g('mcFiscalTerm').value):null,
    hr_year:$g('mcHrYear')?.value?Number($g('mcHrYear').value):null,
  };
  const btn=$g('mcSubmitBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.55';btn.textContent='등록 중...'}
  try{
    const r=await fetch('/api/admin-clients?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!d.ok){alert('등록 실패: '+(d.error||'unknown'));return}
    let msg='✅ 거래처 등록됨 (ID #'+d.user_id+')';
    if(d.room_id) msg+=' · 상담방 '+d.room_id+' 생성';
    if(typeof showAdminToast==='function')showAdminToast(msg);
    else alert(msg);
    closeManualClientModal();
    if(typeof userStatus==='function')userStatus('approved_client');
    if(typeof loadRoomList==='function')loadRoomList();
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='➕ 등록'}}
}

/* ===== 📅 신고 Case — 거래처 × 신고종류 × 기간 단위 업무 묶음 ===== */
async function _loadCdFilings(userId){
  const box=$g('cdFilings');if(!box||!userId)return;
  box.innerHTML='<div style="color:#8b95a1;padding:10px 0;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&user_id='+userId+'&status=all');
    const d=await r.json();
    const arr=d.filings||[];
    if(!arr.length){
      box.innerHTML='<div style="color:#adb5bd;padding:10px 0;font-size:.85em;line-height:1.6">아직 생성된 신고 Case 가 없습니다.<br>우측 "+ 새 Case" 로 부가세/종소세/법인세 등 신고 건을 시작하세요.</div>';
      return;
    }
    box.innerHTML=arr.map(f=>_renderFilingCard(f, userId)).join('');
  }catch(err){box.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
function _renderFilingCard(f, userId){
  const items=f.items||[];
  const done=items.filter(i=>i.is_checked).length;
  const total=items.length;
  const pct=total>0?Math.round(done/total*100):0;
  /* D-day 뱃지 */
  let dueBadge='';
  if(f.due_date){
    const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
    const diff=Math.round((new Date(f.due_date+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
    let bgColor='#64748b';let label='';
    if(diff<0){bgColor='#991b1b';label='D+'+(-diff)+' 지남'}
    else if(diff===0){bgColor='#dc2626';label='D-DAY'}
    else if(diff<=3){bgColor='#ea580c';label='D-'+diff}
    else if(diff<=7){bgColor='#b45309';label='D-'+diff}
    else if(diff<=30){bgColor='#059669';label='D-'+diff}
    else {bgColor='#2563eb';label='D-'+diff}
    dueBadge='<span style="background:'+bgColor+';color:#fff;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">📅 '+f.due_date+' · '+label+'</span>';
  }
  const statusBadge=f.status==='completed'?'<span style="background:#d1fae5;color:#065f46;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">✅ 완료</span>':(f.status==='cancelled'?'<span style="background:#fee2e2;color:#991b1b;padding:1px 7px;border-radius:10px;font-size:.7em;font-weight:700;margin-left:6px">취소</span>':'');
  const opacity=f.status==='cancelled'?0.55:1;
  const progressBar=total>0?'<div style="height:6px;background:#e5e8eb;border-radius:3px;overflow:hidden;margin:4px 0 8px"><div style="height:100%;background:'+(pct===100?'#10b981':'#3182f6')+';width:'+pct+'%"></div></div>':'';
  /* 체크리스트 (접힘 가능) */
  const itemsHtml=items.map(it=>{
    const checked=it.is_checked?'checked':'';
    const textStyle=it.is_checked?'color:#9ca3af;text-decoration:line-through':'color:#191f28';
    return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:.85em">'
      +'<input type="checkbox" '+checked+' onchange="toggleFilingItem('+it.id+','+f.user_id+')" style="width:14px;height:14px;cursor:pointer;accent-color:#10b981;flex-shrink:0">'
      +'<span style="flex:1;'+textStyle+'">'+e(it.item_text||'')+'</span>'
      +(it.is_checked&&it.checked_by?'<span style="font-size:.7em;color:#8b95a1;flex-shrink:0">'+e(it.checked_by)+'</span>':'')
      +'<button onclick="deleteFilingItem('+it.id+','+f.user_id+')" style="background:none;border:none;color:#f04452;font-size:.76em;cursor:pointer;font-family:inherit;padding:0 2px;flex-shrink:0" title="삭제">✕</button>'
      +'</div>';
  }).join('');
  const headerId='fhdr-'+f.id;
  return '<div style="border:1px solid #e5e8eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fafbfc;opacity:'+opacity+'">'
    +'<div style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-wrap:wrap" onclick="_toggleFilingBody('+f.id+')">'
    +  '<span style="font-size:1.05em">'+(f.filing_type==='부가세'?'💰':f.filing_type==='종소세'?'📊':f.filing_type==='법인세'?'🏢':f.filing_type==='원천세'?'💼':f.filing_type==='양도세'?'🏠':'📄')+'</span>'
    +  '<span style="font-weight:700;font-size:.92em">'+e(f.filing_type)+' · '+e(f.period)+'</span>'
    +  dueBadge+statusBadge
    +  '<span style="margin-left:auto;font-size:.78em;color:#4b5563;font-weight:600">'+done+'/'+total+' ('+pct+'%)</span>'
    +'</div>'
    +progressBar
    +'<div id="'+headerId+'" style="display:none;margin-top:6px">'
    +  (f.title&&f.title!==f.filing_type+' · '+f.period?'<div style="font-size:.8em;color:#4b5563;margin-bottom:4px">'+e(f.title)+'</div>':'')
    +  itemsHtml
    +  '<div style="display:flex;gap:4px;margin-top:8px;padding-top:6px;border-top:1px dashed #e5e8eb">'
    +    '<input id="nfAddItem-'+f.id+'" type="text" placeholder="+ 항목 추가" style="flex:1;padding:4px 8px;border:1px solid #e5e8eb;border-radius:5px;font-size:.82em;font-family:inherit;outline:none" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();addFilingItem('+f.id+','+f.user_id+')}">'
    +    (f.status==='active'?'<button onclick="toggleFilingStatus('+f.id+',\'completed\','+f.user_id+')" style="background:#10b981;color:#fff;border:none;padding:4px 10px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit">✅ 완료</button>':'<button onclick="toggleFilingStatus('+f.id+',\'active\','+f.user_id+')" style="background:#e5e8eb;border:none;padding:4px 10px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit">재개</button>')
    +    '<button onclick="deleteFiling('+f.id+','+f.user_id+')" style="background:none;border:1px solid #f04452;color:#f04452;padding:4px 8px;border-radius:5px;font-size:.76em;cursor:pointer;font-family:inherit" title="Case 삭제">🗑️</button>'
    +  '</div>'
    +'</div>'
    +'</div>';
}
function _toggleFilingBody(fid){
  const el=document.getElementById('fhdr-'+fid);
  if(!el)return;
  el.style.display=(el.style.display==='none'||!el.style.display)?'block':'none';
}
function openNewFilingModal(){
  if(!_cdCurrentUserId){alert('거래처를 먼저 선택하세요');return}
  const m=$g('newFilingModal');if(!m)return;
  m.style.display='flex';
  $g('nfType').value='부가세';
  $g('nfPeriod').value='';
  $g('nfDue').value='';
  setTimeout(()=>$g('nfPeriod')?.focus(),50);
}
function closeNewFilingModal(){
  const m=$g('newFilingModal');if(m)m.style.display='none';
}
async function submitNewFiling(){
  const userId=_cdCurrentUserId;
  if(!userId){alert('거래처가 선택되지 않았습니다');return}
  const filing_type=$g('nfType').value;
  const period=($g('nfPeriod').value||'').trim();
  const due=($g('nfDue').value||'').trim();
  if(!period){alert('기간을 입력하세요 (예: 2026-1기)');return}
  const btn=$g('nfSubmitBtn');if(btn){btn.disabled=true;btn.style.opacity='.55'}
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:userId, filing_type, period, due_date:due||null})
    });
    const d=await r.json();
    if(!d.ok){alert('생성 실패: '+(d.error||'unknown'));return}
    closeNewFilingModal();
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
  finally{if(btn){btn.disabled=false;btn.style.opacity=''}}
}
async function toggleFilingItem(itemId, userId){
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=toggle_item&item_id='+itemId,{method:'POST'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFilingItem(itemId, userId){
  if(!confirm('이 체크리스트 항목을 삭제할까요?'))return;
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=del_item&item_id='+itemId,{method:'DELETE'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function addFilingItem(filingId, userId){
  const input=$g('nfAddItem-'+filingId);if(!input)return;
  const text=(input.value||'').trim();
  if(!text)return;
  try{
    const r=await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&action=add_item&filing_id='+filingId,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({item_text:text})
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    input.value='';
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function toggleFilingStatus(filingId, newStatus, userId){
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&id='+filingId,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({status:newStatus})
    });
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFiling(filingId, userId){
  if(!confirm('이 신고 Case 를 삭제할까요? (모든 체크리스트 항목 포함)'))return;
  try{
    await fetch('/api/tax-filings?key='+encodeURIComponent(KEY)+'&id='+filingId,{method:'DELETE'});
    await _loadCdFilings(userId);
  }catch(err){alert('오류: '+err.message)}
}

/* 거래처 통합 메모 (cdMemo*) — admin-memos.js 로 분리 (2026-04-30 Step 1)
 * 함수: _loadCustomerInfo / _loadCdAllMemos / _renderCdMemos / _renderCdDDayBadge
 *       _renderCdAttachments / cdMemoFilter / onCdMemoFileSelect / addCdMemo / deleteCdMemo
 *       addCustomerInfo / deleteCustomerInfo (alias)
 * 상태: _cdMemosCache / _cdMemoCategory / _cdPendingAttachments
 * 의존: KEY / _cdCurrentUserId / e() / escAttr() / $g() — admin.js 에서 그대로 공유 */

/* 거래처 대시보드 chunk 2 — admin-customer-dash.js 로 분리 (Step 2)
 * _loadCdTodosAndSummaries / _cdCompleteTodo / _cdOpenSummary
 * _cdUserCache (const) / closeCustomerDashboard / cdGotoDocs / cdGotoRoom / cdExportCsv
 * openCustomerDashboardFromRoom / openCustomerSummary / _cdCurrentCustomerName
 * _summaryMode / _customerSummaryUserId / _customerSummaryBusinessId
 * (모두 admin-customer-dash.js 에 var/function 으로 정의 — classic script global 공유) */
/* runRoomSummary 가 _summaryMode 분기해서 fetch 대상 바꾸도록 — 기존 함수 wrap */
const _origRunRoomSummary = (typeof runRoomSummary==='function') ? runRoomSummary : null;
async function runRoomSummary(){
  if(_summaryMode==='room'){return _origRunRoomSummary&&_origRunRoomSummary()}
  /* 거래처(사람) 또는 업체 단위 모드 */
  const isBusiness=(_summaryMode==='business');
  if(isBusiness && !_customerSummaryBusinessId){alert('업체 미선택');return}
  if(!isBusiness && !_customerSummaryUserId){alert('거래처 미선택');return}
  if(_rsGenerating)return;
  _rsGenerating=true;
  const range=_lastSummaryRange||'recent';
  const body=$g('rsBody'), meta=$g('rsMeta');
  let extraQS='', rangeLabel={recent:'최근',week:'최근 7일',month:'이번달',all:'전체'}[range]||range;
  if(range==='custom'){
    const f=$g('rsFrom')?.value||'',t=$g('rsTo')?.value||'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!/^\d{4}-\d{2}-\d{2}$/.test(t)){alert('시작·종료일 선택');_rsGenerating=false;return}
    extraQS='&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t);
    rangeLabel=f+' ~ '+t;
  }
  if(typeof _rsToggleButtons==='function')_rsToggleButtons(true);
  const loadingLabel=isBusiness?'🏢 업체 요약 생성 중...':'🤖 거래처 요약 생성 중...';
  if(body)body.innerHTML='<div style="text-align:center;padding:40px 0;color:#8b95a1"><div style="display:inline-block;width:22px;height:22px;border:3px solid #e5e8eb;border-top-color:#10b981;border-radius:50%;animation:rsSpin .7s linear infinite;vertical-align:middle;margin-right:8px"></div>'+loadingLabel+' (5~20초)</div>';
  if(meta)meta.textContent='';
  try{
    const idQS=isBusiness?('business_id='+_customerSummaryBusinessId):('user_id='+_customerSummaryUserId);
    const r=await fetch('/api/admin-customer-summary?key='+encodeURIComponent(KEY)+'&'+idQS+'&range='+encodeURIComponent(range)+extraQS);
    const d=await r.json();
    if(d.error){
      if(body)body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 요약 실패</div><div style="font-size:.85em">'+e(d.error)+'</div></div>';
      return;
    }
    _lastSummaryText=d.summary||'';
    _lastSummaryJson=d.summary_json||null;
    if(_lastSummaryJson){
      body.innerHTML=_renderSummaryJson(_lastSummaryJson);
    } else if(_lastSummaryText){
      body.innerHTML=renderMarkdownLite(_lastSummaryText);
    } else {
      body.innerHTML='<div style="padding:30px 20px;text-align:center;color:#8b95a1">결과가 비어있습니다</div>';
    }
    const actualRange=(d.first_at&&d.last_at)?(' · 🗓️ '+d.first_at+' ~ '+d.last_at):'';
    if(meta)meta.textContent='[거래처 단위 · '+rangeLabel+'] '+e(d.customer_name||'')+' · 방 '+(d.room_count||0)+'개 · 메시지 '+(d.message_count||0)+'건'+actualRange+' · 비용 ₩'+Math.round((d.cost_cents||0)*14);
  }catch(err){
    if(body)body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>';
  }finally{
    _rsGenerating=false;
    if(typeof _rsToggleButtons==='function')_rsToggleButtons(false);
  }
}
/* closeRoomSummary 모드 리셋은 원본 함수(line 3709)에 직접 넣음 —
   이전에 재선언(function)으로 덮어쓰면서 _origCloseRoomSummary 가
   호이스팅으로 자기 자신을 가리켜 무한 재귀되는 버그가 있었음 */

/* ===== ⚙️ 담당자 라벨 관리 (room_labels CRUD) ===== */
let _roomLabelsCache=null;
let _roomLabelsCacheAt=0;
async function _ensureRoomLabels(force){
  const now=Date.now();
  if(!force && _roomLabelsCache && now-_roomLabelsCacheAt<60000) return _roomLabelsCache;
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY));
    const d=await r.json();
    _roomLabelsCache=(d.labels||[]).filter(l=>l.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    _roomLabelsCacheAt=now;
  }catch(_){_roomLabelsCache=[]}
  return _roomLabelsCache;
}
async function openLabelManageModal(){
  const m=$g('labelManageModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  $g('newLabelName').value='';
  $g('newLabelColor').value='#3182f6';
  await _renderLabelList();
}
function closeLabelManageModal(){
  const m=$g('labelManageModal');if(m)m.style.display='none';
  document.body.style.overflow='';
  /* 라벨 변경됐으면 방 목록 리로드 */
  _ensureRoomLabels(true).then(()=>{if(typeof loadRoomList==='function')loadRoomList()});
}
async function _renderLabelList(){
  const box=$g('labelList');if(!box)return;
  box.innerHTML='<div style="color:#8b95a1;padding:20px 0;text-align:center">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const labels=d.labels||[];
    if(!labels.length){
      box.innerHTML='<div style="color:#adb5bd;padding:20px 0;text-align:center;font-size:.88em">라벨이 없습니다. 아래에서 첫 라벨을 추가하세요.</div>';
      return;
    }
    box.innerHTML=labels.map(lb=>{
      return '<div data-lid="'+lb.id+'" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;background:#fafbfc">'
        +'<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:'+(lb.color||'#6b7280')+';flex-shrink:0"></span>'
        +'<input type="text" value="'+escAttr(lb.name)+'" onblur="updateLabelName('+lb.id+',this.value)" style="flex:1;padding:5px 8px;border:1px solid #e5e8eb;border-radius:5px;font-size:.85em;font-family:inherit">'
        +'<input type="color" value="'+(lb.color||'#6b7280')+'" onchange="updateLabelColor('+lb.id+',this.value)" style="width:36px;height:30px;border:1px solid #e5e8eb;border-radius:5px;cursor:pointer;padding:1px" title="색 변경">'
        +'<input type="number" value="'+(lb.sort_order||0)+'" onblur="updateLabelSort('+lb.id+',this.value)" title="정렬 순서" style="width:50px;padding:5px;border:1px solid #e5e8eb;border-radius:5px;font-size:.82em;font-family:inherit;text-align:center">'
        +'<button onclick="deleteLabel('+lb.id+')" style="background:none;border:1px solid #f04452;color:#f04452;padding:5px 9px;border-radius:5px;font-size:.78em;cursor:pointer;font-family:inherit">삭제</button>'
        +'</div>';
    }).join('');
  }catch(err){box.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
async function addLabel(){
  const name=($g('newLabelName')?.value||'').trim();
  const color=($g('newLabelColor')?.value||'#3182f6');
  if(!name){alert('라벨 이름을 입력하세요');return}
  try{
    const r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,color})
    });
    const d=await r.json();
    if(!d.ok){alert('추가 실패: '+(d.error||'unknown'));return}
    $g('newLabelName').value='';
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(err){alert('오류: '+err.message)}
}
async function updateLabelName(id, name){
  name=String(name||'').trim();if(!name)return;
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})
    });
    _roomLabelsCache=null;
  }catch(_){}
}
async function updateLabelColor(id, color){
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({color})
    });
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(_){}
}
async function updateLabelSort(id, sort_order){
  const n=Number(sort_order);if(!Number.isFinite(n))return;
  try{
    await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sort_order:n})
    });
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(_){}
}
async function deleteLabel(id){
  if(!confirm('이 라벨을 삭제할까요?\n(사용중이면 해당 방은 미분류로 전환됩니다)'))return;
  try{
    let r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id,{method:'DELETE'});
    let d=await r.json();
    if(!d.ok && d.in_use){
      if(!confirm(d.in_use+'개 방에서 사용중입니다. 강제 삭제하시겠습니까?'))return;
      r=await fetch('/api/admin-room-labels?key='+encodeURIComponent(KEY)+'&id='+id+'&force=1',{method:'DELETE'});
      d=await r.json();
    }
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    _roomLabelsCache=null;
    await _renderLabelList();
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 🏢 거래처 간략 사이드 패널 =====
   거래처 버튼 클릭 시 메모 패널처럼 우측에 도킹 (PC) / 바텀시트 (모바일).
   내용: 이름·전화·업종·최근 노트 3건·진행중 Case·할 일 N건 / [자세히 →] 풀 대시보드 */
let _csCurrentUserId=null;
async function openCustSidePanel(userId){
  if(!userId)return;
  _csCurrentUserId=userId;
  const modal=$g('custSidePanel');if(!modal)return;
  modal.classList.add('side-dock');
  modal.style.display='flex';
  document.body.classList.add('cust-side-open');
  if(window.matchMedia('(max-width:1023px)').matches)document.body.style.overflow='hidden';
  else document.body.style.overflow='';
  $g('csName').textContent='불러오는 중...';
  $g('csSub').textContent='';
  $g('csBody').innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const q=(p)=>'/api/'+p+(p.includes('?')?'&':'?')+'key='+encodeURIComponent(KEY);
    const [custRes, infoRes, filingsRes, memosRes] = await Promise.all([
      fetch(q('admin-approve?status=all')).then(r=>r.json()).catch(()=>({users:[]})),
      fetch(q('memos?scope=customer_info&user_id='+userId)).then(r=>r.json()).catch(()=>({memos:[]})),
      fetch(q('tax-filings?user_id='+userId+'&status=active')).then(r=>r.json()).catch(()=>({filings:[]})),
      fetch(q('memos?scope=my&only_mine=0')).then(r=>r.json()).catch(()=>({memos:[]})),
    ]);
    const u=(custRes.users||[]).find(x=>x.id===userId);
    const nm=u?(u.real_name||u.name||'#'+userId):'#'+userId;
    $g('csName').textContent=nm;
    $g('csSub').textContent=(u?((u.phone||'연락처 미등록')):'ID #'+userId);
    /* 이 거래처 관련 미완료 할 일 (본인 방 필터는 간략화 — 전체 에서 user 매칭 어려우니 생략) */
    const activeFilings=filingsRes.filings||[];
    const infoMemos=(infoRes.memos||[]).slice(0,4);
    const _filingIcon=(t)=>({'부가세':'💰','종소세':'📊','법인세':'🏢','원천세':'💼','양도세':'🏠'})[t]||'📄';
    function _dday(due){
      if(!due)return '';
      const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(due))return '';
      const diff=Math.round((new Date(due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
      let c='#64748b',lab='';
      if(diff<0){c='#991b1b';lab='D+'+(-diff)}
      else if(diff===0){c='#dc2626';lab='D-DAY'}
      else if(diff<=3){c='#ea580c';lab='D-'+diff}
      else if(diff<=7){c='#b45309';lab='D-'+diff}
      else {c='#059669';lab='D-'+diff}
      return '<span style="background:'+c+';color:#fff;padding:1px 6px;border-radius:8px;font-size:.68em;font-weight:700;margin-left:4px">'+lab+'</span>';
    }
    let html='';
    /* 기본 정보 */
    html+='<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.9em;margin-bottom:5px;color:#191f28">👤 기본</div>'
      +'<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:.85em;line-height:1.6;color:#0f172a">'
      +'<div><b>'+e(nm)+'</b></div>'
      +(u&&u.phone?'<div>📞 '+e(u.phone)+'</div>':'<div style="color:#8b95a1">📞 연락처 미등록</div>')
      +(u&&u.email?'<div>✉️ '+e(u.email)+'</div>':'')
      +(u?('<div style="font-size:.85em;color:#4b5563;margin-top:3px">'+(u.approval_status==='approved_client'?'🏢 기장거래처':u.approval_status==='approved_guest'?'✅ 일반':'⏳ '+(u.approval_status||'pending'))+'</div>'):'')
      +'</div></section>';
    /* 거래처 노트 */
    html+='<section style="margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
      +'<div style="font-weight:700;font-size:.9em;color:#1e40af">🏢 거래처 노트 <span style="font-size:.72em;color:#8b95a1;font-weight:500;margin-left:3px">('+infoMemos.length+')</span></div>'
      +'</div>';
    if(!infoMemos.length){
      html+='<div style="background:#f9fafb;border:1px dashed #e5e8eb;border-radius:8px;padding:8px 10px;color:#adb5bd;font-size:.82em">기본 정보 없음 — 자세히 화면에서 추가</div>';
    } else {
      html+='<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px">'
        +infoMemos.map(m=>'<div style="padding:3px 0;font-size:.85em;color:#1e3a8a;white-space:pre-wrap;word-break:break-word;line-height:1.5">• '+e(m.content||'')+'</div>').join('')
        +'</div>';
    }
    html+='</section>';
    /* 진행중 신고 Case */
    html+='<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.9em;margin-bottom:5px;color:#065f46">📅 진행중 신고 <span style="font-size:.72em;color:#8b95a1;font-weight:500">('+activeFilings.length+')</span></div>';
    if(!activeFilings.length){
      html+='<div style="background:#f9fafb;border:1px dashed #e5e8eb;border-radius:8px;padding:8px 10px;color:#adb5bd;font-size:.82em">진행중인 신고 Case 없음</div>';
    } else {
      html+=activeFilings.slice(0,5).map(f=>{
        const items=f.items||[];const done=items.filter(i=>i.is_checked).length;const total=items.length;
        const pct=total>0?Math.round(done/total*100):0;
        return '<div style="background:#ecfdf5;border:1px solid #86efac;border-radius:8px;padding:7px 10px;margin-bottom:5px;display:flex;align-items:center;gap:6px;font-size:.85em">'
          +'<span>'+_filingIcon(f.filing_type)+'</span>'
          +'<span style="font-weight:600">'+e(f.filing_type)+' · '+e(f.period)+'</span>'
          +_dday(f.due_date)
          +'<span style="margin-left:auto;color:#4b5563;font-size:.88em">'+done+'/'+total+' ('+pct+'%)</span>'
          +'</div>';
      }).join('');
    }
    html+='</section>';
    /* 안내 */
    html+='<div style="font-size:.75em;color:#8b95a1;margin-top:6px;line-height:1.5">전체 할 일·요약 이력·문서·재무 등은 상단 <b>자세히 →</b> 버튼으로 풀 대시보드에서 확인하세요.</div>';
    $g('csBody').innerHTML=html;
  }catch(err){
    $g('csBody').innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>';
  }
}
function closeCustSidePanel(){
  const m=$g('custSidePanel');if(m){m.style.display='none';m.classList.remove('side-dock')}
  document.body.classList.remove('cust-side-open');
  document.body.style.overflow='';
}
function _csOpenFull(){
  const uid=_csCurrentUserId;
  if(!uid)return;
  closeCustSidePanel();
  setTimeout(()=>{if(typeof openCustomerDashboard==='function')openCustomerDashboard(uid)},120);
}

/* ===== 거래처 서류 확인 (신분증·사업자등록증·홈택스 ID) ===== */
async function openBizDocsPanel(){
  if(!docsSelectedUserId){alert('거래처를 먼저 선택하세요');return}
  const cust=docsCustomers.find(c=>c.user_id===docsSelectedUserId);
  $g('bdTitle').textContent=cust?(cust.real_name||cust.name||('#'+docsSelectedUserId)):('#'+docsSelectedUserId);
  $g('bizDocsModal').style.display='flex';
  document.body.style.overflow='hidden';
  const body=$g('bdBody');
  body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-biz-docs?key='+encodeURIComponent(KEY)+'&user_id='+docsSelectedUserId);
    const d=await r.json();
    if(d.error){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    if(!(d.businesses||[]).length){
      body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0">등록된 사업장이 없습니다. 먼저 거래처 사업장을 등록해주세요.</div>';
      return;
    }
    body.innerHTML=d.businesses.map(b=>renderBizDocCard(b)).join('');
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function closeBizDocsPanel(){
  $g('bizDocsModal').style.display='none';
  document.body.style.overflow='';
}
function renderBizDocCard(b){
  const keyq='&key='+encodeURIComponent(KEY);
  const primaryBadge=b.is_primary?' <span style="background:#fef3c7;color:#92400e;font-size:.7em;padding:2px 6px;border-radius:6px;font-weight:700">⭐ 주사업장</span>':'';
  const bn=b.business_number?b.business_number:'';
  const bnFmt=bn&&bn.length===10?bn.slice(0,3)+'-'+bn.slice(3,5)+'-'+bn.slice(5):bn;
  const idCard=b.docs.id_card;
  const bizReg=b.docs.biz_reg;
  const hometax=b.docs.hometax;
  function imgCell(label, info, url){
    if(info.uploaded){
      const fullUrl=url+keyq;
      return `<div style="flex:1;min-width:150px">
        <div style="font-size:.78em;font-weight:700;color:#065f46;margin-bottom:4px">✅ ${label}</div>
        <div style="position:relative;aspect-ratio:1/1;max-width:160px;background:#f3f4f6;border-radius:8px;overflow:hidden;cursor:zoom-in" onclick="openImgViewer('${fullUrl}',['${fullUrl}'])">
          <img src="${fullUrl}" alt="${label}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.parentNode.innerHTML+='<div style=&quot;padding:20px;text-align:center;color:#8b95a1;font-size:.8em&quot;>PDF 또는 미리보기 불가<br><a href=&quot;${fullUrl}&quot; target=_blank style=&quot;color:#3182f6&quot;>열기</a></div>'">
        </div>
        <div style="font-size:.7em;color:#8b95a1;margin-top:3px">업로드: ${e(info.at||'-')}</div>
      </div>`;
    }
    return `<div style="flex:1;min-width:150px">
      <div style="font-size:.78em;font-weight:700;color:#991b1b;margin-bottom:4px">⚠️ ${label}</div>
      <div style="aspect-ratio:1/1;max-width:160px;background:#fef2f2;border:1px dashed #fca5a5;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#991b1b;font-size:.8em">미등록</div>
    </div>`;
  }
  return `<div style="border:1px solid #e5e8eb;border-radius:12px;padding:14px;margin-bottom:14px;background:#fafafa">
    <div style="font-weight:700;font-size:1em;margin-bottom:4px">${e(b.company_name||'사업장 #'+b.id)}${primaryBadge}</div>
    <div style="font-size:.78em;color:#8b95a1;margin-bottom:12px">${e(b.ceo_name||'')} ${bnFmt?'· 사업자 '+e(bnFmt):''}</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      ${imgCell('🪪 신분증', idCard, idCard.image_url||'')}
      ${imgCell('📋 사업자등록증', bizReg, bizReg.image_url||'')}
    </div>
    <div style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px">
      <div style="font-size:.78em;color:#8b95a1;margin-bottom:3px">🏛️ 홈택스 ID</div>
      <div style="font-weight:600;font-size:.92em">${hometax.saved?e(hometax.hometax_id):'<span style="color:#991b1b">미등록</span>'}</div>
      ${hometax.saved&&hometax.at?'<div style="font-size:.7em;color:#8b95a1;margin-top:2px">업데이트: '+e(hometax.at)+'</div>':''}
      <div style="font-size:.7em;color:#8b95a1;margin-top:6px">※ 비밀번호는 앱에 저장되지 않습니다. 거래처에게 별도 전달 요청.</div>
    </div>
  </div>`;
}

/* ===== 거래처 재무 데이터 (매출/매입/세금) ===== */
let _finCurrentUserId=null;
let _finRows=[];
async function openFinancePanel(){
  if(!docsSelectedUserId){alert('거래처를 먼저 선택하세요');return}
  _finCurrentUserId=docsSelectedUserId;
  const cust=docsCustomers.find(c=>c.user_id===_finCurrentUserId);
  $g('finCustName').textContent=cust?(cust.real_name||cust.name||('#'+_finCurrentUserId)):('#'+_finCurrentUserId);
  $g('financeModal').style.display='flex';
  document.body.style.overflow='hidden';
  await loadFinanceRows();
}
function closeFinancePanel(){
  $g('financeModal').style.display='none';
  document.body.style.overflow='';
}
async function loadFinanceRows(){
  const body=$g('finBody');
  body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&user_id='+_finCurrentUserId);
    const d=await r.json();
    if(d.error){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    _finRows=d.rows||[];
    if(!_finRows.length){
      body.innerHTML='<div style="text-align:center;color:#8b95a1;padding:50px 0;font-size:.88em">'
        +'재무 데이터가 없습니다. <b>+ 항목 추가</b>로 직접 입력하거나,<br>'
        +'<code style="background:#f9fafb;padding:2px 6px;border-radius:4px">finance_pdfs/'+_finCurrentUserId+'/</code> 폴더에 PDF 푸시 후<br>'
        +'세무사님이 Claude한테 "거래처 PDF 처리해줘 [거래처명]" 요청하시면 자동 입력됩니다.'
        +'</div>';
      return;
    }
    const fmt=n=>n==null?'-':(Number(n)||0).toLocaleString('ko-KR');
    const ptLabel={monthly:'월',quarterly:'분기',yearly:'연',vat_period:'부가세'};
    body.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:.82em">'
      +'<thead style="background:#f9fafb;position:sticky;top:0">'
      +'<tr>'
      +'<th style="padding:8px;text-align:left;border-bottom:1px solid #e5e8eb">기간</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">매출</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">매입</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">부가세</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">소득세</th>'
      +'<th style="padding:8px;text-align:right;border-bottom:1px solid #e5e8eb">인건비</th>'
      +'<th style="padding:8px;text-align:left;border-bottom:1px solid #e5e8eb">출처</th>'
      +'<th style="padding:8px;border-bottom:1px solid #e5e8eb"></th>'
      +'</tr></thead><tbody>'
      +_finRows.map(r=>{
        const src=r.source==='pdf'?'📄 PDF':(r.source==='wehago'?'📊 위하고':'✏️ 수동');
        return '<tr style="border-bottom:1px solid #f2f4f6">'
          +'<td style="padding:7px 8px;font-weight:600">'+e(r.period)+' <span style="font-size:.85em;color:#8b95a1">('+(ptLabel[r.period_type]||r.period_type||'')+')</span></td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.revenue)+'</td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.cost)+'</td>'
          +'<td style="padding:7px 8px;text-align:right;color:#dc2626">'+fmt(r.vat_payable)+'</td>'
          +'<td style="padding:7px 8px;text-align:right;color:#dc2626">'+fmt(r.income_tax)+'</td>'
          +'<td style="padding:7px 8px;text-align:right">'+fmt(r.payroll_total)+'</td>'
          +'<td style="padding:7px 8px;font-size:.85em;color:#8b95a1">'+src+'</td>'
          +'<td style="padding:7px 8px;text-align:right"><button onclick="openFinanceEditRow('+r.id+')" style="background:#e5e8eb;border:none;padding:3px 9px;border-radius:5px;font-size:.85em;cursor:pointer;font-family:inherit">수정</button></td>'
          +'</tr>';
      }).join('')
      +'</tbody></table>';
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function _finFillForm(row){
  $g('finRowId').value=row?row.id:'';
  $g('finPeriod').value=row?row.period||'':'';
  $g('finPeriodType').value=row?row.period_type||'monthly':'monthly';
  $g('finRevenue').value=row?(row.revenue==null?'':row.revenue):'';
  $g('finCost').value=row?(row.cost==null?'':row.cost):'';
  $g('finVatPayable').value=row?(row.vat_payable==null?'':row.vat_payable):'';
  $g('finVatInput').value=row?(row.vat_input==null?'':row.vat_input):'';
  $g('finVatOutput').value=row?(row.vat_output==null?'':row.vat_output):'';
  $g('finIncomeTax').value=row?(row.income_tax==null?'':row.income_tax):'';
  $g('finTaxableIncome').value=row?(row.taxable_income==null?'':row.taxable_income):'';
  $g('finPayrollTotal').value=row?(row.payroll_total==null?'':row.payroll_total):'';
  $g('finNotes').value=row?row.notes||'':'';
  $g('finRowTitle').textContent=row?'재무 항목 수정 — '+row.period:'재무 항목 추가';
  $g('finDelBtn').style.display=row?'inline-block':'none';
  $g('finRowModal').style.display='flex';
}
function openFinanceAddRow(){
  if(!_finCurrentUserId){alert('거래처가 선택되지 않았습니다');return}
  const today=new Date(Date.now()+9*60*60*1000);
  const yyyymm=today.getUTCFullYear()+'-'+String(today.getUTCMonth()+1).padStart(2,'0');
  _finFillForm(null);
  $g('finPeriod').value=yyyymm;
}
function openFinanceEditRow(id){
  const row=_finRows.find(x=>x.id===id);
  if(!row){alert('항목을 찾을 수 없습니다');return}
  _finFillForm(row);
}
function closeFinanceRow(){$g('finRowModal').style.display='none'}
async function saveFinanceRow(){
  const period=$g('finPeriod').value.trim();
  if(!period){alert('기간(예: 2026-04, 2026-Q1, 2026)을 입력해 주세요');return}
  const id=$g('finRowId').value;
  const num=v=>{const t=v.trim();if(!t)return null;const n=parseInt(t.replace(/[^\d-]/g,''),10);return isNaN(n)?null:n};
  const body={
    user_id:_finCurrentUserId,
    period:period,
    period_type:$g('finPeriodType').value||'monthly',
    revenue:num($g('finRevenue').value),
    cost:num($g('finCost').value),
    vat_payable:num($g('finVatPayable').value),
    vat_input:num($g('finVatInput').value),
    vat_output:num($g('finVatOutput').value),
    income_tax:num($g('finIncomeTax').value),
    taxable_income:num($g('finTaxableIncome').value),
    payroll_total:num($g('finPayrollTotal').value),
    notes:$g('finNotes').value.trim()||null,
    source:'manual',
  };
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&action=upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!d.ok){alert('저장 실패: '+(d.error||'unknown'));return}
    closeFinanceRow();
    loadFinanceRows();
  }catch(err){alert('오류: '+err.message)}
}
async function deleteFinanceRow(){
  const id=$g('finRowId').value;
  if(!id)return;
  if(!confirm('이 항목을 삭제하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-finance?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(id)})});
    const d=await r.json();
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    closeFinanceRow();
    loadFinanceRows();
  }catch(err){alert('오류: '+err.message)}
}

/* 간단 마크다운 렌더 (## 헤더, - 리스트, 볼드) */
function renderMarkdownLite(md){
  if(!md)return '';
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^## (.+)$/gm,'<h3 style="font-size:1.05em;font-weight:800;margin:18px 0 6px;color:#191f28">$1</h3>')
    .replace(/^\s*- (.+)$/gm,'<li style="margin-left:20px">$1</li>')
    .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
    .replace(/---+/g,'<hr style="border:0;border-top:1px solid #e5e8eb;margin:10px 0">')
    .replace(/\n\n/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

async function runDocsHealthCheck(){
  if(!confirm('초기 버그로 원본이 손상된 영수증을 스캔합니다 (최근 30일).\n\n스캔만 먼저 할까요?'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=health_check');
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    if(d.broken===0){alert('✅ 손상된 문서 없습니다.\n\n스캔: '+d.scanned+'건');return}
    if(!confirm(`⚠️ 손상 문서 ${d.broken}건 발견 (스캔 ${d.scanned}건 중)\n\n자동 처리:\n- 해당 문서를 '반려' 상태로 변경\n- 각 상담방에 "재업로드 요청" 알림 메시지 전송\n\n계속할까요?`))return;
    const r2=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=health_check&fix=1');
    const d2=await r2.json();
    alert('✅ 처리 완료\n\n손상: '+d2.broken+'건 / 반려+알림 전송: '+d2.fixed+'건');
    loadDocsTab();
  }catch(e){alert('오류: '+e.message)}
}

async function loadDocsTab(){
  // 거래처 목록 항상 로드 (좌측 패널)
  loadDocsCustomers();
  loadDocsAlerts();

  const userId=$g('docsFilterUser').value.trim();
  // 거래처 미선택 시 우측 패널 빈 상태
  if(!userId){
    renderDocsTable([]);
    updateDocsStats({});
    return;
  }

  const status=$g('docsFilterStatus').value;
  const docType=$g('docsFilterType').value;
  const month=$g('docsFilterMonth').value;
  const params=['key='+encodeURIComponent(KEY)];
  if(status)params.push('status='+encodeURIComponent(status));
  if(docType)params.push('doc_type='+encodeURIComponent(docType));
  if(month)params.push('month='+encodeURIComponent(month));
  params.push('user_id='+encodeURIComponent(userId));
  params.push('limit=300');
  try{
    const r=await fetch('/api/admin-documents?'+params.join('&'));
    const d=await r.json();
    if(d.error){alert('조회 실패: '+d.error);return}
    renderDocsTable(d.documents||[]);
    updateDocsStats(d.counts||{});
    const monthParam=month||new Date().toISOString().substring(0,7);
    fetchDocsStats(monthParam);
  }catch(e){alert('오류: '+e.message)}
}

async function fetchDocsStats(month){
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=stats&month='+encodeURIComponent(month));
    const d=await r.json();
    if(d.usage){
      $g('docsStatCost').textContent='₩'+(d.usage.cost_krw||0).toLocaleString('ko-KR')+' ('+(d.usage.calls||0)+'회)';
    }
  }catch{}
}

function updateDocsStats(counts){
  const p=counts.pending||0, a=counts.approved||0, r=counts.rejected||0;
  $g('docsStatPending').textContent=p;
  $g('docsStatApproved').textContent=a;
  $g('docsStatRejected').textContent=r;
  $g('docsStatTotal').textContent=(p+a+r);
  const b=$g('docsPendingBadge');
  if(b&&b.style){
    if(p>0){b.style.display='inline-block';b.textContent=p}
    else b.style.display='none';
  }
}

/* AG-Grid 엑셀 스타일 그리드 — 문서 목록 (문서 타입별 탭) */
let docsGridApi=null;
let docsCurrentType='all'; // 선택된 문서 타입 탭
let docsRawList=[];        // 전체 원본 (거래처의 모든 문서)

// 타입별 탭 정의 — [key, 라벨, 아이콘]
const DOC_TYPE_TABS = [
  ['all',                '전체',           '📋'],
  ['receipt',            '영수증',          '🧾'],
  ['tax_invoice',        '세금계산서',       '📑'],
  ['lease',              '임대차',          '🏠'],
  ['insurance',          '보험',            '🛡️'],
  ['utility',            '공과금',          '💧'],
  ['property_tax',       '지방세',          '🚗'],
  ['payroll',            '근로(4대보험)',    '👥'],
  ['freelancer_payment', '프리랜서(3.3%)',  '🧑‍💼'],
  ['bank_stmt',          '은행',            '🏦'],
  ['business_reg',       '사업자등록',       '📋'],
  ['identity',           '신분증',          '🪪'],
  ['contract',           '계약',            '📝'],
  ['other',              '기타',            '📄'],
];

// 공통 컬럼 (모든 타입 앞·뒤 공통)
const DOC_TYPE_KEYS = ['receipt','tax_invoice','lease','insurance','utility','property_tax','payroll','freelancer_payment','bank_stmt','business_reg','identity','contract','other'];

/* approved 면 잠금, pending/rejected 면 편집 가능 */
function _docEditable(p){ return p.data.status !== 'approved'; }

function commonColsLeft(){
  return [
    { headerCheckboxSelection:true, checkboxSelection:true, width:40, pinned:'left', filter:false, sortable:false, resizable:false },
    { headerName:'일자', field:'date', width:115, pinned:'left', filter:'agDateColumnFilter',
      editable: _docEditable,
      valueSetter: p => {
        // 일자 편집 시 receipt_date 도 함께 저장되도록 매핑
        p.data.date = p.newValue;
        p.data.receipt_date = p.newValue;
        return true;
      }
    },
    { headerName:'타입', field:'doc_type', width:130,
      editable: _docEditable,
      cellEditor:'agSelectCellEditor',
      cellEditorParams:{ values: DOC_TYPE_KEYS },
      valueFormatter: p => docTypeLabelAdmin(p.value),
      cellStyle: p => !_docEditable(p) ? { color:'#8b95a1' } : {}
    },
  ];
}
function commonColsRight(){
  return [
    {
      headerName:'신뢰도', field:'confidence', width:80,
      valueFormatter: p => p.value!=null ? p.value+'%' : '-',
      cellStyle: p => p.value!=null && p.value<70 ? { color:'#d97706', fontWeight:'700', textAlign:'center' } : { color:'#10b981', fontWeight:'700', textAlign:'center' }
    },
    {
      headerName:'상태', field:'status', width:90, filter:true,
      cellRenderer: p => {
        const map={pending:{t:'⏳ 대기',bg:'#fef3c7',fg:'#92400e'},approved:{t:'✅ 승인',bg:'#d1fae5',fg:'#065f46'},rejected:{t:'❌ 반려',bg:'#fee2e2',fg:'#991b1b'}};
        const x=map[p.value]||map.pending;
        return `<span style="display:inline-block;padding:2px 7px;border-radius:6px;background:${x.bg};color:${x.fg};font-size:.8em;font-weight:700">${x.t}</span>`;
      }
    },
    { headerName:'메모', field:'note', flex:1, minWidth:150,
      editable:true, cellEditor:'agLargeTextCellEditor',
      cellStyle: p => p.value ? { background:'#fffbeb' } : {} },
    {
      headerName:'원본', field:'image_key', width:60, sortable:false, filter:false,
      cellRenderer: p => `<button onclick="openImgViewer('/api/image?k=${encodeURIComponent(p.value)}',['/api/image?k=${encodeURIComponent(p.value)}'])" style="background:#f2f4f6;border:none;padding:3px 8px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">📷</button>`
    },
    {
      headerName:'액션', width:260, sortable:false, filter:false, pinned:'right',
      cellRenderer: p => {
        const d=p.data;
        const base='padding:3px 6px;border-radius:5px;font-size:.74em;cursor:pointer;font-family:inherit;margin-right:2px;white-space:nowrap';
        let h='';
        if(d.status==='pending'){
          h+=`<button onclick="approveDocById(${d.id})" title="승인" style="background:#10b981;color:#fff;border:none;${base};font-weight:700">✅</button>`;
          h+=`<button onclick="rejectDocPrompt(${d.id})" title="반려" style="background:#fff;color:#f04452;border:1px solid #f04452;${base};font-weight:700">❌</button>`;
        } else if(d.status==='approved'){
          h+=`<button onclick="revertDocApproval(${d.id})" title="승인 취소" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;${base};font-weight:700">↺</button>`;
        } else if(d.status==='rejected'){
          h+=`<button onclick="approveDocById(${d.id})" title="복원" style="background:#10b981;color:#fff;border:none;${base};font-weight:700">✅</button>`;
        }
        /* 변환 버튼 (승인된 것 제외) */
        if(d.status!=='approved'){
          h+=`<button onclick="revertDocToPhotoAdmin(${d.id})" title="일반 사진으로 변환" style="background:#fff;color:#3182f6;border:1px solid #3182f6;${base}">📷</button>`;
          h+=`<button onclick="convertDocToFileAdmin(${d.id})" title="일반 파일로 변환" style="background:#fff;color:#3182f6;border:1px solid #3182f6;${base}">📁</button>`;
        }
        /* 완전 삭제 */
        h+=`<button onclick="deleteDocAdmin(${d.id})" title="완전 삭제 (R2 포함)" style="background:#fff;color:#dc2626;border:1px solid #dc2626;${base}">🗑️</button>`;
        return h;
      }
    },
  ];
}

// 타입별 중간 컬럼
function colsForType(type){
  const amtCol = (name, field) => ({
    headerName:name, field, width:115, type:'numericColumn',
    editable: _docEditable,
    valueFormatter: p => p.value!=null ? (Number(p.value)||0).toLocaleString('ko-KR') : '-',
    cellStyle: { fontWeight:'600', textAlign:'right' }
  });
  const dateCol = (name, field) => ({
    headerName:name, field, width:115,
    editable: _docEditable
  });
  const textCol = (name, field, w=140) => ({
    headerName:name, field, width:w, filter:true,
    editable: _docEditable
  });

  switch(type){
    case 'receipt':
      return [
        textCol('가맹점','vendor',160),
        textCol('사업자번호','vendor_biz_no',120),
        amtCol('금액','amount'),
        amtCol('부가세','vat_amount'),
        { headerName:'카테고리', field:'category', width:105, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor',
          cellEditorParams:{ values:['','식비','교통비','숙박비','소모품비','접대비','통신비','공과금','임대료','보험료','기타'] } },
      ];
    case 'tax_invoice':
      return [
        textCol('공급자','ex_supplier',140),
        textCol('공급받는자','ex_buyer',130),
        amtCol('공급가액','ex_supply_amount'),
        amtCol('세액','ex_tax_amount'),
        textCol('품목','ex_items_preview',150),
      ];
    case 'lease':
      return [
        textCol('임대인','ex_lessor',110),
        textCol('임차인','ex_lessee',110),
        textCol('물건지','ex_property_address',200),
        amtCol('보증금','ex_deposit'),
        amtCol('월세','ex_monthly_rent'),
        amtCol('관리비','ex_maintenance_fee'),
        dateCol('시작일','ex_start_date'),
        dateCol('만료일','ex_end_date'),
      ];
    case 'insurance':
      return [
        textCol('보험사','ex_insurer',120),
        textCol('보험종류','ex_insurance_type',130),
        textCol('증권번호','ex_policy_no',130),
        amtCol('보험료','ex_premium'),
        { headerName:'납부주기', field:'ex_payment_cycle', width:100, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor', cellEditorParams:{ values:['','lump','monthly','annual'] } },
        dateCol('만기일','ex_end_date'),
      ];
    case 'utility':
      return [
        { headerName:'공과금', field:'ex_utility_type', width:100, editable:p=>p.data.status==='pending',
          cellEditor:'agSelectCellEditor', cellEditorParams:{ values:['','electric','water','gas','internet','phone','other'] } },
        textCol('고객번호','ex_customer_no',120),
        textCol('사용량','ex_usage',100),
        textCol('사용기간','ex_billing_period',140),
        amtCol('청구금액','amount'),
        dateCol('납부기한','ex_due_date'),
      ];
    case 'property_tax':
      return [
        textCol('세목','ex_tax_name',130),
        textCol('귀속연도','ex_tax_year',100),
        amtCol('세액','amount'),
        dateCol('납부기한','ex_due_date'),
        textCol('고지번호','ex_notice_no',130),
      ];
    case 'payroll':
      return [
        textCol('근로자','ex_employee_name',110),
        textCol('사업주','ex_employer',130),
        dateCol('입사일','ex_start_date'),
        amtCol('월급','ex_monthly_salary'),
        textCol('근무시간','ex_work_hours',130),
      ];
    case 'bank_stmt':
      return [
        textCol('계좌(뒷4)','ex_account_no',110),
        textCol('조회기간','ex_period',150),
        { headerName:'건수', field:'ex_transaction_count', width:80, type:'numericColumn' },
      ];
    case 'business_reg':
      return [
        textCol('상호','ex_business_name',150),
        textCol('사업자번호','ex_registration_no',130),
        textCol('대표자','ex_representative',100),
        textCol('업태','ex_business_type',120),
        textCol('종목','ex_business_category',120),
        dateCol('개업일','ex_open_date'),
      ];
    case 'identity':
      return [
        textCol('구분','ex_id_type',120),
        textCol('성명','ex_full_name',100),
        textCol('은행','ex_bank_name',100),
        textCol('계좌(마스킹)','ex_account_no_masked',150),
      ];
    case 'contract':
      return [
        textCol('갑','ex_party_a',130),
        textCol('을','ex_party_b',130),
        textCol('계약내용','ex_contract_subject',200),
        amtCol('계약금액','ex_contract_amount'),
        dateCol('시작일','ex_start_date'),
        dateCol('종료일','ex_end_date'),
      ];
    case 'all':
    default:
      return [
        textCol('가맹점/업체','vendor',160),
        amtCol('금액','amount'),
        { headerName:'카테고리', field:'category', width:100 },
      ];
  }
}

// rowData 변환 — extra JSON 펼치기
function buildRowData(docs){
  return docs.map(d => {
    let ex = {};
    try { ex = d.extra ? JSON.parse(d.extra) : {}; } catch {}
    const row = {
      id: d.id,
      date: d.receipt_date || (d.created_at||'').substring(0,10),
      doc_type: d.doc_type,
      doc_type_label: docTypeLabelAdmin(d.doc_type),
      user_id: d.user_id,
      user_name: d.real_name || d.name || ('#'+d.user_id),
      vendor: d.vendor || '',
      vendor_biz_no: d.vendor_biz_no || '',
      amount: d.amount,
      vat_amount: d.vat_amount,
      category: d.category || '',
      confidence: d.ocr_confidence!=null ? Math.round(d.ocr_confidence*100) : null,
      status: d.status,
      image_key: d.image_key,
      note: d.note || '',
      created_at: d.created_at,
    };
    // ex.* 를 ex_* 로 펼침
    for (const k in ex) {
      const v = ex[k];
      if (Array.isArray(v)) row['ex_'+k+'_preview'] = v.slice(0,3).join(', ');
      else row['ex_'+k] = v;
    }
    return row;
  });
}

function renderDocsTypeTabs(){
  const el = $g('docsTypeTabs');
  if(!el || !el.innerHTML === undefined)return;
  const counts = {};
  for(const d of docsRawList){ counts[d.doc_type] = (counts[d.doc_type]||0)+1; }
  const visibleTabs = DOC_TYPE_TABS.filter(([k])=>k==='all'||counts[k]>0);
  el.innerHTML = visibleTabs.map(([k,label,icon])=>{
    const c = k==='all' ? docsRawList.length : (counts[k]||0);
    const on = k===docsCurrentType;
    const bg = on ? '#3182f6' : 'transparent';
    const fg = on ? '#fff' : '#6b7684';
    const fw = on ? '700' : '500';
    return `<button onclick="setDocsTypeTab('${k}')" style="background:${bg};color:${fg};border:none;padding:7px 13px;border-radius:8px;font-size:.85em;font-weight:${fw};cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">${icon} ${label} <span style="opacity:.75;font-size:.85em;margin-left:2px">${c}</span></button>`;
  }).join('');
}

function setDocsTypeTab(type){
  docsCurrentType = type;
  renderDocsTypeTabs();
  rebuildDocsGrid();
}

function rebuildDocsGrid(){
  const filtered = docsCurrentType==='all'
    ? docsRawList
    : docsRawList.filter(d => d.doc_type === docsCurrentType);
  const empty = $g('docsEmpty');
  if(!filtered.length){
    empty.style.display='block';
    if(docsGridApi){
      docsGridApi.setGridOption('columnDefs', [...commonColsLeft(), ...colsForType(docsCurrentType), ...commonColsRight()]);
      docsGridApi.setGridOption('rowData', []);
    }
    return;
  }
  empty.style.display='none';

  const rowData = buildRowData(filtered);
  const columnDefs = [...commonColsLeft(), ...colsForType(docsCurrentType), ...commonColsRight()];

  if(docsGridApi){
    docsGridApi.setGridOption('columnDefs', columnDefs);
    docsGridApi.setGridOption('rowData', rowData);
    return;
  }

  const gridDiv = $g('docsGrid');
  if(!gridDiv)return;
  /* AG-Grid 라이브러리 로드 실패 시 fallback — 단순 HTML 테이블로라도 데이터 표시 */
  if(typeof agGrid === 'undefined'){
    const cols=[
      {f:'_typeLabel',l:'타입'},
      {f:'vendor',l:'가맹점'},
      {f:'amount',l:'금액',fmt:v=>v==null?'':Number(v).toLocaleString('ko-KR')+'원'},
      {f:'receipt_date',l:'날짜'},
      {f:'category',l:'계정'},
      {f:'_statusLabel',l:'상태'},
    ];
    const typeLabelMap=(t)=>docTypeLabelAdmin(t);
    const stLabel=(s)=>({pending:'⏳ 대기',approved:'✅ 승인',rejected:'❌ 반려',reverted:'↩︎ 취소'})[s]||s;
    const rows=rowData.map(r=>{
      r._typeLabel=typeLabelMap(r.doc_type);
      r._statusLabel=stLabel(r.status);
      return r;
    });
    let html='<div style="background:#fff7ed;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;border-radius:8px;margin-bottom:10px;font-size:.82em">⚠️ 스프레드시트 라이브러리 로드 실패. 기본 테이블로 표시합니다. 네트워크 확인 후 새로고침.</div>';
    html+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.85em;background:#fff">'
      +'<thead style="background:#f9fafb"><tr>'+cols.map(c=>'<th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e5e8eb;font-weight:700">'+c.l+'</th>').join('')+'</tr></thead>'
      +'<tbody>'+rows.map(r=>'<tr style="border-bottom:1px solid #f2f4f6">'
        +cols.map(c=>{const v=c.fmt?c.fmt(r[c.f]):(r[c.f]==null?'':r[c.f]);return '<td style="padding:8px 10px">'+e(String(v))+'</td>'}).join('')
        +'</tr>').join('')
      +'</tbody></table></div>';
    gridDiv.innerHTML=html;
    return;
  }

  const gridOptions = {
    columnDefs,
    rowData,
    defaultColDef: { sortable:true, filter:true, resizable:true },
    rowSelection: 'multiple',
    suppressRowClickSelection: true,
    animateRows: true,
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100, 200],
    enableCellTextSelection: true,
    onCellValueChanged: async (e) => {
      const d = e.data;
      let field = e.colDef.field;
      let newVal = e.newValue;
      const body = { id: d.id };
      if (field && field.startsWith('ex_')) {
        body.extra_patch = { [field.slice(3)]: newVal };
      } else {
        body[field] = newVal;
      }
      try{
        await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=update',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body)
        });
        // doc_type 바뀌면 raw 리스트 업데이트 + 탭 재계산
        if(field==='doc_type'){
          const idx=docsRawList.findIndex(x=>x.id===d.id);
          if(idx>=0)docsRawList[idx].doc_type=newVal;
          renderDocsTypeTabs();
          // 현재 탭에 해당 타입이 아니면 row 사라져야 하니 재빌드
          rebuildDocsGrid();
        }
      }catch(err){ alert('저장 실패: '+err.message) }
    },
  };
  docsGridApi = agGrid.createGrid(gridDiv, gridOptions);
}

function renderDocsTable(docs){
  docsRawList = docs || [];
  renderDocsTypeTabs();
  rebuildDocsGrid();
}

// 승인 취소 — 편집 가능한 pending 상태로 복원
async function revertDocApproval(docId){
  if(!docId)return;
  if(!confirm('이 문서의 승인을 취소하시겠어요?\n(편집 가능한 \'대기\' 상태로 돌아갑니다)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=revert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('↺ 승인 취소됨 — 편집 가능');
      loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

// 문서로 잘못 분류된 것을 일반 사진으로 되돌리기 (관리자)
async function revertDocToPhotoAdmin(docId){
  if(!docId)return;
  if(!confirm('이 문서 분류를 취소하고 일반 사진으로 되돌리시겠어요?\n(상담방 메시지가 [DOC]에서 [IMG]로 바뀝니다)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=revert_to_photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('📷 사진으로 되돌렸습니다');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function convertDocToFileAdmin(docId){
  if(!docId)return;
  if(!confirm('이 영수증을 일반 파일 메시지로 변환할까요?'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=convert_to_file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('📁 파일로 변환됨');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function deleteDocAdmin(docId){
  if(!docId)return;
  if(!confirm('이 문서를 완전 삭제할까요?\n\nR2 원본 파일 + DB 기록 + 상담방 메시지 모두 제거됩니다.\n(되돌릴 수 없음)'))return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('🗑️ 삭제 완료');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
      if(typeof loadDocsTab==='function')loadDocsTab();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function convertMsgToReceiptAdmin(messageId){
  hideMsgCtxMenu();
  if(!messageId||!currentRoomId)return;
  if(!confirm('이 메시지를 영수증으로 변환할까요?\n(사진은 AI가 자동 인식, 파일은 수동 편집)'))return;
  if(typeof showAdminToast==='function')showAdminToast('🤖 변환 중...');
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=convert_to_receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId, room_id:currentRoomId})});
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('🧾 영수증으로 변환됨');
      if(typeof loadRoomDetail==='function')loadRoomDetail();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

// AG-Grid cellRenderer에서 호출되는 래퍼 (btnEl 없이 id만으로 승인)
async function approveDocById(docId){
  if(!docId)return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId})});
    const d=await r.json();
    if(d.ok){
      let msg='✅ 승인 완료';
      if(d.alerts_created>0)msg+=` (${d.alerts_created}개 D-day 알림 예약)`;
      if(typeof showAdminToast==='function')showAdminToast(msg);
      else console.log(msg);
      loadDocsTab();
    }
    else alert('승인 실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

function showAdminToast(msg){
  let t=document.getElementById('adminToast');
  if(!t){
    t=document.createElement('div');t.id='adminToast';
    t.style.cssText='position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;border-radius:20px;font-size:.85em;z-index:11001;pointer-events:none;opacity:0;transition:opacity .2s';
    document.body.appendChild(t);
  }
  t.textContent=msg;t.style.opacity='1';
  setTimeout(()=>{t.style.opacity='0'},1800);
}

async function openDocDetailAdmin(id){
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&id='+id);
    const d=await r.json();
    if(d.error){alert(d.error);return}
    const doc=d.document;
    const imgUrl='/api/image?k='+encodeURIComponent(doc.image_key||'');
    const info=[
      '타입: '+docTypeLabelAdmin(doc.doc_type),
      '상태: '+(doc.status||''),
      '가맹점: '+(doc.vendor||'-'),
      '금액: '+(doc.amount!=null?(doc.amount).toLocaleString('ko-KR')+'원':'-'),
      '날짜: '+(doc.receipt_date||'-'),
      '카테고리: '+(doc.category||'-'),
      '신뢰도: '+(doc.ocr_confidence!=null?Math.round(doc.ocr_confidence*100)+'%':'-'),
      doc.reject_reason?'반려사유: '+doc.reject_reason:'',
      doc.note?'메모: '+doc.note:'',
    ].filter(Boolean).join('\n');
    if(confirm(info+'\n\n[확인] 원본사진 보기 / [취소] 닫기'))openImgViewer(imgUrl,[imgUrl]);
  }catch(e){alert('오류: '+e.message)}
}

/* 위하고 표준 전표 CSV export — 가능하면 "다른 이름으로 저장" 대화창 */
async function exportWehago(){
  const month=$g('docsFilterMonth').value||new Date().toISOString().substring(0,7);
  const userId=$g('docsFilterUser').value.trim();
  if(!confirm('['+month+'] 월 승인된 문서를 위하고 전표 CSV로 다운로드합니다.\n계속할까요?'))return;
  try{
    let url='/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=export&format=wehago&month='+encodeURIComponent(month);
    if(userId)url+='&user_id='+encodeURIComponent(userId);
    const r=await fetch(url);
    if(!r.ok){const t=await r.text();alert('export 실패: '+t);return}
    const blob=await r.blob();
    const filename='wehago_'+month+(userId?'_u'+userId:'')+'.csv';
    await saveBlobAs(blob, filename, 'text/csv');
  }catch(e){alert('오류: '+e.message)}
}

/* 파일 저장 헬퍼 — Chrome/Edge는 Save As 대화창, 그 외는 기본 다운로드 */
async function saveBlobAs(blob, suggestedName, mimeType){
  // Chrome/Edge Save As picker
  if(window.showSaveFilePicker){
    try{
      const ext = suggestedName.split('.').pop();
      const types = [];
      if(mimeType==='text/csv') types.push({description:'CSV 파일',accept:{'text/csv':['.csv']}});
      else if(mimeType&&mimeType.indexOf('image')===0) types.push({description:'이미지',accept:{[mimeType]:['.'+ext]}});
      else types.push({description:'파일',accept:{'application/octet-stream':['.'+ext]}});
      const handle = await window.showSaveFilePicker({ suggestedName, types });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      if(typeof showAdminToast==='function')showAdminToast('💾 저장 완료: '+handle.name);
      return;
    }catch(err){
      if(err && err.name==='AbortError') return; // 사용자 취소
      // 폴백
    }
  }
  // Fallback: 기본 다운로드
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=suggestedName;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},200);
}

/* ===== ⭐ 메시지 북마크 (#6) ===== */
async function doToggleBookmark(messageId){
  if(!currentRoomId||!messageId){hideMsgCtxMenu();return}
  hideMsgCtxMenu();
  /* 이미 북마크인지 확인하려고 목록 조회 — 작은 방이라 OK. 큰 방은 개선 여지 */
  try{
    const listR=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const listD=await listR.json();
    const exists=(listD.items||[]).some(it=>Number(it.message_id)===Number(messageId));
    if(exists){
      const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId})});
      const d=await r.json();
      if(d.ok)_adminShowToast('⭐ 북마크 해제');
      else alert('실패: '+(d.error||'unknown'));
    } else {
      const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId, message_id:messageId})});
      const d=await r.json();
      if(d.ok)_adminShowToast('⭐ 북마크 저장');
      else alert('실패: '+(d.error||'unknown'));
    }
    /* 현재 열린 북마크 패널이면 목록 새로고침 */
    const bm=document.getElementById('riBookmarkPanel');
    if(bm && bm.style.display!=='none')loadRoomBookmarks();
  }catch(err){alert('오류: '+err.message)}
}
async function loadRoomBookmarks(){
  const el=$g('riBookmarkList');if(!el||!currentRoomId)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const items=(d.items||[]).filter(it=>it.content!=null);
    if(!items.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">북마크한 메시지가 없습니다.<br>메시지를 꾹 누르면 "⭐ 북마크" 메뉴가 나옵니다.</div>';return}
    el.innerHTML=items.map(function(it){
      const who=it.role==='human_advisor'?'👨‍💼 세무사':it.role==='assistant'?'🤖 AI':'👤 '+(it.real_name||it.name||'사용자');
      let content=String(it.content||'');
      const imgMatch=content.match(/^\[IMG\]\S+\n?([\s\S]*)$/);
      if(imgMatch)content='[사진] '+imgMatch[1];
      const fileMatch=content.match(/^\[FILE\](\{[^\n]+\})\n?([\s\S]*)$/);
      if(fileMatch){try{const o=JSON.parse(fileMatch[1]);content='[파일] '+(o.name||'')+' '+(fileMatch[2]||'')}catch{}}
      const preview=e(content).slice(0,200);
      return '<div style="padding:10px 12px;background:#fff;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:8px;display:flex;gap:8px">'
        +'<div style="flex:1;min-width:0;cursor:pointer" onclick="jumpFromBookmark('+it.message_id+')" title="클릭하면 원본 메시지로 이동">'
        +'<div style="font-size:.72em;color:#8b95a1;margin-bottom:4px">'+who+' · '+e(it.created_at||'')+' · <span style="color:#3182f6">↗ 이동</span></div>'
        +'<div style="font-size:.85em;color:#191f28;white-space:pre-wrap;word-break:break-word">'+preview+'</div>'
        +'</div>'
        +'<button onclick="removeBookmark('+it.message_id+')" style="background:#fee2e2;color:#f04452;border:none;padding:4px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit;flex-shrink:0;align-self:flex-start">해제</button>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}
async function removeBookmark(messageId){
  try{
    const r=await fetch('/api/admin-bookmark?key='+encodeURIComponent(KEY)+'&action=remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message_id:messageId})});
    const d=await r.json();
    if(d.ok)loadRoomBookmarks();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
function jumpFromBookmark(mid){
  const m=$g('roomInfoModal');if(m)m.style.display='none';
  setTimeout(function(){if(typeof jumpToOriginalMsgAdmin==='function')jumpToOriginalMsgAdmin(String(mid))},80);
}

/* ===== 🕒 예약 발송 (#4) ===== */
function _pad2(n){return String(n).padStart(2,'0')}
function _fmtDateLocal(d){return d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate())}
function _fmtTimeLocal(d){return _pad2(d.getHours())+':'+_pad2(d.getMinutes())}
function openScheduleSend(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const inp=$g('roomInput');
  const content=(inp&&inp.value||'').trim();
  if(!content){alert('예약할 내용을 입력창에 먼저 쓰신 뒤 🕒 를 눌러주세요');return}
  $g('schedPreview').textContent=content;
  /* 기본: 15분 뒤 */
  const d=new Date(Date.now()+15*60*1000);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
  $g('scheduleSendModal').style.display='flex';
  loadScheduledList();
}
function closeScheduleSend(){
  const m=$g('scheduleSendModal');if(m)m.style.display='none';
}
function schedQuick(minutes){
  const d=new Date(Date.now()+minutes*60*1000);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
}
function schedQuickAt(hour, daysAhead){
  const d=new Date();
  d.setDate(d.getDate()+(daysAhead||0));
  d.setHours(hour,0,0,0);
  $g('schedDate').value=_fmtDateLocal(d);
  $g('schedTime').value=_fmtTimeLocal(d);
}
async function submitScheduleSend(){
  if(!currentRoomId)return;
  const date=$g('schedDate').value;
  const time=$g('schedTime').value;
  const content=$g('schedPreview').textContent;
  if(!date||!time){alert('날짜·시각을 입력하세요');return}
  const when=date+' '+time+':00';
  const target=new Date(date+'T'+time+':00').getTime();
  if(target<=Date.now()){alert('예약 시각은 현재 이후여야 합니다');return}
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId, content:content, scheduled_at:when})});
    const d=await r.json();
    if(!d.ok){alert('예약 실패: '+(d.error||'unknown'));return}
    /* 입력창 비우고 모달 유지 (목록 갱신) */
    const inp=$g('roomInput');if(inp){inp.value='';inp.style.height='auto'}
    $g('schedPreview').textContent='';
    _adminShowToast('🕒 예약 등록됨 ('+when+')');
    loadScheduledList();
  }catch(err){alert('오류: '+err.message)}
}
async function loadScheduledList(){
  const el=$g('schedList');if(!el||!currentRoomId)return;
  el.innerHTML='불러오는 중...';
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const items=(d.items||[]);
    if(!items.length){el.innerHTML='<div style="color:#8b95a1">예약된 항목 없음</div>';return}
    el.innerHTML=items.map(function(it){
      const preview=String(it.content||'').slice(0,80).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<div style="padding:8px 10px;background:#f9fafb;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start">'
        +'<div style="flex:1;min-width:0"><div style="font-size:.78em;color:#3182f6;font-weight:700">🕒 '+e(it.scheduled_at||'')+'</div>'
        +'<div style="font-size:.82em;color:#191f28;white-space:pre-wrap;word-break:break-word;margin-top:3px">'+preview+(it.content.length>80?'...':'')+'</div></div>'
        +'<button onclick="cancelScheduled('+it.id+')" style="background:#fee2e2;color:#f04452;border:none;padding:4px 10px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit;flex-shrink:0">취소</button>'
        +'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
}
async function cancelScheduled(id){
  if(!confirm('이 예약을 취소할까요?'))return;
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
    const d=await r.json();
    if(!d.ok){alert('취소 실패: '+(d.error||'unknown'));return}
    loadScheduledList();
  }catch(err){alert('오류: '+err.message)}
}

/* 예약 발송 트리거: 주기적으로 서버에 '만료된 것 실행' 요청.
   Cloudflare Pages 자체 cron 미지원 이슈 회피 — 관리자가 열어둔 동안 클라이언트가 cron 역할 */
async function runDueSchedules(){
  try{
    const r=await fetch('/api/admin-schedule?key='+encodeURIComponent(KEY)+'&action=run_due',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const d=await r.json();
    if(d && d.sent>0){
      /* 발송된 것이 있으면 현재 방 메시지 새로고침 */
      if(typeof loadRoomDetail==='function' && currentRoomId)loadRoomDetail();
      if(typeof loadRoomList==='function')loadRoomList();
    }
  }catch(_){}
}
(function(){
  if(window._schedRunBound)return;window._schedRunBound=true;
  /* 로드 직후 1회, 이후 60초마다 */
  setTimeout(runDueSchedules, 3000);
  setInterval(runDueSchedules, 60*1000);
})();

/* ===== 👤 상담방 멤버 꾹 눌러 거래 종료 메뉴 (d) ===== */
function _bindRoomMemberLongPress(){
  const root=document.getElementById('roomMembers');if(!root)return;
  if(root.dataset.mlpBound)return;
  root.dataset.mlpBound='1';
  let lpTimer=null, lpTarget=null, lpX=0, lpY=0;
  root.addEventListener('touchstart',function(e){
    const sp=e.target.closest('.room-member');if(!sp)return;
    const t=e.touches[0];lpX=t.clientX;lpY=t.clientY;lpTarget=sp;
    lpTimer=setTimeout(()=>{lpTimer=null;window._lpJustFired=true;setTimeout(()=>{window._lpJustFired=false},600);_showMemberCtx(sp, lpX, lpY)},500);
  },{passive:true});
  root.addEventListener('touchmove',function(e){
    if(lpTimer){const t=e.touches[0];if(Math.abs(t.clientX-lpX)>8||Math.abs(t.clientY-lpY)>8){clearTimeout(lpTimer);lpTimer=null}}
  },{passive:true});
  root.addEventListener('touchend',()=>{if(lpTimer){clearTimeout(lpTimer);lpTimer=null}});
  root.addEventListener('contextmenu',function(e){
    const sp=e.target.closest('.room-member');if(!sp)return;
    e.preventDefault();
    _showMemberCtx(sp, e.clientX, e.clientY);
  });
}
function _showMemberCtx(spanEl, x, y){
  const uid=parseInt(spanEl.getAttribute('data-uid')||'0',10);
  const nm=spanEl.getAttribute('data-name')||'';
  if(!uid)return;
  let m=document.getElementById('memberCtxMenu');
  if(!m){
    m=document.createElement('div');m.id='memberCtxMenu';
    m.style.cssText='position:fixed;min-width:170px;background:#fff;border:1px solid #e5e8eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:12000;padding:4px;display:none';
    document.body.appendChild(m);
    document.addEventListener('click',function(ev){
      if(ev.target.closest('#memberCtxMenu'))return;
      m.style.display='none';
    });
  }
  m.innerHTML='<div style="padding:8px 10px;font-size:.8em;color:#6b7280;border-bottom:1px solid #f2f4f6">'+e(nm||'user#'+uid)+'</div>'
    +'<button onclick="document.getElementById(\'memberCtxMenu\').style.display=\'none\';openCustomerDashboard('+uid+')" style="display:block;width:100%;text-align:left;background:none;border:none;padding:8px 10px;font-size:.85em;cursor:pointer;font-family:inherit">📋 거래처 정보</button>'
    +'<button onclick="document.getElementById(\'memberCtxMenu\').style.display=\'none\';terminateUser('+uid+',\''+escAttr(nm).replace(/\'/g,'')+'\')" style="display:block;width:100%;text-align:left;background:none;border:none;padding:8px 10px;font-size:.85em;cursor:pointer;font-family:inherit;color:#dc2626">🚫 거래 종료</button>';
  m.style.display='block';
  const rect=m.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  const left=Math.max(8, Math.min(x-rect.width/2, vw-rect.width-8));
  let top=Math.max(8, Math.min(y-rect.height-8, vh-rect.height-8));
  if(y-rect.height-8<8)top=Math.min(y+8, vh-rect.height-8);
  m.style.left=left+'px';m.style.top=top+'px';
  if(navigator.vibrate)try{navigator.vibrate(15)}catch{}
}

/* ===== 🏢 거래처 탭 업체/사용자 모드 토글 + 업체 대시보드 — admin-business-tab.js 분리 (Step 3) =====
 * setClientTabMode / _clientTabMode / _bizListCache 모두 admin-business-tab.js 로 이전.
 * 의존: $g, _doClientSearch 는 admin.js cross-script. */

/* 업체 list / 새 업체 모달 / 업체 dashboard / _bd* 헬퍼 — admin-business-tab.js 로 분리 (Step 3)
 * 분리 함수: onBizSearchInput / loadBusinessList / _renderBizList
 *           openNewBusinessModal / closeNewBusinessModal / _nbOpenAddressSearch / _nbUpdateFiscalTerm / submitNewBusiness
 *           openBusinessDashboard / _openBusinessDashboardLegacy
 *           _bdLoadMemos / _bdAddMemo / _bdCloseMemoModal / _bdSubmitMemo / _bdDeleteMemo + ESC handler
 *           _bdRunBusinessSummary / _bdKV / closeBusinessDashboard / _bdEditBasic
 *           _bdAddMember / _bdChangeRole / _bdTogglePrimary / _bdRemoveMember
 * 분리 상태: _bizSearchT / _bdCurrent (var, classic script global)
 * 의존: KEY / $g / e / escAttr / _ensureRoomLabels / _calcFiscalTerm / openRoom / tab
 *       / _summaryMode / _customerSummaryUserId / _customerSummaryBusinessId
 *       / _lastSummaryText / _lastSummaryJson / _lastSummaryRange / _setSummaryRangeUI */
async function _legacyBusinessTabRemoved(){
  /* 본문 통째 admin-business-tab.js 에 이전 — 본 placeholder 는 라인 번호 보호용. */
  return null;
}
/* (loadBusinessList / _renderBizList / openNewBusinessModal / closeNewBusinessModal / _nbOpenAddressSearch / _nbUpdateFiscalTerm / submitNewBusiness — admin-business-tab.js 로 이전됨) */

/* (openBusinessDashboard / _openBusinessDashboardLegacy / _bd* / closeBusinessDashboard — admin-business-tab.js 로 이전됨) */

/* ===== 🚫 거래 종료 요청 큐 (owner 전용 승인 플로우) ===== */
async function _refreshTermReqBadge(){
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&status=pending');
    const d=await r.json();
    const btn=$g('termReqBtn'); const bd=$g('termReqBadge');
    const n=d.pending_count||0;
    if(!btn)return;
    /* owner 에게만 표시. IS_OWNER 플래그는 admin.js 초기에 세팅됨 */
    if(typeof IS_OWNER!=='undefined' && IS_OWNER && n>0){
      btn.style.display='inline-flex';
      if(bd)bd.textContent=String(n);
    } else {
      btn.style.display='none';
    }
  }catch(_){}
}
(function(){
  if(window._termReqBadgeBound)return;window._termReqBadgeBound=true;
  setTimeout(_refreshTermReqBadge, 2500);
  setInterval(_refreshTermReqBadge, 60*1000);
})();
async function openTerminationRequests(){
  /* Phase 5-20: owner 전용 — 직원이 거래종료 요청 직접 처리하면 안 됨 (CLAUDE.md 절대 규칙) */
  if(!IS_OWNER){alert('거래 종료 요청은 사장님(owner)만 처리할 수 있습니다');return}
  const m=$g('termReqModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  await _loadTermReqList();
}
function closeTerminationRequests(){
  const m=$g('termReqModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function _loadTermReqList(){
  const el=$g('termReqList');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&status=pending');
    const d=await r.json();
    const items=d.items||[];
    $g('termReqCount').textContent='('+items.length+'건 대기)';
    if(!items.length){el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">🎉 승인 대기 중인 종료 요청이 없습니다</div>';return}
    el.innerHTML=items.map(function(it){
      const target=e(it.real_name||it.name||'#'+it.user_id);
      const phone=it.phone?' · '+e(it.phone):'';
      const req=e(it.requested_by_name||'직원');
      const reason=it.reason?'<div style="margin-top:6px;padding:7px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:.82em;color:#92400e"><b>요청 사유:</b> '+e(it.reason)+'</div>':'';
      return '<div style="padding:12px;border:1px solid #e5e8eb;border-radius:10px;margin-bottom:10px;background:#fff">'
        +'<div style="display:flex;align-items:flex-start;gap:8px">'
        +'<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.95em">🏢 '+target+phone+'</div>'
        +'<div style="font-size:.75em;color:#6b7280;margin-top:2px">👤 '+req+' 직원 요청 · '+e(it.requested_at||'')+'</div>'
        +reason+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:6px;margin-top:10px">'
        +'<button onclick="_termReqAction('+it.id+',\'approve\',\''+target.replace(/\'/g,'')+'\')" style="flex:1;background:#dc2626;color:#fff;border:none;padding:8px;border-radius:6px;font-size:.82em;font-weight:700;cursor:pointer;font-family:inherit">✅ 승인 (거래 종료 실행)</button>'
        +'<button onclick="_termReqAction('+it.id+',\'reject\',\''+target.replace(/\'/g,'')+'\')" style="flex:1;background:#fff;color:#6b7280;border:1px solid #6b7280;padding:8px;border-radius:6px;font-size:.82em;cursor:pointer;font-family:inherit">반려</button>'
        +'</div></div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:20px;font-size:.85em">오류: '+e(err.message)+'</div>'}
}
async function _termReqAction(id, action, targetName){
  const actLabel=action==='approve'?'✅ 승인':'❌ 반려';
  const warn=action==='approve'?'\n\n⚠️ 승인하면 '+targetName+' 의 앱 접근이 즉시 차단되고 모든 상담방이 종료됩니다. 되돌리려면 거래처 탭에서 "🔄 거래 재개" 필요.':'';
  if(!confirm(actLabel+' 처리하시겠습니까?'+warn))return;
  const note=prompt('사유·메모 (선택):','')||null;
  try{
    const r=await fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id, note:note})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    _loadTermReqList();
    _refreshTermReqBadge();
    if(typeof loadUsers==='function')loadUsers(currentStatus);
    if(typeof loadRoomList==='function')loadRoomList();
  }catch(err){alert('오류: '+err.message)}
}

/* terminateUser 호출 시 직원이면 서버가 큐 응답 반환 → 알림 */
(function wrapTerminateUser(){
  if(window._termUserWrapped)return;window._termUserWrapped=true;
  const orig=window.terminateUser;
  if(typeof orig!=='function')return;
  window.terminateUser=async function(id, displayName){
    /* 기존 로직 그대로 호출 — alert 메시지 차별화만 서버 응답 보고 */
    /* 단순화: 원본 함수는 response.d.ok 만 검사하므로 여기서 한 번 fetch 선행해 queued 확인 */
    const nm=displayName||'이 거래처';
    if(!confirm('🚫 '+nm+' 와의 거래를 종료 요청합니다.\n\n- owner(대표)는 즉시 실행됨\n- 직원은 대표 승인 대기 큐에 등록됨\n\n계속할까요?'))return;
    const reason=prompt('종료 사유 (내부 기록용, 선택):','')||null;
    try{
      const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id, action:'terminate', reason:reason})});
      const d=await r.json();
      if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
      if(d.queued){
        alert('✅ 거래 종료 요청이 대표 승인 대기 큐에 등록되었습니다'+(d.already_pending?' (이미 같은 대상 요청 있음)':'')+'.\n요청 ID #'+(d.request_id||'-'));
      } else {
        alert('✅ 거래 종료 완료');
      }
      if(typeof loadUsers==='function')loadUsers(currentStatus);
      if(typeof loadRoomList==='function')loadRoomList();
      if(typeof _refreshTermReqBadge==='function')_refreshTermReqBadge();
    }catch(err){alert('오류: '+err.message)}
  };
})();

/* 🔍 상담방 목록 검색 — 디바운스 */
let _roomListSearchT=null;
function onRoomListSearchInput(){
  if(_roomListSearchT)clearTimeout(_roomListSearchT);
  _roomListSearchT=setTimeout(function(){if(typeof loadRoomList==='function')loadRoomList()}, 200);
}

/* 🏠 관리자 → 챗봇: 카톡 세션 제거 후 이동 — 본인 계정에 얽매이지 않게 */
function goToChatbotAsAdmin(){
  try{
    document.cookie='session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    /* PWA 등에서 캐시된 user id 등도 지움 */
    try{localStorage.removeItem('currentUserId')}catch(_){}
    try{sessionStorage.removeItem('currentUserId')}catch(_){}
  }catch(_){}
  location.href='/';
}

/* ===== 🧹 중복 사업장 정리 (일회성 유틸) ===== */
async function cleanDupBiz(){
  try{
    const r=await fetch('/api/admin-clean-duplicate-businesses?key='+encodeURIComponent(KEY));
    const d=await r.json();
    if(!d.ok){alert('조회 실패: '+(d.error||'unknown'));return}
    if(!d.total_removable){alert('🎉 정리할 중복 사업장이 없습니다.');return}
    /* 요약 텍스트 */
    const lines=[];
    lines.push('🧹 중복 사업장 감지 결과');
    lines.push('영향 받는 거래처: '+d.total_users_affected+'명');
    lines.push('삭제 예정 사업장: '+d.total_removable+'개');
    lines.push('');
    for(const u of d.users.slice(0,12)){
      lines.push('• '+(u.user_name||'user#'+u.user_id));
      for(const g of u.groups){
        const keepDesc=(g.keep.company_name||'(이름없음)')+(g.keep.business_number?' · '+g.keep.business_number:'');
        lines.push('   ↳ 유지: '+keepDesc);
        for(const rm of g.remove){
          const d2=(rm.company_name||'(이름없음)')+(rm.business_number?' · '+rm.business_number:'');
          lines.push('   ✖ 삭제: '+d2);
        }
      }
    }
    if(d.users.length>12)lines.push('... (외 '+(d.users.length-12)+'명)');
    lines.push('');
    lines.push('⚠️ 실제 삭제하려면 확인하세요.');
    if(!confirm(lines.join('\n')))return;
    if(!confirm('마지막 확인: '+d.total_removable+'개 사업장을 실제로 삭제합니다. 되돌릴 수 없습니다.\n\n계속할까요?'))return;
    const r2=await fetch('/api/admin-clean-duplicate-businesses?key='+encodeURIComponent(KEY)+'&action=execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
    const d2=await r2.json();
    if(!d2.ok){alert('실행 실패: '+(d2.error||'unknown'));return}
    alert('✅ '+d2.deleted+'개 사업장 삭제 완료'+(d2.primary_reassigned&&d2.primary_reassigned.length?'\n주 사업장 재지정: '+d2.primary_reassigned.length+'건':''));
    /* 현재 열린 거래처 대시보드가 있으면 새로고침 */
    if(typeof currentProfileUserId!=='undefined' && currentProfileUserId && typeof openCustomerDashboard==='function'){
      openCustomerDashboard(currentProfileUserId);
    }
  }catch(err){alert('오류: '+err.message)}
}

/* 📱 관리자/스태프 상담방 입력창 '+' 첨부 시트 — 모바일에서만 활성 */
function toggleRoomAttachSheet(){
  const sheet=document.getElementById('roomAttachSheet');
  const btn=document.getElementById('roomAttachBtn');
  if(!sheet)return;
  if(sheet.classList.contains('open')){
    closeRoomAttachSheet();
  }else{
    sheet.classList.add('open');
    if(btn)btn.classList.add('on');
  }
}
function closeRoomAttachSheet(){
  const sheet=document.getElementById('roomAttachSheet');
  const btn=document.getElementById('roomAttachBtn');
  if(sheet)sheet.classList.remove('open');
  if(btn)btn.classList.remove('on');
}

/* ===== SPA 뒤로가기 지원 — 메타 12종 #7 Phase S3b (2026-05-04, 사장님 명령) =====
 *  popstate 핸들러: 브라우저 뒤로가기/앞으로가기 시 history.state.adminTab 보고 tab 재호출.
 *  _tabBypassPushState=true 로 setting → 무한 루프 방지 (다시 history.pushState 안 함).
 *
 *  사용 방법: 자동. admin.html 진입 → tab('chat') 자동 호출 → history 첫 entry 등록.
 *  사용자가 '거래처' 탭 클릭 → tab('users') → history push → URL #tab=users
 *  뒤로가기 → popstate → adminTab='chat' → tab('chat') 재호출 → 이전 탭 복원. */
window.addEventListener('popstate', function(e){
  try{
    var t = (e.state && e.state.adminTab) || null;
    /* state 없으면 hash 보고 결정 (페이지 새로고침 시) */
    if(!t){
      var m = location.hash.match(/^#tab=(\w+)$/);
      if(m) t = m[1];
    }
    if(t && typeof tab === 'function'){
      _tabBypassPushState = true;
      tab(t);
    }
  }catch(err){console.warn('[popstate]', err)}
});

/* ===== Phase F2 (2026-05-05): 모바일 햄버거 토글 — viewport <768 에서 슬라이드 in/out ===== */
function toggleAdminSidebar(forceState){
  var sb = document.getElementById('adminSidebar');
  var bd = document.getElementById('adminSidebarBackdrop');
  if(!sb) return;
  var willOpen = forceState !== undefined ? !!forceState : !sb.classList.contains('open');
  if(willOpen){
    sb.classList.add('open');
    if(bd) bd.classList.add('open');
  } else {
    sb.classList.remove('open');
    if(bd) bd.classList.remove('open');
  }
}

/* ===== Phase S3c-1 (2026-05-04): 좌측 사이드바 클릭 핸들러 + 카운트 갱신 =====
 *  사장님 명령: office 폐기 + admin 단일화. office 의 사이드바 디자인을 admin 으로 흡수.
 *  callAdmin / callAdminSeq (iframe 통신) 폐기 — admin 안에서 직접 함수 호출.
 *  Phase F2: 모바일에서 사이드바 항목 클릭 시 자동 close (slide out). */
function _adminSidebarClick(e){
  var it = e.target.closest('.of-sb-item');
  if(!it) return;
  /* Phase F2: 모바일 (sb 가 open 상태) 에서 항목 클릭 시 자동 close */
  if(window.innerWidth < 768){
    setTimeout(function(){ toggleAdminSidebar(false); }, 100);
  }

  /* 사용자 카테고리 (data-mode + data-status) */
  if(it.dataset.mode === 'user' && it.dataset.status){
    var status = it.dataset.status;
    if(typeof currentStatus !== 'undefined') currentStatus = status;
    if(typeof tab === 'function') tab('users');
    if(typeof setClientTabMode === 'function') setClientTabMode('user');
    if(typeof loadUsers === 'function') loadUsers(status);
    /* 사이드바 active state */
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    return;
  }

  /* Phase M8 (2026-05-05 사장님 명령): 관리자방 — internal 방 자동 진입
   * Phase M8-fix (loadRoomDetail args 무시): openRoom(roomId) 사용
   * Phase M12 (2026-05-05 사장님 보고: "사이드바 색깔 안 칠해지고 + 관리자방이다 딱 알수있도록"):
   *   - tab('rooms') 후 active 유지 (tab 함수가 data-admin-tab='rooms' 로 set 해버려서 다시 fix)
   *   - body.internal-room-mode 추가 — UI 단순화 (상담방개설·액션·라벨탭 hide) */
  if(it.dataset.adminTab === 'internal'){
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    fetch('/api/admin-internal-room?key=' + encodeURIComponent(KEY))
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d.ok){ alert('관리자방 진입 실패: ' + (d.error || 'unknown')); return; }
        document.body.classList.add('internal-room-mode');
        if(typeof tab === 'function') tab('rooms');
        setTimeout(function(){
          if(typeof openRoom === 'function') openRoom(d.room_id);
          else if(typeof loadRoomDetail === 'function'){ window.currentRoomId = d.room_id; loadRoomDetail(); }
          /* M12 fix: tab() 가 active 를 'rooms' 로 set 했으니 internal 로 재조정 */
          document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
          var internalBtn = document.querySelector('.of-sb-item[data-admin-tab="internal"]');
          if(internalBtn) internalBtn.classList.add('on');
        }, 300);
      })
      .catch(function(e){ alert('오류: ' + e.message); });
    return;
  }

  /* Phase M12: internal 모드에서 다른 사이드바 항목 클릭 시 internal-room-mode 해제 */
  if(it.dataset.adminTab && it.dataset.adminTab !== 'internal'){
    document.body.classList.remove('internal-room-mode');
  }
  if(it.dataset.mode || it.id === 'sbSearchBtn' || it.id === 'sbTrashBtn' || it.id === 'sbMyTodosBtn' || it.id === 'sbBulkSendBtn'){
    document.body.classList.remove('internal-room-mode');
  }

  /* Phase M17 (2026-05-05 사장님 보고: "관리자방 → 상담방 들어가면 자동으로 관리자방 카톡이 남아있음.. 처음 상담방 들어가면 목록만 뜨도록"):
   * data-admin-tab="rooms" 클릭 시 detail view 강제 reset (currentRoomId / roomMessages / show-chat / polling). */
  if(it.dataset.adminTab === 'rooms'){
    try{
      window.currentRoomId = null;
      var rl = document.getElementById('roomsLayout'); if(rl) rl.classList.remove('show-chat');
      var rm = document.getElementById('roomMessages'); if(rm) rm.innerHTML = '';
      var rt = document.getElementById('roomChatTitle'); if(rt) rt.textContent = '좌측 상담방을 선택하세요';
      var ra = document.getElementById('roomActions'); if(ra) ra.style.display = 'none';
      var rmm = document.getElementById('roomMembers'); if(rmm) rmm.style.display = 'none';
      var ria = document.getElementById('roomInputArea'); if(ria) ria.style.display = 'none';
      var rmb = document.getElementById('roomMenuBtn'); if(rmb) rmb.style.display = 'none';
      var rpb = document.getElementById('roomPopoutBtn'); if(rpb) rpb.style.display = 'none';
      /* 폴링 멈춤 — admin-rooms-list.js 의 roomMsgPollTimer */
      if(typeof roomMsgPollTimer !== 'undefined' && roomMsgPollTimer){
        clearInterval(roomMsgPollTimer); window.roomMsgPollTimer = null;
      }
    }catch(_){}
  }

  /* Phase M9 (2026-05-05): users-user / users-biz 토글 — users 탭 + mode 전환 */
  if(it.dataset.adminTab === 'users-user'){
    if(typeof tab === 'function') tab('users');
    if(typeof setClientTabMode === 'function') setClientTabMode('user');
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    return;
  }
  if(it.dataset.adminTab === 'users-biz'){
    if(typeof tab === 'function') tab('users');
    if(typeof setClientTabMode === 'function') setClientTabMode('business');
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    return;
  }

  /* Phase M4 (2026-05-05): 전역검색 — onclick attribute 가 없어졌으니 여기서 핸들 */
  if(it.id === 'sbSearchBtn'){
    if(typeof openSearch === 'function') openSearch();
    return;
  }

  /* Phase M15 (2026-05-05): 빠른 메모 — 사이드바 📒 메모 클릭 → 거래처/업체 검색 모달 */
  if(it.id === 'sbQuickMemoBtn'){
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    if(typeof openQuickMemoModal === 'function') openQuickMemoModal();
    return;
  }

  /* admin 탭 (data-admin-tab) */
  if(it.dataset.adminTab){
    var tabName = it.dataset.adminTab;
    if(typeof tab === 'function') tab(tabName);
    document.querySelectorAll('.of-sb-item').forEach(function(b){ b.classList.remove('on') });
    it.classList.add('on');
    return;
  }
}

/* 사이드바 click listener — DOMContentLoaded 후 등록 */
(function(){
  function _bindSidebar(){
    var sb = document.getElementById('adminSidebar');
    if(sb && !sb.dataset.bound){
      sb.dataset.bound = '1';
      sb.addEventListener('click', _adminSidebarClick);
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bindSidebar);
  else _bindSidebar();
})();

/* 사이드바 collapsible 섹션 토글 (의존: localStorage) */
(function(){
  var KEY = 'admin_sb_collapsed_v1';
  function load(){ try{ return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }catch(_){ return new Set(); } }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(Array.from(s))); }catch(_){} }
  function apply(){
    var s = load();
    document.querySelectorAll('.of-sb-section[data-section-key]').forEach(function(sec){
      var k = sec.dataset.sectionKey;
      if(s.has(k)) sec.classList.add('collapsed');
      else sec.classList.remove('collapsed');
    });
  }
  function bind(){
    document.querySelectorAll('.of-sb-section[data-section-key]').forEach(function(sec){
      if(sec.dataset.bound) return;
      sec.dataset.bound = '1';
      sec.addEventListener('click', function(){
        var k = sec.dataset.sectionKey;
        var s = load();
        if(s.has(k)){ s.delete(k); sec.classList.remove('collapsed'); }
        else{ s.add(k); sec.classList.add('collapsed'); }
        save(s);
      });
    });
    apply();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

/* Phase M1 (2026-05-05 사장님 보고: 휴지통 안 눌러짐): 사이드바 액션 버튼 6개 click 핸들러
 * 이전엔 office.js 라인 265-278 에 있었지만 admin 단일화 (S3c) 후 office.js 미로드 → 무반응.
 * callAdmin('openX') 도 더 이상 필요 없음 (admin.js 에서 직접 호출). */
(function(){
  function _bindSbActionBtns(){
    var pairs = [
      ['sbTrashBtn',     function(){ if(typeof openTrash==='function') openTrash(); else alert('휴지통 — 함수 미정의'); }],
      ['sbMyTodosBtn',   function(){ if(typeof openMyTodos==='function') openMyTodos(); else alert('내 일정 — 함수 미정의'); }],
      ['sbTermReqBtn',   function(){ if(typeof openTerminationRequests==='function') openTerminationRequests(); else alert('종료 요청 — 함수 미정의'); }],
      ['sbBulkSendBtn',  function(){ if(typeof openBulkSend==='function') openBulkSend(); else alert('단체발송 — 함수 미정의'); }],
      ['sbSearchBtn',    function(){ if(typeof openSearch==='function') openSearch(); else alert('전역 검색 — 함수 미정의'); }],
      ['sbPcNotifyBtn',  function(){ if(typeof togglePcNotify==='function') togglePcNotify(); else alert('PC 알림 토글 — 준비중'); }],
    ];
    pairs.forEach(function(p){
      var el = document.getElementById(p[0]);
      if(el && !el.dataset.sbBound){
        el.dataset.sbBound = '1';
        el.addEventListener('click', function(e){ e.stopPropagation(); p[1](); });
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bindSbActionBtns);
  else _bindSbActionBtns();
  /* 로그인 직후에도 한 번 더 (사이드바 DOM 이 동적 표시되는 경우 대비) */
  setTimeout(_bindSbActionBtns, 500);
  setTimeout(_bindSbActionBtns, 1500);
})();

/* 사이드바 카운트 갱신 (대기/기장/거절/종료/관리자 + 휴지통 + 종료 요청) */
function refreshSidebarCounts(){
  if(!KEY) return;
  /* 사용자 카운트 (admin-approve 한 번에 모든 status)
   * Phase M9 (2026-05-05): 5개 status 카운트 → 사용자 총합·업체 총합 2개 표시.
   * 메인 영역 탭바에서 status 별 필터 가능. */
  fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=pending').then(function(r){return r.json()}).then(function(d){
    var c = d.counts || {};
    /* 사용자 총합 = pending + approved_client + approved_guest + rejected + terminated + admin */
    var userTotal = (c.pending||0) + (c.approved_client||0) + (c.approved_guest||0) + (c.rejected||0) + (c.terminated||0) + (c.admin||0);
    var elU = document.getElementById('sbUserTotal');
    if(elU) elU.textContent = userTotal;
  }).catch(function(_){});

  /* 업체 총합 — admin-businesses?count_only=1 (없으면 list length) */
  fetch('/api/admin-businesses?key='+encodeURIComponent(KEY)).then(function(r){return r.json()}).then(function(d){
    var bizTotal = Array.isArray(d.businesses) ? d.businesses.length : (d.total || 0);
    var elB = document.getElementById('sbBizTotal');
    if(elB) elB.textContent = bizTotal;
  }).catch(function(_){});

  /* 휴지통 */
  fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=trash_count').then(function(r){return r.json()}).then(function(d){
    var el = document.getElementById('sbCntTrash'); if(el) el.textContent = d.count || 0;
  }).catch(function(_){});

  /* 내 일정 (오늘 + 오버듀 + 3일 이내) */
  fetch('/api/memos?key='+encodeURIComponent(KEY)+'&scope=my&only_mine=1').then(function(r){return r.json()}).then(function(d){
    var arr = (d.memos || []).filter(function(m){
      if(!m.due_date) return false;
      var today = new Date(Date.now() + 9*60*60*1000); today.setHours(0,0,0,0);
      var limit = new Date(today.getTime() + 3*86400000);
      var dt = new Date(m.due_date + 'T00:00:00+09:00');
      return dt <= limit;
    });
    var el = document.getElementById('sbCntTodo'); if(el) el.textContent = arr.length;
  }).catch(function(_){});

  /* 종료 요청 */
  fetch('/api/admin-termination-requests?key='+encodeURIComponent(KEY)+'&status=pending').then(function(r){return r.json()}).then(function(d){
    var el = document.getElementById('sbCntTermReq'); if(el) el.textContent = (d.requests || []).length || 0;
  }).catch(function(_){});
}
/* login 후 + 30초 마다 카운트 갱신 (refreshPendingBadge 시점에 같이) */
(function(){
  var iv = null;
  /* 사용자 KEY 변경 감지 — 로그인 후 자동 시작 */
  var prevKey = '';
  setInterval(function(){
    if(KEY && KEY !== prevKey){
      prevKey = KEY;
      refreshSidebarCounts();
      if(iv) clearInterval(iv);
      iv = setInterval(refreshSidebarCounts, 30000);
    } else if(!KEY && prevKey){
      prevKey = '';
      if(iv){ clearInterval(iv); iv = null; }
    }
  }, 1000);
})();

/* 페이지 첫 진입 시 hash 가 #tab=X 면 자동 tab 전환 */
(function(){
  try{
    var m = location.hash.match(/^#tab=(\w+)$/);
    if(m && typeof tab === 'function'){
      /* DOMContentLoaded 후에 호출 — login 끝나고 mainView 표시되면 */
      var attempt = 0;
      var iv = setInterval(function(){
        attempt++;
        var mainView = document.getElementById('mainView');
        if(mainView && mainView.style.display !== 'none'){
          clearInterval(iv);
          _tabBypassPushState = true;  /* 첫 진입 — pushState 안 함 (replace 대신 그냥 skip) */
          tab(m[1]);
        } else if(attempt > 50){
          clearInterval(iv);  /* 10초 후 포기 (login 안 됨) */
        }
      }, 200);
    }
  }catch(_){}
})();
