# Plan

Ayrıntılar `BRIEF.md` Bölüm 7'de. Bir aşama, "bitti sayılır" şartı sağlanınca işaretlenir.

- [ ] **0. Kurulum** (bulut): iskelet, belgeler, Vercel hattı testi, Blender bulut testi.
  *Bitti sayılır:* önizleme linkinde test sahnesi açılıyor; Blender sonucu raporlanmış.
  - [x] Proje iskeleti (Vite + TypeScript + Three.js + postprocessing + lil-gui + Vitest)
  - [x] Belgeler (AGENTS, CLAUDE, PLAN, NOTLAR, ASSETS, README) ve `vercel.json`
  - [x] Test sahnesi (gökyüzü, sis, ~30 bina, bloom, kapsül oyuncu, F1 paneli)
  - [x] Blender bulut testi (GLB + önizleme render'ı, sonuç `NOTLAR.md`'de)
  - [x] typecheck, test ve build geçiyor; PR açıldı
  - [x] Vercel önizleme derlemesi başarılı (Ready)
  - [ ] Emirhan önizleme linkinde sahneyi kontrol etti
- [ ] **1. Vitrin sürümü** (bulut): her şeyin kaba hâli: stilize şehir, koddan figür kahraman, sivil hareket + Kanca salınması, kamera ve hız efektleri, bileklikle 2 mod geçişi, HUD, bir suç sahnesi (2-3 düşman, basit vuruş), açılış menüsü.
  Öncelik: hareket hissi > görsel stil > HUD > mod geçişi > suç sahnesi > menü.
  *Bitti sayılır:* linkte baştan sona oynanabilir bir tur.
- [ ] **2. His ayarı** (bulut, gerekirse yerel ajan): salınma, kamera, hız ve kontroller; Emirhan'ın F1 paneli değerleriyle.
  *Bitti sayılır:* Emirhan "hareket iyi hissettiriyor" diyor.
- [ ] **3. Karakter** (Emirhan: Meshy/Mixamo + bulut; ince ayar: yerel ajan + Blender): gerçek model ve animasyonlar, durum makinesine bağlı, animate on twos.
  *Bitti sayılır:* kahraman animasyonlu; iki modun kostümü ayrı.
- [ ] **4. Modlar** (bulut): Kanca ve Titan tam hâliyle (hareket, dövüş, efekt).
  *Bitti sayılır:* iki mod arasındaki fark oynayınca net.
- [ ] **5. Dövüş ve görevler** (bulut): kombo, karşı saldırı, bitirici, suç döngüsü, büyük harita, trafik ve yaya.
  *Bitti sayılır:* bir suç döngüsü baştan sona eğlenceli.
- [ ] **6. Ses ve cila** (bulut + yerel ajan + dış araçlar): müzik, efektler, ayarlar menüsü, performans.
  *Bitti sayılır:* orta seviye dizüstünde akıcı.
- [ ] **7. Yayın** (sonra): satış platformu, barındırma, isim ve marka kontrolü.
