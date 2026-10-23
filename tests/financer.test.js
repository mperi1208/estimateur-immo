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
  'this.X = {FIELDS, DEFAUTS, set, simuler, bilanRevente, surtaxe, prixCible, metrique, anneeRef, anneeCroisiere};',
].join('\n'), ctx);
const {FIELDS, DEFAUTS, set, simuler, bilanRevente, surtaxe, prixCible, metrique, anneeRef} = ctx.X;
// Surtaxe de Mon patrimoine, pour vérifier que les deux onglets calculent pareil
const pat = vm.createContext({}); vm.runInContext(bloc(inv, 'function surtaxePV', 'const anneesEntre') + 'this.surtaxePV = surtaxePV;', pat);

// Formulaire : valeurs par défaut de l'appli, sections fermées, puis réglages du test
function formulaire(v = {}, ouverts = {}) {
  for (const k of FIELDS) els[k] = CASES.includes(k) ? {type: 'checkbox', checked: false} : {type: 'number', value: ''};
  for (const k of ['struct', 'meuble', 'regime', 'tmi', 'type', 'neuf', 'vieux', 'typeDiff', 'scenario', 'sciExist', 'locMode', 'classe']) els[k].type = 'select-one';
  for (const b of ['boxProjet', 'boxImpots', 'boxEvol']) els[b] = {open: false};
  const tout = {...DEFAUTS, taux: 3.39, tf: 800, copro: 0, compta: 0, vacance: 0, entretien: 0, pno: 0, ...v};
  for (const k of FIELDS) if (tout[k] != null) set(k, tout[k]);
  for (const [k, o] of Object.entries(ouverts)) els[{projet: 'boxProjet', impots: 'boxImpots', evol: 'boxEvol'}[k]].open = o;
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
