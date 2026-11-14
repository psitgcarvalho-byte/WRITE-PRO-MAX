// Copia os arquivos do app para www/ (usado pelo Capacitor e pelo GitHub Pages)
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
['index.html', 'styles.css', 'core.js', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']
  .forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(out, f)));
console.log('www/ pronto');
