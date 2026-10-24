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

## Arena hazırlığı

Açık artırmada edinilen beş kahraman, kendi ön/arka saf tercihine (kahramanın kayıtlı saf bonuslarına) göre tahtaya otomatik yerleşir. Oyuncu yalnızca **Ön saf / Arka saf** değişikliği yapar; boş yuva seçme, sürükleme veya kahramanları yeniden sıralama gerekmez. Saf değişikliği kahramanların edinilme/savaş sırasını değiştirmez. Mevcut kurallarda iki safın her biri sıfır ile beş kahraman içerebilir.

Saf tercihleri maç ve oyuncuya özel taslak olarak sunucuda saklanır; yenilemede korunur, rövanşta yeni kadro için yeniden oluşturulur. Henüz sunucuya ulaşmayan değişiklik aynı sekmede maç/kadro anahtarıyla saklanır ve yeniden gönderilir. Web ve CrazyGames tarayıcı kayıtları ayrıdır; hesapta kayıtlı komutan/diziliş verilerine toplu dönüşüm uygulanmaz.

Otomatik yerleşim **Hazırım** sayılmaz. Mevcut 60 saniyelik hazırlık süresi veya oyuncunun Hazırım düğmesi dizilişi onaylar; savaş için her iki tarafın da hazır olması gerekir. Sunucu beş farklı kahramanı, değiştirilemeyen gerçek rollerini ve saf değerlerini doğrular. Onaylanmış diziliş ve eski maça ait istekler değişiklik kabul etmez.

## Komutan seçimi ve değişimi

İlk komutan seçimi ücretsizdir. Daha sonra farklı bir komutana geçiş 1000 altındır; gelişim seviyeleri korunur. Ücret sunucuda bakiye kontrolüyle birlikte tek işlemde kesilir. Aynı komutanı yeniden seçme isteği ücret kesmeden reddedilir. Geliştirme ücretleri ve diğer oyun ekonomisi değişmez.

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

İlk müzik sürümünde yüklenmiş üç parça seçilir: Determined Pursuit (orkestra), The Eternal Sands (Orta Doğu fantastik) ve Atlas • Kazakhstan (AI üretimi Kazak/Orta Asya esintili). Diğer üç parça yükleme tamamlandığında ayrı güncellemeyle eklenecektir. Latin parça dahil değildir. Her tarayıcı sekmesinde üç parçalık rastgele sıra tamamlanmadan parça tekrarlanmaz; sıra sınırında da son parça hemen tekrar etmez. Gerçek maç anahtarı değişmeden yenileme, sesi kapat/aç veya arka plandan dönme parça seçimini değiştirmez. Web ve CrazyGames kayıtları ayrıdır.

Tek bir `HTMLAudioElement` yalnız seçilen parçayı yükler. Hazırlıkta kullanıcı dokunuşuyla sessizce açılır; maç başladığında mevcut %60 ses düzeyi kullanılır. Sekme gizlenince/platform sesi kapatınca durur, maç bitiminde kaynak bırakılır. Otomatik oynatma engeli aynı parçayı bir sonraki dokunuşta yeniden dener. Gerçek yükleme hatasında yalnız bir kez eski davul-bas parçasına, o da başarısızsa prosedürel sese döner. İndirme takılması başına 15 saniyelik sınırlı zaman aşımı vardır; bütün liste arka planda yüklenmez.

`/music-credits.html` eser sahibi, kaynak, lisans ve dönüşüm bilgilerini gösterir; oyun ve arena altındaki bağlantılardan erişilir. Kaynak/lisans kanıtları `docs/arena-music-license-evidence/`, dosya hashleri `docs/arena-music-provenance.json`, teknik ses ölçümleri `docs/arena-music-audio-checks.json` içindedir. Atlas yalnız oyuna gömülü kullanım içindir; bağımsız MP3/soundtrack paketi olarak yayımlanmaz. Oyun yedeği kod ve oyun varlıklarıyla birlikte tutulmalıdır.

Test: `node --test tests/arena-music.test.mjs tests/static-audio.test.mjs tests/arena-performance.test.mjs`. Gerçek iPhone/Safari oynatma ve işitsel döngü birleşimleri ayrıca cihazda dinlenmelidir; teknik ölçümler bir dinleme testi değildir.
