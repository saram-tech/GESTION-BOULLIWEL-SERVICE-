const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('/home/claude/index.html', 'utf8');

let results = [];
function ok(name, cond, detail){ results.push({name, pass: !!cond, detail: detail||''}); }

function nouvelleFenetre(fetchImpl, onlineVal){
  var fetchLog = [];
  function wrappedFetch(url, opts){
    fetchLog.push({url: String(url), opts: opts});
    return fetchImpl(url, opts, fetchLog);
  }
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://gestion-boulliwel-service.vercel.app/',
    pretendToBeVisual: true,
    beforeParse(window){
      window.fetch = wrappedFetch;
      Object.defineProperty(window.navigator, 'onLine', { value: onlineVal, configurable:true, writable:true });
    }
  });
  // 'D' est déclaré avec `let` au top-level du script : ce n'est PAS une
  // propriété de window en JS (contrairement à var/function). On la
  // rend accessible via un eval exécuté dans le même contexte global.
  dom.window.eval('window.D = D;');
  return { dom, window: dom.window, fetchLog };
}

async function attendre(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async () => {

  // ===================================================================
  // TEST 1 — mergeArraysById : un item local non-synchronisé (absent du
  // serveur) doit survivre à la fusion, pas être supprimé.
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async ()=>({ok:false,status:0,json:async()=>({})}), true);
    await attendre(50);
    var base = [{id:'local-pending-1', nom:'Créé hors ligne'}, {id:'A', nom:'ancien local'}];
    var serveur = [{id:'A', nom:'A (version serveur)'}, {id:'B', nom:'B (nouveau du serveur)'}];
    var fusion = window.mergeArraysById(base, serveur, []);
    var aLocal = fusion.some(x=>x.id==='local-pending-1');
    var aB = fusion.some(x=>x.id==='B');
    var aPrisServeur = fusion.find(x=>x.id==='A').nom==='A (version serveur)';
    ok('mergeArraysById conserve un item local non-synchronisé', aLocal, JSON.stringify(fusion.map(x=>x.id)));
    ok('mergeArraysById intègre les nouveaux items serveur', aB);
    ok('mergeArraysById: en cas de conflit, le serveur (prioritaire) l\'emporte', aPrisServeur);
  }

  // ===================================================================
  // TEST 2 — chargerActivitesEtStockDepuisTables : ne doit PAS écraser
  // une activité locale absente du serveur, et doit la renvoyer.
  // ===================================================================
  {
    var activitesServeur = [{ id: 111, description:'Vente A', paye: 1000, achat: 500, qte: 1, apayer:0, reste:0 }];
    var pushedActivites = null;
    const fetchImpl = async (url) => {
      if (String(url).indexOf('/rest/v1/activites') !== -1 && arguments.length && false) {}
      if (String(url).indexOf('/rest/v1/activites') !== -1) {
        return { ok:true, status:200, json: async()=>activitesServeur };
      }
      if (String(url).indexOf('/rest/v1/stock') !== -1) {
        return { ok:true, status:200, json: async()=>[] };
      }
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window, fetchLog } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    // Simule une activité créée hors ligne, jamais encore vue par le serveur.
    window.D.activites = [{ id: 999, description:'Créée hors ligne', paye: 5000, achat: 2000, qte:1, apayer:0, reste:0 }];
    window._del = window._del; // no-op, D._del défini plus bas
    window.D._del = { activites:[], stock:[] };
    var session = { access_token:'faux-token', role:'admin' };
    window.setSession(session); // reflète le vrai flux (doLogin appelle toujours setSession avant)
    await window.chargerActivitesEtStockDepuisTables(session);
    await attendre(50);
    var aEncoreLocale = window.D.activites.some(a=>a.id===999);
    var aRecuServeur = window.D.activites.some(a=>a.id===111);
    ok('chargerActivitesEtStockDepuisTables conserve une activité créée hors ligne', aEncoreLocale, JSON.stringify(window.D.activites.map(a=>a.id)));
    ok('chargerActivitesEtStockDepuisTables intègre bien les activités du serveur', aRecuServeur);
    var aRenvoye = fetchLog.some(f => f.url.indexOf('/rest/v1/activites')!==-1 && f.opts && f.opts.method==='POST');
    ok('chargerActivitesEtStockDepuisTables retente l\'envoi de ce qui manquait au serveur', aRenvoye, JSON.stringify(fetchLog.map(f=>f.opts&&f.opts.method+' '+f.url)));
  }

  // ===================================================================
  // TEST 3 — doLogout ne doit PLUS vider D (données non synchronisées).
  // ===================================================================
  {
    const fetchImpl = async () => ({ ok:false, status:0, json: async()=>({}) });
    const { window } = nouvelleFenetre(fetchImpl, false); // hors ligne pour éviter le "dernier envoi"
    await attendre(50);
    window.D.activites = [{ id: 777, description:'Activité en attente', paye:100, achat:50, qte:1, apayer:0, reste:0 }];
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','admin');
    window.localStorage.setItem('bpro_session_lp','1');
    window.localStorage.setItem('bpro_role_lp','admin');
    window.doLogout();
    var donneesConservees = window.D.activites.some(a=>a.id===777);
    var sessionEffacee = !window.isLoggedIn();
    ok('doLogout conserve les données locales (activités)', donneesConservees, JSON.stringify(window.D.activites));
    ok('doLogout efface bien le statut de session', sessionEffacee);
  }

  // ===================================================================
  // TEST 4 — doLogin : reprise automatique hors ligne si le réseau
  // échoue alors que navigator.onLine ment ("true").
  // ===================================================================
  {
    const fetchImpl = async () => { throw new Error('Network unreachable (simulate onLine=true mais aucun accès réel)'); };
    const { window } = nouvelleFenetre(fetchImpl, true); // onLine ment : dit "true"
    await attendre(50);
    // Pré-condition : une session valide a déjà été obtenue en ligne
    // auparavant sur cet appareil (cache local), comme après un premier
    // login réussi.
    var emailAdmin = window.AUTH_EMAIL_ADMIN;
    window.setSession({
      email: emailAdmin, role:'admin', access_token:'ancien-token', refresh_token:'rt',
      expires_at: Date.now()-1000, // techniquement expiré (>1h)
      offline_ok_until: Date.now() + 30*24*3600*1000 // mais confiance hors ligne encore valide (30j)
    });
    document = window.document;
    window.document.getElementById('inp-login').value = 'admin';
    window.document.getElementById('inp-pass').value = 'peu importe, le réseau va échouer';
    window.doLogin();
    await attendre(300); // laisse le temps au fetch (qui rejette) + catch() de s'exécuter
    var reconnecteHorsLigne = window.isLoggedIn() && window.getRole()==='admin';
    ok('doLogin retombe automatiquement sur la session locale quand le réseau échoue', reconnecteHorsLigne,
      'isLoggedIn='+window.isLoggedIn()+' role='+window.getRole()+' err="'+window.document.getElementById('login-err').textContent+'"');
  }

  // ===================================================================
  // TEST 5 — Le Visiteur ne doit JAMAIS déclencher reconcileOnStartup()
  // (admin-only) au retour de connexion — c'était la cause du badge
  // rouge "Erreur de synchronisation".
  // ===================================================================
  {
    const fetchImpl = async (url) => {
      if (String(url).indexOf('/rest/v1/activites')!==-1 || String(url).indexOf('/rest/v1/stock')!==-1) return {ok:true,status:200,json:async()=>[]};
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window, fetchLog } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','visiteur');
    var appelReconcile = false;
    var original = window.reconcileOnStartup;
    window.reconcileOnStartup = function(){ appelReconcile = true; return original ? original.apply(this, arguments) : undefined; };
    window.dispatchEvent(new window.Event('online'));
    await attendre(200);
    ok('Le Visiteur ne déclenche jamais reconcileOnStartup() (plus de faux badge rouge)', !appelReconcile);
  }

  // ===================================================================
  // TEST 6 — L'Associé déclenche bien la synchro Activités/Stock, mais
  // jamais reconcileOnStartup() (réservé Admin/app_data).
  // ===================================================================
  {
    const fetchImpl = async (url) => {
      if (String(url).indexOf('/rest/v1/activites')!==-1 || String(url).indexOf('/rest/v1/stock')!==-1) return {ok:true,status:200,json:async()=>[]};
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window, fetchLog } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','associe');
    window.setSession({ email:window.AUTH_EMAIL_ASSOCIE, role:'associe', access_token:'tok', refresh_token:'rt', expires_at: Date.now()+3600000, offline_ok_until: Date.now()+30*24*3600000 });
    var appelReconcile = false;
    window.reconcileOnStartup = function(){ appelReconcile = true; };
    window.dispatchEvent(new window.Event('online'));
    await attendre(200);
    ok('L\'Associé ne déclenche jamais reconcileOnStartup() (app_data = Admin uniquement)', !appelReconcile);
  }

  // ===================================================================
  // TEST 7 — Ouverture SANS Internet dès le démarrage (pas seulement au
  // login) : une session déjà active doit afficher le tableau de bord
  // immédiatement, sans écran de connexion, même hors ligne.
  // ===================================================================
  {
    const fetchImpl = async () => { throw new Error('Aucun accès réseau (simulation démarrage hors ligne)'); };
    const { window } = nouvelleFenetre(fetchImpl, false); // hors ligne dès le boot
    window.localStorage.setItem('bpro_session_lp','1');
    window.localStorage.setItem('bpro_role_lp','admin');
    window.setSession({ email:'bahousmane611@gmail.com', role:'admin', access_token:'tok', refresh_token:'rt', expires_at: Date.now()-999999, offline_ok_until: Date.now()+30*24*3600000 });
    await attendre(150); // laisse DOMContentLoaded s'exécuter
    var ecranLoginCache = window.document.getElementById('login-screen').classList.contains('hidden');
    ok('Démarrage hors ligne avec session existante : écran de connexion sauté, app ouverte directement', ecranLoginCache);
  }

  // ===================================================================
  // TEST 8 — Aucune fausse "Erreur de synchronisation" (badge rouge)
  // pour le Visiteur, même après un événement "online".
  // ===================================================================
  {
    const fetchImpl = async (url) => ({ ok:true, status:200, json: async()=>[] });
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','visiteur');
    window.dispatchEvent(new window.Event('online'));
    await attendre(150);
    var badge = window.document.getElementById('sync-status');
    var estRouge = badge.className.indexOf('sync-error') !== -1;
    ok('Aucun badge rouge "Erreur de synchronisation" pour le Visiteur après reconnexion', !estRouge, 'classe='+badge.className+' texte="'+badge.textContent+'"');
  }

  // ===================================================================
  // TEST 9 — Connexion Associé en ligne (identifiants corrects) fonctionne
  // normalement, sans erreur, jusqu'à l'ouverture du tableau de bord.
  // ===================================================================
  {
    const fetchImpl = async (url, opts) => {
      var u = String(url);
      if (u.indexOf('/auth/v1/token')!==-1) {
        return { ok:true, status:200, json: async()=>({ access_token:'tok-assoc', refresh_token:'rt-assoc', expires_in:3600, user:{id:'uid-assoc'} }) };
      }
      if (u.indexOf('/rest/v1/activites')!==-1 || u.indexOf('/rest/v1/stock')!==-1) return { ok:true, status:200, json: async()=>[] };
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.document.getElementById('inp-login').value = 'associe';
    window.document.getElementById('inp-pass').value = 'bonmotdepasse';
    window.doLogin();
    await attendre(300);
    var connecte = window.isLoggedIn() && window.getRole()==='associe';
    var dashboardVisible = window.document.getElementById('login-screen').classList.contains('hidden');
    ok('Connexion Associé en ligne réussit et ouvre le tableau de bord', connecte && dashboardVisible,
      'isLoggedIn='+window.isLoggedIn()+' role='+window.getRole()+' loginCache='+dashboardVisible);
  }

  // ===================================================================
  // TEST 10 — Séparation stricte : le rôle actif détermine quels
  // panneaux (hbtn-admin / hbtn-associe / hbtn-visiteur) sont affichés
  // — jamais deux rôles visibles en même temps.
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','associe');
    window.activerInterfaceSelonRole();
    var admVisible = window.getComputedStyle(window.document.getElementById('hbts-admin')).display !== 'none';
    var assVisible = window.getComputedStyle(window.document.getElementById('hbts-associe')).display !== 'none';
    var visVisible = window.getComputedStyle(window.document.getElementById('hbts-visiteur')).display !== 'none';
    ok('Rôle Associé actif : le panneau Admin est bien masqué', !admVisible, 'admin display='+window.document.getElementById('hbts-admin').style.display);
    ok('Rôle Associé actif : le panneau Visiteur est bien masqué', !visVisible);
    ok('Rôle Associé actif : le panneau Associé est bien affiché', assVisible);
  }

  // ===================================================================
  // TEST 11 — Cohérence des calculs : "Ma part" (Admin) doit être
  // strictement égale à ce qui est poussé pour le Visiteur (même
  // valeur, même formule, aucune dépendance aux données Associé).
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.activites = [
      { id:1, paye:200000, achat:80000, qte:1 },
      { id:2, paye:150000, achat:50000, qte:1 }
    ];
    window.D.depenses = [{ id:1, montant:20000 }];
    window.D.params.reinvest = 20;
    var bd = window.calculerBilanData();
    var attendu = (( (200000-80000)+(150000-50000) ) * 0.8 - 20000) / 2; // (bb - 20%) - dépenses, /2
    ok('calculerBilanData: "Ma part" (bd.mp) suit la formule attendue, sans variable Associé', Math.abs(bd.mp - attendu) < 1,
      'bd.mp='+bd.mp+' attendu='+attendu);
    ok('calculerBilanData: bd.mp === bd.pab (même valeur, pas de double formule)', bd.mp === bd.pab);
  }

  // ===================================================================
  // TEST 12 — mergeArraysById respecte les suppressions (tombstones) :
  // un id supprimé localement ne doit pas réapparaître si le serveur
  // le renvoie encore (pas de "résurrection" de donnée supprimée).
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    var base = [];
    var serveur = [{id:'X', nom:'Supprimé localement mais encore vu du serveur'}];
    var fusion = window.mergeArraysById(base, serveur, ['X']);
    ok('mergeArraysById respecte les tombstones (pas de résurrection d\'un élément supprimé)', !fusion.some(x=>x.id==='X'), JSON.stringify(fusion));
  }

  // ===================================================================
  // TEST 13 — Aucune erreur JavaScript non interceptée pendant un
  // démarrage normal (en ligne, non connecté) de l'application.
  // ===================================================================
  {
    var erreursJs = [];
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    window.addEventListener('error', function(e){ erreursJs.push(e.message || String(e.error)); });
    await attendre(200);
    ok('Aucune erreur JS non interceptée au démarrage (en ligne, déconnecté)', erreursJs.length===0, JSON.stringify(erreursJs));
  }

  // ===================================================================
  // TEST 14 — Changement de mot de passe : envoie bien current_password
  // DANS le corps de la requête PUT (exigé par l'option "Secure password
  // change" activée côté Supabase — cause réelle de l'échec observé).
  // ===================================================================
  {
    var corpsEnvoye = null, jetonUtilise = null;
    const fetchImpl = async (url, opts) => {
      var u = String(url);
      if (u.indexOf('/auth/v1/user')!==-1) {
        corpsEnvoye = JSON.parse(opts.body);
        jetonUtilise = opts.headers['Authorization'];
        return { ok:true, status:200, json: async()=>({}) };
      }
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.setSession({ email:'bahousmane611@gmail.com', role:'admin', access_token:'TOK-VALIDE', refresh_token:'rt', expires_at: Date.now()+3600000, offline_ok_until: Date.now()+30*24*3600000 });
    window.document.getElementById('cp-actuel').value = 'Admin2026';
    window.document.getElementById('cp-nouveau').value = 'NouveauMdp123';
    window.document.getElementById('cp-confirm').value = 'NouveauMdp123';
    window.doChangerPass();
    await attendre(300);
    ok('current_password est bien envoyé dans le corps de la requête', corpsEnvoye && corpsEnvoye.current_password === 'Admin2026', JSON.stringify(corpsEnvoye));
    ok('Le nouveau mot de passe est bien envoyé', corpsEnvoye && corpsEnvoye.password === 'NouveauMdp123');
    ok('Le jeton de session valide est utilisé', jetonUtilise === 'Bearer TOK-VALIDE', 'jeton="'+jetonUtilise+'"');
  }

  // ===================================================================
  // TEST 14b — Si le jeton est expiré, il est rafraîchi AVANT l'appel
  // PUT (pas d'échec silencieux dû à un jeton périmé).
  // ===================================================================
  {
    var jetonUtilise = null;
    const fetchImpl = async (url, opts) => {
      var u = String(url);
      if (u.indexOf('/auth/v1/token')!==-1 && u.indexOf('refresh_token')!==-1) {
        return { ok:true, status:200, json: async()=>({ access_token:'JETON-RAFRAICHI', refresh_token:'rt2', expires_in:3600 }) };
      }
      if (u.indexOf('/auth/v1/user')!==-1) {
        jetonUtilise = opts.headers['Authorization'];
        return { ok:true, status:200, json: async()=>({}) };
      }
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.sessionStorage.setItem('bpro_session','1');
    window.sessionStorage.setItem('bpro_role','admin');
    window.setSession({ email:'bahousmane611@gmail.com', role:'admin', access_token:'ANCIEN-JETON-EXPIRE', refresh_token:'rt-old', expires_at: Date.now()-999999, offline_ok_until: Date.now()+30*24*3600000 });
    window.document.getElementById('cp-actuel').value = 'Admin2026';
    window.document.getElementById('cp-nouveau').value = 'NouveauMdp123';
    window.document.getElementById('cp-confirm').value = 'NouveauMdp123';
    window.doChangerPass();
    await attendre(300);
    ok('Jeton expiré rafraîchi automatiquement avant le changement de mot de passe', jetonUtilise === 'Bearer JETON-RAFRAICHI', 'jeton envoyé="'+jetonUtilise+'"');
  }

  // ===================================================================
  // TEST 15 — Le message d'erreur Supabase est traduit en français
  // (l'application est entièrement en français, jamais de texte anglais
  // brut affiché à l'utilisateur).
  // ===================================================================
  {
    const fetchImpl = async (url) => {
      var u = String(url);
      if (u.indexOf('/auth/v1/user')!==-1) return { ok:false, status:422, json: async()=>({ msg:'Current password required when setting new password.' }) };
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.setSession({ email:'bahousmane611@gmail.com', role:'admin', access_token:'tok0', refresh_token:'rt0', expires_at: Date.now()+3600000, offline_ok_until: Date.now()+30*24*3600000 });
    window.document.getElementById('cp-actuel').value = 'Admin2026';
    window.document.getElementById('cp-nouveau').value = 'NouveauMdp123';
    window.document.getElementById('cp-confirm').value = 'NouveauMdp123';
    window.doChangerPass();
    await attendre(300);
    var texte = window.document.getElementById('cp-err').textContent;
    var estFrancais = texte.indexOf('mot de passe actuel est requis')!==-1;
    var pasAnglais = texte.indexOf('Current password required')===-1;
    ok('Le message d\'erreur est traduit en français', estFrancais, 'texte affiché="'+texte+'"');
    ok('Le message anglais brut de Supabase n\'est jamais affiché tel quel', pasAnglais, 'texte affiché="'+texte+'"');
  }

  // ===================================================================
  // TEST 15b — Traduction "mot de passe trop court" avec le nombre de
  // caractères exact repris dans le message.
  // ===================================================================
  {
    const fetchImpl = async (url) => {
      var u = String(url);
      if (u.indexOf('/auth/v1/user')!==-1) return { ok:false, status:422, json: async()=>({ msg:'Password should be at least 6 characters' }) };
      return { ok:true, status:200, json: async()=>({}) };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    window.setSession({ email:'bahousmane611@gmail.com', role:'admin', access_token:'tok0', refresh_token:'rt0', expires_at: Date.now()+3600000, offline_ok_until: Date.now()+30*24*3600000 });
    window.document.getElementById('cp-actuel').value = 'Admin2026';
    window.document.getElementById('cp-nouveau').value = '4478';
    window.document.getElementById('cp-confirm').value = '4478';
    window.doChangerPass();
    await attendre(300);
    var texte = window.document.getElementById('cp-err').textContent;
    ok('Traduction "mot de passe trop court" avec le bon nombre de caractères', texte.indexOf('au moins 6 caractères')!==-1, 'texte affiché="'+texte+'"');
  }

  // ===================================================================
  // TEST 16 — Formulaire dynamique : passer à "Réparation" masque
  // Prix achat / Quantité et réinitialise leurs valeurs (pas de
  // réutilisation accidentelle d'une saisie Vente).
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.rAF();
    window.document.getElementById('a-achat').value = '150000';
    window.document.getElementById('a-qte').value = '3';
    window.sv('a-type','Réparation');
    window.basculerChampsSelonType();
    var achatMasque = window.document.getElementById('fg-a-achat').style.display === 'none';
    var qteMasque   = window.document.getElementById('fg-a-qte').style.display === 'none';
    var panneVisible = window.document.getElementById('fg-a-panne').style.display !== 'none';
    var achatReinit = window.document.getElementById('a-achat').value === '';
    var qteReinit   = window.document.getElementById('a-qte').value === '1';
    ok('Type=Réparation masque Prix achat', achatMasque);
    ok('Type=Réparation masque Quantité', qteMasque);
    ok('Type=Réparation affiche bien Panne', panneVisible);
    ok('Type=Réparation réinitialise Prix achat (pas de valeur Vente réutilisée)', achatReinit, 'valeur="'+window.document.getElementById('a-achat').value+'"');
    ok('Type=Réparation réinitialise Quantité à 1', qteReinit, 'valeur="'+window.document.getElementById('a-qte').value+'"');
  }

  // ===================================================================
  // TEST 17 — Formulaire dynamique : repasser à "Vente" réaffiche Prix
  // achat/Quantité et masque Panne, sans casser l'aperçu de calcul.
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.rAF();
    window.sv('a-type','Service');
    window.basculerChampsSelonType();
    window.sv('a-type','Vente');
    window.basculerChampsSelonType();
    var achatVisible = window.document.getElementById('fg-a-achat').style.display !== 'none';
    var panneMasque  = window.document.getElementById('fg-a-panne').style.display === 'none';
    ok('Repasser à Vente réaffiche Prix achat/Quantité', achatVisible);
    ok('Repasser à Vente masque de nouveau Panne', panneMasque);
  }

  // ===================================================================
  // TEST 18 — NON-RÉGRESSION STOCK : une Réparation dont la désignation
  // correspond PAR COÏNCIDENCE à un article en stock ne doit JAMAIS
  // décrémenter ce stock (bug réel trouvé et corrigé dans enrAct()).
  // ===================================================================
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [{ id:1, nom:'iPhone 12', qteInitiale:5, qteVendue:0, qteRestante:5, achat:800000, orig_perso:0 }];
    window.D.activites = [];
    window.rAF();
    window.sv('a-date','2026-08-16');
    window.sv('a-desig','iPhone 12'); // même nom qu'un article en stock, par coïncidence
    window.sv('a-type','Réparation');
    window.basculerChampsSelonType();
    window.sv('a-panne','Écran cassé');
    window.sv('a-apayer','50000');
    window.sv('a-paye','50000');
    window.enrAct();
    var stockInchange = window.D.stock[0].qteRestante === 5 && window.D.stock[0].qteVendue === 0;
    ok('Une Réparation ne décrémente jamais le stock, même en cas de nom identique', stockInchange, 'qteRestante='+window.D.stock[0].qteRestante+' qteVendue='+window.D.stock[0].qteVendue);
    var activiteEnregistree = window.D.activites.some(function(a){ return a.desig.toLowerCase()==='iphone 12' && a.type==='Réparation'; });
    ok('La Réparation est bien enregistrée dans les activités', activiteEnregistree);
  }

  // ===================================================================
  // TEST 19 — COHÉRENCE ADMIN ⇄ ASSOCIÉ (demande explicite de 611@) :
  // "Il reçoit (net)" (Bilan Admin) doit être EXACTEMENT ce qui est
  // poussé pour "Votre part d'intérêt actuelle" (Associé), et
  // "Reste à vous payer (15%… + dette non couverte)" doit être
  // EXACTEMENT ce qui est poussé pour "Reste que vous devez à votre
  // associé". On vérifie directement le corps de la requête envoyée à
  // Supabase (parametres.part_interet_admin / reste_a_payer_admin),
  // comparé au résultat réel de calculerBilanData() — pas une
  // approximation, la vraie formule du fichier.
  // ===================================================================
  {
    var corpsEnvoye = null;
    const fetchImpl = async (url, opts) => {
      if (String(url).indexOf('/rest/v1/parametres') !== -1 && opts && opts.method === 'POST') {
        try { corpsEnvoye = JSON.parse(opts.body); } catch(e) {}
      }
      return { ok:true, status:200, json: async()=>[] };
    };
    const { window } = nouvelleFenetre(fetchImpl, true);
    await attendre(50);
    // Jeu de données AVEC une dette non couverte, pour que pa15 ≠ ra
    // (c'est précisément le cas où l'ancien bug était visible).
    window.D.activites = [{ id:1, paye:2000000, achat:800000, qte:1 }];
    window.D.depenses  = [{ id:1, montant:150000 }];
    window.D.dettes    = [{ id:1, montant:600000 }];
    window.D.paiements = [{ id:1, montant:100000 }];
    window.D.params.reinvest = 20;
    window.D.params.retenuAssocie = 15;
    var session = { access_token:'faux-token', role:'admin' };
    window.setSession(session);
    var bd = window.calculerBilanData();
    var ilRecoitNet = Math.max(0, bd.ra);
    var resteAVousPayer = bd.resteAVousPayer;
    ok('Pré-requis du test : ce jeu de données produit bien pa15 ≠ ra (dette non couverte)', bd.pa15 !== bd.ra, 'pa15='+bd.pa15+' ra='+bd.ra);
    window.updateKPIs();
    await attendre(1700); // syncPartAssocieAuServeur est debounced (1500ms)
    ok('Le corps envoyé à Supabase contient bien part_interet_admin', corpsEnvoye && corpsEnvoye.hasOwnProperty('part_interet_admin'), JSON.stringify(corpsEnvoye));
    ok('« Votre part d\'intérêt actuelle » (poussé) === « Il reçoit (net) » (Bilan Admin), 0 différence',
      corpsEnvoye && corpsEnvoye.part_interet_admin === ilRecoitNet,
      'envoyé='+(corpsEnvoye&&corpsEnvoye.part_interet_admin)+' attendu(Il reçoit net)='+ilRecoitNet);
    ok('« Reste que vous devez à votre associé » (poussé) === « Reste à vous payer 15%… » (Bilan Admin), 0 différence',
      corpsEnvoye && corpsEnvoye.reste_a_payer_admin === resteAVousPayer,
      'envoyé='+(corpsEnvoye&&corpsEnvoye.reste_a_payer_admin)+' attendu(Reste à vous payer)='+resteAVousPayer);
    // Garde-fou anti-régression : si un jour quelqu'un remet bd.pa15 par
    // erreur (l'ancien bug), ce test doit échouer, car pa15 !== ra ici.
    ok('Garde-fou : la valeur poussée n\'est PAS bd.pa15 (l\'ancien bug)', corpsEnvoye && corpsEnvoye.part_interet_admin !== bd.pa15, 'pa15='+bd.pa15);
  }

  // ===================================================================
  // TEST 20-25 — IDENTITÉ UNIQUE DES PRODUITS (Stock Entreprise / Stock
  // Perso / Vente) : les 6 scénarios exacts demandés dans la mise à
  // jour, exécutés contre le vrai code (normNom + les fonctions qui
  // l'utilisent), pas une simulation.
  // ===================================================================

  // TEST 20 : "CHARGEUR STD V8" puis "chargeur std v8" → un seul produit
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [];
    window.fusionnerDansStockEnt('CHARGEUR STD V8', 2, 15000, 20000, '2026-08-19');
    window.fusionnerDansStockEnt('chargeur std v8', 3, 15000, 20000, '2026-08-19');
    ok('TEST 20 : "CHARGEUR STD V8" + "chargeur std v8" → un seul produit', window.D.stock.length===1, 'nb produits='+window.D.stock.length);
    ok('TEST 20 : quantité fusionnée = 5', window.D.stock[0] && window.D.stock[0].qteInitiale===5, JSON.stringify(window.D.stock));
  }

  // TEST 21 : "Écran A12" puis " ECRAN A12 " (espaces) → un seul produit
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [];
    window.fusionnerDansStockEnt('Écran A12', 4, 100000, 130000, '2026-08-19');
    window.fusionnerDansStockEnt(' ECRAN A12 ', 1, 100000, 130000, '2026-08-19');
    ok('TEST 21 : "Écran A12" + " ECRAN A12 " (espaces résiduels) → un seul produit', window.D.stock.length===1, 'nb produits='+window.D.stock.length);
  }

  // TEST 22 : Stock entreprise = 2, Stock perso = 3 → 5 après transfert
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [{ id:1, nom:'Produit X', qteInitiale:2, qteVendue:0, qteRestante:2, achat:5000, vente:7000 }];
    window.D.perso = [];
    window.rPF();
    window.sv('p-nom','produit x'); // casse différente, comme dans la demande
    window.sv('p-qte','3');
    window.sv('p-achat','5000');
    window.sv('p-vente','7000');
    window.sv('p-date','2026-08-19');
    window.enrPerso();
    ok('TEST 22 : Stock entreprise 2 + Stock perso 3 (casse différente) → une seule identité', window.D.stock.length===1, 'nb produits='+window.D.stock.length);
    ok('TEST 22 : quantité finale = 5', window.D.stock[0] && window.D.stock[0].qteInitiale===5, 'qteInitiale='+(window.D.stock[0]&&window.D.stock[0].qteInitiale));
  }

  // TEST 23 : Produit existant à quantité 0, puis réception de 5 depuis Stock perso
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [{ id:1, nom:'Batterie iPhone', qteInitiale:0, qteVendue:0, qteRestante:0, achat:60000, vente:90000 }];
    window.D.perso = [];
    window.rPF();
    window.sv('p-nom','Batterie iPhone');
    window.sv('p-qte','5');
    window.sv('p-achat','60000');
    window.sv('p-vente','90000');
    window.sv('p-date','2026-08-19');
    window.enrPerso();
    var prod = window.D.stock.find(function(s){ return window.normNom(s.nom)===window.normNom('Batterie iPhone'); });
    ok('TEST 23 : produit existant (quantité 0) reste identifié, pas dupliqué', window.D.stock.length===1, 'nb produits='+window.D.stock.length);
    ok('TEST 23 : quantité passe de 0 à 5', prod && prod.qteInitiale===5, 'qteInitiale='+(prod&&prod.qteInitiale));
  }

  // TEST 24 : Stock entreprise "Écran A12" = 5, vente saisie "écran a12" → reconnue, quantité diminuée
  // TEST 25 (variante espaces) : vente saisie " ECRAN A12 " → reconnue
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [{ id:1, nom:'Écran A12', qteInitiale:5, qteVendue:0, qteRestante:5, achat:100000, vente:130000 }];
    window.D.activites = [];
    window.rAF();
    window.sv('a-date','2026-08-19');
    window.sv('a-desig','écran a12'); // casse différente
    window.sv('a-type','Vente');
    window.basculerChampsSelonType();
    window.sv('a-achat','100000');
    window.sv('a-qte','2');
    window.sv('a-apayer','260000');
    window.sv('a-paye','260000');
    window.enrAct();
    var venteEnregistree = window.D.activites.some(function(a){ return window.normNom(a.desig)==='ecran a12' && a.type==='Vente'; });
    ok('TEST 24 : vente "écran a12" reconnue (stock = "Écran A12")', venteEnregistree, JSON.stringify(window.D.activites.map(a=>a.desig)));
    ok('TEST 24 : quantité stock diminuée de 2 (5→3)', window.D.stock[0].qteRestante===3, 'qteRestante='+window.D.stock[0].qteRestante);

    // Variante espaces, sur le même stock déjà décrémenté (3 restants)
    window.rAF();
    window.sv('a-date','2026-08-19');
    window.sv('a-desig',' ECRAN A12 '); // espaces début/fin + casse différente
    window.sv('a-type','Vente');
    window.basculerChampsSelonType();
    window.sv('a-achat','100000');
    window.sv('a-qte','1');
    window.sv('a-apayer','130000');
    window.sv('a-paye','130000');
    window.enrAct();
    ok('TEST 25 : vente " ECRAN A12 " (espaces) également reconnue', window.D.stock[0].qteRestante===2, 'qteRestante='+window.D.stock[0].qteRestante);
  }

  // TEST 26 : produit RÉELLEMENT inexistant → refus explicite, aucune vente créée
  {
    const { window } = nouvelleFenetre(async()=>({ok:true,status:200,json:async()=>[]}), true);
    await attendre(50);
    window.D.stock = [{ id:1, nom:'Écran A12', qteInitiale:5, qteVendue:0, qteRestante:5, achat:100000, vente:130000 }];
    window.D.activites = [];
    window.rAF();
    window.sv('a-date','2026-08-19');
    window.sv('a-desig','Produit Totalement Différent XYZ');
    window.sv('a-type','Vente');
    window.basculerChampsSelonType();
    window.sv('a-achat','100000');
    window.sv('a-qte','1');
    window.sv('a-apayer','100000');
    window.sv('a-paye','100000');
    window.enrAct();
    ok('TEST 26 : produit réellement inexistant → vente refusée, aucune activité créée', window.D.activites.length===0, 'nb activités créées='+window.D.activites.length);
    ok('TEST 26 : le stock existant (Écran A12) reste totalement intact', window.D.stock[0].qteRestante===5);
  }

  console.log('\n==================== RÉSULTATS ====================');
  var nbOk=0, nbKo=0;
  results.forEach(function(r){
    console.log((r.pass?'✅ PASS':'❌ FAIL') + ' — ' + r.name + (r.pass?'':'  ['+r.detail+']'));
    if(r.pass) nbOk++; else nbKo++;
  });
  console.log('=====================================================');
  console.log(nbOk + ' réussis / ' + (nbOk+nbKo) + ' au total');
  process.exit(nbKo>0?1:0);
})().catch(function(e){ console.error('ERREUR FATALE DU HARNAIS DE TEST:', e); process.exit(2); });
