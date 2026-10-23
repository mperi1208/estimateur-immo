// Onglet Estimer : ventes DVF retenues, indice de prix local, ajustements selon les détails du bien, loyer de marché,
// colocation, budget de travaux. Les champs du formulaire sont remplacés par de simples objets.
const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const {bloc, proche, idx} = require('./outils');

const champs = {};
const element = id => champs[id] ??= {id, value: '', checked: false, open: true, addEventListener() {}};
const ctx = vm.createContext({
  document: {getElementById: element}, location: {search: ''}, localStorage: {getItem: () => null, setItem() {}}, URLSearchParams,
});
vm.runInContext([
  bloc(idx, 'const API =', 'const SOURCES'),
  bloc(idx, 'const DPE =', 'const getJSON'),
  bloc(idx, 'function toSale', 'const PERIODES_AUTO'),
  bloc(idx, 'function indiceLocal', 'async function ventesPourIndice'),
  bloc(idx, 'function quantile', 'let layer'),
  bloc(idx, 'const isAppart', 'function buildForm'),
  bloc(idx, 'const louerMeuble', 'function syncForm'),
  bloc(idx, 'function adjustments', 'const SEUIL_ATYPIQUE'),
  bloc(idx, 'const CHARGES =', 'const memo ='),
  bloc(idx, 'function loyerM2', 'async function updateRent'),
  bloc(idx, 'function calcLoyer', 'function renderRent'),
  bloc(idx, 'const NIVEAUX =', 'let choixTravaux'),
  'this.X = {state, CRITERES, toSale, searchSteps, MAX_BOX, indiceLocal, quantile, adjustments, dampen, facteurPour, chambresMax, colocPossible, PRIME_COLOC, chambresDefaut, nbChambres, budgetMobilier, coutEnergie, recalage, loyerM2, calcLoyer, ELASTICITE_LOYER};',
  'this.saved = () => saved;',
].join('\n'), ctx);
const X = ctx.X, {state} = X;
// Réglages du formulaire : type (appartement / maison), zone, détails ; le reste par défaut
function regler({type = '121', zone = 'autre', surf = 50, ...detail} = {}) {
  for (const k of Object.keys(champs)) { champs[k].value = ''; champs[k].checked = false; }
  state.type = type; state.zone = zone;
  element('surf').value = String(surf);
  for (const [k, v] of Object.entries(detail)) typeof v === 'boolean' ? element('c_' + k).checked = v : element('c_' + k).value = String(v);
}
const base = (o = {}) => ({surf: 50, med: 4000, comps: [], ...o});
const ajust = (o = {}) => { regler(o); const l = X.adjustments(base({surf: o.surf || 50, ...(o.base || {})})); X.dampen(l); return l; };

// ---------- Ventes DVF ----------
const vente = (p = {}, ring = [[2, 48], [2.002, 48], [2, 48.002]]) => ({properties: {idopendata: 'v1', valeurfonc: 200000, sbati: 50, sterr: 0, libnatmut: 'Vente', datemut: '2024-05-01', codtypbien: '121', l_idpar: ['P1'], l_codinsee: ['69123'], ...p}, geometry: {coordinates: [[ring]]}});
test('vente DVF : prix au m², centre de la parcelle, commune', () => {
  const s = X.toSale(vente());
  assert.equal(s.ppm, 4000); proche(s.lon, 2.000667, 1e-6); proche(s.lat, 48.000667, 1e-6); assert.equal(s.insee, '69123');
});
test('vente DVF écartée : prix symbolique, surface inconnue, échange, adjudication, sans géométrie', () => {
  for (const p of [{valeurfonc: 800}, {sbati: 0}, {sbati: 8}, {libnatmut: 'Echange'}, {libnatmut: 'Adjudication'}]) assert.equal(X.toSale(vente(p)), null);
  assert.equal(X.toSale({properties: vente().properties, geometry: null}), null);
});
test('vente DVF sans nature de mutation : gardée, sans planter la recherche', () => {
  assert.ok(X.toSale(vente({libnatmut: undefined})));
  assert.equal(X.toSale(vente({libnatmut: 'Expropriation'})), null);
});
test('zones de recherche : 3 boîtes centrées puis 2 anneaux de tuiles (8 puis 16), toutes sous la limite de l\'API', () => {
  const steps = X.searchSteps(45.75, 4.83);
  assert.deepEqual(steps.map(s => s.length), [1, 1, 1, 8, 16]);
  for (const s of steps) for (const [x0, y0, x1, y1] of s) assert.ok(x1 - x0 <= X.MAX_BOX && y1 - y0 <= X.MAX_BOX);
});

// ---------- Statistiques ----------
test('quantile pondéré', () => {
  assert.equal(X.quantile([[1, 1], [2, 1], [3, 1]], 0.5), 2);
  assert.equal(X.quantile([[1, 1], [2, 1], [10, 8]], 0.5), 10);
  assert.equal(X.quantile([[5, 1], [1, 1]], 0.25), 1);
});
test('indice local : prix qui montent de 5 %/an → ventes anciennes actualisées à la hausse, jamais plus de ×1,7', () => {
  const ventes = [];
  for (let y = 2016; y <= 2025; y++) for (let i = 0; i < 40; i++) ventes.push({type: '121', ppm: 3000 * Math.pow(1.05, y - 2016) * (0.9 + i % 5 / 20), date: `${y}-06-01`});
  const r = X.indiceLocal(ventes);
  assert.equal(r.refYear, '2025'); assert.equal(r.n, 400);
  assert.ok(r.trend['2016'] > r.trend['2020'] && r.trend['2020'] > r.trend['2024'] && r.trend['2024'] >= 1);
  assert.ok(r.trend['2016'] <= 1.7 && r.trend['2016'] > 1.3);
  proche(r.trend['2025'], 1, 1e-9);
});
test('indice local : trop peu d\'années couvertes = pas d\'actualisation', () => {
  const r = X.indiceLocal(Array.from({length: 30}, () => ({type: '121', ppm: 3000, date: '2024-01-01'})));
  assert.deepEqual({...r.trend}, {}); assert.equal(r.refYear, null);
});

// ---------- Ajustements du prix ----------
test('bien « moyen » du secteur : aucun ajustement', () => assert.equal(ajust().length, 0));
test('DPE G (reste de la France) : −12 % ; à moitié si le bien est déjà décoté « à rénover »', () => {
  const g = ajust({dpe: 'G'});
  assert.equal(g.length, 1); proche(g[0].p, -0.12, 1e-12);
  const reno = ajust({dpe: 'G', etat: 'renover'}), l = reno.find(x => /DPE/.test(x.label));
  proche(l.p, -0.06, 1e-12);
  proche(reno.find(x => /travaux/.test(x.label)).p, -1100 / 4000, 1e-12);
});
test('époque de construction : effet divisé par deux quand le DPE est connu', () => {
  proche(ajust({epoque: '1948'})[0].p, -0.11, 1e-12);
  proche(ajust({epoque: '1948', dpe: 'C'}).find(x => /Construction/.test(x.label)).p, -0.055, 1e-12);
});
test('étage : rez-de-chaussée −10 % ; 6e sans ascenseur −7 % hors Paris', () => {
  proche(ajust({etage: 0})[0].p, -0.10, 1e-12);
  proche(ajust({etage: 6, ascenseur: 0})[0].p, -0.07, 1e-12);
  proche(ajust({etage: 6, ascenseur: 1, zone: 'paris'})[0].p, 0.06, 1e-12);
});
test('critères qui se recoupent : le plus fort compte en entier, les suivants de moins en moins', () => {
  const l = ajust({exterieur: 'balcon', lumiere: 'lumineux', vue: 'deg'});
  const tri = l.sort((a, b) => b.p - a.p);
  proche(tri[0].eff, tri[0].p, 1e-12); proche(tri[1].eff, tri[1].p * 0.75, 1e-12); proche(tri[2].eff, tri[2].p * 0.55, 1e-12);
});
test('chambre séparée : seulement jusqu\'à 40 m²', () => {
  assert.equal(ajust({chambre: true, surf: 35}).length, 1);
  assert.equal(ajust({chambre: true, surf: 60}).length, 0);
});
test('stationnement à Paris : montant fixe (box 36 000 €) ; ailleurs en % (box +9 %)', () => {
  assert.equal(ajust({parking: 'box', zone: 'paris'})[0].abs, 36000);
  proche(ajust({parking: 'box'})[0].p, 0.09, 1e-12);
});
test('maison : terrain comparé à la médiane du secteur, effet plafonné à ±10 %', () => {
  const comps = Array.from({length: 10}, () => ({terrain: 500, w: 1}));
  const grand = ajust({type: '111', terrain: 5000, base: {comps}}), petit = ajust({type: '111', terrain: 100, base: {comps}});
  proche(grand[0].p, 0.10, 1e-12); proche(petit[0].p, Math.max(-0.10, 0.08 * Math.log(100 / 500)), 1e-12);
  assert.equal(ajust({type: '111', terrain: 520, base: {comps}}).length, 0);   // trop proche de la médiane
});
test('facteur total borné entre ×0,5 et ×1,6', () => {
  regler({etat: 'renover', dpe: 'G', etage: 0, bruit: 'tres', lumiere: 'sombre', vue: 'vis'});
  state.base = base({med: 2000});
  assert.equal(X.facteurPour(null).factor, 0.5);
  regler({etat: 'luxe', exterieur: 'grande', vue: 'merpano', lumiere: 'lumineux', sdb: '2', epoque: '1992', dpe: 'A', etage: 6, ascenseur: 1});
  assert.ok(X.facteurPour(null).factor <= 1.6);
});
test('critère forcé le temps d\'un calcul (après travaux) puis rendu', () => {
  regler({etat: 'renover'}); state.base = base();
  const apres = X.facteurPour({etat: 'neuf', dpe: '?'}), avant = X.facteurPour(null);
  assert.ok(apres.factor > 1 && avant.factor < 1);
});

// ---------- Colocation et mobilier ----------
test('colocation : 9 m² par chambre plus les pièces communes (≈ 34 m² pour 2 chambres)', () => {
  assert.equal(X.chambresMax(33), 1); assert.equal(X.colocPossible(33), false);
  assert.equal(X.chambresMax(34), 2); assert.equal(X.colocPossible(34), true);
  assert.equal(X.chambresMax(200), 10);
  assert.deepEqual([2, 3, 4, 6].map(X.PRIME_COLOC), [0.10, 0.20, 0.30, 0.30]);
  assert.equal(X.chambresDefaut(80), 4); assert.equal(X.chambresDefaut(20), 2); assert.equal(X.chambresDefaut(300), 6);
});
test('mobilier pour louer meublé : selon la surface et la gamme', () => {
  assert.equal(X.budgetMobilier(30, 'standard'), 3800);
  assert.equal(X.budgetMobilier(30, 'eco'), 2700); assert.equal(X.budgetMobilier(30, 'haut'), 5700);
});
test('rénovation énergétique : coût au m² selon le nombre de classes gagnées, moitié dans une rénovation complète', () => {
  assert.equal(X.coutEnergie('G', 'C', 'travaux'), 375); assert.equal(X.coutEnergie('G', 'A', 'travaux'), 450);
  assert.equal(X.coutEnergie('G', 'C', 'renover'), 187.5);
  assert.equal(X.coutEnergie('C', 'C', 'travaux'), 0); assert.equal(X.coutEnergie('C', 'E', 'travaux'), 0); assert.equal(X.coutEnergie('?', 'C', 'travaux'), 0);
});

// ---------- Loyer ----------
const lignes = {t12: {loypredm2: 16, 'lwr.IPm2': 13, 'upr.IPm2': 20}, t3: {loypredm2: 12, 'lwr.IPm2': 10, 'upr.IPm2': 15}, all: {loypredm2: 14, 'lwr.IPm2': 11, 'upr.IPm2': 17}};
test('loyer au m² : 1-2 pièces à 37 m², 3 pièces à 72 m², interpolé entre les deux', () => {
  regler();
  proche(X.loyerM2(lignes, 37).m2, 16, 1e-9); proche(X.loyerM2(lignes, 72).m2, 12, 1e-9);
  const m = X.loyerM2(lignes, 50).m2; assert.ok(m < 16 && m > 12);
  proche(X.loyerM2(lignes, 20).m2, 16 * Math.pow(20 / 37, -0.35), 1e-9);    // studio : prime des petites surfaces
});
test('loyer au m² d\'une maison : indicateur 92 m², élasticité −0,15 ; pas d\'indicateur = rien', () => {
  regler({type: '111'});
  proche(X.loyerM2({maison: {loypredm2: 10, 'lwr.IPm2': 8, 'upr.IPm2': 12}}, 92).m2, 10, 1e-9);
  proche(X.loyerM2({maison: {loypredm2: 10, 'lwr.IPm2': 8, 'upr.IPm2': 12}}, 184).m2, 10 * Math.pow(2, -0.15), 1e-9);
  assert.equal(X.loyerM2({}, 92), null);
});
test('recalage : Paris 16e sur les annonces récentes, Bastia (maison) +15 %, ailleurs rien', () => {
  regler();
  proche(X.recalage('75116').f, 1 + (11.4 * 22 + 4.3 * 20) / 42 / 100, 1e-12);
  proche(X.recalage('75101').f, 1.043, 1e-12);                            // arrondissement sans données : médiane parisienne
  regler({type: '111'}); proche(X.recalage('2B033').f, 1.15, 1e-12);
  assert.equal(X.recalage('69123').f, 1);
});
const lm = {m2: 15, lo: 12, hi: 18, row: {}};
test('loyer : hors charges = charges comprises − charges estimées ; meublé +12 % (+14 % à Paris)', () => {
  regler({surf: 50}); const vide = X.calcLoyer({surf: 50}, lm, '69123', 1, 0, 1);
  proche(vide.CC, 15 * 50, 1e-9); proche(vide.HC, 750 - 2.0 * 50, 1e-9);
  regler({surf: 50, location: 'meuble'}); proche(X.calcLoyer({surf: 50}, lm, '69123', 1, 0, 1).CC, 750 * 1.12, 1e-9);
  regler({surf: 50, location: 'meuble', zone: 'paris'}); proche(X.calcLoyer({surf: 50}, lm, '75111', 1, 0, 1).CC, 750 * X.recalage('75111').f * 1.14, 1e-6);
});
test('loyer : atouts du bien atténués (élasticité 0,7), colocation avec sa prime, parking loué à part à Paris', () => {
  regler({surf: 50}); proche(X.calcLoyer({surf: 50}, lm, '69123', 1.1, 0, 1.1).qual, Math.pow(1.1, 0.7), 1e-12);
  regler({surf: 80, location: 'coloc'}); const c = X.calcLoyer({surf: 80}, lm, '69123', 1, 0, 1);
  assert.equal(c.coloc.n, 4); proche(c.CC, 15 * 80 * 1.12 * 1.30, 1e-9);
  regler({surf: 50, zone: 'paris', parking: 'box'}); assert.equal(X.calcLoyer({surf: 50}, lm, '75111', 1, 0, 1).pkM, 190);
});
test('loyer d\'un studio : les défauts d\'emplacement pèsent moitié moins', () => {
  regler({surf: 25}); const r = X.calcLoyer({surf: 25}, lm, '69123', 0.9, 0, 0.9);
  assert.equal(r.petit, true); proche(r.qual, 1 - (1 - Math.pow(0.9, 0.7)) / 2, 1e-12);
});
