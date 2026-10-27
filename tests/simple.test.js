// Mode simple : bilan du mois (loyer − crédit − charges = ce qu'il reste) et phrase en langage courant
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({localStorage: {getItem: () => 'simple'}});
vm.runInContext(bloc(idx, '// ---------- Mode simple', '// ---------- fin du mode simple') + 'this.X = {bilanSimple, phraseSimple, modeSimple, detailVacance};', ctx);
const {bilanSimple, phraseSimple, modeSimple, detailVacance} = ctx.X;
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('le mode est lu sur l\'appareil', () => assert.equal(modeSimple(), true));

test('bilan : loyer − crédit − charges = ce qu\'il reste, avec le signe de chaque ligne', () => {
  const t = texte(bilanSimple({loyer: 800, credit: 666, charges: 75}));
  assert.match(t, /Loyer \+ 800 €/); assert.match(t, /Mensualité du crédit − 666 €/); assert.match(t, /Charges \(taxe foncière, copro…\) − 75 €/);
  assert.match(t, /Il te reste 59 € par mois/);
  assert.match(t, /Le loyer paie 120 % de la mensualité, et aussi les charges\./);
  assert.equal(t.match(/59 €/g).length, 1, 'le montant en gros n\'est pas répété dans la phrase');
  assert.doesNotMatch(t, /Impôts/);
});

test('bilan : perte, impôts comptés, et économie d\'impôt', () => {
  let t = texte(bilanSimple({loyer: 767, credit: 1320, charges: 136, impots: 0}));
  assert.match(t, /Il te manque 689 € par mois/); assert.match(t, /Le loyer paie 58 % de la mensualité\./); assert.match(t, /Impôts 0 €/);
  t = texte(bilanSimple({loyer: 1000, credit: 700, charges: 100, impots: -50}));
  assert.match(t, /Impôts \(économie\) \+ 50 €/); assert.match(t, /Il te reste 250 € par mois/);
  t = texte(bilanSimple({loyer: 1000, credit: 700, charges: 100, impots: 80}));
  assert.match(t, /Impôts − 80 €/); assert.match(t, /Il te reste 120 € par mois/);
});

test('bilan : le reste donné l\'emporte (même calcul que le cash-flow de l\'appli)', () => {
  assert.match(texte(bilanSimple({loyer: 800, credit: 600, charges: 100, reste: 98})), /Il te reste 98 € par mois/);
});

test('phrases : pas de loyer, équilibre, sans crédit, plusieurs biens', () => {
  assert.match(texte(phraseSimple(0, 0, 0)), /Pas de loyer ni de crédit/);
  assert.match(texte(phraseSimple(0, 500, -580)), /Pas de loyer : tout sort de ta poche, crédit compris/);
  assert.match(texte(phraseSimple(700, 650, 2)), /Le loyer paie 108 % de la mensualité : tout juste de quoi payer le crédit et les charges/);
  assert.match(texte(phraseSimple(700, 0, 600)), /Le loyer paie toutes les charges/);
  assert.match(texte(phraseSimple(2000, 1500, 300, true)), /Les loyers paient 133 % des mensualités, et aussi les charges/);
});

test('bilan : en gros en tête, deux barres à la même échelle, détail du loyer encaissé', () => {
  const h = bilanSimple({loyer: 654, credit: 1622, charges: 129}, {titre: 'Chaque mois', libLoyer: 'Loyer encaissé', detailLoyer: detailVacance(682, 0.5)});
  assert.ok(h.indexOf('bs-total') < h.indexOf('bs-barres') && h.indexOf('bs-barres') < h.indexOf('bs-lignes'), 'chiffre, barres, puis lignes');
  assert.match(h, /bs-loyer" style="width:37\.4%/); assert.match(h, /bs-credit" style="width:92\.6%/); assert.match(h, /bs-charges" style="width:7\.4%/);
  assert.match(texte(h), /Loyer encaissé 682 € moins ½ mois vide par an \+ 654 €/);
  assert.equal(detailVacance(800, 0), ''); assert.equal(detailVacance(800, 1.5), '800 € moins 1,5 mois vide par an');
  assert.doesNotMatch(bilanSimple({loyer: 1, credit: 1, charges: 0}, {sansTete: true}), /bs-total/);
});
