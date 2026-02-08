(() => {
  "use strict";

  const U = window.CVAUtils;

  const STATE = {
    debug: false,
    nameLock: {
      enabled: true,
      mode: "IF_EMPTY", 
      protectWithObserver: true,
    },
    fillPolicy: {
      skipIfNotEmpty: true,
      dryRun: false,
    },
    locked: {
      entries: new Map(),
      observer: null,
    },
  };

  function log(...args) {
    if (STATE.debug) console.log("[CV Asistan]", ...args);
  }

  function warn(...args) {
    console.warn("[CV Asistan]", ...args);
  }

  function error(...args) {
    console.error("[CV Asistan]", ...args);
  }

  function getFrameInfo() {
    return {
      href: location.href,
      frame: window.top === window ? "top" : "iframe",
    };
  }

  function setDebug(v) {
    STATE.debug = !!v;
  }

  function applySettings(settings = {}) {
    try {
      if (typeof settings.debug === "boolean") STATE.debug = settings.debug;

      if (settings.nameLock) {
        STATE.nameLock.enabled = !!settings.nameLock.enabled;
        STATE.nameLock.mode = settings.nameLock.mode || STATE.nameLock.mode;
        STATE.nameLock.protectWithObserver =
          settings.nameLock.mode === "PROTECT";
      }
      if (settings.fillPolicy) {
        STATE.fillPolicy.skipIfNotEmpty =
          settings.fillPolicy.skipIfNotEmpty !== false;
        STATE.fillPolicy.dryRun = !!settings.fillPolicy.dryRun;
      }
    } catch (e) {
      warn("applySettings error:", e);
    }
  }

  function shouldNeverFillElement(el) {
    try {
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "password") return true;
      }
      const name = (
        (el.getAttribute("name") || "") +
        " " +
        (el.getAttribute("id") || "")
      ).toLowerCase();
      if (/cc|credit|card|cvv|cvc|iban|swift|pass(word)?/i.test(name))
        return true;
      return false;
    } catch {
      return false;
    }
  }

  function isNameFieldType(t) {
    return t === "firstName" || t === "lastName" || t === "fullName";
  }

  function enforceNameLockDecision(el, fieldType, profile, report) {
    if (!STATE.nameLock.enabled) return { allowed: true, reason: "" };
    if (!isNameFieldType(fieldType)) return { allowed: true, reason: "" };

    const current = (el.value || "").trim();
    const desired = (profile[fieldType] || "").trim();

    if (STATE.nameLock.mode === "NEVER") {
      return { allowed: false, reason: "name-lock: NEVER (skip)" };
    }

    if (STATE.nameLock.mode === "IF_EMPTY") {
      if (current) {
        return {
          allowed: false,
          reason: "name-lock: IF_EMPTY and already filled",
        };
      }
      if (!desired) {
        return { allowed: false, reason: "name-lock: no desired value" };
      }
      return { allowed: true, reason: "" };
    }

    if (STATE.nameLock.mode === "PROTECT") {
      if (current && current !== desired) {
        return {
          allowed: false,
          reason: "name-lock: PROTECT and value differs (refuse override)",
        };
      }
      return { allowed: true, reason: "" };
    }

    return { allowed: true, reason: "" };
  }

  function ensureNameObserver() {
    if (!STATE.nameLock.enabled) return;
    if (STATE.nameLock.mode !== "PROTECT") return;

    if (STATE.locked.observer) return;

    const obs = new MutationObserver(() => {
      try {
        for (const [el, expected] of STATE.locked.entries) {
          if (!el || !document.contains(el)) continue;
          const cur = (el.value || "").trim();
          if (cur !== expected) {
            log("Name lock restore:", { cur, expected, el });
            U.setNativeValue(el, expected);
          }
        }
      } catch (e) {
        warn("Name observer error:", e);
      }
    });

    obs.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["value"],
    });

    STATE.locked.observer = obs;
  }

  function addLockedEntry(el, expectedValue) {
    try {
      if (!el) return;
      STATE.locked.entries.set(el, (expectedValue || "").trim());
      ensureNameObserver();
    } catch (e) {
      warn("addLockedEntry error:", e);
    }
  }

  function makeOverlay(text) {
    try {
      if (!STATE.debug) return;
      const existing = document.getElementById("cva-debug-overlay");
      if (existing) existing.remove();

      const div = document.createElement("div");
      div.id = "cva-debug-overlay";
      div.style.position = "fixed";
      div.style.right = "12px";
      div.style.bottom = "12px";
      div.style.zIndex = "2147483647";
      div.style.maxWidth = "360px";
      div.style.padding = "10px";
      div.style.background = "rgba(0,0,0,0.75)";
      div.style.color = "white";
      div.style.fontSize = "12px";
      div.style.borderRadius = "10px";
      div.style.whiteSpace = "pre-wrap";
      div.style.boxShadow = "0 6px 22px rgba(0,0,0,0.35)";
      div.textContent = text;

      const btn = document.createElement("button");
      btn.textContent = "Kapat";
      btn.style.marginTop = "8px";
      btn.style.cursor = "pointer";
      btn.onclick = () => div.remove();
      div.appendChild(document.createElement("br"));
      div.appendChild(btn);

      document.body.appendChild(div);
    } catch (e) {
    }
  }

  function collectFillTargets() {
    const candidates = U.buildCandidateList({ includeShadow: true });

    const fillables = candidates
      .filter(U.isFillableElement)
      .filter(U.isVisible)
      .filter((el) => !shouldNeverFillElement(el));

    return fillables;
  }

  const FIELD_TYPES = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "phone",
    "addressLine",
    "city",
    "state",
    "postalCode",
    "country",
    "linkedin",
    "github",
    "website",
    "dateOfBirth",
    "summary",
    "coverLetter",
    "graduationYear",
    "experienceYears",
    "salaryExpectation",
  ];

  function chooseBestMatch(el, enabledTypes) {
    let best = { type: null, score: -999999, reasons: [] };
    for (const t of enabledTypes) {
      const r = U.scoreFieldType(el, t);
      if (r.score > best.score)
        best = { type: t, score: r.score, reasons: r.reasons };
    }
    return best;
  }

  function fillInputs(profile, opts = {}) {
    const startedAt = Date.now();
    const enabledTypes =
      opts.enabledTypes && Array.isArray(opts.enabledTypes)
        ? opts.enabledTypes
        : FIELD_TYPES;

    const report = {
      frame: getFrameInfo(),
      stats: { filled: 0, skipped: 0, matched: 0, errors: 0 },
      items: [],
      debug: { enabledTypes, dryRun: STATE.fillPolicy.dryRun },
    };

    try {
      const targets = collectFillTargets();
      const matches = [];

      for (const el of targets) {
        const best = chooseBestMatch(el, enabledTypes);
        if (best.score < 35) continue;

        matches.push({
          el,
          type: best.type,
          score: best.score,
          reasons: best.reasons,
          top: U.withinTopForm(el),
        });
      }

      matches.sort((a, b) => b.score - a.score || a.top - b.top);

      const usedTypesCount = new Map();
      const assigned = [];

      for (const m of matches) {
        const el = m.el;
        const type = m.type;
        let desired = (profile[type] || "").trim();

        if (type === "coverLetter" && !desired) {
          desired = (profile.summary || "").trim();
        }

        if (!desired) continue;

        const count = usedTypesCount.get(type) || 0;

        if (type === "fullName") {
          const nm = (
            (el.getAttribute("name") || "") +
            " " +
            (el.getAttribute("id") || "")
          ).toLowerCase();
          if (/(first|given)[-_ ]?name|fname|ad\b|isim\b/i.test(nm)) continue;
          if (/(last|family|sur)[-_ ]?name|lname|soyad/i.test(nm)) continue;
        }

        assigned.push(m);

        usedTypesCount.set(type, count + 1);
      }

      report.stats.matched = assigned.length;

      const debugLines = [];

      for (const m of assigned) {
        const el = m.el;
        const type = m.type;
        const desired = (profile[type] || "").trim();

        const current = (el.value || "").trim();

        if (STATE.fillPolicy.skipIfNotEmpty && current) {
          report.stats.skipped++;
          report.items.push({
            type,
            score: m.score,
            action: "skipped",
            reason: "not-empty (skipIfNotEmpty)",
            current,
          });
          continue;
        }

        const lockDecision = enforceNameLockDecision(el, type, profile, report);
        if (!lockDecision.allowed) {
          report.stats.skipped++;
          report.items.push({
            type,
            score: m.score,
            action: "skipped",
            reason: lockDecision.reason,
            current,
          });
          continue;
        }

        if (STATE.fillPolicy.dryRun) {
          report.items.push({
            type,
            score: m.score,
            action: "dry-run",
            reason: "dry-run enabled",
            to: desired,
          });
          continue;
        }

        const res = U.setNativeValue(el, desired);
        if (!res.ok) {
          report.stats.errors++;
          report.items.push({
            type,
            score: m.score,
            action: "error",
            reason: res.error || "setNativeValue failed",
          });
          continue;
        }

        report.stats.filled++;
        report.items.push({
          type,
          score: m.score,
          action: "filled",
          from: res.from,
          to: res.to,
        });

        if (
          STATE.nameLock.enabled &&
          STATE.nameLock.mode === "PROTECT" &&
          isNameFieldType(type)
        ) {
          addLockedEntry(el, desired);
        }

        if (STATE.debug) {
          debugLines.push(
            `✅ ${type} (${Math.round(m.score)}) -> "${desired}"\n  reasons: ${m.reasons.slice(0, 3).join(", ")}`,
          );
        }
      }

      if (STATE.debug) {
        makeOverlay(
          `CV Asistan Debug (${report.frame.frame})\n` +
            `Filled: ${report.stats.filled}, Skipped: ${report.stats.skipped}, Errors: ${report.stats.errors}\n\n` +
            debugLines.slice(0, 12).join("\n\n"),
        );
      }

      log("Fill report:", report);
    } catch (e) {
      report.stats.errors++;
      report.items.push({ action: "fatal", reason: String(e) });
      error("fillInputs fatal:", e);
    }

    report.timingMs = Date.now() - startedAt;
    return report;
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    (async () => {
      try {
        if (!request || !request.action) return;

        if (request.action === "PING") {
          sendResponse({ ok: true, ...getFrameInfo() });
          return;
        }

        if (request.action === "TOGGLE_DEBUG") {
          setDebug(!!request.debug);
          sendResponse({ ok: true, debug: STATE.debug, ...getFrameInfo() });
          return;
        }

        if (request.action === "FILL_FORM") {
          const rawProfile = request.profile || {};
          const settings = request.settings || {};
          const opts = request.options || {};

          applySettings(settings);

          const profile = U.normalizeProfile(rawProfile);

          const report = fillInputs(profile, opts);
          sendResponse({ ok: true, report });
          return;
        }
      } catch (e) {
        error("Content script error:", e);
        sendResponse({ ok: false, error: String(e), ...getFrameInfo() });
      }
    })();

    return true;
  });
})();
