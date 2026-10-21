// Mes investissements : chaque bien avec son achat, ses crédits, sa location, ses charges, sa rentabilité,
// ses plans et documents. Invité : tout reste sur cet appareil (localStorage, fichiers dans IndexedDB).
// Connecté : dans le compte (Supabase : liste des biens dans immo_profils, fichiers dans le stockage « immo-docs »).
(() => {
const T = window.CF_APP.taux;   // taux du marché, historique, surprime SCI (onglet Financer)
const racine = document.getElementById('inv');
const eur = n => (n < 0 ? '−' : '') + fmt(Math.abs(n)) + ' €';
const kEur = n => (n < 0 ? '−' : '') + fmtK(Math.abs(n));
const pct = n => (n < 0 ? '−' : '') + Math.abs(n * 100).toFixed(1).replace('.', ',') + ' %';
const somme = (l, f) => l.reduce((t, x) => t + (f(x) || 0), 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Mois (« AAAA-MM ») ----------
const MOIS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const moisCourant = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const ecartMois = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + mb - ma; };
const decalerMois = (ym, k) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const libMois = ym => { const [y, m] = ym.split('-').map(Number); return MOIS_FR[m - 1] + ' ' + y; };
// Safari sur Mac affiche parfois un champ texte à la place du sélecteur de mois : on accepte aussi « 03/2024 »
function normMois(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0');
  m = v.match(/^(\d{1,2})[\/.-](\d{4})$/);
  return m ? m[2] + '-' + m[1].padStart(2, '0') : '';
}

// ---------- Crédit : où on en est aujourd'hui ----------
const pmt = (P, r, n) => r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
const solde = (P, r, M, k) => r ? P * Math.pow(1 + r, k) - M * (Math.pow(1 + r, k) - 1) / r : P - M * k;
// Deux façons de décrire un prêt : un relevé (restant dû et mois restants à une date, le plus fiable : il tient
// compte des différés et remboursements anticipés), ou l'offre (montant, durée, 1re échéance).
function etatPret(p, auj = moisCourant()) {
  const r = (p.taux || 0) / 1200;
  let crd, mois, M;
  if (p.crd > 0 && p.mois > 0 && p.crdLe) {
    M = p.mensualite || pmt(p.crd, r, p.mois);
    const k = Math.min(p.mois, Math.max(0, ecartMois(p.crdLe, auj)));
    crd = solde(p.crd, r, M, k); mois = p.mois - k;
  } else if (p.montant > 0 && p.duree > 0 && p.debut) {
    M = p.mensualite || pmt(p.montant, r, p.duree);
    const k = Math.min(p.duree, Math.max(0, ecartMois(p.debut, auj) + 1));   // échéances déjà payées
    crd = solde(p.montant, r, M, k); mois = p.duree - k;
  } else return null;
  crd = Math.max(0, crd);
  // 12 prochains mois : intérêts et capital remboursé
  let c = crd, interets = 0, capital = 0;
  for (let i = 0; i < Math.min(12, mois); i++) { const it = c * r; interets += it; capital += M - it; c -= M - it; }
  return {crd, mois, M, assur: p.assurance || 0, fin: decalerMois(auj, mois), interets, capital};
}
// Renégociation ou rachat aux taux d'aujourd'hui (même calcul que l'ancien onglet « Mes crédits »)
function analyseReneg(p, e, sci) {
  if (!e || !(e.mois > 0 && e.crd > 1000 && p.taux > 0)) return null;
  const n = e.mois, tNew = T.tauxDuree(T.TAUX_ACTUEL, n) + (sci ? T.SURPRIME_SCI : 0);
  const mensu2 = pmt(e.crd, tNew / 1200, n), gainMois = e.M - mensu2, gainTotal = gainMois * n;
  const ira = Math.min(0.03 * e.crd, 6 * e.crd * p.taux / 1200), fraisRachat = ira + 1000 + 0.015 * e.crd;
  let surprime = null;
  const offre = p.offre || p.debut;
  if (offre && p.duree) {
    const ms = [offre, decalerMois(offre, 1)].filter(m => T.HISTO[m]).map(m => p.taux - T.tauxDuree(T.HISTO[m], p.duree));
    if (ms.length) surprime = [Math.min(...ms), Math.max(...ms)];
  }
  return {tNew, mensu2, gainMois, gainTotal, ira, fraisRachat, netRachat: gainTotal - fraisRachat, netAvenant: gainTotal - 600, surprime, offre};
}

// ---------- Rentabilité d'un bien (avant impôts) ----------
const LOUE = ['vide', 'meuble', 'saisonnier'];
function calculs(b) {
  const prets = b.prets.map(p => ({p, e: etatPret(p)}));
  const actifs = prets.filter(x => x.e && x.e.mois > 0);
  const loue = LOUE.includes(b.location.statut);
  const loyerMois = loue ? b.location.loyer || 0 : 0;
  const loyersAn = loyerMois * 12 * (1 - Math.min(12, b.location.vacance || 0) / 12);
  const c = b.chargesAn;
  const chargesAn = (c.tf || 0) + (c.copro || 0) + (c.pno || 0) + (c.compta || 0) + (c.cfe || 0) + (c.autres || 0) + loyersAn * ((c.gestion || 0) + (c.entretien || 0)) / 100;
  const creditAn = somme(actifs, x => (x.e.M + x.e.assur) * Math.min(12, x.e.mois));
  const a = b.achat, cout = (a.prix || 0) + (a.notaire || 0) + (a.travaux || 0) + (a.mobilier || 0) + (a.frais || 0);
  const crd = somme(prets, x => x.e && x.e.crd), cfAn = loyersAn - chargesAn - creditAn;
  return {prets, loue, loyerMois, loyersAn, chargesAn, creditAn, cout, crd, cfAn, cfMois: cfAn / 12,
    mensuCredit: somme(actifs, x => x.e.M + x.e.assur), interetsAn: somme(actifs, x => x.e.interets + x.e.assur * Math.min(12, x.e.mois)),
    capitalAn: somme(actifs, x => x.e.capital), emprunte: somme(b.prets, p => p.montant),
    brut: cout > 0 && loyerMois ? loyerMois * 12 / cout : null, net: cout > 0 && loue ? (loyersAn - chargesAn) / cout : null,
    patrimoine: b.valeur > 0 ? b.valeur - crd : null, plusValue: b.valeur > 0 && cout > 0 ? b.valeur - cout : null};
}

// ---------- Données : invité (cet appareil) ou compte ----------
let biens = [], etatCompte = '', compteCharge = false, minuteur = null, enAttente = false;
const CLE = 'mes-investissements';
function nouveauBien(o = {}) {
  return {id: uid(), nom: 'Nouveau bien', type: 'appart', adresse: '', surface: null, pieces: null, etage: null, dpe: '', annee: null,
    structure: 'np', sci: '', valeur: null, valeurLe: '',
    achat: {date: '', prix: null, notaire: null, travaux: null, mobilier: null, frais: null},
    location: {statut: 'vide', loyer: null, charges: null, locataire: '', debutBail: '', vacance: 0},
    chargesAn: {tf: null, copro: null, pno: null, gestion: null, entretien: null, compta: null, cfe: null, autres: null},
    prets: [], docs: [], notes: '', ...o};
}
// Ancien onglet « Mes crédits » : un crédit devient un bien avec son prêt (relevé à la date du passage)
function depuisCredit(c) {
  return nouveauBien({nom: String(c.nom || 'Mon bien').replace(/^prêt\s+/i, '') || 'Mon bien', adresse: c.bien || '', valeur: c.valeur || null,
    valeurLe: c.valeur ? moisCourant() : '', structure: c.sci ? 'ir' : 'np',
    prets: [{id: uid(), banque: '', montant: null, taux: c.taux, duree: c.duree || null, debut: '', offre: c.offre || '', assurance: null,
      mensualite: c.mensualite || null, crd: c.crd, mois: c.mois, crdLe: moisCourant()}]});
}
const depuisCompte = d => Array.isArray(d) ? d.map(depuisCredit) : d && Array.isArray(d.biens) ? d.biens : null;
function biensLocaux() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
  let c = null;
  try { c = JSON.parse(localStorage.getItem('mes-credits') || 'null'); } catch (e) {}
  if (!Array.isArray(c)) c = window.MES_CREDITS || [];
  return c.map(depuisCredit);
}
function sauver() {
  if (!COMPTE.user) { try { localStorage.setItem(CLE, JSON.stringify(biens)); } catch (e) { alert('Mémoire de l\'appareil pleine : enregistrement impossible.'); } return; }
  if (!compteCharge) return;   // compte pas encore lu : ne pas l'écraser
  etatCompte = 'Enregistrement…'; majEtat(); enAttente = true;
  clearTimeout(minuteur);
  minuteur = setTimeout(envoyer, 700);
}
async function envoyer() {
  if (!enAttente || !COMPTE.user) return;
  enAttente = false;
  try { await COMPTE.ecrire({version: 2, biens}); etatCompte = 'Enregistré dans ton compte.'; }
  catch (e) { etatCompte = 'Échec de l\'enregistrement : ' + erreurCompte(e); }
  majEtat();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(minuteur); envoyer(); } });
const majEtat = () => { const e = document.getElementById('inv_etat'); if (e) e.textContent = etatCompte; };

// ---------- Fichiers : plans, photos, documents ----------
const BUCKET = 'immo-docs', MAX = 10 * 1024 * 1024;
const idb = () => new Promise((ok, ko) => {
  const r = indexedDB.open('estimateur-immo', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('docs');
  r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
});
async function idbFaire(mode, f) {
  const db = await idb();
  return new Promise((ok, ko) => { const t = db.transaction('docs', mode), q = f(t.objectStore('docs')); t.oncomplete = () => ok(q && q.result); t.onerror = () => ko(t.error); });
}
// Photos : réduites à 2000 px (une photo de téléphone passe de 4-8 Mo à quelques centaines de Ko)
async function reduire(f) {
  if (!f.type.startsWith('image/') || f.size < 1.5e6) return f;
  try {
    const img = await createImageBitmap(f), k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const cv = Object.assign(document.createElement('canvas'), {width: Math.round(img.width * k), height: Math.round(img.height * k)});
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', {type: 'image/jpeg'}) : f;
  } catch (e) { return f; }
}
const nomFichier = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
const urls = new Map();   // id → adresse d'affichage (objet local ou lien signé valable 1 h)
async function envoyerDoc(bien, doc, blob) {
  const cle = `${COMPTE.user.id}/${bien.id}/${doc.id}-${nomFichier(doc.nom)}`;
  const {error} = await COMPTE.client.storage.from(BUCKET).upload(cle, blob, {contentType: doc.mime, upsert: false});
  if (error) throw error;
  doc.cle = cle; delete doc.local;
}
async function ajouterDoc(bien, f) {
  if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} : fichier trop lourd (25 Mo maximum).`);
  const fichier = await reduire(f);
  if (fichier.size > MAX) throw new Error(`${f.name} : fichier trop lourd (10 Mo maximum).`);
  const doc = {id: uid(), nom: fichier.name, mime: fichier.type || 'application/octet-stream', taille: fichier.size, ajoute: new Date().toISOString().slice(0, 10)};
  if (COMPTE.user && COMPTE.client) await envoyerDoc(bien, doc, fichier);
  else { await idbFaire('readwrite', s => s.put(fichier, doc.id)); doc.local = true; }
  return doc;
}
async function urlDoc(doc) {
  if (urls.has(doc.id)) return urls.get(doc.id);
  let u = null;
  if (doc.local) { const b = await idbFaire('readonly', s => s.get(doc.id)); if (b) u = URL.createObjectURL(b); }
  else if (COMPTE.client && COMPTE.user) {
    const {data, error} = await COMPTE.client.storage.from(BUCKET).createSignedUrl(doc.cle, 3600);
    if (!error) { u = data.signedUrl; setTimeout(() => urls.delete(doc.id), 50 * 60 * 1000); }
  }
  if (u) urls.set(doc.id, u);
  return u;
}
async function supprimerDoc(doc) {
  try {
    if (doc.local) await idbFaire('readwrite', s => s.delete(doc.id));
    else if (COMPTE.client && COMPTE.user) await COMPTE.client.storage.from(BUCKET).remove([doc.cle]);
  } catch (e) { console.warn('Suppression du fichier :', e); }
  urls.delete(doc.id);
}
const erreurDocs = e => /bucket not found|not found/i.test((e && e.message) || '') ? 'Le stockage des documents n\'est pas encore activé (script supabase-docs.sql à lancer).' : (e && e.message) || String(e);

// ---------- Passage invité ↔ compte ----------
COMPTE.surChangement(async user => {
  compteCharge = false; urls.clear();
  if (!user) { etatCompte = ''; biens = biensLocaux(); return afficher(); }
  etatCompte = 'Chargement de ton compte…'; afficher();
  try {
    let distants = depuisCompte(await COMPTE.lire());
    if (!distants) {   // premier passage : proposer de reprendre ce qui est sur cet appareil (fichiers compris)
      const locaux = biensLocaux();
      distants = locaux.length && confirm(`Mettre dans ton compte ${locaux.length > 1 ? `les ${locaux.length} biens enregistrés` : 'le bien enregistré'} sur cet appareil ?`) ? locaux : [];
      for (const b of distants) for (const d of b.docs.filter(d => d.local)) {
        try { const blob = await idbFaire('readonly', s => s.get(d.id)); if (blob) await envoyerDoc(b, d, blob); } catch (e) { console.warn(erreurDocs(e)); }
      }
      await COMPTE.ecrire({version: 2, biens: distants});
    }
    biens = distants; compteCharge = true; etatCompte = 'Enregistré dans ton compte.';
  } catch (e) { etatCompte = 'Impossible de lire ton compte : ' + erreurCompte(e); }
  afficher();
});

// ---------- Affichage ----------
const TYPES = {
  appart: {l: 'Appartement', i: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 7h1M11 7h1M8 10h1M11 10h1M8 13h1M11 13h1M8 16h4v5"/>'},
  maison: {l: 'Maison', i: '<path d="M3 11l9-7 9 7M5 9.5V21h14V9.5M10 21v-6h4v6"/>'},
  immeuble: {l: 'Immeuble', i: '<path d="M4 21V3h16v18M2 21h20M8 6h2M14 6h2M8 10h2M14 10h2M8 14h2M14 14h2M10 21v-3h4v3"/>'},
  local: {l: 'Local commercial', i: '<path d="M3 9l2-5h14l2 5M3 9h18M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M5 12v9h14v-9M10 21v-5h4v5"/>'},
  parking: {l: 'Parking / box', i: '<path d="M5 3h14v18H5zM10 17V7h3a3 3 0 010 6h-3"/>'},
  terrain: {l: 'Terrain', i: '<path d="M3 20l6-9 4 5 3-4 5 8zM15 6a2 2 0 104 0 2 2 0 10-4 0"/>'},
};
const icone = t => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${(TYPES[t] || TYPES.appart).i}</svg>`;
const STATUTS = {vide: 'Loué vide', meuble: 'Loué meublé', saisonnier: 'Location saisonnière', vacant: 'Vacant', rp: 'Résidence principale', secondaire: 'Résidence secondaire', travaux: 'En travaux'};
const STRUCT = {np: 'Nom propre', ir: 'SCI à l\'IR', is: 'SCI à l\'IS'};
const kpi = (k, v, d, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const signe = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const etatHTML = () => COMPTE.user
  ? `<div class="compteEtat connecte">Connecté · <span id="inv_etat">${esc(etatCompte)}</span></div>`
  : '<div class="compteEtat">Mode invité : tes biens restent sur cet appareil. <button class="lien" data-a="connexion">Se connecter</button> pour les retrouver partout.</div>';
let ouvert = null;   // bien affiché en détail

function afficher(id = ouvert) {
  ouvert = id && biens.some(b => b.id === id) ? id : null;
  if (ouvert) vueDetail(biens.find(b => b.id === ouvert)); else vueListe();
}

function vueListe() {
  const est = typeof estimationCourante === 'function' ? estimationCourante() : null;
  const cs = biens.map(calculs);
  let h = `<div class="invhead"><h1>Mes investissements</h1><div class="actions">
      ${est ? `<button data-a="ajoutEst" title="${esc(est.label)}">+ Ajouter le bien estimé</button>` : ''}
      <button class="primaire" data-a="ajout">+ Ajouter un bien</button></div></div>${etatHTML()}`;
  if (biens.length) {
    // Patrimoine net : seulement sur les biens dont la valeur est renseignée (sinon leur crédit fausserait le total)
    const estimes = biens.map((b, i) => [b, cs[i]]).filter(([b]) => b.valeur > 0), manque = biens.length - estimes.length;
    const V = somme(estimes, ([b]) => b.valeur), Dv = somme(estimes, ([, c]) => c.crd), D = somme(cs, c => c.crd);
    const sur = manque ? `sur ${estimes.length} bien${estimes.length > 1 ? 's' : ''} estimé${estimes.length > 1 ? 's' : ''}` : '';
    h += `<div class="kpis six">${kpi('Biens', biens.length, manque ? `${manque} sans valeur` : '')}${kpi('Valeur', V ? kEur(V) : '—', V ? sur || 'estimée' : 'à renseigner')}${kpi('Restant dû', kEur(D), V && !manque ? Math.round(D / V * 100) + ' % de la valeur' : 'tous crédits')}
      ${kpi('Patrimoine net', V ? kEur(V - Dv) : '—', V ? sur || 'valeur − restant dû' : 'renseigne la valeur des biens', V ? signe(V - Dv) : '')}${kpi('Loyers', eur(somme(cs, c => c.loyerMois)), 'par mois')}
      ${kpi('Cash-flow', eur(somme(cs, c => c.cfMois)), 'par mois, avant impôts', signe(somme(cs, c => c.cfMois)))}</div>
      <div class="liste">${biens.map((b, i) => carte(b, cs[i])).join('')}</div>`;
  } else {
    h += `<div class="vide"><div class="ico">${icone('maison')}</div><h2>Ajoute ton premier investissement</h2>
      <p>Pour chaque bien : l'achat, le crédit, la location, les charges, et les plans. La rentabilité et ce qu'il reste à rembourser se calculent tout seuls.</p>
      <button class="primaire" data-a="ajout">+ Ajouter un bien</button></div>`;
  }
  racine.innerHTML = h;
  vignettes();
}
function carte(b, c) {
  const tags = [b.pieces ? (b.type === 'maison' ? b.pieces + ' pièces' : 'T' + b.pieces) : '', b.surface ? fmt(b.surface) + ' m²' : '',
    b.structure !== 'np' ? (b.sci || STRUCT[b.structure]) : '', STATUTS[b.location.statut]].filter(Boolean);
  return `<a class="bien" href="#investissements/${encodeURIComponent(b.id)}">
    <div class="vignette" data-doc="${esc((b.docs.find(d => d.mime.startsWith('image/')) || {}).id || '')}">${icone(b.type)}<span>${TYPES[b.type] ? TYPES[b.type].l : ''}</span></div>
    <div class="infos"><b>${esc(b.nom)}</b><span class="adr">${esc(b.adresse || 'Adresse à renseigner')}</span><span class="tags">${tags.map(esc).join(' · ')}</span></div>
    <div class="chiffres">
      <div><span>Valeur</span><b>${b.valeur ? kEur(b.valeur) : '—'}</b></div>
      <div><span>Restant dû</span><b>${c.crd ? kEur(c.crd) : '—'}</b></div>
      <div><span>Cash-flow</span><b class="${signe(c.cfMois)}">${c.loue || c.mensuCredit ? eur(c.cfMois) + '/mois' : '—'}</b></div>
      <div><span>Rendement brut</span><b>${c.brut != null ? pct(c.brut) : '—'}</b></div>
    </div><span class="chev" aria-hidden="true">›</span></a>`;
}
// Photo ou plan en vignette (chargés après coup)
function vignettes() {
  racine.querySelectorAll('.vignette[data-doc]').forEach(async v => {
    const id = v.dataset.doc; if (!id) return;
    const b = biens.find(x => x.docs.some(d => d.id === id)), d = b && b.docs.find(x => x.id === id);
    const u = d && await urlDoc(d).catch(() => null);
    if (u) { v.style.backgroundImage = `url("${u}")`; v.classList.add('photo'); }
  });
}

// --- Détail d'un bien ---
// Champ de formulaire relié à une propriété du bien (data-p = chemin, ex. « achat.prix », « prets.0.taux »)
function lire(b, chemin) { return chemin.split('.').reduce((o, k) => o == null ? o : o[k], b); }
function ecrire(b, chemin, v) { const ks = chemin.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], b)[last] = v; }
function champ(b, chemin, label, o = {}) {
  const v = lire(b, chemin), id = 'inv_' + chemin.replace(/\./g, '_');
  let input;
  if (o.options) input = `<select id="${id}" data-p="${chemin}">${Object.entries(o.options).map(([k, l]) => `<option value="${esc(k)}"${String(v ?? '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (o.zone) input = `<textarea id="${id}" data-p="${chemin}" rows="4" placeholder="${esc(o.ph || '')}">${esc(v || '')}</textarea>`;
  else input = `<input id="${id}" data-p="${chemin}" type="${o.type || 'number'}"${o.step ? ` step="${o.step}"` : ''}${o.type === 'month' ? ' placeholder="AAAA-MM"' : ''} value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}">`;
  return `<div class="${o.large ? 'large' : ''}"><label for="${id}">${label}</label>${input}${o.aide ? `<div class="aide">${o.aide}</div>` : ''}</div>`;
}
const section = (titre, corps, large = false) => `<section class="bloc${large ? ' large' : ''}"><h3>${titre}</h3>${corps}</section>`;

function vueDetail(b) {
  const est = typeof estimationCourante === 'function' ? estimationCourante() : null;
  const opt = (o) => o;
  let h = `<a class="retour" href="#investissements">← Mes investissements</a>${etatHTML()}
    <div class="dethead"><div class="vignette grand" data-doc="${esc((b.docs.find(d => d.mime.startsWith('image/')) || {}).id || '')}">${icone(b.type)}<span>${TYPES[b.type].l}</span></div>
      <div><h1 id="inv_titre">${esc(b.nom)}</h1><div class="adr" id="inv_sous">${esc([b.adresse, STRUCT[b.structure] + (b.sci ? ' · ' + b.sci : '')].filter(Boolean).join(' · '))}</div></div></div>
    <div id="inv_kpis"></div>
    <div class="blocs">
    ${section('Rentabilité', '<div id="inv_renta"></div>')}
    ${section('Location', `<div class="grille">
      ${champ(b, 'location.statut', 'Situation', {options: STATUTS})}
      ${LOUE.includes(b.location.statut) ? `${champ(b, 'location.loyer', 'Loyer hors charges (€/mois)', {step: 10})}${champ(b, 'location.charges', 'Charges locataire (€/mois)', {step: 10})}
      ${champ(b, 'location.locataire', 'Locataire', {type: 'text'})}${champ(b, 'location.debutBail', 'Début du bail', {type: 'month'})}
      ${champ(b, 'location.vacance', 'Vacance (mois/an)', {step: 0.5, aide: 'Mois sans locataire en moyenne'})}` : ''}
    </div>`)}
    ${section('Le bien', `<div class="grille">
      ${champ(b, 'nom', 'Nom', {type: 'text', ph: 'ex. Studio Passy'})}
      ${champ(b, 'type', 'Type', {options: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.l]))})}
      ${champ(b, 'adresse', 'Adresse', {type: 'text', large: true, ph: 'ex. 12 rue Fesch, Ajaccio'})}
      ${champ(b, 'surface', 'Surface (m²)')}${champ(b, 'pieces', 'Pièces')}
      ${champ(b, 'etage', 'Étage')}${champ(b, 'dpe', 'DPE', {options: {'': '—', A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G'}})}
      ${champ(b, 'annee', 'Année de construction')}
      ${champ(b, 'structure', 'Détenu en', {options: STRUCT})}
      ${b.structure !== 'np' ? champ(b, 'sci', 'Nom de la SCI', {type: 'text'}) : ''}
    </div>
    <div class="valeur"><div class="grille">${champ(b, 'valeur', 'Valeur estimée (€)', {step: 1000})}${champ(b, 'valeurLe', 'Estimée en', {type: 'month'})}</div>
      <div class="boutons">${est ? `<button data-a="valeurEst">Prendre l'estimation en cours : ${kEur(est.prix)}</button>` : ''}<button data-a="estimer"${b.adresse ? '' : ' disabled title="Renseigne d\'abord l\'adresse"'}>Estimer ce bien →</button></div>
      ${est ? `<div class="aide">Estimation en cours : ${esc(est.label)}, ${fmt(est.surf)} m².</div>` : ''}</div>`)}
    ${section('Achat', `<div class="grille">
      ${champ(b, 'achat.date', 'Date d\'achat', {type: 'month'})}${champ(b, 'achat.prix', 'Prix d\'achat (€)', {step: 1000})}
      ${champ(b, 'achat.notaire', 'Frais de notaire (€)', {step: 100})}${champ(b, 'achat.travaux', 'Travaux (€)', {step: 500})}
      ${champ(b, 'achat.mobilier', 'Mobilier (€)', {step: 100})}${champ(b, 'achat.frais', 'Autres frais (€)', {step: 100, aide: 'Agence, dossier, garantie…'})}
    </div><div class="total" id="inv_cout"></div>`)}
    ${section('Crédit' + (b.prets.length > 1 ? 's' : ''), `<div class="prets">${b.prets.map((p, i) => pretHTML(b, p, i)).join('')}</div><button data-a="ajoutPret">+ Ajouter un prêt</button>`, true)}
    ${section('Charges du propriétaire (par an)', `<div class="grille">
      ${champ(b, 'chargesAn.tf', 'Taxe foncière (€)', {step: 50})}${champ(b, 'chargesAn.copro', 'Copropriété non récupérable (€)', {step: 50})}
      ${champ(b, 'chargesAn.pno', 'Assurance PNO (€)', {step: 10})}${champ(b, 'chargesAn.gestion', 'Gestion (% des loyers)', {step: 0.5})}
      ${champ(b, 'chargesAn.entretien', 'Entretien (% des loyers)', {step: 0.5})}${champ(b, 'chargesAn.compta', 'Comptable (€)', {step: 50})}
      ${champ(b, 'chargesAn.cfe', 'CFE (€)', {step: 50})}${champ(b, 'chargesAn.autres', 'Autres (€)', {step: 50})}
    </div>`)}
    ${section('Notes', champ(b, 'notes', '', {zone: true, ph: 'Travaux à prévoir, contacts, échéances…'}))}
    ${section('Plans et documents', `<div class="docs" id="inv_docs"></div>
      <input type="file" id="inv_fichier" accept="image/*,application/pdf" multiple hidden>
      <button data-a="fichier">+ Ajouter un plan, une photo ou un document</button> <span class="aide" id="inv_docEtat"></span>
      <div class="aide">${COMPTE.user ? 'Enregistrés dans ton compte (privés).' : 'Mode invité : fichiers gardés sur cet appareil seulement.'} Images et PDF, 10 Mo maximum (photos réduites automatiquement).</div>`, true)}
    </div>
    <div class="pied"><button class="danger" data-a="supprimer">Supprimer ce bien</button></div>`;
  racine.innerHTML = h;
  majCalculs(b); docsHTML(b); vignettes();
}
function pretHTML(b, p, i) {
  const c = `prets.${i}.`;
  return `<div class="pret"><div class="pret-tete"><b>${esc(p.banque || 'Prêt ' + (i + 1))}</b><button class="lien" data-a="supprPret" data-i="${i}">Retirer</button></div>
    <div class="grille">
      ${champ(b, c + 'banque', 'Banque', {type: 'text'})}${champ(b, c + 'montant', 'Montant emprunté (€)', {step: 1000})}
      ${champ(b, c + 'taux', 'Taux nominal (%)', {step: 0.01})}${champ(b, c + 'duree', 'Durée totale (mois)', {aide: '240 = 20 ans'})}
      ${champ(b, c + 'debut', '1re échéance', {type: 'month'})}${champ(b, c + 'offre', 'Date de l\'offre', {type: 'month', aide: 'Pour comparer au taux du marché de l\'époque'})}
      ${champ(b, c + 'mensualite', 'Mensualité hors assurance (€)', {step: 0.01, ph: 'calculée'})}${champ(b, c + 'assurance', 'Assurance (€/mois)', {step: 0.01})}
    </div>
    <details class="releve"${p.crd ? ' open' : ''}><summary>Restant dû relevé sur le tableau d'amortissement (plus précis)</summary>
      <div class="grille">${champ(b, c + 'crd', 'Restant dû (€)', {step: 0.01})}${champ(b, c + 'mois', 'Mois restants')}${champ(b, c + 'crdLe', 'À la date du', {type: 'month'})}</div>
      <div class="aide">Tient compte d'un différé ou d'un remboursement anticipé ; le site fait avancer ce restant dû chaque mois.</div></details>
    <div class="resume" data-resume="${i}"></div></div>`;
}
// Chiffres recalculés sans reconstruire le formulaire (pour ne pas perdre le champ en cours de saisie)
function majCalculs(b) {
  const c = calculs(b), q = s => racine.querySelector(s);
  q('#inv_kpis').innerHTML = `<div class="kpis six">
    ${kpi('Valeur', b.valeur ? kEur(b.valeur) : '—', !b.valeur ? 'à renseigner' : b.valeurLe ? 'estimée en ' + libMois(b.valeurLe) : 'estimée')}
    ${kpi('Restant dû', c.crd ? kEur(c.crd) : '—', c.mensuCredit ? eur(c.mensuCredit) + '/mois assurance comprise' : '')}
    ${kpi('Patrimoine net', c.patrimoine != null ? kEur(c.patrimoine) : '—', 'valeur − restant dû', c.patrimoine != null ? signe(c.patrimoine) : '')}
    ${kpi('Cash-flow', c.loue || c.mensuCredit ? eur(c.cfMois) : '—', 'par mois, avant impôts', signe(c.cfMois))}
    ${kpi('Rendement brut', c.brut != null ? pct(c.brut) : '—', c.cout ? 'loyer annuel ÷ coût total' : 'renseigne l\'achat')}
    ${kpi('Plus-value latente', c.plusValue != null ? kEur(c.plusValue) : '—', 'valeur − coût total', c.plusValue != null ? signe(c.plusValue) : '')}</div>`;
  const ligne = (l, v, cls = '') => `<div><span>${l}</span><b class="${cls}">${v}</b></div>`;
  q('#inv_renta').innerHTML = `<div class="calc">
      ${ligne('Loyers encaissés', eur(c.loyersAn) + '/an', '')}
      ${ligne('Charges du propriétaire', '−' + eur(c.chargesAn) + '/an')}
      ${ligne('Crédit (mensualités et assurance)', '−' + eur(c.creditAn) + '/an')}
      ${ligne('<b>Cash-flow</b>', eur(c.cfAn) + '/an · ' + eur(c.cfMois) + '/mois', signe(c.cfAn))}
      ${ligne('Capital remboursé sur 12 mois', '+' + eur(c.capitalAn))}
      ${ligne('<b>Enrichissement</b> (cash-flow + capital remboursé)', eur(c.cfAn + c.capitalAn) + '/an', signe(c.cfAn + c.capitalAn))}
      ${c.net != null ? ligne('Rendement net de charges', pct(c.net) + ' du coût total') : ''}
      ${c.cout && c.emprunte ? ligne('Apport', eur(Math.max(0, c.cout - c.emprunte)) + (c.cout - c.emprunte <= 0 ? ' (financé à 100 % ou plus)' : '')) : ''}
    </div>
    <div class="aide">Avant impôts. ${!c.loue ? 'Bien non loué : pas de loyer compté. ' : ''}${Object.values(b.chargesAn).every(v => v == null) ? 'Charges pas encore renseignées. ' : ''}${!b.prets.length ? 'Aucun crédit renseigné.' : ''}</div>`;
  q('#inv_cout').innerHTML = c.cout ? `Coût total : <b>${eur(c.cout)}</b>${b.surface && b.achat.prix ? ` · ${fmt(b.achat.prix / b.surface)} €/m² à l'achat` : ''}` : '';
  b.prets.forEach((p, i) => { const r = racine.querySelector(`[data-resume="${i}"]`); if (r) r.innerHTML = resumePret(b, p, c.prets[i].e); });
}
function resumePret(b, p, e) {
  if (!e) return '<div class="aide">Renseigne le montant, le taux, la durée et la 1re échéance (ou le restant dû relevé) pour voir où tu en es.</div>';
  if (e.mois <= 0) return '<div class="okbox">Prêt remboursé.</div>';
  const a = analyseReneg(p, e, b.structure !== 'np'), dejaPaye = p.montant > 0 ? 1 - e.crd / p.montant : null;
  let h = `<div class="okbox">Aujourd'hui : <b>${eur(e.crd)}</b> restant dû, ${e.mois} mois restants (fin en ${libMois(e.fin)}). Mensualité ${eur(e.M)}${e.assur ? ` + ${eur(e.assur)} d'assurance` : ''}.
    ${dejaPaye != null ? `<div class="barre"><span style="width:${Math.max(0, Math.min(100, dejaPaye * 100)).toFixed(1)}%"></span></div><div class="aide">${pct(dejaPaye)} du capital remboursé</div>` : ''}
    Sur les 12 prochains mois : ${eur(e.interets)} d'intérêts et ${eur(e.capital)} de capital remboursé.</div>`;
  if (a) h += `<div class="${a.netAvenant > 0 ? 'okbox' : 'warnbox'}">Au taux du marché (${T.TAUX_ACTUEL.mois}) : <b>${a.tNew.toFixed(2).replace('.', ',')} %</b>${b.structure !== 'np' ? ' (SCI)' : ''} contre ${String(p.taux).replace('.', ',')} % ; mensualité ${eur(a.mensu2)}, soit ${eur(a.gainMois)}/mois et ${eur(a.gainTotal)} d'intérêts ${a.gainTotal >= 0 ? 'en moins' : 'en plus'}.
    Renégociation avec ta banque (avenant ≈ 600 €) : gain net ≈ <b>${eur(a.netAvenant)}</b>. Rachat par une autre banque (indemnités ≈ ${eur(a.ira)}) : gain net ≈ <b>${eur(a.netRachat)}</b>.
    ${a.surprime ? `<br>Surprime payée à la signature (${libMois(a.offre)}) : <b>${a.surprime[0] >= 0 ? '+' : ''}${a.surprime[0].toFixed(2).replace('.', ',')}${a.surprime[1] !== a.surprime[0] ? ' à ' + (a.surprime[1] >= 0 ? '+' : '') + a.surprime[1].toFixed(2).replace('.', ',') : ''} point</b> par rapport au taux moyen du marché à durée égale.` : ''}</div>`;
  return h;
}
function docsHTML(b) {
  const el = racine.querySelector('#inv_docs');
  el.innerHTML = b.docs.length ? b.docs.map(d => `<div class="doc" data-id="${esc(d.id)}">
      <a target="_blank" rel="noopener" class="apercu${d.mime.startsWith('image/') ? ' image' : ''}">${d.mime === 'application/pdf' ? '<span class="pdf">PDF</span>' : d.mime.startsWith('image/') ? '' : '<span class="pdf">Fichier</span>'}</a>
      <div class="nom" title="${esc(d.nom)}">${esc(d.nom)}</div>
      <div class="meta">${d.taille < 1e6 ? Math.max(1, Math.round(d.taille / 1024)) + ' Ko' : (d.taille / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'}${d.local && COMPTE.user ? ' · sur cet appareil' : ''}</div>
      <button class="lien" data-a="supprDoc" data-id="${esc(d.id)}">Supprimer</button></div>`).join('') : '<div class="aide">Aucun plan ni document pour l\'instant.</div>';
  // Liens préparés à l'avance : Safari bloque l'ouverture d'un onglet après une attente réseau
  el.querySelectorAll('.doc').forEach(async div => {
    const d = b.docs.find(x => x.id === div.dataset.id), u = await urlDoc(d).catch(() => null), a = div.querySelector('a');
    if (!u) { a.classList.add('indispo'); a.title = d.local ? 'Fichier gardé sur un autre appareil' : 'Fichier indisponible'; return; }
    a.href = u;
    if (d.mime.startsWith('image/')) a.style.backgroundImage = `url("${u}")`;
  });
}

// ---------- Actions ----------
function ajouter(o) { const b = nouveauBien(o); biens.push(b); sauver(); location.hash = '#investissements/' + b.id; }
racine.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const b = biens.find(x => x.id === ouvert), a = t.dataset.a;
  if (a === 'connexion') return ouvrirCompte();
  if (a === 'ajout') return ajouter();
  if (a === 'ajoutEst') {
    const est = estimationCourante(); if (!est) return;
    return ajouter({nom: est.label.split(' ').slice(0, 4).join(' '), adresse: est.label, type: est.type, surface: est.surf, dpe: est.dpe && est.dpe !== '?' ? est.dpe : '',
      valeur: est.prix, valeurLe: moisCourant(), location: {statut: est.meuble ? 'meuble' : 'vide', loyer: est.loyer, charges: null, locataire: '', debutBail: '', vacance: 0}});
  }
  if (!b) return;
  if (a === 'valeurEst') { const est = estimationCourante(); if (est) { b.valeur = est.prix; b.valeurLe = moisCourant(); sauver(); vueDetail(b); } }
  if (a === 'estimer') {
    showTab('estimation');
    document.getElementById('addr').value = b.adresse;
    if (b.surface) document.getElementById('surf').value = b.surface;
    const tb = document.querySelector(`#type button[data-v="${b.type === 'maison' ? 111 : 121}"]`);
    if (tb && !tb.classList.contains('on')) tb.click();
    document.getElementById('go').click();
  }
  if (a === 'ajoutPret') { b.prets.push({id: uid(), banque: '', montant: null, taux: null, duree: 240, debut: '', offre: '', assurance: null, mensualite: null, crd: null, mois: null, crdLe: ''}); sauver(); vueDetail(b); }
  if (a === 'supprPret' && confirm('Retirer ce prêt ?')) { b.prets.splice(+t.dataset.i, 1); sauver(); vueDetail(b); }
  if (a === 'fichier') racine.querySelector('#inv_fichier').click();
  if (a === 'supprDoc') {
    const d = b.docs.find(x => x.id === t.dataset.id);
    if (d && confirm(`Supprimer « ${d.nom} » ?`)) { await supprimerDoc(d); b.docs = b.docs.filter(x => x !== d); sauver(); docsHTML(b); vignettes(); }
  }
  if (a === 'supprimer' && confirm(`Supprimer « ${b.nom} » et ses documents ? C'est définitif.`)) {
    for (const d of b.docs) await supprimerDoc(d);
    biens = biens.filter(x => x !== b); sauver(); location.hash = '#investissements';
  }
});
racine.addEventListener('change', async e => {
  const b = biens.find(x => x.id === ouvert); if (!b) return;
  if (e.target.id === 'inv_fichier') {
    const etat = racine.querySelector('#inv_docEtat'), fichiers = [...e.target.files];
    e.target.value = '';
    for (const [i, f] of fichiers.entries()) {
      etat.textContent = `Envoi ${i + 1}/${fichiers.length}…`;
      try { b.docs.push(await ajouterDoc(b, f)); sauver(); } catch (err) { alert(erreurDocs(err)); }
    }
    etat.textContent = ''; docsHTML(b); vignettes();
    return;
  }
  const chemin = e.target.dataset.p; if (!chemin) return;
  const t = e.target;
  let v = t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.type === 'text' ? t.value : t.type === 'month' ? normMois(t.value) : t.value === '' ? null : +t.value;
  if (t.type === 'month' && t.value && !v) { alert('Date au format AAAA-MM, par exemple 2024-03.'); t.value = lire(b, chemin) || ''; return; }
  ecrire(b, chemin, v);
  if (chemin === 'valeur' && v && !b.valeurLe) { b.valeurLe = moisCourant(); const m = racine.querySelector('[data-p="valeurLe"]'); if (m) m.value = b.valeurLe; }
  sauver();
  // Ce qui change la forme de la fiche : on la reconstruit ; sinon seulement les chiffres
  if (['type', 'structure', 'location.statut', 'adresse'].includes(chemin) || /^prets\.\d+\.banque$/.test(chemin)) return vueDetail(b);
  if (chemin === 'nom') racine.querySelector('#inv_titre').textContent = b.nom;
  if (chemin === 'sci') racine.querySelector('#inv_sous').textContent = [b.adresse, STRUCT[b.structure] + (b.sci ? ' · ' + b.sci : '')].filter(Boolean).join(' · ');
  majCalculs(b);
});

// Démarrage : biens de cet appareil, puis le compte s'il y a une session
biens = biensLocaux();
window.INV = {afficher: id => { afficher(id); window.scrollTo(0, 0); }};
COMPTE.init();
})();
