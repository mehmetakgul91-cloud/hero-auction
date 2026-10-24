// Server owns invitation consent, match settlement and exactly-once room admission.
export function createRoomInvitesUI({document:doc=globalThis.document,window:win=globalThis.window,translate=t=>t,onJoined=()=>{},onHosted=()=>{},canStart=()=>true,inboxRoot=null}={}){
 const $=id=>doc.getElementById(id),t=translate,root=inboxRoot||$('room-invites');
 const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 let login=null,room=null,seatToken=null,state={incoming:[],outgoing:[]},generation=0,serial=0,pending=false,busy=false,timer=null,suspended=false,roomVersion=0,presentation=0,notice=null;
 const attention=new Set();
 const labels={pending:'Yanıt bekleniyor',queued:'Gelecek · mevcut maçın bitmesi bekleniyor',joined:'Odaya katıldı',declined:'Gelmeyecek',cancelled:'Davet iptal edildi',failed:'Katılım başarısız',expired:'Davetin süresi doldu'};
 const text=(id,value)=>{if($(id))$(id).textContent=t(value)};
 async function request(path,body={},keepalive=false){const auth=login?.authToken;const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth}),keepalive});const data=await response.json();if(!response.ok)throw Error(t(data.error||'İşlem başarısız'));return data}
 const active=invite=>['pending','queued'].includes(invite.status);
 const inGame=()=>!!room&&!['waiting','matching'].includes(room.phase);
 const canHost=()=>room?.mode==='friend'&&room.phase==='waiting'&&room.me===0&&!room.players?.[1]&&!!seatToken;
 function message(kind,value){notice=value?{kind,value}:null;text('room-invites-message',value);}
 function handled(id){try{return JSON.parse(win.localStorage.getItem('hero-room-invites-handled')||'[]').includes(id)}catch{return false}}
 function markHandled(id){try{const ids=JSON.parse(win.localStorage.getItem('hero-room-invites-handled')||'[]');win.localStorage.setItem('hero-room-invites-handled',JSON.stringify([...new Set([...ids,id])].slice(-100)))}catch{}}
 function setLogin(next){if(next?.authToken===login?.authToken)return;generation++;serial++;login=next;pending=false;busy=false;state={incoming:[],outgoing:[]};attention.clear();win.clearInterval(timer);timer=null;message(null,'');if(root)root.open=false;render();if($('room-invite-send'))$('room-invite-send').disabled=false;text('room-invite-compose-message','');if($('room-invite-compose'))$('room-invite-compose').hidden=true;if($('room-invite-open'))$('room-invite-open').setAttribute('aria-expanded','false');if(login?.authToken){void refresh();timer=win.setInterval(()=>{if(!suspended)void refresh()},4000)}}
 function setRoom(next,token){
  const changed=room?.code!==next?.code||seatToken!==token,started=next?.phase==='auction'&&(room?.phase!=='auction'||next.round<room?.round);
  if(changed||room?.phase!==next?.phase||started)roomVersion++;
  room=next;seatToken=token;
  if(changed||started){presentation++;message(null,'');attention.clear();if(root)root.open=false;}
  text('room-invite-send',canHost()?'BU ODAYA DAVET ET':'ODA OLUŞTUR VE DAVET ET');render(changed||started);
 }
 function button(label,fn){const b=node('button',t(label),'outline');b.type='button';b.disabled=busy;b.onclick=fn;return b}
 function render(force=false){
  if(!root)return;const list=$('room-invites-list');if(!list)return;
  const all=[...state.incoming.map(v=>({...v,incoming:true})),...state.outgoing.map(v=>({...v,incoming:false}))];
  // Completed history is useful in the lobby, not above the auction or arena.
  const visible=[...all.filter(active),...all.filter(i=>!active(i)&&(!inGame()||attention.has(i.id))).slice(-10)];
  root.hidden=!login?.authToken||(!visible.length&&!notice);if(root.hidden){root.open=false;list.replaceChildren();return}
  const count=all.filter(active).length;text('room-invites-summary',t('Maç davetleri')+' · '+count+(attention.size||notice?' · !':''));
  // Do not disturb a keyboard user positioned on a response button during a poll.
  if(!force&&!busy&&list.contains?.(doc.activeElement))return;
  list.replaceChildren();for(const invite of visible){
   const row=node('div',undefined,'room-invite-row'),copy=node('div',undefined,'room-invite-copy'),name=node('strong',(invite.incoming?invite.from:invite.to).name);name.setAttribute('translate','no');copy.append(name,node('small',t('ODA')+' '+invite.code+' · '+t(labels[invite.status]||invite.status)));row.append(copy);
   if(invite.reason)copy.append(node('small',t(invite.reason)));
   if(active(invite)&&Number.isFinite(invite.expiresAt))copy.append(node('small',t('Son yanıt zamanı')+': '+new Date(invite.expiresAt).toLocaleTimeString(doc.documentElement?.lang==='en'?'en-GB':'tr-TR',{hour:'2-digit',minute:'2-digit'})));
   if(invite.incoming&&invite.status==='pending'){
    copy.append(node('small',t('Geleceğim: 50 altın giriş ücretini kabul ederim. Aktif maçım bitince bu odaya otomatik katılırım.')));
    row.append(button('GELECEĞİM',()=>void respond(invite.id,'accept')),button('GELMEYECEĞİM',()=>void respond(invite.id,'decline')));
   }else if(active(invite))row.append(button(invite.incoming?'VAZGEÇ':'DAVETİ İPTAL ET',()=>void cancel(invite.id)));
   list.append(row);
  }
 }
 async function refresh(force=false){
  if(!login?.authToken||(pending&&!force))return;
  const version=generation,sequence=++serial,view=presentation;pending=true;let stage='poll';
  try{const result=await request('/api/friend/invitations');if(version!==generation||sequence!==serial)return;
   const previous=new Map([...state.incoming,...state.outgoing].map(i=>[i.id,i]));
   for(const invite of [...result.incoming,...result.outgoing])if(view===presentation&&['failed','expired','cancelled'].includes(invite.status)&&active(previous.get(invite.id)||{}))attention.add(invite.id);
   state=result;if(notice?.kind==='poll')message(null,'');render();
   for(const invite of state.incoming){if(invite.status!=='joined'||!invite.room||!invite.token)continue;
    let navigate;stage='handoff';
    if(!handled(invite.id)){navigate=await onJoined({token:invite.token,room:invite.room,inviteId:invite.id});if(version!==generation)return;markHandled(invite.id);}
    if(notice?.kind==='handoff')message(null,'');
    try{await request('/api/friend/invite/ack',{inviteId:invite.id},true);if(version===generation&&notice?.kind==='ack')message(null,'')}catch(e){if(version===generation){message('ack',e.message);render()}}
    if(version!==generation)return;if(typeof navigate==='function')navigate();
   }
   render();
  }catch(e){if(version===generation&&sequence===serial&&(stage!=='poll'||view===presentation)&&!suspended&&e.name!=='AbortError'&&(stage!=='poll'||!notice||notice.kind==='poll')){message(stage,e.message);render()}}finally{if(version===generation&&sequence===serial)pending=false}
 }
 async function change(path,body){if(busy||!login?.authToken)return;if(!canStart()){message('action','Oda işlemi sürüyor. Lütfen bekle.');render();return}const version=generation,view=presentation;let succeeded=false;busy=true;message('action','İşleniyor…');render();try{await request(path,body);if(version!==generation)return;succeeded=true;if(view===presentation)message(null,'')}catch(e){if(version===generation&&view===presentation)message('action',e.message)}finally{if(version===generation){busy=false;await refresh(true);if(succeeded&&path==='/api/friend/invite/cancel')attention.delete(body.inviteId);render()}}}
 const respond=(inviteId,response)=>change('/api/friend/invite/respond',{inviteId,response,...(response==='accept'?{consent:true,expectedCost:50,...(room?.code&&seatToken?{sourceCode:room.code,sourceToken:seatToken}:{})}:{})});
 const cancel=inviteId=>change('/api/friend/invite/cancel',{inviteId});
 async function open(){
  if(!login?.authToken)return;const panel=$('room-invite-compose');if(!panel)return;panel.hidden=!panel.hidden;$('room-invite-open')?.setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)return;
  const version=generation;text('room-invite-compose-message','Yükleniyor…');
  try{const data=await request('/api/friends');if(version!==generation)return;const select=$('room-invite-friend');select.replaceChildren();for(const person of data.friends){const option=node('option',person.name+' · '+t(person.online?'Çevrimiçi':'Çevrimdışı'));option.value=person.playerId;option.setAttribute('translate','no');select.append(option)}if($('room-invite-send'))$('room-invite-send').disabled=!data.friends.length;text('room-invite-compose-message',data.friends.length?'':'Önce Arkadaşlar sekmesinden bir arkadaş ekle.');}
  catch(e){if(version===generation)text('room-invite-compose-message',e.message)}
 }
 async function sendTo(playerId){
  if(busy||!login?.authToken||!playerId)return false;
  if(!canStart()){const error=t('Oda işlemi sürüyor. Lütfen bekle.');text('room-invite-compose-message',error);message('action',error);render();throw Error(error)}
  const version=generation,previousRoom=roomVersion;let view=presentation,created=null;busy=true;if($('room-invite-send'))$('room-invite-send').disabled=true;text('room-invite-compose-message','İşleniyor…');
  try{
   if(room&&!canHost())throw Error(t('Davet için boş bir özel oda oluşturmalısın.'));
   if(!room){
    created=await request('/api/create',{});if(version!==generation||previousRoom!==roomVersion)return false;
    // Persist/show first. A failed save must not leave a reusable, invisible host room.
    await onHosted(created);if(version!==generation)return false;
    if(previousRoom===roomVersion)setRoom(created.room,created.token);
    else if(room?.code!==created.room.code||seatToken!==created.token)return false;
    view=presentation;
   }
   if(!canHost())throw Error(t('Davet için boş bir özel oda oluşturmalısın.'));
   view=presentation;await request('/api/friend/invite',{code:room.code,token:seatToken,playerId});if(version!==generation)return false;
   if(view===presentation){text('room-invite-compose-message','Maç daveti gönderildi.');message(null,'');if(root&&!inGame())root.open=true;}return true;
  }catch(e){if(version===generation&&(view===presentation||(created&&room?.code===created.room.code&&seatToken===created.token))){text('room-invite-compose-message',e.message);message('action',e.message);render();if(root&&!inGame())root.open=true;throw e}return false;}
  finally{if(version===generation){busy=false;if($('room-invite-send'))$('room-invite-send').disabled=false;await refresh(true)}}
 }
 async function send(){try{await sendTo($('room-invite-friend')?.value)}catch{/* Displayed by the shared send flow. */}}
 async function cancelRoomInvites(code){const version=generation;await refresh(true);if(version!==generation)return;for(const invite of state.outgoing.filter(i=>i.code===code&&active(i)))await request('/api/friend/invite/cancel',{inviteId:invite.id});await refresh(true)}
 if($('room-invite-open'))$('room-invite-open').onclick=()=>void open();if($('room-invite-send'))$('room-invite-send').onclick=()=>void send();
 const hide=()=>{suspended=true;serial++;pending=false},show=()=>{suspended=false;void refresh()};win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
 return {setLogin,setRoom,refresh,sendTo,cancelRoomInvites,get busy(){return busy},destroy(){generation++;win.clearInterval(timer);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show)}};
}
