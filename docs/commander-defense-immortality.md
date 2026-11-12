# Son Kale: tetiklendiği tur dahil toplam 2 tur

12 Kasım 2026: yeni kullanımların koruması 3 turdan 2 tura indirildi.

## Kesin davranış

- Oyuncu **yaşayan bir müttefiki** seçer. Önceden sunucu otomatik olarak en düşük
  can oranlı müttefiki seçiyordu. Bot yine o politikayı kullanır ama açık hedef
  kimliğini aynı sunucu doğrulamasına gönderir; eşitlik kahraman kimliğiyle çözülür.
- Hedef seçimi/iptal henüz bir kullanım değildir. Geçersiz, ölü, rakip, çoklu veya
  artık yaşamayan hedef reddedilir; enerji, ulti hakkı ve kalkan değişmez.
- Kullanım takımın mevcut kalkan bütçesini korur ve seçilen kahramanı ilk ölümcül
  darbeye kadar süresiz hazır durumda bekletir. Hazır durum başka kahramana geçmez.
- İlk ölümcül vuruş (normal hasar ve varsa aynı vuruşun infaz kısmı birlikte)
  kahramanı **1 canla** bırakır. O turun kalanında ve **sonraki 1 tam turda** can
  1’in altına düşmez. Örnek: 3. turun ilk veya son saldırısında tetiklenirse
  3 ve 4. tur boyunca korunur; 5. tur başında biter.
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
  ulti hakkı değişmez. Koruma süresi her seviyede tetiklendiği turun kalanı ve sonraki 1 tam turdur.

## Kayıt ve uyumluluk

Yeni hazır durumda `lastStandImmortalRounds: 1` sonraki tam tur sayısını belirtir.
Tetiklenince hazır işaretler temizlenir; `lastStandTriggeredRound` ve
`lastStandImmortalUntilRound` (tetiklenme turu + 1) saklanır. Hasar olayları bu iki
alanı da taşır. TR/EN rozet ve tekrar oynatma gerçek bitiş turunu gösterir,
yerelde hasar hesaplamaz. Sunucu ve simülasyon aynı hasar işlevini kullanır.

Önceden kaydedilmiş `lastStandImmortalRounds: 2` hazır etkiler ve tetiklenme turu
+ 2 bitişli aktif etkiler, eski toplam 3 tur süresini korur. Geçmiş tekrarların
metni ve rozetleri kayıtlı süreyi gösterir. Süreli veya kalıcı hazır kayıtlar
sürüm işareti yoksa eski tek-vuruş kuralını korur. Eski kayıtlar yeniden hesaplanmaz.

## Doğrulama

Yeni testler iki oyuncu koltuğunda PvP/bot ve turun erken/geç tetiklenmesini gerçek
canlı tur imleciyle doğrular. Tekrar öldürücü darbe, bütün aktif hasar aileleri,
ikincil AoE, infaz, şifa, sersemleme, iptal, yanlış hedef, ağ tekrarları,
yeniden bağlanma, gerçek ölüm/dirilme ve 15. tur sınırı ayrıca kapsanır.
Arayüz testleri DOM/VM tabanlıdır; gerçek tarayıcı görsel testi yapılmamıştır.
