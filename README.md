CV Asistan – Akıllı Form Doldurma Eklentisi (Chrome / MV3)

CV Asistan, iş başvurusu sitelerindeki formları daha hızlı doldurmanı sağlayan bir Chrome eklentisidir. Profil bilgilerini bir kez kaydedersin; ardından açık sekmedeki başvuru formunu tek tıkla otomatik doldurursun.

Not: Bazı siteler güvenlik/CSP/iframe kısıtları nedeniyle eklentilerin otomatik doldurmasına izin vermeyebilir. Bu durumda eklenti kısmen çalışır veya çalışmayabilir (Chrome’un teknik kısıtları).

Özellikler

✅ Profil bilgilerini kaydetme (kişisel bilgiler, iletişim, eğitim, deneyim vb.)

✅ Açık sekmedeki form alanlarını otomatik doldurma

✅ Input / textarea / select / radio / checkbox gibi alanları destekleme (site yapısına bağlı olarak)

✅ PDF.js ile PDF okuma altyapısı (CV’den veri çıkarmaya temel – geliştirmeye açık)

✅ Manifest V3 uyumlu modern Chrome Extension mimarisi

Ekranlar

Popup: Hızlı doldurma ve temel aksiyonlar

Options: Profil bilgilerini düzenleme / saklama

Kurulum (Geliştirici Modu)

Bu repoyu indir:

Code → Download ZIP veya git clone

Chrome’da şu sayfayı aç: chrome://extensions

Sağ üstten Developer mode (Geliştirici modu) aç

Load unpacked (Paketlenmemiş yükle) tıkla

Proje klasörünü seç (içinde manifest.json bulunan klasör)

Yüklendikten sonra eklentiyi sabitle (pin) ve bir form sayfasında dene.

Nasıl Kullanılır?

Eklentide Options/Ayarlar ekranına girip profil bilgilerini doldur.

Bir iş başvuru formu aç.

Eklentinin Popup ekranından Doldur / Autofill aksiyonunu çalıştır.

Form alanlarını kontrol et, gerekiyorsa küçük düzeltmeler yap.

Neden Bazı Sitelerde Çalışmayabilir?

Chrome eklentileri aşağıdaki durumlarda sınırlanabilir:

chrome:// gibi sistem sayfaları (hiç çalışmaz)

Chrome Web Store sayfaları (hiç çalışmaz)

Bazı siteler Content Security Policy (CSP) uygular

Formlar cross-origin iframe içinde olabilir (erişim kısıtlıdır)

Bazı modern framework’ler (React/Vue) kontrollü input kullandığı için sadece value set etmek yetmeyebilir; input/change event gerektirir

Bu yüzden eklentinin çalışma başarımı siteye göre değişebilir.

Veri Saklama ve Gizlilik

Profil verileri yalnızca tarayıcında saklanır (Chrome Storage).

Bu proje varsayılan haliyle bir sunucuya veri göndermez.

Yine de güvenlik için:

Paylaşılan bilgisayarda kullanacaksan profil verilerini temizlemeyi unutma.

Repo içinde yapacağın değişikliklerde ağ istekleri (fetch/XHR) eklemediğinden emin ol.

Eğer ileride “CV’den otomatik çıkarım (AI/PDF parsing)” gibi özellikler eklenirse, veri işleme politikasını bu bölümde güncellemek gerekir.

Teknik Mimari (Kısaca)

manifest.json: MV3 yapılandırması ve izinler

background.js: Arka plan/service worker mantığı (mesajlaşma, orchestrasyon)

content.js: Sayfadaki form alanlarını bulma ve doldurma

popup.*: Kullanıcı arayüzü (hızlı aksiyonlar)

options.*: Profil düzenleme ekranı

utils.js: Ortak yardımcı fonksiyonlar

pdf.min.js / pdf.worker.min.js: PDF.js kütüphanesi altyapısı

demo.html: Deneme amaçlı sayfa / test
