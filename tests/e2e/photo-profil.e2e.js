// Photo de profil : ajoutée depuis la fenêtre du compte, cadrée à la main (glisser, zoomer), affichée dans la barre du haut, retirée ;
// rangée dans le stockage de Patrimoniu (immo-docs)
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase} = require('./banc');

// Une vraie image PNG de 40 × 20 : moitié gauche rouge, moitié droite bleue (le cadrage se voit à la couleur)
function png(l, h) {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const o of b) x = t[(x ^ o) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const bloc = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const lignes = Buffer.concat([...Array(h)].map(() => Buffer.concat([Buffer.from([0]), Buffer.from([...Array(l)].flatMap((_, i) => i < l / 2 ? [220, 30, 30] : [30, 30, 220]))])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(lignes)), bloc('IEND', Buffer.alloc(0))]);
}

test('photo de profil : ajoutée, carrée, dans la barre du haut, retirée ; dans le stockage de Patrimoniu seulement', async () => {
  const nav = await lancerNavigateur(), {page, journal} = await appareil(nav, nouvelleBase());
  try {
    await ouvrir(page); await seConnecter(page);
    await page.evaluate(() => { window.__majProfil = 0; const a = COMPTE.client.auth.updateUser; COMPTE.client.auth.updateUser = (...x) => { window.__majProfil++; return a(...x); }; });
    await page.click('#compteStatut');
    assert.match(await page.locator('#compteBody').innerText(), /Ajouter une photo/);
    await page.setInputFiles('#cpt_fichier', {name: 'moi.png', mimeType: 'image/png', buffer: png(40, 20)});
    // Fenêtre de cadrage : rien n'est envoyé avant « Enregistrer »
    await page.waitForSelector('#cpt_cadre');
    assert.equal(await page.evaluate(() => (window.__fichiers || new Map()).size), 0, 'pas d\'envoi avant de valider');
    await page.fill('#cpt_zoom', '2'); await page.fill('#cpt_zoom', '1');
    // Glisser la photo vers la droite : on garde la moitié gauche (rouge)
    const r = await page.locator('#cpt_cadre').boundingBox();
    await page.mouse.move(r.x + 60, r.y + 120); await page.mouse.down();
    await page.mouse.move(r.x + 200, r.y + 120, {steps: 5}); await page.mouse.up();
    await page.click('#cpt_valider');
    await page.waitForSelector('#cpt_photo');
    const [l, h, rouge, bleu] = await page.evaluate(() => new Promise(ok => { const i = new Image(); i.onload = () => { const c = Object.assign(document.createElement('canvas'), {width: i.naturalWidth, height: i.naturalHeight}), x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(c.width - 20, c.height / 2, 1, 1).data; ok([i.naturalWidth, i.naturalHeight, d[0], d[2]]); }; i.src = document.getElementById('cpt_photo').src; }));
    assert.deepEqual([l, h], [256, 256], 'carré de 256 px');
    assert.ok(rouge > 150 && bleu < 100, `cadrée sur la moitié gauche (rouge ${rouge}, bleu ${bleu})`);
    assert.ok(await page.locator('.tabs #tabsPhoto img').isVisible(), 'en grand, à droite de la barre du haut');
    assert.deepEqual(await page.evaluate(() => [...window.__fichiers.keys()]), [await page.evaluate(() => COMPTE.user.id + '/profil/photo.jpg')]);
    assert.equal(await page.evaluate(() => window.__majProfil), 0, 'le profil Supabase commun aux autres sites n\'est pas touché');
    // Annuler le cadrage d'une nouvelle photo garde l'ancienne
    await page.setInputFiles('#cpt_fichier', {name: 'autre.png', mimeType: 'image/png', buffer: png(40, 20)});
    await page.click('#cpt_annuler');
    await page.waitForSelector('#cpt_photo');
    await page.click('#cpt_retirer');
    await page.waitForSelector('#compteBody .cpt-initiale');
    assert.equal(await page.locator('.tabs #tabsPhoto').isVisible(), false);
    assert.ok(await page.locator('.tabs #compteStatut').isVisible(), 'sans photo, le compte revient à droite');
    assert.deepEqual(journal.erreurs, []);
  } finally { await nav.close(); }
});
