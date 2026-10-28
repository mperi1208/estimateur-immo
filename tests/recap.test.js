// Récap pour la banque : les deux pages faites à partir des chiffres d'un projet
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({esc: v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')});
vm.runInContext(bloc(idx, '// ---------- Récap pour la banque', '// ---------- fin du récap') + 'this.recapHtml = recapHtml;', ctx);
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/[  ]/g, ' ').trim();

const LOUER = {revente: false, saison: false, meuble: true, avecImpots: false, regime: 'impôts non comptés', struct: 'En nom propre',
  biens: [{nom: '', type: 'maison', surf: 90, prix: 200000, loyer: 1300}],
  achat: {prix: 200000, notaire: 16000, travaux: 40000, mobilier: 5000, frais: 3000, cout: 264000, apport: 20000, pret: 244000},
  credit: {pret: 244000, taux: 3.4, duree: 25, assur: 0.3, differe: 12, typeDiff: 'partiel', mens: 1260, mensDiff: 750, mensAvant: null, debloc: null, cout: 130000},
  travaux: {montant: 40000, debut: 0, fin: 6, valeurApres: 290000, loyerAvant: 0, finAvant: 0, debutLoc: 6},
  hyp: {vacance: 0.5, occupation: null, gLoyer: 0, gPrix: 0, gCharges: 0},
  periodes: [{titre: 'Pendant les travaux', sous: 'mois 1 à 6 · différé', loyers: 0, credit: 750, charges: 120, impots: 0, reste: -870},
    {titre: 'Pendant le différé', sous: 'mois 7 à 12', loyers: 1250, credit: 750, charges: 200, impots: 0, reste: 300}],
  croisiere: {des: 13, loyers: 1250, credit: 1260, charges: 200, impots: 0, reste: -210},
  charges: [['Taxe foncière', 100], ['Gestion 7 %', 87.5]], loyersPleins: 1300, totalDiffere: -3420,
  valeur: {depart: 290000, coutBien: 259000}, patrimoine: {ans: 30, valeur: 290000, net: 250000},
  annee: {y: 2, loyers: 15000, charges: 2400, interets: 8000, capital: 6500, assurance: 600, credit: 15100, impots: null, cf: -2500, chargesDetail: [['Taxe foncière', 1200], ['Gestion 7 %', 1200]]},
  sensibilite: [['Loyers 10 % plus bas', -330], ['Un mois de vacance de plus par an', -310], ['Taux 1 point plus haut', -350]]};

test('page 1 : objet de la demande, chiffres clés, le bien, le prêt sollicité, plan de financement équilibré', () => {
  const t = texte(ctx.recapHtml(LOUER, {titre: 'San Gaetano', adresse: '1 rue X 69002 Lyon', date: '28 octobre 2026', estime: {prix: 210000, loyer: 1250}}));
  assert.match(t, /Dossier de financement · investissement locatif 28 octobre 2026 · 1\/2 San Gaetano 1 rue X 69002 Lyon/);
  assert.match(t, /Financement de l'acquisition d'une maison de 90 m² à Lyon, avec 40 000 € de travaux, destinée à la location meublée\./);
  assert.match(t, /Coût total de l'opération 264 000 € Apport personnel 20 000 € 7,6 % du coût total Prêt sollicité 244 000 € 25 ans à 3,4 % Échéance mensuelle 1 260 € 750 € pendant le différé/);
  assert.match(t, /Prix d'acquisition 200 000 € soit 2 222 €\/m² Estimation de marché 210 000 €/);
  assert.match(t, /Loyer de marché estimé 1 250 €/);
  assert.match(t, /Différé 12 mois, partiel \(intérêts et assurance\), couvrant la phase de travaux/);
  assert.match(t, /Coût total de l'opération 264 000 € 100,0 %/);
  assert.match(t, /Ressources Apport personnel 20 000 € 7,6 % Prêt sollicité 244 000 € 92,4 % Total 264 000 € 100,0 %/);
  assert.doesNotMatch(t, /banques|Patrimoine dans|il te/i);   // on parle à un banquier, pas de lui
});

test('page 2 : compte d\'exploitation annuel et mensuel, ratios, démarrage, sensibilité', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'P'}), t = texte(h);
  assert.equal((h.match(/class="rc-page"/g) || []).length, 2);
  assert.match(t, /Rendement brut 5,9 % .* Rendement net de charges 4,8 % .* Couverture de l'échéance 99,3 % .* Trésorerie mensuelle −208 €/);
  assert.match(t, /Loyers bruts \+15 600 € \+1 300 € Vacance locative −600 € −50 € Loyers encaissés \+15 000 € \+1 250 €/);
  assert.match(t, /Échéances du prêt −15 100 € −1 258 € Trésorerie avant impôts −2 500 € −208 €/);
  assert.match(t, /Phase de démarrage .* Solde mensuel −870 € \+300 € −210 €/);
  assert.match(t, /Sur les 12 mois de différé : −3 420 € au total/);
  assert.match(t, /Scénario retenu −208 € Loyers 10 % plus bas −330 € −122 €/);
  assert.match(t, /Hypothèses : vacance locative de 0,5 mois par an ; loyers et charges constants ; montants avant impôts/);
});

test('revente : bilan prévisionnel de l\'opération en page 2', () => {
  const d = {...LOUER, revente: true, vente: {mois: 18, prixVente: 320000, fraisVente: 10000, crd: 240000, ira: 3000, sorties: 27000, impot: 0, net: 20000, coutAchat: 264000}};
  const t = texte(ctx.recapHtml(d, {titre: 'P'}));
  assert.match(t, /Bilan prévisionnel de l'opération Marge nette \+20 000 € avant impôt Prix de revente 320 000 € au mois 18 Portage mensuel 1 500 €/);
  assert.match(t, /en vue de sa revente/);
  assert.doesNotMatch(t, /Compte d'exploitation/);
});
