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

const CACHE_VERSION = 'v130'; // 05-09-2026 : CORRECTIF CRITIQUE — audit intégrité des données (3 points). 1) Clôture : seules les Activités étaient réellement supprimées côté Supabase ; Dettes/Paiements/Dépenses de la période, qui vivent aussi dans des tables dédiées, ne l'étaient pas (upsert vide = rien effacé) — corrigé, suppression serveur réelle ajoutée pour ces 3 tables à la clôture. 2) Les 4 boutons individuels "Vider" (Stock Entreprise, Dettes, Paiements, Dépenses) avaient le même défaut, jamais corrigé (seul "Vider les activités" et "Tout" l'étaient) — corrigé, suppression serveur réelle ajoutée aux 4. 3) "Tout" remet dettesClot/entDejaDeduit à 0, mais ces 2 cumuls sont protégés par un Math.max(cloud,local) anti-recul (voir v précédentes) : une réconciliation survenant juste après le reset, avant que le 0 n'atteigne le cloud, pouvait faire réapparaître l'ancienne valeur non-nulle via ce Math.max. Corrigé par une marque horodatée du reset (_resetCumulsAt) : le Math.max n'est ignoré que si le côté détenant l'ancienne valeur date d'AVANT ce reset ; une clôture légitime survenue APRÈS "Tout" reste protégée normalement. Aucun calcul métier ni autre fonctionnalité modifiés — testé (voir régressions ci-dessus dans le code). Voir aussi v129/v128.
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
