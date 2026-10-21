// Display text only: keep the battle engine's ability names and effect IDs intact.
export const abilityEffects = Object.freeze({
 burst:'Güçlü darbe', drain:'Can çalma', execute:'Bitirici darbe',
 haste:'Hızlanma', heal:'İyileştirme', pierce:'Zırh delme',
 shield:'Kalkan', splash:'Alan hasarı', sunder:'Zırh kırma', weaken:'Zayıflatma',
 guard:'Savunma artışı', evasion:'Çeviklik', rage:'Öfke', focus:'Saldırı odağı',
 regen:'Can yenileme', resist:'Direnç', momentum:'Hız kazanımı'
});

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
