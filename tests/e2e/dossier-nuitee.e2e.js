// Dossier de financement d'un projet loué à la nuitée : prix par nuit, occupation, recettes et frais y figurent, que ce
// soit le bien ou seulement le logement à part ; et le dossier tient toujours en deux pages
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase, estimer} = require('./banc');

let nav, page, journal;
test.before(async () => {
  nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase())); await ouvrir(page);
  await estimer(page, {surf: 45});
  await page.click('#est_financer'); await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.evaluate(() => CF_APP.etape(2));
});
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const poser = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById('cf_' + id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, [id, String(v)]);
// Le dossier tel que le PDF le met en pages : texte et hauteur de chaque page (mm)
const dossier = () => page.evaluate(() => {
  const el = document.createElement('div'); el.className = 'recap'; el.style.cssText = 'width:184mm;position:absolute;left:0;top:0';
  el.innerHTML = recapHtml(CF_APP.recap(), {titre: 'Test', adresse: '12 Rue de la République 69002 Lyon', date: '30 octobre 2026'});
  document.body.append(el);
  const mm = 184 / el.getBoundingClientRect().width, r = {texte: el.innerText, pages: [...el.querySelectorAll('.rc-page')].map(p => p.scrollHeight * mm)};
  el.remove(); return r;
});

test('le bien loué à la nuitée : prix par nuit, occupation, recettes moyennes et frais', async () => {
  await page.click('#cf_locSeg button[data-v="nuit"]'); await poser('nuit', 85); await poser('occupation', 65);
  const d = await dossier();
  assert.match(d.texte, /Location à la nuitée/i);
  assert.match(d.texte, /Prix par nuit\s*85\s€/i); assert.match(d.texte, /65 %\s*237 nuits par an/i);
  assert.match(d.texte, /Recettes prévues\s*1\s681\s€\/mois/, 'pas « —/mois »');
  assert.match(d.texte, /Recettes encaissées/i);
  assert.equal(d.pages.length, 2); d.pages.forEach(h => assert.ok(h <= 273, `page de ${Math.round(h)} mm`));
});

test('seulement le logement à part à la nuitée : le dossier le dit', async () => {
  await page.click('#cf_locSeg button[data-v="mois"]'); await poser('loyer', 650);
  await page.click('#cf_ajoutL2'); await poser('loyer2', 300);
  await page.click('#cf_locSeg button[data-v="nuit"]');
  await page.evaluate(() => { const e = document.getElementById('cf_nuitSur'); e.value = '2'; e.dispatchEvent(new Event('change', {bubbles: true})); });
  await poser('nuit', 60);
  const d = await dossier();
  assert.match(d.texte, /Location à la nuitée · le logement à part/i);
  assert.match(d.texte, /logement à part à la nuitée/i);
  assert.match(d.texte, /Prix par nuit\s*60\s€/i);
});
