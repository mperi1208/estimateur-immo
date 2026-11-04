// Projet à une seule option : une ligne fine (nom, ce qu'il donne, risque) ; la toucher déplie chiffres et boutons, et ça reste gardé
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, cliquer} = require('./banc');

test('projet seul : fin et plié, déplié au toucher, replié au second toucher', async () => {
  const nav = await lancerNavigateur(), {page, journal} = await appareil(nav, nouvelleBase(), {cartesPliees: true});
  try {
    await ouvrir(page); await seConnecter(page); await estimer(page, {surf: 40});
    await page.evaluate(() => { window.prompt = (m, d) => d; financerBien(); CF_APP.etape(4); document.getElementById('cf_save').classList.add('ouvert'); });
    await page.fill('#cf_nomProjet', 'Studio fin'); await cliquer(page, '#cf_enreg');
    await page.waitForFunction(() => PROJETS.liste.length === 1);
    await page.evaluate(() => { aNavigue = true; showTab('projets'); });
    const carte = page.locator('#pj article.pj-seul', {hasText: 'Studio fin'});
    await carte.waitFor();
    const ligne = carte.locator('button.pj-seul-l');
    assert.equal(await ligne.getAttribute('aria-expanded'), 'false');
    assert.match(await ligne.innerText(), /Studio fin[\s\S]*€\s*\/mois/);
    assert.equal(await carte.locator('.risque').count(), 1, 'le risque se voit plié');
    assert.equal(await carte.locator('.pj-pastille').count(), 1, 'le prix en pastille');
    assert.equal(await carte.locator('[data-a="financer"]').count(), 0, 'boutons cachés tant que c\'est plié');
    assert.ok((await carte.boundingBox()).height < 110, 'carte fine');
    await ligne.click();
    await carte.locator('[data-a="financer"]').waitFor();
    await carte.locator('button.pj-seul-l').click();
    await page.waitForFunction(() => !document.querySelector('#pj article.pj-seul [data-a="financer"]'));
    assert.deepEqual(journal.erreurs, []);
  } finally { await nav.close(); }
});
