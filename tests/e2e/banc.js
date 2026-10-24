// Banc d'essai des parcours dans le navigateur : l'appli est servie depuis le dépôt, et tout le réseau est simulé
// (ventes DVF, carte des loyers, adresses, comptes Supabase, carte Leaflet) pour des résultats reproductibles, sans Internet.
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const RACINE = path.join(__dirname, '..', '..');
const ORIGINE = 'http://patrimoniu.test';
const LEAFLET = path.join(__dirname, 'node_modules', 'leaflet', 'dist');
const ANNEE = new Date().getFullYear();
const TYPES_MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json'};
const PNG_VIDE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// Petit hachage déterministe (même vente = mêmes chiffres d'une requête à l'autre)
const hache = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Ventes DVF simulées : un point de vente possible tous les 0,001° (grille commune à toutes les requêtes, pour que les
// mêmes ventes reviennent avec le même identifiant), une sur trois retenue ; prix au m² autour d'un niveau par type
const NIVEAU = {'121': 4000, '111': 3000};
function ventesDvf(url) {
  const q = url.searchParams, [lon0, lat0, lon1, lat1] = q.get('in_bbox').split(',').map(Number);
  const type = q.get('codtypbien'), anMin = +q.get('anneemut_min') || +q.get('anneemut') || ANNEE - 10, anSeul = q.get('anneemut');
  const pas = 0.001, out = [];
  for (let i = Math.ceil(lon0 / pas); i * pas <= lon1; i++) for (let j = Math.ceil(lat0 / pas); j * pas <= lat1; j++) {
    const id = `${type}:${i}:${j}`, h = hache(id);
    if (h % 3) continue;
    const an = ANNEE - (h >>> 3) % 9;
    if (an < anMin || (anSeul && an !== +anSeul)) continue;
    const lon = i * pas, lat = j * pas, date = `${an}-${String(1 + (h >>> 7) % 12).padStart(2, '0')}-15`;
    let p;
    if (type === '13' || /^13/.test(type)) p = {valeurfonc: 12000 + (h >>> 5) % 9 * 1000, sbati: 0, sterr: 0, codtypbien: (h >>> 9) % 2 ? '1311' : '1312'};
    else if (/^2/.test(type)) { const st = 400 + (h >>> 5) % 12 * 100; p = {valeurfonc: st * 120, sbati: 0, sterr: st, codtypbien: '21'}; }
    else {
      const surf = [25, 32, 40, 48, 55, 62, 70, 80, 95][(h >>> 4) % 9], ppm = NIVEAU[type] * (0.85 + (h >>> 11) % 31 / 100) * Math.pow(1.02, an - ANNEE);
      p = {valeurfonc: Math.round(ppm * surf), sbati: surf, sterr: type === '111' ? 300 + (h >>> 6) % 8 * 100 : 0, codtypbien: type};
    }
    out.push({type: 'Feature', geometry: {type: 'MultiPolygon', coordinates: [[[[lon, lat], [lon + 1e-4, lat], [lon, lat + 1e-4]]]]},
      properties: {idopendata: id, libnatmut: 'Vente', datemut: date, vefa: false, l_idpar: ['69123000AB' + (h % 10000)], l_codinsee: ['69123'], ...p}});
  }
  return {count: out.length, next: null, features: out};
}
// Carte des loyers (ANIL) : un indicateur communal fiable, 1-2 pièces plus cher au m² que 3 pièces et +
const LOYERS = {'55b34088-0964-415f-9df7-d87dd98a09be': 14, '14a1fe11-b2d1-49b3-9f6b-83d12df9482c': 16, '5e3b28a4-cf56-43a3-ae79-43cceeb27f8c': 12.5, '129f764d-b613-44e4-952c-5ff50a8c9b73': 10};
const ADRESSE = {label: '12 Rue de la République 69002 Lyon', lon: 4.8357, lat: 45.7578, citycode: '69123'};

// Faux Supabase (client chargé à la place de supabase-js) : comptes et ligne « immo_profils » gardés côté banc
const FAUX_SUPABASE = `(() => {
  const SES = '__faux_sb_session', ecouteurs = [];
  const api = async (op, corps) => (await fetch('/__db/' + op, {method: 'POST', body: JSON.stringify(corps)})).json();
  const lireSession = () => { try { return JSON.parse(localStorage.getItem(SES)); } catch (e) { return null; } };
  const emettre = (ev, s) => ecouteurs.forEach(f => f(ev, s));
  const entrer = (r, ev) => { if (r.error) return {data: {}, error: r.error}; const s = {user: r.user}; localStorage.setItem(SES, JSON.stringify(s)); emettre(ev, s); return {data: {session: s, user: r.user}, error: null}; };
  window.supabase = {createClient: () => ({
    auth: {
      onAuthStateChange(f) { ecouteurs.push(f); return {data: {subscription: {unsubscribe() {}}}}; },
      async getSession() { return {data: {session: lireSession()}}; },
      async signInWithPassword(p) { return entrer(await api('connexion', p), 'SIGNED_IN'); },
      async signUp(p) { return entrer(await api('creer', p), 'SIGNED_IN'); },
      async signOut() { localStorage.removeItem(SES); emettre('SIGNED_OUT', null); return {error: null}; },
      async resetPasswordForEmail() { return {error: null}; },
      async updateUser() { return {data: {}, error: null}; },
    },
    from: () => ({
      select: () => ({eq: (k, v) => ({maybeSingle: async () => api('lire', {user_id: v})})}),
      upsert: async ligne => api('ecrire', ligne),
    }),
    storage: {from: () => ({
      upload: async () => ({error: null}), remove: async () => ({error: null}),
      createSignedUrl: async () => ({data: {signedUrl: 'data:text/plain,document'}, error: null}),
    })},
  })};
})();`;

// Base simulée : partagée par les pages d'un même banc (deux « appareils » sur le même compte)
function nouvelleBase() {
  return {comptes: new Map(), lignes: new Map(), ecritures: 0};
}
function repondreBase(base, op, corps) {
  if (op === 'creer' || op === 'connexion') {
    let u = base.comptes.get(corps.email);
    if (op === 'creer') { if (u) return {error: {message: 'User already registered'}}; u = {id: 'u' + (base.comptes.size + 1), email: corps.email, mdp: corps.password}; base.comptes.set(corps.email, u); }
    if (!u || u.mdp !== corps.password) return {error: {message: 'Invalid login credentials'}};
    return {user: {id: u.id, email: u.email}};
  }
  if (op === 'lire') return {data: base.lignes.has(corps.user_id) ? {credits: JSON.parse(base.lignes.get(corps.user_id))} : null, error: null};
  if (op === 'ecrire') { base.lignes.set(corps.user_id, JSON.stringify(corps.credits)); base.ecritures++; return {error: null}; }
  return {error: {message: 'opération inconnue ' + op}};
}

const PUBLIE = new Date(Date.now() - 3600e3).toUTCString();   // date de mise en ligne fixe : sinon la page se croirait périmée
const lancerNavigateur = () => chromium.launch(process.env.PW_CANAL ? {channel: process.env.PW_CANAL} : {});   // en CI : le Chrome déjà installé sur la machine

// Un « appareil » : un contexte de navigateur avec son propre stockage, branché sur la base simulée
async function appareil(nav, base, {reseau = {}} = {}) {
  const ctx = await nav.newContext({viewport: {width: 1280, height: 900}, locale: 'fr-FR', timezoneId: 'Europe/Paris'});
  const journal = {erreurs: [], requetes: {dvf: 0, loyers: 0, geo: 0}};
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const ok = (corps, type = 'application/json') => route.fulfill({status: 200, contentType: type, body: typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps), headers: {'access-control-allow-origin': '*'}});
    if (url.origin === ORIGINE) {
      if (url.pathname.startsWith('/__db/')) return ok(repondreBase(base, url.pathname.slice(6), JSON.parse(req.postData() || '{}')));
      let f = path.join(RACINE, decodeURIComponent(url.pathname));
      if (f.endsWith('/')) f += 'index.html';
      if (!f.startsWith(RACINE) || !fs.existsSync(f)) return route.fulfill({status: 404, body: 'introuvable'});
      return route.fulfill({status: 200, contentType: TYPES_MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: {'last-modified': PUBLIE}});
    }
    if (url.host === 'cdnjs.cloudflare.com' && /leaflet/.test(url.pathname)) {
      const nom = path.basename(url.pathname).replace('.min', ''), f = [path.join(LEAFLET, nom), path.join(LEAFLET, 'images', nom)].find(x => fs.existsSync(x));
      return f ? ok(fs.readFileSync(f), TYPES_MIME[path.extname(f)]) : route.fulfill({status: 404, body: ''});
    }
    if (/tile\.openstreetmap\.org$/.test(url.host)) return ok(PNG_VIDE, 'image/png');
    if (url.host === 'cdn.jsdelivr.net' && /supabase/.test(url.pathname)) return ok(FAUX_SUPABASE, 'text/javascript');
    if (url.host === 'apidf-preprod.cerema.fr') {
      journal.requetes.dvf++;
      if (reseau.dvfEnPanne) return route.fulfill({status: 503, body: 'indisponible'});
      return ok(ventesDvf(url));
    }
    if (url.host === 'tabular-api.data.gouv.fr') {
      journal.requetes.loyers++;
      const rid = url.pathname.split('/')[3], m2 = LOYERS[rid];
      if (reseau.loyersEnPanne) return route.fulfill({status: 503, body: 'indisponible'});
      return ok({data: m2 ? [{loypredm2: m2, 'lwr.IPm2': m2 * 0.8, 'upr.IPm2': m2 * 1.25, TYPPRED: 'commune', nbobs_com: 250, R2_adj: 0.7}] : []});
    }
    if (url.host === 'data.geopf.fr') {
      journal.requetes.geo++;
      const f = {type: 'Feature', geometry: {type: 'Point', coordinates: [ADRESSE.lon, ADRESSE.lat]}, properties: {label: ADRESSE.label, score: 0.95, citycode: ADRESSE.citycode}};
      return ok({type: 'FeatureCollection', features: url.pathname.includes('reverse') || (url.searchParams.get('q') || '').length > 3 ? [f] : []});
    }
    return route.fulfill({status: 404, body: 'réseau coupé dans les tests : ' + url.host});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => journal.erreurs.push(e.message));
  page.on('dialog', d => d.accept());   // confirm() de l'appli : on accepte
  return {ctx, page, journal};
}

// Ouvre l'appli (éventuellement connecté) et attend qu'elle soit prête
async function ouvrir(page, hash = '') {
  await page.goto(`${ORIGINE}/app/index.html${hash}`);
  await page.waitForFunction(() => typeof COMPTE !== 'undefined' && COMPTE.pret && window.CF_APP && window.INV);
}
async function seConnecter(page, email = 'marc@exemple.fr', mdp = 'secret123', creer = true) {
  await page.evaluate(async ({email, mdp, creer}) => {
    const a = COMPTE.client.auth;
    const r = creer ? await a.signUp({email, password: mdp}) : await a.signInWithPassword({email, password: mdp});
    if (r.error && /already/.test(r.error.message)) await a.signInWithPassword({email, password: mdp});
  }, {email, mdp, creer});
  await page.waitForFunction(() => COMPTE.user && document.querySelector('#invest .etat-compte') !== null || COMPTE.user, null, {timeout: 5000});
}

// Estimer : adresse, surface, détails, puis « Rechercher » ; attend le prix et le loyer
async function estimer(page, {surf = 50, type, details = {}} = {}) {
  if (!await page.locator('#estim').isVisible()) await page.click('.tabs [data-tab="estimation"]');
  if (type) await page.click(`#type button[data-v="${type}"]`);
  await page.fill('#addr', 'rue de la République Lyon');
  await page.fill('#surf', String(surf));
  for (const [k, v] of Object.entries(details)) await page.evaluate(([k, v]) => { const f = document.getElementById('c_' + k); if (f.type === 'checkbox') f.checked = v; else f.value = v; f.dispatchEvent(new Event('input')); }, [k, v]);
  await page.evaluate(() => { state.loyerHC = null; state.prix = null; state.base = null; });   // pas de résultat du test d'avant pris pour le nouveau
  await page.click('#go');
  await page.waitForFunction(() => state.base && state.prix != null && state.loyerHC != null && document.querySelector('#works .crit'), null, {timeout: 20000});
  return page.evaluate(() => ({prix: state.prix, loyer: state.loyerHC, mob: state.mob, surf: state.base.surf}));
}
// Champ d'un formulaire : valeur tapée puis validée (événements « input » et « change », comme au clavier)
async function saisir(page, sel, v) {
  const l = page.locator(sel);
  if (await l.evaluate(e => e.tagName === 'SELECT')) await l.selectOption(String(v));
  else { await l.fill(String(v)); await l.dispatchEvent('change'); }
}
const lireNombre = async (page, sel) => nombre(await page.locator(sel).first().innerText());

// Valeurs lisibles : « 1 234 € » → 1234 (espaces insécables, signe moins typographique)
const nombre = t => +String(t).replace(/[\s  €%]|k€|\/mois/g, '').replace('−', '-').replace(',', '.');

module.exports = {ORIGINE, ADRESSE, ANNEE, lancerNavigateur, appareil, ouvrir, seConnecter, nouvelleBase, nombre, ventesDvf, estimer, saisir, lireNombre};
