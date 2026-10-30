# Hero Auction — Android öncelikli 3D arena prototipi

30 Ekim 2026. Başlangıç: `main@7714fe314ab4e923a9a5dea00d7242217d2b7fa0`.
Geliştirme dalı: `feature/arena-3d-prototype-20261030`.

İki eklemli, tam gövdeli model (tank ve menzilli büyücü), mevcut motorun beş kişilik takım sözleşmesini koruyan 5'e5 bir kayıtta kullanılır. Her tarafta iki tank ön safta, üç büyücü arka saftadır. Modeller prototip görselleridir; farklı kahraman kimlikleri aynı rol modelini paylaşır. Tank hedefe yaklaşır, vurur ve geri döner; büyücü yerinde asa hareketi ve mermi kullanır. Hasar/şifa/kalkan etiketleri, can çubukları, ölüm, kamera, duraklatma, hız ve tekrar oynatma bulunur.

## İzolasyon ve hesaplama doğruluğu

- Kaynaklar `prototypes/arena-mobile3d/` altında; `public/`, sunucu, savaş motoru, rol sınıflandırması, komutan kuralları ve mevcut oyun yönlendirmesi değiştirilmedi.
- `tools/generate-mobile3d-replay.mjs` mevcut hazırlık, canlı savaş ve komutan modüllerini çevrimdışı çağırır. Hesap/oda/ödeme oluşturmaz. Destek ve savunma komutanlarının normal yetenekleri mevcut doğrulama ve bekleme süresi kurallarıyla uygulanır.
- `replay.json`, motorun gerçekten ürettiği 66 karelik sabit kayıttır. Kritik vuruş rastgeleliği değiştirilmez; cihazların aynı işi ölçebilmesi için derlemeler aynı kaydı kopyalar. Yeni kayıt istenirse `generateMobileReplay()` ve `compactReplay()` dışa aktarımları kullanılır; `engineSourceCommit` güncellenmelidir.
- Tarayıcı motoru çalıştırmaz; can, kalkan, olay ve sonuç anlık görüntülerini okur. Mevcut `ArenaReplayClock` ve `heroCombatPresentation` dosyaları salt okunur kopyalanır. Darbe zamanı, ilgili kare süresinin %50 noktasıdır.
- `npm run build:arena-mobile3d` sadece `.artifacts/mobile3d/` üretir. Bu dizin git dışında kalır. Herhangi bir canlı dağıtım komutu çalıştırmaz.
- Three.js sürümü **0.186.1** olarak korunur; yeni npm bağımlılığı eklenmez. Tüm tarayıcı varlıkları aynı kaynaktan yüklenir; CDN, analitik, hesap bağlantısı veya API çağrısı yoktur.

## Çalıştırma ve otomatik kontroller

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:arena-mobile3d
python3 tools/test-android-package-size.py
npm run build:arena-mobile3d
```

Yerel dosyayı `file://` ile açmak yerine statik HTTP sunucusu kullanın. Build çıktısı başka bir dizine de verilebilir:

```sh
node tools/build-arena-mobile3d.mjs /absolute/output/directory
```

`arena-mobile3d.yml` ilgili dal/PR değişikliklerinde kontrolleri çalıştırır, statik önizlemeyi ve `build-info.json` dosyasını Actions artifact olarak saklar. Canlı sunucuya dağıtmaz.

10 prototip testi: motor sözleşmesi/komutan etkileri; 15/30/60/120 FPS'de aynı sonuca varma; duraklatma ve büyük kare aralıkları; ön/arka saf ve hareket farkı; tam gövde ve ortak geometriler; yazılım görsel alternatifi; DPR/piksel sınırları; akıcılık ölçüm eşikleri; boyut sınırı; 20 tekrar oynatmada sabit kaynak havuzları ve dispose/observer temizliği.

## Android WebView ölçüm protokolü

Bu repoda Android projesi/SDK veya bağlı fiziksel cihaz bulunmadığından APK derlenmedi; fiziksel WebView sonucu ileri sürülmüyor. Mevcut Android sürümünün ayrı bir **debug** derlemesinde aşağıdaki ölçümleri uygulayın. Üretim APK'sına debug erişimi veya HTTP izni eklemeyin.

1. Aynı cihazda mevcut 2D arena için temel ölçüm alın; cihaz modeli, Android sürümü, System WebView sürümü, ekran çözünürlüğü, pil/şarj durumu ve profil kaydedilsin.
2. Statik çıktıyı debug uygulamasındaki WebView'e kendi geliştirme asset/origin yöntemiyle yükleyin. Three.js import map ve modül desteğini kontrol edin. Harici Google/ChatGPT girişini bu teste bağlamayın.
3. `WEBGL 2` rozeti görünüyorsa Mobil profilinde 30 saniyelik testi çalıştırın. 3 saniyelik ısınma ardından 30 saniye ölçülür. Üç tekrarın JSON raporlarını saklayın; aynı işlemi Dengeli profilinde tekrarlayın.
4. Düşük/orta sınıf en az iki fiziksel Android cihazında dikey ve yatay ekranları deneyin. 5 dakika ısınma sonrası testleri tekrar edin. 390×844 CSS görünümü veya masaüstü Chrome sonucu fiziksel cihazın yerine geçmez.
5. Duraklat/devam, hız, reset, 20 tekrar; ana ekrana git/dön ve kilitle/aç kontrolleri yapın. Arka planda oynatma ve animasyon durur, geri gelince kullanıcı devam eder. Sayfa yön değişimi/sekme kaybı sırasında süren benchmark geçersiz sayılır.
6. Debug WebView'de Chrome DevTools ile JS heap, uzun görevler, GPU/renderer izleri ve bellek eğilimini inceleyin. Uygulama raporundaki geometri/texture sayısı tam GPU bellek ölçümü değildir. WebGL context loss durumunda test geçersizleşmeli ve yeniden yükleme mesajı görünmelidir.
7. Aynı imza, ABI, build tipi ve minify ayarlarıyla temel ve aday APK/AAB üretin. Gerçek dosyaları karşılaştırın:

```sh
python3 tools/compare-android-package.py baseline.apk candidate.apk --max-growth-bytes 1048576 > apk-delta.json
```

Sınır ekip için başlangıç önerisidir; CLI belirtilen sınır aşılırsa hata kodu döndürür. Araç gerçek arşiv boyutu, açılmış entry boyutu, assets sıkıştırılmış/açılmış boyutu ve eklenen/silinen dosyaları raporlar. AAB dosyasının büyümesi Play'in cihaza indirdiği split APK boyutu değildir; kurulu depolama ayrıca ölçülür.

### Ölçüm içeriği ve hedefler

| Alan | Başlangıç hedefi / anlamı |
| --- | --- |
| FPS | En az 45; rAF aralığı üzerinden, sunulan karelere yaklaşık gösterge |
| P95 | En fazla 33,34 ms; medyan ve P99 da raporlanır |
| 33,34 ms üzeri kareler | En fazla %5 |
| Çizim çağrısı | En fazla 180 / kare |
| Üçgen | En fazla 35.000 / kare |
| Kaynaklar | Geometri/texture başlangıç, bitiş ve en yüksek değerleri |
| Uzun görevler | PerformanceObserver desteği varsa sayı ve süre |
| Mobil profil | DPR ≤1, en fazla 900.000 framebuffer pikseli |
| Dengeli profil | DPR ≤1,5, en fazla 1.600.000 framebuffer pikseli |

Bunlar prototip hedefleridir, doğrulanmış cihaz performansı değildir. GPU süresi, sıcaklık, enerji tüketimi ve tam bellek kullanımı uygulama panelinden ölçülmez. JSON cihaz/browser bilgilerini yalnızca kullanıcı indirdiğinde dosyaya yazar; sunucuya göndermez.

WebGL 2 yoksa aynı 3D geometri yazılımla yansıtılır, `YAZILIM` rozeti gösterilir ve GPU benchmark düğmesi kapatılır. Bu modun akıcılığı Android GPU sonucu olarak kullanılamaz.

## Doğrulanmış sonuçlar

- Node **v24.22.1** ortamında mevcut tam test paketi: **2619/2619 geçti**, hata/atlama yok (24,9 sn). Bu çalışmadan sonra yalnızca ek kaynak temizliği testi eklendi; son prototip koşusu **10/10 geçti**. Repodaki Node hedefi **26.12.1** değiştirilmedi; CI bu hedefle çalışacak.
- APK/AAB ölçüm aracının iki sentetik ZIP testi: **2/2 geçti**. Gerçek APK farkı henüz ölçülmedi.
- Tarayıcı görsel kontrolü: savaş sonuca kadar oynadı; duraklat/reset, menzilli model seçimi ve mobil dokunma kontrolleri çalıştı. 390×844 iframe içinde yatay taşma yok (`clientWidth=scrollWidth=375`; tarayıcı scrollbar payı); ana düğmelerin yüksekliği 44 px.
- Bulut tarayıcısı WebGL 2 vermedi. Yazılım görünümü kontrol edildi; gerçek WebGL render yolu, GPU FPS/P95, context-loss geri dönüşü ve fiziksel Android doğrulaması açık kalır.
- 10 kahraman toplam **60 model mesh'i**, **5768 model üçgeni** ve **10 ortak model geometrisi** kullanıyor. Bu sayılar tahta ve efektleri içermez; gerçek kare toplamı cihaz raporundan alınır.
- 12 darbe efekti ve 16 kayan etiketlik sabit havuz; gölge haritası, post-processing veya doku indirmesi yok.

| Paket ölçümü | Sonuç |
| --- | ---: |
| Tüm statik varlıklar, açılmış | 2.315.818 bayt (2,21 MiB) |
| Dosya başına gzip-9 toplamı | 453.583 bayt (443 KiB) |
| Vendor dosyaları hariç gzip toplamı | 26.195 bayt (25,6 KiB) |
| Ek GLB/doku/model indirmesi | 0 bayt |
| Gerçek APK/AAB artışı | Ölçülmedi |

Boyutlar `build-info.json` hariçtir; HTTP aktarımı, ZIP/APK sıkıştırması ve kurulum boyutuyla aynı değildir. Vendor toplamı Three.js module/core, BufferGeometryUtils ve lisansı içerir. Bunları mevcut uygulamayla gerçekten paylaşmadan 25,6 KiB'ı APK artışı olarak kullanmayın.

## Kaynaklar

- [Three.js responsive render boyutları](https://threejs.org/manual/pages/responsive.html)
- [Three.js GPU kaynaklarını temizleme](https://threejs.org/manual/pages/cleanup.html)
- [Android WebView'i Chrome DevTools ile inceleme](https://developer.android.com/develop/ui/views/layout/webapps/debug-chrome-devtools)

![Yazılım görünümünde prototip ekranı](preview-20261030.jpg)
