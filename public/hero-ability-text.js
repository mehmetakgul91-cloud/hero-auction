// Display text only: keep the battle engine's ability names and effect IDs intact.
export const abilityEffects = Object.freeze({
 burst:'Güçlü darbe', drain:'Can çalma', execute:'Bitirici darbe',
 haste:'Hızlanma', heal:'İyileştirme', pierce:'Zırh delme',
 shield:'Kalkan', splash:'Alan hasarı', sunder:'Zırh kırma', weaken:'Zayıflatma',
 guard:'Savunma artışı', evasion:'Çeviklik', rage:'Öfke', focus:'Saldırı odağı',
 regen:'Can yenileme', resist:'Direnç', momentum:'Hız kazanımı'
});

// Short effects with quantities from the battle formulas; never infer mechanics from flavor names.
const abilityImpacts=Object.freeze({
 drain:'Verdiği hasarın %15’i kadar can yeniler',
 execute:'Vuruş sonrası canı %12 altına ineni bitirir',
 haste:'Hızını 8 artırır', heal:'Saldırısının %52’si kadar can yeniler',
 pierce:'Hedefin savunmasının %40’ını yok sayar',
 shield:'Savunmasının %40’ı kadar kalkan kazanır',
 splash:'Diğer düşmanlara vuruş hasarının %25’i kadar hasar',
 sunder:'Hedefin savunmasını %15 azaltır', weaken:'Hedefin saldırısını %10 azaltır',
 headshot:'Tek vuruşta bitirir'
});
const effectNumber=new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2});
export function abilityImpact(ability){
 const value=ability?.value;
 const percent=Number.isFinite(value)?effectNumber.format(value*100):null;
 if(ability?.effect==='burst'&&Number.isFinite(ability.power))return 'Vuruş hasarı +%'+effectNumber.format((ability.power-1)*100);
 if(percent!==null){
  switch(ability.effect){
   case 'guard':case 'resist':return 'Savunmayı %'+percent+' artırır';
   case 'evasion':case 'momentum':return 'Hızı %'+percent+' artırır';
   case 'focus':return 'Saldırıyı %'+percent+' artırır';
   case 'rage':return 'Can %50 altındayken saldırı +%'+percent;
   case 'regen':return 'Her tur %'+percent+' can yeniler (azami can)';
   case 'thorns':return 'Vuruş sonrası savunmanın %'+percent+' kadarı kalkan';
  }
 }
 return abilityImpacts[ability?.effect]||'Etki belirtilmemiş';
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
 const effect=abilityEffects[ability.effect]||'';
 const amount=typeof ability.value==='number'?ability.value:NaN;
 return label+': '+abilityName(ability.name)+(effect?' · '+effect:'')+
  (Number.isFinite(amount)?' ('+(amount*100).toFixed(0)+'%)':'');
}
