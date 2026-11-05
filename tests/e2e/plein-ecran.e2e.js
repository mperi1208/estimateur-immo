// Plein écran sur ordinateur, réglé dans « Ton compte » : bouton pour y passer, case « Ouvrir l'appli en plein écran »
// (au premier clic de chaque visite) ; en sortir ne décoche rien et ne relance rien ; rien sur téléphone ; appli installable
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase} = require('./banc');

let nav;
test.before(async () => { nav = await lancerNavigateur(); });
test.after(async () => { await nav.close(); });

const plein = page => page.evaluate(() => !!document.fullscreenElement);
const ouvrirProfil = async page => { await page.evaluate(() => ouvrirCompte()); await page.waitForSelector('#compteDlg[open] #cpt_pe'); };
const sortir = async page => { await page.evaluate(() => document.exitFullscreen()); await page.waitForFunction(() => !document.fullscreenElement); };

test('ordinateur : le plein écran se règle dans « Ton compte », la sortie ne décoche rien et ne relance rien', async () => {
  const {page, journal} = await appareil(nav, nouvelleBase());
  await ouvrir(page); await seConnecter(page);
  assert.equal(await page.locator('.tabs .plein-ecran, #pleinEcranBtn').count(), 0, 'plus rien dans la barre du haut');

  await ouvrirProfil(page);
  assert.equal(await page.textContent('#cpt_pe'), 'Passer en plein écran');
  assert.equal(await page.isChecked('#cpt_pe_auto'), false);
  await page.click('#cpt_pe');
  await page.waitForFunction(() => !!document.fullscreenElement);
  await sortir(page);   // Échap, bouton vert ou fermeture de la fenêtre
  await page.mouse.click(640, 500); await page.waitForTimeout(300);
  assert.equal(await plein(page), false, 'case décochée : un clic ne remet pas en plein écran');

  // « Ouvrir l'appli en plein écran » : à la visite suivante, plein écran au premier clic dans la page
  await ouvrirProfil(page);
  await page.check('#cpt_pe_auto');
  await ouvrir(page);
  assert.equal(await plein(page), false);
  await page.mouse.click(640, 500);
  await page.waitForFunction(() => !!document.fullscreenElement);
  // En sortir : le réglage reste coché, et rien ne relance le plein écran pendant cette visite
  await sortir(page);
  await page.mouse.click(640, 500); await page.waitForTimeout(300);
  assert.equal(await plein(page), false, 'pas relancé après en être sorti');
  assert.equal(await page.evaluate(() => localStorage.getItem('plein-ecran-auto')), '1');
  // Visite suivante : toujours en plein écran au premier clic
  await ouvrir(page);
  await page.mouse.click(640, 500);
  await page.waitForFunction(() => !!document.fullscreenElement);
  await ouvrirProfil(page);
  assert.equal(await page.textContent('#cpt_pe'), 'Quitter le plein écran');
  assert.equal(await page.isChecked('#cpt_pe_auto'), true);
  await page.click('#cpt_pe');
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.waitForFunction(() => document.querySelector('#cpt_pe').textContent === 'Passer en plein écran');

  // Décochée : plus de plein écran à l'ouverture
  await page.uncheck('#cpt_pe_auto');
  await ouvrir(page);
  await page.mouse.click(640, 500); await page.waitForTimeout(300);
  assert.equal(await plein(page), false);
  assert.deepEqual(journal.erreurs, []);
});

test('téléphone : pas de réglage plein écran dans « Ton compte »', async () => {
  const {page, journal} = await appareil(nav, nouvelleBase(), {mobile: true});
  await ouvrir(page); await seConnecter(page);
  await page.evaluate(() => ouvrirCompte());
  await page.waitForSelector('#compteDlg[open] #cpt_out');
  assert.equal(await page.locator('#cpt_pe, .cpt-ecran').count(), 0);
  assert.deepEqual(journal.erreurs, []);
});

test('installable : manifeste en fenêtre à part, couleurs de l\'appli, icônes présentes', async () => {
  const dossier = path.join(__dirname, '..', '..', 'app');
  const m = JSON.parse(fs.readFileSync(path.join(dossier, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#101828');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(dossier, i.src)), i.src);
  assert.ok(m.icons.some(i => i.sizes === '512x512'));
});
