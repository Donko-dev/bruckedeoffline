/**
 * app.js — BrückeDeOffline (BDE)
 * ---------------------------------------------------------------------------
 * Sommaire :
 *   1. Constantes & configuration
 *   2. Stockage local (Store)
 *   3. Identifiant unique (génération, validation, checksum)
 *   4. Adaptateur de synchronisation multi-appareil (désactivé par défaut)
 *   5. Assainisseur HTML (protège contre le XSS dans le contenu éditable)
 *   6. Déchiffrement des cours (miroir de admin.html)
 *   7. État global
 *   8. i18n (résolution de chaînes avec repli automatique)
 *   9. Thème & mise en page (piloté par data.json > config, via admin.html)
 *  10. Détection réseau & activation dynamique des modules hybrides
 *  11. Écran d'accueil (langue puis identifiant)
 *  12. Rendu de l'interface (en-tête, sections, pied de page)
 *  13. Moteur du test de positionnement CECRL
 *  14. Service Worker & mises à jour
 *  15. Démarrage
 * ---------------------------------------------------------------------------
 * Aucun élément de cours n'est jamais injecté dans le DOM sans passer par
 * sanitizeHtml() — voir section 5.
 */
"use strict";

/* ========================================================================
   1. CONSTANTES & CONFIGURATION
   ======================================================================== */
const DATA_URL = "./data.json";

const STORAGE_KEYS = {
  userId: "bde_user_id",
  language: "bde_language",
  themeMode: "bde_theme_mode",
  progress: "bde_progress",
  onboardingDone: "bde_onboarding_done"
};

// Alphabet volontairement privé de 0/O/1/I/L pour éviter toute confusion
// à la recopie manuelle de l'identifiant.
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_BODY_LENGTH = 8;

// ATTENTION — voir README.md section "Sécurité : ce que le chiffrement
// protège réellement". Cette clé doit être identique à celle saisie dans
// admin.html au moment de l'export pour que le déchiffrement fonctionne.
// Comme ce fichier est livré au navigateur, cette clé n'est PAS un secret :
// elle relève de l'obfuscation (dissuader le copier-coller trivial), pas
// d'un vrai contrôle d'accès.
const APP_DECRYPT_PASSPHRASE = "bde-2026-change-cette-cle-dans-admin";

/* ========================================================================
   2. STOCKAGE LOCAL
   ======================================================================== */
const Store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn("Store.get a échoué pour", key, err);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("Store.set a échoué pour", key, err);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (err) { /* navigation privée, quota, etc. */ }
  }
};

/* ========================================================================
   3. IDENTIFIANT UNIQUE
   ======================================================================== */
function secureRandomIndex(max) {
  const range = 256 - (256 % max);
  const bytes = new Uint8Array(1);
  let x;
  do {
    crypto.getRandomValues(bytes);
    x = bytes[0];
  } while (x >= range);
  return x % max;
}

function computeChecksumChar(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += ID_ALPHABET.indexOf(body[i]) * (i + 1);
  }
  return ID_ALPHABET[sum % ID_ALPHABET.length];
}

function generateUniqueId() {
  let body = "";
  for (let i = 0; i < ID_BODY_LENGTH; i++) {
    body += ID_ALPHABET[secureRandomIndex(ID_ALPHABET.length)];
  }
  return `BDE-${body}-${computeChecksumChar(body)}`;
}

function isValidIdFormat(id) {
  const cleaned = (id || "").trim().toUpperCase();
  const match = /^BDE-([2-9A-Z]{8})-([2-9A-Z])$/.exec(cleaned);
  if (!match) return false;
  const [, body, checksum] = match;
  for (const ch of body) {
    if (!ID_ALPHABET.includes(ch)) return false;
  }
  return computeChecksumChar(body) === checksum;
}

/* ========================================================================
   4. ADAPTATEUR DE SYNCHRONISATION MULTI-APPAREIL
   ------------------------------------------------------------------------
   Désactivé par défaut (data.json > sync.enabled = false) : l'application
   reste alors 100% locale à l'appareil, exactement comme demandé. Pour
   activer la synchronisation multi-appareil, un backend doit être configuré
   (voir README.md section 4 — Firebase/Supabase recommandés plutôt que
   Google Sheets, pour des raisons de limites de requêtes et de sécurité).
   ======================================================================== */
const SyncAdapter = {
  isEnabled() {
    return Boolean(AppState.data && AppState.data.sync && AppState.data.sync.enabled && AppState.data.sync.endpoint);
  },
  async push(id, payload) {
    if (!this.isEnabled()) return { ok: false, reason: "sync-disabled" };
    try {
      const res = await fetch(`${AppState.data.sync.endpoint}?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { ok: res.ok };
    } catch (err) {
      return { ok: false, reason: "network-error" };
    }
  },
  async pull(id) {
    if (!this.isEnabled()) return { ok: false, reason: "sync-disabled" };
    try {
      const res = await fetch(`${AppState.data.sync.endpoint}?id=${encodeURIComponent(id)}`);
      if (!res.ok) return { ok: false, reason: "not-found" };
      const payload = await res.json();
      return { ok: true, payload };
    } catch (err) {
      return { ok: false, reason: "network-error" };
    }
  }
};

/* ========================================================================
   5. ASSAINISSEUR HTML (contenu des cours = HTML éditable par admin.html)
   ------------------------------------------------------------------------
   Liste blanche stricte de balises/attributs. Toute balise refusée est
   remplacée par son seul contenu texte (rien n'est exécuté, rien n'est
   perdu silencieusement). Défense en profondeur : admin.html assainit déjà
   à la saisie, ceci protège aussi le rendu côté utilisateur final.
   ======================================================================== */
const ALLOWED_TAGS = new Set([
  "P", "STRONG", "EM", "B", "I", "U", "H3", "H4", "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "AUDIO", "VIDEO", "IMG", "IFRAME", "BR", "SPAN"
]);
const ALLOWED_ATTRS = {
  AUDIO: new Set(["controls", "src"]),
  VIDEO: new Set(["controls", "src", "playsinline"]),
  IMG: new Set(["src", "alt"]),
  IFRAME: new Set(["src", "title", "loading", "allow", "allowfullscreen"])
};

// Validation stricte par balise/attribut, en plus de la liste blanche de
// balises. C'est ce qui empêche un <iframe> d'être pointé n'importe où
// (uniquement l'intégration officielle YouTube-nocookie est acceptée) et
// bloque tout schéma d'URL "javascript:" sur les sources.
function isSafeAttrValue(tagName, attrName, value) {
  const v = value || "";
  if (/^javascript:/i.test(v)) return false;
  if (attrName !== "src") return true;
  if (tagName === "IFRAME") {
    return /^https:\/\/www\.youtube-nocookie\.com\/embed\/[a-zA-Z0-9_-]{11}(\?[a-zA-Z0-9=&_-]*)?$/.test(v);
  }
  if (tagName === "IMG") {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(v)
      || /^https:\/\//i.test(v)
      || /^[a-zA-Z0-9._-]+\.(png|jpe?g|gif|webp|svg)$/i.test(v);
  }
  if (tagName === "VIDEO" || tagName === "AUDIO") {
    return /^https:\/\//i.test(v) || /^[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/.test(v);
  }
  return false;
}

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = doc.body.firstChild;

  function clean(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ""));
          return;
        }
        const allowed = ALLOWED_ATTRS[child.tagName] || new Set();
        [...child.attributes].forEach((attr) => {
          const safe = allowed.has(attr.name) && isSafeAttrValue(child.tagName, attr.name, attr.value);
          if (!safe) child.removeAttribute(attr.name);
        });
        if (child.tagName === "IFRAME" && !child.getAttribute("src")) {
          child.replaceWith(document.createTextNode(""));
          return;
        }
        clean(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  }

  clean(root);
  return root.innerHTML;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ========================================================================
   6. DÉCHIFFREMENT DES COURS
   ------------------------------------------------------------------------
   Miroir exact du chiffrement effectué par admin.html au moment de
   l'export (voir admin.html > exportData()). Si data.cours.encrypted est
   faux (valeur livrée par défaut dans ce projet), les cours sont utilisés
   tels quels.
   ======================================================================== */
function resolveCoursData(rawCours) {
  if (!rawCours) return { levels: [] };
  if (!rawCours.encrypted) return rawCours;
  if (typeof CryptoJS === "undefined") {
    console.error("CryptoJS indisponible : impossible de déchiffrer les cours (hors ligne au premier chargement ?).");
    return { levels: [], decryptionFailed: true };
  }
  try {
    const bytes = CryptoJS.AES.decrypt(rawCours.payload, APP_DECRYPT_PASSPHRASE);
    const json = bytes.toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error("Résultat vide : clé probablement incorrecte.");
    return JSON.parse(json);
  } catch (err) {
    console.error("Échec du déchiffrement des cours :", err);
    return { levels: [], decryptionFailed: true };
  }
}

/* ========================================================================
   7. ÉTAT GLOBAL
   ======================================================================== */
const AppState = {
  data: null,
  cours: null,
  lang: "fr",
  online: navigator.onLine,
  userId: null,
  route: "home",
  testSession: null
};

const SYSTEM_MESSAGES = {
  fr: {
    restoreLocalOnly: "Aucune synchronisation en ligne n'est configurée pour cette installation : votre identifiant est bien enregistré sur cet appareil, mais votre progression repart de zéro tant que l'administrateur n'aura pas activé la synchronisation (voir README.md).",
    dataUpdated: "Du nouveau contenu a été téléchargé en arrière-plan et sera utilisé au prochain démarrage."
  },
  en: {
    restoreLocalOnly: "No online sync is configured for this installation: your ID is saved on this device, but your progress starts fresh until the site owner enables sync (see README.md).",
    dataUpdated: "New content was downloaded in the background and will be used next time you open the app."
  }
};
function sysMsg(key) {
  return (SYSTEM_MESSAGES[AppState.lang] || SYSTEM_MESSAGES.en)[key] || SYSTEM_MESSAGES.en[key];
}

/* ========================================================================
   8. I18N
   ======================================================================== */
function t(key) {
  const chain = [AppState.lang, "en", "fr"];
  for (const lang of chain) {
    const dict = AppState.data && AppState.data.i18n && AppState.data.i18n[lang];
    if (dict && Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  }
  return key;
}

function isCurrentLangComplete() {
  const meta = AppState.data.languages.find((l) => l.code === AppState.lang);
  return Boolean(meta && meta.complete);
}

/* ========================================================================
   9. THÈME & MISE EN PAGE
   ======================================================================== */
function applyTheme() {
  const theme = AppState.data.config.theme;
  const root = document.documentElement;
  const mode = Store.get(STORAGE_KEYS.themeMode) || theme.mode || "light";
  root.setAttribute("data-theme", mode);

  const c = theme.colors || {};
  const vars = {
    "--color-primary": mode === "dark" ? c.primaryDark : c.primary,
    "--color-secondary": mode === "dark" ? c.secondaryDark : c.secondary,
    "--color-accent": mode === "dark" ? c.accentDark : c.accent,
    "--color-info": c.info,
    "--color-bg": mode === "dark" ? c.backgroundDark : c.backgroundLight,
    "--color-surface": mode === "dark" ? c.surfaceDark : c.surfaceLight,
    "--color-text": mode === "dark" ? c.textDark : c.textLight,
    "--color-on-primary": c.buttonTextOnPrimary
  };
  Object.entries(vars).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });

  if (theme.font) {
    if (theme.font.display) root.style.setProperty("--font-display", theme.font.display);
    if (theme.font.body) root.style.setProperty("--font-body", theme.font.body);
  }

  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = mode === "dark" ? "☀️" : "🌙";
}

function toggleThemeMode() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  Store.set(STORAGE_KEYS.themeMode, next);
  applyTheme();
}

function applyLanguageDirection() {
  const meta = AppState.data.languages.find((l) => l.code === AppState.lang);
  document.documentElement.setAttribute("lang", AppState.lang);
  document.documentElement.setAttribute("dir", meta && meta.rtl ? "rtl" : "ltr");
}

function isFeatureEnabled(key) {
  const features = AppState.data.config.features || {};
  return features[key] !== false;
}

/* ========================================================================
   10. RÉSEAU & MODULES HYBRIDES
   ======================================================================== */
function updateOnlineStatus() {
  AppState.online = navigator.onLine;
  const pill = document.getElementById("status-pill");
  if (pill) {
    pill.classList.toggle("is-online", AppState.online);
    pill.classList.toggle("is-offline", !AppState.online);
    pill.querySelector(".status-pill__text").textContent = AppState.online ? t("online") : t("offline");
  }
  // Réactive/désactive dynamiquement les modules hybrides sans rechargement.
  document.querySelectorAll("[data-requires-online]").forEach((el) => {
    el.classList.toggle("is-locked", !AppState.online);
  });
  const donateNotice = document.getElementById("donate-offline-notice");
  if (donateNotice) donateNotice.style.display = AppState.online ? "none" : "flex";
  const donateBtn = document.getElementById("donate-btn");
  if (donateBtn) donateBtn.classList.toggle("is-disabled", !AppState.online);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

/* ========================================================================
   11. ÉCRAN D'ACCUEIL (langue puis identifiant)
   ======================================================================== */
function showOnboarding() {
  const overlay = document.getElementById("onboarding-overlay");
  overlay.innerHTML = "";
  overlay.style.display = "flex";
  renderLanguageStep();
}

function hideOnboarding() {
  const overlay = document.getElementById("onboarding-overlay");
  overlay.style.display = "none";
  overlay.innerHTML = "";
}

function sheet(contentHtml) {
  return `<div class="onboarding-sheet" role="dialog" aria-modal="true">${contentHtml}</div>`;
}

function renderLanguageStep() {
  const overlay = document.getElementById("onboarding-overlay");
  const langs = AppState.data.languages.map((l) =>
    `<button class="lang-choice" data-lang="${escapeHtml(l.code)}" type="button">${escapeHtml(l.label)}</button>`
  ).join("");

  overlay.innerHTML = sheet(`
    <div class="onboarding-sheet__icon">🌍</div>
    <h2>${escapeHtml(t("chooseLanguageTitle"))}</h2>
    <p class="onboarding-sheet__subtitle">${escapeHtml(t("chooseLanguageSubtitle"))}</p>
    <div class="lang-grid">${langs}</div>
  `);

  overlay.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      AppState.lang = btn.getAttribute("data-lang");
      Store.set(STORAGE_KEYS.language, AppState.lang);
      applyLanguageDirection();
      renderWelcomeStep();
    });
  });
}

function renderWelcomeStep() {
  const overlay = document.getElementById("onboarding-overlay");
  overlay.innerHTML = sheet(`
    <div class="onboarding-sheet__icon">👋</div>
    <h2>${escapeHtml(t("welcomeTitle"))}</h2>
    <p class="onboarding-sheet__subtitle">${escapeHtml(t("welcomeSubtitle"))}</p>
    <div class="notice-box">🔑 ${escapeHtml(t("idExplanation"))}</div>
    <div class="stack">
      <button id="ob-generate" class="btn btn-primary btn-block" type="button">🔑 ${escapeHtml(t("generateIdButton"))}</button>
      <button id="ob-restore-link" class="link-btn" type="button">${escapeHtml(t("restoreIdButton"))}</button>
    </div>
  `);
  document.getElementById("ob-generate").addEventListener("click", renderGeneratedIdStep);
  document.getElementById("ob-restore-link").addEventListener("click", renderRestoreStep);
}

function renderGeneratedIdStep() {
  const overlay = document.getElementById("onboarding-overlay");
  const newId = generateUniqueId();
  overlay.innerHTML = sheet(`
    <div class="onboarding-sheet__icon">✅</div>
    <h2>${escapeHtml(t("yourIdIs"))}</h2>
    <div class="id-display"><code>${escapeHtml(newId)}</code>
      <button id="ob-copy" class="btn btn-secondary btn-sm" type="button">${escapeHtml(t("copyId"))}</button>
    </div>
    <div class="notice-box">⚠️ ${escapeHtml(t("idWarningSave"))}</div>
    <button id="ob-continue" class="btn btn-primary btn-block" type="button">${escapeHtml(t("continue"))}</button>
  `);

  document.getElementById("ob-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(newId);
      const btn = document.getElementById("ob-copy");
      btn.textContent = t("idCopied");
      setTimeout(() => { btn.textContent = t("copyId"); }, 1500);
    } catch (err) { /* Presse-papiers indisponible : l'utilisateur peut sélectionner le texte manuellement. */ }
  });

  document.getElementById("ob-continue").addEventListener("click", () => {
    completeOnboarding(newId);
  });
}

function renderRestoreStep() {
  const overlay = document.getElementById("onboarding-overlay");
  overlay.innerHTML = sheet(`
    <div class="onboarding-sheet__icon">🔁</div>
    <h2>${escapeHtml(t("restoreTitle"))}</h2>
    <div class="field">
      <label for="ob-restore-input">${escapeHtml(t("restoreInputLabel"))}</label>
      <input id="ob-restore-input" type="text" autocomplete="off" autocapitalize="characters"
             placeholder="${escapeHtml(t("restoreInputPlaceholder"))}">
      <div id="ob-restore-error" class="error-box" style="display:none;"></div>
    </div>
    <div class="stack">
      <button id="ob-restore-submit" class="btn btn-primary btn-block" type="button">${escapeHtml(t("restoreSubmit"))}</button>
      <button id="ob-restore-back" class="link-btn" type="button">${escapeHtml(t("restoreBack"))}</button>
    </div>
  `);

  document.getElementById("ob-restore-back").addEventListener("click", renderWelcomeStep);
  document.getElementById("ob-restore-submit").addEventListener("click", async () => {
    const input = document.getElementById("ob-restore-input");
    const errorBox = document.getElementById("ob-restore-error");
    const id = input.value.trim().toUpperCase();

    if (!isValidIdFormat(id)) {
      errorBox.textContent = t("restoreError");
      errorBox.style.display = "block";
      return;
    }

    if (SyncAdapter.isEnabled()) {
      if (!AppState.online) {
        errorBox.textContent = t("restoreOfflineError");
        errorBox.style.display = "block";
        return;
      }
      const result = await SyncAdapter.pull(id);
      if (!result.ok) {
        errorBox.textContent = t("restoreError");
        errorBox.style.display = "block";
        return;
      }
      if (result.payload) Store.set(STORAGE_KEYS.progress, result.payload);
      completeOnboarding(id);
    } else {
      completeOnboarding(id);
      showToast(sysMsg("restoreLocalOnly"));
    }
  });
}

function completeOnboarding(id) {
  AppState.userId = id;
  Store.set(STORAGE_KEYS.userId, id);
  Store.set(STORAGE_KEYS.onboardingDone, true);
  hideOnboarding();
  renderApp();
}

/* ========================================================================
   12. RENDU DE L'INTERFACE
   ======================================================================== */
function showToast(message, duration = 4000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("is-visible"), duration);
}

// Registre des sections navigables : relie un identifiant de route (utilisé
// par config.layout dans data.json, éditable visuellement depuis l'onglet
// "Mise en page" de admin.html) à sa route interne, son libellé i18n et,
// le cas échéant, à l'interrupteur de config.features qui peut le masquer.
const NAV_SECTIONS = {
  home: { route: "home", labelKey: "navHome" },
  test: { route: "test", labelKey: "navTest" },
  courses: { route: "courses", labelKey: "navCourses" },
  germanyGuide: { route: "guide", labelKey: "navGuide", featureKey: "germanyGuide" },
  visaHub: { route: "visa", labelKey: "navVisa", featureKey: "visaHub" },
  donate: { route: "donate", labelKey: "navDonate", featureKey: "donationWidget" },
  contact: { route: "contact", labelKey: "navContact" }
};

function getOrderedNavSections() {
  const layout = (AppState.data.config.layout || Object.keys(NAV_SECTIONS)).filter((id) => NAV_SECTIONS[id]);
  // Ajoute en fin de liste toute section connue mais absente de config.layout
  // (garde-fou si un ancien data.json ne liste pas encore toutes les routes).
  Object.keys(NAV_SECTIONS).forEach((id) => { if (!layout.includes(id)) layout.push(id); });
  return layout
    .map((id) => NAV_SECTIONS[id])
    .filter((section) => !section.featureKey || isFeatureEnabled(section.featureKey));
}

function renderHeader() {
  const header = document.getElementById("site-header");
  const meta = AppState.data.meta;
  const navLinks = getOrderedNavSections()
    .map((s) => `<a href="#${s.route}" data-route="${s.route}">${escapeHtml(t(s.labelKey))}</a>`)
    .join("");

  header.innerHTML = `
    <div class="site-header__bar">
      <a href="#home" class="brand">
        <img src="logo.png" alt="" class="brand__mark" width="34" height="34">
        <span class="brand__name">${escapeHtml(meta.appName)}<small>${escapeHtml(meta.appAcronym)} · ${escapeHtml(t("appTagline"))}</small></span>
      </a>
      <div class="header-controls">
        <span id="status-pill" class="status-pill"><span class="status-pill__dot"></span><span class="status-pill__text"></span></span>
        <button id="theme-toggle" class="icon-btn" type="button" aria-label="Thème" title="Thème">🌙</button>
        <button id="lang-toggle" class="icon-btn" type="button" aria-label="Langue" title="Langue">🌐</button>
      </div>
    </div>
    <nav class="main-nav" id="main-nav">${navLinks}</nav>
  `;
  document.getElementById("theme-toggle").addEventListener("click", toggleThemeMode);
  document.getElementById("lang-toggle").addEventListener("click", showOnboarding);
  updateOnlineStatus();
}

function renderFooter() {
  const footer = document.getElementById("site-footer");
  const meta = AppState.data.meta;
  footer.innerHTML = `
    <div class="container">
      <p><strong>${escapeHtml(meta.footer)}</strong></p>
      <div class="site-footer__links">
        <a href="#contact">${escapeHtml(t("navContact"))}</a>
        <a href="${escapeHtml(meta.donation.url)}" target="_blank" rel="noopener">${escapeHtml(t("navDonate"))}</a>
      </div>
      <!-- Le panneau d'administration n'est délibérément pas lié ici : voir
           README.md > "Sécurité". Il reste accessible uniquement à qui
           connaît son URL directe (admin.html), non référencée ni indexée. -->
    </div>
  `;
}

function archDivider() {
  return `<div class="arch-divider" aria-hidden="true"><svg viewBox="0 0 400 28" preserveAspectRatio="none"><path d="M0,28 L150,28 A50,26 0 0 1 250,28 L400,28"/></svg></div>`;
}

function renderRoute(route) {
  AppState.route = route;
  document.querySelectorAll("#main-nav a").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.route === route);
  });
  const root = document.getElementById("app-root");
  const renderers = {
    home: renderHome, test: renderPlacementTestIntro, courses: renderCourses,
    guide: renderGermanyGuide, visa: renderVisaHub, donate: renderDonationSection, contact: renderContactSection
  };
  const renderer = renderers[route] || renderHome;
  root.innerHTML = renderer();
  attachRouteHandlers(route);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderHome() {
  const progress = Store.get(STORAGE_KEYS.progress, {});
  const levels = AppState.data.cecrl.levels;
  const currentLevel = progress.testResult ? progress.testResult.level : null;
  const currentIndex = currentLevel ? levels.indexOf(currentLevel) : -1;

  const piers = levels.map((lvl, i) => {
    const state = i < currentIndex ? "is-done" : i === currentIndex ? "is-current" : "";
    return `<div class="pier ${state}"><span class="pier__dot"></span><span class="pier__label">${lvl}</span></div>`;
  }).join("");
  const fillPct = currentIndex >= 0 ? Math.round(((currentIndex + 1) / levels.length) * 100) : 0;

  return `
    <section class="hero container">
      <p class="hero__eyebrow">${escapeHtml(AppState.data.meta.appAcronym)} · CECRL A1.1 → C2</p>
      <h1>${escapeHtml(AppState.data.meta.appName)}</h1>
      <p class="hero__lead">${escapeHtml(t("appTagline"))} — ${escapeHtml(AppState.data.meta.legalNotice)}</p>
      <div class="hero__actions">
        <button class="btn btn-primary" data-nav="test">${escapeHtml(t("navTest"))}</button>
        <button class="btn btn-secondary" data-nav="courses">${escapeHtml(t("navCourses"))}</button>
      </div>
      <div class="bridge-progress">
        <div class="bridge-progress__label"><span>A1</span><span>C2</span></div>
        <div class="bridge-progress__track">
          <div class="bridge-progress__deck"></div>
          <div class="bridge-progress__fill" style="width:${fillPct}%"></div>
          <div class="bridge-progress__piers">${piers}</div>
        </div>
      </div>
    </section>
    ${archDivider()}
  `;
}

function attachRouteHandlers(route) {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => { location.hash = `#${btn.dataset.nav}`; });
  });
  if (route === "test") attachPlacementTestHandlers();
  if (route === "courses") attachCoursesHandlers();
  if (route === "guide") attachGuideHandlers();
  if (route === "visa") attachVisaHandlers();
  if (route === "donate") attachDonateHandlers();
}

/* ---- Cours ---- */
const LEVEL_FEATURE_KEYS = { B2: "showB2", C1: "showC1", C2: "showC2" };

function renderCourses() {
  const cours = AppState.cours;
  if (!cours || cours.decryptionFailed) {
    return `<section class="section container"><div class="card">⚠️ ${escapeHtml(t("offlineNotice"))}</div></section>`;
  }
  const visibleLevels = cours.levels.filter((lvl) => {
    const key = LEVEL_FEATURE_KEYS[lvl.code];
    return !key || isFeatureEnabled(key);
  });
  if (!visibleLevels.length) {
    return `<section class="section container"><div class="card">${escapeHtml(t("navCourses"))}</div></section>`;
  }
  return renderCoursesFromLevels(visibleLevels);
}

function renderCoursesFromLevels(levels) {
  const cours = { levels };
  const tabs = cours.levels.map((lvl, i) =>
    `<button class="level-tab ${i === 0 ? "is-active" : ""}" data-level="${escapeHtml(lvl.code)}" type="button">${escapeHtml(lvl.code)}</button>`
  ).join("");
  const panels = cours.levels.map((lvl, i) => `
    <div class="level-panel" data-level-panel="${escapeHtml(lvl.code)}" style="${i === 0 ? "" : "display:none;"}">
      <h3>${escapeHtml(lvl.title)}</h3>
      ${lvl.lessons.map((lesson) => `
        <div class="card lesson-body" style="margin-bottom:16px;">
          <h4>${escapeHtml(lesson.title)}</h4>
          ${sanitizeHtml(lesson.contentHtml)}
        </div>
      `).join("") || `<p>${escapeHtml(t("loading"))}</p>`}
    </div>
  `).join("");

  return `
    <section class="section container">
      <div class="section__head"><h2>${escapeHtml(t("navCourses"))}</h2></div>
      <div class="level-tabs">${tabs}</div>
      ${panels}
    </section>
  `;
}
function attachCoursesHandlers() {
  document.querySelectorAll(".level-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".level-tab").forEach((b) => b.classList.remove("is-active"));
      tab.classList.add("is-active");
      const level = tab.dataset.level;
      document.querySelectorAll("[data-level-panel]").forEach((panel) => {
        panel.style.display = panel.dataset.levelPanel === level ? "" : "none";
      });
    });
  });
}

/* ---- Médiathèque (photos / audio / vidéos locales / YouTube intégré) ---- */
function renderMediaItemCard(item) {
  const isOnlineOnly = item.type === "youtube";
  let body = "";

  if (item.type === "photo" && isSafeAttrValue("IMG", "src", item.src)) {
    body = `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title || "")}">`;
  } else if (item.type === "video" && isSafeAttrValue("VIDEO", "src", item.src)) {
    body = `<video controls playsinline src="${escapeHtml(item.src)}"></video>`;
  } else if (item.type === "youtube") {
    const embedSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.src || "")}`;
    if (!isSafeAttrValue("IFRAME", "src", embedSrc)) return "";
    body = `
      <div class="media-item__lock-overlay">🔌 ${escapeHtml(t("offlineNotice"))}</div>
      <iframe src="${escapeHtml(embedSrc)}" title="${escapeHtml(item.title || "Vidéo YouTube")}" loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    return "";
  }

  return `
    <div class="media-item"${isOnlineOnly ? " data-requires-online" : ""}>
      <div class="media-item__frame">${body}</div>
      ${item.title ? `<h4>${escapeHtml(item.title)}</h4>` : ""}
      ${item.caption ? `<p class="media-item__caption">${escapeHtml(item.caption)}</p>` : ""}
    </div>
  `;
}

/* ---- Guide Allemagne ---- */
function renderGermanyGuide() {
  const guide = AppState.data.germanyGuide;
  const galleryItems = (AppState.data.media || []).filter((m) => m.category === "guide" && m.type !== "audio");
  const gallery = galleryItems.map(renderMediaItemCard).join("");
  const laender = guide.laender.map((l) => `
    <div class="card land-card">
      <h4>${escapeHtml(l.name)}</h4>
      <div class="land-meta">${escapeHtml(l.capital)} · ${escapeHtml(l.population)}</div>
      <p>${escapeHtml(l.description)}</p>
    </div>
  `).join("");
  const civicLaws = guide.civicLaws.map((law) => `
    <li><strong>${escapeHtml(law.title)}</strong>${escapeHtml(law.description)}</li>
  `).join("");
  const newsArticles = guide.culture.fallbackArticles.map((a) => `
    <div class="card"><h4>${escapeHtml(a.title)}</h4><p>${escapeHtml(a.body)}</p></div>
  `).join("");

  return `
    <section class="section container">
      <div class="section__head"><h2>${escapeHtml(t("navGuide"))}</h2><p>${escapeHtml(guide.populationNote)}</p></div>

      ${gallery ? `<div class="grid grid-3" style="margin-bottom:var(--space-6);">${gallery}</div>` : ""}

      <h3>${escapeHtml(t("online"))} / ${escapeHtml(t("offline"))} — ${escapeHtml(guide.culture.newsNote)}</h3>
      <div class="grid grid-3" data-requires-online style="margin-bottom:var(--space-6);">${newsArticles}</div>

      <h3>Länder</h3>
      <div class="laender-grid" style="margin-bottom:var(--space-6);">${laender}</div>

      <h3>${escapeHtml(t("navGuide"))} — droits et devoirs</h3>
      <ul class="civic-list">${civicLaws}</ul>
    </section>
  `;
}
function attachGuideHandlers() { /* section statique : aucun gestionnaire supplémentaire requis */ }

/* ---- Hub des visas ---- */
function renderVisaHub() {
  const hub = AppState.data.visaHub;
  const items = hub.types.map((v, i) => `
    <div class="visa-item ${i === 0 ? "is-open" : ""}" data-visa="${escapeHtml(v.id)}">
      <button class="visa-item__head" type="button">
        <span>${escapeHtml(v.title)}</span><span class="visa-item__chevron">▾</span>
      </button>
      <div class="visa-item__body">
        <p>${escapeHtml(v.summary)}</p>
        <h5>Documents</h5><ul>${v.documents.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
        <h5>Pièges fréquents</h5><ul>${v.pitfalls.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
        <h5>Où déposer sa demande</h5><p>${escapeHtml(v.whereToApply)}</p>
        <h5>Plateformes utiles</h5><ul>${v.platforms.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
        <p class="visa-disclaimer">ℹ️ ${escapeHtml(v.disclaimer)}</p>
      </div>
    </div>
  `).join("");
  const portals = hub.officialPortals.map((p) => `<li><strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.note)}</li>`).join("");

  return `
    <section class="section container">
      <div class="section__head"><h2>${escapeHtml(t("navVisa"))}</h2><p>${escapeHtml(hub.globalDisclaimer)}</p></div>
      <div class="visa-accordion">${items}</div>
      <h3 style="margin-top:var(--space-6);">Portails officiels</h3>
      <ul class="civic-list">${portals}</ul>
    </section>
  `;
}
function attachVisaHandlers() {
  document.querySelectorAll(".visa-item__head").forEach((head) => {
    head.addEventListener("click", () => head.closest(".visa-item").classList.toggle("is-open"));
  });
}

/* ---- Don ---- */
function renderDonationSection() {
  const meta = AppState.data.meta;
  return `
    <section class="section container" id="donate-section">
      <div class="card donate-card">
        <h2>${escapeHtml(t("navDonate"))}</h2>
        <p>${escapeHtml(meta.donation.note)}</p>
        <button id="donate-btn" class="btn btn-donate" data-requires-online type="button">💛 ${escapeHtml(t("navDonate"))} — KKiaPay</button>
        <div id="donate-offline-notice" class="donate-offline-notice" style="display:${AppState.online ? "none" : "flex"};">
          🔌 ${escapeHtml(t("offlineNotice"))}
        </div>
      </div>
    </section>
  `;
}
function attachDonateHandlers() {
  const btn = document.getElementById("donate-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!AppState.online) { showToast(t("offlineNotice")); return; }
    window.open(AppState.data.meta.donation.url, "_blank", "noopener");
  });
}

/* ---- Contact ---- */
function renderContactSection() {
  const c = AppState.data.meta.contact;
  return `
    <section class="section container">
      <div class="section__head"><h2>${escapeHtml(t("navContact"))}</h2><p>${escapeHtml(c.org)} — ${escapeHtml(c.country)}</p></div>
      <div class="contact-grid">
        <div class="card contact-card">
          <span class="contact-card__icon">💬</span>
          <div><div>WhatsApp</div><a href="${escapeHtml(c.whatsappLink)}" target="_blank" rel="noopener">${escapeHtml(c.whatsapp)}</a></div>
        </div>
        <div class="card contact-card">
          <span class="contact-card__icon">✉️</span>
          <div><div>Email</div><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>
        </div>
      </div>
    </section>
  `;
}

/* ========================================================================
   13. MOTEUR DU TEST DE POSITIONNEMENT CECRL
   ======================================================================== */
function renderPlacementTestIntro() {
  return `
    <section class="section container">
      <div class="section__head"><h2>${escapeHtml(t("navTest"))}</h2><p>${escapeHtml(AppState.data.cecrl.methodologyNote)}</p></div>
      <div class="card center-text">
        <p>${AppState.data.cecrl.levels.length} niveaux · ${AppState.data.cecrl.questionBank.length} questions</p>
        <button id="start-test" class="btn btn-primary" type="button">${escapeHtml(t("navTest"))}</button>
      </div>
    </section>
  `;
}
function attachPlacementTestHandlers() {
  const btn = document.getElementById("start-test");
  if (btn) btn.addEventListener("click", startPlacementTest);
}

function startPlacementTest() {
  AppState.testSession = { levelIndex: 0, results: {}, currentQuestionIndex: 0, currentLevelQuestions: [], currentLevelCorrect: 0 };
  loadLevelQuestions();
  renderQuizQuestion();
}

function loadLevelQuestions() {
  const level = AppState.data.cecrl.levels[AppState.testSession.levelIndex];
  AppState.testSession.currentLevelQuestions = AppState.data.cecrl.questionBank.filter((q) => q.level === level);
  AppState.testSession.currentQuestionIndex = 0;
  AppState.testSession.currentLevelCorrect = 0;
}

function renderQuizQuestion() {
  const session = AppState.testSession;
  const level = AppState.data.cecrl.levels[session.levelIndex];
  const q = session.currentLevelQuestions[session.currentQuestionIndex];
  const root = document.getElementById("app-root");

  root.innerHTML = `
    <section class="section container">
      <p class="quiz-progress">${escapeHtml(level)} · ${session.currentQuestionIndex + 1} / ${session.currentLevelQuestions.length}</p>
      <p class="quiz-question">${escapeHtml(q.prompt)}</p>
      <div id="quiz-choices">
        ${q.choices.map((choice, i) => `<button class="quiz-choice" data-index="${i}" type="button">${escapeHtml(choice)}</button>`).join("")}
      </div>
    </section>
  `;

  document.querySelectorAll(".quiz-choice").forEach((btn) => {
    btn.addEventListener("click", () => answerQuestion(Number(btn.dataset.index), q));
  });
}

function answerQuestion(choiceIndex, question) {
  const session = AppState.testSession;
  const buttons = document.querySelectorAll(".quiz-choice");
  buttons.forEach((b) => { b.disabled = true; });
  buttons[question.answerIndex].classList.add("is-correct");
  const correct = choiceIndex === question.answerIndex;
  if (!correct) buttons[choiceIndex].classList.add("is-wrong");
  if (correct) session.currentLevelCorrect++;

  setTimeout(() => {
    session.currentQuestionIndex++;
    if (session.currentQuestionIndex < session.currentLevelQuestions.length) {
      renderQuizQuestion();
    } else {
      finishLevelAndAdvance();
    }
  }, 650);
}

function finishLevelAndAdvance() {
  const session = AppState.testSession;
  const levels = AppState.data.cecrl.levels;
  const level = levels[session.levelIndex];
  const total = session.currentLevelQuestions.length;
  const correct = session.currentLevelCorrect;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  session.results[level] = { correct, total, pct };
  const passed = pct >= AppState.data.cecrl.passThresholdPercent;

  if (passed && session.levelIndex < levels.length - 1) {
    session.levelIndex++;
    loadLevelQuestions();
    renderQuizQuestion();
  } else {
    finalizeTest(passed, level);
  }
}

function finalizeTest(lastPassed, lastLevel) {
  const levels = AppState.data.cecrl.levels;
  let placedLevel;
  if (lastPassed) {
    placedLevel = lastLevel;
  } else {
    const idx = levels.indexOf(lastLevel);
    placedLevel = idx > 0 ? levels[idx - 1] : "Pré-A1";
  }
  const result = { level: placedLevel, details: AppState.testSession.results, date: new Date().toISOString() };
  const progress = Store.get(STORAGE_KEYS.progress, {});
  progress.testResult = result;
  Store.set(STORAGE_KEYS.progress, progress);
  SyncAdapter.push(AppState.userId, progress);
  renderQuizResult(result);
}

function renderQuizResult(result) {
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <section class="section container quiz-result">
      <p>${escapeHtml(t("navTest"))}</p>
      <div class="quiz-result__level">${escapeHtml(result.level)}</div>
      <p>${escapeHtml(AppState.data.cecrl.methodologyNote)}</p>
      <div class="hero__actions" style="justify-content:center;">
        <button class="btn btn-primary" data-nav="courses">${escapeHtml(t("navCourses"))}</button>
        <button class="btn btn-secondary" data-nav="home">${escapeHtml(t("navHome"))}</button>
      </div>
    </section>
  `;
  attachRouteHandlers("result");
}

/* ========================================================================
   14. SERVICE WORKER & MISES À JOUR
   ======================================================================== */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.warn("Échec de l'enregistrement du Service Worker :", err);
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "BDE_DATA_UPDATED") {
      showToast(sysMsg("dataUpdated"));
    }
  });
}

/* ========================================================================
   15. DÉMARRAGE
   ======================================================================== */
function renderApp() {
  renderHeader();
  renderFooter();
  const initialRoute = (location.hash || "#home").replace("#", "") || "home";
  renderRoute(["home", "test", "courses", "guide", "visa", "donate", "contact"].includes(initialRoute) ? initialRoute : "home");
}

window.addEventListener("hashchange", () => {
  const route = (location.hash || "#home").replace("#", "") || "home";
  renderRoute(route);
});

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    AppState.data = await res.json();
  } catch (err) {
    document.getElementById("app-root").innerHTML =
      `<section class="section container"><div class="card">⚠️ Impossible de charger data.json. Vérifiez votre connexion lors de ce premier chargement, ou que le Service Worker est bien enregistré.</div></section>`;
    return;
  }

  AppState.cours = resolveCoursData(AppState.data.cours);
  AppState.lang = Store.get(STORAGE_KEYS.language) ||
    (AppState.data.languages.find((l) => l.code === (navigator.language || "").slice(0, 2)) ? navigator.language.slice(0, 2) : "fr");
  AppState.userId = Store.get(STORAGE_KEYS.userId);

  applyTheme();
  applyLanguageDirection();
  registerServiceWorker();
  updateOnlineStatus();

  const onboardingDone = Store.get(STORAGE_KEYS.onboardingDone, false);
  if (!onboardingDone || !AppState.userId) {
    renderHeader();
    renderFooter();
    showOnboarding();
  } else {
    renderApp();
  }
}

document.addEventListener("DOMContentLoaded", init);
