# Sanat yönetimi

Bu belge oyunun görsel ve "his" kurallarıdır. Aşama 1B'de yazıldı; sonraki bütün aşamalar buna uyar.
Yeni bir şey eklerken önce buraya bak, kuralı değiştiriyorsan burayı da güncelle.
Değerlerin çoğu `src/config/tuning.ts`'te; burada "neden"i ve sınırları yazıyor.

## Duygu hedefi

Gece yarısı şehir nefes alıyor; kahraman küçük ama durdurulamaz derecede hızlı; her önemli an bir çizgi roman karesi.

Üç soru, her yeni şey için:

1. Bu an bir çizgi roman karesi olsa nasıl kadrajlanırdı?
2. Oyuncu bunu en az iki kanaldan (görüntü + kamera ya da ses) hissediyor mu?
3. Ekrandaki en doygun renk hâlâ kahramanın mı?

## 1. Renk

### Palet (`src/config/palette.ts`)

| Rol | Renk | Not |
|---|---|---|
| Gece gökyüzü, sis | `#38164B` → `#895079` → `#CA9CB5` | Sakin şehir hep mor-pembe |
| Binalar | `#2A0D44`, `#401C4F`, `#261420`, `#563363`… | Koyu, düşük doygunluk |
| Pencereler | krem `#E9D1A2` (en sık), şeftali, sarı, pembe, camgöbeği | Sıcak ağırlıklı |
| Kanca (mod) | camgöbeği `#3FD6FF` + koyu mor `#2A0D44` | Ekranın en doygun rengi |
| Titan (mod) | kehribar `#FFA21F` + kömür `#2B2830` | Ekranın en doygun rengi |
| Suç | sıcak kırmızı `#FF4A2E`, turuncu `#FF8A2A` | Sadece suç ve tehlike için |
| Çete (The Static) | mor-siyah `#1E1626`, şerit `#FF3B6B`, beyaz maske `#EDE6DA` | Kahraman renklerini kullanmaz |
| Mürekkep | `#140A1C` | Konturlar, yazı gölgeleri |
| Kâğıt | `#F4E2B8` | Panel zemini, açık yazı |

### Renk dramaturjisi

- Sakin şehir mor-pembe. Suça yaklaştıkça sıcak kırmızı-turuncu artar: renk düzenlemesinde sıcak ton (`fx.crimeTint`), suçun çevresindeki neonlarda hızlanan titreşim, uzaktan alarm sesi. Hepsi `crime.tension` ile (uzaklığa göre 0..1).
- Mod renkleri (camgöbeği, kehribar) ekrandaki en doygun renktir. Bunları kahraman dışında bir şeye verme: bileklik, halat, zırh ışıkları, mod halkası, mod paneli, nişangâh vurgusu.
- Kırmızı-turuncu sadece suç, düşman uyarısı ("!!"), oyuncunun hasar alması ve suç ışık sütunu için.
- Kırmızı-mavi kostüm ve yeşil ışık yasak (BRIEF 2.8).

### Doz

- Bloom parlak noktalarda (lamba, neon, pencere, stop lambası, mod ışıkları). Geniş yüzeyler parlamaz.
- Işık sütunu uzaktan yol gösterir; yakında (25–95 m) kendini geri çeker (`crimeScene.ts`). Dövüş alanını asla örtmez.

## 2. Tipografi

- Yazı tipi yığını: `Impact, Haettenschweiler, 'Arial Black', 'Franklin Gothic Heavy', sans-serif`, italik, kalın. Sistem fontu; dosya eklenmez (telif ve boyut). Gövde metinleri `system-ui`.
- Başlıklar: mürekkep kontur (`-webkit-text-stroke`), arkada kaydırılmış renkli gölge ("baskı kayması": camgöbeği ve pembe), en arkada mürekkep gölge. Hafif sola eğim (`skewX(-8…-12deg)`).
- Kutular: mürekkep kenarlık 3–4 px, düz renk gölge 5–9 px (sağ alt), hafif eğim.

### Ses efekti yazıları (`src/ui/comicFx.ts`)

- Vuruşun gücü (`strength` 0..1) boyutu, eğimi ve titreşimi belirler: boyut `24 + 40·güç` px, eğim ±(8 + 10·güç)°, harf titreşimi ±(2 + 6·güç) px.
- Aynı kelime iki kez birebir aynı görünmez: renk, gölge rengi, eğim, yamulma ve her harfin kayması her seferinde yeniden seçilir.
- Kelimeler kendi seçimimiz, referans oyundakiler kullanılmaz. Türkçe yansımalar kimlik katar: "ŞAK!", "GÜM!", "KÜT!", "ÇEK!". Liste `src/i18n/en.json`'da (`comic.*`).
- Bir eyleme bir kelime. İki kelime üst üste binerse biri gider.
- Ekranın ortasını uzun süre kapatmaz: 0,55–1 sn içinde kaybolur.

## 3. Efektler ve ritim

### Patlama ve nefes

- Patlama anları: mod değişimi, son darbe, yere vuruş, süper kahraman inişi. Bunlarda donma, ağır çekim, kamera ve yazı birlikte çalışır.
- Nefes anları: çatıya konunca kısa sessizlik (rüzgâr kısılır, şehrin uğultusu öne çıkar, `Feedback` içinde `QUIET_TIME` 2,4 sn), suç durdurulduktan sonraki 5 sn.
- Aynı anda en fazla bir büyük ağır çekim. Küçük vuruşlarda sadece donma (hit-stop).

### Zaman

| An | Donma / ağır çekim | Ayar |
|---|---|---|
| Normal vuruş | 0,055 sn donma | `combat.hitStop` |
| Bitirici / K.O. | 0,1 sn donma | `combat.finisherHitStop` |
| Süper kahraman inişi | 0,07 sn donma | `fx.hitStop` |
| Karşı saldırı (Q) | 0,22 sn, ×0,3 | `Feedback.beat` |
| Mod değişimi | 0,3 sn, ×0,3 | `fx.modeSwitchSlowMo`, `fx.modeSwitchTime` |
| Suça varış | 0,4 sn, ×0,45 | `crime.arrivalBeat` |
| Son darbe | 1,2 sn, ×0,15 | `crime.finalBlowSlowMo`, `crime.finalBlowTime` |

### Pop-art dokusu

- Ben-Day noktaları: mod paneli, son darbe çerçevesi, menü zemini, banner köşesi. Okunurluğu bozacak yere (HUD sayıları, ipuçları) konmaz.
- Baskı kayması: sadece büyük başlıklarda ve ses efekti yazılarında.
- Kalın kontur: kahraman ve çete figürlerinde ters gövde (inverted hull), HUD kutularında 3–4 px.
- Çapraz panel çizgileri: mod paneli (çapraz kesik bant), menüde hız çizgileri.

### Geri bildirim (her eylem en az iki kanal)

| Eylem | Görüntü | Kamera | Ses |
|---|---|---|---|
| Vuruş | Yıldız patlaması, yazı, düşmanda beyaz parlama | Sarsıntı, küçük FOV vuruşu | `hit` |
| Karşı saldırı | Flaş, mavi yazı | FOV vuruşu, ağır çekim | `counter` |
| Hasar alma | Kırmızı kenar parlaması | Sarsıntı | `hurt` |
| Mod değişimi | Panel, halka, zırh takılması | FOV vuruşu | `transform` |
| Yere vuruş | Yer halkası, savrulan arabalar | Büyük sarsıntı | `shockwave` |
| Kenara konma | Toz | Sinematik çekim | Sessizlik + uğultu |
| Suça varış | Anlatı kutusu, çete liderinin balonu | Görüş açısı vuruşu, kısa ağır çekim | `alert` |

## 4. Kamera

- Yerden en az `camera.groundClearance` (1,1 m) yukarıda. Daha yukarı bakmak kamerayı alçaltmaz, bakışı yukarı eğer.
- Kamera ile kahraman arasına giren bina (çatı eşyaları ve suç sahnesindeki araçlar da) zıplatılmaz, delik gibi yarı saydam olur (`GLSL_XRAY`, `camera.xray`). Kol sadece kameranın kendisi binanın içine düşecekse kısalır.
- Duruma göre kadraj (`followCamera.ts`): salınırken geri ve yukarı (şehri göster), yerde yakın, duvarda koşarken yana kayık, dövüşte geniş.
- Fare her zaman önceliklidir: fare kıpırdayınca sinematik çekim biter.
- Sinematik çekimler (`CameraShot`): üçte bir kuralı (kahraman bir yanda, şehir öbür yanda), en fazla 0,12 rad eğik açı, alçak açı sadece kısa anlarda. Süreler 1,2–1,7 sn.
- Sarsıntı travma tabanlı, kapatılabilir (`camera.shake`).

## 5. Animasyon

- Pozlarla düşün: her hareket hazırlık (geri çekilme) → abartılı uç poz → yerine oturma. Dövüşte poz geçişi hızlıdır (`ACTION_POSE_RATE`), böylece uç poz okunur.
- "Animate on twos": figür pozları saniyede 12 kez güncellenir, kamera ve dünya akıcı kalır. Yeni figürler de buna uyar (`TWOS_RATE`).
- Silüet önce: poz, kahraman ekranda küçükken de okunmalı (kollar gövdeden ayrık, bacaklar açık).
- Titan ağırdır: geniş duruş, alçak kalça, daha uzun adım, iki yumrukla iniş. Kanca hafif ve akışkandır.
- Düşman saldırısı her zaman büyük bir hazırlıkla gelir ("!!" + kolun geriye gitmesi). Karşı saldırı penceresi bu hazırlık süresidir.
- Figürler koddan, ilkel şekillerden (`FigureBuilder`); tek iskeletli mesh + kontur. Yeni parça eklemek çizim çağrısı eklemez.
- Poz açılarında pozitif X her eklemde "öne" demek: kollar ve bacaklar öne, gövde ve boyun öne eğilir (figür −Z'ye bakar; gövde ve boyun için işaret kodda çevrilir, `POINTS_UP`). Bütün gövdenin devrilmesi (`alignPitch`, `bodyPitch`) ise düz döndürmedir: pozitif = geriye. `heroFigure.test.ts` bunu denetler.
- Ağır çekim, dünya saatiyle çalışan parlamaları da uzatır. Ağır çekimli anlarda beyaz parlamalar küçük ve kısa olmalı, yoksa kare yıkanır (son darbede öyle oldu, düzeltildi).

## 6. Arayüz

- Çizgi roman ama okunaklı: HUD sayıları ve ipuçları düz zemin üstünde, yüksek kontrast, gölgeli.
- Yerleşim: sol üst suç sayacı ve hedef, sağ üst mini harita, sol alt mod halkası + can + durum, sağ alt hız, alt orta ipucu, orta nişangâh.
- İpuçları kısa ve bağlama göre; en fazla 3–4 tuş.
- Önemli an gelince HUD çekilir (son darbe çerçevesinde gizli).
- Menü açıkken (duraklatma) çizgi roman katmanı ve eğitim kartı gizlenir; menünün yarı saydam zemininden yazılar görünüp kalabalık yapmasın.
- Tek seferlik CSS animasyonları bitince sınıflarını bırakır; yoksa HUD gizlenip açılınca baştan oynar.
- FPS satırı sağ altta, hızın altında: eğitim kartına ve panellere değmez.
- Bütün metinler `src/i18n/en.json`'da.

## 7. İmza anlar

| An | Ne olur | Kapatma |
|---|---|---|
| Havada mod değişimi | Çapraz panel + noktalar, güç halkası, ağır çekim, zırhın parça parça takılması | Ayarlar → Cinematic moments; F1 → Effects → Mode switch show |
| Son darbe | Ağır çekim, sinema çerçevesi, altyazı kutusu, "LIGHTS OUT!" | Ayarlar → Cinematic moments; F1 → Crime → Last blow: slow-mo frame |
| Kenara konma | Cadde boyunca bakan kısa çekim, sessizlik ve şehir uğultusu | Ayarlar → Cinematic moments; F1 → Camera → Ledge landing shot |
| Suça varış | Kısa ağır çekim, "4 OF THEM. ONE OF YOU." anlatı kutusu, hızlı yakınlaşma, liderin laf atması | Ayarlar → Cinematic moments; F1 → Crime → Arrival: beat and caption |
| Açılış ekranı | Kenarda çömelmiş kahraman, yavaş dönen kamera | — |

## 8. Yeni bir şey eklerken kontrol listesi

- [ ] İki kanaldan geri bildirim var mı?
- [ ] En doygun renk hâlâ kahramanın mı? Kırmızı-turuncu sadece tehlike için mi?
- [ ] Ayarı `tuning.ts`'te ve F1 panelinde mi? Kapatılabilir mi?
- [ ] Ekran görüntüsüne sanat yönetmeni gözüyle bakıldı mı (kalabalık, okunaksız, örtülen bir şey var mı)?
- [ ] Telif: dış varlık yoksa iyi; varsa `ASSETS.md`'de ve ticari kullanıma açık mı?
