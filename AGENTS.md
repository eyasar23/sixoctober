# AGENTS.md

Bu repoda çalışan her ajan (Claude Code bulut ya da yerel, Codex) için kısa kurallar.

**İşe başlamadan önce `BRIEF.md`'yi baştan sona oku.** Sonra `PLAN.md`'ye ve `NOTLAR.md`'deki son kayda bak.
Aşamaların ayrıntılı görev metinleri `docs/asamalar/` altında.
Görevin, oturumu başlatan mesajda yazan aşamadır; sonraki aşamalara kendiliğinden geçme.
Belirsiz ya da çelişkili bir şey görürsen kod yazmadan önce Emirhan'a sor.

## Kurallar

1. Her oturum tek aşama (ya da tek alt görev). Bulut oturumu hangi branch'i atadıysa onu kullan, sorma; branch adının önemi yok. `main`'e doğrudan push yok; iş PR ile biter.
2. Küçük ve anlamlı commit'ler.
3. Oturum sonunda `NOTLAR.md`'ye kayıt ekle: ne yapıldı, ne kaldı, bilinen sorunlar, sıradaki adım. Sonraki ajan sohbet geçmişini görmez; bağlam sadece bu dosyalardır.
4. Sır yok: API anahtarı, şifre ve token koda ya da repoya girmez (repo herkese açık).
5. Telif (BRIEF.md 2.8): Spider-Man/Marvel/Spider-Verse ve Ben 10 öğeleri kullanılmaz. Dışarıdan gelen her varlık `ASSETS.md`'ye kaynak, lisans ve linkle yazılır. Ticari kullanıma izin vermeyen hiçbir şey eklenmez.
6. Yeni bağımlılık eklemeden önce PR'da gerekçesini yaz.
7. Ayar sabitlerini koda gömme; `src/config/tuning.ts`'e koy. F1 paneli bu değerlere bağlıdır.
8. FPS'i düşüren bir şey eklediysen PR'da belirt.
9. Oyunu göremezsin. Görsel olarak doğrulayamadığın her şeyi PR'da "Görsel kontrol gerekenler" listesine yaz; tahmini doğrulanmış gibi raporlama.
10. Kod, dosya ve değişken adları İngilizce. Oyundaki bütün metinler `src/i18n/en.json`'da. `NOTLAR.md`, PR açıklaması ve Emirhan'a sorular Türkçe ve sade.
11. Kredi sınırlı: gereksiz keşiften, büyük yeniden yazımlardan ve gereksiz bağımlılıklardan kaçın.

## Her PR'dan önce

`npm run typecheck`, `npm run test` ve `npm run build` geçmeli.

## PR açıklaması şablonu (Türkçe)

- **Ne yapıldı**
- **Önizlemede neye bakmalı** (adım adım: "linki aç, W'ye bas, şunu görmelisin")
- **Görsel kontrol gerekenler** (ajanın göremediği şeyler)
- **Bilinen sorunlar**
- **Emirhan'a sorular**
- **Sonraki adım önerisi**

## Komutlar

```bash
npm install
npm run dev          # geliştirme sunucusu
npm run test         # Vitest
npm run typecheck    # TypeScript
npm run build        # tip kontrolü + üretim derlemesi (dist/)
blender -b --factory-startup -P tools/blender/test_figure.py   # 3D test figürü
node tools/smoke/stage1b.mjs   # oynanış duman testi (önce build + vite preview, playwright-core --no-save)
node tools/smoke/stage1a.mjs   # 1A hareket rotası (aynı hazırlık)
```

Bulutta Blender kurulu değilse kurulum satırları `NOTLAR.md`'de (Aşama 0 kaydı).
