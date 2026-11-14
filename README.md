# Ensaios Pro 2.0

Gerador de ensaios e livros **no estilo do autor**. Funciona no navegador (instalável no PC e no celular) e como **APK** no Android, com o mesmo código. Não depende de Rork, Expo Go nem de login.

## Onde usar
- **Navegador (PC ou celular):** https://psitgcarvalho-byte.github.io/WRITE-PRO-MAX/
  No Chrome do PC, clique no ícone de instalar na barra de endereço para ter o app como programa.
- **APK (Android):** https://github.com/psitgcarvalho-byte/WRITE-PRO-MAX/releases/latest/download/EnsaiosPro.apk
  Abra no celular, baixe e instale; permita "instalar apps desconhecidos" quando o Android pedir.

Os dois são atualizados sozinhos a cada mudança enviada a este repositório.

## Primeiro uso
1. Crie uma chave em https://console.anthropic.com → **Billing** (compre créditos; a API é cobrada à parte da assinatura do Claude) → **API Keys** → **Create Key**.
2. No app: **Config.** → cole a chave → **Salvar configurações**. Faça isso em cada aparelho.
3. (Recomendado) Em **Config. → Seu estilo de escrita**, envie 2 a 3 textos seus e toque em **Extrair perfil de estilo**.

## O que ele faz
- **Estrutura**: capítulo › seção › subseção, numeradas (1 › 1.1 › 1.1.1). Nunca menciona "pontos".
- **Roteiro**: `# Título` abre um capítulo; cada linha abaixo vira uma seção de **700–1100 palavras** (ajustável em Config.).
- **Metas por seção** (ajustáveis): ≥10% de citações (autores, jornais, livros, contos), ≥5% de anedotas históricas em estilo de cronista antigo, ≥2% de citações diretas — tudo no corpo do texto.
- **Verificação automática**: o app mede palavras e percentuais e pede à IA para refazer (até 3 tentativas) se não cumprir. As medidas aparecem em etiquetas por seção.
- **Anexos** (.pdf, .docx, .txt, .md): o conteúdo entra na elaboração; em arquivos grandes vão os trechos mais relevantes a cada seção. PDFs escaneados (imagem) não têm texto legível.
- **Exporta** Word (.docx: Times 12, entrelinha 1,5, margens 3/2/3/2 cm) e PDF (A4, mesmo padrão), com *Referências e notas de verificação* opcionais ao final.
- **Funciona offline** depois de aberto uma vez (menos a geração, que precisa da IA).
- **Com ou sem Google**: sem login, tudo fica no aparelho. Com um Client ID Google (opcional, só no navegador), envia .docx/.pdf e backups à pasta "Ensaios Pro" do Drive.

## Limites e cuidados
- **Citações**: a IA pode errar autoria e redação exata. A lista de fontes ao final traz o grau de confiança — **confira antes de publicar**.
- **PDF**: palavras em grego ou cirílico saem transliteradas (λόγος → logos); outros símbolos raros viram "?". O **.docx mantém tudo como no original**.
- **APK**: é uma versão de teste (debug), assinada de novo a cada atualização. Antes de atualizar, faça **Backup (.json)** no app, desinstale a versão anterior e instale a nova.
- Cada aparelho guarda suas obras separadamente; use **Backup (.json)** para levar de um para outro.
- Custo: o da API, cerca de 2 a 4 chamadas por seção (por causa das correções automáticas).

## Opcionais
- **Proxy**: cole `proxy-worker.js` num Cloudflare Worker (plano gratuito), defina `ANTHROPIC_API_KEY` e `ACCESS_CODE`, e informe o endereço e o código em Config. Útil para dividir o app sem entregar a chave.
- **Google Drive**: Google Cloud Console › Credenciais › ID do cliente OAuth › *Aplicativo da Web* › origem JavaScript autorizada `https://psitgcarvalho-byte.github.io`. Cole o Client ID em Config. No APK, use o botão de exportar, que abre o menu Compartilhar (dali dá para enviar ao Drive).

## Desenvolvimento
`npm test` (núcleo) · `npm run build` (gera `www/`) · `node e2e.cjs <pasta-com-anexo.pdf-e-anexo.docx>` (teste no navegador, requer Playwright).
Bibliotecas embutidas em `lib/` (licenças em `lib/LICENSES.txt`).
