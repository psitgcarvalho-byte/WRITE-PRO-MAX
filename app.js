'use strict';
/* Ensaios Pro — app (web/PWA e APK via Capacitor). Funciona sem login; Google é opcional. */
(function () {
  var Core = window.Core;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var isNative = function () { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); };

  // Bibliotecas embutidas no app (funcionam sem internet). Só o login Google é externo.
  var LIBS = {
    docx: 'lib/docx.js',
    pdflib: 'lib/pdf-lib.min.js',
    pdfjs: 'lib/pdf.min.js',
    pdfWorker: 'lib/pdf.worker.min.js',
    gis: 'https://accounts.google.com/gsi/client'
  };
  var absUrl = function (u) { return new URL(u, location.href).href; };
  var loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = function () { delete loaded[src]; rej(new Error(src.indexOf('http') === 0 ? 'Não foi possível conectar ao Google. Verifique a internet.' : 'Não foi possível carregar um componente do app (' + src + ').')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  /* ---------- estado e armazenamento ---------- */
  var APP_VERSION = '2.2';
  var PROVIDERS_IDS = /^(gemini|nvidia|anthropic|openrouter|groq|xai|github|openai|deepseek|mistral|outro)$/;
  var DEF = { provider: 'gemini', keys: {}, models: {}, customBase: '', proxyUrl: '', accessCode: '', author: 'Thiago Carvalho', min: 700, max: 1100, cit: 10, ane: 5, dir: 2, googleClientId: '', style: '', samples: [], includeRefs: true };
  var S = { set: loadSet(), projects: [], cur: null, view: 'obras', busy: false, token: null };

  function loadSet() {
    var o; try { o = Object.assign({}, DEF, JSON.parse(localStorage.getItem('ep_set') || '{}')); } catch (e) { o = Object.assign({}, DEF); }
    o.keys = Object.assign({}, o.keys || {}); o.models = Object.assign({}, o.models || {});
    // migração da versão anterior (uma chave por campo)
    [['gmKey', 'gemini', 'gmModel'], ['nvKey', 'nvidia', 'nvModel'], ['apiKey', 'anthropic', 'model']].forEach(function (m) {
      if (o[m[0]] && !o.keys[m[1]]) o.keys[m[1]] = o[m[0]];
      if (o[m[2]] && !o.models[m[1]] && !(m[1] === 'anthropic' && o[m[2]] === 'claude-sonnet-5-5')) o.models[m[1]] = o[m[2]];
      delete o[m[0]]; delete o[m[2]];
    });
    if (!o.provider || !PROVIDERS_IDS.test(o.provider)) o.provider = o.keys.anthropic && !o.keys.gemini ? 'anthropic' : 'gemini';
    return o;
  }
  function saveSet() { localStorage.setItem('ep_set', JSON.stringify(S.set)); }
  function targets() { return { min: +S.set.min, max: +S.set.max, cit: S.set.cit / 100, ane: S.set.ane / 100, dir: S.set.dir / 100 }; }

  var DB = {
    db: null,
    open: function () {
      var self = this;
      return new Promise(function (res, rej) {
        var r = indexedDB.open('ensaios-pro', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('projects', { keyPath: 'id' }); };
        r.onsuccess = function () { self.db = r.result; res(); };
        r.onerror = function () { rej(r.error); };
      });
    },
    st: function (m) { return this.db.transaction('projects', m).objectStore('projects'); },
    all: function () { var s = this; return new Promise(function (res, rej) { var q = s.st('readonly').getAll(); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); },
    put: function (p) { var s = this; return new Promise(function (res, rej) { var q = s.st('readwrite').put(p); q.onsuccess = res; q.onerror = function () { rej(q.error); }; }); },
    del: function (id) { var s = this; return new Promise(function (res, rej) { var q = s.st('readwrite').delete(id); q.onsuccess = res; q.onerror = function () { rej(q.error); }; }); }
  };
  function persist() { if (S.cur) { S.cur.updated = Date.now(); return DB.put(S.cur); } }

  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, 3200); }
  function log(m) { var l = $('#log'); if (l) { l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; } }
  function slug(s) { return String(s || 'obra').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'obra'; }

  /* ---------- API de IA ---------- */
  /* ---------- serviços de IA: qualquer chave de API ---------- */
  // tipo: 'openai' = padrão OpenAI (/chat/completions), usado pela maioria dos serviços
  var PROVIDERS = {
    gemini: { nome: 'Google Gemini (grátis)', tipo: 'gemini', modelo: 'gemini-4-hydrogen', prefixo: /^AIza/, ajuda: 'Chave em aistudio.google.com → Chaves de API. No plano grátis o Google pode usar os textos para melhorar seus produtos.' },
    nvidia: { nome: 'NVIDIA (grátis, só no app do celular)', tipo: 'openai', base: 'https://integrate.api.nvidia.com/v1', modelo: 'google/gemma-4-31b-it', prefixo: /^nvapi-/, semNavegador: true, ajuda: 'Chave em build.nvidia.com. Modelo testado: Gemma 4 31B.' },
    anthropic: { nome: 'Claude / Anthropic (pago, melhor qualidade)', tipo: 'anthropic', modelo: 'claude-sonnet-5-5', prefixo: /^sk-ant-/, ajuda: 'Chave em console.anthropic.com (exige créditos).' },
    openrouter: { nome: 'OpenRouter (vários modelos, alguns grátis)', tipo: 'openai', base: 'https://openrouter.ai/api/v1', modelo: '', prefixo: /^sk-or-/, ajuda: 'Chave em openrouter.ai/keys. Modelos que terminam em ":free" são gratuitos.' },
    groq: { nome: 'Groq (grátis)', tipo: 'openai', base: 'https://api.groq.com/openai/v1', modelo: '', prefixo: /^gsk_/, ajuda: 'Chave em console.groq.com/keys.' },
    xai: { nome: 'xAI (Grok)', tipo: 'openai', base: 'https://api.x.ai/v1', modelo: '', prefixo: /^xai-/, ajuda: 'Chave em console.x.ai.' },
    github: { nome: 'GitHub Models', tipo: 'openai', base: 'https://models.github.ai/inference', modelo: '', prefixo: /^(ghp_|github_pat_)/, ajuda: 'Token do GitHub com permissão "models".' },
    deepseek: { nome: 'DeepSeek (barato)', tipo: 'openai', base: 'https://api.deepseek.com/v1', modelo: 'deepseek-flash', prefixo: /^sk-[0-9a-f]{32}$/, ajuda: 'Chave em platform.deepseek.com. Cobra por uso, com preço baixo.' },
    openai: { nome: 'OpenAI (ChatGPT)', tipo: 'openai', base: 'https://api.openai.com/v1', modelo: '', prefixo: /^sk-(proj-|svcacct-|admin-)?/, ajuda: 'Chave em platform.openai.com/api-keys.' },
    mistral: { nome: 'Mistral', tipo: 'openai', base: 'https://api.mistral.ai/v1', modelo: '', ajuda: 'Chave em console.mistral.ai.' },
    outro: { nome: 'Outro serviço (compatível com OpenAI)', tipo: 'openai', base: '', modelo: '', ajuda: 'Informe o endereço base da API (ex.: https://servico.com/v1).' }
  };
  function detectProvider(key) {
    key = String(key || '').trim();
    for (var id in PROVIDERS) if (PROVIDERS[id].prefixo && PROVIDERS[id].prefixo.test(key)) return id;
    return null;
  }
  function curProv() { return PROVIDERS[S.set.provider] ? S.set.provider : 'gemini'; }
  function curKey() { return (S.set.keys || {})[curProv()] || ''; }
  function curModel() { var id = curProv(); return ((S.set.models || {})[id] || PROVIDERS[id].modelo || '').trim(); }
  function curBase() { var id = curProv(); return (id === 'outro' ? S.set.customBase : PROVIDERS[id].base || '').replace(/\/+$/, ''); }
  var WEB_BLOCK = function (nome) { return nome + ' não permite uso direto pelo navegador do PC. Use o app no celular (APK), escolha outro serviço em Config., ou configure o proxy (ver README).'; };

  // Ponto único de chamada à IA (nome mantido por compatibilidade)
  async function callClaude(o) {
    var id = curProv(), P = PROVIDERS[id];
    if (!curKey() && !(id === 'anthropic' && S.set.proxyUrl)) throw new Error('Cole a sua chave de API na aba Config. (serviço: ' + P.nome + ').');
    if (P.tipo === 'gemini') return callGemini(o);
    if (P.tipo === 'anthropic') return callAnthropic(o);
    return callOpenAI(o, id, P);
  }
  async function postRetry(url, headers, body) {
    for (var i = 0; i < 5; i++) {
      var r;
      try { r = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }); }
      catch (e) {
        if (!isNative() && !S.set.proxyUrl && PROVIDERS[curProv()].tipo === 'openai') throw new Error(WEB_BLOCK(PROVIDERS[curProv()].nome));
        throw new Error('Sem conexão com o serviço de IA. Verifique a internet.');
      }
      if (r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503 || r.status === 529) { await sleep(3000 * (i + 1) * (i + 1)); continue; }
      var j = await r.json().catch(function () { return {}; });
      if (r.status === 401 || r.status === 403 || /API key not valid|API_KEY_INVALID|invalid.{0,10}api.{0,3}key|incorrect api key/i.test(JSON.stringify(j))) throw new Error('Chave recusada pelo serviço de IA. Confira a chave e o serviço em Config. (use "Testar conexão").');
      if (r.status === 402 || /insufficient.{0,3}balance|insufficient_quota|exceeded your current quota|billing/i.test(JSON.stringify(j))) throw new Error('A chave funciona, mas a conta do serviço está sem saldo/créditos. Adicione créditos no site do serviço ou use um serviço grátis (Gemini).');
      if (r.status === 404) throw new Error('Este modelo não está disponível para a sua chave. Escolha outro em Config. ("Testar conexão" lista os disponíveis).');
      if (!r.ok) { var err = new Error(String((j.error && (j.error.message || j.error)) || j.detail || j.message || ('Erro ' + r.status))); err.status = r.status; throw err; }
      return j;
    }
    throw new Error('Serviço ocupado (limite de uso). Aguarde um minuto e tente de novo.');
  }
  async function callOpenAI(o, id, P) {
    var base = curBase(), model = curModel();
    if (!base) throw new Error('Informe o endereço base da API em Config.');
    if (!model) throw new Error('Escolha um modelo em Config. ("Testar conexão" lista os disponíveis).');
    if (P.semNavegador && !isNative() && !S.set.proxyUrl) throw new Error(WEB_BLOCK(P.nome));
    var url = S.set.proxyUrl ? S.set.proxyUrl.replace(/\/+$/, '') + '/openai' : base + '/chat/completions';
    var headers = { 'content-type': 'application/json', authorization: 'Bearer ' + curKey() };
    if (S.set.proxyUrl) { headers['x-target-base'] = base; if (S.set.accessCode) headers['x-access-code'] = S.set.accessCode; }
    var body = { model: model, max_tokens: Math.max(o.max_tokens || 0, 6000), temperature: 0.7, messages: [{ role: 'system', content: o.system }].concat(o.messages) };
    var j;
    for (var k = 0; k < 3; k++) {
      try { j = await postRetry(url, headers, body); break; }
      catch (e) {
        // Modelos mais novos (OpenAI e outros) recusam alguns parâmetros: ajusta e tenta de novo
        if (e.status === 400 && /max_tokens/.test(e.message) && body.max_tokens) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; continue; }
        if (e.status === 400 && /temperature/.test(e.message) && 'temperature' in body) { delete body.temperature; continue; }
        throw e;
      }
    }
    var m = j && j.choices && j.choices[0] && j.choices[0].message;
    var out = String((m && m.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!out) throw new Error('A IA não devolveu texto. Tente de novo ou escolha outro modelo em Config.');
    return out;
  }
  var GM_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  async function callGemini(o) {
    var model = curModel().replace(/^models\//, '');
    var j = await postRetry(GM_BASE + '/' + encodeURIComponent(model) + ':generateContent', { 'content-type': 'application/json', 'x-goog-api-key': curKey() }, {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: o.messages.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; }),
      generationConfig: { maxOutputTokens: Math.max(o.max_tokens || 0, 8192), temperature: 0.7 }
    });
    if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('O Gemini recusou o pedido (' + j.promptFeedback.blockReason + '). Reformule o tema ou troque de serviço.');
    var c = j.candidates && j.candidates[0];
    var out = c && c.content && c.content.parts ? c.content.parts.filter(function (x) { return !x.thought && x.text; }).map(function (x) { return x.text; }).join('') : '';
    if (!out.trim()) throw new Error('O Gemini não devolveu texto' + (c && c.finishReason ? ' (' + c.finishReason + ')' : '') + '. Tente de novo.');
    return out.trim();
  }
  async function callAnthropic(o) {
    var body = { model: curModel() || 'claude-sonnet-5-5', max_tokens: o.max_tokens || 4500, system: o.system, messages: o.messages };
    var url, headers = { 'content-type': 'application/json' };
    if (S.set.proxyUrl) {
      url = S.set.proxyUrl;
      if (S.set.accessCode) headers['x-access-code'] = S.set.accessCode;
    } else {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = curKey();
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    var j = await postRetry(url, headers, body);
    return (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  }
  // Lista os modelos de texto disponíveis para a chave (usado por "Testar conexão")
  async function listModels() {
    var id = curProv(), P = PROVIDERS[id], r, j, names = [];
    try {
      if (P.tipo === 'gemini') {
        r = await fetch(GM_BASE + '?pageSize=200', { headers: { 'x-goog-api-key': curKey() } }); j = await r.json();
        names = (j.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /gemini/i.test(m.name); }).map(function (m) { return m.name.replace(/^models\//, ''); });
      } else if (P.tipo === 'anthropic') {
        r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': curKey(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }); j = await r.json();
        names = (j.data || []).map(function (m) { return m.id; });
      } else if (!S.set.proxyUrl) {
        r = await fetch(curBase() + '/models', { headers: { authorization: 'Bearer ' + curKey() } }); j = await r.json();
        names = (j.data || j.models || []).map(function (m) { return m.id || m.name; }).filter(Boolean);
        if (id === 'openrouter') names.sort(function (a, b) { return (/:free$/.test(b) ? 1 : 0) - (/:free$/.test(a) ? 1 : 0); });
      }
    } catch (e) { return []; }
    return names.filter(function (n) { return !/embed|whisper|tts|dall-e|image|audio|moderation|rerank|guard|transcri|realtime|vision|ocr|speech|search-preview/i.test(n); });
  }

  /* ---------- leitura de anexos ---------- */
  var pdfjsP = null;
  function getPdfjs() {
    if (!pdfjsP) pdfjsP = import(absUrl(LIBS.pdfjs)).then(function (m) { m.GlobalWorkerOptions.workerSrc = absUrl(LIBS.pdfWorker); return m; })
      .catch(function (e) { pdfjsP = null; throw new Error('Não foi possível abrir o leitor de PDF: ' + e.message); });
    return pdfjsP;
  }
  async function pdfText(buf) {
    var lib = await getPdfjs();
    var d = await lib.getDocument({ data: new Uint8Array(buf) }).promise, out = [];
    for (var i = 1; i <= d.numPages; i++) {
      var c = await (await d.getPage(i)).getTextContent(), line = '';
      c.items.forEach(function (x) { line += x.str + (x.hasEOL ? '\n' : ' '); });
      out.push(line);
    }
    return out.join('\n\n');
  }
  // Leitor de .docx sem dependências: abre o zip e extrai o texto de word/document.xml
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue ler .docx; envie o arquivo em PDF ou TXT.');
    var st = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function docxText(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), e = -1, dec = new TextDecoder('utf-8');
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Arquivo .docx inválido ou corrompido.');
    var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), xml = null;
    for (var k = 0; k < n && dv.getUint32(off, true) === 0x02014b50; k++) {
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true), name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      if (name === 'word/document.xml') {
        var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        var data = u8.subarray(start, start + csize);
        xml = dec.decode(method === 0 ? data : await inflateRaw(data));
        break;
      }
      off += 46 + nlen + xlen + clen;
    }
    if (xml == null) throw new Error('Não encontrei o texto dentro do .docx.');
    var ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/&(#x?[0-9a-f]+|\w+);/gi, function (m, c) {
        if (c[0] === '#') return String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10));
        return ent[c] || m;
      }).replace(/\n{3,}/g, '\n\n').trim();
  }
  async function readFile(f) {
    var n = f.name.toLowerCase();
    if (n.endsWith('.pdf')) return pdfText(await f.arrayBuffer());
    if (n.endsWith('.docx')) return docxText(await f.arrayBuffer());
    if (n.endsWith('.doc')) throw new Error(f.name + ': formato .doc antigo; salve como .docx ou PDF.');
    return await f.text();
  }

  /* ---------- geração ---------- */
  async function genSection(ci, si) {
    var p = S.cur, c = p.chapters[ci], s = c.sections[si], T = targets();
    var prev = [], tail = '';
    p.chapters.forEach(function (cc, a) { cc.sections.forEach(function (ss, b) { if (ss.raw && (a < ci || (a === ci && b < si))) { prev.push(ss.title || ss.ponto); tail = Core.strip(ss.raw).slice(-700); } }); });
    var att = '';
    if (p.attachments && p.attachments.length) {
      var all = p.attachments.map(function (a) { return '[Arquivo: ' + a.name + ']\n' + a.text; }).join('\n\n');
      att = Core.rankChunks(all, s.ponto + ' ' + c.title + ' ' + (p.tema || ''), 24000);
    }
    var sys = Core.buildSystem({ author: S.set.author || p.author, targets: T, style: S.set.style, samples: S.set.samples });
    var msgs = [{ role: 'user', content: Core.buildUser({ tema: p.tema || p.title, title: p.title, ci: ci + 1, si: si + 1, chapter: c.title, ponto: s.ponto, prevTitles: prev, prevTail: tail, attachment: att }) }];
    var best = null;
    for (var a = 0; a < 3; a++) {
      log('  tentativa ' + (a + 1) + '…');
      var out = await callClaude({ system: sys, messages: msgs });
      var pr = Core.parseResponse(out), m = Core.analyze(pr.texto), probs = Core.check(m, T, pr.texto);
      var dist = Math.abs(m.total - (T.min + T.max) / 2);
      if (!best || probs.length < best.probs.length || (probs.length === best.probs.length && dist < best.dist)) best = { pr: pr, m: m, probs: probs, dist: dist };
      log('  ' + m.total + ' palavras · cit ' + (m.cit * 100).toFixed(1) + '% · anedotas ' + (m.ane * 100).toFixed(1) + '% · diretas ' + (m.dir * 100).toFixed(1) + '%' + (probs.length ? ' → ajustando' : ' ✓'));
      if (!probs.length) break;
      msgs = msgs.concat([{ role: 'assistant', content: out }, { role: 'user', content: Core.buildFix(m, probs) }]);
    }
    s.raw = best.pr.texto; s.title = best.pr.titulo || s.ponto.slice(0, 80); s.refs = best.pr.refs;
    s.metrics = best.m; s.problems = best.probs; s.edited = false;
    await persist();
  }

  async function genAll(onlyMissing) {
    if (S.busy) return;
    S.busy = true; setBusy(true);
    try {
      for (var ci = 0; ci < S.cur.chapters.length; ci++) for (var si = 0; si < S.cur.chapters[ci].sections.length; si++) {
        var s = S.cur.chapters[ci].sections[si];
        if (onlyMissing && s.raw) continue;
        log('Capítulo ' + (ci + 1) + ', seção ' + (ci + 1) + '.' + (si + 1) + ': ' + s.ponto.slice(0, 60));
        await genSection(ci, si);
        renderSecList();
      }
      toast('Geração concluída');
    } catch (e) { log('ERRO: ' + e.message); toast(e.message); }
    S.busy = false; setBusy(false); renderSecList();
  }
  async function genOne(ci, si) {
    if (S.busy) return;
    S.busy = true; setBusy(true);
    try { log('Refazendo ' + (ci + 1) + '.' + (si + 1) + '…'); await genSection(ci, si); toast('Seção pronta'); }
    catch (e) { log('ERRO: ' + e.message); toast(e.message); }
    S.busy = false; setBusy(false); renderSecList();
  }
  function setBusy(b) { document.querySelectorAll('button.b').forEach(function (x) { x.disabled = b; }); }

  /* ---------- exportação ---------- */
  async function saveBlob(blob, name) {
    if (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      var b64 = await new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.readAsDataURL(blob); });
      var w = await window.Capacitor.Plugins.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      try { await window.Capacitor.Plugins.Share.share({ title: name, url: w.uri, dialogTitle: 'Salvar ou enviar' }); }
      catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; }
      return;
    }
    if (isNative()) throw new Error('Exportação indisponível nesta instalação do app. Reinstale o APK mais recente.');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  async function buildDocx(p) {
    await loadScript(LIBS.docx);
    var D = window.docx, F = 'Times New Roman', ch = [];
    Core.toBlocks(p, { refs: S.set.includeRefs }).forEach(function (b) {
      if (b.t === 'title') ch.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 3200, after: 400 }, children: [new D.TextRun({ text: b.x.toUpperCase(), bold: true, size: 32, font: F })] }));
      else if (b.t === 'subtitle') ch.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 800 }, children: [new D.TextRun({ text: b.x, italics: true, size: 26, font: F })] }));
      else if (b.t === 'author') { ch.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 1600 }, children: [new D.TextRun({ text: b.x, size: 24, font: F })] })); ch.push(new D.Paragraph({ children: [new D.PageBreak()] })); }
      else if (b.t === 'h1') ch.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 240, after: 360 }, children: [new D.TextRun({ text: b.x.toUpperCase(), bold: true, size: 28, font: F, color: '000000' })] }));
      else if (b.t === 'h2') ch.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 360, after: 200 }, children: [new D.TextRun({ text: b.x, bold: true, size: 26, font: F, color: '000000' })] }));
      else if (b.t === 'h3') ch.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 240, after: 160 }, children: [new D.TextRun({ text: b.x, bold: true, italics: true, size: 24, font: F, color: '000000' })] }));
      else if (b.t === 'ref') ch.push(new D.Paragraph({ spacing: { line: 276, after: 80 }, children: [new D.TextRun({ text: b.x, size: 22, font: F })] }));
      else ch.push(new D.Paragraph({ alignment: D.AlignmentType.JUSTIFIED, indent: { firstLine: 709 }, spacing: { line: 360, after: 120 }, children: [new D.TextRun({ text: b.x, size: 24, font: F })] }));
    });
    var doc = new D.Document({
      creator: p.author || 'Ensaios Pro', title: p.title,
      sections: [{
        properties: { page: { margin: { top: 1701, left: 1701, bottom: 1134, right: 1134 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ children: [D.PageNumber.CURRENT], font: F, size: 20 })] })] }) },
        children: ch
      }]
    });
    return D.Packer.toBlob(doc);
  }

  // PDF A4 com fontes Times (ABNT: margens 3/2/3/2 cm, corpo 12, entrelinha 1,5, recuo 1,25 cm)
  async function buildPdf(p) {
    await loadScript(LIBS.pdflib);
    var PL = window.PDFLib, doc = await PL.PDFDocument.create();
    doc.setTitle(p.title || 'Sem título'); if (p.author) doc.setAuthor(p.author); doc.setCreator('Ensaios Pro');
    var F = {
      n: await doc.embedFont(PL.StandardFonts.TimesRoman), b: await doc.embedFont(PL.StandardFonts.TimesRomanBold),
      i: await doc.embedFont(PL.StandardFonts.TimesRomanItalic), bi: await doc.embedFont(PL.StandardFonts.TimesRomanBoldItalic)
    };
    var MM = 72 / 25.4, PW = 595.28, PH = 841.89, L = 30 * MM, R = 20 * MM, T = 30 * MM, B = 20 * MM, W = PW - L - R;
    var ink = PL.rgb(0, 0, 0), page = null, y = 0, ok = {};
    // As fontes padrão do PDF só têm o alfabeto latino (WinAnsi); outros caracteres viram equivalentes
    var MAP = { ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '‐': '-', '‑': '-', '−': '-', '­': '', '​': '', '﻿': '', '′': "'", '″': '"', '«': '«', '»': '»' };
    // Grego e cirílico são transliterados (λόγος → logos), pois as fontes do PDF não os contêm. O .docx mantém o original.
    var GR = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'e', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'o',
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia' };
    var translit = function (ch) {
      var base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), low = base.toLowerCase(), r = GR[low];
      if (r == null) return null;
      return base !== low && r ? r[0].toUpperCase() + r.slice(1) : r;
    };
    var clean = function (t) {
      return Array.from(String(t).normalize('NFC')).map(function (ch) {
        if (MAP[ch] != null) ch = MAP[ch];
        var tr = /[\u0370-\u03ff\u1f00-\u1fff\u0400-\u04ff]/.test(ch) ? translit(ch) : null;
        if (tr != null) return tr;
        if (ch === '' || ok[ch] === true) return ch;
        if (ok[ch] === false) return '?';
        try { F.n.encodeText(ch); ok[ch] = true; return ch; } catch (e) { ok[ch] = false; return '?'; }
      }).join('');
    };
    var newPage = function () { page = doc.addPage([PW, PH]); y = PH - T; };
    var wrap = function (text, font, size, width, indent) {
      var words = clean(text).split(/\s+/).filter(Boolean), lines = [], cur = [], curW = 0, sp = font.widthOfTextAtSize(' ', size);
      words.forEach(function (w) {
        var ww = font.widthOfTextAtSize(w, size), avail = width - (lines.length ? 0 : indent);
        if (cur.length && curW + sp + ww > avail) { lines.push(cur); cur = []; curW = 0; }
        curW += (cur.length ? sp : 0) + ww; cur.push(w);
      });
      if (cur.length) lines.push(cur);
      return lines;
    };
    var para = function (text, font, size, opt) {
      opt = opt || {};
      var lh = size * (opt.lh || 1.5), indent = opt.indent || 0, lines = wrap(text, font, size, W, indent);
      if (opt.keep && y - lh * Math.min(3, lines.length + 1) < B) newPage();
      lines.forEach(function (ws, li) {
        if (y - size < B) newPage();
        var x = L + (li === 0 ? indent : 0), avail = W - (li === 0 ? indent : 0);
        if (opt.center) {
          var s = ws.join(' ');
          page.drawText(s, { x: L + (W - font.widthOfTextAtSize(s, size)) / 2, y: y - size, size: size, font: font, color: ink });
        } else if (opt.justify && li < lines.length - 1 && ws.length > 1) {
          var tw = ws.reduce(function (a, w) { return a + font.widthOfTextAtSize(w, size); }, 0), gap = (avail - tw) / (ws.length - 1);
          ws.forEach(function (w) { page.drawText(w, { x: x, y: y - size, size: size, font: font, color: ink }); x += font.widthOfTextAtSize(w, size) + gap; });
        } else {
          page.drawText(ws.join(' '), { x: x, y: y - size, size: size, font: font, color: ink });
        }
        y -= lh;
      });
      y -= opt.after || 0;
    };
    newPage(); // capa
    Core.toBlocks(p, { refs: S.set.includeRefs }).forEach(function (b) {
      if (b.t === 'title') { y = PH - 280; para(b.x.toUpperCase(), F.b, 18, { center: true, lh: 1.3, after: 14 }); }
      else if (b.t === 'subtitle') para(b.x, F.i, 13, { center: true, lh: 1.3 });
      else if (b.t === 'author') { y = Math.min(y, PH - 560); para(b.x, F.n, 12, { center: true }); }
      else if (b.t === 'h1') { newPage(); para(b.x.toUpperCase(), F.b, 14, { lh: 1.3, after: 18 }); }
      else if (b.t === 'h2') { y -= 10; para(b.x, F.b, 13, { keep: true, lh: 1.3, after: 8 }); }
      else if (b.t === 'h3') { y -= 6; para(b.x, F.bi, 12, { keep: true, lh: 1.3, after: 6 }); }
      else if (b.t === 'ref') para(b.x, F.n, 10.5, { lh: 1.2, after: 4 });
      else para(b.x, F.n, 12, { justify: true, indent: 12.5 * MM, after: 6 });
    });
    var pages = doc.getPages();
    pages.forEach(function (pg, i) { if (i > 0) { var s = String(i + 1); pg.drawText(s, { x: PW - R - F.n.widthOfTextAtSize(s, 10), y: 10 * MM, size: 10, font: F.n, color: ink }); } });
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  async function doExport(kind) {
    var p = S.cur;
    if (!p || !p.chapters.some(function (c) { return c.sections.some(function (s) { return s.raw; }); })) return toast('Ainda não há texto gerado.');
    try {
      toast('Preparando ' + kind.toUpperCase() + '…');
      var name = slug(p.title) + '.' + kind;
      var blob = kind === 'docx' ? await buildDocx(p) : await buildPdf(p);
      await saveBlob(blob, name);
      return blob;
    } catch (e) { toast(e.message); }
  }

  /* ---------- Google Drive (opcional; só web/PWA) ---------- */
  async function driveToken() {
    if (S.token && S.tokenExp > Date.now()) return S.token;
    if (!S.set.googleClientId) throw new Error('Informe o Client ID do Google na aba Config.');
    await loadScript(LIBS.gis);
    return new Promise(function (res, rej) {
      var tc = window.google.accounts.oauth2.initTokenClient({
        client_id: S.set.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: function (r) { if (r.error) return rej(new Error('Login Google: ' + r.error)); S.token = r.access_token; S.tokenExp = Date.now() + (r.expires_in - 60) * 1000; res(S.token); },
        error_callback: function (e) { rej(new Error('Login Google cancelado ou bloqueado.')); }
      });
      tc.requestAccessToken();
    });
  }
  async function gfetch(url, opt) {
    var t = await driveToken();
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + t }, opt.headers || {});
    var r = await fetch(url, opt);
    if (!r.ok) throw new Error('Drive: ' + r.status);
    return r;
  }
  async function driveFolder() {
    var q = encodeURIComponent("name='Ensaios Pro' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    var j = await (await gfetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)')).json();
    if (j.files && j.files.length) return j.files[0].id;
    var c = await (await gfetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ensaios Pro', mimeType: 'application/vnd.google-apps.folder' }) })).json();
    return c.id;
  }
  async function driveUpload(blob, name, mime, folder, existingId) {
    var fd = new FormData();
    var meta = existingId ? { name: name } : { name: name, parents: [folder] };
    fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    fd.append('file', new Blob([blob], { type: mime }));
    var url = existingId ? 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=multipart' : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    return (await gfetch(url, { method: existingId ? 'PATCH' : 'POST', body: fd })).json();
  }
  async function driveFind(name, folder) {
    var q = encodeURIComponent("name='" + name.replace(/'/g, "\\'") + "' and '" + folder + "' in parents and trashed=false");
    var j = await (await gfetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)')).json();
    return j.files && j.files[0] ? j.files[0].id : null;
  }
  async function driveSend(kind) {
    try {
      var blob = await (kind === 'docx' ? buildDocx(S.cur) : buildPdf(S.cur));
      var folder = await driveFolder(), name = slug(S.cur.title) + '.' + kind;
      var id = await driveFind(name, folder);
      await driveUpload(blob, name, kind === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf', folder, id);
      toast('Enviado ao Drive: Ensaios Pro/' + name);
    } catch (e) { toast(e.message); }
  }
  async function driveBackup(push) {
    try {
      var folder = await driveFolder(), name = 'ensaios-pro-backup.json', id = await driveFind(name, folder);
      if (push) {
        S.projects = await DB.all();
        await driveUpload(new Blob([JSON.stringify({ v: 1, projects: S.projects })], { type: 'application/json' }), name, 'application/json', folder, id);
        toast('Backup salvo no Drive');
      } else {
        if (!id) return toast('Nenhum backup no Drive.');
        var j = await (await gfetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media')).json();
        for (var i = 0; i < j.projects.length; i++) await DB.put(j.projects[i]);
        S.projects = await DB.all(); renderObras(); toast('Obras restauradas do Drive');
      }
    } catch (e) { toast(e.message); }
  }
  async function backupLocal() {
    try {
      S.projects = await DB.all();
      await saveBlob(new Blob([JSON.stringify({ v: 1, projects: S.projects })], { type: 'application/json' }), 'ensaios-pro-backup.json');
    } catch (e) { toast(e.message); }
  }

  /* ---------- views ---------- */
  function go(v) {
    S.view = v;
    ['obras', 'obra', 'texto', 'config'].forEach(function (k) { $('#v-' + k).hidden = k !== v; });
    document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    if (v === 'obras') DB.all().then(function (a) { S.projects = a; renderObras(); }); if (v === 'obra') renderObra(); if (v === 'texto') renderTexto(); if (v === 'config') renderConfig();
    window.scrollTo(0, 0);
  }

  function newProject() {
    return { id: uid(), title: '', subtitle: '', tema: '', author: S.set.author, roteiro: '', chapters: [], attachments: [], created: Date.now(), updated: Date.now() };
  }

  function renderObras() {
    var h = '<h2>Suas obras</h2><button class="b red" id="nova">+ Nova obra</button>' +
      '<label class="b ghost">Importar backup (.json)<input type="file" id="imp" accept=".json,application/json" hidden></label>';
    if (!S.projects.length) h += '<p class="mut">Nenhuma obra ainda. Tudo fica salvo neste aparelho, sem precisar de login.</p>';
    S.projects.sort(function (a, b) { return b.updated - a.updated; }).forEach(function (p) {
      var n = 0, d = 0; p.chapters.forEach(function (c) { c.sections.forEach(function (s) { n++; if (s.raw) d++; }); });
      h += '<div class="card"><b>' + esc(p.title || 'Sem título') + '</b><div class="mut">' + d + '/' + n + ' seções geradas · ' + new Date(p.updated).toLocaleDateString('pt-BR') + '</div>' +
        '<button class="b" data-open="' + p.id + '">Abrir</button><button class="b ghost" data-del="' + p.id + '">Excluir</button></div>';
    });
    $('#v-obras').innerHTML = h;
    $('#nova').onclick = function () { S.cur = newProject(); go('obra'); };
    $('#imp').onchange = async function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      try {
        var j = JSON.parse(await f.text()), list = j && Array.isArray(j.projects) ? j.projects : null;
        if (!list) throw new Error('Este arquivo não é um backup do Ensaios Pro.');
        var n = 0;
        for (var i = 0; i < list.length; i++) { var p = list[i]; if (p && p.id && Array.isArray(p.chapters)) { await DB.put(p); n++; } }
        S.projects = await DB.all(); renderObras(); toast(n + ' obra(s) importada(s)');
      } catch (e) { toast(e instanceof SyntaxError ? 'Arquivo de backup inválido.' : e.message); }
    };
    $('#v-obras').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { S.cur = S.projects.find(function (p) { return p.id === b.dataset.open; }); go('obra'); }; });
    $('#v-obras').querySelectorAll('[data-del]').forEach(function (b) { b.onclick = async function () { if (!confirm('Excluir esta obra?')) return; await DB.del(b.dataset.del); S.projects = await DB.all(); if (S.cur && S.cur.id === b.dataset.del) S.cur = null; renderObras(); }; });
  }

  function syncForm() {
    var p = S.cur; if (!p || !$('#f-title')) return;
    p.title = $('#f-title').value.trim(); p.subtitle = $('#f-sub').value.trim(); p.tema = $('#f-tema').value.trim(); p.author = $('#f-author').value.trim();
    var rot = $('#f-rot').value;
    if (rot !== p.roteiro) {
      var old = {}; p.chapters.forEach(function (c) { c.sections.forEach(function (s) { old[s.ponto] = s; }); });
      p.roteiro = rot; p.chapters = Core.parseRoteiro(rot);
      p.chapters.forEach(function (c) { c.sections = c.sections.map(function (s) { return old[s.ponto] || s; }); });
    }
  }
  async function saveProject() {
    syncForm();
    if (!S.cur.title) return toast('Dê um título à obra.');
    await persist();
    S.projects = await DB.all();
    toast('Obra salva');
  }

  function renderObra() {
    var p = S.cur;
    if (!p) { $('#v-obra').innerHTML = '<p class="mut">Abra ou crie uma obra na aba Obras.</p>'; return; }
    var h = '<h2>Obra</h2>' +
      '<label>Título</label><input id="f-title" value="' + esc(p.title) + '">' +
      '<label>Subtítulo (opcional)</label><input id="f-sub" value="' + esc(p.subtitle) + '">' +
      '<label>Autor na capa</label><input id="f-author" value="' + esc(p.author) + '">' +
      '<label>Tema / comando geral</label><textarea id="f-tema">' + esc(p.tema) + '</textarea>' +
      '<label>Roteiro — use "# Título" para cada capítulo; cada linha abaixo vira uma seção (700–1100 palavras) </label>' +
      '<textarea id="f-rot" class="big" placeholder="# Origens do problema&#10;Mito e logos&#10;Os sofistas&#10;# Modernidade&#10;Descartes e a dúvida">' + esc(p.roteiro) + '</textarea>' +
      '<button class="b ghost" id="b-rot">Sugerir roteiro com IA a partir do tema</button>' +
      '<h3>Anexos (fonte para o texto)</h3><input type="file" id="f-att" multiple accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"><div id="att"></div>' +
      '<p><button class="b" id="b-save">Salvar obra</button></p>' +
      '<h2>Geração</h2><div id="secs"></div>' +
      '<button class="b red" id="b-all">Gerar o que falta</button><button class="b ghost" id="b-redo">Refazer tudo</button>' +
      '<div id="log"></div>';
    $('#v-obra').innerHTML = h;
    renderAtt(); renderSecList();
    $('#b-save').onclick = saveProject;
    $('#b-all').onclick = async function () { syncForm(); if (roteiroPareceTexto(S.cur.roteiro) && !confirm('O roteiro parece um texto corrido e vai gerar muitas seções. Gerar mesmo assim?')) return; await saveProject(); if (S.cur.title) genAll(true); };
    $('#b-redo').onclick = async function () { if (confirm('Refazer todas as seções? O texto atual será substituído.')) { await saveProject(); genAll(false); } };
    $('#b-rot').onclick = async function () {
      syncForm();
      var tema = S.cur.tema || S.cur.title;
      if (!tema && !S.cur.attachments.length) return toast('Escreva o tema ou anexe um texto primeiro.');
      var mat = S.cur.attachments.length ? Core.rankChunks(S.cur.attachments.map(function (a) { return '[Arquivo: ' + a.name + ']\n' + a.text; }).join('\n\n'), tema + ' ' + (S.cur.subtitle || ''), 20000) : '';
      try {
        toast('Gerando roteiro…'); setBusy(true);
        var out = await callClaude({ max_tokens: 2000, system: 'Você é editor de livros de ensaio. Proponha o roteiro de um livro em português do Brasil. Formato estrito: de 3 a 8 capítulos; cada capítulo em uma linha começando com "# " seguido do título; sob cada capítulo, de 3 a 6 linhas, cada uma o assunto de uma seção (uma frase curta, sem numeração). Não escreva nada além do roteiro.', messages: [{ role: 'user', content: 'Título: ' + (S.cur.title || '') + (S.cur.subtitle ? '\nSubtítulo: ' + S.cur.subtitle : '') + '\nTema: ' + tema + (mat ? '\n\nMaterial do autor (use como base do roteiro):\n' + mat : '') }] });
        out = out.replace(/```[a-z]*\n?|```/g, '').replace(/\*\*/g, '').split('\n').map(function (l) { return l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^\s*#+\s*(?:cap[ií]tulo\s*\d*\s*[:.\-—]\s*)?/i, function (m) { return '# '; }).trim(); }).filter(Boolean).join('\n');
        $('#f-rot').value = out; syncForm(); renderSecList(); await persist(); toast('Roteiro sugerido — revise antes de gerar');
      } catch (e) { toast(e.message); }
      setBusy(false);
    };
    $('#f-att').onchange = async function (ev) {
      for (var i = 0; i < ev.target.files.length; i++) {
        var f = ev.target.files[i];
        try {
          var t = (await readFile(f)).replace(/\s+\n/g, '\n').trim();
          if (t.length < 50) { toast(f.name + ': sem texto legível (PDF escaneado?).'); continue; }
          S.cur.attachments.push({ name: f.name, text: t });
          toast(f.name + ': ' + t.length.toLocaleString('pt-BR') + ' caracteres lidos');
        } catch (e) { toast(e.message); }
      }
      renderAtt(); persist();
    };
    ['f-rot'].forEach(function (id) { $('#' + id).onchange = function () { syncForm(); renderSecList(); }; });
  }
  function renderAtt() {
    var a = S.cur.attachments || [];
    $('#att').innerHTML = a.map(function (x, i) { return '<div class="mut">📎 ' + esc(x.name) + ' · ' + x.text.length.toLocaleString('pt-BR') + ' caracteres <a href="#" data-rm="' + i + '">remover</a></div>'; }).join('') +
      (a.length ? '<div class="mut">Trechos mais relevantes ao assunto de cada seção são enviados à IA (até ~24 mil caracteres por seção).</div>' : '');
    $('#att').querySelectorAll('[data-rm]').forEach(function (l) { l.onclick = function (e) { e.preventDefault(); S.cur.attachments.splice(+l.dataset.rm, 1); renderAtt(); persist(); }; });
  }
  function pct(x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; }
  function pills(s) {
    if (!s.metrics) return s.raw ? '<span class="pill">editado</span>' : '<span class="pill">pendente</span>';
    var m = s.metrics, h = '<span class="pill ' + (s.problems && s.problems.length ? 'warn' : 'ok') + '">' + m.total + ' palavras</span>' +
      '<span class="pill">cit ' + pct(m.cit) + '</span><span class="pill">anedotas ' + pct(m.ane) + '</span><span class="pill">diretas ' + pct(m.dir) + '</span>';
    if (s.problems && s.problems.length) h += '<div class="mut" style="color:#BC2E28">' + s.problems.map(esc).join('<br>') + '</div>';
    return h;
  }
  // Roteiro deve ser lista curta de assuntos. Texto corrido colado ali gera dezenas de seções.
  function roteiroPareceTexto(rot) {
    var ls = String(rot || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).filter(function (l) { return !/^#/.test(l); });
    var longas = ls.filter(function (l) { return l.length > 160; }).length;
    return ls.length > 0 && (longas >= 3 || ls.length > 45);
  }
  function renderSecList() {
    var el = $('#secs'); if (!el || !S.cur) return;
    var h = '';
    S.cur.chapters.forEach(function (c, ci) {
      h += '<div class="card"><b>Capítulo ' + (ci + 1) + ' — ' + esc(c.title) + '</b>';
      c.sections.forEach(function (s, si) {
        h += '<div style="margin-top:8px"><div>' + (ci + 1) + '.' + (si + 1) + ' ' + esc(s.title || s.ponto) + '</div>' + pills(s) +
          '<div><button class="b ghost" data-g="' + ci + ',' + si + '">' + (s.raw ? 'Refazer' : 'Gerar') + '</button></div></div>';
      });
      h += '</div>';
    });
    var n = 0; S.cur.chapters.forEach(function (c) { n += c.sections.length; });
    var aviso = roteiroPareceTexto(S.cur.roteiro) ? '<div class="card" style="border-color:var(--red)"><b style="color:var(--red)">O roteiro parece ser um texto corrido (' + n + ' seções).</b>' +
      '<div class="mut">O roteiro deve ser uma lista curta: "# Capítulo" e, abaixo, um assunto por linha. Um texto seu deve entrar como anexo.</div>' +
      '<button class="b red" id="b-conv">Transformar em anexo e sugerir roteiro</button></div>' : '';
    var html = aviso + (h ? '<div class="mut">' + S.cur.chapters.length + ' capítulo(s), ' + n + ' seção(ões) · cerca de ' + Math.round(n * 900 / 1000) + ' mil palavras</div>' + h : '<p class="mut">Escreva o roteiro acima ou use "Sugerir roteiro com IA".</p>');
    // Só redesenha se mudou: redesenhar no meio de um clique faria o clique se perder
    if (el.__html === html) return;
    el.__html = html; el.innerHTML = html;
    if ($('#b-conv')) $('#b-conv').onclick = async function () {
      syncForm();
      S.cur.attachments.push({ name: 'Texto colado no roteiro.txt', text: S.cur.roteiro });
      S.cur.roteiro = ''; S.cur.chapters = []; $('#f-rot').value = '';
      renderAtt(); renderSecList(); await persist();
      toast('Texto movido para os anexos'); $('#b-rot').click();
    };
    el.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { var a = b.dataset.g.split(','); genOne(+a[0], +a[1]); }; });
  }

  function renderTexto() {
    var p = S.cur;
    if (!p) { $('#v-texto').innerHTML = '<p class="mut">Abra uma obra primeiro.</p>'; return; }
    var h = '<h2>' + esc(p.title) + '</h2><div class="card"><b>Exportar</b><div>' +
      '<button class="b" id="x-docx">Word (.docx)</button><button class="b" id="x-pdf">PDF</button>' +
      '<button class="b ghost" id="x-bk">Backup (.json)</button></div>' +
      '<label><input type="checkbox" id="x-refs" style="width:auto" ' + (S.set.includeRefs ? 'checked' : '') + '> Incluir “Referências e notas de verificação” ao final</label>' +
      '<div id="drive" ' + (isNative() ? 'hidden' : '') + '><div class="mut">Google Drive (opcional, exige login):</div>' +
      '<button class="b ghost" id="d-docx">Enviar .docx</button><button class="b ghost" id="d-pdf">Enviar PDF</button><button class="b ghost" id="d-up">Backup → Drive</button><button class="b ghost" id="d-dn">Restaurar do Drive</button></div></div>';
    p.chapters.forEach(function (c, ci) {
      h += '<h3>Capítulo ' + (ci + 1) + ' — ' + esc(c.title) + '</h3>';
      c.sections.forEach(function (s, si) {
        if (!s.raw) return;
        h += '<details class="card"><summary>' + (ci + 1) + '.' + (si + 1) + ' ' + esc(s.title || s.ponto) + '</summary>' + pills(s) +
          '<textarea class="big" data-e="' + ci + ',' + si + '">' + esc(Core.strip(s.raw)) + '</textarea>' +
          (s.refs && s.refs.length ? '<div class="mut"><b>Fontes citadas (verifique antes de publicar):</b><br>' + s.refs.map(function (r) { return '• ' + esc(r.fonte) + ' — ' + esc(r.confianca || '?') + (r.citacao_direta ? ' (direta)' : '') + (r.obs ? ': ' + esc(r.obs) : ''); }).join('<br>') + '</div>' : '') + '</details>';
      });
    });
    $('#v-texto').innerHTML = h;
    $('#x-docx').onclick = function () { doExport('docx'); };
    $('#x-pdf').onclick = function () { doExport('pdf'); };
    $('#x-bk').onclick = backupLocal;
    $('#x-refs').onchange = function (e) { S.set.includeRefs = e.target.checked; saveSet(); };
    if (!isNative()) {
      $('#d-docx').onclick = function () { driveSend('docx'); }; $('#d-pdf').onclick = function () { driveSend('pdf'); };
      $('#d-up').onclick = function () { driveBackup(true); }; $('#d-dn').onclick = function () { driveBackup(false); };
    }
    $('#v-texto').querySelectorAll('[data-e]').forEach(function (t) {
      t.onchange = function () { var a = t.dataset.e.split(','), s = S.cur.chapters[+a[0]].sections[+a[1]]; s.raw = t.value; s.metrics = null; s.problems = []; s.edited = true; persist(); toast('Edição salva'); };
    });
  }

  function renderConfig() {
    var s = S.set;
    var h = '<h2>Configurações</h2>' +
      '<div class="card"><b>Motor de IA</b>' +
      '<label>Chave de API (de qualquer serviço — fica só neste aparelho)</label><input id="c-key" type="password" autocomplete="off" value="' + esc(curKey()) + '" placeholder="Cole aqui a sua chave">' +
      '<label>Serviço (reconhecido automaticamente pela chave)</label><select id="c-prov">' +
      Object.keys(PROVIDERS).map(function (id) { return '<option value="' + id + '"' + (curProv() === id ? ' selected' : '') + '>' + PROVIDERS[id].nome + '</option>'; }).join('') + '</select>' +
      '<div id="c-base-box"' + (curProv() === 'outro' ? '' : ' hidden') + '><label>Endereço base da API</label><input id="c-base" value="' + esc(s.customBase) + '" placeholder="https://servico.com/v1"></div>' +
      '<label>Modelo</label><input id="c-model" list="c-models" value="' + esc(curModel()) + '" placeholder="toque em Testar conexão para ver a lista"><datalist id="c-models"></datalist>' +
      '<div id="c-info" class="mut"></div>' +
      '<details><summary class="mut">Proxy (opcional)</summary>' +
      '<label>Endereço do seu proxy (ver README)</label><input id="c-proxy" value="' + esc(s.proxyUrl) + '" placeholder="https://seu-worker.workers.dev">' +
      '<label>Código de acesso do proxy</label><input id="c-code" type="password" value="' + esc(s.accessCode) + '"></details>' +
      '<div><button class="b" id="c-test">Testar conexão</button></div><div id="c-test-out" class="mut"></div></div>' +
      '<div class="card"><b>Metas de cada seção</b><div class="row">' +
      '<div><label>Mín. palavras</label><input id="c-min" type="number" value="' + s.min + '"></div><div><label>Máx. palavras</label><input id="c-max" type="number" value="' + s.max + '"></div>' +
      '<div><label>Citações % (mín.)</label><input id="c-cit" type="number" value="' + s.cit + '"></div><div><label>Anedotas % (mín.)</label><input id="c-ane" type="number" value="' + s.ane + '"></div>' +
      '<div><label>Citações diretas % (mín.)</label><input id="c-dir" type="number" value="' + s.dir + '"></div></div>' +
      '<div class="mut">Percentuais sobre as palavras do corpo do texto. A IA mede e refaz até 3 vezes para cumprir.</div></div>' +
      '<div class="card"><b>Seu estilo de escrita</b><label>Nome do autor</label><input id="c-author" value="' + esc(s.author) + '">' +
      '<label>Envie 2 a 3 textos seus (.pdf, .docx, .txt)</label><input type="file" id="c-samples" multiple accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown">' +
      '<div class="mut">' + s.samples.length + ' amostra(s) guardada(s)</div><button class="b ghost" id="c-ext">Extrair perfil de estilo</button><button class="b ghost" id="c-clr">Limpar amostras</button>' +
      '<label>Perfil de estilo (editável)</label><textarea id="c-style">' + esc(s.style) + '</textarea></div>' +
      '<div class="card"' + (isNative() ? ' hidden' : '') + '><b>Google (opcional)</b><label>Client ID OAuth (tipo “Aplicativo da Web”)</label><input id="c-gid" value="' + esc(s.googleClientId) + '" placeholder="xxxx.apps.googleusercontent.com"><div class="mut">Sem isso o app funciona normalmente, só não envia ao Drive.</div></div>' +
      '<button class="b red" id="c-save">Salvar configurações</button><p class="mut">Ensaios Pro ' + APP_VERSION + '</p>';
    $('#v-config').innerHTML = h;
    var info = function () {
      var id = $('#c-prov').value, P = PROVIDERS[id];
      $('#c-base-box').hidden = id !== 'outro';
      $('#c-info').innerHTML = esc(P.ajuda || '') + (P.semNavegador && !isNative() && !S.set.proxyUrl ? '<br><span style="color:var(--red)">No navegador do PC este serviço só funciona com proxy. No app do celular funciona direto.</span>' : '');
    };
    info();
    $('#c-key').oninput = function () {
      var d = detectProvider(this.value);
      if (d && d !== $('#c-prov').value) { $('#c-prov').value = d; $('#c-model').value = (S.set.models || {})[d] || PROVIDERS[d].modelo || ''; info(); toast('Chave reconhecida: ' + PROVIDERS[d].nome); }
    };
    $('#c-prov').onchange = function () { var id = this.value; $('#c-model').value = (S.set.models || {})[id] || PROVIDERS[id].modelo || ''; $('#c-models').innerHTML = ''; info(); };
    $('#c-test').onclick = async function () {
      readCfg(); var out = $('#c-test-out'), b = $('#c-test'), t0 = Date.now();
      b.disabled = true; out.style.color = ''; out.textContent = 'Testando…';
      try {
        var ms = await listModels();
        if (ms.length) {
          $('#c-models').innerHTML = ms.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
          if (!curModel()) { S.set.models[curProv()] = ms[0]; $('#c-model').value = ms[0]; saveSet(); }
        }
        var r = await callClaude({ max_tokens: 200, system: 'Responda em português, em uma frase curta.', messages: [{ role: 'user', content: 'Diga apenas: conexão funcionando.' }] });
        out.style.color = '#3a6b3a';
        out.textContent = '✓ Funcionando com ' + curModel() + ' (' + Math.round((Date.now() - t0) / 1000) + ' s). Resposta: ' + r.slice(0, 80) +
          (ms.length ? ' · ' + ms.length + ' modelos disponíveis (toque no campo Modelo para escolher), ex.: ' + ms.slice(0, 6).join(', ') : '');
      } catch (e) { out.style.color = 'var(--red)'; out.textContent = '✗ ' + e.message; }
      b.disabled = false;
    };
    $('#c-samples').onchange = async function (ev) {
      for (var i = 0; i < ev.target.files.length; i++) {
        try { var t = (await readFile(ev.target.files[i])).replace(/\s+/g, ' ').trim(); S.set.samples.push(t.slice(Math.floor(t.length * 0.1), Math.floor(t.length * 0.1) + 1800)); S.set.samples = S.set.samples.slice(-3); }
        catch (e) { toast(e.message); }
      }
      saveSet(); renderConfig(); toast('Amostras guardadas');
    };
    $('#c-clr').onclick = function () { S.set.samples = []; saveSet(); renderConfig(); };
    $('#c-ext').onclick = async function () {
      if (!S.set.samples.length) return toast('Envie ao menos um texto seu.');
      readCfg();
      try {
        toast('Analisando seu estilo…');
        var out = await callClaude({ max_tokens: 1200, system: 'Você é analista de estilo literário. Descreva, em português, o estilo do autor em até 300 palavras, de forma operacional para que outro redator o imite: extensão média dos períodos, uso de subordinação e coordenação, conectivos preferidos, pessoa gramatical, léxico (abstrato/concreto, termos recorrentes), ritmo, figuras retóricas, pontuação, modo de abrir e fechar parágrafos, tom. Termine com "Evitar:" e 5 vícios que NÃO são do autor. Sem elogios.', messages: [{ role: 'user', content: S.set.samples.map(function (x, i) { return '--- texto ' + (i + 1) + ' ---\n' + x; }).join('\n') }] });
        S.set.style = out.trim(); saveSet(); renderConfig(); toast('Perfil de estilo criado — revise e ajuste');
      } catch (e) { toast(e.message); }
    };
    $('#c-save').onclick = function () { readCfg(); toast('Configurações salvas'); };
  }
  function readCfg() {
    var g = function (id) { var e = $('#' + id); return e ? e.value : null; }, s = S.set;
    var v;
    if ((v = g('c-prov')) != null) s.provider = v;
    s.keys = s.keys || {}; s.models = s.models || {};
    if ((v = g('c-key')) != null) s.keys[s.provider] = v.trim();
    if ((v = g('c-model')) != null) { if (v.trim()) s.models[s.provider] = v.trim(); else delete s.models[s.provider]; }
    if ((v = g('c-base')) != null) s.customBase = v.trim();
    if ((v = g('c-proxy')) != null) s.proxyUrl = v.trim();
    if ((v = g('c-code')) != null) s.accessCode = v.trim();
    ['min', 'max', 'cit', 'ane', 'dir'].forEach(function (k) { var x = g('c-' + k); if (x !== null && x !== '') s[k] = +x; });
    if ((v = g('c-author')) != null) s.author = v.trim();
    if ((v = g('c-style')) != null) s.style = v;
    if ((v = g('c-gid')) != null) s.googleClientId = v.trim();
    saveSet();
  }

  /* ---------- init ---------- */
  document.querySelectorAll('nav button').forEach(function (b) { b.onclick = function () { if (S.view === 'obra') syncForm(); if (S.view === 'config') readCfg(); go(b.dataset.v); }; });
  DB.open().then(DB.all.bind(DB)).then(function (all) { S.projects = all; go('obras'); }).catch(function () { toast('Armazenamento local indisponível neste navegador.'); go('config'); });
  if (!isNative() && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    // Ao publicar uma versão nova, o app atualiza e recarrega sozinho (uma vez)
    var hadCtrl = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtrl && !reloaded) { reloaded = true; if (S.view === 'obra') syncForm(); persist(); location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { reg.update().catch(function () {}); }).catch(function () {});
  }
})();
