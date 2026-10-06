# sixoctober

Tarayıcıda çalışan, üçüncü şahıs kameralı, açık şehirde hareket ve dövüş odaklı bir aksiyon oyunu prototipi.
Three.js + TypeScript + Vite ile yapılıyor, Vercel'de yayınlanıyor.

Şu an **Aşama 0**'dayız: hattın çalıştığını gösteren küçük bir test sahnesi var.
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

## Test sahnesinde kontroller

- Ekrana tıkla: fare yakalanır, fareyle etrafa bakarsın. **Esc**: fareyi bırakır.
- **WASD**: hareket · **Space**: zıplama
- **F1**: ayar paneli. Değerleri oynarken değiştirebilirsin; "Copy values" o anki değerleri JSON olarak kopyalar.

## 3D test figürü (Blender)

```bash
blender -b --factory-startup -P tools/blender/test_figure.py
```

`public/assets/test/test_figure.glb` ve `docs/previews/test_figure.png` dosyalarını üretir.
Ubuntu'da önce `apt-get install -y blender python3-numpy` gerekir.
