// Profils d'un même compte (comme Netflix) : les biens et projets sont à toute la famille (sauf ce qu'un profil garde
// « rien que pour lui »), chaque projet montre la photo de qui l'a fait ; un autre appareil qui se connecte choisit son profil, puis le retrouve aux connexions suivantes
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
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.waitForFunction(() => [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Maison de Marc'));
  assert.deepEqual(await nomsBiens(page), ['Maison de Marc'], 'le nouveau profil voit les biens de la famille');

  await ajouterBien(page, 'Appart de Papa');
  await attendre(() => titulaire().biens.length === 2, 'bien de Papa enregistré dans la famille');
  assert.deepEqual(titulaire().biens.map(b => [b.nom, b.auteur]), [['Maison de Marc', ''], ['Appart de Papa', pid]]);
  assert.equal(membre('Papa'), null, 'rien dans la ligne du profil');
  // Mes biens : « Détenus » d'abord
  await page.evaluate(() => { location.hash = '#investissements'; }); await page.waitForSelector('#inv .seg-biens a');
  assert.deepEqual(await page.locator('#inv .seg-biens a').allInnerTexts().then(l => l.map(t => t.replace(/\s*\d+$/, '').toLowerCase())), ['détenus', 'en projet']);
  // Un projet de Papa : sa pastille à côté du nom
  await page.evaluate(() => PROJETS.ajouter({id: 'projPapa', nom: 'Studio de Papa', estimationSeule: true, quand: new Date().toISOString(), maj: Date.now(),
    recherche: {cle: 'k', label: 'Lyon', type: '121', surf: 30, prix: 120000, loyer: 600, quand: new Date().toISOString()}}));
  await page.evaluate(() => { location.hash = '#projets'; });
  await page.waitForSelector('#pj .pj-auteur');
  assert.match(await page.locator('#pj .pj-auteur').first().getAttribute('title'), /Toi/);
  await attendre(() => (titulaire().projets || []).some(x => x.id === 'projPapa' && x.auteur === pid), 'projet de Papa dans la famille, à son nom');
  // « Appart de Papa » rien que pour lui
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.locator('#inv a.bien', {hasText: 'Appart de Papa'}).click();
  await cliquer(page, '#inv [data-a="perso"]');
  await page.evaluate(() => INV.vider());
  await attendre(() => titulaire().biens.some(b => b.nom === 'Appart de Papa' && b.perso), 'marqué rien que pour Papa');

  // Retour au titulaire (« Changer de profil »), puis Échap ferme l'écran sans rien changer
  await page.evaluate(() => ouvrirCompte());
  assert.match(await page.locator('#cpt_profils').innerText(), /Papa[\s\S]*Changer de profil/);
  await page.click('#cpt_profils');
  assert.equal(await tuile(pid).getAttribute('aria-current'), 'true');
  await tuile('').click();
  await page.waitForFunction(() => COMPTE.profil === '' && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Maison de Marc'));
  assert.deepEqual(await nomsBiens(page), ['Maison de Marc'], 'le bien que Papa garde pour lui est caché');
  // Le projet de Papa, avec sa pastille (son initiale)
  await page.evaluate(() => { location.hash = '#projets'; });
  await page.waitForSelector('#pj .pj-auteur');
  assert.equal(await page.locator('#pj .pj-auteur').first().getAttribute('title'), 'Fait par Papa');
  assert.equal(await page.locator('#pj .pj-auteur .pastille').first().innerText(), 'P');
  // Le titulaire enregistre : le bien caché de Papa n'est pas perdu
  await page.evaluate(() => { location.hash = '#investissements'; });
  await ajouterBien(page, 'Garage de Marc');
  await attendre(() => titulaire().biens.length === 3, 'trois biens dans la famille');
  assert.ok(titulaire().biens.some(b => b.nom === 'Appart de Papa'));
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
  assert.deepEqual((await nomsBiens(b.page)).sort(), ['Appart de Papa', 'Garage de Marc', 'Maison de Marc']);
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
  assert.deepEqual(titulaire().biens.map(b => b.nom).sort(), ['Garage de Marc', 'Maison de Marc'], 'ce que Papa gardait pour lui part avec son profil');
  assert.ok(titulaire().projets.some(x => x.id === 'projPapa'), 'ce qu\'il partageait reste à la famille');

  assert.deepEqual(journal.erreurs, []); assert.deepEqual(b.journal.erreurs, []);
});

test('un profil qui avait déjà ses projets à lui : versés une fois dans la famille, avec sa pastille', async () => {
  const b2 = nouvelleBase(), quand = new Date().toISOString();
  b2.comptes.set('cat@exemple.fr', {id: 'u1', email: 'cat@exemple.fr', mdp: MDP});
  const bien = {id: 'bm', nom: 'Maison de famille', type: 'maison', adresse: '', criteres: {}, structure: 'np', sciId: null, valeur: null, valeurLe: '',
    achat: {}, location: {statut: 'vide', loyer: null, charges: null, locataire: '', debutBail: '', vacance: 0}, chargesAn: {}, prets: [], docs: [], notes: '', maj: 1};
  b2.lignes.set('u1', JSON.stringify({version: 2, biens: [bien], scis: [], projets: [], recherches: [], supprimes: {}}));
  b2.membres.push({user_id: 'u1', id: 'pcat', nom: 'Catalina', couleur: '#d9534f', cree: quand, credits: JSON.stringify({version: 2, biens: [], scis: [], supprimes: {},
    projets: [{id: 'pc', nom: 'Projet de Catalina', estimationSeule: true, quand, maj: 2, recherche: {cle: 'k', label: 'Lyon', type: '121', surf: 30, prix: 120000, loyer: 600, quand}}],
    recherches: [{cle: 'r1', label: 'Lyon', surf: 30, prix: 1, quand}]})});
  const {page, journal} = await appareil(nav, b2);
  await ouvrir(page);
  await page.evaluate(() => COMPTE.client.auth.signInWithPassword({email: 'cat@exemple.fr', password: 'secret123'}));
  await page.locator('#profilsEcran').waitFor();
  await page.locator('#pe_grille [data-pid=""]').click();
  await page.waitForFunction(() => COMPTE.user && [...document.querySelectorAll('#inv a.bien .infos > b')].some(e => e.textContent === 'Maison de famille'));
  const fam = JSON.parse(b2.lignes.get('u1'));
  assert.deepEqual(fam.projets.map(x => [x.id, x.auteur]), [['pc', 'pcat']]);
  assert.equal(fam.recherchesPar.pcat.length, 1);
  assert.ok(JSON.parse(b2.membres[0].credits).verse, 'la ligne de Catalina est vidée');
  await page.evaluate(() => { location.hash = '#projets'; });
  await page.waitForSelector('#pj .pj-auteur');
  assert.equal(await page.locator('#pj .pj-auteur').first().getAttribute('title'), 'Fait par Catalina');
  assert.deepEqual(journal.erreurs, []);
});
