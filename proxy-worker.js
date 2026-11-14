// Proxy opcional (Cloudflare Workers, plano gratuito).
// - Raiz (/)      → Anthropic (Claude). Defina o segredo ANTHROPIC_API_KEY.
// - /openai       → qualquer serviço no padrão OpenAI (NVIDIA, OpenRouter, Groq...). O app envia o endereço
//                   em x-target-base e a chave em Authorization. (/nvidia continua funcionando.)
// Defina também ACCESS_CODE (o código que você digita em Config.) para ninguém mais usar o seu proxy.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-access-code,authorization,x-target-base', 'access-control-allow-methods': 'POST,OPTIONS' };
const json = (o, status) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Ensaios Pro proxy ok', { headers: CORS });
    if (env.ACCESS_CODE && req.headers.get('x-access-code') !== env.ACCESS_CODE) return json({ error: { message: 'Código de acesso inválido.' } }, 401);
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const nvidia = path.endsWith('/nvidia'), openai = path.endsWith('/openai');
    let base = nvidia ? 'https://integrate.api.nvidia.com/v1' : (req.headers.get('x-target-base') || '').replace(/\/+$/, '');
    if (openai && !/^https:\/\//.test(base)) return json({ error: { message: 'Endereço do serviço inválido.' } }, 400);
    const r = (nvidia || openai)
      ? await fetch(base + '/chat/completions', {
          method: 'POST', body: await req.text(),
          headers: { 'content-type': 'application/json', authorization: nvidia && env.NVIDIA_API_KEY ? 'Bearer ' + env.NVIDIA_API_KEY : (req.headers.get('authorization') || '') } })
      : await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', body: await req.text(),
          headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } });
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'content-type': 'application/json' } });
  }
};
