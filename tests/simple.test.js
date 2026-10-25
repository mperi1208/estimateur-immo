// Mode simple : bilan du mois (loyer − crédit − charges = ce qu'il reste) et phrase en langage courant
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({localStorage: {getItem: () => 'simple'}});
vm.runInContext(bloc(idx, '// ---------- Mode simple', '// ---------- fin du mode simple') + 'this.X = {bilanSimple, phraseSimple, modeSimple};', ctx);
const {bilanSimple, phraseSimple, modeSimple} = ctx.X;
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('le mode est lu sur l\'appareil', () => assert.equal(modeSimple(), true));

test('bilan : loyer − crédit − charges = ce qu\'il reste, avec le signe de chaque ligne', () => {
  const t = texte(bilanSimple({loyer: 800, credit: 666, charges: 75}));
  assert.match(t, /Loyer \+ 800 €/); assert.match(t, /Mensualité du crédit − 666 €/); assert.match(t, /Charges \(taxe foncière, copro…\) − 75 €/);
  assert.match(t, /Il te reste 59 € par mois/);
  assert.match(t, /ce bien te rapporte 59 € par mois\. Le loyer paie 120 % de la mensualité/);
  assert.doesNotMatch(t, /Impôts/);
});

test('bilan : perte, impôts comptés, et économie d\'impôt', () => {
  let t = texte(bilanSimple({loyer: 767, credit: 1320, charges: 136, impots: 0}));
  assert.match(t, /Il te manque 689 € par mois/); assert.match(t, /il faut ajouter 689 € par mois de ta poche/); assert.match(t, /Impôts 0 €/);
  t = texte(bilanSimple({loyer: 1000, credit: 700, charges: 100, impots: -50}));
  assert.match(t, /Impôts \(économie\) \+ 50 €/); assert.match(t, /Il te reste 250 € par mois/);
  t = texte(bilanSimple({loyer: 1000, credit: 700, charges: 100, impots: 80}));
  assert.match(t, /Impôts − 80 €/); assert.match(t, /Il te reste 120 € par mois/);
});

test('bilan : le reste donné l\'emporte (même calcul que le cash-flow de l\'appli)', () => {
  assert.match(texte(bilanSimple({loyer: 800, credit: 600, charges: 100, reste: 98})), /Il te reste 98 € par mois/);
});

test('phrases : pas de loyer, équilibre, plusieurs biens', () => {
  assert.match(texte(phraseSimple(0, 0, 0)), /Pas de loyer ni de crédit/);
  assert.match(texte(phraseSimple(0, 500, -580)), /Pas de loyer : ce bien te coûte 580 € par mois, crédit compris/);
  assert.match(texte(phraseSimple(700, 650, 2)), /Le loyer paie tout juste le crédit et les charges/);
  assert.match(texte(phraseSimple(700, 0, 600)), /Une fois les charges payées, ce bien te rapporte 600 €/);
  assert.match(texte(phraseSimple(2000, 1500, 300, true)), /tes biens te rapportent 300 € par mois\. Les loyers paient 133 % des mensualités/);
});
