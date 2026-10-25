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

## Kalkan hasarı

Kalkan, mevcut savunma/hasar hesaplamasından sonraki her vuruşun en fazla %70’ini emer: `min(mevcut kalkan, floor(hasar × 7 / 10))`. Kalan hasar candan düşer; can kaybı kalan canla sınırlıdır. Örneğin 50 kalkan + 50 hasar → 35 emilim, 15 can kaybı, 15 kalan kalkan; 20 kalkan + 50 hasar → 20 emilim, 30 can kaybı. Tam sayı emilim aşağı yuvarlanır (1 hasarda 0, 2 hasarda 1, 90 hasarda 63).

Kalkan kazanımı/yenilenmesi ve birikimi değişmez; yeni bir başlangıç veya toplam kalkan tavanı yoktur. Komutan, normal/özel ve alan saldırıları aynı hesabı kullanır. Zırh delme, infaz, can çalma ve dikenlerin mevcut özel kuralları korunur. Tamamlanmış savaşların kayıtlı hasar/kalkan görüntüleri yeniden hesaplanmaz; aynı tohumla yeni simülasyon yeni kuralı uygular.

## Arena hazırlığı

Açık artırmada edinilen beş kahraman, kendi ön/arka saf tercihine (kahramanın kayıtlı saf bonuslarına) göre tahtaya otomatik yerleşir. Oyuncu yalnızca **Ön saf / Arka saf** değişikliği yapar; boş yuva seçme, sürükleme veya kahramanları yeniden sıralama gerekmez. Saf değişikliği kahramanların edinilme/savaş sırasını değiştirmez. Mevcut kurallarda iki safın her biri sıfır ile beş kahraman içerebilir.

Saf tercihleri maç ve oyuncuya özel taslak olarak sunucuda saklanır; yenilemede korunur, rövanşta yeni kadro için yeniden oluşturulur. Henüz sunucuya ulaşmayan değişiklik aynı sekmede maç/kadro anahtarıyla saklanır ve yeniden gönderilir. Web ve CrazyGames tarayıcı kayıtları ayrıdır; hesapta kayıtlı komutan/diziliş verilerine toplu dönüşüm uygulanmaz.

Otomatik yerleşim **Hazırım** sayılmaz. Mevcut 60 saniyelik hazırlık süresi veya oyuncunun Hazırım düğmesi dizilişi onaylar; savaş için her iki tarafın da hazır olması gerekir. Sunucu beş farklı kahramanı, değiştirilemeyen gerçek rollerini ve saf değerlerini doğrular. Onaylanmış diziliş ve eski maça ait istekler değişiklik kabul etmez.

## Komutan seçimi ve değişimi

İlk komutan seçimi ücretsizdir. Daha sonra farklı bir komutana geçiş 1000 altındır; gelişim seviyeleri korunur. Ücret sunucuda bakiye kontrolüyle birlikte tek işlemde kesilir. Aynı komutanı yeniden seçme isteği ücret kesmeden reddedilir. Komutan değiştirme ücreti bu güncellemede de 1000 altındır; gelişim fiyatları için aşağıdaki güncel ekonomi bölümüne bak.

## Güncel gelişim ve elmas hazırlığı (25 Ekim 2026)

Komutan ekranında dört bağımsız gelişim dalı seçilir; sıkıştırılmış bağlantılı
seviye yolu mevcut ve sıradaki seviyeyi gösterir. Dal seçimi harcama yapmaz.
Ana dal 40, yan dal 20 etkin seviyedir; komutan değişince fazladan kayıtlı
seviyeler silinmez, saklı olarak gösterilir. Sonraki gerçek sınıf/beceri/dolum
etkileri ve sunucunun ücreti birlikte görünür.

- Altın: hedef seviye `L` için `ceil(200 × 1,2^(L−1))`; ilk fiyatlar 200, 240,
  288, 346. Yuvarlama her adımda ilk tabandan yapılır. Bu kod yayımlandığında
  yeni altın eğrisi uygulanır; bunun ayrı bir etkinleştirme bayrağı yoktur.
- Elmas etkinse 20→21 için ek 10 elmas; sonraki hedeflerde ilk tabandan ×1,2,
  yukarı yuvarlama. Eski seviyelere borç, sıfırlama veya geriye dönük ücret yoktur.
- Elmas → altın: 1 elmas = 500 altın; ayrı, kapalı açılır bölümde miktar ve
  kesin çıktı gösterilip onay istenir. Altın → elmas veya gerçek ödeme yoktur.
- Karşılama istisnası yalnız etkinleştirmeden sonra gerçekten yeni, doğrulanmış
  Google hesabına bir kez 10 elmastır. Misafir, CrazyGames ve eski hesaplar almaz.

| Yerel varsayılan / seçenek | 21+ geliştirme | Karşılama | Elmas → altın |
| --- | --- | --- | --- |
| Tüm bayraklar kapalı (varsayılan) | Yalnız altın | Kapalı | Kapalı |
| `HERO_DIAMONDS_ENABLED=1` | Altın + elmas | Ayrı bayrak gerektirir | Ayrı bayrak gerektirir |
| Üç bayrak da açık | Altın + elmas | Yeni Google üyeye 10 | 1 → 500 |

Diğer iki bayrak `HERO_DIAMOND_SIGNUP_BONUS_ENABLED` ve
`HERO_DIAMOND_EXCHANGE_ENABLED` değerleridir. Satın alma sağlayıcısı/paketleri
henüz yoktur; **hiçbir kombinasyon gerçek elmas satın almayı açmaz**. Bu yüzden
premiumu satış olmadan açmak 21+ gelişimi eldeki/uygun karşılama elmasıyla sınırlar.

Bu çalışma yereldir; yayın, üretim bayrağı veya veri değişikliği yapılmadı.
`migrations/001…003` taslakları uygulanmadı. Atomiklik/yeniden deneme testleri
izole SQL modelleri kullanır, gerçek PostgreSQL kanıtı değildir; bu ortamda
`psql`, `postgres`, `initdb`, `pg_ctl` ve Docker bulunmadı. Yayın/şema/etkinleştirme
öncesi izole gerçek PostgreSQL doğrulaması ayrıca gereklidir.

Ayrıntılar: [gelişim görünümü](docs/commander-profile-refresh.md),
[elmas ve fiyatlar](docs/paid-diamonds-foundation.md),
[dönüşüm](docs/diamond-exchange.md),
[Google karşılama](docs/diamond-signup-bonus.md).

## Açık artırma kart havuzu

Her maçta aktif havuzdan 10 farklı kahraman rastgele seçilir; efsanevi, nadir veya diğer nadirlikler için sabit adet kotası yoktur. Aynı kahraman aynı açık artırmada tekrar etmez. Son kartların eksik takıma verilmesi, mevcut otomatik ücret/eksi kredi kuralları ve kalan kredi güç bonusu değişmemiştir.

## Bilgisayar antrenmanı

Bot da oyuncuyla aynı canlı savaş motorunu, enerji maliyetlerini ve bekleme sürelerini kullanır. Her yeni maç/rövanşta bir önceki komutandan farklı, geçici bir komutan alır. Komutanın ana uzmanlığı ve dört gelişim dalı kolayda 5, ortada 10, zorda 15 seviyedir; mevcut 40/20 dal sınırları ve normal beceri/enerji kuralları geçerlidir. Kahramanları yalnızca normal açık artırmadan edinir. Oyuncunun kayıtlı komutanı ve gelişimi değişmez. Eski, komutan seçilmemiş hesaplarda yalnızca o antrenman için sıfır seviyeli saldırı komutanı kullanılır.

- **Kolay:** düşük teklif bütçesi, basit diziliş ve daha seyrek normal beceriler.
- **Orta:** kredi rezervi ve kart değeri, role uygun ön saf ve düzenli beceri kullanımı.
- **Zor:** takım eksiklerine göre alışveriş, dayanıklı ön saf, duruma göre enerji biriktirme, iyileştirme/kalkan zamanlama ve büyücü hedef seçimi.

Geçici komutanın sınıf bonusu kolay/orta/zor için %2,5 / %5 / %7,5, beceri güç artışı %5 / %10 / %15 ve tur enerjisi 14 / 17 / 19 olur. Dallar bağımsız altın geliştirmeleridir; ortak yetenek puanı havuzu yoktur. Bot için altın harcanmaz veya hesap kaydı yazılmaz; ek güç/enerji çarpanı uygulanmaz. Henüz açılmamış kartlar ve rakibin gizli enerjisi karar girdisi değildir. Zor botun kazanması garanti değildir. Antrenman giriş ücreti, altın ödülü ve lig puanı değişimi yoktur.

## Arkadaşlar ve çevrimiçi durum

Lobideki **Arkadaşlar** sekmesinden kendi `HA-…` oyuncu kimliğini kopyalayabilir, tam kimlik ile arkadaşlık isteği gönderebilirsin. Gerçek rakibi açık artırma, diziliş, arena veya sonuç ekranından da ekleyebilirsin; bilgisayar rakipleri eklenemez. Gelen istek kabul edilmeden çevrimiçi durum paylaşılmaz. İstek reddedilebilir/iptal edilebilir ve arkadaşlık iki taraftan da kaldırılabilir.

- Oyuncu kimlikleri rastgele üretilir; giriş anahtarı, e-posta veya sağlayıcı hesap kimliği değildir. Kimlikler ve arkadaşlıklar mevcut PostgreSQL sosyal kaydında saklanır. Veritabanısız geliştirme modunda sunucu yeniden başlatılınca silinir.
- Mevcut misafir oturumu korunurken arkadaşlık kullanılabilir. Misafir çıkışı veya oturum süresi dolması sonrasında aynı misafir kimliğine geri dönüş garantisi yoktur; kalıcı hesapla giriş önerilir.
- Çevrimiçi durumu ayrı sekme oturumlarıyla doğrulanır, 45 saniye yenilenmezse kapanır; çıkış/sayfa kapanışında bildirim gönderilir. Ağ veya tarayıcı kapanışında durum kısa süre gecikebilir. Tam son görülme zamanı paylaşılmaz, presence verisi kalıcı kayda yazılmaz.
- Eski tek taraflı arkadaş kayıtları isteğe, karşılıklı eski kayıtlar kabul edilmiş arkadaşlığa dönüştürülür. Yeni istekler için hız ve liste sınırları uygulanır.

### Maç davetleri

**Arkadaşlar → Çevrimiçi arkadaş → Davet et** ile seçtiğin arkadaşına özel oda daveti gönderebilirsin. Ücret açıklamasından sonra onay verdiğinde boş özel odan kullanılır; odan yoksa ücretsiz oluşturulur. Aktif maçından otomatik çıkılmaz. **Rakip bul → Davet et** seçeneği de korunur. Davet 30 dakika geçerlidir; gönderen oyuncu yanıtı takip edebilir veya daveti iptal edebilir. Davet edilen oyuncu başka maçtayken de **Geleceğim / Gelmeyeceğim** yanıtını verebilir. “Geleceğim” yanıtı 50 altın giriş ücretine açık onaydır; mevcut maçın sunucudaki nihai sonucu kesinleşmeden yeni odaya geçilmez. Açık artırmanın bitmesi tek başına maçın bitmesi sayılmaz.

Odaya katılınca veya açık artırma başlayınca eski davet geçmişi oyun üstünden kaldırılır. Bekleyen davetler ve yeni katılım sorunları küçük, kapalı bir davet özeti üzerinden açılabilir; otomatik olarak oyunun üstüne genişlemez. Davet kayıtları ve sıraya alınmış kabul yanıtları silinmez.

Kabul edilmiş davet iptal edilebilir. Oda dolmuş/kapanmışsa, davet sona ermişse veya giriş ücreti karşılanamıyorsa otomatik katılım yapılmaz ve hata gösterilir. Davetin açılması veya yanıt beklemesi ücret kesmez. İki oyuncunun normal giriş ücreti ancak gerçek oda katılımında, kalıcı oda/davet kaydıyla birlikte uygulanır. Testler yalnızca yalıtılmış hesaplar ve geliştirme bakiyeleri kullanır.

Sosyal oda koordinasyonu mevcut tek sunucu süreci modeliyle çalışır; çoklu uygulama örneğine ölçekleme için dağıtık oda kilidi ayrıca gerekir. Kalıcılık testleri anlık görüntü geri yükleme ve sahte SQL işlem/hata enjeksiyonu içerir; üretim PostgreSQL üzerinde yeniden başlatma testi yerine geçmez.

## Arena müzikleri

Arena için altı ayrı parça seçilir: orkestra, Japon esintili retro, Orta Doğu fantastik, Afrika esintili marimba, İskandinav/Viking epik ve AI üretimi Kazak/Orta Asya esintili müzik. Latin parça dahil değildir. Her tarayıcı sekmesinde altı parçalık rastgele sıra tamamlanmadan parça tekrarlanmaz; sıra sınırında da son parça hemen tekrar etmez. Gerçek maç anahtarı değişmeden yenileme, sesi kapat/aç veya arka plandan dönme parça seçimini değiştirmez. Web ve CrazyGames kayıtları ayrıdır.

Tek bir `HTMLAudioElement` yalnız seçilen parçayı yükler. Hazırlıkta kullanıcı dokunuşuyla sessizce açılır; maç başladığında mevcut %60 ses düzeyi kullanılır. Sekme gizlenince/platform sesi kapatınca durur, maç bitiminde kaynak bırakılır. Otomatik oynatma engeli aynı parçayı bir sonraki dokunuşta yeniden dener. Gerçek yükleme hatasında yalnız bir kez eski davul-bas parçasına, o da başarısızsa prosedürel sese döner. İndirme takılması başına 15 saniyelik sınırlı zaman aşımı vardır; bütün liste arka planda yüklenmez.

`/music-credits.html` eser sahibi, kaynak, lisans ve dönüşüm bilgilerini gösterir; oyun ve arena altındaki bağlantılardan erişilir. Kaynak/lisans kanıtları `docs/arena-music-license-evidence/`, dosya hashleri `docs/arena-music-provenance.json`, teknik ses ölçümleri `docs/arena-music-audio-checks.json` içindedir. Atlas yalnız oyuna gömülü kullanım içindir; bağımsız MP3/soundtrack paketi olarak yayımlanmaz. Oyun yedeği kod ve oyun varlıklarıyla birlikte tutulmalıdır.

Test: `node --test tests/arena-music.test.mjs tests/static-audio.test.mjs tests/arena-performance.test.mjs`. Gerçek iPhone/Safari oynatma ve işitsel döngü birleşimleri ayrıca cihazda dinlenmelidir; teknik ölçümler bir dinleme testi değildir.

## Kahraman beceri dengesi

Kahraman aktifleri/pasifleri nadirlik ve rol bütçeleriyle kayıtlı parametrelerden hesaplanır; istemci kendi beceri gücünü gönderemez. Ayrıntılı 50 kahraman önce/sonra tablosu `docs/ability-balance/roster-changes.md` içindedir. Kael ve Alev Zırhı özel turda hedefin hareketini sıra sonuna taşır; hareket iptal edilmez veya çoğaltılmaz, geciktirilen hareketten sonraki tam tur zincirlemeye karşı korunur. Seraphine ve Sancak Bekçisi aynı düşük-canlı müttefike sınırlı şifa ve kalkan uygular.

Şifacıların tam-can özel vuruşu iki savaş yolunda eşittir. Bitirici hasar non-live tekrarın can göstergesine dahil edilir. Büyücü komutanının mevcut zayıflatması iki motorda da üç tur (uygulandığı tur dahil) sürer. Hazırlık ekranındaki yaklaşık güç, bütün savaş istatistiklerinin aynı sayıya dönüştüğü anlamına gelmez; kredi ve komutanın mevcut rol bazlı hesapları değişmez.

`node tools/verify-ability-parity.mjs` tüm kahramanlarla aynı kritik akışında legacy/canlı durumlarını karşılaştırır. `node tools/compare-ability-balance.mjs` sabit başlangıç commitine karşı kontrollü takım matrisi çalıştırır; sonuçlar gerçek oyuncu kitlesi kazanma oranı tahmini değildir. Görsel tarayıcı QA ortam kısıtı nedeniyle tamamlanamadı; işlevsel DOM/API testleri bu sınırdan ayrıdır.


## Komutan nihai becerileri

Her oyuncu savaş başına bir nihai kullanabilir. Normal enerji ve ulti dolumu ayrı havuzlardır; ikisi30 ile başlar, mevcut tur/seviye ve kahraman kaybı kazanımlarını ayrı ayrı alır,100 ile sınırlıdır. Normal beceri yalnız normal enerjiden40 harcar; ulti yalnız kendi dolumundan saldırı75, savunma85, büyü100, destek90 harcar. Normal kullanmak ulti dolumunu azaltmaz; kullanılan ulti göstergesi tekrar dolmaz. İptal/yanlış hedef hak veya enerji tüketmez. Kullanım hakkı sunucu oturumundadır; yeniden bağlanma yenilemez, yeni maç sıfırlar.

- Av Emri: oyuncunun seçtiği yaşayan rakibe, her yaşayan müttefikin sonraki hasar vuruşunu yönlendirir; sonraki tur sonuna kadar, en fazla beş vuruş. Ek saldırı vermez.
- Son Kale: takım kalkanı ve en düşük can oranlı bir müttefik için tur sınırı olmadan ilk ölümcül vuruştan 1 canla kurtulma. Koruma aynı kahramanda kalır ve tetiklenince tüketilir.
- Aşırı Yük: seçilen dostun kullanım anındaki saldırısı kadar sabit bonus, üç hareket turu. Katlanmaz; alan hasarı aynı güçlendirilmiş saldırıdan bir kez hesaplanır, şifa/kalkan büyümez. Ölürse kalan süre kendi takımındaki mevcut canı en yüksek yaşayan dosta, yeni dostun kendi saldırı değeriyle aktarılır; süre uzamaz ve aynı tur fazladan güçlendirilmiş hareket verilmez.
- Diriliş: seçilen düşmüş dost%40azami can ve sıfır kalkanla döner; en erken sonraki tur hareket eder. Bitmiş savaşta kullanılamaz.

Normal beceri maliyetleri, kredi/altın politikası, müzik, kahraman temel güçleri ve%70kalkan emilim kuralı korunur. Kontrollü simülasyonlar gerçek oyuncu kazanma oranı veya tüm koşullarda kusursuz denge iddiası değildir.

### Ayrı ulti dolumu — yerel doğrulama (2026-10-25)
Normal/ulti havuzları sunucuya aittir; hedef iptali, geçersiz hedef ve aynı istek tekrarı ek harcama yapmaz. Ortak1,2sn efekt kilidi sürer;5sn bekleme yalnızca iki normal beceri arasındadır. Ulti normal beklemesini başlatmaz, uzatmaz veya sıfırlamaz. Kolay botun önceki ulti kullanmama kuralı korunur; orta/zor botlar normal enerji biriktirerek ultiden tasarruf etmeye çalışmaz.
Kontrollü10/20seviye,48takım karşılaştırması:11520 savaş; aynı normal+ulti karar kuralında ultisiz maç oranı sırasıyla%98,44/%91,84 → %0/%0. Destek yalnız uygun ölü müttefik varsa diriltir. Bu örneklem genel oyuncu kazanma oranı değildir. Görsel tarayıcı kontrolü yapılmadı; DOM/HTTP hedefleme ve iki koltuk işlev testleri çalıştırıldı.

### Ulti hazır vurgusu ve normal bekleme sınırı
Ulti gerçekten kullanılabiliyorsa düğme Hazır etiketi ve2,4sn yumuşak ışık döngüsü gösterir. Hareket azaltma tercihinde sabit belirgin kenarlık kullanılır. Enerji dolu olsa bile uygun hedef yoksa, animasyon kilidi/hedef seçimi sürüyorsa veya ulti kullanıldıysa hazır animasyonu gösterilmez.
Normal0ms → ulti1200ms → sonraki normal5000ms geçerlidir. Ulti0ms → normal1200ms geçerlidir. Normal0ms → ulti4900ms durumunda ortak efekt kilidi nedeniyle normal6100ms olur; ulti normalin5000ms zamanını değiştirmez. Sunucu normalCooldownMs/normalCooldownUntil alanlarını döndürür; eski cooldownMs/cooldownUntil alanları normal-beceri uyumluluk adlarıdır. Tur bazlı eski eğitim yine turda tek komut kullanır; gerçek zamanlı bekleme göstergesi değildir.

### Av Emri hedef seçimi
Oyuncu, ultinin hedefini yaşayan rakiplerden seçer. Hedef seçimi ve iptal enerji/hak harcamaz; onay anında sunucu rakip tarafı ve canlılık durumunu yeniden doğrular. Geçersiz veya düşmüş hedef reddedilir. Bot aynı deterministik en düşük can oranı politikasını açık hedef kimliği göndererek sürdürür. Süre, her müttefikin tek saldırı hakkı ve beş kahramanlık sınır değişmez. Büyücü normal becerisi ve Son Kale gücü bu değişiklikte düzenlenmemiştir.

### Son Kale ve büyücü normal becerisi
Son Kale koruması, kullanıldığı anda seçilen en düşük can oranlı müttefikte ilk ölümcül darbeye kadar tur sınırı olmadan kalır; 1 canla kurtardıktan sonra tüketilir. Başka kahramana geçmez. Kalkan miktarı değişmez.
Büyücünün normal becerisi tek rakibin sonraki ilk gerçek saldırısını zayıflatır. Temel oran %35; 10 seviyede %38,5, 20 seviyede %42. Saldırana kadar bekler; aynı saldırının alan hasarı da etkilenir, iyileştirme/kalkan eylemleri ve komutan saldırıları hakkı tüketmez. Tek yük tutulur; tekrar kullanım ek yük biriktirmez. Önceki çok turlu etkinin yerini alır; bu değişiklik için yeni kapsamlı denge simülasyonu yapılmamıştır.
