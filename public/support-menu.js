// The native disclosure also keeps credits reachable if JavaScript cannot load.
export function mountSupportMenu({document:doc=document,window:win=window}={}){
 const menu=doc.getElementById('support-menu'),trigger=doc.getElementById('support-menu-trigger');
 if(!menu||!trigger)return;
 const contains=target=>!!target&&menu.contains(target);
 function close(restoreFocus=false){
  if(!menu.open)return;
  menu.open=false;
  const moderation=doc.getElementById('moderation-panel');if(moderation)moderation.open=false;
  if(restoreFocus)trigger.focus();
 }
 const outside=event=>{if(!contains(event.target))close();};
 const escape=event=>{
  if(event.key!=='Escape'||!menu.open)return;
  // Do not take Escape/focus away from another surface the user already reached.
  if(contains(doc.activeElement)){event.preventDefault();close(true);}else close();
 };
 const lifecycle=()=>close();
 const toggled=()=>{if(!menu.open){const moderation=doc.getElementById('moderation-panel');if(moderation)moderation.open=false;}};
 const listeners=[
  [menu,'toggle',toggled,false],
  [doc,'pointerdown',outside,true],[doc,'click',outside,true],
  [doc,'focusin',outside,true],[doc,'keydown',escape,true],
  ...['pagehide','pageshow','popstate','hashchange','hero:login-changed'].map(type=>[win,type,lifecycle,false])
 ];
 for(const [target,type,listener,capture]of listeners)target.addEventListener(type,listener,{capture});
 return {close,destroy(){close();for(const [target,type,listener,capture]of listeners)target.removeEventListener(type,listener,{capture});}};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountSupportMenu(),{once:true});else mountSupportMenu();
}
