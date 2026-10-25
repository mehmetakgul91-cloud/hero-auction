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
  if(Number(e.executedDamage)>0)effect+=' · '+t('Bitirici','Finisher')+' +'+e.executedDamage;
 }else if(['revive','commander-revive'].includes(action))effect=t('Diriliş','Revival')+' · '+amount+' '+t('can','health');
 else if(action==='commander-attack-ultimate')effect=t('Av Emri · Sonraki saldırıda hedefe odaklan','Hunt Order · Focus target on the next attack');
 else if(action==='commander-defense-ultimate')effect=t('Son Kale · Kalkan ve ölümcül darbe koruması','Last Bastion · Shield and lethal-hit protection');
 else if(action==='commander-magic-ultimate')effect=t('Aşırı Yük · Sabit ek vuruş gücü · 3 hareket turu','Arcane Surge · Fixed extra hit power · 3 action rounds');
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
 if(action.startsWith('commander-')&&action!=='commander-hit')effect=t(action.endsWith('-ultimate')?'Nihai beceri':'Normal beceri',action.endsWith('-ultimate')?'Ultimate ability':'Normal ability')+' · '+effect;
 if(e.arcaneTransfer?.targetId)effect+=' · '+t('Aşırı Yük aktarımı','Arcane Surge transfer')+' → '+name(e.arcaneTransfer.targetId)+' · +'+e.arcaneTransfer.bonusAttack+' '+t('vuruş gücü; süre yenilenmez','hit power; duration is not reset');
 return actor+(target?' → '+target:'')+' · '+effect;
}
