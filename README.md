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
