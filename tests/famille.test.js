// Profils d'une même famille : biens, SCI et projets partagés dans la ligne du titulaire, sauf ce que leur auteur
// garde « rien que pour lui » ; recherches récentes rangées par profil ; anciens profils versés une fois
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, idx} = require('./outils');

const ctx = vm.createContext({Date, JSON});
vm.runInContext(bloc(idx, '// ---------- Famille : ce qui est partagé', 'const COULEURS_PROFIL')
  + '\nthis.F = {familleVide, versionFamille, verserDansFamille, partFamille, remettreFamille};', ctx);
const {familleVide, versionFamille, verserDansFamille, partFamille, remettreFamille} = ctx.F;
const ids = l => [...l].map(x => x.id);

test('ancien compte : ce qui y est appartient au titulaire, ses recherches aussi', () => {
  const f = versionFamille({version: 2, biens: [{id: 'b1'}], scis: [], projets: [{id: 'p1'}], recherches: [{cle: 'r'}], supprimes: {}});
  assert.strictEqual(f.version, 3);
  assert.deepStrictEqual(f.biens.map(x => x.auteur), ['']);
  assert.deepStrictEqual(f.projets.map(x => x.auteur), ['']);
  assert.strictEqual(f.recherchesPar[''].length, 1);
  assert.ok(!('recherches' in f));
});

test('tout est partagé par défaut : un autre profil voit les biens et projets du titulaire', () => {
  const f = versionFamille({biens: [{id: 'b1'}], projets: [{id: 'p1'}, {id: 'p2', auteur: 'cat'}]});
  const {visible} = partFamille(f, 'jo');
  assert.deepStrictEqual(ids(visible.biens), ['b1']);
  assert.deepStrictEqual(ids(visible.projets), ['p1', 'p2']);
  assert.strictEqual(visible.recherches.length, 0);
});

test('« rien que pour moi » : seul son auteur le voit, et il revient dans la famille à chaque enregistrement', () => {
  const f = versionFamille({biens: [{id: 'b1'}, {id: 'b2', auteur: 'cat', perso: true}], projets: [{id: 'p1', auteur: 'jo', perso: true}]});
  const cat = partFamille(f, 'cat'), jo = partFamille(f, 'jo');
  assert.deepStrictEqual(ids(cat.visible.biens), ['b1', 'b2']);
  assert.deepStrictEqual(ids(cat.visible.projets), []);
  assert.deepStrictEqual(ids(jo.visible.biens), ['b1']);
  // Jo enregistre (en ajoutant un bien) : le bien caché de Catalina n'est pas perdu
  const c = {...jo.visible, biens: [...jo.visible.biens, {id: 'b3'}]};
  const out = remettreFamille(c, jo.caches, 'jo');
  assert.deepStrictEqual(ids(out.biens), ['b1', 'b3', 'b2']);
  assert.strictEqual(out.biens[1].auteur, 'jo');   // nouveauté : à son nom
  assert.strictEqual(out.biens[0].auteur, '');
});

test('un bien caché supprimé ailleurs ne revient pas', () => {
  const f = versionFamille({biens: [{id: 'b2', auteur: 'cat', perso: true}]});
  const {visible, caches} = partFamille(f, 'jo');
  const out = remettreFamille({...visible, supprimes: {b2: 1}}, caches, 'jo');
  assert.deepStrictEqual(ids(out.biens), []);
});

test('recherches récentes : chacun les siennes', () => {
  const f = versionFamille({biens: [], recherchesPar: {'': [{cle: 'moi'}], cat: [{cle: 'cat'}]}});
  const {visible, caches} = partFamille(f, 'cat');
  assert.deepStrictEqual(visible.recherches.map(r => r.cle), ['cat']);
  const out = remettreFamille({...visible, recherches: [{cle: 'cat2'}, {cle: 'cat'}]}, caches, 'cat');
  assert.deepStrictEqual(out.recherchesPar[''].map(r => r.cle), ['moi']);
  assert.deepStrictEqual(out.recherchesPar.cat.map(r => r.cle), ['cat2', 'cat']);
  assert.ok(!('recherches' in out));
});

test('profil qui avait ses propres biens : versé une fois dans la famille, partagé, à son nom', () => {
  assert.strictEqual(familleVide(null), true);
  assert.strictEqual(familleVide({version: 3, verse: 123}), true);
  assert.strictEqual(familleVide({biens: [], projets: []}), true);
  const ancien = {biens: [], projets: [{id: 'pc'}], recherches: [{cle: 'x'}], supprimes: {z: 5}};
  assert.strictEqual(familleVide(ancien), false);
  const f = versionFamille({biens: [{id: 'b1'}], projets: [{id: 'p1'}]});
  verserDansFamille(f, ancien, 'cat');
  assert.deepStrictEqual(ids(f.projets), ['p1', 'pc']);
  assert.strictEqual(f.projets[1].auteur, 'cat');
  assert.ok(!f.projets[1].perso);
  assert.strictEqual(f.recherchesPar.cat.length, 1);
  assert.strictEqual(f.supprimes.z, 5);
  // déjà là (même id) : pas en double
  verserDansFamille(f, ancien, 'cat');
  assert.deepStrictEqual(ids(f.projets), ['p1', 'pc']);
});

test('compte vide : la famille part d\'une ligne neuve', () => {
  const f = versionFamille(null);
  assert.deepStrictEqual([f.biens, f.scis, f.projets].map(l => l.length), [0, 0, 0]);
  assert.strictEqual(f.version, 3);
});
