# Son Kale: seçilen müttefikte ölümcül darbe sonrası 2 tam tur

Yerel taslak, 27 Ekim 2026. Temel: onaylanmış ancak henüz birleşmemiş büyücü PR #58,
`5e6beda10761cf5dba885e4e3caef8758630fe54`; temel ağaç
`f058c16ee688a11f36b065df632cc831ac887cba` ile birebir yerel kopya.
Bu savunma değişikliği yayımlanmadı; push, PR, merge veya deployment yapılmadı.

## Kesin davranış

- Oyuncu **yaşayan bir müttefiki** seçer. Önceden sunucu otomatik olarak en düşük
  can oranlı müttefiki seçiyordu. Bot yine o politikayı kullanır ama açık hedef
  kimliğini aynı sunucu doğrulamasına gönderir; eşitlik kahraman kimliğiyle çözülür.
- Hedef seçimi/iptal henüz bir kullanım değildir. Geçersiz, ölü, rakip, çoklu veya
  artık yaşamayan hedef reddedilir; enerji, ulti hakkı ve kalkan değişmez.
- Kullanım takımın mevcut kalkan bütçesini korur ve seçilen kahramanı ilk ölümcül
  darbeye kadar süresiz hazır durumda bekletir. Hazır durum başka kahramana geçmez.
- İlk ölümcül vuruş (normal hasar ve varsa aynı vuruşun infaz kısmı birlikte)
  kahramanı **1 canla** bırakır. O turun kalanında ve **sonraki 2 tam turda** can
  1’in altına düşmez. Örnek: 3. turun ilk veya son saldırısında tetiklenirse
  3, 4 ve 5. tur boyunca korunur; 6. tur başında biter.
- Bu, bütün hasarı sıfırlayan dokunulmazlık değildir. Şifa normal çalışır;
  iyileşen kahraman ölümcül olmayan hasarı alır, yalnızca son can korunur.
  Her vuruşta mevcut %70 kalkan emilimi aynen sürer.
- Tekrar darbe, şifa, sersemleme, hedefin o tur hareket etmiş olması veya yeniden
  bağlanma bitiş turunu yenilemez. İnfaz, özel saldırı, komutan hasarı ve her AoE
  hedefi aynı atomik hasar işlevini kullanır. Mevcut motorda zamanla hasar/zehir/
  yansıma yolu yoktur; `thorns` yansıtma değil kalkan verir ve değiştirilmemiştir.
- Gerçek ölüm gerçekleşmeden öldürme/ölüm enerjisi veya büyücü güç aktarımı oluşmaz.
  Koruma bittiğinde gerçek ölüm normal işler. Dirilme eski korumayı geri getirmez.
- Sersemleyen kahramanın saldırısı yine atlanır; ölümsüzlük zamanı durmaz.
  15. tur maç sınırı uzamaz. Yeni maçta durumlar taşınmaz.
- 85 ulti dolumu, normal enerji, beklemeler, seviye bazlı kalkan ve savaşta tek
  ulti hakkı değişmez. Koruma süresi her seviyede sabit 2 tam turdur.

## Kayıt ve uyumluluk

Yeni hazır durumda `lastStandImmortalRounds: 2` sürüm işareti vardır. Tetiklenince
hazır işaretler temizlenir; `lastStandTriggeredRound` ve
`lastStandImmortalUntilRound` saklanır. Hasar olayları bu iki alanı da taşır;
TR/EN rozet ve tekrar oynatma gerçek bitiş turunu gösterir, yerelde hasar hesaplamaz.
Eski süreli veya kalıcı hazır kayıtlar sürüm işareti yoksa eski tek-vuruş kuralını
korur. Geçmiş tekrarlar sessizce iki turluk koruma olarak yeniden yorumlanmaz.

## Denge notu

Bu bilinçli bir savunma güçlendirmesidir: eskiden sonraki vuruşta ölen kahraman,
artık aynı turdaki birden çok saldırıdan ve sonraki iki tam turdan sağ çıkabilir.
Özellikle Av Emri ile odaklanan hedef aynı hedef olarak kalır; saldırılar boşa
çıkarak ek eylem/şifa fırsatı sağlayabilir. Seçim artık otomatik olmadığı için
oyuncu düşük-canlı kahraman yerine stratejik bir taşıyıcıyı koruyabilir.
Bunlar mekanik sonuçlardır, gerçek oyuncu kazanma oranı veya kusursuz denge iddiası
 değildir. Kalkan miktarı ya da enerji maliyeti izinsiz dengelenmemiştir.

## Doğrulama

Yeni testler iki oyuncu koltuğunda PvP/bot ve turun erken/geç tetiklenmesini gerçek
canlı tur imleciyle doğrular. Tekrar öldürücü darbe, bütün aktif hasar aileleri,
ikincil AoE, infaz, şifa, sersemleme, iptal, yanlış hedef, ağ tekrarları,
yeniden bağlanma, gerçek ölüm/dirilme ve 15. tur sınırı ayrıca kapsanır.
Arayüz testleri DOM/VM tabanlıdır; gerçek tarayıcı görsel testi yapılmamıştır.
