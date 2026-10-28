// Navigation changes presentation only. Authorization remains server-side.
(()=>{
 const nav=document.getElementById('admin-quick-nav'),views=[...document.querySelectorAll('[data-admin-view]')];
 const links=[...nav.querySelectorAll('a')],session=document.getElementById('admin-session');
 let verified=false,selected='dashboard';
 function show(id,focus=false){
  if(!views.some(view=>view.dataset.adminView===id))return;
  selected=id;
  for(const view of views)view.hidden=!verified||view.dataset.adminView!==selected;
  for(const link of links){if(link.hash==='#'+selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  if(verified&&focus)document.getElementById(id)?.querySelector('h2')?.focus();
 }
 for(const link of links)link.addEventListener('click',event=>{event.preventDefault();if(verified)show(link.hash.slice(1),true);});
 window.addEventListener('hero:admin-verified',()=>{if(!verified){verified=true;session.open=false;}nav.hidden=false;show(selected);});
 function clear(){verified=false;selected='dashboard';nav.hidden=true;session.open=true;show(selected);}
 window.addEventListener('hero:admin-unverified',clear);
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='hero-auction-login')clear();});
 window.HeroAdminNavigation={show};
 show(selected);
})();
