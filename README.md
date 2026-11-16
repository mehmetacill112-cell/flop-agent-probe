# FLOP Agent Probe

Python 3.10+ ile çalışan, harici paket gerektirmeyen FLOP devnet tanı entegrasyonu.
Gateway sağlığını, faucet/RPC genesis eşleşmesini, REST kataloğunu, MCP model ve
fiyat keşfini, public session tekliflerini ve sağlayıcı listesini raporlar.

```powershell
python flop_probe.py --output output
```

İsteğe bağlı mevcut gateway credential kontrolü:

```powershell
python flop_probe.py --credential-file ..\.secrets\owner.json --output output
```

Gizli değer rapora veya stdout'a yazılmaz. Credential yalnızca sabit resmî gateway
origin'indeki `/v1/keys/me` isteğinde kullanılır; yönlendirmeler izlenmez.
Varsayılan çalışma credential kullanmaz. `output/report.json` ayrıntılı gözlemi,
`output/REPORT.md` kısa raporu içerir. Raporları paylaşmadan önce kullanıcıya özel
adres ve kapsam metadata'sını gözden geçirin; `.secrets` hiçbir zaman paylaşılmaz.

Bu araç inference göndermez, anahtar üretmez, faucet'ten fon istemez veya
yenileme yapmaz. MCP JSON-RPC POST çağrıları yalnızca okuma araçlarınadır.
`discovered_models`, zincir keşfidir; hazır worker veya erişim izni kanıtı değildir.
Taşıma hataları ve eksik yanıtlar başarı kabul edilmez.

Bu topluluk projesi başarılı FLOP inference, proof doğrulaması, settlement
veya airdrop hakkı kanıtı değildir. Resmî FLOP ürünü değildir.

## SDK hata düzeltmesi katkısı

`sdk-regression/`, resmî npm SDK 0.6.0 paketindeki hata gizleme ve bağlantı
temizliği sorunları için sürüme bağlı bir yama adayı içerir. Aynı çevrimdışı
testlerde yayımlanmış sürüm 4/11, yama adayı 11/11 geçmiştir. Bu sonuç canlı
inference veya upstream düzeltme kabulü anlamına gelmez. Kullanım, kaynak,
lisans, diğer katkıcılara atıf ve sınırlar alt klasörün README'sindedir.

Testnet hazırlığı ve ödül kurallarının sınırları: [TESTNET-PLAN.md](TESTNET-PLAN.md).

Kaynaklar:
- https://explorer.devnet.flop.network/connect
- https://docs.flop.network/docs/agent-integration
- https://docs.flop.network/docs/send-to-specific-miner

Tasarım: mevcut yerel MCP kontrolleri ve Python standart kütüphanesi kullanıldı.
Üçüncü taraf repo kodu veya agent framework'ü alınmadı.
