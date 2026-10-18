# Arena Komutanları — geliştirme taslağı

Bu çalışma yalnızca `feature/arena-commanders` dalındadır. Ana dal ve canlı Render servisi etkilenmez.

## Temel kurallar
- Her oyuncunun kendisine ait bir komutanı vardır.
- Komutan, beş kahramanlık takımın **dışında** yer alır; 5'e 5 kahraman sınırı değişmez.
- Kahramanlar ön veya arka safa serbestçe yerleştirilmeye devam eder.
- Komutan, savaş sahnesinde takımının yanında görünür. Mevcut kahraman çizimleri ve oyun hesaplamaları ilk aşamada korunur.
- Komutanların yetenekleri, güç bonusları, seçim/kazanım yöntemi ve savaşta hedef alınıp alınamayacağı henüz kararlaştırılmadı; onaylanmadan oyun dengesine etkili değişiklik yapılmaz.

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
