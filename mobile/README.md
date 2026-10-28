# Android geliştirme sürümü — 28 Ekim 2026

Bu dal, `main` dalının `7e81c9e65dd73d91ab8124e9cfa0d04ffe19d8c0`
sürümünü mevcut Capacitor Android istemcisine taşır. `0.2.0-development`
ayrı test uygulamasıdır (`tr.com.heroauction.android.test`); Google Play yayını
veya üretim dağıtımı değildir. Ana web dosyaları değiştirilmeden paketlenir.

## Yapılanlar

- Önceki portre düzeni, yerel kayıpsız PNG→WebP eşlemeleri, geri tuşu ve
  arka plan/dönüş davranışları korunur.
- Yeni komutan dalı simgeleri, dinamik hava katmanları ve arena sahneleri
  pakete alınır. Tam ekran sahneleri özgün çözünürlük/byte içeriğini korur.
  Portreler önceki 640 px sınırında kalır. Yaklaşık 33,9 MB web varlığı için
  40 MB varlık ve 45 MB APK üst sınırları uygulanır; gerçek APK ölçüsü CI
  doğrulama çıktısında yer alır.
- Sunucudaki `NATIVE_ALLOWED_ORIGINS` varsayılan boş/kapalıdır. Ayrı test
  ortamında `https://localhost` açıldığında API CORS desteği sağlanır;
  mevcut oturum ve oyuncu yetki denetimleri aynen çalışır.
- Android otomasyonu gerçek dokunma olaylarını `UiAutomation` ile iletir,
  pencere odağını ve görünür hedefi denetler; JavaScript `click()` ile testi
  atlatmaz. Döndürülen olay sonucu başarısızsa test de başarısız olur.

## Yerel kontroller

```sh
npm ci
npm --prefix mobile ci
node --test tests/native-cors.test.mjs
npm --prefix mobile test
npm run audit:strict
```

Kök proje için `package.json` içindeki Node 26.12.1 kullanılır. Android
derlemesi JDK 21, Android platform 36 ve build-tools 36.0.0 gerektirir.
`npm --prefix mobile run doctor` eksikleri gösterir; SDK lisanslarını kabul
etmez veya otomatik SDK indirmez.

Yerel yapılandırma olmadan build, açıkça bağlantısız önizlemedir. Misafir
girişi devre dışıdır. Gerçek bir test sunucusu için göz ardı edilen
`mobile/config.local.json` dosyasında API ve davet kökenleri aynı HTTPS
sunucusu olmalıdır. Sunucu erişimi, dağıtımı veya üretim ayarı bu dalın
hazırlanmasıyla değiştirilmez.

## Üretimden bağımsız CI

`Android development verification (no release)` iki portre ekranında Android
15 WebView kullanır: 640×1136 / yazı ölçeği 1,0 ve 780×1688 / 1,3.
Her iş kendi güncel `server.js` sürecini bellekte açar. Veritabanı,
yönetici kimliği, imza anahtarı veya ekonomi bayrağı devralınmaz.
Yerel HTTPS sunucusu emülatöre `adb reverse` ile bağlanır. Tek kullanımlık
localhost sertifikası yalnız göz ardı edilen debug kaynaklarına eklenir;
cleartext veya bütün sertifikaları kabul eden bir TLS atlatması yoktur.

Akış: native testleri → misafir giriş/komutan → açık artırma → beş kahraman
dizilişi → canlı bot savaşı → arka plan/dönüş → sonuç. Aynı oda/SSE ve yanlış
koltuk yetkisi ayrıca gerçek HTTP sunucusuyla test edilir. Sonrasında APK'nın
varlık hashleri, sürümü, hedefi, boyutu ve imzası doğrulanır.
Ekran görüntüleri ve raporlar Actions artifact'ı olur; APK otomatik
yayımlanmaz. Localhost'a bağlı tanılama APK'sı telefona dağıtılabilir ürün
paketi değildir. Test servisine bağlanan indirilebilir APK ayrı bir adımdır.

## Henüz tamamlanmayanlar

- Fiziksel Android cihazında akıcılık, pil, klavye ve kesintili ağ testi.
- İki gerçek cihazda Android–web maçının uçtan uca doğrulanması.
- Native Google girişi, kalıcı hesap geçişi ve App Links. Bu geliştirme
  paketinde misafir kullanılır; paylaşım web bağlantısını açar.
- Üretim backend etkinleştirmesi, release imzası, AAB ve Google Play gönderimi.

`SLIM-RELEASE.md` ve `SYNCED-RELEASE.md`, 24 Ekim adaylarının tarihsel
notlarıdır; bu sürümün yayın veya test kanıtı olarak kullanılmamalıdır.
