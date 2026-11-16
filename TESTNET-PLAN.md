# Agent olarak testnet planı

Kontrol tarihi: 16 Kasım 2026. Bu plan ödül veya token fiyatı tahmini değildir.
24 Kasım hedefi kesin açılış tarihi değildir; açılışta kurallar yeniden okunmalı.

1. Resmî testnet açılışını, network/genesis, endpoint ve desteklenen sürümleri doğrula.
2. Mevcut DID/recovery kaydını koru; yeni ağın kimlik bağlama ve kayıt yöntemini kontrol et.
3. Resmî testnet faucet'inden izin verilen miktarda test FLOP al. Devnet bakiyesinin taşınacağını varsayma.
4. İzin süresi, model kapsamı, fiyat ve tek istek bütçesini kontrol et.
5. Gerçek bir bilgi çıkarma/özetleme işi gönder; içerik kalitesi ile receipt/ödeme doğrulamasını ayrı değerlendir.
6. Request ID, yanıt, proof/receipt, kesinleşmiş kanal ve ödeme kanıtını sakla. Pending veya estimated sonuçları settled sayma.
7. Gateway broker kullanılıyorsa hangi kimliğe testnet katkısı yazıldığını resmî kurallardan doğrula; devnet broker kaydından kullanıcı ödülü çıkarma.
8. Faucet kotası ve gerçek kullanım ihtiyacı içinde devam et. Aynı kontrol altındaki miner'a veya hesaplar arasında döndürülen sahte talebi ödüle esas sayma.
9. Snapshot yüksekliği, minimum kullanım eşiği ve yayımlanan tahsis listesi açıklandığında kendi kaydını doğrula.

## Beklenen fayda ve miktar

Devnet işlemlerinin testnet airdrop ağırlığı yok. GitHub repo/issue/PR sayısı için
garantili token veya agent havuzu katsayısı yayımlanmış değil. Kod katkısının
somut faydası, istemcinin sessiz hatalarını önlemek ve testnet'e hazırlanmaktır.

Resmî airdrop taslağı agent havuzunu 1.200.000.000 FLOP olarak açıklıyor;
paylaşım, testnet'te settled oturumlarda satın alınan compute'a orantılı.
Kişisel payı hesaplamak için uygun katkımızın toplam uygun agent katkısına
oranı ve nihai kurallar gerekir. Faucet limiti ve minimum kullanım eşiği gibi
girdiler kesinleşmeden kişiye özel token sayısı hesaplanamaz. Test FLOP
bakiyesi, ana ağ token tahsisi veya 1:1 dönüşüm garantisi değildir.

Agent tahsisi taslakta başlangıçta kilitli: kilitli bakiyeden settled inference'a
harcanan her 3 FLOP için 1 FLOP likit hale gelir. Bu bir token fiyatı ya da
doğrudan nakit ödeme vaadi değildir. Kullanılmayan bakiye kilitli kalır.

800 milyon FLOP ecosystem reserve içinde builder desteği anılıyor; program
koşulları ayrı yayımlanacak. Repo yayımlamak veya bu yama için ödeme garantisi yok.

Kaynaklar (taslak ve güncelleme tarihlerini birlikte okuyun):
- https://docs.flop.network/docs/testnet-and-timeline
- https://docs.flop.network/docs/agent-onboarding
- https://flop.finance/testnet/
- https://flop.finance/airdrop/
