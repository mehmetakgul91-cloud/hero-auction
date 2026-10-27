# Büyücü komutanı: bir sonraki saldırıyı sersemletme

Yerel taslak, 27 Ekim 2026. Temel: `8e7e693d5ffe6d7e8cb9c52d00df6db9d9caa391`.
Yayın, PR veya üretim değişikliği yapılmadı.

## Normal beceri

- Oyuncu yaşayan **bir rakip kahraman** seçer. Sunucu seçimi ve oyuncunun tarafını doğrular.
- Eski yüzdeyle saldırı zayıflatma yerine **bir sonraki saldırı eylemi tamamen atlanır**.
  Yeni kullanım ayrıca zayıflatma eklemez. Önceden kaydedilmiş zayıflatma durumlarının
  eski davranışı korunur; geçmiş sonuçlar dönüştürülmez.
- Hedef bu tur saldırdıysa etki sonraki saldırısını bekler; tur sonunda kaybolmaz.
  Normal, özel ve alan saldırısının tamamı atlanır; hasar, infaz, saldırıya bağlı
  şifa/kalkan/stat etkileri veya ek alan vuruşları oluşmaz.
- Yalnız şifa/kalkan yapan hareketler etkilenmez ve bekleyen sersemletmeyi tüketmez.
  İlk sonraki saldırı atlanır. Pasif tur başlangıcı etkileri değişmez.
- Tek bekleyen durum vardır; tekrar kullanım ek atlanan saldırı biriktirmez.
  Kabul edilen tekrar kullanım normal enerji/bekleme kurallarına tabidir.
  Aynı istek kimliğinin ağ tekrarı ikinci kez ücret veya durum oluşturmaz.
- Ölüm ve dirilme bekleyen sersemletmeyi temizler; 1 canda kurtulma ölüm değildir.
- Her seviyede **1 saldırı** atlanır. Eski yüzde zayıflatma artışı artık yeni normal
  becerinin etkisi değildir. 40 normal enerji, 5 saniye normal beklemesi, ayrı ulti
  dolumu, sınıf bonusları ve seviye bazlı enerji kazanımı değişmez.
- Bot ve iki oyunculu maçlar aynı sunucu motorunu kullanır. Zor bot bekleyen
  sersemletmeyi üst üste harcamak yerine uygun başka hedefi seçer.
- Türkçe/İngilizce beceri açıklamaları, seviye önizlemesi, savaş kaydı ve hedef
  rozeti aynı kuralı gösterir. İptal/seçim yalnızca arayüzde kaldığı sürece enerji
  harcanmaz; hasar veya durum tarayıcı tarafından hesaplanmaz.

## Ulti denetimi

Ulti üretim mantığında hata bulunmadı ve değiştirilmedi:

- Kullanım anındaki saldırı kadar **sabit ek saldırı** verir; taban saldırı
  katlanarak çarpılmaz. Diğer stat değişiklikleri yoksa toplam 2× saldırıdır.
- Başlangıç turu dahil üç tur sürer (`başlangıç` … `başlangıç + 2`). Seçilen
  kahraman o tur hareket ettiyse sonraki tur başlar. Sersemleme/heal turu süreyi
  uzatmaz; üç başarılı vuruş garantisi değil, üç hareket turudur.
- Normal/özel/alan hasarında bir kez uygulanır; şifa/kalkanı artırmaz.
- Taşıyıcı ölürse yaşayan müttefiklerden **mevcut canı en yüksek** olana aktarılır.
  Bitiş turu korunur, yeni bonus alıcının o andaki saldırısından belirlenir.
  Aynı turda ikinci güçlendirilmiş eylem vermez, birikmez ve süre yenilemez.

## Doğrulama kapsamı

Yeni testler hem gerçek canlı tur imlecini hem atomik saldırı yollarını kapsar:
hedef henüz hareket etmedi/etti, iki oyuncu tarafı, bot seçimi, normal/özel/AoE,
şifa/kalkan, iptal/geçersiz/ölü hedef, ağ tekrarları, sersemletme birikimi,
ölüm/dirilme, ulti bitişi ve kalan süre aktarımı. Eski zayıflatma uyumluluk testleri
korunur. Arayüz kontrolleri DOM/VM testleridir; gerçek tarayıcı görsel testi yapılmadı.
