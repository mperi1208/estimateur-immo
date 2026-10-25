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
  'var STATUTS = {}, biens = [];',
  bloc(idx, 'function echeancier', '// ---------- Simulation'),
  'this.X = {pmt, solde, etatPret, planPret, analyseReneg, simulerRachat, calculs, echeancier, ecartMois, decalerMois, normMois, moisCourant};',
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
test('cash-flow : loyers, charges, plus de rendement calculé', () => {
  const c = calculs(bien());
  assert.equal(c.cout, 170000); assert.equal(c.loyersAn, 9600); assert.equal(c.chargesAn, 1600);
  assert.equal(c.cfAn, 8000); assert.ok(!('brut' in c) && !('net' in c));
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

// ---------- Crédit : cas limites ----------
const auj = ctx.X.moisCourant ? ctx.X.moisCourant() : null;
test('mensualité : le solde est nul au bout de la durée, pour plusieurs taux et durées', () => {
  for (const t of [0.5, 1.2, 3.39, 5, 8]) for (const n of [12, 84, 180, 300]) {
    const r = t / 1200, M = pmt(250000, r, n);
    proche(solde(250000, r, M, n), 0, 0.01);
    assert.ok(M * n > 250000);                                   // on rembourse plus que le capital
  }
});
test('échéancier à taux nul : capital / durée chaque mois, aucun intérêt', () => {
  const e = echeancier(120000, 0, 240, 0, 'partiel', 0);
  proche(e.pmt, 500); assert.ok(e.rows.every(r => r.i === 0)); proche(e.rows[239].crd, 0, 1e-6);
});
test('échéancier : différé total = capital augmenté des intérêts, mensualité calculée dessus', () => {
  const r = 0.03 / 12, e = echeancier(100000, 3, 120, 6, 'total', 0);
  proche(e.rows[5].crd, 100000 * Math.pow(1 + r, 6), 0.01);
  proche(e.pmt, pmt(100000 * Math.pow(1 + r, 6), r, 120), 0.001);
  proche(e.rows[e.rows.length - 1].crd, 0, 0.01);
});
test('prêt : mensualité saisie (différente du calcul) utilisée telle quelle', () => {
  const e = etatPret({montant: 100000, taux: 2, duree: 120, debut: '2020-01', mensualite: 1000}, '2020-12');
  assert.equal(e.M, 1000); proche(e.crd, solde(100000, 2 / 1200, 1000, 12), 0.01);
});
test('prêt : sur 12 mois, intérêts + capital = 12 mensualités, capital = baisse du restant dû', () => {
  const p = {montant: 200000, taux: 3.5, duree: 300, debut: '2022-03'}, e = etatPret(p, '2025-06');
  proche(e.interets + e.capital, 12 * e.M, 0.01);
  proche(e.capital, e.crd - etatPret(p, '2026-06').crd, 0.01);
});
test('prêt : relevé plus vieux que les mois restants = soldé', () => {
  const e = etatPret({crd: 20000, mois: 10, crdLe: '2024-01', taux: 2}, '2025-06');
  assert.equal(e.crd, 0); assert.equal(e.mois, 0); assert.equal(e.payes, 0);
});
test('prêt dont la 1re échéance est dans 6 mois : rien à payer avant, 7 échéances sur les 12 prochains mois', () => {
  const debut = decalerMois('2026-01', 6), p = {montant: 100000, taux: 3, duree: 240, debut};
  const e = etatPret(p, '2026-01');
  assert.equal(e.crd, 100000);
  assert.equal(e.payes, 7);                                      // juillet 2026 à janvier 2027
  assert.equal(e.fin, decalerMois(debut, 239));                  // dernière échéance : 240e à partir de la 1re
  const demain = etatPret({...p, debut: '2026-02'}, '2026-01');   // 1re échéance le mois prochain : 12 échéances
  assert.equal(demain.payes, 12); assert.equal(demain.fin, decalerMois('2026-02', 239));
});
test('prêt progressif : mensualité actuelle seule, hausse calculée pour finir à la date prévue', () => {
  const p = {montant: 101058, taux: 3.7, duree: 300, debut: '2026-05', mensualite: 497, progressif: '1', mensuLe: '2026-10'};
  const e = etatPret(p, '2026-10');
  assert.equal(e.M, 497); assert.equal(e.fin, '2051-04');
  assert.ok(e.prog.g > 0 && e.prog.g < 0.02, `hausse ${e.prog.g}`);
  assert.equal(e.prog.hausse.mois, '2027-05'); proche(e.prog.hausse.M, 497 * (1 + e.prog.g), 1e-6);
  assert.equal(etatPret(p, '2051-04').crd, 0);
  assert.ok(etatPret(p, '2051-03').crd > 0);
  // Plus tard, la mensualité saisie en octobre 2026 a augmenté ; le restant dû est plus haut qu'en mensualité constante
  assert.ok(etatPret(p, '2030-10').M > 497);
  assert.ok(e.crd > etatPret({...p, progressif: '', mensualite: null}, '2026-10').crd);
  proche(e.interets + e.capital, e.paye12, 1e-6);
});
test('prêt progressif : hausse saisie, mensualité calculée ; saisie plus tard ramenée à l\'année 0', () => {
  const p = {montant: 100000, taux: 3, duree: 240, debut: '2020-01', progressif: '1', hausse: 2};
  const e = etatPret(p, '2020-06'), l = ctx.X.planPret(p, '2020-06').l;
  proche(l[239].crd, 0, 0.01); proche(l[12].paye, l[0].paye * 1.02, 1e-6); proche(l[24].paye, l[0].paye * 1.0404, 1e-6);
  const M3 = l[36].paye, e2 = etatPret({...p, hausse: null, mensualite: M3, mensuLe: '2023-03'}, '2023-03');
  proche(e2.prog.g, 0.02, 1e-6); proche(e2.crd, etatPret(p, '2023-03').crd, 0.5);
  assert.equal(e.prog.saisie, true);
});
test('prêt avec différé partiel puis total : intérêts seuls ou capitalisés, durée comprise', () => {
  const p = {montant: 100000, taux: 3, duree: 240, debut: '2025-01', typeDiff: 'partiel', differe: 12};
  const e = etatPret(p, '2025-06');
  proche(e.M, 250, 1e-9); assert.equal(e.crd, 100000); assert.equal(e.capital > 0, true);   // 6 mois d'intérêts seuls puis l'amortissement
  assert.equal(e.differe.fin, '2025-12'); proche(e.differe.apres, pmt(100000, 0.0025, 228), 1e-6);
  assert.equal(e.fin, '2044-12');
  const t = etatPret({...p, typeDiff: 'total'}, '2025-11');   // dernier mois du différé à venir
  proche(t.crd, 100000 * Math.pow(1.0025, 11), 0.01); assert.equal(t.M, 0);
  assert.equal(etatPret({...p, typeDiff: 'total'}, '2025-12').differe, null);
  proche(t.differe.apres, pmt(100000 * Math.pow(1.0025, 12), 0.0025, 228), 1e-6);
  const c = calculs(bien({prets: [{...p, assurance: 20}]}));
  proche(c.creditAn, c.prets[0].e.paye12 + 20 * c.prets[0].e.payes, 1e-9);
});
test('prêt en pause (relevé à venir) : pas de mensualité comptée tant qu\'il ne reprend pas', () => {
  const b = bien({prets: [{crd: 100000, mois: 120, crdLe: decalerMois(auj, 4), taux: 3}]});
  const c = calculs(b), e = c.prets[0].e;
  assert.equal(e.pause, 4); assert.equal(c.mensuCredit, 0);
  proche(c.creditAn, e.M * 8, 0.01);                             // 8 échéances sur les 12 prochains mois
});
test('rentabilité avec crédit : cash-flow = loyers − charges − crédit ; intérêts + capital = crédit (sans assurance)', () => {
  const c = calculs(bien({prets: [{montant: 150000, taux: 3, duree: 240, debut: decalerMois(auj, -12)}]}));
  proche(c.cfAn, c.loyersAn - c.chargesAn - c.creditAn, 1e-6);
  proche(c.interetsAn + c.capitalAn, c.creditAn, 0.01);
  proche(c.cfMois * 12, c.cfAn, 1e-9);
  assert.equal(c.emprunte, 150000);
});
test('rentabilité : assurance du prêt dans la mensualité et le crédit annuel', () => {
  const c = calculs(bien({prets: [{montant: 100000, taux: 2, duree: 240, debut: decalerMois(auj, -1), assurance: 25}]}));
  proche(c.mensuCredit, c.prets[0].e.M + 25, 1e-9); proche(c.creditAn, (c.prets[0].e.M + 25) * 12, 0.01);
});
test('rentabilité : vacance plafonnée à 12 mois, coût nul = pas de plus-value', () => {
  assert.equal(calculs(bien({location: {statut: 'vide', loyer: 800, vacance: 15}})).loyersAn, 0);
  const sansAchat = calculs(bien({achat: {}}));
  assert.equal(sansAchat.plusValue, null);
});
test('renégociation : nouvelle mensualité au taux du marché, indemnités plafonnées, rien sous 1 000 €', () => {
  const src = idx;
  vm.runInContext(bloc(src, 'const TAUX_ACTUEL =', 'const GAMMES_CF') + bloc(src, 'function tauxDuree', '// ---------- Fiscalité')
    + 'T.TAUX_ACTUEL = TAUX_ACTUEL; T.HISTO = HISTO; T.tauxDuree = tauxDuree; T.SURPRIME_SCI = 0.3;', ctx);
  const p = {montant: 200000, taux: 4.5, duree: 300, debut: '2023-06', offre: '2023-06'};
  const e = etatPret(p, '2026-01'), a = ctx.X.analyseReneg(p, e, false);
  const n = e.mois, t = ctx.T.tauxDuree(ctx.T.TAUX_ACTUEL, n);
  proche(a.tNew, t, 1e-9); proche(a.mensu2, pmt(e.crd, t / 1200, n), 0.01);
  proche(a.gainMois, e.M - a.mensu2, 1e-6); proche(a.ira, Math.min(0.03 * e.crd, 6 * e.crd * 4.5 / 1200), 0.01);
  assert.ok(a.surprime && a.surprime[0] > 0);                    // 4,5 % en juin 2023 : au-dessus du marché d'alors
  proche(ctx.X.analyseReneg(p, e, true).tNew, t + 0.3, 1e-9);    // SCI : surprime
  assert.equal(ctx.X.analyseReneg(p, {...e, crd: 500}, false), null);
});
// ---------- Simulation de rachat ou renégociation ----------
const avecTaux = () => ctx.T.tauxDuree || vm.runInContext(bloc(idx, 'const TAUX_ACTUEL =', 'const GAMMES_CF') + bloc(idx, 'function tauxDuree', '// ---------- Fiscalité')
  + 'T.TAUX_ACTUEL = TAUX_ACTUEL; T.HISTO = HISTO; T.tauxDuree = tauxDuree; T.SURPRIME_SCI = 0.3;', ctx);
const pretRachat = (o = {}) => ({id: 'p1', crd: 150000, mois: 240, crdLe: '2026-01', taux: 4.5, assurance: 30, ...o});
test('rachat : par défaut, taux du marché sur la durée restante, frais (indemnités, dossier, garantie) payés comptant', () => {
  avecTaux();
  const p = pretRachat(), b = {structure: 'np', prets: [p]}, s = ctx.X.simulerRachat(b, p, '2026-01');
  const t = Math.round(ctx.T.tauxDuree(ctx.T.TAUX_ACTUEL, 240) * 100) / 100;
  assert.equal(s.tAuj, t); assert.equal(s.taux, t); assert.equal(s.duree, 240); assert.equal(s.assur, 30);
  proche(s.ira, Math.min(0.03 * 150000, 6 * 150000 * 4.5 / 1200));
  assert.equal(s.dossier, 1000); assert.equal(s.garantie, 2250); proche(s.frais, s.ira + 3250);
  proche(s.M2, pmt(150000, t / 1200, 240)); proche(s.mensuApres, s.M2 + 30);
  const M = pmt(150000, 4.5 / 1200, 240);
  proche(s.mensuAvant, M + 30); proche(s.coutAvant, (M + 30) * 240, 0.05);
  proche(s.coutApres, (s.M2 + 30) * 240 + s.frais, 0.05); proche(s.gain, s.coutAvant - s.coutApres, 1e-6);
  proche(s.interetsAvant, M * 240 - 150000, 0.05); proche(s.interetsApres, s.M2 * 240 - 150000, 0.05);
  // Point d'équilibre : avant « frais ÷ baisse de mensualité », car à taux plus bas le capital se rembourse aussi plus vite
  assert.ok(s.equilibre > 12 && s.equilibre <= Math.ceil(s.frais / s.diffMois), `équilibre ${s.equilibre}`);
});
test('rachat : taux, durée, assurance et frais saisis ; frais ajoutés au prêt ; jamais rentable si le taux ne baisse pas', () => {
  avecTaux();
  const p = pretRachat({rachat: {taux: 3, duree: 300, assurance: 20, ira: 0, dossier: 500, garantie: 1500, finance: '1'}}), b = {structure: 'np', prets: [p]};
  const s = ctx.X.simulerRachat(b, p, '2026-01');
  assert.equal(s.frais, 2000); assert.equal(s.capital, 152000); proche(s.M2, pmt(152000, 0.03 / 12, 300));
  proche(s.coutApres, (s.M2 + 20) * 300, 0.05);                       // rien de payé comptant
  assert.ok(s.equilibre >= 1);
  p.rachat = {taux: 4.5, ira: 1000};
  const s2 = ctx.X.simulerRachat(b, p, '2026-01');
  assert.ok(s2.gain < 0); assert.equal(s2.equilibre, null);
});
test('renégociation : seulement les frais d\'avenant (600 € par défaut), SCI : surprime sur le taux du marché', () => {
  avecTaux();
  const p = pretRachat({rachat: {mode: 'reneg'}}), s = ctx.X.simulerRachat({structure: 'np', prets: [p]}, p, '2026-01');
  assert.equal(s.reneg, true); assert.equal(s.ira, 0); assert.equal(s.garantie, 0); assert.equal(s.frais, 600);
  const sci = ctx.X.simulerRachat({structure: 'sci', prets: [p]}, p, '2026-01');
  proche(sci.tAuj, s.tAuj + 0.3, 0.011);
});
test('rachat : deux prêts du bien regroupés en un seul', () => {
  avecTaux();
  const p = pretRachat({rachat: {avec: ['p2'], taux: 3, duree: 240}}), q = {id: 'p2', crd: 20000, mois: 120, crdLe: '2026-01', taux: 2, assurance: 5};
  const b = {structure: 'np', prets: [p, q]}, s = ctx.X.simulerRachat(b, p, '2026-01');
  assert.equal(s.groupe, 2); proche(s.crd, 170000); assert.equal(s.nAuj, 240); assert.equal(s.assur, 35);
  proche(s.mensuAvant, pmt(150000, 4.5 / 1200, 240) + pmt(20000, 2 / 1200, 120) + 35);
  proche(s.M2, pmt(170000, 0.03 / 12, 240));
  p.rachat.avec = [];
  assert.equal(ctx.X.simulerRachat(b, p, '2026-01').groupe, 1);
  assert.equal(ctx.X.simulerRachat(b, {...p, taux: null}, '2026-01'), null);
});
test('taux du marché par durée : interpolé entre 15, 20 et 25 ans', () => {
  const {tauxDuree, TAUX_ACTUEL: R} = ctx.T;
  assert.equal(tauxDuree(R, 120), R[15]); assert.equal(tauxDuree(R, 240), R[20]); assert.equal(tauxDuree(R, 360), R[25]);
  proche(tauxDuree(R, 270), (R[20] + R[25]) / 2, 1e-9);
});
