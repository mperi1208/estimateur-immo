// Mon patrimoine : plusieurs loyers avec leur date de début, garage associé (séparé ou lié), simulation de vente
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, proche, inv, idx} = require('./outils');

const ctx = vm.createContext({T: {}});
vm.runInContext([
  bloc(idx, '// ---------- Location saisonnière', '// --- Loyer : carte officielle'),
  bloc(inv, 'const somme =', 'const uid ='),
  'let n_ = 0; const uid = () => "id" + (++n_);',
  bloc(inv, '// ---------- Mois', '// ---------- Données'),
  'var STATUTS = {}, biens = [], scis = [];',
  bloc(inv, 'function nouveauBien', '// Ancien onglet'),
  bloc(idx, 'const CRITERES = [', 'const fmt = n =>'),
  bloc(idx, 'const COUT_LOT =', '// Gamme des finitions'), bloc(idx, 'const budgetMobilier =', 'const ORDRE_DPE'),
  'const fmt = n => String(Math.round(n));',
  bloc(inv, 'const TYPE_DVF =', 'const cleEstimation'),
  bloc(inv, '// Les actes ne disent pas si', 'function versDependance'),
  bloc(inv, 'const sciDe =', 'const REGIMES'),
  bloc(inv, 'const partDe =', '// Biens vendus'),
  bloc(inv, '// ---------- Garage, parking, annexe', 'function annexeHTML'),
  'const sauver = () => {}, venteOuverte = new Set(), cleEstimation = () => "", enCours = new Set();',
  bloc(inv, 'function detacher', '// Bandeaux en haut'),
  bloc(inv, '// ---------- Simulation de vente', 'function venteHTML'),
  bloc(inv, 'function totaux', 'function kpisTotaux'),
  'this.X = {cleAmenag, planAmenag, nouvelEspace, amenagTermine, totaux, calculs, moisCourant, decalerMois, nouveauBien, planDetache, detacher, repriseAchat, lieSimple, garageLoueAvec, partSuggeree, simulerVente, surtaxePV, abatIR, abatPS, partsAuProrata};',
  'this.setBiens = l => { biens = l; }; this.setScis = l => { scis = l; };',
].join('\n'), ctx);
const {cleAmenag, planAmenag, nouvelEspace, amenagTermine, totaux, calculs, moisCourant, decalerMois, nouveauBien, planDetache, detacher, repriseAchat, lieSimple, garageLoueAvec, partSuggeree, simulerVente, surtaxePV, abatIR, abatPS, partsAuProrata} = ctx.X;
const dans = k => decalerMois(moisCourant(), k);   // mois relatif à aujourd'hui
const sansCharges = {tf: 0, copro: 0, pno: 0, gestion: 0, entretien: 0, compta: 0, cfe: 0, autres: 0};

// ---------- Plusieurs loyers et dates de début ----------
test('plusieurs loyers : chacun compte à partir de son mois de début', () => {
  const b = nouveauBien({chargesAn: sansCharges, achat: {prix: 150000},
    location: {statut: 'lots', vacance: 0}, lots: [{loyer: 600}, {loyer: 100, debut: dans(3)}, {loyer: 50, debut: dans(-5)}]});
  const c = calculs(b);
  assert.equal(c.loyerMois, 650);                      // le 2e loyer n'a pas commencé
  assert.equal(c.loyersAn, 650 * 12 + 100 * 9);        // il compte 9 mois sur les 12 prochains
  assert.equal(c.brut, undefined);                     // plus de rendement calculé
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
test('vente : 4 % du prix avec agence, montant fixe sans agence (600 € par défaut), valeurs saisies prioritaires', () => {
  assert.equal(simulerVente(aVendre({vente: {}})).frais, 12000);
  assert.equal(simulerVente(aVendre({vente: {frais: 5}})).frais, 15000);
  assert.equal(simulerVente(aVendre({vente: {agence: false}})).frais, 600);
  assert.equal(simulerVente(aVendre({vente: {agence: false, frais: 5, fraisFixe: 450}})).frais, 450);
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
test('location saisonnière : prix par nuit × nuits louées, frais en % des recettes, sans vacance', () => {
  const b = nouveauBien({chargesAn: sansCharges, achat: {prix: 150000},
    location: {statut: 'saisonnier', nuit: 90, nuitsAn: 200, fraisSaison: 25, loyer: 700, vacance: 2}});
  const c = calculs(b);
  proche(c.loyersAn, 18000, 0.01);
  proche(c.loyerMois, 1500, 0.01);
  proche(c.chargesAn, 4500, 0.01);
  b.location.nuit = null;                                      // sans prix par nuit : recettes saisies au mois
  proche(calculs(b).loyersAn, 700 * 10, 0.01);
});
// ---------- Totaux de Mon patrimoine ----------
test('totaux : valeur, restant dû et patrimoine net ; biens sans valeur comptés à part', () => {
  const a = nouveauBien({valeur: 300000, chargesAn: sansCharges, location: {statut: 'vide', loyer: 1000, vacance: 0},
    prets: [{montant: 200000, taux: 3, duree: 240, debut: dans(-24)}]});
  const b = nouveauBien({valeur: null, chargesAn: sansCharges, location: {statut: 'vide', loyer: 500, vacance: 0},
    prets: [{montant: 50000, taux: 2, duree: 120, debut: dans(-12)}]});
  const t = totaux([a, b]), ca = calculs(a), cb = calculs(b);
  assert.equal(t.n, 2); assert.equal(t.nEst, 1); assert.equal(t.manque, 1);
  assert.equal(t.V, 300000);
  proche(t.D, ca.crd + cb.crd, 1e-6);
  proche(t.net, 300000 - ca.crd, 1e-6);                 // le prêt du bien sans valeur n'est pas déduit d'une valeur inconnue
  assert.equal(t.loyers, 1500);
  proche(t.cf, ca.cfMois + cb.cfMois, 1e-9);
});
test('totaux : bien détenu à 50 % (indivision) = la moitié de tout ; part bornée entre 1 et 100 %', () => {
  const plein = nouveauBien({valeur: 200000, chargesAn: sansCharges, location: {statut: 'vide', loyer: 1000, vacance: 0}});
  const moitie = {...plein, part: 50}, t = totaux([moitie]);
  assert.equal(t.V, 100000); assert.equal(t.loyers, 500); assert.equal(t.partiel, true);
  assert.equal(totaux([{...plein, part: 0}]).V, 200000);   // part vide : 100 %
  assert.equal(totaux([{...plein, part: 250}]).V, 200000);
});
test('totaux : garage associé compté une seule fois (valeur répartie entre les deux fiches)', () => {
  const b = appart({location: {statut: 'vide', loyer: 1000, vacance: 0}});
  ctx.setBiens([b]);
  const avant = totaux([b]);
  b.detache = {mode: 'separer', type: 'parking', valeur: 25000};
  const g = detacher(b), apres = totaux([b, g]);
  assert.equal(apres.V, avant.V); assert.equal(apres.loyers, avant.loyers); proche(apres.cf, avant.cf, 1e-9);
});

// ---------- Garage : autres cas de sortie ----------
test('maison : garage sorti, critère « garage » passé à « non » et gardé pour le loyer de marché', () => {
  const m = appart({type: 'maison', criteres: {}});
  ctx.setBiens([m]);
  m.detache = {mode: 'separer', type: 'parking'};
  const g = detacher(m);
  assert.equal(m.criteres.garage, 'non'); assert.equal(m.parkingAssocie, 'oui');
  assert.equal(g.valeur + m.valeur, 300000); proche(g.valeur, Math.round(300000 * 0.05 / 500) * 500);
});
test('appartement avec 2 places : une sort, il en reste une', () => {
  const b = appart({criteres: {parking: '2'}});
  ctx.setBiens([b]);
  b.detache = {mode: 'separer', type: 'parking', valeur: 20000};
  detacher(b);
  assert.equal(b.criteres.parking, '1'); assert.equal(b.parkingAssocie, '1');
});
test('annexe (local) sortie sans loyer : vacante, pas « avec le bien », et critères de stationnement intacts', () => {
  const b = appart();
  ctx.setBiens([b]);
  b.detache = {mode: 'separer', type: 'local', valeur: 15000};
  const a = detacher(b);
  assert.equal(a.location.statut, 'vacant'); assert.equal(b.criteres.parking, 'box'); assert.equal(garageLoueAvec(b), undefined);
});
test('garage sorti pour être vendu : la vente est préparée sur sa fiche', () => {
  const b = appart();
  ctx.setBiens([b]);
  b.detache = {mode: 'vendre', type: 'parking', valeur: 20000, prixVente: 22000, moisVente: '2026-09'};
  const g = detacher(b);
  assert.deepEqual({...g.vente}, {prix: 22000, mois: '2026-09'});
  const r = simulerVente(g);
  assert.equal(r.prix, 22000); assert.equal(r.annees, anneesDepuis('2018-05', '2026-09'));
  assert.ok(!r.petite && r.impots > 0);                // plus de 15 000 € : plus-value imposée
});
const anneesDepuis = (a, b) => Math.floor(((+b.slice(0, 4) - +a.slice(0, 4)) * 12 + +b.slice(5) - +a.slice(5)) / 12);
test('maison construite : prix du terrain et de la construction répartis', () => {
  const m = nouveauBien({id: 'M', type: 'maison', valeur: 400000, chargesAn: sansCharges, criteres: {},
    achat: {mode: 'construction', date: '2015-01', prix: 80000, construction: 220000, notaire: 6000}});
  ctx.setBiens([m]);
  m.detache = {mode: 'separer', type: 'parking', valeur: 20000};
  const p = planDetache(m);
  assert.equal(p.base, 300000); assert.equal(p.prix, 15000);
  const g = detacher(m);
  proche(m.achat.prix + m.achat.construction + g.achat.prix, 300000, 1);
});

// ---------- Simulation de vente : autres cas ----------
test('vente : prix, frais (%) et indemnités saisis remplacent les valeurs calculées', () => {
  const r = simulerVente(aVendre({vente: {prix: 320000, frais: 5, ira: 1000}, prets: [{montant: 100000, taux: 3, duree: 240, debut: dans(-24)}]}));
  assert.equal(r.prix, 320000); assert.equal(r.frais, 16000); assert.equal(r.ira, 1000);
  proche(r.liquide, 320000 - 16000 - r.crd - 1000, 1e-6);
});
test('vente avant 5 ans : travaux réels seulement (pas de forfait 15 %), frais d\'achat 7,5 % minimum', () => {
  const r = simulerVente(aVendre({achat: {mode: 'existant', date: dans(-36), prix: 200000, notaire: 9000, travaux: 5000}}));
  assert.equal(r.annees, 3); assert.equal(r.travaux, 5000); assert.equal(r.fraisAchat, 15000);
  proche(r.ir, r.pv * 0.19); proche(r.ps, r.pv * 0.172);
});
test('vente après 30 ans : plus-value exonérée d\'impôt et de prélèvements', () => {
  const r = simulerVente(aVendre({achat: {mode: 'existant', date: dans(-12 * 31), prix: 50000}}));
  assert.equal(r.ir, 0); assert.equal(r.ps, 0); assert.equal(r.surtaxe, 0); proche(r.pourToi, 300000);
});
test('vente d\'un bien détenu à moitié : impôts et argent sur la part', () => {
  const plein = simulerVente(aVendre()), moitie = simulerVente(aVendre({part: 50}));
  proche(moitie.impots, plein.impots / 2, 0.01); proche(moitie.pourToi, plein.pourToi / 2, 0.01);
});
test('vente d\'un garage à moitié : seuil de 15 000 € apprécié sur la part vendue', () => {
  const g = simulerVente(aVendre({type: 'parking', valeur: 24000, part: 50, achat: {mode: 'existant', date: dans(-36), prix: 10000}}));
  assert.equal(g.petite, true); assert.equal(g.impots, 0);
});
test('maison construite : plus-value du terrain depuis son achat, de la maison depuis le début des travaux', () => {
  const r = simulerVente(aVendre({type: 'maison', valeur: 500000, achat: {mode: 'construction', date: dans(-12 * 25), prix: 100000, construction: 200000,
    debutTravaux: dans(-12 * 8), finTravaux: dans(-12 * 7)}}));
  assert.equal(r.annees, 25); assert.equal(r.anneesMaison, 8); assert.equal(r.construit, true);
  const pvPart = Math.max(0, r.pv), t = pvPart / 3, m = pvPart * 2 / 3;
  proche(r.ir, t * 0 * 0.19 + m * (1 - abatIR(8)) * 0.19, 0.01);               // terrain : 25 ans, exonéré d'impôt
  proche(r.ps, t * (1 - abatPS(25)) * 0.172 + m * (1 - abatPS(8)) * 0.172, 0.01);
  assert.equal(r.travaux, Math.max(0, 0.15 * 300000));                         // forfait : 5 ans depuis la fin de la construction
});
test('SCI à l\'IR : plus-value imposée sur tes parts', () => {
  ctx.setScis([{id: 'S', regime: 'ir'}]);
  const r = simulerVente(aVendre({structure: 'sci', sciId: 'S', vente: {parts: 40, frais: 0}}));
  const np = simulerVente(aVendre());
  proche(r.impots, np.impots * 0.4, 0.01); proche(r.pourToi, np.pourToi * 0.4, 0.01);
  ctx.setScis([]);
});
test('SCI à l\'IS : argent gardé dans la SCI ou sorti en dividendes (flat tax 31,4 %)', () => {
  ctx.setScis([{id: 'S', regime: 'is'}]);
  const b = o => aVendre({structure: 'sci', sciId: 'S', achat: {mode: 'existant', date: dans(-120), prix: 200000, notaire: 15000}, ...o});
  const garde = simulerVente(b()), sortie = simulerVente(b({vente: {frais: 0, sortir: true}}));
  const base = Math.max(0, garde.pv);
  proche(garde.is, 0.15 * Math.min(base, 42500) + 0.25 * Math.max(0, base - 42500), 0.01);
  assert.equal(garde.pfu, 0); proche(garde.dansSci, garde.liquide - garde.is, 0.01);
  proche(sortie.dividendes, Math.min(sortie.dansSci, base - sortie.is), 0.01);
  proche(sortie.pfu, sortie.dividendes * 0.314, 0.01);
  proche(sortie.pourToi, sortie.dansSci - sortie.pfu, 0.01);
  ctx.setScis([]);
});
test('vente : achat manquant signalé', () => {
  assert.equal(simulerVente(aVendre({achat: {mode: 'existant'}})).manqueAchat, true);
  assert.equal(simulerVente(aVendre()).manqueAchat, false);
});
test('espace à aménager : coût total saisi à la main, il remplace l\'estimation au m² (mobilier compris)', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  Object.assign(e.amenag, {m2: 40, meuble: '1'});
  e.amenag.estimation = {prix: 160000, loyerVide: 600, loyerMeuble: 700, cle: cleAmenag(e)};
  assert.ok(planAmenag(e).mobilier > 0);                // estimé : travaux au m² + mobilier à part
  e.amenag.total = 25000;
  const q = planAmenag(e);
  assert.equal(q.travaux, 25000); assert.equal(q.mobilier, 0); assert.equal(q.saisi, true);
  assert.equal(q.creee, q.valeur - 25000); assert.equal(q.rendement, undefined);
  amenagTermine(e);
  assert.equal(e.achat.travaux, 25000); assert.equal(e.achat.mobilier, null);
});
test('espace à aménager : à la nuitée, recettes du saisonnier et fiche en location saisonnière une fois fait', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  Object.assign(e.amenag, {m2: 40, meuble: 'nuit', nuit: 90, occupation: 50});
  e.amenag.estimation = {prix: 160000, loyerVide: 600, loyerMeuble: 700, cle: cleAmenag(e)};
  const q = planAmenag(e);
  assert.equal(q.saison, true); assert.equal(q.meuble, true);
  proche(q.sz.nuits, 182.5, 1e-9);
  assert.equal(q.loyer, Math.round(90 * 182.5 / 12 / 10) * 10);
  assert.ok(q.sz.netMois < q.sz.brutMois);
  delete e.amenag.nuit;                                 // sans prix : point de départ tiré du meublé décoté (÷ 9)
  assert.equal(planAmenag(e).nuit, Math.max(20, Math.round(Math.round(700 * 0.76 / 10) * 10 / 9 / 5) * 5));
  e.amenag.nuit = 90;
  amenagTermine(e);
  assert.equal(e.location.statut, 'saisonnier'); assert.equal(e.location.nuit, 90); assert.equal(e.location.nuitsAn, 183);
  assert.ok(calculs(e).loyerMois > 0);
});
test('espace à aménager à la nuitée, loué seulement l\'été : moins de nuits, prix par nuit plus haut', () => {
  const m = maison(), e = nouvelEspace(m);
  ctx.setBiens([m, e]);
  Object.assign(e.amenag, {m2: 40, meuble: 'nuit'});
  e.amenag.estimation = {prix: 160000, loyerVide: 600, loyerMeuble: 700, cle: cleAmenag(e)};
  const an = planAmenag(e);
  assert.equal(an.occupation, 60);
  e.amenag.periode = 'ete';
  const ete = planAmenag(e);
  assert.equal(ete.occupation, 80); proche(ete.sz.nuits, 122 * 0.8, 1e-9);   // taux sur les 122 jours de juin à septembre
  assert.ok(ete.nuit > an.nuit);                       // haute saison : nuit plus chère
  assert.ok(ete.loyer < an.loyer);                     // mais moins de recettes sur l'année
  e.amenag.remplissage = 90;                           // taux saisi : il prime sur celui proposé pour la période
  assert.equal(planAmenag(e).occupation, 90); proche(planAmenag(e).sz.nuits, 122 * 0.9, 1e-9);
  delete e.amenag.remplissage; e.amenag.occupation = 27;   // ancien taux saisi sur l'année : mêmes nuits qu'avant
  proche(planAmenag(e).sz.nuits, 365 * 0.27, 1e-9);
});

// ---------- Comptable de la SCI ----------
test('comptable de la SCI : honoraires partagés entre les biens qui le choisissent, vendus exclus', () => {
  const sci = {id: 'sci1', nom: 'SCI Test', regime: 'is', compta: 1800};
  const loue = o => nouveauBien({structure: 'sci', sciId: 'sci1', achat: {prix: 100000}, location: {statut: 'vide', loyer: 700, vacance: 0}, ...o});
  const a = loue({chargesAn: {...sansCharges, comptaSci: '1', compta: 999}});
  const b = loue({chargesAn: {...sansCharges, comptaSci: '1'}});
  const c = loue({chargesAn: {...sansCharges, compta: 300}});                       // montant à lui : pas de part
  const v = loue({chargesAn: {...sansCharges, comptaSci: '1'}, vendu: {mois: dans(-2)}});
  ctx.setScis([sci]); ctx.setBiens([a, b, c, v]);
  assert.equal(calculs(a).compta, 900); assert.equal(calculs(a).chargesAn, 900);  // 1 800 € ÷ 2 biens, le montant saisi à la main est ignoré
  assert.equal(calculs(b).cfAn, 700 * 12 - 900);
  assert.equal(calculs(c).compta, 300);
  sci.compta = null; assert.equal(calculs(a).compta, 0);                           // honoraires pas encore saisis
  const np = nouveauBien({chargesAn: {...sansCharges, comptaSci: '1', compta: 200}}); // plus dans une SCI : son propre montant
  ctx.setBiens([np]); assert.equal(calculs(np).compta, 200);
  ctx.setBiens([]); ctx.setScis([]);
});

// ---------- Un crédit pour deux biens ----------
function deuxApparts(parts = 60) {
  const pret = {id: 'p', montant: 250000, taux: 3.5, duree: 240, debut: dans(-24), assurance: 20, partage: [{id: 'b2', part: 100 - parts}]};
  const a = nouveauBien({id: 'b1', nom: 'T3', chargesAn: sansCharges, achat: {prix: 150000}, valeur: 160000, location: {statut: 'vide', loyer: 700, vacance: 0}, prets: [pret]});
  const b = nouveauBien({id: 'b2', nom: 'T2', chargesAn: sansCharges, achat: {prix: 100000}, valeur: 110000, location: {statut: 'vide', loyer: 500, vacance: 0}});
  ctx.setBiens([a, b]);
  return {a, b, pret};
}
test('crédit commun : chaque bien compte sa part, les totaux comptent le prêt une seule fois', () => {
  const {a, b, pret} = deuxApparts(60);
  const seul = calculs(nouveauBien({chargesAn: sansCharges, prets: [{...pret, partage: []}]}));
  const ca = calculs(a), cb = calculs(b);
  proche(ca.crd, seul.crd * 0.6); proche(cb.crd, seul.crd * 0.4);
  proche(ca.mensuCredit + cb.mensuCredit, seul.mensuCredit);
  proche(ca.creditAn, seul.creditAn * 0.6); proche(cb.creditAn, seul.creditAn * 0.4);
  proche(ca.emprunte, 150000); proche(cb.emprunte, 100000);
  proche(cb.cfAn, 500 * 12 - seul.creditAn * 0.4);
  assert.equal(cb.recus.length, 1); assert.equal(cb.recus[0].de, a);
  const t = totaux([a, b]);
  proche(t.D, seul.crd); proche(t.net, 270000 - seul.crd);
  proche(t.cf, (1200 * 12 - seul.creditAn) / 12);
});
test('crédit commun : bien retiré de la répartition ou supprimé, le prêt revient entier au bien qui le porte', () => {
  const {a, pret} = deuxApparts(60);
  const avant = calculs(a).crd / 0.6;
  ctx.setBiens([a]);   // l'autre bien supprimé
  proche(calculs(a).crd, avant);
  pret.partage = []; ctx.setBiens([a]);
  proche(calculs(a).crd, avant);
});
test('crédit commun : répartition par défaut au prorata des prix, sinon des valeurs, sinon à parts égales', () => {
  const {a, b} = deuxApparts();
  assert.deepEqual([...partsAuProrata(a, [b])], [40]);
  const c = nouveauBien({id: 'c', valeur: 50000}), d = nouveauBien({id: 'd', valeur: 150000});
  assert.deepEqual([...partsAuProrata(c, [d])], [75]);
  assert.deepEqual([...partsAuProrata(nouveauBien(), [nouveauBien(), nouveauBien()])], [33, 33]);
});
test('crédit commun : à la vente d\'un des biens, seule sa part du restant dû est remboursée', () => {
  const {a, b} = deuxApparts(60);
  const cb = calculs(b), r = simulerVente(b);
  proche(r.crd, cb.crd, 1);
  assert.equal(r.prets, 1);
  assert.ok(lieSimple(b) === false);
});
test('totaux : logement de la famille (résidence principale, secondaire, garage avec) à part du cash-flow locatif', () => {
  const loue = nouveauBien({valeur: 200000, chargesAn: sansCharges, location: {statut: 'vide', loyer: 900, vacance: 0},
    prets: [{montant: 100000, taux: 3, duree: 240, debut: dans(-12)}]});
  const maison = nouveauBien({valeur: 400000, chargesAn: {...sansCharges, tf: 1200}, location: {statut: 'rp', vacance: 0},
    prets: [{montant: 200000, taux: 3, duree: 240, debut: dans(-12)}]});
  const garage = nouveauBien({type: 'parking', valeur: 20000, chargesAn: {...sansCharges, tf: 120}, lieA: maison.id, location: {statut: 'avec', vacance: 0}});
  const secondaire = nouveauBien({valeur: 150000, chargesAn: {...sansCharges, tf: 600}, location: {statut: 'secondaire', vacance: 0}});
  ctx.setBiens([loue, maison, garage, secondaire]);
  const t = totaux([loue, maison, garage, secondaire]), c = x => calculs(x).cfMois;
  assert.equal(t.nLog, 3); assert.equal(t.nInv, 1);
  proche(t.cfInv, c(loue), 1e-9);
  proche(t.cfLog, c(maison) + c(garage) + c(secondaire), 1e-9);
  proche(t.cf, t.cfInv + t.cfLog, 1e-9);                 // le total reste la somme des deux
  assert.ok(t.cfLog < 0 && t.cfInv > 0);
  proche(t.moisInv.loyer, 900, 1e-9);
  ctx.setBiens([]);
});
