// Mes investissements : chaque bien avec son achat, ses crédits, sa location, ses charges, sa rentabilité,
// ses plans et documents. Invité : tout reste sur cet appareil (localStorage, fichiers dans IndexedDB).
// Connecté : dans le compte (Supabase : liste des biens dans immo_profils, fichiers dans le stockage « immo-docs »).
(() => {
if (typeof MOTEUR !== 'undefined' && MOTEUR) return;
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
let biens = [], scis = [], etatCompte = '', compteCharge = false, minuteur = null, enAttente = false;
const CLE = 'mes-investissements', CLE_SCI = 'mes-scis';
function nouveauBien(o = {}) {
  return {id: uid(), nom: 'Nouveau bien', type: 'appart', adresse: '', surface: null, pieces: null, annee: null,
    criteres: {}, geo: null, estimation: null, valeurManuelle: false,
    structure: 'np', sciId: null, valeur: null, valeurLe: '',
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
function nouvelleSci(o = {}) {
  return {id: uid(), nom: 'Nouvelle SCI', regime: 'ir', siren: '', creation: '', capital: null, siege: '', cloture: '31/12',
    associes: [], banque: '', comptable: '', notes: '', ...o};
}
const scisLocales = () => { try { const v = JSON.parse(localStorage.getItem(CLE_SCI) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
// Anciennes fiches (« SCI à l'IR / à l'IS » + nom libre) : rattachées à une vraie fiche SCI
function normaliser() {
  for (const b of biens) {
    if (b.structure === 'ir' || b.structure === 'is') {
      const nom = String(b.sci || '').trim() || 'Ma SCI';
      let x = scis.find(y => y.nom.toLowerCase() === nom.toLowerCase());
      if (!x) { x = nouvelleSci({nom, regime: b.structure}); scis.push(x); }
      b.structure = 'sci'; b.sciId = x.id;
    }
    if (b.structure === 'sci' && !scis.some(x => x.id === b.sciId)) { b.structure = 'np'; b.sciId = null; }
    delete b.sci;
    // Caractéristiques d'estimation (anciens champs DPE / étage repris)
    if (!b.criteres) {
      b.criteres = {};
      if (b.dpe) b.criteres.dpe = b.dpe;
      if (b.etage != null && b.etage !== '') b.criteres.etage = String(Math.max(0, Math.min(6, Math.round(b.etage))));
      if (b.valeur) b.valeurManuelle = true;   // valeur saisie avant l'estimation automatique : on la garde
    }
    delete b.dpe; delete b.etage;
  }
}
const sciDe = b => b.structure === 'sci' ? scis.find(x => x.id === b.sciId) : null;
const REGIMES = {ir: 'à l\'IR', is: 'à l\'IS'};
const detenteur = b => { const x = sciDe(b); return x ? x.nom : 'Nom propre'; };
const depuisCompte = d => Array.isArray(d) ? d.map(depuisCredit) : d && Array.isArray(d.biens) ? d.biens : null;
function biensLocaux() {
  try { const v = JSON.parse(localStorage.getItem(CLE) || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
  let c = null;
  try { c = JSON.parse(localStorage.getItem('mes-credits') || 'null'); } catch (e) {}
  if (!Array.isArray(c)) c = window.MES_CREDITS || [];
  return c.map(depuisCredit);
}
function sauver() {
  if (!COMPTE.user) { try { localStorage.setItem(CLE, JSON.stringify(biens)); localStorage.setItem(CLE_SCI, JSON.stringify(scis)); } catch (e) { alert('Mémoire de l\'appareil pleine : enregistrement impossible.'); } return; }
  if (!compteCharge) return;   // compte pas encore lu : ne pas l'écraser
  etatCompte = 'Enregistrement…'; majEtat(); enAttente = true;
  clearTimeout(minuteur);
  minuteur = setTimeout(envoyer, 700);
}
async function envoyer() {
  if (!enAttente || !COMPTE.user) return;
  enAttente = false;
  try { await COMPTE.ecrire(contenu()); etatCompte = 'Enregistré dans ton compte.'; }
  catch (e) { etatCompte = 'Échec de l\'enregistrement : ' + erreurCompte(e); }
  majEtat();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(minuteur); envoyer(); } });
// Ce qui part dans le compte : les biens et les recherches récentes de l'onglet Estimer
const contenu = () => ({version: 2, biens, scis, recherches: typeof RECENTES !== 'undefined' ? RECENTES.liste : []});
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

// ---------- Estimation automatique ----------
// Le même moteur que l'onglet Estimer, chargé dans un cadre caché : il ne touche ni à la recherche en cours,
// ni aux réglages enregistrés. Une estimation à la fois.
const moteur = {
  pret: null, cadre: null, file: Promise.resolve(),
  charger() {
    if (!this.pret) this.pret = new Promise((ok, ko) => {
      const f = Object.assign(document.createElement('iframe'), {src: 'index.html?moteur=1', tabIndex: -1, title: 'moteur d\'estimation'});
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:700px;visibility:hidden;border:0';
      f.onload = () => {
        const t0 = Date.now();
        (function attendre() { if (f.contentWindow.estimerPour) ok(f.contentWindow); else if (Date.now() - t0 > 20000) ko(new Error('moteur d\'estimation indisponible')); else setTimeout(attendre, 100); })();
      };
      document.body.append(f); this.cadre = f;
    }).catch(e => { this.pret = null; throw e; });
    return this.pret;
  },
  estimer(params) {
    const r = this.file.then(async () => {
      const w = await this.charger();
      let minuteur;
      try {
        return await Promise.race([w.estimerPour(params), new Promise((_, ko) => { minuteur = setTimeout(() => ko(new Error('trop long')), 90000); })]);
      } finally { clearTimeout(minuteur); }
    });
    this.file = r.catch(() => {});
    // Bloqué (service des ventes qui ne répond pas) : on repart d'un cadre neuf pour la prochaine fois
    r.catch(e => { if (e.message === 'trop long') this.reinitialiser(); });
    return r;
  },
  reinitialiser() { if (this.cadre) this.cadre.remove(); this.cadre = null; this.pret = null; },
};
const TYPE_DVF = {appart: '121', maison: '111'};
const EPOQUES = [[1914, 'av1914'], [1948, '1914'], [1970, '1948'], [1981, '1970'], [1992, '1981'], [Infinity, '1992']];
function criteresEffectifs(b) {
  const c = {...b.criteres, location: ['meuble', 'saisonnier'].includes(b.location.statut) ? 'meuble' : 'vide'};
  if (b.annee > 1500) c.epoque = EPOQUES.find(([y]) => b.annee < y)[1];
  return c;
}
const cleEstimation = b => JSON.stringify([b.adresse.trim(), b.type, b.surface, criteresEffectifs(b)]);
const estimable = b => TYPE_DVF[b.type] && b.adresse.trim().length >= 5 && b.surface >= 9;
const enCours = new Set();
async function estimerBien(b) {
  if (!estimable(b) || enCours.has(b.id)) return;
  const cle = cleEstimation(b);
  enCours.add(b.id); majAuto(b);
  const le = new Date().toISOString().slice(0, 10);
  try {
    if (!b.geo || b.geo.pour !== b.adresse.trim()) {
      const f = (await geocode(b.adresse.trim()))[0];
      if (!f) throw new Error('Adresse introuvable : ajoute la ville ou le code postal.');
      b.geo = {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label, pour: b.adresse.trim()};
    }
    const res = await moteur.estimer({lat: b.geo.lat, lon: b.geo.lon, type: TYPE_DVF[b.type], surf: b.surface, criteres: criteresEffectifs(b)});
    b.estimation = res.erreur ? {erreur: res.erreur, cle, le} : {...res, cle, le};
    if (!res.erreur && !b.valeurManuelle) { b.valeur = res.prix; b.valeurLe = moisCourant(); }
  } catch (e) {
    b.estimation = {erreur: e.message === 'trop long' ? 'L\'estimation a pris trop de temps (le service des ventes répond mal). Réessaie dans un instant.' : e.message || String(e), cle, le};
  } finally {
    enCours.delete(b.id);
  }
  sauver();
  if (ouvert === b.id) { majAuto(b); majCalculs(b); const v = racine.querySelector('[data-p="valeur"]'); if (v && document.activeElement !== v) v.value = b.valeur ?? ''; }
  else if (!ouvert) vueListeBientot();
}
let minuteurListe;
const vueListeBientot = () => { clearTimeout(minuteurListe); minuteurListe = setTimeout(() => { if (!ouvert) vueListe(); }, 300); };
// Bloc « Estimation automatique » de la fiche
let chrono = null;
function majAuto(b) {
  const el = racine.querySelector('#inv_auto'); if (!el || ouvert !== b.id) return;
  clearInterval(chrono);
  const e = b.estimation, a_jour = e && e.cle === cleEstimation(b), btn = racine.querySelector('#inv_estimer');
  // Le bouton en bas des caractéristiques : seul moyen de lancer l'estimation
  if (btn) {
    btn.disabled = !estimable(b) || enCours.has(b.id);
    btn.textContent = enCours.has(b.id) ? 'Estimation en cours…' : !estimable(b) ? 'Estimer ce bien (adresse et surface à remplir)' : e && !e.erreur && a_jour ? 'Estimer à nouveau' : 'Estimer ce bien';
  }
  let h;
  if (!TYPE_DVF[b.type]) h = '<div class="aide">Estimation disponible pour les appartements et les maisons.</div>';
  else if (enCours.has(b.id)) {
    const t0 = Date.now();
    h = '<div class="auto-cours"><span class="rond"></span>Recherche des ventes comparables… <span id="inv_chrono"></span></div>';
    chrono = setInterval(() => {
      const c = racine.querySelector('#inv_chrono'); if (!c || !enCours.has(b.id)) return clearInterval(chrono);
      const t = Math.round((Date.now() - t0) / 1000);
      c.textContent = t + ' s' + (t >= 20 ? ' (le service des ventes répond lentement)' : '');
    }, 1000);
  }
  else if (!e) h = `<div class="aide">${estimable(b) ? 'Règle les caractéristiques, puis clique sur « Estimer ce bien ».' : 'Renseigne l\'adresse et la surface, règle les caractéristiques, puis clique sur « Estimer ce bien ».'}</div>`;
  else if (e.erreur) h = `<div class="warnbox">${esc(e.erreur)}</div>`;
  else {
    const loue = LOUE.includes(b.location.statut);
    h = `<div class="auto-res${a_jour ? '' : ' perime'}">
      <div class="auto-chiffres"><div><span>Valeur estimée</span><b>${kEur(e.prix)}</b><small>${kEur(e.lo)} – ${kEur(e.hi)}</small></div>
        ${e.loyer ? `<div><span>Loyer de marché</span><b>${eur(e.loyer)}</b><small>hors charges/mois, ${e.cle && JSON.parse(e.cle)[3].location === 'meuble' ? 'meublé' : 'vide'}</small></div>
        <div><span>Rendement brut</span><b>${pct(e.loyer * 12 / e.prix)}</b><small>au loyer de marché, sur la valeur</small></div>` : ''}</div>
      <div class="aide">${esc(e.fiabilite)} · ${e.ventes} ventes à moins de ${e.rayon < 1000 ? fmt(e.rayon) + ' m' : (e.rayon / 1000).toFixed(1).replace('.', ',') + ' km'}${e.periode ? ` (ventes ${e.periode})` : ''} · estimé le ${new Date(e.le).toLocaleDateString('fr-FR')}${b.geo ? ` · adresse reconnue : ${esc(b.geo.label)}` : ''}
        ${loue && e.loyer && b.location.loyer ? `<br>Ton loyer : ${eur(b.location.loyer)}, soit ${pct(b.location.loyer / e.loyer - 1)} par rapport au marché.` : ''}</div>
      ${b.valeurManuelle ? `<button data-a="valeurAuto">Utiliser cette valeur (${kEur(e.prix)})</button>` : '<div class="aide">La valeur du bien reprend cette estimation (tu peux la remplacer à la main).</div>'}
    </div>
    ${!a_jour ? '<div class="aide">Caractéristiques modifiées depuis cette estimation : clique sur « Estimer ce bien » pour la mettre à jour.</div>' : ''}`;
  }
  el.innerHTML = h;
}

// ---------- Passage invité ↔ compte ----------
COMPTE.surChangement(async user => {
  compteCharge = false; urls.clear();
  if (!user) { etatCompte = ''; biens = biensLocaux(); scis = scisLocales(); normaliser(); return afficher(); }
  etatCompte = 'Chargement de ton compte…'; afficher();
  try {
    const brut = await COMPTE.lire();
    let distants = depuisCompte(brut);
    const nRech = brut && Array.isArray(brut.recherches) ? brut.recherches.length : 0;
    if (typeof RECENTES !== 'undefined') RECENTES.fusionner(brut && brut.recherches);
    if (!distants) {   // premier passage : proposer de reprendre ce qui est sur cet appareil (fichiers compris)
      const locaux = biensLocaux(), scisLoc = scisLocales();
      distants = locaux.length && confirm(`Mettre dans ton compte ${locaux.length > 1 ? `les ${locaux.length} biens enregistrés` : 'le bien enregistré'} sur cet appareil ?`) ? locaux : [];
      for (const b of distants) for (const d of b.docs.filter(d => d.local)) {
        try { const blob = await idbFaire('readonly', s => s.get(d.id)); if (blob) await envoyerDoc(b, d, blob); } catch (e) { console.warn(erreurDocs(e)); }
      }
      biens = distants; scis = distants.length ? scisLoc : []; normaliser(); await COMPTE.ecrire(contenu());
    }
    if (brut && Array.isArray(brut.scis)) scis = brut.scis;
    biens = distants; normaliser(); compteCharge = true; etatCompte = 'Enregistré dans ton compte.';
    if (typeof RECENTES !== 'undefined' && RECENTES.liste.length !== nRech) sauver();   // recherches de cet appareil à ajouter au compte
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
const kpi = (k, v, d, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const signe = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const etatHTML = () => COMPTE.user
  ? `<div class="compteEtat connecte">Connecté · <span id="inv_etat">${esc(etatCompte)}</span></div>`
  : '<div class="compteEtat">Mode invité : tes biens restent sur cet appareil. <button class="lien" data-a="connexion">Se connecter</button> pour les retrouver partout.</div>';
let ouvert = null, filtre = 'tout';   // bien ou SCI (« sci:<id> ») affiché en détail ; détenteur filtré dans la liste

// Le bien ou la SCI ouvert est celui de l'adresse de la page (#investissements/<id>) : quand les données du compte
// arrivent après coup, on rouvre bien la fiche demandée au lieu d'afficher la liste avec une adresse de fiche
function idDuHash() {
  const [t, sous] = location.hash.slice(1).split('/');
  return (t === 'investissements' || t === 'credits') && sous ? decodeURIComponent(sous) : null;
}
function afficher(id = idDuHash()) {
  const sci = id && id.startsWith('sci:') ? scis.find(x => x.id === id.slice(4)) : null;
  ouvert = sci ? id : id && biens.some(b => b.id === id) ? id : null;
  if (sci) vueSci(sci); else if (ouvert) vueDetail(biens.find(b => b.id === ouvert)); else vueListe();
}
// Totaux d'un ensemble de biens (patrimoine net : seulement sur les biens dont la valeur est renseignée)
function totaux(liste) {
  const cs = liste.map(calculs), estimes = liste.map((b, i) => [b, cs[i]]).filter(([b]) => b.valeur > 0);
  const V = somme(estimes, ([b]) => b.valeur), Dv = somme(estimes, ([, c]) => c.crd), D = somme(cs, c => c.crd);
  return {cs, V, D, net: V - Dv, manque: liste.length - estimes.length, n: liste.length, nEst: estimes.length,
    loyers: somme(cs, c => c.loyerMois), cf: somme(cs, c => c.cfMois)};
}
function kpisTotaux(t) {
  const sur = t.manque ? `sur ${t.nEst} bien${t.nEst > 1 ? 's' : ''} estimé${t.nEst > 1 ? 's' : ''}` : '';
  return `<div class="kpis six">${kpi('Biens', t.n, t.manque ? `${t.manque} sans valeur` : '')}${kpi('Valeur', t.V ? kEur(t.V) : '—', t.V ? sur || 'estimée' : 'à renseigner')}
    ${kpi('Restant dû', kEur(t.D), t.V && !t.manque ? Math.round(t.D / t.V * 100) + ' % de la valeur' : 'tous crédits')}
    ${kpi('Patrimoine net', t.V ? kEur(t.net) : '—', t.V ? sur || 'valeur − restant dû' : 'renseigne la valeur des biens', t.V ? signe(t.net) : '')}
    ${kpi('Loyers', eur(t.loyers), 'par mois')}${kpi('Cash-flow', eur(t.cf), 'par mois, avant impôts', signe(t.cf))}</div>`;
}
const ICONE_SCI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-4h6v4M9 10h6M9 13.5h6"/></svg>';

function vueListe() {
  const est = typeof estimationCourante === 'function' ? estimationCourante() : null;
  if (filtre !== 'tout' && filtre !== 'np' && !scis.some(x => x.id === filtre)) filtre = 'tout';
  let h = `<div class="invhead"><h1>Mes investissements</h1><div class="actions">
      ${est ? `<button data-a="ajoutEst" title="${esc(est.label)}">+ Ajouter le bien estimé</button>` : ''}
      <button data-a="ajoutSci">+ Créer une SCI</button>
      <button class="primaire" data-a="ajout">+ Ajouter un bien</button></div></div>${etatHTML()}`;
  if (biens.length || scis.length) {
    h += kpisTotaux(totaux(biens));
    if (scis.length) h += `<h2 class="sous-titre">Mes SCI</h2><div class="scis">${scis.map(x => {
      const t = totaux(biens.filter(b => b.sciId === x.id && b.structure === 'sci'));
      return `<a class="sci" href="#investissements/sci:${encodeURIComponent(x.id)}"><div class="ico">${ICONE_SCI}</div>
        <div class="infos"><b>${esc(x.nom)}</b><span>SCI ${REGIMES[x.regime]} · ${t.n} bien${t.n > 1 ? 's' : ''}${x.associes.length ? ` · ${x.associes.length} associé${x.associes.length > 1 ? 's' : ''}` : ''}</span></div>
        <div class="chiffres"><div><span>Patrimoine net</span><b class="${t.V ? signe(t.net) : ''}">${t.V ? kEur(t.net) : '—'}</b></div><div><span>Cash-flow</span><b class="${signe(t.cf)}">${t.n ? eur(t.cf) + '/mois' : '—'}</b></div></div>
        <span class="chev" aria-hidden="true">›</span></a>`;
    }).join('')}</div>`;
    // Filtre par détenteur
    const n = f => biens.filter(b => f === 'tout' || (f === 'np' ? b.structure !== 'sci' : b.sciId === f && b.structure === 'sci')).length;
    const choix = [['tout', 'Tous'], ['np', 'Nom propre'], ...scis.map(x => [x.id, x.nom])].filter(([f]) => f === 'tout' || n(f));
    const visibles = biens.filter(b => filtre === 'tout' || (filtre === 'np' ? b.structure !== 'sci' : b.sciId === filtre && b.structure === 'sci'));
    h += `<div class="liste-tete"><h2 class="sous-titre">Mes biens</h2>${choix.length > 2 ? `<div class="filtres">${choix.map(([f, l]) => `<button data-a="filtre" data-f="${esc(f)}" class="${f === filtre ? 'on' : ''}">${esc(l)} <span>${n(f)}</span></button>`).join('')}</div>` : ''}</div>`;
    const cs = visibles.map(calculs);
    h += visibles.length ? `<div class="liste">${visibles.map((b, i) => carte(b, cs[i])).join('')}</div>` : '<div class="aide">Aucun bien ici pour l\'instant.</div>';
  } else {
    h += `<div class="vide"><div class="ico">${icone('maison')}</div><h2>Ajoute ton premier investissement</h2>
      <p>Pour chaque bien : l'achat, le crédit, la location, les charges, et les plans. La rentabilité et ce qu'il reste à rembourser se calculent tout seuls. Tes SCI ont aussi leur fiche, avec leurs biens et leurs associés.</p>
      <div class="boutons centre"><button data-a="ajoutSci">+ Créer une SCI</button><button class="primaire" data-a="ajout">+ Ajouter un bien</button></div></div>`;
  }
  racine.innerHTML = h;
  vignettes();
}
function carte(b, c) {
  const tags = [b.pieces ? (b.type === 'maison' ? b.pieces + ' pièces' : 'T' + b.pieces) : '', b.surface ? fmt(b.surface) + ' m²' : '',
    sciDe(b) ? sciDe(b).nom : '', STATUTS[b.location.statut]].filter(Boolean);
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
      <div><h1 id="inv_titre">${esc(b.nom)}</h1><div class="adr" id="inv_sous">${esc([b.adresse, detenteur(b)].filter(Boolean).join(' · '))}</div></div></div>
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
      <div class="large sugg"><label for="inv_adresse">Adresse</label>
        <input id="inv_adresse" name="search" data-p="adresse" type="search" enterkeyhint="search" value="${esc(b.adresse)}" placeholder="ex. 12 rue Fesch, Ajaccio" autocomplete="off" autocorrect="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="inv_sugg" aria-expanded="false">
        <ul id="inv_sugg" role="listbox" hidden></ul>
        ${b.geo && b.geo.pour === b.adresse.trim() && b.geo.label !== b.adresse.trim() ? `<div class="aide">Adresse reconnue : ${esc(b.geo.label)}</div>` : ''}</div>
      ${champ(b, 'surface', 'Surface (m²)')}${champ(b, 'pieces', 'Pièces')}
      ${champ(b, 'annee', 'Année de construction')}
      <div><label for="inv_detention">Détenu par</label><select id="inv_detention" data-p="detention">
        <option value="np"${b.structure !== 'sci' ? ' selected' : ''}>Nom propre</option>
        ${scis.map(x => `<option value="${esc(x.id)}"${b.sciId === x.id && b.structure === 'sci' ? ' selected' : ''}>${esc(x.nom)} (SCI ${REGIMES[x.regime]})</option>`).join('')}
        <option value="+">+ Créer une SCI…</option></select>
        ${sciDe(b) ? `<div class="aide"><a href="#investissements/sci:${encodeURIComponent(b.sciId)}">Voir la fiche de la SCI →</a></div>` : ''}</div>
    </div>
    ${critHTML(b)}
    ${TYPE_DVF[b.type] ? '<button class="primaire estimer" data-a="estimerAuto" id="inv_estimer">Estimer ce bien</button>' : ''}
    <div class="valeur"><h4>Estimation</h4><div id="inv_auto"></div>
      <div class="grille">${champ(b, 'valeur', 'Valeur du bien (€)', {step: 1000})}${champ(b, 'valeurLe', 'Valeur au', {type: 'month'})}</div>
      <div class="boutons"><button data-a="estimer"${estimable(b) ? '' : ' disabled title="Renseigne l\'adresse et la surface"'}>Voir le détail dans l'onglet Estimer →</button></div></div>`)}
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
  majCalculs(b); docsHTML(b); vignettes(); majAuto(b);
}
// Caractéristiques utilisées par l'estimation (les mêmes que « Détails du bien » dans l'onglet Estimer)
function critHTML(b) {
  if (!TYPE_DVF[b.type]) return '';
  const pour = b.type === 'appart' ? 'appart' : 'maison';
  const liste = CRITERES.filter(c => !c.cache && c.id !== 'epoque' && (c.pour === 'tous' || c.pour === pour));
  const un = c => {
    const v = b.criteres[c.id], id = 'inv_c_' + c.id;
    if (c.check) return `<div class="case"><label><input type="checkbox" id="${id}" data-p="criteres.${c.id}"${v ? ' checked' : ''}> ${esc(c.label)}</label></div>`;
    if (c.number) return `<div><label for="${id}">${esc(c.label)}</label><input type="number" min="0" id="${id}" data-p="criteres.${c.id}" value="${esc(v ?? '')}" placeholder="facultatif"></div>`;
    const def = (c.options.find(o => o.d) || c.options[0]).k;
    return `<div><label for="${id}">${esc(c.label)}</label><select id="${id}" data-p="criteres.${c.id}">${c.options.map(o => `<option value="${esc(o.k)}"${String(v ?? def) === String(o.k) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></div>`;
  };
  const ess = liste.filter(c => c.essentiel), autres = liste.filter(c => !c.essentiel);
  const n = autres.filter(c => c.check ? b.criteres[c.id] : b.criteres[c.id] != null && String(b.criteres[c.id]) !== String((c.options || []).find(o => o.d)?.k ?? '')).length;
  return `<div class="crit-bien"><h4>Caractéristiques</h4><div class="grille">${ess.map(un).join('')}</div>
    <details class="plus-crit"${n ? ' open' : ''}><summary>Plus de caractéristiques${n ? ` (${n})` : ''}</summary><div class="grille">${autres.map(un).join('')}</div></details></div>`;
}
function vueSci(x) {
  const sesBiens = biens.filter(b => b.structure === 'sci' && b.sciId === x.id), t = totaux(sesBiens);
  const totalParts = somme(x.associes, a => a.parts);
  let h = `<a class="retour" href="#investissements">← Mes investissements</a>${etatHTML()}
    <div class="dethead"><div class="vignette grand sciv">${ICONE_SCI}<span>SCI ${REGIMES[x.regime]}</span></div>
      <div><h1 id="inv_titre">${esc(x.nom)}</h1><div class="adr" id="inv_sous">${esc(['SCI ' + REGIMES[x.regime], x.siren ? 'SIREN ' + x.siren : '', x.siege].filter(Boolean).join(' · '))}</div></div></div>
    ${kpisTotaux(t)}
    <div class="blocs">
    ${section('Identité', `<div class="grille">
      ${champ(x, 'nom', 'Nom', {type: 'text'})}${champ(x, 'regime', 'Régime fiscal', {options: {ir: 'Impôt sur le revenu (IR)', is: 'Impôt sur les sociétés (IS)'}})}
      ${champ(x, 'siren', 'SIREN', {type: 'text', ph: '9 chiffres'})}${champ(x, 'creation', 'Date de création', {type: 'month'})}
      ${champ(x, 'capital', 'Capital social (€)', {step: 100})}${champ(x, 'cloture', 'Clôture de l\'exercice', {type: 'text', ph: '31/12'})}
      ${champ(x, 'siege', 'Siège social', {type: 'text', large: true})}
    </div>`)}
    ${section('Associés', `${x.associes.length ? `<div class="associes">${x.associes.map((a, i) => `<div class="associe">
        <div class="grille">${champ(x, `associes.${i}.nom`, 'Nom', {type: 'text'})}${champ(x, `associes.${i}.parts`, 'Parts (%)', {step: 0.01})}</div>
        <div class="part" data-part="${i}"></div><button class="lien" data-a="supprAssocie" data-i="${i}">Retirer</button></div>`).join('')}</div>` : '<div class="aide">Aucun associé renseigné.</div>'}
      <div class="aide" id="inv_parts">${x.associes.length && Math.abs(totalParts - 100) > 0.01 ? `Total des parts : ${fmt(totalParts)} % (devrait faire 100 %).` : ''}</div>
      <button data-a="ajoutAssocie">+ Ajouter un associé</button>`)}
    ${section('Biens de la SCI', `${sesBiens.length ? `<div class="liste">${sesBiens.map((b, i) => carte(b, t.cs[i])).join('')}</div>` : '<div class="aide">Aucun bien rattaché. Dans la fiche d\'un bien, choisis cette SCI dans « Détenu par », ou ajoute-en un ici.</div>'}
      <button data-a="ajoutBienSci">+ Ajouter un bien à cette SCI</button>`, true)}
    ${section('Partenaires', `<div class="grille">${champ(x, 'banque', 'Banque', {type: 'text'})}${champ(x, 'comptable', 'Expert-comptable', {type: 'text'})}</div>`)}
    ${section('Notes', champ(x, 'notes', '', {zone: true, ph: 'Assemblées générales, comptes courants d\'associés, échéances…'}))}
    </div>
    <div class="pied"><button class="danger" data-a="supprSci">Supprimer cette SCI</button></div>`;
  racine.innerHTML = h;
  majParts(x, t); vignettes();
}
// Ce qui revient à chaque associé (au prorata de ses parts)
function majParts(x, t = totaux(biens.filter(b => b.structure === 'sci' && b.sciId === x.id))) {
  x.associes.forEach((a, i) => {
    const el = racine.querySelector(`[data-part="${i}"]`); if (!el) return;
    el.textContent = a.parts > 0 ? `Sa part : ${t.V ? kEur(t.net * a.parts / 100) + ' de patrimoine net, ' : ''}${eur(t.cf * a.parts / 100)}/mois de cash-flow` : '';
  });
  const tp = somme(x.associes, a => a.parts), el = racine.querySelector('#inv_parts');
  if (el) el.textContent = x.associes.length && Math.abs(tp - 100) > 0.01 ? `Total des parts : ${String(Math.round(tp * 100) / 100).replace('.', ',')} % (devrait faire 100 %).` : '';
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
    ${kpi('Valeur', b.valeur ? kEur(b.valeur) : '—', !b.valeur ? 'à renseigner' : !b.valeurManuelle && b.estimation && !b.estimation.erreur ? 'estimée automatiquement' : 'saisie à la main' + (b.valeurLe ? ' (' + libMois(b.valeurLe) + ')' : ''))}
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

// ---------- Adresse : propositions pendant la frappe ----------
let suggAdr = [], suggMinuteur, suggTour = 0, suggChoix = -1;
function montrerSugg(liste) {
  const ul = racine.querySelector('#inv_sugg'), inp = racine.querySelector('#inv_adresse'); if (!ul) return;
  suggAdr = liste; suggChoix = -1;
  ul.innerHTML = liste.map((f, k) => `<li role="option" data-k="${k}">${esc(f.properties.label)}</li>`).join('');
  ul.hidden = !liste.length; inp.setAttribute('aria-expanded', String(!!liste.length));
}
function choisirAdresse(k) {
  const b = biens.find(x => x.id === ouvert), f = suggAdr[k]; if (!b || !f) return;
  b.adresse = f.properties.label;
  b.geo = {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label, pour: f.properties.label};
  suggAdr = []; sauver(); vueDetail(b);
}
racine.addEventListener('input', e => {
  if (e.target.id !== 'inv_adresse') return;
  clearTimeout(suggMinuteur);
  const q = e.target.value.trim();
  if (q.length < 4) return montrerSugg([]);
  suggMinuteur = setTimeout(async () => {
    const tour = ++suggTour;
    try { const feats = await geocode(q); if (tour === suggTour) montrerSugg(feats.slice(0, 6)); } catch (err) { montrerSugg([]); }
  }, 250);
});
racine.addEventListener('keydown', e => {
  if (e.target.id !== 'inv_adresse' || !suggAdr.length) return;
  const lis = racine.querySelectorAll('#inv_sugg li');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggChoix = (suggChoix + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('actif', i === suggChoix));
  } else if (e.key === 'Enter') { e.preventDefault(); choisirAdresse(Math.max(0, suggChoix)); }
  else if (e.key === 'Escape') montrerSugg([]);
});
// mousedown plutôt que click : le champ ne perd pas le focus avant le choix
racine.addEventListener('mousedown', e => {
  const li = e.target.closest('#inv_sugg li[data-k]'); if (!li) return;
  e.preventDefault(); choisirAdresse(+li.dataset.k);
});
racine.addEventListener('focusout', e => { if (e.target.id === 'inv_adresse') setTimeout(() => montrerSugg([]), 150); });

// ---------- Actions ----------
function ajouter(o) { const b = nouveauBien(o); biens.push(b); sauver(); location.hash = '#investissements/' + b.id; }
racine.addEventListener('click', async e => {
  // Lien vers la fiche déjà dans l'adresse (aucun changement d'adresse, donc rien ne se passerait) : on l'ouvre directement
  const lien = e.target.closest('a[href^="#investissements"]');
  if (lien) {
    if (lien.getAttribute('href') === location.hash) { e.preventDefault(); afficher(idDuHash()); window.scrollTo(0, 0); }
    return;
  }
  const t = e.target.closest('[data-a]'); if (!t) return;
  const b = biens.find(x => x.id === ouvert), a = t.dataset.a;
  const sci = ouvert && ouvert.startsWith('sci:') ? scis.find(x => x.id === ouvert.slice(4)) : null;
  if (a === 'connexion') return ouvrirCompte();
  if (a === 'ajout') return ajouter();
  if (a === 'filtre') { filtre = t.dataset.f; return vueListe(); }
  if (a === 'ajoutSci') { const x = nouvelleSci(); scis.push(x); sauver(); location.hash = '#investissements/sci:' + x.id; return; }
  if (sci) {
    if (a === 'ajoutAssocie') { sci.associes.push({nom: '', parts: sci.associes.length ? null : 100}); sauver(); vueSci(sci); }
    if (a === 'supprAssocie' && confirm('Retirer cet associé ?')) { sci.associes.splice(+t.dataset.i, 1); sauver(); vueSci(sci); }
    if (a === 'ajoutBienSci') ajouter({structure: 'sci', sciId: sci.id});
    if (a === 'supprSci' && confirm(`Supprimer la fiche « ${sci.nom} » ? Ses biens restent, en nom propre.`)) {
      biens.forEach(x => { if (x.sciId === sci.id) { x.structure = 'np'; x.sciId = null; } });
      scis = scis.filter(x => x !== sci); sauver(); location.hash = '#investissements';
    }
    return;
  }
  if (a === 'ajoutEst') {
    const est = estimationCourante(); if (!est) return;
    return ajouter({nom: est.label.split(' ').slice(0, 4).join(' '), adresse: est.label, type: est.type, surface: est.surf,
      criteres: Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'location')), geo: state.lat != null ? {lat: state.lat, lon: state.lon, label: est.label, pour: est.label} : null,
      valeur: est.prix, valeurLe: moisCourant(), location: {statut: est.meuble ? 'meuble' : 'vide', loyer: est.loyer, charges: null, locataire: '', debutBail: '', vacance: 0}});
  }
  if (!b) return;
  if (a === 'estimerAuto') estimerBien(b);
  if (a === 'valeurAuto' && b.estimation && b.estimation.prix) { b.valeurManuelle = false; b.valeur = b.estimation.prix; b.valeurLe = moisCourant(); sauver(); vueDetail(b); }
  if (a === 'estimer' && estimable(b)) {
    // Même recherche dans l'onglet Estimer (adresse, type, surface, caractéristiques), avec la carte et le détail du calcul
    showTab('estimation');
    if (b.geo) reprendre({label: b.geo.label, lat: b.geo.lat, lon: b.geo.lon, type: TYPE_DVF[b.type], surf: b.surface, since: 'auto', criteres: criteresEffectifs(b)});
    else { document.getElementById('addr').value = b.adresse; document.getElementById('surf').value = b.surface; document.getElementById('go').click(); }
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
  // Fiche d'une SCI
  const sci = ouvert && ouvert.startsWith('sci:') ? scis.find(x => x.id === ouvert.slice(4)) : null;
  if (sci) {
    const t = e.target, chemin = t.dataset.p; if (!chemin) return;
    let v = t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.type === 'text' || t.type === 'search' ? t.value : t.type === 'month' ? normMois(t.value) : t.value === '' ? null : +t.value;
    if (t.type === 'month' && t.value && !v) { alert('Date au format AAAA-MM, par exemple 2019-06.'); t.value = lire(sci, chemin) || ''; return; }
    if (chemin === 'nom' && !String(v).trim()) { t.value = sci.nom; return; }
    ecrire(sci, chemin, v); sauver();
    if (chemin === 'regime') return vueSci(sci);
    racine.querySelector('#inv_titre').textContent = sci.nom;
    racine.querySelector('#inv_sous').textContent = ['SCI ' + REGIMES[sci.regime], sci.siren ? 'SIREN ' + sci.siren : '', sci.siege].filter(Boolean).join(' · ');
    return majParts(sci);
  }
  const b = biens.find(x => x.id === ouvert); if (!b) return;
  // Détenteur : nom propre, une SCI existante, ou une nouvelle SCI créée à la volée
  if (e.target.dataset.p === 'detention') {
    let v = e.target.value;
    if (v === '+') {
      const nom = (prompt('Nom de la SCI ?') || '').trim();
      if (!nom) { e.target.value = b.structure === 'sci' ? b.sciId : 'np'; return; }
      const x = nouvelleSci({nom}); scis.push(x); v = x.id;
    }
    if (v === 'np') { b.structure = 'np'; b.sciId = null; } else { b.structure = 'sci'; b.sciId = v; }
    sauver(); return vueDetail(b);
  }
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
  let v = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.type === 'text' || t.type === 'search' ? t.value : t.type === 'month' ? normMois(t.value) : t.value === '' ? null : +t.value;
  if (t.type === 'month' && t.value && !v) { alert('Date au format AAAA-MM, par exemple 2024-03.'); t.value = lire(b, chemin) || ''; return; }
  // Prix et valeur tapés en milliers (« 819 ») : compris comme 819 000 €
  if (['valeur', 'achat.prix'].includes(chemin) && v > 0 && v < 2000) { v *= 1000; t.value = v; }
  ecrire(b, chemin, v);
  if (chemin === 'valeur') { b.valeurManuelle = v != null; if (v == null && b.estimation && b.estimation.prix) { b.valeur = b.estimation.prix; t.value = b.valeur; } }
  if (chemin === 'valeur' && v && !b.valeurLe) { b.valeurLe = moisCourant(); const m = racine.querySelector('[data-p="valeurLe"]'); if (m) m.value = b.valeurLe; }
  sauver();
  // Ce qui change la forme de la fiche : on la reconstruit ; sinon seulement les chiffres
  if (['type', 'location.statut', 'adresse'].includes(chemin) || /^prets\.\d+\.banque$/.test(chemin)) return vueDetail(b);
  if (chemin === 'nom') racine.querySelector('#inv_titre').textContent = b.nom;
  // Caractéristiques changées : l'estimation est signalée comme à refaire (sans la relancer)
  if (chemin.startsWith('criteres.') || ['surface', 'annee', 'valeur', 'pieces'].includes(chemin)) majAuto(b);
  majCalculs(b);
});

// Démarrage : biens de cet appareil, puis le compte s'il y a une session
biens = biensLocaux(); scis = scisLocales(); normaliser();
// Biens repris des anciens crédits : enregistrés tout de suite, pour garder les mêmes identifiants d'un chargement à l'autre
try { if (!localStorage.getItem(CLE) && biens.length) { localStorage.setItem(CLE, JSON.stringify(biens)); localStorage.setItem(CLE_SCI, JSON.stringify(scis)); } } catch (e) {}
window.INV = {afficher: id => { afficher(id); window.scrollTo(0, 0); }, sauverCompte: () => { if (COMPTE.user) sauver(); }};
COMPTE.init();
})();
