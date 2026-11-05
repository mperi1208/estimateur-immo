// Plein écran sur ordinateur : bouton dans la barre du haut, choix retenu (plein écran au premier clic de la visite suivante) ;
// rien sur téléphone ; l'appli s'installe (Dock / Installer) dans sa propre fenêtre
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {lancerNavigateur, appareil, ouvrir, nouvelleBase} = require('./banc');

let nav;
test.before(async () => { nav = await lancerNavigateur(); });
test.after(async () => { await nav.close(); });

const plein = page => page.evaluate(() => !!document.fullscreenElement);

test('ordinateur : le bouton passe en plein écran et en sort, le choix est retenu pour la visite suivante', async () => {
  const {page, journal} = await appareil(nav, nouvelleBase());
  await ouvrir(page);
  const btn = page.locator('#pleinEcranBtn');
  assert.ok(await btn.isVisible(), 'bouton visible sur ordinateur');
  assert.equal(await btn.getAttribute('aria-label'), 'Plein écran');
  await btn.click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.ok(await page.evaluate(() => document.body.classList.contains('plein-ecran')));
  assert.equal(await btn.getAttribute('aria-label'), 'Quitter le plein écran');
  assert.equal(await page.evaluate(() => localStorage.getItem('plein-ecran')), '1');

  // Visite suivante : pas de plein écran tout seul (le navigateur l'interdit), mais dès le premier clic
  await ouvrir(page);
  assert.equal(await plein(page), false);
  await page.mouse.click(640, 500);
  await page.waitForFunction(() => !!document.fullscreenElement);

  // On en sort avec le bouton : la visite suivante reste en fenêtre
  await page.locator('#pleinEcranBtn').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await page.evaluate(() => localStorage.getItem('plein-ecran')), '0');
  await ouvrir(page);
  await page.mouse.click(640, 500);
  await page.waitForTimeout(300);
  assert.equal(await plein(page), false);
  assert.deepEqual(journal.erreurs, []);
});

test('téléphone : pas de bouton plein écran, la barre du haut ne change pas', async () => {
  const {page, journal} = await appareil(nav, nouvelleBase(), {mobile: true});
  await ouvrir(page);
  assert.equal(await page.locator('#pleinEcranBtn').isVisible(), false);
  const r = await page.locator('.tabs').evaluate(e => ({h: e.getBoundingClientRect().height, l: e.scrollWidth}));
  assert.ok(r.l <= 390, 'barre du haut pas plus large que l\'écran');
  assert.deepEqual(journal.erreurs, []);
});

test('installable : manifeste en fenêtre à part, couleurs de l\'appli, icônes présentes', async () => {
  const dossier = path.join(__dirname, '..', '..', 'app');
  const m = JSON.parse(fs.readFileSync(path.join(dossier, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#101828');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(dossier, i.src)), i.src);
  assert.ok(m.icons.some(i => i.sizes === '512x512'));
  const {page} = await appareil(nav, nouvelleBase());
  await ouvrir(page);
  const lien = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); const r = await fetch(l.href); return {ok: r.ok, type: r.headers.get('content-type')}; });
  assert.ok(lien.ok);
});
