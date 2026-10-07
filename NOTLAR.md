# Notlar

Oturum günlüğü. Her oturumun sonunda en üste yeni bir kayıt eklenir (en yeni kayıt üstte).
Sonraki ajan sohbet geçmişini görmez; bağlam bu dosya, `BRIEF.md` ve `PLAN.md`'dir.

## Kayıt şablonu

```markdown
## AAAA-AA-GG — Aşama X: kısa başlık
- **Ajan / ortam:**
- **Branch / PR:**
- **Ne yapıldı:**
- **Ne kaldı:**
- **Bilinen sorunlar:**
- **Sıradaki adım:**
```

---

## 2026-10-07 — Aşama 1B: modlar, ilk suç ve dövüş, HUD, menü

- **Ajan / ortam:** Claude Code (bulut). Ubuntu 24.04, Node 22, ekran kartı yok.
- **Branch / PR:** `claude/ecstatic-bardeen-6fncjx` → `main`, [PR #3](https://github.com/eyasar23/sixoctober/pull/3).
- **Vercel:** PR'ın derlemesi başarılı (durum: Ready). Önizleme: https://sixoctober-git-claude-ecstatic-bardeen-6fncjx-emirhan-45f6.vercel.app
  Ajan linki açamıyor (ağ politikası `*.vercel.app`'i engelliyor, 403); oyunun orada açıldığını Emirhan doğrulamalı.
- **Görev metni:** `docs/asamalar/asama-1b.md`. **Sanat yönetimi belgesi:** `docs/art-direction.md` (yeni). Bundan sonra renk, yazı, efekt, kamera ve animasyonla ilgili her iş bu belgeye uyar; kural değişirse belge de güncellenir.
- **Yeni bağımlılık:** yok.

### Ne yapıldı

**1A geri bildirimleri**

- **A1 Halat:** yere değince ya da Shift bırakılınca kopar ve 0,25 sn'de bileğe geri sarılır (`rope.retractTime`). Sebep: iniş durumu değiştiriyor ama "halat bırakıldı" olayı çıkmıyordu; görsel halat bağlı kalıyordu. Artık her durum değişiminde `detachRope` çağrılıyor (testli).
- **A2 Kamera** (`src/player/followCamera.ts` baştan yazıldı):
  - Kamera yerden en az 1,1 m yukarıda. Aşağıdan bakış sınırlı (`camera.minPitch`); daha da yukarı bakınca kamera alçalmıyor, bakış yukarı eğiliyor.
  - Araya giren bina artık kamerayı zıplatmıyor: kahramanın çevresi noktalı (dither) bir delikle yarı saydam oluyor (`GLSL_XRAY`, `camera.xray`). Kol sadece kamera binanın içine düşecekse kısalıyor.
  - Fare tekerleği: yakın / orta / uzak. Fare 1,5 sn boşta kalınca kamera yavaşça hareket yönünün arkasına dönüyor (Ayarlar → "Camera turns behind you").
  - Duruma göre kadraj: salınırken geri ve yukarı, yerde yakın, duvarda koşarken yana kayık, dövüşte geniş.
- **A3 Bak ve fırla:** ortada küçük nişangâh. Nişangâhın altındaki çatı kenarı parlıyor, nişangâhın altında "E" çıkıyor. E: halat kahramanı kenara çeker, kenarın üstüne çömelir (`perch` durumu). Kenardan Space ile ileri atlayıp Shift ile salınıma geçiliyor. Menzil 80 m (`rope.launchRange`). Kenar seçimi `src/player/grapple.ts` → `findLedge` (testli).
- **A4 Eğitim** (`src/game/tutorial.ts`): ilk açılışta 8 adım: sprint → zıplama → havada Shift ile salınma → bırakıp fırlama → E ile çatıya → duvarda koşma → mod değişimi → yumruk/tekme (idman mankeni çıkıyor). Enter adımı geçer, Backspace eğitimi bitirir; menüden "TUTORIAL" ile yeniden başlar. H kontrol kartını açıp kapatır. Bağlam ipuçları kısaldı.

**Yeni özellikler**

- **B1 ModeBand + Titan** (`src/modes/`): modlar eklenti gibi; yeni mod = `modes/` altında bir tanım dosyası + `MODE_LIST`'e bir satır. Tab ya da 1/2 ile geçiş.
  - Geçiş 0,3 sn: çapraz çizgi roman paneli, nokta deseni, güç halkası, kısa ağır çekim, kostüm renklerinin değişmesi, zırh parçalarının tek tek takılması. Havada da çalışıyor, hız korunuyor (testli). Salınırken Titan'a geçince halat bırakılıyor; C'ye basınca kahraman yere çakılıyor.
  - **Kanca:** mevcut camgöbeği set. Dövüşte E ile düşmanı halatla kendine çeker.
  - **Titan (kehribar):** ağır ve yavaş koşu (32/48 km/h), Space basılı tutup bırakınca güçlü zıplama (3–32 m), havada C ile yere vuruş: 15 m'lik şok dalgası arabaları ve düşmanları savurur. Halat yok, duvara yavaş tırmanır. Vuruşları ağır ve alan hasarlı. Hoodie'nin üstünde zırh parçaları, daha geniş duruş. Değerler F1 → Titan.
- **B2 HUD v1** (`src/ui/hud.ts`, `src/ui/minimap.ts`): durum, hız, can barı, mod halkası (mod renginde), suçun uzaklığı ve yönü, yuvarlak mini harita (bloklar, oyuncu oku, suç işareti), kısa ipuçları, düşmanların üstünde "!!", can ve K.O. işaretleri, kombo sayacı, Titan'ın şarj göstergesi. Ayarlar → "Show HUD" ile gizlenir.
- **B3 Suç ve dövüş** (`src/crime/`, `src/combat/`):
  - Suç 250–450 m uzakta, gökyüzüne uzanan kırmızı ışık sütunuyla başlıyor. Sahne: zırhlı araç soygunu, kendi çetemiz **The Static** (mor-siyah ceket, pembe bant, beyaz maske; 3 eleman + 1 iri "brute"). Bitince "CRIME STOPPED!" paneli, sayaç, 5 sn sonra başka yerde yeni suç.
  - Suça yaklaştıkça gerilim: renk düzenlemesi sıcak kırmızıya kayar, çevredeki neonlar hızlı titrer, uzaktan alarm sesi gelir (`crime.tension`).
  - Dövüş: sol tık yumruk, sağ tık tekme, 3 vuruşluk kombo (üçüncüsü bitirici), hedefe doğru atılma. Düşman saldırmadan önce "!!" çıkıyor; Q ile karşı saldırı. Vuruşta donma (hit-stop), sarsıntı, geri savrulma, K.O., kendi ses efekti kelimelerimiz (Türkçe yansımalar dahil: ŞAK!, KÜT!, GÜM-BÜM!).
  - Düşman yapay zekâsı (`src/combat/enemy.ts`, testli durum makinesi): yaklaş, çevrende dolan, uyar, saldır, toparlan, sersemle, savrul, yere düş, kalk, K.O. Aynı anda en fazla bir düşman saldırır (`combat.maxAttackers`).
  - Oyuncu hasar alıyor; 4 sn vuruş almazsa can yenileniyor. Can biterse 2,4 sn sonra yakındaki güvenli noktada doğuyor.
  - Düşman vuruşu sadece aynı yükseklikteki kahramana ulaşıyor (`combat.attackHeight`); çetenin üstünden salınan kahraman vurulmuyor.
- **B4 Açılış ekranı ve menü** (`src/ui/menu.ts`): kodla çizilmiş çizgi roman başlığı (yıldız patlaması, nokta deseni, hız çizgileri, dış görsel yok), geçici ad "PROJECT SIXOCTOBER". PLAY / TUTORIAL / CONTROLS / SETTINGS. Esc ile duraklatma menüsü. Ayarlar (`src/game/settings.ts`, tarayıcıda saklanır): grafik kalitesi, kare hızı (Film 24 / 30 / Smooth), animate on twos, fare hassasiyeti, Y ters, kamera arkaya dönsün, ekran sarsıntısı, ses, HUD, sinematik anlar.
- **C İmza anlar** (hepsi Ayarlar → "Cinematic moments" ve F1'den kapatılabilir):
  1. Havada mod değişimi şovu (yukarıda).
  2. Son darbe: son düşmana vurunca ağır çekim, sinema çerçevesi, "MEANWHILE, ON THE AVENUE…" altyazı kutusu, "LIGHTS OUT!".
  3. Kenara konma çekimi: E ile kenara konunca cadde boyunca bakan kısa çekim; rüzgâr kısılır, şehrin uğultusu öne çıkar.
  4. Suça varış: çete uyanınca kısa ağır çekim, "4 OF THEM. ONE OF YOU." anlatı kutusu, hızlı yakınlaşma, liderin laf atması.
  5. Açılış ekranı: kenarda çömelmiş kahraman, yavaşça dönen kamera.
- **Figürler** (`src/figures/articulated.ts`): kahraman ve çete tek iskeletli mesh + kontur olarak koddan kuruluyor (figür başına 2 çizim çağrısı). Renkler "slot" ile değişiyor; kostüm değişimi yeni malzeme gerektirmiyor.
- **Testler:** 73 Vitest testi (1A'da 36). Yeni: mod değişiminde hız korunuyor, kombo zamanlaması, düşman durum makinesi geçişleri, "bak ve fırla" hedef seçimi, inişte halat kopuyor, tam dövüş senaryosu, düşman vuruşunun yükseklik sınırı, pozların doğru yöne eğilmesi. Duman testi `tools/smoke/stage1b.mjs` (aşağıda).

### Ölçümler (duman testi, yazılım WebGL)

- `tools/smoke/stage1b.mjs` geçiyor (yaklaşık 9–10 dakika): başlık ekranı → eğitimin ilk adımları → nişangâhla kenar bulup E ile kenara konma → kenardan atlayıp salınma → havada Titan'a geçiş → yere vuruş → suçun caddesinin 230 m gerisinden salınarak suça varış → dövüşü bitirme. NaN yok, şehirden düşme yok, sayfa hatası yok.
- Havada Titan'a geçiş: hız 21,6 → 22,8 m/s (halat bırakılıyor, hız korunuyor; düşerken yerçekimiyle biraz artıyor).
- Dövüş (betik "!!" görünce Q'ya basıyor; son iki koşu): 14–17 isabet, 3–6 karşı saldırı, 2–3 halatla çekme, 4 K.O., suç durduruldu.
- Çizim çağrısı 55–61 (dövüşte 4 düşmanla), yaklaşık 172 bin üçgen, simülasyon adımı 0,03–0,04 ms. 1A'da 75 çizim çağrısıydı; kahraman tek iskeletli mesh + kontur olunca azaldı. Her düşman 2 çizim çağrısı.
- Aşama 1A duman testi (`tools/smoke/stage1a.mjs`) yeni açılış akışıyla da geçiyor: salınma ortalaması 131 km/h (en fazla 175), dalış 172, tırmanma en fazla 21 km/h. (`docs/previews/asama-1a/` görüntülerinin üzerine yazar; 1A kaydı olarak kalmaları için commit'lenmedi.)
- Gerçek ekran kartında FPS ölçülmedi; yazılım render'ında saniyede 2–6 kare (bir şey göstermez).

### Sonraki ajan için teknik notlar

- `src/main.ts` sadece bileşenleri bağlıyor. Olaylardan efekt, ses, kamera ve yazıya giden her şey `src/game/feedback.ts`'te ("her eylem en az iki kanal" kuralı burada).
- Simülasyon sırası her sabit adımda: girdi → `combat.step` → `sim.step` → şok dalgaları → `crime.step`. Dövüş hareketleri simülasyonda `action` durumu (`startAction`); düşmanlar simülasyondan bağımsız ama aynı çarpışma dünyasını kullanıyor.
- Mod değeri değişince `sim.setMode` çağrılır; hız ellenmez, sadece duruma özel geçişler yapılır (salınım → havada, dalış → yere vuruş). Mod hareket değerleri `tuning.movement` üstüne yazılır (`refreshMovement`), yani F1'deki Movement değerleri Kanca'nındır, Titan'ınkiler F1 → Titan'da.
- Titan'da Shift havada bir şey yapmaz (halat yok); zıplama tuşu basılı tutulunca `charge` durumu.
- Arabalar GPU'da hareket ediyor; şok dalgası sadece shader'daki savrulma uniform'u (`traffic.shock`). Suç sahnesinin çevresinde trafik kesiliyor (`setClearZone`).
- Ses efekti yazıları ve paneller DOM/CSS (`src/ui/comicFx.ts`, `comic.css`); 3D sahneye çizim çağrısı eklemiyor.
- Kare hızı sınırı (`loop.maxFps`) ilk kare süresi eksi çıkınca kamerayı fırlatıyordu; kare süresi artık 0'ın altına inmiyor.
- Poz açıları: pozitif X her eklemde "öne" (figürler −Z'ye bakar). Gövde ve boyun yukarı baktığı için onlarda işaret uygulanırken çevriliyor (`POINTS_UP`). 1A'dan beri gövde eğimleri ters çalışıyordu (sprint ve çömelme geriye yaslıyordu); bu oturumda düzeldi, `heroFigure.test.ts` denetliyor. Bütün gövdenin devrilmesi (`alignPitch`, `bodyPitch`) düz döndürme: pozitif = geriye.
- HUD'daki tek seferlik CSS animasyonları bitince sınıfını bırakıyor (`replay` + `animationend`). Bırakmazsa HUD gizlenip açılınca animasyon baştan oynuyor.
- Efektler (`FxPool`) ve düşmanın vuruş parlaması dünya saatiyle çalışıyor; ağır çekim onları da uzatıyor. Ağır çekimli anlarda parlamaları kısa tut.
- `?test` kancaları genişledi: `window.__game.combat`, `crime`, `tutorial`, `menu`, `gameState()`, `play()` (eğitimsiz başlatır).
- Ayarlar tarayıcıda `sixoctober.settings.v1`, eğitim bilgisi `sixoctober.tutorialDone` anahtarında. Eğitimi baştan görmek için menü → TUTORIAL.

### Ne kaldı

- Emirhan'ın önizlemede görsel kontrolü ve his anketi (PR'da).
- Gerçek ekran kartında FPS ölçümü.

### Bilinen sorunlar

- Halat salınım sırasında binaların içinden geçebilir (sarılma yok). Duvarda koşma ve tırmanma köşeyi dönmüyor (1A'dan).
- Lamba direkleri, tabelalar ve arabalar çarpışmasız. Şok dalgası arabaları sadece görüntüde savuruyor (shader); kahramana ya da düşmana çarpmıyorlar.
- Düşmanlar tırmanamıyor, halat kullanmıyor: kahraman çatıdayken aşağıda bekliyorlar (Kanca'da E ile çekilebilirler).
- "Bak ve fırla" sadece 80 m menzildeki, üstü boş kenarlarda çalışıyor; çok yüksek kulelerin tepesi menzil dışında.
- Titan'la şehirde dolaşmak bilerek yavaş (halat yok); anket cevabına göre ayarlanacak.
- Duman testi suça gidişi suçun caddesinin 230 m gerisinden başlatıyor (kahramanı oraya koyuyor). Betik salınma hızında köşe dönemiyor; kavşaklardan geçen rota denemeleri yön kaybetti. Oyuncu için bir sorun değil, betiğin sınırı.
- Başsız tarayıcıda son darbenin sinema çerçevesi ve "CRIME STOPPED" paneli geç görünüyor (sayfa saniyede 2–6 kare çiziyor, CSS geçişleri kare kare ilerliyor). Gerçek ekran kartında zamanlamaya bakılmalı.
- JS paketi 984 KB (gzip'li 298 KB); Vite'nin boyut uyarısı three.js ve postprocessing'den.

### Sıradaki adım

Aşama 2 (his ayarı): Emirhan'ın 1B his anketi cevapları ve F1 "Copy values" çıktısıyla salınma, kamera, dövüş zamanlaması ve mod geçişi ayarlanır.

## 2026-10-06 — Aşama 1A: hareket çekirdeği ve görsel stil

- **Ajan / ortam:** Claude Code (bulut). Ubuntu 24.04, Node 22, ekran kartı yok.
- **Branch / PR:** `claude/ecstatic-bardeen-6fncjx` → `main`, [PR #2](https://github.com/eyasar23/sixoctober/pull/2). Branch kuralı değişti: bulut oturumunun atadığı branch kullanılır, sorulmaz.
- **Vercel:** PR'ın derlemesi başarılı (durum: Ready). Önizleme: https://sixoctober-git-claude-ecstatic-bardeen-6fncjx-emirhan-45f6.vercel.app
  Ajan linki açamıyor (ağ politikası `*.vercel.app`'i engelliyor); oyunun orada açıldığını Emirhan doğrulamalı.
- **Görev metni:** `docs/asamalar/asama-1a.md`.
- **Bu oturumda Emirhan'ın kararları:** branch kuralı yukarıdaki gibi; BRIEF Bölüm 1'deki kararların hepsi onaylandı. Kahramanın adı hâlâ yok.

### Ne yapıldı

- **Hareket çekirdeği** (`src/player/playerSim.ts`): durumlar Grounded, Airborne, Swinging, Zip, WallRun, WallClimb, Mantle, Dive, Landing. Saniyede 120 sabit adım (`src/core/loop.ts`), çizim adımlar arasında enterpole ediliyor; T ile ağır çekim.
  - Koşu: ivmelenme eğrisi, frenleme, dönüşte hafif kayma, inişten gelen fazla hızın yavaş erimesi. Coyote time, zıplama tamponu, basılı tutma süresine göre zıplama yüksekliği.
  - Çarpışma: eksene hizalı kutular üzerinde süpürmeli çarpışma ve kayma (`src/world/collision.ts`, `src/player/mover.ts`). 100 m/s'de bile duvar delinmiyor. Kaldırım ve parapet gibi basamaklar otomatik aşılıyor.
  - Halat (`src/player/grapple.ts`): bağlantı noktası gidilen yönde, önde ve yukarıda, görüş hattı açık bir cephe noktası olarak seçiliyor; sağ/sol sırayla değişiyor. İp gerilince uzamıyor, gevşeyince sarkıyor. Konum tabanlı kısıt kullanılıyor, enerji eklemiyor (testli). WASD ile pompalanabiliyor.
  - Salınım düzlemi yardımı: halat cepheye çizilir, ama fizik dönme noktası hareket düzlemine kaydırılır. Böylece salınım duvara değil cadde boyunca akar. Bu olmadan zincir duvarlara çarpıp bozuluyordu.
  - Shift basılıyken salınım yay sonunda kendiliğinden bırakılır (ileri ve yukarı itkiyle) ve tepe noktasında yeni halat atılır. Uzun caddede durmadan salınma buradan geliyor.
  - Zip: nişangâhtaki noktaya çekilme. Çatı kenarına gelirse kenarın üstüne çıkar ve hızın bir kısmını korur; duvara gelirse duvara yapışır.
  - Dalış: C ile. Shift ile dalıştan salınıma geçiliyor.
  - Duvarda koşma: yeterli hız ve sığ açıyla, Shift basılıyken. Duvardan sıçrama da var.
  - Tırmanma ve mantle: duvara doğru basınca tırmanma; tepeye varınca çatıya otomatik çıkış. Alçak engellerin üstünden atlama da aynı yolla oluyor.
  - İnişler: yumuşak, çömelme, yuvarlanma (hızı korur) ve süper kahraman inişi (sarsıntı, toz, kısa donma anı, "THUD!" yazısı).
  - R son güvenli noktaya döndürür. NaN, sahne dışına çıkma ya da düşme olursa otomatik geri dönülür.
- **ModeBand** (`src/modes/modeBand.ts`): mod tanımları ve yetenek bayrakları. Simülasyon her yeteneği moda göre açıp kapatıyor. Titan şimdilik yer tutucu; geçiş 1B'de.
- **Kamera** (`src/player/followCamera.ts`): yaylı kol, binalara girmez. Hızla genişleyen görüş açısı ve kol, salınırken halat tarafına yatma, duvarda koşarken duvardan uzağa yatma, ileri bakış, fare boştayken hareket yönüne dönme, tırmanırken duvara bakış, travma tabanlı sarsıntı, açılışta yaklaşma.
- **Efektler** (`src/fx/`): bloom, Neutral ton eşleme, renk düzenlemesi, SMAA, hızla artan kromatik aberasyon, çizgi roman hız çizgileri (kendi shader'ımız, saniyede 12 kez yenilenir), vinyet. Kalite ön ayarları Low/Medium/High + Auto (`src/config/quality.ts`).
- **Şehir v1** (`src/world/cityGen.ts` veri, `src/world/render/` çizim):
  - 1040 m × 1040 m. Merkezde gökdelen kümesi, kenarlara doğru alçalan binalar; ana cadde (x = 0) uzun ve yüksek duvarlı bir salınma koridoru.
  - Başlangıç kulesi ana caddenin güney ucunda; ilk karede cadde boyunca şehrin merkezine bakılıyor.
  - Basamaklı kuleler; çatılarda parapetler, su depoları, klimalar ve yanıp sönen antenler.
  - Pencereler bina shader'ında çiziliyor: renk sıcaklığı çeşitliliği, ara sıra yanıp sönen pencereler, zemin katta vitrin bantları; uzakta ortalama parıltıya dönüyor.
  - Yol çizgileri ve yaya geçitleri zemin shader'ında. Kaldırımlar, lambalar ve altlarında sıcak ışık havuzları var.
  - Uydurma markalı neon tabelalar ve 5 desenli hareketli reklam ekranları (marka adları `src/i18n/en.json`'da). GPU'da akan trafik ve ufukta üç katmanlı silüet.
- **Kahraman** (`src/player/heroFigure.ts`): eklemli figür, koddan pozlar, "animate on twos", mürekkep konturu, halatı bırakınca takla. Halat şeridi `src/player/ropeVisual.ts`'te; gölge lekesi ve toz `src/fx/heroFx.ts`'te.
- **Arayüz:** `src/ui/hud.ts` (durum etiketi, ipucu, hız, halat ve zip işaretleri, NO ANCHOR, başlangıç ekranı). F1 paneli `src/ui/debugPanel.ts`'te; gruplar Movement / Rope / Camera / Effects / City / Quality, içinde çizim çağrısı, üçgen ve FPS sayaçları var.
- **Ses** (`src/audio/sound.ts`): Web Audio ile kodla üretilmiş rüzgâr, halat, zip, iniş ve yakın geçiş sesleri; panelden kapatılabiliyor.
- **Testler:** 36 Vitest testi (halat enerjisi, bağlantı seçimi, durum geçişleri, şehir tekrarlanabilirliği, çarpışma, tam şehirde betikli koşu). Ayrıca duman testi `tools/smoke/stage1a.mjs`: başsız Chromium'da gerçek tuşlarla rota oynuyor ve `docs/previews/asama-1a/` altına görüntü kaydediyor.

### Ölçümler (duman testi, yazılım WebGL)

- Hızlar (km/h): koşu 46, sprint 70, salınma ortalaması 133 (en fazla 175), dalış 171, tırmanma 21 (Shift ile 25), duvarda koşu 80 civarı (giriş hızı korunur, sonra 80'e iner).
- Çizim çağrısı 75 (efekt geçişleri ve kahramanın parçaları dahil), yaklaşık 165 bin üçgen, simülasyon adımı 0,03 ms.
- Gerçek ekran kartında FPS ölçülmedi. Yazılım render'ında 4–8 FPS, bu bir şey göstermez.

### Sonraki ajan için teknik notlar

- Bütün sabitler `src/config/tuning.ts`'te. Hızlar km/h, ivmeler "kaç saniyede" cinsinden.
- Simülasyon render'dan bağımsız (`PlayerSim` + `SimInput`), Node'da test edilebiliyor. Olaylar `sim.events` ile `main.ts`'e geliyor; efekt, ses ve HUD bunları tüketiyor.
- `?test` adresinde `window.__game` test kancaları açılıyor (`setLockstep`, `simTime`, `telemetry`, `stats`, `cameraRig`). `?seed=` başka şehir, `?quality=` sabit kalite.
- Pencere shader'ında örnek başına değerler `flat` geçiyor ve hash tam sayı tabanlı (`hashInt`). Kayan noktalı hash, enterpole edilen tohumla pencerelerde yatay çizgiler yapıyordu.
- Kamera iniş yayı küçük sabit alt adımlarla entegre ediliyor. Kare süresiyle entegre edilince düşük FPS'te patlıyordu.
- Shader kaynaklarında ASCII dışı karakter kullanma (bazı sürücüler reddediyor).
- Aşama 0'ın Blender figürü (`public/assets/test/test_figure.glb`) artık sahnede değil; yerini koddan yapılan figür aldı. Dosya ve betik hat örneği olarak duruyor.

### Bilinen sorunlar

- Halat salınım sırasında binaların içinden geçebilir; sarılma (wrapping) yok. Bağlantı anında görüş hattı kontrol ediliyor.
- Duvarda koşma ve tırmanma köşeyi dönmüyor; köşede bırakıyor.
- Lamba direkleri, tabelalar ve arabalar çarpışmasız. Arabalar kavşaklarda birbirinin içinden geçiyor (1A kapsamı: sadece canlılık).
- Dalışta hız sınırı (175 km/h) yüzünden yatay hız düşüyor, dalış dikleşiyor.
- JS paketi 860 KB (gzip'li 259 KB); Vite uyarısı three.js ve postprocessing boyutundan geliyor.

### Sıradaki adım

Aşama 1B: bileklikle Titan'a geçiş, oynanış HUD'u, ilk suç sahnesi ve dövüş, açılış menüsü. Önce Emirhan'ın PR #2'deki his anketi cevaplarına ve F1 "Copy values" çıktısına göre `tuning.ts` güncellenmeli.

## 2026-10-06 — Aşama 0: kurulum ve hat testi

- **Ajan / ortam:** Claude Code (bulut). Ubuntu 24.04, Node 22, 4 çekirdek, 16 GB RAM, ekran kartı yok.
- **Branch / PR:** `claude/ecstatic-bardeen-6fncjx` → `main`, [PR #1](https://github.com/eyasar23/sixoctober/pull/1). Brief'teki ad `asama-0-kurulum`; bulut oturumu kendi branch'ini atadığı için Emirhan oturum branch'ini seçti.
- **Vercel:** PR'ın derlemesi Vercel'de başarılı (durum: Ready). Önizleme (branch'in son sürümünü gösterir): https://sixoctober-git-claude-ecstatic-bardeen-6fncjx-emirhan-45f6.vercel.app
  Bu bulut ortamının ağ politikası `*.vercel.app` adreslerini engelliyor; ajan linki açamadı. Sahnenin orada açıldığını Emirhan doğrulamalı.
- **Bu oturumda Emirhan'ın verdiği kararlar:**
  - Ekrandaki yazılar İngilizce ve `src/i18n/en.json`'da ("Stage 0 — pipeline test"); hız birimi `km/h`.
  - Vercel projesi repoya bağlı.

### Ne yapıldı

- **İskelet:** Vite 8 + TypeScript 7 (strict) + three 0.186 + postprocessing 6.39 + lil-gui 0.21 + Vitest 5. Betikler: `dev`, `build` (tip kontrolü + derleme), `preview`, `test`, `typecheck`. Sadece içi dolu klasörler açıldı.
- **Belgeler:** `AGENTS.md`, `CLAUDE.md`, `PLAN.md`, `NOTLAR.md`, `ASSETS.md` (boş tablo), `README.md`, `vercel.json`.
- **Test sahnesi** (`src/`):
  - `config/tuning.ts`: bütün ayar sabitleri, açıklamalı. `config/palette.ts`: BRIEF 4.1 renkleri.
  - `world/testCity.ts`: tohumlu, saf veri üreticisi (32 bina ve yanan pencereler). `world/testCityMesh.ts`: bunu iki InstancedMesh'e çevirir (binalar için 1, pencereler için 1 çizim çağrısı).
  - `world/atmosphere.ts`: gradyan gökyüzü kubbesi, ufuk rengiyle aynı mor-pembe üstel sis, ızgaralı lavanta zemin, ışıklar.
  - `fx/postFx.ts`: EffectComposer (half-float, 4x MSAA) + Bloom + Neutral ton eşleme.
  - `player/player.ts`: kapsül; WASD (kameraya göre), Space ile zıplama, binalara karşı basit kutu çarpışması. `player/followCamera.ts`: pointer lock ile fare kamerası.
  - `ui/overlay.ts`: sol üstte etiket, hız (km/h) ve FPS. `ui/debugPanel.ts`: F1 paneli (koşu hızı, zıplama gücü, yerçekimi, kamera mesafesi, görüş açısı, fare hassasiyeti, bloom, pencere parlaklığı, sis, FPS aç/kapa) + "Copy values" (JSON'u panoya kopyalar; olmazsa pencerede gösterir).
  - Blender figürü (`public/assets/test/test_figure.glb`) kapsülün 2 m sağına yükleniyor; dosya yoksa sahne yine çalışır.
- **Kontroller:** `npm run typecheck`, `npm run test` (3 test: aynı tohum aynı şehir, farklı tohum farklı şehir, ~30 bina ve boş meydan) ve `npm run build` geçti.
- **Başsız tarayıcı testi:** Chromium'da yazılım WebGL'iyle (SwiftShader) çalıştırıldı. Sahne açılıyor, W ile hız 43 km/h oluyor, F1 paneli açılıp kapanıyor, "Copy values" panoya geçerli JSON kopyalıyor, konsolda hata yok. Ekran görüntülerinde gökyüzü, sis, binalar, renkli pencereler, kapsül ve Blender figürü göründü. Bloom açık/kapalı karşılaştırmasında pencerelerde parlama var. Bu, gerçek ekran kartındaki görüntünün ve FPS'in yerini tutmaz.

### Blender bulut testi: başarılı

- `apt-get update && apt-get install -y blender`: 27 saniyede kuruldu (Blender 4.0.2, paket `4.0.2+dfsg-1ubuntu8`).
- İlk dışa aktarma hata verdi: `ModuleNotFoundError: No module named 'numpy'`. Ubuntu'nun Blender paketi, glTF dışa aktarıcının istediği numpy'yi kurmuyor. Çözüm aynı resmî Ubuntu deposundan: `apt-get install -y python3-numpy` (5 sn).
- Sonra `blender -b --factory-startup -P tools/blender/test_figure.py` toplam ~5 sn sürdü: figür + GLB 0,2 sn, Cycles CPU 512 px / 64 örnek render 4,6 sn.
- Çıktı: 584 üçgen, 6 malzeme, GLB 46 KB (`public/assets/test/test_figure.glb`), önizleme `docs/previews/test_figure.png`. Önizlemeyi açıp kontrol ettim: kapüşonlu üst, kot, spor ayakkabı, baş ve eller görünüyor; sol bilekte camgöbeği renkte parlayan altıgen bileklik var.
- Zararsız uyarı: "Draco mesh compression is not available" (Draco kullanmıyoruz). Gürültü giderme (denoise) kapalı; Ubuntu derlemesinde OpenImageDenoise olup olmadığı denenmedi.

### Kurulum betiği (Emirhan için)

Blender'ın her bulut oturumunda hazır gelmesi için: oturum başlığındaki bulut ortamı menüsü → **Edit** → **Setup script** alanına şunu ekle. Yeni oturumlar bunu çalıştırır (~35 sn).

```bash
#!/bin/bash
# Blender + glTF dışa aktarıcının istediği numpy (resmî Ubuntu deposundan)
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y blender python3-numpy
```

### Ne kaldı

- Emirhan'ın Vercel önizleme linkinde sahneyi kontrol etmesi (PR'daki "Görsel kontrol gerekenler").
- Kurulum betiğinin ortam ayarlarına eklenmesi.
- PR'daki sorulara cevap.

### Bilinen sorunlar

- Kamera binaların içine girebilir (kamera çarpışması yok).
- Kapsülün gölgesi yok; zıplarken yerden yüksekliği zor anlaşılıyor.
- JS paketi 728 KB (gzip 183 KB). Vite "500 KB üstü" uyarısı veriyor; three.js'in boyutundan, şimdilik sorun değil.
- three 0.186.x'e bağlı: postprocessing 6.39.5 three'nin 0.187'den küçük sürümlerini istiyor. three'yi yükseltmeden önce postprocessing'in desteğini kontrol et.
- SwiftShader'da `GridHelper` çizgilerinin kameraya doğru uzananları çizilmedi; bu yüzden zemin ızgarası dokuyla yapıldı (her GPU'da aynı görünür).
- F1'de tarayıcının yardım sayfası `preventDefault` ile engelleniyor; gerçek Chrome/Edge'de doğrulanmadı.
- Bulut ajanı Vercel önizlemelerini açamıyor (ağ politikası `*.vercel.app`'i engelliyor). İstenirse ortam ayarlarında Network access → Custom → Allowed domains'e `*.vercel.app` eklenebilir. Önizlemeler Vercel girişi istiyorsa (Deployment Protection) yine de açılmayabilir.

### Sıradaki adım

Aşama 1 (vitrin sürümü). BRIEF'teki önceliğe göre ilk iş hareket hissi: sivil koşu/zıplama, Kanca salınması, kamera ve hız efektleri.
Teknik ipucu: başsız tarayıcı testi için `playwright-core` scratchpad'e kurulup `/opt/pw-browsers/chromium` ve `--use-angle=swiftshader --enable-unsafe-swiftshader` bayraklarıyla çalıştırıldı (projeye bağımlılık eklenmedi).
