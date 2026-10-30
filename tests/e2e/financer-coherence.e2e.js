// Financer : une valeur impossible tapée au clavier est corrigée quand on quitte le champ (et dite sous le champ), et les
// réglages qui dépendent les uns des autres restent cohérents (différé, revente pendant le chantier, travaux après le crédit)
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase} = require('./banc');

let nav, page, journal;
test.before(async () => { nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page, '#cashflow'); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

// Tapé puis validé (comme en quittant le champ), même dans une section repliée
const taper = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById('cf_' + id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, [id, String(v)]);
const valeur = id => page.locator('#cf_' + id).inputValue();
const message = () => page.locator('#cf .hint.corr').allInnerTexts();

test('bornes : vacance, apport, taux, durée du crédit (vide ou nulle) ramenés dans leurs limites, avec un message', async () => {
  await taper('vacance', 15);
  assert.equal(await valeur('vacance'), '12'); assert.match((await message()).join(' '), /Ramené à 12/);
  await taper('apport', -50000); assert.equal(await valeur('apport'), '0');
  await taper('taux', -2); assert.equal(await valeur('taux'), '0');
  await taper('duree', ''); assert.equal(await valeur('duree'), '20'); assert.match((await message()).join(' '), /remise à 20 ans/);
  await taper('duree', 0); assert.equal(await valeur('duree'), '5');
  await taper('vacance', 0.5); await taper('taux', 3.4); await taper('duree', 20);
  assert.deepEqual(await message(), [], 'le message disparaît à la saisie suivante');
});

test('différé : au moins un an de remboursement après lui, 36 mois au plus', async () => {
  await taper('differe', 400);
  assert.equal(await valeur('differe'), '36');
  await taper('duree', 2);   // minimum 5 ans
  await taper('differe', 0);
});

test('revente : pas avant la fin des travaux, même si le chantier s\'allonge après coup', async () => {
  await page.evaluate(() => { document.getElementById('cf_boxProjet').open = true; });
  await taper('travaux', 40000); await taper('debutTravaux', 3); await taper('dureeTravaux', 8); await taper('valeurApres', 280000);
  await page.evaluate(() => CF_APP.etape(4));
  await page.click('#cf_scen button[data-v="revendre"]');
  await taper('moisRevente', 5);
  assert.equal(await valeur('moisRevente'), '10');
  assert.match((await message()).join(' '), /Revente au mois 10 au plus tôt/);
  await taper('dureeTravaux', 14);
  assert.equal(await valeur('moisRevente'), '16', 'le chantier finit plus tard : la revente suit');
  await page.click('#cf_scen button[data-v="louer"]');
});

test('travaux payés par le crédit après la fin du crédit : avertissement ; pas de différé automatique pour un chantier lointain', async () => {
  await taper('differe', 0); await taper('duree', 5); await taper('debutTravaux', 100);
  assert.equal(await valeur('differe'), '0', 'un différé des 3 premières années ne couvrirait pas ce chantier');
  await page.evaluate(() => CF_APP.etape(4));
  assert.match(await page.locator('#cf_alerts').innerText(), /après la fin du crédit \(mois 60\)/);
});
