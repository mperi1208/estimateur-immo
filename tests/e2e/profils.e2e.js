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

  // Fenêtre du compte : « Ajouter » un profil, qui devient le profil en cours, vide
  await page.click('#compteStatut');
  await page.click('#cpt_plus');
  await page.fill('#cpt_nomProfil', 'Papa');
  await page.click('#cpt_nouveau button[type=submit]');
  await page.waitForFunction(() => COMPTE.profil && COMPTE.nomProfil() === 'Papa' && document.querySelector('#compteBody [aria-current] ') !== null);
  assert.equal(await page.locator('#compteBody [aria-current] span:last-child').innerText(), 'Papa');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#compteNom').innerText(), 'Papa');
  await page.waitForFunction(() => document.querySelector('#inv .etat-compte') && /Enregistré/.test(document.querySelector('#inv .etat-compte').title));
  assert.deepEqual(await nomsBiens(page), [], 'le nouveau profil ne voit pas les biens du titulaire');

  await ajouterBien(page, 'Appart de Papa');
  await attendre(() => (membre('Papa') || {}).biens?.length === 1, 'bien de Papa enregistré dans son profil');
  assert.deepEqual(membre('Papa').biens.map(b => b.nom), ['Appart de Papa']);
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc'], 'le titulaire garde seulement ses biens');

  // Retour au titulaire : ses biens, pas ceux de Papa
  await page.click('#compteStatut');
  await page.click('#compteBody .profils [data-pid=""]');
  await page.waitForFunction(() => COMPTE.profil === '' && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Maison de Marc'));
  assert.deepEqual(await nomsBiens(page), ['Maison de Marc']);
  assert.equal(await page.locator('#compteNom').innerText(), 'Moi');
  await page.keyboard.press('Escape');

  // Un autre appareil : à la connexion, « Qui utilise Patrimoniu ? » ; il choisit Papa
  const b = await appareil(nav, base);
  await ouvrir(b.page);
  await b.page.evaluate(({EMAIL, MDP}) => COMPTE.client.auth.signInWithPassword({email: EMAIL, password: MDP}), {EMAIL, MDP});
  await b.page.waitForSelector('#compteBody .profils [data-pid]');
  assert.match(await b.page.locator('#compteBody h2').innerText(), /Qui utilise Patrimoniu/);
  const pid = await b.page.evaluate(() => COMPTE.membres[0].id);
  await b.page.click(`#compteBody .profils [data-pid="${pid}"]`);
  await b.page.waitForFunction(() => [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Appart de Papa'));
  assert.deepEqual(await nomsBiens(b.page), ['Appart de Papa']);
  // Rechargé : même profil, sans redemander
  await ouvrir(b.page);
  await b.page.waitForFunction(() => COMPTE.user && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Appart de Papa'));
  assert.equal(await b.page.evaluate(() => document.getElementById('compteDlg').open), false);

  // Renommer puis supprimer le profil depuis le 1er appareil
  await page.click('#compteStatut');
  await page.click(`#compteBody .profils [data-pid="${pid}"]`);
  await page.waitForFunction(id => COMPTE.profil === id, pid);
  await page.click('#cpt_renommer');
  await page.fill('#cpt_nomRenom', 'Papa Jean');
  await page.click('#cpt_renom button[type=submit]');
  await page.waitForFunction(() => COMPTE.nomProfil() === 'Papa Jean');
  assert.equal(base.membres[0].nom, 'Papa Jean');
  await page.click('#cpt_suppr');   // confirm() accepté par le banc
  await page.waitForFunction(() => COMPTE.profil === '' && COMPTE.membres.length === 0);
  assert.equal(base.membres.length, 0);
  assert.deepEqual(titulaire().biens.map(b => b.nom), ['Maison de Marc']);

  assert.deepEqual(journal.erreurs, []); assert.deepEqual(b.journal.erreurs, []);
});
