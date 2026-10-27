// Biens des projets : un identifiant par bien, partagé par les options ; même bien = même identifiant, sinon même lieu (50 m)
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({});
vm.runInContext(bloc(idx, '// ---------- Biens', '// ---------- fin des biens') + 'this.X = {memeBien, memeLieu, numeroterBiens, unirBiens, metres};', ctx);
const {memeBien, memeLieu, numeroterBiens, unirBiens, metres} = ctx.X;
const rc = (lat, lon, extra = {}) => ({cle: `${lat.toFixed(5)},${lon.toFixed(5)},121`, lat, lon, type: '121', ...extra});

test('même lieu : même position, ou moins de 50 m avec le même type', () => {
  const a = rc(45.7578, 4.8357);
  assert.ok(Math.abs(metres(a, rc(45.7579, 4.8357)) - 11.1) < 0.2);
  assert.ok(memeLieu(a, rc(45.7578, 4.8357)));
  assert.ok(memeLieu(a, rc(45.7580, 4.8358)), 'clic à 24 m');
  assert.ok(!memeLieu(a, rc(45.7590, 4.8357)), '133 m : autre bien');
  assert.ok(!memeLieu(a, {...rc(45.7579, 4.8357), type: '111'}), 'maison ≠ appartement');
});

test('même bien : l\'identifiant d\'abord, la position seulement sans identifiant', () => {
  assert.ok(memeBien(rc(45.7578, 4.8357, {bien: 'b1'}), rc(45.7700, 4.8500, {bien: 'b1'})), 'adresse corrigée, même bien');
  assert.ok(!memeBien(rc(45.7578, 4.8357, {bien: 'b1'}), rc(45.7578, 4.8357, {bien: 'b2'})), 'deux appartements du même immeuble');
  assert.ok(memeBien(rc(45.7578, 4.8357), rc(45.7578, 4.8357, {bien: 'b2'})));
  assert.ok(!memeBien(null, rc(45.7578, 4.8357)));
});

test('numérotation : les options d\'un projet partagent leur bien, deux biens d\'un même crédit restent deux, une seule fois', () => {
  const l = [
    {id: 'p1', groupe: 'g', recherche: rc(45.7578, 4.8357)},
    {id: 'p2', groupe: 'g', recherche: rc(45.7579, 4.8357)},              // même bien, clic à côté
    {id: 'p3', groupe: 'g', recherche: rc(45.7700, 4.8500)},              // autre adresse dans le même projet
    {id: 'p4', recherche: rc(45.7578, 4.8357)},                            // autre projet, même adresse : son bien à lui
    {id: 'p5', estimations: [rc(45.7600, 4.8400), rc(45.7600, 4.8400)]},   // deux appartements du même immeuble, un crédit
  ];
  assert.equal(numeroterBiens(l), true);
  const b = i => l[i].recherche.bien;
  assert.ok(b(0) && b(0) === b(1)); assert.notEqual(b(2), b(0)); assert.notEqual(b(3), b(0));
  assert.notEqual(l[4].estimations[0].bien, l[4].estimations[1].bien);
  const avant = JSON.stringify(l);
  assert.equal(numeroterBiens(l), false); assert.equal(JSON.stringify(l), avant);
});

test('projets mis ensemble en options : un même lieu devient un même bien', () => {
  const l = [{recherche: rc(45.7578, 4.8357, {bien: 'b1'})}, {recherche: rc(45.7578, 4.8357, {bien: 'b9'})}, {recherche: rc(45.77, 4.85, {bien: 'b5'})}];
  unirBiens(l);
  assert.equal(l[1].recherche.bien, 'b1'); assert.equal(l[2].recherche.bien, 'b5');
});
