/* ===== admin-rooms-list.js — 상담방 list / filter / 폴링 / open / detail (쪼개기 Step 5a) =====
 * 사장님 명령 (2026-04-30): 처음 계획 통째 — admin.js Step 5 분리 (~520줄, 5a 가벼운 chunk).
 *
 * 분리 범위 (admin.js → admin-rooms-list.js):
 *  - 상태: _roomsMode / currentRoomId / currentRoomStatus / currentRoomPhone / currentRoomMembers
 *          DEFAULT_COMPANY_PHONE / roomsPollTimer / roomMsgPollTimer
 *  - 폴링 + visibility: startRoomsPolling / stopRoomsPolling
 *                       + IIFE _visibilityPolling
 *  - 읽음 표시: _adminRoomSeenRaw / _adminRoomReadCount / _adminRoomMarkRead
 *  - 필터: _roomFilterGet / _roomFilterSet / toggleRoomFilter
 *  - 목록 로드: loadRoomList / _detectNewMessagesForNotify / setRoomPriority
 *  - 메뉴 / 팝아웃: toggleRoomMenu / popoutCurrentRoom / applyPopupLayout
 *  - 진입 / 닫기: openRoom / closeRoomOnMobile
 *  - 상세 로드: loadRoomDetail
 *
 * 의존 (cross-script via classic script global env):
 *  - admin.js: KEY, e, escAttr, $g, tab, _detectNewMessagesForNotify (PC 알림 영역, Step 5b/5c 후 분리 예정)
 *
 * 노출 (window 자동 — function 선언 + var 사용)
 *
 * 로드 순서 (admin.html / staff.html):
 *   admin.js → admin-memos.js → admin-customer-dash.js → admin-business-tab.js → admin-search-bulk.js → admin-rooms-list.js */

var _roomsMode='external';
/* ===== 상담방 (단톡방) ===== */
var currentRoomId=null;
var currentRoomStatus='active';
var currentRoomPhone=null;   /* chat_rooms.phone — 거래처 사장용 "전담 세무사 직통번호" */
var currentRoomMembers=[];   /* 최신 members (관리자→사장 전화 시 사용) */
var DEFAULT_COMPANY_PHONE='053-269-1213';
var roomsPollTimer=null;
var roomMsgPollTimer=null;
/* 탭 숨김 시 polling 중지 · 보일 때 즉시 한 번 + 재개 (리소스 절약) */
(function _visibilityPolling(){
  if(window._vpBound)return;window._vpBound=true;
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      /* 숨김: 모든 polling 중지 */
      if(roomsPollTimer){clearInterval(roomsPollTimer);roomsPollTimer=null}
      if(roomMsgPollTimer){clearInterval(roomMsgPollTimer);roomMsgPollTimer=null}
      if(typeof livePollTimer!=='undefined' && livePollTimer){clearInterval(livePollTimer);livePollTimer=null}
      if(typeof liveMsgPollTimer!=='undefined' && liveMsgPollTimer){clearInterval(liveMsgPollTimer);liveMsgPollTimer=null}
    } else {
      /* 보임: 즉시 한 번 새로고침 + polling 재개 */
      if(typeof loadRoomList==='function' && document.getElementById('roomList')){
        try{loadRoomList()}catch(_){}
        if(!roomsPollTimer)roomsPollTimer=setInterval(loadRoomList,15000);
      }
      if(typeof loadRoomDetail==='function' && typeof currentRoomId!=='undefined' && currentRoomId){
        try{loadRoomDetail()}catch(_){}
        if(!roomMsgPollTimer)roomMsgPollTimer=setInterval(loadRoomDetail,2000);
      }
      if(typeof loadLiveSessions==='function' && typeof livePollTimer!=='undefined' && !livePollTimer){
        try{loadLiveSessions()}catch(_){}
        livePollTimer=setInterval(loadLiveSessions,10000);
      }
      if(typeof loadLiveMessages==='function' && typeof liveCurrentSession!=='undefined' && liveCurrentSession && typeof liveMsgPollTimer!=='undefined' && !liveMsgPollTimer){
        try{loadLiveMessages()}catch(_){}
        liveMsgPollTimer=setInterval(loadLiveMessages,2000);
      }
    }
  });
})();
var crSelectedUsers={};

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

function _adminRoomSeenRaw(roomId){
  try{return localStorage.getItem('aread.'+roomId)}catch{return null}
}
function _adminRoomReadCount(roomId){
  try{const v=localStorage.getItem('aread.'+roomId);return v==null?0:Number(v)||0}catch{return 0}
}
function _adminRoomMarkRead(roomId,count){
  try{localStorage.setItem('aread.'+roomId,String(count||0))}catch{}
}
/* 상담방 우선순위 필터 (로컬스토리지로 유지) — Set 이지만 localStorage는 배열로 */
function _roomFilterGet(){
  try{
    var raw=localStorage.getItem('roomPriFilter');
    if(raw){var arr=JSON.parse(raw); if(Array.isArray(arr))return new Set(arr)}
  }catch{}
  return new Set([1,2,3,'none']); /* 기본: 종료 제외 전부 */
}
function _roomFilterSet(setObj){
  try{localStorage.setItem('roomPriFilter', JSON.stringify([...setObj]))}catch{}
}
function toggleRoomFilter(key){
  /* "all" 또는 "none_only" 같은 프리셋 */
  if(key==='all'){_roomFilterSet(new Set([1,2,3,'none','closed']));loadRoomList();return}
  if(key==='active'){_roomFilterSet(new Set([1,2,3,'none']));loadRoomList();return}
  const cur=_roomFilterGet();
  if(cur.has(key))cur.delete(key); else cur.add(key);
  /* 하나도 없으면 전체로 복원 (완전 숨김 방지) */
  if(cur.size===0)cur.add(1).add(2).add(3).add('none');
  _roomFilterSet(cur);
  loadRoomList();
}

async function loadRoomList(){
  try{
    const r=await fetch('/api/admin-rooms?key='+encodeURIComponent(KEY)+(_roomsMode==='internal'?'&internal=1':''));
    const d=await r.json();
    const el=$g('roomList');
    if(!d.rooms||d.rooms.length===0){el.innerHTML='<div class="empty" style="padding:40px 20px">상담방이 없습니다</div>';return}
    let totalUnread=0;
    /* 담당자 라벨 동적 로드 (캐시) */
    const labels=await _ensureRoomLabels();
    const labelMap={};for(const lb of labels)labelMap[lb.id]=lb;
    /* 🔍 검색어 필터 — 방 이름 / 업체명 / 멤버 이름 / 마지막 메시지 미리보기 */
    const searchQ=((($g('roomListSearch')||{}).value)||'').trim().toLowerCase();
    const filteredRooms=searchQ
      ? d.rooms.filter(rm=>{
          const hay=((rm.name||'')+' '+(rm.business_name||'')+' '+(rm.first_member_name||'')+' '+(rm.last_msg_preview||'')+' '+(rm.last_msg_content||'')).toLowerCase();
          return hay.indexOf(searchQ)>=0;
        })
      : d.rooms;
    /* 우선순위 그룹화 — 라벨 id 별 + 미분류 + 종료 */
    const groups={};for(const lb of labels)groups[lb.id]=[];
    groups.none=[];groups.closed=[];
    for(const rm of filteredRooms){
      if(rm.status==='closed'){groups.closed.push(rm);continue}
      const p=Number(rm.priority||0);
      if(p&&labelMap[p])(groups[p]=groups[p]||[]).push(rm);
      else groups.none.push(rm);
    }
    /* 필터 상태 */
    const flt=_roomFilterGet();
    const filterBtn=(key,label,color,count)=>{
      const on=flt.has(key);
      const bg=on?color:'#e5e8eb';
      const fg=on?'#fff':'#6b7280';
      return '<button onclick="toggleRoomFilter('+(typeof key==='number'?key:"'"+key+"'")+')" style="background:'+bg+';color:'+fg+';border:none;padding:5px 11px;border-radius:6px;font-size:.76em;font-weight:'+(on?'700':'500')+';cursor:pointer;font-family:inherit">'+e(label)+' <span style="opacity:.7">'+count+'</span></button>';
    };
    let filterBar='<div style="padding:8px 10px;border-bottom:1px solid #e5e8eb;background:#f9fafb;display:flex;gap:4px;flex-wrap:wrap;position:sticky;top:0;z-index:2">';
    for(const lb of labels){
      filterBar+=filterBtn(lb.id, lb.name, lb.color||'#6b7280', (groups[lb.id]||[]).length);
    }
    filterBar+=filterBtn('none', '⚪ 미분류', '#6b7280', groups.none.length)
      +filterBtn('closed', '📦 종료', '#9ca3af', groups.closed.length)
      +'</div>';

    const renderCard=(rm)=>{
      const cls=['room-item'];
      if(currentRoomId===rm.id)cls.push('active');
      if(rm.status==='closed')cls.push('closed');
      const aiIcon=rm.ai_mode==='off'?'🙅':'🤖';
      /* 미읽음 기준: 세무사(human_advisor) 가 보낸 것 외 전부 (고객 + AI).
         사용자 피드백: user 메시지만 세면 AI 답변만 있는 방은 뱃지가 안 떠서 놓침
         Phase M10 (2026-05-05 사장님 보고: "안 읽은거 숫자 안 뜨네"):
         server 의 admin_unread_count (last_read_at 기반) 우선 사용.
         legacy localStorage 기반은 fallback. */
      const userCount=Number(rm.non_advisor_msg_count||rm.user_msg_count||0);
      let unread;
      if(typeof rm.admin_unread_count==='number'){
        /* server 정확 값 사용 */
        unread = rm.admin_unread_count;
      } else {
        /* legacy fallback */
        const seen=_adminRoomReadCount(rm.id);
        if(_adminRoomSeenRaw(rm.id)===null){
          _adminRoomMarkRead(rm.id, userCount);
        }
        unread = Math.max(0, userCount - (seen||0));
        if(_adminRoomSeenRaw(rm.id)===null) unread=0;
      }
      if(currentRoomId===rm.id) unread=0;
      totalUnread+=unread;
      const badge=unread>0?'<span class="ri-unread" style="background:#f04452;color:#fff;border-radius:11px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;font-size:.7em;font-weight:800;flex-shrink:0">'+(unread>99?'99+':unread)+'</span>':'';
      /* 우선순위/담당자 탭 버튼 — 라벨 DB 기반 동적 렌더. 너무 많으면 드롭다운으로 */
      const p=Number(rm.priority||0);
      let priTabs;
      if(labels.length<=4){
        /* 4개 이하는 탭 버튼 */
        priTabs='<div class="ri-pri-tabs" onclick="event.stopPropagation()" style="display:inline-flex;gap:1px;background:#f2f4f6;padding:2px;border-radius:6px;flex-shrink:0">'
          +'<button onclick="setRoomPriority(\''+rm.id+'\',0)" style="background:'+(p===0?'#9ca3af':'transparent')+';color:'+(p===0?'#fff':'#6b7280')+';border:none;padding:2px 6px;border-radius:4px;font-size:.68em;font-weight:'+(p===0?'700':'500')+';cursor:pointer;font-family:inherit;min-width:16px">—</button>'
          +labels.map(lb=>{
            const on=p===lb.id;
            const bg=on?(lb.color||'#6b7280'):'transparent';
            const fg=on?'#fff':'#6b7280';
            const lbl=lb.name.length>6?lb.name.substring(0,5)+'…':lb.name;
            return '<button onclick="setRoomPriority(\''+rm.id+'\','+lb.id+')" title="'+escAttr(lb.name)+'" style="background:'+bg+';color:'+fg+';border:none;padding:2px 6px;border-radius:4px;font-size:.68em;font-weight:'+(on?'700':'500')+';cursor:pointer;font-family:inherit">'+e(lbl)+'</button>';
          }).join('')
          +'</div>';
      } else {
        /* 5개 이상은 드롭다운 (select) */
        const opts=['<option value="0">— 미분류</option>']
          .concat(labels.map(lb=>'<option value="'+lb.id+'"'+(p===lb.id?' selected':'')+' style="background:'+lb.color+'">'+e(lb.name)+'</option>'));
        priTabs='<select onclick="event.stopPropagation()" onchange="setRoomPriority(\''+rm.id+'\',this.value)" style="background:'+(p&&labelMap[p]?labelMap[p].color:'#f2f4f6')+';color:'+(p?'#fff':'#6b7280')+';border:none;padding:2px 4px;border-radius:4px;font-size:.68em;font-family:inherit;cursor:pointer;min-width:70px;max-width:110px">'+opts.join('')+'</select>';
      }
      /* 프로필 아바타 (카톡 스타일) */
      const memberName=rm.first_member_name||rm.name||'?';
      const avatarInitial=(memberName[0]||'?').toUpperCase();
      const avatar=rm.first_member_profile
        ? '<div style="flex-shrink:0;width:44px;height:44px;border-radius:50%;overflow:hidden;background:#f2f4f6"><img src="'+escAttr(rm.first_member_profile)+'" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\''+escAttr(avatarInitial)+'\';this.parentNode.style.display=\'flex\';this.parentNode.style.alignItems=\'center\';this.parentNode.style.justifyContent=\'center\';this.parentNode.style.color=\'#3182f6\';this.parentNode.style.fontWeight=\'700\';this.parentNode.style.fontSize=\'1.1em\'"></div>'
        : '<div style="flex-shrink:0;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3182f6,#5da3ff);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1em">'+escAttr(avatarInitial)+'</div>';
      /* 마지막 메시지 미리보기 + 시간 */
      const preview=rm.last_msg_preview?escAttr(rm.last_msg_preview):'새 상담방';
      const lastTime=rm.last_msg_at ? (rm.last_msg_at.substring(5,10).replace('-','.')+' '+rm.last_msg_at.substring(11,16)) : '';
      const closedTag=rm.status==='closed'?'<span class="ri-closed" style="font-size:.65em;color:#9ca3af;margin-left:4px">종료</span>':'';
      /* 🏢 연결된 업체 배지 — business_id 설정돼 있으면 상호 표시 */
      const bizBadge = rm.business_name
        ? '<span style="font-size:.66em;color:#1e40af;background:#dbeafe;padding:1px 6px;border-radius:10px;margin-right:4px" title="연결된 업체">🏢 '+escAttr(String(rm.business_name).slice(0,14))+'</span>'
        : '';
      return '<div class="'+cls.join(' ')+'" onclick="openRoom(\''+rm.id+'\')" ondblclick="event.stopPropagation();currentRoomId=\''+rm.id+'\';popoutCurrentRoom()" title="더블클릭하면 새 창으로 열립니다" style="display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #f2f4f6;cursor:pointer">'
        +avatar
        +'<div style="flex:1;min-width:0">'
        +  '<div style="display:flex;align-items:center;gap:4px">'
        +    '<span style="font-weight:700;font-size:.92em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+e(rm.name||'상담방')+'</span>'
        +    '<span style="font-size:.66em;color:#9ca3af;flex-shrink:0">'+aiIcon+' '+lastTime+'</span>'
        +  '</div>'
        +  '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">'
        +    '<span style="flex:1;min-width:0;font-size:.78em;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+bizBadge+preview+closedTag+'</span>'
        +    badge
        +  '</div>'
        +  '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'
        +    '<span style="font-size:.65em;color:#b0b8c1">👥 '+rm.member_count+'</span>'
        +    priTabs
        +  '</div>'
        +'</div>'
        +'</div>';
    };
    const sep=(title,color,count)=>count?'<div style="padding:8px 12px 4px;font-size:.72em;font-weight:800;color:'+color+';background:'+color+'11;border-bottom:1px solid '+color+'33">'+title+' <span style="opacity:.7">('+count+')</span></div>':'';

    /* 필터에 포함된 그룹만 렌더 — 라벨 순서대로 */
    let body='';
    for(const lb of labels){
      if(flt.has(lb.id)){
        const arr=groups[lb.id]||[];
        body+=sep(lb.name, lb.color||'#6b7280', arr.length)+arr.map(renderCard).join('');
      }
    }
    if(flt.has('none'))body+=sep('⚪ 미분류','#6b7280',groups.none.length)+groups.none.map(renderCard).join('');
    if(flt.has('closed'))body+=sep('📦 종료','#9ca3af',groups.closed.length)+groups.closed.map(renderCard).join('');
    if(!body)body='<div class="empty" style="padding:40px 20px;text-align:center;color:#8b95a1">필터에 해당하는 상담방이 없습니다</div>';

    el.innerHTML=filterBar+body;
    /* 좌측 상담방 탭 배지 갱신 */
    try{
      const tabBtn=document.querySelector('button[onclick*="tab(\'rooms\')"]');
      if(tabBtn){
        const old=tabBtn.querySelector('.tab-unread');if(old)old.remove();
        if(totalUnread>0){
          const sp=document.createElement('span');
          sp.className='tab-unread';
          sp.style.cssText='display:inline-block;margin-left:6px;background:#f04452;color:#fff;border-radius:10px;min-width:18px;padding:0 6px;font-size:.7em;font-weight:800;line-height:18px';
          sp.textContent=totalUnread>99?'99+':totalUnread;
          tabBtn.appendChild(sp);
        }
      }
    }catch{}
    /* 현재 열려있는 방은 미읽음 마킹 — non_advisor_msg_count (우선) */
    if(currentRoomId){
      const cur=d.rooms.find(rm=>rm.id===currentRoomId);
      if(cur)_adminRoomMarkRead(currentRoomId, cur.non_advisor_msg_count||cur.user_msg_count||0);
    }
    /* PC 알림 — 새 고객 메시지 감지 */
    _detectNewMessagesForNotify(d.rooms);
  }catch(err){$g('roomList').innerHTML='<div style="padding:20px;color:#f04452">오류: '+e(err.message)+'</div>'}
}

async function openRoom(roomId){
  currentRoomId=roomId;
  /* 햄버거·팝아웃 버튼 노출 */
  const mb=$g('roomMenuBtn');if(mb)mb.style.display='inline-block';
  const pb=$g('roomPopoutBtn');if(pb)pb.style.display='inline-block';
  /* Phase R8 (2026-05-05): 상담방 헤더 매핑 업체 표시 */
  if(typeof _refreshRoomBizChips==='function') setTimeout(()=>_refreshRoomBizChips(roomId), 200);
  /* roomActions: 기본 펼침 (모바일·PC 통일). ☰ 버튼으로 접기/펼치기 토글 가능 */
  $g('roomActions').style.display='flex';
  $g('roomInputArea').style.display='flex';
  $g('roomMembers').style.display='block';
  $g('roomsLayout').classList.add('show-chat');
  await loadRoomDetail();
  loadRoomList();
  if(roomMsgPollTimer)clearInterval(roomMsgPollTimer);
  roomMsgPollTimer=setInterval(loadRoomDetail,2000);
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
    currentRoomPhone=d.room.phone||null;
    currentRoomMembers=d.members||[];
    $g('roomChatTitle').innerHTML='<b>'+e(d.room.name||'상담방')+'</b> <span style="font-size:.75em;color:#8b95a1">('+currentRoomId+')</span>';
    $g('roomStatusBtn').textContent=currentRoomStatus==='active'?'종료':'재개';
    const mm=(d.members||[]).filter(m=>!m.left_at);
    /* 각 멤버를 span 으로 감싸 long-press·우클릭 시 '거래 종료' 등 메뉴 노출.
       role='admin' (세무사/직원) 은 제외 — 거래처 고객만 종료 대상 */
    $g('roomMembers').innerHTML='👥 멤버 '+mm.length+'명: '+mm.map(function(m){
      const nm=e(m.real_name||m.name||'이름없음');
      if(m.role==='admin')return nm+'(관리)';
      return '<span class="room-member" data-uid="'+(m.user_id||'')+'" data-name="'+escAttr(m.real_name||m.name||'')+'" style="cursor:context-menu;text-decoration:underline dotted #9ca3af;text-underline-offset:2px" title="꾹 누르면 메뉴 (거래 종료 등)">'+nm+'</span>';
    }).join(', ')+'  + 🏢 세무회계 이윤';
    _bindRoomMemberLongPress();

    const container=$g('roomMessages');
    const atBottom=container.scrollHeight-container.scrollTop-container.clientHeight<50;
    /* 날짜 구분선 */
    let _lastDateLabel=null;
    function _dateLabel(iso){
      if(!iso)return '';
      const d=String(iso).substring(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return '';
      const dt=new Date(d+'T00:00:00');
      const days=['일','월','화','수','목','금','토'];
      return d.substring(0,4)+'년 '+parseInt(d.substring(5,7),10)+'월 '+parseInt(d.substring(8,10),10)+'일 '+days[dt.getDay()]+'요일';
    }
    function _dateSep(m){
      const lab=_dateLabel(m.created_at);
      if(!lab||lab===_lastDateLabel)return '';
      _lastDateLabel=lab;
      return '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 10px"><div style="flex:1;height:1px;background:#e5e8eb"></div>'
        +'<div style="font-size:.7em;color:#8b95a1;background:#f2f4f6;padding:4px 12px;border-radius:12px;border:1px solid #e5e8eb">📅 '+lab+'</div>'
        +'<div style="flex:1;height:1px;background:#e5e8eb"></div></div>';
    }
    /* 사진 모아보기: 연속 [IMG] (같은 사용자·60초 이내·최대 9장) 하나의 그리드로 */
    const rawMsgs=d.messages||[];
    const groupedMsgs=[];
    for(let gi=0;gi<rawMsgs.length;gi++){
      const gm=rawMsgs[gi];
      const gp=parseMsg(gm.content);
      const isPurePhoto=gp.image&&!gp.reply&&!gp.doc_id&&!gp.file&&!gp.alert&&!gp.text&&!gm.deleted_at;
      if(isPurePhoto&&groupedMsgs.length){
        const prev=groupedMsgs[groupedMsgs.length-1];
        if(prev._isPhotoGroup&&prev.user_id===gm.user_id&&prev.role===gm.role&&prev._photos.length<9){
          const dt=new Date(gm.created_at)-new Date(prev._lastAt);
          if(dt<=60*1000){
            prev._photos.push({url:gp.image,msgId:gm.id,createdAt:gm.created_at});
            prev._lastAt=gm.created_at;
            continue;
          }
        }
      }
      if(isPurePhoto){
        groupedMsgs.push({
          _isPhotoGroup:true,
          id:gm.id, user_id:gm.user_id, role:gm.role,
          real_name:gm.real_name, name:gm.name,
          created_at:gm.created_at, _lastAt:gm.created_at,
          _photos:[{url:gp.image,msgId:gm.id,createdAt:gm.created_at}]
        });
      } else {
        groupedMsgs.push(gm);
      }
    }
    container.innerHTML=groupedMsgs.map(m=>{
      const sep=_dateSep(m);
      const nm=m.real_name||m.name||'';
      /* 사진 그룹 렌더링 */
      if(m._isPhotoGroup){
        return sep+renderPhotoGroupAdmin(m);
      }
      /* 삭제된 메시지 플레이스홀더 */
      if(m.deleted_at){
        return sep+'<div style="margin-bottom:10px;text-align:center;opacity:.6"><span style="display:inline-block;background:#f2f4f6;color:#8b95a1;padding:6px 14px;border-radius:10px;font-size:.75em;font-style:italic">삭제된 메시지입니다</span></div>';
      }
      /* 컨텍스트 메뉴용 데이터 (답장·복사·삭제) */
      const parsed=parseMsg(m.content);
      /* 영수증은 "🧾 가게 · 금액원 · 날짜", 사진은 "[사진]", 파일은 "[파일] 이름" 으로
         답장 인용 프리뷰와 복사 내용이 의미있는 텍스트가 되게 함 */
      let preview=parsed.text;
      if(!preview){
        if(parsed.doc_id && m.document){
          const d=m.document;
          const parts=[];
          if(d.vendor)parts.push(d.vendor);
          if(d.amount)parts.push(Number(d.amount).toLocaleString()+'원');
          if(d.receipt_date)parts.push(d.receipt_date);
          preview='🧾 '+(parts.length?parts.join(' · '):'영수증');
        } else if(parsed.image){
          preview='[사진]';
        } else if(parsed.file){
          preview='[파일] '+(parsed.file.name||'');
        }
      }
      const isAdvisor=m.role==='human_advisor';
      const canDel=isAdvisor?1:0;
      const kind = parsed.doc_id ? 'doc' : (parsed.image ? 'img' : (parsed.file ? 'file' : 'text'));
      const imgSrcAttr = parsed.image ? ' data-img-src="'+escAttr(parsed.image)+'"' : '';
      function attrs(sender,mine){
        return ' class="rc-msg-bubble" data-msg="'+m.id+'" data-sender="'+escAttr(sender)+'" data-text="'+escAttr(preview)+'" data-mine="'+(mine?1:0)+'" data-deletable="'+canDel+'" data-kind="'+kind+'"'+imgSrcAttr;
      }
      const ur=(m.unread_count>0)?'<span style="font-size:.68em;color:#f4c430;font-weight:700;margin:0 4px;align-self:flex-end">'+m.unread_count+'</span>':'';
      if(m.role==='user'){
        return sep+'<div style="margin-bottom:10px;display:flex;align-items:flex-end;gap:4px"><div style="max-width:70%"><div style="font-size:.7em;color:#8b95a1;margin-bottom:2px">'+e(nm)+'</div><div'+attrs(nm,0)+' style="display:inline-block;background:#fff;border:1px solid #e5e8eb;padding:10px 14px;border-radius:4px 14px 14px 14px;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content, m.document)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">'+e(m.created_at||'')+'</div></div></div>'+ur+'</div>';
      } else if(m.role==='assistant'){
        return sep+'<div style="margin-bottom:10px;display:flex;align-items:flex-end;gap:4px"><div'+attrs('AI',0)+' style="display:inline-block;background:#f2f4f6;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content, m.document)+'<div style="font-size:.65em;color:#8b95a1;margin-top:4px">🤖 AI · '+e(m.created_at||'')+'</div></div>'+ur+'</div>';
      } else if(m.role==='human_advisor'){
        return sep+'<div style="margin-bottom:10px;display:flex;justify-content:flex-end;align-items:flex-end;gap:4px">'+ur+'<div'+attrs('세무사',1)+' style="background:#10b981;color:#fff;padding:10px 14px;border-radius:14px 4px 14px 14px;max-width:70%;font-size:.85em;white-space:pre-wrap">'+renderMsgBody(m.content, m.document)+'<div style="font-size:.65em;opacity:.9;margin-top:4px"><img src="logo-icon.png" alt="" style="width:12px;height:12px;vertical-align:middle;object-fit:contain;margin-right:3px;filter:brightness(0) invert(1)"> 세무사 · '+e(m.created_at||'')+'</div></div></div>';
      }
      return '';
    }).join('');
    if(atBottom||adminForceScrollOnNext)container.scrollTop=container.scrollHeight;
    adminForceScrollOnNext=false;
  }catch(err){console.error(err)}
}

/* 사진 모아보기 그리드 (카톡 스타일, 최대 9장) */
function renderPhotoGroupAdmin(m){
  const photos=m._photos||[];
  const n=photos.length;
  if(!n)return '';
  const cols=n===1?1:(n<=4?2:3);
  const showMax=Math.min(n,9);
  const allUrls=photos.slice(0,9).map(p=>p.url);
  const allUrlsJs=JSON.stringify(allUrls).replace(/"/g,'&quot;');
  /* 꾹 누름(long-press)용 데이터: 각 타일이 독립 메시지라 자기 msgId 사용 */
  const isAdvisor=m.role==='human_advisor';
  const mineFlag=isAdvisor?1:0;
  const canDel=isAdvisor?1:0;
  const senderName=isAdvisor?'세무사':(m.real_name||m.name||'');
  let tiles='';
  for(let i=0;i<showMax;i++){
    const p=photos[i];
    const overlay=(n>9&&i===8)
      ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4em;font-weight:800">+'+(n-9)+'</div>'
      : '';
    tiles+='<div class="rc-msg-bubble" data-msg="'+p.msgId+'" data-sender="'+escAttr(senderName)+'" data-text="[사진]" data-mine="'+mineFlag+'" data-deletable="'+canDel+'" data-kind="img" data-img-src="'+escAttr(p.url)+'" style="position:relative;aspect-ratio:1/1;overflow:hidden;background:#f3f4f6;cursor:zoom-in" '
      +'onclick="if(window._lpJustFired){window._lpJustFired=false;return}openImgViewer(\''+p.url+'\','+allUrlsJs+')">'
      +'<img src="'+p.url+'" alt="사진" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">'
      +overlay+'</div>';
  }
  const grid='<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:2px;width:'+(cols===1?'240px':'260px')+';max-width:75%;border-radius:12px;overflow:hidden;background:#e5e8eb">'+tiles+'</div>';
  const timeStr=e(m.created_at||'').slice(11,16);
  const countBadge=n>1?'<div style="font-size:.68em;color:#8b95a1;margin-top:4px">🖼️ '+n+'장</div>':'';
  const nm=e(m.real_name||m.name||'');
  if(m.role==='human_advisor'){
    return '<div style="margin-bottom:10px;display:flex;justify-content:flex-end"><div>'
      +grid+countBadge
      +'<div style="font-size:.65em;color:#10b981;margin-top:3px;text-align:right;font-weight:600">👨\u200d💼 세무사 · '+timeStr+'</div></div></div>';
  }
  return '<div style="margin-bottom:10px"><div style="font-size:.7em;color:#8b95a1;margin-bottom:2px">'+nm+'</div>'
    +grid+countBadge
    +'<div style="font-size:.65em;color:#8b95a1;margin-top:3px">'+timeStr+'</div></div>';
}

/* 답장 인용 클릭 → 원본 메시지 스크롤·하이라이트 */
function jumpToOriginalMsgAdmin(mid){
  if(!mid)return;
  const bubble=document.querySelector('#roomChatBody .rc-msg-bubble[data-msg="'+mid+'"]')
            || document.querySelector('.rc-msg-bubble[data-msg="'+mid+'"]');
  if(!bubble){alert('원본 메시지를 찾을 수 없습니다');return}
  bubble.scrollIntoView({behavior:'smooth',block:'center'});
  const orig=bubble.style.boxShadow;
  bubble.style.transition='box-shadow .35s ease';
  bubble.style.boxShadow='0 0 0 3px rgba(244,196,48,.85)';
  setTimeout(()=>{bubble.style.boxShadow=orig||''},1400);
}

/* ===== 문서 의심 휴리스틱 (무료) =====
   이미지 비율만으로 "영수증" 또는 "문서 스캔" 의심 배지 달기.
   AI API 호출 없음 → 비용 0 */
function rcCheckDocSuspect(img){
  try{
    if(!img||!img.naturalWidth||!img.naturalHeight)return;
    const w=img.naturalWidth, h=img.naturalHeight;
    const ratio=h/w; /* 세로/가로 */
    const badge=img.parentElement&&img.parentElement.querySelector('.rc-doc-badge');
    if(!badge)return;
    let label='';
    if(ratio>=2.0){label='🧾 영수증 의심'}
    else if(w/h>=1.4||ratio>=1.35){label='📄 문서 의심'}
    if(label){
      badge.textContent=label;
      badge.style.display='inline-block';
    }
  }catch{}
}
/* 🔍 AI 확인 — Vision API 유료 호출 (세무사가 메뉴에서 클릭 시만) */
async function aiConfirmImage(messageId){
  hideMsgCtxMenu();
  const bubble=document.querySelector('.rc-msg-bubble[data-msg="'+messageId+'"]');
  const src=bubble&&bubble.getAttribute('data-img-src');
  if(!src){alert('이미지 URL 없음');return}
  if(typeof showAdminToast==='function')showAdminToast('🔍 AI 분석 중...');
  try{
    const r=await fetch('/api/admin-vision-classify?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image_url:src})
    });
    const d=await r.json();
    if(d.error){alert('실패: '+d.error);return}
    const labelMap={receipt:'🧾 영수증',lease:'🏠 임대차계약서',insurance:'🛡 보험증권',contract:'📝 계약서',identity:'🪪 신분증',business_reg:'📋 사업자등록증',bank_stmt:'🏦 은행거래내역',tax_invoice:'📑 세금계산서',other_doc:'📄 기타 문서',photo:'📷 일반 사진'};
    const niceKind=labelMap[d.kind]||d.kind;
    const conf=d.confidence!=null?' ('+Math.round(d.confidence*100)+'%)':'';
    const cost=d.cost_cents!=null?('\n비용: 약 ₩'+Math.round(d.cost_cents*14*10)/10):'';
    const msg='🔍 AI 판정\n\n유형: '+niceKind+conf+'\n요약: '+(d.summary||'—')+cost+
      '\n\n확인되면 "🧾 영수증으로 변환" 메뉴로 저장하세요.';
    alert(msg);
  }catch(e){alert('오류: '+e.message)}
}

