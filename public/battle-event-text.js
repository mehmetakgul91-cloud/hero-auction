// Read-only descriptions of committed server events, shared by replay and live UI.
export function describeBattleEvent(event, {english=false, names=new Map()}={}) {
 const e=event||{}, action=String(e.action||'');
 const t=(tr,en)=>english?en:tr;
 const name=id=>String(id||'').startsWith('commander:')?t('Komutan','Commander'):(names.get(id)||id||t('Kahraman','Hero'));
 const actor=name(e.actor),target=e.target?name(e.target):'';
 const amount=Number.isFinite(Number(e.value))?Math.max(0,Number(e.value)):0;
 const damage=['normal','special','splash','commander'].includes(e.damageType)||['attack','commander-hit'].includes(action);
 let effect;
 if(damage){
  const kind=e.critical?t('Kritik vuruş','Critical hit'):e.damageType==='splash'?t('Alan hasarı','Area hit'):e.damageType==='special'?t('Özel vuruş','Special hit'):t('Vuruş','Hit');
  effect=kind+' · '+amount+' '+t('hasar','damage');
  if(Number(e.absorbed)>0)effect+=' · '+e.absorbed+' '+t('kalkan engelledi','blocked by shield');
  if(e.guardTriggered)effect+=' · '+t('Ölümcül darbeden 1 canla korundu','Survived a lethal hit at 1 health');
  if(Number.isInteger(e.lastStandImmortalUntilRound))effect+=' · '+t('Son Kale: ','Last Bastion: ')+t(e.lastStandImmortalUntilRound+'. tur sonuna kadar can en az 1','health stays at least 1 through round '+e.lastStandImmortalUntilRound);
  if(e.huntAttackConsumed===true)effect+=' · '+t('Av Emri: tek saldırılık +%20 saldırı kullanıldı','Hunt Order: one-attack +20% attack used');
  if(Number(e.executedDamage)>0)effect+=' · '+t('Bitirici','Finisher')+' +'+e.executedDamage;
 }else if(['revive','commander-revive'].includes(action))effect=t('Diriliş','Revival')+' · '+amount+' '+t('can','health');
 else if(action==='commander-attack-ultimate')effect=e.focusUntilDeath===true?t('Av Emri · Hedef ölünceye kadar odaklan','Hunt Order · Focus until the target dies'):t('Av Emri · Sonraki saldırıda hedefe odaklan · Sonraki tur sonuna kadar','Hunt Order · Focus target on the next attack · Through next round');
 else if(action==='commander-defense-ultimate')effect=e.impacts?.some(impact=>impact.kind==='guard'&&impact.immortalRounds===2)?t('Son Kale · Takım kalkanı · Seçilen müttefik ölümcül darbeden sonra kalan tur ve sonraki 2 tam tur korunur','Last Bastion · Team shield · Selected ally protected after a lethal hit for the rest of that round and the next 2 full rounds'):t('Son Kale · Kalkan ve ölümcül darbe koruması','Last Bastion · Shield and lethal-hit protection');
 else if(action==='commander-magic-ultimate')effect=t('Aşırı Yük · Sabit ek vuruş gücü · 3 hareket turu','Arcane Surge · Fixed extra hit power · 3 action rounds');
 else if(action==='commander-magic-normal'&&e.impacts?.some(impact=>impact.kind==='stun'))effect=t('Sersemletme · Sonraki saldırı atlanır','Stun · Next attack skipped');
 else if(action==='stun-skip')effect=t('Sersemledi · Saldırı atlandı','Stunned · Attack skipped');
 else if(action==='commander-support-ultimate')effect=t('Diriliş','Revival');
 else if(['heal','passive-heal'].includes(action)||action.startsWith('commander-support-'))effect='+'+amount+' '+t('can yenilendi','health restored');
 else if(action==='shield'||action.startsWith('commander-defense-'))effect='+'+amount+' '+t('kalkan','shield');
 else if(action==='armor-break')effect=t('Savunma azaldı','Defense reduced');
 else if(action==='weaken'||action.startsWith('commander-magic-'))effect=t('Saldırı azaldı','Attack reduced');
 else if(action==='haste')effect=t('Hız','Speed')+' +'+amount;
 else if(action==='delay')effect=t('Sıra geciktirme','Action delay')+' · '+t('tur','round')+' '+(Number.isInteger(e.dueRound)?e.dueRound:e.round)+' '+t('sonunda hareket eder; turunu kaybetmez','acts at the end; does not lose its turn');
 else if(action==='rage')effect=t('Öfke · Saldırı','Rage · Attack')+' '+amount;
 else if(action.startsWith('commander-attack-'))effect=t('Komutan saldırısı','Commander attack')+' · '+amount+' '+t('toplam hasar','total damage');
 else effect=t('Yetenek etkisi','Ability effect');
 if(action==='commander-attack-ultimate'&&e.impacts?.some(impact=>impact.kind==='hunt-buff'&&impact.nextAttack===true&&impact.value===20))effect+=' · '+t('Kullanım anında yaşayan her müttefike sonraki tek saldırı için +%20 saldırı','Every ally alive when cast gains +20% attack for its next attack only');
 const guardedAlly=action==='commander-defense-ultimate'?e.impacts?.find(impact=>impact.kind==='guard'&&impact.immortalRounds===2):null;
 if(guardedAlly)effect+=' → '+name(guardedAlly.target);
 if(action.startsWith('commander-')&&action!=='commander-hit')effect=t(action.endsWith('-ultimate')?'Nihai beceri':'Normal beceri',action.endsWith('-ultimate')?'Ultimate ability':'Normal ability')+' · '+effect;
 if(e.arcaneTransfer?.targetId)effect+=' · '+t('Aşırı Yük aktarımı','Arcane Surge transfer')+' → '+name(e.arcaneTransfer.targetId)+' · +'+e.arcaneTransfer.bonusAttack+' '+t('vuruş gücü; süre yenilenmez','hit power; duration is not reset');
 return actor+(target?' → '+target:'')+' · '+effect;
}
