// Garage, box ou place vendu seul : prix des dépendances DVF ramené au type de place
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, inv} = require('./outils');

const ctx = vm.createContext({});
vm.runInContext([
  bloc(inv, 'const medianePonderee =', 'async function estimerTerrain'),
  bloc(inv, '// Les actes ne disent pas si', 'function versDependance'),
  bloc(inv, '// Même estimation, autre type de place', 'const enCours'),
  'this.X = {PLACES, placeDe, replacer, valeurDependance};',
].join('\n'), ctx);
const {placeDe, replacer, valeurDependance} = ctx.X;

// Bastia : garages vendus seuls autour de 20 000 €
const an = 2026, ventes = [16000, 18000, 19000, 20000, 20000, 21000, 22000, 24000, 26000, 15000]
  .map((prix, i) => ({id: 'v' + i, prix, date: '2025-03-01', d: 200 + 50 * i, lat: 42.7, lon: 9.45}));

test('box ou garage fermé : médiane des ventes (inchangé)', () => {
  const r = valeurDependance(ventes, an);
  assert.equal(r.prix, 20000);
  assert.equal(r.place, 'box');
  assert.ok(r.lo <= r.prix && r.prix <= r.hi);
});
test('place extérieure : ≈ 15 % d\'un box, plus jamais au prix d\'un garage', () => {
  const r = valeurDependance(ventes, an, 'ext');
  assert.equal(r.prix, 3000);
  assert.ok(r.hi < 4000, `fourchette haute ${r.hi}`);
  assert.equal(r.place, 'ext');
});
test('place couverte : ≈ 75 % d\'un box', () => assert.equal(valeurDependance(ventes, an, 'couverte').prix, 15000));
test('petits montants arrondis à 100 €', () => {
  const r = valeurDependance(ventes.map(v => ({...v, prix: v.prix / 4})), an, 'ext');
  assert.equal(r.prix % 100, 0); assert.ok(r.prix >= 600 && r.prix <= 900, String(r.prix));
});
test('type de place changé après l\'estimation : ramenée sans nouvelle recherche', () => {
  const box = valeurDependance(ventes, an), ext = replacer(box, 'ext');
  assert.equal(ext.prix, 3000); assert.equal(ext.place, 'ext');
  assert.equal(replacer(ext, 'box').prix, 20000);
  assert.equal(replacer({prix: 20000, lo: 18000, hi: 22000}, 'ext').prix, 3000);   // ancienne estimation sans type : un box
});
test('stationnement coché sur le bien → type de la place sortie à part', () => {
  assert.equal(placeDe('ext'), 'ext'); assert.equal(placeDe('place'), 'ext');
  assert.equal(placeDe('1'), 'couverte'); assert.equal(placeDe('box'), 'box'); assert.equal(placeDe('oui'), 'box'); assert.equal(placeDe(undefined), 'box');
});
