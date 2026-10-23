// Parcours sans compte : Estimer (prix, loyer, location, travaux), passage vers Financer, réglages gardés, recherches récentes
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase, estimer, saisir, nombre} = require('./banc');

let nav, page, journal;
test.before(async () => { nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });
const onglet = () => page.evaluate(() => document.body.dataset.onglet);
const valeur = id => page.evaluate(id => document.getElementById('cf_' + id).value, id);

test('sans compte : arrivée sur Estimer, Mon patrimoine et Mes projets fermés (même par l\'adresse)', async () => {
  assert.equal(await onglet(), 'estimation');
  assert.equal(await page.locator('.tabs [data-tab="investissements"]').isVisible(), false);
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.waitForFunction(() => document.body.dataset.onglet === 'estimation');
  await page.evaluate(() => { location.hash = '#projets'; });
  await page.waitForFunction(() => document.body.dataset.onglet === 'estimation');
});

test('Estimer : prix, loyer et rendement cohérents entre eux', async () => {
  const e = await estimer(page, {surf: 50});
  assert.ok(e.prix > 100000 && e.prix < 300000, `prix ${e.prix}`);
  assert.ok(e.loyer > 300 && e.loyer < 1200, `loyer ${e.loyer}`);
  const synth = await page.locator('#synth').innerText();
  assert.match(synth, /Prix estimé/i); assert.match(synth, /Fiabilité/i);
  const rdt = nombre(synth.match(/RENDEMENT BRUT\s+([\d,]+ %)/i)[1]);
  assert.ok(Math.abs(rdt - e.loyer * 12 / e.prix * 100) < 0.06, `rendement affiché ${rdt}`);
});

test('Estimer : DPE G = prix décoté et « non louable » ; meublé = loyer plus haut et mobilier', async () => {
  const ref = await estimer(page, {surf: 50});
  const g = await estimer(page, {surf: 50, details: {dpe: 'G'}});
  assert.ok(g.prix < ref.prix * 0.95);
  assert.match(await page.locator('#synth').innerText(), /Non louable/);
  await estimer(page, {surf: 50, details: {dpe: '?'}});
  await page.click('#louer button[data-v="meuble"]');
  await page.waitForFunction(r => state.loyerHC > r * 1.05, ref.loyer);
  const m = await page.evaluate(() => ({loyer: state.loyerHC, mob: state.mob}));
  assert.ok(m.mob > 0);
  await page.click('#louer button[data-v="vide"]');
  await page.waitForFunction(r => Math.abs(state.loyerHC - r) < 1, ref.loyer);
});

test('Estimer : colocation impossible sous 34 m², loyer par chambre au-dessus', async () => {
  await estimer(page, {surf: 30});
  assert.equal(await page.locator('#louer button[data-v="coloc"]').isDisabled(), true);
  const e = await estimer(page, {surf: 80});
  await page.click('#louer button[data-v="coloc"]');
  await page.waitForFunction(r => state.loyerHC > r * 1.2, e.loyer);
  assert.match(await page.locator('#synth').innerText(), /4 chambres/);
  await page.click('#louer button[data-v="vide"]');
});

test('Estimer → Financer : le bien estimé est repris (prix, loyer, surface), un achat simple', async () => {
  const e = await estimer(page, {surf: 45});
  await page.click('#works button.cta');                // « Financer ce bien »
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('prix'), Math.round(e.prix)); assert.equal(+await valeur('loyer'), Math.round(e.loyer));
  assert.equal(+await valeur('surf'), 45);
  assert.equal(await page.evaluate(() => document.getElementById('cf_boxProjet').open), false);
  assert.match(await page.locator('#cf_bien').innerText(), /prix estimé/);
  const tuiles = await page.locator('#cf_tiles').innerText();
  assert.match(tuiles, /Mensualité/i); assert.match(tuiles, /Cash-flow/i);
});

test('Financer : un réglage fait à la main n\'est pas écrasé en revenant sur l\'onglet, et survit au rechargement', async () => {
  await saisir(page, '#cf_apport', 30000);
  await saisir(page, '#cf_duree', 25);
  await page.click('.tabs [data-tab="estimation"]');
  await page.click('.tabs [data-tab="cashflow"]');
  assert.equal(+await valeur('apport'), 30000);
  await page.reload(); await ouvrir(page, '#cashflow');
  assert.equal(+await valeur('apport'), 30000); assert.equal(+await valeur('duree'), 25);
  const t = await valeur('taux');
  assert.ok(+t > 3 && +t < 4, `taux ${t}`);           // taux du marché sur 25 ans
});

test('Estimer « rénovation complète » → « Travaux + location » : travaux, valeur et loyer après travaux, différé', async () => {
  await estimer(page, {surf: 50, details: {etat: 'renover'}});
  await page.selectOption('#w_niveau', 'renover');
  await page.waitForFunction(() => state.projet && state.projet.niveau === 'renover');
  assert.ok(await page.evaluate(() => state.projet.travaux) > 0);
  // Coût total des travaux saisi à la main : il remplace le calcul au m²
  await page.fill('#w_total', '60000'); await page.dispatchEvent('#w_total', 'change');
  await page.waitForFunction(() => state.projet && state.projet.travaux === 60000);
  assert.match(await page.locator('#works').innerText(), /montant que tu as saisi/i);
  const pj = await page.evaluate(() => state.projet);
  await page.click('#works button.cta >> nth=0');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await page.evaluate(() => document.getElementById('cf_boxProjet').open), true);
  assert.equal(+await valeur('travaux'), pj.travaux); assert.equal(+await valeur('valeurApres'), pj.valeurApres);
  assert.equal(+await valeur('loyer'), pj.loyerApres); assert.equal(+await valeur('dureeTravaux'), pj.duree);
  assert.ok(+await valeur('differe') >= pj.duree);
  assert.match(await page.locator('#cf_alerts').innerText(), new RegExp(`loyer à partir du mois ${pj.duree + 1}`));
});

test('Travaux + revente : scénario « Revendre », bilan de l\'opération', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await page.waitForFunction(() => document.querySelector('#works .row'));
  await page.click('#works .row button.cta >> nth=1');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await valeur('scenario'), 'revendre');
  assert.equal(await page.locator('#cf_bilan').isVisible(), true);
  const bilan = await page.locator('#cf_bilan').innerText();
  assert.match(bilan, /Marge avant impôt/i); assert.match(bilan, /Prix de revente/i);
  assert.match(await page.locator('#cf_tiles').innerText(), /Marge nette/i);
  await page.click('#cf_scen button[data-v="louer"]');
  assert.equal(await page.locator('#cf_bilan').isVisible(), false);
});

test('Financer : prix d\'équilibre affiché et « Mettre ce prix » l\'applique', async () => {
  await saisir(page, '#cf_prix', 400000);
  await page.waitForFunction(() => /il faudrait acheter|aucun prix|pas un frein/.test(document.getElementById('cf_cibleRes').innerText));
  const btn = page.locator('#cf_cibleUtiliser');
  if (await btn.count()) {
    const prix = +await btn.getAttribute('data-prix');
    await btn.click();
    assert.equal(+await valeur('prix'), prix);
  }
});

test('sans compte : enregistrer un projet propose de se connecter', async () => {
  assert.equal(await page.locator('#cf_saveInvite').isVisible(), true);
  assert.equal(await page.locator('#cf_saveForm').isVisible(), false);
  await page.click('.tabs [data-tab="estimation"]');
  assert.match(await page.locator('#sauveEst').innerText(), /Se connecter pour enregistrer/);
});

test('recherches récentes : gardées sur l\'appareil, reprises d\'un clic, supprimables', async () => {
  await page.waitForFunction(() => RECENTES.liste.length > 0, null, {timeout: 5000});
  await page.reload(); await ouvrir(page, '#estimation');
  await page.click('#recentesBtn');
  assert.ok(await page.locator('#recentes button.rec').count() >= 1);
  await page.evaluate(() => { state.loyerHC = null; });
  await page.click('#recentes button.rec >> nth=0');
  await page.waitForFunction(() => state.base && state.loyerHC != null, null, {timeout: 20000});
  await page.click('#recentesBtn');
  const n = await page.locator('#recentes button.rec-x').count();
  await page.click('#recentes button.rec-x >> nth=0');
  assert.equal(await page.evaluate(() => RECENTES.liste.length), n - 1);
});

test('garage seul (type « Garage ») : estimé à l\'unité, sans surface', async () => {
  await page.click('#type button[data-v="13"]');
  await page.fill('#addr', 'rue de la République Lyon');
  await page.click('#go');
  await page.waitForFunction(() => /Valeur estimée/i.test(document.getElementById('out').innerText), null, {timeout: 20000});
  const v = nombre((await page.locator('#out .kpi .v').first().innerText()));
  assert.ok(v >= 10 && v <= 25, `valeur ${v} k€`);
  assert.equal(await page.locator('#surf').isVisible(), false);
  await page.click('#type button[data-v="121"]');
});

test('service des ventes en panne : message clair, pas de plantage', async () => {
  const nav2 = await lancerNavigateur();
  try {
    const {page: p, journal: j} = await appareil(nav2, nouvelleBase(), {reseau: {dvfEnPanne: true}});
    await ouvrir(p, '#estimation');
    await p.fill('#addr', 'rue de la République Lyon'); await p.fill('#surf', '50'); await p.click('#go');
    await p.waitForFunction(() => /ne répond pas/.test(document.getElementById('out').innerText), null, {timeout: 20000});
    assert.deepEqual(j.erreurs, []);
  } finally { await nav2.close(); }
});

test('location saisonnière dans Estimer : recettes à la nuitée, frais, comparaison au meublé', async () => {
  const e = await estimer(page, {surf: 40, details: {etat: 'bon', dpe: '?'}});   // le bien des tests précédents était « à rénover »
  await page.click('#louer button[data-v="saison"]');
  await page.waitForSelector('#saison:not([hidden]) #saisonRes .kpis');
  const d = await page.evaluate(() => ({nuit: paramsSaison().nuit, meuble: state.loyerHC}));
  assert.ok(d.meuble > e.loyer);                                                   // base : le loyer meublé
  assert.equal(d.nuit, Math.max(20, Math.round(d.meuble / 9 / 5) * 5));            // point de départ : loyer meublé ÷ 9
  await page.fill('#s_nuit', '90'); await page.dispatchEvent('#s_nuit', 'change');
  await page.fill('#s_occupation', '50'); await page.dispatchEvent('#s_occupation', 'change');
  const txt = await page.locator('#saisonRes').innerText();
  assert.match(txt, /90 € × 183 nuits/); assert.match(txt, /16\s425 €\/an/);
  assert.match(await page.locator('#synth').innerText(), /Location saisonnière/i);
});

test('saisonnier → Financer : à la nuitée, meublé forcé, recettes et fiscalité des meublés de tourisme', async () => {
  await page.click('#saison .row button.cta');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await valeur('locMode'), 'nuit'); assert.equal(+await valeur('nuit'), 90); assert.equal(+await valeur('occupation'), 50);
  assert.equal(await valeur('meuble'), '1'); assert.equal(await page.locator('#cf_meuble').isDisabled(), true);
  assert.match(await page.locator('#cf_alerts').innerText(), /Location saisonnière : 90 € la nuit/);
  await page.click('#cf_boxImpots summary');
  await page.waitForFunction(() => /Meublé de tourisme non classé/.test(document.getElementById('cf_alerts').innerText), null, {timeout: 3000});
  await page.click('#cf_locSeg button[data-v="mois"]');
  assert.equal(await page.locator('#cf_meuble').isDisabled(), false);
  assert.equal(await page.locator('#cf_loyer').isVisible(), true);
  await page.click('#cf_boxImpots summary');
});

test('aménager une surface en plus (logement à part) : chaque logement estimé, 2 loyers dans Financer', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await page.click('#louer button[data-v="vide"]');
  await estimer(page, {surf: 60});
  await page.selectOption('#w_niveau', 'amenager');
  await page.selectOption('#w_usage', 'lot');
  await page.fill('#w_m2', '30'); await page.dispatchEvent('#w_m2', 'change');
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.loyers, null, {timeout: 30000});
  const pj = await page.evaluate(() => state.projet);
  assert.equal(pj.loyers.length, 2); assert.ok(pj.loyers[1] > 0 && pj.loyers[1] < pj.loyers[0]);
  assert.equal(pj.travaux, Math.round((30 * 1500 + 11000 + 3000) / 500) * 500);   // sous-sol 1 500 €/m², cuisine et compteurs, architecte
  // Coût total saisi à la main : il remplace l'estimation, sans relancer l'estimation des logements
  await page.fill('#w_total', '50000'); await page.dispatchEvent('#w_total', 'change');
  await page.waitForFunction(() => state.projet && state.projet.travaux === 50000);
  assert.deepEqual(await page.evaluate(() => state.projet.loyers), pj.loyers);
  assert.match(await page.locator('#works').innerText(), /montant que tu as saisi/i);
  await page.click('#works .row button.cta >> nth=0');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('travaux'), 50000);
  assert.equal(+await valeur('loyer'), pj.loyers[0]); assert.equal(+await valeur('loyer2'), pj.loyers[1]);
  assert.equal(+await valeur('debutLoyer2'), pj.duree + 1);
  assert.match(await page.locator('#cf_alerts').innerText(), /Deux loyers/);
});

test('diviser en 3 logements : surfaces modifiables, coûts par logement, 3 loyers (dont 2 en 2e loyer)', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await page.selectOption('#w_niveau', 'diviser');
  await page.selectOption('#w_nb', '3');
  assert.equal(await page.locator('[data-lot]').count(), 3);
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.lots === 3, null, {timeout: 40000});
  const pj = await page.evaluate(() => state.projet);
  await page.click('#works .row button.cta >> nth=0');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('loyer2'), pj.loyers[1] + pj.loyers[2]);
  await page.click('.tabs [data-tab="estimation"]');
  await page.selectOption('#w_niveau', 'non');
});
