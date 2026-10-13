# Hero Auction — Kart bilgileri V4 (ilk aşama)

`public/cards.json` dosyasında 100+ karakter için elle yazılmış, birbirinden farklı Türkçe açıklamalar bulunmaktadır.
`server.js` önce bu açıklamaları kullanır; geri kalan karakterlerde önceki Wikipedia bilgi araması devam eder.
Pokémon görselleri PokeAPI resmi çizim adreslerinden, diğer görseller Wikipedia/Wikimedia üzerinden alınmaya çalışılır. Görseller henüz yerel klasöre indirilmiş değildir ve her kartta doğru görsel garantisi yoktur.

Yeni bir kart tanıtımı eklemek için `public/cards.json` dosyasına `evren:karakter adı küçük harfle` anahtarıyla `{ "description": "..." }` kaydı ekleyin.

Kurulum: ZIP içeriğini proje köküne yerleştirin. `public/cards.json` dahil tüm dosyalar GitHub'a yüklenmelidir.
