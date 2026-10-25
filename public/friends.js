import {ROOM_INVITE_LABELS} from './room-invites.js';
// Public IDs and relationship state only; never put login tokens into markup.
export function createFriendsUI({document:doc=globalThis.document,window:win=globalThis.window,translate=t=>t,notify=()=>{},onOpen=()=>{},onInvite=null,opponentRoot=null}={}){
 const $=id=>doc.getElementById(id),t=translate;
 const panel=$('friends-panel'),nav=$('home-friends-tab'),opponent=opponentRoot||$('friend-opponent');
 const sessionId=win.crypto.randomUUID();
 let login=null,data=null,room=null,generation=0,pending=false,mutating=false,opponentBusy=false,timer=null,requestSerial=0,suspended=false;
 let inviteTarget=null,inviteBusy=false,inviteRevision=0,invitationState={incoming:[],outgoing:[]};
 const sentInvite=id=>[...invitationState.outgoing].reverse().find(i=>i.to?.playerId===id);
 function setInvitations(next){if(JSON.stringify(next)===JSON.stringify(invitationState))return;invitationState=next;if(panel&&!panel.hidden&&!$('friends-lists')?.contains(doc.activeElement))renderLists();}
 const node=(tag,text,cls)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
 function message(text){if($('friends-message'))$('friends-message').textContent=t(text)}
 async function request(path,body={},auth=login?.authToken,keepalive=false){
  const response=await win.fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,authToken:auth}),keepalive});
  const value=await response.json();if(!response.ok)throw Error(t(value.error||'İşlem başarısız'));return value;
 }
 function heartbeat(online=true,auth=login?.authToken){if(auth)void request('/api/friends/presence',{sessionId,online},auth,!online).catch(()=>{})}
 function setLogin(next){
  if(next?.authToken===login?.authToken)return;
  heartbeat(false);generation++;pending=false;mutating=false;opponentBusy=false;inviteBusy=false;login=next;data=null;invitationState={incoming:[],outgoing:[]};win.clearInterval(timer);timer=null;
  close();message('');if($('friend-add'))$('friend-add').disabled=false;if($('friends-lists'))$('friends-lists').replaceChildren();if($('friend-own-id'))$('friend-own-id').value='';if($('friend-id'))$('friend-id').value='';
  renderOpponent();renderBadge();if($('friend-copy'))$('friend-copy').disabled=true;
  if(login?.authToken){heartbeat();void refresh();timer=win.setInterval(()=>{if(!suspended){heartbeat();void refresh()}},20000)}
 }
 function renderBadge(){const badge=$('friends-online-count');if(badge)badge.textContent=data?`${data.friends.filter(p=>p.online).length} ${t('çevrimiçi')}`:t('Arkadaşların');}
 function renderOpponent(){
  if(!opponent)return;
  const target=room?.mode!=='bot'&&Number.isInteger(room?.me)?room.players?.[1-room.me]:null;
  opponent.hidden=!login?.authToken||!target?.playerId;
  if(opponent.hidden)return;
  const id=target.playerId,accepted=data?.friends.some(p=>p.playerId===id),outgoing=data?.outgoing.some(p=>p.playerId===id),incoming=data?.incoming.some(p=>p.playerId===id);
  opponent.textContent=t(accepted?'✓ Arkadaşın':outgoing?'İstek gönderildi':incoming?'Arkadaşlığı kabul et':'＋ Rakibi arkadaş ekle');
  opponent.disabled=opponentBusy||!!accepted||!!outgoing;
  opponent.onclick=async()=>{if(opponentBusy)return;const version=generation;opponentBusy=true;renderOpponent();try{await request('/api/friend/'+(incoming?'accept':'add'),{playerId:id});if(version!==generation)return;await refresh(true);notify(t(incoming?'Arkadaşlık kabul edildi.':'Arkadaşlık isteği gönderildi.'))}catch(e){if(version===generation)notify(e.message)}finally{if(version===generation){opponentBusy=false;renderOpponent()}}};
 }
 const canHostInvite=()=>!room||(room.mode==='friend'&&room.phase==='waiting'&&room.me===0&&!room.players?.[1]);
 const onlineFriend=id=>data?.friends.find(person=>person.playerId===id&&person.online);
 const roomContext=value=>JSON.stringify(value?[value.code,value.mode,value.phase,value.me,!!value.players?.[1]]:null);
 function setRoom(value){const changed=roomContext(room)!==roomContext(value);room=value;renderOpponent();if(changed){if(inviteTarget||inviteBusy)message('');inviteTarget=null;inviteRevision++;if(panel&&!panel.hidden)renderLists()}}
 function actionButton(label,action,id){const button=node('button',t(label),'outline');button.type='button';button.disabled=mutating||inviteBusy;button.onclick=()=>void mutate(action,id);return button}
 function beginInvite(id,version){
  if(version!==generation||mutating||inviteBusy||!login?.authToken||!onInvite||panel?.hidden)return;
  if(!canHostInvite()){message('Davet için önce mevcut odandan ayrılmalısın.');return}
  if(['pending','queued'].includes(sentInvite(id)?.status)){message('Yanıt bekleniyor');return}
  if(!onlineFriend(id)){message('Bu arkadaş artık çevrimiçi değil veya arkadaş listende yok.');return}
  inviteTarget=id;inviteRevision++;message('');renderLists();$('friends-lists')?.querySelector?.('.friend-invite-send')?.focus();
 }
 async function confirmInvite(id,version,revision){
  if(version!==generation||revision!==inviteRevision||inviteTarget!==id||mutating||inviteBusy||!login?.authToken||panel?.hidden)return;
  if(['pending','queued'].includes(sentInvite(id)?.status)){inviteTarget=null;inviteRevision++;renderLists();return}
  if(!canHostInvite()||!onlineFriend(id)){inviteTarget=null;inviteRevision++;message(canHostInvite()?'Bu arkadaş artık çevrimiçi değil veya arkadaş listende yok.':'Davet için önce mevcut odandan ayrılmalısın.');renderLists();return}
  inviteBusy=true;renderLists();message('İşleniyor…');
  try{const sent=await onInvite(id);if(version!==generation||revision!==inviteRevision)return;if(sent!==false){inviteTarget=null;inviteRevision++;message('Maç daveti gönderildi.');notify(t('Maç daveti gönderildi.'))}else message('');}
  catch(e){if(version===generation&&revision===inviteRevision)message(e.message)}
  finally{if(version===generation){inviteBusy=false;if(panel&&!panel.hidden)renderLists()}}
 }
 function inviteConfirmation(person){
  const version=generation,revision=inviteRevision,box=node('div',undefined,'friend-invite-confirm');box.setAttribute('role','group');box.setAttribute('aria-label',t('Davet edilecek arkadaş')+': '+person.name);
  const name=node('strong',person.name);name.setAttribute('translate','no');box.append(name,node('p',t('Arkadaşını özel odana davet et. Mevcut maçı varsa bitince katılır. Oda oluşturmak ücretsiz; maça giriş kişi başı 50 altın.'),'hint'));
  const actions=node('div',undefined,'friend-actions'),confirm=node('button',t(room?'BU ODAYA DAVET ET':'ODA OLUŞTUR VE DAVET ET'),'outline friend-invite-send'),cancel=node('button',t('VAZGEÇ'),'outline');
  confirm.type=cancel.type='button';confirm.disabled=cancel.disabled=inviteBusy;confirm.onclick=()=>void confirmInvite(person.playerId,version,revision);cancel.onclick=()=>{if(version!==generation||revision!==inviteRevision||inviteBusy)return;inviteTarget=null;inviteRevision++;message('');renderLists()};actions.append(confirm,cancel);box.append(actions);return box;
 }
 function renderLists(){
  const root=$('friends-lists');if(!root||!data)return;
  root.replaceChildren();
  for(const [key,title,empty] of [['incoming','Gelen istekler','Bekleyen istek yok.'],['outgoing','Gönderilen istekler','Gönderilen istek yok.'],['friends','Arkadaşlarım','Henüz arkadaş yok.']]){
   const section=node('section',undefined,'friends-section');section.append(node('h3',t(title)+' · '+data[key].length));
   if(!data[key].length)section.append(node('p',t(empty),'hint'));
   for(const person of (key==='friends'?[...data[key]].sort((a,b)=>Number(b.online)-Number(a.online)):data[key])){
    const row=node('div',undefined,'friend-row'),identity=node('div',undefined,'friend-identity'),name=node('strong',person.name);name.setAttribute('translate','no');
    const id=node('small',person.playerId);id.setAttribute('translate','no');identity.append(name,id);row.append(identity);
    if(key==='friends'){
     row.className+=' friend-roster-row';const avatar=node('span',person.name?.slice(0,1)||'✦','friend-avatar');avatar.setAttribute('aria-hidden','true');row.append(avatar);
     identity.append(node('span',t(person.online?'Çevrimiçi':'Çevrimdışı'),'friend-presence '+(person.online?'online':'')));
     const sent=sentInvite(person.playerId);if(sent)identity.append(node('span',t(ROOM_INVITE_LABELS[sent.status]||sent.status),'friend-invite-state'));
    }
    const actions=node('div',undefined,'friend-actions');
    if(key==='incoming')actions.append(actionButton('KABUL ET','accept',person.playerId),actionButton('REDDET','decline',person.playerId));
    else{
     if(key==='friends'&&person.online&&onInvite){const version=generation,invite=node('button',t('DAVET ET'),'outline friend-invite');invite.type='button';const alreadySent=['pending','queued'].includes(sentInvite(person.playerId)?.status);invite.disabled=mutating||inviteBusy||!canHostInvite()||alreadySent;if(alreadySent)invite.textContent=t('Gönderildi');invite.setAttribute('aria-expanded',String(inviteTarget===person.playerId));if(!canHostInvite())invite.title=t('Davet için önce mevcut odandan ayrılmalısın.');invite.onclick=()=>beginInvite(person.playerId,version);actions.append(invite)}
     actions.append(actionButton(key==='friends'?'ÇIKAR':'İPTAL ET','remove',person.playerId));
    }
    row.append(actions);if(key==='friends'&&inviteTarget===person.playerId&&person.online&&canHostInvite())row.append(inviteConfirmation(person));section.append(row);
   }
   if(key==='friends'&&onInvite&&!canHostInvite()&&data.friends.some(person=>person.online))section.append(node('p',t('Davet için önce mevcut odandan ayrılmalısın.'),'hint'));
   root.append(section);
  }
 }
 async function refresh(force=false){
  if(!login?.authToken||(pending&&!force))return;
  const version=generation,serial=++requestSerial;pending=true;
  try{const result=await request('/api/friends');if(version!==generation||serial!==requestSerial)return;data=result;renderBadge();renderOpponent();
   if(inviteTarget&&!onlineFriend(inviteTarget)){inviteTarget=null;inviteRevision++;if(panel&&!panel.hidden)message('Bu arkadaş artık çevrimiçi değil veya arkadaş listende yok.');}
   if($('friend-own-id'))$('friend-own-id').value=data.playerId;if($('friend-copy'))$('friend-copy').disabled=!data.playerId;
   if($('friends-guest-note'))$('friends-guest-note').hidden=!data.guest;
   if($('friends-preview-note'))$('friends-preview-note').hidden=data.persistent!==false;
   if(panel&&!panel.hidden&&!mutating&&!$('friends-lists')?.contains(doc.activeElement))renderLists();
  }catch(e){if(version===generation&&serial===requestSerial&&panel&&!panel.hidden)message(e.message)}finally{if(version===generation&&serial===requestSerial)pending=false}
 }
 async function mutate(action,id){
  if(mutating||inviteBusy||!login?.authToken)return;
  inviteTarget=null;inviteRevision++;
  const version=generation;mutating=true;const add=$('friend-add');if(add)add.disabled=true;renderLists();message('İşleniyor…');
  try{await request('/api/friend/'+action,{playerId:id});if(version!==generation)return;if(action==='add')$('friend-id').value='';message(action==='add'?'Arkadaşlık isteği gönderildi.':'Arkadaş listesi güncellendi.');}
  catch(e){if(version===generation)message(e.message)}finally{if(version===generation){mutating=false;if(add)add.disabled=false;await refresh(true);renderLists()}}
 }
 function open(){if(!panel||!login?.authToken)return;onOpen();panel.hidden=false;nav?.setAttribute('aria-expanded','true');nav?.classList.add('selected');
  if($('friends-guest-note'))$('friends-guest-note').hidden=login.type!=='guest';renderLists();void refresh();panel.scrollIntoView?.({behavior:'smooth',block:'start'});}
 function close(){inviteTarget=null;inviteRevision++;message('');if(panel)panel.hidden=true;nav?.setAttribute('aria-expanded','false');nav?.classList.remove('selected')}
 if(nav)nav.onclick=open;
 if($('friends-close'))$('friends-close').onclick=()=>{close();nav?.focus()};
 if($('friend-add-form'))$('friend-add-form').onsubmit=e=>{e.preventDefault();void mutate('add',$('friend-id').value.trim())};
 if($('friend-copy'))$('friend-copy').onclick=async()=>{const field=$('friend-own-id');if(!field.value)return;try{await win.navigator.clipboard.writeText(field.value);message('Oyuncu kimliği kopyalandı.')}catch{field.focus();field.select();message('Kimliğini seçip kopyalayabilirsin.')}};
 const hide=()=>{suspended=true;heartbeat(false)},show=()=>{suspended=false;heartbeat();void refresh()};
 win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
 return {setLogin,setRoom,setInvitations,open,close,refresh,destroy(){heartbeat(false);generation++;win.clearInterval(timer);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show)}};
}
