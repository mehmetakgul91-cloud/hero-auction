// A disclosure, not an ARIA menu: the logout action keeps normal button/Tab behavior.
export function createAccountPopover({document:doc,window:win,canOpen=()=>true}){
 const trigger=doc.getElementById('account-status'),panel=doc.getElementById('google-logout'),root=doc.getElementById('account-bar');
 if(!trigger||!panel||!root)return {close(){},destroy(){}};
 const inside=event=>event.composedPath?.().includes(root)||root.contains?.(event.target);
 function close({restoreFocus=false}={}){
  const wasOpen=!panel.hidden;
  panel.hidden=true;trigger.setAttribute('aria-expanded','false');
  if(wasOpen&&restoreFocus&&!trigger.hidden)trigger.focus?.({preventScroll:true});
 }
 function toggle(){
  if(!canOpen()||trigger.hidden){close();return;}
  const open=panel.hidden;
  panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
 }
 function outside(event){if(!panel.hidden&&!inside(event))close();}
 function escape(event){
  if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close({restoreFocus:true});}
 }
 function reset(){close();}
 function visibility(){if(doc.hidden)close();}
 // Capture closes before another control's action, without cancelling that action.
 const documentListeners=[['pointerdown',outside,{capture:true}],['click',outside,{capture:true}],['focusin',outside,{capture:true}],['keydown',escape],['visibilitychange',visibility]];
 const windowEvents=['pagehide','pageshow','popstate','hashchange','hero:login-changed'];
 trigger.addEventListener('click',toggle);
 for(const args of documentListeners)doc.addEventListener(...args);
 for(const type of windowEvents)win.addEventListener(type,reset);
 close();
 return {close,destroy(){close();trigger.removeEventListener('click',toggle);for(const args of documentListeners)doc.removeEventListener(...args);for(const type of windowEvents)win.removeEventListener(type,reset);}};
}
