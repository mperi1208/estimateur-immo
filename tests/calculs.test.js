// Tests des calculs financiers (crédit, rentabilité), sans navigateur ni dépendance : `node --test tests/`
// Les fonctions vivent dans des scripts de page ; on en découpe les blocs purs et on les évalue dans un contexte isolé.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lire = f => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8');
function bloc(src, debut, fin) {
  const i = src.indexOf(debut), j = src.indexOf(fin, i);
  assert.ok(i >= 0 && j > i, `bloc introuvable : ${debut} … ${fin}`);
  return src.slice(i, j);
}

const inv = lire('investissements.js'), idx = lire('index.html');
const ctx = vm.createContext({T: {}});
vm.runInContext([
  bloc(inv, 'const somme =', 'const uid ='),
  bloc(inv, '// ---------- Mois', '// ---------- Données'),
  'var STATUTS = {};',
  bloc(idx, 'function echeancier', '// ---------- Simulation'),
  'this.X = {pmt, solde, etatPret, analyseReneg, calculs, echeancier, ecartMois, decalerMois, normMois};',
].join('\n'), ctx);
const {pmt, solde, etatPret, calculs, echeancier, ecartMois, decalerMois, normMois} = ctx.X;
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('mensualité : 200 000 € à 3 % sur 20 ans ≈ 1109,20 €', () => proche(pmt(200000, 0.03 / 12, 240), 1109.20, 0.05));
test('mensualité à taux nul : capital / durée', () => proche(pmt(120000, 0, 240), 500));
test('le solde après toutes les échéances est nul', () => {
  const r = 0.035 / 12, M = pmt(150000, r, 180);
  proche(solde(150000, r, M, 180), 0, 0.01);
  proche(solde(150000, r, M, 0), 150000);
});
test('échéancier : le capital est entièrement remboursé et pmt cohérent', () => {
  const e = echeancier(200000, 3, 240, 0, 'partiel', 0);
  proche(e.pmt, pmt(200000, 0.03 / 12, 240), 0.001);
  assert.equal(e.rows.length, 240);
  proche(e.rows[239].crd, 0, 0.01);
  proche(e.rows.reduce((t, r) => t + r.cap, 0), 200000, 0.01);
});
test('échéancier : différé partiel = intérêts seuls, différé total capitalise', () => {
  const p = echeancier(100000, 3, 120, 12, 'partiel', 0), t = echeancier(100000, 3, 120, 12, 'total', 0);
  proche(p.rows[0].i, 250); assert.equal(p.rows[0].cap, 0); proche(p.rows[11].crd, 100000);
  assert.equal(t.rows[0].i, 0); assert.ok(t.rows[11].crd > 103000);
  assert.equal(p.rows.length, 132);
});
test('échéancier : assurance mensuelle = capital × taux annuel / 12', () => proche(echeancier(240000, 3, 240, 0, 'partiel', 0.3).assM, 60));

test('mois : écart, décalage, normalisation', () => {
  assert.equal(ecartMois('2024-01', '2025-03'), 14);
  assert.equal(decalerMois('2024-11', 3), '2025-02');
  assert.equal(normMois('3/2024'), '2024-03');
  assert.equal(normMois('n’importe quoi'), '');
});

test('prêt décrit par son offre : échéances payées et restant dû à la date', () => {
  const p = {montant: 200000, taux: 3, duree: 240, debut: '2024-01'};
  const e = etatPret(p, '2025-12');   // 24 échéances payées (jan. 2024 à déc. 2025)
  assert.equal(e.mois, 216);
  const r = 0.03 / 12; proche(e.crd, solde(200000, r, pmt(200000, r, 240), 24), 0.01);
  assert.ok(e.crd < 200000 && e.crd > 180000);
});
test('prêt décrit par un relevé à date passée / à venir (différé)', () => {
  const r = 0.03 / 12;
  const passe = etatPret({crd: 100000, mois: 120, crdLe: '2025-01', taux: 3}, '2025-07');
  assert.equal(passe.mois, 114); proche(passe.crd, solde(100000, r, pmt(100000, r, 120), 6), 0.01);
  const futur = etatPret({crd: 100000, mois: 120, crdLe: '2025-10', taux: 3}, '2025-07');
  assert.equal(futur.pause, 3); assert.equal(futur.crd, 100000); assert.equal(futur.mois, 123);
});
test('prêt soldé : restant dû nul, jamais négatif ; données insuffisantes : null', () => {
  const e = etatPret({montant: 50000, taux: 2, duree: 60, debut: '2015-01'}, '2025-01');
  assert.equal(e.crd, 0); assert.equal(e.mois, 0);
  assert.equal(etatPret({}, '2025-01'), null);
});

const bien = (o = {}) => Object.assign({
  type: 'appartement', prets: [], valeur: 0, location: {statut: 'vide', loyer: 800, vacance: 0},
  chargesAn: {tf: 1000, copro: 600, pno: 0, compta: 0, cfe: 0, autres: 0, gestion: 0, entretien: 0},
  achat: {prix: 150000, notaire: 12000, travaux: 8000},
}, o);
test('rentabilité : loyers, charges, rendements bruts et nets', () => {
  const c = calculs(bien());
  assert.equal(c.cout, 170000); assert.equal(c.loyersAn, 9600); assert.equal(c.chargesAn, 1600);
  proche(c.brut, 9600 / 170000, 1e-9); proche(c.net, 8000 / 170000, 1e-9); assert.equal(c.cfAn, 8000);
});
test('rentabilité : vacance, gestion et entretien en % des loyers', () => {
  const c = calculs(bien({location: {statut: 'vide', loyer: 1000, vacance: 1}, chargesAn: {tf: 0, gestion: 8, entretien: 2}}));
  proche(c.loyersAn, 11000); proche(c.chargesAn, 1100);
});
test('rentabilité : bien non loué = aucun loyer ; colocation = somme des chambres', () => {
  assert.equal(calculs(bien({location: {statut: 'perso', loyer: 900}})).loyersAn, 0);
  const co = calculs(bien({location: {statut: 'colocation'}, chambres: [{loyer: 400}, {loyer: 450}]}));
  assert.equal(co.loyerMois, 850);
});
test('rentabilité : terrain loué (bail) ou à activités, loyer annuel ou mensuel', () => {
  const t = o => calculs(bien(Object.assign({type: 'terrain'}, o)));
  assert.equal(t({location: {statut: 'loue', loyer: 1200, periode: 'an'}}).loyersAn, 1200);
  assert.equal(t({location: {statut: 'loue', loyer: 100, periode: 'mois'}}).loyersAn, 1200);
  assert.equal(t({location: {statut: 'activites'}, revenus: [{montant: 50, periode: 'mois'}, {montant: 300, periode: 'an'}]}).loyersAn, 900);
});
test('rentabilité : construction ajoutée au coût, patrimoine = valeur − restant dû', () => {
  const c = calculs(bien({achat: {mode: 'construction', prix: 80000, construction: 150000, notaire: 6000}, valeur: 300000,
    prets: [{montant: 100000, taux: 0, duree: 100, debut: '2024-01', mensualite: 1000}]}));
  assert.equal(c.cout, 236000); assert.equal(c.emprunte, 100000);
  assert.equal(c.patrimoine, 300000 - c.crd); assert.equal(c.plusValue, 64000);
});
