/* ===== admin-rooms-msg.js — 메시지 컨텍스트 메뉴 + 영수증 승인 + 첨부 대기열 + send (쪼개기 Step 5b) =====
 * 사장님 명령 (2026-05-02): "쪼개기 한다음에" — Step 5 sub-step b.
 *
 * 분리 범위 (admin.js → admin-rooms-msg.js, ~632줄):
 *  - 메시지 컨텍스트 메뉴: roomReplyingTo / showMsgCtxMenu / hideMsgCtxMenu / cancelRoomReply
 *  - 영수증 승인·반려: approveReceipt / rejectReceipt / 등
 *  - 첨부 대기열: 첨부 프리뷰 + sendRoomMessage / sendRoomImage / sendRoomImageFile / sendRoomFile
 *  - 검색 / 통화: openRoomSearch / callRoom / setRoomPhone
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, escape helpers
 *  - admin-rooms-list.js: currentRoomId / currentRoomMembers / currentRoomPhone / loadRoomDetail / loadRoomList
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js → admin-rooms-list.js → admin-rooms-msg.js */

/* ===== 메시지 컨텍스트 메뉴 (long-press/right-click) + 답장·복사 ===== */
var roomReplyingTo=null; /* {mid, sender, text} */

function showMsgCtxMenu(bubbleEl, x, y){
  const m=$g('msgCtxMenu');if(!m||!m.style)return;
  const mid=bubbleEl.getAttribute('data-msg')||'';
  const sender=bubbleEl.getAttribute('data-sender')||'';
  const text=bubbleEl.getAttribute('data-text')||'';
  const mine=bubbleEl.getAttribute('data-mine')==='1';
  const deletable=bubbleEl.getAttribute('data-deletable')==='1';
  const kind=bubbleEl.getAttribute('data-kind')||'text';
  const imgSrc=bubbleEl.getAttribute('data-img-src')||'';
  m.dataset.msg=mid;m.dataset.sender=sender;m.dataset.text=text;m.dataset.kind=kind;m.dataset.imgSrc=imgSrc;
  let items='';
  /* 답장·복사는 텍스트가 있거나 (사진/영수증/파일처럼) 의미있는 preview 가 있으면 노출 */
  const hasContent = !!text || kind!=='text';
  if(hasContent)items+='<button class="msg-ctx-item" onclick="doReplyFromMenu()">↩︎ 답장</button>';
  if(hasContent)items+='<button class="msg-ctx-item" onclick="doCopyFromMenu()">📋 복사</button>';
  if(mid)items+='<button class="msg-ctx-item" onclick="doToggleBookmark('+mid+')">⭐ 북마크</button>';
  /* 관리자는 누구 메시지든 영수증으로 변환 가능 */
  if(kind==='img'||kind==='file'){
    items+='<button class="msg-ctx-item" onclick="convertMsgToReceiptAdmin('+mid+')">🧾 영수증으로 변환</button>';
  }
  /* 🔍 AI 확인 — 이미지만 (유료 · 세무사 클릭 시만 호출) */
  if(kind==='img'){
    items+='<button class="msg-ctx-item" onclick="aiConfirmImage('+mid+')">🔍 AI 확인</button>';
  }
  if(mine&&deletable)items+='<button class="msg-ctx-item danger" onclick="hideMsgCtxMenu();deleteAdminMessage('+mid+')">🗑️ 삭제</button>';
  if(!items)return;
  m.innerHTML=items;
  m.classList.add('show');
  const rect=m.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  const left=Math.max(8, Math.min(x-rect.width/2, vw-rect.width-8));
  let top=Math.max(8, Math.min(y-rect.height-8, vh-rect.height-8));
  if(y-rect.height-8<8)top=Math.min(y+8, vh-rect.height-8);
  m.style.left=left+'px';m.style.top=top+'px';
  if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}
}
function hideMsgCtxMenu(){const m=$g('msgCtxMenu');if(m&&m.classList)m.classList.remove('show')}
function doReplyFromMenu(){
  const m=$g('msgCtxMenu');if(!m||!m.dataset)return;
  doReplyTo(parseInt(m.dataset.msg||'0',10), m.dataset.sender||'', m.dataset.text||'');
}
function doCopyFromMenu(){
  const m=$g('msgCtxMenu');if(!m||!m.dataset)return;
  const kind=m.dataset.kind||'';
  const imgSrc=m.dataset.imgSrc||'';
  if(kind==='img' && imgSrc){
    doCopyImage(imgSrc);
    return;
  }
  doCopyMsg(m.dataset.text||'');
}
/* 사진 자체를 클립보드에 복사 — 카톡/메모 붙여넣기 시 실제 이미지로 전송됨.
   1) navigator.clipboard.write(ClipboardItem) 시도 (Chrome/Edge/iOS16+/Android)
   2) 실패 → Web Share API (모바일) 로 공유 시트
   3) 둘 다 실패 → URL 텍스트 복사 (최종 fallback) */
async function doCopyImage(url){
  hideMsgCtxMenu();
  _adminShowToast('🔄 사진 복사 중...');
  try{
    const resp=await fetch(url,{cache:'no-store',credentials:'same-origin'});
    if(!resp.ok)throw new Error('fetch failed: '+resp.status);
    let blob=await resp.blob();
    if(!blob.type.startsWith('image/'))throw new Error('not an image');
    /* Safari·일부 브라우저는 PNG만 수용. JPEG 등은 Canvas 로 재인코딩 */
    if(blob.type!=='image/png'){
      try{blob=await _convertImageToPng(blob)}catch(_){}
    }
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]);
      _adminShowToast('📋 사진이 복사되었습니다');
      return;
    }
    throw new Error('ClipboardItem not supported');
  }catch(errClip){
    /* 모바일 Web Share fallback */
    try{
      const resp2=await fetch(url,{cache:'no-store',credentials:'same-origin'});
      const blob2=await resp2.blob();
      const nm=(url.split('/').pop()||'photo').split('?')[0].slice(0,80)||'photo.jpg';
      const file=new File([blob2],nm,{type:blob2.type||'image/jpeg'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({files:[file]});
        return;
      }
    }catch(_){}
    /* 최종 fallback: URL 텍스트 */
    doCopyMsg(url);
  }
}
function _convertImageToPng(blob){
  return new Promise(function(resolve,reject){
    const objUrl=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=function(){
      const c=document.createElement('canvas');
      c.width=img.naturalWidth||img.width;
      c.height=img.naturalHeight||img.height;
      try{c.getContext('2d').drawImage(img,0,0)}catch(e){URL.revokeObjectURL(objUrl);return reject(e)}
      c.toBlob(function(b){URL.revokeObjectURL(objUrl);b?resolve(b):reject(new Error('toBlob'))},'image/png');
    };
    img.onerror=function(e){URL.revokeObjectURL(objUrl);reject(e)};
    img.src=objUrl;
  });
}
function _adminShowToast(msg){
  try{
    let t=document.getElementById('adminToast');
    if(!t){
      t=document.createElement('div');t.id='adminToast';
      t.style.cssText='position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;border-radius:20px;font-size:.85em;z-index:11001;pointer-events:none;opacity:0;transition:opacity .2s';
      document.body.appendChild(t);
    }
    t.textContent=msg;t.style.opacity='1';
    clearTimeout(t._hideT);t._hideT=setTimeout(()=>{t.style.opacity='0'},1800);
  }catch(_){}
}
function doReplyTo(mid,sender,text){
  if(_pendingAttachments && _pendingAttachments.length){
    if(!confirm('첨부한 사진이 있습니다. 답장을 하려면 첨부를 취소해야 합니다. 계속할까요?')){hideMsgCtxMenu();return}
    _pendingAttachments.forEach(p=>{try{URL.revokeObjectURL(p.previewUrl)}catch(_){}});
    _pendingAttachments=[];_renderPendingAttachments();
  }
  roomReplyingTo={mid:mid, sender:sender, text:String(text).slice(0,100)};
  const bar=$g('roomReplyBar');
  $g('roomReplyToName').textContent=sender;
  $g('roomReplyPreview').textContent=roomReplyingTo.text;
  if(bar&&bar.classList)bar.classList.add('show');
  hideMsgCtxMenu();
  const inp=$g('roomInput');if(inp&&inp.focus)inp.focus();
}
function cancelRoomReply(){
  roomReplyingTo=null;
  const bar=$g('roomReplyBar');if(bar&&bar.classList)bar.classList.remove('show');
}
async function doCopyMsg(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy')}catch(_){}
    ta.remove();
  }
  hideMsgCtxMenu();
  try{
    /* 간단한 플로팅 토스트 */
    let t=document.getElementById('adminToast');
    if(!t){
      t=document.createElement('div');t.id='adminToast';
      t.style.cssText='position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:10px 18px;border-radius:20px;font-size:.85em;z-index:11001;pointer-events:none;opacity:0;transition:opacity .2s';
      document.body.appendChild(t);
    }
    t.textContent='📋 복사되었습니다';t.style.opacity='1';
    setTimeout(()=>{t.style.opacity='0'},1500);
  }catch(_){}
}
/* 이벤트 위임: long-press(모바일) + contextmenu(데스크톱)
 * Phase R11 (2026-05-06 사장님 보고: "PWA에서는 되는데 인터넷 브라우저에서는 안된다"):
 * 이전엔 #roomMessages 에 listener 등록 → admin-modals.html fetch 늦으면 init() fail.
 * Fix: document-level 위임 — IIFE 시작 즉시 등록, .rc-msg-bubble 동적 매칭. */
(function(){
  let lpTimer=null, lpX=0, lpY=0;
  document.addEventListener('touchstart',function(e){
    const b=e.target.closest('.rc-msg-bubble');if(!b)return;
    const t=e.touches[0];lpX=t.clientX;lpY=t.clientY;
    lpTimer=setTimeout(()=>{
      lpTimer=null;
      /* 사진 타일 onclick(openImgViewer) 이 long-press 직후 같이 터지는 것 차단 */
      window._lpJustFired=true;
      setTimeout(function(){window._lpJustFired=false},600);
      if(typeof showMsgCtxMenu==='function') showMsgCtxMenu(b, lpX, lpY);
    }, 450);
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(lpTimer){
      const t=e.touches[0];
      if(Math.abs(t.clientX-lpX)>8||Math.abs(t.clientY-lpY)>8){clearTimeout(lpTimer);lpTimer=null}
    }
  },{passive:true});
  document.addEventListener('touchend',()=>{if(lpTimer){clearTimeout(lpTimer);lpTimer=null}});
  document.addEventListener('touchcancel',()=>{if(lpTimer){clearTimeout(lpTimer);lpTimer=null}});
  document.addEventListener('contextmenu',function(e){
    const b=e.target.closest('.rc-msg-bubble');if(!b)return;
    e.preventDefault();
    if(typeof showMsgCtxMenu==='function') showMsgCtxMenu(b, e.clientX, e.clientY);
  });
  document.addEventListener('click',function(e){
    if(e.target.closest('.msg-ctx-menu'))return;
    if(typeof hideMsgCtxMenu==='function') hideMsgCtxMenu();
  });
  document.addEventListener('scroll', function(){
    if(typeof hideMsgCtxMenu==='function') hideMsgCtxMenu();
  }, true);
})();

/* ===== 영수증 승인·반려 ===== */
async function approveDoc(docId, btnEl){
  if(!docId)return;
  const card=btnEl?btnEl.closest('[data-doc-id]'):null;
  const vendor=card?card.querySelector('[data-field="vendor"]').value.trim():undefined;
  const amount=card?parseInt(card.querySelector('[data-field="amount"]').value,10)||null:undefined;
  const receipt_date=card?card.querySelector('[data-field="receipt_date"]').value.trim()||null:undefined;
  const category=card?card.querySelector('[data-field="category"]').value||null:undefined;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId,vendor,amount,receipt_date,category})});
    const d=await r.json();
    if(d.ok){loadRoomDetail()}
    else alert('승인 실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}
async function rejectDocPrompt(docId){
  if(!docId)return;
  const reason=prompt('반려 사유 (고객에게 표시됩니다)','');
  if(!reason||!reason.trim())return;
  try{
    const r=await fetch('/api/admin-documents?key='+encodeURIComponent(KEY)+'&action=reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:docId,reason:reason.trim()})});
    const d=await r.json();
    if(d.ok){loadRoomDetail()}
    else alert('반려 실패: '+(d.error||'unknown'));
  }catch(e){alert('오류: '+e.message)}
}

/* 이 방에서 대화 검색 — 정보 모달의 검색 탭으로 바로 진입 */
function openRoomSearch(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  if(typeof openRoomInfo==='function')openRoomInfo();
  setTimeout(function(){
    if(typeof switchRiTab==='function')switchRiTab('search');
    var i=$g('riSearchInput');
    if(i&&i.focus){i.value='';i.focus()}
  },80);
}

/* 관리자/스태프 → 거래처 사장에게 전화: 방 멤버 중 사장(left_at 없음)의 users.phone 사용 */
function callRoom(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  /* 사장 후보: 나간 상태 아닌 멤버 중 phone 있는 사람. 여러 명이면 첫 번째 */
  const candidates=(currentRoomMembers||[]).filter(m=>!m.left_at&&m.phone);
  if(!candidates.length){
    alert('이 방 멤버에 등록된 전화번호가 없습니다.\n회원가입 시 입력한 번호가 없거나 멤버가 나간 상태입니다.');
    return;
  }
  let picked=candidates[0];
  if(candidates.length>1){
    const list=candidates.map((m,i)=>(i+1)+') '+(m.real_name||m.name||'이름없음')+' — '+m.phone).join('\n');
    const choice=prompt('전화 걸 멤버 번호를 선택하세요:\n\n'+list+'\n\n번호 입력 (1~'+candidates.length+')','1');
    if(choice===null)return;
    const idx=parseInt(choice,10)-1;
    if(idx<0||idx>=candidates.length){alert('잘못된 선택');return}
    picked=candidates[idx];
  }
  const a=document.createElement('a');
  a.href='tel:'+String(picked.phone).replace(/[^\d+]/g,'');
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){a.remove()},100);
}
/* 방별 "전담 세무사 직통번호" 설정 — 거래처 사장 화면의 📞 버튼이 이 번호로 연결됨 */
async function setRoomPhone(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const cur=currentRoomPhone||'';
  const input=prompt(
    '이 방 전담 세무사 직통번호를 입력하세요.\n'+
    '거래처 사장이 📞 버튼 누르면 이 번호로 연결됩니다.\n'+
    '비우고 확인 → 기본 대표번호('+DEFAULT_COMPANY_PHONE+') 사용',
    cur
  );
  if(input===null)return;
  const phone=input.trim();
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=set_phone',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:currentRoomId,phone:phone})
    });
    const d=await r.json();
    if(d.ok){
      currentRoomPhone=d.phone||null;
      if(typeof showAdminToast==='function')showAdminToast(phone?'✅ 전담 직통번호 저장':'✅ 삭제 (대표번호로 연결)');
      else alert(phone?'저장됨':'삭제됨');
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* 내가 방금 보낸 메시지는 상단 보고 있어도 강제 스크롤 플래그 */
var adminForceScrollOnNext=false;
var adminForceLiveScrollOnNext=false;
/* 첨부 대기열 — 붙여넣기/드래그한 이미지는 바로 전송하지 않고 여기 쌓였다가 전송 버튼 누를 때 일괄 전송 */
var _pendingAttachments=[]; /* [{file, previewUrl}] */

async function sendRoomMessage(){
  if(!currentRoomId)return;
  const input=$g('roomInput');
  let content=input.value.trim();
  const pending=_pendingAttachments.slice();
  if(!content && !pending.length)return;
  /* 답장 + 첨부 동시 금지 (서버 포맷 한계) */
  if(pending.length && roomReplyingTo){
    alert('답장하면서 사진 첨부는 불가합니다.\n답장을 취소하거나 사진을 빼주세요.');
    return;
  }
  const replyMeta = roomReplyingTo ? {t:roomReplyingTo.text, s:roomReplyingTo.sender, i:roomReplyingTo.mid} : null;
  input.value='';input.style.height='auto';
  _pendingAttachments=[];_renderPendingAttachments();
  cancelRoomReply();
  adminForceScrollOnNext=true;

  try{
    if(pending.length){
      /* 이미지 순차 업로드·전송. 캡션(content) 은 마지막 1장에만 붙여 카톡처럼 "사진 아래 한 줄" 로 보이게 */
      for(let i=0;i<pending.length;i++){
        const fd=new FormData();fd.append('file',pending[i].file);
        const upR=await fetch('/api/upload-image?key='+encodeURIComponent(KEY),{method:'POST',body:fd});
        const upD=await upR.json();
        if(!upD.ok){alert('사진 '+(i+1)+'장 업로드 실패: '+(upD.error||'unknown'));continue}
        const body={room_id:currentRoomId,image_url:upD.url};
        if(i===pending.length-1 && content)body.content=content;
        const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const d=await r.json();
        if(!d.ok){alert('사진 '+(i+1)+'장 전송 실패: '+(d.error||'unknown'))}
      }
      pending.forEach(p=>{try{URL.revokeObjectURL(p.previewUrl)}catch(_){}});
      await loadRoomDetail();
      const _c=$g('roomMessages');
      if(_c)_c.scrollTop=_c.scrollHeight;
      setTimeout(function(){const c2=$g('roomMessages');if(c2)c2.scrollTop=c2.scrollHeight;},80);
      return;
    }

    /* 텍스트만 — 낙관적 렌더링 */
    let finalContent=content;
    if(replyMeta)finalContent='[REPLY]'+JSON.stringify(replyMeta)+'\n'+finalContent;
    const optId='opt-'+Date.now();
    _adminInsertOptimisticBubble(optId, finalContent);
    try{
      const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,content:finalContent})});
      const d=await r.json();
      if(d.ok){
        _adminRemoveOptimisticBubble(optId);
        await loadRoomDetail();
        const _c=$g('roomMessages');
        if(_c)_c.scrollTop=_c.scrollHeight;
        setTimeout(function(){const c2=$g('roomMessages');if(c2)c2.scrollTop=c2.scrollHeight;},80);
      } else {
        _adminMarkOptimisticFailed(optId, d.error||'unknown');
      }
    }catch(err){
      _adminMarkOptimisticFailed(optId, err.message);
    }
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 첨부 대기열 프리뷰 ===== */
function _renderPendingAttachments(){
  let bar=document.getElementById('roomAttachPreview');
  if(_pendingAttachments.length===0){if(bar)bar.style.display='none';return}
  if(!bar){
    const area=document.getElementById('roomInputArea');if(!area)return;
    bar=document.createElement('div');
    bar.id='roomAttachPreview';
    bar.style.cssText='padding:8px 12px;border-top:1px solid #e5e8eb;background:#f9fafb;display:flex;gap:8px;overflow-x:auto';
    area.parentNode.insertBefore(bar,area);
  }
  bar.style.display='flex';
  bar.innerHTML=_pendingAttachments.map(function(a,i){
    return '<div style="position:relative;flex-shrink:0">'
      +'<img src="'+a.previewUrl+'" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid #e5e8eb;display:block">'
      +'<button onclick="_removePendingAttach('+i+')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;background:#000;color:#fff;border:none;border-radius:50%;font-size:.72em;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center" aria-label="제거">×</button>'
      +'</div>';
  }).join('');
}
function _removePendingAttach(i){
  const a=_pendingAttachments[i];
  if(a && a.previewUrl){try{URL.revokeObjectURL(a.previewUrl)}catch(_){}}
  _pendingAttachments.splice(i,1);
  _renderPendingAttachments();
}
function _addPendingAttachments(files){
  const arr=Array.from(files||[]).filter(f=>f&&f.type&&f.type.indexOf('image/')===0);
  if(!arr.length)return;
  for(const f of arr){
    if(_pendingAttachments.length>=10){alert('한 번에 최대 10장까지');break}
    _pendingAttachments.push({file:f, previewUrl:URL.createObjectURL(f)});
  }
  _renderPendingAttachments();
  const inp=document.getElementById('roomInput');if(inp)inp.focus();
}
function _adminInsertOptimisticBubble(optId, content){
  const c=document.getElementById('roomMessages');if(!c)return;
  const now=new Date(Date.now()+9*60*60*1000);
  const hh=now.getHours(), mm=String(now.getMinutes()).padStart(2,'0');
  const ap=hh<12?'오전':'오후'; const h12=hh%12||12;
  const time=ap+' '+h12+':'+mm;
  const div=document.createElement('div');
  div.id=optId;
  div.style.cssText='display:flex;justify-content:flex-end;align-items:flex-end;gap:6px;margin-bottom:12px';
  /* 메시지 본문 렌더 (내 regex 재활용 — 간이) */
  const safeText=String(content).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  div.innerHTML='<div style="font-size:.68em;color:#9ca3af;white-space:nowrap;padding-bottom:2px" data-opt-status>⏱ '+time+'</div>'
    +'<div style="display:inline-block;background:#FEE500;color:#191f28;padding:9px 12px;border-radius:16px 4px 16px 16px;max-width:75%;font-size:.9em;white-space:pre-wrap;word-break:break-word;opacity:.7">'+safeText+'</div>';
  c.appendChild(div);
  c.scrollTop=c.scrollHeight;
}
function _adminRemoveOptimisticBubble(optId){
  const el=document.getElementById(optId);if(el)el.remove();
}
function _adminMarkOptimisticFailed(optId, reason){
  const el=document.getElementById(optId);if(!el)return;
  const status=el.querySelector('[data-opt-status]');
  if(status){status.innerHTML='🔴 전송 실패';status.style.color='#dc2626';status.style.fontWeight='700';status.title=reason||''}
  const bubble=el.querySelector('[style*="FEE500"]');
  if(bubble){bubble.style.opacity='1';bubble.style.border='1px solid #dc2626'}
}

async function deleteAdminMessage(messageId){
  if(!currentRoomId||!messageId)return;
  if(!confirm('이 메시지를 삭제하시겠어요?\n(삭제 후 "삭제된 메시지입니다" 표시됩니다)'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=delete_message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,message_id:messageId})});
    const d=await r.json();
    if(d.ok)loadRoomDetail();
    else alert('삭제 실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function sendRoomImage(fileInput){
  if(!currentRoomId)return;
  const file=fileInput.files[0];
  fileInput.value='';
  if(!file)return;
  await sendRoomImageFile(file);
}
async function sendRoomImageFile(file){
  if(!currentRoomId||!file)return;
  if(file.size>10*1024*1024){alert('10MB 이하 이미지만 업로드 가능합니다');return}
  try{
    const fd=new FormData();fd.append('file',file);
    const r=await fetch('/api/upload-image?key='+encodeURIComponent(KEY),{method:'POST',body:fd});
    const d=await r.json();
    if(!d.ok){alert('업로드 실패: '+(d.error||'unknown'));return}
    const r2=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,image_url:d.url})});
    const d2=await r2.json();
    if(d2.ok)loadRoomDetail();
    else alert('전송 실패: '+(d2.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
/* 메시지 입력칸 클립보드(Ctrl+V) + 드래그앤드롭 첨부 — 관리자
   카톡식 UX: 바로 전송하지 않고 _pendingAttachments 에 쌓아 프리뷰 표시. 전송 버튼으로 일괄 발송
   Phase R10-fix (2026-05-05 사장님 보고: '또 복사라고 뜨잖아'):
   drop/dragover document-level listener 는 init() 밖으로 빼서 즉시 등록 — admin-modals.html fetch 전에도 등록되도록. */
(function(){
  function isImage(f){return f&&f.type&&f.type.indexOf('image/')===0}
  /* === document-level drag&drop (즉시 등록 — init 무관) === */
  let _dropOverlay=null, _dropDepth=0;
  function _showDropOverlay(){
    if(_dropOverlay)return;
    _dropOverlay=document.createElement('div');
    _dropOverlay.id='admDropOverlay';
    _dropOverlay.style.cssText='position:fixed;inset:0;background:rgba(49,130,246,.18);border:3px dashed #3182f6;pointer-events:none;z-index:99999;display:flex;align-items:center;justify-content:center;color:#1e3a8a;font-size:1.4em;font-weight:800';
    _dropOverlay.textContent='📎 놓으면 첨부됩니다 (사진·파일 다 가능)';
    document.body.appendChild(_dropOverlay);
  }
  function _hideDropOverlay(){if(_dropOverlay){_dropOverlay.remove();_dropOverlay=null}}
  document.addEventListener('dragenter',function(e){
    if(!e.dataTransfer||!Array.from(e.dataTransfer.types||[]).includes('Files'))return;
    e.preventDefault();
    if(typeof currentRoomId==='undefined'||!currentRoomId)return;
    _dropDepth++;_showDropOverlay();
  });
  document.addEventListener('dragover',function(e){
    /* Files 가 있을 때만 preventDefault — text drag 등은 영향 X */
    if(!e.dataTransfer||!Array.from(e.dataTransfer.types||[]).includes('Files'))return;
    e.preventDefault();  /* 항상 — 브라우저 default '복사' 표시 차단 */
  });
  document.addEventListener('dragleave',function(){_dropDepth--;if(_dropDepth<=0){_dropDepth=0;_hideDropOverlay()}});
  document.addEventListener('drop',function(e){
    if(!e.dataTransfer||!Array.from(e.dataTransfer.types||[]).includes('Files'))return;
    e.preventDefault();  /* 항상 — 다운로드·복사 차단 */
    _dropDepth=0;_hideDropOverlay();
    if(typeof currentRoomId==='undefined'||!currentRoomId){
      alert('상담방을 먼저 선택하세요\n(좌측 list 에서 클릭)');
      return;
    }
    const files=e.dataTransfer.files||[];
    if(!files.length)return;
    const imgs=Array.from(files).filter(isImage);
    const docs=Array.from(files).filter(f=>!isImage(f));
    if(imgs.length && typeof _addPendingAttachments==='function') _addPendingAttachments(imgs);
    if(docs.length) docs.forEach(function(f){ if(typeof sendRoomFileDirect==='function') sendRoomFileDirect(f); });
  });

  function init(){
    const input=document.getElementById('roomInput');
    const area=document.getElementById('roomInputArea');
    if(!input||!area)return false;
    input.addEventListener('paste',function(e){
      if(!currentRoomId)return;
      const files=(e.clipboardData&&e.clipboardData.files)||[];
      const imgs=Array.from(files).filter(isImage);
      if(!imgs.length)return;
      e.preventDefault();
      _addPendingAttachments(imgs);
    });
    /* drag&drop listener 는 IIFE 시작 시 document-level 로 이미 등록됨 (R10-fix). */
    return true;
  }
  if(!init())document.addEventListener('DOMContentLoaded',init);
})();

/* 대용량 파일 청크 업로드 (300MB까지, 50MB × 병렬 4) — admin 버전 */
async function uploadFileChunkedAdmin(file, onProgress){
  const CHUNK=50*1024*1024;
  const PARALLEL=4;
  const _t0=Date.now();
  const s=await fetch('/api/upload-multipart?action=start&key='+encodeURIComponent(KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:file.name,size:file.size,type:file.type||'application/octet-stream'})
  });
  const sd=await s.json();
  if(!sd.ok)throw new Error(sd.error||'업로드 시작 실패');
  const {key,uploadId}=sd;
  const totalParts=Math.ceil(file.size/CHUNK);
  const parts=new Array(totalParts);
  const loadedPerPart=new Array(totalParts).fill(0);
  function reportProgress(){
    if(!onProgress)return;
    let done=0;for(let j=0;j<totalParts;j++)done+=loadedPerPart[j];
    const pct=Math.min(100,Math.round(done/file.size*100));
    const finished=parts.filter(Boolean).length;
    const elapsed=(Date.now()-_t0)/1000;
    const mbps=elapsed>0.3?(done/1024/1024/elapsed):0;
    const eta=mbps>0.1?Math.max(0,Math.round((file.size-done)/1024/1024/mbps)):null;
    onProgress(pct,finished,totalParts,mbps,eta);
  }
  function uploadOnePart(i){
    return new Promise((resolve,reject)=>{
      const start=i*CHUNK, end=Math.min(start+CHUNK,file.size);
      const chunk=file.slice(start,end), partNumber=i+1;
      const xhr=new XMLHttpRequest();
      xhr.open('POST','/api/upload-multipart?action=part&k='+encodeURIComponent(key)+'&uploadId='+encodeURIComponent(uploadId)+'&partNumber='+partNumber+'&key='+encodeURIComponent(KEY));
      xhr.upload.onprogress=ev=>{
        if(!ev.lengthComputable)return;
        loadedPerPart[i]=ev.loaded;reportProgress();
      };
      xhr.onload=()=>{
        if(xhr.status>=200&&xhr.status<300){
          try{
            const j=JSON.parse(xhr.responseText);
            if(!j.ok)return reject(new Error(j.error||'part 실패'));
            parts[i]={partNumber:j.partNumber,etag:j.etag};
            loadedPerPart[i]=end-start;reportProgress();
            resolve();
          }catch(e){reject(new Error('응답 파싱 실패'))}
        } else {
          try{const err=JSON.parse(xhr.responseText);reject(new Error(err.error||('HTTP '+xhr.status)))}
          catch(e){reject(new Error('HTTP '+xhr.status))}
        }
      };
      xhr.onerror=()=>reject(new Error('네트워크 오류 (part '+partNumber+')'));
      xhr.send(chunk);
    });
  }
  try{
    let nextIdx=0;
    async function worker(){
      while(true){
        const i=nextIdx++;
        if(i>=totalParts)break;
        await uploadOnePart(i);
      }
    }
    const workers=[];
    for(let w=0;w<Math.min(PARALLEL,totalParts);w++)workers.push(worker());
    await Promise.all(workers);
    const c=await fetch('/api/upload-multipart?action=complete&key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key,uploadId,parts,name:file.name,size:file.size,type:file.type,room_id:currentRoomId})
    });
    const cd=await c.json();
    if(!cd.ok)throw new Error(cd.error||'완료 실패');
    if(cd.msgError)console.warn('메시지 생성 실패(업로드는 성공):',cd.msgError);
    return cd;
  }catch(err){
    try{await fetch('/api/upload-multipart?action=abort&key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,uploadId})})}catch{}
    throw err;
  }
}

/* Phase R9 (2026-05-05 사장님 명령): drag&drop 으로 받은 File 직접 전송 helper */
async function sendRoomFileDirect(file){
  if(!currentRoomId||!file)return;
  /* fileInput 호환 — 기존 sendRoomFile 흐름 재사용 위해 가짜 input 만듦 */
  const fakeInput = { files: [file], value: '' };
  return sendRoomFile(fakeInput);
}

async function sendRoomFile(fileInput){
  if(!currentRoomId)return;
  const file=fileInput.files[0];
  fileInput.value='';
  if(!file)return;
  if(file.size>300*1024*1024){alert('300MB 이하만 업로드 가능합니다');return}
  try{
    if(file.size<=95*1024*1024){
      /* 기존 단일 업로드 */
      const fd=new FormData();fd.append('file',file);
      const r=await fetch('/api/upload-file?key='+encodeURIComponent(KEY),{method:'POST',body:fd});
      const d=await r.json();
      if(!d.ok){alert('업로드 실패: '+(d.error||'unknown'));return}
      const r2=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,file_url:d.url,file_name:d.name,file_size:d.size})});
      const d2=await r2.json();
      if(d2.ok)loadRoomDetail();
      else alert('전송 실패: '+(d2.error||'unknown'));
    } else {
      /* 대용량 청크 업로드 — 고정 진행 바 */
      let bar=document.getElementById('admUploadBar');
      if(!bar){
        bar=document.createElement('div');
        bar.id='admUploadBar';
        bar.style.cssText='position:fixed;left:20px;right:20px;bottom:20px;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e8eb;border-radius:12px;padding:12px 16px;z-index:10000;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:.86em;color:#191f28';
        document.body.appendChild(bar);
      }
      bar.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px"><b>📤 '+e(file.name)+'</b><span id="_auPct">0%</span></div>'
        +'<div style="height:6px;background:#e5e8eb;border-radius:4px;overflow:hidden"><div id="_auBar" style="width:0%;height:100%;background:#3182f6;transition:width .2s"></div></div>'
        +'<div id="_auMeta" style="margin-top:6px;color:#8b95a1;font-size:.9em">준비 중...</div>';
      try{
        await uploadFileChunkedAdmin(file,(pct,cur,total,mbps,eta)=>{
          const pctEl=document.getElementById('_auPct');if(pctEl)pctEl.textContent=pct+'%';
          const barEl=document.getElementById('_auBar');if(barEl)barEl.style.width=pct+'%';
          const meta=document.getElementById('_auMeta');
          if(meta){
            const parts=[cur+'/'+total+' 청크'];
            if(mbps>0.1)parts.push(mbps.toFixed(1)+' MB/s');
            if(eta!=null&&eta>0)parts.push('약 '+(eta>=60?Math.round(eta/60)+'분':eta+'초')+' 남음');
            meta.textContent=parts.join(' · ');
          }
        });
        if(typeof showAdminToast==='function')showAdminToast('✅ 업로드 완료');
        loadRoomDetail();
      }finally{
        const bar2=document.getElementById('admUploadBar');if(bar2)bar2.remove();
      }
    }
  }catch(err){alert('오류: '+err.message)}
}

