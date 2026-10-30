// Estimer, « Un projet de travaux ? » : les travaux ne réparent que ce qu'ils couvrent. Un bien à rénover entièrement
// qu'on rafraîchit reste un bien à gros travaux ; « Énergie seule » sans rien à améliorer ne crée pas de chantier
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase, estimer, travaux} = require('./banc');

let nav, page, journal;
test.before(async () => { nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const projet = () => page.evaluate(() => state.projet && {valeur: state.projet.valeurApres, loyer: state.projet.loyerApres, duree: state.projet.duree});
const aide = () => page.locator('#works .hint.seul-pro').first().innerText();

test('bien à rénover entièrement : rafraîchir < gros travaux < rénovation complète, et l\'état obtenu est dit', async () => {
  await estimer(page, {surf: 60, details: {etat: 'renover', dpe: 'D'}});
  await travaux(page, 'rafraichir'); const raf = await projet();
  assert.match(await aide(), /Après ces travaux : gros travaux.*il restera des travaux à faire/);
  await travaux(page, 'travaux'); const gros = await projet();
  assert.match(await aide(), /Après ces travaux : à rafraîchir/);
  await travaux(page, 'renover'); const reno = await projet();
  assert.match(await aide(), /Après ces travaux : refait à neuf/);
  assert.ok(raf.valeur < gros.valeur && gros.valeur < reno.valeur, `valeurs ${raf.valeur} < ${gros.valeur} < ${reno.valeur}`);
  assert.ok(raf.loyer <= gros.loyer && gros.loyer <= reno.loyer);
});

test('bien en bon état : un rafraîchissement n\'en fait pas un bien refait à neuf', async () => {
  await estimer(page, {surf: 60, details: {etat: 'bon', dpe: 'D'}});
  const prix = await page.evaluate(() => Math.round(state.prix));
  await travaux(page, 'rafraichir');
  assert.equal((await projet()).valeur, prix);
  assert.match(await aide(), /Après ces travaux : bon état/);
});

test('énergie seule avec un DPE inconnu : rien à chiffrer, pas de chantier ni de bouton « Travaux + »', async () => {
  await estimer(page, {surf: 60, details: {etat: 'bon', dpe: '?'}});
  await travaux(page, 'aucun');
  assert.equal(await projet(), null);
  assert.match(await page.locator('#works').innerText(), /Rien à chiffrer sur l'énergie sans le DPE/);
  assert.equal(await page.locator('#est_financer').count(), 1, 'bouton « Financer ce bien »');
});
