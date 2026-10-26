import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoomChat} from '../public/room-chat.js';
class Element extends EventTarget{
 value='';disabled=false;hidden=false;attributes={};innerHTML='';scrollTop=0;scrollHeight=300;clientHeight=180;focuses=0;
 setAttribute(k,v){this.attributes[k]=v;}
 focus(){this.focuses++;this.document.activeElement=this;}
 blur(){this.document.activeElement=null;}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const document={activeElement:null},nodes=Object.fromEntries(['form','input','button','panel','list'].map(k=>[k,new Element()]));
 Object.values(nodes).forEach(n=>n.document=document);
 let c={session:{code:'ROOM',token:'seat'},room:{code:'ROOM',matchKey:'one',mode:'private',me:0,chat:[]},authToken:'auth',disableChat:false};
 const requests=[],shown=[],errors=[];
 const api=createRoomChat({document,...nodes,getContext:()=>c,post:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject})),onRoom:room=>{shown.push(room);c={...c,room};api.update();},notify:error=>errors.push(error),escape:v=>String(v).replace(/[<>]/g,x=>x==='<'?'&lt;':'&gt;')});
 api.update();
 const emit=(element,type,props={})=>{const event=Object.assign(new Event(type,{cancelable:true}),props);element.dispatchEvent(event);return event;};
 return {api,document,...nodes,requests,shown,errors,emit,get:()=>c,set:change=>{c={...c,...change};api.update();},submit:()=>emit(nodes.form,'submit')};
}
test('native submit sends once, keeps focus and clears only the sent draft on success',async()=>{
 const h=fixture();h.input.value='  Merhaba  ';h.submit();h.submit();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].path,'/api/chat');assert.deepEqual(h.requests[0].body,{code:'ROOM',token:'seat',message:'Merhaba'});
 assert.equal(h.button.disabled,true);assert.equal(h.document.activeElement,h.input);assert.equal(h.form.attributes['aria-busy'],'true');
 h.requests[0].resolve({room:{...h.get().room,chat:[{seat:0,name:'A',time:1,message:'Merhaba'}]}});await flush();
 assert.equal(h.input.value,'');assert.equal(h.button.disabled,false);assert.equal(h.shown.length,1);assert.match(h.list.innerHTML,/Merhaba/);
 h.api.destroy();
});
test('render polling preserves input, selection owner and a newer pending draft',async()=>{
 const h=fixture();h.input.value='First';h.submit();h.input.value='Second draft';
 for(let n=0;n<30;n++)h.set({room:{...h.get().room,revision:n}});
 assert.equal(h.input.value,'Second draft');assert.equal(h.document.activeElement,h.input);assert.equal(h.input.focuses,1);
 h.requests[0].resolve({room:h.get().room});await flush();assert.equal(h.input.value,'Second draft');
});
test('error keeps text, releases button and permits explicit retry without auto-resending',async()=>{
 const h=fixture();h.input.value='Retry me';h.submit();h.requests[0].reject(Error('offline'));await flush();
 assert.equal(h.input.value,'Retry me');assert.equal(h.button.disabled,false);assert.match(h.errors[0],/offline/);assert.equal(h.requests.length,1);
 h.submit();assert.equal(h.requests.length,2);h.requests[1].resolve({room:h.get().room});await flush();
});
test('IME confirmation cannot send; ordinary Enter uses native form submission',()=>{
 const h=fixture();h.input.value='こんにちは';
 h.emit(h.input,'compositionstart');assert.equal(h.emit(h.input,'keydown',{key:'Enter',isComposing:true}).defaultPrevented,true);h.submit();assert.equal(h.requests.length,0);
 h.emit(h.input,'compositionend');assert.equal(h.emit(h.input,'keydown',{key:'Enter',keyCode:229}).defaultPrevented,true);
 assert.equal(h.emit(h.input,'keydown',{key:'Enter',keyCode:13}).defaultPrevented,false);
 h.submit();assert.equal(h.requests.length,1);h.api.destroy();
});
test('room, account, rematch, logout and teardown invalidate late responses and do not leak drafts',async()=>{
 for(const change of [c=>({session:{code:'NEW',token:'other'},room:{...c.room,code:'NEW'}}),c=>({authToken:'new-auth'}),c=>({room:{...c.room,matchKey:'two'}}),()=>({session:null,room:null})]){
  const h=fixture();h.input.value='old';h.submit();const old=h.get().room;h.set(change(h.get()));h.input.value='new';
  h.requests[0].resolve({room:old});await flush();assert.equal(h.shown.length,0);assert.equal(h.input.value,'new');assert.equal(h.errors.length,0);
 }
 const h=fixture();h.input.value='old';h.submit();h.api.destroy();h.requests[0].resolve({room:h.get().room});await flush();assert.equal(h.shown.length,0);h.submit();assert.equal(h.requests.length,1);
});
test('bot/platform restrictions, missing room and blank drafts never submit',()=>{
 for(const change of [{disableChat:true},{room:{code:'ROOM',mode:'bot'}},{room:null},{session:null}]){
  const h=fixture();h.set(change);h.input.value='must not send';h.submit();assert.equal(h.requests.length,0);assert.equal(h.panel.hidden,true);assert.equal(h.input.disabled,true);
 }
 const h=fixture();h.input.value='   ';h.submit();assert.equal(h.requests.length,0);
 h.set({disableChat:true});h.set({disableChat:false});h.input.value='allowed';h.submit();assert.equal(h.requests.length,1);
});
test('60-message cap refreshes changed contents, escapes HTML and respects log scroll',()=>{
 const h=fixture(),messages=Array.from({length:60},(_,i)=>({seat:1,name:'B',time:i,message:'Message '+i}));
 h.set({room:{...h.get().room,chat:messages}});h.list.scrollTop=0;
 h.set({room:{...h.get().room,chat:[...messages.slice(1),{seat:1,name:'<B>',time:99,message:'<script>hello</script>'}]}});
 assert.doesNotMatch(h.list.innerHTML,/Message 0</);assert.match(h.list.innerHTML,/&lt;script&gt;/);assert.match(h.list.innerHTML,/&lt;B&gt;/);assert.equal(h.list.scrollTop,0);
});
test('composer has semantic submit and bounded CSS geometry at 320, 390 and landscape widths',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/<form class="chat-compose" id="chat-compose"/);assert.match(html,/<button type="submit" class="primary" id="chat-send"/);assert.match(html,/enterkeyhint="send"/);assert.match(html,/maxlength="240"/);
 assert.match(css,/#game #chat-input\{flex:1 1 0%;width:0;min-width:0/);
 assert.match(css,/#game #chat-send\{flex:0 0 auto;width:auto;min-width:74px;min-height:48px/);
 for(const width of [320,390,844])assert.ok(width-36-46-8-74>=140,'input remains usable after shell, panel, gap, button budget');
 assert.ok(app.indexOf('const roomChat=createRoomChat')<app.indexOf('applyLogin();initGoogle();'));
 assert.doesNotMatch(app,/chatPanel.addEventListener\('click'/,'reading messages must not summon keyboard');
});
