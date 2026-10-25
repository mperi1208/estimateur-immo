// Mon patrimoine : chaque bien avec son achat, ses crédits, sa location, ses charges, son cash-flow,
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
// Échéancier mois par mois, de la 1re échéance (offre) ou du mois qui suit le relevé, jusqu'à la dernière :
// - différé (offre seulement, compris dans la durée) : intérêts seuls (partiel) ou rien (total : les intérêts s'ajoutent au capital) ;
// - mensualité progressive : elle augmente d'un même pourcentage chaque année, de date à date depuis la fin du différé.
//   Avec la mensualité actuelle seule, la hausse est celle qui rembourse le prêt pile à la dernière échéance.
function planPret(p, auj = moisCourant()) {
  const r = (p.taux || 0) / 1200, releve = p.crd > 0 && p.mois > 0 && p.crdLe;
  let P, n, debut, D = 0;
  const diff = p.typeDiff && p.duree > 0 ? Math.max(0, Math.min(p.duree - 1, Math.round(p.differe || 0))) : 0;
  if (releve) { P = p.crd; n = p.mois; debut = decalerMois(p.crdLe, 1); }
  else if (p.montant > 0 && p.duree > 0 && p.debut) { P = p.montant; n = p.duree; debut = p.debut; D = diff; }
  else return null;
  const total = p.typeDiff === 'total';
  const jAncre = p.debut ? ecartMois(debut, decalerMois(p.debut, diff)) : 0, an = j => Math.max(0, Math.floor((j - jAncre) / 12));
  const deroule = (M0, g) => {
    const l = []; let c = P;
    for (let j = 0; j < n; j++) {
      const it = c * r; let paye, interets = it;
      if (j < D) { if (total) { paye = 0; interets = 0; c += it; } else paye = it; }
      else { paye = Math.max(0, Math.min(M0 * Math.pow(1 + g, an(j)), c + it)); c -= paye - it; }
      l.push({paye, interets, capital: paye - interets, crd: c});
    }
    return l;
  };
  const reste = (M0, g) => { const l = deroule(M0, g); return l.length ? l[l.length - 1].crd : P; };
  let M0, g = 0, prog = null;
  if (p.progressif && (p.mensualite > 0 || p.hausse > 0)) {
    // Mensualité saisie à une date (celle de la saisie) : on la ramène à l'année 0
    const jRef = Math.max(D, Math.min(n - 1, ecartMois(debut, p.mensuLe || auj))), yRef = an(jRef);
    const depuisRef = g => p.mensualite / Math.pow(1 + g, yRef);
    if (p.hausse != null && p.hausse >= 0) {
      g = p.hausse / 100;
      if (p.mensualite > 0) M0 = depuisRef(g);
      else { const b0 = reste(0, g), b1 = reste(1, g); M0 = b0 / (b0 - b1); }   // le restant dû final varie en ligne droite avec M0
    } else if (reste(depuisRef(0), 0) > 0.5) {
      let a = 0, b = 0.2;
      for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (reste(depuisRef(m), m) > 0) a = m; else b = m; }
      g = (a + b) / 2; M0 = depuisRef(g);
    } else M0 = p.mensualite;
    prog = {g, saisie: p.hausse != null && p.hausse >= 0};
  } else M0 = p.mensualite || pmt(total ? P * Math.pow(1 + r, D) : P, r, n - D);
  return {l: deroule(M0, g), P, debut, D, total, releve, jAncre, an, prog};
}
function etatPret(p, auj = moisCourant()) {
  const pl = planPret(p, auj); if (!pl) return null;
  const {l, P, debut, D} = pl, n = l.length, ecart = ecartMois(debut, auj);
  const k = Math.max(0, Math.min(n, ecart + 1));   // échéances déjà payées : jusqu'à ce mois-ci compris
  // 1re échéance dans plusieurs mois (achat récent) ou relevé à une date à venir (prêt en pause) : rien à payer d'ici là
  const pause = Math.max(0, -ecart - 1), reprise = pause ? (pl.releve ? p.crdLe : p.debut) : null;
  const mois = n - k + pause;
  let crd = k ? l[k - 1].crd : P;
  crd = mois > 0 && crd > 0.005 ? crd : 0;   // prêt soldé : pas de reste d'arrondi
  const jCour = Math.max(0, Math.min(n - 1, ecart)), M = n ? l[jCour].paye : 0;
  // 12 prochains mois : intérêts et capital remboursé (rien pendant la pause : les intérêts s'ajoutent au capital)
  let interets = 0, capital = 0, paye12 = 0, resteAPayer = 0;
  const fin12 = Math.min(n, ecart + 13);
  for (let j = k; j < n; j++) { resteAPayer += l[j].paye; if (j < fin12) { interets += l[j].interets; capital += l[j].capital; paye12 += l[j].paye; } }
  const payes = Math.max(0, fin12 - k);
  // Différé pas encore fini : ce qu'on paie pendant, et la mensualité d'après
  const differe = D && ecart < D - 1 && D < n ? {fin: decalerMois(debut, D - 1), total: pl.total, apres: l[D].paye} : null;
  let prog = null;
  if (pl.prog) {
    const jH = pl.jAncre + 12 * (pl.an(Math.max(jCour, D, pl.jAncre)) + 1);   // 1re échéance de l'année suivante
    prog = {...pl.prog, max: Math.max(...l.map(x => x.paye)), hausse: jH < n && jH >= k ? {mois: decalerMois(debut, jH), M: l[jH].paye} : null};
  }
  return {crd, mois, M, pause, payes, reprise, debutFutur: pause > 0 && !pl.releve, assur: p.assurance || 0, fin: decalerMois(auj, mois),
    interets, capital, paye12, resteAPayer, differe, prog};
}
// Renégociation ou rachat aux taux d'aujourd'hui (même calcul que l'ancien onglet « Mes crédits »)
function analyseReneg(p, e, sci) {
  if (!e || !(e.mois > 0 && e.crd > 1000 && p.taux > 0)) return null;
  const n = e.mois - (e.pause || 0), tNew = T.tauxDuree(T.TAUX_ACTUEL, n) + (sci ? T.SURPRIME_SCI : 0);   // durée de remboursement restante
  // Gain : ce qui reste à payer (mensualités qui montent, différé…) moins la nouvelle mensualité fixe
  const mensu2 = pmt(e.crd, tNew / 1200, n), gainMois = e.M - mensu2, gainTotal = (e.resteAPayer ?? e.M * n) - mensu2 * n;
  const ira = Math.min(0.03 * e.crd, 6 * e.crd * p.taux / 1200), fraisRachat = ira + 1000 + 0.015 * e.crd;
  let surprime = null;
  const offre = p.offre || p.debut;
  if (offre && p.duree) {
    const ms = [offre, decalerMois(offre, 1)].filter(m => T.HISTO[m]).map(m => p.taux - T.tauxDuree(T.HISTO[m], p.duree));
    if (ms.length) surprime = [Math.min(...ms), Math.max(...ms)];
  }
  return {tNew, mensu2, gainMois, gainTotal, ira, fraisRachat, netRachat: gainTotal - fraisRachat, netAvenant: gainTotal - 600, surprime, offre};
}

// ---------- Rachat de crédit ou renégociation : simulation modifiable ----------
// p.rachat : mode (rachat par une autre banque / renégociation avec la sienne), nouveau taux, durée et assurance,
// frais (indemnités, dossier, garantie ou avenant), payés de sa poche ou ajoutés au nouveau prêt, et autres prêts
// du bien regroupés dans le même rachat (avec). Champ vide : valeur d'aujourd'hui (taux du marché, durée restante…).
function simulerRachat(b, p, auj = moisCourant()) {
  const r = p.rachat || {}, reneg = r.mode === 'reneg', sci = b.structure !== 'np';
  const groupe = [p, ...b.prets.filter(q => q !== p && (r.avec || []).includes(q.id))]
    .map(q => ({q, pl: planPret(q, auj), e: etatPret(q, auj)})).filter(x => x.e && x.e.mois > 0 && x.e.crd > 0);
  if (!groupe.length || groupe[0].q !== p || !(p.taux > 0)) return null;
  const crd = somme(groupe, x => x.e.crd), nAuj = Math.max(...groupe.map(x => x.e.mois - (x.e.pause || 0)));
  const tAuj = Math.round((T.tauxDuree(T.TAUX_ACTUEL, nAuj) + (sci ? T.SURPRIME_SCI : 0)) * 100) / 100;
  const taux = r.taux > 0 ? r.taux : tAuj, duree = r.duree > 0 ? Math.round(r.duree) : nAuj;
  const assurAvant = somme(groupe, x => x.e.assur), assur = r.assurance ?? assurAvant;
  const iraAuto = somme(groupe, x => Math.min(0.03 * x.e.crd, 6 * x.e.crd * (x.q.taux || 0) / 1200));
  const ira = reneg ? 0 : r.ira ?? iraAuto, dossier = reneg ? 0 : r.dossier ?? 1000, garantie = reneg ? 0 : r.garantie ?? Math.round(0.015 * crd);
  const avenant = reneg ? r.avenant ?? 600 : 0, frais = ira + dossier + garantie + avenant;
  const finance = r.finance === '1', capital = crd + (finance ? frais : 0), t = taux / 1200, M2 = pmt(capital, t, duree);
  // Mois par mois : ce qu'on paie avant (échéancier actuel, assurance comprise) et après, et le restant dû de chaque côté
  const H = Math.max(duree, ...groupe.map(x => x.e.mois));
  const avant = Array(H).fill(0), crdAvant = Array(H).fill(0);
  let assurPayee = 0;
  for (const {pl, e} of groupe) {
    const n = pl.l.length, k = n - e.mois + (e.pause || 0);
    for (let j = 0; j < H; j++) {
      const i = k + j - (e.pause || 0);
      if (j < (e.pause || 0)) crdAvant[j] += e.crd;
      else if (i < n) { avant[j] += pl.l[i].paye + e.assur; crdAvant[j] += pl.l[i].crd; assurPayee += e.assur; }
    }
  }
  const apres = j => j < duree ? M2 + assur : 0, crdApres = j => j < duree - 1 ? solde(capital, t, M2, j + 1) : 0;
  const comptant = finance ? 0 : frais;
  // Point d'équilibre : à partir de ce mois, on a gagné de l'argent même en revendant (restant dû compris), et ça ne s'inverse plus
  let cumul = -comptant, equilibre = null;
  const net = [];
  for (let j = 0; j < H; j++) { cumul += avant[j] - apres(j); net.push(cumul + crdAvant[j] - crdApres(j)); }
  for (let j = H - 1; j >= 0 && net[j] >= 0; j--) equilibre = j + 1;
  const coutAvant = somme(avant, x => x), coutApres = M2 * duree + assur * duree + comptant;
  const mensuAvant = somme(groupe, x => (x.e.pause ? 0 : x.e.M) + x.e.assur), mensuApres = M2 + assur;
  return {reneg, groupe: groupe.length, crd, nAuj, tAuj, taux, duree, assur, assurAvant, ira, iraAuto, dossier, garantie, avenant, frais, finance, capital, M2,
    mensuAvant, mensuApres, diffMois: mensuAvant - mensuApres, coutAvant, coutApres, gain: coutAvant - coutApres,
    assurPayee, assurApres: assur * duree, interetsAvant: coutAvant - crd - assurPayee, interetsApres: M2 * duree - capital, equilibre};
}

// ---------- Cash-flow d'un bien (avant impôts) ----------
const LOUE = ['vide', 'meuble', 'saisonnier', 'colocation', 'lots'];
const LISTES = {colocation: {cle: 'chambres', nom: 'Chambre', titre: 'Chambres louées', ajout: '+ Ajouter une chambre'},
  lots: {cle: 'lots', nom: 'Logement', titre: 'Logements', ajout: '+ Ajouter un loyer'}};
// Loyer mensuel d'un logement : un seul loyer, ou la somme des chambres (colocation) ou des lots (bien divisé, annexe louée à part)
const lignesLoyer = b => LISTES[b.location.statut] ? b[LISTES[b.location.statut].cle] || [] : null;
// Location saisonnière : prix par nuit × nuits louées par an, ramené au mois (sans prix par nuit : recettes saisies au mois)
const nuitee = b => b.location.statut === 'saisonnier' && b.location.nuit > 0;
const loyerLogement = b => lignesLoyer(b) ? somme(lignesLoyer(b), x => x.loyer) : nuitee(b) ? b.location.nuit * (b.location.nuitsAn || 0) / 12 : b.location.loyer || 0;
// Chaque chambre ou lot peut avoir son propre début de loyer (logement créé, garage aménagé…) : sans date, il est déjà loué.
// Mois de loyer sur les 12 prochains mois, et loyer encaissé ce mois-ci
const moisDeLoyer = (debut, auj = moisCourant()) => (debut = normMois(debut)) ? Math.max(0, Math.min(12, 12 - ecartMois(auj, debut))) : 12;
const commence = (x, auj = moisCourant()) => !normMois(x.debut) || ecartMois(normMois(x.debut), auj) >= 0;
// Un seul loyer : un bail qui commence plus tard (garage sorti d'un lot à venir, logement en travaux…) ne rapporte qu'à partir de là
const debutBailFutur = b => (d => d && !commence({debut: d}) ? d : '')(normMois(b.location.debutBail));
const loyerActuel = b => lignesLoyer(b) ? somme(lignesLoyer(b).filter(x => commence(x)), x => x.loyer) : debutBailFutur(b) ? 0 : loyerLogement(b);
const STATUTS_TERRAIN = {loue: 'Loué (bail)', activites: 'Activités qui rapportent', perso: 'Usage personnel', libre: 'Non exploité'};
const NATURES = {'': '—', constructible: 'Constructible', agricole: 'Agricole', naturel: 'Naturel / boisé', loisirs: 'Loisirs / agrément', stockage: 'Parking / stockage', autre: 'Autre'};
const BAUX = {'': '—', rural: 'Bail rural (fermage)', commercial: 'Bail commercial', precaire: 'Convention d\'occupation précaire', parking: 'Location parking / stockage', autre: 'Autre'};
const PERIODES = {mois: 'par mois', an: 'par an'};
const annuel = (montant, periode) => (montant || 0) * (periode === 'an' ? 1 : 12);
// Revenus annuels d'un terrain : le loyer du bail, ou la somme des activités
function revenusTerrain(b) {
  const L = b.location;
  if (L.statut === 'loue') return annuel(L.loyer, L.periode) * (1 - Math.min(12, L.vacance || 0) / 12);
  if (L.statut === 'activites') return somme(b.revenus || [], r => annuel(r.montant, r.periode));
  return 0;
}
// Comptable de la SCI : ses honoraires annuels, partagés à parts égales entre les biens de la SCI qui le choisissent
const avecComptaSci = (x, b) => biens.filter(y => y.structure === 'sci' && y.sciId === x.id && y.chargesAn && y.chargesAn.comptaSci && (!y.vendu || y === b));
function partComptaSci(b) {
  const x = b.chargesAn.comptaSci && sciDe(b); if (!x) return null;
  return (x.compta || 0) / Math.max(1, avecComptaSci(x, b).length);
}
const statutLib = b => b.amenag && !b.amenag.fait ? 'À aménager' : b.location.statut === 'avec' ? (p => p ? 'Avec ' + p.nom : '')(principalDe(b)) : (b.type === 'terrain' ? STATUTS_TERRAIN : STATUTS)[b.location.statut] || '';
// ---------- Un crédit pour plusieurs biens (achat groupé, deux appartements au même vendeur…) ----------
// Le prêt est saisi sur la fiche d'un bien ; p.partage = [{id, part}] : les autres biens qu'il finance et leur part (%).
// Le bien qui porte le prêt garde le reste. Chaque bien compte sa part du restant dû et des mensualités : les totaux ne le comptent qu'une fois.
const partagesDe = p => (p.partage || []).filter(x => biens.some(y => y.id === x.id));
const partPorteur = p => Math.max(0, 1 - somme(partagesDe(p), x => x.part) / 100);
function pretsRecus(b) {
  const l = [];
  for (const y of biens) if (y !== b && y.id !== b.id) for (const p of y.prets || []) {
    const x = (p.partage || []).find(z => z.id === b.id);
    if (x) l.push({p, de: y, k: Math.max(0, Math.min(100, x.part || 0)) / 100});
  }
  return l;
}
// Répartition par défaut : au prorata des prix d'achat (à défaut, des valeurs ; sinon à parts égales), en % entiers
function partsAuProrata(porteur, autres) {
  const l = [porteur, ...autres], poids = x => x.achat && x.achat.prix > 0 ? x.achat.prix : 0;
  const base = l.every(x => poids(x) > 0) ? poids : l.every(x => x.valeur > 0) ? x => x.valeur : () => 1;
  const tot = somme(l, base);
  return autres.map(x => Math.round(base(x) / tot * 100));
}
function calculs(b) {
  const prets = b.prets.map(p => ({p, e: etatPret(p), k: partPorteur(p)}));
  const recus = pretsRecus(b).map(x => ({...x, e: etatPret(x.p)}));
  const tous = [...prets, ...recus], actifs = tous.filter(x => x.e && x.e.mois > 0);
  const terrain = b.type === 'terrain';
  const loue = terrain ? ['loue', 'activites'].includes(b.location.statut) : LOUE.includes(b.location.statut);
  const lignes = lignesLoyer(b), vac = nuitee(b) ? 1 : 1 - Math.min(12, b.location.vacance || 0) / 12;   // à la nuitée, les nuits louées comptent déjà les creux
  const loyersAn = terrain ? revenusTerrain(b) : !loue ? 0 : lignes ? somme(lignes, x => (x.loyer || 0) * moisDeLoyer(x.debut)) * vac : loyerLogement(b) * moisDeLoyer(debutBailFutur(b)) * vac;
  const loyerMois = terrain ? loyersAn / 12 : loue ? loyerActuel(b) : 0;
  const c = b.chargesAn, compta = c.comptaSci ? partComptaSci(b) ?? (c.compta || 0) : c.compta || 0;
  const chargesAn = (c.tf || 0) + (c.copro || 0) + (c.pno || 0) + compta + (c.cfe || 0) + (c.autres || 0) + loyersAn * ((c.gestion || 0) + (c.entretien || 0)) / 100
    + (b.location.statut === 'saisonnier' && !terrain ? loyersAn * (b.location.fraisSaison || 0) / 100 : 0);   // plateforme, conciergerie, ménage
  const creditAn = somme(actifs, x => (x.e.paye12 + x.e.assur * x.e.payes) * x.k);
  const a = b.achat, cout = (a.prix || 0) + (a.mode === 'construction' ? a.construction || 0 : 0) + (a.notaire || 0) + (a.travaux || 0) + (a.mobilier || 0) + (a.frais || 0);
  const crd = somme(tous, x => x.e && x.e.crd * x.k), cfAn = loyersAn - chargesAn - creditAn;
  return {prets, recus, loue, loyerMois, loyersAn, chargesAn, compta, creditAn, cout, crd, cfAn, cfMois: cfAn / 12,
    mensuCredit: somme(actifs, x => x.e.pause ? 0 : (x.e.M + x.e.assur) * x.k), interetsAn: somme(actifs, x => (x.e.interets + x.e.assur * x.e.payes) * x.k),
    capitalAn: somme(actifs, x => x.e.capital * x.k), emprunte: somme(tous, x => (x.p.montant || 0) * x.k),
    patrimoine: b.valeur > 0 ? b.valeur - crd : null, plusValue: b.valeur > 0 && cout > 0 ? b.valeur - cout : null};
}

// ---------- Données : invité (cet appareil) ou compte ----------
let biens = [], scis = [], supprimes = {}, etatCompte = '', compteCharge = false, minuteur = null, enAttente = false;
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
    associes: [], banque: '', comptable: '', compta: null, notes: '', ...o};
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
  // Chaque prêt a un identifiant (regroupement dans un rachat)
  for (const b of biens) for (const p of b.prets || []) if (!p.id) p.id = uid();
  // Garage associé : « vacant » voulait dire loué ou habité avec le bien principal (statut « avec » depuis)
  for (const b of biens) {
    const p = b.lieA && biens.find(x => x.id === b.lieA);
    if (p && b.type === 'parking' && !b.avecVu && b.location.statut === 'vacant') b.location.statut = 'avec';
    if (p) b.avecVu = true;
    if (!p && b.location.statut === 'avec') b.location.statut = 'vacant';
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
// Chaque bien / SCI modifié reçoit l'heure du changement (maj) : quand plusieurs pages ou appareils écrivent dans
// le compte, on garde pour chacun la version la plus récente au lieu d'écraser tout le compte
function sauver(...modifies) {
  const t = Date.now();
  modifies.forEach(o => { if (o) o.maj = t; });
  if (!COMPTE.user) { try { localStorage.setItem(CLE, JSON.stringify(biens)); localStorage.setItem(CLE_SCI, JSON.stringify(scis)); } catch (e) { alert('Mémoire de l\'appareil pleine : enregistrement impossible.'); } return; }
  if (!compteCharge) return;   // compte pas encore lu : ne pas l'écraser
  etatCompte = 'Enregistrement…'; majEtat(); enAttente = true;
  clearTimeout(minuteur);
  minuteur = setTimeout(envoyer, 700);
}
async function envoyer() {
  if (!enAttente || !COMPTE.user) return;
  enAttente = false;
  try {
    const avant = JSON.stringify([biens, scis]);
    fusionnerDistant(await COMPTE.lire());   // ce qu'une autre page a pu enregistrer entre-temps
    await COMPTE.ecrire(contenu());
    etatCompte = 'Enregistré dans ton compte.';
    if (JSON.stringify([biens, scis]) !== avant) rafraichir();
    setTimeout(tirer, 1500);   // une autre page a pu écrire juste après nous et effacer ce changement : on vérifie
  } catch (e) { etatCompte = 'Échec de l\'enregistrement : ' + erreurCompte(e); }
  majEtat();
}
// Ce que cette page a et que le compte n'a pas (deux pages qui enregistrent en même temps : la dernière écriture
// efface celle de l'autre) : à renvoyer, sinon le changement resterait seulement sur cet appareil
function enAvance(brut) {
  if (!brut || Array.isArray(brut)) return false;
  const plus = (l, d) => { const m = new Map((Array.isArray(d) ? d : []).filter(x => x && x.id).map(x => [x.id, x.maj || 0])); return l.some(x => !m.has(x.id) || (x.maj || 0) > m.get(x.id)); };
  return plus(biens, brut.biens) || plus(scis, brut.scis) || (typeof PROJETS !== 'undefined' && plus(PROJETS.liste, brut.projets))
    || Object.keys(supprimes).some(k => !(brut.supprimes || {})[k]);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(minuteur); envoyer(); } });
// Ce qui part dans le compte : les biens et les recherches récentes de l'onglet Estimer
// Fusion bien par bien (et SCI par SCI) : la version modifiée le plus récemment gagne ; les suppressions sont gardées 6 mois
function fusionListes(locale, distante, sup) {
  const m = new Map();
  distante = (Array.isArray(distante) ? distante : []).filter(x => x && x.id);   // entrée abîmée dans le compte : écartée
  for (const x of distante) if (!sup[x.id]) m.set(x.id, x);
  for (const x of locale) { if (sup[x.id]) continue; const y = m.get(x.id); if (!y || (x.maj || 0) >= (y.maj || 0)) m.set(x.id, x); }
  return [...new Set([...locale.map(x => x.id), ...distante.map(x => x.id)])].filter(id => m.has(id)).map(id => m.get(id));
}
function fusionnerDistant(brut) {
  if (!brut || Array.isArray(brut)) return;
  const limite = Date.now() - 180 * 864e5;
  supprimes = Object.fromEntries(Object.entries({...(brut.supprimes || {}), ...supprimes}).filter(([, t]) => t > limite));
  biens = fusionListes(biens, brut.biens, supprimes);
  scis = fusionListes(scis, brut.scis, supprimes);
  normaliser();
  if (typeof PROJETS !== 'undefined' && Array.isArray(brut.projets)) { PROJETS.liste = fusionListes(PROJETS.liste, brut.projets, supprimes); PROJETS.garder(); }
  if (typeof RECENTES !== 'undefined' && brut.recherches) RECENTES.fusionner(brut.recherches, supprimes);
}
const marquerSupprime = id => { supprimes[id] = Date.now(); };
// Réaffiche après une mise à jour venue d'ailleurs, sauf pendant une saisie (pour ne pas perdre le champ en cours)
function rafraichir() {
  const a = document.activeElement;
  if (a && racine.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
  afficher();
}
// En revenant sur la page (autre onglet, autre appareil entre-temps) : on relit le compte
let lectureEnCours = false;
async function tirer() {
  if (!COMPTE.user || !compteCharge || lectureEnCours || enAttente || document.hidden) return;
  lectureEnCours = true;
  try {
    const avant = JSON.stringify([biens, scis]), brut = await COMPTE.lire();
    fusionnerDistant(brut);
    if (JSON.stringify([biens, scis]) !== avant) rafraichir();
    if (enAvance(brut)) sauver();
  } catch (e) { console.warn('Relecture du compte :', e); }
  lectureEnCours = false;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tirer(); });
window.addEventListener('focus', tirer);
setInterval(tirer, 30000);
const contenu = () => ({version: 2, biens, scis, supprimes, recherches: typeof RECENTES !== 'undefined' ? RECENTES.liste : [], projets: typeof PROJETS !== 'undefined' ? PROJETS.liste : []});
const majEtat = () => document.querySelectorAll('#invest .etat-compte').forEach(x => x.outerHTML = pastilleCompte());

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
  const st = b.location.statut, c = {...b.criteres, location: st === 'colocation' ? 'coloc' : ['meuble', 'saisonnier'].includes(st) ? 'meuble' : 'vide'};
  if (st === 'colocation' && (b.chambres || []).length >= 2) c.chambresColoc = b.chambres.length;
  if (b.annee > 1500) c.epoque = EPOQUES.find(([y]) => b.annee < y)[1];
  return c;
}
const cleEstimation = b => { if (b.type === 'parking') return JSON.stringify([b.adresse.trim(), 'parking', ...(PLACES[b.place] && b.place !== 'box' ? [b.place] : [])]); if (b.type === 'terrain') return JSON.stringify([b.adresse.trim(), 'terrain', b.surface, b.nature || '']); const c = criteresEffectifs(b); delete c.location; return JSON.stringify([b.adresse.trim(), b.type, b.surface, c]); };
const cleAncienne = b => JSON.stringify([b.adresse.trim(), b.type, b.surface, criteresEffectifs(b)]);   // estimations faites avant (location comprise)
// Loyers de marché d'une estimation : vide et meublé (les anciennes n'en ont qu'un, celui de la location d'alors)
function loyersMarche(e) {
  if (!e || e.erreur) return {};
  let loc = null; try { loc = JSON.parse(e.cle)[3].location; } catch (x) {}
  return {vide: e.loyerVide ?? (loc !== 'meuble' ? e.loyer : null), meuble: e.loyerMeuble ?? (loc === 'meuble' ? e.loyer : null), coloc: e.loyerColoc ?? null, chambres: e.chambresColoc};
}
const meubleBien = b => ['meuble', 'saisonnier', 'colocation'].includes(b.location.statut);
// Terrains : codes DVF (le filtre de l'API prend le début du code) — un terrain à bâtir se vend souvent
// 50 à 100 fois plus cher au m² qu'un pré, d'où une comparaison seulement entre terrains de même nature
const NATURE_DVF = {constructible: '21', agricole: '231', naturel: '232,233,239', loisirs: '22', stockage: '22', autre: '2'};
const placeOk = b => b.adresse.trim().length >= 5 || (b.geo && b.geo.manuel);
// Garage, box, place : estimé à l'unité (la surface d'un parking n'est presque jamais dans les actes)
const estimable = b => b.type === 'parking' ? placeOk(b) : (TYPE_DVF[b.type] || (b.type === 'terrain' && NATURE_DVF[b.nature])) && placeOk(b) && b.surface >= (b.type === 'terrain' ? 50 : 9);
function versTerrain(f) {
  const p = f.properties, prix = +p.valeurfonc, st = +p.sterr;
  if (!(prix > 500) || !(st >= 50) || +p.sbati > 0 || /^Echange|^Adjudication|^Expropriation/.test(p.libnatmut || '')) return null;
  const ring = f.geometry?.coordinates?.[0]?.[0]; if (!ring) return null;
  return {id: p.idopendata, prix, st, ppm: prix / st, date: p.datemut, code: p.codtypbien,
    lon: ring.reduce((t, c) => t + c[0], 0) / ring.length, lat: ring.reduce((t, c) => t + c[1], 0) / ring.length};
}
async function boiteTerrains(lon0, lat0, lon1, lat1, codes, anMin, conv = versTerrain) {
  let url = `${API}?in_bbox=${[lon0, lat0, lon1, lat1].map(v => v.toFixed(5)).join(',')}&codtypbien=${codes}&anneemut_min=${anMin}&page_size=500`;
  const out = [];
  for (let k = 0; url && k < 6; k++) { const js = await getJSON(url); out.push(...js.features.map(conv).filter(Boolean)); url = js.next; }
  return out;
}
const medianePonderee = (l, q = 0.5) => {
  const t = [...l].sort((a, b) => a[0] - b[0]), tot = t.reduce((s, x) => s + x[1], 0);
  let c = 0; for (const [v, w] of t) { c += w; if (c >= tot * q) return v; } return t.length ? t[t.length - 1][0] : null;
};
async function estimerTerrain(lat, lon, surf, nature) {
  const codes = NATURE_DVF[nature], kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, an = new Date().getFullYear();
  let comps = [], periode = 5, rayon = 0;
  for (const p of [5, 10]) {
    periode = p;
    const vus = new Map();
    for (const boites of searchSteps(lat, lon)) {
      for (const v of (await Promise.all(boites.map(bx => boiteTerrains(...bx, codes, an - p)))).flat()) {
        if (vus.has(v.id)) continue;
        v.d = Math.hypot((v.lon - lon) * kx, (v.lat - lat) * ky);
        if (v.d <= 12000) vus.set(v.id, v);
      }
      comps = [...vus.values()].filter(v => v.st / surf > 1 / 3 && v.st / surf < 3);
      if (comps.length >= 20) break;
    }
    if (comps.length >= 10) break;
  }
  if (comps.length < 3) return {erreur: `Pas assez de ventes de terrains ${nature === 'autre' ? '' : 'de cette nature '}autour (${comps.length} en 10 ans, surface proche). Renseigne la valeur à la main.`};
  // Agricole / naturel : le cadastre classe « terre et pré » des parcelles achetées pour bâtir (zones à urbaniser),
  // vendues 20 à 100 fois plus cher. On écarte les ventes au-delà du quart du prix des terrains à bâtir du secteur.
  let ecartees = 0, seuil = null;
  if (['agricole', 'naturel'].includes(nature)) {
    const tab = new Map();
    for (const boites of searchSteps(lat, lon)) {
      for (const v of (await Promise.all(boites.map(bx => boiteTerrains(...bx, NATURE_DVF.constructible, an - 5)))).flat()) tab.set(v.id, v);
      if (tab.size >= 15) break;
    }
    const tabMed = tab.size >= 5 ? medianePonderee([...tab.values()].map(v => [v.ppm, 1])) : null;
    seuil = tabMed ? tabMed / 4 : 30;
    const avant = comps.length;
    comps = comps.filter(v => v.ppm <= seuil);
    ecartees = avant - comps.length;
    if (comps.length < 3) return {erreur: `Pas assez de ventes de terrains ${NATURES[nature].toLowerCase()}s non constructibles autour (${comps.length}). Renseigne la valeur à la main.`};
  }
  // Poids : plus proche, surface plus semblable et vente plus récente = plus de poids ; puis on écarte les prix aberrants
  const poids = v => 1 / (1 + v.d / 1500) / (1 + Math.abs(Math.log(v.st / surf))) / (1 + Math.max(0, an - +v.date.slice(0, 4)) / 6);
  let l = comps.map(v => [v.ppm, poids(v), v]);
  const m0 = medianePonderee(l);
  l = l.filter(([x]) => x > m0 / 3 && x < m0 * 3);
  const med = medianePonderee(l), lo = medianePonderee(l, 0.25), hi = medianePonderee(l, 0.75);
  rayon = Math.max(...l.map(x => x[2].d));
  const disp = hi / Math.max(lo, 1e-9);
  return {prix: Math.round(med * surf), lo: Math.round(lo * surf), hi: Math.round(hi * surf), ppm: med, ventes: l.length, rayon: Math.round(rayon),
    periode: `${an - periode}–${an}`, terrain: true, ecartees, seuil: seuil && Math.round(seuil),
    fiabilite: nature === 'autre' ? 'Fiabilité faible (toutes natures mêlées)' : l.length >= 20 && disp < 3 ? 'Fiabilité bonne' : l.length >= 8 && disp < 5 ? 'Fiabilité moyenne' : 'Fiabilité faible'};
}
// Garages, box et places vendus seuls (DVF : « dépendance », code 13) : prix à l'unité, ventes d'une seule dépendance
// Les actes ne disent pas si c'est un box ou une simple place : la médiane des ventes vaut pour un box ou un garage fermé
// (l'essentiel des dépendances vendues seules) ; une place couverte vaut ≈ 75 % d'un box, une place extérieure ≈ 15 %
// (place couverte : écart des loyers Parkto à Paris ; place extérieure : très en dessous en province, où une place
// à ciel ouvert au pied d'un immeuble se trouve facilement et se revend presque rien)
const PLACES = {box: {l: 'Box ou garage fermé', f: 1}, couverte: {l: 'Place couverte / en sous-sol', f: 0.75}, ext: {l: 'Place extérieure', f: 0.15}};
// Type de place d'après le stationnement coché sur un appartement (ext, 1, box, 2) ou une maison (oui, place)
const placeDe = v => ({ext: 'ext', place: 'ext', '1': 'couverte', '2': 'couverte', box: 'box', oui: 'box'})[v] || 'box';
function versDependance(f) {
  const p = f.properties, prix = +p.valeurfonc;
  if (!(prix >= 1000 && prix <= 250000) || /^Echange|^Adjudication|^Expropriation/.test(p.libnatmut || '')) return null;
  if (p.codtypbien && !/^13/.test(String(p.codtypbien))) return null;
  if (/^132/.test(String(p.codtypbien || ''))) return null;   // plusieurs dépendances dans la même vente : prix d'un lot
  const ring = f.geometry?.coordinates?.[0]?.[0]; if (!ring) return null;
  return {id: p.idopendata, prix, date: p.datemut, garage: /^1311/.test(String(p.codtypbien || '')),
    lon: ring.reduce((t, c) => t + c[0], 0) / ring.length, lat: ring.reduce((t, c) => t + c[1], 0) / ring.length};
}
async function estimerDependance(lat, lon, place = 'box') {
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, an = new Date().getFullYear();
  let comps = [], periode = 5;
  for (const p of [5, 10]) {
    periode = p;
    const vus = new Map();
    for (const boites of searchSteps(lat, lon)) {
      for (const v of (await Promise.all(boites.map(bx => boiteTerrains(...bx, '13', an - p, versDependance)))).flat()) {
        if (vus.has(v.id)) continue;
        v.d = Math.hypot((v.lon - lon) * kx, (v.lat - lat) * ky);
        if (v.d <= 8000) vus.set(v.id, v);
      }
      comps = [...vus.values()];
      if (comps.length >= 25) break;
    }
    if (comps.length >= 10) break;
  }
  if (comps.length < 3) return {erreur: `Pas assez de garages ou parkings vendus seuls autour (${comps.length} en 10 ans). Renseigne la valeur à la main.`};
  return {...valeurDependance(comps, an, place), periode: `${an - periode}–${an}`};
}
// Même estimation, autre type de place (prix et fourchette ramenés d'un facteur à l'autre)
function replacer(e, place) {
  const f = (PLACES[place] || PLACES.box).f / (PLACES[e.place] || PLACES.box).f;
  const arr = x => { const v = x * f, pas = v < 5000 ? 100 : 500; return Math.max(pas, Math.round(v / pas) * pas); };
  return {...e, prix: arr(e.prix), lo: arr(e.lo), hi: arr(e.hi), place: PLACES[place] ? place : 'box'};
}
function valeurDependance(comps, an, place = 'box') {
  // Plus proche et plus récent = plus de poids ; puis on écarte les prix aberrants (lots mal saisis, places de stationnement d'un ensemble)
  const poids = v => 1 / (1 + v.d / 600) / (1 + Math.max(0, an - +v.date.slice(0, 4)) / 5);
  let l = comps.map(v => [v.prix, poids(v), v]);
  const m0 = medianePonderee(l);
  l = l.filter(([x]) => x > m0 / 3 && x < m0 * 3);
  const med = medianePonderee(l), lo = medianePonderee(l, 0.25), hi = medianePonderee(l, 0.75), rayon = Math.max(...l.map(x => x[2].d));
  const disp = hi / Math.max(lo, 1), f = (PLACES[place] || PLACES.box).f;
  const arr = x => { const v = x * f, pas = v < 5000 ? 100 : 500; return Math.max(pas, Math.round(v / pas) * pas); };
  return {prix: arr(med), lo: arr(lo), hi: arr(hi), ventes: l.length, rayon: Math.round(rayon), place: PLACES[place] ? place : 'box', dependance: true, comps: l.sort((a, b) => b[1] - a[1]).slice(0, 25).map(([, w, v]) => ({prix: v.prix, date: v.date, d: Math.round(v.d), lat: v.lat, lon: v.lon, w})),
    fiabilite: l.length >= 20 && disp < 1.8 ? 'Fiabilité bonne' : l.length >= 8 && disp < 2.5 ? 'Fiabilité moyenne' : 'Fiabilité faible'};
}
const enCours = new Set();
async function estimerBien(b0) {
  let b = b0;
  if (!estimable(b) || enCours.has(b.id)) return;
  const cle = cleEstimation(b);
  enCours.add(b.id); majAuto(b);
  const le = new Date().toISOString().slice(0, 10);
  try {
    if (!b.geo || (!b.geo.manuel && b.geo.pour !== b.adresse.trim())) {
      const f = (await geocode(b.adresse.trim()))[0];
      if (!f) throw new Error('Adresse introuvable : place le bien sur la carte (sous l\'adresse), ou ajoute la ville ou le code postal.');
      b.geo = {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label, pour: b.adresse.trim()};
    }
    const res = b.type === 'parking' ? await estimerDependance(b.geo.lat, b.geo.lon, b.place)
      : b.type === 'terrain' ? await estimerTerrain(b.geo.lat, b.geo.lon, b.surface, b.nature)
      : await moteur.estimer({lat: b.geo.lat, lon: b.geo.lon, type: TYPE_DVF[b.type], surf: b.surface, criteres: criteresEffectifs(b)});
    // Garage associé loué avec le bien (pas de loyer à lui) : valeur sans le garage, loyers de marché avec
    const g = garageLoueAvec(b);
    if (g && !res.erreur && TYPE_DVF[b.type]) {
      const crit = criteresEffectifs(b), cle = b.type === 'appart' ? 'parking' : 'garage';
      crit[cle] = b.parkingAssocie || (b.type === 'appart' ? 'box' : 'oui');
      const r2 = await moteur.estimer({lat: b.geo.lat, lon: b.geo.lon, type: TYPE_DVF[b.type], surf: b.surface, criteres: crit}).catch(() => null);
      if (r2 && !r2.erreur) { for (const k of ['loyer', 'loyerVide', 'loyerMeuble', 'loyerColoc']) res[k] = r2[k]; res.loyerAvec = g.nom; }
    }
    // Le bien a pu être remplacé entre-temps par sa version du compte (autre page) : on écrit dans la version actuelle
    const geo = b.geo; b = biens.find(x => x.id === b.id) || b; if (!b.geo || b.geo.pour !== geo.pour) b.geo = geo;
    delete res.comps;
    b.estimation = res.erreur ? {erreur: res.erreur, cle, le} : {...res, cle, le};
    if (!res.erreur && !b.valeurManuelle) { b.valeur = res.prix; b.valeurLe = moisCourant(); }
  } catch (e) {
    b.estimation = {erreur: e.message === 'trop long' ? 'L\'estimation a pris trop de temps (le service des ventes répond mal). Réessaie dans un instant.' : e.message || String(e), cle, le};
  } finally {
    enCours.delete(b.id);
  }
  sauver(b);
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
  const e = b.estimation, a_jour = e && (e.cle === cleEstimation(b) || e.cle === cleAncienne(b)), btn = racine.querySelector('#inv_estimer');
  // Le bouton en bas des caractéristiques : seul moyen de lancer l'estimation
  if (btn) {
    btn.disabled = !estimable(b) || enCours.has(b.id);
    btn.textContent = enCours.has(b.id) ? 'Estimation en cours…' : !estimable(b) ? (b.type === 'terrain' && !NATURE_DVF[b.nature] ? 'Estimer ce terrain (choisis sa nature)' : b.type === 'parking' ? 'Estimer ce garage (adresse à remplir)' : 'Estimer ce bien (adresse et surface à remplir)') : e && !e.erreur && a_jour ? 'Estimer à nouveau' : 'Estimer ce bien';
  }
  let h;
  if (b.type === 'terrain' && !NATURE_DVF[b.nature]) h = '<div class="aide">Choisis la nature du terrain (constructible, agricole…) : l\'estimation compare avec les ventes de terrains de même nature, dont les prix au m² n\'ont rien à voir d\'une nature à l\'autre.</div>';
  else if (!TYPE_DVF[b.type] && b.type !== 'terrain' && b.type !== 'parking') h = '<div class="aide">Estimation automatique disponible pour les appartements, les maisons, les terrains et les garages : renseigne la valeur à la main.</div>';
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
  else if (e.dependance) {
    h = `<div class="auto-res${a_jour ? '' : ' perime'}">
      <div class="auto-chiffres"><div><span>Valeur estimée</span><b>${kEur(e.prix)}</b><small>${kEur(e.lo)} – ${kEur(e.hi)}</small></div>
        <div><span>Ventes comparées</span><b>${e.ventes}</b><small>garages, box et places vendus seuls, à moins de ${dist(e.rayon)}</small></div>
</div>
      ${mini([['Fiabilité', esc(e.fiabilite.replace(/^Fiabilité /, ''))], ['Période', e.periode], ['Estimé le', new Date(e.le).toLocaleDateString('fr-FR')]], 'petit')}
      <div class="aide">Ventes de garages, box et places mêlés (les actes ne disent pas lequel) : valeur ramenée à ${e.place === 'ext' ? 'une place extérieure (≈ 15 % d\'un box)' : e.place === 'couverte' ? 'une place couverte (≈ 75 % d\'un box)' : 'un box ou garage fermé'}. Change le type de place au-dessus si besoin.</div>
      ${b.valeurManuelle ? `<button data-a="valeurAuto">Utiliser cette valeur (${kEur(e.prix)})</button>` : '<div class="aide">La valeur du bien reprend cette estimation (tu peux la remplacer à la main).</div>'}
    </div>
    ${!a_jour ? '<div class="aide">Adresse modifiée depuis cette estimation : clique sur « Estimer ce bien » pour la mettre à jour.</div>' : ''}`;
  }
  else if (e.terrain) {
    h = `<div class="auto-res${a_jour ? '' : ' perime'}">
      <div class="auto-chiffres"><div><span>Valeur estimée</span><b>${kEur(e.prix)}</b><small>${kEur(e.lo)} – ${kEur(e.hi)}</small></div>
        <div><span>Prix au m²</span><b>${e.ppm >= 10 ? fmt(e.ppm) : e.ppm.toFixed(2).replace('.', ',')} €</b><small>médiane des ventes ${NATURES[b.nature] ? 'de terrains « ' + NATURES[b.nature].toLowerCase() + ' »' : ''}</small></div>
</div>
      ${mini([['Fiabilité', esc(e.fiabilite.replace(/^Fiabilité /, ''))], ['Ventes comparées', `${e.ventes} à moins de ${dist(e.rayon)}`], ['Période', e.periode], ['Estimé le', new Date(e.le).toLocaleDateString('fr-FR')]], 'petit')}
      <div class="aide">${e.ecartees ? `${e.ecartees} vente${e.ecartees > 1 ? 's' : ''} au-dessus de ${fmt(e.seuil)} €/m² écartée${e.ecartees > 1 ? 's' : ''} (parcelles achetées pour construire). ` : ''}À confirmer par un notaire ou une agence : accès, vue, viabilisation et zonage comptent beaucoup.</div>
      ${b.valeurManuelle ? `<button data-a="valeurAuto">Utiliser cette valeur (${kEur(e.prix)})</button>` : '<div class="aide">La valeur du bien reprend cette estimation (tu peux la remplacer à la main).</div>'}
    </div>
    ${!a_jour ? '<div class="aide">Surface ou nature modifiée depuis cette estimation : clique sur « Estimer ce bien » pour la mettre à jour.</div>' : ''}`;
  }
  else {
    // Bien loué : on met en avant le loyer de sa location (vide ou meublé) ; sinon (habité, vacant…) aucun des deux
    const loue = LOUE.includes(b.location.statut), L = loyersMarche(e), m = meubleBien(b);
    const ref = m ? L.meuble ?? L.vide : L.vide ?? L.meuble;
    h = `<div class="auto-res${a_jour ? '' : ' perime'}">
      <div class="auto-chiffres"><div><span>Valeur estimée</span><b>${kEur(e.prix)}</b><small>${kEur(e.lo)} – ${kEur(e.hi)}</small></div>
        ${ref ? `<div><span>Loyer de marché</span><div class="deux-loyers egaux"><div><small>Vide</small><b>${L.vide != null ? eur(L.vide) : '—'}</b></div><div><small>Meublé</small><b>${L.meuble != null ? eur(L.meuble) : '—'}</b></div>${L.coloc ? `<div><small>Coloc. ${L.chambres} ch.</small><b>${eur(L.coloc)}</b></div>` : ''}</div><small>hors charges/mois${e.loyerAvec ? ` · avec ${esc(e.loyerAvec)}, loué avec le bien` : ''}${L.vide == null || L.meuble == null ? ' · réestime pour avoir les deux' : L.coloc ? ` · ${eur(L.coloc / L.chambres)} par chambre en colocation` : ''}</small></div>` : ''}</div>
      ${mini([['Fiabilité', esc(e.fiabilite.replace(/^Fiabilité /, ''))], ['Ventes comparées', `${e.ventes} à moins de ${dist(e.rayon)}`], ['Estimé le', new Date(e.le).toLocaleDateString('fr-FR')]], 'petit')}
      ${b.location.statut === 'saisonnier' && L.meuble && loyerLogement(b) ? (net => `<div class="aide">À la nuitée : ${eur(loyerLogement(b))} de recettes par mois, ${eur(net)} après frais, soit ${pct(net / L.meuble - 1)} par rapport au meublé classique du marché (${eur(L.meuble)} hors charges).</div>`)(loyerLogement(b) * (1 - (b.location.fraisSaison || 0) / 100)) : ''}
      ${(rf => loue && rf && loyerLogement(b) && !['lots', 'saisonnier'].includes(b.location.statut) ? `<div class="aide">Ton loyer : ${eur(loyerLogement(b))}, soit ${pct(loyerLogement(b) / rf - 1)} par rapport au marché ${b.location.statut === 'colocation' ? 'en colocation' : m ? 'meublé' : 'vide'}.</div>` : '')(b.location.statut === 'colocation' && L.coloc ? L.coloc : ref)}
      ${b.valeurManuelle ? `<button data-a="valeurAuto">Utiliser cette valeur (${kEur(e.prix)})</button>` : '<div class="aide">La valeur du bien reprend cette estimation (tu peux la remplacer à la main).</div>'}
    </div>
    ${!a_jour ? '<div class="aide">Caractéristiques modifiées depuis cette estimation : clique sur « Estimer ce bien » pour la mettre à jour.</div>' : ''}`;
  }
  el.innerHTML = h;
}

// ---------- Passage invité ↔ compte ----------
COMPTE.surChangement(async user => {
  compteCharge = false; urls.clear();
  if (!user) {
    etatCompte = ''; biens = biensLocaux(); scis = scisLocales(); normaliser();
    // Les projets n'existent qu'avec un compte, et les recherches ont été versées dans le compte : à la déconnexion on les
    // retire de l'appareil, sinon la prochaine connexion (un autre compte) les fusionnerait dans le sien
    if (typeof PROJETS !== 'undefined') { PROJETS.liste = []; PROJETS.garder(); if (typeof fixerProjet === 'function') fixerProjet(null); }
    if (typeof RECENTES !== 'undefined') { RECENTES.liste = []; RECENTES.garder(); }
    supprimes = {};
    return afficher();
  }
  etatCompte = 'Chargement de ton compte…'; afficher();
  try {
    const brut = await COMPTE.lire();
    let distants = depuisCompte(brut);
    const nRech = brut && Array.isArray(brut.recherches) ? brut.recherches.length : 0, nProj = brut && Array.isArray(brut.projets) ? brut.projets.length : 0;
    if (typeof RECENTES !== 'undefined') RECENTES.fusionner(brut && brut.recherches, brut && brut.supprimes);
    if (!distants) {   // premier passage : proposer de reprendre ce qui est sur cet appareil (fichiers compris)
      const locaux = biensLocaux(), scisLoc = scisLocales();
      distants = locaux.length && confirm(`Mettre dans ton compte ${locaux.length > 1 ? `les ${locaux.length} biens enregistrés` : 'le bien enregistré'} sur cet appareil ?`) ? locaux : [];
      for (const b of distants) for (const d of b.docs.filter(d => d.local)) {
        try { const blob = await idbFaire('readonly', s => s.get(d.id)); if (blob) await envoyerDoc(b, d, blob); } catch (e) { console.warn(erreurDocs(e)); }
      }
      biens = distants; scis = distants.length ? scisLoc : []; normaliser(); await COMPTE.ecrire(contenu());
    }
    if (brut && Array.isArray(brut.scis)) scis = brut.scis;
    supprimes = brut && brut.supprimes ? brut.supprimes : {};
    biens = distants; normaliser(); compteCharge = true; etatCompte = 'Enregistré dans ton compte.';
    if (typeof PROJETS !== 'undefined') { PROJETS.liste = fusionListes(PROJETS.liste, brut && brut.projets, supprimes); PROJETS.garder(); }
    if ((typeof RECENTES !== 'undefined' && RECENTES.liste.length !== nRech) || (typeof PROJETS !== 'undefined' && PROJETS.liste.length !== nProj)) sauver();   // recherches et projets de cet appareil à ajouter au compte
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
const STATUTS = {vide: 'Loué vide', meuble: 'Loué meublé', colocation: 'Loué en colocation', lots: 'Plusieurs loyers (bien divisé, annexe…)', saisonnier: 'Location saisonnière', avec: 'Va avec le bien principal', vacant: 'Vacant', rp: 'Résidence principale', secondaire: 'Résidence secondaire', travaux: 'En travaux'};
const mini = (items, cls = '') => {
  const l = items.filter(x => x && x[1] != null && x[1] !== '');
  return l.length ? `<div class="mini ${cls}">${l.map(([k, v, c]) => `<div><span>${k}</span><b class="${c || ''}">${v}</b></div>`).join('')}</div>` : '';
};
const dist = m => m < 1000 ? fmt(m) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const kpi = (k, v, d, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const signe = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
// Pastille à droite de l'œil : verte (coche) quand le compte est connecté et enregistré, rouge (croix) sinon
const COCHE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const erreurEtat = () => /^(Échec|Impossible)/.test(etatCompte);
function pastilleCompte() {
  const co = !!COMPTE.user, ok = co && !erreurEtat(), enCours = /…$/.test(etatCompte);
  const texte = !co ? 'Non connecté : tes biens restent sur cet appareil. Cliquer pour se connecter.' : ok ? 'Connecté' + (etatCompte ? ' : ' + etatCompte.replace(/\.$/, '') : '') : etatCompte;
  return `<button class="etat-compte ${ok ? 'ok' : 'ko'}${enCours ? ' en-cours' : ''}" data-a="etatCompte" title="${esc(texte)}" aria-label="${esc(texte)}">${ok ? COCHE : CROIX}</button>`;
}
let ouvert = null, filtre = 'tout';   // bien ou SCI (« sci:<id> ») affiché en détail ; détenteur filtré dans la liste

// Le bien ou la SCI ouvert est celui de l'adresse de la page (#investissements/<id>) : quand les données du compte
// arrivent après coup, on rouvre bien la fiche demandée au lieu d'afficher la liste avec une adresse de fiche
function idDuHash() {
  const [t, sous] = location.hash.slice(1).split('/');
  return (t === 'investissements' || t === 'credits') && sous ? decodeURIComponent(sous) : null;
}
// ---------- Carte de la fiche : placer le bien à la main quand l'adresse n'est pas trouvée ----------
// Mode discret : tous les montants floutés, pour montrer le site sans dévoiler ses chiffres (réglage gardé sur l'appareil)
let discret = false;
try { discret = localStorage.getItem('montants-masques') === '1'; } catch (e) {}
document.body.classList.toggle('discret', discret);
const OEIL = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OEIL_BARRE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
// Œil ouvert : montants visibles (un clic les floute) ; œil barré : montants floutés (un clic les affiche)
const boutonDiscret = () => `<button class="discret-btn" data-a="discret" aria-pressed="${discret}" aria-label="${discret ? 'Afficher les montants' : 'Flouter les montants'}" title="${discret ? 'Montants floutés : cliquer pour les afficher' : 'Flouter les montants (pour montrer le site)'}">${discret ? OEIL_BARRE : OEIL}</button>`;
let carteBien = null;
const venteOuverte = new Set();   // fiches où la simulation de vente est ouverte (le temps de la visite)
function aideCarte(b) {
  if (!b.geo) return 'Adresse introuvable ? Clique sur la carte à l\'endroit du bien.';
  const pres = b.geo.label ? `, près de ${esc(b.geo.label)}` : '';
  return (b.geo.manuel ? `Placé sur la carte${pres}.` : `Adresse reconnue : ${esc(b.geo.label)}.`) + ' Clique ou fais glisser le repère pour corriger.';
}
function initCarte(b) {
  if (carteBien) { carteBien.remove(); carteBien = null; }
  const el = racine.querySelector('#inv_carte'); if (!el || typeof L === 'undefined') return;
  const g = b.geo;
  carteBien = L.map(el, {scrollWheelZoom: false}).setView(g ? [g.lat, g.lon] : [46.6, 2.4], g ? 16 : 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'}).addTo(carteBien);
  carteBien.attributionControl.setPrefix(false);   // pas de lien « Leaflet » qui ferait quitter le site d'un doigt
  let repere = null;
  const placer = async ll => {
    if (!repere) repere = L.marker(ll, {draggable: true}).addTo(carteBien).on('dragend', e => placer(e.target.getLatLng()));
    else repere.setLatLng(ll);
    let label = '';
    try { const f = (await getJSON(`https://data.geopf.fr/geocodage/reverse?lon=${ll.lng}&lat=${ll.lat}&limit=1`)).features[0]; if (f) label = f.properties.label; } catch (e) {}
    const c = biens.find(x => x.id === b.id) || b;
    if (!c.adresse.trim() && label) { c.adresse = label; const a = racine.querySelector('#inv_adresse'); if (a) a.value = label; }
    c.geo = {lat: ll.lat, lon: ll.lng, label, pour: c.adresse.trim(), manuel: true};
    sauver(c);
    const aide = racine.querySelector('#inv_carteAide'); if (aide) aide.innerHTML = aideCarte(c);
    majAuto(c);
  };
  if (g) repere = L.marker([g.lat, g.lon], {draggable: true}).addTo(carteBien).on('dragend', e => placer(e.target.getLatLng()));
  carteBien.on('click', e => placer(e.latlng));
  // Pas encore de point : on centre au moins sur ce que le géocodage comprend de l'adresse (la ville, souvent)
  if (!g && b.adresse.trim().length >= 3) geocode(b.adresse.trim()).then(f => { if (f[0] && carteBien && !repere) carteBien.setView([f[0].geometry.coordinates[1], f[0].geometry.coordinates[0]], 15); }).catch(() => {});
  setTimeout(() => carteBien && carteBien.invalidateSize(), 60);
}
function afficher(id = idDuHash()) {
  if (carteBien) { carteBien.remove(); carteBien = null; }
  const sci = id && id.startsWith('sci:') ? scis.find(x => x.id === id.slice(4)) : null;
  ouvert = sci ? id : id && biens.some(b => b.id === id) ? id : null;
  if (sci) vueSci(sci); else if (ouvert) vueDetail(biens.find(b => b.id === ouvert)); else vueListe();
  if (window.CF_APP && CF_APP.majScis) CF_APP.majScis();   // la liste « Dans quelle SCI » de Financer suit les SCI
}
// Totaux d'un ensemble de biens (patrimoine net : seulement sur les biens dont la valeur est renseignée)
// Part du bien détenue (indivision, bien à plusieurs…) : 100 % par défaut
const partDe = b => Math.max(1, Math.min(100, b.part || 100)) / 100;
// Biens vendus (vente enregistrée) : gardés pour mémoire, hors des totaux
const detenus = () => biens.filter(b => !b.vendu);
function totaux(liste) {
  const cs = liste.map(calculs), avec = liste.map((b, i) => [b, cs[i], partDe(b)]), estimes = avec.filter(([b]) => b.valeur > 0);
  const V = somme(estimes, ([b, , k]) => b.valeur * k), Dv = somme(estimes, ([, c, k]) => c.crd * k), D = somme(avec, ([, c, k]) => c.crd * k);
  const aAmenager = liste.filter(b => b.amenag && !b.amenag.fait).length;   // espace pas encore fait : compris dans son bien principal
  return {cs, V, D, net: V - Dv, manque: liste.length - aAmenager - estimes.length, n: liste.length - aAmenager, nEst: estimes.length,
    loyers: somme(avec, ([, c, k]) => c.loyerMois * k), cf: somme(avec, ([, c, k]) => c.cfMois * k), partiel: avec.some(([, , k]) => k < 1),
    mois: {loyer: somme(avec, ([, c, k]) => c.loyersAn / 12 * k), credit: somme(avec, ([, c, k]) => c.creditAn / 12 * k), charges: somme(avec, ([, c, k]) => c.chargesAn / 12 * k)}};
}
// Mode simple (interrupteur Simple / Pro du haut de page) : loyer, crédit, charges et ce qu'il reste, en moyenne par mois
const simple = () => typeof modeSimple === 'function' && modeSimple();
const moisDe = (c, k = 1) => ({loyer: c.loyersAn / 12 * k, credit: c.creditAn / 12 * k, charges: c.chargesAn / 12 * k, reste: c.cfMois * k});
function kpisTotaux(t) {
  if (simple()) return `${t.partiel ? '<div class="aide parts">Totaux calculés sur tes parts (biens détenus en partie).</div>' : ''}${bilanSimple({...t.mois, reste: t.cf}, {titre: 'Tous tes biens, chaque mois', libLoyer: 'Loyers', plusieurs: t.n > 1, note: 'Moyenne par mois sur les 12 prochains mois, avant impôts.'})}
    <div class="kpis deux">${kpi('Valeur de tes biens', t.V ? kEur(t.V) : '—', t.V ? (t.manque ? `sur ${t.nEst} bien${t.nEst > 1 ? 's' : ''} estimé${t.nEst > 1 ? 's' : ''}` : 'estimée') : 'à renseigner')}${kpi('Ce qui est à toi', t.V ? kEur(t.net) : '—', 'valeur − ce qu\'il reste à rembourser', t.V ? signe(t.net) : '')}</div>`;
  const sur = t.manque ? `sur ${t.nEst} bien${t.nEst > 1 ? 's' : ''} estimé${t.nEst > 1 ? 's' : ''}` : '';
  return `${t.partiel ? '<div class="aide parts">Totaux calculés sur tes parts (biens détenus en partie).</div>' : ''}<div class="kpis six">${kpi('Biens', t.n, t.manque ? `${t.manque} sans valeur` : '')}${kpi('Valeur', t.V ? kEur(t.V) : '—', t.V ? sur || 'estimée' : 'à renseigner')}
    ${kpi('Restant dû', kEur(t.D), t.V && !t.manque ? Math.round(t.D / t.V * 100) + ' % de la valeur' : 'tous crédits')}
    ${kpi('Patrimoine net', t.V ? kEur(t.net) : '—', t.V ? sur || 'valeur − restant dû' : 'renseigne la valeur des biens', t.V ? signe(t.net) : '')}
    ${kpi('Loyers', eur(t.loyers), 'par mois')}${kpi('Cash-flow', eur(t.cf), 'par mois, avant impôts', signe(t.cf))}</div>`;
}
const ICONE_SCI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-4h6v4M9 10h6M9 13.5h6"/></svg>';

function vueListe() {
  const est = typeof estimationCourante === 'function' ? estimationCourante() : null;
  if (filtre !== 'tout' && filtre !== 'np' && !scis.some(x => x.id === filtre)) filtre = 'tout';
  let h = `<div class="invhead"><div class="titre-discret"><h1>Mon patrimoine</h1>${boutonDiscret()}${pastilleCompte()}</div><div class="actions">
      ${est ? `<button data-a="ajoutEst" title="${esc(est.label)}">+ Ajouter le bien estimé</button>` : ''}
      <button data-a="ajoutSci">+ Créer une SCI</button>
      <button class="primaire" data-a="ajout">+ Ajouter un bien</button></div></div>`;
  if (biens.length || scis.length) {
    const actifs = detenus(), vendus = biens.filter(b => b.vendu);
    const montres = actifs.filter(b => !enProjet(b));   // espace pas encore aménagé : seulement dans Mes projets (et la fiche de son bien)
    h += kpisTotaux(totaux(actifs));
    if (scis.length) h += pli('scis', 'Mes SCI', scis.length, `<div class="scis">${scis.map(x => {
      const t = totaux(actifs.filter(b => b.sciId === x.id && b.structure === 'sci'));
      return `<a class="sci" href="#investissements/sci:${encodeURIComponent(x.id)}"><div class="ico">${ICONE_SCI}</div>
        <div class="infos"><b>${esc(x.nom)}</b><span>SCI ${REGIMES[x.regime]} · ${t.n} bien${t.n > 1 ? 's' : ''}${x.associes.length ? ` · ${x.associes.length} associé${x.associes.length > 1 ? 's' : ''}` : ''}</span></div>
        <div class="chiffres"><div><span>Patrimoine net</span><b class="${t.V ? signe(t.net) : ''}">${t.V ? kEur(t.net) : '—'}</b></div><div><span>Cash-flow</span><b class="${signe(t.cf)}">${t.n ? eur(t.cf) + '/mois' : '—'}</b></div></div>
        <span class="chev" aria-hidden="true">›</span></a>`;
    }).join('')}</div>`);
    // Filtre par détenteur
    const n = f => montres.filter(b => f === 'tout' || (f === 'np' ? b.structure !== 'sci' : b.sciId === f && b.structure === 'sci')).length;
    const choix = [['tout', 'Tous'], ['np', 'Nom propre'], ...scis.map(x => [x.id, x.nom])].filter(([f]) => f === 'tout' || n(f));
    const visibles = montres.filter(b => filtre === 'tout' || (filtre === 'np' ? b.structure !== 'sci' : b.sciId === filtre && b.structure === 'sci'));
    const filtres = choix.length > 2 ? `<div class="filtres">${choix.map(([f, l]) => `<button data-a="filtre" data-f="${esc(f)}" class="${f === filtre ? 'on' : ''}">${esc(l)} <span>${n(f)}</span></button>`).join('')}</div>` : '';
    h += pli('biens', 'Mes biens', montres.length, filtres + (visibles.length ? `<div class="liste">${listeBiens(visibles)}</div>` : '<div class="aide">Aucun bien ici pour l\'instant.</div>'));
    if (vendus.length) h += pli('vendus', 'Biens vendus', vendus.length, `<div class="liste">${vendus.map(carteVendue).join('')}</div>`);
    h += arbreHTML();
  } else {
    h += `<div class="vide"><div class="ico">${icone('maison')}</div><h2>Ajoute ton premier investissement</h2>
      <p>Pour chaque bien : l'achat, le crédit, la location, les charges, et les plans. Le cash-flow et ce qu'il reste à rembourser se calculent tout seuls. Tes SCI ont aussi leur fiche, avec leurs biens et leurs associés.</p>
      <div class="boutons centre"><button data-a="ajoutSci">+ Créer une SCI</button><button class="primaire" data-a="ajout">+ Ajouter un bien</button></div></div>`;
  }
  racine.innerHTML = h;
  vignettes(); centrerOrg();
}
// Organigramme du patrimoine : moi → nom propre et chaque SCI (avec ses associés) → leurs biens (montants à hauteur de la part détenue)
function arbreHTML() {
  const biens = detenus().filter(b => !enProjet(b));
  if (!biens.length) return '';
  const chiffres = (net, cf) => `<span class="chiffres-arbre">${net != null ? `<span>net <b class="${signe(net)}">${kEur(net)}</b></span>` : ''}${cf != null ? `<span><b class="${signe(cf)}">${eur(cf)}/mois</b></span>` : ''}</span>`;
  const tot = t => chiffres(t.V ? t.net : null, t.n ? t.cf : null);
  const feuille = (b, i, l) => {
    const c = calculs(b), k = partDe(b), enfants = l.filter(x => x.lieA === b.id && x !== b);
    if (b.lieA && l.some(x => x.id === b.lieA)) return '';   // dessiné sous son bien principal
    return `<li><a class="noeud bien-n" href="#investissements/${encodeURIComponent(b.id)}"><span class="ico-n">${icone(b.type)}</span>
      <span class="nom-n">${esc(b.nom)}</span>${k < 1 ? `<small>${Math.round(k * 100)} %</small>` : ''}
      ${chiffres(c.patrimoine != null ? c.patrimoine * k : null, c.loue || c.mensuCredit ? c.cfMois * k : null)}</a>${enfants.length ? `<ul class="annexes-n">${enfants.map(annexeNoeud).join('')}</ul>` : ''}</li>`;
  };
  // Bien associé (garage…) : petite étiquette sous son bien principal
  const annexeNoeud = x => { const c = calculs(x), k = partDe(x), v = c.patrimoine != null ? c.patrimoine * k : null;
    return `<li><a class="noeud annexe-n" href="#investissements/${encodeURIComponent(x.id)}"><span class="ico-n">${icone(x.type)}</span><span class="nom-n">${esc(x.nom)}</span>${v != null ? `<b class="${signe(v)}">${kEur(v)}</b>` : ''}</a></li>`; };
  const branches = [];
  const np = biens.filter(b => b.structure !== 'sci');
  if (np.length) branches.push(`<li><span class="noeud groupe"><span class="ico-n">${OEIL_PERSO}</span><span class="nom-n">En nom propre</span>${tot(totaux(np))}</span>
    <ul>${np.map(feuille).join('')}</ul></li>`);
  for (const x of scis) {
    const sb = biens.filter(b => b.structure === 'sci' && b.sciId === x.id);
    const assoc = x.associes.filter(a => a.nom || a.parts).map(a => `${esc(a.nom || 'Associé')}${a.parts ? ' ' + String(a.parts).replace('.', ',') + ' %' : ''}`).join(', ');
    branches.push(`<li><a class="noeud groupe" href="#investissements/sci:${encodeURIComponent(x.id)}"><span class="ico-n">${ICONE_SCI}</span>
      <span class="nom-n">${esc(x.nom)}</span><small>SCI ${REGIMES[x.regime]}</small>${assoc ? `<small>${assoc}</small>` : ''}${sb.length ? tot(totaux(sb)) : '<small>Aucun bien</small>'}</a>
      ${sb.length ? `<ul>${sb.map(feuille).join('')}</ul>` : ''}</li>`);
  }
  return pli('orga', 'Organisation', null, `<div class="org"><ul class="org-racine"><li><div class="noeud racine"><span class="nom-n">Mon patrimoine</span>${tot(totaux(biens))}</div>
    ${branches.length ? `<ul>${branches.join('')}</ul>` : ''}</li></ul></div>`);
}
// Sections de la liste repliables (Mes SCI, Mes biens, Organisation) : réglage gardé sur l'appareil
let replies = new Set();
try { replies = new Set(JSON.parse(localStorage.getItem('sections-repliees') || '[]')); } catch (e) {}
const pli = (cle, titre, nb, contenu) => `<details class="pli" data-pli="${cle}"${replies.has(cle) ? '' : ' open'}><summary><h2 class="sous-titre">${titre}</h2>${nb != null ? `<span class="nb">${nb}</span>` : ''}<span class="chevron" aria-hidden="true"></span></summary>${contenu}</details>`;
// Sur un petit écran l'organigramme défile de côté : on part du milieu, pour voir « Mon patrimoine »
function centrerOrg() { const o = racine.querySelector('.org'); if (o) o.scrollLeft = (o.scrollWidth - o.clientWidth) / 2; }
// L'événement toggle ne remonte pas, d'où l'écoute en capture
document.addEventListener('toggle', e => {
  const cle = e.target.dataset && e.target.dataset.pli; if (!cle) return;
  if (e.target.open) replies.delete(cle); else replies.add(cle);
  if (cle === 'orga' && e.target.open) centrerOrg();
  try { localStorage.setItem('sections-repliees', JSON.stringify([...replies])); } catch (e) {}
}, true);
const OEIL_PERSO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
// Liste : un bien et ses biens associés (garage…) dans une même carte, le garage en ligne compacte dessous
function listeBiens(liste) {
  const ids = new Set(liste.map(b => b.id));
  return liste.filter(b => !(b.lieA && ids.has(b.lieA))).map(b => {
    const lies = liste.filter(x => x.lieA === b.id && x !== b);
    return lies.length ? `<div class="groupe-bien">${carte(b, calculs(b))}${lies.map(ligneAssociee).join('')}</div>` : carte(b, calculs(b));
  }).join('');
}
function ligneAssociee(b) {
  const c = calculs(b), k = partDe(b);
  return `<a class="bien-lie" href="#investissements/${encodeURIComponent(b.id)}"><span class="ico-n">${icone(b.type)}</span>
    <span class="nom-a"><b>${esc(b.nom)}</b><small>${esc((enProjet(b) ? [statutLib(b), b.surface ? fmt(b.surface) + ' m²' : ''] : [TYPES[b.type] ? TYPES[b.type].l : '', statutLib(b)]).filter(Boolean).join(' · '))}</small></span>
    <span class="chiffres-lie"><span><small>Valeur</small><b>${b.valeur ? kEur(b.valeur * k) : '—'}</b></span><span><small>Loyer</small><b>${c.loyerMois ? eur(c.loyerMois * k) + '/mois' : enProjet(b) && planAmenag(b).loyer ? '≈ ' + eur(planAmenag(b).loyer * k) + '/mois possible' : '—'}</b></span></span>
    <span class="chev" aria-hidden="true">›</span></a>`;
}
// Étiquette « Crédit commun avec … » : un même prêt finance ce bien et d'autres
function creditCommun(b) {
  const ids = new Set([...b.prets.flatMap(p => partagesDe(p).map(x => x.id)), ...pretsRecus(b).flatMap(x => [x.de.id, ...partagesDe(x.p).map(z => z.id)])]);
  ids.delete(b.id);
  const noms = [...ids].map(id => (biens.find(y => y.id === id) || {}).nom).filter(Boolean);
  return noms.length ? 'Crédit commun avec ' + noms.join(', ') : '';
}
function carte(b, c) {
  const k = partDe(b), x = n => n * k, pr = principalDe(b);
  const tags = [pr ? 'Associé à ' + pr.nom : '', k < 1 ? `Part : ${Math.round(k * 100)} %` : '', b.pieces ? (b.type === 'maison' ? b.pieces + ' pièces' : 'T' + b.pieces) : '', b.surface ? fmt(b.surface) + ' m²' : '',
    b.type === 'terrain' && b.nature ? NATURES[b.nature] : '', sciDe(b) ? sciDe(b).nom : '', statutLib(b), creditCommun(b)].filter(Boolean);
  return `<a class="bien" href="#investissements/${encodeURIComponent(b.id)}">
    <div class="vignette" data-doc="${esc((b.docs.find(d => d.mime.startsWith('image/')) || {}).id || '')}">${icone(b.type)}<span>${TYPES[b.type] ? TYPES[b.type].l : ''}</span></div>
    <div class="infos"><b>${esc(b.nom)}</b><span class="adr">${esc(b.adresse || 'Adresse à renseigner')}</span><span class="tags">${tags.map(esc).join(' · ')}</span></div>
    <div class="chiffres">${simple() ? (m => `
      <div><span>Loyer${k < 1 ? ' (ta part)' : ''}</span><b>${m.loyer ? eur(m.loyer) + '/mois' : '—'}</b></div>
      <div><span>Crédit</span><b>${m.credit ? '− ' + eur(m.credit) + '/mois' : '—'}</b></div>
      <div><span>Charges</span><b>${m.charges ? '− ' + eur(m.charges) + '/mois' : '—'}</b></div>
      <div><span>${m.reste < 0 ? 'Il te manque' : 'Il te reste'}</span><b class="${signe(m.reste)}">${c.loue || c.mensuCredit ? eur(Math.abs(m.reste)) + '/mois' : '—'}</b></div>`)(moisDe(c, k)) : `
      <div><span>Valeur${k < 1 ? ' (ta part)' : ''}</span><b>${b.valeur ? kEur(x(b.valeur)) : '—'}</b></div>
      <div><span>Restant dû${k < 1 ? ' (ta part)' : ''}</span><b>${c.crd ? kEur(x(c.crd)) : '—'}</b></div>
      <div><span>Cash-flow${k < 1 ? ' (ta part)' : ''}</span><b class="${signe(c.cfMois)}">${c.loue || c.mensuCredit ? eur(x(c.cfMois)) + '/mois' : '—'}</b></div>
      <div><span>Loyers${k < 1 ? ' (ta part)' : ''}</span><b>${c.loyerMois ? eur(x(c.loyerMois)) + '/mois' : '—'}</b></div>`}
    </div><span class="chev" aria-hidden="true">›</span></a>`;
}
function carteVendue(b) {
  const v = b.vendu;
  return `<a class="bien vendu" href="#investissements/${encodeURIComponent(b.id)}">
    <div class="vignette" data-doc="${esc((b.docs.find(d => d.mime.startsWith('image/')) || {}).id || '')}">${icone(b.type)}<span>Vendu</span></div>
    <div class="infos"><b>${esc(b.nom)}</b><span class="adr">${esc(b.adresse || '')}</span><span class="tags">${esc(['Vendu en ' + libMois(v.mois), sciDe(b) ? sciDe(b).nom : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="chiffres">
      <div><span>Prix de vente</span><b>${kEur(v.prix)}</b></div>
      <div><span>Plus-value</span><b class="${signe(v.pv)}">${v.pv != null ? kEur(v.pv) : '—'}</b></div>
      <div><span>Impôts</span><b>${v.impots != null ? eur(v.impots) : '—'}</b></div>
      <div><span>${v.dansSci ? 'Resté dans la SCI' : 'Ce qui t\'est revenu'}</span><b class="${signe(v.net)}">${v.net != null ? kEur(v.net) : '—'}</b></div>
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
  let input; const choix = Array.isArray(o.options) ? o.options : Object.entries(o.options || {});   // tableau [valeur, libellé] : garde l'ordre (une clé « 1 » passerait devant)
  if (o.options) input = `<select id="${id}" data-p="${chemin}">${choix.map(([k, l]) => `<option value="${esc(k)}"${String(v ?? '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (o.zone) input = `<textarea id="${id}" data-p="${chemin}" rows="4" placeholder="${esc(o.ph || '')}">${esc(v || '')}</textarea>`;
  else input = `<input id="${id}" data-p="${chemin}" type="${o.type || 'number'}"${o.step ? ` step="${o.step}"` : ''}${o.type === 'month' ? ' placeholder="AAAA-MM"' : ''} value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}">`;
  // Peu de choix : boutons côte à côte, tous visibles (la liste reste, cachée, et porte la valeur)
  if (o.options && o.boutons) input = `<div class="seg">${choix.map(([k, l]) => `<button type="button" data-a="segChoix" data-cible="${id}" data-v="${esc(k)}" class="${String(v ?? '') === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>${input.replace('<select ', '<select hidden ')}`;
  return `<div class="${o.large ? 'large' : ''}"><label for="${id}">${label}</label>${input}${o.aide ? `<div class="aide">${o.aide}</div>` : ''}</div>`;
}
// Case « Comptable » d'un bien : un montant pour ce bien, ou, s'il est dans une SCI, sa part du comptable de la SCI
function comptaHTML(b) {
  const x = sciDe(b), choix = aide => champ(b, 'chargesAn.comptaSci', 'Comptable : inclure ce bien dans les frais du comptable de la SCI ?', {options: [['', 'Non, montant pour ce bien'], ['1', 'Oui, comptable de la SCI']], boutons: true, large: true, aide});
  if (!x) return champ(b, 'chargesAn.compta', 'Comptable (€)', {step: 50});
  if (!b.chargesAn.comptaSci) return choix() + champ(b, 'chargesAn.compta', 'Comptable (€)', {step: 50});
  const n = avecComptaSci(x, b).length;
  return choix(x.compta ? `Part de ce bien : <b>${eur(partComptaSci(b))}/an</b>${n > 1 ? ` (${eur(x.compta)} partagés entre ${n} biens)` : ''}, honoraires saisis dans la fiche de ${esc(x.nom)}.`
    : `Renseigne les honoraires du comptable dans la fiche de ${esc(x.nom)} (« Partenaires »).`);
}
const comptaSciAide = x => (n => n ? `Compté dans les charges ${n > 1 ? `de ses ${n} biens qui ont choisi « Oui, comptable de la SCI », à parts égales` : 'de son bien qui a choisi « Oui, comptable de la SCI »'}.` : 'Pour le compter, choisis « Oui, comptable de la SCI » dans les charges de ses biens.')(avecComptaSci(x).filter(y => !y.vendu).length);
const section = (titre, corps, large = false) => `<section class="bloc${large ? ' large' : ''}"><h3>${titre}</h3>${corps}</section>`;

function vueDetail(b) {
  const est = typeof estimationCourante === 'function' ? estimationCourante() : null;
  const opt = (o) => o;
  let h = `<div class="titre-discret"><a class="retour" href="#investissements">← Mon patrimoine</a>${boutonDiscret()}${pastilleCompte()}</div>
    <div class="dethead"><div class="vignette grand" data-doc="${esc((b.docs.find(d => d.mime.startsWith('image/')) || {}).id || '')}">${icone(b.type)}<span>${TYPES[b.type].l}</span></div>
      <div><h1 id="inv_titre">${esc(b.nom)}</h1><div class="adr" id="inv_sous">${esc([b.adresse, detenteur(b)].filter(Boolean).join(' · '))}</div></div><div class="dethead-actions">${b.vendu ? '' : `<button class="primaire" data-a="vente">${venteOuverte.has(b.id) ? 'Masquer la vente' : 'Simuler la vente →'}</button>`}</div></div>
    ${b.vendu ? venduHTML(b) : ''}${lienHTML(b)}
    <div id="inv_kpis"></div>
    ${venteOuverte.has(b.id) && !b.vendu ? venteHTML(b) : ''}
    <div class="blocs">
    ${enProjet(b) ? amenagHTML(b) : ''}
    ${section('Cash-flow', '<div id="inv_renta"></div>')}
    ${b.type === 'terrain' ? revenusHTML(b) : locationHTML(b)}
    ${section('Le bien', `<div class="grille">
      ${champ(b, 'nom', 'Nom', {type: 'text', ph: 'ex. Studio Passy'})}
      ${champ(b, 'type', 'Type', {options: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.l]))})}
      <div class="large sugg"><label for="inv_adresse">Adresse</label>
        <input id="inv_adresse" name="search" data-p="adresse" type="search" enterkeyhint="search" value="${esc(b.adresse)}" placeholder="ex. 12 rue Fesch, Ajaccio" autocomplete="off" autocorrect="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="inv_sugg" aria-expanded="false">
        <ul id="inv_sugg" role="listbox" hidden></ul>
        </div>
      <div class="large carte-bien"><div id="inv_carte" aria-label="Carte : clique à l'endroit du bien"></div><div class="aide" id="inv_carteAide">${aideCarte(b)}</div></div>
      ${b.type === 'terrain' ? `${champ(b, 'surface', 'Surface (m²)', {aide: b.surface >= 10000 ? (b.surface / 10000).toFixed(2).replace('.', ',') + ' ha' : ''})}${champ(b, 'nature', 'Nature du terrain', {options: NATURES})}`
        : b.type === 'parking' ? `${champ(b, 'place', 'Type de place', {options: Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, p.l]))})}${champ(b, 'surface', 'Surface (m²)')}`
        : `${champ(b, 'surface', 'Surface (m²)')}${champ(b, 'pieces', 'Pièces')}
      ${champ(b, 'annee', 'Année de construction')}`}
      <div><label for="inv_detention">Détenu par</label><select id="inv_detention" data-p="detention">
        <option value="np"${b.structure !== 'sci' ? ' selected' : ''}>Nom propre</option>
        ${scis.map(x => `<option value="${esc(x.id)}"${b.sciId === x.id && b.structure === 'sci' ? ' selected' : ''}>${esc(x.nom)} (SCI ${REGIMES[x.regime]})</option>`).join('')}
        <option value="+">+ Créer une SCI…</option></select>
        ${sciDe(b) ? `<div class="aide"><a href="#investissements/sci:${encodeURIComponent(b.sciId)}">Voir la fiche de la SCI →</a></div>` : ''}</div>
    </div>
    <div class="part-bien"><label for="inv_part">Part détenue ${sciDe(b) ? 'par la SCI' : 'par toi'}</label>
      <div class="part-ligne"><input type="range" id="inv_part" data-p="part" min="1" max="100" step="1" value="${Math.round(partDe(b) * 100)}"><output id="inv_partVal" for="inv_part">${Math.round(partDe(b) * 100)} %</output></div>
      <div class="aide">Pour un bien à plusieurs (indivision, famille…) : les totaux de « Mon patrimoine » ne comptent que cette part.</div></div>
    ${enProjet(b) ? '<div class="aide">Valeur et loyer une fois aménagé : voir « Projet d\'aménagement ».</div>' : `${critHTML(b)}
    ${TYPE_DVF[b.type] || b.type === 'terrain' || b.type === 'parking' ? '<button class="primaire estimer" data-a="estimerAuto" id="inv_estimer">Estimer ce bien</button>' : ''}
    <div class="valeur"><h4>Estimation</h4><div id="inv_auto"></div>
      <div class="grille">${champ(b, 'valeur', 'Valeur du bien (€)', {step: 1000})}${champ(b, 'valeurLe', 'Valeur au', {type: 'month'})}</div>
      ${TYPE_DVF[b.type] ? `<div class="boutons"><button data-a="estimer"${estimable(b) ? '' : ' disabled title="Renseigne l\'adresse et la surface"'}>Voir le détail dans l'onglet Estimer →</button></div>` : ''}</div>`}`)}
    ${ANNEXE_POUR.includes(b.type) && !b.vendu ? annexeHTML(b) : ''}
    ${lieSimple(b) ? lieSimpleHTML(b) : `${section('Achat', `${repriseAchatHTML(b)}<div class="grille">
      ${champ(b, 'achat.mode', 'Acquisition', {options: {existant: 'Achat d\'un bien', construction: 'Terrain + construction'}, large: true})}
      ${b.achat.mode === 'construction' ? `${champ(b, 'achat.date', 'Achat du terrain', {type: 'month'})}${champ(b, 'achat.prix', 'Prix du terrain (€)', {step: 1000})}
      ${champ(b, 'achat.notaire', 'Frais de notaire du terrain (€)', {step: 100})}${champ(b, 'achat.construction', 'Coût de la construction (€)', {step: 1000, aide: 'Constructeur, artisans, architecte : sur factures'})}
      ${champ(b, 'achat.debutTravaux', 'Début des travaux', {type: 'month', aide: 'Déclaration d\'ouverture de chantier'})}${champ(b, 'achat.finTravaux', 'Fin de la construction', {type: 'month'})}
      ${champ(b, 'achat.travaux', 'Travaux faits depuis (€)', {step: 500})}`
      : `${champ(b, 'achat.date', 'Date d\'achat', {type: 'month'})}${champ(b, 'achat.prix', 'Prix d\'achat (€)', {step: 1000})}
      ${champ(b, 'achat.notaire', 'Frais de notaire (€)', {step: 100})}${champ(b, 'achat.travaux', 'Travaux (€)', {step: 500})}`}
      ${champ(b, 'achat.mobilier', 'Mobilier (€)', {step: 100})}${champ(b, 'achat.frais', 'Autres frais (€)', {step: 100, aide: b.achat.mode === 'construction' ? 'Raccordements, taxe d\'aménagement, dossier…' : 'Agence, dossier, garantie…'})}
    </div><div class="total" id="inv_cout"></div>`)}
    ${section('Crédit' + (b.prets.length + pretsRecus(b).length > 1 ? 's' : ''), `<div class="prets">${pretsRecus(b).map(pretRecuHTML).join('')}${b.prets.map((p, i) => pretHTML(b, p, i)).join('')}</div><button data-a="ajoutPret">+ Ajouter un prêt</button>`, true)}
    ${section('Charges du propriétaire (par an)', `${(p => p && ['gestion', 'entretien'].some(k => b.chargesAn[k] == null && p.chargesAn[k] != null) ? `<div class="reprise"><button data-a="copierCharges">Reprendre les % de ${esc(p.nom)}</button><div class="aide">Gestion et entretien, en % des loyers. Taxe foncière, assurance et copropriété restent sur la fiche de ${esc(p.nom)}.</div></div>` : '')(principalDe(b))}<div class="grille">
      ${champ(b, 'chargesAn.tf', 'Taxe foncière (€)', {step: 50})}${champ(b, 'chargesAn.copro', 'Copropriété non récupérable (€)', {step: 50})}
      ${champ(b, 'chargesAn.pno', 'Assurance PNO (€)', {step: 10})}${champ(b, 'chargesAn.gestion', 'Gestion (% des loyers)', {step: 0.5})}
      ${champ(b, 'chargesAn.entretien', 'Entretien (% des loyers)', {step: 0.5})}${comptaHTML(b)}
      ${champ(b, 'chargesAn.cfe', 'CFE (€)', {step: 50})}${champ(b, 'chargesAn.autres', 'Autres (€)', {step: 50})}
    </div>`)}`}
    ${section('Notes', champ(b, 'notes', '', {zone: true, ph: 'Travaux à prévoir, contacts, échéances…'}))}
    ${section('Plans et documents', `<div class="docs" id="inv_docs"></div>
      <input type="file" id="inv_fichier" accept="image/*,application/pdf" multiple hidden>
      <button data-a="fichier">+ Ajouter un plan, une photo ou un document</button> <span class="aide" id="inv_docEtat"></span>
      <div class="aide">${COMPTE.user ? 'Enregistrés dans ton compte (privés).' : 'Mode invité : fichiers gardés sur cet appareil seulement.'} Images et PDF, 10 Mo maximum (photos réduites automatiquement).</div>`, true)}
    </div>
    <div class="pied"><button class="danger" data-a="supprimer">Supprimer ce bien</button></div>`;
  racine.innerHTML = h;
  majCalculs(b); docsHTML(b); vignettes(); majAuto(b); initCarte(b); majVente(b); majDetache(b); majAmenag(b);
}
// Caractéristiques utilisées par l'estimation (les mêmes que « Détails du bien » dans l'onglet Estimer)
function critHTML(b) {
  if (!TYPE_DVF[b.type]) return '';
  const pour = b.type === 'appart' ? 'appart' : 'maison';
  const liste = CRITERES.filter(c => !c.cache && c.id !== 'epoque' && (c.pour === 'tous' || c.pour === pour));
  // Stationnement sorti en bien associé : compté dans sa propre fiche, plus dans celle-ci
  const garages = associesA(b).filter(x => x.type === 'parking' && !x.vendu);
  const un = c => {
    const v = b.criteres[c.id], id = 'inv_c_' + c.id;
    if (garages.length && (c.id === 'parking' || c.id === 'garage')) return `<div><label>${esc(c.label)}</label><div class="stat-associe">${garages.map(x => `<a href="#investissements/${encodeURIComponent(x.id)}">${esc(x.nom)}</a>`).join(', ')}</div><div class="aide">Bien associé, compté à part : pas dans la valeur de ce bien.</div></div>`;
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
// « Va avec le bien principal » n'est proposé qu'à un bien associé
function statutsDe(b) {
  const p = principalDe(b), o = {...STATUTS};
  if (p) o.avec = `Avec ${p.nom} (loué ou habité ensemble)`; else delete o.avec;
  return o;
}
function locationHTML(b) {
  const Lc = LISTES[b.location.statut];
  if (Lc) {
    const liste = b[Lc.cle] || [];
    return section('Location', `<div class="grille">${champ(b, 'location.statut', 'Situation', {options: statutsDe(b)})}</div>
      <div class="activites">${liste.map((x, i) => `<div class="activite"><div class="grille">
        ${champ(b, `${Lc.cle}.${i}.libelle`, Lc.nom, {type: 'text', ph: Lc.cle === 'lots' ? `Loyer ${i + 1} (ex. appartement, garage aménagé)` : `${Lc.nom} ${i + 1}`})}${champ(b, `${Lc.cle}.${i}.loyer`, 'Loyer hors charges (€/mois)', {step: 10})}
        ${Lc.cle === 'lots' ? champ(b, `lots.${i}.surface`, 'Surface (m²)') : ''}${champ(b, `${Lc.cle}.${i}.locataire`, 'Locataire', {type: 'text'})}
        ${champ(b, `${Lc.cle}.${i}.debut`, 'Loyer à partir de', {type: 'month', aide: 'Vide : déjà loué'})}</div>
        <button class="lien" data-a="supprLigne" data-i="${i}">Retirer</button></div>`).join('') || `<div class="aide">Ajoute ${Lc.cle === 'lots' ? 'chaque logement (ou le garage, l\'annexe aménagée…)' : 'chaque chambre'} avec son loyer et le mois où il commence.</div>`}</div>
      <button data-a="ajoutLigne">${Lc.ajout}</button>
      <div class="grille" style="margin-top:10px">${champ(b, 'location.vacance', 'Vacance (mois/an)', {step: 0.5, aide: 'Mois sans locataire en moyenne'})}</div>
      <div class="total" id="inv_revTotal"></div>`);
  }
  if (b.location.statut === 'saisonnier') {
    const m = loyersMarche(b.estimation).meuble;
    return section('Location', `<div class="grille">
      ${champ(b, 'location.statut', 'Situation', {options: statutsDe(b)})}
      ${champ(b, 'location.nuit', 'Prix moyen par nuit (€)', {step: 5, aide: m ? `Point de départ : ≈ ${eur(nuitConseillee(m))} (loyer meublé du marché ÷ 9)` : ''})}
      <div><label for="inv_periode">Période louée</label><select id="inv_periode" data-x="periode">${optionsPeriode(Object.keys(PERIODES_SAISON).find(k => Math.round(365 * PERIODES_SAISON[k].occ / 100) === +b.location.nuitsAn) || '')}</select><div class="aide">Remplit les nuits louées par an</div></div>
      ${champ(b, 'location.nuitsAn', 'Nuits louées par an', {step: 10, aide: '≈ 220 pour 60 % d\'occupation · 120 au plus pour une résidence principale'})}
      ${champ(b, 'location.fraisSaison', 'Frais (% des recettes)', {step: 1, aide: 'Plateforme, conciergerie et ménage (souvent 20 à 35 %)'})}
      ${champ(b, 'location.loyer', 'Ou recettes moyennes (€/mois)', {step: 10, aide: 'Compté seulement sans prix par nuit'})}
      ${champ(b, 'location.debutBail', 'Loué à partir de', {type: 'month', aide: 'Vide : déjà en location'})}
    </div><div class="total" id="inv_revTotal"></div>`);
  }
  return section('Location', `<div class="grille">
      ${champ(b, 'location.statut', 'Situation', {options: statutsDe(b)})}
      ${LOUE.includes(b.location.statut) ? `${champ(b, 'location.loyer', 'Loyer hors charges (€/mois)', {step: 10, aide: (L => L.vide || L.meuble ? `Marché : vide ${L.vide != null ? eur(L.vide) : '—'} · meublé ${L.meuble != null ? eur(L.meuble) : '—'}` : '')(loyersMarche(b.estimation))})}${champ(b, 'location.charges', 'Charges locataire (€/mois)', {step: 10})}
      ${champ(b, 'location.locataire', 'Locataire', {type: 'text'})}${champ(b, 'location.debutBail', 'Début du bail', {type: 'month'})}
      ${champ(b, 'location.vacance', 'Vacance (mois/an)', {step: 0.5, aide: 'Mois sans locataire en moyenne'})}` : ''}
    </div>${b.location.statut === 'avec' && principalDe(b) ? `<div class="aide">${(p => LOUE.includes(p.location.statut) ? `Pas de loyer à part : il est compris dans celui de ${esc(p.nom)}, et son loyer de marché compte le ${b.type === 'parking' ? 'garage' : 'bien'}.` : `Utilisé avec ${esc(p.nom)}, sans loyer à part.`)(principalDe(b))}</div>` : ''}`);
}
// Terrain : bail (loyer au mois ou à l'année) ou activités diverses (chacune avec son revenu)
function revenusHTML(b) {
  const L = b.location, st = L.statut;
  let h = `<div class="grille">${champ(b, 'location.statut', 'Situation', {options: STATUTS_TERRAIN})}</div>`;
  if (st === 'loue') h += `<div class="grille">
      ${champ(b, 'location.typeBail', 'Type de bail', {options: BAUX})}${champ(b, 'location.locataire', 'Locataire', {type: 'text'})}
      ${champ(b, 'location.loyer', 'Loyer (€)', {step: 10})}${champ(b, 'location.periode', 'Payé', {options: PERIODES})}
      ${champ(b, 'location.debutBail', 'Début du bail', {type: 'month'})}${champ(b, 'location.vacance', 'Vacance (mois/an)', {step: 0.5})}</div>`;
  if (st === 'activites') h += `<div class="activites">${(b.revenus || []).map((r, i) => `<div class="activite"><div class="grille">
        ${champ(b, `revenus.${i}.libelle`, 'Activité', {type: 'text', ph: 'ex. location pour événements, camping, vente de bois, antenne relais…', large: true})}
        ${champ(b, `revenus.${i}.montant`, 'Revenu (€)', {step: 10})}${champ(b, `revenus.${i}.periode`, 'Rapporté', {options: PERIODES})}</div>
        <button class="lien" data-a="supprRevenu" data-i="${i}">Retirer</button></div>`).join('') || '<div class="aide">Aucune activité pour l\'instant.</div>'}</div>
      <button data-a="ajoutRevenu">+ Ajouter une activité</button>`;
  h += '<div class="total" id="inv_revTotal"></div>';
  return section('Revenus du terrain', h);
}
// ---------- Garage, parking, annexe : un bien à part, associé au bien principal ----------
// Le garage d'un appartement (ou l'annexe d'une maison) devient une fiche à part, reliée au bien (lieA) : sa valeur,
// sa part du prix d'achat et son loyer propres, et il peut être vendu seul. Le crédit reste sur le bien principal.
const ANNEXE_POUR = ['appart', 'maison', 'immeuble', 'local'];
const TYPES_ANNEXE = {parking: 'Garage, box ou parking', local: 'Local, atelier, cave…', appart: 'Logement (annexe aménagée)'};
const associesA = b => biens.filter(x => x.lieA === b.id && x.id !== b.id);
const principalDe = b => b.lieA ? biens.find(x => x.id === b.lieA) || null : null;
const detacheOuvert = new Set();   // fiches où le formulaire « sortir un garage » est ouvert
// Garage associé sans loyer à part : loué (ou habité) avec le bien principal
const garageLoueAvec = b => associesA(b).find(x => x.type === 'parking' && !x.vendu && x.location.statut === 'avec');
// Part de la valeur que représente le stationnement (mêmes écarts que l'estimation : box ≈ +9 % sur un appartement,
// garage ≈ 5 % d'une maison) : sert de suggestion quand la valeur du garage n'est pas saisie
function partSuggeree(b) {
  if (b.type === 'appart' && typeof CRITERES !== 'undefined') {
    const c = CRITERES.find(x => x.id === 'parking'), o = c && c.options.find(x => x.k === b.criteres.parking);
    const p = o && o.p != null ? (typeof o.p === 'number' ? o.p : o.p.autre) : 0.07;
    return p / (1 + p);
  }
  return 0.05;
}
// Ce que la séparation change : valeur, prix d'achat et frais répartis au prorata, loyer déplacé
function planDetache(b) {
  const d = b.detache || {}, a = b.achat, construit = a.mode === 'construction';
  const base = (a.prix || 0) + (construit ? a.construction || 0 : 0);
  const valSugg = b.valeur ? Math.round(b.valeur * partSuggeree(b) / 500) * 500 : null;
  const val = d.valeur ?? valSugg;
  const prixSugg = base && (b.valeur && val ? Math.round(base * Math.min(1, val / b.valeur) / 100) * 100 : Math.round(base * partSuggeree(b) / 100) * 100);
  const prix = Math.min(base, d.prix ?? prixSugg ?? 0);
  const r = base ? prix / base : 0;
  const lot = b.location.statut === 'lots' && d.lot ? (b.lots || []).find(x => x.id === d.lot) : null;
  const loyer = lot ? lot.loyer || 0 : d.loyer || 0;
  return {d, val, valSugg, prix, prixSugg, r, base, construit, lot, loyer,
    notaire: Math.round((a.notaire || 0) * r), frais: Math.round((a.frais || 0) * r),
    valeurApres: b.valeur ? Math.max(0, b.valeur - (val || 0)) : null, baseApres: base - prix};
}
// Fiche associée sans achat : reprendre la date du bien principal et sa part du prix (au prorata des valeurs),
// retirée du bien principal pour ne pas compter deux fois le même prix
function repriseAchat(b) {
  const p = principalDe(b), a = p && p.achat;
  if (!p || b.achat.prix || p.achat.mode === 'construction' || !(a.date || a.prix)) return null;
  const r = !a.prix ? 0 : p.valeur && b.valeur ? b.valeur / (p.valeur + b.valeur) : partSuggeree(p);
  const prix = Math.round((a.prix || 0) * r / 100) * 100;
  return {p, date: a.date, r, prix, notaire: Math.round((a.notaire || 0) * r), frais: Math.round((a.frais || 0) * r)};
}
// Bien associé sans achat, crédit ni charges à lui : tout est compté dans la fiche du bien principal, rien à saisir
const lieSimple = b => !!principalDe(b) && !b.saisieAPart && !b.achat.prix && !b.achat.date && !b.prets.length && !pretsRecus(b).length && Object.values(b.chargesAn).every(v => v == null);
function lieSimpleHTML(b) {
  const p = principalDe(b), r = repriseAchat(b);
  return section('Achat, crédit et charges', `<div class="aide">Compris dans la fiche de <a href="#investissements/${encodeURIComponent(p.id)}">${esc(p.nom)}</a> : rien à remplir ici.</div>
    ${r && r.prix ? `<div class="aide" style="margin-top:8px">Pour simuler sa vente seul, il lui faut sa part du prix d'achat : ${eur(r.prix)}, au prorata des valeurs.</div>` : ''}
    <div class="boutons">${r && r.prix ? `<button data-a="copierAchat">Reprendre sa part du prix</button>` : ''}<button data-a="saisirAPart">Saisir à part</button></div>`, true);
}
function repriseAchatHTML(b) {
  const r = repriseAchat(b); if (!r) return '';
  return `<div class="reprise"><button data-a="copierAchat">Reprendre de ${esc(r.p.nom)}</button>
    <div class="aide">${r.date ? 'Acheté en ' + libMois(r.date) : 'Même achat'}${r.prix ? `, pour ${eur(r.prix)}${r.notaire ? ' + ' + eur(r.notaire) + ' de notaire' : ''} : sa part du prix de ${esc(r.p.nom)} au prorata des valeurs, retirée de celui-ci (${eur(r.p.achat.prix)} → ${eur(r.p.achat.prix - r.prix)}).` : '.'} Tu peux corriger ensuite.</div></div>`;
}
function annexeHTML(b) {
  const lies = associesA(b), ouvert_ = detacheOuvert.has(b.id), d = b.detache || {};
  let h = lies.length ? `<div class="associes-bien">${lies.map(x => { const c = calculs(x);
    return `<a class="associe-bien" href="#investissements/${encodeURIComponent(x.id)}"><span class="ico-n">${icone(x.type)}</span><span class="nom-a"><b>${esc(x.nom)}</b><small>${esc(x.vendu ? 'Vendu en ' + libMois(x.vendu.mois) : statutLib(x))}</small></span>
      ${mini([['Valeur', x.vendu ? null : x.valeur ? kEur(x.valeur) : '—'], ['Loyer', !x.vendu && c.loyerMois ? eur(c.loyerMois) + '/mois' : null], ['Loyer possible', enProjet(x) && planAmenag(x).loyer ? eur(planAmenag(x).loyer) + '/mois' : null], ['Vendu', x.vendu ? kEur(x.vendu.prix) : null]], 'petit')}<span class="chev" aria-hidden="true">›</span></a>`; }).join('')}</div>` : '';
  if (!ouvert_) {
    const libres = biens.filter(x => x.id !== b.id && !x.lieA && !associesA(x).length && !x.vendu);
    h += `${lies.length ? '' : '<div class="aide">Un garage, une place ou une annexe que tu pourrais louer ou vendre à part ? Sors-le en bien à part : il garde sa valeur, sa part du prix d\'achat et son loyer, reste associé à ce bien, et peut être vendu seul.</div>'}
      <div class="boutons"><button data-a="detacheOuvrir" data-m="separer">+ Sortir un garage ou une annexe</button><button data-a="amenagCreer">+ Espace à aménager (sous-sol, combles…)</button><button data-a="detacheOuvrir" data-m="vendre">Vendre le garage seul…</button></div>
      ${lies.length ? '' : '<div class="aide">Un sous-sol ou des combles pas encore faits ? Ajoute-les en espace à aménager : estimation de la valeur et du loyer une fois aménagés, puis projet de travaux dans Mes projets.</div>'}
      ${libres.length ? `<div class="grille" style="margin-top:10px"><div class="large"><label for="inv_associer">Ou associer un bien déjà dans ta liste</label><select id="inv_associer" data-x="associer"><option value="">—</option>${libres.map(x => `<option value="${esc(x.id)}">${esc(x.nom)}</option>`).join('')}</select></div></div>` : ''}`;
    return section('Garage, annexe ou espace à aménager', h);
  }
  const lots = b.location.statut === 'lots' ? (b.lots || []).filter(x => x.loyer > 0 || x.libelle) : [];
  h += `<div class="grille">
      ${champ(b, 'detache.nom', 'Nom du nouveau bien', {type: 'text', ph: 'Garage · ' + b.nom})}
      ${champ(b, 'detache.type', 'Type', {options: TYPES_ANNEXE})}
      ${(d.type || 'parking') === 'parking' ? champ(b, 'detache.place', 'Type de place', {options: Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, p.l]))}) : ''}
      ${champ(b, 'detache.valeur', 'Sa valeur (€)', {step: 500, ph: b.valeur ? fmt(planDetache({...b, detache: {}}).valSugg) + ' (suggérée)' : ''})}
      ${champ(b, 'detache.prix', 'Sa part du prix d\'achat (€)', {step: 500, ph: (p => p.prixSugg ? fmt(p.prixSugg) + ' (au prorata)' : '')(planDetache({...b, detache: {valeur: d.valeur}})), aide: 'Compte pour sa plus-value à la vente'})}
      ${lots.length ? champ(b, 'detache.lot', 'Son loyer', {options: {'': 'Aucun loyer', ...Object.fromEntries(lots.map((x, i) => [x.id, `${x.libelle || 'Loyer ' + (i + 1)} (${eur(x.loyer || 0)}/mois)`]))}, aide: 'Le loyer passe dans la fiche du garage'})
        : champ(b, 'detache.loyer', 'Son loyer (€/mois)', {step: 10, ph: 'facultatif'})}
      ${d.mode === 'vendre' ? `${champ(b, 'detache.prixVente', 'Prix de vente (€)', {step: 500, ph: 'sa valeur'})}${champ(b, 'detache.moisVente', 'Vendu en', {type: 'month', ph: moisCourant()})}` : ''}
    </div>
    ${!lots.length && LOUE.includes(b.location.statut) && b.location.loyer ? `<div class="case"><label><input type="checkbox" data-p="detache.deduire"${d.deduire ? ' checked' : ''}> Ce loyer était compté dans celui du bien (${eur(b.location.loyer)}) : le retirer</label></div>` : ''}
    ${(d.type || 'parking') === 'parking' ? `<div class="boutons"><button data-a="detacheEstimer"${enCours.has('det:' + b.id) ? ' disabled' : ''}>${enCours.has('det:' + b.id) ? 'Estimation en cours…' : 'Estimer sa valeur (garages vendus autour)'}</button></div>
      ${d.estimation ? d.estimation.erreur ? `<div class="warnbox">${esc(d.estimation.erreur)}</div>` : `<div class="aide">Estimé à <b>${eur(d.estimation.prix)}</b> (${eur(d.estimation.lo)} – ${eur(d.estimation.hi)}), d'après ${d.estimation.ventes} garages, box et places vendus seuls à moins de ${dist(d.estimation.rayon)}, ramené à ${esc(PLACES[d.estimation.place || 'box'].l.toLowerCase())} · ${esc(d.estimation.fiabilite.toLowerCase())}.</div>` : ''}` : ''}
    <div id="inv_detacheRes"></div>
    <div class="boutons"><button class="primaire" data-a="detacher">${d.mode === 'vendre' ? 'Sortir le garage et simuler sa vente →' : 'Créer le bien associé'}</button><button data-a="detacheFermer">Annuler</button></div>`;
  return section('Garage, parking ou annexe', h, true);
}
function majDetache(b) {
  const el = racine.querySelector('#inv_detacheRes'); if (!el) return;
  const p = planDetache(b), a = b.achat, crd = calculs(b).crd;
  el.innerHTML = `<div class="calc">
    <div><span>${esc(p.d.nom || 'Garage · ' + b.nom)}</span><b>${p.val ? eur(p.val) : '—'}${p.d.valeur == null && p.val ? ' (suggérée)' : ''}</b></div>
    ${p.base ? `<div><span>· acheté ${a.date ? 'en ' + libMois(a.date) : '(date d\'achat du bien)'}</span><b>${eur(p.prix)}${p.notaire ? ' + ' + eur(p.notaire) + ' de notaire' : ''}</b></div>` : ''}
    ${p.loyer ? `<div><span>· loyer</span><b>${eur(p.loyer)}/mois</b></div>` : ''}
    <div><span>${esc(b.nom)} ensuite</span><b>${p.valeurApres != null ? eur(p.valeurApres) : '—'}</b></div>
    ${p.base ? `<div><span>· prix d'achat</span><b>${eur(p.baseApres)}</b></div>` : ''}
    ${crd ? `<div><span>· crédit (reste sur ce bien)</span><b>${kEur(crd)}</b></div>` : ''}</div>
    <div class="aide">Le patrimoine total ne change pas : la valeur est seulement répartie entre les deux fiches. ${p.d.mode === 'vendre' ? 'Vendu seul, le garage est imposé sur sa propre plus-value (même si l\'appartement est ta résidence principale), sauf si le prix ne dépasse pas 15 000 €. La durée de détention compte depuis l\'achat du bien. ' : ''}${crd ? 'Si la banque demande de rembourser une partie du crédit avec le prix du garage, mets à jour le restant dû du prêt ici. ' : ''}${!a.prix ? 'Renseigne le prix d\'achat du bien (bloc Achat) pour répartir le prix et la plus-value.' : ''}</div>`;
}
function detacher(b) {
  const p = planDetache(b), d = p.d, a = b.achat;
  const loyer = p.loyer, lot = p.lot;
  const n = nouveauBien({nom: (d.nom || '').trim() || 'Garage · ' + b.nom, type: d.type || 'parking', ...((d.type || 'parking') === 'parking' ? {place: PLACES[d.place] ? d.place : 'box'} : {}), adresse: b.adresse, geo: b.geo ? {...b.geo} : null,
    structure: b.structure, sciId: b.sciId, part: b.part, lieA: b.id,
    valeur: p.val || null, valeurLe: p.val ? moisCourant() : '', valeurManuelle: !!p.val,
    achat: {mode: 'existant', date: a.date || '', prix: p.prix || null, notaire: p.notaire || null, travaux: null, mobilier: null, frais: p.frais || null},
    location: loyer ? {statut: 'vide', loyer, charges: null, locataire: lot ? lot.locataire || '' : '', debutBail: lot && normMois(lot.debut) ? normMois(lot.debut) : '', vacance: 0}
      : {statut: (d.type || 'parking') === 'parking' ? 'avec' : 'vacant', loyer: null, charges: null, locataire: '', debutBail: '', vacance: 0}, avecVu: true,
    notes: `Sorti de « ${b.nom} » en ${libMois(moisCourant())}.`});
  // Le bien principal perd ce qui part dans la nouvelle fiche
  if (p.base && p.r) {
    a.prix = a.prix ? Math.round(a.prix * (1 - p.r)) : a.prix;
    if (p.construit && a.construction) a.construction = Math.round(a.construction * (1 - p.r));
    if (a.notaire) a.notaire -= p.notaire;
    if (a.frais) a.frais -= p.frais;
  }
  if (b.valeur && p.val) { b.valeur = p.valeurApres; b.valeurLe = moisCourant(); }
  if (lot) b.lots = b.lots.filter(x => x !== lot);
  else if (loyer && d.deduire && b.location.loyer) b.location.loyer = Math.max(0, b.location.loyer - loyer);
  // Caractéristiques d'estimation : le stationnement ne fait plus partie du bien
  if ((d.type || 'parking') === 'parking') {
    // Le type de stationnement est gardé : il compte encore dans le loyer de marché tant que le garage est loué avec le bien
    b.parkingAssocie = b.type === 'appart' ? (b.criteres.parking && b.criteres.parking !== 'aucun' ? (b.criteres.parking === '2' ? '1' : b.criteres.parking) : b.parkingAssocie) : 'oui';
    if (b.type === 'appart' && b.criteres.parking && b.criteres.parking !== 'aucun') b.criteres.parking = b.criteres.parking === '2' ? '1' : 'aucun';
    if (b.type === 'maison' && (b.criteres.garage || 'oui') === 'oui') b.criteres.garage = 'non';
  }
  if (d.estimation && !d.estimation.erreur && n.type === 'parking') { n.estimation = {...d.estimation, cle: cleEstimation(n)}; n.valeurManuelle = p.val !== d.estimation.prix; }
  if (d.mode === 'vendre') { n.vente = {prix: d.prixVente ?? null, mois: d.moisVente || ''}; venteOuverte.add(n.id); }
  delete b.detache; detacheOuvert.delete(b.id);
  biens.splice(biens.indexOf(b) + 1, 0, n);
  sauver(b, n);
  return n;
}
// ---------- Espace à aménager (sous-sol, combles…) : bien associé, estimé comme s'il était fait ----------
// Une surface pas encore habitable du bien principal : sa valeur reste comprise dans celle du bien tant que les travaux
// ne sont pas faits. Mêmes hypothèses que « Aménager une surface en plus → Créer un logement à part » de l'onglet Estimer :
// coût au m², cuisine et entrée séparée, architecte ; logement estimé à sa surface puis décoté (valeur, et loyer un peu moins).
const NOMS_ESPACE = {soussol: 'Sous-sol', combles: 'Combles', autre: 'Espace à aménager'};
const enProjet = b => !!(b.amenag && !b.amenag.fait);
const zoneDe = b => /\b75\d{3}\b|\bparis\b/i.test(b.adresse || '') ? 'paris' : 'autre';
const cleAmenag = b => { const p = principalDe(b) || b, c = criteresEffectifs(p); delete c.location; return JSON.stringify([p.adresse.trim(), p.type, p.surface, b.amenag && b.amenag.m2, c]); };
function planAmenag(b) {
  const a = b.amenag || {}, t = AMENAG[a.ou] ? a.ou : 'soussol', p = principalDe(b) || b;
  const m2 = a.m2 > 0 ? a.m2 : null, coutM2 = AMENAG[t].m2;
  const decote = a.decote != null && a.decote !== '' ? Math.max(0, Math.min(80, +a.decote)) : AMENAG[t].decote, d = decote / 100;
  const saison = a.meuble === 'nuit', meuble = a.meuble === '1' || saison, duree = a.duree > 0 ? Math.round(a.duree) : 5;
  const postes = m2 ? [[`Aménagement : ${fmt(coutM2)} €/m² × ${fmt(m2)} m²`, m2 * coutM2], ['Cuisine, entrée séparée, compteurs', COUT_LOT[zoneDe(p)] / 2], ['Architecte, déclaration en mairie', 3000]] : [];
  // Coût total saisi (devis, budget) : il remplace l'estimation au m² et comprend tout, mobilier compris
  const suggere = m2 ? Math.round(somme(postes, x => x[1]) / 500) * 500 : null, mobSuggere = meuble && m2 ? budgetMobilier(m2, 'standard') : 0;
  const saisi = a.total > 0, travaux = saisi ? a.total : suggere, mobilier = saisi ? 0 : mobSuggere;
  const e = a.estimation && !a.estimation.erreur && a.estimation.cle === cleAmenag(b) ? a.estimation : null;
  const brut = e ? (meuble ? e.loyerMeuble ?? e.loyer : e.loyerVide ?? e.loyer) : null;
  const valeur = e ? Math.round(e.prix * (1 - d) / 500) * 500 : null, loyerMois = brut != null ? Math.round(brut * (1 - 0.6 * d) / 10) * 10 : null;
  // À la nuitée : recettes moyennes du mois (prix par nuit × nuits louées), frais d'Estimer par défaut ; sert de « loyer »
  let sz = null, nuit = null, occupation = null, charges = null;
  if (saison && loyerMois != null) {
    const per = PERIODES_SAISON[a.periode] ? a.periode : 'annee';   // été seulement : moins de nuits, mais plus chères
    nuit = a.nuit > 0 ? a.nuit : nuitPeriode(loyerMois, per); occupation = a.occupation > 0 ? Math.min(100, a.occupation) : PERIODES_SAISON[per].occ;
    charges = chargesSaisonDefaut(m2 || 0, p.type !== 'maison');
    sz = saisonnier({...SAISON_DEFAUTS, nuit, occupation, charges});
  }
  const loyer = sz ? Math.round(sz.brutMois / 10) * 10 : loyerMois;
  const debut = normMois(a.debut) || '';
  return {t, m2, coutM2, decote, postes, suggere, mobSuggere, saisi, travaux, mobilier, duree, meuble, saison, sz, nuit, occupation, charges, e, valeur, loyer, debut, loyerDes: debut ? decalerMois(debut, duree) : '',
    creee: valeur != null && travaux ? valeur - travaux : null};
}
function nouvelEspace(b) {
  return nouveauBien({nom: NOMS_ESPACE.soussol + ' · ' + b.nom, type: b.type === 'maison' ? 'maison' : 'appart', adresse: b.adresse, geo: b.geo ? {...b.geo} : null,
    structure: b.structure, sciId: b.sciId, part: b.part, lieA: b.id, avecVu: true,
    location: {statut: 'avec', loyer: null, charges: null, locataire: '', debutBail: '', vacance: 0},
    amenag: {ou: 'soussol', m2: null, total: null, decote: null, meuble: '', nuit: null, periode: 'annee', occupation: null, debut: '', duree: null}});
}
// Travaux terminés : l'espace devient un logement à part, avec sa valeur, son coût (les travaux) et son loyer
function amenagTermine(b) {
  const q = planAmenag(b), p = principalDe(b);
  b.amenag.fait = moisCourant();
  Object.assign(b, {surface: q.m2, criteres: p ? {...p.criteres} : b.criteres, valeur: q.valeur, valeurLe: q.valeur ? moisCourant() : '', valeurManuelle: !!q.valeur});
  b.achat = {...b.achat, mode: 'existant', date: b.achat.date || moisCourant(), travaux: q.travaux, mobilier: q.mobilier || null};
  b.location = {...b.location, statut: q.loyer ? (q.saison ? 'saisonnier' : q.meuble ? 'meuble' : 'vide') : 'vacant', loyer: q.saison ? null : q.loyer, debutBail: '',
    ...(q.sz ? {nuit: q.nuit, nuitsAn: Math.round(q.sz.nuits), fraisSaison: Math.round(q.sz.pctFrais)} : {})};
  return b;
}
function amenagHTML(b) {
  const a = b.amenag, q = planAmenag(b), p = principalDe(b), cours = enCours.has('am:' + b.id);
  return section('Projet d\'aménagement', `<div class="aide">Pas encore habitable : sa valeur est comprise dans celle de ${p ? `<a href="#investissements/${encodeURIComponent(p.id)}">${esc(p.nom)}</a>` : 'ton bien'}. Estime ce qu'il vaudrait et ce qu'il se louerait une fois aménagé en logement à part, puis ajoute-le à Mes projets.</div>
    <div class="grille">
      ${champ(b, 'amenag.ou', 'Où', {options: Object.fromEntries(Object.entries(AMENAG).map(([k, v]) => [k, v.l]))})}
      ${champ(b, 'amenag.m2', 'Surface à aménager (m²)', {ph: 'ex. 40'})}
      ${champ(b, 'amenag.total', 'Coût total des travaux (€)', {step: 1000, ph: q.suggere ? fmt(q.suggere + q.mobSuggere) + ' (estimé)' : 'ton devis ou ton budget', aide: 'Tout compris (mobilier aussi). Vide : estimé au m²'})}
      ${champ(b, 'amenag.decote', 'Décote de cette surface (%)', {ph: AMENAG[q.t].decote + ' (habituel)', aide: 'Moins de lumière, plafond plus bas : vaut moins au m² qu\'un logement classique'})}
      ${champ(b, 'amenag.meuble', 'Pour le louer', {boutons: true, options: [['', 'Vide'], ['1', 'Meublé'], ['nuit', 'À la nuitée']]})}
      ${q.saison ? `${champ(b, 'amenag.nuit', 'Prix moyen par nuit (€)', {step: 5, ph: q.nuit ? fmt(q.nuit) + ' (conseillé)' : 'après l\'estimation', aide: 'Point de départ : loyer meublé du marché ÷ 9, à caler sur les annonces voisines'})}
      ${champ(b, 'amenag.periode', 'Période louée', {options: Object.fromEntries(Object.entries(PERIODES_SAISON).map(([k, v]) => [k, v.l + (v.d ? ' · ' + v.d : '')]))})}
      ${champ(b, 'amenag.occupation', 'Occupation sur l\'année (%)', {step: 5, ph: String(PERIODES_SAISON[PERIODES_SAISON[a.periode] ? a.periode : 'annee'].occ), aide: 'Vide : selon la période (60 % ≈ 220 nuits par an)'})}` : ''}
      ${champ(b, 'amenag.debut', 'Début des travaux', {type: 'month'})}
      ${champ(b, 'amenag.duree', 'Durée du chantier (mois)', {ph: '5'})}
    </div>
    <div class="boutons"><button class="primaire" data-a="amenagEstimer"${cours || !p || !q.m2 ? ' disabled' : ''}>${cours ? 'Estimation en cours…' : !q.m2 ? 'Estimer (surface à remplir)' : q.e ? 'Estimer à nouveau' : 'Estimer une fois aménagé'}</button></div>
    <div id="inv_amenagRes"></div>
    ${q.e ? `<div class="boutons"><button class="primaire" data-a="amenagProjet">${a.projet && typeof PROJETS !== 'undefined' && PROJETS.liste.some(x => x.id === a.projet) ? 'Mettre à jour dans Mes projets' : 'Ajouter à Mes projets'}</button><button data-a="amenagOnglet">Voir le détail dans l'onglet Estimer →</button><button data-a="amenagFait">Travaux terminés</button></div>
    <div class="aide" id="inv_amenagMsg"></div>` : ''}
    <div class="aide">Une pièce habitable doit avoir 2,20 m sous plafond et une fenêtre sur l'extérieur. Changement de destination : déclaration préalable ou permis ; prévoir le traitement de l'humidité en sous-sol.</div>`, true);
}
function majAmenag(b) {
  const el = racine.querySelector('#inv_amenagRes'); if (!el) return;
  const a = b.amenag, q = planAmenag(b), ex = a.estimation;
  if (ex && ex.erreur) { el.innerHTML = `<div class="warnbox">${esc(ex.erreur)}</div>`; return; }
  if (!q.e) { el.innerHTML = ex ? '<div class="aide">Surface ou bien principal modifié depuis l\'estimation : clique sur « Estimer à nouveau ».</div>' : ''; return; }
  const mois = q.loyerDes ? 'dès ' + libMois(q.loyerDes) : `après ${q.duree} mois de chantier`;
  el.innerHTML = `<div class="auto-res"><div class="auto-chiffres">
      <div><span>Valeur une fois aménagé</span><b>${kEur(q.valeur)}</b><small>logement de ${fmt(q.m2)} m² estimé ${kEur(q.e.prix)}, moins ${q.decote} % (${esc(AMENAG[q.t].l.toLowerCase())})</small></div>
      ${q.sz ? `<div><span>À la nuitée</span><b>${eur(q.loyer)}/mois</b><small>recettes moyennes : ${eur(q.nuit)} × ${fmt(q.sz.nuits)} nuits par an ; ${eur(q.sz.netMois)}/mois après plateforme, ménage et charges · ${mois}</small></div>`
        : `<div><span>Loyer possible</span><b>${q.loyer != null ? eur(q.loyer) + '/mois' : '—'}</b><small>${q.meuble ? 'meublé' : 'vide'}, hors charges · ${mois}</small></div>`}</div></div>
    <div class="calc">${q.saisi ? `<div><span>Montant que tu as saisi${q.suggere ? ` (estimé au m² : ${kEur(q.suggere + q.mobSuggere)})` : ''}</span><b>${kEur(q.travaux)}</b></div>`
      : `${q.postes.map(([l, v]) => `<div><span>${l}</span><b>${kEur(v)}</b></div>`).join('')}
      ${q.mobilier ? `<div><span>Mobilier pour louer meublé</span><b>${kEur(q.mobilier)}</b></div>` : ''}`}
      <div class="tot"><span><b>Coût des travaux</b>, chantier d'environ ${q.duree} mois${q.debut ? ' à partir de ' + libMois(q.debut) : ''}</span><b>${eur(q.travaux + q.mobilier)}</b></div>
      <div><span>Valeur créée</span><b>${q.creee >= 0 ? '+' : '−'}${kEur(Math.abs(q.creee))}</b></div></div>
`;
}
async function estimerAmenag(b0) {
  const p = principalDe(b0), cle = 'am:' + b0.id;
  if (!p || enCours.has(cle) || !(b0.amenag.m2 > 0)) return;
  enCours.add(cle); vueDetail(b0);
  const le = new Date().toISOString().slice(0, 10), k = cleAmenag(b0);
  let res;
  try {
    if (!p.geo || (!p.geo.manuel && p.geo.pour !== p.adresse.trim())) {
      const f = p.adresse.trim().length >= 5 && (await geocode(p.adresse.trim()))[0];
      if (!f) throw new Error(`Adresse de ${p.nom} introuvable : renseigne-la (ou place le bien sur la carte) pour estimer cet espace.`);
      p.geo = {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label, pour: p.adresse.trim()};
    }
    const crit = {...criteresEffectifs(p), location: 'vide', chambre: false};
    res = await moteur.estimer({lat: p.geo.lat, lon: p.geo.lon, type: TYPE_DVF[p.type] || TYPE_DVF.appart, surf: Math.max(9, b0.amenag.m2), criteres: crit});
  } catch (err) { res = {erreur: err.message === 'trop long' ? 'L\'estimation a pris trop de temps (le service des ventes répond mal). Réessaie dans un instant.' : err.message || String(err)}; }
  enCours.delete(cle);
  const b = biens.find(x => x.id === b0.id) || b0;
  b.amenag.estimation = res.erreur ? {erreur: res.erreur, cle: k, le} : {prix: res.prix, loyer: res.loyer, loyerVide: res.loyerVide ?? null, loyerMeuble: res.loyerMeuble ?? null, cle: k, le};
  sauver(b, p);
  if (ouvert === b.id) vueDetail(b);
}
// « Ajouter à Mes projets » : un projet de travaux seuls (rien à acheter), financé dans l'onglet Financer
function amenagVersProjet(b) {
  const q = planAmenag(b), p = principalDe(b); if (!q.e || !p || !window.CF_APP || !CF_APP.enregistrerAmenagement) return;
  const sci = p.structure === 'sci' ? scis.find(x => x.id === p.sciId) : null;
  const id = CF_APP.enregistrerAmenagement({id: b.amenag.projet, nom: b.nom, principal: p.nom, bien: b.id, type: p.type === 'maison' ? 'maison' : 'appart', surf: q.m2,
    travaux: q.travaux, mobilier: q.mobilier, valeurApres: q.valeur, loyer: q.loyer || 0, meuble: q.meuble, duree: q.duree,
    saison: q.sz ? {nuit: q.nuit, occupation: q.occupation, charges: q.charges} : null, debut: q.debut, loyerDes: q.loyerDes,
    struct: sci ? sci.regime : 'np', sciExist: sci ? sci.id : ''});
  const deja = !!b.amenag.projet;
  b.amenag.projet = id; sauver(b);
  // Boutons et message hors du bloc recalculé : quitter un champ le redessine, le clic ne doit pas tomber sur un bouton remplacé
  const m = racine.querySelector('#inv_amenagMsg'), btn = racine.querySelector('[data-a="amenagProjet"]');
  if (m) m.innerHTML = `${deja ? 'Mis à jour' : 'Ajouté'} dans <a href="#projets">Mes projets</a> : financement des travaux à régler dans l'onglet Financer.`;
  if (btn) btn.textContent = 'Mettre à jour dans Mes projets';
}
// Bandeaux en haut de la fiche : bien associé à un autre, et vente enregistrée
function lienHTML(b) {
  const pr = principalDe(b);
  return pr ? `<div class="lie-a">Associé à <a href="#investissements/${encodeURIComponent(pr.id)}">${esc(pr.nom)} →</a> <button class="lien" data-a="dissocier">Dissocier</button></div>` : '';
}
function venduHTML(b) {
  const v = b.vendu;
  return `<div class="okbox vendu-bandeau"><b>Vendu en ${libMois(v.mois)} pour ${eur(v.prix)}</b>${v.pv != null ? ` · plus-value ${eur(v.pv)}` : ''}${v.impots != null ? ` · impôts ${eur(v.impots)}` : ''}${v.net != null ? ` · ${v.dansSci ? 'resté dans la SCI' : 'ce qui t\'est revenu'} ${eur(v.net)}` : ''}.
    Il ne compte plus dans tes totaux. <button class="lien" data-a="venteAnnuler">Annuler la vente</button></div>`;
}
function vueSci(x) {
  const sesBiens = detenus().filter(b => b.structure === 'sci' && b.sciId === x.id), t = totaux(sesBiens);
  const totalParts = somme(x.associes, a => a.parts);
  let h = `<div class="titre-discret"><a class="retour" href="#investissements">← Mon patrimoine</a>${boutonDiscret()}${pastilleCompte()}</div>
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
    ${section('Biens de la SCI', `${sesBiens.length ? `<div class="liste">${sesBiens.map((b, i) => enProjet(b) ? '' : carte(b, t.cs[i])).join('')}</div>` : '<div class="aide">Aucun bien rattaché. Dans la fiche d\'un bien, choisis cette SCI dans « Détenu par », ou ajoute-en un ici.</div>'}
      <button data-a="ajoutBienSci">+ Ajouter un bien à cette SCI</button>`, true)}
    ${section('Partenaires', `<div class="grille">${champ(x, 'banque', 'Banque', {type: 'text'})}${champ(x, 'comptable', 'Expert-comptable', {type: 'text'})}${champ(x, 'compta', 'Honoraires du comptable (€/an)', {step: 50, aide: comptaSciAide(x)})}</div>`)}
    ${section('Notes', champ(x, 'notes', '', {zone: true, ph: 'Assemblées générales, comptes courants d\'associés, échéances…'}))}
    </div>
    <div class="pied"><button class="danger" data-a="supprSci">Supprimer cette SCI</button></div>`;
  racine.innerHTML = h;
  majParts(x, t); vignettes();
}
// Ce qui revient à chaque associé (au prorata de ses parts)
function majParts(x, t = totaux(detenus().filter(b => b.structure === 'sci' && b.sciId === x.id))) {
  x.associes.forEach((a, i) => {
    const el = racine.querySelector(`[data-part="${i}"]`); if (!el) return;
    el.innerHTML = a.parts > 0 ? mini([['Sa part du patrimoine net', t.V ? kEur(t.net * a.parts / 100) : null, signe(t.net)], ['Sa part du cash-flow', eur(t.cf * a.parts / 100) + '/mois', signe(t.cf)]], 'petit') : '';
  });
  const tp = somme(x.associes, a => a.parts), el = racine.querySelector('#inv_parts');
  if (el) el.textContent = x.associes.length && Math.abs(tp - 100) > 0.01 ? `Total des parts : ${String(Math.round(tp * 100) / 100).replace('.', ',')} % (devrait faire 100 %).` : '';
}
// ---------- Simulation de vente (règles 2026) ----------
// Plus-value des particuliers (et des associés d'une SCI à l'IR) : 19 % d'impôt + 17,2 % de prélèvements sociaux,
// abattements pour durée de détention (exonération d'impôt après 22 ans, de prélèvements après 30 ans), surtaxe
// au-delà de 50 000 € avec lissage. SCI à l'IS : plus-value = prix − valeur nette comptable (après amortissements),
// à l'IS (15 % jusqu'à 42 500 €, 25 % au-delà), puis flat tax 31,4 % sur ce qui est distribué en dividendes.
const IR_PV = 0.19, PS_PV = 0.172, PFU_2026 = 0.314, IS_TAUX_REDUIT = 0.15, IS_TAUX = 0.25, IS_PLAFOND = 42500;
const abatIR = n => n < 6 ? 0 : n < 22 ? (n - 5) * 0.06 : 1;
const abatPS = n => n < 6 ? 0 : n <= 21 ? (n - 5) * 0.0165 : n === 22 ? 0.28 : n < 30 ? 0.28 + (n - 22) * 0.09 : 1;
function surtaxePV(pv) {
  const t = [[50000, 60000, 0.02, 1 / 20], [100000, 110000, 0.03, 1 / 10], [150000, 160000, 0.04, 0.15], [200000, 210000, 0.05, 0.20], [250000, 260000, 0.06, 0.25]];
  if (pv <= 50000) return 0;
  for (let i = t.length - 1; i >= 0; i--) {
    const [bas, haut, taux, lissage] = t[i];
    if (pv > haut) return pv * taux;
    if (pv > bas) return pv * taux - (haut - pv) * lissage;
  }
  return 0;
}
const anneesEntre = (de, a) => de && a ? Math.floor(ecartMois(de, a) / 12) : null;
function simulerVente(b) {
  const v = b.vente || {}, a = b.achat, sci = sciDe(b), regime = sci ? sci.regime : 'np';
  const mois = v.mois || moisCourant(), prix = v.prix ?? b.valeur ?? 0, frais = v.agence === false ? v.fraisFixe ?? FRAIS_SANS_AGENCE : prix * (v.frais ?? 4) / 100;
  // Crédits soldés à la vente : restant dû à la date de vente, et indemnités (plafond légal : 6 mois d'intérêts, 3 % du restant dû)
  // Crédit commun à plusieurs biens : seulement la part de ce bien (la banque demande en général de la rembourser à la vente)
  const prets = [...b.prets.map(p => ({p, k: partPorteur(p)})), ...pretsRecus(b)].map(x => ({...x, e: etatPret(x.p, mois)})).filter(x => x.e && x.e.crd > 0 && x.k > 0);
  const crd = somme(prets, x => x.e.crd * x.k);
  const iraAuto = somme(prets, x => Math.min(0.03 * x.e.crd, 6 * x.e.crd * (x.p.taux || 0) / 1200) * x.k);
  const ira = v.ira ?? iraAuto;
  const annees = anneesEntre(a.date, mois);
  const partBien = partDe(b), partSci = sci ? Math.max(0, Math.min(100, v.parts ?? 100)) / 100 : 1, k = partBien * partSci;
  const r = {mois, prix, frais, crd, ira, iraAuto, annees, regime, k, partBien, partSci, prets: prets.length};
  r.liquide = prix - frais - crd - ira;   // ce qui reste de la vente, avant impôt (pour le bien entier)
  if (regime === 'is') {
    const construit = a.mode === 'construction';
    const acquisition = (a.prix || 0) + (construit ? a.construction || 0 : 0) + (v.fraisAchat ?? ((a.notaire || 0) + (a.frais || 0))) + (v.travaux ?? (a.travaux || 0));
    // Amortissement : le bâti seulement (≈ 85 % du prix d'un bien acheté ; toute la construction pour une maison construite) sur 30 ans,
    // les travaux sur 15 ans (comme dans Financer) ; jamais plus que leur coût, même détenus plus longtemps
    const ansAmort = construit ? anneesEntre(a.finTravaux || a.debutTravaux, mois) : annees;
    const amortAuto = ansAmort != null ? Math.round((construit ? a.construction || 0 : (a.prix || 0) * 0.85) * Math.min(Math.max(0, ansAmort), 30) / 30
      + (a.travaux || 0) * Math.min(Math.max(0, ansAmort), 15) / 15) : 0;
    r.amort = v.amort ?? amortAuto; r.amortAuto = amortAuto;
    r.vnc = Math.max(0, acquisition - r.amort);
    r.pv = prix - frais - r.vnc;
    const base = Math.max(0, r.pv) * partBien;   // la SCI ne vend que sa part du bien
    r.is = IS_TAUX_REDUIT * Math.min(base, IS_PLAFOND) + IS_TAUX * Math.max(0, base - IS_PLAFOND);
    r.dansSci = r.liquide * partBien - r.is;
    r.sortir = !!v.sortir;
    // Sortie : le bénéfice de la vente part en dividendes (flat tax) ; le reste rembourse tes apports (compte courant), sans impôt
    r.dividendes = r.sortir ? Math.max(0, Math.min(r.dansSci, base - r.is)) : 0;
    r.pfu = r.dividendes * PFU_2026;
    r.impots = r.is + r.pfu;
    r.pourToi = (r.dansSci - r.pfu) * partSci;
  } else {
    const rp = regime === 'np' && b.location.statut === 'rp', construit = a.mode === 'construction';
    // Maison construite : prix d'acquisition = terrain + construction ; forfait de 15 % : 5 ans comptés depuis la fin de la construction
    const acq = (a.prix || 0) + (construit ? a.construction || 0 : 0);
    const ansForfait = construit ? anneesEntre(a.finTravaux || a.debutTravaux, mois) : annees;
    const fraisAchat = v.fraisAchat ?? Math.max((a.notaire || 0) + (a.frais || 0), 0.075 * (a.prix || 0));
    const travaux = v.travaux ?? (ansForfait != null && ansForfait >= 5 ? Math.max(a.travaux || 0, 0.15 * acq) : (a.travaux || 0));
    r.fraisAchat = fraisAchat; r.travaux = travaux; r.rp = rp; r.construit = construit;
    r.pv = prix - frais - (acq + fraisAchat + travaux);
    const pvPart = Math.max(0, r.pv) * k;
    // Abattements : la part de plus-value du terrain compte depuis l'achat du terrain, celle de la maison depuis le début des travaux
    const tranches = construit && (a.construction || 0) > 0
      ? [[(a.prix || 0) / acq, annees ?? 0], [(a.construction || 0) / acq, anneesEntre(a.debutTravaux || a.finTravaux, mois) ?? 0]]
      : [[1, annees ?? 0]];
    r.ir = 0; r.ps = 0; let baseSurtaxe = 0;
    for (const [poids, n] of tranches) {
      const pvT = pvPart * poids;
      r.ir += pvT * (1 - abatIR(n)) * IR_PV; r.ps += pvT * (1 - abatPS(n)) * PS_PV; baseSurtaxe += pvT * (1 - abatIR(n));
    }
    r.abIR = pvPart ? 1 - r.ir / (pvPart * IR_PV) : abatIR(annees ?? 0); r.abPS = pvPart ? 1 - r.ps / (pvPart * PS_PV) : abatPS(annees ?? 0);   // abattements moyens
    r.anneesMaison = construit ? anneesEntre(a.debutTravaux || a.finTravaux, mois) : null;
    // Vente de 15 000 € ou moins (garage, place de parking…) : plus-value exonérée (seuil apprécié sur la part vendue)
    r.petite = !rp && prix * partBien <= 15000 && prix > 0;
    if (rp || r.petite) { r.ir = 0; r.ps = 0; baseSurtaxe = 0; }
    r.surtaxe = rp ? 0 : surtaxePV(baseSurtaxe);
    r.impots = r.ir + r.ps + r.surtaxe;
    r.pourToi = r.liquide * k - r.impots;
  }
  r.manqueAchat = !(a.prix > 0) || !a.date || (a.mode === 'construction' && !(a.construction > 0));
  return r;
}
// Frais de vente : avec agence (commission + diagnostics, ~4 %) ou sans agence (diagnostics seuls, ~1 %)
const FRAIS_SANS_AGENCE = 600;   // diagnostics obligatoires : environ 300 à 800 €
function fraisVenteHTML(b) {
  const v = b.vente || {}, sans = v.agence === false;
  const c = sans ? champ(b, 'vente.fraisFixe', 'Frais de vente (€)', {step: 50, ph: String(FRAIS_SANS_AGENCE), aide: 'Diagnostics obligatoires (environ 300 à 800 €), et mainlevée d\'hypothèque s\'il reste un crédit'})
    : champ(b, 'vente.frais', 'Frais de vente (%)', {step: 0.5, ph: '4', aide: 'Commission d\'agence et diagnostics (environ 4 %), modifiable'});
  return c.replace('<div class="', '<div id="inv_fraisVente" class="')
    .replace('<input ', `<div class="seg mini vente-agence"><button type="button" data-a="venteAgence" data-v="1" class="${sans ? '' : 'on'}">Avec agence</button><button type="button" data-a="venteAgence" data-v="0" class="${sans ? 'on' : ''}">Sans agence</button></div><input `);
}
function venteHTML(b) {
  const sci = sciDe(b), regime = sci ? sci.regime : 'np', v = b.vente || {};
  return `<section class="bloc large vente" id="inv_vente"><h3>Si je vends ce bien</h3>
    <div class="grille vente-params">
      ${champ(b, 'vente.prix', 'Prix de vente (€)', {step: 1000, ph: b.valeur ? fmt(b.valeur) + ' (valeur actuelle)' : ''})}
      ${champ(b, 'vente.mois', 'Vendu en', {type: 'month', ph: moisCourant()})}
      ${fraisVenteHTML(b)}
      ${champ(b, 'vente.ira', 'Indemnités du crédit (€)', {step: 100, ph: 'calculées', aide: 'Remboursement anticipé (IRA)'})}
      ${regime === 'is' ? `${champ(b, 'vente.amort', 'Amortissements déjà déduits (€)', {step: 1000, ph: 'estimés', aide: 'Voir le bilan de la SCI'})}
        ${champ(b, 'vente.parts', 'Tes parts dans la SCI (%)', {step: 1, ph: '100'})}`
        : `${champ(b, 'vente.fraisAchat', 'Frais d\'achat à déduire (€)', {step: 100, ph: 'réels ou 7,5 %'})}
        ${champ(b, 'vente.travaux', 'Travaux à déduire (€)', {step: 500, ph: 'factures ou 15 %'})}
        ${regime === 'ir' ? champ(b, 'vente.parts', 'Tes parts dans la SCI (%)', {step: 1, ph: '100'}) : ''}`}
    </div>
    ${regime === 'is' ? `<div class="seg mini vente-sortie"><button data-a="venteSortir" data-v="0" class="${v.sortir ? '' : 'on'}">Garder l'argent dans la SCI</button><button data-a="venteSortir" data-v="1" class="${v.sortir ? 'on' : ''}">Le sortir (dividendes)</button></div>` : ''}
    <div id="inv_venteRes"></div>
    ${(l => l.length ? `<div class="aide">Non compris dans cette vente : ${l.map(x => `<a href="#investissements/${encodeURIComponent(x.id)}">${esc(x.nom)}</a>`).join(', ')} (bien associé, à vendre depuis sa fiche).</div>` : '')(associesA(b).filter(x => !x.vendu))}
    <div class="boutons"><button data-a="venteEnregistrer">C'est vendu : enregistrer la vente</button></div>
    <div class="aide">Le bien passe dans « Biens vendus » et ne compte plus dans tes totaux (tu peux annuler).</div></section>`;
}
function majVente(b) {
  const el = racine.querySelector('#inv_venteRes'); if (!el) return;
  const r = simulerVente(b), ligne = (l, val, cls = '') => `<div><span>${l}</span><b class="${cls}">${val}</b></div>`;
  const moins = x => x ? '−' + eur(x) : eur(0), partTxt = r.k < 1 ? ` (ta part : ${String(Math.round(r.k * 1000) / 10).replace('.', ',')} %)` : '';
  let h = mini([[r.regime === 'is' && !r.sortir ? 'Reste dans la SCI' + (r.partSci < 1 ? ' (ta part)' : '') : 'Ce qui te revient', eur(r.regime === 'is' && !r.sortir ? r.dansSci * r.partSci : r.pourToi), (r.regime === 'is' && !r.sortir ? r.dansSci : r.pourToi) >= 0 ? 'up' : 'down'],
    ['Impôts', eur(r.impots)], ['Plus-value', eur(r.pv), signe(r.pv)], ['Détention', r.annees != null ? r.annees + ' an' + (r.annees > 1 ? 's' : '') : null]], 'vente-chiffres');
  h += `<div class="calc">
    ${ligne('Prix de vente', eur(r.prix))}
    ${ligne(`Frais de vente`, moins(r.frais))}
    ${r.prets ? ligne(`Crédit remboursé (restant dû en ${libMois(r.mois)})`, moins(r.crd)) : ''}
    ${r.ira ? ligne(`Indemnités de remboursement anticipé${b.vente && b.vente.ira != null ? '' : ' (plafond légal)'}`, moins(r.ira)) : ''}`;
  if (r.regime === 'is') {
    h += `${r.partBien < 1 ? ligne(`Part de la SCI dans le bien (${Math.round(r.partBien * 100)} %)`, eur(r.liquide * r.partBien)) : ''}
      ${ligne('Impôt sur les sociétés sur la plus-value', moins(r.is))}
      ${ligne('<b>Reste dans la SCI</b>', eur(r.dansSci), signe(r.dansSci))}
      ${r.sortir ? `${ligne('Flat tax 31,4 % sur les dividendes', moins(r.pfu))}${r.partSci < 1 ? ligne(`Tes parts (${Math.round(r.partSci * 100)} %)`, '× ' + Math.round(r.partSci * 100) + ' %') : ''}${ligne('<b>Ce qui te revient</b>', eur(r.pourToi), signe(r.pourToi))}` : ''}</div>
      ${mini([['Valeur nette comptable', eur(r.vnc)], ['Amortissements déduits', eur(r.amort) + (b.vente && b.vente.amort != null ? '' : ' (estimés)')], ['Plus-value imposable', eur(Math.max(0, r.pv))], ['Dividendes distribués', r.sortir ? eur(r.dividendes) : null]], 'petit')}
      <div class="aide">${r.sortir ? 'Le bénéfice de la vente sort en dividendes (flat tax 31,4 %) ; le reste rembourse tes apports en compte courant, sans impôt.' : 'Tant que l\'argent reste dans la SCI, pas de flat tax : elle ne s\'applique qu\'aux dividendes que tu sortiras.'} Amortissements, compte courant et IS dépendent des comptes de la SCI : à valider avec ton comptable.</div>`;
  } else {
    h += `${r.k < 1 ? ligne(`Ta part${partTxt}`, eur(r.liquide * r.k)) : ''}
      ${r.rp ? ligne('Résidence principale : plus-value exonérée', eur(0)) : r.petite ? ligne('Vente de 15 000 € ou moins : plus-value exonérée', eur(0)) : `${ligne(`Impôt sur la plus-value (19 %, abattement ${Math.round(r.abIR * 100)} %)`, moins(r.ir))}
      ${ligne(`Prélèvements sociaux (17,2 %, abattement ${String(Math.round(r.abPS * 1000) / 10).replace('.', ',')} %)`, moins(r.ps))}
      ${r.surtaxe ? ligne('Surtaxe (plus-value de plus de 50 000 €)', moins(r.surtaxe)) : ''}`}
      ${ligne('<b>Ce qui te revient</b>', eur(r.pourToi), signe(r.pourToi))}</div>
      ${mini([['Plus-value brute', eur(r.pv)], ['Frais d\'achat déduits', eur(r.fraisAchat)], ['Travaux déduits', eur(r.travaux)], ['Maison : détention', r.construit && r.anneesMaison != null ? r.anneesMaison + ' ans depuis le début des travaux' : null], ['Exonération totale', r.annees != null && !r.rp ? (n => n >= 30 ? 'atteinte' : 'dans ' + (30 - n) + ' ans')(r.construit && r.anneesMaison != null ? Math.min(r.annees, r.anneesMaison) : r.annees) : null]], 'petit')}
      <div class="aide">${r.regime === 'ir' ? 'SCI à l\'IR : la plus-value est imposée chez chaque associé selon ses parts ; l\'argent peut ensuite sortir de la SCI sans nouvel impôt. ' : ''}${r.construit ? 'Maison construite : prix d\'achat = terrain + construction ; la plus-value du terrain compte depuis son achat, celle de la maison depuis le début des travaux. ' : ''}Frais d'achat : réels ou forfait de 7,5 % ; travaux : factures, ou forfait de 15 % après 5 ans de détention${r.construit ? ' (comptés depuis la fin de la construction)' : ''}.</div>`;
  }
  if (r.manqueAchat) h += `<div class="warnbox">${b.achat.mode === 'construction' ? 'Renseigne le prix et la date d\'achat du terrain, le coût et le début de la construction' : 'Renseigne le prix et la date d\'achat'} (bloc Achat) : sans eux, la plus-value et les abattements sont faux.</div>`;
  el.innerHTML = h;
}
function pretHTML(b, p, i) {
  const c = `prets.${i}.`;
  return `<div class="pret"><div class="pret-tete"><b>${esc(p.banque || 'Prêt ' + (i + 1))}</b><button class="lien" data-a="supprPret" data-i="${i}">Retirer</button></div>
    <div class="grille">
      ${champ(b, c + 'banque', 'Banque', {type: 'text'})}${champ(b, c + 'montant', 'Montant emprunté (€)', {step: 1000})}
      ${champ(b, c + 'taux', 'Taux nominal (%)', {step: 0.01})}${champ(b, c + 'duree', 'Durée totale (mois)', {aide: '240 = 20 ans'})}
      ${champ(b, c + 'debut', '1re échéance', {type: 'month'})}${champ(b, c + 'offre', 'Date de l\'offre', {type: 'month', aide: 'Pour comparer au taux du marché de l\'époque'})}
      ${champ(b, c + 'progressif', 'Mensualité', {options: [['', 'Constante'], ['1', 'Progressive (augmente chaque année)']], boutons: true, large: true})}
      ${p.progressif ? champ(b, c + 'mensualite', 'Mensualité actuelle hors assurance (€)', {step: 0.01, ph: 'à saisir', aide: 'Celle que tu paies ' + (p.mensuLe && p.mensuLe !== moisCourant() ? 'en ' + libMois(p.mensuLe) : 'ce mois-ci')})
        + champ(b, c + 'hausse', 'Hausse par an (%)', {step: 0.01, ph: 'calculée', aide: 'Sur ton tableau d\'amortissement : compare la mensualité d\'une année à celle de l\'année suivante (ex. 497 € puis 504 € : 1,4 %). Vide : calculée pour finir le prêt à la date prévue.'})
        : champ(b, c + 'mensualite', 'Mensualité hors assurance (€)', {step: 0.01, ph: 'calculée'})}
      ${champ(b, c + 'assurance', 'Assurance (€/mois)', {step: 0.01})}
      ${champ(b, c + 'typeDiff', 'Différé', {options: [['', 'Sans différé'], ['partiel', 'Partiel (intérêts seuls)'], ['total', 'Total (rien à payer)']], boutons: true, large: true})}
      ${p.typeDiff ? champ(b, c + 'differe', 'Durée du différé (mois)', {aide: `Compris dans la durée totale, à partir de la 1re échéance. ${p.typeDiff === 'total' ? 'Seule l\'assurance est payée, les intérêts s\'ajoutent au capital.' : 'Tu paies les intérêts et l\'assurance, sans rembourser de capital.'}`}) : ''}
    </div>
    <details class="releve"${p.crd ? ' open' : ''}><summary>Restant dû relevé sur le tableau d'amortissement (plus précis)</summary>
      <div class="grille">${champ(b, c + 'crd', 'Restant dû (€)', {step: 0.01})}${champ(b, c + 'mois', 'Mois restants')}${champ(b, c + 'crdLe', 'À la date du', {type: 'month'})}</div>
      <div class="aide">Tient compte d'un différé ou d'un remboursement anticipé ; le site fait avancer ce restant dû chaque mois${p.typeDiff ? ' (le différé saisi plus haut n\'est alors plus compté)' : ''}.</div></details>
    ${partageHTML(b, p, i)}
    <div class="resume" data-resume="${i}"></div>
    ${p.rachat && p.rachat.ouvert ? rachatHTML(b, p, i) : ''}</div>`;
}
// Un seul prêt pour plusieurs biens : les autres biens qu'il finance (boutons), et la part de chacun
function partageHTML(b, p, i) {
  const autres = biens.filter(y => y !== b && !y.vendu && !(y.amenag && !y.amenag.fait));
  const l = partagesDe(p);
  if (!autres.length && !l.length) return '';
  const k = partPorteur(p), trop = somme(l, x => x.part) > 100;
  return `<div class="partage"><div class="partage-titre">Ce prêt finance aussi</div>
    <div class="filtres">${autres.map(y => `<button type="button" data-a="partagePret" data-i="${i}" data-id="${esc(y.id)}" class="${l.some(x => x.id === y.id) ? 'on' : ''}">${esc(y.nom)}</button>`).join('')}</div>
    ${l.length ? `<div class="grille">${(p.partage || []).map((x, j) => (y => y ? champ(b, `prets.${i}.partage.${j}.part`, `Part de ${esc(y.nom)} (%)`, {step: 1}) : '')(biens.find(z => z.id === x.id))).join('')}
      <div><label>Part de ${esc(b.nom)}</label><div class="part-porteur${trop ? ' neg' : ''}"><b>${Math.round(k * 100)} %</b></div></div></div>
      ${trop ? '<div class="warnbox">Les parts des autres biens dépassent 100 % : baisse-les.</div>' : ''}
      <div class="boutons"><button type="button" data-a="partageProrata" data-i="${i}">Répartir au prorata des prix d'achat</button></div>
      <div class="aide">Une seule mensualité et un seul restant dû, partagés entre les biens : chaque fiche compte sa part dans son cash-flow et son patrimoine net, et les totaux ne comptent le prêt qu'une fois.</div>`
    : '<div class="aide">Un seul crédit pour plusieurs biens (par exemple deux appartements achetés au même vendeur) : choisis les autres biens qu\'il finance.</div>'}</div>`;
}
// Fiche d'un bien financé par le prêt d'un autre bien : sa part, en lecture (le prêt se modifie sur la fiche qui le porte)
function pretRecuHTML(x) {
  const e = etatPret(x.p), co = [x.de, ...partagesDe(x.p).map(z => biens.find(y => y.id === z.id))].filter(y => y && y.id !== ouvert);
  return `<div class="pret recu"><div class="pret-tete"><b>${esc(x.p.banque || 'Prêt commun')}</b><span class="aide">commun avec ${co.map(y => `<a href="#investissements/${encodeURIComponent(y.id)}">${esc(y.nom)}</a>`).join(', ')}</span></div>
    ${e && e.mois > 0 ? mini([['Part de ce bien', Math.round(x.k * 100) + ' %'], ['Mensualité (sa part)', eur((e.pause ? 0 : e.M + e.assur) * x.k)],
      ['Restant dû (sa part)', eur(e.crd * x.k)], ['Prêt entier', eur(e.crd) + ' restant dû']]) : `<div class="aide">${e ? 'Prêt remboursé.' : 'Prêt pas encore rempli.'}</div>`}
    <div class="aide">Le prêt et la répartition se modifient sur la fiche de <a href="#investissements/${encodeURIComponent(x.de.id)}">${esc(x.de.nom)}</a>.</div></div>`;
}
// Simulation de rachat ou renégociation : champs (vides = valeurs d'aujourd'hui), résultats mis à jour à chaque saisie
function rachatHTML(b, p, i) {
  const c = `prets.${i}.rachat.`, r = p.rachat, s = simulerRachat(b, p) || {}, reneg = r.mode === 'reneg';
  const autres = b.prets.filter(q => q !== p && (e => e && e.mois > 0 && e.crd > 0)(etatPret(q)));
  const t2 = v => v != null ? v.toFixed(2).replace('.', ',') : '';
  return `<div class="rachat"><div class="pret-tete"><b>Simulation : rachat ou renégociation</b><button class="lien" data-a="rachatFermer" data-i="${i}">Fermer</button></div>
    <div class="grille">
      ${champ(b, c + 'mode', 'Qui reprend le prêt ?', {options: [['', 'Une autre banque (rachat)'], ['reneg', 'Ma banque (renégociation)']], boutons: true, large: true})}
      ${autres.length ? `<div class="large"><label>Regrouper avec</label><div class="seg multi">${autres.map(q => `<button type="button" data-a="rachatAvec" data-i="${i}" data-id="${esc(q.id)}" class="${(r.avec || []).includes(q.id) ? 'on' : ''}">${esc(q.banque || 'Prêt ' + (b.prets.indexOf(q) + 1))}</button>`).join('')}</div><div class="aide">Les prêts choisis sont remboursés par le nouveau : un seul prêt, une seule mensualité.</div></div>` : ''}
      ${champ(b, c + 'taux', 'Nouveau taux (%)', {step: 0.01, ph: s.tAuj != null ? t2(s.tAuj) + ' (marché)' : '', aide: `Taux du marché ${esc(T.TAUX_ACTUEL.mois)}${b.structure !== 'np' ? ', SCI comprise' : ''} pour cette durée`})}
      ${champ(b, c + 'duree', 'Nouvelle durée (mois)', {ph: s.nAuj ? s.nAuj + ' (restante)' : '', aide: 'Par défaut, la durée qui reste'})}
      ${champ(b, c + 'assurance', 'Nouvelle assurance (€/mois)', {step: 0.01, ph: s.assurAvant ? t2(s.assurAvant) + ' (actuelle)' : '0'})}
      ${reneg ? champ(b, c + 'avenant', 'Frais d\'avenant (€)', {step: 50, ph: '600'})
        : `${champ(b, c + 'ira', 'Indemnités de remboursement anticipé (€)', {step: 100, ph: s.iraAuto != null ? fmt(s.iraAuto) + ' (plafond)' : '', aide: 'Au plus 6 mois d\'intérêts ou 3 % du restant dû ; parfois 0 dans le contrat'})}
        ${champ(b, c + 'dossier', 'Frais de dossier (€)', {step: 100, ph: '1 000'})}
        ${champ(b, c + 'garantie', 'Garantie (€)', {step: 100, ph: s.crd ? fmt(Math.round(0.015 * s.crd)) + ' (≈ 1,5 %)' : '', aide: 'Caution (Crédit Logement…) ou hypothèque'})}`}
      ${champ(b, c + 'finance', 'Frais', {options: [['', 'Payés de ma poche'], ['1', 'Ajoutés au nouveau prêt']], boutons: true, large: true})}
    </div>
    <div data-rachat="${i}"></div></div>`;
}
function rachatResHTML(b, p) {
  const s = simulerRachat(b, p);
  if (!s) return '<div class="aide">Renseigne le taux et le restant dû du prêt pour simuler.</div>';
  const ligne = (l, a, n) => `<div class="l2"><span>${l}</span><b>${a}</b><b>${n}</b></div>`;
  const ans = m => m < 12 ? m + ' mois' : m % 12 ? `${Math.floor(m / 12)} ans et ${m % 12} mois` : m / 12 + ' ans';
  return `${mini([['Nouvelle mensualité', eur(s.mensuApres) + (s.assur ? ' assurance comprise' : '')],
      ['Différence', (s.diffMois >= 0 ? '−' : '+') + eur(Math.abs(s.diffMois)) + '/mois', s.diffMois > 0 ? 'up' : 'down'],
      ['Gain net', eur(s.gain), signe(s.gain)], ['Rentable après', s.equilibre ? ans(s.equilibre) : 'jamais', s.equilibre ? '' : 'down']])}
    <div class="calc">
      <div class="l2 tete"><span></span><span>Aujourd'hui</span><span>Après</span></div>
      ${ligne('Mensualité, assurance comprise', eur(s.mensuAvant), eur(s.mensuApres))}
      ${ligne('Durée restante', s.nAuj + ' mois', s.duree + ' mois')}
      ${ligne('Taux', p.taux.toFixed(2).replace('.', ',') + ' %' + (s.groupe > 1 ? ' …' : ''), s.taux.toFixed(2).replace('.', ',') + ' %')}
      ${ligne('Capital à rembourser', eur(s.crd), eur(s.crd))}
      ${ligne('Intérêts', eur(s.interetsAvant), eur(s.interetsApres))}
      ${ligne('Assurance', eur(s.assurPayee), eur(s.assurApres))}
      ${ligne(s.reneg ? 'Frais d\'avenant' : 'Indemnités, dossier et garantie', '—', eur(s.frais))}
      ${ligne('<b>Coût total</b>', eur(s.coutAvant), eur(s.coutApres))}
    </div>
    <div class="aide">${s.groupe > 1 ? `${s.groupe} prêts regroupés : ${eur(s.crd)} de restant dû. ` : ''}${s.reneg ? '' : `Frais : indemnités ${eur(s.ira)}, dossier ${eur(s.dossier)}, garantie ${eur(s.garantie)}. `}${s.finance ? `Frais ajoutés au nouveau prêt : ${eur(s.capital)} empruntés. ` : 'Frais payés le jour du rachat. '}${s.equilibre ? `Rentable après ${ans(s.equilibre)} : à partir de là, même en revendant ou en remboursant, tu as gagné (frais et restant dû compris).` : 'Jamais rentable avec ces chiffres : les frais ou la durée en plus coûtent plus que la baisse du taux.'}${s.duree > s.nAuj ? ' Allonger la durée baisse la mensualité mais ajoute des intérêts.' : ''}</div>`;
}
// Chiffres recalculés sans reconstruire le formulaire (pour ne pas perdre le champ en cours de saisie)
function majCalculs(b) {
  const c = calculs(b), q = s => racine.querySelector(s);
  if (simple()) q('#inv_kpis').innerHTML = (k => bilanSimple(moisDe(c, k), {titre: k < 1 ? `Chaque mois (ta part : ${Math.round(k * 100)} %)` : 'Chaque mois', note: 'Moyenne par mois sur les 12 prochains mois, avant impôts.'})
    + `<div class="kpis deux">${kpi('Valeur', b.valeur ? kEur(b.valeur * k) : '—', b.valeur ? '' : 'à renseigner')}${kpi('Ce qui est à toi', c.patrimoine != null ? kEur(c.patrimoine * k) : '—', 'valeur − ce qu\'il reste à rembourser', c.patrimoine != null ? signe(c.patrimoine) : '')}</div>`)(partDe(b));
  else q('#inv_kpis').innerHTML = `<div class="kpis six">
    ${kpi('Valeur', b.valeur ? kEur(b.valeur) : '—', !b.valeur ? 'à renseigner' : !b.valeurManuelle && b.estimation && !b.estimation.erreur ? 'estimée automatiquement' : 'saisie à la main' + (b.valeurLe ? ' (' + libMois(b.valeurLe) + ')' : ''))}
    ${kpi('Restant dû', c.crd ? kEur(c.crd) : '—', c.mensuCredit ? eur(c.mensuCredit) + '/mois assurance comprise' : '')}
    ${kpi('Patrimoine net', c.patrimoine != null ? kEur(c.patrimoine) : '—', 'valeur − restant dû', c.patrimoine != null ? signe(c.patrimoine) : '')}
    ${kpi('Cash-flow', c.loue || c.mensuCredit ? eur(c.cfMois) : '—', 'par mois, avant impôts', signe(c.cfMois))}
    ${kpi(b.type === 'terrain' ? 'Revenus' : 'Loyers', c.loyerMois ? eur(c.loyerMois) : '—', c.loyerMois ? 'par mois, encaissés ce mois-ci' : c.loue ? 'loyer à venir' : 'pas loué')}
    ${kpi('Plus-value latente', c.plusValue != null ? kEur(c.plusValue) : '—', 'valeur − coût total', c.plusValue != null ? signe(c.plusValue) : '')}</div>
    ${partDe(b) < 1 ? (k => `<div class="ta-part"><div class="ta-part-titre">Ta part : ${Math.round(k * 100)} % du bien</div>${mini([
      ['Valeur', b.valeur ? kEur(b.valeur * k) : null], ['Restant dû', c.crd ? kEur(c.crd * k) : null],
      ['Patrimoine net', c.patrimoine != null ? kEur(c.patrimoine * k) : null, signe(c.patrimoine)],
      ['Cash-flow', c.loue || c.mensuCredit ? eur(c.cfMois * k) + '/mois' : null, signe(c.cfMois)]]) || '<div class="aide">Les totaux de la page comptent cette part.</div>'}</div>`)(partDe(b)) : ''}
    ${(l => l.length && !b.vendu ? (t => `<div class="ta-part"><div class="ta-part-titre">Avec ${esc(l.map(x => x.nom).join(', '))}</div>${mini([
      ['Valeur', t.V ? kEur(t.V) : null], ['Patrimoine net', t.V ? kEur(t.net) : null, signe(t.net)],
      ['Loyers', t.loyers ? eur(t.loyers) + '/mois' : null], ['Cash-flow', eur(t.cf) + '/mois', signe(t.cf)]])}</div>`)(totaux([b, ...l])) : '')(associesA(b).filter(x => !x.vendu))}`;
  const ligne = (l, v, cls = '') => `<div><span>${l}</span><b class="${cls}">${v}</b></div>`;
  // Chaque montant sur 12 mois, et sa moyenne par mois à côté
  const ligne2 = (l, an, pre = '', cls = '') => `<div class="l2"><span>${l}</span><b class="${cls}">${an ? pre : ''}${eur(an)}</b><b class="${cls}">${an ? pre : ''}${eur(an / 12)}</b></div>`;
  q('#inv_renta').innerHTML = `<div class="calc">
      <div class="l2 tete"><span></span><span>Par an</span><span>Par mois</span></div>
      ${ligne2(b.type === 'terrain' ? 'Revenus encaissés' : 'Loyers encaissés', c.loyersAn)}
      ${ligne2('Charges du propriétaire', c.chargesAn, '−')}
      ${ligne2('Crédit (mensualités et assurance)', c.creditAn, '−')}
      ${ligne2('<b>Cash-flow</b>', c.cfAn, '', signe(c.cfAn))}
      ${ligne2('Capital remboursé', c.capitalAn, '+')}
      ${ligne2('<b>Enrichissement</b> (cash-flow + capital remboursé)', c.cfAn + c.capitalAn, '', signe(c.cfAn + c.capitalAn))}
      ${c.cout && c.emprunte ? ligne('Apport', eur(Math.max(0, c.cout - c.emprunte)) + (c.cout - c.emprunte <= 0 ? ' (financé à 100 % ou plus)' : '')) : ''}
    </div>
    <div class="aide">Avant impôts.${Object.values(b.chargesAn).every(v => v == null) ? lieSimple(b) ? ' Achat, crédit et charges comptés avec ' + esc(principalDe(b).nom) + '.' : ' Charges du propriétaire à remplir plus bas.' : ''}</div>`;
  // Total des revenus d'un terrain, mis à jour sans reconstruire la section (pour garder le champ en cours)
  const rt = q('#inv_revTotal');
  if (rt && b.location.statut === 'saisonnier') rt.innerHTML = c.loyersAn ? `Recettes : <b>${eur(loyerLogement(b))}</b> par mois en moyenne${nuitee(b) ? ` (${eur(b.location.nuit)} × ${fmt(b.location.nuitsAn || 0)} nuits ÷ 12)` : ''}, ${eur(c.loyersAn)} sur les 12 prochains mois${b.location.fraisSaison ? `, dont ${eur(c.loyersAn * b.location.fraisSaison / 100)} de frais (${b.location.fraisSaison} %)` : ''}.` : 'Renseigne le prix par nuit et les nuits louées par an.';
  else if (rt) rt.innerHTML = b.type !== 'terrain' && LISTES[b.location.statut] ? (l => l.length ? `${l.length} ${b.location.statut === 'lots' ? 'loyer' : 'chambre'}${l.length > 1 ? 's' : ''} : <b>${eur(loyerLogement(b))}</b> par mois au total${(a => a.length ? ` (dont ${a.map(x => `${eur(x.loyer || 0)} à partir de ${libMois(normMois(x.debut))}`).join(', ')})` : '')(l.filter(x => !commence(x)))}, ${eur(c.loyersAn)} sur les 12 prochains mois après vacance.` : '')(lignesLoyer(b))
    : c.loyersAn ? `Revenus : <b>${eur(c.loyersAn)}</b> par an, soit ${eur(c.loyersAn / 12)} par mois.` : '';
  const prixBien = (b.achat.prix || 0) + (b.achat.mode === 'construction' ? b.achat.construction || 0 : 0);
  if (q('#inv_cout')) q('#inv_cout').innerHTML = c.cout ? `Coût total : <b>${eur(c.cout)}</b>${b.surface && prixBien && b.type !== 'terrain' ? ` · ${fmt(prixBien / b.surface)} €/m² ${b.achat.mode === 'construction' ? 'terrain et construction' : 'à l\'achat'}` : ''}` : '';
  b.prets.forEach((p, i) => {
    const r = racine.querySelector(`[data-resume="${i}"]`), s = racine.querySelector(`[data-rachat="${i}"]`);
    if (r) r.innerHTML = resumePret(b, p, c.prets[i].e, i);
    if (s) s.innerHTML = rachatResHTML(b, p);
  });
}
function resumePret(b, p, e, i) {
  if (!e) return '<div class="aide">Remplis le taux, la mensualité et le restant dû (ou le montant, la durée et la 1re échéance) pour voir où en est ce prêt.</div>';
  if (e.mois <= 0) return '<div class="pret-etat"><b>Prêt remboursé</b></div>';
  const a = analyseReneg(p, e, b.structure !== 'np'), dejaPaye = p.montant > 0 ? 1 - e.crd / p.montant : null;
  const taux = v => v.toFixed(2).replace('.', ',') + ' %';
  let h = `<div class="pret-etat">
    ${e.differe ? `<div class="pret-pause">Différé ${e.differe.total ? 'total' : 'partiel'} jusqu'en ${libMois(e.differe.fin)} : ${e.differe.total ? 'assurance seule, les intérêts s\'ajoutent au capital' : `${eur(e.M)} d'intérêts par mois`}, puis ${eur(e.differe.apres)} par mois hors assurance.</div>` : ''}
    ${p.progressif && !e.prog ? '<div class="pret-pause">Mensualité progressive : saisis ta mensualité actuelle (ou la hausse par an) pour en tenir compte.</div>' : ''}
    ${e.pause ? `<div class="pret-pause">${e.debutFutur ? `1re échéance en ${libMois(e.reprise)} : rien à payer d'ici là.` : `En pause jusqu'en ${libMois(e.reprise)} : pas d'échéance, les intérêts s'ajoutent au capital.`}</div>` : ''}
    ${mini([[e.pause ? 'À rembourser à la reprise' : 'Restant dû', eur(e.crd)], ['Mensualité', eur(e.M) + (e.assur ? ' + ' + eur(e.assur) + ' d\'assurance' : '')],
      ['Fin du prêt', libMois(e.fin)], ['Mois restants', String(e.mois - (e.pause || 0))]])}
    ${dejaPaye != null ? `<div class="barre"><span style="width:${Math.max(0, Math.min(100, dejaPaye * 100)).toFixed(1)}%"></span></div><div class="aide">${pct(dejaPaye)} du capital remboursé</div>` : ''}
    ${mini([['Intérêts sur 12 mois', eur(e.interets)], ['Capital remboursé sur 12 mois', eur(e.capital)]], 'petit')}
    ${partagesDe(p).length ? (k => `<div class="aide">Part de ce bien (${Math.round(k * 100)} %) : <b>${eur((e.pause ? 0 : e.M + e.assur) * k)}</b> par mois assurance comprise, ${eur(e.crd * k)} restant dû. Le reste est compté dans ${partagesDe(p).map(x => esc((biens.find(y => y.id === x.id) || {}).nom || '')).join(', ')}.</div>`)(partPorteur(p)) : ''}
    ${e.prog ? `<div class="aide">Mensualité progressive : +${(e.prog.g * 100).toFixed(2).replace('.', ',')} % par an${e.prog.saisie ? '' : ' (calculée avec le montant, le taux et la durée)'}${e.prog.hausse ? `, ${eur(e.prog.hausse.M)} à partir de ${libMois(e.prog.hausse.mois)}` : ''}, jusqu'à ${eur(e.prog.max)} la dernière année.</div>` : ''}
  </div>`;
  if (a && !(p.rachat && p.rachat.ouvert)) h += `<div class="reneg ${a.netAvenant > 0 ? 'oui' : 'non'}"><div class="reneg-titre">Aux taux d'aujourd'hui : ${taux(a.tNew)}${b.structure !== 'np' ? ' (SCI)' : ''} au lieu de ${taux(p.taux)}</div>
    ${mini([['Nouvelle mensualité', eur(a.mensu2)], [e.prog ? 'Différence aujourd\'hui' : 'Différence', (a.gainMois >= 0 ? '−' : '+') + eur(Math.abs(a.gainMois)) + '/mois', a.gainMois > 0 ? 'up' : 'down'],
      ['Gain net : renégociation', '≈ ' + eur(a.netAvenant), signe(a.netAvenant)], ['Gain net : rachat', '≈ ' + eur(a.netRachat), signe(a.netRachat)]])}
    <div class="aide">Renégociation avec ta banque : avenant ≈ 600 €. Rachat par une autre banque : indemnités ≈ ${eur(a.ira)}, plus dossier et garantie.${a.surprime ? ` Surprime payée en ${libMois(a.offre)} : ${a.surprime[0] >= 0 ? '+' : ''}${a.surprime[0].toFixed(2).replace('.', ',')}${a.surprime[1] !== a.surprime[0] ? ' à ' + (a.surprime[1] >= 0 ? '+' : '') + a.surprime[1].toFixed(2).replace('.', ',') : ''} point par rapport au marché de l'époque.` : ''}</div>
    <div class="boutons"><button data-a="rachatOuvrir" data-i="${i}">Simuler un rachat ou une renégociation →</button></div></div>`;
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
  suggAdr = []; sauver(b); vueDetail(b);
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
racine.addEventListener('input', e => {
  if (e.target.id !== 'inv_part') return;
  const o = racine.querySelector('#inv_partVal'); if (o) o.textContent = e.target.value + ' %';
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
function ajouter(o) { const b = nouveauBien(o); biens.push(b); sauver(b); location.hash = '#investissements/' + b.id; }
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
  if (a === 'segChoix') { const sel = document.getElementById(t.dataset.cible); if (sel && sel.value !== t.dataset.v) { sel.value = t.dataset.v; sel.dispatchEvent(new Event('change', {bubbles: true})); } return; }
  if (a === 'connexion') return ouvrirCompte();
  if (a === 'etatCompte') { if (!COMPTE.user) return ouvrirCompte(); if (erreurEtat()) alert(etatCompte); return; }
  if (a === 'discret') {
    discret = !discret;
    try { localStorage.setItem('montants-masques', discret ? '1' : '0'); } catch (e) {}
    document.body.classList.toggle('discret', discret);
    racine.querySelectorAll('.discret-btn').forEach(x => x.outerHTML = boutonDiscret());
    return;
  }
  if (a === 'ajout') return ajouter();
  if (a === 'filtre') { filtre = t.dataset.f; return vueListe(); }
  if (a === 'ajoutSci') { const x = nouvelleSci(); scis.push(x); sauver(x); location.hash = '#investissements/sci:' + x.id; return; }
  if (sci) {
    if (a === 'ajoutAssocie') { sci.associes.push({nom: '', parts: sci.associes.length ? null : 100}); sauver(sci); vueSci(sci); }
    if (a === 'supprAssocie' && confirm('Retirer cet associé ?')) { sci.associes.splice(+t.dataset.i, 1); sauver(sci); vueSci(sci); }
    if (a === 'ajoutBienSci') ajouter({structure: 'sci', sciId: sci.id});
    if (a === 'supprSci' && confirm(`Supprimer la fiche « ${sci.nom} » ? Ses biens restent, en nom propre.`)) {
      const deplaces = biens.filter(x => x.sciId === sci.id);
      deplaces.forEach(x => { x.structure = 'np'; x.sciId = null; });
      marquerSupprime(sci.id); scis = scis.filter(x => x !== sci); sauver(...deplaces); location.hash = '#investissements';
    }
    return;
  }
  if (a === 'ajoutEst') {
    const est = estimationCourante(); if (!est) return;
    return ajouter({nom: est.label.split(' ').slice(0, 4).join(' '), adresse: est.label, type: est.type, surface: est.surf,
      criteres: Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'location')), geo: state.lat != null ? {lat: state.lat, lon: state.lon, label: est.label, pour: est.label} : null,
      valeur: est.prix, valeurLe: moisCourant(), location: {statut: est.saison ? 'saisonnier' : est.meuble ? 'meuble' : 'vide', loyer: est.loyer, charges: null, locataire: '', debutBail: '', vacance: 0,
        ...(est.saison ? (z => ({nuit: est.saison.nuit, nuitsAn: Math.round(z.nuits), fraisSaison: Math.round(z.pctFrais)}))(saisonnier(est.saison)) : {})}});
  }
  if (!b) return;
  if (a === 'estimerAuto') estimerBien(b);
  if (a === 'valeurAuto' && b.estimation && b.estimation.prix) { b.valeurManuelle = false; b.valeur = b.estimation.prix; b.valeurLe = moisCourant(); sauver(b); vueDetail(b); }
  if (a === 'estimer' && estimable(b)) {
    // Même recherche dans l'onglet Estimer (adresse, type, surface, caractéristiques), avec la carte et le détail du calcul
    showTab('estimation');
    if (b.geo) reprendre({label: b.geo.label, lat: b.geo.lat, lon: b.geo.lon, type: TYPE_DVF[b.type], surf: b.surface, since: 'auto', criteres: criteresEffectifs(b)});
    else { document.getElementById('addr').value = b.adresse; document.getElementById('surf').value = b.surface; document.getElementById('go').click(); }
  }
  if (a === 'vente') {
    if (venteOuverte.has(b.id)) venteOuverte.delete(b.id); else { venteOuverte.add(b.id); b.vente = b.vente || {}; }
    vueDetail(b);
    if (venteOuverte.has(b.id)) racine.querySelector('#inv_vente').scrollIntoView({behavior: 'smooth', block: 'start'});
    return;
  }
  if (a === 'venteEnregistrer') {
    const r = simulerVente(b), dansSci = r.regime === 'is' && !r.sortir;
    if (!confirm(`Enregistrer la vente de « ${b.nom} » en ${libMois(r.mois)} pour ${eur(r.prix)} ? Il ne comptera plus dans tes totaux.`)) return;
    b.vendu = {mois: r.mois, prix: r.prix, pv: Math.round(r.pv), impots: Math.round(r.impots), net: Math.round(dansSci ? r.dansSci * r.partSci : r.pourToi), dansSci};
    venteOuverte.delete(b.id); sauver(b); vueDetail(b); window.scrollTo(0, 0); return;
  }
  if (a === 'venteAnnuler' && confirm('Annuler la vente ? Le bien revient dans tes totaux.')) { delete b.vendu; sauver(b); return vueDetail(b); }
  if (a === 'detacheOuvrir') {
    const lot = (b.lots || []).find(x => /garage|box|parking|place|annexe|cave/i.test(x.libelle || ''));
    b.detache = {mode: t.dataset.m, type: 'parking', place: placeDe(b.type === 'appart' ? b.criteres.parking : b.criteres.garage), lot: lot ? lot.id : '', ...(b.detache || {}), ...(t.dataset.m ? {mode: t.dataset.m} : {})};
    detacheOuvert.add(b.id); vueDetail(b);
    const f = racine.querySelector('#inv_detache_nom'); if (f) { f.scrollIntoView({behavior: 'smooth', block: 'center'}); f.focus({preventScroll: true}); }
    return;
  }
  if (a === 'detacheEstimer' && !enCours.has('det:' + b.id)) {
    const cle = 'det:' + b.id;
    enCours.add(cle); vueDetail(b);
    const le = new Date().toISOString().slice(0, 10);
    let res;
    try {
      if (!b.geo || (!b.geo.manuel && b.geo.pour !== b.adresse.trim())) {
        const f = b.adresse.trim().length >= 5 && (await geocode(b.adresse.trim()))[0];
        if (!f) throw new Error('Adresse du bien introuvable : renseigne-la (ou place le bien sur la carte) pour estimer le garage.');
        b.geo = {lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label, pour: b.adresse.trim()};
      }
      res = await estimerDependance(b.geo.lat, b.geo.lon, (b.detache || {}).place);
    } catch (err) { res = {erreur: err.message || String(err)}; }
    enCours.delete(cle);
    const c = biens.find(x => x.id === b.id) || b;
    c.detache = c.detache || {mode: 'separer', type: 'parking'};
    delete res.comps;
    c.detache.estimation = {...res, le};
    if (!res.erreur) c.detache.valeur = res.prix;
    sauver(c);
    if (ouvert === c.id && detacheOuvert.has(c.id)) vueDetail(c);
    return;
  }
  if (a === 'detacheFermer') { detacheOuvert.delete(b.id); delete b.detache; sauver(b); return vueDetail(b); }
  if (a === 'detacher') { const n = detacher(b); location.hash = '#investissements/' + n.id; return; }
  if (a === 'amenagCreer') { const n = nouvelEspace(b); biens.splice(biens.indexOf(b) + 1, 0, n); sauver(n); location.hash = '#investissements/' + n.id; return; }
  if (a === 'amenagEstimer') return estimerAmenag(b);
  if (a === 'amenagProjet') return amenagVersProjet(b);
  if (a === 'amenagOnglet') {
    // L'onglet Estimer sur le bien principal, avec le projet « Aménager une surface en plus → logement à part » déjà réglé
    const p = principalDe(b), q = planAmenag(b); if (!p || !p.geo || !estimable(p)) return;
    showTab('estimation');
    reprendre({label: p.geo.label, lat: p.geo.lat, lon: p.geo.lon, type: TYPE_DVF[p.type] || TYPE_DVF.appart, surf: p.surface, since: 'auto',
      criteres: {...criteresEffectifs(p), location: q.saison ? 'saison' : q.meuble ? 'meuble' : 'vide'},
      travaux: {niveau: 'amenager', amenType: q.t, amenM2: q.m2, amenUsage: 'lot', totalTravaux: b.amenag.total || null, amenDecote: b.amenag.decote ?? null}});
    return;
  }
  if (a === 'amenagFait') {
    const q = planAmenag(b);
    if (!confirm(`Travaux terminés ? « ${b.nom} » devient un logement à part${q.valeur ? `, compté ${eur(q.valeur)} dans ton patrimoine` : ''}${q.loyer ? `, loué ${eur(q.loyer)}/mois (à corriger dans Location)` : ''}. Les travaux (${eur(q.travaux || 0)}) passent dans son achat.`)) return;
    amenagTermine(b); sauver(b); return vueDetail(b);
  }
  if (a === 'dissocier' && confirm('Dissocier ce bien ? Il reste dans ta liste, sans lien avec l\'autre.')) { delete b.lieA; if (b.location.statut === 'avec') b.location.statut = 'vacant'; sauver(b); return vueDetail(b); }
  if (a === 'copierAchat') {
    const r = repriseAchat(b); if (!r) return;
    const notaire = b.achat.notaire == null ? r.notaire : 0, frais = b.achat.frais == null ? r.frais : 0;   // seulement ce qui est repris
    Object.assign(b.achat, {mode: 'existant', date: b.achat.date || r.date, prix: r.prix || b.achat.prix, notaire: b.achat.notaire ?? (notaire || null), frais: b.achat.frais ?? (frais || null)});
    if (r.prix) { const a = r.p.achat; a.prix -= r.prix; if (notaire) a.notaire -= notaire; if (frais) a.frais -= frais; }
    sauver(b, r.p); return vueDetail(b);
  }
  if (a === 'saisirAPart') { b.saisieAPart = true; sauver(b); return vueDetail(b); }
  if (a === 'copierCharges') {
    const p = principalDe(b); if (!p) return;
    for (const k of ['gestion', 'entretien']) if (b.chargesAn[k] == null && p.chargesAn[k] != null) b.chargesAn[k] = p.chargesAn[k];
    sauver(b); return vueDetail(b);
  }
  if (a === 'venteAgence') {   // avec agence : un pourcentage du prix ; sans agence : un montant fixe en euros
    b.vente = b.vente || {}; b.vente.agence = t.dataset.v === '1'; sauver(b);
    const el = racine.querySelector('#inv_fraisVente'); if (el) el.outerHTML = fraisVenteHTML(b);
    return majVente(b);
  }
  if (a === 'venteSortir') { b.vente = b.vente || {}; b.vente.sortir = t.dataset.v === '1'; sauver(b); racine.querySelectorAll('.vente-sortie button').forEach(x => x.classList.toggle('on', x === t)); return majVente(b); }
  if (a === 'ajoutLigne' && LISTES[b.location.statut]) { const k = LISTES[b.location.statut].cle; (b[k] = b[k] || []).push({id: uid(), libelle: '', loyer: null, locataire: '', debut: ''}); sauver(b); return vueDetail(b); }
  if (a === 'supprLigne' && LISTES[b.location.statut] && confirm('Retirer cette ligne ?')) { b[LISTES[b.location.statut].cle].splice(+t.dataset.i, 1); sauver(b); return vueDetail(b); }
  if (a === 'ajoutRevenu') { (b.revenus = b.revenus || []).push({id: uid(), libelle: '', montant: null, periode: 'an'}); sauver(b); vueDetail(b); }
  if (a === 'supprRevenu' && confirm('Retirer cette activité ?')) { b.revenus.splice(+t.dataset.i, 1); sauver(b); vueDetail(b); }
  if (a === 'ajoutPret') { b.prets.push({id: uid(), banque: '', montant: null, taux: null, duree: 240, debut: '', offre: '', assurance: null, mensualite: null, progressif: '', hausse: null, mensuLe: '', typeDiff: '', differe: null, crd: null, mois: null, crdLe: ''}); sauver(b); vueDetail(b); }
  if (a === 'partagePret' || a === 'partageProrata') {
    const p = b.prets[+t.dataset.i]; if (!p) return;
    let l = partagesDe(p);
    if (a === 'partagePret') l = l.some(x => x.id === t.dataset.id) ? l.filter(x => x.id !== t.dataset.id) : [...l, {id: t.dataset.id, part: 0}];
    const parts = partsAuProrata(b, l.map(x => biens.find(y => y.id === x.id)));
    p.partage = l.map((x, j) => ({id: x.id, part: parts[j]}));
    sauver(b); return vueDetail(b);
  }
  if (a === 'rachatOuvrir') { const p = b.prets[+t.dataset.i]; p.rachat = {...(p.rachat || {}), ouvert: true}; sauver(b); return vueDetail(b); }
  if (a === 'rachatFermer') { b.prets[+t.dataset.i].rachat.ouvert = false; sauver(b); return vueDetail(b); }
  if (a === 'rachatAvec') {
    const r = b.prets[+t.dataset.i].rachat, id = t.dataset.id, l = r.avec || [];
    r.avec = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
    sauver(b); return vueDetail(b);
  }
  if (a === 'supprPret' && confirm('Retirer ce prêt ?')) { b.prets.splice(+t.dataset.i, 1); sauver(b); vueDetail(b); }
  if (a === 'fichier') racine.querySelector('#inv_fichier').click();
  if (a === 'supprDoc') {
    const d = b.docs.find(x => x.id === t.dataset.id);
    if (d && confirm(`Supprimer « ${d.nom} » ?`)) { await supprimerDoc(d); b.docs = b.docs.filter(x => x !== d); sauver(b); docsHTML(b); vignettes(); }
  }
  if (a === 'supprimer' && confirm(`Supprimer « ${b.nom} » et ses documents ? C'est définitif.${b.prets.some(p => partagesDe(p).length) ? ' Son prêt commun disparaît aussi des autres biens qu\'il finance.' : ''}`)) {
    for (const d of b.docs) await supprimerDoc(d);
    const lies = associesA(b); lies.forEach(x => { delete x.lieA; if (x.location.statut === 'avec') x.location.statut = 'vacant'; });
    marquerSupprime(b.id); biens = biens.filter(x => x !== b); sauver(...lies); location.hash = '#investissements';
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
    ecrire(sci, chemin, v); sauver(sci);
    if (chemin === 'regime' || chemin === 'compta') return vueSci(sci);
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
      const x = nouvelleSci({nom, maj: Date.now()}); scis.push(x); v = x.id;
    }
    if (v === 'np') { b.structure = 'np'; b.sciId = null; } else { b.structure = 'sci'; b.sciId = v; }
    sauver(b); return vueDetail(b);
  }
  if (e.target.dataset.x === 'periode') {
    const p = PERIODES_SAISON[e.target.value]; if (!p) return;
    b.location.nuitsAn = Math.round(365 * p.occ / 100); sauver(b); return vueDetail(b);
  }
  if (e.target.dataset.x === 'associer') {
    const x = biens.find(y => y.id === e.target.value);
    if (x) { x.lieA = b.id; x.avecVu = true; if (x.type === 'parking' && !LOUE.includes(x.location.statut)) x.location.statut = 'avec'; sauver(x); vueDetail(b); }
    return;
  }
  if (e.target.id === 'inv_fichier') {
    const etat = racine.querySelector('#inv_docEtat'), fichiers = [...e.target.files];
    e.target.value = '';
    for (const [i, f] of fichiers.entries()) {
      etat.textContent = `Envoi ${i + 1}/${fichiers.length}…`;
      try { b.docs.push(await ajouterDoc(b, f)); sauver(b); } catch (err) { alert(erreurDocs(err)); }
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
  if (chemin === 'type') {
    const terrain = v === 'terrain', st = b.location.statut;
    if (terrain && !STATUTS_TERRAIN[st]) b.location.statut = 'libre';
    if (!terrain && !STATUTS[st]) b.location.statut = st === 'perso' ? 'rp' : st === 'loue' ? 'vide' : 'vacant';
  }
  if (chemin === 'location.statut' && v === 'lots' && !(b.lots || []).length && b.location.loyer) b.lots = [{id: uid(), libelle: 'Loyer 1', loyer: b.location.loyer, locataire: b.location.locataire || '', debut: b.location.debutBail && ecartMois(b.location.debutBail, moisCourant()) < 0 ? b.location.debutBail : ''}];
  // Type de place changé : l'estimation déjà faite (mêmes ventes) est ramenée au nouveau type, sans rien rechercher
  if (chemin === 'place' && b.type === 'parking' && b.estimation && b.estimation.dependance) {
    b.estimation = {...replacer(b.estimation, v), cle: cleEstimation(b)};
    if (!b.valeurManuelle) { b.valeur = b.estimation.prix; b.valeurLe = moisCourant(); }
  }
  if (chemin === 'detache.place' && b.detache.estimation && b.detache.estimation.dependance) {
    const avant = b.detache.estimation.prix;
    b.detache.estimation = replacer(b.detache.estimation, v);
    if (b.detache.valeur === avant) b.detache.valeur = b.detache.estimation.prix;
  }
  if (chemin === 'valeur') { b.valeurManuelle = v != null; if (v == null && b.estimation && b.estimation.prix) { b.valeur = b.estimation.prix; t.value = b.valeur; } }
  // Mensualité progressive : la mensualité saisie est celle du mois de la saisie (elle augmente ensuite)
  if (/^prets\.\d+\.(mensualite|progressif)$/.test(chemin)) { const p = lire(b, chemin.replace(/\.\w+$/, '')); p.mensuLe = p.progressif && p.mensualite ? moisCourant() : ''; }
  if (/^prets\.\d+\.typeDiff$/.test(chemin) && v && !lire(b, chemin.replace('typeDiff', 'differe'))) ecrire(b, chemin.replace('typeDiff', 'differe'), 12);
  if (chemin === 'valeur' && v && !b.valeurLe) { b.valeurLe = moisCourant(); const m = racine.querySelector('[data-p="valeurLe"]'); if (m) m.value = b.valeurLe; }
  sauver(b);
  if (chemin.startsWith('vente.')) return majVente(b);
  if (chemin.startsWith('detache.')) return chemin === 'detache.place' ? vueDetail(b) : majDetache(b);
  if (chemin.startsWith('amenag.')) {
    if (chemin === 'amenag.ou') { const p = principalDe(b); if (p && Object.values(NOMS_ESPACE).some(n => b.nom === n + ' · ' + p.nom)) b.nom = NOMS_ESPACE[v] + ' · ' + p.nom; b.amenag.decote = null; sauver(b); }
    if (chemin === 'amenag.m2') { b.surface = v; sauver(b); }
    if (chemin === 'amenag.periode') { b.amenag.occupation = null; sauver(b); }   // le taux suit la période choisie
    return ['amenag.ou', 'amenag.m2', 'amenag.meuble', 'amenag.total', 'amenag.periode'].includes(chemin) ? vueDetail(b) : majAmenag(b);
  }
  // Ce qui change la forme de la fiche : on la reconstruit ; sinon seulement les chiffres
  if (['type', 'location.statut', 'adresse', 'surface', 'nature', 'place', 'achat.mode'].includes(chemin) && (chemin !== 'surface' || b.type === 'terrain') || /^prets\.\d+\.(banque|progressif|typeDiff|partage\.\d+\.part|rachat\.mode|rachat\.finance)$/.test(chemin) || chemin === 'chargesAn.comptaSci') return vueDetail(b);
  if (chemin === 'nom') racine.querySelector('#inv_titre').textContent = b.nom;
  // Caractéristiques changées : l'estimation est signalée comme à refaire (sans la relancer)
  if (chemin.startsWith('criteres.') || ['surface', 'annee', 'valeur', 'pieces', 'nature', 'place'].includes(chemin)) majAuto(b);
  majVente(b);
  majCalculs(b);
});

// Démarrage : biens de cet appareil, puis le compte s'il y a une session
biens = biensLocaux(); scis = scisLocales(); normaliser();
// Biens repris des anciens crédits : enregistrés tout de suite, pour garder les mêmes identifiants d'un chargement à l'autre
try { if (!localStorage.getItem(CLE) && biens.length) { localStorage.setItem(CLE, JSON.stringify(biens)); localStorage.setItem(CLE_SCI, JSON.stringify(scis)); } } catch (e) {}
window.INV = {estimerSurface: p => moteur.estimer(p), estimerGarage: (lat, lon, place) => estimerDependance(lat, lon, place), marquerSupprime: id => marquerSupprime(id), scis: () => scis.map(x => ({id: x.id, nom: x.nom, regime: x.regime})), afficher: id => { afficher(id); window.scrollTo(0, 0); }, sauverCompte: () => { if (COMPTE.user) sauver(); }};
COMPTE.init();
})();
