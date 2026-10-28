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

test('page 1 : objet, chiffres clés, frise (travaux, location, différé, jalons), coût et financement en barres, le bien, le prêt', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'San Gaetano', adresse: '1 rue X 69002 Lyon', date: '28 octobre 2026', estime: {prix: 210000, loyer: 1250}}), t = texte(h);
  assert.match(t, /Dossier de financement · investissement locatif 28 octobre 2026 · 1\/2 San Gaetano 1 rue X 69002 Lyon/);
  assert.match(t, /Financement de l'acquisition d'une maison de 90 m² à Lyon, avec 40 000 € de travaux, destinée à la location meublée\./);
  assert.match(t, /Coût total 264 000 € Apport 20 000 € 7,6 % du coût Prêt sollicité 244 000 € 25 ans à 3,4 % Échéance 1 260 €/);
  // Frise sur 2 ans : travaux mois 1 à 6, location ensuite, différé 12 mois ; fin des travaux et échéance pleine en jalons
  assert.match(h, /class="f-trav" style="left:0\.00%;width:25\.00%">Travaux/);
  assert.match(h, /class="f-loc" style="left:25\.00%;width:75\.00%">Location/);
  assert.match(t, /Différé · 750 €\/mois Échéance 1 260 €\/mois Acquisition Fin des travaux · mois 6 Échéance pleine · mois 13/);
  assert.match(t, /Coût total de l'opération 264 000 € Prix d'acquisition 200 000 € 75,8 % Notaire 16 000 € .* Financement 264 000 € Apport personnel 20 000 € 7,6 % Prêt sollicité 244 000 € 92,4 %/);
  assert.match(t, /Maison · 90 m² · 2 222 €\/m² Prix d'acquisition 200 000 € Estimation de marché 210 000 € Valeur après travaux 290 000 €/);
  assert.match(t, /Valeur après travaux : \+31 000 €/);
  assert.match(t, /Loyer prévu 1 300 €\/mois marché 1 250 €/);
  assert.match(t, /Montant 244 000 € Durée 25 ans dont 12 mois de différé partiel Taux nominal 3,4 % assurance 0,3 %\/an Échéance 1 260 € 750 € pendant le différé/);
  assert.doesNotMatch(t, /banques|Patrimoine dans|il te/i);   // on parle à un banquier, pas de lui
});

test('page 2 : mois type en barres, périodes, indicateurs en jauges, résistance autour de zéro', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'P'}), t = texte(h);
  assert.equal((h.match(/class="rc-page"/g) || []).length, 2);
  assert.match(t, /Trésorerie mensuelle, une fois le projet en place −208 € année 2, avant impôts Loyers encaissés 1 250 € Sorties 1 458 € Échéance du prêt 1 258 € Charges 200 €/);
  assert.match(t, /Pendant les travaux mois 1 à 6 · différé −870 € \/mois .* Pendant le différé mois 7 à 12 \+300 € \/mois .* Ensuite dès le mois 13 −210 € \/mois/);
  assert.match(h, /class="rc-neg">−870/);
  assert.match(t, /solde cumulé de −3 420 € ?, couvert par l'épargne personnelle/);
  assert.match(t, /Rendement brut 5,9 % .* Rendement net de charges 4,8 % .* Couverture de l'échéance 99,3 %/);
  assert.match(h, /<i class="rouge" style="width:62\.09%"><\/i><u/);   // couverture sous 100 % : en rouge, repère à 100 %
  assert.match(t, /Scénario retenu −208 € Loyers 10 % plus bas −330 € Un mois de vacance de plus par an −310 € Taux 1 point plus haut −350 €/);
  assert.match(t, /Hypothèses : vacance locative de 0,5 mois par an ; loyers et charges constants ; montants avant impôts/);
});

test('revente : bilan prévisionnel de l\'opération en page 2', () => {
  const d = {...LOUER, revente: true, vente: {mois: 18, prixVente: 320000, fraisVente: 10000, crd: 240000, ira: 3000, sorties: 27000, impot: 0, net: 20000, coutAchat: 264000}};
  const t = texte(ctx.recapHtml(d, {titre: 'P'}));
  assert.match(t, /Le bilan prévisionnel de l'opération Marge nette \+20 000 € avant impôt, au mois 18 Prix de revente 320 000 € Coût total de l'opération 264 000 €/);
  assert.match(t, /en vue de sa revente/);
  assert.match(t, /Revente · mois 18/);
  assert.doesNotMatch(t, /Un mois type/);
});
