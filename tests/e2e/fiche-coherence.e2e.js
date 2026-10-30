// Mon patrimoine, fiche d'un bien : montants jamais négatifs, vacance plafonnée, dates qui se contredisent refusées
// (vendu avant d'être acheté, construction finie avant d'avoir commencé…), avec un message sous le champ
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase} = require('./banc');

let nav, page, journal;
test.before(async () => {
  nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page); await seConnecter(page);
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
  await page.click('#inv [data-a="ajout"]'); await page.waitForSelector('#inv_titre');
});
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const taper = (chemin, v) => page.evaluate(([c, v]) => { const e = document.querySelector(`#inv [data-p="${c}"]`); e.value = v; e.dispatchEvent(new Event('change', {bubbles: true})); }, [chemin, String(v)]);
const valeur = chemin => page.locator(`#inv [data-p="${chemin}"]`).inputValue();
const message = () => page.locator('#inv .aide.corr').allInnerTexts().then(l => l.join(' '));

test('montants négatifs ramenés à 0, vacance à 12 mois au plus', async () => {
  await taper('location.loyer', -500);
  assert.equal(await valeur('location.loyer'), '0'); assert.match(await message(), /Ramené à 0/);
  await taper('location.vacance', 15);
  assert.equal(await valeur('location.vacance'), '12');
});

test('dates : vendu avant d\'être acheté, achat après la vente : refusés', async () => {
  await taper('achat.date', '2020-05');
  await page.click('#inv [data-a="vente"]');
  await taper('vente.mois', '2019-01');
  assert.equal(await valeur('vente.mois'), '', 'date refusée, l\'ancienne revient');
  assert.match(await message(), /Vendu avant d'être acheté \? L'achat date de mai 2020/);
  await taper('vente.mois', '2024-06');
  assert.equal(await valeur('vente.mois'), '2024-06');
  await taper('achat.date', '2025-01');
  assert.equal(await valeur('achat.date'), '2020-05');
  assert.match(await message(), /Acheté après la vente \(juin 2024\)/);
});

test('maison construite : travaux pas avant l\'achat du terrain, fin pas avant le début', async () => {
  await page.click('#inv [data-a="venteAnnuler"]').catch(() => {});
  await page.evaluate(() => { const e = document.querySelector('#inv [data-p="achat.mode"]'); e.value = 'construction'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await page.waitForSelector('#inv [data-p="achat.debutTravaux"]');
  await taper('achat.debutTravaux', '2019-01');
  assert.equal(await valeur('achat.debutTravaux'), '');
  assert.match(await message(), /avant l'achat du terrain \(mai 2020\)/);
  await taper('achat.debutTravaux', '2021-03');
  await taper('achat.finTravaux', '2020-12');
  assert.equal(await valeur('achat.finTravaux'), '');
  assert.match(await message(), /ne peut pas finir avant d'avoir commencé \(mars 2021\)/);
  await taper('achat.finTravaux', '2022-02');
  assert.equal(await valeur('achat.finTravaux'), '2022-02');
});
