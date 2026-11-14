const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const http = require('http'); const path = require('path');
const root = __dirname;
const srv = http.createServer((q, r) => { let f = path.join(root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(fs.readFileSync(f)); }).listen(8765);
const W = n => Array.from({ length: n }, (_, i) => 'termo' + (i % 17)).join(' ');
const good = `<TITULO>A dúvida que se herda</TITULO><TEXTO>
### Origem do problema
${W(300)}

[[CIT]]Como lembra Platão, na Apologia, ${W(60)} [[DIR]]“a vida não examinada não vale a pena ser vivida, e quem nunca se interrogou sobre o que faz e por que o faz passa pelos dias como um sonâmbulo entre as coisas”[[/DIR]] ${W(40)}[[/CIT]]

### Desdobramentos
${W(220)}

[[ANE]]Conta-se que Diógenes, o cínico, ${W(70)} e Alexandre se retirou.[[/ANE]]

### Fecho
${W(180)}
</TEXTO><REFS>[{"fonte":"Platão, Apologia de Sócrates","tipo":"livro","citacao_direta":true,"confianca":"alta","obs":"conferir tradução"}]</REFS>`;
const short = `<TITULO>Curto</TITULO><TEXTO>\n### A\n${W(300)}\n</TEXTO><REFS>[]</REFS>`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, serviceWorkers: 'block' }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let calls = 0, lastBody = null;
  await pg.route('https://api.anthropic.com/**', async r => { calls++; lastBody = JSON.parse(r.request().postData()); const txt = calls === 1 ? short : good; await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text: txt }] }) }); });
  await pg.route(/docx@8\.5\.0/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('/opt/npm-tools/node_modules/docx/dist/index.iife.js') }));
  await pg.addInitScript(() => localStorage.setItem('ep_set', JSON.stringify({ apiKey: 'sk-test', author: 'Thiago Carvalho' })));
  await pg.goto('http://localhost:8765/');
  await pg.click('#nova'); await pg.fill('#f-title', 'Teste de Obra'); await pg.fill('#f-tema', 'Sobre a dúvida');
  await pg.fill('#f-rot', '# Origens\nMito e logos'); await pg.dispatchEvent('#f-rot', 'change');
  // anexo de texto
  await pg.setInputFiles('#f-att', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('A dúvida metódica é um tema de Descartes. ' .repeat(20)) });
  await pg.waitForSelector('#att >> text=nota.txt');
  await pg.click('#b-all');
  await pg.waitForFunction(() => document.querySelector('#log').textContent.includes('✓'), null, { timeout: 15000 }).catch(async e => { console.log('LOG:', await pg.textContent('#log')); console.log('TOAST:', await pg.textContent('#toast')); console.log('ERRS:', errs); process.exit(3); });
  const log = await pg.textContent('#log'); console.log(log);
  const userMsg = lastBody.messages[0].content; const sys = lastBody.system;
  const asserts = [];
  const t = (n, c) => { asserts.push([n, !!c]); };
  t('retry (2 chamadas)', calls === 2);
  t('anexo enviado na mensagem', userMsg.includes('<anexo>') && userMsg.includes('nota.txt'));
  t('sistema proíbe "ponto"', sys.includes('NUNCA use as palavras "ponto"'));
  t('sistema com metas 700–1100', sys.includes('700 e 1100'));
  await pg.click('nav [data-v=texto]');
  await pg.waitForSelector('#x-docx');
  const dl = pg.waitForEvent('download', {timeout: 8000}).catch(async () => { console.log('TOAST:', await pg.textContent('#toast'), errs); process.exit(4); });
  await pg.click('#x-docx');
  const d = await dl; const out = '/home/claude/test-out.docx'; await d.saveAs(out);
  t('docx baixado', fs.statSync(out).size > 4000);
  const edited = await pg.inputValue('textarea[data-e]'); t('editor sem tags', !/\[\[/.test(edited));
  for (const [n, ok] of asserts) console.log(ok ? 'OK ' : 'FALHOU', n);
  console.log('erros de página:', errs);
  await b.close(); srv.close(); process.exit(asserts.every(a => a[1]) && !errs.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
