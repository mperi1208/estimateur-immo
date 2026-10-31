// Champs dans les barres sombres du bas (nom du projet dans Estimer et Financer) : le texte tapé et le placeholder
// doivent trancher sur le fond (bug du 2026-10-31 : texte blanc sur champ blanc, invisible), sur ordinateur et sur téléphone
const test = require('node:test');
const assert = require('node:assert');
const {lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, estimer} = require('./banc');

// Contraste WCAG entre la couleur du texte et le fond réel du champ (fond du champ posé sur celui de la barre, alpha compris)
const contrastes = (page, sel) => page.locator(sel).first().evaluate(e => {
  const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return {r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1}; };
  const sur = (h, b) => ({r: h.r * h.a + b.r * (1 - h.a), g: h.g * h.a + b.g * (1 - h.a), b: h.b * h.a + b.b * (1 - h.a), a: 1});
  const fond = el => { const pile = []; for (let x = el; x; x = x.parentElement) { const c = rgba(getComputedStyle(x).backgroundColor); if (c.a > 0) pile.push(c); if (c.a === 1) break; }
    return pile.reverse().reduce((b, h) => sur(h, b), {r: 255, g: 255, b: 255, a: 1}); };
  const lum = c => { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const f = fond(e), s = getComputedStyle(e), p = getComputedStyle(e, '::placeholder');
  const enc = st => { const t = st.webkitTextFillColor; return t && rgba(t).a > 0 ? t : st.color; };   // Safari peint avec -webkit-text-fill-color
  const coul = st => { const c = rgba(enc(st)); return sur({...c, a: c.a * (+st.opacity || 1)}, f); };
  return {texte: ratio(coul(s), f), placeholder: ratio(coul(p), f)};
});
const verifier = async (page, sel, ou) => {
  const c = await contrastes(page, sel);
  assert.ok(c.texte >= 4.5, `${ou} : texte tapé peu lisible (contraste ${c.texte.toFixed(2)})`);
  assert.ok(c.placeholder >= 3, `${ou} : placeholder peu lisible (contraste ${c.placeholder.toFixed(2)})`);
};

for (const mobile of [false, true]) {
  test(`Nom du projet lisible dans les barres sombres d'Estimer et de Financer (${mobile ? 'téléphone' : 'ordinateur'})`, async () => {
    const nav = await lancerNavigateur();
    try {
      const {page, journal} = await appareil(nav, nouvelleBase(), mobile ? {mobile: true} : {});
      await ouvrir(page);
      await seConnecter(page);
      await estimer(page, {surf: 45, details: {etat: 'bon', dpe: '?'}});
      await page.fill('#est_nom', 'Mon projet');
      assert.equal(await page.inputValue('#est_nom'), 'Mon projet');
      await verifier(page, '#est_nom', 'Estimer');
      await page.click('#est_financer');
      await page.waitForFunction(() => document.body.dataset.onglet === 'cashflow');
      const champs = await page.locator('#cf .cf-barre input:visible').evaluateAll(l => l.map(e => '#' + e.id));
      assert.ok(champs.includes('#cf_nomProjet'), 'champ du nom dans la barre de Financer');
      for (const sel of champs)
        await verifier(page, sel, 'Financer ' + sel);
      assert.deepEqual(journal.erreurs, [], 'erreurs JavaScript dans la page');
    } finally { await nav.close(); }
  });
}
