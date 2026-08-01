/**
 * sw.js — BrückeDeOffline
 * ---------------------------------------------------------------------------
 * Stratégie :
 *  - App shell (HTML/CSS/JS/JSON/icônes) : Cache-First avec pré-cache complet
 *    à l'installation → fonctionnement garanti à 100% hors ligne, y compris
 *    lors d'une actualisation (F5) sans réseau.
 *  - data.json : Cache-First pour la réponse immédiate, MAIS on relance en
 *    parallèle une requête réseau qui met à jour le cache silencieusement
 *    (Stale-While-Revalidate) et prévient l'app via postMessage si le
 *    contenu a changé, sans jamais bloquer l'affichage sur le réseau.
 *  - Navigation (changement de page) hors ligne sans entrée en cache :
 *    on retombe sur index.html mis en cache (comportement PWA standard).
 *
 * Important (voir README.md > "Ce que le Service Worker ne peut pas faire") :
 * la toute première visite doit obligatoirement passer par le réseau au
 * moins une fois pour télécharger ces fichiers (comme n'importe quelle PWA :
 * Twitter, Gmail, etc.). C'est APRÈS ce premier chargement que l'application
 * fonctionne à 100% hors ligne, y compris en avion, données mobiles coupées,
 * Wi-Fi désactivé, et lors des actualisations suivantes.
 */

const SW_VERSION = "bde-v1.0.0";
const CACHE_SHELL = `${SW_VERSION}-shell`;
const CACHE_DATA = `${SW_VERSION}-data`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

// Fichiers de l'application (chemins relatifs à la racine du scope du SW).
const SHELL_FILES = [
  "./",
  "./index.html",
  "./admin.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-72.png",
  "./icon-96.png",
  "./icon-128.png",
  "./icon-144.png",
  "./icon-152.png",
  "./icon-192.png",
  "./icon-384.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./favicon.png",
  "./logo.png"
];

const DATA_FILES = ["./data.json"];

// Ressources externes (CDN) nécessaires au bon fonctionnement d'admin.html
// hors ligne. Mise en cache "best effort" : si le device n'a jamais eu accès
// à Internet, ces lignes échouent silencieusement (voir installEvent ci-dessous)
// et n'empêchent PAS l'installation du reste de l'app shell.
const CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(CACHE_SHELL);
      await shellCache.addAll(SHELL_FILES);

      const dataCache = await caches.open(CACHE_DATA);
      await dataCache.addAll(DATA_FILES);

      // CDN : on tente, sans faire échouer toute l'installation si le CDN
      // est injoignable (ex: première installation avec connexion instable).
      const runtimeCache = await caches.open(CACHE_RUNTIME);
      await Promise.allSettled(
        CDN_FILES.map((url) =>
          fetch(url, { mode: "cors" })
            .then((res) => (res.ok ? runtimeCache.put(url, res) : null))
            .catch(() => null)
        )
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/** Notifie tous les onglets ouverts qu'une nouvelle version de data.json est dispo. */
async function notifyClientsDataUpdated() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage({ type: "BDE_DATA_UPDATED" }));
}

/** Stratégie Stale-While-Revalidate pour data.json. */
async function handleDataRequest(request) {
  const cache = await caches.open(CACHE_DATA);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const previous = cached ? await cached.clone().text() : null;
        const fresh = response.clone();
        const freshText = await fresh.text();
        if (previous !== null && previous !== freshText) {
          await notifyClientsDataUpdated();
        }
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Réponse immédiate depuis le cache si disponible, sinon on attend le réseau.
  return cached || (await networkFetch) || new Response(
    JSON.stringify({ error: "data.json indisponible hors ligne et non mise en cache." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

/** Stratégie Cache-First classique pour l'app shell et le contenu statique. */
async function handleShellRequest(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === "GET") {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Repli ultime pour une navigation hors ligne sans entrée en cache exacte.
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // ne pas intercepter POST/PUT etc. (ex: appels de sync)

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && url.pathname.endsWith("/data.json")) {
    event.respondWith(handleDataRequest(request));
    return;
  }

  event.respondWith(handleShellRequest(request));
});

// Permet à app.js de forcer une mise à jour immédiate depuis l'interface
// (ex: bouton "Vérifier les mises à jour" si vous l'ajoutez plus tard).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
