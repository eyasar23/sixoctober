AŞAMA 2 · KAMERA: REFERANSA DAYALI, DURUMA GÖRE DEĞİŞEN KAMERA (1B üzerine)

## 0. Kapsam ve kurallar
- Bu sohbette tek iş var: kamera. Kod tabanı 1B (main). Önceki 2.1 denemesi (asama-2-his branch'i) terk edildi; o yaklaşımı kopyalama.
- Oku:
  - BRIEF.md §2.3 ve §5.3
  - docs/art-direction.md
  - NOTLAR.md'deki en üst kayıt
- Kodda sadece şunları aç: kamera dosyaları (followCamera.ts vb.), tuning.ts, debugPanel.ts, oyuncunun durum makinesi (sadece okumak için), gerekiyorsa overlay.
- Bu mesajı docs/asamalar/asama-2-kamera.md olarak kaydet.
- DOKUNMA: halatın bağlanacağı noktanın seçimi, Shift davranışı, hareket fiziği, dövüş, düşmanlar.
  - Kameranın ihtiyaç duyduğu bilgileri (oyuncunun durumu, hız, duvar normali, düşman konumları) sadece okuyan küçük fonksiyonlarla al.
  - Tek istisna Bölüm 3'teki "girdi referansı".
- Git işlerini Emirhan yapıyor; commit ya da push yapma.
- Geliştirme sunucusu açık değilse başlat ve linki ver.
- Test: Vitest, typecheck ve build çalıştır. Tarayıcı testi yapma.
- Mesaja referans-kamera.png eklendiyse ona bak: referans oyundan 5 durum için kareler içeriyor.
- Referanstaki karakter ve görseller kopyalanmayacak (BRIEF 2.8). Sadece kamera ve hareket davranışı ölçüldü.

## 1. Referans ölçümleri
Kaynak: referans oynanış videosu, yaklaşık 600 kare (10 kare/sn), her karede ölçüm ızgarasıyla incelendi.
- "Boy": karakterin ekran yüksekliğinin yüzde kaçını kapladığı.
- "Ufuk": ufuk çizgisinin ekranın üstünden yüzde kaçta olduğu.

| Durum | Boy | Konum | Kamera davranışı |
|---|---|---|---|
| Yerde koşu/yürüme | %22–30 | Yatayda ortada (%45–50); göğüs ~%55; ayaklar %65–73 | Arkada, baş hizasının üstünde, hafif aşağı bakıyor (ufuk %25–40 → pitch ≈ −10…−15°). Karakter dönünce kamera beklemeden, 1–1,5 sn içinde yumuşakça başlayıp yumuşakça bitirerek arkaya geliyor; ani savrulma yok |
| Dövüş | %22–25 | Ortada | Yerdekinden yüksekte ve daha aşağı bakıyor (ufuk ~%20 → pitch ≈ −18…−24°); etraftaki düşmanlar kadrajda |
| Salınma/havada | %4–8 | Ortada; göğüs %55–60 | Uzakta ve yukarıda; yatay hız yönüne bakıyor (pitch ≈ −18…−30°); cadde ve şehir geniş görünüyor; dönüşler 1–1,5 sn'ye yayılıyor |
| Dalış | %4–8 | Ortada | Daha dik aşağı bakıyor (≈ −35…−45°) |
| Duvara yapışma anı | ~%6 | Ortada | İlk ~0,4 sn duvara bakıyor; ~0,6–1 sn içinde duvardan uzaklaşıp yana dönüyor, ekranın %25–45'i şehir/cadde oluyor |
| Duvarda tırmanma/koşu | %6–10 | Ortada | Duvar boyunca gidilen yöne çapraz açıyla bakıyor. Aşağı inerken tepeden caddeye bakıyor (≈ −45…−60°), karakter ekranın alt kısmında |
| Duvardan ayrılış | – | – | Havadaki kadraja yumuşak geçiş |

## 2. Mimari: duruma göre profil değiştiren kamera
- Profiller: GROUND, COMBAT, AIR (salınma, havada, dalış), WALL, PERCH (E ile kenara konma).
- Her profil şu alanları içersin: karakterin ekranda kaplayacağı boy hedefi (frameHeight), pitch, lookAhead, yaw hizalama süresi (90° dönüşün süresi), pitch takip süresi, geçiş süresi, roll sınırı.
- Mesafeyi sabit bir metre değeriyle değil, kadraj hedefinden hesapla:
  - d = karakter boyu / (2 · frameHeight · tan(fovBase/2))
  - fovBase kullan. Hızla genişleyen FOV'u mesafeyle telafi etme; hız hissi kalsın.
  - Mesafeye bir alt ve üst sınır koy.
- Her karede işlem sırası:
  1. Oyuncunun durumundan hedef profili seç.
  2. Hedef yönü hesapla: fare + otomatik hizalama.
  3. Hedef pivot ve mesafeyi hesapla.
  4. Çarpışma: pivottan kameraya küre ışınıyla kontrol et. Engel varsa kamerayı hızlı içeri çek, engel kalkınca yavaşça geri aç.
  5. Son yumuşatma.
- Profiller arası geçiş ~0,5 sn ve kritik sönümlü olsun. Kamera hiçbir zaman tek karede kesmesin ya da zıplamasın.
- Bütün yumuşatmalar kare hızından bağımsız olsun (dt tabanlı).
- Profillerin hedef değerleri:
  - GROUND:
    - Hedef yön: yatay hız yönü (hız > ~2 m/s iken).
    - İleri ve çapraz harekette tam hizalama; yana harekette (60–120°) hizalama ×0,35; geri harekette (>135°) hizalama yok.
    - 90° dönüş 1,0–1,3 sn sürsün.
    - Bekleme süresi yok.
  - Fare önceliği (bütün profillerde):
    - Fare girdisi anında uygulanır.
    - Son fare hareketinden sonra 0,6 sn boyunca otomatik hizalama kapalı; sonra 0,4 sn içinde kademeli olarak devreye girer.
  - AIR:
    - Hedef yön: yatay hız yönü; 90° dönüş 1,2–1,5 sn.
    - Pitch dikey hıza göre: yükselirken ~−8°, normalde −18°, dalışta −40°'a kadar.
    - Salınım yayına doğru en fazla 5° yatma (roll). Yerde roll yok.
  - WALL:
    - Kamera hep duvarın dış tarafında kalsın (pivot + duvar normali · uzaklık + geri/yukarı ofset).
    - Kameranın bakış yönüyle duvarın içine doğru yön (−normal) arasındaki açı 35–60° olsun; kamera tam duvara bakmasın.
    - Yön: duvar boyunca gidilen yön. Duvarda hareketsizken: duvarın daha açık tarafına (cadde ya da şehir), bunu ışın testiyle bul.
    - Pitch: tırmanırken kamera aşağıda, yukarı bakar (+15…+30°); inerken yukarıda, aşağı bakar (−45…−60°); yatay koşuda −10…−20°.
    - Duvara ilk yapışmada önce 0,3–0,4 sn mevcut kadrajı koru, sonra ~0,8 sn içinde WALL profiline geç.
    - Fare duvarda serbest, ama kamera duvarın içine giremesin: pivottan kameraya doğru yön ile duvar normalinin nokta çarpımı ≥ 0,2.
  - COMBAT (dövüş durumunda ve ≤12 m içinde düşman varken):
    - Pivot yüksekliği artsın; pitch −18…−24°.
    - En yakın saldıran düşman kadrajda kalsın diye yaw'a yumuşak bir eğilim ver; karakter ortada kalsın.
  - PERCH:
    - ~1 sn içinde duvar normalinin dışına, şehre bakan geniş kadraja dön. Fare hareket ederse hemen devralsın.
- Engel ve saydamlık:
  - 1B'deki bina saydamlaştırması korunsun; ama oyuncunun üstünde durduğu duvar saydamlaşmasın.
  - Dar alanda mesafeyi kısalt ama pitch'i koru.
  - Çarpışma çözümü, WALL'daki "kamera hep duvarın dış tarafında" kuralını bozmasın.

## 3. Girdi referansı (karakterin spiral çizmesini önlemek için)
- Yerde WASD yönünü, kamera yaw'ının ayrı bir "girdi kopyasına" göre hesapla:
  - Bu kopya fare hareket edince anında güncellensin.
  - Basılı tuş değişince ya da bırakılınca güncellensin.
  - Tuş basılı tutulduğu sürece otomatik hizalamadan etkilenmesin.
- Sonuç: A basılıyken kamera arkaya dönse bile karakter düz sola gider, daire çizmez.
- F1'den açılıp kapatılabilsin; varsayılan açık.

## 4. Ayarlar ve hata ayıklama
- Kamera ön ayarı:
  - "Reference" (varsayılan): yukarıdaki davranış.
  - "Manual": otomatik hizalama yok; mesafe ve kadraj profilleri yine çalışır.
  - Bunlar Settings menüsünde ve F1 panelinde olsun.
- F1 → Camera:
  - Her profil için alt grup.
  - Girdi referansı anahtarı, duvar açısı, duvara yapışma gecikmesi.
  - "Copy values" butonu kalsın.
- F1'de açılıp kapanan hata ayıklama satırı:
  - Aktif kamera profili.
  - Karakterin ekran yüksekliği yüzdesi (karakterin sınır kutusu ekrana projekte edilerek ölçülsün).
  - Kamera mesafesi.
  - Otomatik hizalama açık mı.

## 5. Testler (Vitest, saf matematik)
- GROUND'da 90° hedef yaw'a %95 oranında 0,9–1,4 sn içinde ulaşılıyor. 30, 60 ve 144 FPS'te sonuçlar tolerans içinde aynı.
- Geri harekette (>135°) otomatik hizalama hiç uygulanmıyor.
- Fare girdisi sırasında ve sonraki 0,6 sn boyunca otomatik hizalama sıfır.
- Kadraj: fovBase ile karakter boyu GROUND'da %22–30, AIR'de %4–8, WALL'da %6–10.
- WALL: Yerleştikten sonra kamera hep duvar düzleminin dış tarafında; bakışla −normal arasındaki açı 35–60°; inişte pitch ≤ −40°.
- Profil geçişlerinde kamera konumu tek karede ani sıçrama yapmıyor (kare başı makul bir hız sınırı koy).
- Girdi referansı: Tuş basılıyken kamera hizalanırken karakterin dünya hareket yönü değişmiyor.
- Hız 0 ya da duvar normali yokken NaN üretilmiyor.

## 6. Kadraj sanatı (bu görevde yaratıcılığın yeri)
- Her durumu bir çizgi roman karesi gibi düşün: karakter okunaklı, ufuk düzgün (roll sınırlı), şehir ışıkları kompozisyonun parçası.
- Yeni efekt ekleme. Bu görevin başarısı kadrajın netliği.
- docs/art-direction.md'ye "Kamera kuralları" bölümü ekle: profiller, hedef sayılar ve ilkeler.

## 7. Rapor
- Kısa tut. Emirhan'a 5 adımlık bir deneme listesi ver:
  1. Caddede koş ve sağa dön: kamera beklemeden ~1 sn içinde arkana gelmeli.
  2. A'yı basılı tut: karakter düz gitmeli, daire çizmemeli.
  3. Salın: kamera uzaklaşıp şehri göstermeli.
  4. Bir binaya koşup tırman: ~1 sn içinde kamera yana açılıp şehri göstermeli. Duvarda aşağı in: caddeye tepeden bakmalı.
  5. Dövüş: düşmanlar kadrajda kalmalı.
- Hata ayıklama satırında her profil için ölçtüğün karakter boyu yüzdesini yaz.
- typecheck, test ve build geçmeli.
- NOTLAR.md'ye kısa bir kayıt ekle.