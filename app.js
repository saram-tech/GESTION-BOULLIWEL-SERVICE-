'use strict';
/* =====================================================================
   BOULLIWEL PRO — Logique applicative (app.js)
   PWA de gestion de stock et service pour téléphones
   -----------------------------------------------------------------
   Architecture :
     - DATA            : état applicatif + persistance locale (localStorage)
     - NAV & MODALS     : navigation entre onglets, ouverture/fermeture modales
     - HELPERS          : petites fonctions utilitaires réutilisables
     - Modules métier    : ACTIVITÉS, STOCK, STOCK PERSO, DETTES,
                            PAIEMENTS, DÉPENSES, COMMANDES, BILAN,
                            ALERTES STOCK, CORBEILLE, CLÔTURE, RENDER
     - EXPORT / IMPORT / CLOUD : sauvegarde/restauration des données
     - PWA              : enregistrement du Service Worker, installation
     - SYSTÈME DE CONNEXION : authentification locale simple

   Prêt pour une future connexion Supabase :
   voir le bloc "SUPABASE (PRÊT POUR CONNEXION FUTURE)" en fin de fichier.
   Toute donnée passe aujourd'hui par persist()/load() (localStorage) ;
   il suffira de remplacer ces deux fonctions par des appels à l'API
   Supabase pour basculer vers une synchronisation en ligne, sans toucher
   au reste du code (le format de l'objet D reste inchangé).
   ===================================================================== */

// ================================================================
// DATA
// ================================================================
const KEY = 'bpro_v3';
let D = {
  activites:[],stock:[],perso:[],depenses:[],
  dettes:[],dettesClot:0,detteVerrou:false,
  paiements:[],commandes:[],histo:[],corbeille:[],
  _o:1,_co:1
};

function load(){
  try{
    const s=localStorage.getItem(KEY);
    if(s){ const d=JSON.parse(s); D=Object.assign({activites:[],stock:[],perso:[],depenses:[],dettes:[],dettesClot:0,detteVerrou:false,paiements:[],commandes:[],histo:[],corbeille:[],_o:1,_co:1},d); }
  }catch(e){}
}
function persist(){ localStorage.setItem(KEY,JSON.stringify(D)); }
function save(){ persist(); renderAll(); }

// ================================================================
// NAV & MODALS
// ================================================================
// gt() définie plus haut avec gestion historique navigation
function om(id){
  document.getElementById(id).classList.add('open');
  var t=td();
  document.querySelectorAll('#'+id+' input[type=date]').forEach(function(i){ if(!i.value) i.value=t; });
  if(id==='mpp') fillPP();
  if(id==='ma') fillDL();
  if(id==='mc') fillDL();
}
function cm(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.ov').forEach(function(o){
  o.addEventListener('click',function(e){ if(e.target===o) o.classList.remove('open'); });
});

// ================================================================
// HELPERS
// ================================================================
function fmt(n){ if(isNaN(n)||n==null) return '0 GNF'; return Math.round(n).toLocaleString('fr-FR')+' GNF'; }
function v(id){ var e=document.getElementById(id); return e?e.value:''; }
function fl(id){ return parseFloat(v(id))||0; }
function sv(id,val){ var e=document.getElementById(id); if(e) e.value=val; }
function st(id,val){ var e=document.getElementById(id); if(e) e.textContent=val; }
function td(){ return new Date().toISOString().split('T')[0]; }
function ah(type,desc,montant,date){ D.histo.push({id:Date.now(),type:type,desc:desc,montant:montant,date:date||td()}); }
function rb(type,label,data){ D.corbeille.push({id:Date.now(),type:type,label:label,data:JSON.parse(JSON.stringify(data)),date:td()}); }

// ================================================================
// ACTIVITÉS
// ================================================================
function fillDL(){
  var dl=document.getElementById('dl-prod');
  if(!dl) return;
  dl.innerHTML='';
  D.stock.concat(D.perso).forEach(function(p){
    var o=document.createElement('option'); o.value=p.nom; dl.appendChild(o);
  });
}
function autoPA(){
  var nom=v('a-desig').trim().toLowerCase();
  var pr=D.stock.concat(D.perso).find(function(p){ return p.nom.toLowerCase()===nom; });
  if(pr){ sv('a-achat',pr.achat||0); pAct(); }
}
function pAct(){
  var ac=fl('a-achat'),qte=Math.max(1,parseInt(v('a-qte'))||1),ap=fl('a-apayer'),pa=fl('a-paye');
  var ta=ac*qte,r=Math.max(0,ap-pa),b=pa-ta;
  var el=document.getElementById('a-prev');
  if(ap>0||pa>0){
    el.style.display='block';
    st('pv-ta',fmt(ta)); st('pv-r',fmt(r));
    var be=document.getElementById('pv-b');
    be.textContent=fmt(b); be.style.color=b>=0?'var(--gr)':'var(--re)';
  } else el.style.display='none';
}
function enrAct(){
  var date=v('a-date'),type=v('a-type'),desig=v('a-desig').trim();
  var achat=fl('a-achat'),qte=Math.max(1,parseInt(v('a-qte'))||1);
  var apayer=fl('a-apayer'),paye=fl('a-paye');
  var ticket=v('a-ticket').trim(),panne=v('a-panne').trim(),client=v('a-client').trim();
  if(!date||!desig||apayer<=0){ notif('⚠️ Date, désignation et montant à payer obligatoires'); return; }
  var reste=Math.max(0,apayer-paye), ben=paye-(achat*qte);
  var eid=v('a-eid');
  if(eid){
    var a=D.activites.find(function(x){ return x.id==eid; });
    if(a){ a.date=date;a.type=type;a.desig=desig;a.panne=panne;a.achat=achat;a.qte=qte;a.apayer=apayer;a.paye=paye;a.reste=reste;a.benefice=ben;a.ticket=ticket;a.client=client; }
    ah('activite','Modif: '+desig,paye,date);
  } else {
    D.activites.push({id:Date.now(),date:date,ordre:D._o++,ticket:ticket,type:type,desig:desig,panne:panne,achat:achat,qte:qte,apayer:apayer,paye:paye,reste:reste,benefice:ben,client:client});
    ah('activite',type+': '+desig,paye,date);
    // Décrémenter stock
    var pr=D.stock.find(function(p){ return p.nom.toLowerCase()===desig.toLowerCase(); });
    if(pr&&qte>0){ pr.qteVendue=(pr.qteVendue||0)+qte; pr.qteRestante=Math.max(0,pr.qteInitiale-(pr.qteVendue||0)); }
    var pp=D.perso.find(function(p){ return p.nom.toLowerCase()===desig.toLowerCase(); });
    if(pp&&qte>0){ pp.qteVendue=(pp.qteVendue||0)+qte; pp.qteRestante=Math.max(0,pp.qteInitiale-(pp.qteVendue||0)); }
  }
  save(); cm('ma'); rAF(); notif('✅ '+type+' enregistrée : '+desig);
}
function rAF(){
  ['a-date','a-ticket','a-desig','a-panne','a-achat','a-apayer','a-paye','a-client','a-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('a-qte',1); sv('a-type','Vente');
  document.getElementById('a-prev').style.display='none';
  st('ma-t','📋 Nouvelle Activité');
  var b=document.getElementById('btn-sa'); b.textContent='✓ Enregistrer'; b.onclick=enrAct;
}
function editAct(id){
  var a=D.activites.find(function(x){ return x.id===id; }); if(!a) return;
  sv('a-eid',id);sv('a-date',a.date);sv('a-ticket',a.ticket||'');sv('a-type',a.type);
  sv('a-desig',a.desig);sv('a-panne',a.panne||'');sv('a-achat',a.achat);sv('a-qte',a.qte||1);
  sv('a-apayer',a.apayer);sv('a-paye',a.paye);sv('a-client',a.client||'');
  st('ma-t','✏️ Modifier Activité'); pAct(); om('ma');
}
function delAct(id){
  var a=D.activites.find(function(x){ return x.id===id; }); if(!a) return;
  if(!confirm('Supprimer cette activité ?')) return;
  D.activites=D.activites.filter(function(x){ return x.id!==id; });
  rb('activite',a.desig+' ('+a.type+')',a); save(); notif('Activité → corbeille');
}

// Paiement partiel
function fillPP(){
  var sel=document.getElementById('pp-act');
  sel.innerHTML='<option value="">-- Choisir --</option>';
  D.activites.filter(function(a){ return a.reste>0; }).forEach(function(a){
    var o=document.createElement('option'); o.value=a.id; o.textContent=a.desig+' — Reste: '+fmt(a.reste); sel.appendChild(o);
  });
  sel.onchange=function(){
    var a=D.activites.find(function(x){ return x.id==sel.value; });
    var inf=document.getElementById('pp-inf');
    if(a){ inf.style.display='block'; inf.innerHTML='À payer: <strong>'+fmt(a.apayer)+'</strong> | Payé: <strong style="color:var(--gr)">'+fmt(a.paye)+'</strong> | Reste: <strong style="color:var(--or)">'+fmt(a.reste)+'</strong>'; }
    else inf.style.display='none';
  };
}
function enrPP(){
  var aid=document.getElementById('pp-act').value, m=fl('pp-m'), d=v('pp-d');
  if(!aid||m<=0){ notif('⚠️ Sélectionnez une activité et entrez un montant'); return; }
  var a=D.activites.find(function(x){ return x.id==aid; }); if(!a) return;
  if(m>a.reste){ notif('⚠️ Montant supérieur au reste ('+fmt(a.reste)+')'); return; }
  a.paye+=m; a.reste=Math.max(0,a.apayer-a.paye); a.benefice=a.paye-(a.achat*(a.qte||1));
  ah('activite','Paiement partiel: '+a.desig,m,d);
  save(); cm('mpp'); sv('pp-m',''); notif('✅ Paiement enregistré');
}

// ================================================================
// STOCK
// ================================================================
function niveauStock(restant,seuil){
  if(restant===0) return {label:'Rupture',color:'var(--re)',lvl:0};
  if(restant<=seuil) return {label:'Faible',color:'var(--or)',lvl:1};
  if(restant<=seuil*2) return {label:'Bas',color:'var(--go)',lvl:2};
  return {label:'OK',color:'var(--gr)',lvl:3};
}
function enrStock(){
  var nom=v('s-nom').trim(),qte=parseInt(v('s-qte'))||0,achat=fl('s-achat'),vente=fl('s-vente'),date=v('s-date'),seuil=parseInt(v('s-seuil'))||3;
  if(!nom||qte<=0||achat<=0){ notif('⚠️ Nom, quantité et prix achat obligatoires'); return; }
  var eid=v('s-eid');
  if(eid){
    var s=D.stock.find(function(x){ return x.id==eid; });
    if(s){ s.nom=nom;s.qteInitiale=qte;s.achat=achat;s.vente=vente;s.seuil=seuil;s.qteRestante=Math.max(0,qte-(s.qteVendue||0)); }
    ah('stock','Modif stock: '+nom,achat*qte,date);
  } else {
    var ex=D.stock.find(function(x){ return x.nom.toLowerCase()===nom.toLowerCase(); });
    if(ex){ ex.qteInitiale+=qte;ex.achat=achat;ex.vente=vente;ex.seuil=seuil;ex.qteRestante=Math.max(0,ex.qteInitiale-(ex.qteVendue||0)); }
    else D.stock.push({id:Date.now(),nom:nom,qteInitiale:qte,qteVendue:0,qteRestante:qte,achat:achat,vente:vente,seuil:seuil,date:date});
    ah('stock','Entrée: '+nom+' x'+qte,achat*qte,date);
  }
  save(); cm('ms'); rSF(); notif('✅ Stock: '+nom);
}
function rSF(){
  ['s-nom','s-qte','s-achat','s-vente','s-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('s-seuil',3); st('ms-t','📦 Entrée Stock');
  var b=document.getElementById('btn-ss'); b.textContent='✓ Enregistrer'; b.onclick=enrStock;
}
function editStock(id){
  var s=D.stock.find(function(x){ return x.id===id; }); if(!s) return;
  sv('s-eid',id);sv('s-nom',s.nom);sv('s-qte',s.qteInitiale);sv('s-achat',s.achat);sv('s-vente',s.vente||'');sv('s-date',s.date||'');sv('s-seuil',s.seuil||3);
  st('ms-t','✏️ Modifier Stock');
  var b=document.getElementById('btn-ss'); b.textContent='✓ Modifier'; b.onclick=enrStock; om('ms');
}
function delStock(id){
  var s=D.stock.find(function(x){ return x.id===id; }); if(!s) return;
  if(!confirm('Supprimer ?')) return;
  D.stock=D.stock.filter(function(x){ return x.id!==id; });
  rb('stock',s.nom,s); save(); notif('Stock → corbeille');
}

// ================================================================
// STOCK PERSO
// ================================================================
function enrPerso(){
  var nom=v('p-nom').trim(),qte=parseInt(v('p-qte'))||0,achat=fl('p-achat'),vente=fl('p-vente'),date=v('p-date');
  if(!nom||qte<=0||achat<=0){ notif('⚠️ Champs obligatoires manquants'); return; }
  // Prix revient = achat × qte ; créance = prix revient × 1.10
  var prixRevient=achat*qte, commission=prixRevient*0.10, totalDu=prixRevient+commission;
  var eid=v('p-eid');
  if(eid){
    var p=D.perso.find(function(x){ return x.id==eid; });
    if(p){ p.nom=nom;p.qteInitiale=qte;p.achat=achat;p.vente=vente;p.prixRevient=prixRevient;p.commission=commission;p.totalDu=totalDu;p.qteRestante=Math.max(0,qte-(p.qteVendue||0)); }
    ah('perso','Modif perso: '+nom,totalDu,date);
  } else {
    var ex=D.perso.find(function(p){ return p.nom.toLowerCase()===nom.toLowerCase(); });
    if(ex){ ex.qteInitiale+=qte;ex.prixRevient+=prixRevient;ex.commission+=commission;ex.totalDu+=totalDu;ex.qteRestante=Math.max(0,ex.qteInitiale-(ex.qteVendue||0)); }
    else D.perso.push({id:Date.now(),nom:nom,qteInitiale:qte,qteVendue:0,qteRestante:qte,achat:achat,vente:vente,prixRevient:prixRevient,commission:commission,totalDu:totalDu,rembourse:0,date:date});
    ah('perso','Perso: '+nom+' x'+qte,totalDu,date);
  }
  save(); cm('mp'); rPF(); notif('✅ Produit perso. L\'entreprise vous doit: '+fmt(totalDu));
}
function rPF(){
  ['p-nom','p-qte','p-achat','p-vente','p-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  st('mp-t','🏷️ Produit Personnel');
  var b=document.getElementById('btn-sp'); b.textContent='✓ Enregistrer'; b.onclick=enrPerso;
}
function editPerso(id){
  var p=D.perso.find(function(x){ return x.id===id; }); if(!p) return;
  sv('p-eid',id);sv('p-nom',p.nom);sv('p-qte',p.qteInitiale);sv('p-achat',p.achat);sv('p-vente',p.vente||'');sv('p-date',p.date||'');
  st('mp-t','✏️ Modifier Perso');
  var b=document.getElementById('btn-sp'); b.textContent='✓ Modifier'; b.onclick=enrPerso; om('mp');
}
function delPerso(id){
  var p=D.perso.find(function(x){ return x.id===id; }); if(!p) return;
  if(!confirm('Supprimer ?')) return;
  D.perso=D.perso.filter(function(x){ return x.id!==id; });
  rb('perso',p.nom,p); save(); notif('Perso → corbeille');
}
function viderPerso(){ if(!confirm('Vider tous les produits personnels ?')) return; D.perso=[]; save(); notif('Perso vidé'); }

// ================================================================
// DETTES
// ================================================================
function enrDette(){
  if(D.detteVerrou){ notif('🔒 Dettes verrouillées'); return; }
  var date=v('det-date'),type=v('det-type'),desc=v('det-desc').trim(),m=fl('det-montant');
  if(!desc||m<=0){ notif('⚠️ Description et montant obligatoires'); return; }
  var eid=v('det-eid');
  if(eid){
    var d=D.dettes.find(function(x){ return x.id==eid; });
    if(d){ d.date=date;d.type=type;d.desc=desc;d.montant=m; }
    ah('dette','Modif dette: '+desc,m,date);
  } else {
    D.dettes.push({id:Date.now(),date:date,type:type,desc:desc,montant:m});
    ah('dette','Dette: '+desc,m,date);
  }
  save(); cm('mdet'); rDF(); notif('✅ Dette enregistrée: '+fmt(m));
}
function rDF(){
  ['det-date','det-desc','det-montant','det-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('det-type','directe'); st('mdet-t','➕ Ajouter une dette');
  var b=document.getElementById('btn-sd'); b.textContent='💾 Enregistrer dette'; b.onclick=enrDette;
}
function editDette(id){
  if(D.detteVerrou){ notif('🔒 Dettes verrouillées'); return; }
  var d=D.dettes.find(function(x){ return x.id===id; }); if(!d) return;
  sv('det-eid',id);sv('det-date',d.date||td());sv('det-type',d.type);sv('det-desc',d.desc);sv('det-montant',d.montant);
  st('mdet-t','✏️ Modifier Dette');
  var b=document.getElementById('btn-sd'); b.textContent='✓ Modifier'; b.onclick=enrDette; om('mdet');
}
function delDette(id){
  if(D.detteVerrou){ notif('🔒 Dettes verrouillées'); return; }
  var d=D.dettes.find(function(x){ return x.id===id; }); if(!d) return;
  if(!confirm('Supprimer cette dette ?')) return;
  D.dettes=D.dettes.filter(function(x){ return x.id!==id; });
  rb('dette',d.desc,d); save(); notif('Dette → corbeille');
}

// ================================================================
// PAIEMENTS ASSOCIÉ
// ================================================================
function enrPaym(){
  var m=fl('paym-m'),type=v('paym-t'),note=v('paym-n'),date=v('paym-d');
  if(m<=0){ notif('⚠️ Montant invalide'); return; }
  var eid=v('paym-eid');
  if(eid){
    var p=D.paiements.find(function(x){ return x.id==eid; });
    if(p){ p.montant=m;p.type=type;p.note=note;p.date=date; }
    ah('paiement','Modif paiement: '+note,m,date);
  } else {
    D.paiements.push({id:Date.now(),montant:m,type:type,note:note,date:date});
    ah('paiement','Paiement ('+type+'): '+note,m,date);
  }
  save(); cm('mpaym'); rPAF(); notif('✅ Paiement: '+fmt(m));
}
function rPAF(){
  ['paym-m','paym-n','paym-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('paym-t','directe'); st('mpaym-t','💳 Paiement Associé');
  var b=document.getElementById('btn-spaym'); b.textContent='✓ Enregistrer'; b.onclick=enrPaym;
}
function editPaym(id){
  var p=D.paiements.find(function(x){ return x.id===id; }); if(!p) return;
  sv('paym-eid',id);sv('paym-m',p.montant);sv('paym-t',p.type);sv('paym-n',p.note||'');sv('paym-d',p.date||td());
  st('mpaym-t','✏️ Modifier Paiement');
  var b=document.getElementById('btn-spaym'); b.textContent='✓ Modifier'; b.onclick=enrPaym; om('mpaym');
}
function delPaym(id){
  var p=D.paiements.find(function(x){ return x.id===id; }); if(!p) return;
  if(!confirm('Supprimer ce paiement ?')) return;
  D.paiements=D.paiements.filter(function(x){ return x.id!==id; });
  rb('paiement','Paiement '+fmt(p.montant),p); save(); notif('Paiement → corbeille');
}

// ================================================================
// DÉPENSES
// ================================================================
function cDepTot(){ var q=Math.max(1,parseInt(v('dep-qte'))||1),p=fl('dep-prix'); sv('dep-tot',q*p); }
function enrDep(){
  var cat=v('dep-cat'),desc=v('dep-desc').trim(),qte=Math.max(1,parseInt(v('dep-qte'))||1),prix=fl('dep-prix'),total=qte*prix,date=v('dep-date');
  if(total<=0){ notif('⚠️ Prix invalide'); return; }
  var eid=v('dep-eid');
  if(eid){
    var d=D.depenses.find(function(x){ return x.id==eid; });
    if(d){ d.cat=cat;d.desc=desc;d.qte=qte;d.prix=prix;d.montant=total;d.date=date; }
    ah('depense','Modif dépense: '+desc,total,date);
  } else {
    D.depenses.push({id:Date.now(),cat:cat,desc:desc,qte:qte,prix:prix,montant:total,date:date});
    ah('depense','Dépense '+cat+': '+desc,total,date);
  }
  save(); cm('md'); rDepF(); notif('✅ Dépense enregistrée');
}
function rDepF(){
  ['dep-desc','dep-prix','dep-tot','dep-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('dep-qte',1); st('md-t','💸 Nouvelle Dépense');
  var b=document.getElementById('btn-sdep'); b.textContent='✓ Enregistrer'; b.onclick=enrDep;
}
function editDep(id){
  var d=D.depenses.find(function(x){ return x.id===id; }); if(!d) return;
  sv('dep-eid',id);sv('dep-cat',d.cat);sv('dep-desc',d.desc);sv('dep-qte',d.qte||1);sv('dep-prix',d.prix||d.montant);sv('dep-date',d.date||td()); cDepTot();
  st('md-t','✏️ Modifier Dépense');
  var b=document.getElementById('btn-sdep'); b.textContent='✓ Modifier'; b.onclick=enrDep; om('md');
}
function delDep(id){
  var d=D.depenses.find(function(x){ return x.id===id; }); if(!d) return;
  if(!confirm('Supprimer ?')) return;
  D.depenses=D.depenses.filter(function(x){ return x.id!==id; });
  rb('depense',d.desc,d); save(); notif('Dépense → corbeille');
}

// ================================================================
// COMMANDES
// ================================================================
var cmdLignes=[];
function addCL(){ cmdLignes.push({produit:'',qte:1,prix:0}); rCL(); }
function rCL(){
  var el=document.getElementById('c-lignes');
  var html='';
  cmdLignes.forEach(function(l,i){
    html+='<div class="fr" style="margin-bottom:6px;align-items:flex-end">';
    html+='<div class="fg"><label>Produit</label><input type="text" value="'+(l.produit||'')+'" oninput="cmdLignes['+i+'].produit=this.value" placeholder="Nom produit..." list="dl-prod"></div>';
    html+='<div class="fg" style="max-width:80px"><label>Qté</label><input type="number" value="'+l.qte+'" min="1" oninput="cmdLignes['+i+'].qte=parseInt(this.value)||1;uCT()"></div>';
    html+='<div class="fg" style="max-width:120px"><label>Prix (GNF)</label><input type="number" value="'+l.prix+'" oninput="cmdLignes['+i+'].prix=parseFloat(this.value)||0;uCT()"></div>';
    html+='<button type="button" class="btn bd bxs" style="margin-bottom:1px" onclick="cmdLignes.splice('+i+',1);rCL()">✕</button>';
    html+='</div>';
  });
  el.innerHTML=html;
  uCT();
}
function uCT(){
  var tot=cmdLignes.reduce(function(s,l){ return s+l.qte*l.prix; },0);
  st('c-tot',fmt(tot));
}
function enrCmd(){
  var date=v('c-date'),client=v('c-client').trim(),tel=v('c-tel').trim();
  if(!date||!client){ notif('⚠️ Date et client obligatoires'); return; }
  if(!cmdLignes.length){ notif('⚠️ Ajoutez au moins un produit'); return; }
  var total=cmdLignes.reduce(function(s,l){ return s+l.qte*l.prix; },0);
  var num=v('c-num').trim()||('CMD-'+String(D._co).padStart(3,'0'));
  var eid=v('c-eid');
  if(eid){
    var c=D.commandes.find(function(x){ return x.id==eid; });
    if(c){ c.date=date;c.num=num;c.client=client;c.tel=tel;c.adresse=v('c-adr');c.produits=cmdLignes.slice();c.total=total;c.statut=v('c-st');c.note=v('c-note'); }
    ah('commande','Modif commande: '+client,total,date);
  } else {
    D._co++;
    D.commandes.push({id:Date.now(),date:date,num:num,client:client,tel:tel,adresse:v('c-adr'),produits:cmdLignes.slice(),total:total,statut:v('c-st'),note:v('c-note')});
    ah('commande','Commande: '+client+' — '+num,total,date);
  }
  save(); cm('mc'); rCF(); notif('✅ Commande enregistrée');
}
function rCF(){
  ['c-date','c-num','c-client','c-tel','c-adr','c-note','c-eid'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  sv('c-st','En attente'); cmdLignes=[]; rCL(); st('mc-t','📑 Nouvelle Commande');
  var b=document.getElementById('btn-sc'); b.textContent='✓ Enregistrer commande'; b.onclick=enrCmd;
}
function editCmd(id){
  var c=D.commandes.find(function(x){ return x.id===id; }); if(!c) return;
  sv('c-eid',id);sv('c-date',c.date);sv('c-num',c.num);sv('c-client',c.client);sv('c-tel',c.tel||'');sv('c-adr',c.adresse||'');sv('c-st',c.statut);sv('c-note',c.note||'');
  cmdLignes=c.produits.slice(); rCL();
  st('mc-t','✏️ Modifier Commande');
  var b=document.getElementById('btn-sc'); b.textContent='✓ Modifier'; b.onclick=enrCmd; om('mc');
}
function delCmd(id){
  var c=D.commandes.find(function(x){ return x.id===id; }); if(!c) return;
  if(!confirm('Supprimer cette commande ?')) return;
  D.commandes=D.commandes.filter(function(x){ return x.id!==id; });
  rb('commande',c.num+': '+c.client,c); save(); notif('Commande → corbeille');
}
function cStatCmd(id,s){
  var c=D.commandes.find(function(x){ return x.id===id; });
  if(c){ c.statut=s; persist(); }
}
function appelClient(){
  var tel=v('c-tel').trim();
  if(!tel){ notif('⚠️ Aucun numéro de téléphone saisi'); return; }
  window.location.href='tel:'+tel;
}
function appelClientById(id){
  var c=D.commandes.find(function(x){ return x.id===id; });
  if(c&&c.tel) window.location.href='tel:'+c.tel;
  else notif('⚠️ Aucun numéro pour cette commande');
}

// Fiche commande fournisseur depuis alerte
function creerCmdFournisseur(stockId){
  var s=D.stock.find(function(x){ return x.id===stockId; }); if(!s) return;
  var restant=s.qteRestante!==undefined?s.qteRestante:s.qteInitiale;
  var qteCmd=Math.max((s.seuil||3)*3,10);
  sv('c-client','FOURNISSEUR — '+s.nom);
  sv('c-note','Réapprovisionnement. Stock restant: '+restant+'. Seuil: '+(s.seuil||3));
  cmdLignes=[{produit:s.nom,qte:qteCmd,prix:s.achat}];
  rCL(); sv('c-st','En attente');
  st('mc-t','📦 Commande Fournisseur: '+s.nom);
  om('mc'); gt('commandes',null);
  notif('📦 Fiche fournisseur créée pour: '+s.nom);
}

// ================================================================
// BILAN
// ================================================================
function calculerBilan(){
  var tp=D.activites.reduce(function(s,a){ return s+a.paye; },0);
  var ta=D.activites.reduce(function(s,a){ return s+(a.achat*(a.qte||1)); },0);
  var tapy=D.activites.reduce(function(s,a){ return s+a.apayer; },0);
  var tr=D.activites.reduce(function(s,a){ return s+a.reste; },0);
  var bb=tp-ta;
  var tdep=D.depenses.reduce(function(s,d){ return s+d.montant; },0);
  var tperso=D.perso.reduce(function(s,p){ return s+(p.totalDu-p.rembourse); },0);
  var d20=bb*0.20, a20=bb-d20, aD=a20-tdep;
  var mp=aD/2, pab=aD/2;
  var r15=pab*0.15, pa15=pab-r15;
  var totD=D.dettes.reduce(function(s,d){ return s+d.montant; },0)+D.dettesClot;
  var totP=D.paiements.reduce(function(s,p){ return s+p.montant; },0);
  var dn=Math.max(0,totD-totP);
  var ra=pa15-dn;
  // Entreprise me doit: 20% + stock perso − (prix achat total + 20%)
  var entDoit=d20+tperso;
  var aDeduire=ta+d20;
  var resteEnt=entDoit-aDeduire;
  var res=document.getElementById('bilan-result');
  if(tp<=0&&ta<=0){
    res.innerHTML='<div class="card" style="text-align:center;padding:32px;color:var(--tx2)"><div style="font-size:1.8rem;margin-bottom:7px">📊</div>Aucune activité enregistrée.</div>';
    return;
  }
  var html='';
  html+='<div class="card" style="border-color:rgba(34,197,94,.2);background:var(--bg3);margin-bottom:12px">';
  html+='<div class="ch"><span class="dot" style="background:var(--gr)"></span>Résumé période</div>';
  html+='<div class="g5">';
  html+='<div class="kpi"><div class="kl">À Payer</div><div class="kv">'+fmt(tapy)+'</div></div>';
  html+='<div class="kpi"><div class="kl">Encaissé</div><div class="kv g">'+fmt(tp)+'</div></div>';
  html+='<div class="kpi"><div class="kl">Reste</div><div class="kv gold">'+fmt(tr)+'</div></div>';
  html+='<div class="kpi"><div class="kl">Coût Achat</div><div class="kv r">'+fmt(ta)+'</div></div>';
  html+='<div class="kpi"><div class="kl">Bénéfice Brut</div><div class="kv g">'+fmt(bb)+'</div></div>';
  html+='</div></div>';
  html+='<div class="card">';
  html+='<div class="ch"><span class="dot" style="background:var(--go)"></span>Calcul bénéfice net</div>';
  html+='<div style="background:var(--bg4);border-radius:9px;padding:12px;margin-bottom:11px">';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">Bénéfice brut (sur payés uniquement)</span><span style="color:var(--gr)">'+fmt(bb)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">− 20% réinvestissement</span><span style="color:var(--re)">− '+fmt(d20)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">Après 20%</span><span>'+fmt(a20)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">− Dépenses totales</span><span style="color:var(--re)">− '+fmt(tdep)+'</span></div>';
  html+='<hr class="sep">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600">Bénéfice net à partager</span><span style="font-family:Syne,sans-serif;font-size:1.05rem;color:var(--gr)">'+fmt(aD)+'</span></div>';
  html+='</div>';
  html+='<div class="dv">Répartition 50/50</div>';
  html+='<div class="g2" style="margin-bottom:11px">';
  html+='<div class="rb gold"><div class="rl">🟡 MA PART</div><div class="rv" style="color:var(--go)">'+fmt(mp)+'</div><div style="font-size:.69rem;color:var(--tx2);margin-top:2px">50% bénéfice net</div></div>';
  html+='<div class="rb"><div class="rl">🔵 PART ASSOCIÉ (base)</div><div class="rv" style="color:var(--ac)">'+fmt(pab)+'</div><div style="font-size:.69rem;color:var(--tx2);margin-top:2px">50% bénéfice net</div></div>';
  html+='</div>';
  html+='<div class="dv">Calcul part associé</div>';
  html+='<div style="background:var(--bg4);border-radius:9px;padding:12px;margin-bottom:11px">';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">Part de base (50%)</span><span>'+fmt(pab)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">− 15% de sa part (retenu)</span><span style="color:var(--re)">− '+fmt(r15)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">− Dettes nettes (dettes − paiements reçus)</span><span style="color:var(--re)">− '+fmt(dn)+'</span></div>';
  html+='<hr class="sep">';
  var raColor=ra>=0?'var(--gr)':'var(--re)';
  html+='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600">Il reçoit (net)</span><span style="font-family:Syne,sans-serif;font-size:1.05rem;color:'+raColor+'">'+fmt(Math.max(0,ra))+'</span></div>';
  if(ra<0) html+='<div style="margin-top:6px;padding:6px;background:rgba(239,68,68,.1);border-radius:7px;font-size:.77rem;color:var(--re)">⚠️ Il vous doit encore : <strong>'+fmt(Math.abs(ra))+'</strong></div>';
  html+='</div>';
  html+='<div style="padding:10px;background:var(--bg5);border-radius:8px;margin-bottom:11px;display:flex;justify-content:space-between">';
  html+='<span style="color:var(--tx2)">💳 Reste à vous payer (15% + dettes non couvertes)</span>';
  html+='<span style="font-family:Syne,sans-serif;color:var(--re)">'+fmt(r15+Math.max(0,-ra))+'</span>';
  html+='</div>';
  html+='<div class="dv">Ce que l\'entreprise vous doit</div>';
  html+='<div style="background:var(--bg4);border-radius:9px;padding:12px">';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">20% réinvesti</span><span style="color:var(--go)">'+fmt(d20)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">Stock perso (prix revient + 10%)</span><span style="color:var(--go)">'+fmt(tperso)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">Total brut dû</span><span style="color:var(--go)">'+fmt(entDoit)+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2)">− (Prix achat total + 20%) remboursés</span><span style="color:var(--re)">− '+fmt(aDeduire)+'</span></div>';
  html+='<hr class="sep">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600">Reste que l\'entreprise vous doit</span><span style="font-family:Syne,sans-serif;font-size:1.05rem;color:var(--go)">'+fmt(Math.max(0,resteEnt))+'</span></div>';
  html+='</div></div>';
  res.innerHTML=html;
  updateKPIs();
}

// ================================================================
// ALERTES STOCK
// ================================================================
function rAlertesStock(){
  var el=document.getElementById('alertes-stock'); if(!el) return;
  var faibles=D.stock.filter(function(s){
    var restant=s.qteRestante!==undefined?s.qteRestante:s.qteInitiale;
    return restant<=(s.seuil||3);
  });
  if(!faibles.length){ el.innerHTML=''; return; }
  var html='<div class="card" style="border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.03);margin-bottom:12px">';
  html+='<div class="ch"><span class="dot" style="background:var(--re)"></span>🔴 Alertes Stock Faible — Fiches Commande Fournisseur</div>';
  html+='<div class="al ald" style="font-size:.77rem">⚠️ Ces produits ont atteint leur seuil d\'alerte. Commandez auprès de votre fournisseur.</div>';
  faibles.forEach(function(s){
    var restant=s.qteRestante!==undefined?s.qteRestante:s.qteInitiale;
    var seuil=s.seuil||3;
    var niv=niveauStock(restant,seuil);
    var qteCmd=Math.max(seuil*3,10);
    html+='<div class="fi-box">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">';
    html+='<div><strong style="font-size:.88rem">'+s.nom+'</strong> <span class="badge bdr" style="margin-left:6px">'+niv.label+' ('+restant+')</span></div>';
    html+='<button class="btn bo bxs" onclick="creerCmdFournisseur('+s.id+')">📦 Créer commande fournisseur</button>';
    html+='</div>';
    html+='<div class="g4" style="font-size:.78rem">';
    html+='<div style="background:var(--bg5);padding:8px;border-radius:7px;text-align:center"><div style="color:var(--tx2);font-size:.65rem">RESTANT</div><div style="font-weight:700;color:'+niv.color+'">'+restant+'</div></div>';
    html+='<div style="background:var(--bg5);padding:8px;border-radius:7px;text-align:center"><div style="color:var(--tx2);font-size:.65rem">SEUIL</div><div style="font-weight:700">'+seuil+'</div></div>';
    html+='<div style="background:var(--bg5);padding:8px;border-radius:7px;text-align:center"><div style="color:var(--tx2);font-size:.65rem">INITIAL</div><div style="font-weight:700">'+s.qteInitiale+'</div></div>';
    html+='<div style="background:var(--bg5);padding:8px;border-radius:7px;text-align:center"><div style="color:var(--tx2);font-size:.65rem">VENDU</div><div style="font-weight:700;color:var(--or)">'+(s.qteVendue||0)+'</div></div>';
    html+='</div>';
    html+='<div style="margin-top:9px;padding:8px;background:var(--bg3);border-radius:7px;font-size:.77rem">';
    html+='<strong style="color:var(--te)">📋 Fiche commande fournisseur :</strong> ';
    html+='Produit: <strong>'+s.nom+'</strong> | Qté suggérée: <strong style="color:var(--go)">'+qteCmd+'</strong> | Dernier P.Achat: <strong>'+fmt(s.achat)+'</strong>';
    html+='</div></div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

// ================================================================
// CORBEILLE
// ================================================================
function restaurer(id){
  var c=D.corbeille.find(function(x){ return x.id===id; }); if(!c) return;
  if(c.type==='activite') D.activites.push(c.data);
  else if(c.type==='stock') D.stock.push(c.data);
  else if(c.type==='perso') D.perso.push(c.data);
  else if(c.type==='depense') D.depenses.push(c.data);
  else if(c.type==='dette') D.dettes.push(c.data);
  else if(c.type==='paiement') D.paiements.push(c.data);
  else if(c.type==='commande') D.commandes.push(c.data);
  D.corbeille=D.corbeille.filter(function(x){ return x.id!==id; });
  ah(c.type,'Restauré: '+c.label,0,td());
  save(); notif('✅ Restauré : '+c.label);
}
function suppDef(id){
  if(!confirm('Supprimer définitivement ? Irréversible.')) return;
  D.corbeille=D.corbeille.filter(function(x){ return x.id!==id; });
  save(); notif('Suppression définitive effectuée');
}
function vCorbeille(){
  if(!confirm('Vider toute la corbeille définitivement ?')) return;
  D.corbeille=[]; save(); notif('Corbeille vidée');
}

// ================================================================
// CLÔTURE
// ================================================================
function cloturer(){
  if(!confirm('⚠️ CLÔTURE DE PÉRIODE\n\nActivités, dépenses et historique supprimés.\nDettes fusionnées et VERROUILLÉES.\nStock conservé.\n\nContinuer ?')) return;
  var totD=D.dettes.reduce(function(s,d){ return s+d.montant; },0);
  var totP=D.paiements.reduce(function(s,p){ return s+p.montant; },0);
  D.dettesClot=Math.max(0,totD-totP)+D.dettesClot;
  D.dettes=[]; D.paiements=[];
  D.activites=[]; D.depenses=[]; D.histo=[]; D._o=1;
  D.detteVerrou=true;
  persist(); renderAll(); notif('✅ Clôture. Dette globale verrouillée: '+fmt(D.dettesClot));
}

// ================================================================
// RENDER
// ================================================================
function rAct(){
  var tb=document.getElementById('tbl-act');
  var ft=v('f-type'),fs=v('f-search').toLowerCase();
  var items=D.activites.slice().reverse();
  if(ft) items=items.filter(function(a){ return a.type===ft; });
  if(fs) items=items.filter(function(a){ return a.desig.toLowerCase().indexOf(fs)>-1||(a.client||'').toLowerCase().indexOf(fs)>-1||(a.panne||'').toLowerCase().indexOf(fs)>-1; });
  if(!items.length){
    tb.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--tx2);padding:20px">Aucune activité</td></tr>';
    st('t-enc','0 GNF'); st('t-ben','0 GNF'); st('t-rst','0 GNF'); return;
  }
  var tc={'Vente':'bbr','Réparation':'bnr','Service':'btr'};
  var html='';
  items.forEach(function(a){
    var tcc=tc[a.type]||'bbr';
    html+='<tr>';
    html+='<td>'+a.date+'</td>';
    html+='<td style="color:var(--tx2);font-weight:600">'+a.ordre+'</td>';
    html+='<td>'+(a.ticket?'<span class="badge bpr" style="font-size:.66rem">'+a.ticket+'</span>':'<span style="color:var(--tx3)">—</span>')+'</td>';
    html+='<td><span class="badge '+tcc+'">'+a.type+'</span></td>';
    html+='<td><strong>'+a.desig+'</strong>'+(a.qte>1?' <span style="color:var(--tx2);font-size:.73rem">×'+a.qte+'</span>':'')+'</td>';
    html+='<td style="color:var(--tx2);font-size:.75rem">'+(a.panne||'—')+'</td>';
    html+='<td>'+fmt(a.achat*(a.qte||1))+'</td>';
    html+='<td>'+fmt(a.apayer)+'</td>';
    html+='<td style="color:var(--gr)">'+fmt(a.paye)+'</td>';
    html+='<td style="color:'+(a.reste>0?'var(--or)':'var(--gr)')+'">'+fmt(a.reste)+(a.reste>0?' <span class="badge bnr" style="font-size:.62rem">Reste</span>':'')+'</td>';
    html+='<td style="font-size:.75rem;color:var(--tx2)">'+(a.client||'—')+'</td>';
    html+='<td style="color:'+(a.benefice>=0?'var(--gr)':'var(--re)')+'"><strong>'+fmt(a.benefice)+'</strong></td>';
    html+='<td class="ac"><button class="btn bh bxs" onclick="editAct('+a.id+')">✏️</button><button class="btn bd bxs" onclick="delAct('+a.id+')">🗑️</button></td>';
    html+='</tr>';
  });
  tb.innerHTML=html;
  var enc=items.reduce(function(s,a){ return s+a.paye; },0);
  var ben=items.reduce(function(s,a){ return s+a.benefice; },0);
  var rst=items.reduce(function(s,a){ return s+a.reste; },0);
  st('t-enc',fmt(enc)); st('t-ben',fmt(ben)); st('t-rst',fmt(rst));
}

function rStock(){
  var tb=document.getElementById('tbl-stock');
  if(!D.stock.length){ tb.innerHTML='<tr><td colspan="11" style="text-align:center;color:var(--tx2);padding:20px">Aucun produit</td></tr>'; return; }
  var html='';
  D.stock.forEach(function(s){
    var restant=s.qteRestante!==undefined?s.qteRestante:s.qteInitiale;
    var seuil=s.seuil||3;
    var niv=niveauStock(restant,seuil);
    html+='<tr>';
    html+='<td><strong>'+s.nom+'</strong></td>';
    html+='<td>'+s.qteInitiale+'</td>';
    html+='<td style="color:var(--or)">'+(s.qteVendue||0)+'</td>';
    html+='<td><strong style="color:'+niv.color+'">'+restant+'</strong></td>';
    html+='<td><span class="badge" style="background:'+niv.color+'20;color:'+niv.color+'">'+niv.label+'</span></td>';
    html+='<td style="color:var(--tx2)">'+seuil+'</td>';
    html+='<td>'+fmt(s.achat)+'</td>';
    html+='<td>'+fmt(s.vente||0)+'</td>';
    html+='<td>'+fmt(restant*s.achat)+'</td>';
    html+='<td>'+(s.date||'—')+'</td>';
    html+='<td class="ac"><button class="btn bh bxs" onclick="editStock('+s.id+')">✏️</button><button class="btn bd bxs" onclick="delStock('+s.id+')">🗑️</button></td>';
    html+='</tr>';
  });
  tb.innerHTML=html;
}

function rPerso(){
  var tb=document.getElementById('tbl-perso');
  if(!D.perso.length){ tb.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--tx2);padding:20px">Aucun produit perso</td></tr>'; st('t-perso','0 GNF'); return; }
  var tot=0, html='';
  D.perso.forEach(function(p){
    var r=p.totalDu-p.rembourse; tot+=r;
    var restant=p.qteRestante!==undefined?p.qteRestante:p.qteInitiale;
    html+='<tr>';
    html+='<td><strong>'+p.nom+'</strong></td>';
    html+='<td>'+p.qteInitiale+'</td>';
    html+='<td style="color:var(--or)">'+(p.qteVendue||0)+'</td>';
    html+='<td><strong style="color:'+(restant<3?'var(--re)':'var(--gr)')+'">'+restant+'</strong></td>';
    html+='<td>'+fmt(p.achat)+'</td>';
    html+='<td style="color:var(--tx2)">'+fmt(p.prixRevient||p.achat*p.qteInitiale)+'</td>';
    html+='<td style="color:var(--gr)">+'+fmt(p.commission)+'</td>';
    html+='<td style="color:var(--go)">'+fmt(p.totalDu)+'</td>';
    html+='<td><span class="badge '+(r>0?'bor':'bgr')+'">'+(r>0?'En attente':'Remboursé')+'</span></td>';
    html+='<td class="ac"><button class="btn bh bxs" onclick="editPerso('+p.id+')">✏️</button><button class="btn bd bxs" onclick="delPerso('+p.id+')">🗑️</button></td>';
    html+='</tr>';
  });
  tb.innerHTML=html; st('t-perso',fmt(tot));
}

function rDettes(){
  var locked=D.detteVerrou;
  document.getElementById('lkb').style.display=locked?'inline-flex':'none';
  document.getElementById('al-clot').style.display=locked?'block':'none';
  var ba=document.getElementById('btn-add-dette'); ba.disabled=locked; ba.style.opacity=locked?'.4':'1';
  var tb=document.getElementById('tbl-dettes');
  if(!D.dettes.length) tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--tx2);padding:12px">Aucune dette active</td></tr>';
  else{
    var html='';
    D.dettes.forEach(function(d){
      html+='<tr><td>'+(d.date||'—')+'</td><td>'+d.desc+'</td>';
      html+='<td><span class="badge bnr">'+d.type+'</span></td>';
      html+='<td style="color:var(--re)">'+fmt(d.montant)+'</td>';
      html+='<td class="ac">'+(locked?'<span class="badge bgg">🔒</span>':'<button class="btn bh bxs" onclick="editDette('+d.id+')">✏️</button><button class="btn bd bxs" onclick="delDette('+d.id+')">🗑️</button>')+'</td></tr>';
    });
    tb.innerHTML=html;
  }
  var ta=D.dettes.reduce(function(s,d){ return s+d.montant; },0);
  st('tot-da',fmt(ta)); st('tot-dc',fmt(D.dettesClot)); st('tot-dg',fmt(ta+D.dettesClot));
  var tb2=document.getElementById('tbl-paym');
  if(!D.paiements.length) tb2.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--tx2);padding:10px">Aucun paiement</td></tr>';
  else{
    var html2='';
    D.paiements.slice().reverse().forEach(function(p){
      html2+='<tr><td>'+p.date+'</td><td><span class="badge bgr">'+p.type+'</span></td>';
      html2+='<td style="font-size:.76rem">'+(p.note||'—')+'</td>';
      html2+='<td style="color:var(--gr)">'+fmt(p.montant)+'</td>';
      html2+='<td class="ac"><button class="btn bh bxs" onclick="editPaym('+p.id+')">✏️</button><button class="btn bd bxs" onclick="delPaym('+p.id+')">🗑️</button></td></tr>';
    });
    tb2.innerHTML=html2;
  }
}

function rDep(){
  var tb=document.getElementById('tbl-dep');
  if(!D.depenses.length){ tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--tx2);padding:20px">Aucune dépense</td></tr>'; return; }
  var tot=0, mois=0, m=new Date().toISOString().slice(0,7), html='';
  D.depenses.forEach(function(d){
    tot+=d.montant; if(d.date&&d.date.startsWith(m)) mois+=d.montant;
    html+='<tr><td>'+(d.date||'—')+'</td><td><span class="badge bbr">'+d.cat+'</span></td>';
    html+='<td>'+(d.desc||'—')+'</td><td>'+(d.qte||1)+'</td>';
    html+='<td>'+fmt(d.prix||d.montant)+'</td>';
    html+='<td style="color:var(--re)"><strong>'+fmt(d.montant)+'</strong></td>';
    html+='<td class="ac"><button class="btn bh bxs" onclick="editDep('+d.id+')">✏️</button><button class="btn bd bxs" onclick="delDep('+d.id+')">🗑️</button></td></tr>';
  });
  tb.innerHTML=html; st('k-dt',fmt(tot)); st('k-dm',fmt(mois));
}

function rCmd(){
  var tb=document.getElementById('tbl-cmd');
  if(!D.commandes.length){ tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--tx2);padding:20px">Aucune commande</td></tr>'; return; }
  var sc={'En attente':'bnr','En cours':'bbr','Livré':'bgr','Annulé':'bdr'};
  var html='';
  D.commandes.slice().reverse().forEach(function(c){
    html+='<tr>';
    html+='<td>'+c.date+'</td>';
    html+='<td><span class="badge bpr">'+c.num+'</span></td>';
    html+='<td><strong>'+c.client+'</strong></td>';
    html+='<td>'+(c.tel?'<a href="tel:'+c.tel+'" style="color:var(--gr);font-size:.76rem;text-decoration:none">📞 '+c.tel+'</a>':'<span style="color:var(--tx3)">—</span>')+'</td>';
    html+='<td style="font-size:.75rem;color:var(--tx2)">'+c.produits.map(function(p){ return p.produit+' ×'+p.qte; }).join(', ')+'</td>';
    html+='<td style="color:var(--go)">'+fmt(c.total)+'</td>';
    html+='<td><select onchange="cStatCmd('+c.id+',this.value)" style="background:var(--bg4);border:1px solid var(--bd);border-radius:5px;padding:2px 7px;color:var(--tx);font-size:.74rem">';
    ['En attente','En cours','Livré','Annulé'].forEach(function(s){ html+='<option value="'+s+'"'+(c.statut===s?' selected':'')+'>'+s+'</option>'; });
    html+='</select></td>';
    html+='<td class="ac"><button class="btn bh bxs" onclick="editCmd('+c.id+')">✏️</button>'+(c.tel?'<button class="btn bs bxs" onclick="appelClientById('+c.id+')" title="Appeler">📞</button>':'')+'<button class="btn bd bxs" onclick="delCmd('+c.id+')">🗑️</button></td>';
    html+='</tr>';
  });
  tb.innerHTML=html;
}

function rHisto(){
  var tb=document.getElementById('tbl-histo');
  var ft=v('f-histo');
  var items=D.histo.slice().reverse();
  if(ft) items=items.filter(function(i){ return i.type===ft; });
  if(!items.length){ tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--tx2);padding:20px">Aucun historique</td></tr>'; return; }
  var tc={activite:'bbr',stock:'bgr',depense:'bdr',paiement:'bor',dette:'bnr',perso:'bpr',commande:'btr'};
  var html='';
  items.forEach(function(i){
    html+='<tr><td>'+(i.date||'—')+'</td><td><span class="badge '+(tc[i.type]||'bbr')+'">'+i.type+'</span></td><td>'+i.desc+'</td><td>'+(i.montant?fmt(i.montant):'—')+'</td></tr>';
  });
  tb.innerHTML=html;
}
function vHisto(){ if(!confirm('Vider tout l\'historique ?')) return; D.histo=[]; save(); rHisto(); }

function rCorbeille(){
  var el=document.getElementById('corbeille-list');
  if(!D.corbeille.length){ el.innerHTML='<div style="text-align:center;color:var(--tx2);padding:26px">La corbeille est vide.</div>'; return; }
  var tc={activite:'bbr',stock:'bgr',depense:'bdr',paiement:'bor',dette:'bnr',perso:'bpr',commande:'btr'};
  var html='';
  D.corbeille.slice().reverse().forEach(function(c){
    html+='<div class="ci">';
    html+='<div style="color:var(--tx2)"><span class="badge '+(tc[c.type]||'bgg')+'" style="margin-right:6px">'+c.type+'</span><strong>'+c.label+'</strong> <span style="font-size:.7rem;color:var(--tx3)">— '+c.date+'</span></div>';
    html+='<div style="display:flex;gap:5px"><button class="btn bs bxs" onclick="restaurer('+c.id+')">♻️ Restaurer</button><button class="btn bd bxs" onclick="suppDef('+c.id+')">❌ Suppr. déf.</button></div>';
    html+='</div>';
  });
  el.innerHTML=html;
}

function updateKPIs(){
  var enc=D.activites.reduce(function(s,a){ return s+a.paye; },0);
  var ac=D.activites.reduce(function(s,a){ return s+(a.achat*(a.qte||1)); },0);
  var dep=D.depenses.reduce(function(s,d){ return s+d.montant; },0);
  var bb=enc-ac, r20=bb*0.20, net=bb-r20-dep;
  var rst=D.activites.reduce(function(s,a){ return s+a.reste; },0);
  var tp=D.perso.reduce(function(s,p){ return s+(p.totalDu-p.rembourse); },0);
  var entDoit=Math.max(0,(r20+tp)-(ac+r20));
  var totD=D.dettes.reduce(function(s,d){ return s+d.montant; },0)+D.dettesClot;
  st('k-enc',fmt(enc)); st('k-ben',fmt(net)); st('k-map',fmt(net/2));
  st('k-dep',fmt(dep)); st('k-rst',fmt(rst)); st('k-ent',fmt(entDoit)); st('k-det',fmt(totD));
  st('k-act',D.activites.length);
  st('k-ven',D.activites.filter(function(a){ return a.type==='Vente'; }).length);
  st('k-rep',D.activites.filter(function(a){ return a.type!=='Vente'; }).length);
  var l5=D.histo.slice(-5).reverse();
  var lohtml=l5.length?l5.map(function(h){ return '<div style="padding:3px 0;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between"><span style="font-size:.76rem">'+h.desc+'</span><span style="color:var(--tx2);font-size:.7rem">'+h.date+'</span></div>'; }).join(''):'Aucune opération.';
  document.getElementById('last-ops').innerHTML=lohtml;
}

function renderAll(){
  rAct(); rStock(); rPerso(); rDettes(); rDep(); rCmd(); rHisto(); rCorbeille(); rAlertesStock(); updateKPIs(); calculerBilan();
}

// ================================================================
// EXPORT / IMPORT / CLOUD
// ================================================================
function exportData(){
  var b=new Blob([JSON.stringify(D,null,2)],{type:'application/json'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(b);
  a.download='boulliwel_'+td()+'.json'; a.click(); notif('✅ Données exportées');
}
function importData(){ document.getElementById('fi').click(); }
function hImport(e){
  var f=e.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var d=JSON.parse(ev.target.result);
      if(confirm('Remplacer toutes les données actuelles ?')){ D=Object.assign({activites:[],stock:[],perso:[],depenses:[],dettes:[],dettesClot:0,detteVerrou:false,paiements:[],commandes:[],histo:[],corbeille:[],_o:1,_co:1},d); persist(); renderAll(); notif('✅ Données importées'); }
    }catch(err){ notif('⚠️ Fichier invalide'); }
  };
  r.readAsText(f); e.target.value='';
}
function saveCloud(){
  var enc=btoa(encodeURIComponent(JSON.stringify(D)));
  var url=window.location.href.split('#')[0]+'#data='+enc;
  navigator.clipboard.writeText(url).then(function(){ notif('✅ Lien copié ! Collez-le dans Gmail.'); }).catch(function(){
    var ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); notif('✅ Lien copié');
  });
}
function loadFromHash(){
  var h=window.location.hash;
  if(h&&h.startsWith('#data=')){
    try{ D=Object.assign({activites:[],stock:[],perso:[],depenses:[],dettes:[],dettesClot:0,detteVerrou:false,paiements:[],commandes:[],histo:[],corbeille:[],_o:1,_co:1},JSON.parse(decodeURIComponent(atob(h.slice(6))))); persist(); notif('✅ Données restaurées !'); return true; }catch(e){}
  } return false;
}

// ================================================================
// PWA — Service Worker & installation
// ================================================================

/**
 * Enregistre le Service Worker et écoute les mises à jour disponibles.
 * En cas de nouvelle version détectée, l'utilisateur est averti via notif()
 * dès que le nouveau worker est prêt (mise à jour transparente au prochain
 * chargement de la page).
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            notif('🔄 Nouvelle version disponible. Rechargez la page.', 5000);
          }
        });
      });
    }).catch(function (err) {
      console.error('Échec de l\'enregistrement du Service Worker :', err);
    });
  });
}

// Invite d'installation (bouton "Installer l'application")
var dp;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault(); dp = e;
  var b = document.getElementById('btn-install');
  if (b) {
    b.style.display = 'inline-flex';
    b.onclick = function () {
      dp.prompt();
      dp.userChoice.then(function () { dp = null; b.style.display = 'none'; });
    };
  }
});

// Confirmation visuelle après installation réussie
window.addEventListener('appinstalled', function () {
  notif('✅ Application installée avec succès !');
});

function notif(msg,d){
  d=d||3500;
  var el=document.getElementById('notif'); el.textContent=msg; el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); },d);
}



// ================================================================
// AFFICHAGE MOT DE PASSE
// ================================================================
function togglePass(inputId, icon) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.textContent = '🙈';
  } else {
    inp.type = 'password';
    icon.textContent = '👁';
  }
}

// ================================================================
// NAVIGATION — BOUTON RETOUR
// ================================================================
var navHistory = [];
var tabOrder = ['dashboard','activites','stock','perso','bilan','associe','depenses','commandes','historique','corbeille'];

function gt(id, btn) {
  // Enregistrer l'onglet actuel avant de changer
  var current = document.querySelector('.tab-panel.active');
  if (current && current.id) {
    var currentId = current.id.replace('tab-','');
    if (!navHistory.length || navHistory[navHistory.length-1] !== currentId) {
      navHistory.push(currentId);
      if (navHistory.length > 20) navHistory.shift();
    }
  }
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nb').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('tab-'+id).classList.add('active');
  if (btn) btn.classList.add('active');
  else document.querySelectorAll('.nb').forEach(function(b){
    if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'"+id+"'") > -1) b.classList.add('active');
  });
}

function goBack() {
  if (navHistory.length > 0) {
    var prev = navHistory.pop();
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nb').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById('tab-'+prev).classList.add('active');
    document.querySelectorAll('.nb').forEach(function(b){
      if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'"+prev+"'") > -1) b.classList.add('active');
    });
  } else {
    // Retour au dashboard par défaut
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nb').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById('tab-dashboard').classList.add('active');
    document.querySelectorAll('.nb').forEach(function(b){
      if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'dashboard'") > -1) b.classList.add('active');
    });
  }
}

// ================================================================
// SUPPRESSION GLOBALE — VIDER TOUS LES MODULES
// ================================================================
function viderTout() {
  if (!confirm('⚠️ SUPPRESSION TOTALE\n\nVous allez supprimer TOUS les éléments de TOUS les modules.\nCette action est irréversible.\n\nContinuer ?')) return;
  if (!confirm('Dernière confirmation : supprimer TOUT ?')) return;
  D.activites = []; D.stock = []; D.perso = []; D.depenses = [];
  D.dettes = []; D.paiements = []; D.commandes = []; D.histo = []; D.corbeille = [];
  D.dettesClot = 0; D.detteVerrou = false; D._o = 1; D._co = 1;
  save(); notif('✅ Tous les éléments supprimés.');
}

function viderActivites() {
  if (!confirm('Supprimer toutes les activités ?')) return;
  D.activites.forEach(function(a){ rb('activite', a.desig, a); });
  D.activites = []; save(); notif('✅ Activités vidées → corbeille');
}

function viderStock() {
  if (!confirm('Supprimer tout le stock entreprise ?')) return;
  D.stock.forEach(function(s){ rb('stock', s.nom, s); });
  D.stock = []; save(); notif('✅ Stock entreprise vidé → corbeille');
}

function viderDettes() {
  if (D.detteVerrou) { notif('🔒 Dettes verrouillées'); return; }
  if (!confirm('Supprimer toutes les dettes actives ?')) return;
  D.dettes.forEach(function(d){ rb('dette', d.desc, d); });
  D.dettes = []; save(); notif('✅ Dettes vidées → corbeille');
}

function viderPaiements() {
  if (!confirm('Supprimer tous les paiements reçus ?')) return;
  D.paiements.forEach(function(p){ rb('paiement', 'Paiement '+fmt(p.montant), p); });
  D.paiements = []; save(); notif('✅ Paiements vidés → corbeille');
}

function viderCommandes() {
  if (!confirm('Supprimer toutes les commandes ?')) return;
  D.commandes.forEach(function(c){ rb('commande', c.num+': '+c.client, c); });
  D.commandes = []; save(); notif('✅ Commandes vidées → corbeille');
}

function viderDep() {
  if (!confirm('Supprimer toutes les dépenses ?')) return;
  D.depenses.forEach(function(d){ rb('depense', d.desc, d); });
  D.depenses = []; save(); notif('✅ Dépenses vidées → corbeille');
}

// ================================================================
// SYSTÈME DE CONNEXION
// ================================================================

// Identifiants par défaut (modifiables par l'utilisateur)
// Stockés dans localStorage sous clé sécurisée
var AUTH_KEY = 'bpro_auth_v1';
var RESET_CODE = 'BWL-2026-RESET'; // Code unique de réinitialisation

var DEFAULT_LOGIN = 'admin';
var DEFAULT_PASS  = 'boulliwel2026';

function getAuth() {
  try {
    var s = localStorage.getItem(AUTH_KEY);
    if (s) return JSON.parse(s);
  } catch(e) {}
  return { login: DEFAULT_LOGIN, pass: DEFAULT_PASS };
}

function saveAuth(login, pass) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ login: login, pass: pass }));
}

function isLoggedIn() {
  return sessionStorage.getItem('bpro_session') === '1';
}

function doLogin() {
  var login = document.getElementById('inp-login').value.trim();
  var pass  = document.getElementById('inp-pass').value;
  var err   = document.getElementById('login-err');
  var auth  = getAuth();
  if (!login || !pass) { err.textContent = '⚠️ Veuillez remplir tous les champs.'; return; }
  if (login === auth.login && pass === auth.pass) {
    sessionStorage.setItem('bpro_session', '1');
    document.getElementById('login-screen').classList.add('hidden');
    err.textContent = '';
    notif('✅ Bienvenue ' + login + ' !');
  } else {
    err.textContent = '❌ Login ou mot de passe incorrect.';
    document.getElementById('inp-pass').value = '';
    document.getElementById('inp-pass').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem('bpro_session');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('inp-login').value = '';
  document.getElementById('inp-pass').value = '';
  document.getElementById('login-err').textContent = '';
  showLogin();
  notif('Déconnecté.');
}

function showReset() {
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('tab-reset').classList.add('active');
  document.getElementById('inp-reset-code').value = '';
  document.getElementById('inp-new-pass').value = '';
  document.getElementById('inp-confirm-pass').value = '';
  document.getElementById('reset-err').textContent = '';
}

function showLogin() {
  document.getElementById('tab-reset').classList.remove('active');
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('login-err').textContent = '';
}

function doReset() {
  var code    = document.getElementById('inp-reset-code').value.trim();
  var newPass = document.getElementById('inp-new-pass').value;
  var confirm = document.getElementById('inp-confirm-pass').value;
  var err     = document.getElementById('reset-err');
  if (!code || !newPass || !confirm) { err.textContent = '⚠️ Tous les champs sont obligatoires.'; return; }
  if (code !== RESET_CODE) { err.textContent = '❌ Code de réinitialisation incorrect.'; return; }
  if (newPass.length < 4) { err.textContent = '⚠️ Mot de passe trop court (minimum 4 caractères).'; return; }
  if (newPass !== confirm) { err.textContent = '❌ Les mots de passe ne correspondent pas.'; return; }
  var auth = getAuth();
  saveAuth(auth.login, newPass);
  err.textContent = '';
  showLogin();
  notif('✅ Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.');
}

function showChangerPass() {
  document.getElementById('cp-actuel').value = '';
  document.getElementById('cp-nouveau').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-err').textContent = '';
  om('m-changer-pass');
}

function doChangerPass() {
  var actuel  = document.getElementById('cp-actuel').value;
  var nouveau = document.getElementById('cp-nouveau').value;
  var confirm = document.getElementById('cp-confirm').value;
  var err     = document.getElementById('cp-err');
  var auth    = getAuth();
  if (!actuel || !nouveau || !confirm) { err.textContent = '⚠️ Tous les champs sont obligatoires.'; return; }
  if (actuel !== auth.pass) { err.textContent = '❌ Mot de passe actuel incorrect.'; return; }
  if (nouveau.length < 4) { err.textContent = '⚠️ Nouveau mot de passe trop court (min. 4 caractères).'; return; }
  if (nouveau !== confirm) { err.textContent = '❌ Les mots de passe ne correspondent pas.'; return; }
  saveAuth(auth.login, nouveau);
  cm('m-changer-pass');
  notif('✅ Mot de passe modifié avec succès !');
}

// INIT
document.addEventListener('DOMContentLoaded',function(){
  var fh=loadFromHash(); if(!fh) load();
  cmdLignes=[]; rCL(); renderAll();
  // Vérifier session
  if(isLoggedIn()){
    document.getElementById('login-screen').classList.add('hidden');
  } else {
    document.getElementById('inp-login').focus();
  }
});

// ================================================================
// SUPABASE (PRÊT POUR CONNEXION FUTURE)
// ================================================================
/**
 * Ce bloc sert de point d'entrée unique pour une future synchronisation
 * cloud via Supabase. Il n'est pas actif tant que SUPABASE_CONFIG.enabled
 * reste à false : l'application continue de fonctionner entièrement en
 * local (localStorage) via load()/persist().
 *
 * Pour activer la synchronisation plus tard :
 *   1. Ajouter le SDK Supabase (fichier local, sans CDN externe) et
 *      renseigner url / anonKey ci-dessous.
 *   2. Passer SUPABASE_CONFIG.enabled à true.
 *   3. Adapter syncToCloud()/syncFromCloud() pour lire/écrire l'objet D
 *      dans une table Supabase, puis les appeler depuis persist()/load().
 */
var SUPABASE_CONFIG = {
  enabled: false,   // passer à true une fois le SDK et les identifiants configurés
  url: '',          // ex: 'https://xxxx.supabase.co'
  anonKey: ''        // clé publique anonyme Supabase
};

/**
 * Pousse l'état applicatif courant (D) vers Supabase.
 * À implémenter lors de l'intégration réelle.
 */
function syncToCloud() {
  if (!SUPABASE_CONFIG.enabled) return;
  // TODO: implémenter l'appel Supabase (upsert) avec l'objet D
}

/**
 * Récupère l'état applicatif depuis Supabase et l'applique à D.
 * À implémenter lors de l'intégration réelle.
 */
function syncFromCloud() {
  if (!SUPABASE_CONFIG.enabled) return;
  // TODO: implémenter l'appel Supabase (select) et fusionner dans D
}
