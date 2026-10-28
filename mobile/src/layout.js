// Native arena presentation only. The auction keeps the shared web DOM and CSS.
// Restore every parked node when leaving the arena; never edit gameplay state.
export function nativeViewport({height, rows=3}) {
  return {height:Math.max(0,Math.floor(Number(height)||0)),
    arenaMin:Math.max(1,Math.min(5,Number(rows)||3))*74+32};
}
export function mountNativeLayout({window,document}) {
  const root=document.documentElement,body=document.body;
  if(!root||!body||!window.MutationObserver)return ()=>{};
  let frame=null,mode='',menu=null,panel=null,summary=null;
  const parked=new Map();
  const find=s=>document.querySelector(s);
  function park(node) {
    if(!node||node===menu||panel.contains(node))return;
    if(!parked.has(node))parked.set(node,{parent:node.parentNode,next:node.nextSibling});
    panel.append(node);
  }
  function restore() {
    // Reverse order also restores siblings whose original next sibling was moved.
    for(const [node,{parent,next}] of [...parked].reverse()) {
      if(parent?.isConnected)parent.insertBefore(node,next?.parentNode===parent?next:null);
    }
    parked.clear();menu?.remove();menu=panel=summary=null;
  }
  function ensureMenu(host) {
    if(menu)return;
    menu=document.createElement('details');menu.id='native-game-menu';
    summary=document.createElement('summary');summary.textContent='☰ Menü';
    summary.setAttribute('aria-label','Oyun menüsü: güvenlik, günlük ve diğer seçenekler');
    panel=document.createElement('div');panel.className='native-menu-panel';panel.id='native-menu-panel';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Oyun menüsü');
    summary.setAttribute('aria-controls',panel.id);
    const close=document.createElement('button');close.type='button';close.textContent='Menüyü kapat';close.className='native-menu-close';
    close.addEventListener('click',()=>{menu.open=false;summary.focus();});
    panel.append(close);menu.append(summary,panel);host.append(menu);
    menu.addEventListener('toggle',()=>{if(menu?.open)close.focus();});
  }
  function sync() {
    frame=null;
    const game=find('#game');
    const next=body.classList.contains('arena-room')?'arena':game&&!game.hidden&&game.dataset.phase==='auction'?'auction':'';
    if(next!==mode){restore();mode=next;}
    body.classList.toggle('native-arena',mode==='arena');
    body.classList.toggle('native-auction',mode==='auction');
    // Track auction state only to suppress native chrome. Do not move player
    // panels, expose the web-hidden room toolbar, or collapse abilities/teams.
    if(mode!=='arena')return;
    const host=find('.arena-room-nav');if(!host)return;
    ensureMenu(host);
    park(find('#native-status'));park(find('#moderation-panel'));
    for(const selector of ['#arena-friend-opponent','.arena-invites-inbox','.arena-prep-link','.shell>.log','.controls>.settings'])park(find(selector));
    const vp=window.visualViewport,focused=document.activeElement;
    const keyboard=Boolean(focused?.matches?.('input:not([type="range"]):not([type="checkbox"]),textarea,select'));
    const rows=Math.max(1,...[...document.querySelectorAll('.arena-side .team')].map(team=>Number(team.style.getPropertyValue('--arena-row-count'))||3));
    const size=nativeViewport({height:vp&&vp.scale===1?vp.height:window.innerHeight,rows});
    root.style.setProperty('--native-viewport-height',size.height+'px');
    // CSS uses rem-aware card height so enlarged text cannot clip labels.
    root.style.setProperty('--native-rows',String(Math.max(1,Math.min(5,rows))));
    body.classList.toggle('native-keyboard',keyboard);
    body.classList.toggle('native-zoomed',(vp?.scale??1)!==1);
  }
  function schedule(){if(frame===null)frame=window.requestAnimationFrame(sync);}
  const observer=new window.MutationObserver(schedule);
  observer.observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','data-phase']});
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
  const escape=event=>{
    if(!menu?.open)return;
    if(event.key==='Escape'){event.preventDefault();menu.open=false;summary.focus();return;}
    if(event.key==='Tab'){
      const items=[...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter(el=>!el.closest('[hidden]')&&(!el.getClientRects||el.getClientRects().length));
      const first=items[0],last=items.at(-1),active=document.activeElement;
      if(first&&(!panel.contains(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
    }
  };
  document.addEventListener('keydown',escape);sync();
  return ()=>{observer.disconnect();if(frame!==null)window.cancelAnimationFrame(frame);restore();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);document.removeEventListener('keydown',escape);};
}
