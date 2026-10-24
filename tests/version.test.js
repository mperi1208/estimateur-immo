// Le navigateur garde investissements.js en cache tant que son « ?v= » ne change pas : on le lie au contenu du fichier
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

test('index.html charge investissements.js avec la bonne empreinte (sinon les navigateurs gardent l\'ancienne version)', () => {
  const app = f => fs.readFileSync(path.join(__dirname, '..', 'app', f));
  const v = crypto.createHash('sha256').update(app('investissements.js')).digest('hex').slice(0, 8);
  assert.match(app('index.html').toString(), new RegExp(`investissements\\.js\\?v=${v}"`), `remplace le ?v= de investissements.js dans app/index.html par ?v=${v}`);
});
