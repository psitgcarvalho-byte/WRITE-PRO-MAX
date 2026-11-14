// Proxy opcional (Cloudflare Workers, plano gratuito). Guarda a chave da Anthropic fora do app.
// Variáveis a definir no painel: ANTHROPIC_API_KEY (segredo) e ACCESS_CODE (código que você digita no app).
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-access-code', 'access-control-allow-methods': 'POST,OPTIONS' };
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Ensaios Pro proxy ok', { headers: CORS });
    if (env.ACCESS_CODE && req.headers.get('x-access-code') !== env.ACCESS_CODE)
      return new Response(JSON.stringify({ error: { message: 'Código de acesso inválido.' } }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: await req.text()
    });
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'content-type': 'application/json' } });
  }
};
