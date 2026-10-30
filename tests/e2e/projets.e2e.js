// Enregistrer une estimation dans Mes projets : doublon d'adresse signalé, surface qui diffère du financement signalée
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, saisir, cliquer} = require('./banc');

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

test('nouvelle option depuis Financer : l\'option de départ garde son nom, ses chiffres et ses réglages', async () => {
  await page.evaluate(() => { window.prompt = (m, d) => d; });   // on accepte le nom proposé
  await estimer(page, {surf: 40});
  await page.click('#est_financer'); await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await saisir(page, '#cf_prix', 200000); await saisir(page, '#cf_loyer', 900);
  await page.fill('#cf_nomProjet', 'Projet A'); await cliquer(page, '#cf_enreg');
  await page.waitForFunction(() => PROJETS.liste.some(x => x.nom === 'Projet A'));
  const photo = () => page.evaluate(() => { const x = PROJETS.liste.find(y => y.nom === 'Projet A' && !y.branche); return x && JSON.stringify({finance: x.finance, resume: x.resume}); });
  const avant = await photo();
  // Autre façon de faire : prix, travaux, taux à la main ; le nom de l'option tapé dans le champ
  await saisir(page, '#cf_prix', 180000);
  await page.evaluate(() => { document.getElementById('cf_boxProjet').open = true; });
  await saisir(page, '#cf_travaux', 30000); await saisir(page, '#cf_taux', 3.9);
  await page.fill('#cf_nomProjet', 'Option travaux');
  await cliquer(page, '#cf_enregBranche');
  await page.waitForFunction(() => PROJETS.liste.some(x => x.branche === 'Option travaux'));
  const l = await page.evaluate(() => PROJETS.liste.filter(x => x.nom === 'Projet A').map(x => x.branche || ''));
  assert.deepEqual(l.sort(), ['', 'Option travaux'], 'le projet garde son nom, l\'option a celui tapé');
  assert.equal(await photo(), avant, 'option de départ inchangée');
  await saisir(page, '#cf_duree', 25);   // l'option ouverte change encore, sans enregistrer
  assert.equal(await photo(), avant, 'option de départ toujours inchangée');
});
