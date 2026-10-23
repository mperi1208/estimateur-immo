// Parcours avec un compte : Mon patrimoine (bien, achat, crédit, location, garage, espace à aménager, vente, SCI),
// Mes projets (depuis Financer et Estimer), deux appareils sur le même compte, déconnexion
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, saisir, nombre} = require('./banc');

const EMAIL = 'marc@exemple.fr', MDP = 'secret123';
let nav, base, page, journal;
test.before(async () => { nav = await lancerNavigateur(); base = nouvelleBase(); ({page, journal} = await appareil(nav, base)); await ouvrir(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

const onglet = (p = page) => p.evaluate(() => document.body.dataset.onglet);
// Ce qui est enregistré dans le compte (base simulée), et attente d'un enregistrement
const compte = () => { const u = base.comptes.get(EMAIL); return u && base.lignes.has(u.id) ? JSON.parse(base.lignes.get(u.id)) : null; };
async function attendreCompte(f, msg = 'enregistrement dans le compte') {
  for (let i = 0; i < 60; i++) { const c = compte(); if (c && f(c)) return c; await new Promise(ok => setTimeout(ok, 100)); }
  const c = compte();
  assert.fail(msg + ' : ' + JSON.stringify(c && {biens: (c.biens || []).map(b => ({nom: b.nom, maj: b.maj, loyer: b.location.loyer, copro: b.chargesAn.copro})), projets: (c.projets || []).map(x => x.nom), supprimes: c.supprimes}));
}
const bienDuCompte = nom => (compte().biens || []).find(b => b.nom === nom);
// Champ d'une fiche de Mon patrimoine (data-p = chemin dans le bien)
const champ = (chemin, v, p = page) => saisir(p, `#inv [data-p="${chemin}"]`, v);
const kpi = async (titre, sel = '#inv_kpis') => {
  const t = await page.locator(sel).innerText(), m = t.match(new RegExp(titre + '\\s*\\n\\s*([^\\n]+)', 'i'));
  return m ? m[1].trim() : null;
};
const mois = k => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + k); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const ouvrirFiche = async nom => {
  if (await onglet() !== 'investissements') await page.click('.tabs [data-tab="investissements"]');
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.locator('#inv a.bien', {hasText: nom}).first().click();
  await page.waitForFunction(n => (document.getElementById('inv_titre') || {}).textContent === n, nom);
};
const pmt = (C, t, n) => C * (t / 1200) / (1 - Math.pow(1 + t / 1200, -n));

test('connexion : Mon patrimoine et Mes projets apparaissent, arrivée sur Mon patrimoine', async () => {
  assert.equal(await onglet(), 'estimation');
  await seConnecter(page, EMAIL, MDP);
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
  assert.equal(await page.locator('.tabs [data-tab="investissements"]').isVisible(), true);
  assert.equal(await page.locator('.tabs [data-tab="projets"]').isVisible(), true);
  await page.waitForSelector('#inv .vide');
  const c = await attendreCompte(c => Array.isArray(c.biens), 'compte créé au premier passage');
  assert.deepEqual(c.biens, []);
});

test('Mon patrimoine : un bien avec achat, crédit, loyer et charges ; chiffres de la fiche', async () => {
  await page.click('#inv [data-a="ajout"]');
  await page.waitForSelector('#inv_titre');
  await champ('nom', 'Studio Test');
  await champ('adresse', '12 rue de la République Lyon');
  await champ('surface', 40);
  await champ('valeur', 200);                            // tapé en milliers : 200 000 €
  assert.equal(await page.locator('#inv [data-p="valeur"]').inputValue(), '200000');
  await champ('achat.date', mois(-36)); await champ('achat.prix', 180000); await champ('achat.notaire', 14000);
  await champ('location.loyer', 800); await champ('chargesAn.tf', 900);
  await page.click('#inv [data-a="ajoutPret"]');
  await champ('prets.0.montant', 150000); await champ('prets.0.taux', 3); await champ('prets.0.duree', 240); await champ('prets.0.debut', mois(-24));
  const M = pmt(150000, 3, 240);
  assert.equal(await kpi('Valeur'), '200 k€');
  const crd = nombre(await kpi('Restant dû')) * 1000;
  assert.ok(crd > 135000 && crd < 145000, `restant dû ${crd}`);
  assert.equal(nombre(await kpi('Cash-flow')), Math.round(800 - 900 / 12 - M));   // loyer − charges − mensualité
  assert.match(await page.locator('#inv_kpis').innerText(), new RegExp(Math.round(M) + ' €/mois'));
  assert.equal(await kpi('Rendement brut'), (800 * 12 / 194000 * 100).toFixed(1).replace('.', ',') + ' %');   // loyer ÷ (prix + notaire)
  const resume = await page.locator('[data-resume="0"]').innerText();
  assert.match(resume, /Mois restants\s*\n\s*215/i);                               // 1re échéance il y a 24 mois : 25 payées sur 240
  const solde = 150000 * Math.pow(1.0025, 25) - M * (Math.pow(1.0025, 25) - 1) / 0.0025;
  assert.ok(Math.abs(nombre(resume.match(/Restant dû\s*\n\s*([^\n]+)/i)[1]) - solde) < 1.5, `restant dû ≈ ${solde}`);
  assert.match(resume, new RegExp('Fin du prêt\\s*\\n\\s*' + ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][+mois(215).slice(5) - 1].replace('.', '\\.') + ' ' + mois(215).slice(0, 4), 'i'));
  const b = (await attendreCompte(c => (c.biens[0] || {}).prets && c.biens[0].prets[0] && c.biens[0].prets[0].debut)).biens[0];
  assert.equal(b.nom, 'Studio Test'); assert.equal(b.valeur, 200000); assert.equal(b.achat.prix, 180000); assert.equal(b.prets[0].montant, 150000);
});

test('liste : totaux du patrimoine (valeur, restant dû, net, loyers, cash-flow)', async () => {
  await page.click('#inv a.retour');
  await page.waitForSelector('#inv .invhead .kpis, #inv .invhead ~ .kpis');
  const t = await page.locator('#inv .kpis').first().innerText();
  assert.match(t, /Biens\s*\n\s*1/i); assert.match(t, /Valeur\s*\n\s*200 k€/i); assert.match(t, /Loyers\s*\n\s*800 €/i);
  const net = nombre(t.match(/Patrimoine net\s*\n\s*([^\n]+)/i)[1]), du = nombre(t.match(/Restant dû\s*\n\s*([^\n]+)/i)[1]);
  assert.ok(Math.abs(net + du - 200) < 1.5, `net ${net} + restant dû ${du} = valeur`);
});

test('rechargement et adresse d\'une fiche : le bien revient du compte, la fiche s\'ouvre directement', async () => {
  const id = bienDuCompte('Studio Test').id;
  await page.goto(`${require('./banc').ORIGINE}/app/index.html#investissements/${id}`);
  await page.waitForFunction(() => (document.getElementById('inv_titre') || {}).textContent === 'Studio Test', null, {timeout: 10000});
  assert.equal(await page.locator('#inv [data-p="prets.0.montant"]').inputValue(), '150000');
});

test('deux appareils sur le même compte : un changement fait sur l\'un arrive sur l\'autre', async () => {
  const {page: p2, journal: j2} = await appareil(nav, base);
  try {
    await ouvrir(p2);
    await seConnecter(p2, EMAIL, MDP, false);
    await p2.waitForFunction(() => document.body.dataset.onglet === 'investissements');
    await p2.locator('#inv a.bien', {hasText: 'Studio Test'}).click();
    await p2.waitForSelector('#inv [data-p="location.loyer"]');
    await champ('location.loyer', 850, p2);
    await attendreCompte(() => bienDuCompte('Studio Test').location.loyer === 850);
    // Le premier appareil relit le compte en revenant sur la page
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => document.querySelector('#inv [data-p="location.loyer"]').value === '850');
    // Deux changements en même temps sur deux biens différents : aucun n'écrase l'autre
    await p2.click('#inv a.retour'); await p2.click('#inv [data-a="ajout"]'); await p2.waitForSelector('#inv [data-p="nom"]');
    await Promise.all([champ('chargesAn.copro', 300), champ('nom', 'Parking Test', p2)]);
    await attendreCompte(() => bienDuCompte('Studio Test').chargesAn.copro === 300 && bienDuCompte('Parking Test'), 'les deux changements gardés');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.click('#inv a.retour');
    await page.waitForSelector('#inv a.bien >> text=Parking Test');
    assert.deepEqual(j2.erreurs, []);
  } finally { await p2.context().close(); }
});

test('garage sorti en bien à part : sa valeur et sa part du prix quittent le bien, le total ne bouge pas', async () => {
  await ouvrirFiche('Studio Test');
  await page.click('#inv [data-a="detacheOuvrir"][data-m="separer"]');
  await champ('detache.valeur', 15000);
  assert.match(await page.locator('#inv_detacheRes').innerText(), /Studio Test ensuite\s*185\s000 €/i);
  await page.click('#inv [data-a="detacher"]');
  await page.waitForFunction(() => /^Garage · Studio Test$/.test((document.getElementById('inv_titre') || {}).textContent));
  assert.match(await page.locator('#inv .lie-a').innerText(), /Associé à Studio Test/);
  const c = await attendreCompte(() => bienDuCompte('Garage · Studio Test') && bienDuCompte('Studio Test').valeur === 185000);
  const g = c.biens.find(b => b.nom === 'Garage · Studio Test'), s = c.biens.find(b => b.nom === 'Studio Test');
  assert.equal(g.valeur, 15000); assert.equal(g.lieA, s.id);
  assert.equal(g.achat.prix + s.achat.prix, 180000);                 // prix d'achat réparti au prorata des valeurs
  assert.equal(g.achat.prix, 13500); assert.equal(g.achat.date, s.achat.date);
  await page.click('#inv a.retour');
  await page.waitForSelector('#inv .invhead');
  const t = await page.locator('#inv .kpis').first().innerText();
  assert.match(t, /Valeur\s*\n\s*200 k€/i);                         // 185 000 + 15 000 : le patrimoine total ne change pas
  assert.equal(await page.locator('#inv .groupe-bien .bien-lie', {hasText: 'Garage · Studio Test'}).count(), 1);   // rangé sous son bien
});

test('espace à aménager : estimé une fois aménagé (moteur de l\'onglet Estimer), ajouté à Mes projets, puis travaux terminés', async () => {
  await ouvrirFiche('Studio Test');
  await page.click('#inv [data-a="amenagCreer"]');
  await page.waitForFunction(() => /^Sous-sol · Studio Test$/.test((document.getElementById('inv_titre') || {}).textContent));
  await champ('amenag.m2', 30);
  await page.click('#inv [data-a="amenagEstimer"]');
  await page.waitForSelector('#inv_amenagRes .auto-res', {timeout: 60000});
  const res = await page.locator('#inv_amenagRes').innerText();
  const valeur = nombre(res.match(/Valeur une fois aménagé\s*\n\s*([^\n]+)/i)[1]) * 1000, loyer = nombre(res.match(/Loyer possible\s*\n\s*([^\n]+)/i)[1]);
  assert.ok(valeur > 30000 && loyer > 150, `valeur ${valeur}, loyer ${loyer}`);
  // Coût total saisi à la main et location à la nuitée
  await champ('amenag.total', 42000);
  await page.waitForFunction(() => /Montant que tu as saisi/i.test(document.getElementById('inv_amenagRes').innerText));
  await champ('amenag.meuble', 'nuit');
  await page.waitForSelector('#inv [data-p="amenag.nuit"]');
  await champ('amenag.nuit', 80);
  await page.waitForFunction(() => /À la nuitée/i.test(document.getElementById('inv_amenagRes').innerText));
  const res2 = await page.locator('#inv_amenagRes').innerText();
  assert.match(res2, /80 € × 219 nuits/); assert.match(res2, /42\s000 €/);
  await champ('amenag.periode', 'ete');                              // loué seulement l'été : 27 % de l'année
  await page.waitForFunction(() => /80 € × 99 nuits/.test(document.getElementById('inv_amenagRes').innerText));
  await champ('amenag.periode', 'annee');
  await page.waitForFunction(() => /80 € × 219 nuits/.test(document.getElementById('inv_amenagRes').innerText));
  // Totaux : tant que ce n'est pas fait, l'espace ne compte pas comme un bien de plus
  await page.click('#inv [data-a="amenagProjet"]');
  await page.waitForFunction(() => /Ajouté dans/.test(document.getElementById('inv_amenagMsg').innerText));
  const c = await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Sous-sol · Studio Test'));
  const pr = c.projets.find(x => x.nom === 'Sous-sol · Studio Test');
  assert.equal(pr.finance.prix, 0); assert.equal(pr.finance.travaux, 42000); assert.equal(pr.finance.mobilier, 0); assert.equal(pr.amenag.bien, bienDuCompte('Sous-sol · Studio Test').id);
  assert.equal(pr.finance.locMode, 'nuit'); assert.equal(pr.finance.nuit, 80); assert.equal(pr.resume.saison.nuit, 80);
  await page.click('.tabs [data-tab="projets"]');
  const carte = page.locator('#pj .pj', {hasText: 'Sous-sol · Studio Test'});
  await carte.waitFor();
  const txt = await carte.innerText();                              // la carte dans Mes projets : travaux saisis, recettes à la nuitée
  assert.match(txt, /location saisonnière/i); assert.match(txt, /42\s000 €/); assert.match(txt, /80 € la nuit, 60 % d'occupation/);
  await carte.locator('[data-a="fiche"]').click();                 // « Voir la fiche » ramène dans Mon patrimoine
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements' && /^Sous-sol/.test((document.getElementById('inv_titre') || {}).textContent));
  await page.click('#inv [data-a="amenagFait"]');                  // confirm() accepté par le banc
  await page.waitForFunction(() => !document.getElementById('inv_amenagRes'));
  const b = (await attendreCompte(() => bienDuCompte('Sous-sol · Studio Test').amenag.fait)).biens.find(x => x.nom === 'Sous-sol · Studio Test');
  assert.ok(Math.abs(b.valeur - valeur) < 1000, `valeur ${b.valeur} ≈ ${valeur}`);
  assert.equal(b.achat.travaux, 42000); assert.equal(b.location.statut, 'saisonnier'); assert.equal(b.location.nuit, 80);
  await page.click('#inv a.retour');
  await page.waitForSelector('#inv .invhead');
  const t = await page.locator('#inv .kpis').first().innerText();
  assert.ok(Math.abs(nombre(t.match(/^Valeur\s*\n\s*([^\n]+)/im)[1]) * 1000 - (200000 + b.valeur)) < 1000, t);   // affiché en k€
});

test('location saisonnière dans une fiche : recettes à la nuitée, frais, cash-flow', async () => {
  await ouvrirFiche('Parking Test');
  await champ('location.statut', 'saisonnier');
  await page.waitForSelector('#inv [data-p="location.nuit"]');
  await champ('location.nuit', 80); await champ('location.nuitsAn', 200); await champ('location.fraisSaison', 25);
  assert.match(await page.locator('#inv_revTotal').innerText(), /1\s333 € par mois en moyenne \(80 € × 200 nuits ÷ 12\)/);
  assert.equal(nombre(await kpi('Cash-flow')), 1000);              // 16 000 € de recettes − 25 % de frais, sur 12 mois
});

test('simuler la vente : le détail s\'additionne, puis vente enregistrée (hors totaux) et annulée', async () => {
  await ouvrirFiche('Studio Test');
  await page.click('#inv [data-a="vente"]');
  await champ('vente.prix', 230000); await champ('vente.frais', 5);
  const calc = await page.locator('#inv_venteRes .calc').innerText();
  const l = re => { const m = calc.match(re); return m ? nombre(m[1]) : 0; };
  const prix = l(/Prix de vente\s+([^\n]+)/), frais = l(/Frais de vente\s+([^\n]+)/), crd = l(/Crédit remboursé[^\n]*?\)\s+([^\n]+)/),
    ira = l(/Indemnités[^\n]*\s+(−[^\n]+)/), ir = l(/Impôt sur la plus-value[^\n]*\)\s+([^\n]+)/), ps = l(/Prélèvements sociaux[^\n]*\)\s+([^\n]+)/), net = l(/Ce qui te revient\s+([^\n]+)/);
  assert.equal(prix, 230000); assert.equal(frais, -11500);
  assert.ok(crd < -130000 && ira < 0 && ir < 0 && ps < 0, calc);  // moins de 5 ans : imposé sans abattement
  assert.ok(Math.abs(prix + frais + crd + ira + ir + ps - net) <= 3, `${prix} ${frais} ${crd} ${ira} ${ir} ${ps} = ${net}`);
  await page.click('#inv [data-a="venteEnregistrer"]');
  await page.waitForSelector('#inv .vendu-bandeau');
  await page.click('#inv a.retour'); await page.waitForSelector('#inv .invhead');
  assert.equal(await page.locator('#inv details[data-pli="vendus"] a.bien', {hasText: 'Studio Test'}).count(), 1);
  assert.doesNotMatch(await page.locator('#inv details[data-pli="biens"]').innerText(), /^Studio Test$/m);
  const t = await page.locator('#inv .kpis').first().innerText();
  assert.doesNotMatch(t, /Restant dû\s*\n\s*1\d\d k€/i);          // le crédit du bien vendu ne compte plus
  assert.equal((await attendreCompte(() => bienDuCompte('Studio Test').vendu)).biens.find(b => b.nom === 'Studio Test').vendu.prix, 230000);
  await page.locator('#inv details[data-pli="vendus"] a.bien', {hasText: 'Studio Test'}).click();
  await page.click('#inv [data-a="venteAnnuler"]');
  await page.waitForFunction(() => !document.querySelector('#inv .vendu-bandeau'));
  await attendreCompte(() => !bienDuCompte('Studio Test').vendu);
});

test('SCI : création, bien rattaché, filtre par détenteur et totaux de la SCI', async () => {
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.click('#inv [data-a="ajoutSci"]');
  await page.waitForSelector('#inv [data-p="nom"]');
  await champ('nom', 'SCI Famille'); await champ('regime', 'is');
  const sci = (await attendreCompte(c => (c.scis || []).some(x => x.nom === 'SCI Famille' && x.regime === 'is'))).scis.find(x => x.nom === 'SCI Famille');
  await ouvrirFiche('Parking Test');
  await page.selectOption('#inv_detention', sci.id);
  await page.waitForSelector('#inv a[href^="#investissements/sci:"]');
  assert.match(await page.locator('#inv_sous').innerText(), /SCI Famille/);
  await attendreCompte(() => bienDuCompte('Parking Test').sciId === sci.id);
  await page.click('#inv a.retour'); await page.waitForSelector('#inv .filtres');
  await page.click(`#inv .filtres [data-f="${sci.id}"]`);
  const liste = await page.locator('#inv details[data-pli="biens"] .liste').innerText();
  assert.match(liste, /Parking Test/); assert.doesNotMatch(liste, /Studio Test/);
  await page.click('#inv .filtres [data-f="np"]');
  assert.doesNotMatch(await page.locator('#inv details[data-pli="biens"] .liste').innerText(), /Parking Test/);
  await page.click('#inv .filtres [data-f="tout"]');
  assert.match(await page.locator('#inv details[data-pli="scis"]').innerText(), /SCI Famille[\s\S]*SCI à l'IS · 1 bien/i);
});

test('Mes projets : enregistré depuis Financer, rouvert, mis à jour (pas de doublon), supprimé', async () => {
  const e = await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  await page.click('#works button.cta');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.fill('#cf_nomProjet', 'Projet Lyon 45');
  await page.click('#cf_enreg');
  await page.waitForFunction(() => /Enregistré dans/.test(document.getElementById('cf_saveMsg').innerText));
  let c = await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Projet Lyon 45'));
  const n = c.projets.length, pr = c.projets.find(x => x.nom === 'Projet Lyon 45');
  assert.equal(pr.finance.prix, Math.round(e.prix));
  await page.click('.tabs [data-tab="projets"]');
  const carte = page.locator('#pj .pj', {hasText: 'Projet Lyon 45'});
  await carte.locator('[data-a="financer"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(+await page.inputValue('#cf_prix'), Math.round(e.prix));
  await saisir(page, '#cf_apport', 40000);
  await page.click('#cf_enreg');
  c = await attendreCompte(c => c.projets.find(x => x.id === pr.id).finance.apport === 40000, 'projet mis à jour');
  assert.equal(c.projets.length, n);
  await page.click('.tabs [data-tab="projets"]');
  await carte.locator('[data-a="suppr"]').click();
  await page.waitForFunction(() => !/Projet Lyon 45/.test(document.getElementById('pj').innerText));
  c = await attendreCompte(c => !c.projets.some(x => x.id === pr.id), 'projet supprimé');
  assert.ok(c.supprimes[pr.id]);
});

test('Estimer : « Enregistrer mon estimation » range l\'estimation dans Mes projets', async () => {
  await estimer(page, {surf: 52});
  await page.fill('#est_nom', 'Estimation 52 m²');
  await page.click('#est_enreg');
  await page.waitForFunction(() => /Enregistré dans/.test(document.getElementById('sauveEst').innerText));
  const pr = (await attendreCompte(c => c.projets.some(x => x.nom === 'Estimation 52 m²'))).projets.find(x => x.nom === 'Estimation 52 m²');
  assert.equal(pr.finance.surf, 52); assert.ok(pr.recherche && pr.recherche.surf === 52);
  assert.equal(await onglet(), 'estimation');                        // on reste sur Estimer
});

test('« + Ajouter le bien estimé » : fiche créée avec adresse, surface, valeur et loyer de l\'estimation, puis « Estimer ce bien »', async () => {
  const e = await estimer(page, {surf: 52});
  await page.click('.tabs [data-tab="investissements"]');
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.click('#inv [data-a="ajoutEst"]');
  await page.waitForSelector('#inv_titre');
  assert.equal(await page.inputValue('#inv [data-p="surface"]'), '52');
  assert.equal(+await page.inputValue('#inv [data-p="valeur"]'), Math.round(e.prix));
  assert.equal(+await page.inputValue('#inv [data-p="location.loyer"]'), Math.round(e.loyer));
  await page.click('#inv [data-a="estimerAuto"]');
  await page.waitForFunction(() => /Estimé|estimé/.test((document.getElementById('inv_auto') || {}).innerText || ''), null, {timeout: 60000});
  const nom = await page.locator('#inv_titre').innerText();
  const b = (await attendreCompte(() => (bienDuCompte(nom) || {}).estimation)).biens.find(x => x.nom === nom);
  assert.ok(!b.estimation.erreur, JSON.stringify(b.estimation));
  assert.ok(Math.abs(b.estimation.prix - e.prix) / e.prix < 0.05, `fiche ${b.estimation.prix} / onglet ${e.prix}`);   // même moteur, même bien
});

test('déconnexion : Mon patrimoine et Mes projets se ferment, rien ne reste sur l\'appareil', async () => {
  await page.evaluate(() => ouvrirCompte());
  await page.click('#cpt_out');
  await page.waitForFunction(() => !document.body.classList.contains('connecte') && document.body.dataset.onglet === 'estimation');
  const reste = await page.evaluate(() => ({projets: localStorage.getItem('projets-v1'), courant: localStorage.getItem('projet-courant'), recentes: RECENTES.liste.length}));
  assert.deepEqual(reste, {projets: '[]', courant: null, recentes: 0});
  assert.equal(await page.locator('.tabs [data-tab="investissements"]').isVisible(), false);
  // Reconnexion : tout revient du compte
  await seConnecter(page, EMAIL, MDP, false);
  await page.waitForFunction(() => PROJETS.liste.length > 0);
  await page.click('.tabs [data-tab="investissements"]');
  await page.waitForSelector('#inv a.bien >> text=Studio Test');
});
