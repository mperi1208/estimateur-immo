// Onglet Financer : deux loyers avec leurs dates de début, travaux, fiscalité, revente, prix d'équilibre.
// Le formulaire est remplacé par de simples objets (valeur, case cochée, section ouverte).
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, proche, inv, idx} = require('./outils');

const CASES = ['travauxCredit', 'distrib', 'notaireCredit'];
const els = {};
const ctx = vm.createContext({els});
vm.runInContext([
  'const $ = id => els[id];',
  bloc(idx, '// ---------- Location saisonnière', '// --- Loyer : carte officielle'),
  bloc(idx, 'const TAUX_ACTUEL =', 'const GAMMES_CF'),
  bloc(idx, 'function tauxDuree', '// ---------- Formulaire'),
  bloc(idx, 'const FIELDS =', 'function tauxConseille'),
  bloc(idx, 'const BOXES =', 'function etat()'),
  bloc(idx, '// ---------- Crédit ----------', '// ---------- Affichage'),
  bloc(idx, '// ---------- Affichage', 'function rendre()'),
  bloc(idx, '// ---------- Achat + travaux + revente', 'function rendreRevente'),
  bloc(idx, '// ---------- Prix pour être rentable', 'function programmerCible'),
  bloc(idx, '// ---------- Deux projets de « Mes projets »', 'function regrouper('),
  'this.X = {FIELDS, DEFAUTS, set, simuler, financeRegroupee, bilanRevente, surtaxe, prixCible, metrique, anneeRef, anneeCroisiere, abatIR, abatPS};',
].join('\n'), ctx);
const {FIELDS, DEFAUTS, set, simuler, financeRegroupee, bilanRevente, surtaxe, prixCible, metrique, anneeRef, abatIR, abatPS} = ctx.X;
// Surtaxe de Mon patrimoine, pour vérifier que les deux onglets calculent pareil
const pat = vm.createContext({}); vm.runInContext(bloc(inv, 'function surtaxePV', 'const anneesEntre') + 'this.surtaxePV = surtaxePV;', pat);
const patAbat = vm.createContext({}); vm.runInContext(bloc(inv, 'const abatIR', 'function surtaxePV') + 'this.abatIR = abatIR; this.abatPS = abatPS;', patAbat);

// Formulaire : valeurs par défaut de l'appli, sections fermées, puis réglages du test
function formulaire(v = {}, ouverts = {}) {
  for (const k of FIELDS) els[k] = CASES.includes(k) ? {type: 'checkbox', checked: false} : {type: 'number', value: ''};
  for (const k of ['struct', 'meuble', 'regime', 'tmi', 'type', 'neuf', 'vieux', 'typeDiff', 'scenario', 'sciExist', 'locMode', 'classe']) els[k].type = 'select-one';
  for (const b of ['boxProjet', 'boxImpots', 'boxEvol', 'boxBien2']) els[b] = {open: false};
  const tout = {...DEFAUTS, taux: 3.39, tf: 800, copro: 0, compta: 0, vacance: 0, entretien: 0, pno: 0, ...v};
  for (const k of FIELDS) if (tout[k] != null) set(k, tout[k]);
  for (const [k, o] of Object.entries(ouverts)) els[{projet: 'boxProjet', impots: 'boxImpots', evol: 'boxEvol', bien2: 'boxBien2'}[k]].open = o;
  return simuler();
}

test('crédit : emprunt = coût − apport, garantie comprise, et coût total = apport + emprunt', () => {
  const s = formulaire({prix: 200000, notaire: 8, apport: 20000, dossier: 1000, garantie: 1.5});
  proche(s.pret, (200000 + 16000 + 1000 - 20000) / 0.985, 0.01);
  proche(s.coutTotal, 20000 + s.pret, 0.01);
  proche(s.ech.pmt, s.pret * (0.0339 / 12) / (1 - Math.pow(1 + 0.0339 / 12, -240)), 0.001);
});
test('deux loyers : le 2e compte à partir de son mois de début', () => {
  const s = formulaire({loyer: 800, loyer2: 300, debutLoyer2: 7});
  assert.equal(s.annees[0].loyers, 800 * 12 + 300 * 6);
  assert.equal(s.annees[1].loyers, 1100 * 12);
  assert.equal(anneeRef(s).y, 2);                     // 1re année pleine avec les deux loyers
});
test('travaux : loyer après le chantier ; 1er loyer forcé dès l\'achat quand il y a deux loyers', () => {
  const t = formulaire({loyer: 800, travaux: 30000, dureeTravaux: 6, valeurApres: 260000}, {projet: true});
  assert.equal(t.annees[0].loyers, 800 * 6); assert.equal(t.base, 260000);
  const deux = formulaire({loyer: 800, loyer2: 400, debutLoyer1: 1, debutLoyer2: 7, travaux: 30000, dureeTravaux: 6}, {projet: true});
  assert.equal(deux.annees[0].loyers, 800 * 12 + 400 * 6);
  const apres = formulaire({loyer: 800, loyer2: 400, debutLoyer2: 9, travaux: 30000, dureeTravaux: 6}, {projet: true});
  assert.equal(apres.annees[0].loyers, 800 * 6 + 400 * 4);
  assert.equal(anneeRef(apres).y, 2);                 // 1re année pleine avec les deux loyers
});
test('vacance et hausse des loyers', () => {
  const s = formulaire({loyer: 1000, vacance: 1, gLoyer: 2}, {evol: true});
  proche(s.annees[0].loyers, 12000 * 11 / 12); proche(s.annees[1].loyers, 12000 * 11 / 12 * 1.02);
});
test('fiscalité : micro-foncier jugé sur la somme des deux loyers', () => {
  assert.match(formulaire({loyer: 1000, regime: 'micro'}, {impots: true}).regime, /Micro-foncier/);
  const s = formulaire({loyer: 1000, loyer2: 400, regime: 'micro'}, {impots: true});   // 16 800 €/an : plus de micro
  assert.equal(s.p.loyerTotal, 1400); assert.match(s.regime, /au réel/);
});
test('fiscalité : déficit foncier imputé sur le revenu global dans la limite de 10 700 €', () => {
  const s = formulaire({prix: 150000, loyer: 600, travaux: 40000, dureeTravaux: 2, tmi: '30', regime: 'reel'}, {projet: true, impots: true});
  const a1 = s.annees[0];
  assert.ok(a1.impots < 0 && a1.impots >= -10700 * 0.30 - 0.01);   // économie d'impôt, plafonnée
  assert.match(a1.fisc, /déficit foncier/);
});
test('SCI à l\'IS : IS à 15 % puis 25 %, CRL sur un bien ancien', () => {
  const s = formulaire({prix: 100000, loyer: 2000, struct: 'is', vieux: '1'}, {impots: true});
  const a = s.annees[5];
  assert.ok(a.is > 0); proche(a.crl, a.loyers * 0.025);
});
test('surtaxe des plus-values : même calcul (avec lissage) dans Financer et Mon patrimoine', () => {
  for (const pv of [40000, 50001, 55000, 60000, 75000, 104000, 155000, 205000, 255000, 400000]) proche(surtaxe(pv), pat.surtaxePV(pv), 1e-6);
  proche(surtaxe(55000), 850);
});
test('achat-revente : marge = revente − frais − coût du projet − intérêts et charges', () => {
  formulaire({prix: 150000, travaux: 40000, dureeTravaux: 6, valeurApres: 260000, moisRevente: 12, fraisRevente: 4, scenario: 'revendre', differe: 6}, {projet: true});
  const s = simuler(), b = bilanRevente(s);
  const attendu = b.prixVente - b.fraisVente - b.ira - b.coutAchat - b.interets - b.assurance - b.chargesFixes;
  proche(b.margeBrute, attendu, 0.5);
  assert.equal(b.prixVente, 260000);
});
test('prix d\'équilibre : le plus haut prix qui donne le cash-flow visé', () => {
  formulaire({prix: 200000, loyer: 900});
  const r = prixCible(0);
  assert.equal(els.prix.value, 200000);                // le prix saisi n'est pas modifié
  assert.ok(!r.impossible && !r.sansLimite);
  assert.ok(metrique(r.prix) >= 0 && metrique(r.prix + 500) < 0);
});

// ---------- Location saisonnière ----------
test('saisonnier : recettes = prix × nuits, frais en % des recettes, sans vacance', () => {
  const v = {loyer: 900, vacance: 1, locMode: 'nuit', nuit: 100, occupation: 60, sejour: 3, menage: 30, plateforme: 15, conciergerie: 0, chargesSaison: 150, classe: '0'};
  const s = formulaire(v);
  const nuits = 365 * 0.6, brut = 100 * nuits;
  proche(s.annees[0].loyers, brut, 0.01);                      // la vacance ne compte pas : l'occupation la remplace
  const frais = brut * 0.15 + nuits / 3 * 30 + 150 * 12;
  proche(s.annees[0].charges, 800 + 300 + frais, 0.01);         // taxe foncière, CFE d'un meublé, frais saisonniers
  assert.equal(s.meuble, true);
});
test('saisonnier : micro-BIC 30 % non classé (plafond 15 000 €), 50 % classé', () => {
  const base = {locMode: 'nuit', nuit: 60, occupation: 50, sejour: 3, menage: 0, plateforme: 0, conciergerie: 0, chargesSaison: 0, tmi: '30', regime: 'micro'};
  const s = formulaire({...base, classe: '0'}, {impots: true}), brut = 60 * 365 * 0.5;   // 10 950 € : sous le plafond
  proche(s.annees[0].impots, brut * 0.7 * (0.30 + 0.186), 0.01);
  assert.match(s.regime, /non classé, micro-BIC \(abattement 30 %\)/);
  const c = formulaire({...base, classe: '1'}, {impots: true});
  proche(c.annees[0].impots, brut * 0.5 * (0.30 + 0.186), 0.01);
  const gros = formulaire({...base, nuit: 120, classe: '0'}, {impots: true});   // 21 900 € : au-dessus de 15 000 €
  assert.match(gros.regime, /réel obligatoire/);
});
test('saisonnier : un 2e loyer au mois garde sa vacance', () => {
  const s = formulaire({locMode: 'nuit', nuit: 50, occupation: 100, sejour: 1, menage: 0, plateforme: 0, conciergerie: 0, chargesSaison: 0, loyer2: 100, vacance: 1.2});
  proche(s.annees[0].loyers, 50 * 365 + 100 * 12 * 0.9, 0.01);
});
test('saisonnier : valeurs de départ', () => {
  const z = vm.createContext({}); vm.runInContext(bloc(idx, '// ---------- Location saisonnière', '// --- Loyer : carte officielle') + 'this.X = {nuitConseillee, chargesSaisonDefaut, saisonnier};', z);
  assert.equal(z.X.nuitConseillee(900), 100);
  assert.equal(z.X.chargesSaisonDefaut(40), 170);
  const r = z.X.saisonnier({nuit: 100, occupation: 60, sejour: 3, menage: 30, plateforme: 15, conciergerie: 5, charges: 100});
  proche(r.pctFrais, 20 + 10, 0.001);                          // 30 € de ménage pour 300 € de séjour = 10 %
  proche(r.netAn, 21900 * 0.7 - 1200, 0.01);
});
// ---------- Crédit et apport ----------
test('frais de notaire hors crédit : l\'apport doit au moins les couvrir (mise de départ relevée)', () => {
  const s = formulaire({prix: 200000, notaire: 8, apport: 5000, notaireCredit: false});
  assert.equal(s.apportEff, 16000); assert.match(s.notes.join(' '), /au moins 16\s000\s€ d'apport/);
  proche(s.pret, (200000 + 16000 + 1000 - 16000) / 0.985, 0.01);
});
test('travaux hors crédit : payés par l\'apport, seulement quand la section Travaux est ouverte', () => {
  const s = formulaire({prix: 150000, apport: 0, travaux: 30000, travauxCredit: false}, {projet: true});
  assert.equal(s.apportEff, 30000);
  assert.equal(formulaire({prix: 150000, apport: 0, travaux: 30000, travauxCredit: false}).apportEff, 0);   // section fermée : pas de travaux
});
test('apport plus grand que le coût : pas de prêt, mise de départ = coût du projet (sans frais bancaires)', () => {
  const s = formulaire({prix: 100000, notaire: 8, apport: 300000});
  assert.equal(s.pret, 0); assert.equal(s.fraisGarantie, 0);
  assert.equal(s.apportEff, 108000);                    // pas 300 000 € : le reste de l'apport n'est pas dépensé
  assert.equal(s.coutTotal, 108000);
  assert.ok(s.annees.every(a => a.credit === 0));
});
test('durée du crédit, différé et horizon : fin du crédit arrondie à l\'année, 5 ans de plus affichés', () => {
  const s = formulaire({duree: 20, differe: 6});
  assert.equal(s.finCredit, 21); assert.equal(s.horizon, 26); assert.equal(s.annees.length, 26);
  assert.equal(s.ech.rows.length, 246);
  assert.equal(s.annees[25].credit, 0);
});
test('différé partiel : intérêts seuls pendant le différé, puis mensualité pleine', () => {
  const s = formulaire({prix: 200000, apport: 0, differe: 12, typeDiff: 'partiel', assur: 0});
  const a1 = s.annees[0], a2 = s.annees[1];
  assert.equal(a1.capital, 0); proche(a1.interets, s.pret * 0.0339, 0.5);
  proche(a2.credit, 12 * s.ech.pmt, 0.01);
});
test('mensualité pendant le différé : intérêts + assurance (partiel), assurance seule (total), rien sans différé', () => {
  const s = formulaire({prix: 200000, apport: 0, differe: 36, typeDiff: 'partiel', assur: 0.3});
  proche(s.ech.mensDiff, s.pret * 0.0339 / 12 + s.ech.assM, 1e-6);
  proche(s.ech.mensDiff, s.ech.rows[0].i + s.ech.rows[0].ass, 1e-6);
  assert.ok(s.ech.mensDiff < s.ech.pmt + s.ech.assM);
  proche(formulaire({prix: 200000, apport: 0, differe: 12, typeDiff: 'total', assur: 0.3}).ech.mensDiff, s.ech.assM, 1e-6);
  assert.equal(formulaire({differe: 0}).ech.mensDiff, null);
});
test('cumul de trésorerie : départ = −mise de départ, puis somme des cash-flows', () => {
  const s = formulaire({apport: 25000});
  let c = -25000; s.annees.forEach(a => { c += a.cf; proche(a.cumul, c, 1e-6); });
});
test('charges : fixes + gestion et entretien en % des loyers ; CFE seulement en meublé', () => {
  const v = {loyer: 1000, vacance: 0, tf: 900, copro: 600, pno: 150, compta: 0, cfe: 300, gestion: 7, entretien: 3};
  proche(formulaire(v).annees[0].charges, 1650 + 12000 * 0.10);
  proche(formulaire({...v, meuble: '1'}).annees[0].charges, 1650 + 300 + 12000 * 0.10);
});
test('évolutions fermées : loyers, charges et prix constants même si des hausses sont saisies', () => {
  const s = formulaire({loyer: 1000, gLoyer: 3, gCharges: 3, gPrix: 3});
  assert.equal(s.annees[9].loyers, s.annees[0].loyers); assert.equal(s.valeur, s.base);
  const o = formulaire({loyer: 1000, gLoyer: 3, gCharges: 3, gPrix: 2}, {evol: true});
  proche(o.annees[9].loyers, o.annees[0].loyers * Math.pow(1.03, 9)); proche(o.valeur, o.base * Math.pow(1.02, o.horizon));
});

// ---------- Fiscalité ----------
test('impôts fermés : aucun impôt compté', () => {
  const s = formulaire({loyer: 2000, regime: 'reel'});
  assert.ok(s.annees.every(a => a.impots === 0)); assert.equal(s.regime, 'impôts non comptés');
});
test('micro-foncier : 70 % des loyers × (TMI + 17,2 %)', () => {
  const s = formulaire({loyer: 800, tmi: '30', regime: 'micro'}, {impots: true});
  proche(s.annees[1].impots, s.annees[1].loyers * 0.7 * (0.30 + 0.172));
});
test('LMNP micro-BIC : 50 % d\'abattement ; au-delà de 77 700 € de loyers, réel forcé', () => {
  const m = formulaire({loyer: 900, meuble: '1', regime: 'micro', tmi: '30'}, {impots: true});
  assert.match(m.regime, /micro-BIC/); proche(m.annees[1].impots, m.annees[1].loyers * 0.5 * (0.30 + 0.186));
  const gros = formulaire({prix: 1500000, loyer: 7000, meuble: '1', regime: 'micro'}, {impots: true});
  assert.match(gros.regime, /au réel/);
});
test('LMNP au réel : l\'amortissement efface l\'impôt les premières années, jamais d\'impôt négatif', () => {
  const s = formulaire({prix: 200000, loyer: 900, meuble: '1', mobilier: 5000, regime: 'reel', tmi: '30'}, {impots: true});
  assert.match(s.regime, /LMNP au réel/);
  assert.ok(s.annees.slice(0, 5).every(a => a.impots === 0));
  assert.ok(s.annees.every(a => a.impots >= 0));
});
test('SCI à l\'IR en meublé : passe à l\'IS (avec une note)', () => {
  const s = formulaire({struct: 'ir', meuble: '1'}, {impots: true});
  assert.equal(s.st, 'is'); assert.match(s.notes.join(' '), /passe d'office à l'IS/);
});
test('SCI à l\'IS : flat tax sur ce qui est distribué', () => {
  const garde = formulaire({prix: 100000, loyer: 2000, struct: 'is'}, {impots: true});
  const distrib = formulaire({prix: 100000, loyer: 2000, struct: 'is', distrib: true}, {impots: true});
  const a = garde.annees[10], b = distrib.annees[10];
  assert.ok(a.is > 0); assert.equal(a.pfu, 0);
  proche(b.pfu, b.benef * 0.314, 0.01); proche(b.impots, b.is + b.pfu + b.crl, 0.01);
});
test('SCI à l\'IR : revenus fonciers au réel (pas de micro-foncier en SCI)', () => {
  const s = formulaire({loyer: 700, struct: 'ir', regime: 'micro'}, {impots: true});
  assert.match(s.regime, /SCI à l'IR, revenus fonciers au réel/);
});

// ---------- Revente ----------
const revente = (v, ouverts = {}) => { formulaire({prix: 150000, travaux: 30000, dureeTravaux: 6, valeurApres: 240000, scenario: 'revendre', fraisRevente: 5, ...v}, {projet: true, ...ouverts}); return bilanRevente(simuler()); };
test('revente : impôt sur la plus-value (36,2 %) en nom propre, rien si moins-value', () => {
  const b = revente({moisRevente: 12, notaire: 8}, {impots: true});
  const pv = 240000 * 0.95 - (150000 + 12000 + 30000);
  proche(b.impot, pv * 0.362 + 0, 0.5);
  const perte = revente({moisRevente: 12, valeurApres: 150000}, {impots: true});
  assert.equal(perte.impot, 0); assert.match(perte.detail, /pas de plus-value/);
});
test('revente après plus de 5 ans : abattements pour durée de détention', () => {
  const court = revente({moisRevente: 60}, {impots: true}), long = revente({moisRevente: 120}, {impots: true});
  const pv = 240000 * 0.95 - (150000 + 12000 + 30000);
  proche(court.impot, pv * 0.362, 0.5);
  for (const n of [0, 5, 6, 12, 21, 22, 23, 29, 30, 40]) { proche(abatIR(n), patAbat.abatIR(n), 1e-12); proche(abatPS(n), patAbat.abatPS(n), 1e-12); }                                         // 5 ans : aucun abattement
  proche(long.impot, pv * (0.19 * (1 - 0.30) + 0.172 * (1 - 0.0825)), 0.5);    // 10 ans : 30 % (impôt), 8,25 % (prélèvements)
});
test('revente : intérêts et capital sur la durée de l\'opération ; IRA plafonnées', () => {
  const b = revente({moisRevente: 18, differe: 6});
  proche(b.ira, Math.min(0.03 * b.crd, 6 * b.crd * 0.0339 / 12), 0.01);
  assert.ok(b.crd > 0 && b.n === 18);
  proche(b.encaisse, b.prixVente - b.fraisVente - b.crd - b.ira, 1e-6);
});
test('revente en SCI à l\'IS : IS sur la marge, flat tax si distribuée', () => {
  const b = revente({moisRevente: 12, struct: 'is', distrib: true}, {impots: true});
  const r = Math.max(0, b.margeBrute), is = 0.15 * Math.min(r, 42500) + 0.25 * Math.max(0, r - 42500);
  proche(b.impot, is + (r - is) * 0.314, 0.01);
});

// ---------- Prix d'équilibre et années de référence ----------
test('prix d\'équilibre : impossible quand les charges dépassent le loyer ; sans limite quand le loyer est énorme', () => {
  formulaire({loyer: 50, tf: 3000});
  assert.equal(prixCible(0).impossible, true);
  formulaire({prix: 100000, loyer: 20000});
  assert.equal(prixCible(0).sansLimite, true);
});
test('prix d\'équilibre en revente : le bénéfice net visé est atteint au prix trouvé', () => {
  formulaire({prix: 150000, travaux: 30000, dureeTravaux: 6, valeurApres: 260000, scenario: 'revendre', moisRevente: 12}, {projet: true});
  const r = prixCible(10000);
  assert.ok(!r.impossible && !r.sansLimite);
  assert.ok(metrique(r.prix) >= 10000 && metrique(r.prix + 1000) < 10000);
});
test('année de croisière : après le différé et au moins en année 2', () => {
  const {anneeCroisiere} = ctx.X;
  assert.equal(anneeCroisiere(formulaire({differe: 24})).y, 3);
  assert.equal(anneeCroisiere(formulaire({})).y, 2);
  assert.equal(anneeRef(formulaire({})).y, 1);
});

// ---------- Deux biens, un seul crédit ----------
test('deux biens, un seul crédit : prix, notaire et prêt sur le total, loyers et charges additionnés', () => {
  const seul = formulaire({prix: 250000, loyer: 1200, notaire: 8, apport: 0, tf: 800, copro: 0});
  const deux = formulaire({prix: 150000, loyer: 700, prixB2: 100000, loyerB2: 500, tfB2: 0, coproB2: 0, notaire: 8, apport: 0, tf: 800, copro: 0}, {bien2: true});
  proche(deux.pret, seul.pret); proche(deux.ech.pmt, seul.ech.pmt);
  assert.equal(deux.p.prix, 250000); assert.equal(deux.p.prix1, 150000); assert.equal(deux.p.loyerTotal, 1200);
  proche(deux.annees[0].loyers, seul.annees[0].loyers); proche(deux.annees[0].charges, seul.annees[0].charges);
  assert.equal(deux.base, 250000);
  const tf = formulaire({prix: 150000, loyer: 700, prixB2: 100000, loyerB2: 500, tfB2: 400, coproB2: 200, tf: 800, copro: 0}, {bien2: true});
  proche(tf.annees[0].charges - deux.annees[0].charges, 600);
});
test('deux biens : section fermée, le 2e bien n\'est pas compté', () => {
  const s = formulaire({prix: 150000, loyer: 700, prixB2: 100000, loyerB2: 500});
  assert.equal(s.p.prix, 150000); assert.equal(s.p.loyerTotal, 700); assert.equal(s.p.deuxBiens, false);
});
test('deux biens : le prix d\'équilibre cherché est celui du 1er bien, le 2e reste fixe', () => {
  formulaire({prix: 150000, loyer: 700, prixB2: 100000, loyerB2: 500, apport: 0}, {bien2: true});
  const r = prixCible(0);
  assert.ok(r.prix > 0);
  proche(metrique(r.prix), 0, 15);
  assert.equal(simuler().p.prix, r.prix + 100000);
});

// ---------- Deux projets de Mes projets, un seul crédit ----------
test('deux projets regroupés : le 2e devient le 2e bien, apports additionnés, comme deux biens saisis à la main', () => {
  const a = {...DEFAUTS, prix: 150000, loyer: 700, tf: 800, copro: 0, apport: 10000, duree: 25, taux: 3.5, ouverts: {impots: true}, surf: 70, mobilier: 3500, pno: 78, compta: 0, cfe: 0};
  const b = {...DEFAUTS, prix: 100000, loyer: 450, loyer2: 50, tf: 400, copro: 200, apport: 5000, duree: 15, ouverts: {projet: true}, travaux: 20000, surf: 30, mobilier: 2000, pno: 60, compta: 400, cfe: 300};
  const {finance: v, travauxB} = financeRegroupee(a, b);
  assert.deepEqual([v.prix, v.prixB2, v.loyerB2, v.apport, v.duree, v.taux], [150000, 100000, 500, 15000, 25, 3.5]);
  // Réglages détaillés pour les deux biens : surface, mobilier, charges additionnées ; comptable et CFE une fois
  assert.deepEqual([v.surf, v.mobilier, v.tf, v.copro, v.pno, v.tfB2, v.coproB2, v.compta, v.cfe], [100, 5500, 1200, 200, 138, 0, 0, 400, 300]);
  assert.deepEqual(v.ouverts, {impots: true, bien2: true});
  assert.equal(travauxB, 20000);
  const s = formulaire({...v, ouverts: undefined}, {bien2: true});
  assert.equal(s.p.prix, 250000); assert.equal(s.p.loyerTotal, 1200);
  // Un projet qui finançait déjà deux biens : ses deux biens passent dans le 2e bien
  const c = financeRegroupee(a, {...b, ouverts: {bien2: true}, prixB2: 80000, loyerB2: 300, tfB2: 100, coproB2: 0});
  assert.deepEqual([c.finance.prixB2, c.finance.loyerB2, c.finance.tf, c.travauxB], [180000, 800, 1300, 0]);
  // Section fermée dans le 1er : son 2e bien (valeurs restées dans le formulaire) n'est pas compté
  assert.equal(financeRegroupee({...a, prixB2: 99999}, b).finance.prixB2, 100000);
});
