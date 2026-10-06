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
