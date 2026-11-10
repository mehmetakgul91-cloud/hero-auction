# Arka merkez koruması

Yeni savaş başlarken takım tam **2 ön + 3 arka** ise, sıralanmış arka safın ikinci kahramanı korunur. Merkez ve diğer dört koruyucu kahraman, başlangıçtaki kimlikleriyle sabitlenir. Sonradan kalan kahramanların sayısına veya ekrandaki boşluklara göre yeni merkez oluşturulmaz.

- Koruyucuların dördü de hayattayken merkez, kahramanların otomatik normal veya özel vuruşunun ana hedefi olamaz.
- Önündeki veya yanındaki dört kahramandan **herhangi biri gerçekten öldüğünde** koruma hemen ve kalıcı olarak kalkar. Bu ölüm normal/özel vuruş, alan hasarı, infaz veya komutan hasarından kaynaklanabilir.
- Son Kale ile 1 canda kalmak ölüm değildir. Ölen koruyucuyu diriltmek korumayı geri getirmez.
- Av Emri her zaman hedef seçimine önceliklidir. Komutanların açık hedef seçimi, dost etkileri ve toplu hasarı bu korumayı dikkate almaz.
- Alan hasarı değişmez; korumalı merkez de mevcut alan hasarını alır. Koruma bir hasar azaltma veya dokunulmazlık etkisi değildir.
- Koruma kalktıktan sonra eski saf öncelikleri devam eder: normal kahramanlar önce yaşayan ön safı, suikastçılar önce yaşayan arka safı hedefler. Bir ön kahramanın ölmesi, normal kahramanların kalan ön safları atlaması anlamına gelmez.

Merkezin kendisi istisna bir etkiyle ölür ve koruyucuların hiçbiri ölmeden diriltilirse aynı merkez kimliği korunur; bir koruyucu öldüyse koruma yeniden kurulmaz.

## Veri ve uyumluluk

`initializeCenterProtection` yalnız yeni savaş takımları hazırlandıktan sonra çalışır. Merkezin `centerProtection` alanı `{version:1, protectorIds:[dört kimlik], broken:false}` biçimindedir. Ölüm güncellemesi, gerçek HP hasarıyla aynı atomik işlemde `broken:true` yapar. Normal görüntüleme, yeniden bağlanma, kopyalama ve diriltme bu alanı yeniden üretmez.

Sıra, hazır dizilişin `positions` permütasyonundan sunucuda üretilen takım sırasıdır. Aynı saftaki takas `positions` ve `roles` değerlerini birlikte değiştirirken `lanes` değerlerini korur. Kimlikler savaş başladığında kilitlenir. Yeni rövanş, yeni dizilişten yeni koruma oluşturur.

Bu alanı taşımayan eski savaş görüntüleri eski hedef seçimini korur. Tamamlanmış kayıtların vuruşları yeniden hesaplanmaz; yeni bir simülasyon yeni kuralları uygular. Eski kayıt tekrarı ve yeni kurallı eşzamanlı ölüm sırası ayrı test edilir.

## Doğrulama

- `node --test tests/battle-center-protection*.test.mjs`
- `node --test tests/commander-transfer-replay-order.test.mjs`
- `npm test`
- `npm run audit:strict`

Saf/rol öncelikleri, tüm otomatik hedef seçiciler, Av Emri ve diğer komutan etkileri, alan hasarı, ilk ölüm/diriltme, Son Kale, eski kayıtlar, aynı saftaki sıra değişimi, PvP yeniden bağlanma/rövanş ve üç bot zorluğundaki gerçek karar/canlı savaş akışı kapsanır. Botun kalıcı veritabanlı giriş/ödeme/ödül yolu bu özellik için değiştirilmez; bunun ayrı PostgreSQL test altyapısı vardır.
