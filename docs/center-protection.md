# Arka merkez savunması

Yeni savaş başlarken takım tam **2 ön + 3 arka** ise, sıralanmış arka safın ikinci kahramanının hesaplanmış başlangıç savunması **%15 artırılır**. Sonuç en yakın tam sayıya yuvarlanır. Saf, kredi, komutan ve başlangıç pasiflerinden sonra uygulanır; diğer istatistikleri değiştirmez.

- Bonus savaş boyunca sürer. Diğer kahramanların ölmesi bonusu kaldırmaz. Merkez kahramanın ölümü ve dirilmesi bonusu yeniden uygulamaz veya başka kahramana taşımaz.
- Merkez otomatik normal/özel saldırılarda hedeflenebilir. Normal kahramanlar önce ön safı, suikastçılar önce arka safı hedeflemeyi sürdürür. Av Emri önceliği değişmez.
- Savunma artışı düz %15 hasar azaltımı değildir. Normal savunma formülleri, zırh delme ve zırh kırma aynen işler. Savunmadan türeyen kalkan/yetenekler artırılmış değeri kullanır.
- Alan hasarı ana vuruştan türetilmeye devam eder; komutanların sabit hasar formülleri değişmez. Ayrı bir alan hasarı direnci eklenmez.
- Başlangıçta diğer dizilişler bonus almaz. Hazırlıkta aynı saftaki takas yeni merkez kimliğini belirler. Rövanş kendi yeni dizilişiyle hazırlanır.

## Veri ve uyumluluk

`initializeCenterDefenseBonus` yalnız yeni savaş hazırlığında çağrılır. Merkezin `centerDefenseBonus` alanı `{version:1,multiplier:1.15}` olur. Hesaplanmış savunma savaş görüntüsünde saklanır; yeniden bağlanma veya diriltme istatistikleri yeniden hesaplamaz. Önizleme aynı hazırlama motorunu kullanır.

Önceki `centerProtection` işaretini taşıyan kayıtlı savaşlar eski hedef korumasını korur. Yeni savaşlar bu işareti üretmez. Tamamlanmış savaş kayıtları yeniden hesaplanmaz.

## Doğrulama

- `node --test tests/battle-center-defense.test.mjs tests/battle-center-protection*.test.mjs`
- `node --test tests/commander-transfer-replay-order.test.mjs`
- `npm test`
- `npm run audit:strict`
