/* ===== admin-rooms-misc.js — 상담방 정보 모달 + 멤버 + 생성 + 실시간 + AI 요약 (쪼개기 Step 5c) =====
 * 사장님 명령 (2026-05-02): "쪼개기 한다음에" — Step 5 sub-step c (마지막).
 *
 * 분리 범위 (admin.js → admin-rooms-misc.js, ~995줄):
 *  - 정보 모달 (검색·사진·링크·파일·게시판): openRoomInfo / closeRoomInfo / loadRoomMedia / loadRoomFiles / loadRoomNotices
 *                                              / riSearchTimer + 검색
 *  - 이름변경 / 상태변경 / 삭제: renameRoom / toggleRoomStatus / deleteCurrentRoom / terminateCurrentRoomClient
 *  - 방 생성: openCreateRoom / filterRoomUsers / createRoom / crSelectedUsers (Step 5a 와 cross)
 *  - 멤버 관리 모달: openRoomMembersModal / closeRoomMembersModal / removeRoomMember
 *  - 실시간 대화 개입: loadLiveSessions / openLiveSession / deleteLiveSession / startLivePolling / stopLivePolling
 *  - AI 대화 요약: openRoomSummary / runRoomSummary / closeRoomSummary / regenerateRoomSummary / copyRoomSummary
 *                  / postSummaryToRoom / jumpToRoomMessage
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, tab, fileIconFor
 *  - admin-rooms-list.js: currentRoomId / currentRoomStatus / loadRoomDetail / loadRoomList / openRoom
 *  - admin-rooms-msg.js: sendRoomMessage 등 (cross-step 호출)
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html — staff.html 은 redirect):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js
 *   → admin-rooms-list.js → admin-rooms-msg.js → admin-rooms-misc.js */

/* ===== 상담방 정보 모달 (검색·사진·링크·파일·게시판) ===== */
var riSearchTimer=null;
function openRoomInfo(){
  if(!currentRoomId){alert('상담방을 먼저 선택해 주세요');return}
  const m=$g('roomInfoModal');
  $g('riTitle').textContent='상담방 정보';
  $g('riSearchInput').value='';
  $g('riSearchList').innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">검색어를 입력하세요</div>';
  $g('riPhotoGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  $g('riLinkList').innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  switchRiTab('search');
  m.style.display='flex';
  loadRoomMedia();
}
function switchRiTab(t){
  document.querySelectorAll('#roomInfoModal .ri-tab').forEach(function(b){b.classList.toggle('on',b.dataset.tab===t)});
  $g('riSearchPanel').style.display=t==='search'?'block':'none';
  $g('riPhotoPanel').style.display=t==='photo'?'block':'none';
  $g('riLinkPanel').style.display=t==='link'?'block':'none';
  $g('riFilePanel').style.display=t==='file'?'block':'none';
  $g('riNoticePanel').style.display=t==='notice'?'block':'none';
  const bm=$g('riBookmarkPanel'); if(bm)bm.style.display=t==='bookmark'?'block':'none';
  if(t==='search')setTimeout(function(){$g('riSearchInput').focus()},100);
  if(t==='file')loadRoomFiles();
  if(t==='notice')loadRoomNotices();
  if(t==='bookmark')loadRoomBookmarks();
}
function onRiSearchInput(){
  if(riSearchTimer)clearTimeout(riSearchTimer);
  riSearchTimer=setTimeout(doRiSearch,250);
}
async function doRiSearch(){
  const q=$g('riSearchInput').value.trim();
  const el=$g('riSearchList');
  if(q.length<2){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">2자 이상 입력하세요</div>';return}
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&search='+encodeURIComponent(q));
    const d=await r.json();
    if(!d.matches||d.matches.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">결과 없음</div>';return}
    const qRe=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
    const header='<div style="padding:6px 4px 10px;font-size:.78em;color:#6b7280;font-weight:600">총 '+d.matches.length+'건 매칭 — 결과를 누르면 해당 메시지로 이동</div>';
    el.innerHTML=header+d.matches.map(function(m){
      const who=m.role==='human_advisor'?'👨‍💼 세무사':m.role==='assistant'?'🤖 AI':'👤 '+(m.real_name||m.name||'사용자');
      let content=String(m.content||'');
      const imgMatch=content.match(/^\[IMG\]\S+\n?([\s\S]*)$/);
      if(imgMatch)content='[사진] '+imgMatch[1];
      const escaped=e(content).slice(0,200);
      const hi=escaped.replace(qRe,'<mark>$1</mark>');
      return '<div class="ri-match" onclick="jumpFromSearch('+m.id+')" style="cursor:pointer" title="클릭하면 원본 메시지로 이동"><div class="ri-who">'+who+' · '+e(m.created_at||'')+' · <span style="color:#3182f6">↗ 이동</span></div>'+hi+'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}
/* 검색 결과 클릭 → 정보 패널 닫고 원본 메시지로 스크롤·하이라이트 */
function jumpFromSearch(mid){
  const m=$g('roomInfoModal');
  if(m)m.style.display='none';
  setTimeout(function(){
    if(typeof jumpToOriginalMsgAdmin==='function')jumpToOriginalMsgAdmin(String(mid));
  },80);
}
async function loadRoomMedia(){
  const photoEl=$g('riPhotoGrid');
  const linkEl=$g('riLinkList');
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=media');
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    if(d.error) throw new Error(d.error);
    if(!d.photos||d.photos.length===0){
      photoEl.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">사진 없음</div>';
    } else {
      photoEl.innerHTML=d.photos.map(function(m){
        const match=String(m.content||'').match(/^\[IMG\](\S+)/);
        const url=match?match[1]:'';
        if(!url)return '';
        return '<div class="ri-photo" style="cursor:zoom-in"><img class="rc-img-msg" src="'+e(url)+'" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onclick="openImgViewer(this.src,collectImagesNear(this))"></div>';
      }).join('');
    }
    if(!d.links||d.links.length===0){
      linkEl.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">링크 없음</div>';
    } else {
      linkEl.innerHTML=d.links.map(function(l){
        const who=l.role==='human_advisor'?'세무사':l.role==='assistant'?'AI':(l.user_name||'사용자');
        return '<div class="ri-link-item"><a href="'+e(l.url)+'" target="_blank" rel="noopener">'+e(l.url)+'</a><div class="ri-meta">'+who+' · '+e(l.created_at||'')+'</div></div>';
      }).join('');
    }
  }catch(err){
    /* fix (2026-05-07): 이전 console.error 만 → 사용자가 영원히 "불러오는 중" 봄. UI 에러 표시 추가 */
    console.error('[loadRoomMedia]', err);
    const errMsg='<div style="grid-column:1/-1;text-align:center;color:#dc2626;font-size:.8em;padding:30px 0">불러오기 실패: '+e(err.message||'')+'</div>';
    if(photoEl) photoEl.innerHTML=errMsg;
    if(linkEl) linkEl.innerHTML=errMsg;
  }
}

async function loadRoomFiles(){
  const el=$g('riFileList');
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=files');
    const d=await r.json();
    if(!d.files||d.files.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">파일 없음</div>';return}
    el.innerHTML=d.files.map(function(m){
      let obj=null;try{const mm=String(m.content||'').match(/^\[FILE\](\{[^\n]+\})/);if(mm)obj=JSON.parse(mm[1])}catch{}
      if(!obj)return '';
      const who=m.role==='human_advisor'?'세무사':m.role==='assistant'?'AI':(m.real_name||m.name||'사용자');
      const nm=obj.name||'파일';
      return '<a href="'+e(obj.url||'#')+'" download="'+e(nm)+'" onclick="if(!confirm(\'파일을 다운로드 하시겠습니까?\')){event.preventDefault();return false}" class="ri-link-item" style="display:flex;gap:10px;text-decoration:none;color:inherit;align-items:center">'
        +'<div style="font-size:1.7em;line-height:1">'+fileIconFor(nm)+'</div>'
        +'<div style="flex:1;min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(nm)+'</div>'
        +'<div class="ri-meta">'+fmtSize(obj.size)+' · '+who+' · '+e(m.created_at||'')+'</div></div></a>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}

async function loadRoomNotices(){
  const el=$g('riNoticeList');
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=notices');
    const d=await r.json();
    if(!d.notices||d.notices.length===0){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.8em;padding:30px 0">등록된 공지 없음</div>';return}
    el.innerHTML=d.notices.map(function(n){
      const pinMark=n.pinned?'<span style="background:#fef3c7;color:#8b6914;font-size:.68em;padding:2px 7px;border-radius:4px;font-weight:700;margin-right:6px">📌 고정</span>':'';
      const contentEsc=e(n.content||'').replace(/\n/g,'<br>');
      return '<div class="ri-link-item" style="padding:12px">'
        +'<div style="font-weight:700;font-size:.88em;margin-bottom:4px">'+pinMark+e(n.title)+'</div>'
        +'<div style="font-size:.8em;line-height:1.55;margin-bottom:6px">'+contentEsc+'</div>'
        +'<div class="ri-meta">'+e(n.created_at||'')+(n.updated_at&&n.updated_at!==n.created_at?' · (수정 '+e(n.updated_at)+')':'')+'</div>'
        +'<div style="display:flex;gap:6px;margin-top:8px">'
        +'<button onclick="toggleNoticePin('+n.id+','+(n.pinned?0:1)+')" style="flex:1;background:'+(n.pinned?'#fef3c7':'#f2f4f6')+';border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">'+(n.pinned?'고정 해제':'📌 고정')+'</button>'
        +'<button onclick="openNoticeForm('+n.id+',\''+e(n.title).replace(/\'/g,"\\'")+'\',\''+e(n.content).replace(/\'/g,"\\'").replace(/\n/g,"\\n")+'\')" style="flex:1;background:#f2f4f6;border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">수정</button>'
        +'<button onclick="deleteNotice('+n.id+')" style="flex:1;background:#fee2e2;color:#f04452;border:none;padding:6px;border-radius:6px;font-size:.72em;cursor:pointer;font-family:inherit">삭제</button>'
        +'</div></div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}

var editingNoticeId=null;
function openNoticeForm(id,title,content){
  editingNoticeId=id;
  $g('nfTitle').textContent=id?'공지 수정':'공지 작성';
  $g('nfTitleInput').value=title||'';
  $g('nfContent').value=content||'';
  $g('noticeFormModal').style.display='flex';
}
async function submitNotice(){
  const title=$g('nfTitleInput').value.trim();
  const content=$g('nfContent').value.trim();
  if(!title||!content){alert('제목과 내용을 입력해 주세요');return}
  const action=editingNoticeId?'notice_update':'notice_create';
  const body={room_id:currentRoomId,title,content};
  if(editingNoticeId)body.notice_id=editingNoticeId;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(d.ok){$g('noticeFormModal').style.display='none';loadRoomNotices()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
async function toggleNoticePin(id,pinned){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=notice_pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,notice_id:id,pinned:pinned})});
    const d=await r.json();
    if(d.ok)loadRoomNotices();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
async function deleteNotice(id){
  if(!confirm('공지를 삭제하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=notice_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,notice_id:id})});
    const d=await r.json();
    if(d.ok)loadRoomNotices();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function renameRoom(){
  if(!currentRoomId)return;
  const current=$g('roomChatTitle').textContent.replace(/\(.*\)/,'').trim();
  const name=prompt('새 상담방 이름:',current);
  if(!name||!name.trim())return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,name:name.trim()})});
    const d=await r.json();
    if(d.ok){loadRoomDetail();loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function toggleRoomStatus(){
  if(!currentRoomId)return;
  const act=currentRoomStatus==='active'?'close':'reopen';
  if(!confirm(act==='close'?'상담방을 종료하시겠어요? (대화기록은 유지됩니다)':'상담방을 재개하시겠어요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action='+act,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId})});
    const d=await r.json();
    if(d.ok){loadRoomDetail();loadRoomList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteCurrentRoom(){
  if(!currentRoomId)return;
  if(!confirm('🗑️ 이 상담방과 모든 대화기록을 영구 삭제합니다.\n(대화·멤버·게시판·메시지 모두 삭제 · 복구 불가)\n계속할까요?'))return;
  if(!confirm('정말 삭제하시겠습니까? 마지막 확인입니다.'))return;
  const rid=currentRoomId;
  try{
    /* POST action=delete_room 우선 시도 — DELETE 메서드가 일부 프록시에서 막히는 경우 대비 */
    let r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=delete_room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:rid})});
    let d;
    try{d=await r.json()}catch(_){d={error:'응답 파싱 실패 (HTTP '+r.status+')'}}
    /* 서버가 action=delete_room 미지원이면 구 DELETE 방식 fallback */
    if(!r.ok && (r.status===400||r.status===404)){
      r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(rid),{method:'DELETE'});
      try{d=await r.json()}catch(_){d={error:'응답 파싱 실패 (HTTP '+r.status+')'}}
    }
    if(!r.ok){
      alert('삭제 실패 (HTTP '+r.status+'): '+(d.error||'unknown')+'\n권한: owner 전용입니다. 직원 계정이면 대표님께 요청하세요.');
      return;
    }
    if(!d.ok){alert('삭제 실패: '+(d.error||'unknown'));return}
    currentRoomId=null;
    try{$g('roomChatTitle').textContent='좌측 상담방을 선택하세요'}catch(_){}
    try{$g('roomMessages').innerHTML=''}catch(_){}
    try{$g('roomMembers').style.display='none'}catch(_){}
    try{$g('roomActions').style.display='none'}catch(_){}
    try{$g('roomInputArea').style.display='none'}catch(_){}
    try{$g('roomsLayout').classList.remove('show-chat')}catch(_){}
    if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
    _adminShowToast('🗑️ 상담방 삭제됨');
    loadRoomList();
  }catch(err){alert('오류: '+err.message)}
}

/* === 방 생성 모달 === */
async function openCreateRoom(){
  $g('crName').value='';
  $g('crSearch').value='';
  $g('crMaxMembers').value='10';
  $g('crMax').textContent='10';
  crSelectedUsers={};
  $g('crSelectedCount').textContent='0';
  $g('createRoomModal').style.display='flex';
  /* 거래처(기장·일반) 사용자 로딩. 관리자는 방 생성 시 서버에서 자동 참여되므로 선택 리스트에 포함 X */
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_client');
    const d1=await r.json();
    const r2=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_guest');
    const d2=await r2.json();
    const users=[...(d1.users||[]),...(d2.users||[])];
    window._crAllUsers=users;
    renderCrUsers(users);
  }catch{$g('crUserList').innerHTML='<div style="padding:10px;color:#f04452">로딩 실패</div>'}
}

function renderCrUsers(users){
  const el=$g('crUserList');
  if(users.length===0){el.innerHTML='<div style="padding:10px;color:#8b95a1;font-size:.8em">사용자 없음</div>';return}
  el.innerHTML=users.map(u=>{
    const nm=u.real_name||u.name||'이름없음';
    const checked=crSelectedUsers[u.id]?'checked':'';
    const badge=u.approval_status==='approved_client'?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:1px 5px;border-radius:4px;margin-left:4px">기장</span>':'<span style="font-size:.65em;background:#e8f3ff;color:#3182f6;padding:1px 5px;border-radius:4px;margin-left:4px">일반</span>';
    return '<label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-bottom:1px solid #f2f4f6"><input type="checkbox" '+checked+' onchange="toggleCrUser('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')"><span style="font-size:.85em">'+e(nm)+'</span>'+badge+'<span style="font-size:.7em;color:#8b95a1;margin-left:auto">'+e(u.phone||'')+'</span></label>';
  }).join('');
}

function toggleCrUser(uid,nm){
  const max=parseInt($g('crMaxMembers').value,10);
  if(crSelectedUsers[uid]){delete crSelectedUsers[uid]}
  else{
    if(Object.keys(crSelectedUsers).length>=max){alert('최대 '+max+'명까지 선택 가능합니다');renderCrUsers(window._crAllUsers);return}
    crSelectedUsers[uid]=nm;
  }
  $g('crSelectedCount').textContent=Object.keys(crSelectedUsers).length;
}

function filterRoomUsers(){
  const q=$g('crSearch').value.trim();
  const users=window._crAllUsers||[];
  if(!q){renderCrUsers(users);return}
  renderCrUsers(users.filter(u=>((u.real_name||'')+u.name+(u.phone||'')).indexOf(q)>=0));
}

async function createRoom(){
  const name=$g('crName').value.trim();
  const ids=Object.keys(crSelectedUsers).map(Number);
  /* 거래처 0명 허용 — 관리자끼리 틀만 먼저 만들 수도 있음.
     확인만 한 번 더 묻고 진행. 서버는 멤버 0명 허용. 관리자는 자동 참여 */
  if(ids.length===0){
    if(!confirm('거래처를 한 명도 선택하지 않았습니다.\n관리자끼리만 들어있는 빈 방을 먼저 만드시겠어요?\n(나중에 참여자 초대 가능)'))return;
  }
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name||'상담방',max_members:Number($g('crMaxMembers').value),member_user_ids:ids})});
    const d=await r.json();
    if(d.ok){
      $g('createRoomModal').style.display='none';
      await loadRoomList();
      openRoom(d.room_id);
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 👥 상담방 참여자 관리 모달 ===== */
async function openRoomMembersModal(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const m=$g('roomMembersModal');if(!m)return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  const rn=$g('rmmRoomName');if(rn)rn.textContent=currentRoomId;
  await _rmmLoad();
}
function closeRoomMembersModal(){
  const m=$g('roomMembersModal');if(m)m.style.display='none';
  document.body.style.overflow='';
}
async function _rmmLoad(){
  const el=$g('rmmBody');if(!el)return;
  el.innerHTML='<div style="text-align:center;color:#8b95a1;padding:40px 0;font-size:.88em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const members=(d.members||[]).filter(m=>!m.left_at);
    currentRoomMembers=members;
    const admins=members.filter(m=>m.role==='admin');
    const others=members.filter(m=>m.role!=='admin');
    let html='';
    html+='<div style="font-size:.76em;font-weight:700;color:#8b6914;margin:6px 2px 4px">👑 관리자 ('+admins.length+')</div>';
    if(admins.length){
      html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;overflow:hidden;margin-bottom:14px">'
        +admins.map(function(m){
          const nm=e(m.real_name||m.name||'이름없음');
          const av=m.profile_image?'<img src="'+escAttr(m.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="">':'<div style="width:32px;height:32px;border-radius:50%;background:#8b6914;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em">'+(nm[0]||'?')+'</div>';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f2f4f6">'
            +av
            +'<div style="flex:1;min-width:0"><div style="font-size:.9em;font-weight:600">'+nm+(m.role==='admin'?' <span style="font-size:.7em;color:#8b6914">관리자</span>':'')+'</div>'
            +(m.phone?'<div style="font-size:.72em;color:#8b95a1">'+e(m.phone)+'</div>':'')+'</div>'
            +'</div>';
        }).join('').replace(/border-bottom:1px solid #f2f4f6"><\/div>$/,'"></div>')
        +'</div>';
    }
    html+='<div style="font-size:.76em;font-weight:700;color:#1e40af;margin:6px 2px 4px">🏢 거래처 참여자 ('+others.length+')</div>';
    if(!others.length){
      html+='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.82em;background:#fff;border:1px solid #e5e8eb;border-radius:10px">참여 중인 거래처가 없습니다. 아래 [＋ 참여자 초대] 로 추가하세요.</div>';
    } else {
      html+='<div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;overflow:hidden">'
        +others.map(function(m){
          const nm=e(m.real_name||m.name||'이름없음');
          const safeName=escAttr(m.real_name||m.name||'');
          const av=m.profile_image?'<img src="'+escAttr(m.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover" alt="">':'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85em">'+(nm[0]||'?')+'</div>';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f2f4f6">'
            +av
            +'<div style="flex:1;min-width:0"><div style="font-size:.9em;font-weight:600;cursor:pointer" onclick="closeRoomMembersModal();openCustomerDashboard('+m.user_id+')">'+nm+' <span style="font-size:.7em;color:#3b82f6">📋</span></div>'
            +(m.phone?'<div style="font-size:.72em;color:#8b95a1">'+e(m.phone)+'</div>':'')+'</div>'
            +'<button onclick="removeRoomMember('+m.user_id+',\''+safeName.replace(/\'/g,'')+'\')" title="이 참여자를 상담방에서 내보내기" style="background:#fee2e2;color:#dc2626;border:none;padding:5px 10px;border-radius:6px;font-size:.75em;cursor:pointer;font-family:inherit;flex-shrink:0">🚪 내보내기</button>'
            +'</div>';
        }).join('')
        +'</div>';
    }
    el.innerHTML=html;
  }catch(err){el.innerHTML='<div style="color:#f04452;padding:20px;font-size:.85em">오류: '+e(err.message)+'</div>'}
}
async function removeRoomMember(userId, displayName){
  if(!currentRoomId||!userId)return;
  if(!confirm('🚪 '+(displayName||'이 참여자')+' 을(를) 이 상담방에서 내보냅니다.\n\n(거래처 자체는 유지, 이 방에서만 나가게 됩니다)\n계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=remove_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,user_id:userId})});
    const d=await r.json();
    if(!d.ok){alert('실패: '+(d.error||'unknown'));return}
    _rmmLoad();
    if(typeof loadRoomDetail==='function')loadRoomDetail();
  }catch(err){alert('오류: '+err.message)}
}

async function addMemberPrompt(){
  if(!currentRoomId)return;
  try{
    const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_client');
    const d1=await r.json();
    const r2=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=approved_guest');
    const d2=await r2.json();
    const users=[...(d1.users||[]),...(d2.users||[])];
    // 이미 방에 있는 멤버 제외
    const roomData=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+currentRoomId).then(x=>x.json());
    const currentIds=new Set((roomData.members||[]).filter(m=>!m.left_at).map(m=>m.user_id));
    const available=users.filter(u=>!currentIds.has(u.id));
    if(available.length===0){alert('추가 가능한 사용자가 없습니다');return}
    window._amAvailable=available;
    renderAddMemberList(available);
    $g('addMemberModal').style.display='flex';
  }catch(err){alert('오류: '+err.message)}
}

function renderAddMemberList(users){
  const q=($g('amSearch').value||'').trim();
  const filtered=q?users.filter(u=>((u.real_name||'')+u.name+(u.phone||'')).indexOf(q)>=0):users;
  $g('amList').innerHTML=filtered.map(u=>{
    const nm=u.real_name||u.name||'이름없음';
    const badge=u.approval_status==='approved_client'?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:1px 5px;border-radius:4px;margin-left:4px">기장</span>':'<span style="font-size:.65em;background:#e8f3ff;color:#3182f6;padding:1px 5px;border-radius:4px;margin-left:4px">일반</span>';
    return '<div onclick="addMemberPick('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="display:flex;align-items:center;gap:8px;padding:12px;cursor:pointer;border-bottom:1px solid #f2f4f6;transition:.15s" onmouseover="this.style.background=\'#f2f4f6\'" onmouseout="this.style.background=\'#fff\'">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:600">'+nm[0]+'</div>'
      +'<div style="flex:1"><div style="font-size:.88em;font-weight:500">'+e(nm)+badge+'</div><div style="font-size:.72em;color:#8b95a1">'+e(u.phone||'-')+'</div></div>'
      +'<div style="color:#3182f6;font-size:1.2em">＋</div></div>';
  }).join('');
  if(filtered.length===0)$g('amList').innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.85em">검색 결과 없음</div>';
}

function filterAddMember(){renderAddMemberList(window._amAvailable||[])}

function _amSyncVisSince(){
  /* 라디오 선택 반영 — 힌트 텍스트 갱신 */
  const el=document.querySelector('input[name=amVisSince]:checked');
  if(!el)return;
  const h=$g('amVisSinceHint');
  if(el.value==='all')h.textContent='이 사람에게 방의 전체 과거 대화가 보입니다.';
  else if(el.value==='now')h.textContent='이 사람은 초대 시점 이후 메시지만 볼 수 있습니다. (민감정보 포함된 과거 대화 숨김 시 권장)';
  else {
    const d=$g('amVisSinceDate').value;
    h.textContent=d?'이 사람은 '+d+' 00:00 이후 메시지부터 볼 수 있습니다.':'날짜를 선택하세요.';
  }
}
function _amVisibleSinceValue(){
  const el=document.querySelector('input[name=amVisSince]:checked');
  if(!el || el.value==='all')return null;
  if(el.value==='now')return 'now';
  if(el.value==='date'){
    const d=$g('amVisSinceDate').value;
    return d||'now';
  }
  return null;
}
async function addMemberPick(userId,nm){
  const vs=_amVisibleSinceValue();
  try{
    const rr=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=add_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,user_id:userId, visible_since:vs})});
    const dd=await rr.json();
    if(dd.ok){
      $g('addMemberModal').style.display='none';
      loadRoomDetail();loadRoomList();
    }
    else alert('실패: '+(dd.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 실시간 대화 개입 ===== */
var liveCurrentSession=null;
var liveCurrentUserId=null;
var livePollTimer=null;
var liveMsgPollTimer=null;

async function refreshLiveBadge(){
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const b=$g('liveBadge');
    const n=d.total_unread||0;
    if(n>0){b.textContent=n;b.style.display='inline-block'}else{b.style.display='none'}
  }catch{}
}

function startLivePolling(){
  loadLiveSessions();
  if(livePollTimer)clearInterval(livePollTimer);
  livePollTimer=setInterval(loadLiveSessions,10000); // 10초마다 세션 목록 갱신
}
function stopLivePolling(){
  if(livePollTimer)clearInterval(livePollTimer);
  if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
  livePollTimer=null;liveMsgPollTimer=null;
}

async function loadLiveSessions(){
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const el=$g('liveSessionList');
    const totalEl=$g('liveTotalUnread');
    if(d.total_unread>0){totalEl.style.display='inline-block';totalEl.textContent=d.total_unread+' 미확인'}
    else totalEl.style.display='none';
    if(!d.sessions||d.sessions.length===0){el.innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.8em">최근 30분 활성 대화 없음</div>';return}
    el.innerHTML=d.sessions.map(s=>{
      const nm=s.real_name||s.user_name||'이름없음';
      const av=s.profile_image?'<img src="'+e(s.profile_image)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover">':'<div style="width:32px;height:32px;border-radius:50%;background:#3182f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:600">'+nm[0]+'</div>';
      const unread=s.advisor_unread>0?'<span style="background:#f04452;color:#fff;border-radius:8px;padding:1px 6px;font-size:.7em">'+s.advisor_unread+'</span>':'';
      const modeIcon=s.ai_mode==='off'?'👨‍💼':'🤖';
      const active=liveCurrentSession===s.session_id&&liveCurrentUserId===s.user_id?'background:#e8f3ff':'';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;'+active+'">'
        +'<div onclick="openLiveSession(\''+e(s.session_id)+'\','+s.user_id+')" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">'
        +av
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:4px"><span style="font-size:.85em;font-weight:600">'+e(nm)+'</span><span style="font-size:.7em">'+modeIcon+'</span>'+unread+'</div>'
        +'<div style="font-size:.72em;color:#8b95a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(s.last_user_message||'(메시지 없음)')+'</div>'
        +'<div style="font-size:.65em;color:#b0b8c1">'+e(s.last_at||'')+'</div>'
        +'</div></div>'
        +'<button onclick="deleteLiveSession(\''+e(s.session_id)+'\','+s.user_id+',\''+e(nm)+'\')" title="이 대화 삭제" style="background:none;border:none;color:#b0b8c1;font-size:1em;cursor:pointer;padding:6px;border-radius:6px;flex-shrink:0" onmouseover="this.style.background=\'#fee2e2\';this.style.color=\'#f04452\'" onmouseout="this.style.background=\'none\';this.style.color=\'#b0b8c1\'">🗑️</button>'
        +'</div>';
    }).join('');
  }catch(err){$g('liveSessionList').innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

async function openLiveSession(sid,uid){
  liveCurrentSession=sid;liveCurrentUserId=uid;
  $g('liveAiToggle').style.display='block';
  $g('liveInputArea').style.display='flex';
  // 제목에 사용자 이름 표시
  try{
    const lst=document.querySelectorAll('#liveSessionList > div');
    lst.forEach(el=>{
      if(el.innerHTML.indexOf('openLiveSession(\\\''+sid+'\\\','+uid)>=0){
        const nameEl=el.querySelector('span');
        if(nameEl)$g('liveChatTitle').innerHTML='<b>'+nameEl.textContent+'</b>';
      }
    });
  }catch{}
  await loadLiveMessages();
  loadLiveSessions();
  if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
  liveMsgPollTimer=setInterval(loadLiveMessages,2000);
}

async function loadLiveMessages(){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(liveCurrentSession)+'&user_id='+liveCurrentUserId);
    const d=await r.json();
    $g('liveAiOn').checked=d.ai_mode!=='off';
    const container=$g('liveMessages');
    const atBottom=container.scrollHeight-container.scrollTop-container.clientHeight<50;
    container.innerHTML=(d.messages||[]).map(m=>{
      const role=m.role;
      if(role==='user'){
        return '<div style="margin-bottom:10px;display:flex;justify-content:flex-end"><div style="background:#3182f6;color:#fff;padding:10px 14px;border-radius:14px 4px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;opacity:.8;margin-top:4px">'+e(m.created_at||'')+'</div></div></div>';
      } else if(role==='assistant'){
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#fff;border:1px solid #e5e8eb;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">🤖 AI · '+e(m.created_at||'')+'</div></div></div>';
      } else if(role==='human_advisor'){
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#e0f5ec;border:1px solid #86efac;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#10b981;margin-top:4px;font-weight:600"><img src="logo-icon.png" alt="" style="width:12px;height:12px;vertical-align:middle;object-fit:contain;margin-right:3px"> 세무사 · '+e(m.created_at||'')+'</div></div></div>';
      }
      return '';
    }).join('');
    if(atBottom||adminForceLiveScrollOnNext)container.scrollTop=container.scrollHeight;
    adminForceLiveScrollOnNext=false;
    // 세션 목록도 unread 초기화 반영
    refreshLiveBadge();
  }catch(err){
    /* fix (2026-05-07): 이전 console.error 만 → 폴링 시 메시지 안 떠도 사용자 모름. UI 표시 + 콘솔 둘 다 */
    console.error('[loadLiveMessages]', err);
    if(container && !container.children.length){
      container.innerHTML='<div style="text-align:center;color:#dc2626;font-size:.85em;padding:30px 0">메시지 불러오기 실패: '+e(err.message||'')+'<br><button onclick="loadLiveMessages()" style="margin-top:10px;background:#3182f6;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit">🔄 재시도</button></div>';
    }
  }
}

async function sendLiveMessage(){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  const input=$g('liveInput');
  const content=input.value.trim();
  if(!content)return;
  input.value='';
  adminForceLiveScrollOnNext=true;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:liveCurrentSession,user_id:liveCurrentUserId,content:content})});
    const d=await r.json();
    if(d.ok){
      await loadLiveMessages();
      const _c=$g('liveMessages');
      if(_c)_c.scrollTop=_c.scrollHeight;
      setTimeout(function(){const c2=$g('liveMessages');if(c2)c2.scrollTop=c2.scrollHeight;},80);
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteLiveSession(sid,uid,nm){
  if(!confirm('"'+nm+'"님의 대화를 완전히 삭제합니다.\n(메시지·기록 복구 불가)\n계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&session='+encodeURIComponent(sid)+'&user_id='+uid,{method:'DELETE'});
    const d=await r.json();
    if(d.ok){
      if(liveCurrentSession===sid&&liveCurrentUserId==uid){
        liveCurrentSession=null;liveCurrentUserId=null;
        $g('liveMessages').innerHTML='';
        $g('liveChatTitle').textContent='좌측 세션을 선택하세요';
        $g('liveAiToggle').style.display='none';
        $g('liveInputArea').style.display='none';
        if(liveMsgPollTimer)clearInterval(liveMsgPollTimer);
      }
      loadLiveSessions();
      refreshLiveBadge();
    } else {
      alert('삭제 실패: '+(d.error||'unknown'));
    }
  }catch(err){alert('오류: '+err.message)}
}

async function toggleAiMode(isOn){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  try{
    const mode=isOn?'on':'off';
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY)+'&action=toggle_ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:liveCurrentSession,user_id:liveCurrentUserId,ai_mode:mode})});
    const d=await r.json();
    if(!d.ok)alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
/* 손상 문서(R2 빈 파일) 점검 */
/* ===== 상담방 AI 대화 요약 =====
   자동 요약 제거 — 모달 open 시 fetch 안 함.
   기간 선택(selectSummaryRange) → '✨ 요약 생성' 버튼(runRoomSummary) 눌러야 fetch 실행.
   2026-04-21: summary_json (섹션 구조화) 우선 렌더, 없으면 마크다운 폴백. */
var _lastSummaryText='';
var _lastSummaryJson=null;
var _lastSummaryRange='recent';
var _lastSummaryFrom='';
var _lastSummaryTo='';
function _setSummaryRangeUI(range){
  document.querySelectorAll('.rs-range').forEach(b=>{
    const on=b.getAttribute('data-range')===range;
    b.style.background=on?'#191f28':'#e5e8eb';
    b.style.color=on?'#fff':'#555';
    b.style.fontWeight=on?'600':'400';
  });
  /* custom 기간 입력 영역 표시/숨김 */
  const box=$g('rsCustomBox');
  if(box)box.style.display=range==='custom'?'flex':'none';
}
function openRoomSummary(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const modal=$g('roomSummaryModal');
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  modal.style.display='flex';
  document.body.style.overflow='hidden';
  _lastSummaryText='';
  _lastSummaryJson=null;
  body.innerHTML='<div style="text-align:center;padding:40px 20px;color:#8b95a1;font-size:.9em;line-height:1.7">기간을 선택한 뒤<br><b style="color:#10b981">✨ 요약 생성</b> 버튼을 눌러주세요.<br><span style="font-size:.85em;color:#adb5bd">※ 내부 담당자용 실무 정리표가 생성됩니다 (고객에게 자동 공개 X)</span></div>';
  meta.textContent='';
  /* custom 기간 기본값: 오늘·오늘 */
  const today=new Date(Date.now()+9*60*60*1000).toISOString().substring(0,10);
  const fromEl=$g('rsFrom'),toEl=$g('rsTo');
  if(fromEl&&!fromEl.value)fromEl.value=_lastSummaryFrom||today;
  if(toEl&&!toEl.value)toEl.value=_lastSummaryTo||today;
  _setSummaryRangeUI(_lastSummaryRange||'recent');
}
function selectSummaryRange(range){
  _lastSummaryRange=range||'recent';
  _setSummaryRangeUI(_lastSummaryRange);
}
var _rsGenerating=false;
async function runRoomSummary(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  if(_rsGenerating)return; /* 중복 호출 방지 */
  const range=_lastSummaryRange||'recent';
  const body=$g('rsBody');
  const meta=$g('rsMeta');
  let extraQS='';
  let rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체'}[range]||range;
  if(range==='custom'){
    const fromEl=$g('rsFrom'),toEl=$g('rsTo');
    const f=fromEl?fromEl.value:'',t=toEl?toEl.value:'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!/^\d{4}-\d{2}-\d{2}$/.test(t)){alert('시작일·종료일을 모두 선택하세요');return}
    if(f>t){alert('시작일이 종료일보다 늦습니다');return}
    _lastSummaryFrom=f;_lastSummaryTo=t;
    extraQS='&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t);
    rangeLabel=f+' ~ '+t;
  }
  /* 버튼 잠금 — 중복 호출·사용자 혼동 방지 */
  _rsGenerating=true;
  _rsToggleButtons(true);
  body.innerHTML='<div style="text-align:center;padding:40px 0;color:#8b95a1"><div style="display:inline-block;width:22px;height:22px;border:3px solid #e5e8eb;border-top-color:#10b981;border-radius:50%;animation:rsSpin .7s linear infinite;vertical-align:middle;margin-right:8px"></div>🤖 내부 실무 요약 생성 중... (5~20초)</div><style>@keyframes rsSpin{to{transform:rotate(360deg)}}</style>';
  meta.textContent='';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=summarize&room_id='+encodeURIComponent(currentRoomId)+'&range='+encodeURIComponent(range)+extraQS);
    const d=await r.json();
    if(d.error){
      body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 요약 생성 실패</div><div style="font-size:.85em;color:#7f1d1d;margin-bottom:12px">'+e(d.error)+'</div><button onclick="runRoomSummary()" style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:7px 16px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">🔄 다시 시도</button></div>';
      return;
    }
    _lastSummaryText=d.summary||'';
    _lastSummaryJson=d.summary_json||null;
    /* 빈 데이터 상태 (메시지 0건) 별도 안내 */
    if((d.message_count||0)===0){
      body.innerHTML='<div style="padding:40px 20px;text-align:center;color:#8b95a1"><div style="font-size:1.1em;margin-bottom:6px">📭 해당 기간에 대화가 없습니다</div><div style="font-size:.85em;color:#adb5bd">다른 기간을 선택하고 다시 시도해주세요.</div></div>';
      meta.textContent='['+rangeLabel+'] 메시지 0건';
      return;
    }
    /* summary_json 있으면 섹션 카드, 없으면 기존 마크다운 폴백 */
    if(_lastSummaryJson){
      body.innerHTML=_renderSummaryJson(_lastSummaryJson);
    } else if(_lastSummaryText){
      body.innerHTML=renderMarkdownLite(_lastSummaryText);
    } else {
      body.innerHTML='<div style="padding:30px 20px;text-align:center;color:#8b95a1">요약 결과가 비어있습니다.</div>';
    }
    const actualRange=(d.first_at&&d.last_at)?(' · 🗓️ '+d.first_at+' ~ '+d.last_at):'';
    meta.textContent='['+rangeLabel+'] 메시지 '+(d.message_count||0)+'건'+actualRange+' · 비용 ₩'+Math.round((d.cost_cents||0)*14);
  }catch(err){
    body.innerHTML='<div style="padding:30px 20px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><div style="font-size:1.1em;margin-bottom:8px">⚠️ 오류</div><div style="font-size:.85em;color:#7f1d1d;margin-bottom:12px">'+e(err.message)+'</div><button onclick="runRoomSummary()" style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:7px 16px;border-radius:6px;font-size:.85em;cursor:pointer;font-family:inherit">🔄 다시 시도</button></div>';
  }finally{
    _rsGenerating=false;
    _rsToggleButtons(false);
  }
}
/* 요약 관련 버튼 잠금/해제 (생성/복사/게시/다시) */
function _rsToggleButtons(busy){
  const sel=['#roomSummaryModal button[onclick*="runRoomSummary"]',
             '#roomSummaryModal button[onclick*="copyRoomSummary"]',
             '#roomSummaryModal button[onclick*="postSummaryToRoom"]',
             '#roomSummaryModal button[onclick*="regenerateRoomSummary"]'].join(',');
  document.querySelectorAll(sel).forEach(b=>{
    b.disabled=!!busy;
    b.style.opacity=busy?'.55':'';
    b.style.cursor=busy?'wait':'';
  });
  /* 기간 탭도 잠그기 — 생성 중 기간 바꿔 다시 누르는 실수 방지 */
  document.querySelectorAll('.rs-range').forEach(b=>{
    b.disabled=!!busy;
    b.style.opacity=busy?'.55':'';
    b.style.cursor=busy?'wait':'';
  });
}
function closeRoomSummary(){
  /* 거래처/업체 단위 요약 모드 리셋 (openCustomerSummary / _bdRunBusinessSummary 로 열렸을 경우) */
  if(typeof _summaryMode!=='undefined')_summaryMode='room';
  if(typeof _customerSummaryUserId!=='undefined')_customerSummaryUserId=null;
  if(typeof _customerSummaryBusinessId!=='undefined')_customerSummaryBusinessId=null;
  const modal=$g('roomSummaryModal');
  if(modal)modal.style.display='none';
  document.body.style.overflow='';
}
/* 하위 호환: 외부에서 regenerateRoomSummary를 부르던 곳 유지 */
function regenerateRoomSummary(){runRoomSummary()}
async function copyRoomSummary(){
  /* 마크다운 우선, 없으면 JSON 직렬화 */
  let text=_lastSummaryText||'';
  if(!text && _lastSummaryJson){
    try{text=JSON.stringify(_lastSummaryJson,null,2)}catch{}
  }
  try{
    await navigator.clipboard.writeText(text);
    const btn=$g('rsCopyBtn');
    if(btn){const o=btn.textContent;btn.textContent='✅ 복사됨';setTimeout(()=>{btn.textContent=o},1500)}
  }catch(err){alert('복사 실패: '+err.message)}
}

/* 섹션 카드형 렌더 — summary_json 기반 내부 실무 정리표.
   항목은 {text, msgIds} 객체 또는 구형 string 둘 다 허용 (역호환). */
function _renderSummaryJson(j){
  if(!j)return '';
  function _esc(x){return e(String(x==null?'':x))}
  function _normItem(it){
    if(it==null)return null;
    if(typeof it==='string')return {text:it.trim(), msgIds:[]};
    if(typeof it==='object'){
      const t=String(it.text||'').trim();
      if(!t)return null;
      const ids=Array.isArray(it.msgIds)?it.msgIds.filter(x=>Number.isInteger(x)||/^\d+$/.test(String(x))).map(Number):[];
      return {text:t, msgIds:ids};
    }
    return null;
  }
  function _anchors(ids){
    if(!ids||!ids.length)return '';
    return ' '+ids.map(id=>'<a href="javascript:void(0)" onclick="jumpToRoomMessage('+id+')" style="color:#3182f6;text-decoration:none;font-size:.85em;background:#eff6ff;border:1px solid #bfdbfe;padding:0 5px;border-radius:4px;margin-left:3px" title="원본 메시지로 이동">#'+id+'</a>').join('');
  }
  function _sec(title, icon, color, items){
    const arr=(Array.isArray(items)?items:[]).map(_normItem).filter(Boolean);
    const bodyHtml=arr.length
      ? '<ul style="margin:0;padding-left:18px;line-height:1.8;color:#191f28">'+arr.map(it=>'<li style="margin-bottom:3px">'+_esc(it.text)+_anchors(it.msgIds)+'</li>').join('')+'</ul>'
      : '<div style="color:#adb5bd;font-size:.88em">- 없음</div>';
    return '<section style="margin-bottom:14px">'
      +'<div style="font-weight:700;font-size:.92em;color:'+color+';margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      +'<span>'+icon+'</span><span>'+_esc(title)+'</span>'
      +'<span style="margin-left:auto;font-size:.75em;color:#adb5bd;font-weight:500">'+arr.length+'건</span>'
      +'</div>'
      +'<div style="background:#f9fafb;border:1px solid #e5e8eb;border-radius:8px;padding:10px 12px">'+bodyHtml+'</div>'
      +'</section>';
  }
  const o=j.overview||{};
  const overviewHtml='<section style="margin-bottom:14px">'
    +'<div style="font-weight:700;font-size:.92em;color:#191f28;margin-bottom:6px">📋 상담 개요</div>'
    +'<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.88em;line-height:1.6;color:#0f172a">'
    +(o.period?'<div style="color:#64748b">기간</div><div>'+_esc(o.period)+'</div>':'')
    +(o.messageCount!=null?'<div style="color:#64748b">메시지 수</div><div>'+_esc(String(o.messageCount))+'건</div>':'')
    +(o.customerName?'<div style="color:#64748b">고객</div><div>'+_esc(o.customerName)+'</div>':'')
    +(o.purpose?'<div style="color:#64748b">상담 목적</div><div>'+_esc(o.purpose)+'</div>':'')
    +'</div></section>';
  return '<div style="font-size:.9em">'
    +overviewHtml
    +_sec('확정된 핵심 사실','✅','#065f46',j.confirmedFacts)
    +_sec('고객 요청 / 질문','💬','#1e40af',j.customerRequests)
    +_sec('자료 업로드 / 제출 흐름','📎','#6b21a8',j.uploadedMaterials)
    +_sec('확인 필요 사항','❓','#b45309',j.needCheck)
    +_sec('다음 액션','➡️','#be123c',j.nextActions)
    +_sec('특이사항 / 주의사항','⚠️','#334155',j.risks)
    +'</div>';
}
/* 섹션 항목 → 원본 메시지 스크롤·하이라이트 (요약 모달 닫고 방 열기) */
function jumpToRoomMessage(mid){
  if(!mid)return;
  const modal=document.getElementById('roomSummaryModal');
  if(modal)modal.style.display='none';
  document.body.style.overflow='';
  if(typeof jumpToOriginalMsgAdmin==='function'){
    setTimeout(()=>jumpToOriginalMsgAdmin(mid), 120);
  }
}
/* 요약 이력 — 과거 생성된 요약 리스트 중 하나 불러와서 다시 렌더 */
async function openSummaryHistory(){
  if(!currentRoomId){alert('상담방을 먼저 선택하세요');return}
  const body=$g('rsBody');if(!body)return;
  body.innerHTML='<div style="text-align:center;padding:30px 0;color:#8b95a1">🕘 이력 불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=summary_history&room_id='+encodeURIComponent(currentRoomId));
    const d=await r.json();
    const arr=d.summaries||[];
    if(!arr.length){
      body.innerHTML='<div style="text-align:center;padding:40px 16px;color:#8b95a1;font-size:.9em">🕘 저장된 요약 이력이 없습니다.<br><span style="font-size:.85em;color:#adb5bd">기간 선택 후 ✨ 요약 생성 하면 자동 저장됩니다.</span></div>';
      return;
    }
    const rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체',custom:'지정기간'};
    body.innerHTML='<div style="padding:4px 0 8px;font-size:.82em;color:#6b7280">이전 요약 ('+arr.length+'건) — 클릭해서 불러오기</div>'
      +arr.map(s=>{
        const lab=rangeLabel[s.range_type]||s.range_type;
        return '<div onclick="loadSummaryFromHistory('+s.id+')" style="padding:10px 12px;border:1px solid #e5e8eb;border-radius:8px;margin-bottom:6px;cursor:pointer;background:#fff" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">'
          +'<div style="display:flex;align-items:center;gap:6px;font-size:.78em;color:#4b5563;margin-bottom:3px">'
          +'<span style="background:#eff6ff;color:#1e40af;padding:1px 8px;border-radius:10px;font-weight:700">'+e(lab)+'</span>'
          +'<span>'+e((s.generated_at||'').substring(0,16))+'</span>'
          +'<span>·</span><span>메시지 '+(s.source_message_count||0)+'건</span>'
          +(s.source_memo_count?'<span>·</span><span>메모 '+s.source_memo_count+'건</span>':'')
          +'</div>'
          +'<div style="font-size:.82em;color:#191f28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e((s.summary_text||'').substring(0,120))+'</div>'
          +'</div>';
      }).join('');
    _historyCache={};
    arr.forEach(s=>_historyCache[s.id]=s);
  }catch(err){body.innerHTML='<div style="color:#f04452;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
var _historyCache={};
function loadSummaryFromHistory(id){
  const s=_historyCache[id];if(!s)return;
  _lastSummaryText=s.summary_text||'';
  _lastSummaryJson=s.summary_json||null;
  const body=$g('rsBody'), meta=$g('rsMeta');
  if(_lastSummaryJson){
    body.innerHTML=_renderSummaryJson(_lastSummaryJson);
  } else if(_lastSummaryText){
    body.innerHTML=renderMarkdownLite(_lastSummaryText);
  }
  const rangeLabel={recent:'최근 50건',week:'최근 7일',month:'이번달',all:'전체',custom:'지정기간'};
  const lab=rangeLabel[s.range_type]||s.range_type;
  const rangePart=(s.range_start&&s.range_end)?(' · 🗓️ '+s.range_start+' ~ '+s.range_end):'';
  if(meta)meta.textContent='🕘 ['+lab+'] '+e((s.generated_at||'').substring(0,16))+' · 메시지 '+(s.source_message_count||0)+'건'+rangePart;
}

/* 요약을 상담방에 세무사 메시지로 게시 — 내부용 요약이므로 2단계 경고 */
async function postSummaryToRoom(){
  if(!currentRoomId){alert('상담방이 열려있지 않아요');return}
  if(!_lastSummaryText && !_lastSummaryJson){alert('먼저 "✨ 요약 생성" 버튼을 눌러 요약을 생성하세요');return}
  const warn='⚠️ 이 요약은 내부 담당자용 실무 정리입니다.\n상담방에 올리면 고객도 볼 수 있습니다.\n\n정말 고객에게도 그대로 보여도 괜찮나요?';
  if(!confirm(warn))return;
  if(!confirm('한 번 더 확인합니다.\n내부용 표현이 그대로 고객에게 노출됩니다.\n계속 게시하시겠습니까?'))return;
  const msg='📝 상담 요약 (세무사 기록)\n\n'+(_lastSummaryText||'(구조화 데이터만 있음)')+'\n\n(이 메시지는 AI가 지금까지 대화를 정리한 것입니다.)';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({room_id:currentRoomId, content:msg})
    });
    const d=await r.json();
    if(d.ok){
      if(typeof showAdminToast==='function')showAdminToast('✅ 상담방에 게시됨');
      else alert('✅ 게시 완료');
      closeRoomSummary();
      if(typeof loadRoomDetail==='function')loadRoomDetail();
    } else alert('게시 실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}
