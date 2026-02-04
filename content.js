// content.js - Robust Autofill + Strict Name Lock Fix
(() => {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    try {
      if (!request || !request.action) return;

      if (request.action === "PING") {
        sendResponse({
          pong: true,
          href: location.href,
          frame: window.top === window ? "top" : "iframe",
        });
        return true;
      }

      if (request.action === "FILL_FORM") {
        const data = request.data || {};
        console.log("Gelen Veri:", data); // Hata ayıklama için
        const profile = buildProfile(data);
        const result = fillInputs(profile);
        sendResponse({ ok: true, result });
        return true;
      }
    } catch (e) {
      console.error("Content Script Hatası:", e);
      sendResponse({ ok: false, error: String(e) });
      return true;
    }
  });

  // -------------------------
  // Build normalized profile
  // -------------------------
  function buildProfile(rawData) {
    const data = rawData && typeof rawData === "object" ? rawData : {};

    // Basit düzleştirme (Flattening) - Eğer veri iç içe ise
    const flatData = { ...data, ...(data.extras || {}), ...(data.texts || {}) };

    const firstName = pick(flatData, [
      "firstName",
      "first_name",
      "givenName",
      "ad",
      "isim",
    ]);
    const lastName = pick(flatData, [
      "lastName",
      "last_name",
      "surname",
      "soyad",
    ]);

    // Tam isim oluşturma
    let fullName = pick(flatData, ["fullName", "full_name", "name", "adsoyad"]);
    if (!fullName && firstName && lastName) {
      fullName = `${firstName} ${lastName}`.trim();
    } else if (fullName && !firstName) {
      // Eğer sadece fullName varsa, bölmeye çalış (Basitçe)
      const parts = fullName.split(" ");
      if (parts.length > 1) {
        // firstName = parts[0]; // (Opsiyonel, şimdilik gerek yok)
      }
    }

    let email = pick(flatData, ["email", "e-mail", "mail", "eposta"]);
    let phone = pick(flatData, ["phone", "mobile", "tel", "telefon", "cep"]);
    let linkedin = pick(flatData, ["linkedin", "linkedinUrl", "url"]);
    let location = pick(flatData, [
      "location",
      "city",
      "address",
      "konum",
      "şehir",
    ]);
    let company = pick(flatData, [
      "company",
      "currentCompany",
      "employer",
      "şirket",
      "firma",
    ]);
    let summary = pick(flatData, [
      "summary",
      "about",
      "bio",
      "coverLetter",
      "ön yazı",
    ]);
    let gradDate = pick(flatData, ["gradDate", "graduationDate", "mezuniyet"]);

    // Temizlik ve Güvenlik (Normalization)
    email = normalizeEmail(email);
    phone = normalizePhone(phone);
    linkedin = normalizeUrl(linkedin);

    // İsim sızıntısı kontrolü (Eğer Company == İsim ise temizle)
    if (looksLikeOnlyName(company, fullName)) company = "";
    if (looksLikeOnlyName(location, fullName)) location = "";

    return {
      fullName,
      firstName,
      lastName,
      email,
      phone,
      linkedin,
      location,
      company,
      summary,
      gradDate,
    };
  }

  function pick(obj, keys) {
    if (!obj) return "";
    for (const k of keys) {
      const v = getInsensitive(obj, k);
      if (v) return String(v).trim();
    }
    return "";
  }

  function getInsensitive(obj, key) {
    const low = key.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === low) return obj[k];
    }
    return undefined;
  }

  // -------------------------
  // Main Fill Logic
  // -------------------------
  function fillInputs(p) {
    // Sayfadaki görünür inputları al
    const inputs = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ).filter(isFillable);

    let filledCount = 0;
    const filled = [];

    for (const el of inputs) {
      const meta = buildMeta(el); // Inputun "kimlik kartı"
      const type = (el.type || "text").toLowerCase();

      // --- KATI EŞLEŞTİRME KURALLARI (Strict Matching) ---

      // 1. EMAIL (Kesinlikle Email ise)
      if (
        type === "email" ||
        (type === "text" && match(meta, ["email", "e-mail", "posta", "mail"]))
      ) {
        if (!match(meta, ["name", "isim", "adınız"])) {
          // "Email Name" tuzağına düşme
          if (setValue(el, p.email)) filledCount++;
          continue;
        }
      }

      // 2. TELEFON
      if (
        type === "tel" ||
        (type === "text" &&
          match(meta, [
            "phone",
            "mobile",
            "tel",
            "cep",
            "gsm",
            "contact number",
          ]))
      ) {
        if (setValue(el, p.phone)) filledCount++;
        continue;
      }

      // 3. LINKEDIN / URL
      if (
        type === "url" ||
        (type === "text" &&
          match(meta, ["linkedin", "website", "url", "link", "profil"]))
      ) {
        if (setValue(el, p.linkedin)) filledCount++;
        continue;
      }

      // 4. MEZUNIYET TARİHİ (Graduation)
      if (
        match(meta, [
          "graduation",
          "mezuniyet",
          "expected date",
          "bitiş tarihi",
          "mm/yyyy",
        ])
      ) {
        if (setValue(el, p.gradDate)) filledCount++;
        continue;
      }

      // 5. LOKASYON / ŞEHİR (Asla isim yazma)
      if (
        match(meta, [
          "location",
          "city",
          "address",
          "konum",
          "şehir",
          "country",
          "ülke",
        ])
      ) {
        if (setValue(el, p.location)) filledCount++;
        continue;
      }

      // 6. ŞİRKET / COMPANY
      if (
        match(meta, [
          "company",
          "employer",
          "şirket",
          "firma",
          "kurum",
          "current company",
        ])
      ) {
        if (setValue(el, p.company)) filledCount++;
        continue;
      }

      // 7. ÖN YAZI / SUMMARY (Textarea)
      if (
        el.tagName === "TEXTAREA" ||
        match(meta, [
          "cover",
          "letter",
          "summary",
          "about",
          "hakkımda",
          "ön yazı",
          "mesaj",
        ])
      ) {
        if (setValue(el, p.summary)) filledCount++;
        continue;
      }

      // 8. İSİM / NAME (EN SON ve EN RİSKLİ)
      // Diğer her şey elendikten sonra buraya gelir.
      // EĞER input "konum", "şirket", "mail" vs. kelimeleri İÇERMİYORSA isim yaz.
      const forbiddenForName = [
        "email",
        "mail",
        "phone",
        "tel",
        "location",
        "city",
        "address",
        "company",
        "date",
        "year",
        "url",
        "link",
        "salary",
        "maaş",
      ];

      if (
        match(meta, ["name", "ad soyad", "isim", "full name", "adınız"]) &&
        !match(meta, forbiddenForName)
      ) {
        if (setValue(el, p.fullName)) filledCount++;
        continue;
      }
    }

    return { filledCount, frame: window.top === window ? "top" : "iframe" };
  }

  // -------------------------
  // Helpers
  // -------------------------
  function isFillable(el) {
    if (el.type === "hidden" || el.disabled || el.readOnly) return false;
    if (el.style.display === "none" || el.style.visibility === "hidden")
      return false;
    return true;
  }

  // Inputun etrafındaki metinleri toplar (Label, Placeholder, Name, ID vb.)
  function buildMeta(el) {
    const parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("data-testid"),
    ];

    // Label bulma (for attribute ile)
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) parts.push(label.innerText);
    }

    // Parent Label
    const parentLabel = el.closest("label");
    if (parentLabel) parts.push(parentLabel.innerText);

    // Yakındaki metinler (Previous element)
    const prev = el.previousElementSibling;
    if (
      prev &&
      (prev.tagName === "LABEL" ||
        prev.tagName === "SPAN" ||
        prev.tagName === "DIV" ||
        prev.tagName === "B")
    ) {
      parts.push(prev.innerText);
    }

    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function match(text, keywords) {
    if (!text) return false;
    return keywords.some((k) => text.includes(k));
  }

  function setValue(el, value) {
    if (!value) return false;

    // Değeri yaz
    el.value = value;

    // React/Angular tetikleyicileri
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    // Görsel geri bildirim (Sarı arka plan)
    el.style.backgroundColor = "#fff9c4";
    el.style.transition = "background-color 0.5s";

    return true;
  }

  // Güvenlik Kontrolleri
  function normalizeEmail(v) {
    return v && v.includes("@") ? v.trim() : "";
  }
  function normalizePhone(v) {
    return v ? v.replace(/[^\d+]/g, "") : "";
  } // Sadece rakam ve + bırak
  function normalizeUrl(v) {
    if (!v) return "";
    return v.startsWith("http") ? v : "https://" + v;
  }

  function looksLikeOnlyName(value, name) {
    if (!value || !name) return false;
    return value.toLowerCase().trim() === name.toLowerCase().trim();
  }
})();
