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
  await pg.addInitScript(() => localStorage.setItem('ep_set', JSON.stringify({ provider: 'anthropic', apiKey: 'sk-test', author: 'Thiago Carvalho' })));
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

  // NVIDIA: (a) no navegador sem proxy deve avisar claramente; (b) via proxy, formato OpenAI e <think> removido
  const p2 = await ctx.newPage(); let nvReq = null;
  p2.on('pageerror', e => errs.push('nv: ' + e.message));
  await p2.addInitScript(() => { if (!sessionStorage.getItem('nv')) { sessionStorage.setItem('nv', '1'); localStorage.setItem('ep_set', JSON.stringify({ provider: 'nvidia', nvKey: 'nvapi-teste', author: 'T' })); } });
  await p2.goto('http://localhost:8765/');
  await p2.click('#nova'); await p2.fill('#f-title', 'Obra NV'); await p2.fill('#f-rot', '# Cap\nAssunto'); await p2.dispatchEvent('#f-rot', 'change');
  await p2.click('#b-all'); await p2.waitForTimeout(800);
  t('NVIDIA sem proxy no navegador: aviso claro', (await p2.textContent('#log')).includes('não permite uso direto pelo navegador'));
  await p2.route('https://proxy.test/**', async r => { nvReq = { url: r.request().url(), h: r.request().headers(), b: JSON.parse(r.request().postData()) };
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '<think>raciocínio interno</think>' + good } }] }) }); });
  await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem('ep_set')); s.proxyUrl = 'https://proxy.test/'; localStorage.setItem('ep_set', JSON.stringify(s)); });
  await p2.reload(); await p2.click('[data-open]'); await p2.click('#b-redo').catch(() => {});
  p2.once('dialog', d => d.accept()); await p2.click('#b-redo');
  await p2.waitForFunction(() => document.querySelector('#log').textContent.includes('✓'), null, { timeout: 15000 }).catch(() => {});
  const nvLog = await p2.textContent('#log');
  t('NVIDIA via proxy gera seção', nvLog.includes('✓'), nvLog.trim().split('\n').slice(-2).join(' / ') + ' | toast: ' + await p2.textContent('#toast'));
  t('NVIDIA (config antiga migrada): rota /openai, chave Bearer, modelo e system', nvReq && nvReq.url === 'https://proxy.test/openai' && nvReq.h['x-target-base'] === 'https://integrate.api.nvidia.com/v1' && nvReq.h.authorization === 'Bearer nvapi-teste' && /gemma/.test(nvReq.b.model) && nvReq.b.messages[0].role === 'system');
  await p2.click('nav [data-v=texto]');
  const nvTxt = await p2.$('textarea[data-e]');
  t('NVIDIA: raciocínio <think> removido do texto', nvTxt && !(await nvTxt.inputValue()).includes('raciocínio interno'));

  // GEMINI: chave no cabeçalho (nunca na URL), formato do Google, partes de "pensamento" ignoradas
  const p3 = await ctx.newPage(); let gmReq = null;
  p3.on('pageerror', e => errs.push('gm: ' + e.message));
  await p3.addInitScript(() => { if (!sessionStorage.getItem('gm')) { sessionStorage.setItem('gm', '1'); localStorage.setItem('ep_set', JSON.stringify({ provider: 'gemini', gmKey: 'AIza-teste', author: 'T' })); } });
  await p3.route('https://generativelanguage.googleapis.com/**', async r => {
    const u = r.request().url();
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ models: [{ name: 'models/gemini-4-hydrogen', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] }] }) });
    const b = JSON.parse(r.request().postData()); const isTest = /conexão funcionando/.test(JSON.stringify(b.contents));
    if (!isTest) gmReq = { url: u, h: r.request().headers(), b };
    const roteiro = /Material do autor/.test(JSON.stringify(b.contents));
    const txt = isTest ? 'Conexão funcionando.' : roteiro ? '**# Capítulo 1: A verdade oculta**\n- O ocultamento\n2) A malícia\n## Capítulo 2 — O retorno\nA presença' : good;
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'pensamento interno', thought: true }, { text: txt }] }, finishReason: 'STOP' }] }) });
  });
  await p3.goto('http://localhost:8765/');
  await p3.click('nav [data-v=config]'); await p3.click('#c-test');
  await p3.waitForFunction(() => /✓|✗/.test(document.querySelector('#c-test-out').textContent), null, { timeout: 8000 }).catch(() => {});
  const testOut = await p3.textContent('#c-test-out');
  t('Gemini: "Testar conexão" confirma e lista modelos', testOut.includes('✓') && testOut.includes('gemini-4-hydrogen') && !testOut.includes('embedding'), testOut);
  // roteiro com texto corrido → aviso → vira anexo → roteiro sugerido
  await p3.click('nav [data-v=obras]'); await p3.click('#nova'); await p3.fill('#f-title', 'Obra GM');
  const prosa = Array.from({ length: 6 }, (_, i) => 'Este é um parágrafo longo do ensaio, número ' + i + ', que discute a verdade como algo sempre presente porém deliberadamente encoberto pelas conveniências sociais e pela malícia humana cotidiana.').join('\n');
  await p3.fill('#f-rot', prosa); await p3.dispatchEvent('#f-rot', 'change');
  t('Roteiro com texto corrido: aviso aparece', !!(await p3.$('#b-conv')));
  await p3.click('#b-conv');
  await p3.waitForFunction(() => document.querySelector('#f-rot').value.includes('# '), null, { timeout: 8000 }).catch(() => {});
  const rot = await p3.inputValue('#f-rot'), attTxt = await p3.textContent('#att'), secsTxt = await p3.textContent('#secs');
  t('Texto virou anexo e roteiro foi sugerido e limpo', attTxt.includes('Texto colado no roteiro') && rot === '# A verdade oculta\nO ocultamento\nA malícia\n# O retorno\nA presença' && !(await p3.$('#b-conv')), JSON.stringify(rot) + ' | ' + secsTxt.slice(0, 60));
  await p3.click('#b-all');
  await p3.waitForFunction(() => (document.querySelector('#log').textContent.match(/✓/g) || []).length >= 3, null, { timeout: 15000 }).catch(() => {});
  t('Gemini gera as seções', ((await p3.textContent('#log')).match(/✓/g) || []).length >= 3, (await p3.textContent('#log')).trim().split('\n').slice(-1)[0]);
  t('Gemini: chave no cabeçalho, não na URL; system e modelo certos', gmReq && gmReq.h['x-goog-api-key'] === 'AIza-teste' && !gmReq.url.includes('AIza') && gmReq.url.endsWith('/gemini-4-hydrogen:generateContent') && /NUNCA use as palavras/.test(gmReq.b.systemInstruction.parts[0].text));
  await p3.click('nav [data-v=texto]');
  const gmTxt = await p3.$('textarea[data-e]');
  t('Gemini: "pensamento interno" não entra no texto', gmTxt && !(await gmTxt.inputValue()).includes('pensamento interno'));

  // QUALQUER CHAVE: detecção automática e serviço genérico (padrão OpenAI) com ajuste de parâmetros
  const p4 = await ctx.newPage(); const orReqs = [];
  p4.on('pageerror', e => errs.push('or: ' + e.message));
  await p4.route('https://openrouter.ai/**', async r => {
    const u = r.request().url(), H = { 'access-control-allow-origin': '*' };
    if (u.endsWith('/models')) return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ data: [{ id: 'openai/text-embedding-3' }, { id: 'acme/pago' }, { id: 'meta-llama/llama-3.3-70b-instruct:free' }] }) });
    const b = JSON.parse(r.request().postData()); orReqs.push({ h: r.request().headers(), b });
    if ('max_tokens' in b) return r.fulfill({ status: 400, contentType: 'application/json', headers: H, body: JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'." } }) });
    await r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ choices: [{ message: { content: 'Conexão funcionando.' } }] }) });
  });
  await p4.goto('http://localhost:8765/'); await p4.click('nav [data-v=config]');
  await p4.fill('#c-key', 'sk-or-v1-abc123');
  t('Chave sk-or- reconhecida como OpenRouter', (await p4.inputValue('#c-prov')) === 'openrouter');
  await p4.fill('#c-key', 'AIzaSyTeste'); const g1 = await p4.inputValue('#c-prov');
  await p4.fill('#c-key', 'nvapi-xyz'); const g2 = await p4.inputValue('#c-prov');
  await p4.fill('#c-key', 'gsk_abc'); const g3 = await p4.inputValue('#c-prov');
  await p4.fill('#c-key', 'sk-ant-api03-x'); const g4 = await p4.inputValue('#c-prov');
  await p4.fill('#c-key', 'sk-0123456789abcdef0123456789abcdef'); const g5 = await p4.inputValue('#c-prov');
  await p4.fill('#c-key', 'sk-proj-AbCdEfGhIjKlMnOpQrStUv123'); const g6 = await p4.inputValue('#c-prov');
  t('Reconhece Gemini, NVIDIA, Groq, Claude, DeepSeek e OpenAI', [g1, g2, g3, g4, g5, g6].join() === 'gemini,nvidia,groq,anthropic,deepseek,openai', [g1, g2, g3, g4, g5, g6].join());
  await p4.fill('#c-key', 'sk-or-v1-abc123'); await p4.fill('#c-model', '');
  await p4.click('#c-test');
  await p4.waitForFunction(() => /✓|✗/.test(document.querySelector('#c-test-out').textContent), null, { timeout: 8000 }).catch(() => {});
  const orOut = await p4.textContent('#c-test-out');
  t('Serviço genérico: lista modelos (grátis primeiro), escolhe um e conecta', orOut.includes('✓ Funcionando com meta-llama/llama-3.3-70b-instruct:free') && !orOut.includes('embedding'), orOut.slice(0, 160));
  t('Ajusta max_tokens → max_completion_tokens quando o serviço exige', orReqs.length === 2 && orReqs[1].b.max_completion_tokens > 0 && orReqs[0].h.authorization === 'Bearer sk-or-v1-abc123');
  await p4.click('#c-save');
  const saved = await p4.evaluate(() => JSON.parse(localStorage.getItem('ep_set')));
  t('Chave e modelo salvos por serviço', saved.provider === 'openrouter' && saved.keys.openrouter === 'sk-or-v1-abc123' && saved.models.openrouter === 'meta-llama/llama-3.3-70b-instruct:free');

  // Conta sem saldo (como a resposta real da DeepSeek): mensagem clara, sem repetir à toa
  let dsCalls = 0;
  await p4.route('https://api.deepseek.com/**', async r => { dsCalls++; await r.fulfill({ status: 402, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Insufficient Balance', type: 'insufficient_balance_error' } }) }); });
  await p4.click('nav [data-v=obras]'); await p4.click('nav [data-v=config]');
  await p4.fill('#c-key', 'sk-0123456789abcdef0123456789abcdef');
  t('DeepSeek: modelo padrão atual', (await p4.inputValue('#c-model')) === 'deepseek-flash');
  await p4.click('#c-test');
  await p4.waitForFunction(() => /✓|✗/.test(document.querySelector('#c-test-out').textContent), null, { timeout: 8000 }).catch(() => {});
  const dsOut = await p4.textContent('#c-test-out');
  t('Sem saldo: aviso claro e sem tentativas repetidas', dsOut.includes('sem saldo') && dsCalls <= 2, dsOut + ' (' + dsCalls + ' chamadas)');

  if (errs.length) console.log('ERROS DE PÁGINA:', errs.join(' | '));
  for (const [n, ok, info] of R) console.log((ok ? 'OK     ' : 'FALHOU ') + n + (info ? '  — ' + info : ''));
  await b.close(); srv.close(); process.exit(R.every(x => x[1]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
