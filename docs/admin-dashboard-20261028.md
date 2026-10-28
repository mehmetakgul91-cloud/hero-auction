# Yönetici paneli, 28 Ekim 2026 geliştirme dalı

Dal: `feature/admin-dashboard-ux-20261028`. Canlı dağıtım, main'e birleştirme, özellik açma veya canlı migration bu çalışmanın parçası olarak yapılmadı. Main otomatik dağıtım yaptığı için birleştirme de kullanıcının yeni onayını gerektirir.

## Rapor ve hesap davranışı

- Bugün, son 7 ve son 30 **Türkiye takvim günü**; zamanlar `Europe/Istanbul`. Haftalık/aylık seçenekler tamamlanmış ISO hafta/ay değil, bugünü içeren 7/30 gündür.
- Günlük satırlar ve dönem boyunca `COUNT(DISTINCT account_id)` ile tekil hesap; bir hesabın farklı günlerde görülmesi dönem toplamına tekrar eklenmez. Kaynakların tamamı ve Android/web sayıları hesaplanır. Sayfa/sekme açılışı gözlenir; yenileme ayrı oturumdur, kimlik doğrulama sayısı veya tekil insan sayısı değildir. Bu rapor süreyi günlere bölerek tahmin etmez.
- Kayıt olmayan günler `—`: ölçüm öncesi geçmiş, eksik toplama ve gerçekten sıfır ziyaret ayırt edilemez. Geçmiş veri üretilmez. Tarih-saat, oyuncu, kaynak, cihaz, yaklaşık ülke/şehir listelenir. Eski kayıtta konum bilinmiyor kalır.
- Oyuncu araması ve durum/son görülme filtreleri, ilk 200 hesabın tarayıcıda süzülmesi yerine veritabanında tüm hesaplar üzerinde çalışır. 50 satırlık sayfalama; `%` ve `_` düz metindir. Kendi yönetici hesabını askıya alma düğmesi kapalıdır ve sunucu da reddeder.
- Altın ekleme mevcut gerekçeli/idempotent makbuz akışını kullanır. Altın ayarlamada ekranın gördüğü `expectedGold` satır kilidi altında karşılaştırılır; arada oyun bakiyesi değişmişse 409 ile durur. Eski API istemcileriyle uyum için bu alanı göndermeyen eski çağrıların davranışı korunur. Hiçbir gerçek bakiye geliştirme/test amacıyla değiştirilmedi.
- Mobilde hesaplar ve girişler kart biçiminde; 44px kontroller, görünür klavye odağı, sayfa taşması olmadan yatay günlük tablo, masaüstünde tablo düzeni. Girişleri gör düğmesi seçili hesabın raporunu açar.

## Yaklaşık konum sınırı

`HERO_PLAYER_GEO_ENABLED=1` ayrı opt-in; varsayılan kapalı. `HERO_GEOIP_DATABASE` mutlak yoldaki lisansına uygun, güncel yerel City MMDB dosyası olmalı. Dosya yok, yanlış, okunamıyor, 90 günden eski veya gelecekteyse konum bilinmiyor kalır; oyun/giriş engellenmez. Dosya güncellemesi ve sunucunun yeniden başlatılması yayıncı işletim adımıdır. MMDB bu depoda veya uygulama paketinde dağıtılmaz; herhangi bir MaxMind anahtarı istenmedi/kaydedilmedi.

IP yalnız anlık sunucu belleğinde sorgulanır. Dış IP servisi, GPS, konum izni, koordinat, posta kodu, ham IP/UA/referrer saklama yoktur. Çıktı yalnız iki harfli ülke ve en fazla 100 karakter şehirden oluşur. Konum giriş yetkilendirmesi için kullanılmaz ve gerçek ikamet kanıtı değildir. Cihaz/kaynak istemci bildirimi olabilir; doğrulanmış CrazyGames kaynağı sunucu kimliğinden gelir.

Proxy arkasında `HERO_TRUSTED_PROXY_CIDRS`, gerçek ters proxylerin açık ve dar CIDR listesiyle yapılandırılmalıdır. Değer varsayılan boştur; HTTP gövdesinden veya `cf-*`/`x-real-ip` gibi başlıklardan konum alınmaz. X-Forwarded-For yalnız soketin karşı ucuna güveniliyorsa sağdan sola yürünür ve ilk güvenilmeyen adreste durur. IPv4-mapped IPv6 normalize edilir; özel/yerel/rezerve adresler sorgulanmaz. Tüm internete güvenen CIDR, geçersiz ayar ve aşırı uzun zincir reddedilir. Gerçek proxy zinciri ve doğrudan origin erişimi onaylı dağıtımda doğrulanmadan tahmini şehir doğruluğu iddia edilmemelidir.

## Veri koruma ve dağıtım

`migrations/008-player-session-locations.sql` yalnız yeni konum tablosu ve rapor sıralama indeksi ekler. Hesap, altın, oyun, makbuz ve mevcut oturumlar güncellenmez/silinmez. Yeni tablo oturuma dış anahtarla bağlıdır; mevcut 30 günlük temizleme konumu da siler. 006/007 migration dosyaları ve onay hash'leri aynıdır. Eski yayın operatörü **008'i uygulamaz**. Uygulama hiçbir migrationı otomatik çalıştırmaz. 008 olmadan raporlar konumsuz çalışır; eksik konum tablosu oturum kaydını bozmaz.

Canlı öncesi ayrı onay sonrasında: hedef servis/veritabanı ve yedek doğrulanır; 008 SQL transaction olarak uygulanır; yerel lisanslı/güncel City MMDB yerleştirilir; proxy zinciri doğrulanır; ancak sonra yeni geo bayrağı açılır. Mevcut ekonomi ayarları korunur. Yaklaşık konum kapatılarak toplama durdurulabilir; tablo DROP veya bakiye geri yazımı yapılmaz. Bu dal uygulama değişikliği ve migration hazırlığıdır; canlıya uygulanmış olduğu anlamına gelmez.

## CSV

Günlük özet CSV ve filtrelenmiş tüm girişler CSV ayrı düğmelerdir. UTF-8 BOM, noktalı virgül, CRLF, tırnak kaçışı ve formül başlangıçlarının (başında boşluk/kontrol karakteri olsa da) metne çevrilmesi test edilir. Giriş CSV'si geçerli sayfayla sınırlanmaz; tek salt okunur, tekrar okunabilir veritabanı snapshot'ından gelir. 10.000 satır üstünde eksik dosya üretmek yerine filtre daraltma hatası verir. Liste/sayfalama için raporun başlangıç anı korunur; bir saatten eski snapshot yeniden yüklenir. Oturum değişimi veya geç gelen yanıt eski yönetici verisini tekrar göstermez. Export dış kişiye mesaj göndermez; dosya yöneticinin tarayıcısına iner.

## Web / Android

Android kaynak dalı `dev/android-main-sync-20261028` (inceleme commit'i `70928c3`) ayrı tutuldu. O dalın mevcut HTTPS allowlist CORS adaptörü buraya alındı; varsayılan `NATIVE_ALLOWED_ORIGINS` boş olduğundan web davranışı değişmez. Android için açıkça `https://localhost` gibi tam origin onaylı ortamda etkinleştirilir; wildcard, cookie veya kimlik doğrulama atlaması yoktur. Yönetici API'lerine native CORS verilmez; yönetici paneli telefon tarayıcısından kullanılır.

Android çalışma zamanı `/api/*` adreslerini yapılandırılan sunucuya yönlendirir; mevcut token/gövde sözleşmeleri korunur. Pause/resume, pagehide/pageshow üzerinden oturum bitirme/başlatmayı tetikler. Android tarayıcı ve WebView aynı kaba `android` sınıfındadır; yerel kurulum kanıtı iddiası yoktur. Yeni admin dosyaları mevcut Android paketleme dışlama kuralına uyar. Gerçek telefonda APK kurulumu, yeni APK yayını veya Play Store gönderimi yapılmadı.

## Tekrarlanabilir doğrulama

- Node `26.12.1`, `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run audit:strict`.
- `npm run test:admin`; proxy sahteciliği/IPv6, yerel veri yokluğu, CSV, owner sınırı, stale balance ve UI testleri.
- `HERO_ADMIN_REPORTS_TEST_DB=postgresql://test:test@127.0.0.1:55432/hero_admin_reports_test node tools/test-postgres-admin-reports.mjs` yalnız izole PG18 fixture kabul eder. Üretim DATABASE_URL/PG değişkenleri reddedilir. CI matrisi bu grubu ve önceki gerçek PostgreSQL ekonomi, makbuz ve release testlerini çalıştırır.
- Yerel SQL doğrulaması ayrıca PGlite 0.5.13 / PostgreSQL 18.6 ile çalıştırıldı; native PostgreSQL yarış testlerinin yerine geçmez. Fixture hesapları ve oyun kaydı migration/rapor/retention öncesi-sonrası birebir karşılaştırılır.
- `npm run test:admin-browser` için ayrı kurulu Playwright gerekir; gerekirse `HERO_BROWSER_TEST_RUNTIME` modül yolunu kullanın. Script yalnız loopback sentetik veri kullanır, dış ağı bloke eder. 1440/390/320px, CSV indirme, Unicode/XSS metni, kendi hesabını koruma, filtre ve logout/yanıt yarışı test edilir. İsteğe bağlı ekran görüntüleri `HERO_BROWSER_SCREENSHOTS` dizinine yazılır.

Yerel sonuçlar: Node 26.12.1 tam paket **2.485/2.485**, strict aktif havuz **50/50**, yeni PostgreSQL 18.6 rapor/veri-koruma fixture'ı başarılı. Chromium 134'te 1440/390/320px ve CSV akışı başarılı. Android kaynak dalının **25/25** testi ve güncel public dosyalarıyla web-varlık paketlemesi başarılı; gerçek cihaz testi değildir. PR'nin tam commit'i için GitHub Actions sonuçları ayrıca kontrol edilir.

## 29 Ekim: sade panel ve şikâyetten maç inceleme

Kullanıcının ek isteğiyle panel tek uzun sayfa yerine altı ayrı bölüme ayrıldı: Oyuncular, Giriş raporları, Maç kayıtları, İşlem geçmişi, Şikâyetler, Maç bakımı. İlk ekran oyuncu aramasıdır; altın ekleme doğrudan, diğer hesap işlemleri açılır bölümden yapılır. Bakiye formu yalnız hedef seçilince görünür. Filtre temizleme, klavyeyle erişim, odak taşıma, mobil kartlar ve oturum kapanınca tüm bölümlerin temizlenmesi doğrulandı. Bakım ve hesap işlemlerinin mevcut onay/koruma kuralları korundu.

Maç incelemesi mevcut `matchRecords` sonuç özetlerini ve varsa aynı maçın oda ayrıntısını **salt okunur** gösterir. Mevcut en fazla 2.000 sonuç sınırı değişmez; oda kodu tek başına eşleştirilmez, maç numarası ve oluşturulma zamanı birlikte kontrol edilir. Rövanş/oda yeniden kullanımı eski maça başka oyuncunun sohbetini bağlayamaz. Oda hâlâ saklanıyorsa yalnız o maçın başlangıcından sonraki en fazla 60 sohbet mesajı ve son 30 açık artırma olayı görünür. Oda sona erip temizlenince veya rövanşa geçince eski ayrıntı mevcut olmayabilir. Bu bir tam savaş tekrarı/video arşivi değildir.

Şikâyet düğmesi ilgili maç sonucunu ve şikâyet anındaki mevcut kanıt snapshot'ını açar. Önceki şikâyetler oda kodu + oluşturulma zamanı + iki tarafla eşleşir; yeni şikâyetlerde sunucu ayrıca tam maç kimliği ekler. Şikâyet kanıtının mevcut 30 günlük saklama sınırı korunur. Arkadaş şikâyetleri maçmış gibi gösterilmez. Yöneticiye dönen oda projection'ı açık alan listesi kullanır: oyuncu tokenları, savaşın ham dahili durumu ve diğer gizli alanlar gönderilmez. Sonuç, puan, altın veya oyun verisi değiştirilmez; yeni maç arşivi tablosu veya geriye dönük kayıt üretilmez.

Güncel yerel doğrulama: **2.489/2.489** test ve strict **50/50**; Chromium 1440/390/320px, tek bölüm gezinmesi, altın formu, filtre sıfırlama, CSV, şikâyet → maç kanıtı ve geç yanıt/oturum kapanması geçti. GitHub Actions son yayın commit'i için ayrıca doğrulanır.

Kullanıcının canlı yayın onayı alındı. 29 Ekim ön kontrolünde servis `srv-db72kiaj9qps73b0b5tg` doğru workspace'te, PostgreSQL 18.6 ve mevcut analytics/credits bayrakları açık doğrulandı. Geo dosyası ve güvenilir proxy yapılandırması yok: konum etkinleştirilmedi. UI ek isteği sırasında merge/deploy/008 yapılmadı; maç girişleri açık bırakıldı. Güncel yedek, maç kuyruğu, kesin commit ve son yayın sonucu işlemler tamamlandığında PR kaydında raporlanır.


## 29 Ekim 2026: yaklaşık konum kurulumu

Ülke/şehir, `HERO_PLAYER_GEO_ENABLED=1`, `HERO_GEOIP_PROVIDER=dbip-lite`,
`HERO_GEOIP_DATABASE=/opt/render/project/src/.geoip/dbip-city-lite.mmdb` ve
`HERO_GEOIP_PROXY_MODE=render-cloudflare` ile bu Render web servisinde etkinleştirilir.
Genel barındırmada eski açık CIDR modu geçerlidir. Render modu ayrıca belgelenmiş
`RENDER=true` ve `RENDER_SERVICE_TYPE=web`, özel ağ soketi, geçerli CF-Ray ve tek
bir genel CF-Connecting-IP gerektirir. Sahte X-Forwarded-For, ülke/şehir başlıkları,
özel IP ve Cloudflare Worker ortak adresi konum kaynağı yapılmaz.
Render'ın public edge tarafından üzerine yazılan başlık sözleşmesi:
https://render.com/articles/host-pocketbase-on-render

DB-IP City Lite, CC BY 4.0 ile yerel kullanılır; yönetici raporunda ve gizlilik
sayfasında sağlayıcı atfı vardır. Yalnız sabit HTTPS sağlayıcısından güncel aylık
veritabanı indirilir. İndirmede oyuncu IP'si veya hesap verisi gönderilmez.
https://db-ip.com/db/download/ip-to-city-lite

Başlangıçta ve her 24 saatte güncel ay denetlenir; güncel dosya yeniden indirilmez.
Aynı servis örneği yeni aya geçtiğinde de güncellenir. Sıkıştırılmış/açılmış boyut
sınırı ve 60 saniye süre sınırı vardır. Yeni dosya tür/tarih denetiminden sonra
atomik taşınır; başarısız indirmede geçerli eski dosya korunur. 90 günü aşan dosya
sorgulanmaz, eksik konum oyunu/girişi engellemez. Dosya public dizine veya Git'e
konmaz; yeniden dağıtımda güvenle yeniden oluşturulur.

Yönetici → Giriş raporları → Yaklaşık konum kontrolü → Bu bağlantıda konumu test et,
yalnız o bağlantının yaklaşık ülke/şehrini ve veri tarihini gösterir. Aynı sahip
kimlik doğrulaması kullanılır, ham IP dönmez ve yeni oyuncu/oturum kaydı yazmaz.
Geçmiş konumsuz oturumlar uydurulmaz; yalnız yeni oturum başlangıcında konum eklenir.
Kapatmak için yalnız HERO_PLAYER_GEO_ENABLED=0 yeterlidir; tablo/veri silinmez.
