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

const CACHE_VERSION = 'v192'; // 06-10-2026 13:10 : index.html V0.29 — barres de filtres harmonisées (CSS/libellés d'affichage uniquement). Précédemment v191 06-10-2026 10:15 : index.html V0.28 — logo/badge raccourcis, filtres plus compacts (CSS d'affichage uniquement). Précédemment v190 06-10-2026 09:40 : index.html V0.27 — boutons plus courts à l'horizontale (CSS d'affichage uniquement). Précédemment v189 06-10-2026 08:45 : index.html V0.26 — simplification 5 : harmonisation boutons/cartes/textes (CSS d'affichage). Précédemment v188 06-10-2026 10:00 : index.html V0.25 — emojis décoratifs retirés (affichage). Précédemment v187 05-10-2026 20:00 : index.html V0.24 — menu ⋯ des en-têtes d'onglet. Précédemment v186 05-10-2026 18:00 : index.html V0.23 — Commandes simplifiées (alertes stock, titre en double). Précédemment v185 05-10-2026 16:00 : index.html V0.22 — compactage vertical global (CSS d'affichage). Précédemment v184 05-10-2026 14:00 : index.html V0.21 — Alertes Stock Faible, 2e passe de compactage. Précédemment v183 05-10-2026 12:00 : index.html V0.20 — Alertes Stock Faible (Commandes) en affichage compact. Précédemment v182 04-10-2026 21:46 : index.html V0.19 — réglage « Taille des onglets » dans Affichage. Précédemment v181 03-10-2026 23:29 : index.html — affichage de la version (V : x.xx) sur l'écran de connexion + écrans de connexion compactés (CSS uniquement). Précédemment v180 : index.html — V0.18 — English (US) complété (1 227 phrases ajoutées au dictionnaire I18N centralisé), aucune modification de la logique métier. Précédemment v179 : 30-09-2026 : index.html — i18n centralisé (dictionnaire unique I18N : Français / English (US) / Adlam), moteur unique pour le texte statique et dynamique, aucune modification de la logique métier. Précédemment v178 : 30-09-2026 : index.html V0.17 — ajout du Pular/Fulfulde (Adlam), police Adlam embarquée. Précédemment v177 : index.html V0.16 — Affichage : langue peule supprimée ; langues Français et English (US) uniquement, choix réservé à l'Administrateur (Associé, Visiteur et écran de connexion en Français) ; taille du texte, thème et langue strictement locaux à l'appareil. Précédemment v176 — 22-09-2026 : index.html — nouveau bouton "🎨 Affichage" (tous rôles, dès l'écran de connexion) : taille du texte (−/curseur/+), 4 thèmes (Sombre/Noir/Gris/Blanc), langues (Français/English) — préférences par appareil, effet immédiat, conservées après actualisation. Précédemment v175 — 22-09-2026 : index.html — Clôture de période : la Corbeille n'était jamais vidée (les entrées Dette/Paiement/Dépense/Activité qui y avaient été mises manuellement restaient indéfiniment) et l'onglet Rapport devenait vide après chaque clôture (il ne lisait que les listes vivantes, vidées par la clôture) — l'historique détaillé (Activités + Dettes + Paiements + Dépenses) des 2 dernières périodes closes est maintenant figé et consultable via un nouveau sélecteur de période dans Rapport. Précédemment v174 — 21-09-2026 : index.html — les 6 boutons "+ ..." (Activités, Stock Entreprise, Stock Perso, Associé, Dépenses, Commandes) restent visibles (sticky) pendant le défilement vertical ; affichage uniquement. Précédemment v173 — 20-09-2026 : index.html V0.13 — (1) Visiteur : "Total des avoirs (argent) de BAH Ousmane" recalculé à partir des trois montants affichés (capital + part de bénéfice + Stock Perso dû) ; (2) Administrateur : nouvelle action "Augmenter le capital total de l'entreprise" (historique D.capitalAugmentations, intégré à calculerCapitalTotalEntreprise()) ; (3) actualisation automatique du compte Visiteur et envoi fiabilisé du capital/bénéfice/Stock Perso vers le serveur. Voir commentaire APP_VERSION dans index.html.
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
