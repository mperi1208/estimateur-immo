// Outils communs aux tests : lecture des fichiers de l'appli et découpe des blocs de code purs
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lire = f => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8');
function bloc(src, debut, fin) {
  const i = src.indexOf(debut), j = src.indexOf(fin, i);
  assert.ok(i >= 0 && j > i, `bloc introuvable : ${debut} … ${fin}`);
  return src.slice(i, j);
}
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

module.exports = {lire, bloc, proche, inv: lire('investissements.js'), idx: lire('index.html')};
