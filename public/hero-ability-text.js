import {abilityValue} from './hero-ability-rules.js';
// Display text only: keep the battle engine's ability names and effect IDs intact.
export const abilityEffects = Object.freeze({
 burst:'Güçlü darbe', drain:'Can çalma', execute:'Bitirici darbe',
 haste:'Hızlanma', heal:'İyileştirme', pierce:'Zırh delme',
 shield:'Kalkan', splash:'Alan hasarı', sunder:'Zırh kırma', weaken:'Zayıflatma',
 guard:'Savunma artışı', evasion:'Çeviklik', rage:'Öfke', focus:'Saldırı odağı',
 regen:'Can yenileme', resist:'Direnç', momentum:'Hız kazanımı'
});

// Templates are shared by the direct renderer and the DOM English translator.
// Numeric placeholders preserve server-owned rates; flavor names never imply mechanics.
const templates=Object.freeze({
 cadence:['Her 3 turda: ','Every 3 rounds: '],
 burst:['Vuruş hasarı +%{0}','Hit damage +{0}%'],
 delay:['hedefin hareketini atlamadan sırasını turun sonuna erteler; hareket ettiyse sonraki tur; geciktirilen hareketten sonraki tur boyunca yeniden geciktirmeye bağışık','moves the target to the end of the round without skipping its action; next round if it already acted; immune to further delay through the round after the delayed action'],
 shield:['Kendine kalkan: kendi savunması × %{0}','Self shield equal to {0}% of own defense'],
 front:['her yaşayan ön saf müttefikine ek kalkan: kendi savunması × %{0}','also shields each living front-row ally for {0}% of own defense'],
 tankSelf:['kendine ek kalkan: kendi savunması × %{0}','also gains an extra self shield for {0}% of own defense'],
 shieldDuration:['kalkan tükenene kadar kalır','shield lasts until consumed'],
 hybrid:['Can oranı en düşük yaşayan müttefike şifa: kendi saldırısı × %{0}; kalkan: kendi savunması × %{1}; tam canda da kalkan verir, saldırmaz','Heals the living ally with the lowest health ratio for {0}% of own attack and shields them for {1}% of own defense; shields even at full health, does not attack'],
 heal:['Can oranı en düşük yaralı müttefike şifa: kendi saldırısı × %{0}; yaralı yoksa saldırır','Heals the injured ally with the lowest health ratio for {0}% of own attack; attacks if nobody is injured'],
 pierce:['Bu vuruşta hedef savunmasının %{0} oranını yok sayar','Ignores {0}% of target defense for this hit'],
 splash:['Diğer düşmanların her birine hasar: ana vuruşun kalkan öncesi ham hasarı × %{0}','Deals {0}% of the primary hit’s raw pre-shield damage to each other enemy'],
 sunder:['Vuruştan sonra hedefin savunmasını %{0} azaltır; kalıcı, çarpanlı birikir','After hitting, reduces target defense by {0}%; permanent, stacks multiplicatively'],
 weaken:['Vuruştan sonra hedefin saldırısını %{0} azaltır; kalıcı, çarpanlı birikir','After hitting, reduces target attack by {0}%; permanent, stacks multiplicatively'],
 drain:['Kendine şifa: ana vuruşun gerçek can hasarı × %{0}; kalkan ve yan alan hasarı dahil değil','Heals self for {0}% of the primary hit’s actual health damage; shield absorption and secondary area damage are excluded'],
 execute:['Vuruş sonrası canı %{0} altına ineni bitirir; tam eşikte bitirmez','After hitting, finishes a target below {0}% health; not at the exact threshold'],
 haste:['Hızını {0} artırır (tavan 150); sonraki tur sırasını etkiler, ek saldırı vermez','Increases speed by {0} (cap 150); changes next round’s order, grants no extra attack'],
 headshot:['Tek vuruşta bitirir','Eliminates with one hit'],
 defense:['Savaş başında savunmayı %{0} artırır','Increases defense by {0}% at battle start'],
 speed:['Savaş başında hızı %{0} artırır; yalnız sıra, kaçınma değil','Increases speed by {0}% at battle start; initiative only, not evasion'],
 focus:['Savaş başında saldırıyı %{0} artırır','Increases attack by {0}% at battle start'],
 rage:['Tur başında can %50 altındaysa bir kez saldırı +%{0}; iyileşse de kalır','Once at round start below 50% health: attack +{0}%; persists after healing'],
 regen:['Her tur başında şifa: azami can × %{0}; eksik canla sınırlı','Restores {0}% of max health at each round start; capped by missing health'],
 thorns:['Vuruş sonrası kendine kalkan: savunma × %{0}','After attacking, gains a self shield for {0}% of defense'],
 unknown:['Etki belirtilmemiş','Effect not specified']
});
const number=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2});
const enNumber=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const segment=(key,values,english)=>templates[key][english?1:0].replace(/\{(\d+)\}/g,(_,i)=>(english?enNumber:number).format(values[i]));
export function abilityImpact(ability,{english=false}={}){
 const effect=ability?.effect;
 const make=(key,...values)=>segment(key,values,english);
 const pct=key=>abilityValue(ability,key)*100;
 const passivePercent=Number.isFinite(ability?.value)?ability.value*100:null;
 if(passivePercent!==null){
  const key={guard:'defense',resist:'defense',evasion:'speed',momentum:'speed',focus:'focus',rage:'rage',regen:'regen',thorns:'thorns'}[effect];
  if(key)return make(key,passivePercent);
 }
 let text;
 switch(effect){
  case 'burst':text=make('burst',(abilityValue(ability,'power')-1)*100)+(ability.delay?'; '+make('delay'):'');break;
  case 'shield':
   if(ability.supportHybrid)text=make('hybrid',pct('healRate'),pct('allyShieldRate'));
   else {text=make('shield',pct('shieldRate'));if(ability.frontShieldRate!==undefined)text+='; '+make('front',pct('frontShieldRate'));if(ability.tankShieldRate!==undefined)text+='; '+make('tankSelf',pct('tankShieldRate'));text+='; '+make('shieldDuration');}
   break;
  case 'heal':text=make('heal',pct('healRate'));break;
  case 'pierce':text=make('pierce',pct('pierceRate'));break;
  case 'splash':text=make('splash',pct('splashRate'));break;
  case 'sunder':text=make('sunder',pct('sunderRate'));break;
  case 'weaken':text=make('weaken',pct('weakenRate'));break;
  case 'drain':text=make('drain',pct('drainRate'));break;
  case 'execute':text=make('execute',pct('executeThreshold'));break;
  case 'haste':text=make('haste',abilityValue(ability,'hasteAmount'));break;
  case 'headshot':text=make('headshot');break;
  default:return make('unknown');
 }
 return make('cadence')+text;
}
const escapeRegex=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const translationPatterns=Object.values(templates).map(([tr,en])=>{
 const indices=[];
 const pattern=tr.split(/(\{\d+\})/).map(part=>{const placeholder=part.match(/^\{(\d+)\}$/);if(!placeholder)return escapeRegex(part);indices.push(Number(placeholder[1]));return '([0-9]+(?:[.,][0-9]+)?)';}).join('');
 return {tr,en,indices,pattern:new RegExp(pattern,'g')};
}).sort((a,b)=>b.tr.length-a.tr.length);
export function translateAbilityDescription(text){
 let out=String(text);
 for(const {en,indices,pattern} of translationPatterns)out=out.replace(pattern,(...args)=>en.replace(/\{(\d+)\}/g,(_,i)=>args[1+indices.indexOf(Number(i))].replace(',','.')));
 return out;
}

const abilityNames = Object.freeze({
 'obsidyen-kalkan':'Obsidyen Kalkan', 'celik-siper':'Çelik Siper',
 'yer-sarsintisi':'Yer Sarsıntısı', 'donma':'Donma', 'gorunmezlik':'Görünmezlik',
 'kutsal-kalkan':'Kutsal Kalkan', 'yakma':'Yakma', 'uzun-menzil':'Uzun Menzil',
 'buz-alan-hasari':'Buz Alan Hasarı', 'can-calma':'Can Çalma',
 'sersemletme':'Sersemletme', 'kritik-ok':'Kritik Ok',
 'hasar-azaltma':'Hasar Azaltma', 'takim-koruma':'Takım Koruma',
 'alan-kontrol':'Alan Kontrolü', 'buz-kalkani':'Buz Kalkanı',
 'kritik-darbe':'Kritik Darbe', 'alev-kilici':'Alev Kılıcı',
 'dogal-yavaslatma':'Doğal Yavaşlatma', 'yavaslatma':'Yavaşlatma',
 'kacis':'Kaçış', 'yildirim':'Yıldırım', 'hareket':'Hareket'
});

export function abilityName(name){
 const raw=String(name||'').trim();
 return abilityNames[raw]||raw.replace(/[-_]/g,' ')||'Belirtilmemiş';
}

export function abilityText(ability,label){
 if(!ability||typeof ability!=='object')return label+': Tanımlı değil';
 return label+': '+abilityImpact(ability);
}
