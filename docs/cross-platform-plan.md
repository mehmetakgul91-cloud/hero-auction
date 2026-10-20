# Hero Auction — Android, iOS ve Web ortak oyun planı

## Hedef
Android (Google Play), iOS (App Store) ve Web oyuncuları aynı 3 haneli oda kodu, ortak hesap, kahraman havuzu ve sunucu tarafı savaş motoru ile eşleşir. Oyun 1v1 kalır.

## Mevcut mimari
- Node.js HTTP API: `server.js`
- PostgreSQL: `pg`, `DATABASE_URL`
- Tarayıcı arayüzü: `public/index.html`, `public/app.js`, `public/style.css`
- Canlı olaylar: SSE, `listeners` haritası
- Oda durumu: bellek içi `rooms` ve PostgreSQL kalıcılık kodu
- Savaş: `battle-engine.js`, `battle-match.js`, komutan canlı savaş modülleri
- Testler: GitHub Actions battle/commander workflows

## Tasarım kararları
1. Sunucu otoriter: teklif, oda sırası, arena sonucu, altın ve komutan becerileri yalnızca sunucuda doğrulanır.
2. Platform bağımsız oturum: Web, Android ve iOS istemcileri aynı hesap kimliğine bağlanır; native Google/Apple girişleri sunucuda doğrulanır. Web tokenlarını güvenlik incelemesi olmadan native içine kopyalamayın.
3. Tek API sözleşmesi: tüm platformlar HTTPS üzerinden aynı uç noktaları ve SSE olaylarını kullanır.
4. Yeniden bağlanma: uygulama arka plandan döndüğünde oturum yenilenir, oda snapshot'ı alınır, SSE yeniden kurulur; kaçırılan olaylar snapshot ile telafi edilir.
5. Capacitor Android ve iOS kabukları; web arayüzü mümkün olduğunca ortak kalır. Platforma özgü kimlik doğrulama, bildirim, reklam ve ses davranışları adaptör katmanında ayrılır.
6. iOS derlemesi Xcode/macOS ve Apple Developer hesabı gerektirir. Android AAB için Android SDK ve imzalama gerekir.
7. Mevcut web reklam kodu native uygulamaya doğrudan taşınmaz; uygulama mağazası ve reklam politikaları ayrı değerlendirilir.

## Uygulama sırası
- [ ] Oda API'si ve SSE olaylarının sürümlü sözleşmesini çıkar
- [ ] Oda sahipliği, yetkilendirme, yeniden bağlanma ve PostgreSQL restore testlerini tamamla
- [ ] Arena zamanlayıcısı, komutan enerjisi/beceri sırası, savaş bitişi ve rövanş regresyon testleri
- [ ] Web UI'da API base URL ve platform bağımlılıklarını ayrıştır
- [ ] Capacitor Android ve iOS projelerini ekle
- [ ] Google/Apple native kimlik doğrulama köprüsü
- [ ] Android↔Web, iOS↔Web, Android↔iOS canlı maç testleri
- [ ] Gerçek cihazlarda arka plan/uyku, ses, performans ve dokunmatik kontroller
- [ ] Android AAB ve iOS archive/TestFlight dağıtımı

## Kabul kriterleri
- Web oyuncusu Android/iOS oyuncusuyla aynı odaya katılır, iki tarafta aynı teklif/sonuç görünür.
- İki platform da aynı sunucu hesap ve altın bakiyesini görür; çift ödül yoktur.
- Arka plandan dönüşte oda geri gelir ve sayaç sunucu zamanına göre düzelir.
- Komutan becerileri tek sefer işlenir; aynı anda çakışan iki beceri sunucu sırasıyla çözülür.
- Son kahramanın ölümü maç bitişini tetikler; rövanş iki tarafta tutarlı çalışır.
- CI regresyon testleri geçmeden main'e birleştirilmez.
