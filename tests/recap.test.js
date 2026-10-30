// Récap pour la banque : les deux pages faites à partir des chiffres d'un projet
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({esc: v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')});
vm.runInContext(bloc(idx, '// ---------- Récap pour la banque', '// ---------- fin du récap') + 'this.recapHtml = recapHtml; this.comparaisonHtml = comparaisonHtml;', ctx);
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

test('page 1 : le projet et ce qu\'il rapporte (chiffres clés, le bien, la frise, le mois type) ; pas encore le prêt', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'San Gaetano', adresse: '1 rue X 69002 Lyon', date: '28 octobre 2026', estime: {prix: 210000, loyer: 1250}});
  const p1 = texte(h.split('<section')[1]);
  assert.match(p1, /Dossier de financement · investissement locatif 28 octobre 2026 · 1\/2 San Gaetano 1 rue X 69002 Lyon Le projet et ce qu'il rapporte/);
  assert.match(p1, /Financement de l'acquisition d'une maison de 90 m² à Lyon, avec 40 000 € de travaux, destinée à la location meublée\./);
  assert.match(p1, /Prix d'acquisition 200 000 € Travaux 40 000 € valeur après travaux 290 000 € Loyers par mois 1 300 € hors charges Trésorerie mensuelle −208 € une fois le projet en place/);
  assert.match(p1, /Le bien Maison · 90 m² · 2 222 €\/m² Prix d'acquisition 200 000 € Estimation de marché 210 000 € Valeur après travaux 290 000 € Valeur après travaux : \+31 000 €/);
  assert.match(p1, /Loyer prévu 1 300 €\/mois marché 1 250 € Exploitation Location meublée En nom propre Travaux 40 000 € mois 1 à 6/);
  // Frise sur 2 ans : travaux mois 1 à 6, location ensuite, différé 12 mois ; fin des travaux et échéance pleine en jalons
  assert.match(h, /class="f-trav" style="left:0\.00%;width:25\.00%">Travaux/);
  assert.match(h, /class="f-loc" style="left:25\.00%;width:75\.00%">Location/);
  assert.match(p1, /Différé · 750 €\/mois Échéance 1 260 €\/mois Acquisition Fin des travaux · mois 6 Échéance pleine · mois 13/);
  assert.match(p1, /Ce qu'il rapporte chaque mois Trésorerie mensuelle, une fois le projet en place −208 € année 2, avant impôts Loyers encaissés 1 250 € Sorties 1 458 € Échéance du prêt 1 258 € Charges 200 €/);
  assert.doesNotMatch(p1, /Prêt sollicité|Coût total de l'opération/);   // ce qui est demandé : à la fin
  assert.doesNotMatch(texte(h), /banques|Patrimoine dans|il te/i);   // on parle à un banquier, pas de lui
});

test('page 2 : périodes, indicateurs, résistance, puis le coût, le financement et le prêt sollicité', () => {
  const h = ctx.recapHtml(LOUER, {titre: 'P'}), t = texte(h), p2 = texte(h.split('<section')[2]);
  assert.equal((h.match(/class="rc-page/g) || []).length, 2);
  assert.match(p2, /Les résultats et le financement demandé Mois par mois/);
  assert.match(p2, /Pendant les travaux mois 1 à 6 · différé −870 € \/mois .* Pendant le différé mois 7 à 12 \+300 € \/mois .* Ensuite dès le mois 13 −210 € \/mois/);
  assert.match(h, /class="rc-neg">−870/);
  assert.match(p2, /solde cumulé de −3 420 € ?, couvert par l'épargne personnelle/);
  assert.match(p2, /Rendement brut 5,9 % .* Rendement net de charges 4,8 % .* Couverture de l'échéance 99,3 %/);
  assert.match(h, /<i class="rouge" style="width:62\.09%"><\/i><u/);   // couverture sous 100 % : en rouge, repère à 100 %
  assert.match(p2, /Scénario retenu −208 € Loyers 10 % plus bas −330 € Un mois de vacance de plus par an −310 € Taux 1 point plus haut −350 €/);
  assert.match(p2, /Le coût et son financement Coût total de l'opération 264 000 € Prix d'acquisition 200 000 € 75,8 % .* Financement 264 000 € Apport personnel 20 000 € 7,6 % Prêt sollicité 244 000 € 92,4 %/);
  assert.match(p2, /Le prêt sollicité Montant 244 000 € Durée 25 ans dont 12 mois de différé partiel Taux nominal 3,4 % assurance 0,3 %\/an Échéance 1 260 € 750 € pendant le différé Coût total du crédit : 130 000 €/);
  assert.match(p2, /Hypothèses : vacance locative de 0,5 mois par an ; loyers et charges constants ; montants avant impôts\.[^.]*\.$/);
  assert.ok(p2.indexOf('Résistance') < p2.indexOf('Le prêt sollicité'), 'le prêt à la fin');
  void t;
});

test('revente : bilan prévisionnel de l\'opération en page 2', () => {
  const d = {...LOUER, revente: true, vente: {mois: 18, prixVente: 320000, fraisVente: 10000, crd: 240000, ira: 3000, sorties: 27000, impot: 0, net: 20000, coutAchat: 264000}};
  const t = texte(ctx.recapHtml(d, {titre: 'P'}));
  assert.match(t, /Le bilan prévisionnel de l'opération Marge nette \+20 000 € avant impôt, au mois 18 Prix de revente 320 000 € Coût total de l'opération 264 000 €/);
  assert.match(t, /Prix de revente 320 000 € au mois 18 Marge nette \+20 000 €/);
  assert.match(t, /en vue de sa revente/);
  assert.match(t, /Revente · mois 18/);
  assert.doesNotMatch(t, /Ce qu'il rapporte chaque mois/);
});

test('frise : jalons proches (début et fin des travaux, échéance pleine) chacun sur sa ligne, sans se chevaucher', () => {
  const d = {...LOUER, credit: {...LOUER.credit, differe: 36}, travaux: {...LOUER.travaux, debut: 24, fin: 28, debutLoc: 28, finAvant: 24, loyerAvant: 900}};
  const h = ctx.recapHtml(d, {titre: 'P'});
  const j = [...h.matchAll(/<span style="left:([\d.]+)%;top:(\d+)px"( class="droite")?>([^<]+)<\/span>/g)].map(m => ({x: +m[1], top: +m[2], droite: !!m[3], l: m[4]}));
  assert.deepEqual(j.map(x => x.l), ['Acquisition', 'Début des travaux · mois 25', 'Fin des travaux · mois 28', 'Échéance pleine · mois 37']);
  // Deux jalons sur la même ligne ont des textes qui ne se touchent pas
  const zone = x => { const long = x.l.length * 0.8 + 2; return x.droite ? [x.x - long, x.x] : [x.x, x.x + long]; };
  for (const a of j) for (const b of j) if (a !== b && a.top === b.top) { const [p, q] = zone(a), [r, s] = zone(b); assert.ok(q <= r || s <= p, `${a.l} / ${b.l}`); }
  assert.ok(new Set(j.map(x => x.top)).size >= 2, 'les jalons proches passent sur une autre ligne');
});

// Plusieurs options : une page qui les compare, la meilleure mise en avant, puis son détail
const option = (lettre, nom, cf, autre = {}) => ({lettre, nom, d: {...LOUER, annee: {...LOUER.annee, cf: cf * 12}, ...autre}});
const OPTIONS = [option('A', 'Garage', 117, {achat: {...LOUER.achat, travaux: 30000, cout: 254000}}), option('B', 'Division', 80),
  option('C', 'Aucun travaux', -187, {travaux: null, totalDiffere: 2000}), option('D', 'Division + garage', 177)];

test('comparaison : une page, les options côte à côte, la meilleure trésorerie retenue et l\'écart avec la suivante', () => {
  const h = ctx.comparaisonHtml(OPTIONS, {titre: 'San Gaetano', adresse: 'Route de San Gaetano 20600 Bastia', date: '30 octobre 2026', total: 3}), t = texte(h);
  assert.equal((h.match(/class="rc-page/g) || []).length, 1);
  assert.match(t, /Dossier de financement · investissement locatif 30 octobre 2026 · 1\/3 San Gaetano Route de San Gaetano 20600 Bastia Les options étudiées/);
  assert.match(t, /4 façons de réaliser le projet ont été étudiées\. L'option retenue, D · Division \+ garage , dégage la meilleure trésorerie mensuelle une fois le projet en place, \+177 € par mois, soit 60 € de plus que l'option A\./);
  assert.match(t, /Trésorerie mensuelle, une fois le projet en place A Garage travaux 40 000 € · loyers 1 300 €\/mois \+117 € B Division .* \+80 € C Aucun travaux sans travaux .* −187 € D Division \+ garage Retenue .* \+177 €/);
  assert.equal((h.match(/rc-cl( cal)? best/g) || []).length, 5, 'la retenue en gras dans chaque section');
  assert.match(h, /<i class="rouge neg" style="width:50\.00%">/);   // la pire à pleine largeur, à gauche de zéro
  assert.match(t, /Le calendrier A Garage travaux mois 1–6 · différé 12 mois .* C Aucun travaux sans travaux · différé 12 mois/);
  assert.match(t, /Le coût et le prêt A Garage prêt 244 000 € · échéance 1 260 € 254 000 €/);
  assert.match(t, /Pendant le différé, solde cumulé .* C Aucun travaux \+2 000 €/);
  assert.match(t, /Couverture de l'échéance A Garage 99 %/);
  // Toutes positives : les barres partent de zéro, à gauche, sur toute la largeur
  const pos = ctx.comparaisonHtml(OPTIONS.filter(x => x.lettre !== 'C'), {});
  assert.match(pos, /class="rc-axe pos"><i class="vert" style="width:100\.00%">/);
  assert.doesNotMatch(t, /il te|banques/i);
});

test('comparaison : toutes revendues, la meilleure marge ; recapHtml numérote ses pages après la comparaison', () => {
  const rev = (lettre, nom, net) => ({lettre, nom, d: {...LOUER, revente: true, vente: {mois: 18, prixVente: 320000, fraisVente: 1, crd: 1, ira: 0, sorties: 1, impot: 0, net, coutAchat: 1}}});
  const t = texte(ctx.comparaisonHtml([rev('A', 'Vite', 20000), rev('B', 'Lent', 35000)], {titre: 'P'}));
  assert.match(t, /L'option retenue, B · Lent , dégage la meilleure marge à la revente, \+35 000 € ?, soit 15 000 € de plus que l'option A/);
  assert.match(t, /Marge nette à la revente A Vite travaux 40 000 € · revente au mois 18 \+20 000 €/);
  assert.doesNotMatch(t, /Couverture|Pendant le différé/);
  const d = texte(ctx.recapHtml(LOUER, {titre: 'P', adresse: 'X', total: 3, decale: 1, retenue: 'D · Division + garage'}));
  assert.match(d, /· 2\/3 P X · Option retenue : D · Division \+ garage Le projet/);
  assert.match(d, /· 3\/3 P/);
});
