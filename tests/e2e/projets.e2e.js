// Enregistrer une estimation dans Mes projets : doublon d'adresse signalé, surface qui diffère du financement signalée
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer} = require('./banc');

let nav, page, journal;
test.before(async () => { nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page); await seConnecter(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const message = () => page.locator('#est_msg').innerText();

test('mise à jour d\'une estimation : la surface qui n\'est plus celle du financement est signalée', async () => {
  await estimer(page, {surf: 50});
  await page.click('#est_enreg');
  await page.waitForFunction(() => PROJETS.liste.length === 1);
  await estimer(page, {surf: 60});
  await page.waitForTimeout(1000);   // la saisie de la surface relance une estimation (400 ms) qui réécrit la barre
  await page.click('#est_maj');
  assert.match(await message(), /Estimation mise à jour/);
  assert.match(await message(), /surface \(60 m²\) n'est pas celle du financement \(50 m²\)/);
  assert.equal(await page.evaluate(() => PROJETS.liste.length), 1, 'le projet est mis à jour, pas dupliqué');
});

test('enregistrer une adresse qui a déjà un projet : un message le dit et explique comment comparer', async () => {
  await page.click('#est_nouveau');
  await estimer(page, {surf: 50});
  await page.click('#est_enreg');
  await page.waitForFunction(() => PROJETS.liste.length === 2);
  assert.match(await message(), /Tu as déjà un projet à cette adresse/);
  assert.match(await message(), /Déplacer dans un projet/);
});
