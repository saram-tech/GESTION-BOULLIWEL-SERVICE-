'use strict';
/* =====================================================================
   BOULLIWEL PRO — Service Worker (sw.js)
   -----------------------------------------------------------------
   Rôle :
     - Mettre en cache les fichiers essentiels de l'application (app shell)
     - Permettre un fonctionnement complet hors connexion
     - Servir les ressources statiques selon une stratégie Cache First
     - Nettoyer automatiquement les anciens caches lors d'une mise à jour
   -----------------------------------------------------------------
   Pour publier une nouvelle version de l'application :
     1. Modifier CACHE_VERSION ci-dessous (ex: 'v4').
     2. Le nouveau Service Worker installera un nouveau cache, activera,
        puis supprimera automatiquement les caches obsolètes.

   ⚠️ RAPPEL IMPORTANT (cause d'un bug réel vécu le 20-08-2026) :
   Ce fichier utilise une stratégie "Cache First" — le téléphone sert
   TOUJOURS la version déjà enregistrée localement, sans jamais vérifier
   s'il en existe une plus récente, TANT QUE ce fichier sw.js lui-même
   n'a pas changé au moins d'un caractère (ex: CACHE_VERSION). Uploader
   un nouveau index.html sur GitHub SANS incrémenter CACHE_VERSION ici
   ne suffit PAS : le téléphone continuera de servir l'ancien index.html
   indéfiniment, même si le nouveau est bien en ligne. CHAQUE mise à
   jour d'index.html (ou de tout autre fichier de l'app shell) DOIT
   s'accompagner d'un incrément de CACHE_VERSION ci-dessous.
   ===================================================================== */

const CACHE_VERSION = 'v293'; // 18-10-2026 : index.html V1.28 — Stock Perso « Dû période ». (avant v292 : 18-10-2026 : index.html V1.27 — bouton flottant d'accès rapide aux onglets. (avant v291 : 18-10-2026 : index.html V1.26 — avertissement ResizeObserver sans bandeau d'erreur. (avant v290 : 18-10-2026 : index.html V1.25 — saisie semi-automatique par champ dans toutes les boîtes de dialogue. (avant v289 : 18-10-2026 : index.html V1.24 — Rapport entier en portrait ; onglets : ordre réel, un onglet par geste. (avant v288 : 18-10-2026 : index.html V1.23 — correspondance des produits : « Pochette Original X » = « Pochette X ». (avant v287 : 18-10-2026 : index.html V1.22 — vente : stock disponible cumulé sur les lignes identiques d'un même produit. (avant v286 : 17-10-2026 : index.html V1.21 — portrait : valeur du stock dans la ligne TOTAL, date de dernière modification Stock Perso sur deux lignes (48 h). (avant v285 : 17-10-2026 : index.html V1.20 — portrait : aucun retour à la ligne, Total général Dépenses en emplacement fixe, valeurs des stocks visibles. (avant v284 : 17-10-2026 : index.html V1.19 — portrait : totaux Dépenses et valeurs des stocks visibles. (avant v283 : 17-10-2026 : index.html V1.18 — onglet actif toujours visible dans la barre d'onglets. (avant v282 : 13-10-2026 : index.html V1.17 — dialogues : pas de fermeture au toucher extérieur, séparateurs de milliers. (avant v281 : index.html V1.16 — libellé « Reste ». (avant v280 : index.html V1.15 — Fournisseur : zone « Qté : N » à droite, nom raccourci. (avant v279 : index.html V1.14 — Fournisseur : « Produit · Qté : N ». (avant v278 : index.html V1.13 — Fournisseur : seuil 0 = aucune alerte. (avant v277 : index.html V1.12 — Commandes › Fournisseur : produits couverts signalés, Réglages Seuil / Cmd toujours accessibles. (avant v276 : index.html V1.11 — Commandes : N° d'ordre cliquable, Seuil / Cmd modifiables directement. (avant v275 : index.html V1.10 — performance. (avant v274 : index.html V1.09 — responsive intégral. (avant v273 : index.html V1.08 — N° Stock Entreprise = ✏️, réactivité (CSS :has, réglage de hauteur). (avant v272 : index.html V1.07 — totaux stables au défilement vertical. (avant v271 : index.html V1.06 — boîte Affichage entièrement repensée (cartes, aperçus en direct, deux colonnes sur grand écran). (avant v270 : index.html V1.05 — badge d'état borné, totaux jamais coupés sur très petit écran. (avant v269 : index.html V1.04 — barre supérieure fixe, boutons d'ajout toujours visibles. (avant v268 : index.html V1.03 — boîte Affichage compacte, taille fixe. (avant v267 : index.html V1.02 — impression PDF Visiteur : montants agrandis, Total des avoirs en évidence. (avant v266 : index.html V1.01 — Associé/Visiteur : plus de boutons Admin ; tableau Visiteur compact.)))))))))))
const CACHE_NAME = 'boulliwel-pro-' + CACHE_VERSION;

// Fichiers constituant l'app shell : nécessaires au fonctionnement hors ligne
// (style.css et app.js retirés : leur contenu est désormais intégré
//  directement dans index.html)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png'
];

// ================================================================
// INSTALL — mise en cache de l'app shell
// ================================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[SW] Échec de mise en cache initiale :', err))
  );
});

// ================================================================
// ACTIVATE — suppression des anciens caches
// ================================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('boulliwel-pro-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ================================================================
// FETCH — stratégie Cache First (avec repli réseau puis mise à jour)
// ================================================================
self.addEventListener('fetch', (event) => {
  // Ne traiter que les requêtes GET, ignorer les autres méthodes (POST, etc.)
  if (event.request.method !== 'GET') return;

  // Ignorer les requêtes vers d'autres origines (ex: API externes futures)
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Cache First : on sert immédiatement la version en cache,
        // puis on la met à jour discrètement en arrière-plan.
        fetchAndUpdateCache(event.request);
        return cached;
      }
      // Absent du cache : on va chercher sur le réseau, puis on met en cache.
      return fetchAndUpdateCache(event.request).catch(() => offlineFallback(event.request));
    })
  );
});

/**
 * Récupère une ressource sur le réseau et met à jour le cache correspondant.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
function fetchAndUpdateCache(request) {
  return fetch(request).then((response) => {
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  });
}

/**
 * Page de repli affichée lorsqu'une ressource de navigation n'est
 * disponible ni en cache, ni sur le réseau (mode hors ligne).
 * @param {Request} request
 * @returns {Promise<Response>}
 */
function offlineFallback(request) {
  if (request.mode === 'navigate') {
    return caches.match('./index.html');
  }
  return Promise.reject('Ressource indisponible hors ligne.');
}
