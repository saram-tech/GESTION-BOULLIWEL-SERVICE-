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

const CACHE_VERSION = 'v118'; // 05-09-2026 : CORRECTIF CRITIQUE — l'import (JSON ET Excel), ainsi que l'annulation d'un import, ne remplaçaient QUE les données LOCALES de l'appareil : le cloud (Supabase) n'était jamais averti, et les tombstones (_del) déjà posés pour les mêmes identifiants n'étaient jamais retirés. Scénario reproduit à coup sûr : créer une donnée → l'exporter → la supprimer (pose un tombstone _del et/ou fait grimper D._maxIdConfirmeActivite pour une Activité) → importer la sauvegarde exportée avant suppression : la donnée réapparaissait un instant en local, puis disparaissait DE NOUVEAU dès la synchronisation automatique suivante (~15-20s plus tard), le cloud resté inchangé "corrigeant" à tort ce qu'il percevait comme une résurrection fantôme. Corrigé en ajoutant, après chaque import et chaque annulation d'import : (1) retirerTombstonesPourIdsImportes() — retire de D._del tout id désormais présent dans une table importée ; (2) réinitialisation de D._maxIdConfirmeActivite à 0 — empêche la suppression INFÉRÉE des Activités de confondre une vieille activité restaurée avec une activité supprimée ailleurs ; (3) pousserImportVersCloud() — envoie immédiatement l'état importé vers Supabase (Activités/Stock + app_data) au lieu d'attendre le prochain cycle automatique, pour que la fusion suivante parte d'un état déjà cohérent. Testé : le scénario exact ci-dessus (données de test dans Activités/Stock entreprise/Stock perso/Dépenses/Dettes, export, suppression, import) est reproduit puis corrigé — les données réapparaissent et survivent désormais à la synchronisation automatique ; aucune suppression serveur effectuée par ce correctif (upsert uniquement, aucun risque de perte supplémentaire). Voir aussi v117/v116/v115.
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
