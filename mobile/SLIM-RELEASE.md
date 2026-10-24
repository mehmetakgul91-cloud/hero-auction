Android test APK'sinin indirme boyutu küçültüldü. 50 kahraman, dört komutan, müzik, kompakt ekran düzeni ve mevcut oyun kuralları korunur.

- Kullanılmayan altı eski PNG portresi, kadro dışındaki bir portre ve taslak/deneme sayfaları Android paketinden çıkarılır.
- Kullanılan görseller en fazla 640 piksel uzun kenarla paketlenir. En/boy oranı, şeffaflık, dosya biçimi ve sunucunun görsel adresleri korunur. PNG'lere renk paleti azaltma uygulanmaz. Büyük yakınlaştırmalarda kaynak görsele göre ayrıntı azalabilir.
- Görseller APK içindedir; boyut tasarrufu sonradan internetten görsel indirmeye dayanmaz. Müzik dosyası aynen korunur.
- Derleme, görsel kapsamını ve paket boyutunu otomatik denetler. APK içinde tüm 50 portre ve kaynakla eşleşen müzik doğrulanır.

Paket: `tr.com.heroauction.android.test`, versionCode 3, versionName `0.1.2-slim`; Android 7.0+.

**Kurulum:** Yeni test imzası nedeniyle önceki 0.1.0/0.1.1 üzerine güncelleme kurulamaz. Önce yeni dosyayı indirin; eski test uygulamasını kaldırmak gerekebilir ve bu işlem telefondaki misafir oturumunu silebilir. Önceki indirme sürümleri korunur.

Yalnızca mevcut `https://hero-auction-commander-test.onrender.com` test sunucusuna bağlanır. Misafir girişi ve geçici bellek kullanır; sunucu yeniden başladığında test ilerlemesi kaybolabilir. Komutan yükseltmeleri/ödül ilerlemesi tamamlanmış değildir. Ana web sitesi, canlı hesaplar, üretim veritabanı ve sunucular bu yayınla değiştirilmez.

Bu bir Google Play sürümü değildir. Otomatik derleme ve kaynak testleri gerçek Android cihazında kurulum, tam maç, ekran görünümü veya performans testi yerine geçmez; bu sürüm için cihaz testi yapılmadı. Dosya boyutu ve SHA-256 `apk-verification.json` ve `SHA256SUMS.txt` eklerindedir.
