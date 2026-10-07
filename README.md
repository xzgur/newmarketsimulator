# Market Koşusu

Three.js + Vite + TypeScript ile yapılmış, birinci şahıs (FPS) bakışlı bir market sipariş toplama oyunu.

Vardiyan başlar başlamaz arabaya monteli telefonun çalar: **Kapında!** uygulamasına online sipariş **#1042** düşmüştür.
Siparişi kabul edince 5 dakikalık süre başlar. Klasik bir market arabasını iterek canlı marketin reyonlarında
dolaşırsın. Ürüne nişan alıp elinle alır, arabadaki poşetleri açıp ürünleri yerleştirirsin. Sipariş tamamlanınca
motorcu scooter'la gelir, kapıdan girip seni bekler. Teslimat noktasına gidip siparişi teslim edince vardiya biter.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm run preview    # build'i sunar
npm test           # birim testleri (vitest)
npm run typecheck
npm run playtest   # dev server açıkken: uçtan uca otomatik oynanış testi
```

Grafik kalitesi başlık ekranından seçilir (Yüksek / Orta / Düşük). URL parametreleriyle de verilebilir:
`?q=low|medium|high&mood=day|sunset|night`.

## Kontroller

| Girdi | İşlev |
| --- | --- |
| `W` `A` `S` `D` | Yürü / yan adım (araba önünde) |
| Fare (ya da sürükle) | Etrafa bak |
| `←` `→` | Klavyeyle dön |
| `Shift` | Koş |
| `Sol tık` / `E` | Raftan ürün al · nişan aldığın poşete koy · katlı poşeti aç · motorcuya teslim et |
| `Sağ tık` / `Q` | Elindeki ürünü geri bırak (fırlat) |
| `1` `2` `3` | Elindeki ürünü doğrudan 1./2./3. poşete koy |
| `Enter` | Gelen siparişi kabul et |
| `Tab` | Telefondaki sipariş listesini aç / küçült |
| `F` | Siparişi tamamla (motorcuyu çağır) |
| `Esc` | Duraklat (atmosfer seçimi de burada) |
| `M` | Ses aç/kapat |

## Oyun döngüsü

```
Başlık ─► Telefon çalıyor (incoming) ─Enter─► Toplama (playing, süre işler)
            ─F─► Motorcu yolda (courierArriving) ─► Motorcu kapıda (awaitingHandover)
            ─E─► Teslimat (handover) ─► Kazandın (won, 1-3 yıldız + puan)
   (süre biterse herhangi bir anda) ─► Kaybettin (lost)
```

- **Toplama:** Elinde bir seferde tek ürün taşıyabilirsin. Benzer ürünlere dikkat et:
  Tam Yağlı / Yarım Yağlı / Laktozsuz süt, Köy 10'lu / 6'lı yumurta, Beyaz peynir / Kaşar,
  Patates / Mısır cipsi, Su 5L / 1,5L, Bulaşık / Çamaşır deterjanı gibi.
- **Poşetleme kuralları:**
  - Temizlik ürünleri gıdayla aynı poşete konmaz.
  - Yumurta, ağır ürünlerle (5L su) aynı poşete konmaz.
  - Bir poşete en fazla 5 ürün sığar.
  - Siparişte olmayan ürünü (ya da fazla adedi) poşete koymaya çalışırsan **5 sn ceza** alırsın.
    Yanlış ürünü sağ tıkla cezasız geri bırakabilirsin.
- **Seri ve puan:** Doğru ürünleri peş peşe 14 saniye içinde poşetlersen seri (x2, x3…) büyür. Sonda kalan süre
  bonus puana dönüşür. Yıldızlar kalan süreye ve hata sayısına göre verilir.

## Canlı market

- **Müşteriler:** 8 müşteri reyonlar arasında gezer, raflara bakıp ürün alır ve sepet taşır. Konuşma balonlarıyla
  laf atar ("Ooo kampanya!"), çarparsan söylenir ("Pardon!"). Kasalarda kasiyerler çalışır.
- **Mağaza:** Kasalarda yürüyen bant döner, mağaza anonsları yapılır.
- **Sokak:** Vitrinden arabaların geçtiği sokak görünür. Motorcu scooter'la gelip park eder ve otomatik kapıdan girer.
- **Ses:** Lo-fi müzik, market uğultusu, araba tekerleği tıkırtısı, barkod bipleri, poşet hışırtısı ve telefon zil
  sesinin hepsi WebAudio ile kodda üretiliyor.
- **Atmosfer:** Öğle Telaşı, Gün Batımı ve Gece Vardiyası. Her biri farklı gökyüzü (HDR), ışık, sokak lambası ve
  renk düzeniyle geliyor.

## Mimari

```
src/
  data/                 # Saf veri (Three.js yok, test edilebilir)
    products.ts         #   64 ürün: reyon, şekil, kurgusal marka/etiket, fiyat, oyun etiketleri
    order.ts            #   Sipariş #1042 (uygulamadaki müşteri, adres, not, süre, poşet kuralları)
    layout.ts           #   Market planı: 6 reyon + uç standlar, soğutucular, fırın, içecek, manav,
                        #   kasalar, dekor, çarpışma kutuları, müşteri yol ağı (nav graph + Dijkstra)
  logic/                # Saf oyun mantığı (birim testli)
    player.ts           #   FPS hareket: oyuncu + önündeki araba için iki daireli çarpışma, müşteriler
    collision.ts        #   Daire–AABB itme
    order.ts            #   OrderSession: el, poşetler, kurallar, ceza, tamamlanma
    gameFlow.ts         #   Faz durum makinesi + süre + yıldız
  render/
    assets.ts           #   KayKit GLB paketlerini yükler, prop klonlar, karakter kıyafetlerini yeniden boyar
    store.ts            #   Market binası, reyonlar, ışıklar, tabelalar, InstancedMesh ürünler, hover efekti
    productMeshes.ts    #   KayKit tarzı ürün modelleri (+ KayKit sebzeleri), malzemeye göre birleştirilmiş
    cartModel.ts        #   Klasik tel market arabası + içindeki 3 poşet (açılma/bağlanma animasyonu)
    hands.ts            #   Birinci şahıs kollar: araba sapını tutar, ürünü kaldırır
    people.ts           #   Müşteri yapay zekası (yol bulma, raf gezme, tepkiler) + kasiyerler
    courier.ts          #   Motorcu + scooter senaryosu
    outside.ts          #   Sokak: binalar, yol, trafik, sokak lambaları
    mood.ts             #   Atmosferler: HDR gökyüzü, güneş, armatürler, nokta ışıklar, renk düzeni
    post.ts             #   GTAO + Bloom + ACES + renk düzeni/vinyet/grain + SMAA
    particles.ts        #   Parıltı ve konfeti
    textures.ts         #   Canvas dokuları: ürün etiketleri (ikonlu), reyon tabelaları, fiyat etiketi atlası…
    batch.ts            #   Statik geometriyi malzemeye göre birleştirme
    thumbnails.ts       #   Uygulama/HUD ikonları 3D modellerden render edilir
  ui/hud.ts             # Kapında! telefon uygulaması, nişangah, kartlar, sayaç, menüler
  audio.ts              # Prosedürel ses + müzik
  input.ts              # Klavye + fare (pointer lock, sürükleyerek bakma yedeği)
  game.ts               # Orkestratör
tests/logic.test.ts     # Kurallar, plan erişilebilirliği, yol ağı, hareket, faz makinesi
scripts/
  fetch-assets.sh       # KayKit paketlerini GitHub'dan indirir (vendor/, git'e girmez)
  build-assets.mjs      # Kullanılan modelleri public/models/*.glb olarak paketler
  playtest.mjs          # Playwright ile uçtan uca oynanış testi (ekran görüntüleri: playtest-output/)
```

## Hazır assetler ve lisanslar

| Asset | Kaynak | Lisans |
| --- | --- | --- |
| Sebze kasaları, sebzeler, ketçap/hardal, kağıt havlu, sütun, kaktüsler, koliler, menü panosu | KayKit Restaurant Bits + Furniture Bits (Kay Lousberg) | CC0 |
| Sokak binaları, arabalar, sokak lambası, çalılar, yangın musluğu, bank, çöp konteyneri | KayKit City Builder Bits (Kay Lousberg) | CC0 |
| Müşteriler, kasiyerler, motorcu (animasyonlu karakterler) | KayKit Character Pack: Adventurers (Kay Lousberg) | CC0 |
| Gökyüzü HDR'ları | Poly Haven (three.js deposu üzerinden) | CC0 |
| DynaPuff, Nunito yazı tipleri | Google Fonts | OFL (`public/fonts/OFL-*.txt`) |

Ürün paketleri, market arabası, raflar, telefon arayüzü, motorcu kaskı/scooter'ı, tabelalar, etiketler ve tüm sesler
kodla üretiliyor. Markalar kurgusal.

`public/models/*.glb` dosyaları depoda hazır geliyor. Yeniden üretmek için `bash scripts/fetch-assets.sh && node scripts/build-assets.mjs` çalıştırılır.

## Performans

- **Ürünler:** Raflardaki yaklaşık 7.500 ürün, ürün tipi başına tek bir `InstancedMesh` ile çiziliyor.
- **Statik sahne:** Malzemeye göre birleştiriliyor ve fiyat etiketleri tek bir doku atlasında toplanıyor. Böylece
  sahne yaklaşık 270 draw call ve 1M üçgen tutuyor.
- **Düşük kalite:** Post-process ve gölgeleri kapatır, 1x piksel oranında çizer.
