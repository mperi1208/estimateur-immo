// Compte et données : fusion des biens entre appareils, anciennes fiches remises à jour, recherches récentes,
// messages d'erreur du service de comptes
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, inv, idx} = require('./outils');

const stockage = new Map();
const localStorage = {getItem: k => stockage.has(k) ? stockage.get(k) : null, setItem: (k, v) => stockage.set(k, String(v)), removeItem: k => stockage.delete(k)};
const ctx = vm.createContext({T: {}, localStorage, Date, JSON});
vm.runInContext([
  bloc(inv, 'const somme =', 'const uid ='),
  'let n_ = 0; const uid = () => "id" + (++n_);',
  bloc(inv, '// ---------- Mois', '// ---------- Données'),
  'var STATUTS = {}, biens = [], scis = [], supprimes = {};',
  bloc(inv, 'function nouveauBien', 'const scisLocales'),
  bloc(inv, 'function normaliser', 'const sciDe ='),
  bloc(inv, 'function fusionListes', 'const marquerSupprime'),
  bloc(idx, 'const RECENTES = {', 'let memoMinuteur'),
  'function majRecentes() {}',
  bloc(idx, 'function erreurCompte', 'const dateVersion'),
  'this.X = {nouveauBien, depuisCredit, nouvelleSci, normaliser, fusionListes, fusionnerDistant, RECENTES, erreurCompte};',
  'this.etat = () => ({biens, scis, supprimes}); this.poser = (b, s, sup = {}) => { biens = b; scis = s; supprimes = sup; };',
].join('\n'), ctx);
const {nouveauBien, depuisCredit, normaliser, fusionListes, fusionnerDistant, RECENTES, erreurCompte} = ctx.X;
const ids = l => l.map(x => x.id);

// ---------- Fusion entre appareils ----------
test('fusion : pour chaque bien, la version modifiée le plus récemment gagne', () => {
  const ici = [{id: 'a', nom: 'A ici', maj: 200}, {id: 'b', nom: 'B ici', maj: 100}];
  const la = [{id: 'a', nom: 'A là', maj: 100}, {id: 'b', nom: 'B là', maj: 300}, {id: 'c', nom: 'C là', maj: 50}];
  const r = fusionListes(ici, la, {});
  assert.deepEqual(ids(r), ['a', 'b', 'c']);
  assert.deepEqual(r.map(x => x.nom), ['A ici', 'B là', 'C là']);
});
test('fusion : un bien supprimé ne revient pas, ni d\'ici ni de l\'autre appareil', () => {
  const r = fusionListes([{id: 'a', maj: 5}, {id: 'b', maj: 5}], [{id: 'b', maj: 9}, {id: 'c', maj: 1}], {b: Date.now()});
  assert.deepEqual(ids(r), ['a', 'c']);
});
test('fusion : à égalité, la version de cet appareil est gardée ; sans « maj », l\'autre version compte comme plus ancienne', () => {
  assert.equal(fusionListes([{id: 'a', v: 'ici', maj: 7}], [{id: 'a', v: 'là', maj: 7}], {})[0].v, 'ici');
  assert.equal(fusionListes([{id: 'a', v: 'ici'}], [{id: 'a', v: 'là'}], {})[0].v, 'ici');
  assert.equal(fusionListes([{id: 'a', v: 'ici'}], [{id: 'a', v: 'là', maj: 1}], {})[0].v, 'là');
});
test('fusion du compte : suppressions de plus de 6 mois oubliées, biens et SCI fusionnés', () => {
  const vieux = Date.now() - 200 * 864e5, recent = Date.now() - 864e5;
  ctx.poser([nouveauBien({id: 'a', maj: 10})], [], {});
  fusionnerDistant({biens: [nouveauBien({id: 'b', maj: 5}), nouveauBien({id: 'z', maj: 5})], scis: [{id: 's1', nom: 'SCI Un', regime: 'ir', maj: 1}], supprimes: {z: recent, ancien: vieux}});
  const e = ctx.etat();
  assert.deepEqual(ids(e.biens), ['a', 'b']); assert.deepEqual(ids(e.scis), ['s1']);
  assert.deepEqual(Object.keys(e.supprimes), ['z']);
});
test('fusion du compte : ancien format (liste de crédits) ignoré sans rien casser', () => {
  ctx.poser([nouveauBien({id: 'a'})], []);
  fusionnerDistant([{nom: 'Prêt X'}]); fusionnerDistant(null);
  assert.deepEqual(ids(ctx.etat().biens), ['a']);
});

// ---------- Anciennes fiches ----------
test('ancien onglet « Mes crédits » : un crédit devient un bien avec son prêt (relevé au mois courant)', () => {
  const b = depuisCredit({nom: 'Prêt Studio Passy', bien: '1 rue X', valeur: 250000, taux: 1.2, duree: 240, crd: 120000, mois: 150, mensualite: 900, sci: true});
  assert.equal(b.nom, 'Studio Passy'); assert.equal(b.adresse, '1 rue X'); assert.equal(b.structure, 'ir');
  assert.equal(b.prets.length, 1); assert.equal(b.prets[0].crd, 120000); assert.equal(b.prets[0].crdLe, b.valeurLe);
});
test('anciennes fiches « SCI à l\'IR / à l\'IS » : rattachées à une vraie fiche SCI, une seule par nom', () => {
  const a = nouveauBien({id: 'a', structure: 'is', sci: 'Ma Belle SCI'}), b = nouveauBien({id: 'b', structure: 'is', sci: 'ma belle sci'}), c = nouveauBien({id: 'c', structure: 'ir'});
  ctx.poser([a, b, c], []);
  normaliser();
  const {scis} = ctx.etat();
  assert.equal(scis.length, 2);
  assert.equal(a.structure, 'sci'); assert.equal(a.sciId, b.sciId); assert.equal(scis.find(x => x.id === a.sciId).regime, 'is');
  assert.equal(scis.find(x => x.id === c.sciId).nom, 'Ma SCI'); assert.equal(a.sci, undefined);
});
test('bien rattaché à une SCI supprimée : repasse en nom propre', () => {
  const a = nouveauBien({structure: 'sci', sciId: 'disparue'});
  ctx.poser([a], [{id: 'autre', nom: 'X', regime: 'ir'}]);
  normaliser();
  assert.equal(a.structure, 'np'); assert.equal(a.sciId, null);
});
test('anciennes caractéristiques (DPE, étage) reprises ; valeur saisie gardée comme manuelle', () => {
  const a = nouveauBien({dpe: 'E', etage: 9, valeur: 100000}); delete a.criteres;
  ctx.poser([a], []);
  normaliser();
  assert.deepEqual({...a.criteres}, {dpe: 'E', etage: '6'}); assert.equal(a.valeurManuelle, true); assert.equal(a.dpe, undefined);
});
test('garage associé « vacant » d\'avant : devient « avec le bien » une seule fois, puis le choix est respecté', () => {
  const p = nouveauBien({id: 'P'}), g = nouveauBien({id: 'G', type: 'parking', lieA: 'P', location: {statut: 'vacant'}});
  ctx.poser([p, g], []);
  normaliser();
  assert.equal(g.location.statut, 'avec'); assert.equal(g.avecVu, true);
  g.location.statut = 'vacant'; normaliser();
  assert.equal(g.location.statut, 'vacant');
  ctx.poser([g], []); g.location.statut = 'avec'; normaliser();   // bien principal disparu
  assert.equal(g.location.statut, 'vacant');
});

// ---------- Recherches récentes ----------
const rech = (cle, quand, o = {}) => ({cle, quand, label: cle, criteres: {}, ...o});
test('recherches récentes : fusion avec le compte, la plus récente de chaque recherche, 20 au plus', () => {
  RECENTES.liste = [rech('a', '2026-01-02T00:00:00Z', {prix: 1}), rech('b', '2026-01-01T00:00:00Z')];
  RECENTES.fusionner([rech('a', '2026-01-03T00:00:00Z', {prix: 2}), ...Array.from({length: 25}, (_, i) => rech('x' + i, '2025-06-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z'))]);
  assert.equal(RECENTES.liste.length, 20);
  assert.deepEqual(RECENTES.liste.slice(0, 2).map(r => [r.cle, r.prix]), [['a', 2], ['b', undefined]]);
  assert.equal(JSON.parse(stockage.get('recherches-v1')).length, 20);
});
test('recherches récentes : une recherche supprimée ne revient pas, sauf refaite après la suppression', () => {
  RECENTES.liste = [];
  const sup = {a: Date.parse('2026-02-01T00:00:00Z')};
  RECENTES.fusionner([rech('a', '2026-01-15T00:00:00Z'), rech('b', '2026-01-15T00:00:00Z')], sup);
  assert.deepEqual(RECENTES.liste.map(r => r.cle), ['b']);
  RECENTES.fusionner([rech('a', '2026-03-01T00:00:00Z')], sup);
  assert.deepEqual(RECENTES.liste.map(r => r.cle), ['a', 'b']);
});
test('recherches récentes : une entrée abîmée (sans date) ne bloque pas la fusion', () => {
  RECENTES.liste = [rech('a', '2026-01-01T00:00:00Z')];
  RECENTES.fusionner([{cle: 'b', label: 'b', criteres: {}}, null]);
  assert.deepEqual(RECENTES.liste.map(r => r.cle).sort(), ['a', 'b']);
});

// ---------- Messages ----------
test('erreurs du service de comptes traduites', () => {
  assert.equal(erreurCompte({message: 'Invalid login credentials'}), 'E-mail ou mot de passe incorrect.');
  assert.match(erreurCompte({message: 'User already registered'}), /existe déjà/);
  assert.match(erreurCompte({message: 'Email not confirmed'}), /Confirme/);
  assert.match(erreurCompte({message: 'Password should be at least 6 characters'}), /6 caractères/);
  assert.match(erreurCompte(new Error('Could not find the table immo_profils')), /supabase.sql/);
  assert.equal(erreurCompte('autre chose'), 'autre chose');
});
test('fusion : entrée abîmée dans le compte (vide, sans identifiant) écartée', () => {
  assert.deepEqual(ids(fusionListes([{id: 'a'}], [null, {nom: 'sans id'}, {id: 'b'}], {})), ['a', 'b']);
  assert.deepEqual(ids(fusionListes([{id: 'a'}], {pas: 'une liste'}, {})), ['a']);
});
