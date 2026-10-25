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

test('Estimer : prix et loyer cohérents, plus de rendement affiché', async () => {
  const e = await estimer(page, {surf: 50});
  assert.ok(e.prix > 100000 && e.prix < 300000, `prix ${e.prix}`);
  assert.ok(e.loyer > 300 && e.loyer < 1200, `loyer ${e.loyer}`);
  const synth = await page.locator('#synth').innerText();
  assert.match(synth, /Prix estimé/i); assert.match(synth, /Fiabilité/i);
  assert.doesNotMatch(synth, /Rendement/i);
  assert.doesNotMatch(await page.locator('main').innerText(), /Rendement/i);
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
  assert.match(tuiles, /Mensualité/i); assert.match(tuiles, /Il te (reste|manque) par mois/i);
  assert.doesNotMatch(tuiles, /Rendement/i);                 // case retirée de Financer
  assert.doesNotMatch(tuiles, /pendant le différé/i);         // pas de différé : pas de case
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
  assert.match(await page.locator('#cf_tiles').innerText(), /Mensualité[\s\S]*pendant le différé \(\d+ mois\)/i);
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

test('Financer : prix d\'équilibre sur une seule ligne, sans champ à remplir', async () => {
  await saisir(page, '#cf_prix', 400000);
  await page.waitForFunction(() => /Prix du projet pour être à 0 € de cash-flow|reste négatif|reste positif/.test(document.getElementById('cf_cibleRes').innerText));
  assert.equal(await page.locator('#cf_cible input, #cf_cible button').count(), 0);
});

test('Financer : deux biens, un seul crédit (prix, notaire et prêt sur le total, loyers et charges de chaque bien)', async () => {
  if (await onglet() !== 'cashflow') await page.click('.tabs [data-tab="cashflow"]');
  await saisir(page, '#cf_prix', 150000); await saisir(page, '#cf_loyer', 700); await saisir(page, '#cf_apport', 0);
  const pretSeul = nombre((await page.locator('#cf_tiles').innerText()).match(/prêt de ([^,]+)/i)[1]);
  assert.match(await page.locator('#cf_titreBiens').innerText(), /^le bien$/i);
  await page.click('#cf_ajoutBien');
  const carte = page.locator('#cf_biensPlus [data-i="0"]');
  await carte.waitFor();
  assert.match(await page.locator('#cf_titreBiens').innerText(), /^les biens$/i);
  await carte.locator('[data-k="nom"]').fill('Studio du 2e');
  await saisir(page, '#cf_biensPlus [data-i="0"] [data-k="prix"]', 100000); await saisir(page, '#cf_biensPlus [data-i="0"] [data-k="loyer"]', 500);
  await page.waitForFunction(() => /Deux biens :/.test(document.getElementById('cf_alerts').innerText));
  const al = await page.locator('#cf_alerts').innerText();
  assert.match(al, /250\s000 € au total/);
  assert.match(al, /1\s200 € de loyers par mois/);
  const pret = nombre((await page.locator('#cf_tiles').innerText()).match(/prêt de ([^,]+)/i)[1]);
  assert.ok(pret - pretSeul > 100000 && pret - pretSeul < 112000, `prêt ${pret} pour ${pretSeul} avec un seul bien`);   // 2e prix, son notaire et sa garantie
  // prix d'équilibre : celui du projet entier (recalculé 150 ms après la saisie : on attend qu'il ait suivi le 2e bien)
  await page.waitForFunction(() => { const t = document.getElementById('cf_cibleRes').innerText, m = t.match(/:\s*([\d\s\u202f]+) €/); return /reste négatif|reste positif/i.test(t) || (m && +m[1].replace(/\D/g, '') > 100000); }).catch(() => {});
  { const m = (await page.locator('#cf_cibleRes').innerText()).match(/:\s*([\d\s\u202f]+) €/); if (m) assert.ok(nombre(m[1]) > 100000, `prix d'équilibre ${m[1]} sans le 2e bien`); }
  // Chaque bien a sa taxe foncière et sa copro, dans sa carte
  assert.equal(await page.locator('#cf_bien1 #cf_tf').count(), 1);
  const charges = async () => nombre((await page.locator('#cf_simple').innerText()).match(/Charges[^\n]*\n?\s*−\s*([^\n]+)/i)[1]);
  const c0 = await charges();
  await saisir(page, '#cf_biensPlus [data-i="0"] [data-k="tf"]', 1200);
  await page.waitForFunction(c => { const m = document.getElementById('cf_simple').innerText.match(/Charges[^\n]*\n?\s*−\s*([^\n]+)/i); return m && +m[1].replace(/\D/g, '') === c + 100; }, c0);
  // Le nom et les chiffres du 2e bien sont gardés avec le reste du formulaire
  const garde = await page.evaluate(() => JSON.parse(localStorage.getItem('cashflow-v1')).biensPlus[0]);
  assert.deepEqual([garde.nom, garde.prix, garde.tf], ['Studio du 2e', 100000, 1200]);
  // Retiré : plus compté
  await page.click('#cf_biensPlus [data-a="retirerBien"]');
  await page.waitForFunction(() => !/Deux biens/.test(document.getElementById('cf_alerts').innerText));
  assert.equal(await page.locator('#cf_biensPlus [data-i]').count(), 0);
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
  assert.equal(await page.locator('#s_periode').inputValue(), 'annee');
  await page.selectOption('#s_periode', 'ete');                                     // loué seulement l'été
  const ete = await page.evaluate(() => paramsSaison());
  assert.equal(ete.occupation, 27); assert.ok(ete.nuit > d.nuit);                   // moins de nuits, plus chères
  assert.match(await page.locator('#saisonRes').innerText(), /99 nuits/);
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
  assert.equal(await page.locator('#cf_periode').inputValue(), '');                // 50 % : taux saisi, pas une période
  await page.selectOption('#cf_periode', 'juilaout');
  await page.waitForFunction(() => +document.getElementById('cf_occupation').value === 15);
  assert.match(await page.locator('#cf_alerts').innerText(), /15 % d'occupation/);
  await page.fill('#cf_occupation', '50'); await page.dispatchEvent('#cf_occupation', 'input');
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
  assert.match(await page.locator('#cf_alerts').innerText(), /Loyers : .* dès le mois .* dès le mois/);
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

test('nouvelle version en ligne : la page se recharge toute seule, une fois par version', async () => {
  const lm = new Date(Date.now() + 3600e3).toUTCString();          // le serveur annonce une page plus récente que celle affichée
  await page.route(u => u.pathname === '/app/index.html', route => route.request().isNavigationRequest() ? route.fallback()
    : route.fulfill({status: 200, body: '', headers: {'last-modified': lm}}));
  await page.evaluate(() => { window.marque = 1; vuVersion = 0; verifierVersion(); });
  await page.waitForFunction(() => !window.marque);                // rechargée
  await page.waitForFunction(() => typeof COMPTE !== 'undefined' && COMPTE.pret && window.CF_APP);
  await page.evaluate(() => { window.marque = 1; vuVersion = 0; return verifierVersion(); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.marque), 1);        // déjà tenté pour cette version : pas de boucle
  await page.unrouteAll({behavior: 'ignoreErrors'});
});
