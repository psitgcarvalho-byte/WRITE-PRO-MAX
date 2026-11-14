/* Ensaios Pro — núcleo (sem dependências, roda no navegador e no Node) */
(function (root) {
  'use strict';

  var TAGRE = /\[\[\/?(?:CIT|ANE|DIR)\]\]/g;

  function strip(s) { return String(s == null ? '' : s).replace(TAGRE, ''); }

  function words(s) {
    var m = strip(s).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
    return m ? m.length : 0;
  }

  function tagWords(s, tag) {
    var re = new RegExp('\\[\\[' + tag + '\\]\\]([\\s\\S]*?)\\[\\[/' + tag + '\\]\\]', 'g');
    var n = 0, c = 0, m;
    while ((m = re.exec(s))) { n += words(m[1]); c++; }
    return { n: n, c: c };
  }

  function bodyOnly(s) {
    return String(s || '').split('\n').filter(function (l) { return !/^\s*#{1,6}\s/.test(l); }).join('\n');
  }

  // Métricas de um texto marcado com [[CIT]] [[ANE]] [[DIR]]
  function analyze(raw) {
    var body = bodyOnly(raw);
    var total = words(body);
    var cit = tagWords(body, 'CIT'), ane = tagWords(body, 'ANE'), dir = tagWords(body, 'DIR');
    var d = total || 1;
    return {
      total: total,
      cit: cit.n / d, ane: ane.n / d, dir: dir.n / d,
      citWords: cit.n, aneWords: ane.n, dirWords: dir.n,
      citCount: cit.c, aneCount: ane.c, dirCount: dir.c
    };
  }

  // t = { min, max, cit, ane, dir } (cit/ane/dir em fração, ex.: 0.10)
  function check(m, t, raw) {
    var p = [];
    var pct = function (x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; };
    if (m.total < t.min) p.push('O texto tem ' + m.total + ' palavras; o mínimo é ' + t.min + '. Desenvolva mais.');
    if (m.total > t.max) p.push('O texto tem ' + m.total + ' palavras; o máximo é ' + t.max + '. Condense.');
    if (m.cit < t.cit) p.push('Citações a autores/jornais/livros/contos somam ' + pct(m.cit) + '; o mínimo é ' + pct(t.cit) + '. Inclua mais passagens marcadas com [[CIT]].');
    if (m.ane < t.ane) p.push('Anedotas históricas somam ' + pct(m.ane) + '; o mínimo é ' + pct(t.ane) + '. Inclua mais passagens marcadas com [[ANE]].');
    if (m.dir < t.dir) p.push('Citações diretas somam ' + pct(m.dir) + '; o mínimo é ' + pct(t.dir) + '. Inclua trechos literais curtos entre aspas, marcados com [[DIR]].');
    if (/\bpontos?\s+(\d+|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez)\b/i.test(strip(raw || ''))) {
      p.push('O texto menciona "ponto N". Remova toda menção a pontos; use apenas a estrutura de capítulo, seção e subseção.');
    }
    return p;
  }

  function buildSystem(o) {
    var t = o.targets;
    var pc = function (x) { return Math.round(x * 100) + '%'; };
    var s = [];
    s.push('Você é o redator de ' + (o.author || 'o autor') + ', ensaísta de língua portuguesa. Escreva em português do Brasil, na voz e na sintaxe do autor (perfil e amostras abaixo), como texto autoral de livro, nunca como resposta de assistente.');
    s.push('');
    s.push('REGRAS INEGOCIÁVEIS');
    s.push('1. Extensão: entre ' + t.min + ' e ' + t.max + ' palavras de corpo de texto (títulos de subseção não contam).');
    s.push('2. Estrutura: o texto pertence a um capítulo e a uma seção. Organize-o em 2 a 4 subseções, cada uma aberta por uma linha "### Título da subseção". Não escreva o título do capítulo nem da seção no corpo. NUNCA use as palavras "ponto", "item", "tópico" ou "roteiro" para se referir à estrutura, e nunca mencione instruções, anexos como "documento enviado" ou o fato de haver pontos a desenvolver.');
    s.push('3. Citações (mínimo de ' + pc(t.cit) + ' das palavras): autores, matérias de jornal, livros e contos literários, integrados ao corpo do texto como fenômeno retórico (argumento de autoridade, contraste, exemplo, ironia). Nunca como epígrafe nem nota de rodapé. Nomeie o autor e a obra (ou o veículo e a época) no próprio texto. Envolva toda a passagem apoiada em fonte (a frase que introduz a fonte e o que ela diz) com [[CIT]]...[[/CIT]].');
    s.push('4. Citações diretas (mínimo de ' + pc(t.dir) + ' das palavras): trechos literais entre aspas “ ”, curtos (até 40 palavras), envolvidos com [[DIR]]...[[/DIR]] dentro das aspas. Priorize obras em domínio público e passagens célebres que você conhece com segurança. JAMAIS invente aspas: se não tiver certeza do texto literal, use outra passagem de que tenha certeza e registre a confiança em REFS.');
    s.push('5. Anedotas históricas (mínimo de ' + pc(t.ane) + ' das palavras): narrativas breves de personagem lendário ou famoso do passado antigo, contadas no estilo dos cronistas antigos ("Conta-se que…", "Refere Plutarco…", "Narra a tradição…"), integradas ao argumento como exemplum retórico, dentro do corpo do texto. Envolva com [[ANE]]...[[/ANE]]. Se a autenticidade for duvidosa, diga no próprio texto ("conta a tradição") e registre em REFS.');
    s.push('6. Tags: [[CIT]], [[ANE]] e [[DIR]] nunca ficam vazias; só [[DIR]] pode ficar dentro de [[CIT]].');
    s.push('7. Parágrafos densos e encadeados; sem listas, sem bullets, sem negrito, sem emojis. Sem introdução do tipo "Neste texto…". Sem conclusão moralizante genérica.');
    s.push('');
    s.push('FORMATO DE SAÍDA (exatamente, sem nada fora das tags):');
    s.push('<TITULO>título curto e autoral da seção</TITULO>');
    s.push('<TEXTO>');
    s.push('### Título da primeira subseção');
    s.push('parágrafos…');
    s.push('</TEXTO>');
    s.push('<REFS>[{"fonte":"Autor, Obra (ou Veículo, data)","tipo":"livro|jornal|conto|artigo|anedota","citacao_direta":true,"confianca":"alta|média|baixa","obs":"o que verificar"}]</REFS>');
    if (o.style) { s.push(''); s.push('PERFIL DE ESTILO DO AUTOR (siga fielmente):'); s.push(o.style); }
    if (o.samples && o.samples.length) {
      s.push('');
      s.push('AMOSTRAS DO AUTOR (imite sintaxe, ritmo, léxico e modo de argumentar; não copie o conteúdo):');
      o.samples.forEach(function (x, i) { s.push('--- amostra ' + (i + 1) + ' ---'); s.push(x); });
    }
    return s.join('\n');
  }

  function buildUser(o) {
    var s = [];
    s.push('Obra: ' + (o.tema || o.title || ''));
    s.push('Capítulo ' + o.ci + ': ' + (o.chapter || ''));
    s.push('Seção ' + o.ci + '.' + o.si + ' — assunto a desenvolver: ' + o.ponto);
    if (o.prevTitles && o.prevTitles.length) s.push('\nSeções já escritas (não repita o conteúdo): ' + o.prevTitles.join(' | '));
    if (o.prevTail) s.push('\nFinal da seção anterior (para dar continuidade natural, sem repetir):\n' + o.prevTail);
    if (o.attachment) {
      s.push('\nMATERIAL ANEXADO PELO AUTOR (fonte obrigatória). Incorpore substancialmente as ideias, dados e argumentos deste material ao texto, não apenas o assunto acima. Quando usar algo dele, atribua ao material pelo nome do arquivo ou autor.');
      s.push('<anexo>\n' + o.attachment + '\n</anexo>');
    }
    s.push('\nEscreva agora a seção, no formato exigido.');
    return s.join('\n');
  }

  function buildFix(m, problems) {
    return 'Correção necessária. Medição do seu texto: ' + m.total + ' palavras; citações ' + (m.cit * 100).toFixed(1) + '%; anedotas ' + (m.ane * 100).toFixed(1) + '%; citações diretas ' + (m.dir * 100).toFixed(1) + '%.\n- ' +
      problems.join('\n- ') + '\nReescreva a seção COMPLETA já corrigida, no mesmo formato (<TITULO>, <TEXTO>, <REFS>), mantendo estilo e conteúdo.';
  }

  function parseResponse(out) {
    out = String(out || '');
    var g = function (t) {
      var m = out.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>'));
      return m ? m[1].trim() : null;
    };
    var titulo = g('TITULO');
    var texto = g('TEXTO');
    if (texto == null) {
      var open = out.match(/<TEXTO>([\s\S]*?)(?:<REFS>|$)/);
      texto = open ? open[1].trim() : out.replace(/<\/?(TITULO|TEXTO|REFS)>/g, '').trim();
    }
    var refs = [];
    var rr = g('REFS');
    if (rr) {
      try {
        refs = JSON.parse(rr.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
        if (!Array.isArray(refs)) refs = [];
      } catch (e) { refs = []; }
    }
    return { titulo: titulo || '', texto: texto, refs: refs };
  }

  // Roteiro: "# Capítulo" abre capítulo; demais linhas não vazias são assuntos (seções)
  function parseRoteiro(txt) {
    var chapters = [], cur = null;
    String(txt || '').split('\n').forEach(function (l) {
      l = l.trim();
      if (!l) return;
      var h = l.match(/^#{1,2}\s*(?:cap[ií]tulo\s*\d*\s*[:.\-—]?\s*)?(.*)$/i);
      if (h) { cur = { title: h[1].trim() || 'Sem título', sections: [] }; chapters.push(cur); return; }
      if (!cur) { cur = { title: 'Capítulo 1', sections: [] }; chapters.push(cur); }
      cur.sections.push({ ponto: l.replace(/^[-*\d.)\s]+/, '').trim(), title: '', raw: '', refs: [], metrics: null, problems: [] });
    });
    return chapters;
  }

  // Seleciona trechos do anexo mais relevantes para o assunto
  function rankChunks(text, query, maxChars) {
    text = String(text || '');
    if (text.length <= maxChars) return text;
    var chunks = [], size = 1500;
    for (var i = 0; i < text.length; i += size) chunks.push({ i: i, t: text.slice(i, i + size) });
    var q = {};
    (String(query).toLowerCase().match(/[\p{L}]{4,}/gu) || []).forEach(function (w) { q[w] = 1; });
    chunks.forEach(function (c) {
      var ws = c.t.toLowerCase().match(/[\p{L}]{4,}/gu) || [], sc = 0;
      ws.forEach(function (w) { if (q[w]) sc++; });
      c.s = sc / Math.sqrt(ws.length + 1);
    });
    var pick = chunks.slice().sort(function (a, b) { return b.s - a.s; }), used = 0, sel = [];
    pick.forEach(function (c) { if (used + c.t.length <= maxChars) { sel.push(c); used += c.t.length; } });
    sel.sort(function (a, b) { return a.i - b.i; });
    return sel.map(function (c) { return c.t; }).join('\n[…]\n');
  }

  // Blocos numerados, usados por DOCX, PDF e pré-visualização
  function toBlocks(p, opt) {
    opt = opt || {};
    var B = [];
    B.push({ t: 'title', x: p.title || 'Sem título' });
    if (p.subtitle) B.push({ t: 'subtitle', x: p.subtitle });
    if (p.author) B.push({ t: 'author', x: p.author });
    var refs = [];
    (p.chapters || []).forEach(function (c, ci) {
      B.push({ t: 'h1', x: 'Capítulo ' + (ci + 1) + ' — ' + c.title });
      c.sections.forEach(function (s, si) {
        if (!s.raw) return;
        B.push({ t: 'h2', x: (ci + 1) + '.' + (si + 1) + ' ' + (s.title || s.ponto) });
        var k = 0, buf = [];
        var flush = function () { if (buf.length) { B.push({ t: 'p', x: buf.join(' ') }); buf = []; } };
        strip(s.raw).split('\n').forEach(function (l) {
          var h = l.match(/^\s*#{1,6}\s+(.*)$/);
          if (h) { flush(); B.push({ t: 'h3', x: (ci + 1) + '.' + (si + 1) + '.' + (++k) + ' ' + h[1].trim() }); }
          else if (!l.trim()) flush();
          else buf.push(l.trim());
        });
        flush();
        (s.refs || []).forEach(function (r) { refs.push(r); });
      });
    });
    if (opt.refs && refs.length) {
      B.push({ t: 'h1', x: 'Referências e notas de verificação' });
      refs.forEach(function (r) {
        B.push({ t: 'ref', x: (r.fonte || '?') + ' — ' + (r.tipo || '') + (r.citacao_direta ? ' (citação direta)' : '') + ' — confiança: ' + (r.confianca || 'não informada') + (r.obs ? '. ' + r.obs : '') });
      });
    }
    return B;
  }

  var api = { strip: strip, words: words, analyze: analyze, check: check, buildSystem: buildSystem, buildUser: buildUser, buildFix: buildFix, parseResponse: parseResponse, parseRoteiro: parseRoteiro, rankChunks: rankChunks, toBlocks: toBlocks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
