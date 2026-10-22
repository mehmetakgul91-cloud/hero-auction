# Hero Auction

50 özgün kahramanla açık artırma ve beşe beş arena oyunu. İki oyuncu 20 krediyle 10 kart için yarışır, ardından dizilişini seçer. Canlı savaş ve komutan becerileri sunucu tarafından yürütülür. Bilgisayara karşı, özel oda, eşleştirme ve rövanş desteklenir.

## Çalıştırma

Node.js 18 veya üzeri gerekir. `npm install` ve `npm start` komutlarından sonra `http://localhost:3000` açılır. Kalıcı hesap, altın ve komutan verileri için `DATABASE_URL`, Google oturumu için mevcut OAuth yapılandırması kullanılır.

## Yapı

- `server.js`: HTTP/SSE, odalar, hesaplar ve PostgreSQL bağlantısı.
- `battle-engine.js`, `battle-roster.json`: savaş kuralları ve 50 özgün kahraman.
- `public/app.js`: ana oyun arayüzü.
- `public/battle-preview.js`, `public/battle-preview.css`: aktif arena, diziliş ve savaş efektleri.
- `crazygames-build.js`, `public/platform.js`, `crazygames-auth.js`: `/crazygames/` sürümü ve platform hesabı doğrulaması.
- `docs/crazygames-submission.md`: CrazyGames başvuru notları.

## Kontroller

`node --test *.test.js tests/*.test.* test/*.test.js` savaş, hesap, komutan ve platform kontrollerini çalıştırır. `npm run audit:strict` aktif kahraman görsellerini ve güçlerini denetler.

## Açık artırma kart havuzu

Her maçta aktif havuzdan 10 farklı kahraman rastgele seçilir; efsanevi, nadir veya diğer nadirlikler için sabit adet kotası yoktur. Aynı kahraman aynı açık artırmada tekrar etmez. Son kartların eksik takıma verilmesi, mevcut otomatik ücret/eksi kredi kuralları ve kalan kredi güç bonusu değişmemiştir.

## Bilgisayar antrenmanı

Bot da oyuncuyla aynı canlı savaş motorunu, enerji maliyetlerini ve bekleme sürelerini kullanır. Her yeni maç/rövanşta bir önceki komutandan farklı, geçici ve sıfır seviyeli bir komutan alır; kahramanları yalnızca normal açık artırmadan edinir. Oyuncunun kayıtlı komutanı ve gelişimi değişmez. Eski, komutan seçilmemiş hesaplarda yalnızca o antrenman için sıfır seviyeli saldırı komutanı kullanılır.

- **Kolay:** düşük teklif bütçesi, basit diziliş ve daha seyrek normal beceriler.
- **Orta:** kredi rezervi ve kart değeri, role uygun ön saf ve düzenli beceri kullanımı.
- **Zor:** takım eksiklerine göre alışveriş, dayanıklı ön saf, duruma göre enerji biriktirme, iyileştirme/kalkan zamanlama ve büyücü hedef seçimi.

Zorluk güç veya altın hilesi eklemez; henüz açılmamış kartlar ve rakibin gizli enerjisi karar girdisi değildir. Zor botun kazanması garanti değildir. Antrenman giriş ücreti, altın ödülü ve lig puanı değişimi yoktur.
