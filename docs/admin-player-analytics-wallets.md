# Yönetici oturum ölçümleri ve güvenli bakiye ekleme

Durum: 27 Ekim 2026 tarihinde kod yayını, üç ek tablo ve iki yeni özellik bayrağının etkinleştirilmesi kullanıcı tarafından onaylandı; yayın/ön kontrol adımları aşağıdadır. Başlangıç commit'i: `b66184d158c258534de43cef7927265bfdf8ed1e`.

## Panelde ne değişiyor?

- Mevcut hesap listesinde altın, elmas ve büyü tozu; kapalı veya okunamayan birimlerde `—` (doğrulanmış sıfır değildir).
- Son 30 günlük gözlenen oturum sayısı, ek oturumlar, son görülme ve tahmini ön-plan etkin süre.
- Son gözlenen kaynak: Google araması / davet / doğrulanmış CrazyGames / diğer bağlantı / doğrudan veya bilinmeyen. Google ile giriş yapmak Google araması sayılmaz.
- Kaba platform/cihaz sınıfı. “Android tarayıcı” yerel Android uygulaması kanıtı değildir.
- Kullanıcı tercihiyle konum özelliği çıkarıldı: şehir/ülke alanı gösterilmez ve konum toplanmaz. GPS, dış IP sorgusu, yeni gizli anahtar veya konum veritabanı eklenmedi.
- Mevcut **Altın düzenle** kontrolü yeni bayraklardan bağımsız korunur. Yeni **elmas ve büyü tozu ekleme** kontrolleri zorunlu gerekçe, onay ve makbuzlarla yönetici işlem geçmişine katılır.

## Ölçümlerin anlamı ve sınırı

Oturum, giriş yapılmış hesapla açılan sayfa/sekme oturumudur. Yenileme/yeni sekme yeni oturum sayılabilir; “ek oturum” doğrulanmış tekrar kimlik doğrulama, tekil insan veya kesin geri dönüş ziyareti değildir. Misafir kimliği aynı kayıtlı imzalı oturumu kullandığı sürece ilişkilendirilebilir; yeni misafir hesabı önceki kişiyle birleştirilmez.

15 saniyelik görünür/odaklı bildirimler sunucu saatine göre işlenir. Bir aralık en fazla 30 saniye ekler; 45 saniyeyi aşan boşluk eklenmez. Gizlenme/odak kaybı duraklatır; ağ hatası sonrası sıfır-kredi başlangıç noktası kurulur. 24 saatlik oturum sınırı ve hesap başına 30 günlük 1.000 oturum sınırı vardır. Sıra numarası tekrarları/eskimiş olaylar süre veya son görülmeyi ilerletmez. Hesap kilidi ve ortak kredi zaman noktası eşzamanlı sekmelerin çakışan sürelerini iki kez saymaz. İstemci işaretleri yanıltılabilir: sonuç insanın gerçekten oynadığına veya tam maç süresine ilişkin kanıt değildir.

Yeni ölçüm geçmişe dönük üretilmez. Kayıt yoksa sayılar bilinmiyor gösterilir. Tam URL, sorgu, referrer, arama kelimesi, davet kodu, IP, ham kullanıcı aracısı, erişim belirteci ve cihaz parmak izi ölçüm tablolarına kaydedilmez. Yalnız kaba izinli sınıflar ve hesap ilişkisi tutulur; üçüncü taraf analiz servisi yoktur. Yetkili yönetici dışındaki hesaplar panel verisini okuyamaz.

Okumalar son 30 günle sınırlıdır. Başlangıçta ve saatte bir fiziksel temizleme denenir; toplama kapalı olsa da temizleme devam eder. Altyapı günlükleri/yedekler ayrı değerlendirilmelidir. Gizlilik metni bu davranışı koşullu biçimde açıklar. **Etkinleştirmeden önce** yayıncı, hedef kullanıcı kitlesi/ülkeler için bilgilendirme, hukuki dayanak ve gerekiyorsa onay akışını ayrıca değerlendirmelidir; bu teknik taslak hukuki uygunluk onayı değildir.

## Bakiye ekleme güvenliği

- Yetki, doğrulanmış imzalı Google oturumunun sunucudaki tek sahip e-postasıyla eşleşmesine bağlıdır. POST içindeki yönetici/hesap sağlayıcısı beyanı yetki sağlamaz.
- `gold`, `diamonds`, `magicDust`; 1–1.000.000 arası güvenli tam sayı, 3–300 karakter tek satır gerekçe. Toplam bakiye PostgreSQL `INTEGER` sınırını aşamaz.
- Küresel benzersiz istek kimliği aktör + hedef + birim + miktar + gerekçeye bağlanır. Değiştirilmiş yeniden kullanım `409` olur.
- Bakiye hareketi ve kalıcı makbuz/denetim kaydı tek işlemde commit edilir. Cüzdan kilit sırası altın → seçilen ikincil para birimidir; mevcut geliştirme/takas yollarıyla uyumludur.
- Makbuz pozitif hareket defteridir; mevcut negatif geliştirme defterleri değiştirilmez. Makbuzlar otomatik süre aşımına uğratılmaz; silinmeleri eski isteklerin tekrar bakiye eklemesine yol açabilir.
- Mevcut mutlak altın `SET` uç noktası ve panel kontrolü, yeni özellikler açık veya kapalıyken değişmeden çalışır (0–100.000.000). Aynı altın satır kilidiyle yeni işlemlerle seri çalışır. Önceden var olan sınırı korunur: eski ekran değerine göre kesin bakiye ayarlamak arada kazanılmış altını değiştirebilir; bu eski işlem yeni makbuz/tekrar korumasını kullanmaz. Yeni elmas/toz eklemeleri bu sınıra sahip değildir. Sunucunun ortak makbuzlu ekleme yardımcısı altını da destekler; panel gereksiz ek bir altın ADD kontrolü sunmaz.
- Tarayıcı onaydan sonra, göndermeden önce anahtarlı niyeti yerel kaydeder; kimlik doğrulama belirteci saklamaz. Web Locks sekmeleri seri hale getirir; destek yoksa ekleme kapalıdır.
- Belirsiz yanıt/20 saniyelik zaman aşımı yeni anahtar oluşturmaz. Bekleyen kayıt yeni eklemeleri engeller. Önce salt-okunur makbuz kontrolü; gerekirse aynı istekle tekrar. “Makbuz yok” sonucu sürmekte olan commit'in olmadığı kanıtı değildir. Yerel kayıt incelenmeden silinmemelidir.

## Onaylı yayın planı

1. İncelenen değişiklikleri taslak PR olarak yayımlayın; tam PR başlığındaki commit için tüm ilgili GitHub kontrollerini bekleyin. Görsel tarayıcı QA'sı yapılmadıysa bu sınırı raporda koruyun.
2. Render hizmeti `srv-db72kiaj9qps73b0b5tg`, veritabanı `dpg-db88ehmq1p3s739vvodg-a` / `hero_auction_db`, sahip rolü `hero_auction_db_user`, PostgreSQL 18 ve doğru Git commit'i doğrulanır. Güncel yedek/PITR kurtarma kapsamı ve tamamlanmış yeni mantıksal yedek referansı doğrulanmadan DDL uygulanmaz. Dış bağlantı allowlist'i boş kalır; erişim için değiştirilmez. İşlem yalnız yetkili Render Shell içinde açık operatörle yürütülür, bağlantı parolası gösterilmez veya yeni bir yere kaydedilmez.
3. Yeni bayraklar kapalıyken ön kontrol yapılır. `migrations/006-admin-wallet-credits.sql` **bir** makbuz tablosu, `007-player-sessions.sql` **iki** ziyaret tablosu oluşturur: toplam **üç** ek tablo. Sunucu otomatik migration çalıştırmaz. Eski `apply-economy-migrations` ve 001–005 defteri değiştirilmez; yeni dar kapsamlı `tools/admin-analytics-preflight.mjs` / `tools/apply-admin-analytics-migrations.mjs` operatörleri kullanılır. Kısmi/uyumsuz yeni şema reddedilir; mevcut tablolar veya bakiyeler değiştirilmez. Elmas/toz için mevcut ilgili cüzdan şemaları ve bayrakları ayrıca salt okunur doğrulanır.
4. Birleştirmeden hemen önce yönetici panelinde etkin oyun/odaların güvenli boş durumu yeniden doğrulanır; aktif savaşlara veya sonuç kaydına müdahale edilmez. Ayrı onaylı savaş-öncesi iptal aşağıdaki dar akışı kullanır. `main` commit otomatik yayını etkin olduğundan merge bir yayın işlemidir. Tam commit'in Render LIVE olması beklenir. İlk yayın yeni bayraklar kapalıyken yapılır; yayımlanan açık operatörle önce ön kontrol, sonra iki migration tek atomik işlemde uygulanır ve şema yeniden doğrulanır.
5. Yalnız onaylanan `HERO_ADMIN_WALLET_CREDITS_ENABLED=1` ve `HERO_PLAYER_ANALYTICS_ENABLED=1` eklenir. Mevcut elmas/toz, satın alma, takas, kayıt hediyesi, günlük ödül ve reklam bayrakları değiştirilmez. Yapılandırmanın etkin olduğu yeni LIVE yayın ve API kabiliyetleri doğrulanır. Ölçümün gerçekten etkin olduğu zaman kaydedilir; geçmişe dönük veri üretilmez. Canlı gerçek hesaplarla test bakiyesi eklenmez, kullanıcı oyunu açılarak yapay oturum üretilmez.
6. Başlangıç/saatlik 30 günlük temizleme davranışı ve hizmet hataları gözlenir. Eski altın SET kontrolü hem kapalı hem açık bayraklarda korunur. Gizlilik açıklaması kodla birlikte yayımlanır. Hukuki dayanak/onay değerlendirmesi yayıncı sorumluluğundadır; bu teknik kontrol hukuki uygunluk görüşü değildir.

Geri alma: iki yeni bayrağı kapatıp yalnız ilgili yapılandırma yayınını uygulamak yeni toplama/eklemeleri durdurur; makbuz sorgulama ve süre dolmuş ziyaretlerin temizlenmesi devam eder. Gerekirse önceki uygulama commit'ine dönülür, ancak üç ek tablo **korunur**. İdempotency makbuzlarını veya cüzdan kayıtlarını silmek geri alma değildir; şema DROP/geriye dönük bakiye güncellemesi yapılmaz. Eski uygulamaya dönüş fiziksel oturum temizliğini durdurursa saklama süresi için ayrıca kontrollü temizlik planlanır. Yedekten tüm veritabanını geri yüklemek canlı yeni oyun verilerini kaybettirebilir; otomatik geri alma yöntemi değildir ve ayrı olay değerlendirmesi gerektirir.

## Savaş başlamamış kayıt için dar yayın istisnası

Kullanıcının ayrıca onayladığı iptal isteği için mevcut yönetici iptal akışı, eski sabit üç seçimden **açıkça seçilmiş 1–3 uygun maç** aralığına genişletilir. Bu bir aktif savaş durdurma veya sonuç düzeltme aracı değildir: `battleSync.result` (başlangıç işareti dahil), canlı savaş kaydı, hazırlanmakta/işlenmekte olan maç, ödül/sandık/iade veya değişmiş snapshot olan kayıtlar yine reddedilir. `winner:null` canlı savaşın başlangıcında bulunabilir ve beraberlik anlamına gelmez.

Eski üçlü makbuz anahtarları korunur. Her seçili kayıt ve her ücretli koltuk doğrulanır; yalnız mevcut cüzdanlara koltuk başına 50 altın, oda kapanışı, denetim ve makbuzla aynı işlemin içinde bir kez iade edilir. Yeni kazanan, lig sonucu veya sandık oluşturulmaz, geçmiş silinmez. Sıfır veya üçten fazla seçim reddedilir; önizleme hiçbir kaydı kendiliğinden seçmez veya iptal etmez.

Başlatma istisnası yalnız şu koşullarda kullanılabilir: kalıcı yeni-giriş duraklatması doğrulanmış; gerçek canlı savaş normal biçimde bitmiş; diğer tüm bekleyen işlem sayaçları sıfır; kalan kayıtların tamamı standart salt-okunur önizlemede doğrulanmış savaş-öncesi adaylar. Bu durumda küçük iptal düzeltmesini yayımlamak için aday sayacının sıfır olması beklenmez; yeniden başlangıç bu kalıcı kayıtları korur. Yayından sonra yeni sunucu kimliği/sürümüyle yeniden önizleme ve tam seçili kayıtlar için kullanıcı onaylı iptal uygulanır. Sonuç belirsizse yeni seçim yapılmaz, aynı makbuz doğrulanır. Sonunda bakım girişleri yeniden açılır; hata durumunda bakım açık bırakılmadan durum ve kurtarma gereksinimi açıkça raporlanır.

## Operatör komutları (yalnız onaylı Render Shell)

Aşağıdaki değişkenler gizli değildir: `RELEASE_COMMIT`, Render'da doğrulanan tam 40 karakterli yayın commit'i; `BACKUP_REFERENCE`, arayüzde gerçekten tamamlandığı doğrulanan güncel yedeğin referansıdır. Operatör yedeği kendisi oluşturmaz veya doğrulanmış saymaz. Parola/bağlantı adresi komuta yapıştırılmaz; mevcut sunucu `DATABASE_URL`'i yalnız dahili hedef kontrolünden sonra kullanılır.

```sh
node tools/admin-analytics-preflight.mjs \
  --expect-service srv-db72kiaj9qps73b0b5tg \
  --expect-database hero_auction_db --expect-owner hero_auction_db_user \
  --expect-major 18 --expect-commit "$RELEASE_COMMIT" --expect-state absent

node tools/apply-admin-analytics-migrations.mjs \
  --expect-service srv-db72kiaj9qps73b0b5tg \
  --expect-database hero_auction_db --expect-owner hero_auction_db_user \
  --expect-major 18 --expect-commit "$RELEASE_COMMIT" --expect-state absent \
  --manifest-sha256 7b58eed118ef7a84d1afc8d4384b056c3257e7abf40eb8e46a33b492c2943669 \
  --schema-sha256 c5b8a36e86ff992e2bb10413acf8c25945985585f22bab1e637a37a2021bcfac \
  --backup-reference "$BACKUP_REFERENCE" \
  --confirm APPLY_HERO_ADMIN_ANALYTICS_006_007_THREE_TABLES

node tools/admin-analytics-preflight.mjs \
  --expect-service srv-db72kiaj9qps73b0b5tg \
  --expect-database hero_auction_db --expect-owner hero_auction_db_user \
  --expect-major 18 --expect-commit "$RELEASE_COMMIT" --expect-state complete
```

Her üç komut da iki yeni bayrak kapalıyken çalışır. Çıktı ve zamanları yayın raporunda saklayın; dördüncü bir migration defteri oluşturulmaz. Başarısız/belirsiz COMMIT yanıtından sonra önce `--expect-state complete` salt-okunur kontrolü yapın. Tam ve birebir şema güvenli yeniden çağrıda kabul edilir; kısmi veya uyumsuz şema reddedilir. Bakiyelerin korunduğu kanıt aynı işlemin tekrar-okunabilir snapshot'ını kapsar; eşzamanlı gerçek oyun etkinliğinin tüm dünyada durduğu iddiası değildir. Şema hash'i PostgreSQL 18 kataloğunun normalize edilmiş semantiğine bağlıdır; uyuşmazlıkta komutu gevşetmeyin, inceleyin.

## Testler

Node `26.12.1`, kilitli bağımlılıklar; mevcut tam test komutu:

```sh
node --test *.test.js tests/*.test.* test/*.test.js
node tools/audit-cards.mjs --strict
```

Yeni odaklı testler: `admin-wallet-credits`, `admin-wallet-credits-ui`, `admin-player-analytics-http`, `player-session-client`, `player-sessions`. Mevcut web daveti fixture'ı yeni varsayılan-kapalı bağımlılığı da çalıştırır.

Gerçek PostgreSQL araçları yalnız kendi tam eşleşen `HERO_*_TEST_DB` loopback fixture hedeflerini kabul eder; üretim `DATABASE_URL` devralmaz. Bakiye/defter yarışları, aynı anahtarın eşzamanlı tekrarları, SQL kısıtları, rollback, kayıp COMMIT yanıtı; oturum görünürlük/sekme birleştirme/sıra/30 gün temizleme test edilir. Bunlar üretim provası veya canlı kullanıcı testi değildir.

Görsel tarayıcı doğrulaması yapılmadı: önceki yerel Chromium/file/data/localhost/rehost/CDP yaklaşımı reddedilmişti ve yeniden denenmedi. Fake-DOM ve gerçek HTTP testleri bu görsel QA eksikliğinin yerine geçmez.

Yerel son doğrulama (27 Ekim 2026): Node 26.12.1 tam paket **2.325/2.325**, strict havuz **50/50**, PostgreSQL 18.4 kredi aracı **11 grup**, gerçek HTTP + PostgreSQL aracı **9 grup** ve oturum SQL/lifecycle/retention aracı geçti. Yeni dar yayın operatörü için **35 birim testi** ile normal/kayıp-COMMIT senaryolarında **20 gerçek PostgreSQL test grubu** ayrıca geçti. Dar iptal genişletmesi için **64 odaklı test** ve **9 gerçek PostgreSQL iptal grubu** geçti. Yeni CI tanımı gerçek PostgreSQL matrisi ve yayın operatörü doğrulaması içerir. Yerel sonuçlar uzaktaki tam commit kontrollerinin yerine geçmez; yayın kanıtı ayrıca kaydedilir. Sonuçlar yalnız sentetik yerel fixture hesaplarına aittir.
