// Compte injoignable à la connexion : rien de l'appareil n'est montré comme étant dans le compte, puis le compte se
// relit tout seul quand le réseau revient (sans recharger la page)
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase} = require('./banc');

let nav;
test.after(async () => { await nav.close(); });

test('lecture du compte en panne à la connexion : message d\'attente, puis le compte arrive quand le réseau revient', async () => {
  nav = await lancerNavigateur();
  const base = nouvelleBase();
  base.comptes.set('a@b.fr', {id: 'u1', email: 'a@b.fr', mdp: 'secret123'});
  base.lignes.set('u1', JSON.stringify({version: 2, biens: [{id: 'b1', nom: 'Bien du compte', type: 'appart', maj: 1, achat: {}, location: {statut: 'vide', loyer: 700}, chargesAn: {}, prets: [], docs: []}], scis: [], supprimes: {}, projets: [], recherches: []}));
  const {page, ctx, journal} = await appareil(nav, base);
  let panne = true;
  await ctx.route('**/__db/lire', r => panne ? r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({data: null, error: {message: 'Failed to fetch'}})}) : r.fallback());
  await ouvrir(page);
  await page.evaluate(() => localStorage.setItem('mes-investissements', JSON.stringify([{id: 'g1', nom: 'Bien invité', type: 'appart', achat: {}, location: {statut: 'vide'}, chargesAn: {}, prets: [], docs: []}])));
  await page.reload(); await page.waitForFunction(() => window.INV && COMPTE.pret);
  await seConnecter(page, 'a@b.fr', 'secret123', false);
  await page.click('.tabs [data-tab="investissements"]');
  await page.waitForSelector('#inv .attente-compte');
  const noms = () => page.locator('#inv a.bien .infos > b').allInnerTexts();
  assert.deepEqual(await noms(), [], 'le bien de l\'appareil (invité) n\'est pas montré dans le compte');
  assert.match(await page.locator('#inv .attente-compte').innerText(), /Impossible de lire ton compte.*Nouvel essai/);
  assert.equal(await page.locator('#inv .vide').count(), 0, 'pas de « Ajoute ton premier investissement » : le compte n\'est pas vide');
  panne = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));   // retour sur la page
  await page.waitForFunction(() => [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Bien du compte'), null, {timeout: 15000});
  assert.deepEqual(await noms(), ['Bien du compte']);
  assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page');
});
