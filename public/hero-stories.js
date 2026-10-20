// Original fictional lore for the 52 Hero Auction characters.
const HERO_LORE={
 tank:{home:'sınır kalelerinin gölgesinde',gift:'savunma hattını ayakta tutmayı',trial:'düşmanın kuşatmasını',symbol:'kalkan',purpose:'arkadaşlarını korumak'},
 fighter:{home:'savaşçıların yetiştiği dağ geçitlerinde',gift:'cesurca mücadele etmeyi',trial:'acımasız bir düelloyu',symbol:'silah',purpose:'haksızlığa karşı savaşmak'},
 assassin:{home:'sessiz sokakların ve gizli geçitlerin arasında',gift:'iz bırakmadan hareket etmeyi',trial:'karanlık bir pusuyu',symbol:'hançer',purpose:'güçsüzlerin hakkını savunmak'},
 energy:{home:'eski gözlemevlerinin çevresinde',gift:'gizemli enerjileri yönlendirmeyi',trial:'kontrolden çıkan bir büyüyü',symbol:'tılsım',purpose:'gücün dengesini korumak'},
 support:{home:'şifa ocaklarının ve bilge toplulukların içinde',gift:'başkalarına umut vermeyi',trial:'bir salgın ve kuşatmayı',symbol:'ışık',purpose:'kimseyi geride bırakmamak'}
};
const STORY_PLACES=['Kayıp Vadiler','Sis Limanı','Yedi Kule','Kızıl Geçit','Ay Ormanı','Kristal Ovası','Kuzey Sınırı','Unutulmuş Şehir'];
const STORY_COMPANIONS=['genç bir haritacı','yaralı bir nöbetçi','gezgin bir ozan','sessiz bir iz sürücü','yaşlı bir şifacı','cesur bir demirci','kayıp bir elçi','meraklı bir çırak'];
const STORY_RELICS=['çatlamış bir pusula','mühürlü bir tomar','sönmeyen bir fener','eski bir sancak','gümüş bir anahtar','işaretli bir taş','unutulmuş bir günlük','kırık bir taç'];
function heroStory(hero){
 const name=hero.name||'Bu kahraman',role=HERO_LORE[hero.role]||HERO_LORE.fighter;
 const hash=[...name].reduce((n,c)=>n+c.codePointAt(0),0);
 const place=STORY_PLACES[hash%STORY_PLACES.length];
 const companion=STORY_COMPANIONS[(hash+3)%STORY_COMPANIONS.length];
 const relic=STORY_RELICS[(hash+5)%STORY_RELICS.length];
 const active=String(hero.active?.name||'özel gücü').replace(/[-_]/g,' ');
 const passive=String(hero.passive?.name||'direnci').replace(/[-_]/g,' ');
 const rarity=({legendary:'efsanevi',rare:'nadir',advanced:'gelişmiş',common:'sıradan'})[hero.rarity]||'gizemli';
 return [
 `${name}, ${place} yakınlarında anlatılan eski bir efsanenin merkezinde doğdu.`,
 `Çocukluğu ${role.home} geçti.`,
 `İlk öğretmeni ona ${role.gift} öğretti.`,
 'Ancak bu derslerin anlamını kavraması yıllar aldı.',
 'Yaşadığı topraklarda bir gece bütün gözetleme ateşleri aynı anda söndü.',
 'Halk bunun yaklaşan büyük bir felaketin habercisi olduğunu düşündü.',
 `${name} o gece korkusunu saklamadı.`,
 'Korkuya rağmen yerinde kalmaya karar verdi.',
 `Sabah olduğunda karşısına ${companion} çıktı.`,
 `Yabancı, yanında ${relic} taşıyordu.`,
 'Bu eşyanın geçmişte kaybolmuş bir yemine ait olduğu anlaşıldı.',
 'Yeminin bozulması, çevredeki köylerin güvenliğini tehdit ediyordu.',
 `${name} gerçeği öğrenmek için tek başına yola çıktı.`,
 'İlk gün yolunu kesen fırtına onu geri dönmeye zorladı.',
 'İkinci gün eski bir köprüden geçmek için yabancılara güvenmesi gerekti.',
 'Üçüncü gün kendi kararlarının başkalarını da etkilediğini fark etti.',
 `Yolculuğun sonunda ${role.trial} aşması gerekti.`,
 `Tam umudunu yitirecekken ${active} adını verdiği tekniği kullandı.`,
 'Bu güç, beklediğinden çok daha büyük bir bedel taşıyordu.',
 `Onu ayakta tutan şey ${passive} olarak bilinen içgüdüsüydü.`,
 'Zafer kazandığında düşmanlarını yok etmek yerine geri çekilmelerine izin verdi.',
 'Bu karar, yanında yürüyenlerin ona duyduğu saygıyı artırdı.',
 `Yine de ${name} kendisini bir kahraman ilan etmedi.`,
 'Kurtardığı insanların evlerine güvenle dönmesini bekledi.',
 `Ardından ${relic} üzerindeki eski işaretleri çözmeye koyuldu.`,
 'İşaretler, henüz bitmemiş daha büyük bir çatışmaya işaret ediyordu.',
 `Bu yüzden ${role.symbol} simgesini kendi yemininin parçası yaptı.`,
 `Yemininde en önemli söz ${role.purpose} oldu.`,
 `Zamanla adı ${rarity} kahramanların hikâyeleri arasında anılmaya başladı.`,
 'Fakat her yeni savaş ona farklı bir sorumluluk öğretti.',
 'Gücün tek başına zafer getirmediğini hiçbir zaman unutmadı.',
 `Bugün ${name}, Hero Auction arenasına yalnızca kazanmak için değil, verdiği sözü tutmak için çıkıyor.`
 ].join(' ');
}
