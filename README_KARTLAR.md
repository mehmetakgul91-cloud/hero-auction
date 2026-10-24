# Güncel kahraman havuzu

Aktif oyun havuzu `battle-roster.json` içindeki 50 özgün kahramandan oluşur. `commander-original-roster.json` komutan savaşları için kullanılan özgün havuzdur. Kimlik, rol, nadirlik, güç, aktif/pasif yetenek ve saf etkileri bu kayıtlardan alınır.

Görseller `public/images/original/` içindedir. Yeni kahraman eklenirken iki havuzun savaş uyumu ve görsel yolu doğrulanmalıdır. `npm run audit:strict` aktif havuzun yerel görsellerini ve güçlerini denetler.

Eski Pokémon, Marvel, DC ve LOTR kart arşivleri, indirme araçları ve kullanılmayan 3D sahne kaldırılmıştır. Güncel arena `public/battle-preview.js` ve `public/battle-preview.css` ile çalışır.
