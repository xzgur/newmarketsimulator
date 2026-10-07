# Market Sipariş Toplama — 1 Siparişlik Demo

Three.js + Vite + TypeScript ile yapılmış, tarayıcıda oynanan 3D market sipariş toplama oyunu.

Online sipariş **#1042** geldi. Robot toplama arabasını sürüp ürünleri farklı reyonlardan topluyorsun,
arabanın üst kasasındaki poşetlere yerleştiriyorsun. Siparişi kapatınca motorcu geliyor. Arabayı girişteki
**Teslimat Noktası**'na götürüp siparişi teslim ediyorsun. Bunların hepsini **5 dakika** içinde bitirmen gerekiyor.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm run preview    # build'i sunar
npm test           # birim testleri (vitest)
npm run typecheck
```

Zayıf GPU'larda `?q=low` parametresiyle gölgeler ve antialias kapatılır: `http://localhost:5173/?q=low`.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| `W` `S` / ok tuşları | İleri / geri |
| `A` `D` | Dönüş (robot yerinde dönebilir) |
| `Space` | Fren |
| `E` / `Enter` | Raftan ürün al · motorcuya teslim et |
| `Tab` (veya `Q`, ya da sağ alttaki kasa butonu) | Araba paneli (poşetleme) |
| `1` `2` `3` | Panelde seçili ürünü 1./2./3. poşete koy |
| `F` | Panelde siparişi tamamla |
| `C` | Takip kamerası / üstten kamera |
| `Esc` / `P` | Duraklat |
| `M` | Ses aç/kapat |

## Oyun döngüsü

```
Intro ─► Toplama (playing) ─► Motorcu yolda (courierArriving) ─► Motorcu bekliyor (awaitingHandover)
              │                                                           │  E (teslimat noktasında)
              │ süre biter                                                ▼
              └──────────────────────────► Kaybettin (lost)        Teslimat (handover) ─► Kazandın (won)
```

1. **Topla:** Raf önüne yaklaşınca raf sarı çerçeveyle vurgulanır ve ürünün adı görünür. `E` ile aldığın ürün alt
   kasaya (6 ürünlük) düşer. Benzer ürünlere dikkat et: Tam Yağlı / Yarım Yağlı / Laktozsuz süt, Patates / Mısır
   cipsi, Bulaşık / Çamaşır deterjanı, Su 5L / 1,5L vb.
2. **Poşetle:** `Tab` ile paneli aç, poşeti aç, ürünü seç ve poşete tıkla (sürükle-bırak da çalışır). Kurallar:
   - Temizlik ürünleri gıdayla aynı poşete konmaz.
   - Yumurta, ağır ürünlerle (5L su) aynı poşete konmaz.
   - Bir poşete en fazla 5 ürün sığar.
   - Siparişte olmayan ürünü (ya da fazla adedi) poşete koymaya çalışırsan **5 saniye ceza** alırsın. Yanlış ürünü
     "İade" butonuyla cezasız geri bırakabilirsin.
3. **Kapat:** Bütün ürünler poşetteyse ve kasa boşsa **Siparişi Tamamla**. Poşetlerin ağzı bağlanır, motorcu çağrılır.
4. **Teslim et:** Motorcu scooter'la gelip kapıdan içeri girer. Arabayı yeşil **Teslimat Noktası**'na sür ve `E`'ye bas.
   Motorcu poşetleri alıp yola çıkınca oyunu kazanırsın. Kalan süreye ve hatalara göre 1–3 yıldız alırsın.

Süre dolarsa (ceza saniyeleri de süreden düşer) oyun biter. **Tekrar Dene** ile sahne tamamen sıfırlanır.

## Mimari

```
src/
  data/            # Saf veri (Three.js yok, test edilebilir)
    products.ts    #   48 ürün: reyon, şekil, renk, oyun etiketleri (food/chemical/heavy/fragile)
    order.ts       #   Demo siparişi (#1042), süre, poşet/kasa kapasiteleri
    layout.ts      #   Market planı: reyonlar, raf kolonları (Display), çarpışma kutuları, tabelalar,
                   #   başlangıç / teslimat / motorcu noktaları, raf etkileşim bölgesi hesabı
  logic/           # Saf oyun mantığı (Three.js yok, birim testli)
    collision.ts   #   Daire–AABB itme çözümü
    cartPhysics.ts #   Diferansiyel sürüşlü robot araba kinematiği
    order.ts       #   OrderSession: kasa, poşetler, kurallar, ceza, tamamlanma
    gameFlow.ts    #   Faz durum makinesi + geri sayım + yıldız hesabı
  render/          # Three.js görselleri
    store.ts       #   Market binası, reyonlar, buzdolapları, manav tezgahı, kasa, kapılar, tabelalar,
                   #   InstancedMesh ile raflardaki ürünler, vurgulama, teslimat işareti
    productMeshes.ts # Prosedürel low-poly ürün modelleri (malzemeye göre birleştirilmiş tek geometri)
    cart.ts        #   Referans görselden esinlenen robot toplama arabası (LED şeritler, 2 kasa, 3 poşet)
    courier.ts     #   Scooter + motorcu, senaryolu animasyon (gel → içeri yürü → bekle → al → git)
    batch.ts       #   Statik geometriyi malzemeye göre birleştirme (draw call optimizasyonu)
    textures.ts    #   Canvas ile üretilen etiket, tabela, fiyat etiketi atlası, zemin dokuları
    thumbnails.ts  #   HUD ikonları: 3D ürün modellerinden render edilir
  ui/
    hud.ts         #   Sipariş listesi, sayaç, hedef satırı, uyarılar, araba paneli, ekranlar
    minimap.ts     #   Reyon renkli mini harita
  audio.ts         # WebAudio ile sentezlenen ses efektleri (harici dosya yok)
  input.ts         # Klavye durumu + tek seferlik aksiyonlar
  game.ts          # Orkestratör: döngü, kamera, mantık ↔ görsel ↔ UI bağlantısı
tests/logic.test.ts  # Sipariş kuralları, plan erişilebilirliği, fizik, faz makinesi
scripts/playtest.mjs # Playwright ile uçtan uca otomatik oynanış testi
```

**Asset yaklaşımı:** Bütün modeller (ürünler, raflar, araba, motorcu), dokular (etiketler, tabelalar, zemin) ve sesler
kod içinde prosedürel üretiliyor. Bu sayede indirme, lisans ya da yükleme hatası riski yok ve demo tek başına
çalışıyor. Ürün ikonları da aynı 3D modellerden render edildiği için listedeki ikon raftaki ürünle birebir aynı.

**Performans:** Statik sahne malzemeye göre birleştiriliyor, raflardaki ~2000 ürün ürün tipi başına tek
`InstancedMesh` ile çiziliyor ve fiyat etiketleri tek bir doku atlasında toplanıyor. Böylece bir kare yaklaşık
200 draw call tutuyor.

## Otomatik oynanış testi

```bash
npm run dev
npm run playtest                     # varsayılan: http://localhost:5173/?q=low
```

Script oyunu gerçek arayüz üzerinden baştan sona oynar ve her adımın ekran görüntüsünü `playtest-output/` klasörüne kaydeder:

- Klavyeyle sürüş, dönüş, fren ve rafa çarpma
- Yanlış ürün alma: 5 sn ceza ve iade
- 10 ürünün iki turda toplanması
- Panelde tıklayarak poşetleme
- Siparişi kapatma
- Teslimat noktasına sürme, motorcunun gelmesi, teslim ve kazanma ekranı
- Yeniden başlatma ve süre dolunca kaybetme

Raflar arası ışınlanma ve simülasyonu deterministik adımlarla ilerletme için `window.__game` debug kancası kullanılır.
