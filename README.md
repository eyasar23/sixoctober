# sixoctober

Tarayıcıda çalışan, üçüncü şahıs kameralı, açık şehirde hareket ve dövüş odaklı bir aksiyon oyunu prototipi.
Three.js + TypeScript + Vite ile yapılıyor, Vercel'de yayınlanıyor.

Şu an **Aşama 1A**'dayız: hareket çekirdeği (koşu, halatla salınma, zip, dalış, duvarda koşma ve tırmanma),
kamera, hız efektleri, 1 km'lik gece şehri ve koddan yapılmış geçici kahraman figürü hazır.
Proje belgesi: [BRIEF.md](BRIEF.md) · Plan: [PLAN.md](PLAN.md) · Oturum notları: [NOTLAR.md](NOTLAR.md)

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

- Ekrana tıkla: fare yakalanır, fareyle etrafa bakarsın. **Esc**: fareyi bırakır.
- **WASD**: hareket (kameraya göre).
- **Shift** (basılı tut): yerde sprint, havada halatla salınma, duvarda koşmaya ya da tırmanmaya devam. Basılı tutarsan salınımlar kendiliğinden zincirlenir.
- **Space**: yerde zıplama (uzun basınca daha yüksek), havada nişangâhtaki noktaya zip, duvardan sıçrama.
- **C**: dalış (havada). **R**: son güvenli noktaya dön. **T**: ağır çekim.
- **F1**: ayar paneli. Değerleri oynarken değiştirebilirsin; "Copy values" o anki değerleri JSON olarak kopyalar.

Adres çubuğu seçenekleri: `?seed=123` başka bir şehir üretir, `?quality=low|medium|high` kaliteyi sabitler.

## Oynanış duman testi

Başsız Chromium'da betikli bir rota oynatır, değerleri kontrol eder ve `docs/previews/asama-1a/` altına ekran görüntüsü kaydeder:

```bash
npm run build && npx vite preview --port 4173 &
npm i --no-save playwright-core
node tools/smoke/stage1a.mjs
```

## 3D test figürü (Blender)

```bash
blender -b --factory-startup -P tools/blender/test_figure.py
```

`public/assets/test/test_figure.glb` ve `docs/previews/test_figure.png` dosyalarını üretir.
Ubuntu'da önce `apt-get install -y blender python3-numpy` gerekir.
