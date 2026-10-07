# sixoctober

Tarayıcıda çalışan, üçüncü şahıs kameralı, açık şehirde hareket ve dövüş odaklı bir aksiyon oyunu prototipi.
Three.js + TypeScript + Vite ile yapılıyor, Vercel'de yayınlanıyor.

Şu an **Aşama 1B** bitti: hareket çekirdeği (koşu, halatla salınma, zip, dalış, duvarda koşma ve tırmanma),
bileklikle iki mod (Kanca ve Titan), suç döngüsü ve dövüş, HUD, açılış ekranı, menü ve eğitim hazır.
Proje belgesi: [BRIEF.md](BRIEF.md) · Plan: [PLAN.md](PLAN.md) · Oturum notları: [NOTLAR.md](NOTLAR.md) ·
Sanat yönetimi: [docs/art-direction.md](docs/art-direction.md)

## Yerelde çalıştırma

Node.js 22.12 veya üstü gerekir.

```bash
npm install
npm run dev
```

Terminalde çıkan adresi (genelde http://localhost:5173) Chrome ya da Edge'de aç.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu; kod değişince sayfa yenilenir |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş sürümü yerelde açar |
| `npm run test` | Testleri çalıştırır (Vitest) |
| `npm run typecheck` | TypeScript tip kontrolü |

## Kontroller

Oyun açılış ekranıyla başlar: **PLAY** (ilk seferde kısa eğitimle), **TUTORIAL**, **CONTROLS**, **SETTINGS**.
Oyunda **H** kontrol kartını açar, **Esc** duraklatma menüsünü açar.

- **Fare**: etrafa bak. **Tekerlek**: kamera yakın / orta / uzak.
- **WASD**: hareket (kameraya göre).
- **Shift** (basılı tut): yerde sprint, havada halatla salınma, duvarda koşmaya ya da tırmanmaya devam. Bırakınca fırlarsın; basılı tutarsan salınımlar kendiliğinden zincirlenir.
- **Space**: zıplama (uzun basınca daha yüksek), havada nişangâhtaki noktaya zip, duvardan ve kenardan sıçrama.
- **E**: nişangâhın altında parlayan çatı kenarına fırla. Dövüşte (Kanca) düşmanı kendine çek.
- **C**: dalış (havada). Titan'da yere vuruş.
- **Tab** ya da **1 / 2**: Kanca / Titan (havada da olur).
- **Titan**: Space'i basılı tutup bırak: süper zıplama. Havada C: şok dalgalı yere vuruş.
- **Sol tık** yumruk, **sağ tık** tekme (üst üste 3 vuruş kombo). Düşmanın üstünde **!!** görünce **Q**: karşı saldırı.
- **R**: son güvenli noktaya dön. **T**: ağır çekim.
- **F1**: ayar paneli. Değerleri oynarken değiştirebilirsin; "Copy values" o anki değerleri JSON olarak kopyalar.

Adres çubuğu seçenekleri: `?seed=123` başka bir şehir üretir, `?quality=low|medium|high` kaliteyi sabitler.

## Oynanış duman testi

Başsız Chromium'da gerçek tuş ve fare girdisiyle betikli bir tur oynatır (açılış ekranı, eğitimin bir kısmı, salınma,
bak ve fırla, havada Titan'a geçiş ve yere vuruş, suça gidiş, dövüş), değerleri kontrol eder ve
`docs/previews/asama-1b/` altına ekran görüntüsü kaydeder. Yazılım render'ında yaklaşık 10 dakika sürer.

```bash
npm run build && npx vite preview --port 4173 &
npm i --no-save playwright-core
node tools/smoke/stage1b.mjs
```

Aşama 1A'nın hareket rotası da duruyor: `node tools/smoke/stage1a.mjs` (aynı hazırlık; `docs/previews/asama-1a/` altındaki görüntülerin üzerine yazar).

## 3D test figürü (Blender)

```bash
blender -b --factory-startup -P tools/blender/test_figure.py
```

`public/assets/test/test_figure.glb` ve `docs/previews/test_figure.png` dosyalarını üretir.
Ubuntu'da önce `apt-get install -y blender python3-numpy` gerekir.
