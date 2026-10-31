// Parcours sur un téléphone (390 × 844, tactile) : rien de coupé ni de plus large que l'écran, dans chaque onglet,
// un projet déplié se voit en entier ; menus ⋯ en bas de l'écran ; barres du bas basses
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer, saisir, cliquer} = require('./banc');

let nav, page, journal;
test.before(async () => { nav = await lancerNavigateur(); ({page, journal} = await appareil(nav, nouvelleBase(), {mobile: true})); await ouvrir(page); });
test.after(async () => { assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page'); await nav.close(); });

// Ce qui dépasse de l'écran à droite ou à gauche (hors tableaux qu'on fait défiler et carte), ou dont le texte est coupé
const debordements = () => page.evaluate(() => {
  const L = innerWidth, res = [];
  const defile = e => { for (let x = e.parentElement; x; x = x.parentElement) if (/auto|scroll/.test(getComputedStyle(x).overflowX) && x.scrollWidth > x.clientWidth) return true; return false; };
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || e.closest('.leaflet-container, .sr, [hidden], dialog:not([open])') || getComputedStyle(e).visibility === 'hidden') continue;
    if (e.childElementCount === 0 && e.textContent.trim() && (r.right > L + 1 || r.left < -1) && !defile(e))
      res.push(`${e.tagName.toLowerCase()}.${e.className} « ${e.textContent.trim().slice(0, 30)} » ${Math.round(r.left)}→${Math.round(r.right)}`);
  }
  return res;
});
const onglet = async (t) => { await page.click(`.tabs [data-tab="${t}"]`); await page.waitForFunction(t => document.body.dataset.onglet === t, t); await page.waitForTimeout(150); };
const boite = sel => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return {haut: r.top, bas: r.bottom, gauche: r.left, droite: r.right, h: r.height, l: r.width}; });

test('Estimer et Financer sur téléphone : rien ne dépasse, barres du bas basses, toutes les étapes visibles', async () => {
  await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  assert.deepEqual(await debordements(), []);
  assert.ok((await boite('#sauveEst')).h <= 80, 'sans compte : une seule ligne de boutons');
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  for (const n of [1, 2, 3, 4]) {
    await page.evaluate(n => CF_APP.etape(n), n);
    assert.deepEqual(await debordements(), [], 'étape ' + n);
    for (const k of [1, 2, 3, 4]) {
      const b = await boite(`#cf_etapes [data-etape="${k}"]`);
      assert.ok(b.droite <= 390 && b.gauche >= 0, `étape ${k} visible quand l'étape ${n} est ouverte`);
    }
  }
});

test('Mes projets sur téléphone : un projet à deux options déplié se voit en entier', async () => {
  await seConnecter(page);
  await page.waitForFunction(() => document.body.dataset.onglet === 'investissements');
  await page.evaluate(() => { window.prompt = (m, d) => d; });
  await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
  await page.click('#est_financer');
  await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
  assert.ok((await boite('#cf_save')).h <= 120, 'barre de Financer : deux lignes au plus');
  await saisir(page, '#cf_prix', 200000); await saisir(page, '#cf_loyer', 900); await saisir(page, '#cf_apport', 20000);
  await page.fill('#cf_nomProjet', 'Gaetano division'); await cliquer(page, '#cf_enreg');
  await page.waitForFunction(() => PROJETS.liste.some(x => x.nom === 'Gaetano division'));
  await saisir(page, '#cf_prix', 120000); await page.fill('#cf_nomProjet', 'Gaetano garage'); await cliquer(page, '#cf_enregNouveau');
  await page.waitForFunction(() => PROJETS.liste.some(x => x.nom === 'Gaetano garage'));
  await onglet('projets');
  const id = await page.evaluate(() => PROJETS.liste.find(x => x.nom === 'Gaetano garage').id);
  const garage = page.locator(`#pj article.pj[data-id="${id}"]`);
  await garage.locator('.pj-menu summary').click();
  await garage.locator('[data-a="pjDeplacer"]').click();
  await page.fill('#pj_brNom', 'San Gaetano');
  await page.click('#pj [data-a="deplacerGarder"]');
  const carte = page.locator('#pj .pj-groupe');
  await carte.waitFor();
  if (await carte.evaluate(e => e.classList.contains('replie'))) await carte.locator('button.pj-plier').click();
  await carte.locator('.pj-cartes').waitFor();
  const liste = await boite('#pj .pj-liste'), c = await boite('#pj .pj-groupe');
  assert.ok(c.droite <= liste.droite + 0.5 && c.droite <= 390, `la carte du projet tient dans l'écran (${c.droite} > ${liste.droite})`);
  assert.deepEqual(await debordements(), []);
  // Les cartes des options l'une sous l'autre, chacune sur toute la largeur
  const [a, b] = await carte.locator('.pj-carte').evaluateAll(cs => cs.map(e => { const r = e.getBoundingClientRect(); return {haut: r.top, bas: r.bottom, l: r.width}; }));
  assert.ok(b.haut >= a.bas, `options l'une sous l'autre`);
  assert.ok(a.l > 250, `option sur toute la largeur (${a.l})`);
});

test('menus ⋯ et « Dossier de financement » sur téléphone : panneau en bas de l\'écran, entier, fermé d\'un toucher à côté', async () => {
  const carte = page.locator('#pj .pj-groupe');
  for (const sel of ['.pj-tete .pj-menu:not(.pj-dossier)', '.pj-tete .pj-dossier', '.pj-carte .pj-opt-act .pj-menu']) {
    const menu = carte.locator(sel).first();
    await menu.locator('summary').click();
    const l = await boite(`#pj .pj-groupe ${sel}[open] .pj-menu-l`);
    assert.ok(l.gauche >= 0 && l.droite <= 390 && l.haut >= 0 && l.bas <= 844, `${sel} : menu entier à l'écran ${JSON.stringify(l)}`);
    assert.ok(l.bas > 780, `${sel} : menu collé en bas de l'écran`);
    await page.mouse.click(195, 120);   // sur le voile, au-dessus du menu
    await page.waitForFunction(() => !document.querySelector('#pj details.pj-menu[open]'));
  }
});

test('Mon patrimoine sur téléphone : liste et fiche sans rien qui dépasse', async () => {
  await onglet('investissements');
  await page.click('#inv [data-a="ajout"]');
  await page.waitForSelector('#inv_titre');
  await saisir(page, '#inv [data-p="nom"]', 'Studio Test');
  await saisir(page, '#inv [data-p="valeur"]', 200);
  await saisir(page, '#inv [data-p="location.loyer"]', 800);
  await page.click('#inv [data-a="ajoutPret"]');
  await saisir(page, '#inv [data-p="prets.0.montant"]', 150000); await saisir(page, '#inv [data-p="prets.0.taux"]', 3); await saisir(page, '#inv [data-p="prets.0.duree"]', 240);
  assert.deepEqual(await debordements(), [], 'fiche');
  await page.click('#inv a.retour');
  await page.waitForSelector('#inv .invhead');
  assert.deepEqual(await debordements(), [], 'liste');
});

test('Financer, le calendrier : les libellés du différé ne se chevauchent jamais, rien ne dépasse (360, 390 px et ordinateur)', async () => {
  await onglet('cashflow');
  await cliquer(page, '#cf_etapes button[data-etape="2"]');
  if (!await page.evaluate(() => document.getElementById('cf_boxProjet').open)) await cliquer(page, '#cf_travauxSeg button[data-v="1"]');
  await saisir(page, '#cf_travaux', 30000); await saisir(page, '#cf_debutTravaux', 1); await saisir(page, '#cf_dureeTravaux', 2);
  const differe = n => page.evaluate(n => { const d = document.getElementById('cf_differe'); d.value = n; d.dispatchEvent(new Event('input', {bubbles: true})); }, n);
  const libelles = () => page.locator('#cf_calendrier .cal-diff .txt').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return {g: r.left, d: r.right, h: r.top, b: r.bottom}; }));
  for (const largeur of [360, 390, 1280]) {
    await page.setViewportSize({width: largeur, height: 844});
    for (const n of [2, 6, 20, 30]) {
      await differe(n);
      await page.waitForFunction(n => new RegExp(`dès le mois ${n + 1}`).test(document.getElementById('cf_calendrier').innerText), n);
      const [a, b] = await libelles();
      assert.ok(a.d <= b.g + 0.5 || a.b <= b.h + 0.5, `${largeur} px, différé ${n} mois : libellés l'un sur l'autre ${JSON.stringify([a, b])}`);
      assert.ok(b.d <= largeur, `${largeur} px, différé ${n} mois : « Mensualité pleine » coupé à droite`);
      assert.deepEqual(await debordements(), [], `${largeur} px, différé ${n} mois`);
    }
  }
  await page.setViewportSize({width: 390, height: 844});
  await differe(0);
});

test('Financer, le calendrier : un segment étroit n\'a jamais son libellé coupé, il passe sous la frise ; le trait de la mensualité pleine va jusqu\'au bout', async () => {
  await onglet('cashflow');
  await cliquer(page, '#cf_etapes button[data-etape="2"]');
  if (!await page.evaluate(() => document.getElementById('cf_boxProjet').open)) await cliquer(page, '#cf_travauxSeg button[data-v="1"]');
  await saisir(page, '#cf_travaux', 30000);
  const champ = (id, n) => page.evaluate(([id, n]) => { const d = document.getElementById(id); d.value = n; d.dispatchEvent(new Event('input', {bubbles: true})); }, [id, n]);
  // Chaque segment : son libellé tient dedans, ou bien il est caché et écrit sous la frise
  const etat = () => page.evaluate(() => {
    const cal = document.getElementById('cf_calendrier'), r = e => e.getBoundingClientRect();
    return {segs: [...cal.querySelectorAll('.cal-barre > div')].map(s => ({titre: s.title, etroit: s.classList.contains('etroit'), coupe: s.scrollWidth > s.clientWidth + 0.5, visible: getComputedStyle(s.firstElementChild).visibility !== 'hidden'})),
      dessous: [...cal.querySelectorAll('.cal-leg span')].map(e => ({t: e.textContent, d: r(e).right})),
      barre: r(cal.querySelector('.cal-barre')), plein: cal.querySelector('.plein') && r(cal.querySelector('.plein'))};
  });
  for (const largeur of [360, 390, 1280]) {
    await page.setViewportSize({width: largeur, height: 844});
    for (const [debut, duree, diff] of [[24, 2, 36], [2, 1, 0], [12, 3, 24], [1, 1, 6], [30, 6, 12]]) {
      await champ('cf_debutTravaux', debut); await champ('cf_dureeTravaux', duree); await champ('cf_differe', diff);
      await page.waitForFunction(t => document.getElementById('cf_calendrier').innerText.includes(t), `Travaux · ${duree > 1 ? `mois ${debut} à ${debut + duree - 1}` : `mois ${debut}`}`);
      const e = await etat(), cas = `${largeur} px, travaux mois ${debut} pendant ${duree}, différé ${diff}`;
      for (const s of e.segs) {
        if (s.visible) assert.ok(!s.coupe, `${cas} : « ${s.titre} » coupé dans la frise`);
        else assert.ok(e.dessous.some(x => x.t === s.titre), `${cas} : « ${s.titre} » ni dans la frise ni dessous`);
        assert.equal(s.etroit, !s.visible, cas);
      }
      assert.ok(e.dessous.every(x => x.d <= largeur), `${cas} : libellé sous la frise coupé à droite`);
      if (diff) assert.ok(Math.abs(e.plein.right - e.barre.right) <= 1, `${cas} : le trait de la mensualité pleine s'arrête avant le bout`);
      assert.deepEqual(await debordements(), [], cas);
    }
  }
  // Le cas de la capture : 2 mois de travaux sur 4 ans, sur ordinateur, le libellé « Travaux » passe sous la frise
  await page.setViewportSize({width: 1280, height: 844});
  await champ('cf_debutTravaux', 24); await champ('cf_dureeTravaux', 2); await champ('cf_differe', 36);
  await page.waitForFunction(() => document.getElementById('cf_calendrier').innerText.includes('Travaux · mois 24 à 25'));
  const e = await etat();
  assert.deepEqual(e.dessous.map(x => x.t), ['Travaux · mois 24 à 25']);
  assert.ok(e.segs.find(s => s.titre === 'Avant travaux · mois 1 à 23').visible);
  if (process.env.CAPTURES) await page.locator('#cf_carteCal').screenshot({path: process.env.CAPTURES + '/cal-1280.png'});
  await page.setViewportSize({width: 360, height: 844});
  await page.waitForTimeout(100);
  if (process.env.CAPTURES) { await page.addStyleTag({content: '#cf_save{display:none!important}'}); await page.locator('#cf_carteCal').screenshot({path: process.env.CAPTURES + '/cal-360.png'}); }
  await page.setViewportSize({width: 390, height: 844});
  await champ('cf_differe', 0);
});
