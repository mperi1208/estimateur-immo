// Récap pour la banque : les deux pages faites à partir des chiffres d'un projet
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({esc: v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')});
vm.runInContext(bloc(idx, '// ---------- Récap pour la banque', '// ---------- fin du récap') + 'this.recapHtml = recapHtml;', ctx);
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/[  ]/g, ' ').trim();

const LOUER = {revente: false, saison: false, meuble: true, avecImpots: false, regime: 'impôts non comptés', struct: 'En nom propre',
  biens: [{nom: 'Maison', type: 'maison', surf: 90, prix: 200000, loyer: 1300}],
  achat: {prix: 200000, notaire: 16000, travaux: 40000, mobilier: 5000, frais: 3000, cout: 264000, apport: 20000, pret: 244000},
  credit: {pret: 244000, taux: 3.4, duree: 25, assur: 0.3, differe: 12, typeDiff: 'partiel', mens: 1260, mensDiff: 750, mensAvant: null, debloc: null, cout: 130000},
  travaux: {montant: 40000, debut: 0, fin: 6, valeurApres: 290000, loyerAvant: 0, finAvant: 0, debutLoc: 6},
  hyp: {vacance: 0.5, occupation: null, gLoyer: 0, gPrix: 0, gCharges: 0},
  periodes: [{titre: 'Pendant les travaux', sous: 'mois 1 à 6 · différé', loyers: 0, credit: 750, charges: 120, impots: 0, reste: -870},
    {titre: 'Pendant le différé', sous: 'mois 7 à 12', loyers: 1250, credit: 750, charges: 200, impots: 0, reste: 300}],
  croisiere: {des: 13, loyers: 1250, credit: 1260, charges: 200, impots: 0, reste: -210},
  charges: [['Taxe foncière', 100], ['Gestion 7 %', 87.5]], loyersPleins: 1300, totalDiffere: -3420,
  valeur: {depart: 290000, coutBien: 259000}, patrimoine: {ans: 30, valeur: 290000, net: 250000}};

test('page 1 : chiffres clés, plan de financement équilibré, crédit avec différé, calendrier', () => {
  const t = texte(ctx.recapHtml(LOUER, {titre: 'San Gaetano', option: 'Garage', adresse: '1 rue X, Lyon', date: '28 octobre 2026'}));
  assert.match(t, /Dossier de financement · 28 octobre 2026 San Gaetano · Garage 1 rue X, Lyon 1 \/ 2/);
  assert.match(t, /Coût total du projet 264 000 € Apport 20 000 € Montant emprunté 244 000 € sur 25 ans à 3,4 % Mensualité 1 260 € 750 € pendant le différé/);
  assert.match(t, /Maison 90 m² 200 000 € 1 300 €/);
  assert.match(t, /Besoins Prix d'achat 200 000 € Frais de notaire 16 000 € Travaux 40 000 € Mobilier 5 000 € Frais de dossier et garantie 3 000 € Total 264 000 €/);
  assert.match(t, /Ressources Apport personnel 20 000 € Prêt bancaire 244 000 € Total 264 000 €/);
  assert.match(t, /Durée 25 ans, dont 12 mois de différé partiel/);
  assert.match(t, /Mensualité pendant le différé 750 € intérêts et assurance Mensualité dès le mois 13 1 260 €/);
  assert.match(t, /Mois 1 : achat et début des travaux Mois 6 : fin des travaux, loyers à partir du mois 7 Mois 13 : fin du différé/);
});

test('page 2 : périodes, ce que la banque regarde (70 % des loyers), valeur créée', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'P'}), t = texte(h);
  assert.equal((h.match(/class="rc-page"/g) || []).length, 2);
  assert.match(t, /Reste par mois, dès le mois 13 −210 €/);
  assert.match(t, /Les loyers paient 99 % de la mensualité/);
  assert.match(t, /Pendant les 12 mois de différé −3 420 € en tout, soit −285 € par mois/);
  assert.match(t, /Par mois Pendant les travaux mois 1 à 6 · différé Pendant le différé mois 7 à 12 Ensuite dès le mois 13/);
  assert.match(t, /Reste −870 € \+300 € −210 €/);
  assert.match(t, /Dont 70 % \(part souvent retenue par les banques\) 910 € Mensualité pleine du crédit 1 260 € Reste à couvrir par les revenus 350 € par mois/);
  assert.match(t, /Valeur après travaux 290 000 € Plus-value dès le départ \+31 000 € Patrimoine dans 30 ans 250 000 €/);
  assert.match(t, /Hypothèses : 0,5 mois sans locataire par an, loyers et prix sans hausse, avant impôts/);
  assert.doesNotMatch(t, /options étudiées/);
});

test('plusieurs options : tableau avec celle détaillée mise en avant', () => {
  const r = {scenario: 'louer', prix: 200000, travaux: 0, apport: 20000, mensualite: 1100, cfMois: 50, totalDiffere: null};
  const h = ctx.recapHtml(LOUER, {titre: 'P', options: [{nom: 'Division', r, courante: false}, {nom: 'Garage', r: {...r, cfMois: -210, travaux: 40000}, courante: true}]});
  const t = texte(h);
  assert.match(t, /Les 2 options étudiées Division Garage détaillée ici Prix 200 000 € 200 000 € Travaux — 40 000 €/);
  assert.match(t, /Reste par mois \+50 € −210 €/);
  assert.match(h, /<th class="rc-cour">Garage/);
});

test('revente : bilan de l\'opération en page 2', () => {
  const d = {...LOUER, revente: true, vente: {mois: 18, prixVente: 320000, fraisVente: 10000, crd: 240000, ira: 3000, sorties: 27000, impot: 0, net: 20000, coutAchat: 264000}};
  const t = texte(ctx.recapHtml(d, {titre: 'P'}));
  assert.match(t, /Le bilan de l'opération Bénéfice net \+20 000 € avant impôt Prix de revente 320 000 € au bout de 18 mois Effort par mois 1 500 €/);
  assert.match(t, /Mois 18 : revente/);
  assert.doesNotMatch(t, /Ce que regarde la banque/);
});
