// Se déconnecter juste après une modification : elle part d'abord dans le compte (l'envoi attend 0,7 s après la frappe)
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, saisir} = require('./banc');

test('modification faite juste avant la déconnexion : enregistrée dans le compte', async () => {
  const nav = await lancerNavigateur(), base = nouvelleBase(), {page, journal} = await appareil(nav, base);
  try {
    await ouvrir(page); await seConnecter(page);
    await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
    await page.click('#inv [data-a="ajout"]'); await page.waitForSelector('#inv_titre');
    await saisir(page, '#inv [data-p="nom"]', 'Studio');
    await page.waitForFunction(() => !/…/.test(document.querySelector('#inv .etat-compte').title));   // enregistré
    await saisir(page, '#inv [data-p="location.loyer"]', 777);
    await page.click('#compteStatut'); await page.click('#cpt_out');
    await page.waitForFunction(() => !COMPTE.user);
    const c = JSON.parse([...base.lignes.values()][0]);
    assert.equal(c.biens[0].location.loyer, 777);
    assert.deepEqual(journal.erreurs, []);
  } finally { await nav.close(); }
});
