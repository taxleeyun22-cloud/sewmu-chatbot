let KEY='';
/* null-safe getElementById: 없으면 no-op 객체 반환 (admin.html/staff.html 공유용) */
function _noop(){return {style:{},classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},dataset:{},children:[],value:'',innerHTML:'',textContent:'',checked:false,disabled:false,className:'',addEventListener:function(){},removeEventListener:function(){},focus:function(){},click:function(){},blur:function(){},scrollIntoView:function(){},closest:function(){return null},querySelector:function(){return null},querySelectorAll:function(){return []},appendChild:function(a){return a},removeChild:function(a){return a},setAttribute:function(){},getAttribute:function(){return null},removeAttribute:function(){},insertAdjacentHTML:function(){}}}
function $g(id){return document.getElementById(id)||_noop()}
function e(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

/* [IMG]url 프리픽스가 있으면 이미지 + 텍스트 렌더링 */
function parseMsg(content){
  if(!content)return {image:null,file:null,text:''};
  const mf=/^\[FILE\](\{[^\n]+\})(\n([\s\S]*))?$/.exec(content);
  if(mf){
    try{const obj=JSON.parse(mf[1]);return {image:null,file:obj,text:mf[3]||''}}catch{}
  }
  const m=/^\[IMG\](\S+)(\n([\s\S]*))?$/.exec(content);
  if(m)return {image:m[1],file:null,text:m[3]||''};
  return {image:null,file:null,text:content};
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
function renderMsgBody(content){
  const p=parseMsg(content);
  let h='';
  if(p.image){
    h+='<img class="rc-img-msg" src="'+e(p.image)+'" alt="이미지" loading="lazy" style="display:inline-block;max-width:220px;max-height:300px;border-radius:10px;background:rgba(0,0,0,.06);object-fit:cover;cursor:zoom-in" onclick="openImgViewer(this.src,collectImagesNear(this))" onerror="this.outerHTML=\'<div style=\\\'padding:10px;color:#f04452;font-size:.8em\\\'>이미지 로드 실패</div>\'">';
  }
  if(p.file){
    const nm=p.file.name||'파일';
    h+='<a href="'+e(p.file.url||'#')+'" download="'+e(nm)+'" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,.05);border-radius:10px;text-decoration:none;color:inherit;max-width:260px">'
      +'<div style="font-size:1.8em;line-height:1">'+fileIconFor(nm)+'</div>'
      +'<div style="flex:1;min-width:0;overflow:hidden"><div style="font-weight:600;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(nm)+'</div>'
      +'<div style="font-size:.72em;color:#8b95a1;margin-top:2px">'+fmtSize(p.file.size)+' · 다운로드</div></div></a>';
  }
  if(p.text)h+=((p.image||p.file)?'<div style="margin-top:6px">':'')+e(p.text)+((p.image||p.file)?'</div>':'');
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
try{localStorage.setItem('admin_key',k)}catch{}
$g('loginView').style.display='none';
$g('mainView').style.display='block';
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
try{localStorage.removeItem('admin_key')}catch{}
if(showErr)$g('err').style.display='block';
return false;
}
}

/* ===== 전역 검색 ===== */
let searchTimer=null;
function openSearch(){
  $g('searchModal').style.display='flex';
  setTimeout(function(){$g('searchInput').focus()},100);
}
function onSearchInput(){
  if(searchTimer)clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,300);
}
async function doSearch(){
  const q=$g('searchInput').value.trim();
  const el=$g('searchResults');
  if(q.length<2){el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">2자 이상 입력하세요</div>';return}
  el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">검색 중...</div>';
  try{
    const r=await fetch('/api/admin-search?key='+encodeURIComponent(KEY)+'&q='+encodeURIComponent(q));
    const d=await r.json();
    if(d.error){el.innerHTML='<div style="color:#f04452;font-size:.85em;padding:20px 0">오류: '+e(d.error)+'</div>';return}
    let html='';
    const totalN=(d.users||[]).length+(d.conversations||[]).length+(d.rooms||[]).length+(d.room_messages||[]).length;
    if(totalN===0){
      el.innerHTML='<div style="text-align:center;color:#8b95a1;font-size:.85em;padding:40px 0">"'+e(q)+'"에 대한 검색 결과가 없습니다</div>';return;
    }
    if(d.users&&d.users.length){
      html+='<div class="sr-group"><div class="sr-title">👤 사용자 '+d.users.length+'명</div>';
      html+=d.users.map(function(u){
        const nm=u.real_name||u.name||'이름없음';
        const badge=u.is_admin?' <span style="background:#8b6914;color:#fff;font-size:.65em;padding:1px 5px;border-radius:4px;font-weight:700">👑</span>':'';
        const st=u.approval_status||'pending';
        return '<div class="sr-item" onclick="jumpToUser('+u.id+')"><b>'+e(nm)+'</b>'+badge+'<div class="sr-sub">'+e(u.email||'')+' · '+e(u.phone||'')+' · '+e(st)+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.rooms&&d.rooms.length){
      html+='<div class="sr-group"><div class="sr-title">💬 상담방 '+d.rooms.length+'개</div>';
      html+=d.rooms.map(function(r){
        const st=r.status==='closed'?' <span style="color:#8b95a1;font-size:.72em">(종료)</span>':'';
        return '<div class="sr-item" onclick="jumpToRoom(\''+e(r.id).replace(/\'/g,'')+'\')"><b>'+e(r.name||'상담방')+'</b>'+st+'<div class="sr-sub">ID: '+e(r.id)+' · 메시지 '+(r.msg_count||0)+'건 · '+e(r.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.room_messages&&d.room_messages.length){
      html+='<div class="sr-group"><div class="sr-title">📨 상담방 메시지 '+d.room_messages.length+'건</div>';
      html+=d.room_messages.map(function(m){
        const who=m.role==='human_advisor'?'👨‍💼 세무사':m.role==='assistant'?'🤖 AI':'👤 '+(m.real_name||m.name||'사용자');
        const snip=String(m.content||'').slice(0,120);
        return '<div class="sr-item" onclick="jumpToRoom(\''+e(m.room_id).replace(/\'/g,'')+'\')"><b>'+e(m.room_name||m.room_id)+'</b> · '+who+'<div class="sr-sub">'+e(snip)+(m.content&&m.content.length>120?'…':'')+'</div><div class="sr-sub" style="color:#c6cdd2">'+e(m.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    if(d.conversations&&d.conversations.length){
      html+='<div class="sr-group"><div class="sr-title">💭 일반 대화 '+d.conversations.length+'건</div>';
      html+=d.conversations.map(function(m){
        const who=m.role==='assistant'?'🤖 AI'+(m.confidence?'['+e(m.confidence)+']':''):'👤 '+(m.real_name||m.name||'사용자');
        const snip=String(m.content||'').slice(0,120);
        return '<div class="sr-item" onclick="jumpToConversation(\''+e(m.session_id).replace(/\'/g,'')+'\')">'+who+'<div class="sr-sub">'+e(snip)+(m.content&&m.content.length>120?'…':'')+'</div><div class="sr-sub" style="color:#c6cdd2">'+e(m.created_at||'')+'</div></div>';
      }).join('');
      html+='</div>';
    }
    el.innerHTML=html;
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.85em;padding:20px 0">오류: '+e(err.message)+'</div>'}
}
function closeSearchModal(){$g('searchModal').style.display='none'}
function jumpToUser(id){
  closeSearchModal();
  tab('users');
  setTimeout(function(){
    const card=document.querySelector('[data-user-id="'+id+'"]');
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='3px solid #3182f6';setTimeout(function(){card.style.outline=''},2000)}
  },400);
}
function jumpToRoom(roomId){
  closeSearchModal();
  tab('rooms');
  setTimeout(function(){if(typeof openRoom==='function')openRoom(roomId)},300);
}
function jumpToConversation(sessionId){
  closeSearchModal();
  tab('chat');
  /* 대화 탭은 세션 단위로 열기 로직이 있으면 붙일 수 있음. 일단 탭만 전환 */
}

function logout(){
KEY='';
try{localStorage.removeItem('admin_key')}catch{}
$g('loginView').style.display='flex';
$g('mainView').style.display='none';
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
  try{
    var saved=localStorage.getItem('admin_key');
    if(saved){IS_OWNER=true;await doLogin(saved,false)}
  }catch{}
})();

function tab(t){
try{localStorage.setItem('admin_last_tab',t)}catch{}
$g('tabChat').className=t==='chat'?'on':'';
$g('tabLive').className=t==='live'?'on':'';
$g('tabRooms').className=t==='rooms'?'on':'';
$g('tabUsers').className=t==='users'?'on':'';
$g('tabAnal').className=t==='anal'?'on':'';
$g('tabReview').className=t==='review'?'on':'';
$g('tabFaq').className=t==='faq'?'on':'';
$g('chatView').style.display=t==='chat'?'block':'none';
$g('detailView').style.display='none';
$g('liveView').style.display=t==='live'?'block':'none';
$g('roomsView').style.display=t==='rooms'?'block':'none';
$g('usersView').style.display=t==='users'?'block':'none';
$g('analView').style.display=t==='anal'?'block':'none';
$g('reviewView').style.display=t==='review'?'block':'none';
$g('faqView').style.display=t==='faq'?'block':'none';
if(t==='anal')loadAnalytics();
if(t==='users')loadUsers(currentStatus||'pending');
if(t==='review')loadReview('pending');
if(t==='faq'){loadFaqStatus();loadFaqs()}
if(t==='live')startLivePolling();
else stopLivePolling();
if(t==='rooms')startRoomsPolling();
else stopRoomsPolling();
}

/* ===== 상담방 (단톡방) ===== */
let currentRoomId=null;
let currentRoomStatus='active';
let roomsPollTimer=null;
let roomMsgPollTimer=null;
let crSelectedUsers={};

function startRoomsPolling(){
  loadRoomList();
  if(roomsPollTimer)clearInterval(roomsPollTimer);
  roomsPollTimer=setInterval(loadRoomList,15000);
}
function stopRoomsPolling(){
  if(roomsPollTimer)clearInterval(roomsPollTimer);
  if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
  roomsPollTimer=null;roomMsgPollTimer=null;
}

async function loadRoomList(){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY));
    const d=await r.json();
    const el=$g('roomList');
    if(!d.rooms||d.rooms.length===0){el.innerHTML='<div class="empty" style="padding:40px 20px">상담방이 없습니다</div>';return}
    el.innerHTML=d.rooms.map(rm=>{
      const cls=['room-item'];
      if(currentRoomId===rm.id)cls.push('active');
      if(rm.status==='closed')cls.push('closed');
      const aiIcon=rm.ai_mode==='off'?'🙅':'🤖';
      return '<div class="'+cls.join(' ')+'" onclick="openRoom(\''+rm.id+'\')">'
        +'<div class="ri-head"><span class="ri-name">'+e(rm.name||'상담방')+'</span><span class="ri-icon">'+aiIcon+'</span>'+(rm.status==='closed'?'<span class="ri-closed">종료</span>':'')+'</div>'
        +'<div class="ri-sub">🆔 '+e(rm.id)+' · 👥 '+rm.member_count+' · 💬 '+(rm.msg_count||0)+'</div>'
        +'<div class="ri-time">'+e(rm.last_msg_at||rm.created_at||'')+'</div>'
        +'</div>';
    }).join('');
  }catch(err){$g('roomList').innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

async function openRoom(roomId){
  currentRoomId=roomId;
  $g('roomActions').style.display='flex';
  $g('roomInputArea').style.display='flex';
  $g('roomMembers').style.display='block';
  $g('roomsLayout').classList.add('show-chat');
  await loadRoomDetail();
  loadRoomList();
  if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
  roomMsgPollTimer=setInterval(loadRoomDetail,5000);
}

function closeRoomOnMobile(){
  $g('roomsLayout').classList.remove('show-chat');
}

async function loadRoomDetail(){
  if(!currentRoomId)return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+currentRoomId);
    const d=await r.json();
    if(!d.room)return;
    currentRoomStatus=d.room.status;
    $g('roomChatTitle').innerHTML='<b>'+e(d.room.name||'상담방')+'</b> <span style="font-size:.75em;color:#8b95a1">('+currentRoomId+')</span>';
    $g('roomStatusBtn').textContent=currentRoomStatus==='active'?'종료':'재개';
    const mm=(d.members||[]).filter(m=>!m.left_at);
    $g('roomMembers').innerHTML='👥 멤버 '+mm.length+'명: '+mm.map(m=>e(m.real_name||m.name||'이름없음')).join(', ')+'  + 🏢 세무회계 이윤';

    const container=$g('roomMessages');
    const atBottom=container.scrollHeight-container.scrollTop-container.clientHeight<50;
    container.innerHTML=(d.messages||[]).map(m=>{
      const nm=m.real_name||m.name||'';
      /* 삭제된 메시지 플레이스홀더 */
      if(m.deleted_at){
        return '<div style="margin-bottom:10px;text-align:center;opacity:.6"><span style="display:inline-block;background:#f2f4f6;color:#8b95a1;padding:6px 14px;border-radius:10px;font-size:.75em;font-style:italic">삭제된 메시지입니다</span></div>';
      }
      /* 상담자(세무사)는 본인이 보낸 메시지만 삭제 가능 */
      const delBtn=(m.role==='human_advisor')?' <button onclick="event.stopPropagation();deleteAdminMessage('+m.id+')" style="background:none;border:none;cursor:pointer;font-size:.85em;color:#f04452;padding:0 4px" title="삭제">🗑️</button>':'';
      if(m.role==='user'){
        return '<div style="margin-bottom:10px"><div style="font-size:.7em;color:#8b95a1;margin-bottom:2px">'+e(nm)+'</div><div style="display:inline-block;background:#fff;border:1px solid #e5e8eb;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">'+e(m.created_at||'')+'</div></div></div>';
      } else if(m.role==='assistant'){
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#f2f4f6;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">🤖 AI · '+e(m.created_at||'')+'</div></div></div>';
      } else if(m.role==='human_advisor'){
        return '<div style="margin-bottom:10px;display:flex;justify-content:flex-end;align-items:center;gap:4px"><div style="background:#10b981;color:#fff;padding:10px 14px;border-radius:14px 4px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;opacity:.9;margin-top:4px">👨‍💼 세무사 · '+e(m.created_at||'')+'</div></div>'+delBtn+'</div>';
      }
      return '';
    }).join('');
    if(atBottom)container.scrollTop=container.scrollHeight;
  }catch(err){console.error(err)}
}

async function sendRoomMessage(){
  if(!currentRoomId)return;
  const input=$g('roomInput');
  const content=input.value.trim();
  if(!content)return;
  input.value='';
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,content:content})});
    const d=await r.json();
    if(d.ok)loadRoomDetail();
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
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

async function sendRoomFile(fileInput){
  if(!currentRoomId)return;
  const file=fileInput.files[0];
  fileInput.value='';
  if(!file)return;
  if(file.size>20*1024*1024){alert('20MB 이하 파일만 업로드 가능합니다');return}
  try{
    const fd=new FormData();fd.append('file',file);
    const r=await fetch('/api/upload-file?key='+encodeURIComponent(KEY),{method:'POST',body:fd});
    const d=await r.json();
    if(!d.ok){alert('업로드 실패: '+(d.error||'unknown'));return}
    const r2=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,file_url:d.url,file_name:d.name,file_size:d.size})});
    const d2=await r2.json();
    if(d2.ok)loadRoomDetail();
    else alert('전송 실패: '+(d2.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 상담방 정보 모달 (검색·사진·링크·파일·게시판) ===== */
let riSearchTimer=null;
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
  if(t==='search')setTimeout(function(){$g('riSearchInput').focus()},100);
  if(t==='file')loadRoomFiles();
  if(t==='notice')loadRoomNotices();
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
    el.innerHTML=d.matches.map(function(m){
      const who=m.role==='human_advisor'?'👨‍💼 세무사':m.role==='assistant'?'🤖 AI':'👤 '+(m.real_name||m.name||'사용자');
      let content=String(m.content||'');
      const imgMatch=content.match(/^\[IMG\]\S+\n?([\s\S]*)$/);
      if(imgMatch)content='[사진] '+imgMatch[1];
      const escaped=e(content).slice(0,200);
      const hi=escaped.replace(qRe,'<mark>$1</mark>');
      return '<div class="ri-match"><div class="ri-who">'+who+' · '+e(m.created_at||'')+'</div>'+hi+'</div>';
    }).join('');
  }catch(err){el.innerHTML='<div style="color:#f04452;font-size:.8em;padding:20px">오류: '+e(err.message)+'</div>'}
}
async function loadRoomMedia(){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+encodeURIComponent(currentRoomId)+'&view=media');
    const d=await r.json();
    const photoEl=$g('riPhotoGrid');
    const linkEl=$g('riLinkList');
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
  }catch(err){console.error(err)}
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
      return '<a href="'+e(obj.url||'#')+'" download="'+e(nm)+'" class="ri-link-item" style="display:flex;gap:10px;text-decoration:none;color:inherit;align-items:center">'
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

let editingNoticeId=null;
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
  if(!confirm('이 상담방과 모든 대화기록을 영구 삭제합니다.\n(복구 불가)\n계속할까요?'))return;
  if(!confirm('정말 삭제하시겠습니까? 마지막 확인입니다.'))return;
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&room_id='+currentRoomId,{method:'DELETE'});
    const d=await r.json();
    if(d.ok){
      currentRoomId=null;
      $g('roomChatTitle').textContent='좌측 상담방을 선택하세요';
      $g('roomMessages').innerHTML='';
      $g('roomMembers').style.display='none';
      $g('roomActions').style.display='none';
      $g('roomInputArea').style.display='none';
      $g('roomsLayout').classList.remove('show-chat');
      if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
      loadRoomList();
    } else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* === 방 생성 모달 === */
async function openCreateRoom(){
  $g('crName').value='';
  $g('crSearch').value='';
  $g('crMaxMembers').value='5';
  $g('crMax').textContent='5';
  crSelectedUsers={};
  $g('crSelectedCount').textContent='0';
  $g('createRoomModal').style.display='flex';
  // 승인된 사용자 로딩
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
  if(ids.length===0){alert('최소 1명 이상 선택해주세요');return}
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

async function addMemberPick(userId,nm){
  try{
    const rr=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+'&action=add_member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:currentRoomId,user_id:userId})});
    const dd=await rr.json();
    if(dd.ok){
      $g('addMemberModal').style.display='none';
      loadRoomDetail();loadRoomList();
    }
    else alert('실패: '+(dd.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== 실시간 대화 개입 ===== */
let liveCurrentSession=null;
let liveCurrentUserId=null;
let livePollTimer=null;
let liveMsgPollTimer=null;

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
  liveMsgPollTimer=setInterval(loadLiveMessages,5000);
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
        return '<div style="margin-bottom:10px"><div style="display:inline-block;background:#e0f5ec;border:1px solid #86efac;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content)+'<div style="font-size:.65em;color:#10b981;margin-top:4px;font-weight:600">👨‍💼 세무사 · '+e(m.created_at||'')+'</div></div></div>';
      }
      return '';
    }).join('');
    if(atBottom)container.scrollTop=container.scrollHeight;
    // 세션 목록도 unread 초기화 반영
    refreshLiveBadge();
  }catch(err){console.error(err)}
}

async function sendLiveMessage(){
  if(!liveCurrentSession||!liveCurrentUserId)return;
  const input=$g('liveInput');
  const content=input.value.trim();
  if(!content)return;
  input.value='';
  try{
    const r=await fetch('/api/admin-live?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:liveCurrentSession,user_id:liveCurrentUserId,content:content})});
    const d=await r.json();
    if(d.ok){loadLiveMessages()}
    else alert('실패: '+(d.error||'unknown'));
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

let currentStatus='pending';
async function refreshPendingBadge(){
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status=pending');
const d=await r.json();
const n=(d.counts&&d.counts.pending)||0;
const b=$g('pendingBadge');
if(n>0){b.textContent=n;b.style.display='inline-block'}else{b.style.display='none'}
}catch{}
}

function userStatus(s){
currentStatus=s;
['Pending','Client','Guest','Rejected'].forEach(k=>{
const el=$g('uSt'+k);
const active=('uSt'+k).toLowerCase().indexOf(s.replace('approved_','').toLowerCase())>=0;
el.style.background=active?(s==='rejected'?'#8b95a1':s==='pending'?'#f04452':'#3182f6'):'#e5e8eb';
el.style.color=active?'#fff':'#8b95a1';
});
loadUsers(s);
}

async function loadUsers(status){
const el=$g('userList');
el.innerHTML='<div class="empty">불러오는 중...</div>';
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY)+'&status='+encodeURIComponent(status));
const d=await r.json();
if(d.counts){
$g('cPending').textContent=d.counts.pending||0;
$g('cClient').textContent=d.counts.approved_client||0;
$g('cGuest').textContent=d.counts.approved_guest||0;
$g('cRejected').textContent=d.counts.rejected||0;
}
if(!d.users||d.users.length===0){el.innerHTML='<div class="empty">해당 상태의 사용자가 없습니다</div>';return}
el.innerHTML=d.users.map(u=>{
const nm=u.real_name||u.name||'이름없음';
const av=u.profile_image?'<img src="'+e(u.profile_image)+'" alt="">':nm[0];
const pv=u.provider||'';
const phone=u.phone?' · '+e(u.phone):'';
const nameConf=u.name_confirmed?'':'<span style="color:#f04452;font-size:.72em">⚠️본명미확인</span> ';
const adminMark=u.is_admin?' <span style="color:#fff;background:#8b6914;font-size:.65em;padding:2px 6px;border-radius:4px;font-weight:700">👑 관리자</span>':'';
const todayCnt=u.today_count||0;
let actions='';
const adminBtn=IS_OWNER?(u.is_admin
  ?'<button onclick="setAdminFlag('+u.id+',0)" style="background:#fff;color:#8b6914;border:1px solid #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 해제</button>'
  :'<button onclick="setAdminFlag('+u.id+',1)" style="background:#fff;color:#8b6914;border:1px dashed #8b6914;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">👑 관리자 승급</button>'
):'';
if(status==='pending'){
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+'<button onclick="approveUser('+u.id+',\'approve_client\')" style="background:#3182f6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">✓ 기장거래처 승인</button>'
+'<button onclick="approveUser('+u.id+',\'approve_guest\')" style="background:#00c471;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">○ 일반 승인</button>'
+'<button onclick="openProfile('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">📋 거래처정보</button>'
+'<button onclick="rejectUser('+u.id+')" style="background:#f04452;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.8em;cursor:pointer;font-family:inherit;font-weight:600">✕ 거절</button>'
+adminBtn
+'</div>';
}else{
actions='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
+'<button onclick="openProfile('+u.id+',\''+e(nm).replace(/\'/g,'')+'\')" style="background:#fff;color:#3182f6;border:1px solid #3182f6;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit;font-weight:600">📋 거래처정보</button>'
+(status!=='approved_client'?'<button onclick="approveUser('+u.id+',\'approve_client\')" style="background:#3182f6;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 기장거래처</button>':'')
+(status!=='approved_guest'?'<button onclick="approveUser('+u.id+',\'approve_guest\')" style="background:#00c471;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 일반승인</button>':'')
+(status!=='pending'?'<button onclick="approveUser('+u.id+',\'pending\')" style="background:#8b95a1;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 대기로</button>':'')
+(status!=='rejected'?'<button onclick="rejectUser('+u.id+')" style="background:#f04452;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:.75em;cursor:pointer;font-family:inherit">→ 거절</button>':'')
+adminBtn
+'</div>';
}
return '<div data-user-id="'+u.id+'" style="background:#fff;border-radius:12px;padding:16px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,.03)">'
+'<div style="display:flex;align-items:center;gap:14px">'
+'<div class="avatar">'+av+'</div>'
+'<div class="info"><div class="name">'+e(nm)+(u.name&&u.real_name&&u.name!==u.real_name?' <span style="font-size:.72em;color:#8b95a1">(카톡: '+e(u.name)+')</span>':'')+adminMark+'</div>'
+'<div class="meta">'+nameConf+(pv?'<span class="badge">'+pv+'</span> ':'')+e(u.email||'')+phone+'</div>'
+'<div class="meta" style="margin-top:3px">가입 '+e(u.created_at||'')+' · 오늘 '+todayCnt+'건</div>'
+'</div></div>'
+actions
+'</div>';
}).join('');
}catch(err){el.innerHTML='<div class="empty">오류: '+e(err.message)+'</div>'}
}

async function approveUser(id,action){
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,action:action})});
const d=await r.json();
if(d.ok){loadUsers(currentStatus);refreshPendingBadge()}
else alert('실패: '+(d.error||'unknown'));
}catch(err){alert('오류: '+err.message)}
}

async function setAdminFlag(id,flag){
  if(!IS_OWNER){alert('owner 권한이 필요합니다');return}
  const msg=flag?'이 사용자를 관리자로 승급하시겠습니까?\n(승급 후 카톡/네이버 로그인 상태로 admin.html 접근 가능)':'관리자 권한을 해제하시겠습니까?';
  if(!confirm(msg))return;
  try{
    const r=await fetch('/api/admin-users?key='+encodeURIComponent(KEY)+'&action=set_admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,is_admin:flag})});
    const d=await r.json();
    if(d.ok){loadUsers(currentStatus);alert(flag?'✅ 관리자로 승급되었습니다':'✅ 관리자 권한이 해제되었습니다')}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function rejectUser(id){
const reason=prompt('거절 사유 (선택):','')||null;
try{
const r=await fetch('/api/admin-approve?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:id,action:'reject',reason:reason})});
const d=await r.json();
if(d.ok){loadUsers(currentStatus);refreshPendingBadge()}
else alert('실패: '+(d.error||'unknown'));
}catch(err){alert('오류: '+err.message)}
}

/* ===== 거래처 사업장 관리 (복수 지원) ===== */
let currentProfileUserId=null;
let currentEditingBizId=null; // null이면 신규, 숫자면 수정

async function openProfile(userId,displayName){
  currentProfileUserId=userId;
  currentEditingBizId=null;
  $g('pmUserInfo').textContent='사용자: '+displayName+' (ID '+userId+')';
  $g('pmTitle').textContent=displayName+'님의 사업장';
  $g('profileModal').style.display='flex';
  pmShowList();
  await loadBusinesses();
}

function closeProfileModal(){$g('profileModal').style.display='none'}

function pmShowList(){
  $g('pmListView').style.display='block';
  $g('pmEditView').style.display='none';
}
function pmShowEdit(){
  $g('pmListView').style.display='none';
  $g('pmEditView').style.display='block';
}
function pmBackToList(){pmShowList();loadBusinesses()}

async function loadBusinesses(){
  if(!currentProfileUserId)return;
  const listEl=$g('pmBizList');
  listEl.innerHTML='<div style="padding:20px;text-align:center;color:#8b95a1;font-size:.85em">불러오는 중...</div>';
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId);
    const d=await r.json();
    const list=d.businesses||[];
    if(list.length===0){
      listEl.innerHTML='<div style="padding:24px;text-align:center;color:#8b95a1;font-size:.85em;background:#f9fafb;border-radius:8px">등록된 사업장이 없습니다<br><span style="font-size:.85em;color:#b0b8c1">위의 "＋ 사업장 추가" 버튼으로 등록하세요</span></div>';
      return;
    }
    listEl.innerHTML=list.map(function(b){
      const primary=b.is_primary?'<span style="font-size:.65em;background:#e0f5ec;color:#10b981;padding:2px 6px;border-radius:5px;margin-left:6px;font-weight:600">⭐ 주</span>':'';
      const bizNo=b.business_number?b.business_number.slice(0,3)+'-'+b.business_number.slice(3,5)+'-'+b.business_number.slice(5):'-';
      const info=[b.business_type,b.tax_type,b.industry].filter(Boolean).join(' · ')||'-';
      return '<div style="background:#f9fafb;border:1px solid #e5e8eb;border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;transition:.15s" onclick="pmEditBusiness('+b.id+')" onmouseover="this.style.background=\'#f2f4f6\'" onmouseout="this.style.background=\'#f9fafb\'">'
        +'<div style="font-weight:600;font-size:.92em;color:#191f28;margin-bottom:4px">'+e(b.company_name||'상호 미등록')+primary+'</div>'
        +'<div style="font-size:.75em;color:#555;margin-bottom:2px">'+e(info)+'</div>'
        +'<div style="font-size:.72em;color:#8b95a1">사업자번호 '+e(bizNo)+(b.ceo_name?' · 대표 '+e(b.ceo_name):'')+'</div>'
        +(b.notes?'<div style="font-size:.72em;color:#3182f6;margin-top:6px;padding-top:6px;border-top:1px solid #e5e8eb">📝 '+e(b.notes.slice(0,60))+(b.notes.length>60?'...':'')+'</div>':'')
        +'</div>';
    }).join('');
  }catch(err){listEl.innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

function pmClearForm(){
  ['pmCompany','pmBizNo','pmCEO','pmPhone','pmIndustry','pmAddr','pmEstDate','pmEmp','pmRevenue','pmNotes'].forEach(id=>{const el=$g(id);if(el)el.value=''});
  $g('pmBizType').value='';
  $g('pmTaxType').value='';
  $g('pmVatPeriod').value='';
  $g('pmIsPrimary').checked=false;
}

function pmNewBusiness(){
  currentEditingBizId=null;
  pmClearForm();
  $g('pmDeleteBtn').style.display='none';
  pmShowEdit();
}

async function pmEditBusiness(bizId){
  currentEditingBizId=bizId;
  pmClearForm();
  $g('pmDeleteBtn').style.display='inline-flex';
  pmShowEdit();
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId);
    const d=await r.json();
    const b=(d.businesses||[]).find(x=>x.id===bizId);
    if(!b)return;
    $g('pmCompany').value=b.company_name||'';
    $g('pmBizNo').value=b.business_number||'';
    $g('pmCEO').value=b.ceo_name||'';
    $g('pmPhone').value=b.phone||'';
    $g('pmIndustry').value=b.industry||'';
    $g('pmBizType').value=b.business_type||'';
    $g('pmTaxType').value=b.tax_type||'';
    $g('pmVatPeriod').value=b.vat_period||'';
    $g('pmEstDate').value=b.establishment_date||'';
    $g('pmEmp').value=b.employee_count||'';
    $g('pmAddr').value=b.address||'';
    $g('pmRevenue').value=b.last_revenue||'';
    $g('pmNotes').value=b.notes||'';
    $g('pmIsPrimary').checked=!!b.is_primary;
  }catch(err){alert('불러오기 실패: '+err.message)}
}

async function saveBusiness(){
  if(!currentProfileUserId)return;
  const payload={
    company_name:$g('pmCompany').value.trim(),
    business_number:$g('pmBizNo').value.trim().replace(/\D/g,''),
    ceo_name:$g('pmCEO').value.trim(),
    phone:$g('pmPhone').value.trim(),
    industry:$g('pmIndustry').value.trim(),
    business_type:$g('pmBizType').value,
    tax_type:$g('pmTaxType').value,
    vat_period:$g('pmVatPeriod').value,
    establishment_date:$g('pmEstDate').value,
    employee_count:$g('pmEmp').value,
    address:$g('pmAddr').value.trim(),
    last_revenue:$g('pmRevenue').value,
    notes:$g('pmNotes').value.trim(),
    is_primary:$g('pmIsPrimary').checked?1:0,
  };
  try{
    let r,d;
    if(currentEditingBizId){
      r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&id='+currentEditingBizId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    } else {
      r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&user_id='+currentProfileUserId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    }
    d=await r.json();
    if(d.ok){pmBackToList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

async function deleteBusiness(){
  if(!currentEditingBizId)return;
  if(!confirm('이 사업장 정보를 삭제합니다. 계속할까요?'))return;
  try{
    const r=await fetch('/api/admin-client-businesses?key='+encodeURIComponent(KEY)+'&id='+currentEditingBizId,{method:'DELETE'});
    const d=await r.json();
    if(d.ok){pmBackToList()}
    else alert('실패: '+(d.error||'unknown'));
  }catch(err){alert('오류: '+err.message)}
}

/* ===== CSV 일괄 업로드 ===== */
let bulkRows=null;
function showBulkUpload(){
$g('bulkFile').value='';
$g('bulkPreview').innerHTML='';
$g('bulkResult').innerHTML='';
$g('bulkUploadBtn').disabled=true;
$g('bulkUploadBtn').style.opacity='.5';
bulkRows=null;
$g('bulkModal').style.display='flex';
}
function closeBulkModal(){$g('bulkModal').style.display='none'}

// CSV 파서 (따옴표 고려)
function parseCSV(text){
const lines=text.split(/\r?\n/).filter(l=>l.trim());
if(lines.length<2)return [];
const parseLine=(line)=>{
const out=[];let cur='';let inQ=false;
for(let i=0;i<line.length;i++){
const c=line[i];
if(c==='"'){
if(inQ&&line[i+1]==='"'){cur+='"';i++}
else inQ=!inQ;
}else if(c===','&&!inQ){out.push(cur);cur=''}
else cur+=c;
}
out.push(cur);
return out;
};
const headers=parseLine(lines[0]).map(h=>h.trim());
const rows=[];
for(let i=1;i<lines.length;i++){
const vals=parseLine(lines[i]);
const obj={};
headers.forEach((h,j)=>{obj[h]=(vals[j]||'').trim()});
rows.push(obj);
}
return {headers,rows};
}

// 컬럼명 매핑 (한글→영문 표준)
const COL_MAP={
'상호':'company_name','company_name':'company_name','사업체명':'company_name','거래처명':'company_name','업체명':'company_name',
'사업자번호':'business_number','사업자등록번호':'business_number','business_number':'business_number','등록번호':'business_number',
'대표자':'ceo_name','대표자명':'ceo_name','ceo_name':'ceo_name','대표':'ceo_name',
'업종':'industry','industry':'industry','종목':'industry',
'사업형태':'business_type','business_type':'business_type','법인구분':'business_type','개인법인':'business_type',
'과세유형':'tax_type','tax_type':'tax_type','과세구분':'tax_type',
'개업일':'establishment_date','establishment_date':'establishment_date','개업일자':'establishment_date',
'주소':'address','address':'address','사업장주소':'address',
'전화':'phone','phone':'phone','연락처':'phone','휴대폰':'phone','전화번호':'phone',
'직원수':'employee_count','employee_count':'employee_count','종업원수':'employee_count',
'매출':'last_revenue','last_revenue':'last_revenue','전년매출':'last_revenue','연매출':'last_revenue',
'부가세주기':'vat_period','vat_period':'vat_period','신고주기':'vat_period',
'메모':'notes','notes':'notes','특이사항':'notes','비고':'notes',
};
function mapRows(parsed){
const mapped=[];
for(const row of parsed.rows){
const o={};
for(const h of parsed.headers){
const key=COL_MAP[h]||COL_MAP[h.replace(/\s/g,'')];
if(key)o[key]=row[h];
}
if(o.business_number)mapped.push(o);
}
return mapped;
}

function previewCSV(input){
const file=input.files[0];
if(!file)return;
const reader=new FileReader();
reader.onload=()=>{
try{
// EUC-KR 대응: 먼저 UTF-8로 시도
let text=reader.result;
const parsed=parseCSV(text);
if(!parsed.headers||parsed.headers.length===0){$g('bulkPreview').innerHTML='<span style="color:#f04452">CSV 파싱 실패</span>';return}
bulkRows=mapRows(parsed);
if(bulkRows.length===0){
$g('bulkPreview').innerHTML='<span style="color:#f04452">사업자번호 포함된 행이 없습니다. 헤더를 확인하세요.<br>받은 헤더: '+e(parsed.headers.join(', '))+'</span>';
return;
}
const sample=bulkRows.slice(0,3).map(r=>
'• '+e(r.company_name||'(상호없음)')+' / '+e(r.business_number||'')+' / '+e(r.ceo_name||'-')
).join('<br>');
$g('bulkPreview').innerHTML='<b>'+bulkRows.length+'개 행 인식됨</b> (매핑 성공)<br><div style="margin-top:6px;font-size:.75em;color:#666">'+sample+(bulkRows.length>3?'<br>...':'')+'</div>';
$g('bulkUploadBtn').disabled=false;
$g('bulkUploadBtn').style.opacity='1';
}catch(err){$g('bulkPreview').innerHTML='<span style="color:#f04452">오류: '+e(err.message)+'</span>'}
};
// UTF-8이 기본, 한글 깨지면 EUC-KR 재시도는 추후 보강
reader.readAsText(file,'UTF-8');
}

async function submitBulk(){
if(!bulkRows||bulkRows.length===0)return;
const auto=$g('bulkAutoApprove').checked;
$g('bulkUploadBtn').disabled=true;
$g('bulkUploadBtn').textContent='업로드 중...';
try{
const r=await fetch('/api/admin-client-profile-bulk?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:bulkRows,auto_approve:auto})});
const d=await r.json();
if(d.error){$g('bulkResult').innerHTML='<div style="color:#f04452">실패: '+e(d.error)+'</div>';return}
$g('bulkResult').innerHTML=
'<div style="background:#e0f5ec;padding:12px;border-radius:8px;font-size:.85em">'
+'<b style="color:#10b981">✅ 완료</b><br>'
+'총 '+d.total+'건 중<br>'
+'• 기존 가입자 매칭+승격: <b>'+d.matched_approved+'</b>건<br>'
+'• 대기 프로필 생성(미가입): <b>'+d.unbound_created+'</b>건<br>'
+'• 건너뜀(사업자번호 오류): '+d.skipped+'건<br>'
+'• 에러: '+d.error_count+'건'
+'</div>';
loadUsers(currentStatus);refreshPendingBadge();
}catch(err){$g('bulkResult').innerHTML='<div style="color:#f04452">오류: '+e(err.message)+'</div>'}
finally{$g('bulkUploadBtn').disabled=false;$g('bulkUploadBtn').textContent='업로드'}
}

/* ===== 검증 탭 (원격 유지) ===== */
let curFilter='pending';
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
let faqSearchTimer=null;
let editingFaqId=null;

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

/* ===== 풀스크린 이미지 뷰어 (카톡 스타일) ===== */
var ivState={srcs:[],idx:0,startX:0,startY:0,dx:0,dy:0,touching:false,swiped:false,axis:null};
function collectImagesNear(el){
  var c=el.closest(".rmsgs")||el.closest("#msgs")||el.closest("#roomChatMessages")||el.closest("#riPhotoGrid")||document.body;
  var nodes=c.querySelectorAll("img.rc-img-msg, img.ri-photo, .ri-photo img");
  var arr=[];nodes.forEach(function(n){if(n.src)arr.push(n.src)});
  return arr.length?arr:[el.src];
}
function openImgViewer(src,srcs){
  if(!Array.isArray(srcs)||srcs.length===0)srcs=[src];
  var i=srcs.indexOf(src);if(i<0)i=0;
  ivState.srcs=srcs;ivState.idx=i;
  var v=document.getElementById("imgViewer");if(!v)return;
  v.classList.add("open");v.classList.toggle("has-multiple",srcs.length>1);
  document.body.style.overflow="hidden";
  renderIvImg();
  try{history.pushState({iv:1},"",location.href)}catch(e){}
}
function closeImgViewer(){
  var v=document.getElementById("imgViewer");
  if(!v||!v.classList.contains("open"))return;
  v.classList.remove("open");document.body.style.overflow="";
  try{if(history.state&&history.state.iv)history.back()}catch(e){}
}
function renderIvImg(){
  var img=document.getElementById("ivImg");if(!img)return;
  img.src=ivState.srcs[ivState.idx]||"";
  var c=document.getElementById("ivCounter");
  if(c)c.textContent=(ivState.idx+1)+" / "+ivState.srcs.length;
}
function imgViewerNav(d){
  if(ivState.srcs.length<2)return;
  ivState.idx=(ivState.idx+d+ivState.srcs.length)%ivState.srcs.length;
  renderIvImg();
}
async function saveImgViewer(){
  var src=ivState.srcs[ivState.idx];if(!src)return;
  try{
    var r=await fetch(src);if(!r.ok)throw new Error();
    var b=await r.blob();var url=URL.createObjectURL(b);
    var a=document.createElement("a");
    var nm=(src.split("/").pop()||"image").split("?")[0]||"image";
    if(!/\.\w+$/.test(nm))nm+=".jpg";
    a.href=url;a.download=nm;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove()},150);
  }catch(e){window.open(src,"_blank")}
}
(function(){
  function init(){
    var v=document.getElementById("imgViewer");if(!v)return false;
    function img(){return document.getElementById("ivImg")}
    function resetTransform(animate){
      var i=img();if(!i)return;
      i.style.transition=animate?"transform .2s ease-out":"none";
      i.style.transform="";
    }
    v.addEventListener("click",function(e){
      if(ivState.swiped){ivState.swiped=false;return}
      if(e.target===v)closeImgViewer();
    });
    v.addEventListener("touchstart",function(e){
      if(e.touches.length!==1)return;
      ivState.startX=e.touches[0].clientX;ivState.startY=e.touches[0].clientY;
      ivState.dx=0;ivState.dy=0;ivState.touching=true;ivState.axis=null;
      var i=img();if(i)i.style.transition="none";
    },{passive:true});
    v.addEventListener("touchmove",function(e){
      if(!ivState.touching||e.touches.length!==1)return;
      var dx=e.touches[0].clientX-ivState.startX;
      var dy=e.touches[0].clientY-ivState.startY;
      if(!ivState.axis){
        if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
        ivState.axis=Math.abs(dx)>=Math.abs(dy)?"x":"y";
      }
      ivState.dx=dx;ivState.dy=dy;
      if(e.cancelable)e.preventDefault();
      var i=img();if(!i)return;
      if(ivState.axis==="x"){
        var edge=(ivState.idx===0&&dx>0)||(ivState.idx===ivState.srcs.length-1&&dx<0);
        var d=edge?dx*0.35:dx;
        i.style.transform="translateX("+d+"px)";
      } else if(dy>0){
        i.style.transform="translateY("+dy+"px)";
      }
    },{passive:false});
    v.addEventListener("touchend",function(){
      if(!ivState.touching)return;ivState.touching=false;
      var dx=ivState.dx,dy=ivState.dy,axis=ivState.axis;
      ivState.dx=0;ivState.dy=0;ivState.axis=null;
      if(axis==="x"&&Math.abs(dx)>50){
        imgViewerNav(dx>0?-1:1);
        ivState.swiped=true;
        resetTransform(false);
      } else if(axis==="y"&&dy>120){
        closeImgViewer();
        resetTransform(false);
      } else {
        resetTransform(true);
      }
    },{passive:true});
    v.addEventListener("touchcancel",function(){
      if(!ivState.touching)return;
      ivState.touching=false;ivState.dx=0;ivState.dy=0;ivState.axis=null;
      resetTransform(true);
    });
    document.addEventListener("keydown",function(e){
      if(!v.classList.contains("open"))return;
      if(e.key==="Escape")closeImgViewer();
      else if(e.key==="ArrowLeft")imgViewerNav(-1);
      else if(e.key==="ArrowRight")imgViewerNav(1);
    });
    window.addEventListener("popstate",function(){
      if(v.classList.contains("open")){v.classList.remove("open");document.body.style.overflow=""}
    });
    return true;
  }
  if(!init()){document.addEventListener("DOMContentLoaded",init)}
})();

