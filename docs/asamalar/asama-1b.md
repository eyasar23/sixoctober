AŞAMA 1B: MODLAR, İLK SUÇ VE DÖVÜŞ, HUD, MENÜ + 1A GERİ BİLDİRİM DÜZELTMELERİ

Önce BRIEF.md, AGENTS.md, PLAN.md, NOTLAR.md ve docs/asamalar/asama-1a.md'yi oku. Bu mesajın tamamını docs/asamalar/asama-1b.md olarak kaydet.

## Rolün
Bu oturumda üç şapkan var: baş oynanış programcısı, oyun tasarımcısı ve sanat yönetmeni. 1A'da kurduğun atmosfer ve hareket çok beğenildi. Aynı kaliteyi koru ve çıtayı yükselt. Hedef: oynayan kişinin "bu tek başına yapılmış bir prototip olamaz" demesi.

## 0. Sanat yönetimi (bu aşamanın ruhu)
Duygu hedefi: Gece yarısı şehir nefes alıyor; kahraman küçük ama durdurulamaz derecede hızlı; her önemli an bir çizgi roman karesi.

İlkeler:
1. Kadraj: Önemli anlar (mod değişimi, K.O., çatıya konma, suç sahnesine varış) bir çizgi roman karesi gibi kadrajlansın. Kamera, ışık ve zaman (kısa ağır çekim) bunun için kullanılsın.
2. Renk dramaturjisi: Sakin şehir mor-pembe. Suç bölgesine yaklaştıkça sıcak kırmızı-turuncu vurgular ve hızlanan neon titreşimleri artsın. Mod renkleri (Kanca camgöbeği, Titan kehribar) ekrandaki en doygun renkler olsun; oyuncunun gözü hep kahramana gitsin.
3. Ritim: Patlama anları ile nefes anlarını dengele. Çatıya konunca kısa bir sessizlik ve şehrin uğultusu olsun. Sürekli maksimum efekt yorar ve değersizleşir.
4. Tipografi de efekttir: Ses efekti yazıları vuruşun gücüne göre boyut, eğim, renk ve titreşim alsın; aynı kelime iki kez birebir aynı görünmesin.
5. Animasyon: Pozlarla düşün. Her harekette hazırlık, abartı ve yerine oturma olsun. "Animate on twos" ile uyumlu, güçlü ve okunaklı silüetler kullan.
6. Pop-art dokusu: Ben-Day noktaları, baskı kayması, kalın kontur, çapraz panel çizgileri. Dozunda kullan, okunaklılığı asla bozmasın.
7. Geri bildirim zenginliği ("juice"): Oyuncunun her eylemi en az iki kanaldan karşılık bulsun (görüntü + kamera ya da ses).

Süreç:
- Her sistemde önce çalışan çözümü kur, sonra onu unutulmaz yapan dokunuşu ekle.
- Brief'te yazmayan sanatsal kararları sormadan kendin ver; gerekçesini PR'da yaz.
- docs/art-direction.md oluştur. Renk, tipografi, efekt, kamera ve animasyon kurallarını oraya yaz. Sonraki bütün aşamalar bu belgeye uyacak; bu oturumun sonunda güncel olsun.
- Ekran görüntülerine bir sanat yönetmeni gözüyle eleştirel bak. Zayıf, kalabalık ya da okunaksız kareleri düzelt.

## A. Ek görevler: 1A geri bildirim düzeltmeleri
Emirhan oynadı: görseller ve hareket hissi beğenildi. Sorunlar şunlar:

A1. İp hatası: Yere indikten sonra halat binaya bağlı kalıyor. Yere değince ya da Shift bırakılınca ip kopsun ve ~0,2-0,3 sn içinde geri sarılarak kaybolsun.

A2. Kamera:
- Binalar arasında kamera sıkışıp tuhaf açılara kaçıyor; özellikle çok alçaktan yukarı bakan açılar oluyor. Aşırı açıları sınırla, zeminden yeterli yükseklikte kal.
- Kamerayla kahraman arasına giren binalar, kamerayı ani zıplatmak yerine yarı saydam olsun (dither/fade).
- Fare tekerleğiyle 3 mesafe: yakın / orta / uzak.
- Fareye ~1,5 sn dokunulmazsa kamera yavaşça hareket yönünün arkasına dönsün. Ayarlardan kapatılabilir olsun.
- Duruma göre kamera: salınırken geri ve yukarı çekilip şehri göstersin; yerde yaklaşsın; duvarda koşarken yana kaysın.

A3. "Bak ve fırla" (yukarı çıkmanın net yolu):
- Ekranın ortasında küçük bir nişangâh. Menzildeki çatı kenarları ve çıkıntılar, nişangâh üzerine gelince parlasın.
- E'ye basınca kahraman halatla oraya çekilip kenara konsun (perch duruşu).
- Kenardan zıplayıp Shift ile salınmaya akıcı geçiş olsun.

A4. Kontrolleri öğreten başlangıç:
- Oyuncu tuşları anlamakta zorlandı. İlk açılışta ~1-2 dakikalık, oynarken öğreten bir eğitim yap, adım adım ekran ipuçlarıyla: sprint → zıpla → havada Shift ile salın → bırak ve fırla → E ile çatıya fırla → duvarda koş → mod değiştir → yumruk/tekme.
- Atlanabilir olsun ve menüden tekrar başlatılabilsin.
- H tuşu: kontrol kartını aç/kapa.
- Bağlama göre değişen ipuçları kalsın ama sade olsun.

## B. Aşama 1B ana işi

B1. ModeBand ve Titan modu:
- Tab ya da 1/2 ile mod değişimi. ~0,3 sn dönüşüm efekti: çizgi roman paneli, halftone flaş, kostümün ve vurgu renklerinin değişmesi.
- Havada da yapılabilsin ve momentum korunsun. "Salınırken Titan'a geçip yere çakılmak" oyunun imza anı olmalı.
- Kanca: bugünkü hareket seti (camgöbeği).
- Titan (kehribar):
  - Daha ağır ve yavaş koşu.
  - Space basılı tut-bırak = şarjlı süper zıplama.
  - Havada C = yere vuruş: şok dalgası, yakındaki araçları ve düşmanları savurur.
  - Halat yok, duvarda yavaş tırmanma.
  - Kostümün üstüne zırh parçaları belirsin, duruş ağırlaşsın.
- Mod sistemi eklenti mantığında kalsın; ileride 3. ve 4. mod kolayca takılabilsin.

B2. HUD v1 (çizgi roman tarzı ama okunaklı):
- Durum etiketi, hız, can barı.
- Aktif mod göstergesi (bileklik halkası, mod renginde).
- Suça uzaklık ve yön.
- Yuvarlak mini harita: bloklar, oyuncu oku, suç işareti.
- Sade kontrol ipuçları.
- HUD'u gizleme seçeneği.

B3. İlk suç ve dövüş v1:
- Suç döngüsü:
  - Birkaç yüz metre ötede bir suç olayı başlasın: göğe uzanan ışık sütunu ve mesafe göstergesi.
  - Olay özgün bir sahne olsun; örneğin bir zırhlı aracı soyan 3-4 kişilik çete. Çetenin görünüşünü sen tasarla; referans oyundaki sarı tulumlu haydutlara benzemesin.
  - Suç bitince "CRIME STOPPED" paneli, sayaç artışı ve şehrin başka yerinde yeni bir suç.
- Dövüş:
  - Sol tık yumruk, sağ tık tekme, 3 vuruşluk kombo zinciri.
  - Düşman saldırmadan önce "!!" uyarısı; Q ile karşı saldırı.
  - Hit-stop (vuruşta çok kısa donma), ekran sarsıntısı, geri savrulma, K.O.
  - Çizgi roman yazı efektleri; kelimeleri kendin seç, referanstakileri birebir kopyalama.
- Moda göre fark:
  - Kanca: halatla düşmanı kendine çekme.
  - Titan: ağır vuruş ve alan hasarı.
- Basit düşman yapay zekâsı: yaklaş, pozisyon al, uyar, saldır, tepki ver, yere düş.
- Oyuncu da hasar alsın. Can bitince yakında yeniden doğsun.

B4. Açılış menüsü ve ayarlar:
- Çizgi roman sanat yönetimiyle, dış görsel kullanmadan, kodla ya da vektörle çizilmiş bir başlık ekranı. Oyun adı geçici olarak "PROJECT SIXOCTOBER".
- Menü: PLAY / TUTORIAL / CONTROLS / SETTINGS.
- Ayarlar:
  - Grafik kalitesi.
  - Kare hızı (Film 24 / 30 / Smooth), animate on twos.
  - Fare hassasiyeti, Y ters çevirme, kameranın otomatik arkaya dönmesi.
  - Ekran sarsıntısı, ses seviyesi.
- Bütün metinler i18n dosyasında.

## C. Yaratıcı yetki
- En az 3 "imza an" tasarla ve uygula. Örnek yönler:
  - Son düşmana vuruşta ağır çekim ve çizgi roman paneli kadrajı.
  - Havada mod değişiminin görsel şovu.
  - Çatıya konunca şehri gösteren kısa sinematik kamera.
- Hepsi panelden ya da ayarlardan kapatılabilir olsun.
- PR'da "Yaratıcı eklemeler" bölümü: ne yaptın, neden yaptın.
- PR'da ayrıca, uygulamadığın "Gelecek fikirleri" bölümü:
  - Kahraman için 3 isim önerisi.
  - Oyun için 3 isim önerisi.
  - 1 hikâye kancası.
  - Şehir için 1 semt fikri.
- Sınırlar: Telif kuralları (BRIEF 2.8), 60 FPS hedefi; kontrolleri ya da sanat yönünü kökten değiştiren büyük fikirler önce öneri olarak.

## D. Test
- Vitest testleri:
  - Mod değişiminde momentum korunuyor.
  - Kombo zamanlaması doğru.
  - Düşman durum makinesi doğru geçiş yapıyor.
  - "Bak ve fırla" hedef seçimi doğru.
  - İp, iniş anında kopuyor.
- Duman testi (başsız Chromium, betikli girdi): eğitimin bir kısmı, mod değişimi, havada Titan'a geçip yere vuruş, suça gidip dövüşü bitirme. NaN yok, düşme yok.
- Ekran görüntülerini docs/previews/asama-1b/ altına koy ve kendin kontrol et.
- typecheck, test ve build geçmeli.

## E. Teslim
- Oturum uzarsa yarım iş bırakma: çalışan bir noktada dur, PR aç, kalanları NOTLAR.md'ye yaz. Sonraki oturum aynı belgeden devam edecek.
- Öncelik sırası: A1 → A2 → B1 → B3 → A3 → B2 → B4 → A4. Eğitim en sonda, çünkü son hâldeki kontrolleri öğretmeli.
- PR açıklaması BRIEF §6 şablonuyla. Ek olarak:
  - Yeni bir 8 soruluk his anketi; dövüş ve mod değişimine ağırlık versin.
  - 3 dakikalık mini rota.
  - "Yaratıcı eklemeler" ve "Gelecek fikirleri" bölümleri.
- NOTLAR.md ve PLAN.md'yi güncelle. Sıradaki adım olarak Aşama 2'yi (his ayarı) yaz.
