# Hero Auction — Çevrimiçi iki kişilik açık artırma

## Hızlı başlatma

Node.js 18 veya üzeri gerekir. Ek npm paketi gerektirmez.

```bash
npm start
```

Tarayıcıda `http://localhost:3000` açın. Aynı Wi-Fi'daki iki telefondan denemek için bilgisayarın yerel IP'siyle `http://IP_ADRESI:3000` adresine girin. Farklı ağlardan canlı oynamak için projeyi Node.js destekli bir sunucuya (ör. Render, Railway, Fly.io) yükleyin ve HTTPS adresini paylaşın. **Bu ZIP tek başına internette yayımlanmış bir site değildir.**

## Oynanış

- 2 oyuncu, 20'şer kredi, 10 rastgele kart.
- İlk teklif sırası karttan karta dönüşümlüdür (1. kart oyuncu 1, 2. kart oyuncu 2, vb.).
- Teklifler en az 1 artar; yalnızca ihaleyi kazanan öder.
- Rakip en yüksek tekliften daha fazla veremiyorsa sunucu ihaleyi otomatik kapatır.
- İhale kazanılınca karakter takıma eklenir.
- Her kartın 1–100 arası puanı sunucuda gizlidir. API bu puanları hiçbir aşamada istemciye göndermez.
- Finalde yalnızca takımın **toplam puanı** gösterilir (güçler toplamı + kalan kredi × 10). Tekil karakter puanları asla açıklanmaz.

## Karakter havuzu

Sunucu açılışında PokeAPI'den 1025 Pokémon türünü almayı dener. İnternet erişimi yoksa paket içindeki Kanto listesi kullanılır. Ayrıca Marvel, DC ve Yüzüklerin Efendisi için küratörlü isim listeleri bulunur. **1000+ karakter hedefi PokeAPI'ye başarılı erişim olduğunda karşılanır; internet erişimi olmayan ilk açılışta havuz daha küçüktür.** `GET /api/info` gerçek sayıları gösterir. Karma evren ve tek evren seçenekleri vardır.

Pokémon resimleri, istemcide PokeAPI'nin resmî çizim depolarından yüklenmeye çalışılır. İnternet yoksa simge gösterilir. Marvel, DC ve LOTR için şimdilik evren simgesi kullanılır. Telifli görselleri izin almadan pakete eklemiyoruz.

## İlk prototipin sınırları

- Oyun odaları **sunucu belleğinde** tutulur. Sunucu yeniden başlarsa aktif odalar silinir. 24 saatlik eski odalar temizlenir.
- Tek sunucu örneğinde çalışır; yatay ölçeklendirme için Redis/Postgres gerekir.
- Misafir oda kodu ve gizli oturum anahtarı kullanılır. Ticari yayına geçmeden önce hız sınırlaması, kötüye kullanım önlemleri, kalıcı veri tabanı ve erişim kontrolü güçlendirilmelidir.
- Harici PokeAPI erişimi gerektiren geniş karakter listesi ve Pokémon görselleri için sunucunun/oyuncunun interneti olmalıdır.
- Bu proje Pokémon/Marvel/DC/LOTR hak sahipleriyle ilişkili değildir. Ticari kullanımda isim/görsel/marka haklarını ayrıca değerlendirin.

## Dosyalar

- `server.js`: HTTP sunucusu, oyun motoru, SSE canlı güncellemeler, gizli skorlar.
- `public/index.html`: arayüz.
- `public/style.css`: mobil tasarım.
- `public/app.js`: oyuncu arayüzü, teklif etkileşimleri ve canlı senkronizasyon.
