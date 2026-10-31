// Parcours sans compte : Estimer (prix, loyer, location, travaux), passage vers Financer, réglages gardés, recherches récentes
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase, estimer, saisir, nombre, cliquer, versEtape, travaux} = require('./banc');

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
  assert.match(synth, /Il vaut environ/i); assert.match(synth, /Fiabilité/i);
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
  await page.click('#est_financer');                // « Financer ce bien »
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
  await travaux(page, 'renover');
  await page.waitForFunction(() => state.projet && state.projet.niveau === 'renover');
  assert.ok(await page.evaluate(() => state.projet.travaux) > 0);
  // Coût total des travaux saisi à la main : il remplace le calcul au m²
  await page.fill('#w_total', '60000'); await page.dispatchEvent('#w_total', 'change');
  await page.waitForFunction(() => state.projet && state.projet.travaux === 60000);
  assert.match(await page.locator('#works').innerText(), /montant que tu as saisi/i);
  const pj = await page.evaluate(() => state.projet);
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await page.evaluate(() => document.getElementById('cf_boxProjet').open), true);
  assert.equal(+await valeur('travaux'), pj.travaux); assert.equal(+await valeur('valeurApres'), pj.valeurApres);
  assert.equal(+await valeur('loyer'), pj.loyerApres); assert.equal(+await valeur('dureeTravaux'), pj.duree);
  assert.ok(+await valeur('differe') >= pj.duree);
  assert.match(await page.locator('#cf_tiles').innerText(), /Mensualité[\s\S]*pendant le différé \(\d+ mois\)/i);
  assert.match(await page.locator('#cf_alerts').innerText(), new RegExp(`loyer de .* à partir du mois ${pj.duree + 1}`));
});

test('Travaux + revente : scénario « Revendre », bilan de l\'opération', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await page.waitForSelector('#est_rev');
  await page.click('#est_rev');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await valeur('scenario'), 'revendre');
  await versEtape(page, '#cf_bilan'); assert.equal(await page.locator('#cf_bilan').isVisible(), true);
  const bilan = await page.locator('#cf_bilan').innerText();
  assert.match(bilan, /Marge avant impôt/i); assert.match(bilan, /Prix de revente/i);
  assert.match(await page.locator('#cf_tiles').innerText(), /Marge nette/i);
  await cliquer(page, '#cf_scen button[data-v="louer"]');
  assert.equal(await page.locator('#cf_bilan').isVisible(), false);
});

test('Financer : prix d\'équilibre sur une seule ligne, sans champ à remplir', async () => {
  await saisir(page, '#cf_prix', 400000);
  await page.waitForFunction(() => /Prix max pour être à 0 € de cash-flow|reste négatif|reste positif/.test(document.getElementById('cf_cibleRes').innerText));
  assert.equal(await page.locator('#cf_cible input, #cf_cible button').count(), 0);
});

test('Financer : deux biens, un seul crédit (prix, notaire et prêt sur le total, loyers et charges de chaque bien)', async () => {
  if (await onglet() !== 'cashflow') await page.click('.tabs [data-tab="cashflow"]');
  await saisir(page, '#cf_prix', 150000); await saisir(page, '#cf_loyer', 700); await saisir(page, '#cf_apport', 0);
  const pretSeul = nombre((await page.locator('#cf_tiles').innerText()).match(/prêt de ([^,]+)/i)[1]);
  assert.match(await page.locator('#cf_titreBiens').innerText(), /^le bien$/i);
  await cliquer(page, '#cf_ajoutBien');
  const carte = page.locator('#cf_biensPlus [data-i="0"]');
  await carte.waitFor();
  assert.match(await page.locator('#cf_titreBiens').innerText(), /^les biens$/i);
  await carte.locator('[data-k="nom"]').fill('Studio du 2e');
  await saisir(page, '#cf_biensPlus [data-i="0"] [data-k="prix"]', 100000); await saisir(page, '#cf_loyersPlus [data-i="0"] [data-k="loyer"]', 500);
  await page.waitForFunction(() => /Deux biens :/.test(document.getElementById('cf_alerts').innerText));
  const al = await page.locator('#cf_alerts').innerText();
  assert.match(al, /250\s000 € au total/);
  assert.match(al, /1\s200 € de loyers par mois/);
  const pret = nombre((await page.locator('#cf_tiles').innerText()).match(/prêt de ([^,]+)/i)[1]);
  assert.ok(pret - pretSeul > 100000 && pret - pretSeul < 112000, `prêt ${pret} pour ${pretSeul} avec un seul bien`);   // 2e prix, son notaire et sa garantie
  // prix d'équilibre : celui du projet entier (recalculé 150 ms après la saisie : on attend qu'il ait suivi le 2e bien)
  await page.waitForFunction(() => { const t = document.getElementById('cf_cibleRes').innerText, m = t.match(/cash-flow :\s*([\d\s\u202f]+) €/); return /reste négatif|reste positif/i.test(t) || (m && +m[1].replace(/\D/g, '') > 100000); }).catch(() => {});
  { const m = (await page.locator('#cf_cibleRes').innerText()).match(/cash-flow :\s*([\d\s\u202f]+) €/); if (m) assert.ok(nombre(m[1]) > 100000, `prix d'équilibre ${m[1]} sans le 2e bien`); }
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
  await cliquer(page, '#cf_biensPlus [data-a="retirerBien"]');
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
  assert.equal(ete.occupation, 80); assert.ok(ete.nuit > d.nuit);                   // taux proposé sur la période ; nuits plus chères
  assert.match(await page.locator('#saisonRes').innerText(), /98 nuits \(80 % d'occupation l'été\)/);   // 122 jours × 80 %
  await page.fill('#s_nuit', '90'); await page.dispatchEvent('#s_nuit', 'change');
  await page.fill('#s_occupation', '50'); await page.dispatchEvent('#s_occupation', 'change');
  assert.equal(await page.locator('#s_periode').inputValue(), 'ete');              // le taux saisi porte sur la période choisie
  const txt = await page.locator('#saisonRes').innerText();
  assert.match(txt, /90 € × 61 nuits/); assert.match(txt, /5\s490 €\/an/);
  assert.match(await page.locator('#synth').innerText(), /Location saisonnière/i);
});

test('saisonnier → Financer : à la nuitée, meublé forcé, recettes et fiscalité des meublés de tourisme', async () => {
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await valeur('locMode'), 'nuit'); assert.equal(+await valeur('nuit'), 90); assert.equal(+await valeur('occupation'), 50);
  assert.equal(await page.locator('#cf_periode').inputValue(), 'ete');             // 50 % de l'été, comme dans Estimer
  assert.match(await page.locator('#cf_saisonHint').innerText(), /61 nuits par an : 50 % d'occupation l'été/);
  await saisir(page, '#cf_periode', 'juilaout');
  await page.waitForFunction(() => +document.getElementById('cf_occupation').value === 90);   // taux proposé pour la période
  assert.match(await page.locator('#cf_alerts').innerText(), /90 % d'occupation en juillet et août \(56 nuits/);
  await saisir(page, '#cf_occupation', 50);
  assert.match(await page.locator('#cf_saisonHint').innerText(), /31 nuits par an/);   // 62 jours × 50 %
  assert.equal(await valeur('meuble'), '1'); assert.equal(await page.locator('#cf_meuble').isDisabled(), true);
  assert.match(await page.locator('#cf_alerts').innerText(), /Location saisonnière : 90 € la nuit/);
  await cliquer(page, '#cf_boxImpots summary');
  await page.waitForFunction(() => /Meublé de tourisme non classé/.test(document.getElementById('cf_alerts').innerText), null, {timeout: 3000});
  await cliquer(page, '#cf_locSeg button[data-v="mois"]');
  assert.equal(await page.locator('#cf_meuble').isDisabled(), false);
  await versEtape(page, '#cf_loyer'); assert.equal(await page.locator('#cf_loyer').isVisible(), true);
  await cliquer(page, '#cf_boxImpots summary');
});

test('aménager une surface en plus (logement à part) : chaque logement estimé, 2 loyers dans Financer', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await page.click('#louer button[data-v="vide"]');
  await estimer(page, {surf: 60});
  await travaux(page, 'amenager');
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
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('travaux'), 50000);
  assert.equal(+await valeur('loyer'), pj.loyers[0]); assert.equal(+await valeur('loyer2'), pj.loyers[1]);
  assert.equal(+await valeur('debutLoyer2'), pj.duree + 1);
  assert.match(await page.locator('#cf_alerts').innerText(), /Loyers : .* dès le mois .* dès le mois/);
});

test('garage aménagé en chambre : loyer après travaux estimé, loué en l\'état avant, travaux lancés au mois 25', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'amenager');
  await page.selectOption('#w_usage', 'agrandir');
  await page.selectOption('#w_type', 'autre');
  await page.fill('#w_total', ''); await page.dispatchEvent('#w_total', 'change');
  await page.fill('#w_m2', '15'); await page.dispatchEvent('#w_m2', 'change');
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.lots === 1 && state.projet.niveau === 'amenager', null, {timeout: 30000});
  const pj = await page.evaluate(() => state.projet), avant = await page.evaluate(() => Math.round(state.loyerHC));
  assert.ok(pj.loyerApres > avant);                                // une chambre en plus : le loyer monte
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('loyer'), pj.loyerApres);
  assert.ok(+await valeur('loyerAvant') > 0);
  assert.equal(await page.locator('#cf_loueChantier').isChecked(), true);
  assert.equal(await page.locator('#cf_loyerLib').textContent(), 'Loyer après travaux (€/mois)');
  await page.evaluate(() => { const d = document.getElementById('cf_differe'); d.value = 36; d.dispatchEvent(new Event('input', {bubbles: true})); });   // réglage replié
  await saisir(page, '#cf_debutTravaux', 25);
  assert.equal(+await valeur('differe'), 36);                      // le différé choisi ne bouge pas
  assert.match(await page.locator('#cf_alerts').innerText(), new RegExp(`Travaux du mois 25 au mois ${24 + pj.duree}`));
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'non');
});

test('diviser en 3 logements : surfaces modifiables, coûts par logement, 3 loyers (dont 2 en 2e loyer)', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'diviser');
  await page.selectOption('#w_nb', '3');
  assert.equal(await page.locator('[data-lot]').count(), 3);
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.lots === 3, null, {timeout: 40000});
  const pj = await page.evaluate(() => state.projet);
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await valeur('loyer2'), pj.loyers[1] + pj.loyers[2]);
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'non');
});

test('diviser en 2 et rattacher le garage à un logement, travaux au mois 25 : loué en l\'état avant, 2 loyers après', async () => {
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'diviser');
  await page.selectOption('#w_nb', '2');
  await page.fill('[data-lot="0"]', '40'); await page.dispatchEvent('[data-lot="0"]', 'change');
  await page.fill('[data-lot="1"]', '30'); await page.dispatchEvent('[data-lot="1"]', 'change');
  await page.fill('#w_divM2', '15'); await page.dispatchEvent('#w_divM2', 'change');
  assert.equal(await page.locator('#w_divLot').inputValue(), '0');
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.lots === 2, null, {timeout: 40000});
  assert.match(await page.locator('#works').innerText(), /Garage rattaché au logement 1/);
  const pj = await page.evaluate(() => state.projet), lots = await page.evaluate(() => state.calcProjet.lots);
  assert.equal(lots[0].surf, 55); assert.equal(pj.duree, 8);
  assert.ok(pj.loyers[0] > pj.loyers[1]);                           // le logement avec le garage se loue plus cher
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.ok(+await valeur('loyerAvant') > 0);
  await saisir(page, '#cf_debutTravaux', 25);
  assert.equal(+await valeur('debutLoyer2'), 24 + 8 + 1);           // le studio est loué à la fin du chantier
  assert.match(await page.locator('#cf_alerts').innerText(), /Travaux du mois 25 au mois 32 : loué .* en l'état jusqu'au mois 24/);
  await page.click('.tabs [data-tab="estimation"]');
  await page.fill('#w_divM2', ''); await page.dispatchEvent('#w_divM2', 'change');
  await travaux(page, 'non');
});

test('Financer en 4 étapes : loyers par période (avant, pendant, après travaux), différé, résultat en périodes', async () => {
  if (await onglet() !== 'cashflow') await page.click('.tabs [data-tab="cashflow"]');
  while (await page.locator('#cf_biensPlus [data-a="retirerBien"]').count()) await cliquer(page, '#cf_biensPlus [data-a="retirerBien"] >> nth=0');   // tests d'avant : un seul bien
  await saisir(page, '#cf_loyer2', 0);
  await cliquer(page, '#cf_etapes button[data-etape="2"]');
  assert.equal(await page.locator('#cf_loyers').isVisible(), true);
  assert.equal(await page.locator('#cf_tiles').isVisible(), false);                // le résultat est à l'étape 4
  if (!await page.evaluate(() => document.getElementById('cf_boxProjet').open)) await cliquer(page, '#cf_travauxSeg button[data-v="1"]');
  await page.waitForFunction(() => !document.getElementById('cf_loyers').classList.contains('sans-travaux'));
  await saisir(page, '#cf_travaux', 30000); await saisir(page, '#cf_debutTravaux', 25); await saisir(page, '#cf_dureeTravaux', 3);
  await saisir(page, '#cf_loyerAvant', 750); await saisir(page, '#cf_loyer', 1000);
  await saisir(page, '#cf_differe', 36);
  assert.match(await page.locator('#cf_colPendant').innerText(), /mois 25 à 27/);
  // Chaque case se modifie : pendant le chantier, pas loué par défaut ; un loyer tapé remplace la règle, « comme avant » y revient
  const p1 = '#cf_loyers [data-per="l1:pendant"]', tot = async c => page.locator('#cf_tot' + c).innerText();
  assert.equal(await page.inputValue(p1), ''); assert.equal(await page.locator(p1).getAttribute('placeholder'), 'pas loué');
  assert.equal(await page.locator('#cf_loyers [data-herit="l1:pendant"]').isVisible(), false);
  await saisir(page, p1, 600);
  assert.match(await tot('Pendant'), /600 €/);
  await cliquer(page, '#cf_loyers [data-herit="l1:pendant"]');
  assert.equal(await page.inputValue(p1), ''); assert.doesNotMatch(await tot('Pendant'), /600/);
  // Projet où le bien reste loué pendant le chantier (fait depuis Estimer) : la case montre le loyer d'avant, en gris
  await page.evaluate(() => { const c = document.getElementById('cf_loueChantier'); c.checked = true; c.dispatchEvent(new Event('input', {bubbles: true})); });
  assert.equal(await page.inputValue(p1), '750'); assert.equal(await page.locator(p1).evaluate(e => e.classList.contains('herite')), true);
  assert.match(await tot('Pendant'), /750 €/);
  assert.match(await page.locator('#cf_totApres').innerText(), /1\s000 €/);
  assert.match(await page.locator('#cf_calendrier').innerText(), /Différé du crédit : mois 1 à 36/);
  // Un logement loué à part : une ligne de plus, loué à la fin du chantier
  await cliquer(page, '#cf_ajoutL2');
  await saisir(page, '#cf_loyer2', 400);
  assert.equal(+await valeur('debutLoyer2'), 28);
  assert.match(await page.locator('#cf_totApres').innerText(), /1\s400 €/);
  // Le logement à part avant les travaux : pas loué par défaut, loué 300 € si on le tape, de nouveau pas loué si on vide la case
  const l2a = '#cf_loyers [data-per="l2:avant"]';
  assert.equal(await page.inputValue(l2a), '');
  await saisir(page, l2a, 300);
  assert.match(await tot('Avant'), /1\s050 €/);
  await saisir(page, l2a, '');
  assert.match(await tot('Avant'), /^750 €/);
  assert.equal(await page.locator('#cf_loyers [data-herit="l2:avant"]').isVisible(), true);    // vidée à la main : « comme avant » reste proposé
  await cliquer(page, '#cf_loyers [data-herit="l2:avant"]');
  // À la nuitée pour le logement à part seulement : le bien garde son loyer au mois
  await cliquer(page, '#cf_locSeg button[data-v="nuit"]');
  assert.equal(await page.locator('#cf_nuitSur').isVisible(), true);
  await saisir(page, '#cf_nuitSur', '2');
  assert.equal(await page.locator('#cf_loyer').isVisible(), true); assert.equal(await page.locator('#cf_loyer2').isVisible(), false);
  assert.match(await page.locator('#cf_nuitL2').innerText(), /par mois à la nuitée/);
  await saisir(page, '#cf_nuitSur', '1');
  assert.equal(await page.locator('#cf_loyer').isVisible(), false); assert.match(await page.locator('#cf_nuitL1').innerText(), /par mois à la nuitée/);
  await cliquer(page, '#cf_locSeg button[data-v="mois"]');
  // Étape 3 : ce qu'on paie, période par période
  await cliquer(page, '#cf_etapes button[data-etape="3"]');
  assert.match(await page.locator('#cf_mensPeriodes').innerText(), /Mois 1 à 24[\s\S]*Mois 25 à 36[\s\S]*Dès le mois 37/);
  // Étape 4 : avant, pendant, après les travaux, puis le rythme de croisière
  await cliquer(page, '#cf_suivant');
  assert.equal(await page.locator('#cf_tiles').isVisible(), true);
  assert.deepEqual(await page.locator('#cf_simple .phase .t').allTextContents(), ['Avant travaux', 'Pendant les travaux', 'Après travaux', 'Rythme de croisière']);
  assert.match(await page.locator('#cf_tete').innerText(), /dès le mois 37[\s\S]*Pendant les 36 mois du différé/i);
  // Rangement
  await cliquer(page, '#cf_retirerL2');
  assert.equal(+await valeur('loyer2'), 0);
  await cliquer(page, '#cf_travauxSeg button[data-v="0"]');
  await cliquer(page, '#cf_differeSeg button[data-v="0"]');
  assert.equal(+await valeur('differe'), 0);
});

test('plus de mode Simple : un ancien réglage « simple » est effacé, Estimer montre tous les critères et tout le calcul', async () => {
  const autre = await appareil(nav, nouvelleBase());
  const p = autre.page;
  await p.context().addInitScript(() => { if (!sessionStorage.getItem('vu')) { sessionStorage.setItem('vu', '1'); localStorage.setItem('mode-affichage', 'simple'); localStorage.setItem('achat-simple', '{"apport":5000,"duree":25}'); } });
  try {
    await ouvrir(p);
    assert.equal(await p.locator('.tabs .mode, [data-mode]').count(), 0, 'plus d\'interrupteur Simple / Pro');
    assert.equal(await p.evaluate(() => document.body.classList.contains('simple')), false);
    assert.deepEqual(await p.evaluate(() => [localStorage.getItem('mode-affichage'), localStorage.getItem('achat-simple')]), [null, null]);
    await estimer(p, {surf: 60});
    for (const id of ['etat', 'dpe', 'etage', 'ascenseur', 'exterieur'])
      assert.ok(await p.locator(`#crit > div:has(#c_${id})`).isVisible(), `critère ${id} visible`);
    assert.ok(await p.locator('#estim details.plus').isVisible(), 'plus de critères');
    assert.ok(await p.locator('#estim details.detail').isVisible(), 'le calcul détaillé');
    assert.equal(await p.locator('#estAchat').count(), 0);
    assert.equal(await p.locator('#works [data-niveau]').count(), 7, 'les sept projets de travaux');
    assert.equal(await p.locator('#louer button[data-v="coloc"]').count(), 1, 'la colocation reste proposée');
    assert.deepEqual(autre.journal.erreurs, []);
  } finally { await p.context().close(); }
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
