// Persistent composer: snapshots update only the message log, never the input.
// This module neither creates rooms nor relaxes server/platform chat restrictions.
export function createRoomChat({document,form,input,button,panel,list,getContext,post,onRoom,notify,escape}){
 let contextKey=null,messageSignature=null,pending=null,composing=false,disposed=false;
 const context=()=>getContext();
 const key=({session,room,authToken})=>session&&room?JSON.stringify([session.code,session.token,authToken,room.matchKey||room.matchNumber||'']):null;
 const allowed=c=>!!c.session&&!!c.room&&c.session.code===c.room.code&&c.room.mode!=='bot'&&!c.disableChat;
 function update(){
  if(disposed)return;
  const c=context(),nextKey=key(c),enabled=allowed(c);
  if(nextKey!==contextKey){contextKey=nextKey;pending=null;composing=false;input.value='';messageSignature=null;}
  panel.hidden=!enabled;input.disabled=!enabled;button.disabled=!enabled||!!pending;
  form.setAttribute('aria-busy',String(!!pending));
  if(!enabled){if(document.activeElement===input)input.blur();return;}
  const messages=c.room.chat||[],signature=JSON.stringify(messages);
  if(signature===messageSignature)return;
  const initial=messageSignature===null,nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  list.innerHTML=messages.map(m=>`<div class="chat-line ${m.seat===c.room.me?'chat-mine':''}"><span class="chat-author">${escape(m.name)} · ${new Date(m.time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span><span class="chat-text">${escape(m.message)}</span></div>`).join('')||'<p class="status">Henüz mesaj yok. Rakibine merhaba de!</p>';
  messageSignature=signature;
  if(initial||nearBottom)list.scrollTop=list.scrollHeight;
 }
 async function submit(event){
  event.preventDefault();
  const c=context();
  if(disposed||composing||!allowed(c)||pending)return;
  const draft=input.value,message=draft.trim();if(!message)return;
  const request={key:key(c),session:c.session,authToken:c.authToken,draft};pending=request;
  button.disabled=true;form.setAttribute('aria-busy','true');
  // Synchronous gesture focus keeps iOS's keyboard usable for the next message.
  input.focus({preventScroll:true});
  const current=()=>!disposed&&pending===request&&key(context())===request.key&&allowed(context());
  try{
   const result=await post('/api/chat',{...c.session,message});
   if(!current())return;
   // Do not erase a second draft typed while the first request was in flight.
   if(input.value===draft)input.value='';
   onRoom(result.room);
  }catch(error){if(current())notify('Sohbet mesajı gönderilemedi: '+error.message);}
  finally{if(pending===request){pending=null;update();}}
 }
 function startComposition(){composing=true;}
 function endComposition(){composing=false;}
 function keydown(event){
  // IME confirmation is not an instruction to send (Safari also uses 229).
  if(event.key==='Enter'&&(composing||event.isComposing||event.keyCode===229))event.preventDefault();
 }
 form.addEventListener('submit',submit);
 input.addEventListener('compositionstart',startComposition);input.addEventListener('compositionend',endComposition);input.addEventListener('keydown',keydown);
 return {update,destroy(){disposed=true;pending=null;form.removeEventListener('submit',submit);input.removeEventListener('compositionstart',startComposition);input.removeEventListener('compositionend',endComposition);input.removeEventListener('keydown',keydown);}};
}
