/**
 * sw.js — BrückeDeOffline
 * ---------------------------------------------------------------------------
 * Stratégie : Réseau d'abord, repli sur le cache (Network-First).
 *  - En ligne : chaque requête tente TOUJOURS le réseau en premier, pour
 *    être certain d'afficher la dernière version déployée sur GitHub Pages
 *    (voir README.md > "Pourquoi mes mises à jour n'apparaissaient pas").
 *    Si le réseau répond, le cache est mis à jour silencieusement au passage.
 *  - Hors ligne (ou réseau en échec) : repli immédiat sur la dernière copie
 *    mise en cache, pour un fonctionnement garanti à 100% hors ligne.
 *  - Navigation hors ligne sans entrée en cache exacte : repli sur
 *    index.html mis en cache (comportement PWA standard).
 *
 * Important (voir README.md > "Ce que le Service Worker ne peut pas faire") :
 * la toute première visite doit obligatoirement passer par le réseau au
 * moins une fois pour télécharger ces fichiers (comme n'importe quelle PWA).
 * C'est APRÈS ce premier chargement que l'application fonctionne à 100%
 * hors ligne, y compris en avion, données mobiles coupées, Wi-Fi désactivé.
 *
 * NE PAS repasser en cache-first : ce fichier a délibérément préféré la
 * fraîcheur au gain de vitesse, précisément pour qu'une mise à jour de
 * data.json/app.js/style.css apparaisse immédiatement dès la prochaine
 * visite en ligne, sans jamais nécessiter la navigation privée ni un
 * vidage manuel du cache.
 */

const SW_VERSION = "bde-v1.1.0";
const CACHE_MAIN = `${SW_VERSION}-main`;

// Fichiers de l'application (chemins relatifs à la racine du scope du SW),
// pré-mis en cache à l'installation pour un premier fonctionnement hors
// ligne garanti, avant même la première requête réseau applicative.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./admin.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./data.json",
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
  "./favicon.ico",
  "./logo.png"
];

// Ressources externes (CDN) nécessaires au bon fonctionnement d'admin.html
// hors ligne. Mise en cache "best effort" : si le device n'a jamais eu accès
// à Internet, ces lignes échouent silencieusement et n'empêchent PAS
// l'installation du reste de l'app shell.
const CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_MAIN);
      await cache.addAll(SHELL_FILES);
      await Promise.allSettled(
        CDN_FILES.map((url) =>
          fetch(url, { mode: "cors" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      );
      await self.skipWaiting(); // active la nouvelle version sans attendre la fermeture des onglets ouverts
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_MAIN).map((key) => caches.delete(key))
      );
      await self.clients.claim(); // prend le contrôle des onglets déjà ouverts immédiatement
    })()
  );
});

/** Réseau d'abord, avec mise à jour silencieuse du cache ; repli sur le cache hors ligne. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_MAIN);
  try {
    // no-store : contourne aussi le cache HTTP du navigateur, pas seulement le nôtre.
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok && request.method === "GET") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // ne pas intercepter POST/PUT etc. (ex: appels de sync)
  event.respondWith(networkFirst(request));
});

// Permet à app.js de forcer une mise à jour immédiate depuis l'interface
// (ex: bouton "Vérifier les mises à jour" si vous l'ajoutez plus tard).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
