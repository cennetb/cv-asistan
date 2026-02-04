pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------
  // Tabs
  // -------------------------
  const tabButtons = Array.from(document.querySelectorAll(".tab"));
  const sections = {
    setup: document.getElementById("tab-setup"),
    profile: document.getElementById("tab-profile"),
    extras: document.getElementById("tab-extras"),
    texts: document.getElementById("tab-texts"),
    fill: document.getElementById("tab-fill"),
  };

  function setActiveTab(tab) {
    for (const btn of tabButtons)
      btn.classList.toggle("active", btn.dataset.tab === tab);
    for (const key of Object.keys(sections))
      sections[key].classList.toggle("hidden", key !== tab);
  }
  tabButtons.forEach((btn) =>
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab)),
  );

  // -------------------------
  // Setup UI
  // -------------------------
  const aiSwitch = document.getElementById("ai-switch");
  const apiArea = document.getElementById("api-area");
  const apiKeyInput = document.getElementById("apiKey");
  const saveApiBtn = document.getElementById("saveApi");

  const cvDrop = document.getElementById("cv-drop");
  const cvFile = document.getElementById("cvFile");
  const cvName = document.getElementById("cv-name");
  const analyzeCvBtn = document.getElementById("analyzeCv");
  const setupStatus = document.getElementById("setupStatus");

  // Profile UI
  const firstNameEl = document.getElementById("firstName");
  const lastNameEl = document.getElementById("lastName");
  const emailEl = document.getElementById("email");
  const phoneEl = document.getElementById("phone");
  const linkedinEl = document.getElementById("linkedin");
  const websiteEl = document.getElementById("website");
  const summaryEl = document.getElementById("summary");
  const skillsEl = document.getElementById("skills");
  const saveProfileBtn = document.getElementById("saveProfile");

  // Extras UI
  const locationEl = document.getElementById("location");
  const expectedSalaryEl = document.getElementById("expectedSalary");
  const salaryCurrencyEl = document.getElementById("salaryCurrency");
  const workModelEl = document.getElementById("workModel");
  const saveExtrasBtn = document.getElementById("saveExtras");

  // Texts UI
  const targetRoleEl = document.getElementById("targetRole");
  const jobDescEl = document.getElementById("jobDesc");
  const genCoverBtn = document.getElementById("genCover");
  const clearJobBtn = document.getElementById("clearJob");
  const coverLetterEl = document.getElementById("coverLetter");
  const saveTextsBtn = document.getElementById("saveTexts");

  // Fill UI
  const pillProfile = document.getElementById("pillProfile");
  const pillSalary = document.getElementById("pillSalary");
  const pillCover = document.getElementById("pillCover");
  const fillNowBtn = document.getElementById("fillNow");
  const fillStatus = document.getElementById("fillStatus");

  // State
  let cvText = "";
  let cvFileName = "";

  // -------------------------
  // Init: load storage into UI
  // -------------------------
  chrome.storage.local.get(
    ["ai_enabled", "gemini_api_key", "profile", "extras", "texts"],
    (res) => {
      const aiEnabled = !!res.ai_enabled;
      setAiSwitch(aiEnabled);
      apiArea.classList.toggle("hidden", !aiEnabled);

      if (res.gemini_api_key) apiKeyInput.value = res.gemini_api_key;

      const p = res.profile || {};
      firstNameEl.value = p.firstName || "";
      lastNameEl.value = p.lastName || "";
      emailEl.value = p.email || "";
      phoneEl.value = p.phone || "";
      linkedinEl.value = p.linkedin || "";
      websiteEl.value = p.website || "";
      summaryEl.value = p.summary || "";
      skillsEl.value = Array.isArray(p.skills)
        ? p.skills.join(", ")
        : p.skills || "";

      const ex = res.extras || {};
      locationEl.value = ex.location || "";
      expectedSalaryEl.value = ex.expectedSalary || "";
      salaryCurrencyEl.value = ex.salaryCurrency || "";
      workModelEl.value = ex.workModel || "";

      const tx = res.texts || {};
      targetRoleEl.value = tx.targetRole || "";
      jobDescEl.value = tx.jobDesc || "";
      coverLetterEl.value = tx.coverLetter || "";

      refreshPills();
    },
  );

  // -------------------------
  // AI switch
  // -------------------------
  aiSwitch.addEventListener("click", () => {
    const next = !aiSwitch.classList.contains("on");
    setAiSwitch(next);
    chrome.storage.local.set({ ai_enabled: next }, () => {
      apiArea.classList.toggle("hidden", !next);
      toastSetup(
        next ? "AI açık." : "AI kapalı (regex + kayıtlı metinler).",
        next ? "ok" : "bad",
      );
    });
  });

  function setAiSwitch(on) {
    aiSwitch.classList.toggle("on", on);
    aiSwitch.setAttribute("aria-checked", on ? "true" : "false");
  }

  saveApiBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) return toastSetup("API key boş olamaz.", "bad");
    chrome.storage.local.set({ gemini_api_key: key }, () =>
      toastSetup("✅ API anahtarı kaydedildi.", "ok"),
    );
  });

  // -------------------------
  // CV upload
  // -------------------------
  cvDrop.addEventListener("click", () => cvFile.click());

  cvFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      cvName.textContent = "Lütfen PDF seç.";
      analyzeCvBtn.disabled = true;
      return;
    }

    cvFileName = file.name;
    cvName.textContent = "⏳ " + file.name + " okunuyor...";
    analyzeCvBtn.disabled = true;
    toastSetup("", "hide");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const maxPages = Math.min(pdf.numPages, 3);

      let fullText = "";
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        fullText += tc.items.map((it) => it.str).join(" ") + "\n";
      }

      cvText = fullText;
      cvName.textContent = "✅ " + file.name + " hazır.";
      analyzeCvBtn.disabled = false;
      toastSetup("CV metni alındı. Şimdi profil çıkarabilirsin.", "ok");
    } catch (err) {
      console.error(err);
      cvName.textContent = "❌ PDF okunamadı.";
      analyzeCvBtn.disabled = true;
      toastSetup("PDF okunamadı. Farklı bir PDF dene.", "bad");
    }
  });

  // -------------------------
  // Analyze CV (regex + optional AI)
  // -------------------------
  analyzeCvBtn.addEventListener("click", async () => {
    if (!cvText) return toastSetup("Önce PDF yükle.", "bad");

    analyzeCvBtn.disabled = true;
    analyzeCvBtn.textContent = "🤖 Analiz ediliyor...";

    const base = extractWithRegex(cvText);
    let finalData = base;

    const aiEnabled = aiSwitch.classList.contains("on");
    if (aiEnabled) {
      const { gemini_api_key } = await storageGet(["gemini_api_key"]);
      const key = (gemini_api_key || "").trim();
      if (!key) {
        toastSetup("AI açık ama API anahtarı yok. Regex ile devam.", "bad");
      } else {
        try {
          const ai = await extractWithGemini(key, cvText);
          finalData = mergeAndNormalize(base, ai);
        } catch (e) {
          console.warn(e);
          toastSetup("AI hata verdi. Regex ile devam.", "bad");
        }
      }
    }

    finalData = hardNormalize(finalData);

    // UI'ye bas
    firstNameEl.value = finalData.firstName || "";
    lastNameEl.value = finalData.lastName || "";
    emailEl.value = finalData.email || "";
    phoneEl.value = finalData.phone || "";
    linkedinEl.value = finalData.linkedin || "";
    websiteEl.value = finalData.website || "";
    summaryEl.value = finalData.summary || "";
    skillsEl.value = Array.isArray(finalData.skills)
      ? finalData.skills.join(", ")
      : "";

    // profile save + parsed_cv_data
    const profileToSave = buildProfileFromUI();
    const normalizedParsed = hardNormalize(buildParsedCvData(profileToSave));

    await storageSet({
      profile: profileToSave,
      parsed_cv_data: normalizedParsed,
      parsed_cv_text: cvText.slice(0, 12000),
      parsed_cv_file: cvFileName || "",
    });

    toastSetup(
      "✅ Profil çıkarıldı. Profil sekmesinden kontrol edebilirsin.",
      "ok",
    );
    analyzeCvBtn.textContent = "🧠 CV’den Profil Çıkar";
    analyzeCvBtn.disabled = false;

    refreshPills();
    setActiveTab("profile");
  });

  // -------------------------
  // Save profile/extras/texts
  // -------------------------
  saveProfileBtn.addEventListener("click", async () => {
    const profile = buildProfileFromUI();
    await storageSet({ profile });

    const { parsed_cv_data } = await storageGet(["parsed_cv_data"]);
    const next =
      parsed_cv_data && typeof parsed_cv_data === "object"
        ? { ...parsed_cv_data }
        : {};
    const merged = hardNormalize({ ...next, ...buildParsedCvData(profile) });
    await storageSet({ parsed_cv_data: merged });

    toastSetup("✅ Profil kaydedildi.", "ok");
    refreshPills();
  });

  saveExtrasBtn.addEventListener("click", async () => {
    const extras = {
      location: locationEl.value.trim(),
      expectedSalary: expectedSalaryEl.value.trim(),
      salaryCurrency: salaryCurrencyEl.value,
      workModel: workModelEl.value,
    };
    await storageSet({ extras });

    const { parsed_cv_data } = await storageGet(["parsed_cv_data"]);
    const next =
      parsed_cv_data && typeof parsed_cv_data === "object"
        ? { ...parsed_cv_data }
        : {};
    next.extras =
      next.extras && typeof next.extras === "object" ? next.extras : {};
    next.extras.location = extras.location || "";
    next.extras.salaryAmount = extras.expectedSalary || "";
    next.extras.salaryCurrency = extras.salaryCurrency || "";
    next.extras.workModel = extras.workModel || "";
    await storageSet({ parsed_cv_data: hardNormalize(next) });

    toastSetup("✅ Beklentiler kaydedildi.", "ok");
    refreshPills();
  });

  saveTextsBtn.addEventListener("click", async () => {
    const texts = {
      targetRole: targetRoleEl.value.trim(),
      jobDesc: jobDescEl.value.trim(),
      coverLetter: coverLetterEl.value.trim(),
    };
    await storageSet({ texts });

    const { parsed_cv_data } = await storageGet(["parsed_cv_data"]);
    const next =
      parsed_cv_data && typeof parsed_cv_data === "object"
        ? { ...parsed_cv_data }
        : {};
    next.texts = next.texts && typeof next.texts === "object" ? next.texts : {};
    next.texts.coverLetter = texts.coverLetter || "";
    await storageSet({ parsed_cv_data: hardNormalize(next) });

    toastSetup("✅ Metinler kaydedildi.", "ok");
    refreshPills();
  });

  clearJobBtn.addEventListener("click", () => {
    jobDescEl.value = "";
    toastSetup("İlan metni temizlendi.", "ok");
  });

  // -------------------------
  // Generate cover letter (AI)
  // -------------------------
  genCoverBtn.addEventListener("click", async () => {
    const aiEnabled = aiSwitch.classList.contains("on");
    if (!aiEnabled) return toastSetup("AI kapalı. Açıp API key gir.", "bad");

    const { gemini_api_key } = await storageGet(["gemini_api_key"]);
    const key = (gemini_api_key || "").trim();
    if (!key) return toastSetup("API anahtarı yok.", "bad");

    genCoverBtn.disabled = true;
    genCoverBtn.textContent = "🤖 Üretiliyor...";

    try {
      const { profile = {}, extras = {} } = await storageGet([
        "profile",
        "extras",
      ]);
      const role = targetRoleEl.value.trim();
      const job = jobDescEl.value.trim();

      const cover = await generateCoverLetterWithGemini(key, {
        profile,
        extras,
        role,
        job,
      });
      coverLetterEl.value = cover;

      toastSetup("✅ Önyazı üretildi. Düzenleyip kaydedebilirsin.", "ok");
      setActiveTab("texts");
    } catch (e) {
      console.warn(e);
      toastSetup("Önyazı üretilemedi. API/Model hatası olabilir.", "bad");
    } finally {
      genCoverBtn.disabled = false;
      genCoverBtn.textContent = "🪄 Önyazı Üret (AI)";
    }
  });

  // =========================================================
  // ✅ FILL NOW (FRAME BROADCAST FIX)
  // =========================================================
  fillNowBtn.addEventListener("click", async () => {
    fillStatus.classList.add("hidden");

    const { parsed_cv_data } = await storageGet(["parsed_cv_data"]);
    if (!parsed_cv_data) {
      showFillStatus(
        "Önce Kurulum’da CV analiz et veya Profil/Beklentiler’i kaydet.",
        "bad",
      );
      setActiveTab("setup");
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) return showFillStatus("Aktif sekme bulunamadı.", "bad");

      const url = String(tab.url || "");
      if (
        url.startsWith("chrome://") ||
        url.startsWith("edge://") ||
        url.startsWith("brave://") ||
        url.startsWith("opera://") ||
        url.startsWith("chrome-extension://") ||
        url.includes("chrome.google.com/webstore")
      ) {
        return showFillStatus(
          "Bu sayfada eklenti çalışmaz (tarayıcı/mağaza sayfası).",
          "bad",
        );
      }

      // 1) content.js'i tüm frame'lere zorla enjekte et (idempotent)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"],
        });
      } catch (e) {
        return showFillStatus(
          "Content script enjekte edilemedi: " + (e?.message || e),
          "bad",
        );
      }

      // 2) bu sekmedeki tüm frameId'leri al
      let frames = [];
      try {
        frames = await getAllFrames(tab.id);
      } catch (e) {
        // fallback: sadece top
        frames = [{ frameId: 0 }];
      }

      // 3) her frame’e FILL_FORM gönder, gelen filledCount'ları topla
      let totalFilled = 0;
      let hitFrames = 0;

      for (const f of frames) {
        const frameId = Number(f.frameId || 0);

        // ping ile gerçekten content var mı kontrol et (bazı frame’ler deny olabilir)
        let pongOk = false;
        try {
          const pong = await sendMessageAsync(
            tab.id,
            { action: "PING" },
            frameId,
          );
          pongOk = !!pong?.pong;
        } catch {
          pongOk = false;
        }
        if (!pongOk) continue;

        try {
          const resp = await sendMessageAsync(
            tab.id,
            { action: "FILL_FORM", data: parsed_cv_data },
            frameId,
          );
          const count = resp?.result?.filledCount ?? 0;
          if (count > 0) {
            totalFilled += count;
            hitFrames += 1;
          }
        } catch {
          // ignore frame errors
        }
      }

      if (totalFilled <= 0) {
        showFillStatus(
          "Doldurma tamamlandı ama alan bulunamadı. (Form iframe/Shadow DOM olabilir) — Lever’de çoğu zaman frame içindedir; bu sürüm frame’leri taradı. Yine 0 ise form Shadow DOM olabilir.",
          "bad",
        );
      } else {
        showFillStatus(
          `✅ Doldurma tamamlandı. Doldurulan alan: ${totalFilled} (frame: ${hitFrames})`,
          "ok",
        );
      }
    });
  });

  // -------------------------
  // Frames helper (webNavigation)
  // -------------------------
  function getAllFrames(tabId) {
    return new Promise((resolve, reject) => {
      chrome.webNavigation.getAllFrames({ tabId }, (details) => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(details || []);
      });
    });
  }

  // sendMessage with frameId
  function sendMessageAsync(tabId, msg, frameId = 0) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, msg, { frameId }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(resp);
      });
    });
  }

  // -------------------------
  // Pills + status
  // -------------------------
  async function refreshPills() {
    const {
      profile = {},
      extras = {},
      texts = {},
    } = await storageGet(["profile", "extras", "texts"]);
    pillProfile.textContent = profile?.email || profile?.firstName ? "✅" : "—";
    pillSalary.textContent = extras?.expectedSalary ? "✅" : "—";
    pillCover.textContent = texts?.coverLetter ? "✅" : "—";
  }

  function toastSetup(msg, type) {
    if (!msg && type === "hide") {
      setupStatus.classList.add("hidden");
      setupStatus.textContent = "";
      return;
    }
    setupStatus.classList.remove("hidden");
    setupStatus.classList.toggle("ok", type === "ok");
    setupStatus.classList.toggle("bad", type === "bad");
    setupStatus.textContent = msg;
  }

  function showFillStatus(msg, type) {
    fillStatus.classList.remove("hidden");
    fillStatus.classList.toggle("ok", type === "ok");
    fillStatus.classList.toggle("bad", type === "bad");
    fillStatus.textContent = msg;
  }

  // -------------------------
  // Storage helpers
  // -------------------------
  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  // -------------------------
  // Build objects from UI
  // -------------------------
  function parseSkills(v) {
    return String(v || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  }

  function buildProfileFromUI() {
    return {
      firstName: firstNameEl.value.trim(),
      lastName: lastNameEl.value.trim(),
      email: emailEl.value.trim(),
      phone: phoneEl.value.trim(),
      linkedin: linkedinEl.value.trim(),
      website: websiteEl.value.trim(),
      summary: summaryEl.value.trim(),
      skills: parseSkills(skillsEl.value),
    };
  }

  function buildParsedCvData(profile) {
    const fullName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      fullName,
      email: profile.email || "",
      phone: profile.phone || "",
      linkedin: profile.linkedin || "",
      website: profile.website || "",
      summary: profile.summary || "",
      skills: Array.isArray(profile.skills) ? profile.skills : [],
      extras: {},
      texts: {},
    };
  }

  // =========================
  // Regex extraction + Gemini extraction
  // =========================
  function extractWithRegex(text) {
    const clean = String(text || "");
    const email = normalizeEmail(findEmail(clean));
    const phone = normalizePhone(findPhone(clean));
    const linkedin = normalizeUrl(findLinkedIn(clean));
    const { firstName, lastName, fullName } = guessNameFromTop(clean);

    return {
      firstName,
      lastName,
      fullName,
      email,
      phone,
      linkedin,
      website: "",
      summary: "",
      skills: [],
      extras: {
        location: "",
        currentCompany: "",
        gradDate: "",
        salaryAmount: "",
        salaryCurrency: "",
      },
      texts: { coverLetter: "" },
    };
  }

  function findEmail(text) {
    const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0] : "";
  }

  function findPhone(text) {
    const m =
      text.match(
        /(\+?\d{1,3}[\s.-]?)?(0?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})/,
      ) || text.match(/(\+?\d{1,3}[\s.-]?)?(\d{10,15})/);
    return m ? m[0] : "";
  }

  function findLinkedIn(text) {
    const m = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s)]+/i);
    return m ? m[0] : "";
  }

  function guessNameFromTop(text) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3);

    let candidate = "";
    for (const l of lines.slice(0, 25)) {
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(l)) continue;
      if (/linkedin\.com/i.test(l)) continue;
      if (/\d{3,}/.test(l) && l.length < 30) continue;
      candidate = l;
      break;
    }

    candidate = candidate
      .replace(/[^A-Za-zÇĞİÖŞÜçğıöşü\s'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = candidate.split(" ").filter(Boolean);
    if (parts.length === 0)
      return { firstName: "", lastName: "", fullName: "" };

    const fullName = parts.slice(0, 4).join(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    return { firstName, lastName, fullName };
  }

  async function extractWithGemini(apiKey, text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    const clipped = String(text || "").slice(0, 9000);

    const prompt = `
Return ONLY a valid JSON object (no markdown, no backticks).
If you cannot find a field, return an empty string (or [] for skills).
JSON schema:
{
  "firstName": "",
  "lastName": "",
  "fullName": "",
  "email": "",
  "phone": "",
  "linkedin": "",
  "website": "",
  "summary": "",
  "skills": [],
  "extras": {
    "location": "",
    "currentCompany": "",
    "gradDate": "",
    "salaryAmount": "",
    "salaryCurrency": ""
  },
  "texts": { "coverLetter": "" }
}
CV TEXT:
${clipped}
`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await resp.json();
    if (data?.error) throw new Error(data.error.message || "Gemini error");

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonStr = extractJsonObject(raw);
    return JSON.parse(jsonStr);
  }

  async function generateCoverLetterWithGemini(apiKey, payload) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const profile = payload.profile || {};
    const extras = payload.extras || {};
    const role = payload.role || "";
    const job = payload.job || "";

    const prompt = `
Write a concise, professional cover letter in Turkish.
Constraints:
- 160-260 words
- Friendly but professional
- Mention relevant skills and impact
- Do NOT hallucinate companies or degrees
- If job description is empty, write a general cover letter for the target role

Name: ${profile.firstName || ""} ${profile.lastName || ""}
Summary: ${profile.summary || ""}
Skills: ${Array.isArray(profile.skills) ? profile.skills.join(", ") : ""}
LinkedIn: ${profile.linkedin || ""}
Location: ${extras.location || ""}
Target role: ${role}

Job description:
${job.slice(0, 4000)}
`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await resp.json();
    if (data?.error) throw new Error(data.error.message || "Gemini error");

    return String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "",
    ).trim();
  }

  function extractJsonObject(raw) {
    let s = String(raw || "").trim();
    s = s
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return s;
  }

  function mergeAndNormalize(base, ai) {
    const out = {
      ...base,
      ...(ai || {}),
      extras: { ...(base.extras || {}), ...(ai?.extras || {}) },
      texts: { ...(base.texts || {}), ...(ai?.texts || {}) },
    };
    if (!out.fullName)
      out.fullName = [out.firstName, out.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    return hardNormalize(out);
  }

  // -------------------------
  // Normalizers
  // -------------------------
  function hardNormalize(obj) {
    const out = { ...(obj || {}) };

    out.firstName = safeText(out.firstName);
    out.lastName = safeText(out.lastName);
    out.fullName = safeText(out.fullName);

    out.email = normalizeEmail(out.email);
    out.phone = normalizePhone(out.phone);
    out.linkedin = normalizeUrl(out.linkedin);
    out.website = normalizeUrl(out.website);

    out.summary = safeText(out.summary);
    out.skills = Array.isArray(out.skills)
      ? out.skills.map(safeText).filter(Boolean).slice(0, 30)
      : [];

    out.extras = out.extras && typeof out.extras === "object" ? out.extras : {};
    out.texts = out.texts && typeof out.texts === "object" ? out.texts : {};

    out.extras.location = safeText(out.extras.location);
    out.extras.currentCompany = safeText(out.extras.currentCompany);
    out.extras.gradDate = normalizeGradDate(out.extras.gradDate);
    out.extras.salaryAmount = normalizeSalaryAmount(out.extras.salaryAmount);
    out.extras.salaryCurrency = normalizeCurrency(out.extras.salaryCurrency);

    out.texts.coverLetter = safeText(out.texts.coverLetter);

    if (!out.fullName)
      out.fullName = [out.firstName, out.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    return out;
  }

  function safeText(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return "";
    return String(v).replace(/\s+/g, " ").trim();
  }

  function normalizeEmail(v) {
    const s = safeText(v);
    const m = s.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    return m ? m[0] : "";
  }

  function normalizePhone(v) {
    const s = safeText(v);
    const digits = s.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return "";
    return s;
  }

  function normalizeUrl(v) {
    let s = safeText(v);
    if (!s) return "";
    if (!/^(https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return "";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    return s;
  }

  function normalizeGradDate(v) {
    const s = safeText(v);
    const m = s.match(/(0?[1-9]|1[0-2])\/\d{4}/);
    return m ? m[0] : "";
  }

  function normalizeSalaryAmount(v) {
    const s = safeText(v);
    const cleaned = s.replace(/[^\d.,]/g, "");
    return /[0-9]/.test(cleaned) ? cleaned : "";
  }

  function normalizeCurrency(v) {
    const s = safeText(v).toUpperCase();
    if (!s) return "";
    if (/^[A-Z]{3}$/.test(s)) return s;
    if (s === "₺") return "TRY";
    if (s === "$") return "USD";
    if (s === "€") return "EUR";
    if (s === "£") return "GBP";
    return s;
  }
});
