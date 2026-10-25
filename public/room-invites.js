// Server owns invitation consent, match settlement and exactly-once room admission.
export const ROOM_INVITE_LABELS={pending:'Yanıt bekleniyor',queued:'Kabul edildi · maçın bitmesi bekleniyor',joined:'Odaya katıldı',declined:'Davet reddedildi',cancelled:'Davet iptal edildi',failed:'Katılım başarısız',expired:'Davetin süresi doldu'};
// Native modal dialogs make body siblings inert. Keep the same card and live
// announcer in the active modal's top layer, then return them to the body. This
// does not open/close dialogs, move focus, duplicate actions, or lock scrolling.
export function portalRoomInvites({document:doc,window:win,root,announcement}){
 if(!root||!doc.body||!doc.querySelectorAll)return {sync(){},destroy(){}};
 let order=[];
 function sync(records=[]){
  if(!Array.isArray(records))records=[];
  const open=[...doc.querySelectorAll('dialog[open]')].filter(dialog=>{try{return dialog.matches(':modal')}catch{return true}});
  order=order.filter(dialog=>open.includes(dialog));
  for(const record of records)if(record.type==='attributes'&&open.includes(record.target)){order=order.filter(dialog=>dialog!==record.target);order.push(record.target)}
  for(const dialog of open)if(!order.includes(dialog))order.push(dialog);
  const parent=order.at(-1)||doc.body;
  for(const item of [announcement,root])if(item&&item.parentNode!==parent)parent.append(item);
 }
 // Ignore ordinary arena/card DOM churn; only dialog changes need reparenting.
 const changed=records=>{if(records.some(record=>record.type==='attributes'&&record.target.tagName==='DIALOG'||record.type==='childList'&&[...(record.addedNodes||[]),...(record.removedNodes||[])].some(node=>node.tagName==='DIALOG'||node.querySelector?.('dialog'))))sync(records)};
 const observer=win.MutationObserver?new win.MutationObserver(changed):null;
 observer?.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 // close is captured as an additional signal for browsers with delayed records.
 doc.addEventListener?.('close',sync,true);sync();
 return {sync,destroy(){observer?.disconnect();doc.removeEventListener?.('close',sync,true);for(const item of [announcement,root])if(item&&item.parentNode!==doc.body)doc.body.append(item)}};
}
export function createRoomInvitesUI({document:doc=globalThis.document,window:win=globalThis.window,translate=t=>t,onJoined=()=>{},onHosted=()=>{},onStateChange=()=>{},canStart=()=>true,inboxRoot=null}={}){
 const $=id=>doc.getElementById(id),t=translate,root=inboxRoot||$('room-invites');
 const node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 // A click-through viewport anchor contains one independently scrollable card.
 if(root&&!root.querySelector?.('.room-invite-surface')){const surface=node('div',undefined,'room-invite-surface');surface.append(...(root.childNodes||[]));root.replaceChildren(surface);}
 const portal=portalRoomInvites({document:doc,window:win,root,announcement:$('room-invites-announcement')});
 let login=null,room=null,seatToken=null,state={incoming:[],outgoing:[]},generation=0,serial=0,pending=false,busy=false,timer=null,suspended=false,roomVersion=0,presentation=0,notice=null,selectedId=null,renderKey='';
 const attention=new Set(),handling=new Set();
 const text=(id,value)=>{if($(id))$(id).textContent=t(value)};
 async function request(path,body={},keepalive=false){const auth=login?.authToken;const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth}),keepalive});const data=await response.json();if(!response.ok)throw Error(t(data.error||'İşlem başarısız'));return data}
 const active=invite=>['pending','queued'].includes(invite.status);
 const canHost=()=>room?.mode==='friend'&&room.phase==='waiting'&&room.me===0&&!room.players?.[1]&&!!seatToken;
 function message(kind,value){notice=value?{kind,value}:null;text('room-invites-message',value);}
 function handled(id){try{return JSON.parse(win.localStorage.getItem('hero-room-invites-handled')||'[]').includes(id)}catch{return false}}
 function markHandled(id){try{const ids=JSON.parse(win.localStorage.getItem('hero-room-invites-handled')||'[]');win.localStorage.setItem('hero-room-invites-handled',JSON.stringify([...new Set([...ids,id])].slice(-100)))}catch{}}
 function setLogin(next){if(next?.authToken===login?.authToken)return;generation++;serial++;login=next;pending=false;busy=false;state={incoming:[],outgoing:[]};onStateChange(state);selectedId=null;renderKey='';attention.clear();win.clearInterval(timer);timer=null;message(null,'');render();if($('room-invite-send'))$('room-invite-send').disabled=false;text('room-invite-compose-message','');text('room-invites-announcement','');if($('room-invite-compose'))$('room-invite-compose').hidden=true;if($('room-invite-open'))$('room-invite-open').setAttribute('aria-expanded','false');if(login?.authToken){void refresh();timer=win.setInterval(()=>{if(!suspended)void refresh()},4000)}}
 function setRoom(next,token){
  const changed=room?.code!==next?.code||seatToken!==token,started=next?.phase==='auction'&&(room?.phase!=='auction'||next.round<room?.round);
  if(changed||room?.phase!==next?.phase||started)roomVersion++;
  room=next;seatToken=token;
  if(changed||started){presentation++;message(null,'');attention.clear();}
  text('room-invite-send',canHost()?'BU ODAYA DAVET ET':'ODA OLUŞTUR VE DAVET ET');render();
 }
 function button(label,fn,cls=''){const b=node('button',t(label),'room-invite-action '+cls);b.type='button';b.disabled=busy;b.onclick=fn;return b}
 const allInvites=()=>[...state.incoming.map(v=>({...v,incoming:true})),...state.outgoing.map(v=>({...v,incoming:false}))];
 // A joined receipt is no longer an attention card once the authoritative
 // current-room snapshot shows these same players in the admitted seats.
 const joinedHere=invite=>invite.status==='joined'&&!!seatToken&&room?.code===invite.code&&['auction','finished'].includes(room.phase)&&room.me===(invite.incoming?1:0)&&!!invite.from?.playerId&&!!invite.to?.playerId&&room.players?.[0]?.playerId===invite.from.playerId&&room.players?.[1]?.playerId===invite.to.playerId;

 function render(force=false){
  if(!root)return;portal.sync();const list=$('room-invites-list');if(!list)return;
  const all=allInvites(),queued=state.incoming.find(i=>i.status==='queued');
  // Room SSE and invitation polling can arrive in either order, including after
  // reconnect. Remove only completed admissions; unrelated requests stay visible.
  for(const invite of all)if(joinedHere(invite))attention.delete(invite.id);
  const visible=[...all.filter(i=>i.incoming&&active(i)),...all.filter(i=>!i.incoming&&active(i)),...all.filter(i=>attention.has(i.id)&&!active(i))];
  root.hidden=!login?.authToken||(!visible.length&&!notice);
  if(root.hidden){list.replaceChildren();renderKey='';return}
  // One card at a time keeps a burst of invitations from covering game controls.
  // A queued acceptance stays selected until the server resolves it or the player cancels.
  let chosen=visible.find(i=>i.id===selectedId)||visible.find(i=>i.id===queued?.id)||visible[0];
  selectedId=chosen?.id||null;
  const index=visible.indexOf(chosen),summary=t('Maç davetleri')+(visible.length?' · '+(index+1)+' / '+visible.length:'');
  text('room-invites-summary',summary);
  const next=$('room-invites-next');if(next){next.hidden=visible.length<2;next.disabled=busy;next.textContent=t('Diğer davet');next.onclick=()=>{selectedId=visible[(index+1)%visible.length]?.id;render(true)}}
  const key=JSON.stringify([chosen,queued?.id,busy,chosen?.status==='joined'?room?.code:null]);
  if(!force&&key===renderKey){return}renderKey=key;
  const history=$('room-invites-history');if(history){history.replaceChildren();const recent=all.filter(i=>!active(i)).slice(-10);for(const i of recent){const line=node('p',undefined,'room-invite-history-row');const name=node('strong',(i.incoming?i.from:i.to)?.name||t('Oyuncu'));name.setAttribute('translate','no');line.append(name,node('span',t(ROOM_INVITE_LABELS[i.status]||i.status)));history.append(line)}if(history.parentElement)history.parentElement.hidden=!recent.length}
  list.replaceChildren();if(!chosen){return}
  const invite=chosen,row=node('article',undefined,'room-invite-row '+(invite.incoming?'incoming':'outgoing'));
  row.setAttribute('data-status',invite.status);
  const copy=node('div',undefined,'room-invite-copy');
  const kicker=node('small',t(invite.incoming?'SANA MAÇ DAVETİ':'GÖNDERDİĞİN DAVET')+' · '+t('ODA')+' '+invite.code,'room-invite-kicker');
  const name=node('strong',(invite.incoming?invite.from:invite.to)?.name||t('Oyuncu'),'room-invite-name');name.setAttribute('translate','no');
  copy.append(kicker,name);
  const elsewhere=invite.incoming&&invite.status==='joined'&&!invite.room&&room?.code!==invite.code;
  const status=elsewhere?'Başka sekmede katıldın':invite.incoming&&invite.status==='queued'?'Maç bitince katılacaksın':ROOM_INVITE_LABELS[invite.status]||invite.status;
  copy.append(node('span',t(status),'room-invite-status'));
  if(invite.reason)copy.append(node('small',t(invite.reason),'room-invite-reason'));
  if(active(invite)&&Number.isFinite(invite.expiresAt))copy.append(node('small',t('Son yanıt zamanı')+': '+new Date(invite.expiresAt).toLocaleTimeString(doc.documentElement?.lang==='en'?'en-GB':'tr-TR',{hour:'2-digit',minute:'2-digit'}),'room-invite-expiry'));
  row.append(copy);
  if(invite.incoming&&invite.status==='pending'){
   const fee=node('p',t('Onayla: 50 altın giriş ücretini kabul et. Aktif maçın varsa sonucu kesinleşince katılırsın.'),'room-invite-fee');fee.id='room-invite-consent';row.append(fee);
   const accept=button('Onayla',()=>void respond(invite.id,'accept'),'accept');accept.setAttribute('aria-describedby',fee.id);accept.disabled=busy||!!queued;
   if(queued)copy.append(node('small',t('Önce kabul ettiğin daveti tamamla veya iptal et.')));
   row.append(accept,button('Reddet',()=>void respond(invite.id,'decline'),'decline'));
  }else if(active(invite)){
   row.append(node('p',t(invite.incoming?'Mevcut oyunun bölünmez. 50 altın yalnız yeni odaya katılınca alınır.':'Oda ücretsiz. Maça giriş kişi başı 50 altın; yalnız katılımda alınır.'),'room-invite-fee'));
   row.append(button(invite.incoming?'VAZGEÇ':'DAVETİ İPTAL ET',()=>void cancel(invite.id),'cancel'));
  }else if(elsewhere){row.append(button('Güncel odayı aç',()=>void openJoinedRoom(invite),'accept'),button('Kapat',()=>{attention.delete(invite.id);selectedId=null;render(true)},'decline'));}
  else row.append(button('Kapat',()=>{attention.delete(invite.id);selectedId=null;render(true)},'dismiss'));
  list.append(row);
 }
 function applyState(result,view=presentation){
  if(!Array.isArray(result?.incoming)||!Array.isArray(result?.outgoing))return;
  const previous=new Map(allInvites().map(i=>[i.id,i]));
  for(const invite of [...result.incoming,...result.outgoing])if(view===presentation&&['joined','declined','failed','expired','cancelled'].includes(invite.status)&&active(previous.get(invite.id)||{}))attention.add(invite.id);
  const fresh=result.incoming.find(i=>i.status==='pending'&&!previous.has(i.id));
  if(fresh&&!$('room-invites-list')?.contains(doc.activeElement)&&!result.incoming.some(i=>i.status==='queued')&&!state.incoming.some(i=>i.id===selectedId&&active(i)))selectedId=fresh.id;
  state=result;onStateChange(state);
  const change=[...result.incoming,...result.outgoing].find(i=>previous.has(i.id)&&previous.get(i.id).status!==i.status);
  if(change)text('room-invites-announcement',((result.incoming.some(i=>i.id===change.id)?change.from:change.to)?.name||t('Oyuncu'))+' · '+t(ROOM_INVITE_LABELS[change.status]||change.status));
  else if(fresh)text('room-invites-announcement',t('Yeni maç daveti')+': '+(fresh.from?.name||t('Oyuncu'))+'. '+t('Onayla veya reddet.'));

 }
 async function openJoinedRoom(invite){
  if(busy||!login?.authToken||!canStart())return;
  const version=generation,currentRoom=roomVersion;busy=true;render();
  try{
   // Another tab already saved and acknowledged this server-confirmed invitation.
   // Never navigate from a storage event alone or replace a newer stored room.
   const storedSession=win.localStorage.getItem('hero-auction-session');
   const saved=JSON.parse(storedSession||'null');
   if(saved?.code!==invite.code||!saved?.token)throw Error(t('Güncel oda bulunamadı. Ana menüden tekrar bağlan.'));
   const result=await request('/api/state',{code:saved.code,token:saved.token});if(version!==generation)return;
   if(roomVersion!==currentRoom||win.localStorage.getItem('hero-auction-session')!==storedSession)throw Error(t('Aktif odan değişti. Daveti yeniden aç.'));
   if(result.room?.code!==invite.code||result.room.me!==1||result.room.players?.[0]?.playerId!==invite.from?.playerId)throw Error(t('Güncel oda bulunamadı. Ana menüden tekrar bağlan.'));
   const navigate=await onJoined({token:saved.token,room:result.room,inviteId:invite.id});if(version!==generation)return;
   attention.delete(invite.id);if(typeof navigate==='function')navigate();
  }catch(e){if(version===generation)message('action',e.message)}finally{if(version===generation){busy=false;render()}}
 }
 async function refresh(force=false){
  if(!login?.authToken||(pending&&!force))return;
  const version=generation,sequence=++serial,view=presentation;pending=true;let stage='poll';
  try{const result=await request('/api/friend/invitations');if(version!==generation||sequence!==serial)return;
   applyState(result,view);if(notice?.kind==='poll')message(null,'');render();
   for(const invite of state.incoming){if(invite.status!=='joined'||!invite.room||!invite.token||handling.has(invite.id))continue;
    handling.add(invite.id);try{
    let navigate;stage='handoff';
    if(!handled(invite.id)){navigate=await onJoined({token:invite.token,room:invite.room,inviteId:invite.id});if(version!==generation)return;markHandled(invite.id);attention.delete(invite.id);}
    // A receipt handled by another tab still needs its explicit recovery card
    // here unless joinedHere already proves this tab reached the admitted room.
    if(notice?.kind==='handoff')message(null,'');
    try{await request('/api/friend/invite/ack',{inviteId:invite.id},true);if(version===generation&&notice?.kind==='ack')message(null,'')}catch(e){if(version===generation){message('ack',e.message);render()}}
    if(version!==generation)return;if(typeof navigate==='function')navigate();
    }finally{handling.delete(invite.id)}
   }
   render();
  }catch(e){if(version===generation&&sequence===serial&&(stage!=='poll'||view===presentation)&&!suspended&&e.name!=='AbortError'&&(stage!=='poll'||!notice||notice.kind==='poll')){message(stage,e.message);render()}}finally{if(version===generation&&sequence===serial)pending=false}
 }
 async function change(path,body){if(busy||!login?.authToken)return;if(!canStart()){message('action','Oda işlemi sürüyor. Lütfen bekle.');render();return}const version=generation,view=presentation;let succeeded=false;busy=true;message('action','İşleniyor…');render();try{const result=await request(path,body);if(version!==generation)return;applyState(result,view);succeeded=true;if(view===presentation)message(null,'')}catch(e){if(version===generation&&view===presentation)message('action',e.message)}finally{if(version===generation){busy=false;await refresh(true);if(succeeded&&(path==='/api/friend/invite/cancel'||body.response==='decline'))attention.delete(body.inviteId);render()}}}
 const respond=(inviteId,response)=>state.incoming.some(i=>i.id===inviteId&&i.status==='pending')&&change('/api/friend/invite/respond',{inviteId,response,...(response==='accept'?{consent:true,expectedCost:50,...(room?.code&&seatToken?{sourceCode:room.code,sourceToken:seatToken}:{})}:{})});
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
   view=presentation;const sent=await request('/api/friend/invite',{code:room.code,token:seatToken,playerId});if(version!==generation)return false;applyState(sent,view);
   if(view===presentation){text('room-invite-compose-message','Maç daveti gönderildi.');message(null,'');}return true;
  }catch(e){if(version===generation&&(view===presentation||(created&&room?.code===created.room.code&&seatToken===created.token))){text('room-invite-compose-message',e.message);message('action',e.message);render();throw e}return false;}
  finally{if(version===generation){busy=false;if($('room-invite-send'))$('room-invite-send').disabled=false;await refresh(true)}}
 }
 async function send(){try{await sendTo($('room-invite-friend')?.value)}catch{/* Displayed by the shared send flow. */}}
 async function cancelRoomInvites(code){const version=generation;await refresh(true);if(version!==generation)return;for(const invite of state.outgoing.filter(i=>i.code===code&&active(i)))await request('/api/friend/invite/cancel',{inviteId:invite.id});await refresh(true)}
 if($('room-invite-open'))$('room-invite-open').onclick=()=>void open();if($('room-invite-send'))$('room-invite-send').onclick=()=>void send();
 const stored=event=>{if(event.key==='hero-auction-session'&&!suspended)void refresh(true)};win.addEventListener('storage',stored);
 const reconnect=()=>{if(!suspended)void refresh(true)};win.addEventListener('online',reconnect);
 const hide=()=>{suspended=true;serial++;pending=false},show=()=>{suspended=false;void refresh()};win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
 return {setLogin,setRoom,refresh,sendTo,cancelRoomInvites,get busy(){return busy},destroy(){generation++;portal.destroy();win.removeEventListener('storage',stored);win.removeEventListener('online',reconnect);win.clearInterval(timer);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show)}};
}
