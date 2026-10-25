import {commanderGoldUpgradeCost} from './commander-economy.js';
import {commanderAbilityStats,getCommanderAbilityCost} from './commander-ability-rules.js';
import {commanderUltimateName,commanderUltimateDescription} from './commander-ultimate-presentation.js';

// Presentation only: the saved profile and every purchase stay server-owned.
export const COMMANDER_BRANCHES=Object.freeze([
 {id:'attack',icon:'⚔',name:['Savaş Ustalığı','Battle Mastery'],role:['Savaşçı / Suikastçı','Fighter / Assassin'],effect:['Saldırı · temel güç oranı','Attack · base power ratio'],basis:['Temel kahraman gücü × bu oran, saldırıya eklenir.','Base hero power × this ratio is added to attack.']},
 {id:'defense',icon:'◈',name:['Çelik İrade','Iron Will'],role:['Tank','Tank'],effect:['Savunma · temel güç oranı','Defense · base power ratio'],basis:['Temel kahraman gücü × bu oran, savunmaya eklenir.','Base hero power × this ratio is added to defense.']},
 {id:'magic',icon:'✦',name:['Arkane Güç','Arcane Power'],role:['Enerji','Energy'],effect:['Saldırı artışı','Attack increase'],basis:['Enerji kahramanlarının saldırısı bu oranda artar.','Energy heroes gain this percentage of their attack.']},
 {id:'support',icon:'❧',name:['Yaşam Enerjisi','Life Energy'],role:['Destek','Support'],effect:['Azami can · 2× temel güç oranı','Max health · 2× base power ratio'],basis:['Temel kahraman gücünün 2 katı × bu oran, azami cana eklenir.','Twice the base hero power × this ratio is added to max health.']}
]);
const normalNames={attack:['Güçlü Darbe','Power Strike'],defense:['Koruyucu Kalkan','Protective Shield'],magic:['Zayıflatma','Weaken'],support:['Şifa Dokunuşu','Healing Touch']};
const normalDetails={
 attack:['Savaş başındaki takım saldırısının bu oranı, toplam hasar olarak yaşayan düşmanlara bölünür.','This share of the team’s starting attack is divided as total damage among living enemies.'],
 defense:['Yaşayan takımın azami canının bu oranı, toplam kalkan olarak paylaşılır.','This share of the living team’s max health is distributed as a total shield.'],
 magic:['Seçilen rakibin bir sonraki saldırısını zayıflatır; aynı saldırının alan vuruşlarına da uygulanır. Şifa ve kalkan değişmez.','Weakens the selected enemy’s next attack, including its area hits. Healing and shields are unchanged.'],
 support:['Eksik canın bu oranını iyileştirir. Can oranı en düşük kahraman önceliklidir.','Heals this percentage of missing health, prioritizing the hero with the lowest health ratio.']
};
const number=(value,english)=>value.toLocaleString(english?'en-US':'tr-TR',{maximumFractionDigits:2});
const percent=(value,english)=>english?number(value,english)+'%':'%'+number(value,english);

export function commanderDiamondPolicyCopy(progression,{english=false}={}){
 if(progression?.diamondsEnabled!==true)return '';
 const bonus=progression.welcomeBonus;
 const welcome=bonus?.enabled===true&&Number.isSafeInteger(bonus.amount)&&bonus.amount>0&&bonus.eligibleProviders?.length===1&&bonus.eligibleProviders[0]==='google';
 const intro=welcome?(english?`New verified Google members receive ${bonus.amount} diamonds once. `:`Yeni doğrulanmış Google üyelerine bir kez ${bonus.amount} elmas. `):'';
 return intro+(english?'Diamond purchases are not available yet. Check login reward availability in the store.':'Elmas satın alma henüz açık değil. Giriş ödüllerinin durumunu mağazadan takip edebilirsin.');
}

export function commanderBranchView(profile,id,{gold=0,diamonds=null,progression=null}={}){
 const branch=COMMANDER_BRANCHES.find(branch=>branch.id===id);
 if(!branch)throw Error('Invalid commander branch');
 const level=profile.levels[id]??0,primary=profile.commanderId===id,cap=primary?40:20;
 const effectiveLevel=Math.min(level,cap),maxed=level>=cap,nextLevel=maxed?null:level+1;
 const stats=commanderAbilityStats(profile);
 const nextStats=nextLevel===null?stats:commanderAbilityStats({...profile,levels:{...profile.levels,[id]:nextLevel}});
 const quote=progression?.branches?.[id];
 const quoteMatches=quote?.currentLevel===level&&quote?.nextLevel===nextLevel;
 const premium=progression?.diamondsEnabled===true;
 const cost=maxed?null:quoteMatches?quote.gold:commanderGoldUpgradeCost(level);
 const diamondCost=maxed?0:quoteMatches?quote.diamonds:premium&&level>=20?null:0;
 const requiresDiamonds=!maxed&&(quoteMatches?quote.requiresDiamonds:premium&&level>=20);
 const quoteBlocked=quoteMatches&&quote.canUpgrade!==true&&!['insufficient_gold','insufficient_diamonds'].includes(quote.reason);
 const reason=maxed?'maximum_level':premium&&!quoteMatches?'pricing_unavailable':requiresDiamonds&&diamondCost===null?'pricing_unavailable':gold<cost?'insufficient_gold':requiresDiamonds&&(!Number.isSafeInteger(diamonds)||diamonds<diamondCost)?'insufficient_diamonds':quoteBlocked?(quote.reason||'unavailable'):null;
 // A compressed path, not an invented unlock tree: always retain current and next.
 const points=[0,Math.floor(effectiveLevel/10)*10,effectiveLevel,...(maxed?[]:[nextLevel]),cap];
 const nodes=[...new Set(points)].sort((a,b)=>a-b).map(value=>({level:value,state:value===effectiveLevel?'current':value<effectiveLevel?'earned':value===nextLevel?'next':'future'}));
 return {...branch,level,primary,cap,effectiveLevel,retainedLevel:Math.max(0,level-cap),maxed,nextLevel,cost,
  diamondCost,requiresDiamonds,reason,canUpgrade:!maxed&&!reason,progress:100*effectiveLevel/cap,bonus:effectiveLevel*.5,nextBonus:maxed?effectiveLevel*.5:nextLevel*.5,stats,nextStats,nodes};
}

export function renderCommanderSkills(root,profile,{english=false,document=root.ownerDocument}={}){
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const pick=values=>values[english?1:0],stats=commanderAbilityStats(profile),id=profile.commanderId;
 root.replaceChildren();
 for(const ability of ['normal','ultimate']){
  const ultimate=ability==='ultimate',card=el('article','cp-skill'+(ultimate?' ultimate':''));
  const top=el('div','cp-skill-top');
  top.append(el('span','',ultimate?pick(['NİHAİ BECERİ','ULTIMATE']):pick(['NORMAL BECERİ','NORMAL ABILITY'])),el('b','',getCommanderAbilityCost(id,ability)+' '+(ultimate?pick(['ULTİ DOLUMU','ULTIMATE CHARGE']):pick(['NORMAL ENERJİ','NORMAL ENERGY']))));
  const main=el('div','cp-skill-main');
  if(!ultimate||id==='defense')main.append(el('strong','',percent((ultimate?stats.ultimateRate:stats.normalRate)*100,english)));
  main.append(el('span','',ultimate?commanderUltimateName(id,{english}):pick(normalNames[id])));
  card.append(top,main);
  if(ultimate){
   const summaries={attack:['Hedef ölünceye kadar takımın saldırıları seçilen rakibe odaklanır.','All allied attacks focus the selected enemy until the target dies.'],defense:['Takım kalkanı + en düşük can oranındaki müttefike ölümcül darbede 1 can koruması.','Team shield + the lowest-health-ratio ally survives a lethal hit at 1 health.'],magic:['Seçilen müttefike 3 hareket turu ek vuruş gücü.','Extra hit power for the selected ally for 3 action rounds.'],support:['Seçilen düşen müttefik %40 azami canla döner.','The selected fallen ally returns at 40% max health.']};
   card.append(el('p','',pick(summaries[id])),el('small','cp-once',pick(['Savaşta 1 kez · ayrı dolum','Once per battle · separate charge'])));
   const details=el('details','cp-skill-details');details.append(el('summary','',pick(['Nasıl çalışır?','How it works'])),el('p','',commanderUltimateDescription(id,{english})));card.append(details);
  }else card.append(el('p','',pick(normalDetails[id])));
  root.append(card);
 }
}

export function renderCommanderDevelopment(root,profile,{selected=profile.commanderId,gold=0,diamonds=null,progression=null,busy=false,english=false,document=root.ownerDocument,branchesRoot=null,onSelect=()=>{},onUpgrade=()=>{}}={}){
 const pick=values=>values[english?1:0],fmt=value=>number(value,english),pct=value=>percent(value,english);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const views=COMMANDER_BRANCHES.map(branch=>commanderBranchView(profile,branch.id,{gold,diamonds,progression}));
 const chosen=views.find(branch=>branch.id===selected)||views.find(branch=>branch.primary);
 root.replaceChildren();
 if(branchesRoot)branchesRoot.replaceChildren();
 const tabs=el('div','cp-branches');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',pick(['Gelişim dalını seç','Choose a development branch']));
 for(const branch of views){
  const button=el('button','cp-branch'+(branch.id===chosen.id?' selected':''));button.type='button';button.dataset.type=branch.id;button.dataset.branch=branch.id;
  button.setAttribute('aria-pressed',String(branch.id===chosen.id));button.setAttribute('aria-controls','commander-branch-detail');
  const icon=el('span','cp-branch-icon');icon.setAttribute('aria-hidden','true');
  const art=el('img','cp-glyph');art.src='/images/commander-branch-'+branch.id+'.svg';art.alt='';icon.append(art);
  if(branch.primary)icon.append(el('span','cp-main-star','✦'));
  const text=el('span','cp-branch-copy');text.append(el('strong','',pick(branch.name)));
  const progress=el('span','cp-branch-level',`${branch.effectiveLevel} / ${branch.cap}`);progress.setAttribute('aria-label',pick(['Etkin seviye','Active level'])+' '+branch.effectiveLevel+' / '+branch.cap+(branch.retainedLevel?' · '+branch.retainedLevel+' '+pick(['seviye saklı','levels retained']):''));
  if(branch.retainedLevel)progress.append(el('small','cp-retained-label','+'+branch.retainedLevel+' '+pick(['saklı','retained'])));
  const milestones=el('span','cp-node-milestones');milestones.setAttribute('aria-hidden','true');
  for(let point=1;point<=4;point++){const level=branch.cap*point/4,dot=el('i',branch.effectiveLevel>=level?'earned':'');dot.dataset.level=String(level);milestones.append(dot);}
  button.setAttribute('aria-label',pick(branch.name)+' · '+pick(branch.role)+' · '+branch.effectiveLevel+' / '+branch.cap+(branch.primary?' · '+pick(['Ana dal','Main branch']):'')+(branch.retainedLevel?' · '+branch.retainedLevel+' '+pick(['seviye saklı','levels retained']):''));
  button.append(icon,text,progress,milestones);
  button.onclick=()=>onSelect(branch.id);tabs.append(button);
 }
 (branchesRoot||root).append(tabs);
 const panel=el('section','cp-branch-detail');panel.id='commander-branch-detail';panel.dataset.type=chosen.id;panel.setAttribute('aria-labelledby','commander-branch-title');
 const head=el('div','cp-path-head'),title=el('div','');
 title.append(el('span','cp-eyebrow',pick(chosen.role)));const h=el('h4','',pick(chosen.name));h.id='commander-branch-title';title.append(h);
 head.append(title,el('span','cp-path-status',chosen.maxed?pick(['✓ SINIRA ULAŞILDI','✓ CAP REACHED']):chosen.level+' → '+chosen.nextLevel));panel.append(head);
 const path=el('ol','cp-level-path');path.setAttribute('aria-label',pick(['Seviye ilerleyişi · özet','Level progression · summary']));
 const labels={earned:pick(['Alındı','Earned']),current:pick(['Mevcut','Current']),next:pick(['Sıradaki','Next']),future:pick(['İleride','Later'])};
 for(const node of chosen.nodes){const item=el('li','cp-level-node '+node.state);item.append(el('b','',String(node.level)),el('span','',labels[node.state]));if(node.state==='current')item.setAttribute('aria-current','step');path.append(item);}panel.append(path);
 const progress=el('div','cp-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',pick(chosen.name));progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(chosen.cap));progress.setAttribute('aria-valuenow',String(chosen.effectiveLevel));progress.setAttribute('aria-valuetext',`${chosen.effectiveLevel} / ${chosen.cap}`);const fill=el('span','');fill.style.width=chosen.progress+'%';progress.append(fill);panel.append(progress);
 if(chosen.retainedLevel)panel.append(el('p','cp-retained',english?`${chosen.level} levels saved: ${chosen.cap} active + ${chosen.retainedLevel} retained. Retained levels activate when this becomes your main branch again.`:`${chosen.level} seviye kayıtlı: ${chosen.cap} etkin + ${chosen.retainedLevel} saklı. Bu dal yeniden ana dalın olduğunda saklı seviyeler etkinleşir.`));
 const effects=el('dl','cp-preview');
 const row=(label,current,next)=>{const line=el('div','cp-preview-row');line.append(el('dt','',label));const value=el('dd','');value.append(el('span','',current));if(!chosen.maxed){const arrow=el('span','cp-arrow','→');arrow.setAttribute('aria-label',pick(['sonraki','next']));value.append(arrow,el('b','',next));}line.append(value);effects.append(line);};
 row(pick({attack:['Saldırı · temel güç','Attack · base power'],defense:['Savunma · temel güç','Defense · base power'],magic:['Saldırı artışı','Attack increase'],support:['Can · 2× temel güç','HP · 2× base power']}[chosen.id]),'+'+pct(chosen.bonus),'+'+pct(chosen.nextBonus));
 if(chosen.primary){
  row(pick(['Normal beceri etkisi','Normal ability effect']),pct(chosen.stats.normalRate*100),pct(chosen.nextStats.normalRate*100));
  row(pick(['Her dolum / tur','Each pool / round']),'+'+chosen.stats.energyPerRound,'+'+chosen.nextStats.energyPerRound);
  if(chosen.id==='defense')row(pick(['Son Kale · kalkan','Last Bastion · shield']),pct(chosen.stats.ultimateRate*100),pct(chosen.nextStats.ultimateRate*100));
 }
 const explanation=el('details','cp-detail-help');explanation.append(el('summary','',pick(['Etki ayrıntıları','Effect details'])),el('p','cp-basis',pick(chosen.basis)+' '+pick(['Değerler savaşta tam sayıya yuvarlanır.','Values are rounded to whole numbers in battle.'])));
 if(chosen.primary)explanation.append(el('p','cp-fixed-note',chosen.id==='defense'?pick(['Ölümcül darbeden 1 canla kurtulma kuralı değişmez.','The 1-health lethal-hit protection is unchanged.']):pick(['Nihai becerinin hedefi, süresi ve özel etkisi seviyeden bağımsızdır.','The ultimate’s targeting, duration and special effect do not scale with level.'])));
 panel.append(effects);
 const button=el('button','cp-upgrade-button');button.type='button';button.dataset.upgrade=chosen.id;
 const blocked={pricing_unavailable:pick(['ELMAS FİYATI HENÜZ BELİRLENMEDİ','DIAMOND PRICE NOT SET']),insufficient_gold:pick(['ALTIN YETERSİZ','NOT ENOUGH GOLD']),insufficient_diamonds:pick(['ELMAS YETERSİZ','NOT ENOUGH DIAMONDS'])};
 const state=busy?pick(['İŞLENİYOR…','PROCESSING…']):chosen.maxed?pick(['✓ BU DAL TAMAMLANDI','✓ BRANCH COMPLETE']):!chosen.canUpgrade?(blocked[chosen.reason]||pick(['GELİŞTİRME KULLANILAMIYOR','UPGRADE UNAVAILABLE'])):pick(['GELİŞTİR','UPGRADE']);
 const costText=chosen.cost===null?'':fmt(chosen.cost)+' '+pick(['ALTIN','GOLD'])+(chosen.requiresDiamonds?' + '+(chosen.diamondCost===null?'—':fmt(chosen.diamondCost))+' '+pick(['ELMAS','DIAMONDS']):'');
 button.append(el('span','',state),el('b','',costText));
 button.disabled=busy||!chosen.canUpgrade;button.setAttribute('aria-label',pick(chosen.name)+' · '+state+(costText?' · '+costText:''));button.onclick=()=>{if(!button.disabled)onUpgrade(chosen.id);};
 panel.append(button);
 if(chosen.reason==='insufficient_gold')panel.append(el('p','cp-afford-note',english?`${fmt(Math.max(0,chosen.cost-gold))} more gold needed.`:`${fmt(Math.max(0,chosen.cost-gold))} altın daha gerekiyor.`));
 if(chosen.requiresDiamonds)panel.append(el('p','cp-afford-note',pick(['20. seviyeden sonraki geliştirmeler altın + elmas ister. Elmas satın alma henüz açık değil.','Upgrades after level 20 require gold + diamonds. Diamond purchases are not available yet.'])));
 explanation.append(el('p','cp-path-note',pick(['Seviyeler sırayla alınır. Dal seçmek altın harcamaz.','Levels are purchased in order. Choosing a branch spends no gold.'])));panel.append(explanation);
 root.append(panel);
 return chosen;
}
