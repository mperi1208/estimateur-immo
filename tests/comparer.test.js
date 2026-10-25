// Mes projets : deux projets côte à côte, le meilleur chiffre mis en avant avec l'écart
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({esc: v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')});
vm.runInContext(bloc(idx, '// ---------- Comparer deux projets', '// ---------- fin de la comparaison') + 'this.X = {lignesComparaison, verdictComparaison, tableComparaison};', ctx);
const {lignesComparaison, verdictComparaison, tableComparaison} = ctx.X;
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ligne = (l, k) => l.find(x => x.k === k);

const A = {scenario: 'louer', prix: 200000, travaux: 0, apport: 20000, mensualite: 1000, mois: {loyer: 900, credit: 1000, charges: 150, impots: null}, cfMois: -250, cfDiffere: null, patrimoine: 150000, horizon: 25, coutCredit: 60000};
const B = {scenario: 'louer', prix: 150000, travaux: 20000, apport: 10000, mensualite: 850, mois: {loyer: 950, credit: 850, charges: 120, impots: null}, cfMois: -20, cfDiffere: -400, patrimoine: 160000, horizon: 25, coutCredit: 45000};

test('gagnant et écart : le plus bas pour un coût, le plus haut pour un gain', () => {
  const l = lignesComparaison(A, B);
  assert.deepEqual([ligne(l, 'Prix du projet').gagnant, ligne(l, 'Prix du projet').ecart], ['b', 50000]);
  assert.deepEqual([ligne(l, 'Il te reste par mois').gagnant, ligne(l, 'Il te reste par mois').ecart], ['b', 230]);
  assert.equal(ligne(l, 'Loyers par mois').gagnant, 'b');
  assert.equal(ligne(l, 'Apport').gagnant, null);                         // ni mieux ni moins bien
  assert.equal(ligne(l, 'Travaux').gagnant, 'a');
  assert.equal(ligne(l, 'Pendant le différé').gagnant, null);             // un seul des deux a un différé
  assert.ok(Math.abs(ligne(l, 'Rendement brut').a - 0.054) < 1e-9);      // 900 × 12 ÷ 200 000
  assert.ok(Math.abs(ligne(l, 'Rendement brut').b - 950 * 12 / 170000) < 1e-9);   // travaux compris
  assert.equal(ligne(l, 'Impôts par mois'), undefined);                   // pas comptés : ligne cachée
  assert.equal(ligne(l, 'Bénéfice à la revente'), undefined);
});

test('patrimoine : pas de gagnant si les durées diffèrent ; travaux cachés si aucun', () => {
  const l = lignesComparaison({...A, horizon: 20}, {...B, travaux: 0});
  assert.deepEqual([ligne(l, 'Patrimoine à la fin').gagnant, ...ligne(l, 'Patrimoine à la fin').sous], [null, 'dans 20 ans', 'dans 25 ans']);
  assert.equal(ligne(l, 'Travaux'), undefined);
});

test('mode simple : prix, mensualité et ce qu\'il reste', () => {
  assert.deepEqual(lignesComparaison(A, B, true).map(x => x.k), ['Prix du projet', 'Mensualité', 'Il te reste par mois']);
});

test('achat-revente contre location : chacun ses chiffres, pas de verdict', () => {
  const R = {scenario: 'revendre', prix: 180000, travaux: 30000, apport: 15000, benefice: 25000};
  const l = lignesComparaison(A, R);
  assert.deepEqual([ligne(l, 'Bénéfice à la revente').a, ligne(l, 'Bénéfice à la revente').b], [null, 25000]);
  assert.equal(ligne(l, 'Il te reste par mois').b, null);
  assert.equal(verdictComparaison('A', 'R', A, R), '');
  assert.match(verdictComparaison('R1', 'R2', R, {...R, benefice: 10000}), /« R1 » te rapporte <b>15\s000 €<\/b> de plus à la revente/);
});

test('tableau : verdict, noms, écart dans la case du meilleur', () => {
  const t = texte(tableComparaison({nom: 'Lyon <T2>', resume: A}, {nom: 'Villeurbanne', resume: B}, {sous: ['location vide', 'meublé']}));
  assert.match(t, /« Villeurbanne » te laisse 230 € de plus par mois/);
  assert.match(t, /Lyon &#60;T2&#62; location vide Villeurbanne meublé/);
  assert.match(t, /Il te reste par mois −250 € −20 € 230 € de mieux/);
  assert.match(t, /Rendement brut 5,4 % 6,7 % 1,3 pt de mieux/);
  assert.match(t, /Patrimoine dans 25 ans 150\s000 € 160\s000 € 10\s000 € de mieux/);
  assert.match(verdictComparaison('A', 'B', A, {...B, cfMois: -250}), /autant par mois/);
});
