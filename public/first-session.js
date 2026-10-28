import {COMMANDER_BRANCHES,renderCommanderSkills} from './commander-profile-view.js';
// Read-only presentation: reuse combat skill descriptions, never select or spend.
export const commanderIntroductions={
 attack:'Spread damage across enemies. Upgrade Battle Mastery to strengthen Fighter / Assassin attack.',
 defense:'Share a shield across your team. Upgrade Iron Will to strengthen Tank defense.',
 magic:'Stop an enemy’s next attack. Upgrade Arcane Power to strengthen Energy heroes’ attack.',
 support:'Heal injured allies. Upgrade Life Energy to increase Support heroes’ maximum health.'
};
export function describeFirstCommander(root,selected,{document:doc=root.ownerDocument}={}){
 const panel=doc.getElementById('commander-onboarding');
 if(!panel||!doc.documentElement.classList.contains('cg-first-session'))return;
 for(const button of root.children){
  const id=button.dataset.commander;
  if(!commanderIntroductions[id])continue;
  const copy=doc.createElement('small');copy.className='first-commander-summary';copy.textContent=commanderIntroductions[id];button.append(copy);
 }
 let details=doc.getElementById('first-commander-details');
 if(!details){details=doc.createElement('section');details.id='first-commander-details';details.setAttribute('aria-label','Selected commander abilities');details.setAttribute('translate','no');root.after(details);}
 details.replaceChildren();details.hidden=!selected;
 if(!commanderIntroductions[selected])return;
 const branch=COMMANDER_BRANCHES.find(b=>b.id===selected);
 const note=doc.createElement('p');note.className='first-commander-bonus';note.textContent=`${branch.name[1]} · ${branch.role[1]}. New commanders start at level 0, with no upgrade bonus. ${branch.basis[1]} Upgrade levels increase that bonus; choosing a commander does not buy upgrades.`;
 const skills=doc.createElement('div');skills.className='first-commander-skills';
 renderCommanderSkills(skills,{commanderId:selected,levels:{attack:0,defense:0,magic:0,support:0}},{english:true,document:doc});
 details.append(note,skills);
}
export function mountFirstSession(doc,{enabled=false}={}){
 if(!enabled||doc.documentElement.classList.contains('cg-first-session'))return;
 doc.documentElement.classList.add('cg-first-session');
 const guide=doc.querySelector('.home-guide'),cta=doc.getElementById('home-guide-play'),bot=doc.querySelector('.play-compact-bot'),modes=doc.querySelector('.play-compact-modes');
 if(!guide||!cta||!bot||!modes)return;
 const title=doc.getElementById('home-guide-title');title.textContent='Your first match';title.setAttribute('translate','no');
 const subtitle=guide.querySelector('.home-guide-head p');subtitle.textContent='Learn by playing: recruit 5 heroes, choose their rows, then command the battle.';subtitle.setAttribute('translate','no');
 const details=doc.createElement('details');details.className='first-session-reference';const summary=doc.createElement('summary');summary.textContent='Game rules and rewards';summary.setAttribute('translate','no');details.append(summary);
 for(const element of [...guide.querySelectorAll('.home-guide-stats,.home-guide-grid,.home-guide-note')])details.append(element);
 cta.textContent='PLAY A FREE COMPUTER MATCH →';cta.setAttribute('translate','no');guide.insertBefore(cta,details.parentNode?details:null);guide.append(details);
 // Move, never clone, the existing controls: IDs, difficulty and handlers remain authoritative.
 modes.prepend(bot);
 cta.onclick=()=>{doc.getElementById('home-play-tab').click();bot.scrollIntoView({behavior:'smooth',block:'center'});doc.getElementById('bot-difficulty').focus({preventScroll:true});};
 const intro=doc.querySelector('#commander-onboarding>p');if(intro){intro.textContent='Your first commander is free. Compare their abilities below, then confirm your choice. Changing later costs 1000 gold; upgrade levels are kept.';intro.setAttribute('translate','no');}
}
