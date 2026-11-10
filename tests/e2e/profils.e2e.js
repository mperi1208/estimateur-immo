// Profils d'un même compte (comme Netflix) : chaque profil a ses biens et ses projets, rien ne passe de l'un à l'autre ;
// un autre appareil qui se connecte choisit son profil, puis le retrouve aux connexions suivantes
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, saisir, cliquer} = require('./banc');

const EMAIL = 'famille@exemple.fr', MDP = 'secret123';
let nav, base;
test.before(async () => { nav = await lancerNavigateur(); base = nouvelleBase(); });
test.after(async () => { await nav.close(); });

const titulaire = () => JSON.parse([...base.lignes.values()][0]);
const membre = nom => { const m = base.membres.find(x => x.nom === nom); return m && m.credits ? JSON.parse(m.credits) : null; };
const nomsBiens = p => p.evaluate(() => [...document.querySelectorAll('#inv a.bien .infos > b')].map(e => e.textContent));
async function ajouterBien(page, nom) {
  await page.evaluate(() => { location.hash = '#investissements'; });
  await cliquer(page, '#inv [data-a="ajout"]'); await page.waitForSelector('#inv_titre');
  await saisir(page, '#inv [data-p="nom"]', nom);
  await page.waitForFunction(() => !/…/.test(document.querySelector('#inv .etat-compte').title));   // enregistré
  await page.evaluate(() => INV.vider());
}
async function attendre(f, msg) {
  for (let i = 0; i < 50; i++) { if (f()) return; await new Promise(ok => setTimeout(ok, 100)); }
  assert.fail(msg);
}

test('deux profils sur un compte : biens séparés, et un autre appareil choisit son profil', async () => {
  const {page, journal} = await appareil(nav, base);
  await ouvrir(page); await seConnecter(page, EMAIL, MDP);
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
  await ajouterBien(page, 'Maison de Marc');
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc']);
  // Sans autre profil, le nom du profil n'apparaît pas dans la barre du haut
  assert.equal(await page.locator('#compteNom').innerText(), '');

  // Fenêtre du compte → « Ajouter des profils » : l'écran des profils, en plein écran
  const ecran = (p = page) => p.locator('#profilsEcran');
  const tuile = (id, p = page) => p.locator(`#pe_grille [data-pid="${id}"]`);
  await page.evaluate(() => ouvrirCompte());
  await page.click('#cpt_profils');
  await ecran().waitFor();
  assert.equal(await page.evaluate(() => document.getElementById('compteDlg').open), false, 'la fenêtre du compte laisse la place à l\'écran');
  assert.equal(await page.locator('#pe_titre').innerText(), 'Qui utilise Patrimoniu ?');
  const box = await ecran().boundingBox(), vue = page.viewportSize();
  assert.ok(box.width === vue.width && box.height === vue.height, 'plein écran');
  // « + Ajouter un profil » : Papa apparaît, puis on le choisit
  await page.click('#pe_grille [data-ajout]');
  await page.fill('#pe_nom', 'Papa');
  await page.click('#pe_ok');
  await page.waitForFunction(() => COMPTE.membres.some(m => m.nom === 'Papa'));
  const pid = await page.evaluate(() => COMPTE.membres[0].id);
  assert.equal(await tuile(pid).locator('span').last().innerText(), 'Papa');
  await tuile(pid).click();
  await ecran().waitFor({state: 'hidden'});
  await page.waitForFunction(id => COMPTE.profil === id && COMPTE.user, pid);
  assert.equal(await page.locator('#compteNom').innerText(), 'Papa');
  await page.waitForFunction(() => document.querySelector('#inv .etat-compte') && /Enregistré/.test(document.querySelector('#inv .etat-compte').title));
  assert.deepEqual(await nomsBiens(page), [], 'le nouveau profil ne voit pas les biens du titulaire');

  await ajouterBien(page, 'Appart de Papa');
  await attendre(() => (membre('Papa') || {}).biens?.length === 1, 'bien de Papa enregistré dans son profil');
  assert.deepEqual(membre('Papa').biens.map(b => b.nom), ['Appart de Papa']);
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc'], 'le titulaire garde seulement ses biens');

  // Retour au titulaire (« Changer de profil »), puis Échap ferme l'écran sans rien changer
  await page.evaluate(() => ouvrirCompte());
  assert.match(await page.locator('#cpt_profils').innerText(), /Papa[\s\S]*Changer de profil/);
  await page.click('#cpt_profils');
  assert.equal(await tuile(pid).getAttribute('aria-current'), 'true');
  await tuile('').click();
  await page.waitForFunction(() => COMPTE.profil === '' && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Maison de Marc'));
  assert.deepEqual(await nomsBiens(page), ['Maison de Marc']);
  assert.equal(await page.locator('#compteNom').innerText(), 'Moi');
  await page.evaluate(() => ouvrirCompte()); await page.click('#cpt_profils');
  await page.keyboard.press('Escape');
  await ecran().waitFor({state: 'hidden'});
  assert.equal(await page.evaluate(() => COMPTE.profil), '');
  // Photo du titulaire : sur sa grande tuile ; Papa, sans photo, garde son initiale
  await page.evaluate(async () => { const c = Object.assign(document.createElement('canvas'), {width: 8, height: 8}); await changerPhoto(await new Promise(ok => c.toBlob(ok, 'image/jpeg'))); });
  await page.evaluate(() => ouvrirCompte()); await page.click('#cpt_profils');
  await page.waitForSelector('#pe_grille [data-pid=""] img.pastille');
  assert.equal(await tuile(pid).locator('img').count(), 0);
  await page.keyboard.press('Escape');

  // Un autre appareil (téléphone) : à la connexion, l'écran « Qui utilise Patrimoniu ? », sans ✕ ; il choisit Papa
  const b = await appareil(nav, base, {mobile: true});
  await ouvrir(b.page);
  await b.page.evaluate(({EMAIL, MDP}) => COMPTE.client.auth.signInWithPassword({email: EMAIL, password: MDP}), {EMAIL, MDP});
  await ecran(b.page).waitFor();
  assert.equal(await b.page.locator('#pe_fermer').isVisible(), false);
  const tailles = await b.page.locator('#pe_grille .pastille').evaluateAll(l => l.map(e => e.getBoundingClientRect().width));
  assert.ok(tailles.every(w => w >= 100), 'gros profils sur téléphone : ' + tailles);
  await tuile(pid, b.page).click();
  await b.page.waitForFunction(() => [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Appart de Papa'));
  assert.deepEqual(await nomsBiens(b.page), ['Appart de Papa']);
  // Rechargé : même profil, sans redemander
  await ouvrir(b.page);
  await b.page.waitForFunction(() => COMPTE.user && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Appart de Papa'));
  assert.equal(await ecran(b.page).isVisible(), false);

  // « Gérer les profils » : renommer puis supprimer Papa depuis le 1er appareil
  await page.evaluate(() => ouvrirCompte()); await page.click('#cpt_profils');
  await page.click('#pe_gerer');
  assert.equal(await page.locator('#pe_titre').innerText(), 'Gérer les profils');
  await tuile(pid).click();
  assert.equal(await page.inputValue('#pe_nom'), 'Papa');
  await page.fill('#pe_nom', 'Papa Jean');
  await page.click('#pe_ok');
  await page.waitForFunction(() => COMPTE.nomProfil(COMPTE.membres[0].id) === 'Papa Jean');
  assert.equal(base.membres[0].nom, 'Papa Jean');
  assert.equal(await tuile(pid).locator('span').last().innerText(), 'Papa Jean');
  await tuile(pid).click();
  await page.click('#pe_suppr');   // confirm() accepté par le banc
  await page.waitForFunction(() => COMPTE.membres.length === 0);
  assert.equal(base.membres.length, 0);
  assert.equal(await tuile(pid).count(), 0);
  await page.click('#pe_fermer');
  assert.equal(await page.evaluate(() => COMPTE.profil), '');
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc']);
  // L'autre appareil, resté sur Papa, enregistre : il est prévenu que le profil n'existe plus (plus d'échec silencieux)
  await b.page.evaluate(() => { location.hash = '#investissements'; });
  await cliquer(b.page, '#inv [data-a="ajout"]'); await b.page.waitForSelector('#inv_titre');
  await saisir(b.page, '#inv [data-p="nom"]', 'Studio orphelin');
  await b.page.waitForFunction(() => /n'existe plus/.test(document.querySelector('#inv .etat-compte').title));
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc'], 'rien d\'écrit ailleurs');

  assert.deepEqual(journal.erreurs, []); assert.deepEqual(b.journal.erreurs, []);
});
