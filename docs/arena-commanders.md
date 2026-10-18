# Arena Komutanları — geliştirme taslağı

Bu çalışma yalnızca `feature/arena-commanders` dalındadır. Ana dal ve canlı Render servisi etkilenmez.

## Temel kurallar
- Her oyuncunun kendisine ait bir komutanı vardır.
- Komutan, beş kahramanlık takımın **dışında** yer alır; 5'e 5 kahraman sınırı değişmez.
- Kahramanlar ön veya arka safa serbestçe yerleştirilmeye devam eder.
- Komutan, savaş sahnesinde takımının yanında görünür. Mevcut kahraman çizimleri ve oyun hesaplamaları ilk aşamada korunur.
- Komutan sınıfları: Saldırı (+%5 tüm kahramanların saldırısı), Savunma (+%5 tüm kahramanların savunması), Büyücü (+%5 yalnız enerji kahramanlarının saldırısı), Destek (+%5 tüm kahramanların maksimum canı). Hız komutanı kaldırıldı.
- Komutan seçimi, oyuncu hesabında saklama ve gerçek maç sunucusuna entegrasyon henüz yapılmadı.

## Aşamalı geliştirme
1. Komutan veri modeli ve her oyuncuya ait komutan kimliği.
2. Hazırlık ekranında komutan alanı; arenada iki komutanın görsel yerleşimi.
3. Komutan seçimi, profili ve kalıcılık.
4. Ayrı simülasyonlarla doğrulanmış, sınırlı komutan becerileri.
5. Mobil testler, gerçek oyuncu/bot testleri, sonrasında isteğe bağlı ana dala birleştirme.

## Kabul ölçütleri
- Her iki tarafta birer komutan; takımda tam beş kahraman.
- Komutan alanı mobilde savaş kontrollerini veya can barlarını kapatmaz.
- Komutan yetenekleri devre dışıyken mevcut savaşın sonucu aynı tohum ve takımlarla değişmez.
- Canlı oyuna otomatik dağıtım yapılmaz.

## İlk prototipin durumu
- `arena-commanders.js`: destek komutanı tanımları ve stat bonusu.
- `battle-engine.js`: isteğe bağlı `commanders: [idA,idB]` parametresi; varsayılan `[null,null]`.
- `tests/arena-commanders.test.js`: komutansız geriye uyumluluk ve bonus testleri (henüz CI/Node ile çalıştırılmadı).
- Sonraki iş: oyuncu bazlı komutan seçimi, hazırlık/arena görselleri, gerçek maç veri akışı ve simülasyon testleri.

## Altınla gelişim (prototip)
- Üyelikte bir komutan seçilir; gerçek hesap kaydı henüz entegre edilmedi.
- Geliştirme alanları: saldırı, savunma, büyü ve destek. Her biri 0–10 seviye.
- Bir sonraki seviye 100 × (mevcut seviye + 1) altın; seviye başına +%1 ilgili etki.
- Komutan uzmanlığında başlangıç +%5. Büyü etkisi enerji sınıfındaki kahramanların saldırısına uygulanır.
- Altın harcaması yalnızca güvenli sunucu işlemi ve kalıcı hesap kaydı tamamlandığında etkinleştirilecek.

## Güncel uzmanlık ve sınıf kuralları
- Başlangıç bonusu %0; yalnız altınla kazanılan seviyeler etki eder.
- Ana uzmanlık 10 seviye / en fazla %10; diğer üç dal ayrı ayrı 4 seviye / en fazla %4.
- Saldırı dalı yalnız savaşçı ve suikastçı kahramanların saldırısını güçlendirir.
- Savunma dalı yalnız tank kahramanların savunmasını güçlendirir.
- Büyü dalı yalnız enerji kahramanların saldırısını güçlendirir.
- Destek dalı yalnız destek kahramanların maksimum canını güçlendirir.
- Bonuslar tüm takıma uygulanmaz; komutanın kimliği hangi dalın %10'a çıkabileceğini belirler.
- Önceki +%5 ücretsiz başlangıç bonusu kaldırıldı.

## Güncel yükseltme ekonomisi (18 Ekim 2026)
- Her geliştirme seviyesi yalnız ilgili sınıfa +%0,5 bonus verir.
- Ana uzmanlık 20 seviye / en fazla %10; diğer üç dal ayrı ayrı 8 seviye / en fazla %4.
- Altın maliyeti her dal için 200 × (mevcut seviye + 1): 200, 400, 600…
- Gelecekteki elmas maliyeti her dal için 10 × (mevcut seviye + 1): 10, 20, 30…
- Elmasla yükseltme henüz aktif değildir; yalnız fiyat hesabı hazırdır.
- Eski 100 altın ve +%1 seviye sistemi geçersizdir. Yukarıdaki kurallar önceki prototip notlarının yerine geçer.
