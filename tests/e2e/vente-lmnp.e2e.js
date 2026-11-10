// Mon patrimoine, « Si je vends ce bien » loué meublé : au réel (LMNP), les amortissements de l'immeuble s'ajoutent à la
// plus-value (loi de finances 2025) ; en micro-BIC ou en résidence étudiants/seniors, non
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, cliquer} = require('./banc');

let nav, page, journal;
test.before(async () => {
  nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page); await seConnecter(page);
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
  await cliquer(page, '#inv [data-a="ajout"]'); await page.waitForSelector('#inv_titre');
});
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const taper = (chemin, v) => page.evaluate(([c, v]) => { const e = document.querySelector(`#inv [data-p="${c}"]`); e.value = v; e.dispatchEvent(new Event('change', {bubbles: true})); }, [chemin, String(v)]);
const resultat = () => page.locator('#inv_venteRes').innerText();
const impots = async () => +((await resultat()).match(/Impôts\s*([\d\s]+)\s€/i) || [, ''])[1].replace(/\s/g, '');

test('vente d\'un meublé : réel par défaut avec amortissements réintégrés, micro-BIC sans', async () => {
  await taper('achat.date', '2015-01'); await taper('achat.prix', 200000);
  await page.evaluate(() => document.querySelector('#inv .sous-fiche [data-ong="location"]').click());
  await taper('location.statut', 'meuble');
  await cliquer(page, '#inv [data-a="vente"]');
  await taper('vente.prix', 300000); await taper('vente.mois', '2026-10');
  await page.waitForSelector('#inv [data-p="location.regime"]', {state: 'attached'});
  assert.match(await resultat(), /Amortissements réintégrés\s*62\s?333\s€\s\(estimés\)/i);   // 85 % de 200 000 € sur 30 ans, 11 ans
  const reel = await impots();
  await page.locator('#inv [data-cible="inv_location_regime"][data-v="micro"]').click();
  await page.waitForFunction(() => !/Amortissements réintégrés/i.test(document.getElementById('inv_venteRes').innerText));
  assert.equal(await page.locator('#inv [data-p="vente.amort"]').count(), 0);
  assert.ok(await impots() < reel, 'micro-BIC : moins d\'impôt à la vente');
  // Montant relevé par le comptable
  await page.locator('#inv [data-cible="inv_location_regime"][data-v=""]').click();
  await page.waitForSelector('#inv [data-p="vente.amort"]');
  await taper('vente.amort', 40000);
  assert.match(await resultat(), /Amortissements réintégrés\s*40\s?000\s€(?!\s\(estimés)/i);
});
