// Note de risque d'un projet (1 vert à 5 rouge) : l'argent en jeu, ce qu'il manque par mois, la marge des loyers,
// les travaux, l'apport, et ce qui dépend du marché
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({});
vm.runInContext([
  'const esc = v => String(v ?? "");',
  bloc(idx, 'const eurP = n =>', 'const dateP'),
  bloc(idx, '// ---------- Note de risque', '// ---------- fin de la note de risque'),
  'this.X = {risqueProjet, barresRisque};',
].join('\n'), ctx);
const {risqueProjet, barresRisque} = ctx.X;

test('gros projet à peine rentable : plus risqué qu\'un petit projet qui s\'autofinance', () => {
  const gros = risqueProjet({prix: 1000000, apport: 100000, mensualite: 5200, cfMois: 300, mois: {loyer: 5500}});
  const petit = risqueProjet({prix: 50000, apport: 10000, mensualite: 300, cfMois: 100, mois: {loyer: 420}});
  assert.equal(petit.note, 1);
  assert.equal(gros.note, 3);
  assert.match(gros.raisons.join(' · '), /en jeu/);
});

test('rénovation complète sans apport, loyers à la moitié de la mensualité : risque très élevé', () => {
  const r = risqueProjet({prix: 138508, travaux: 60000, apport: 0, mensualite: 1307, cfMois: -782, mois: {loyer: 653}}, {dureeTravaux: 7});
  assert.equal(r.note, 5);
  assert.match(r.raisons[0], /couvrent 50 %/);
});

test('achat-revente : le marché compte ; une perte prévue pèse lourd', () => {
  const gagnant = risqueProjet({prix: 150000, travaux: 30000, apport: 40000, scenario: 'revendre', benefice: 40000}, {dureeTravaux: 4});
  const perdant = risqueProjet({prix: 150000, travaux: 30000, apport: 40000, scenario: 'revendre', benefice: -5000}, {dureeTravaux: 4});
  assert.ok(perdant.note > gagnant.note);
  assert.ok(gagnant.raisons.includes('dépend du prix de revente'));
});

test('location à la nuitée : un point de plus ; projet vide : pas de note cassée', () => {
  const base = {prix: 180000, apport: 40000, mensualite: 800, cfMois: 50, mois: {loyer: 1000}};
  assert.equal(risqueProjet({...base, saison: true}).total, risqueProjet(base).total + 1);
  const vide = risqueProjet({});
  assert.ok(vide.note >= 1 && vide.note <= 5);
});

test('cinq barres, autant de remplies que la note, et le détail lisible', () => {
  const h = barresRisque({note: 4, raisons: ['200 000 € en jeu', 'il manque 300 € par mois']});
  assert.equal((h.match(/<i class="on">/g) || []).length, 4);
  assert.equal((h.match(/<i/g) || []).length, 5);
  assert.match(h, /Risque élevé \(4\/5\) : 200 000 € en jeu, il manque 300 € par mois/);
});
