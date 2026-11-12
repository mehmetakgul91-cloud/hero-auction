# Büyücü komutanı: alan hasarı ve sonraki eylemi sersemletme

Yerel taslak, 27 Ekim 2026. Temel: `8e7e693d5ffe6d7e8cb9c52d00df6db9d9caa391`.
Yayın, PR veya üretim değişikliği yapılmadı.

## Normal beceri (güncel yerel taslak)

- Oyuncu yaşayan bir rakip seçer. Normal bedeli 60 enerji, normal beklemesi 5 saniyedir.
- Ana hasar = yuvarla(komutan seviyesi + savaş başında hazırlanmış enerji kahramanlarının toplam saldırısının %5’i). Sonraki ölümler ve güçlendirmeler başlangıç toplamını değiştirmez.
- Hedefin başlangıç dizilimindeki komşu yuvalarında bulunan yaşayan rakiplerin her biri yuvarla(ana hasar × %25) alan hasarı alır. Çapraz yuvalar dahildir. Boş veya düşen kahraman yuvaları kapanmaz; alan bunların üzerinden yayılmaz.
- Yalnız seçilen hedef hasardan sonra yaşıyorsa sonraki planlı eylemini tamamen atlar. Saldırı, alan vuruşları, şifa ve kalkan dahildir. Atlanan eylemin turunda kendi tetiklediği pasifler de engellenir; eylem atlandıktan sonra tur sonuna kadar engel sürer. Hazırlanmış başlangıç bonusları, önceki öfke/kalkanlar ve müttefik etkileri kaldırılmaz. Etki tur sonunda kaybolmaz ve birikmez.
- Yeni kayıtlar `nextAction: true`, `stunVersion: 2`, `passiveSilence: true` ve kesin `blockedRound` kullanır. Her kahramanın `heroActionClockVersion: 1` / `completedActionTurns` sayacı yalnız tamamlanan eylemlerde artar; her üçüncü eylem özeldir. Sersemleme sayacı ilerletmez, ölüm/dirilme sıfırlamaz. Sürümsüz `nextAction` kayıtları yalnız eylemi atlatır. Eski `nextAttack: true` kayıtları yalnız saldırı atlatır; eski şifa/kalkan davranışı ve yüzde zayıflatma kayıtları yeniden yorumlanmaz.
- Ölüm, dirilme ve savaş bitişi bekleyen durumu temizler. 1 canda kurtulma ölüm değildir.
- İptal veya geçersiz hedef enerji harcamaz. Ağ tekrarı ikinci ücret oluşturmaz. Arayüz hasarı kendisi uygulamaz; sunucunun hedef vuruşlarını ve durumlarını gösterir.
- Türkçe/İngilizce profil, açık artırma ve eğitim açıklamaları aynı kuralı gösterir. Rozet ve kayıtlarda eski saldırı sersemletmesi yeni eylem sersemletmesinden ayrılır.

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
