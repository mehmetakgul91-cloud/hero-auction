// Display-only wallet state. Values are never inferred from rewards, storage or
// animation. Requests carry account + generation guards; successful mutations
// invalidate reads that began before them, including delayed wallet polls.
const currencies=Object.freeze([
 {key:'gold',id:'gold-balance',item:'header-gold',label:'Altın',english:'Gold'},
 {key:'magicDust',id:'magic-dust-balance',item:'header-magic-dust',label:'Büyü tozu',english:'Magic dust'},
 {key:'diamonds',id:'diamond-balance',item:'header-diamonds',label:'Elmas',english:'Diamonds'},
]);
const valid=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;
export function createHeaderWallet({document=globalThis.document}={}){
 let authToken=null,generation=0,revision=0,sequence=0;
 const amounts=Object.fromEntries(currencies.map(({key})=>[key,null]));
 const accepted=Object.fromEntries(currencies.map(({key})=>[key,0]));
 const root=document?.getElementById('gold-wallet');
 function render(){
  if(root)root.hidden=!authToken;
  const english=document?.documentElement?.lang==='en';
  let wideValues=false;
  for(const currency of currencies){
   const label=english?currency.english:currency.label,value=amounts[currency.key],available=valid(value);
   const amount=document?.getElementById(currency.id),item=document?.getElementById(currency.item),name=document?.getElementById(currency.item+'-label');
   const formatted=available?value.toLocaleString(english?'en-US':'tr-TR'):'—';
   if(amount)amount.textContent=formatted;
   if(available&&formatted.length>6)wideValues=true;
   if(name)name.textContent=label;
   if(item){
    const description=available?`${label}: ${formatted}`:`${label}: ${english?'unavailable':'kullanılamıyor'}`;
    item.setAttribute('aria-label',description);item.setAttribute('aria-disabled',String(!available));item.setAttribute('title',description);
    if(item.dataset)item.dataset.available=String(available);
   }
  }
  if(root?.dataset)root.dataset.wideValues=String(wideValues);
 }
 function setLogin(login){
  const next=typeof login?.authToken==='string'&&login.authToken?login.authToken:null;
  if(next===authToken){render();return false;}
  authToken=next;generation++;revision++;sequence=0;
  for(const {key} of currencies){amounts[key]=null;accepted[key]=0;}
  render();return true;
 }
 function begin(token=authToken){return token&&token===authToken?{authToken:token,generation,revision,sequence:++sequence}:null;}
 function current(ticket){return Boolean(ticket&&ticket.authToken===authToken&&ticket.generation===generation);}
 function receive(snapshot,ticket,{mutation=false,complete=false}={}){
  if(!current(ticket)||!snapshot||typeof snapshot!=='object')return false;
  if(!mutation&&ticket.revision!==revision)return false;
  const keys=currencies.filter(({key})=>complete||Object.hasOwn(snapshot,key)||Object.hasOwn(snapshot.currencies||{},key));
  if(!keys.length)return false;
  if(mutation)revision++;
  let applied=false;
  for(const {key} of keys){
   if(!mutation&&ticket.sequence<accepted[key])continue;
   const capability=snapshot.currencies?.[key];
   amounts[key]=capability&&capability.available!==true?null:valid(snapshot[key])?snapshot[key]:null;
   accepted[key]=ticket.sequence;applied=true;
  }
  if(applied)render();return applied;
 }
 function unavailable(ticket){return receive({},ticket,{complete:true});}
 function update(snapshot,token=authToken){return receive(snapshot,begin(token),{mutation:true});}
 render();
 return {setLogin,begin,receive,unavailable,update,render};
}
