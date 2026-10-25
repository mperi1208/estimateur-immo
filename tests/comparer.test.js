// Mes projets : branches d'un même projet (regroupement proposé, noms) et leur comparaison côte à côte
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({esc: v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
  fmtK: n => Math.round(n / 1000) + ' k€', usageP: (r, revente) => revente ? 'achat-revente' : r.meuble ? 'meublé' : 'location vide', PROJETS: {liste: []}});
const ligneMots = ['motsP', 'eurP', 'signeP', 'quiP'].map(n => new RegExp('^const ' + n + ' = .*$', 'm').exec(idx)[0]).join('\n');
vm.runInContext(ligneMots + '\n' + bloc(idx, '// ---------- Comparer des branches', '// ---------- fin de la comparaison')
  + bloc(idx, '// ---------- Branches', '// ---------- fin des branches')
  + 'this.X = {lignesComparaison, verdictComparaison, tableComparaison, propositionsBranches, brancheAuto, nomPropose, analyseBranches, adresseProjet};', ctx);
const {lignesComparaison, verdictComparaison, tableComparaison, propositionsBranches, brancheAuto, analyseBranches} = ctx.X;
const texte = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ligne = (l, k) => l.find(x => x.k === k);

const A = {scenario: 'louer', prix: 200000, travaux: 0, apport: 20000, mensualite: 1000, mois: {loyer: 900, credit: 1000, charges: 150, impots: null}, cfMois: -250, cfDiffere: null, patrimoine: 150000, horizon: 25, coutCredit: 60000};
const B = {scenario: 'louer', prix: 150000, travaux: 20000, apport: 10000, mensualite: 850, mois: {loyer: 950, credit: 850, charges: 120, impots: null}, cfMois: -20, cfDiffere: -400, patrimoine: 160000, horizon: 25, coutCredit: 45000};
const C = {...B, prix: 160000, cfMois: 100, mensualite: 900, coutCredit: 50000};

test('gagnant et écart : le plus bas pour un coût, le plus haut pour un gain', () => {
  const l = lignesComparaison([A, B]);
  assert.deepEqual([ligne(l, 'Prix du projet').gagnant, ligne(l, 'Prix du projet').ecart], [1, 50000]);
  assert.deepEqual([ligne(l, 'Il te reste par mois').gagnant, ligne(l, 'Il te reste par mois').ecart], [1, 230]);
  assert.equal(ligne(l, 'Apport').gagnant, null);                         // ni mieux ni moins bien
  assert.equal(ligne(l, 'Travaux').gagnant, 0);
  assert.equal(ligne(l, 'Pendant le différé').gagnant, null);             // un seul des deux a un différé
  assert.ok(Math.abs(ligne(l, 'Rendement brut').v[0] - 0.054) < 1e-9);   // 900 × 12 ÷ 200 000
  assert.ok(Math.abs(ligne(l, 'Rendement brut').v[1] - 950 * 12 / 170000) < 1e-9);   // travaux compris
  assert.equal(ligne(l, 'Impôts par mois'), undefined);                   // pas comptés : ligne cachée
  assert.equal(ligne(l, 'Bénéfice à la revente'), undefined);
});

test('trois branches : le meilleur et son avance sur le 2e', () => {
  const l = lignesComparaison([A, B, C]);
  assert.deepEqual([ligne(l, 'Il te reste par mois').gagnant, ligne(l, 'Il te reste par mois').ecart], [2, 120]);
  assert.deepEqual([ligne(l, 'Prix du projet').gagnant, ligne(l, 'Prix du projet').ecart], [1, 10000]);
  assert.equal(ligne(l, 'Loyers par mois').gagnant, null);               // B et C à égalité en tête
  assert.match(verdictComparaison(['A', 'B', 'C'], [A, B, C]), /« C » te laisse le plus par mois : <b>120 €<\/b> de plus que « B »/);
});

test('patrimoine : pas de gagnant si les durées diffèrent ; travaux cachés si aucun', () => {
  const l = lignesComparaison([{...A, horizon: 20}, {...B, travaux: 0}]);
  assert.deepEqual([ligne(l, 'Patrimoine à la fin').gagnant, ...ligne(l, 'Patrimoine à la fin').sous], [null, 'dans 20 ans', 'dans 25 ans']);
  assert.equal(ligne(l, 'Travaux'), undefined);
});

test('mode simple : prix, mensualité et ce qu\'il reste', () => {
  assert.deepEqual(lignesComparaison([A, B], true).map(x => x.k), ['Prix du projet', 'Mensualité', 'Il te reste par mois']);
});

test('achat-revente contre location : chacun ses chiffres, pas de verdict', () => {
  const R = {scenario: 'revendre', prix: 180000, travaux: 30000, apport: 15000, benefice: 25000};
  const l = lignesComparaison([A, R]);
  assert.deepEqual(ligne(l, 'Bénéfice à la revente').v, [null, 25000]);
  assert.equal(ligne(l, 'Il te reste par mois').v[1], null);
  assert.equal(verdictComparaison(['A', 'R'], [A, R]), '');
  assert.match(verdictComparaison(['R1', 'R2'], [R, {...R, benefice: 10000}]), /« R1 » te rapporte le plus à la revente : <b>15\s000 €<\/b> de plus que « R2 »/);
  assert.match(verdictComparaison(['A', 'B'], [A, {...B, cfMois: -250}]), /« A » et « B » te laissent autant par mois/);
});

test('tableau : verdict, noms, écart dans la case du meilleur', () => {
  const t = texte(tableComparaison([{nom: 'Diviser <2>', resume: A}, {nom: 'Garage', resume: B}], {sous: ['location vide', 'meublé']}));
  assert.match(t, /« Garage » te laisse le plus par mois : 230 € de plus que « Diviser &#60;2&#62; »/);
  assert.match(t, /Diviser &#60;2&#62; location vide Garage meublé/);
  assert.match(t, /Il te reste par mois −250 € −20 € 230 € de mieux/);
  assert.match(t, /Rendement brut 5,4 % 6,7 % 1,3 pt de mieux/);
  assert.match(t, /Patrimoine dans 25 ans 150\s000 € 160\s000 € 10\s000 € de mieux/);
});

test('regroupement proposé : même adresse ou mot du nom en commun (San Gaetano / sans Gaetan), pas les mots courants', () => {
  const pr = (id, nom, o = {}) => ({id, nom, quand: id, resume: {prix: 100000, ...(o.resume || {})}, ...o});
  const l = [pr('1', 'Route de San Gaetano'), pr('2', 'sans Gaetan 2'), pr('3', 'San Gaetano division'), pr('4', 'Maison Lyon'), pr('5', 'Appartement Lyon'),
    pr('6', 'Studio', {resume: {prix: 90000, label: '3 rue Neuve'}}), pr('7', 'T2 bis', {resume: {prix: 80000, label: '3 rue Neuve'}}), pr('8', 'Seul')];
  ctx.PROJETS.liste = l;
  const p = propositionsBranches(l);
  assert.deepEqual(p.map(x => [...x.ids].sort()), [['1', '2', '3'], ['6', '7']]);
  assert.equal(p[0].nom, 'sans Gaetan 2');                                // le plus court qui contient le mot le plus partagé
  // Déjà regroupés ensemble : plus proposés
  l.slice(0, 3).forEach(x => { x.groupe = 'g1'; });
  assert.deepEqual(propositionsBranches(l).map(x => x.ids.length), [2]);
});

test('nom de chaque branche : ce qui reste du nom sans les mots du projet, sinon usage, travaux et prix', () => {
  assert.equal(brancheAuto({nom: 'San Gaetano division'}, 'San Gaetano'), 'Division');
  assert.equal(brancheAuto({nom: 'Route de San Gaetano - garage refait'}, 'Route de San Gaetano'), 'Garage refait');
  assert.equal(brancheAuto({nom: 'San Gaetano', resume: {prix: 250000, travaux: 40000, meuble: true}}, 'San Gaetano'), 'Meublé · travaux 40 k€ · 250 k€');
});

test('arbre : le 2e appart et le crédit restent fixes (une fois), seules les différences du 1er sont dans chaque branche', () => {
  const finance = o => ({prix: 150000, loyer: 1200, surf: 60, meuble: '1', tf: 800, copro: 0, apport: 30000, taux: 3.6, duree: 25, differe: 12, nomBien: 'N*1 San Gaetano',
    biensPlus: [{nom: 'n*2 San Gaetano', prix: 150000, loyer: 1300, surf: 45, tf: 600, copro: 0}], ...o});
  const br = (id, branche, f, r) => ({id, branche, nom: 'San Gaetano', finance: finance(f), resume: {struct: 'is', sciNom: 'SCOPA', loyer: f.loyer || 1200, travaux: 0, ...r},
    estimations: [{label: 'Route de San Gaetano 20600 Bastia'}, null]});
  const a = analyseBranches([br('a', 'Garage', {loyer: 1200}, {travaux: 30000, valeurApres: 350000}), br('b', 'Division', {loyer: 1100}, {travaux: 25000, valeurApres: 308000})]);
  const t = a.fixes.map(texte).join(' | ');
  assert.match(t, /n\*2 San Gaetano · 150\s000 € · loyer 1\s300 €\/mois/);
  assert.match(t, /Un seul crédit · apport 30\s000 € · taux 3,6 % · durée 25 ans · différé 12 mois · détenu par SCI à l'IS « SCOPA »/);
  assert.match(t, /N\*1 San Gaetano · 150\s000 € · location meublée \|/);   // ce qui ne change pas pour le 1er : son prix, pas son loyer
  assert.deepEqual(a.biens.map(b => [b.nom, b.fixe]), [['N*1 San Gaetano', false], ['n*2 San Gaetano', true]]);
  assert.deepEqual(a.changes.get('a').map(texte), ['loyer 1 200 €/mois', 'travaux 30 000 €', 'valeur après travaux 350 000 €']);
  assert.equal(a.adresse, 'Route de San Gaetano 20600 Bastia');
});
