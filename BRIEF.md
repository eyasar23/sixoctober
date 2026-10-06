# sixoctober — Oyun Brief'i

> Projenin ana belgesi. Bu repoda çalışan her ajan (Claude Code bulut ya da yerel, Codex) işe başlamadan önce bu dosyayı okur.
> Sahibi: Emirhan. Son güncelleme: 6 Ekim 2026 (Aşama 1A).

---

## 0. Bu dosyayı okuyan ajana

- Bu dosyanın tamamı bağlamdır. **Görevin, oturumu başlatan mesajda hangi aşama yazıyorsa sadece odur.** İlk oturumda bu, Bölüm 10'daki "Aşama 0 görevi"dir. Sonraki aşamalara kendiliğinden geçme.
- Belirsiz ya da çelişkili gördüğün bir şey varsa kod yazmadan önce sor.
- Oyunu göremiyorsun. Görsel olarak doğrulayamadığın her şeyi PR'da "Görsel kontrol gerekenler" listesine yaz; tahmini doğrulanmış gibi raporlama.
- Kod, dosya ve değişken adları İngilizce. `NOTLAR.md`, PR açıklaması ve Emirhan'a sorular Türkçe ve sade.
- Kredi sınırlı: gereksiz keşiften, büyük yeniden yazımlardan ve gereksiz bağımlılıklardan kaçın.

---

## 1. Kararlar

Sahibi Emirhan. Bu tablodaki kararların hepsi Emirhan tarafından **onaylandı** (Aşama 1A öncesi). Kahramanın adı hâlâ yok.

| Konu | Karar |
|---|---|
| Tür | Üçüncü şahıs kamerayla, açık şehirde hareket ve dövüş odaklı aksiyon oyunu |
| Platform | Tarayıcı (Chrome/Edge), masaüstü, klavye + fare. Oyun kolu sonra, mobil şimdilik yok (onaylandı) |
| Teknoloji | Three.js + TypeScript + Vite; Vercel'de yayın |
| Kahraman | Sıradan bir genç adam. Adı henüz yok; kodda `Hero` (onaylandı) |
| Sivil görünüş | Kapüşonlu üst, kot, spor ayakkabı (onaylandı) |
| Cihaz | Bileğinde, kendi tasarımımız olan kalın, altıgen yüzlü bir bileklik; aktif modun rengiyle yanan bir halka. Kodda `ModeBand` (onaylandı) |
| İlk 2 mod | **Kanca** (`grapple`): hızlı; halatla salınma ve çekilme. **Titan** (`titan`): yavaş ama güçlü; şarjlı süper zıplama, yere vuruş, ağır yumruk (onaylandı) |
| Mod renkleri | Kanca: elektrik camgöbeği + koyu mor. Titan: kehribar turuncu + kömür grisi (onaylandı). Kırmızı-mavi ve yeşil bilerek kullanılmıyor (bkz. 2.8) |
| Şehir | Kurgusal, gece, çizgi roman tarzı büyük şehir; düz cadde ızgarası + gökdelen merkezi (onaylandı). Gerekçe: salınma uzun düz caddeler ve yüksek binalar ister. İstanbul esintisi (köprü silüeti, tabelalar, bir semt) sonra eklenebilir |
| Oyun dili | Arayüz İngilizce; bütün metinler tek bir dil dosyasında, Türkçe sonra eklenecek (onaylandı) |
| Performans hedefi | Orta seviye bir dizüstünde 60 FPS |
| Barındırma | Vercel Hobby (sadece prototip süresince; ücretsiz plan ticari olmayan kullanım için, satış aşamasında değişecek) |

---

## 2. Referans analizi

Referans: Claude Opus 5.5 ile yapılmış, tarayıcıda çalışan bir Spider-Man hayran oyunu (spiderman-spiderverse.vercel.app). 59 saniyelik oynanış videosu kare kare ve ses spektrogramıyla incelendi; yapım süreci iki haberden ve oyunun sitesinden doğrulandı.
**Amaç kopyalamak değil, neden etkileyici olduğunu anlamak.**

### 2.1 Nasıl yapıldı (doğrulanmış)
- Three.js + WebGL2. Claude Opus 5.5 ile Claude Code kullanılmış; geliştirici 3 günde, Max 5x aboneliğiyle, orta düşünme seviyesiyle yapmış. Yayınlanan sürüm üçüncü deneme.
- Şehir tamamen koddan üretilmiş: binlerce bina, çatılar, parklar, trafik, yayalar.
- Modeller ve animasyon klipleri Blender'da **Python betikleriyle** üretilmiş, elle modelleme yok. Dokular ve reklam panoları yapay zekâ görsel üretimi.
- İnsanın rolü: yön, geri bildirim ve referans görsel. Kod, shader, şehir ve modeller Claude'dan.
- Render: gölgeler, ortam kapanması (SSAO), yansımalar, bloom, zamansal kenar yumuşatma (TAA), hareket bulanıklığı.
- Ayarlar menüsü: grafik kalitesi (Auto / Ultra / High / Medium / Low), kare hızı (Film 24 / 30 / Smooth), **"animate on twos"** (karakter animasyonunu saniyede 12 pozla oynatma; Spider-Verse filmlerindeki çizgi film hissi), müzik ve çizgi roman efekti sesleri ayrı ayrı, Y ekseni ters çevirme, oyun kolu desteği.

### 2.2 Görsel stil (gözlenen)
- Gerçekçi değil, **stilize**: az poligonlu geometri, basit dokular. Etkiyi ışık, yoğunluk ve hareket yaratıyor.
- Mor-pembe-turuncu alacakaranlık gökyüzü, lavanta zemin, uzakları mor-pembe sise boğan atmosfer.
- Sokak lambası, neon tabela ve araç stop lambalarında güçlü bloom.
- Kenarlarda ve başlık yazısında kırmızı-mavi renk kayması (kromatik aberasyon); bazı karelerde zemine vuran turuncu renk geçişi.
- Binalarda rastgele yanan pencere ızgaraları (sıcak sarı, şeftali, pembe, camgöbeği).
- 3D dünyada belirgin siyah kontur yok; çizgi roman hissi daha çok konuşma balonları, "POW" yazıları, menü ve paletten geliyor.
- Detaylar: çatılarda su depoları, dev reklam ekranları, neon tabelalar, ışıklı vitrinler, yaya geçitleri, şerit çizgileri, ağaçlar, banklar, taksiler, sedanlar, yayalar, çakarlı polis arabası, trafik konileri, devrilmiş araçlar.
- Hedef işaretleri: suç yerinde göğe uzanan pembe ışık sütunu; dünyada mesafe yazan kırmızı elmas işaretler.
- Ölçülen renkler Bölüm 4.1'de.

### 2.3 Hareket ve kamera (gözlenen)
- Sol altta anlık durum etiketi: ON FOOT, AIRBORNE, WALL CRAWL, WALL RUN. Alt ortadaki kontrol ipucu duruma göre değişiyor.
- Yerde Shift basılı = salınma. Havada Space = ileri fırlama, C = dalış. Duvara değince otomatik tırmanma (Shift hızlandırır, Space atlar). Duvarda koşma (Shift basılı devam, Space sıçrar). İnişte süper kahraman inişi + yazı efekti.
- Kamera arkadan takip ediyor; hız arttıkça görüş açısı genişliyor ve kenarlardan merkeze hız çizgileri çıkıyor; duvara tırmanırken kamera dönüp aşağıyı gösteriyor.
- Hız göstergesinden okunan değerler (km/s):

| Durum | Videoda görülen |
|---|---|
| Yerde koşu | 38–60 |
| Duvarda tırmanma | 18–25 |
| Duvarda koşma | ~83 |
| Salınma / havada seyir | 110–160 |
| En yüksek | 166 |
| Hız çizgilerinin belirginleştiği eşik | ~110–120 üstü |

### 2.4 Dövüş (gözlenen)
- Sol tık yumruk, sağ tık tekme; düşmanın üstünde "!!" yanınca Q ile karşı saldırı.
- Sol üstte kombo sayacı (x12'ye kadar görüldü) ve bitirici hamleye kalan vuruş; dolunca F ile bitirici.
- Her vuruşta renkli yazı balonu (POW, WHAP, BAM, BOOM gibi), sarı darbe parıltısı, geri savrulma, düşman üstünde can barı, sonunda dev "K.O.!".
- Düşmanların kendi replikleri var.

### 2.5 Görev ve arayüz (gözlenen)
- Sol üst: durdurulan suç sayacı + suça kalan mesafe. Sağ üst: yuvarlak, kâğıt dokulu mini harita; M ile büyük harita.
- Sol alt: can barı (100) + 6 küçük gösterge. Sağ alt: hız (km/s).
- Kahraman hareket ederken espri yapıyor; çizgi roman balonunda çıkıyor.
- Açılış menüsü: Play / Controls / Settings; çapraz şeritler, halftone nokta deseni, şehir silüeti.

### 2.6 Ses (spektrogramdan; dinlenmedi, tahmin payı var)
- Müzik: bas ağırlıklı, hip-hop/trap benzeri; yaklaşık 144 BPM (yarım tempoda 72); tonal merkez Sol minöre yakın; ses enerjisinin ~%40'ı 150 Hz altında.
- Efektler: atış anlarıyla çakışan 0,45–0,7 sn'lik "vuuş" sesleri; dövüşte kısa, sert vuruş sesleri.
- Konuşma balonları çıktığında kısa, tiz, hece hece sentetik bir "konuşma" sesi (gerçek seslendirme değil gibi).

### 2.7 Bizim için dersler
1. Etkinin çoğu poligondan değil: ışık + sis + renk kayması + hız hissi + çizgi roman arayüzü. Bunlar kodla yapılır; yapay zekânın en güçlü olduğu alan.
2. "Animate on twos" ve film kare hızı seçenekleri ucuz ama çok etkili; biz de sunacağız.
3. Oyun tek bir sistem değil, on kadar sistemin birleşimi; aşama aşama ilerleyeceğiz.
4. Modelleri Blender'da Python betikleriyle üretmek mümkün; buluttaki ajan bunu deneyecek (Bölüm 10).

### 2.8 Kesinlikle kopyalanmayacaklar (telif)
- **Spider-Man / Marvel / Spider-Verse:** karakterler, isimler, kostüm, örümcek ve ağ motifleri, logolar, replikler. Bizim kahraman ağ değil **halat/kanca** kullanır.
- **Ben 10:** Omnitrix'in görünüşü (kum saati kadran, yeşil ışık), uzaylı dönüşümleri, isimler. Bizim cihaz kendi tasarımımız; modlar kostüm/zırh, uzaylı değil.
- Referans oyunun kodu, metinleri ve görselleri kullanılmaz.
- Dışarıdan gelen her varlık (model, doku, font, ses, müzik) `ASSETS.md`'ye kaynak + lisans + link ile yazılır. **Ticari kullanıma izin vermeyen hiçbir şey eklenmez.**

---

## 3. Oyun tasarımı

### 3.1 Çekirdek döngü
Şehirde dolaş → suç uyarısı (ışık sütunu + mesafe) → modları kullanarak hızla ulaş → dövüş → K.O. → sayaç ve ödül → yeni yetenek/mod açılımı (ileride).

### 3.2 Hareket seti
- **Sivil (her zaman):** koşma, zıplama, duvara tırmanma, duvarda koşma, yumuşak ve sert iniş.
- **Kanca modu:** Shift basılı = en yakın uygun yüzeye halat atıp sarkaç gibi salınma; bırakınca momentumla fırlama. Havada Space = halatla bir noktaya çekilme (zip). C = dalış.
- **Titan modu:** daha yavaş ama durdurulamaz koşu; Space basılı tut-bırak = şarjlı süper zıplama; havadayken C = yere vuruş (çevreye şok dalgası); ağır yumruklar.
- **Mod değiştirme:** Tab veya 1/2 tuşu. ~0,3 sn dönüşüm efekti (çizgi roman paneli + halftone flaş + renk değişimi). Havada da yapılabilmeli ve momentum korunmalı; "salınırken Titan'a geçip yere çakılmak" gibi kombinasyonlar oyunun eğlencesinin merkezi.
- Hedef hızlar 2.3'teki tabloya yakın olmalı. Bütün sabitler ayar dosyasında (bkz. 5.3).

### 3.3 Dövüş (tam hâli Aşama 5'te)
Yumruk / tekme, "!!" uyarısında karşı saldırı, kombo sayacı, bitirici hamle, moda göre farklı vuruşlar (Kanca: halatla çekme; Titan: alan hasarı), çizgi roman yazı efektleri.

### 3.4 Kamera
Arkadan takip; hızla genişleyen görüş açısı; ~110 km/s üstünde hız çizgileri; duvarda duvara göre dönme; kısa ekran sarsıntısı (ayarlanabilir, kapatılabilir).

### 3.5 Arayüz
Durum etiketi, bağlama göre değişen kontrol ipucu, hız, can, aktif mod göstergesi (bileklik ikonu), mini harita, suç sayacı ve mesafe, kombo sayacı.
Menü: Play / Controls / Settings. Ayarlar: grafik kalitesi, kare hızı (Film 24 / 30 / Smooth), animate on twos, ses kanalları, fare hassasiyeti, Y ters çevirme, ekran sarsıntısı.

### 3.6 Ses yönü (tamamen özgün)
Bas ağırlıklı, minör tonda, ~140–150 BPM hip-hop/trap havası; hareket sırasında rüzgâr ve halat sesleri; vuruşlarda sert efektler; sentetik "konuşma" sesi. Lisanslı ya da kodla üretilmiş; kaynak `ASSETS.md`'de.

---

## 4. Görsel stil rehberi

### 4.1 Referans paleti (videodan ölçüldü)
Ölçüm: oyun alanından 46 kare, k-means renk kümeleme. Ruh hâlini tutturmak için başlangıç noktası; birebir kopya şartı yok.

| Rol | Renk |
|---|---|
| Gökyüzü üst | `#38164B` |
| Gökyüzü orta | `#895079` |
| Ufuk / sis | `#CA9CB5`, `#DFC7C4` |
| Bina gölgesi / gece koyusu | `#2A0D44`, `#401C4F`, `#261420` |
| Bina ve zemin orta tonları | `#563363`, `#6E4F8F`, `#8272A9` |
| Zemin (lavanta) | `#735A92`, `#A78CBB` |
| Sıcak zemin geçişi | `#B38989`, `#BC7D5F`, `#CDA091` |
| Yanan pencere (krem, en sık) | `#E9D1A2` |
| Yanan pencere (şeftali / sarı) | `#DFA78A`, `#E5C580` |
| Neon pembe | `#DE8ECA` |
| Neon camgöbeği | `#65C4E4` |
| Lamba kehribarı | `#E6AB30` |

Mod vurguları: Kanca = camgöbeği (`#65C4E4` civarı, daha doygun), Titan = kehribar (`#E6AB30` civarı).

### 4.2 Efekt yığını
Bloom, mesafe sisi (mor-pembe), kromatik aberasyon (kenarlarda, hızla artan), hafif vinyet, kenar yumuşatma (SMAA/FXAA), hız çizgileri katmanı. Hepsi kalite ayarına göre açılıp kapanabilmeli.

### 4.3 Çizgi roman katmanı
Konuşma balonları, yazı efektleri, halftone flaşlar, karakterlerde isteğe bağlı kontur (ters gövde tekniği). Fontlar ticari kullanıma izin veren lisanslı fontlar olmalı (`ASSETS.md`).

### 4.4 Animasyon hissi
"Animate on twos" seçeneği: karakter pozları saniyede 12 kez güncellenir, kamera ve dünya akıcı kalır.

---

## 5. Teknik mimari

### 5.1 Yığın
- Vite + TypeScript (strict) + Three.js.
- Efektler için `postprocessing` (pmndrs) kütüphanesi; özel efektler için kendi shader'larımız.
- Ayar paneli için `lil-gui`. Testler için Vitest.
- Başlangıçta fizik motoru yok: binalar için kutu çarpıştırıcıları + halat için kendi sarkaç/ip kısıtı hesabımız. Gerekirse ileride eklenir (önce gerekçe yazılır).

### 5.2 Klasör yapısı (öneri)
```
src/
  core/      oyun döngüsü, zaman, giriş (input), olaylar
  config/    tuning.ts (tüm ayar sabitleri), quality.ts
  world/     şehir üretimi (tohumlu), binalar, sokak, trafik, yaya
  player/    durum makinesi, hareket, halat fiziği, kamera
  modes/     ModeBand, grapple, titan
  combat/    (Aşama 5)
  fx/        efekt yığını, hız çizgileri, çizgi roman efektleri
  ui/        HUD, menü, ayarlar (HTML/CSS katmanı)
  audio/
  i18n/      en.json (tr.json sonra)
public/assets/   GLB modeller, dokular, sesler
tools/blender/   ekransız Blender betikleri (.py)
docs/previews/   Blender önizleme görselleri
```

### 5.3 Ayarlanabilirlik (çok önemli)
- Bütün hareket ve kamera sabitleri `src/config/tuning.ts` içinde, açıklamalı.
- F1 ile açılan `lil-gui` paneli bu değerlere bağlı; Emirhan oynarken canlı değiştirebilmeli.
- Panelde "Değerleri kopyala" butonu: o anki değerleri JSON olarak panoya kopyalar. Emirhan geri bildirimde bu JSON'u gönderir.
- FPS sayacı (panelden aç/kapa).

### 5.4 Şehir üretimi
- Tohumlu rastgelelik: aynı tohum her zaman aynı şehri üretir (hata ayıklama ve test için şart).
- Pencereler, araçlar, ağaçlar gibi tekrar eden nesneler tek seferde çizilir (InstancedMesh / birleştirilmiş geometri); çizim çağrısı sayısı düşük tutulur.

### 5.5 Kalite ve performans
- Kalite ön ayarları: Low / Medium / High / Ultra + Auto.
- Ağır efektler (gölge, SSAO vb.) düşük ayarda kapanır.

### 5.6 Testler ve kontroller
- Vitest: saf hesaplar (halat fiziği, durum makinesi geçişleri, tohumlu üretimin tekrarlanabilirliği).
- Her PR'dan önce `npm run typecheck`, `npm run test`, `npm run build` geçmeli.

### 5.7 Yayın
- `vercel.json`: `"framework": "vite"`, `"buildCommand": "npm run build"`, `"outputDirectory": "dist"`.
- Vercel her PR için otomatik önizleme linki üretir; Emirhan oyunu oradan dener.

### 5.8 3D varlık hattı
1. **Bulut:** `tools/blender/` altındaki Python betikleri ekransız Blender'da çalışır, GLB üretip `public/assets/`'e yazar; Cycles CPU ile küçük bir önizleme PNG'si `docs/previews/`'e kaydedilir. Ajan bu PNG'yi açıp kontrol eder.
2. **Emirhan:** Meshy / Tripo gibi araçlardan model + otomatik iskelet + animasyon (GLB) ya da Mixamo animasyonları indirir, `public/assets/`'e koyup push'lar; ajan oyuna bağlar.
3. **Yerel ajan:** Blender MCP ile Emirhan'ın bilgisayarındaki Blender'da ince ayar.

---

## 6. Ajan çalışma kuralları

1. Her oturum tek aşama (ya da tek alt görev). Bulut oturumu hangi branch'i atadıysa onu kullan, sorma; branch adının önemi yok. `main`'e asla doğrudan push yok; iş PR ile biter.
2. Küçük ve anlamlı commit'ler.
3. Oturum sonunda `NOTLAR.md`'ye ekle: ne yapıldı, ne kaldı, bilinen sorunlar, sıradaki adım. Bir sonraki ajan sohbet geçmişini görmez; bağlam sadece bu dosyalardır.
4. Sır yok: API anahtarı, şifre, token koda ve repoya girmez (repo herkese açık).
5. Telif kuralları (2.8) ve `ASSETS.md` zorunlu.
6. Yeni bağımlılık eklemeden önce PR'da gerekçesini yaz.
7. Ayar sabitlerini koda gömme; `tuning.ts`'e koy.
8. FPS'i düşüren bir şey eklediysen PR'da belirt.
9. PR açıklaması şablonu (Türkçe):
   - **Ne yapıldı**
   - **Önizlemede neye bakmalı** (adım adım: "linki aç, W'ye bas, şunu görmelisin")
   - **Görsel kontrol gerekenler** (ajanın göremediği şeyler)
   - **Bilinen sorunlar**
   - **Emirhan'a sorular**
   - **Sonraki adım önerisi**

---

## 7. Aşama planı

| Aşama | İçerik | Kim | Bitti sayılır |
|---|---|---|---|
| 0. Kurulum | İskelet, belgeler, Vercel hattı testi, Blender bulut testi | Bulut | Önizleme linkinde test sahnesi açılıyor; Blender sonucu raporlanmış |
| 1. Vitrin sürümü | Her şeyin kaba hâli: stilize şehir, koddan figür kahraman, sivil hareket + Kanca salınması, kamera ve hız efektleri, bileklikle 2 mod geçişi, HUD, bir suç sahnesi (2-3 düşman, basit vuruş), açılış menüsü. **Öncelik: hareket hissi > görsel stil > HUD > mod geçişi > suç sahnesi > menü** | Bulut | Linkte baştan sona oynanabilir bir tur |
| 2. His ayarı | Salınma, kamera, hız, kontroller; Emirhan'ın F1 paneli değerleriyle | Bulut (+ gerekirse yerel ajan) | Emirhan "hareket iyi hissettiriyor" diyor |
| 3. Karakter | Gerçek model + animasyonlar, durum makinesine bağlı, animate on twos | Emirhan (Meshy/Mixamo) + bulut; ince ayar yerel ajan + Blender | Kahraman animasyonlu; iki modun kostümü ayrı |
| 4. Modlar | Kanca ve Titan tam hâliyle (hareket, dövüş, efekt) | Bulut | İki mod arasındaki fark oynayınca net |
| 5. Dövüş ve görevler | Kombo, karşı saldırı, bitirici, suç döngüsü, büyük harita, trafik ve yaya | Bulut | Bir suç döngüsü baştan sona eğlenceli |
| 6. Ses ve cila | Müzik, efektler, ayarlar menüsü, performans | Bulut + yerel ajan (performans ölçümü) + dış araçlar | Orta seviye dizüstünde akıcı |
| 7. Yayın | Satış platformu, barındırma, isim ve marka kontrolü | Sonra | — |

---

## 8. Açık konular ve riskler
- Kahraman adı ve oyunun adı (marka araştırması gerekecek).
- Ticari aşamada Vercel Hobby'den çıkılacak.
- Bulut ajanı oyunu göremez; görsel hatalar Emirhan'ın kontrolüne bağlı.
- Bulut makinesinde ekran kartı yok (4 vCPU, 16 GB RAM, 30 GB disk); Blender önizlemeleri yavaş olabilir.

## 9. Kaynaklar
- Referans oyun: https://spiderman-spiderverse.vercel.app
- Yapım süreci: https://runtimewire.com/article/claude-opus-55-spiderbench-browser-game ve https://digg.com/tech/quscxw71
- Claude Code bulut ortamı: https://code.claude.com/docs/en/cloud-environments
- Ubuntu 24.04 Blender paketi: https://packages.ubuntu.com/km/noble/amd64/blender
- Meshy animasyon: https://docs.meshy.ai/en/webapp/guides/animate
- Mixamo ve alternatifleri: https://app.cinevva.com/guides/free-character-animations-rigging
- Vercel Hobby planı: https://vercel.com/docs/plans/hobby

---

## 10. Aşama 0 görevi (BU OTURUMDA YAPILACAK)

Amaç: büyük işe başlamadan önce hattın çalıştığını kanıtlamak. **Oyun yapmıyoruz; küçük bir test sahnesi yapıyoruz.** Kısa tut.

1. **Proje iskeleti:** Vite + TypeScript (strict) + Three.js + `postprocessing` + `lil-gui` + Vitest. `package.json` betikleri: `dev`, `build`, `preview`, `test`, `typecheck`. `.gitignore` (node_modules, dist vb.). Klasörler 5.2'deki gibi; şimdilik boş kalacak olanları açma.
2. **Belgeler:**
   - `AGENTS.md`: Bölüm 6'daki kuralların kısa hâli + "işe başlamadan önce BRIEF.md'yi oku" notu (Codex bu dosyayı okur).
   - `CLAUDE.md`: sadece `@AGENTS.md` satırı.
   - `PLAN.md`: Bölüm 7'deki aşamalar, kutucuklu liste olarak.
   - `NOTLAR.md`: tarihli oturum günlüğü şablonu + bu oturumun kaydı.
   - `ASSETS.md`: boş tablo (Varlık | Kaynak | Lisans | Link | Eklendiği aşama).
   - `README.md`: kısa, Türkçe; projenin ne olduğu ve yerelde nasıl çalıştırılacağı.
3. **`vercel.json`** (5.7'deki gibi).
4. **Test sahnesi:**
   - 4.1'deki paletle gece gökyüzü geçişi ve mor-pembe sis.
   - Tohumlu üreticiyle ~30 kutu bina; yanan pencereler (emissive, paletten rastgele renkler); düz zemin.
   - Bloom açık.
   - Kapsül şeklinde oyuncu: WASD hareket, Space zıplama; fareyle kamera (pointer lock, ESC ile çıkış).
   - Ekranda küçük yazı: "Aşama 0 — hat testi", anlık hız (km/s) ve FPS.
   - F1 ile açılan `lil-gui` paneli: en az 3 değer (koşu hızı, zıplama gücü, kamera mesafesi) + "Değerleri kopyala" butonu.
5. **Blender bulut testi (en fazla ~15 dakika):**
   - `apt-get update && apt-get install -y blender` (Ubuntu 24.04 deposunda Blender 4.0.2 var).
   - `tools/blender/test_figure.py`: ekransız modda (`blender -b --factory-startup -P ...`) basit primitiflerden, 4.1 paletinden renkli, az poligonlu bir insan figürü kur; `public/assets/test/test_figure.glb` olarak dışa aktar.
   - Cycles CPU ile 512 px önizleme render'ı al: `docs/previews/test_figure.png`. Görseli kendin aç ve figürün göründüğünü kontrol et.
   - GLB'yi test sahnesinde kapsülün yanına yükle.
   - Kurulum ya da render başarısız olursa izinli olmayan adreslerden indirme gibi geçici çözümler deneme; hatayı ve denediklerini `NOTLAR.md`'ye yaz, göreve devam et.
   - Başarılıysa `NOTLAR.md`'ye, Emirhan'ın bulut ortamı ayarlarındaki "Setup script" alanına ekleyeceği **kurulum betiği** satırlarını yaz (Blender'ın her oturumda hazır gelmesi için).
6. **Kontroller:** `npm run typecheck`, `npm run test` (en az tohumlu üretimin tekrarlanabilirliğini test eden 1 test) ve `npm run build` geçmeli.
7. **PR:** `asama-0-kurulum` branch'inden "Aşama 0: kurulum ve hat testi" başlıklı PR; açıklama Bölüm 6'daki şablonla. "Emirhan'a sorular" kısmına Bölüm 1'de [V] olarak işaretli kararlardan netleşmesi en acil olanları yaz.
8. `NOTLAR.md`'yi güncelle.

**Bu oturumda yapılmayacaklar:** gerçek şehir sistemi, salınma, modlar, dövüş, HUD tasarımı, menü. Hepsi sonraki aşamalarda.
