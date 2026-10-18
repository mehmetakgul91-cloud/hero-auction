# Arena Komutanları — geliştirme taslağı

Bu çalışma yalnızca `feature/arena-commanders` dalındadır. Ana dal ve canlı Render servisi etkilenmez.

## Temel kurallar
- Her oyuncunun kendisine ait bir komutanı vardır.
- Komutan, beş kahramanlık takımın **dışında** yer alır; 5'e 5 kahraman sınırı değişmez.
- Kahramanlar ön veya arka safa serbestçe yerleştirilmeye devam eder.
- Komutan, savaş sahnesinde takımının yanında görünür. Mevcut kahraman çizimleri ve oyun hesaplamaları ilk aşamada korunur.
- Destek komutanı modeli seçildi: komutanlar hedef alınmaz ve saldırmaz. Ayrı dal prototipinde Muhafız (+%5 savunma), Stratejist (+%5 saldırı), Şifacı (+%5 maksimum can), Öncü (+%5 hız) vardır. Bu oranlar henüz oyun dengesi için kesinleştirilmemiştir.
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
