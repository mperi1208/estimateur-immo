// Parcours avec un compte : Mon patrimoine (bien, achat, crédit, location, garage, espace à aménager, vente, SCI),
// Mes projets (depuis Financer et Estimer), deux appareils sur le même compte, déconnexion
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, saisir, nombre, cliquer, versEtape, travaux} = require('./banc');

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
// Carte d'un bien par son nom (une autre carte peut citer ce nom : « Crédit commun avec … »)
const carteBien = nom => page.locator('#inv a.bien').filter({has: page.locator('.infos > b', {hasText: new RegExp('^' + nom + '$')})});
const ouvrirFiche = async nom => {
  if (await onglet() !== 'investissements') await page.click('.tabs [data-tab="investissements"]');
  await page.evaluate(() => { location.hash = '#investissements'; });
  await carteBien(nom).first().click();
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
  assert.equal(nombre(await kpi('Loyers')), 800);                                  // le rendement a laissé la place aux loyers
  assert.doesNotMatch(await page.locator('#inv').innerText(), /Rendement/i);
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

test('mode simple : loyer, crédit, charges et ce qu\'il reste (liste, fiche, Financer), puis retour en Pro', async () => {
  const M = pmt(150000, 3, 240), reste = Math.round(800 - 900 / 12 - M);
  await page.click('.tabs [data-mode="simple"]');
  await page.waitForSelector('#inv .bilan-simple');
  assert.equal(await page.locator('#inv .kpis.six').count(), 0);
  const t = await page.locator('#inv .bilan-simple').first().innerText();
  assert.match(t, /Loyers\s*\+\s*800 €/i); assert.match(t, /Charges[^\n]*\s*−\s*75 €/i); assert.match(t, new RegExp('Mensualité du crédit\\s*−\\s*' + Math.round(M) + ' €', 'i'));
  assert.equal(nombre(t.match(/Il te (?:reste|manque)\s*([^\n]+) par mois/i)[1]), Math.abs(reste));
  assert.match(t, new RegExp('Le loyer paie ' + Math.round(800 / M * 100) + ' % de la mensualité', 'i'));
  assert.match(await carteBien('Studio Test').innerText(), /Il te (reste|manque)/i);
  await ouvrirFiche('Studio Test');
  assert.match(await page.locator('#inv_kpis .bilan-simple').innerText(), /Il te (reste|manque)/i);
  assert.equal(await page.locator('#inv_renta').isVisible(), false);                  // le détail du cash-flow reste en Pro
  assert.match(await page.locator('#inv_kpis').innerText(), /À rembourser/i);           // valeur, à rembourser, à toi : sous le bilan
  assert.equal(await page.locator('#inv [data-p="achat.prix"]').isVisible(), false);   // le formulaire complet est replié…
  await page.click('#inv details.fiche-detail > summary');                             // … et s'ouvre d'un clic
  assert.equal(await page.locator('#inv [data-p="achat.prix"]').isVisible(), true);
  await page.click('.tabs [data-tab="cashflow"]');
  await page.waitForFunction(() => /Il te (reste|manque)/i.test(document.getElementById('cf_simple').innerText));
  assert.equal(await page.locator('#cf_boxDetail').isVisible(), false);
  assert.equal(await page.locator('#cf_tiles').isVisible(), false);
  await versEtape(page, '#cf_prix'); assert.equal(await page.locator('#cf_prix').isVisible(), true);
  await page.click('.tabs [data-mode="pro"]');
  await page.waitForFunction(() => !document.body.classList.contains('simple'));
  await versEtape(page, '#cf_tiles'); assert.equal(await page.locator('#cf_tiles').isVisible(), true);
  assert.match(await page.locator('#cf_simple').innerText(), /Un mois type/i);    // le mois type reste, sous les 3 chiffres
  assert.equal(await page.evaluate(() => localStorage.getItem('mode-affichage')), 'pro');
  await page.click('.tabs [data-tab="investissements"]');
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.waitForSelector('#inv .kpis.six');
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
  // « Pour le louer » : trois boutons visibles, dont « À la nuitée »
  assert.deepEqual(await page.locator('#inv [data-cible="inv_amenag_meuble"]').allInnerTexts(), ['Vide', 'Meublé', 'À la nuitée']);
  await page.click('#inv [data-cible="inv_amenag_meuble"][data-v="nuit"]');
  await page.waitForSelector('#inv [data-p="amenag.nuit"]');
  assert.equal(await page.locator('#inv [data-cible="inv_amenag_meuble"].on').innerText(), 'À la nuitée');
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
  // Pas encore fait : absent de la liste de Mon patrimoine (et de l'organisation), seulement dans Mes projets
  await page.click('#inv a.retour'); await page.waitForSelector('#inv .invhead');
  assert.equal(await page.locator('#inv', {hasText: 'Sous-sol · Studio Test'}).count(), 0);
  await page.click('.tabs [data-tab="projets"]');
  const carte = page.locator('#pj .pj', {hasText: 'Sous-sol · Studio Test'});
  await carte.waitFor();
  const txt = await carte.innerText();                              // la carte dans Mes projets : travaux saisis, recettes à la nuitée
  assert.match(txt, /saisonnier/i); assert.match(txt, /42\s000 €/); assert.match(txt, /Il te (reste|manque) par mois/i); assert.doesNotMatch(txt, /la nuit, 60 % d'occupation/);   // carte simple : le détail est dans Financer
  await carte.locator('.pj-menu summary').click();                // actions rares derrière « ⋯ »
  await carte.locator('[data-a="fiche"]').click();                 // « Voir la fiche » ramène dans Mon patrimoine
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements' && /^Sous-sol/.test((document.getElementById('inv_titre') || {}).textContent));
  await page.click('#inv [data-a="amenagFait"]');                  // confirm() accepté par le banc
  await page.waitForFunction(() => !document.getElementById('inv_amenagRes'));
  const b = (await attendreCompte(() => bienDuCompte('Sous-sol · Studio Test').amenag.fait)).biens.find(x => x.nom === 'Sous-sol · Studio Test');
  assert.ok(Math.abs(b.valeur - valeur) < 1000, `valeur ${b.valeur} ≈ ${valeur}`);
  assert.equal(b.achat.travaux, 42000); assert.equal(b.location.statut, 'saisonnier'); assert.equal(b.location.nuit, 80);
  await page.click('#inv a.retour');
  await page.waitForSelector('#inv .invhead');
  assert.equal(await page.locator('#inv .groupe-bien .bien-lie', {hasText: 'Sous-sol · Studio Test'}).count(), 1);   // fait : il rejoint la liste
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
  await champ('vente.prix', 230000);
  await page.click('#inv [data-a="venteAgence"][data-v="0"]');     // sans agence : montant fixe en euros, 600 € par défaut
  await page.waitForFunction(() => /−600 €/.test(document.querySelector('#inv_venteRes .calc').innerText));
  await champ('vente.fraisFixe', 450);
  await page.waitForFunction(() => /−450 €/.test(document.querySelector('#inv_venteRes .calc').innerText));
  await page.click('#inv [data-a="venteAgence"][data-v="1"]');
  await page.waitForSelector('#inv_vente_frais');
  await champ('vente.frais', 5);
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

test('comptable de la SCI : honoraires saisis sur la SCI, comptés dans les charges du bien qui le choisit', async () => {
  const sci = compte().scis.find(x => x.nom === 'SCI Famille');
  await page.evaluate(id => { location.hash = '#investissements/sci:' + id; }, sci.id);
  await page.waitForSelector('#inv [data-p="compta"]');
  assert.match(await page.locator('#inv').innerText(), /choisis « Oui, comptable de la SCI »/i);
  await champ('compta', 1200);
  await attendreCompte(c => c.scis.find(x => x.id === sci.id).compta === 1200);
  await ouvrirFiche('Parking Test');
  const avant = nombre(await kpi('Cash-flow'));
  // Bloc Cash-flow : chaque ligne par an et par mois, la colonne par mois reprend le KPI
  assert.match(await page.locator('#inv_renta .l2.tete').innerText(), /Par an\s+Par mois/i);
  const [cfAn, cfMois] = (await page.locator('#inv_renta .l2').filter({hasText: 'Cash-flow'}).first().locator(':scope > b').allInnerTexts()).map(nombre);
  assert.equal(cfMois, avant);
  assert.ok(Math.abs(cfAn / 12 - cfMois) <= 1);
  const bouton = l => page.locator('#inv [data-a="segChoix"][data-cible="inv_chargesAn_comptaSci"]', {hasText: l});
  assert.equal(await bouton('Oui, comptable de la SCI').isVisible(), true);       // l'option se voit sans ouvrir de menu
  await bouton('Oui, comptable de la SCI').click();
  await page.waitForSelector('#inv [data-p="chargesAn.compta"]', {state: 'detached'});
  assert.match(await page.locator('#inv').innerText(), /Part de ce bien : 1\s200\s€\/an, honoraires saisis dans la fiche de SCI Famille/i);
  assert.equal(await page.locator('#inv [data-p="chargesAn.compta"]').count(), 0);   // plus de montant à saisir pour ce bien
  assert.equal(nombre(await kpi('Cash-flow')), avant - 100);                        // 1 200 €/an = 100 €/mois en moins
  await attendreCompte(() => bienDuCompte('Parking Test').chargesAn.comptaSci === '1');
  await bouton('Non, montant pour ce bien').click();
  await page.waitForSelector('#inv [data-p="chargesAn.compta"]');
  assert.equal(nombre(await kpi('Cash-flow')), avant);
});

test('crédit progressif et différé : boutons visibles, mensualité actuelle qui augmente, différé partiel', async () => {
  await ouvrirFiche('Studio Test');
  await page.click('#inv [data-a="ajoutPret"]');
  await champ('prets.1.montant', 101058); await champ('prets.1.taux', 3.7); await champ('prets.1.duree', 300); await champ('prets.1.debut', mois(-5));
  const resume = () => page.locator('[data-resume="1"]').innerText();
  const bouton = (cible, l) => page.locator(`#inv [data-a="segChoix"][data-cible="${cible}"]`, {hasText: l});
  assert.match(await resume(), /Mensualité\s*\n\s*517 €/i);                               // constante : calculée
  assert.equal(await bouton('inv_prets_1_progressif', 'Progressive').isVisible(), true);
  await bouton('inv_prets_1_progressif', 'Progressive').click();
  await page.waitForSelector('#inv [data-p="prets.1.hausse"]');
  assert.match(await resume(), /saisis ta mensualité actuelle/i);
  await champ('prets.1.mensualite', 497);
  let r = await resume();
  assert.match(r, /Mensualité\s*\n\s*497 €/i);
  assert.match(r, /Mensualité progressive : \+0,\d\d % par an \(calculée/i);
  assert.match(r, /Fin du prêt\s*\n\s*[^\n]+ \d{4}/i);
  await attendreCompte(() => (p => p && p.progressif === '1' && p.mensualite === 497 && p.mensuLe === mois(0))(bienDuCompte('Studio Test').prets[1]));
  await bouton('inv_prets_1_typeDiff', 'Partiel').click();
  await page.waitForSelector('#inv [data-p="prets.1.differe"]');
  await champ('prets.1.differe', 12);                                                       // fini dans 6 mois
  r = await resume();
  assert.match(r, /Différé partiel jusqu'en/i);
  assert.match(r, /Mensualité\s*\n\s*312 €/i);                                            // intérêts seuls : 101 058 × 3,7 % / 12
  assert.match(r, /Restant dû\s*\n\s*101\s058 €/i);
  await bouton('inv_prets_1_typeDiff', 'Sans différé').click();
  await page.waitForSelector('#inv [data-p="prets.1.differe"]', {state: 'detached'});
  await page.locator('#inv [data-a="supprPret"][data-i="1"]').click();
  await page.waitForSelector('[data-resume="1"]', {state: 'detached'});
  await attendreCompte(() => bienDuCompte('Studio Test').prets.length === 1);
});

test('pause du crédit et durée allongée : mensualité, fin du prêt et tableau d\'amortissement recalculés', async () => {
  await ouvrirFiche('Studio Test');
  await page.click('#inv [data-a="ajoutPret"]');
  await champ('prets.1.montant', 200000); await champ('prets.1.taux', 3); await champ('prets.1.duree', 240); await champ('prets.1.debut', mois(-12));
  const resume = () => page.locator('[data-resume="1"]').innerText();
  const fin = async () => (await resume()).match(/Fin du prêt\s*\n\s*([^\n]+)/i)[1];
  const finAvant = await fin();
  // Pause de 6 mois qui a commencé le mois dernier : rien à payer, prêt rallongé de 6 mois
  await page.click('#inv [data-a="ajoutPause"][data-i="1"]');
  await page.waitForSelector('#inv [data-p="prets.1.pauses.0.debut"]');
  await champ('prets.1.pauses.0.debut', mois(-1));
  let r = await resume();
  assert.match(r, /Pause jusqu'en [^\n]+ : rien à payer/i);
  assert.match(r, /Mensualité \(en pause\)\s*\n\s*0 €/i);
  assert.match(r, /prêt rallongé de 6 mois/i);
  assert.notEqual(await fin(), finAvant);
  await attendreCompte(() => (p => p && p.pauses && p.pauses[0].mois === 6 && p.pauses[0].debut === mois(-1))(bienDuCompte('Studio Test').prets[1]));
  // Même fin, mensualité plus haute
  await page.locator('#inv [data-a="segChoix"][data-cible="inv_prets_1_pauses_0_suite"]', {hasText: 'Même fin'}).click();
  await page.waitForFunction(() => !/prêt rallongé/i.test(document.querySelector('[data-resume="1"]').innerText));
  assert.equal(await fin(), finAvant);
  // Tableau d'amortissement : l'année de la pause est signalée
  await page.locator('[data-resume="1"] details.amort summary').click();
  assert.match(await page.locator('[data-resume="1"] details.amort').innerText(), /pause \d mois/i);
  await champ('prets.1.assurance', 10);                                                    // le tableau reste ouvert
  assert.equal(await page.locator('[data-resume="1"] details.amort').evaluate(d => d.open), true);
  await page.click('#inv [data-a="supprPause"][data-i="1"][data-j="0"]');
  await page.waitForSelector('#inv [data-p="prets.1.pauses.0.debut"]', {state: 'detached'});
  // Allonger de 3 ans : simulation, puis enregistré sur le prêt
  await page.click('#inv [data-a="allongeOuvrir"][data-i="1"]');
  await page.waitForSelector('#inv [data-p="prets.1.allonge.ans"]');
  const al = () => page.locator('[data-allonge="1"]').innerText();
  r = await al();
  assert.match(r, /20 ans → 23 ans/i);
  assert.match(r, /Intérêts en plus\s*\n\s*\+/i);
  const nouvelle = nombre(r.match(/Nouvelle mensualité\s*\n\s*([^\n]+)/i)[1]);
  assert.ok(nouvelle < 1109 && nouvelle > 950, `nouvelle mensualité ${nouvelle}`);
  assert.equal(await fin(), finAvant);                                                     // pas encore enregistré
  await page.click('#inv [data-a="allongeFaire"][data-i="1"]');
  await page.waitForSelector('#inv [data-a="allongeAnnuler"]');
  assert.notEqual(await fin(), finAvant);
  await attendreCompte(() => (x => x && x.fait === '1' && x.ans === 3)(bienDuCompte('Studio Test').prets[1].allonge));
  await page.click('#inv [data-a="allongeAnnuler"][data-i="1"]');
  await page.waitForSelector('#inv [data-a="allongeFaire"]');
  assert.equal(await fin(), finAvant);
  await page.locator('#inv [data-a="supprPret"][data-i="1"]').click();
  await page.waitForSelector('[data-resume="1"]', {state: 'detached'});
  await attendreCompte(() => bienDuCompte('Studio Test').prets.length === 1);
});

test('un seul crédit pour deux biens : prêt partagé au prorata des prix, chaque fiche compte sa part', async () => {
  const nouveau = async (nom, valeur, prix, loyer) => {
    await page.evaluate(() => { location.hash = '#investissements'; });
    await page.waitForSelector('#inv .invhead');
    await page.click('#inv [data-a="ajout"]');
    await page.waitForSelector('#inv_titre');
    await champ('nom', nom); await champ('valeur', valeur); await champ('achat.prix', prix); await champ('location.loyer', loyer);
  };
  await nouveau('T2 Vendeur', 110000, 100000, 500);
  await nouveau('T3 Vendeur', 160000, 150000, 700);
  await page.click('#inv [data-a="ajoutPret"]');
  await champ('prets.0.montant', 250000); await champ('prets.0.taux', 3.5); await champ('prets.0.duree', 240); await champ('prets.0.debut', mois(-12));
  const M = pmt(250000, 3.5, 240);
  const boutonT2 = page.locator('#inv .partage [data-a="partagePret"]', {hasText: 'T2 Vendeur'});
  assert.equal(await boutonT2.isVisible(), true);                                   // bouton visible, pas de menu
  await boutonT2.click();
  await page.waitForSelector('#inv [data-p="prets.0.partage.0.part"]');
  assert.equal(await page.locator('#inv [data-p="prets.0.partage.0.part"]').inputValue(), '40');   // 100 000 / 250 000
  assert.match(await page.locator('#inv .part-porteur').innerText(), /60 %/);
  const resume = await page.locator('[data-resume="0"]').innerText();
  assert.match(resume, /Part de ce bien \(60 %\)/i);
  const crd = nombre(resume.match(/Restant dû\s*\n\s*([^\n]+)/i)[1]);
  assert.ok(Math.abs(nombre(await kpi('Restant dû')) * 1000 - crd * 0.6) < 600, 'restant dû de T3 : 60 %');
  assert.equal(nombre(await kpi('Cash-flow')), Math.round(700 - M * 0.6));
  await attendreCompte(() => (p => p && p.partage && p.partage[0].part === 40)((bienDuCompte('T3 Vendeur') || {prets: []}).prets[0]));
  // Fiche du T2 : sa part du prêt, en lecture
  await ouvrirFiche('T2 Vendeur');
  const recu = await page.locator('#inv .pret.recu').innerText();
  assert.match(recu, /commun avec\s*T3 Vendeur/i); assert.match(recu, /Part de ce bien\s*\n\s*40 %/i);
  assert.equal(nombre(await kpi('Cash-flow')), Math.round(500 - M * 0.4));
  assert.ok(Math.abs(nombre(await kpi('Restant dû')) * 1000 - crd * 0.4) < 600, 'restant dû de T2 : 40 %');
  // Liste : étiquette sur les deux cartes
  await page.click('#inv a.retour');
  assert.match(await carteBien('T2 Vendeur').innerText(), /Crédit commun avec T3 Vendeur/i);
  assert.match(await carteBien('T3 Vendeur').innerText(), /Crédit commun avec T2 Vendeur/i);
  // Part changée à la main, puis le T2 retiré du prêt
  await ouvrirFiche('T3 Vendeur');
  await champ('prets.0.partage.0.part', 50);
  await page.waitForFunction(() => /50 %/.test(document.querySelector('#inv .part-porteur').innerText));
  assert.equal(nombre(await kpi('Cash-flow')), Math.round(700 - M * 0.5));
  await page.locator('#inv .partage [data-a="partagePret"]', {hasText: 'T2 Vendeur'}).click();
  await page.waitForSelector('#inv .part-porteur', {state: 'detached'});
  assert.equal(nombre(await kpi('Cash-flow')), Math.round(700 - M));
  for (const nom of ['T2 Vendeur', 'T3 Vendeur']) { await ouvrirFiche(nom); await page.click('#inv [data-a="supprimer"]'); await page.waitForSelector('#inv .invhead'); }
  await attendreCompte(c => !c.biens.some(b => /Vendeur/.test(b.nom)), 'biens du test supprimés');
});

test('rachat de crédit : simulation modifiable (taux, durée, frais, renégociation), résultats recalculés', async () => {
  await ouvrirFiche('Studio Test');
  const res = () => page.locator('[data-rachat="0"]').innerText();
  assert.match(await page.locator('[data-resume="0"]').innerText(), /Aux taux d'aujourd'hui/i);
  await page.click('#inv [data-a="rachatOuvrir"][data-i="0"]');
  await page.waitForSelector('#inv [data-p="prets.0.rachat.taux"]');
  assert.doesNotMatch(await page.locator('[data-resume="0"]').innerText(), /Aux taux d'aujourd'hui/i);   // remplacé par la simulation
  const bouton = (cible, l) => page.locator(`#inv [data-a="segChoix"][data-cible="${cible}"]`, {hasText: l});
  assert.equal(await bouton('inv_prets_0_rachat_mode', 'renégociation').isVisible(), true);
  await champ('prets.0.rachat.taux', 2); await champ('prets.0.rachat.ira', 0); await champ('prets.0.rachat.dossier', 0); await champ('prets.0.rachat.garantie', 0);
  let r = await res();
  const crd = nombre(r.match(/Capital à rembourser\s*\n?\s*([^\n]+?€)/i)[1]);
  assert.ok(crd > 135000 && crd < 145000, `restant dû ${crd}`);
  assert.match(r, /Rentable après\s*\n\s*1 mois/i);                                       // aucun frais : rentable tout de suite
  assert.ok(nombre(r.match(/Gain net\s*\n\s*([^\n]+)/i)[1]) > 10000);
  await champ('prets.0.rachat.duree', 120);
  r = await res();
  assert.match(r, /Durée restante\s*\d+ mois\s*120 mois/i);
  assert.ok(nombre(r.match(/Nouvelle mensualité\s*\n\s*([^\n]+)/i)[1]) > 1200);            // 10 ans : mensualité plus haute
  await bouton('inv_prets_0_rachat_mode', 'renégociation').click();
  await page.waitForSelector('#inv [data-p="prets.0.rachat.avenant"]');
  assert.equal(await page.locator('#inv [data-p="prets.0.rachat.ira"]').count(), 0);
  assert.match(await res(), /Frais d'avenant[^\n]*\n?\s*—\s*\n?\s*600 €/i);
  await bouton('inv_prets_0_rachat_finance', 'Ajoutés').click();
  await page.waitForFunction(() => /Frais ajoutés au nouveau prêt/i.test(document.querySelector('[data-rachat="0"]').innerText));
  await attendreCompte(() => (r => r && r.ouvert && r.taux === 2 && r.duree === 120 && r.mode === 'reneg' && r.finance === '1')(bienDuCompte('Studio Test').prets[0].rachat));
  await page.click('#inv [data-a="rachatFermer"]');
  await page.waitForSelector('#inv [data-p="prets.0.rachat.taux"]', {state: 'detached'});
  assert.match(await page.locator('[data-resume="0"]').innerText(), /Aux taux d'aujourd'hui/i);
});

test('Mes projets : enregistré depuis Financer, rouvert, mis à jour (pas de doublon), supprimé', async () => {
  const e = await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.fill('#cf_nomProjet', 'Projet Lyon 45');
  await cliquer(page, '#cf_enreg');
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
  await cliquer(page, '#cf_enreg');
  c = await attendreCompte(c => c.projets.find(x => x.id === pr.id).finance.apport === 40000, 'projet mis à jour');
  assert.equal(c.projets.length, n);
  await page.click('.tabs [data-tab="projets"]');
  assert.ok(c.projets.find(x => x.id === pr.id).resume.mois, 'détail du mois enregistré pour le mode simple');
  await page.click('.tabs [data-mode="simple"]');                                   // mode simple : le bilan du mois remplace les chiffres
  await carte.locator('.bilan-simple').waitFor();
  assert.match(await carte.innerText(), /Il te (reste|manque)[\s\S]*Mensualité du crédit/i);
  assert.equal(await carte.locator('.pj-chiffres').count(), 0);
  await page.click('.tabs [data-mode="pro"]');
  await carte.locator('.pj-chiffres').waitFor();
  // mode pro : les trois chiffres des tuiles de Financer
  assert.deepEqual((await carte.locator('.pj-chiffres span').allInnerTexts()).map(x => x.toLowerCase()).slice(0, 2), ['prix du projet', 'mensualité']);
  assert.match(await carte.locator('.pj-chiffres').innerText(), /Il te (reste|manque) par mois/i);
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

test('« Revoir l\'estimation » puis travaux (division) : ajoutés comme option du même projet, pas comme nouveau projet', async () => {
  const pr = await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'Estimation 52 m²'));
  await page.click('.tabs [data-tab="projets"]');
  await page.evaluate(id => document.querySelector(`#pj [data-id="${id}"] [data-a="estimer"], #pj [data-a="estimer"][data-id="${id}"]`).click(), pr.id);
  await page.waitForFunction(() => document.body.dataset.onglet === 'estimation' && state.loyerHC);
  // même en-tête que Financer : le projet, puis les 4 étapes (« Le bien » ouverte)
  await page.waitForFunction(() => !document.getElementById('est_tete').hidden);
  assert.match(await page.locator('#est_tete .bienbar').innerText(), /Mes projets › Estimation 52 m²/);
  assert.equal(await page.locator('#est_tete [aria-current="step"]').innerText(), '1\nLe bien');
  assert.match(await page.locator('#sauveEst').innerText(), /Mettre à jour l'estimation dans « Estimation 52 m² »/);
  await travaux(page, 'diviser');
  await page.click('#w_calc');
  await page.waitForFunction(() => state.projet && state.projet.lots === 2, null, {timeout: 40000});
  const pj = await page.evaluate(() => state.projet), nb = await page.evaluate(() => PROJETS.liste.length);
  assert.match(await page.locator('#w_option').innerText(), /option de « Estimation 52 m² »/i);
  await page.evaluate(() => { window.promptAvant = window.prompt; window.prompt = () => 'Division'; });
  await page.click('#w_option');
  await page.evaluate(() => { window.prompt = window.promptAvant; });
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  const opt = await page.evaluate(() => PROJETS.liste.find(x => x.branche === 'Division'));
  assert.equal(await page.evaluate(() => PROJETS.liste.length), nb + 1);
  assert.equal(opt.nom, 'Estimation 52 m²'); assert.equal(opt.groupe, (await page.evaluate(id => PROJETS.liste.find(x => x.id === id), pr.id)).groupe);
  assert.equal(opt.finance.travaux, pj.travaux); assert.equal(+opt.finance.loyerAvant, +pr.finance.loyer);
  assert.equal(opt.finance.loyer, pj.loyers[0]); assert.equal(opt.finance.loyer2, pj.loyers[1]);
  assert.equal(+await page.inputValue('#cf_loyer2'), pj.loyers[1]);
  await saisir(page, '#cf_debutTravaux', 25);
  assert.equal(+await page.inputValue('#cf_debutLoyer2'), 24 + pj.duree + 1);
  // Rangement pour les tests suivants : option retirée, projet refermé
  await page.evaluate(() => { const o = PROJETS.liste.find(x => x.branche === 'Division'); PROJETS.supprimer(o.id); deplier(o.groupe, false); fixerProjet(null); });
  await page.click('.tabs [data-tab="estimation"]');
  await travaux(page, 'non');
});

test('projet en cours : en haut d\'Estimer et de Financer, gardé au rechargement, pas quitté en changeant d\'adresse, quitté d\'un clic', async () => {
  const pr = await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'Estimation 52 m²'));
  await page.click('.tabs [data-tab="projets"]');
  await page.locator('#pj .pj', {hasText: 'Estimation 52 m²'}).locator('[data-a="financer"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.waitForSelector('#cf_fil:not([hidden])');
  assert.match(await page.locator('#cf_fil').innerText(), /Mes projets › Estimation 52 m²/);
  // rechargement : toujours dans le projet
  await page.goto(`${require('./banc').ORIGINE}/app/index.html#cashflow`);
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow' && /Estimation 52 m²/.test(document.getElementById('cf_fil').innerText), null, {timeout: 10000});
  // Estimer : le projet est en haut ; une autre adresse ne fait pas sortir du projet, mais c'est dit
  await page.click('.tabs [data-tab="estimation"]');
  await page.waitForFunction(() => /Estimation 52 m²/.test(document.getElementById('est_tete').innerText));
  await page.evaluate(() => { const r = PROJETS.liste.find(x => x.nom === 'Estimation 52 m²').recherche; state.prix = null; reprendre({...r, lat: r.lat + 0.003, lon: r.lon + 0.003, label: 'Autre adresse'}); });
  await page.waitForFunction(() => state.prix != null && state.loyerHC != null && /n'est pas celle du projet/.test(document.getElementById('est_tete').innerText), null, {timeout: 20000});
  assert.match(await page.locator('#sauveEst').innerText(), /Enregistrer comme nouveau projet/i);
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.match(await page.locator('#cf_fil').innerText(), /Estimation 52 m²[\s\S]*pas celui du projet/);
  assert.equal(await page.evaluate(() => projetCourantId), pr.id);
  assert.equal(await page.locator('#cf_enreg').innerText(), 'Enregistrer comme nouveau projet');
  // retour au bien du projet : son estimation se met de nouveau à jour
  await page.click('.tabs [data-tab="estimation"]');
  await page.click('#est_revoir');
  await page.waitForSelector('#est_maj', {timeout: 20000});
  await page.click('.tabs [data-tab="cashflow"]');
  assert.doesNotMatch(await page.locator('#cf_fil').innerText(), /pas celui du projet/);
  assert.equal(await page.locator('#cf_enreg').innerText(), 'Mettre à jour « Estimation 52 m² »');
  // quitter le projet : plus de fil d'Ariane, Enregistrer créera un nouveau projet
  await page.click('#cf_quitter');
  assert.equal(await page.locator('#cf_fil').isHidden(), true);
  assert.equal(await page.locator('#cf_enreg').innerText(), 'Enregistrer dans mes projets');
  assert.equal(await page.evaluate(() => projetCourantId), null);
  await page.click('.tabs [data-tab="estimation"]');
  assert.equal(await page.locator('#est_tete').isHidden(), true);
  assert.match(await page.locator('#sauveEst').innerText(), /Enregistrer dans Mes projets/i);
});

test('options d\'un projet : même bien partout ; son estimation revue (même à côté sur la carte) se met à jour dans toutes', async () => {
  const pr = await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'Estimation 52 m²'));
  assert.ok(pr.recherche.bien, 'le bien a un identifiant');
  await page.evaluate(id => { const p = window.prompt; window.prompt = () => 'Variante'; nouvelleBranche(id); window.prompt = p; }, pr.id);
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  const opt = await page.evaluate(() => PROJETS.liste.find(x => x.branche === 'Variante'));
  assert.equal(opt.recherche.bien, pr.recherche.bien);
  await page.evaluate(id => ouvrirProjet(id, 'estimation'), opt.id);
  await page.waitForSelector('#est_maj', {timeout: 20000});
  // 11 m plus loin sur la carte, et 55 m² : toujours le bien du projet
  await page.evaluate(() => { const r = PROJETS.liste.find(x => x.branche === 'Variante').recherche; state.prix = null; reprendre({...r, lat: r.lat + 0.0001, surf: 55}); });
  await page.waitForFunction(() => state.prix != null && state.loyerHC != null && state.base && state.base.surf === 55, null, {timeout: 20000});
  await page.waitForSelector('#est_maj');
  assert.doesNotMatch(await page.locator('#est_tete').innerText(), /pas celle du projet/);
  await page.click('#est_maj');
  await page.waitForFunction(() => /dans ses 2 options/.test(document.getElementById('sauveEst').innerText));
  const c = await attendreCompte(c => c.projets.filter(x => x.nom === 'Estimation 52 m²' && x.recherche && x.recherche.surf === 55).length === 2, 'estimation mise à jour dans les 2 options');
  const bs = c.projets.filter(x => x.nom === 'Estimation 52 m²');
  assert.deepEqual([...new Set(bs.map(x => x.recherche.bien))], [pr.recherche.bien]);
  // Rangement : option retirée, projet quitté
  await page.evaluate(() => { const o = PROJETS.liste.find(x => x.branche === 'Variante'); PROJETS.supprimer(o.id); deplier(o.groupe, false); quitterProjet(); });
});

test('Mes projets : deux projets financés par un seul crédit', async () => {
  const e = await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.fill('#cf_nomProjet', 'Lot A');
  await cliquer(page, '#cf_enreg');
  await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Lot A'));
  await saisir(page, '#cf_prix', 120000);
  await saisir(page, '#cf_loyer', 550);
  await page.fill('#cf_nomProjet', 'Lot B');
  await cliquer(page, '#cf_enregNouveau');
  await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Lot B'));
  await page.click('.tabs [data-tab="projets"]');
  await page.click('#pj .actions [data-a="regroupe"]');
  const id = nom => page.evaluate(n => PROJETS.liste.find(x => x.nom === n).id, nom);
  await page.selectOption('#pj_a', await id('Lot A'));
  await page.selectOption('#pj_b', await id('Lot B'));
  await page.click('#pj [data-a="regrouper"]');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  // Le 2e projet devient la carte d'un 2e bien, à son nom, avec son prix, son loyer et sa surface
  const carte2 = page.locator('#cf_biensPlus [data-i="0"]');
  assert.equal(+await page.inputValue('#cf_prix'), Math.round(e.prix));
  assert.equal(await carte2.locator('[data-k="nom"]').inputValue(), 'Lot B');
  assert.equal(await page.inputValue('#cf_nomBien'), 'Lot A');
  assert.equal(+await carte2.locator('[data-k="prix"]').inputValue(), 120000);
  assert.equal(+await page.locator('#cf_loyersPlus [data-i="0"] [data-k="loyer"]').inputValue(), 550);
  assert.equal(+await page.inputValue('#cf_surf'), 45); assert.equal(+await carte2.locator('[data-k="surf"]').inputValue(), 45);
  assert.match(await page.locator('#cf_bien').innerText(), /2 biens, 90 m² en tout/i);
  const pr = (await attendreCompte(c => c.projets.some(x => x.nom === 'Lot A + Lot B'))).projets.find(x => x.nom === 'Lot A + Lot B');
  assert.equal(pr.resume.prix, Math.round(e.prix) + 120000); assert.equal(pr.resume.prixB2, 120000);
  // Le projet regroupé remplace les deux (pas trois fois les mêmes biens dans la liste)
  let c = await attendreCompte(c => !c.projets.some(x => x.nom === 'Lot A' || x.nom === 'Lot B'), 'projets d\'origine remplacés');
  assert.equal(c.projets.filter(x => x.nom === 'Lot A + Lot B').length, 1);
  await page.click('.tabs [data-tab="projets"]');
  const carte = page.locator('#pj .pj', {hasText: 'Lot A + Lot B'});
  assert.match(await carte.innerText(), /un seul crédit/i);
  // « Estimation 1 » et « Estimation 2 » : l'estimation de chaque bien dans Estimer, sans toucher au projet regroupé
  assert.equal(await carte.locator('[data-a="estimerN"]').count(), 2);
  await carte.locator('.pj-menu summary').click();
  await carte.locator('[data-a="estimerN"][data-n="1"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'estimation');
  assert.equal(await page.inputValue('#surf'), '45');
  assert.equal(await page.evaluate(() => projetCourantId), null);
  // Estimation revue depuis le projet : le bouton la met à jour dans le projet, sans en créer un autre
  await page.waitForSelector('#est_maj');
  const nbAvant = await page.evaluate(() => PROJETS.liste.length);
  await page.click('#est_maj');
  assert.match(await page.locator('#est_msg').innerText(), /Estimation mise à jour/);
  assert.equal(await page.evaluate(() => PROJETS.liste.length), nbAvant);
  assert.equal(await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'Lot A + Lot B').estimations[1].surf), 45);
  await page.click('.tabs [data-tab="projets"]');
  // « Séparer » : les deux projets reviennent, le projet regroupé part
  await carte.locator('.pj-menu summary').click();
  await carte.locator('[data-a="separer"]').click();
  c = await attendreCompte(c => !c.projets.some(x => x.nom === 'Lot A + Lot B') && ['Lot A', 'Lot B'].every(n => c.projets.some(x => x.nom === n)), 'projets séparés');
  assert.equal(c.projets.find(x => x.nom === 'Lot B').finance.prix, 120000);
  // Projet regroupé qui a perdu ses deux projets d'origine : on choisit ses deux estimations, gardées dans le compte
  await page.click('.tabs [data-tab="projets"]');
  await page.click('#pj .actions [data-a="regroupe"]');
  await page.selectOption('#pj_a', await id('Lot A'));
  await page.selectOption('#pj_b', await id('Lot B'));
  await page.click('#pj [data-a="regrouper"]');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await page.evaluate(() => { const p = PROJETS.liste.find(x => x.nom === 'Lot A + Lot B'); delete p.regroupe; PROJETS.enregistrer(); });
  await page.click('.tabs [data-tab="projets"]');
  assert.equal(await carte.locator('[data-a="estimerN"]').count(), 0);
  await carte.locator('.pj-menu summary').click();
  await carte.locator('[data-a="estChoisir"]').click();
  const choix = carte.locator('.pj-estim select');
  assert.equal(await choix.count(), 2);
  assert.notEqual(await choix.nth(0).inputValue(), '-1');            // devinée d'après le prix du 1er bien
  await choix.nth(1).selectOption({index: 1});
  await carte.locator('[data-a="estGarder"]').click();
  c = await attendreCompte(c => ((c.projets.find(x => x.nom === 'Lot A + Lot B') || {}).estimations || []).filter(Boolean).length === 2, 'estimations gardées');
  assert.equal(await carte.locator('[data-a="estimerN"]').count(), 2);
  await carte.locator('.pj-menu summary').click();
  await carte.locator('[data-a="estimerN"][data-n="0"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'estimation');
  assert.equal(await page.inputValue('#surf'), '45');
  // Carte d'un projet à deux biens : pas la phrase « un seul crédit pour « A » et « B » »
  await page.click('.tabs [data-tab="projets"]');
  assert.doesNotMatch(await carte.innerText(), /un seul crédit pour/i);
  assert.match(await carte.innerText(), /Deux biens, un seul crédit · 90 m² en tout/i);
  // Ancien regroupement sans ses deux projets, qui sont revenus à côté (doublon) : le refaire le remplace
  await page.evaluate(() => {
    const g = PROJETS.liste.find(x => x.nom === 'Lot A + Lot B'); g.nom = 'Alpha';
    const copie = (nom, prix) => ({id: nouvelId(), nom, maj: Date.now(), quand: new Date().toISOString(), recherche: null, bien: '', finance: {...g.finance, ouverts: {}, biensPlus: [], prix}, resume: {...g.resume, prixB2: null}});
    PROJETS.liste.push(copie('Alpha 1', 150000), copie('Alpha 2', 120000)); PROJETS.enregistrer(); afficherProjets();
  });
  await page.click('#pj .actions [data-a="regroupe"]');
  await page.selectOption('#pj_a', await id('Alpha 1'));
  await page.selectOption('#pj_b', await id('Alpha 2'));
  assert.equal(await page.inputValue('#pj_c'), await id('Alpha'));     // deviné d'après les noms
  await page.click('#pj [data-a="regrouper"]');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  c = await attendreCompte(c => !c.projets.some(x => /^Alpha [12]/.test(x.nom)) && c.projets.filter(x => x.nom === 'Alpha').length === 1 && c.projets.find(x => x.nom === 'Alpha').regroupe, 'ancien regroupement remplacé');
  assert.equal(c.projets.find(x => x.nom === 'Alpha').resume.prixB2, 120000);
});

test('ancien projet à deux biens (format d\'avant la liste de biens) : repris avec ses deux biens nommés, total inchangé', async () => {
  await page.click('.tabs [data-tab="projets"]');
  const avant = await page.evaluate(() => {
    const f = {...PROJETS.liste[0].finance, nomBien: undefined, prix: 220000, loyer: 1700, tf: 900, copro: 0, prixB2: 80000, loyerB2: 750, tfB2: 400, coproB2: 0, ouverts: {bien2: true}};
    delete f.biensPlus; delete f.nomBien;
    const pr = {id: nouvelId(), nom: 'San gaetano', maj: Date.now(), quand: new Date().toISOString(), recherche: null, bien: '', finance: f,
      resume: {v: 3, label: 'un seul crédit pour « Route de San Gaetano » et « sans Gaetan 2 »', prix: 300000, prixB2: 80000}};
    PROJETS.liste.unshift(pr); PROJETS.enregistrer(); afficherProjets();
    return CF_APP.recalculer({...f, biensPlus: [{prix: 80000, loyer: 750, tf: 400, copro: 0}]}, pr);
  });
  const carte = page.locator('#pj .pj', {hasText: 'San gaetano'});
  assert.match(await carte.innerText(), /Deux biens, un seul crédit/i);
  const pr = await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'San gaetano'));
  assert.equal(pr.resume.v, 7); assert.equal(pr.resume.cfMois, avant.cfMois); assert.equal(pr.resume.prix, 300000);
  assert.deepEqual([pr.finance.nomBien, pr.finance.biensPlus[0].nom, pr.finance.biensPlus[0].tf], ['Route de San Gaetano', 'sans Gaetan 2', 400]);
  await carte.locator('[data-a="financer"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.equal(await page.inputValue('#cf_nomBien'), 'Route de San Gaetano');
  assert.equal(+await page.inputValue('#cf_tf'), 900);
  assert.equal(+await page.locator('#cf_biensPlus [data-i="0"] [data-k="tf"]').inputValue(), 400);
  await page.click('.tabs [data-tab="projets"]');
  await carte.locator('[data-a="suppr"]').click();
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
  await page.waitForFunction(() => /Estimé le/i.test((document.getElementById('inv_auto') || {}).innerText || ''), null, {timeout: 60000});
  const nom = await page.locator('#inv_titre').innerText();
  const b = (await attendreCompte(() => (bienDuCompte(nom) || {}).estimation)).biens.find(x => x.nom === nom);
  assert.ok(!b.estimation.erreur, JSON.stringify(b.estimation));
  assert.ok(Math.abs(b.estimation.prix - e.prix) / e.prix < 0.05, `fiche ${b.estimation.prix} / onglet ${e.prix}`);   // même moteur, même bien
});

test('logement de la famille : à part du cash-flow locatif (tuiles, carte, mode simple), puis supprimé', async () => {
  await page.evaluate(() => { location.hash = '#investissements'; });
  await page.waitForSelector('#inv .invhead');
  const avant = nombre(await kpi('Cash-flow', '#inv .kpis.six'));
  await page.click('#inv [data-a="ajout"]');
  await page.waitForSelector('#inv_titre');
  await champ('nom', 'Maison Famille'); await champ('valeur', 300); await champ('location.statut', 'rp'); await champ('chargesAn.tf', 1200);
  await page.waitForFunction(() => /Coût\s*\n\s*100 €/i.test(document.getElementById('inv_kpis').innerText));                                     // taxe foncière ÷ 12, pas un cash-flow
  await page.click('#inv a.retour'); await page.waitForSelector('#inv .invhead');   // la liste, pas les tuiles de la fiche
  await page.waitForFunction(() => /Logement famille/i.test(document.querySelector('#inv .kpis.six').innerText));
  const t = await page.locator('#inv .kpis.six').innerText();
  assert.equal(nombre(t.match(/Cash-flow locatif\s*\n\s*([^\n]+)/i)[1]), avant);   // les investissements ne bougent pas
  assert.equal(nombre(t.match(/Logement famille\s*\n\s*([^\n]+)/i)[1]), 100);
  assert.equal(nombre(t.match(/total\s+([^\n]+)/i)[1]), avant - 100);
  assert.match(await carteBien('Maison Famille').innerText(), /Coût\s*\n\s*100 €\/mois/i);
  await page.click('.tabs [data-mode="simple"]');
  await page.waitForSelector('#inv .bilan-simple.logement');
  const s = await page.locator('#inv .bilan-simple.logement').innerText();
  assert.match(s, /Logement de la famille[^\n]*\s*−\s*100 € par mois/i);
  assert.equal(nombre(s.match(/Au total, il te (?:reste|manque)\s*([^\n]+) par mois/i)[1]), Math.abs(avant - 100));
  await page.click('.tabs [data-mode="pro"]');
  await page.waitForFunction(() => !document.body.classList.contains('simple'));
  await ouvrirFiche('Maison Famille');
  await page.click('#inv [data-a="supprimer"]');
  await page.waitForSelector('#inv .invhead');                                          // la liste, pas les tuiles de la fiche
  await page.waitForFunction(() => !/Logement famille/i.test(document.querySelector('#inv .kpis.six').innerText));
  assert.match(await page.locator('#inv .kpis.six').innerText(), /Cash-flow\s*\n/i);
  assert.doesNotMatch(await page.locator('#inv .kpis.six').innerText(), /Logement famille/i);
});

test('Mes projets : options d\'un même projet (regroupées, comparées, ajoutées, sorties, regroupement défait)', async () => {
  await page.evaluate(() => { window.promptAvant = window.prompt; window.prompt = (m, d) => d; });   // noms proposés acceptés
  await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  await saisir(page, '#cf_prix', 200000);
  await saisir(page, '#cf_loyer', 900);
  await saisir(page, '#cf_apport', 20000);
  await page.fill('#cf_nomProjet', 'Gaetano division');
  await cliquer(page, '#cf_enreg');
  await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Gaetano division'));
  await saisir(page, '#cf_prix', 120000);
  await page.fill('#cf_nomProjet', 'Gaetano garage');
  await cliquer(page, '#cf_enregNouveau');
  let c = await attendreCompte(c => (c.projets || []).some(x => x.nom === 'Gaetano garage'));
  const r = c.projets.find(x => x.nom === 'Gaetano garage').resume;
  assert.equal(r.v, 7); assert.ok(r.patrimoine > 0 && r.coutCredit > 0 && r.horizon > 0, 'patrimoine et coût du crédit dans le résumé');
  const id = nom => page.evaluate(n => PROJETS.liste.find(x => x.nom === n).id, nom);
  const ids = [await id('Gaetano division'), await id('Gaetano garage')];
  // « Regrouper des projets » : les deux sont proposés ensemble (même nom), cochés, puis regroupés sous un nom
  await page.click('.tabs [data-tab="projets"]');
  await page.click('#pj .actions [data-a="branches"]');
  const coches = await page.evaluate(() => [...document.querySelectorAll('#pj_branches .pj-coches input:checked')].map(x => x.value));
  assert.ok(ids.every(x => coches.includes(x)), 'proposés ensemble');
  await page.evaluate(ids => document.querySelectorAll('#pj_branches .pj-coches input').forEach(x => { x.checked = ids.includes(x.value); }), ids);
  await page.fill('#pj_brNom', 'San Gaetano');
  await page.click('#pj [data-a="brRegrouper"]');
  const carte = page.locator('#pj .pj-groupe', {hasText: 'San Gaetano'});
  await carte.waitFor();
  // Une carte par option : ses boutons (⋯ et Ouvrir) en bas de la carte, dans le même ordre que les colonnes du tableau
  const col = async n => carte.locator('.pj-opt-act').nth((await carte.locator('.pj-opts thead .pj-opt-nom').allTextContents()).indexOf(n));
  assert.deepEqual(await carte.locator('.pj-carte h4.pj-opt-nom').allTextContents(), ['Division', 'Garage']);
  assert.match(await carte.locator('.pj-carte.best').innerText(), /La meilleure[\s\S]*Garage[\s\S]*Chaque mois/i);
  assert.match(await carte.locator('.pj-carte', {hasText: 'Division'}).innerText(), /de moins que la meilleure/i);
  assert.deepEqual(await carte.locator('.pj-opts thead .pj-opt-nom').allTextContents(), ['Division', 'Garage']);
  assert.match(await carte.locator('.pj-opts thead th.best').innerText(), /Garage\s*La meilleure/i);
  c = await attendreCompte(c => c.projets.filter(x => x.nom === 'San Gaetano' && x.groupe).length === 2, 'options dans le compte');
  // Les tuiles (biens et crédit), puis le tableau : il te reste en gros (écart avec la meilleure) et ce qui change
  assert.match(await carte.locator('.pj-tuiles').innerText(), /change selon l'option/i);
  assert.match(await carte.locator('.pj-fixe').innerText(), /crédit[\s\S]*apport 20\s000 €/i);
  const rangee = k => carte.locator('.pj-opts tbody tr', {has: page.locator('th', {hasText: new RegExp('^' + k + '$', 'i')})});
  assert.match(await rangee('Il te reste par mois').innerText(), /−453 €\s+526 € de moins\s+73 €/);
  assert.match(await rangee('Prix').innerText(), /200\s000 €\s+120\s000 €/);
  assert.equal(await rangee('Mensualité du crédit').count(), 1);
  // Tableau masqué puis réaffiché (gardé sur l'appareil)
  await carte.locator('[data-a="tableau"]').click();
  await carte.locator('.pj-sans-tableau').waitFor();
  assert.equal(await carte.locator('.pj-opts').count(), 0);
  assert.match(await carte.locator('.pj-sans-tableau').innerText(), /2 options · La meilleure : Garage/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('projets-sans-tableau')).length), 1);
  await carte.locator('[data-a="tableau"]').click();
  await carte.locator('.pj-opts').waitFor();
  // Tableau détaillé : meilleur chiffre et écart
  await carte.locator('[data-a="comparerBranches"]').click();
  const cmp = carte.locator('.pj-compare');
  assert.match(await cmp.innerText(), /« Garage » te laisse le plus par mois/i);
  const ligne = k => cmp.locator('tbody tr', {has: page.locator('th', {hasText: new RegExp('^' + k + '$', 'i')})});
  assert.match(await ligne('Prix du projet').innerText(), /200\s000 €\s+120\s000 €\s+80\s000 € de mieux/i);
  for (const k of ['Mensualité', 'Loyers par mois', 'Charges par mois', 'Il te reste par mois', 'Rendement brut', 'Patrimoine dans \\d+ ans', 'Coût du crédit']) assert.equal(await ligne(k).count(), 1, k);
  await page.click('.tabs [data-mode="simple"]');
  await page.waitForFunction(() => document.querySelectorAll('#pj .pj-groupe .pj-compare tbody tr').length === 3);
  await page.click('.tabs [data-mode="pro"]');
  await page.waitForFunction(() => document.querySelectorAll('#pj .pj-groupe .pj-compare tbody tr').length > 3);
  // « Modifier » une option : Financer l'ouvre sous son nom, l'enregistrement la met à jour (pas un autre projet)
  const nDiv = await page.evaluate(() => PROJETS.liste.find(x => x.branche === 'Division').id);
  await (await col('Division')).locator('[data-a="financer"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.match(await page.locator('#cf_bien').innerText(), /San Gaetano · option Division/i);
  assert.equal(await page.inputValue('#cf_nomProjet'), 'Division');
  await saisir(page, '#cf_loyer', 950);
  await cliquer(page, '#cf_enreg');
  c = await attendreCompte(c => (c.projets.find(x => x.id === nDiv) || {finance: {}}).finance.loyer === 950, 'option modifiée');
  assert.deepEqual(c.projets.filter(x => /Gaetano/.test(x.nom)).map(x => [x.nom, x.branche]).sort(), [['San Gaetano', 'Division'], ['San Gaetano', 'Garage']]);
  // Le nom tapé dans Financer est celui de l'option
  await page.fill('#cf_nomProjet', 'Division en 2');
  await cliquer(page, '#cf_enreg');
  c = await attendreCompte(c => (c.projets.find(x => x.id === nDiv) || {}).branche === 'Division en 2', 'option renommée');
  assert.ok(c.projets.filter(x => x.groupe === c.projets.find(y => y.id === nDiv).groupe).every(x => x.nom === 'San Gaetano'), 'le projet garde son nom');
  await page.fill('#cf_nomProjet', 'Division');
  await cliquer(page, '#cf_enreg');
  c = await attendreCompte(c => (c.projets.find(x => x.id === nDiv) || {}).branche === 'Division', 'nom remis');
  await page.click('.tabs [data-tab="projets"]');
  // Replié : nom, nombre d'options, les autres en petit et la meilleure en gros ; gardé sur l'appareil ; « Tout déplier » le rouvre
  await carte.locator('.pj-plier-zone').click();
  await page.locator('#pj .pj-groupe.replie', {hasText: 'San Gaetano'}).waitFor();
  assert.equal(await carte.locator('.pj-opt-act').count(), 0);
  assert.match(await carte.locator('.pj-sous').innerText(), /^2 options/);
  assert.match(await carte.locator('.pj-r-best').innerText(), /La meilleure option\s*Garage\s*\+73 €\s*il te reste, par mois/i);
  assert.equal(await carte.locator('.pj-r-opt').count(), 1);
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('projets-deplies') || '[]'))).length, 'replié gardé');
  await page.click('#pj .actions [data-a="toutPlier"]');
  await carte.locator('.pj-opt-act').first().waitFor();
  assert.match(await page.locator('#pj .actions [data-a="toutPlier"]').innerText(), /Tout replier/i);
  // Nouvelle option à partir d'une autre : ouverte dans Financer, modifiée, enregistrée dans le projet
  await (await col('Division')).locator('.pj-menu summary').click();
  await (await col('Division')).locator('[data-a="brNouvelle"]').click();
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.match(await page.locator('#cf_bien').innerText(), /option Option 3/i);
  assert.equal(await page.locator('#cf_enreg').innerText(), 'Mettre à jour l\'option « Option 3 »');
  assert.equal(await page.locator('#cf_enregBranche').innerText(), 'Nouvelle option');
  await saisir(page, '#cf_loyer', 1900);
  await cliquer(page, '#cf_enreg');
  c = await attendreCompte(c => (c.projets.find(x => x.branche === 'Option 3') || {finance: {}}).finance.loyer === 1900, 'nouvelle option enregistrée');
  // Depuis Financer : « Enregistrer comme nouvelle option »
  await saisir(page, '#cf_loyer', 700);
  await cliquer(page, '#cf_enregBranche');
  c = await attendreCompte(c => c.projets.filter(x => x.nom === 'San Gaetano').length === 4, 'option ajoutée depuis Financer');
  assert.equal(c.projets.find(x => x.branche === 'Option 4').finance.loyer, 700);
  assert.equal(c.projets.find(x => x.branche === 'Option 3').finance.loyer, 1900);
  await page.click('.tabs [data-tab="projets"]');
  assert.equal(await carte.locator('.pj-opt-act').count(), 4);
  assert.equal(await carte.locator('.pj-compare thead th').count(), 5);
  assert.match(await carte.locator('.pj-compare').innerText(), /« Option 3 » te laisse le plus par mois/i);
  // Sortir une option : elle redevient un projet à part avec son nom d'avant
  await (await col('Garage')).locator('.pj-menu summary').click();
  await (await col('Garage')).locator('[data-a="brSortir"]').click();
  await page.locator('#pj article.pj', {hasText: 'Gaetano garage'}).waitFor();
  assert.equal(await carte.locator('.pj-opt-act').count(), 3);
  // Défaire le regroupement : chacun redevient un projet
  await carte.locator('.pj-gr-actions .pj-menu summary').click();
  await carte.locator('[data-a="grDefaire"]').click();
  await page.waitForFunction(() => !document.querySelector('#pj .pj-groupe'));
  c = await attendreCompte(c => !c.projets.some(x => x.groupe && /Gaetano/.test(x.nom)) && c.projets.some(x => x.nom === 'Gaetano division'), 'regroupement défait');
  // Ménage
  for (const x of c.projets.filter(x => /Gaetano/.test(x.nom))) await page.locator(`#pj article.pj[data-id="${x.id}"] [data-a="suppr"]`).click();
  await attendreCompte(c => !c.projets.some(x => /Gaetano/.test(x.nom)), 'projets du test supprimés');
  await page.evaluate(() => { window.prompt = window.promptAvant; });
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
