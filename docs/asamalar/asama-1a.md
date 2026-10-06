AŞAMA 1A: HAREKET ÇEKİRDEĞİ VE GÖRSEL STİL ("vitrin" sürümünün ilk yarısı)

Önce BRIEF.md, AGENTS.md, PLAN.md ve NOTLAR.md'yi oku. Bu mesajın tamamını docs/asamalar/asama-1a.md olarak kaydet; sonraki ajanlar görebilsin.

## Rolün
Bu oturumda bir prototip kodlayıcısı değil, oyunun baş oynanış programcısı ve teknik sanatçısısın. Hedef "çalışıyor" değil; oynayan kişinin ilk 30 saniyede "vay" demesi. Lise projesi gibi görünen, oyuncak hissi veren hareket kabul edilmez. İvmelenme eğrileri, momentum korunumu, girdi tamponlama, kamera yumuşatma gibi profesyonel oyunların küçük ama hissedilen detayları bu işin özü.

## Önce iki küçük düzeltme (BRIEF.md ve AGENTS.md)
1. Branch kuralı: Bulut oturumu hangi branch'i atadıysa onu kullan, sorma. Branch adının önemi yok; iş PR ile biter. BRIEF §6 madde 1'i ve AGENTS.md'deki ilgili cümleyi buna göre güncelle.
2. Bölüm 1'deki [V] kararları Emirhan onayladı: sıradan genç kahraman, ModeBand bileklik, Kanca + Titan, kurgusal gece şehri, İngilizce arayüz. [V] işaretlerini "onaylandı" olarak güncelle. Kahramanın adı hâlâ yok.

## Bu oturumun kapsamı
Aşama 1 iki oturuma bölündü:
- 1A (bu oturum): hareket çekirdeği, kamera, hız hissi, şehir v1, görsel stil.
- 1B (sonraki oturum): bileklikle mod geçişi (Titan), oynanış HUD'u, ilk suç sahnesi ve dövüş, açılış menüsü.
Bu oturumda kahraman sürekli Kanca modunda. Ama kodu modlar sonradan takılabilecek şekilde kur (ModeBand + mod arayüzü; hareket yetenekleri moda göre açılıp kapanabilsin).

## 1. Kontroller (bağlama duyarlı, az tuş)
- WASD: hareket (kameraya göre). Fare: kamera.
- Shift (basılı tut): yerde sprint; havada halat atıp salınma; duvarda koşmaya ya da tırmanmaya devam.
- Space: yerde zıplama (basılı tutma süresine göre yükseklik); havada zip (halatla seçili noktaya hızlı çekilme, bekleme süreli); duvardan sıçrama.
- C: dalış (havada).
- R: son güvenli noktaya dön. T: ağır çekim (ayar yaparken his kontrolü için). F1: ayar paneli. Esc: fareyi bırak.
- Alt ortada duruma göre değişen kısa kontrol ipucu; sol altta durum etiketi (ON FOOT / SPRINT / AIRBORNE / SWINGING / WALL RUN / WALL CLIMB / DIVE).

## 2. Hareket çekirdeği (en yüksek öncelik)
- Durum makinesi: Grounded, Airborne, Swinging, WallRun, WallClimb, Dive, Landing. Geçişler net ve ayrı ayrı test edilebilir olsun.
- Sabit zaman adımlı fizik (alt adımlarla). Yüksek hızda duvarların içinden geçme olmayacak.
- Koşu: ivmelenme ve yavaşlama eğrileri, dönüşte hafif kayma. Coyote time ve zıplama tamponu.
- Halatla salınma:
  - Bağlantı noktası seçimi akıllı olmalı: gidilen yönde, önde ve yukarıda, bina cephesinde ya da kenarında. Arkadaki ya da çok yakındaki noktalar seçilmesin. Menzilde bina yoksa halat atılmaz; bunu oyuncuya küçük bir işaretle hissettir.
  - İp, gerilince uzamayan, gevşeyince sarkan bir kısıt (sarkaç). Oyuncu girdisiyle salınım "pompalanabilsin".
  - Bırakınca momentum korunsun, küçük bir ileri itki verilsin. Salınımlar zincirleme akmalı; uzun bir caddede durmadan salınabilmek bu aşamanın kalbi.
  - Halat görünür olsun: gerginken düz, gevşekken hafif sarkık; atış anında küçük bir efekt.
- Zip: Hedefe hızlı çekilme; varınca momentum korunsun.
- Dalış: Aşağı eğilip hızlanma, hız çizgileri yoğunlaşsın. Shift ile dalıştan salınmaya geçilebilsin.
- Duvarda koşma: Belli hız ve açıyla duvara girince yatay koşu, sınırlı süre. Space ile karşıya sıçrama.
- Duvara tırmanma: Duvara doğru basınca dikey tırmanma; tepeye varınca çatıya otomatik çıkış (mantle).
- İniş: Hıza göre yumuşak iniş, yuvarlanma ya da süper kahraman inişi (ekran sarsıntısı + toz efekti).
- Hedef hızlar (km/h): koşu 38–60, sprint ~70, duvarda tırmanma 18–25, duvarda koşu ~80, salınma seyri 110–160, tepe ~170. Hepsi tuning.ts'de ve F1 panelinde.

## 3. Kamera
- Yaylı kol ve çarpışma: Kamera binaların içine girmesin (Aşama 0'daki bilinen sorun).
- Hıza göre genişleyen görüş açısı, salınırken hafif yatma, hız yönüne doğru hafif ileri bakış.
- Duvarda koşarken ve tırmanırken uygun açı; inişte kısa sarsıntı (ayarlanabilir, kapatılabilir).
- Fare hassasiyeti ve Y ters çevirme panelde.

## 4. Hız hissi efektleri
- ~110 km/h üstünde ekran kenarlarından merkeze, hızla yoğunlaşan çizgi roman tarzı hız çizgileri (shader ile).
- Hızla artan kromatik aberasyon, hafif vinyet.
- İstersen kodla üretilmiş basit rüzgâr ve halat sesi (Web Audio, kapatılabilir). Ses asıl Aşama 6'nın işi; bu kısım senin kararın.

## 5. Şehir v1
- Tohumlu üretim, en az ~1 km x 1 km. Düz cadde ızgarası; salınma koridoru olacak uzun ana caddeler; merkezde gökdelen kümesi, kenarlara doğru alçalan binalar.
- Bina çeşitliliği: farklı yükseklik ve taban, basamaklı kuleler, çatı detayları (su depoları, klima üniteleri, antenler).
- Sokak seviyesi: kaldırımlar, şerit çizgileri, yaya geçitleri, parlayan sokak lambaları, ışıklı vitrin bantları, neon tabelalar.
- Dev reklam ekranları: shader ile canlı, hareketli desenler. Sadece uydurma markalar; gerçek marka yok (BRIEF 2.8).
- Basit trafik: şeritlerde akan araçlar (instancing; çarpışma ve yapay zekâ yok, sadece canlılık). Yayalar 1B ya da sonrası.
- Çizim çağrısı sayısı düşük; uzak binalarda basitleştirme.

## 6. Kahraman (geçici figür)
- Koddan, parçalı (eklemli) stilize bir figür: kapüşonlu üst, kot, spor ayakkabı, sol bilekte camgöbeği parlayan altıgen bileklik (Aşama 0'daki Blender figürünün tarifine uygun).
- Kodla pozlanan basit animasyonlar: koşu döngüsü, sprint, havada poz, salınma pozu (kol halata uzanmış), duvarda koşu eğilmesi, tırmanma, iniş çömelmesi.
- "Animate on twos" seçeneği (poz saniyede 12 kez güncellenir), panelden aç/kapa.
- İsteğe bağlı: kahramanda ince bir çizgi roman konturu.

## 7. Görsel stil
- BRIEF 4.1 paleti. Gökyüzü geçişi, ufukta katmanlı şehir silüeti, mor-pembe sis.
- Bloom (lambalar, neon, pencereler, stop lambaları), SMAA, hafif renk düzenlemesi (sokak lambalarının çevresinde sıcak zemin geçişi).
- Pencerelerde çeşitlilik: farklı renk sıcaklıkları, ara sıra yanıp sönen birkaç pencere.
- Kalite ön ayarları (Low / Medium / High + Auto); F1 panelinde çizim çağrısı ve üçgen sayısı.
- İlk 5 saniye kuralı: Oyun, ana caddeye bakan yüksek bir çatıda, şehrin en güzel göründüğü açıyla başlasın.

## 8. Yaratıcı yetki
- Brief'in sustuğu yerde ya da daha iyi bir yol gördüğünde kendi fikrini kullan. Örnek alanlar:
  - İmza hareket numaraları: halatı bırakırken takla, binaya çok yakın geçince küçük hız ödülü, sapan gibi fırlatma.
  - Şehri canlı gösteren küçük detaylar.
  - Uydurma markalı reklam ekranları.
  - Çizgi roman tarzı görsel dokunuşlar.
- Sınırlar:
  - 1A kapsamının dışına çıkma.
  - Telif kurallarına (BRIEF 2.8) uy.
  - Performans hedefini (60 FPS) koru.
  - Her eklemeyi panelden açılıp kapanabilir ya da ayarlanabilir yap.
- PR'da "Yaratıcı eklemeler" başlığı altında her eklemenin ne olduğunu ve neden eklendiğini yaz.
- Kontrolleri, sanat yönünü ya da mimariyi kökten değiştiren büyük fikirleri uygulama; PR'da öner.

## 9. Ayar ve test
- Bütün sabitler tuning.ts'de; F1 panelinde gruplu: Hareket / Halat / Kamera / Efekt / Şehir / Kalite. "Copy values" butonu kalsın.
- Vitest testleri:
  - Halat kısıtı uzun süre çalışınca enerji patlamıyor ve NaN üretmiyor.
  - Bağlantı noktası seçimi öndeki noktaları tercih ediyor.
  - Durum geçişleri doğru çalışıyor.
  - Şehir üretimi tekrarlanabilir.
- Oynanış duman testi:
  - Başsız Chromium'da (Aşama 0'daki yöntem) betikli bir girdi dizisi oynat: koş, zıpla, Shift ile birkaç salınım, dalış, iniş.
  - Hiçbir değer NaN olmasın, kahraman haritanın dışına düşmesin, hızlar hedef aralıklarda kalsın.
  - Farklı anlardan birkaç küçük ekran görüntüsünü docs/previews/asama-1a/ altına kaydet; görüntüleri kendin açıp kontrol et.
- typecheck, test ve build geçmeli.

## 10. Teslim
- Oturum uzarsa yarım iş bırakma: Çalışan bir noktada dur, PR'ı aç, kalanları listele. Öncelik sırası: hareket ve kamera > hız hissi > şehir v1 > görsel stil > kahraman figürü.
- PR açıklaması BRIEF §6 şablonuyla yazılsın. Ek olarak şunlar olsun:
  - "Yaratıcı eklemeler" bölümü.
  - Emirhan için 6-8 soruluk kısa bir "his anketi". Örnek sorular: "Salınma ağır mı, hafif mi?", "Kamera başını döndürüyor mu?", "Bıraktıktan sonraki fırlama tatmin edici mi?"
  - Emirhan'ın deneyeceği mini bir rota. Örnek: "Başladığın çatıdan ana caddeye atla, Shift ile 5 salınım yap, bir duvarda koş, dalışla in."
- NOTLAR.md'yi güncelle, PLAN.md'de 1A'yı işaretle, sıradaki adım olarak 1B'yi yaz.
