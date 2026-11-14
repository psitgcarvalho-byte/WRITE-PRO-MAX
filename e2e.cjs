// Teste ponta a ponta no Chromium (Playwright). A API de IA é simulada; todo o resto é real:
// bibliotecas embutidas, leitura de anexos .pdf/.docx, exportação .docx e .pdf.
// Uso: node e2e.cjs <pasta-com-anexo.pdf-e-anexo.docx> <pasta-de-saida>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const root = __dirname, FX = process.argv[2], OUT = process.argv[3] || root;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
}).listen(8765);

const W = n => Array.from({ length: n }, (_, i) => ['reflexão', 'existência', 'liberdade', 'angústia', 'ação', 'coração', 'consciência', 'sentido'][i % 8]).join(' ');
const good = `<TITULO>A dúvida que se herda</TITULO><TEXTO>
### Origem do problema
${W(300)}

[[CIT]]Como lembra Platão, na Apologia, ${W(60)} [[DIR]]“a vida não examinada não vale a pena ser vivida, e quem nunca se interrogou sobre o que faz e por que o faz passa pelos dias como um sonâmbulo entre as coisas”[[/DIR]] ${W(40)}[[/CIT]]

### Desdobramentos
${W(220)} Termo grego: λόγος — e símbolos ≠ especiais.

[[ANE]]Conta-se que Diógenes, o cínico, ${W(70)} e Alexandre se retirou.[[/ANE]]

### Fecho
${W(180)}
</TEXTO><REFS>[{"fonte":"Platão, Apologia de Sócrates","tipo":"livro","citacao_direta":true,"confianca":"alta","obs":"conferir tradução"}]</REFS>`;
const short = `<TITULO>Curto</TITULO><TEXTO>\n### A\n${W(300)}\n</TEXTO><REFS>[]</REFS>`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = [], ext = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  pg.on('request', q => { const u = new URL(q.url()); if (!['localhost', 'api.anthropic.com'].includes(u.hostname)) ext.push(q.url()); });
  let calls = 0, lastBody = null;
  await pg.route('https://api.anthropic.com/**', async r => {
    calls++; lastBody = JSON.parse(r.request().postData());
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text: calls === 1 ? short : good }] }) });
  });
  await pg.addInitScript(() => localStorage.setItem('ep_set', JSON.stringify({ apiKey: 'sk-test', author: 'Thiago Carvalho' })));
  await pg.goto('http://localhost:8765/');
  const R = []; const t = (n, c, info) => R.push([n, !!c, info]);

  await pg.click('#nova'); await pg.fill('#f-title', 'Teste de Obra'); await pg.fill('#f-tema', 'Sobre a dúvida');
  await pg.fill('#f-rot', '# Origens\nMito e logos'); await pg.dispatchEvent('#f-rot', 'change');
  // anexos reais
  await pg.setInputFiles('#f-att', [path.join(FX, 'anexo.pdf'), path.join(FX, 'anexo.docx')]);
  await pg.waitForFunction(() => document.querySelectorAll('#att [data-rm]').length === 2, null, { timeout: 20000 }).catch(() => {});
  const attInfo = await pg.textContent('#att');
  t('2 anexos lidos (pdf + docx)', (attInfo.match(/caracteres/g) || []).length >= 2, attInfo.replace(/\s+/g, ' ').slice(0, 160));

  await pg.click('#b-all');
  await pg.waitForFunction(() => document.querySelector('#log').textContent.includes('✓'), null, { timeout: 20000 }).catch(() => {});
  const log = await pg.textContent('#log');
  const userMsg = lastBody.messages[0].content, sys = lastBody.system;
  t('correção automática (2 chamadas)', calls === 2, log.trim().split('\n').slice(-1)[0]);
  t('texto do PDF anexado foi à IA', userMsg.includes('ser-para-a-morte') && userMsg.includes('órfão'));
  t('texto do DOCX anexado foi à IA', userMsg.includes('vertigem da liberdade') && userMsg.includes('“aspas” & símbolos < >'));
  t('regras: proíbe "ponto" e pede 700–1100', sys.includes('NUNCA use as palavras "ponto"') && sys.includes('700 e 1100'));

  await pg.click('nav [data-v=texto]'); await pg.waitForSelector('#x-docx');
  for (const k of ['docx', 'pdf']) {
    const dl = pg.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await pg.click('#x-' + k);
    const d = await dl;
    if (!d) { t('exportou ' + k, false, await pg.textContent('#toast')); continue; }
    const f = path.join(OUT, 'teste.' + k); await d.saveAs(f);
    t('exportou ' + k, fs.statSync(f).size > 1500, d.suggestedFilename() + ' ' + fs.statSync(f).size + ' bytes');
  }
  t('editor sem marcações internas', !/\[\[/.test(await pg.inputValue('textarea[data-e]')));

  // Backup: exportar, excluir a obra, importar de volta
  const dlb = pg.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await pg.click('#x-bk'); const bk = await dlb;
  const bkf = path.join(OUT, 'backup.json'); if (bk) await bk.saveAs(bkf);
  t('backup exportado', bk && JSON.parse(fs.readFileSync(bkf, 'utf8')).projects.length === 1);
  await pg.click('nav [data-v=obras]'); await pg.waitForSelector('[data-del]');
  pg.once('dialog', d => d.accept()); await pg.click('[data-del]');
  await pg.waitForFunction(() => !document.querySelector('[data-del]'), null, { timeout: 5000 }).catch(() => {});
  t('obra excluída', !(await pg.$('[data-del]')));
  await pg.setInputFiles('#imp', bkf);
  await pg.waitForSelector('[data-open]', { timeout: 5000 }).catch(() => {});
  const lista = await pg.textContent('#v-obras');
  t('backup importado de volta', lista.includes('Teste de Obra') && lista.includes('1/1 seções'), lista.replace(/\s+/g, ' ').slice(0, 120));
  t('nenhuma requisição externa (tudo embutido)', ext.length === 0, ext.join(' '));
  t('sem erros no console', errs.length === 0, errs.join(' | '));

  for (const [n, ok, info] of R) console.log((ok ? 'OK     ' : 'FALHOU ') + n + (info ? '  — ' + info : ''));
  await b.close(); srv.close(); process.exit(R.every(x => x[1]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
