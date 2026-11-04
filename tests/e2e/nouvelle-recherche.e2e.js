// « Nouvelle recherche » : efface l'adresse, les détails, les travaux et le résultat ; on repart comme à l'arrivée
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase, estimer, travaux} = require('./banc');

test('nouvelle recherche : tout est remis à zéro, et une nouvelle estimation part de là', async () => {
  const nav = await lancerNavigateur(), {page, journal} = await appareil(nav, nouvelleBase());
  try {
    await ouvrir(page);
    assert.equal(await page.locator('#nouvelleBtn').isVisible(), false, 'rien à effacer à l\'arrivée');
    await estimer(page, {surf: 48, details: {etat: 'renover', dpe: 'F'}});
    await travaux(page, 'renover');
    await page.click('#nouvelleBtn');
    const e = await page.evaluate(() => ({adr: addr.value, surf: document.getElementById('surf').value, etat: field('etat').value, dpe: field('dpe').value,
      out: document.getElementById('out').innerText, lat: state.lat, travaux: Object.keys(choixTravaux).length, crit: document.getElementById('nbCrit').textContent,
      bouton: document.getElementById('nouvelleBtn').hidden}));
    assert.equal(e.adr, ''); assert.equal(e.surf, '50'); assert.equal(e.lat, null); assert.equal(e.travaux, 0);
    assert.notEqual(e.etat, 'renover'); assert.notEqual(e.dpe, 'F');
    assert.match(e.crit, /bien moyen/); assert.match(e.out, /Renseigne l'adresse/); assert.ok(e.bouton, 'le bouton se cache');
    const r = await estimer(page, {surf: 30});
    assert.equal(r.surf, 30, 'une nouvelle estimation repart de zéro');
    assert.deepEqual(journal.erreurs, []);
  } finally { await nav.close(); }
});
