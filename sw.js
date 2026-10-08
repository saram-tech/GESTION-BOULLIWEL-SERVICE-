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

const CACHE_VERSION = 'v234'; // 08-10-2026 : index.html V0.69 — commande fournisseur : produits sans catégorie à la fin. Précédemment v233 08-10-2026 : index.html V0.68 — commande fournisseur triée A → Z. Précédemment v232 08-10-2026 : index.html V0.67 — la synchro du stock conserve aussi « Cmd ». Précédemment v231 08-10-2026 : index.html V0.66 — texte commande fournisseur par catégorie ; catégorie conservée à la synchro du stock. Précédemment v230 08-10-2026 : index.html V0.65 — commande fournisseur : Date / CATÉGORIE / « n. Produit........Qté » (sans prix, affichage uniquement). Précédemment v229 08-10-2026 16:51 : index.html V0.64 — champ « Cmd » par produit (Stock Entreprise) utilisé comme quantité de commande fournisseur. Précédemment v228 08-10-2026 13:50 : index.html V0.63 — onglet Commandes en interface minimale (affichage uniquement). Précédemment v227 08-10-2026 12:51 : index.html V0.62 — lignes de totaux fixes en bas de leur tableau à tous les niveaux, sur une seule ligne (affichage uniquement). Précédemment v226 08-10-2026 14:00 : index.html V0.61 — onglet Commandes simplifié (vues Clients/Fournisseur, carte unique, modale épurée). Précédemment v225 08-10-2026 12:11 : index.html V0.60 — onglet Commandes simplifié (affichage uniquement). Précédemment v224 08-10-2026 11:33 : index.html V0.59 — espaces réduits partout, Stock Perso totaux descendus (affichage uniquement). Précédemment v223 08-10-2026 11:20 : index.html V0.58 — Bilan compact, recherche globale masquée au défilement, Associé/Stock Ent./Stock Perso (affichage uniquement). Précédemment v222 08-10-2026 10:12 : index.html V0.57 — mise en page compacte (totaux sur une ligne, tableaux réduits, Patrimoine compact, bouton commande fournisseur près de la recherche). Précédemment v221 08-10-2026 02:41 : index.html V0.56 — mise en page compacte des onglets (actions près de la recherche, barres d'outils sur la ligne du titre, hauteur ajustée à l'écran). Précédemment v220 08-10-2026 02:14 : index.html V0.55 — Bilan : barre de recherche globale sur la ligne du titre (affichage uniquement). Précédemment v219 08-10-2026 00:23 : index.html V0.54 — Bilan : bouton « Calculer » retiré, 2e « Infos » déplacé sur la ligne du titre (affichage uniquement). Précédemment v218 07-10-2026 22:25 : index.html V0.53 — Commandes : produits à commander par catégorie (N° | Désignation | Quantité) ; Patrimoine : note masquée par défaut (bouton Infos) ; Bilan : « En savoir plus » → « Infos » (affichage uniquement). Précédemment v217 07-10-2026 22:01 : index.html V0.52 — mise à jour du numéro de version (APP_VERSION) ; champs de texte long en zones multilignes, contenu 100 % visible (affichage uniquement). Précédemment v216 07-10-2026 : index.html — champs de texte long (Description, Note, Motif, Adresse, Panne…) en zones multilignes, contenu 100 % visible (affichage uniquement). Précédemment v215 07-10-2026 : index.html — zones de saisie adaptées au contenu seulement lorsqu'une donnée est présente (affichage uniquement). Précédemment v214 07-10-2026 21:40 : index.html V0.51 — zones de saisie ajustées au contenu (affichage uniquement). Précédemment v213 07-10-2026 21:00 : index.html V0.50 — dialogues Activité/Dépense/Commande, Patrimoine, Bilan (affichage) + Téléphone obligatoire (Commande). Précédemment v212 07-10-2026 20:10 : index.html V0.49 — champs Date retirés des dialogues (date automatique). Précédemment v211 07-10-2026 19:30 : index.html V0.48 — champs de dialogue à largeur du libellé, sur une même ligne (affichage uniquement). Précédemment v210 07-10-2026 18:40 : index.html V0.47 — audit des boîtes de dialogue, champs regroupés/largeurs adaptées (affichage uniquement). Précédemment v209 07-10-2026 18:15 : index.html V0.46 — zones de saisie à largeur adaptée, champs sur une même ligne (affichage uniquement). Précédemment v208 07-10-2026 16:20 : index.html V0.45 — boîtes de dialogue compactes et adaptatives (affichage uniquement). Précédemment v207 07-10-2026 15:40 : index.html V0.44 — champ « Prix vente unitaire » retiré des dialogues Stock (affichage uniquement). Précédemment v206 07-10-2026 15:10 : index.html V0.43 — onglet Commandes en cartes simplifiées (affichage uniquement). Précédemment v205 07-10-2026 14:30 : index.html V0.42 — onglet Rapport : seul « Historique clôture » est conservé (affichage uniquement). Précédemment v204 07-10-2026 10:50 : index.html V0.41 — synchronisation des quantités : une ancienne valeur obsolète (2e Administrateur) ne peut plus annuler une diminution récente. Précédemment v203 07-10-2026 09:40 : index.html V0.40 — diminution manuelle Stock Entreprise (➖). Précédemment v202 07-10-2026 09:10 : index.html V0.39 — diminution Stock Perso protégée contre le double-déclenchement. Précédemment v201 07-10-2026 08:10 : index.html V0.38 — diminution manuelle Stock Perso. Précédemment v200 07-10-2026 07:25 : index.html V0.37 — stock Associé : le serveur fait foi après une baisse de l'Administrateur. Précédemment v199 07-10-2026 07:10 : index.html V0.36 — correction unique Stock Entreprise + baisse volontaire protégée côté tables. Précédemment v198 06-10-2026 23:55 : index.html V0.35 — annulation volontaire non écrasée par la synchronisation. Précédemment v197 06-10-2026 23:20 : index.html V0.34 — annulation d'ajout Stock Perso (restitution montants + horodatage). Précédemment v196 06-10-2026 22:45 : index.html V0.33 — boîtes de dialogue : aucune zone de saisie masquée (affichage uniquement). Précédemment v195 06-10-2026 22:10 : index.html V0.32 — onglet Rapport de nouveau affiché (structure HTML). Précédemment v194 06-10-2026 21:40 : index.html V0.31 — champ Recherche agrandi à la saisie (affichage uniquement). Précédemment v193 06-10-2026 21:15 : index.html V0.30 — boutons sur une seule ligne (affichage uniquement). Précédemment v192 06-10-2026 13:10 : index.html V0.29 — barres de filtres harmonisées (CSS/libellés d'affichage uniquement). Précédemment v191 06-10-2026 10:15 : index.html V0.28 — logo/badge raccourcis, filtres plus compacts (CSS d'affichage uniquement). Précédemment v190 06-10-2026 09:40 : index.html V0.27 — boutons plus courts à l'horizontale (CSS d'affichage uniquement). Précédemment v189 06-10-2026 08:45 : index.html V0.26 — simplification 5 : harmonisation boutons/cartes/textes (CSS d'affichage). Précédemment v188 06-10-2026 10:00 : index.html V0.25 — emojis décoratifs retirés (affichage). Précédemment v187 05-10-2026 20:00 : index.html V0.24 — menu ⋯ des en-têtes d'onglet. Précédemment v186 05-10-2026 18:00 : index.html V0.23 — Commandes simplifiées (alertes stock, titre en double). Précédemment v185 05-10-2026 16:00 : index.html V0.22 — compactage vertical global (CSS d'affichage). Précédemment v184 05-10-2026 14:00 : index.html V0.21 — Alertes Stock Faible, 2e passe de compactage. Précédemment v183 05-10-2026 12:00 : index.html V0.20 — Alertes Stock Faible (Commandes) en affichage compact. Précédemment v182 04-10-2026 21:46 : index.html V0.19 — réglage « Taille des onglets » dans Affichage. Précédemment v181 03-10-2026 23:29 : index.html — affichage de la version (V : x.xx) sur l'écran de connexion + écrans de connexion compactés (CSS uniquement). Précédemment v180 : index.html — V0.18 — English (US) complété (1 227 phrases ajoutées au dictionnaire I18N centralisé), aucune modification de la logique métier. Précédemment v179 : 30-09-2026 : index.html — i18n centralisé (dictionnaire unique I18N : Français / English (US) / Adlam), moteur unique pour le texte statique et dynamique, aucune modification de la logique métier. Précédemment v178 : 30-09-2026 : index.html V0.17 — ajout du Pular/Fulfulde (Adlam), police Adlam embarquée. Précédemment v177 : index.html V0.16 — Affichage : langue peule supprimée ; langues Français et English (US) uniquement, choix réservé à l'Administrateur (Associé, Visiteur et écran de connexion en Français) ; taille du texte, thème et langue strictement locaux à l'appareil. Précédemment v176 — 22-09-2026 : index.html — nouveau bouton "🎨 Affichage" (tous rôles, dès l'écran de connexion) : taille du texte (−/curseur/+), 4 thèmes (Sombre/Noir/Gris/Blanc), langues (Français/English) — préférences par appareil, effet immédiat, conservées après actualisation. Précédemment v175 — 22-09-2026 : index.html — Clôture de période : la Corbeille n'était jamais vidée (les entrées Dette/Paiement/Dépense/Activité qui y avaient été mises manuellement restaient indéfiniment) et l'onglet Rapport devenait vide après chaque clôture (il ne lisait que les listes vivantes, vidées par la clôture) — l'historique détaillé (Activités + Dettes + Paiements + Dépenses) des 2 dernières périodes closes est maintenant figé et consultable via un nouveau sélecteur de période dans Rapport. Précédemment v174 — 21-09-2026 : index.html — les 6 boutons "+ ..." (Activités, Stock Entreprise, Stock Perso, Associé, Dépenses, Commandes) restent visibles (sticky) pendant le défilement vertical ; affichage uniquement. Précédemment v173 — 20-09-2026 : index.html V0.13 — (1) Visiteur : "Total des avoirs (argent) de BAH Ousmane" recalculé à partir des trois montants affichés (capital + part de bénéfice + Stock Perso dû) ; (2) Administrateur : nouvelle action "Augmenter le capital total de l'entreprise" (historique D.capitalAugmentations, intégré à calculerCapitalTotalEntreprise()) ; (3) actualisation automatique du compte Visiteur et envoi fiabilisé du capital/bénéfice/Stock Perso vers le serveur. Voir commentaire APP_VERSION dans index.html.
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
