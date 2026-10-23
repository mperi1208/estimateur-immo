// Mon patrimoine : plusieurs loyers avec leur date de début, garage associé (séparé ou lié), simulation de vente
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, proche, inv, idx} = require('./outils');

const ctx = vm.createContext({T: {}});
vm.runInContext([
  bloc(inv, 'const somme =', 'const uid ='),
  'let n_ = 0; const uid = () => "id" + (++n_);',
  bloc(inv, '// ---------- Mois', '// ---------- Données'),
  'var STATUTS = {}, biens = [], scis = [];',
  bloc(inv, 'function nouveauBien', '// Ancien onglet'),
  bloc(idx, 'const CRITERES = [', 'const fmt = n =>'),
  bloc(idx, 'const COUT_LOT =', '// Gamme des finitions'), bloc(idx, 'const budgetMobilier =', 'const ORDRE_DPE'),
  'const fmt = n => String(Math.round(n));',
  bloc(inv, 'const TYPE_DVF =', 'const cleEstimation'),
  bloc(inv, 'const sciDe =', 'const REGIMES'),
  bloc(inv, 'const partDe =', '// Biens vendus'),
  bloc(inv, '// ---------- Garage, parking, annexe', 'function annexeHTML'),
  'const sauver = () => {}, venteOuverte = new Set(), cleEstimation = () => "", enCours = new Set();',
  bloc(inv, 'function detacher', '// Bandeaux en haut'),
  bloc(inv, '// ---------- Simulation de vente', 'function venteHTML'),
  bloc(inv, 'function totaux', 'function kpisTotaux'),
  'this.X = {cleAmenag, planAmenag, nouvelEspace, amenagTermine, totaux, calculs, moisCourant, decalerMois, nouveauBien, planDetache, detacher, repriseAchat, lieSimple, garageLoueAvec, partSuggeree, simulerVente, surtaxePV, abatIR, abatPS};',
  'this.setBiens = l => { biens = l; }; this.setScis = l => { scis = l; };',
].join('\n'), ctx);
const {cleAmenag, planAmenag, nouvelEspace, amenagTermine, totaux, calculs, moisCourant, decalerMois, nouveauBien, planDetache, detacher, repriseAchat, lieSimple, garageLoueAvec, partSuggeree, simulerVente, surtaxePV, abatIR, abatPS} = ctx.X;
const dans = k => decalerMois(moisCourant(), k);   // mois relatif à aujourd'hui
const sansCharges = {tf: 0, copro: 0, pno: 0, gestion: 0, entretien: 0, compta: 0, cfe: 0, autres: 0};

// ---------- Plusieurs loyers et dates de début ----------
test('plusieurs loyers : chacun compte à partir de son mois de début', () => {
  const b = nouveauBien({chargesAn: sansCharges, achat: {prix: 150000},
    location: {statut: 'lots', vacance: 0}, lots: [{loyer: 600}, {loyer: 100, debut: dans(3)}, {loyer: 50, debut: dans(-5)}]});
  const c = calculs(b);
  assert.equal(c.loyerMois, 650);                      // le 2e loyer n'a pas commencé
  assert.equal(c.loyersAn, 650 * 12 + 100 * 9);        // il compte 9 mois sur les 12 prochains
  proche(c.brut, 750 * 12 / 150000, 1e-9);             // rendement : tous les loyers, commencés ou non
});
test('plusieurs loyers : date au format 03/2026 (Safari) et vacance', () => {
  const [a, m] = dans(6).split('-');
  const b = nouveauBien({chargesAn: sansCharges, location: {statut: 'lots', vacance: 1}, lots: [{loyer: 1200}, {loyer: 120, debut: `${m}/${a}`}]});
  assert.equal(calculs(b).loyersAn, (1200 * 12 + 120 * 6) * 11 / 12);
});
test('colocation : chambres avec dates de début', () => {
  const b = nouveauBien({chargesAn: sansCharges, location: {statut: 'colocation', vacance: 0}, chambres: [{loyer: 450}, {loyer: 450, debut: dans(1)}]});
  const c = calculs(b);
  assert.equal(c.loyerMois, 450); assert.equal(c.loyersAn, 450 * 12 + 450 * 11);
});
test('un seul loyer : bail qui commence plus tard (pas de loyer avant) ; bail passé : loyer plein', () => {
  const futur = calculs(nouveauBien({chargesAn: sansCharges, location: {statut: 'vide', loyer: 800, debutBail: dans(2), vacance: 0}}));
  assert.equal(futur.loyerMois, 0); assert.equal(futur.loyersAn, 800 * 10);
  const passe = calculs(nouveauBien({chargesAn: sansCharges, location: {statut: 'vide', loyer: 800, debutBail: dans(-30), vacance: 0}}));
  assert.equal(passe.loyerMois, 800); assert.equal(passe.loyersAn, 9600);
  const ceMois = calculs(nouveauBien({chargesAn: sansCharges, location: {statut: 'vide', loyer: 800, debutBail: dans(0), vacance: 0}}));
  assert.equal(ceMois.loyerMois, 800); assert.equal(ceMois.loyersAn, 9600);
});

// ---------- Garage : séparé (fiche à part) ou lié au bien principal ----------
const appart = o => nouveauBien(Object.assign({id: 'A', nom: 'Appart', type: 'appart', valeur: 300000, criteres: {parking: 'box'}, chargesAn: sansCharges,
  achat: {mode: 'existant', date: '2018-05', prix: 250000, notaire: 20000, travaux: null, mobilier: null, frais: 3000}}, o));
test('garage : part suggérée de la valeur (box ≈ +9 % sur un appartement, 5 % d\'une maison)', () => {
  proche(partSuggeree(appart()), 0.09 / 1.09, 1e-9);
  assert.equal(partSuggeree(appart({type: 'maison'})), 0.05);
});
test('garage : sortie au prorata des valeurs (prix, notaire, frais) et valeur répartie', () => {
  const p = planDetache(appart({detache: {valeur: 20000}}));
  assert.equal(p.prix, 16700);                         // 250 000 × 20 000 / 300 000, arrondi à 100 €
  assert.equal(p.notaire, Math.round(20000 * 16700 / 250000));
  assert.equal(p.valeurApres, 280000); assert.equal(p.baseApres, 250000 - 16700);
});
test('garage sorti avec son loyer (lot) : totaux inchangés, loyer et date de début repris', () => {
  const b = appart({location: {statut: 'lots', vacance: 0}, lots: [{id: 'L1', libelle: 'Appartement', loyer: 900}, {id: 'L2', libelle: 'Garage', loyer: 80, debut: dans(2)}]});
  ctx.setBiens([b]);
  const avant = calculs(b);
  b.detache = {mode: 'separer', type: 'parking', valeur: 20000, lot: 'L2'};
  const g = detacher(b);
  assert.equal(g.lieA, 'A'); assert.equal(b.lots.length, 1);
  assert.equal(b.valeur + g.valeur, 300000);
  assert.equal(b.achat.prix + g.achat.prix, 250000);
  assert.equal(b.achat.notaire + g.achat.notaire, 20000);
  assert.equal(b.achat.frais + g.achat.frais, 3000);
  const cb = calculs(b), cg = calculs(g);
  assert.equal(cg.loyerMois, 0);                       // le garage n'est loué que dans 2 mois, comme avant
  assert.equal(cb.loyersAn + cg.loyersAn, avant.loyersAn);
  assert.equal(cb.loyerMois + cg.loyerMois, avant.loyerMois);
  assert.equal(b.criteres.parking, 'aucun'); assert.equal(b.parkingAssocie, 'box');
});
test('garage sorti sans loyer : « avec le bien principal », sans loyer à lui', () => {
  const b = appart({location: {statut: 'vide', loyer: 1000, vacance: 0}});
  ctx.setBiens([b]);
  b.detache = {mode: 'separer', type: 'parking'};
  const g = detacher(b);
  assert.equal(g.location.statut, 'avec');
  assert.strictEqual(garageLoueAvec(b), g);
  assert.equal(calculs(g).loyersAn, 0); assert.equal(calculs(b).loyersAn, 12000);
  assert.ok(g.valeur > 0 && b.valeur + g.valeur === 300000);
});
test('garage sorti en déduisant son loyer de celui du bien', () => {
  const b = appart({location: {statut: 'vide', loyer: 1000, vacance: 0}});
  ctx.setBiens([b]);
  b.detache = {mode: 'separer', type: 'parking', loyer: 90, deduire: true};
  const g = detacher(b);
  assert.equal(b.location.loyer, 910); assert.equal(g.location.loyer, 90);
  assert.equal(calculs(b).loyersAn + calculs(g).loyersAn, 12000);
});
test('garage lié sans achat ni crédit : tout est compté avec le bien principal ; reprise de sa part du prix', () => {
  const b = appart({valeur: 280000});
  const g = nouveauBien({id: 'G', type: 'parking', lieA: 'A', valeur: 20000});
  ctx.setBiens([b, g]);
  assert.equal(lieSimple(g), true);
  const r = repriseAchat(g);
  proche(r.r, 20000 / 300000, 1e-9);
  assert.equal(r.prix, 16700); assert.equal(r.date, '2018-05');
  g.achat.prix = 16700;
  assert.equal(lieSimple(g), false);                   // achat saisi : fiche à part
  g.achat.prix = null; g.saisieAPart = true;
  assert.equal(lieSimple(g), false);
});

// ---------- Simulation de vente ----------
const aVendre = o => nouveauBien(Object.assign({valeur: 300000, chargesAn: sansCharges, location: {statut: 'vide', loyer: 0},
  achat: {mode: 'existant', date: dans(-120), prix: 200000, notaire: 15000, travaux: null, frais: null}, vente: {frais: 0}}, o));
test('abattements pour durée de détention (impôt et prélèvements sociaux)', () => {
  assert.equal(abatIR(5), 0); proche(abatIR(6), 0.06); proche(abatIR(21), 0.96); assert.equal(abatIR(22), 1);
  proche(abatPS(21), 0.264); proche(abatPS(22), 0.28); proche(abatPS(29), 0.91); assert.equal(abatPS(30), 1);
});
test('surtaxe des grosses plus-values, avec lissage', () => {
  assert.equal(surtaxePV(50000), 0); proche(surtaxePV(55000), 850); proche(surtaxePV(80000), 1600);
  proche(surtaxePV(105000), 2650); proche(surtaxePV(300000), 18000);
});
test('vente en nom propre après 10 ans : plus-value, forfait travaux 15 %, impôt et prélèvements', () => {
  const r = simulerVente(aVendre());
  assert.equal(r.annees, 10);
  assert.equal(r.fraisAchat, 15000); assert.equal(r.travaux, 30000);   // réels (7,5 %) ; forfait 15 % après 5 ans
  assert.equal(r.pv, 300000 - 245000);
  proche(r.ir, 55000 * 0.70 * 0.19); proche(r.ps, 55000 * (1 - 0.0825) * 0.172); assert.equal(r.surtaxe, 0);
  proche(r.pourToi, 300000 - r.impots);
});
test('vente : résidence principale et garage de 15 000 € ou moins exonérés', () => {
  assert.equal(simulerVente(aVendre({location: {statut: 'rp'}})).impots, 0);
  const g = simulerVente(aVendre({type: 'parking', valeur: 14000, achat: {mode: 'existant', date: dans(-24), prix: 8000}}));
  assert.equal(g.petite, true); assert.equal(g.impots, 0);
});
test('vente : crédit remboursé et indemnités plafonnées (3 % du restant dû, 6 mois d\'intérêts)', () => {
  const r = simulerVente(aVendre({prets: [{montant: 150000, taux: 3, duree: 240, debut: dans(-24)}]}));
  assert.ok(r.crd > 130000 && r.crd < 150000);
  proche(r.ira, Math.min(0.03 * r.crd, 6 * r.crd * 0.03 / 12));
});
test('vente en SCI à l\'IS : amortissements plafonnés au coût du bâti et des travaux', () => {
  ctx.setScis([{id: 'S', regime: 'is'}]);
  const r = simulerVente(aVendre({structure: 'sci', sciId: 'S', achat: {mode: 'existant', date: dans(-480), prix: 100000, notaire: 8000, travaux: 10000}}));
  assert.equal(r.amortAuto, 85000 + 10000);            // 40 ans : tout le bâti (30 ans) et les travaux (15 ans), pas plus
  assert.equal(r.vnc, 118000 - 95000);
  const recent = simulerVente(aVendre({structure: 'sci', sciId: 'S', achat: {mode: 'existant', date: dans(-60), prix: 100000, notaire: 8000, travaux: 15000}}));
  assert.equal(recent.amortAuto, Math.round(85000 * 5 / 30 + 15000 * 5 / 15));
  ctx.setScis([]);
});

// ---------- Espace à aménager (sous-sol, combles…) ----------
const maison = () => nouveauBien({id: 'M', nom: 'Maison', type: 'maison', adresse: '1 route, 20166 Porticcio', surface: 110, valeur: 600000, chargesAn: sansCharges, location: {statut: 'secondaire'}});
test('espace à aménager : associé, sans valeur, hors du nombre de biens', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  assert.equal(e.lieA, 'M'); assert.equal(e.nom, 'Sous-sol · Maison'); assert.equal(e.location.statut, 'avec');
  const t = totaux([m, e]);
  assert.equal(t.n, 1); assert.equal(t.manque, 0); assert.equal(t.V, 600000);
});
test('espace à aménager : coût, valeur et loyer une fois fait (mêmes hypothèses que l\'onglet Estimer)', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  Object.assign(e.amenag, {m2: 40, debut: '2027-03'});
  let q = planAmenag(e);
  assert.equal(q.travaux, Math.round((40 * 1500 + 11000 + 3000) / 500) * 500);   // sous-sol hors Paris
  assert.equal(q.valeur, null);                                                 // pas encore estimé
  e.amenag.estimation = {prix: 160000, loyerVide: 600, loyerMeuble: 700, cle: cleAmenag(e)};   // la clé suit le bien principal et la surface
  q = planAmenag(e);
  assert.equal(q.valeur, 96000);                       // − 40 % (sous-sol)
  assert.equal(q.loyer, Math.round(600 * 0.76 / 10) * 10);
  assert.equal(q.loyerDes, '2027-08');                 // 5 mois de chantier par défaut
  e.amenag.meuble = '1'; e.amenag.decote = 0;
  q = planAmenag(e);
  assert.equal(q.loyer, 700); assert.equal(q.valeur, 160000); assert.ok(q.mobilier > 0);
  e.amenag.m2 = 50;                                    // surface changée : estimation à refaire
  assert.equal(planAmenag(e).valeur, null);
});
test('espace à aménager : travaux terminés, il devient un logement compté à part', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  Object.assign(e.amenag, {m2: 40});
  e.amenag.estimation = {prix: 160000, loyerVide: 600, loyerMeuble: 700, cle: cleAmenag(e)};
  amenagTermine(e);
  assert.equal(e.valeur, 96000); assert.equal(e.surface, 40); assert.equal(e.location.statut, 'vide');
  assert.equal(e.achat.travaux, planAmenag(e).travaux);
  const t = totaux([m, e]);
  assert.equal(t.n, 2); assert.equal(t.V, 696000);
});
