// Parcours complet d'un nouvel utilisateur : estime en invité, finance avec travaux, crée son compte (sans quitter Financer),
// enregistre, ajoute une option, prépare le dossier pour la banque, achète, puis suit le bien dans Mon patrimoine
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, travaux, cliquer} = require('./banc');

let nav, base, page, journal;
test.before(async () => { nav = await lancerNavigateur(); base = nouvelleBase(); ({page, journal} = await appareil(nav, base)); await ouvrir(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const compte = () => { const l = [...base.lignes.values()][0]; return l ? JSON.parse(l) : null; };
async function attendreCompte(f, msg) {
  for (let i = 0; i < 80; i++) { const c = compte(); if (c && f(c)) return c; await new Promise(ok => setTimeout(ok, 100)); }
  assert.fail(msg);
}

test('invité : estimer un bien à rénover, puis le financer avec les travaux', async () => {
  await estimer(page, {surf: 48, details: {etat: 'renover', dpe: 'F'}});
  await travaux(page, 'renover');
  await page.evaluate(() => CF_APP.etape(4));   // la dernière fois, on était resté sur le résultat
  await page.click('#est_loc');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await page.evaluate(() => document.getElementById('cf').dataset.etape), '2', 'Financer part de l\'étape 2, pas du résultat');
});

test('créer son compte depuis Financer : on y reste, et le compte se charge malgré la recherche faite en invité', async () => {
  await page.evaluate(() => { window.prompt = (m, d) => d; window.confirm = () => true; });
  await seConnecter(page, 'nouveau@exemple.fr', 'secret123', true);
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.body.dataset.onglet), 'cashflow', 'pas renvoyé sur Mon patrimoine');
  await attendreCompte(c => Array.isArray(c.biens), 'le compte neuf est écrit en ligne');
});

test('enregistrer le projet, puis une option sans travaux', async () => {
  await page.evaluate(() => CF_APP.etape(4));
  assert.match(await page.locator('#cf_risque').innerText(), /Risque [1-5]\/5/, 'note de risque à côté du résultat');
  assert.equal(await page.locator('#cf_cible').isVisible(), false, 'location avec travaux : pas de « prix pour n\'avoir rien à sortir »');
  await page.fill('#cf_nomProjet', 'T2 Lyon'); await cliquer(page, '#cf_enreg');
  await attendreCompte(c => (c.projets || []).some(x => x.nom === 'T2 Lyon'), 'projet enregistré dans le compte');
  await page.evaluate(() => { document.getElementById('cf_boxProjet').open = false; });
  await page.fill('#cf_nomProjet', 'Sans travaux'); await cliquer(page, '#cf_enregBranche');
  await attendreCompte(c => (c.projets || []).filter(x => x.nom === 'T2 Lyon').length === 2, 'option enregistrée');
});

test('dossier pour la banque : l\'utilisateur choisit l\'option détaillée, l\'appli n\'en désigne pas une « meilleure »', async () => {
  await page.evaluate(() => { aNavigue = true; showTab('projets'); });
  assert.equal(await page.locator('#pj button.pj-ligne .risque').count(), 2, 'une note de risque par option');
  // Projet replié : chaque option garde sa ligne et sa note de risque
  const plies = await page.evaluate(() => { const d = [...DEPLIES]; DEPLIES.clear(); afficherProjets(); const n = document.querySelectorAll('#pj .pj-groupe.replie button.pj-ligne .risque').length; d.forEach(g => DEPLIES.add(g)); afficherProjets(); return n; });
  assert.equal(plies, 2, 'notes de risque sur le projet replié');
  const menu = page.locator('#pj details.pj-dossier').first();
  await menu.locator('summary').click();
  const t = await menu.locator('.pj-menu-l').innerText();
  assert.match(t, /Comparer, détail de l'option A/); assert.match(t, /Comparer, détail de l'option B/);
  assert.doesNotMatch(t, /la meilleure/i);
  await menu.locator('summary').click();
});

test('« J\'ai acheté » l\'option avec travaux : la fiche porte le nom du projet, sa valeur suit les travaux', async () => {
  const ligne = page.locator('#pj button.pj-ligne', {hasText: 'Version de départ'}).first();
  if (await ligne.getAttribute('aria-expanded') !== 'true') await ligne.click();
  const carte = page.locator('#pj .pj-detail');
  await carte.locator('.pj-menu summary').click();
  await carte.locator('[data-a="achete"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements' && document.getElementById('inv_titre'));
  assert.equal(await page.locator('#inv_titre').innerText(), 'T2 Lyon', 'sans « · Version de départ »');
  assert.match(await page.locator('#inv_kpis').innerText(), /en travaux · \d+\sk€ après/);
  const c = await attendreCompte(x => (x.biens || []).some(b => b.nom === 'T2 Lyon'), 'fiche dans le compte');
  const b = c.biens.find(x => x.nom === 'T2 Lyon');
  assert.ok(b.valeurApres && b.valeurApres.valeur > b.valeur, 'valeur après travaux prévue, au-dessus de la valeur pendant le chantier');
});
